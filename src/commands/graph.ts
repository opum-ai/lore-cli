/**
 * commands/graph.ts — `lore graph [<id>] [--dot] [--depth <n>]`.
 *
 * The thin, read-only layer that emits the bundle's cross-link graph (cli-surface
 * §graph; LORE-31). Commander supplies a verified indexed {@link BundleGraph}
 * with automatic reference fallback; direct core callers retain the reference
 * loader. The selected graph is then shaped as follows:
 *
 * - with **no `<id>`** exports the whole bundle;
 * - with an `<id>` exports the **subgraph** rooted there, bounded to `--depth`
 *   hops ({@link subgraph}; unbounded when `--depth` is omitted).
 *
 * Output follows the uniform CLI modes: a human node/edge listing at a TTY (or
 * piped plain), and the `{schemaVersion, kind: "graph.export", data}` envelope
 * under the global `--json` — there is no command-specific JSON flag, so machine
 * consumers use the same `--json` they use everywhere. `--dot` is the one
 * representation override: it emits Graphviz DOT instead of the listing, so `lore
 * graph --dot | dot -Tpng` works (a piped stdout auto-selects plain). `--dot` and
 * `--json` are mutually exclusive — DOT has no envelope form.
 *
 * The positional `<id>` is normalized through {@link idFromPath} exactly as `lore
 * rename`/`supersede` normalize theirs, so a path-form, `./`-prefixed, or
 * `.md`-suffixed id resolves to the same bundle key (consistent id acceptance
 * across the id-taking commands).
 *
 * Validation lives here (the byte/shape computation stays pure in `core/graph.ts`
 * and `core/query.ts`): an unknown flag, a repeated/value-less or value-bearing
 * `--dot`, a repeated/value-less/non-integer/too-large `--depth`, a `--depth`
 * without a root `<id>`, `--dot` together with `--json`, or a stray second
 * positional is a `usage` error (exit 2); a root `<id>` absent from the bundle
 * surfaces as the `not_found` error (exit 3) {@link subgraph} throws.
 */

import { join } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { loadBundle } from "../core/bundle";
import { idFromPath } from "../core/concept";
import { buildGraphExport, type GraphExport, toDot } from "../core/graph";
import { loadProfile } from "../core/profile";
import { subgraph } from "../core/query";
import type { RetrievalGraphLoader } from "../core/retrieval";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, singleLine, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertFlagAtMostOnce, parseCommandArgs, singleOptionValue } from "./args";

/** Options for {@link runGraph}; `root` and the streams are injectable for tests. */
export interface GraphOptions {
  /** The repo root the `docs/` bundle resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional + flag tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for advisory warnings; defaults to `process.stderr`. */
  stderr?: Writer;
  /** Backlog snapshot seam used only by indexed projection freshness/builds. */
  adapter?: BacklogAdapter;
  /** Indexed/reference selector injected by the Commander handler or conformance tests. */
  retrieval?: RetrievalGraphLoader;
}

/** The parsed form of `lore graph`'s arguments. */
interface GraphArgs {
  /** The root concept id (positional, already {@link idFromPath}-normalized); `undefined` exports the whole bundle. */
  id?: string;
  /** Emit Graphviz DOT instead of the node/edge listing (`--dot`). */
  dot: boolean;
  /** The hop radius (`--depth`); `undefined` means unbounded. Requires `id`. */
  depth?: number;
}

/**
 * Run `lore graph`: parse the arguments, load the bundle, narrow to the rooted
 * subgraph when an `<id>` is given, shape the export, emit the `graph.export`,
 * and return `0`. A bad flag/positional (including `--dot` with `--json`) throws
 * a `usage` {@link LoreError} (exit `2`); an `<id>` not in the bundle a
 * `not_found` one (exit `3`).
 */
export function runGraph(options: GraphOptions): number | Promise<number> {
  const parsed = parseGraphArgs(options.args);
  if (parsed.dot && options.output.mode === "json") {
    throw usage("--dot cannot be combined with --json", "DOT has no JSON envelope; pass one of --dot or --json");
  }
  const advisories = new WarningCollector();
  if (options.retrieval !== undefined) {
    return options
      .retrieval({ root: options.root, warnings: advisories, adapter: options.adapter })
      .then(async (loaded) => {
        try {
          return finishGraph(options, parsed, loaded.graph, advisories);
        } finally {
          await loaded.dispose?.();
        }
      });
  }
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(join(options.root, DOCS_DIR), { warnings: advisories, profile });
  return finishGraph(options, parsed, graph, advisories);
}

function finishGraph(
  options: GraphOptions,
  parsed: GraphArgs,
  graph: ReturnType<typeof loadBundle>,
  advisories: WarningCollector,
): number {
  // Flush load warnings before the subgraph lookup, which throws not_found for an
  // unknown root — otherwise an advisory that explains *why* a file is not a
  // concept would be discarded on exactly the path that most needs it.
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  let data: GraphExport;
  if (parsed.id === undefined) {
    data = buildGraphExport(graph);
  } else {
    const include = subgraph(graph, parsed.id, parsed.depth ?? Number.POSITIVE_INFINITY);
    data = buildGraphExport(graph, { include, root: parsed.id, depth: parsed.depth });
  }

  emit(graphRenderable(data, parsed.dot), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `graph`'s tokens into the optional root `<id>` positional, the boolean
 * `--dot`, and the value flag `--depth <n>` (also accepting `--depth=<n>`). The
 * Commander has already resolved Lore's global flags, so a `--`-prefixed token here
 * is a command flag: an unrecognized one is a `usage` error, as is a repeated or
 * value-bearing `--dot`, a repeated/value-less/non-integer/too-large `--depth`, a
 * `--depth` with no root, or a second positional. A `--` ends option parsing. The
 * `<id>` is {@link idFromPath}-normalized so path/`.md`/`./` forms resolve.
 */
function parseGraphArgs(args: readonly string[]): GraphArgs {
  const parsed = parseCommandArgs(args, "graph");
  const positionals = parsed.positionals;
  assertFlagAtMostOnce(parsed, "dot");
  const rawDepth = singleOptionValue(parsed, "depth");
  if (rawDepth === "") throw usage("--depth needs a value", "pass a value, e.g. `--depth 2`");
  const depth = rawDepth === undefined ? undefined : parseDepth(rawDepth);
  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore graph [<id>] [--dot] [--depth <n>]`");
  }
  const raw = positionals[0];
  if (depth !== undefined && raw === undefined) {
    throw usage(
      "--depth needs a root <id>",
      "give the concept to bound the radius from, e.g. `lore graph <id> --depth 2`",
    );
  }
  return { id: raw !== undefined ? idFromPath(raw) : undefined, dot: parsed.flags.has("dot"), depth };
}

/** Parse a `--depth` value as a non-negative, safe integer (`0` = root only). */
function parseDepth(value: string): number {
  // Accept only a bare run of digits — Number() would coerce "1.5"/"0x2"/" 2 "/"1e3".
  if (!/^\d+$/.test(value)) {
    throw usage(
      `invalid --depth "${value}"`,
      "pass a non-negative integer, e.g. `--depth 2`; --depth needs a value before a separate flag-looking token",
    );
  }
  const depth = Number.parseInt(value, 10);
  // A >2^53 run of digits parses without error but loses precision, so the echoed
  // `depth` would differ from what the user typed; reject it rather than lie.
  if (!Number.isSafeInteger(depth)) {
    throw usage(`--depth "${value}" is too large`, "pass a smaller non-negative integer");
  }
  return depth;
}

/**
 * Read a value flag's argument: its inline `--flag=value` form when present, else
 * the **next** token. A missing/empty value — or a next token that is itself an
 * option (`--depth --dot`) — is a `usage` error rather than a silently swallowed
 * flag (mirroring `lore schema`'s value-flag guard).
 */
// ── Output ─────────────────────────────────────────────────────────────────────

/**
 * The per-result rendering bundle for `graph` (output.ts dispatches on the mode).
 * `--json` always carries the structured {@link GraphExport}; the pretty/plain
 * text is the DOT serialization under `--dot`, else a human node/edge listing.
 * The two text modes render identically (the data is structural — no severities
 * to color), so pretty and plain share one renderer.
 */
function graphRenderable(data: GraphExport, dot: boolean): Renderable<GraphExport> {
  const render = dot ? toDot : renderText;
  return { kind: "graph.export", data, pretty: render, plain: render };
}

/**
 * A human/pipe-stable listing: a `<n> concepts, <m> edges, ~<t> tokens` header
 * (annotating the scope when it is a subgraph), one `<id>  [type]  ~<tok>` line
 * per node, then one `<from> -<kind>-> <to>` line per edge (`(dangling: <target>)`
 * for a broken reference). ANSI-free and deterministic.
 *
 * `node.id`/`node.type`/`node.title`/edge endpoints all come from bundle-controlled
 * frontmatter (an edge's `from`/`to` are concept ids; `target` is the reference
 * as parsed, which for a dangling `specs`/frontmatter edge can carry whatever a
 * YAML scalar allows — including an embedded newline; `node.type` mirrors
 * `frontmatter.type`, and `requireType` (schema.ts) only trims the *ends* of the
 * value while unknown types are warn-only, so an interior newline in `type:`
 * survives bundle load unchanged), so each is run through {@link singleLine}
 * before it lands in a line — the same guard every other bundle-text renderer
 * applies (managed-block.ts, indexes.ts, context.ts, query.ts, log.ts) — so an
 * embedded newline/control character cannot split one node or edge into extra
 * physical lines. `data.root` is included for the same reason: though only
 * reachable via a concept id that itself embeds a newline, guarding it keeps
 * the header consistent with every id printed below it.
 */
function renderText(data: GraphExport): string {
  const root = data.root !== undefined ? singleLine(data.root) : undefined;
  const scope =
    root !== undefined ? ` rooted at ${root}${data.depth !== undefined ? ` (depth ${data.depth})` : ""}` : "";
  const lines = [
    `${data.nodes.length} ${plural(data.nodes.length, "concept")}, ${data.edges.length} ${plural(data.edges.length, "edge")}, ~${data.tokenEstimate} tokens (chars/4)${scope}`,
  ];
  for (const node of data.nodes) {
    const title = node.title !== undefined ? `  ${singleLine(node.title)}` : "";
    lines.push(`  ${singleLine(node.id)}  [${singleLine(node.type)}]  ~${node.tokenEstimate}${title}`);
  }
  for (const edge of data.edges) {
    const dest = edge.to !== null ? singleLine(edge.to) : `(dangling: ${singleLine(edge.target)})`;
    lines.push(`  ${singleLine(edge.from)} -${edge.kind}-> ${dest}`);
  }
  return lines.join("\n");
}

/** Pluralize a noun by count (`1 concept` / `2 concepts`). */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
