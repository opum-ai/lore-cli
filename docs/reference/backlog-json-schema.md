---
# yaml-language-server: $schema=../../.lore/schemas/Reference.schema.json
type: Reference
title: "Backlog.md --json schema (the envelope lore consumes)"
description: The canonical {schemaVersion, kind, data} JSON envelope and per-kind payload shapes emitted by the forked Backlog.md --json flag, which lore's M2 adapter JSON.parses. Documents the task / taskList / searchResult shapes, field-by-field, with the durability and portability caveats lore must respect.
tags: [reference, backlog, json, schema, contract, adapter]
summary: The exact JSON contract lore reads from the forked Backlog.md --json flag — a {schemaVersion, kind, data} envelope with task, taskList, and searchResult payloads.
timestamp: 2026-06-21T00:00:00Z
---

# Backlog.md `--json` schema

This is the canonical contract `lore` consumes from the forked, `--json`-capable
Backlog.md. It specifies the **envelope** every `--json` command prints and the
**per-`kind` payload shapes** (`task`, `taskList`, `searchResult`), field by
field, with the durability and portability caveats the adapter must honor.

The decision to integrate JSON-only (no `--plain` text-parser fallback) is
recorded in
[ADR-0002: Backlog.md integration — JSON-only](../adr/0002-backlog-integration-json-only.md).
The commands, flags, exit codes, and write-path conventions (e.g. capturing the
new ID from the `Created task <ID>` line) live in the companion
[Backlog.md CLI contract](backlog-cli-contract.md). The fork/patch/rebase
procedure is the [Backlog.md `--json` patch runbook](../runbooks/backlog-json-patch.md).
This page is the data shape only.

> **Provenance.** Stock Backlog.md **v1.47.1 has no `--json` flag.** This schema
> describes the output of `jeremy-newhouse/Backlog.md`, a fork that adds `--json`
> to three read commands by serializing Backlog.md's existing in-memory task
> model *before* its text formatter runs (a "serialize-before-format" branch).
> The flag adds **no new fields and no storage changes** — it exposes the model
> that already backs the human/`--plain` output. The shape below is the curated
> serializer's output, not a raw `JSON.stringify(task)`.

---

## 1. The envelope

Every `--json` command prints **exactly one** JSON object to stdout, of the form:

```json
{
  "schemaVersion": "1",
  "kind": "task",
  "data": { }
}
```

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | string | Currently `"1"`. **Additive-only** contract: new optional fields may appear within a version; field removals or renames bump the version. The adapter pins a minimum and tolerates unknown extra keys. |
| `kind` | string | Discriminates the payload shape: `"task"`, `"taskList"`, or `"searchResult"`. |
| `data` | object \| array | The payload, shaped per `kind` (§3–§5). |

**Stream discipline.** The envelope is the **only** thing on stdout — a single
parseable JSON object, no banner, no perf line, no trailing log. Diagnostics and
warnings (if any) go to stderr. `lore` reads stdout, `JSON.parse`s it, asserts
`schemaVersion` is at-or-above its floor and `kind` matches the command it ran,
then maps `data` into typed objects. A `kind` or `schemaVersion` mismatch is a
fail-loud error (exit `6`), never a best-effort parse — there is no text fallback
to degrade to.

**Command → `kind` mapping.**

| Command | `kind` | `data` shape | Section |
|---|---|---|---|
| `backlog task view <id> --json` | `task` | single task object | [§3](#3-kind-task) |
| `backlog task list --json` | `taskList` | array of task summaries | [§4](#4-kind-tasklist) |
| `backlog search <query> --json` | `searchResult` | array of scored hits | [§5](#5-kind-searchresult) |

Writes (`task create --json`, `task edit --json`) are part of the fork's surface
but `lore` does **not** parse their JSON to learn the new ID; it captures the ID
from the `Created task <ID>` stdout line per the
[CLI contract](backlog-cli-contract.md). Their `--json` payload, when present, is
a `task` object (with the [`filePath` caveat](#6-field-caveats) below: it may be
`null` on a freshly created task that has not yet been written to disk).

---

## 2. Field conventions (apply to every payload)

These conventions hold across all three `kind`s. They encode hard-won facts
about Backlog.md's in-memory model; getting them wrong silently corrupts the
coupling.

- **`id` is display-cased.** Backlog.md exposes the *display* identity
  (`"TASK-123"`, uppercase prefix), which differs from the lowercase on-disk
  filename (`task-123 - Title.md`). **Never reconstruct a filename from `id`** —
  prefix casing and zero-padding are configurable. Use `filePath` /
  `filePathRelative` for the on-disk location and `id` for identity/links.
- **`status` is the raw value, no icon.** The text formatter wraps status in a
  presentation icon (`formatStatusWithIcon`); the JSON serializer emits the raw
  string (`"To Do"`, `"In Progress"`, `"Done"`, or any custom status configured
  in `backlog/config.yml`). Treat `status` as an opaque configured label, not a
  closed enum.
- **Dates are strings, not timestamps.** `createdDate` / `updatedDate` and comment
  dates are `"YYYY-MM-DD"` (or `"YYYY-MM-DD HH:mm"`) **strings**, matching
  Backlog.md's on-disk convention. The serializer deliberately **omits or
  normalizes** the in-memory `lastModified: Date` so the payload never mixes
  ISO-8601 `T…Z` timestamps with these space-separated date strings. Do not
  expect a `lastModified` field; if present in a future version it is normalized
  to the same string convention.
- **List fields are always arrays** (possibly empty), never `null`:
  `labels`, `dependencies`, `references`, `documentation`, `assignees`,
  `modifiedFiles`, `acceptanceCriteria`, `definitionOfDone`, `comments`,
  `subtasks`. Scalar-optional fields (`priority`, `milestone`, `parentTaskId`,
  `updatedDate`, `branch`, …) are `null` when absent.
- **Unknown keys are allowed.** Per the additive-only contract (and OKF's own
  tolerance ethos), the adapter ignores fields it does not recognize rather than
  failing on them.

---

## 3. `kind: "task"`

`data` is a single task object (output of `backlog task view <id> --json`). This
is the richest shape; the [`taskList`](#4-kind-tasklist) summary is a subset.

```jsonc
{
  "id": "TASK-123",                 // display-cased identity; do NOT derive filename
  "title": "Bulk-archive completed orders",
  "status": "In Progress",          // raw configured status, NO icon
  "priority": "high",               // "high" | "medium" | "low" | null
  "ordinal": 0,                     // sort ordinal within status, or null

  "filePath": "/abs/repo/backlog/tasks/task-123 - Bulk-archive completed orders.md",
  "filePathRelative": "backlog/tasks/task-123 - Bulk-archive completed orders.md",

  "assignees": ["@alice"],          // always an array (may be empty)
  "reporter": "@bob",               // or null

  "createdDate": "2026-06-20",      // "YYYY-MM-DD" string
  "updatedDate": "2026-06-21",      // string, or null

  "labels": ["orders", "doc:stories/bulk-archive-orders"],  // array; see note below
  "milestone": "M2",               // or null
  "dependencies": ["TASK-100"],     // array of display-cased ids
  "references": ["docs/specs/order-archival.md"],            // array of free-form refs
  "documentation": ["docs/runbooks/archival.md"],           // array
  "modifiedFiles": ["src/orders/archive.ts"],               // array

  "parentTaskId": "TASK-50",        // or null
  "parentTaskTitle": "Orders epic", // view-path only; may be null/absent elsewhere
  "subtasks": [                     // view-path only; array (may be empty/absent)
    { "id": "TASK-124", "title": "Archive UI" }
  ],

  "acceptanceCriteria": [           // array; index is NON-durable (see §6)
    { "index": 1, "text": "Orders older than 90 days can be archived", "checked": true },
    { "index": 2, "text": "Archived orders are excluded from default list", "checked": false }
  ],
  "definitionOfDone": [             // array; index is NON-durable (see §6)
    { "index": 1, "text": "Tests cover the 90-day boundary", "checked": false }
  ],

  "description": "Operators can archive orders older than 90 days in one action.",
  "implementationPlan": "1. Add archive flag …",   // or null
  "implementationNotes": "Used a soft-delete column …", // or null
  "finalSummary": "Shipped behind a flag.",        // or null

  "comments": [
    { "index": 1, "author": "@alice", "createdDate": "2026-06-20", "body": "Started." }
  ],

  "source": "local",                // "local" | "remote" | "completed" | "local-branch" | null
  "branch": "tasks/task-123",       // or null
  "onStatusChange": null            // hook descriptor, or null

  // rawContent is OMITTED by default (opt-in only; see §6)
  // lastModified is OMITTED or normalized (see §2)
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
- `comments` are `{ index, author, createdDate, body }`. `author` may be `null`.
- The free-form prose fields (`description`, `implementationPlan`,
  `implementationNotes`, `finalSummary`) are strings (markdown) or `null`.

### 3.2 Field reference (`task`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Display-cased. Identity, not filename. |
| `title` | string | yes | |
| `status` | string | yes | Raw configured status, no icon. |
| `priority` | `"high"\|"medium"\|"low"\|null` | yes | |
| `ordinal` | number \| null | yes | Position within status. |
| `filePath` | string \| null | yes | **Absolute** on disk-loaded tasks; `null` on freshly created. Host-specific — see [§6](#6-field-caveats). |
| `filePathRelative` | string \| null | yes | Repo-relative (`backlog/tasks/…`). Prefer this for portable links. |
| `assignees` | string[] | yes | Array (renamed from the in-memory singular `assignee`). |
| `reporter` | string \| null | yes | |
| `createdDate` | string | yes | `"YYYY-MM-DD"`. |
| `updatedDate` | string \| null | yes | `"YYYY-MM-DD"` or null. |
| `labels` | string[] | yes | Includes the `doc:<conceptId>` back-reference label (see below). |
| `milestone` | string \| null | yes | |
| `dependencies` | string[] | yes | Display-cased ids. |
| `references` | string[] | yes | Free-form. |
| `documentation` | string[] | yes | Free-form. |
| `modifiedFiles` | string[] | yes | |
| `parentTaskId` | string \| null | yes | |
| `parentTaskTitle` | string \| null | view-path | Set only on the `task view` enrichment path; may be `null`/absent on list/search. |
| `subtasks` | `{id,title}[]` | view-path | Same enrichment caveat; may be empty/absent. |
| `acceptanceCriteria` | `{index,text,checked}[]` | yes | `index` **non-durable** ([§6](#6-field-caveats)). |
| `definitionOfDone` | `{index,text,checked}[]` | yes | `index` **non-durable**. |
| `description` | string \| null | yes | Markdown. |
| `implementationPlan` | string \| null | yes | Markdown. |
| `implementationNotes` | string \| null | yes | Markdown. |
| `finalSummary` | string \| null | yes | Markdown. |
| `comments` | `{index,author,createdDate,body}[]` | yes | `author` may be `null`. |
| `source` | `"local"\|"remote"\|"completed"\|"local-branch"\|null` | yes | Provenance. |
| `branch` | string \| null | yes | |
| `onStatusChange` | object \| string \| null | yes | Hook descriptor; opaque to `lore`. |
| `rawContent` | string | opt-in | **Omitted by default**; emitted only with `--json-raw`. See [§6](#6-field-caveats). |

> **The `doc:<conceptId>` label is how `lore` finds the doc → task
> back-reference.** Per ADR-0002, `lore` never stores its own frontmatter keys on
> a task (Backlog.md drops unknown keys on edit). Instead it sets a *queryable*
> label `doc:stories/bulk-archive-orders` via `task edit --label`. That label
> arrives here in `labels[]`; `lore orphans` and `lore link` read it from this
> array. Treat the `doc:` prefix as the contract.

---

## 4. `kind: "taskList"`

`data` is an **array of task summaries** (output of `backlog task list --json`).
The summary is a stable subset of the [`task`](#3-kind-task) shape — enough to
render listings and reconcile status without a `view` per task. The
view-only enrichment fields (`parentTaskTitle`, `subtasks`) and the heavy body
fields (`acceptanceCriteria`, `description`, `comments`, …) are **not** included.

```jsonc
{
  "schemaVersion": "1",
  "kind": "taskList",
  "data": [
    {
      "id": "TASK-123",
      "title": "Bulk-archive completed orders",
      "status": "In Progress",     // raw, no icon
      "priority": "high",          // or null
      "ordinal": 0,                // or null
      "assignees": ["@alice"],     // array
      "labels": ["orders", "doc:stories/bulk-archive-orders"],
      "milestone": "M2",           // or null
      "parentTaskId": "TASK-50",   // or null
      "filePath": "/abs/repo/backlog/tasks/task-123 - Bulk-archive completed orders.md",
      "filePathRelative": "backlog/tasks/task-123 - Bulk-archive completed orders.md"
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Display-cased. |
| `title` | string | |
| `status` | string | Raw, no icon. |
| `priority` | `"high"\|"medium"\|"low"\|null` | |
| `ordinal` | number \| null | |
| `assignees` | string[] | |
| `labels` | string[] | Carries `doc:<conceptId>`. |
| `milestone` | string \| null | |
| `parentTaskId` | string \| null | |
| `filePath` | string \| null | Absolute; host-specific. |
| `filePathRelative` | string \| null | Repo-relative; prefer for links. |

**Implementation note for the fork.** `task list` builds its summary line
*inline*, it does not call the full task-view serializer — so the fork needs a
distinct `serializeTaskSummary` in addition to `serializeTask`. The two must stay
field-compatible on their shared keys. `lore`'s adapter relies on that
compatibility: a `taskList` entry's `id`/`status`/`labels` mean exactly what they
mean on a full `task`.

**Filtering.** `task list --json` honors the same filter flags as its text form
(e.g. `--status`, `--label`, parent filters). `lore` passes through the filters
it needs (notably `--label doc:<conceptId>` to find a story's tasks, and a status
filter for reconciliation); the `data` array is the filtered set. See the
[CLI contract](backlog-cli-contract.md) for the exact flag list.

---

## 5. `kind: "searchResult"`

`data` is an **array of scored hits** (output of `backlog search <query> --json`).
Backlog.md's search spans tasks, documents, and decisions, so each hit is tagged
with its `type` and carries the matched `item`.

```jsonc
{
  "schemaVersion": "1",
  "kind": "searchResult",
  "data": [
    {
      "type": "task",              // "task" | "document" | "decision"
      "score": 0.12,               // relevance score (lower = better, Fuse.js), or null
      "item": {  }              // shape depends on `type` (see below)
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `"task"\|"document"\|"decision"` | Discriminates `item`. |
| `score` | number \| null | Fuse.js relevance (lower is a closer match). May be `null`. |
| `item` | object | The matched entity, shaped by `type`. |

**`item` by `type`:**

- `type: "task"` → `item` is a [`task` summary](#4-kind-tasklist) (same subset as
  a `taskList` entry: `id`, `title`, `status`, `labels`, `filePathRelative`, …).
  This is what `lore` uses, e.g. to find tasks referencing a modified file.
- `type: "document"` → `item` is a Backlog.md *document* (`id`, `title`,
  `filePathRelative`, …). These are Backlog.md's own docs, distinct from `lore`'s
  OKF bundle; `lore` generally ignores them.
- `type: "decision"` → `item` is a Backlog.md *decision* record. Likewise
  Backlog.md-owned.

> **Dropped: Fuse `matches`.** Backlog.md's underlying search exposes per-field
> match spans typed `unknown` (a Fuse.js passthrough). The serializer
> **deliberately omits** `matches` from the contract — it is an unstable internal
> shape. `lore` ranks/filters on `score` and `type`, never on match spans.

---

## 6. Field caveats

These are the load-bearing footnotes. The adapter must encode each one or it will
silently produce wrong results.

### `id` case ≠ filename case

`id` is `TASK-123` (display, uppercase prefix); the file is
`task-123 - Title.md` (lowercase). Prefix casing and zero-padding are
configurable (`zeroPaddedIds`), so **reconstructing a filename from `id` is
unsafe**. Use `filePathRelative` for the on-disk path and keep `id` only as
identity. `lore` stores `id` (not a derived filename) when it records a task on a
story's `tasks:` frontmatter.

### `filePath` is absolute and host-specific

`filePath` is the absolute path on the machine that ran `backlog`, so it is **not
portable** across hosts or checkouts. Anything `lore` persists (links in managed
blocks, frontmatter) must use **`filePathRelative`** (`backlog/tasks/…`), never
`filePath`. `filePath` is provided for local convenience/debugging only. On a
**freshly created** task that has not yet been written to disk, both may be
`null` — the create/edit `--json` path tolerates this; `lore` does not depend on
it (it captures the ID from the `Created task <ID>` line instead).

### `acceptanceCriteria` / `definitionOfDone` `index` is NON-durable

Each AC/DoD item carries an `index` (1-based), but that index is **positional and
renumbers** when items are added or removed — it is derived from sort order, not
a stable per-criterion key. **Do not anchor links, frontmatter, or managed-block
content to an AC/DoD index.** If `lore` ever needs to reference a specific
criterion, it must match on `text`, not `index`. There is no durable criterion
identity in Backlog.md's model.

### `lastModified` is omitted or normalized

The in-memory model has `lastModified: Date`, which would serialize to ISO-8601
`…T…Z` and clash with the `"YYYY-MM-DD"` string dates used everywhere else. The
serializer **drops or normalizes** it for date-format consistency. Do not rely on
a `lastModified` field; use `createdDate` / `updatedDate` (strings).

### `rawContent` is opt-in

`rawContent` (the entire task `.md` source) duplicates the structured fields,
roughly doubles payload size, and can desync from the parsed fields. It is
**omitted by default** and emitted only behind `--json-raw`. `lore`'s adapter
does not request it; it consumes the structured fields.

### View-only enrichment fields

`parentTaskTitle` and `subtasks` are populated only on the `task view` enrichment
path (`getTaskWithSubtasks`). On `task list` / `search` they may be `null` or
absent. Treat them as **optional**: present and meaningful on a `task` payload,
not guaranteed on `taskList`/`searchResult` items.

---

## 7. How `lore` consumes this (adapter contract)

The M2 adapter (`src/adapters/backlog.ts`) is the **only** place this schema is
parsed. Its contract:

1. Shell out via Bun's subprocess API, append `--json`, read **stdout only**.
2. `JSON.parse` the single envelope object.
3. Assert `schemaVersion` ≥ the pinned floor and `kind` matches the command run;
   on mismatch, fail loud (exit `6`) pointing at the
   [patch runbook](../runbooks/backlog-json-patch.md) — never best-effort parse.
4. Validate `data` against the per-`kind` shape (Zod, mirroring this page; unknown
   keys tolerated, missing required keys rejected).
5. Map into `lore`'s internal `BacklogTask` type, **preferring
   `filePathRelative`**, keeping `id` as identity, reading the `doc:<conceptId>`
   back-reference out of `labels[]`, and never anchoring to an AC/DoD `index`.

The capability probe ([CLI contract](backlog-cli-contract.md)) runs once at
startup and caches its result in `.lore/cache/` (transient, gitignored); it is
what guarantees the binary in use actually emits this schema before any feature
relies on it.

---

## Related

- [ADR-0002: Backlog.md integration — JSON-only via `--json`](../adr/0002-backlog-integration-json-only.md) — why this contract exists and why there is no text fallback.
- [Backlog.md CLI contract](backlog-cli-contract.md) — commands, flags, exit codes, `Created task <ID>` capture, capability probe.
- [Backlog.md `--json` patch runbook](../runbooks/backlog-json-patch.md) — fork, patch, compile, rebase, and upstream procedure.
- [Architecture](architecture.md) — where the adapter sits in `lore`'s module graph.
- [lore design spec](../specs/lore-design.md) — the M2 coupling milestone.
