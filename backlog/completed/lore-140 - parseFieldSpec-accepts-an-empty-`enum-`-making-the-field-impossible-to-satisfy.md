---
id: LORE-140
title: >-
  parseFieldSpec accepts an empty `enum = []`, making the field impossible to
  satisfy
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-23 00:43'
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
- [x] #1 Loading a profile.toml with a field spec declaring `enum = []` fails at profile-parse time with a clear error identifying the offending field, instead of silently compiling into an unsatisfiable Zod schema.
- [x] #2 A regression test in test/profile.test.ts covers a field spec with `enum = []` and asserts profile loading throws/fails with a descriptive error rather than succeeding.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add assertNonEmptyEnum(enumValues, where, source) helper in src/core/profile.ts, called from parseFieldSpec right after asStringArray(table.enum, ...) parses the enum attribute. It fails (LoreError type=validation) when enumValues is defined and has length 0, naming the offending field via the existing 'where' path (e.g. types[0].fields.status.enum). 2. Add a regression test in test/profile.test.ts (parseProfile grammar-errors describe block) asserting a field spec with enum=[] throws a validation error naming the field. 3. Verify: full bun test suite green, bun run typecheck clean, and mutation-check (revert the parse-time guard, confirm the new test fails; restore, confirm it passes).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test (full suite) 1846 pass / 0 fail; bun run typecheck clean (tsc --noEmit, no output). Mutation-check: reverted src/core/profile.ts to HEAD (via file copy, not git stash — see below), re-ran the new test alone -> failed with 'expected a validation LoreError, but the call returned', confirming it exercises the fix; restored the fix, re-ran -> 59 pass / 0 fail in test/profile.test.ts. Note: during the first mutation-check attempt I used 'git stash push/pop' scoped to profile.ts; this repo runs one wave of tasks as sibling git worktrees sharing a single .git, so refs/stash is a REPO-WIDE stack, not per-worktree. A concurrent stash push from the LORE-159 worker interleaved with mine: my pop returned their entry (their src/core/validate.ts h2Headings fix) into my tree instead of my own, and (by symmetry) my profile.ts stash entry surfaced in their worktree. I did not touch the LORE-159 worktree, but recovered their lost validate.ts content losslessly from the still-present git blob (its OID is named in the diff I captured before discarding it) and left a copy for the orchestrator/LORE-159 worker to restore; re-did my own mutation-check with a plain file-copy revert (no git stash) to avoid the shared-ref hazard. Recommend never using git stash in this multi-worktree setup.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed parseFieldSpec (src/core/profile.ts) to reject a zero-length enum at profile-parse time via a new assertNonEmptyEnum(enumValues, where, source) helper, called right after the existing asStringArray(table.enum, ...) parse -- throws a validation LoreError naming the offending field path (e.g. types[0].fields.status.enum) instead of silently compiling into an unsatisfiable z.enum([]) schema. Added a regression test in test/profile.test.ts asserting enum=[] throws and the error names the field. Verified: bun test (full suite) 1846 pass/0 fail, bun run typecheck clean, and a mutation-check (fix reverted -> new test fails with "expected a validation LoreError, but the call returned"; fix restored -> 59/59 pass in profile.test.ts).
<!-- SECTION:FINAL_SUMMARY:END -->
