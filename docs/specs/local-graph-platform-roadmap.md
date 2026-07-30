---
type: Spec
title: Local graph platform roadmap
tags:
  - ladybugdb
  - graph-explorer
  - roadmap
  - local-graph
summary: Orders the Commander-prepared M6 LadybugDB index, M7 graph explorer, and M8 indexed capabilities while local MCP remains on hold.
timestamp: 2026-07-30T13:35:04.555Z
---

# Local graph platform roadmap

## Summary

The local graph roadmap is outside the hosted private-beta acceptance scope but
may proceed independently. Its feature milestones remain deliberately
sequential: LadybugDB first, the graph explorer second, and new indexed
capabilities third. M6 includes one preparatory CLI lane. After the
LadybugDB schema and lifecycle contract is frozen, the Commander migration and
projection-lifecycle implementation may proceed independently; indexed
`graph`, `query`, and `context` routing waits for both. The M7 explorer contract
may be drafted against the frozen M6 schema, but explorer implementation still
waits for every M6 gate and the stable projection. The local stdio MCP design
remains retained but on hold and is not part of this delivery chain.

Parent task `LCLI-283` owns the roadmap. Milestones and feature gates are:

1. M6 / `LCLI-283.1` — LadybugDB persistent local indexing, with
   `LCLI-284` as the Commander preparation lane.
2. M7 / `LCLI-283.2` — local graph explorer, dependent on M6.
3. M8 / `LCLI-283.3` — LadybugDB-enabled graph capabilities, dependent on M7.
4. Hold / `LCLI-42` — local MCP, unscheduled and outside the dependency graph.

## Requirements

- Git-tracked OKF documents and Backlog records remain the source of truth. Every database and explorer artifact is derived, disposable, and rebuildable.
- The deterministic export contract is the only ingestion boundary. Local projection code does not invent relationships, database identities, or inferred evidence.
- Existing `lore graph`, `lore query`, and `lore context` envelopes and error semantics remain compatible. Indexed behavior is checked against the in-memory reference implementation.
- Commander changes argument parsing and dispatch only. It must preserve the
  documented global-flag positions, `--flag=value` and repeatable-option
  forms, literal `--` behavior, help/version output, injected writers,
  stdout/stderr separation, JSON envelopes, output precedence, semantic exit
  codes, TTY handling, and `NO_COLOR`.
- Default retrieval remains lexical and authored-graph based. No embeddings, vector store, model call, or raw Cypher enters the public local surface.
- Every result that crosses a repository boundary carries repository, bundle, commit, export digest, record identity, and source provenance.
- Workspaces are explicit groups of selected repositories. Lore does not maintain a hidden singleton database containing every local project.
- Each milestone has objective determinism, correctness, performance, accessibility, packaging, recovery, privacy, and scale gates before the next milestone begins.
- Future tasks receive an implementation plan only after activation and current-system research, following Backlog workflow.

## Design

### M6 — LadybugDB persistent local index

`LCLI-283.1` introduces the database foundation before any new UI or graph
operation. The dependency graph intentionally exposes two lanes after the
schema freeze:

- `LCLI-283.1.1` freezes the property-graph schema, provenance model, format version, storage boundary, freshness fingerprint, migration and rebuild rules, and single-writer lifecycle.
- `LCLI-284` migrated the router and command option tokenizers to exact-pinned
  Commander. It depends only on `LCLI-283.1.1`, belongs to M6, and must remain
  complete before indexed command integration.
- `LCLI-283.1.2` implements deterministic projection construction, reconciliation, transactional replacement, invalidation, corruption recovery, and disposal. It also depends on `LCLI-283.1.1` and may proceed independently of `LCLI-284`.
- `LCLI-283.1.3` depends on both `LCLI-283.1.2` and `LCLI-284`, then routes graph, lexical query, and context through indexed retrieval while retaining the in-memory implementation as a conformance oracle and documented fallback.
- `LCLI-283.1.4` establishes cold and warm benchmarks, small and large fixtures, memory and disk budgets, supported native packaging, concurrency tests, and release thresholds.

M6 is complete only when LadybugDB produces a material measured warm-query improvement, remains safe and rebuildable under stale, corrupt, locked, and interrupted states, preserves deterministic output contracts, and does not impose an unacceptable regression on small repositories.

#### Frozen M6 schema and lifecycle

`LCLI-283.1.1` freezes index format `ladybug-projection/1` and the complete
schema/lifecycle in [ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md).
Later M6 tasks implement that contract; they do not select a different
identity, storage, migration, or concurrency model without a superseding
decision.

- The only ingestion boundary is validated `lore export` schema `1.0`.
  `RepositoryProjection`, `ProjectionSnapshot`, `SourceCommit`,
  `ConceptRecord`, `TaskRecord`, and one `AuthoredEdgeRecord` per exported edge
  retain canonical source JSON and repository-scope, bundle, commit, export,
  record, path/target, and task provenance. Separate edge records preserve
  duplicates and dangling targets; Ladybug internal ids are never source ids.
- Storage is repository-local under
  `.lore/cache/graph/ladybug/1/generations/<source-fingerprint>/`. Published
  generations are immutable and opened read-only. One exclusive writer builds
  in a sibling staging directory, closes and reopens for verification, writes
  the control manifest last, and atomically publishes by directory rename.
- The source fingerprint hashes versions and exact source bytes/task snapshot;
  it never trusts mtimes or Git cleanliness. Ordered checks classify an index
  as `locked`, `unsupported`, `corrupt`, `rebuildable`, or `reusable`.
  Unsupported newer formats are preserved, corrupt generations are quarantined
  only under exclusive ownership, and every M6 migration is rebuild-only.
- Readers may share one immutable generation. A writer never opens that
  generation read-write; it builds a new one because Ladybug supports either
  one read-write database object or multiple read-only objects, not both
  concurrently against the same file.
- Every path—reuse, build, recovery, cleanup, fallback, and deletion—is
  read-only with respect to repository sources. No embedding, vector index,
  model call, inferred edge, raw Cypher, database-native id, hidden
  user-global graph, AuraDB, or local MCP surface enters this contract.

The official native package boundary is `@ladybugdb/core`. Its exact version is
selected and tested under pinned Bun 1.2.23 by the implementation/packaging
tasks and recorded in the index; a version change rebuilds rather than assuming
native file compatibility.

### M7 — Local graph explorer

`LCLI-283.2` consumes the stable indexed projection through a Lore-owned read
contract. Its contract task may overlap late M6; implementation may not:

- `LCLI-283.2.1` depends on the frozen projection schema in `LCLI-283.1.1` and may define the explorer snapshot, data, provenance, interaction, accessibility, graph-health, and bounded-rendering contracts while the remaining M6 lanes run.
- `LCLI-283.2.2` depends on both `LCLI-283.2.1` and completion of all `LCLI-283.1` gates, then builds the deterministic static explorer and CLI entrypoint with search, filters, detail inspection, inbound and outbound focus, depth focus, dangling references, and supersession chains.
- `LCLI-283.2.3` proves keyboard and screen-reader access, responsive and reduced-motion behavior, offline and credential-free packaging, browser compatibility, reproducible artifacts, and large-graph performance.

The baseline deliverable is a read-only static artifact that performs no network request. A loopback-only live refresh mode is optional and must use the same bounded read contract; it cannot expose database credentials, writes, or arbitrary queries.

### M8 — LadybugDB-enabled graph capabilities

`LCLI-283.3` begins only after the explorer ships, so new operations are developed against both a stable projection and a visible evidence surface.

- `LCLI-283.3.1` defines explicit workspaces, cross-repository identities, worktree and branch behavior, conflicts, privacy, deletion, and rebuild boundaries.
- `LCLI-283.3.2` indexes selected repository exports into a workspace projection and extends graph, query, and context with deterministic repository scopes and merged evidence.
- `LCLI-283.3.3` adds bounded path and impact operations with edge allowlists, direction, depth, limits, completeness, truncation, and explainable edge chains.
- `LCLI-283.3.4` adds explicit snapshot comparison, changed-since, relationship delta, retention, deletion, provenance, CLI, and explorer workflows.

M8 public contracts remain bounded Lore operations. LadybugDB, Cypher, physical table names, and internal identifiers remain replaceable implementation details.

### Fresh-session execution order

Start a new implementation session from `dev` in this order:

1. Activate and complete `LCLI-283.1.1`; do not start implementation from the
   high-level parent alone.
2. After the schema/lifecycle contract is accepted, `LCLI-284` and
   `LCLI-283.1.2` are independent implementation lanes. Give each its own
   feature branch, activation, current-system research, and Backlog plan.
3. Start `LCLI-283.1.3` only after both lanes merge. This prevents new indexed
   flags and dispatch paths from being reimplemented outside the declarative
   Commander/manifest boundary when indexed retrieval arrives.
4. Finish `LCLI-283.1.4` before accepting M6.
5. `LCLI-283.2.1` may begin after step 1, but do not begin
   `LCLI-283.2.2` until M6 is accepted. M8 and local MCP remain out of scope.

### Held work

`LCLI-42` is labeled `on-hold`, assigned to the Hold milestone, and remains `To Do` because this Backlog configuration has no separate held status. Its tool and resource design is retained for future evaluation, but no M6, M7, or M8 task depends on it. Reactivation requires an explicit roadmap decision after the three scheduled milestones.

Previously scheduled Confluence and importable-library work also remains retained in hold milestones so the new M6–M8 numbering is unambiguous without deleting historical intent.

## Open questions

These are stage decisions, not permission to reorder the roadmap:

- M6 must set quantitative cold-build, warm-open, repeated-query, memory, disk, and small-repository regression thresholds from versioned benchmark baselines.
- M6 must confirm the cross-platform native package and compiled-binary strategy before selecting mandatory versus optional installation behavior.
- M7 must select the rendering library and static packaging form only after measuring deterministic layout, accessibility, artifact size, and large-graph behavior.
- M8 must set snapshot retention defaults and workspace portability rules before persisting more than the current verified projection.

The accepted architecture boundary is recorded in [ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md).
