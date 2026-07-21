---
id: LORE-159
title: >-
  h2Headings() counts nested headings (inside blockquotes/list items) as
  top-level sections
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
ordinal: 173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`h2Headings()` in src/core/validate.ts:325-333 walks the full mdast tree via `walkMdast` (src/core/bundle.ts:603-620) and collects every `heading` node with `depth === 2`, with no check on the node's parent/ancestor type or its nesting depth in the tree. `walkMdast` is a plain stack-based DFS that visits descendants of any node uniformly, so a `## Status`-looking heading nested inside a blockquote (`> ## Status`) or a list item is collected exactly like a genuine top-level document section. This feeds `requiredSectionFindings()` (validate.ts:253-270), so a required section can be satisfied by a heading that is not actually a real top-level section of the document, or (depending on interpretation) a nested heading could mask a missing top-level one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 h2Headings() (or its caller requiredSectionFindings()) only counts a `## ` heading that is a direct/top-level child of the document root, not one nested inside a blockquote or list item.
- [ ] #2 A regression test in test/validate.test.ts constructs a body where the only occurrence of a required section heading (e.g. `## Consequences`) is inside a blockquote (`> ## Consequences`) or a list item, and asserts that `required-section` still reports it as missing.
- [ ] #3 Existing tests for genuine top-level `## ` headings (including the fenced-code-block exclusion at test/validate.test.ts:213) continue to pass unchanged.
<!-- AC:END -->
