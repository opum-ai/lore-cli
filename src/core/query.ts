/**
 * query.ts — in-memory navigation over the bundle graph.
 *
 * This is the shared navigation core every read-only "where does this connect"
 * command sits on. Today it hosts one primitive — {@link subgraph}, the
 * depth-bounded neighborhood traversal — which `lore graph` uses to root its
 * export at one concept and `lore context` (LORE-34) reuses to gather a target's
 * neighbors before compacting them to a token budget. The BM25 full-text search
 * behind `lore query` (LORE-33) lands here too, sharing the same `BundleGraph`
 * substrate; keeping both in one module is deliberate — they are the two halves
 * of "navigate the bundle" and a consumer that has the graph already has both.
 *
 * Like the rest of `core/` (design §2.1) this module is pure: it reads an
 * already-loaded {@link BundleGraph} and returns plain data or throws a
 * {@link LoreError}; it never touches the filesystem, prints, or reads flags.
 */

import { type BundleGraph, conceptNotInBundle, type Edge } from "./bundle";

/**
 * Collect the ids of every concept within `maxDepth` link-hops of `rootId`,
 * including the root itself — the concept's *neighborhood*.
 *
 * Traversal is **undirected**: an edge `A → B` makes `A` and `B` mutual
 * neighbors, because orientation is what a reader wants from "show me around this
 * concept" — both what it points at (its `specs`/links) and what points back at
 * it (who supersedes or cites it). Only **resolved** edges connect: a dangling
 * edge (`to: null`, a broken reference) has no target node to step to, so it
 * never extends reach — surfacing the break is `lore check`'s job, and a node's
 * own dangling edges are still reported by the export layer once the node is in.
 *
 * `maxDepth` bounds the radius in hops from the root:
 *
 * - `0` → just the root (no neighbors).
 * - `n` → the root plus everything reachable in ≤ `n` hops.
 * - `Infinity` → the entire connected component the root sits in (how `lore
 *   graph <id>` behaves with no `--depth`).
 *
 * The walk is a breadth-first level expansion over a deduplicated adjacency
 * built from {@link BundleGraph.edges} (itself deterministic), and the returned
 * set iterates in **discovery order** (root first, then each level) — so the
 * same bundle and root always yield the same set in the same order, with no
 * dependence on edge multiplicity or input order. A link cycle (`A→B→A`) or a
 * self-link is harmless: a visited node is never re-enqueued.
 *
 * @throws LoreError `not_found` (exit 3) via {@link conceptNotInBundle} when
 *   `rootId` names no concept in the bundle.
 */
export function subgraph(graph: BundleGraph, rootId: string, maxDepth: number): Set<string> {
  if (!graph.concepts.has(rootId)) {
    throw conceptNotInBundle(rootId);
  }
  // A root-only radius never reads the adjacency, so don't pay to build the whole
  // O(E) index for it.
  if (maxDepth <= 0) {
    return new Set([rootId]);
  }
  const adjacency = adjacencyOf(graph);
  const visited = new Set<string>([rootId]);
  let frontier: string[] = [rootId];
  // Level-by-level BFS: each iteration expands one hop. `maxDepth` is an upper
  // bound on iterations, so `Infinity` simply runs until the frontier drains.
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? EMPTY) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

/** Shared empty neighbor list for nodes with no resolved edges (avoids a per-lookup allocation). */
const EMPTY: readonly string[] = [];

/**
 * The undirected adjacency map of each loaded {@link BundleGraph}, built once per
 * graph and cached. Keyed by the graph object so the entry is dropped when the
 * graph is — a {@link loadBundle} returns a fresh graph each call, so the cache is
 * scoped to that graph's lifetime, never shared across loads or leaked.
 */
const ADJACENCY_CACHE = new WeakMap<BundleGraph, Map<string, Set<string>>>();

/**
 * The undirected adjacency of `graph` ({@link buildAdjacency}), memoized per graph.
 *
 * The walk in {@link subgraph} reads the adjacency, and the bundle's edge list is
 * immutable (a refactor recomputes a fresh graph rather than mutating one), so the
 * adjacency is a pure function of the graph — building it once and caching it on
 * the graph object (mirroring how {@link BundleGraph.tokenEstimate} memoizes its
 * per-concept estimates) means a sequence of traversals over the same graph pays
 * the O(E) build only on the first. This matters for the commands that root a walk
 * at more than one concept (the per-target expansions behind `lore context`/`lore
 * orphans`), which would otherwise rebuild the whole index on each call.
 *
 * Exported so a multi-traversal caller (or a test asserting the cache holds) can
 * reach the same memoized map `subgraph` uses, rather than re-deriving one that
 * would drift from how reachability is computed.
 */
export function adjacencyOf(graph: BundleGraph): Map<string, Set<string>> {
  let adjacency = ADJACENCY_CACHE.get(graph);
  if (adjacency === undefined) {
    adjacency = buildAdjacency(graph.edges);
    ADJACENCY_CACHE.set(graph, adjacency);
  }
  return adjacency;
}

/**
 * Build the undirected adjacency map from the bundle's edge list. Each resolved
 * edge contributes a symmetric neighbor pair; a dangling edge (`to: null`) and a
 * self-link (`from === to`) contribute nothing (the former has no target, the
 * latter no new reach). A {@link Set} per node deduplicates parallel edges (two
 * concepts linked both by body and by a frontmatter ref are one neighbor), and
 * because {@link BundleGraph.edges} is already in deterministic order, insertion
 * order — hence later iteration order — is deterministic too.
 */
function buildAdjacency(edges: readonly Edge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const connect = (a: string, b: string): void => {
    let neighbors = adjacency.get(a);
    if (neighbors === undefined) {
      neighbors = new Set<string>();
      adjacency.set(a, neighbors);
    }
    neighbors.add(b);
  };
  for (const edge of edges) {
    if (edge.to === null || edge.to === edge.from) {
      continue;
    }
    connect(edge.from, edge.to);
    connect(edge.to, edge.from);
  }
  return adjacency;
}
