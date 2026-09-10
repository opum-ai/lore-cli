---
type: ADR
title: "ADR-0005: CLI contract: output modes, exit codes, error envelope"
description: Defines lore's stable command-line contract — three output tiers (pretty/--plain/--json), semantic exit codes, a structured --json error envelope, and the stdout/stderr discipline that makes the CLI safe for agents and CI to consume.
tags: [adr, cli, contract, json, exit-codes, agent, ci]
summary: lore provides deterministic JSON, plain, and pretty output modes, semantic exit codes, and structured machine-readable errors.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0005: CLI contract: output modes, exit codes, error envelope

## Status

Accepted — 2026-06-21

## Context

lore is **CLI-primary** (see [ADR-0009: CLI-primary, MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md)): the same command surface serves humans at a terminal, Claude Code via the generated agent bridge, and CI gates. These three audiences have incompatible default expectations, and the CLI must satisfy all of them from one binary without per-caller configuration.

The hardest constraint comes from automated callers. Agents and CI cannot reliably scrape human-formatted prose: color codes, table alignment, pluralization, and reordering all break naive parsing, and an agent that mis-parses output will confidently act on garbage. Worse, agents cannot reliably distinguish *kinds* of failure from text on stderr — "not found", "validation failed", and "permission denied" all look like red text. Without a machine-stable signal, an agent cannot decide whether to retry, create the missing resource, fix its input, or stop. A single non-zero exit code collapses every failure into "something broke", forcing the caller to guess.

We therefore need:
- A **prose-free, stable** output channel for machines, distinct from the pretty human view.
- **Distinct exit codes** so CI and agents can branch and self-correct without reading any text.
- A **structured error shape** carrying enough context (what failed, why, how to fix, what input triggered it) for an agent to act, delivered on a channel that never contaminates parseable data.
- Output that stays **bounded** so a single command can't blow an agent's context window or a CI log budget.

The general philosophy is thin, zero-config, deterministic, and agent/CI-safe (non-interactive, idempotent, non-zero on error). The full normative specification of these rules — flag definitions, the per-command `kind` values, and the truncation-hint format — lives in [CLI contract reference](../reference/cli-contract.md); the command catalog is in [CLI surface](../reference/cli-surface.md). This ADR records the decision and its rationale.

## Decision

### Three output tiers with strict precedence

lore renders every command in exactly one of three modes:

1. **pretty** (default) — human-oriented, color **on a TTY only**. Tables, alignment, and decoration are allowed and may change between releases. Not a parsing target.
2. **`--plain`** — ANSI-free, stable text intended to remain diff-stable across patch releases. **Selected automatically when stdout is not a TTY** (pipes, files, CI, subprocess capture), so naive `backlog`-style consumers and shell pipelines get deterministic text without passing a flag.
3. **`--json`** — every payload is the canonical envelope `{ schemaVersion, kind, data }`, where `schemaVersion` versions the contract, `kind` names the command's payload shape (e.g. `validate.report`, `query.results`, `context.export`), and `data` is the typed body.

**Precedence is `--json` > `--plain` > pretty.** If `--json` is present it wins regardless of `--plain` or TTY detection; if only `--plain` is present (or stdout is non-TTY) plain wins over pretty; otherwise pretty. Precedence is resolved once, centrally, before any command logic runs, so a flag never produces a partially-styled stream.

### Semantic exit codes

Every invocation exits with one of six codes. These are a contract: callers branch on them, and we do not reuse a code for an unrelated condition.

| Code | Meaning |
|---|---|
| `0` | Success |
| `2` | Usage error (unknown flag/command, bad argument shape, missing required arg) |
| `3` | Not found (concept id, task id, path does not exist) |
| `4` | Denied (operation refused — e.g. writing inside a lore-managed region, or a guarded destructive op without confirmation) |
| `5` | Conflict / already exists (id collision on `new`, supersede target already superseded, write race) |
| `6` | Validation or drift failure (`lore validate` non-conformance, `lore check` drift/broken-link/portability failure) |

Code `1` is intentionally avoided for expected, classifiable conditions; it is left to mean "unexpected/uncaught" so an agent treats it as a bug to report rather than a state to handle. The mapping is centralized so the same logical failure yields the same code from every command and every output mode.

### Channel discipline: stdout = data, stderr = diagnostics

- **stdout carries only the payload** — the pretty view, the plain text, or the `--json` envelope. In `--json` mode stdout is *exclusively* the envelope, so a caller can `JSON.parse(stdout)` unconditionally on success.
- **stderr carries diagnostics** — progress, warnings, and errors. Mixing them onto stdout would corrupt the JSON/plain stream that machines parse.
- Warnings (e.g. unknown OKF type, missing `summary`) go to stderr and **do not by themselves change the exit code** unless the command is a gate (`validate`/`check`) for which they are defined to fail.

### `--json` error envelope

When a command fails **in `--json` mode**, lore writes a structured error object to **stderr** (never stdout) and exits with the matching semantic code:

```json
{
  "error_type": "not_found",
  "message": "Concept 'reference/orders' not found in bundle.",
  "hint": "Run `lore query --type Reference` to list reference concepts.",
  "input": { "id": "reference/orders" }
}
```

- `error_type` — a stable string aligned with the exit-code family (`usage`, `not_found`, `denied`, `conflict`, `validation`, `drift`).
- `message` — human-readable, single line.
- `hint` — an actionable next step, written so an agent can often self-correct in one turn.
- `input` — the offending input echoed back, for diagnosis without re-deriving it.

stdout stays empty on `--json` error, preserving "stdout parses or stays silent" as an invariant.

### Bounded, hint-carrying output

Read-heavy commands cap their output and emit an explicit truncation hint rather than dumping unbounded text (which would exhaust an agent's context or a CI log). The pretty/plain forms print a trailing line such as `showing 30 of 120 — narrow with --type story`; the `--json` form carries the same intent as fields on `data` (e.g. `total`, `shown`, `truncated`). Token estimates surfaced by `graph`/`check` use the labeled chars/4 heuristic (see [CLI contract reference](../reference/cli-contract.md)).

### Versioning and color

- The **`--json` shape is an additive-only versioned contract**: fields may be added; existing fields are not renamed, removed, or repurposed without bumping `schemaVersion`. This lets consumers pin behavior and lets us evolve payloads safely.
- lore **honors `NO_COLOR`**: when set, pretty mode emits no ANSI sequences even on a TTY. Color is purely cosmetic and never load-bearing.

## Consequences

### Positive

- **Agents and CI branch deterministically.** A caller reads the exit code to classify the outcome and reads the `--json` envelope on stdout (or the error envelope on stderr) for detail — no prose scraping, no fragile regexes.
- **One binary, three audiences.** Humans get color and tables; pipelines get stable plain text for free (auto on non-TTY); machines get typed JSON. No mode flag is required for the common cases.
- **Self-correcting loops.** The `hint` field plus a precise `error_type`/exit code let an agent recover (create the missing doc, fix the bad flag, pick a different id) without human intervention.
- **Clean composition.** Strict stdout/stderr separation means `lore … --json | jq` and `lore … > out.json` always work, and diagnostics never corrupt captured data.
- **Stable diffs and forward compatibility.** `--plain` stability and additive-only JSON versioning keep snapshot tests, golden files, and pinned consumers from breaking on cosmetic changes.

### Negative / tradeoffs

- **Discipline cost.** Every command must route output through the central mode resolver and map failures to the correct semantic code and `error_type`; ad-hoc `print`/`process.exit(1)` is forbidden and must be enforced in review and tests.
- **A second contract to maintain.** The `--json` envelope (and the set of `kind` values and `schemaVersion`) is a public contract requiring its own tests and changelog discipline; mistakes here break downstream consumers silently.
- **Exit-code taxonomy is a commitment.** Mapping six codes onto real failures occasionally forces a judgment call (e.g. is a re-supersede a `conflict` or `validation`?); these mappings are documented in [CLI contract reference](../reference/cli-contract.md) and changing one is a breaking change.
- **`--plain` stability constrains UX.** We cannot freely reformat plain output, because pipelines may parse it; substantial plain-format changes are treated as contract changes.

## Alternatives considered

- **Single human-formatted output, scraped by callers.** Rejected: brittle, locale/width/color-sensitive, and impossible for an agent to classify failures from. This is precisely the fragility lore is built to avoid; it also motivated the Backlog.md `--json` fork (see [ADR-0003: Backlog.md JSON-only integration](0002-backlog-integration-json-only.md) and [Backlog CLI contract](../reference/backlog-cli-contract.md)).
- **A `--plain` text parser as the machine contract (no `--json`).** Rejected for lore's *own* output for the same reason we rejected a `--plain` parser when reading Backlog.md: text remains ambiguous and version-fragile. `--plain` is kept as a human/pipeline convenience, not the machine contract.
- **One exit code (0/1) plus a typed error body.** Rejected: forces every caller to parse JSON merely to learn the *category* of failure, defeating shell-level and CI-level branching (`if lore check; then …`). Semantic codes make the common branch free.
- **Errors on stdout inside the JSON envelope, exit 0.** Rejected: it breaks `set -e`/CI gating and the "non-zero on error" rule, and it forces every success path to inspect a status field. Errors belong on stderr with a non-zero code.
- **A separate `--format=json|plain|pretty` enum instead of boolean flags with precedence.** Rejected as heavier and less ergonomic; boolean `--json`/`--plain` with documented precedence plus automatic non-TTY plain selection covers every case with less typing and matches the Backlog.md flag idiom.

## Related

- [ADR-0009: CLI-primary, MCP deferred](0004-cli-first-skill-bridge-mcp-deferred.md)
- [ADR-0003: Backlog.md JSON-only integration](0002-backlog-integration-json-only.md)
- [CLI contract reference](../reference/cli-contract.md)
- [CLI surface](../reference/cli-surface.md)
- [Backlog CLI contract](../reference/backlog-cli-contract.md)
- [ADR log](index.md)
