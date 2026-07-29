---
id: LCLI-160
title: >-
  Quote-safety check omits leading colon `:` from INDICATOR_CHARS despite
  ADR-0007
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:27'
labels:
  - codex-review-followup
  - core-query-validate
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`INDICATOR_CHARS` at src/core/validate.ts:338 is `["@", "\`", "!", "&", "*", "|", ">"]` and does not include `:`, even though ADR-0007 (docs/adr/0007-validation-and-coherence.md:104-107) explicitly lists `:` among the leading indicator characters that quote-safety must flag. The separate mid-value check at validate.ts:392 (`value.includes(": ")`) only catches a colon immediately followed by a space anywhere in the value, so a leading bare colon with no trailing space (e.g. a frontmatter value `:foo`) is not caught by either check and passes quote-safety silently, contradicting the documented policy. test/validate.test.ts:249-255 only exercises `@` and `*` as indicator characters, with no leading-colon case.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An unquoted frontmatter scalar value beginning with `:` (e.g. `label: :foo`) is reported as a quote-safety finding, consistent with ADR-0007's listed indicator characters.
- [x] #2 A regression test in test/validate.test.ts asserts `quoteSafetyFindings()` flags a leading-colon value like `:foo` as an error, distinguishing it from the existing `": "` mid-value colon-space test at line 258.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/core/validate.ts, add ':' to the INDICATOR_CHARS set (line ~373) so a value beginning with a bare leading colon (e.g. ':foo') is flagged by the existing INDICATOR_CHARS branch of quoteSafetyForValue, consistent with ADR-0007's documented list of leading indicator chars. 2. Leave the separate mid-value ': ' (colon-space) check untouched -- it covers a different hazard (colon+space anywhere in the value) and AC#2 explicitly asks the new test to be distinguished from it. 3. Add a regression test in test/validate.test.ts (in the 'quote-safety' describe block) asserting quoteSafetyFindings(block('label: :foo')) flags an error, placed near/adjacent to the existing 'a value starting with a YAML indicator is an error' test. 4. Mutation-check: revert validate.ts change via git diff/apply (no stash), confirm new test fails, reapply, confirm it passes. 5. Run bun test and bun run typecheck full suite, both green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified via mutation-check + full suite: bun test (1860/1860 pass, 47 files), bun test test/validate.test.ts (59/59 pass), bun run typecheck (clean).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added ':' to INDICATOR_CHARS in src/core/validate.ts so an unquoted frontmatter scalar with a leading bare colon (e.g. 'label: :foo') is flagged as a quote-safety error, matching ADR-0007's documented indicator-char list. Added a regression test in test/validate.test.ts distinguishing this from the existing mid-value ': ' colon-space check. Verified: mutation-checked (test fails on pre-fix code, passes post-fix, revert/reapply via git apply, no stash); bun test test/validate.test.ts 59/59 pass; full bun test 1860/1860 pass across 47 files; bun run typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
