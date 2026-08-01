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

## Frozen M6 projection contract

### Runtime boundary

The [official native Node package](https://docs.ladybugdb.com/client-apis/nodejs/)
is `@ladybugdb/core`. The package, its platform binaries, and Ladybug's database
file format are implementation dependencies, not public Lore contracts. M6
records the exact installed Ladybug version in every index and treats a version
change as rebuildable; it does not assume database-file compatibility across
Ladybug releases. The exact package version is selected and
compatibility-tested under pinned Bun 1.2.23 by the implementation and
packaging tasks. No native package is added by this contract-only decision.

Ladybug's [concurrency contract](https://docs.ladybugdb.com/concurrency/)
permits either one read-write `Database` object or multiple read-only objects
for one on-disk database, but not a read-write object concurrently with
separate read-only objects. Lore therefore never mutates a generation that a
reader can open. A writer constructs a new generation in isolation; published
generations are immutable and opened read-only.

### Format and storage

The Lore index format is `ladybug-projection/1`. One repository projection is
stored below:

```text
.lore/cache/graph/ladybug/1/
  writer.lock
  generations/
    <source-fingerprint>/
      index.json
      projection.lbdb
```

Staging directories are siblings of `generations/` and begin with
`.building-`. The complete repository-local root is ignored by Git. Lore does
not create a user-global graph, put absolute repository paths or credentials in
the index, or write any file under `docs/`, `backlog/`, `.git/`, or another
source directory while inspecting, building, serving, recovering, or deleting
the projection.

`index.json` is a deterministic control manifest written last. It duplicates
the compatibility and freshness fields needed before the native database is
opened, plus the SHA-256 digest and byte length of the closed
`projection.lbdb`. A generation without a parseable, supported control manifest
is never served. The database contains the same metadata so a sidecar/database
mismatch is corruption, not a freshness result.

### Stable identities and provenance

The schema consumes only validated `lore export` schema `1.0` records. Database
internal node and relationship ids are never persisted as source identities or
returned through a Lore contract.

- `recordKey` is the export record's `key` for concepts, tasks, and authored
  edges. It is the primary source identity and remains stable across rebuilds
  when the source record is unchanged.
- `repositoryScopeKey` is
  `sha256("lore-repository-scope/1\0" + bundle.id + "\0" + bundle.docsRoot)`.
  It identifies the single-repository M6 scope using export facts only. M8 may
  introduce a separately versioned cross-repository identity; it must not
  reinterpret this value.
- `snapshotKey` is
  `sha256("lore-projection-snapshot/1\0" + repositoryScopeKey + "\0" +
  trailer.streamHash)`.
- `commitKey` is
  `sha256("lore-source-commit/1\0" + repositoryScopeKey + "\0" + gitCommit)`
  when `gitCommit` is non-null.
- Task and authored-edge nodes retain `sourceRecordJson` as canonical JSON exactly
as received. Concept nodes instead retain the complete frontmatter JSON plus
promoted identity, content, and lexical fields, from which Lore reconstructs
the same source record. This avoids storing each large document body twice
while preserving additive fields, unknown OKF fields and types, and nullable
values.
- Every record node carries `repositoryScopeKey`, `snapshotKey`, `bundleId`,
  nullable `gitCommit`, and `exportDigest`. Concepts additionally retain the
  repository-relative source `path`; authored edges retain `kind`, authored
  `target`, `ordinal`, nullable resolved target key, and `dangling`.
- `taskSnapshotDigest` is SHA-256 over the ordered canonical JSON of all export
  `task` records and `kind: "task"` edge records. It is recorded separately
  even though those bytes also contribute to `exportDigest`.

Repository provenance in M6 therefore means the repository-local projection
scope plus bundle, commit, export, record, and repo-relative source facts. Lore
does not infer a remote-repository identity that export schema `1.0` does not
provide.

### Property-graph schema

All table and property names below are internal. A physical-schema change must
either use a new Lore index-format version or add required control metadata that
makes every earlier layout rebuild before native open. `STRING` JSON properties
contain canonical JSON; promoted concept fields remain a lossless reconstruction
of the source object.

| Node table | Primary key | Required projected properties |
|---|---|---|
| `RepositoryProjection` | `repositoryScopeKey STRING` | `bundleId STRING`, `docsRoot STRING` |
| `ProjectionSnapshot` | `snapshotKey STRING` | version, repository, bundle, commit, export, task-snapshot, and source fingerprints; `sourceRecordsDigest STRING`, `recordKeysDigest STRING`; lexical document/length totals; record/type counts; `manifestJson STRING`, `trailerJson STRING` |
| `SourceCommit` | `commitKey STRING` | `repositoryScopeKey STRING`, `sha STRING` |
| `ConceptRecord` | `recordKey STRING` | common provenance fields, `conceptId STRING`, `path STRING`, `conceptType STRING`, `frontmatterJson STRING`, nullable `title STRING`, nullable `summary STRING`, nullable `description STRING`, `tagsJson STRING`, `body STRING`, `contentHash STRING`, `tokenEstimate INT64`, `lexicalLength INT64` |
| `TaskRecord` | `recordKey STRING` | common provenance fields, `taskId STRING`, `title STRING`, `status STRING`, `labelsJson STRING`, `priority STRING`, `ordinal INT64`, `assigneesJson STRING`, `milestone STRING`, `parentTaskId STRING`, `sourceAdapterVersion STRING`, `sourceRecordJson STRING` |
| `AuthoredEdgeRecord` | `recordKey STRING` | common provenance fields, `fromRecordKey STRING`, `toRecordKey STRING`, `kind STRING`, `target STRING`, `ordinal INT64`, `dangling BOOL`, `sourceRecordJson STRING` |
| `LexicalTerm` | `termKey STRING` | `documentFrequency INT64`; `termKey` is a deterministic term digest, not public query text |

`gitCommit`, task optionals, and an authored edge's `toRecordKey` are nullable.
`SourceCommit` is omitted when the export manifest has no commit. Common
provenance fields are `repositoryScopeKey`, `snapshotKey`, `bundleId`,
nullable `gitCommit`, and `exportDigest`.

The internal relationship tables are:

| Relationship table | Direction |
|---|---|
| `HAS_SNAPSHOT` | `RepositoryProjection` → `ProjectionSnapshot` |
| `AT_COMMIT` | `ProjectionSnapshot` → `SourceCommit` |
| `HAS_CONCEPT` | `ProjectionSnapshot` → `ConceptRecord` |
| `HAS_TASK` | `ProjectionSnapshot` → `TaskRecord` |
| `HAS_EDGE` | `ProjectionSnapshot` → `AuthoredEdgeRecord` |
| `EDGE_SOURCE` | `ConceptRecord` → `AuthoredEdgeRecord` |
| `EDGE_CONCEPT_TARGET` | `AuthoredEdgeRecord` → `ConceptRecord` |
| `EDGE_TASK_TARGET` | `AuthoredEdgeRecord` → `TaskRecord` |
| `HAS_TERM` | `ConceptRecord` → `LexicalTerm`; relationship property `frequency INT64` |

Every export manifest and trailer maps to `ProjectionSnapshot`; every concept
maps to one `ConceptRecord`; every task maps to one `TaskRecord`; and every
authored concept or task edge maps to its own `AuthoredEdgeRecord`. An authored
edge is never collapsed into a direct database relationship. This preserves
duplicates as distinct `recordKey`/`ordinal` pairs and preserves dangling edges
as records with no target relationship. No task-parent, backlink, semantic, similarity, or inferred edge is added by M6.

Each concept also maps to deterministic lexical postings. Lore hashes normalized
terms into primary-keyed `LexicalTerm` nodes and records per-concept frequency
on `HAS_TERM`; snapshot totals and per-document lengths support the accepted
BM25 calculation. Queries resolve term nodes by primary key and traverse only
matching postings, while graph loads omit document bodies and context fetches
only the selected body by primary key. This is an internal acceleration
structure and does not change public ranking, filtering, tie-breaking, or
output.

## Frozen M6 freshness and lifecycle contract

### Fingerprints

Lore computes and stores these values with an explicit domain separator and
canonical UTF-8 JSON:

- `exportDigest` is the export trailer's semantic `streamHash`.
- `taskSnapshotDigest` is defined above.
- `sourceFingerprint` is SHA-256 over
  `ladybug-projection-source/1`, index format, projection schema,
  normalization version, Lore/exporter version, exact Ladybug version,
  repository scope, bundle id, nullable Git commit, a sorted path-and-byte-hash
  inventory of every export input under the configured docs root, the active
  Lore profile bytes, and the canonical Backlog JSON task snapshot. It never
  trusts mtimes, directory mtimes, file size alone, or a clean Git status.

The inventory is a freshness input, not an ingestion bypass: all graph content
still comes from the validated export stream. During a build, Lore computes the
stream and asserts that its manifest, task digest, and trailer agree with the
preflight fingerprint inputs before publication. A source change during the
build invalidates the staging generation and causes a retry or fallback.

### State classification

Classification is deterministic and ordered; the first matching row wins.

| State | Condition | Required behavior |
|---|---|---|
| `locked` | Another live writer owns `writer.lock`, or ownership cannot be proved stale safely | Never remove the lock or generation. A matching verified generation may still be opened read-only; otherwise use the in-memory fallback. An explicit rebuild reports stable conflict semantics. |
| `unsupported` | The selected control manifest has a newer/unknown index-format major or projection-schema major that this Lore cannot interpret | Do not open, migrate, quarantine, or delete it automatically. Use the in-memory fallback and require a compatible Lore version or explicit operator deletion. |
| `corrupt` | The selected generation/control manifest is malformed; required files, completion data, digest/length, duplicated metadata, counts, keys, or relationships disagree; or Ladybug cannot open and verify it read-only | Never serve it. After exclusive writer ownership, quarantine it under the cache root and build from source; failure leaves the in-memory path available. |
| `rebuildable` | No selected generation exists; freshness differs; the exact Lore, normalization, projection minor, or Ladybug version differs; or a known older index format has no read path | Build a new generation from current source. Never serve stale bytes and never perform an in-place database migration. |
| `reusable` | Control format is supported; every compatibility and freshness field matches; file digest/length and duplicated database metadata match; read-only open and structural verification succeed | Serve the immutable generation read-only. |

`locked` describes ownership, so it can coexist with an otherwise reusable
generation; the behavior column resolves that case. Unknown/newer formats are
distinguished from corruption to protect against destructive downgrade
behavior. M6 migrations are rebuild-only because the source is authoritative
and a native file migration adds risk without preserving unique data.

### Build, publication, cleanup, and recovery

1. Compute the current source fingerprint without writing repository source.
   Reuse only a generation that passes the complete `reusable` check.
2. Acquire `writer.lock` by an exclusive filesystem operation. The lock records
   a random owner token, PID, process-start identity when available, hostname,
   and acquisition time. Time or PID absence alone never authorizes lock
   stealing; recovery must prove the recorded process instance is gone and
   reacquire the lock atomically.
3. Recompute freshness after locking. If another process published the exact
   generation, verify and reuse it.
4. Create a unique `.building-<owner-token>` directory. Produce one validated
   export stream, create the frozen schema, bulk-load records and structural
   relationships through bounded CSV staging, checkpoint between phases, close
   Ladybug, and write no source file.
5. Reopen the staged database read-only and perform full logical verification
   against the validated source: duplicated metadata and digests, every concept,
   task, and edge record, promoted fields, document bodies through bounded
   primary-key probes, record counts, structural endpoints, dangling targets,
   and deterministic samples. Conformance tests separately cover lexical scores
   and public output parity. Then close and hash the complete database before
   writing and fsyncing `index.json` last.
6. Recompute the source fingerprint. If it changed, discard only this staging
   directory and retry or fall back.
7. Atomically rename the complete staging directory to
   `generations/<source-fingerprint>`. The content-addressed final path is the
   publication point; there is no mutable `CURRENT` pointer and readers already
   holding an older generation are unaffected.
8. Release the writer lock only if its owner token still matches. Cleanup may
   remove abandoned staging directories and non-current supported generations
   only while holding the writer lock and only after proving Ladybug has no
   open handle. Cleanup failure is advisory and never invalidates a published
   generation.

An interrupted build is invisible because it lacks a final generation path.
An interrupted cleanup cannot remove the current content-addressed generation.
Ladybug's own file lock remains a second safety boundary; an unexpected native
lock error is classified as contention, not corruption. All explicit delete or
rebuild operations remain confined to the resolved repository-local cache root
after containment and symlink checks.

## Consequences

- Repeated retrieval and interactive consumers can reuse a durable projection instead of rebuilding every structure on every invocation.
- Performance and scale become measurable release gates rather than assumed benefits; cold build, warm open, query latency, memory, disk, and large-fixture results must be recorded.
- The explorer and later graph capabilities can share a stable local projection without creating a second semantic implementation.
- Native dependency size, supported-platform coverage, schema migration, corruption recovery, and file-lock behavior become release responsibilities.
- Small repositories retain the deterministic reference path and must not suffer an unacceptable regression merely to optimize larger workloads.
- Local projection files contain repository-derived content and therefore require explicit storage, deletion, privacy, and diagnostic-redaction rules.
- Hosted AuraDB and the private `lore-graph` API remain separate. This ADR changes the local CLI projection only and does not move hosted graph ownership into `lore-cli`.
