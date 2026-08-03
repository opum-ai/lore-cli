---
id: LCLI-58
title: >-
  `lore link`/`unlink` --json emits a full success-shaped envelope on stdout
  even when exiting nonzero, violating the stdout/stderr contract
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:10'
labels:
  - bug
  - cli-contract
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies:
  - LCLI-56
  - LCLI-57
references:
  - src/commands/link.ts
  - docs/runbooks/agent-onboarding.md
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/runbooks/agent-onboarding.md §3.2 documents an absolute rule: "stdout parses or stays silent. On success the --json envelope is the only thing on stdout; on failure stdout is empty and the error goes to stderr... lore ... --json | jq and lore ... > out.json are always safe." Confirmed via a real pinned-upstream-binary run (LCLI-56/LCLI-57): `lore link <story> <taskId> --json` exits 6 (validation) when a per-task backRef write fails, but still prints a full, well-formed {schemaVersion,kind:"link.result",data:{...,tasks:[{task,status,backRef:"failed",error:"..."}]}} envelope to stdout, with stderr completely empty. A consumer following the documented contract (nonzero exit -> read the ErrorEnvelope from stderr) finds nothing on stderr and has no error object to branch on, even though a diagnostic exists (buried in data.tasks[].error). This is independent of the editTask --json root cause fixed in LCLI-57: ANY future per-task write failure inside link/unlink (a task deleted mid-run, a permissions issue, etc.) will reproduce the same contract violation, because link.ts folds partial per-item failures into the success envelope shape while still setting a nonzero exit code.

This needs a design decision, not a mechanical fix: either (a) link/unlink always exit 0 and encode partial failure only in data (update the documented contract to say partial per-task failure is data, not an error), or (b) a nonzero exit routes the standard {error_type,message,hint,input} ErrorEnvelope to stderr with empty stdout, same as every other lore failure, and the per-task detail moves into the hint/input.

Concrete repro (needs a real --json-capable backlog binary; see LCLI-56):
  lore link stories/test TASK-1 --json 1>out.json 2>err.txt; echo $?
  # exit 6; out.json is a full parseable link.result envelope; err.txt is empty
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pick and document one resolution: (a) link/unlink exit 0 with partial failures only in data, contract doc updated to say so explicitly, or (b) nonzero exit routes the standard ErrorEnvelope to stderr with empty stdout
- [x] #2 A regression test asserts stdout is empty whenever lore link/unlink --json exits nonzero (or, if option (a) is chosen, that they never exit nonzero for a per-task write failure)
- [x] #3 docs/reference/cli-contract.md and docs/runbooks/agent-onboarding.md are reconciled with whichever behavior is chosen
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design decision (AC#1): option (b) chosen after a user check-in — nonzero exit + standard ErrorEnvelope on stderr, uniform with every other lore command. Per-task detail (concept/changed/tasks/backlogCommit) moves into the ErrorEnvelope's `input` field (src/errors.ts's LoreError.input is already typed to carry an arbitrary structured object) rather than a partial-success envelope on stdout.

Implementation: runLink/runUnlink (src/commands/link.ts) now throw a `drift` LoreError (via a new backRefFailure() helper) instead of emit()-ing the report + returning a nonzero code, whenever any per-task back-ref edit or the backlog/ commit fails. The doc-side frontmatter write and any successful per-task edits still happen and are not undone -- only how the outcome is reported changes. message/hint summarize what failed (task ids + reasons, or the commit failure); input carries the full per-task report, same granularity as the old stdout envelope.

Verification:
- Unit: rewrote the 6 existing tests in test/link.test.ts that asserted the old return-code + stdout-report shape on a drift outcome, to catch the thrown LoreError and read err.input instead. Added expectLinkError/expectUnlinkError helpers that assert stdout stays empty on every failure (AC#2), covering every existing + new error-path test (not-found, usage, conflict, and now drift) -- broader than one single dedicated test. Also added a dedicated mode-independence test confirming the throw + empty-stdout behavior is identical under plain output mode (runLink itself never renders text on the error path -- that's the CLI dispatch layer's job). Full suite: bun test -> 1498 pass, 0 fail. typecheck/lint clean.
- Real binary: re-ran docker/e2e/ (pinned upstream backlog @ 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0) after the fix -- 81/81 PASS, confirming no regression on the happy path (link/unlink continue to work end-to-end with the LCLI-57 fix). The harness doesn't have a deterministic way to force a per-task Backlog write failure against a real binary (LCLI-57 removed the only trigger it exercised), so the drift/error-envelope path itself is verified at the unit level (AC#2) rather than via a new E2E scenario -- consistent with how link.test.ts's fake adapter already simulates a poisoned edit.
- Docs (AC#3): docs/reference/cli-contract.md §4 and docs/runbooks/agent-onboarding.md §3.2 already stated the universal "stdout parses or stays silent, error on stderr" rule with no link/unlink carve-out documenting the old buggy behavior as intended -- so no contradiction needed reconciling. Added an explicit one-line clarification to both, plus docs/reference/cli-surface.md's link/unlink Output rows, stating a partial per-task failure follows the same rule (never a partial-success stdout envelope) -- closing the ambiguity gap that let the original bug ship unnoticed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
link/unlink now throw a drift LoreError (via a new backRefFailure() helper in src/commands/link.ts) instead of emitting a success-shaped envelope on a nonzero exit, whenever a per-task back-reference edit or the backlog/ commit fails -- uniform with every other lore command's stdout-empty-on-failure contract (option (b), per user decision). Per-task detail moves into the ErrorEnvelope's input field. Verified with 1498/1498 unit tests (6 existing drift tests rewritten to the new throw-based shape, plus stdout-emptiness now asserted on every error-path test via shared helpers) and a real pinned-upstream-binary E2E run (81/81, no regression). cli-contract.md, agent-onboarding.md, and cli-surface.md updated to make the uniform contract explicit for multi-item commands.
<!-- SECTION:FINAL_SUMMARY:END -->
