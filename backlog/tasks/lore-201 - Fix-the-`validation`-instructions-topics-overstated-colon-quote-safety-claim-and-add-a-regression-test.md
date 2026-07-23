---
id: LORE-201
title: >-
  Fix the `validation` instructions topic's overstated colon quote-safety claim
  and add a regression test
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-engine-b
  - codex-review-followup
  - docs
dependencies: []
priority: low
type: docs
ordinal: 303000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** the `lore instructions validation` guidance precisely describes the colon quote-safety rule, and a regression test pins it so it cannot silently drift again.

**Why:** the VALIDATION topic body (src/core/instructions.ts, VALIDATION const, live lines ~153-154) says "a colon-containing value all fail unconditionally". The actual check, quoteSafetyForValue in src/core/validate.ts:429, only flags a colon-followed-by-space (`value.includes(": ")`) — so URLs (`https://…`) and full ISO timestamps (`2024-01-01T00:00:00`) that contain colons are accepted. The guidance overstates the rule and could mislead an agent into thinking such values fail. The sibling linking/check topics already have dedicated content-assertion tests (test/instructions.test.ts:44-96) but the validation topic has none, so this drift passes the suite undetected — which is exactly the residual of finding [5] in this same cluster.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity, cluster core-engine-b; also subsumes the validation-topic residual of the doc-2 finding at test/instructions.test.ts:58.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `validation` topic body in src/core/instructions.ts no longer claims a "colon-containing value" fails; it states the hazard is a colon-followed-by-space (matching validate.ts:429's `value.includes(": ")`), i.e. that URLs and ISO timestamps carrying colons without ': ' are accepted.
- [ ] #2 A new test in test/instructions.test.ts asserts the validation topic body describes the colon hazard as colon-plus-space and does NOT contain a blanket "colon-containing … fail unconditionally" claim, analogous to the existing linking/check content-assertion tests at test/instructions.test.ts:44-96.
- [ ] #3 `bun test test/instructions.test.ts` passes.
<!-- AC:END -->
