---
id: LORE-142
title: Add missing `help` entry to LORE_COMMANDS in agent-bridge.ts
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-engine-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE_COMMANDS (src/core/agent-bridge.ts:55-75) is the canonical command list used to generate the agent-facing `.claude/skills/lore/SKILL.md`, but it has no entry for `help`, even though `src/cli.ts` dispatches a real `case "help"` (cli.ts:180, 313). The module's own docstring (line 22) claims a lockstep guard prevents advertising commands that don't exist or omitting ones that do, but test/agents.test.ts's "command-surface lockstep" block (lines 329-354) only checks the LORE_COMMANDS -> dispatcher direction (no phantom commands), never the reverse. As a result, an agent reading the generated SKILL.md has no way to discover that `lore help` exists, and this gap isn't caught by any existing test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 LORE_COMMANDS in src/core/agent-bridge.ts includes a `help` entry with a one-line summary consistent with cli.ts's USAGE/help text, so the generated SKILL.md advertises `lore help`.
- [ ] #2 test/agents.test.ts's "command-surface lockstep" describe block gains a reverse-direction test asserting every real subcommand dispatched by cli.ts's router also appears in LORE_COMMANDS, so a future missing/removed command entry fails the build instead of going unnoticed.
<!-- AC:END -->
