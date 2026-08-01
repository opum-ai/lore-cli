---
type: Spec
title: Graph explorer data and interaction contract
tags:
  - graph-explorer
  - local-graph
  - contract
  - accessibility
summary: Freezes the deterministic read-only explorer snapshot, provenance, graph-health, bounded rendering, refresh, and accessible interaction contracts.
timestamp: 2026-08-01T18:07:50.530Z
---

# Graph explorer data and interaction contract

## Summary

The local graph explorer consumes one deterministic, versioned, read-only
snapshot derived from validated `lore export` schema `1.0`. The snapshot keeps
repository, concept, task, authored-edge, provenance, and graph-health facts
portable and independent of LadybugDB. A separately versioned browser-local
presentation record owns filters, selection, layout coordinates, and viewport
state; deleting it never changes source facts or snapshot identity.

This contract freezes the boundary consumed by `LCLI-283.2.2` and verified by
`LCLI-283.2.3`. It does not select a rendering library, implement the explorer,
or add a network service.

## Requirements

- The public snapshot schema is `lore-explorer-snapshot/1`. Static artifacts
  contain its canonical UTF-8 JSON plus a trailing newline.
- The snapshot exposes repositories, concepts, tasks, and one fact for every
  authored edge. It preserves duplicate records, dangling targets, authored
  `supersedes`/`superseded_by` edges, summaries, task and concept status, bundle
  identity, nullable commit, export digest, stable record keys, and
  repository-relative source paths when the frozen projection supplies one.
- All arrays use UTF-16 code-unit ordering. Authored edges order by source
  record key, edge kind, authored target, ordinal, then edge record key.
  Regenerating an unchanged snapshot produces byte-identical output.
- Static export and optional refresh use the same schema and canonical bytes.
  No payload or request accepts a database path, database credentials,
  LadybugDB identifier, query language, or raw Cypher.
- The initial view renders at most 750 nodes and 1,500 edges. Interactive focus
  may expand to at most 5,000 visible nodes, 10,000 visible edges, and depth 4.
  Larger results remain searchable and inspectable through deterministic
  filtering/focus windows; the browser must not silently drop source facts.
- Source facts never contain layout coordinates, viewport state, expanded
  groups, filters, selection, or renderer-specific identifiers. Those values
  belong only to `lore-explorer-presentation/1` and may be discarded or
  recomputed at any time.

## Design

### Snapshot envelope

`src/core/explorer-contract.ts` is the executable schema of record. Its strict
top-level fields are:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Exactly `lore-explorer-snapshot/1`; unknown versions fail loud. |
| `source` | Repository scope, snapshot, bundle, nullable commit, export digest, docs root, source fingerprint, and `generatedAt: null`. The null timestamp keeps static bytes independent of wall-clock time. |
| `facts.repositories` | The explicit repository scope and human display label. M6 contains one; M8 may add a new version for workspaces rather than reinterpret this schema. |
| `facts.concepts` | Stable record/concept identities, type, title, summary, status, tags, content hash, token estimate, source path, and full provenance. Document bodies are not duplicated into the explorer artifact. |
| `facts.tasks` | Stable record/task identities, title, nullable summary, status, labels, priority, assignees, milestone, parent id, nullable source path, and full provenance. A missing task path remains null rather than being invented. |
| `facts.authoredEdges` | One fact per export edge with stable record key, source/target keys, authored kind and target, ordinal, dangling flag, source path, and full provenance. |
| `health` | Stable state, message code, bounded warnings, and exact repository/concept/task/edge/dangling/duplicate counts. |

The parser rejects unknown fields, mixed snapshot provenance, duplicate record
keys, non-canonical order, missing resolved targets, inconsistent dangling
flags, and health counts that differ from the facts. Duplicate authored edges
remain separate records: an edge is counted as a duplicate when a prior edge
has the same source key, kind, and authored target. Supersession is displayed
only from authored `supersedes` or `superseded_by` facts; the explorer never
infers a reciprocal or transitive edge.

### Static export and optional refresh

The required deliverable is a directory of static local files. Opening it
performs zero network requests. The snapshot is serialized once with
`serializeExplorerSnapshot`; scripts and styles carry no repository data,
credential, absolute path, or database handle.

A future optional refresh process may bind only to `127.0.0.1` and `::1`, serve
the artifact from an unguessable per-process path, enforce its own same-origin
requests, and expose one read operation returning the same canonical snapshot
bytes. It never accepts Cypher, SQL, an arbitrary query string, a database path,
or a write. It must not embed Ladybug credentials or a reusable secret in the
artifact. Closing the process removes the refresh capability; the static files
continue to work with their last complete snapshot.

### Graph health

The explorer renders one of four mutually exclusive states before enabling
graph navigation:

| State | Required facts and behavior |
| --- | --- |
| `ready` | Counts match a complete validated snapshot. Show non-blocking warnings and enable navigation. |
| `empty` | Every fact count is zero. Show setup guidance and no decorative empty graph. |
| `stale` | Retain the last complete facts, require a stable message code, label the commit/export shown, and offer only the bounded refresh action when available. |
| `corrupt` | Require a stable message code, disable navigation over untrusted facts, and direct the user to rebuild from source. Never offer in-browser repair or deletion. |

Warnings are stable, unique, sorted strings capped at 64 entries and 1,024
characters each. Detailed native diagnostics stay outside the artifact.

### Interaction requirements

The implementation and browser-hardening tasks must turn each identifier below
into an automated test. The identifier and expected result are stable even if
the renderer changes.

- `KBD-01`: Tab reaches skip link, search, filter groups, graph/list mode,
  selected record, detail close, and refresh in DOM order. Arrow keys move
  within a graph/list composite; Enter selects; Escape returns focus to the
  invoking record. No operation requires a pointer.
- `SR-01`: The graph has an accessible name and an equivalent virtualized list.
  Selection announces record kind, title/id, relationship counts, graph-health
  flags, and position in the filtered set through a polite live region. Detail
  headings and provenance use semantic lists/tables, not canvas-only text.
- `COLOR-01`: Node kind, status, dangling, duplicate, and supersession states
  each have a text, icon, shape, or line-style cue in addition to color; normal
  text and interactive controls meet WCAG 2.2 AA contrast.
- `RESPONSIVE-01`: At 320 CSS px wide and 200% zoom, search, filters, the
  equivalent list, details, provenance, and health actions remain usable with
  no two-dimensional page scroll. The graph may become a secondary panel.
- `MOTION-01`: Reduced-motion preference removes animated layout and zoom.
  Focus and selection never depend on animation completion.
- `EMPTY-01`: An `empty` snapshot focuses a named status heading, reports zero
  concepts/tasks/edges, and provides deterministic source/build guidance.
- `CORRUPT-01`: A `corrupt` snapshot exposes its stable message code, hides
  untrusted navigation, and offers rebuild guidance without destructive action.
- `STALE-01`: A `stale` snapshot persistently labels the displayed commit and
  export digest; refresh success replaces the snapshot atomically, while
  failure preserves the last complete view and announces the error.
- `SCALE-01`: Above the initial bounds, the UI announces total versus visible
  counts, starts in list/summary mode, and requires an explicit filter or focus
  expansion. It never mounts more than 5,000 nodes or 10,000 edges, and depth
  controls never exceed 4.

Search matches visible title, summary, id, type, status, labels/tags, and source
path. Filters cover repository, record kind/type, task/concept status, authored
edge kind, dangling, duplicate, and supersession. Details show every visible
source fact plus inbound/outbound authored edges and provenance. Focusing a
record supports deterministic inbound, outbound, or both-direction expansion
within the depth and visibility bounds.

### Disposable presentation state

`lore-explorer-presentation/1` contains only the snapshot key, search and
filters, selected/focused record, bounded depth, layout algorithm version,
coordinates, and viewport. It is browser-local, excluded from snapshot hashes
and static export determinism, and invalid when its snapshot key no longer
matches. The implementation may retain it for convenience, but deleting it
must reconstruct a usable default view solely from the snapshot.

## Open questions

- Rendering library, worker strategy, and static packaging form remain choices
  for `LCLI-283.2.2`, subject to these payload and rendering bounds.
- Browser compatibility, measured large-graph budgets, screen-reader matrix,
  and offline package reproducibility remain qualification work for
  `LCLI-283.2.3`; that task may tighten a limit only through an explicitly
  versioned contract change.
