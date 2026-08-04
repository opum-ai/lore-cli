---
id: LCLI-305
title: >-
  lore sync doesn't regenerate a Story's managed tasks block when its
  linked-task count transitions from 1+ to 0 (unlink to empty)
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 07:27'
updated_date: '2026-08-04 17:35'
labels:
  - sync
  - managed-blocks
  - check
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.0 comprehensive E2E pass (branch
    e2e/v0.1.0-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v2.md and
    docs/runbooks/e2e-verification-v0.1.0.md in that repo.
modified_files:
  - src/commands/reconcile-shared.ts
  - src/commands/check.ts
  - src/core/check.ts
  - test/reconcile-shared.test.ts
  - test/sync.test.ts
  - test/check.test.ts
priority: medium
type: bug
ordinal: 418000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
When a Story's `tasks:` frontmatter list transitions from non-empty to empty (via `lore unlink`), the next `lore sync` should regenerate the `lore:tasks` managed block to reflect zero linked tasks.

## Observed
After unlinking a Story's only linked task, `tasks:` frontmatter correctly becomes an empty list, but the managed block still shows the stale task row -- across 3 separate sync invocations (global `lore sync`, scoped `lore sync <id>`, and a bare re-run), all reporting `filesChanged:0`. `lore check --strict` (whose own `lore instructions check` topic explicitly documents it as catching reconciliation drift -- a Story's written status or managed block gone stale) also does not flag the mismatch: 0 errors/0 warnings despite frontmatter and the managed block visibly disagreeing. The drift self-heals only once a task is re-linked (0->1 transition regenerates correctly) -- the 1->0 transition specifically is the unhandled case.

## Repro
    lore link stories/<id> <taskId>
    lore sync
    lore unlink stories/<id> <taskId>
    lore sync                          # filesChanged:0, managed block still shows the old task row
    lore sync stories/<id>             # same, filesChanged:0
    lore check --strict                # 0 errors, 0 warnings -- doesn't catch the mismatch
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore sync regenerates a Story's managed tasks block correctly on a 1+ -> 0 linked-task transition, not just 0 -> 1+
- [x] #2 lore check --strict (or lore validate) surfaces a stale managed block vs frontmatter mismatch as a real finding
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Distinguish concepts that explicitly declare `tasks:` from concepts that link one or more task IDs, preserving the existing no-config/no-Backlog fast path for an empty list.
2. Feed explicit empty-task concepts through the shared sync/check reconciliation target path with `newStatus: null` and zero managed-block rows, so sync regenerates `_No linked tasks._` while check compares the same bytes without inventing status drift.
3. Add pure and command-level regression coverage for stale 1+ → 0 blocks, absent `tasks:` no-op behavior, adapter isolation, and second-run idempotency.
4. Run focused reconciliation/sync/check tests, then the full suite, typecheck, lint, and diff hygiene; perform an adversarial self-review before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the verified-but-undelivered LCLI-305 fix. Shared reconciliation now distinguishes an explicit empty `tasks:` field from an absent field: empty lists produce a zero-row target with `newStatus: null`, bypass status-flow config and Backlog task lookup, and still flow through managed-block regeneration/drift comparison. `lore sync` therefore replaces a stale final-task row with `_No linked tasks._`; `lore check --strict` reports the same mismatch as `managed-block-drift` without inventing status drift. Reserved stems and concepts without `tasks:` retain their prior no-op behavior.

Objective verification on the exact final diff: focused `bun test test/reconcile-shared.test.ts test/sync.test.ts test/check.test.ts` passed 324 tests / 700 expectations, including a real `unlink --no-back-ref` -> `sync` transition and second-run idempotency; full `bun test` passed 2,443 tests / 8,258 expectations across 75 files; `npm run typecheck` passed; `npm run lint` checked 186 files with no fixes; `git diff --check` passed. Adversarial self-review confirmed empty-only bundles perform no config/task lookup, mixed empty/non-empty concepts retain existing fail-fast semantics, absent `tasks:` files remain untouched, and reserved stems remain excluded. No documentation or configuration change is required. Both acceptance criteria are proven, but the task remains In Progress because this invocation did not authorize a local commit or remote delivery.

User-authorized local delivery completed in source commit 11764de3a64c68b0200392a1cb1b03146a0a4e51, containing only the six verified source/test files. No push or other remote mutation occurred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Handled the final-task unlink transition by treating an explicit empty `tasks:` field as a zero-row managed-block target while preserving the no-config/no-Backlog fast path. `lore sync` now renders `_No linked tasks._`, and `lore check --strict` reports stale zero-task blocks. Verified with 324 focused and 2,443 full tests, typecheck, lint, diff hygiene, and adversarial self-review; delivered locally as 11764de.
<!-- SECTION:FINAL_SUMMARY:END -->
