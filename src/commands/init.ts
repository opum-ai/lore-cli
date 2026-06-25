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

import { join } from "node:path";
import { loadProfile } from "../core/profile";
import { buildScaffold } from "../core/scaffold";
import { ANSI, EXIT_OK, paint, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { createIfAbsent, ensureDir } from "./fswrite";

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
  // Honor a pre-existing `.lore/profile.toml` so `init` scaffolds schemas for a project's custom
  // types; with none present this is the built-in story-convention profile (zero-config).
  const profile = loadProfile({ root: options.root });
  const plan = buildScaffold({ timestamp: clock().toISOString(), profile });

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
