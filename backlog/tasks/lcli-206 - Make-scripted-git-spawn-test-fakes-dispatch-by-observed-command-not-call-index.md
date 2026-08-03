---
id: LCLI-206
title: >-
  Make scripted git-spawn test fakes dispatch by observed command, not call
  index
status: Done
assignee:
  - '@orchestrator'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - build-runtime
  - codex-review-followup
  - test
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
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
- [x] #1 `dirtyGitSpawn` and `failingCommitGitSpawn` return the injected porcelain entry when the observed command is the `git status` read (keyed on the args, e.g. `args[0] === "status"`), not on a `call === 2` counter.
- [x] #2 `failingCommitGitSpawn` fails only the `commit` call (`args[0] === "commit"`) and returns exit-0 for every other observed command (rev-parse, status returns the porcelain, add).
- [x] #3 `cleanGitSpawn` is left unchanged (it already answers every call uniformly and does not dispatch by index).
- [x] #4 The full `bun test` suite passes — in particular the only three suites that inject these shared fakes and assert on `.calls`: test/sync.test.ts, test/link.test.ts, and test/rename.test.ts (test/state.test.ts is unaffected, as it uses its own local scriptedSpawn).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reconciled Done as a DUPLICATE finding. LCLI-206 (build-runtime finding [2]) and LCLI-205 (build-ci-config finding) describe the SAME issue in the SAME two fakes in test/helpers.ts. LCLI-205 merged in wave 20 (PR#195, commit 1cc7275) already implemented exactly this: dirtyGitSpawn returns the porcelain on args[0]==='status' (test/helpers.ts:69), failingCommitGitSpawn returns porcelain on args[0]==='status' and fails only args[0]==='commit' (test/helpers.ts:85-86), cleanGitSpawn left unchanged, and the full suite (incl. sync/link/rename consumers) is green at 1917 pass on dev. All 4 ACs verified satisfied on dev @ 3e31292; no separate code change needed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Duplicate of LCLI-205; resolved-by-merge in wave 20 (PR#195, 1cc7275). test/helpers.ts already dispatches dirtyGitSpawn/failingCommitGitSpawn on the observed git subcommand, not call index; cleanGitSpawn unchanged; suite green. No separate change.
<!-- SECTION:FINAL_SUMMARY:END -->
