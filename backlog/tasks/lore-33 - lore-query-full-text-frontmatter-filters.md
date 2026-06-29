---
id: LORE-33
title: lore query (full-text + frontmatter filters)
status: In Progress
assignee:
  - '@jeremy'
created_date: '2026-06-21 06:26'
updated_date: '2026-06-29 09:13'
labels:
  - cmd
milestone: m-4
dependencies:
  - LORE-16
documentation:
  - docs/adr/0015-lightweight-retrieval-no-vectors.md
priority: medium
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In-memory full-text (BM25-style) + frontmatter-field filters; --max-tokens budget + truncation hints; reuse summary for snippets. No vectors/RAG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Filter by type/tag/status/any field
- [ ] #2 Bounded output with a narrow-it hint
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core/query.ts: add pure query(graph, {text?, type?, tags?, status?, fields?, limit?}) -> QueryResult. BM25-style ranking (k1=1.5,b=0.75, always-positive IDF) over a whole-bundle term index built from id+title+summary+description+tags+body. Frontmatter filters (--type/--tag/--status/--field) applied case-insensitively; a text query also relevance-filters (score>0). Sort score desc, id asc; filters-only sorts id asc with score 0. Reuse frontmatterScalar + singleLine(oneLine) for snippet (summary->title->none).
2. commands/query.ts: thin parser cloned from context/graph (repeatable --tag/--field, single --type/--status/--limit, optional quoted text positional). loadBundle+flush, emit(query.results). exit 0 ok / 2 bad usage. No not_found.
3. cli.ts: register query (USAGE + dispatch).
4. test/query.test.ts: core + command + router coverage (core 100% func+line).
5. Gates: bun test, biome, tsc, coverage. /code-review max fold. CHANGELOG Unreleased/Added. Build to LOCKED cli-surface §query (--limit, NOT --max-tokens).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on feat/lore-33-query (commit 2626fe3). core/query.ts: pure query() with BM25-style ranking (k1=1.5, b=0.75, always-positive IDF) over a whole-bundle lexical index (id+title+summary+description+tags+body), case-insensitive frontmatter filters (--type/--tag/--status/--field, all AND), summary->title->none snippet (reuses frontmatterScalar+singleLine), --limit-bounded output with narrow-it hint. commands/query.ts: thin parser cloned from graph/context. Built to LOCKED cli-surface §query (--limit NOT --max-tokens; the task-desc --max-tokens was superseded by the locked contract). Gates green: bun test 934 pass, tsc clean, biome clean, coverage 100% func+line on both new files. /code-review max running (workflow wf_e90608c5-99f).
<!-- SECTION:NOTES:END -->
