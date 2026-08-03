---
id: LCLI-212
title: Strengthen validate's realpath de-dup test with a genuine symlink alias
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - cmd-meta-d
  - codex-review-followup
  - test-coverage
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: task
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** the `validate` realpath-dedup test genuinely exercises `canonicalIdentity`'s realpath fold, so a regression that degraded it would fail a test.

**Why:** the "realpath de-dup" test at `test/validate.test.ts:823` ("the same physical file named twice is validated once") passes the identical string `"docs/r.md"` twice. In `collectFiles` (`src/commands/validate.ts:157-166`) both spellings `resolve()` to the same absolute path, so the duplicate collapses even without `canonicalIdentity`'s realpath fold (`src/commands/discover.ts:56`, `realpathSync.native`). The test would still pass if `canonicalIdentity` were degraded to return its input unchanged, leaving validate's actual symlink/case-alias de-dup mechanism uncovered. No other test kills that mutant: `test/validate.test.ts:831` only asserts a symlink is *surfaced on stderr* during a directory walk, and `test/replace.test.ts:510` *skips* the symlink via `walkMarkdown` rather than folding it via `canonicalIdentity`.

**Live context:** de-dup key is computed at `src/commands/validate.ts:160` (`const identity = canonicalIdentity(absFile)`); the fold itself is `src/commands/discover.ts:56-62`. A directly-passed symlink alias exercises it because `expandTarget` (`validate.ts:180-196`) `statSync`-follows the link and expands it, then `canonicalIdentity` resolves it onto the target's realpath.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity findings, cluster cmd-meta-d.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `test/validate.test.ts` gains a POSIX-only case (guarded `test.skipIf(process.platform === "win32")`, matching the file's existing symlink-test convention) that writes a real concept file and a symlink alias pointing at it (e.g. `docs/real.md` and `docs/link.md -> docs/real.md`), runs `runValidate` with BOTH paths passed explicitly, and asserts the resulting `report.files` has length 1.
- [x] #2 The new test is a true mutation-killer: it passes on current `dev` and would fail if `canonicalIdentity` in `src/commands/discover.ts` were changed to return its input unchanged (verify by a temporary local edit, then revert).
- [x] #3 `bun test test/validate.test.ts` passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a POSIX-only test.skipIf(win32) case right after the existing 'realpath de-dup' test in test/validate.test.ts: write docs/real.md, symlinkSync docs/link.md -> docs/real.md, call runValidate with args ['docs/real.md','docs/link.md'], assert report.files has length 1.
2. Run bun test test/validate.test.ts to confirm it passes on pristine dev.
3. Prove mutation-killer property: temporarily edit canonicalIdentity in src/commands/discover.ts to 'return abs;' (drop the realpathSync.native fold), rerun the test file, confirm exactly the new test fails (report.files length 2).
4. Revert discover.ts to its original realpathSync.native implementation; confirm git diff on discover.ts is empty.
5. Re-run bun test test/validate.test.ts (pass), full bun test (0 fail), bun run typecheck (clean), and bunx biome check on the changed file.
6. Finalize backlog task and commit only test/validate.test.ts + backlog/tasks file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added POSIX-only test (test.skipIf(process.platform === 'win32')) right after the existing realpath de-dup test at test/validate.test.ts:823. It writes docs/real.md and a symlink docs/link.md -> docs/real.md, calls runValidate with BOTH distinct paths ['docs/real.md','docs/link.md'], and asserts report.files has length 1 (unlike the old test, these two path strings do NOT resolve() to the same string — only canonicalIdentity's realpath fold can collapse them).

Mutation-killer proof (AC#2): temporarily edited canonicalIdentity in src/commands/discover.ts to 'return abs;' (dropping the realpathSync.native fold). Re-ran bun test test/validate.test.ts: 61 pass / 1 fail — the ONLY failure was the new test (report.files length 2 instead of 1), confirming it genuinely exercises the realpath fold. Reverted discover.ts immediately after; git diff -- src/commands/discover.ts is empty (pristine), confirmed via git status/diff before finalizing.

Verification: bun test test/validate.test.ts -> 62 pass, 0 fail. Full bun test -> 1918 pass, 0 fail across 47 files. bun run typecheck -> clean (tsc --noEmit, no output). bunx biome check test/validate.test.ts -> no issues. Final diff touches only test/validate.test.ts (16 insertions) plus this backlog task file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a genuine mutation-killer test to test/validate.test.ts, immediately after the existing 'realpath de-dup' test: a POSIX-only (test.skipIf win32) case that writes docs/real.md and a symlink docs/link.md -> docs/real.md, runs runValidate with both distinct path strings passed explicitly, and asserts report.files has length 1. Proved the mutation-killer property by temporarily degrading canonicalIdentity (src/commands/discover.ts) to return its input unchanged: the new test failed (2 files instead of 1) while all 61 other validate tests still passed, isolating exactly the intended kill; discover.ts was reverted and confirmed pristine (empty git diff) before finalizing. Verified: bun test test/validate.test.ts (62 pass/0 fail), full bun test (1918 pass/0 fail, 47 files), bun run typecheck (clean), bunx biome check test/validate.test.ts (clean). Final diff is scoped to test/validate.test.ts only (plus this task file).
<!-- SECTION:FINAL_SUMMARY:END -->
