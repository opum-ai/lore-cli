---
id: LCLI-142
title: Add missing `help` entry to LORE_COMMANDS in agent-bridge.ts
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:26'
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
- [x] #1 LORE_COMMANDS in src/core/agent-bridge.ts includes a `help` entry with a one-line summary consistent with cli.ts's USAGE/help text, so the generated SKILL.md advertises `lore help`.
- [x] #2 test/agents.test.ts's "command-surface lockstep" describe block gains a reverse-direction test asserting every real subcommand dispatched by cli.ts's router also appears in LORE_COMMANDS, so a future missing/removed command entry fails the build instead of going unnoticed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a `help` entry to LORE_COMMANDS in src/core/agent-bridge.ts, summary text byte-identical to core/manifest.ts's existing `help` entry ("Show help, or the machine-readable command manifest under --json") so test/help.test.ts's existing LORE_COMMANDS<->manifest summary-drift guard stays green.
2. Add a reverse-direction test to test/agents.test.ts's 'command-surface lockstep' describe block: parse cli.ts's switch(parsed.command) block for every case name (same technique test/help.test.ts already uses against manifestCommandNames()) and assert each dispatched name appears in LORE_COMMANDS.
3. Verify: bun test (full suite) + bun run typecheck, both green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a `help` entry to LORE_COMMANDS in src/core/agent-bridge.ts, summary byte-identical to core/manifest.ts's existing help entry ("Show help, or the machine-readable command manifest under --json"), satisfying test/help.test.ts's pre-existing LORE_COMMANDS<->manifest summary-drift guard. Regenerated .claude/skills/lore/SKILL.md via 'lore agents --force' so the generated bridge now advertises 'lore help' (AC#1). Added a reverse-direction test to test/agents.test.ts's 'command-surface lockstep' describe block: parses cli.ts's switch(parsed.command) dispatch block and asserts every dispatched case name is present in LORE_COMMANDS, so a future missing/removed entry fails the build (AC#2). Verification: bun test -> 1795 pass, 0 fail (5093 expect() calls, 47 files); bun run typecheck -> clean (tsc --noEmit, no output); bun run src/cli.ts agents --check -> up-to-date (both files); bun run src/cli.ts check -> 38 files, 0 errors, 0 warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a help entry to LORE_COMMANDS (src/core/agent-bridge.ts), summary matching core/manifest.ts's help entry verbatim, and regenerated .claude/skills/lore/SKILL.md so it advertises 'lore help'. Added a reverse-direction lockstep test to test/agents.test.ts asserting every cli.ts dispatch case appears in LORE_COMMANDS. Verified with bun test (1795 pass/0 fail) and bun run typecheck (clean); bun run src/cli.ts agents --check and lore check both report clean/up-to-date.
<!-- SECTION:FINAL_SUMMARY:END -->
