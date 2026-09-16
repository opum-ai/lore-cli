---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: Tracker status flow is backend-polymorphic, not Backlog config
tags:
  - tracker-backend
  - status-flow
  - reconciliation
  - adr
summary: Status flow comes from the active tracker backend's TrackerAdapter.statusFlow(), not a Backlog-only config file; each of Backlog, Quest, and Jira answers it from its own source.
timestamp: 2026-09-16T23:44:40.980Z
supersedes: adr/0009-story-task-coupling-reconciliation
---

# ADR-0022: Tracker status flow is backend-polymorphic, not Backlog config

## Status

Accepted — 2026-09-16

Supersedes [ADR-0009](0009-story-task-coupling-reconciliation.md) **on one point only**: where the
status vocabulary used for reconciliation comes from. ADR-0009's other decisions — the `tasks:`
frontmatter as the doc→task source of truth, the `doc:<conceptId>` label as the task→doc
back-reference, ID case rules, and the `lore rename` back-reference move — are unaffected and
remain the active design. ADR-0009's own text is not rewritten; it carries a pointer to this
record (see its Status section).

## Context

ADR-0009 (2026-06-21) decided that "the status vocabulary is read from Backlog config
(`backlog/config.yml`), not hardcoded" — an explicit, reasoned rejection of a hardcoded status
list, written when Backlog.md was lore's only tracker integration. At the time that was a complete
description: there was exactly one backend, and its config file was the only place a status
vocabulary could live.

That premise stopped holding once lore grew a second and third tracker backend. Quest and Jira
support landed with no ADR of their own recording the shift from "one tracker, one config format"
to "several interchangeable tracker backends behind one interface" — the `TrackerAdapter`
interface in `src/adapters/tracker.ts`, documented operationally in
[backlog-cli-contract.md's Tracker adapter boundary](../reference/backlog-cli-contract.md#tracker-adapter-boundary)
and [architecture.md](../reference/architecture.md). Each backend now supplies its own
`statusFlow()`, and none of the three reads `backlog/config.yml` unconditionally. `src/core/reconcile.ts`
itself was carrying the stale claim as recently as this repository's own history: its three
status-flow error hints named `backlog/config.yml` as a literal regardless of the active backend,
fixed in LCLI-503 by threading a per-backend `statusFlowHints` value onto the `TrackerAdapter`
interface (mirroring the precedent LCLI-494 set for `sourceAdapterVersion`, so a new backend
cannot be added without supplying one). ADR-0009 itself was never corrected to match — this record
is that correction, scoped narrowly to the vocabulary-source claim rather than attempting to
retroactively document the full tracker-backend-polymorphism architecture (a broader decision this
ADR does not claim to cover; see "Left out of scope" below).

Introducing a second and third backend without ever writing that decision down is itself a gap —
recorded here rather than silently repeated, since fixing this ADR's staleness is a poor place to
also backfill a decision this record was not asked to make.

## Decision

**The status vocabulary reconciliation uses comes from `TrackerAdapter.statusFlow()` on the
currently active backend — never from a Backlog-specific file, and never assumed to be the same
shape across backends.** `core/reconcile.ts` (`reconcileStatus`, `validateStatusFlow`, `classify`)
takes the resolved `StatusFlow` and an optional `pausedStatus` as parameters; it has no
backend-specific knowledge and never reads any backend's configuration directly — see
[the tracker adapter boundary](../reference/backlog-cli-contract.md#tracker-adapter-boundary):
"the reconciliation layer must never read another backend's configuration directly." Each of the
three backends this repository ships answers `statusFlow()` from a different concrete source:

- **Backlog** (`src/adapters/backlog.ts`, `readStatusFlow`) reads the project's own
  `backlog/config.yml` `statuses:` key, falling back to a built-in default ordered flow
  (`To Do` / `In Progress` / `Done`) when that file is absent. This is the one backend for which
  ADR-0009's original description was ever accurate, and remains accurate for it today.
- **Quest** (`src/adapters/quest.ts`) has no project config file to read at all. It calls the
  `quest` subprocess's `task status-flow --json` command and parses the returned `data`; the
  vocabulary is Quest's own workspace lifecycle policy, owned entirely by the Quest CLI. Quest also
  distinguishes an optional non-terminal `pausedStatus` (its `Paused` status, LCLI-455) that sits
  outside the ladder `statusFlow()` returns — a side status Backlog and Jira have no equivalent
  for, and which `TrackerAdapter.pausedStatus?()` models as optional for exactly that reason.
- **Jira** (`src/adapters/jira.ts`) reads neither a Backlog file nor Jira's own REST service: the
  flow is lore's own configuration, `[tracker.jira] status_flow` in `.lore/config.toml`
  (`config.statusFlow`, required non-empty). lore does not call Jira to discover its workflow
  states; the operator declares them once, in lore's config, at onboarding.

Each backend's `statusFlowHints` (also on `TrackerAdapter`, LCLI-503) carries the reader-facing
advice for fixing a degenerate flow, and the three differ for the same reason the sources differ: a
Backlog project edits `statuses:`; a Quest workspace has no key to edit and is pointed at
`quest task status-flow` to read the live policy back; a Jira project edits `.lore/config.toml`,
not anything Jira serves. A `[reconcile.overrides]` map, also in `.lore/config.toml`, is the one
piece of this design that is backend-neutral: it lets any backend's degenerate or unrecognized
status short-circuit straight to a rollup value, bypassing `statusFlow` position entirely — that
part of ADR-0009 §3's decision is unaffected by this record.

### Left out of scope

This record documents where the vocabulary comes from per backend, because that is the specific
claim ADR-0009 got wrong and asked to be corrected. It does **not** attempt to be the ADR for
"lore supports multiple interchangeable tracker backends" as a standalone architectural decision —
that decision (the `TrackerAdapter` interface itself, backend selection and migration, the
Quest/Jira onboarding flows) shipped without one, and backfilling it properly is a larger task than
this correction, better done as its own record if the gap is judged worth closing.

## Consequences

### Positive

- **ADR-0009's status-vocabulary claim is no longer misleading.** A reader following ADR-0009 to
  understand `lore check`'s reconciliation drift on a Quest- or Jira-backed repository is now
  routed here instead of being told to look at a file (`backlog/config.yml`) that a non-Backlog
  workspace does not have.
- **The three sources are named in one place**, alongside the code (`src/adapters/tracker.ts`'s own
  interface doc comments already carried this reasoning for `statusFlowHints`; this record is the
  architecture-of-record counterpart, not a duplicate implementation).
- **`reconcile.ts`'s backend-neutrality is now decision-of-record, not just an implementation
  fact.** "the reconciliation layer must never read another backend's configuration directly" was
  already true in code and stated operationally in the tracker-adapter-boundary reference doc; it
  now also has a decision record backing it.

### Negative / tradeoffs

- **Two ADRs must now be read together for the full status-reconciliation picture** (ADR-0009 for
  the coupling design, this record for the vocabulary source) rather than one. This is the accepted
  cost of not rewriting ADR-0009's history — see "Alternatives considered".
- **This record does not close the larger documentation gap** it surfaces (no ADR for
  tracker-backend polymorphism itself). A reader wanting the full rationale for *why* lore has
  three backends, not just where each one's status flow comes from, will not find it in either
  ADR-0009 or this record.

## Alternatives considered

- **Amend ADR-0009 in place** (the pattern already used elsewhere in this log — see e.g. ADR-0007's
  and ADR-0011's dated "Amended" entries for a corrected implementation detail within an unchanged
  decision). Rejected for this specific claim: those amendments correct a *mechanism* underneath an
  unchanged decision (a hardcoded per-type contract becomes profile-driven; one YAML library
  replaces another), where the ADR's original decision is still the right description of what
  changed and why. Here the original decision itself — "the vocabulary is read from Backlog
  config" — is the sentence that stopped being true, not an implementation detail beneath it, and
  the replacement (a per-backend `TrackerAdapter.statusFlow()` with three genuinely different
  sources) is substantial enough to warrant its own Context/Decision/Consequences/Alternatives
  treatment rather than a paragraph appended to ADR-0009's Status section. This mirrors the
  precedent already set by [ADR-0018](0018-persistent-local-graph-projection-with-ladybugdb.md)
  superseding [ADR-0015](0015-lightweight-retrieval-no-vectors.md) "for persistence and indexed
  routing" while leaving ADR-0015's still-valid boundary (no vectors, no RAG) active and its text
  untouched.
- **Rewrite ADR-0009's Decision section directly to describe the current, backend-polymorphic
  design.** Rejected: ADRs in this log are "immutable once Accepted — the historical record of a
  decision is never rewritten in place" (see [the ADR log's own Process
  section](index.md#process)), and this fleet's retirement-scope rule draws the same line for
  historical records generally — a past decision is left legible as what was actually decided at
  the time, not silently updated to read as if it always said the new thing.
- **Do nothing and rely on the code/comments alone** (`TrackerAdapter.statusFlowHints`'s doc
  comment, the tracker-adapter-boundary reference doc). Rejected: the whole point of an ADR log is
  that a reader following ADR-0009 — the record `lore check`, `cli-surface.md`, and
  `architecture.md` all cite for reconciliation — should not be routed to a stale claim with
  nothing telling them it moved.

---

See also: [ADR-0009: Story↔Task coupling & status reconciliation](0009-story-task-coupling-reconciliation.md),
[ADR-0020: Tracker version gates are minimum floors](0020-tracker-version-gates-are-minimum-floors.md)
(a different tracker-polymorphism-adjacent decision — version floors, not status vocabulary),
[backlog-cli-contract.md's Tracker adapter boundary](../reference/backlog-cli-contract.md#tracker-adapter-boundary),
[architecture.md](../reference/architecture.md),
and the [ADR log](index.md).
