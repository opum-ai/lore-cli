---
id: LORE-239
title: >-
  callout portability detector false-positives on inline formatting before
  [!type] in ordinary prose
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 19:58'
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
- [x] #1 `lore check` on a doc containing the ordinary paragraph `ordinary **bold** [!note] prose` (not inside a blockquote) produces NO `portability` callout warning.
- [x] #2 A genuine callout leading a blockquote (`> [!note]`) still produces the `non-portable callout` warning — no regression.
- [x] #3 A genuine callout leading a blockquote whose first inline is `[!type]` followed by other content is still flagged (blockquote-leading detection preserved).
- [x] #4 A literal `[!important]` in mid-sentence prose (already not flagged today) remains not flagged — no regression.
- [x] #5 A regression test (test/check.test.ts or equivalent) covers the `**bold** [!note]` false-positive case and asserts no portability finding, plus a positive case asserting the real `> [!note]` callout is still flagged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the callout entry from the per-text-node DETECTORS array in src/core/check.ts (it falsely matches [!type] at the start of ANY text node, not just a blockquote-leading one). 2. Add a dedicated CALLOUT regex + calloutFinding(node, file) function mirroring blockReferenceFinding's structural approach: judge a blockquote's first child paragraph's first text child against the [!type] pattern, so it only fires when [!type] truly leads a blockquote. 3. Wire calloutFinding into portabilityScan alongside blockReferenceFinding/mdxHazardFindings. 4. Update the DETECTORS/portabilityScan docstrings to describe the new structural callout detection instead of the old per-text-node approach. 5. Add regression tests to test/check.test.ts: (a) ordinary 'foo **bold** [!note] prose' (non-blockquote) -> no portability callout finding, incl. under --strict; (b) '> [!note]' blockquote-leading -> still flagged; (c) blockquote leading with [!type] followed by more content -> still flagged; (d) mid-sentence literal [!important] -> still unflagged (regression). 6. Verify via bun test + bun run typecheck + bun test test/check.test.ts, then finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: removed the callout entry from the generic per-text-node DETECTORS array and replaced it with a new calloutFinding(node,file) that mirrors blockReferenceFinding's structural approach — it inspects only a blockquote node's first child paragraph's first text child for the [!type] marker, so a callout is flagged solely by structural blockquote-leading position, never by text-node-start position. Verified: bun test = 1977 pass/0 fail (full suite); bun test test/check.test.ts = 220 pass/0 fail (215 pre-existing + 5 new); bun run typecheck clean; bunx biome check src/core/check.ts test/check.test.ts clean. Probed mdast-util-from-markdown directly to confirm the exact AST shapes: 'ordinary **bold** [!note] prose' splits into text/strong/text with the trailing text node starting '[!note]' but as a non-blockquote paragraph it is never inspected by calloutFinding (AC#1, incl. under --strict via a new runCheck test); '> [!note]\n> body' and '> [!warning] Heads up...\n> more.' both parse to blockquote>paragraph>text starting with the marker and are still flagged (AC#2/#3); mid-sentence '[!important]' remains unflagged (AC#4, both the pre-existing simple case and a new bold-prefixed case). AC#5: added 5 new tests in test/check.test.ts (4 in the portability-warnings describe block, 1 in the runCheck --strict describe block) covering the false-positive negative case plus the blockquote-leading positive cases.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the Obsidian-callout portability detector's false positive on inline formatting before [!type] in ordinary (non-blockquote) prose. Root cause: the callout regex ran per-mdast-text-node, anchored to ^, so inline formatting (e.g. **bold**) splitting a paragraph put [!note] at the start of a later text node and falsely triggered the detector. Fix: removed the callout case from the generic per-text-node DETECTORS scan and added a dedicated calloutFinding(node, file) in src/core/check.ts that judges [!type] structurally — only a blockquote's first child paragraph's first text child is checked — mirroring the existing blockReferenceFinding pattern. Verified via bun test (1977 pass/0 fail), bun test test/check.test.ts (220 pass/0 fail, includes 5 new LORE-239 regression tests), bun run typecheck (clean), and bunx biome check on both changed files (clean). Confirmed all 5 ACs with direct mdast-util-from-markdown probes plus checkBundle/runCheck assertions.
<!-- SECTION:FINAL_SUMMARY:END -->
