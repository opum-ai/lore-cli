/**
 * context.ts — assemble a concept and its neighborhood into a token-budgeted
 * **context pack** for an agent (cli-surface §context, LORE-34).
 *
 * `lore context <id>` answers "give me this concept plus enough of what surrounds
 * it to reason about it, within a token budget." This module is the pure shaping
 * layer behind it: it takes an already-loaded {@link BundleGraph}, gathers the
 * target's neighborhood via the shared {@link subgraph} traversal `lore graph`
 * also uses, and produces a {@link ContextExport} — the target concept's **full
 * body** plus a **one-line `summary` compaction** of each neighbor — trimmed to a
 * `--max-tokens` budget.
 *
 * It is deliberately **structural, not ranked** (design §2.1, ADR-0015): there are
 * no relevance heuristics here. Neighbors are taken in the traversal's
 * **nearest-first** discovery order (depth-1 before depth-2, deterministic within
 * a level), and the budget fill keeps a prefix of that order — "the closest
 * neighbors that fit." Scoring/relevance is `lore query`'s job (BM25); this command
 * is the predictable, reproducible expansion an agent can rely on.
 *
 * ## Token model (all figures are the chars/4 heuristic, never a real tokenizer)
 *
 * `graph.tokenEstimate(id)` is the chars/4 estimate over a concept's full
 * serialized bytes. The two roles in a pack are charged differently *because they
 * are emitted differently*:
 *
 * - The **target** is emitted in full, so it is charged
 *   {@link BundleGraph.tokenEstimate}`(root)` — the whole-concept estimate, which is
 *   the *same* `~tokens` `lore graph` reports for that concept (cross-command
 *   consistency, and a reuse of the one memoized estimator).
 * - A **neighbor** is compacted to a single `summary` line, so it is charged only
 *   the chars/4 of *that line* ({@link summaryTokens}); charging the whole concept
 *   would defeat the compaction the command exists to perform.
 *
 * The export's `tokenEstimate` is the target's estimate plus every **included**
 * neighbor's — the size of the pack actually emitted. Neighbors are added in
 * nearest-first order while the running total stays within `--max-tokens`; the fill
 * **stops at the first neighbor that would exceed the budget** (a predictable
 * nearest-first prefix, not a greedy "skip the big one and keep filling"), and any
 * remaining neighbors are dropped with `truncated` set. The **target is always
 * present** — a context without its subject is meaningless — so a `--max-tokens`
 * smaller than the target still returns the target with zero neighbors.
 *
 * Like the rest of `core/` (design §2.1) this module is pure: it reads the graph
 * and returns plain data or throws a {@link LoreError}; it never touches the
 * filesystem, prints, or reads flags.
 */

import { singleLine } from "../errors";
import type { BundleGraph } from "./bundle";
import type { Concept } from "./concept";
import { subgraph } from "./query";

/** The target concept at the center of a {@link ContextExport} — emitted in full. */
export interface ContextTarget {
  /** The concept id (bundle-root-relative, e.g. `stories/bulk-archive`). */
  readonly id: string;
  /** The concept's resolved `type` (mirrors `frontmatter.type`). */
  readonly type: string;
  /** The concept's `title` frontmatter, when present and a non-empty scalar; omitted otherwise. */
  readonly title?: string;
  /** The concept's full markdown body (verbatim, the pack's primary content). */
  readonly body: string;
  /** The chars/4 estimate over the target's full serialized bytes (== `lore graph`'s node estimate). */
  readonly tokenEstimate: number;
}

/** One neighbor in a {@link ContextExport} — compacted to its one-line `summary`. */
export interface ContextNeighbor {
  /** The neighbor concept id. */
  readonly id: string;
  /** The neighbor's resolved `type`. */
  readonly type: string;
  /** The neighbor's `title` frontmatter, when present and a non-empty scalar; omitted otherwise. */
  readonly title?: string;
  /**
   * The neighbor's one-line compaction: its `summary` frontmatter, else its `title`,
   * collapsed to a single line. Omitted when the concept carries neither — the
   * neighbor still appears (its id/type are the structural signal), it just has no
   * sentence to show.
   */
  readonly summary?: string;
  /** The chars/4 estimate of the emitted `summary` line (`0` when there is none) — what this neighbor costs the budget. */
  readonly tokenEstimate: number;
}

/** The `context.export` payload: the target's full body, the neighbor compaction, and the budget accounting. */
export interface ContextExport {
  /** The target concept id the pack is centered on. */
  readonly root: string;
  /** The neighbor radius used (hops from the target; `0` = target only). */
  readonly depth: number;
  /** The token budget when one was given (`--max-tokens`); omitted when the pack was bounded only by `--depth`. */
  readonly maxTokens?: number;
  /** The target concept, emitted in full. */
  readonly target: ContextTarget;
  /** The included neighbors, in nearest-first order. */
  readonly neighbors: readonly ContextNeighbor[];
  /** The pack's chars/4 token estimate: the target's estimate plus every included neighbor's. */
  readonly tokenEstimate: number;
  /** The total number of neighbors within `--depth` before any budget trim. */
  readonly total: number;
  /** The number of neighbors actually included (`shown <= total`). */
  readonly shown: number;
  /** `true` when the budget dropped one or more neighbors (`shown < total`). */
  readonly truncated: boolean;
}

/** Options for {@link buildContext}. */
export interface BuildContextOptions {
  /** The neighbor radius in hops from the target. Defaults to `1`. */
  readonly depth?: number;
  /**
   * The token budget for the whole pack. When omitted, no neighbor is dropped for
   * size — the pack is bounded only by `depth`.
   */
  readonly maxTokens?: number;
}

/** The default neighbor radius when `--depth` is not given (cli-surface §context). */
export const DEFAULT_DEPTH = 1;

/**
 * Build a {@link ContextExport} for `root`: the target concept's full body plus a
 * one-line compaction of its neighbors out to `depth` hops, trimmed to `maxTokens`.
 *
 * The neighborhood comes from the shared {@link subgraph} traversal (undirected,
 * cycle-tolerant, depth-bounded) — the same one `lore graph` roots its export at —
 * so the two commands agree on what "around this concept" means. The traversal's
 * discovery order is **nearest-first**; the target is dropped from it (it is the
 * subject, carried separately) and the remaining neighbors are taken in that order.
 *
 * Budgeting and the token model are documented in the module header. The **target
 * is always included**; only neighbors are trimmed, and the fill stops at the first
 * neighbor that would push the running total past `maxTokens`.
 *
 * @throws LoreError `not_found` (exit 3) via {@link subgraph} when `root` names no
 *   concept in the bundle.
 */
export function buildContext(graph: BundleGraph, root: string, options: BuildContextOptions = {}): ContextExport {
  const depth = options.depth ?? DEFAULT_DEPTH;
  const { maxTokens } = options;

  // subgraph throws not_found for an unknown root, so this is also the id guard.
  const reached = subgraph(graph, root, depth);
  const targetConcept = conceptAt(graph, root);
  const target: ContextTarget = {
    id: root,
    type: targetConcept.type,
    ...titleField(targetConcept.frontmatter.title),
    body: targetConcept.body,
    tokenEstimate: graph.tokenEstimate(root),
  };

  // Nearest-first neighbors: subgraph's iteration is root-first then by level, so
  // dropping the root leaves depth-1 before depth-2 — exactly the order the budget
  // should fill (keep the closest).
  const candidates: ContextNeighbor[] = [];
  for (const id of reached) {
    if (id === root) {
      continue;
    }
    const concept = conceptAt(graph, id);
    const summary = neighborSummary(concept.frontmatter.summary, concept.frontmatter.title);
    candidates.push({
      id,
      type: concept.type,
      ...titleField(concept.frontmatter.title),
      ...(summary !== undefined ? { summary } : {}),
      tokenEstimate: summaryTokens(summary),
    });
  }

  // Greedy nearest-first fill: include each neighbor while it still fits, and stop at
  // the first that would exceed the budget so the kept set is a predictable prefix of
  // the nearest-first order. An omitted budget keeps every neighbor.
  const neighbors: ContextNeighbor[] = [];
  let tokenEstimate = target.tokenEstimate;
  for (const neighbor of candidates) {
    if (maxTokens !== undefined && tokenEstimate + neighbor.tokenEstimate > maxTokens) {
      break;
    }
    neighbors.push(neighbor);
    tokenEstimate += neighbor.tokenEstimate;
  }

  return {
    root,
    depth,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    target,
    neighbors,
    tokenEstimate,
    total: candidates.length,
    shown: neighbors.length,
    truncated: neighbors.length < candidates.length,
  };
}

/**
 * The concept at `id`, which the caller already knows is in the bundle — every id
 * {@link subgraph} returns names a real concept (the root is checked, and every
 * other reached id came from an {@link Edge} whose endpoints are bundle concepts).
 * Asserting that here keeps the build straight-line, with no dead "missing concept"
 * branch the traversal contract makes unreachable.
 */
function conceptAt(graph: BundleGraph, id: string): Concept {
  return graph.concepts.get(id) as Concept;
}

/**
 * The one-line compaction for a neighbor: its `summary` frontmatter when present,
 * else its `title`, collapsed to a single line ({@link singleLine}, so a multi-line
 * YAML scalar cannot smuggle extra lines into the pack), or `undefined` when the
 * concept carries neither. A YAML-coerced number/boolean is stringified rather than
 * dropped — mirroring how `core/graph.ts` treats such scalars — so a stray
 * `summary: 2024` still shows.
 */
function neighborSummary(summary: unknown, title: unknown): string | undefined {
  return scalarLine(summary) ?? scalarLine(title);
}

/**
 * A scalar frontmatter value as a single trimmed, non-empty line, or `undefined`.
 * A string is collapsed and trimmed; a number/boolean is stringified (YAML coercion
 * on an unknown type, e.g. an unquoted `summary: 2024`); anything else — `null`, a
 * list, an object — has no one-line form.
 */
function scalarLine(value: unknown): string | undefined {
  if (typeof value === "string") {
    const line = singleLine(value).trim();
    return line === "" ? undefined : line;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/** A `title` frontmatter value as a `{ title }` field to spread, or `{}` when it has no one-line form. */
function titleField(value: unknown): { title?: string } {
  const title = scalarLine(value);
  return title !== undefined ? { title } : {};
}

/** The chars/4 token estimate of an emitted summary line (`0` when there is none). */
function summaryTokens(summary: string | undefined): number {
  return summary === undefined ? 0 : Math.ceil(summary.length / 4);
}
