---
id: LCLI-107
title: lore <command> --help shows generic help instead of the command's own help
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - codex-review-followup
  - cli-entry-state
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
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
- [x] #1 Running `lore query --help` (and `lore <cmd> -h` for other commands) renders that command's own detailed help output, not renderTopLevelHelp()'s generic command catalog.
- [x] #2 A new or updated test in test/help.test.ts asserts `lore <cmd> --help` output equals (or is equivalent to) `lore help <cmd>` output, for at least one representative subcommand, so this equivalence is regression-tested going forward.
- [x] #3 `lore --help` and `lore help` (no command token) continue to render the top-level help unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
In cli.ts run(): stop treating --help/-h as a top-level short-circuit whenever a command is also present. Split the existing 'version || help || no-command' branch into (a) version/no-command (unchanged top-level path, still rejectStrayCommandFlags) and (b) a new branch: if parsed.help is true AND a command was given, rejectStrayCommandFlags(commandArgs) then delegate to runHelp({args:[command]}) — the same code path as 'lore help <command>' — instead of renderTopLevelHelp(). Add regression tests to test/help.test.ts asserting 'lore query --help'/'lore query -h' equal 'lore help query', and that 'lore --help'/'lore help' with no command token are unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test test/help.test.ts (28 pass, 3 new tests), bun test (full suite: 1700 pass / 0 fail), bun run typecheck (clean), bun run lint (no new issues in src/cli.ts or test/help.test.ts; 4 pre-existing unrelated infos in other test files). Manually exercised: lore query --help / lore query -h / lore help query all render byte-identical command help; lore --help and lore help render the unchanged top-level catalog; lore init --bogus --help still exits 2 (stray-flag guard preserved).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed cli.ts run(): --help/-h given alongside a command now renders that command's own detailed help (via runHelp, same as 'lore help <cmd>') instead of the generic top-level catalog. Split the old combined version/help/no-command short-circuit into a version/no-command branch (unchanged) and a new help+command branch that still rejects stray unrecognized flags first (preserves the 'typo'd flag not swallowed by --help' invariant). lore --help / lore help with no command token are untouched. Added 3 regression tests to test/help.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
