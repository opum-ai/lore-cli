---
id: LORE-205
title: >-
  Test fakes dirtyGitSpawn/failingCommitGitSpawn: dispatch the dirty status on
  the git subcommand, not on call index
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `dirtyGitSpawn` returns the NUL-terminated porcelain entry in response to the `git status` invocation identified by inspecting `args` (e.g. `args[0] === "status"`), not by positional call index; the rev-parse (`--show-prefix`) call and the subsequent `add`/`commit` calls all still resolve exit-0 with empty stdout.
- [ ] #2 `failingCommitGitSpawn` applies the same args-based dispatch for the dirty `status` output, and continues to fail (exit 1) only the `commit` invocation while every earlier call succeeds.
- [ ] #3 Both fakes still record every invocation's args on `.calls` (unchanged public shape), and both remain typed as `GitSpawn & { calls: string[][] }`.
- [ ] #4 `bun test` full suite passes with 0 failures — in particular the dirty-path tests in test/link.test.ts, test/sync.test.ts, and test/rename.test.ts still pass.
<!-- AC:END -->
