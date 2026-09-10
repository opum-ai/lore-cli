---
# yaml-language-server: $schema=../../.lore/schemas/spec.schema.json
type: Spec
title: Backlog knowledge adoption contract
tags:
  - backlog
  - migration
  - interop
  - contract
  - provenance
summary: Versioned public Lore contract for deterministic, compensable adoption of Backlog knowledge records without exposing private Lore state.
timestamp: 2026-08-14T23:06:59.511Z
---

# Backlog knowledge adoption contract

## Summary

LCLI-330 defines the public contract for a future, controlled adoption of
knowledge records from a Backlog repository into a Lore bundle. The command
family is deliberately explicit: `lore backlog adopt preview`, `apply`,
`status`, and `rollback`. It is a Backlog-specific contract, not a claim that
Lore imports arbitrary trackers, and it does not imply that Quest is published
or is Lore's default tracker.

The caller supplies source evidence; Lore owns every destination write. A
preview is read-only and produces a deterministic approval receipt. Apply
accepts only that exact receipt, records the artifacts it created, and makes
them available for a reverse-order, ownership-fenced rollback.

## Requirements

- The source manifest schema is `lore-backlog-adoption-source/1`. It names one
  source repository identity and revision, then a deterministic ordered list
  of Backlog records. Each record includes its repository-relative source
  path, stable source record ID, source record type, and content digest.
  Absolute paths, credentials, and private Lore state are not source facts.
- The public command root is `lore backlog adopt`. Every operation accepts an
  explicit source-manifest path or an existing migration identity; none scans
  parent directories, discovers repositories, or reads a caller's private
  database.
- `preview` is read-only. For an unchanged valid source manifest it is
  byte-stable and returns `kind: backlog.adoption.preview` with an approval
  receipt whose schema is `lore-backlog-adoption-plan/1` and whose digest is
  computed from the normalized source evidence and proposed changes.
- `apply` requires the exact preview receipt digest and returns
  `kind: backlog.adoption.apply`. It rejects a stale, changed, unknown, or
  differently normalized source instead of guessing. Repeating a successful
  apply with the same migration identity is idempotent.
- `status` returns `kind: backlog.adoption.status` and reports the exact
  migration identity, receipt digest, source revision, owned created
  artifacts, and one of `previewed`, `applied`, `rolled-back`, or
  `blocked-incomplete`.
- `rollback` returns `kind: backlog.adoption.rollback`. It removes only the
  exact Lore concepts created by the named migration, in reverse creation
  order, and reports every removed concept ID and path. An altered, missing,
  or no-longer-owned artifact produces `blocked-incomplete`; it never deletes
  a best match or an unrelated authored concept.
- Backlog `decision` records map to Lore `ADR`; `specification` records map to
  `Spec`; `guide` and `runbook` records map to `Runbook`; and `other` or
  `readme` material maps to `Reference`. An unsupported source type is a
  fidelity gap, not an implicit conversion.
- The contract is additive to Lore's global JSON envelope. Each successful
  response uses `{ schemaVersion, kind, data }`; existing command kinds and
  fields are never repurposed.

## Design

### Preview and approval receipt

Preview resolves each source record without writing a Lore file, managed
block, index, task, or graph. Its `data` includes the source repository and
revision, ordered record provenance, the proposed Lore concept ID or a stable
creation handle, the mapped type, collisions, fidelity gaps, and the
`approval` receipt.

A collision says why the destination cannot be created unchanged (for example,
an existing concept ID with differing content). A fidelity gap says exactly
which source fact lacks a lossless Lore representation. Neither may be hidden
behind a generic warning. The approval receipt contains the migration identity,
source-manifest digest, proposed-artifact digest, and final approval digest;
apply compares the latter byte-for-byte with its own normalized preview before
it writes.

### Apply, status, and compensation

Apply creates concepts through Lore's public authoring and reconciliation
paths. It records, for every created artifact, the migration identity, source
repository/revision/path/record type, and exact resulting concept ID and
repository-relative path. It does not let a caller write markdown,
frontmatter, managed regions, indexes, task files, or `.lore/` graph data.

If apply fails after any creation, Lore reports `blocked-incomplete` with the
exact completed artifacts and a compensation order. It must never report
success for a partial migration. Status exposes that evidence without relying
on a private database. Rollback uses it to compensate in reverse order, stops
at the first ownership mismatch, and reports both completed removals and the
unresolved remainder.

### Source-to-Lore mapping

| Backlog source record | Lore concept | Required retained provenance |
| --- | --- | --- |
| Decision | ADR | repository, revision, path, record ID/type, migration identity |
| Specification | Spec | repository, revision, path, record ID/type, migration identity |
| Guide or runbook | Runbook | repository, revision, path, record ID/type, migration identity |
| Other or README material | Reference | repository, revision, path, record ID/type, migration identity |

The map is intentionally one-way for this operation: the source repository is
read-only, and a successful adoption does not change Backlog records or infer a
bidirectional synchronization policy.

### Ownership boundary

The command family owns only migration-created destination concepts and its
public receipts. Lore remains the sole author of Lore files and generated
surfaces; callers coordinate through the CLI envelope and must never reach
into Lore's private files, managed blocks, indexes, cache, or graph. The
existing Backlog adapter contract remains the baseline for ordinary task
coupling and is not changed by this future migration contract.

## Open questions

- LCLI-331 implements this contract, including its executable schemas,
  idempotency, source validation, and fault-injection coverage. It must not
  broaden the command family to other tracker types without a separate public
  contract.
- LCLI-332 determines release versioning and artifact evidence only after the
  implementation is complete; publication remains separately authorized.
