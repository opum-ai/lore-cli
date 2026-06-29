/**
 * commands/query.ts — `lore query ["<text>"] [--type <T>] [--tag <t>]… [--status <S>] [--field k=v]… [--limit <n>]`.
 *
 * The thin, read-only layer behind the bundle's full-text search (cli-surface §query;
 * LORE-33). It loads the `docs/` bundle into a {@link BundleGraph}, then hands the
 * optional search text and the frontmatter filters to the pure {@link query} engine —
 * which keeps the concepts matching every filter, ranks them by BM25 relevance to the
 * text (when given), and returns the top `--limit` hits with a bounded-output signal.
 * **No vectors, RAG, or chunking** (ADR-0015): a deterministic in-memory lexical index.
 *
 * Output follows the uniform CLI modes: the `{schemaVersion, kind: "query.results",
 * data}` envelope under the global `--json`, otherwise a ranked listing — one
 * `<id>  [<type>]  (<score>)  — <snippet>` line per hit followed by the §3 truncation
 * footer when the `--limit` cap dropped matches. There is no command-specific JSON
 * flag; machine consumers use the same `--json` they use everywhere. The pretty and
 * plain renderers are identical (the listing is structural — no severities to color),
 * so they share one renderer.
 *
 * Validation lives here (the ranking/filtering stays pure in `core/query.ts`): an
 * unknown flag, a repeated `--type`/`--status`/`--limit`, a value-less value flag, a
 * non-integer/too-large/non-positive `--limit`, a malformed `--field` (no `=` or an
 * empty key), or a second positional is a `usage` error (exit 2). `query` never looks
 * an id up, so there is no `not_found` path — zero hits is a normal exit 0.
 */

import { join } from "node:path";
import { loadBundle } from "../core/bundle";
import { type FieldFilter, type QueryResult, query } from "../core/query";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable, renderTruncationLine, truncation } from "../output";

/** Options for {@link runQuery}; `root` and the streams are injectable for tests. */
export interface QueryCommandOptions {
  /** The repo root the `docs/` bundle resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `query`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for advisory warnings; defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The parsed form of `lore query`'s arguments. */
interface QueryArgs {
  /** The free-text search (the optional positional); `undefined` means filters-only. */
  text?: string;
  /** `--type` (at most once). */
  type?: string;
  /** `--status` (at most once). */
  status?: string;
  /** `--limit` (at most once); `undefined` falls back to the engine default. */
  limit?: number;
  /** `--tag` values, in order (repeatable). */
  tags: string[];
  /** `--field key=value` filters, in order (repeatable). */
  fields: FieldFilter[];
}

/** The narrow-it hint on the §3 truncation line (AC#2) — the actionable ways to bound a broad result. */
const NARROW_HINT = "narrow with --type/--tag/--status/--field, or raise --limit";

/**
 * Run `lore query`: parse the arguments, load the bundle, search it, emit the
 * `query.results`, and return `0`. A bad flag/positional throws a `usage`
 * {@link LoreError} (exit `2`); there is no not-found path (zero hits is a normal `0`).
 */
export function runQuery(options: QueryCommandOptions): number {
  const parsed = parseQueryArgs(options.args);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const data = query(graph, {
    text: parsed.text,
    type: parsed.type,
    tags: parsed.tags,
    status: parsed.status,
    fields: parsed.fields,
    limit: parsed.limit,
  });
  emit(queryRenderable(data), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `query`'s tokens into the optional text positional and the value flags
 * (`--type`/`--status`/`--limit` at most once each; `--tag`/`--field` repeatable),
 * also accepting the `--flag=value` form. The router has already stripped lore's
 * global flags, so a `--`-prefixed token here is a command flag: an unrecognized one
 * is a `usage` error, as is a repeated single-value flag, a value-less value flag, a
 * non-integer/out-of-range `--limit`, a malformed `--field`, or a second positional.
 * A `--` ends option parsing.
 */
function parseQueryArgs(args: readonly string[]): QueryArgs {
  const positionals: string[] = [];
  let type: string | undefined;
  let status: string | undefined;
  let limit: number | undefined;
  const tags: string[] = [];
  const fields: FieldFilter[] = [];

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
      switch (name) {
        case "type":
          if (type !== undefined) {
            throw usage("--type given more than once", "pass --type at most once");
          }
          type = readValue("--type", inline, args, i);
          if (inline === undefined) {
            i++;
          }
          break;
        case "status":
          if (status !== undefined) {
            throw usage("--status given more than once", "pass --status at most once");
          }
          status = readValue("--status", inline, args, i);
          if (inline === undefined) {
            i++;
          }
          break;
        case "limit":
          if (limit !== undefined) {
            throw usage("--limit given more than once", "pass --limit at most once");
          }
          limit = parseCount("--limit", readValue("--limit", inline, args, i));
          if (inline === undefined) {
            i++;
          }
          break;
        case "tag":
          tags.push(readValue("--tag", inline, args, i));
          if (inline === undefined) {
            i++;
          }
          break;
        case "field":
          fields.push(parseFieldFilter(readValue("--field", inline, args, i)));
          if (inline === undefined) {
            i++;
          }
          break;
        default:
          throw usage(`unknown option "--${name}"`, "run `lore query --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore query --help` to list options");
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    throw usage(
      `unexpected argument "${positionals[1]}"`,
      'pass one quoted search string, e.g. `lore query "soft delete retention"`',
    );
  }
  return { text: positionals[0], type, status, limit, tags, fields };
}

/**
 * Parse a `--field` argument into a `key=value` {@link FieldFilter}. Splits on the
 * **first** `=` (so a value may itself contain `=`); the key is trimmed and must be
 * non-empty, the value is taken verbatim. A missing `=` or empty key is a `usage` error.
 */
function parseFieldFilter(raw: string): FieldFilter {
  const eq = raw.indexOf("=");
  if (eq === -1) {
    throw usage(`invalid --field "${raw}"`, "use key=value, e.g. `--field status=in-progress`");
  }
  const key = raw.slice(0, eq).trim();
  if (key === "") {
    throw usage(`invalid --field "${raw}"`, "the field name before = must not be empty");
  }
  return { key, value: raw.slice(eq + 1) };
}

/**
 * Parse `--limit`'s value as a positive integer. Rejects a non-digit run (`Number()`
 * would coerce `"1.5"`/`"0x2"`/`" 2 "`/`"1e3"`), `0` (a zero cap returns nothing
 * useful), and a precision-losing `> 2^53` run — mirroring the count guard `lore
 * graph`/`context` use so the commands accept counts identically.
 */
function parseCount(flag: string, value: string): number {
  if (!/^\d+$/.test(value)) {
    throw usage(`invalid ${flag} "${value}"`, `pass an integer ≥ 1, e.g. \`${flag} 20\``);
  }
  const count = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(count)) {
    throw usage(`${flag} "${value}" is too large`, "pass a smaller integer");
  }
  if (count < 1) {
    throw usage(`invalid ${flag} "${value}"`, `pass an integer ≥ 1, e.g. \`${flag} 20\``);
  }
  return count;
}

/**
 * Read a value flag's argument: its inline `--flag=value` form when present, else the
 * **next** token. A missing/empty value — or a next token that is itself an option
 * (`--type --tag`) — is a `usage` error rather than a silently swallowed flag
 * (mirroring `lore graph`/`context`'s value-flag guard).
 */
function readValue(flag: string, inline: string | undefined, args: readonly string[], i: number): string {
  if (inline !== undefined) {
    if (inline === "") {
      throw usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} orders\``);
    }
    return inline;
  }
  const next = args[i + 1];
  if (next === undefined || next === "" || (next.startsWith("-") && next !== "-")) {
    throw usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} orders\``);
  }
  return next;
}

// ── Output ─────────────────────────────────────────────────────────────────────

/**
 * The per-result rendering bundle for `query` (output.ts dispatches on the mode).
 * `--json` always carries the structured {@link QueryResult}; the pretty/plain text is
 * the ranked listing. The two text modes render identically (the data is structural —
 * no severities to color), so pretty and plain share one renderer.
 */
function queryRenderable(data: QueryResult): Renderable<QueryResult> {
  return { kind: "query.results", data, pretty: renderText, plain: renderText };
}

/**
 * A human/pipe-stable ranked listing: a `query "<text>": <n> matches` header (or
 * `query (filters): …` when filters drove the result), one `<id>  [<type>]
 * (<score>)  — <snippet>` line per hit (the `(<score>)` shown only under a text query;
 * the `— <snippet>` dropped when the concept has neither summary nor title), and the
 * trailing §3 truncation footer when the `--limit` cap dropped matches. ANSI-free and
 * deterministic.
 */
function renderText(data: QueryResult): string {
  const head = data.query !== undefined ? `query "${data.query}"` : "query (filters)";
  const lines = [`${head}: ${data.total} ${data.total === 1 ? "match" : "matches"}`];
  for (const hit of data.hits) {
    const score = data.query !== undefined ? `  (${hit.score.toFixed(2)})` : "";
    const snippet = hit.snippet !== undefined ? `  — ${hit.snippet}` : "";
    lines.push(`  ${hit.id}  [${hit.type}]${score}${snippet}`);
  }
  const footer = renderTruncationLine(truncation(data.total, data.shown, NARROW_HINT));
  if (footer !== "") {
    lines.push(footer);
  }
  return lines.join("\n");
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
