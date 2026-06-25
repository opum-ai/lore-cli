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

import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildScaffold } from "../core/scaffold";
import { ANSI, EXIT_OK, errnoCode, LoreError, paint, type Writer } from "../errors";
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
  return EXIT_OK;
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
      // Something already occupies the path. A regular file is the normal idempotent
      // case (never-clobber: leave the user's file exactly as-is, report it skipped).
      // A directory, symlink, or other non-regular entry is a structural conflict —
      // surface it instead of reporting a malformed bundle as a clean, exit-0 re-run.
      if (existingIsRegularFile(absPath)) {
        return false;
      }
      throw conflictError(relPath);
    }
    throw ioError(cause, relPath, "write file");
  }
}

/**
 * Whether the entry already at `absPath` is a regular file. Uses `lstat` (does not
 * follow symlinks), so a symlink occupying a scaffold path is treated as the
 * non-regular conflict it is rather than silently honored via its target. A failing
 * stat — the entry vanished in a concurrent race after the `wx` EEXIST — degrades to
 * `true` so init reports a benign skip instead of crashing on a self-resolving race.
 */
function existingIsRegularFile(absPath: string): boolean {
  try {
    return lstatSync(absPath).isFile();
  } catch {
    return true;
  }
}

/**
 * Map a filesystem failure to a diagnostic. A permission error (`EACCES`/`EPERM`)
 * becomes a `denied` {@link LoreError}; a file occupying a path lore needs as a
 * directory (`EEXIST` on `mkdir`) or a file sitting on an ancestor segment (`ENOTDIR`)
 * becomes a `conflict` {@link LoreError}. Both carry an actionable hint. Anything else
 * is rethrown so a genuinely unexpected IO fault surfaces as an uncaught failure
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
  if (code === "EEXIST" || code === "ENOTDIR") {
    return conflictError(relPath, code);
  }
  return cause;
}

/** A `conflict` {@link LoreError}: a non-regular file blocks a path the scaffold must create. */
function conflictError(relPath: string, code?: string): LoreError {
  return new LoreError(
    "conflict",
    `cannot initialize ${relPath}: a conflicting file already exists where lore needs to create it`,
    "remove or rename the conflicting entry, then re-run `lore init`",
    code ? { path: relPath, code } : { path: relPath },
  );
}

/** The per-result-type rendering bundle for `init` (output.ts dispatches on the mode). */
function initRenderable(data: InitResult): Renderable<InitResult> {
  return { kind: "init", data, pretty: renderPretty, plain: renderPlain };
}

/** Human view: a one-line summary, then the created (and any skipped) paths. */
function renderPretty(data: InitResult, opts: { color: boolean }): string {
  const head = data.created.length
    ? `Initialized lore bundle at ${data.root}`
    : `lore bundle already initialized at ${data.root} (nothing to create)`;
  const lines = [head];
  for (const path of data.created) {
    lines.push(`  ${paint("+", ANSI.green, opts.color)} ${path}`);
  }
  for (const path of data.skipped) {
    lines.push(`  ${paint(`· ${path} (exists)`, ANSI.dim, opts.color)}`);
  }
  return lines.join("\n");
}

/** ANSI-free, diff-stable view: one `created <path>` / `exists <path>` line each. */
function renderPlain(data: InitResult): string {
  return [...data.created.map((path) => `created ${path}`), ...data.skipped.map((path) => `exists ${path}`)].join("\n");
}
