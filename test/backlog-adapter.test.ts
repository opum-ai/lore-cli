/**
 * backlog-adapter.test.ts — the typed JSON-only read/write adapter (LORE-21), migrated to upstream's
 * real `--json` contract by LORE-54.
 *
 * Every case drives {@link createBacklogAdapter} through the injected {@link BacklogSpawn} seam (no real
 * subprocess), feeding the **committed** golden envelopes under `test/fixtures/backlog-json/` — the exact
 * real upstream output the golden test locks to the contract. The two acceptance criteria are exercised here:
 *
 *   AC#1 — the adapter NEVER parses `--plain`: every read is a `--json` command whose stdout is
 *          `JSON.parse`d and contract-validated; a bad envelope fails loud rather than degrading. The
 *          `no --plain / no --json on create` invariant is asserted directly on the recorded argv.
 *   AC#2 — the capability probe is wired into the read path (and memoized): an incapable binary is
 *          refused before any command's output is trusted.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type BacklogSpawn, createBacklogAdapter, type SpawnResult } from "../src/adapters/backlog";
import { exitCodeFor, LoreError } from "../src/errors";

const FIXTURES = join(import.meta.dir, "fixtures", "backlog-json");
const readGolden = (name: string): string => readFileSync(join(FIXTURES, `${name}.json`), "utf8");

/** The three committed real-upstream envelopes, verbatim. */
const TASK = readGolden("task-view"); // kind "task-view" — LORE-33, full view
const TASK_LIST = readGolden("task-list"); // kind "task-list" — 3 summaries
const SEARCH = readGolden("search"); // kind "search"     — 3 task hits

/** A canned outcome for one invocation: the {@link SpawnResult} it produced, or an `Error` the spawn rejects with. */
type Outcome = SpawnResult | Error;

/** A process that ran and exited `0` with `stdout` (empty stderr). */
function ok(stdout: string): SpawnResult {
  return { exitCode: 0, stdout, stderr: "" };
}

/** A process that ran and exited non-zero with `stderr` (empty stdout unless given). */
function fail(exitCode: number, stderr: string, stdout = ""): SpawnResult {
  return { exitCode, stdout, stderr };
}

/**
 * A {@link BacklogSpawn} driven by a per-call `script(args, callIndex)`. It records every argv so a test
 * can pin invocation order (probe first) and assert the exact flags. Returning `undefined` from the
 * script falls back to the **default probe** responses (`--version` → `1.47.1`, any `task list --json`
 * → the committed `task-list` golden), so most tests only script the command under test. The probe's own
 * dry-run and a real `listTasks()` read issue the identical `["task", "list", "--json"]` argv AND now
 * target the same upstream contract (LORE-54), so one shared golden answers both — no more two-tier fake.
 */
function scriptedSpawn(
  script: (args: string[], callIndex: number) => Outcome | undefined = () => undefined,
): BacklogSpawn & { calls: string[][] } {
  const calls: string[][] = [];
  const spawn = (async (args: readonly string[]): Promise<SpawnResult> => {
    const argv = [...args];
    const outcome = script(argv, calls.length) ?? defaultProbe(argv);
    calls.push(argv);
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  }) as BacklogSpawn & { calls: string[][] };
  spawn.calls = calls;
  return spawn;
}

/** The default responses for the probe's two calls, and any later bare `task list --json` a real read issues. */
function defaultProbe(argv: string[]): Outcome {
  if (argv[0] === "--version") {
    return ok("1.47.1\n");
  }
  if (argv[0] === "task" && argv[1] === "list" && argv[2] === "--json") {
    return ok(TASK_LIST);
  }
  return new Error(`scriptedSpawn: no scripted outcome for ${JSON.stringify(argv)}`);
}

/** Run the thunk and return the {@link LoreError} it throws, failing the test if it does not throw. */
async function loreError(run: () => Promise<unknown>): Promise<LoreError> {
  try {
    await run();
  } catch (err) {
    if (err instanceof LoreError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected a LoreError to be thrown, but it resolved");
}

describe("listTasks — task list --json → mapped summaries (AC#1)", () => {
  test("maps every task-list golden entry (upstream's summary carries no path — only task view does)", async () => {
    const adapter = createBacklogAdapter(scriptedSpawn());
    const tasks = await adapter.listTasks();

    expect(tasks.map((t) => t.id)).toEqual(["LORE-1", "LORE-2", "LORE-6"]);
    expect(tasks[0]).toEqual({
      id: "LORE-1",
      title: "Fork Backlog.md and create the --json tracking task",
      status: "Done",
      priority: "high",
      ordinal: 1000,
      assignees: ["@jeremy"],
      labels: ["backlog-fork"],
      milestone: "m-0",
      parentTaskId: null,
    });
    // Upstream's summary carries no path at all (contract §1.2) — never surfaced on a list/search read.
    expect(Object.keys(tasks[0] ?? {})).not.toContain("file");
  });

  test("passes --status and comma-joins multiple --labels (single-value flag, §2.4)", async () => {
    const spawn = scriptedSpawn((argv) =>
      argv[0] === "task" && argv[1] === "list" && argv.length > 3 ? ok(TASK_LIST) : undefined,
    );
    const adapter = createBacklogAdapter(spawn);
    await adapter.listTasks({ status: "In Progress", labels: ["doc:stories/x", "core"] });

    const listCall = spawn.calls.find((c) => c[0] === "task" && c[1] === "list" && c.length > 3);
    expect(listCall).toEqual(["task", "list", "--json", "--status", "In Progress", "--labels", "doc:stories/x,core"]);
    // Never --plain (AC#1).
    expect(listCall).not.toContain("--plain");
  });

  test("searchByLabel delegates to an exact --labels AND-match", async () => {
    const spawn = scriptedSpawn((argv) => (argv.includes("--labels") ? ok(TASK_LIST) : undefined));
    const adapter = createBacklogAdapter(spawn);
    const tasks = await adapter.searchByLabel("doc:stories/x");

    expect(spawn.calls.at(-1)).toEqual(["task", "list", "--json", "--labels", "doc:stories/x"]);
    expect(tasks).toHaveLength(3);
  });
});

describe("viewTask — task view <id> --json → full detail (AC#1)", () => {
  test("maps the full task golden, dropping the non-durable AC index", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok(TASK) : undefined));
    const adapter = createBacklogAdapter(spawn);
    const task = await adapter.viewTask("LORE-33");

    expect(task).not.toBeNull();
    expect(task?.id).toBe("LORE-33");
    expect(task?.status).toBe("Done");
    expect(task?.dependencies).toEqual(["LORE-16"]);
    expect(task?.documentation).toEqual(["docs/adr/0015-lightweight-retrieval-no-vectors.md"]);
    expect(task?.file).toBe("backlog/tasks/lore-33 - lore-query-full-text-frontmatter-filters.md");
    // AC/DoD items carry text+checked only — the positional `index` is stripped (§6).
    expect(task?.acceptanceCriteria).toEqual([
      { text: "Filter by type/tag/status/any field", checked: true },
      { text: "Bounded output with a narrow-it hint", checked: true },
    ]);
    expect(task?.acceptanceCriteria[0]).not.toHaveProperty("index");
    expect(task?.subtasks).toEqual([]);
    expect(task?.description).toContain("full-text");
  });

  test("maps comments, dropping their positional index too", async () => {
    const withComment = JSON.parse(TASK);
    withComment.task.comments = [{ index: 1, body: "Shipped.", createdAt: "2026-06-29T00:00:00Z", author: "@jeremy" }];
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok(JSON.stringify(withComment)) : undefined));
    const task = await createBacklogAdapter(spawn).viewTask("LORE-33");

    expect(task?.comments).toEqual([{ author: "@jeremy", createdAt: "2026-06-29T00:00:00Z", body: "Shipped." }]);
    expect(task?.comments[0]).not.toHaveProperty("index");
  });

  test("returns null when the id has no task (exit code 1, empty stdout)", async () => {
    // Verified upstream behavior (PR #790): `task view <missing> --json` exits 1 unconditionally,
    // prints nothing to stdout, and puts "Task <id> not found." on stderr.
    const spawn = scriptedSpawn((argv) =>
      argv[1] === "view" ? { exitCode: 1, stdout: "", stderr: "Task LORE-9 not found." } : undefined,
    );
    const adapter = createBacklogAdapter(spawn);
    expect(await adapter.viewTask("LORE-9")).toBeNull();
  });

  test("fail-loud (drift) when exit 1 (the missing-task signal) unexpectedly printed to stdout", async () => {
    const spawn = scriptedSpawn((argv) =>
      argv[1] === "view" ? { exitCode: 1, stdout: "surprise", stderr: "Task LORE-9 not found." } : undefined,
    );
    const err = await loreError(() => createBacklogAdapter(spawn).viewTask("LORE-9"));
    expect(err.type).toBe("drift");
    expect(err.message).toContain("exited 1");
  });

  test("fail-loud (drift, exit 6) on unparseable stdout — no --plain fallback", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok("Task LORE-33 - not json at all") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).viewTask("LORE-33"));
    expect(err.type).toBe("drift");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("parseable JSON");
  });

  test("fail-loud on a non-zero exit that still printed output", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? fail(2, "boom", "partial") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).viewTask("LORE-33"));
    expect(err.type).toBe("drift");
    expect(err.message).toContain("exited 2");
  });

  test("fail-loud (drift) when stdout is JSON but not an envelope object (a bare array)", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok("[1,2,3]") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).viewTask("LORE-33"));
    expect(err.type).toBe("drift");
    expect(err.message).toContain("envelope object");
  });

  test("fail-loud (drift) on the wrong envelope kind", async () => {
    // A task-list envelope where a task-view was expected: the read-path kind assertion catches it.
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok(TASK_LIST) : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).viewTask("LORE-33"));
    expect(err.type).toBe("drift");
    expect(err.message).toContain("expected");
    expect(err.message).toContain("task-view");
  });

  test("fail-loud (drift) on an unrecognized schemaVersion", async () => {
    const bumped = JSON.stringify({ ...JSON.parse(TASK), schemaVersion: 2 });
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok(bumped) : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).viewTask("LORE-33"));
    expect(err.type).toBe("drift");
    expect(err.message).toContain("schemaVersion");
  });

  test("fail-loud (validation) when the payload violates the contract mirror", async () => {
    const parsed = JSON.parse(TASK);
    delete parsed.task.title; // a required field
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok(JSON.stringify(parsed)) : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).viewTask("LORE-33"));
    expect(err.type).toBe("validation");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("contract validation");
  });
});

describe("searchTasks — search <q> --json → task hits only (§5)", () => {
  test("maps the task hits from the search golden", async () => {
    const spawn = scriptedSpawn((argv) => (argv[0] === "search" ? ok(SEARCH) : undefined));
    const adapter = createBacklogAdapter(spawn);
    const tasks = await adapter.searchTasks("json");

    expect(spawn.calls.at(-1)).toEqual(["search", "json", "--json"]);
    expect(tasks.map((t) => t.id)).toEqual(["LORE-38", "LORE-54", "LORE-6"]);
  });

  test("drops document/decision hits, keeping only tasks", async () => {
    const mixed = {
      schemaVersion: 1,
      kind: "search",
      results: [
        { type: "document", data: { id: "DOC-1", title: "a backlog doc" } },
        JSON.parse(SEARCH).results[0], // a real task hit
        { type: "decision", data: { id: "DEC-1" } },
      ],
    };
    const spawn = scriptedSpawn((argv) => (argv[0] === "search" ? ok(JSON.stringify(mixed)) : undefined));
    const tasks = await createBacklogAdapter(spawn).searchTasks("x");
    expect(tasks.map((t) => t.id)).toEqual(["LORE-38"]);
  });

  test("fail-loud (drift) when the search read itself exits non-zero", async () => {
    const spawn = scriptedSpawn((argv) => (argv[0] === "search" ? fail(1, "search blew up") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).searchTasks("x"));
    expect(err.type).toBe("drift");
    expect(err.message).toContain("exited 1");
  });

  test("fail-loud (validation) when a task hit's data violates the summary contract", async () => {
    const bad = {
      schemaVersion: 1,
      kind: "search",
      results: [{ type: "task", data: { title: "missing an id" } }],
    };
    const spawn = scriptedSpawn((argv) => (argv[0] === "search" ? ok(JSON.stringify(bad)) : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).searchTasks("x"));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("task hit");
  });
});

describe("createTask — CLI write, id captured from the stdout line (§2.1)", () => {
  test("captures the new id from `Created task <ID>` and passes NO --plain / --json", async () => {
    const spawn = scriptedSpawn((argv) =>
      argv[1] === "create" ? ok("Created task LORE-99\nFile: /abs/repo/backlog/tasks/lore-99 - x.md\n") : undefined,
    );
    const adapter = createBacklogAdapter(spawn);
    const id = await adapter.createTask({
      title: "New thing",
      description: "why it matters",
      labels: ["a", "b"],
      doc: ["docs/x.md"],
      milestone: "m-3",
    });

    expect(id).toBe("LORE-99");
    const createCall = spawn.calls.find((c) => c[1] === "create");
    expect(createCall).toEqual([
      "task",
      "create",
      "New thing",
      "--description",
      "why it matters",
      "--labels",
      "a,b",
      "--milestone",
      "m-3",
      "--doc",
      "docs/x.md",
    ]);
    // AC#1 / §2.1: create must not run with --plain (suppresses the capture line) or --json (no envelope).
    expect(createCall).not.toContain("--plain");
    expect(createCall).not.toContain("--json");
  });

  test("captures a draft id too (`Created draft <ID>`)", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "create" ? ok("Created draft DRAFT-1\n") : undefined));
    expect(await createBacklogAdapter(spawn).createTask({ title: "d" })).toBe("DRAFT-1");
  });

  test("fail-loud (drift) when no `Created task` line is printed", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "create" ? ok("something unexpected\n") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).createTask({ title: "x" }));
    expect(err.type).toBe("drift");
    expect(err.message).toContain("Created task");
  });

  test("fail-loud (validation) on a non-zero create exit, surfacing stderr as the hint", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "create" ? fail(1, "lock held") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).createTask({ title: "x" }));
    expect(err.type).toBe("validation");
    expect(err.hint).toContain("lock held");
  });
});

describe("editTask — incremental patch (§2.4), meaningful exit code (§2.2)", () => {
  test("builds --add-label / --remove-label / --status, comma-joining multi-value labels", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "edit" ? ok("Updated task LORE-1") : undefined));
    const adapter = createBacklogAdapter(spawn);
    await adapter.editTask("LORE-1", {
      addLabels: ["doc:a", "doc:b"],
      removeLabels: ["old"],
      status: "Done",
      doc: ["docs/y.md"],
    });

    expect(spawn.calls.at(-1)).toEqual([
      "task",
      "edit",
      "LORE-1",
      "--json",
      "--add-label",
      "doc:a,doc:b",
      "--remove-label",
      "old",
      "--status",
      "Done",
      "--doc",
      "docs/y.md",
    ]);
  });

  test("rejects an add-label containing a comma instead of silently splitting it into two Backlog labels", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "edit" ? ok("Updated task LORE-1") : undefined));
    const err = await loreError(() =>
      createBacklogAdapter(spawn).editTask("LORE-1", { addLabels: ["doc:notes/release-notes,v2"] }),
    );
    expect(err.type).toBe("validation");
    expect(err.message).toContain("release-notes,v2");
  });

  test("a missing task (edit exits 1, `not found` on stderr) maps to not_found (exit 3)", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "edit" ? fail(1, "Task LORE-9 not found.") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).editTask("LORE-9", { status: "Done" }));
    expect(err.type).toBe("not_found");
    expect(exitCodeFor(err)).toBe(3);
    expect(err.message).toContain("LORE-9");
  });

  test("any other non-zero edit exit is validation (exit 6)", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "edit" ? fail(1, "some other failure") : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).editTask("LORE-1", { status: "Done" }));
    expect(err.type).toBe("validation");
  });
});

describe("the capability probe is wired into every path and memoized (AC#2)", () => {
  test("an incapable binary is refused before the read's own output is trusted", async () => {
    // The probe's dry `task list --json` is rejected (stock has no --json); the real listTasks read
    // must never be reached.
    let listReads = 0;
    const spawn = scriptedSpawn((argv) => {
      if (argv[0] === "task" && argv[1] === "list") {
        listReads += 1;
        return fail(1, "error: unknown option '--json'");
      }
      return undefined;
    });
    const err = await loreError(() => createBacklogAdapter(spawn).listTasks());
    expect(err.type).toBe("validation");
    expect(err.message).toContain("not --json-capable");
    expect(listReads).toBe(1); // the probe's list, not a second read
  });

  test("the probe runs at most once across many reads (memoized), then serves the cached verdict", async () => {
    const spawn = scriptedSpawn((argv) => (argv[1] === "view" ? ok(TASK) : undefined));
    const adapter = createBacklogAdapter(spawn);
    await adapter.listTasks();
    await adapter.viewTask("LORE-33");
    const cap = await adapter.probe();

    expect(cap).toEqual({ version: "1.47.1", schemaVersion: 1 });
    expect(spawn.calls.filter((c) => c[0] === "--version")).toHaveLength(1);
  });

  test("a missing binary (ENOENT) surfaces as not_found (exit 3) on a read", async () => {
    const enoent = Object.assign(new Error("spawn backlog ENOENT"), { code: "ENOENT" });
    const spawn = scriptedSpawn((argv) => (argv[0] === "--version" ? enoent : undefined));
    const err = await loreError(() => createBacklogAdapter(spawn).listTasks());
    expect(err.type).toBe("not_found");
    expect(exitCodeFor(err)).toBe(3);
  });
});
