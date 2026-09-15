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

  // `gh` stub: resolves the run attempt, serves npm-packages, and serves the
  // attempt-suffixed qualification artifacts by pattern.
  writeFileSync(
    resolve(bin, "gh"),
    `#!/usr/bin/env bash
set -uo pipefail
if [ "\${1:-}" = "api" ]; then
  [ -n "\${GH_FAIL_API:-}" ] && exit 1
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
    [ -n "\${GH_FAIL_PATTERN:-}" ] && exit 1
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
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function runScript(ws: ReturnType<typeof makeWorkspace>, cwd: string, artifacts: string) {
  const result = Bun.spawnSync({
    cmd: ["bash", SCRIPT, VERSION, RUN_ID, "--dry-run"],
    cwd,
    env: { ...process.env, PATH: `${ws.bin}${delimiter}${process.env.PATH}`, ARTIFACTS: artifacts, NPM_TOKEN: "" },
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString() + result.stderr.toString(),
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
});
