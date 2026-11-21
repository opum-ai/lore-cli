/**
 * LCLI-792 (DEC-282 items 1-4, (a7) and (a8)): the command-level seam (`commands/advisory-run.ts`)
 * that runs `lore check` / `lore sync` under the clone-wide advisory lock, plus the CLI wiring that
 * sends both commands through it.
 *
 * The fake `run` callbacks make "one compute, one reuse" observable without a real quest binary:
 * each callback is the expensive work, so counting its invocations is counting computes.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { runLockedCommand } from "../src/commands/advisory-run";
import { applySyncWritePlan, runSync, type SyncWritePlan } from "../src/commands/sync";
import { advisoryDir, advisoryLockPath, advisoryResultPath, resolveGitCommonDir } from "../src/core/advisory-lock";
import type { OutputContext, Writer } from "../src/output";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-792-cmd-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  return Bun.spawnSync(["git", "-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
}

/** A repository with a minimal, valid docs bundle, committed at HEAD. */
function gitRepoWithDocs(dir: string): void {
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "hello\n");
  writeFileSync(join(dir, "docs", "index.md"), "# Docs\n\nRoot.\n");
  writeFileSync(
    join(dir, "docs", "story.md"),
    "---\ntype: Story\ntitle: A story\ndescription: Example story\n---\n\nBody.\n",
  );
  expect(git(dir, "init", "--initial-branch=main").exitCode).toBe(0);
  expect(git(dir, "add", "-A").exitCode).toBe(0);
  expect(git(dir, "commit", "-m", "init").exitCode).toBe(0);
}

/** The same docs tree in a plain directory (no git): a second checkout of one pre-run state. */
function seedDocs(dir: string): void {
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "index.md"), "# Docs\n\nRoot.\n");
  writeFileSync(
    join(dir, "docs", "story.md"),
    "---\ntype: Story\ntitle: A story\ndescription: Example story\n---\n\nBody.\n",
  );
}

/** A `docs/`-only repo for the real CLI tests (no tracker, nothing to reconcile). */
function gitRepo(dir: string): void {
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "README.md"), "hello\n");
  writeFileSync(join(dir, "docs", "index.md"), "# Docs\n\nRoot.\n");
  expect(git(dir, "init", "--initial-branch=main").exitCode).toBe(0);
  expect(git(dir, "add", "-A").exitCode).toBe(0);
  expect(git(dir, "commit", "-m", "init").exitCode).toBe(0);
}

function sink(): { readonly writer: Writer; text: () => string; lines: () => string[] } {
  let text = "";
  return {
    writer: { write: (chunk) => (text += chunk) },
    text: () => text,
    lines: () => text.split("\n").filter((line) => line !== ""),
  };
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

function clockFrom(start = 1_000_000) {
  const clock = { value: start };
  return { now: () => clock.value++, value: () => clock.value };
}

const yieldTurn = () => new Promise<void>((done) => setTimeout(done, 0));
const PLAIN: OutputContext = { mode: "plain", color: false };

describe("the holder streams its output and a waiter replays the recording (DEC-282 (a7) item 1)", () => {
  test("the holder's output reaches its sinks as it runs, and the waiter replays the same bytes and code", async () => {
    gitRepo(root);
    const { now } = clockFrom();
    const entered = deferred<void>();
    const release = deferred<void>();
    let computes = 0;
    const holderOut = sink();
    const holderErr = sink();
    const waiterOut = sink();
    const waiterErr = sink();

    const makeRun =
      (writeFirst: boolean) =>
      async (stdout: Writer, stderr: Writer): Promise<number> => {
        computes += 1;
        if (writeFirst) stdout.write("first line\n");
        entered.resolve();
        await release.promise;
        stdout.write("second line\n");
        stderr.write("advisory line\n");
        return 7;
      };

    const holder = runLockedCommand({
      root,
      command: "check",
      args: [],
      output: PLAIN,
      stdout: holderOut.writer,
      stderr: holderErr.writer,
      reusable: true,
      now,
      sleep: yieldTurn,
      run: makeRun(true),
    });
    await entered.promise;
    // STREAMING, not buffering: the first line is on the real sink while the run is still blocked.
    expect(holderOut.text()).toBe("first line\n");

    const waiter = runLockedCommand({
      root,
      command: "check",
      args: [],
      output: PLAIN,
      stdout: waiterOut.writer,
      stderr: waiterErr.writer,
      reusable: true,
      now,
      sleep: yieldTurn,
      run: makeRun(false),
    });
    release.resolve();
    const [holderCode, waiterCode] = await Promise.all([holder, waiter]);

    expect(computes).toBe(1);
    expect(holderCode).toBe(7);
    expect(waiterCode).toBe(7);
    expect(holderOut.text()).toBe("first line\nsecond line\n");
    // The holder emits no advisory of its own; the waiter emits exactly one waiting line and then
    // replays the holder's recorded stderr byte-for-byte.
    expect(holderErr.text()).toBe("advisory line\n");
    expect(waiterOut.text()).toBe("first line\nsecond line\n");
    expect(waiterErr.lines().filter((line) => line.includes("waiting for another lore check/sync run"))).toHaveLength(
      1,
    );
    expect(waiterErr.text().endsWith("advisory line\n")).toBe(true);
  });

  test("a changed tree between the two starts is NOT reused", async () => {
    gitRepo(root);
    const { now } = clockFrom();
    const entered = deferred<void>();
    const release = deferred<void>();
    let computes = 0;
    const runStub = async (_stdout: Writer, _stderr: Writer): Promise<number> => {
      computes += 1;
      entered.resolve();
      await release.promise;
      return 0;
    };

    const holder = runLockedCommand({
      root,
      command: "check",
      args: [],
      output: PLAIN,
      stdout: sink().writer,
      stderr: sink().writer,
      reusable: true,
      now,
      sleep: yieldTurn,
      run: runStub,
    });
    await entered.promise;
    writeFileSync(join(root, "README.md"), "changed while the holder ran\n");
    const second = runLockedCommand({
      root,
      command: "check",
      args: [],
      output: PLAIN,
      stdout: sink().writer,
      stderr: sink().writer,
      reusable: true,
      now,
      sleep: yieldTurn,
      run: runStub,
    });
    release.resolve();
    await Promise.all([holder, second]);
    expect(computes).toBe(2);
  });
});

describe("a thrown or non-reusable run", () => {
  test("a thrown run keeps the output it already streamed and caches nothing", async () => {
    gitRepo(root);
    const out = sink();
    const err = sink();
    await expect(
      runLockedCommand({
        root,
        command: "check",
        args: [],
        output: PLAIN,
        stdout: out.writer,
        stderr: err.writer,
        reusable: true,
        run: async (stdout) => {
          stdout.write("partial report\n");
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");
    expect(out.text()).toBe("partial report\n");
    const common = resolveGitCommonDir(root) as string;
    expect(existsSync(advisoryResultPath(common, "check"))).toBe(false);
  });

  test("reusable:false serializes, streams, and writes no result slot", async () => {
    gitRepo(root);
    const { now } = clockFrom();
    const entered = deferred<void>();
    const release = deferred<void>();
    let computes = 0;
    const firstOut = sink();
    const runStub = async (stdout: Writer): Promise<number> => {
      computes += 1;
      stdout.write("live line\n");
      entered.resolve();
      await release.promise;
      return 0;
    };
    const options = {
      root,
      command: "check" as const,
      args: [] as string[],
      output: PLAIN,
      reusable: false,
      now,
      sleep: yieldTurn,
      run: runStub,
      stdout: firstOut.writer,
      stderr: sink().writer,
    };
    const first = runLockedCommand(options);
    await entered.promise;
    expect(firstOut.text()).toBe("live line\n");
    const second = runLockedCommand({ ...options, stdout: sink().writer, stderr: sink().writer });
    release.resolve();
    await Promise.all([first, second]);
    expect(computes).toBe(2);
    const common = resolveGitCommonDir(root) as string;
    expect(existsSync(advisoryResultPath(common, "check"))).toBe(false);
  });

  test("a root that is not a git repository runs without a lock or a result slot", async () => {
    let computes = 0;
    const out = sink();
    const runStub = async (stdout: Writer): Promise<number> => {
      computes += 1;
      stdout.write("done\n");
      return 0;
    };
    const options = {
      root,
      command: "check" as const,
      args: [] as string[],
      output: PLAIN,
      reusable: true,
      run: runStub,
      stdout: out.writer,
      stderr: sink().writer,
    };
    expect(await runLockedCommand(options)).toBe(0);
    expect(await runLockedCommand(options)).toBe(0);
    expect(computes).toBe(2);
    expect(out.text()).toBe("done\ndone\n");
    expect(existsSync(join(root, ".git"))).toBe(false);
  });
});

describe("sync reuses the COMPUTATION and applies it to the waiter's own checkout (DEC-282 (a7) item 2)", () => {
  test("a real sync records a write plan that reproduces its docs in another checkout", async () => {
    const main = join(root, "main");
    gitRepoWithDocs(main);
    const plans: SyncWritePlan[] = [];
    const code = await runSync({
      root: main,
      output: PLAIN,
      args: [],
      stdout: sink().writer,
      stderr: sink().writer,
      planSink: (plan) => plans.push(plan),
    });
    expect(code).toBe(0);
    expect(plans).toHaveLength(1);
    const writes = plans[0]?.writes ?? [];
    expect(writes.map((write) => write.path).sort()).toContain("index.md");

    // A second checkout of the same PRE-RUN tree receives the computation's bytes.
    const other = join(root, "other");
    seedDocs(other);
    await applySyncWritePlan(other, plans[0] as SyncWritePlan);
    for (const write of writes) {
      expect(readFileSync(join(other, "docs", write.path), "utf8")).toBe(
        readFileSync(join(main, "docs", write.path), "utf8"),
      );
    }
  });

  test("a --dry-run sync records no plan (nothing is written, so there is nothing to apply)", async () => {
    const main = join(root, "main");
    gitRepoWithDocs(main);
    const plans: SyncWritePlan[] = [];
    await runSync({
      root: main,
      output: PLAIN,
      args: ["--dry-run"],
      stdout: sink().writer,
      stderr: sink().writer,
      planSink: (plan) => plans.push(plan),
    });
    expect(plans).toHaveLength(0);
  });

  test("a waiting sync in ANOTHER worktree applies the holder's plan to its own files", async () => {
    const main = join(root, "main");
    gitRepoWithDocs(main);
    const worktree = join(root, "wt");
    expect(git(main, "worktree", "add", "--detach", worktree, "HEAD").exitCode).toBe(0);
    const { now } = clockFrom();
    const entered = deferred<void>();
    const release = deferred<void>();
    let computes = 0;
    let applied = 0;
    const waiterOut = sink();

    const holder = runLockedCommand<SyncWritePlan>({
      root: main,
      command: "sync",
      args: [],
      output: PLAIN,
      stdout: sink().writer,
      stderr: sink().writer,
      reusable: true,
      now,
      sleep: yieldTurn,
      run: async (stdout, _stderr, recordPlan) => {
        computes += 1;
        recordPlan({ writes: [{ path: "index.md", after: "# Docs\n\nRewritten.\n" }] });
        entered.resolve();
        await release.promise;
        writeFileSync(join(main, "docs", "index.md"), "# Docs\n\nRewritten.\n");
        stdout.write("updated docs/index.md\n");
        return 0;
      },
    });
    await entered.promise;
    const waiter = runLockedCommand<SyncWritePlan>({
      root: worktree,
      command: "sync",
      args: [],
      output: PLAIN,
      stdout: waiterOut.writer,
      stderr: sink().writer,
      reusable: true,
      now,
      sleep: yieldTurn,
      applyPlan: async (plan) => {
        applied += 1;
        await applySyncWritePlan(worktree, plan);
      },
      run: async () => {
        computes += 1;
        return 0;
      },
    });
    release.resolve();
    const [holderCode, waiterCode] = await Promise.all([holder, waiter]);

    expect(computes).toBe(1); // the task read ran once
    expect(applied).toBe(1); // ... and its result landed in the WAITER's tree
    expect(holderCode).toBe(0);
    expect(waiterCode).toBe(0);
    expect(waiterOut.text()).toBe("updated docs/index.md\n");
    expect(readFileSync(join(worktree, "docs", "index.md"), "utf8")).toBe("# Docs\n\nRewritten.\n");
  });
});

describe("the unlocked paths write exactly ONE stderr line and change nothing else (DEC-282 (a8) rule 3)", () => {
  test("an expired wait: one stderr line, empty stdout, the command's unchanged exit code", async () => {
    gitRepo(root);
    const common = resolveGitCommonDir(root) as string;
    mkdirSync(advisoryDir(common), { recursive: true });
    writeFileSync(
      advisoryLockPath(common, "check-sync"),
      JSON.stringify({
        schema: 1,
        owner: "live-holder",
        pid: process.pid,
        hostname: hostname(),
        processStartIdentity: null,
        acquiredAt: 1_000_000,
        updatedAt: 1_000_000,
      }),
    );
    const out = sink();
    const err = sink();
    const code = await runLockedCommand({
      root,
      command: "check",
      args: [],
      output: PLAIN,
      stdout: out.writer,
      stderr: err.writer,
      reusable: false,
      now: () => 1_000_000,
      bounds: { maxWaitMs: 0 },
      sleep: yieldTurn,
      run: async () => 7,
    });
    expect(code).toBe(7);
    expect(out.text()).toBe("");
    expect(err.lines()).toHaveLength(1);
    expect(err.lines()[0]).toContain("unlocked");
  });

  test("a broken mechanism at the command level: one stderr line, empty stdout, unchanged exit code", async () => {
    gitRepo(root);
    const common = resolveGitCommonDir(root) as string;
    mkdirSync(join(common, "lore"), { recursive: true });
    writeFileSync(advisoryDir(common), "");
    const out = sink();
    const err = sink();
    const code = await runLockedCommand({
      root,
      command: "sync",
      args: [],
      output: PLAIN,
      stdout: out.writer,
      stderr: err.writer,
      reusable: true,
      run: async (stdout) => {
        stdout.write("report\n");
        return 0;
      },
    });
    expect(code).toBe(0);
    expect(out.text()).toBe("report\n");
    expect(err.lines()).toHaveLength(1);
    expect(err.lines()[0]).toContain("unlocked");
  });
});

describe("the CLI dispatcher sends check and sync through the advisory wrapper", () => {
  test("check writes the advisory result slot under the git common dir", async () => {
    gitRepo(root);
    // A REAL finding, so the no-absolute-path claim is measured on a finding line, not just a summary.
    writeFileSync(join(root, "docs", "broken.md"), "# Broken\n\nSee [missing](missing.md).\n");
    const out = sink();
    const err = sink();
    const code = await run(["bun", "lore", "check"], { cwd: root, stdout: out.writer, stderr: err.writer });
    expect(code).toBe(6);
    const common = resolveGitCommonDir(root) as string;
    expect(existsSync(advisoryResultPath(common, "check"))).toBe(true);
    const slot = JSON.parse(readFileSync(advisoryResultPath(common, "check"), "utf8")) as { inputHash: string };
    expect(typeof slot.inputHash).toBe("string");
    // check output names no absolute path, so replaying it from another worktree is byte-identical.
    expect(out.text()).toContain("broken.md");
    expect(out.text()).not.toContain(root);
  });

  test("sync --dry-run writes the advisory result slot for its own namespace", async () => {
    gitRepo(root);
    const out = sink();
    const err = sink();
    const code = await run(["bun", "lore", "sync", "--dry-run"], {
      cwd: root,
      stdout: out.writer,
      stderr: err.writer,
    });
    expect(code).toBe(0);
    const common = resolveGitCommonDir(root) as string;
    expect(existsSync(advisoryResultPath(common, "sync"))).toBe(true);
  });

  test("a broken lock mechanism does not change check's exit code or stdout, and writes one stderr line", async () => {
    gitRepo(root);
    mkdirSync(join(root, ".git", "lore"), { recursive: true });
    writeFileSync(join(root, ".git", "lore", "advisory"), "");
    const out = sink();
    const err = sink();
    const code = await run(["bun", "lore", "check"], { cwd: root, stdout: out.writer, stderr: err.writer });
    expect(code).toBe(0);
    expect(out.text()).toContain("0 errors");
    expect(err.lines()).toHaveLength(1);
    expect(err.lines()[0]).toContain("unlocked");
  });
});
