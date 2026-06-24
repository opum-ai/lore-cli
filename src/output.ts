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
 *   `{ json, color }`. An {@link OutputContext} *is* that pair (plus `mode`),
 *   so a command hands it straight to `reportError`/`WarningCollector.flush`.
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

import { singleLine, type Writer } from "./errors";

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
 * `json` and `color` are the exact pair {@link errors.reportError} and
 * `WarningCollector.flush` expect, so a command passes the whole context to
 * either — the extra `mode` field is structurally ignored. `json` is carried
 * explicitly (rather than recomputed as `mode === "json"` at each call site) so
 * the error path and the output path read the *same* boolean.
 */
export interface OutputContext {
  readonly mode: OutputMode;
  /** `true` iff `mode === "json"`. The `{ json }` errors.ts consumes. */
  readonly json: boolean;
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
  return { mode, json: mode === "json", color };
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
 * Counts are item tallies, so they must be non-negative integers with
 * `shown <= total`; a `NaN`/`Infinity`/fractional/negative/transposed count is an
 * upstream arithmetic slip and throws a `RangeError` rather than producing
 * misleading output. The guard matters because the failure is otherwise *silent*:
 * `NaN < total` is `false`, so a genuinely partial result would report
 * `truncated: false`, and `JSON.stringify(NaN)` emits `null` into the `--json`
 * envelope (§3.1) — a consumer that branches on `truncated`/`total` is told a
 * dropped-rows result is complete. A fractional count would also render as
 * `showing 30.5 of 120` (§3.2).
 *
 * The `hint` is collapsed to a single line via {@link singleLine} (so an embedded
 * newline cannot split the §3.2 line or appear multi-line in `--json`), and a
 * hint that is empty or whitespace-only after collapsing is dropped rather than
 * emitted as a meaningless `"hint": ""`.
 */
export function truncation(total: number, shown: number, hint?: string): Truncation {
  if (!Number.isInteger(total) || !Number.isInteger(shown) || shown < 0 || shown > total) {
    throw new RangeError(
      `truncation: counts must be integers with 0 <= shown <= total, received total=${String(total)}, shown=${String(shown)}`,
    );
  }
  const cleanHint = hint ? singleLine(hint) : "";
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
 */
export function renderTruncationLine(t: Truncation): string {
  if (!t.truncated) {
    return "";
  }
  const head = `showing ${t.shown} of ${t.total}`;
  return t.hint ? `${head} — ${t.hint}` : head;
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
 * - **json:** the {@link SuccessEnvelope} as one compact line. `data` is checked
 *   to be an object/array and then serialized *before* the write, so a malformed
 *   or non-serializable payload (a bug — core returns plain data) throws here
 *   with **nothing** written, keeping "stdout parses or stays silent" (§4)
 *   intact. Unlike the error path, a bad success payload is deliberately *not*
 *   degraded: it must surface as an uncaught failure on stderr, never be dressed
 *   up as a success.
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
      // Reject off-contract data, then serialize; only write once both succeed,
      // so a bad payload never lands a malformed "success" on stdout.
      assertEnvelopeData(renderable.kind, renderable.data);
      const text = JSON.stringify(successEnvelope(renderable.kind, renderable.data));
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
 * All trailing whitespace is stripped — spaces, tabs, and line endings of either
 * convention, since a bare `\n` strip would leave a stray `\r` from a `\r\n`
 * ending — and a body that is entirely whitespace collapses to nothing and
 * writes **nothing**, so a command with no rows leaves stdout silent rather than
 * emitting a blank line. Only the trailing edge is normalized: leading and
 * interior formatting is the renderer's payload and is preserved verbatim —
 * pretty mode may format freely (§1.2) and a plain renderer owns its own
 * diff-stability (§1.3).
 */
function writeBody(body: string, out: Writer): void {
  const trimmed = body.replace(/\s+$/, "");
  if (trimmed === "") {
    return;
  }
  out.write(`${trimmed}\n`);
}

/**
 * Assert a `--json` envelope's `data` satisfies cli-contract §2 (an object or
 * array) before it is serialized. A value `JSON.stringify` drops as a property —
 * `undefined`, a function, a symbol — would otherwise yield an envelope with no
 * `data` key at all (malformed, §2-violating), and a `null` or primitive would
 * put a `data` that a `JSON.parse(stdout).data.<field>` consumer crashes on.
 * Either way the "success" would be a lie. Throwing here keeps the §4 invariant:
 * nothing reaches stdout, and the throw surfaces as an uncaught error on stderr
 * (exit 1) instead of a malformed success at exit 0.
 */
function assertEnvelopeData(kind: string, data: unknown): void {
  if (typeof data !== "object" || data === null) {
    throw new TypeError(
      `emit: --json envelope data for kind "${kind}" must be an object or array, received ${
        data === null ? "null" : typeof data
      }`,
    );
  }
}
