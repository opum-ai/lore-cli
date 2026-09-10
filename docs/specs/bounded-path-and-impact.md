---
type: Spec
title: Bounded path and impact
tags:
  - local-graph
  - traversal
  - ladybugdb
summary: Bounded explainable traversal over exact authored concept and task relationships.
timestamp: 2026-08-02T22:38:45.946Z
---

# Bounded path and impact

## Summary

Lore exposes two bounded, explainable traversal operations over the exact
authored concept, task, and workspace-link records in its validated projection.
`lore path` enumerates deterministic shortest simple paths between typed
endpoints. `lore impact` expands one typed endpoint and retains one canonical
shortest evidence chain for each affected endpoint. Both commands have the same
observable behavior through the reference and verified LadybugDB readers.

## Requirements

- `lore path <from> <to>` requires `--from-kind <concept|task>`,
  `--to-kind <concept|task>`, and
  `--direction <outbound|inbound|either>`.
- `lore impact <id>` requires `--kind <concept|task>` and the same explicit
  `--direction` flag.
- Both commands accept repeatable `--edge <authored-kind>` allowlists,
  `--max-depth <n>`, `--limit <n>`, `--workspace <manifest>`, and repeatable
  `--repository <member-id>`. Omitting `--edge` selects every authored kind in
  the chosen scope; an unknown kind is a usage error.
- Repository-local endpoints use their existing source ids. Workspace endpoints
  use `<member-id>::<source-id>` and repository selectors filter endpoints and
  edges before traversal. Lore never discovers repositories or relationships.
- Traversal defaults to maximum depth 4 and at most 20 returned results. The
  hard public maxima are depth 16, 100 results, and 10,000 visited edges per
  invocation. Exceeding the edge-visit or result budget returns an explicitly
  truncated, incomplete result rather than performing unbounded work.
- Paths retain duplicate authored edges as distinct evidence, reject cycles
  within a single path, and are ordered shortest-first with deterministic
  code-unit tie breaking. Dangling edges remain exact projection facts but
  cannot be traversed. No path is a successful result with an empty `paths`
  array.
- Impact returns each reachable endpoint once, using its canonical shortest
  evidence chain, and labels it `direct` at depth 1 or `transitive` thereafter.
- Every endpoint carries locator-free repository, bundle, commit, export,
  record, source-id, and source-path provenance. Every evidence edge carries
  its distinct record key, original source-record key, stored orientation,
  traversal direction, authored kind, and both endpoint provenances.
- Cypher, Ladybug table names and ids, database paths, inferred dependencies,
  model calls, embeddings, and hidden global graphs never enter either public
  contract.

## Design

`core/traversal.ts` builds a storage-neutral typed snapshot from canonical
`ConceptRecord`, `TaskRecord`, and `AuthoredEdgeRecord` values. It keys endpoint
identity by `(kind, id)`, preserves authored edge records independently, and
constructs direction-specific adjacency only after repository and edge-kind
selection. Breadth-first traversal supplies deterministic shortest paths and
impact evidence while the maximum depth, result cap, and edge-visit budget
bound every loop.

The indexed reader reconstructs the same typed records from a fully verified
immutable Ladybug generation; the reference reader uses the validated
projection source. Backend selection and fallback finish before emission. The
new `path.result` / `lore-path-result/1` and `impact.result` /
`lore-impact-result/1` payloads are additive: `graph.export`, `query.results`,
`context.export`, and repository-local behavior remain unchanged.

Both result schemas include the normalized request, selected edge kinds,
effective limits, result rows, `shown`, `edgeVisits`, `depthBoundReached`,
`truncated`, and `complete`. `depthBoundReached` reports that the requested
depth boundary stopped further expansion; it does not by itself make the
bounded request incomplete. `complete` is false when Lore stopped because of
the result or hard edge-visit budget.

## Open questions

None for this contract. Snapshot comparison and retained historical traversal
belong to `LCLI-283.3.4`.
