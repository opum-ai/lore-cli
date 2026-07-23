import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogTaskDetail } from "../src/adapters/backlog";
import { run } from "../src/cli";
import { runTasks, type TaskRollup, type TasksOptions } from "../src/commands/tasks";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, fakeAdapter, makeTask, storyDoc } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };
const PRETTY_CTX: OutputContext = { mode: "pretty", color: true };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-tasks-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a bundle file under `docs/` (path relative to `docs/`). */
function writeDoc(rel: string, contents: string): void {
  const abs = join(root, "docs", rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

/** A Story linking `taskIds`, written at `docs/stories/<stem>.md`. */
function writeStory(stem: string, taskIds: string[]): void {
  writeDoc(`stories/${stem}.md`, storyDoc(stem, taskIds));
}

/**
 * Like {@link writeStory}, but with a `summary:` present in the frontmatter — {@link storyDoc}
 * omits one, which is fine for every other test here, but it makes `loadBundle` add its own
 * unrelated "missing `summary`" advisory to stderr (schema.ts's `warnSummary`). The two
 * empty-stderr tests below (LORE-211) need stderr to carry ONLY what the assertion is about —
 * whether a dangling advisory leaked — so they use this instead of picking that load-time noise
 * apart from the thing under test.
 */
function writeStoryWithSummary(stem: string, taskIds: string[]): void {
  const tasksYaml = taskIds.map((t) => `\n  - ${t}`).join("");
  writeDoc(
    `stories/${stem}.md`,
    `---\ntype: Story\ntitle: ${stem}\nsummary: A summary for ${stem}.\ntasks:${tasksYaml}\n---\n` +
      `# ${stem}\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n`,
  );
}

/** A {@link fakeAdapter} whose capability probe passes — `lore tasks` probes Backlog up front. */
function okAdapter(seed: Parameters<typeof fakeAdapter>[0]): ReturnType<typeof fakeAdapter> {
  return fakeAdapter(seed, { probe: "ok" });
}

/** Run `tasks` in JSON mode and return the parsed `data` payload, exit code, and captured stderr. */
async function rollupJson(
  args: string[],
  options?: Partial<TasksOptions>,
): Promise<{ code: number; data: TaskRollup; stderr: string }> {
  const stdout = capture();
  const stderr = capture();
  const code = await runTasks({ root, output: JSON_CTX, stdout, stderr, args, ...options });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: TaskRollup };
  expect(envelope.kind).toBe("tasks.rollup");
  return { code, data: envelope.data, stderr: stderr.text() };
}

/** Assert the promise `fn` returns rejects with a {@link LoreError} of `type`, returning it. */
async function expectRejection(type: LoreError["type"], fn: () => Promise<unknown>): Promise<LoreError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe(type);
    return err as LoreError;
  }
  throw new Error(`expected a ${type} LoreError, but it resolved`);
}

describe("runTasks — the live rollup (AC#1, AC#2)", () => {
  test("emits a tasks.rollup with the concept and its linked tasks' live status, in tasks: order", async () => {
    writeStory("bulk", ["LORE-1", "LORE-2"]);
    const adapter = okAdapter([
      makeTask("LORE-1", { title: "First", status: "Done" }),
      makeTask("LORE-2", { title: "Second", status: "In Progress" }),
    ]);
    const { code, data } = await rollupJson(["stories/bulk"], { adapter });
    expect(code).toBe(0);
    expect(data.concept).toBe("stories/bulk");
    expect(data.status).toBeUndefined();
    expect(data.tasks).toEqual([
      { id: "LORE-1", title: "First", status: "Done" },
      { id: "LORE-2", title: "Second", status: "In Progress" },
    ]);
  });

  test("reflects CURRENT Backlog status, not the doc's stored status (AC#2)", async () => {
    // The Story's own written status is irrelevant — the rollup reads it fresh from the adapter.
    writeDoc("stories/bulk.md", storyDoc("bulk", ["LORE-1"], "done"));
    const adapter = okAdapter([makeTask("LORE-1", { status: "To Do" })]);
    const { data } = await rollupJson(["stories/bulk"], { adapter });
    expect(data.tasks).toEqual([{ id: "LORE-1", title: "Title for LORE-1", status: "To Do" }]);
  });

  test("--status filters case-insensitively and echoes the CANONICAL matched status, not the raw input", async () => {
    writeStory("bulk", ["LORE-1", "LORE-2", "LORE-3"]);
    const adapter = okAdapter([
      makeTask("LORE-1", { status: "Done" }),
      makeTask("LORE-2", { status: "In Progress" }),
      makeTask("LORE-3", { status: "Done" }),
    ]);
    const { data } = await rollupJson(["stories/bulk", "--status", "done"], { adapter });
    // Echoed status agrees in case with the rows it selected (canonicalized to Backlog's "Done").
    expect(data.status).toBe("Done");
    expect(data.tasks.map((t) => t.id)).toEqual(["LORE-1", "LORE-3"]);
    expect(data.tasks.every((t) => t.status === data.status)).toBe(true);
  });

  test("--status matching nothing echoes the raw filter and returns an empty rollup (exit 0)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1", { status: "Done" })]);
    const { code, data } = await rollupJson(["stories/bulk", "--status", "Blocked"], { adapter });
    expect(code).toBe(0);
    expect(data.status).toBe("Blocked"); // nothing to canonicalize against → the raw filter
    expect(data.tasks).toEqual([]);
  });

  test("the id positional is idFromPath-normalized (path/.md forms resolve)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1")]);
    const { code, data } = await rollupJson(["stories/bulk.md"], { adapter });
    expect(code).toBe(0);
    expect(data.concept).toBe("stories/bulk");
  });

  test("a concept with no linked tasks yields an empty rollup WITHOUT probing Backlog", async () => {
    writeDoc("reference/x.md", "---\ntype: Reference\ntitle: X\n---\nBody.\n");
    // probe would throw if it ran; an empty tasks: must short-circuit before any adapter call.
    const adapter = fakeAdapter([], { probe: new LoreError("validation", "probe must not run", "") });
    const { code, data } = await rollupJson(["reference/x"], { adapter });
    expect(code).toBe(0);
    expect(data.tasks).toEqual([]);
  });
});

describe("runTasks — dangling links (soft) vs failures (hard)", () => {
  test("a tasks: id Backlog no longer knows is dropped from the rollup with a stderr advisory, exit 0", async () => {
    writeStory("bulk", ["LORE-1", "GONE-9"]);
    const adapter = okAdapter([makeTask("LORE-1", { status: "Done" })]); // GONE-9 not seeded → viewTask null
    const { code, data, stderr } = await rollupJson(["stories/bulk"], { adapter });
    expect(code).toBe(0);
    expect(data.tasks.map((t) => t.id)).toEqual(["LORE-1"]);
    expect(stderr).toContain("GONE-9");
    expect(stderr.toLowerCase()).toContain("not in backlog");
    expect(stderr.startsWith("warning:")).toBe(true); // routed through the shared WarningCollector
  });

  test("a Backlog READ failure (drift) propagates as a hard error, never a dangling advisory", async () => {
    writeStory("bulk", ["LORE-1"]);
    const base = okAdapter([makeTask("LORE-1")]);
    const adapter = {
      ...base,
      async viewTask(): Promise<never> {
        throw new LoreError("drift", "backlog read drift", "");
      },
    };
    await expectRejection("drift", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["stories/bulk"], adapter }),
    );
  });

  test("LORE-211: a failing id BEFORE a co-present dangling id still hard-fails, with NO dangling advisory leaked (AC#1, AC#2)", async () => {
    // tasks: order is [LORE-1 (fails), GONE-9 (dangling, unseeded)]. resolveRollup's in-order scan
    // must hit the LORE-1 rejection at i=0 and throw immediately — never reaching GONE-9's dangling
    // branch or the post-loop warnDangling call — so nothing is ever written to either stream.
    writeStoryWithSummary("bulk", ["LORE-1", "GONE-9"]);
    const base = okAdapter([]); // GONE-9 stays dangling via the base's unseeded viewTask (-> null)
    const adapter = {
      ...base,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        if (id.toLowerCase() === "lore-1") {
          throw new LoreError("drift", "backlog read drift", "");
        }
        return base.viewTask(id);
      },
    };
    const stdout = capture();
    const stderr = capture();
    await expectRejection("drift", () =>
      runTasks({ root, output: JSON_CTX, stdout, stderr, args: ["stories/bulk"], adapter }),
    );
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toBe("");
  });

  test("LORE-211: a dangling id BEFORE a co-present failing id STILL hard-fails (order-independent), with NO dangling advisory leaked (AC#1, AC#2)", async () => {
    // Same pair, reversed tasks: order: [GONE-9 (dangling, unseeded), LORE-1 (fails)]. The in-order
    // scan pushes GONE-9 onto the dangling list at i=0 (a fulfilled null, not a rejection) and only
    // THEN reaches LORE-1's rejection at i=1 and throws — proving warnDangling (which runs only
    // after the whole loop completes) never fires, regardless of which side of the pair fails.
    writeStoryWithSummary("bulk", ["GONE-9", "LORE-1"]);
    const base = okAdapter([]);
    const adapter = {
      ...base,
      async viewTask(id: string): Promise<BacklogTaskDetail | null> {
        if (id.toLowerCase() === "lore-1") {
          throw new LoreError("drift", "backlog read drift", "");
        }
        return base.viewTask(id);
      },
    };
    const stdout = capture();
    const stderr = capture();
    await expectRejection("drift", () =>
      runTasks({ root, output: JSON_CTX, stdout, stderr, args: ["stories/bulk"], adapter }),
    );
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toBe("");
  });

  test("LORE-125: a viewTask detail whose id disagrees with the requested id is a hard not_found error, never a silently wrong row", async () => {
    // A stub adapter that always answers with SOME OTHER task's detail, regardless of what id was
    // requested — resolveRollup must not trust `result.value.id` blindly, or this concept's rollup
    // would silently attribute "Wrong task entirely" / "Done" to lore-1's own row.
    writeStory("bulk", ["LORE-1"]);
    const base = okAdapter([]);
    const adapter = {
      ...base,
      async viewTask(): Promise<BacklogTaskDetail | null> {
        return makeTask("LORE-999", { status: "Done", title: "Wrong task entirely" });
      },
    };
    const err = await expectRejection("not_found", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["stories/bulk"], adapter }),
    );
    expect(err.message).toContain("LORE-1");
    expect(err.message).toContain("LORE-999");
  });
});

describe("runTasks — Backlog capability probe fails fast", () => {
  test("an incapable binary (probe validation) surfaces as validation (exit 6), before any read", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")], { probe: new LoreError("validation", "not --json-capable", "") });
    await expectRejection("validation", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["stories/bulk"], adapter }),
    );
  });

  test("a missing binary (probe not_found) surfaces as not_found (exit 3)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")], { probe: new LoreError("not_found", "backlog not on PATH", "") });
    await expectRejection("not_found", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["stories/bulk"], adapter }),
    );
  });
});

describe("runTasks — resolution and parse errors", () => {
  test("an <id> not in the bundle is a not_found error (exit 3)", async () => {
    const err = await expectRejection("not_found", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["stories/ghost"] }),
    );
    expect(err.message).toContain("stories/ghost");
  });

  test("a missing <id> is a usage error (exit 2)", async () => {
    await expectRejection("usage", () => runTasks({ root, output: JSON_CTX, stdout: capture(), args: [] }));
  });

  test("a second positional is a usage error (exit 2)", async () => {
    await expectRejection("usage", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), args: ["stories/bulk", "extra"] }),
    );
  });

  test("an unknown flag is a usage error (exit 2)", async () => {
    await expectRejection("usage", () => runTasks({ root, output: JSON_CTX, stdout: capture(), args: ["--bogus"] }));
  });

  test("--status given twice is a usage error (exit 2)", async () => {
    await expectRejection("usage", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), args: ["stories/bulk", "--status", "a", "--status", "b"] }),
    );
  });

  test("--status without a value is a usage error (exit 2)", async () => {
    await expectRejection("usage", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), args: ["stories/bulk", "--status"] }),
    );
  });
});

describe("runTasks — text rendering", () => {
  test("plain lists the concept, the count, and an aligned row per task; no ANSI", async () => {
    writeStory("bulk", ["LORE-1", "LORE-2"]);
    const adapter = okAdapter([
      makeTask("LORE-1", { title: "First", status: "Done" }),
      makeTask("LORE-2", { title: "Second", status: "To Do" }),
    ]);
    const stdout = capture();
    const code = await runTasks({
      root,
      output: PLAIN_CTX,
      stdout,
      stderr: capture(),
      args: ["stories/bulk"],
      adapter,
    });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).not.toContain("\x1b[");
    expect(text).toContain("tasks: stories/bulk");
    expect(text).toContain("2 tasks");
    expect(text).toContain("LORE-1");
    expect(text).toContain("First");
    expect(text).toContain("To Do");
  });

  test("an empty rollup renders an explanatory line", async () => {
    writeDoc("reference/x.md", "---\ntype: Reference\ntitle: X\n---\nBody.\n");
    const stdout = capture();
    await runTasks({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["reference/x"] });
    expect(stdout.text()).toContain("(no linked tasks)");
  });

  test("pretty paints the header when color is on", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1")]);
    const stdout = capture();
    await runTasks({ root, output: PRETTY_CTX, stdout, stderr: capture(), args: ["stories/bulk"], adapter });
    expect(stdout.text()).toContain("\x1b[32m"); // ANSI green on the header
  });
});

describe("cli — tasks wiring (end-to-end through the router)", () => {
  function argv(...args: string[]): string[] {
    return ["bun", "lore", ...args];
  }

  test("`lore tasks <id>` runs through the router and exits 0", async () => {
    writeStory("bulk", ["LORE-1"]);
    const stdout = capture();
    const code = await run(argv("tasks", "stories/bulk"), {
      stdout,
      stderr: capture(),
      isTTY: false,
      env: {},
      cwd: root,
      adapter: okAdapter([makeTask("LORE-1", { status: "Done" })]),
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain("LORE-1");
  });

  test("`lore tasks <id> --json` emits the tasks.rollup envelope through the router", async () => {
    writeStory("bulk", ["LORE-1"]);
    const stdout = capture();
    const code = await run(argv("tasks", "stories/bulk", "--json"), {
      stdout,
      stderr: capture(),
      isTTY: false,
      env: {},
      cwd: root,
      adapter: okAdapter([makeTask("LORE-1", { status: "Done" })]),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: TaskRollup };
    expect(envelope.kind).toBe("tasks.rollup");
    expect(envelope.data.tasks[0]?.id).toBe("LORE-1");
  });

  test("`lore tasks <unknown>` exits 3 through the router", async () => {
    const code = await run(argv("tasks", "stories/ghost"), {
      stdout: capture(),
      stderr: capture(),
      isTTY: false,
      env: {},
      cwd: root,
    });
    expect(code).toBe(3);
  });

  test("`lore tasks` (no id) exits 2 through the router", async () => {
    const code = await run(argv("tasks"), { stdout: capture(), stderr: capture(), isTTY: false, env: {}, cwd: root });
    expect(code).toBe(2);
  });
});
