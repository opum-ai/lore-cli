# lore

> A thin, OKF-native documentation CLI that couples repo-resident docs to
> Backlog.md and serves them to coding agents and humans — CLI-first.

`lore` makes your repository's `docs/` tree a first-class, agent-readable
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
(OKF v0.1) bundle, couples that bundle to [Backlog.md](https://github.com/MrLesk/Backlog.md)
tasks, and exposes it through a deterministic, non-interactive CLI. The
repository is the single source of truth — the bundle is plain markdown with
YAML frontmatter that renders on GitHub, in Obsidian, and under
MkDocs/Docusaurus, with or without `lore` installed.

`lore` is **thin** and **zero-config** by design. It does not reimplement
Backlog.md, Confluence, or the documentation consumers it scaffolds for. Its
core is **deterministic with no LLM dependency** — every command is
reproducible, idempotent, and CI/agent-safe (non-interactive by default, stable
semantic exit codes, machine-readable `--json`).

- Built on **Bun + TypeScript** with **Commander.js**, matching Backlog.md's own
  stack.
- Distributed on npm as **`@salient-data/lore`** (bin `lore`) — run it with
  `npx`/`bunx`, no global install required.
- The agent bridge is a generated **`.claude/skills/lore/SKILL.md`** plus a tiny
  CLAUDE.md nudge and `lore instructions`. An **MCP server is secondary and
  deferred to v2**.

> **Status: pre-1.0, bootstrap.** This repo currently holds the spec, the OKF
> documentation bundle (`docs/`), and the Backlog.md milestones. The
> implementation is being built milestone by milestone (see
> [Roadmap](#roadmap)).

---

## The headline: lore reads Backlog.md via JSON

`lore` couples docs to tasks by reading Backlog.md's **JSON** output — not by
scraping text and not by importing Backlog.md internals or hand-editing its task
files. It parses a canonical `{schemaVersion, kind, data}` envelope from
`backlog task list --json`, `backlog task view --json`, and `backlog search
--json`. There is **no `--plain` text-parser fallback** — that is a deliberate
decision to keep the coupling robust.

The catch: stock Backlog.md v1.47.1 does **not** ship a `--json` flag. So `lore`
**forks** MrLesk/Backlog.md → `jeremy-newhouse/Backlog.md`, adds a minimal
`--json` to `task list`/`view`/`search`, consumes the fork as a locally-compiled
git dependency, and upstreams a minimal PR. A capability probe enforces a
minimum `--json`-capable version and **fails loud** on anything older.

See the runbook: [Backlog.md `--json` patch](docs/runbooks/backlog-json-patch.md).

Coexistence rules `lore` follows so it never fights Backlog.md:

- Writes go through `backlog task create` / `backlog task edit` — `lore` captures
  the new id from the `Created task <ID>` line and **never** writes
  `backlog/tasks/*.md` directly.
- Back-references live on the task as a queryable label `doc:<conceptId>`
  (Backlog drops unknown frontmatter on edit, so `lore` never stores its own
  metadata on tasks).
- Backlog runs with `auto_commit=false`; `lore` is the **sole committer** of
  `backlog/` (it does the `git add`/`commit` of task files itself), with
  `check_active_branches=false` and `remote_operations=false`.

Full details: [Backlog CLI contract](docs/reference/backlog-cli-contract.md) and
[Backlog JSON schema](docs/reference/backlog-json-schema.md).

---

## Install

`lore` is published as `@salient-data/lore` with the bin name `lore`. Run it
without installing:

```bash
# Node / npm
npx @salient-data/lore --help

# Bun
bunx @salient-data/lore --help
```

Or add it to a project:

```bash
bun add -d @salient-data/lore   # or: npm i -D @salient-data/lore
```

The npm package is a dual artifact: a Node `.cjs` launcher plus a per-platform
compiled binary delivered as `optionalDependencies` (built with
`bun build --compile`, `-baseline` x64 targets). You also need a
`--json`-capable Backlog.md on `PATH`; see the
[runbook](docs/runbooks/backlog-json-patch.md).

---

## Quickstart (CLI-first)

Every command is idempotent and emits stable exit codes. All of them are
non-interactive by default — the one exception is `lore init`, which runs a
guided wizard on a bare, interactive-terminal invocation (folding in the
Claude Code agent bridge, downstream doc-site scaffolds, and a backlog
capability check); it is strictly TTY-gated, so a non-TTY stdin or any of its
own flags runs it fully non-interactively too — see
[ADR-0017](docs/adr/0017-interactive-init-wizard-tty-gated.md). Output has
three modes with precedence `--json` > `--plain` > pretty:

- **pretty** — default; color on a TTY, honoring `NO_COLOR`.
- **`--plain`** — ANSI-free, stable text; the automatic mode when stdout is not
  a TTY (pipes, CI, agents).
- **`--json`** — a `{schemaVersion, kind, data}` envelope on stdout; errors go to
  stderr as `{error_type, message, hint, input}`.

```bash
# 1. Scaffold the OKF bundle (docs/, .lore/, root index.md). On a bare TTY
#    invocation this runs a guided wizard for the rest of onboarding too
#    (agent bridge, doc-site scaffolds, backlog check); off a TTY (CI, this
#    snippet) it's exactly this — the bundle only, non-interactively.
lore init

# 2. Create typed concepts from frontmatter templates.
lore new story "Bulk archive completed orders"
lore new spec  "Order archival" --story stories/bulk-archive-completed-orders
lore new adr   "Use soft deletes"

# 3. Couple a story to Backlog.md tasks (writes frontmatter + a doc:<id> label).
lore link stories/bulk-archive-completed-orders task-42 task-57

# 4. Reconcile status and rewrite the managed task block from live JSON.
lore sync

# 5. CI gate: report drift / broken links / portability issues (no writes).
lore check

# 6. Retrieve: full-text search and deterministic graph-context export.
lore query "archive retention" --type story
lore context stories/bulk-archive-completed-orders --max-tokens 4000
```

`--plain` is stable, line-oriented text — ideal for pipes and grep:

```bash
$ lore tasks stories/bulk-archive-completed-orders --plain
task-42  Bulk archive          Done
task-57  Archive UI            In Progress
```

`--json` is the additive-only machine contract:

```bash
$ lore check --json
{
  "schemaVersion": "1",
  "kind": "check.report",
  "data": {
    "ok": false,
    "drift": [
      { "concept": "stories/bulk-archive-completed-orders",
        "field": "status", "have": "todo", "want": "in-progress" }
    ],
    "brokenLinks": [],
    "portability": []
  }
}
```

```bash
$ lore validate --json && echo "conformant"   # exit 6 on validation/drift
```

Semantic exit codes (uniform across commands): `0` ok, `2` usage, `3`
not-found, `4` denied, `5` conflict/exists, `6` validation-or-drift. See the
[CLI contract](docs/reference/cli-contract.md) for the full output and exit-code
spec, and the [CLI surface](docs/reference/cli-surface.md) for every command and
flag.

### Refactoring and navigation

```bash
lore graph --format json|dot          # cross-link graph + token estimates
lore orphans                          # tasks with no owning doc; docs whose tasks vanished
lore replace "OldName" "NewName" --in 'reference/**' --dry-run
lore rename reference/orders reference/order-lines   # graph-aware: rewrites inbound links
lore supersede adr/0004-foo adr/0009-bar             # sets superseded_by/supersedes/status
```

`replace` skips `lore`-managed regions; `rename`/`supersede` use the bundle
graph to rewrite all inbound links and frontmatter refs.

---

## How Claude Code uses lore

`lore` is CLI-first for humans **and** agents. The agent bridge is generated,
not bespoke:

- `lore agents` emits `.claude/skills/lore/SKILL.md` — a skill that teaches
  Claude Code when and how to drive `lore` (always with `--json` for
  structured results).
- A tiny CLAUDE.md nudge points the agent at the skill; an AGENTS.md `@import`
  shim is deferred.
- `lore instructions` prints task-shaped guidance on demand for any agent or
  human.

An agent's typical loop: read `lore context <id> --json` to pull a concept plus
1-line neighbor summaries within a token budget, do the work, then run
`lore sync` and `lore check --json` to keep docs coherent — all deterministic,
all without an LLM in `lore`'s core.

See [Agent onboarding](docs/runbooks/agent-onboarding.md).

---

## One bundle, many consumers

`docs/` is a valid OKF v0.1 bundle on its own. To keep it portable across
renderers, every cross-link is **relative, URL-encoded, `.md`-suffixed, with no
leading slash and no wikilinks** — the only form that resolves identically on
**GitHub**, in **Obsidian** (graph + backlinks), under **MkDocs**, and under
**Docusaurus**. `lore`'s portability lint warns on non-portable syntax.

`lore scaffold` writes consumer configs **additively, outside `docs/`** so the
bundle stays clean:

```bash
lore scaffold mkdocs        # mkdocs.yml
lore scaffold docusaurus    # docusaurus.config + markdown.format:'detect'
lore scaffold obsidian      # .obsidian/ vault config
```

A **one-way Confluence publish** adapter (Cloud/ADF) is planned as an isolated
module with zero core dependency, but its **implementation is deferred**
(Server/DC is deferred-not-dropped). See
[Consumer compatibility](docs/reference/consumer-compatibility.md) and
[Portable Markdown](docs/reference/portable-markdown.md).

---

## Roadmap

Tracked as Backlog.md milestones, built in order:

| Milestone | Scope |
|---|---|
| **BJP** | Fork Backlog.md, add minimal `--json` to `task list`/`view`/`search`, consume the fork, upstream a PR |
| **M0** | Foundations: repo, runtime pin, build/distribution skeleton |
| **M1** | Core + scaffolding: `init`, `new`, `validate`, concept/frontmatter lib (gray-matter + Zod), bundle walk |
| **M2** | Backlog coupling: `link`, `sync`, `check`, managed block (remark), status reconciliation |
| **M3** | Navigability, search & refactoring: `graph`, `orphans`, `query`, `context`, `replace`, `rename`, `supersede` |
| **M4** | Agent bridge: generated `SKILL.md`, CLAUDE.md nudge, `lore instructions` |
| **M5** | Browsable + graph consumers: `lore scaffold` for MkDocs/Docusaurus/Obsidian |
| _M6 (deferred)_ | MCP server — same core functions over a deferred transport |
| _M7–M8 (deferred)_ | Confluence: one-way publish, then mirror |

---

## Documentation

The full design lives in this repo's OKF bundle under [`docs/`](docs/index.md):

- [Documentation index](docs/index.md) — the OKF root and reading hub.
- [Architecture](docs/reference/architecture.md) — the deterministic-core /
  thin-transport shape.
- [lore design spec](docs/specs/lore-design.md) — the end-to-end design.
- [CLI surface](docs/reference/cli-surface.md) and
  [CLI contract](docs/reference/cli-contract.md).
- [ADRs](docs/adr/index.md) — the significant, hard-to-reverse decisions.
- [MCP tools (deferred)](docs/reference/mcp-tools.md) — the v2 MCP design.

---

## Contributing

This is a private repo (`main` + `dev`; `dev` is the default branch). See
[CONTRIBUTING](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md), and
[SECURITY](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Jeremy Newhouse.
