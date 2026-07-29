---
# yaml-language-server: $schema=../../.lore/schemas/Reference.schema.json
type: Reference
title: "Backlog.md --json schema (the envelope lore consumes)"
description: The canonical, per-command JSON envelopes and payload shapes emitted by upstream (MrLesk/Backlog.md) `--json` flag, which lore's adapter JSON.parses. Documents the task-list / task-view / search shapes, field-by-field, with the durability and portability caveats lore must respect.
tags: [reference, backlog, json, schema, contract, adapter]
summary: The exact JSON contract lore reads from upstream Backlog.md's --json flag — per-command envelopes (task-list/task-view/search) with their own payload keys (tasks/task/results).
timestamp: 2026-06-21T00:00:00Z
---

# Backlog.md `--json` schema

This is the canonical contract `lore` consumes from upstream, `--json`-capable
Backlog.md. It specifies the **envelope** every `--json` command prints and the
**per-`kind` payload shapes** (`task-list`, `task-view`, `search`), field by
field, with the durability and portability caveats the adapter must honor.

The decision to integrate JSON-only (no `--plain` text-parser fallback) is
recorded in
[ADR-0002: Backlog.md integration — JSON-only](../adr/0002-backlog-integration-json-only.md).
The commands, flags, exit codes, and write-path conventions (e.g. capturing the
new ID from the `Created task <ID>` line) live in the companion
[Backlog.md CLI contract](backlog-cli-contract.md). This page is the data shape
only.

> **Provenance.** Stock Backlog.md — at `v1.47.1` **or** the current `v1.48.0`
> tag — has **no `--json` flag**. MrLesk's
> team shipped their own implementation independently —
> [PR #790](https://github.com/MrLesk/Backlog.md/pull/790), "BACK-545 - Add
> stable JSON output to read commands", merged 2026-07-16 to `MrLesk/Backlog.md`
> `main` at commit `22a091b570d44c4f302ca47e7fd36fa28ad8bcb0` — and `lore`
> adopted that contract (LCLI-5) rather than upstreaming an earlier,
> differently-shaped fork of its own (`jeremy-newhouse/Backlog.md`; see
> [§8](#8-migration-history-complete) for that history). As of this writing
> PR #790 is merged but **not yet in a tagged release** (the latest tag,
> v1.48.0, predates the merge) — see the
> [patch runbook §8](../runbooks/backlog-json-patch.md#8-migrate-to-upstream-on-release-and-bump-the-floor)
> for the interim pinned-commit consumption plan. The shape below is upstream's
> curated serializer output (`src/formatters/json-output.ts`), not a raw
> `JSON.stringify(task)` — it adds no new fields and no storage changes.

---

## 1. The envelope

Each `--json` command prints **exactly one** JSON object to stdout, pretty-printed
(`JSON.stringify(value, null, 2)`) with a trailing newline. Unlike a uniform
`{schemaVersion, kind, data}` shape, **each command names its own payload key**
— there is no shared `data` key:

```json
{ "schemaVersion": 1, "kind": "task-list", "tasks": [ ] }
{ "schemaVersion": 1, "kind": "task-view", "task": { } }
{ "schemaVersion": 1, "kind": "search", "results": [ ] }
```

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | **number** | Currently `1`. **Additive-only** contract: "Version 1 may gain backward-compatible fields, but removing, renaming, retyping, or changing documented field semantics requires a new `schemaVersion`" (CLI-INSTRUCTIONS.md). The adapter pins a floor and tolerates unknown extra keys. |
| `kind` | string | Discriminates the payload shape and its key: `"task-list"`, `"task-view"`, or `"search"` (hyphenated). |
| payload | object \| array | Named per command — `tasks` (array), `task` (object), or `results` (array) — shaped per `kind` (§3–§5). |

**Stream discipline.** The envelope is the **only** thing on stdout — a single
parseable JSON object, no banner, no perf line, no trailing log. **Errors leave
stdout empty**, write a concise message to stderr, and exit nonzero
(CLI-INSTRUCTIONS.md) — there is no partial/best-effort envelope. `lore` reads
stdout, `JSON.parse`s it, asserts `schemaVersion` is at-or-above its floor and
`kind` matches the command it ran, then maps the named payload into typed
objects. A `kind` or `schemaVersion` mismatch is a fail-loud error (exit `6`),
never a best-effort parse — there is no text fallback to degrade to.

**Command → `kind` / payload key mapping.**

| Command | `kind` | Payload key | Payload shape | Section |
|---|---|---|---|---|
| `backlog task list --json` | `task-list` | `tasks` | array of task summaries | [§4](#4-kind-task-list) |
| `backlog task view <id> --json` / bare `task <id> --json` | `task-view` | `task` | single task object | [§3](#3-kind-task-view) |
| `backlog search [query] --json` | `search` | `results` | array of type-tagged hits (no score, §5) | [§5](#5-kind-search) |

Writes (`task create`, `task edit`) are **not** part of the `--json` surface —
`lore` does not request `--json` on them; it captures the new ID from the
`Created task <ID>` stdout line per the [CLI contract](backlog-cli-contract.md).

---

## 2. Field conventions (apply to every payload)

These conventions hold across all three `kind`s. They encode hard-won facts
about Backlog.md's in-memory model; getting them wrong silently corrupts the
coupling.

- **`id` is display-cased.** Backlog.md exposes the *display* identity
  (`"LCLI-33"`, uppercase prefix), which differs from the lowercase on-disk
  filename (`lore-33 - Title.md`). **Never reconstruct a filename from `id`** —
  prefix casing and zero-padding are configurable. Use `path` (task-view only;
  §3, §6) for the on-disk location and `id` for identity/links.
- **`status` is the raw value, no icon.** The text formatter wraps status in a
  presentation icon; the JSON serializer emits the raw string (`"To Do"`,
  `"In Progress"`, `"Done"`, or any custom status configured in
  `backlog/config.yml`). Treat `status` as an opaque configured label, not a
  closed enum.
- **`priority` and `type` are open, config-driven labels, not a closed enum.**
  Both come from `backlog/config.yml` (`priorities:` / `types:`) — a free
  string or `null`, never a fixed `"high"|"medium"|"low"` set. `type` is
  Backlog's *semantic task type* (e.g. `bug`, `feature`) — an unrelated concept
  from the envelope's `kind`.
- **Dates are `createdAt`/`updatedAt` strings, not timestamps.** Values are
  normalized by `normalizePublicDate`: a pure `"YYYY-MM-DD"` source stays a bare
  date; a source with a time component becomes RFC 3339 UTC
  (`"YYYY-MM-DDTHH:mm:ssZ"`). A field is `null`, never absent, when the
  underlying task carries no date. Comment dates (`createdAt` on a comment) use
  the same normalization.
- **List fields are always arrays** (possibly empty), never `null`:
  `assignees`, `labels`, `dependencies`, `references`, `documentation`,
  `modifiedFiles`, `subtasks`, `acceptanceCriteria`, `definitionOfDone`,
  `comments`. Scalar-optional fields (`type`, `priority`, `milestone`,
  `parentTaskId`, `reporter`, `updatedAt`, `path`, …) are `null` when absent.
- **Unknown keys are allowed.** Per the additive-only contract (and OKF's own
  tolerance ethos), the adapter ignores fields it does not recognize rather than
  failing on them.
- **Internal fields are never exposed.** "Internal fields, absolute paths, raw
  Markdown source objects, branch metadata, and search implementation details
  are not exposed" (CLI-INSTRUCTIONS.md) — no `rawContent`, `lastModified`,
  `source`, `branch`, `onStatusChange`, or `parentTaskTitle` field exists in
  this contract at all (contrast the now-superseded fork shape, [§8](#8-migration-history-complete)).

---

## 3. `kind: "task-view"`

`task` is a single task object (output of `backlog task view <id> --json` or the
bare `task <id> --json` shortcut). This is the richest shape; the
[`task-list`](#4-kind-task-list) summary is a subset of its compact fields.

```jsonc
{
  "schemaVersion": 1,
  "kind": "task-view",
  "task": {
    "id": "LCLI-33",                  // display-cased identity; do NOT derive filename
    "title": "lore query (full-text + frontmatter filters)",
    "status": "Done",                 // raw configured status, NO icon
    "type": null,                     // semantic task type (config `types:`), or null
    "priority": "medium",             // config `priorities:` label, or null — not a closed set
    "assignees": ["@jeremy"],         // always an array (may be empty)
    "reporter": null,                 // or an assignee-shaped string
    "labels": ["cmd"],                // array; see the doc: back-reference note below
    "milestone": "m-4",               // or null
    "parentTaskId": null,             // or a display-cased id
    "ordinal": 33000,                 // sort ordinal within status, or null

    "createdAt": "2026-06-21T06:26:00Z",  // RFC 3339 UTC, or bare "YYYY-MM-DD"
    "updatedAt": "2026-06-29T17:28:00Z",  // string, or null

    "path": "backlog/tasks/lore-33 - lore-query-full-text-frontmatter-filters.md", // project-relative; null on a not-yet-written task
    "description": "In-memory full-text (BM25-style) + frontmatter-field filters…",
    "dependencies": ["LCLI-16"],       // array of display-cased ids
    "references": [],                  // array of free-form refs
    "documentation": ["docs/adr/0015-lightweight-retrieval-no-vectors.md"], // array
    "modifiedFiles": [],               // array
    "subtasks": [],                    // always an array (may be empty)

    "acceptanceCriteria": [            // array; index is NON-durable (see §6)
      { "index": 1, "text": "Filter by type/tag/status/any field", "checked": true },
      { "index": 2, "text": "Bounded output with a narrow-it hint", "checked": true }
    ],
    "definitionOfDone": [],            // array; index is NON-durable (see §6)

    "implementationPlan": "1. core/query.ts: …",  // or null
    "implementationNotes": "Implemented on feat/lore-33-query…", // or null
    "finalSummary": null,              // or a string

    "comments": [
      { "index": 1, "body": "Started.", "createdAt": "2026-06-20T00:00:00Z", "author": "@jeremy" }
    ]
  }
}
```

### 3.1 Body sections vs. structured fields

A Backlog.md task `.md` file has free-form body sections (`## Description`,
`## Acceptance Criteria`, `## Definition of Done`, `## Implementation Plan`,
`## Implementation Notes`, comments). The serializer surfaces these as the
**structured** fields above (`description`, `acceptanceCriteria[]`,
`definitionOfDone[]`, `implementationPlan`, `implementationNotes`, `comments[]`,
`finalSummary`) so `lore` never re-parses markdown headings.

- `acceptanceCriteria` and `definitionOfDone` are arrays of
  `{ index, text, checked }`. `text` is the criterion's plain text; `checked` is
  the checkbox state. See the durability caveat in [§6](#6-field-caveats).
- `comments` are `{ index, body, createdAt, author }`. `author` may be `null`.
- The free-form prose fields (`description`, `implementationPlan`,
  `implementationNotes`, `finalSummary`) are strings (markdown) or `null`.

### 3.2 Field reference (`task-view`'s `task`)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Display-cased. Identity, not filename. |
| `title` | string | |
| `status` | string | Raw configured status, no icon. |
| `type` | string \| null | Semantic task type (config `types:`), open set. |
| `priority` | string \| null | Config `priorities:` label, open set. |
| `assignees` | string[] | Array. |
| `reporter` | string \| null | |
| `labels` | string[] | Includes the `doc:<conceptId>` back-reference label (see below). |
| `milestone` | string \| null | |
| `parentTaskId` | string \| null | |
| `ordinal` | number \| null | Position within status. |
| `createdAt` | string \| null | RFC 3339 UTC or bare `YYYY-MM-DD`. |
| `updatedAt` | string \| null | Same format as `createdAt`. |
| `path` | string \| null | **Project-relative** (`backlog/tasks/…`); `null` on a freshly created, not-yet-written task. Present only on this `task-view` shape — never on a `task-list`/`search` summary (§4, §6). |
| `description` | string \| null | Markdown. |
| `dependencies` | string[] | Display-cased ids. |
| `references` | string[] | Free-form. |
| `documentation` | string[] | Free-form. |
| `modifiedFiles` | string[] | |
| `subtasks` | `{id,title}[]` | Always an array (may be empty). |
| `acceptanceCriteria` | `{index,text,checked}[]` | `index` **non-durable** ([§6](#6-field-caveats)). |
| `definitionOfDone` | `{index,text,checked}[]` | `index` **non-durable**. |
| `implementationPlan` | string \| null | Markdown. |
| `implementationNotes` | string \| null | Markdown. |
| `comments` | `{index,body,createdAt,author}[]` | `author` may be `null`. |
| `finalSummary` | string \| null | Markdown. |

> **The `doc:<conceptId>` label is how `lore` finds the doc → task
> back-reference.** Per ADR-0002, `lore` never stores its own frontmatter keys on
> a task (Backlog.md drops unknown keys on edit). Instead it sets a *queryable*
> label `doc:stories/bulk-archive-orders` via `task edit --add-label`. That
> label arrives here in `labels[]`, which `lore link` reads directly
> (`hasLabel`) to check whether a task is already linked. `lore orphans` reads
> the same-named `labels[]` field, but off the `task-list` summary (§4) — it
> never calls `task view` per task. Treat the `doc:` prefix as the contract in
> either shape.

---

## 4. `kind: "task-list"`

`tasks` is an **array of task summaries** (output of `backlog task list --json`).
The summary is the **compact field set** — enough to render listings and
reconcile status without a `view` per task. It carries **no path at all**
(unlike the task-view shape) and omits the heavy body fields
(`acceptanceCriteria`, `description`, `comments`, `implementationPlan`, …).

```jsonc
{
  "schemaVersion": 1,
  "kind": "task-list",
  "tasks": [
    {
      "id": "LCLI-1",
      "title": "Fork Backlog.md and create the --json tracking task",
      "status": "Done",         // raw, no icon
      "type": null,             // or a config `types:` label
      "priority": "high",       // or null — open set
      "assignees": ["@jeremy"], // array
      "reporter": null,         // or a string
      "labels": ["backlog-fork"],
      "milestone": "m-0",       // or null
      "parentTaskId": null,     // or a display-cased id
      "ordinal": 1000,          // or null
      "createdAt": "2026-06-21T06:25:00Z",
      "updatedAt": "2026-07-01T16:37:00Z"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Display-cased. |
| `title` | string | |
| `status` | string | Raw, no icon. |
| `type` | string \| null | Open set. |
| `priority` | string \| null | Open set. |
| `assignees` | string[] | |
| `reporter` | string \| null | |
| `labels` | string[] | Carries `doc:<conceptId>`. |
| `milestone` | string \| null | |
| `parentTaskId` | string \| null | |
| `ordinal` | number \| null | |
| `createdAt` | string \| null | |
| `updatedAt` | string \| null | |

**No path field.** `task list`/`search` never carry a file path — only
`task view` does (§3, §6). `lore` calls `task view` per linked id specifically
because of this (see the [CLI contract §1.2](backlog-cli-contract.md#12-prefer-per-id-task-view-for-the-managed-block)).

**Filtering.** `task list --json` honors the same filter flags as its text
form (`--status`, `--labels`, `--parent`, and others). The adapter's
`listTasks` exposes `status`/`labels` as optional parameters, but **no lore
command currently passes either** — `orphans` calls `listTasks()` with zero
options, so `tasks` above is every task on the current branch, unfiltered;
`lore tasks --status <S>` filters **client-side**, over tasks it already
fetched individually via `task view` (§3), and never reaches `task list`'s
own `--status` flag. `{status, labels}` today is exercised only by
`test/backlog-adapter.test.ts`. See the
[CLI contract](backlog-cli-contract.md) for the exact flag list.

---

## 5. `kind: "search"`

`results` is an **array of hits** (output of `backlog search [query] --json`).
Backlog.md's search spans tasks, documents, and decisions, so each hit is tagged
with its `type` and carries the matched `data`. **Unlike the earlier fork
shape, hits carry no relevance `score`** — "Search scores are not part of the
version 1 public contract" (CLI-INSTRUCTIONS.md).

```jsonc
{
  "schemaVersion": 1,
  "kind": "search",
  "results": [
    {
      "type": "task",              // "task" | "document" | "decision"
      "data": { }                  // shape depends on `type` (see below)
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `"task"\|"document"\|"decision"` | Discriminates `data`. |
| `data` | object | The matched entity, shaped by `type`. |

**`data` by `type`:**

- `type: "task"` → `data` is a [`task-list` summary](#4-kind-task-list) (the
  same compact field set as a `task-list` entry: `id`, `title`, `status`,
  `labels`, …). This is what `lore` uses, e.g. to find tasks referencing a
  modified file. Only **locally editable** tasks are returned (a task from
  another branch that Backlog cannot edit here is dropped from search).
- `type: "document"` → `data` is a Backlog.md *document* (`id`, `title`, `type`,
  `path`, `tags`, `createdAt`, `updatedAt`). These are Backlog.md's own docs,
  distinct from `lore`'s OKF bundle; `lore` generally ignores them.
- `type: "decision"` → `data` is a Backlog.md *decision* record (`id`, `title`,
  `status`, `date`). Likewise Backlog.md-owned.

---

## 6. Field caveats

These are the load-bearing footnotes. The adapter must encode each one or it will
silently produce wrong results.

### `id` case ≠ filename case

`id` is `LCLI-33` (display, uppercase prefix); the file is
`lore-33 - Title.md` (lowercase). Prefix casing and zero-padding are
configurable (`zeroPaddedIds`), so **reconstructing a filename from `id` is
unsafe**. Use `path` (task-view only) for the on-disk path and keep `id` only as
identity. `lore` stores `id` (not a derived filename) when it records a task on a
story's `tasks:` frontmatter.

### `path` exists only on `task-view`, and is always project-relative

Unlike the earlier fork shape (which exposed both an absolute `filePath` and a
relative `filePathRelative`), upstream exposes **one** path field — `path` —
and only on the `task-view` shape. It is already project-relative
(`backlog/tasks/…`), computed via `node:path`'s `relative()` against the
project root before the CLI ever prints it, so there is **no absolute,
host-specific field left in the contract to redact or avoid**. `task-list` and
`search` summaries carry no path field at all — `lore` must call `task view`
per id when it needs the on-disk file (see the
[CLI contract §1.2](backlog-cli-contract.md#12-prefer-per-id-task-view-for-the-managed-block)).
On a **freshly created** task that has not yet been written to disk, `path` may
be `null`; `lore` does not depend on it (it captures the ID from the
`Created task <ID>` line instead).

### `acceptanceCriteria` / `definitionOfDone` `index` is NON-durable

Each AC/DoD item carries an `index` (1-based), but that index is **positional and
renumbers** when items are added or removed — it is derived from sort order, not
a stable per-criterion key. **Do not anchor links, frontmatter, or managed-block
content to an AC/DoD index.** If `lore` ever needs to reference a specific
criterion, it must match on `text`, not `index`. There is no durable criterion
identity in Backlog.md's model.

### Internal/git fields are never exposed

Upstream deliberately excludes `source`, `branch`, `onStatusChange`, and
`parentTaskTitle` — fields the fork used to carry — from every shape
(CLI-INSTRUCTIONS.md: "branch metadata… are not exposed"). There is no opt-in
flag (like the fork's `--json-raw`) to request them; they simply do not exist
in this contract. `lore`'s adapter does not attempt to read them.

### `priority` / `type` are open, config-driven sets

Neither field is a closed enum. A custom `priorities:`/`types:` configuration in
`backlog/config.yml` can introduce any label; `lore`'s Zod mirror validates them
as `string | null`, never `z.enum([...])`. Do not assume `"high"|"medium"|"low"`
is exhaustive.

### View-only fields

`path`, `description`, `dependencies`, `references`, `documentation`,
`modifiedFiles`, `subtasks`, `acceptanceCriteria`, `definitionOfDone`,
`implementationPlan`, `implementationNotes`, `comments`, and `finalSummary` are
populated **only** on the `task-view` shape (§3) — never on a `task-list`/
`search` summary (§4, §5).

---

## 7. How `lore` consumes this (adapter contract)

The M2 adapter (`src/adapters/backlog.ts`) is the **only** place this schema is
parsed. Its contract:

1. Shell out via Bun's subprocess API, append `--json`, read **stdout only**.
2. `JSON.parse` the single envelope object.
3. Assert `schemaVersion` ≥ the pinned floor and `kind` matches the command run;
   on mismatch, fail loud (exit `6`) pointing at the
   [patch runbook](../runbooks/backlog-json-patch.md) — never best-effort parse.
4. Validate the named payload (`tasks`/`task`/`results`) against the per-`kind`
   shape (Zod, mirroring this page; unknown keys tolerated, missing required
   keys rejected).
5. Map into `lore`'s internal `BacklogTask`/`BacklogTaskDetail` types, keeping
   `id` as identity, reading the `doc:<conceptId>` back-reference out of
   `labels[]`, never anchoring to an AC/DoD `index`, and populating `file` only
   from a `task-view` read's `path` — a `task-list`/`search`-derived
   `BacklogTask` carries no `file` at all (§6).

The capability probe ([CLI contract](backlog-cli-contract.md)) runs once at
startup and caches its result in `.lore/cache/` (transient, gitignored); it is
what guarantees the binary in use actually emits this schema before any feature
relies on it.

---

## 8. Migration history (complete)

`lore`'s adapter originally shipped (LCLI-2/4/21) against a **different, earlier
contract**: a fork of Backlog.md (`jeremy-newhouse/Backlog.md`) that this
project patched in to add `--json` before any independent upstream
implementation existed. That fork's shape — a uniform
`{schemaVersion: "1", kind, data}` envelope, camelCase `kind`s (`task`/
`taskList`/`searchResult`), a string `schemaVersion`, an absolute `filePath` +
relative `filePathRelative` pair, and internal fields (`source`, `branch`,
`onStatusChange`, `parentTaskTitle`) — is **fully superseded** and no longer
documented in §1–§7 above. It is preserved only as historical record in the
[Backlog.md `--json` patch runbook](../runbooks/backlog-json-patch.md), which
describes the fork/patch procedure that produced it.

When MrLesk's team shipped their own, independent `--json` implementation
([PR #790](https://github.com/MrLesk/Backlog.md/pull/790), merged 2026-07-16,
closing [issue #784](https://github.com/MrLesk/Backlog.md/issues/784) before
this project's own upstream PR was opened), `lore` adopted that contract
instead of upstreaming its fork (LCLI-5) — a genuine contract migration, not a
version-floor bump, split across two tasks:

- **LCLI-53** — migrated the capability probe (`probeBacklog`) alone, so a
  `--json`-incapable binary is refused against upstream's real envelope shape
  even before the rest of the adapter caught up.
- **LCLI-54** — migrated the full read adapter (`EnvelopeSchema`,
  `parseEnvelope`, `listTasks`/`viewTask`/`searchTasks`, and the golden
  fixtures under `test/fixtures/backlog-json/`) onto the same contract, and
  rewrote §1–§7 above to describe it as current. `viewTask`'s missing-task
  detection also flipped from the fork's "exit 0, empty stdout" signal to
  upstream's "exit 1 unconditionally" (§6; [CLI contract §2.2](backlog-cli-contract.md#22-existence-checks--task-views-exit-code-is-meaningful)).

`lore` still consumes upstream via a manually-built binary pinned at commit
`22a091b570d44c4f302ca47e7fd36fa28ad8bcb0` (no `package.json` dependency yet —
deliberately deferred until a tagged `MrLesk/Backlog.md` release includes that
commit; see the
[patch runbook §8.1](../runbooks/backlog-json-patch.md#81-the-adoption-plan-current)).
That step — adding a real semver dependency and bumping the capability probe's
floor once a tag ships — is the only piece of this migration still ahead.

---

## Related

- [ADR-0002: Backlog.md integration — JSON-only via `--json`](../adr/0002-backlog-integration-json-only.md) — why this contract exists and why there is no text fallback.
- [Backlog.md CLI contract](backlog-cli-contract.md) — commands, flags, exit codes, `Created task <ID>` capture, capability probe.
- [Backlog.md `--json` patch runbook](../runbooks/backlog-json-patch.md) — the superseded fork's patch procedure (historical), and the current upstream-adoption plan (§8).
- [Architecture](architecture.md) — where the adapter sits in `lore`'s module graph.
- [lore design spec](../specs/lore-design.md) — the M2 coupling milestone.
