---
id: LORE-163
title: >-
  replace: $<name> should stay literal when the regex has no named groups, not
  expand to ""
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-replace
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In expandTemplate (src/core/replace.ts:252-283), the $<name> branch at lines 268-270 always evaluates `match.groups?.[selector.slice(1, -1)] ?? ""`, so when the compiled regex declares zero named capture groups, match.groups is undefined and the token silently resolves to an empty string. Native String.prototype.replace instead leaves an unresolvable `$<name>` token as a literal substring when the regex has no named groups. This divergence means a replace template containing `$<name>` against a plain (non-named-group) pattern silently deletes that text from the output instead of preserving it, with no error or warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add a regression test in test/replace.test.ts running replace with a --regex pattern that has no named capture groups and a replacement template containing `$<name>`, asserting the output contains the literal string `$<name>` (matching native String.prototype.replace behavior) instead of an empty string.
- [ ] #2 A template referencing an actual named group that IS present in the regex (e.g. `(?<name>...)`) continues to substitute the captured value as before, unaffected by this fix.
- [ ] #3 A template referencing a named group name that is not among the regex's declared named groups (regex has some named groups, but not this one) also falls back to the literal `$<name>` token rather than throwing or substituting an empty string.
<!-- AC:END -->
