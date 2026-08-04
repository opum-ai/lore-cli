---
id: LCLI-312
title: Prepare and deliver npm 0.1.1 release metadata
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 20:00'
updated_date: '2026-08-04 20:02'
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
priority: high
ordinal: 425000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prepare the accumulated post-0.1.0 fixes for publication as npm package version 0.1.1 without publishing it. Keep all root and platform package metadata synchronized, cut the changelog release entry, verify the release/package gates, deliver the release-preparation commit through the protected repository workflow, and leave local and remote repository state clean.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root and all six platform package manifests declare version 0.1.1, root optional dependency pins match, and the lockfile is consistent
- [ ] #2 CHANGELOG.md promotes the current Unreleased changes into a dated 0.1.1 release entry and retains an empty Unreleased section
- [ ] #3 Release metadata checks, focused release tests, full project gates, and package dry-run or equivalent artifact verification pass without publishing
- [ ] #4 The release-preparation change is committed, merged to the integration branch, pushed, stale release branches are pruned when safe, and the working repository is clean
- [ ] #5 No npm package, Git tag, or release artifact is published as part of preparation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Couple LCLI-312 to the release Story and ground version/publishing constraints against the live registry, fetched origin, and release runbook. 2. Bump the root manifest, six platform manifests, exact optional-dependency pins, and bun.lock to 0.1.1; promote the accumulated changelog entries into a dated 0.1.1 section while preserving Unreleased. 3. Run deterministic version/metadata checks, focused release tests, full tests/typecheck/lint, Lore validation gates, and no-publish package dry runs. 4. Perform an adversarial diff review, finalize task evidence, commit the exact release-preparation state, push the dedicated branch, merge through protected dev and then main, wait for required CI, and prune only verified merged release refs. 5. Re-ground npm, tags, branches, worktrees, and git status to prove the repository is clean and ready for a separately authorized publication.
<!-- SECTION:PLAN:END -->
