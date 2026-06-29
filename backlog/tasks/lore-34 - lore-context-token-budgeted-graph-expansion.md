---
id: LORE-34
title: lore context (token-budgeted graph expansion)
status: Done
assignee:
  - '@claude'
created_date: '2026-06-21 06:26'
updated_date: '2026-06-29 02:18'
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
- [x] #1 Output respects --max-tokens
- [x] #2 Deterministic for the same inputs
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on feat/lore-34-context (commit e040f29).

- NEW pure core/context.ts: buildContext(graph, root, {depth=1, maxTokens?}) -> ContextExport. Reuses the shared core/query.ts subgraph() traversal for the neighborhood (nearest-first discovery order, root excluded). Token model (chars/4 throughout): target charged graph.tokenEstimate(root) (whole-concept, == lore graph's per-node number); each neighbor compacted to its summary (frontmatter summary -> title -> none) and charged ceil(summary/4). export.tokenEstimate = target + included neighbors. Greedy nearest-first fill STOPS at the first neighbor that would exceed --max-tokens (predictable prefix); target ALWAYS included. Structural, no ranking (ADR-0015).
- NEW thin commands/context.ts: cloned graph.ts arg parser; required <id> (idFromPath-normalized), --max-tokens <n> (>=1), --depth <n> (default 1, >=0); loadBundle + flush advisories BEFORE the not_found throw; emit(context.export); reuses truncation()/renderTruncationLine() for the §3 footer.
- cli.ts registers 'context' + USAGE line.
- FOLDED the deferred LORE-31 finding: subgraph adjacency is now memoized per BundleGraph via adjacencyOf() (WeakMap), so multi-target traversals no longer rebuild the O(E) index.

AC#1 (respects --max-tokens): covered by buildContext budget tests (stop-at-first-overflow prefix; target-always-included; omitted budget keeps all) + command --max-tokens=1 truncation-footer test.
AC#2 (deterministic): neighbor order is subgraph's deterministic discovery order; all estimates are pure chars/4; no Date/random. Pinned by the order/equality assertions.

Gates GREEN: bun test (890 pass) · biome clean · tsc --noEmit clean · coverage core/context.ts + core/query.ts + commands/context.ts all 100% func+line. Smoke-tested read-only on the repo's own docs/ bundle (pack renders; exit 3 on unknown id).
cli-surface §context: flags/kind unchanged (matched the locked contract); added exit-2 to the exit row for accuracy/parity with graph. CHANGELOG Unreleased/Added entry added.

PENDING: workflow /code-review max fold, then PR into dev.

Workflow /code-review max (33 agents): 12 findings verified, 4 refuted. Folded (commit d02233b):
- [CORRECTNESS] --max-tokens never bounded the always-emitted target body and undercounted neighbor cost. Fix: neighbor charged its full emitted entry (id+type+summary), not summary alone; truncated now set (with an 'over budget' line) when the mandatory target alone exceeds the budget, so truncated:false honestly means 'everything fit'. Strengthens AC#1.
- [CORRECTNESS] title field diverged from lore graph (collapse/trim vs verbatim). Fix: one shared core/bundle.ts frontmatterScalar used by both graph + context; finite-number guard so non-finite scalars no longer render Infinity/NaN.
- [CORRECTNESS] truncation hint 'lower --depth to include more' was counterfactual → now 'raise --max-tokens'.
- [QUALITY] reverted the speculative subgraph adjacency memoization (adjacencyOf/WeakMap): no shipping command traverses twice per process AND it exported a mutable shared map. Re-deferred until lore orphans (the real multi-traversal consumer) lands — the deferred LORE-31 premise ('context calls subgraph per-target') was wrong; a single 'lore context <id>' does ONE traversal.
- [QUALITY] buildContext simplified to a single break-early fill (no materialize-then-rewalk; total=reached.size-1; dropped neighbors' summaries never computed); neighbor title coerced once; chars/4 kernel shared via estimateTokens.

DEFERRED (not folded, by design):
- Flag-parser scaffolding cloned from graph.ts/schema.ts: accepted shared-parser-refactor debt (the established clone pattern); no NEW divergence introduced.
- chars/4 over UTF-16 code units mis-measures non-ASCII: the documented project-wide heuristic (labeled chars/4 everywhere), not a regression.
- Unquoted numeric scalar precision (1.10 -> 1.1): inherent to YAML parse (source text gone post-parse); quote to preserve. Now consistent with lore graph.

Refuted (correctly): CRLF body (normalizeInput strips CR pre-split); cache immutability precondition (documented + now moot after revert); estimateTokens/neighborSummary style-only.

Re-ran gates after fold: bun test 891 pass · biome · tsc · coverage 100% func+line on core/context.ts, core/query.ts, core/graph.ts, commands/context.ts.
<!-- SECTION:NOTES:END -->
