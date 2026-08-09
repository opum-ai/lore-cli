---
id: LCLI-320
title: Prepare and deliver Lore CLI 0.2.0 release metadata
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-09 05:45'
updated_date: '2026-08-09 07:26'
labels:
  - release
  - npm
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-314
references:
  - docs/runbooks/release-publishing.md
  - .github/workflows/release.yml
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
modified_files:
  - package.json
  - bun.lock
  - npm/darwin-arm64/package.json
  - npm/darwin-x64/package.json
  - npm/linux-arm64/package.json
  - npm/linux-x64/package.json
  - npm/win32-arm64/package.json
  - npm/win32-x64/package.json
  - CHANGELOG.md
  - test/ladybug-package-qualification.test.ts
  - benchmark/ladybug/fixtures/v1/small.json
  - benchmark/ladybug/fixtures/v1/large.json
  - test/ladybug-benchmark-report.test.ts
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/log.md
priority: high
type: task
ordinal: 443000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prepare the accumulated post-0.1.1 work for publication as Lore CLI 0.2.0 without publishing it. The minor-version bump reflects the default OKF 0.2 producer migration and the new pluggable Backlog/Jira tracker surface. Reconcile the completed OKF 0.2 parent first; then keep every package manifest, optional dependency pin, lockfile, version-derived fixture, changelog entry, and release-facing version claim coherent. Deliver preparation through the protected repository workflow and leave tagging, registry publication, and GitHub Release creation to a separately authorized publication task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root package.json and all six platform manifests declare 0.2.0, all six root optional dependency pins match exactly, and bun.lock is consistent
- [ ] #2 CHANGELOG.md contains a complete dated 0.2.0 entry for all user-visible changes since v0.1.1 and retains an empty Unreleased section
- [ ] #3 Version-derived fixtures and release-facing documentation are updated only where the 0.2.0 preparation changes their deterministic output or forward-looking contract; release-truth claims remain at 0.1.1 until publication is proven
- [ ] #4 Synchronized-version checks, focused release tests, the full project test/typecheck/lint/build gates, compiled version smoke, strict Lore validation/check, dependency audit, diff hygiene, and all seven npm publish dry-runs pass without publishing
- [ ] #5 The preparation change is committed and delivered through dev and main with required CI green, temporary release refs are pruned when safe, and the repository is clean
- [ ] #6 No npm package, Git tag, GitHub Release, or publish:true workflow dispatch is created by this preparation task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create a dedicated release/0.2.0-preparation branch from the grounded dev SHA, then use Lore to couple LCLI-320 and LCLI-321 to the release Story and synchronize managed task state without altering immutable 0.1.1 publication evidence.
2. Bump the root package, all six platform manifests, the six exact optional-dependency pins, and bun.lock to 0.2.0; update only the deterministic package-qualification fixture that asserts the compiled package version, while preserving historical/provenance examples that intentionally contain 0.1.1.
3. Add a dated 0.2.0 changelog entry covering all user-visible work since v0.1.1: OKF 0.2 negotiation/provenance/sources/trust/lifecycle/attested-computation/conformance, pluggable Backlog/Jira tracker selection, and the delivered log, Backlog-probe, indexed-preflight, and workspace-selection fixes. Keep Unreleased empty and keep release-truth/index/Story availability claims at published 0.1.1.
4. Run synchronized-version and release-workflow tests, focused version/package tests, the complete test/typecheck/lint/build gates, compiled --version smoke, Lore sync/strict validate/check, dependency audit, git diff hygiene, and npm publish --dry-run for the root plus all six platform packages. Record exact results and residual environment limits.
5. Run the task-finalization guide and an adversarial self-review of each acceptance criterion. If all local evidence passes, commit and deliver the exact preparation branch through protected PRs to dev and main, observe required CI, prune temporary refs only when ancestry is proven, settle LCLI-320/doc-16, and stop before any tag, workflow dispatch, npm publication, GitHub Release, or LCLI-321 execution.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Full-suite discovery: the 0.2.0 package version changes the canonical projection bytes embedded in the small and large Ladybug benchmark fixtures. The first run passed 2551 tests with 1 skip and failed only the two expected canonicalExportSha256 assertions; observed replacements are small sha256:71b91827091c58c8fd76dc4473fd51ab54d8a01a6355d7baca852d91ea0628ae and large sha256:2b1b0941bde8452be8d6469cc2b47bbaa24780cd6777a21a443ca90e142547a1.

Second full-suite discovery: after updating fixture canonical-export hashes, 2552 tests passed with 1 skip and only test/ladybug-benchmark-report.test.ts failed because the report contract digest also embeds package version. Observed replacement: sha256:733db8e59b35d8fc224d1228c66e3dde1423f65e4e87be43e19d09d5f9c90534.

Local qualification completed on release/0.2.0-preparation:
- Seven manifests and six exact optional dependency pins agree on 0.2.0; bun install --frozen-lockfile reports no changes.
- Focused release/OKF/package suite passed 107 tests with 1 platform-specific skip; benchmark fixture/report rerun passed 8 tests.
- Full suite passed 2553 tests with 1 pre-existing platform-specific skip, 0 failures, and 8735 expectations across 78 files.
- npm run typecheck and npm run lint passed; npm run build produced dist/lore and its --version output is 0.2.0.
- lore validate --strict reported 0 errors and 0 warnings; lore check --strict exited 0.
- bun audit found no vulnerabilities; git diff --check passed.
- npm publish --dry-run --ignore-scripts --access public passed for @opum-ai/lore and all six platform packages. No package, tag, workflow dispatch, or GitHub Release was created.
- The first platform dry-run invocation used ambiguous paths such as npm/darwin-arm64, which npm parsed as GitHub shorthand and refused with EALLOWGIT; rerunning with explicit ./npm/... paths passed all six.
<!-- SECTION:NOTES:END -->
