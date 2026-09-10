import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { computeOrphans, DEFAULT_ORPHANS_LIMIT, type OrphansReport, runOrphans } from "../src/commands/orphans";
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

  test("a task carrying backend documentation (--doc) but no doc: label or forward ref is a pendingLink, not an orphan (LCLI-374)", () => {
    // Quest's --doc records into the task's own documentation array without ever writing a
    // tasks:/doc: back-reference -- only `lore link` does that. Before AC1's fix that gap read
    // as a silent orphan; AC2 makes it its own distinct "run lore link" bucket rather than
    // silently folding it into fully-healthy.
    const report = computeOrphans([], [makeTask("LORE-9", { documentation: ["docs/stories/gone.md"] })], NO_FLAGS);
    expect(report.orphanTasks).toEqual([]);
    expect(report.pendingLinks).toEqual([{ id: "LORE-9", title: "Title for LORE-9", status: "To Do" }]);
  });

  test("a task with --doc documentation AND a forward ref is fully linked -- in neither orphanTasks nor pendingLinks (LCLI-374 AC2)", () => {
    const report = computeOrphans(
      [concept("stories/bulk", { tasks: ["LORE-9"] })],
      [makeTask("LORE-9", { documentation: ["docs/stories/bulk.md"] })],
      NO_FLAGS,
    );
    expect(report.orphanTasks).toEqual([]);
    expect(report.pendingLinks).toEqual([]);
  });

  test("--docs-only omits pendingLinks entirely, alongside orphanTasks (LCLI-374 AC2)", () => {
    const report = computeOrphans([], [makeTask("LORE-9", { documentation: ["docs/stories/gone.md"] })], {
      tasksOnly: false,
      docsOnly: true,
    });
    expect("pendingLinks" in report).toBe(false);
  });

  test("--tasks-only carries pendingLinks with total/shown/truncated fields (LCLI-374 AC2)", () => {
    const report = computeOrphans([], [makeTask("LORE-9", { documentation: ["docs/stories/gone.md"] })], {
      tasksOnly: true,
      docsOnly: false,
    });
    expect(report.pendingLinks).toEqual([{ id: "LORE-9", title: "Title for LORE-9", status: "To Do" }]);
    expect(report.pendingLinksTotal).toBe(1);
    expect(report.pendingLinksShown).toBe(1);
    expect(report.pendingLinksTruncated).toBe(false);
  });

  test("a task with an empty documentation array is still an orphan (LCLI-374 does not weaken the base case)", () => {
    const report = computeOrphans([], [makeTask("LORE-9", { documentation: [] })], NO_FLAGS);
    expect(report.orphanTasks).toEqual([{ id: "LORE-9", title: "Title for LORE-9", status: "To Do" }]);
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

describe("computeOrphans — parent/subtask hierarchy awareness (LORE-261, AC#1/#3)", () => {
  test("a subtask is NOT an orphan when its parent carries a doc: label", () => {
    const report = computeOrphans(
      [],
      [
        makeTask("LORE-1", { labels: ["doc:stories/bulk"] }), // the linked parent
        makeTask("LORE-2", { parentTaskId: "LORE-1" }), // unlinked subtask, no doc: label of its own
      ],
      NO_FLAGS,
    );
    expect(report.orphanTasks).toEqual([]);
  });

  test("a subtask is NOT an orphan when its parent is forward-referenced by a concept's tasks:", () => {
    const report = computeOrphans(
      [concept("stories/bulk", { tasks: ["LORE-1"] })],
      [makeTask("LORE-1"), makeTask("LORE-2", { parentTaskId: "LORE-1" })],
      NO_FLAGS,
    );
    expect(report.orphanTasks).toEqual([]);
  });

  test("the parent-id match is case-insensitive (parentTaskId lore-1, snapshot has LORE-1)", () => {
    const report = computeOrphans(
      [],
      [makeTask("LORE-1", { labels: ["doc:stories/bulk"] }), makeTask("LORE-2", { parentTaskId: "lore-1" })],
      NO_FLAGS,
    );
    expect(report.orphanTasks).toEqual([]);
  });

  test("AC#3 no false negative: a subtask of a genuinely unlinked parent is STILL reported as an orphan", () => {
    // Neither LORE-1 (the parent) nor LORE-2 (the subtask) carries a doc: label or a forward ref.
    const report = computeOrphans([], [makeTask("LORE-1"), makeTask("LORE-2", { parentTaskId: "LORE-1" })], NO_FLAGS);
    expect(report.orphanTasks?.map((t) => t.id).sort()).toEqual(["LORE-1", "LORE-2"]);
  });

  test("AC#3 no false negative: a fully-unlinked standalone task (no parent at all) is still reported", () => {
    const report = computeOrphans([], [makeTask("LORE-9")], NO_FLAGS);
    expect(report.orphanTasks).toEqual([{ id: "LORE-9", title: "Title for LORE-9", status: "To Do" }]);
  });

  test("a subtask whose parent is NOT in the current snapshot (deleted/archived) grants no exemption", () => {
    const report = computeOrphans([], [makeTask("LORE-2", { parentTaskId: "LORE-1" })], NO_FLAGS);
    expect(report.orphanTasks).toEqual([{ id: "LORE-2", title: "Title for LORE-2", status: "To Do" }]);
  });

  test("hierarchy awareness walks a multi-level chain (grandchild owned via a linked grandparent)", () => {
    const report = computeOrphans(
      [],
      [
        makeTask("LORE-1", { labels: ["doc:stories/bulk"] }), // grandparent, linked
        makeTask("LORE-2", { parentTaskId: "LORE-1" }), // parent, unlinked
        makeTask("LORE-3", { parentTaskId: "LORE-2" }), // grandchild, unlinked
      ],
      NO_FLAGS,
    );
    expect(report.orphanTasks).toEqual([]);
  });

  test("a cyclic/self-referencing parentTaskId does not hang and does not grant a false exemption", () => {
    const report = computeOrphans(
      [],
      [makeTask("LORE-1", { parentTaskId: "LORE-2" }), makeTask("LORE-2", { parentTaskId: "LORE-1" })],
      NO_FLAGS,
    );
    expect(report.orphanTasks?.map((t) => t.id).sort()).toEqual(["LORE-1", "LORE-2"]);
  });

  test("a task that is its own parent (data anomaly) does not hang and does not grant a false exemption", () => {
    const report = computeOrphans([], [makeTask("LORE-1", { parentTaskId: "LORE-1" })], NO_FLAGS);
    expect(report.orphanTasks).toEqual([{ id: "LORE-1", title: "Title for LORE-1", status: "To Do" }]);
  });
});

describe("computeOrphans — bounded output, §3 truncation (LORE-74, AC#1)", () => {
  test("no --limit falls back to DEFAULT_ORPHANS_LIMIT, applied independently per section", () => {
    // 25 orphan tasks (over the default cap of 20) but only 2 dangling links (under it) — each
    // section's total/shown/truncated must reflect ONLY its own count, not the other section's.
    const tasks = Array.from({ length: 25 }, (_, i) => makeTask(`LORE-${i}`));
    const report = computeOrphans([concept("stories/bulk", { tasks: ["GONE-1", "GONE-2"] })], tasks, NO_FLAGS);
    expect(report.orphanTasksTotal).toBe(25);
    expect(report.orphanTasksShown).toBe(DEFAULT_ORPHANS_LIMIT);
    expect(report.orphanTasksTruncated).toBe(true);
    expect(report.orphanTasks).toHaveLength(DEFAULT_ORPHANS_LIMIT);

    expect(report.danglingLinksTotal).toBe(2);
    expect(report.danglingLinksShown).toBe(2);
    expect(report.danglingLinksTruncated).toBe(false);
    expect(report.danglingLinks).toHaveLength(2);
  });

  test("an explicit limit caps both sections to the same value", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => makeTask(`LORE-${i}`));
    const report = computeOrphans([concept("stories/bulk", { tasks: ["GONE-1", "GONE-2", "GONE-3"] })], tasks, {
      tasksOnly: false,
      docsOnly: false,
      limit: 2,
    });
    expect(report).toMatchObject({ orphanTasksTotal: 5, orphanTasksShown: 2, orphanTasksTruncated: true });
    expect(report).toMatchObject({ danglingLinksTotal: 3, danglingLinksShown: 2, danglingLinksTruncated: true });
  });

  test("a limit at or above the total is not truncated", () => {
    const report = computeOrphans([], [makeTask("LORE-1"), makeTask("LORE-2")], {
      tasksOnly: false,
      docsOnly: false,
      limit: 2,
    });
    expect(report).toMatchObject({ orphanTasksTotal: 2, orphanTasksShown: 2, orphanTasksTruncated: false });
  });

  test("--tasks-only omits ALL of the dangling section's fields, not just the array", () => {
    const report = computeOrphans([concept("stories/bulk", { tasks: ["GONE-9"] })], [makeTask("LORE-1")], {
      tasksOnly: true,
      docsOnly: false,
    });
    expect("danglingLinks" in report).toBe(false);
    expect("danglingLinksTotal" in report).toBe(false);
    expect("danglingLinksShown" in report).toBe(false);
    expect("danglingLinksTruncated" in report).toBe(false);
  });

  test("--docs-only omits ALL of the orphan-task section's fields, not just the array", () => {
    const report = computeOrphans([concept("stories/bulk", { tasks: ["GONE-9"] })], [makeTask("LORE-1")], {
      tasksOnly: false,
      docsOnly: true,
    });
    expect("orphanTasks" in report).toBe(false);
    expect("orphanTasksTotal" in report).toBe(false);
    expect("orphanTasksShown" in report).toBe(false);
    expect("orphanTasksTruncated" in report).toBe(false);
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

  test("LORE-261 AC#1: a linked-parent's unlinked subtasks are NOT reported through the run path", async () => {
    // stories/bulk links LORE-1 (the parent); LORE-2/LORE-3 are its subtasks, carrying no doc: label
    // and no forward reference of their own — the exact Meridian-stress-test shape (8 reported instead
    // of 2 before this fix).
    writeStory("bulk", ["LORE-1"]);
    const adapter = okAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/bulk"] }),
      makeTask("LORE-2", { parentTaskId: "LORE-1" }),
      makeTask("LORE-3", { parentTaskId: "LORE-1" }),
      makeTask("LORE-9", { title: "Genuinely unlinked" }), // no parent, no doc:, no forward ref
    ]);
    const { data } = await reportJson([], adapter);
    // AC#3 no false negative: LORE-9 (fully unlinked, no parent) still reports.
    expect(data.orphanTasks).toEqual([{ id: "LORE-9", title: "Genuinely unlinked", status: "To Do" }]);
  });
});

describe("runOrphans — dangling-link confirmation against a per-task view (LCLI-375)", () => {
  test("AC1/AC2: a Done, correctly-linked task the bulk snapshot silently drops is NOT reported as dangling", async () => {
    // Reproduces Quest 0.2.7-0.3.0's terminal-status bug: LORE-1 is linked (doc: label) and Done, but
    // the bare (unfiltered) listTasks call silently omits it -- exactly what the bulk `known` set used
    // to trust blindly. viewTask still resolves it correctly (real Quest's task view/search do too).
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", labels: ["doc:stories/bulk"] })], {
      probe: "ok",
      listTasks: "ok",
      bulkListDrops: ["LORE-1"],
    });
    const { code, data } = await reportJson([], adapter);
    expect(code).toBe(0);
    expect(data.danglingLinks).toEqual([]);
  });

  test("a genuinely deleted task (absent from BOTH listTasks and viewTask) still reports as dangling", async () => {
    // Confirmation must not turn every bulk-list miss into a free pass -- only a suspect that actually
    // resolves per-task is spared.
    writeStory("bulk", ["GONE-9"]);
    const adapter = okAdapter([makeTask("LORE-1")]);
    const { data } = await reportJson([], adapter);
    expect(data.danglingLinks).toEqual([{ concept: "stories/bulk", task: "GONE-9" }]);
  });

  test("a viewTask failure on a suspect leaves it dangling (fail toward reporting)", async () => {
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })], {
      probe: "ok",
      listTasks: "ok",
      bulkListDrops: ["LORE-1"],
      poisonViews: ["LORE-1"],
    });
    const { data } = await reportJson([], adapter);
    expect(data.danglingLinks).toEqual([{ concept: "stories/bulk", task: "LORE-1" }]);
  });

  test("confirmation resolves each distinct suspect id at most once, even with multiple referencing concepts", async () => {
    // Two concepts both reference LORE-1, and the bulk snapshot drops it -- two candidate danglingLinks
    // sharing one suspect id. Both must resolve alive from a single underlying view, not two.
    writeStory("bulk-a", ["LORE-1"]);
    writeStory("bulk-b", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })], {
      probe: "ok",
      listTasks: "ok",
      bulkListDrops: ["LORE-1"],
    });
    const { data } = await reportJson([], adapter);
    expect(data.danglingLinks).toEqual([]);
  });

  test("--tasks-only never triggers dangling confirmation (danglingLinks isn't requested)", async () => {
    // A poisoned view would throw if confirmation ran; --tasks-only must never reach it, since
    // danglingLinks is entirely omitted from that request.
    writeStory("bulk", ["LORE-1"]);
    const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/bulk"] })], {
      probe: "ok",
      listTasks: "ok",
      bulkListDrops: ["LORE-1"],
      poisonViews: ["LORE-1"],
    });
    const { code, data } = await reportJson(["--tasks-only"], adapter);
    expect(code).toBe(0);
    expect("danglingLinks" in data).toBe(false);
  });

  test("computeOrphans (the pure, bulk-only path) is UNAFFECTED by LCLI-375 -- it still trusts the bulk snapshot alone", () => {
    // computeOrphans has no adapter to confirm against; runOrphans is where the fix actually lives.
    // This pins that computeOrphans keeps its pre-LCLI-375 pure contract, not a regression.
    const report = computeOrphans(
      [concept("stories/bulk", { tasks: ["LORE-1"] })],
      [], // the task is entirely absent from the snapshot passed in -- computeOrphans cannot know better
      NO_FLAGS,
    );
    expect(report.danglingLinks).toEqual([{ concept: "stories/bulk", task: "LORE-1" }]);
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

  test.each([
    [["--limit", "1", "--limit", "2"], "--limit given more than once"],
    [["--limit", "0"], 'invalid --limit "0"'],
    [["--limit=0"], 'invalid --limit "0"'],
    [["--limit", "1.5"], 'invalid --limit "1.5"'],
    [["--limit", "abc"], 'invalid --limit "abc"'],
    [["--limit"], "--limit needs a value"],
    [["--limit", "99999999999999999999"], "too large"],
    [["--tasks-only=x"], "--tasks-only takes no value"],
    [["--docs-only=x"], "--docs-only takes no value"],
    [["--tasks-only", "--tasks-only"], "--tasks-only given more than once"],
  ])("rejects %j with a usage error", async (args, fragment) => {
    const err = await expectRejection("usage", () => runOrphans({ root, output: JSON_CTX, stdout: capture(), args }));
    expect(err.message).toContain(fragment);
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

  test("plain renders the pendingLinks section under its own header, distinct from orphan tasks (LCLI-374 AC2)", async () => {
    const adapter = okAdapter([makeTask("LORE-9", { title: "Pending doc", documentation: ["docs/stories/gone.md"] })]);
    const stdout = capture();
    const code = await runOrphans({
      root,
      output: PLAIN_CTX,
      stdout,
      stderr: capture(),
      args: ["--tasks-only"],
      adapter,
    });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).toContain("orphans: 0 orphan tasks, 1 pending link");
    expect(text).toContain("tasks documented via --doc but not yet `lore link`ed:");
    expect(text).toContain("LORE-9");
    expect(text).toContain("Pending doc");
    expect(text).not.toContain("tasks with no owning doc:"); // no orphanTasks entries -- block omitted
  });

  test("a non-empty pendingLinks section withholds the all-clear line, even with zero true orphans (LCLI-374 AC2)", async () => {
    const adapter = okAdapter([makeTask("LORE-9", { documentation: ["docs/stories/gone.md"] })]);
    const stdout = capture();
    await runOrphans({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["--tasks-only"], adapter });
    expect(stdout.text()).not.toContain("(none —");
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

  test("plain mode shows a §3 truncation footer after a section --limit drops rows", async () => {
    const tasks = Array.from({ length: 4 }, (_, i) => makeTask(`LORE-${i}`));
    const adapter = okAdapter(tasks);
    const stdout = capture();
    const code = await runOrphans({
      root,
      output: PLAIN_CTX,
      stdout,
      stderr: capture(),
      args: ["--tasks-only", "--limit", "2"],
      adapter,
    });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).toContain("orphans: 4 orphan tasks");
    expect(text).toContain("showing 2 of 4 — raise --limit to see more");
  });

  test("plain mode omits the footer when a section's limit does not drop anything", async () => {
    writeStory("bulk", ["GONE-9"]);
    const adapter = okAdapter([makeTask("LORE-7")]);
    const stdout = capture();
    await runOrphans({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: [], adapter });
    expect(stdout.text()).not.toContain("showing");
  });

  test("--json carries each section's total/shown/truncated fields", async () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask(`LORE-${i}`));
    const adapter = okAdapter(tasks);
    const { data } = await reportJson(["--tasks-only", "--limit", "1"], adapter);
    expect(data).toMatchObject({ orphanTasksTotal: 3, orphanTasksShown: 1, orphanTasksTruncated: true });
    expect(data.orphanTasks).toHaveLength(1);
  });

  test("--json carries pendingLinks' own total/shown/truncated fields (LCLI-374 AC2)", async () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask(`LORE-${i}`, { documentation: ["docs/x.md"] }));
    const adapter = okAdapter(tasks);
    const { data } = await reportJson(["--tasks-only", "--limit", "1"], adapter);
    expect(data).toMatchObject({ pendingLinksTotal: 3, pendingLinksShown: 1, pendingLinksTruncated: true });
    expect(data.pendingLinks).toHaveLength(1);
    expect(data.orphanTasksTotal).toBe(0);
  });
});

describe("runOrphans — orphan-task block survives a large snapshot (LORE-51 regression, updated for LORE-74)", () => {
  // `renderReport`'s orphan-task block once did `lines.push(...renderTaskSummaryRows(orphanTasks))` —
  // spreading a large array into a function-call argument list has its own engine argument-count
  // ceiling, the exact class of RangeError the spread-free `maxLen` refactor was meant to eliminate,
  // just reintroduced via `Array.prototype.push` instead of `Math.max`. Empirically (this project's
  // Bun 1.2.23), that spread throws "Maximum call stack size exceeded" well below a million rows; a
  // per-item loop (matching the sibling `danglingLinks` block) has no such ceiling. 700_000 is chosen
  // to comfortably clear that ceiling — this test genuinely throws against the pre-fix code — while
  // still running well under a second, so it stays a fast, decisive regression guard rather than a
  // slow one.
  //
  // LORE-74 capped `orphans`' output (cli-contract §3), which changes what "700,000 tasks" means:
  // by default only DEFAULT_ORPHANS_LIMIT render, so the ORIGINAL crash (a huge array flowing through
  // the render loop) no longer happens on the default path — the cap structurally prevents it. Both
  // properties still need a guard: (1) the default path truncates rather than dumping every row, and
  // (2) an operator who explicitly raises --limit past the total still gets every row rendered without
  // the RangeError the per-item loop was written to avoid — the fix that made this test pass in the
  // first place must keep holding once a large array IS asked to render in full.
  test("the default cap truncates a 700,000-task snapshot instead of dumping it", async () => {
    const N = 700_000;
    const tasks = Array.from({ length: N }, (_, i) => makeTask(`LORE-${i}`));
    const adapter = okAdapter(tasks);
    const stdout = capture();
    const code = await runOrphans({
      root,
      output: PLAIN_CTX,
      stdout,
      stderr: capture(),
      args: ["--tasks-only"],
      adapter,
    });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).toContain(`${N} orphan tasks`); // header states the TOTAL, not just what's shown
    expect(text).toContain("LORE-0 "); // lowest id rendered (order is sorted, not insertion — just checking presence)
    expect(text).not.toContain(`LORE-${N - 1} `); // highest id dropped — the cap, not the loop, bounds this now
    expect(text).toContain(`showing ${DEFAULT_ORPHANS_LIMIT} of ${N} — raise --limit to see more`);
  });

  test("a --limit raised past the total still renders all 700,000 rows without a RangeError", async () => {
    const N = 700_000;
    const tasks = Array.from({ length: N }, (_, i) => makeTask(`LORE-${i}`));
    const adapter = okAdapter(tasks);
    const stdout = capture();
    const code = await runOrphans({
      root,
      output: PLAIN_CTX,
      stdout,
      stderr: capture(),
      args: ["--tasks-only", "--limit", String(N)],
      adapter,
    });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).toContain(`${N} orphan tasks`);
    expect(text).toContain("LORE-0 ");
    expect(text).toContain(`LORE-${N - 1} `); // highest id rendered too — the loop reached the end of the array
    expect(text).not.toContain("showing"); // limit >= total: nothing truncated, no footer
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
