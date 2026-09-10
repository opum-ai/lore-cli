---
type: Spec
title: Snapshot change and provenance workflows
tags:
  - graph
  - snapshots
  - provenance
summary: Defines explicit retained projection snapshots, bounded comparison, exact provenance, deletion, and offline explorer history workflows.
timestamp: 2026-08-03T00:02:41.983Z
status: in-progress
---

# Snapshot change and provenance workflows

## Summary

`LCLI-283.3.4` adds an explicit, storage-neutral history layer above the
validated repository and workspace projections. Lore retains history only when
the operator asks, compares two snapshots within one exact scope, and resolves
one concept, task, or authored-edge record back to its immutable source
evidence. LadybugDB remains a disposable current-state index and is not the
history format.

The command and offline explorer surfaces consume the same canonical
`lore-retained-snapshot/1` facts. They preserve authored duplicates and
dangling relationships, infer no renames or edges, expose no repository
locators, and never silently discard retained history.

## Requirements

- `lore snapshot retain` is the only operation that creates historical state.
  `list` and exact-key or `--all` `delete` operate within one explicitly
  selected repository or workspace scope. There is no time-based retention,
  automatic capture, or implicit eviction.
- Each scope retains at most 16 snapshots below
  `.lore/cache/snapshots/1/<scope-kind>/<scope-key-digest>/`. Reaching the cap
  is a conflict until the operator deletes named evidence. Cache ancestors and
  snapshot entries must be real contained directories/files, never symlinks.
- `lore changed <from> <to>` compares snapshots from the same scope. The
  default result limit is 100, the hard result maximum is 1,000, and the hard
  fact-scan budget is 1,000,000. Results report shown/total/scanned,
  truncation, and whether the scan completed.
- Comparison keys are stable fact kind plus record key. A path change under a
  stable concept ID is `changed`; a changed ID is `removed` plus `added`.
  Duplicate authored edge records remain independent. Lore never guesses a
  rename, reciprocal relationship, or transitive relationship.
- `lore provenance <id> --kind <concept|task|edge> --snapshot <selector>`
  returns one exact retained fact and its member, repository, bundle, nullable
  commit, export, record, source-record, source-key, and source-path evidence.
  Ambiguous commit or source-record selectors fail instead of selecting by
  order.
- Workspace commands require an explicit manifest; repeatable
  `--repository <member-id>` filters require that manifest. Deleted workspace
  manifests remain manageable only through the stable `--workspace-id` scope
  selector on snapshot lifecycle operations.
- `lore explorer --snapshot <selector>` and `lore explorer --from <selector>
  --to <selector>` produce the separate
  `lore-explorer-change-snapshot/1` artifact. It embeds retained source facts
  and a replay-validated bounded comparison, supports search/kind/change
  filters and paired provenance, and performs no network requests.
- Ordinary `lore explorer` bytes and `lore-explorer-snapshot/1` remain
  unchanged when no historical selector is supplied.

## Design

### Canonical retained facts

`src/core/snapshot.ts` is the executable model. A retained snapshot carries its
scope and snapshot identities, ordered repository provenance, exact counts,
and ordered concept/task/edge facts. Authored comparison values are separated
from provenance so Git/export/source changes remain inspectable without being
mistaken for authored deltas. Serialization is canonical JSON with a trailing
newline and rejects non-canonical or unsupported input. Concept bodies are
never retained; frontmatter keys that identify passwords, credentials, secrets,
API keys, or database paths/URIs are recursively omitted before retention and
rejected if found in stored bytes.

Repository snapshots are projected from the established M6 source. Workspace
snapshots are projected from the complete M8 workspace source and retain the
member provenance already established by the workspace contract. Neither form
contains an absolute locator or a database-specific identifier.

### Explicit store and selectors

`src/core/snapshot-store.ts` owns a contained file store. Retention uses an
exclusive temporary file and atomic rename, then makes the immutable entry
read-only. Listing validates every entry before returning it. Exact snapshot
keys always select one file; a Git commit is accepted only when it identifies
one retained snapshot in the selected scope. Deletion resolves the complete
target set before removing exact files and never recurses beyond that scope.

### Comparison and provenance

The merge comparison walks canonical fact order under the hard scan budget.
Added/removed rows carry one side; changed rows carry both authored values and
the sorted field names whose canonical values differ. Edge rows additionally
label the relationship delta. Repository and kind filters are normalized into
the result contract so a consumer can reproduce the same view.

Provenance lookup accepts a public ID, exact record key, or source-record key
only within the explicitly named fact kind. Zero matches is not found; multiple
matches is a conflict with an exact-record-key remedy.

### Historical explorer

The historical artifact embeds both retained snapshots and the
`lore-changed-result/1` comparison. Its parser recomputes the comparison from
the embedded facts and rejects any mismatch before rendering. Snapshot mode
embeds the same retained snapshot on both sides and lists all retained facts;
comparison mode lists the bounded deltas with paired authored values and exact
source evidence. A restrictive Content Security Policy disables connections,
forms, external resources, and base navigation.

The shared `test/fixtures/snapshot/v1.json` fixture is the conformance source
for comparison, provenance, CLI, and explorer tests.

## Open questions

None for schema version 1. Expanding retention, changing bounds, inferring
renames, or adding a remote history service requires a new contract decision.
