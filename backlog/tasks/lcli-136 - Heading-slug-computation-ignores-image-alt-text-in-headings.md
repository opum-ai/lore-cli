---
id: LCLI-136
title: Heading slug computation ignores image alt text in headings
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:26'
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
- [x] #1 nodeText / extractHeadingSlugs excludes an image/imageReference node's alt text from a heading's slug source, matching GitHub's actual rendering behavior: GitHub gives an <img> empty textContent regardless of its alt attribute, so an image contributes nothing to the heading text GitHub slugs from (verified 2026-07-22 against GitHub's production renderer via the vnd.github.html API render and the live github.com page, on two independent repos). The original AC's premise -- that GitHub includes image alt text in heading slugs -- was empirically wrong; it was inherited from the doc-2 Codex finding, which conflated GitHub's actual pipeline with mdast-util-to-string's includeImageAlt:true default.
- [x] #2 Regression tests in test/check.test.ts pin the GitHub-verified behavior: an image-only heading contributes no slug text (extractHeadingSlugs("## ![Alt Text](img.png)") -> ['']); an image's alt text does not merge with surrounding heading text ("## Before ![Alt Text](img.png) After" -> ['before--after'], an exact GitHub match, not 'before-alt-text-after'); and an imageReference variant behaves the same way.
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
REVISED per Fable review (2026-07-22): the first pass (including image alt text in nodeText) was built on a false premise inherited from the doc-2 Codex finding -- that GitHub includes image alt text when slugging headings, matching mdast-util-to-string's `includeImageAlt: true` default. Empirical verification directly against GitHub's production renderer (vnd.github.html API render and the live github.com page, on two independent repos) shows GitHub excludes image alt text entirely: an `<img>` renders with empty textContent no matter its `alt`, so a heading composed of or containing an image gets no contribution from that image to the text GitHub slugs from.

Reverted nodeText (src/core/bundle.ts) to its original text/inlineCode-only concatenation and rewrote its docstring to document the empirical GitHub-vs-mdast-util-to-string divergence (so a future reader doesn't re-introduce the same wrong "fix"). Replaced the 4 tests added by the reverted fix with 3 GitHub-verified regression tests in test/check.test.ts (extractHeadingSlugs describe block): an image-only heading contributes no slug text (`['']`); an image's alt text does not merge with surrounding heading text (`## Before ![Alt Text](img.png) After` -> `['before--after']` -- an exact GitHub match that the reverted fix had broken into `'before-alt-text-after'`); an imageReference variant contributes no slug text the same way.

Confirmed src/core/validate.ts's h2Headings (which shares nodeText for required-section matching) is fixed by the same revert with no separate change needed -- it had been silently affected by the first pass (a heading like `## ![icon](x) Section Name` would have stopped matching a required section `Section Name` after the first pass; the revert restores the original match).

Verified: `bun test` -> 1797 pass, 0 fail (net -1 from the prior 1798 because 4 tests were replaced with 3). `bun run typecheck` -> tsc --noEmit clean. No docs/ files changed, so `lore check` was not required.

Follow-up discovered during verification, deliberately NOT fixed here (out of scope, low severity, no backlog ID minted per this session's constraints): lore's slugify() (src/core/check.ts) calls `.trim()`, but GitHub does NOT trim, so a heading like `## ![alt](x) Key Features` still slugs to `key-features` in lore vs GitHub's `-key-features` (leading hyphen preserved from the space before the dropped image) even after this revert. Worth a follow-up task once someone can mint a new backlog ID.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
extractHeadingSlugs (src/core/check.ts, unchanged) computes heading-anchor slugs via nodeText (src/core/bundle.ts), which -- per empirical verification against GitHub's production renderer on 2026-07-22 -- correctly EXCLUDES image/imageReference `alt` text from a heading's slug source, because GitHub itself gives an `<img>` empty textContent regardless of `alt` and so an image contributes nothing to the anchor GitHub slugs from. The task's original premise (that GitHub includes image alt text, inherited from the doc-2 Codex finding and mdast-util-to-string's `includeImageAlt: true` default) was empirically wrong. The initial fix, which added alt-text inclusion, has been reverted: this restores the previously-correct `'## Before ![Alt Text](img.png) After'` -> `'before--after'` match (an exact GitHub match the initial fix had broken) and removes a false `'alt-text'` slug that would have made `lore check` wrongly validate, or wrongly flag, real GitHub anchor links. src/core/validate.ts's h2Headings, which shares nodeText for required-section matching, is fixed by the same revert.

Verified with `bun test` (1797 pass / 0 fail, including 3 regression tests in test/check.test.ts pinning the GitHub-verified behavior) and `bun run typecheck` (clean). No docs/ changed, `lore check` not required.
<!-- SECTION:FINAL_SUMMARY:END -->
