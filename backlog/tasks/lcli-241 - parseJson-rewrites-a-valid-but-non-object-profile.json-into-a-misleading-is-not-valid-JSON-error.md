---
id: LCLI-241
title: >-
  parseJson rewrites a valid-but-non-object profile.json into a misleading 'is
  not valid JSON' error
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - core-bundle-check
  - codex-review-followup
  - profile
dependencies: []
priority: low
type: bug
ordinal: 343000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`parseJson` (src/core/profile.ts:284-300) performs its object-shape check inside the same `try` block that wraps `JSON.parse`. The shape check calls `fail("…must be a JSON object"…)` (profile.ts:287-291), and `fail` throws a LoreError (profile.ts:863-865). Because that throw happens inside the `try`, it is caught by the surrounding `catch (cause)` at profile.ts:293, which rewrites every failure as `is not valid JSON` via `withReason(…)` with the hint `fix the JSON syntax`.

The effect: a `.lore/profile.json` that is syntactically valid JSON but not an object (an array, string, number, boolean, or null) is reported as a syntax error. Reproduced live — `[1,2,3]` yields `".lore/profile.json is not valid JSON: .lore/profile.json must be a JSON object"` with hint `"fix the JSON syntax in .lore/profile.json"`. The message is both misleading (the syntax is fine) and redundant (the path appears twice, the clean "make it a JSON object" hint is lost). A genuinely malformed file still surfaces the real parser message, confirming the two cases are conflated.

The intended behavior — the clean `must be a JSON object` message with hint `make .lore/profile.json a JSON object` — is already written at profile.ts:288-290 but is unreachable because the throw is swallowed. The fix is to keep only `JSON.parse` inside the `try` and run the shape check after it succeeds, so a valid-but-non-object document produces the object-shape diagnostic and only a real syntax error produces the `is not valid JSON` diagnostic.

Provenance: doc-2 Codex second-opinion review, low-severity finding (cluster core-bundle-check), re-audited round 3 and confirmed still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A syntactically valid but non-object `.lore/profile.json` (e.g. `[1,2,3]`, `"hello"`, `42`, `true`, `null`) fails with the message `.lore/profile.json must be a JSON object` and hint `make .lore/profile.json a JSON object` — NOT the `is not valid JSON` / `fix the JSON syntax` form.
- [x] #2 A genuinely malformed `.lore/profile.json` (e.g. `{ not json`) still fails with the `.lore/profile.json is not valid JSON: <parser message>` form and the `fix the JSON syntax` hint — no regression.
- [x] #3 A valid JSON-object profile still loads and compiles unchanged.
- [x] #4 Regression tests in test/profile.test.ts cover the array case and at least one scalar (string/number) case for the object-shape message, plus a malformed-syntax case for the syntax message.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move the object-shape check in parseJson (src/core/profile.ts) out of the try block that wraps JSON.parse, so the shape-check LoreError thrown by fail() is no longer caught by the surrounding catch and rewritten as a syntax error. Add regression tests in test/profile.test.ts: array, string, number, boolean, null non-object cases assert the object-shape message+hint; malformed-syntax case asserts the syntax message+hint is unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: parseJson now runs JSON.parse alone inside the try; the object-shape check runs after success, outside the catch, so its fail() throw is no longer rewritten into an 'is not valid JSON' message. Verified: bun test test/profile.test.ts -> 70 pass/0 fail (added 5 new cases: array/string/number/boolean/null all assert exact message '.lore/profile.json must be a JSON object' + hint 'make .lore/profile.json a JSON object', and LoreError type via expectValidation helper). Anti-regression: malformed '{ not json' still asserts exact message '.lore/profile.json is not valid JSON: JSON Parse error: Expected '\''}'\''' + hint 'fix the JSON syntax in .lore/profile.json'. Full bun test: 2019 pass/0 fail across 47 files. bun run typecheck: clean (tsc --noEmit, no output). bunx biome check src/core/profile.ts test/profile.test.ts: no new issues. AC#3 covered by pre-existing passing tests (profile.json is read.../profile.toml wins over profile.json.../an empty/commented profile.toml does NOT shadow...) which load valid object profiles end-to-end unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed parseJson (src/core/profile.ts) so JSON.parse is the only statement inside the try block; the object-shape check (non-object/array/null) now runs after a successful parse, outside the catch, so its LoreError is no longer swallowed and rewritten into a syntax-error message. A valid-but-non-object profile.json (array/string/number/boolean/null) now reports '.lore/profile.json must be a JSON object' + hint 'make .lore/profile.json a JSON object'; a genuinely malformed file still reports '.lore/profile.json is not valid JSON: <parser message>' + hint 'fix the JSON syntax in .lore/profile.json'. Added 5 regression tests in test/profile.test.ts (array/string/number/boolean/null) asserting exact message+hint+LoreError type, tightened the malformed-JSON test to assert exact message+hint, kept the pre-existing valid-object-profile tests as the AC#3 regression guard. Verified: bun test test/profile.test.ts (70 pass/0 fail), full bun test (2019 pass/0 fail, 47 files), bun run typecheck (clean), bunx biome check on both changed files (no new issues).
<!-- SECTION:FINAL_SUMMARY:END -->
