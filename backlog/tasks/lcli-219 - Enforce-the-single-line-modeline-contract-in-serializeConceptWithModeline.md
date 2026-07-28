---
id: LCLI-219
title: Enforce the single-line modeline contract in serializeConceptWithModeline
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - core-concept-manifest
  - codex-review-followup
  - hardening
dependencies: []
priority: low
type: enhancement
ordinal: 321000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `serializeConceptWithModeline` (src/core/concept.ts:390-397) rejects a `modeline` argument that is not a single line instead of splicing it verbatim.

**Why:** The function splices `modeline` as the first line inside the opening `---` fence (`return \`${FENCE}${modeline}\n${serialized.slice(FENCE.length)}\``) and its docstring (L373-389) explicitly assumes a one-line `# yaml-language-server:` comment, but it performs no validation. A `modeline` containing a newline would inject arbitrary extra lines inside/after the fence, corrupting the emitted document (potentially breaking the very byte-stability / parse-back guarantee concept.ts exists to uphold). concept.ts is otherwise built entirely on fail-loud invariants, so this is the one unenforced one.

**Live context:** All current callers (src/core/template.ts:217, src/core/scaffold.ts:173) pass `schemaModeline(...)` output, which is single-line by construction (slugForTypeName at src/core/profile.ts:196-203 collapses non-alphanumerics), so there is **no reachable trigger today** — this is defensive contract-enforcement, not a live-triggerable bug.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster core-concept-manifest; re-audit round 3 confirmed still-present against dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 serializeConceptWithModeline throws a LoreError (validation type, exit 6) when its `modeline` argument contains a newline (i.e. is not a single line), rather than splicing it verbatim.
- [x] #2 A single-line modeline still splices byte-identically to today: the existing test/concept.test.ts 'serializeConceptWithModeline — modeline spliced inside the opening fence' cases (L281-311) remain green unchanged.
- [x] #3 A new regression test in test/concept.test.ts asserts that a multi-line modeline (e.g. one containing '\n') is rejected and never spliced into the output.
- [x] #4 The full test suite (`bun test`) passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a guard at the top of serializeConceptWithModeline (src/core/concept.ts) that throws a validation LoreError (exit 6) when modeline contains a line-break char (\r, \n, U+2028, U+2029), before the splice. 2. Message includes the offending modeline via singleLine() for readability; hint tells the caller to pass a one-line modeline; input echoes back {modeline}. 3. Add a regression test in the existing 'serializeConceptWithModeline' describe block in test/concept.test.ts asserting a modeline containing an embedded newline throws a validation LoreError (via the file's existing expectValidation helper) and never reaches the splice. 4. Verify existing splice-case tests (L281-311) stay green unchanged, run full bun test + bun run typecheck, and biome-check the two changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: serializeConceptWithModeline (src/core/concept.ts) now throws a validation LoreError (exit 6, via EXIT_CODES) BEFORE splicing when modeline matches /[\r\n\u2028\u2029]/ (covers LF, CR, CRLF, and the Unicode line/paragraph separators singleLine() also treats as line breaks). Message embeds the offending modeline via singleLine() for a readable diagnostic; hint tells the caller to pass a one-line modeline; input echoes {modeline}. Added a regression test in the existing 'serializeConceptWithModeline' describe block (test/concept.test.ts) using the file's expectValidation helper, asserting a modeline embedding a newline throws a validation LoreError and is never spliced.

Verified: bun test test/concept.test.ts -> 48 pass / 0 fail (includes the 3 pre-existing 'modeline spliced inside the opening fence' cases at L281-311, confirmed byte-identical/unchanged, plus the new rejection test). Full bun test -> 1924 pass / 0 fail across 47 files. bun run typecheck -> clean (tsc --noEmit, no output). bunx biome check src/core/concept.ts test/concept.test.ts -> 'Checked 2 files in 11ms. No fixes applied.' Diff scope confirmed via git diff: only src/core/concept.ts and test/concept.test.ts touched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
serializeConceptWithModeline (src/core/concept.ts) now rejects a multi-line modeline: before splicing, it throws a validation LoreError (exit 6) if modeline contains a CR/LF or Unicode line/paragraph separator, with a hint and the offending modeline as input, instead of injecting the extra line(s) verbatim. A single-line modeline splices exactly as before (unchanged, byte-identical). Added a regression test in test/concept.test.ts (existing 'serializeConceptWithModeline' describe block) asserting a newline-embedding modeline throws and is never spliced. Verified: bun test test/concept.test.ts 48/48 pass (pre-existing splice-case tests at L281-311 unchanged and green); full bun test 1924/1924 pass across 47 files, 0 fail; bun run typecheck clean; bunx biome check on both changed files clean. No callers changed (none reachable today per task's own note).
<!-- SECTION:FINAL_SUMMARY:END -->
