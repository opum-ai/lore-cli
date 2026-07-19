---
id: LORE-58
title: >-
  `lore link`/`unlink` --json emits a full success-shaped envelope on stdout
  even when exiting nonzero, violating the stdout/stderr contract
status: To Do
assignee: []
created_date: '2026-07-19 14:59'
labels:
  - bug
  - cli-contract
dependencies:
  - LORE-56
  - LORE-57
references:
  - src/commands/link.ts
  - docs/runbooks/agent-onboarding.md
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/runbooks/agent-onboarding.md §3.2 documents an absolute rule: "stdout parses or stays silent. On success the --json envelope is the only thing on stdout; on failure stdout is empty and the error goes to stderr... lore ... --json | jq and lore ... > out.json are always safe." Confirmed via a real pinned-upstream-binary run (LORE-56/LORE-57): `lore link <story> <taskId> --json` exits 6 (validation) when a per-task backRef write fails, but still prints a full, well-formed {schemaVersion,kind:"link.result",data:{...,tasks:[{task,status,backRef:"failed",error:"..."}]}} envelope to stdout, with stderr completely empty. A consumer following the documented contract (nonzero exit -> read the ErrorEnvelope from stderr) finds nothing on stderr and has no error object to branch on, even though a diagnostic exists (buried in data.tasks[].error). This is independent of the editTask --json root cause fixed in LORE-57: ANY future per-task write failure inside link/unlink (a task deleted mid-run, a permissions issue, etc.) will reproduce the same contract violation, because link.ts folds partial per-item failures into the success envelope shape while still setting a nonzero exit code.

This needs a design decision, not a mechanical fix: either (a) link/unlink always exit 0 and encode partial failure only in data (update the documented contract to say partial per-task failure is data, not an error), or (b) a nonzero exit routes the standard {error_type,message,hint,input} ErrorEnvelope to stderr with empty stdout, same as every other lore failure, and the per-task detail moves into the hint/input.

Concrete repro (needs a real --json-capable backlog binary; see LORE-56):
  lore link stories/test TASK-1 --json 1>out.json 2>err.txt; echo $?
  # exit 6; out.json is a full parseable link.result envelope; err.txt is empty
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Pick and document one resolution: (a) link/unlink exit 0 with partial failures only in data, contract doc updated to say so explicitly, or (b) nonzero exit routes the standard ErrorEnvelope to stderr with empty stdout
- [ ] #2 A regression test asserts stdout is empty whenever lore link/unlink --json exits nonzero (or, if option (a) is chosen, that they never exit nonzero for a per-task write failure)
- [ ] #3 docs/reference/cli-contract.md and docs/runbooks/agent-onboarding.md are reconciled with whichever behavior is chosen
<!-- AC:END -->
