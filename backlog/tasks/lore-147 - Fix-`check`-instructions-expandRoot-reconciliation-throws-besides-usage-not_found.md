---
id: LORE-147
title: >-
  Fix `check` instructions: expandRoot/reconciliation throws besides
  usage/not_found
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 The `check` instructions body in src/core/instructions.ts accurately enumerates all throw cases for `lore check` (`usage`, `not_found`, `denied`, and `validation` where reconciliation applies) instead of claiming only `usage`/`not_found` throw
- [ ] #2 The updated text is consistent with check.ts's own module docstring (line 127) and with reconcile-shared.ts's documented `@throws` cases, so the two sources of truth no longer contradict each other
- [ ] #3 test/instructions.test.ts (or equivalent) is updated/added to assert the `check` topic body reflects the full set of throwing error types
<!-- AC:END -->
