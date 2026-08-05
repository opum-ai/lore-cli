---
id: LCLI-314
title: Support OKF 0.2
status: To Do
assignee: []
created_date: '2026-08-04 21:46'
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
- [ ] #1 lore emits OKF 0.2 bundles by default (root index carries okf_version 0.2)
- [ ] #2 Existing OKF 0.1 bundles still load, validate, and check without new errors
- [ ] #3 docs/reference/okf-conformance.md describes lore's 0.2 conformance and the 0.1 compatibility position
- [ ] #4 All subtasks are Done
<!-- AC:END -->
