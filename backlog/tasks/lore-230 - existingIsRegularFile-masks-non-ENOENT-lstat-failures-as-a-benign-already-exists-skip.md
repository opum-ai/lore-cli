---
id: LORE-230
title: >-
  existingIsRegularFile masks non-ENOENT lstat failures as a benign 'already
  exists' skip
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-crud-b
  - codex-review-followup
  - fswrite
dependencies: []
priority: low
type: bug
ordinal: 332000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `src/commands/fswrite.ts`, `existingIsRegularFile` catches EVERY `lstatSync` failure and returns `true` (live: src/commands/fswrite.ts:407-413). It is invoked from `createIfAbsent` (src/commands/fswrite.ts:157) only after a `wx` write already returned EEXIST — i.e. something demonstrably exists at the path — to classify that entry as a regular file (benign skip; `createIfAbsent` returns false) vs a non-regular `conflict`.

Because the catch is unconditional, a genuine permission/I-O error on that classifying stat (EACCES/EIO — not the raced-away-ENOENT case the docstring documents) is silently reported as 'a regular file already exists, skipped' instead of being surfaced. `createIfAbsent`'s callers are `lore init`/`lore new` and `writeAllOrRollback`'s non-force scaffold branch, so a real I/O fault during classification is reported to the user as a benign skip. Unlike the codebase's other degrade-on-stat-failure sites (findSymlinkSegment, assertMoveTargetSafe), there is no subsequent syscall here that would re-raise the swallowed error.

Provenance: Codex second-opinion review (backlog doc-2, low-severity), cluster cmd-crud-b. Confirmed still live on `dev`. Reachability is narrow (an entry proven present by EEXIST is normally stat-able), but a real EIO/permission-race is masked rather than reported.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the classifying `lstatSync` in `existingIsRegularFile` fails with a non-ENOENT error (e.g. EACCES/EIO), `createIfAbsent` surfaces a `LoreError` (denied/conflict) rather than reporting a benign 'already exists' skip.
- [ ] #2 The documented raced-away case (lstat fails with ENOENT because the entry vanished after the `wx` EEXIST) still degrades to a benign skip (createIfAbsent returns false), unchanged.
- [ ] #3 A new test injects an `lstatSync` that throws a non-ENOENT error while the `wx` write throws EEXIST, and asserts the error surfaces instead of a silent skip.
<!-- AC:END -->
