---
id: LCLI-106
title: Golden recorder trusts a live mutable task and an unverified upstream CLI path
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - build-runtime
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
record-backlog-goldens.ts:44 defaults `TASK_VIEW_ID` to `"LCLI-33"`, a real, mutable task living in this repo's own `backlog/`, so if that task's fields ever change for unrelated reasons, a future golden-regeneration run would silently bake that drift into the committed `task-view.json` golden and misattribute it to an upstream contract change. Separately, lines 50-51 resolve `UPSTREAM_CLI` from the `LORE_BACKLOG_UPSTREAM_CLI` env var (default `~/repos/Backlog.md-upstream/src/cli.ts`) with no check anywhere in the file that the resolved binary's checked-out commit matches the pinned `BACKLOG_COMMIT` (`22a091b...`) documented in docker/e2e/Dockerfile, so goldens could be regenerated against an unpinned or mismatched upstream revision without warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Before writing goldens, the script verifies the resolved `UPSTREAM_CLI`'s checked-out commit against the pinned `BACKLOG_COMMIT`, and aborts with a clear error (instead of writing goldens) when they don't match.
- [x] #2 The script validates that the fetched `TASK_VIEW_ID` specimen still matches its documented shape (Done status, plan, notes, two acceptance criteria, dependencies, documentation, null finalSummary) before writing the golden, and fails loudly if the live task no longer matches that shape.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add two write-no-golden guards to test/support/record-backlog-goldens.ts, run in main() BEFORE mkdirSync/any writeFileSync:
   - assertUpstreamCommitPinned(): reads docker/e2e/Dockerfile's `ARG BACKLOG_COMMIT=<sha>` (readPinnedBacklogCommit, parametrized path for testability), resolves UPSTREAM_CLI's checked-out commit via `git -C <dir> rev-parse HEAD` (resolveGitCommit), and compares them (assertCommitPinned, pure) — throws a clear error naming both shas + the checked path on mismatch.
   - assertTaskViewSpecimenShape(envelope, taskId): validates the fetched task-view specimen still has the documented shape (Done, non-empty plan, non-empty notes, exactly 2 acceptanceCriteria, >=1 dependency, >=1 documentation link, null finalSummary) — collects every mismatch into one thrown error. Wired into record() as an optional `validate` callback that runs before trimSample/writeFileSync.
2. Gate the script's own `await main()` behind `if (import.meta.main)` so the new exported guard functions can be unit-tested by importing the module without shelling upstream or touching the fixtures dir.
3. Add test/record-backlog-goldens-guards.test.ts: isolated unit tests for readPinnedBacklogCommit, resolveGitCommit, assertCommitPinned, and assertTaskViewSpecimenShape (good/malformed fixtures, temp git repos via mkdtempSync+gitRun, mutated copies of the real committed task-view.json golden).
4. Verify: bun test (full suite), bun run typecheck, bun run lint on touched files, mutation-check each guard (invert comparison / relax regex / drop AC-count check → confirm the new tests fail; restore → confirm they pass again), and a real end-to-end run of `bun test/support/record-backlog-goldens.ts` in this environment (no upstream checkout present) to confirm it aborts loud (exit 1) before writing any golden.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented both guards in test/support/record-backlog-goldens.ts, run before any write in main():
- readPinnedBacklogCommit(dockerfilePath) parses ARG BACKLOG_COMMIT=<40-hex sha> out of docker/e2e/Dockerfile (read-only).
- resolveGitCommit(dir) shells `git -C <dir> rev-parse HEAD` to find UPSTREAM_CLI's actual checkout commit.
- assertCommitPinned(actual, pinned, cliPath) is the pure compare+throw (AC#1); assertUpstreamCommitPinned() composes the three and runs first in main().
- assertTaskViewSpecimenShape(envelope, taskId) checks Done/plan/notes/2 ACs/dependencies/documentation/null finalSummary, collecting every mismatch into one error (AC#2); wired into record() via a new optional `validate` param that runs before trimSample/writeFileSync.
- Script gated behind `if (import.meta.main)` (matches cli.ts's existing idiom) so importing the module for tests has zero side effects.

Added test/record-backlog-goldens-guards.test.ts (17 tests, isolated/unit — no upstream CLI needed): good/malformed Dockerfile fixtures, real temp git repos (mkdtempSync + gitRun, outside the repo tree to avoid .git-upward-discovery false negatives), and mutated copies of the real committed task-view.json golden for the shape checks.

Verification: bun test 1765/1765 pass; bun run typecheck clean; bunx biome check clean on both touched files (pre-existing unrelated lint infos in supersede.test.ts/other files confirmed present on the unmodified branch too, out of scope). Mutation-checked 3 separate guard hunks (assertCommitPinned's comparison inverted, acceptanceCriteria length check dropped, sha regex relaxed) — each time the corresponding new test(s) failed, then passed again after restoring; diffed the restored file back to identical. Also ran `bun test/support/record-backlog-goldens.ts` for real in this environment (no ~/repos/Backlog.md-upstream present) — it aborts with a clear "could not resolve the checked-out git commit..." error, exit code 1, and wrote zero files under test/fixtures/backlog-json/ (git status confirmed clean) — a live, non-mocked demonstration of AC#1's write-no-golden guarantee.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added two write-no-golden guards to test/support/record-backlog-goldens.ts, both run before any golden is written:

AC#1 (commit pin): assertUpstreamCommitPinned() reads docker/e2e/Dockerfile's `ARG BACKLOG_COMMIT=<sha>` (readPinnedBacklogCommit), resolves UPSTREAM_CLI's actual checked-out commit via `git -C <dir> rev-parse HEAD` (resolveGitCommit), and compares them (assertCommitPinned) — aborting with a clear error naming both shas and the checked path on any mismatch, before mkdirSync/writeFileSync ever run.

AC#2 (specimen shape): assertTaskViewSpecimenShape(envelope, taskId) validates the fetched TASK_VIEW_ID specimen still has the documented shape (Done status, non-empty plan, non-empty notes, exactly 2 acceptanceCriteria, >=1 dependency, >=1 documentation link, null finalSummary), collecting every mismatch into one thrown error; wired into record() as a `validate` callback that runs before trimSample/writeFileSync.

The script's `await main()` is now gated behind `if (import.meta.main)` so the guard functions are importable/unit-testable without side effects.

Verification:
- bun test: 1765/1765 pass (17 new, in test/record-backlog-goldens-guards.test.ts).
- bun run typecheck: clean.
- bunx biome check on both touched files: clean.
- Mutation-checked 3 guard hunks (inverted assertCommitPinned's comparison, dropped the acceptanceCriteria-length check, relaxed the sha regex) — each broke exactly the corresponding new test(s); restored and re-verified identical + green.
- Live end-to-end proof: ran `bun test/support/record-backlog-goldens.ts` in this environment (no ~/repos/Backlog.md-upstream present) — it aborted loud (exit 1, clear "could not resolve the checked-out git commit..." error) and wrote zero files under test/fixtures/backlog-json/ (git status confirmed clean), demonstrating AC#1's write-no-golden guarantee against real conditions, not just mocks.
<!-- SECTION:FINAL_SUMMARY:END -->
