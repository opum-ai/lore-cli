---
type: Story
title: Track Lore CLI tracker-backend integration
summary: Define the scoped ownership record for Lore CLI tracker-backend work and its existing Backlog lineage.
timestamp: 2026-08-14T10:59:51.349Z
status: todo
tasks:
  - lcli-315
  - lcli-333
---

# Track Lore CLI tracker-backend integration

## Goal

Keep the planned tracker-backend initiative attached to a truthful, local
ownership record. This Story records the adapter, JIRA, initialization, and
Quest-backend task lineage. Quest publication and its default-adapter policy
are established by objective quest-cli release evidence and the recorded
product decision; this Story does not itself publish either package or release.

## Acceptance criteria

- The tracker-backend parent task has one scoped Story owner.
- Existing Backlog.md behavior remains the documented baseline until a later,
  evidence-backed implementation decision changes it.
- Quest package and registry availability continue to be established by
  quest-cli's shipping evidence rather than this Story.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-315](../../backlog/tasks/lcli-315%20-%20Pluggable-tracker-backends-choose-the-issue-tracker-instead-of-hardcoding-Backlog.md.md) | Pluggable tracker backends: choose the issue tracker instead of hardcoding Backlog.md | To Do |
| [LCLI-333](../../backlog/tasks/lcli-333%20-%20Release-Lore-with-Quest-as-the-default-tracker-backend.md) | Release Lore with Quest as the default tracker backend | To Do |
<!-- lore:tasks:end -->

## Notes

The live component boundary and release constraints are recorded in the
[Lore CLI documentation ownership record](../reference/lore-cli-documentation-ownership.md)
and [Lore CLI release truth](../reference/lore-cli-release-truth.md). The
subtasks may be planned and coupled here while remaining open; this Story does
not authorize their implementation or closure.
