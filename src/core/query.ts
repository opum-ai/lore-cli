/**
 * query.ts — in-memory navigation over the bundle graph.
 *
 * This is the shared navigation core every read-only "where does this connect"
 * command sits on. It hosts two primitives over the same {@link BundleGraph}
 * substrate:
 *
 * - {@link subgraph} — the depth-bounded neighborhood traversal `lore graph` uses
 *   to root its export at one concept and `lore context` (LORE-34) reuses to gather
 *   a target's neighbors before compacting them to a token budget.
 * - {@link query} — the BM25-style in-memory full-text search + frontmatter-field
 *   filters behind `lore query` (LORE-33). No vectors, RAG, or chunking (ADR-0015):
 *   a lightweight lexical index built fresh from the loaded graph each call.
 *
 * Keeping both in one module is deliberate — they are the two halves of "navigate
 * the bundle" (structural reach and lexical relevance), and a consumer that has the
 * graph already has both.
 *
 * Like the rest of `core/` (design §2.1) this module is pure: it reads an
 * already-loaded {@link BundleGraph} and returns plain data or throws a
 * {@link LoreError}; it never touches the filesystem, prints, or reads flags.
 */

import { singleLine } from "../errors";
import { type BundleGraph, conceptNotInBundle, type Edge, frontmatterScalar } from "./bundle";
import type { Concept } from "./concept";
import { compareCodeUnits } from "./order";
import type { WorkspaceRecordProvenance, WorkspaceResultScope } from "./workspace-contract";

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
  const adjacency = graph.neighbors === undefined ? buildAdjacency(graph.edges) : undefined;
  const neighbors = graph.neighbors ?? ((id: string) => adjacency?.get(id) ?? EMPTY);
  const visited = new Set<string>([rootId]);
  let frontier: string[] = [rootId];
  // Level-by-level BFS: each iteration expands one hop. `maxDepth` is an upper
  // bound on iterations, so `Infinity` simply runs until the frontier drains.
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of neighbors(id)) {
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

// ── Full-text query (lore query, LORE-33) ───────────────────────────────────────

/** A `key=value` frontmatter-field filter (`lore query --field <key>=<value>`). */
export interface FieldFilter {
  /** The frontmatter key to test (trimmed; an empty key is rejected at the command boundary). */
  readonly key: string;
  /** The value the field must equal (case-insensitively), or — for a list field — contain. */
  readonly value: string;
}

/** The inputs to a {@link query}: an optional search text plus the frontmatter filters and the result cap. */
export interface QueryOptions {
  /**
   * The free-text search. Trimmed; an empty/whitespace-only or absent value means
   * **no text query** (the result is the filtered set, unranked). A non-empty text
   * also acts as a relevance filter — only concepts containing at least one of its
   * terms are returned.
   */
  readonly text?: string;
  /** `--type`: keep only concepts whose `type` equals this (case-insensitively). */
  readonly type?: string;
  /** `--tag` (repeatable): keep only concepts whose `tags` contain **every** listed tag (case-insensitively). */
  readonly tags?: readonly string[];
  /** `--status`: keep only concepts whose `status` frontmatter equals this (case-insensitively). */
  readonly status?: string;
  /** `--field` (repeatable): keep only concepts matching **every** `key=value` field test. */
  readonly fields?: readonly FieldFilter[];
  /** `--limit`: the maximum number of hits to return. Defaults to {@link DEFAULT_QUERY_LIMIT}. */
  readonly limit?: number;
}

/** One ranked search hit (cli-surface §query `query.results`). */
export interface QueryHit {
  /** The concept id. */
  readonly id: string;
  /** The concept's resolved `type`. */
  readonly type: string;
  /** The concept's `title` frontmatter, when present and a non-empty scalar; omitted otherwise. */
  readonly title?: string;
  /**
   * A one-line snippet: the concept's `summary` frontmatter, falling back to its
   * `title`, collapsed to a single trimmed line. Omitted when the concept carries
   * neither (the id/type are still the structural signal).
   */
  readonly snippet?: string;
  /**
   * The BM25 relevance score (higher is more relevant). `0` for every hit on a
   * **filters-only** query (no text to rank by) — the hits are then ordered by id.
   */
  readonly score: number;
  /** Complete locator-free provenance in explicit workspace mode. */
  readonly provenance?: WorkspaceRecordProvenance;
}

/** The `query.results` payload: the ranked hits (already capped) plus the bounded-output accounting. */
export interface QueryResult {
  /** The normalized text query, when one drove the ranking; omitted on a filters-only query. */
  readonly query?: string;
  /** The hits, capped to `limit`: score-descending then id-ascending under a text query, else id-ascending. */
  readonly hits: readonly QueryHit[];
  /** The total number of concepts that matched (filters ∧ text relevance) before the `limit` cap. */
  readonly total: number;
  /** The number actually returned (`shown <= total`). */
  readonly shown: number;
  /** `true` when the cap dropped matches (`shown < total`) — an honest bounded-output signal, never a silent cut. */
  readonly truncated: boolean;
  /** Explicit selected workspace scope; absent for repository-local output. */
  readonly workspace?: WorkspaceResultScope;
}

/** The default `--limit` when none is given — a bounded result so a broad query never floods stdout (cli-surface §query). */
export const DEFAULT_QUERY_LIMIT = 20;

/** BM25 term-frequency saturation parameter `k1` (the standard 1.5). */
const BM25_K1 = 1.5;
/** BM25 length-normalization parameter `b` (the standard 0.75). */
const BM25_B = 0.75;

/**
 * Search the bundle: keep the concepts matching every frontmatter filter, rank them
 * by BM25 relevance to `options.text` (when given), and return the top `limit` hits
 * with a bounded-output signal.
 *
 * **Filtering** (AC#1) is case-insensitive across `--type`/`--tag`/`--status`/`--field`;
 * a concept must satisfy *all* provided filters. **Ranking**: with a text query, a
 * lexical BM25 index is built fresh from the whole bundle (id, `title`, `summary`,
 * `description`, `tags`, and body tokens) and each filtered concept is scored;
 * concepts containing **no** query term score 0 and are dropped, so the text behaves
 * as a relevance filter as well as a sort key. Ties (and a filters-only query, where
 * every score is 0) break by ascending id, so the order is fully deterministic.
 *
 * **Bounded output** (AC#2): `total` is the full match count and `hits` is its first
 * `limit`, with `truncated` set when the cap dropped matches — the command renders the
 * §3 truncation line with a narrow-it hint. No vectors, RAG, or chunking (ADR-0015):
 * this is a deterministic lexical index, not a semantic one. Pure — reads the graph,
 * returns plain data, never touches the filesystem or flags.
 */
export function query(graph: BundleGraph, options: QueryOptions = {}): QueryResult {
  return queryWithBm25Index(graph, options);
}

/**
 * Search with a caller-supplied deterministic BM25 index.
 *
 * The persistent Ladybug reader uses this boundary after fetching only postings
 * for the requested terms. Reference callers omit `index` and retain the exact
 * in-memory behavior.
 */
export function queryWithBm25Index(graph: BundleGraph, options: QueryOptions = {}, index?: Bm25Index): QueryResult {
  const limit = options.limit ?? DEFAULT_QUERY_LIMIT;
  const normalizedText = (options.text ?? "").trim();
  const queryTerms = [...new Set(tokenizeQueryText(normalizedText))];
  // `hasText` keys off the *tokenized* terms, not the raw string: a non-empty text
  // that yields no searchable term (punctuation/separators only, e.g. `"%%%"`) is
  // treated as a filters-only query rather than a ranked one that would score every
  // concept 0 and silently drop the frontmatter filters passed alongside it.
  const hasText = queryTerms.length > 0;

  // Iterating the id-ordered `concepts` map keeps the filtered list ascending by id,
  // which is already the filters-only order and the tie-break order under ranking.
  const matched: Array<{ concept: Concept; score: number }> = [];
  // IDF is a per-term, per-corpus constant — compute it once here, not once per scored
  // document, so a query over a large filtered set does not recompute the same logs.
  const activeIndex = hasText ? (index ?? buildBm25Index(graph)) : undefined;
  const idf = activeIndex !== undefined ? idfForTerms(activeIndex, queryTerms) : undefined;
  for (const concept of graph.concepts.values()) {
    if (!matchesFilters(concept, options)) {
      continue;
    }
    if (activeIndex === undefined || idf === undefined) {
      matched.push({ concept, score: 0 });
      continue;
    }
    // A text query also filters: a concept with none of its terms scores 0 and is dropped.
    const score = scoreBm25(activeIndex, idf, concept.id, queryTerms);
    if (score > 0) {
      matched.push({ concept, score });
    }
  }

  if (hasText) {
    matched.sort((a, b) => b.score - a.score || compareCodeUnits(a.concept.id, b.concept.id));
  }

  const total = matched.length;
  const shown = Math.min(total, limit);
  const hits = matched.slice(0, shown).map(({ concept, score }) => toHit(concept, score));
  return {
    ...(hasText ? { query: normalizedText } : {}),
    hits,
    total,
    shown,
    truncated: shown < total,
  };
}

/** Shape one matched concept into its {@link QueryHit} (title verbatim; snippet = `summary` → `title` → none). */
function toHit(concept: Concept, score: number): QueryHit {
  const title = frontmatterScalar(concept.frontmatter.title);
  const snippet = oneLine(frontmatterScalar(concept.frontmatter.summary) ?? title);
  return {
    id: concept.id,
    type: concept.type,
    ...(title !== undefined ? { title } : {}),
    ...(snippet !== undefined ? { snippet } : {}),
    score,
  };
}

/**
 * Whether `concept` satisfies every provided filter — the AC#1 type/tag/status/field
 * gate. `--type` compares the resolved `type` mirror; `--status` and each `--tag` are
 * just the general `--field` test against the `status`/`tags` keys (one matcher, so
 * the scalar-vs-list and case rules can never diverge between them and an arbitrary
 * `--field`). All comparisons fold case.
 */
function matchesFilters(concept: Concept, options: QueryOptions): boolean {
  if (options.type !== undefined && !equalsFold(concept.type, options.type)) {
    return false;
  }
  if (options.status !== undefined && !matchesField(concept, { key: "status", value: options.status })) {
    return false;
  }
  if (options.tags !== undefined) {
    for (const want of options.tags) {
      if (!matchesField(concept, { key: "tags", value: want })) {
        return false;
      }
    }
  }
  if (options.fields !== undefined) {
    for (const filter of options.fields) {
      if (!matchesField(concept, filter)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Whether `concept`'s `filter.key` frontmatter matches `filter.value`: a list field
 * matches when **any** element equals the value (case-insensitively), a scalar field
 * when it equals the value.
 *
 * The **key** is resolved case-insensitively too — a `--field Status=…` finds a
 * `status:` key — so the key and the value fold consistently (and consistently with
 * `--type`/`--tag`/`--status`), instead of a verbatim-case key lookup silently
 * missing. Only **own** enumerable keys are scanned (`Object.keys`), so an inherited
 * `constructor`/`toString` can never satisfy a filter. A field with no scalar/list
 * value, or no matching key, never matches.
 *
 * YAML keys are case-sensitive, so a concept can carry more than one case-variant of
 * the same logical key (`Status: draft` alongside `status: done` — both survive
 * frontmatter parsing as distinct own keys). Every such candidate key is checked, not
 * only the first one enumeration happens to reach, so a match under *any*
 * case-variant key succeeds regardless of author insertion order.
 */
function matchesField(concept: Concept, filter: FieldFilter): boolean {
  const keys = Object.keys(concept.frontmatter).filter((candidate) => equalsFold(candidate, filter.key));
  return keys.some((key) => {
    const raw = concept.frontmatter[key];
    if (Array.isArray(raw)) {
      return raw.some((item) => {
        const value = frontmatterScalar(item);
        return value !== undefined && equalsFold(value, filter.value);
      });
    }
    const value = frontmatterScalar(raw);
    return value !== undefined && equalsFold(value, filter.value);
  });
}

/** A concept's `tags` as a list of scalar strings (a bare string tag is treated as a one-element list; anything else is empty). */
function tagsOf(concept: Concept): string[] {
  const raw = concept.frontmatter.tags;
  const items = Array.isArray(raw) ? raw : [raw];
  const tags: string[] = [];
  for (const item of items) {
    const value = frontmatterScalar(item);
    if (value !== undefined) {
      tags.push(value);
    }
  }
  return tags;
}

/** Case-insensitive string equality — the single rule for every `lore query` filter comparison. */
function equalsFold(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Collapse an already-coerced scalar ({@link frontmatterScalar}) to a single trimmed,
 * non-empty line for a hit's snippet, or `undefined` — the same one-line compaction
 * `lore context` applies to a neighbor's summary, so a concept's snippet reads
 * identically from both commands.
 */
function oneLine(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const line = singleLine(value).trim();
  return line === "" ? undefined : line;
}

// ── BM25 lexical index ───────────────────────────────────────────────────────────

/** One document's term frequencies and length (in tokens) within the BM25 index. */
export interface IndexedDoc {
  /** Term → occurrence count in this document. */
  readonly tf: ReadonlyMap<string, number>;
  /** The document's length in tokens (the BM25 length-normalization input). */
  readonly length: number;
}

/** A whole-bundle BM25 index: per-document term frequencies, document frequencies, the doc count, and the average length. */
export interface Bm25Index {
  /** Indexed documents keyed by concept id. */
  readonly docs: ReadonlyMap<string, IndexedDoc>;
  /** Term → number of documents that contain it (for IDF). */
  readonly df: ReadonlyMap<string, number>;
  /** The number of indexed documents (`N`). */
  readonly n: number;
  /** The mean document length in tokens (`avgdl`); `0` only when there are no documents. */
  readonly avgdl: number;
}

/** One arbitrary lexical record for consumers that share Lore's BM25 contract. */
export interface Bm25Record {
  readonly id: string;
  readonly text: string;
}

/** One arbitrary record's deterministic relevance score. */
export interface Bm25RecordScore {
  readonly id: string;
  readonly score: number;
}

/**
 * Tokenize a string into lower-cased lexical terms: maximal runs of Unicode letters
 * or digits, with everything else (punctuation, whitespace, path separators) a
 * boundary. So `stories/bulk-archive` yields `["stories", "bulk", "archive"]`. This
 * is a deterministic lexical split, not a real tokenizer — adequate for the
 * lightweight in-memory search ADR-0015 calls for.
 */
export function tokenizeQueryText(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The searchable text of a concept: its id, the `title`/`summary`/`description`/`tags` scalars, and the body. */
export function searchableConceptText(concept: Concept): string {
  return searchableConceptFields(concept).join(" ");
}

/** Searchable fields kept separate so persistent builders do not copy a large body merely to add separators. */
export function searchableConceptFields(concept: Concept): readonly string[] {
  const fm = concept.frontmatter;
  return [
    concept.id,
    frontmatterScalar(fm.title) ?? "",
    frontmatterScalar(fm.summary) ?? "",
    frontmatterScalar(fm.description) ?? "",
    tagsOf(concept).join(" "),
    concept.body,
  ];
}

/**
 * Build the BM25 index over **every** concept in the bundle (so IDF reflects true
 * corpus rarity regardless of which filters a query applies). Each concept's
 * {@link searchableText} is tokenized once into its term frequencies; document
 * frequencies and the average document length accumulate across the pass.
 */
export function buildBm25Index(graph: BundleGraph): Bm25Index {
  return buildBm25RecordIndex(
    [...graph.concepts.values()].map((concept) => ({ id: concept.id, text: searchableConceptText(concept) })),
  );
}

/**
 * Build the same deterministic BM25 index over caller-owned records. This is the
 * reusable lexical seam profile section ranking needs; `lore query` delegates to
 * it, so the two consumers cannot drift in tokenization, IDF, or saturation.
 */
export function buildBm25RecordIndex(records: readonly Bm25Record[]): Bm25Index {
  const docs = new Map<string, IndexedDoc>();
  const df = new Map<string, number>();
  let totalLength = 0;
  for (const record of records) {
    if (docs.has(record.id)) {
      throw new Error(`duplicate BM25 record id: ${record.id}`);
    }
    const tokens = tokenizeQueryText(record.text);
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    for (const term of tf.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
    docs.set(record.id, { tf, length: tokens.length });
    totalLength += tokens.length;
  }
  const n = docs.size;
  return { docs, df, n, avgdl: n === 0 ? 0 : totalLength / n };
}

/**
 * Score arbitrary records against task text. Input order is retained in the
 * returned array; callers apply their own stable domain tie-breaks. Punctuation-
 * only tasks and all-zero corpora return zero scores so declaration-order
 * fallback remains explicit at the caller.
 */
export function scoreBm25Records(records: readonly Bm25Record[], text: string): readonly Bm25RecordScore[] {
  const terms = [...new Set(tokenizeQueryText(text.trim()))];
  if (terms.length === 0) return records.map((record) => ({ id: record.id, score: 0 }));
  const index = buildBm25RecordIndex(records);
  const idf = idfForTerms(index, terms);
  return records.map((record) => ({ id: record.id, score: scoreBm25(index, idf, record.id, terms) }));
}

/**
 * The inverse-document-frequency of each query term — computed once per query, since
 * IDF depends only on the corpus, not the document being scored. The always-non-negative
 * variant `ln(1 + (N − n + 0.5)/(n + 0.5))`, so a term in most documents can never push
 * a score negative.
 */
function idfForTerms(index: Bm25Index, terms: readonly string[]): ReadonlyMap<string, number> {
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = index.df.get(term) ?? 0;
    idf.set(term, Math.log(1 + (index.n - df + 0.5) / (df + 0.5)));
  }
  return idf;
}

/**
 * The BM25 relevance of document `id` to `terms` — the sum over the query terms the
 * document contains of `IDF(term) · saturated-tf`, using the precomputed {@link idfForTerms}.
 * `avgdl` is safely positive wherever it is read: a term with a non-zero frequency means
 * the document has tokens, which means the corpus does too.
 *
 * `id` is always an indexed document — the index is built from the same bundle
 * {@link query} iterates, so every concept it scores has an entry (asserting that
 * keeps the scorer straight-line, with no dead "missing doc" branch). Likewise every
 * scored term has an `idf` entry (both come from the same query-term list).
 */
function scoreBm25(index: Bm25Index, idf: ReadonlyMap<string, number>, id: string, terms: readonly string[]): number {
  const doc = index.docs.get(id) as IndexedDoc;
  let score = 0;
  for (const term of terms) {
    const freq = doc.tf.get(term);
    if (freq === undefined) {
      continue;
    }
    const denominator = freq + BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / index.avgdl);
    score += ((idf.get(term) as number) * (freq * (BM25_K1 + 1))) / denominator;
  }
  return score;
}
