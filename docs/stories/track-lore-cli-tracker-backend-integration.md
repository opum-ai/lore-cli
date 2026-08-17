---
type: Story
title: Track Lore CLI tracker-backend integration
summary: Define the scoped ownership record for Lore CLI tracker-backend work and its existing Backlog lineage.
timestamp: 2026-08-14T10:59:51.349Z
status: todo
tasks:
  - lcli-315
---

# Track Lore CLI tracker-backend integration

## Goal

Keep the planned tracker-backend initiative attached to a truthful, local
ownership record. This Story records the adapter, JIRA, initialization, and
Quest-backend task lineage. LCLI-315.4 targets the explicitly authorized,
locally installed Quest `0.2.0` release candidate and owns Lore's migration and
default-selection policy. That qualification is local evidence, not a claim
that the candidate is publicly released.

## Acceptance criteria

- The tracker-backend parent task has one scoped Story owner.
- Existing Backlog.md bundles remain pinned or fail loud until a non-lossy
  migration decision changes their backend explicitly.
- Quest package and registry availability continue to be established by
  quest-cli's shipping evidence rather than this Story; Lore consumes the
  verified installed `0.2.0` RC contract and must recheck later builds
  independently.
- Quest's current `T-<positive integer>` canonical-ID restriction and lack of
  alias writes block ordinary `LCLI-*`/`TASK-*` Backlog migration until either
  an explicit reference-rewrite policy or upstream ID-preservation support is
  approved.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-315](../../backlog/tasks/lcli-315%20-%20Pluggable-tracker-backends-choose-the-issue-tracker-instead-of-hardcoding-Backlog.md.md) | Pluggable tracker backends: choose the issue tracker instead of hardcoding Backlog.md | To Do |
<!-- lore:tasks:end -->

## Notes

The live component boundary and release constraints are recorded in the
[Lore CLI documentation ownership record](../reference/lore-cli-documentation-ownership.md)
and [Lore CLI release truth](../reference/lore-cli-release-truth.md). The
subtasks may be planned and coupled here while remaining open; this Story does
not authorize their implementation or closure.
