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
export const EXIT_CODES: Readonly<Record<ErrorType, number>> = {
  usage: 2,
  not_found: 3,
  denied: 4,
  conflict: 5,
  validation: 6,
  drift: 6,
};

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
 * Project a {@link LoreError} onto its `--json` error envelope. `hint` and
 * `input` are omitted when absent, keeping the emitted object minimal; the field
 * order matches the contract example.
 */
export function toErrorEnvelope(err: LoreError): ErrorEnvelope {
  const envelope: ErrorEnvelope = { error_type: err.type, message: err.message };
  if (err.hint !== undefined) {
    envelope.hint = err.hint;
  }
  if (err.input !== undefined) {
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
 * Render a {@link LoreError} as a human diagnostic for stderr: a single
 * `error: <message>` line plus, when present, a `hint: <hint>` line
 * (cli-contract §5.4). Color is applied only when `opts.color` is true; the
 * caller (output.ts) owns the TTY/`NO_COLOR` decision.
 */
export function formatErrorText(err: LoreError, opts: { color?: boolean } = {}): string {
  const color = opts.color ?? false;
  const head = `${paint("error:", RED, color)} ${err.message}`;
  if (err.hint === undefined) {
    return head;
  }
  return `${head}\n${paint("hint:", DIM, color)} ${err.hint}`;
}

/** A minimal write sink — `process.stderr` satisfies it, and tests inject a fake. */
export interface Writer {
  write(s: string): void;
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
 * invariant. Mode/color are inputs, not resolved here.
 */
export function reportError(err: unknown, opts: { json: boolean; color?: boolean; stderr?: Writer }): number {
  const stderr = opts.stderr ?? process.stderr;
  if (err instanceof LoreError) {
    if (opts.json) {
      stderr.write(`${JSON.stringify(toErrorEnvelope(err))}\n`);
    } else {
      stderr.write(`${formatErrorText(err, { color: opts.color })}\n`);
    }
    return EXIT_CODES[err.type];
  }

  const message = err instanceof Error ? err.message : String(err);
  if (opts.json) {
    stderr.write(`${JSON.stringify({ error_type: "uncaught", message })}\n`);
  } else {
    stderr.write(`${paint("error:", RED, opts.color ?? false)} ${message}\n`);
  }
  return EXIT_UNCAUGHT;
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
   */
  flush(opts: { color?: boolean; stderr?: Writer } = {}): number {
    const stderr = opts.stderr ?? process.stderr;
    const color = opts.color ?? false;
    for (const message of this.messages) {
      stderr.write(`${paint("warning:", YELLOW, color)} ${message}\n`);
    }
    return this.messages.length;
  }
}
