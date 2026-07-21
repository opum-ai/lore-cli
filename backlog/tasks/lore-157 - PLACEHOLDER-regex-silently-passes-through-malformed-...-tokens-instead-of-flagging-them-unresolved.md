---
id: LORE-157
title: >-
  PLACEHOLDER regex silently passes through malformed {{...}} tokens instead of
  flagging them unresolved
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 A brace-shaped token that does not match the strict `{{name}}` grammar (e.g. `{{owner name}}`, `{{}}`, or `{{ owner/name }}`) is detected by renderTemplate/renderBody and causes the same fail-loud validation error as a legitimately unresolved placeholder, rather than being written verbatim to the output file.
- [ ] #2 Regression tests in test/template.test.ts cover at least `{{owner name}}`, `{{}}`, and `{{ owner/name }}`, each asserting the malformed token is reported (not silently passed through in `text`).
<!-- AC:END -->
