---
id: LORE-260
title: >-
  lore onboarding: one command to set up every configurable consumer
  (agents/CLAUDE bridge, Obsidian, scaffolds) instead of init -> agents ->
  lore-setup.sh -> manual obsidian
status: To Do
assignee: []
created_date: '2026-07-25 02:01'
labels:
  - cli-ux
  - onboarding
  - cmd-crud-a
dependencies: []
references:
  - src/commands/init.ts
  - docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md
  - lore-setup.sh
priority: medium
type: enhancement
ordinal: 362000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Bringing lore into a new repo should be ONE command that establishes every configurable option, instead of today's multi-step, easy-to-forget sequence:
  lore init  ->  lore agents  ->  (external) lore-setup.sh  ->  manual Obsidian setup

A new user should not have to know that the Claude bridge, the Obsidian vault config, and the downstream site scaffolds are separate follow-up commands.

## The configurable surface to fold in
- **Agent bridge** — the SKILL.md + CLAUDE.md nudge ('lore agents').
- **Downstream consumers** — 'lore scaffold obsidian' / 'mkdocs' / 'docusaurus' (the ones the user wants).
- **Backlog coupling** — detect/verify a --json-capable backlog on PATH (and optionally drive 'backlog init'); warn clearly if absent since coupling depends on it.
- **Profile** — which OKF profile/convention the bundle uses (story-convention default vs a custom .lore/profile.toml).
- (git init, an initial commit — nice-to-have.)

## KEY DESIGN DECISION (needs sign-off before implementation)
The user's framing is 'prompt me for every configurable option.' But lore is deliberately **non-interactive, deterministic, and scriptable** (ADR-0004 CLI-first; ADR-0005 CLI contract; ADR-0014 core has no LLM dependency) — it is meant to run exactly like a CI step. A raw interactive 'lore init' would break that contract. So choose (and record the decision) among:
  1. **Flags on lore init** — e.g. 'lore init --agents --obsidian --scaffold mkdocs' — fully non-interactive, scriptable, deterministic; one command, zero prompts. Most consistent with lore's design.
  2. **A dedicated 'lore setup'/'lore onboard' subcommand** that orchestrates init + agents + chosen scaffolds (promoting the existing lore-setup.sh into a first-class, tested command). Keeps 'lore init' the primitive; the orchestrator can offer prompts.
  3. **Opt-in interactivity** — an explicit 'lore init --interactive' wizard, with the DEFAULT staying fully non-interactive (a CI/script path must always exist).
Whatever is chosen, a completely non-interactive path MUST remain (CI cannot answer prompts), and the step must be idempotent (safe to re-run on an existing bundle).

## Prior art
An external shell orchestrator already exists and works: lore-setup.sh at the repo root (git -> backlog init -> lore init -> lore agents -> optional 'lore scaffold obsidian' -> commit; flags --obsidian/--no-backlog/--name/--backlog-agent). This task is about making that a first-class, discoverable, tested part of lore rather than a side script.

## Refs
docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md, docs/adr/0005-cli-contract.md, docs/adr/0014-core-has-no-llm-dependency.md; src/commands/init.ts, src/commands/agents.ts, src/commands/scaffold.ts; lore-setup.sh (prior art).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A single lore invocation can scaffold the bundle AND set up the chosen configurable consumers (at minimum: the agents/CLAUDE bridge and an Obsidian vault config), replacing the init -> agents -> lore-setup.sh -> manual-obsidian sequence.
- [ ] #2 A fully NON-INTERACTIVE path exists and is the default for CI/scripts (no prompt can block it); the interactive/guided path, if any, is explicitly opt-in — and the chosen mechanism (flags vs dedicated subcommand vs opt-in wizard) is recorded with rationale against ADR-0004/0005/0014 and signed off before implementation.
- [ ] #3 The command is idempotent: re-running on an existing bundle detects and skips already-done steps (mirrors lore-setup.sh's existing/skip behavior) rather than erroring or duplicating.
- [ ] #4 The configurable surface is covered/consistently exposed: agent bridge, scaffold targets (obsidian/mkdocs/docusaurus), and a clear warning when a --json-capable backlog is absent.
- [ ] #5 It's discoverable (top-level help + lore help <cmd>); docs/runbooks/agent-onboarding.md (and any quickstart) updated to the one-command flow; full suite + lore check stay green.
<!-- AC:END -->
