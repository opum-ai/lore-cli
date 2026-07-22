---
id: LORE-190
title: >-
  check/sync instructions mis-state the validation throw cause; collapsed
  same-line marker shape omitted (wave-11 LORE-147/156 drift)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 23:19'
updated_date: '2026-07-22 23:24'
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
The CHECK instructions topic (src/core/instructions.ts, prose rewritten by LORE-147 in wave 11) attributes lore checks `validation` (exit 6) throw solely to "a malformed status flow or override in the reconcile config, thrown before any task resolution." Both halves are false: reconcileDriftFindings -> regenerateTaskBlock (src/core/check.ts:488) also throws `validation` for corrupted managed-block markers, captured (commands/check.ts:531-535) and re-thrown AFTER the report emits (commands/check.ts:195-197, 236-238) — per-concept, after task resolution. LORE-156 (same wave) widened this exact throw with a new malformed shape (collapsed same-line marker pair, managed-block.ts:251-256). Also: the SYNC topic (instructions.ts:77-78) and the check.ts:454 docstring list marker-corruption shapes as "missing, duplicated, or crossed" and omit the collapsed same-line pair; and the SYNC topics --json prose (instructions.ts:71-73) does not mention LORE-150s new orphanedIndexes field. Wave-11 integration-review finding (medium).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CHECK instructions validation-cause prose corrected to include corrupted managed-block markers as a cause and to drop the false "before any task resolution" timing claim
- [x] #2 SYNC topic (instructions.ts) and the check.ts:454 docstring marker-corruption shape list include the collapsed same-line marker pair
- [x] #3 SYNC topic --json prose mentions LORE-150s orphanedIndexes (reported-but-not-written) field
- [x] #4 test/instructions.test.ts asserts the CHECK topic body reflects the managed-block/marker validation cause (discriminating against the current prose)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify claims against real code: check.ts regenerateTaskBlock call (~488)/reconcileDriftFindings throw+catch+re-throw sites in commands/check.ts (~195-197/236-238), managed-block.ts's LORE-156 collapsed-marker malformed check, sync.ts's LORE-150 orphanedIndexes field, reconcile-shared.ts's gatherReconciliation config-validation timing. 2. Edit instructions.ts CHECK topic: name managed-block-marker corruption as a second validation cause with correct per-cause timing (config validation is genuinely pre-task-resolution; marker corruption is per-concept, post-task-resolution) instead of one false blanket timing claim. 3. Edit instructions.ts SYNC topic: add collapsed same-line marker pair to the marker-shape list; add orphanedIndexes to the --json prose. 4. Edit check.ts:454 docstring to add the collapsed same-line shape. 5. Add a discriminating test in instructions.test.ts asserting the new CHECK prose and absence of the old false claim; prove it fails pre-fix via git stash, then restore. 6. Run typecheck + full test suite + biome check on touched files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified all 4 claims against real code before editing: check.ts's regenerateTaskBlock call (line ~488) throws validation post-task-resolution (per-concept, inside reconcileDriftFindings, caught+re-thrown in commands/check.ts after emit at ~195-197/236-238); gatherReconciliation's own doc comment confirms the config-validation cause genuinely IS pre-task-resolution (reconcile-shared.ts). Corrected instructions.ts CHECK topic to name both causes with correct per-cause timing instead of one false blanket claim. Added collapsed same-line marker pair to SYNC topic + check.ts:454 docstring (LORE-156). Added orphanedIndexes mention to SYNC topic's --json prose (LORE-150, sync.ts SyncReport.orphanedIndexes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected wave-11 drift in src/core/instructions.ts + src/core/check.ts docstring (docs/comments only, no runtime logic changed): (1) CHECK topic's validation-cause paragraph now names two distinct causes with correct per-cause timing -- reconcile-config validation (genuinely pre-task-resolution, verified against gatherReconciliation's own doc comment) and corrupted managed-block markers (per-concept, post-task-resolution, verified against reconcileDriftFindings's regenerateTaskBlock call and its catch/re-throw sites in commands/check.ts) -- replacing the old false blanket 'thrown before any task resolution' claim; exit-code/type set (usage/not_found/denied/validation) unchanged. (2) SYNC topic body and check.ts:454 docstring's marker-corruption shape lists both now include LORE-156's collapsed same-line begin/end pair alongside missing/duplicated/crossed. (3) SYNC topic's --json prose now mentions orphanedIndexes (LORE-150: stale on-disk index.md dirs, reported but left untouched, never auto-written/removed). (4) Added a discriminating test in test/instructions.test.ts asserting the new CHECK prose and the absence of the old false claim; proved it fails against the pre-fix prose via git stash/pop, then restored. Verified: bun run typecheck clean; bun test 1845 pass / 0 fail (up from 1844, +1 new test); biome check clean on all 3 touched files (src/core/instructions.ts, src/core/check.ts, test/instructions.test.ts); eyeballed rendered check/sync topics via bun run src/cli.ts instructions <topic> --plain.
<!-- SECTION:FINAL_SUMMARY:END -->
