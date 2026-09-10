import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  bunQuestSpawn,
  createQuestAdapter,
  createQuestBacklogMigration,
  QUEST_ACCOUNTABLE_HUMAN_ENV_VAR,
  QUEST_ACTOR_ENV_VAR,
  QUEST_ACTOR_KIND_ENV_VAR,
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
    const migration = createQuestBacklogMigration("/repo", {
      spawn,
      workspaceInitialized: () => true,
      actor: { id: "jeremy", kind: "human" },
    });
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
        "jeremy",
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
    expect(loreError.input).toEqual({
      code: "quest.workspace-not-initialized",
      workspace: join("/repo", ".quest", "workspace.toml"),
    });
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
    const tracker = createQuestAdapter("/repo", {
      spawn,
      workspaceInitialized: () => true,
      actor: { id: "jeremy", kind: "human" },
    });
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
    expect(create).toEqual(expect.arrayContaining(["--actor", "jeremy", "--actor-kind", "human"]));
    expect(create).toEqual(expect.arrayContaining(["--id", "T-4"]));
    expect(create).not.toContain("--milestone");
    expect(edit).toEqual(
      expect.arrayContaining([
        "--actor",
        "jeremy",
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

  test("pausedStatus reads Quest 0.4.0's optional field, drift-checking it independently of statusFlow (LCLI-455)", async () => {
    const spawnWith = (flowData: Record<string, unknown>): QuestSpawn => {
      return async (args) => {
        if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
        if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
        if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flowData);
        throw new Error(`unexpected quest call: ${args.join(" ")}`);
      };
    };
    expect(await adapter(spawnWith({ ...flow(), pausedStatus: "Blocked" })).pausedStatus?.()).toBe("Blocked");
    expect(await adapter(spawnWith(flow())).pausedStatus?.()).toBeUndefined();
    await expect(adapter(spawnWith({ ...flow(), pausedStatus: 7 })).pausedStatus?.()).rejects.toMatchObject({
      type: "drift",
    });
    await expect(
      adapter(
        spawnWith({ statuses: ["To Do", "In Progress", "Done"], terminalStatuses: ["Done"], pausedStatus: "Done" }),
      ).pausedStatus?.(),
    ).rejects.toMatchObject({ type: "drift" });
  });

  describe("actor context propagation (LCLI-434)", () => {
    function writeSpawn(calls: string[][]): QuestSpawn {
      return async (readonlyArgs) => {
        const args = [...readonlyArgs];
        calls.push(args);
        if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
        if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
        if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
        if (args[0] === "task" && args[1] === "edit") return ok("task.updated", { id: "QUEST-2" });
        if (args[0] === "task" && args[1] === "create") return ok("task.created", { id: "T-4" });
        throw new Error(`unexpected quest call: ${args.join(" ")}`);
      };
    }

    test("a delegated-agent actor propagates its identity and accountable human into edit and create argv", async () => {
      const calls: string[][] = [];
      const tracker = createQuestAdapter("/repo", {
        spawn: writeSpawn(calls),
        workspaceInitialized: () => true,
        actor: { id: "lore-cli-session", kind: "delegated-agent", accountableHumanId: "jdnewhouse" },
      });
      await tracker.editTask("QUEST-2", { status: "Done" });
      await tracker.createTask({ title: "New" });
      const edit = calls.find((args) => args[1] === "edit") ?? [];
      const create = calls.find((args) => args[1] === "create") ?? [];
      const expected = [
        "--actor",
        "lore-cli-session",
        "--actor-kind",
        "delegated-agent",
        "--accountable-human",
        "jdnewhouse",
      ];
      expect(edit).toEqual(expect.arrayContaining(expected));
      expect(create).toEqual(expect.arrayContaining(expected));
    });

    test("a delegated-agent actor propagates through both migration apply and rollback argv", async () => {
      const calls: string[][] = [];
      const migration = createQuestBacklogMigration("/repo", {
        spawn: async (readonlyArgs) => {
          const args = [...readonlyArgs];
          calls.push(args);
          if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
          if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
          if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
          if (args.slice(0, 3).join(" ") === "migration backlog apply")
            return ok("migration.backlog-applied", {
              schemaVersion: 1,
              kind: "migration.backlog.receipt",
              sourceFingerprint: "sha256:s",
              digest: "sha256:d",
              mappings: [],
              survivors: [],
              taskFingerprints: {},
              state: "applied",
            });
          if (args.slice(0, 3).join(" ") === "migration backlog rollback")
            return ok("migration.backlog-rolled-back", {
              schemaVersion: 1,
              kind: "migration.backlog.receipt",
              sourceFingerprint: "sha256:s",
              digest: "sha256:d",
              mappings: [],
              survivors: [],
              taskFingerprints: {},
              state: "rolled-back",
            });
          throw new Error(`unexpected quest call: ${args.join(" ")}`);
        },
        workspaceInitialized: () => true,
        actor: { id: "lore-cli-session", kind: "delegated-agent", accountableHumanId: "jdnewhouse" },
      });
      await migration.apply("/source", "sha256:d");
      await migration.rollback("sha256:d");
      const expected = [
        "--actor",
        "lore-cli-session",
        "--actor-kind",
        "delegated-agent",
        "--accountable-human",
        "jdnewhouse",
      ];
      expect(calls.find((args) => args[2] === "apply")).toEqual(expect.arrayContaining(expected));
      expect(calls.find((args) => args[2] === "rollback")).toEqual(expect.arrayContaining(expected));
    });

    test("--preserve-source-ids/--source-family propagate identically to both preview and apply argv (LCLI-465)", async () => {
      const calls: string[][] = [];
      const previewResponse = {
        sourceFingerprint: "sha256:s",
        digest: "sha256:d",
        requiresApproval: true as const,
        mappings: [],
      };
      const migration = createQuestBacklogMigration("/repo", {
        spawn: async (readonlyArgs) => {
          const args = [...readonlyArgs];
          calls.push(args);
          if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
          if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
          if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
          if (args.slice(0, 3).join(" ") === "migration backlog preview")
            return ok("migration.backlog-preview", previewResponse);
          if (args.slice(0, 3).join(" ") === "migration backlog apply")
            return ok("migration.backlog-applied", {
              schemaVersion: 1,
              kind: "migration.backlog.receipt",
              sourceFingerprint: "sha256:s",
              digest: "sha256:d",
              mappings: [],
              survivors: [],
              taskFingerprints: {},
              state: "applied",
            });
          throw new Error(`unexpected quest call: ${args.join(" ")}`);
        },
        workspaceInitialized: () => true,
        actor: { id: "lore-cli-session", kind: "delegated-agent", accountableHumanId: "jdnewhouse" },
      });
      await migration.preview("/source", { preserveSourceIds: true, sourceFamily: "LCLI" });
      await migration.apply("/source", "sha256:d", { preserveSourceIds: true, sourceFamily: "LCLI" });
      const previewArgs = calls.find((args) => args[2] === "preview");
      const applyArgs = calls.find((args) => args[2] === "apply");
      expect(previewArgs).toEqual(expect.arrayContaining(["--preserve-source-ids", "--source-family", "LCLI"]));
      expect(applyArgs).toEqual(expect.arrayContaining(["--preserve-source-ids", "--source-family", "LCLI"]));
    });

    test("omitted preserveSourceIds/sourceFamily add no flags at all — the default positional-renumbering path is byte-identical to before this option existed", async () => {
      const calls: string[][] = [];
      const previewResponse = {
        sourceFingerprint: "sha256:s",
        digest: "sha256:d",
        requiresApproval: true as const,
        mappings: [],
      };
      const migration = createQuestBacklogMigration("/repo", {
        spawn: async (readonlyArgs) => {
          const args = [...readonlyArgs];
          calls.push(args);
          if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
          if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
          if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
          if (args.slice(0, 3).join(" ") === "migration backlog preview")
            return ok("migration.backlog-preview", previewResponse);
          throw new Error(`unexpected quest call: ${args.join(" ")}`);
        },
        workspaceInitialized: () => true,
        actor: { id: "lore-cli-session", kind: "delegated-agent", accountableHumanId: "jdnewhouse" },
      });
      await migration.preview("/source");
      const previewArgs = calls.find((args) => args[2] === "preview");
      expect(previewArgs).not.toContain("--preserve-source-ids");
      expect(previewArgs).not.toContain("--source-family");
    });

    test("no actor context anywhere fails migration apply and rollback before any write is attempted (LCLI-459)", async () => {
      const calls: string[][] = [];
      const migration = createQuestBacklogMigration("/repo", {
        spawn: async (readonlyArgs) => {
          const args = [...readonlyArgs];
          calls.push(args);
          if (args[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
          if (args.join(" ") === "manifest --json") return ok("manifest.registry", manifest());
          if (args.join(" ") === "task status-flow --json") return ok("task.status-flow", flow());
          throw new Error(`unexpected quest call: ${args.join(" ")}`);
        },
        workspaceInitialized: () => true,
      });
      // Unlike `lore link`/`lore unlink` (LORE-58's per-task wrapper folds this into a top-level
      // `drift`, see link.test.ts), nothing wraps a single migration write — the same `resolveActor()`
      // rejection this describe block already proves for `editTask` reaches the caller unwrapped here.
      await expect(migration.apply("/source", "sha256:d")).rejects.toMatchObject({
        type: "validation",
        input: { code: "quest.actor-context-required" },
      });
      await expect(migration.rollback("sha256:d")).rejects.toMatchObject({
        type: "validation",
        input: { code: "quest.actor-context-required" },
      });
      expect(calls.find((args) => args.slice(0, 3).join(" ") === "migration backlog apply")).toBeUndefined();
      expect(calls.find((args) => args.slice(0, 3).join(" ") === "migration backlog rollback")).toBeUndefined();
    });

    test("no actor context anywhere fails before any write is attempted", async () => {
      const calls: string[][] = [];
      const tracker = createQuestAdapter("/repo", { spawn: writeSpawn(calls), workspaceInitialized: () => true });
      await expect(tracker.editTask("QUEST-2", { status: "Done" })).rejects.toMatchObject({
        type: "validation",
        input: { code: "quest.actor-context-required" },
      });
      expect(calls.find((args) => args[1] === "edit")).toBeUndefined();
    });

    test("a delegated-agent actor with no accountable human fails before any write is attempted", async () => {
      const calls: string[][] = [];
      const tracker = createQuestAdapter("/repo", {
        spawn: writeSpawn(calls),
        workspaceInitialized: () => true,
        actor: { id: "lore-cli-session", kind: "delegated-agent" },
      });
      await expect(tracker.editTask("QUEST-2", { status: "Done" })).rejects.toMatchObject({
        type: "validation",
        input: { code: "quest.accountable-human-required" },
      });
      expect(calls.find((args) => args[1] === "edit")).toBeUndefined();
    });

    test("an actor-kind outside human/delegated-agent is rejected before any write is attempted", async () => {
      const calls: string[][] = [];
      const tracker = createQuestAdapter("/repo", {
        spawn: writeSpawn(calls),
        workspaceInitialized: () => true,
        actor: { id: "lore-cli-session", kind: "robot" } as never,
      });
      const error = await tracker.editTask("QUEST-2", { status: "Done" }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LoreError);
      expect((error as LoreError).type).toBe("validation");
      expect((error as LoreError).message).toContain("robot");
      expect(calls.find((args) => args[1] === "edit")).toBeUndefined();
    });

    test("falls back to LORE_QUEST_ACTOR/_ACTOR_KIND/_ACCOUNTABLE_HUMAN env vars when no actor option is given", async () => {
      const saved = {
        actor: process.env[QUEST_ACTOR_ENV_VAR],
        kind: process.env[QUEST_ACTOR_KIND_ENV_VAR],
        human: process.env[QUEST_ACCOUNTABLE_HUMAN_ENV_VAR],
      };
      process.env[QUEST_ACTOR_ENV_VAR] = "lore-cli-session";
      process.env[QUEST_ACTOR_KIND_ENV_VAR] = "delegated-agent";
      process.env[QUEST_ACCOUNTABLE_HUMAN_ENV_VAR] = "jdnewhouse";
      try {
        const calls: string[][] = [];
        const tracker = createQuestAdapter("/repo", { spawn: writeSpawn(calls), workspaceInitialized: () => true });
        await tracker.editTask("QUEST-2", { status: "Done" });
        const edit = calls.find((args) => args[1] === "edit") ?? [];
        expect(edit).toEqual(
          expect.arrayContaining([
            "--actor",
            "lore-cli-session",
            "--actor-kind",
            "delegated-agent",
            "--accountable-human",
            "jdnewhouse",
          ]),
        );
      } finally {
        for (const [key, value] of [
          [QUEST_ACTOR_ENV_VAR, saved.actor],
          [QUEST_ACTOR_KIND_ENV_VAR, saved.kind],
          [QUEST_ACCOUNTABLE_HUMAN_ENV_VAR, saved.human],
        ] as const) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
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

  test("rejects milestones before spawning because Quest exposes no task-to-milestone attachment", async () => {
    const spawn: QuestSpawn = async () => {
      throw new Error("must not spawn");
    };
    await expect(adapter(spawn).createTask({ title: "New", milestone: "M2" })).rejects.toMatchObject({
      type: "validation",
      message: "Quest does not support task-to-milestone attachment",
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

describe("quest adapter structured criteria", () => {
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

  test("fails loud when criteria are not Quest structured objects", async () => {
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
      ["works"], // legacy string array — rejected per the structured criteria contract
      { index: 0, text: "x", checked: 0 }, // non-boolean checked
      { index: -1, text: "x", checked: false }, // negative index
    ]) {
      await expect(adapter(spawnFor(payload)).viewTask("QUEST-2")).rejects.toMatchObject({
        type: "drift",
        message: "Quest returned invalid acceptanceCriteria",
        hint: "Quest 0.2.7 or newer is required",
      });
    }
  });

  test("accepts the versions this adapter was originally qualified against", async () => {
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

  /** A Quest that reports `version` and otherwise answers every probe call successfully. */
  const spawnVersion =
    (version: string): QuestSpawn =>
    async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: `${version}\n`, stderr: "" };
      if (args[0] === "manifest")
        return {
          exitCode: 0,
          stdout: JSON.stringify({ schemaVersion: 1, kind: "manifest.registry", data: manifest() }),
          stderr: "",
        };
      return {
        exitCode: 0,
        stdout: JSON.stringify({ schemaVersion: 1, kind: "task.status-flow", data: flow() }),
        stderr: "",
      };
    };

  test("accepts every Quest at or above the floor, including the ones shipped after this adapter", async () => {
    // LCLI-356 reverses LCLI-353's frozen allowlist, whose assertions required exactly 0.2.7/0.2.8
    // and so rejected the shipped 0.2.9 — leaving the two current published packages unusable
    // together. 0.2.9 and 0.3.0 are the cases that used to fail.
    for (const version of ["0.2.7", "0.2.8", "0.2.9", "0.3.0", "1.0.0"]) {
      await expect(adapter(spawnVersion(version)).probe()).resolves.toMatchObject({ version });
    }
  });

  test("fails loud below the floor, naming the minimum rather than a frozen set", async () => {
    for (const version of ["0.1.0", "0.2.6"]) {
      await expect(adapter(spawnVersion(version)).probe()).rejects.toMatchObject({
        type: "validation",
        message: `Quest ${version} is below the 0.2.7 floor this adapter is qualified against`,
        input: { version, floor: "0.2.7" },
      });
    }
  });

  test("output that is not a version at all stays a distinct failure from being too old", async () => {
    await expect(adapter(spawnVersion("")).probe()).rejects.toMatchObject({
      type: "validation",
      message: "`quest --version` did not report a supported Quest version",
    });
    await expect(adapter(spawnVersion("quest version alpha")).probe()).rejects.toMatchObject({
      type: "validation",
      message: "`quest --version` did not print a bare semver",
    });
  });
});
