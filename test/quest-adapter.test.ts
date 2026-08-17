import { describe, expect, test } from "bun:test";
import { createQuestAdapter, type QuestSpawn, type QuestSpawnResult } from "../src/adapters/quest";
import { LoreError } from "../src/errors";

function ok(kind: string, data: unknown): QuestSpawnResult {
  return { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 1, kind, data }), stderr: "" };
}

function task(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "QUEST-2",
    title: "Coupled task",
    status: "In Progress",
    priority: "High",
    ordinal: 4,
    assignees: ["Ada"],
    labels: ["docs"],
    milestone: "M1",
    parentTaskId: "QUEST-1",
    file: "tasks/quest-2.json",
    reporter: "Grace",
    createdAt: "2026-08-17T00:00:00Z",
    updatedAt: "2026-08-17T01:00:00Z",
    dependencies: ["QUEST-0"],
    references: ["https://example.test"],
    documentation: ["docs/story.md"],
    modifiedFiles: ["src/a.ts"],
    subtasks: [{ id: "QUEST-3", title: "Child" }],
    acceptanceCriteria: [{ text: "works", checked: true }],
    definitionOfDone: [{ text: "ships", checked: false }],
    description: "**Markdown**",
    implementationPlan: "plan",
    implementationNotes: "notes",
    finalSummary: "done",
    comments: [{ author: "Grace", createdAt: "2026-08-17T01:00:00Z", body: "comment" }],
    ...overrides,
  };
}

function adapter(spawn: QuestSpawn) {
  return createQuestAdapter("/repo", { spawn });
}

describe("Quest 0.1 tracker adapter", () => {
  test("probes the complete contract and maps direct array/record payloads through the full adapter", async () => {
    const calls: string[][] = [];
    const spawn: QuestSpawn = async (readonlyArgs) => {
      const args = [...readonlyArgs];
      calls.push(args);
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.1.0\n", stderr: "" };
      if (args.join(" ") === "manifest --json")
        return ok("help.manifest", { commands: ["task list", "task view", "task status-flow"] });
      if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", ["To Do", "In Progress", "Done"]);
      if (args.join(" ") === "task list --json") return ok("task.list", [task()]);
      if (args[0] === "task" && args[1] === "view") return ok("task.view", task());
      if (args[0] === "search") return ok("search.results", [task()]);
      if (args[0] === "task" && args[1] === "create") return ok("task.created", { id: "QUEST-4" });
      if (args[0] === "task" && args[1] === "edit") return ok("task.updated", { id: "QUEST-2" });
      throw new Error(`unexpected quest call: ${args.join(" ")}`);
    };
    const tracker = adapter(spawn);
    expect(await tracker.statusFlow()).toEqual(["To Do", "In Progress", "Done"]);
    expect(await tracker.listTasks({ status: "In Progress", labels: ["docs"] })).toHaveLength(1);
    const detail = await tracker.viewTask("QUEST-2");
    expect(detail?.comments).toEqual([{ author: "Grace", createdAt: "2026-08-17T01:00:00Z", body: "comment" }]);
    expect(detail).toMatchObject({
      dependencies: ["QUEST-0"],
      documentation: ["docs/story.md"],
      acceptanceCriteria: [{ text: "works", checked: true }],
      implementationPlan: "plan",
    });
    expect((await tracker.searchTasks("coupled"))[0]?.id).toBe("QUEST-2");
    expect(
      await tracker.createTask({
        title: "New",
        description: "body",
        labels: ["docs"],
        doc: ["docs/new.md"],
        milestone: "M2",
      }),
    ).toBe("QUEST-4");
    await tracker.editTask("QUEST-2", {
      status: "Done",
      addLabels: ["new"],
      removeLabels: ["docs"],
      doc: ["docs/new.md"],
    });
    const create = calls.find((args) => args[1] === "create") ?? [];
    const edit = calls.find((args) => args[1] === "edit") ?? [];
    expect(create).toEqual(expect.arrayContaining(["--actor", "lore", "--actor-kind", "human", "--milestone", "M2"]));
    expect(edit).toEqual(
      expect.arrayContaining([
        "--actor",
        "lore",
        "--actor-kind",
        "human",
        "--status",
        "Done",
        "--add-label",
        "new",
        "--remove-label",
        "docs",
      ]),
    );
  });

  test("maps Quest JSON diagnostics exactly and treats a missing task as null", async () => {
    const spawn: QuestSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.1.0\n", stderr: "" };
      if (args.join(" ") === "manifest --json") return ok("help.manifest", { commands: [] });
      if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", ["To Do"]);
      return {
        exitCode: 3,
        stdout: "",
        stderr: JSON.stringify({
          error_type: "not_found",
          message: "no such task",
          hint: "check id",
          input: { id: "QUEST-9" },
        }),
      };
    };
    expect(await adapter(spawn).viewTask("QUEST-9")).toBeNull();
    const bad: QuestSpawn = async (args) =>
      args[0] === "--version"
        ? { exitCode: 0, stdout: "0.1.0\n", stderr: "" }
        : {
            exitCode: 1,
            stdout: "",
            stderr: JSON.stringify({ error_type: "conflict", message: "locked", hint: "retry", input: { lock: 1 } }),
          };
    await expect(adapter(bad).probe()).rejects.toMatchObject({
      type: "conflict",
      message: "locked",
      hint: "retry",
      input: { lock: 1 },
    });
  });

  test("rejects flag-like caller data before it can change Quest argv", async () => {
    const spawn: QuestSpawn = async () => {
      throw new Error("must not spawn");
    };
    const tracker = adapter(spawn);
    await expect(tracker.createTask({ title: "--json" })).rejects.toBeInstanceOf(LoreError);
    await expect(tracker.editTask("QUEST-2", { addLabels: ["--actor"] })).rejects.toMatchObject({ type: "validation" });
  });

  test("fails loud for missing binaries, incompatible envelope schemas, kinds, and payloads", async () => {
    const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    await expect(adapter(async () => Promise.reject(missing)).probe()).rejects.toMatchObject({ type: "not_found" });
    const incompatible: QuestSpawn = async (args) =>
      args[0] === "--version"
        ? { exitCode: 0, stdout: "0.1.0\n", stderr: "" }
        : { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 2, kind: "help.manifest", data: {} }), stderr: "" };
    await expect(adapter(incompatible).probe()).rejects.toMatchObject({ type: "drift" });
    const wrongKind: QuestSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.1.0\n", stderr: "" };
      if (args[0] === "manifest") return ok("help.manifest", { commands: [] });
      if (args[1] === "status-flow") return ok("task.status-flow", ["To Do"]);
      return ok("task.view", []);
    };
    await expect(adapter(wrongKind).listTasks()).rejects.toMatchObject({ type: "drift" });
    const malformed: QuestSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.1.0\n", stderr: "" };
      if (args[0] === "manifest") return ok("help.manifest", { commands: [] });
      return ok("task.status-flow", { statuses: [] });
    };
    await expect(adapter(malformed).statusFlow()).rejects.toMatchObject({ type: "drift" });
  });
});
