---
type: ADR
title: "ADR-0004: CLI-first; reusable Core; SKILL.md agent bridge; MCP deferred"
description: >-
  Make the lore CLI the primary interface for both humans and agents, keep all
  logic in a single programmatic core/ library with thin commands, onboard Claude
  Code through a generated SKILL.md plus a CLAUDE.md nudge and `lore instructions`,
  and defer the MCP server to a secondary v2 transport over the same core.
tags: [architecture, cli, agents, mcp, skills, claude-code, context-efficiency]
summary: lore is CLI-first for humans and agents over a reusable deterministic core, bridges Claude Code with a generated SKILL.md, and defers MCP to v2.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0004: CLI-first; reusable Core; SKILL.md agent bridge; MCP deferred

## Status

Accepted — 2026-06-21.

Amended — 2026-08-01 (LCLI-289): task-scoped agent context profiles are an
additional CLI-first, progressively disclosed use of the deterministic core.
Lore profiles map native Claude Code or Codex roles to bounded authored
evidence; they do not replace native prompts, tools, permissions, models, or
execution, and they do not reactivate MCP.

Supersedes the v0.2 spec's framing (`lore-spec.md` §6) that treated the MCP
server as a co-primary, first-class surface. MCP is retained as a deferred v2
transport, not dropped. See [ADR-0001: Runtime, build, distribution](0001-runtime-build-distribution.md),
[ADR-0002](0003-okf-substrate.md) for the OKF substrate this profile sits on, and
[ADR-0005](0002-backlog-integration-json-only.md) for the Backlog.md coupling these commands drive.

## Context

`lore` must be usable by two audiences from day one: humans at a terminal and
coding agents (primarily Claude Code) operating non-interactively in a repo. The
v0.2 spec proposed shipping an MCP server as an equal, first-class surface
alongside the CLI, exposing tools (`lore_new_concept`, `lore_sync`, …) and
resources (`lore://bundle/index`, …). We re-evaluated that against 2026 evidence
on how agents actually consume tooling and what it costs in context.

The evidence against MCP-as-primary is concrete:

- **Idle token tax.** A registered MCP server injects its full tool and resource
  schemas into every turn whether or not any tool is called — roughly
  **15k–20k idle tokens per turn** for a non-trivial server. That tax is paid
  continuously, crowding out the agent's working context for the actual repo.
- **Reliability and cost under load.** A 2026 benchmark comparing the same task
  via CLI versus MCP found the **CLI completed ~100% of tasks using ~1k–9k
  tokens/task**, while the **MCP path completed ~72% of tasks using ~32k–82k
  tokens/task**. The CLI was both more reliable and roughly an order of magnitude
  cheaper in tokens for equivalent work.
- **Vendor guidance.** Anthropic's own documentation calls the **command line the
  most context-efficient surface** for agents and recommends pairing it with
  **Skills** (`.claude/skills/<name>/SKILL.md`) and `--help` discovery rather
  than standing up an always-on server. A focused `SKILL.md` delivers an
  estimated **~90% of an MCP server's practical value at ~30–50 idle tokens** —
  it is loaded lazily and progressively, not injected every turn.

Two facts about `lore`'s own design make the CLI a clean primary surface:

1. The CLI already emits **`--json`** (`{schemaVersion, kind, data}`) and **`--plain`**
   (ANSI-free, stable) modes, with precedence `--json > --plain > pretty` and
   semantic exit codes (see [cli-contract.md](../reference/cli-contract.md) and
   [cli-surface.md](../reference/cli-surface.md)). An agent gets fully structured,
   parseable output without any separate protocol.
2. The core is **deterministic and free of any LLM dependency** (see
   [ADR-0014](0014-core-has-no-llm-dependency.md)) and lives in one programmatic
   library. Any transport — CLI today, MCP tomorrow — is a thin shell over the
   same functions.

Given identical core behavior and structured output, an additional always-on
MCP transport would add a recurring per-turn token cost and a second
surface/contract to maintain, in exchange for marginal ergonomic gain over a
well-documented `--json` CLI. The economics favor CLI-first now and MCP later.

## Decision

1. **The CLI is the primary interface for both humans and agents.** Humans get
   pretty (color on TTY) output; agents get `--json` (or `--plain` when piped /
   non-TTY). There is no behavior reachable only through a non-CLI surface. The
   `--json` envelope is an additive-only versioned contract
   ([cli-contract.md](../reference/cli-contract.md)).

2. **All logic lives in one reusable `core/` library; commands are thin.** Every
   command file (`src/commands/<cmd>.ts`) does only argument parsing, invocation
   of a core function, and rendering into the selected output mode. No business
   logic, no Backlog.md/OKF/graph knowledge, and no I/O policy live in command
   files. This guarantees that any future transport reuses identical logic with
   zero drift — the design rationale and module boundaries are recorded in
   [lore-design.md](../specs/lore-design.md).

3. **Claude Code is onboarded via a generated agent bridge, not a server:**
   - A generated **`.claude/skills/lore/SKILL.md`** is the primary bridge. It
     teaches the agent which `lore` commands exist, when to use them, the
     `--json` contract, and the semantic exit codes — loaded lazily, costing only
     tens of idle tokens. It is generated (not hand-maintained) so it stays in
     lockstep with the CLI surface. The onboarding flow is documented in
     [agent-onboarding.md](../runbooks/agent-onboarding.md).
   - A **tiny `CLAUDE.md` nudge** points the agent at the skill and at
     `lore instructions`, without bloating the always-loaded project memory.
   - **`lore instructions`** prints task-scoped guidance on demand (mirroring the
     Backlog.md `backlog instructions <topic>` pattern), so an agent can pull
     just-in-time detail rather than carrying it resident.
   - **AGENTS.md dual-write is deferred** to a later milestone via a CLAUDE.md
     `@import` shim, so a single source of agent guidance can fan out to other
     agent runtimes without duplicated, drift-prone files.

3a. **Task-scoped agent context profiles are additive, not a native-agent
generator.** Committed mappings under `.lore/agents/` are exposed through the
singular `lore agent` family. The native-agent adapter is a one-line instruction
that names the profile and invokes `lore agent context`; the existing plural
`lore agents` bridge command retains its current meaning.

4. **The MCP server is a DEFERRED, secondary v2 transport over the same core.**
   It is explicitly scheduled as milestone M6 (deferred) in the build order, not
   in the initial release. When built, `lore mcp` will expose the same core
   functions as MCP tools/resources — adding a transport, never a second
   implementation. Its intended shape is documented up front so the contract is
   stable when work begins: see [mcp-tools.md](../reference/mcp-tools.md).

## Consequences

### Positive

- **Lower, predictable context cost.** No always-on server means no ~15k–20k
  idle tokens per turn. The SKILL.md bridge costs ~30–50 idle tokens and the
  `--json` payload is bounded and on-demand — closer to the benchmark's ~1k–9k
  tokens/task profile than ~32k–82k.
- **Higher reliability for agents.** A single deterministic CLI with stable
  `--json` and semantic exit codes is easier for an agent to invoke correctly and
  recover from than a tool surface that competes for context budget.
- **One implementation, many transports.** Thin commands over a reusable core
  mean the eventual MCP server (and any future surface) inherits identical
  behavior with no logic fork to keep in sync.
- **Works everywhere immediately.** The CLI runs in CI, shell scripts, other
  agents, and plain terminals with no MCP client, no server lifecycle, and no
  protocol handshake.
- **Cheap, in-repo onboarding.** The generated SKILL.md + CLAUDE.md nudge live in
  the repo, are versioned with the code, and require no external configuration.

### Negative / tradeoffs

- **Agents must shell out and parse `--json`** rather than calling typed tools.
  We mitigate this with a strict, versioned `--json` contract, semantic exit
  codes, and an explicit error envelope, so parsing is mechanical and stable.
- **The generated bridge must be regenerated** when the CLI surface changes. We
  mitigate this by generating SKILL.md from the command definitions and by
  gating drift in `lore check`, so a stale bridge is caught rather than silently
  shipped.
- **No MCP today** for environments that prefer or require tool-call transports
  (e.g. some hosted agent UIs). This is a deliberate, time-bounded deferral: the
  v2 design is pre-specified ([mcp-tools.md](../reference/mcp-tools.md)) and, when
  delivered, reuses the same core.
- **Two agent-facing artifacts to keep coherent** (SKILL.md and the CLAUDE.md
  nudge). We keep the nudge deliberately tiny and treat SKILL.md as the single
  substantive source to minimize duplication.

## Alternatives considered

- **MCP server as a co-primary (first-class) surface (v0.2 spec §6).** Rejected
  for the initial release: it imposes a continuous per-turn idle-token tax,
  showed materially worse reliability and far higher token cost than a CLI in
  2026 benchmarks, and forces maintaining a second surface and contract for
  marginal gain over `--json`. Retained as the deferred v2 transport.

- **MCP server *instead of* a CLI (agent-only).** Rejected. It abandons the human
  terminal and CI use cases entirely, requires an MCP client for any consumer,
  and ties `lore`'s value to a single transport ecosystem.

- **CLI-only with no agent bridge** (rely on the agent reading `--help`).
  Rejected as insufficient: discoverability and "when to use what" guidance are
  poor without a curated entry point. The SKILL.md + `lore instructions` bridge
  closes that gap at negligible context cost.

- **A large, resident CLAUDE.md** carrying full `lore` guidance. Rejected: it
  pays an always-loaded token cost on every turn for content most turns don't
  need. Lazily loaded SKILL.md plus on-demand `lore instructions` provides the
  same coverage without the resident tax.

- **Importing Backlog.md / consumer internals into `lore`'s core** to avoid
  shelling out. Out of scope here and rejected elsewhere — the coupling stays at
  the CLI/JSON boundary (see [ADR-0005](0002-backlog-integration-json-only.md) and
  [backlog-cli-contract.md](../reference/backlog-cli-contract.md)).
