---
id: LORE-23
title: 'reconcile.ts: status rollup'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-07-02 13:19'
labels:
  - core
milestone: m-3
dependencies:
  - LORE-21
documentation:
  - docs/adr/0009-story-task-coupling-reconciliation.md
priority: high
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Roll task statuses up into Story status using the status set read from Backlog config (not hardcoded).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Custom Backlog statuses map correctly
- [x] #2 Narrative-only docs keep authored status
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/reconcile.ts (pure, no fs/spawn/clock): export reconcileStatus(taskStatuses: readonly string[], statusFlow: readonly string[]): "todo"|"in-progress"|"done"|null.
   - statusFlow is the ordered config-driven set (backlog/config.yml `statuses:`), index 0 = not-started, last = terminal; reading the config file is a command-layer concern (LORE-24+), not this engine's.
   - No linked tasks (taskStatuses.length === 0) -> return null (caller leaves the doc's authored `status` untouched; narrative-only docs never forced into a workflow state, AC#2).
   - Per-task classification via statusFlow.indexOf(status): index 0 -> not-started, index length-1 -> terminal, else -> active. A status not found in statusFlow -> fail-loud LoreError("validation") naming the task status and the flow (ADR-0009: "must report rather than guess").
   - Guard the flow itself: empty statusFlow or duplicate entries -> fail-loud LoreError("validation") (ambiguous ordering, same ADR clause).
   - Rollup by elimination: every task terminal -> "done"; else any task active -> "in-progress"; else -> "todo". This is the literal cli-contract §3.2 rule, including the corner case where a Done+To-Do-only mix (no task in an explicit mid-flow status) rolls up to "todo" rather than "in-progress" -- recorded as an implementation note, not treated as a bug.
2. test/reconcile.test.ts: AC#1 with a custom 5-status flow (To Do/In Progress/Review/Testing/Done) proving classification is config-driven, not hardcoded to the 3 defaults; AC#2 for the no-tasks -> null case; unrecognized-status and degenerate-flow fail-loud LoreError cases; the elimination corner case above.
3. Not wired into cli.ts (LORE-24's job). Record the corner-case decision in task notes.
4. Feature branch feat/lore-23-reconcile off dev -> PR into dev per lore workflow.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/core/reconcile.ts: pure reconcileStatus(taskStatuses, statusFlow) per ADR-0009 §3 / cli-contract §3.2. No linked tasks -> null (caller leaves authored status, AC#2). Per-task classification by index in the caller-supplied ordered statusFlow (first=not-started, last=terminal, middle=active) -- config-driven, never hardcoded to the 3 Backlog defaults (AC#1, covered by a 5-state custom-flow test). Fail-loud LoreError(validation, exit 6) on: a task status absent from the flow, an empty flow, or a duplicate flow entry -- all per ADR-0009's "must report rather than guess."

Design note (non-obvious, worth flagging for LORE-24 review): the rollup is elimination-based exactly as cli-contract §3.2 states it, which produces one corner case -- a Story linking only a Done task and a To Do task (no task in an explicit mid-flow active status) rolls up to "todo", not "in-progress", because "in-progress" is defined purely by the presence of an active-state task, not by partial completion among terminal/not-started tasks. Implemented literally per the ADR; test/reconcile.test.ts documents this case explicitly (not treated as a bug).

Reading backlog/config.yml (YAML -> ordered statusFlow) and resolving each linked task's live status are explicitly OUT of scope here -- command-layer concerns for LORE-24, which will need a way to obtain the config-driven status list (no existing adapter method reads backlog config; adapter.ts currently only covers task list/view/search/create/edit).

15/15 tests pass (test/reconcile.test.ts); typecheck clean; full suite 1088/1088 pass; biome clean on both new files. Not wired into cli.ts (LORE-24's job per the task description).

/code-review (max) on PR #34 (4 confirmed findings). FIXED in-PR:
- (correctness) classify() checked terminal before not-started, so a single-entry statusFlow (e.g. ["To Do"]) always classified as terminal -- any project with a 1-status backlog config silently reconciled every doc to "done". validateStatusFlow now requires >=2 entries; regression test added (reconcileStatus(["To Do"], ["To Do"]) empirically reproduced "done" before the fix, throws validation after).
- (docs) citations said "cli-contract §3.1/§3.2"; the normative source is the DIFFERENT doc docs/reference/backlog-cli-contract.md (bare "cli-contract" is already used elsewhere, validate.ts, for docs/reference/cli-contract.md's unrelated §4.1). Fixed in reconcile.ts + reconcile.test.ts.

DEFERRED (scope question raised to the user, not silently expanded):
- (design gap) src/config.ts (LORE-10) already ships `[reconcile.overrides]` (Readonly<Record<string,string>>, a Backlog status name -> a rollup status string) with a doc comment assigning its semantics to "reconcile.ts (LORE-23)". reconcileStatus never reads it -- an override like "Won't Do" -> "done" can never take effect, since "Won't Do" isn't literally in statusFlow and hits the unrecognized-status fail-loud path instead. ADR-0009 §3 (this task's Documentation link, Accepted) defines reconciliation purely by ordered-flow position and never mentions an override map at all, so the override's intended semantics (does it bypass the flow-position check? is the override target added to the flow only for override purposes?) are underspecified by the authoritative spec. Not implemented here pending a design decision -- ADR-0009 amendment or a LORE-24+ follow-up task.
- (cleanup) test/reconcile.test.ts's loreError() duplicates test/managed-block.test.ts's helper verbatim (same pattern already drifted across 5+ other test files: replace/new/rename/supersede's expectError, backlog-adapter's async loreError). Consolidating into test/helpers.ts is real DRY but touches files outside this task's scope, same rationale as LORE-22's deferred offsetsOf/cell dedup.

Gates after fixes: typecheck clean; biome clean; 16/16 reconcile tests pass; full suite 1089/1089.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/core/reconcile.ts + test/reconcile.test.ts land the pure status-rollup engine: reconcileStatus(taskStatuses, statusFlow) classifies each linked task by its position in the caller-supplied, config-driven ordered status flow (first=not-started, last=terminal, middle=active) and rolls up by elimination (all-terminal->done; any-active->in-progress; else->todo), returning null when there are no linked tasks so a narrative-only doc's authored status is never overwritten (AC#2). AC#1 (custom statuses map correctly) is proven with a 5-state flow, not just the 3 defaults. Fails loud (LoreError validation, exit 6) on a task status absent from the flow or a degenerate (empty/duplicate) flow, per ADR-0009's 'must report rather than guess.' Both ACs checked; 15/15 new tests pass, full suite 1088/1088, typecheck and lint clean. Engine only -- not wired into cli.ts (LORE-24's job).
<!-- SECTION:FINAL_SUMMARY:END -->
