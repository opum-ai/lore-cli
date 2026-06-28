/**
 * commands/graph.ts — `lore graph [<id>] [--format dot|json] [--depth <n>]`.
 *
 * The thin, read-only layer that emits the bundle's cross-link graph (cli-surface
 * §graph; LORE-31). It loads the `docs/` bundle into a {@link BundleGraph}, then:
 *
 * - with **no `<id>`** exports the whole bundle;
 * - with an `<id>` exports the **subgraph** rooted there, bounded to `--depth`
 *   hops ({@link subgraph}; unbounded when `--depth` is omitted).
 *
 * The structured model (nodes, edges, per-node + total token estimates) is the
 * `--json` envelope's `data` — `--json` is *the* machine format, so it is always
 * the structured model regardless of `--format`. `--format` selects the
 * **pretty/plain** rendering: `json` (default) prints a human node/edge listing,
 * `dot` prints Graphviz DOT. Because a piped/redirected stdout auto-selects plain
 * (cli-contract §1.1), `lore graph --format dot | dot -Tpng` just works.
 *
 * Validation lives here (the byte/shape computation stays pure in `core/graph.ts`
 * and `core/query.ts`): an unknown flag, a repeated or value-less `--format`/
 * `--depth`, a `--format` that is not `dot`/`json`, a non-integer/negative
 * `--depth`, a `--depth` without a root `<id>`, or a stray second positional is a
 * `usage` error (exit 2); a root `<id>` absent from the bundle surfaces as the
 * `not_found` error (exit 3) {@link subgraph} throws.
 */

import { join } from "node:path";
import { type BundleGraph, loadBundle } from "../core/bundle";
import { buildGraphExport, type GraphExport, toDot } from "../core/graph";
import { subgraph } from "../core/query";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";

/** Options for {@link runGraph}; `root` and the streams are injectable for tests. */
export interface GraphOptions {
  /** The repo root the `docs/` bundle resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `graph`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for advisory warnings; defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The pretty/plain rendering format `--format` selects (the `--json` envelope is always structured). */
type GraphFormat = "json" | "dot";

/** The parsed form of `lore graph`'s arguments. */
interface GraphArgs {
  /** The root concept id (positional); `undefined` exports the whole bundle. */
  id?: string;
  /** The text-rendering format (`--format`); defaults to `json`. */
  format: GraphFormat;
  /** The hop radius (`--depth`); `undefined` means unbounded. Requires `id`. */
  depth?: number;
}

/**
 * Run `lore graph`: parse the arguments, load the bundle, narrow to the rooted
 * subgraph when an `<id>` is given, shape the export, emit the `graph.export`,
 * and return `0`. A bad flag/positional throws a `usage` {@link LoreError} (exit
 * `2`); an `<id>` not in the bundle a `not_found` one (exit `3`).
 */
export function runGraph(options: GraphOptions): number {
  const parsed = parseGraphArgs(options.args);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph: BundleGraph = loadBundle(docsRoot, { warnings: advisories });

  let data: GraphExport;
  if (parsed.id === undefined) {
    data = buildGraphExport(graph);
  } else {
    const include = subgraph(graph, parsed.id, parsed.depth ?? Number.POSITIVE_INFINITY);
    data = buildGraphExport(graph, { include, root: parsed.id, depth: parsed.depth });
  }

  advisories.flush({ color: options.output.color, stderr: options.stderr });
  emit(graphRenderable(data, parsed.format), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `graph`'s tokens into the optional root `<id>` positional and the value
 * flags `--format <dot|json>` / `--depth <n>` (both also accept the
 * `--flag=value` form). The router has already stripped lore's global flags, so a
 * `--`-prefixed token here is a command flag: an unrecognized one is a `usage`
 * error, as is a repeated or value-less flag, a `--format` outside `{dot,json}`,
 * a non-integer/negative `--depth`, a `--depth` with no root, or a second
 * positional. A `--` ends option parsing.
 */
function parseGraphArgs(args: readonly string[]): GraphArgs {
  const positionals: string[] = [];
  let format: GraphFormat | undefined;
  let depth: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const inline = eq === -1 ? undefined : body.slice(eq + 1);
      if (name === "format") {
        if (format !== undefined) {
          throw usage("--format given more than once", "pass --format at most once");
        }
        format = parseFormat(readValue("--format", inline, args, i));
        if (inline === undefined) {
          i++;
        }
      } else if (name === "depth") {
        if (depth !== undefined) {
          throw usage("--depth given more than once", "pass --depth at most once");
        }
        depth = parseDepth(readValue("--depth", inline, args, i));
        if (inline === undefined) {
          i++;
        }
      } else {
        throw usage(`unknown option "--${name}"`, "run `lore graph --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore graph --help` to list options");
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore graph [<id>] [--format dot|json] [--depth <n>]`");
  }
  const id = positionals[0];
  if (depth !== undefined && id === undefined) {
    throw usage(
      "--depth needs a root <id>",
      "give the concept to bound the radius from, e.g. `lore graph <id> --depth 2`",
    );
  }
  return { id, format: format ?? "json", depth };
}

/** Validate a `--format` value, the only legal values being `dot` and `json`. */
function parseFormat(value: string): GraphFormat {
  if (value === "dot" || value === "json") {
    return value;
  }
  throw usage(`unknown --format "${value}"`, "use --format dot or --format json");
}

/** Parse a `--depth` value as a non-negative integer (`0` = root only). */
function parseDepth(value: string): number {
  // Accept only a bare run of digits — Number() would coerce "1.5"/"0x2"/" 2 "/"1e3".
  if (!/^\d+$/.test(value)) {
    throw usage(`invalid --depth "${value}"`, "pass a non-negative integer, e.g. `--depth 2`");
  }
  return Number.parseInt(value, 10);
}

/**
 * Read a value flag's argument: its inline `--flag=value` form when present, else
 * the **next** token. A missing/empty value — or a next token that is itself an
 * option (`--format --depth`) — is a `usage` error rather than a silently
 * swallowed flag (mirroring `lore schema`'s value-flag guard).
 */
function readValue(flag: string, inline: string | undefined, args: readonly string[], i: number): string {
  if (inline !== undefined) {
    if (inline === "") {
      throw missingValue(flag);
    }
    return inline;
  }
  const next = args[i + 1];
  if (next === undefined || next === "" || (next.startsWith("-") && next !== "-")) {
    throw missingValue(flag);
  }
  return next;
}

/** The `usage` error a value-less value flag raises, with a flag-appropriate example. */
function missingValue(flag: string): LoreError {
  return usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} ${flag === "--depth" ? "2" : "dot"}\``);
}

// ── Output ─────────────────────────────────────────────────────────────────────

/**
 * The per-result rendering bundle for `graph` (output.ts dispatches on the mode).
 * `--json` always carries the structured {@link GraphExport}; the pretty/plain
 * text is the DOT serialization under `--format dot`, else a human node/edge
 * listing. The two text modes render identically (the data is structural — no
 * severities to color), so pretty and plain share one renderer.
 */
function graphRenderable(data: GraphExport, format: GraphFormat): Renderable<GraphExport> {
  const render = format === "dot" ? toDot : renderText;
  return { kind: "graph.export", data, pretty: render, plain: render };
}

/**
 * A human/pipe-stable listing: a `<n> concepts, <m> edges, ~<t> tokens` header
 * (annotating the scope when it is a subgraph), one `<id>  [type]  ~<tok>` line
 * per node, then one `<from> -<kind>-> <to>` line per edge (`(dangling: <target>)`
 * for a broken reference). ANSI-free and deterministic.
 */
function renderText(data: GraphExport): string {
  const scope =
    data.root !== undefined ? ` rooted at ${data.root}${data.depth !== undefined ? ` (depth ${data.depth})` : ""}` : "";
  const lines = [
    `${data.nodes.length} ${plural(data.nodes.length, "concept")}, ${data.edges.length} ${plural(data.edges.length, "edge")}, ~${data.tokenEstimate} tokens (chars/4)${scope}`,
  ];
  for (const node of data.nodes) {
    const title = node.title !== undefined ? `  ${node.title}` : "";
    lines.push(`  ${node.id}  [${node.type}]  ~${node.tokenEstimate}${title}`);
  }
  for (const edge of data.edges) {
    const dest = edge.to !== null ? edge.to : `(dangling: ${edge.target})`;
    lines.push(`  ${edge.from} -${edge.kind}-> ${dest}`);
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
