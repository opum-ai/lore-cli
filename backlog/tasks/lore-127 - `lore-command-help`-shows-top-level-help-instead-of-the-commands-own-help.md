---
id: LORE-127
title: '`lore <command> --help` shows top-level help instead of the command''s own help'
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-meta-c
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `run()` (src/cli.ts:170), the check `if (parsed.version || parsed.help || parsed.command === undefined)` fires whenever `--help`/`-h` was parsed anywhere in argv, before `dispatch()` ever runs — even when a command token was already parsed. Because `parseArgs` (cli.ts:83-126) recognizes `--help`/`-h` as a global flag at any position before `--`, `lore query --help` (and every other `lore <command> --help`) renders the top-level 'lore 0.0.0 — OKF-native documentation CLI' usage/catalog instead of that command's own detailed help. This makes per-command `--help` effectively useless and inconsistent with `lore help <command>`, which does work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `lore <command> --help` (e.g. `lore query --help`) renders that command's own detailed help text, not the top-level command catalog.
- [ ] #2 `lore <command> --help` output is byte-identical to `lore help <command>` output, for at least one representative command.
- [ ] #3 `lore --help` with no command token still renders the existing top-level help, and `lore --version`/no-command behavior is unchanged.
<!-- AC:END -->
