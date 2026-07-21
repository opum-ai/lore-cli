---
id: LORE-140
title: >-
  parseFieldSpec accepts an empty `enum = []`, making the field impossible to
  satisfy
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
parseFieldSpec (src/core/profile.ts:442-478) reads a field's `enum` attribute via `asStringArray(table.enum, ...)` (line 451) with no check on the resulting array's length, and later passes any defined `spec.enum` straight to `z.enum([...spec.enum])` (baseKindToZod, profile.ts ~664-669) with no empty-array guard. Because Zod's `z.enum([])` rejects every possible value, a profile that declares a field with `enum = []` compiles successfully at profile-load time but produces a Zod schema that can never be satisfied — a required field (or even an optional one with a value supplied) will always fail validation, and the profile author gets no error pointing at the actual mistake.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Loading a profile.toml with a field spec declaring `enum = []` fails at profile-parse time with a clear error identifying the offending field, instead of silently compiling into an unsatisfiable Zod schema.
- [ ] #2 A regression test in test/profile.test.ts covers a field spec with `enum = []` and asserts profile loading throws/fails with a descriptive error rather than succeeding.
<!-- AC:END -->
