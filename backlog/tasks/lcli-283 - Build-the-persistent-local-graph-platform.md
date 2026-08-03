---
id: LCLI-283
title: Build the persistent local graph platform
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:32'
updated_date: '2026-08-03 16:10'
labels:
  - local-graph
  - ladybugdb
  - roadmap
  - 'doc:stories/build-the-persistent-local-graph-platform'
dependencies: []
references:
  - docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/stories/build-the-persistent-local-graph-platform.md
priority: high
type: feature
ordinal: 385000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver the ordered post-MVP local graph roadmap: first a deterministic persistent LadybugDB projection for indexing, performance, and scale; next a local graph explorer; then bounded capabilities enabled by the indexed graph. Keep the local MCP transport explicitly on hold and outside this dependency chain.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 LadybugDB indexing ships first while Git repositories remain the source of truth and current CLI contracts remain deterministic
- [x] #2 The local graph explorer depends on the completed persistent-index milestone
- [x] #3 LadybugDB-enabled graph capabilities depend on the completed explorer milestone and retain repository, commit, and source provenance
- [x] #4 The local MCP task remains on hold, unscheduled, and is not a dependency of the local graph roadmap
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify LCLI-283.1, LCLI-283.2, and LCLI-283.3 are Done with checked criteria and integrated delivery evidence. 2. Map the roadmap acceptance criteria to the ordered persistent-index, explorer, and bounded-capability parent evidence. 3. Confirm the deferred local MCP task remains explicitly on hold and outside the roadmap dependency chain. 4. Record cumulative verification, check the parent criteria, and settle LCLI-283 terminally.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Roadmap parent settlement evidence on integrated dev 4e016fadeb9a2435781a027d134608e3ef519096: LCLI-283.1, LCLI-283.2, and LCLI-283.3 are Done with every parent acceptance criterion checked and their child delivery evidence integrated. The dependency order is preserved: persistent LadybugDB indexing shipped before the explorer, and graph/workspace/path/impact/change/provenance capabilities depend on the completed explorer. Git remains authoritative; contracts are deterministic and source provenance is retained. LCLI-42 is still explicitly To Do with deferred/on-hold labels, is unscheduled by description, and is not a dependency of LCLI-283. Latest cumulative verification passed 2,425 tests/8,008 expectations, lint, typecheck, compiled build, 18 browser tests, strict Lore gates, and PR #289/#290 eight-job CI matrices.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the ordered persistent local graph roadmap: deterministic rebuildable LadybugDB indexing while Git remains authoritative, a dependency-gated offline local graph explorer, and bounded workspace retrieval/traversal/change/provenance capabilities with complete repository/commit/export/source evidence. All three child parents and their twelve executable leaves are Done and integrated; cumulative verification passed 2,425 tests, build/lint/typecheck, 18 browser tests, strict Lore gates, and the terminal eight-job CI matrices. The local MCP transport remains explicitly deferred and outside this roadmap.
<!-- SECTION:FINAL_SUMMARY:END -->
