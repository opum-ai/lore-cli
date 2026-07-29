---
id: LORE-55.5
title: >-
  obsidian scaffold: OBSIDIAN_GUIDANCE_NOTES is a shared mutable array, not
  copied per plan
status: Done
assignee: []
created_date: '2026-07-18 22:54'
updated_date: '2026-07-19 00:03'
labels:
  - cmd
  - core
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/core/consumer-scaffold.ts
parent_task_id: LORE-55
priority: medium
type: bug
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
buildObsidianScaffold (src/core/consumer-scaffold.ts) returns the module-level OBSIDIAN_GUIDANCE_NOTES array by reference into every plan's notes field, with no copy and no Object.freeze -- unlike the codebase's other module-level constants. Verified empirically: every buildObsidianScaffold() call returns plan.notes === OBSIDIAN_GUIDANCE_NOTES, the identical object. Because ScaffoldResult.notes is only readonly at compile time, a single downstream cast-and-mutate (e.g. (plan.notes as string[]).push(...) -- the PR's own test file already does an equivalent "as Record<string, unknown>" cast elsewhere) permanently corrupts the shared constant for every subsequent call in-process. Since bun test runs all files in one process, this could leak a stale/extra guidance line into unrelated tests or later in-process invocations; the existing determinism test uses toEqual (structural equality), so it cannot catch a shared-identity bug.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 OBSIDIAN_GUIDANCE_NOTES is frozen (Object.freeze) and/or buildObsidianScaffold returns a fresh copy of it in each plan, so no two calls can ever share one mutable array identity
- [x] #2 A new test asserts two separate buildObsidianScaffold() calls return notes arrays that are not the same object reference (or that mutating one has no effect on the other)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wrap OBSIDIAN_GUIDANCE_NOTES's array literal in Object.freeze (src/core/consumer-scaffold.ts), matching the codebase's existing precedent for module-level constants (errors.ts EXIT_CODES/ANSI, schema.ts TYPE_DIRECTORIES, template.ts BUILTIN_TEMPLATES, profile.ts RESERVED_FIELDS).
2. Add a test asserting the returned notes array is frozen (Object.isFrozen) and that a downstream mutation attempt throws a TypeError rather than silently corrupting the shared constant.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Chose freeze-in-place over a per-call copy: OBSIDIAN_GUIDANCE_NOTES is immutable content (fixed guidance text), so a frozen shared reference is both cheaper and safer than allocating a fresh array per call — a frozen array can never be mutated (throws TypeError in strict-mode ESM), satisfying AC#1's 'and/or' via the freeze branch, and AC#2's 'or mutating one has no effect on the other' branch, since the mutation attempt itself throws before any effect occurs. Verified: bun test test/consumer-scaffold.test.ts -> 49 pass (was 48); full suite 1496 tests, typecheck, lint all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wrapped OBSIDIAN_GUIDANCE_NOTES's array literal in Object.freeze (src/core/consumer-scaffold.ts), matching the codebase's existing module-level-constant convention. Verified with a new test asserting Object.isFrozen(plan.notes) and that a downstream mutation attempt throws TypeError rather than corrupting the shared constant; full suite (1496 tests), typecheck, and lint all pass.
<!-- SECTION:FINAL_SUMMARY:END -->
