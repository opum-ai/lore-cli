---
id: LORE-246
title: >-
  matchesField: resolve case-insensitive field key across ALL case-variant
  spellings, not just the first
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 21:26'
labels:
  - core-query-validate
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 348000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `lore query` frontmatter filters (`--field`, and the `--status`/`--tag` paths that share the same matcher) should match a concept when *any* frontmatter key equal to the filter key case-insensitively carries a matching value — not only the first such key in enumeration order.

**Why:** `matchesField` in `src/core/query.ts` (currently line 317) resolves the filter key with `Object.keys(concept.frontmatter).find((candidate) => equalsFold(candidate, filter.key))`, which returns the FIRST case-variant key by author-insertion order and then judges only that key's value (lines 321-329). If a concept carries two keys that differ only in case (e.g. `Status: draft` and `status: done` — YAML keys are case-sensitive, so js-yaml/gray-matter retains both distinct keys; verified at runtime), a filter like `--field status=done` consults only the first-enumerated key and can return a false negative even though a matching value exists under the sibling key. The matchesField docstring (lines 304-315) advertises consistent case-insensitive key resolution but does not handle the multi-variant case.

**Live context:** `src/core/query.ts` — `matchesField` (function spanning ~lines 316-330); the defective lookup is line 317. The scalar/list value test is lines 321-329; `equalsFold` is at line 347. Filters route in via `matchesFilters` (lines 280-302: `--status`, each `--tag`, each `--field`).

**Provenance:** doc-2 (Codex second-opinion review, 2026-07-20) low-severity finding; re-audit cluster core-query-validate. Confirmed still-open on dev @82e88fe. Rare trigger (duplicate case-variant frontmatter keys are unusual and arguably malformed), so triage as a low-priority robustness/correctness fix — decline is reasonable if the maintainer deems case-variant duplicates out of contract, but the current behavior is a silent filter miss rather than an explicit rejection.

No implementation plan is prescribed; any approach that satisfies the acceptance criteria and keeps matchesField the single shared matcher for `--field`/`--status`/`--tag` is fine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A concept whose frontmatter carries two case-variant keys (e.g. `Status: draft` and `status: done`) matches `query(graph, { fields: [{ key: 'status', value: 'done' }] })` regardless of which case-variant key enumerates first (add a regression test covering both frontmatter orderings, so the result does not depend on author key order).
- [x] #2 The all-case-variants semantics apply identically through the `--status` and `--tag` filter paths (which delegate to matchesField), matching when any case-variant key satisfies the value.
- [x] #3 Scalar-value and list-element matching, and the case-insensitive value fold, are preserved: a match succeeds when any case-variant key holds a scalar equal to the value case-insensitively, or a list containing such an element.
- [x] #4 All existing test/query.test.ts cases still pass (single-case-variant key resolution at lines 197-203; scalar/number/list/absent-key at lines 179-195).
- [x] #5 `bun test`, `tsc`, and biome are green; core/query.ts function+line coverage is not regressed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In matchesField (src/core/query.ts), replace the single Object.keys(...).find(...) key lookup with a filter over ALL keys equalsFold-matching filter.key. 2. Match when ANY of those candidate keys' values (scalar equalsFold or list element equalsFold) satisfies filter.value, using the existing frontmatterScalar/equalsFold helpers unchanged. 3. Add a regression test in test/query.test.ts with a concept carrying two case-variant keys (e.g. Status: draft + status: done) verified in BOTH key orderings, matching via --field; confirm --status delegates through the same fix. 4. Run bun test, tsc, and biome on changed files; verify existing tests (lines ~179-203) still pass unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed matchesField (src/core/query.ts): resolve ALL frontmatter keys equalsFold-matching filter.key (Object.keys().filter, not .find()), then match when ANY candidate key's value (scalar or list element) equalsFold the filter value. Mutation-check performed: reverted the fix and reran test/query.test.ts — the base (pre-fix) code failed exactly the new regression test's second-ordering assertion (Status enumerating before status), confirming the test is load-bearing. Verification: bun test test/query.test.ts = 57 pass/0 fail; full bun test = 2016 pass/0 fail; bun run typecheck clean; bunx biome check src/core/query.ts test/query.test.ts clean (0 errors after a formatting fix). Diff confined to src/core/query.ts + test/query.test.ts + this task file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
matchesField (src/core/query.ts) now resolves EVERY frontmatter key that equalsFold-matches the filter key (Object.keys().filter, replacing the old .find() that stopped at the first case-variant), and matches when ANY of those candidate keys' scalar or list-element value equalsFold the filter value. --field/--status/--tag all route through this one matcher (matchesFilters), so the all-case-variants fix applies identically everywhere. Added a regression test in test/query.test.ts covering a concept with two case-variant keys (Status/status) in BOTH insertion orders via --field and --status, plus a case-variant match hiding inside a list via --field/--tag. Verified: bun test test/query.test.ts 57/57 pass; full bun test 2016/2016 pass; bun run typecheck clean; bunx biome check on both changed files clean. Mutation-checked by reverting the fix: the pre-fix code failed the new test (missed the Status-enumerates-first ordering), confirming the regression test is load-bearing. All existing single-variant/scalar/number/list/absent-key cases (lines ~179-203 pre-change) pass unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
