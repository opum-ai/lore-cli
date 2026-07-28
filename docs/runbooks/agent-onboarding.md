---
# yaml-language-server: $schema=../../.lore/schemas/Runbook.schema.json
type: Runbook
title: "Agent onboarding: how a coding agent uses lore"
description: >-
  The canonical agent loop for working with lore — read the bundle index, follow
  a Story, check live task status with `lore tasks`, do the work, `lore sync`,
  then `lore check` as the CI gate. Covers how Claude Code learns lore (the
  generated SKILL.md, the tiny CLAUDE.md nudge, `lore instructions`, and the
  `lore help --json` capability manifest), the --json and exit-code contract
  agents depend on, and the guardrails (lore never auto-authors prose; the CLI
  is the primary surface).
tags: [runbook, agents, claude-code, onboarding, skill, cli, json, exit-codes, ci]
summary: >-
  The canonical, deterministic agent loop (index → Story → lore tasks → work →
  lore sync → lore check) plus how Claude Code discovers lore via SKILL.md, the
  CLAUDE.md nudge, lore instructions, and the --json/exit-code contract.
timestamp: 2026-06-21T00:00:00Z
---

# Agent onboarding: how a coding agent uses lore

This runbook is the operational source of truth for **how a coding agent
(primarily Claude Code) discovers and uses lore**. It defines the canonical
agent loop that the generated `.claude/skills/lore/SKILL.md` mirrors and that
`lore agents` and `lore instructions` teach on demand.

lore is **CLI-primary** for both humans and agents — there is no behavior
reachable only through a non-CLI surface, and the MCP server is a deferred v2
transport over the same core (see
[ADR-0004: CLI-first; SKILL.md bridge; MCP deferred](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)
and [MCP tools (deferred)](../reference/mcp-tools.md)). An agent therefore works
with lore exactly the way a CI pipeline or a shell script does: it **shells out**
and reads structured output. Everything an agent relies on — the output modes,
the `{schemaVersion, kind, data}` envelope, the semantic exit codes, the
`{error_type, message, hint, input}` error envelope, and the stdout/stderr
discipline — is the normative [CLI contract](../reference/cli-contract.md); the
command catalog those rules apply to is the [CLI surface](../reference/cli-surface.md).

lore's core is **deterministic and has no LLM dependency**
([ADR-0014: core has no LLM dependency](../adr/0014-core-has-no-llm-dependency.md)),
so an agent may treat lore as a **pure function of repo state**: the same inputs
against an unchanged bundle always produce the same output and the same exit
code. That determinism is what makes the loop below safe to run unattended.

---

## 0. Bootstrapping a brand-new repo

Everything below assumes a bundle already exists. Bringing lore into a repo
that has none is **one command**: `lore init`. On a real (interactive)
terminal it detects installed Claude Code and Codex executables, then offers each
available agent as an independent bridge choice. It also offers a downstream
doc-site scaffold (mkdocs/docusaurus), an Obsidian vault config, and a backlog
`--json`-capability check — replacing the older
`init` → `agents` → external `lore-setup.sh` → manual-Obsidian sequence
([ADR-0017](../adr/0017-interactive-init-wizard-tty-gated.md)).

```sh
lore init                                       # interactive wizard on a TTY
lore init --yes                                 # skip the wizard, bare scaffold only
lore init --claude --codex --scaffold mkdocs    # explicit agents, zero prompts
```

The wizard is **strictly TTY-gated** — this is the one place lore is
interactive at all, and it never compromises the rest of the CLI's
non-interactive contract (§3 below): whenever stdin or stderr is not a TTY
(CI, a pipe, this repo's own docker e2e harness), `--json` is passed, or any
flag is passed, `init` runs fully non-interactively with defaults and no
prompt can block it. Every wizard agent choice has a 1:1 flag equivalent (`--claude` and `--codex`; legacy
`--agents` remains an alias for `--claude`), so an agent scripting a fresh
repo never needs the wizard at all — pass the flags for the consumers you want
and `lore init` finishes with zero prompts, exactly as every other lore command
does. See [CLI surface: `init`](../reference/cli-surface.md#init) for the
full flag reference. Both bridges are idempotent: Lore refreshes only its managed block in
`CLAUDE.md` or `AGENTS.md`, while a differing whole-file skill is treated as a
hand edit and left protected.

---

## 1. The canonical agent loop

This is the loop. SKILL.md is generated to mirror it, `lore instructions`
explains each step on demand, and CI runs its final gate. Follow it in order.

```
docs/index.md          1. read the bundle entry point
   │
   ▼
a Story concept        2. follow a link to the Story you'll work on
   │
   ▼
lore tasks <story>     3. pull LIVE task status (drives backlog --json)
   │
   ▼
do the work            4. write code; edit docs OUTSIDE managed regions
   │
   ▼
lore sync              5. reconcile status + rewrite managed blocks + regen index
   │
   ▼
lore check             6. CI gate — exit 6 on drift/broken-link/anchor/portability
```

Starting from scratch instead of an existing Story? `lore new Story "<title>"`
scaffolds the doc — including an empty `<!-- lore:tasks:begin -->` /
`<!-- lore:tasks:end -->` managed block — so it drops straight into step 2 with
no hand-authored markup.

Each step in detail:

### Step 1 — Read `docs/index.md`

Start at the bundle's reserved OKF root index,
[docs/index.md](../index.md). It is the progressive-disclosure map of the whole
bundle: skim the sections (Architecture & design, References, ADRs, Runbooks),
then follow a link. The index is the only file carrying `okf_version`; treat it
as "table of contents," not "everything." Do **not** slurp the entire `docs/`
tree into context — let the index and cross-links route you to exactly the
concept you need.

For a single document covering the whole design, follow the index to the
[lore design spec](../specs/lore-design.md).

### Step 2 — Follow a Story

A `Story` concept is a unit of deliverable behavior and is the unit of work an
agent acts on. Its frontmatter `tasks:` list is **the source of the coupling**
to Backlog.md — those are the task IDs the Story owns (see
[ADR-0009: Story ↔ Task coupling & reconciliation](../adr/0009-story-task-coupling-reconciliation.md)).
Read the Story's narrative (Context, Acceptance criteria) for *what* and *why*;
get the *live* state from the next step rather than trusting any status text in
the body.

### Step 3 — `lore tasks <story>` (live status)

```sh
lore tasks stories/bulk-archive-orders --json
```

`lore tasks` returns the **live** task rollup for a Story by driving Backlog.md
through its `--json` flag (the JSON-only integration in
[ADR-0002](../adr/0002-backlog-integration-json-only.md), specified in the
[Backlog CLI contract](../reference/backlog-cli-contract.md) and
[Backlog JSON schema](../reference/backlog-json-schema.md)). The `--json`
payload carries `kind: "tasks.rollup"`; branch on it and read each task's id,
title, and status. This is your authoritative view of what is To Do / In
Progress / Done — never re-derive task state from the Story markdown, which is
only refreshed when `lore sync` runs.

Use this status to decide what to do next: pick an open task, or, if you need a
new one, create it through Backlog.md (`backlog task create …`) and then couple
it to the Story with `lore link` so the frontmatter `tasks:` list and the task's
`doc:<conceptId>` label both reflect the relationship. lore is the **sole
committer** of `backlog/`; let lore commit task-file changes rather than staging
them yourself (see
[ADR-0012: Backlog coexistence & git ownership](../adr/0012-backlog-coexistence-git-ownership.md)).

### Step 4 — Do the work

Implement the behavior. When you touch docs:

- **Author prose only OUTSIDE lore-managed regions.** The block between
  `<!-- lore:tasks:begin -->` and `<!-- lore:tasks:end -->` is regenerated by
  lore; hand edits inside it are overwritten on the next `lore sync`, and a write
  that targets a managed region is **refused** with exit `4` (denied). Everything
  outside the markers is yours.
- **Use the right tool for refactors.** Find-and-replace across docs goes through
  `lore replace` (it skips managed regions); renaming or superseding a concept
  goes through `lore rename` / `lore supersede` so all inbound links and
  frontmatter refs are rewritten via the bundle graph. Do not hand-edit links
  that lore can rewrite for you.
- **Keep links portable.** Cross-links must be relative, URL-encoded,
  `.md`-suffixed, with no leading slash and no wikilinks (see
  [Portable Markdown](../reference/portable-markdown.md)). `lore check`'s
  portability lint will warn on non-portable syntax.

### Step 5 — `lore sync`

```sh
lore sync --json
```

`lore sync` is the **write** step that makes the bundle coherent: it recomputes
each Story's `status` from its tasks (the reconciliation rules in
[ADR-0009](../adr/0009-story-task-coupling-reconciliation.md)), rewrites the
`<!-- lore:tasks -->` managed blocks from live Backlog data — including filling
in, for the first time, the empty block `lore new Story` scaffolds by default —
and regenerates the index/log. It is **idempotent**: with no upstream change it produces
byte-identical output, so running it in a loop yields clean, empty diffs. The
`--json` payload is `kind: "sync.summary"` and reports exactly what changed
(status rewrites, managed-block diffs, regenerated files).

### Step 6 — `lore check` (the CI gate)

```sh
lore check          # plain auto-selected when non-TTY (e.g. in CI)
```

`lore check` is **read-only** and is the gate. It reports drift (a Story whose
written status no longer matches its tasks, or a stale managed block), broken
internal links, missing heading anchors, and portability-lint findings, and it
surfaces per-doc/bundle token **estimates**. On any failing condition it exits
**`6`** (`error_type` `drift`); the fix is to run `lore sync` and commit. Because
`check` writes nothing, it is safe to run in CI on every merge — and because the
core is deterministic, a green `check` locally means a green `check` in CI.

A typical agent or CI branch:

```sh
if lore check --plain; then
  echo "docs coherent"
else
  case $? in
    6) lore sync && echo "synced — re-run check and commit" >&2 ;;
    3) echo "a referenced id/link target is missing" >&2 ;;
    *) echo "lore failed unexpectedly — report this" >&2 ;;
  esac
fi
```

---

## 2. How Claude Code learns lore

An agent does not need lore documentation resident in its context. lore exposes
itself through **four lazily-loaded surfaces**, each costing near-zero idle
tokens until needed. The rationale and the rejection of an always-on MCP server
(its ~15k–20k idle-token-per-turn tax) are in
[ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md).

### 2.1 The generated `.claude/skills/lore/SKILL.md`

The **primary bridge**. lore generates a Skill at
`.claude/skills/lore/SKILL.md` that teaches the agent which `lore` commands
exist, when to use each, the `--json` contract, and the semantic exit codes. It
mirrors the canonical loop in §1. Two properties matter:

- **It is generated, not hand-maintained**, from the command definitions, so it
  stays in lockstep with the [CLI surface](../reference/cli-surface.md). `lore
  check` gates SKILL.md drift, so a stale bridge is caught rather than silently
  shipped.
- **It is loaded lazily and progressively** — costing roughly tens of idle
  tokens, not the per-turn schema injection an MCP server would impose.

Regenerate it whenever the CLI surface changes (and let `lore check` flag it if
you forget).

### 2.2 The tiny CLAUDE.md nudge

A **deliberately small** addition to the project's `CLAUDE.md` points the agent
at the lore skill and at `lore instructions`. It carries no substantive guidance
itself — that would pay an always-loaded token cost on every turn for content
most turns don't need. Its only job is discoverability: "lore exists, here is the
skill, here is where to pull just-in-time detail." AGENTS.md fan-out via a
CLAUDE.md `@import` shim is **deferred** to a later milestone so a single source
of agent guidance can later serve other agent runtimes without drift-prone
duplicate files.

### 2.3 `lore instructions`

```sh
lore instructions                 # overview
lore instructions <topic>         # task-scoped guidance on demand
```

`lore instructions` prints task-scoped guidance on demand, mirroring the
Backlog.md `backlog instructions <topic>` pattern that this very project uses.
This is the **just-in-time** channel: instead of carrying full lore guidance
resident, an agent pulls exactly the topic it needs (e.g. the sync/check loop,
linking tasks, the managed-block rules) for the current step.

### 2.4 `lore help --json` — the capability manifest

```sh
lore help --json
```

For programmatic discovery, `lore help --json` returns a machine-readable
**capability manifest**: the commands available in *this* installed version,
their flags, and their `kind`/exit-code mappings, all inside the canonical
`{schemaVersion, kind, data}` envelope. An agent (or a generator) can read this
to discover the surface without scraping human-formatted `--help` text, and to
confirm a command exists before invoking it. Combined with the version/capability
probe lore runs against Backlog.md (it fails loud below the minimum `--json`
version; see [Backlog CLI contract](../reference/backlog-cli-contract.md)), an
agent can verify its whole toolchain is capable before starting work.

---

## 3. The contract agents rely on

Agents do not parse pretty output. They use the two machine channels defined in
the [CLI contract](../reference/cli-contract.md). Internalize these four rules:

### 3.1 Always pass `--json` (or rely on `--plain` auto-selection)

Output mode precedence is `--json > --plain > pretty`. Pass `--json` to get the
canonical success envelope:

```json
{ "schemaVersion": 1, "kind": "tasks.rollup", "data": { } }
```

Branch on `kind`, read `data`, and **tolerate unknown `kind` values and unknown
fields** — the envelope is additive-only and new kinds/fields can appear under
the same `schemaVersion` (the OKF "tolerate the unknown" stance, see
[OKF conformance](../reference/okf-conformance.md)). When stdout is not a TTY
(CI, captured pipes), lore auto-selects `--plain` even without the flag, so a
captured call is never accidentally colorized.

### 3.2 stdout = data, stderr = diagnostics

This separation is absolute: **stdout parses or stays silent.** On success the
`--json` envelope is the *only* thing on stdout; on failure stdout is **empty**
and the error goes to stderr. So `lore … --json | jq` and `lore … > out.json`
are always safe. Never read diagnostics or progress from stdout. This holds
uniformly even for a multi-item command like `link`/`unlink`: a partial
per-task back-reference failure still exits `6` with empty stdout, and the
per-task detail moves into the error envelope's `input` on stderr instead.

### 3.3 Branch on the semantic exit code

| Code | Name | Agent action |
|---|---|---|
| `0` | success | proceed |
| `2` | usage | fix the command/flags/args, retry |
| `3` | not_found | a concept/task/link target is missing — create or correct it |
| `4` | denied | you targeted a managed region or a guarded op — back off |
| `5` | conflict | id collision / already-exists / write-race — reconcile, then retry |
| `6` | `validation` / `drift` | run `lore sync` (drift) or fix the flagged non-conformance (validation), then re-run the gate |

Exit **`1` is reserved for an uncaught bug** — treat it as *report this*, not
*handle this*. The exit code carries the same meaning in every mode, so
shell/CI branching needs no JSON parsing.

### 3.4 Self-correct from the `--json` error envelope

On a `--json` failure, stderr carries:

```json
{
  "error_type": "denied",
  "message": "Refusing to edit a lore-managed region in stories/bulk-archive-orders.",
  "hint": "Edit outside the <!-- lore:tasks --> markers, or run `lore sync` to regenerate it.",
  "input": { "id": "stories/bulk-archive-orders" }
}
```

The `hint` is written so an agent can usually self-correct **in one turn**, and
`input` echoes the offending input so you can diagnose without re-deriving it.
The error object is **not** wrapped in the success envelope, so it is never
confused for data.

---

## 4. Guardrails

These are hard boundaries. They keep agent loops safe, deterministic, and
non-destructive.

- **lore never auto-authors prose.** The core has no LLM
  ([ADR-0014](../adr/0014-core-has-no-llm-dependency.md)). lore scaffolds
  structure (frontmatter, headings, managed blocks, index/log) and *rewrites
  managed regions and links*, but it never invents narrative content. Writing the
  Context, Acceptance criteria, and design prose is the **agent's** job (or a
  human's); lore only keeps the mechanical parts coherent. Do not expect `lore
  new` or `lore sync` to fill in meaning.

- **CLI is primary; do not reach around it.** Drive Backlog.md only through its
  CLI/`--json` boundary, never by importing internals or hand-editing
  `backlog/tasks/*.md` (Backlog drops unknown frontmatter on edit, so lore
  metadata never lives on tasks — see
  [ADR-0002](../adr/0002-backlog-integration-json-only.md) and
  [ADR-0012](../adr/0012-backlog-coexistence-git-ownership.md)). There is no
  hidden non-CLI surface to use; the deferred MCP server, when it lands, will
  drive the same core functions ([MCP tools](../reference/mcp-tools.md)).

- **Respect managed regions.** Never write inside `<!-- lore:tasks:begin -->` …
  `<!-- lore:tasks:end -->`; those edits are overwritten and a targeted write is
  denied (exit `4`). Use `lore sync` to refresh them.

- **Let lore own `backlog/` commits.** lore is the sole committer of the
  `backlog/` tree; don't `git add`/commit task files yourself
  ([ADR-0012](../adr/0012-backlog-coexistence-git-ownership.md)).

- **Treat `lore check` as the gate.** Don't consider work done until `lore check`
  exits `0`. If it exits `6`, run `lore sync`, commit the result, and re-run.
  Because lore is deterministic, a clean local `check` is a clean CI `check`.

- **Keep output bounded.** Read-heavy commands cap output and tell you so via
  `total`/`shown`/`truncated`/`hint` (or a "showing N of M" line). Honor the
  hint (e.g. `--type story`, raise `--limit`, or use `lore context <id>
  --max-tokens`) instead of trying to widen output past your context budget.

---

## 5. Quick reference

| You want to… | Command | Notes |
|---|---|---|
| Find the entry point | read [docs/index.md](../index.md) | OKF root index; don't slurp the tree |
| See a Story's live tasks | `lore tasks <story> --json` | `kind: tasks.rollup`; drives Backlog `--json` |
| Couple a task to a Story | `lore link <story> <task-id>` | sets frontmatter + `doc:` label; lore commits |
| Make the bundle coherent | `lore sync --json` | recompute status, rewrite managed blocks, regen index |
| Gate the bundle | `lore check` | read-only; exit `6` on drift/broken-link/anchor/portability |
| Pull guidance on demand | `lore instructions [<topic>]` | just-in-time, mirrors `backlog instructions` |
| Discover the surface | `lore help --json` | capability manifest in the canonical envelope |
| Refactor across docs | `lore replace` / `lore rename` / `lore supersede` | graph-aware; skips managed regions |
| Get bounded context for an id | `lore context <id> --max-tokens N` | body + 1-line neighbor summaries |

---

## Related

- [CLI contract](../reference/cli-contract.md) — the normative `--json`,
  exit-code, error-envelope, and stream-discipline rules this loop relies on.
- [CLI surface](../reference/cli-surface.md) — every command, its flags, and per-command `kind`/exit mappings.
- [ADR-0004: CLI-first; SKILL.md bridge; MCP deferred](../adr/0004-cli-first-skill-bridge-mcp-deferred.md) — why the bridge is a skill, not a server.
- [ADR-0014: core has no LLM dependency](../adr/0014-core-has-no-llm-dependency.md) — why lore never auto-authors prose.
- [ADR-0009: Story ↔ Task coupling & reconciliation](../adr/0009-story-task-coupling-reconciliation.md) — the `tasks:` coupling and status rules behind `lore tasks`/`sync`.
- [ADR-0012: Backlog coexistence & git ownership](../adr/0012-backlog-coexistence-git-ownership.md) — lore as the sole committer of `backlog/`.
- [Backlog CLI contract](../reference/backlog-cli-contract.md) — the inbound Backlog.md `--json` contract `lore tasks` drives.
- [MCP tools (deferred)](../reference/mcp-tools.md) — the v2 transport that will re-expose these same core functions.
- [lore design](../specs/lore-design.md) — the overall design this loop serves.
