/**
 * core/advisory-lock.ts — a **per-clone advisory lock with reusable results** (LCLI-792, DEC-282
 * item 2).
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
 * - the working tree's difference from `HEAD` (`git diff HEAD --binary`), and
 * - every untracked non-ignored file's path and bytes (`git ls-files --others --exclude-standard`).
 *
 * That is the whole set of on-disk inputs the two commands can read: unchanged tracked files are
 * pinned by `HEAD`, changed tracked files by the diff, untracked files by content; files git ignores
 * are never read by either command (`core/type-rules.ts`'s `readSource` refuses them and
 * `commands/check.ts` skips them when walking a bundle). A changed byte anywhere in that set changes
 * the hash, so a waiter never reuses a result computed from different inputs.
 *
 * ## A result is only reused by a WAITER
 *
 * Reuse requires the holder to have finished **after this caller started** (`finishedAt >
 * startedAt`). That is the definition of a waiter: a caller that was already contending when the
 * holder was running. A later run that merely finds a stale result file is NOT a waiter — it starts
 * after the holder finished, recomputes, and (for `sync`) still performs its writes, so a tree that
 * was reverted back to an already-cached state is never left un-synced.
 *
 * ## Bounded recovery — the numbers
 *
 * A stale holder must never block a waiter forever. Recovery is bounded by four exported constants
 * (all overridable per call for tests):
 *
 * - {@link ADVISORY_POLL_MS} = 50 ms — how often a waiter retries the lock / result slot.
 * - {@link ADVISORY_HEARTBEAT_MS} = 2 s — a live holder rewrites `updatedAt` this often, so a
 *   legitimately long run is never mistaken for a dead one.
 * - {@link ADVISORY_STALE_MS} = 15 s — a lock with no heartbeat for this long is stale and is
 *   stolen. 15 s is 7.5 missed heartbeats: long enough to ride out a paused process, short enough
 *   to recover quickly.
 * - {@link ADVISORY_MAX_WAIT_MS} = 120 s — the hard cap on how long a waiter waits before it gives
 *   up and computes without the lock. This is the "never blocks forever" backstop for a holder
 *   that is alive (so its heartbeat keeps firing) but wedged; it is deliberately longer than any
 *   healthy `check`/`sync` (the pre-LCLI-791 measurement was 83 s at 574 tasks, before the list
 *   read made that path cheaper).
 *
 * Dead-pid detection recovers the common case immediately: a lock whose recorded `pid` is not alive
 * on this host is stolen on the next poll, without waiting for the staleness window. A lock from a
 * different host cannot be pid-checked portably, so it falls back to the heartbeat/staleness bound.
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
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname as osHostname } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { errnoCode } from "../errors";
import { VERSION } from "../meta";

/** How often a waiter re-checks the lock and the result slot. */
export const ADVISORY_POLL_MS = 50;
/** How often a live holder refreshes its lock's `updatedAt`. */
export const ADVISORY_HEARTBEAT_MS = 2_000;
/** A lock with no heartbeat for this long is stale and may be stolen. */
export const ADVISORY_STALE_MS = 15_000;
/** Hard cap on a waiter's wait; after this it computes without the lock. */
export const ADVISORY_MAX_WAIT_MS = 120_000;

/** The four bounds, each overridable per call (tests move the clock instead of sleeping). */
export interface AdvisoryBounds {
  readonly pollMs: number;
  readonly heartbeatMs: number;
  readonly staleMs: number;
  readonly maxWaitMs: number;
}

/** The default bounds, exported so callers and tests read the real numbers rather than copies. */
export const ADVISORY_BOUNDS: AdvisoryBounds = Object.freeze({
  pollMs: ADVISORY_POLL_MS,
  heartbeatMs: ADVISORY_HEARTBEAT_MS,
  staleMs: ADVISORY_STALE_MS,
  maxWaitMs: ADVISORY_MAX_WAIT_MS,
});

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
}

/**
 * The tree hash of everything that decides a `check`/`sync` result (see the module header).
 * Returns `null` when git cannot describe the tree (not a repository, `git` unavailable), which
 * callers must treat as "do not reuse" rather than as "no changes".
 */
export function commandInputHash(options: CommandInputOptions): string | null {
  const git = options.git ?? realGitRunner;
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
  field("domain", "lore-advisory-input/1");
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
  /** Overrides for the four bounds. */
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
}

/** What {@link withAdvisoryResult} did. */
export interface AdvisoryResultOutcome<T> {
  /** The computed or reused value. */
  readonly value: T;
  /** `true` when a waiter returned another run's finished result instead of computing. */
  readonly reused: boolean;
  /** `true` when this caller had to wait for the lock at least one poll. */
  readonly waited: boolean;
  /** `true` when the hard {@link AdvisoryBounds.maxWaitMs} cap expired and it computed unlocked. */
  readonly forced: boolean;
}

/**
 * Run `compute()` under the clone-wide advisory lock, and — when `reusable` — let a concurrent
 * waiter reuse the holder's finished result instead of recomputing it.
 *
 * The call returns `{ value, reused, waited, forced }`; it never throws for lock contention (only
 * what `compute` itself throws). A stale holder is recovered by dead-pid detection or by the
 * heartbeat/staleness bound; a holder that is alive but wedged is bounded by `maxWaitMs`, after
 * which this caller computes without the lock rather than blocking forever.
 */
export async function withAdvisoryResult<T>(options: AdvisoryResultOptions<T>): Promise<AdvisoryResultOutcome<T>> {
  const bounds: AdvisoryBounds = { ...ADVISORY_BOUNDS, ...options.bounds };
  const now = options.now ?? (() => Date.now());
  const pid = options.pid ?? process.pid;
  const host = options.hostname ?? osHostname();
  const identity =
    options.processStartIdentity === undefined ? processStartIdentity(pid) : options.processStartIdentity;
  const isAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const sleep = options.sleep ?? realSleep;
  const reusable = options.reusable && options.inputHash !== null;
  const startedAt = now();

  const dir = advisoryDir(options.commonDir);
  const lockPath = advisoryLockPath(options.commonDir, options.lockName);
  const resultPath = advisoryResultPath(options.commonDir, options.resultName);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    // A directory we cannot create means no clone-wide coordination here; fall through to compute.
    return { value: await options.compute(), reused: false, waited: false, forced: true };
  }

  const owner = randomBytes(16).toString("hex");
  /** A finished result this caller was waiting for: it must key exactly `hash` and be newer than our start. */
  const readReusable = (hash: string | null): T | undefined => {
    if (!reusable || hash === null) return undefined;
    const slot = readResult<T>(resultPath);
    if (slot === undefined) return undefined;
    return slot.inputHash === hash && slot.finishedAt > startedAt ? slot.value : undefined;
  };

  let waited = false;
  const deadline = startedAt + bounds.maxWaitMs;

  for (;;) {
    const reuse = readReusable(options.inputHash);
    if (reuse !== undefined) {
      return { value: reuse, reused: true, waited, forced: false };
    }

    const created = tryCreateLock(lockPath, {
      schema: 1,
      owner,
      pid,
      hostname: host,
      processStartIdentity: identity,
      acquiredAt: now(),
      updatedAt: now(),
    });
    if (created === "error") {
      // The git common dir is not writable here: there is nothing to coordinate with, so do the
      // work now rather than waiting out the bound for a lock that can never be taken.
      const value = await options.compute();
      return { value, reused: false, waited, forced: true };
    }
    if (created === "created") {
      // Keyed by the tree the work is actually done against. If this caller had to wait, a prior
      // holder may have changed the tree since it entered, so rehash while the lock is held.
      const keyHash = reusable ? (options.rehash === undefined ? options.inputHash : options.rehash()) : null;
      const heartbeat = startHeartbeat(lockPath, owner, now, bounds.heartbeatMs);
      try {
        const late = readReusable(keyHash);
        if (late !== undefined) {
          return { value: late, reused: true, waited, forced: false };
        }
        const value = await options.compute();
        if (reusable && keyHash !== null) {
          writeResult(resultPath, { schema: 1, inputHash: keyHash, finishedAt: now(), value });
        }
        return { value, reused: false, waited, forced: false };
      } finally {
        clearInterval(heartbeat);
        releaseLock(lockPath, owner);
      }
    }

    if (inspectLock(lockPath, { now: now(), hostname: host, isAlive, staleMs: bounds.staleMs }) === "stale") {
      stealLock(lockPath, owner);
      continue;
    }

    if (now() >= deadline) {
      // Hard cap: a live-but-wedged holder must not block forever. Compute unlocked rather than hang.
      const value = await options.compute();
      return { value, reused: false, waited, forced: true };
    }

    waited = true;
    await sleep(bounds.pollMs);
  }
}

/** Create the lock exclusively: `"created"`, `"exists"` (another owner), or `"error"` (unusable dir). */
function tryCreateLock(path: string, record: LockRecord): "created" | "exists" | "error" {
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx", 0o600);
  } catch (cause) {
    return errnoCode(cause) === "EEXIST" ? "exists" : "error";
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf8");
  } finally {
    closeSync(descriptor);
  }
  return "created";
}

/**
 * Whether a lock file is absent, live, or stale. Dead-pid detection is only trusted for a record
 * written on THIS host with a well-formed start-identity; a lock from another host (or a corrupt
 * one) is judged by its heartbeat age, with the file's mtime as the age when the record is
 * unreadable.
 */
export function inspectLock(
  path: string,
  options: {
    readonly now: number;
    readonly hostname: string;
    readonly isAlive: (pid: number) => boolean;
    readonly staleMs: number;
  },
): LockState {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch {
    return "none";
  }
  const record = readLockRecord(path);
  const updatedAt = record?.updatedAt ?? stat.mtimeMs;
  if (
    record !== null &&
    record.hostname === options.hostname &&
    record.owner !== "" &&
    isProofCapableIdentity(record)
  ) {
    if (!options.isAlive(record.pid)) {
      return "stale";
    }
  }
  return options.now - updatedAt > options.staleMs ? "stale" : "active";
}

/** `true` when the record names a pid this host can probe and a start identity in the frozen shape. */
function isProofCapableIdentity(record: LockRecord): boolean {
  return (
    record.processStartIdentity !== null &&
    new RegExp(`^pid:${record.pid}:started:\\d+$`).test(record.processStartIdentity)
  );
}

/** Read and validate a lock record, or `null` when it is missing / unreadable / malformed. */
function readLockRecord(path: string): LockRecord | null {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
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

/**
 * Refresh the lock's `updatedAt` while the holder is alive, so a long-but-healthy run is never
 * stolen. A holder that no longer owns the file (it was stolen) stops touching it. The interval is
 * cleared in the holder's `finally`.
 */
function startHeartbeat(path: string, owner: string, now: () => number, heartbeatMs: number) {
  return setInterval(() => {
    const record = readLockRecord(path);
    if (record === null || record.owner !== owner) return;
    const refreshed: LockRecord = { ...record, updatedAt: now() };
    try {
      const temporary = `${path}.${owner}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(refreshed)}\n`, "utf8");
      renameSync(temporary, path);
    } catch {
      // A failed heartbeat is a missed beat, not an error; the staleness bound is the backstop.
    }
  }, heartbeatMs);
}

/** Remove the lock, but only if this process still owns it. */
function releaseLock(path: string, owner: string): void {
  const record = readLockRecord(path);
  if (record?.owner !== owner) return;
  try {
    unlinkSync(path);
  } catch (cause) {
    if (errnoCode(cause) !== "ENOENT") {
      // A lock we cannot remove expires by staleness; do not mask the caller's real work with it.
    }
  }
}

/** Rename a stale lock out of the way so the next create can succeed. */
function stealLock(path: string, owner: string): void {
  const aside = `${path}.stale.${owner}`;
  try {
    renameSync(path, aside);
    try {
      unlinkSync(aside);
    } catch {
      // Leaving the aside file is harmless; it is never consulted.
    }
  } catch {
    // ENOENT: someone else released or stole it first; the caller's next create attempt decides.
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

/** Publish a result atomically (write temp, rename). */
function writeResult<T>(path: string, slot: ResultSlot<T>): void {
  const temporary = `${path}.${slot.inputHash.slice(0, 12)}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(slot)}\n`, "utf8");
    renameSync(temporary, path);
  } catch {
    try {
      unlinkSync(temporary);
    } catch {
      // best effort
    }
  }
}

/** The start identity shape a lock record carries for the current process. */
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
