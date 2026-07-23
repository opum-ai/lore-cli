---
id: LORE-230
title: >-
  existingIsRegularFile masks non-ENOENT lstat failures as a benign 'already
  exists' skip
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 19:19'
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
- [x] #1 When the classifying `lstatSync` in `existingIsRegularFile` fails with a non-ENOENT error (e.g. EACCES/EIO), `createIfAbsent` surfaces a `LoreError` (denied/conflict) rather than reporting a benign 'already exists' skip.
- [x] #2 The documented raced-away case (lstat fails with ENOENT because the entry vanished after the `wx` EEXIST) still degrades to a benign skip (createIfAbsent returns false), unchanged.
- [x] #3 A new test injects an `lstatSync` that throws a non-ENOENT error while the `wx` write throws EEXIST, and asserts the error surfaces instead of a silent skip.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Narrow existingIsRegularFile's catch to only degrade-to-benign-skip on ENOENT (the documented raced-away-after-EEXIST case); rethrow any other lstat failure (EACCES/EIO/...). 2. In createIfAbsent, wrap the existingIsRegularFile call in its own try/catch and map a rethrown non-ENOENT stat failure through the shared ioError() classifier (EACCES/EPERM -> denied; EEXIST/ENOTDIR/EISDIR/ELOOP -> conflict; anything else rethrown raw), so it surfaces as a LoreError instead of a benign skip. 3. Add a new describe block in test/fswrite.test.ts that imports createIfAbsent directly and spies on fs.writeFileSync (force EEXIST) + fs.lstatSync (force EACCES vs ENOENT) to cover AC#1 (surfaces LoreError denied), AC#2 (ENOENT still benign skip), plus a real-file sanity check and a real-directory conflict sanity check so the common paths are provably unaffected.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified with: full 'bun test' = 1963 pass / 0 fail (incl. 4 new createIfAbsent tests, plus all pre-existing init/new/scaffold fswrite tests unmodified and green); 'bun run typecheck' clean; 'bunx biome check src/commands/fswrite.ts test/fswrite.test.ts' clean, no new findings.

AC#1: new test spies fs.writeFileSync to throw EEXIST and fs.lstatSync to throw a non-ENOENT (EACCES) error; createIfAbsent now throws a LoreError with type 'denied' (via the shared ioError classifier) instead of returning false/benign-skip.
AC#2: new test spies the same EEXIST wx failure but with lstatSync throwing ENOENT (the documented raced-away case); createIfAbsent still returns false (benign skip), unchanged.
AC#3: the AC#1 test above is exactly this injected non-ENOENT-lstat + EEXIST-wx scenario, asserting the error surfaces (LoreError, not a silent skip).
Regression coverage: a real pre-existing regular file still returns false untouched; a real directory blocking the path still throws a 'conflict' LoreError -- both common paths (lore init/new re-run, writeAllOrRollback non-force scaffold) are unaffected by the narrowed catch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed existingIsRegularFile (src/commands/fswrite.ts) to only degrade to a benign 'already exists' skip on the documented raced-away ENOENT case; any other lstat failure (EACCES/EIO/...) now propagates. createIfAbsent classifies that propagated failure via the shared ioError() helper (denied/conflict/rethrow-raw) so it surfaces as a LoreError instead of being silently reported as a benign skip. Added 4 targeted tests in test/fswrite.test.ts covering the non-ENOENT-surfaces case, the ENOENT-still-benign-skip case, and two regression sanity checks (real existing file, real directory conflict). Verified: bun test 1963 pass/0 fail, bun run typecheck clean, biome clean on changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
