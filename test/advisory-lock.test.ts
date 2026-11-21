/**
 * LCLI-792 (DEC-282 items 1-4, (a7) and (a8)): the clone-wide advisory lock in
 * `core/advisory-lock.ts`.
 *
 * Every test here is about the MECHANISM, not wall time: the lock lives in the git COMMON dir; two
 * concurrent callers with the same tree hash produce ONE compute and ONE reuse; a stale holder is
 * recovered and a same-host live one never is; recovery is serialised through an exclusive
 * `<lock>.break`; a broken mechanism or an expired wait runs unlocked with exactly one advisory
 * line; and the hash changes with every input that decides a check/sync result.
 *
 * The clock, the wait deadline (a separate monotonic seam) and the sleep are injected, so recovery
 * numbers are asserted as behaviour without waiting them out — except the two tests that
 * deliberately use REAL child processes (exclusion, and a real `kill -9`).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { BACKLOG_TIMEOUT_ENV_VAR } from "../src/adapters/backlog";
import {
  QUEST_ACCOUNTABLE_HUMAN_ENV_VAR,
  QUEST_ACTOR_ENV_VAR,
  QUEST_ACTOR_KIND_ENV_VAR,
  QUEST_TIMEOUT_ENV_VAR,
} from "../src/adapters/quest";
import {
  ADVISORY_BACKLOG_TIMEOUT_ENV,
  ADVISORY_BOUNDS,
  ADVISORY_BREAK_STALE_MS,
  ADVISORY_ENV_INPUTS,
  ADVISORY_HEARTBEAT_MS,
  ADVISORY_MAX_WAIT_MS,
  ADVISORY_PID_GONE_FLOOR_MS,
  ADVISORY_POLL_MS,
  ADVISORY_QUEST_ACCOUNTABLE_HUMAN_ENV,
  ADVISORY_QUEST_ACTOR_ENV,
  ADVISORY_QUEST_ACTOR_KIND_ENV,
  ADVISORY_QUEST_TIMEOUT_ENV,
  ADVISORY_STALE_MS,
  ADVISORY_WAIT_MARGIN_MS,
  type AdvisoryNotice,
  advisoryBreakPath,
  advisoryDir,
  advisoryLockPath,
  advisoryResultPath,
  commandInputHash,
  inspectLock,
  resolveGitCommonDir,
  withAdvisoryResult,
} from "../src/core/advisory-lock";

/**
 * The module under test as a `file://` URL — the specifier a spawned Bun child imports on EVERY
 * platform. A URL's `pathname` is `/D:/…/advisory-lock.ts` on Windows, an absolute POSIX path that
 * does not exist there, so a child script importing the pathname exits 1 before running a line.
 */
const MODULE_URL = new URL("../src/core/advisory-lock.ts", import.meta.url).href;

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

/** Read a piped child stream to EOF; empty when the spawn did not pipe it. */
async function drain(stream: ReadableStream<Uint8Array> | undefined): Promise<string> {
  return stream === undefined ? "" : await new Response(stream).text();
}

const VALID_IDENTITY = (pid: number) => `pid:${pid}:started:1`;

function seedLock(record: Record<string, unknown>): string {
  const dir = advisoryDir(root);
  mkdirSync(dir, { recursive: true });
  const path = advisoryLockPath(root, "check-sync");
  writeFileSync(path, JSON.stringify(record));
  return path;
}

/** A well-formed same-host record with the given overrides. */
function lockRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 1,
    owner: "seeded-owner",
    pid: process.pid,
    hostname: hostname(),
    processStartIdentity: VALID_IDENTITY(process.pid),
    acquiredAt: 1_000_000,
    updatedAt: 1_000_000,
    ...over,
  };
}

/** The shared lock/result names for this file; `root` is assigned per test, so it must be lazy. */
const reader = () => ({ commonDir: root, lockName: "check-sync", resultName: "check" }) as const;

describe("the bounds are explicit and coherent (DEC-282 (a8))", () => {
  test("poll < heartbeat < break-stale < pid-floor < stale < max wait", () => {
    expect(ADVISORY_POLL_MS).toBeLessThan(ADVISORY_HEARTBEAT_MS);
    expect(ADVISORY_HEARTBEAT_MS).toBeLessThan(ADVISORY_BREAK_STALE_MS);
    expect(ADVISORY_BREAK_STALE_MS).toBeLessThan(ADVISORY_PID_GONE_FLOOR_MS);
    expect(ADVISORY_PID_GONE_FLOOR_MS).toBeLessThan(ADVISORY_STALE_MS);
    expect(ADVISORY_STALE_MS).toBeLessThan(ADVISORY_MAX_WAIT_MS);
  });

  test("the wait is sized PAST the stale backstop by the documented margin, not a short cap", () => {
    expect(ADVISORY_MAX_WAIT_MS).toBe(ADVISORY_STALE_MS + ADVISORY_WAIT_MARGIN_MS);
    expect(ADVISORY_WAIT_MARGIN_MS).toBeGreaterThan(0);
    expect(ADVISORY_BOUNDS.maxWaitMs).toBe(ADVISORY_MAX_WAIT_MS);
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
    // The canonical key: two spellings that reach ONE common dir must be one string, or the two
    // worktrees take two different locks (the windows-latest 8.3-short-name defect below).
    expect(commonWorktree).toBe(commonMain);
    const lock = advisoryLockPath(commonMain as string, "check-sync");
    // Positive control: the lock IS under the one shared common dir.
    expect(lock.startsWith(advisoryDir(commonMain as string))).toBe(true);
    // The intent: the lock is NOT inside the linked worktree. The first version of this test also
    // asserted `!lock.startsWith(main)`, which is false BY DESIGN — the shared common dir is
    // main/.git — and so failed on every platform.
    expect(lock.startsWith(worktree)).toBe(false);
  });

  test("win32: an 8.3 short name and the long name of ONE common dir canonicalize to one key", async () => {
    // The windows-latest failure: `git rev-parse --git-common-dir` reported
    // `C:\Users\RUNNER~1\…\main\.git` from the main checkout and
    // `C:\Users\runneradmin\…\main\.git` from the linked worktree. Windows' JS `realpathSync`
    // leaves the short name alone; only `realpathSync.native` expands it, so the two worktrees
    // took different locks. Emulated with a Bun preload that replaces `fs.realpathSync` with one
    // that returns its input and gives it a `.native` that maps the short segment to the long one
    // — the measured Windows behaviour, not a guess. Run against the pre-fix source the two
    // results DIFFER (red); with the fix they are one string.
    //
    // The fixture uses SENTINEL segment names, never the literal `RUNNER~1`: on a real Windows
    // runner `os.tmpdir()` is ITSELF `C:\Users\RUNNER~1\AppData\Local\Temp`, so a fake that maps
    // that literal rewrites the tmp PREFIX of every path too, while the expected values are built
    // from the unrewritten prefix — and the two disagree (CI run 44933943308). A sentinel cannot
    // occur in any host tmp path, so it only ever affects the fixture's own segment, and every
    // expected value is derived through the SAME mapping the fake applies.
    const SHORT_SEGMENT = "SHORT~7Q";
    const LONG_SEGMENT = "longname7q";
    const BROKEN_SEGMENT = "UNRESOLVABLE~9Z";
    const mapShortToLong = (path: string): string => path.split(SHORT_SEGMENT).join(LONG_SEGMENT);

    const shortRoot = join(root, SHORT_SEGMENT, "main");
    const longRoot = join(root, LONG_SEGMENT, "main");
    const brokenRoot = join(root, BROKEN_SEGMENT, "main");
    for (const dir of [shortRoot, longRoot, brokenRoot]) mkdirSync(dir, { recursive: true });
    const shortDir = join(shortRoot, "shared");
    const longDir = join(longRoot, "shared");
    const brokenDir = join(brokenRoot, "shared");
    const expectedShort = mapShortToLong(shortDir);

    // Positive controls for the fixture itself: the mapping changes exactly the fixture segment
    // and leaves the tmp prefix (`root`, under `os.tmpdir()`) byte-identical, so a mapping that
    // rewrote the prefix — the CI defect — cannot pass, and the assertion below is not vacuous.
    expect(mapShortToLong(root)).toBe(root);
    expect(expectedShort).not.toBe(shortDir);

    const preload = join(root, "fake-win32-fs.ts");
    writeFileSync(
      preload,
      [
        `const fs = require("node:fs");`,
        `const short = process.env.LORE_FAKE_8_3_SHORT ?? "";`,
        `const long = process.env.LORE_FAKE_8_3_LONG ?? "";`,
        `const broken = process.env.LORE_FAKE_8_3_BROKEN ?? "";`,
        "const jsRealpath = (p) => p;",
        "jsRealpath.native = (p) => {",
        `  if (broken !== "" && p.includes(broken)) throw new Error("EACCES: emulated unopenable handle");`,
        `  return short !== "" && p.includes(short) ? p.split(short).join(long) : p;`,
        "};",
        "fs.realpathSync = jsRealpath;",
        "",
      ].join("\n"),
      "utf8",
    );
    const probe = join(root, "win32-probe.ts");
    writeFileSync(
      probe,
      [
        `import { resolveGitCommonDir } from ${JSON.stringify(MODULE_URL)};`,
        "const [, , shortRoot, shortDir, longRoot, longDir, brokenRoot, brokenDir] = process.argv;",
        "const run = (dir) => () => ({ ok: true, stdout: dir + '\\n' });",
        "process.stdout.write(JSON.stringify({",
        "  a: resolveGitCommonDir(shortRoot, run(shortDir)),",
        "  b: resolveGitCommonDir(longRoot, run(longDir)),",
        "  fallback: resolveGitCommonDir(brokenRoot, run(brokenDir)),",
        "}));",
        "",
      ].join("\n"),
      "utf8",
    );

    const child = Bun.spawn(
      [process.execPath, "--preload", preload, probe, shortRoot, shortDir, longRoot, longDir, brokenRoot, brokenDir],
      {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          LORE_FAKE_8_3_SHORT: SHORT_SEGMENT,
          LORE_FAKE_8_3_LONG: LONG_SEGMENT,
          LORE_FAKE_8_3_BROKEN: BROKEN_SEGMENT,
        },
      },
    );
    const [code, stdout, stderr] = await Promise.all([child.exited, drain(child.stdout), drain(child.stderr)]);
    if (code !== 0) throw new Error(`win32 probe exited ${code}; stderr: ${stderr}`);
    const { a, b, fallback } = JSON.parse(stdout) as {
      a: string | null;
      b: string | null;
      fallback: string | null;
    };
    expect(a).not.toBeNull();
    // Expected value derived through the SAME mapping the fake applies, never from a second,
    // unrewritten spelling of the input.
    expect(a).toBe(expectedShort);
    expect(a).toBe(longDir);
    // The property under test: both spellings of ONE common dir resolve to ONE key.
    expect(b).toBe(a);
    // The documented fallback: a native realpath that cannot resolve leaves the path unresolved,
    // rather than throwing or returning a second spelling.
    expect(fallback).toBe(brokenDir);
  }, 20_000);

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
      ...reader(),
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
    const first = await withAdvisoryResult({
      ...reader(),
      inputHash: "hash-a",
      reusable: true,
      compute: () => "first",
    });
    expect(first.reused).toBe(false);
    let secondComputes = 0;
    const second = await withAdvisoryResult({
      ...reader(),
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
    const first = await withAdvisoryResult({ ...reader(), inputHash: "hash-a", reusable: false, compute: () => "one" });
    expect(first.value).toBe("one");
    const second = await withAdvisoryResult({
      ...reader(),
      inputHash: "hash-a",
      reusable: false,
      compute: () => "two",
    });
    expect(second.value).toBe("two");
    expect(second.reused).toBe(false);
  });
});

describe("stale-holder recovery (F2, DEC-282 (a8))", () => {
  test("a same-host pid that is gone is recovered once past the dead-pid floor", async () => {
    const deadPid = 2_147_483_000;
    seedLock(
      lockRecord({
        owner: "dead",
        pid: deadPid,
        processStartIdentity: VALID_IDENTITY(deadPid),
        updatedAt: 1_000_000 - 60_000,
      }),
    );
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => 1_000_000,
      isProcessAlive: () => false,
      compute: () => "recovered",
      sleep: yieldTurn,
    });
    expect(outcome.value).toBe("recovered");
    expect(outcome.forced).toBe(false);
  });

  test("a dead pid inside the floor is treated as mid-write, not abandoned", async () => {
    const deadPid = 2_147_483_000;
    const path = seedLock(
      lockRecord({
        owner: "fresh-dead",
        pid: deadPid,
        processStartIdentity: VALID_IDENTITY(deadPid),
        updatedAt: 1_000_000,
      }),
    );
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => 1_000_000,
      isProcessAlive: () => false,
      bounds: { maxWaitMs: 0 },
      compute: () => "computed-unlocked",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).owner).toBe("fresh-dead");
  });

  test("a same-host LIVE pid is never stolen by age, however stale its heartbeat (F2)", async () => {
    const path = seedLock(lockRecord({ owner: "live-but-starved", updatedAt: 1_000_000 - 10 * ADVISORY_STALE_MS }));
    const notices: AdvisoryNotice[] = [];
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => 1_000_000,
      isProcessAlive: () => true,
      bounds: { maxWaitMs: 0 },
      onNotice: (notice) => notices.push(notice),
      compute: () => "computed-unlocked",
      sleep: yieldTurn,
    });
    // It waited out the bound instead of stealing: forced, and the holder's file is untouched.
    expect(outcome.forced).toBe(true);
    expect(outcome.value).toBe("computed-unlocked");
    expect(JSON.parse(readFileSync(path, "utf8")).owner).toBe("live-but-starved");
    expect(notices.filter((notice) => notice.kind === "unlocked")).toHaveLength(1);
  });

  test("a heartbeat starved by a synchronous compute is not stolen, and a waiter still reuses the result", async () => {
    const path = seedLock(lockRecord({ owner: "starved", updatedAt: 1_000_000 - 10 * ADVISORY_STALE_MS }));
    const clock = clockFrom(1_000_000);
    const finishedAfter = clock.value() + 10;
    let computes = 0;
    const waiter = withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: true,
      now: clock.now,
      isProcessAlive: () => true,
      bounds: { maxWaitMs: 10_000 },
      compute: () => {
        computes += 1;
        return "recomputed";
      },
      sleep: yieldTurn,
    });
    // The holder finishes while this caller is still waiting.
    await yieldTurn();
    await yieldTurn();
    mkdirSync(advisoryDir(root), { recursive: true });
    writeFileSync(
      advisoryResultPath(root, "check"),
      JSON.stringify({ schema: 1, inputHash: "h", finishedAt: finishedAfter, value: "holder-result" }),
    );
    const outcome = await waiter;
    expect(computes).toBe(0);
    expect(outcome.reused).toBe(true);
    expect(outcome.value).toBe("holder-result");
    // The starved holder's lock was never moved aside or replaced.
    expect(JSON.parse(readFileSync(path, "utf8")).owner).toBe("starved");
  });

  test("a lock from ANOTHER host is recovered by age alone", async () => {
    seedLock(
      lockRecord({ owner: "other-host", hostname: "elsewhere.example", updatedAt: 1_000_000 - ADVISORY_STALE_MS - 1 }),
    );
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => 1_000_000,
      isProcessAlive: () => true,
      compute: () => "recovered-by-age",
      sleep: yieldTurn,
    });
    expect(outcome.value).toBe("recovered-by-age");
    expect(outcome.forced).toBe(false);
  });

  test("an unreadable lock is judged by its mtime against the dead-pid floor", () => {
    mkdirSync(advisoryDir(root), { recursive: true });
    const path = advisoryLockPath(root, "check-sync");
    writeFileSync(path, "{not json");
    const base = { hostname: hostname(), isAlive: () => true, staleMs: ADVISORY_STALE_MS };
    expect(inspectLock(path, { ...base, now: Date.now() })).toBe("active");
    expect(inspectLock(path, { ...base, now: Date.now() + ADVISORY_PID_GONE_FLOOR_MS + 1 })).toBe("stale");
  });

  test("a live, fresh, wedged holder is bounded by the wait bound instead of hanging", async () => {
    seedLock(lockRecord({ owner: "alive", updatedAt: 1_000_000 }));
    let forcedComputes = 0;
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
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

  test("a missing lock reports none", () => {
    expect(
      inspectLock(join(root, "nope.lock"), { now: 0, hostname: hostname(), isAlive: () => false, staleMs: 1 }),
    ).toBe("none");
  });
});

describe("breaking a stale lock is serialised (F1, ported from quest-cli#760)", () => {
  test("two concurrent waiters recovering one stale lock still serialise", async () => {
    seedLock(
      lockRecord({
        owner: "stale-holder",
        pid: 999_999,
        processStartIdentity: VALID_IDENTITY(999_999),
        updatedAt: Date.now() - 60_000,
      }),
    );
    let inside = 0;
    let overlapped = false;
    const run = () =>
      withAdvisoryResult({
        ...reader(),
        inputHash: "h",
        reusable: false,
        isProcessAlive: (pid) => pid === process.pid,
        bounds: { pollMs: 5, maxWaitMs: 5_000 },
        sleep: (ms) => new Promise<void>((done) => setTimeout(done, Math.min(ms, 5))),
        compute: async () => {
          inside += 1;
          if (inside > 1) overlapped = true;
          await new Promise<void>((done) => setTimeout(done, 15));
          inside -= 1;
          return "done";
        },
      });
    await Promise.all([run(), run()]);
    expect(overlapped).toBe(false);
  });

  test("a lock replaced after the stale judgement is never removed, and no contender can create mid-recovery", async () => {
    const frozenNow = 1_700_000_000_000;
    const path = seedLock(
      lockRecord({
        owner: "judged-stale",
        pid: 999_999,
        processStartIdentity: VALID_IDENTITY(999_999),
        updatedAt: frozenNow - 120_000,
      }),
    );
    let midRecoveryCreateSucceeded = false;
    let midRecoveryAttempts = 0;

    const error = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      now: () => frozenNow,
      bounds: { staleMs: 600_000, pidGoneFloorMs: 30_000, pollMs: 5, maxWaitMs: 0 },
      sleep: yieldTurn,
      afterStaleJudgement: async () => {
        // A competing breaker removes the judged-stale lock and a new holder acquires before this
        // caller acts on its stale reading.
        rmSync(path, { force: true });
        writeFileSync(path, JSON.stringify(lockRecord({ owner: "contender", updatedAt: frozenNow })));
      },
      afterLockedReread: async () => {
        // If recovery had emptied the path, a third contender would create here. In a correct
        // recovery the path is still occupied by whatever the re-read matched.
        midRecoveryAttempts += 1;
        midRecoveryCreateSucceeded = true;
      },
      compute: () => "should-not-compute-under-a-live-contender",
    });
    // The contender is live, so this caller can only wait out the bound.
    expect(error.forced).toBe(true);
    expect(error.reused).toBe(false);
    // The locked re-read never ran against a vanished path, and the contender's record survived.
    expect(midRecoveryAttempts).toBe(0);
    expect(midRecoveryCreateSucceeded).toBe(false);
    expect(JSON.parse(readFileSync(path, "utf8")).owner).toBe("contender");
  });

  test("the locked re-read runs with the lock path still occupied", async () => {
    const frozenNow = 1_700_000_000_000;
    const path = seedLock(
      lockRecord({
        owner: "judged-stale",
        pid: 999_999,
        processStartIdentity: VALID_IDENTITY(999_999),
        updatedAt: frozenNow - 120_000,
      }),
    );
    let hookRuns = 0;
    let probeSawEexist = false;
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      now: () => frozenNow,
      bounds: { staleMs: 600_000, pidGoneFloorMs: 30_000, pollMs: 5, maxWaitMs: 1_000 },
      sleep: yieldTurn,
      afterLockedReread: () => {
        hookRuns += 1;
        // The judged lock must still occupy the path here: recovery removes it only after this.
        try {
          writeFileSync(path, "{third}", { flag: "wx" });
        } catch (thrown) {
          if ((thrown as { readonly code?: string }).code === "EEXIST") probeSawEexist = true;
          else throw thrown;
        }
      },
      compute: () => "recovered",
    });
    expect(outcome.value).toBe("recovered");
    expect(hookRuns).toBe(1);
    expect(probeSawEexist).toBe(true);
  });
});

describe("the .break file cannot wedge recovery forever (N1, R3-2)", () => {
  const frozenNow = 1_700_000_000_000;
  const staleLock = () =>
    seedLock(
      lockRecord({
        owner: "dead-holder",
        pid: 999_999,
        processStartIdentity: VALID_IDENTITY(999_999),
        updatedAt: frozenNow - 120_000,
      }),
    );

  function breakPathFor(): string {
    return advisoryBreakPath(root, "check-sync");
  }

  /** Age a file 60 s back: the middle band for staleMs=120 s and breakStaleMs=10 s (R3-2). */
  function backdateSixtySeconds(path: string): void {
    const at = new Date(frozenNow - 60_000);
    utimesSync(path, at, at);
  }

  const middleBandBounds = { staleMs: 120_000, breakStaleMs: 10_000, maxWaitMs: 0 };

  test("the middle band: an UNREADABLE break file older than breakStaleMs but younger than staleMs is KEPT", async () => {
    staleLock();
    const breakPath = breakPathFor();
    writeFileSync(breakPath, "");
    backdateSixtySeconds(breakPath);
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      now: () => frozenNow,
      bounds: middleBandBounds,
      compute: () => "unlocked",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(true);
    expect(existsSync(breakPath)).toBe(true);
  });

  test("the middle band: a LIVE-PID break file older than breakStaleMs but younger than staleMs is KEPT", async () => {
    staleLock();
    const breakPath = breakPathFor();
    writeFileSync(breakPath, JSON.stringify(lockRecord({ owner: "live-breaker", updatedAt: frozenNow - 60_000 })));
    backdateSixtySeconds(breakPath);
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      now: () => frozenNow,
      bounds: middleBandBounds,
      compute: () => "unlocked",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(true);
    expect(existsSync(breakPath)).toBe(true);
    expect(JSON.parse(readFileSync(breakPath, "utf8")).owner).toBe("live-breaker");
  });

  test("past staleMs an unreadable break file is cleared by age alone", async () => {
    staleLock();
    const breakPath = breakPathFor();
    writeFileSync(breakPath, "");
    const at = new Date(frozenNow - 200_000);
    utimesSync(breakPath, at, at);
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      now: () => frozenNow,
      bounds: { staleMs: 120_000, maxWaitMs: 1_000 },
      compute: () => "recovered",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(false);
    expect(outcome.value).toBe("recovered");
    expect(existsSync(breakPath)).toBe(false);
  });

  test("past staleMs a live-pid break file is cleared by age alone", async () => {
    staleLock();
    const breakPath = breakPathFor();
    writeFileSync(breakPath, JSON.stringify(lockRecord({ owner: "live-but-aged", updatedAt: frozenNow - 200_000 })));
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      now: () => frozenNow,
      bounds: { staleMs: 120_000, maxWaitMs: 1_000 },
      compute: () => "recovered",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(false);
    expect(outcome.value).toBe("recovered");
    expect(existsSync(breakPath)).toBe(false);
  });

  test("a fresh unreadable break file is not cleared", async () => {
    staleLock();
    const breakPath = breakPathFor();
    writeFileSync(breakPath, "");
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      bounds: { maxWaitMs: 0 },
      compute: () => "unlocked",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(true);
    expect(existsSync(breakPath)).toBe(true);
  });

  test("a stale break file from a killed breaker (old, pid gone) is cleared", async () => {
    staleLock();
    const breakPath = breakPathFor();
    writeFileSync(
      breakPath,
      JSON.stringify(
        lockRecord({
          owner: "dead-breaker",
          pid: 999_998,
          processStartIdentity: VALID_IDENTITY(999_998),
          updatedAt: Date.now() - 60_000,
        }),
      ),
    );
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      bounds: { pollMs: 5, maxWaitMs: 1_000 },
      compute: () => "recovered",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(false);
    expect(existsSync(breakPath)).toBe(false);
  });

  test("the expiry line reports the .break state and the remedy", async () => {
    staleLock();
    const breakPath = breakPathFor();
    writeFileSync(breakPath, JSON.stringify(lockRecord({ owner: "live-breaker", updatedAt: frozenNow - 60_000 })));
    const notices: AdvisoryNotice[] = [];
    await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      isProcessAlive: (pid) => pid === process.pid,
      now: () => frozenNow,
      bounds: middleBandBounds,
      onNotice: (notice) => notices.push(notice),
      compute: () => "unlocked",
      sleep: yieldTurn,
    });
    const unlocked = notices.filter((notice) => notice.kind === "unlocked");
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]?.message).toContain(breakPath);
    expect(unlocked[0]?.message).toContain("live pid");
    expect(unlocked[0]?.message).toContain("unlocked");
  });
});

describe("a broken mechanism runs unlocked with exactly one line (DEC-282 (a8) rule 2)", () => {
  function collect() {
    const notices: AdvisoryNotice[] = [];
    return { notices, onNotice: (notice: AdvisoryNotice) => notices.push(notice) };
  }

  test("an uncreatable lock directory (a file at its path) proceeds unlocked", async () => {
    mkdirSync(join(root, "lore"), { recursive: true });
    writeFileSync(advisoryDir(root), "");
    const { notices, onNotice } = collect();
    let computes = 0;
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      onNotice,
      compute: () => {
        computes += 1;
        return "computed";
      },
    });
    expect(computes).toBe(1);
    expect(outcome.forced).toBe(true);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.kind).toBe("unlocked");
    expect(notices[0]?.message).toContain("unlocked");
  });

  test("a lock path that is a directory proceeds unlocked, not thrown", async () => {
    mkdirSync(advisoryDir(root), { recursive: true });
    mkdirSync(advisoryLockPath(root, "check-sync"));
    const { notices, onNotice } = collect();
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      onNotice,
      compute: () => "computed",
    });
    expect(outcome.forced).toBe(true);
    expect(outcome.value).toBe("computed");
    expect(notices).toHaveLength(1);
    expect(notices[0]?.kind).toBe("unlocked");
    expect(notices[0]?.message).toContain("unlocked");
  });

  test("a .break path that is a directory proceeds unlocked, not thrown", async () => {
    const deadPid = 2_147_483_000;
    seedLock(
      lockRecord({
        owner: "dead",
        pid: deadPid,
        processStartIdentity: VALID_IDENTITY(deadPid),
        updatedAt: 1_000_000 - 60_000,
      }),
    );
    mkdirSync(advisoryBreakPath(root, "check-sync"));
    const { notices, onNotice } = collect();
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => 1_000_000,
      isProcessAlive: () => false,
      onNotice,
      bounds: { maxWaitMs: 0 },
      compute: () => "computed",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(true);
    expect(outcome.value).toBe("computed");
    expect(notices).toHaveLength(1);
    expect(notices[0]?.kind).toBe("unlocked");
    expect(notices[0]?.message).toContain("unlocked");
  });
});

describe("a routine wait is silent; only expiry or a broken mechanism writes a line (F4, (a8), (a14) Q3)", () => {
  test("a wait that ends when the holder releases prints NOTHING", async () => {
    const path = seedLock(lockRecord({ owner: "live", updatedAt: 1_000_000 }));
    const notices: AdvisoryNotice[] = [];
    const waiter = withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => 1_000_000,
      isProcessAlive: () => true,
      bounds: { pollMs: 1, maxWaitMs: 10_000 },
      onNotice: (notice) => notices.push(notice),
      compute: () => "computed",
      sleep: yieldTurn,
    });
    await yieldTurn();
    await yieldTurn();
    rmSync(path, { force: true });
    const outcome = await waiter;
    expect(outcome.forced).toBe(false);
    expect(outcome.waited).toBe(true);
    expect(notices).toHaveLength(0);
  });

  test("an expired wait emits exactly ONE unlocked line and proceeds", async () => {
    seedLock(lockRecord({ owner: "live", updatedAt: 1_000_000 }));
    const notices: AdvisoryNotice[] = [];
    let elapsedValue = 0;
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => 1_000_000,
      elapsed: () => elapsedValue++,
      isProcessAlive: () => true,
      bounds: { maxWaitMs: 2 },
      onNotice: (notice) => notices.push(notice),
      compute: () => "computed",
      sleep: yieldTurn,
    });
    expect(outcome.forced).toBe(true);
    expect(outcome.value).toBe("computed");
    const unlocked = notices.filter((notice) => notice.kind === "unlocked");
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]?.message).toContain("unlocked");
    expect(unlocked[0]?.message).toContain("waited");
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
    env: {} as Record<string, string | undefined>,
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

  test("every environment input the adapters read changes the hash (F6)", () => {
    gitRepo(root);
    const initial = commandInputHash(base()) as string;
    for (const name of ADVISORY_ENV_INPUTS) {
      expect(commandInputHash(base({ env: { [name]: "changed" } }))).not.toBe(initial);
    }
  });

  test("the hashed env names are the adapters' own constants, not copies that can drift", () => {
    expect(ADVISORY_QUEST_TIMEOUT_ENV).toBe(QUEST_TIMEOUT_ENV_VAR);
    expect(ADVISORY_QUEST_ACTOR_ENV).toBe(QUEST_ACTOR_ENV_VAR);
    expect(ADVISORY_QUEST_ACTOR_KIND_ENV).toBe(QUEST_ACTOR_KIND_ENV_VAR);
    expect(ADVISORY_QUEST_ACCOUNTABLE_HUMAN_ENV).toBe(QUEST_ACCOUNTABLE_HUMAN_ENV_VAR);
    expect(ADVISORY_BACKLOG_TIMEOUT_ENV).toBe(BACKLOG_TIMEOUT_ENV_VAR);
  });
});

describe("the result slot is stored under the common dir", () => {
  test("a computed result is readable at the documented slot path, private to the user", async () => {
    await withAdvisoryResult({
      ...reader(),
      inputHash: "abc",
      reusable: true,
      compute: () => ({ answer: 42 }),
    });
    const path = advisoryResultPath(root, "check");
    const slot = JSON.parse(readFileSync(path, "utf8")) as { inputHash: string; value: { answer: number } };
    expect(slot.inputHash).toBe("abc");
    expect(slot.value).toEqual({ answer: 42 });
    // Windows emulates file modes; the private-mode guarantee is a POSIX one.
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test("a holder that waited keys its result by the tree it actually computed against", async () => {
    const deadPid = 2_147_483_000;
    seedLock(
      lockRecord({
        owner: "dead",
        pid: deadPid,
        processStartIdentity: VALID_IDENTITY(deadPid),
        updatedAt: 1_000_000 - 60_000,
      }),
    );
    await withAdvisoryResult({
      ...reader(),
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

describe("abandonment residue is swept, not accumulated (F7)", () => {
  test("temp files and pre-(a7) .stale asides older than the stale bound are removed", async () => {
    mkdirSync(advisoryDir(root), { recursive: true });
    const tmp = join(advisoryDir(root), "check.result.json.abc.tmp");
    const aside = join(advisoryDir(root), "check-sync.lock.stale.dead");
    const fresh = join(advisoryDir(root), "fresh.tmp");
    for (const path of [tmp, aside, fresh]) writeFileSync(path, "x");
    const old = new Date(Date.now() - ADVISORY_STALE_MS - 60_000);
    utimesSync(tmp, old, old);
    utimesSync(aside, old, old);

    await withAdvisoryResult({ ...reader(), inputHash: null, reusable: false, compute: () => "done" });

    const left = readdirSync(advisoryDir(root));
    expect(left).not.toContain("check.result.json.abc.tmp");
    expect(left).not.toContain("check-sync.lock.stale.dead");
    expect(left).toContain("fresh.tmp");
  });
});

describe("real processes (F8)", () => {
  test("the child import specifier is a file: URL, not a pathname a Windows host cannot import", () => {
    // THE WINDOWS DEFECT these children hit: `new URL(..., import.meta.url).pathname` of a file URL
    // is `/D:/a/lore-cli/src/core/advisory-lock.ts` on Windows — a path with a leading slash and a
    // drive letter, which Bun resolves against the CURRENT DRIVE, finds nothing at, and the child
    // exits 1 before running a line (both F8 tests failed that way). `.href` keeps the `file:`
    // scheme on every platform. Reverting MODULE_URL to `.pathname` reds this on macOS too.
    expect(MODULE_URL.startsWith("file:")).toBe(true);
    const windows = new URL("file:///D:/a/lore-cli/src/core/advisory-lock.ts");
    expect(windows.pathname).toBe("/D:/a/lore-cli/src/core/advisory-lock.ts");
    expect(windows.href).toBe("file:///D:/a/lore-cli/src/core/advisory-lock.ts");
  });

  test("two real processes never hold the lock at once", async () => {
    const log = join(root, "events.log");
    const script = join(root, "holder.ts");
    writeFileSync(
      script,
      [
        `import { appendFileSync } from "node:fs";`,
        `import { withAdvisoryResult } from ${JSON.stringify(MODULE_URL)};`,
        "const [commonDir, logPath] = process.argv.slice(2);",
        "await withAdvisoryResult({",
        "  commonDir, lockName: 'probe', resultName: 'probe', inputHash: null, reusable: false,",
        "  bounds: { pollMs: 5, maxWaitMs: 10000 },",
        "  compute: async () => {",
        "    appendFileSync(logPath, 'enter\\n');",
        "    await new Promise((done) => setTimeout(done, 120));",
        "    appendFileSync(logPath, 'exit\\n');",
        "    return 0;",
        "  },",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    const spawnChild = () => Bun.spawn([process.execPath, script, root, log], { stdout: "pipe", stderr: "pipe" });
    const first = spawnChild();
    const second = spawnChild();
    // Drain every stream alongside `exited`; a child that dies before running a line reports why on
    // stderr, and without this the assertion said only "expected 0, received 1".
    const [[a, aOut, aErr], [b, bOut, bErr]] = await Promise.all([
      Promise.all([first.exited, drain(first.stdout), drain(first.stderr)]),
      Promise.all([second.exited, drain(second.stdout), drain(second.stderr)]),
    ]);
    if (a !== 0 || b !== 0) {
      throw new Error(
        `children exited ${a}/${b}; first stdout: ${JSON.stringify(aOut)}; first stderr: ${JSON.stringify(aErr)}; second stdout: ${JSON.stringify(bOut)}; second stderr: ${JSON.stringify(bErr)}`,
      );
    }
    expect(a).toBe(0);
    expect(b).toBe(0);
    const events = readFileSync(log, "utf8").trim().split("\n");
    expect(events).toEqual(["enter", "exit", "enter", "exit"]);
  }, 20_000);

  test("a holder killed with SIGKILL is recovered by the real dead-pid probe", async () => {
    const script = join(root, "kill-holder.ts");
    writeFileSync(
      script,
      [
        `import { withAdvisoryResult } from ${JSON.stringify(MODULE_URL)};`,
        "const commonDir = process.argv[2];",
        "await withAdvisoryResult({",
        "  commonDir, lockName: 'probe', resultName: 'probe', inputHash: null, reusable: false,",
        "  compute: async () => {",
        '    process.stdout.write("held\\n");',
        "    await new Promise(() => {});",
        "  },",
        "});",
        "",
      ].join("\n"),
      "utf8",
    );
    const child = Bun.spawn([process.execPath, script, root], { stdout: "pipe", stderr: "pipe" });
    const stdout = child.stdout;
    if (!stdout) throw new Error("child stdout was not piped");
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let output = "";
    const readyBy = Date.now() + 5_000;
    while (!output.includes("held")) {
      if (Date.now() > readyBy) {
        child.kill(9);
        throw new Error(`child never printed held; stderr: ${await drain(child.stderr)}`);
      }
      const { value, done } = await reader.read();
      if (done) break;
      output += decoder.decode(value, { stream: true });
    }
    reader.releaseLock();
    // A child that died before printing "held" leaves its reason on stderr; name it.
    if (!output.includes("held")) {
      throw new Error(
        `child exited without printing held (stdout ${JSON.stringify(output)}); stderr: ${await drain(child.stderr)}`,
      );
    }
    expect(output).toContain("held");

    const lockPath = advisoryLockPath(root, "probe");
    const childOwner = JSON.parse(readFileSync(lockPath, "utf8"));
    expect(childOwner.pid).toBe(child.pid);
    child.kill(9);
    await child.exited;

    const started = performance.now();
    const outcome = await withAdvisoryResult({
      commonDir: root,
      lockName: "probe",
      resultName: "probe",
      inputHash: null,
      reusable: false,
      bounds: { pidGoneFloorMs: 100, staleMs: 60_000, pollMs: 10, maxWaitMs: 5_000 },
      compute: () => "recovered",
    });
    const elapsed = performance.now() - started;
    expect(outcome.value).toBe("recovered");
    expect(outcome.forced).toBe(false);
    expect(elapsed).toBeLessThan(1_000);
  }, 20_000);
});

describe("round-3 fixes (LCLI-792, DEC-282 (a14))", () => {
  test("SF1: two clearers race for an aged .break; the loser's ENOENT is a wait, not a broken mechanism", async () => {
    const frozenNow = 1_700_000_000_000;
    seedLock(
      lockRecord({
        owner: "dead-holder",
        pid: 999_999,
        processStartIdentity: VALID_IDENTITY(999_999),
        updatedAt: frozenNow - 120_000,
      }),
    );
    const breakPath = advisoryBreakPath(root, "check-sync");
    writeFileSync(
      breakPath,
      JSON.stringify(lockRecord({ owner: "dead-breaker", pid: 888_888, updatedAt: frozenNow - 60_000 })),
    );
    const notices: AdvisoryNotice[] = [];
    let raced = false;
    const outcome = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: false,
      now: () => frozenNow,
      // The break file's staleness judgement probes the breaker's pid, which is the instant between
      // "read it" and "unlink it": the competing clearer removes the file exactly there.
      isProcessAlive: (pid) => {
        if (pid === 888_888 && !raced) {
          raced = true;
          rmSync(breakPath, { force: true });
        }
        return false;
      },
      bounds: { staleMs: 120_000, breakStaleMs: 10_000, maxWaitMs: 10_000 },
      onNotice: (notice) => notices.push(notice),
      compute: () => "computed",
      sleep: yieldTurn,
    });
    expect(raced).toBe(true);
    expect(notices).toHaveLength(0);
    expect(outcome.forced).toBe(false);
    expect(outcome.value).toBe("computed");
  });

  test("SF1 (#758): a caller ALWAYS rehashes once it holds the lock, even on a first-try acquire", async () => {
    let rehashes = 0;
    const immediate = await withAdvisoryResult({
      ...reader(),
      inputHash: "h",
      reusable: true,
      rehash: () => {
        rehashes += 1;
        return "h2";
      },
      compute: () => "v",
    });
    expect(immediate.waited).toBe(false);
    // The entry hash is taken BEFORE the call, so a holder can write and release between it and the
    // first create attempt: the result must be keyed by the post-lock hash, not the stale entry one.
    expect(rehashes).toBe(1);
    expect(
      (JSON.parse(readFileSync(advisoryResultPath(root, "check"), "utf8")) as { inputHash: string }).inputHash,
    ).toBe("h2");

    const path = seedLock(lockRecord({ owner: "live", updatedAt: 1_000_000 }));
    const waiter = withAdvisoryResult({
      ...reader(),
      inputHash: "h3",
      reusable: true,
      now: () => 1_000_000,
      isProcessAlive: () => true,
      bounds: { pollMs: 1, maxWaitMs: 10_000 },
      rehash: () => {
        rehashes += 1;
        return "h4";
      },
      compute: () => "v2",
      sleep: yieldTurn,
    });
    await yieldTurn();
    await yieldTurn();
    rmSync(path, { force: true });
    const outcome = await waiter;
    expect(outcome.waited).toBe(true);
    expect(rehashes).toBe(2);
  });

  test("Q1: a waiter whose adopt() refuses abandons reuse and computes under the lock; one that accepts reuses", async () => {
    for (const accept of [true, false]) {
      rmSync(advisoryDir(root), { recursive: true, force: true });
      const entered = deferred<void>();
      const release = deferred<void>();
      let computes = 0;
      let adopted = 0;
      let holderOwner = "";
      let adoptSawOwner: string | undefined;
      const { now } = clockFrom();
      const holder = withAdvisoryResult({
        ...reader(),
        now,
        inputHash: "same",
        reusable: true,
        compute: async () => {
          computes += 1;
          holderOwner = (JSON.parse(readFileSync(advisoryLockPath(root, "check-sync"), "utf8")) as { owner: string })
            .owner;
          entered.resolve();
          await release.promise;
          return "holder-value";
        },
        sleep: yieldTurn,
      });
      await entered.promise;
      const waiter = withAdvisoryResult({
        ...reader(),
        now,
        inputHash: "same",
        reusable: true,
        adopt: () => {
          adopted += 1;
          // Adopted only once the holder has released: the lock is OWNED BY THIS CALLER here (not the
          // holder's leftover, which a release-before-adopt mutant would leave on disk).
          // Recorded, and asserted AFTER the call: an expect that throws in here is swallowed by the
          // adopt-throw guard (N3) and would read as a refusal rather than failing the test.
          adoptSawOwner = (JSON.parse(readFileSync(advisoryLockPath(root, "check-sync"), "utf8")) as { owner: string })
            .owner;
          return accept;
        },
        compute: () => {
          computes += 1;
          return "waiter-value";
        },
        sleep: yieldTurn,
      });
      release.resolve();
      const [, outcome] = await Promise.all([holder, waiter]);
      expect(adopted).toBe(1);
      expect(adoptSawOwner).toBeDefined();
      expect(adoptSawOwner).not.toBe(holderOwner);
      expect(outcome.reused).toBe(accept);
      expect(outcome.value).toBe(accept ? "holder-value" : "waiter-value");
      expect(computes).toBe(accept ? 1 : 2);
    }
  });

  // Needs an unreadable lock file, which neither Windows nor root can make: skipped VISIBLY.
  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "S1: a caller that finds the lock vanished after EEXIST still rehashes once it owns it",
    async () => {
      const path = seedLock(lockRecord({ owner: "gone-soon", updatedAt: 1_000_000 }));
      chmodSync(path, 0o000); // exists (EEXIST) but its read fails, i.e. the "snapshot === null" branch
      let rehashes = 0;
      const outcome = await withAdvisoryResult({
        ...reader(),
        inputHash: "entry",
        reusable: true,
        now: () => 1_000_000,
        isProcessAlive: () => true,
        bounds: { pollMs: 1, maxWaitMs: 10_000 },
        rehash: () => {
          rehashes += 1;
          return "after-the-holder";
        },
        compute: () => "v",
        // The holder "releases" while we sleep: the next pass takes the lock.
        sleep: async () => {
          rmSync(path, { force: true });
        },
      });
      expect(outcome.reused).toBe(false);
      expect(rehashes).toBe(1);
      const slot = JSON.parse(readFileSync(advisoryResultPath(root, "check"), "utf8")) as { inputHash: string };
      expect(slot.inputHash).toBe("after-the-holder");
    },
  );

  test("N3: an adopt() that THROWS abandons reuse and the caller computes", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const { now } = clockFrom();
    let computes = 0;
    const holder = withAdvisoryResult({
      ...reader(),
      now,
      inputHash: "same",
      reusable: true,
      compute: async () => {
        computes += 1;
        entered.resolve();
        await release.promise;
        return "holder-value";
      },
      sleep: yieldTurn,
    });
    await entered.promise;
    const waiter = withAdvisoryResult({
      ...reader(),
      now,
      inputHash: "same",
      reusable: true,
      adopt: () => {
        throw new Error("EACCES: simulated apply failure");
      },
      compute: () => {
        computes += 1;
        return "waiter-value";
      },
      sleep: yieldTurn,
    });
    release.resolve();
    const [, outcome] = await Promise.all([holder, waiter]);
    expect(outcome.reused).toBe(false);
    expect(outcome.value).toBe("waiter-value");
    expect(computes).toBe(2);
  });
});
