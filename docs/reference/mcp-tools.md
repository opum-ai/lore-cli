---
# yaml-language-server: $schema=../../.lore/schemas/Reference.schema.json
type: Reference
title: "MCP tools and resources (DEFERRED v2 design)"
description: The pre-specified design for lore's deferred Model Context Protocol server — the tools (lore_new_concept, lore_link_tasks, lore_story_status, lore_sync, lore_check, lore_graph, lore_query, lore_context, lore_publish) and resources (lore://bundle/index, lore://concept/{id}, lore://graph, lore://context/{id}) mapping to the same core functions the CLI drives, over stdio, with structuredContent reusing the --json serializer and strict stdout hygiene. Documents why MCP is secondary to the CLI and deferred per ADR-0004.
tags: [reference, mcp, deferred, agents, transport, v2, stdio, claude-code]
summary: The deferred-v2 MCP server design — tools and resources that wrap the same core functions the CLI drives, over stdio, returning structuredContent from the --json serializer; secondary to the CLI-primary surface per ADR-0004.
timestamp: 2026-06-21T00:00:00Z
---

# MCP tools and resources (DEFERRED v2 design)

> **Status: DEFERRED, not built.** The MCP server is a **secondary** transport
> scheduled as milestone **M6 (deferred)** in the build order — after the CLI,
> the Backlog.md coupling, navigability/search/refactoring, the agent bridge, and
> the browsable consumers all ship. This document specifies the *intended* shape
> so the contract is stable when work begins; **nothing here exists in the
> initial release.** The primary, shipping agent surface today is the **CLI plus
> the generated `.claude/skills/lore/SKILL.md` bridge** — see
> [agent onboarding](../runbooks/agent-onboarding.md).

This is a forward-looking design reference. It records the tools, resources,
transport, and serialization contract the `lore mcp` server **will** expose when
it is built, and — equally important — *why* it is deferred behind the CLI. The
decision and its evidence are recorded in
[ADR-0004: CLI-first; SKILL.md bridge; MCP deferred](../adr/0004-cli-first-skill-bridge-mcp-deferred.md).

The governing constraint, stated once and load-bearing throughout: **the MCP
server is only a transport.** Every tool and resource below is a thin wrapper
over the **same core functions** the CLI commands already call. There is exactly
one implementation of every behavior, in [`core/`](architecture.md); MCP adds a
door, never a second source of truth.

---

## 1. Why MCP is secondary and deferred

The v0.2 spec (`lore-spec.md` §6) originally treated the MCP server as a
co-primary, first-class surface. We re-evaluated that against 2026 evidence on
how agents actually consume tooling and what it costs in context, and demoted MCP
to a deferred v2 transport. The full rationale is in
[ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md); the summary:

- **Idle token tax.** A registered MCP server injects its full tool and resource
  schemas into **every** turn whether or not any tool is called — roughly
  **15k–20k idle tokens per turn** for a non-trivial server. That cost is paid
  continuously, crowding out the agent's working context for the actual repo.
- **Reliability and cost under load.** A 2026 benchmark of the same task via CLI
  vs. MCP found the **CLI completed ~100% of tasks using ~1k–9k tokens/task**,
  while the **MCP path completed ~72% of tasks using ~32k–82k tokens/task** — the
  CLI was both more reliable and roughly an order of magnitude cheaper in tokens.
- **A focused SKILL.md captures most of the value cheaply.** Anthropic's guidance
  calls the command line the most context-efficient agent surface and recommends
  pairing it with **Skills** and `--help` discovery. A generated `SKILL.md`
  delivers an estimated **~90% of an MCP server's practical value at ~30–50 idle
  tokens** — loaded lazily and progressively, not injected every turn.
- **lore is already structured.** The CLI emits a versioned
  `{schemaVersion, kind, data}` `--json` envelope with semantic exit codes and an
  explicit error envelope (see [CLI contract](cli-contract.md)). An agent gets
  fully structured, parseable output with no separate protocol — so an always-on
  MCP transport would add recurring per-turn cost and a second contract to
  maintain in exchange for marginal ergonomic gain.

Deferred is **not** dropped. Because the core returns plain data and the CLI
commands are thin, adding the MCP surface later is **additive** — not a refactor —
and inherits identical behavior. This reference exists so that addition has a
pre-agreed contract.

---

## 2. Transport

When built, the server starts via:

```
lore mcp                     # start the MCP server over stdio
```

- **Transport: stdio.** The server speaks the
  [Model Context Protocol](https://modelcontextprotocol.io) over stdin/stdout
  using `@modelcontextprotocol/sdk`. stdio is the right fit for a repo-local tool
  invoked by Claude Code as a child process; there is no network listener, no
  auth layer, and no server lifecycle beyond the spawning client. (HTTP/SSE
  transports are explicitly out of scope.)
- **One bundle per server.** The server is rooted at the repo's `docs/` bundle,
  exactly as the CLI is. It performs the same capability probe of the Backlog.md
  fork ([Backlog CLI contract](backlog-cli-contract.md)) on startup and
  fails loud on an unsupported version, identical to the CLI path.
- **stdout hygiene (critical for stdio).** Under MCP-over-stdio, **stdout is the
  protocol channel** — it carries JSON-RPC frames and nothing else. The server
  MUST therefore:
  - never let core, adapters, or libraries write to stdout (all human-facing
    progress, warnings, and diagnostics go to **stderr**, mirroring the CLI's
    [stream discipline](cli-contract.md): *stdout parses or stays silent*);
  - never spawn the `backlog` subprocess with inherited stdout — the adapter
    already captures the child's stdout to parse the `--json` envelope, so no
    Backlog.md output can leak onto the MCP channel;
  - emit tool results as structured MCP content, never as ad-hoc prints.

  This is the same invariant the CLI enforces (stdout = data, stderr =
  diagnostics); MCP simply makes violating it fatal to the protocol.

---

## 3. Tools

Each tool wraps one core function — the **same** function the named CLI command
calls. The "Maps to" column gives the equivalent CLI command and the
`{schemaVersion, kind, data}` `kind` whose `data` payload is returned (see the
[CLI contract `kind` registry](cli-contract.md)).

| Tool | Maps to (CLI / `kind`) | Purpose |
|---|---|---|
| `lore_new_concept` | `lore new` / `new.result` | Scaffold a typed concept (`type`, `title`, `tags`, parent/epic/story, template + vars). Returns the new concept id and path. |
| `lore_link_tasks` | `lore link` / `link.result` | Couple a Story/Spec to Backlog.md task IDs: write the `tasks:` frontmatter refs **and** set the queryable `doc:<conceptId>` label on each task (both sides). |
| `lore_story_status` | `lore tasks` / `tasks.rollup` | Live task rollup for a story, read through the Backlog.md `--json` adapter. |
| `lore_sync` | `lore sync` / `sync.summary` | Recompute status, rewrite managed `<!-- lore:tasks -->` blocks, regenerate indexes/log; returns a diff summary of what changed (idempotent). |
| `lore_check` | `lore check` / `check.report` | Read-only drift gate: status reconciliation, managed-block, internal link + heading-anchor validation, portability lint, token estimates. Structured findings. |
| `lore_graph` | `lore graph` / `graph.export` | The bundle cross-link graph as JSON (nodes, edges, per-doc/bundle token estimates). |
| `lore_query` | `lore query` / `query.results` | In-memory BM25-style full-text search plus frontmatter-field filters; ranked hits with `total`/`shown`/`truncated`. |
| `lore_context` | `lore context` / `context.export` | Deterministic, depth-bounded graph-expansion export for a concept id within a `max_tokens` budget: target body + one-line neighbor summaries. |
| `lore_publish` | `lore publish confluence` / *(deferred)* | One-way publish to Confluence; `dry_run` supported. **Doubly deferred** — gated behind the Confluence adapter ([ADR-0016](../adr/0016-confluence-one-way-publish-deferred.md)), itself deferred. Listed for completeness only. |

### 3.1 Read vs. write tools

- **Read-only tools** — `lore_story_status`, `lore_check`, `lore_graph`,
  `lore_query`, `lore_context` — perform no writes and are safe to call in a
  loop. They are deterministic: identical inputs against an unchanged bundle
  return byte-identical `structuredContent`.
- **Write tools** — `lore_new_concept`, `lore_link_tasks`, `lore_sync`,
  `lore_publish` — mutate `docs/` and/or `backlog/`. Each is **idempotent** in
  the same sense as the CLI command it wraps (e.g. `lore_sync` produces no diff
  when nothing changed). Tool annotations advertise `readOnlyHint` /
  `idempotentHint` so an MCP client can reason about safe retries.

### 3.2 Input schemas

A tool's input schema is derived from the **same Zod schemas** that validate the
corresponding CLI command's flags ([Zod is the single source of truth](../adr/0006-schema-types-templates.md)).
The same `z.toJSONSchema()` machinery that produces the editor modeline schemas
produces each tool's MCP `inputSchema`, so the tool surface cannot drift from the
CLI surface — both are generated from one definition.

### 3.3 Result shape: `structuredContent` reuses the `--json` serializer

On success, a tool returns MCP **`structuredContent`** containing the **identical
`{schemaVersion, kind, data}` envelope** the CLI emits in `--json` mode. The MCP
server does not re-serialize results; it calls the same core function and runs
its return value through the **same `--json` serializer** the CLI uses. A
representative `lore_query` result:

```jsonc
// MCP CallToolResult
{
  "structuredContent": {
    "schemaVersion": 1,
    "kind": "query.results",
    "data": {
      "total": 120,
      "shown": 30,
      "truncated": true,
      "hits": [ /* ranked concepts with summary snippets */ ]
    }
  },
  "content": [
    { "type": "text", "text": "Showing 30 of 120 — narrow with type:story" }
  ]
}
```

- **`structuredContent`** is the machine payload — byte-for-byte what
  `lore query --json` writes to stdout. A client may `switch` on `kind` exactly
  as a CLI caller would, and MUST tolerate **unknown `kind`** values gracefully
  (new ones may appear under the same `schemaVersion`; see
  [CLI contract §2](cli-contract.md)).
- **`content`** carries an optional human-readable text rendering for clients
  that surface tool output to a person — equivalent to the CLI's `--plain` view.
  It is never a parsing target.

### 3.4 Error shape

On failure a tool returns an MCP error result with `isError: true`. Its
`structuredContent` carries the **same `{error_type, message, hint, input}`
error envelope** the CLI writes to stderr ([CLI contract §3](cli-contract.md)),
and the human-readable `content` carries the message. The CLI's semantic exit
codes (`0` ok, `2` usage, `3` not-found, `4` denied, `5` conflict/exists, `6`
validation-or-drift) are surfaced as an `exit_code` field inside the error
envelope so an MCP client can classify failures with the same taxonomy a shell
caller uses. As with the CLI, success ⇒ envelope, failure ⇒ error object — never
mixed.

---

## 4. Resources

Resources expose the bundle for **progressive disclosure**: an agent reads the
index, follows links to a concept, then calls a tool to act. Each resource is a
read over the same `bundle.ts` graph the CLI commands use; none performs a write.

| Resource URI | Content | Backing |
|---|---|---|
| `lore://bundle/index` | The rendered root `docs/index.md` — the OKF entry point and progressive-disclosure starting node. | `bundle.ts` (root index) |
| `lore://concept/{id}` | A single concept's frontmatter + body, by concept id (path minus `.md`, e.g. `stories/bulk-archive`). | `concept.ts` |
| `lore://graph` | The full cross-link graph (nodes, edges, token estimates) — the same payload as the `lore_graph` tool / `graph.export` kind. | `bundle.ts` |
| `lore://context/{id}` | The deterministic, depth-bounded graph-expansion export for a concept id — the same payload as `lore_context` / `context.export`, at default budget. | `context.ts` |

Notes:

- **URI templates.** `lore://concept/{id}` and `lore://context/{id}` are
  parameterized resource templates; the `{id}` is a concept id. `lore://bundle/index`
  and `lore://graph` are fixed resources.
- **Resource vs. tool overlap.** `lore://graph` and `lore://context/{id}` mirror
  the `lore_graph` and `lore_context` *tools*. The **resource** form is for the
  agent to *read* a stable view by URI (progressive disclosure, cacheable); the
  **tool** form is for parameterized queries (e.g. a custom `max_tokens` budget
  or a different start depth). Both call the same core function.
- **Concept ids, not file paths.** Resource ids use the bundle's concept-id form
  (path minus `.md`, no leading slash), matching how cross-links and the
  `doc:<conceptId>` Backlog label identify concepts elsewhere.

### Intended agent flow

An agent reads `lore://bundle/index`, follows a link to a story
(`lore://concept/stories/bulk-archive`), calls `lore_story_status` to see live
task state, does its work, then calls `lore_sync` and `lore_check` — all without
shelling out or text-scraping. Internally every one of those steps drives the
**same** core functions the CLI drives, which in turn drive the Backlog.md
`--json` adapter. This is the same loop the CLI + SKILL.md bridge supports today;
MCP would offer it as typed tool calls rather than subprocess invocations.

---

## 5. Contract stability and versioning

Because the MCP layer re-emits the CLI's `{schemaVersion, kind, data}` envelope
verbatim, it inherits the CLI contract's **additive-only** versioning policy
([CLI contract §7](cli-contract.md)): new `kind` values and new fields may appear
under the same `schemaVersion`; breaking changes bump `schemaVersion`. Clients
branch on `kind` and tolerate unknown `kind`s and unknown fields — the same
posture OKF mandates for unknown types and keys
(see [OKF conformance](okf-conformance.md)).

When the MCP server is implemented, the only new surface to specify is the MCP
*envelope around* this contract (tool/resource names, annotations, `isError`
handling) — the payloads are already locked here. That is the point of
pre-specifying: the deferred transport lands against a stable target.

---

## See also

- [ADR-0004: CLI-first; SKILL.md bridge; MCP deferred](../adr/0004-cli-first-skill-bridge-mcp-deferred.md) — the decision and its token/reliability evidence
- [System architecture §6](architecture.md) — where the deferred MCP transport sits in the layering
- [CLI contract](cli-contract.md) — the `{schemaVersion, kind, data}` envelope, `kind` registry, error envelope, exit codes, and stream discipline this design reuses
- [CLI surface](cli-surface.md) — the command catalog each tool maps to
- [Backlog CLI contract](backlog-cli-contract.md) and [Backlog JSON schema](backlog-json-schema.md) — the Backlog.md `--json` boundary the task tools traverse
- [Agent onboarding runbook](../runbooks/agent-onboarding.md) — the SKILL.md bridge that is the *primary* agent surface today
- [Schema, types, templates (ADR-0006)](../adr/0006-schema-types-templates.md) — the Zod source of truth that generates both CLI flag and MCP input schemas
- [lore design spec](../specs/lore-design.md) — the full design
- [docs index](../index.md) — bundle entry point · [ADR log](../adr/index.md)
