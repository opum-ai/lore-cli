/**
 * errors.ts — lore's shared diagnostic model.
 *
 * This module is the single source of truth for how lore classifies failures
 * and surfaces diagnostics: the {@link LoreError} taxonomy, the centralized
 * exit-code mapping, the `--json` error envelope, and the warnings-not-errors
 * collector. Centralizing it here is what guarantees the contract — the same
 * logical failure maps to the same exit code and the same envelope from every
 * command and from the deferred MCP transport, instead of each command
 * inventing its own `process.exit(1)`.
 *
 * It deliberately does NOT resolve the output mode or read a TTY / `NO_COLOR`
 * (that is `output.ts`, LORE-12): callers pass an already-resolved `{ json,
 * color }` pair. It also never writes to stdout — diagnostics belong on stderr —
 * so the "stdout parses or stays silent" invariant holds.
 *
 * Normative contract: docs/reference/cli-contract.md §4–§5.
 * Rationale: docs/adr/0005-cli-contract.md.
 */

/**
 * The classifiable failure categories. Each maps to exactly one semantic exit
 * code via {@link EXIT_CODES}. `validation` and `drift` are distinct
 * `error_type` strings that intentionally share exit `6`, so an agent can tell
 * "my frontmatter is malformed" from "my managed block is stale"
 * (cli-contract §5.3) while shell/CI branching on the code stays simple.
 */
export type ErrorType = "usage" | "not_found" | "denied" | "conflict" | "validation" | "drift";

/** Success. */
export const EXIT_OK = 0;

/**
 * Unexpected / uncaught failure — a crash or bug, never a classifiable
 * condition. Reserved per cli-contract §5.1: an agent treats exit `1` as
 * "report this", not "handle this". {@link LoreError}s never map here.
 */
export const EXIT_UNCAUGHT = 1;

/**
 * The contract: {@link ErrorType} → semantic exit code (cli-contract §5.1).
 * Centralized so no command invents its own mapping. Changing any entry is a
 * breaking contract change.
 */
export const EXIT_CODES: Readonly<Record<ErrorType, number>> = Object.freeze({
  usage: 2,
  not_found: 3,
  denied: 4,
  conflict: 5,
  validation: 6,
  drift: 6,
});

/**
 * A typed, classifiable failure. Core functions `throw` these instead of
 * printing or calling `process.exit`; the command layer catches one and renders
 * it via {@link reportError}. Errors are values, not ad-hoc strings.
 */
export class LoreError extends Error {
  constructor(
    /** The failure category, which fixes the exit code (see {@link EXIT_CODES}). */
    readonly type: ErrorType,
    message: string,
    /** An actionable next step, written so an agent can often self-correct in one turn. */
    readonly hint?: string,
    /** The offending input echoed back, so a caller can diagnose without re-deriving it. */
    readonly input?: unknown,
  ) {
    super(message);
    // Set on the instance (not via an `override` field) so stack traces and
    // `err.name` read "LoreError" without fighting Error's prototype property.
    this.name = "LoreError";
  }
}

/**
 * The `--json` error envelope (cli-contract §5.2). Emitted on **stderr**, never
 * wrapped in the success `{ schemaVersion, kind, data }` envelope, so a caller
 * never mistakes an error for data.
 */
export interface ErrorEnvelope {
  error_type: ErrorType;
  message: string;
  hint?: string;
  input?: unknown;
}

/**
 * The exit-`1` envelope for an uncaught failure (cli-contract §5.1) — the
 * catch-all emitted when a non-{@link LoreError} value reaches
 * {@link reportError}. `uncaught` is the only `error_type` outside the §5.3
 * table and carries no `hint`/`input`. Typed separately from
 * {@link ErrorEnvelope} (whose `error_type` is a classifiable {@link ErrorType})
 * so the catch-all shape is pinned to the contract at compile time.
 */
interface UncaughtEnvelope {
  error_type: "uncaught";
  message: string;
}

/**
 * Coerce a value the contract types as a `string` (a `message` or `hint`) into an
 * actual string. The taxonomy types both as `string`, but a JS caller — or an
 * `Error.message`/`hint` reassigned at runtime — can still hand us a non-string,
 * while cli-contract §5.2 promises the envelope's `message`/`hint` ARE strings.
 * Guarded through {@link safeStringify} so coercion on the error path can never
 * itself throw (a hostile value cannot crash the very code reporting a failure).
 *
 * Exported alongside {@link singleLine} so the output layer applies the same
 * coercion before single-lining the truncation `hint` — a non-string hint from a
 * JS caller must degrade, not crash `String.prototype.replace`.
 */
export function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return safeStringify(value);
}

/**
 * Collapse a diagnostic field to a single line: any run of line breaks (with
 * adjacent horizontal whitespace) becomes one space, and the ends are trimmed.
 * cli-contract §5.2 types `message` as single-line and §5.4 promises the text
 * diagnostic is one stderr line, so a multi-line `message`/`hint` can neither
 * spill across lines nor smuggle a second, unprefixed line into stderr. `input`
 * is deliberately exempt — it is echoed structured data, not a human-readable
 * line, and its newlines are preserved (escaped) in JSON.
 *
 * The run matches every ECMAScript line terminator — CR, LF, and the Unicode
 * LINE/PARAGRAPH SEPARATORs U+2028/U+2029 — so a separator that `trim()` already
 * treats as whitespace cannot survive here as a smuggled break.
 *
 * Exported so the output layer (output.ts) collapses its single-line fields — the
 * truncation `hint` (cli-contract §3.2) — through the *same* discipline rather
 * than letting an embedded newline smuggle a second line onto stdout.
 */
export function singleLine(text: string): string {
  return text.replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ").trim();
}

/**
 * Project a {@link LoreError} onto its `--json` error envelope. `message`/`hint`
 * are coerced to single-line strings (§5.2); `hint` is omitted when absent or
 * empty; `input` is included only when it is a non-null, non-array object
 * (cli-contract §5.2 types it as an object), so a `null`/primitive/array `input`
 * is dropped rather than emitted as noise. Field order matches the contract example.
 */
export function toErrorEnvelope(err: LoreError): ErrorEnvelope {
  // §5.2 types `message`/`hint` as single-line strings. Coerce (a reassigned or
  // mis-typed value need not be a string) and collapse newlines, so the envelope
  // honors the contract regardless of what a caller stored on the error.
  const envelope: ErrorEnvelope = { error_type: err.type, message: singleLine(asText(err.message)) };
  // A hint counts as present only when it is non-empty; an empty hint would emit
  // a meaningless `"hint": ""` (and a dangling `hint:` line in text).
  if (err.hint) {
    envelope.hint = singleLine(asText(err.hint));
  }
  // §5.2 types `input` as an object. Echo a non-null, non-array object only: a
  // `null`/primitive (`input: null` / `input: "..."`) or an array (`input: [...]`)
  // would break a consumer that decodes `input` as an object and reads
  // `envelope.input.<field>`.
  if (typeof err.input === "object" && err.input !== null && !Array.isArray(err.input)) {
    envelope.input = err.input;
  }
  return envelope;
}

/**
 * Map any thrown value to its semantic exit code. A {@link LoreError} maps via
 * {@link EXIT_CODES}; anything else is {@link EXIT_UNCAUGHT} (an uncaught bug).
 */
export function exitCodeFor(err: unknown): number {
  return err instanceof LoreError ? EXIT_CODES[err.type] : EXIT_UNCAUGHT;
}

// ANSI sequences for color rendering. Color is purely cosmetic and applied only
// when the caller passes `color: true`; this module never decides that itself.
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function paint(label: string, sequence: string, color: boolean): string {
  return color ? `${sequence}${label}${RESET}` : label;
}

/**
 * The single authoritative `error: <message>` head for text-mode diagnostics
 * (cli-contract §5.4). Both {@link formatErrorText} (classifiable errors) and
 * {@link reportError}'s uncaught branch render through this, so the two never
 * drift in prefix/color/spacing.
 */
function errorHead(message: string, color: boolean): string {
  return `${paint("error:", RED, color)} ${message}`;
}

/**
 * Render a {@link LoreError} as a human diagnostic for stderr: a single
 * `error: <message>` line plus, when present, a `hint: <hint>` line
 * (cli-contract §5.4). Color is applied only when `opts.color` is true; the
 * caller (output.ts) owns the TTY/`NO_COLOR` decision.
 */
export function formatErrorText(err: LoreError, opts: { color?: boolean } = {}): string {
  const color = opts.color ?? false;
  // Same single-line coercion as the envelope (§5.2/§5.4): a multi-line or
  // non-string message/hint must not split the stderr diagnostic across lines.
  const head = errorHead(singleLine(asText(err.message)), color);
  if (!err.hint) {
    return head;
  }
  return `${head}\n${paint("hint:", DIM, color)} ${singleLine(asText(err.hint))}`;
}

/** A minimal write sink — `process.stderr` satisfies it, and tests inject a fake. */
export interface Writer {
  write(s: string): void;
}

/**
 * Project an arbitrary value onto a JSON-safe shape — primitives, arrays, and
 * plain objects only — that {@link JSON.stringify} can encode without throwing.
 * This is the degraded path {@link safeStringify} takes when a raw stringify
 * fails. It mirrors `JSON.stringify`'s own semantics, then tolerates exactly the
 * things it chokes on:
 *
 * - A custom `toJSON` is honored (a `Date` → its ISO string, a class → its
 *   `toJSON` shape), so this fallback agrees with the fast path and respects a
 *   `toJSON` written to hide fields.
 * - `BigInt` → its decimal string.
 * - Reference cycles → `"[Circular]"`, detected against the **ancestor chain**
 *   (not "seen anywhere"), so a shared but acyclic node — a diamond — still
 *   serializes in full instead of being mislabeled circular.
 * - A throwing `toJSON`/getter on a single field → `"[Unserializable]"` for that
 *   field alone; the surrounding object is unaffected.
 *
 * `function`/`undefined`/`symbol` are dropped just as `JSON.stringify` drops
 * them. Plain-string fields are returned verbatim, which is why an envelope's
 * `error_type`/`message`/`hint` always survive this path. `ancestors` is the
 * set of objects on the current path (O(1) membership; cleared on unwind).
 */
function toJsonSafe(value: unknown, ancestors: Set<object>, key = ""): unknown {
  if (value === null) {
    return null;
  }
  const kind = typeof value;
  if (kind === "bigint") {
    return (value as bigint).toString();
  }
  if (kind !== "object") {
    // string | number | boolean survive; function | undefined | symbol are
    // dropped by JSON.stringify, so returning undefined mirrors its semantics.
    return kind === "string" || kind === "number" || kind === "boolean" ? value : undefined;
  }
  if (ancestors.has(value as object)) {
    return "[Circular]";
  }
  ancestors.add(value as object);
  try {
    // Honor a custom `toJSON` exactly as JSON.stringify would (before the array
    // check, as it does). Reading or invoking it may throw — isolate that.
    let replacement: unknown;
    let replaced = false;
    try {
      const toJson = (value as { toJSON?: unknown }).toJSON;
      if (typeof toJson === "function") {
        // JSON.stringify passes the property key to toJSON (the index for an
        // array element, "" at the root); pass it too so a key-sensitive toJSON
        // serializes identically on this fallback as on the fast path.
        replacement = (toJson as (key: string) => unknown).call(value, key);
        replaced = true;
      }
    } catch {
      return "[Unserializable]";
    }
    if (replaced) {
      return toJsonSafe(replacement, ancestors, key);
    }
    if (Array.isArray(value)) {
      return (value as unknown[]).map((item, index) => {
        try {
          return toJsonSafe(item, ancestors, String(index));
        } catch {
          return "[Unserializable]";
        }
      });
    }
    // `Object.create(null)`, not `{}`: a data field literally named `__proto__`
    // assigned to a normal object hits the inherited prototype setter and is
    // silently dropped (diverging from the fast JSON.stringify path); a
    // null-prototype object has no such setter, so the key lands as an own
    // enumerable property and JSON.stringify emits it.
    const out: Record<string, unknown> = Object.create(null);
    for (const childKey of Object.keys(value as Record<string, unknown>)) {
      try {
        // Reading the property may itself throw (a getter); keep it isolated.
        const projected = toJsonSafe((value as Record<string, unknown>)[childKey], ancestors, childKey);
        if (projected !== undefined) {
          out[childKey] = projected;
        }
      } catch {
        out[childKey] = "[Unserializable]";
      }
    }
    return out;
  } finally {
    ancestors.delete(value as object);
  }
}

/**
 * `JSON.stringify` that never throws and always yields one parseable JSON value.
 * A {@link LoreError.input} is `unknown`, so a caller can hand us a value that is
 * **circular**, carries a `BigInt`, or has a throwing `toJSON`/getter — and the
 * error path is the last place we can afford a *second* throw (it would mask the
 * original failure with a crash). The fast path is a plain encode; only when it
 * throws do we re-encode through {@link toJsonSafe}, which degrades the offending
 * fields while leaving the envelope's classifiable string fields
 * (`error_type`/`message`/`hint`) intact. Callers pass an object envelope, whose
 * own keys are enumerable, so the walk cannot throw and the result is a string;
 * the inner guard is an absolute last resort for a hostile top-level value.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return JSON.stringify(toJsonSafe(value, new Set()));
    } catch {
      return JSON.stringify("[unserializable]");
    }
  }
}

/**
 * Best-effort single-string message for a non-{@link LoreError} thrown value
 * (the uncaught path). A real `Error` yields its `message` (or its `toString`
 * when the message is empty); a thrown POJO that carries its own diagnostics —
 * e.g. an `{ code, path, message }` rejection — yields its `message` field or,
 * failing that, a JSON projection, rather than the useless `"[object Object]"`
 * that `String()` would produce. All coercion is guarded: deriving the message
 * must never become a second throw on the crash-reporting path (a thrown value
 * may carry a hostile `toString`/`Symbol.toPrimitive`).
 */
function deriveMessage(err: unknown): string {
  try {
    if (err instanceof Error) {
      return typeof err.message === "string" && err.message !== "" ? err.message : String(err);
    }
    if (typeof err === "string") {
      return err;
    }
    if (typeof err === "object" && err !== null) {
      const own = (err as { message?: unknown }).message;
      // Honor an own string `message` even when empty: an empty string is a valid
      // (if unhelpful) message, whereas falling through to safeStringify(err) would
      // dump every other field of the thrown object — leaking internals the thrower
      // deliberately kept out of `message` (e.g. a token) into stderr.
      return typeof own === "string" ? own : safeStringify(err);
    }
    return String(err);
  } catch {
    return "[unstringifiable error]";
  }
}

/**
 * Report a failure on stderr and return its exit code — the one seam every
 * command's catch block uses.
 *
 * - In `--json` mode a {@link LoreError} is written as a one-line
 *   {@link ErrorEnvelope}; otherwise the human diagnostic from
 *   {@link formatErrorText}.
 * - A non-{@link LoreError} value is unexpected: it is reported with
 *   `error_type: "uncaught"` (json) or a plain `error:` line and mapped to
 *   {@link EXIT_UNCAUGHT}, so even a crash exits with a documented code and
 *   clean stderr.
 *
 * stdout is never touched, preserving the "stdout parses or stays silent"
 * invariant. Mode/color are inputs, not resolved here. JSON serialization goes
 * through {@link safeStringify}, so a circular or otherwise non-serializable
 * `input` still yields one parseable envelope instead of throwing on the very
 * path meant to report a failure.
 */
export function reportError(err: unknown, opts: { json: boolean; color?: boolean; stderr?: Writer }): number {
  const stderr = opts.stderr ?? process.stderr;
  if (err instanceof LoreError) {
    if (opts.json) {
      stderr.write(`${safeStringify(toErrorEnvelope(err))}\n`);
    } else {
      stderr.write(`${formatErrorText(err, { color: opts.color })}\n`);
    }
  } else {
    // Single-line per §5.2/§5.4: deriveMessage can yield a multi-line string (an
    // Error.message with embedded newlines), which would otherwise split the
    // uncaught diagnostic across stderr lines.
    const message = singleLine(deriveMessage(err));
    if (opts.json) {
      const envelope: UncaughtEnvelope = { error_type: "uncaught", message };
      stderr.write(`${safeStringify(envelope)}\n`);
    } else {
      stderr.write(`${errorHead(message, opts.color ?? false)}\n`);
    }
  }
  // Single source of truth for the exit code: exitCodeFor maps a LoreError via
  // EXIT_CODES and anything else to EXIT_UNCAUGHT — don't re-derive it inline.
  return exitCodeFor(err);
}

/**
 * Accumulates advisory warnings (unknown OKF `type`, missing `summary`,
 * non-portable link syntax, …). Per cli-contract §4.1 warnings go to stderr and
 * **do not, by themselves, change the exit code**; gate commands
 * (`validate`/`check`) may inspect {@link count}/{@link list} to decide whether
 * to fail with exit `6`.
 */
export class WarningCollector {
  private readonly messages: string[] = [];

  /** Record an advisory warning. */
  add(message: string): void {
    this.messages.push(message);
  }

  /** How many warnings have been collected. */
  get count(): number {
    return this.messages.length;
  }

  /** Whether no warnings have been collected. */
  get isEmpty(): boolean {
    return this.messages.length === 0;
  }

  /** A snapshot copy of the collected warnings, in insertion order. */
  list(): readonly string[] {
    return [...this.messages];
  }

  /**
   * Write each collected warning to stderr as `warning: <message>` and return
   * the number flushed. Color is applied only when `opts.color` is true.
   *
   * This is **non-draining**: it does not clear the collected warnings, so a
   * second `flush` re-emits them and {@link list}/{@link count} stay valid
   * afterward. Gate commands flush exactly once; report a count from
   * {@link count} rather than relying on `flush` to reset.
   */
  flush(opts: { color?: boolean; stderr?: Writer } = {}): number {
    const stderr = opts.stderr ?? process.stderr;
    const color = opts.color ?? false;
    // The painted prefix is loop-invariant — build it once, not once per warning.
    const prefix = paint("warning:", YELLOW, color);
    for (const message of this.messages) {
      stderr.write(`${prefix} ${message}\n`);
    }
    return this.messages.length;
  }
}
