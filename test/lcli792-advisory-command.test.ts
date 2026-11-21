/**
 * LCLI-792 (DEC-282 item 2): the command-level seam (`commands/advisory-run.ts`) that runs
 * `lore check` / `lore sync` under the clone-wide advisory lock, plus the CLI wiring that sends
 * both commands through it.
 *
 * The fake `run` callbacks make "one compute, one reuse" observable without a real quest binary:
 * each callback is the expensive work, so counting its invocations is counting computes.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { runLockedCommand } from "../src/commands/advisory-run";
import { advisoryResultPath, resolveGitCommonDir } from "../src/core/advisory-lock";
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

function gitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  expect(git(dir, "init").exitCode).toBe(0);
  writeFileSync(join(dir, "README.md"), "hello\n");
  expect(git(dir, "add", "-A").exitCode).toBe(0);
  expect(git(dir, "commit", "-m", "init").exitCode).toBe(0);
}

function sink(): { readonly writer: Writer; text: () => string } {
  let text = "";
  return { writer: { write: (chunk) => (text += chunk) }, text: () => text };
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

describe("a concurrent waiter replays the holder's captured output", () => {
  test("same tree and arguments: one compute, one reuse, identical bytes and exit code", async () => {
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
      () =>
      async (stdout: Writer, stderr: Writer): Promise<number> => {
        computes += 1;
        entered.resolve();
        await release.promise;
        stdout.write("report line\n");
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
      run: makeRun(),
    });
    await entered.promise;
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
      run: makeRun(),
    });
    release.resolve();
    const [holderCode, waiterCode] = await Promise.all([holder, waiter]);

    expect(computes).toBe(1);
    expect(holderCode).toBe(7);
    expect(waiterCode).toBe(7);
    expect(holderOut.text()).toBe("report line\n");
    expect(waiterOut.text()).toBe("report line\n"); // replayed, not recomputed
    expect(holderErr.text()).toBe("advisory line\n");
    expect(waiterErr.text()).toBe("advisory line\n");
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

describe("a thrown run is never cached and loses no emitted output", () => {
  test("partial output reaches the real sinks and nothing is stored", async () => {
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
});

describe("non-reusable and non-repository runs still work", () => {
  test("reusable:false serializes but every caller computes", async () => {
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
    const options = {
      root,
      command: "check" as const,
      args: [] as string[],
      output: PLAIN,
      reusable: false,
      now,
      sleep: yieldTurn,
      run: runStub,
      stdout: sink().writer,
      stderr: sink().writer,
    };
    const first = runLockedCommand(options);
    await entered.promise;
    const second = runLockedCommand(options);
    release.resolve();
    await Promise.all([first, second]);
    expect(computes).toBe(2);
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

describe("the CLI dispatcher sends check and sync through the advisory wrapper", () => {
  test("check writes the advisory result slot under the git common dir", async () => {
    gitRepo(root);
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
    const out = sink();
    const err = sink();
    const code = await run(["bun", "lore", "check"], { cwd: root, stdout: out.writer, stderr: err.writer });
    expect(code).toBe(0);
    const common = resolveGitCommonDir(root) as string;
    expect(existsSync(advisoryResultPath(common, "check"))).toBe(true);
    const slot = JSON.parse(readFileSync(advisoryResultPath(common, "check"), "utf8")) as { inputHash: string };
    expect(typeof slot.inputHash).toBe("string");
  });

  test("sync --dry-run writes the advisory result slot for its own namespace", async () => {
    gitRepo(root);
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
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
});
