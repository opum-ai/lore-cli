/**
 * output.ts — lore's output-mode layer (the single rendering seam).
 *
 * Every command produces a typed result object; this module renders it in
 * exactly one of three modes — **pretty**, **`--plain`**, or **`--json`** — and
 * is the one place that decides which. Centralizing the decision here is what
 * makes the machine contract hold for the *whole* stream rather than line by
 * line: the mode is resolved once, up front, so a single invocation never emits
 * a partially-styled or mixed stdout (cli-contract §1).
 *
 * Responsibilities (cli-contract §1–§6, lore-design §5):
 *
 * - **Resolve the mode** from the `--json`/`--plain` flags and the stdout TTY
 *   state, with the locked precedence `--json > --plain > pretty`; plain is
 *   auto-selected when stdout is not a TTY, so piped/redirected output is
 *   deterministic without a flag (§1.1).
 * - **Own the color decision.** Color is emitted only in pretty mode and only
 *   when `NO_COLOR` is unset (§6). This module reads the TTY and `NO_COLOR`;
 *   {@link errors} deliberately does not — it takes an already-resolved
 *   `{ json, color }`, which {@link errorRenderOpts} derives from an
 *   {@link OutputContext} for `reportError`/`WarningCollector.flush`. Because
 *   that pair writes to **stderr**, a redirected `2>` must never receive ANSI
 *   just because stdout happens to be a terminal (LORE-250, cli-contract §6):
 *   `resolveOutput` takes stderr's own TTY state (independent of the stdout TTY
 *   state `mode` is resolved from) and folds it into {@link OutputContext.color}
 *   at the source, so every consumer that reads `ctx.color` — including the
 *   `WarningCollector.flush({ color: options.output.color, ... })` call sites in
 *   `commands/*.ts`, which never round-trip through `errorRenderOpts` — gets the
 *   already-stderr-safe value with no call-site change of their own.
 *   {@link OutputContext.stdoutColor} carries the un-gated sibling so stdout's
 *   own pretty rendering ({@link emit}) is provably unaffected by stderr's TTY
 *   state (§6, AC#2). `errorRenderOpts` still exists for a caller that holds a
 *   hand-built (not `resolveOutput`-derived) context and needs the gate applied
 *   explicitly.
 * - **Emit the success envelope** `{ schemaVersion, kind, data }` on stdout in
 *   `--json` mode (§2), and the pretty/plain text otherwise.
 * - **Keep the streams disciplined.** Only the payload goes to stdout; all
 *   diagnostics belong on stderr (§4). On a non-serializable payload {@link emit}
 *   throws *before* writing, so the "stdout parses or stays silent" invariant
 *   holds even on that bug path.
 *
 * The {@link OutputMode} type is defined here, not in {@link errors}: the error
 * model is intentionally mode-agnostic, and the mode is an output-layer concept.
 *
 * Normative contract: docs/reference/cli-contract.md §1–§6.
 * Design: docs/specs/lore-design.md §5. Rationale: docs/adr/0005-cli-contract.md.
 */

import { asText, singleLine, stripAnsiAndControls, type Writer } from "./errors";

// Re-exported so a command author gets the write sink type from the rendering
// seam itself, without a second import from errors.ts.
export type { Writer };

/**
 * The three mutually exclusive output modes. Defined here (not in errors.ts,
 * which is mode-agnostic by design) because the mode is purely an output-layer
 * concern (cli-contract §1).
 */
export type OutputMode = "json" | "plain" | "pretty";

/** The version of the `--json` success-envelope contract (cli-contract §2/§7). */
export const SCHEMA_VERSION = 1;

/**
 * The two flags and the TTY state that select the mode. `isTTY` is
 * `process.stdout.isTTY`: `true` at a terminal, and `undefined`/`false` when
 * stdout is piped or redirected — both of which must auto-select plain, which is
 * why the resolver tests it for *falsiness*, not strict `=== false`.
 */
export interface ModeInputs {
  /** The `--json` flag. Wins over everything when set (cli-contract §1.1). */
  json?: boolean;
  /** The `--plain` flag. Selects plain unless `--json` is also set. */
  plain?: boolean;
  /** Whether stdout is a TTY. Falsy (piped/redirected) auto-selects plain. */
  isTTY?: boolean;
}

/**
 * Resolve the output mode from flags + TTY with the locked precedence
 * `--json > --plain > pretty` (cli-contract §1.1):
 *
 * - `--json` ⇒ `json`, regardless of `--plain`, TTY state, or `NO_COLOR`.
 * - else `--plain` **or a non-TTY stdout** ⇒ `plain` (the auto-selection that
 *   makes a piped/captured call stable and ANSI-free without a flag).
 * - else ⇒ `pretty`.
 *
 * Pure and env-free, so the precedence matrix is exhaustively testable on its
 * own; {@link resolveOutput} layers the color policy on top.
 */
export function resolveMode(inputs: ModeInputs): OutputMode {
  if (inputs.json) {
    return "json";
  }
  if (inputs.plain || !inputs.isTTY) {
    return "plain";
  }
  return "pretty";
}

/**
 * The resolved output decision, threaded through a command after a single
 * up-front {@link resolveOutput} call.
 *
 * `mode` is the **one** routing key: {@link emit} switches on it for the success
 * path, and {@link errorRenderOpts} derives the `{ json, color }` the error path
 * needs from it. There is deliberately no separate `json` field — a derivable,
 * independently-settable boolean could be hand-built to disagree with `mode`
 * (JSON envelope on stdout but a text error on stderr, or vice versa), so it is
 * computed on demand instead. `color` *is* carried: it is not derivable from
 * `mode` alone (it also depends on `NO_COLOR`).
 */
export interface OutputContext {
  readonly mode: OutputMode;
  /**
   * Whether ANSI color may be emitted, for the single color signal a caller that
   * only ever reads one field gets. Only ever `true` in pretty mode with
   * `NO_COLOR` unset.
   *
   * For a context built by {@link resolveOutput} (the real dispatch path in
   * cli.ts), this is the stdout color decision further AND-gated by **stderr's
   * own TTY state** (LORE-250 AC#1) — the value that is safe to hand to a
   * stderr writer without checking anything else. That is exactly what every
   * `WarningCollector.flush({ color: options.output.color, stderr })` call site
   * across `commands/*.ts` already reads (unchanged since before LORE-250), and
   * what {@link errorRenderOpts} multiplies again (a harmless no-op — see
   * there) for `reportError`. A hand-built context — most command-level unit
   * tests construct `{ mode, color }` directly and never route through
   * `resolveOutput` — has no independent stderr TTY state to gate on, so
   * `color` there is simply the one signal the test set, used as-is; this is
   * unchanged, pre-LORE-250 behavior for every such test.
   *
   * A caller that specifically needs stdout's own decision, un-narrowed by
   * stderr's TTY state, wants {@link OutputContext.stdoutColor} instead —
   * {@link emit} is the only one.
   */
  readonly color: boolean;
  /**
   * Stdout's own color decision — `mode === "pretty"` with `NO_COLOR` unset —
   * **never** further gated by stderr's TTY state. Set by {@link resolveOutput}
   * on every context it builds; {@link emit}'s pretty branch reads this (falling
   * back to {@link OutputContext.color} when absent) specifically so a
   * still-colored TTY stdout is provably unaffected by stderr being redirected
   * (LORE-250 AC#2) even though `color` above may have been narrowed for
   * stderr's sake on the very same context.
   *
   * Optional, not required: dozens of existing tests hand-build `{ mode, color }`
   * literals to unit-test one command's rendering in isolation from
   * `resolveOutput`'s stderr gate entirely: they never set this field, and
   * `emit`'s fallback to `color` reproduces their exact pre-existing behavior.
   */
  readonly stdoutColor?: boolean;
}

/** {@link ModeInputs} plus the environment, for the full color-aware resolution. */
export interface ResolveInputs extends ModeInputs {
  /** The environment to read `NO_COLOR` from. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /**
   * Whether **stderr** (not stdout) is a TTY — independent of `isTTY`, which is
   * stdout's own state and the only one {@link resolveMode}'s `mode` consults.
   * Defaults to `true`, a no-op that makes the returned `color` equal
   * `stdoutColor` exactly — every caller that predates this field (and any test
   * that only ever inspects `.color`) keeps its exact prior behavior. Only
   * cli.ts's real dispatch passes the actual stderr TTY state (LORE-250 AC#1).
   */
  stderrIsTTY?: boolean;
}

/**
 * Resolve the full {@link OutputContext}: the mode (via {@link resolveMode}) plus
 * the color policy (cli-contract §6).
 *
 * Color is allowed **only** in pretty mode and **only** when `NO_COLOR` is
 * unset. Because pretty is reachable only on a TTY (a non-TTY resolves to
 * plain), the TTY requirement of §6 is already satisfied by `mode === "pretty"`;
 * no separate TTY check is needed here. Per §6 — which overrides the upstream
 * NO_COLOR convention — `NO_COLOR` set to *any* value, **including the empty
 * string**, suppresses color, so presence is tested with `=== undefined` (unset)
 * rather than truthiness (which would let `NO_COLOR=` slip through).
 * `--plain`/`--json` are always ANSI-free, which falls out for free since
 * neither yields the pretty mode.
 *
 * `stdoutColor` is exactly that mode/NO_COLOR decision, untouched by anything
 * stream-specific. `color` is the same decision additionally AND-gated by
 * `stderrIsTTY` (LORE-250 AC#1): a `lore <cmd> 2>err.log` invocation run from a
 * terminal (stdout a TTY, stderr redirected) resolves `stdoutColor: true` (so
 * stdout keeps its color, AC#2) but `color: false` (so nothing that reads the
 * shared `color` field — every `WarningCollector.flush`/`reportError` call site
 * — can paint the redirected stderr). `stderrIsTTY` defaults to `true`, making
 * `color === stdoutColor`, matching every pre-LORE-250 caller exactly.
 */
export function resolveOutput(inputs: ResolveInputs): OutputContext {
  const mode = resolveMode(inputs);
  const env = inputs.env ?? process.env;
  const stdoutColor = mode === "pretty" && env.NO_COLOR === undefined;
  const stderrIsTTY = inputs.stderrIsTTY ?? true;
  return { mode, color: stdoutColor && stderrIsTTY, stdoutColor };
}

/**
 * Derive the `{ json, color }` pair {@link errors.reportError} and
 * `WarningCollector.flush` consume, for a caller holding an {@link OutputContext}
 * it needs to apply an *explicit* stderr-TTY gate to. `json` is computed from
 * `mode` here rather than stored on the context, so the success path (routed by
 * `mode`) and the error path (routed by `json`) cannot disagree.
 *
 * For a context {@link resolveOutput} built, `ctx.color` is **already** gated by
 * the real stderr TTY state it was constructed with (LORE-250 AC#1, see
 * {@link resolveOutput}) — cli.ts's two `reportError` call sites pass that same
 * real `stderrIsTTY` here too, which is a harmless no-op re-application (ANDing
 * a boolean with the value it was already ANDed with changes nothing). This
 * function's load-bearing case is a **hand-built** `ctx` — e.g. a unit test that
 * constructs `{ mode, color }` directly rather than via `resolveOutput` — where
 * `ctx.color` is a bare, ungated boolean and `stderrIsTTY` is the *only* place
 * the gate is applied.
 *
 * `stderrIsTTY` defaults to `true` — a no-op gate — so every call site that
 * predates this parameter (and any test that only cares about `ctx.color`)
 * keeps its exact prior behavior.
 *
 * Usage: `reportError(err, { ...errorRenderOpts(ctx, stderrIsTTY), stderr })`
 * (or `flush` likewise).
 */
export function errorRenderOpts(ctx: OutputContext, stderrIsTTY = true): { json: boolean; color: boolean } {
  return { json: ctx.mode === "json", color: ctx.color && stderrIsTTY };
}

/**
 * The canonical `--json` success envelope (cli-contract §2). Every successful
 * `--json` payload on stdout is exactly this shape: a stable `kind` naming the
 * result type so a consumer dispatches without inferring structure, and the
 * typed `data` body for that kind. Versioned additively (§7) — consumers
 * tolerate unknown keys and unknown `kind` values.
 */
export interface SuccessEnvelope<T> {
  schemaVersion: number;
  kind: string;
  data: T;
}

/**
 * Wrap a command's typed result in the {@link SuccessEnvelope} at the current
 * {@link SCHEMA_VERSION}. The single constructor for the envelope, so the
 * version and field order are fixed in one place.
 */
export function successEnvelope<T>(kind: string, data: T): SuccessEnvelope<T> {
  return { schemaVersion: SCHEMA_VERSION, kind, data };
}

/**
 * Explicit truncation signal for read-heavy output (cli-contract §3). A bounded
 * command never silently returns a partial result: in `--json` these fields sit
 * on `data`; in pretty/plain they render as the trailing line from
 * {@link renderTruncationLine}.
 */
export interface Truncation {
  /** The full count that matched. */
  total: number;
  /** The number actually returned. */
  shown: number;
  /** `true` when `shown < total`. */
  truncated: boolean;
  /** Actionable narrowing advice, identical across modes. Omitted when absent. */
  hint?: string;
}

/**
 * Build a {@link Truncation} from the full and shown counts, deriving
 * `truncated = shown < total`.
 *
 * Counts must be item tallies (see {@link assertCounts}) — a `NaN`/`Infinity`/
 * fractional/negative/transposed count throws rather than silently mis-deriving
 * `truncated` or serializing `NaN`→`null` in `--json` (§3.1).
 *
 * The `hint` is coerced ({@link asText}, so a non-string from a JS caller degrades
 * instead of crashing `String.prototype.replace`) and collapsed to one line
 * ({@link singleLine}, so an embedded newline cannot split the §3.2 line or appear
 * multi-line in `--json`); a hint empty or whitespace-only after collapsing is
 * dropped rather than emitted as a meaningless `"hint": ""`.
 */
export function truncation(total: number, shown: number, hint?: string): Truncation {
  assertCounts(total, shown);
  // `!== undefined`, not a truthy check: a provided-but-falsy hint (a JS caller's
  // `0`/`false`) must still be coerced via asText, not silently dropped — only an
  // omitted hint is skipped. (An empty/whitespace-only hint collapses to "" below
  // and is then dropped by the `if (cleanHint)` guard.)
  const cleanHint = hint !== undefined ? singleLine(asText(hint)) : "";
  const result: Truncation = { total, shown, truncated: shown < total };
  if (cleanHint) {
    result.hint = cleanHint;
  }
  return result;
}

/**
 * Render the pretty/plain truncation line (cli-contract §3.2), e.g.
 * `showing 30 of 120 — narrow with --type story`. Returns `""` when nothing was
 * truncated, so a caller can unconditionally append it and add no line when the
 * full result fit.
 *
 * The parameter is the exported {@link Truncation}, so a caller may hand-build one
 * (bypassing the builder), and every field is therefore re-derived or re-validated
 * here rather than trusted:
 *
 * - **`truncated` is derived** from `shown < total`, never read from the object — a
 *   hand-built `{ shown: 30, total: 120, truncated: false }` would otherwise drop
 *   the footer and present a partial result as complete (the §3 guarantee it must
 *   not), and the inverse would print a misleading `showing 30 of 30`.
 * - **counts** go through the same {@link assertCounts} (a corrupt count would
 *   render `showing 30 of NaN`).
 * - the **`hint`** is coerced + single-lined exactly as in the builder, so a
 *   multi-line/non-string hint cannot smuggle a second, unprefixed line onto stdout
 *   (§3.2/§4).
 *
 * Mirrors errors.ts, which guards at both build and render.
 */
export function renderTruncationLine(t: Truncation): string {
  assertCounts(t.total, t.shown);
  if (t.shown >= t.total) {
    return "";
  }
  const head = `showing ${t.shown} of ${t.total}`;
  const hint = t.hint !== undefined ? singleLine(asText(t.hint)) : "";
  return hint ? `${head} — ${hint}` : head;
}

/**
 * A command's per-result-type rendering bundle. A command supplies one of these
 * (the `kind`, the typed `data`, and the two text renderers) and never branches
 * on the mode itself — {@link emit} dispatches. `data` is what the `--json`
 * envelope carries; `pretty`/`plain` produce the human and pipe-stable text.
 * Renderers return the body **without** a trailing newline; {@link emit} adds
 * exactly one.
 */
export interface Renderable<T> {
  kind: string;
  data: T;
  /** Human view; emit ANSI only when `opts.color` is true. */
  pretty(data: T, opts: { color: boolean }): string;
  /** ANSI-free, diff-stable view for pipes and snapshot tests. */
  plain(data: T): string;
}

/**
 * Render a {@link Renderable} to stdout in the resolved mode — the seam every
 * command's success path goes through.
 *
 * - **json:** the {@link SuccessEnvelope} as one compact line. It is serialized
 *   *first*, then those exact bytes are validated against §2 (see
 *   {@link assertSerializedEnvelope}) before the write, so a malformed or
 *   non-serializable payload (a bug — core returns plain data) throws with
 *   **nothing** written, keeping "stdout parses or stays silent" (§4) intact.
 *   Unlike the error path, a bad success payload is deliberately *not* degraded:
 *   it must surface as an uncaught failure on stderr, never be dressed up as a
 *   success.
 * - **plain / pretty:** the renderer's text via {@link writeBody}, normalized to
 *   exactly one trailing newline (an empty/whitespace-only body writes nothing,
 *   so stdout stays clean). Pretty receives {@link OutputContext.stdoutColor} —
 *   stdout's own, never-stderr-gated decision — falling back to
 *   {@link OutputContext.color} only for a hand-built context that predates the
 *   `stdoutColor` field, so a still-TTY stdout is never dimmed by a redirected
 *   stderr (LORE-250 AC#2).
 *
 * The `switch` is exhaustive over {@link OutputMode}: the `never` default makes
 * adding a mode without handling it here a compile error. stdout-only by
 * contract; diagnostics are the caller's job via errors.ts on stderr. `out`
 * defaults to `process.stdout` and is injectable for tests.
 */
export function emit<T>(renderable: Renderable<T>, ctx: OutputContext, out: Writer = process.stdout): void {
  switch (ctx.mode) {
    case "json": {
      // Serialize ONCE, then validate the exact bytes (not the live object): this
      // closes a TOCTOU where a non-idempotent toJSON could ship a value different
      // from the one checked. The write happens only after both succeed.
      const text = JSON.stringify(successEnvelope(renderable.kind, renderable.data));
      assertSerializedEnvelope(text);
      out.write(`${text}\n`);
      return;
    }
    case "plain": {
      writeBody(renderable.plain(renderable.data), out);
      return;
    }
    case "pretty": {
      writeBody(renderable.pretty(renderable.data, { color: ctx.stdoutColor ?? ctx.color }), out);
      return;
    }
    default: {
      // Exhaustiveness guard: if OutputMode grows a member, this stops compiling.
      const unreachable: never = ctx.mode;
      throw new TypeError(`emit: unhandled output mode ${String(unreachable)}`);
    }
  }
}

/**
 * Write a pretty/plain body with exactly one trailing newline. Renderers return
 * the logical text without one (as errors.ts's `formatErrorText` does), so the
 * single source of truth for the line terminator is here.
 *
 * A body with no non-whitespace character is treated as "no content" and writes
 * **nothing**, so a command with no rows leaves stdout silent rather than emitting
 * a blank line. The test is `!/\S/` — `\S` is the complement of `\s`, which covers
 * spaces, tabs, CR/LF, the Unicode LINE/PARAGRAPH separators (U+2028/U+2029), and
 * the BOM — and allocates nothing, unlike `trim()`. A content-bearing body has
 * only its trailing **line terminators** stripped (LF, the CR of a CRLF, and
 * U+2028/U+2029 — the line-terminator subset of what the emptiness test counts as
 * whitespace, so a terminator-only body is silenced *and* a trailing terminator on
 * a content line is normalized), then exactly one `\n` is appended. All other
 * whitespace is the renderer's payload and is preserved verbatim — including
 * trailing *horizontal* whitespace on the last line, which a plain renderer may
 * treat as a significant field (e.g. an empty trailing TSV column, §1.3), and all
 * leading/interior formatting (pretty may format freely, §1.2).
 */
function writeBody(body: string, out: Writer): void {
  if (!/\S/.test(body)) {
    return;
  }
  const trimmed = body.replace(/[\r\n\u2028\u2029]+$/, "");
  out.write(`${trimmed}\n`);
}

/**
 * Validate the **serialized** `--json` envelope (cli-contract §2) — `kind` a
 * non-empty string, `data` an object or array — by parsing the exact bytes
 * {@link emit} is about to write.
 *
 * Checking the serialized form rather than the live object is what closes the
 * validate-then-reserialize TOCTOU: whatever a non-idempotent `toJSON`/getter
 * produced is already baked into `serialized`, so the value validated *is* the
 * value written. A `typeof` check on the live object cannot see this — a `Date`
 * (or any primitive-returning `toJSON`) is `typeof "object"` yet serializes to a
 * bare string; here that string, a `null`, or a dropped `data`/`kind` key (from an
 * `undefined`/function/symbol value, or a non-string `kind`) all fail. The
 * `JSON.parse` cannot throw — `serialized` came straight from `JSON.stringify`.
 * Throwing keeps the §4 invariant: the caller has not written yet, so stdout stays
 * silent and the bug surfaces on stderr (exit 1), never as a lie at exit 0.
 */
function assertSerializedEnvelope(serialized: string): void {
  const parsed = JSON.parse(serialized) as { kind?: unknown; data?: unknown };
  if (typeof parsed.kind !== "string" || parsed.kind === "") {
    throw new TypeError("emit: --json envelope kind must be a non-empty string (cli-contract §2)");
  }
  if (typeof parsed.data !== "object" || parsed.data === null) {
    throw new TypeError(
      `emit: --json envelope data for kind "${parsed.kind}" must be an object or array (cli-contract §2)`,
    );
  }
}

/**
 * One row for the shared 3-column id/status/title alignment: `lore tasks`'s rollup rows and `lore
 * orphans`' orphan-task block render the identical `{id, title, status}` shape through the identical
 * `  <id>  <status>  <title>` layout, so both commands share this type and {@link renderTaskSummaryRows}
 * rather than keeping two byte-identical redeclarations that could silently diverge (LORE-51).
 */
export interface TaskSummaryRow {
  /** Display-cased task id (`"LORE-21"`). */
  readonly id: string;
  readonly title: string;
  /** The raw configured Backlog status string (no presentation icon). */
  readonly status: string;
}

/**
 * The longest `length(item)` across `items` for column alignment — a loop rather than
 * `Math.max(...items.map(...))`, whose argument spread throws `RangeError` once the list is large
 * enough (a six-figure Backlog snapshot is possible). `0` for an empty list. Shared by every
 * aligned-column renderer (task-summary rows here, `lore orphans`' dangling-link concept column).
 */
export function maxLen<T>(items: readonly T[], length: (item: T) => number): number {
  let max = 0;
  for (const item of items) {
    const n = length(item);
    if (n > max) {
      max = n;
    }
  }
  return max;
}

/**
 * East Asian Wide/Fullwidth code point ranges (Unicode East_Asian_Width property W/F) that occupy
 * two terminal columns instead of one — CJK ideographs, Hangul syllables, kana, and fullwidth
 * forms/signs. A compact, hand-rolled range table, not the full Unicode East_Asian_Width property
 * or an external `wcwidth`/`string-width` dependency (LORE-221 AC#5) — it covers the blocks a
 * configured Backlog status string could plausibly carry.
 */
function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0x303e) || // CJK Radicals .. CJK Symbols and Punctuation
    (codePoint >= 0x3041 && codePoint <= 0x33ff) || // Hiragana, Katakana .. CJK Compatibility
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) || // Yi Syllables / Yi Radicals
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul Syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK Compatibility Ideographs
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) || // CJK Compatibility Forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // Fullwidth Forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) || // Fullwidth Signs
    (codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK Unified Ideographs Extension B and beyond
  );
}

/**
 * Zero-width and combining-mark code point ranges (Unicode general categories Mn/Me and the
 * common zero-width format characters) that render stacked on the preceding base character and
 * occupy no terminal column of their own. Same compact-table tradeoff as
 * {@link isWideCodePoint} — covers the blocks realistic status text could carry, not the full
 * Unicode property.
 */
function isZeroWidthCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) || // Combining Diacritical Marks
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) || // Combining Diacritical Marks Extended
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) || // Combining Diacritical Marks Supplement
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) || // Combining Diacritical Marks for Symbols
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || // Variation Selectors
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) || // Combining Half Marks
    codePoint === 0x200b || // Zero Width Space
    codePoint === 0x200c || // Zero Width Non-Joiner
    codePoint === 0x200d || // Zero Width Joiner
    codePoint === 0x2060 || // Word Joiner
    codePoint === 0xfeff // Zero Width No-Break Space / BOM
  );
}

/**
 * Terminal display width of `text` — the number of terminal columns it occupies when printed, not
 * `text.length` (UTF-16 code units). Iterates Unicode code points (`for...of` on a string steps by
 * code point, correctly handling surrogate pairs) rather than UTF-16 units, so a supplementary-plane
 * character is counted once, not twice. Each code point contributes 0 columns if it is
 * zero-width/combining ({@link isZeroWidthCodePoint}), 2 if it is East Asian wide/fullwidth
 * ({@link isWideCodePoint}), else 1 — which makes an ASCII-only string's display width equal its
 * `.length`, so callers that only ever saw ASCII see byte-identical output (LORE-221 AC#4).
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const codePoint = ch.codePointAt(0) ?? 0;
    if (isZeroWidthCodePoint(codePoint)) {
      continue;
    }
    width += isWideCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

/**
 * Pad `text` with trailing spaces until it reaches `width` terminal columns
 * ({@link displayWidth}), not `width` UTF-16 code units the way `String.prototype.padEnd` does —
 * `padEnd` over/under-shoots once `text` contains a East Asian wide or zero-width/combining
 * character. Padding characters are plain ASCII spaces (always display width 1), so the width
 * deficit maps directly to a character count. Returns `text` unchanged once it is already at or
 * past `width`.
 */
function padEndDisplay(text: string, width: number): string {
  const deficit = width - displayWidth(text);
  return deficit > 0 ? text + " ".repeat(deficit) : text;
}

/**
 * Render `rows` as aligned `  <id>  <status>  <title>` lines, one per row, with the id/status
 * columns padded to the widest cell in each (via the spread-free {@link maxLen}). Shared by `lore
 * tasks`'s rollup table and `lore orphans`' orphan-task block, so a column-layout change (an extra
 * column, truncation, a width cap) is a one-place edit instead of two independently-drifting copies.
 * Returns `[]` for an empty `rows` — the caller decides what an empty section renders as.
 *
 * Each field is coerced ({@link asText}), collapsed to one line ({@link singleLine}), and stripped
 * of ANSI escape sequences and residual control characters ({@link stripAnsiAndControls}) before
 * padding/joining. `id`/`status`/`title` come from a Backlog task file, which a crafted or
 * corrupted file could load with an embedded newline, CR, ANSI escape sequence, or other control
 * character — without this, that would split a plain-mode row across lines, inject cursor-moving
 * escape sequences, or otherwise break the single-line, ANSI-free-per-row output guarantee
 * (cli-contract.md §6). Sanitizing before {@link maxLen} also keeps the column widths measuring the
 * same text that is actually printed, so a stripped character cannot desync the padding from the
 * rendered length.
 *
 * Column width is measured and padded by terminal *display* width ({@link displayWidth} /
 * {@link padEndDisplay}), not UTF-16 code-unit count — the realistic vector is `status` (the raw
 * configured Backlog status), which a full-width CJK status or a combining-mark status could
 * otherwise under- or over-pad relative to what a terminal actually renders (LORE-221). `id` is
 * always ASCII in practice, and `title` is the unpadded last column either way.
 */
export function renderTaskSummaryRows(rows: readonly TaskSummaryRow[]): string[] {
  const clean = rows.map((row) => ({
    id: stripAnsiAndControls(singleLine(asText(row.id))),
    status: stripAnsiAndControls(singleLine(asText(row.status))),
    title: stripAnsiAndControls(singleLine(asText(row.title))),
  }));
  const idWidth = maxLen(clean, (row) => displayWidth(row.id));
  const statusWidth = maxLen(clean, (row) => displayWidth(row.status));
  return clean.map(
    (row) => `  ${padEndDisplay(row.id, idWidth)}  ${padEndDisplay(row.status, statusWidth)}  ${row.title}`,
  );
}

/**
 * Assert truncation counts are item tallies — non-negative integers with
 * `shown <= total`. Shared by {@link truncation} (build) and
 * {@link renderTruncationLine} (render) so a hand-built {@link Truncation} cannot
 * bypass the check at either seam. A `NaN`/`Infinity`/fractional/negative/
 * transposed count is an upstream arithmetic slip: at build it makes
 * `shown < total` mis-derive `truncated` and serialize `NaN`→`null` in `--json`
 * (§3.1); at render it prints `showing 30 of NaN` / `showing 30 of 120.5` (§3.2).
 * Fail loud either way.
 */
function assertCounts(total: number, shown: number): void {
  if (!Number.isInteger(total) || !Number.isInteger(shown) || shown < 0 || shown > total) {
    throw new RangeError(
      `truncation: counts must be integers with 0 <= shown <= total, received total=${String(total)}, shown=${String(shown)}`,
    );
  }
}
