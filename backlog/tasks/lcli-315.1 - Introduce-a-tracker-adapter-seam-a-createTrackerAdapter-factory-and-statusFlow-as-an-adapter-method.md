---
id: LCLI-315.1
title: >-
  Introduce a tracker-adapter seam: a createTrackerAdapter factory and
  statusFlow as an adapter method
status: To Do
assignee: []
created_date: '2026-08-04 21:49'
labels: []
dependencies: []
documentation:
  - docs/reference/backlog-cli-contract.md
parent_task_id: LCLI-315
priority: high
type: enhancement
ordinal: 435000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Precondition for every other backend. Today the tracker is not abstracted at all, so adding one is not a matter of writing a second adapter — the construction sites have to stop naming Backlog.md.

Two concrete changes:

1. Route construction through a single `createTrackerAdapter(root, config)` factory. Four sites construct the Backlog adapter directly and must move behind it: `src/commands/link.ts:558`, `src/commands/export.ts:34`, `src/core/ladybug-source.ts:182`, `src/core/ladybug-source.ts:338`. Each already accepts an injected `options.adapter` for tests, so the injection seam exists; only the default construction changes.

2. Promote `readStatusFlow` from a free function to an adapter method (`statusFlow()`). It currently reads Backlog's own `backlog/config.yml` off disk (`src/adapters/backlog.ts:1021,1059`) and is called from `src/commands/reconcile-shared.ts:106`. Left as a free function, a backend switch would not reach it and reconcile would keep asking Backlog.md for the status vocabulary of a JIRA project.

The existing `BacklogAdapter` interface (`src/adapters/backlog.ts:740`) is already backend-neutral in shape — `probe`, `listTasks`, `viewTask`, `searchByLabel`, `searchTasks`, `createTask`, `editTask`. Decide whether to rename it to `TrackerAdapter` or keep the name and let structural typing carry it; a rename touches many files and is worth doing once here rather than piecemeal later.

Preserve the adapter's existing hardening as interface-level obligations rather than Backlog-specific quirks: the fail-loud capability probe, the typed `LoreError` mapping on spawn rejection (LCLI-222), the bounded concurrency on per-task fan-out (LCLI-111, LCLI-235), and the id-mismatch verification after `viewTask` (LCLI-122, LCLI-125). A new backend that silently drops any of these would regress fixes that were each their own task.

This task ships no new backend. Backlog.md must remain the only reachable one when it lands, and its behavior must be byte-identical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A createTrackerAdapter(root, config) factory is the only place a concrete tracker adapter is constructed in non-test code
- [ ] #2 All four existing construction sites route through the factory and still accept an injected adapter for tests
- [ ] #3 statusFlow() is an adapter method and reconcile-shared.ts consumes it instead of the free readStatusFlow
- [ ] #4 The adapter interface is documented as the contract a backend must satisfy, including the probe, error-mapping, concurrency, and id-verification obligations
- [ ] #5 Backlog.md remains the default and only reachable backend after this task; behavior is unchanged
- [ ] #6 Existing tests pass unmodified except where the factory indirection requires a mechanical change
<!-- AC:END -->
