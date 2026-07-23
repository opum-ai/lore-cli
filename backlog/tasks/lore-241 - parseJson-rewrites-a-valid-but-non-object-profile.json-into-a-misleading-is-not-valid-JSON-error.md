---
id: LORE-241
title: >-
  parseJson rewrites a valid-but-non-object profile.json into a misleading 'is
  not valid JSON' error
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 A syntactically valid but non-object `.lore/profile.json` (e.g. `[1,2,3]`, `"hello"`, `42`, `true`, `null`) fails with the message `.lore/profile.json must be a JSON object` and hint `make .lore/profile.json a JSON object` — NOT the `is not valid JSON` / `fix the JSON syntax` form.
- [ ] #2 A genuinely malformed `.lore/profile.json` (e.g. `{ not json`) still fails with the `.lore/profile.json is not valid JSON: <parser message>` form and the `fix the JSON syntax` hint — no regression.
- [ ] #3 A valid JSON-object profile still loads and compiles unchanged.
- [ ] #4 Regression tests in test/profile.test.ts cover the array case and at least one scalar (string/number) case for the object-shape message, plus a malformed-syntax case for the syntax message.
<!-- AC:END -->
