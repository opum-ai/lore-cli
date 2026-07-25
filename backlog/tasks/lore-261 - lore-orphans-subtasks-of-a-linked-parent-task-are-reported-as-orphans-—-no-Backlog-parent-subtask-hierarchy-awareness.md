---
id: LORE-261
title: >-
  lore orphans: subtasks of a linked parent task are reported as orphans — no
  Backlog parent/subtask hierarchy awareness
status: To Do
assignee: []
created_date: '2026-07-25 02:08'
labels:
  - cli-ux
  - cmd-meta-a
  - adapter-backlog
dependencies: []
references:
  - src/commands/orphans.ts
priority: low
type: enhancement
ordinal: 363000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
'lore orphans' should not report a Backlog subtask as an orphan when its PARENT task is already linked to a doc — or 'lore link' should offer to cover a parent's subtasks — so a correctly-coupled Story doesn't produce false-positive orphans.

## Observed (Meridian 56-concept/40-task stress test)
'lore orphans' first reported **8** orphaned tasks instead of the intended **2**. Root cause: linking a PARENT task to a Story via 'lore link' does NOT cover that parent's subtasks — each subtask carries no 'doc:' back-ref of its own, so 'lore orphans' (which reports every task with no owning doc) flags it. Worked around by running 'lore link' explicitly for the 3 subtask pairs; then orphans correctly reported 2.

## Why it matters
Backlog has real parent/subtask relationships. Treating a subtask as 'unowned' when its parent is clearly owned is a false positive that trains users to ignore orphan reports, and forces per-subtask linking busywork. This is the second-largest friction after message consistency in the e2e pass.

## Direction (decide in plan)
- orphans-side: consider a subtask NOT orphaned when its parent task has a 'doc:' back-ref (walk the parent/subtask relation the --json adapter already exposes), OR
- link-side: a cascade option so 'lore link <story> <parent>' also links the parent's subtasks, OR
- at minimum, document the behavior in the coupling runbook so it is expected.
Whichever is chosen must keep 'lore orphans' exit codes and the --json 'orphans.report' shape stable.

## Refs
src/commands/orphans.ts, src/commands/reconcile-shared.ts (rollup fan-out), src/adapters/backlog.ts (task fields incl. parent), docs/adr/0009-story-task-coupling-reconciliation.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Backlog subtask whose parent task is linked to a doc is NOT reported as an orphan by 'lore orphans' (either via orphans understanding the parent/subtask relation, or via a documented link-cascade), verified on a bundle with linked-parent + unlinked-subtasks.
- [ ] #2 The chosen mechanism (orphans-side hierarchy awareness vs link-side cascade vs documented behavior) is recorded with rationale; 'lore orphans' exit codes and the 'orphans.report' --json shape stay stable.
- [ ] #3 A genuinely unlinked task (parent NOT linked) is still reported as an orphan — no false negatives introduced. Regression test covers linked-parent/unlinked-subtask and fully-unlinked cases.
- [ ] #4 Full suite + lore check stay green.
<!-- AC:END -->
