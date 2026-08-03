---
id: LCLI-57
title: >-
  editTask sends --json to backlog task edit, which doesn't support it — breaks
  link/unlink/rename back-ref writes
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:10'
labels:
  - bug
  - backlog-fork
  - adapter
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies:
  - LCLI-56
references:
  - src/adapters/backlog.ts
  - docs/runbooks/backlog-json-patch.md
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/adapters/backlog.ts editTask() builds args as ["task", "edit", id, "--json", ...] (line ~782). Per PR #790's scope (docs/runbooks/backlog-json-patch.md), upstream only added --json to three READ commands: task list, task view, and search — task edit never got a --json flag (confirmed: `backlog task edit --help` on a real pinned-commit build at 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 lists no --json option, only --plain). Every real call to `backlog task edit <id> --json ...` fails immediately with "error: unknown option '--json'", exit 1, before Commander even parses --add-label/--remove-label/--status/--doc. editTask does not read any JSON from the response (it only checks exitCode/stderr), so --json is dead weight that actively breaks the call — it should simply not be passed. This silently breaks every write that goes through editTask: lore link/unlink (the doc: back-ref label write) and lore rename (task back-ref repointing, which reuses the same editTask call in src/commands/link.ts).

Found via a real, unmocked pinned-upstream-binary dry run (LCLI-56, the Docker E2E harness task) — unit tests never caught this because they mock BacklogAdapter entirely, so the fake never enforces the real CLI's flag surface.

Concrete repro (real binary):
  backlog task edit TASK-1 --add-label "doc:x"              # exit 0, "Updated task TASK-1"
  backlog task edit TASK-1 --json --add-label "doc:x"       # exit 1, "error: unknown option '--json'"

  git init scratch; backlog init --defaults; backlog task create "seed"
  lore init; lore new Story "Test"; lore link stories/test TASK-1
  # -> "TASK-1: ... back-ref failed (`backlog task edit` exited 1)", exit 6
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 editTask() (src/adapters/backlog.ts) no longer includes --json in the args passed to `backlog task edit`
- [x] #2 lore link against a real pinned-upstream backlog binary successfully writes the doc: label back-ref (no backRef:"failed")
- [x] #3 lore unlink and lore rename (task back-ref repointing) are also verified against the real binary, since both share editTask()
- [x] #4 A regression test using the real fake-spawn harness asserts editTask never emits --json in its argv
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove "--json" from the args array built in editTask() (src/adapters/backlog.ts:783) -- task edit never supported --json per PR #790's scope (only task list/view/search did); editTask never reads JSON from the response anyway (only checks exitCode/stderr).
2. Update the existing unit test in test/backlog-adapter.test.ts ("builds --add-label / --remove-label / --status...") to drop --json from its expected argv array.
3. Add an explicit regression assertion (AC4) that editTask's argv never contains --json, mirroring the createTask test's `expect(createCall).not.toContain("--json")` pattern.
4. Run bun test (full suite) to confirm no other test encodes the old --json expectation.
5. Verify against a REAL pinned-upstream backlog binary (AC2/AC3): re-run the Docker E2E harness (docker compose -f docker/e2e/docker-compose.yml up --build) after the fix, since it already exercises lore link/unlink/rename against the real binary end to end -- confirms the backref write now succeeds instead of failing.
6. Update docker/e2e/run-e2e.sh's Phase 4 steps (search "LCLI-57"): flip lore link's expected exit from 6 to 0, update lore unlink's comment (it now removes a REAL backref, not a no-op), and flip the re-add lore link step from 6 to 0. Update stale comments describing "the backref failure".
7. Update docs/runbooks/docker-e2e-testing-environment.md's "Known, already-filed regressions" section: remove LCLI-57 from the list (LCLI-58 stays, since it's a distinct structural gap per its own task).
8. Re-run the full Docker E2E suite and confirm still green with the corrected expectations.
9. Finalize per backlog instructions task-finalization: verify each AC with evidence, write final summary, mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: removed "--json" from editTask()'s args array (src/adapters/backlog.ts:783) -- backlog task edit never supported --json per PR #790's scope (only task list/view/search do); editTask never read JSON from the response anyway.

Verification:
- Unit: updated the existing editTask test's expected argv (dropped --json), added a dedicated regression test asserting editTask's argv never contains --json (AC#4). Full suite: bun test -> 1498 pass, 0 fail. bun run typecheck clean. biome clean on both touched files.
- Real binary (AC#2/#3): re-ran docker/e2e/ (pinned upstream backlog @ 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0) after the fix. lore link now writes the doc: back-ref for real (backRef: "added", verified via jq against the --json envelope), lore unlink genuinely removes it (backRef: "removed"), and re-linking works (backRef: "added" again) -- this exercises link/unlink; rename shares the same editTask() call path (LCLI-58's description already documented this sharing) and rename's own phase 15 steps (dry-run + real move + inbound link repoint) all passed too. Full run: 81/81 PASS, 0 FAIL.
- Updated docker/e2e/run-e2e.sh's Phase 4 steps to assert the fixed behavior (exit 0, real backRef add/remove via step_json) instead of the LCLI-57/58 regression baseline; updated docs/runbooks/docker-e2e-testing-environment.md's "Known, already-filed regressions" section to move LCLI-57 out of the regression list.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed --json from editTask()'s args (src/adapters/backlog.ts:783) -- backlog task edit never supported it. Fixes lore link/unlink/rename's Backlog doc: back-ref write, which was silently failing against every real backlog binary. Verified with a full bun test pass (1498/1498) plus a real pinned-upstream-binary run via docker/e2e/ (81/81), including link/unlink/rename exercising the fixed editTask path end to end. run-e2e.sh and the E2E runbook doc updated to assert the corrected behavior.
<!-- SECTION:FINAL_SUMMARY:END -->
