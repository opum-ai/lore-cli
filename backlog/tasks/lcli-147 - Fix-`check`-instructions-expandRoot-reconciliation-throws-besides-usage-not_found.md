---
id: LCLI-147
title: >-
  Fix `check` instructions: expandRoot/reconciliation throws besides
  usage/not_found
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:26'
labels:
  - codex-review-followup
  - core-engine-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `check` instructions topic (src/core/instructions.ts:97-99) states that `usage` (exit 2) and `not_found` (exit 3) "are the only cases that actually throw" for `lore check`. This is contradicted by the current code: `expandRoot` in src/commands/check.ts (~line 699-705) throws a `denied` LoreError for an unreadable root, and check.ts's own module docstring (line 127) lists `denied` and `validation` alongside `usage`/`not_found` as gate throws. Additionally, for reconciliation-eligible concepts, `resolveReconcileConfig` and `gatherReconciliation` in src/commands/reconcile-shared.ts (documented at lines ~105-109 and ~137-138) can throw `validation` (malformed status flow/overrides) and `not_found` (a linked task id that no longer exists). An agent relying on the instructions text would not anticipate `denied` or `validation` failures from `lore check`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `check` instructions body in src/core/instructions.ts accurately enumerates all throw cases for `lore check` (`usage`, `not_found`, `denied`, and `validation` where reconciliation applies) instead of claiming only `usage`/`not_found` throw
- [x] #2 The updated text is consistent with check.ts's own module docstring (line 127) and with reconcile-shared.ts's documented `@throws` cases, so the two sources of truth no longer contradict each other
- [x] #3 test/instructions.test.ts (or equivalent) is updated/added to assert the `check` topic body reflects the full set of throwing error types
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/core/instructions.ts CHECK topic body, replace the incorrect 'usage and not_found are the only cases that actually throw' paragraph with accurate prose enumerating usage (exit 2: bad flag or non-directory bundle-root), not_found (exit 3: missing bundle-root path, or a linked task id that no longer exists during reconciliation), denied (exit 4: unreadable bundle-root), and validation (exit 6: malformed reconcile status-flow/overrides, thrown before task resolution) as the throwing cases -- consistent with check.ts's module docstring (usage/not_found/denied/validation) and reconcile-shared.ts's @throws (validation, not_found). 2. Add a regression test in test/instructions.test.ts (same style as the LCLI-146 linking-topic test) asserting the check topic body no longer claims usage/not_found are the ONLY throwing cases and does mention denied and validation. 3. Run bun test and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote the check topic's throw-cases paragraph in src/core/instructions.ts to enumerate usage (exit 2: bad flag or non-directory bundle-root), not_found (exit 3: missing bundle-root OR a linked task id no longer existing during reconciliation), denied (exit 4: unreadable bundle-root), and validation (exit 6: malformed reconcile status-flow/overrides, thrown before task resolution) -- matching check.ts's module docstring (usage/not_found/denied/validation) and reconcile-shared.ts's @throws on resolveReconcileConfig/gatherReconciliation. Added a regression test in test/instructions.test.ts (mirrors the LCLI-146 linking-topic pattern) asserting the old 'are the only cases that' claim is gone and that usage/not_found/denied/validation plus exit 2/3/4/6 all appear in the body. Confirmed the test discriminates: reverted instructions.ts via git stash and reran -- test failed against the old prose, then restored and it passed. Verification: bun test test/instructions.test.ts (15 pass/0 fail), full bun test (1819 pass/0 fail), bun run typecheck (clean).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the check instructions topic in src/core/instructions.ts, which incorrectly claimed usage/not_found were the only throw cases for lore check. Replaced with accurate prose covering usage (exit 2), not_found (exit 3, including a missing linked task id), denied (exit 4, unreadable bundle root), and validation (exit 6, malformed reconcile config) -- consistent with check.ts's module docstring and reconcile-shared.ts's documented @throws. Added a discriminating regression test in test/instructions.test.ts. Verified with bun test (1819 pass/0 fail) and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
