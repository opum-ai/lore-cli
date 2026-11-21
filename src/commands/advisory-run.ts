/**
 * commands/advisory-run.ts — run one `lore check` / `lore sync` under the clone-wide advisory lock
 * (LCLI-792, DEC-282 items 1-4, (a7) and (a8)), recording its output so a concurrent waiter can
 * replay it instead of recomputing, and — for `sync` — recording a write plan the waiter applies to
 * its OWN checkout.
 *
 * This is the thin, testable seam between the dispatcher (`cli.ts`) and the mechanism in
 * `core/advisory-lock.ts`. The dispatcher supplies the real command as `run`; this module:
 *
 * 1. resolves the git **common** directory (so worktrees of one clone contend on one lock);
 * 2. computes the command's input tree hash ({@link commandInputHash});
 * 3. takes the lock and, for a genuine concurrent waiter whose hash matches the holder's finished
 *    result, replays that result rather than running the command again;
 * 4. otherwise runs the command with a writer that **streams to the real sinks and appends to a
 *    recording as it goes** (DEC-282 (a7) item 1), so the HOLDER's output is byte-identical to an
 *    unlocked run — same order, same stdout/stderr, nothing buffered and nothing lost on Ctrl-C or
 *    SIGTERM — and the recording is published for a waiter to replay byte-for-byte.
 *
 * Reuse is the COMPUTATION only for a write command. `check` is read-only and its result names no
 * absolute path (findings are bundle- or repo-relative: `commands/check.ts`'s `file.path`,
 * `prefixFinding`'s bundle label, `SCHEMAS_DIR`-joined schema paths, and the repo-relative profile
 * path), so its whole output may be replayed from any worktree. `sync` writes files, so its result
 * carries a {@link LockedCommandOptions.plan} that the reusing waiter applies to its OWN checkout;
 * replaying only the bytes would leave the waiter's tree un-synced (the round-1 F3 defect).
 *
 * A non-reusable run — `check --external`, or any injected test seam whose output is a function of
 * the harness rather than of the tree — streams exactly as an unlocked run does and records
 * nothing.
 *
 * When `root` is not a git repository the command runs with no lock or result slot: there is
 * nothing clone-wide to coordinate.
 */

import {
  type AdvisoryBounds,
  type AdvisoryNotice,
  commandInputHash,
  type GitRunner,
  realGitRunner,
  resolveGitCommonDirChecked,
  unlockedMessage,
  withAdvisoryResult,
} from "../core/advisory-lock";
import type { Writer } from "../errors";
import type { OutputContext } from "../output";

/** The lock namespace `check` and `sync` share, so the two commands serialize against each other. */
const SHARED_LOCK_NAME = "check-sync";

/** The captured, replayable result of one command run. */
interface Captured<P> {
  readonly code: number;
  /**
   * Everything the run wrote, in the order it wrote it, as `[stream, chunk]` pairs; empty when the
   * run was not reusable. One ordered list rather than a stdout string and a stderr string, so a
   * replay interleaves the two streams exactly as the holder did (round-2 finding 3: `sync` emits
   * advisories on stderr before its stdout report, and `2>&1` shows the order).
   */
  readonly chunks: readonly (readonly [stream: "stdout" | "stderr", chunk: string])[];
  /**
   * A serialisable plan a reusing waiter must apply to its own checkout before replaying `chunks`.
   * Present only for a write command (`sync`) and only when it was reusable; a read-only command
   * needs none.
   */
  readonly plan?: P;
}

/** The plan sink a command calls while it runs, to hand a reusing waiter its side effects. */
export type RecordPlan<P> = (plan: P) => void;

export interface LockedCommandOptions<P = never> {
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
  /**
   * The command itself, handed the writers to emit through and the sink it calls with a plan a
   * reusing waiter can apply. A read-only command ignores the third argument.
   */
  readonly run: (stdout: Writer, stderr: Writer, recordPlan: RecordPlan<P>) => number | Promise<number>;
  /**
   * Whether a finished result may be reused. `false` still takes the lock (serialization) but never
   * reads or writes a result slot — for a non-deterministic run (`check --external`) or an injected
   * test seam whose output is not a pure function of the on-disk tree.
   */
  readonly reusable: boolean;
  /**
   * Apply a reused result's side effects to THIS checkout, before its recorded output is replayed.
   * Only a write command needs it. It runs UNDER the lock (DEC-282 (a14) Q1) and answers `true` when
   * the checkout now reflects the plan (written, or already equal) and `false` when it does not —
   * a file changed since the holder planned it — in which case reuse is abandoned and this run
   * computes for itself rather than overwrite what is there.
   */
  readonly applyPlan?: (plan: P) => boolean | Promise<boolean>;
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
export function runLockedCommand<P = never>(options: LockedCommandOptions<P>): number | Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const git = options.git ?? realGitRunner;

  const resolved = resolveGitCommonDirChecked(options.root, git);
  if (resolved.kind === "none") {
    return options.run(stdout, stderr, () => undefined);
  }
  if (resolved.kind === "error") {
    // Inside a repository but unable to find its common dir (permissions, `safe.directory`): the
    // run still goes ahead, but says so, exactly as every other unlocked path does (a8 rule 3).
    stderr.write(`${unlockedMessage("cannot resolve the git common directory", new Error(resolved.detail))}\n`);
    return options.run(stdout, stderr, () => undefined);
  }
  return runAgainstLock(options, resolved.dir, stdout, stderr, git);
}

/** The asynchronous half: take the lock, reuse or compute, replay. See {@link runLockedCommand}. */
async function runAgainstLock<P>(
  options: LockedCommandOptions<P>,
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
  const record = options.reusable && inputHash !== null;

  const outcome = await withAdvisoryResult<Captured<P>>({
    commonDir,
    lockName: SHARED_LOCK_NAME,
    resultName: options.command,
    inputHash,
    reusable: record,
    // A holder that waited behind `sync` may be keying a tree those writes changed; let the
    // mechanism rehash once it holds the lock so the result names the tree it was computed against.
    ...(record ? { rehash: hash } : {}),
    compute: () => capture(options.run, stdout, stderr, record),
    // A reused write result is applied here, UNDER the lock, and only if this checkout still holds
    // what the holder planned against; a refusal makes this run compute (DEC-282 (a14) Q1).
    ...(options.applyPlan === undefined
      ? {}
      : {
          adopt: (captured: Captured<P>) =>
            captured.plan === undefined || options.applyPlan === undefined ? true : options.applyPlan(captured.plan),
        }),
    // Exactly the mechanism's advisory lines, and never anything on stdout (DEC-282 (a8) rule 3).
    onNotice: (notice: AdvisoryNotice) => stderr.write(`${notice.message}\n`),
    ...(options.bounds === undefined ? {} : { bounds: options.bounds }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
  });

  const captured = outcome.value;
  // Only a REPLAY is written here: a run this process executed already streamed its output to the
  // real sinks (DEC-282 (a7) item 1), and writing the recording again would duplicate every line.
  if (outcome.reused) flush(captured, stdout, stderr);
  return captured.code;
}

/**
 * Run `run` with writers that stream straight to the real sinks. When `record` is set, each chunk is
 * also appended to the recording, so the holder's output is unchanged AND a waiter can replay it
 * byte-for-byte. When `record` is unset the writers are the real sinks themselves — nothing is
 * buffered for a run that can never be reused.
 *
 * A throw is not caught: the output already reached the real sinks, and nothing is cached (the
 * mechanism writes the slot only after this resolves).
 */
async function capture<P>(
  run: LockedCommandOptions<P>["run"],
  stdout: Writer,
  stderr: Writer,
  record: boolean,
): Promise<Captured<P>> {
  if (!record) {
    const code = await run(stdout, stderr, () => undefined);
    return { code, chunks: [] };
  }
  const chunks: [stream: "stdout" | "stderr", chunk: string][] = [];
  let plan: P | undefined;
  const tee = (sink: Writer, stream: "stdout" | "stderr"): Writer => ({
    write: (chunk) => {
      chunks.push([stream, chunk]);
      sink.write(chunk);
    },
  });
  const code = await run(tee(stdout, "stdout"), tee(stderr, "stderr"), (recorded) => {
    plan = recorded;
  });
  return { code, chunks, ...(plan === undefined ? {} : { plan }) };
}

/** Write a replayed result to the real sinks, chunk by chunk, in the order the holder wrote it. */
function flush(captured: Captured<unknown>, stdout: Writer, stderr: Writer): void {
  for (const [stream, chunk] of captured.chunks) {
    (stream === "stdout" ? stdout : stderr).write(chunk);
  }
}
