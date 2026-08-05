---
id: LCLI-314.6
title: >-
  Widen lore check's conformance tiers for OKF 0.2 and rewrite
  okf-conformance.md
status: To Do
assignee: []
created_date: '2026-08-04 21:48'
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
- [ ] #1 lore check classifies every new 0.2 key into a defined tier, with no 0.2 field falling through unclassified
- [ ] #2 No OKF section 11 must-not-reject condition is reported by lore as a conformance rejection
- [ ] #3 Any lore finding that goes beyond section 11 is documented as a lore-specific gate rather than an OKF conformance requirement
- [ ] #4 docs/reference/okf-conformance.md cites OKF 0.2 section numbers and describes both the 0.2 and 0.1 positions
- [ ] #5 Source-header cross-references to okf-conformance.md are updated where their cited section numbers changed
- [ ] #6 lore check passes on the repo's own bundle after the doc rewrite
<!-- AC:END -->
