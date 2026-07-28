---
id: LORE-261
title: >-
  lore orphans: subtasks of a linked parent task are reported as orphans — no
  Backlog parent/subtask hierarchy awareness
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 02:08'
updated_date: '2026-07-25 17:23'
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
- [x] #1 A Backlog subtask whose parent task is linked to a doc is NOT reported as an orphan by 'lore orphans' (either via orphans understanding the parent/subtask relation, or via a documented link-cascade), verified on a bundle with linked-parent + unlinked-subtasks.
- [x] #2 The chosen mechanism (orphans-side hierarchy awareness vs link-side cascade vs documented behavior) is recorded with rationale; 'lore orphans' exit codes and the 'orphans.report' --json shape stay stable.
- [x] #3 A genuinely unlinked task (parent NOT linked) is still reported as an orphan — no false negatives introduced. Regression test covers linked-parent/unlinked-subtask and fully-unlinked cases.
- [x] #4 Full suite + lore check stay green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Design decision (AC#2): orphans-side hierarchy awareness, NOT a link-side cascade, NOT documented-only.
   Rationale: `src/adapters/backlog.ts`'s `BacklogTask`/`BacklogTaskDetail` already carry `parentTaskId`
   on EVERY task from a single `task list --json` (verified by reading the adapter) -- the exact
   snapshot `computeOrphans` already receives, so no extra per-task `view` call is needed and the
   "one snapshot, pure set arithmetic" design in orphans.ts's own docstring is preserved. A link-side
   cascade would require extra `editTask` writes at link time, go stale the moment a new subtask is
   added later (no retroactive doc: label), and misrepresent Backlog metadata (a subtask still wouldn't
   really carry a doc: back-ref). Orphans-side awareness recomputes fresh every run from live data, so
   it can never go stale and needs no write capability in a read-only report command. Exit codes and the
   orphans.report JSON shape stay byte-identical -- only which ids land in orphanTasks changes.

2. Implementation (src/commands/orphans.ts, computeOrphans):
   - Build `byId: Map<lowercased id, BacklogTask>` from the snapshot (already have `known`/`referenced`
     sets nearby).
   - Add `hasOwnedAncestor(task, referenced, byId)`: walk `task.parentTaskId` upward; a task is exempt
     if any ancestor is forward-referenced by a concept's `tasks:` OR itself carries a `doc:` label.
     Missing ancestor (not in snapshot -- deleted/archived) => no exemption (fail toward reporting, no
     false negatives). Visited-id set guards a corrupt/cyclic parent chain (return not-owned rather than
     looping forever).
   - `orphanTasks` filter becomes: `!referenced.has(id) && !hasDocLabel(task) && !hasOwnedAncestor(...)`.
   - No change to danglingLinks, envelope shape, sort order, or exit codes.

3. Regression tests (test/orphans.test.ts), both required by AC#3:
   - linked-parent + unlinked-subtask (via doc: label on parent, and separately via a concept
     forward-reference to the parent) => subtask NOT reported as orphan.
   - fully-unlinked parent + subtask (neither doc: label nor forward-ref anywhere) => subtask STILL
     reported as orphan (no false negative).
   - a subtask whose parent id isn't in the current snapshot at all => still orphan (no exemption from
     a vanished/archived ancestor).
   - cycle/self-referencing parentTaskId guard doesn't hang and doesn't wrongly exempt.
   - integration-level runOrphans test mirroring the linked-parent/unlinked-subtask case end to end.

4. Docs: update docs/reference/cli-surface.md's `orphans` section prose to describe the hierarchy-aware
   behavior (user-visible contract text) -- edited directly (prose, not a managed block/frontmatter
   field lore CLI owns), then `lore sync` / `lore check` to confirm the bundle stays coherent.

5. CHANGELOG.md: add an [Unreleased] entry per the house voice, naming LORE-261, describing the
   behavior change and citing the fixed false-positive count from the task's Meridian stress test.

6. docker/e2e/run-e2e.sh: grep for orphans assertions (phase 10, `orphans.ts`'s own TASK3 case) --
   TASK3 is a plain top-level task (`backlog task create` with no --parent), so parentTaskId is null
   and none of the 4 existing orphans assertions exercise or depend on hierarchy -- confirm none are
   invalidated; do not touch the file if so (cannot verify a new assertion without running the
   container this wave, which is reserved for the sibling LORE-260 worker).

7. Verify: bun test, bun run typecheck, bun run lint, bun run src/cli.ts check, live CLI runs on a
   real bundle proving both the exemption and the no-false-negative case, and a mutation check
   (git diff > patch; apply -R to revert the fix, confirm new tests fail; re-apply, confirm green) --
   never git stash.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test 2136/0 pass (baseline dev@b97ab87 was 2126/0; +10 new regression cases in test/orphans.test.ts). typecheck clean. lint clean (biome). lore check: 39 files, 0 errors/warnings (unchanged from baseline). Live CLI proof against a real backlog-backed lore bundle in scratchpad (TASK-1 parent linked to a Story via lore link; TASK-1.1/TASK-1.2 created with backlog task create --parent TASK-1; TASK-2 standalone/never linked): 'lore orphans --json' reported orphanTasks=[TASK-2] only (subtasks correctly exempted). After 'lore unlink stories/demo-story TASK-1' (fully unlinking the parent), the SAME rerun reported orphanTasks=[TASK-1, TASK-1.1, TASK-1.2, TASK-2] -- confirms AC#3 no-false-negatives: once the parent is genuinely unlinked, its subtasks reappear as orphans. Mutation check: reverted src/commands/orphans.ts via git diff>patch + git apply -R (never git stash), reran test/orphans.test.ts -> 5 new tests failed as expected (the hierarchy-awareness cases), 54 unrelated tests still passed; git apply restored the fix, reran -> 59/59 pass again.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Chose orphans-side hierarchy awareness (AC#2) over a link-side cascade or documented-only: computeOrphans (src/commands/orphans.ts) now walks a task's parentTaskId chain -- already present on every task in the SAME task-list --json snapshot orphans already reads (verified in src/adapters/backlog.ts's BacklogTask/BacklogTaskDetail) -- and exempts a subtask when any ancestor is forward-referenced by a concept's tasks: list or itself carries a doc: label, via a new hasOwnedAncestor() helper guarded against cyclic/self-referencing parent chains (visited-id set; fails toward 'still reported', never hangs). A link-side cascade was rejected because it would need extra editTask writes at link time and go stale the moment a new subtask is added later; orphans-side awareness recomputes fresh every run with no extra Backlog calls. orphans.report's --json shape and exit codes are byte-identical -- only which ids land in orphanTasks changed. Added 10 regression tests (test/orphans.test.ts) covering linked-parent/unlinked-subtask (both via doc: label and via forward-reference), a multi-level grandparent chain, a vanished/archived-ancestor case (no exemption), and cyclic/self-referencing parentTaskId data (no hang, no false exemption) plus the AC#3 fully-unlinked-still-reported case. Updated docs/reference/cli-surface.md's orphans entry to describe the hierarchy-aware scope, and added a CHANGELOG [Unreleased] entry. Verified: bun test 2136/0 (baseline 2126/0 dev@b97ab87), typecheck clean, lint clean, lore check 39 files/0 errors/0 warnings. Live-verified against a real backlog-backed bundle (see implementation notes) proving both the exemption and the no-false-negative case, plus a mutation check (revert via git apply -R, not git stash) reproducing 5 genuine test failures before restoring green. docker/e2e/run-e2e.sh's 4 existing orphans assertions (phase 10) all key off TASK3, a plain top-level task created with no --parent, so parentTaskId is null and none are invalidated by this change -- left untouched, not run (reserved for the sibling LORE-260 worker this wave).
<!-- SECTION:FINAL_SUMMARY:END -->
