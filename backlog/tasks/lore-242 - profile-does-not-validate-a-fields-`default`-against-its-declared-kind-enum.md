---
id: LORE-242
title: profile does not validate a field's `default` against its declared kind/enum
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-bundle-check
  - codex-review-followup
  - profile
  - schema
dependencies: []
priority: low
type: bug
ordinal: 344000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A profile field spec's `default` attribute is accepted and re-emitted with no check that it conforms to the field's declared `kind`/`enum`. `parseFieldSpec` copies the raw TOML/JSON value straight through — `if ("default" in table) { spec.default = table.default; }` (src/core/profile.ts:543-545) — and `buildJsonSchema` injects it verbatim into the emitted Draft-7 editor schema (src/core/profile.ts:732-733). The result is an internally-inconsistent JSON Schema that misleads an editor's autocompletion.

Reproduced live: a profile declaring `count = { kind = "integer", default = "not-a-number" }` and `color = { enum = ["red", "green"], default = "purple" }` loads without error, and `lore schema export` emits `count` as `{"anyOf":[{"type":"integer",…},{"type":"null"}],"default":"not-a-number"}` (string default on an integer field) and `color` with `"default":"purple"` sitting outside its own enum. Neither is flagged.

This is the same class of author-mistake cross-check the profile parser already performs at parse time for adjacent cases — `assertNonEmptyEnum` (profile.ts:559), the enum-implies-kind-"string" check (profile.ts:522), and template-path confinement (profile.ts:463) — each raising a `validation` LoreError that names the offending field. A `default` that contradicts its field's kind/enum belongs to the same family and should fail the same way, at parse time, where the error can point at the field the author can fix. The `default` is editor-advertised only and never stamped onto a concept (profile.ts:90, 744-746), so this is about the honesty of the emitted schema, not runtime concept validation.

Provenance: doc-2 Codex second-opinion review, low-severity finding (cluster core-bundle-check), re-audited round 3 and confirmed still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A profile declaring a `default` whose type contradicts the field's declared `kind` (e.g. `{ kind = "integer", default = "x" }`, or a string default on a `boolean`/`datetime` field) fails profile load / `lore schema export` with a `validation` LoreError naming the offending field.
- [ ] #2 A `default` not present in the field's `enum` (e.g. `{ enum = ["red","green"], default = "purple" }`) fails the same way with a message naming the field.
- [ ] #3 A `default` that is consistent with the declared kind/enum (e.g. `{ kind = "integer", default = 3 }`, `{ enum = ["red","green"], default = "red" }`) still loads and is emitted into the JSON Schema exactly as today.
- [ ] #4 The check covers list fields' element/`items` shape too, or explicitly documents that a list field's `default` is validated against the whole-list shape — no silently-inconsistent list default slips through.
- [ ] #5 Regression tests in test/profile.test.ts cover the mismatched-kind case, the out-of-enum case, and a consistent-default happy path (still emitted).
<!-- AC:END -->
