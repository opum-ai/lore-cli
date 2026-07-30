---
# yaml-language-server: $schema=../../.lore/schemas/spec.schema.json
type: Spec
title: lore implementation design
description: The implementation design for lore — module responsibilities and boundaries, command sequence flows, the error/exit-code model, the idempotency strategy, git-native versioning, the output-mode layer, and the testing strategy — elaborating the product spec into a buildable plan.
tags: [design, spec, core, commands, idempotency, testing, exit-codes]
summary: "Describes lore's deterministic core, thin commands, stable serialization, Git-native versioning, output model, and testing strategy."
timestamp: 2026-06-21T00:00:00Z
---

# lore implementation design

This spec elaborates the product specification
([`lore-spec.md`](../../lore-spec.md)) into a concrete, buildable design. Where
the product spec says *what* lore does, this document says *how* the code is
organized to do it deterministically, idempotently, and safely for agents and
CI. It is the companion to the [system architecture](../reference/architecture.md)
reference (the map); this is the implementation territory.

It reflects the locked decisions captured in the
[architecture decision records](../adr/index.md): the Backlog.md coupling is
**JSON-only** ([ADR-0002](../adr/0002-backlog-integration-json-only.md)), the
**CLI is primary** with a deferred MCP transport
([ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)), the core has
**no LLM dependency** ([ADR-0014](../adr/0014-core-has-no-llm-dependency.md)),
and serialization is **byte-stable**
([ADR-0011](../adr/0011-frontmatter-serialization-stability.md)).

> **Note on the product spec.** The product spec ([`lore-spec.md`](../../lore-spec.md))
> describes the original `--plain` text-parsing adapter and an MCP-first framing.
> Both have since been superseded by locked decisions: the Backlog adapter is
> **JSON-only with no `--plain` fallback**
> ([ADR-0002](../adr/0002-backlog-integration-json-only.md)), and the **MCP
> server is secondary and deferred to v2**
> ([ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)). This design
> reflects the current decisions; the product spec remains the narrative origin.

## 1. Design goals, restated as constraints

Every design choice below serves these properties. They are constraints, not
aspirations — the test suite (§9) enforces them.

- **Deterministic core.** Same inputs → byte-identical outputs. No clocks, no
  randomness, no network in the core path; the only nondeterministic inputs
  (current time, the Backlog subprocess) enter through explicit, injectable
  seams.
- **Idempotent commands.** Running a write command twice with no intervening
  change produces no diff on the second run (§6).
- **Agent/CI-safe.** Non-interactive by default, machine-readable `--json`,
  semantic non-zero exit codes (§5).
- **Thin.** No reimplementation of Backlog.md, Confluence, or downstream
  renderers. lore orchestrates; it does not duplicate.
- **Repo is the source of truth.** No separate database or version store; state
  is files in `docs/`, `backlog/`, and `.lore/`, versioned by git (§7).

## 2. Module responsibilities and boundaries

The project structure follows product spec
[§8](../../lore-spec.md), with the two locked departures (JSON-only adapter,
deferred MCP). The dependency rule is strict: **dependencies point downward
only**. Surfaces depend on commands; commands depend on core, state, and
adapters; core depends on `schema.ts` and the filesystem (and, at two narrow
seams, the Backlog adapter); nothing lower knows about anything higher.

```
src/
├── cli.ts            # CLI entrypoint (hand-rolled now; Commander target in LCLI-284)
├── mcp.ts            # MCP server entrypoint (DEFERRED, v2)
├── core/             # deterministic library — returns structured objects
│   ├── profile.ts    # compile declarative profile into Zod validators
│   ├── schema.ts     # emit JSON Schema + modeline from generated validators
│   ├── concept.ts    # Lore fence split + js-yaml + generated Zod, stable serialize
│   ├── bundle.ts     # walk docs/, build graph, generate index/log, token estimates
│   ├── managed-block.ts  # mdast surgery (mdast-util-from-markdown) on <!-- lore:tasks --> regions
│   ├── reconcile.ts  # status roll-up rules
│   ├── links.ts      # OKF link resolution/rewrite, link+anchor validation, portability lint
│   ├── query.ts      # BM25-style full-text + frontmatter filters
│   └── context.ts    # depth-bounded graph-expansion export w/ token budget
├── adapters/
│   ├── backlog.ts    # `backlog … --json` wrapper (the only backlog subprocess seam)
│   └── confluence.ts # one-way publish (DEFERRED, v2; zero core dependency)
├── commands/         # one thin file per CLI command
├── output.ts         # the output-mode layer (pretty / --plain / --json)
├── config.ts         # .lore/config.toml loader (native TOML + env overlay)
├── errors.ts         # LoreError taxonomy → exit codes + JSON error envelope
└── state.ts          # .lore/ read/write (consumes config.ts) + git ownership of backlog/
```

### 2.1 `core/` is a reusable library that returns structured objects

The single most important boundary: **core functions never print, never format
for a human, never read process flags, and never call `process.exit`.** They
take typed inputs and return typed results (or throw a `LoreError`). This is
what lets the CLI, the deferred MCP transport, and the test suite all drive the
*same* implementation.

Representative core signatures (illustrative, not exhaustive):

```ts
// concept.ts — a single .md file as a typed object
interface Concept {
  id: string;                 // path minus .md, e.g. "stories/bulk-archive"
  path: string;               // repo-relative
  type: string;               // "Story" | "Spec" | ... | unknown (OKF-tolerant)
  frontmatter: Record<string, unknown>;  // validated where known, passthrough where not
  body: string;               // markdown after frontmatter
}
function parseConcept(path: string, raw: string): Concept;     // Lore fence split + js-yaml + generated Zod
function serializeConcept(c: Concept): string;                 // STABLE bytes (§6)

// bundle.ts — the whole docs/ tree as a graph
interface BundleGraph {
  concepts: Map<string, Concept>;        // by id
  edges: Edge[];                          // cross-links + frontmatter refs
  tokenEstimate(id?: string): number;     // chars/4 heuristic, labeled "estimate"
}
function loadBundle(root: string): BundleGraph;
function generateIndexes(g: BundleGraph): Map<string, string>; // path -> new bytes

// reconcile.ts — pure status rules
function rollUpStatus(story: Concept, tasks: BacklogTask[]): string;

// links.ts — validation + rewrite, all over the graph
function validateLinks(g: BundleGraph, opts: { external?: boolean }): LinkFinding[];
function rewriteInbound(g: BundleGraph, from: string, to: string): Edit[];

// query.ts / context.ts — pure reads
function query(g: BundleGraph, q: string, filters: FieldFilters): QueryHit[];
function context(g: BundleGraph, id: string, maxTokens: number): ContextExport;
```

Each function returns plain data; the command layer decides how to render it
and what exit code to map a thrown `LoreError` to.

### 2.2 Commands are thin

A `commands/*.ts` handler does exactly four things, in order:

1. **Accept** already-validated arguments from the CLI router (the current
   hand-rolled parser, replaced by Commander in `LCLI-284`) with no business
   logic.
2. **Call** one or more core functions (and, where needed, an adapter), passing
   injectable dependencies — the `clock`, the `BacklogAdapter`, the bundle root.
3. **Map** the structured result, or a caught `LoreError`, to an output payload
   and an exit code.
4. **Render** through `output.ts` in the selected mode.

A handler that contains an `if (status === "Done")` branch is a design smell —
that rule belongs in `reconcile.ts`. The litmus test: a future MCP tool
([ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)) must be
implementable by calling the *same* core function the command calls, with no
copied logic.

### 2.3 Adapters are isolated and lazy-loaded

- **`adapters/backlog.ts`** is the **only** place a `backlog` subprocess is
  spawned. It is JSON-only: it invokes `backlog task list --json`,
  `backlog task view <id> --json`, and `backlog search --json`, and
  `JSON.parse`s the canonical `{schemaVersion, kind, data}` envelope
  ([Backlog JSON schema](../reference/backlog-json-schema.md)). Writes go through
  `backlog task create` / `backlog task edit`. Full invocation rules live in the
  [Backlog CLI contract](../reference/backlog-cli-contract.md) and
  [ADR-0002](../adr/0002-backlog-integration-json-only.md). It is imported only
  by commands that touch tasks (`sync`, `check`, `link`, `unlink`, `tasks`,
  `orphans`) and, through them, by `reconcile.ts` / `managed-block.ts`.
- **`adapters/confluence.ts`** is **deferred to v2** and loaded *only* when
  `lore publish` is invoked. Core has **zero** Confluence dependency
  ([ADR-0016](../adr/0016-confluence-one-way-publish-deferred.md)).

### 2.4 `state.ts` — `.lore/` and git ownership

`state.ts` reads/writes `.lore/` (`config.toml` — parsed and validated by the
`config.ts` loader — plus `cache/`, `schemas/`, `templates/`) per
[ADR-0013](../adr/0013-lore-state-directory.md), and performs all git operations
on `backlog/`. The `config.ts` loader is deterministic and side-effect-free: it
takes injectable `root`/`env` seams, returns a typed `LoreConfig` (a missing
file is the zero-config default), reads the Confluence token **only** from
`$LORE_CONFLUENCE_TOKEN` (a committed token fails loud), and throws a
`validation` `LoreError` on malformed TOML or an out-of-contract value. lore is the **sole committer** of `backlog/`:
after any task write, `state.ts` runs `git add` / `git commit` on the changed
task files itself (§7). It configures Backlog with `auto_commit=false`,
`check_active_branches=false`, and `remote_operations=false`, and gitignores
`backlog/.locks/`, per
[ADR-0012](../adr/0012-backlog-coexistence-git-ownership.md).

## 3. Sequence flows for the key commands

Each command is a short, predictable pipeline. The flows below trace the
load-bearing ones; the full command list is the
[CLI surface](../reference/cli-surface.md).

### 3.1 `lore init`

```
cli → commands/init
  → state.ts: scaffold .lore/{config.toml, schemas/*.schema.json, templates/<type>.md, cache/}
  → schema.ts: emit Draft-7 JSON Schemas (z.toJSONSchema) for each known type
  → bundle.ts: write minimal docs/index.md carrying okf_version: "0.1"  (the ONLY file with that key)
  → bundle.ts: create empty type-directories (reference/, specs/, adr/, ... ) lazily as needed
```

Idempotent: re-running on an existing bundle is a **no-op, exit 0**, not an
error. Existing files are never clobbered; missing scaffold is filled in. Writes
`docs/index.md` only if absent. See
[ADR-0003](../adr/0003-okf-substrate.md).

### 3.2 `lore new <type> "<title>"`

```
cli → commands/new
  → schema.ts: resolve <type>; if unknown, allow with a WARNING (OKF tolerance)
  → state.ts: load .lore/templates/<type>.md (fallback to a built-in template)
  → substitute {{placeholders}} (title, type, ISO timestamp from injected clock, slug) + --var k=v
  → concept.ts: serialize frontmatter (type, title, description, tags, summary, timestamp) + modeline
  → write docs/<dir>/<slug>.md  (exit 5 if it already exists, never overwrite)
```

The new concept is **not** committed automatically — it is yours to edit
([ADR-0006](../adr/0006-schema-types-templates.md)). A missing or oversized
`summary` is warned about, not blocked.

The built-in `Story` template also ships an empty
`<!-- lore:tasks:begin -->…<!-- lore:tasks:end -->` managed block (LCLI-59), so
a fresh Story is immediately `lore sync`-able once linked, with no
hand-authored markup.

### 3.3 `lore validate`

```
cli → commands/validate
  → bundle.ts: load every concept (parse-only; broken parse = OKF §9 error)
  → for each concept: schema.ts + concept.ts apply the TIERED check:
       • OKF §9 conformance (parseable frontmatter, non-empty `type`)  → ERROR
       • per-type frontmatter shape + required sections (known types)  → ERROR
       • unknown type / extra keys                                     → WARNING
       • frontmatter quote-safety                                      → ERROR
  → aggregate findings → exit 6 if any ERROR tier fired, else 0
```

Validate is **structural and per-file**; it does not touch Backlog or the link
graph (that is `check`). See
[ADR-0007](../adr/0007-validation-and-coherence.md) and the
[OKF conformance notes](../reference/okf-conformance.md).

### 3.4 `lore sync` (writes)

```
cli → commands/sync
  → bundle.ts: loadBundle(docs/)
  → backlog.ts: probe() once (min --json version, fail-loud); cache in .lore/cache/
  → for each Story with tasks:
       backlog.ts.listTasks() → reconcile.rollUpStatus() → new `status`
       backlog.ts data        → managed-block.ts regenerates the <!-- lore:tasks --> table
  → concept.ts: serialize ONLY changed concepts (stable bytes; unchanged → untouched)
  → bundle.ts: regenerate root index.md, sub-indexes, log.md
  → state.ts: if any backlog write occurred, git add/commit backlog/
  → output: a diff summary {changed: [...], unchanged: N}
```

End-to-end idempotent: a clean tree produces **no diff** on a second run (§6).
`sync` writes docs; it commits only `backlog/` (lore is its sole committer),
leaving `docs/` changes staged-or-not per the user's workflow.

### 3.5 `lore check` (read-only — the CI gate)

```
cli → commands/check
  → bundle.ts: loadBundle(docs/)
  → backlog.ts: probe() + listTasks() (read-only)
  → run the SAME computation as sync (reconcile + managed-block) but DIFF, never write
  → links.ts: validateLinks() — internal links + heading anchors (hand-rolled over the shared mdast tree, pure JS)
       • internal-by-default; external liveness only with --external (no Rust/lychee runtime dep)
  → links.ts: portability lint (non-portable link syntax → WARNING)
  → aggregate: status drift, stale managed blocks, broken links, missing anchors, portability
  → exit 6 if any drift/error; 0 if clean
```

`check` is what CI runs. It never mutates the tree, so it is safe to run on a
read-only checkout. The drift gate and link/anchor rules are
[ADR-0007](../adr/0007-validation-and-coherence.md) and
[ADR-0008](../adr/0008-managed-block-remark-ast.md).

### 3.6 `lore link` / `lore unlink`

```
cli → commands/link  (story-id, task-id...)
  → concept.ts: add/remove task IDs in the Story's `tasks:` frontmatter   (doc → task)
  → backlog.ts: editTask(id, addLabels:["doc:<conceptId>"])               (task → doc)
       • label is the back-reference; Backlog DROPS unknown frontmatter keys, so NEVER store
         lore metadata on the task itself — only the queryable `doc:` label
  → state.ts: git add/commit backlog/  (the task-file label change)
  → output: {linked: [...], story, tasks}
```

`unlink` is the symmetric inverse (remove from frontmatter, `removeLabels`).
The label convention and reconciliation are
[ADR-0009](../adr/0009-story-task-coupling-reconciliation.md).

### 3.7 `lore query` / `lore context`

```
cli → commands/query  ("text" --type story --tag orders)
  → bundle.ts: loadBundle()
  → query.ts: BM25-style scoring over body + frontmatter; apply field filters
  → output: ranked hits with `summary`-based snippets, BOUNDED
       e.g. "showing 30 of 120 — narrow with --type story"

cli → commands/context  (concept-id --max-tokens 4000)
  → bundle.ts: loadBundle()
  → context.ts: depth-bounded graph walk from id within the token budget
       • full body of the target concept + one-line `summary` of each neighbor
       • deterministic order; NO ranking heuristics; reuses the bundle graph + links
  → output: the assembled context export + a labeled token estimate (chars/4)
```

Both are **pure reads** — no Backlog, no writes.
[ADR-0015](../adr/0015-lightweight-retrieval-no-vectors.md) governs the
no-vectors retrieval design.

### 3.8 `lore replace`

```
cli → commands/replace  (pattern, replacement, --in <glob> --regex --dry-run)
  → bundle.ts (or glob walk) to select target files
  → links.ts/managed-block.ts: compute the edit while SKIPPING lore-managed regions
       (never rewrite inside <!-- lore:tasks --> blocks or generated indexes)
  → --dry-run: emit the would-be diff, exit 0, write nothing
  → otherwise: apply edits via stable serialization
  → output: {files, replacements, skipped-managed-regions}
```

### 3.9 `lore rename` (graph-aware)

```
cli → commands/rename  (old-id, new-id)
  → bundle.ts: loadBundle() — need the whole graph to find every inbound edge
  → move docs/<old>.md → docs/<new>.md
  → links.ts.rewriteInbound(): rewrite EVERY inbound cross-link (relative, URL-encoded,
       .md-suffixed, no leading slash) AND every frontmatter ref pointing at <old>
  → concept.ts: stable-serialize each touched file
  → (no Backlog write unless a `doc:` label must be re-pointed)
  → output: {moved, rewrittenLinks: N, touchedFiles: [...]}
```

`lore supersede <old> <new>` is the sibling flow: it does not move the file but
rewrites inbound refs and sets `superseded_by` / `supersedes` / `status` on both
concepts. Both reuse the **same bundle graph** as the substrate
([ADR-0010](../adr/0010-multi-consumer-docs-layer.md)).

## 4. The error model and exit codes

Errors are values, not ad-hoc strings. Core throws a typed `LoreError`; the
command layer catches it and maps it to one exit code and one rendered form per
output mode. This keeps the **exit-code contract** identical across every
command and the deferred MCP transport. The contract is normative in the
[CLI contract](../reference/cli-contract.md) and
[ADR-0005](../adr/0005-cli-contract.md); the design implements it as follows.

### 4.1 The `LoreError` taxonomy → exit codes

```ts
// errors.ts
type ErrorType =
  | "usage"        // bad flags/args             → exit 2
  | "not_found"    // concept/task/path missing  → exit 3
  | "denied"       // permission / probe refusal → exit 4
  | "conflict"     // already-exists / clash     → exit 5
  | "validation"   // validate ERROR tier        → exit 6
  | "drift";       // check drift / broken link  → exit 6 (distinct error_type)

class LoreError extends Error {
  constructor(
    readonly type: ErrorType,
    message: string,
    readonly hint?: string,
    readonly input?: unknown,
  ) { super(message); }
}
```

| Exit | Meaning | Example |
|---|---|---|
| `0` | OK | command succeeded; or a clean `check` |
| `2` | usage | unknown flag, missing required argument |
| `3` | not-found | `lore context missing/id`; a referenced task absent |
| `4` | denied | Backlog `--json` probe fails the min-version requirement |
| `5` | conflict / exists | `lore new` target file already exists |
| `6` | validation or drift | `lore validate` ERROR tier; `lore check` drift |

There is exactly one success code (`0`) and a small, stable set of failure
codes. The mapping is centralized in `errors.ts` so no command invents its own.

### 4.2 The `--json` error envelope

In `--json` mode, an error is emitted on **stderr** as a single envelope, while
**stdout carries data only** (so a consumer can pipe stdout to a parser
unconditionally):

```json
{
  "error_type": "not_found",
  "message": "concept 'stories/ghost' not found",
  "hint": "run `lore query ghost` to find candidates",
  "input": { "id": "stories/ghost" }
}
```

In `--plain`/pretty mode the same `LoreError` renders as a one-line diagnostic
on stderr (`error: <message>` + an optional `hint:` line), honoring `NO_COLOR`.
The exit code is identical across modes.

## 5. The output-mode layer

`output.ts` is the single rendering seam. A command produces a typed result
object; `output.ts` renders it in exactly one of three modes, with the locked
precedence `--json > --plain > pretty`:

- **pretty** — color on a TTY; the default for humans.
- **`--plain`** — ANSI-free, stable text; **auto-selected when stdout is not a
  TTY** (so piped/redirected output is deterministic without a flag).
- **`--json`** — the additive-only versioned `{schemaVersion, kind, data}`
  envelope. `schemaVersion` bumps only on additive change; consumers tolerate
  unknown keys.

Rules the layer enforces:

- **stdout = data, stderr = diagnostics.** Progress notes, warnings, and errors
  go to stderr; only the result payload goes to stdout.
- **`NO_COLOR` is honored** in pretty mode (degrades to plain coloring).
- **Read-heavy output is bounded** with truncation hints (`showing 30 of 120 —
  narrow with --type story`), so an agent never drowns in output.
- A command implements rendering **once per result type**; it does not branch on
  mode internally. The envelope `kind` names the result type (`query`, `graph`,
  `check`, …) so a `--json` consumer can dispatch on it.

This layer, plus the error model (§4), is the entirety of the machine contract.
See [ADR-0005](../adr/0005-cli-contract.md).

## 6. Idempotency strategy

Idempotency is the property that makes lore safe inside agent loops and CI: a
write command run twice with no intervening change produces **no diff** on the
second run. It rests on three pillars.

### 6.1 Byte-stable serialization

`concept.serializeConcept` is deterministic at the byte level
([ADR-0011](../adr/0011-frontmatter-serialization-stability.md)):

- **Deterministic frontmatter key order** — a fixed canonical order for known
  keys, stable insertion order for passthrough keys.
- **Quote-safety** — values that need quoting (leading `@`, `:` sequences,
  booleans-as-strings) are quoted consistently and identically every run.
- **Dates as ISO strings** — never re-localized or re-formatted.
- **Stable list/scalar style** — YAML lists and block scalars render the same
  way each time; no incidental flow/block flips.
- **No write when unchanged** — a command compares freshly serialized bytes
  against the on-disk bytes and **skips the write** if they are identical, so
  mtimes and git status stay clean.

The same discipline applies to generated artifacts: `bundle.generateIndexes`
and `managed-block` regeneration produce byte-identical output when their inputs
are unchanged (the managed task table sorts tasks deterministically before
emitting). A round-trip — parse a concept, serialize it, parse again — must be a
fixpoint.

### 6.2 Managed regions are the only generated bytes inside hand-authored files

The `<!-- lore:tasks:begin -->…<!-- lore:tasks:end -->` block is the sole region
lore regenerates inside a Story; everything outside is the author's and is never
touched ([ADR-0008](../adr/0008-managed-block-remark-ast.md)). `replace` and
`rename` skip these regions so user refactors and lore regeneration never fight.
`lore new Story` scaffolds this region empty by default, so the first
`lore sync` after linking a task fills it in rather than erroring; a Story that
is missing the markers entirely (e.g. hand-deleted after creation) still fails
loud at exit 6 (ADR-0008 §2) — lore never guesses where to insert them.

### 6.3 Golden tests pin the bytes

Every serialization path has a **golden test** (§9.2): a fixture input and its
exact expected output bytes. A change to serialization that is not intended will
fail the golden, surfacing it in review. This is how idempotency stays true over
time, not just on the day it was written.

## 7. Git-native versioning

lore has **no separate version store** — no database, no `.lore/versions/`, no
sidecar history. History *is* git history of `docs/`, `backlog/`, and `.lore/`.
This is a direct consequence of "the repo is the source of truth."

- **Docs** are plain `.md` files; their versions are commits. lore does not
  commit `docs/` for you — you commit your own content edits.
- **`backlog/`** is the exception lore *does* own: it is the **sole committer**
  of `backlog/`. After any task write (via `backlog task create`/`edit`),
  `state.ts` runs `git add backlog/<changed>` + `git commit` itself, with
  Backlog's own `auto_commit=false`. This guarantees a single, predictable
  committer and avoids Backlog.md racing lore's commits — see
  [ADR-0012](../adr/0012-backlog-coexistence-git-ownership.md). `remote_operations`
  and `check_active_branches` are disabled; `backlog/.locks/` is gitignored.
- **`.lore/`** is committed state (config, schemas, templates) except `cache/`,
  which is transient and gitignored
  ([ADR-0013](../adr/0013-lore-state-directory.md)). The Backlog capability-probe
  result is cached here, never committed.
- **Supersession** (`lore supersede`) is recorded *in the documents themselves*
  (`superseded_by` / `supersedes` / `status`), not in a separate ledger — so the
  bundle stays self-describing even without lore installed.

The net effect: anyone can reconstruct any past state with `git checkout`, and
no lore-specific tooling is needed to read history.

## 8. Determinism and the injectable seams

The core is deterministic, so every input that would otherwise break that —
whether genuinely nondeterministic (the clock) or merely impure and awkward to
drive in a test (a subprocess, the git history) — is isolated behind an
injectable seam the tests can fake:

- **The clock.** Anything needing "now" (the `timestamp` in `lore new`) takes a
  `clock: () => Date` dependency. Tests inject a fixed clock so generated files
  are byte-stable.
- **The Backlog subprocess.** Commands receive a `BacklogAdapter` interface, not
  a hardcoded `Bun.spawn`. Unit and golden tests inject a fake adapter that
  returns canned `{schemaVersion, kind, data}` envelopes; e2e tests inject the
  real one driving the compiled fork.
- **The git history.** Deriving `log.md` from commit history (`core/log.ts`) takes
  a `GitAdapter` interface that returns commits over a **pinned range**, never a
  hardcoded `git` spawn. git is local, deterministic computation — not a network
  model (ADR-0014) — so over a pinned range it is reproducible and offline-safe;
  `generateLog` sorts folders and commits so output is order-independent and
  byte-stable. Tests inject a fake adapter with a fixed fake history. Because the
  result changes on every commit, `log.md` is materialized on `lore sync` and is
  excluded from `lore check`'s drift gate (ADR-0007).

No other source of nondeterminism is permitted in the core path: no `Math.random`,
no `Date.now()` outside the clock seam, no filesystem-order dependence (directory
walks are sorted), no network in `core/`.

## 9. Testing strategy

Four layers, each pinning a different property. Tests run under Bun's test
runner; the suite is the executable form of this design's constraints.

### 9.1 Unit tests — core in isolation

Every `core/` function is tested directly with structured inputs and outputs, no
filesystem or subprocess where avoidable:

- `schema.ts` — known types validate; unknown types pass type-only (OKF
  tolerance); extra keys warn; the emitted JSON Schema matches a snapshot.
- `concept.ts` — parse/serialize round-trips are fixpoints; quote-safety edge
  cases (leading `@`, `:`-bearing values, multiline) serialize stably.
- `reconcile.ts` — the status roll-up truth table (all-Done, any-In-Progress,
  any-task, no-task) is exhaustively covered with a fake task list.
- `links.ts` — link resolution, anchor checks, the portability lint, and
  inbound rewrite for `rename`/`supersede`.
- `query.ts` / `context.ts` — deterministic ranking/ordering and the token
  budget cutoff.

### 9.2 Golden tests — byte-exact serialization

The idempotency guarantee (§6) is enforced by golden fixtures: a known input
file and its exact expected output bytes for every write path —
`serializeConcept`, `generateIndexes`, managed-block regeneration, `replace`,
`rename`. The assertion is byte equality, and a second application over the
golden output must be a no-op. Goldens make any unintended serialization change
loud in review.

### 9.3 JSON-contract goldens vs the fork

Because the Backlog coupling is JSON-only
([ADR-0002](../adr/0002-backlog-integration-json-only.md)), the adapter is tested
against **captured real envelopes** from the compiled
[Backlog.md fork](../runbooks/backlog-json-patch.md). A small fixture set of
`backlog task list/view/search --json` outputs is checked in as goldens; the
adapter's parse + the capability probe are tested against them. When the fork
changes its `--json` shape, these goldens must be updated deliberately — the
test failure is the early-warning that the
[Backlog JSON schema](../reference/backlog-json-schema.md) contract moved.

### 9.4 End-to-end tests — against a fixture repo

A fixture repo (a real `docs/` bundle + a real `backlog/` driven by the compiled
fork) exercises whole commands through the CLI entrypoint:

- `init` → `new` → `link` → `sync` → `check` round-trips, asserting on exit codes
  and `--json` envelopes (not just stdout text).
- Idempotency at the command level: `sync` twice ⇒ clean `git status` the second
  time; `check` after a clean `sync` ⇒ exit `0`.
- The exit-code contract (§4): each failure mode produces its documented code.
- The output-mode layer (§5): `--json` on a non-TTY, `--plain` auto-selection,
  `NO_COLOR` honored, stdout-vs-stderr separation.

### 9.5 What is deliberately not tested here

Cross-renderer parity (GitHub vs Obsidian vs MkDocs vs Docusaurus) is the
consumers' job, not lore's — lore only *detects* non-portable syntax via the
portability lint and *scaffolds* consumer configs
([consumer compatibility](../reference/consumer-compatibility.md),
[ADR-0010](../adr/0010-multi-consumer-docs-layer.md)). The Confluence adapter is
deferred and out of scope for the current suite
([ADR-0016](../adr/0016-confluence-one-way-publish-deferred.md)).

## 10. Build order

This design is built in milestone order (see product spec
[§9](../../lore-spec.md) and the locked milestone plan):

| Milestone | Delivers |
|---|---|
| **BJP** | The [Backlog.md `--json` fork + PR](../runbooks/backlog-json-patch.md) — the dependency everything reads through |
| **M0** | Foundations: repo, Bun pin, build/distribution ([ADR-0001](../adr/0001-runtime-build-distribution.md)), `state.ts`, error/output layers (§4–§5) |
| **M1** | Core + scaffolding: `schema`/`concept`/`bundle`, `init`/`new`/`validate`, `scaffold` |
| **M2** | Backlog coupling: `backlog.ts`, `link`/`unlink`/`tasks`/`orphans`, `sync`/`check`, managed-block, reconcile |
| **M3** | Navigability/search/refactoring: index/log gen, `graph`, `query`, `context`, `replace`, `rename`, `supersede` |
| **M4** | Agent bridge: generated `SKILL.md`, CLAUDE.md nudge, `lore instructions` ([agent onboarding](../runbooks/agent-onboarding.md)) |
| **M5** | Browsable + graph consumers: MkDocs/Docusaurus/Obsidian scaffolds |
| **M6** | Freeze the LadybugDB contract; migrate CLI parsing/dispatch to Commander and build the projection in independent lanes; then integrate indexed graph/query/context and finish recovery, packaging, benchmark, and scale gates ([ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md)) |
| **M7** | Read-only offline-capable local graph explorer over the stable indexed projection |
| **M8** | Explicit multi-repository workspaces plus bounded path, impact, change, and provenance capabilities |
| **Hold** | Local MCP ([MCP tools](../reference/mcp-tools.md)), Confluence publishing/mirror, and importable-library work remain retained but unscheduled |

## See also

- [Product spec — `lore-spec.md`](../../lore-spec.md) — the narrative origin this design elaborates
- [System architecture](../reference/architecture.md) — the layered map this spec implements
- [Local graph platform roadmap](local-graph-platform-roadmap.md) — the active M6–M8 sequence and task gates
- [Tech stack](../reference/tech-stack.md) — Bun, the current hand-rolled/approved Commander CLI transition, the `js-yaml` frontmatter boundary, mdast parsing, and Zod
- [Dependency boundary audit](../reference/dependency-boundary-audit.md) — approved generic primitive delegation, compatibility gates, future investigations, and retained custom boundaries
- [CLI surface](../reference/cli-surface.md) and [CLI contract](../reference/cli-contract.md)
- [Backlog JSON schema](../reference/backlog-json-schema.md) and [Backlog CLI contract](../reference/backlog-cli-contract.md)
- [OKF conformance](../reference/okf-conformance.md) and [portable Markdown](../reference/portable-markdown.md)
- [MCP tools (deferred)](../reference/mcp-tools.md)
- [Backlog JSON patch runbook](../runbooks/backlog-json-patch.md) and [agent onboarding](../runbooks/agent-onboarding.md)
- [Architecture decision records](../adr/index.md)
- Bundle root: [docs index](../index.md)
