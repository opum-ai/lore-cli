---
id: LCLI-314.4
title: >-
  Adopt the OKF 0.2 trust and lifecycle frontmatter families (verified, status,
  stale_after) and the actor convention
status: To Do
assignee: []
created_date: '2026-08-04 21:47'
labels: []
dependencies:
  - LCLI-314.1
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/adr/0013-lore-state-directory.md
parent_task_id: LCLI-314
priority: medium
type: feature
ordinal: 431000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OKF 0.2 adds two additive frontmatter families lore does not model today, plus a naming convention for actors.

Trust (§5): `verified` — confirmation events recorded by an actor.
Lifecycle (§5): `status` (draft | stable | deprecated) and `stale_after` (an absolute date after which the concept is considered stale).
Actors (§7): `<producer>/<version>`, `human:<id>`, `process:<id>`.

The sharp edge here is `status`. lore already owns a `status` frontmatter key with entirely different semantics: it is the Story/Task roll-up value driven by `[reconcile]` in `.lore/config.toml` (`src/config.ts`, `RECONCILE_MODES = ["task-rollup"]`) and reconciled against the tracker's status flow (`src/commands/reconcile-shared.ts:106`, `readStatusFlow`). Those two meanings collide on one key name.

Resolve that collision explicitly before writing code. Do not merge the two vocabularies and do not silently coerce a roll-up status such as "In Progress" into an OKF lifecycle value such as "stable" — a roll-up status is tracker state, an OKF lifecycle status is a publishing claim, and conflating them would make `lore sync` rewrite a documentation claim from a tracker transition. Whichever way it is resolved (namespacing one of them, keeping lore's meaning and declining the OKF one, or mapping with an explicit opt-in), record the decision as an ADR, because it is a contract change visible to every downstream consumer of the projection.

`stale_after` and `verified` have no such collision and should be straightforward additive schema work.

Also decide whether `stale_after` produces a `lore check` finding once passed. A staleness date nothing ever reads is decorative; if it does produce a finding, it must land in a defined tier and must not be an error, since OKF §11 forbids rejecting a bundle for this class of thing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 verified and stale_after are recognized, validated frontmatter keys under okf_version 0.2
- [ ] #2 The collision between OKF lifecycle status and lore's existing task-rollup status is resolved and recorded in an ADR
- [ ] #3 No code path coerces a task-rollup status into an OKF lifecycle value, or the reverse, without an explicit opt-in
- [ ] #4 Actor-valued fields accept the section 7 conventions and reject malformed actors with a validation error
- [ ] #5 Whether an elapsed stale_after emits a lore check finding is decided, implemented, and tiered as a non-error
- [ ] #6 Under okf_version 0.1, none of these keys change existing behavior
- [ ] #7 Tests cover each new key, the actor convention, and the status-collision decision
<!-- AC:END -->
