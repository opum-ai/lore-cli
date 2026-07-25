---
id: LORE-260
title: >-
  lore onboarding: one command to set up every configurable consumer
  (agents/CLAUDE bridge, Obsidian, scaffolds) instead of init -> agents ->
  lore-setup.sh -> manual obsidian
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 02:01'
updated_date: '2026-07-25 17:54'
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
- [x] #1 A bare 'lore init' on an interactive terminal runs a guided wizard offering each configurable consumer — at minimum the agents/CLAUDE bridge and an Obsidian vault config (plus mkdocs/docusaurus scaffolds and backlog-coupling detection) — and sets up the chosen ones in that one command, replacing the init -> agents -> lore-setup.sh -> manual-obsidian sequence.
- [x] #2 Interactive-by-default is TTY-gated and CI-safe: the wizard runs ONLY when stdin is an interactive terminal; when stdin is non-TTY (CI, pipes) or a non-interactive flag (e.g. --yes / --non-interactive) is passed, 'lore init' runs fully non-interactively with defaults and NO prompt can block it. Every option the wizard asks is ALSO settable via an explicit flag (e.g. --agents / --obsidian / --scaffold mkdocs / --no-backlog) for prompt-free/scripted use.
- [x] #3 Idempotent: re-running on an existing bundle detects and skips already-done steps (mirrors lore-setup.sh's existing/skip behavior) rather than erroring or duplicating — in both the wizard and non-interactive paths.
- [x] #4 The configurable surface is covered consistently in BOTH the wizard and the flags: agent bridge, scaffold targets (obsidian/mkdocs/docusaurus), and a clear warning when a --json-capable backlog is absent.
- [x] #5 The interactive-by-default decision is documented (a new ADR, or an amendment to ADR-0004/0005, recording that 'lore init' is interactive-on-TTY yet preserves the non-interactive CLI contract); it's discoverable (top-level help + lore help init); docs/runbooks/agent-onboarding.md + any quickstart updated to the one-command flow; full suite + lore check stay green.
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

Implementation complete. Key decisions:
- Extracted applyAgentsBridge (agents.ts) and applyScaffold (scaffold.ts) out of runAgents/runScaffold
  (pure refactor, both files' own test suites unchanged/green) so init can fold both in without a
  second stdout envelope.
- runInit stays a plain (non-async) function returning number | Promise<number>, mirroring runCheck's
  own sync/async split: the zero-flag, non-TTY default path is byte-for-byte unchanged from before
  this task (no agents/scaffold/backlog work), and only the wizard or an actually-requested backlog
  check return a Promise.
- Wizard triggers ONLY when stdin is a real TTY AND none of init's own flags was passed (--yes,
  --agents, --scaffold <target>, --obsidian, --no-backlog, --check-backlog all force non-interactive).
  TTY gate + prompter I/O are both injected via InitOptions (stdinIsTTY, prompter), resolved once at
  the cli.ts boundary -- never read from process.stdin inside the command.
- Backlog capability check (adapter.probe()) is advisory-only: a missing/incapable backlog becomes a
  stderr warning + backlog:{capable:false,warning} field, never a failed run. Runs always in the
  wizard; off-TTY/via-flags it runs only when --check-backlog is passed or implied by
  --agents/--scaffold/--obsidian (unless --no-backlog) -- keeps the bare zero-flag path from ever
  spawning a subprocess.

Verification performed (real output, not just code presence):
- bun test: 2153/0 pass (baseline was 2126/0 on dev@b97ab87) -- 44 tests in test/init.test.ts (up
  from 20), 2 new router-level wizard-wiring tests in test/cli.test.ts, agents.test.ts/scaffold.test.ts
  still 108/0 after the extraction refactor.
- bun run typecheck: clean. bun run lint (biome check .): clean.
- bun run src/cli.ts check: 40 files, 0 errors, 0 warnings (was 39 before the new ADR).
- Mutation checks: (1) reverted the TTY-gate expression to a constant false -- 4 wizard-dependent
  tests genuinely failed; restored, 44/0 green again. (2) reverted anyFlagGiven() to always return
  false -- 2 flag-bypass tests genuinely failed; restored, 44/0 green again.
- Live CLI runs on real throwaway bundles (not just unit tests): non-TTY zero-flag init completed
  instantly with zero prompts and the unchanged file list; a second run was fully idempotent (all
  "exists"); `lore init --agents --obsidian --scaffold mkdocs --json </dev/null` completed
  prompt-free, created the SKILL.md/CLAUDE.md bridge + docs/.obsidian + mkdocs.yml, and hit this
  machine's REAL (non-json-capable) backlog binary, producing a genuine stderr warning plus
  backlog:{capable:false} in the JSON result while still exiting 0.
- Docker e2e harness (docker/e2e/run-e2e.sh via docker compose): full real build + run, 302 passed,
  0 failed, exit 0 -- unchanged from its existing baseline. No harness assertion needed changing:
  the harness never exercises init's new flags, and the default path it does exercise (bare `lore
  init`, non-TTY) is byte-for-byte unchanged.
- Documentation: new docs/adr/0017-interactive-init-wizard-tty-gated.md (amends ADR-0004/ADR-0005),
  scaffolded via `lore new adr` + `lore rename` (not hand-created), cli-surface.md's init entry
  rewritten, agent-onboarding.md gained a "0. Bootstrapping a brand-new repo" section, README
  quickstart updated. Discoverability confirmed live: `lore --help` and `lore help init` both show
  the new summary/flags. core/manifest.ts and core/agent-bridge.ts's LORE_COMMANDS kept byte-identical
  per the lockstep test (help.test.ts/agents.test.ts still green). SKILL.md regenerated via
  `lore agents --force` and re-verified clean via `lore agents --check`.
- CHANGELOG.md: added an [Unreleased] / Added entry in house voice, cross-checked against the actual
  diff (explicitly notes this is NOT a --json contract-breaking change: new fields are purely
  additive per ADR-0005, and the default path is unchanged).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the locked design decision: a bare `lore init` on an interactive TTY runs a guided
wizard folding in the Claude Code agent bridge, downstream doc-site scaffolds (mkdocs/docusaurus/
obsidian), and a backlog `--json`-capability check; it is strictly TTY-gated (any of init's own
flags, or a non-TTY stdin, forces the fully non-interactive path with no prompt able to block it).
Every wizard question has a 1:1 flag: --agents, --scaffold <target> (repeatable), --obsidian
(shorthand), --check-backlog/--no-backlog, --yes. The zero-flag/non-TTY default is byte-for-byte
unchanged from before this task. `lore agents`/`lore scaffold`'s own write logic was extracted into
applyAgentsBridge/applyScaffold so init reuses them directly (idempotent, no second stdout envelope).
The TTY gate and the wizard's prompt I/O are both injected (InitOptions.stdinIsTTY/prompter,
resolved once in cli.ts), never read from process.stdin at the call site, so the wizard is fully
unit-testable.

Verified with real evidence: bun test 2153/0 pass (2126/0 baseline; +44 init.test.ts tests, +2
cli.test.ts router-wiring tests), typecheck/lint clean, `lore check` 40 files/0 errors/0 warnings,
two mutation checks (TTY gate and the flag-bypass check each reverted and confirmed their dependent
tests genuinely fail, then restored to green), live CLI runs on real throwaway bundles proving both
the non-TTY zero-prompt path and every flag working prompt-free (including a real, non-json-capable
backlog binary on this machine producing a genuine advisory warning), and a full real docker e2e
harness run (docker compose, real backlog binary built from source) — 302 passed, 0 failed, exit 0,
unchanged from baseline with no assertion needing modification. Documented via a new
docs/adr/0017-interactive-init-wizard-tty-gated.md (amending ADR-0004/ADR-0005), an updated
cli-surface.md `init` entry, a new "Bootstrapping a brand-new repo" section in
agent-onboarding.md, an updated README quickstart, and a CHANGELOG [Unreleased] entry (explicitly
confirmed non-breaking: the --json envelope's new fields are purely additive). Discoverable live via
`lore --help` and `lore help init`.
<!-- SECTION:FINAL_SUMMARY:END -->
