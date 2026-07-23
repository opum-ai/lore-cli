/**
 * graph.ts — shape the bundle graph into an exportable model (and DOT text).
 *
 * `lore graph` surfaces the cross-link graph for orientation: concepts as nodes,
 * OKF cross-links and frontmatter refs as edges, each carrying a chars/4 token
 * estimate (cli-surface §graph). This module is the pure shaping layer between
 * the in-memory {@link BundleGraph} and what the command emits — it turns the
 * graph (optionally narrowed to a {@link subgraph} id-set) into the serializable
 * {@link GraphExport} the `--json` envelope carries, and renders that same model
 * as Graphviz {@link toDot} text. It reads the graph and returns data; the
 * command owns I/O and flag parsing (design §2.1).
 *
 * The token estimates are the bundle's own {@link BundleGraph.tokenEstimate}
 * (memoized, chars/4 over canonical serialized bytes — *not* a real tokenizer);
 * this layer only sums and presents them. The total is summed over the
 * **included** nodes, so a subgraph reports the budget of exactly what it shows.
 */

import { type BundleGraph, type EdgeKind, frontmatterScalar } from "./bundle";
import { compareCodeUnits } from "./order";

/** One concept in the exported graph. */
export interface GraphNode {
  /** The concept id (bundle-root-relative, e.g. `adr/0010-x`). */
  readonly id: string;
  /** The concept's resolved `type` (mirrors `frontmatter.type`). */
  readonly type: string;
  /**
   * The concept's optional `title` frontmatter, via {@link frontmatterScalar}: a
   * finite number or boolean value is coerced to its string form, and the field
   * is omitted only for a missing/empty/whitespace/non-scalar value.
   */
  readonly title?: string;
  /** This concept's chars/4 token estimate over its canonical serialized bytes. */
  readonly tokenEstimate: number;
}

/** One directed reference in the exported graph (mirrors a {@link Edge}, with `dangling` made explicit). */
export interface GraphEdge {
  /** The source concept id. */
  readonly from: string;
  /** The resolved target concept id, or `null` when the reference dangles. */
  readonly to: string | null;
  /** Which kind of reference produced this edge (`link`/`specs`/`supersedes`/`superseded_by`). */
  readonly kind: EdgeKind;
  /** The reference as parsed (link destination / frontmatter value), for diagnostics. */
  readonly target: string;
  /** `true` when the reference resolves to no concept in the bundle (`to === null`). */
  readonly dangling: boolean;
}

/** The `graph.export` payload: the nodes, the edges among them, and the token budget. */
export interface GraphExport {
  /** The root concept id when the export is a subgraph; omitted for a whole-bundle export. */
  readonly root?: string;
  /** The hop radius when the subgraph was bounded by `--depth`; omitted when unbounded or whole-bundle. */
  readonly depth?: number;
  /** Every included concept, in ascending id order. */
  readonly nodes: readonly GraphNode[];
  /** Every reference whose source is included and whose target is included or dangling, in graph order. */
  readonly edges: readonly GraphEdge[];
  /** The summed chars/4 token estimate over the included nodes (labeled a heuristic, not a tokenizer). */
  readonly tokenEstimate: number;
}

/** Options for {@link buildGraphExport}. */
export interface GraphExportOptions {
  /**
   * The concept ids to include — typically a {@link subgraph} result. When omitted,
   * the whole bundle is exported. Ids not present in the bundle are ignored.
   */
  readonly include?: ReadonlySet<string>;
  /** The root concept id, recorded on the result when this is a subgraph export. */
  readonly root?: string;
  /** The hop radius, recorded on the result when the subgraph was bounded. */
  readonly depth?: number;
}

/**
 * Shape a {@link BundleGraph} into a {@link GraphExport}, optionally narrowed to
 * an `include` id-set (a {@link subgraph}).
 *
 * Nodes are the bundle's concepts (in their already-sorted id order) filtered to
 * the included set, each annotated with its `type`, optional `title`, and token
 * estimate. Edges are the **closure** of the included set: an edge is kept when
 * its `from` is included **and** its `to` is included *or* dangling — so a
 * subgraph keeps its internal links and its members' broken links, but drops
 * edges that lead to concepts outside the requested radius (a bounded `--depth`
 * is an explicit cut, not a leak). For a whole-bundle export every edge
 * qualifies. The token total is summed over exactly the included nodes, so it
 * equals the whole-bundle estimate for a full export and the subgraph's budget
 * otherwise.
 */
export function buildGraphExport(graph: BundleGraph, options: GraphExportOptions = {}): GraphExport {
  const { include, root, depth } = options;
  // Drive node iteration by the *smaller* of the two: the whole concept map for a
  // full export (already ascending-id order), or just the included ids — sorted to
  // preserve that order — for a subgraph, so a bounded `--depth` query costs
  // O(N_sub log N_sub), not O(N_total).
  const ids = include === undefined ? graph.concepts.keys() : [...include].sort(compareCodeUnits);
  const nodes: GraphNode[] = [];
  let tokenEstimate = 0;
  for (const id of ids) {
    const concept = graph.concepts.get(id);
    if (concept === undefined) {
      continue; // an include id that names no concept — ignored, never an error
    }
    const tokens = graph.tokenEstimate(id);
    tokenEstimate += tokens;
    const title = frontmatterScalar(concept.frontmatter.title);
    nodes.push({
      id,
      type: concept.type,
      ...(title !== undefined ? { title } : {}),
      tokenEstimate: tokens,
    });
  }

  // Edge closure: for a full export every edge qualifies (per the Edge contract
  // `from` is always a concept and `to` is null-or-concept), so no membership
  // filtering is needed; for a subgraph, keep an edge whose `from` is included and
  // whose `to` is included or dangling — the `include` set already equals the node
  // id-set, so no second set is built.
  const edges: GraphEdge[] = [];
  for (const edge of graph.edges) {
    if (include !== undefined && (!include.has(edge.from) || (edge.to !== null && !include.has(edge.to)))) {
      continue; // leads outside the requested subgraph — an explicit radius cut
    }
    edges.push({ from: edge.from, to: edge.to, kind: edge.kind, target: edge.target, dangling: edge.to === null });
  }

  return {
    ...(root !== undefined ? { root } : {}),
    ...(depth !== undefined ? { depth } : {}),
    nodes,
    edges,
    tokenEstimate,
  };
}

/**
 * Render a {@link GraphExport} as Graphviz DOT — a `digraph` with one statement
 * per node (labeled with its title or id) and one per **resolved** edge (labeled
 * with its kind). Dangling edges are omitted: they have no target node to draw
 * to, and the `--json` model already carries them for tooling that needs the
 * broken-link signal (`lore check` is the dedicated reporter). Output is
 * deterministic — nodes in the export's id order, edges in graph order — so
 * `lore graph --dot | dot -Tpng` is stable across runs.
 */
export function toDot(data: GraphExport): string {
  const lines = ["digraph lore {"];
  for (const node of data.nodes) {
    lines.push(`  ${quote(node.id)} [label=${quote(node.title ?? node.id)}];`);
  }
  for (const edge of data.edges) {
    if (edge.to === null) {
      continue; // no target node to draw to
    }
    lines.push(`  ${quote(edge.from)} -> ${quote(edge.to)} [label=${quote(edge.kind)}];`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Quote a string as a DOT double-quoted ID (an escString, per the Graphviz
 * language spec). Graphviz's lexer (`lib/cgraph/scan.l`) recognizes exactly
 * two escapes inside a quoted string — `\"` for a literal quote and `\\` for
 * a literal backslash — and otherwise **drops** a backslash that precedes
 * any other character (so an *unescaped* `\` is not safe passthrough; it is
 * silently eaten, or worse, combines with the following character). A literal
 * backslash therefore must be doubled to `\\` so it survives the round trip,
 * and that doubling must happen **first**, before any escape sequence this
 * function injects (`\"`, `\n`) — otherwise the backslash the doubling itself
 * introduces would be doubled again. A raw line break cannot survive inside a
 * quoted ID without splitting `toDot()`'s one-statement-per-line output
 * across two physical lines, so an embedded newline (`value` is
 * bundle-controlled — a concept id or frontmatter scalar, either of which can
 * carry one) is rewritten to the two-character escape `\n` — the same escape
 * Graphviz itself uses to force a line break inside a label.
 */
function quote(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/"/g, '\\"')}"`;
}
