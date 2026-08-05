---
id: LCLI-315.3
title: 'Let lore init choose the tracker backend, via wizard prompt and matching flag'
status: To Do
assignee: []
created_date: '2026-08-04 21:49'
labels: []
dependencies:
  - LCLI-315.1
documentation:
  - docs/adr/0017-interactive-init-wizard-tty-gated.md
parent_task_id: LCLI-315
priority: medium
type: feature
ordinal: 437000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Surface the tracker choice at setup time and persist it to `.lore/config.toml`.

`lore init` already has the machinery. A bare invocation on an interactive terminal runs a guided wizard with a `choose(question, choices, defaultValue)` primitive (`src/commands/init.ts:113`), already used for the downstream-site question at line 298. The prompter is injectable, so the new question is unit-testable without a terminal.

The wizard's contract must be honored exactly as ADR-0017 states it, because it is easy to break by adding one question:
- Every wizard question maps 1:1 to a flag, so the new question needs its own flag (for example `--tracker`) that produces the identical outcome with zero prompts.
- Passing any of the command's own flags makes the whole run non-interactive; the new flag must participate in that veto.
- Both stdin and stderr must be real TTYs for any prompt to run, and `--json` is an independent veto.
- The non-interactive default must not change: a flagless, non-TTY `lore init` must still produce today's result, which means the default tracker stays Backlog.md.

Write the chosen backend into a `[tracker]` table in `.lore/config.toml` and extend the config loader in `src/config.ts` to read it. That loader is zero-config by design — a missing file yields documented defaults — so an absent `[tracker]` table must mean Backlog.md, not an error. Keep the loose-object tolerance the other tables use so an unknown future key does not break an older lore.

The choice list ships exactly the backends that work: Backlog.md and JIRA. Quest CLI is deliberately not offered — see LCLI-315.4 for why, and do not add it as a disabled, greyed, or coming-soon entry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The init wizard asks which tracker backend to use and writes it to a [tracker] table in .lore/config.toml
- [ ] #2 A --tracker flag produces the identical result with no prompts, and participates in the existing flag-implies-non-interactive veto
- [ ] #3 A flagless non-TTY lore init produces byte-identical output to today, defaulting to Backlog.md
- [ ] #4 --json never prompts, and a non-TTY stdin or stderr never prompts
- [ ] #5 The config loader reads [tracker] with Backlog.md as the zero-config default and tolerates unknown keys
- [ ] #6 An unrecognized tracker value fails as a validation error (exit 6) naming the accepted values
- [ ] #7 The choice list contains only backends that are actually reachable
- [ ] #8 Tests drive the new question through the injected prompter and cover the flag, the vetoes, and the default path
<!-- AC:END -->
