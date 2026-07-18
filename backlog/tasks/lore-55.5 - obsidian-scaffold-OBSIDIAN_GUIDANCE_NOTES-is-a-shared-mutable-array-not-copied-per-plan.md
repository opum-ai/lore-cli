---
id: LORE-55.5
title: >-
  obsidian scaffold: OBSIDIAN_GUIDANCE_NOTES is a shared mutable array, not
  copied per plan
status: To Do
assignee: []
created_date: '2026-07-18 22:54'
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
- [ ] #1 OBSIDIAN_GUIDANCE_NOTES is frozen (Object.freeze) and/or buildObsidianScaffold returns a fresh copy of it in each plan, so no two calls can ever share one mutable array identity
- [ ] #2 A new test asserts two separate buildObsidianScaffold() calls return notes arrays that are not the same object reference (or that mutating one has no effect on the other)
<!-- AC:END -->
