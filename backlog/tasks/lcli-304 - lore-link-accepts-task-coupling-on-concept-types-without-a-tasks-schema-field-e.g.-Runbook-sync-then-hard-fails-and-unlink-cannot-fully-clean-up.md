---
id: LCLI-304
title: >-
  lore link accepts task-coupling on concept types without a tasks schema field
  (e.g. Runbook); sync then hard-fails and unlink cannot fully clean up
status: To Do
assignee: []
created_date: '2026-08-04 07:27'
labels:
  - linking
  - sync
  - schema
  - validation
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
ordinal: 417000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`lore link <concept> <taskId>` should either refuse up front for a concept type whose schema doesn't define a `tasks:` field or managed task block (only Story does, per every `.lore/schemas/*.schema.json` and the template scaffolding), or the resulting inconsistency should be clearly surfaced and fully reversible.

## Observed
`lore link runbooks/<id> <taskId> --json` exits 0 silently and writes an unsupported `tasks:` frontmatter field onto a Runbook. The next `lore sync` hard-fails: exit 6, "cannot regenerate the lore:tasks block: the managed task region is missing". `lore check --strict` (billed as the CI gate) does not surface the interim inconsistency at all -- 0 errors/0 warnings; only an undocumented `complete:false` flag differs, easy to miss. `lore unlink` to back out leaves a stray empty `tasks: []` key behind that keeps `lore validate --strict` red even after the round trip -- full recovery required deleting and re-scaffolding the file via `lore new`.

## Repro
    lore link runbooks/<any-runbook-id> <any-task-id> --json   # exit 0 -- should this succeed?
    lore sync --json                                            # exit 6, "managed task region is missing"
    lore check --strict --json                                  # 0 errors, 0 warnings -- doesn't catch it
    lore unlink runbooks/<any-runbook-id> <any-task-id> --json  # task removed but stray tasks: [] key remains
    lore validate --strict                                      # still red after unlink
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore link refuses up front (clean usage/validation error) when targeting a concept type whose schema doesn't support tasks/a managed task block, OR sync/check are made to handle it gracefully end-to-end
- [ ] #2 lore check --strict (the documented CI gate) surfaces this class of inconsistency, not just lore sync/lore validate
- [ ] #3 lore unlink fully reverses a lore link, leaving no stray frontmatter key behind, for every concept type it's ever allowed to target
<!-- AC:END -->
