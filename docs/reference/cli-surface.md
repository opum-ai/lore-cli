---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: "CLI surface: the complete lore command catalog"
description: >-
  The authoritative catalog of every lore subcommand — purpose, arguments,
  key flags, output kind, and exit codes — for the CLI that is lore's primary
  interface for humans, Claude Code, Codex, and CI. Covers init, new, validate,
  check, sync, link/unlink, tasks, orphans, graph, path, impact, explorer, query, context, replace,
  rename, supersede, scaffold, schema, types, agents, instructions, help, and the
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
Code and Codex through generated agent bridges, and for CI gates. (The MCP server is
[secondary and deferred to v2](./mcp-tools.md); when it ships it will wrap the
same `core/` functions these commands call.) This page is the command catalog:
what each subcommand does, its arguments and key flags, the shape of its
output, and the exit codes it can return.

This page describes **what each command does**. The cross-cutting rules that
govern **how every command behaves** — the three output modes, the six
semantic exit codes, the stdout/stderr discipline, the `--json` envelope and
error envelope, truncation hints, and the `kind` taxonomy — are specified once
in the [CLI contract](./cli-contract.md) and are not repeated per command here.

The implementation parses this surface with exact-pinned Commander, using the
capability manifest as its declarative command/flag source and a data-driven
handler registry for dispatch. Lore—not Commander—still owns help rendering,
injected streams, JSON/error envelopes, semantic exit codes, TTY/`NO_COLOR`
behavior, and process lifecycle. The parser library does not change the public
surface recorded here.

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
  conflict/exists · `6` validation-or-drift · `7` indeterminate (a gate
  cannot judge from here; ADR-0005's 2026-09-22 amendment). Code `1` is reserved for
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
with a root `index.md` (the only file carrying `okf_version`), and create the
`.lore/` [state directory](../adr/0013-lore-state-directory.md) (`config.toml`,
`profile.toml`, `.gitignore`, `templates/`, exported JSON `schemas/`). Runs
**idempotently**: every file is created only when absent (an atomic write, so
there is no clobber of a user's edits), so a re-run with no intervening change
creates nothing and still exits `0` with everything reported `skipped`; a run
after a partial delete fills in only the missing pieces.

**On a bare, interactive-terminal invocation, `init` also runs a guided
wizard** that folds the rest of onboarding into this one command — a tracker
backend choice (`quest`, `backlog`, or `jira`), independently detected Claude
Code and Codex agent bridges, a downstream doc-site scaffold (mkdocs/docusaurus), an
Obsidian vault config, and a backlog `--json`-capability check — instead of
the older `init` → `agents` → external `lore-setup.sh` → manual-Obsidian
sequence ([ADR-0017](../adr/0017-interactive-init-wizard-tty-gated.md)).

The wizard is **strictly TTY-gated**: it runs only when **both stdin and
stderr** are interactive terminals (every wizard question is written to
stderr, so a redirected stderr alone is enough to veto it — e.g.
`lore init >out 2>/dev/null`, or the shell idiom `cmd >/dev/null 2>&1`),
`--json` was not requested, *and* none of `init`'s own flags was passed.
Whenever stdin or stderr is **not** a TTY (CI, pipes, a subprocess), `--json`
is given, or **any** flag below is given, `init` runs fully
non-interactively with defaults and no prompt can ever block it — the
npm-init pattern. `--allow-no-git` is the single exception: it waives the git
preflight rather than answering a wizard question, so it suppresses only its
own prompt and leaves the wizard reachable. Every wizard question has a 1:1 flag equivalent, so a
script can reach every option the wizard offers with zero prompts — but
`--yes`/`--non-interactive` is npm's `-y` ("skip the wizard, run the bare
default"), **not** "answer every question with its own default"; the two
diverge on the agent-bridge question in particular (its wizard default is
yes, but `--yes` installs nothing). A bare `lore init` off a TTY with no
flags remains prompt-free (scaffold only, nothing else), but a newly created
bundle now persists `backend = "quest"` under `[tracker]` so its selection is
stable. Existing bundles that omit the tracker setting and contain a real
Backlog.md **project** — a real `backlog/` directory holding a real
`backlog/config.yml`, the file `backlog init` writes — are classified as legacy
Backlog. A directory named `backlog/` without that marker is not a project and
decides nothing. Their first tracker
command fails loud with the exact choices `quest init` followed by `lore init
--tracker quest --migrate-backlog`, or `lore init --tracker backlog`; Lore does
not silently select or dual-write either backend. Migration preflights every
source task and alias conflict through Quest's public preview, records the
reviewed digest before apply, and persists Quest only after the matching public
receipt reaches `applied`. Quest keeps its canonical `T-<positive integer>` IDs
while returning legacy Backlog IDs as stable aliases, so existing Story task
references continue to resolve without a rewrite.
The Lore command path targets Quest's actor-enforcing QCLI-97.8 contract, but
the installed 0.2.2 candidate had not passed that executable gate as of
2026-08-17; delivery remains blocked until actor-free migration writes are
denied and the actorful lifecycle passes against the installed native artifact.
An explicit wizard or `--tracker` choice also writes `backend` under
`[tracker]` in `.lore/config.toml`.

**The wizard shows what it found before it asks.** Before the tracker
question, `init` reports one line per backend on stderr: whether `quest`,
`backlog`, and `jira` are on PATH, and whether this repository is already
initialized for each (`.quest/workspace.toml`, `backlog/config.yml`; jira's
readiness is credential-based and is checked only when selected). Choosing a
backend whose binary is missing offers to run its `npm install -g` command;
declining offers one switch to a different backend, and declining that too exits
with the exact install command. The return to the tracker question is bounded at
two passes, so no answer can make it loop. `--install-tracker` and
`--no-install-tracker` are the prompt-free equivalents; nothing is ever installed
without one of them or an explicit confirmation.

**The tracker question is always asked, and migration follows it.** A Backlog
project in the repository never removes a choice: `quest`, `backlog`, `jira`,
and `none` are all offered regardless. Only once the answer settles on `quest`,
and only when a real Backlog project exists, does `init` ask what should happen
to the existing tasks — migrate them, keep them where they are, or use Backlog
as the tracker after all. `--migrate-backlog` and `--keep-backlog-tasks` are
the prompt-free equivalents, and a scripted `--tracker quest` over a real
Backlog project fails without one of them rather than orphaning the tasks in
silence. That gate reads the project, not the configuration: a bundle with
`backend = "backlog"` already written reaches Quest through exactly the same
two flags as a zero-config one.

**An id collision offers a way out inside the same run.** Quest refuses a
migration whose ids clash, with one `conflict` (exit `5`) message that names two
possible causes — positional renumbering (a dotted subtask flattening and
shifting a later allocation, which `--preserve-source-ids --source-family
<PREFIX>` avoids) and an id already claimed by an unrelated record in the
destination workspace (which no flag resolves). The message does not say which
one occurred, so the wizard does not guess: it prints Quest's refusal, offers to
retry keeping each record's own Backlog id, and asks which id family to import,
pre-filled from the id Quest quoted. The retry is decided by Quest's own
preservation-mode preview, which writes nothing — it either produces a plan and
the migration completes in the same run, or it refuses again, and `init` reports
that the collision needs manual resolution (rename or remove the conflicting
record) instead of offering a second retry that cannot work. Declining the offer
re-raises Quest's own refusal unchanged. Both outcomes leave `[tracker]`
unwritten unless a migration actually applied. The prompt-free equivalents are
`--preserve-source-ids` and `--source-family <PREFIX>`, which must be passed
together and only with `--migrate-backlog`.

**A completed migration then asks what happens to `backlog/`, and says plainly
that removal deletes it.** Once the tasks are in Quest the old directory is
still on disk, so the wizard offers to remove it — in those words. Accepting
writes a verified ZIP of every file to `.lore/archive/` and then **deletes**
`backlog/` from the working tree. That archive is repository-local and
gitignored (the directory carries its own `.gitignore`), never committed and
never published, so it is a convenience copy rather than the safety net: **git
is**, and until the deletion is committed `git checkout -- backlog/` restores
every file. For that reason the question is only asked when git can prove the
recovery — `backlog/` must be tracked and clean. An untracked or modified
`backlog/`, or a directory git cannot answer about at all, is reported and left
alone rather than offered.

The prompt-free equivalents are `--remove-backlog` and `--no-remove-backlog`,
both valid only with `--migrate-backlog` and never with `--adopt-manifest`
(whose coordinated cutover already archives and deletes `backlog/` as a verified
phase of its own). A scripted run that passes neither keeps `backlog/` — the
unchanged default — and says so on stderr naming both flags, so the outcome is
never silent. `--remove-backlog` over a `backlog/` git cannot prove recoverable
is refused with `denied` (exit `4`); the migration itself still stands, because
the refusal is of the deletion, not of the selection.

**Choosing `jira` configures it in the same run.** A jira selection is useless
without a `[tracker.jira]` table — `createTrackerAdapter` refuses the backend
without one — so `init` resolves that table before it persists the selection.
It reads jira-cli's own credential profiles (`jira config list-profiles`),
offers them with jira-cli's default pre-selected, takes the Jira project key,
and validates it live with `jira project get <KEY> --profile <name>`. A key that
does not resolve fails the run carrying jira-cli's own sentence, and nothing is
written. The persisted table records `profile`, `project`, `issue_type` (read
from the validated project's own issue types), `default_labels`, and
`status_flow`; no credential ever reaches `.lore/config.toml`. With no profiles
at all the run exits telling the operator to run `jira init` themselves — that
command is interactive and handles credentials, so Lore never runs it.
`--jira-profile <name>` and `--jira-project <KEY>` are the prompt-free
equivalents and are rejected without `--tracker jira`.

**The git preflight runs before anything is written.** `init` requires a git
worktree: `lore sync` shells `git rev-parse HEAD` and fails outright without a
repository, and `quest init` refuses a non-worktree path. On a TTY the wizard's
first question offers to run `git init`; off a TTY, or when that question is
declined, the run fails with a `validation` error (exit `6`) and the directory
is left byte-for-byte unchanged. `--allow-no-git` waives the requirement for a
docs-only bundle that only `lore check` will serve.

Hitting EOF (Ctrl-D) mid-wizard is a `usage` error (exit `2`) with a rendered
diagnostic, never a silent success — see
[ADR-0017](../adr/0017-interactive-init-wizard-tty-gated.md).

**Partial application on an interrupted run.** Every check now precedes the
first write, so a declined git prompt, a rejected flag combination, an EOF
mid-wizard, and a bundle path already blocked by a symlink or a wrong-shaped
entry all leave the directory untouched — `.git` included, since an accepted git
prompt is recorded and executed alongside the scaffold rather than immediately. Past that point the agent bridge
(when requested) is still applied before scaffold targets are pre-flighted, so
a scaffold conflict can leave the bridge already written to disk while the run
exits non-zero. This is safe: every step `init` performs is independently
idempotent, so re-running `lore init` (via the wizard or the same flags)
picks up exactly where the interrupted run left off — it detects and skips
whatever already succeeded rather than erroring or duplicating anything.

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--yes` / `--non-interactive` (skip the wizard even on a TTY) · `--tracker <quest\|backlog\|jira>` (persist the tracker choice without prompting) · `--migrate-backlog` (valid only with `--tracker quest` over a real Backlog.md project) · `--keep-backlog-tasks` (select Quest and deliberately leave an existing Backlog project in place) · `--remove-backlog` / `--no-remove-backlog` (after a successful `--migrate-backlog`: delete `backlog/` from the working tree behind a verified gitignored archive, or keep it explicitly — neither is valid without `--migrate-backlog`, and neither may be combined with `--adopt-manifest`) · `--claude` (Claude Code bridge; `--agents` alias) · `--codex` (Codex bridge: `AGENTS.md` + `.codex/skills/lore/`) · `--scaffold <target>` (repeatable; `mkdocs`\|`docusaurus`\|`obsidian`) · `--obsidian` (shorthand for `--scaffold obsidian`) · `--check-tracker` / `--no-tracker` (force/skip the selected tracker's capability check; `--check-backlog` / `--no-backlog` are aliases) · `--allow-no-git` (scaffold a docs-only bundle outside a git worktree) · `--install-tracker` / `--no-install-tracker` (install, or never install, a missing tracker binary) · `--jira-profile <name>` / `--jira-project <KEY>` (answer the jira configuration questions without prompting; both require `--tracker jira`) · `--skill-source <repo\|plugin>` (persist `[agents].skill_source`; `plugin` opts into the `opum-lore` marketplace plugin owning `.claude/skills/lore/SKILL.md` instead of this repository — see `agents` below) |
| **Output** | `kind: init` — created/skipped scaffold paths, plus `interactive`/`scaffolds` always present (`false`/`[]` on the default path); `tracker` is present after a wizard or explicit `--tracker` choice; `migration` reports the applied digest, source fingerprint, mappings, survivors, `excluded`, and task fingerprints after a successful Backlog-to-Quest migration — `survivors` is receipt idempotency bookkeeping (the target ids this apply resulted in, whether written this run or already present from an earlier resumed one), not "left behind"; `excluded` is the field that actually means that (LCLI-521): the `{sourceIdentifier, family}` records `--preserve-source-ids` did not import because they belong to a different id family than the one selected for this run (Quest imports one family per run), always present and empty (`[]`) outside preservation mode; `backlogRemoval` answers what then happened to `backlog/` on a plain `--migrate-backlog` run — `removed`, plus `zipRel`/`entryCount` when it was deleted, or `reason` when it was kept; `agents` (Claude), `codex`, and `trackerCheck` are present only when those steps ran; `trackerCheck` names whichever backend was probed and is the only capability field (the deprecated `backlog` field, which could only ever describe a Backlog bundle, was removed in 0.5.0 — LCLI-359); `trackerEnvironment` reports what each backend's CLI and this repository looked like, and `installed` names a package this run installed; `plugins` is present only when a Claude or Codex bridge was selected (flag or wizard), keyed by runtime (`plugins.claude`, `plugins.codex`), each the `opum-lore` marketplace plugin state `{runtime, id, state, version?, scope?, reason?, remedy?}` read before any bridge file is written — see `agents` below for the four states, and note `init` only reports it: it never installs, enables or updates the plugin, and the state never changes the exit code (LCLI-592) |
| **Exit** | `0` ok (the tracker check is advisory-only and never changes this) · `2` usage (bad flag/unknown `--scaffold` target, an invalid migration-flag combination, a missing `--tracker`/`--skill-source` value, a jira flag without `--tracker jira`, a non-interactive `--tracker jira` missing `--jira-profile`/`--jira-project`, or the wizard's stdin closed before finishing) · `3` not found (jira-cli has no credential profiles, the `jira` binary is missing, or the Jira project key does not resolve) · `4` permission denied, `--remove-backlog` refused because git cannot prove `backlog/` is recoverable (untracked, modified, or unanswerable), or the wizard's collision retry declined to import one family and leave another behind once it saw what `--preserve-source-ids` would exclude (LCLI-521; the non-interactive flag path never refuses this — it warns on stderr and proceeds, since prompting is impossible there) · `5` a non-regular entry (directory/symlink) blocks a scaffold path, or a scaffold target collides with a differing hand-edited file · `6` malformed configuration, unknown tracker backend or skill source, a `--jira-profile` jira-cli does not know, a `--tracker quest` selection over a real Backlog project with neither `--migrate-backlog` nor `--keep-backlog-tasks`, lossless-migration preflight failure, a `--migrate-backlog` run against Quest with no actor declared (see `lore instructions linking`), or the directory is not a git worktree and `--allow-no-git` was not passed |

### `new`

Scaffold a new typed concept file with valid OKF frontmatter and the per-type
required sections. The body is rendered from `.lore/templates/<type>.md` (a
template with `{{placeholders}}`) when present, else a built-in default for the
type. Writes the file at the conventional path for its type and prints the new
concept id.

```
lore new <type> "<title>" [flags]
lore new story "Bulk archive completed orders"
lore new spec  "Order archival"
lore new adr   "Use soft deletes" --tags retention,orders
lore new reference "Orders table" --template reference --var owner=payments
```

`<type>` is one of the story-convention types (`Reference`, `Spec`, `ADR`,
`Runbook`, `Epic`, `Story`) or any user-defined type — unknown types are
accepted (OKF tolerance) and scaffolded with the lenient `type`-only shape,
**unless** the active profile sets `[profile] strict_types = true`
(`.lore/profile.toml`, LCLI-538), in which case an unrecognized `<type>` is
refused outright — see [ADR-0007's amendment](../adr/0007-validation-and-coherence.md).

| | |
|---|---|
| **Args** | `<type>` `"<title>"` |
| **Key flags** | `--tags a,b` · `--template <name>` (file under `.lore/templates/`) · `--var k=v` (repeatable; fills `{{k}}`) · `--summary "<sentence>"` |
| **Output** | `kind: new.result` — `{ id, path, type }` |
| **Exit** | `0` ok · `2` bad type/var syntax · `5` target path already exists · `6` template missing required `{{var}}`, or an unrecognized `<type>` under `strict_types` |

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

- **OKF 0.2 §11 / 0.1 §9 conformance floor** — frontmatter parses and `type` is present/non-empty
  → **error** if violated.
- **Per-type frontmatter shape + required sections** — for known types,
  validated against the strict [Zod schema](../adr/0006-schema-types-templates.md)
  (the single source of truth) → **error** if violated.
- **Unknown type / extra keys** — accepted but → **warning** (OKF tolerance;
  custom frontmatter passes through untouched) — **unless** the active profile
  sets `[profile] strict_types = true`, in which case an unknown `type`
  specifically → **error**, independent of `--strict` (LCLI-538; extra keys
  are unaffected by this knob). See
  [ADR-0007's amendment](../adr/0007-validation-and-coherence.md).
- **Frontmatter quote-safety** — values that would serialize ambiguously are
  flagged (see [ADR-0011](../adr/0011-frontmatter-serialization-stability.md)).

| | |
|---|---|
| **Args** | optional `[paths…]` or glob (default: whole bundle) |
| **Key flags** | `--type <T>` (limit to one type) · `--strict` (treat warnings as errors) |
| **Output** | `kind: validate.report` — per-file findings tiered error/warning |
| **Exit** | `0` clean (or warnings only) · `6` any error (or any warning under `--strict`, or an unknown type under `strict_types`) |

### `check`

The **drift gate** — read-only, never writes. Aggregates:

- **Status reconciliation drift** — recomputes each `Story`/`Spec` status from
  its linked tasks (via `backlog … --json`) and reports any file whose
  authored `status` differs from the computed one (the write side is
  [`sync`](#sync)). See [ADR-0009](../adr/0009-story-task-coupling-reconciliation.md).
- **Managed-block drift** — reports any `<!-- lore:tasks -->` region that
  `sync` would change.
- **Unknown active-profile type** — a concept's `type` not declared by the
  active profile → **warning** by default (OKF tolerance, matching
  `validate`'s own unknown-type finding) — **unless** the active profile sets
  `[profile] strict_types = true`, in which case → **error**, independent of
  `--strict` (LCLI-538; see [ADR-0007's amendment](../adr/0007-validation-and-coherence.md)).
- **Bundle-scoped link + heading-anchor validation** — whole-bundle pure-JS
  pass: every `.md` cross-link whose resolved target stays inside the selected
  bundle root must resolve, and every such `#anchor` must hit a real heading.
  Relative links that normalize above the bundle root are explicitly outside
  this gate: they are not resolved, but the report exposes their skipped count
  so a green result cannot be read as repository-wide verification. This is a
  Lore-specific coherence gate, not an OKF 0.2 §11
  conformance rejection; OKF consumers must tolerate broken cross-links.
  **External-URL liveness** is opt-in with `--external` (Bun
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
- **Committed-schema drift** (LCLI-539, LCLI-565) — compares each committed
  `.lore/schemas/*.schema.json` with what the active profile generates now.
  Every finding carries a `schemaClass`: `missing` or `stale` (`lore schema
  export` writes or rewrites it) and `orphaned` (no type owns it, but its
  `x-lore-generator.profileDigest` stamp is this binary's own, so export may
  prune it) are rule `schema-drift`, exit `6`. An orphan whose stamp is absent
  or is another profile's is `unattributable`, rule `schema-unattributable`,
  exit `7`: lore cannot tell a removed type from a binary older than the tree,
  so it never advises a prune and points at `git log` instead. See
  [Committed-schema generator stamp](../specs/committed-schema-generator-stamp.md).
- **Date-sensitive lifecycle checks** — currently only OKF 0.2 `stale_after`.
  Every such rule receives one pinned evaluation date: `--as-of YYYY-MM-DD`
  when supplied, otherwise HEAD's recorded committer calendar date. `check`
  never reads the machine clock. If the bundle contains a date-sensitive rule
  and HEAD has no commit, pass `--as-of` or commit the bundle.

| | |
|---|---|
| **Args** | optional `[paths…]` (default: whole bundle) |
| **Key flags** | `--strict` (treat deterministic warnings as failures for the exit code) · `--as-of YYYY-MM-DD` (pin date-sensitive rules; default HEAD commit date) · `--external` (also probe external-URL liveness — advisory, never gates) |
| **Output** | `kind: check.report` — `findings`, `errorCount`, `warningCount`, `fileCount`, `skippedOutOfBundleLinkCount`, `complete`; plus optional `externalFindings` when `--external` ran, and optional `readCounts` when the bundle holds a Constants document (per type: `entries`, `comparableSources`, `notComparableSources`, `references`; LCLI-596). The skipped and read counts are informational and never affect severity counts or exit status. |
| **Exit** | `0` no broken bundle-scoped links/anchors and no status/managed-block drift · `2` invalid/non-calendar `--as-of` · `3` a linked task id no longer exists, or a date-sensitive rule needs the absent HEAD commit date · `6` any broken bundle-scoped link/anchor, any status/managed-block drift (or any deterministic warning under `--strict`, or an unknown type under `strict_types`), or any `missing`/`stale`/`orphaned` committed schema · `7` an `unattributable` committed schema (indeterminate — never auto-repair); a run with both `6`- and `7`-class findings exits `7` and still reports every finding. Skipped out-of-bundle links and external-liveness results never affect the exit. |

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
| **Key flags** | `--dry-run` (report what would change, write nothing — to `docs/` or `backlog/`) · `--no-index` (skip index/log regeneration) · `--fail-on-drop` (refuse **before any write** when `log.md` regeneration would drop unrecognized lines, instead of warning and proceeding — for unattended runs, which have no reader for a warning; rejected with `--no-index`, which regenerates nothing and so could never refuse) |
| **Output** | `kind: sync.result` — per-file diff summary of what changed, plus the `backlog/` commit outcome |
| **Exit** | `0` ok (changed or already clean) · `2` `--fail-on-drop` combined with `--no-index` · `3` a linked task id no longer exists · `6` could not reconcile (e.g. Backlog probe failed), could not commit `backlog/`, or `--fail-on-drop` refused a run that would drop unrecognized `log.md` content |

---

## Coupling to the configured tracker

Lore routes task reads and writes through the configured Quest, Backlog, or
Jira adapter. Backlog remains **JSON-only** (`backlog task list/view --json`,
`search --json`) and Lore never hand-edits task Markdown or stores unknown
frontmatter. See [ADR-0002](../adr/0002-backlog-integration-json-only.md), the
[backlog JSON schema](./backlog-json-schema.md), and the backend-neutral
[tracker contract](./backlog-cli-contract.md#tracker-adapter-boundary).

### `backlog adopt`

The `lore backlog adopt` command family is a controlled, **Backlog-only**
knowledge-record adoption interface. Its four operations are `preview`,
`apply`, `status`, and `rollback`; it does not claim a generic import system or
migrate tracker tasks between Backlog and Quest. The full versioned contract is
[Backlog knowledge adoption](../specs/backlog-knowledge-adoption-contract.md).

| Operation | Output kind | Contract |
| --- | --- | --- |
| `preview` | `backlog.adoption.preview` | Read-only, byte-stable plan with source provenance, proposed IDs/handles, collisions, fidelity gaps, and an approval receipt. |
| `apply` | `backlog.adoption.apply` | Requires the exact preview receipt digest; creates only approved artifacts and returns every created ID/path. |
| `status` | `backlog.adoption.status` | Reports the migration identity, receipt/source evidence, owned artifacts, and lifecycle state. |
| `rollback` | `backlog.adoption.rollback` | Removes only migration-owned artifacts in reverse order, returning every removed ID/path or `blocked-incomplete` evidence. |

Every operation uses Lore's normal `{ schemaVersion, kind, data }` success
envelope. Callers supply explicit source evidence and never write Lore files,
managed blocks, indexes, or graph state directly.

### `link`

Add one or more Backlog task ids to a concept's `tasks:` frontmatter list
(doc → task), and record the back-reference on each task (task → doc) by adding
the queryable label `doc:<conceptId>` via `backlog task edit` (display via
`--doc`). Idempotent: re-linking an already-linked task is a no-op. After writing
the back-reference, `lore` commits the `backlog/` change it made in one
`lore`-authored commit ([ADR-0012](../adr/0012-backlog-coexistence-git-ownership.md):
lore is the sole committer of `backlog/`), so it is never left uncommitted for the
next `lore sync` to sweep up; a `--no-back-ref` link or a no-op re-link writes
nothing to Backlog and so commits nothing.

```
lore link stories/bulk-archive-orders task-42 task-57
```

| | |
|---|---|
| **Args** | `<id>` `<taskId…>` |
| **Key flags** | `--no-back-ref` (skip the `doc:` label write to the task) |
| **Output** | `kind: link.result` — links added / already present, plus the `backlog/` commit outcome. Emitted **only on exit `0`**; if any task's back-reference edit (or the `backlog/` commit) fails, stdout stays empty and the same per-task detail moves into the standard `--json` error envelope's `input` on stderr (cli-contract §4/§5) — never a partial-success envelope on stdout (LCLI-58). |
| **Exit** | `0` ok · `2` usage (bad flag, comma-bearing id) · `3` concept or task id not found · `4` writing into a managed region denied · `5` `<id>` collides case-insensitively with another concept · `6` a task's back-reference edit failed, or the `backlog/` commit failed (drift); against a Quest-backed bundle, a missing/invalid actor declaration fails the same way but reports `validation` instead (see `lore instructions linking`) |

### `unlink`

Remove task ids from a concept's `tasks:` frontmatter and remove the matching
`doc:<conceptId>` label from each task. Idempotent. Like [`link`](#link), it
commits the `backlog/` change it made in one `lore`-authored commit (ADR-0012),
so a `--no-back-ref` unlink or a no-op (already-absent) removal writes and commits
nothing.

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
| **Output** | `kind: unlink.result` — links removed / already absent, plus the `backlog/` commit outcome. Emitted **only on exit `0`**; if any task's back-reference edit (or the `backlog/` commit) fails, stdout stays empty and the same per-task detail moves into the standard `--json` error envelope's `input` on stderr (cli-contract §4/§5) — never a partial-success envelope on stdout (LCLI-58). |
| **Exit** | `0` ok · `2` usage (bad flag, comma-bearing id) · `3` concept not found (unless `--allow-missing`) · `5` `<id>` collides case-insensitively with a live concept · `6` a task's back-reference edit failed, or the `backlog/` commit failed (drift); against a Quest-backed bundle, a missing/invalid actor declaration fails the same way but reports `validation` instead (see `lore instructions linking`) |

### `tasks`

Show the **live status rollup** for a concept's linked tasks, pulled fresh from
the Backlog JSON adapter (does not write; this is the read-only view that
[`sync`](#sync) materializes into the managed block). A `tasks:` id Backlog no
longer knows is dropped from the rollup with a stderr advisory, not an error —
[`orphans`](#orphans) is the dedicated dangling-link report.

```
lore tasks stories/bulk-archive-orders
```

| | |
|---|---|
| **Args** | `<id>` |
| **Key flags** | `--status <S>` (filter) |
| **Output** | `kind: tasks.rollup` — `{ concept, status?, tasks: [{ id, title, status }] }` (object-wrapped, like every list command) |
| **Exit** | `0` ok · `2` usage (missing `<id>`, unknown/repeated flag) · `3` concept not found, or `backlog` not on PATH · `6` `backlog` present but not `--json`-capable |

### `orphans`

Bidirectional orphan report: **tasks with no owning doc** (no concept lists
them, no task carries a `doc:` label, and no ancestor in the task's Backlog
parent/subtask chain is owned either (LCLI-261), so a subtask of an
already-linked parent is not reported) and **docs whose linked tasks have
vanished** (a `tasks:` id Backlog no longer knows). The agent/CI signal that
the doc↔task coupling has gaps.

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--tasks-only` · `--docs-only` · `--limit <n>` (caps each requested section independently; default 20) |
| **Output** | `kind: orphans.report` — `{ orphanTasks[], orphanTasksTotal, orphanTasksShown, orphanTasksTruncated, danglingLinks[], danglingLinksTotal, danglingLinksShown, danglingLinksTruncated }` (bounded per §3; each pair of `total`/`shown`/`truncated` fields is present only alongside its own array) |
| **Exit** | `0` ok (report emitted even when non-empty; `orphans` is a report, not a gate) |

---

## Navigability & retrieval

These are deterministic, no-LLM operations (see
[ADR-0014](../adr/0014-core-has-no-llm-dependency.md) and
[ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md)).
`graph`, `path`, `impact`, `changed`, `provenance`, `query`, and `context` use canonical records from a fully verified,
immutable local LadybugDB generation on supported hosts. Missing, stale, known
incompatible, or corrupt state rebuilds only under the frozen ownership policy;
contention, a newer unsupported format, an unavailable native backend, or a
failed indexed operation selects the reference in-memory implementation before
output. The public envelopes, diagnostics, and ordering do not reveal which
backend was selected. No command accepts Cypher or exposes database paths,
physical identifiers, or native errors.

All seven retrieval commands also accept an explicit `--workspace <manifest>` and a
repeatable `--repository <member-id>` subset selector. `--repository` requires
`--workspace`; Lore never discovers a workspace or member automatically.
Workspace concept IDs are qualified as `<member-id>::<source-id>`, and JSON
results add locator-free workspace scope and per-result provenance. Omitting
`--workspace` preserves the single-repository output exactly. See
[Workspace indexing and retrieval](../specs/workspace-indexing-and-retrieval.md).

### `graph`

Emit the bundle's cross-link graph (concepts as nodes, OKF cross-links and
frontmatter refs as edges; reserved index/log handled per OKF). Surfaces
per-node and bundle **token estimates** (labeled chars/4 heuristic). Used by
humans for orientation, by consumers for navigation, and by
[`rename`](#rename)/[`supersede`](#supersede) internally.

| | |
|---|---|
| **Args** | optional `<id>` (subgraph rooted at one concept; normalized like [`rename`](#rename), so path/`.md`/`./` forms resolve; workspace mode requires `<member-id>::<source-id>`) |
| **Key flags** | `--dot` (emit Graphviz DOT; mutually exclusive with `--json`) · `--depth <n>` (bound subgraph radius) · `--proof-only` (show only proof-bearing relations) · `--workspace <manifest>` · `--repository <member-id>` (repeatable) |
| **Output** | `kind: graph.export` — nodes, edges, token estimates (or DOT text under `--dot`). A relation edge additionally carries `statement`, `version`, `relationOrdinal` and `versionState`. Workspace JSON adds scope, per-node provenance, and exact explicit workspace links. `data.backend` names the retrieval backend that served the request. Machine JSON is the global `--json` envelope, as for every command. |
| **Exit** | `0` ok · `2` bad usage (`--dot` with `--json`, bad flag/`--depth`) · `3` root `<id>` not found |

`--proof-only` filters the **edges**; the node set and the `--depth` radius are
unchanged. Both halves are deliberate. A claim with no proof relationships stays
in the view because an unsupported claim is precisely what a proof view should
surface — dropping unconnected nodes would hide the concepts most worth looking
at, and would make `tokenEstimate` stop meaning "the budget of what is shown".
The radius is left alone because "two proof hops" is a different question from
"only the proof edges around here"; this flag answers the second.

`versionState` is present on every edge a `relations[]` entry authored, including
when nothing drifted, and takes one of four values: `current`, `stale`,
`unversioned` (the relation recorded no `version`), or `untracked` (the target
declares no `claim_version`). A marker that appeared only on a stale edge could
not distinguish "compared and agreed" from "nothing was comparable". See
[ADR-0021](../adr/0021-typed-authored-relationships-and-claim-state.md).

### `path`

Find deterministic shortest simple paths across exact authored concept, task,
and explicit workspace relationships. Every endpoint is typed; the command
does not guess whether an id names a concept or task.

| | |
|---|---|
| **Args** | `<from> <to>` |
| **Key flags** | required `--from-kind <concept\|task>` · required `--to-kind <concept\|task>` · required `--direction <outbound\|inbound\|either>` · `--edge <kind>` (repeatable allowlist) · `--proof-only` · `--max-depth <n>` (default 4, max 16) · `--limit <n>` (default 20, max 100) · `--workspace <manifest>` · `--repository <member-id>` (repeatable) |
| **Output** | `kind: path.result`, schema `lore-path-result/1` — normalized typed scope, selected edge kinds, effective limits, shortest exact edge chains, endpoint and edge provenance, `shown`, `edgeVisits`, `depthBoundReached`, `truncated`, `complete`, and `backend` |
| **Exit** | `0` ok (no path is an empty successful result) · `2` bad/missing kind, direction, edge, depth, limit, or scope · `3` typed endpoint not found · `4` source unavailable · `6` malformed/drifting projection |

### `impact`

Expand one typed endpoint across exact authored relationships. Each affected
endpoint appears once with a canonical shortest evidence chain and is labeled
`direct` at depth 1 or `transitive` thereafter.

| | |
|---|---|
| **Args** | `<id>` |
| **Key flags** | required `--kind <concept\|task>` · required `--direction <outbound\|inbound\|either>` · `--edge <kind>` (repeatable allowlist) · `--proof-only` · `--max-depth <n>` (default 4, max 16) · `--limit <n>` (default 20, max 100) · `--workspace <manifest>` · `--repository <member-id>` (repeatable) |
| **Output** | `kind: impact.result`, schema `lore-impact-result/1` — normalized typed root, selected edge kinds, effective limits, direct/transitive impacts, exact evidence chains and provenance, `shown`, `edgeVisits`, `depthBoundReached`, `truncated`, `complete`, and `backend` |
| **Exit** | `0` ok (no impacts is successful) · `2` bad/missing kind, direction, edge, depth, limit, or scope · `3` typed root not found · `4` source unavailable · `6` malformed/drifting projection |

`--proof-only` is a preset for `--edge`: it selects the proof-bearing relation
kinds — `requires`, `refutes`, `supersedes`, `superseded_by` — and excludes
everything else, including plain markdown `link` edges and `alternative`
relations. The two flags cannot be combined; passing both is a usage error
rather than an intersection, because each expresses a complete answer to "which
edge kinds" and guessing between them is how a filter silently returns less than
either flag alone would have.

Unlike an explicit `--edge`, `--proof-only` is **not** rejected when the bundle
contains none of those kinds. An `--edge` value the snapshot does not contain is
almost always a typo and is reported as one; a preset naming kinds the bundle has
not used yet is the correct, informative answer — a proof-only view of a bundle
with no proof relations is legitimately empty. See
[ADR-0021](../adr/0021-typed-authored-relationships-and-claim-state.md).

### The retrieval backend, reported

`graph`, `query`, `context`, `path` and `impact` all load through the same
retrieval layer, which prefers a verified indexed generation and falls back to
an in-memory reference load. Their `--json` `data` carries **`backend`** —
`"indexed"` or `"reference"` — naming the one that actually served the request.

It is present on **every** successful response, never only on a degraded one.
That is the whole point rather than a detail: a marker that appeared only when
something went wrong would have an absence ambiguous between "the good case" and
"a version that does not report this". The stderr advisory already has that
problem — the fallback is reached by more than one route and at least one of them
prints nothing — so empty stderr is not evidence that the indexed backend ran.
`backend` is a positive signal and can be asserted on directly.

The two backends are required to produce the same answer, so this is the one
field in these payloads that is expected to differ between them; a parity
comparison should exclude it and assert it separately.

When the indexed backend is not used, the fallback is announced on stderr and
**names its cause**, drawn from a closed set: the platform is unsupported, the
driver could not be loaded, the indexed snapshot disagrees with the exported
records, no usable snapshot was available, the attempt failed before it could
start, or the cause was unrecognised. Every route to the reference backend
announces itself — a fallback that reported some routes and not others would
make its own silence read as success. The advisory never names the storage
engine, a path, or a query; the reasons are the CLI's own vocabulary, not the
underlying error's text, so they can be relied on and asserted against.

Both commands enforce a hard 10,000-edge visit budget in addition to the
requested depth and result limits. Hitting the result or visit budget sets
`truncated: true` and `complete: false`; reaching the requested depth is
reported separately. They preserve duplicate authored edge records, never
traverse dangling targets, infer no relationships, and expose no Cypher or
Ladybug-native identifiers. See [Bounded path and impact](../specs/bounded-path-and-impact.md).

### `snapshot`

Explicitly retain, list, or delete immutable projection history. Lore never
captures or evicts history implicitly; each repository or workspace scope is
capped at 16 retained snapshots.

| | |
|---|---|
| **Args** | `<retain|list|delete> [snapshot-key]` |
| **Key flags** | `--workspace <manifest>` · `--workspace-id <stable-id>` (list/delete after a manifest is unavailable) · `--all` (delete the entire exact selected scope) |
| **Output** | `kind: snapshot.result` — retained/unchanged/listed/deleted action, exact snapshot descriptors, count, and maximum |
| **Exit** | `0` ok · `2` invalid action/selector combination · `3` snapshot or source missing · `4` read/write denied · `5` retention cap, collision, or symlink conflict · `6` malformed source or retained bytes |

### `changed`

Compare two retained snapshots from one exact scope. Stable record keys produce
changed rows; changed IDs produce remove/add rows. Duplicate authored edges are
preserved and no rename or relationship is inferred.

| | |
|---|---|
| **Args** | `<from> <to>` (exact snapshot key or unambiguous retained commit) |
| **Key flags** | `--kind <concept|task|edge>` (repeatable) · `--limit <n>` (default 100, max 1,000) · `--workspace <manifest>` · `--repository <member-id>` (repeatable) |
| **Output** | `kind: changed.result`, schema `lore-changed-result/1` — normalized filters/bounds, paired fact deltas, shown/total/scanned, truncation, and completeness |
| **Exit** | `0` ok, including no changes · `2` invalid bounds/filter/scope · `3` snapshot unavailable · `4` denied read · `5` ambiguous commit or cross-scope comparison · `6` malformed retained bytes |

### `provenance`

Resolve one retained fact to exact immutable repository, commit, export,
record, and source evidence.

| | |
|---|---|
| **Args** | `<id>` |
| **Key flags** | required `--kind <concept|task|edge>` · required `--snapshot <selector>` · `--workspace <manifest>` · `--repository <member-id>` (repeatable scope validation) |
| **Output** | `kind: provenance.result`, schema `lore-provenance-result/1` — snapshot descriptor, authored fact, and complete locator-free provenance |
| **Exit** | `0` found · `2` bad/missing kind or selector · `3` fact/snapshot missing · `4` denied read · `5` ambiguous selector · `6` malformed retained bytes |

### `explorer`

Build a deterministic, self-contained, read-only HTML explorer from the same
validated projection source used by Lore's persistent local index. The default
artifact is `.lore/explorer/index.html`; it embeds canonical
`lore-explorer-snapshot/1` bytes, inline styles, and a semantic browser runtime
under a Content Security Policy whose network and form actions are disabled.
Opening the file requires no server and performs no network request.

The explorer supports title/summary/id/type/status/tag search, record-kind and
status filters, bounded depth focus, selected-record details and provenance,
inbound/outbound relationship highlighting, dangling references, and authored
supersession chains. Initial and focused views retain the frozen contract's
node, edge, and depth bounds. The command never writes under `docs/`,
`backlog/`, or `.git/`; the default Lore-owned artifact updates atomically,
while a differing custom output requires `--force`.

Historical selectors switch to the separate
`lore-explorer-change-snapshot/1` contract. `--snapshot` lists one retained
snapshot; paired `--from`/`--to` renders replay-validated bounded changes with
change/kind/search filters and paired authored values/provenance. Omitting
those selectors preserves the ordinary explorer artifact exactly.

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--out <file>` (repo-relative `.html`; default `.lore/explorer/index.html`) · `--force` (replace a differing custom output) · `--snapshot <selector>` or paired `--from <selector> --to <selector>` · `--workspace <manifest>` · `--repository <member-id>` (repeatable) |
| **Output** | `kind: explorer.artifact` — artifact/snapshot versions, snapshot key, path, create/update/unchanged action, byte length, SHA-256 digest, and graph-health counts |
| **Exit** | `0` created, updated, or unchanged · `2` invalid flag/path · `3` source record unavailable · `4` read/write denied · `5` custom-output collision or symlink · `6` malformed bundle/profile/projection |

### `export`

Emit the complete repository OKF and task snapshot as deterministic, consumer-neutral JSONL for downstream indexes. The export preserves full concept frontmatter/body, authored concept and task edges (including duplicates and dangling targets), stable SHA-256 hashes, bundle identity, and Git provenance; it contains no database-specific labels, identifiers, embeddings, or inferred relationships.

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--schema-version 1.1` (the only supported breaking-contract version) |
| **Output** | JSONL by default: manifest, concepts, concept edges, tasks, task edges, trailer. Global `--json` emits `kind: projection.export` with the same records. |
| **Exit** | `0` ok · `2` bad/unsupported schema or flag · `3` missing bundle/Backlog · `4` denied read · `6` malformed bundle, Backlog drift, or Git failure |

See [OKF projection contract](okf-projection-contract.md).

### `query`

Deterministic lexical search over the selected bundle graph (BM25-style ranking) with
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
| **Key flags** | `--type <T>` · `--tag <t>` (repeatable) · `--status <S>` · `--limit <n>` (default bounded) · `--field k=v` (arbitrary frontmatter filter) · `--workspace <manifest>` · `--repository <member-id>` (repeatable) |
| **Output** | `kind: query.results` — ranked `[{ id, type, title, snippet, score }]` with `total`/`shown`/`truncated` and `backend`; workspace JSON adds scope and per-hit provenance |
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
| **Args** | `<id>` (workspace mode requires `<member-id>::<source-id>`) |
| **Key flags** | `--max-tokens <n>` (token budget, **enforced as a hard ceiling**; if omitted, no cap is applied — output is bounded only by `--depth`) · `--depth <n>` (neighbor radius, default 1) · `--workspace <manifest>` · `--repository <member-id>` (repeatable) |
| **Output** | `kind: context.export` — target body + neighbor summaries, with `tokenEstimate`/`truncated`/`omitted` and `backend`; workspace JSON adds scope and target/neighbor provenance |
| **Exit** | `0` ok · `2` bad usage (missing `<id>`, unknown/repeated flag, non-integer/out-of-range `--max-tokens`/`--depth`) · `3` `<id>` not found · `6` `--max-tokens` too small to name the target |

**A supplied `--max-tokens` is a ceiling, not a hint.** The emitted pack's
`tokenEstimate` never exceeds it. To stay within it, `lore context` drops
neighbors nearest-first, and then — only if the target still does not fit — the
target's own `body`. Omitting the flag applies no cap at all (LCLI-203), which
is unchanged; what changed is what happens when it *is* supplied, which used to
be an advisory label on an over-budget pack.

**Nothing is dropped silently.** Whenever `--max-tokens` is supplied, `data`
carries `omitted`:

```jsonc
"omitted": { "records": ["specs/archive", "adr/0001-x"], "fields": ["target.body"] }
```

`records` names the dropped neighbors by id, in the order they would have been
included; `fields` names any field the budget removed from the pack. **Both are
present even when nothing was dropped**, as empty arrays — if `omitted` appeared
only on a trimmed pack, its absence would be ambiguous between "nothing was
dropped" and "a version of lore that does not report omission", and a consumer
would have to diff against a full fetch to tell. With no `--max-tokens` the key
is absent entirely, which is a different and unambiguous statement: no projection
was active, so nothing could have been dropped.

A budget too small to hold even the target's *identity* (`id`, `type`, `title`)
is refused with exit `6` naming the required figure, rather than answered with
something unusable. The budget bounds the pack's **content** — the same
`tokenEstimate` it has always reported; the omission accounting sits outside it.

When you need a concept's text rather than a budgeted pack, use
[`read`](#read) — a separate operation with no budget at all.

### `read`

Read **one concept exactly as authored** — its frontmatter mapping and its full
body, verbatim. No assembly, no neighborhood, no ranking, and **no budget flag at
all**: there is no configuration under which this command returns less than the
whole concept.

```
lore read adr/0021-typed-authored-relationships-and-claim-state
```

| | |
|---|---|
| **Args** | `<id>` (normalized like [`rename`](#rename), so path/`.md`/`./` forms resolve) |
| **Key flags** | none |
| **Output** | `kind: read.concept` — `id`, `path`, `type`, `frontmatter`, `body`, `tokenEstimate`. Plain/pretty is one header line, a blank line, then the body verbatim, so `lore read <id> \| tail -n +3` recovers the body byte-for-byte |
| **Exit** | `0` ok · `2` bad usage (missing/extra `<id>`, unknown flag) · `3` `<id>` not found |

It is a **separate operation** from [`context`](#context) rather than a flag on
it, deliberately. `context` assembles and is lossy by design — it selects,
orders, and enforces a ceiling. That is right for a caller feeding a model a
budget it must not exceed and wrong for a caller who needs to quote a document;
collapsing the two into one operation makes the caller who needs fidelity and the
caller who needs cheapness share a code path, and one of them loses.

`read` reports no `backend`, and that absence is deliberate: an exact read is
always a direct filesystem load, so there is no backend choice to report.

### `agent`

Discovers committed `.lore/agents/*.toml` profiles and compiles deterministic,
task-ranked evidence from each profile's explicit Lore source allowlist. The
singular family is distinct from the plural [`agents`](#agents) bridge command:
it does not create, patch, or run native Claude Code or Codex agents.

```text
lore agent list
lore agent show frontend-dev
lore agent context frontend-dev --task "Add accessible dialog focus management"
lore agent context frontend-dev --task-file task.txt --max-tokens 6000
lore agent context frontend-dev --task LCLI-348 --contract opum-agent-workflow/v1 --json
echo '{"contract":"opum-agent-workflow","supportedVersions":[1],"requestId":"<32hex>","taskId":"T-1","profileId":"frontend-dev"}' | lore agent context frontend-dev --contract opum-agent-workflow/v1 --json
lore agent context orchestration --task "audit the release pipeline" --workspace .lore/workspaces/opum-family.json --repository opum-agent --repository lore-cli
```

| Subcommand | Contract |
|---|---|
| `list` | Stable profile summaries; `kind: agent.profiles` |
| `show <name>` | One normalized profile; `kind: agent.profile` |
| `context <name>` | Exactly one of `--task <text>` or `--task-file <repo-relative-path|->`; optional `--max-tokens <n>`, `--out <repo-relative-path>`, `--force`, and `--workspace`/`--repository` (below); with `--contract opum-agent-workflow/v1` (and exactly one `--task <taskId>`, without `--task-file/--out/--force/--workspace`) serves the read-only projection; `kind: agent.context.export` (default) or `agent.workflow.projection` (`--contract`) |
| `context <name>` binding seam | With `--contract opum-agent-workflow/v1` and **no** `--task`/`--task-file`, the request binding is read from stdin exactly as the Opum facade sends it — `{contract:"opum-agent-workflow", supportedVersions:[1], requestId:<32hex>, taskId:<string>, profileId:<string>, profileRevision?:<string>}` — and stdout carries machine JSON only: a bare success record (`contract`, `selectedVersion:1`, `requestId`, `taskId`, `profileId`, `profileRevision`, `digestAlgorithm:"sha256"`, `digest:<64hex>`, `contextId`, `issuedAt`, `expiresAt` ≤5 minutes after `issuedAt`, `sourceIds`) or a bare `{"error":{"code":"OPUM_WORKFLOW_LORE_ABSENT|STALE|INCOMPATIBLE|MISMATCH"}}` envelope with the stable marker echoed on stderr and exit `1`. Every failure is fail-closed; no fallback data is invented |

`context` reserves space for metadata and mandatory pins, then ranks complete
heading/top-level-block records from `sources`. Task-file and output paths are
confined to the repository and reject symlink traversal. Outputs write
atomically and require
`--force` to replace different bytes. Common exits are `0` success, `2` usage,
`3` unknown profile (`show`/`project`) or source, `4` denied I/O, `5` output conflict, and `6`
profile/reference validation or mandatory-budget failure.

**Every plain `context` pack is query-augmented (LCLI-575).** Besides its
profile-bounded evidence, a pack carries a `## Bundle-wide query hits` section
(`queryHits` in `--json`): up to three `lore query` hits for the task, from the
whole bundle, whose concept the pack does not already quote, each as id, title
and snippet — no bodies, so the profile still governs quoted evidence; use
`lore read <id>` to open one. The section is reserved ahead of ranked evidence
and never pushes a pack over its budget, nor raises the mandatory-pin floor: a
budget that compiled before LCLI-575 still compiles. When the budget, not the
corpus, shortens or empties the section, the pack says so: `queryHitsOmitted`
counts the hits the budget cut, and `--plain` prints a `showing N of M` line or
an `_Omitted by budget_` line in place of `_No bundle-wide hit outside this
pack._`. At the floor itself the section is dropped whole,
`queryHitsSectionOmitted: true` is set, and the omission is named on stderr.
With `--workspace --repository`, hits come from the selected members only, as
`lore query --workspace` narrows. A `context` call naming a profile that
does not exist no longer exits `3`: it degrades to that section plus a warning
(in the pack and on stderr) and `profileMissing: true`, exit `0`; because that
remaps an exit code, the `agent.context.export` envelope carries
`schemaVersion` `2` (cli-contract §5.6, §7.1). The section is for the plain pack
only: `project` and `context --contract` embed a hit-free pack whose bytes,
`packDigest` and `inputRevisions` are the pre-LCLI-575 ones, so no document
outside the profile's catalog can move a pinned digest. The decision record is
opum-doc's ADR "Make lore agent context always query-augmented" (ODOC-265) and
its Amendment 1 (opum-doc `main` a8bb596), grounded in LCLI-573's measurement
that the profile pack alone selected the answer for 8 of 69 real questions.

**`context --workspace <manifest> --repository <member-id>` (repeatable; LCLI-432) compiles the
same profile-bounded pack across an explicit workspace manifest instead of this repository alone**
— PLAN.md §4.6's cross-repository grounding. A profile's `sources`/`pinned` entries stay
bundle-relative and unqualified (e.g. `specs/lore-design`) so the SAME profile works bare and
cross-repo without a fork: in workspace mode an unqualified reference means "this path, in every
selected `--repository` member," fanned out and qualified as `<member-id>::<source-id>` before it
reaches the compiler. An explicitly qualified reference (`opum-doc::reference/opum-fleet-operating-model`)
opts out of the fan-out and pins exactly that one member — for a record that genuinely lives in a
single repository, not duplicated across the fleet.

`pinned` stays strict and `sources` relaxes: a `pinned` reference missing from any member it
resolves to is a hard failure (exit `6`), exactly like the single-repo contract — a pack must never
silently drop something it promised. A `sources` reference missing from a member that DID load is
reported in the catalog as `missing-in-member` and the pack still compiles. A manifest member that
could not be loaded at all (a dormant fleet member — OPAG-33) is skipped rather than rejecting the
whole compile: it is named once at the top of the pack under a `## Skipped workspace members`
section, and every `sources` reference that would have targeted it is reported `member-skipped` in
the catalog — a pack that says what it could not reach is worth more than one that refuses to
compile over a single unreachable repository. Every resolved item and catalog entry carries the
originating member's provenance (`AgentContextItem.provenance`/`AgentContextCatalogEntry.provenance`
and `.memberId`), and catalog references print as `<member-id>::<source-id>` so a cross-repo pack is
auditable the same way a single-repo one is.

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
| **Exit** | `0` ok (including a no-op `--dry-run`) · `2` bad flag, or an invalid/empty/zero-width pattern |

### `rename`

Graph-aware concept rename: move a concept to a new id/path **and rewrite every
inbound cross-link and frontmatter ref** across the bundle using the link
graph, then update sub-indexes. Links remain
[portable](./portable-markdown.md) (relative, URL-encoded, `.md`-suffixed).

If the renamed concept has `tasks:` entries, every linked task's `doc:<id>`
label and `--doc` path are moved to the new id/path too (LCLI-24, ADR-0009
§2) — the file move commits first, then the Backlog-side move runs, so a
Backlog failure never strands an already-renamed file. That Backlog-side move is
then committed in one `lore`-authored commit (ADR-0012: lore is the sole committer
of `backlog/`). Unlinked concepts — and `--dry-run` — never touch Backlog or
`git` at all.

```
lore rename stories/bulk-archive-orders stories/order-archival
```

| | |
|---|---|
| **Args** | `<oldId>` `<newId>` |
| **Key flags** | `--dry-run` (report rewrites, move nothing — never attempts the Backlog-side move or its commit) |
| **Output** | `kind: rename.result` — moved path + every link rewrite applied + every linked task's back-reference move outcome + the `backlog/` commit outcome |
| **Exit** | `0` ok · `3` `<oldId>` not found · `5` `<newId>` already exists, or (a linked concept only) collides case-insensitively with another concept · `6` a linked task's back-reference move failed, or the `backlog/` commit failed (drift) |

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
**additively**: a scaffold run only adds files, and never moves, renames,
restructures, or rewrites authored bundle content, so the OKF bundle stays the
single source of truth and remains consumable with or without the scaffold (see
[ADR-0010](../adr/0010-multi-consumer-docs-layer.md) and the
[consumer compatibility reference](./consumer-compatibility.md)).

Additive does **not** mean "outside `docs/`". Two of the three targets add new
files inside the bundle, each because its consumer requires the file to live
there: `mkdocs` writes `docs/tags.md` (Material's `tags` plugin renders the tag
index from a page inside the docs tree) and `obsidian` writes
`docs/.obsidian/app.json` and `docs/.obsidian/.gitignore` (Obsidian scopes a
vault to its root directory). Only `docusaurus` writes entirely outside `docs/`.
Every added file is itself OKF-legal, so a freshly scaffolded bundle still
passes `lore validate --strict` and `lore check --strict`.

```
lore scaffold mkdocs
lore scaffold docusaurus
lore scaffold obsidian
```

- **`mkdocs`** *(shipped, LCLI-39)* — `mkdocs.yml` pointing at `docs/` plus a
  `docs/tags.md` tag-index page; broken-links set to warn.
- **`docusaurus`** *(shipped, LCLI-40)* — a `website/` directory (`package.json`,
  `docusaurus.config.js`, `sidebars.js`) with `markdown.format: 'detect'`
  (raw `<`/`{` safety) and broken-links → warn.
- **`obsidian`** *(shipped, LCLI-41)* — `.obsidian/` vault config tuned for
  graph/backlinks over the relative-link convention (no wikilinks).

An unrecognized target string (e.g. `hugo`) is a `usage` error (exit `2`). A
bare re-run is idempotent when nothing changed: a planned file already on disk
with byte-identical content is left untouched, so a re-run against an
unmodified scaffold writes nothing and still exits `0`; a `5` conflict names
every planned file whose on-disk bytes actually differ (a user edit) and
points at `--force`; a non-directory entry blocking a planned directory is
the same exit `5`.

lore **detects** non-portable syntax (portability lint, in [`check`](#check))
but does **not** guarantee cross-renderer parity — that is the consumer's job.

| | |
|---|---|
| **Args** | `<target>` = `mkdocs` \| `docusaurus` \| `obsidian` |
| **Key flags** | `--force` (overwrite an existing generated config) |
| **Output** | `kind: scaffold.result` — files written (empty when already up to date) |
| **Exit** | `0` ok (already up to date is a no-op) · `2` unknown target · `5` an existing file's bytes differ from what this run would generate (without `--force`), or a non-directory entry blocks a planned directory |

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
| **Output** | `kind: schema.result` — `files` written, `removed` (orphans whose generator stamp is this binary's own, pruned on a full export to `.lore/schemas/`), `keptUnattributable` (orphans with an absent or foreign stamp, never pruned; a stderr warning names each outside `--json`), `count`. Every written file carries `x-lore-generator.profileDigest` (LCLI-565). |
| **Exit** | `0` ok · `4` `--out` not writable |

---

## Agent bridge & discovery

The agent bridge is CLI-generated, not a separate runtime (see
[ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md) and the
[agent onboarding runbook](../runbooks/agent-onboarding.md)).

### `types`

Print the active profile's declared type vocabulary directly: for every declared type, its name and
slug, required body sections, declared template (if any), and full field set — each field's
requiredness, a short shape label (`string`/`list`/`datetime`/`number`/`integer`/`boolean`/`enum`/…),
enum values when it has a closed vocabulary, and whether it's `common` (carried by every declared
type) or specific to this one. Read-only and requires no type name up front — unlike [`schema
export`](#schema), which writes `.lore/schemas/*.schema.json` files and requires already knowing a
type to inspect one usefully. Field shapes are read from the same generated Draft-7 JSON Schema
`schema export` writes, so a `types` report and what's on disk under `.lore/schemas/` never disagree.

```
lore types
lore types --type Story
```

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--type <T>` (scope the report to one declared type) |
| **Output** | `kind: types.report` — the profile's declared type vocabulary |
| **Exit** | `0` ok · `2` unknown `--type` |

---

### `agents`

Generate/refresh the agent bridges: write `.claude/skills/lore/SKILL.md` (how
an agent should drive lore) and a small `CLAUDE.md` nudge. Idempotent —
regenerating with no change is byte-identical.

**`.lore/config.toml`'s `[agents].skill_source` (LCLI-443) can opt SKILL.md out of
per-repo generation entirely.** The default, `"repo"`, is this section's behavior
above, unchanged. `"plugin"` means the `opum-lore` marketplace plugin owns the
skill instead: a bare `lore agents` then never creates or updates SKILL.md, and
a leftover copy is reported `orphaned` (drift, not silence) — `--check` exits `6`
naming the file and the remedy. `--force` removes an orphaned file only when its
bytes exactly match this command's own generated content, reported as `removed`;
a hand-edited or otherwise differing leftover stays `orphaned` even under
`--force`, the same refusal that already protects a hand-edited file from being
overwritten. `--skill-source` on `init` (above) is how a repository opts in. A
scoped, explicit `lore init --claude`/`--agents` request always still
materializes SKILL.md regardless of this setting — the setting governs only what
the bare `lore agents` call does. `CLAUDE.md`'s nudge reflects the active source
too: under `"plugin"` its "Skill:" line names the plugin rather than a per-repo
path that must not exist.

**The Codex bridge is covered too, but only where one already exists**
(LCLI-364). When `.codex/skills/lore/SKILL.md` is present, or `AGENTS.md`
carries the `lore:agents` managed block, both are planned and checked exactly
like their Claude counterparts. A repository that never opted into Codex has
neither, so nothing codex-related is reported or created and the run stays at
exit `0`.

This applies to `lore agents`, which means "the bridges are current" — **not**
to `lore init --claude`, which is a scoped request for the Claude bridge and
reports only its two files. `lore init --codex` owns the other half.

That conditional is the design, not an optimization. Checking unconditionally
would report `created` — drift — for every Claude-only repository, turning the
CI gate into one everybody disables. `lore init --codex` is what opts a
repository in; from then on its Codex bridge is held to the same standard as
its Claude one. Either artifact alone arms the check: an `AGENTS.md` block whose
`SKILL.md` was deleted is exactly the drift worth catching, and so is the
reverse.

**`--target claude|codex` scopes the call to one runtime** (LCLI-593; opum-doc
ADR Amendment 5, ruling 27, main `99e8ce5`). It is additive: a call without it
behaves exactly as described above, with every exit code unchanged. With it,
only the named runtime's bridge is planned, written or checked, and it is
planned whether or not its files exist yet — an explicit ask means what it
names, the same way `lore init --claude` and `lore init --codex` do — while the
other runtime's bridge is left entirely alone. `agents.skill_source` still
governs SKILL.md under `--target claude`, because this is still `lore agents`
keeping a bridge current. A runtime other than `claude` or `codex`, or
`--target` given twice, is a usage error (exit `2`).

**`--check` and `--force` also report the `opum-lore` marketplace plugin**
(LCLI-592) for each runtime whose bridge the call covered: Claude when the Claude
bridge is in scope, Codex when the Codex bridge is, or the one runtime `--target`
named. **A plain write-mode `lore agents`, with or without `--target`, reports no
plugin state and starts no runtime process at all** (the orchestrator's ruling B
on LCLI-593). It asks the runtime's own public list command
— `claude plugin list --json` or `codex plugin list --json` — and nothing else,
and reports one of four states: `installed`, `disabled` (installed but switched
off, so its skill does not reach the agent — never reported as `installed`),
`not-installed`, or `not-detectable` (the runtime CLI is missing, exited
non-zero, or answered in a shape lore cannot read — never folded into
`not-installed`). On the Claude side, a row scoped to another project is
ignored, and the deciding row is chosen by scope precedence
(**managed > local > project > user > synced**), then by `projectPath` depth
within a scope, the deeper row deciding (opum-doc ADR Amendment 6, rulings 28
and 29; ruling 28 supersedes ruling 26(ii) for `managed` only). A `managed` row is
set by a Claude Code administrator in the managed settings: it applies to every
project, so its `projectPath`, if it carries one, is never compared, and it
decides over every other scope, a project-matching `local` row included; among
several applicable `managed` rows, any disabled one makes the state `disabled`,
whatever the list order. Each entry is
`{runtime, id, state, version?, scope?, reason?, remedy?}`, the same shape
`quest agents --check` reports for `opum-quest`.

When plugin state is reported, **`data.plugin` appears exactly when `--target`
names a runtime, and `data.plugins.<runtime>` otherwise** (ruling 27). A call
with no `--target` reports `data.plugins.<runtime>` — `plugins.claude`,
`plugins.codex` — one entry per covered runtime, and no bare `data.plugin`, so
that field's meaning never depends on which runtime happened to be checked
first. A `--target` call reports `data.plugin` for the named runtime and no
`data.plugins`. The two are never both present. `data.target` names the runtime
on every `--target` call, a plain write included.

`remedy` is the command to run next — install, enable, or update. Two
exceptions. Where the deciding Claude row is `managed`, installed or disabled
alike, the remedy is exactly `managed by your Claude Code administrator:
opum-lore@opum is set in the managed settings, which only an administrator can
change` — prose, never a `claude plugin` command and never `--scope managed`,
because the plugin user cannot change a managed setting (ruling 28; the string
is quest-cli's with the plugin id swapped). And, keeping ruling 26(iii) intact:
where the Claude scope that decided the state
cannot be named safely in a command (it is absent, or not a plain token that
starts with a letter or digit, so `--help` or `-x` never becomes `--scope`), the
remedy is prose naming the problem rather than a command, because an unscoped
`claude plugin update` or `enable` would act at Claude's default scope, which
may be a different row. Text a runtime
supplies (`reason`, `version`, `scope`) is reduced to one printable line before
it is reported. `LORE_AGENT_PLUGINS=off` skips detection entirely: every runtime
reads `not-detectable` and no `claude` or `codex` process is started. A runtime
that has not answered its list command within 15 seconds is `not-detectable`,
and lore kills its process group rather than waiting on anything it started.

**`--target <runtime> --force` runs that runtime's plugin update** (rulings 19,
21, 25 and 26(iii)) — the one case in which `lore agents` changes the machine's
agent install rather than only reading it. Only an `installed` plugin is
updated: Claude with `claude plugin update opum-lore@opum --scope <scope>`,
naming the scope whose row decided the state; Codex, which has no per-plugin
update, with `codex plugin marketplace upgrade opum` then `codex plugin add
opum-lore@opum`. **The Codex upgrade refreshes every `opum` plugin installed in
Codex, `opum-quest` included, not only `opum-lore`**, and `updateDetail` says so
by outcome: after a successful upgrade and add, it gives that notice; when the
upgrade succeeded and the add then failed, it says every `opum` plugin was
already refreshed; when the upgrade itself failed or timed out, it gives no
notice, because no refresh can be vouched for. Each update step has its own ten-minute budget, separate from
the listing's 15 seconds (`LORE_AGENT_PLUGINS_UPDATE_TIMEOUT_MS` overrides it),
because quest-cli measured the Codex upgrade at over two minutes. On any
`--force` run that is not `--check`, every plugin entry also carries `update`
(`ran` or `not-run`), `updateOk` (present exactly when it ran), and
`updateDetail` (what ran, what failed, or why nothing ran) — the field names
`quest agents --update-instructions` uses (quest-cli QCLI-371, `30a6846`). A failed
update keeps exit `0` and keeps its command as the `remedy`.

Nothing else ever runs. A `disabled` plugin is never enabled: it is reported
with the enable command (ruling 21). A `not-installed` or `not-detectable`
plugin is reported with its remedy and nothing runs, and the repository's own
bridge files are written exactly as they would be without a plugin. An
`installed` Claude plugin whose deciding scope cannot be named is `not-run`
too, with the prose remedy above (ruling 26(iii)). **A `managed` deciding row is
never updated** (ruling 28): `--target claude --force` runs only the list,
reports `scope: managed` and `update: not-run` with `updateDetail` `the deciding
row is managed by your Claude Code administrator, so it is never updated`, and
keeps the managed remedy, whether the row is `installed` or `disabled`: no
detail on a managed row mentions enabling it or an update the user can run
(LCLI-608). `--check` never updates, with
or without `--force`. **A bare `lore agents --force` names
no runtime, so it updates none** (ruling 25): each `plugins.<runtime>` entry is
`not-run`, and its `remedy` is the update command to run by hand or through
`lore agents --target <runtime> --force` — except where the deciding Claude row
is `managed`, whose `remedy` is the managed prose above and whose
`updateDetail` is the managed detail, installed or disabled, because no call
ever updates it. The plugin report and any update never
change the exit code.

| | |
|---|---|
| **Args** | none |
| **Key flags** | `--force` (overwrite hand-edited generated files, or remove an orphaned SKILL.md that exactly matches the generated content; with `--target`, also update that runtime's installed `opum-lore` plugin) · `--check` (report drift without writing — CI gate for a stale bridge; never updates a plugin) · `--target <claude\|codex>` (scope the bridge and the plugin report to one runtime) |
| **Output** | `kind: agents.result` — each bridge file and what happened to it (`created`/`updated`/`unchanged`/`protected`/`orphaned`/`removed`), so a failing `--check` names the artifact that drifted; `target` on every `--target` call; under `--check` or `--force` only, the `opum-lore` marketplace plugin state as `plugins.<runtime>` without `--target`, or as `plugin` with it, never both; on a `--force` run that is not `--check`, each plugin entry also carries `update`, `updateOk` and `updateDetail` (above) |
| **Exit** | `0` ok, including a failed plugin update · `2` usage (a runtime other than `claude`/`codex`, or `--target` given twice) · `6` `--check` found a bridge out of date (including an orphaned leftover under `skill_source = "plugin"`) |

### `instructions`

Print lore's own agent-facing usage guidance (the canonical "how to use lore"
text the SKILL embeds), so an agent or human can pull guidance on demand
without opening files. Mirrors the `backlog instructions` idiom.

| | |
|---|---|
| **Args** | optional `<topic>` (`overview` default; also `retrieval`, `linking`, `sync`, `check`, `validation`, `types`, `workspace`, `agents`) |
| **Key flags** | — |
| **Output** | `kind: instructions.text` — the guidance body, plus the full topic index for `--json` callers |
| **Exit** | `0` ok · `2` bad usage (unknown flag/extra argument) · `3` unknown topic |

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

### `publish confluence` — ON HOLD

One-way publish of the bundle to Confluence (Cloud / ADF target). Isolated
adapter with **zero core dependency**; Server/DC is deferred-not-dropped. See
[ADR-0016](../adr/0016-confluence-one-way-publish-deferred.md).

```
lore publish confluence [paths…] --space KEY --parent PAGE_ID --dry-run --all --prune
```

| | |
|---|---|
| **Status** | on hold; retained but unscheduled |
| **Args** | optional `[paths…]` (default: changed-only) |
| **Key flags** | `--space <KEY>` · `--parent <PAGE_ID>` · `--all` · `--prune` · `--dry-run` |
| **Output** | `kind: publish.result` — created/updated/skipped pages |
| **Exit** | `0` ok · `4` auth/token denied · `5` remote version conflict |

### `mcp` — ON HOLD

Start the lore MCP server (stdio transport) exposing the same `core/` functions
as agent-callable tools/resources. Secondary to the CLI. Full design in the
[MCP tools reference](./mcp-tools.md); decision in
[ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md), with the current hold and successor sequence controlled by [ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md).

```
lore mcp
```

| | |
|---|---|
| **Status** | on hold; retained by LCLI-42 without a scheduled milestone |
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
