import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Exercises scripts/publish-release.sh end to end with `gh` and `npm` stubbed, so the
// prerequisite automation, the digest provenance split and the cwd-independence claim
// (LCLI-489) are covered by a test rather than by a comment. Nothing here touches the
// network or the registry: --dry-run stops before both mutating calls, and the stubs
// answer every read the script makes.

const SCRIPT = resolve(import.meta.dir, "..", "scripts", "publish-release.sh");
const VERSION = "9.9.9";
const RUN_ID = "4242424242";
const ATTEMPT = "3";
const COMMIT = "ea3813ae39fd9c9bba1e5e24e32a4c73e1611480";
const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"];

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * Builds a workspace holding: a source of truth for the seven tarballs, per-platform
 * qualification reports carrying each tarball's real digest, and stub gh/npm/security
 * executables. `corruptPlatform` lets a test flip one recorded digest to prove the
 * independent check actually bites.
 */
function makeWorkspace(options: { corruptPlatform?: string } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "lore-publish-test-"));
  const source = resolve(root, "npm-packages");
  const reports = resolve(root, "reports");
  const bin = resolve(root, "bin");
  for (const dir of [source, reports, bin]) mkdirSync(dir, { recursive: true });

  const digests = new Map<string, string>();
  for (const name of PLATFORMS) {
    const file = `opum-ai-lore-${name}-${VERSION}.tgz`;
    const bytes = Buffer.from(`fake platform tarball for ${name} @ ${VERSION}\n`);
    writeFileSync(resolve(source, file), bytes);
    digests.set(name, sha256(bytes));
  }
  const rootTarball = `opum-ai-lore-${VERSION}.tgz`;
  writeFileSync(resolve(source, rootTarball), Buffer.from(`fake root launcher @ ${VERSION}\n`));

  // One artifact directory per platform, named exactly as release.yml uploads it —
  // run id AND run attempt embedded (LCLI-487).
  for (const name of PLATFORMS) {
    const dir = resolve(reports, `ladybug-package-qualification-${name}-${RUN_ID}-${ATTEMPT}`);
    mkdirSync(dir, { recursive: true });
    const recorded = options.corruptPlatform === name ? "0".repeat(64) : digests.get(name);
    writeFileSync(
      resolve(dir, `ladybug-package-qualification-${name}.json`),
      JSON.stringify({
        schema: "lore.ladybug-package-qualification/3",
        mode: "qualification",
        platform: { distribution: name },
        repository: { commit: COMMIT },
        package: { platform: `@opum-ai/lore-${name}`, platformTarballSha256: `sha256:${recorded}` },
      }),
    );
  }

  // `gh` stub: resolves the run attempt, serves npm-packages, and serves the
  // attempt-suffixed qualification artifacts by pattern.
  writeFileSync(
    resolve(bin, "gh"),
    `#!/usr/bin/env bash
set -uo pipefail
if [ "\${1:-}" = "api" ]; then echo "${ATTEMPT}"; exit 0; fi
if [ "\${1:-}" = "run" ] && [ "\${2:-}" = "download" ]; then
  dest=""; name=""; pattern=""
  shift 2
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -D) dest="$2"; shift 2 ;;
      -n) name="$2"; shift 2 ;;
      -p) pattern="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  mkdir -p "$dest"
  if [ -n "$name" ]; then cp "${source}"/*.tgz "$dest"/; exit 0; fi
  if [ -n "$pattern" ]; then cp -R "${reports}"/. "$dest"/; exit 0; fi
  exit 1
fi
exit 1
`,
  );

  // `npm` stub: registry reachable, nothing published yet. `npm view` exiting non-zero is
  // how the script decides a version is absent, which also keeps resumability in play.
  writeFileSync(
    resolve(bin, "npm"),
    `#!/usr/bin/env bash
case "\${1:-}" in
  ping) exit 0 ;;
  view) exit 1 ;;
  publish) echo "STUB PUBLISH $2"; exit 0 ;;
  *) exit 0 ;;
esac
`,
  );

  // No Keychain entry — the measured 2026-09-14 state, which sends the script down the
  // ~/.npmrc fallback and must not be fatal.
  writeFileSync(resolve(bin, "security"), "#!/usr/bin/env bash\nexit 44\n");

  for (const stub of ["gh", "npm", "security"]) chmodSync(resolve(bin, stub), 0o755);
  return {
    root,
    bin,
    artifacts: resolve(root, "artifacts"),
    digests,
    rootTarball,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function runScript(ws: ReturnType<typeof makeWorkspace>, cwd: string, artifacts: string) {
  const result = Bun.spawnSync({
    cmd: ["bash", SCRIPT, VERSION, RUN_ID, "--dry-run"],
    cwd,
    env: { ...process.env, PATH: `${ws.bin}:${process.env.PATH}`, ARTIFACTS: artifacts, NPM_TOKEN: "" },
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString() + result.stderr.toString(),
  };
}

describe("scripts/publish-release.sh", () => {
  test("downloads the artifact itself when the directory is absent, resolving the run attempt", () => {
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("artifact directory is empty");
      expect(r.out).toContain("downloaded 7 tarballs");
      // The attempt came from `gh api`, not from a hardcoded 1 (LCLI-487).
      expect(r.out).toContain(`attempt ${ATTEMPT}`);
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("verifies six platform tarballs against the CI-recorded digest and seals the seventh locally", () => {
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("6/6 platform tarballs match the digests CI recorded");
      expect(r.out).toContain(COMMIT);
      // The claim must stay six-of-seven: the root launcher has no CI-recorded digest.
      expect(r.out).toContain("SELF-SEAL ONLY");
      expect(r.out).toContain("6 independently verified, 1 locally sealed");
      expect(r.out).not.toContain("all 7 artifacts verified");
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("refuses to publish when a platform tarball does not match its recorded digest", () => {
    const ws = makeWorkspace({ corruptPlatform: "linux-x64" });
    try {
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("DIGEST MISMATCH");
      expect(r.out).toContain("@opum-ai/lore-linux-x64");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("re-downloads over an incomplete directory instead of publishing a partial family", () => {
    const ws = makeWorkspace();
    try {
      mkdirSync(ws.artifacts, { recursive: true });
      writeFileSync(resolve(ws.artifacts, `opum-ai-lore-linux-x64-${VERSION}.tgz`), "stale");
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("INCOMPLETE: 1 of 7");
      expect(r.out).toContain("6/6 platform tarballs match");
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("behaves identically from any working directory, including from inside the artifacts directory", () => {
    // The 0.6.2 defect: a handed-over `cd` left the shell inside the artifacts directory and
    // a relative glob resolved inside itself, reporting 0 tarballs. Same absolute ARTIFACTS,
    // three different cwds, byte-identical output apart from paths that legitimately vary.
    const ws = makeWorkspace();
    try {
      const fromRoot = runScript(ws, ws.root, ws.artifacts);
      expect(fromRoot.code).toBe(0);

      const fromRepo = runScript(ws, resolve(import.meta.dir, ".."), ws.artifacts);
      const fromInside = runScript(ws, ws.artifacts, ws.artifacts);

      expect(fromRepo.code).toBe(0);
      expect(fromInside.code).toBe(0);
      expect(fromInside.out).toContain("artifacts already present: 7 tarballs");
      expect(fromRepo.out).toBe(fromInside.out);
    } finally {
      ws.cleanup();
    }
  });

  test("a relative ARTIFACTS is resolved against the caller's cwd, not silently re-rooted", () => {
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, "artifacts");
      expect(r.code).toBe(0);
      // Resolved to an absolute path under the cwd it was invoked from.
      expect(r.out).toContain(ws.artifacts);
      expect(readFileSync(resolve(ws.artifacts, "SHA256SUMS.txt"), "utf8")).toContain(ws.rootTarball);
    } finally {
      ws.cleanup();
    }
  });

  test("the DEFAULT artifacts path survives being the cwd — the exact 0.6.2 reproduction", () => {
    // No ARTIFACTS override, so the script uses its own default (release-<version> beside
    // itself) and the operator's shell sits inside that very directory. Before LCLI-489 the
    // default was relative to `dirname $0`, so the glob resolved INSIDE ITSELF and reported
    // zero tarballs — indistinguishable from a failed download, and it cost a round trip.
    const ws = makeWorkspace();
    try {
      const scriptDir = resolve(ws.root, "scripts");
      mkdirSync(scriptDir, { recursive: true });
      const copied = resolve(scriptDir, "publish-release.sh");
      writeFileSync(copied, readFileSync(SCRIPT));
      chmodSync(copied, 0o755);

      const defaultArtifacts = resolve(scriptDir, `release-${VERSION}`);
      mkdirSync(defaultArtifacts, { recursive: true });

      const run = (cwd: string, relativeInvocation: string) =>
        Bun.spawnSync({
          cmd: ["bash", relativeInvocation, VERSION, RUN_ID, "--dry-run"],
          cwd,
          env: { ...process.env, PATH: `${ws.bin}:${process.env.PATH}`, ARTIFACTS: "", NPM_TOKEN: "" },
        });

      // First from outside, populating the default directory.
      const outside = run(ws.root, "scripts/publish-release.sh");
      const outsideOut = outside.stdout.toString() + outside.stderr.toString();
      expect(outsideOut).toContain("downloaded 7 tarballs");
      expect(outside.exitCode).toBe(0);

      // Then from INSIDE it — the shape that broke.
      const inside = run(defaultArtifacts, "../publish-release.sh");
      const insideOut = inside.stdout.toString() + inside.stderr.toString();
      expect(insideOut).toContain("artifacts already present: 7 tarballs");
      expect(insideOut).not.toContain("is empty");
      expect(insideOut).not.toContain("INCOMPLETE");
      expect(inside.exitCode).toBe(0);

      // The two runs differ only where they legitimately should: the first downloads and
      // seals, the second finds both already done. Everything that constitutes the actual
      // verification must be identical, and must name the same absolute directory.
      const substantive = (out: string) =>
        out
          .split("\n")
          .filter((line) =>
            /verified @opum-ai|6\/6 platform tarballs|independently verified, 1 locally sealed|root launcher digest/.test(
              line,
            ),
          )
          .join("\n");
      expect(substantive(insideOut)).toBe(substantive(outsideOut));
      expect(substantive(insideOut)).toContain("6/6 platform tarballs match");
      expect(insideOut).toContain(defaultArtifacts);
    } finally {
      ws.cleanup();
    }
  });

  test("reports the shape of a credential and refuses one that is not an npm token", () => {
    const ws = makeWorkspace();
    try {
      const result = Bun.spawnSync({
        cmd: ["bash", SCRIPT, VERSION, RUN_ID, "--dry-run"],
        cwd: ws.root,
        env: {
          ...process.env,
          PATH: `${ws.bin}:${process.env.PATH}`,
          ARTIFACTS: ws.artifacts,
          NPM_TOKEN: "not-an-npm-token-24ch",
        },
      });
      const out = result.stdout.toString() + result.stderr.toString();
      expect(out).toContain("prefix=OTHER");
      expect(out).toContain("NOT shaped like an npm token");
      // The value itself must never be echoed.
      expect(out).not.toContain("not-an-npm-token-24ch");
      expect(out).not.toContain("STUB PUBLISH");
      expect(result.exitCode).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("accepts a correctly shaped token and reports length and prefix only", () => {
    const ws = makeWorkspace();
    try {
      const token = `npm_${"a".repeat(36)}`;
      const result = Bun.spawnSync({
        cmd: ["bash", SCRIPT, VERSION, RUN_ID, "--dry-run"],
        cwd: ws.root,
        env: { ...process.env, PATH: `${ws.bin}:${process.env.PATH}`, ARTIFACTS: ws.artifacts, NPM_TOKEN: token },
      });
      const out = result.stdout.toString() + result.stderr.toString();
      expect(out).toContain("length=40 prefix=npm_ internal_whitespace=no");
      expect(out).toContain("source: NPM_TOKEN");
      expect(out).not.toContain(token);
      expect(result.exitCode).toBe(0);
    } finally {
      ws.cleanup();
    }
  });
});
