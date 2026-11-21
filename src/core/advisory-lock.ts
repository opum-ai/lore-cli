/**
 * core/advisory-lock.ts — a **per-clone advisory lock with reusable results** (LCLI-792, DEC-282
 * items 1-4, (a7) and (a8)).
 *
 * `lore check` and `lore sync` each spawn `quest` subprocesses. On 2026-11-12 four or five
 * concurrent runs multiplied into about 45 quest processes and a load of about 128, enough to shut
 * the fleet down. The fix has two halves, and this module is both:
 *
 * 1. **One lock per clone, not per checkout.** The lock lives under `git rev-parse --git-common-dir`
 *    — the directory every worktree of a clone shares — so two worktrees contend on the SAME lock.
 *    A lock under the checkout (`.lore/…`) would let them run in parallel and reproduce the storm.
 * 2. **A waiter reuses, it does not recompute.** A run that cannot take the lock waits (with a
 *    bound) for the holder to publish a finished result, and if its *input tree hash* matches that
 *    result it returns the holder's value instead of doing the work again.
 *
 * The lock's SHAPE is quest-cli's `src/application/refs/common-dir-lock.ts` (opum-ai/quest-cli#760
 * round 3, APPROVED at `024a2b0c`), ported to this module's synchronous `node:fs` seam: an
 * exclusive-create lock file, an exclusive-create `<lock>.break` file that serialises recovery,
 * and a re-read of the lock under that break file before anything is removed. The two locks are
 * wired the same way so the two CLIs behave alike.
 *
 * ## What "matching tree hashes" means
 *
 * {@link commandInputHash} is the hash of exactly the inputs that decide a `check`/`sync` result:
 *
 * - the command name and its normalized arguments (a different flag is a different result),
 * - the resolved output mode and color (plain/json/pretty are byte-different outputs),
 * - the repository root relative to the git top level (a command run from a subdirectory reads a
 *   different bundle),
 * - `HEAD`'s commit id and committer date (`check --external` aside, `stale_after` and `log.md` are
 *   derived from them),
 * - the working tree's difference from `HEAD` (`git diff HEAD --binary`),
 * - every untracked non-ignored file's path and bytes (`git ls-files --others --exclude-standard`),
 * - the environment inputs that change a run but are not on disk — `LORE_QUEST_TIMEOUT_MS`,
 *   `LORE_QUEST_ACTOR`, `LORE_QUEST_ACTOR_KIND`, `LORE_QUEST_ACCOUNTABLE_HUMAN` and
 *   `LORE_BACKLOG_TIMEOUT_MS` — and lore's own version.
 *
 * That is the whole set of on-disk inputs the two commands can read: unchanged tracked files are
 * pinned by `HEAD`, changed tracked files by the diff, untracked files by content; files git ignores
 * are never read by either command (`core/type-rules.ts`'s `readSource` refuses them and
 * `commands/check.ts` skips them when walking a bundle). A changed byte anywhere in that set changes
 * the hash, so a waiter never reuses a result computed from different inputs.
 *
 * The resolved `quest` **version** is not hashed separately: the pair lock (LCLI-650) accepts
 * exactly lore's own version and refuses every other, so the only quest version under which a run
 * can produce a cacheable (successful) result is `VERSION`, and that IS hashed. A mismatched pair
 * throws, and a throw is never cached.
 *
 * ## Worktrees and the root
 *
 * The hash keys the root RELATIVE to the git top level, not the top level itself. Two worktrees of
 * one clone with identical trees therefore share a result — which is correct, because the
 * computation is a pure function of those inputs. What differs is where the result LANDED, and
 * `commands/advisory-run.ts` handles that: a `sync` result carries a write plan a reusing waiter
 * applies to its OWN checkout, and a `check` result names no absolute path at all (its findings are
 * bundle- or repo-relative), so replaying its bytes anywhere is byte-identical.
 *
 * ## A result is only reused by a WAITER
 *
 * Reuse requires the holder to have finished **after this caller started** (`finishedAt >
 * startedAt`). That is the definition of a waiter: a caller that was already contending when the
 * holder was running. A later run that merely finds a stale result file is NOT a waiter — it starts
 * after the holder finished, recomputes, and (for `sync`) still performs its writes, so a tree that
 * was reverted back to an already-cached state is never left un-synced.
 *
 * ## Bounded recovery — the numbers (DEC-282 (a8))
 *
 * A stale holder must never block a waiter forever. Recovery is bounded by these exported constants
 * (all overridable per call for tests):
 *
 * - {@link ADVISORY_POLL_MS} = 50 ms — how often a waiter retries the lock / result slot.
 * - {@link ADVISORY_HEARTBEAT_MS} = 2 s — a live holder rewrites `updatedAt` this often, so a
 *   legitimately long run is never mistaken for a dead one.
 * - {@link ADVISORY_BREAK_STALE_MS} = 10 s — a `.break` file whose readable pid is gone, and whose
 *   age is past this, is cleared by the next breaker.
 * - {@link ADVISORY_PID_GONE_FLOOR_MS} = 30 s — the dead-pid rule needs the file to be at least this
 *   old, so a create interrupted before its body lands is treated as mid-write, not abandoned.
 * - {@link ADVISORY_STALE_MS} = 10 min — a lock from ANOTHER host, or one whose owner cannot be
 *   read, is stale past this age alone. It is quest-cli's `staleAfterMs`, kept equal on purpose.
 * - {@link ADVISORY_MAX_WAIT_MS} = stale + 60 s (11 min) — the wait is deliberately sized PAST the
 *   stale backstop, so a holder is released or broken before any waiter's wait ends and expiry is
 *   reachable only in a pathological state.
 *
 * Dead-pid detection is the common case and needs none of that: a same-host lock whose recorded
 * `pid` is not alive (and which is past the floor) is broken on the next poll.
 *
 * **Same host, live pid: never stolen by age (F2).** A heartbeat is a `setInterval` on the same
 * event loop as the work, and a synchronous stretch (a schema pass, a bundle load, a `spawnSync`)
 * can starve it far past any stale bound. Age is therefore consulted only for a record this host
 * cannot prove anything about — another host, an unreadable body, or a pid that cannot be probed.
 * A live-but-wedged holder is left to the wait bound (a8's pathological expiry), never stolen from.
 * The recorded `processStartIdentity` is diagnostic only: it is never compared against the live
 * process, so a reused pid reads alive and is treated as a live holder.
 *
 * **One deliberate divergence from quest-cli's own staleness rule.** quest's `isSnapshotStale`
 * makes a lock older than `staleAfterMs` stale WHATEVER its pid says. Here a same-host live pid is
 * never stolen by age, because that would let a starved heartbeat cost a running holder its lock
 * (this PR's review finding F2). Everything else — the numbers, the break-file protocol and its
 * age-only escape, the re-read-before-unlink, the fail-open paths — is the same shape, so the two
 * CLIs behave alike except exactly where lore's longer, `spawn`-heavy runs require it.
 *
 * ## Recovery is serialised, and nothing is parked or restored
 *
 * Judging a lock stale and removing it are two steps, and anything between them can replace what is
 * at the lock path. This module therefore never renames the lock aside: a breaker takes
 * `<lock>.break` with `openSync(…, "wx")`, re-reads the lock UNDER that file, and unlinks it only
 * if its bytes still match the snapshot that was judged stale — which is exactly "the same owner
 * and the same `updatedAt`", plus every other byte of the record. While the stale lock is still at
 * the path nobody can create over it, and breakers are serialised by the break file, so the
 * ordinary race — two waiters both judging one dead holder stale — cannot produce two holders. The
 * heartbeat and the release re-verify under the break file too, so a holder that already lost its
 * lock never overwrites or deletes a successor's record.
 *
 * **Recovery does NOT promise it "never moves a live holder's file".** A breaker that stalls for
 * longer than {@link ADVISORY_STALE_MS} between its locked re-read and its unlink has its `.break`
 * file cleared by age alone (a wedged breaker must not disable recovery forever), and a later
 * breaker may then unlink a successor's fresh lock. That yields two concurrent holders and one
 * duplicated computation, accepted because the lock is advisory. No token is re-checked between the
 * re-read and the unlink: adding one would reintroduce the gap this protocol exists to close.
 *
 * ## Two residuals, accepted because this lock is advisory
 *
 * (1) A stalled breaker can produce two holders, as described above.
 * (2) **Release is read-then-unlink**, past the age backstop or with a reused pid, so a holder's
 * release can delete a successor's lock. Either residual's worst cost is one duplicated
 * computation. Nothing correctness-critical depends on this lock.
 *
 * Staleness rests on the wall clock (N4): a backward jump can delay recovery, a forward jump hasten
 * it. For an advisory lock whose worst cost is duplicated work, that is acceptable. The WAIT
 * deadline is read from a monotonic seam instead ({@link AdvisoryResultOptions.elapsed}), so no
 * wall-clock adjustment can turn a bounded wait into an unbounded one.
 *
 * ## Failing open (DEC-282 (a8))
 *
 * The lock is advisory in the strict sense: a run that cannot coordinate still runs. Two paths do
 * this, and each writes exactly ONE advisory line (via {@link AdvisoryResultOptions.onNotice}),
 * nothing to stdout, with the exit code and JSON shapes untouched:
 *
 * - a wait that expires past {@link ADVISORY_MAX_WAIT_MS} on a holder nothing could recover, and
 * - a broken mechanism — an uncreatable/unwritable lock directory, or any errno other than `EEXIST`
 *   from the lock or break file (`EACCES`, `EISDIR`, `ENOSPC`, …).
 *
 * A separate, distinct line is emitted once while waiting, so a long silent wait never reads as a
 * hang.
 *
 * ## Portability (the repo's CI has a windows-latest leg)
 *
 * Only portable primitives are used: an exclusive-create lock file (`openSync(path, "wx")`) holding
 * JSON (`pid`, `hostname`, a start identity, timestamps) — no `flock`, no advisory file locks, no
 * `O_EXLOCK`. Atomic publish of the result uses write-temp-then-rename, which is atomic enough on
 * every supported filesystem for a read to see either the old or the new file, never a torn one.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname as osHostname } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { errnoCode } from "../errors";
import { VERSION } from "../meta";

/** How often a waiter re-checks the lock and the result slot. */
export const ADVISORY_POLL_MS = 50;
/** How often a live holder refreshes its lock's `updatedAt`. */
export const ADVISORY_HEARTBEAT_MS = 2_000;
/** A break file past this age whose pid is readable and gone may be cleared. */
export const ADVISORY_BREAK_STALE_MS = 10_000;
/** The dead-pid rule needs a lock at least this old; younger reads as mid-write. */
export const ADVISORY_PID_GONE_FLOOR_MS = 30_000;
/** A lock from another host, or an unreadable one, is stale past this age alone. */
export const ADVISORY_STALE_MS = 600_000;
/** The margin by which the wait exceeds {@link ADVISORY_STALE_MS} (DEC-282 (a8) rule 1). */
export const ADVISORY_WAIT_MARGIN_MS = 60_000;
/** Hard wait bound; past it the run proceeds unlocked. Sized past the stale backstop on purpose. */
export const ADVISORY_MAX_WAIT_MS = ADVISORY_STALE_MS + ADVISORY_WAIT_MARGIN_MS;

/** The recovery bounds, each overridable per call (tests move the clock instead of sleeping). */
export interface AdvisoryBounds {
  readonly pollMs: number;
  readonly heartbeatMs: number;
  readonly breakStaleMs: number;
  readonly pidGoneFloorMs: number;
  readonly staleMs: number;
  readonly maxWaitMs: number;
}

/** The default bounds, exported so callers and tests read the real numbers rather than copies. */
export const ADVISORY_BOUNDS: AdvisoryBounds = Object.freeze({
  pollMs: ADVISORY_POLL_MS,
  heartbeatMs: ADVISORY_HEARTBEAT_MS,
  breakStaleMs: ADVISORY_BREAK_STALE_MS,
  pidGoneFloorMs: ADVISORY_PID_GONE_FLOOR_MS,
  staleMs: ADVISORY_STALE_MS,
  maxWaitMs: ADVISORY_MAX_WAIT_MS,
});

/**
 * The environment variables hashed into the reuse key. They change what a run does without
 * changing a byte on disk. The names are re-declared here (rather than imported from
 * `adapters/…`) so this core module does not depend on an adapter; `test/advisory-lock.test.ts`
 * asserts each one equals the adapter's own exported constant, so the two cannot drift.
 */
export const ADVISORY_QUEST_TIMEOUT_ENV = "LORE_QUEST_TIMEOUT_MS";
export const ADVISORY_QUEST_ACTOR_ENV = "LORE_QUEST_ACTOR";
export const ADVISORY_QUEST_ACTOR_KIND_ENV = "LORE_QUEST_ACTOR_KIND";
export const ADVISORY_QUEST_ACCOUNTABLE_HUMAN_ENV = "LORE_QUEST_ACCOUNTABLE_HUMAN";
export const ADVISORY_BACKLOG_TIMEOUT_ENV = "LORE_BACKLOG_TIMEOUT_MS";

/** Every environment input the reuse key hashes, in a stable order. */
export const ADVISORY_ENV_INPUTS: readonly string[] = Object.freeze([
  ADVISORY_QUEST_TIMEOUT_ENV,
  ADVISORY_QUEST_ACTOR_ENV,
  ADVISORY_QUEST_ACTOR_KIND_ENV,
  ADVISORY_QUEST_ACCOUNTABLE_HUMAN_ENV,
  ADVISORY_BACKLOG_TIMEOUT_ENV,
]);

/** An advisory line the mechanism wants the caller to write to stderr. */
export interface AdvisoryNotice {
  /** `"waiting"` is emitted once while waiting; `"unlocked"` once when coordination is abandoned. */
  readonly kind: "waiting" | "unlocked";
  /** A complete, single-line sentence (no trailing newline). */
  readonly message: string;
}

/** One `git` invocation's outcome. A non-zero status is carried, not thrown. */
export interface GitResult {
  readonly ok: boolean;
  readonly stdout: string;
}

/** The injectable `git` seam: run `args` with `cwd` set to `root`. */
export type GitRunner = (root: string, args: readonly string[]) => GitResult;

/**
 * The real transport: `Bun.spawnSync`, the same sync shell `core/cross-ref.ts` and
 * `adapters/git.ts` use. Never throws — a missing `git` or a non-zero exit is `{ ok: false }`, which
 * callers treat as "cannot lock this run" / "cannot compute a tree hash", never as a command error.
 */
export const realGitRunner: GitRunner = (root, args) => {
  try {
    const proc = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    return { ok: (proc.exitCode ?? 1) === 0, stdout: proc.stdout.toString() };
  } catch {
    return { ok: false, stdout: "" };
  }
};

/**
 * The git **common** directory for `root`: `.git` in a normal checkout, and the shared `.git`
 * directory in a linked worktree — the whole point of LCLI-792. Returns absolute, or `null` when
 * `root` is not inside a git repository (or `git` is unavailable), in which case callers run
 * without a lock/reuse.
 */
export function resolveGitCommonDir(root: string, git: GitRunner = realGitRunner): string | null {
  const result = git(root, ["rev-parse", "--git-common-dir"]);
  if (!result.ok) return null;
  const dir = result.stdout.trim();
  if (dir === "") return null;
  // Canonicalize: git reports a worktree's common dir as an absolute real path while a plain
  // checkout gets `.git` relative to the (possibly symlinked) root. Realpath makes every worktree
  // of one clone resolve to the SAME string, which is what sharing the lock depends on.
  return canonicalPath(isAbsolute(dir) ? resolve(dir) : resolve(root, dir));
}

/** `realpathSync`, falling back to the input when the path does not exist (or is unreadable). */
function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** The directory this module keeps its lock files and result slots in, under the git common dir. */
export function advisoryDir(commonDir: string): string {
  return join(commonDir, "lore", "advisory");
}

/** The lock file path for `lockName` under `commonDir`. Exported so tests can assert the location. */
export function advisoryLockPath(commonDir: string, lockName: string): string {
  return join(advisoryDir(commonDir), `${lockName}.lock`);
}

/** The breaker-serialising file path for `commonDir`. Exported for tests. */
export function advisoryBreakPath(commonDir: string, lockName: string): string {
  return `${advisoryLockPath(commonDir, lockName)}.break`;
}

/** The reusable-result slot path for `resultName` under `commonDir`. Exported for tests. */
export function advisoryResultPath(commonDir: string, resultName: string): string {
  return join(advisoryDir(commonDir), `${resultName}.result.json`);
}

/** The options for {@link commandInputHash}; everything that decides a check/sync result. */
export interface CommandInputOptions {
  /** The checkout root the command resolves `docs/` (and anything else) against. */
  readonly root: string;
  /** The command name, e.g. `"check"` or `"sync"`. */
  readonly command: string;
  /** The command's normalized arguments (flags and positionals, in order). */
  readonly args: readonly string[];
  /** The resolved output mode; the same tree renders differently per mode. */
  readonly mode: string;
  /** Whether stdout color is allowed; pretty output differs with it. */
  readonly stdoutColor: boolean;
  /** Whether stderr color is allowed; the captured advisories differ with it. */
  readonly stderrColor: boolean;
  /** The git seam; defaults to {@link realGitRunner}. */
  readonly git?: GitRunner;
  /** Environment seam; defaults to `process.env`. */
  readonly env?: Record<string, string | undefined>;
}

/**
 * The tree hash of everything that decides a `check`/`sync` result (see the module header).
 * Returns `null` when git cannot describe the tree (not a repository, `git` unavailable), which
 * callers must treat as "do not reuse" rather than as "no changes".
 */
export function commandInputHash(options: CommandInputOptions): string | null {
  const git = options.git ?? realGitRunner;
  const env = options.env ?? process.env;
  const root = canonicalPath(resolve(options.root));

  const top = git(root, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return null;
  const toplevel = canonicalPath(resolve(top.stdout.trim()));
  if (toplevel === "") return null;
  const relRoot = relative(toplevel, root).split("\\").join("/");

  const head = git(toplevel, ["rev-parse", "HEAD"]);
  const headSha = head.ok ? head.stdout.trim() : "";
  const date = git(toplevel, ["show", "-s", "--format=%cI", "HEAD"]);
  const headDate = date.ok ? date.stdout.trim() : "";
  // `HEAD` absent on an unborn branch: diff against the empty tree is what `git diff HEAD` refuses,
  // so treat "no HEAD" as "every tracked file is the tree" by hashing the index instead.
  const diffArgs =
    headSha === ""
      ? ["diff", "--cached", "--binary", "--no-color", "--no-ext-diff", "--no-textconv"]
      : ["diff", "HEAD", "--binary", "--no-color", "--no-ext-diff", "--no-textconv"];
  const diff = git(toplevel, diffArgs);
  if (!diff.ok) return null;
  const untracked = git(toplevel, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (!untracked.ok) return null;

  const hash = createHash("sha256");
  const field = (name: string, value: string): void => {
    hash.update(`${name}\0${value}\0`);
  };
  field("domain", "lore-advisory-input/2");
  field("lore", VERSION);
  field("command", options.command);
  field("args", options.args.join("\0"));
  field("mode", options.mode);
  field("stdout-color", options.stdoutColor ? "1" : "0");
  field("stderr-color", options.stderrColor ? "1" : "0");
  field("root", relRoot);
  field("head", headSha);
  field("date", headDate);
  field("diff", diff.stdout);
  for (const name of ADVISORY_ENV_INPUTS) {
    field(`env:${name}`, env[name] ?? "");
  }
  for (const path of untrackedPaths(untracked.stdout)) {
    field("untracked-path", path);
    field("untracked-bytes", fileDigest(join(toplevel, path)));
  }
  return hash.digest("hex");
}

/** `git ls-files -z` output → the non-empty, NUL-separated repo-relative paths. */
function untrackedPaths(stdout: string): string[] {
  return stdout.split("\0").filter((path) => path !== "");
}

/** A file's content digest, or a stable marker when it is missing / not a regular file. */
function fileDigest(path: string): string {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return stat.isSymbolicLink() ? "symlink" : "not-a-file";
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return "missing";
  }
}

/** The on-disk lock record. */
interface LockRecord {
  readonly schema: 1;
  readonly owner: string;
  readonly pid: number;
  readonly hostname: string;
  /** Diagnostic only: never compared against the live process (see the module header). */
  readonly processStartIdentity: string | null;
  /** Wall-clock epoch ms when the lock was taken. */
  readonly acquiredAt: number;
  /** Wall-clock epoch ms of the last heartbeat; staleness is measured from here. */
  readonly updatedAt: number;
}

/** The on-disk result slot. */
interface ResultSlot<T> {
  readonly schema: 1;
  readonly inputHash: string;
  readonly finishedAt: number;
  readonly value: T;
}

/** The observable lifecycle of a lock file. */
export type LockState = "none" | "active" | "stale";

/** One read of a lock or break file: the exact bytes, the parsed record (if any), and its mtime. */
interface LockSnapshot {
  /** The exact bytes read; recovery verifies which file it judged by comparing them. */
  readonly raw: string;
  /** Parsed owner, or `null` when the file is empty / partial / corrupt. */
  readonly record: LockRecord | null;
  /** Modification time, the age fallback for an unparseable (partial) file. */
  readonly mtimeMs: number;
}

export interface AdvisoryResultOptions<T> {
  /** The git common directory (see {@link resolveGitCommonDir}). */
  readonly commonDir: string;
  /** The lock namespace. `check` and `sync` share one (`check-sync`) so they serialize together. */
  readonly lockName: string;
  /** The result-slot namespace; distinct per command so `check` never reuses a `sync` report. */
  readonly resultName: string;
  /** The tree hash at entry (see {@link commandInputHash}); `null` disables reuse but still takes the lock. */
  readonly inputHash: string | null;
  /**
   * Recompute the tree hash once the lock is held. A holder that had to WAIT may be looking at a
   * tree the prior holder changed, so the result must be keyed by the tree it is actually computed
   * against, not by the one it entered on. Defaults to reusing {@link inputHash} (correct when the
   * caller acquired immediately). Used for the result key and the post-acquire reuse check; the
   * while-waiting reuse check always uses the entry hash.
   */
  readonly rehash?: () => string | null;
  /** When false the lock still serializes, but no result is read or written. */
  readonly reusable: boolean;
  /** The work to do while holding the lock. */
  readonly compute: () => Promise<T> | T;
  /**
   * Advisory lines the mechanism wants written to stderr. `"waiting"` fires at most once, when the
   * caller starts waiting; `"unlocked"` fires at most once, when the caller abandons coordination
   * (DEC-282 (a8)). Never written to stdout.
   */
  readonly onNotice?: (notice: AdvisoryNotice) => void;
  /** Overrides for the bounds. */
  readonly bounds?: Partial<AdvisoryBounds>;
  /** Clock seam; defaults to `Date.now`. */
  readonly now?: () => number;
  /** Pid seam for this process; defaults to `process.pid`. */
  readonly pid?: number;
  /** Hostname seam; defaults to `os.hostname()`. */
  readonly hostname?: string;
  /** This process's start identity; defaults to the same shape the lock writer uses. */
  readonly processStartIdentity?: string | null;
  /** Liveness seam for a recorded pid on this host; defaults to a `kill(pid, 0)` probe. */
  readonly isProcessAlive?: (pid: number) => boolean;
  /** Sleep seam; defaults to a real `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * MONOTONIC seam for the WAIT DEADLINE, defaults to `performance.now()`. Deliberately separate
   * from {@link now}: the wall clock ages a lock (N4) while the wait bound must never be frozen or
   * stepped by a wall-clock adjustment, so a bounded wait stays bounded.
   */
  readonly elapsed?: () => number;
  /**
   * TEST SEAM: runs after a lock is judged stale and before anything is removed — the window a
   * competing breaker can act in.
   */
  readonly afterStaleJudgement?: () => Promise<void> | void;
  /**
   * TEST SEAM: runs under the break file, after the lock was re-read and still matched, and before
   * it is removed. The lock path must still be occupied here; a second breaker is refused by the
   * break file and by nothing else.
   */
  readonly afterLockedReread?: () => Promise<void> | void;
}

/** What {@link withAdvisoryResult} did. */
export interface AdvisoryResultOutcome<T> {
  /** The computed or reused value. */
  readonly value: T;
  /** `true` when a waiter returned another run's finished result instead of computing. */
  readonly reused: boolean;
  /** `true` when this caller had to wait for the lock at least one poll. */
  readonly waited: boolean;
  /** `true` when the wait bound expired or the mechanism failed, and it computed unlocked. */
  readonly forced: boolean;
}

/** Everything a call needs that is fixed once its options are resolved. */
interface CallContext {
  readonly bounds: AdvisoryBounds;
  readonly now: () => number;
  readonly pid: number;
  readonly host: string;
  readonly identity: string | null;
  readonly isAlive: (pid: number) => boolean;
  readonly sleep: (ms: number) => Promise<void>;
  readonly elapsed: () => number;
  readonly lockPath: string;
  readonly breakPath: string;
  readonly notice: (notice: AdvisoryNotice) => void;
  readonly afterStaleJudgement?: () => Promise<void> | void;
  readonly afterLockedReread?: () => Promise<void> | void;
}

/**
 * Run `compute()` under the clone-wide advisory lock, and — when `reusable` — let a concurrent
 * waiter reuse the holder's finished result instead of recomputing it.
 *
 * The call returns `{ value, reused, waited, forced }`; it never throws for lock contention (only
 * what `compute` itself throws). A crashed holder is recovered by dead-pid detection; a holder on
 * another host (or one whose record cannot be read) by the age backstop; a same-host live holder is
 * never stolen from and is left to the wait bound, after which this caller computes unlocked
 * (DEC-282 (a8)). A broken lock mechanism likewise proceeds unlocked.
 */
export async function withAdvisoryResult<T>(options: AdvisoryResultOptions<T>): Promise<AdvisoryResultOutcome<T>> {
  const bounds: AdvisoryBounds = { ...ADVISORY_BOUNDS, ...options.bounds };
  const ctx: CallContext = {
    bounds,
    now: options.now ?? (() => Date.now()),
    pid: options.pid ?? process.pid,
    host: options.hostname ?? osHostname(),
    identity:
      options.processStartIdentity === undefined
        ? processStartIdentity(options.pid ?? process.pid)
        : options.processStartIdentity,
    isAlive: options.isProcessAlive ?? defaultIsProcessAlive,
    sleep: options.sleep ?? realSleep,
    elapsed: options.elapsed ?? (() => performance.now()),
    lockPath: advisoryLockPath(options.commonDir, options.lockName),
    breakPath: advisoryBreakPath(options.commonDir, options.lockName),
    notice: onceNotices(options.onNotice),
    afterStaleJudgement: options.afterStaleJudgement,
    afterLockedReread: options.afterLockedReread,
  };
  const reusable = options.reusable && options.inputHash !== null;
  const startedAt = ctx.now();
  let waited = false;
  let lastOwner: string | null | undefined;
  // The deadline is measured on the MONOTONIC seam: a wall-clock step must not turn a bounded wait
  // into an unbounded one. `holderSince` resets whenever the holder's owner changes (F4), so the
  // bound applies per wedged holder rather than to a queue position.
  const startedWaitingAt = ctx.elapsed();
  let holderSince = startedWaitingAt;

  const dir = advisoryDir(options.commonDir);
  const resultPath = advisoryResultPath(options.commonDir, options.resultName);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (cause) {
    return unlock(ctx, cause, `cannot create ${dir}`, () => options.compute(), waited);
  }
  sweepResidue(dir, ctx.now(), bounds.staleMs);

  const owner = randomBytes(16).toString("hex");
  /** A finished result this caller was waiting for: it must key exactly `hash` and be newer than our start. */
  const readReusable = (hash: string | null): T | undefined => {
    if (!reusable || hash === null) return undefined;
    const slot = readResult<T>(resultPath);
    if (slot === undefined) return undefined;
    return slot.inputHash === hash && slot.finishedAt > startedAt ? slot.value : undefined;
  };

  for (;;) {
    const reuse = readReusable(options.inputHash);
    if (reuse !== undefined) {
      return { value: reuse, reused: true, waited, forced: false };
    }

    const created = tryCreateLock(ctx, {
      schema: 1,
      owner,
      pid: ctx.pid,
      hostname: ctx.host,
      processStartIdentity: ctx.identity,
      acquiredAt: ctx.now(),
      updatedAt: ctx.now(),
    });
    if (created.kind === "error") {
      // The git common dir is not writable here (or the lock path is a directory, etc.): there is
      // nothing to coordinate with, so do the work now rather than waiting out a bound for a lock
      // that can never be taken (DEC-282 (a8) rule 2).
      return unlock(ctx, created.cause, `cannot create ${ctx.lockPath}`, () => options.compute(), waited);
    }
    if (created.kind === "created") {
      // Keyed by the tree the work is actually done against. If this caller had to wait, a prior
      // holder may have changed the tree since it entered, so rehash while the lock is held.
      const keyHash = reusable ? (options.rehash === undefined ? options.inputHash : options.rehash()) : null;
      const heartbeat = startHeartbeat(ctx, owner);
      try {
        const late = readReusable(keyHash);
        if (late !== undefined) {
          return { value: late, reused: true, waited, forced: false };
        }
        const value = await options.compute();
        if (reusable && keyHash !== null) {
          writeResult(resultPath, { schema: 1, inputHash: keyHash, finishedAt: ctx.now(), value });
        }
        return { value, reused: false, waited, forced: false };
      } finally {
        clearInterval(heartbeat);
        releaseLock(ctx, owner);
      }
    }

    const snapshot = readLockSnapshot(ctx.lockPath);
    if (snapshot === null) {
      // The lock vanished between our create attempt and our read; whoever removed it may be about
      // to create. Retry after a poll rather than spin.
      await ctx.sleep(bounds.pollMs);
      continue;
    }

    // F4: reset the deadline when the holder's owner changes, so the bound applies per wedged
    // holder rather than to a queue position.
    const holderOwner = snapshot.record?.owner ?? null;
    if (holderOwner !== lastOwner) {
      lastOwner = holderOwner;
      holderSince = ctx.elapsed();
    }

    if (isLockSnapshotStale(snapshot, ctx)) {
      const broken = await breakStaleLock(ctx, snapshot);
      if (broken === "broke") continue;
      if (broken !== "wait") {
        return unlock(
          ctx,
          broken.cause,
          `cannot break the stale lock at ${ctx.lockPath}`,
          () => options.compute(),
          waited,
        );
      }
    }

    if (ctx.elapsed() - holderSince >= bounds.maxWaitMs) {
      // A holder nothing could recover must not block forever (DEC-282 (a8) rule 1).
      return unlock(ctx, undefined, expiryCause(ctx, snapshot), () => options.compute(), waited);
    }

    if (!waited) {
      waited = true;
      ctx.notice({ kind: "waiting", message: waitingMessage(ctx, snapshot) });
    }
    await ctx.sleep(bounds.pollMs);
  }
}

/** Dedupe the notices: at most one per kind, whatever the loop does. */
function onceNotices(sink: ((notice: AdvisoryNotice) => void) | undefined): (notice: AdvisoryNotice) => void {
  const seen = new Set<AdvisoryNotice["kind"]>();
  return (notice) => {
    if (seen.has(notice.kind)) return;
    seen.add(notice.kind);
    sink?.(notice);
  };
}

/** Run the work without coordination, after exactly one advisory line naming the cause (a8 rule 3). */
async function unlock<T>(
  ctx: CallContext,
  cause: unknown,
  what: string,
  compute: () => Promise<T> | T,
  waited: boolean,
): Promise<AdvisoryResultOutcome<T>> {
  const code = cause === undefined ? "" : ` (${describeCause(cause)})`;
  ctx.notice({
    kind: "unlocked",
    message: `${what}${code}: continuing without the check/sync lock and running unlocked; concurrent runs may duplicate work`,
  });
  return { value: await compute(), reused: false, waited, forced: true };
}

/** A short, single-line description of an errno-shaped failure. */
function describeCause(cause: unknown): string {
  const code = errnoCode(cause);
  const message = cause instanceof Error ? cause.message : String(cause);
  return code === undefined ? message : `${code}: ${message}`;
}

/** The line emitted once when a caller starts waiting (distinct from the unlocked line, a8). */
function waitingMessage(ctx: CallContext, snapshot: LockSnapshot): string {
  const holder = describeHolder(snapshot, ctx);
  return `waiting for another lore check/sync run to finish (${holder}); this run proceeds without the lock if that run is not released or broken within ${seconds(ctx.bounds.maxWaitMs)}`;
}

/** The cause named by the expiry line, including the break file's state and the remedy. */
function expiryCause(ctx: CallContext, snapshot: LockSnapshot): string {
  return `waited ${seconds(ctx.bounds.maxWaitMs)} and ${describeHolder(snapshot, ctx)} still holds the lock; ${describeBreakState(ctx)}`;
}

/** A one-clause description of a lock snapshot's holder. */
function describeHolder(snapshot: LockSnapshot, ctx: CallContext): string {
  if (snapshot.record === null) return "an unreadable holder record";
  const age = snapshotAge(snapshot, ctx.now());
  const alive =
    snapshot.record.hostname === ctx.host
      ? `, pid ${snapshot.record.pid} ${ctx.isAlive(snapshot.record.pid) ? "alive" : "gone"}`
      : `, host ${snapshot.record.hostname}`;
  return `holder ${snapshot.record.owner.slice(0, 12)}${alive}, last heard from ${seconds(age)} ago`;
}

/**
 * The `.break` state, for the expiry line: absent is transient contention, a live breaker is mid-
 * recovery, and an unreadable breaker is cleared by age alone (N1). Names the manual remedy too.
 */
function describeBreakState(ctx: CallContext): string {
  const snapshot = readLockSnapshot(ctx.breakPath);
  if (snapshot === null) {
    return `no break file exists at ${ctx.breakPath}`;
  }
  const age = seconds(snapshotAge(snapshot, ctx.now()));
  if (snapshot.record !== null && ctx.isAlive(snapshot.record.pid)) {
    return `a break file at ${ctx.breakPath} is held by live pid ${snapshot.record.pid} (written ${age} ago), so a breaker is mid-recovery — it is cleared automatically once past the ${seconds(ctx.bounds.staleMs)} age backstop`;
  }
  if (snapshot.record !== null) {
    return `a break file at ${ctx.breakPath} is held by pid ${snapshot.record.pid}, which is not running (written ${age} ago) — it is cleared once older than ${seconds(ctx.bounds.breakStaleMs)}, or at ${seconds(ctx.bounds.staleMs)} whatever its pid`;
  }
  return `a break file at ${ctx.breakPath} exists and its holder cannot be read (written ${age} ago) — it is cleared automatically once older than ${seconds(ctx.bounds.staleMs)}; to clear it by hand, remove it only when no breaker is running`;
}

/** `120000` → `"120s"`. */
function seconds(milliseconds: number): string {
  return `${Math.round(milliseconds / 1000)}s`;
}

/** What {@link tryCreateLock} did. */
type CreateOutcome =
  | { readonly kind: "created" }
  | { readonly kind: "exists" }
  | { readonly kind: "error"; readonly cause: unknown };

/** Create the lock exclusively, cleaning up after a failed body write rather than stranding an empty lock. */
function tryCreateLock(ctx: CallContext, record: LockRecord): CreateOutcome {
  let descriptor: number;
  try {
    descriptor = openSync(ctx.lockPath, "wx", 0o600);
  } catch (cause) {
    if (errnoCode(cause) !== "EEXIST") return { kind: "error", cause };
    // `wx` against an existing DIRECTORY reports EEXIST on this platform and EISDIR on another.
    // Either way there is no lock file here to contend with: the mechanism is broken, so the run
    // proceeds unlocked (DEC-282 (a8) rule 2) rather than polling an unreadable path forever.
    return isUnusableLockPath(ctx.lockPath) ? { kind: "error", cause } : { kind: "exists" };
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf8");
  } catch (cause) {
    closeQuietly(descriptor);
    unlinkQuietly(ctx.lockPath);
    return { kind: "error", cause };
  }
  try {
    closeSync(descriptor);
  } catch (cause) {
    unlinkQuietly(ctx.lockPath);
    return { kind: "error", cause };
  }
  return { kind: "created" };
}

/** A held break file. `release` is idempotent and token-checked. */
interface BreakHandle {
  readonly token: string;
}

/**
 * Whether a lock file is absent, live, or stale. Exported and used by the tests.
 *
 * Same host with a probeable pid: alive is ALWAYS active, whatever the age (F2); dead is stale once
 * the record is past {@link ADVISORY_PID_GONE_FLOOR_MS}. Anything this host cannot prove — another
 * host's record, an unreadable body — is judged by age alone against `staleMs`.
 */
export function inspectLock(
  path: string,
  options: {
    readonly now: number;
    readonly hostname: string;
    readonly isAlive: (pid: number) => boolean;
    readonly staleMs: number;
    readonly pidGoneFloorMs?: number;
  },
): LockState {
  const snapshot = readLockSnapshot(path);
  if (snapshot === null) return "none";
  return isLockSnapshotStale(snapshot, {
    now: () => options.now,
    host: options.hostname,
    isAlive: options.isAlive,
    bounds: { staleMs: options.staleMs, pidGoneFloorMs: options.pidGoneFloorMs ?? ADVISORY_PID_GONE_FLOOR_MS },
  })
    ? "stale"
    : "active";
}

/** The staleness rule; see {@link inspectLock} and the module header. */
function isLockSnapshotStale(
  snapshot: LockSnapshot,
  ctx: {
    readonly now: () => number;
    readonly host: string;
    readonly isAlive: (pid: number) => boolean;
    readonly bounds: Pick<AdvisoryBounds, "staleMs" | "pidGoneFloorMs">;
  },
): boolean {
  const age = snapshotAge(snapshot, ctx.now());
  const record = snapshot.record;
  if (
    record !== null &&
    record.hostname === ctx.host &&
    record.owner !== "" &&
    Number.isSafeInteger(record.pid) &&
    record.pid > 0
  ) {
    if (ctx.isAlive(record.pid)) return false;
    return age > ctx.bounds.pidGoneFloorMs;
  }
  // Another host, an unprovable identity, or an unreadable body: the only signal is age.
  return age > (record === null ? ctx.bounds.pidGoneFloorMs : ctx.bounds.staleMs);
}

/**
 * The `.break` staleness rule (N1, ported from quest-cli):
 *
 * 1. older than `staleMs` → clear whatever its body or pid says (age-only backstop);
 * 2. otherwise an unreadable body is KEPT (it may be a breaker mid-write);
 * 3. otherwise older than `breakStaleMs` AND its pid is gone → clear.
 *
 * An advisory lock's worst case is duplicated work, so a wedged breaker costs at most `staleMs`
 * rather than disabling recovery forever.
 */
function isBreakSnapshotStale(
  snapshot: LockSnapshot,
  ctx: {
    readonly now: () => number;
    readonly isAlive: (pid: number) => boolean;
    readonly bounds: Pick<AdvisoryBounds, "staleMs" | "breakStaleMs">;
  },
): boolean {
  const age = snapshotAge(snapshot, ctx.now());
  if (age > ctx.bounds.staleMs) return true;
  if (snapshot.record === null) return false;
  if (age <= ctx.bounds.breakStaleMs) return false;
  return !ctx.isAlive(snapshot.record.pid);
}

/** `true` when something that is not a regular file (a directory, a symlink) occupies `path`. */
function isUnusableLockPath(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return !stat.isFile() || stat.isSymbolicLink();
  } catch {
    // Vanished between the failed create and this check: the caller's next attempt decides.
    return false;
  }
}

/** Read a lock or break file and then its stat; `null` when it is absent. */
function readLockSnapshot(path: string): LockSnapshot | null {
  let raw: string;
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      // Not a regular file: treat its age as its mtime and its body as unreadable.
      return { raw: "", record: null, mtimeMs: stat.mtimeMs };
    }
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let mtimeMs: number;
  try {
    mtimeMs = lstatSync(path).mtimeMs;
  } catch {
    return null;
  }
  return { raw, record: parseLockRecord(raw), mtimeMs };
}

/** The age of a snapshot: its last heartbeat, or the file's mtime when the body is unreadable. */
function snapshotAge(snapshot: LockSnapshot, nowMs: number): number {
  return nowMs - (snapshot.record?.updatedAt ?? snapshot.mtimeMs);
}

/**
 * Take `<lock>.break` exclusively. Returns a handle on success, or `null` when a live or
 * not-yet-aged breaker holds it. Throws on any other filesystem failure, which the caller turns
 * into "proceed unlocked" (a8 rule 2).
 */
function takeBreakFile(ctx: CallContext): BreakHandle | null {
  const record: LockRecord = {
    schema: 1,
    owner: randomBytes(16).toString("hex"),
    pid: ctx.pid,
    hostname: ctx.host,
    processStartIdentity: ctx.identity,
    acquiredAt: ctx.now(),
    updatedAt: ctx.now(),
  };
  let descriptor: number;
  try {
    descriptor = openSync(ctx.breakPath, "wx", 0o600);
  } catch (cause) {
    if (errnoCode(cause) !== "EEXIST") throw cause;
    // Same EEXIST/EISDIR split as the lock itself: a directory (or symlink) where the break file
    // belongs is a broken mechanism, not a breaker to wait for.
    if (isUnusableLockPath(ctx.breakPath)) throw cause;
    const existing = readLockSnapshot(ctx.breakPath);
    if (existing !== null && isBreakSnapshotStale(existing, ctx)) {
      // Check-then-unlink residual, recorded not closed (as in quest-cli's own lock): two clearers
      // can race for an aged breaker's file and a loser's unlink can hit the winner's fresh file.
      unlinkSync(ctx.breakPath);
    }
    return null;
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf8");
  } catch (cause) {
    closeQuietly(descriptor);
    unlinkQuietly(ctx.breakPath);
    throw cause;
  }
  try {
    closeSync(descriptor);
  } catch (cause) {
    unlinkQuietly(ctx.breakPath);
    throw cause;
  }
  return { token: record.owner };
}

/** Clear a break file only while this call still owns it. */
function releaseBreakFile(ctx: CallContext, handle: BreakHandle): void {
  const current = readLockSnapshot(ctx.breakPath);
  if (current?.record?.owner !== handle.token) return;
  unlinkQuietly(ctx.breakPath);
}

/** What {@link breakStaleLock} did. */
type BreakOutcome = "broke" | "wait" | { readonly kind: "error"; readonly cause: unknown };

/**
 * Break a stale lock, serialised through the break file. `observed` is the snapshot the caller
 * already read and judged stale; it is re-read under the break file and removed only if its bytes
 * still match, so a holder that replaced it in the meantime is never touched.
 *
 * Returns `"broke"` only when this call removed the judged lock.
 */
function breakStaleLock(ctx: CallContext, observed: LockSnapshot): Promise<BreakOutcome> {
  if (!isLockSnapshotStale(observed, ctx)) return Promise.resolve("wait");
  return breakStaleLockUnderBreak(ctx, observed);
}

/** The body of {@link breakStaleLock}, split out only so the staleness check stays synchronous. */
async function breakStaleLockUnderBreak(ctx: CallContext, observed: LockSnapshot): Promise<BreakOutcome> {
  await ctx.afterStaleJudgement?.();
  let mine: BreakHandle | null;
  try {
    mine = takeBreakFile(ctx);
  } catch (cause) {
    return { kind: "error", cause };
  }
  if (mine === null) return "wait";
  try {
    const current = readLockSnapshot(ctx.lockPath);
    if (current === null || current.raw !== observed.raw) return "wait";
    await ctx.afterLockedReread?.();
    try {
      unlinkSync(ctx.lockPath);
    } catch (cause) {
      if (errnoCode(cause) !== "ENOENT") return { kind: "error", cause };
    }
    return "broke";
  } finally {
    // Best-effort, like quest-cli's own release: an unremovable break file must not mask the
    // outcome of the recovery, and the age backstop clears it later anyway.
    try {
      releaseBreakFile(ctx, mine);
    } catch {
      // Leave it to the age backstop.
    }
  }
}

/**
 * Refresh the lock's `updatedAt` while the holder is alive, so a long-but-healthy run is never
 * stolen — and so a holder that lost its lock to a breaker never overwrites the successor's record.
 * The beat re-verifies under the break file: a beat that cannot take it is a missed beat, and the
 * staleness bound is the backstop.
 */
function startHeartbeat(ctx: CallContext, owner: string): ReturnType<typeof setInterval> {
  return setInterval(() => {
    let mine: BreakHandle | null = null;
    try {
      mine = takeBreakFile(ctx);
      if (mine === null) return;
      const current = readLockSnapshot(ctx.lockPath)?.record;
      if (current === null || current === undefined || current.owner !== owner) return;
      const refreshed: LockRecord = { ...current, updatedAt: ctx.now() };
      const temporary = `${ctx.lockPath}.${owner}.tmp`;
      try {
        writeFileSync(temporary, `${JSON.stringify(refreshed)}\n`, "utf8");
        renameSync(temporary, ctx.lockPath);
      } catch {
        unlinkQuietly(temporary);
      }
    } catch {
      // A failed heartbeat is a missed beat, not an error; the staleness bound is the backstop.
    } finally {
      if (mine !== null) {
        try {
          releaseBreakFile(ctx, mine);
        } catch {
          // Leave it to the age backstop.
        }
      }
    }
  }, ctx.bounds.heartbeatMs);
}

/** Remove the lock, but only if this process still owns it — re-verified under the break file. */
function releaseLock(ctx: CallContext, owner: string): void {
  let mine: BreakHandle | null;
  try {
    mine = takeBreakFile(ctx);
  } catch {
    // Cannot serialise the release: leave the lock to the dead-pid/age backstop rather than risk
    // deleting a successor's file.
    return;
  }
  if (mine === null) return;
  try {
    const current = readLockSnapshot(ctx.lockPath);
    if (current?.record?.owner !== owner) return;
    unlinkQuietly(ctx.lockPath);
  } finally {
    try {
      releaseBreakFile(ctx, mine);
    } catch {
      // Leave it to the age backstop.
    }
  }
}

/** Read a result slot, or `undefined` when absent / unreadable / malformed. */
function readResult<T>(path: string): ResultSlot<T> | undefined {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value !== "object" || value === null) return undefined;
    const slot = value as Record<string, unknown>;
    if (slot.schema !== 1 || typeof slot.inputHash !== "string" || typeof slot.finishedAt !== "number")
      return undefined;
    return value as ResultSlot<T>;
  } catch {
    return undefined;
  }
}

/** Publish a result atomically (write temp, rename), private to the user like the lock. */
function writeResult<T>(path: string, slot: ResultSlot<T>): void {
  const temporary = `${path}.${slot.inputHash.slice(0, 12)}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(slot)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, path);
  } catch {
    unlinkQuietly(temporary);
  }
}

/**
 * Best-effort removal of abandonment residue: temp files left by a killed writer, and `.stale.*`
 * asides left by a pre-(a7) version of this module. Anything younger than the stale bound may be a
 * live writer's, so it is left alone. Mutates nothing else and never throws.
 */
function sweepResidue(dir: string, nowMs: number, staleMs: number): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.endsWith(".tmp") && !name.includes(".stale.")) continue;
    const path = join(dir, name);
    try {
      const stat = lstatSync(path);
      if (stat.isFile() && nowMs - stat.mtimeMs > staleMs) unlinkSync(path);
    } catch {
      // Best effort.
    }
  }
}

/** Parse a body, returning `null` for anything that is not a complete lock record. */
function parseLockRecord(raw: string): LockRecord | null {
  try {
    const value: unknown = JSON.parse(raw);
    return isLockRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isLockRecord(value: unknown): value is LockRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schema === 1 &&
    typeof record.owner === "string" &&
    typeof record.pid === "number" &&
    typeof record.hostname === "string" &&
    (record.processStartIdentity === null || typeof record.processStartIdentity === "string") &&
    typeof record.acquiredAt === "number" &&
    typeof record.updatedAt === "number"
  );
}

/** `closeSync`, swallowing a double-close style failure. */
function closeQuietly(descriptor: number): void {
  try {
    closeSync(descriptor);
  } catch {
    // Already closed.
  }
}

/** `unlinkSync`, swallowing everything (the caller's next step decides). */
function unlinkQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Best effort.
  }
}

/** The start identity shape a lock record carries for the current process (diagnostic only). */
function processStartIdentity(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (pid !== process.pid) return null;
  return `pid:${pid}:started:${Math.floor(Date.now() - process.uptime() * 1_000)}`;
}

/** `kill(pid, 0)` liveness: ESRCH means gone; any other failure is treated conservatively as alive. */
function defaultIsProcessAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return errnoCode(cause) !== "ESRCH";
  }
}

function realSleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
