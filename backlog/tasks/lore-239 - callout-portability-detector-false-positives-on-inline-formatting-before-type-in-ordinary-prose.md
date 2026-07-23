---
id: LORE-239
title: >-
  callout portability detector false-positives on inline formatting before
  [!type] in ordinary prose
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-bundle-check
  - codex-review-followup
  - check
  - portability
dependencies: []
priority: low
type: bug
ordinal: 341000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Obsidian-callout portability detector uses the regex `/^\s*\[!([A-Za-z][\w-]*)\]/g` (src/core/check.ts:695), which `portabilityScan` runs against every mdast `text` node individually (src/core/check.ts:728-738). The intent (per the docstring at check.ts:675-677) is to flag `[!type]` only when it leads a blockquote paragraph. But because the regex is anchored to the start of each text node — not the start of the enclosing block — inline formatting before `[!type]` in ordinary, non-blockquote prose splits the paragraph so that `[!type]` lands at the start of a later text node and is falsely flagged.

Reproduced live in a scratch bundle: an ordinary paragraph `ordinary **bold** [!note] prose` produces `non-portable callout "[!note]"; GitHub shows it as a plain blockquote with literal text`. mdast parses that paragraph into text `"ordinary "`, a `strong` node, then text `" [!note] prose"`; the `^\s*\[!…\]` pattern matches the leading-whitespace-then-`[!note]` of the trailing text node. Under `--strict` this false positive becomes a check failure. A literal `[!important]` mid-sentence with no preceding inline formatting is (correctly) already spared because it is not at a text-node start.

The fix should mirror the structural approach already used for the sibling block-reference detector `blockReferenceFinding` (src/core/check.ts:753-773), which judges the `^id` marker against a paragraph's structural position rather than an arbitrary text node — i.e. only treat `[!type]` as a callout when it genuinely leads a blockquote paragraph (the block-start position), not merely the start of some interior text node.

Provenance: doc-2 Codex second-opinion review, low-severity finding (cluster core-bundle-check), re-audited round 3 and confirmed still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `lore check` on a doc containing the ordinary paragraph `ordinary **bold** [!note] prose` (not inside a blockquote) produces NO `portability` callout warning.
- [ ] #2 A genuine callout leading a blockquote (`> [!note]`) still produces the `non-portable callout` warning — no regression.
- [ ] #3 A genuine callout leading a blockquote whose first inline is `[!type]` followed by other content is still flagged (blockquote-leading detection preserved).
- [ ] #4 A literal `[!important]` in mid-sentence prose (already not flagged today) remains not flagged — no regression.
- [ ] #5 A regression test (test/check.test.ts or equivalent) covers the `**bold** [!note]` false-positive case and asserts no portability finding, plus a positive case asserting the real `> [!note]` callout is still flagged.
<!-- AC:END -->
