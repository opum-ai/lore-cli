---
type: Spec
title: Local workspace identity contract
tags:
  - workspace
  - identity
  - local-graph
  - provenance
  - contract
summary: Freezes explicit local workspace membership, namespaced cross-repository identities, deterministic lifecycle transitions, and disposable projection boundaries.
timestamp: 2026-08-02T06:45:27.142Z
---

# Local workspace identity contract

## Summary

`LCLI-283.3.1` freezes the control-plane and identity boundary that M8 must
use before it composes more than one repository export. A workspace exists
only because a user selects one manifest and names every member. Lore never
discovers all repositories on a machine, derives membership from nearby
directories or remotes, or places unrelated repositories into a user-global
graph.

The manifest is portable when its locators are portable, but locators are not
identity. Stable workspace and member IDs namespace the unchanged M6 source
facts, so duplicate names, clones, and overlapping worktrees cannot collide.
Every database remains a disposable local projection of the explicit manifest
and validated deterministic exports.

## Requirements

- The control-plane schema is `lore-workspace-manifest/1`. It contains one
  explicit workspace ID, a non-empty canonical member list, and an explicit
  canonical cross-repository link list. No wildcard, directory scan, remote
  organization, machine inventory, or database connection field is accepted.
- Each member has a stable user-named `memberId`, an inspectable local locator,
  an optional display label, and an optional expected Git ref. Relative
  locators make a manifest portable with its checkout layout; absolute
  locators are allowed only as local control-plane data.
- Locator and display-name changes do not change durable identity. Changing a
  member ID is an explicit remove/add. Replacing the repository behind an
  existing member is detected from its M6 repository scope and bundle facts.
- Existing authored links resolve only inside their source member. Lore never
  infers a cross-repository edge because names, IDs, paths, remotes, or bundle
  titles happen to match. A cross-repository relationship names both member
  endpoints explicitly in the manifest.
- Workspace projection output preserves the original repository scope, bundle,
  nullable commit, export digest, source record key, and repository-relative
  path. It adds namespaced keys; it never reinterprets or replaces M6
  `repositoryScopeKey` or source record keys.
- Repository locators, absolute paths, expected refs, credentials, LadybugDB
  paths, physical table names, and query language never enter projection
  metadata or public evidence.
- Add, remove, branch change, missing repository, repository rename,
  repository replacement, conflicting link, stale snapshot, and unchanged
  states have one deterministic disposition. A rejected or rebuilding
  candidate never partially replaces the last verified projection.

## Design

### Explicit manifest

`src/core/workspace-contract.ts` is the executable schema of record. Members
are unique and sorted by `memberId`; explicit links are unique and sorted by
`linkId`, and both endpoints must name selected members. Objects are strict and
canonical serialization sorts object keys, so unchanged manifests produce
byte-identical UTF-8 JSON with a trailing newline.

The manifest locator answers only “where should Lore read this member now?”
It may be relative to a caller-selected manifest location or an absolute local
path. It is retained for diagnostics in the control plane but excluded from
every key and from `lore-workspace-identity/1`. Moving `../lore-api` to
`../renamed-api` while preserving `memberId` and source facts is therefore a
`renamed-repository` transition and reuses the verified identity.

The manifest does not itself authorize filesystem writes or Git operations.
Future CLI work must require an explicit manifest path or workspace selector;
there is no default that scans a parent directory, user home, worktree registry,
remote host, or every `.git` directory.

### Namespaced identity

All hashes use SHA-256, an explicit versioned domain separator, NUL-delimited
inputs, and canonical member order. The identity chain is:

| Identity | Inputs | Purpose |
| --- | --- | --- |
| Workspace key | explicit `workspaceId` | Portable identity for one declared workspace. |
| Member key | workspace key + `memberId` | Stable selection identity independent of locator and display name. |
| Repository key | workspace key + member key + original M6 repository scope | Separates duplicate repositories and overlapping worktrees without reinterpreting the source scope. |
| Bundle key | repository key + original bundle ID | Namespaces equal bundle IDs selected under different members. |
| Commit key | repository key + nullable source commit | Namespaces equal commits while preserving null for uncommitted exports. |
| Export key | repository key + original export digest | Namespaces equal export bytes without replacing their source digest. |
| Record key | repository key + record kind + original record key | Separates concept, task, and authored-edge identities across every member. |
| Source key | repository key + repository-relative source path | Preserves path provenance without exposing an absolute locator. |
| Workspace link key | workspace key + explicit manifest link ID | Namespaces manifest-authored cross-repository relationships and retains their exact endpoints as source facts. |
| Workspace snapshot key | workspace key + every ordered member repository, bundle, commit, export, and explicit-link fact | Changes whenever selected source evidence or links change, never when only a locator/display label changes. |

The `lore-workspace-conformance/1` fixture deliberately selects two overlapping
worktrees with the same display name, M6 repository scope, bundle ID, record
key, and source path. Their member, repository, bundle, commit, export, record,
and source keys remain different. The original source facts remain present for
audit and reconstruction.

### Link resolution and conflicts

Repository-local export edges remain repository-local even if another member
contains the same target ID. Cross-repository links are separate manifest facts
with a stable link ID, authored kind, and exact `{memberId, kind, id}` endpoints.
Missing members, duplicate link IDs, and duplicate endpoint facts fail loud.
Matching names or paths never repair a missing endpoint.

If a candidate has a `conflicting-link`, Lore rejects the whole candidate and
may continue serving the last verified projection as stale. It never chooses a
destination by member order and never publishes a partial relationship set.
Later indexing and traversal tasks must carry the explicit link fact and both
namespaced endpoint identities as provenance.

### Deterministic transitions

Transition precedence is executable and intentionally resolves simultaneous
changes in this order: conflicting link, removal, missing repository, add,
repository replacement, branch/commit change, export change, locator rename,
then unchanged.

| State | Candidate disposition | Required behavior |
| --- | --- | --- |
| `add` | rebuild | Add only the explicitly named member after its export validates; existing identities do not change. |
| `remove` | rebuild | Publish a complete projection without the member, then remove its prior projected evidence. |
| `branch-change` | rebuild | Preserve member/repository identity, record the new commit/export provenance, and publish one complete snapshot. |
| `missing-repository` | reject-candidate | Publish nothing partial; retain the last verified projection as stale when one exists. |
| `renamed-repository` | reuse | Update only the control-plane locator when all source facts still match. |
| `repository-replaced` | rebuild | Treat changed M6 repository scope or bundle as replacement evidence; remove the prior member evidence only after complete publication. |
| `conflicting-link` | reject-candidate | Fail loud and retain the last verified projection; never infer or choose a target. |
| `stale-snapshot` | rebuild | A changed export digest under the same member/repository/commit requires a new complete snapshot. |
| `unchanged` | reuse | Reuse only after all selected members and source facts match exactly. |

### Projection lifecycle, privacy, and deletion

Workspace databases live only below
`.lore/cache/workspaces/1/<workspaceKey>/`. The manifest and validated exports
remain authoritative; the database is rebuild-only derived state. A candidate
is built in isolation and becomes current only after complete validation, so a
crash, missing member, conflict, or stale read cannot create a mixed snapshot.

Deletion accepts one resolved workspace projection root, proves containment and
rejects symlinks before removing anything. Removing a member rebuilds and then
deletes that member’s old projected evidence. Removing a workspace deletes its
one contained cache; it does not inspect or delete source repositories,
manifests, other workspace caches, the M6 repository cache, or a user-global
database. Retention and historical comparison remain explicit future
`LCLI-283.3.4` policy rather than an implicit side effect of indexing.

Projection metadata and public results contain member IDs and namespaced/source
provenance, not locators, absolute paths, expected branch names, remote URLs,
credentials, hostnames, database paths, raw Cypher, or physical LadybugDB
identifiers. Diagnostics redact control-plane locators unless a local explicit
inspection command requests them.

## Open questions

- `LCLI-283.3.2` implements explicit `--workspace <manifest>` selection for
  `graph`, `query`, and `context`, with repeatable `--repository <member-id>`
  subsets and no manifest discovery. Its first current-only projection and
  public provenance contract are specified in
  [Workspace indexing and retrieval](workspace-indexing-and-retrieval.md).
- `LCLI-283.3.3` will define bounded traversal over these namespaced facts. It
  cannot infer cross-repository links or expose arbitrary Cypher.
- `LCLI-283.3.4` will set bounded snapshot retention defaults and comparison
  behavior. Until then, only the current verified workspace projection is
  required and deletion remains explicit.
