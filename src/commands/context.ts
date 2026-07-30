/**
 * commands/context.ts — `lore context <id> [--max-tokens <n>] [--depth <n>]`.
 *
 * The thin, read-only layer that emits a **token-budgeted context pack** for one
 * concept (cli-surface §context; LORE-34). It loads the `docs/` bundle into a
 * {@link BundleGraph}, then hands the target id, the neighbor radius (`--depth`,
 * default {@link DEFAULT_DEPTH}), and the budget (`--max-tokens`) to the pure
 * {@link buildContext} shaper — which gathers the target's neighborhood via the
 * shared {@link subgraph} traversal and compacts it to the target's full body plus
 * one-line neighbor summaries.
 *
 * Output follows the uniform CLI modes: the `{schemaVersion, kind:
 * "context.export", data}` envelope under the global `--json`, and otherwise a
 * pasteable text pack — the target's body followed by the neighbor compaction —
 * with a §3 truncation footer when the budget dropped neighbors. There is no
 * command-specific JSON flag; machine consumers use the same `--json` they use
 * everywhere. The pretty and plain renderers are identical (the pack is structural —
 * no severities to color), so they share one renderer.
 *
 * The positional `<id>` is normalized through {@link idFromPath} exactly as `lore
 * graph`/`rename`/`supersede` normalize theirs, so a path-form, `./`-prefixed, or
 * `.md`-suffixed id resolves to the same bundle key.
 *
 * Validation lives here (the budget/compaction computation stays pure in
 * `core/context.ts`): a missing or duplicate `<id>`, an unknown flag, a
 * repeated/value-less/non-integer/too-large/non-positive `--max-tokens`, or a
 * repeated/value-less/non-integer/too-large/negative `--depth` is a `usage` error
 * (exit 2); an `<id>` absent from the bundle surfaces as the `not_found` error
 * (exit 3) {@link buildContext} throws.
 */

import { join } from "node:path";
import { loadBundle } from "../core/bundle";
import { idFromPath } from "../core/concept";
import { buildContext, type ContextExport, DEFAULT_DEPTH } from "../core/context";
import { loadProfile } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable, renderTruncationLine, truncation } from "../output";
import { parseCommandArgs, singleOptionValue } from "./args";

/** Options for {@link runContext}; `root` and the streams are injectable for tests. */
export interface ContextOptions {
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

/** The parsed form of `lore context`'s arguments. */
interface ContextArgs {
  /** The target concept id (positional, already {@link idFromPath}-normalized). */
  id: string;
  /** The token budget (`--max-tokens`); `undefined` means no size trim (bounded only by depth). */
  maxTokens?: number;
  /** The hop radius (`--depth`); `undefined` falls back to {@link DEFAULT_DEPTH}. */
  depth?: number;
}

/**
 * Run `lore context`: parse the arguments, load the bundle, build the context pack,
 * emit the `context.export`, and return `0`. A bad flag/positional throws a `usage`
 * {@link LoreError} (exit `2`); an `<id>` not in the bundle a `not_found` one (exit
 * `3`).
 */
export function runContext(options: ContextOptions): number {
  const parsed = parseContextArgs(options.args);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(docsRoot, { warnings: advisories, profile });
  // Flush load warnings before buildContext, which throws not_found for an unknown
  // target — otherwise an advisory explaining *why* a file is not a concept would be
  // discarded on exactly the path that most needs it (mirrors `lore graph`).
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const data = buildContext(graph, parsed.id, { depth: parsed.depth, maxTokens: parsed.maxTokens });
  emit(contextRenderable(data), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `context`'s tokens into the required `<id>` positional and the value flags
 * `--max-tokens <n>` / `--depth <n>` (also accepting the `--flag=value` form). The
 * Commander has already resolved Lore's global flags, so a `--`-prefixed token here is
 * a command flag: an unrecognized one is a `usage` error, as is a repeated or
 * value-less value flag, a non-integer/out-of-range value, a missing `<id>`, or a
 * second positional. A `--` ends option parsing. The `<id>` is
 * {@link idFromPath}-normalized so path/`.md`/`./` forms resolve.
 */
function parseContextArgs(args: readonly string[]): ContextArgs {
  const parsed = parseCommandArgs(args, "context");
  const positionals = parsed.positionals;
  const rawMaxTokens = singleOptionValue(parsed, "max-tokens");
  const rawDepth = singleOptionValue(parsed, "depth");
  if (rawMaxTokens === "") throw usage("--max-tokens needs a value", "pass a value, e.g. `--max-tokens 2`");
  if (rawDepth === "") throw usage("--depth needs a value", "pass a value, e.g. `--depth 2`");
  const maxTokens = rawMaxTokens === undefined ? undefined : parseCount("--max-tokens", rawMaxTokens, { min: 1 });
  const depth = rawDepth === undefined ? undefined : parseCount("--depth", rawDepth, { min: 0 });
  if (positionals.length === 0) {
    throw usage(
      "`lore context` needs a concept id",
      "give the concept to build context for, e.g. `lore context stories/x`",
    );
  }
  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore context <id> [--max-tokens <n>] [--depth <n>]`");
  }
  return { id: idFromPath(positionals[0] as string), maxTokens, depth };
}

/**
 * Parse a count flag's value as an integer at or above `min` (`--depth` allows `0`,
 * `--max-tokens` requires a positive budget). Rejects a non-digit run
 * (`Number()` would coerce `"1.5"`/`"0x2"`/`" 2 "`/`"1e3"`), a value below `min`,
 * and a precision-losing `> 2^53` run — mirroring `lore graph`'s `--depth` guard so
 * the two commands accept counts identically.
 */
function parseCount(flag: string, value: string, opts: { min: number }): number {
  if (!/^\d+$/.test(value)) {
    throw usage(
      `invalid ${flag} "${value}"`,
      `pass an integer ≥ ${opts.min}, e.g. \`${flag} ${opts.min + 1}\`; ${flag} needs a value before a separate flag-looking token`,
    );
  }
  const count = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(count)) {
    throw usage(`${flag} "${value}" is too large`, "pass a smaller integer");
  }
  if (count < opts.min) {
    throw usage(`invalid ${flag} "${value}"`, `pass an integer ≥ ${opts.min}, e.g. \`${flag} ${opts.min + 1}\``);
  }
  return count;
}

/**
 * Read a value flag's argument: its inline `--flag=value` form when present, else
 * the **next** token. A missing/empty value — or a next token that is itself an
 * option (`--depth --max-tokens`) — is a `usage` error rather than a silently
 * swallowed flag (mirroring `lore graph`'s value-flag guard).
 */
// ── Output ─────────────────────────────────────────────────────────────────────

/**
 * The per-result rendering bundle for `context` (output.ts dispatches on the mode).
 * `--json` always carries the structured {@link ContextExport}; the pretty/plain
 * text is the pasteable pack. The two text modes render identically (the data is
 * structural — no severities to color), so pretty and plain share one renderer.
 */
function contextRenderable(data: ContextExport): Renderable<ContextExport> {
  return { kind: "context.export", data, pretty: renderText, plain: renderText };
}

/**
 * A human/pipe-stable context pack: a header naming the target, its depth/budget and
 * the pack's `~tokens`, then the target's full body, then a `neighbors (<shown> of
 * <total>)` section with one `- <id>  [<type>]  — <summary>` line each (the `— …`
 * dropped when a neighbor has no summary), and a trailing budget line: an
 * over-budget warning when the always-included target alone exceeds `--max-tokens`,
 * else the §3 truncation footer when the budget dropped neighbors. ANSI-free and
 * deterministic.
 */
function renderText(data: ContextExport): string {
  const budget = data.maxTokens !== undefined ? `, budget ${data.maxTokens}` : "";
  const lines = [
    `context: ${data.root}  [${data.target.type}] — depth ${data.depth}${budget}, ~${data.tokenEstimate} tokens (chars/4)`,
    "",
    data.target.body.replace(/\n+$/, ""),
    "",
    `neighbors (${data.shown} of ${data.total}):`,
  ];
  for (const neighbor of data.neighbors) {
    const summary = neighbor.summary !== undefined ? `  — ${neighbor.summary}` : "";
    lines.push(`  - ${neighbor.id}  [${neighbor.type}]${summary}`);
  }
  const footer = budgetFooter(data);
  if (footer !== "") {
    lines.push(footer);
  }
  return lines.join("\n");
}

/**
 * The trailing budget line for the pack, or `""` when it fully fit. Over budget (the
 * mandatory target alone exceeds `--max-tokens`, so no neighbor could be dropped to
 * help) gets an explicit warning; otherwise a dropped-neighbor count gets the §3
 * truncation footer. The hint is **only** `raise --max-tokens` — lowering `--depth`
 * cannot surface more neighbors (the included set is a budget-bound nearest-first
 * prefix, so a smaller `--depth` only removes farther candidates that were never
 * going to be included).
 */
function budgetFooter(data: ContextExport): string {
  if (data.maxTokens !== undefined && data.tokenEstimate > data.maxTokens) {
    return `over budget: ~${data.tokenEstimate} tokens exceeds the ${data.maxTokens}-token limit — the target is always included; raise --max-tokens`;
  }
  return renderTruncationLine(truncation(data.total, data.shown, "raise --max-tokens to include more"));
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
