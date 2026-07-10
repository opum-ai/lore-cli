import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** A Story linking `taskIds`, written at `docs/stories/<stem>.md`. */
function writeStory(stem: string, taskIds: string[]): void {
  writeDoc(`stories/${stem}.md`, storyDoc(stem, taskIds));
}

describe("runTasks — the live rollup (AC#1, AC#2)", () => {
  test("emits a tasks.rollup with the concept and its linked tasks' live status, in tasks: order", async () => {
    writeStory("bulk", ["LORE-1", "LORE-2"]);
    const adapter = fakeAdapter([
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
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "To Do" })]);
    const { data } = await rollupJson(["stories/bulk"], { adapter });
    expect(data.tasks).toEqual([{ id: "LORE-1", title: "Title for LORE-1", status: "To Do" }]);
  });

  test("--status filters to one status (case-insensitive) and echoes the filter on `status`", async () => {
    writeStory("bulk", ["LORE-1", "LORE-2", "LORE-3"]);
    const adapter = fakeAdapter([
      makeTask("LORE-1", { status: "Done" }),
      makeTask("LORE-2", { status: "In Progress" }),
      makeTask("LORE-3", { status: "Done" }),
    ]);
    const { data } = await rollupJson(["stories/bulk", "--status", "done"], { adapter });
    expect(data.status).toBe("done");
    expect(data.tasks.map((t) => t.id)).toEqual(["LORE-1", "LORE-3"]);
  });

  test("the id positional is idFromPath-normalized (path/.md forms resolve)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const { code, data } = await rollupJson(["stories/bulk.md"], { adapter });
    expect(code).toBe(0);
    expect(data.concept).toBe("stories/bulk");
  });

  test("a concept with no linked tasks yields an empty rollup WITHOUT probing Backlog", async () => {
    writeDoc("reference/x.md", "---\ntype: Reference\ntitle: X\n---\nBody.\n");
    // poisonProbe would throw if probe ran; an empty tasks: must short-circuit before any adapter call.
    const adapter = fakeAdapter([], { poisonProbe: new LoreError("validation", "probe must not run", "") });
    const { code, data } = await rollupJson(["reference/x"], { adapter });
    expect(code).toBe(0);
    expect(data.tasks).toEqual([]);
  });
});

describe("runTasks — dangling links (soft) vs failures (hard)", () => {
  test("a tasks: id Backlog no longer knows is dropped from the rollup with a stderr advisory, exit 0", async () => {
    writeStory("bulk", ["LORE-1", "GONE-9"]);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]); // GONE-9 not seeded → viewTask null
    const { code, data, stderr } = await rollupJson(["stories/bulk"], { adapter });
    expect(code).toBe(0);
    expect(data.tasks.map((t) => t.id)).toEqual(["LORE-1"]);
    expect(stderr).toContain("GONE-9");
    expect(stderr.toLowerCase()).toContain("not in backlog");
  });

  test("a Backlog READ failure (drift) propagates as a hard error, never a dangling advisory", async () => {
    writeStory("bulk", ["LORE-1"]);
    const base = fakeAdapter([makeTask("LORE-1")]);
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
});

describe("runTasks — Backlog capability probe fails fast", () => {
  test("an incapable binary (probe validation) surfaces as validation (exit 6), before any read", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")], {
      poisonProbe: new LoreError("validation", "not --json-capable", ""),
    });
    await expectRejection("validation", () =>
      runTasks({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["stories/bulk"], adapter }),
    );
  });

  test("a missing binary (probe not_found) surfaces as not_found (exit 3)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")], {
      poisonProbe: new LoreError("not_found", "backlog not on PATH", ""),
    });
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
    const adapter = fakeAdapter([
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
    const adapter = fakeAdapter([makeTask("LORE-1")]);
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
      adapter: fakeAdapter([makeTask("LORE-1", { status: "Done" })]),
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
      adapter: fakeAdapter([makeTask("LORE-1", { status: "Done" })]),
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
