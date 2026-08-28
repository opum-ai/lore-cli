---
id: LCLI-358.1
title: >-
  Run the lore init preflight before any write, and make git required with an
  escape hatch
status: To Do
assignee: []
created_date: '2026-08-28 21:46'
labels:
  - init
  - git
  - dx
dependencies: []
parent_task_id: LCLI-358
ordinal: 480000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today src/commands/init.ts writes the whole base scaffold (docs/, .lore/) before the wizard asks its first question, so a Ctrl-D or a declined prompt leaves a half-applied bundle. Move every check ahead of the first byte written.

Git is effectively required: `lore sync` fails without it (`git rev-parse HEAD exited 128: not a git repository`, confirmed 2026-08-28) and `quest init` refuses a non-git path. `lore check` still works, so a docs-only bundle stays legitimate — hence an escape hatch rather than a wall.

docker/e2e/run-e2e.sh:269 already runs `git init` first, so e2e is unaffected; three unit tests in test/init.test.ts use bare temp dirs and need the flag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A non-git directory prompts to run `git init`; accepting initializes the repository and continues
- [ ] #2 Declining exits non-zero with a diagnostic naming lore sync's git dependency, and leaves the directory byte-for-byte unchanged
- [ ] #3 `--allow-no-git` skips the requirement for a docs-only bundle, in both the wizard and the non-interactive path
- [ ] #4 An interrupted wizard (EOF/Ctrl-D) leaves no partially written bundle
<!-- AC:END -->
