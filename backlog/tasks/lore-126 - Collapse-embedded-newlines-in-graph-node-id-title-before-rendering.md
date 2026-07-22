---
id: LORE-126
title: Collapse embedded newlines in graph node id/title before rendering
status: Done
assignee:
  - '@sonnet'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 13:50'
labels:
  - codex-review-followup
  - cmd-meta-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `renderText()` (src/commands/graph.ts:220-235) and `toDot()`/`quote()` (src/core/graph.ts:146-164), `node.id`/`node.title` come straight from bundle-controlled frontmatter and are interpolated raw, with no newline/control-character collapsing applied. A multiline title breaks the plain-text listing's one-record-per-line invariant by emitting extra physical lines, and in `--dot` mode lands verbatim inside a quoted DOT label since `quote()` only escapes backslashes and double quotes, producing malformed or misleading DOT. Every other renderer in this codebase that emits bundle-controlled text (managed-block.ts, context.ts, indexes.ts, query.ts, log.ts) already guards against this with the existing `singleLine()` helper (src/errors.ts:142); graph.ts and core/graph.ts are the outliers that don't apply it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 renderText() in src/commands/graph.ts collapses embedded newlines/control characters in node.id and node.title (e.g. via the existing singleLine() helper from src/errors.ts) before building each node line, so `lore graph` plain/pretty output always emits exactly one physical line per node regardless of title content.
- [x] #2 quote() in src/core/graph.ts escapes or strips embedded newlines in the value it quotes so `lore graph --dot` on a concept with a multiline title produces a single well-formed quoted DOT label with no raw newline inside it.
- [x] #3 A regression test adds a concept whose title contains an embedded newline and asserts both `lore graph` plain output and `lore graph --dot` output contain no raw newline within the corresponding node's line/statement.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/commands/graph.ts renderText(): import singleLine from ../errors; apply singleLine(node.id) and singleLine(node.title) when building each node line so an embedded newline/CR/LS/PS in bundle-controlled id/title cannot split a plain/pretty listing across physical lines.
2. src/core/graph.ts quote(): import singleLine from ../errors; apply singleLine(value) before the existing backslash/quote escaping so any embedded newline is collapsed before the value is wrapped in a DOT double-quoted label (covers both the node id and title/id label, and any future quote() caller).
3. test/graph.test.ts: add a concept with a YAML double-quoted title containing an escaped \n (parses to a real embedded newline via loadBundle, matching how concept.test.ts exercises multiline frontmatter), then assert via runGraph() that plain-mode stdout has no raw newline inside that node's line (count of lines unaffected / node text collapsed) and --dot stdout has no raw newline inside the node's quoted label statement.
4. Run bun run typecheck and bun test (full suite) and record results on the task before marking Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: bun run typecheck passes clean (tsc --noEmit, no errors). Full suite bun test: 1720 pass, 0 fail, 4843 expect() calls across 45 files, including test/graph.test.ts: 37 pass, 0 fail (was 35 before the 2 new regression tests). bun run lint: only 4 pre-existing 'info' findings in unrelated files (managed-block.ts/test, supersede.test.ts) — none in the touched files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
renderText() (src/commands/graph.ts) and quote() (src/core/graph.ts) now run node.id/node.title (and any value quote() receives) through the existing singleLine() helper (src/errors.ts) before building each line/DOT label, matching the guard every other bundle-text renderer already applies. quote()'s JSDoc documents the collapse. Added 2 regression tests in test/graph.test.ts covering a concept with an embedded-newline title: one asserts lore graph plain output keeps exactly one physical line per node (9 lines, not 10), the other asserts lore graph --dot emits the whole quoted node statement on one physical line. Verified: bun run typecheck clean; bun test 1720 pass/0 fail (graph.test.ts 37 pass/0 fail); bun run lint shows only pre-existing infos in untouched files.
<!-- SECTION:FINAL_SUMMARY:END -->
