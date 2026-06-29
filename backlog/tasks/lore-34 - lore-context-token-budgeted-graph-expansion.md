---
id: LORE-34
title: lore context (token-budgeted graph expansion)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-06-29 01:24'
labels:
  - cmd
milestone: m-4
dependencies:
  - LORE-16
  - LORE-28
documentation:
  - docs/adr/0015-lightweight-retrieval-no-vectors.md
priority: medium
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Assemble a concept body plus 1-line neighbor summaries via the graph, depth-bounded with --max-tokens. Deterministic; no ranking heuristics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Output respects --max-tokens
- [ ] #2 Deterministic for the same inputs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core/query.ts: memoize undirected adjacency per BundleGraph (WeakMap keyed by graph) + export adjacencyOf(); subgraph() reuses it (folds the deferred LORE-31 adjacency-rebuild finding).
2. core/context.ts (NEW, pure): buildContext(graph, {root, depth=1, maxTokens?}) -> ContextExport {root, depth, maxTokens?, target{id,type,title?,body,tokenEstimate}, neighbors[{id,type,title?,summary?,tokenEstimate}], tokenEstimate, total, shown, truncated, hint?}. Reuse core/query subgraph() for the neighborhood (nearest-first discovery order, root excluded). Token model (chars/4 throughout): target.tokenEstimate = graph.tokenEstimate(root) (whole-concept, == lore graph's number); neighbor compacted to its summary (frontmatter summary -> title -> none), cost = ceil(summary/4); export.tokenEstimate = target + included neighbors. Greedy nearest-first fill, STOP at first neighbor that would exceed --max-tokens; target ALWAYS included. No ranking.
3. commands/context.ts (NEW, thin): clone graph.ts arg parser; required positional <id> (idFromPath), --max-tokens <n> (positive int), --depth <n> (default 1, >=0); loadBundle + flush advisories BEFORE not_found; emit(context.export); reuse truncation()/renderTruncationLine().
4. cli.ts: register context + USAGE line.
5. test/context.test.ts: clone graph.test.ts style (core query identity-cache test; buildContext token/budget/truncation/summary-fallback; command arg-parse + not_found + dispatch).
6. Gates: bun test + biome + tsc + coverage; /code-review max fold; CHANGELOG Unreleased/Added; verify cli-surface §context matches; PR into dev.
<!-- SECTION:PLAN:END -->
