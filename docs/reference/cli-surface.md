---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: "CLI surface: the complete lore command catalog"
description: >-
  The authoritative catalog of every lore subcommand — purpose, arguments,
  key flags, output kind, and exit codes — for the CLI that is lore's primary
  interface for humans, Claude Code, and CI. Covers init, new, validate,
  check, sync, link/unlink, tasks, orphans, graph, query, context, replace,
  rename, supersede, scaffold, schema, agents, instructions, help, and the
  deferred publish/mcp commands.
tags: [reference, cli, commands, flags, exit-codes, agent, ci]
summary: >-
  Command-by-command catalog of the lore CLI — purpose, flags, output, and
  exit codes for every subcommand, plus the global --plain/--json modes that
  apply to all of them.
timestamp: 2026-06-21T00:00:00Z
---

# CLI surface: the complete lore command catalog

The **CLI is lore's primary interface** — for humans at a terminal, for Claude
Code through the generated agent bridge, and for CI gates. (The MCP server is
[secondary and deferred to v2](./mcp-tools.md); when it ships it will wrap the
same `core/` functions these commands call.) This page is the command catalog:
what each subcommand does, its arguments and key flags, the shape of its
output, and the exit codes it can return.

This page describes **what each command does**. The cross-cutting rules that
govern **how every command behaves** — the three output modes, the six
semantic exit codes, the stdout/stderr discipline, the `--json` envelope and
error envelope, truncation hints, and the `kind` taxonomy — are specified once
in the [CLI contract](./cli-contract.md) and are not repeated per command here.

## Global behavior (applies to every command)

Every command obeys the same contract; read it in full in the
[CLI contract](./cli-contract.md). The essentials:

- **Output modes.** Three tiers with strict precedence `--json` > `--plain` >
  pretty.
  - **pretty** (default) — human view, color on a TTY only (honors `NO_COLOR`).
  - **`--plain`** — ANSI-free stable text; **selected automatically when stdout
    is not a TTY** (pipes, files, CI, subprocess capture).
  - **`--json`** — the canonical envelope `{ schemaVersion, kind, data }` on
    stdout. The `kind` per command is noted below.
- **Channels.** stdout = payload only; stderr = diagnostics (progress,
  warnings, errors). In `--json` mode a success leaves stdout as exactly one
  parseable envelope; a failure leaves stdout empty and writes the
  `{ error_type, message, hint, input }` error envelope to stderr.
- **Exit codes.** `0` ok · `2` usage · `3` not-found · `4` denied · `5`
  conflict/exists · `6` validation-or-drift. Code `1` is reserved for
  unexpected/uncaught errors. Each command's *typical* non-zero codes are
  listed in its entry; any command can return `2` for a usage error.
- **Non-interactive & idempotent.** No prompts; safe to run in agent loops and
  CI. Re-running a write command with no upstream change produces a
  byte-identical result (see [ADR-0011](../adr/0011-frontmatter-serialization-stability.md)).
- **Help & discovery.** `lore --help`, `lore <command> --help`, `lore --version`.
  `lore help --json` emits a machine-readable command manifest (see
  [`help`](#help) below).

In the entries below, `[--plain] [--json]` is implied on **every** command and
is not repeated. A concept `<id>` is a bundle path **minus** the `.md` suffix
(e.g. `reference/orders`, not `docs/reference/orders.md`).

---

## Scaffolding

### `init`

Initialize a lore bundle in the current repo: create the `docs/` OKF bundle
with a root `index.md` (the only file carrying `okf_version`), seed the
sub-index files, create the `.lore/` [state directory](../adr/0013-lore-state-directory.md)
(`config.toml`, `templates/`, exported JSON `schemas/`), and wire Backlog
coexistence (set `auto_commit=false`, `check_active_branches=false`,
`remote_operations=false`; gitignore `backlog/.locks/`). Runs the Backlog.md
capability probe and fails loud if the installed Backlog.md lacks the required
`--json` support (see [backlog CLI contract](./backlog-cli-contract.md)).

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--force` (re-seed missing scaffold without overwriting authored content) |
| **Output** | `kind: init.result` — what was created/skipped |
| **Exit** | `0` ok · `5` already initialized (without `--force`) · `6` Backlog.md probe failed |

### `new`

Scaffold a new typed concept file with valid OKF frontmatter and the per-type
required sections. The body is rendered from `.lore/templates/<type>.md` (a
template with `{{placeholders}}`) when present, else a built-in default for the
type. Writes the file at the conventional path for its type and prints the new
concept id.

```
lore new <type> "<title>" [flags]
lore new story "Bulk archive completed orders"
lore new spec  "Order archival"  --story stories/bulk-archive-orders
lore new adr   "Use soft deletes" --tags retention,orders
lore new reference "Orders table" --template reference --var owner=payments
```

`<type>` is one of the story-convention types (`Reference`, `Spec`, `ADR`,
`Runbook`, `Epic`, `Story`) or any user-defined type — unknown types are
accepted (OKF tolerance) and scaffolded with the lenient `type`-only shape.

| | |
|---|---|
| **Args** | `<type>` `"<title>"` |
| **Key flags** | `--tags a,b` · `--epic <id>` · `--story <id>` · `--resource <url>` · `--template <name>` (file under `.lore/templates/`) · `--var k=v` (repeatable; fills `{{k}}`) · `--summary "<sentence>"` |
| **Output** | `kind: new.result` — `{ id, path, type }` |
| **Exit** | `0` ok · `2` bad type/var syntax · `5` target path already exists · `6` template missing required `{{var}}` |

---

## Validation & coherence

These are the two gates. **`validate`** judges each file against OKF and the
type schema; **`check`** judges the bundle's internal consistency (drift,
links, portability). Both default to the whole bundle and both exit `6` on
failure, making them drop-in CI gates. See
[ADR-0007](../adr/0007-validation-and-coherence.md) and the
[validation/conformance reference](./okf-conformance.md).

### `validate`

Tiered per-file validation:

- **OKF §9 conformance** — frontmatter parses and `type` is present/non-empty
  → **error** if violated.
- **Per-type frontmatter shape + required sections** — for known types,
  validated against the strict [Zod schema](../adr/0006-schema-types-templates.md)
  (the single source of truth) → **error** if violated.
- **Unknown type / extra keys** — accepted but → **warning** (OKF tolerance;
  custom frontmatter passes through untouched).
- **Frontmatter quote-safety** — values that would serialize ambiguously are
  flagged (see [ADR-0011](../adr/0011-frontmatter-serialization-stability.md)).

| | |
|---|---|
| **Args** | optional `[paths…]` or glob (default: whole bundle) |
| **Key flags** | `--type <T>` (limit to one type) · `--strict` (treat warnings as errors) |
| **Output** | `kind: validate.report` — per-file findings tiered error/warning |
| **Exit** | `0` clean (or warnings only) · `6` any error (or any warning under `--strict`) |

### `check`

The **drift gate** — read-only, never writes. Aggregates:

- **Status reconciliation drift** — recomputes each `Story`/`Spec` status from
  its linked tasks (via `backlog … --json`) and reports any file whose
  authored `status` differs from the computed one (the write side is
  [`sync`](#sync)). See [ADR-0009](../adr/0009-story-task-coupling-reconciliation.md).
- **Managed-block drift** — reports any `<!-- lore:tasks -->` region that
  `sync` would change.
- **Internal link + heading-anchor validation** — whole-bundle pure-JS pass:
  every internal `.md` cross-link must resolve and every `#anchor` must hit a
  real heading. **External-URL liveness** is opt-in with `--external` (Bun
  `fetch`, no Rust/lychee runtime dependency; see
  [ADR-0010](../adr/0010-multi-consumer-docs-layer.md)) and is **non-deterministic**,
  so its `external-link` findings are **advisory only — they never change the
  exit code, not even under `--strict`** ([ADR-0007](../adr/0007-validation-and-coherence.md)).
- **Portability lint** (warn-only) — flags non-portable Markdown/link syntax per
  the [portable Markdown rules](./portable-markdown.md): wikilinks/embeds/callouts/
  highlights/`%%`-comments and Obsidian block refs (`^id`); non-portable link
  form (leading-slash, missing `.md`, unencoded, accidental-colon filenames,
  trailing-slash directory links); and MDX hazards (raw `<`/`{` in prose, raw
  HTML, leading-underscore and `.mdx` file names).

Also surfaces per-doc and bundle **token estimates** (labeled chars/4 heuristic).

| | |
|---|---|
| **Args** | optional `[paths…]` (default: whole bundle) |
| **Key flags** | `--strict` (treat portability warnings as failures for the exit code) · `--external` (also probe external-URL liveness — advisory, never gates) · `--fix` (where safe, defer to `sync` for managed-block/status — `check` itself never writes) |
| **Output** | `kind: check.report` — drift, broken links/anchors, portability findings, token estimates; plus advisory `externalFindings` when `--external` ran |
| **Exit** | `0` no broken internal links/anchors, no status/managed-block drift · `3` a linked task id no longer exists · `6` any broken internal link/anchor, any status/managed-block drift (or any portability warning under `--strict`). External-liveness results never affect the exit. |

---

## Coherence writes

### `sync`

The **write** counterpart to `check`. For every concept whose `tasks:` links
Backlog tasks: recomputes `status` from each linked task's live status
(`backlog task view <id> --json` per id) — honoring any `[reconcile.overrides]`
in `.lore/config.toml` (ADR-0009 §3) — and rewrites it when changed; regenerates
each `<!-- lore:tasks -->` managed region from the same data. Unless
`--no-index`, also regenerates the root `index.md` / sub-index listings (each
concept's `title`, falling back to its file name) and the git-history-derived
`log.md`, pinned to the current `HEAD`. All edits are
[remark/mdast-based](../adr/0008-managed-block-remark-ast.md) and idempotent —
no upstream change yields a byte-identical file, and only files that actually
changed are written, atomically. Touches **only** lore-managed regions and
frontmatter fields; authored prose is never altered. Finally, `lore` commits
whatever is currently uncommitted under `backlog/` — from an earlier
`link`/`unlink`/`rename`, or a hand edit — in one `lore`-authored commit
([ADR-0012](../adr/0012-backlog-coexistence-git-ownership.md): lore is the sole
committer of `backlog/`); this is independent of whether `sync` changed
anything in `docs/`, and skipped entirely under `--dry-run`.

| | |
|---|---|
| **Args** | optional `[paths…]` — scopes which concepts get status/managed-block reconciliation (default: every concept); `index.md`/`log.md` regeneration is always whole-bundle |
| **Key flags** | `--dry-run` (report what would change, write nothing — to `docs/` or `backlog/`) · `--no-index` (skip index/log regeneration) |
| **Output** | `kind: sync.result` — per-file diff summary of what changed, plus the `backlog/` commit outcome |
| **Exit** | `0` ok (changed or already clean) · `3` a linked task id no longer exists · `6` could not reconcile (e.g. Backlog probe failed) or could not commit `backlog/` |

---

## Coupling to Backlog.md

lore reads Backlog.md **JSON-only** (`backlog task list/view --json`,
`search --json`) and writes via `backlog task create`/`edit`; it never edits
task `.md` files and never stores lore metadata on tasks (Backlog drops unknown
frontmatter on edit). See [ADR-0002](../adr/0002-backlog-integration-json-only.md),
the [backlog JSON schema](./backlog-json-schema.md), and the
[backlog CLI contract](./backlog-cli-contract.md).

### `link`

Add one or more Backlog task ids to a concept's `tasks:` frontmatter list
(doc → task), and record the back-reference on each task (task → doc) by adding
the queryable label `doc:<conceptId>` via `backlog task edit` (display via
`--doc`). Idempotent: re-linking an already-linked task is a no-op.

```
lore link stories/bulk-archive-orders task-42 task-57
```

| | |
|---|---|
| **Args** | `<id>` `<taskId…>` |
| **Key flags** | `--no-back-ref` (skip the `doc:` label write to the task) |
| **Output** | `kind: link.result` — links added / already present |
| **Exit** | `0` ok · `2` usage (bad flag, comma-bearing id) · `3` concept or task id not found · `4` writing into a managed region denied · `5` `<id>` collides case-insensitively with another concept · `6` a task's back-reference edit failed (drift) |

### `unlink`

Remove task ids from a concept's `tasks:` frontmatter and remove the matching
`doc:<conceptId>` label from each task. Idempotent.

```
lore unlink stories/bulk-archive-orders task-42
```

With `--allow-missing`, `<id>` may not resolve to a live concept — the recovery
path for a concept relocated **outside** `lore rename` (`git mv`, an IDE
refactor), which would otherwise leave its `doc:<id>` label permanently
un-cleanable (`lore link` on the new id only ever adds; it has no notion of a
previous id to remove). Only the Backlog-side label/`--doc` are touched; there
is no concept file to update `tasks:` on.

```
lore unlink stories/bulk-archive-orders task-42 --allow-missing
```

| | |
|---|---|
| **Args** | `<id>` `<taskId…>` |
| **Key flags** | `--no-back-ref` (leave the `doc:` label on the task) · `--allow-missing` (tolerate `<id>` not resolving to a live concept) |
| **Output** | `kind: unlink.result` — links removed / already absent |
| **Exit** | `0` ok · `2` usage (bad flag, comma-bearing id) · `3` concept not found (unless `--allow-missing`) · `5` `<id>` collides case-insensitively with a live concept · `6` a task's back-reference edit failed (drift) |

### `tasks`

Show the **live status rollup** for a concept's linked tasks, pulled fresh from
`backlog task list --json` (does not write; this is the read-only view that
[`sync`](#sync) materializes into the managed block).

```
lore tasks stories/bulk-archive-orders
```

| | |
|---|---|
| **Args** | `<id>` |
| **Key flags** | `--status <S>` (filter) |
| **Output** | `kind: tasks.rollup` — `[{ id, title, status }]` for the concept's tasks |
| **Exit** | `0` ok · `3` concept not found · `6` Backlog probe failed |

### `orphans`

Bidirectional orphan report: **tasks with no owning doc** (no concept lists
them and no task carries a `doc:` label) and **docs whose linked tasks have
vanished** (a `tasks:` id Backlog no longer knows). The agent/CI signal that
the doc↔task coupling has gaps.

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--tasks-only` · `--docs-only` |
| **Output** | `kind: orphans.report` — `{ orphanTasks[], danglingLinks[] }` |
| **Exit** | `0` ok (report emitted even when non-empty; `orphans` is a report, not a gate) |

---

## Navigability & retrieval

These are deterministic, no-LLM operations (see
[ADR-0014](../adr/0014-core-has-no-llm-dependency.md) and
[ADR-0015](../adr/0015-lightweight-retrieval-no-vectors.md)).

### `graph`

Emit the bundle's cross-link graph (concepts as nodes, OKF cross-links and
frontmatter refs as edges; reserved index/log handled per OKF). Surfaces
per-node and bundle **token estimates** (labeled chars/4 heuristic). Used by
humans for orientation, by consumers for navigation, and by
[`rename`](#rename)/[`supersede`](#supersede) internally.

| | |
|---|---|
| **Args** | optional `<id>` (subgraph rooted at one concept; normalized like [`rename`](#rename), so path/`.md`/`./` forms resolve) |
| **Key flags** | `--dot` (emit Graphviz DOT; mutually exclusive with `--json`) · `--depth <n>` (bound subgraph radius) |
| **Output** | `kind: graph.export` — nodes, edges, token estimates (or DOT text under `--dot`). Machine JSON is the global `--json` envelope, as for every command. |
| **Exit** | `0` ok · `2` bad usage (`--dot` with `--json`, bad flag/`--depth`) · `3` root `<id>` not found |

### `query`

In-memory full-text search over the bundle (BM25-style ranking) with
frontmatter-field filters. **No vectors, RAG, or chunking.** Returns ranked
hits with a `summary`-derived snippet; output is bounded with a truncation hint
(`showing 30 of 120 — narrow with --type story`).

```
lore query "soft delete retention"
lore query "archive" --type Story --tag orders --status in-progress
```

| | |
|---|---|
| **Args** | `"<text>"` (optional; filters alone are valid) |
| **Key flags** | `--type <T>` · `--tag <t>` (repeatable) · `--status <S>` · `--limit <n>` (default bounded) · `--field k=v` (arbitrary frontmatter filter) |
| **Output** | `kind: query.results` — ranked `[{ id, type, title, snippet, score }]` with `total`/`shown`/`truncated` |
| **Exit** | `0` ok (zero hits is still `0`) · `2` bad filter syntax |

### `context`

Deterministic, depth-bounded **graph-expansion export** for feeding a concept
and its neighborhood to an agent within a token budget. Emits the target
concept's full body plus **one-line `summary` neighbor compaction** out to a
bounded depth, trimming to `--max-tokens` (labeled chars/4 estimate). Reuses
the same bundle graph and links as [`graph`](#graph); **no ranking heuristics**
— purely structural expansion.

```
lore context stories/bulk-archive-orders --max-tokens 4000 --depth 2
```

| | |
|---|---|
| **Args** | `<id>` |
| **Key flags** | `--max-tokens <n>` (budget; default bounded) · `--depth <n>` (neighbor radius, default 1) |
| **Output** | `kind: context.export` — target body + neighbor summaries, with `tokenEstimate`/`truncated` |
| **Exit** | `0` ok · `2` bad usage (missing `<id>`, unknown/repeated flag, non-integer/out-of-range `--max-tokens`/`--depth`) · `3` `<id>` not found |

---

## Refactoring

### `replace`

Literal or regex find-replace across a single doc or the whole bundle. **Skips
lore-managed regions** (managed task blocks, generated index listings) so a
refactor can never corrupt machine-owned content. Preview with `--dry-run`.

```
lore replace "soft delete" "soft-delete" --in "docs/stories/**"
lore replace --regex "v0\.1" "v0.2" --dry-run
```

| | |
|---|---|
| **Args** | `<find>` `<replace>` |
| **Key flags** | `--regex` (treat `<find>` as a regex) · `--in <glob>` (scope; default whole bundle) · `--dry-run` (show matches, write nothing) |
| **Output** | `kind: replace.result` — per-file match/replacement counts |
| **Exit** | `0` ok · `2` invalid regex · `6` `--dry-run` reported changes and `--check`-style gating requested |

### `rename`

Graph-aware concept rename: move a concept to a new id/path **and rewrite every
inbound cross-link and frontmatter ref** across the bundle using the link
graph, then update sub-indexes. Links remain
[portable](./portable-markdown.md) (relative, URL-encoded, `.md`-suffixed).

If the renamed concept has `tasks:` entries, every linked task's `doc:<id>`
label and `--doc` path are moved to the new id/path too (LORE-24, ADR-0009
§2) — the file move commits first, then the Backlog-side move runs, so a
Backlog failure never strands an already-renamed file. Unlinked concepts
never touch Backlog at all.

```
lore rename stories/bulk-archive-orders stories/order-archival
```

| | |
|---|---|
| **Args** | `<oldId>` `<newId>` |
| **Key flags** | `--dry-run` (report rewrites, move nothing — never attempts the Backlog-side move) |
| **Output** | `kind: rename.result` — moved path + every link rewrite applied + every linked task's back-reference move outcome |
| **Exit** | `0` ok · `3` `<oldId>` not found · `5` `<newId>` already exists, or (a linked concept only) collides case-insensitively with another concept · `6` a linked task's back-reference move failed (drift) |

### `supersede`

Mark one concept as superseded by another and wire the relationship both ways:
set `status: superseded` and `superseded_by: <newId>` on the old concept, set
`supersedes: <oldId>` on the new one, and (configurably) rewrite inbound links
to point at the successor. Preserves the old file (history), unlike `rename`.

```
lore supersede adr/0007-old-decision adr/0012-new-decision
```

| | |
|---|---|
| **Args** | `<oldId>` `<newId>` |
| **Key flags** | `--rewrite-links` (repoint inbound links to the successor) · `--dry-run` |
| **Output** | `kind: supersede.result` — frontmatter changes + any link rewrites |
| **Exit** | `0` ok · `3` either id not found · `5` `<oldId>` already superseded |

---

## Consumer scaffolding

### `scaffold`

Generate config for a downstream documentation **consumer**, written
**additively outside `docs/`** so the OKF bundle stays the single source of
truth and remains consumable with or without the scaffold (see
[ADR-0010](../adr/0010-multi-consumer-docs-layer.md) and the
[consumer compatibility reference](./consumer-compatibility.md)).

```
lore scaffold mkdocs
lore scaffold docusaurus
lore scaffold obsidian
```

- **`mkdocs`** — `mkdocs.yml` pointing at `docs/`; broken-links set to warn.
- **`docusaurus`** — Docusaurus config with `markdown.format: 'detect'` (raw
  `<`/`{` safety) and broken-links → warn.
- **`obsidian`** — `.obsidian/` vault config tuned for graph/backlinks over the
  relative-link convention (no wikilinks).

lore **detects** non-portable syntax (portability lint, in [`check`](#check))
but does **not** guarantee cross-renderer parity — that is the consumer's job.

| | |
|---|---|
| **Args** | `<target>` = `mkdocs` \| `docusaurus` \| `obsidian` |
| **Key flags** | `--force` (overwrite an existing generated config) |
| **Output** | `kind: scaffold.result` — files written/skipped |
| **Exit** | `0` ok · `2` unknown target · `5` config exists (without `--force`) |

### `schema`

Export the Zod-derived **Draft-7 JSON Schemas** (one per type) to
`.lore/schemas/` for editor autocomplete. These back the
`# yaml-language-server: $schema=…` modeline injected into scaffolded concept
files. Zod is the single source of truth (see
[ADR-0006](../adr/0006-schema-types-templates.md)).

```
lore schema export
```

| | |
|---|---|
| **Args** | `export` (subcommand) |
| **Key flags** | `--out <dir>` (default `.lore/schemas/`) · `--type <T>` (one type) |
| **Output** | `kind: schema.result` — schema files written |
| **Exit** | `0` ok · `4` `--out` not writable |

---

## Agent bridge & discovery

The agent bridge is CLI-generated, not a separate runtime (see
[ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md) and the
[agent onboarding runbook](../runbooks/agent-onboarding.md)).

### `agents`

Generate/refresh the Claude Code agent bridge: write
`.claude/skills/lore/SKILL.md` (how an agent should drive lore) and a small
`CLAUDE.md` nudge. (The `AGENTS.md` `@import` shim is deferred.) Idempotent —
regenerating with no change is byte-identical.

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--force` (overwrite hand-edited generated files) · `--check` (report drift without writing — CI gate for a stale bridge) |
| **Output** | `kind: agents.result` — files written/updated |
| **Exit** | `0` ok · `6` `--check` found the bridge out of date |

### `instructions`

Print lore's own agent-facing usage guidance (the canonical "how to use lore"
text the SKILL embeds), so an agent or human can pull guidance on demand
without opening files. Mirrors the `backlog instructions` idiom.

| | |
|---|---|
| **Args** | optional `<topic>` (e.g. `overview`, `linking`, `validation`) |
| **Key flags** | — |
| **Output** | `kind: instructions.text` — the guidance body |
| **Exit** | `0` ok · `3` unknown topic |

### `help`

Standard help for the program or a subcommand. In `--json` mode, `help` emits a
**machine-readable command manifest** — the full set of commands, their args,
flags, output `kind` values, and exit codes — so an agent can discover the CLI
surface programmatically rather than parsing prose.

```
lore help                 # top-level help (pretty)
lore help new             # help for one command
lore help --json          # command manifest (kind: help.manifest)
lore <command> --help     # equivalent per-command help
lore --version            # version string
```

| | |
|---|---|
| **Args** | optional `<command>` |
| **Key flags** | `--json` (command manifest) |
| **Output** | pretty/plain help text, or `kind: help.manifest` under `--json` |
| **Exit** | `0` ok · `3` unknown command |

---

## Deferred commands

These are part of the designed surface but **not implemented in the initial
milestones**. They are documented so the contract is stable when they land.

### `publish confluence` — DEFERRED

One-way publish of the bundle to Confluence (Cloud / ADF target). Isolated
adapter with **zero core dependency**; Server/DC is deferred-not-dropped. See
[ADR-0016](../adr/0016-confluence-one-way-publish-deferred.md).

```
lore publish confluence [paths…] --space KEY --parent PAGE_ID --dry-run --all --prune
```

| | |
|---|---|
| **Status** | implementation deferred (M7) |
| **Args** | optional `[paths…]` (default: changed-only) |
| **Key flags** | `--space <KEY>` · `--parent <PAGE_ID>` · `--all` · `--prune` · `--dry-run` |
| **Output** | `kind: publish.result` — created/updated/skipped pages |
| **Exit** | `0` ok · `4` auth/token denied · `5` remote version conflict |

### `mcp` — DEFERRED (v2)

Start the lore MCP server (stdio transport) exposing the same `core/` functions
as agent-callable tools/resources. Secondary to the CLI. Full design in the
[MCP tools reference](./mcp-tools.md); decision in
[ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md).

```
lore mcp
```

| | |
|---|---|
| **Status** | deferred to v2 (M6) |
| **Args** | none |
| **Key flags** | (transport flags TBD with the server) |
| **Output** | a long-running stdio MCP server (not a one-shot payload) |
| **Exit** | `0` clean shutdown |

---

## Related

- [CLI contract](./cli-contract.md) — output modes, exit codes, `--json`
  envelope, error envelope, `kind` taxonomy (the normative rules)
- [Backlog CLI contract](./backlog-cli-contract.md) — how lore drives `backlog`
- [Backlog JSON schema](./backlog-json-schema.md) — the JSON lore parses
- [OKF conformance](./okf-conformance.md) — what `validate` enforces
- [Portable Markdown](./portable-markdown.md) — link rules `check` lints
- [Consumer compatibility](./consumer-compatibility.md) — targets `scaffold` emits
- [MCP tools](./mcp-tools.md) — the deferred `mcp` surface
- [lore design spec](../specs/lore-design.md) — overall design
- [Agent onboarding runbook](../runbooks/agent-onboarding.md) — driving lore as an agent
- [ADR-0005: CLI contract](../adr/0005-cli-contract.md) — the decision behind the contract
- [ADR-0004: CLI-first; SKILL bridge; MCP deferred](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)
- [ADR log](../adr/index.md)
