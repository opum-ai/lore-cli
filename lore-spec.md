---
title: "lore — CLI + MCP spec v0.2"
description: An OKF-native documentation tool (TypeScript/Bun) tightly coupled to Backlog.md via its CLI, exposed as both a CLI and an MCP server, with a one-way Confluence publish adapter.
status: draft
okf_version: "0.1"
---

# `lore` — Specification v0.2 (TypeScript / Bun)

> ⚠️ **SUPERSEDED FRAMING — read before this spec.** This is the v0.2 product
> spec and remains the narrative origin, but two of its framings have been
> superseded by locked decisions and are corrected in
> [docs/specs/lore-design.md](docs/specs/lore-design.md):
>
> - **Backlog adapter is JSON-only, not `--plain`.** Every reference below to a
>   `--plain` text-parsing Backlog adapter (the §3 "via the CLI" adapter, the
>   `backlog … --plain` / `Bun.spawn` notes, `backlog task list --plain`) is
>   superseded: the adapter invokes `backlog … --json` and parses the
>   `{schemaVersion, kind, data}` envelope, with **no `--plain` fallback**. See
>   [ADR-0002 — Backlog.md integration: JSON-only via `--json`](docs/adr/0002-backlog-integration-json-only.md).
>   (lore's own *output* layer still has a `--plain` mode; that is unrelated to
>   how it reads Backlog.)
> - **CLI-first; MCP deferred, not "CLI + MCP".** The title, intro, and §6 present
>   lore as "both a CLI and an MCP server". That is superseded: the **CLI is the
>   primary surface** and the **MCP server is secondary, deferred to v2** (built
>   on a reusable core so the future MCP tool calls the same functions). See
>   [ADR-0004 — CLI-first; MCP deferred](docs/adr/0004-cli-first-skill-bridge-mcp-deferred.md).
>
> Where this document and the locked ADRs disagree, the ADRs and
> [lore-design.md](docs/specs/lore-design.md) win.

A thin tool that makes repo-resident documentation a first-class, agent-readable
**OKF bundle**, tightly coupled to **Backlog.md** tasks, exposed as **both a CLI
and an MCP server**, with a **one-way** publish adapter to Confluence. The repo
is the single source of truth.

Built to match Backlog.md's own stack and distribution: **Bun + TypeScript**,
**Commander.js** CLI, npm-distributable, zero-config. Integration with
Backlog.md is via its **CLI** (`backlog … --plain`), never by importing its
internals or hand-editing its task files.

**Non-goals (deliberately).** No collaborative editing, no auth/permissions
layer, no WYSIWYG, no bidirectional sync, no reimplementation of Backlog.md.
Those are what make Confluence worth paying for — `lore` publishes *to*
Confluence rather than competing with it.

---

## 1. Concepts and how they map

| Layer | Tool | On disk | Identity |
|---|---|---|---|
| Tasks | Backlog.md | `backlog/tasks/*.md` (Backlog.md-owned) | task ID, e.g. `task-42` |
| Docs | OKF bundle | `docs/` tree of `*.md` | concept ID = path minus `.md` |
| Glue | `lore` (CLI + MCP) | `docs/`, plus `.lore/` state | — |

OKF requires exactly one frontmatter field: `type`. Everything else is
producer-defined, so the "story convention" below is fully OKF-conformant.

### 1.1 Document types (the story convention)

`lore` defines a small, opinionated set of `type` values. Producers may add
more; consumers tolerate unknown types (OKF §9).

| `type` | Purpose | Typically links to |
|---|---|---|
| `Epic` | A large body of work | child `Story` concepts |
| `Story` | A unit of deliverable behavior | Backlog.md task IDs, `Spec`, `ADR` |
| `Spec` | Design/spec for a feature (your SDD output) | `Story`, `ADR`, code paths |
| `ADR` | Architecture decision record | `Spec`, other `ADR` |
| `Runbook` | Operational procedure | `Reference`, resources |
| `Reference` | Stable factual concept (schema, API, metric) | anything |

### 1.2 The `Story` concept — canonical shape

```markdown
---
type: Story
title: Bulk-archive completed orders
description: Operators can archive orders older than 90 days in one action.
status: in-progress            # mirrors Backlog.md; see §3.2
tags: [orders, retention]
tasks: [task-42, task-57]      # Backlog.md task IDs this story owns
specs: [/specs/order-archival.md]
timestamp: 2026-06-20T00:00:00Z
okf_version: "0.1"
---

# Context

Why this exists. Links to the [orders table](/reference/orders.md).

# Acceptance criteria

1. …

# Tasks

<!-- lore:tasks:begin -->
<!-- lore:tasks:end -->
```

The `tasks:` frontmatter list is the **source of the coupling**. The
`<!-- lore:tasks -->` block is a managed region the CLI rewrites with live
task status pulled from Backlog.md (§3.3). Hand edits inside the markers are
overwritten; everything outside is yours.

---

## 2. Repository layout

```
repo/
├── backlog/                     # Backlog.md owns this — never hand-edit
│   ├── tasks/
│   │   ├── task-42 - Bulk archive.md
│   │   └── …
│   └── config.yml
├── docs/                        # the OKF bundle (lore owns conventions, you own content)
│   ├── index.md                 # OKF root index; carries okf_version
│   ├── log.md                   # optional change log
│   ├── epics/
│   ├── stories/
│   ├── specs/
│   ├── adr/
│   ├── runbooks/
│   └── reference/
├── .lore/                       # CLI state (committed)
│   ├── config.toml
│   ├── sync-state.json          # doc-path → {content_hash, confluence_page_id, version}
│   └── cache/                   # transient; gitignored
└── CLAUDE.md / AGENTS.md
```

`docs/` is a valid OKF bundle on its own — `cat`-readable, GitHub-renderable,
consumable by any OKF tool, with or without `lore` installed.

---

## 3. Backlog.md integration — via the CLI

`lore` integrates with Backlog.md **exclusively through its CLI**, consuming
machine-readable output. It does **not** import Backlog.md internals (no stable
public library API is published; it ships as a Bun binary) and does **not**
hand-edit `backlog/tasks/*.md` (Backlog.md's docs explicitly warn that task
files should be mutated via Backlog.md commands so field types/metadata stay
consistent).

### 3.1 The adapter (`src/adapters/backlog.ts`)

A thin wrapper that shells out via Bun's subprocess API and parses `--plain`
output. Representative surface:

```ts
// All calls invoke the real `backlog` binary with --plain and parse the result.
interface BacklogTask {
  id: string;            // "task-42"
  title: string;
  status: string;        // "To Do" | "In Progress" | "Done" | custom
  assignees: string[];
  labels: string[];
  file: string;          // path under backlog/tasks/
}

interface BacklogAdapter {
  listTasks(opts?: { status?: string }): Promise<BacklogTask[]>;   // `backlog task list --plain`
  viewTask(id: string): Promise<BacklogTask>;                       // `backlog task <id> --plain` / view
  editTask(id: string, patch: Partial<BacklogTask>): Promise<void>;// `backlog task edit <id> …`
  searchModifiedFile(path: string): Promise<BacklogTask[]>;         // `backlog search --modified-file <p> --plain`
  version(): Promise<string>;                                       // capability probe
}
```

Implementation notes:
- Use `Bun.spawn(["backlog", …])`, read stdout, parse `--plain`.
- **Capability probe at startup:** run `backlog --version` (and a dry
  `task list --plain`) once; cache in `.lore/cache/`. If `--plain` shape is
  unrecognized, fail loud with a clear "unsupported Backlog.md version" error
  rather than silently mis-parsing.
- All writes to tasks go through `backlog task edit` — never file writes.

### 3.2 Status reconciliation

A `Story`'s `status` reflects its tasks. Rule (configurable):

- all tasks Done → story `done`
- any task In Progress → story `in-progress`
- else if any task exists → `todo`
- no tasks → `status` left as authored (narrative-only doc)

`lore sync` recomputes and rewrites `status`; `lore check` reports drift
without writing (CI gate).

### 3.3 The managed task block

For each `Story`, `lore` regenerates the region between
`<!-- lore:tasks:begin -->` and `<!-- lore:tasks:end -->` from live
`backlog task list --plain` data:

```markdown
<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [task-42](../../backlog/tasks/task-42%20-%20Bulk%20archive.md) | Bulk archive | Done |
| [task-57](../../backlog/tasks/task-57%20-%20Archive%20UI.md) | Archive UI | In Progress |
<!-- lore:tasks:end -->
```

Idempotent: no upstream change → byte-identical output (clean diffs, safe
agent loops).

### 3.4 Link direction

- **Doc → tasks:** `tasks:` frontmatter on a `Story`/`Spec`.
- **Task → doc (optional):** `lore link` calls `backlog task edit <id>` to
  record the doc path as a label or note (e.g. label `doc:stories/bulk-archive`),
  so the back-reference lives in Backlog.md's own metadata, set the
  Backlog.md-approved way.

---

## 4. Tech stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | **Bun** | Matches Backlog.md; fast startup; single-binary build via `bun build --compile` |
| Language | **TypeScript** | Same as Backlog.md; shared mental model |
| CLI framework | **Commander.js** | Same as Backlog.md — consistent UX/flags |
| Frontmatter | **gray-matter** | Battle-tested YAML frontmatter parse/serialize |
| Markdown AST | **unified / remark (mdast)** | Real AST for managed-block surgery + link rewriting |
| MCP server | **@modelcontextprotocol/sdk** | Expose `lore` as agent-callable tools |
| Confluence | `fetch` + Confluence REST (no SDK needed) | Isolated adapter module |
| Validation | **zod** | Frontmatter schema validation per `type` |

Distribution: published to npm as `lore` (or scoped), runnable via
`bunx lore` / `npx lore`, plus a compiled binary release for CI.

---

## 5. CLI surface (Commander)

All commands non-interactive by default (agent/CI-safe); `--json` everywhere;
exit non-zero on error.

### 5.1 Scaffolding
```
lore init                         # create docs/ bundle, .lore/, root index.md
lore new story "Bulk archive"     # scaffold typed concept w/ frontmatter
lore new spec  "Order archival" --story stories/bulk-archive-orders
lore new adr   "Use soft deletes"
  # flags: --type --tags --epic --resource --template
```

### 5.2 Coupling to Backlog.md
```
lore link stories/bulk-archive-orders task-42 task-57   # add to frontmatter + tag task
lore unlink stories/… task-42
lore tasks stories/…              # live status via `backlog task list --plain`
lore orphans                      # tasks with no owning doc; docs whose tasks vanished
```

### 5.3 Coherence
```
lore sync                         # recompute status, rewrite managed blocks, regen index/log
lore check                        # read-only drift/broken-link/missing-type report (CI gate)
lore graph --format dot|json      # cross-link graph (OKF §5)
```

### 5.4 Validation
```
lore validate                     # OKF §9 conformance: parseable frontmatter + non-empty type
```

### 5.5 Publish
```
lore publish confluence [PATHS…]  # repo → Confluence; changed only by default
  --space KEY --parent PAGE_ID --dry-run --all --prune
```

### 5.6 MCP server
```
lore mcp                          # start the MCP server over stdio (§6)
```

---

## 6. MCP server

`lore` ships an MCP server (mirroring Backlog.md's own CLI+MCP pattern) so
agents like Claude Code call structured tools instead of parsing CLI text.
Started via `lore mcp` (stdio transport), built on
`@modelcontextprotocol/sdk`.

### 6.1 Tools exposed

| Tool | Maps to | Notes |
|---|---|---|
| `lore_new_concept` | `lore new` | type, title, tags, parent |
| `lore_link_tasks` | `lore link` | story ↔ task IDs (writes both sides) |
| `lore_story_status` | `lore tasks` | live task rollup for a story |
| `lore_sync` | `lore sync` | returns what changed (diff summary) |
| `lore_check` | `lore check` | structured drift/lint report |
| `lore_graph` | `lore graph` | bundle cross-link graph as JSON |
| `lore_publish` | `lore publish confluence` | dry-run supported |

### 6.2 Resources exposed

| Resource | Content |
|---|---|
| `lore://bundle/index` | rendered `docs/index.md` (progressive disclosure) |
| `lore://concept/{id}` | a single concept's frontmatter + body |
| `lore://graph` | the full cross-link graph |

Design intent: an agent reads `lore://bundle/index`, follows to a story,
calls `lore_story_status`, does work, then `lore_sync` + `lore_check` — all
without shelling out or text-scraping. Internally these still drive the same
core functions the CLI uses, which in turn drive `backlog --plain`.

---

## 7. Confluence sync adapter (one-way)

Separate module (`src/adapters/confluence.ts`), loaded only when invoked.
Core `lore` has zero Confluence dependency.

### 7.1 Direction & source of truth
**One-way, repo → Confluence.** Confluence is a publish target; edits there
are overwritten on the next publish of a changed source doc. A provenance
banner is injected into every page (§7.4).

### 7.2 Idempotency
`.lore/sync-state.json` maps each doc → `{content_hash, page_id, version, space}`.
Per doc: hash the rendered body; if unchanged, skip (no API call); else
update (PUT, version+1) or create (POST) and persist new hash/version. Cheap
to run on every merge.

### 7.3 Rendering: OKF markdown → Confluence
- Markdown → Confluence **storage format (XHTML)** for Server/DC, or **ADF**
  for Cloud v2 — selectable via `confluence.format` in config.
- **Cross-links:** OKF bundle-relative links (`/reference/orders.md`) resolved
  against `sync-state.json`, rewritten to Confluence page links; unresolved
  targets render as plain text + tracked warning, never a broken link macro.
- **Hierarchy:** `docs/` directory tree → Confluence page ancestry;
  `index.md` files become parent pages.
- **Frontmatter:** `type`, `tags`, `status` → Confluence labels / page props.

### 7.4 Provenance banner
Every page gets an injected info panel:
> 🔁 Published from `docs/…md` in `<repo>` @ `<sha>`. Source of truth is the
> repo — edits here will be overwritten.

### 7.5 Auth/config
```toml
# .lore/config.toml
[confluence]
base_url = "https://yourorg.atlassian.net/wiki"
space    = "ENG"
parent_page_id = "98765"
format   = "storage"          # or "adf"
# token via env: LORE_CONFLUENCE_TOKEN
```
Token never stored in repo (env only). This boundary is also where the
**Atlassian MCP** server could substitute for direct REST if preferred.

---

## 8. Project structure

```
lore/
├── package.json                 # bin: { lore: dist/cli.js }; type: module
├── tsconfig.json
├── src/
│   ├── cli.ts                   # Commander entrypoint
│   ├── mcp.ts                   # MCP server entrypoint (`lore mcp`)
│   ├── core/
│   │   ├── concept.ts           # frontmatter <-> object (gray-matter + zod)
│   │   ├── bundle.ts            # walk docs/, build graph, index/log gen
│   │   ├── managed-block.ts     # remark-based <!-- lore:tasks --> surgery
│   │   ├── reconcile.ts         # status rules
│   │   └── links.ts             # OKF link resolution + rewriting
│   ├── adapters/
│   │   ├── backlog.ts           # `backlog --plain` wrapper (§3)
│   │   └── confluence.ts        # one-way publish (§7)
│   ├── commands/                # one file per CLI command
│   └── state.ts                 # .lore/ read/write
├── tests/
└── dist/
```

---

## 9. Build order (milestones)

| Milestone | Scope | Value |
|---|---|---|
| M1 | `init`, `new`, `validate`; concept/frontmatter lib (gray-matter+zod); bundle walk | Usable OKF bundle + scaffolding |
| M2 | `backlog.ts` adapter, `link`, `sync`, `check`, managed-block (remark), status reconcile | The Backlog.md coupling — the differentiator |
| M3 | `index.md`/`log.md` gen, `graph`, `orphans` | Navigability + agent ergonomics |
| M4 | `lore mcp` server (tools + resources) | Agent-native, matches Backlog.md's CLI+MCP shape |
| M5 | `publish confluence` (create/update, hash cache, banner) | One-way publish |
| M6 | link rewriting, hierarchy mapping, `--prune`, labels | Production-grade Confluence mirror |

M1–M4 are the high-value core and play to your strengths; M5–M6 are the
isolated adapter and can lag or be swapped for the Atlassian MCP.

---

## 10. Open decisions (flag before building)

1. **Backlog.md `--plain` contract** — confirm exact `--plain` output shape of
   the installed Backlog.md version; drives `backlog.ts` parsing (§3.1).
   (Capability probe handles graceful failure, but pinning a min version is cleaner.)
2. **Consume Backlog.md's own MCP?** — optional alternative to CLI parsing:
   `lore` could call `mcp-backlog-md`'s tools instead of `backlog --plain`.
   CLI is the default per your decision; MCP-to-MCP is a possible v2.
3. **Confluence target** — Cloud (ADF, v2 REST) vs Server/DC (storage, v1 REST);
   changes the renderer (§7.3).
4. **CLI name** — `lore` is a placeholder.

