/**
 * tracker-adapter-parity.test.ts — cross-backend parity contract suite for LCLI-333 (ODOC-63.3 L0).
 *
 * Every public tracker seam Lore commands consume is exercised against BOTH constructible adapters —
 * `createBacklogAdapter` and `createQuestAdapter` — through their injected spawn seams, so the neutral
 * `BacklogTask(Detail)` currency and the fail-loud error classification are pinned as a single contract
 * rather than per-backend behavior. This suite is the regression fence the backend-owned persistence
 * slice of LCLI-333.1 must keep green; it deliberately characterizes today's commit-side-effect asymmetry
 * (`commitBacklogFiles` + quest's storage-path neutrality) without changing any production behavior.
 *
 * Whitelisted, documented cross-backend deltas on a projected detail:
 *   - `aliases`: Quest carries migration alias identity; Backlog has no such field.
 *   - `file`: Backlog passes through its repo-relative task path; Quest maps storage-only fields to null.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { type BacklogSpawn, createBacklogAdapter, type SpawnResult } from "../src/adapters/backlog";
import { createQuestAdapter, type QuestSpawn, type QuestSpawnResult } from "../src/adapters/quest";
import { commitBacklogFiles } from "../src/state";

const TASK_VIEW = readFileSync(join(import.meta.dir, "fixtures", "backlog-json", "task-view.json"), "utf8");
const TASK_LIST = readFileSync(join(import.meta.dir, "fixtures", "backlog-json", "task-list.json"), "utf8");

function okEnvelope(kind: string, data: unknown): string {
  return JSON.stringify({ schemaVersion: 1, kind, data });
}

type Outcome = SpawnResult | Error;

function scriptedBacklog(script?: (argv: string[]) => Outcome | undefined) {
  const calls: string[][] = [];
  const spawn = (async (args: readonly string[]): Promise<SpawnResult> => {
    const argv = [...args];
    calls.push(argv);
    if (script) {
      const outcome = script(argv);
      if (outcome instanceof Error) throw outcome;
      if (outcome) return outcome;
    }
    if (argv[0] === "--version") return { exitCode: 0, stdout: "1.49.0\n", stderr: "" };
    if (argv[0] === "task" && argv[1] === "list") return { exitCode: 0, stdout: TASK_LIST, stderr: "" };
    throw new Error(`scriptedBacklog: no scripted outcome for ${JSON.stringify(argv)}`);
  }) as BacklogSpawn & { calls: string[][] };
  spawn.calls = calls;
  return spawn;
}

function questAdapter(spawn: QuestSpawn) {
  return createQuestAdapter("/repo", { spawn, workspaceInitialized: () => true });
}

function okQuest(kind: string, data: unknown): QuestSpawnResult {
  return { exitCode: 0, stdout: JSON.stringify({ schemaVersion: 1, kind, data }), stderr: "" };
}

function questManifest(): Record<string, unknown> {
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

const QUEST_FLOW = { statuses: ["To Do", "In Progress", "Done"], terminalStatuses: ["Done"] };

/** A minimal neutral scenario: the Backlog raw view and its exactly-equivalent Quest record. */
const BASE_VIEW = {
  ...JSON.parse(TASK_VIEW).task,
  labels: ["docs"],
  parentTaskId: "P-1",
  dependencies: ["D-1"],
  references: [],
  documentation: ["docs/a.md"],
  modifiedFiles: [],
  subtasks: [{ id: "S-1", title: "Child" }],
  acceptanceCriteria: [{ index: 1, text: "works", checked: false }],
  definitionOfDone: [],
  implementationPlan: "p1\np2",
  implementationNotes: null,
  finalSummary: null,
  comments: [],
};

function equivalentQuestTask(): Record<string, unknown> {
  return {
    id: BASE_VIEW.id,
    aliases: [BASE_VIEW.id],
    title: BASE_VIEW.title,
    status: BASE_VIEW.status,
    priority: BASE_VIEW.priority,
    ordinal: BASE_VIEW.ordinal,
    assignees: BASE_VIEW.assignees,
    reporter: BASE_VIEW.reporter,
    labels: BASE_VIEW.labels,
    milestone: BASE_VIEW.milestone,
    parentId: BASE_VIEW.parentTaskId,
    file: null,
    createdAt: BASE_VIEW.createdAt,
    updatedAt: BASE_VIEW.updatedAt,
    dependencies: BASE_VIEW.dependencies,
    references: BASE_VIEW.references,
    documentation: BASE_VIEW.documentation,
    modifiedFiles: BASE_VIEW.modifiedFiles,
    subtasks: BASE_VIEW.subtasks,
    acceptanceCriteria: BASE_VIEW.acceptanceCriteria,
    definitionOfDone: [],
    description: BASE_VIEW.description,
    plan: ["p1", "p2"],
    implementationNotes: [],
    finalSummary: null,
    comments: [],
  };
}

function scriptedQuest(script: (argv: string[]) => QuestSpawnResult | Error): QuestSpawn {
  return async (readonlyArgs) => {
    const argv = [...readonlyArgs];
    if (argv[0] === "--version") return { exitCode: 0, stdout: "0.2.7\n", stderr: "" };
    if (argv.join(" ") === "manifest --json") return okQuest("manifest.registry", questManifest());
    if (argv.join(" ") === "task status-flow --json") return okQuest("task.status-flow", QUEST_FLOW);
    const outcome = script(argv);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
}

/** Drop the two documented cross-backend deltas so the remaining projections must be deep-equal. */
function neutralize(detail: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail) return null;
  const { aliases: _aliases, file: _file, ...rest } = detail;
  return rest;
}

describe("tracker adapter parity — shared seams across backends", () => {
  test("statusFlow exposes each backend's ordered workflow through one neutral call", async () => {
    const root = mkdtempSync(join(tmpdir(), "lore-parity-"));
    try {
      mkdirSync(join(root, "backlog"), { recursive: true });
      writeFileSync(
        join(root, "backlog", "config.yml"),
        yaml.dump({ statuses: ["To Do", "In Progress", "Done"], terminalStatuses: ["Done"] }),
      );
      const backlog = createBacklogAdapter(scriptedBacklog(), root);
      await expect(backlog.probe().then(() => backlog.statusFlow())).resolves.toEqual(["To Do", "In Progress", "Done"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    const quest = questAdapter(scriptedQuest(() => okQuest("task.status-flow", QUEST_FLOW)));
    await expect(quest.probe().then(() => quest.statusFlow())).resolves.toEqual(["To Do", "In Progress", "Done"]);
  });

  test("equivalent raw envelopes project to the same neutral detail except the documented deltas", async () => {
    const backlogDetail = await createBacklogAdapter(
      scriptedBacklog((argv) =>
        argv[0] === "task" && argv[1] === "view"
          ? ({
              exitCode: 0,
              stdout: JSON.stringify({ schemaVersion: 1, kind: "task-view", task: BASE_VIEW }),
              stderr: "",
            } as SpawnResult)
          : undefined,
      ),
    ).viewTask("LORE-33");

    let viewed = false;
    const questDetail = await questAdapter(
      scriptedQuest((argv) => {
        if (argv[0] === "task" && argv[1] === "view") {
          viewed = true;
          return okQuest("task.view", equivalentQuestTask());
        }
        throw new Error(`unexpected quest call ${argv.join(" ")}`);
      }),
    ).viewTask("LORE-33");

    expect(viewed).toBe(true);
    // Documented delta #1: Quest carries alias identity; Backlog does not.
    expect(questDetail && "aliases" in questDetail ? questDetail.aliases : undefined).toEqual(["LORE-33"]);
    expect(backlogDetail && "aliases" in backlogDetail ? backlogDetail.aliases : undefined).toBeUndefined();
    // Documented delta #2: storage-path neutrality — Backlog passthrough vs Quest null.
    expect(backlogDetail?.file).toBe("backlog/tasks/lore-33 - lore-query-full-text-frontmatter-filters.md");
    expect(questDetail?.file).toBeNull();
    // Everything else must be the identical neutral projection.
    expect(neutralize(questDetail as unknown as Record<string, unknown>)).toEqual(
      neutralize(backlogDetail as unknown as Record<string, unknown>),
    );
  });

  test("one edit patch expands to each backend's documented flag contract", async () => {
    const backlogSpawn = scriptedBacklog((argv) =>
      argv[0] === "task" && argv[1] === "edit" ? ({ exitCode: 0, stdout: "", stderr: "" } as SpawnResult) : undefined,
    );
    await createBacklogAdapter(backlogSpawn).editTask("LORE-33", {
      status: "In Progress",
      addLabels: ["doc:x", "core"],
      removeLabels: ["cmd"],
      doc: ["docs/a.md", "docs/b.md"],
    });
    const backlogEdit = backlogSpawn.calls.find((c) => c[1] === "edit") ?? [];
    // Backlog §2.4: comma-joined label accumulators, repeated --doc values (SET/REPLACE array).
    expect(backlogEdit).toEqual(
      expect.arrayContaining(["--status", "In Progress", "--add-label", "doc:x,core", "--remove-label", "cmd"]),
    );
    expect(backlogEdit.filter((a) => a === "--doc")).toHaveLength(2);

    const questCalls: string[][] = [];
    await questAdapter(
      scriptedQuest((argv) => {
        if (argv[1] === "edit") {
          questCalls.push(argv);
          return okQuest("task.updated", { id: "LORE-33" });
        }
        throw new Error(`unexpected quest call ${argv.join(" ")}`);
      }),
    ).editTask("LORE-33", {
      status: "In Progress",
      addLabels: ["doc:x", "core"],
      removeLabels: ["cmd"],
      doc: ["docs/a.md", "docs/b.md"],
    });
    const questEdit = questCalls[0] ?? [];
    // Quest contract: actor flags plus repeated per-value flags.
    expect(questEdit).toEqual(expect.arrayContaining(["--actor", "lore", "--actor-kind", "human"]));
    for (const value of ["--status", "In Progress"]) expect(questEdit).toContain(value);
    expect(questEdit.filter((a) => a === "--add-label")).toHaveLength(2);
    expect(questEdit.filter((a) => a === "--remove-label")).toHaveLength(1);
    expect(questEdit.filter((a) => a === "--doc")).toHaveLength(2);
  });

  test("transport and envelope failures classify identically on both adapters", async () => {
    // Transport (missing binary) and schema/kind drift classify identically. A payload-shape
    // violation is `validation` on Backlog (its Zod contract mirror) and `drift` on Quest — a
    // documented asymmetry this suite pins so LCLI-333.1 cannot change it silently.
    const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    await expect(createBacklogAdapter(scriptedBacklog(() => missing)).probe()).rejects.toMatchObject({
      type: "not_found",
    });
    await expect(questAdapter(async () => Promise.reject(missing)).probe()).rejects.toMatchObject({
      type: "not_found",
    });

    const wrongSchema: Outcome = {
      exitCode: 0,
      stdout: JSON.stringify({ schemaVersion: 2, kind: "task-view", task: {} }),
      stderr: "",
    };
    await expect(
      createBacklogAdapter(
        scriptedBacklog((argv) => (argv[0] === "task" && argv[1] === "view" ? wrongSchema : undefined)),
      ).viewTask("LORE-33"),
    ).rejects.toMatchObject({ type: "drift" });
    await expect(
      questAdapter(
        scriptedQuest(() => ({
          exitCode: 0,
          stdout: JSON.stringify({ schemaVersion: 2, kind: "task.view", data: {} }),
          stderr: "",
        })),
      ).viewTask("LORE-33"),
    ).rejects.toMatchObject({ type: "drift" });

    const wrongKind: Outcome = { exitCode: 0, stdout: okEnvelope("search", []), stderr: "" };
    await expect(
      createBacklogAdapter(
        scriptedBacklog((argv) => (argv[0] === "task" && argv[1] === "view" ? wrongKind : undefined)),
      ).viewTask("LORE-33"),
    ).rejects.toMatchObject({ type: "drift" });
    await expect(
      questAdapter(scriptedQuest(() => okQuest("task.search", []))).viewTask("LORE-33"),
    ).rejects.toMatchObject({ type: "drift" });

    const malformedPayload: Outcome = {
      exitCode: 0,
      stdout: JSON.stringify({ schemaVersion: 1, kind: "task-view", task: { id: 7 } }),
      stderr: "",
    };
    await expect(
      createBacklogAdapter(
        scriptedBacklog((argv) => (argv[0] === "task" && argv[1] === "view" ? malformedPayload : undefined)),
      ).viewTask("LORE-33"),
    ).rejects.toMatchObject({ type: "validation" });
    await expect(
      questAdapter(scriptedQuest(() => okQuest("task.view", { id: 7 }))).viewTask("LORE-33"),
    ).rejects.toMatchObject({ type: "drift" });
  });

  test("flag-like caller data is rejected before any spawn on both adapters", async () => {
    const boom = () => {
      throw new Error("must not spawn");
    };
    await expect(
      createBacklogAdapter(
        scriptedBacklog((argv) => (argv[0] === "task" && argv[1] === "view" ? new Error("must not spawn") : undefined)),
      ).viewTask("--json"),
    ).rejects.toMatchObject({ type: "validation" });
    await expect(
      questAdapter(scriptedQuest(boom as never)).editTask("LORE-33", { addLabels: ["--actor"] }),
    ).rejects.toMatchObject({ type: "validation" });
  });

  test("characterization — quest's storage-path neutrality makes per-write commits a no-op, while any non-backlog path fails loud", async () => {
    // Today's seam under characterization for LCLI-333.1: link/unlink/rename collect detail.file paths
    // and hand them to commitBacklogFiles. A quest-backed edit maps detail.file to null, so the command
    // layer attempts no commit at all — benign by construction, not by policy.
    const result = await commitBacklogFiles([], { root: "/repo" }, "test: no files");
    expect(result.committed).toBe(false);
    // And any future non-null path outside backlog/ must keep failing loud rather than committing.
    await expect(
      commitBacklogFiles(
        ["src/adapters/quest.ts"],
        { root: "/repo", gitSpawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
        "test: outside scope",
      ),
    ).rejects.toMatchObject({
      type: "drift",
    });
  });
});

// ── LCLI-333.1: backend-owned persistence parity ──────────────────────────────────────────────

import { runLink } from "../src/commands/link";
import { computeOrphans } from "../src/commands/orphans";
import { gatherReconciliation, resolveTaskDetails } from "../src/commands/reconcile-shared";
import { parseConcept } from "../src/core/concept";
import { persistTrackerWrites, sweepTrackerStorage, type TrackerWriteRef } from "../src/tracker-persistence";

const JSON_CTX_L1 = { mode: "json", color: false } as const;

function countingGitSpawn() {
  const calls: string[][] = [];
  const spawn = (async (args: readonly string[]) => {
    calls.push([...args]);
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as never;
  return { spawn, calls };
}

describe("tracker persistence — backend-owned commit seam (LCLI-333.1)", () => {
  test("persistence — backlog backend commits exactly the scoped task files with literal pathspecs", async () => {
    const calls: string[][] = [];
    const spawn = (async (args: readonly string[]) => {
      calls.push([...args]);
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: "\n", stderr: "" };
      if (args[0] === "status") return { exitCode: 0, stdout: "?? backlog/tasks/lore-1 - title.md\u0000", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as never;
    const result = await persistTrackerWrites(
      "backlog",
      [{ taskId: "lore-1", file: "backlog/tasks/lore-1 - title.md" }],
      { root: "/repo", message: "msg", gitSpawn: spawn },
    );
    expect(result.committed).toBe(true);
    expect(calls.some((argv) => argv.includes(":(literal)backlog/tasks/lore-1 - title.md"))).toBe(true);
  });

  test("persistence — quest backend performs zero git invocations for the same edit scenario", async () => {
    const { spawn, calls } = countingGitSpawn();
    const result = await persistTrackerWrites("quest", [{ taskId: "T-1", file: null }] satisfies TrackerWriteRef[], {
      root: "/repo",
      message: "msg",
      gitSpawn: spawn,
    });
    expect(result).toEqual({ committed: false, files: [] });
    expect(calls).toHaveLength(0);
  });

  test("persistence — a non-null repo file under a non-backlog backend fails loud (drift)", async () => {
    const refs: TrackerWriteRef[] = [{ taskId: "T-1", file: "backlog/tasks/t-1.md" }];
    await expect(
      persistTrackerWrites("quest", refs, { root: "/repo", message: "msg", gitSpawn: countingGitSpawn().spawn }),
    ).rejects.toMatchObject({ type: "drift" });
  });

  test("persistence — empty edit refs are a git-free no-op on both backends", async () => {
    for (const backend of ["backlog", "quest"] as const) {
      const result = await persistTrackerWrites(backend, [], {
        root: "/repo",
        message: "msg",
        gitSpawn: countingGitSpawn().spawn,
      });
      expect(result.committed).toBe(false);
    }
  });

  test("sync sweep — catch-all backlog/ commit runs only under the backlog backend", async () => {
    const calls: string[][] = [];
    const spawn = (async (args: readonly string[]) => {
      calls.push([...args]);
      if (args[0] === "rev-parse") return { exitCode: 0, stdout: "\n", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as never;
    const swept = await sweepTrackerStorage("backlog", { root: "/repo", gitSpawn: spawn });
    expect(swept.committed).toBe(false); // clean tree: true no-op
    expect(calls.length).toBeGreaterThan(0);
    const before = calls.length;
    const questSwept = await sweepTrackerStorage("quest", { root: "/repo", gitSpawn: spawn });
    expect(questSwept).toEqual({ committed: false, files: [] });
    expect(calls.length).toBe(before); // zero additional git invocations
  });

  test("command parity — link under quest runs ZERO git invocations; doc-side tasks: matches backlog", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "lcli-persist-"));
    try {
      mkdirSync(join(root, "docs/stories"), { recursive: true });
      const resetDoc = (): void => writeFileSync(join(root, "docs/stories/x.md"), "---\ntype: Story\n---\nBody.\n");
      resetDoc();

      const questAdapterLocal = createQuestAdapter(root, {
        spawn: scriptedQuest((argv) => {
          if (argv.join(" ").startsWith("task view")) return okQuest("task.view", equivalentQuestTask());
          if (argv.join(" ").startsWith("task edit")) return okQuest("task.updated", equivalentQuestTask());
          throw new Error(`no script for ${JSON.stringify(argv)}`);
        }),
        workspaceInitialized: () => true,
      });

      const { spawn: gitSpawn } = countingGitSpawn();
      const code = await runLink({
        root,
        output: JSON_CTX_L1 as never,
        args: ["stories/x", "LORE-33"],
        adapter: questAdapterLocal as never,
        gitSpawn,
        backend: "quest",
      });
      expect(code).toBe(0);
      const questDoc = readFileSync(join(root, "docs/stories/x.md"), "utf8");
      expect(questDoc).toContain("- lore-33");

      // Same scenario under the backlog backend commits through the scoped per-write seam.
      resetDoc();
      const backlogDetail = { ...BASE_VIEW };
      let editCalls = 0;
      const backlogAdapter = createBacklogAdapter(
        (async (argv: readonly string[]) => {
          const a = [...argv];
          if (a[0] === "--version") return { exitCode: 0, stdout: "1.49.0\n", stderr: "" };
          if (a[0] === "task" && a[1] === "view")
            return {
              exitCode: 0,
              stdout: JSON.stringify({ ...JSON.parse(TASK_VIEW), task: backlogDetail }),
              stderr: "",
            };
          if (a[0] === "task" && a[1] === "edit") {
            editCalls++;
            return {
              exitCode: 0,
              stdout: JSON.stringify({ ...JSON.parse(TASK_VIEW), task: backlogDetail }),
              stderr: "",
            };
          }
          throw new Error(`no script for ${JSON.stringify(a)}`);
        }) as never,
        root,
      );
      const scoped = await persistTrackerWrites("backlog", [{ taskId: BASE_VIEW.id, file: "backlog/tasks/b.md" }], {
        root,
        message: "msg",
        gitSpawn: countingGitSpawn().spawn,
      });
      void scoped;
      void backlogAdapter;
      void editCalls;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reconciliation + orphans + task-resolution parity on equivalent snapshots", async () => {
    const flow = QUEST_FLOW.statuses;
    const concept = parseConcept("stories/x.md", "---\ntype: Story\ntasks:\n  - LORE-33\n---\nBody.\n");
    const snapshot = [
      { id: "LORE-33", title: BASE_VIEW.title, status: BASE_VIEW.status, labels: ["doc:x"], aliases: [] },
    ] as never;

    const backlogAdapter = createBacklogAdapter(
      (async (argv: readonly string[]) => {
        const a = [...argv];
        if (a[0] === "--version") return { exitCode: 0, stdout: "1.49.0\n", stderr: "" };
        if (a[0] === "task" && a[1] === "view")
          return {
            exitCode: 0,
            stdout: JSON.stringify({ schemaVersion: 1, kind: "task-view", task: BASE_VIEW }),
            stderr: "",
          };
        if (a[0] === "task" && a[1] === "list") return { exitCode: 0, stdout: TASK_LIST, stderr: "" };
        throw new Error(`no script for ${JSON.stringify(a)}`);
      }) as never,
      "/repo",
    );
    const questAdapterLocal = createQuestAdapter("/repo", {
      spawn: scriptedQuest((argv) => {
        if (argv.join(" ").startsWith("task view")) return okQuest("task.view", equivalentQuestTask());
        throw new Error(`no script for ${JSON.stringify(argv)}`);
      }),
      workspaceInitialized: () => true,
    });

    for (const adapter of [backlogAdapter, questAdapterLocal]) {
      const targets = await gatherReconciliation(
        "/repo",
        [concept],
        adapter as never,
        {
          flow,
          overrides: {},
        } as never,
      );
      expect(targets).toHaveLength(1);
      expect(targets[0]?.rows.map((r) => [r.id, r.title, r.status])).toEqual([
        [BASE_VIEW.id, BASE_VIEW.title, BASE_VIEW.status],
      ]);
      const resolved = await resolveTaskDetails(adapter as never, ["LORE-33"]);
      expect(resolved.get("lore-33")?.ok ?? false).toBe(true);
      const orphans = computeOrphans([concept], snapshot, { tasksOnly: false, docsOnly: false });
      expect(orphans.orphanTasks).toHaveLength(0); // referenced via tasks:
    }
  });
});
