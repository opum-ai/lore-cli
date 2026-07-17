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
(`link`, `unlink`, `tasks`, `orphans`, `sync`, `check`). It is pinned to
**Backlog.md v1.47.1** as the tested floor.

Two facts shape everything below:

1. **Reads are JSON-only.** `lore` reads structured data from a `--json` flag
   that **stock Backlog.md does not have**. `lore` consumes a forked,
   `--json`-capable build (`jeremy-newhouse/Backlog.md`); see the
   [Backlog --json patch runbook](../runbooks/backlog-json-patch.md) and the
   [Backlog JSON schema](backlog-json-schema.md). There is **no `--plain`
   text-parser fallback** — that is a deliberate rejection (see
   [appendix](#appendix-rejected-fallback--why-lore-does-not-parse---plain)).
2. **Writes go through the CLI, never file writes.** `lore` never writes
   `backlog/tasks/*.md` directly. All task mutations run `backlog task create` /
   `backlog task edit`. `lore` is the **sole git committer** for `backlog/`.

The shape and field names of the JSON envelope are specified in
[backlog-json-schema.md](backlog-json-schema.md). This document is the
*operational* contract — how to call, what to trust, what to never do. The
broader design rationale lives in the [lore design spec](../specs/lore-design.md)
and the relevant ADRs (linked inline).

> **Migration notice (2026-07-17, LORE-5).** `lore` is adopting upstream's own,
> independently-shipped `--json` contract (PR #790 / BACK-545) instead of this
> fork's — see [backlog-json-schema.md §8](backlog-json-schema.md#8-migration-target--upstream-independent-contract-adopted).
> Everything below still describes what's shipped in code **today**; §2.2 and
> §5 each have a callout marking the specific fact that changes once `lore`
> migrates.

---

## 1. Read path (JSON-only)

All reads request the canonical envelope from the forked binary:

```json
{ "schemaVersion": "1", "kind": "<task|taskList|searchResult>", "data": <payload> }
```

`schemaVersion` is the **string** `"1"` and `kind` is one of `"task"`,
`"taskList"`, `"searchResult"` (camelCase) — the exact values the fork emits and
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
| Fuzzy / label search | `backlog search "<q>" --json`, `backlog task list --json --labels "doc:<id>"` | Used by `orphans` / `unlink` to find tasks owning a doc. |
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

### 2.2 Existence checks — use edit/list, never view

**`task view <missing>` exits 0** (it prints `Task X not found.` to stderr but
returns success). Never use `task view`'s exit code to test existence — in
probing, `lore link`, or anywhere.

- `task edit <missing>` exits **1**.
- `task list` / a successful `task view --json` parse confirm existence.

Use `edit` or `list` for existence; treat `view`'s exit code as meaningless.

> **This flips on migration.** Upstream's PR #790 makes `task view <missing>`
> (and the bare `task <missing>` shortcut) exit **1 unconditionally**, in every
> output mode — matching `task archive`'s convention. Once `lore` consumes
> upstream's build, `view`'s exit code becomes meaningful and the adapter's
> `viewTask` (which today treats *empty stdout* as the "missing" signal) should
> be rewritten to check the exit code instead. See
> [backlog-json-schema.md §8](backlog-json-schema.md#8-migration-target--upstream-independent-contract-adopted).

### 2.3 The doc back-reference — a queryable label, plus --doc for display

`lore link` records the doc→task back-reference two ways:

```
backlog task edit <id> --add-label "doc:<conceptId>" --doc "<docpath>"
```

- **`--add-label "doc:<conceptId>"` is the queryable index.**
  `backlog task list --json --labels "doc:<conceptId>"` does an exact AND-match
  and returns the tagged tasks — this is what `lore orphans` / `lore unlink`
  rely on.
- **`--doc "<docpath>"` is display-only.** It writes the `documentation:`
  frontmatter field, visible in `task view`, but is **not** searchable or
  list-filterable. It is the readable cross-reference, not the index.
- A `conceptId` is a path (`doc:stories/bulk-archive`) — no commas, so the
  multiplicity rules in [§2.4](#24-flag-multiplicity-rules) are not triggered.

### 2.4 Flag multiplicity rules

Backlog's flags split into two families. Getting this wrong silently drops data.

**Single-value, last-wins (NO accumulator) — comma-separate to pass multiples:**
`--labels`/`-l`, `--label`, `--add-label`, `--remove-label`, `--assignee`/`-a`.
Repeating the flag keeps **only the last value** (`-l A -l B` → `Labels: B`). To
set multiple, comma-separate inside **one** flag (`-l "A,B"`, `-a "@x,@y"`); the
value is comma-split and de-duped.

**Accumulator (repeats AND commas both work):** `--doc`, `--ref`, `--dep` /
`--depends-on`, `--modified-file`.

Practical consequence for `lore`:

- `lore link` adds a **single** `doc:<id>` label via `--add-label` (one value,
  no comma) — unaffected by either rule.
- `--add-label` / `--remove-label` are the **incremental** label ops
  (case-insensitive de-dup, preserves casing). Plain `--label`/`-l` on **edit**
  is **SET/REPLACE** — it wipes all existing labels. `lore` uses
  `--add-label`/`--remove-label` for incremental changes, never bare `--label`.
- `--doc`/`--ref` on edit are also SET/REPLACE (the accumulator replaces the
  whole array), and **cannot be cleared** via an empty value (a `length > 0`
  guard ignores `--doc ""`). So `lore unlink` must re-pass the full desired
  `--doc` set and remove the label with `--remove-label`.

### 2.5 Edit idempotency and what Backlog persists

- **Edit is idempotent.** An edit that changes nothing does **not** rewrite the
  file or bump `updated_date`, yet still exits 0 and prints `Updated task <ID>`.
  `lore sync`/reconciliation may issue edits unconditionally without churning
  `updated_date`.
- Any **effective** change rewrites `updated_date` to **minute precision** UTC
  (`YYYY-MM-DD HH:mm`). Same-minute collisions are possible — never treat
  `updated_date` as a monotonic ordering signal.
- **Backlog drops unknown frontmatter keys on any mutating edit.** The
  serializer writes a fixed key set. **`lore` must never store bespoke metadata
  as task frontmatter.** Anything `lore` needs on a task lives in a
  Backlog-recognized field: `labels` (the `doc:` back-ref), `documentation`,
  `references`, `dependencies`, or `milestone`. AC/DoD `#n` indices are
  **renumbered display positions**, not stable keys — re-resolve after each
  write or key on text.

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
1. spawn("backlog", "--version")          → expect exit 0; stdout is bare semver "1.47.1\n"
2. parse version, match /^\d+\.\d+\.\d+/   → no "v" prefix, no name, no extra tokens
3. semver-compare ver >= MIN_BACKLOG       → MIN_BACKLOG = the --json-capable fork floor
4. spawn("backlog", "task", "list", "--json")
   → assert exit 0 AND stdout parses to {schemaVersion, kind, data} with the expected
     schemaVersion "1" and kind:"taskList" (camelCase — the value the fork emits)
```

- `backlog --version` (and `-v`) prints **bare semver + newline** to stdout,
  exit 0, and works outside any project (verified bytes `31 2e 34 37 2e 31 0a`).
- The **min-version floor** is the `--json`-capable fork — stock v1.47.1 lacks
  `--json` and the dry `task list --json` probe in step 4 will fail its parse,
  which is the intended signal. The probe is what enforces "you must run the
  fork." See the [Backlog --json patch runbook](../runbooks/backlog-json-patch.md).
- **Never use `task view`'s exit code** in the probe or anywhere (it exits 0 on
  missing — [§2.2](#22-existence-checks--use-editlist-never-view)).
- **Graceful failure modes:**
  - `backlog` absent from PATH (spawn `ENOENT`) → clear install hint, exit 3.
  - Version below floor / `--json` probe fails → refuse the coupling commands
    (`link`/`unlink`/`tasks`/`orphans`/`sync`/`check`) with a "needs a
    `--json`-capable Backlog.md" message (exit 6), but **allow pure-OKF
    commands** (`init`/`new`/`validate`/`graph`).

The `--json` envelope is an **additive-only versioned contract**
([backlog-json-schema.md](backlog-json-schema.md)); a bump in `schemaVersion`
that `lore` does not recognize fails the probe rather than mis-reads.

> **This probe targets the fork; it will be rewritten for the migration.**
> Step 3's `MIN_BACKLOG` and step 4's `kind:"taskList"` (camelCase) assertion
> are specific to this fork's contract. Once `lore` adopts upstream's build
> (see [backlog-json-schema.md §8](backlog-json-schema.md#8-migration-target--upstream-independent-contract-adopted)),
> there is no semver floor to compare against yet — the interim dependency is
> pinned to a specific upstream commit (at or past the PR #790 merge,
> `22a091b570d44c4f302ca47e7fd36fa28ad8bcb0`), not a version range — and step 4
> must assert upstream's real envelope (`kind: "task-list"`, a `tasks` array,
> not a `data` key). The probe converts to a normal semver floor once a tagged
> Backlog.md release includes that commit.

---

## Appendix: Rejected fallback — why lore does not parse `--plain`

`lore` deliberately has **no `--plain` text-parser fallback**. Stock Backlog.md
emits no JSON; its `--plain` output is **presentation code**
(`src/formatters/task-plain-text.ts`), not a versioned schema, and it can change
between releases. A text parser would have to absorb every one of these traps,
all confirmed in v1.47.1:

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
is built to avoid. Instead `lore` requires a **`--json`-capable fork**
([runbook](../runbooks/backlog-json-patch.md)) and a fail-loud capability probe
(§5). The cost is the fork dependency; the benefit is a stable, parseable,
versioned contract and a deterministic, agent-safe core. This trade-off is
recorded in the [read-path ADR](../adr/0002-backlog-integration-json-only.md).

The verified facts about stock `--plain`/CLI behavior above are retained in this
contract not as a fallback but because they are **renderer-independent operational
truths** — exit codes, git/locking behavior, flag multiplicity, ID casing, and
the `Created task <ID>` capture line all hold regardless of the read format.
