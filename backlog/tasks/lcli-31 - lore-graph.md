---
id: LCLI-31
title: lore graph
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:09'
labels:
  - cmd
  - 'doc:stories/build-the-lore-cli-foundation'
milestone: m-4
dependencies:
  - LCLI-16
documentation:
  - docs/reference/cli-surface.md
  - docs/stories/build-the-lore-cli-foundation.md
priority: medium
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Emit the cross-link graph as dot or json; cycle-tolerant; include per-doc/bundle token estimates (chars/4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 graph --format dot and json both work
- [x] #2 Token estimates surface in --json
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered via PR #26 (squash 1fb8b27 on dev). New core/query.ts (shared undirected, cycle-tolerant, depth-bounded subgraph() — context/orphans will reuse), core/graph.ts (pure GraphExport shaping + DOT serializer), commands/graph.ts (thin command), cli.ts wiring; docs/reference/cli-surface.md + CHANGELOG updated.

Workflow code-review (max, 32 agents) folded before merge. Notable: per the user's call, replaced --format dot|json with a --dot flag (the json-named format value produced human text — a least-astonishment trap); machine JSON is now the uniform global --json, with --dot/--json mutually exclusive (contract doc updated). Correctness folds: idFromPath normalization of <id> (consistency with rename/supersede), flush advisories before subgraph not_found, empty/coerced title handling, parseDepth safe-integer guard, subgraph maxDepth<=0 short-circuit, buildGraphExport iterates the include set (O(N_sub)). Deferred with rationale: shared option-parser/usage()/plural() debt (no NEW divergence; future shared-parser refactor) and BundleGraph adjacency memoization (rated plausible; fold in LCLI-34 where context calls subgraph per-target). Both reserved-hub findings REFUTED (child-directory indexes are frontmatter-free, so not graph nodes; only the root index appears — correct for a read-only view).

AC#1 (dot + json outputs both work — now via --dot and the global --json) and AC#2 (token estimates in --json) satisfied; smoke-tested on the repo's own docs/ (31 concepts, 647 edges; exit 0/2/3 confirmed). Gates: 853 tests, biome + tsc clean, core 100% func+line.
<!-- SECTION:NOTES:END -->
