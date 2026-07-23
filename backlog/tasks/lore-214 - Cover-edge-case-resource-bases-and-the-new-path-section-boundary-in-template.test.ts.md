---
id: LORE-214
title: >-
  Cover edge-case resource bases (and the new-path section boundary) in
  template.test.ts
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
Close the one still-open test-coverage sub-gap from doc-2's low-severity finding on `test/template.test.ts:91` (core-managed-template cluster). Two of the finding's three sub-gaps are ALREADY covered and need no work: (b) malformed mustache tokens was resolved by LORE-157 (`test/template.test.ts:90-117` and the `buildNewConcept` test.each at `:207-229`); and (a) the 'clean by construction' required-section invariant is already pinned by `test/validate.test.ts:452-460` — 'every known type's required sections appear in its built-in template' asserts `builtinTemplateFor(type)` contains a `## <section>` heading for each entry in `requiredSectionsFor(type)` over `KNOWN_TYPES = [...defaultProfile().types.keys()]`, so a built-in template drifting from its declared `sections` (src/core/profile.ts:831-841 — ADR's Status/Context/Decision/Consequences, Story's 'Acceptance criteria') would fail there. Do NOT duplicate that assertion in template.test.ts.

**The genuine remaining gap:** the `resourceFor` describe block at `test/template.test.ts:258-292` only exercises ordinary and path-bearing https bases (the atlassian.net case at `:283` is a path, not a query/fragment); there is no test pinning the documented opaque-prefix join behavior (src/core/template.ts:50-56, 62-68) for a query-string, fragment, or non-https / non-hierarchical scheme base.

**Scope:** test-only; do not change `src/core/template.ts` behavior. Pin the CURRENT opaque-join behavior as documented at src/core/template.ts:50-56 — the separate policy question of whether such bases should be validated/rejected is doc-2 finding [1] (`template.ts:66`, deferred to a human product decision); do NOT add validation here.

Provenance: doc-2 (Codex second-opinion review), low severity, core-managed-template cluster; sub-gap (b) resolved by LORE-157, sub-gap (a) already covered by test/validate.test.ts:452-460.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `resourceFor` describe block gains tests pinning the current opaque-join behavior for (i) a base carrying a query string (e.g. `https://x/base?lang=en` + `docs/a.md` → `https://x/base?lang=en/docs/a.md`), (ii) a base carrying a fragment, and (iii) a non-https / non-hierarchical scheme base (e.g. a `mailto:`/custom scheme) — each asserted to be joined verbatim with exactly one seam slash and NO URL validation, matching the documented opaque-prefix contract at src/core/template.ts:50-56.
- [ ] #2 A test documents the `new`-path section boundary: a custom `bodyTemplate` that omits a type's required section is rendered by `buildNewConcept` WITHOUT throwing (section enforcement is deferred to `lore check`/`validate.ts:requiredSectionFindings`, not the `new` path). Do not re-assert that the built-in templates carry their required sections — that invariant is already covered by test/validate.test.ts:452-460.
- [ ] #3 `bun test test/template.test.ts` passes with the new cases and no existing case regressed.
<!-- AC:END -->
