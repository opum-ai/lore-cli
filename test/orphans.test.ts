import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { computeOrphans, type OrphansReport, runOrphans } from "../src/commands/orphans";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, concept, fakeAdapter, makeTask, storyDoc } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };
const PRETTY_CTX: OutputContext = { mode: "pretty", color: true };

const NO_FLAGS = { tasksOnly: false, docsOnly: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-orphans-"));
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

/** A {@link fakeAdapter} that probes clean and serves the seeded snapshot — `lore orphans` does both. */
function okAdapter(seed: Parameters<typeof fakeAdapter>[0]): ReturnType<typeof fakeAdapter> {
  return fakeAdapter(seed, { probe: "ok", listTasks: "ok" });
}

/** Run `orphans` in JSON mode and return the parsed `data` payload, exit code, and captured stderr. */
async function reportJson(
  args: string[],
  adapter: ReturnType<typeof fakeAdapter>,
): Promise<{ code: number; data: OrphansReport; stderr: string }> {
  const stdout = capture();
  const stderr = capture();
  const code = await runOrphans({ root, output: JSON_CTX, stdout, stderr, args, adapter });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: OrphansReport };
  expect(envelope.kind).toBe("orphans.report");
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

describe("computeOrphans — the pure set arithmetic (AC#1)", () => {
  test("a snapshot task no concept links and that carries no doc: label is an orphan task", () => {
    // stories/bulk owns LORE-1 (present in the snapshot); LORE-2 is linked nowhere and has no doc: label.
    const report = computeOrphans(
      [concept("stories/bulk", { tasks: ["LORE-1"] })],
      [makeTask("LORE-1"), makeTask("LORE-2")],
      NO_FLAGS,
    );
    expect(report.orphanTasks).toEqual([{ id: "LORE-2", title: "Title for LORE-2", status: "To Do" }]);
    expect(report.danglingLinks).toEqual([]);
  });

  test("a task a concept forward-links is NOT an orphan", () => {
    const report = computeOrphans([concept("stories/bulk", { tasks: ["LORE-1"] })], [makeTask("LORE-1")], NO_FLAGS);
    expect(report.orphanTasks).toEqual([]);
  });

  test("a task carrying ANY doc: label is NOT an orphan, even if no concept links it", () => {
    const report = computeOrphans([], [makeTask("LORE-9", { labels: ["doc:stories/gone"] })], NO_FLAGS);
    expect(report.orphanTasks).toEqual([]);
  });

  test("the doc: label match is case-insensitive on the label prefix", () => {
    const report = computeOrphans([], [makeTask("LORE-9", { labels: ["DOC:stories/x"] })], NO_FLAGS);
    expect(report.orphanTasks).toEqual([]);
  });

  test("forward-link ownership is case-insensitive (concept lists lore-1, snapshot has LORE-1)", () => {
    const report = computeOrphans([concept("stories/bulk", { tasks: ["lore-1"] })], [makeTask("LORE-1")], NO_FLAGS);
    expect(report.orphanTasks).toEqual([]);
  });

  test("a concept tasks: id absent from the snapshot is a dangling link, echoed verbatim", () => {
    const report = computeOrphans([concept("stories/bulk", { tasks: ["GONE-9"] })], [makeTask("LORE-1")], NO_FLAGS);
    // LORE-1 is unreferenced with no doc: label → an orphan; GONE-9 → dangling.
    expect(report.orphanTasks).toEqual([{ id: "LORE-1", title: "Title for LORE-1", status: "To Do" }]);
    expect(report.danglingLinks).toEqual([{ concept: "stories/bulk", task: "GONE-9" }]);
  });

  test("known-id matching for dangling is case-insensitive (concept lists LORE-1, snapshot has lore-1)", () => {
    const report = computeOrphans(
      [concept("stories/bulk", { tasks: ["LORE-1"] })],
      [makeTask("lore-1", { labels: ["doc:stories/bulk"] })],
      NO_FLAGS,
    );
    expect(report.danglingLinks).toEqual([]);
  });

  test("orphan tasks are sorted by id (case-insensitive); dangling links by (concept, task)", () => {
    const report = computeOrphans(
      [concept("stories/b", { tasks: ["X-2", "X-1"] }), concept("stories/a", { tasks: ["X-3"] })],
      [makeTask("LORE-3"), makeTask("LORE-1"), makeTask("LORE-2")],
      NO_FLAGS,
    );
    expect(report.orphanTasks?.map((t) => t.id)).toEqual(["LORE-1", "LORE-2", "LORE-3"]);
    // X-1/X-2 (stories/b) and X-3 (stories/a) are all unknown → dangling, ordered by concept then task.
    expect(report.danglingLinks).toEqual([
      { concept: "stories/a", task: "X-3" },
      { concept: "stories/b", task: "X-1" },
      { concept: "stories/b", task: "X-2" },
    ]);
  });

  test("--tasks-only omits the danglingLinks key entirely (not an empty array)", () => {
    const report = computeOrphans([concept("stories/bulk", { tasks: ["GONE-9"] })], [makeTask("LORE-1")], {
      tasksOnly: true,
      docsOnly: false,
    });
    expect(report.orphanTasks).toBeDefined();
    expect("danglingLinks" in report).toBe(false);
  });

  test("--docs-only omits the orphanTasks key entirely (not an empty array)", () => {
    const report = computeOrphans([concept("stories/bulk", { tasks: ["GONE-9"] })], [makeTask("LORE-1")], {
      tasksOnly: false,
      docsOnly: true,
    });
    expect(report.danglingLinks).toBeDefined();
    expect("orphanTasks" in report).toBe(false);
  });

  test("a task referenced by a concept whose id also has a doc: label is counted owned once (no double-report)", () => {
    // A well-formed coupling has BOTH the forward ref and the doc: back-ref; it is not an orphan and not dangling.
    const report = computeOrphans(
      [concept("stories/bulk", { tasks: ["LORE-1"] })],
      [makeTask("LORE-1", { labels: ["doc:stories/bulk"] })],
      NO_FLAGS,
    );
    expect(report.orphanTasks).toEqual([]);
    expect(report.danglingLinks).toEqual([]);
  });
});

describe("runOrphans — integration over a bundle + snapshot (AC#2)", () => {
  test("emits an orphans.report envelope with both directions", async () => {
    writeStory("bulk", ["LORE-1", "GONE-9"]); // LORE-1 live, GONE-9 vanished
    const adapter = okAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/bulk"] }), // owned → neither orphan nor dangling
      makeTask("LORE-7", { title: "Lonely", status: "In Progress" }), // unreferenced, no doc: label → orphan
    ]);
    const { code, data } = await reportJson([], adapter);
    expect(code).toBe(0);
    expect(data.orphanTasks).toEqual([{ id: "LORE-7", title: "Lonely", status: "In Progress" }]);
    expect(data.danglingLinks).toEqual([{ concept: "stories/bulk", task: "GONE-9" }]);
  });

  test("a clean bundle yields empty (but present) sections, exit 0", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })]);
    const { code, data } = await reportJson([], adapter);
    expect(code).toBe(0);
    expect(data.orphanTasks).toEqual([]);
    expect(data.danglingLinks).toEqual([]);
  });

  test("--tasks-only reports only the orphan-task side through the run path", async () => {
    writeStory("bulk", ["GONE-9"]);
    const adapter = okAdapter([makeTask("LORE-7")]);
    const { data } = await reportJson(["--tasks-only"], adapter);
    expect(data.orphanTasks?.map((t) => t.id)).toEqual(["LORE-7"]);
    expect("danglingLinks" in data).toBe(false);
  });

  test("--docs-only reports only the dangling-link side through the run path", async () => {
    writeStory("bulk", ["GONE-9"]);
    const adapter = okAdapter([makeTask("LORE-7")]);
    const { data } = await reportJson(["--docs-only"], adapter);
    expect(data.danglingLinks).toEqual([{ concept: "stories/bulk", task: "GONE-9" }]);
    expect("orphanTasks" in data).toBe(false);
  });
});

describe("runOrphans — Backlog seam discipline", () => {
  test("the capability probe runs UP FRONT and an incapable binary surfaces as validation (exit 6)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")], { probe: new LoreError("validation", "not --json-capable", "") });
    await expectRejection("validation", () =>
      runOrphans({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: [], adapter }),
    );
  });

  test("a missing binary (probe not_found) surfaces as not_found (exit 3)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")], { probe: new LoreError("not_found", "backlog not on PATH", "") });
    await expectRejection("not_found", () =>
      runOrphans({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: [], adapter }),
    );
  });

  test("a listTasks READ failure (drift) propagates as a hard error, never a silent empty report", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1")], {
      probe: "ok",
      listTasks: new LoreError("drift", "backlog read drift", ""),
    });
    await expectRejection("drift", () =>
      runOrphans({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: [], adapter }),
    );
  });
});

describe("runOrphans — parse errors", () => {
  test("an unknown flag is a usage error (exit 2)", async () => {
    await expectRejection("usage", () => runOrphans({ root, output: JSON_CTX, stdout: capture(), args: ["--bogus"] }));
  });

  test("a positional argument is a usage error (exit 2)", async () => {
    await expectRejection("usage", () =>
      runOrphans({ root, output: JSON_CTX, stdout: capture(), args: ["stories/x"] }),
    );
  });

  test("passing both --tasks-only and --docs-only is a usage error (exit 2)", async () => {
    await expectRejection("usage", () =>
      runOrphans({ root, output: JSON_CTX, stdout: capture(), args: ["--tasks-only", "--docs-only"] }),
    );
  });
});

describe("runOrphans — text rendering", () => {
  test("plain lists both sections with aligned rows; no ANSI", async () => {
    writeStory("bulk", ["GONE-9"]);
    const adapter = okAdapter([makeTask("LORE-7", { title: "Lonely", status: "To Do" })]);
    const stdout = capture();
    const code = await runOrphans({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: [], adapter });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).not.toContain("\x1b[");
    expect(text).toContain("orphans:");
    expect(text).toContain("tasks with no owning doc:");
    expect(text).toContain("LORE-7");
    expect(text).toContain("Lonely");
    expect(text).toContain("docs with a vanished linked task:");
    expect(text).toContain("stories/bulk  -> GONE-9");
  });

  test("a fully clean report renders the all-clear line", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })]);
    const stdout = capture();
    await runOrphans({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: [], adapter });
    expect(stdout.text()).toContain("(none — every task has an owning doc, every linked task is live)");
  });

  test("--tasks-only's all-clear line claims ONLY the task side, never that linked tasks are live", async () => {
    // The dangling side was never computed under --tasks-only; the message must not assert it clean.
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })]);
    const stdout = capture();
    await runOrphans({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["--tasks-only"], adapter });
    expect(stdout.text()).toContain("(none — every task has an owning doc)");
    expect(stdout.text()).not.toContain("every linked task is live");
  });

  test("--docs-only's all-clear line claims ONLY the dangling side, never that every task has a doc", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })]);
    const stdout = capture();
    await runOrphans({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["--docs-only"], adapter });
    expect(stdout.text()).toContain("(none — every linked task is live)");
    expect(stdout.text()).not.toContain("every task has an owning doc");
  });

  test("pretty paints the header when color is on", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })]);
    const stdout = capture();
    await runOrphans({ root, output: PRETTY_CTX, stdout, stderr: capture(), args: [], adapter });
    expect(stdout.text()).toContain("\x1b[32m"); // ANSI green on the header
  });
});

describe("cli — orphans wiring (end-to-end through the router)", () => {
  function argv(...args: string[]): string[] {
    return ["bun", "lore", ...args];
  }

  test("`lore orphans` runs through the router and exits 0", async () => {
    writeStory("bulk", ["LORE-1"]);
    const stdout = capture();
    const code = await run(argv("orphans"), {
      stdout,
      stderr: capture(),
      isTTY: false,
      env: {},
      cwd: root,
      adapter: okAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })]),
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain("orphans:");
  });

  test("`lore orphans --json` emits the orphans.report envelope through the router", async () => {
    writeStory("bulk", ["GONE-9"]);
    const stdout = capture();
    const code = await run(argv("orphans", "--json"), {
      stdout,
      stderr: capture(),
      isTTY: false,
      env: {},
      cwd: root,
      adapter: okAdapter([makeTask("LORE-7")]),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: OrphansReport };
    expect(envelope.kind).toBe("orphans.report");
    expect(envelope.data.orphanTasks?.[0]?.id).toBe("LORE-7");
    expect(envelope.data.danglingLinks).toEqual([{ concept: "stories/bulk", task: "GONE-9" }]);
  });

  test("`lore orphans --tasks-only --docs-only` exits 2 through the router", async () => {
    writeStory("bulk", ["LORE-1"]);
    const code = await run(argv("orphans", "--tasks-only", "--docs-only"), {
      stdout: capture(),
      stderr: capture(),
      isTTY: false,
      env: {},
      cwd: root,
      adapter: okAdapter([makeTask("LORE-1")]),
    });
    expect(code).toBe(2);
  });
});
