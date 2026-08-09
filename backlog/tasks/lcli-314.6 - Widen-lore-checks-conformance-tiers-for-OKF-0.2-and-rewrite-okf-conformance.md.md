---
id: LCLI-314.6
title: >-
  Widen lore check's conformance tiers for OKF 0.2 and rewrite
  okf-conformance.md
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 21:48'
updated_date: '2026-08-05 18:57'
labels: []
dependencies:
  - LCLI-314.2
  - LCLI-314.3
  - LCLI-314.4
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/reference/okf-conformance.md
modified_files:
  - docs/index.md
  - docs/reference/cli-surface.md
  - docs/reference/okf-conformance.md
  - src/commands/reconcile-shared.ts
  - src/core/bundle.ts
  - src/core/indexes.ts
  - src/core/instructions.ts
  - src/core/schema.ts
  - src/core/validate.ts
  - test/check.test.ts
  - test/schema.test.ts
  - docker/e2e/run-e2e.sh
parent_task_id: LCLI-314
priority: medium
type: feature
ordinal: 433000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Close out the OKF 0.2 migration by making `lore check` classify 0.2 findings correctly and by bringing the normative conformance doc back in line with what lore actually does.

`src/core/schema.ts` owns the tier classification and its header already states the tiers mirror OKF §9 plus the active profile, cross-referencing `docs/reference/okf-conformance.md`. OKF 0.2 renumbers that material: conformance is now §11, and it is explicit that a consumer MUST NOT reject a bundle for missing optional fields, unknown `type` values, unknown extra keys, broken cross-links, or missing `index.md` files.

That last list needs auditing against lore's real behavior rather than assumed to match. lore's tolerance model was built for §9 and is broadly compatible, but `lore check` does report dangling links, and this repo's own CLAUDE.md gate depends on that exit-6 behavior. Determine whether lore's link findings are a conformance rejection in the OKF sense or a lore-specific quality gate layered above conformance — and state the answer in the doc, because a downstream consumer reading only §11 would otherwise expect lore to stay quiet.

The doc rewrite is not cosmetic: `docs/reference/okf-conformance.md` is the reference other modules cite by name from their headers (`src/core/schema.ts:16`, `src/core/indexes.ts:24`), so stale section numbers in it propagate into source comments.

Drive the doc changes through the `lore` CLI per this repo's own contract, not a plain editor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore check classifies every new 0.2 key into a defined tier, with no 0.2 field falling through unclassified
- [x] #2 No OKF section 11 must-not-reject condition is reported by lore as a conformance rejection
- [x] #3 Any lore finding that goes beyond section 11 is documented as a lore-specific gate rather than an OKF conformance requirement
- [x] #4 docs/reference/okf-conformance.md cites OKF 0.2 section numbers and describes both the 0.2 and 0.1 positions
- [x] #5 Source-header cross-references to okf-conformance.md are updated where their cited section numbers changed
- [x] #6 lore check passes on the repo's own bundle after the doc rewrite
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit every OKF 0.2 frontmatter family and current validate/check finding tier against upstream §11, then add a regression matrix proving recognized 0.2 keys do not fall through to unknown-key handling.
2. Pin the §11 MUST-NOT-reject cases in focused tests, preserving broken links and other stricter Lore checks as explicitly Lore-specific quality/profile gates rather than OKF conformance failures.
3. Rewrite docs/reference/okf-conformance.md around OKF 0.2 §11 while retaining the negotiated 0.1 position, and update stale source-header section cross-references. Author only outside Lore-managed regions.
4. Run focused tests, lore sync, strict validation/check, typecheck, lint, the full suite, and diff hygiene; record exact evidence and adversarially review every acceptance criterion.

5. Repair the protected Docker E2E harness for the delivered OKF 0.2 contracts: exercise task reconciliation through lore_task_status, keep --status coverage on lifecycle status, seed probes at version-neutral frontmatter anchors, and expect the seventh Attested Computation schema; rerun the harness and every required gate before protected merge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation and acceptance verification are complete locally. The upstream OKF 0.2 specification was rechecked at the task reference: §11 defines the conformance floor and the five MUST-NOT-reject cases, while §6 defines broken-link tolerance.

Behavioral correction: `status` is now an explicit OKF 0.2 reserved field even when a custom profile does not redeclare it, eliminating the one audited unknown-key fall-through. A minimal-profile regression matrix covers generated, sources and nested credibility signals, usage_window, verified, status, stale_after, lore_task_status, and every Attested Computation contract field. A check regression pins optional fields/missing indexes as clean and names broken links as a Lore coherence rule.

Documentation: okf-conformance.md now maps 0.2 §11 to legacy 0.1 §9, inventories each 0.2 field tier, and distinguishes Lore producer/coherence gates from OKF rejection. Navigation, CLI wording, generated instructions, and source-header section references were reconciled.

Verification: `bun test test/schema.test.ts test/check.test.ts test/validate.test.ts` — 401 pass, 0 fail; `npm test` — 2524 pass, 1 skip, 0 fail, 8562 expectations across 76 files; `npm run typecheck` — pass; `npm run lint` — pass across 191 files; `lore validate --strict --json` — 0 errors/0 warnings; `lore check --strict --json` — 0 findings, complete true across 65 files; `git diff --check` — pass. `lore sync --dry-run --json` reports only docs/log.md would change and no Backlog commit.

Adversarial self-review (no independent reviewer authorized) rechecked every acceptance criterion, the custom-profile seam, 0.1 behavior, unknown type/key tolerance, broken-link labeling, missing-index behavior, source section references, unrelated dirty-file hashes, and diff scope. No acceptance defect remains.

Delivery hold: actual `lore sync` would write docs/log.md and commit dirty Backlog state. No local commit authority was granted, so the task intentionally remains In Progress with verified artifacts retained uncommitted; no push or remote action was taken.

Local delivery completed with preliminary Backlog evidence commit 33f5a17ec5a6f14bcbd611213e57561f421d3cf4 and implementation commit 825e0b9. Post-commit verification: focused suite 401 pass/0 fail; typecheck pass; lint pass across 191 files; strict Lore validation 0 errors/0 warnings; strict Lore check 0 findings across 65 files; git diff --check pass. The previously recorded full suite remains 2524 pass, 1 skip, 0 fail because no source changed after that run. The earlier delivery hold is resolved; no push or remote action was taken.

Protected delivery PR #327 exposed 17 Docker E2E failures in run 31035933982 while the other seven jobs passed. The failures trace to stale pre-0.2 harness assumptions and cascades: task rollups still mutate/assert status instead of lore_task_status; timestamp-anchored probe insertions no-op under 0.2 generated provenance; full-profile schema export still expects six schemas instead of seven. Reopened for CI repair; PR head is e972fe2ed65abb5160f29f2f8f5d684e7aed5b05.

Protected-check repair verified 2026-08-05: the full local Docker E2E harness passed 343/343 with 0 failures after updating task-rollup drift/custom-flow assertions to lore_task_status, preserving lifecycle --status coverage from the real 0.2 bundle root, using version-neutral probe anchors, and covering all seven default schemas. Post-repair gates: bun test --dots 2524 pass, 1 skip, 0 fail; npm run lint passed across 191 files; npm run typecheck passed; lore validate --strict reported 0 errors/0 warnings; lore check --strict reported 0 findings across 65 files; bash -n and git diff --check passed. Adversarial self-review traced every original CI failure and both local rerun cascades to a corrected assertion or isolated probe; no product-code change or unresolved acceptance defect remains.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed OKF 0.2 conformance and repaired its protected Docker E2E coverage for version-selected task rollups, lifecycle status, generated provenance, and the seven-type schema set. Verified with 343/343 Docker E2E checks, 2524 passing unit tests plus 1 skip, lint, typecheck, strict Lore validation/checking, shell syntax, and diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->
