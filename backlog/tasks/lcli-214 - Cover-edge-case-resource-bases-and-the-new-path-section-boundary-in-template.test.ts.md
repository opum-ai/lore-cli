---
id: LCLI-214
title: >-
  Cover edge-case resource bases (and the new-path section boundary) in
  template.test.ts
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:29'
labels:
  - core-managed-template
  - codex-review-followup
  - test-coverage
dependencies: []
priority: low
type: task
ordinal: 316000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Close the one still-open test-coverage sub-gap from doc-2's low-severity finding on `test/template.test.ts:91` (core-managed-template cluster). Two of the finding's three sub-gaps are ALREADY covered and need no work: (b) malformed mustache tokens was resolved by LCLI-157 (`test/template.test.ts:90-117` and the `buildNewConcept` test.each at `:207-229`); and (a) the 'clean by construction' required-section invariant is already pinned by `test/validate.test.ts:452-460` — 'every known type's required sections appear in its built-in template' asserts `builtinTemplateFor(type)` contains a `## <section>` heading for each entry in `requiredSectionsFor(type)` over `KNOWN_TYPES = [...defaultProfile().types.keys()]`, so a built-in template drifting from its declared `sections` (src/core/profile.ts:831-841 — ADR's Status/Context/Decision/Consequences, Story's 'Acceptance criteria') would fail there. Do NOT duplicate that assertion in template.test.ts.

**The genuine remaining gap:** the `resourceFor` describe block at `test/template.test.ts:258-292` only exercises ordinary and path-bearing https bases (the atlassian.net case at `:283` is a path, not a query/fragment); there is no test pinning the documented opaque-prefix join behavior (src/core/template.ts:50-56, 62-68) for a query-string, fragment, or non-https / non-hierarchical scheme base.

**Scope:** test-only; do not change `src/core/template.ts` behavior. Pin the CURRENT opaque-join behavior as documented at src/core/template.ts:50-56 — the separate policy question of whether such bases should be validated/rejected is doc-2 finding [1] (`template.ts:66`, deferred to a human product decision); do NOT add validation here.

Provenance: doc-2 (Codex second-opinion review), low severity, core-managed-template cluster; sub-gap (b) resolved by LCLI-157, sub-gap (a) already covered by test/validate.test.ts:452-460.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `resourceFor` describe block gains tests pinning the current opaque-join behavior for (i) a base carrying a query string (e.g. `https://x/base?lang=en` + `docs/a.md` → `https://x/base?lang=en/docs/a.md`), (ii) a base carrying a fragment, and (iii) a non-https / non-hierarchical scheme base (e.g. a `mailto:`/custom scheme) — each asserted to be joined verbatim with exactly one seam slash and NO URL validation, matching the documented opaque-prefix contract at src/core/template.ts:50-56.
- [x] #2 A test documents the `new`-path section boundary: a custom `bodyTemplate` that omits a type's required section is rendered by `buildNewConcept` WITHOUT throwing (section enforcement is deferred to `lore check`/`validate.ts:requiredSectionFindings`, not the `new` path). Do not re-assert that the built-in templates carry their required sections — that invariant is already covered by test/validate.test.ts:452-460.
- [x] #3 `bun test test/template.test.ts` passes with the new cases and no existing case regressed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add 3 tests to the resourceFor describe block (test/template.test.ts:258-292) pinning the opaque-join contract for: (i) query-string base https://x/base?lang=en + docs/a.md -> https://x/base?lang=en/docs/a.md; (ii) fragment base https://x/base#section + docs/a.md -> https://x/base#section/docs/a.md; (iii) non-hierarchical scheme bases (mailto: and urn:) joined verbatim with one seam slash, no validation. 2. Add a test near the buildNewConcept describes documenting that a custom bodyTemplate omitting a type's required section renders without throwing (new-path section-boundary; enforcement deferred to check/validate.ts, already covered by test/validate.test.ts:452-460 for built-ins so no duplication here). 3. Run bun test test/template.test.ts + full bun test + bun run typecheck; confirm src/core/template.ts unchanged in diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added 4 tests to test/template.test.ts, no src changes: (1) resourceFor describe block gained 3 cases pinning the opaque-join contract for a query-string base (https://x/base?lang=en -> .../base?lang=en/docs/a.md), a fragment base (.../base#section -> .../base#section/docs/a.md), and non-hierarchical schemes (mailto:, urn:) each joined with exactly one seam slash and no validation -- verified by a throwaway probe script (deleted before commit) confirming exact output strings, matching src/core/template.ts:50-56/62-68 as documented. (2) Added a 'new-path section boundary' test: buildNewConcept({type: 'ADR', bodyTemplate omitting Decision/Consequences}) renders successfully without throwing, documenting that required-section enforcement lives only in lore check/validate.ts:requiredSectionFindings, not buildNewConcept -- does not duplicate test/validate.test.ts:452-460's built-in-template invariant.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the resourceFor opaque-join coverage gap and documented the new-path section boundary, test-only (src/core/template.ts untouched). test/template.test.ts: added 3 cases to the resourceFor describe block (query-string base, fragment base, non-hierarchical mailto:/urn: schemes) each pinning verbatim-join-with-one-seam-slash/no-URL-validation behavior per src/core/template.ts:50-56,62-68; added 1 buildNewConcept case showing an ADR bodyTemplate that omits the Decision/Consequences sections still renders without throwing, since section enforcement is lore check's job (validate.ts:requiredSectionFindings), not buildNewConcept's -- deliberately does not re-assert test/validate.test.ts:452-460's built-in-template invariant. Verified: bun test test/template.test.ts -> 46 pass/0 fail (was 42, +4 new cases, none regressed); full bun test -> 1921 pass/0 fail; bun run typecheck clean; bunx biome check test/template.test.ts clean; git diff confirms only test/template.test.ts + the backlog task file changed.
<!-- SECTION:FINAL_SUMMARY:END -->
