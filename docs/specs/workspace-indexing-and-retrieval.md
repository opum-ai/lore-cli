---
type: Spec
title: Workspace indexing and retrieval
summary: Defines deterministic multi-repository workspace projection, indexing, cache lifecycle, provenance, and CLI retrieval behavior.
timestamp: 2026-08-02T14:58:41.345Z
---

# Workspace indexing and retrieval

## Summary

`LCLI-283.3.2` implements the first multi-repository read surface on the frozen
[`lore-workspace-manifest/1`](local-workspace-identity-contract.md) identity
contract. `lore graph`, `lore query`, and `lore context` can read one explicit
JSON manifest, validate every named repository export, and compose a complete
namespaced workspace projection. The existing single-repository behavior is
unchanged when no workspace is selected.

Workspace databases are current-only, disposable LadybugDB projections. They
contain validated export facts and explicit manifest links, never repository
locators or a machine-wide repository inventory. Supported hosts use the
verified indexed read path; automatic mode retains the deterministic in-memory
implementation as its pre-output fallback.

## Requirements

- Workspace mode requires `--workspace <manifest>` on each read command. Lore
  never discovers manifests or repositories implicitly. Repeatable
  `--repository <member-id>` selectors narrow results to an explicit subset and
  are rejected without `--workspace`.
- The manifest must be a real regular JSON file, not a symlink. Every member
  locator resolves relative to that manifest unless absolute, and must name a
  real non-symlink directory. An `expectedRef`, when present, must equal the
  checkout's exact symbolic Git ref.
- Lore loads and validates every selected repository through the existing M6
  deterministic export boundary before constructing a candidate. Missing
  repositories, invalid exports, ref conflicts, and explicit links with absent
  endpoints reject the whole candidate; no partial result is published.
- Public concept and task IDs use `<member-id>::<source-id>`. Repository-local
  authored links never escape their member. Cross-repository links exist only
  when the manifest names both endpoints explicitly.
- `graph`, `query`, and `context` JSON results add
  `lore-workspace-result-scope/1` plus locator-free per-record provenance.
  Single-repository envelopes do not gain placeholder workspace fields.
- A repeated repository selector, unknown member, unqualified workspace root
  ID, symlinked control-plane path, or invalid candidate fails loud with Lore's
  existing semantic error classes.
- The index lives below `.lore/cache/workspaces/1/<workspace-key>/`, where the
  on-disk segment is the workspace key's portable SHA-256 hex component. A
  successful replacement retains only the current immutable generation.

## Design

### Selection and source validation

The command manifest declares `--workspace` and repeatable `--repository` for
`graph`, `query`, and `context`. The workspace path is explicit and is resolved
from the invoking repository root. Member paths are resolved from the manifest
directory, preserving portable sibling-checkout layouts without turning paths
into identity.

The loader verifies each member's Git ref and builds the same validated
`ladybug-projection/1` source used for a single repository. Warnings are
prefixed with the member ID. Validation finishes for every member and every
explicit endpoint before one projection becomes eligible for retrieval.

### Projection and retrieval

Concepts, tasks, authored edges, source paths, bundle facts, commits, and export
digests are namespaced with the `.3.1` identity functions. Equal source IDs in
different members therefore remain distinct. Concept-to-concept manifest links
enter the structural graph as explicit `link` edges; all manifest link kinds
and concept/task endpoint kinds remain available as exact projected facts.

The workspace source is indexed through the established Ladybug lifecycle with
a contained workspace cache root and full reopen verification. Automatic mode
uses the reference projection on unsupported platforms or after an indexed
failure, before emitting output. Explicit indexed policy fails instead of
silently changing policy. Subset reads are evaluated against the complete
validated projection and filter nodes, edges, links, scope, and provenance to
the requested members.

### Public evidence and compatibility

Every workspace result carries the selected workspace ID, workspace and
snapshot keys, and canonical repository scopes. Every returned concept carries
its member, repository, bundle, nullable commit, export, record, and source-path
provenance. `graph` also exposes exact manifest links. Human output adds a
workspace header; JSON preserves the existing result kind while adding the
workspace fields.

Workspace `graph <id>` and `context <id>` require the unambiguous qualified ID
form. `query` returns qualified IDs directly. Without `--workspace`, all three
commands follow the unchanged M6 single-repository path and output contract.

## Open questions

- Bounded path and impact traversal over the exact workspace link facts remains
  `LCLI-283.3.3` scope.
- Historical snapshot retention, comparison, changed-since, and explicit
  workspace deletion workflows remain `LCLI-283.3.4` scope. This task retains
  only the current verified generation after a successful replacement.
