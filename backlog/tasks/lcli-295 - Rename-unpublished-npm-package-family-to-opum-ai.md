---
id: LCLI-295
title: Rename unpublished npm package family to @opum-ai
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-03 23:23'
updated_date: '2026-08-04 01:05'
labels:
  - release
  - packaging
  - documentation
  - repository-migration
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/runbooks/release-publishing.md
modified_files:
  - .github/workflows/release.yml
  - CHANGELOG.md
  - ECK-ALIGNMENT.md
  - README.md
  - >-
    backlog/tasks/lcli-45 -
    Deferred-Typed-importable-library-build-.d.ts-subpath-exports.md
  - backlog/tasks/lcli-295 - Rename-unpublished-npm-package-family-to-opum-ai.md
  - benchmark/ladybug/package-qualification.ts
  - benchmark/ladybug/qualification-evidence.ts
  - bin/lore.cjs
  - bun.lock
  - docs/adr/0001-runtime-build-distribution.md
  - docs/adr/0007-validation-and-coherence.md
  - docs/adr/0015-lightweight-retrieval-no-vectors.md
  - docs/index.md
  - docs/reference/lore-cli-release-truth.md
  - docs/reference/tech-stack.md
  - docs/runbooks/release-publishing.md
  - npm/darwin-arm64/package.json
  - npm/darwin-x64/package.json
  - npm/linux-arm64/package.json
  - npm/linux-x64/package.json
  - npm/win32-x64/package.json
  - package.json
  - test/bin-lore.test.ts
  - test/ladybug-qualification-evidence.test.ts
  - test/release-workflow.test.ts
  - test/repository-location.test.ts
priority: high
type: chore
ordinal: 408000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Align the unpublished Lore npm distribution with the canonical opum-ai organization before the first release. Rename the user-facing launcher and all five platform packages from the legacy @salient-data scope to @opum-ai, update every active resolver, workflow, test, and release/documentation route, and preserve old names only where they are explicitly historical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The root manifest publishes @opum-ai/lore and the five platform manifests publish the matching @opum-ai/lore-<os>-<cpu> names with synchronized versions and optional dependencies
- [x] #2 Launcher resolution, release automation, tarball handling, tests, install examples, Trusted Publisher instructions, and active Lore documentation use the @opum-ai package family with no stale operational @salient-data/lore references
- [x] #3 A user installs only @opum-ai/lore while npm selects exactly one matching platform package for every supported OS and CPU target
- [x] #4 The first-release guidance records that the opum-ai npm scope and publisher permissions are external prerequisites and that all six names are unpublished before bootstrap
- [ ] #5 Focused package/launcher/release tests, release packaging dry-run coverage, lint, typecheck, full tests, Lore sync, strict validation/checking, and git diff hygiene pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create an isolated feature branch from clean dev and classify every legacy npm-scope occurrence as active operational state or immutable historical provenance. 2. Rename the root launcher, five platform manifests, optional dependencies, Bun lock metadata, Node launcher resolver, release workflow package/tarball logic, Ladybug qualification code, and focused tests to the exact @opum-ai/lore family; add a regression assertion that pins the six-name contract and rejects stale active scope references. 3. Update README, ECK alignment, CHANGELOG Unreleased notes, the active deferred LCLI-45 contract through Backlog CLI, and all current Lore distribution/release documentation through Lore-safe replacement and authored prose; record the external npm-scope ownership prerequisite and unpublished registry evidence. 4. Verify manifest/version/OS/CPU consistency, launcher selection, release workflow behavior, npm pack names and install-sanity, focused and full tests, lint/typecheck, stale-reference classification, Lore strict validation/checking, and git diff hygiene. 5. Keep LCLI-295 In Progress until required Lore coupling/synchronization and any requested commit/PR delivery receive explicit authority; do not create npm resources or publish packages.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-03 grounding: clean dev at 43da75e40774008034e47d933b5369843cdf0fc4 before task creation. All six proposed @opum-ai/lore package names return npm E404 in a public registry preflight, consistent with being unpublished but not proof that the opum-ai npm scope exists or that the current account can publish to it. Existing @salient-data/lore occurrences were inventoried across six manifests, bun.lock, launcher, release workflow, Ladybug qualification, tests, README, active Lore docs, ECK alignment, changelog history, and deferred live task LCLI-45. Completed/archive Backlog records and older changelog entries are historical provenance and will not be rewritten.

2026-08-03 implementation evidence: renamed the root launcher and all five platform manifests, exact optional dependency pins, Bun lock metadata, Node resolver, release workflow and tarball routing, Ladybug qualification/reporting, focused tests, README/ECK/CHANGELOG, live deferred task LCLI-45, and current Lore distribution/release documentation to @opum-ai. Added regression coverage that pins the exact six-name family and rejects legacy operational package/tarball identities. Public npm preflight returned E404 for all six planned names; this confirms they are not publicly visible but does not establish npm scope ownership.

2026-08-03 verification: Bun 1.2.23 frozen install passed without lock drift; isolated-cache npm pack --dry-run passed for all six manifests with opum-ai-lore*.tgz filenames; focused launcher/repository/release/evidence tests passed 25/25; lint and typecheck passed; full suite passed 2431/2431 across 75 files with 0 failures; lore validate --strict and lore check --strict passed with 0 findings; git diff --check passed. Active-tree legacy scope scan finds only the negative-regression constants; completed Backlog records, older changelog entries, and the ADR's explicit historical repository sentence remain provenance.

Matching-host package qualification on local darwin-arm64 packed and installed the renamed Lore tarballs, then stopped at the existing Ladybug native fixture because @ladybugdb/core lacked lbugjs.node in the nested npm install. That environment-specific check is not claimed as passed; the Release workflow publish:false qualification remains the authoritative remote evidence. Lore reports LCLI-295 as the sole orphan because lore link/sync would create commits and commit/delivery authority has not yet been granted.

2026-08-03 authority update: the owner confirmed creating the opum-ai npm organization and authorized commit, push, PR/merge, workflow dispatch, and the separate LCLI-296 manual 0.1.0 bootstrap publication. LCLI-295 remains limited to the package-identity migration and will land before any version bump or registry mutation.
<!-- SECTION:NOTES:END -->
