---
id: LCLI-314.1
title: 'Negotiate okf_version: emit 0.2, keep reading 0.1 bundles'
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 21:46'
updated_date: '2026-08-05 11:40'
labels: []
dependencies: []
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/reference/okf-conformance.md
modified_files:
  - docs/reference/okf-conformance.md
  - src/commands/check.ts
  - src/commands/export.ts
  - src/commands/new.ts
  - src/commands/validate.ts
  - src/core/bundle.ts
  - src/core/check.ts
  - src/core/concept.ts
  - src/core/ladybug-driver.ts
  - src/core/ladybug-source.ts
  - src/core/okf-version.ts
  - src/core/profile.ts
  - src/core/scaffold.ts
  - src/core/schema.ts
  - src/core/template.ts
  - src/core/validate.ts
  - src/core/workspace-projection.ts
  - test/bundle.test.ts
  - test/check.test.ts
  - test/init.test.ts
  - test/okf-version.test.ts
  - test/profile.test.ts
  - test/scaffold.test.ts
  - test/supersede.test.ts
  - test/traversal.test.ts
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
- [x] #1 The bundle-root index's okf_version is parsed and available to the schema, template, and check layers as typed bundle state
- [x] #2 lore init stamps okf_version 0.2 on a new bundle
- [x] #3 A bundle stamped okf_version 0.1 loads, validates, and checks with 0.1 semantics and no new errors or warnings
- [x] #4 A bundle with a missing or unparseable okf_version is handled explicitly and documented, not silently defaulted
- [x] #5 A custom profile declaring okf_version 0.1 or 0.2 is honored; an unrecognized version fails loud as a validation error (exit 6)
- [x] #6 Tests cover both versions end to end, including a 0.1 fixture bundle that must not drift
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a typed OKF bundle-version seam that reads the bundle-root index, distinguishes declared, legacy-missing, and unsupported-future states, preserves 0.1 fallback semantics explicitly, and rejects malformed values.
2. Restrict producer profiles to supported 0.1 or 0.2 targets, move the built-in profile and lore init output to 0.2, and keep custom 0.1 profiles honored.
3. Thread the resolved bundle state through bundle loading, schema validation, template/new generation, and check so later field migrations can branch on one typed value; do not add automatic or in-place migration.
4. Add focused and end-to-end tests for 0.2 init, declared 0.1 compatibility without byte drift, missing/malformed/unknown declarations, custom profile targets, and check exit behavior.
5. Document the version negotiation and explicit migration policy through Lore, then run focused suites, lint, typecheck, the full test suite, strict Lore checks, and an adversarial self-review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification 2026-08-05: full suite 2474 pass, 1 skip, 0 fail across 76 files; focused version, bundle, check, and scaffold suite 370 pass; npm run lint and npm run typecheck pass; lore validate --strict and lore check --strict report zero findings; git diff --check passes. Acceptance evidence covers typed state propagation, default 0.2 init, declared 0.1 strict-clean byte stability, explicit missing/malformed/future handling, supported custom producer targets, and unsupported target validation mapped to exit 6. Decision: no automatic or in-place migration; the repository docs root remains authored as 0.1. Future declarations are retained and consumed best-effort with a warning, matching upstream OKF versioning guidance. Documentation was updated through lore replace and the required lore sync completed. Lore committed the pre-delivery Backlog evidence as da3d308; the verified implementation, documentation, generated log, and tests were committed locally as 90c5655. No remote action was taken.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added typed OKF version negotiation across bundle, schema, template, check, validation, and projection paths. New bundles emit 0.2; declared 0.1 bundles remain strict-clean and byte-stable; malformed or unsupported producer declarations fail validation. Verified by 2474 passing tests with 1 skip, a 370-test focused suite, lint, typecheck, strict Lore validation/checking, and diff checks. Delivered locally in 90c5655.
<!-- SECTION:FINAL_SUMMARY:END -->
