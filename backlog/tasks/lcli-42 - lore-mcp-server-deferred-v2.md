---
id: LCLI-42
title: lore mcp server (deferred v2)
status: To Do
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - deferred
  - mcp
milestone: m-7
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
DEFERRED: stdio MCP transport over the same core; tools + resources; structuredContent on success reads reusing the --json serializer. Secondary to the CLI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tools/resources reuse core (no logic duplication)
- [ ] #2 Reads populate structuredContent
<!-- AC:END -->
