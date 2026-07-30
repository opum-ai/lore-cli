---
id: LCLI-283.2
title: Ship the local graph explorer
status: To Do
assignee: []
created_date: '2026-07-30 13:33'
labels:
  - graph-explorer
  - local-graph
  - visualization
milestone: m-14
dependencies:
  - LCLI-283.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283
priority: high
type: feature
ordinal: 391000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Lore-specific, read-only local graph explorer after the persistent-index milestone so users can navigate authored concepts, tasks, relationships, provenance, and graph health without a hosted service.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The explorer consumes a stable Lore projection contract and never reads or writes LadybugDB through browser-supplied Cypher
- [ ] #2 Users can search and filter nodes, inspect details and provenance, follow inbound and outbound relationships, and identify dangling and supersession states
- [ ] #3 A deterministic static snapshot works fully offline and a loopback-only live mode may refresh from the same contract
- [ ] #4 Accessible keyboard navigation, responsive layouts, bounded rendering, and large-fixture performance gates pass
<!-- AC:END -->
