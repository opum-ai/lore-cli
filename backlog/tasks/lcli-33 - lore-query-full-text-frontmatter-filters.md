---
id: LCLI-33
title: lore query (full-text + frontmatter filters)
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - cmd
milestone: m-4
dependencies:
  - LCLI-16
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
- [x] #1 Filter by type/tag/status/any field
- [x] #2 Bounded output with a narrow-it hint
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

/code-review max (37 agents, ~1.09M tok, run wf_e90608c5-99f): 15 verified findings. FOLDED 6 (commit a33ddc9): #0 punctuation-only text no longer nullifies filters (now filters-only); #1 --field key case-insensitive; #4+#5 --field value trimmed + empty-value rejected; #6 positive sub-0.005 score never renders 0.00; #10 --status/--tag routed through shared matchesField (removed divergent branches); #11 IDF precomputed once per query term. DEFERRED w/ rationale: #2 empty text -> whole bundle (accepted: bounded by --limit + truncated signal; consistency fixed by #0); #3 global flags intercept a search positional like --version (pre-existing router design affecting ALL commands; -- escape works; out of LCLI-33 scope); #7/#8 leading-dash positional/value rejected (NO new arg-parser divergence per handover mandate; consistent w/ graph/context/schema; -- and inline = escapes); #9 PLAUSIBLE Unicode casefold asymmetry (toLowerCase consistent w/ canonicalType; out of scope); #12 per-doc tf-map retention (premature for small bundles, cf. adjacency-memoization revert); #13 toHit/neighborOf shaping dup + #14 readValue 4th copy (the explicitly-accepted shared-helper/parser-clone debt; no new divergence). Both ACs verified: AC#1 filter by type/tag/status/any field; AC#2 bounded output (--limit default 20) + narrow-it hint. Gates: 939 tests pass, tsc+biome clean, 100% func+line on both new files.
<!-- SECTION:NOTES:END -->
