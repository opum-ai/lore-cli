---
id: LCLI-179
title: >-
  lore unlink/rename retry after failed backlog commit silently no-ops on the
  leftover dirty file
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - cmd-link
dependencies: []
priority: medium
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sibling of LCLI-121 (wave-5 Fable review finding). LCLI-121 fixed runLink's already-present/unchanged branch to include the task's file path as a git-status commit candidate, so a retry after a prior failed backlog/ commit recommits the leftover dirty task file instead of a false no-op success. The SAME same-class gap remains in two sibling paths in src/commands/link.ts: runUnlink's removeBackRefs 'already-absent' branch (link.ts ~374-376) pushes nothing, and moveBackRefs's 'already-current' branch (link.ts ~441-449) pushes nothing. So a retry of `lore unlink` / `lore rename` after a failed backlog commit will still silently no-op on the leftover dirty file, leaving backlog/ dirty until an unrelated sweep catches it. Apply LCLI-121's fix pattern (push detail.file in the no-edit branch, truthy-guarded) symmetrically to these two paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 runUnlink: a retry after a failed backlog/ commit, where the back-reference was already absent (no edit needed), detects the leftover dirty task file and commits it (or surfaces an explicit non-zero/drift failure) rather than a false no-op success
- [x] #2 moveBackRefs (lore rename): a retry where the back-reference was already current detects and commits the leftover dirty task file rather than a false no-op success
- [x] #3 A genuinely-clean unlink/rename run (nothing dirty) still yields a true no-op (empty commit, exit 0), preserving current behavior
- [x] #4 Regression tests in test/link.test.ts cover the unlink retry and the rename retry, each proven to fail against the pre-fix code
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/commands/link.ts — removeBackRefs (runUnlink's per-task loop): in the 'already-absent'
   branch (!hadLabel && !hadDoc), push detail.file into editedFiles (truthy-guarded) before
   returning "already-absent", mirroring LCLI-121's fix to runLink's already-present branch. This
   lets commitBacklogFiles's own scoped `git status` decide whether the file is actually dirty
   (a retry after a prior failed backlog/ commit) or genuinely clean (true no-op). Update the
   stale "populated only after a successful editTask" comment on editedFiles accordingly.
2. src/commands/link.ts — moveBackRefs: in the "already fully migrated" branch
   (hasExactNewLabel && staleLabel===undefined && hasNewDoc && !hasOldDoc) — the one that is a
   genuine retry-of-a-completed-move, NOT the separate "no trace of a back-ref at all" branch
   above it (which never had an edit applied and must NOT push, to avoid sweeping in unrelated
   dirty state on a never-linked task) — push detail.file (truthy-guarded) before returning
   "already-current". Update its editedFiles comment similarly.
3. Fix the now-incorrect existing rename.test.ts test "an all-already-current move writes nothing
   to Backlog, so it does not commit" (~line 1457): it exercises exactly the "already fully
   migrated" branch with dirtyGitSpawn(DIRTY) and asserts committed:false/git.calls empty — that
   assertion encodes the pre-fix bug (AC#2's exact scenario) and will become false once fixed.
   Swap its git fixture to cleanGitSpawn() (minimal, 1-line-class fix) so it now correctly tests
   the genuinely-clean case; adjust its title/comment to say so. This is the one std collateral
   edit outside the declared link.ts(+test) target, called out explicitly per the task's rules.
4. test/link.test.ts — add regression tests in the existing "backlog/ commit (LCLI-49)" describe
   block:
   a. unlink retry: already-absent + dirtyGitSpawn(DIRTY) -> backlogCommit {committed:true,
      files:[DIRTY_PATH]}, adapter.calls empty (AC#1).
   b. unlink clean: already-absent + cleanGitSpawn() -> backlogCommit {committed:false, files:[]}
      (AC#3, unlink side).
   c. moveBackRefs unit test (imported directly from src/commands/link.ts, not through
      commands/rename.ts): already-fully-migrated scenario -> editedFiles includes the task's
      file, adapter.calls empty (AC#2, exercised at the link.ts-exported-function level per the
      task's stated edit target).
5. Mutation-check: git diff -- src/commands/link.ts > /tmp/lore179.patch, git apply -R it, run the
   new tests against pre-fix code (expect the unlink-retry and moveBackRefs-retry tests to FAIL),
   then git apply it back and confirm all tests pass.
6. Run bun test (full suite) and bun run typecheck; both must be green. Check off AC#1-#4.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied LCLI-121's fix pattern symmetrically to the two sibling no-edit branches:
- removeBackRefs's "already-absent" branch (runUnlink) now pushes detail.file (truthy-guarded)
  into editedFiles before returning, so commitBacklogFiles's own scoped git-status check decides
  whether a retry after a prior failed commit needs to recommit the leftover dirty file.
- moveBackRefs's "already fully migrated" branch (hasExactNewLabel && !staleLabel && hasNewDoc &&
  !hasOldDoc) gets the identical fix — this is the branch a genuine retry-after-failed-commit lands
  in (a rename's editTask is one atomic call, so any successful prior edit necessarily leaves the
  task in exactly this state). The OTHER already-current branch (no trace of a back-ref at all —
  a task never linked, e.g. via --no-back-ref) is deliberately left untouched: no prior run of this
  same move could ever have applied an edit there, so pushing it would risk sweeping in an unrelated
  dirty edit rather than surfacing real retry drift. Covered by a new negative unit test.

Collateral fix (outside the declared link.ts+test target, called out per the task's rules):
test/rename.test.ts's "an all-already-current move writes nothing to Backlog, so it does not
commit" test exercised exactly the "already fully migrated" branch with dirtyGitSpawn(DIRTY) and
asserted committed:false / no add-or-commit calls — that assertion encoded the pre-fix bug (AC#2's
exact scenario). Minimally swapped its git fixture to cleanGitSpawn() and retitled it to state it
tests the genuinely-clean case (LCLI-179 AC#3); fixed the now-inaccurate git.calls-empty assertion
(commitBacklogFiles now DOES query git status for the non-empty candidate list, it just never
reaches add/commit on a clean tree).

New tests added to test/link.test.ts's "backlog/ commit (LCLI-49)" describe block:
- unlink already-absent + dirtyGitSpawn(DIRTY) -> recommits (AC#1)
- unlink already-absent + cleanGitSpawn() -> true no-op (AC#3)
- moveBackRefs (imported directly, unit-level) already-fully-migrated -> editedFiles includes the
  task's file, no editTask call (AC#2)
- moveBackRefs never-linked branch -> editedFiles stays empty (guards against over-broad sweeping)

Verification:
- Mutation check: `git diff -- src/commands/link.ts` saved to a patch, reverted with
  `git apply -R`, ran `bun test test/link.test.ts -t "LCLI-179"` against the pre-fix code -> the
  AC#1 (unlink retry) and AC#2 (moveBackRefs retry) tests FAILED as expected (AC#3 clean-tree test
  passed on both, correctly, since it verifies preserved behavior not the fix). Restored the patch
  with `git apply`.
- Full suite post-fix: `bun test` -> 1876 pass, 0 fail, 5291 expect() calls, across 47 files.
- `bun run typecheck` -> clean (tsc --noEmit, no errors).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Applied LCLI-121's fix pattern to the two sibling no-edit branches in src/commands/link.ts:
removeBackRefs's "already-absent" branch (runUnlink) and moveBackRefs's "already fully migrated"
branch (lore rename) now record their task's file as a commit candidate before returning, so
commitBacklogFiles's own git-status check recommits leftover drift from a prior failed backlog/
commit instead of a false no-op (the OTHER moveBackRefs already-current branch, for a task never
linked at all, is deliberately left unchanged). One collateral fix was required outside the
declared edit target: test/rename.test.ts's "all-already-current move ... does not commit" test
encoded the pre-fix bug for AC#2's exact scenario and was updated (cleanGitSpawn + corrected
git.calls assertion) to test the genuinely-clean case instead.

Verified via mutation check (reverted src/commands/link.ts with git apply -R, confirmed the new
unlink-retry (AC#1) and moveBackRefs-retry (AC#2) tests in test/link.test.ts FAIL against pre-fix
code, restored with git apply) and green full-suite runs: `bun test` -> 1876 pass / 0 fail / 5291
expect() calls across 47 files; `bun run typecheck` -> clean.
<!-- SECTION:FINAL_SUMMARY:END -->
