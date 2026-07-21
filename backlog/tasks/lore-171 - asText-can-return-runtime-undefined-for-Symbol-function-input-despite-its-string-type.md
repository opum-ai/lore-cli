---
id: LORE-171
title: >-
  asText can return runtime undefined for Symbol/function input despite its
  string type
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - errors-output-git
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
asText (src/errors.ts:115) falls through to safeStringify(value) for any non-string, non-nullish input. safeStringify's fast path (lines 443-453) calls `JSON.stringify(value)`, but `JSON.stringify` returns `undefined` (not a thrown error) for a `Symbol` or a bare function value, so safeStringify's catch-based fallback never triggers and asText silently returns runtime `undefined` even though its signature promises `string`. Since asText exists specifically to guarantee cli-contract §5.2's message/hint fields are real strings, this gap defeats its own purpose for these input types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 asText(Symbol('x')) and asText(function(){}) each return an actual string (not runtime undefined) in a new test case in test/errors.test.ts.
- [ ] #2 safeStringify is updated so that a JSON.stringify result of undefined for a non-nullish input value is treated as a stringify failure and routed through the existing fallback/degradation path instead of being returned as-is.
<!-- AC:END -->
