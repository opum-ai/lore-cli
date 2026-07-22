---
id: LORE-136
title: Heading slug computation ignores image alt text in headings
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 20:11'
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
- [x] #1 nodeText (or extractHeadingSlugs) includes an image/imageReference node's `alt` text when computing a heading's slug source, matching GitHub's slug for a heading containing an image with alt text.
- [x] #2 A regression test in test/check.test.ts covers a markdown heading containing `![Alt Text](img.png)` and asserts extractHeadingSlugs produces the slug derived from "Alt Text" (matching GitHub's rendered anchor), not one that omits it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fix nodeText (src/core/bundle.ts) to include image/imageReference alt text: while
   walking the mdast tree, when a node's type is image or imageReference and its
   alt is truthy, append node.alt to the accumulated text (matching
   mdast-util-to-string's default includeImageAlt: true behavior).
2. extractHeadingSlugs (src/core/check.ts) already calls nodeText(node) per heading,
   so no change needed there - the fix flows through automatically.
3. Add regression tests in test/check.test.ts under the extractHeadingSlugs describe
   block: heading that is only an image with alt text, an image alt combined with
   surrounding heading text, an imageReference variant, and an image with empty alt
   contributing nothing (not literal "undefined"/"null").
4. Run bun test and bun run typecheck; both must be green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed nodeText (src/core/bundle.ts) to include image/imageReference alt text when walking the mdast tree, matching mdast-util-to-string's default includeImageAlt: true. extractHeadingSlugs (src/core/check.ts) already routes every heading through nodeText, so the fix flows through with no change there. Added 4 regression tests in test/check.test.ts (extractHeadingSlugs describe block): image-only heading with alt text -> alt-text; alt text combined with surrounding heading text -> before-alt-text-after; imageReference variant -> alt-text; empty-alt image contributes nothing (not a literal undefined/null) -> "". Verified: bun test -> 1798 pass, 0 fail (203 pass in test/check.test.ts alone, 332 expect() calls); bun run typecheck -> tsc --noEmit clean, no errors. No docs/ files changed, so lore check was not required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
nodeText (src/core/bundle.ts) now includes an image/imageReference node's truthy alt text alongside text/inlineCode, so extractHeadingSlugs (src/core/check.ts, unchanged - already calls nodeText per heading) computes anchors matching GitHub for headings containing an image, e.g. '## ![Alt Text](img.png)' -> #alt-text. Verified with bun test (1798 pass / 0 fail, including 4 new regression tests in test/check.test.ts) and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
