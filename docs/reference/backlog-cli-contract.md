---
type: Reference
title: Backlog.md CLI operational and safety contract
description: The operational and safety contract for driving Backlog.md from lore — read path, write path, status mapping, git/locking safety, and the capability probe.
tags: [backlog, cli, integration, safety, contract]
summary: How lore drives Backlog.md safely and deterministically — JSON-only reads, ID-capturing writes, status reconciliation, sole-committer git discipline, and a fail-loud capability probe.
timestamp: 2026-06-21T00:00:00Z
---

# Backlog.md CLI operational and safety contract

This is the binding contract for how `lore` invokes the `backlog` binary. It
governs the **adapter** (`src/adapters/backlog.ts`) and every coupling command
(`link`, `unlink`, `tasks`, `orphans`, `sync`, `check`). The build `lore`
actually runs is pinned **at or past the upstream PR #790 merge commit**
(`22a091b5`, restated just below in fact 1) — which is necessarily a superset of the
**Backlog.md v1.48.0** tagged release: `v1.48.0` is 10 commits behind
`22a091b5` on `MrLesk/Backlog.md`'s `main` (`git log --is-ancestor`-equivalent,
confirmed via GitHub's compare API, `2026-07-26`). The CLI-surface claims in
this document (flag multiplicity, exit codes, output formats, idempotency) are
verified against real upstream source **at tag `v1.48.0`** — the newest
tagged release, and a reproducible reference point for a later reader — and
reconfirmed unchanged at the PR #790 commit and current upstream `main`
(`babd1d2`, `2026-07-19`). This replaces an earlier "v1.47.1 tested floor"
framing that had gone stale: several things below changed between v1.47.1 and
v1.48.0 — §2.4's `task edit` label-flag accumulator conversion (three flags:
`-l`/`--label`, `--add-label`, `--remove-label`), §2.4's new hard-error guard
against combining `--label` with `--add-label`/`--remove-label`, §2.4's new
`--clear-labels` flag, §2.5's edit idempotency, and §2.5's two
`src/markdown/serializer.ts` changes (the frontmatter object's new `type` key
and the AC/DoD section-emission logic) — so a floor of v1.47.1 no longer
describes this document's own content. (`task list`'s `-l`/`--labels`
filter did **not** change between the two tags — see §2.4 — it was already an
accumulator at v1.47.1.) The **code's** `MIN_BACKLOG_VERSION` constant
(`src/adapters/backlog.ts`) is a separate, deliberately non-discriminating
sanity floor; LCLI-253 raised it to `1.49.0` (the first tagged release
containing the PR #790 commit this floor previously predated — see §5) — that
constant is not evidence that any CLI behavior below was re-verified at
v1.49.0; the CLI-surface claims in this document are still the v1.48.0/PR #790
verification described above, not independently re-checked against v1.49.0.

Two facts shape everything below:

1. **Reads are JSON-only.** `lore` reads structured data from a `--json` flag
   that **stock Backlog.md did not originally have**. `lore` consumes
   upstream (`MrLesk/Backlog.md`) at or past `v1.49.0` — the first tagged
   release containing the PR #790 merge commit (published 2026-08-02) — a
   published `backlog.md` install, no longer the interim manually-built
   pinned-commit binary (LCLI-253); see the
   [Backlog --json patch runbook §8](../runbooks/backlog-json-patch.md#8-migrate-to-upstream-on-release-and-bump-the-floor)
   and the [Backlog JSON schema](backlog-json-schema.md). There is **no
   `--plain` text-parser fallback** — that is a deliberate rejection (see
   [appendix](#appendix-rejected-fallback--why-lore-does-not-parse---plain)).
2. **Writes go through the CLI, never file writes.** `lore` never writes
   `backlog/tasks/*.md` directly. All task mutations run `backlog task create` /
   `backlog task edit`. `lore` is the **sole git committer** for `backlog/`.

The shape and field names of the JSON envelope are specified in
[backlog-json-schema.md](backlog-json-schema.md). This document is the
*operational* contract — how to call, what to trust, what to never do. The
broader design rationale lives in the [lore design spec](../specs/lore-design.md)
and the relevant ADRs (linked inline).

> **Planned adoption boundary.** The future Backlog knowledge-adoption command
> family is separate from this adapter's ordinary task coupling. It receives
> explicit, read-only source evidence and returns public receipts/results;
> callers never write Lore's files or private state. See the versioned
> [Backlog knowledge adoption contract](../specs/backlog-knowledge-adoption-contract.md).

---

## 1. Read path (JSON-only)

All reads request the canonical envelope from the pinned upstream binary — a
per-command envelope, not a shared shape:

```json
{ "schemaVersion": 1, "kind": "task-list", "tasks": [ ] }
{ "schemaVersion": 1, "kind": "task-view", "task": { } }
{ "schemaVersion": 1, "kind": "search", "results": [ ] }
```

`schemaVersion` is the **number** `1` and `kind` is one of `"task-list"`,
`"task-view"`, `"search"` (hyphenated) — the exact values upstream emits and
that [backlog-json-schema.md](backlog-json-schema.md) (the schema of record)
pins. The capability probe and the M2 adapter assert these verbatim.

`lore` runs the command, `JSON.parse`s stdout, asserts `schemaVersion` and
`kind`, and reads `data`. A parse failure or a `kind`/`schemaVersion` mismatch
is **fail-loud** (exit 6, validation-or-drift) — never a silent fall-through.

### 1.1 Commands lore uses

| Need | Command | Notes |
|---|---|---|
| Enumerate tasks (current branch) | `backlog task list --json` | Current-branch / on-disk truth. **Never `backlog board`** — board has no `--json` (and no `--plain`). |
| Read one task's full fields | `backlog task view <id> --json` | The authoritative per-task read. Carries the on-disk file path, all header fields, AC/DoD, and body. |
| Fuzzy / label search | `backlog search "<q>" --json`, `backlog task list --json --labels "doc:<id>"` | Exposed on the adapter (`searchTasks`/`searchByLabel`); no lore command currently calls either — `orphans` reads the `doc:` label straight off its one unfiltered `task list --json` snapshot, and `unlink` operates on task ids named explicitly on the command line. |
| Find tasks touching a file | `backlog search --modified-file <path> --json` | **Substring** match on the modified-file path, not exact. |

### 1.2 Prefer per-id `task view` for the managed block

To build the status-rollup table in the `<!-- lore:tasks -->` managed region of
a `Story` (see [lore design spec §managed block](../specs/lore-design.md)),
`lore` calls **`backlog task view <id> --json` once per linked task ID** — not
`task list`. Rationale:

- A `Story`'s `tasks:` frontmatter is an **explicit ID set**, so per-ID lookup
  is the correct granularity.
- `task view` is the only read that carries the **on-disk file path** needed to
  build the `backlog/tasks/<file>.md` cross-link. (`task list` items omit it.)
- The file path **must be taken from the JSON `file`/`path` field**, never
  reconstructed from the displayed ID. The displayed ID is **uppercase**
  (`TASK-42`) while the on-disk filename is **lowercase** (`task-42 - …md`);
  `idForFilename` lowercases. Reconstructing the path from the display ID
  produces a broken link.

### 1.3 Reads are current-branch / on-disk truth

`lore`'s read-of-record is `task list --json` plus the on-disk files on the
current branch. `task view <id>`, `search`, and ID-generation resolve
**cross-branch** in stock Backlog and may surface tasks with no file on the
current branch. To collapse Backlog's reads to exactly on-disk truth, `lore`
sets `check_active_branches: false` (and `remote_operations: false` for zero
network) in managed projects — see [§4 Safety](#4-safety-and-git-discipline).
When resolving a linked ID whose file is absent on the current branch, `lore`
tolerates it (skip / mark foreign), never errors the whole sync.

### 1.4 No persisted index to invalidate

Backlog's search (Fuse.js) is rebuilt in-memory on every invocation; there is
nothing to invalidate. A `lore` write via the CLI is visible to the next
`backlog` call immediately. `lore` has no "invalidate Backlog cache" step.

---

## 2. Write path

All task writes go through `backlog task create` / `backlog task edit`. `lore`
is the writer-of-record only via the CLI; it never touches task `.md` files. See
the [Backlog write ADR](../adr/0002-backlog-integration-json-only.md) and
[link/back-reference ADR](../adr/0009-story-task-coupling-reconciliation.md).

### 2.1 Capturing the new ID on create — run WITHOUT --plain

`backlog task create` does **not** emit the `{schemaVersion,kind,data}` envelope
on creation; the new ID is recovered from the human-readable stdout. Run create
**without `--plain` and without `--json`**:

```
$ backlog task create "Bulk archive"
Created task TASK-1
File: /abs/path/backlog/tasks/task-1 - Bulk-archive.md
```

- Parse line 1 with `^Created (?:task|draft) (\S+)$` → capture the
  **uppercase** ID (`TASK-1`; drafts print `Created draft DRAFT-1`).
- Line 2 `File:` is the absolute on-disk path (optional metadata).
- **Do NOT pass `--plain` to create.** With `--plain`, the `Created task` line
  is **suppressed** and the full view is dumped (the ID is buried mid-block as
  `Task TASK-1 - …`), making capture fragile.

`lore`'s frontmatter `tasks:` list stores IDs **lowercase** (`task-1`, matching
the spec and the on-disk filename). The CLI accepts either case on **input**
(`task view task-1` and `TASK-1` both work), but all CLI **output** is
uppercase, so any equality check against CLI output must be **case-insensitive**.

### 2.2 Existence checks — `task view`'s exit code is meaningful

**`task view <missing>` (and the bare `task <missing>` shortcut) exits `1`
unconditionally**, in every output mode — matching `task archive`'s
convention. `lore`'s adapter (`viewTask`) checks exactly this: exit `1` (with
empty stdout) is the "no such task" signal; any other nonzero exit is a
fail-loud drift, never a silent "missing" guess.

- `task edit <missing>` also exits **1** — `editTask` disambiguates it from
  other edit failures via its own stderr `not found` text (a separate call
  site from `viewTask`, so the two never need to agree on a shared signal).
- `task list` / a successful `task view --json` parse also confirm existence.

> **History.** This is a migration-driven flip (LCLI-54). The earlier fork
> this project shipped against (LCLI-2/4/21) had `task view <missing>` exit
> `0` with empty stdout and a stderr message — an exit code that was *not* a
> usable existence signal, so `lore`'s adapter used to treat empty stdout as
> the "missing" tell instead. Upstream's PR #790 made the exit code meaningful;
> see [backlog-json-schema.md §8](backlog-json-schema.md#8-migration-history-complete)
> for the full migration history.

### 2.3 The doc back-reference — a queryable label, plus --doc for display

`lore link` records the doc→task back-reference two ways:

```
backlog task edit <id> --add-label "doc:<conceptId>" --doc "<docpath>"
```

- **`--add-label "doc:<conceptId>"` is the queryable index.**
  `backlog task list --json --labels "doc:<conceptId>"` does an exact AND-match
  and returns the tagged tasks — the capability (`TrackerAdapter.searchByLabel`)
  that makes the label a real index rather than free text. In practice, `lore
  orphans` reads labels directly off its one unfiltered `task list --json`
  snapshot instead of calling this filtered form, and `lore unlink` operates on
  task ids named explicitly on the command line.
- **`--doc "<docpath>"` is display-only.** It writes the `documentation:`
  frontmatter field, visible in `task view`, but is **not** searchable or
  list-filterable. It is the readable cross-reference, not the index.
- A `conceptId` is a path (`doc:stories/bulk-archive`) — no commas, so the
  multiplicity rules in [§2.4](#24-flag-multiplicity-rules) are not triggered.

### 2.4 Flag multiplicity rules

Backlog's flags split into two families. **Three of `task edit`'s label flags
(`-l`/`--label`, `--add-label`, `--remove-label`) moved families in
v1.48.0** — from single-value/last-wins to accumulator. `task list`'s
`-l`/`--labels` filter did **not** move: it was already an accumulator at
v1.47.1 and is unchanged at v1.48.0. Getting this wrong silently drops data.

**At v1.48.0 — accumulator, repeats AND commas both work:** `task list`'s
`-l`/`--labels` filter, and `task edit`'s `-l`/`--label`, `--add-label`, and
`--remove-label`. `-l A -l B` and `-l "A,B"` are equivalent (`["A","B"]`) for
all four. Verified against real upstream `MrLesk/Backlog.md` **at tag
`v1.48.0`**, `src/cli.ts`: `-l, --labels <labels>` on `task list` (line 2269),
`-l, --label <labels>` on `task edit` (line 2657), `--add-label <labels>`
(line 2668), and `--remove-label <labels>` (line 2673) each pass
`createMultiValueAccumulator()` (defined line 223: every repeat appends to an
array) as Commander's option processor; each resulting array is later
comma-split and normalized by `parseDelimitedStringList`
(`src/utils/task-builders.ts` line 115, same tag). **Of these four, only the
three `task edit` flags are new to v1.48.0 — `task list`'s `-l`/`--labels` was
already an accumulator at v1.47.1** (see below); it is listed here only to
state the full current-state picture in one place.

**Before v1.48.0 (confirmed at tag `v1.47.1`) `task edit`'s three label flags
had NO accumulator** — repeating the flag kept only the **last** value
(`-l A -l B` → `Labels: B`). At `v1.47.1`, `src/cli.ts` line 2370
(`.option("-l, --label <labels>")`), line 2376
(`.option("--add-label <label>")`), and line 2377
(`.option("--remove-label <label>")`) pass no processor argument at all —
confirmed against real upstream `MrLesk/Backlog.md` source fetched at tag
`v1.47.1` (`raw.githubusercontent.com`, sha256-matched against an
independently-fetched `codeload` tarball of the same tag). This is one of
several changes between v1.47.1 and v1.48.0 catalogued in this document's
opening summary; every other claim in this file was re-checked and still
holds at v1.48.0.

**`task list`'s `-l`/`--labels` was already an accumulator at v1.47.1 — it did
not change.** Confirmed against the same real upstream `v1.47.1` source:
`taskCmd.command("list")` is declared at `src/cli.ts` line 2010, its help
schema at line 2022 already reads "Require every listed label; repeat
--labels or use label1,label2", and the option itself (lines 2041–2045) is
`.option("-l, --labels <labels>", "filter tasks by labels; require every
comma-separated label (repeatable)", createMultiValueAccumulator())` — the
identical accumulator processor used at v1.48.0. This falsifies any reading
of this document (or of LCLI-270's own title) as claiming all four label
flags became repeatable in v1.48.0: only the three `task edit` flags above
did; `task list`'s filter always was.

**Unaffected by the above — still single-value, last-wins in v1.48.0:**
- `task create`'s `-l`/`--labels` (setting labels on a brand-new task) was
  **not** converted; it remains a plain `.option()` with no processor
  (`src/cli.ts` line 1691, tag `v1.48.0`). Comma-separate inside one flag
  occurrence to set multiple labels at create time.
- `--assignee`/`-a` is untouched by the v1.48.0 change and remains
  single-value, last-wins on `create`, `edit`, and `list` (`src/cli.ts`, no
  processor argument at any of those option definitions, both tags).

**Accumulator, unaffected by the v1.48.0 change (unchanged since v1.47.1):**
`--doc`, `--ref`, `--dep`/`--depends-on`, `--modified-file`.

Practical consequence for `lore` — **its writes are unaffected either way,**
because `lore` never repeats any of these flags; it always passes **one**
occurrence per flag, comma-joining when there is more than one value
(`src/adapters/backlog.ts`: `listTasks` ~line 838, `createTask` ~line 908,
`editTask` ~line 946/949). For `task edit`'s three label flags — the ones
that actually changed multiplicity — whether the processor is
last-wins-with-comma-split (pre-v1.48.0) or an accumulator that also
comma-splits (v1.48.0+), a single comma-joined occurrence produces the same
result, so this version change is **not a behavior bug in lore** — it only
changes what a *repeated* flag would do, and lore never repeats one.
(`task list`'s `-l`/`--labels` was never affected either way — see above —
and `lore`'s `listTasks` passes it at most once regardless.)

- `lore link` adds a **single** `doc:<id>` label via `--add-label` (one value,
  no comma) — unaffected by either rule. `lore unlink` removes one via a
  single `--remove-label` the same way.
- `lore orphans` passes **no filters at all** — its one `listTasks()` call
  (`src/commands/orphans.ts` ~line 166) omits every option, so no flag of any
  multiplicity is ever passed; the v1.48.0 change has nothing to act on here.
- `--add-label` / `--remove-label` are the **incremental** label ops
  (case-insensitive de-dup, preserves casing). Plain `--label`/`-l` on **edit**
  is **SET/REPLACE** — it wipes all existing labels. A `--clear-labels` flag
  was added in v1.48.0 for explicitly clearing all labels (`src/cli.ts` line
  2677, tag `v1.48.0`), and a hard-error guard against combining `--label`
  with `--add-label`/`--remove-label` is **also new in v1.48.0**
  (`src/cli.ts` lines 2928–2934: `if (options.label !== undefined &&
  (options.addLabel !== undefined || options.removeLabel !== undefined))` →
  `"Cannot combine --label with --add-label or --remove-label. Use --label
  a,b for the final full label set, or use add/remove flags without
  --label."`, line 2930). At
  v1.47.1 there was **no such guard**: `options.label`, `options.addLabel`,
  and `options.removeLabel` were parsed side by side with no combination
  check at all (`src/cli.ts` lines 2609–2611, same tag; confirmed 0
  occurrences of the string `"Cannot combine"` anywhere in v1.47.1's
  `cli.ts`). `lore` uses `--add-label`/`--remove-label` for incremental
  changes, never bare `--label`, so neither the v1.47.1 absence nor the
  v1.48.0 guard affects `lore`.
- `--doc`/`--ref` on edit are also SET/REPLACE (the accumulator replaces the
  whole array), and **cannot be cleared** via an empty value (a `length > 0`
  guard ignores `--doc ""`). So `lore unlink` must re-pass the full desired
  `--doc` set and remove the label with `--remove-label`.

### 2.5 Edit idempotency and what Backlog persists — since v1.48.0

- **Edit is idempotent as of v1.48.0.** An edit that changes no
  `updated_date`-relevant field does **not** bump `updated_date`, yet still
  exits 0 and prints `Updated task <ID>`. Verified at upstream tag `v1.48.0`,
  `src/core/backlog.ts`: `updateTask` (line 1406) only stamps a fresh
  `updatedDate` when `hasUpdatedDateRelevantChanges(originalTask, task)`
  (line 162) — a `JSON.stringify` comparison over a fixed field allowlist,
  `buildUpdatedDateComparableTask` (line 132) — returns `true`; otherwise it
  preserves the original task's `updatedDate` (or omits the field if the
  original never had one). `lore` sync/reconciliation may issue edits
  unconditionally without churning `updated_date`.
  - **This was NOT true at v1.47.1.** The pre-v1.48.0 `updateTask` (same file,
    tag `v1.47.1`, `src/core/backlog.ts` line 1089) unconditionally ran
    `task.updatedDate = new Date()...` (line 1099) on every call, with no
    comparison — so at v1.47.1 an edit that changed nothing still bumped
    `updated_date`. This is one of the several changes between v1.47.1 and
    v1.48.0 catalogued in this document's opening summary (the others are
    §2.4's `task edit` label-flag accumulator conversion, its new `--label`
    combination guard, its new `--clear-labels` flag, and the two
    `src/markdown/serializer.ts` changes noted just below — the `type` key
    addition to the frontmatter object and the AC/DoD section-emission logic
    change).
  - **Precision note:** `saveTask` (`src/file-system/operations.ts` line 289 at
    v1.47.1 / line 389 at v1.48.0 — the function moves, it does not change)
    calls an unconditional `Bun.write` (line 342 at v1.47.1 / line 443 at
    v1.48.0) on every `updateTask`, at both versions — Backlog does not skip
    the write syscall. "Idempotent" means
    the **written content** is byte-identical when nothing relevant changed
    (so `git diff` shows nothing), not that the write itself is skipped.
- Any **effective** change rewrites `updated_date` to **minute precision** UTC
  (`YYYY-MM-DD HH:mm`). Same-minute collisions are possible — never treat
  `updated_date` as a monotonic ordering signal.
- **Backlog drops unknown frontmatter keys on any mutating edit.** The
  **frontmatter key set** (`src/markdown/serializer.ts`, the `frontmatter`
  object literal — lines 51–70 at v1.47.1, lines 51–71 at v1.48.0) is
  unchanged in substance between the two tags; v1.48.0's only addition to
  that object is a `type` key (line 68) when the task has one. (The same
  file's acceptance-criteria/Definition-of-Done section-emission logic also
  changed between the two tags — `src/markdown/serializer.ts` lines 83–89 (the
  AC hunk) and 92–98 (the DoD hunk) at v1.48.0 — but that is body-content
  emission, not part of the frontmatter key set, and out of scope for this
  bullet.) **`lore` must never store
  bespoke metadata as task frontmatter.** Anything `lore` needs on a task
  lives in a Backlog-recognized field: `labels` (the `doc:` back-ref),
  `documentation`, `references`, `dependencies`, or `milestone`. AC/DoD `#n`
  indices are **renumbered display positions**, not stable keys — re-resolve
  after each write or key on text.

---

## Tracker adapter boundary

Coupling commands depend on the backend-neutral `TrackerAdapter` contract in
`src/adapters/tracker.ts`. Production code loads the resolved repository
selection and constructs a concrete backend through
`createConfiguredTrackerAdapter(root)`; `createTrackerAdapter(root, config)`
and injected adapters remain explicit test seams. New bundles persist Quest as
their selected backend. A bundle with no explicit selection and a real
`backlog/` directory is classified as legacy Backlog; its first tracker command
fails loud with exact migration and pin commands instead of silently switching.
An omitted selection without that legacy artifact resolves to Quest. Jira
Cloud is reachable through the installed `@salient-ai/jira-cli` executable
when the backend is `jira`; Lore
does not call Jira REST or read Jira credentials. Quest is reached through the
authorized installed Quest `0.2.2` candidate's schema-versioned subprocess contract; Lore does
not read Quest storage directly. An unknown selection fails loud instead of
being silently coerced to another backend.

Every backend must implement the complete task surface (`probe`, `listTasks`,
`viewTask`, label and text search, create, and edit) plus `statusFlow()`. The
status method owns the configured project's ordered workflow vocabulary; the
reconciliation layer must never read another backend's configuration directly.

The contract also preserves four hardening obligations across implementations:

- `probe()` fails loud before task output is trusted.
- Transport/spawn rejection is mapped to a typed `LoreError` with an actionable
  diagnostic; the Backlog implementation's errno mapping is the reference
  behavior.
- Per-task fan-out remains bounded by the command layer's shared concurrency
  helper rather than allowing an adapter to create unbounded work.
- A `viewTask(id)` result is accepted only after the command layer verifies the
  returned task ID matches the requested ID case-insensitively, or that the
  requested ID appears in the backend's validated stable aliases. A backend
  must not bypass that verified-view path.

### Quest CLI 0.2.2 candidate

The Quest backend consumes the explicitly authorized, locally installed Quest
`0.2.2` candidate through argv-only subprocess calls. This is qualification evidence,
not a public-package assertion. Lore requires `.quest/workspace.toml` and tells
the operator to run `quest init` when it is absent; it never invokes Quest
initialization itself. Its cached probe pins exact version `0.2.2` and the
schema-1 `manifest.registry` command descriptors, including the candidate's nullable
`version` kind, mutating `workspace.initialized` `init` descriptor, all four
Backlog-migration descriptors, and the live `task.status-flow` payload. Reads
use `task list`, `task view`, and `search`; writes use `task create` and `task
edit`, always with an explicit human `lore` actor. Missing binaries, timeouts, typed Quest diagnostics, and
schema/kind/payload mismatches fail loud; Lore never falls back or dual-writes.

Quest has no Backlog task-file path, milestone, reporter, or timestamps in this
contract, so storage-only fields use backend-neutral values. Native Quest
priority, ordinal, parent, dependencies, criteria, documentation, comments,
labels, aliases, and source provenance are mapped into Lore's neutral task
detail; an alias may resolve to a different canonical `T-N` identity only when
Quest returns that requested alias explicitly. A
requested create-time milestone or noncanonical caller-supplied ID fails before
Lore spawns Quest rather than being discarded or sent to a mutating command.
Quest criteria carry text but no
checked bit, so Lore maps their text with `checked: false`; plan and
implementation-note line arrays fold into newline-delimited Lore fields.

Legacy migration is explicit: initialize Quest, then run `lore init --tracker
quest --migrate-backlog`; pin instead with `lore init --tracker backlog`. Lore
consumes Quest's public `preview` / `apply` / `status` / `rollback` lifecycle.
It records the reviewed digest, source fingerprint, and mappings in a
Lore-owned pending receipt before actorful `apply`; an interrupted rerun resumes
with `status --digest` instead of creating a second preview. Lore persists
Quest as the backend only after a schema-1 `migration.backlog.receipt` reports
`state: "applied"` with the reviewed digest, fingerprint, and mappings, then
clears the pending record. Quest assigns canonical `T-N` identities while
preserving ordinary `LCLI-*`, `TASK-*`, and dotted Backlog IDs as stable
aliases, so existing Story coupling does not require a reference rewrite.
`lore backlog adopt` migrates
knowledge records and is not a tracker-task migration command.

---

## Jira Cloud via jira-cli

The Jira backend is a subprocess adapter over the separately installed
`@salient-ai/jira-cli`; it is not a second HTTP client. Before Lore uses this
backend, install the `jira` command and run `jira init --yes` from the project
root. jira-cli remains the sole owner of the Jira URL, account email, API token,
Basic authentication, request deadline, REST v3 calls, and Markdown/ADF
conversion. Lore neither reads nor persists those credentials. A missing CLI,
missing profile, authentication failure, timeout, or rate-limit response becomes
a typed `LoreError`; Lore never retries a jira-cli command silently.

Only non-secret routing and mapping settings live in `.lore/config.toml`:

```toml
[tracker]
backend = "jira"

[tracker.jira]
profile = "work" # optional; omit for the jira-cli default profile
project = "JT"
board = "42" # optional, reserved for Jira-aware workflows
issue_type = "Task"
default_labels = ["lore"]
status_flow = ["To Do", "In Progress", "Done"]
```

Run `lore init --tracker jira` to write the selection without prompts, or choose
Jira in a bare interactive `lore init` wizard. `quest`, `backlog`, and `jira`
are accepted. Legacy zero-config bundles are offered only an explicit Quest
migration or Backlog pin. Unknown keys remain tolerated for forward compatibility.

`probe()` runs `jira --version`, `jira project get`, and
`jira metadata priorities`. The project response is the issue-type vocabulary;
the priority response is the priority vocabulary. The configured create type
and every type or priority read from an issue must belong to those live sets.
Vocabulary mismatches are validation errors, never guesses.

Reads use jira-cli JSON envelopes: `issue search` for summaries, `issue get` for
detail, and `comment list` for Markdown comments. Writes use `issue create`,
`issue update`, and `issue transition`. Lore passes Markdown to jira-cli and
receives Markdown back; jira-cli owns conversion to and from ADF. Lore appends a
versioned `LORE-JIRA-METADATA-BEGIN` / `LORE-JIRA-METADATA-END` JSON code-block
region to descriptions so fields with no Jira counterpart round-trip exactly.
Malformed or unsupported managed metadata is drift, not content to ignore.

Status writes are graph-constrained. Lore first reads `issue transitions`,
requires an exact configured destination, then transitions by ID. If the target
is unreachable, the adapter returns a `conflict` `LoreError` whose hint names
`jira issue transitions <key>`. Field updates and transitions are separate
jira-cli commands, so a workflow race can still reject the transition after a
field update; that asymmetry is surfaced rather than hidden.

### Jira field classification

Every `BacklogTask` / `BacklogTaskDetail` field has one primary classification:

| Lore field | Class | Jira representation and loss boundary |
|---|---|---|
| `id` | native | issue `key` |
| `title` | native | `summary` |
| `status` | native | `status.name`; writes require an available transition |
| `priority` | native | `priority.name`, validated against `jira metadata priorities` |
| `ordinal` | lost | always `null`; Agile Rank is outside this adapter |
| `assignees` | coerced | one Jira assignee becomes a one-element array; Jira cannot preserve additional assignees |
| `labels` | native | Jira labels; incremental Lore patches use read-modify-write because jira-cli replaces the array |
| `milestone` | folded | Lore-created values live in managed metadata; the first Jira fix version is a read-only fallback |
| `parentTaskId` | native | `parent.key` |
| `file` | lost | always `null`; Jira has no Backlog task file |
| `reporter` | native | reporter display name, falling back to account ID |
| `createdAt` | native | `created` |
| `updatedAt` | native | `updated` |
| `dependencies` | coerced | linked issue keys; Jira link type and direction are not representable in the Lore array |
| `references` | folded | managed description metadata |
| `documentation` | folded | managed description metadata; `editTask.doc` replaces the array |
| `modifiedFiles` | lost | always empty; Jira has no native modified-files list |
| `subtasks` | native | subtask key and summary |
| `acceptanceCriteria` | folded | managed description metadata |
| `definitionOfDone` | folded | managed description metadata |
| `description` | native | Jira description Markdown via jira-cli; an exact authored copy is retained in managed metadata |
| `implementationPlan` | folded | managed description metadata |
| `implementationNotes` | folded | managed description metadata |
| `finalSummary` | folded | managed description metadata |
| `comments` | native | `jira comment list`, converted back to Markdown by jira-cli |

A `lost` field is returned only as the neutral contract value (`null` or an
empty array). A `coerced` field documents the discarded dimension explicitly.
Folded fields are Lore-owned data inside the managed description region, not
custom Jira fields and not hidden credentials.

---

## 3. Status and field mapping

### 3.1 Read statuses from config — never hardcode

The status set is **config-driven** (default `["To Do","In Progress","Done"]`,
`default_status` fallback `To Do`). `lore` reads the project's status flow from
config (`backlog config get statuses` / `backlog/config.yml` `statuses:`) and
must **not** hardcode the three defaults — custom flows (added `Review`,
`Testing`, `Blocked`, …) are supported.

### 3.2 Reconciliation rule

`lore` maps each linked task's status to a `Story` `status` contribution
(see [lore design spec §reconciliation](../specs/lore-design.md)):

- **`done`** iff every linked task is in the **terminal** status (`Done`, or the
  last status in the configured flow).
- **`in-progress`** if any task is in a non-first, non-terminal status
  (`In Progress`, `Review`, `Testing`, `Blocked`, …).
- **`todo`** if tasks exist but none have started.
- No tasks → `status` left as authored (narrative-only doc).

The terminal/active classification is a **config knob** so non-default flows do
not silently map wrong.

### 3.3 Status icons are presentation, not data

In stock human-readable output the `task view` Status line carries a leading
Unicode icon (`○ To Do`, `◒ In Progress`, `✔ Done`, `◆ Review`, `▣ Testing`,
`● Blocked`; **custom/unknown statuses default to `○`**). The `task list` group
header carries **no** icon. With the `--json` read path, `lore` consumes the
**raw status string** from the JSON `status` field and never parses icons. The
icon mapping is documented here only so the operator understands that icons are
display sugar, not a status key, and that icon-based status inference is
impossible for custom statuses.

### 3.4 Field mapping (JSON read → lore use)

| JSON field | lore use |
|---|---|
| `status` | reconciliation (§3.2) |
| `labels` | detect `doc:*` back-references |
| `documentation`, `references` | display |
| `dependencies` | graph / sequencing |
| `milestone` | ID only (`m-0`); join `milestone list` for a title |
| `assignees` | `@`-prefixed display |
| `file` / `path` | build the `backlog/tasks/<file>.md` link (basename) |

---

## 4. Safety and git discipline

These constraints are renderer-independent and **mandatory**. See the
[Backlog safety ADR](../adr/0012-backlog-coexistence-git-ownership.md).

1. **`auto_commit` MUST be `false`; `lore` is the sole committer of `backlog/`.**
   With `auto_commit: false`, no Backlog interface stages or commits — new tasks
   land untracked, edits unstaged. `lore` `git add`s and commits Backlog's task
   files itself as part of sync. **`lore` asserts `backlog config get autoCommit
   === "false"` at startup and refuses/warns otherwise** — because if it were
   `true`, mutating ops run `git add backlog/` over the **whole directory**,
   sweeping uncommitted `lore` doc edits (and `.locks/`) into Backlog's commit.

2. **Set `check_active_branches: false` and `remote_operations: false`** in
   managed projects so Backlog's reads collapse to on-disk truth and never fetch
   a remote (see [§1.3](#13-reads-are-current-branch--on-disk-truth)).

3. **Gitignore `backlog/.locks/`.** Backlog does not auto-ignore it; transient
   lockfiles must stay out of commits.

4. **Concurrency: single-writer discipline.** Only **ID allocation** is
   lock-protected (`proper-lockfile` at `backlog/.locks/create`; 30s wait, 10s
   stale recovery). `task edit`/`update`/`archive`/`complete` are **unlocked**
   (atomic write+rename, last-write-wins). `lore` routes all task writes through
   the one CLI writer and serializes its own edits per task. A crashed Backlog
   `create` can hold the lock up to ~10s before stale recovery — treat a
   transient lock error as **retryable**, not fatal.

5. **Link by ID; resolve the path fresh each sync.** `archive`/`complete`/
   `promote`/`demote` relocate files across
   `backlog/{tasks,archive/tasks,completed,drafts}/` while preserving the ID.
   `lore` stores `task-N` IDs and re-reads the on-disk path from the JSON `file`
   field on every sync. Tolerate a linked file being absent on the current
   branch (cross-branch-only).

---

## 5. Capability probe (fail-loud)

Run once at startup, cached in `.lore/cache/`. See the
[capability-probe ADR](../adr/0002-backlog-integration-json-only.md).

```
1. spawn("backlog", "--version")          → expect exit 0; stdout is bare semver + newline
                                             (e.g. "1.47.1\n" — the exact numeral depends on
                                             which build is on PATH; the invariant is the format)
2. parse version, match /^\d+\.\d+\.\d+/   → no "v" prefix, no name, no extra tokens
3. semver-compare ver >= MIN_BACKLOG       → a non-discriminating sanity floor (see below)
4. spawn("backlog", "task", "list", "--json")
   → assert exit 0 AND stdout parses to {schemaVersion, kind, tasks} with the expected
     numeric schemaVersion 1 and kind:"task-list" (hyphenated — upstream's real value,
     PR #790; see backlog-json-schema.md §8)
```

- `backlog --version` (and `-v`) prints **bare semver + newline** to stdout,
  exit 0, and works outside any project. This is Commander's default
  `.version()` behavior (`src/cli.ts` line 661, `v1.48.0`), format-invariant
  across versions; a `v1.47.1` binary was observed to print exactly the bytes
  `31 2e 34 37 2e 31 0a` (`"1.47.1\n"`) — an example of the format, not a
  claim about what the currently-pinned build's `--version` prints.
- The **min-version floor** (`MIN_BACKLOG_VERSION`, `1.49.0` since LCLI-253)
  does **not** by itself distinguish a `--json`-capable binary from one without — a
  pre-`--json` release can still report a version at or above it. Step 4's
  envelope parse is the real discriminator: a binary without `--json` support
  rejects the option and step 4 fails its parse. See the
  [Backlog --json patch runbook](../runbooks/backlog-json-patch.md).
- **The probe never calls `task view`** — only `--version` and `task list --json`
  (existence/missing-task handling is `viewTask`'s own concern; see
  [§2.2](#22-existence-checks--task-views-exit-code-is-meaningful)).
- **Graceful failure modes:**
  - `backlog` absent from PATH (spawn `ENOENT`) → clear install hint, exit 3.
  - Version below floor / `--json` probe fails → refuse the coupling commands
    (`link`/`unlink`/`tasks`/`orphans`/`sync`/`check`) with a "needs a
    `--json`-capable Backlog.md" message (exit 6), but **allow pure-OKF
    commands** (`init`/`new`/`validate`/`graph`).

The `--json` envelope is an **additive-only versioned contract**
([backlog-json-schema.md](backlog-json-schema.md)); a bump in `schemaVersion`
that `lore` does not recognize fails the probe rather than mis-reads.

> **Migration status: complete (LCLI-53 probe, LCLI-54 full adapter).** Both
> the probe (step 4 above) and the full read adapter (`EnvelopeSchema`,
> `parseEnvelope`, `listTasks`/`viewTask`/`searchTasks`) now target upstream's
> real envelope — numeric `schemaVersion: 1`, hyphenated `kind`s
> (`task-list`/`task-view`/`search`), and a per-command payload key
> (`tasks`/`task`/`results`), not the fork's uniform `{schemaVersion: "1",
> kind, data}` shape. See
> [backlog-json-schema.md §8](backlog-json-schema.md#8-migration-history-complete)
> for the full history. `v1.49.0`, published 2026-08-02, is the first tagged
> `MrLesk/Backlog.md` release containing the PR #790 commit
> (`22a091b570d44c4f302ca47e7fd36fa28ad8bcb0`); LCLI-253 raised
> `MIN_BACKLOG_VERSION` to `1.49.0` accordingly. It remains the same
> non-discriminating sanity check described above — a version at or above the
> floor still isn't proof of `--json` support, step 4's envelope parse is —
> but it is now a real semver floor rather than a placeholder with no tagged
> release to point at. Running `lore`'s coupling commands now just needs a
> published `backlog.md` at or past `1.49.0` on PATH (`npm install -g
> backlog.md`), not the interim manually-built pinned-commit binary (see the
> [patch runbook §8](../runbooks/backlog-json-patch.md)). `lore` still carries
> **no** `package.json` dependency on it — that remains a deliberate choice
> (LCLI-53 decision), not something the release unblocked.

---

## Appendix: Rejected fallback — why lore does not parse `--plain`

`lore` deliberately has **no `--plain` text-parser fallback**. Stock Backlog.md
emits no JSON; its `--plain` output is **presentation code**
(`src/formatters/task-plain-text.ts`), not a versioned schema, and it can change
between releases. A text parser would have to absorb every one of these traps,
originally confirmed at v1.47.1 and re-checked unchanged at v1.48.0 (this
document's current pin, see above):

- **ID-case mismatch** — display `TASK-1` vs file `task-1`; the link target must
  come from the `File:` line, never the display ID.
- **Titles containing ` - `** — the `<id> - <title>` split must be on the
  **first** ` - ` only.
- **Status icons** — present in `task view` (`✔◒●○◆▣`), absent in `task list`
  (group header); custom statuses all collapse to `○`, so status is
  un-inferable from the icon.
- **`board --plain` does not exist** (errors `unknown option '--plain'`);
  `milestone list --plain` is a no-op.
- **Optional header lines** — most `Key: value` lines are conditionally omitted
  (only `Status:` and `Created:` are always present), so a parser cannot assume
  any given line exists.

Maintaining a parser against unstable presentation output — with golden-snapshot
fixtures re-captured on every Backlog release — is exactly the fragility `lore`
is built to avoid. Instead `lore` requires a **`--json`-capable build**
(currently a manually-built upstream binary pinned at a specific commit; see
the [patch runbook §8](../runbooks/backlog-json-patch.md#8-migrate-to-upstream-on-release-and-bump-the-floor))
and a fail-loud capability probe (§5). The cost is the pinned-build dependency;
the benefit is a stable, parseable, versioned contract and a deterministic,
agent-safe core. This trade-off is recorded in the
[read-path ADR](../adr/0002-backlog-integration-json-only.md).

The verified facts about stock `--plain`/CLI behavior above are retained in this
contract not as a fallback but because they are **renderer-independent operational
truths** — exit codes, git/locking behavior, flag multiplicity, ID casing, and
the `Created task <ID>` capture line all hold regardless of the read format.
