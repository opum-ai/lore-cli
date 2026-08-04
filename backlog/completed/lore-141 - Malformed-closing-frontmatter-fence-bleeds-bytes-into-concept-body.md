---
id: LORE-141
title: Malformed closing frontmatter fence bleeds bytes into concept body
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 19:39'
labels:
  - codex-review-followup
  - core-concept-manifest
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
splitFrontmatter (src/core/concept.ts:448-471) delegates fence splitting to gray-matter@4.0.3, whose closing-delimiter search (node_modules/gray-matter/index.js:93-94) is a substring `str.indexOf('\n---')` rather than an exact-line match. lore's MATTER_OPTIONS only customizes the YAML engine's parse function and does not guard gray-matter's own fence-splitting, so a closing fence with extra trailing characters (e.g. `----` instead of `---`) is accepted and a few stray bytes from the fence leak into the parsed body. This was reproduced live: parsing `---\ntype: Reference\n----\nbody text here\n` through tryParseConcept yields `body: "-\nbody text here\n"`, with a leading `-` bled in from the malformed fence, silently corrupting concept content instead of raising a validation error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parsing a document whose closing frontmatter fence has extra trailing dash characters (e.g. `----`) either raises a `validation` LoreError pointing at the malformed fence, or produces a body with no leaked fence characters (not both a false-success and a corrupted body)
- [x] #2 A regression test is added to test/concept.test.ts covering a closing fence with trailing extra dashes, asserting the parsed body no longer contains a stray leading `-` (or other fence remnant) and/or that parsing rejects the malformed fence
- [x] #3 The fix does not alter parsing of well-formed `---`/`---` fenced documents (existing concept.test.ts cases continue to pass)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root-cause: gray-matter@4.0.3's closing-fence search (lib/index.js) is a plain str.indexOf('\n---') substring match with no line-boundary check, so a closing fence with extra trailing bytes (e.g. '----', '---junk') matches early and leaks the remainder into the parsed body.
2. Add a guard in src/core/concept.ts's splitFrontmatter: after gray-matter's own matter() call succeeds, independently recompute (from file.matter.length, without touching gray-matter internals) the exact raw byte offset immediately after the closing delimiter gray-matter matched, and require the next byte be a newline or EOF. Only run this guard when raw starts with the exact bare fence lore itself ever emits (FENCE = '---\n'), so gray-matter's language-tag feature can never have shifted the offset math, and the unterminated-fence (no closing --- at all) case is left untouched (offset lands past EOF -> treated clean, preserving existing behavior).
3. On a malformed closing fence, throw a validation LoreError pointing at the file instead of returning a corrupted body.
4. Add regression tests to test/concept.test.ts: extra trailing dashes, other trailing junk, well-formed fence still parses (AC#3), body legitimately starting with '-' is untouched, unterminated fence unaffected.
5. Verify: bun test (full suite) and bun run typecheck both green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed live: gray-matter's closing-delimiter search is str.indexOf('\n---'), matching the first 4 bytes of any longer run (e.g. '----') or any trailing junk ('---junk') and leaking the remainder into body. Fix: splitFrontmatter now independently recomputes the raw byte offset right after gray-matter's matched closing delimiter (via file.matter.length) and requires the next byte be newline/EOF; only engaged when raw starts with the exact bare FENCE ('---\n') lore itself emits, so the gray-matter language-tag feature can never desync the offset math. Malformed closing fence now throws a validation LoreError instead of returning a corrupted body. Verified: bun test test/concept.test.ts -> 47 pass/0 fail; full bun test -> 1777 pass/0 fail across 47 files; bun run typecheck -> clean (tsc --noEmit, no output); bun run lint -> no findings in changed files (src/core/concept.ts, test/concept.test.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed LORE-141: splitFrontmatter (src/core/concept.ts) now guards gray-matter's loose closing-fence substring search — a closing fence with extra trailing bytes ('----', '---junk', etc.) now throws a validation LoreError naming the file instead of silently leaking stray bytes into the parsed body. Well-formed ---/--- documents are unaffected (byte-identical parse), and the pre-existing unterminated-fence behavior is untouched. Regression tests added to test/concept.test.ts. Verified: bun test (1777 pass, 0 fail, 47 files) and bun run typecheck (clean) both green.
<!-- SECTION:FINAL_SUMMARY:END -->
