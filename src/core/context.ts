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
 * Every figure is {@link estimateTokens} — the project's shared chars/4 rule. The
 * two roles in a pack are charged over the bytes each actually contributes:
 *
 * - The **target** is emitted in full, so it is charged
 *   {@link BundleGraph.tokenEstimate}`(root)` — the whole-concept estimate, which is
 *   the *same* `~tokens` `lore graph` reports for that concept (cross-command
 *   consistency, and a reuse of the one memoized estimator).
 * - A **neighbor** is compacted to a one-line entry, so it is charged the chars/4 of
 *   that entry's content — its `id`, `type`, `title` (when present), and `summary`
 *   (when present) — not the whole concept (which would defeat the compaction) and
 *   not the summary alone (which would under-count the always-present id/type, or a
 *   long `title` sitting behind a short/absent `summary`, letting a wide
 *   neighborhood overrun the budget).
 *
 * The export's `tokenEstimate` is the target's estimate plus every **included**
 * neighbor's — the size of the pack actually emitted. Neighbors are added in
 * nearest-first order while the running total stays within `--max-tokens`; the fill
 * **stops at the first neighbor that would exceed the budget** (a predictable
 * nearest-first prefix, not a greedy "skip the big one and keep filling"), and any
 * remaining neighbors are dropped with `truncated` set. The **target is always
 * present** — a context without its subject is meaningless — so a `--max-tokens`
 * smaller than the target still returns the target with zero neighbors; that pack is
 * **over budget**, and `truncated` is set in that case too (so a `truncated: false`
 * is an honest "everything fit", never a silent overrun the target alone caused).
 *
 * Like the rest of `core/` (design §2.1) this module is pure: it reads the graph
 * and returns plain data or throws a {@link LoreError}; it never touches the
 * filesystem, prints, or reads flags.
 */

import { LoreError, singleLine } from "../errors";
import { type BundleGraph, estimateTokens, frontmatterScalar } from "./bundle";
import type { Concept } from "./concept";
import { subgraph } from "./query";
import type { WorkspaceRecordProvenance, WorkspaceResultScope } from "./workspace-contract";

/** The target concept at the center of a {@link ContextExport} — emitted in full. */
export interface ContextTarget {
  /** The concept id (bundle-root-relative, e.g. `stories/bulk-archive`). */
  readonly id: string;
  /** The concept's resolved `type` (mirrors `frontmatter.type`). */
  readonly type: string;
  /** The concept's `title` frontmatter, when present and a non-empty scalar; omitted otherwise. */
  readonly title?: string;
  /**
   * The concept's full markdown body (verbatim, the pack's primary content).
   *
   * **Omitted** when `maxTokens` is supplied and cannot hold it (LCLI-478). It is the one field a
   * budget may drop, and dropping it is never silent: `omitted.fields` names it, and the pack is
   * `truncated`. An exact, unbudgeted read of the same concept is `lore read` — a different
   * operation on purpose, because a caller who needs fidelity and a caller who needs cheapness must
   * not share a code path.
   */
  readonly body?: string;
  /**
   * What the target costs the budget: the chars/4 estimate over its full serialized bytes (==
   * `lore graph`'s node estimate) when {@link body} is present, and the chars/4 of its emitted
   * identity (`id` + `type` + `title`) when the budget dropped the body — charged the same way a
   * neighbor entry is, because that is what the pack then carries.
   */
  readonly tokenEstimate: number;
  /** Complete locator-free provenance in explicit workspace mode. */
  readonly provenance?: WorkspaceRecordProvenance;
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
  /**
   * The chars/4 estimate of the emitted entry — `id` + `type` + `title` (when
   * present) + `summary` (when present) — what this neighbor costs the budget.
   * `title` and `summary` are charged independently even when `summary` is the
   * `title` fallback (the neighbor object emits both fields under `--json`), so a
   * long `title` behind a short/absent `summary` is never undercounted.
   */
  readonly tokenEstimate: number;
  /** Complete locator-free provenance in explicit workspace mode. */
  readonly provenance?: WorkspaceRecordProvenance;
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
  /**
   * `true` when the pack does not fully fit the budget: either the budget dropped
   * one or more neighbors (`shown < total`), or the always-present target alone
   * pushes `tokenEstimate` past `--max-tokens` (an over-budget pack with no neighbor
   * to drop). `false` is therefore an honest "the whole neighborhood is here and
   * within budget", never a silent overrun.
   */
  readonly truncated: boolean;
  /**
   * What the budget dropped, present whenever `maxTokens` was supplied — **including when nothing
   * was dropped**, in which case both arrays are empty (LCLI-478).
   *
   * The zero case is the load-bearing half. If this appeared only when something was omitted, its
   * ABSENCE would be ambiguous between "nothing was omitted" and "a version of lore that does not
   * report omission", and a consumer would have to diff against a full fetch to tell — which is the
   * defect a bounded read exists to remove, one layer down. It costs two empty arrays.
   *
   * Omitted entirely when no budget was supplied, because no projection was active: absent then
   * means "nothing could have been dropped", which is a different and unambiguous statement.
   */
  readonly omitted?: ContextOmission;
  /** Explicit selected workspace scope; absent for repository-local output. */
  readonly workspace?: WorkspaceResultScope;
}

/** What a `maxTokens` budget dropped from a {@link ContextExport}. */
export interface ContextOmission {
  /**
   * The ids of the neighbors the budget dropped, in the nearest-first order they would have been
   * included in. Ids rather than a bare count, so a consumer can fetch exactly what it is missing —
   * `shown`/`total` already carry the count.
   */
  readonly records: readonly string[];
  /**
   * The field paths the budget dropped from the pack, currently only `"target.body"`. A field path
   * rather than a boolean, so a later field that becomes droppable needs no new shape.
   */
  readonly fields: readonly string[];
}

/** Options for {@link buildContext}. */
export interface BuildContextOptions {
  /** The neighbor radius in hops from the target. Defaults to `1`. */
  readonly depth?: number;
  /**
   * The token budget for the whole pack, **enforced as a hard ceiling** when supplied: the returned
   * pack's `tokenEstimate` never exceeds it (LCLI-478). When omitted, nothing is dropped for size —
   * the pack is bounded only by `depth`, which is LCLI-203's documented "no cap" behaviour and is
   * unchanged.
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
  const title = titleField(targetConcept.frontmatter.title);
  const identity: ContextTarget = {
    id: root,
    type: targetConcept.type,
    ...title,
    tokenEstimate: estimateTokens(`${root} ${targetConcept.type}${title.title === undefined ? "" : ` ${title.title}`}`),
  };
  const withBody: ContextTarget = { ...identity, body: targetConcept.body, tokenEstimate: graph.tokenEstimate(root) };

  // The irreducible floor. A pack whose subject cannot even be NAMED within the budget is not a
  // smaller pack, it is a different thing -- so this refuses rather than returning something the
  // caller cannot use. The shape matches `lore agent context`'s own mandatory-evidence refusal
  // (exit 6, required-versus-budget in the message, the caller's options in the hint), because a
  // second spelling for the same situation is how two commands come to disagree about it.
  if (maxTokens !== undefined && identity.tokenEstimate > maxTokens) {
    throw new LoreError(
      "validation",
      `context for "${root}" needs ~${identity.tokenEstimate} tokens to name its target, above budget ${maxTokens}`,
      "raise --max-tokens, or use `lore read` for an exact unbudgeted read of one concept",
      { id: root, maxTokens, requiredTokens: identity.tokenEstimate },
    );
  }

  // The body is the pack's primary content, so it is charged before any neighbor and dropped only
  // when the whole target does not fit. Dropping it is what makes the budget a CEILING rather than
  // a suggestion: before LCLI-478 an oversized target was emitted in full and merely flagged
  // `truncated`, which is a caller asking for a guarantee and receiving a label.
  const bodyFits = maxTokens === undefined || withBody.tokenEstimate <= maxTokens;
  const target = bodyFits ? withBody : identity;

  // Every reached id but the root is a neighbor (subgraph yields only real concepts),
  // so the candidate count is known without materializing the dropped ones.
  const total = reached.size - 1;
  // Single nearest-first fill: subgraph iterates root-first then by level, so dropping
  // the root visits depth-1 before depth-2 — exactly the order the budget should keep.
  // Include each neighbor while it still fits and STOP at the first that would exceed
  // the budget (a predictable prefix), so a dropped neighbor's summary is never even
  // computed. An omitted budget keeps every neighbor.
  const neighbors: ContextNeighbor[] = [];
  const dropped: string[] = [];
  let tokenEstimate = target.tokenEstimate;
  let filling = true;
  for (const id of reached) {
    if (id === root) {
      continue;
    }
    if (!filling) {
      // Past the cut: the id is recorded so the caller knows exactly what it is missing, but the
      // concept is never shaped -- naming a dropped neighbor must not cost what including it would.
      dropped.push(id);
      continue;
    }
    const neighbor = neighborOf(conceptAt(graph, id), id);
    if (maxTokens !== undefined && tokenEstimate + neighbor.tokenEstimate > maxTokens) {
      filling = false;
      dropped.push(id);
      continue;
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
    total,
    shown: neighbors.length,
    truncated: neighbors.length < total || !bodyFits,
    ...(maxTokens === undefined ? {} : { omitted: { records: dropped, fields: bodyFits ? [] : ["target.body"] } }),
  };
}

/**
 * Shape one neighbor concept into its compacted {@link ContextNeighbor}: its `type`,
 * optional `title`, the one-line summary (its `summary`, falling back to its
 * `title`), and the chars/4 cost of the emitted entry (`id` + `type` + `title` +
 * `summary`). The `title` scalar is coerced once and reused for both the `title`
 * field and the summary fallback; it is charged in the cost even when `summary`
 * duplicates it via that fallback, so a long `title` behind a short/absent
 * `summary` is never undercounted.
 */
function neighborOf(concept: Concept, id: string): ContextNeighbor {
  const title = frontmatterScalar(concept.frontmatter.title);
  const summary = oneLine(frontmatterScalar(concept.frontmatter.summary) ?? title);
  const titlePart = title !== undefined ? ` ${title}` : "";
  const summaryPart = summary !== undefined ? ` ${summary}` : "";
  return {
    id,
    type: concept.type,
    ...(title !== undefined ? { title } : {}),
    ...(summary !== undefined ? { summary } : {}),
    tokenEstimate: estimateTokens(`${id} ${concept.type}${titlePart}${summaryPart}`),
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
 * A `title` frontmatter value as a `{ title }` field to spread, or `{}` when it has
 * no display form. Uses the shared {@link frontmatterScalar} so the `title` a target
 * or neighbor reports is **byte-identical** to what `lore graph` reports for the same
 * concept (verbatim string, finite number/boolean coerced, else absent).
 */
function titleField(value: unknown): { title?: string } {
  const title = frontmatterScalar(value);
  return title !== undefined ? { title } : {};
}

/**
 * Collapse an already-coerced scalar ({@link frontmatterScalar}) to a single trimmed,
 * non-empty line for the neighbor compaction, or `undefined`. Unlike the `title`
 * field — which is kept verbatim to match `lore graph` — the summary is a one-line
 * display, so {@link singleLine} + trim ensures a multi-line YAML scalar cannot
 * smuggle extra lines into the pack.
 */
function oneLine(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const line = singleLine(value).trim();
  return line === "" ? undefined : line;
}
