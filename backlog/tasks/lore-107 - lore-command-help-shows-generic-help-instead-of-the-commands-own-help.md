---
id: LORE-107
title: lore <command> --help shows generic help instead of the command's own help
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cli-entry-state
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
parseArgs in src/cli.ts (lines 90-124) recognizes `--help`/`-h` anywhere in argv before a `--` token, including after a command has already been parsed, and unconditionally sets the global `help` flag. run() (lines 168-181) checks `parsed.help` before dispatch() and always renders renderTopLevelHelp(), so a command never gets a chance to see its own `--help`/`-h` token. As a result, `lore query --help` (or any `lore <cmd> --help`) prints the generic top-level command catalog instead of that command's detailed help, which is misleading since users expect `--help` to describe the command they just typed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore query --help` (and `lore <cmd> -h` for other commands) renders that command's own detailed help output, not renderTopLevelHelp()'s generic command catalog.
- [ ] #2 A new or updated test in test/help.test.ts asserts `lore <cmd> --help` output equals (or is equivalent to) `lore help <cmd>` output, for at least one representative subcommand, so this equivalence is regression-tested going forward.
- [ ] #3 `lore --help` and `lore help` (no command token) continue to render the top-level help unchanged.
<!-- AC:END -->
