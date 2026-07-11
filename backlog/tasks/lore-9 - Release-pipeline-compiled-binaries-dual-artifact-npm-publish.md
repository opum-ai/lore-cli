---
id: LORE-9
title: 'Release pipeline: compiled binaries + dual-artifact npm publish'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-07-11 17:22'
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
<!-- SECTION:NOTES:END -->
