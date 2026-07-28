---
id: LCLI-157
title: >-
  PLACEHOLDER regex silently passes through malformed {{...}} tokens instead of
  flagging them unresolved
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-managed-template
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The PLACEHOLDER regex in src/core/template.ts:71 (`/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g`) only matches the strict `{{name}}` grammar. Brace-shaped but malformed tokens such as `{{owner name}}`, `{{}}`, or `{{ owner/name }}` never match the regex, so renderTemplate neither substitutes them nor records them in `unresolved` — they pass through verbatim into `text`. Because renderBody's fail-loud check at template.ts:261 only inspects `rendered.unresolved`, these malformed tokens reach the written concept file as literal `{{...}}` text instead of causing the intended "unfilled placeholder" validation error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A brace-shaped token that does not match the strict `{{name}}` grammar (e.g. `{{owner name}}`, `{{}}`, or `{{ owner/name }}`) is detected by renderTemplate/renderBody and causes the same fail-loud validation error as a legitimately unresolved placeholder, rather than being written verbatim to the output file.
- [x] #2 Regression tests in test/template.test.ts cover at least `{{owner name}}`, `{{}}`, and `{{ owner/name }}`, each asserting the malformed token is reported (not silently passed through in `text`).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Broaden the PLACEHOLDER regex in src/core/template.ts to capture any brace-shaped {{...}} token (matching [^{}]* inside), then in renderTemplate check the trimmed inner text against the existing strict name grammar (PLACEHOLDER_NAME = /^[A-Za-z0-9_.-]+$/).
2. If the trimmed inner text fails the strict grammar (empty, internal whitespace, disallowed chars like '/'), report it via the same 'unresolved' array/dedup mechanism used for a legitimate-but-missing key, leaving the token verbatim in text — this reuses renderBody's existing fail-loud check (unresolved.length > 0) with no changes needed there.
3. If it passes the grammar, behave exactly as before (substitute from vars or report as unresolved by key name).
4. Add regression tests in test/template.test.ts for {{owner name}}, {{}}, and {{ owner/name }} (both at the renderTemplate level and via buildNewConcept's fail-loud LoreError path), and mutation-check by reverting the fix.
5. bun test + bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Broadened PLACEHOLDER to /\{\{([^{}]*)\}\}/g (any brace-shaped token) and added PLACEHOLDER_NAME=/^[A-Za-z0-9_.-]+$/ to gate legitimacy after trimming. renderTemplate now reports a malformed token (empty, internal whitespace, disallowed char) via the same unresolved/dedup path used for a legitimate-but-missing key, so renderBody's existing unresolved.length>0 fail-loud check catches it with zero changes to renderBody. Confined entirely to src/core/template.ts + test/template.test.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed: PLACEHOLDER regex now matches any {{...}} shape, and a new PLACEHOLDER_NAME grammar check gates whether the trimmed inner text is a legitimate key; a malformed token ({{owner name}}, {{}}, {{ owner/name }}) is always reported into the same 'unresolved' array (deduped, first-seen order) that a legitimate-but-missing key uses, so buildNewConcept/renderBody's existing fail-loud check throws a validation LoreError naming it instead of writing it verbatim. Verified with objective evidence: added 6 regression tests in test/template.test.ts (3 at the renderTemplate level covering the 3 ACs' malformed shapes plus dedup/vars-shadow edge cases, 3 via buildNewConcept's fail-loud path as test.each). Mutation-checked by reverting src/core/template.ts (git stash) — all 6 new tests failed as expected (malformed tokens silently passed through / no LoreError thrown); restored the fix and they passed. Full suite: bun test = 1851 pass / 0 fail across 47 files (up from 1845; +6 new). bun run typecheck clean. biome check clean on both changed files (pre-existing test/validate.test.ts import-order lint issue confirmed present on base branch, untouched, out of scope).
<!-- SECTION:FINAL_SUMMARY:END -->
