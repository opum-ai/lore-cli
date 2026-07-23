---
id: LORE-246
title: >-
  matchesField: resolve case-insensitive field key across ALL case-variant
  spellings, not just the first
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 A concept whose frontmatter carries two case-variant keys (e.g. `Status: draft` and `status: done`) matches `query(graph, { fields: [{ key: 'status', value: 'done' }] })` regardless of which case-variant key enumerates first (add a regression test covering both frontmatter orderings, so the result does not depend on author key order).
- [ ] #2 The all-case-variants semantics apply identically through the `--status` and `--tag` filter paths (which delegate to matchesField), matching when any case-variant key satisfies the value.
- [ ] #3 Scalar-value and list-element matching, and the case-insensitive value fold, are preserved: a match succeeds when any case-variant key holds a scalar equal to the value case-insensitively, or a list containing such an element.
- [ ] #4 All existing test/query.test.ts cases still pass (single-case-variant key resolution at lines 197-203; scalar/number/list/absent-key at lines 179-195).
- [ ] #5 `bun test`, `tsc`, and biome are green; core/query.ts function+line coverage is not regressed.
<!-- AC:END -->
