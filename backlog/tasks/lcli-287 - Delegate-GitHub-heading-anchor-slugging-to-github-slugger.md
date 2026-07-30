---
id: LCLI-287
title: Delegate GitHub heading-anchor slugging to github-slugger
status: To Do
assignee: []
created_date: '2026-07-30 15:27'
labels:
  - dependencies
  - markdown
  - anchors
  - github-compatibility
  - maintenance
dependencies: []
references:
  - src/core/check.ts
  - src/core/bundle.ts
  - test/check.test.ts
documentation:
  - docs/reference/dependency-boundary-audit.md
priority: medium
type: bug
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace Lore’s custom GitHub-style slug and duplicate-suffix implementation with an exact-pinned github-slugger boundary. Preserve Lore’s mdast-based heading-text extraction, including the empirically verified rule that image alt text does not contribute to GitHub heading text. This closes the leading-space mismatch recorded by LCLI-136 and reduces Unicode and duplicate-anchor drift without adopting a full remark/unified pipeline. This independent maintenance task does not gate or reorder M6.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Heading anchors match GitHub-compatible behavior for punctuation, leading and trailing whitespace, inline code, excluded image text, composed and decomposed Unicode, non-Latin text, empty headings, and repeated headings
- [ ] #2 Duplicate suffix state is isolated per document and deterministic across repeated checks and bundle ordering
- [ ] #3 Internal anchor validation and every other consumer of heading slugs share the same canonical slugging primitive without changing Lore’s mdast heading-text extraction policy
- [ ] #4 Existing portable-link findings and machine output remain stable except for fixtures that pin previously incorrect GitHub-anchor behavior
- [ ] #5 The selected github-slugger release is exact-pinned and passes the pinned Bun runtime, unit suite, typecheck, lint, and bun build --compile smoke test
<!-- AC:END -->
