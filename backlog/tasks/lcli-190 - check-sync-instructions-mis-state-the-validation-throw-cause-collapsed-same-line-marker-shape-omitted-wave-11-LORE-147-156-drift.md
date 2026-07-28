---
id: LCLI-190
title: >-
  check/sync instructions mis-state the validation throw cause; collapsed
  same-line marker shape omitted (wave-11 LCLI-147/156 drift)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:28'
labels:
  - codex-review-followup
  - core-engine-b
dependencies: []
priority: medium
type: bug
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CHECK instructions topic (src/core/instructions.ts, prose rewritten by LCLI-147 in wave 11) attributes lore checks `validation` (exit 6) throw solely to "a malformed status flow or override in the reconcile config, thrown before any task resolution." Both halves are false: reconcileDriftFindings -> regenerateTaskBlock (src/core/check.ts:488) also throws `validation` for corrupted managed-block markers, captured (commands/check.ts:531-535) and re-thrown AFTER the report emits (commands/check.ts:195-197, 236-238) — per-concept, after task resolution. LCLI-156 (same wave) widened this exact throw with a new malformed shape (collapsed same-line marker pair, managed-block.ts:251-256). Also: the SYNC topic (instructions.ts:77-78) and the check.ts:454 docstring list marker-corruption shapes as "missing, duplicated, or crossed" and omit the collapsed same-line pair; and the SYNC topics --json prose (instructions.ts:71-73) does not mention LCLI-150s new orphanedIndexes field. Wave-11 integration-review finding (medium).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CHECK instructions validation-cause prose corrected to include corrupted managed-block markers as a cause and to drop the false "before any task resolution" timing claim
- [x] #2 SYNC topic (instructions.ts) and the check.ts:454 docstring marker-corruption shape list include the collapsed same-line marker pair
- [x] #3 SYNC topic --json prose mentions LCLI-150s orphanedIndexes (reported-but-not-written) field
- [x] #4 test/instructions.test.ts asserts the CHECK topic body reflects the managed-block/marker validation cause (discriminating against the current prose)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify claims against real code: check.ts regenerateTaskBlock call (~488)/reconcileDriftFindings throw+catch+re-throw sites in commands/check.ts (~195-197/236-238), managed-block.ts's LCLI-156 collapsed-marker malformed check, sync.ts's LCLI-150 orphanedIndexes field, reconcile-shared.ts's gatherReconciliation config-validation timing. 2. Edit instructions.ts CHECK topic: name managed-block-marker corruption as a second validation cause with correct per-cause timing (config validation is genuinely pre-task-resolution; marker corruption is per-concept, post-task-resolution) instead of one false blanket timing claim. 3. Edit instructions.ts SYNC topic: add collapsed same-line marker pair to the marker-shape list; add orphanedIndexes to the --json prose. 4. Edit check.ts:454 docstring to add the collapsed same-line shape. 5. Add a discriminating test in instructions.test.ts asserting the new CHECK prose and absence of the old false claim; prove it fails pre-fix via git stash, then restore. 6. Run typecheck + full test suite + biome check on touched files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified all claims against real code before editing: check.ts's tryConceptsForBundle (parseConcept via concept.ts) throws validation per-file during the up-front eligibility scan for a tasks:-linked concept with malformed frontmatter, re-thrown only after the report emits (combined with drift results via computeDriftFindings); reconcile.ts's classify throws validation for a resolved task whose live status is in neither the configured statusFlow nor overrides, discovered only after that task's detail is resolved (reconcile-shared.ts's gatherReconciliation); resolveReconcileConfig's own doc comment confirms the status-flow/override config-parsing cause genuinely IS pre-task-resolution; and reconcileDriftFindings's regenerateTaskBlock call throws validation for corrupted managed-block markers, per-concept, after that concept's own tasks are already resolved (caught+re-thrown in commands/check.ts after emit). Corrected instructions.ts's CHECK topic to a non-exhaustive enumeration naming all four causes with accurate per-cause timing, replacing the prior false "two distinct causes with two different timings" framing raised by Fable review (HIGH finding: that framing omitted the malformed-frontmatter and out-of-flow-status causes and wrongly implied exhaustiveness). Added collapsed same-line marker pair to SYNC topic + check.ts:454 docstring (LCLI-156). Added orphanedIndexes mention to SYNC topic's --json prose (LCLI-150, sync.ts SyncReport.orphanedIndexes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected wave-11 drift, then a Fable-review follow-up fix, in src/core/instructions.ts + src/core/check.ts docstring (docs/comments/tests only, no runtime logic changed): (1) CHECK topic's validation-cause paragraph now gives a non-exhaustive enumeration of validation's causes with accurate per-cause timing -- reconcile-config parsing (pre-task-resolution, per resolveReconcileConfig's own doc comment), malformed frontmatter on a tasks:-linked concept (caught pre-task-resolution during the per-file eligibility scan, but re-thrown only after the report emits), a resolved task's live status outside the configured flow/overrides (post-task-resolution, reconcile.ts's classify), and corrupted managed-block markers (per-concept, post-task-resolution, reconcileDriftFindings's regenerateTaskBlock) -- replacing both the original false blanket "thrown before any task resolution" claim AND a follow-up false-exhaustiveness claim ("two distinct causes with two different timings") that a Fable review flagged as HIGH for omitting two more reachable causes; exit-code/type set (usage/not_found/denied/validation) unchanged. (2) SYNC topic body and check.ts:454 docstring's marker-corruption shape lists both now include LCLI-156's collapsed same-line begin/end pair alongside missing/duplicated/crossed. (3) SYNC topic's --json prose now mentions orphanedIndexes (LCLI-150: stale on-disk index.md dirs, reported but left untouched, never auto-written/removed). (4) test/instructions.test.ts asserts the CHECK prose names the managed-block-marker cause and its post-resolution timing, and the absence of the old false blanket claim; anchors verified to survive the Fable-fix rewrite. Verified: bun run typecheck clean; bun test 1845 pass / 0 fail; biome check clean on src/core/instructions.ts; eyeballed rendered check/sync topics via bun run src/cli.ts instructions <topic> --plain.
<!-- SECTION:FINAL_SUMMARY:END -->
