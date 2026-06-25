/**
 * commands/init.ts — `lore init`: scaffold an empty, conformant OKF bundle.
 *
 * This is the thin command layer over the pure {@link buildScaffold} (lore-design
 * §2.2, §3.1): it resolves the repo root and a clock, asks core for the intended
 * bytes, and applies them to the filesystem **idempotently**. All side effects live
 * here; all bytes live in `core/scaffold.ts`.
 *
 * The load-bearing behavior is idempotency (AC#2): every file is created only when
 * **absent** (an atomic `wx` write, so there is no time-of-check/time-of-use race and
 * no clobber of a user's edits), and directories are `mkdir -p` (already-exists is not
 * an error). A first run scaffolds a conformant empty bundle (AC#1); a second run with
 * no intervening change creates nothing and still exits `0`; a run after a partial
 * delete fills only the missing pieces. Existing files are never overwritten — a repo
 * that already has a rich `docs/index.md` keeps it untouched.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildScaffold } from "../core/scaffold";
import { errnoCode, LoreError, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";

/** The result of an `init` run: what was created versus already present, and where. */
export interface InitResult {
  /** The repo root the bundle was initialized in. */
  root: string;
  /** Repo-relative POSIX paths created this run, in scaffold order. */
  created: string[];
  /** Repo-relative POSIX paths that already existed and were left untouched. */
  skipped: string[];
}

/** Options for {@link runInit}; `root`, `clock`, and the streams are injectable for tests. */
export interface InitOptions {
  /** The repo root to initialize. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** Clock seam for the root index timestamp; defaults to the real wall clock. */
  clock?: () => Date;
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
}

/**
 * Run `lore init` against `options.root`: build the scaffold plan from an injected
 * clock and apply it idempotently, then render the result and return the exit code
 * (`0`). A filesystem permission failure throws a `denied` {@link LoreError}; any
 * other unexpected IO error propagates to the CLI's top-level handler.
 */
export function runInit(options: InitOptions): number {
  const clock = options.clock ?? (() => new Date());
  const plan = buildScaffold({ timestamp: clock().toISOString() });

  for (const dir of plan.dirs) {
    ensureDir(join(options.root, dir), dir);
  }

  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of plan.files) {
    if (createIfAbsent(join(options.root, file.path), file.contents, file.path)) {
      created.push(file.path);
    } else {
      skipped.push(file.path);
    }
  }

  emit(initRenderable({ root: options.root, created, skipped }), options.output, options.stdout);
  return 0;
}

/** `mkdir -p` for a scaffold directory, mapping a permission failure to a `denied` error. */
function ensureDir(absPath: string, relPath: string): void {
  try {
    mkdirSync(absPath, { recursive: true });
  } catch (cause) {
    throw ioError(cause, relPath, "create directory");
  }
}

/**
 * Atomically create a file only if it does not exist (`flag: "wx"`), returning `true`
 * when it was created and `false` when it already existed. Using `wx` rather than an
 * `existsSync` precheck closes the TOCTOU window and guarantees the never-clobber
 * contract: a concurrent or pre-existing file is left exactly as it was.
 */
function createIfAbsent(absPath: string, contents: string, relPath: string): boolean {
  try {
    writeFileSync(absPath, contents, { flag: "wx" });
    return true;
  } catch (cause) {
    if (errnoCode(cause) === "EEXIST") {
      return false;
    }
    throw ioError(cause, relPath, "write file");
  }
}

/**
 * Map a filesystem failure to a diagnostic. A permission error (`EACCES`/`EPERM`)
 * becomes a `denied` {@link LoreError} with an actionable hint; anything else is
 * rethrown so a genuinely unexpected IO fault surfaces as an uncaught failure
 * (exit 1, "report this") rather than being mislabeled a user condition.
 */
function ioError(cause: unknown, relPath: string, action: string): unknown {
  const code = errnoCode(cause);
  if (code === "EACCES" || code === "EPERM") {
    return new LoreError(
      "denied",
      `permission denied trying to ${action} ${relPath}`,
      "check write permissions on the bundle directory, then re-run `lore init`",
      { path: relPath, code },
    );
  }
  return cause;
}

/** The per-result-type rendering bundle for `init` (output.ts dispatches on the mode). */
function initRenderable(data: InitResult): Renderable<InitResult> {
  return { kind: "init", data, pretty: renderPretty, plain: renderPlain };
}

// ANSI green for the created marker; emitted only when the resolved mode permits color.
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** Human view: a one-line summary, then the created (and any skipped) paths. */
function renderPretty(data: InitResult, opts: { color: boolean }): string {
  const head = data.created.length
    ? `Initialized lore bundle at ${data.root}`
    : `lore bundle already initialized at ${data.root} (nothing to create)`;
  const lines = [head];
  for (const path of data.created) {
    lines.push(opts.color ? `  ${GREEN}+${RESET} ${path}` : `  + ${path}`);
  }
  for (const path of data.skipped) {
    lines.push(opts.color ? `  ${DIM}· ${path} (exists)${RESET}` : `  · ${path} (exists)`);
  }
  return lines.join("\n");
}

/** ANSI-free, diff-stable view: one `created <path>` / `exists <path>` line each. */
function renderPlain(data: InitResult): string {
  return [...data.created.map((path) => `created ${path}`), ...data.skipped.map((path) => `exists ${path}`)].join("\n");
}
