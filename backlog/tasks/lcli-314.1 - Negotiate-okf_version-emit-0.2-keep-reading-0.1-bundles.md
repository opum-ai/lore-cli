---
id: LCLI-314.1
title: 'Negotiate okf_version: emit 0.2, keep reading 0.1 bundles'
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
parent_task_id: LCLI-314
priority: high
type: feature
ordinal: 428000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the OKF version a negotiated value rather than a hardcoded constant, so the rest of the 0.2 migration has a version to branch on.

Today the version is stamped in two places and never read back for behavior:
- `src/core/scaffold.ts:150` writes `okf_version: profile.okfVersion` onto the bundle-root `docs/index.md` — the sole carrier in the bundle (`src/core/scaffold.ts:40`, and `src/core/indexes.ts:23-24` is careful never to synthesize it elsewhere).
- `src/core/profile.ts:851` hardcodes `okfVersion: "0.1"` in the built-in default profile; a custom profile supplies it via the required `profile.okf_version` key (`src/core/profile.ts:324`).
- `src/core/schema.ts:83` exempts `okf_version` from the extra-key warning, and `src/core/ladybug-lifecycle.ts:700` cross-checks it between a projection value and its manifest.

Nothing currently reads the stamped value to decide how to parse or validate. This task adds that seam: parse the root index's `okf_version`, expose it to the schema/template/check layers, and let a 0.1 bundle keep 0.1 semantics while new bundles get 0.2.

Deliberately out of scope: the field-level breaking changes (`timestamp`, `# Citations`) and the additive families — those are the sibling subtasks, which consume the seam this one adds.

Open decision for the implementer to research and record: whether `lore` should offer an in-place `0.1 -> 0.2` bundle upgrade path (a command or a flag on an existing one), or whether upgrading is left to the field-level subtasks acting on an explicit user request. Do not ship a silent auto-upgrade — rewriting every concept's frontmatter on an ordinary read would violate the byte-stability contract in ADR-0011.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The bundle-root index's okf_version is parsed and available to the schema, template, and check layers as typed bundle state
- [ ] #2 lore init stamps okf_version 0.2 on a new bundle
- [ ] #3 A bundle stamped okf_version 0.1 loads, validates, and checks with 0.1 semantics and no new errors or warnings
- [ ] #4 A bundle with a missing or unparseable okf_version is handled explicitly and documented, not silently defaulted
- [ ] #5 A custom profile declaring okf_version 0.1 or 0.2 is honored; an unrecognized version fails loud as a validation error (exit 6)
- [ ] #6 Tests cover both versions end to end, including a 0.1 fixture bundle that must not drift
<!-- AC:END -->
