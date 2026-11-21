/**
 * LCLI-792 (DEC-282 item 2): the clone-wide advisory lock in `core/advisory-lock.ts`.
 *
 * Every test here is about the MECHANISM, not wall time:
 * - the lock lives in the git COMMON dir, so a main checkout and a linked worktree share it;
 * - two concurrent callers with the same tree hash produce ONE compute and ONE reuse;
 * - a changed tree hash does not reuse;
 * - a stale holder (dead pid, or a stale heartbeat) is recovered rather than hanging;
 * - a live-but-wedged holder is bounded by the hard maximum wait;
 * - `commandInputHash` changes when any input that decides a check/sync result changes.
 *
 * No test sleeps on a real bound: the clock and the sleep seam are injected, so the recovery
 * numbers are asserted as behaviour rather than waited out.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADVISORY_HEARTBEAT_MS,
  ADVISORY_MAX_WAIT_MS,
  ADVISORY_POLL_MS,
  ADVISORY_STALE_MS,
  advisoryDir,
  advisoryLockPath,
  advisoryResultPath,
  commandInputHash,
  inspectLock,
  resolveGitCommonDir,
  withAdvisoryResult,
} from "../src/core/advisory-lock";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-792-lock-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run git in `cwd`, returning the sync subprocess (tests never assert on its exit alone). */
function git(cwd: string, ...args: string[]) {
  return Bun.spawnSync(["git", "-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
}

function gitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  expect(git(dir, "init", "--initial-branch=main").exitCode).toBe(0);
  writeFileSync(join(dir, "README.md"), "hello\n");
  expect(git(dir, "add", "-A").exitCode).toBe(0);
  expect(git(dir, "commit", "-m", "init").exitCode).toBe(0);
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A monotonic injected clock so `finishedAt > startedAt` does not depend on millisecond luck. */
function clockFrom(start = 1_000_000) {
  const clock = { value: start };
  return { now: () => clock.value++, value: () => clock.value };
}

/** Give other microtasks/timers a turn without burning a real poll interval. */
const yieldTurn = () => new Promise<void>((done) => setTimeout(done, 0));

describe("the bounds are explicit and coherent", () => {
  test("recovery numbers: poll < heartbeat < stale < max wait", () => {
    expect(ADVISORY_POLL_MS).toBeLessThan(ADVISORY_HEARTBEAT_MS);
    expect(ADVISORY_HEARTBEAT_MS).toBeLessThan(ADVISORY_STALE_MS);
    expect(ADVISORY_STALE_MS).toBeLessThan(ADVISORY_MAX_WAIT_MS);
  });
});

describe("the lock lives in the git COMMON dir, so worktrees share it", () => {
  test("a linked worktree resolves the same common dir as its main checkout", () => {
    const main = join(root, "main");
    gitRepo(main);
    const worktree = join(root, "wt");
    const added = git(main, "worktree", "add", "--detach", worktree, "HEAD");
    expect(added.exitCode).toBe(0);

    const commonMain = resolveGitCommonDir(main);
    const commonWorktree = resolveGitCommonDir(worktree);
    expect(commonMain).not.toBeNull();
    expect(commonWorktree).toBe(commonMain);
    // The lock is under the COMMON dir, not under either checkout.
    const lock = advisoryLockPath(commonMain as string, "check-sync");
    expect(lock.startsWith(advisoryDir(commonMain as string))).toBe(true);
    expect(lock.startsWith(main)).toBe(false);
    expect(lock.startsWith(worktree)).toBe(false);
  });

  test("a non-repository root has no common dir (callers then run unlocked)", () => {
    expect(resolveGitCommonDir(root)).toBeNull();
  });

  test("two callers rooted in DIFFERENT worktrees of one clone still produce one compute and one reuse", async () => {
    const main = join(root, "main");
    gitRepo(main);
    const worktree = join(root, "wt");
    expect(git(main, "worktree", "add", "--detach", worktree, "HEAD").exitCode).toBe(0);

    const { now } = clockFrom();
    const entered = deferred<void>();
    const release = deferred<void>();
    let computes = 0;
    const commonMain = resolveGitCommonDir(main) as string;

    const a = withAdvisoryResult({
      commonDir: commonMain,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "same-tree",
      reusable: true,
      compute: async () => {
        computes += 1;
        entered.resolve();
        await release.promise;
        return "holder-value";
      },
      now,
      sleep: yieldTurn,
    });
    await entered.promise;
    const commonWorktree = resolveGitCommonDir(worktree) as string;
    const b = withAdvisoryResult({
      commonDir: commonWorktree,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "same-tree",
      reusable: true,
      compute: async () => {
        computes += 1;
        return "waiter-value";
      },
      now,
      sleep: yieldTurn,
    });
    release.resolve();
    const [holder, waiter] = await Promise.all([a, b]);

    expect(computes).toBe(1);
    expect(holder.reused).toBe(false);
    expect(waiter.reused).toBe(true);
    expect(waiter.value).toBe("holder-value");
  });
});

describe("a concurrent waiter reuses a finished result; a changed input does not", () => {
  function callers(inputHashFor: () => string) {
    const shared = clockFrom();
    const entered = deferred<void>();
    const release = deferred<void>();
    let computes = 0;
    const base = {
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      reusable: true,
      now: shared.now,
      sleep: yieldTurn,
    };
    const holder = withAdvisoryResult({
      ...base,
      inputHash: inputHashFor(),
      compute: async () => {
        computes += 1;
        entered.resolve();
        await release.promise;
        return "result";
      },
    });
    return { holder, entered, release, computesCount: () => computes, base };
  }

  test("same tree hash: one compute, one reuse", async () => {
    const { holder, entered, release, computesCount, base } = callers(() => "hash-a");
    await entered.promise;
    const waiter = withAdvisoryResult({ ...base, inputHash: "hash-a", compute: async () => "recomputed" });
    release.resolve();
    const [a, b] = await Promise.all([holder, waiter]);
    expect(computesCount()).toBe(1);
    expect(a.reused).toBe(false);
    expect(b.reused).toBe(true);
    expect(b.value).toBe("result");
  });

  test("a different tree hash does not reuse", async () => {
    let otherComputes = 0;
    const { holder, entered, release, computesCount, base } = callers(() => "hash-a");
    await entered.promise;
    const other = withAdvisoryResult({
      ...base,
      inputHash: "hash-b",
      compute: async () => {
        otherComputes += 1;
        return "other-result";
      },
    });
    release.resolve();
    const [, b] = await Promise.all([holder, other]);
    expect(computesCount()).toBe(1);
    expect(otherComputes).toBe(1);
    expect(b.reused).toBe(false);
    expect(b.value).toBe("other-result");
  });

  test("a result slot whose hash matches but which finished BEFORE the caller started is not reused", async () => {
    // Sequential, not concurrent: the caller is not a waiter, so it must recompute.
    const first = await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "hash-a",
      reusable: true,
      compute: () => "first",
    });
    expect(first.reused).toBe(false);
    let secondComputes = 0;
    const second = await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "hash-a",
      reusable: true,
      compute: () => {
        secondComputes += 1;
        return "second";
      },
    });
    expect(secondComputes).toBe(1);
    expect(second.reused).toBe(false);
    expect(second.value).toBe("second");
  });

  test("reusable:false still takes the lock but never reads or writes a result slot", async () => {
    const first = await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "hash-a",
      reusable: false,
      compute: () => "one",
    });
    expect(first.value).toBe("one");
    const second = await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "hash-a",
      reusable: false,
      compute: () => "two",
    });
    expect(second.value).toBe("two");
    expect(second.reused).toBe(false);
  });
});

describe("a stale holder never blocks a waiter forever", () => {
  function writeLock(record: Record<string, unknown>): string {
    const dir = advisoryDir(root);
    mkdirSync(dir, { recursive: true });
    const path = advisoryLockPath(root, "check-sync");
    writeFileSync(path, JSON.stringify(record));
    return path;
  }

  const validIdentity = (pid: number) => `pid:${pid}:started:1`;

  test("a dead pid is recovered on the next poll", async () => {
    const deadPid = 2_147_483_000;
    writeLock({
      schema: 1,
      owner: "dead",
      pid: deadPid,
      hostname: hostname(),
      processStartIdentity: validIdentity(deadPid),
      acquiredAt: 1_000_000,
      updatedAt: 1_000_000,
    });
    const outcome = await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "h",
      reusable: false,
      // Proves the DEAD-PID branch, not the age branch: the heartbeat is fresh.
      now: () => 1_000_000,
      isProcessAlive: () => false,
      compute: () => "recovered",
      sleep: yieldTurn,
    });
    expect(outcome.value).toBe("recovered");
    expect(outcome.forced).toBe(false);
  });

  test("a live pid with a stale heartbeat is recovered by the staleness bound", async () => {
    writeLock({
      schema: 1,
      owner: "stale",
      pid: process.pid,
      hostname: hostname(),
      processStartIdentity: validIdentity(process.pid),
      acquiredAt: 0,
      updatedAt: 0,
    });
    const outcome = await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "h",
      reusable: false,
      now: () => ADVISORY_STALE_MS + 1,
      isProcessAlive: () => true,
      compute: () => "recovered-by-age",
      sleep: yieldTurn,
    });
    expect(outcome.value).toBe("recovered-by-age");
    expect(outcome.forced).toBe(false);
  });

  test("a live, fresh, wedged holder is bounded by maxWaitMs instead of hanging", async () => {
    writeLock({
      schema: 1,
      owner: "alive",
      pid: process.pid,
      hostname: hostname(),
      processStartIdentity: validIdentity(process.pid),
      acquiredAt: 0,
      updatedAt: 1_000_000,
    });
    let forcedComputes = 0;
    const outcome = await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "h",
      reusable: false,
      // A clock that is already past any deadline, with zero patience.
      now: () => 1_000_000,
      isProcessAlive: () => true,
      bounds: { maxWaitMs: 0 },
      compute: () => {
        forcedComputes += 1;
        return "computed-unlocked";
      },
      sleep: yieldTurn,
    });
    expect(forcedComputes).toBe(1);
    expect(outcome.forced).toBe(true);
    expect(outcome.value).toBe("computed-unlocked");
  });

  test("a corrupt lock file is judged by its mtime, so an old one is recovered", () => {
    const dir = advisoryDir(root);
    mkdirSync(dir, { recursive: true });
    const path = advisoryLockPath(root, "check-sync");
    writeFileSync(path, "{not json");
    expect(inspectLock(path, { now: Date.now(), hostname: hostname(), isAlive: () => true, staleMs: 15_000 })).toBe(
      "active",
    );
    expect(
      inspectLock(path, { now: Date.now() + 20_000, hostname: hostname(), isAlive: () => true, staleMs: 15_000 }),
    ).toBe("stale");
  });
});

describe("commandInputHash covers the inputs that decide a check/sync result", () => {
  const base = (over: Partial<Parameters<typeof commandInputHash>[0]> = {}) => ({
    root,
    command: "check",
    args: [] as readonly string[],
    mode: "plain",
    stdoutColor: false,
    stderrColor: false,
    ...over,
  });

  test("is deterministic for the same inputs and null outside a repository", () => {
    expect(commandInputHash(base())).toBeNull(); // root is not a git repo yet
    gitRepo(root);
    const first = commandInputHash(base());
    expect(first).not.toBeNull();
    expect(commandInputHash(base())).toBe(first as string);
  });

  test("a changed tracked byte, a new untracked file, a changed flag and a changed mode all change it", () => {
    gitRepo(root);
    const initial = commandInputHash(base()) as string;

    writeFileSync(join(root, "README.md"), "hello again\n");
    const edited = commandInputHash(base()) as string;
    expect(edited).not.toBe(initial);

    writeFileSync(join(root, "docs.md"), "new\n");
    const untracked = commandInputHash(base()) as string;
    expect(untracked).not.toBe(edited);

    expect(commandInputHash(base({ args: ["--strict"] }))).not.toBe(untracked);
    expect(commandInputHash(base({ args: ["--strict"], mode: "json" }))).not.toBe(
      commandInputHash(base({ args: ["--strict"] })),
    );
    expect(commandInputHash(base({ args: ["--strict"], mode: "json", stdoutColor: true }))).not.toBe(
      commandInputHash(base({ args: ["--strict"], mode: "json" })),
    );
    expect(commandInputHash(base({ stderrColor: true }))).not.toBe(commandInputHash(base()));
    expect(commandInputHash(base({ command: "sync" }))).not.toBe(commandInputHash(base({ command: "check" })));
  });

  test("a restored tree hashes back to its earlier value", () => {
    gitRepo(root);
    const initial = commandInputHash(base()) as string;
    writeFileSync(join(root, "README.md"), "temporary\n");
    expect(commandInputHash(base())).not.toBe(initial);
    writeFileSync(join(root, "README.md"), "hello\n");
    expect(commandInputHash(base())).toBe(initial);
  });
});

describe("the result slot is stored under the common dir", () => {
  test("a computed result is readable at the documented slot path", async () => {
    gitRepo(root);
    const common = resolveGitCommonDir(root) as string;
    await withAdvisoryResult({
      commonDir: common,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "abc",
      reusable: true,
      compute: () => ({ answer: 42 }),
    });
    const slot = JSON.parse(readFileSync(advisoryResultPath(common, "check"), "utf8")) as {
      inputHash: string;
      value: { answer: number };
    };
    expect(slot.inputHash).toBe("abc");
    expect(slot.value).toEqual({ answer: 42 });
  });

  test("a holder that waited keys its result by the tree it actually computed against", async () => {
    // A dead lock forces this caller to steal and acquire; meanwhile `rehash` reports a newer tree
    // (what a prior `sync` holder would have produced). The slot must name the newer tree, not the
    // one this caller entered on — otherwise a later run on the old tree could reuse a stale result.
    const dir = advisoryDir(root);
    mkdirSync(dir, { recursive: true });
    const deadPid = 2_147_483_000;
    writeFileSync(
      advisoryLockPath(root, "check-sync"),
      JSON.stringify({
        schema: 1,
        owner: "dead",
        pid: deadPid,
        hostname: hostname(),
        processStartIdentity: `pid:${deadPid}:started:1`,
        acquiredAt: 1_000_000,
        updatedAt: 1_000_000,
      }),
    );
    await withAdvisoryResult({
      commonDir: root,
      lockName: "check-sync",
      resultName: "check",
      inputHash: "entry-tree",
      rehash: () => "post-wait-tree",
      reusable: true,
      now: () => 1_000_000,
      isProcessAlive: () => false,
      compute: () => "value",
    });
    const slot = JSON.parse(readFileSync(advisoryResultPath(root, "check"), "utf8")) as { inputHash: string };
    expect(slot.inputHash).toBe("post-wait-tree");
  });
});
