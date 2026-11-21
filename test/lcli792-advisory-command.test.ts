/**
 * LCLI-792 (DEC-282 items 1-4, (a7) and (a8)): the command-level seam (`commands/advisory-run.ts`)
 * that runs `lore check` / `lore sync` under the clone-wide advisory lock, plus the CLI wiring that
 * sends both commands through it.
 *
 * The fake `run` callbacks make "one compute, one reuse" observable without a real quest binary:
 * each callback is the expensive work, so counting its invocations is counting computes.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
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
  // A linked worktree is checked out through this config; with Git for Windows' default autocrlf the
  // second worktree would hold CRLF bytes, and a plan's pre-image digest (correctly) would not match.
  expect(git(dir, "config", "core.autocrlf", "false").exitCode).toBe(0);
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
const ROOT_INDEX = "# Docs\n\nRoot.\n";
const ROOT_INDEX_DIGEST = createHash("sha256").update(ROOT_INDEX, "utf8").digest("hex");
const REWRITTEN_INDEX = "# Docs\n\nRewritten.\n";

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
    // The holder emits no advisory of its own, and neither does a routine wait ((a14) Q3): the
    // waiter's stderr is exactly the holder's recorded stderr, byte for byte.
    expect(holderErr.text()).toBe("advisory line\n");
    expect(waiterOut.text()).toBe("first line\nsecond line\n");
    expect(waiterErr.text()).toBe("advisory line\n");
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
    let appliedOk: boolean | undefined;
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
        recordPlan({
          writes: [{ path: "index.md", after: "# Docs\n\nRewritten.\n", beforeDigest: ROOT_INDEX_DIGEST }],
        });
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
        appliedOk = await applySyncWritePlan(worktree, plan);
        return appliedOk;
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
    expect(appliedOk).toBe(true); // ... because the apply ACCEPTED the plan, not because it was skipped
    expect(holderCode).toBe(0);
    expect(waiterCode).toBe(0);
    expect(waiterOut.text()).toBe("updated docs/index.md\n");
    expect(readFileSync(join(worktree, "docs", "index.md"), "utf8")).toBe("# Docs\n\nRewritten.\n");
  });
});

/**
 * A holder in `holderRoot` that plans one `docs/index.md` write, parks until `release`, then applies
 * it; and a waiter in `waiterRoot` that reuses it through the REAL {@link applySyncWritePlan}.
 */
async function holderAndWaiter(
  holderRoot: string,
  waiterRoot: string,
  duringWait: () => void,
  streams?: { holder?: Writer; waiter?: Writer; holderErr?: Writer; waiterErr?: Writer },
): Promise<{ computes: number; waiterCode: number }> {
  const { now } = clockFrom();
  const entered = deferred<void>();
  const release = deferred<void>();
  let computes = 0;
  const holder = runLockedCommand<SyncWritePlan>({
    root: holderRoot,
    command: "sync",
    args: [],
    output: PLAIN,
    stdout: streams?.holder ?? sink().writer,
    stderr: streams?.holderErr ?? sink().writer,
    reusable: true,
    now,
    sleep: yieldTurn,
    run: async (stdout, stderr, recordPlan) => {
      computes += 1;
      recordPlan({ writes: [{ path: "index.md", after: REWRITTEN_INDEX, beforeDigest: ROOT_INDEX_DIGEST }] });
      entered.resolve();
      await release.promise;
      writeFileSync(join(holderRoot, "docs", "index.md"), REWRITTEN_INDEX);
      stderr.write("advisory first\n");
      stdout.write("updated docs/index.md\n");
      stderr.write("advisory last\n");
      return 0;
    },
  });
  await entered.promise;
  const waiter = runLockedCommand<SyncWritePlan>({
    root: waiterRoot,
    command: "sync",
    args: [],
    output: PLAIN,
    stdout: streams?.waiter ?? sink().writer,
    stderr: streams?.waiterErr ?? sink().writer,
    reusable: true,
    now,
    sleep: yieldTurn,
    applyPlan: (plan) => applySyncWritePlan(waiterRoot, plan),
    run: async (stdout) => {
      computes += 1;
      stdout.write("recomputed\n");
      return 0;
    },
  });
  duringWait();
  release.resolve();
  const [, waiterCode] = await Promise.all([holder, waiter]);
  return { computes, waiterCode };
}

describe("a reused sync plan is applied under the lock and only over what the holder planned against (DEC-282 (a14) Q1)", () => {
  test("a SAME-worktree sync waiter reuses (computes === 1): the holder's writes are already there", async () => {
    gitRepoWithDocs(root);
    const { computes, waiterCode } = await holderAndWaiter(root, root, () => {});
    expect(computes).toBe(1);
    expect(waiterCode).toBe(0);
    expect(readFileSync(join(root, "docs", "index.md"), "utf8")).toBe(REWRITTEN_INDEX);
  });

  test("an edit made to a plan file DURING the wait survives: reuse is abandoned and the waiter recomputes", async () => {
    const main = join(root, "main");
    gitRepoWithDocs(main);
    const worktree = join(root, "wt");
    expect(git(main, "worktree", "add", "--detach", worktree, "HEAD").exitCode).toBe(0);
    const edited = "# Docs\n\nA human edit made while the holder was running.\n";
    const out = sink();
    const { computes } = await holderAndWaiter(
      main,
      worktree,
      () => writeFileSync(join(worktree, "docs", "index.md"), edited),
      { waiter: out.writer },
    );
    expect(computes).toBe(2); // the plan was refused, so the waiter ran its own computation
    expect(out.text()).toBe("recomputed\n"); // ... and replayed nothing of the holder's
    expect(readFileSync(join(worktree, "docs", "index.md"), "utf8")).toBe(edited);
  });

  test("a clean ANOTHER-worktree waiter still takes the plan (the control for the refusal above)", async () => {
    const main = join(root, "main");
    gitRepoWithDocs(main);
    const worktree = join(root, "wt");
    expect(git(main, "worktree", "add", "--detach", worktree, "HEAD").exitCode).toBe(0);
    const { computes } = await holderAndWaiter(main, worktree, () => {});
    expect(computes).toBe(1);
    expect(readFileSync(join(worktree, "docs", "index.md"), "utf8")).toBe(REWRITTEN_INDEX);
  });
});

describe("applySyncWritePlan judges each file by its RAW bytes (round-3 S2a, N1)", () => {
  const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

  test("an ABSENT pre-image: written when the file is still absent, refused when it appeared meanwhile", async () => {
    gitRepoWithDocs(root);
    const plan: SyncWritePlan = { writes: [{ path: "fresh.md", after: "# Fresh\n", beforeDigest: null }] };
    // Absent -> the pre-image holds -> written.
    expect(await applySyncWritePlan(root, plan)).toBe(true);
    expect(readFileSync(join(root, "docs", "fresh.md"), "utf8")).toBe("# Fresh\n");
    // Already equal to `after` -> skipped, still true.
    expect(await applySyncWritePlan(root, plan)).toBe(true);
    // Appeared with DIFFERENT bytes during the wait -> refused, and nothing is overwritten.
    writeFileSync(join(root, "docs", "fresh.md"), "# A human wrote this first\n");
    expect(await applySyncWritePlan(root, plan)).toBe(false);
    expect(readFileSync(join(root, "docs", "fresh.md"), "utf8")).toBe("# A human wrote this first\n");
  });

  test("invalid UTF-8 that decodes to the SAME text as the pre-image is still a different file", async () => {
    gitRepoWithDocs(root);
    const planned = Buffer.from([0x23, 0x20, 0xff, 0x0a]); // "# \xff\n": decodes to "# \uFFFD\n"
    const edited = Buffer.from([0x23, 0x20, 0xfe, 0x0a]); // a different byte, the same decoded text
    expect(planned.toString("utf8")).toBe(edited.toString("utf8"));
    writeFileSync(join(root, "docs", "raw.md"), edited);
    const plan: SyncWritePlan = {
      writes: [{ path: "raw.md", after: "# fixed\n", beforeDigest: sha(planned) }],
    };
    expect(await applySyncWritePlan(root, plan)).toBe(false);
    expect(readFileSync(join(root, "docs", "raw.md"))).toEqual(edited);

    // The control: the file still holds EXACTLY the planned raw bytes, so the plan applies.
    writeFileSync(join(root, "docs", "raw.md"), planned);
    expect(await applySyncWritePlan(root, plan)).toBe(true);
    expect(readFileSync(join(root, "docs", "raw.md"), "utf8")).toBe("# fixed\n");
  });
});

describe("a replay interleaves stdout and stderr exactly as the holder wrote them (round-2 finding 3)", () => {
  test("under one combined sink the waiter's order equals the holder's", async () => {
    gitRepoWithDocs(root);
    const holderLog: string[] = [];
    const waiterLog: string[] = [];
    const tag = (log: string[], stream: string): Writer => ({ write: (chunk) => void log.push(`${stream}:${chunk}`) });
    await holderAndWaiter(root, root, () => {}, {
      holder: tag(holderLog, "out"),
      holderErr: tag(holderLog, "err"),
      waiter: tag(waiterLog, "out"),
      waiterErr: tag(waiterLog, "err"),
    });
    expect(holderLog).toEqual(["err:advisory first\n", "out:updated docs/index.md\n", "err:advisory last\n"]);
    expect(waiterLog).toEqual(holderLog);
  });
});

describe("a failure to find the common dir INSIDE a repository is not silent (round-2 finding 4)", () => {
  const failing = (stderr: string) => (): { ok: false; stdout: string; stderr: string } => ({
    ok: false,
    stdout: "",
    stderr,
  });

  test("a safe.directory refusal writes the one unlocked line and still runs the command", async () => {
    const err = sink();
    let ran = 0;
    const code = await runLockedCommand({
      root,
      command: "check",
      args: [],
      output: PLAIN,
      stdout: sink().writer,
      stderr: err.writer,
      reusable: true,
      git: failing("fatal: detected dubious ownership in repository at '/x'"),
      run: () => {
        ran += 1;
        return 3;
      },
    });
    expect(code).toBe(3);
    expect(ran).toBe(1);
    expect(err.lines()).toHaveLength(1);
    expect(err.text()).toContain("dubious ownership");
    expect(err.text()).toContain("running unlocked");
  });

  test("'not a git repository' stays silent", async () => {
    const err = sink();
    const code = await runLockedCommand({
      root,
      command: "check",
      args: [],
      output: PLAIN,
      stdout: sink().writer,
      stderr: err.writer,
      reusable: true,
      git: failing("fatal: not a git repository (or any of the parent directories): .git"),
      run: () => 0,
    });
    expect(code).toBe(0);
    expect(err.text()).toBe("");
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
