---
id: LORE-240
title: >-
  check portability lint mis-parses a leading indented code block in
  frontmatter-free files
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
- [ ] #1 A frontmatter-free `.md` file whose very first content is an indented (4-space or tab) code block containing portability-hazard characters (e.g. `{`, `[[wikilink]]`) produces NO `portability` warnings from `lore check` — the block is parsed as code, not prose.
- [ ] #2 The same indented code block appearing after a heading (correct today) continues to produce no warnings — no regression.
- [ ] #3 A concept file WITH frontmatter has its body indentation preserved exactly as before (no behavior change for the frontmatter path).
- [ ] #4 BOM and CRLF/CR normalization still apply to frontmatter-free files (the fix must not drop those parts of normalizeInput's contract).
- [ ] #5 A regression test (test/check.test.ts or equivalent) covers the frontmatter-free leading-indented-code-block case and asserts zero portability findings.
<!-- AC:END -->
