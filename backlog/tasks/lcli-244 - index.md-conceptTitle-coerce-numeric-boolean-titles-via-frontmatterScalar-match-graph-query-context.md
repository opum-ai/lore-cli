---
id: LCLI-244
title: >-
  index.md conceptTitle: coerce numeric/boolean titles via frontmatterScalar
  (match graph/query/context)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:30'
labels:
  - core-index-context
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 346000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** A concept's generated `index.md` listing title matches the title `lore graph`/`query`/`context` show for the same concept, including numeric/boolean YAML-coerced titles.

**Current defect:** `conceptTitle` in `src/core/indexes.ts:259-265` only accepts a string title:
```
const title = concept.frontmatter.title;
if (typeof title === "string" && title.trim() !== "") { return title.trim(); }
return posix.basename(concept.path, ".md");
```
so an unquoted `title: 2024` (parsed by js-yaml as the number `2024`) or `title: true` falls back to the filename. Every other title-surfacing path uses the shared `frontmatterScalar` (`src/core/bundle.ts:633-641`), which coerces a finite number or boolean to its string form: `graph.ts:106`, `query.ts:262`, `context.ts:216` and `context.ts:247`. Result: the same concept shows one title in the sync-generated index and a different one in graph/query/context.

**Fix direction:** Route `conceptTitle` through `frontmatterScalar(concept.frontmatter.title)`, falling back to `posix.basename(concept.path, ".md")` when it returns `undefined`. Note the whitespace nuance: `frontmatterScalar` returns strings verbatim (only whitespace-only strings become `undefined`), whereas the current code `.trim()`s; align with `frontmatterScalar`'s contract for true cross-command consistency (the downstream `linkText`/`singleLine` sanitization is unaffected).

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity finding `src/core/indexes.ts:206`, cluster `core-index-context`. Round-3 re-audit confirmed the inconsistency is still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `conceptTitle` in `src/core/indexes.ts` derives its non-fallback title from the shared `frontmatterScalar` (imported from `./bundle`), so a finite-number or boolean frontmatter `title` is coerced to its string form rather than dropped to the filename.
- [x] #2 When `frontmatterScalar` yields `undefined` (absent, empty/whitespace-only, or non-scalar title), `conceptTitle` still falls back to `posix.basename(concept.path, ".md")` (existing behavior preserved).
- [x] #3 A unit test in `test/indexes.test.ts` (or equivalent) asserts that a concept with an unquoted numeric title (e.g. `title: 2024`) produces a listing entry titled `2024`, and that a boolean title coerces likewise — matching what `frontmatterScalar` returns for the same value.
- [x] #4 `bun test` passes and byte-stability/fixpoint index tests still pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Import frontmatterScalar from ./bundle into indexes.ts. 2. Rewrite conceptTitle() to return frontmatterScalar(concept.frontmatter.title) ?? posix.basename(concept.path, '.md'), dropping the manual typeof-string/.trim() check so numeric/boolean YAML-coerced titles match graph.ts/query.ts/context.ts. 3. Add unit tests in test/indexes.test.ts for a numeric title (2024), a boolean title (true), and a non-scalar title (null/array) falling back to basename. 4. Verify with bun test test/indexes.test.ts, full bun test, and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test test/indexes.test.ts -> 32 pass, 0 fail (incl. new numeric-title/boolean-title/non-scalar-fallback tests). Full bun test -> 1990 pass, 0 fail across 47 files. bun run typecheck -> clean (tsc --noEmit, no output). bunx biome check src/core/indexes.ts test/indexes.test.ts -> no issues. Byte-stability/fixpoint index tests (existing suite, e.g. splicing/orphan/managed-block tests) remained green, unaffected by the title-derivation change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed conceptTitle() in src/core/indexes.ts to derive its non-fallback title from the shared frontmatterScalar (imported from ./bundle, bundle.ts untouched) instead of a manual typeof === 'string' && .trim() check, so an unquoted numeric (title: 2024) or boolean (title: true) YAML-coerced title is coerced to its string form -- matching graph.ts/query.ts/context.ts -- rather than silently dropping to the filename. Preserved the existing basename fallback for undefined/absent/whitespace-only/non-scalar titles, now driven by frontmatterScalar's own undefined contract (no re-added .trim()). Added 4 new tests to test/indexes.test.ts covering numeric title, boolean title, and non-scalar (null/array) fallback. Verified: bun test test/indexes.test.ts (32 pass/0 fail), full bun test (1990 pass/0 fail, 47 files), bun run typecheck (clean), bunx biome check on both changed files (no issues).
<!-- SECTION:FINAL_SUMMARY:END -->
