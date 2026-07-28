---
id: LCLI-240
title: >-
  check portability lint mis-parses a leading indented code block in
  frontmatter-free files
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - core-bundle-check
  - codex-review-followup
  - check
  - portability
dependencies: []
priority: low
type: bug
ordinal: 342000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`lore check`'s portability lint reads a file's body through `bodyText` (src/core/check.ts:877-887), which reuses the concept parser's `normalizeInput` (src/core/concept.ts:413-418). `normalizeInput`'s final step, `.replace(/^\s+/, "")` (concept.ts:417), strips all leading whitespace at the very start of the file so a whitespace-padded frontmatter fence still parses. For a frontmatter-free file this strip is applied to the body itself: a file whose very first content is an indented (4-space or tab) code block loses the first line's indentation and is reparsed as prose (a lazy paragraph continuation).

Observed impact: portability-hazard characters that live inside the code block (`{`, `<`, `[[…]]`, `==…==`, `%%…%%`) are then scanned as prose and produce spurious `portability` warnings; under `--strict` those become check failures. Reproduced live in a scratch bundle — `    Use {braces} and [[wikilink]] here` as the first line of a frontmatter-free file yields both a wikilink warning and an MDX `{` warning, whereas the same block after a heading (parsed as `code`) yields nothing; an mdast probe confirmed the leading-indent block degrades from a `code` node to a `paragraph`.

Concepts WITH frontmatter are unaffected — `normalizeInput`'s leading strip only touches the region before the opening `---` fence, so their body indentation is preserved. The corruption is specific to the frontmatter-free files that `bodyText` deliberately scans whole (per its own docstring, "A file with no frontmatter … yields its whole content as the body").

Provenance: doc-2 Codex second-opinion review, low-severity finding (cluster core-bundle-check), re-audited round 3 and confirmed still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A frontmatter-free `.md` file whose very first content is an indented (4-space or tab) code block containing portability-hazard characters (e.g. `{`, `[[wikilink]]`) produces NO `portability` warnings from `lore check` — the block is parsed as code, not prose.
- [x] #2 The same indented code block appearing after a heading (correct today) continues to produce no warnings — no regression.
- [x] #3 A concept file WITH frontmatter has its body indentation preserved exactly as before (no behavior change for the frontmatter path).
- [x] #4 BOM and CRLF/CR normalization still apply to frontmatter-free files (the fix must not drop those parts of normalizeInput's contract).
- [x] #5 A regression test (test/check.test.ts or equivalent) covers the frontmatter-free leading-indented-code-block case and asserts zero portability findings.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Fix bodyText (src/core/check.ts) so the frontmatter-free path skips normalizeInput's leading-\s+ strip (which exists only to let a whitespace-padded fence still parse) while still applying BOM-strip + CRLF/CR normalization. Detect 'no fence at all' via gray-matter's own matter.test() on the fully-normalized string; when false, return raw with only BOM/CRLF normalization applied (leading indentation preserved). When true (a fence was attempted, even if malformed/empty/non-mapping), fall through to the EXISTING matter(normalized).content / YAMLException-catch code path unchanged, so the WITH-frontmatter path is provably byte-identical (concept.ts untouched, zero diff). Export bodyText (matching the module's existing convention of exporting internals like slugify/extractHeadingSlugs for direct testing) so the normalization contract itself has a unit-level regression test alongside integration-level checkBundle tests. Add regression tests to test/check.test.ts for AC#1 (indented code block first, frontmatter-free, no warnings, incl. --strict via runCheck), AC#2 (same block after heading, no regression), AC#3 (WITH-frontmatter body indentation unaffected, both integration + unit level), AC#4 (BOM+CRLF still normalized, unit + integration level), plus a mutation guard (unindented hazard chars in frontmatter-free prose still flagged).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test = 1995 pass/0 fail (full suite); bun test test/check.test.ts = 228 pass/0 fail; bun run typecheck clean. AC#1: checkBundle + runCheck(--strict) on a frontmatter-free file whose first content is a 4-space-indented code block with {braces}/[[wikilink]] -> zero portability findings, EXIT_OK under --strict (was exit 6 pre-fix). AC#2: same block after a heading -> still zero warnings (unchanged). AC#3: WITH-frontmatter file whose body opens with the same indented block -> zero warnings, and confirmed at the unit level (bodyText() on a fenced doc); src/core/concept.ts diff is EMPTY (git diff --stat shows 0 changes) — the frontmatter path is byte-identical, not just behaviorally unchanged. AC#4: bodyText() unit test on a BOM+CRLF frontmatter-free input asserts the exact normalized string (BOM gone, CRLF->LF, indentation preserved); integration test confirms zero portability findings on the same input. AC#5: 7 new tests added in test/check.test.ts's new 'frontmatter-free leading indented code block (LCLI-240)' describe block + 1 in the existing runCheck --strict block. Mutation-verified: reverted the fix locally (restoring the pre-fix bodyText body while keeping only the export) and reran test/check.test.ts — the 4 behavior-dependent new tests failed exactly as expected (spurious wikilink + MDX '{' portability warnings, runCheck --strict exit 6 instead of 0), then re-applied the fix and reconfirmed 228/228 pass — proving the tests are load-bearing, not just code-presence checks. bunx biome check on both changed files: no issues. Scope: only src/core/check.ts + test/check.test.ts touched; src/core/concept.ts untouched (0-line diff).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed lore check's portability lint mis-parsing a leading indented code block in frontmatter-free files. Root cause: bodyText (src/core/check.ts) reused normalizeInput's leading-\s+ strip, which is meant only to let a whitespace-padded frontmatter FENCE still parse, but for a file with no fence at all it also stripped the body's own first-line indentation, turning a leading indented code block into a lazy-continuation prose paragraph and exposing hazard characters ({, [[wikilink]], etc.) inside it to the prose portability scan. Fix: bodyText now detects 'no frontmatter fence attempted' via gray-matter's own matter.test() and, only in that branch, applies BOM-strip + CRLF/CR normalization WITHOUT the leading-whitespace strip, preserving the body's indentation. Any file that does open with a fence (including malformed/empty/non-mapping ones) falls through to the pre-existing, byte-identical code path — verified: src/core/concept.ts has a zero-line diff. bodyText is now exported (matching the module's existing convention for slugify/extractHeadingSlugs) to give the normalization contract a direct unit-level regression test. Verified with bun test (1995 pass/0 fail full suite, 228/228 in test/check.test.ts), bun run typecheck (clean), and a mutation check: temporarily reverting the fix reproduced the exact reported symptom (spurious wikilink + MDX '{' warnings, runCheck --strict exit 6) in 4 of the new tests, confirming they are load-bearing.
<!-- SECTION:FINAL_SUMMARY:END -->
