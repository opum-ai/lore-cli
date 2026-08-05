---
id: LCLI-314.2
title: >-
  Replace the timestamp frontmatter key with generated: { by, at } (OKF 0.2
  breaking change)
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 21:47'
updated_date: '2026-08-05 12:10'
labels: []
dependencies:
  - LCLI-314.1
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/adr/0011-frontmatter-serialization-stability.md
  - docs/reference/okf-conformance.md
modified_files:
  - docs/reference/okf-conformance.md
  - src/commands/new.ts
  - src/core/profile.ts
  - src/core/scaffold.ts
  - src/core/schema.ts
  - src/core/template.ts
  - test/concept.test.ts
  - test/init.test.ts
  - test/new.test.ts
  - test/profile.test.ts
  - test/scaffold.test.ts
  - test/schema.test.ts
  - test/template.test.ts
  - test/validate.test.ts
parent_task_id: LCLI-314
priority: high
type: feature
ordinal: 429000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OKF 0.2 §13.1 retires the `timestamp` frontmatter key in favor of a `generated` mapping carrying `by` (the producing actor) and `at` (the instant) — §5.2.

lore is squarely affected: the built-in base profile declares `timestamp: { required: false, kind: "datetime" }` (`src/core/profile.ts:860`), `lore new` stamps it into every concept via the template layer, and `src/core/concept.ts` deliberately parses YAML with `JSON_SCHEMA` so an ISO timestamp stays a string rather than becoming a Date (`src/core/concept.ts:27,119`). That same string-not-Date guarantee has to hold for `generated.at`.

`by` should use the OKF 0.2 actor convention (§7): `<producer>/<version>`, `human:<id>`, or `process:<id>`. lore writing its own concepts is a producer, so the natural value is `lore/<version>` sourced from `src/meta.ts` — confirm that against the actual version surface rather than assuming.

Two constraints the implementer must respect:
- ADR-0011 forbids re-sorting an author's existing frontmatter keys; lore-written keys land in a defined append slot. Swapping `timestamp` for `generated` must not reorder anything else, and the byte-stable golden tests need extending, not relaxing.
- Under a 0.1 bundle (see LCLI-314.1), `timestamp` must still be accepted and still round-trip. This is a 0.2-only emission change, not a global rename.

Migration of existing concepts is a real question, not an assumption: decide and record whether lore converts `timestamp` to `generated` on an explicit user action only, and never as a side effect of an ordinary read or write.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Under okf_version 0.2, lore new stamps generated: { by, at } and no longer stamps timestamp
- [x] #2 generated.at round-trips as a string, never coerced to a Date, matching the existing JSON_SCHEMA guarantee
- [x] #3 generated.by uses the OKF 0.2 actor convention and identifies lore with its version
- [x] #4 Under okf_version 0.1, timestamp is still emitted and accepted unchanged
- [x] #5 A 0.2 concept still carrying timestamp is tolerated (warned, not rejected) per OKF conformance section 11
- [x] #6 Byte-stable golden tests cover the new key and prove no unrelated frontmatter key is reordered (ADR-0011)
- [x] #7 Any timestamp-to-generated conversion of existing files happens only on an explicit user action, never as a side effect of a read
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Retain timestamp as the OKF 0.1 validator and add an OKF 0.2 generated runtime/editor schema without changing canonical frontmatter order.
2. Make lore new and the root scaffold choose version-specific provenance: timestamp for 0.1, generated.by = lore/<package version> plus generated.at for 0.2.
3. Emit an advisory warning, never a rejection, when a 0.2 concept carries legacy timestamp; preserve authored content without implicit conversion.
4. Cover 0.2 emission, actor/version identity, string round-trip, unchanged 0.1 output, legacy warning behavior, and ADR-0011 ordering/fixpoints.
5. Update conformance documentation through Lore and verify focused/full tests, lint, typecheck, strict Lore checks, diff checks, and adversarial review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and acceptance-verified locally on dev at base 970097df328e8108d00dddc68f5b206d7ca348bf.

- OKF 0.2 creation and root scaffolding emit generated.by as lore/<package-version> and generated.at as the injected ISO timestamp; timestamp is not emitted.
- OKF 0.1 emission and validation retain timestamp unchanged.
- The 0.2 runtime and editor schemas validate generated.by and generated.at while keeping generated.at a string under JSON_SCHEMA parsing.
- Legacy timestamp in a 0.2 concept is tolerated with an advisory warning and is never rewritten as a read/check side effect.
- Canonical frontmatter ordering was deliberately left unchanged; byte-stable and fixpoint tests cover the version-specific append behavior.
- Conformance documentation records the explicit-only migration policy.

Evidence: focused suites 420/420 pass plus validate.test.ts 67/67 after the final correction; npm run lint passes; npm run typecheck passes; full bun test --dots passes with 2481 pass, 1 skip, 0 fail across 76 files and 8382 expect calls; lore validate --strict --json reports 0 errors and 0 warnings; lore check --strict --json reports 0 findings across 64 files; git diff --check passes.

Adversarial review removed a proposed canonical-order change that could have reordered custom 0.1 profiles. The final design uses the existing recognized-key append seam and preserves prior ordering.

Settlement is intentionally retained In Progress: lore sync --dry-run --json reports only docs/log.md would change, but actual lore sync would create a commit containing dirty Backlog state. No wave-3 commit authority exists, and unrelated untracked LCLI-317, LCLI-318, and LCLI-319 task files appeared concurrently. They were not touched.
<!-- SECTION:NOTES:END -->
