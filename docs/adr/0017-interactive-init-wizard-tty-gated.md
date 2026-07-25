---
type: ADR
title: "ADR-0017: Interactive `lore init` wizard, TTY-gated"
description: >-
  A bare `lore init` on an interactive terminal runs a guided wizard that folds
  in the rest of onboarding (the Claude Code agent bridge, downstream doc-site
  scaffolds, and a backlog-coupling capability check) into one command; it is
  strictly TTY-gated so the non-interactive, scriptable CLI contract
  (ADR-0004/ADR-0005) is preserved without exception off a TTY.
tags: [adr, cli, init, wizard, interactive, tty, onboarding, agents, scaffold, backlog]
summary: lore init runs an interactive wizard only on a bare TTY invocation; any flag or a non-TTY stdin runs it fully non-interactively with defaults, per-flag equivalents for every wizard question.
timestamp: 2026-07-25T17:43:50.747Z
---

# ADR-0017: Interactive `lore init` wizard, TTY-gated

## Status

Accepted — 2026-07-24. Amends [ADR-0004: CLI-first; SKILL.md bridge; MCP
deferred](0004-cli-first-skill-bridge-mcp-deferred.md) and [ADR-0005: CLI
contract](0005-cli-contract.md): it carves out one narrow, explicitly-gated
exception to their "no behavior reachable only through a non-CLI surface" /
"deterministic, non-interactive, agent/CI-safe" stance, rather than replacing
either decision.

## Context

Bringing lore into a new repo used to require four separate steps a new user
had no way to discover from `lore init` alone: `lore init` (the OKF bundle) →
`lore agents` (the Claude Code bridge) → an external `lore-setup.sh` script →
manual Obsidian vault configuration. Nothing told a first-time user that the
agent bridge, the downstream doc-site scaffolds (mkdocs/docusaurus/obsidian),
and the backlog `--json`-capability check were separate, optional follow-ups.

The obvious UX fix — "prompt the user for every configurable option" — is in
direct tension with lore's own design: lore is deliberately **CLI-first,
deterministic, and non-interactive** (ADR-0004's "no behavior reachable only
through a non-CLI surface"; ADR-0005's "thin, zero-config, deterministic, and
agent/CI-safe" philosophy). A raw interactive `lore init` that always prompts
would break CI, `lore-setup.sh`, and every existing script or agent loop that
invokes `lore init` unattended — including this repo's own docker e2e harness,
which runs with stdin **not** a TTY and depends on `lore init` never blocking.

This needed a resolution, not a compromise that quietly weakens the
non-interactive contract. The npm ecosystem has already settled this exact
tension for `npm init`: interactive by default at a real terminal, but `-y` or
a non-TTY stdin skips every prompt and uses defaults — a pattern proven at
enormous scale to satisfy both a first-run human and a CI pipeline from the
same command.

## Decision

1. **A bare `lore init` on an interactive terminal runs a guided wizard**
   offering each configurable consumer: the Claude Code agent bridge
   (SKILL.md + the CLAUDE.md nudge), a downstream docs site
   (mkdocs/docusaurus/none), an Obsidian vault config, and a backlog-coupling
   capability detection step. The wizard applies whichever were chosen in the
   same run that scaffolds the base OKF bundle.

2. **The wizard is TTY-gated, and the gate is the whole of the contract
   change.** It runs *only* when **stdin** is an interactive terminal *and*
   none of `lore init`'s own flags was passed. Two independent conditions each
   force the fully non-interactive path with no prompt able to block it:
   - stdin is **not** a TTY (CI, a pipe, a subprocess, a test) — the automatic,
     zero-configuration case every existing script already hits; or
   - **any** of `lore init`'s own flags is passed (`--yes`, `--agents`,
     `--scaffold <target>`, `--obsidian`, `--no-backlog`, `--check-backlog`) —
     explicit intent always wins over an ambient TTY, so `lore init --agents`
     from a real terminal never pops the wizard either.

3. **Every wizard question maps 1:1 to a flag** (the npm-init pattern): the
   agent-bridge question ↔ `--agents`, the docs-site choice ↔
   `--scaffold <target>`, the Obsidian question ↔ `--obsidian`, and
   `--no-backlog`/`--check-backlog` cover the backlog-coupling check. A script
   gets the *exact* outcome a human would get answering the wizard, with zero
   prompts — there is no configuration reachable from the wizard that a flag
   cannot also reach.

4. **The backlog-coupling check is advisory-only.** A missing or
   non-`--json`-capable `backlog` binary is reported as a stderr warning and a
   `backlog: { capable: false, warning }` field on the result — it never fails
   the `lore init` run, since the base scaffold (and any agent bridge/doc-site
   scaffold already applied) succeeded regardless of whether Backlog.md
   coupling is available yet.

5. **Both paths are idempotent**, reusing the exact same primitives `lore
   agents`/`lore scaffold` ship (`applyAgentsBridge`/`applyScaffold`) rather
   than duplicating their logic: a second run of any combination of flags (or
   wizard answers) is a no-op wherever the first run already finished.

6. **The TTY gate and the wizard's I/O are both injectable**, never read from
   `process.stdin` inside the command itself — `cli.ts` resolves the real
   `stdin.isTTY` once, at the same boundary it already resolves `stdout`'s and
   `stderr`'s TTY state, and hands a plain boolean plus an `InitPrompter`
   (`confirm`/`choose`/`close`) into the command. A test drives the wizard
   path by passing `stdinIsTTY: true` and a scripted prompter — never a real
   terminal, never flaky.

The non-negotiable invariant this ADR exists to record: **a completely
non-interactive path must always exist and must be the automatic, default
behavior off a TTY.** Nothing in `lore init` — now or in any future flag added
to it — may introduce a prompt that can block when stdin is not a TTY.

## Consequences

### Positive

- **One command replaces a four-step, easy-to-forget sequence.** A first-time
  user on a real terminal is walked through every configurable consumer
  without needing to know `lore agents`, `lore scaffold`, or
  `lore-setup.sh` exist.
- **Zero regression to the non-interactive contract.** Every existing caller —
  CI, this repo's own docker e2e harness (stdin never a TTY there), scripts,
  and every pre-existing unit test — hits the exact same `lore init` behavior
  as before this ADR, byte-for-byte, because the default non-interactive path
  performs no new work with no flags passed.
- **Fully scriptable equivalent.** `lore init --agents --obsidian --scaffold
  mkdocs` (or `lore init --yes`) reaches every wizard outcome with zero
  prompts, so automation never has to work around the wizard.
- **Testable without a real terminal.** The injectable TTY gate + prompter
  means the wizard's logic (question order, defaults, idempotency) is unit
  tested the same way every other lore command's seams are, with no pty/expect
  harness needed.

### Negative / tradeoffs

- **A second interactive code path to maintain.** `lore init` now has both a
  synchronous, flag-driven path and an async, prompt-driven wizard path
  (`runInit` returns `number | Promise<number>`, mirroring `lore check
  --external`'s existing sync/async split). This is more surface than a
  flags-only command, mitigated by the wizard sharing the exact same
  `applyAgentsBridge`/`applyScaffold` primitives as the non-interactive path —
  there is no separate "wizard version" of the onboarding logic.
- **A backlog-coupling check most users won't customize.** `--no-backlog`
  and `--check-backlog` add two flags whose value is mostly "make CI quiet" or
  "make a script explicit" — a modest addition to the flag surface for a
  narrow use case.

## Alternatives considered

- **A dedicated `lore setup`/`lore onboard` subcommand** promoting
  `lore-setup.sh` into a first-class command, leaving `lore init` untouched as
  the non-interactive primitive. Rejected for the initial release: it keeps
  the exact discoverability gap this ADR exists to close — a new user still
  would not learn from `lore init --help` that a one-command onboarding flow
  exists elsewhere. (Still a reasonable fallback if the TTY-gated wizard ever
  proves too surprising in practice; nothing here forecloses adding one later.)
- **Opt-in interactivity** (`lore init --interactive`, non-interactive by
  default even on a TTY). Rejected: it solves the CI-safety concern trivially
  but does nothing for the *actual* problem — a first-time human at a terminal
  still would not discover the wizard without already knowing the flag exists.
- **Flags only, no wizard at all.** Rejected as insufficient for the filing
  task's own framing ("prompt me for every configurable option") — a
  flags-only `lore init` is no more discoverable than today's `init` → `agents`
  → `lore-setup.sh` sequence, just consolidated into more flags to read about
  in `--help`.

## Related

- [ADR-0004: CLI-first; SKILL.md bridge; MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md) — the non-CLI-surface, agent/CI-safe stance this ADR carves one gated exception into.
- [ADR-0005: CLI contract](0005-cli-contract.md) — the output-mode/exit-code/error-envelope contract the non-interactive path continues to honor exactly.
- [CLI surface](../reference/cli-surface.md) — `init`'s full flag reference.
- [Agent onboarding runbook](../runbooks/agent-onboarding.md) — the one-command onboarding flow this ADR enables.
- [ADR log](index.md)
