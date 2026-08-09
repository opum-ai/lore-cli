---
id: LCLI-314
title: Support OKF 0.2
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 21:46'
updated_date: '2026-08-09 06:53'
labels: []
dependencies: []
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/reference/okf-conformance.md
priority: high
type: feature
ordinal: 427000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore currently emits and validates OKF 0.1: `src/core/scaffold.ts` stamps `okf_version: "0.1"` onto the bundle-root `docs/index.md` (the sole carrier), and the built-in profile hardcodes `okfVersion: "0.1"` (`src/core/profile.ts:851`). OKF 0.2 is published and carries two deliberate breaking changes plus several additive families, so adopting it is a real migration, not a version-string bump.

Per the 0.2 spec (fetched 2026-08-04 from the URL in References):

Breaking (§13.1):
- `timestamp` is replaced by `generated: { by, at }` (§5.2). lore's base profile declares `timestamp: { required: false, kind: "datetime" }` (`src/core/profile.ts:860`) and stamps it in new concepts, so every emitted and existing concept is affected.
- The body `# Citations` list is replaced by a `sources` frontmatter key (§5.1).

Additive:
- Provenance signals on `sources` (`author`, `usage_count`, `last_modified`).
- Trust family: `generated`, `verified`.
- Lifecycle family: `status`, `stale_after`. Note lore already uses `status` for Story/Task roll-up, so the two meanings must be reconciled, not silently merged.
- New `Attested Computation` type with `runtime`/`parameters`/`computation`/`executor`/`attester`, and a conventional `# Computation` heading (§4.2, §10).
- Actor convention `<producer>/<version>`, `human:<id>`, `process:<id>` (§7).

Conformance (§11) still floors at 'parseable frontmatter + non-empty type', and consumers MUST NOT reject on unknown types/keys — lore's existing tolerance model already matches this, so the check tiers in `src/core/schema.ts` should need widening rather than tightening.

This is the tracking parent; the subtasks carry the deliverable slices. It is done when lore can emit, validate, and check a 0.2 bundle, and still reads existing 0.1 bundles without failing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore emits OKF 0.2 bundles by default (root index carries okf_version 0.2)
- [x] #2 Existing OKF 0.1 bundles still load, validate, and check without new errors
- [x] #3 docs/reference/okf-conformance.md describes lore's 0.2 conformance and the 0.1 compatibility position
- [x] #4 All subtasks are Done
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile all six live subtasks against their Done status, checked acceptance criteria, final summaries, and the completed doc-13 delivery record. 2. Verify the aggregate parent contract against the integrated dev tree with focused OKF version/init compatibility tests and direct conformance-document inspection. 3. Run the task-finalization workflow, adversarially review each aggregate criterion, record exact evidence, and finalize only if every criterion is objectively satisfied. 4. Settle doc-16 and recompute the live frontier without starting metadata preparation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent closeout verification 2026-08-09:
- All six live subtasks LCLI-314.1 through LCLI-314.6 are Done, each with zero unchecked acceptance criteria and a final summary. Completed campaign doc-13 records delivery through PR #327; verified head 995b51e4d92069bf0dc379020374e9d51368b068 is an ancestor of current dev.
- Focused aggregate suite passed: bun test test/okf-version.test.ts test/init.test.ts test/bundle.test.ts test/check.test.ts --dots — 435 pass, 0 fail.
- Adversarial compatibility slice passed: bun test test/init.test.ts test/bundle.test.ts test/check.test.ts test/schema.test.ts test/validate.test.ts --test-name-pattern "conformant bundle|declared 0.1|OKF 0.1" — 10 pass, 0 fail. It explicitly covers default 0.2 init, declared 0.1 typed load without byte drift, strict-clean 0.1 check, and 0.1 field/type tolerance.
- Lore context inspection confirms docs/reference/okf-conformance.md documents default 0.2 production, declared/missing 0.1 consumption, no implicit migration, the 0.2 §11 versus 0.1 §9 floors, and version-specific fields. lore validate --strict --json reports 0 errors and 0 warnings; lore check --strict --json exits 0.
- git diff --check passes. No source or docs change was required for this aggregate parent closeout.
- Adversarial self-review (no independent reviewer authorized) challenged each parent criterion against live tests, delivered ancestry, current documentation, and live subtask metadata. No unmet criterion or scope defect was found.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reconciled the completed OKF 0.2 migration parent: new bundles emit 0.2, declared 0.1 bundles remain compatible and byte-stable, the conformance reference documents both positions, and all six delivered subtasks are Done. Verified with 435 focused tests, a 10-test adversarial version slice, strict Lore validation/checking, delivery ancestry, and diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->
