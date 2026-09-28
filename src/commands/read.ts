/**
 * commands/read.ts — `lore read <id>`: one concept, exactly as authored.
 *
 * The **exact read** half of [LCLI-478]'s bounded-read contract, and deliberately a separate
 * operation rather than a flag on {@link import("./context").runContext}.
 *
 * `lore context` ASSEMBLES, and is lossy by design: it selects a neighborhood, orders it, and since
 * LCLI-478 enforces `--max-tokens` as a hard ceiling — which means it may drop neighbors and, when
 * the budget cannot hold it, the target's own body. That is the right behaviour for a caller
 * feeding a model a budget it must not exceed, and the wrong behaviour for a caller who needs to
 * quote a document. Collapsing the two into one operation with a flag makes the caller who needs
 * fidelity and the caller who needs cheapness share a code path, and one of them loses. So this
 * command has **no budget flag at all**: there is nothing to pass, nothing to forget, and no
 * configuration under which it returns less than the whole concept.
 *
 * It reports no retrieval backend (LCLI-499's `data.backend`), and that absence is deliberate
 * rather than an oversight: an exact read is always a direct filesystem load, so there is no backend
 * choice to report. A field naming a decision that was never made would be noise pretending to be
 * provenance.
 *
 * Validation lives here and the shaping is trivial: a missing or extra positional, or an unknown
 * flag, is a `usage` error (exit 2); an `<id>` absent from the bundle is the `not_found` (exit 3)
 * {@link conceptNotInBundle} raises, so `lore read` and every other id-taking command answer an
 * unknown id with identical wording.
 *
 * **Verbatim for machines and pipes, rendered for a person (LCLI-615).** `--plain` — which is also
 * what any non-TTY stdout resolves to — and `--json` carry the body byte-for-byte, so the exact-read
 * contract above holds wherever a program is reading and `lore read <id> | tail -n +3` still
 * recovers the file's body. Only pretty mode (stdout a terminal, neither flag given) renders the
 * markdown, through {@link renderMarkdownForTerminal}: headings, emphasis, lists, block quotes,
 * fenced code, links and GFM tables, word-wrapped to the terminal's width. There is no flag for
 * this, because `--plain` already is the opt-out. The frontmatter is never rendered, and the
 * one-line `read:` header is the same in every text mode. The renderer strips every terminal control
 * sequence from the body before (and after) parsing, so a document cannot drive the terminal it is
 * read in; with `NO_COLOR` set it emits no ANSI at all and keeps its layout.
 */

import { join } from "node:path";
import { conceptNotInBundle, loadBundle } from "../core/bundle";
import { idFromPath } from "../core/concept";
import { renderMarkdownForTerminal, renderWidth } from "../core/markdown-render";
import { loadProfile } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, singleLine, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";

/** Options for {@link runRead}; `root` and the streams are injectable for tests. */
export interface ReadOptions {
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
}

/** The `read.concept` payload: one concept, verbatim and unbudgeted. */
export interface ReadExport {
  /** The concept id (bundle-root-relative, e.g. `adr/0021-typed-relationships`). */
  readonly id: string;
  /** The concept's bundle-root-relative path, so a caller can cite the file it read. */
  readonly path: string;
  /** The concept's resolved `type`. */
  readonly type: string;
  /** The concept's frontmatter mapping, exactly as parsed — never filtered or reordered. */
  readonly frontmatter: Record<string, unknown>;
  /** The concept's full markdown body, verbatim. Never truncated, under any flag. */
  readonly body: string;
  /**
   * The chars/4 estimate over the concept's serialized bytes — the same figure `lore graph` reports
   * for this node. Reported so a caller can decide what a budgeted operation would do with it; it
   * bounds nothing here.
   */
  readonly tokenEstimate: number;
}

/**
 * Run `lore read`: load the bundle, find the concept, emit it whole, and return `0`.
 *
 * @throws LoreError `usage` (exit 2) for a missing/extra positional; `not_found` (exit 3) when the
 *   id names no concept in the bundle.
 */
export function runRead(options: ReadOptions): number {
  const parsed = parseCommandArgs(options.args, "read");
  if (parsed.positionals.length !== 1) {
    throw usage("read needs exactly one <id>", "run `lore read <id>`");
  }
  const id = idFromPath((parsed.positionals[0] as string).trim());
  if (id === "") {
    throw usage("read needs a concept id", "run `lore read <id>`");
  }
  const advisories = new WarningCollector();
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(join(options.root, DOCS_DIR), { warnings: advisories, profile });
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const concept = graph.concepts.get(id);
  if (concept === undefined) {
    throw conceptNotInBundle(id);
  }
  emit(
    readRenderable(
      {
        id,
        path: concept.path,
        type: concept.type,
        frontmatter: concept.frontmatter,
        body: concept.body,
        tokenEstimate: graph.tokenEstimate(id),
      },
      renderWidth(sinkColumns(options.stdout ?? process.stdout)),
    ),
    options.output,
    options.stdout,
  );
  return EXIT_OK;
}

/**
 * The column count the stream being written to reports, or `undefined` when it reports none.
 *
 * Read from the sink itself rather than from `process.stdout` on the assumption that an absent sink
 * means the real one: cli.ts hands every handler `context.stdout ?? process.stdout`, so on the real
 * path `options.stdout` IS `process.stdout` and is never absent. A pipe or a test capture reports no
 * `columns`, and {@link renderWidth} turns that into its 80-column default.
 */
function sinkColumns(sink: Writer): number | undefined {
  const columns = (sink as { columns?: unknown }).columns;
  return typeof columns === "number" ? columns : undefined;
}

/**
 * Render the concept for a pipe or a person: one header line identifying what was read, a blank
 * line, then the body.
 *
 * In **plain** the body is **verbatim** — no wrapping, no trimming, no truncation footer. The header
 * is one line rather than none so a reader can tell which file the text came from, and exactly one
 * line so `lore read <id> | tail -n +3` recovers the body byte-for-byte. A command whose whole
 * contract is exactness must not make the caller guess how much of its own output is preamble.
 *
 * In **pretty** the same header precedes the body rendered for the terminal at `width` columns
 * (LCLI-615). Pretty is not a parsing target (cli-contract §1.2), which is what makes this allowed.
 */
function readRenderable(data: ReadExport, width: number): Renderable<ReadExport> {
  const header = (value: ReadExport): string =>
    `read: ${singleLine(value.id)}  [${singleLine(value.type)}]  ${singleLine(value.path)}  ~${value.tokenEstimate} tokens (chars/4)`;
  return {
    kind: "read.concept",
    data,
    pretty: (value, { color }) => `${header(value)}\n\n${renderMarkdownForTerminal(value.body, { color, width })}`,
    plain: (value) => `${header(value)}\n\n${value.body}`,
  };
}
