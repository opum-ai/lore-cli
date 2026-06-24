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
 *   {@link OutputContext} for `reportError`/`WarningCollector.flush`.
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

import { asText, singleLine, type Writer } from "./errors";

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
  /** Whether ANSI color may be emitted. Only ever `true` in pretty mode. */
  readonly color: boolean;
}

/** {@link ModeInputs} plus the environment, for the full color-aware resolution. */
export interface ResolveInputs extends ModeInputs {
  /** The environment to read `NO_COLOR` from. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
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
 */
export function resolveOutput(inputs: ResolveInputs): OutputContext {
  const mode = resolveMode(inputs);
  const env = inputs.env ?? process.env;
  const color = mode === "pretty" && env.NO_COLOR === undefined;
  return { mode, color };
}

/**
 * Derive the `{ json, color }` pair {@link errors.reportError} and
 * `WarningCollector.flush` consume from a resolved {@link OutputContext}. `json`
 * is computed from `mode` here rather than stored on the context, so the success
 * path (routed by `mode`) and the error path (routed by `json`) cannot disagree.
 * Usage in a command's catch block: `reportError(err, { ...errorRenderOpts(ctx),
 * stderr })` (or `flush` likewise).
 */
export function errorRenderOpts(ctx: OutputContext): { json: boolean; color: boolean } {
  return { json: ctx.mode === "json", color: ctx.color };
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
  const cleanHint = hint ? singleLine(asText(hint)) : "";
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
 * Both the counts and the `hint` are re-validated here, not only in the
 * {@link truncation} builder: the parameter is the exported {@link Truncation}, so
 * a caller may hand-build one (bypassing the builder) with corrupt counts —
 * rendering `showing 30 of NaN` — or a multi-line/non-string `hint` that smuggles
 * a second, unprefixed line onto stdout (breaking the §3.2 single-line footer and
 * §4 stream discipline). Counts go through the same {@link assertCounts}; the hint
 * is coerced + single-lined as in the builder. Mirrors errors.ts, which guards at
 * both build and render.
 */
export function renderTruncationLine(t: Truncation): string {
  if (!t.truncated) {
    return "";
  }
  assertCounts(t.total, t.shown);
  const head = `showing ${t.shown} of ${t.total}`;
  const hint = t.hint ? singleLine(asText(t.hint)) : "";
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
 *   so stdout stays clean). Pretty receives the resolved `color`.
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
      writeBody(renderable.pretty(renderable.data, { color: ctx.color }), out);
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
 * only its trailing line terminators stripped (LF, the CR of a CRLF, and
 * U+2028/U+2029 — the same set the emptiness test treats as whitespace, so the two
 * cannot disagree), then exactly one `\n` is appended. Everything else is the
 * renderer's payload and is preserved verbatim — including trailing *horizontal*
 * whitespace on the last line, which a plain renderer may treat as a significant
 * field (e.g. an empty trailing TSV column, §1.3), and all leading/interior
 * formatting (pretty may format freely, §1.2).
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
