---
id: LORE-9
title: 'Release pipeline: compiled binaries + dual-artifact npm publish'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-07-12 13:10'
labels:
  - ci
  - release
milestone: m-1
dependencies:
  - LORE-8
documentation:
  - docs/adr/0001-runtime-build-distribution.md
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per-platform -baseline bun build --compile, Node .cjs launcher + per-platform binary optionalDependencies, trusted publishing, post-publish install-sanity polling.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A dry-run release produces all platform artifacts
- [x] #2 npx @salient-data/lore resolves the right binary
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope (per user decision, asked explicitly before starting): "build mechanics
only, stop before publish." Implemented everything verifiable without npm
registry account access; deliberately does NOT touch npmjs.com or wire a live
`npm publish` step.

Shipped:
- bin/lore.cjs -- the launcher. Plain Node CJS (no Bun-only APIs, per
  ADR-0001's own requirement), resolves @salient-data/lore-<platform>-<arch>
  via require.resolve, execs it via spawnSync with stdio:inherit, forwards
  exit code (a signal-killed child with null status forwards 1, not a
  misleading process.exit(null)->0).
- npm/{darwin,linux}-{arm64,x64},win32-x64/package.json -- the 5 per-platform
  optionalDependency templates (os/cpu-gated). Binaries are release-time
  build artifacts, gitignored (npm/*/bin/), never committed.
- package.json: bin -> bin/lore.cjs, optionalDependencies added, bin/ added
  to files.
- .github/workflows/release.yml: workflow_dispatch-ONLY (never fires on
  push/tag -- committing or tagging code cannot trigger a release). Cross-
  compiles all 5 targets (bun-darwin-arm64, bun-darwin-x64-baseline,
  bun-linux-arm64, bun-linux-x64-baseline, bun-windows-x64-baseline) from a
  single ubuntu-latest runner -- verified locally first that Bun cross-
  compiles cleanly from one host (downloads the target runtime; no matching
  host OS/arch needed). Executes the linux-x64 binary natively (the one
  target that matches the runner); size-checks the other 4 (can't safely
  exec cross-arch/cross-OS on one runner). npm packs all 6 packages, then
  proves the full npx/launcher resolution chain end-to-end via a REAL
  pack+install+run in a scratch dir. actionlint clean (installed via brew
  for this review). Never calls npm publish -- that step is a documented
  TODO comment in the workflow file itself.

AC#1 (dry-run produces all platform artifacts) / AC#2 (npx resolves the
right binary): both verified via careful LOCAL reproduction of every step
the workflow automates -- compiled all 5 targets manually, npm pack'd the
root + darwin-arm64 packages, installed both into a scratch project, and ran
the launcher via `node node_modules/.bin/lore --version`/`--help`/`npx lore
--version`, all correct; also verified the "platform package missing" error
path (renamed the installed package away, confirmed a clear stderr message
+ exit 1). A bun:test suite (test/bin-lore.test.ts) automates the launcher's
own argv/exit-code/stdio-forwarding and missing-package paths via a
NODE_PATH-simulated install (POSIX-only; Windows coverage is the real
compiled-binary path in CI, not fakeable the same way with a shebang stub).

IMPORTANT CAVEAT, not yet resolved: GitHub requires a workflow_dispatch
workflow to already exist ON THE DEFAULT BRANCH before it can be triggered
via `gh workflow run`/the Actions UI -- `gh workflow run release.yml --ref
feat/lore-9-release-pipeline` 404'd because release.yml only exists on this
feature branch so far. I have NOT seen this exact YAML execute in real
GitHub Actions yet -- only actionlint's static check + my manual step-by-step
reproduction of the same commands locally. RECOMMENDATION: once this PR
merges to dev, manually trigger the "Release (dry-run)" workflow
(workflow_dispatch, default inputs) once and confirm all jobs go green
before relying on it for a real release -- do not assume it is
fully proven until that first real run is observed.

docs/runbooks/release-publishing.md: researched against npm's current docs
(WebSearch + WebFetch of https://docs.npmjs.com/trusted-publishers/, not
guessed from training data, since npm's trusted-publishing UI/flow evolved
2023-2025) -- covers per-package Trusted Publisher setup (all 6 packages,
exact org/repo/workflow-filename fields), confirms it works for a brand-new
scoped package (configure before the first publish), the eventual `publish`
job shape, the release-cutting procedure, and rollback (npm unpublish's
72-hour/no-dependents window vs. `npm deprecate`).

Also re-applied the docs/adr/index.md hand-table/managed-block dedup fix
(same bug as LORE-14, recurred here since this branch is off dev and
LORE-14 hasn't merged).

Gates: 1437 tests, biome clean, tsc clean, lore check 0/0, actionlint clean
on both workflow files.

/code-review high (workflow-backed) fold: 6 findings, all fixed, PLUS one
additional bug I found during my own follow-up verification of finding #2.

1. [correctness, SEVERE] release.yml's install-sanity glob
   `salient-data-lore-*.tgz` matched ALL 6 packed tarballs, not just root --
   passing mismatched-platform tarballs to `npm install` as explicit args
   bypasses npm's lenient optionalDependency platform-skip and hard-fails
   EBADPLATFORM. Reproduced locally. FIX: construct exact tarball filenames
   from the version (`salient-data-lore-${version}.tgz` /
   `-linux-x64-${version}.tgz`) instead of an ambiguous glob.

2. [correctness, SEVERE] package.json's bin.lore switching from src/cli.ts
   to bin/lore.cjs breaks every pre-publish install path (git dependency,
   npm/bun link) since the 5 platform packages it resolves don't exist until
   a real publish ships them, with no fallback. FIX: reverted bin.lore to
   src/cli.ts (not yet flipped); documented in release-publishing.md that
   flipping it is step 1 of actually cutting a release, not a standing
   state. The workflow's install-sanity step now patches a SCRATCH copy of
   package.json (bin -> bin/lore.cjs) before packing root, reverts the real
   file immediately after, so the dry-run still proves the launcher exactly
   as a real release will ship it -- verified this patch+pack+revert
   sequence locally (packed tarball had the patched bin; real package.json
   was byte-identical after).

   FOUND DURING MY OWN FOLLOW-UP on this fix (not one of the 6 reported):
   bun.lock was never regenerated after optionalDependencies was added to
   package.json in the original commit -- `bun install --frozen-lockfile`
   (which ci.yml's check job runs) would have failed on this PR's own CI.
   Verified: `bun install` (unfrozen) updates it cleanly (also confirmed
   nonexistent optional packages 404 gracefully, non-fatal, exactly per
   documented optionalDependencies semantics); committed the regenerated
   lockfile and re-verified `--frozen-lockfile` now passes.

3. [correctness] test/bin-lore.test.ts spawned via `process.execPath`, which
   under `bun test` IS the Bun binary, not Node -- the suite never actually
   exercised bin/lore.cjs under the Node runtime it exists to support. FIX:
   spawn literal "node" (PATH-resolved); re-ran, all 4 tests still pass, now
   genuinely under Node.

4. [correctness] no automation enforced the 6-file version lockstep
   (root + 5 platform package.json). FIX: new `verify-versions` job in
   release.yml, runs first (before any compile), asserts all 6 versions
   match, fails loud naming the mismatched file(s) if not.

5. [cleanup] tech-stack.md claimed the pipeline was "CI-verified" when the
   workflow has never executed in real GitHub Actions (gh workflow run
   404's until the file exists on the default branch -- confirmed, see
   prior note). FIX: corrected wording to "verified by direct local
   reproduction... not yet had a first real GitHub Actions run", both in
   tech-stack.md and the CHANGELOG entry.

6. [cleanup] the `package` job set up Bun + restored its cache + ran a full
   `bun install` that nothing in the job used (every step after only shells
   to cp/chmod/npm/node). FIX: removed entirely -- the job now relies solely
   on the ubuntu runner's preinstalled node/npm.

Re-verified after all fixes: 1437 tests, biome clean, tsc clean, lore check
0/0, lore validate 0/0 on touched docs, actionlint clean on both workflow
files, `bun install --frozen-lockfile` passes.

STILL UNRESOLVED (documented, not a defect I can fix from here): the
workflow has still never run in real GitHub Actions (same reason as before
-- needs to exist on dev first). The fixes above are extensively verified
via direct local reproduction of the underlying commands/logic, but the
first real `workflow_dispatch` run remains the outstanding proof point.
Recommend triggering it once this merges, before cutting any real release.

Round-3 fixes verified before commit (handover-restore session, 2026-07-12):
re-ran full gates (1439 tests pass, biome clean, tsc clean, lore check 0/0,
lore validate 0 errors) after fixing a broken node_modules/@types/bun symlink
(stale `bun install` state, unrelated to this branch's edits) and one biome
format violation in test/bin-lore.test.ts (escaped-quote string -> single-quoted
literal). actionlint clean on both workflow files.

Ran a 4th /code-review high pass (workflow-backed, 10 agents) specifically on
the round-3 diff before pushing, given how much the prior 3 rounds each caught.
It found one real bug, independently rediscovered by 4 of 4 finder angles:
refactoring the platform list into a shared `setup` job (round-3's own change)
silently dropped `verify-versions` from `build`'s `needs:` chain, so the
version/metadata consistency gate no longer blocked compilation or packaging
despite the job's own "fail loud before any compile work" comment still
claiming it did. FIX: `build` now `needs: [setup, verify-versions]` (package
was already transitively covered via `needs: [setup, build]`). Two more
findings, both cleanup: docs/runbooks/release-publishing.md's release
procedure had drifted to describe the broken (non-gating) behavior -- fixed
to name `verify-versions` as the actual asserting job and list what it checks;
and the JSON-platform-list-to-space-separated-string `node -e` transform was
duplicated verbatim in two `package`-job steps -- consolidated into a new
`setup` job output (`namesSpace`) computed once, both steps now just read
`$PLATFORM_NAMES_SPACE`.

Re-verified after these fixes: actionlint clean, full gates clean again.
This is the 4th review round on this branch; each of the 4 caught at least
one real, previously-undetected defect -- reinforces the "don't skip the
review loop on CI/CD-touching work" lesson from rounds 1-3.
<!-- SECTION:NOTES:END -->
