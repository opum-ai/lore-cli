---
id: LCLI-170
title: resolveHeadSha can't tell an unborn branch from a corrupted-but-present .git
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:27'
labels:
  - codex-review-followup
  - errors-output-git
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 184000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveHeadSha (src/adapters/git.ts:70-85) decides between 'legitimately empty repo' and 'broken repo' purely by checking whether `git rev-parse --git-dir` succeeds after `git rev-parse HEAD` fails. A `.git` directory can be present and pass the `--git-dir` check while HEAD itself is corrupted (e.g. a malformed ref file), which this heuristic misclassifies as the benign unborn-branch case and returns `null` instead of throwing. The function's own doc comment (lines 58-65) promises it 'fails loud' for a genuinely broken repo, but the current check cannot distinguish the two failure modes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test simulating a corrupted HEAD (e.g. a `.git/HEAD` file containing garbage or pointing at a non-existent ref) inside an otherwise-valid `.git` directory causes resolveHeadSha to throw a `drift` LoreError, not return null.
- [x] #2 A genuinely fresh/unborn-branch repo (real `.git`, zero commits, valid HEAD pointing at an unborn ref) still returns null from resolveHeadSha, unchanged from current behavior.
- [x] #3 The distinguishing check no longer relies solely on `git rev-parse --git-dir` succeeding as proof of the benign case.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Empirically verified (real git) that `.git/HEAD` = `ref: refs/heads/..bad..name` (a syntactically
   invalid ref name per git-check-ref-format) makes `git rev-parse HEAD` fail (exit 128) while
   `git rev-parse --git-dir` STILL succeeds -- reproducing the misclassification bug exactly.
2. Fix: replace the `git rev-parse --git-dir` disambiguator in resolveHeadSha (src/adapters/git.ts)
   with `git symbolic-ref -q HEAD`. This succeeds iff HEAD is a well-formed symbolic ref (regardless
   of whether the target ref/commit exists yet -- the genuine unborn-branch case), and fails for
   malformed/garbage HEAD content, distinguishing corruption from "real repo, no commits yet".
   Update the function's doc comment to describe the new check.
3. Tests (test/git-adapter.test.ts): add a regression test that corrupts .git/HEAD with an invalid
   ref-format string inside an otherwise-valid freshRepo() and asserts resolveHeadSha throws a
   `drift` LoreError (AC #1). Keep/confirm the existing "returns null in a fresh repo with no
   commits" test covers AC #2 unchanged.
4. Mutation-check: revert git.ts to pre-fix (via git diff/apply, not stash), confirm new test FAILS
   (returns null instead of throwing), re-apply fix, confirm it PASSES.
5. Run full `bun test` and `bun run typecheck`, both green. Check AC #1-#3, finalize, commit, push.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed empirically with real git: setting .git/HEAD to
`ref: refs/heads/..bad..name` (invalid ref name per git-check-ref-format) makes
`git rev-parse HEAD` fail while `git rev-parse --git-dir` STILL succeeds -- exactly
the misclassification the task describes. Fix: swapped the disambiguator in
resolveHeadSha (src/adapters/git.ts) from `git rev-parse --git-dir` to
`git symbolic-ref -q HEAD`, which succeeds iff HEAD is a well-formed symbolic ref
(true for a genuine unborn branch, since symbolic-ref never checks the target
exists) and fails for malformed/garbage HEAD content. Updated the function's doc
comment accordingly.

Verification:
- Added test/git-adapter.test.ts: "regression: LCLI-170 -- throws (does NOT return
  null) when .git/HEAD is corrupted inside an otherwise-valid .git directory".
- Mutation-check: reverted src/adapters/git.ts to pre-fix via `git diff` +
  `git apply -R` (no stash), re-ran `bun test test/git-adapter.test.ts` -- new test
  FAILED (received null, expected throw), confirming it exercises the bug. Re-applied
  the fix via `git apply`, same test now PASSES.
- Full suite: `bun test` -> 1873 pass, 0 fail, 5275 expect() calls (47 files).
- `bun run typecheck` -> clean (tsc --noEmit, no errors).
- Existing "returns null in a fresh repo with no commits" test (AC #2) still passes
  unchanged, confirming the genuine unborn-branch case is untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced resolveHeadSha's (src/adapters/git.ts) unborn-vs-corrupted disambiguator: 'git rev-parse --git-dir' (proves only that .git exists/is readable, succeeds even with a malformed HEAD) swapped for 'git symbolic-ref -q HEAD' (succeeds iff HEAD is a well-formed symbolic ref, regardless of whether its target exists -- the true fingerprint of a genuine unborn branch). Added a regression test with a real corrupted .git/HEAD (invalid ref name); mutation-checked via git apply -R/apply (no stash) -- fails pre-fix, passes post-fix. Full suite: bun test 1873 pass/0 fail; bun run typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
