---
id: LCLI-42
title: Local lore MCP server (on hold)
status: To Do
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-30 13:29'
labels:
  - deferred
  - mcp
  - on-hold
milestone: m-10
dependencies:
  - LCLI-21
  - LCLI-28
documentation:
  - docs/reference/mcp-tools.md
  - docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md
priority: low
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ON HOLD and unscheduled. Retain the local stdio MCP transport design as a thin wrapper over the same core functions, but do not implement it until explicitly reactivated after LadybugDB persistent indexing, the local graph explorer, and LadybugDB-enabled graph capabilities.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tools/resources reuse core (no logic duplication)
- [ ] #2 Reads populate structuredContent
<!-- AC:END -->
