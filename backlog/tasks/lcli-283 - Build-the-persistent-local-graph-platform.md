---
id: LCLI-283
title: Build the persistent local graph platform
status: To Do
assignee: []
created_date: '2026-07-30 13:32'
labels:
  - local-graph
  - ladybugdb
  - roadmap
dependencies: []
references:
  - docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
documentation:
  - docs/specs/local-graph-platform-roadmap.md
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
- [ ] #1 LadybugDB indexing ships first while Git repositories remain the source of truth and current CLI contracts remain deterministic
- [ ] #2 The local graph explorer depends on the completed persistent-index milestone
- [ ] #3 LadybugDB-enabled graph capabilities depend on the completed explorer milestone and retain repository, commit, and source provenance
- [ ] #4 The local MCP task remains on hold, unscheduled, and is not a dependency of the local graph roadmap
<!-- AC:END -->
