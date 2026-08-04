---
id: LCLI-313
title: Publish Lore CLI 0.1.1 from qualified release artifacts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 21:04'
labels:
  - release
  - publication
  - npm
  - security
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - .github/workflows/release.yml
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/runbooks/release-publishing.md
priority: high
type: task
ordinal: 426000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ship Lore CLI 0.1.1 from the exact verified main commit. Tag and qualify the seven-package release, bootstrap the new Windows ARM64 package, publish all platform packages before the root launcher through the explicitly authorized interactive path, verify public registry/install evidence, create the GitHub Release, and preserve LCLI-278 as the blocker for automated publish:true.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The immutable v0.1.1 tag resolves directly to the exact fully verified main commit
- [ ] #2 Release publish:false passes all blocking gates, qualifies all six matching hosts including Windows ARM64, and retains exactly seven 0.1.1 tarballs
- [ ] #3 All six platform packages are published public before @opum-ai/lore from the untouched qualified artifacts, without using Release publish:true
- [ ] #4 The new @opum-ai/lore-win32-arm64 package has the intended Trusted Publisher and the existing package trust relationships remain valid
- [ ] #5 Anonymous registry metadata and a clean install confirm all seven 0.1.1 packages are public and the installed CLI reports 0.1.1
- [ ] #6 A non-draft v0.1.1 GitHub Release and synchronized release truth, Story, task, and campaign evidence record the publication while LCLI-278 remains open
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ground the exact main commit, registry/tag/release absence, live release controls, npm authentication, and prior release procedure. 2. Tag and push v0.1.1, dispatch Release with publish=false on the tag, require every blocking qualification/package job to pass, and download the retained artifacts. 3. Verify exactly seven untouched tarballs, package metadata, checksums, and Windows ARM64 qualification evidence. 4. Re-authenticate interactively, publish absent platform packages first and the root launcher last from those exact artifacts, then configure/list the Windows ARM64 Trusted Publisher. 5. Verify anonymous registry metadata and a clean installed CLI, create the GitHub Release, update release truth through Lore, finalize the task/campaign, deliver the settlement, and prune temporary state.
<!-- SECTION:PLAN:END -->
