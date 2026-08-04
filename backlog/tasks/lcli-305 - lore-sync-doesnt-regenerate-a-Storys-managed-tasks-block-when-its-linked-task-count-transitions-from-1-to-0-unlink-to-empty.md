---
id: LCLI-305
title: >-
  lore sync doesn't regenerate a Story's managed tasks block when its
  linked-task count transitions from 1+ to 0 (unlink to empty)
status: To Do
assignee: []
created_date: '2026-08-04 07:27'
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
- [ ] #1 lore sync regenerates a Story's managed tasks block correctly on a 1+ -> 0 linked-task transition, not just 0 -> 1+
- [ ] #2 lore check --strict (or lore validate) surfaces a stale managed block vs frontmatter mismatch as a real finding
<!-- AC:END -->
