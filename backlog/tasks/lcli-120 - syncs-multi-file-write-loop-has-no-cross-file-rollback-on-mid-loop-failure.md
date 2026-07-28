---
id: LCLI-120
title: sync's multi-file write loop has no cross-file rollback on mid-loop failure
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - cmd-crud-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The write loop in runSync (src/commands/sync.ts:181-185) iterates `writes` and calls `writeFileAtomic` per file with no rollback/undo stack spanning the whole loop. Each individual file write is atomic, but if the process crashes or a later write fails partway through a multi-file sync, the files already written earlier in the loop remain updated on disk while later ones are not, leaving the docs bundle in a mixed old/new state with no automatic recovery. Unlike rename.ts/fswrite.ts, which document this as a known deferred limitation for their own multi-file operations, sync.ts carries no such disclaimer despite having the same exposure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The behavior and scope of sync's partial-write exposure (which files can be left in a mixed state, and that no automatic rollback occurs) is either fixed with an all-or-nothing write transaction across `writes`, or explicitly documented in sync.ts adjacent to the write loop so the limitation is discoverable rather than silent.
- [x] #2 If a rollback/transaction mechanism is added, a regression test forces a failure partway through a multi-file `writes` loop (e.g. second of three files fails to write) and asserts none of the files were left modified on disk (or that the report accurately reflects the partial state, if full rollback is not implemented).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Change sync.ts's `writes` map from path->newBytes to path->{before,after}, capturing each entry's
   pre-run bytes at diff time (concept loop's already-read `original`; regenerateIndexAndLog's
   diskIndexBytes/existingLog reads), never re-derived later.
2. Add a new shared primitive in fswrite.ts, writeManyAtomicOrRollback(writes, writeAtomic?), that
   writes a list of {abs, relPath, before, after} entries via writeFileAtomic (injectable for tests),
   and on any entry throwing, undoes every entry already applied in that same call (restore `before`
   bytes, or rmSync if `before` is undefined) in reverse order before rethrowing the original error —
   best-effort rollback, mirroring the existing writeAllOrRollback discipline.
3. Wire sync.ts's write phase through writeManyAtomicOrRollback instead of a bare writeFileAtomic
   loop, so a mid-loop failure no longer leaves an arbitrary prefix of files committed.
4. Update sync.ts's module docstring + inline comments, and writeFileAtomic's own docstring in
   fswrite.ts, to describe the new all-or-nothing guarantee (superseding the old "no cross-file
   rollback, deferred" language for sync specifically; rename.ts/replace.ts keep their own existing
   deferred-limitation docs, untouched, since only sync.ts is in scope here).
5. Tests: unit-test writeManyAtomicOrRollback directly in fswrite.test.ts with an injected
   writeAtomic that fails deterministically on a chosen write (2nd of 3, and a fresh-file case), plus
   a real-filesystem regression in sync.test.ts that chmods docs/ read-only to force an actual EACCES
   partway through a real multi-file sync run and asserts the earlier concept write was rolled back
   to its original bytes and no index/log file was left behind.
6. Verify: bun test (full suite) + bun run typecheck, both green; bun run lint on touched files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented an all-or-nothing write transaction for sync's multi-file writes loop (AC#1: fixed, not just documented).

- fswrite.ts: added AtomicRollbackWrite + writeManyAtomicOrRollback(writes, writeAtomic?) — writes a
  list of {abs, relPath, before, after} entries via writeFileAtomic, and on any entry throwing,
  rolls back every entry already applied in the same call (reverse order: restore `before` bytes,
  or rmSync if the file didn't exist before) before rethrowing the original error. writeAtomic is
  injectable (defaults to the real writeFileAtomic) for deterministic tests, mirroring writeAllBytes's
  own injected writer.
- sync.ts: `writes` now maps path -> {before, after} (before captured at diff time: the concept
  loop's already-read `original`; regenerateIndexAndLog's diskIndexBytes/existingLog reads). The write
  phase builds an AtomicRollbackWrite[] (after ensureDir per path, same as before) and delegates to
  writeManyAtomicOrRollback instead of a bare per-file loop. Updated the module docstring and
  writeFileAtomic's own docstring to describe the new guarantee; rename.ts/replace.ts are untouched
  and keep their own existing "deferred, no cross-file rollback" documentation (out of scope here).

Verification: bun test -> 1776 pass, 0 fail (was 1776 pass pre-change baseline count minus the 6 new
tests added here, i.e. 1770 pre-existing); bun run typecheck -> clean; bun run lint -> 0 findings in
touched files. New tests:
  - test/fswrite.test.ts: 4 new tests directly on writeManyAtomicOrRollback (2nd-of-3 failure rolls
    back the 1st and never attempts the 3rd; a freshly-created file is removed, not left stale, on
    rollback; the success path leaves all new bytes in place; a rollback-restore failure is swallowed
    so the ORIGINAL error is what's thrown).
  - test/sync.test.ts: 1 new integration test (LCLI-120) that chmods docs/ read-only after writing a
    concept doc, forcing a REAL EACCES on the index.md/log.md write that comes later in the same
    `writes` map (insertion order: concept entries first, then index/log) -- asserts the earlier
    concept write (a different, still-writable directory) was rolled back to its original on-disk
    bytes, and neither index.md nor log.md was left behind. Skips gracefully under root or a
    permissive filesystem, matching this repo's established chmod-probe pattern (bundle.test.ts,
    replace.test.ts, config.test.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed (not just documented): sync's multi-file write loop is now all-or-nothing. Added
writeManyAtomicOrRollback (fswrite.ts) — writes a list via writeFileAtomic and, on any write
throwing, rolls back every write already applied in that same run (restore prior bytes, or delete a
newly-created file) before rethrowing. sync.ts now tracks before/after bytes per planned write and
routes its whole write phase through this helper instead of a bare loop. Verified with bun test
(1776 pass, 0 fail, including 4 new deterministic unit tests on the rollback helper and 1 new
real-filesystem integration test that forces an actual EACCES mid-loop and proves the earlier write
was rolled back) and bun run typecheck (clean). rename.ts/replace.ts intentionally untouched — they
keep their own pre-existing "deferred" documentation, out of this task's scope.
<!-- SECTION:FINAL_SUMMARY:END -->
