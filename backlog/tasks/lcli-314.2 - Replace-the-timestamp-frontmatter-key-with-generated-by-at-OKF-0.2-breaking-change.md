---
id: LCLI-314.2
title: >-
  Replace the timestamp frontmatter key with generated: { by, at } (OKF 0.2
  breaking change)
status: To Do
assignee: []
created_date: '2026-08-04 21:47'
updated_date: '2026-08-04 21:47'
labels: []
dependencies:
  - LCLI-314.1
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
documentation:
  - docs/adr/0011-frontmatter-serialization-stability.md
  - docs/reference/okf-conformance.md
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
- [ ] #1 Under okf_version 0.2, lore new stamps generated: { by, at } and no longer stamps timestamp
- [ ] #2 generated.at round-trips as a string, never coerced to a Date, matching the existing JSON_SCHEMA guarantee
- [ ] #3 generated.by uses the OKF 0.2 actor convention and identifies lore with its version
- [ ] #4 Under okf_version 0.1, timestamp is still emitted and accepted unchanged
- [ ] #5 A 0.2 concept still carrying timestamp is tolerated (warned, not rejected) per OKF conformance section 11
- [ ] #6 Byte-stable golden tests cover the new key and prove no unrelated frontmatter key is reordered (ADR-0011)
- [ ] #7 Any timestamp-to-generated conversion of existing files happens only on an explicit user action, never as a side effect of a read
<!-- AC:END -->
