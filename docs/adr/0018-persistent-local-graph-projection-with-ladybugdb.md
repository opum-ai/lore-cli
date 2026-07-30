---
type: ADR
title: "ADR-0018: Persistent local graph projection with LadybugDB"
tags:
  - ladybugdb
  - indexing
  - retrieval
  - performance
  - local-graph
summary: Adopts LadybugDB as a rebuildable persistent local projection while preserving deterministic Lore contracts, Git source truth, and the no-vector boundary.
timestamp: 2026-07-30T13:34:59.928Z
supersedes: adr/0015-lightweight-retrieval-no-vectors
---

# ADR-0018: Persistent local graph projection with LadybugDB

## Status

Accepted — 2026-07-30

## Context

ADR-0015 selected fresh in-memory retrieval because repository bundles were small, rebuilding avoided stale state, and a persisted index would have added packaging and invalidation cost. That remains a sound reference implementation, but the product roadmap now prioritizes persistent indexing, repeated-query performance, and scale before adding the local graph explorer or richer graph workflows.

Every `lore graph`, `lore query`, and `lore context` invocation currently reparses the bundle and reconstructs traversal or lexical structures. Larger bundles, repeated agent calls, an interactive explorer, and future explicitly composed repository workspaces need a durable local projection. LadybugDB provides an embedded property graph, Cypher execution, and persistent indexes in the Node process, but also introduces native packaging, schema evolution, file locking, cache invalidation, and semantic-drift risks that Lore must contain.

## Decision

Adopt LadybugDB as the persistent local graph projection owned by `lore-cli`.

1. Git-tracked OKF documents and Backlog records remain authoritative. The LadybugDB files are disposable derived state built only from the validated deterministic projection contract. They are ignored by Git and can always be deleted and rebuilt.
2. M6 starts with one repository projection. The index records its format version, Lore version, LadybugDB version, bundle identity, repository and commit identity, export digest, and task snapshot fingerprint. Any incompatible or stale fingerprint triggers the documented rebuild or fallback path.
3. Index construction and replacement are transactional from the caller perspective. A crash, corrupt file, unsupported schema, or interrupted migration leaves either the last verified index or a clearly rebuildable state and never mutates source documents.
4. The observable `graph.export`, `query.results`, and `context.export` contracts remain authoritative. Indexed and reference in-memory implementations share conformance fixtures for ordering, ranking, filtering, depth, token budgets, truncation, errors, duplicates, dangling references, Unicode, and provenance.
5. The no-vector boundary is retained. Default retrieval uses authored graph structure and deterministic lexical ranking with no embeddings, vector index, hosted model, or inferred relationship. Ladybug full-text behavior may be used only when it reproduces the accepted Lore query contract.
6. Cypher and LadybugDB identifiers remain implementation details. Public commands expose bounded Lore operations, never arbitrary Cypher.
7. Concurrency follows a single-writer ownership model. Independent processes never open the same projection in conflicting read-write modes. Contention produces a stable diagnostic, read-only access, rebuild, or fallback according to the lifecycle contract.
8. The delivery sequence is fixed: M6 persistent indexing, performance, packaging, recovery, and scale gates; M7 local graph explorer; M8 LadybugDB-enabled workspace, path, impact, change, and provenance capabilities.
9. A future local workspace is explicit and workspace-scoped. Lore does not silently place every repository on a machine into one mutable user-global graph.
10. The local stdio MCP transport remains on hold and unscheduled. It is not a dependency of M6, M7, or M8 and can be reconsidered only through an explicit backlog decision after those milestones.

This decision supersedes the persisted-index rejection in ADR-0015 and carries forward its deterministic, no-LLM, no-vector, authored-structure, and bounded-output requirements. It also replaces the M6 scheduling clause in ADR-0004 and the M7/M8 scheduling clauses in ADR-0016; their underlying MCP and Confluence designs remain retained on hold.

## Consequences

- Repeated retrieval and interactive consumers can reuse a durable projection instead of rebuilding every structure on every invocation.
- Performance and scale become measurable release gates rather than assumed benefits; cold build, warm open, query latency, memory, disk, and large-fixture results must be recorded.
- The explorer and later graph capabilities can share a stable local projection without creating a second semantic implementation.
- Native dependency size, supported-platform coverage, schema migration, corruption recovery, and file-lock behavior become release responsibilities.
- Small repositories retain the deterministic reference path and must not suffer an unacceptable regression merely to optimize larger workloads.
- Local projection files contain repository-derived content and therefore require explicit storage, deletion, privacy, and diagnostic-redaction rules.
- Hosted AuraDB and the private `lore-graph` API remain separate. This ADR changes the local CLI projection only and does not move hosted graph ownership into `lore-cli`.
