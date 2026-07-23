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
import { loadProfile } from "../core/profile";
import { type FieldFilter, type QueryResult, query } from "../core/query";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, singleLine, stripAnsiAndControls, WarningCollector, type Writer } from "../errors";
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
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(docsRoot, { warnings: advisories, profile });
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
          type = readTrimmedValue("--type", inline, args, i);
          if (inline === undefined) {
            i++;
          }
          break;
        case "status":
          if (status !== undefined) {
            throw usage("--status given more than once", "pass --status at most once");
          }
          status = readTrimmedValue("--status", inline, args, i);
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
          tags.push(readTrimmedValue("--tag", inline, args, i));
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
 * **first** `=` (so a value may itself contain `=`); both sides are **trimmed** (the
 * comparison folds case and ignores surrounding space, so a padded `status= Done` must
 * not silently miss). A missing `=`, an empty key, or an **empty value** is a `usage`
 * error — the latter matching the empty-value guard {@link readValue} enforces for every
 * other flag, so `--field status=` is rejected rather than matching only a literally
 * empty field.
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
  const value = raw.slice(eq + 1).trim();
  if (value === "") {
    throw usage(`invalid --field "${raw}"`, "the value after = must not be empty");
  }
  return { key, value };
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

/**
 * Read a **string-filter** flag's value (`--type`/`--status`/`--tag`): delegates to
 * {@link readValue} for the raw token, then trims surrounding whitespace and rejects a
 * whitespace-only result as the same `usage` error `readValue` gives an empty one —
 * matching `parseFieldFilter`'s empty-after-trim rejection so a padded value (`--type "
 * Story "`) is never silently mismatched against the case-folding-but-not-trimming
 * engine comparator (LORE-232). Deliberately not used for `--limit`, whose `parseCount`
 * rejects a space-padded run and must stay that strict.
 */
function readTrimmedValue(flag: string, inline: string | undefined, args: readonly string[], i: number): string {
  const value = readValue(flag, inline, args, i).trim();
  if (value === "") {
    throw usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} orders\``);
  }
  return value;
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
 * deterministic: the query text and every hit's `id`/`type`/`snippet` are sanitized
 * ({@link sanitizeField}) before interpolation, so a crafted concept file (an id, a
 * `type`/`summary` frontmatter scalar) or the raw `--query` argument cannot smuggle an
 * ANSI escape sequence or other control byte into the rendered line (LORE-118).
 */
function renderText(data: QueryResult): string {
  const queryText = data.query !== undefined ? sanitizeField(data.query) : undefined;
  const head = queryText !== undefined ? `query "${queryText}"` : "query (filters)";
  const lines = [`${head}: ${data.total} ${data.total === 1 ? "match" : "matches"}`];
  for (const hit of data.hits) {
    const score = queryText !== undefined ? `  (${formatScore(hit.score)})` : "";
    const id = sanitizeField(hit.id);
    const type = sanitizeField(hit.type);
    const snippet = hit.snippet !== undefined ? `  — ${sanitizeField(hit.snippet)}` : "";
    lines.push(`  ${id}  [${type}]${score}${snippet}`);
  }
  const footer = renderTruncationLine(truncation(data.total, data.shown, NARROW_HINT));
  if (footer !== "") {
    lines.push(footer);
  }
  return lines.join("\n");
}

/**
 * Sanitize a field before it is interpolated into the plain/pretty listing: collapse
 * it to one line ({@link singleLine}) and strip ANSI escape sequences plus residual C0/C1
 * control bytes ({@link stripAnsiAndControls}) — every source here (a concept `id`, its
 * `type`/`summary` frontmatter, or the raw `--query` text) can carry attacker-influenced
 * bytes (a crafted bundle file, or the CLI argument itself), and without this a CSI
 * sequence could rewrite terminal state or forge output (LORE-118).
 */
function sanitizeField(text: string): string {
  return stripAnsiAndControls(singleLine(text));
}

/**
 * Format a BM25 score for the text listing: two decimals normally, but a **positive**
 * score that would round to `0.00` (a real hit whose relevance is tiny — e.g. a
 * near-ubiquitous term in a large bundle) falls back to two significant figures, so a
 * returned hit is never displayed as the `0.00` that reads like "should have been
 * dropped". Exported for direct unit coverage of both branches.
 */
export function formatScore(score: number): string {
  const fixed = score.toFixed(2);
  return score > 0 && Number(fixed) === 0 ? score.toPrecision(2) : fixed;
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
