---
id: LORE-136
title: Heading slug computation ignores image alt text in headings
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
extractHeadingSlugs (src/core/check.ts:586-596) derives each heading's slug source via nodeText (src/core/bundle.ts:699-707), which only concatenates `text` and `inlineCode` mdast node values while walking the tree. An `image`/`imageReference` node's `alt` field is never read, unlike the reference implementation (mdast-util-to-string), which does include image alt text by default. For a heading composed of or containing an image with alt text (e.g. `## ![Alt Text](img.png)`), lore's computed anchor slug omits the alt text and can diverge from the anchor a real renderer (GitHub) produces, causing `lore check` to wrongly validate or wrongly break anchor links to that heading.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 nodeText (or extractHeadingSlugs) includes an image/imageReference node's `alt` text when computing a heading's slug source, matching GitHub's slug for a heading containing an image with alt text.
- [ ] #2 A regression test in test/check.test.ts covers a markdown heading containing `![Alt Text](img.png)` and asserts extractHeadingSlugs produces the slug derived from "Alt Text" (matching GitHub's rendered anchor), not one that omits it.
<!-- AC:END -->
