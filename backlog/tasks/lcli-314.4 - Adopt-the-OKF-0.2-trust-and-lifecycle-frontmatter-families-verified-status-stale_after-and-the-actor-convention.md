---
id: LCLI-314.4
title: >-
  Adopt the OKF 0.2 trust and lifecycle frontmatter families (verified, status,
  stale_after) and the actor convention
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 21:47'
updated_date: '2026-08-05 15:42'
labels: []
dependencies:
  - LCLI-314.1
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/adr/0013-lore-state-directory.md
  - docs/adr/0019-separate-okf-lifecycle-from-lore-task-progress.md
  - docs/reference/okf-conformance.md
modified_files:
  - src/core/schema.ts
  - src/core/check.ts
  - src/core/okf-version.ts
  - src/core/concept.ts
  - src/core/bundle.ts
  - src/core/projection.ts
  - src/core/ladybug-source.ts
  - src/commands/check.ts
  - src/commands/sync.ts
  - src/commands/reconcile-shared.ts
  - src/commands/link.ts
  - src/commands/rename.ts
  - src/commands/supersede.ts
  - src/commands/export.ts
  - test/schema.test.ts
  - test/validate.test.ts
  - test/check.test.ts
  - test/sync.test.ts
  - test/reconcile-shared.test.ts
  - test/schema-export.test.ts
  - test/supersede.test.ts
  - test/concept.test.ts
  - .lore/schemas/epic.schema.json
  - .lore/schemas/story.schema.json
  - .lore/schemas/spec.schema.json
  - .lore/schemas/adr.schema.json
  - .lore/schemas/runbook.schema.json
  - .lore/schemas/reference.schema.json
  - docs/adr/0019-separate-okf-lifecycle-from-lore-task-progress.md
  - docs/reference/okf-conformance.md
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
- [x] #1 verified and stale_after are recognized, validated frontmatter keys under okf_version 0.2
- [x] #2 The collision between OKF lifecycle status and lore's existing task-rollup status is resolved and recorded in an ADR
- [x] #3 No code path coerces a task-rollup status into an OKF lifecycle value, or the reverse, without an explicit opt-in
- [x] #4 Actor-valued fields accept the section 7 conventions and reject malformed actors with a validation error
- [x] #5 Whether an elapsed stale_after emits a lore check finding is decided, implemented, and tiered as a non-error
- [x] #6 Under okf_version 0.1, none of these keys change existing behavior
- [x] #7 Tests cover each new key, the actor convention, and the status-collision decision
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shared OKF 0.2 runtime/editor schemas for lifecycle status, lore_task_status, stale_after, verified events, and section-7 actor identities; apply actor validation consistently to generated.by, sources[].author, and verified[].by.
2. Keep task rollup computation semantically separate, selecting status for 0.1 bundles and lore_task_status for 0.2 bundles in sync and drift checking; never translate between rollup and lifecycle values.
3. Add a UTC-date seam to lore check and emit a warning-tier stale-after finding when today is on or after a valid 0.2 stale_after date, without mutating content or changing 0.1 behavior.
4. Cover runtime validation, editor schemas, sync/check behavior, staleness boundaries, malformed actors, and byte-stable 0.1 compatibility with focused tests.
5. Create an ADR through Lore, update OKF conformance prose through Lore, regenerate editor schemas, and run Lore dry-run synchronization pending separate commit authority.
6. Run focused suites, lint, typecheck, the full test suite, strict Lore validation/checking as permitted by unsynchronized docs state, diff checks, and an adversarial self-review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decision approved 2026-08-05: keep OKF lifecycle status separate from Lore task progress. Under OKF 0.2, status is the authored draft|stable|deprecated lifecycle claim and lore_task_status is the derived todo|in-progress|done rollup. Under 0.1, existing status rollup behavior remains unchanged. No automatic coercion is permitted. Elapsed stale_after is warning-tier; verification validates syntax/evidence shape, not real-world identity.

Verification 2026-08-05: npm test passed 2,508 tests with 1 environment-specific skip and 0 failures; npm run typecheck passed; npm run lint passed; lore validate --strict and lore check --strict both passed with 0 findings; lore sync --dry-run reported only docs/adr/index.md and docs/log.md. Adversarial self-review found and fixed legacy 0.1 re-serialization in token estimates and projections, then the full suite passed. Delivery remains local and task stays In Progress: no commit/push authority was granted, and a real lore sync would auto-commit every dirty backlog/ path, including unrelated preserved LCLI-317/318/319 files. Those three files remain byte-identical to their recorded SHA-1 hashes.

Delivery authority granted by the user after local verification: local commits and temporary isolation/restoration of unrelated LCLI-317/LCLI-318/LCLI-319 are authorized for managed Lore synchronization. No push, PR, merge, publication, remote mutation, or next-wave execution is authorized.

Delivered locally in implementation commit 0b31a93 after preliminary managed Backlog sync commit 09a8fe2. Post-commit verification: npm test passed 2,508 tests with 1 environment-specific skip and 0 failures (8,489 expectations); npm run typecheck passed; npm run lint passed; npm run lore -- validate --strict --json passed with 0 warnings/errors; npm run lore -- check --strict --json passed with 0 findings; git diff checks passed. Unrelated LCLI-317/LCLI-318/LCLI-319 task files remain temporarily isolated for exact restoration after managed settlement.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented OKF 0.2 trust, lifecycle, staleness, and actor conventions while keeping authored lifecycle status separate from Lore task progress; preserved OKF 0.1 behavior, documented the decision in ADR-0019, regenerated editor schemas, and verified with the complete 2,508-test suite plus typecheck, lint, and strict Lore validation/checking.
<!-- SECTION:FINAL_SUMMARY:END -->
