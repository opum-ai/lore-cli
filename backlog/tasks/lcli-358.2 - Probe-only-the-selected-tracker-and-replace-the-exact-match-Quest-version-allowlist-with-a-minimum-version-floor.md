---
id: LCLI-358.2
title: Probe only the tracker that was actually selected
status: To Do
assignee: []
created_date: '2026-08-28 21:46'
updated_date: '2026-08-28 21:48'
labels:
  - init
  - tracker
  - quest
  - bug
dependencies:
  - LCLI-356
parent_task_id: LCLI-358
ordinal: 481000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/commands/init.ts:594's probeBacklogCapability builds the adapter with a hardcoded `backend: "backlog"`, with a comment declaring this intentional even when the selected backend is Jira. Reproduced with a scripted prompter on 2026-08-28: choosing Quest still prints

    warning: backlog coupling unavailable: The `backlog` binary supports --json, but no Backlog.md project is initialized in this directory; run `backlog init` to initialize one.

The user selected Quest and is told Backlog is broken. The same path fires non-interactively through finishNonInteractive's shouldCheckBacklog, which gates on `parsed.tracker !== "none"` and then probes Backlog regardless.

The Quest version-gate half of this problem is tracked separately in LCLI-356 (the exact-match SUPPORTED_QUEST_VERSIONS allowlist rejecting the shipped 0.2.9), which also covers the late-gate ordering. This subtask is only the wrong-tracker probe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The init capability probe uses the tracker actually selected for this bundle; no other tracker's binary is spawned or diagnosed
- [ ] #2 Quest version acceptance is a minimum-version comparison, so 0.2.9 and later 0.2.x releases pass
- [ ] #3 A Quest older than the floor still fails loud, with a hint naming the minimum version rather than an allowlist
- [ ] #4 The Quest 0.2.7 hint strings in tracker-migration.ts and tracker-cutover.ts follow the same floor
- [ ] #5 The init capability probe uses the tracker actually selected for this bundle
- [ ] #6 No other tracker's binary is spawned, and no other tracker's diagnostic is emitted, for a given selection
- [ ] #7 Selecting none runs no tracker probe at all
<!-- AC:END -->
