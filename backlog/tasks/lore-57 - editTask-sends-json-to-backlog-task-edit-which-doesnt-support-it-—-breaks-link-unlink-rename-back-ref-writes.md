---
id: LORE-57
title: >-
  editTask sends --json to backlog task edit, which doesn't support it — breaks
  link/unlink/rename back-ref writes
status: To Do
assignee: []
created_date: '2026-07-19 14:59'
labels:
  - bug
  - backlog-fork
  - adapter
dependencies:
  - LORE-56
references:
  - src/adapters/backlog.ts
  - docs/runbooks/backlog-json-patch.md
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/adapters/backlog.ts editTask() builds args as ["task", "edit", id, "--json", ...] (line ~782). Per PR #790's scope (docs/runbooks/backlog-json-patch.md), upstream only added --json to three READ commands: task list, task view, and search — task edit never got a --json flag (confirmed: `backlog task edit --help` on a real pinned-commit build at 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 lists no --json option, only --plain). Every real call to `backlog task edit <id> --json ...` fails immediately with "error: unknown option '--json'", exit 1, before Commander even parses --add-label/--remove-label/--status/--doc. editTask does not read any JSON from the response (it only checks exitCode/stderr), so --json is dead weight that actively breaks the call — it should simply not be passed. This silently breaks every write that goes through editTask: lore link/unlink (the doc: back-ref label write) and lore rename (task back-ref repointing, which reuses the same editTask call in src/commands/link.ts).

Found via a real, unmocked pinned-upstream-binary dry run (LORE-56, the Docker E2E harness task) — unit tests never caught this because they mock BacklogAdapter entirely, so the fake never enforces the real CLI's flag surface.

Concrete repro (real binary):
  backlog task edit TASK-1 --add-label "doc:x"              # exit 0, "Updated task TASK-1"
  backlog task edit TASK-1 --json --add-label "doc:x"       # exit 1, "error: unknown option '--json'"

  git init scratch; backlog init --defaults; backlog task create "seed"
  lore init; lore new Story "Test"; lore link stories/test TASK-1
  # -> "TASK-1: ... back-ref failed (`backlog task edit` exited 1)", exit 6
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 editTask() (src/adapters/backlog.ts) no longer includes --json in the args passed to `backlog task edit`
- [ ] #2 lore link against a real pinned-upstream backlog binary successfully writes the doc: label back-ref (no backRef:"failed")
- [ ] #3 lore unlink and lore rename (task back-ref repointing) are also verified against the real binary, since both share editTask()
- [ ] #4 A regression test using the real fake-spawn harness asserts editTask never emits --json in its argv
<!-- AC:END -->
