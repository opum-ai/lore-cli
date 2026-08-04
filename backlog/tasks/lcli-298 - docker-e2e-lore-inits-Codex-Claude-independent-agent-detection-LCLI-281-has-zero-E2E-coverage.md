---
id: LCLI-298
title: >-
  docker/e2e: lore init's Codex/Claude independent agent detection (LCLI-281)
  has zero E2E coverage
status: To Do
assignee: []
created_date: '2026-08-04 04:09'
updated_date: '2026-08-04 04:10'
labels:
  - e2e
  - testing
  - agents
  - init
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-281
references:
  - docker/e2e/run-e2e.sh
  - src/commands/init.ts
  - src/commands/codex-bridge.ts
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: high
ordinal: 411000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Observed
LCLI-281 (0.1.0's headline "Added" feature) taught `lore init` to detect and configure Claude Code and Codex independently: new `--claude`/`--codex` flags, `--agents` retained as the Claude-only alias, and a first-time Codex setup that generates `.codex/skills/lore/SKILL.md` and surgically maintains a managed block in `AGENTS.md` (preserving unrelated hand-authored prose, per LCLI-281's own AC).

docker/e2e/run-e2e.sh — the CI-required, real-binary gate (LCLI-196) that this project's runbook describes as exercising "the full lore command surface" — has zero coverage of any of this:
- The only `lore init` invocation in the whole harness is bare `lore init` (line ~265), no `--claude`/`--codex`/`--agents`.
- `lore agents` IS exercised extensively (--check/--force, protected-drift, exit 6), but only against a pre-existing Claude Code bridge created by that bare `lore init` — never a first-time Codex bridge, never AGENTS.md managed-block creation/preservation, never `.codex/skills/lore/SKILL.md`.
- The docker/e2e/Dockerfile installs `backlog.md` globally but nothing Codex-related, so even a "Codex not installed" probe path is untested.

Solid coverage exists at the unit level (test/init.test.ts, ~line 470-640: `--claude`, `--codex`, idempotent re-run, hand-authored AGENTS.md prose preservation) — but per this project's own precedent (LCLI-56 found real defects unit tests missed), the real-binary/real-filesystem harness is exactly where this class of behavior (TTY/flag detection, actual file writes under a real cwd, agent-probe interaction) most needs a repeatable gate.

## Why it matters
This is 0.1.0's flagship feature. A regression here (e.g. Codex setup silently clobbering hand-authored AGENTS.md prose, or writing to the wrong path under a real filesystem) could ship undetected since nothing in the required CI gate exercises the real binary against these flags.

## Direction (decide in plan)
Add an E2E phase exercising: `lore init --codex` on a fresh bundle (asserts `.codex/skills/lore/SKILL.md` + `AGENTS.md` created), a second `--codex` run is idempotent, `lore init --claude` still produces the existing Claude bridge, and hand-authored AGENTS.md prose survives a `--codex` re-run with Lore's managed block still refreshed. Re-derive exact assertions from src/commands/init.ts and src/commands/codex-bridge.ts at execution time rather than trusting this description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore init --codex on a fresh bundle creates .codex/skills/lore/SKILL.md and an AGENTS.md managed block, asserted E2E against the real binary
- [ ] #2 A second lore init --codex run is idempotent (no unwanted changes) and lore agents --check reports clean
- [ ] #3 lore init --claude still produces the existing Claude Code bridge (.claude/skills/lore/SKILL.md), asserted E2E
- [ ] #4 Hand-authored prose in AGENTS.md survives a --codex re-run while Lore's managed block still refreshes
- [ ] #5 The full harness runs green against the real pinned binary, and teardown is clean
<!-- AC:END -->
