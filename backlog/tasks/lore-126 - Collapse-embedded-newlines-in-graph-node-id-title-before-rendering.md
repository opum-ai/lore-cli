---
id: LORE-126
title: Collapse embedded newlines in graph node id/title before rendering
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 renderText() in src/commands/graph.ts collapses embedded newlines/control characters in node.id and node.title (e.g. via the existing singleLine() helper from src/errors.ts) before building each node line, so `lore graph` plain/pretty output always emits exactly one physical line per node regardless of title content.
- [ ] #2 quote() in src/core/graph.ts escapes or strips embedded newlines in the value it quotes so `lore graph --dot` on a concept with a multiline title produces a single well-formed quoted DOT label with no raw newline inside it.
- [ ] #3 A regression test adds a concept whose title contains an embedded newline and asserts both `lore graph` plain output and `lore graph --dot` output contain no raw newline within the corresponding node's line/statement.
<!-- AC:END -->
