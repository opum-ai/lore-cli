/**
 * commands/advisory-run.ts — run one `lore check` / `lore sync` under the clone-wide advisory lock
 * (LCLI-792, DEC-282 item 2), capturing its output so a concurrent waiter can replay the holder's
 * result instead of recomputing it.
 *
 * This is the thin, testable seam between the dispatcher (`cli.ts`) and the mechanism in
 * `core/advisory-lock.ts`. The dispatcher supplies the real command as `run`; this module:
 *
 * 1. resolves the git **common** directory (so worktrees of one clone contend on one lock);
 * 2. computes the command's input tree hash ({@link commandInputHash});
 * 3. takes the lock and, for a genuine concurrent waiter whose hash matches the holder's finished
 *    result, replays that result's stdout/stderr/exit code rather than running the command again;
 * 4. otherwise captures the command's output into buffers, publishes it, and flushes it.
 *
 * Capturing is what makes the result replayable: both commands write everything they emit through
 * the `Writer`s they are handed, so handing them buffering `Writer`s captures stdout and stderr
 * exactly as they would have appeared. On a thrown error the partial buffers are flushed before the
 * error propagates (so an emitted report is never lost) and nothing is cached.
 *
 * When `root` is not a git repository — or the caller passes `reusable: false` — the command still
 * runs, just without a lock/result slot; there is nothing clone-wide to coordinate.
 */

import {
  type AdvisoryBounds,
  commandInputHash,
  type GitRunner,
  realGitRunner,
  resolveGitCommonDir,
  withAdvisoryResult,
} from "../core/advisory-lock";
import type { Writer } from "../errors";
import type { OutputContext } from "../output";

/** The lock namespace `check` and `sync` share, so the two commands serialize against each other. */
const SHARED_LOCK_NAME = "check-sync";

/** The captured, replayable result of one command run. */
interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface LockedCommandOptions {
  /** The repository root the command resolves against. */
  readonly root: string;
  /** Which command this is; also its result-slot namespace. */
  readonly command: "check" | "sync";
  /** The command's normalized arguments, part of the input hash. */
  readonly args: readonly string[];
  /** The resolved output mode/color, part of the input hash (plain and json differ byte-for-byte). */
  readonly output: OutputContext;
  /** stdout sink; defaults to `process.stdout`. */
  readonly stdout?: Writer;
  /** stderr sink; defaults to `process.stderr`. */
  readonly stderr?: Writer;
  /** The command itself, handed the buffering writers to emit through. */
  readonly run: (stdout: Writer, stderr: Writer) => number | Promise<number>;
  /**
   * Whether a finished result may be reused. `false` still takes the lock (serialization) but never
   * reads or writes a result slot — for a non-deterministic run (`check --external`) or an injected
   * test seam whose output is not a pure function of the on-disk tree.
   */
  readonly reusable: boolean;
  /** The git seam; defaults to {@link realGitRunner}. */
  readonly git?: GitRunner;
  /** Bound overrides (tests move the clock rather than sleeping). */
  readonly bounds?: Partial<AdvisoryBounds>;
  /** Clock seam; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Sleep seam; defaults to a real `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Run `options.run` under the clone-wide advisory lock, reusing a concurrent holder's finished
 * result when the input tree hash matches. Returns the command's exit code — synchronously when
 * `root` is not a git repository (nothing to coordinate), which keeps a non-repository invocation's
 * existing sync-or-async shape, and as a `Promise` when it takes the lock.
 */
export function runLockedCommand(options: LockedCommandOptions): number | Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const git = options.git ?? realGitRunner;

  const commonDir = resolveGitCommonDir(options.root, git);
  if (commonDir === null) {
    return options.run(stdout, stderr);
  }
  return runAgainstLock(options, commonDir, stdout, stderr, git);
}

/** The asynchronous half: take the lock, reuse or compute, flush. See {@link runLockedCommand}. */
async function runAgainstLock(
  options: LockedCommandOptions,
  commonDir: string,
  stdout: Writer,
  stderr: Writer,
  git: GitRunner,
): Promise<number> {
  const hash = (): string | null =>
    commandInputHash({
      root: options.root,
      command: options.command,
      args: options.args,
      mode: options.output.mode,
      stdoutColor: options.output.stdoutColor ?? options.output.color,
      stderrColor: options.output.color,
      git,
    });
  const inputHash = options.reusable ? hash() : null;

  const outcome = await withAdvisoryResult<Captured>({
    commonDir,
    lockName: SHARED_LOCK_NAME,
    resultName: options.command,
    inputHash,
    reusable: options.reusable && inputHash !== null,
    // A holder that waited behind `sync` may be keying a tree those writes changed; let the
    // mechanism rehash once it holds the lock so the result names the tree it was computed against.
    ...(options.reusable ? { rehash: hash } : {}),
    compute: () => capture(options.run, stdout, stderr),
    ...(options.bounds === undefined ? {} : { bounds: options.bounds }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
  });

  flush(outcome.value, stdout, stderr);
  return outcome.value.code;
}

/** Run `run` with buffering writers; on a throw, flush what was emitted and rethrow (uncached). */
async function capture(run: LockedCommandOptions["run"], stdout: Writer, stderr: Writer): Promise<Captured> {
  let out = "";
  let err = "";
  const outWriter: Writer = { write: (chunk) => (out += chunk) };
  const errWriter: Writer = { write: (chunk) => (err += chunk) };
  try {
    const code = await run(outWriter, errWriter);
    return { code, stdout: out, stderr: err };
  } catch (cause) {
    flush({ code: 1, stdout: out, stderr: err }, stdout, stderr);
    throw cause;
  }
}

/** Write a captured result to the real sinks, preserving the original stream split. */
function flush(captured: Captured, stdout: Writer, stderr: Writer): void {
  if (captured.stdout !== "") stdout.write(captured.stdout);
  if (captured.stderr !== "") stderr.write(captured.stderr);
}
