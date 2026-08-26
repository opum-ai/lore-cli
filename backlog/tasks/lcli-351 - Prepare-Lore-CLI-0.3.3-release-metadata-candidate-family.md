---
id: LCLI-351
title: Prepare Lore CLI 0.3.3 release metadata (candidate family)
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-26 01:00'
updated_date: '2026-08-26 01:00'
labels: []
dependencies: []
type: task
ordinal: 471000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 All seven package manifests and root exact optional dependency pins use 0.3.3; #2 CHANGELOG and release-truth documentation record the 0.3.3 candidate including the LCLI-348 manifest-kind fix; #3 Complete installable candidate family built from the corrected commit: six platform binaries + root/platform tarballs, each digested, host binary self-reports 0.3.3 and passes the agent-list contract smoke in a fresh staged prefix; #4 No npm publish, no tag, no merge or promotion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bump root package.json, six npm/<platform>/package.json, bun.lock pins to 0.3.3. 2. CHANGELOG [0.3.3] entry + release-truth candidate section. 3. Build six cross-target binaries via benchmark/ladybug/package-build.ts; npm pack root and platform packages. 4. Stage fresh prefix install with launcher+platform binary; run --version and agent list contract smoke. 5. Digest all artifacts; focused checks; two-axis review.
<!-- SECTION:PLAN:END -->
