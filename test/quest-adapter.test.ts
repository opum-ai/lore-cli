import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  bunQuestSpawn,
  createQuestAdapter,
  createQuestBacklogMigration,
  QUEST_TIMEOUT_ENV_VAR,
  type QuestSpawn,
  type QuestSpawnResult,
} from "../src/adapters/quest";
import { LoreError } from "../src/errors";

function ok(kind: string, data: unknown): QuestSpawnResult {
  return { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 1, kind, data }), stderr: "" };
}
function manifest(): Record<string, unknown> {
  return {
    commands: [
      ["manifest", "manifest.registry", false],
      ["version", null, false],
      ["init", "workspace.initialized", true],
      ["migration backlog preview", "migration.backlog-preview", false],
      ["migration backlog apply", "migration.backlog-applied", true],
      ["migration backlog status", "migration.backlog-status", false],
      ["migration backlog rollback", "migration.backlog-rolled-back", true],
      ["task status-flow", "task.status-flow", false],
      ["task list", "task.list", false],
      ["task view", "task.view", false],
      ["search", "task.search", false],
      ["task create", "task.created", true],
      ["task edit", "task.updated", true],
    ].map(([name, kind, mutates]) => ({ name, schemaVersion: 1, kind, mutates })),
  };
}
function flow() {
  return { statuses: ["To Do", "In Progress", "Done"], terminalStatuses: ["Done"] };
}

function task(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "QUEST-2",
    title: "Coupled task",
    status: "In Progress",
    assignees: ["Ada"],
    labels: ["docs", "lore:migration:priority:High", "lore:migration:ordinal:42"],
    milestone: "M1",
    parentId: "QUEST-1",
    file: "tasks/quest-2.json",
    reporter: "Grace",
    createdAt: "2026-08-17T00:00:00Z",
    updatedAt: "2026-08-17T01:00:00Z",
    dependencies: ["QUEST-0"],
    references: ["https://example.test"],
    documentation: ["docs/story.md"],
    modifiedFiles: ["src/a.ts"],
    subtasks: [{ id: "QUEST-3", title: "Child" }],
    acceptanceCriteria: [{ index: 0, text: "works", checked: false }],
    definitionOfDone: [{ index: 0, text: "ships", checked: false }],
    description: "**Markdown**",
    plan: ["plan", "second step"],
    implementationNotes: ["notes"],
    finalSummary: "done",
    comments: [{ authorId: "Grace", createdAt: "2026-08-17T01:00:00Z", body: "comment" }],
    ...overrides,
  };
}

function adapter(spawn: QuestSpawn, workspaceInitialized = () => true) {
  return createQuestAdapter("/repo", { spawn, workspaceInitialized });
}

describe("Quest 0.2 tracker adapter", () => {
  test("consumes Quest's digest-approved Backlog migration lifecycle with actor flags", async () => {
    const calls: string[][] = [];
    const preview = {
      sourceFingerprint: "sha256:source",
      digest: "sha256:digest",
      requiresApproval: true as const,
      mappings: [{ sourceIdentifier: "LCLI-1", sourceFolder: "tasks", targetIdentifier: "T-1", aliases: ["LCLI-1"] }],
    };
    const receipt = {
      schemaVersion: 1 as const,
      kind: "migration.backlog.receipt" as const,
      ...preview,
      survivors: [],
      taskFingerprints: { "T-1": "sha256:task" },
      state: "applied" as const,
    };
    const spawn: QuestSpawn = async (readonlyArgs) => {
      const args = [...readonlyArgs];
      calls.push(args);
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
      if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
      if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
      if (args.slice(0, 3).join(" ") === "migration backlog preview") return ok("migration.backlog-preview", preview);
      if (args.slice(0, 3).join(" ") === "migration backlog apply") return ok("migration.backlog-applied", receipt);
      throw new Error(`unexpected Quest call: ${args.join(" ")}`);
    };
    const migration = createQuestBacklogMigration("/repo", { spawn, workspaceInitialized: () => true });
    expect(await migration.preview("/source")).toEqual(preview);
    expect(await migration.apply("/source", "sha256:digest")).toEqual({
      digest: "sha256:digest",
      schemaVersion: 1,
      kind: "migration.backlog.receipt",
      sourceFingerprint: "sha256:source",
      mappings: preview.mappings,
      survivors: [],
      taskFingerprints: { "T-1": "sha256:task" },
      state: "applied",
    });
    expect(calls.find((args) => args[2] === "apply")).toEqual(
      expect.arrayContaining([
        "--source",
        "/source",
        "--digest",
        "sha256:digest",
        "--actor",
        "lore",
        "--actor-kind",
        "human",
      ]),
    );
  });

  test("maps migration transport rejections to typed Lore errors after a successful probe", async () => {
    function failingMigrationSpawn(cause: Error): QuestSpawn {
      return async (args) => {
        if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
        if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
        if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
        throw cause;
      };
    }
    const denied = Object.assign(new Error("permission denied"), { code: "EACCES" });
    await expect(
      createQuestBacklogMigration("/repo", {
        spawn: failingMigrationSpawn(denied),
        workspaceInitialized: () => true,
      }).preview("/source"),
    ).rejects.toMatchObject({ type: "denied", input: { binary: "quest", code: "EACCES" } });

    await expect(
      createQuestBacklogMigration("/repo", {
        spawn: failingMigrationSpawn(new Error("spawn failed")),
        workspaceInitialized: () => true,
      }).preview("/source"),
    ).rejects.toMatchObject({ type: "validation", message: "could not start `quest`: spawn failed" });
  });

  test("refuses an uninitialized workspace before spawning Quest", async () => {
    let calls = 0;
    const tracker = adapter(
      async () => {
        calls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      () => false,
    );
    const error = await tracker.probe().then(
      () => new Error("expected probe to reject"),
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(LoreError);
    const loreError = error as LoreError;
    expect(loreError.type).toBe("validation");
    expect(loreError.hint).toBe("run `quest init`");
    expect(loreError.input).toEqual({ workspace: join("/repo", ".quest", "workspace.toml") });
    expect(calls).toBe(0);
  });

  test("probes the complete contract and maps direct array/record payloads through the full adapter", async () => {
    const calls: string[][] = [];
    const spawn: QuestSpawn = async (readonlyArgs) => {
      const args = [...readonlyArgs];
      calls.push(args);
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
      if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
      if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
      if (args.join(" ") === "task list --json") return ok("task.list", [task()]);
      if (args[0] === "task" && args[1] === "view") return ok("task.view", task());
      if (args[0] === "search") return ok("task.search", [task()]);
      if (args[0] === "task" && args[1] === "create") return ok("task.created", { id: "T-4" });
      if (args[0] === "task" && args[1] === "edit") return ok("task.updated", { id: "QUEST-2" });
      throw new Error(`unexpected quest call: ${args.join(" ")}`);
    };
    const tracker = adapter(spawn);
    expect(await tracker.statusFlow()).toEqual(["To Do", "In Progress", "Done"]);
    expect(await tracker.listTasks({ status: "In Progress", labels: ["docs"] })).toHaveLength(1);
    const { searchByLabel } = tracker;
    expect(await searchByLabel("docs")).toHaveLength(1);
    const detail = await tracker.viewTask("QUEST-2");
    expect(detail?.comments).toEqual([{ author: "Grace", createdAt: "2026-08-17T01:00:00Z", body: "comment" }]);
    expect(detail).toMatchObject({
      priority: null,
      ordinal: null,
      labels: ["docs", "lore:migration:priority:High", "lore:migration:ordinal:42"],
      dependencies: ["QUEST-0"],
      documentation: ["docs/story.md"],
      acceptanceCriteria: [{ text: "works", checked: false }],
      definitionOfDone: [{ text: "ships", checked: false }],
      implementationPlan: "plan\nsecond step",
      parentTaskId: "QUEST-1",
    });
    expect((await tracker.searchTasks("coupled"))[0]?.id).toBe("QUEST-2");
    expect(
      await tracker.createTask({
        id: "T-4",
        title: "New",
        description: "body",
        labels: ["docs"],
        doc: ["docs/new.md"],
      }),
    ).toBe("T-4");
    await tracker.editTask("QUEST-2", {
      status: "Done",
      addLabels: ["new"],
      removeLabels: ["docs"],
      doc: ["docs/new.md"],
    });
    const create = calls.find((args) => args[1] === "create") ?? [];
    const edit = calls.find((args) => args[1] === "edit") ?? [];
    expect(create).toEqual(expect.arrayContaining(["--actor", "lore", "--actor-kind", "human"]));
    expect(create).toEqual(expect.arrayContaining(["--id", "T-4"]));
    expect(create).not.toContain("--milestone");
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
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
      if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
      if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
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
        ? { exitCode: 0, stdout: "0.2.7\n", stderr: "" }
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

  test("rejects milestones before spawning because Quest 0.2.7 exposes no task-to-milestone attachment", async () => {
    const spawn: QuestSpawn = async () => {
      throw new Error("must not spawn");
    };
    await expect(adapter(spawn).createTask({ title: "New", milestone: "M2" })).rejects.toMatchObject({
      type: "validation",
      message: "Quest 0.2.7 does not support task-to-milestone attachment",
      hint: expect.stringContaining("omit the milestone"),
      input: { milestone: "M2" },
    });
  });

  test("rejects noncanonical caller ids before spawning a mutating Quest command", async () => {
    let calls = 0;
    const tracker = adapter(async () => {
      calls += 1;
      throw new Error("must not spawn");
    });
    for (const id of ["LCLI-1", "T-1.2", "T-0", "T--1", "--json"]) {
      await expect(tracker.createTask({ id, title: "New" })).rejects.toMatchObject({
        type: "validation",
        input: { id },
      });
    }
    expect(calls).toBe(0);
  });

  test("kills a real subprocess that exceeds the configured timeout", async () => {
    const previous = process.env[QUEST_TIMEOUT_ENV_VAR];
    process.env[QUEST_TIMEOUT_ENV_VAR] = "25";
    try {
      const spawn = bunQuestSpawn(process.cwd(), process.execPath);
      const started = Date.now();
      await expect(spawn(["-e", "await Bun.sleep(10_000)"])).rejects.toMatchObject({ type: "validation" });
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      if (previous === undefined) delete process.env[QUEST_TIMEOUT_ENV_VAR];
      else process.env[QUEST_TIMEOUT_ENV_VAR] = previous;
    }
  });

  test("fails loud for missing binaries, incompatible envelope schemas, kinds, and payloads", async () => {
    const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    await expect(adapter(async () => Promise.reject(missing)).probe()).rejects.toMatchObject({ type: "not_found" });
    const incompatible: QuestSpawn = async (args) =>
      args[0] === "--version"
        ? { exitCode: 0, stdout: "0.2.7\n", stderr: "" }
        : { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 2, kind: "help.manifest", data: {} }), stderr: "" };
    await expect(adapter(incompatible).probe()).rejects.toMatchObject({ type: "drift" });
    const wrongKind: QuestSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
      if (args[0] === "manifest") return ok("manifest.registry", manifest());
      if (args[1] === "status-flow") return ok("task.status-flow", flow());
      return ok("task.view", []);
    };
    await expect(adapter(wrongKind).listTasks()).rejects.toMatchObject({ type: "drift" });
    const malformed: QuestSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
      if (args[0] === "manifest") return ok("manifest.registry", manifest());
      return ok("task.status-flow", { statuses: [] });
    };
    await expect(adapter(malformed).statusFlow()).rejects.toMatchObject({ type: "drift" });
  });

  test("rejects a manifest with a missing descriptor and malformed live status-flow shape", async () => {
    const incomplete: QuestSpawn = async (args) =>
      args[0] === "--version"
        ? { exitCode: 0, stdout: "0.2.7\n", stderr: "" }
        : ok("manifest.registry", { commands: [] });
    await expect(adapter(incomplete).probe()).rejects.toMatchObject({ type: "drift" });
    const badFlow: QuestSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
      if (args[0] === "manifest") return ok("manifest.registry", manifest());
      return ok("task.status-flow", { statuses: ["To Do"], terminalStatuses: ["Done"] });
    };
    await expect(adapter(badFlow).probe()).rejects.toMatchObject({ type: "drift" });
  });
});

describe("quest adapter structured criteria (Quest 0.2.7)", () => {
  test("maps Quest 0.2.7 structured acceptanceCriteria and definitionOfDone losslessly (checked=true survives, index dropped)", async () => {
    const spawn: QuestSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
      if (args[0] === "manifest") return ok("manifest.registry", manifest());
      if (args[0] === "task" && args[1] === "status-flow") return ok("task.status-flow", flow());
      if (args[0] === "task" && args[1] === "view")
        return ok("task.view", {
          ...task(),
          acceptanceCriteria: [
            { index: 0, text: "Parent acceptance", checked: false },
            { index: 1, text: "Ships", checked: true },
          ],
          definitionOfDone: [{ index: 0, text: "Done-Done", checked: true }],
        });
      return {
        exitCode: 3,
        stdout: "",
        stderr: JSON.stringify({
          error_type: "not_found",
          message: "no such task",
          hint: "check id",
          input: { id: "QUEST-2" },
        }),
      };
    };
    const detail = await adapter(spawn).viewTask("QUEST-2");
    expect(detail?.acceptanceCriteria).toEqual([
      { text: "Parent acceptance", checked: false },
      { text: "Ships", checked: true },
    ]);
    expect(detail?.definitionOfDone).toEqual([{ text: "Done-Done", checked: true }]);
    expect(detail?.acceptanceCriteria[0]).not.toHaveProperty("index");
  });

  test("fails loud when criteria are not Quest 0.2.7 structured objects", async () => {
    const spawnFor =
      (payload: unknown): QuestSpawn =>
      async (args) => {
        if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
        if (args[0] === "manifest") return ok("manifest.registry", manifest());
        if (args[0] === "task" && args[1] === "status-flow") return ok("task.status-flow", flow());
        if (args[0] === "task" && args[1] === "view")
          return ok("task.view", { ...task(), acceptanceCriteria: payload });
        return {
          exitCode: 3,
          stdout: "",
          stderr: JSON.stringify({
            error_type: "not_found",
            message: "no such task",
            hint: "check id",
            input: { id: "QUEST-2" },
          }),
        };
      };
    for (const payload of [
      ["works"], // legacy string array — rejected per pinned 0.2.7 structured contract
      { index: 0, text: "x", checked: 0 }, // non-boolean checked
      { index: -1, text: "x", checked: false }, // negative index
    ]) {
      await expect(adapter(spawnFor(payload)).viewTask("QUEST-2")).rejects.toMatchObject({
        type: "drift",
        message: "Quest returned invalid acceptanceCriteria",
        hint: "Quest 0.2.7 or 0.2.8 is required",
      });
    }
  });

  test("accepts exactly the supported Quest versions 0.2.7 and 0.2.8 in the version gate", async () => {
    const spawnFor =
      (version: string): QuestSpawn =>
      async (args) => {
        if (args[0] === "--version") return { exitCode: 0, stdout: `${version}\n`, stderr: "" };
        if (args[0] === "manifest") return ok("manifest.registry", manifest());
        if (args[0] === "task" && args[1] === "status-flow") return ok("task.status-flow", flow());
        return {
          exitCode: 3,
          stdout: "",
          stderr: JSON.stringify({
            error_type: "not_found",
            message: "no such task",
            hint: "check id",
            input: { id: "QUEST-2" },
          }),
        };
      };
    await expect(adapter(spawnFor("0.2.7")).probe()).resolves.toBeTruthy();
    await expect(adapter(spawnFor("0.2.8")).probe()).resolves.toBeTruthy();
  });

  test("fails loud with a hint naming the supported set for unsupported Quest versions", async () => {
    const spawnFor =
      (version: string): QuestSpawn =>
      async (args) => {
        if (args[0] === "--version") return { exitCode: 0, stdout: `${version}\n`, stderr: "" };
        return {
          exitCode: 0,
          stdout: JSON.stringify({ schemaVersion: 1, kind: "manifest.registry", data: manifest() }),
          stderr: "",
        };
      };
    for (const version of ["0.1.0", "0.2.6", "0.2.9", "0.3.0", ""]) {
      await expect(adapter(spawnFor(version)).probe()).rejects.toMatchObject({
        type: "validation",
        message: "`quest --version` did not return a supported Quest 0.2 version",
        hint: "Quest 0.2.7 or 0.2.8 is required",
      });
    }
  });
});
