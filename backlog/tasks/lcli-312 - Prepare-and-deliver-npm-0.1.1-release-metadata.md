---
id: LCLI-312
title: Prepare and deliver npm 0.1.1 release metadata
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 20:00'
updated_date: '2026-08-04 20:24'
labels:
  - release
  - npm
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
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
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/log.md
  - benchmark/ladybug/fixtures/v1/small.json
  - benchmark/ladybug/fixtures/v1/large.json
  - test/ladybug-benchmark-report.test.ts
  - docker/e2e/run-e2e.sh
priority: high
ordinal: 425000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prepare the accumulated post-0.1.0 fixes for publication as npm package version 0.1.1 without publishing it. Keep all root and platform package metadata synchronized, cut the changelog release entry, verify the release/package gates, deliver the release-preparation commit through the protected repository workflow, and leave local and remote repository state clean.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root and all six platform package manifests declare version 0.1.1, root optional dependency pins match, and the lockfile is consistent
- [x] #2 CHANGELOG.md promotes the current Unreleased changes into a dated 0.1.1 release entry and retains an empty Unreleased section
- [x] #3 Release metadata checks, focused release tests, full project gates, and package dry-run or equivalent artifact verification pass without publishing
- [ ] #4 The release-preparation change is committed, merged to the integration branch, pushed, stale release branches are pruned when safe, and the working repository is clean
- [x] #5 No npm package, Git tag, or release artifact is published as part of preparation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Couple LCLI-312 to the release Story and ground version/publishing constraints against the live registry, fetched origin, and release runbook. 2. Bump the root manifest, six platform manifests, exact optional-dependency pins, and bun.lock to 0.1.1; promote the accumulated changelog entries into a dated 0.1.1 section while preserving Unreleased. 3. Run deterministic version/metadata checks, focused release tests, full tests/typecheck/lint, Lore validation gates, and no-publish package dry runs. 4. Perform an adversarial diff review, finalize task evidence, commit the exact release-preparation state, push the dedicated branch, merge through protected dev and then main, wait for required CI, and prune only verified merged release refs. 5. Re-ground npm, tags, branches, worktrees, and git status to prove the repository is clean and ready for a separately authorized publication.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial full suite ran 2,450 tests: 2,448 passed and only the small/large canonical benchmark export digests failed. The version is part of the canonical export, so bumping Lore to 0.1.1 deterministically changed those two hashes while source-inventory and task-snapshot hashes remained stable. Updated only the two expected canonicalExportSha256 values to the observed 0.1.1 outputs; focused and full reruns are required.

After the fixture hashes were updated, the second full suite ran 2,450 tests: 2,449 passed and the sole failure was the benchmark report digest that transitively covers those fixtures. Updated that one expected digest to the deterministic 0.1.1 report output; a focused report test and final full-suite rerun remain required.

Pre-delivery verification on release/0.1.1-prep: synchronized version audit passed for root, six platform manifests, exact optional dependency pins, and bun.lock; bun install --frozen-lockfile passed with Bun 1.3.14. CHANGELOG contains an empty Unreleased heading followed by the dated 0.1.1 entry. Focused release/fixture/report suite passed 48/48 with 417 assertions; full suite passed 2,450/2,450 with 8,296 assertions; typecheck, lint across 186 files, actionlint, build, compiled dist/lore --version (0.1.1), Lore validate --strict (64 files, zero errors/warnings), Lore check --strict, and git diff --check passed. npm publish --dry-run produced public 0.1.1 reports for root and all six platform manifests without publishing. Registry audit still shows only 0.1.0 for the existing six packages and 404 for the new win32-arm64 package; no v0.1.1 tag exists. Adversarial self-review verified the exact 14-file implementation/docs diff and found no unrelated paths. AC #4 remains unchecked pending protected delivery, CI, pruning, and final clean-state evidence.

Protected PR #306 CI run 30947227260 passed seven jobs and failed Docker E2E with six linked assertions. Log review showed the first failure was intentional LCLI-304 behavior: the harness attempted lore link against a Spec, whose built-in schema has no tasks capability, so link correctly returned validation/exit 6; five subsequent vanished-task assertions cascaded. Updated only that E2E phase to create a fresh isolated Story, preserving the intended nonexistent/vanished task contracts while respecting schema-capability enforcement. Fresh local and protected verification are required before merge.
<!-- SECTION:NOTES:END -->
