---
id: LORE-160
title: >-
  Quote-safety check omits leading colon `:` from INDICATOR_CHARS despite
  ADR-0007
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 An unquoted frontmatter scalar value beginning with `:` (e.g. `label: :foo`) is reported as a quote-safety finding, consistent with ADR-0007's listed indicator characters.
- [ ] #2 A regression test in test/validate.test.ts asserts `quoteSafetyFindings()` flags a leading-colon value like `:foo` as an error, distinguishing it from the existing `": "` mid-value colon-space test at line 258.
<!-- AC:END -->
