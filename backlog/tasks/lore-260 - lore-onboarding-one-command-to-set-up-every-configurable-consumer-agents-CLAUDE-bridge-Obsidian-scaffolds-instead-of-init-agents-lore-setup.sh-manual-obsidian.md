---
id: LORE-260
title: >-
  lore onboarding: one command to set up every configurable consumer
  (agents/CLAUDE bridge, Obsidian, scaffolds) instead of init -> agents ->
  lore-setup.sh -> manual obsidian
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-25 02:01'
updated_date: '2026-07-25 17:42'
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
- [ ] #1 A bare 'lore init' on an interactive terminal runs a guided wizard offering each configurable consumer — at minimum the agents/CLAUDE bridge and an Obsidian vault config (plus mkdocs/docusaurus scaffolds and backlog-coupling detection) — and sets up the chosen ones in that one command, replacing the init -> agents -> lore-setup.sh -> manual-obsidian sequence.
- [ ] #2 Interactive-by-default is TTY-gated and CI-safe: the wizard runs ONLY when stdin is an interactive terminal; when stdin is non-TTY (CI, pipes) or a non-interactive flag (e.g. --yes / --non-interactive) is passed, 'lore init' runs fully non-interactively with defaults and NO prompt can block it. Every option the wizard asks is ALSO settable via an explicit flag (e.g. --agents / --obsidian / --scaffold mkdocs / --no-backlog) for prompt-free/scripted use.
- [ ] #3 Idempotent: re-running on an existing bundle detects and skips already-done steps (mirrors lore-setup.sh's existing/skip behavior) rather than erroring or duplicating — in both the wizard and non-interactive paths.
- [ ] #4 The configurable surface is covered consistently in BOTH the wizard and the flags: agent bridge, scaffold targets (obsidian/mkdocs/docusaurus), and a clear warning when a --json-capable backlog is absent.
- [ ] #5 The interactive-by-default decision is documented (a new ADR, or an amendment to ADR-0004/0005, recording that 'lore init' is interactive-on-TTY yet preserves the non-interactive CLI contract); it's discoverable (top-level help + lore help init); docs/runbooks/agent-onboarding.md + any quickstart updated to the one-command flow; full suite + lore check stay green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract applyAgentsBridge (agents.ts) and applyScaffold (scaffold.ts) out of runAgents/runScaffold
   so lore init can fold both in without a second stdout envelope.
2. Rewrite src/commands/init.ts: keep runInit a plain (non-async) function returning
   number | Promise<number> (mirrors runCheck) -- the fully-synchronous, zero-flag, non-TTY path
   stays byte-identical to pre-LORE-260 behavior (no agents/scaffold/backlog work at all).
3. Flags: --yes, --agents, --scaffold <target> (repeatable; mkdocs|docusaurus|obsidian), --obsidian
   (sugar for --scaffold obsidian), --no-backlog, --check-backlog. ANY flag forces non-interactive
   even on a TTY. Backlog capability check (adapter.probe(), advisory-only, never fails the run) runs
   when --check-backlog is passed, or implied by --agents/--scaffold/--obsidian (unless --no-backlog),
   or always inside the wizard.
4. Interactive wizard: TTY-gated (InitOptions.stdinIsTTY, resolved once in cli.ts, never read here),
   with an injectable InitPrompter (confirm/choose/close) -- no real readline touched in tests.
   3 questions (agent bridge default yes, docs-site choice default none, Obsidian default no), then
   always runs the backlog check as a detection step (not a 4th question).
5. cli.ts: add stdinIsTTY + prompter to RunContext, thread through to runInit, drop the old
   rejectCommandArgs(commandArgs, "init") blanket guard (init now legitimately takes flags).
6. manifest.ts + agent-bridge.ts LORE_COMMANDS: document the new flags/summary (kept byte-identical
   between the two per the lockstep test).
7. New ADR (amendment to ADR-0004/0005) documenting the TTY-gated interactive default; update
   docs/reference/cli-surface.md's init entry and docs/runbooks/agent-onboarding.md's onboarding
   flow to the one-command story; CHANGELOG [Unreleased] entry.
8. Verification: bun test (baseline 2126/0 on dev@b97ab87), typecheck, lint, lore check, the docker
   e2e harness (302/0 baseline), live CLI runs of both paths, and a mutation check on the TTY gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Design decision (2026-07-24, user) — interactive wizard by DEFAULT; flags for prompt-free

Chosen approach: a **bare 'lore init' runs a guided interactive wizard** that prompts for each configurable consumer (agents/CLAUDE bridge, Obsidian vault, mkdocs/docusaurus scaffolds, backlog coupling). **Flags let you do any of it without prompts**, and CI is fully supported.

Reconciliation with lore's non-interactive/scriptable contract (ADR-0004 CLI-first, ADR-0005 CLI-contract): **gate the wizard on stdin being a TTY**. When stdin is NOT a TTY (CI, pipes) OR an explicit non-interactive flag is passed (e.g. --yes / --non-interactive), 'lore init' runs fully non-interactively with sensible defaults and no prompt can block it. **Every wizard question maps 1:1 to a flag** so scripts set each option directly. This is the npm-init pattern (interactive on a TTY; -y / non-TTY skips prompts).

Not an LLM concern (ADR-0014 is about no LLM in core; the wizard is deterministic given its inputs). It likely warrants a short ADR — new, or an amendment to ADR-0004/0005 — recording that 'lore init' is the one interactive command while its non-TTY/flag paths (and the rest of the CLI) keep the deterministic, prompt-free contract. ACs updated to match this decision.
<!-- SECTION:NOTES:END -->
