---
id: LORE-149
title: 'linkText re-escapes already-escaped brackets, enabling injected markdown links'
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-index-context
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `linkText` (src/core/indexes.ts:194-199), the bracket-escaping step `.replace(/[[\]]/g, (c) => `\\${c}`)` blindly prepends a backslash to every literal `[` or `]` without checking whether a backslash already precedes it. A concept title containing a literal `\]` (an already-escaped bracket) gets a second backslash inserted, which can shift the surrounding text so an attacker-controlled title turns the generated `- [title](link)` entry into a real markdown link to arbitrary content instead of escaped literal text. test/indexes.test.ts's existing bracket-escaping test (lines 74-77) only covers plain brackets ('Plan [B] (draft)') and does not exercise this escape-order edge case, so the bug is untested and unfixed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A concept title containing a pre-existing backslash-escaped bracket (e.g. 'Plan \\]B\\[ (draft)') round-trips through linkText into safe literal text in the generated index listing, not a broken or injected markdown link.
- [ ] #2 A new test case in test/indexes.test.ts covers a title with an already-backslash-escaped '[' or ']' and asserts the rendered link text does not produce an unintended '](' link boundary.
- [ ] #3 The existing plain-bracket escaping test (test/indexes.test.ts:74-77) continues to pass unchanged.
<!-- AC:END -->
