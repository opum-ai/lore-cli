---
id: LCLI-283.2.2
title: Build the static graph explorer and CLI entrypoint
status: To Do
assignee: []
created_date: '2026-07-30 13:33'
updated_date: '2026-07-30 14:40'
labels:
  - graph-explorer
  - frontend
  - cli
milestone: m-14
dependencies:
  - LCLI-283.2.1
  - LCLI-283.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.2
priority: high
type: task
ordinal: 393000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generate and open an offline-capable Lore graph explorer from the stable indexed projection, with a deterministic static artifact and a constrained local entrypoint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The CLI produces a deterministic self-contained or clearly versioned static explorer artifact without mutating source documentation
- [ ] #2 The explorer implements search, type and status filters, node details, provenance, inbound and outbound highlighting, depth focus, dangling references, and supersession chains
- [ ] #3 Static mode makes no network requests and live mode, if included, binds only to loopback with no write or arbitrary-query surface
- [ ] #4 Empty, single-node, cyclic, disconnected, duplicate-edge, Unicode, and large graph fixtures render correctly
<!-- AC:END -->
