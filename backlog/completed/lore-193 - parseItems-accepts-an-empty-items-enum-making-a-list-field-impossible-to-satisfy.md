---
id: LORE-193
title: >-
  parseItems accepts an empty items enum = [], making a list field impossible to
  satisfy
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 01:00'
updated_date: '2026-07-23 10:31'
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
- [x] #1 Loading a profile.toml with a list field declaring `items = { enum = [] }` fails at profile-parse time with a clear error naming the offending field, instead of silently compiling into z.array(z.enum([])).
- [x] #2 A regression test in test/profile.test.ts covers a list field with `items = { enum = [] }` and asserts profile loading throws/fails with a descriptive error rather than succeeding.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reuse the existing assertNonEmptyEnum (LORE-140) helper in parseItems (profile.ts) so a list field's items = { enum = [] } fails at parse time naming the offending field, same as scalar field enums. Add a regression test in test/profile.test.ts mirroring the LORE-140 empty-enum test but for a list field's items.enum.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added assertNonEmptyEnum(enumValues, where, source) call in parseItems (src/core/profile.ts, right after asStringArray parses table.enum), reusing the LORE-140 helper so an empty items.enum fails at parse time naming the offending field (e.g. types[0].fields.tags.items.enum). Updated the helper's docstring to note it is now shared by parseFieldSpec and parseItems. Added a regression test in test/profile.test.ts (list field tags = { kind = 'list', items = { enum = [] } }) asserting the thrown validation error message contains the offending field path. Verified: bun test -> 1911 pass, 0 fail, 5378 expect() calls (was ~1910 baseline +1 new test). bun run typecheck -> tsc --noEmit clean. bun run lint -> 3 pre-existing errors, none in src/core/profile.ts or test/profile.test.ts (known-red baseline per task instructions, not a regression from this change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed parseItems (src/core/profile.ts) to reject an empty items.enum ([]) at profile-parse time by reusing the LORE-140 assertNonEmptyEnum helper (one-call fix, right after asStringArray parses table.enum), instead of silently compiling into z.array(z.enum([])) — a list no element could ever satisfy. Added a regression test in test/profile.test.ts covering a list field's items = { enum = [] } and asserting the descriptive error names the offending field path. Verified with bun test (1911 pass, 0 fail) and bun run typecheck (tsc --noEmit clean, no errors).
<!-- SECTION:FINAL_SUMMARY:END -->
