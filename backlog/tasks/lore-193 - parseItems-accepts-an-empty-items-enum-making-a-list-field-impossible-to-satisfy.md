---
id: LORE-193
title: >-
  parseItems accepts an empty items enum = [], making a list field impossible to
  satisfy
status: To Do
assignee: []
created_date: '2026-07-23 01:00'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
priority: medium
type: bug
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Same bug class as LORE-140, one seam over (list fields instead of scalar fields). parseItems (src/core/profile.ts:546-565) reads a list field's `items = { enum = [] }` via asStringArray with no length check and returns { kind: "string", enum: [] }; itemToZod (src/core/profile.ts:734) feeds it straight to z.enum([...]), so a profile declaring e.g. `tags = { kind = "list", items = { enum = [] } }` compiles WITHOUT error into z.array(z.enum([])) — a list no element can ever satisfy, with no error pointing at the mistake. LORE-140 added assertNonEmptyEnum but wired it only into parseFieldSpec (profile.ts:494); reuse it in parseItems for a one-call fix. Surfaced by the wave-12 LORE-140 per-task review and re-confirmed by the wave-12 integration review (real + unfixed on dev).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Loading a profile.toml with a list field declaring `items = { enum = [] }` fails at profile-parse time with a clear error naming the offending field, instead of silently compiling into z.array(z.enum([])).
- [ ] #2 A regression test in test/profile.test.ts covers a list field with `items = { enum = [] }` and asserts profile loading throws/fails with a descriptive error rather than succeeding.
<!-- AC:END -->
