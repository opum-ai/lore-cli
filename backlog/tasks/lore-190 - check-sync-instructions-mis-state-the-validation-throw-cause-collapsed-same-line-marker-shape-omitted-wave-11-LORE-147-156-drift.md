---
id: LORE-190
title: >-
  check/sync instructions mis-state the validation throw cause; collapsed
  same-line marker shape omitted (wave-11 LORE-147/156 drift)
status: To Do
assignee: []
created_date: '2026-07-22 23:19'
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
- [ ] #1 CHECK instructions validation-cause prose corrected to include corrupted managed-block markers as a cause and to drop the false "before any task resolution" timing claim
- [ ] #2 SYNC topic (instructions.ts) and the check.ts:454 docstring marker-corruption shape list include the collapsed same-line marker pair
- [ ] #3 SYNC topic --json prose mentions LORE-150s orphanedIndexes (reported-but-not-written) field
- [ ] #4 test/instructions.test.ts asserts the CHECK topic body reflects the managed-block/marker validation cause (discriminating against the current prose)
<!-- AC:END -->
