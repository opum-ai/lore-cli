---
id: LCLI-242
title: profile does not validate a field's `default` against its declared kind/enum
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
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
- [x] #1 A profile declaring a `default` whose type contradicts the field's declared `kind` (e.g. `{ kind = "integer", default = "x" }`, or a string default on a `boolean`/`datetime` field) fails profile load / `lore schema export` with a `validation` LoreError naming the offending field.
- [x] #2 A `default` not present in the field's `enum` (e.g. `{ enum = ["red","green"], default = "purple" }`) fails the same way with a message naming the field.
- [x] #3 A `default` that is consistent with the declared kind/enum (e.g. `{ kind = "integer", default = 3 }`, `{ enum = ["red","green"], default = "red" }`) still loads and is emitted into the JSON Schema exactly as today.
- [x] #4 The check covers list fields' element/`items` shape too, or explicitly documents that a list field's `default` is validated against the whole-list shape — no silently-inconsistent list default slips through.
- [x] #5 Regression tests in test/profile.test.ts cover the mismatched-kind case, the out-of-enum case, and a consistent-default happy path (still emitted).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In parseFieldSpec (src/core/profile.ts), after kind/enum/items are resolved, add assertDefaultMatchesShape(spec, table.default, where, source) that runs baseKindToZod(spec).safeParse(defaultValue) — reusing the SAME kind->Zod predicates buildJsonSchema's emitted type/enum/items derive from (z.toJSONSchema), not a second hand-rolled kind->JS-type map. On failure, throw a validation LoreError naming the field ('${where}.default (...) does not match its declared ${kind|enum}'). 2. Because baseKindToZod already returns z.array(itemToZod(items)) for kind:list, this same call covers AC#4 (whole-list shape, not just 'is it an array') for free — documented in a FieldSpec.default doc comment. 3. Add regression tests to test/profile.test.ts: mismatched-kind defaults (integer<-string, boolean<-string, datetime<-string), out-of-enum default, list-default violating items.enum, non-array default on a list field, and consistent-default happy paths (integer=3, enum=red, list=[a,b]) asserting unchanged JSON Schema emission. 4. Verify via bun test test/profile.test.ts, full bun test, bun run typecheck, bunx biome check on changed files, and a live bun run src/cli.ts schema export repro against a temp profile for both failure and happy paths.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test test/profile.test.ts -> 79 pass/0 fail (9 new tests); full bun test -> 2040 pass/0 fail across 47 files; bun run typecheck -> clean; bunx biome check src/core/profile.ts test/profile.test.ts -> clean (fixed 2 test-title quoting issues it flagged). Live CLI repro (bun run src/cli.ts schema export against a temp .lore/profile.toml): {kind=integer, default="not-a-number"} -> exit 6, message 'types[0].fields.count.default ("not-a-number") does not match its declared integer' (AC#1); {enum=[red,green], default=purple} -> exit 6, message names 'types[0].fields.color.default' (AC#2); {kind=integer,default=3} + {enum=[red,green],default=red} -> exit 0, schema export emits count.default=3 and color.default="red" unchanged (AC#3). List defaults reuse baseKindToZod's z.array(itemToZod(items)) so a whole-list check (an out-of-enum element, or a non-array default) is rejected the same way (AC#4, tests added); a consistent list default ([a,b] against items.enum=[a,b]) still loads and emits unchanged. AC#5: added 9 tests in test/profile.test.ts covering mismatched-kind (integer/boolean/datetime), out-of-enum, list-shape (bad element + non-array), and 3 consistent-default happy-path cases verifying unchanged JSON Schema emission.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added assertDefaultMatchesShape in src/core/profile.ts, called from parseFieldSpec right where a field's default is copied through: it runs baseKindToZod(spec).safeParse(defaultValue) — the same kind->Zod predicates buildJsonSchema's emitted type/enum/items already derive from — and throws a validation LoreError naming the offending field (e.g. types[0].fields.count.default) when the default contradicts the field's declared kind/enum. Because baseKindToZod already returns z.array(itemToZod(items)) for list fields, the same check validates a list default against its whole-list/items shape with no extra code (documented in FieldSpec.default's doc comment). Happy-path emission (buildJsonSchema injecting a consistent default into the Draft-7 schema) is untouched. Verified with 9 new regression tests in test/profile.test.ts (mismatched-kind, out-of-enum, list-shape, and 3 consistent-default happy paths), full bun test (2040 pass/0 fail), bun run typecheck (clean), bunx biome check on both changed files (clean), and a live bun run src/cli.ts schema export repro reproducing both failure modes from the task description and confirming the two happy-path defaults still export byte-for-byte.
<!-- SECTION:FINAL_SUMMARY:END -->
