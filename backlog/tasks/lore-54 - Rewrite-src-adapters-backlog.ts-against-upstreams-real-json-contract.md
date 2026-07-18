---
id: LORE-54
title: Rewrite src/adapters/backlog.ts against upstream's real --json contract
status: Done
assignee: []
created_date: '2026-07-18 00:02'
updated_date: '2026-07-18 16:47'
labels:
  - core
  - adapter
milestone: m-0
dependencies:
  - LORE-53
documentation:
  - docs/reference/backlog-json-schema.md
  - docs/reference/backlog-cli-contract.md
priority: medium
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/adapters/backlog.ts (LORE-4/LORE-21) was built against the jeremy-newhouse/Backlog.md fork's own {schemaVersion, kind, data} envelope design. lore is adopting upstream's independently-shipped --json contract instead (PR #790, BACK-545 -- see docs/reference/backlog-json-schema.md §8 for the full comparison). As written today the adapter would fail its own capability probe against upstream's real output: different envelope shape (per-command tasks/task/results keys, not a shared data key), a numeric schemaVersion instead of a string, hyphenated kind spellings (task-list/task-view/search), different task/search-hit fields, and a not-found exit code that flips from 0 to 1. Depends on LORE-53 (the pinned-commit dependency) so there's a real upstream build to test against.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/adapters/backlog.ts's envelope parsing, Zod schemas (EnvelopeSchema, TaskSchema, TaskSummarySchema, SearchHitSchema), and probeBacklog match upstream's real contract: per-command envelope keys (`tasks`/`task`/`results`, not `data`), numeric `schemaVersion`, and `kind: "task-list"`/`"task-view"`/`"search"` spelling
- [x] #2 viewTask's missing-task detection uses upstream's nonzero exit code (`task view <missing>` exits 1) instead of the fork's empty-stdout signal
- [x] #3 The golden test suite (test/backlog-json-golden.test.ts and its fixtures) is recaptured against the pinned upstream build and passes
- [x] #4 docs/reference/backlog-json-schema.md §1-7 is rewritten to describe upstream's contract as the current, shipped shape (no longer marked pending-migration)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read upstream's real serializer (src/formatters/json-output.ts) in a pinned worktree
   (MrLesk/Backlog.md @ 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0) to get the exact field-by-field
   contract, then capture real task-view/task-list/search envelopes by running the interpreted CLI
   (bun src/cli.ts) against this repo's own backlog/ project, plus confirm the missing-task exit
   code (both `task view <missing>` and the bare `task <missing>` shortcut exit 1, stdout empty).
2. Trace every call site of EXPECTED_SCHEMA_VERSION / EnvelopeSchema's kind literals / data-key
   reads across src/ and test/ before editing (grep), per the handover's explicit warning that
   LORE-53's probe and a real listTasks() read shared one collision point and LORE-54's blast
   radius is the whole adapter.
3. Rewrite src/adapters/backlog.ts: merge EXPECTED_SCHEMA_VERSION/PROBE_SCHEMA_VERSION into one
   numeric constant; rewrite TaskSummarySchema/TaskSchema/SearchHitSchema/EnvelopeSchema against
   upstream's real per-command envelope (tasks/task/results payload keys, hyphenated kind, numeric
   schemaVersion); rewrite parseEnvelope to take a payloadKey param instead of a shared `data` key;
   rewrite mapSummary/mapTask for the new field set (drop source/branch/onStatusChange/
   parentTaskTitle -- upstream never exposes them; widen priority/type from a closed enum to an
   open config-driven string; move `file` off the base BacklogTask onto BacklogTaskDetail only,
   since upstream's list/search summaries carry no path at all -- only task view does).
4. Flip viewTask's missing-task detection from empty-stdout to exit-code 1 (with a drift guard if
   exit 1 unexpectedly prints something).
5. Recapture golden fixtures: rewrite test/support/record-backlog-goldens.ts to shell the pinned
   upstream CLI (dropping the now-unneeded absolute-path redaction machinery, since upstream's
   `path` is already project-relative), rename fixtures to task-view.json/task-list.json/
   search.json, and regenerate them against the real pinned build.
6. Rewrite test/backlog-adapter.test.ts and test/backlog-json-golden.test.ts for the new shapes;
   collapse the two-tier probe/read fake in backlog-adapter.test.ts back to one shared golden now
   that both target the same contract; update test/helpers.ts's fake adapter and
   test/backlog-probe.test.ts's PROBE_SCHEMA_VERSION->EXPECTED_SCHEMA_VERSION rename.
7. Rewrite docs/reference/backlog-json-schema.md §1-7 to describe upstream's contract as current
   (not pending), condense §8 into a completed migration history; update the "still pending
   LORE-54" callouts in docs/reference/backlog-cli-contract.md (§2.2, §5) and
   docs/runbooks/backlog-json-patch.md §8.1, and fix the resulting stale anchor in
   docs/adr/0002-backlog-integration-json-only.md. Validate with `lore check`.
8. Verify: bun test, bun run typecheck, bun run lint, bun run lore check, plus a real end-to-end
   run of the actual createBacklogAdapter (not just fake-spawn unit tests) against the pinned
   upstream binary -- probe/listTasks/viewTask/viewTask(missing)/searchTasks all exercised for
   real, per the AC#3 "against a real build" bar LORE-53 set.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per plan. src/adapters/backlog.ts: merged EXPECTED_SCHEMA_VERSION/PROBE_SCHEMA_VERSION
into one numeric constant (=1); TaskSummarySchema/TaskSchema/SearchHitSchema/EnvelopeSchema rewritten
against upstream's real per-command envelope (tasks/task/results payload keys, hyphenated kind
task-list/task-view/search, numeric schemaVersion); parseEnvelope now takes a payloadKey param instead
of reading a shared `data` key; mapSummary/mapTask updated for the new field set. Dropped
source/branch/onStatusChange/parentTaskTitle from BacklogTaskDetail -- upstream never exposes them
("branch metadata... are not exposed", CLI-INSTRUCTIONS.md), confirmed via grep that no command in
src/commands/ read any of them. Widened BacklogPriority from a closed "high"|"medium"|"low" enum to an
open string|null -- upstream's priority AND type fields are both config-driven open sets
(backlog/config.yml priorities:/types:), not a fixed set; a custom priority label would have failed
Zod validation under the old closed enum. Moved `file` off the base BacklogTask onto BacklogTaskDetail
only, since upstream's task-list/search summaries carry no path at all (only task view's `path` does,
already project-relative -- no absolute host-specific field survives in the new contract at all).
Confirmed via grep that no command read .file off a listTasks()/searchByLabel()/searchTasks() result,
only off viewTask()'s BacklogTaskDetail -- matches backlog-cli-contract.md §1.2's pre-existing design
note that only task view carries the file path.

viewTask's missing-task detection flipped from empty-stdout (exit 0) to exit-code 1, per upstream PR
#790 making `task view <missing>` (and bare `task <missing>`) exit 1 unconditionally in every output
mode. Verified directly against the real pinned binary: `task view LORE-NOPE-999 --json` and
`task LORE-NOPE-999 --json` both print "Task LORE-NOPE-999 not found." to stderr, empty stdout, exit 1.

Real end-to-end verification (not just fake-spawn unit tests, per LORE-53's precedent and this
project's "Do not repeat" note): cloned MrLesk/Backlog.md into a git worktree at the pinned commit
(22a091b570d44c4f302ca47e7fd36fa28ad8bcb0), bun install, read src/formatters/json-output.ts (the real
serializer source) and CLI-INSTRUCTIONS.md's "Stable JSON output" section to get the exact field-by-
field contract, then ran the interpreted CLI (bun src/cli.ts, same technique as LORE-53 and
test/support/record-backlog-goldens.ts) against this repo's own backlog/ project for real
task-view/task-list/search output and the missing-task exit code. Regenerated the golden fixtures
(test/fixtures/backlog-json/task-view.json, task-list.json, search.json -- renamed from
task.json/task-list.json/search-result.json to match upstream's hyphenated kind names) via a rewritten
test/support/record-backlog-goldens.ts that shells the pinned upstream CLI; dropped the now-dead
absolute-path redaction machinery (REPO_PLACEHOLDER/redactRepoRoot) since upstream's `path` is already
project-relative -- there is no absolute, host-specific field left in the envelope to redact. Then, as
a further real-binary check beyond the golden fixtures, wired the actual createBacklogAdapter (not a
fake spawn) to the pinned upstream CLI via a throwaway script (deleted after use, never committed) and
exercised probe/listTasks(status filter)/viewTask/viewTask(missing)/searchTasks for real -- all passed,
including the exit-1 missing-task flip against genuine upstream output.

Test harness: test/backlog-adapter.test.ts's two-tier probe/read fake (PROBE_ENVELOPE vs TASK_LIST,
needed by LORE-53 because the probe and a real listTasks() read shared an argv but targeted different
contracts) collapsed back to one shared golden now that both sides target upstream's contract, per the
handover's explicit instruction not to leave the two-tier fake in place once they converge.
test/helpers.ts's makeTask/toSummary fakes and test/backlog-probe.test.ts's
PROBE_SCHEMA_VERSION->EXPECTED_SCHEMA_VERSION import rename updated to match.

Docs: docs/reference/backlog-json-schema.md §1-7 rewritten to describe upstream's contract as current
(dropped the "pending migration" framing); §8 condensed from a forward-looking comparison table into a
completed migration-history section, preserving the fork's old shape as a documented historical
footnote (full detail remains in the runbook, which was already framed as historical). Updated the
"still pending LORE-54" / "this flips on migration" callouts in docs/reference/backlog-cli-contract.md
(§1, §2.2, §5, and two Appendix mentions of "the fork") and docs/runbooks/backlog-json-patch.md §8.1 to
describe the now-complete migration; fixed the resulting stale #8-migration-target-... anchor in
docs/adr/0002-backlog-integration-json-only.md. Verified with `lore check` (37 files, 0 errors) and
`lore validate` on all four touched docs (0 errors; one pre-existing, unrelated frontmatter-length
warning on ADR-0002, confirmed via git diff to predate this change).

Verification: bun test (1485 pass, 0 fail), bun run typecheck (clean), bun run lint (clean, 4
pre-existing infos unrelated to this change, same ones LORE-53 noted), bun run lore check (37 files, 0
errors/0 warnings), plus the real-upstream-binary adapter run described above.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote src/adapters/backlog.ts's envelope parsing, Zod schemas (EnvelopeSchema/TaskSchema/TaskSummarySchema/SearchHitSchema), and mapping functions from the jeremy-newhouse/Backlog.md fork's {schemaVersion, kind, data} contract to upstream's real, independently-shipped one (PR #790): per-command payload keys (tasks/task/results), numeric schemaVersion, hyphenated kind (task-list/task-view/search). Merged the probe-only PROBE_SCHEMA_VERSION back into EXPECTED_SCHEMA_VERSION now that both target the same contract. Flipped viewTask's missing-task detection from the fork's exit-0/empty-stdout signal to upstream's exit-1-unconditional signal. Recaptured all three golden fixtures against a real, locally built copy of the pinned upstream commit (22a091b), and further verified the real createBacklogAdapter end-to-end against that binary (not just fake-spawn unit tests) -- probe, listTasks, viewTask, viewTask(missing)->null, and searchTasks all confirmed against genuine output. Rewrote docs/reference/backlog-json-schema.md $1-7 to describe upstream's contract as current and condensed $8 into a completed migration history, plus updated the 'pending LORE-54' callouts in backlog-cli-contract.md and the runbook. Verification: bun test (1485 pass), typecheck clean, lint clean (4 pre-existing infos), lore check (37 files/0 errors).
<!-- SECTION:FINAL_SUMMARY:END -->
