import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";

// Exercises scripts/publish-release.sh end to end with `gh` and `npm` stubbed, so the
// prerequisite automation, the digest provenance split and the cwd-independence claim
// (LCLI-489) are covered by a test rather than by a comment. Nothing here touches the
// network or the registry: --dry-run stops before both mutating calls, and the stubs
// answer every read the script makes.

const SCRIPT = resolve(import.meta.dir, "..", "scripts", "publish-release.sh");

// `lint · typecheck · test (windows-latest)` is a REQUIRED check on this repo, and this suite
// drives a macOS release script: it shells out to `security` (Keychain) and `shasum`, neither
// of which Git Bash provides. The script is only ever run from the operator's Mac, so the
// honest thing is to skip rather than stub the platform away and claim Windows coverage.
// The PATH join below still uses the platform delimiter — joining with ":" on Windows
// silently destroys the inherited PATH, which is how this first went red.
const describeOnPosix = process.platform === "win32" ? describe.skip : describe;
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
function makeWorkspace(
  options: { corruptPlatform?: string; legacyAttemptNames?: boolean; staleRootReadme?: boolean } = {},
) {
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
  // THE ROOT LAUNCHER IS A REAL TARBALL, not a text file standing in for one, because since
  // LCLI-510 the script reads package/README.md back out of it and refuses to publish when the
  // packed README disagrees with the packed package.json. A stub whose bytes are not a gzip
  // stream makes that gate fail as "could not read" on every test, which is indistinguishable
  // from the gate working and is how a fixture quietly becomes the thing under test.
  //
  // Its README is produced by the REAL generator (`--write`), never restated here: a fixture
  // carrying its own copy of the generated text passes happily while the two drift apart, which
  // is the same defect shape LCLI-510 itself is about.
  const rootTarball = `opum-ai-lore-${VERSION}.tgz`;
  const rootStage = resolve(root, "root-stage");
  const rootPkg = resolve(rootStage, "package");
  mkdirSync(rootPkg, { recursive: true });
  // `staleRootReadme` reproduces LCLI-510 exactly: the README is generated against the PREVIOUS
  // version and package.json is then bumped, which is what post-tag bookkeeping produces.
  const manifestFor = (version: string) =>
    JSON.stringify(
      {
        name: "@opum-ai/lore",
        version,
        optionalDependencies: Object.fromEntries(PLATFORMS.map((name) => [`@opum-ai/lore-${name}`, version])),
      },
      null,
      2,
    );
  writeFileSync(resolve(rootPkg, "package.json"), manifestFor(options.staleRootReadme ? "9.9.8" : VERSION));
  writeFileSync(
    resolve(rootPkg, "README.md"),
    [
      "# lore",
      "",
      // Markers sit AFTER text on their line, as the real README requires: a line whose content
      // begins with `<!--` starts a CommonMark HTML block and renders the rest of the line raw.
      "- Published on npm as<!--lore-version:published-bullet:begin--><!--lore-version:published-bullet:end-->",
      "",
      "> **Status:<!--lore-version:status:begin--><!--lore-version:status:end-->",
      "",
    ].join("\n"),
  );
  execFileSync("node", [
    resolve(import.meta.dir, "..", "scripts", "shipped-readme-version.mjs"),
    "--write",
    "--dir",
    rootPkg,
  ]);
  if (options.staleRootReadme) writeFileSync(resolve(rootPkg, "package.json"), manifestFor(VERSION));
  // Bare filename + cwd, not an absolute path: GNU tar reads a Windows drive letter as a remote
  // host spec. This suite is POSIX-only today, but the pattern should not be copied wrong.
  execFileSync("tar", ["-czf", rootTarball, "package"], { cwd: rootStage });
  writeFileSync(resolve(source, rootTarball), readFileSync(resolve(rootStage, rootTarball)));

  // One artifact directory per platform, named exactly as release.yml uploads it. Since
  // LCLI-487 that is run id ONLY — the attempt suffix is gone, because a name carrying the
  // attempt cannot be found by a consumer running on a later attempt. `legacyAttemptNames`
  // reproduces the pre-LCLI-487 shape, which still exists on runs qualified before the change
  // and still inside their 90-day retention.
  for (const name of PLATFORMS) {
    const suffix = options.legacyAttemptNames ? `${RUN_ID}-${ATTEMPT}` : `${RUN_ID}`;
    const dir = resolve(reports, `ladybug-package-qualification-${name}-${suffix}`);
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

  // The qualification receipt (LCLI-578) the gh stub serves for receipts/lore/<version>.json.
  // The DEFAULT matches these exact bytes, so every test not about the receipt still passes the
  // gate; a test about it rewrites or deletes this file. Deleting it is "no receipt": the stub
  // answers as gh does for a missing file, a 404 on stderr and a non-zero exit.
  const tarballs: Record<string, string> = {
    [rootTarball]: sha256(readFileSync(resolve(source, rootTarball))),
  };
  for (const name of PLATFORMS) tarballs[`opum-ai-lore-${name}-${VERSION}.tgz`] = digests.get(name) as string;
  const receiptFile = resolve(root, "receipt.json");
  const baseReceipt = (): Record<string, unknown> => ({
    schemaVersion: 1,
    kind: "opum.qualification-receipt.v1",
    product: "lore",
    version: VERSION,
    commit: COMMIT,
    releaseRunId: Number(RUN_ID),
    runAttempt: 1,
    tarballs: { ...tarballs },
    verdict: "QUALIFIED",
    counts: { pass: 461, fail: 0, blocked: 2 },
    blocked: [],
    harness: { commit: "f".repeat(40), commitMeaning: "landed the baseline, not the run", baseline: "baselines/x" },
    qualifiedAt: "2026-09-25T03:11:41.334Z",
  });
  const writeReceipt = (mutate: (r: Record<string, unknown>) => void = () => {}) => {
    const r = baseReceipt();
    mutate(r);
    writeFileSync(receiptFile, JSON.stringify(r, null, 2));
  };
  writeReceipt();

  // `gh` stub: resolves the run attempt, serves the receipt, serves npm-packages, and serves the
  // attempt-suffixed qualification artifacts by pattern. Every report download is counted, so the
  // LCLI-572 retry is asserted as exactly two attempts rather than inferred from the output.
  const patternAttempts = resolve(root, "pattern-attempts");
  writeFileSync(
    resolve(bin, "gh"),
    `#!/usr/bin/env bash
set -uo pipefail
if [ "\${1:-}" = "api" ]; then
  [ -n "\${GH_FAIL_API:-}" ] && exit 1
  case "$*" in
    *contents/receipts/*)
      # PINNED, not pattern-matched: the receipt is served ONLY for the exact request the script
      # must make -- github.com host (so GH_HOST cannot redirect it), the raw media type, and the
      # exact repository, path and ref=main. Anything else answers as gh does for a missing file.
      # A stub that accepted any ref left a ref=dev mutation green.
      shift
      host=""; accept=""; path=""
      while [ "$#" -gt 0 ]; do
        case "$1" in
          --hostname) host="$2"; shift 2 ;;
          -H) accept="$2"; shift 2 ;;
          *) path="$1"; shift ;;
        esac
      done
      if [ "$host" != "github.com" ] || [ "$accept" != "Accept: application/vnd.github.raw+json" ] \
         || [ "$path" != "repos/opum-ai/opum-cli-e2e/contents/receipts/lore/${VERSION}.json?ref=main" ] \
         || [ ! -f "${receiptFile}" ]; then
        echo "gh: Not Found (HTTP 404)" >&2; exit 1
      fi
      cat "${receiptFile}"; exit 0 ;;
  esac
  echo "${ATTEMPT}"; exit 0
fi
[ -n "\${GH_FAIL_ALL:-}" ] && exit 1
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
  if [ -n "$pattern" ]; then
    n=$(( $(cat "${patternAttempts}" 2>/dev/null || echo 0) + 1 )); echo "$n" > "${patternAttempts}"
    if [ -n "\${GH_FAIL_PATTERN_ONCE:-}" ] && [ "$n" -eq 1 ]; then
      # A FAILED ATTEMPT THAT STILL LEFT FILES BEHIND: a stale report with a wrong digest, under a
      # differently named artifact directory so it is found as a SECOND match. Only the script
      # emptying the directory between attempts keeps it out of attempt 2's result.
      stale="$dest/ladybug-package-qualification-linux-x64-${RUN_ID}-partial"
      mkdir -p "$stale"
      printf '%s' '{"repository":{"commit":"${COMMIT}"},"package":{"platformTarballSha256":"sha256:${"0".repeat(64)}"}}' \
        > "$stale/ladybug-package-qualification-linux-x64.json"
    fi
    if [ -n "\${GH_FAIL_PATTERN:-}" ] || { [ -n "\${GH_FAIL_PATTERN_ONCE:-}" ] && [ "$n" -eq 1 ]; }; then
      echo "stub gh: error downloading ladybug-package-qualification artifacts: HTTP 502 Bad Gateway (attempt $n)" >&2
      exit 1
    fi
    # HONOUR the pattern rather than copying everything: a stub that ignores -p makes a wrong
    # or attempt-less pattern invisible to the suite, which is most of what these tests exist
    # to catch.
    matched=0
    for d in "${reports}"/*; do
      case "$(basename "$d")" in $pattern) cp -R "$d" "$dest"/; matched=1 ;; esac
    done
    [ "$matched" = 1 ] || exit 1
    exit 0
  fi
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
    receiptFile,
    writeReceipt,
    patternAttempts: () => Number(readFileSync(patternAttempts, "utf8").trim()),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function runScript(
  ws: ReturnType<typeof makeWorkspace>,
  cwd: string,
  artifacts: string,
  extraEnv: Record<string, string> = {},
  flags: string[] = ["--dry-run"],
) {
  const result = Bun.spawnSync({
    cmd: ["bash", SCRIPT, VERSION, RUN_ID, ...flags],
    cwd,
    env: {
      ...process.env,
      PATH: `${ws.bin}${delimiter}${process.env.PATH}`,
      ARTIFACTS: artifacts,
      NPM_TOKEN: "",
      ...extraEnv,
    },
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString() + result.stderr.toString(),
    stderr: result.stderr.toString(),
  };
}

describeOnPosix("scripts/publish-release.sh", () => {
  test("downloads the artifact itself when the directory is absent", () => {
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("artifact directory is empty");
      expect(r.out).toContain("downloaded 7 tarballs");
      // Nothing resolves a run attempt any more: release.yml names artifacts by run id alone
      // and sets overwrite:true, so one run is one consistent set (LCLI-487). Asserted on the
      // removed MECHANISM rather than on the word "attempt", which is ordinary English the
      // script's own messages legitimately use.
      expect(r.out).not.toContain("run attempt pinned");
      expect(r.out).not.toContain("could not resolve the attempt number");
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
      // Assert the shape of the claim, not the absence of one historical wording: the old
      // `not.toContain("all 7 artifacts verified")` passed for any other over-claim.
      expect(r.out).not.toMatch(/7 (independently )?verified/);
      expect(r.out).not.toMatch(/all seven .* verified/i);
      expect(r.out).toMatch(/6 independently verified, 1 locally sealed/);
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
      // The shipped-README gate (LCLI-510) is a sibling the script resolves relative to its own
      // location, so a copy of publish-release.sh WITHOUT it is not a deployment that exists in
      // the repository. Copy both, or this test measures a missing file rather than the
      // cwd-independence it is named for.
      writeFileSync(
        resolve(scriptDir, "shipped-readme-version.mjs"),
        readFileSync(resolve(import.meta.dir, "..", "scripts", "shipped-readme-version.mjs")),
      );

      const defaultArtifacts = resolve(scriptDir, `release-${VERSION}`);
      mkdirSync(defaultArtifacts, { recursive: true });

      const run = (cwd: string, relativeInvocation: string) =>
        Bun.spawnSync({
          cmd: ["bash", relativeInvocation, VERSION, RUN_ID, "--dry-run"],
          cwd,
          env: { ...process.env, PATH: `${ws.bin}${delimiter}${process.env.PATH}`, ARTIFACTS: "", NPM_TOKEN: "" },
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
          PATH: `${ws.bin}${delimiter}${process.env.PATH}`,
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

  test("refuses to publish a root tarball whose packed README names the PREVIOUS version (LCLI-510)", () => {
    // THE DEFECT, reproduced on the path that actually publishes today. release.yml's `package`
    // job gates the tarball IT packs; this script publishes whatever is in its artifacts
    // directory, which the usage text says an operator may populate by hand — and the root
    // launcher is the only one of the seven with no independently recorded qualification digest,
    // so it is simultaneously the weakest-checked artifact and the only one carrying README.md.
    const ws = makeWorkspace({ staleRootReadme: true });
    try {
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("packed README disagrees with the package.json being published");
      expect(r.out).toContain("A3.2");
      // It must refuse BEFORE the registry write, not report afterwards — a published version
      // page is immutable, so a check that fires after publishing cannot be a gate.
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("a stale manifest covering only some tarballs is detected, not silently trusted", () => {
    // `shasum -c` checks ONLY the lines a manifest contains, so a leftover manifest listing
    // 1 of 7 exits 0 while verifying almost nothing — and the tarball most likely to go
    // unchecked that way is the root launcher, the one the local seal exists for.
    const ws = makeWorkspace();
    try {
      expect(runScript(ws, ws.root, ws.artifacts).code).toBe(0);
      const manifest = resolve(ws.artifacts, "SHA256SUMS.txt");
      const firstLine = readFileSync(manifest, "utf8").split("\n")[0];
      writeFileSync(manifest, `${firstLine}\n`);

      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("does not cover every tarball");
      expect(r.out).toContain("NO cross-run check");
      expect(r.code).toBe(0);
      // And it really did reseal: the manifest covers all seven again.
      expect(readFileSync(manifest, "utf8").trim().split("\n")).toHaveLength(7);
    } finally {
      ws.cleanup();
    }
  });

  test("a complete manifest still catches a root launcher altered after sealing", () => {
    const ws = makeWorkspace();
    try {
      expect(runScript(ws, ws.root, ws.artifacts).code).toBe(0);
      writeFileSync(resolve(ws.artifacts, ws.rootTarball), "TAMPERED ROOT LAUNCHER");

      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("LOCAL DIGEST MISMATCH");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("a failure fetching the qualification reports refuses rather than falling back to a local seal", () => {
    // These reports carry the ONLY independently recorded digests for the platform tarballs.
    // Without them the digest check would be a local self-seal, which is not what the script
    // claims, so it must refuse rather than quietly downgrade what it is asserting.
    const ws = makeWorkspace();
    try {
      const result = Bun.spawnSync({
        cmd: ["bash", SCRIPT, VERSION, RUN_ID, "--dry-run"],
        cwd: ws.root,
        env: {
          ...process.env,
          PATH: `${ws.bin}${delimiter}${process.env.PATH}`,
          ARTIFACTS: ws.artifacts,
          NPM_TOKEN: "",
          GH_FAIL_PATTERN: "1",
          REPORT_RETRY_DELAY_SECONDS: "0",
        },
      });
      const out = result.stdout.toString() + result.stderr.toString();
      expect(out).toContain("could not download the qualification reports");
      expect(out).not.toContain("independently verified");
      expect(out).not.toContain("STUB PUBLISH");
      expect(result.exitCode).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("refuses a legacy run carrying reports from MORE THAN ONE attempt", () => {
    // The only shape that makes the widened `...-<run_id>*` pattern ambiguous: a run qualified
    // before the names lost their attempt suffix that also had several attempts. Both attempts'
    // directories match, so two files share the report basename. Picking one by readdir order
    // would compare digests from a different build against the newest attempt's tarballs — a
    // loud failure whose remedy text would then send the operator in a circle. It must refuse.
    const ws = makeWorkspace({ legacyAttemptNames: true });
    try {
      // A second attempt's directory for one platform, carrying a deliberately wrong digest so
      // that silently choosing it would be visible as a digest mismatch rather than a refusal.
      const other = resolve(ws.root, "reports", `ladybug-package-qualification-linux-x64-${RUN_ID}-1`);
      mkdirSync(other, { recursive: true });
      writeFileSync(
        resolve(other, "ladybug-package-qualification-linux-x64.json"),
        JSON.stringify({
          schema: "lore.ladybug-package-qualification/3",
          mode: "qualification",
          platform: { distribution: "linux-x64" },
          repository: { commit: COMMIT },
          package: { platform: "@opum-ai/lore-linux-x64", platformTarballSha256: `sha256:${"1".repeat(64)}` },
        }),
      );

      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("AMBIGUOUS");
      expect(r.out).toContain("more than one qualification report");
      expect(r.out).not.toContain("DIGEST MISMATCH");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("reads reports from a run qualified BEFORE the names lost their attempt suffix", () => {
    // A release can legitimately be published from an older run still inside its 90-day
    // artifact retention, whose directories are `...-<run_id>-<attempt>`. The report is
    // located by search rather than by constructing the directory name, so both shapes work.
    const ws = makeWorkspace({ legacyAttemptNames: true });
    try {
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("6/6 platform tarballs match the digests CI recorded");
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("a qualification report with no repository.commit fails instead of agreeing vacuously", () => {
    const ws = makeWorkspace();
    try {
      // Strip the commit from every report: "" was doing double duty as both "not seeded
      // yet" and "field missing", so six reports all missing it used to agree with silence.
      for (const name of PLATFORMS) {
        const file = resolve(
          ws.root,
          "reports",
          `ladybug-package-qualification-${name}-${RUN_ID}`,
          `ladybug-package-qualification-${name}.json`,
        );
        const report = JSON.parse(readFileSync(file, "utf8"));
        report.repository = {};
        writeFileSync(file, JSON.stringify(report));
      }
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("records no repository.commit");
      expect(r.out).not.toContain("all on commit unknown");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("--verify-only reports registry state with no artifacts and no working gh", () => {
    // The propagation-timeout message tells an operator who has just completed the
    // irreversible step to re-check with --verify-only, so it must not need gh, the network,
    // or an artifact that may already have aged out of its 90-day retention.
    const ws = makeWorkspace();
    try {
      const result = Bun.spawnSync({
        cmd: ["bash", SCRIPT, VERSION, RUN_ID, "--verify-only"],
        cwd: ws.root,
        env: {
          ...process.env,
          PATH: `${ws.bin}${delimiter}${process.env.PATH}`,
          ARTIFACTS: resolve(ws.root, "does-not-exist"),
          NPM_TOKEN: "",
          GH_FAIL_ALL: "1",
          GH_FAIL_API: "1",
        },
      });
      const out = result.stdout.toString() + result.stderr.toString();
      expect(out).toContain("skipping artifacts and digests");
      expect(out).toContain("registry state for");
      expect(out).not.toContain("failed to download");
      expect(result.exitCode).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("refuses a directory holding more tarballs than the release has", () => {
    const ws = makeWorkspace();
    try {
      expect(runScript(ws, ws.root, ws.artifacts).code).toBe(0);
      writeFileSync(resolve(ws.artifacts, "opum-ai-lore-1.2.3.tgz"), "a tarball from another release");
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("MORE than the 7");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).not.toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("rejects a tag-shaped version before doing any work", () => {
    // `v0.6.2` is an easy paste from `git tag`. It used to sail through the download and
    // every digest step and die much later on a missing file built from the wrong name.
    const ws = makeWorkspace();
    try {
      const result = Bun.spawnSync({
        cmd: ["bash", SCRIPT, `v${VERSION}`, RUN_ID, "--dry-run"],
        cwd: ws.root,
        env: {
          ...process.env,
          PATH: `${ws.bin}${delimiter}${process.env.PATH}`,
          ARTIFACTS: ws.artifacts,
          NPM_TOKEN: "",
        },
      });
      const out = result.stdout.toString() + result.stderr.toString();
      expect(out).toContain(`pass the VERSION, not the tag: '${VERSION}'`);
      expect(out).not.toContain("downloading npm-packages");
      expect(result.exitCode).toBe(2);
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
        env: {
          ...process.env,
          PATH: `${ws.bin}${delimiter}${process.env.PATH}`,
          ARTIFACTS: ws.artifacts,
          NPM_TOKEN: token,
        },
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

  // LCLI-502: publish ORDER (platform packages before the root launcher) is necessary but not
  // sufficient — 0.7.0 published in that order and the registry's READ API still resolved the
  // root launcher 121s before the last platform package. This test runs the REAL (non-dry-run)
  // publish path — --dry-run stops before `npm publish` is ever invoked, so it cannot observe
  // publish ORDER at all — with a custom npm stub that delays ONE platform package's registry
  // visibility by exactly one poll, and asserts from a call log that the root launcher's
  // `npm publish` never fires until that package's delayed visibility actually resolves.
  test("holds the root launcher until a delayed platform package is registry-visible, not merely published (LCLI-502)", () => {
    const ws = makeWorkspace();
    try {
      const log = resolve(ws.root, "npm-calls.log");
      const state = resolve(ws.root, "npm-state");
      writeFileSync(log, "");
      const delayed = "@opum-ai/lore-linux-x64";

      // Overwrite the shared npm stub for this one test only. `view` reports a package MISSING
      // until this stub's OWN `publish` branch has recorded it (a marker file) — a package can
      // never appear visible before it was actually published. Once published, every package is
      // visible immediately EXCEPT `delayed`, which reports one more MISS before its first HIT —
      // reproducing "the PUT returned, the registry read has not caught up yet" without staging
      // a claim about WHY. Every view/publish call is appended to `log`, in order, which is what
      // the assertions below read to prove ordering rather than mere absence of a crash.
      writeFileSync(
        resolve(ws.bin, "npm"),
        `#!/usr/bin/env bash
set -uo pipefail
LOG="${log}"
STATE="${state}"
VERSION="${VERSION}"
DELAYED="${delayed}"
mkdir -p "$STATE"
# Package names contain "/" (the @opum-ai/ scope), which cannot appear inside a single path
# segment used as a marker filename -- sanitise before ever touching or testing a marker path.
safe() { printf '%s' "\${1//\\//_}"; }
case "\${1:-}" in
  ping) exit 0 ;;
  view)
    spec="$2"
    field="\${3:-}"
    if [ "$field" = "dist-tags.latest" ]; then
      name="$spec"
    else
      name="\${spec%@*}"
    fi
    if [ ! -f "$STATE/published-$(safe "$name")" ]; then
      echo "VIEW-MISS $name (not yet published)" >> "$LOG"
      exit 1
    fi
    if [ "$name" = "$DELAYED" ]; then
      n=0
      [ -f "$STATE/delayed-count" ] && n="$(cat "$STATE/delayed-count")"
      n=$((n+1))
      echo "$n" > "$STATE/delayed-count"
      if [ "$n" -le 1 ]; then
        echo "VIEW-MISS $name (staged-visibility-lag #$n)" >> "$LOG"
        exit 1
      fi
      echo "VIEW-HIT $name (#$n)" >> "$LOG"
      echo "$VERSION"
      exit 0
    fi
    echo "VIEW-HIT $name" >> "$LOG"
    echo "$VERSION"
    exit 0
    ;;
  publish)
    tarball="$2"
    base="$(basename "$tarball")"
    stripped="\${base%-$VERSION.tgz}"
    name="@opum-ai/\${stripped#opum-ai-}"
    echo "PUBLISH $name" >> "$LOG"
    touch "$STATE/published-$(safe "$name")"
    echo "STUB PUBLISH $tarball"
    exit 0
    ;;
  dist-tag) exit 0 ;;
  *) exit 0 ;;
esac
`,
      );
      chmodSync(resolve(ws.bin, "npm"), 0o755);
      // The final install-smoke step shells out to the REAL npx if unstubbed. This test uses the
      // non-dry-run path specifically to observe publish ordering, so npx must be inert too —
      // nothing here should ever touch the network.
      writeFileSync(resolve(ws.bin, "npx"), "#!/usr/bin/env bash\nexit 0\n");
      chmodSync(resolve(ws.bin, "npx"), 0o755);

      const result = Bun.spawnSync({
        cmd: ["bash", SCRIPT, VERSION, RUN_ID],
        cwd: ws.root,
        env: {
          ...process.env,
          PATH: `${ws.bin}${delimiter}${process.env.PATH}`,
          ARTIFACTS: ws.artifacts,
          NPM_TOKEN: "",
          // Fast and bounded: the gate only needs to survive ONE backoff sleep (5s) to prove it
          // actually waited. The propagation cushion is zeroed so this test measures the GATE,
          // not the separate fixed post-visibility wait (which is not under test here).
          PROPAGATION_CUSHION_SECONDS: "0",
          REGISTRY_WINDOW_SECONDS: "90",
        },
      });
      const out = result.stdout.toString() + result.stderr.toString();
      expect(result.exitCode).toBe(0);

      const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
      const firstIndex = (pred: (line: string) => boolean) => lines.findIndex(pred);

      const platformPublished = firstIndex((l) => l === `PUBLISH ${delayed}`);
      const lagObserved = firstIndex((l) => l.includes(`VIEW-MISS ${delayed} (staged-visibility-lag`));
      const lagResolved = firstIndex((l) => l.startsWith(`VIEW-HIT ${delayed}`));
      const rootPublished = firstIndex((l) => l === "PUBLISH @opum-ai/lore");

      expect(platformPublished).toBeGreaterThanOrEqual(0);
      expect(lagObserved).toBeGreaterThanOrEqual(0);
      expect(lagResolved).toBeGreaterThanOrEqual(0);
      expect(rootPublished).toBeGreaterThanOrEqual(0);

      // The defect this guards: publish ORDER alone (every platform package's `npm publish`
      // called before the root's) is necessary but not sufficient — the script must also have
      // OBSERVED the delayed package as visible before publishing root, not merely have sent
      // its PUT first, and it must have genuinely POLLED (seen at least one MISS) rather than
      // assumed visibility from publish order.
      expect(platformPublished).toBeLessThan(lagObserved);
      expect(lagObserved).toBeLessThan(lagResolved);
      expect(lagResolved).toBeLessThan(rootPublished);

      // And the gate actually paused for it: a script that ignored the delay entirely could
      // still satisfy the ordering asserted above by accident if `wait_for_all_visible` were a
      // no-op that happened to be called late. The "waiting" progress line is printed only
      // while the shared window still has a package pending.
      expect(out).toContain("waiting  1 package(s) not visible yet");
    } finally {
      ws.cleanup();
    }
  }, 20_000);
});

// ── Qualification receipt gate (LCLI-578) and the report-download retry (LCLI-572) ────────────
//
// Every refusal below runs the REAL publish path, not --dry-run. --dry-run never calls
// `npm publish`, so "STUB PUBLISH is absent" would hold in a dry run whether or not the gate
// refused -- the assertion would be vacuous. On the real path a gate that failed to refuse reaches
// the stub publish, and the zeroed registry window makes that fail fast rather than hang.
// Each test also asserts the SPECIFIC reason, so that breaking one clause of the reader turns
// exactly its own tests red (mutation-tested in the LCLI-578 PR).
const REAL_RUN = { REGISTRY_WINDOW_SECONDS: "0", PROPAGATION_CUSHION_SECONDS: "0" };
const REFUSED = "refusing to publish (LCLI-578)";

describeOnPosix("scripts/publish-release.sh qualification receipt (LCLI-578)", () => {
  function refuses(mutate: ((r: Record<string, unknown>) => void) | null, reason: string | RegExp) {
    const ws = makeWorkspace();
    try {
      if (mutate === null) rmSync(ws.receiptFile);
      else ws.writeReceipt(mutate);
      const r = runScript(ws, ws.root, ws.artifacts, REAL_RUN, []);
      expect(r.stderr).toContain(REFUSED);
      if (typeof reason === "string") expect(r.stderr).toContain(reason);
      else expect(r.stderr).toMatch(reason);
      // Before any credential handling and before any registry write.
      expect(r.out).not.toContain("auth:");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).toBe(1);
      return r;
    } finally {
      ws.cleanup();
    }
  }

  test("the matching default receipt passes on the real path, so the refusals below are the gate's", () => {
    // The positive control for every refusal in this block: identical workspace, real path, and
    // it DOES reach the (stubbed) publish.
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, ws.artifacts, REAL_RUN, []);
      expect(r.out).toContain(`receipt: QUALIFIED -- version ${VERSION}, run ${RUN_ID} and all 7 tarball sha256 match`);
      expect(r.out).toContain("STUB PUBLISH");
    } finally {
      ws.cleanup();
    }
  });

  test("no receipt: refuses, and the message carries gh's own error text", () => {
    const r = refuses(null, "NO QUALIFICATION RECEIPT");
    expect(r.stderr).toContain("gh: Not Found (HTTP 404)");
  });

  test("an unknown kind refuses", () => {
    refuses((r) => {
      r.kind = "opum.qualification-receipt.v2";
    }, 'kind is "opum.qualification-receipt.v2"');
  });

  test("a verdict other than QUALIFIED with no override refuses", () => {
    refuses((r) => {
      r.verdict = "NOT QUALIFIED";
    }, 'verdict is "NOT QUALIFIED", not "QUALIFIED"');
  });

  test("a version mismatch refuses", () => {
    refuses((r) => {
      r.version = "9.9.8";
    }, `version is "9.9.8", not "${VERSION}"`);
  });

  test("a releaseRunId mismatch refuses, whether written as a number or a string", () => {
    refuses(
      (r) => {
        r.releaseRunId = Number(RUN_ID) + 1;
      },
      `releaseRunId is ${Number(RUN_ID) + 1}, not ${RUN_ID}`,
    );
    refuses((r) => {
      r.releaseRunId = "4242424243";
    }, `releaseRunId is "4242424243", not ${RUN_ID}`);
  });

  test("the run id matches when written as a string, so the comparison is by value", () => {
    const ws = makeWorkspace();
    try {
      ws.writeReceipt((r) => {
        r.releaseRunId = RUN_ID;
      });
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("receipt: QUALIFIED (would proceed)");
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("one tarball's sha256 wrong refuses, naming the tarball and both digests", () => {
    const bad = `opum-ai-lore-linux-arm64-${VERSION}.tgz`;
    refuses(
      (r) => {
        (r.tarballs as Record<string, string>)[bad] = "0".repeat(64);
      },
      new RegExp(`sha256 MISMATCH for ${bad}: receipt says "0{64}", the file to be published is [0-9a-f]{64}`),
    );
  });

  test("a tarball key missing refuses (own-property lookup)", () => {
    const gone = `opum-ai-lore-win32-x64-${VERSION}.tgz`;
    refuses((r) => {
      delete (r.tarballs as Record<string, string>)[gone];
    }, `tarballs has no entry for ${gone}`);
  });

  test("an extra tarball key refuses (set equality)", () => {
    const extra = `opum-ai-lore-freebsd-x64-${VERSION}.tgz`;
    refuses((r) => {
      (r.tarballs as Record<string, string>)[extra] = "a".repeat(64);
    }, `tarballs names "${extra}", which this release does not publish`);
  });

  test("a partial override refuses: each of by, reason, task and adr is required", () => {
    for (const blank of ["by", "reason", "task", "adr"]) {
      refuses((r) => {
        r.verdict = "NOT QUALIFIED";
        r.override = { by: "jdnewhouse", reason: "scale row unbound", task: "LCLI-999", adr: "docs/adr/x.md@abc1234" };
        (r.override as Record<string, string>)[blank] = "";
      }, "override is present but INCOMPLETE");
    }
  });

  test("a complete override on a NOT QUALIFIED receipt proceeds and is printed verbatim", () => {
    const ws = makeWorkspace();
    try {
      const override = {
        by: "jdnewhouse",
        reason: "scale row structurally unbound (TASK-107); 0 FAIL",
        task: "LCLI-999",
        adr: "docs/adr/harden-fleet-ci.md@9222079",
      };
      ws.writeReceipt((r) => {
        r.verdict = "NOT QUALIFIED";
        r.override = override;
      });
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain('!!! receipt verdict is "NOT QUALIFIED" -- proceeding ONLY on the override');
      expect(r.out).toContain(JSON.stringify(override, null, 2));
      expect(r.out).toContain("!!! receipt: OVERRIDE (would proceed on the override above)");
      expect(r.out).toContain("would    npm publish");
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("no environment variable bypasses a missing receipt", () => {
    const ws = makeWorkspace();
    try {
      rmSync(ws.receiptFile);
      const bypasses = {
        SKIP_RECEIPT: "1",
        LORE_RECEIPT_OVERRIDE: "1",
        RECEIPT_OVERRIDE: "1",
        SKIP_QUALIFICATION: "1",
        SKIP_TOKEN_SHAPE_CHECK: "1",
        GH_HOST: "ghe.example.invalid",
        FORCE: "1",
      };
      const r = runScript(ws, ws.root, ws.artifacts, { ...REAL_RUN, ...bypasses }, []);
      expect(r.stderr).toContain("NO QUALIFICATION RECEIPT");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).toBe(1);
    } finally {
      ws.cleanup();
    }
  });

  // The checker is `node -e <heredoc>`. These two replace `node` on PATH with a shim that passes
  // every call through to the real node EXCEPT the receipt check (recognised by the receipt kind
  // in its script text), where it simulates a checker that exits 0 having said nothing -- what an
  // emptied heredoc produces -- or one that emits a warning on stderr before answering.
  function shimNode(ws: ReturnType<typeof makeWorkspace>) {
    const realNode = execFileSync("bash", ["-c", "command -v node"], { encoding: "utf8" }).trim();
    writeFileSync(
      resolve(ws.bin, "node"),
      `#!/usr/bin/env bash
case "$*" in
  *opum.qualification-receipt.v1*)
    [ "\${NODE_SHIM:-}" = silent ] && exit 0
    [ "\${NODE_SHIM:-}" = warn ] && echo "(node:4242) ExperimentalWarning: a stray line on stderr" >&2 ;;
esac
exec "${realNode}" "$@"
`,
    );
    chmodSync(resolve(ws.bin, "node"), 0o755);
  }

  test("a checker that exits 0 but says nothing REFUSES rather than falling through to publish", () => {
    const ws = makeWorkspace();
    try {
      shimNode(ws);
      ws.writeReceipt((r) => {
        r.verdict = "NOT QUALIFIED";
      });
      const r = runScript(ws, ws.root, ws.artifacts, { ...REAL_RUN, NODE_SHIM: "silent" }, []);
      expect(r.stderr).toContain("unrecognised output from the receipt checker -- refusing to publish");
      expect(r.out).not.toContain("proceeding ONLY on the override");
      expect(r.out).not.toContain("STUB PUBLISH");
      expect(r.code).toBe(1);
    } finally {
      ws.cleanup();
    }
  });

  test("a line on the checker's stderr never becomes the verdict", () => {
    const ws = makeWorkspace();
    try {
      shimNode(ws);
      const r = runScript(ws, ws.root, ws.artifacts, { NODE_SHIM: "warn" });
      expect(r.out).toContain("receipt: QUALIFIED (would proceed)");
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("--dry-run reports QUALIFIED for a matching receipt", () => {
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.out).toContain("receipt: QUALIFIED (would proceed)");
      expect(r.out).toContain("DRY RUN complete");
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });

  test("--dry-run reports a refusing receipt's reason and exits non-zero", () => {
    const ws = makeWorkspace();
    try {
      ws.writeReceipt((r) => {
        r.verdict = "NOT QUALIFIED";
      });
      const r = runScript(ws, ws.root, ws.artifacts);
      expect(r.stderr).toContain(REFUSED);
      expect(r.stderr).toContain('verdict is "NOT QUALIFIED"');
      expect(r.out).not.toContain("would    npm publish");
      expect(r.code).toBe(1);
    } finally {
      ws.cleanup();
    }
  });
});

describeOnPosix("scripts/publish-release.sh qualification-report download (LCLI-572)", () => {
  test("a download failing on both attempts puts gh's own error text in the die message", () => {
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, ws.artifacts, { GH_FAIL_PATTERN: "1", REPORT_RETRY_DELAY_SECONDS: "0" });
      // In the ERROR itself, after its first line -- not merely somewhere in the output.
      expect(r.stderr).toMatch(
        /ERROR: could not download the qualification reports for run \d+ \(2 attempts\)\. gh said:\n\s+stub gh: error downloading ladybug-package-qualification artifacts: HTTP 502 Bad Gateway \(attempt 2\)/,
      );
      expect(r.out).toContain("attempt 1 of 2");
      // Bounded: exactly one retry.
      expect(ws.patternAttempts()).toBe(2);
      expect(r.out).not.toContain("independently verified");
      expect(r.code).toBe(1);
    } finally {
      ws.cleanup();
    }
  });

  test("a download that fails once and then succeeds proceeds", () => {
    const ws = makeWorkspace();
    try {
      const r = runScript(ws, ws.root, ws.artifacts, { GH_FAIL_PATTERN_ONCE: "1", REPORT_RETRY_DELAY_SECONDS: "0" });
      expect(r.out).toContain("HTTP 502 Bad Gateway (attempt 1)");
      expect(r.out).toContain("retrying once");
      expect(r.out).toContain("6/6 platform tarballs match the digests CI recorded");
      // Attempt 1 left a stale report behind; the retry must not have seen it.
      expect(r.out).not.toContain("AMBIGUOUS");
      expect(r.out).not.toContain("DIGEST MISMATCH");
      expect(ws.patternAttempts()).toBe(2);
      expect(r.code).toBe(0);
    } finally {
      ws.cleanup();
    }
  });
});

// ── The closing checklist is operator-facing REPORTING, and reporting is the half that lies ────
//
// Step 1a of this checklist shipped a command that matched nothing: it grepped for
// `Status: .* released`, which does not occur in the README the generator produces because the
// region markers split the literal. The workflow's copy of that same mistake had already been
// fixed. This copy survived because `--dry-run` exits long before the checklist is ever printed,
// so no test could reach it — the assertion had no way to be run, which is not the same as being
// right. `--print-checklist` exists to close that, and these tests are why it exists.
describeOnPosix("the closing checklist", () => {
  const checklist = (version: string) =>
    execFileSync("bash", [SCRIPT, version, RUN_ID, "--print-checklist"], { encoding: "utf8" });

  /** Step 1a's RUNNABLE command block — the indented lines an operator copies, not the prose. */
  function stepOneACommands(out: string) {
    const body = out.slice(out.indexOf("1a. Read the shipped README back off the registry"));
    return body.slice(0, body.indexOf("\n\n"));
  }

  test("step 1a re-runs the assertions and does NOT tell the operator to grep for a sentence", () => {
    // Asserted against the COMMAND BLOCK, not the whole checklist: the prose below it quotes the
    // old grep on purpose, to say why it went. A naive `not.toContain` over the full text fails
    // on the explanation and would push the next author to delete the reasoning to get green.
    const commands = stepOneACommands(checklist(VERSION));
    expect(commands).toContain("shipped-readme-version.mjs --check");
    expect(commands).not.toContain("grep");
    // And the prose keeps the reason, which is the thing that stops it being re-added.
    expect(checklist(VERSION)).toContain("DO NOT GREP FOR A SENTENCE");
  });

  test("THE REASON step 1a changed: that grep genuinely matches nothing in the real README", () => {
    // Guards the premise rather than the wording. If the generator ever stops splitting the
    // literal, this fails and the instruction could honestly go back to being a grep.
    const readme = readFileSync(resolve(import.meta.dir, "..", "README.md"), "utf8");
    expect(readme).not.toMatch(/Status: .* released/);
    expect(readme).toMatch(/Status:<!--lore-version:status:begin--> \d+\.\d+\.\d+ released/);
  });

  test("it names the package it tells you to read, and the name is DERIVED not hardcoded", () => {
    const out = checklist(VERSION);
    expect(out).toContain("npm view @opum-ai/lore readme");
    // The packument-level fact is the thing an operator must carry into their write-up.
    expect(out).toContain("package-level");
  });

  test("nothing is left unexpanded — a shell artifact in an instruction is a broken instruction", () => {
    const out = checklist(VERSION);
    expect(out).not.toContain("${ROOT_PKG");
    expect(out).not.toContain("\\$");
    expect(out).not.toContain("$VERSION");
    // `$(mktemp -d)` and `"$d/..."` are literal ON PURPOSE: they are shell for the operator to
    // run, not values for this script to expand.
    expect(out).toContain("$(mktemp -d)");
  });

  test("no version is hardcoded — LCLI-483 shipped a checklist naming v0.3.5 for months", () => {
    const a = checklist("9.9.9");
    const b = checklist("8.8.8");
    expect(a).toContain("PUBLISHED 9.9.9");
    expect(b).toContain("PUBLISHED 8.8.8");
    // Substituting the version back must make the two identical: any surviving difference is a
    // number that came from somewhere other than the argument.
    expect(a.replaceAll("9.9.9", "<V>")).toBe(b.replaceAll("8.8.8", "<V>"));
  });

  test("--print-checklist touches nothing: no artifacts, no network, no registry", () => {
    // It runs before the artifact resolution and every npm/gh call, so it must succeed with no
    // stubs on PATH at all. If this ever needs a stub, the flag has stopped being inert.
    const out = execFileSync("bash", [SCRIPT, VERSION, RUN_ID, "--print-checklist"], {
      encoding: "utf8",
      env: { ...process.env, PATH: "/usr/bin:/bin" },
    });
    expect(out).toContain("PUBLISHED");
  });
});
