---
id: LORE-206
title: >-
  Make scripted git-spawn test fakes dispatch by observed command, not call
  index
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - build-runtime
  - codex-review-followup
  - test
dependencies: []
priority: low
type: chore
ordinal: 308000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In test/helpers.ts, the scripted GitSpawn fakes choose their response by call number: `dirtyGitSpawn` (lines 64-74) and `failingCommitGitSpawn` (lines 82-94) both return the `git status` porcelain on `call === 2` rather than when the observed subcommand is actually `status`. The real sequence they stand in for is `rev-parse --show-prefix` -> `status --porcelain=v1 -z` -> `add` -> `commit` (src/state.ts:318,328,157,163). If that sequence ever gains or loses a call, the fakes would silently return the porcelain for the wrong step and could mask a regression instead of failing loudly. `failingCommitGitSpawn` already validates the `commit` step by command (`args[0] === "commit"`, line 89); the outcome wanted is that both call-index-keyed fakes decide their scripted response from the observed git subcommand rather than a positional counter, hardening the sync/link/rename suites that inject them. NOTE: only test/link.test.ts, test/sync.test.ts, and test/rename.test.ts import these shared helpers; test/state.test.ts uses its own separate local `scriptedSpawn` (test/state.test.ts:30) and is OUT OF SCOPE for this finding. `cleanGitSpawn` (line 48) already answers every call uniformly (exit-0, empty stdout) and needs no change. Provenance: doc-2 Codex second-opinion review, low-severity finding [2] of the build-runtime cluster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `dirtyGitSpawn` and `failingCommitGitSpawn` return the injected porcelain entry when the observed command is the `git status` read (keyed on the args, e.g. `args[0] === "status"`), not on a `call === 2` counter.
- [ ] #2 `failingCommitGitSpawn` fails only the `commit` call (`args[0] === "commit"`) and returns exit-0 for every other observed command (rev-parse, status returns the porcelain, add).
- [ ] #3 `cleanGitSpawn` is left unchanged (it already answers every call uniformly and does not dispatch by index).
- [ ] #4 The full `bun test` suite passes — in particular the only three suites that inject these shared fakes and assert on `.calls`: test/sync.test.ts, test/link.test.ts, and test/rename.test.ts (test/state.test.ts is unaffected, as it uses its own local scriptedSpawn).
<!-- AC:END -->
