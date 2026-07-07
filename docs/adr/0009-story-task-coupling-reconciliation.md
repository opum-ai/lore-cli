---
type: ADR
title: "ADR-0009: Story↔Task coupling & status reconciliation"
description: "How lore couples a Story doc to Backlog.md tasks (doc→task via the Story's tasks: frontmatter, task→doc via a queryable doc:<conceptId> label), and how it reconciles a Story's status from live task statuses using the status set read from Backlog config rather than a hardcoded list."
tags: [adr, backlog, coupling, status, reconciliation, labels, story]
summary: "A Story's tasks: frontmatter is the doc→task source of truth, the task→doc back-reference is a queryable Backlog label doc:<conceptId>, and a Story's status is reconciled from live task statuses using the status set from Backlog config, with tasks linked by ID and paths resolved fresh each run."
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0009: Story↔Task coupling & status reconciliation

## Status

Accepted — 2026-06-21

## Context

The differentiating feature of lore is that a `Story` (or `Spec`) document is
*coupled* to the Backlog.md tasks that deliver it. That coupling must answer
three questions deterministically and survive both tools editing their own
files independently:

1. **Which tasks does this doc own?** (doc → tasks)
2. **Which doc owns this task?** (task → doc)
3. **What is this Story's current status, given its tasks?** (rollup)

Several hard constraints, fixed by earlier decisions, shape the answers:

- **Backlog.md drops unknown frontmatter keys on edit.** Every write to a task
  goes through `backlog task edit`, and stock Backlog.md silently strips any
  frontmatter key it does not recognize. So lore **cannot** store bespoke
  metadata (a `lore_doc:` field, a JSON blob, etc.) on a task — it would
  vanish on the next edit. See
  [ADR-0002: Backlog.md integration](0002-backlog-integration-json-only.md) and
  [backlog-cli-contract](../reference/backlog-cli-contract.md).
- **The doc→task list already lives in the doc.** The `Story` frontmatter
  carries `tasks: [task-42, task-57]`. This is human-authored, diffable, and
  versioned with the narrative it belongs to.
- **A display-only annotation is not an index.** Backlog supports a free-text
  `--doc` annotation on a task, but free text is not reliably queryable. To find
  "every task with no owning doc" (orphans) or to unlink a doc from many tasks,
  lore needs a field it can *query* through `backlog task list --json` /
  `backlog search --json`.
- **Task IDs are stable; on-disk paths are not.** Backlog.md task files are
  named `task-42 - <title>.md`; renaming the task renames the file. Any link
  keyed on the *path* breaks the moment a title changes.
- **Statuses are project-configurable.** Backlog.md lets a project define its own
  status set in `backlog/config.yml` (e.g. `To Do / In Progress / Done`, or a
  custom workflow with `Blocked`, `In Review`, etc.). A reconciliation rule that
  hardcodes a status vocabulary would silently misbehave on any non-default
  project.

## Decision

Couple a Story to its tasks with **two independent, single-purpose references**
— one per direction — and reconcile status from **live** task data read as JSON.

### 1. Doc → task: the `tasks:` frontmatter is the source of truth

A `Story`'s `tasks:` frontmatter list is **the** authoritative statement of
which tasks the doc owns:

```yaml
tasks: [task-42, task-57]
```

- This list is owned by the doc and edited by `lore link` / `lore unlink`
  (which add/remove IDs) or by hand. It is what `lore sync`, `lore check`, and
  the managed task block read to know which tasks to roll up.
- **IDs are stored lowercase** (`task-42`, never `Task-42`) and **compared
  case-insensitively** throughout, so a hand-authored `Task-42` still matches.
- Tasks are referenced **by ID only** — never by file path. The on-disk file
  path (`backlog/tasks/task-42 - <title>.md`) is **resolved fresh on every run**
  from live Backlog.md JSON, so a task rename never invalidates the coupling and
  never produces a stale link. (The managed block then renders the *current*
  path; see [ADR-0008: Managed task block](0008-managed-block-remark-ast.md).)

### 2. Task → doc: a queryable `doc:<conceptId>` label

The back-reference from a task to its owning doc is recorded as a **Backlog
label**:

```
doc:stories/bulk-archive-orders
```

- `lore link` calls `backlog task edit <id> --label doc:<conceptId>`; `lore
  unlink` removes it. The label lives in Backlog.md's own metadata, set the
  Backlog-approved way, so it **survives `backlog task edit`** — unlike any
  custom frontmatter key, which Backlog would drop.
- The label is **the index for the reverse direction.** `lore orphans` queries
  `backlog task list --json` (and `backlog search --json`) for tasks lacking any
  `doc:` label to find tasks with no owning doc, and conversely flags docs whose
  `tasks:` reference IDs that no longer exist. Bulk unlink also keys off the
  label set.
- `--doc` (the free-text display annotation) is set **in addition**, purely for
  human readability in `backlog task view`. It is explicitly **not** the index:
  free text is not reliably searchable, so it is never the thing lore queries.
  The label carries the machine-readable coupling; `--doc` carries the pretty
  name.
- `<conceptId>` is the concept ID (path minus `.md`), **case-preserved** —
  unlike the doc-side task IDs (§1), which are a closed, lowercase-normalized
  set. Concept IDs are not: `buildGraph`'s lookup is a plain, case-sensitive
  `Map` (deliberately, for cross-platform determinism — see
  `core/bundle.ts`), so two concepts differing only by case are distinct
  nodes.
- **Case-preserving the label is necessary but not sufficient.** Backlog's own
  `--add-label`/`--remove-label` de-dup **case-insensitively** in its label
  store (backlog-cli-contract §2.4) — so even with a case-preserved
  `<conceptId>`, two concepts whose ids differ only by case would still
  collide on one stored Backlog label, and unlinking one could silently strip
  the other's real back-reference. `lore link`/`unlink` therefore refuse
  outright (`conflict`, exit 5) to operate on a concept whose id collides
  case-insensitively with another concept's id — the case-preserving encoding
  keeps the label faithful to the concept's real id for display and for the
  (rare, cross-platform) case where no collision exists; the reject-on-
  collision guard is what actually keeps two case-colliding concepts from
  corrupting each other's back-reference.

### 3. Status reconciliation from live task statuses

A `Story`'s `status` frontmatter is a **derived** value, recomputed from the
live statuses of its owning tasks:

- Task statuses are read from `backlog task list --json` / `view --json` (the
  JSON envelope from [ADR-0002](0002-backlog-integration-json-only.md)); lore
  never parses task `.md` files and never trusts a cached status.
- The **status vocabulary is read from Backlog config** (`backlog/config.yml`),
  **not hardcoded.** lore resolves the project's ordered status set and which
  values mean "started" and "terminal" from config, then applies a deterministic
  rule of the shape:
  - all owning tasks in the terminal (Done) state → Story `done`;
  - any owning task in a started (In Progress) state → Story `in-progress`;
  - otherwise, if any task exists → Story `todo`;
  - no `tasks:` at all → `status` is left exactly as authored (a narrative-only
    doc is never forced into a workflow state).
- `lore sync` **writes** the reconciled `status`; `lore check` **reports drift**
  (persisted vs. computed) and **never writes**, exiting `6` on a mismatch — the
  CI gate. See [ADR-0007: Validation & coherence](0007-validation-and-coherence.md).
- Reconciliation is pure and deterministic: a graph + JSON operation with no
  LLM, no heuristics, and no ranking.
- **Per-repo overrides (LORE-26) can map a status straight to a rollup value,
  bypassing flow position entirely.** `.lore/config.toml`'s `[reconcile.overrides]`
  (`config.ts`'s `ReconcileConfig.overrides`, a `Backlog status → "todo"|
  "in-progress"|"done"` map) exists precisely for a status the ordered flow
  cannot classify unambiguously — a bespoke `Cancelled`/`Won't Fix` state, or one
  a team added without reordering `statuses:`. When a linked task's status
  matches an override key, that status's contribution to the rollup is the
  override's target value directly — it is never looked up in `statusFlow`, even
  when it also happens to appear there (an override always wins). `config.ts`
  parses the map as opaque strings and deliberately defers validating the target
  vocabulary to `core/reconcile.ts` ("reconcile.ts owns the rollup-status
  vocabulary and its semantics" — `config.ts`'s own header), which rejects an
  out-of-vocabulary target (`validation`, exit 6) the same way it rejects a
  status absent from both the flow and the override map.

The `tasks:` field shape and the `status` enum are part of the `Story` Zod
schema and so flow into JSON Schema and editor autocomplete from one place —
see [ADR-0006: Schema, types & templates](0006-schema-types-templates.md).

## Consequences

### Positive

- **Each direction has exactly one home.** doc→task lives in the doc (diffable,
  versioned with narrative); task→doc lives in Backlog (survives `task edit`).
  Neither tool stores the other's private metadata, so neither corrupts it.
- **Rename-proof coupling.** Linking by ID and resolving paths fresh means a task
  title/file rename never breaks a link and never leaves a stale path in a doc.
- **Orphan detection is a real query, not a guess.** The `doc:` label is
  indexed by Backlog's own search, so "tasks with no owning doc" and "docs whose
  tasks vanished" are answerable deterministically via `--json`.
- **Portable across Backlog workflows.** Reading the status set from config means
  a project with a custom workflow (extra states, renamed states) reconciles
  correctly with no lore code change.
- **Survives Backlog's frontmatter stripping.** By choosing a label (not a custom
  key) for the back-reference, the coupling is immune to Backlog dropping unknown
  keys on edit.
- **Clean, idempotent diffs.** Status is derived and managed blocks are
  byte-stable, so an unchanged tree produces no diff — safe for agent loops and
  CI.

### Negative / tradeoffs

- **Two references can disagree.** A doc can list `task-42` while `task-42`
  lacks the matching `doc:` label (or vice versa). This is the price of
  per-direction homes; lore reconciles both ways via `lore link`/`unlink` and
  surfaces mismatches in `lore orphans` / `lore check`, but a hand edit to one
  side without the other creates transient drift.
- **Reconciliation requires Backlog present.** Status rollup and orphan
  detection depend on the `--json`-capable Backlog.md fork
  ([backlog-json-patch](../runbooks/backlog-json-patch.md)). Pure per-file
  `lore validate` does not, but `lore sync`/`check`/`orphans` do.
- **Config-derived statuses add a dependency on Backlog config shape.** lore must
  read and interpret `backlog/config.yml`'s status set; a project that defines
  ambiguous or unordered statuses can produce a reconciliation lore cannot map
  cleanly to started/terminal, which it must report rather than guess.
- **Label namespace coupling.** The `doc:` label prefix is a reserved namespace
  in the project's Backlog label space; a team already using `doc:`-prefixed
  labels for another purpose would collide. The prefix is documented and
  consistent, but it is a shared namespace.
- **`lore rename` actively moves the label and `--doc` path.** A concept's
  `doc:<conceptId>` label is derived from its id, so relocating the file would
  otherwise silently orphan every linked task's back-reference (the old label
  keeps pointing at an id nothing owns anymore, and no command could ever clean
  it up again). `lore rename` closes this: after committing the file move, it
  moves every linked task's label and `--doc` path to the new id/path via
  `commands/link.ts`'s `moveBackRefs`, mirroring `link`/`unlink`'s per-task
  resilience (sequential edits per ADR-0012 §5, one failure isolated and
  reported without blocking the rest, `drift`/exit `6` on any partial
  failure). Renaming a concept with no `tasks:` entries never constructs a
  `BacklogAdapter` at all, so it keeps zero Backlog dependency. `--dry-run`
  previews the file-level plan only, not a Backlog-side one — the back-ref
  move is skipped entirely under `--dry-run`. A concept relocated **by
  hand** (`git mv`, an IDE refactor — not `lore rename`) is not covered by
  this: `lore link` on the new id only *adds* its own label, with no notion
  of a previous id to remove, and `lore unlink` on the old id fails
  `not_found` once that id no longer resolves to any concept — by default.
  `lore unlink <oldId> <taskId…> --allow-missing` is the recovery path:
  it tolerates `<oldId>` not resolving to a live concept and removes just
  the Backlog-side `doc:` label/`--doc` entry (there is no concept file to
  update `tasks:` on). The case-collision guard still applies in this
  mode, so a *live* concept whose id collides with `<oldId>` case-
  insensitively is still protected. Recognizing *that* this drift exists
  in the first place (as opposed to repairing it once found) remains
  `lore orphans`/`lore check`'s job (LORE-26/27).

## Alternatives considered

- **Store the doc reference as task frontmatter (a `lore_doc:` key).** Rejected:
  Backlog.md drops unknown frontmatter keys on `task edit`, so the reference
  would silently disappear. A label is the only Backlog-native, edit-surviving,
  queryable home for the back-reference.
- **Use only the free-text `--doc` annotation as the back-reference.** Rejected:
  free text is not reliably queryable, so orphan detection and bulk unlink would
  degrade to fragile string matching. `--doc` is kept for human display, with
  the label as the actual index.
- **Make the task side (labels) the source of truth and derive `tasks:`.**
  Rejected: it inverts ownership, forcing the doc's coupling to live outside the
  versioned doc and making every `git diff` of a Story silent about which tasks
  it owns. The doc's `tasks:` list keeps coupling visible and reviewable in the
  doc's own history.
- **Link tasks by file path instead of ID.** Rejected: task files are renamed on
  title change, so path-keyed links rot immediately. IDs are stable; paths are
  resolved fresh each run.
- **Hardcode the status vocabulary (`To Do / In Progress / Done`).** Rejected:
  Backlog.md projects define custom status sets; a hardcoded list misreconciles
  any non-default workflow. The set is read from Backlog config.
- **Single bidirectional reference (one field doing both directions).**
  Rejected: no single location satisfies both constraints — it must be in the
  doc to be diffable *and* in Backlog to survive `task edit` and be queryable.
  Two single-purpose references, one per direction, is the only consistent design.

---

See also: [lore-design](../specs/lore-design.md),
[backlog-json-schema](../reference/backlog-json-schema.md),
[cli-surface](../reference/cli-surface.md),
[backlog-json-patch](../runbooks/backlog-json-patch.md),
and the [ADR log](index.md).
