---
id: LORE-244
title: >-
  index.md conceptTitle: coerce numeric/boolean titles via frontmatterScalar
  (match graph/query/context)
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `conceptTitle` in `src/core/indexes.ts` derives its non-fallback title from the shared `frontmatterScalar` (imported from `./bundle`), so a finite-number or boolean frontmatter `title` is coerced to its string form rather than dropped to the filename.
- [ ] #2 When `frontmatterScalar` yields `undefined` (absent, empty/whitespace-only, or non-scalar title), `conceptTitle` still falls back to `posix.basename(concept.path, ".md")` (existing behavior preserved).
- [ ] #3 A unit test in `test/indexes.test.ts` (or equivalent) asserts that a concept with an unquoted numeric title (e.g. `title: 2024`) produces a listing entry titled `2024`, and that a boolean title coerces likewise — matching what `frontmatterScalar` returns for the same value.
- [ ] #4 `bun test` passes and byte-stability/fixpoint index tests still pass.
<!-- AC:END -->
