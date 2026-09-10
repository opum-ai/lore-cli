---
type: Story
title: Hold deferred Lore capabilities
tags:
  - deferred
  - mcp
  - confluence
  - library
summary: Keep explicitly deferred MCP, Confluence, and importable-library capabilities visible without activating them.
timestamp: 2026-08-03T16:05:06.747Z
status: todo
tasks:
  - lcli-42
  - lcli-43
  - lcli-44
  - lcli-45
---

# Hold deferred Lore capabilities

## Goal

Keep the local MCP transport, Confluence publishing, production mirroring, and
typed importable-library work discoverable without treating an old plan as
authorization to reactivate it.

## Acceptance criteria

- Deferred tasks remain in their live Backlog status with existing acceptance
  history unchanged.
- No task is activated solely because it appears in this Story.
- Current architecture and release entry points identify these capabilities as
  deferred.
- A future session requires an explicit product decision before execution.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-42](../../.quest/tasks/LCLI-42.json) | Local lore MCP server (on hold) | To Do |
| [LCLI-43](../../.quest/tasks/LCLI-43.json) | Confluence one-way publish adapter (deferred) | To Do |
| [LCLI-44](../../.quest/tasks/LCLI-44.json) | Confluence production mirror (deferred) | To Do |
| [LCLI-45](../../.quest/tasks/LCLI-45.json) | [Deferred] Typed importable library build (.d.ts + subpath exports) | To Do |
<!-- lore:tasks:end -->

## Notes

The task table is an ownership rollup, not an executable queue. Read each live
task and its dependencies before proposing reactivation.
