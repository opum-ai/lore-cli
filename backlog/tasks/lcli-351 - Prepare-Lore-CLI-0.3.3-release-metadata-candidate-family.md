---
id: LCLI-351
title: Prepare Lore CLI 0.3.3 release metadata (candidate family)
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-26 01:00'
updated_date: '2026-08-26 23:12'
labels: []
dependencies: []
type: task
ordinal: 471000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 All seven package manifests and root exact optional dependency pins use 0.3.3; #2 CHANGELOG and release-truth documentation record the 0.3.3 candidate including the LCLI-348 manifest-kind fix; #3 Complete installable candidate family built from the corrected commit: six platform binaries + root/platform tarballs, each digested, host binary self-reports 0.3.3 and passes the agent-list contract smoke in a fresh staged prefix; #4 No npm publish, no tag, no merge or promotion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bump root package.json, six npm/<platform>/package.json, bun.lock pins to 0.3.3. 2. CHANGELOG [0.3.3] entry + release-truth candidate section. 3. Build six cross-target binaries via benchmark/ladybug/package-build.ts; npm pack root and platform packages. 4. Stage fresh prefix install with launcher+platform binary; run --version and agent list contract smoke. 5. Digest all artifacts; focused checks; two-axis review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Composite AC#1 verified in its four clauses during audit 8a71a8b0ac14473ba15ba02ed449fed3 on a4322b7: (clause 1) node-checked all seven manifests and root exact optional-dependency pins at 0.3.3; (clause 2) CHANGELOG [0.3.3] records the LCLI-350 manifest-kind fix and docs/reference/lore-cli-release-truth.md now pins the exact corrected binding (commit 6fdb8fa); (clause 3) complete installable candidate family rebuilt from the corrected commit into /tmp/lore-0.3.3-family-a4322b7 - six cross-target binaries via benchmark/ladybug/package-build.ts, root+platform tarballs packed, digested by manifest v1 sha256 745628def534bd76375916c9b3ca57ecf967e3b2000ed5edb6047e959ebbc746, host binary self-reports 0.3.3, fresh-prefix install smoke ran --version 0.3.3 plus agent-list contract smoke with kind agent.profiles exit 0; (clause 4) no npm publish, tag, merge, or promotion attempted.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prepared the Lore CLI 0.3.3 release-metadata candidate family: aligned all seven package manifests and exact optional-dependency pins at 0.3.3, recorded the candidate in CHANGELOG and the release-truth concept including the LCLI-350 manifest-kind repair, rebuilt and digest-staged the complete installable family from corrected source tip a4322b71df3afaa94e1d1065934513dd34683fa6 (manifest sha256 745628def534bd76375916c9b3ca57ecf967e3b2000ed5edb6047e959ebbc746, superseding pre-fix staging d3c45374…), verified pinned-runtime gates 2662 pass / 0 fail / 1 skip plus strict lore validate/check over 75 bundle files, and exercised fresh-prefix install with launcher plus host platform tarball. No npm publish, tag, or promotion was attempted; publication remains blocked on ODOC-63.7 owner credential.
<!-- SECTION:FINAL_SUMMARY:END -->
