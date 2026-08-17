/** Quest 0.2 tracker adapter.  Reads use Quest's versioned JSON envelopes only. */

import { errnoCode, LoreError } from "../errors";
import type { BacklogTask, BacklogTaskDetail, ListTasksOptions } from "./backlog";
import type { TrackerAdapter, TrackerCapability } from "./tracker";

export const QUEST_SCHEMA_VERSION = 1;
export const QUEST_TIMEOUT_ENV_VAR = "LORE_QUEST_TIMEOUT_MS";
export const DEFAULT_QUEST_TIMEOUT_MS = 30_000;
const ACTOR = "lore";
const ACTOR_FLAGS = ["--actor", ACTOR, "--actor-kind", "human"] as const;

export interface QuestSpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}
export type QuestSpawn = (args: readonly string[]) => Promise<QuestSpawnResult>;
export interface QuestAdapterOptions {
  readonly binary?: string;
  readonly spawn?: QuestSpawn;
}

function timeout(): number {
  const value = Number(process.env[QUEST_TIMEOUT_ENV_VAR]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_QUEST_TIMEOUT_MS;
}

/** Bounded argv-only transport; no shell is involved. */
export function bunQuestSpawn(root: string, binary = "quest"): QuestSpawn {
  return async (args) => {
    const timeoutMs = timeout();
    const child = Bun.spawn([binary, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timer = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(
          new LoreError(
            "validation",
            `\`${binary} ${args.join(" ")}\` did not exit within ${timeoutMs}ms and was killed`,
            `raise ${QUEST_TIMEOUT_ENV_VAR} only for a known slow Quest operation`,
            { binary, args: [...args], timeoutMs },
          ),
        );
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([
        Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]),
        timer,
      ]);
      return { stdout: result[0], stderr: result[1], exitCode: result[2] };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  };
}

export function createQuestAdapter(root: string, options: QuestAdapterOptions = {}): TrackerAdapter {
  const binary = options.binary ?? "quest";
  const spawn = options.spawn ?? bunQuestSpawn(root, binary);
  let capability: Promise<TrackerCapability> | undefined;
  async function run(args: readonly string[], operation: string): Promise<Record<string, unknown>> {
    let result: QuestSpawnResult;
    try {
      result = await spawn(args);
    } catch (cause) {
      if (cause instanceof LoreError) throw cause;
      const code = errnoCode(cause);
      if (code === "ENOENT")
        throw new LoreError(
          "not_found",
          "the `quest` CLI is not installed or not on PATH",
          "install Quest and run `quest init` in this repository",
          { binary },
        );
      throw new LoreError(
        code === "EACCES" || code === "EPERM" ? "denied" : "validation",
        `could not start \`quest\`${cause instanceof Error ? `: ${cause.message}` : ""}`,
        "ensure the `quest` binary is executable and on PATH",
        { binary, code },
      );
    }
    if (result.exitCode !== 0) {
      const message = result.stderr.trim() || result.stdout.trim() || `Quest exited ${result.exitCode}`;
      if (/not initialized|workspace/i.test(message))
        throw new LoreError("validation", `Quest workspace is not initialized: ${message}`, "run `quest init`", {
          operation,
        });
      throw new LoreError(
        /not[_ ]found/i.test(message) ? "not_found" : "validation",
        `\`quest ${operation}\` failed: ${message}`,
        "inspect the Quest diagnostic and correct the workspace or command input",
        { operation, exitCode: result.exitCode },
      );
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      throw new LoreError(
        "drift",
        `\`quest ${operation}\` did not print JSON`,
        "Quest 0.2.0 or a compatible JSON-contract build is required",
      );
    }
    if (
      !record(envelope) ||
      envelope.schemaVersion !== QUEST_SCHEMA_VERSION ||
      typeof envelope.kind !== "string" ||
      !Object.hasOwn(envelope, "data")
    ) {
      throw new LoreError(
        "drift",
        `\`quest ${operation}\` returned an incompatible JSON contract`,
        "Quest 0.2.0 with schemaVersion 1 is required",
        { operation },
      );
    }
    return envelope;
  }
  async function probe(): Promise<TrackerCapability> {
    // Quest's --version is deliberately plain text in 0.2.
    let versionResult: QuestSpawnResult;
    try {
      versionResult = await spawn(["--version"]);
    } catch (cause) {
      const code = errnoCode(cause);
      if (code === "ENOENT")
        throw new LoreError(
          "not_found",
          "the `quest` CLI is not installed or not on PATH",
          "install Quest and run `quest init` in this repository",
          { binary },
        );
      throw cause;
    }
    if (versionResult.exitCode !== 0 || versionResult.stdout.trim() === "")
      throw new LoreError("validation", "`quest --version` did not return a usable version", "Quest 0.2.0 is required");
    const manifest = await run(["manifest", "--json"], "manifest --json");
    const commands = (manifest.data as Record<string, unknown>).commands;
    if (!Array.isArray(commands))
      throw new LoreError("drift", "`quest manifest --json` did not contain commands", "Quest 0.2.0 is required");
    await run(["task", "status-flow", "--json"], "task status-flow --json");
    return { version: versionResult.stdout.trim(), schemaVersion: QUEST_SCHEMA_VERSION };
  }
  const ensure = () => (capability ??= probe());
  async function data(args: readonly string[], operation: string, kind: string): Promise<unknown> {
    await ensure();
    const envelope = await run(args, operation);
    if (envelope.kind !== kind)
      throw new LoreError(
        "drift",
        `\`quest ${operation}\` returned kind ${JSON.stringify(envelope.kind)}, expected ${JSON.stringify(kind)}`,
        "Quest 0.2.0 is required",
      );
    return envelope.data;
  }
  return {
    probe: ensure,
    async statusFlow() {
      const value = await data(["task", "status-flow", "--json"], "task status-flow --json", "task.status-flow");
      return strings(record(value) ? value.statuses : undefined, "task.status-flow statuses");
    },
    async listTasks(opts) {
      const tasks = await data(["task", "list", "--json"], "task list --json", "task.list");
      return list(tasks, opts);
    },
    async viewTask(id) {
      try {
        const value = await data(["task", "view", id, "--json"], "task view --json", "task.view");
        return detail(value);
      } catch (error) {
        if (error instanceof LoreError && error.type === "not_found") return null;
        throw error;
      }
    },
    async searchByLabel(label) {
      return (await this.listTasks?.({ labels: [label] })) ?? [];
    },
    async searchTasks(query) {
      const value = await data(["search", query, "--json"], "search --json", "task.search");
      return list(value);
    },
    async createTask(input) {
      const args = ["task", "create", input.title, ...ACTOR_FLAGS];
      if (input.description !== undefined) args.push("--description", input.description);
      for (const label of input.labels ?? []) args.push("--label", label);
      for (const doc of input.doc ?? []) args.push("--doc", doc);
      const value = await data([...args, "--json"], "task create", "task.created");
      const task = record(value) ? value : {};
      return string(task.id, "created task id");
    },
    async editTask(id, patch) {
      const args = ["task", "edit", id, ...ACTOR_FLAGS];
      if (patch.status) args.push("--status", patch.status);
      for (const label of patch.addLabels ?? []) args.push("--add-label", label);
      for (const label of patch.removeLabels ?? []) args.push("--remove-label", label);
      for (const doc of patch.doc ?? []) args.push("--doc", doc);
      await data([...args, "--json"], "task edit", "task.updated");
    },
  };
}

function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function string(v: unknown, name: string): string {
  if (typeof v !== "string" || !v)
    throw new LoreError("drift", `Quest returned an invalid ${name}`, "Quest 0.2.0 is required");
  return v;
}
function strings(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new LoreError("drift", `Quest returned invalid ${name}`, "Quest 0.2.0 is required");
  return [...v];
}
function summary(value: unknown): BacklogTask {
  const task = record(value) ? value : {};
  return {
    id: string(task.id, "task id"),
    title: string(task.title, "task title"),
    status: string(task.status, "task status"),
    priority: typeof task.priority === "string" ? task.priority : null,
    ordinal: typeof task.ordinal === "number" ? task.ordinal : null,
    assignees: Array.isArray(task.assignees) ? strings(task.assignees, "assignees") : [],
    labels: Array.isArray(task.labels) ? strings(task.labels, "labels") : [],
    milestone: typeof task.milestone === "string" ? task.milestone : null,
    parentTaskId: typeof task.parentTaskId === "string" ? task.parentTaskId : null,
  };
}
function list(value: unknown, opts?: ListTasksOptions): BacklogTask[] {
  if (!Array.isArray(value))
    throw new LoreError("drift", "Quest returned invalid task list", "Quest 0.2.0 is required");
  return value
    .map(summary)
    .filter(
      (task) =>
        (opts?.status === undefined || task.status === opts.status) &&
        (opts?.labels ?? []).every((label) => task.labels.includes(label)),
    );
}
function detail(value: unknown): BacklogTaskDetail {
  const task = summary(value);
  return {
    ...task,
    file: null,
    reporter: null,
    createdAt: null,
    updatedAt: null,
    dependencies: [],
    references: [],
    documentation: [],
    modifiedFiles: [],
    subtasks: [],
    acceptanceCriteria: [],
    definitionOfDone: [],
    description: null,
    implementationPlan: null,
    implementationNotes: null,
    finalSummary: null,
    comments: [],
  };
}
