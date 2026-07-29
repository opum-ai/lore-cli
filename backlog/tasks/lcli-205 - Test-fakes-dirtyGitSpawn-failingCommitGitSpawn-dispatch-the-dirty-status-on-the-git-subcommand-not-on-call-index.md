---
id: LCLI-205
title: >-
  Test fakes dirtyGitSpawn/failingCommitGitSpawn: dispatch the dirty status on
  the git subcommand, not on call index
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:28'
labels:
  - build-ci-config
  - codex-review-followup
  - test-quality
dependencies: []
priority: low
type: chore
ordinal: 307000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Make the scripted git fakes in `test/helpers.ts` return the dirty `git status` porcelain in response to the actual `status` invocation (identified by inspecting `args`) rather than by positional call count (`call === 2`).

## Why it matters
Both `dirtyGitSpawn` (test/helpers.ts:64-74, dispatch at :70) and `failingCommitGitSpawn` (test/helpers.ts:82-94, dispatch at :88) return the NUL-terminated porcelain entry when `call === 2`. That hard-codes an assumption about the production call order of `commitBacklogIfDirty` — `["rev-parse","--show-prefix"]` (src/state.ts:318) then `["status","--porcelain=v1","-z","--untracked-files=all","--",...]` (src/state.ts:328) then add/commit. If a call is ever inserted before `status`, the fakes silently answer the wrong invocation, so the dirty-path assertions in test/link.test.ts, test/sync.test.ts, and test/rename.test.ts would validate against the wrong git output instead of failing loudly. Dispatching on the subcommand makes the fakes robust to the seam's call order.

## Live locations (dev @ audit time)
- `test/helpers.ts:64-74` — `dirtyGitSpawn`; `return call === 2 ? gitOk(`${porcelainEntry}\0`) : gitOk("")` at :70.
- `test/helpers.ts:82-94` — `failingCommitGitSpawn`; `if (call === 2) return gitOk(`${porcelainEntry}\0`)` at :88, plus its `args[0] === "commit"` failure branch which already dispatches on args and should be preserved.
- Consumers: test/link.test.ts, test/sync.test.ts, test/rename.test.ts.
- Production seam for the expected call shapes: src/state.ts:318 and src/state.ts:328.

## Provenance
Codex second-opinion review (backlog doc-2), low-severity 'build-ci-config' cluster, round-3 re-audit. Still open on dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `dirtyGitSpawn` returns the NUL-terminated porcelain entry in response to the `git status` invocation identified by inspecting `args` (e.g. `args[0] === "status"`), not by positional call index; the rev-parse (`--show-prefix`) call and the subsequent `add`/`commit` calls all still resolve exit-0 with empty stdout.
- [x] #2 `failingCommitGitSpawn` applies the same args-based dispatch for the dirty `status` output, and continues to fail (exit 1) only the `commit` invocation while every earlier call succeeds.
- [x] #3 Both fakes still record every invocation's args on `.calls` (unchanged public shape), and both remain typed as `GitSpawn & { calls: string[][] }`.
- [x] #4 `bun test` full suite passes with 0 failures — in particular the dirty-path tests in test/link.test.ts, test/sync.test.ts, and test/rename.test.ts still pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In dirtyGitSpawn (test/helpers.ts:64-74): replace 'call === 2' dispatch with an args-based check (args[0] === 'status') so the dirty porcelain is returned in response to the actual git status invocation, regardless of position; rev-parse and add/commit calls fall through to gitOk(''). 2. In failingCommitGitSpawn (test/helpers.ts:82-94): same args-based dispatch for the dirty status output; preserve the existing args[0] === 'commit' failure branch untouched, ensure a subcommand ordering (status check first, then commit check, else gitOk('')) still fails only commit. 3. Keep call counter removed if unused, or leave calls array untouched -- .calls recording unchanged, return type unchanged (GitSpawn & { calls: string[][] }). 4. Run full bun test + bun run typecheck; explicitly confirm test/link.test.ts, test/sync.test.ts, test/rename.test.ts pass. 5. Finalize task and commit only test/helpers.ts + backlog/tasks file.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced positional call===2 dispatch in both dirtyGitSpawn and failingCommitGitSpawn with args[0]==="status" dispatch, robust to call order. failingCommitGitSpawn's args[0]==="commit" failure branch preserved unchanged and now checked after the status branch. Public shape unchanged: both still push every call's args onto .calls and remain typed GitSpawn & { calls: string[][] }. Verified: bun run typecheck clean (tsc --noEmit, 0 errors); full bun test 1913 pass / 0 fail across 47 files; targeted run of bun test test/link.test.ts test/sync.test.ts test/rename.test.ts (the dirty-path consumers named in the task) = 200 pass / 0 fail.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
dirtyGitSpawn and failingCommitGitSpawn in test/helpers.ts now dispatch the dirty git-status porcelain by inspecting args[0]==="status" instead of a positional call-index (call===2), making the fakes robust to any change in commitBacklogIfDirty's call order. failingCommitGitSpawn's existing args[0]==="commit" exit-1 failure branch is preserved untouched. Public shape (.calls recording, GitSpawn & { calls: string[][] } typing) is unchanged. Verified via bun run typecheck (clean) and bun test (1913 pass/0 fail full suite; 200 pass/0 fail for the named dirty-path consumers link.test.ts/sync.test.ts/rename.test.ts).
<!-- SECTION:FINAL_SUMMARY:END -->
