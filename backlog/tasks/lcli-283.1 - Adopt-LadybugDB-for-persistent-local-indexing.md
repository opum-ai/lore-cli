---
id: LCLI-283.1
title: Adopt LadybugDB for persistent local indexing
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:32'
updated_date: '2026-08-03 16:10'
labels:
  - ladybugdb
  - indexing
  - performance
  - local-graph
  - 'doc:stories/build-the-persistent-local-graph-platform'
milestone: m-13
dependencies:
  - LCLI-31
  - LCLI-33
  - LCLI-34
  - LCLI-279
references:
  - docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/stories/build-the-persistent-local-graph-platform.md
parent_task_id: LCLI-283
priority: high
type: feature
ordinal: 386000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduce LadybugDB as the rebuildable persistent local projection behind Lore retrieval so repeated graph, query, and context operations scale beyond per-invocation parsing while preserving the current deterministic contracts and Git-native source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fresh LadybugDB projection can be built from the deterministic export and is invalidated or rebuilt on schema, bundle, task, repository, or commit mismatch
- [x] #2 Graph, query, and context preserve their documented envelopes, errors, ordering, filters, depth, budgets, and no-embedding behavior across indexed and fallback paths
- [x] #3 Corrupt, stale, locked, or incompatible indexes fail safely or rebuild without changing repository source files
- [x] #4 Supported install and binary targets pass native packaging, concurrency, migration, recovery, and deterministic conformance tests
- [x] #5 Cold and warm benchmarks on representative small and large bundles demonstrate explicit performance, memory, disk, and scale gates
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the live parent against its four completed formal dependencies and five completed child tasks on merged dev 010fd10; map each parent acceptance criterion to objective child-task and CI evidence. 2. Run focused pinned-runtime lifecycle, indexed retrieval, local-graph conformance, concurrency, benchmark-gate, and version-qualification tests on the integrated tree, plus typecheck and diff hygiene. 3. Perform an adversarial self-review for evidence gaps, then use the Backlog finalization workflow to check only proven parent criteria, record exact evidence, and mark Done. 4. Commit the parent-only Backlog settlement, push the isolated branch, open a PR to dev, monitor required checks, and merge only if green under the user's explicit authorization. Preserve the dirty primary checkout and retain the guarded lease.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent settlement evidence on merged dev 010fd10c7b88021aa770bb3434831e82f8134c5a (2026-08-01):

- Readiness: formal dependencies LCLI-31, LCLI-33, LCLI-34, and LCLI-279 are Done. Child tasks LCLI-283.1.1 through LCLI-283.1.5 are Done with every child acceptance criterion checked and terminal summaries present.
- Current integrated verification under exact Bun 1.2.23: npx --yes bun@1.2.23 focused Ladybug tests passed 89 tests, 0 failures, and 776 expectations across 12 files. npx --yes bun@1.2.23 run typecheck, npx --yes bun@1.2.23 run lint (152 files), and git diff --check passed.
- AC 1: lifecycle and local-graph contract suites prove deterministic build, fingerprint mismatch classification, immutable publication, and rebuild behavior.
- AC 2: indexed/reference conformance proves exact graph/query/context envelopes, errors, ordering, filters, depth, budgets, provenance, fallback parity, and the no-native-identifier/no-Cypher boundary.
- AC 3: lifecycle, indexed retrieval, and concurrency suites prove corrupt/stale/locked/incompatible recovery or fallback without repository-source mutation.
- AC 4: current concurrency and package-qualification suites pass; completed children additionally record exact Bun 1.2.23 native/fallback evidence across Darwin arm64/x64, Linux arm64/x64, and Windows x64, release qualification run 30701802962, PR repair run 30708064793, and terminal-head run 30708344928.
- AC 5: current fixture/report/gate/runner suites pass; LCLI-283.1.4 records release run 30701802962 passing all 18 frozen performance gates on versioned small and large fixtures.
- Adversarial self-review (not independent): the branch changes only the parent Backlog record; no source or documentation implementation is being inferred from code presence. Every parent criterion maps to executable current-tree evidence plus terminal child evidence. No Definition of Done items are configured. The guarded Treehouse lease remains retained; no cleanup or publication is part of settlement.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settled the LadybugDB persistent-indexing parent from completed formal dependencies and all five terminal child tasks. Integrated Bun 1.2.23 verification passed 89 focused lifecycle, retrieval, concurrency, packaging, qualification, fixture, and benchmark tests with 776 expectations, plus typecheck, Biome, and diff hygiene. The merged child evidence additionally covers all supported native/fallback hosts, recovery, packaging, and the 18 frozen performance gates.
<!-- SECTION:FINAL_SUMMARY:END -->
