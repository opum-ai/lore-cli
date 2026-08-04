---
id: LCLI-306
title: >-
  lore new accepts an unrecognized concept type (exit 0); lore check --strict
  doesn't catch it even though validate --strict does
status: To Do
assignee: []
created_date: '2026-08-04 07:27'
labels:
  - validation
  - check
  - dx
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.0 comprehensive E2E pass (branch
    e2e/v0.1.0-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v2.md and
    docs/runbooks/e2e-verification-v0.1.0.md in that repo.
priority: low
type: bug
ordinal: 419000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`lore new <type> <title>` should either reject an unrecognized `type` outright, or at minimum `lore check --strict` -- documented as the CI gate -- should also flag it, matching `lore validate --strict`'s behavior.

## Observed
`lore new badtype "some title"` exits 0 and creates the file (now with a stderr warning at creation time: unknown type "badtype", validated on `type` only -- an improvement over the fully-silent pre-0.1.0 behavior). `lore validate --strict` correctly reports 1 warning and fails with exit 6. `lore check --strict`, however, reports 0 errors/0 warnings on the same bundle including that file -- a CI pipeline gating only on `check --strict` (a very plausible setup, since `check` bills itself as the CI gate in its own --help) would never catch an unrecognized-type typo.

## Repro
    lore new badtype "some title"
    lore check --strict      # 0 errors, 0 warnings -- doesn't catch it
    lore validate --strict   # 1 warning, exit 6 -- does catch it
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either lore new rejects an unrecognized type value outright, or lore check --strict also flags a concept file with an unrecognized type, matching lore validate --strict
<!-- AC:END -->
