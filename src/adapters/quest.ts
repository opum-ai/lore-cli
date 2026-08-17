/** Quest 0.2 tracker adapter. Quest owns task storage; Lore consumes its pinned JSON CLI contract. */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { type ErrorType, errnoCode, LoreError } from "../errors";
import type { BacklogComment, BacklogCriterion, BacklogTask, BacklogTaskDetail, ListTasksOptions } from "./backlog";
import type { TrackerAdapter, TrackerCapability } from "./tracker";

export const QUEST_SCHEMA_VERSION = 1;
export const QUEST_TIMEOUT_ENV_VAR = "LORE_QUEST_TIMEOUT_MS";
export const DEFAULT_QUEST_TIMEOUT_MS = 30_000;
const REQUIRED_VERSION = "0.2.2";
const ACTOR_FLAGS = ["--actor", "lore", "--actor-kind", "human"] as const;
const INSTALL_HINT = "install @opum-ai/quest@0.2.2 and ensure the `quest` binary is on PATH";
const REQUIRED_COMMANDS = [
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
] as const;

export interface QuestSpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}
export type QuestSpawn = (args: readonly string[]) => Promise<QuestSpawnResult>;
export type QuestWorkspaceInitialized = (root: string) => boolean;
export interface QuestAdapterOptions {
  readonly binary?: string;
  readonly spawn?: QuestSpawn;
  /** Injectable workspace gate; production requires Quest's durable workspace marker. */
  readonly workspaceInitialized?: QuestWorkspaceInitialized;
}

export interface QuestMigrationMapping {
  readonly sourceIdentifier: string;
  readonly sourceFolder: string;
  readonly targetIdentifier: string;
  readonly aliases: readonly string[];
}
export interface QuestMigrationPreview {
  readonly sourceFingerprint: string;
  readonly digest: string;
  readonly mappings: readonly QuestMigrationMapping[];
  readonly requiresApproval: true;
}
export interface QuestMigrationReceipt {
  readonly schemaVersion: 1;
  readonly kind: "migration.backlog.receipt";
  readonly digest: string;
  readonly sourceFingerprint: string;
  readonly mappings: readonly QuestMigrationMapping[];
  readonly survivors: readonly string[];
  readonly taskFingerprints: Readonly<Record<string, string>>;
  readonly state: "applying" | "applied" | "failed" | "rolled-back";
}
export interface QuestBacklogMigration {
  preview(source: string): Promise<QuestMigrationPreview>;
  apply(source: string, digest: string): Promise<QuestMigrationReceipt>;
  status(digest: string): Promise<QuestMigrationReceipt>;
  rollback(digest: string): Promise<QuestMigrationReceipt>;
}

function timeout(): number {
  const value = Number(process.env[QUEST_TIMEOUT_ENV_VAR]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_QUEST_TIMEOUT_MS;
}

/** Bounded argv-only transport; caller data is never interpolated into a shell command. */
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
  const workspaceInitialized =
    options.workspaceInitialized ?? ((workspaceRoot) => existsSync(join(workspaceRoot, ".quest", "workspace.toml")));
  let capability: Promise<TrackerCapability> | undefined;

  function assertWorkspace(): void {
    if (!workspaceInitialized(root))
      throw new LoreError("validation", "Quest workspace is not initialized", "run `quest init`", {
        workspace: join(root, ".quest", "workspace.toml"),
      });
  }

  async function invoke(args: readonly string[], _operation: string): Promise<QuestSpawnResult> {
    try {
      return await spawn(args);
    } catch (cause) {
      if (cause instanceof LoreError) throw cause;
      const code = errnoCode(cause);
      if (code === "ENOENT")
        throw new LoreError("not_found", "the `quest` CLI is not installed or not on PATH", INSTALL_HINT, { binary });
      throw new LoreError(
        code === "EACCES" || code === "EPERM" ? "denied" : "validation",
        `could not start \`quest\`${cause instanceof Error ? `: ${cause.message}` : ""}`,
        "ensure the `quest` binary is executable and on PATH",
        { binary, code },
      );
    }
  }
  async function run(args: readonly string[], operation: string): Promise<Record<string, unknown>> {
    const result = await invoke(args, operation);
    if (result.exitCode !== 0) throw diagnostic(result, operation);
    let envelope: unknown;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      throw drift(operation, "did not print JSON");
    }
    if (!record(envelope)) throw drift(operation, "did not print a JSON envelope object");
    if (envelope.schemaVersion !== QUEST_SCHEMA_VERSION)
      throw drift(operation, `returned schemaVersion ${JSON.stringify(envelope.schemaVersion)}`);
    if (typeof envelope.kind !== "string") throw drift(operation, "did not include an envelope kind");
    if (!Object.hasOwn(envelope, "data")) throw drift(operation, "did not include envelope data");
    return envelope;
  }
  async function probe(): Promise<TrackerCapability> {
    assertWorkspace();
    const versionResult = await invoke(["--version"], "--version");
    const version = versionResult.stdout.trim();
    if (versionResult.exitCode !== 0 || version !== REQUIRED_VERSION)
      throw new LoreError(
        "validation",
        "`quest --version` did not return a supported Quest 0.2 version",
        `Quest ${REQUIRED_VERSION} is required`,
      );
    const manifest = await run(["manifest", "--json"], "manifest --json");
    if (manifest.kind !== "manifest.registry")
      throw drift("manifest --json", `returned kind ${JSON.stringify(manifest.kind)}, expected "manifest.registry"`);
    verifyManifest(manifest.data);
    const flow = await run(["task", "status-flow", "--json"], "task status-flow --json");
    if (flow.kind !== "task.status-flow")
      throw drift("task status-flow --json", `returned kind ${JSON.stringify(flow.kind)}, expected "task.status-flow"`);
    statusFlow(flow.data);
    return { version, schemaVersion: QUEST_SCHEMA_VERSION };
  }
  const ensure = () => (capability ??= probe());
  async function data(args: readonly string[], operation: string, kind: string): Promise<unknown> {
    await ensure();
    const envelope = await run(args, operation);
    if (envelope.kind !== kind)
      throw drift(operation, `returned kind ${JSON.stringify(envelope.kind)}, expected ${JSON.stringify(kind)}`);
    return envelope.data;
  }
  async function listTasks(opts?: ListTasksOptions): Promise<BacklogTask[]> {
    return list(await data(["task", "list", "--json"], "task list --json", "task.list"), opts);
  }
  return {
    probe: ensure,
    async statusFlow() {
      return statusFlow(await data(["task", "status-flow", "--json"], "task status-flow --json", "task.status-flow"));
    },
    async listTasks(opts) {
      return listTasks(opts);
    },
    async viewTask(id) {
      const taskId = safe(id);
      try {
        return detail(await data(["task", "view", taskId, "--json"], "task view --json", "task.view"));
      } catch (error) {
        if (error instanceof LoreError && error.type === "not_found") return null;
        throw error;
      }
    },
    async searchByLabel(label) {
      return listTasks({ labels: [safe(label)] });
    },
    async searchTasks(query) {
      return list(await data(["search", safe(query), "--json"], "search --json", "task.search"));
    },
    async createTask(input) {
      if (input.milestone !== undefined)
        throw new LoreError(
          "validation",
          "Quest 0.2 does not support task milestones",
          "omit the milestone or select a tracker backend that supports milestones",
          { milestone: input.milestone },
        );
      if (input.id !== undefined && !/^T-[1-9][0-9]*$/.test(input.id))
        throw new LoreError(
          "validation",
          `Quest 0.2 cannot create task id ${JSON.stringify(input.id)}`,
          "use a canonical T-<positive integer> id; migrating other ids requires an approved reference rewrite policy",
          { id: input.id },
        );
      const args = ["task", "create", safe(input.title), ...ACTOR_FLAGS];
      if (input.id !== undefined) args.push("--id", safe(input.id));
      if (input.description !== undefined) args.push("--description", safe(input.description));
      for (const label of input.labels ?? []) args.push("--label", safe(label));
      for (const doc of input.doc ?? []) args.push("--doc", safe(doc));
      const value = await data([...args, "--json"], "task create", "task.created");
      if (!record(value))
        throw new LoreError("drift", "Quest returned invalid created task", `Quest ${REQUIRED_VERSION} is required`);
      return string(value.id, "created task id");
    },
    async editTask(id, patch) {
      const args = ["task", "edit", safe(id), ...ACTOR_FLAGS];
      if (patch.status) args.push("--status", safe(patch.status));
      for (const label of patch.addLabels ?? []) args.push("--add-label", safe(label));
      for (const label of patch.removeLabels ?? []) args.push("--remove-label", safe(label));
      for (const doc of patch.doc ?? []) args.push("--doc", safe(doc));
      await data([...args, "--json"], "task edit", "task.updated");
    },
  };
}

/** Public Quest Backlog migration lifecycle; no Quest storage is read by Lore. */
export function createQuestBacklogMigration(root: string, options: QuestAdapterOptions = {}): QuestBacklogMigration {
  const binary = options.binary ?? "quest";
  const spawn = options.spawn ?? bunQuestSpawn(root, binary);
  const probe = createQuestAdapter(root, options).probe;
  async function data(args: readonly string[], expectedKind: string): Promise<unknown> {
    await probe();
    let result: QuestSpawnResult;
    try {
      result = await spawn(args);
    } catch (cause) {
      const code = errnoCode(cause);
      if (code === "ENOENT")
        throw new LoreError("not_found", "the `quest` CLI is not installed or not on PATH", INSTALL_HINT, { binary });
      throw cause;
    }
    if (result.exitCode !== 0) throw diagnostic(result, args.join(" "));
    let envelope: unknown;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      throw drift(args.join(" "), "did not print JSON");
    }
    if (
      !record(envelope) ||
      envelope.schemaVersion !== QUEST_SCHEMA_VERSION ||
      envelope.kind !== expectedKind ||
      !Object.hasOwn(envelope, "data")
    )
      throw drift(args.join(" "), `returned an incompatible ${JSON.stringify(expectedKind)} envelope`);
    return envelope.data;
  }
  return {
    async preview(source) {
      return migrationPreview(
        await data(
          ["migration", "backlog", "preview", "--source", safe(source), "--json"],
          "migration.backlog-preview",
        ),
      );
    },
    async apply(source, digest) {
      return migrationReceipt(
        await data(
          [
            "migration",
            "backlog",
            "apply",
            "--source",
            safe(source),
            "--digest",
            safe(digest),
            ...ACTOR_FLAGS,
            "--json",
          ],
          "migration.backlog-applied",
        ),
      );
    },
    async status(digest) {
      return migrationReceipt(
        await data(["migration", "backlog", "status", "--digest", safe(digest), "--json"], "migration.backlog-status"),
      );
    },
    async rollback(digest) {
      return migrationReceipt(
        await data(
          ["migration", "backlog", "rollback", "--digest", safe(digest), ...ACTOR_FLAGS, "--json"],
          "migration.backlog-rolled-back",
        ),
      );
    },
  };
}

function diagnostic(result: QuestSpawnResult, operation: string): LoreError {
  const text = result.stderr.trim() || result.stdout.trim();
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      record(parsed) &&
      validErrorType(parsed.error_type) &&
      typeof parsed.message === "string" &&
      (parsed.hint === undefined || typeof parsed.hint === "string")
    )
      return new LoreError(parsed.error_type, parsed.message, parsed.hint, parsed.input);
  } catch {
    /* Quest also permits human diagnostics. */
  }
  if (/not initialized|workspace/i.test(text))
    return new LoreError(
      "validation",
      `Quest workspace is not available: ${text}`,
      "inspect the Quest workspace configuration",
      {
        operation,
        exitCode: result.exitCode,
      },
    );
  return new LoreError(
    /not[_ ]found/i.test(text) ? "not_found" : "validation",
    `\`quest ${operation}\` failed: ${text || `Quest exited ${result.exitCode}`}`,
    "inspect the Quest diagnostic and correct the workspace or command input",
    { operation, exitCode: result.exitCode },
  );
}
function validErrorType(value: unknown): value is ErrorType {
  return (
    value === "usage" ||
    value === "not_found" ||
    value === "denied" ||
    value === "conflict" ||
    value === "validation" ||
    value === "drift"
  );
}
function drift(operation: string, reason: string): LoreError {
  return new LoreError(
    "drift",
    `\`quest ${operation}\` ${reason}`,
    `Quest ${REQUIRED_VERSION} with schemaVersion ${QUEST_SCHEMA_VERSION} is required`,
    { operation },
  );
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function safe(value: string): string {
  if (value.startsWith("-"))
    throw new LoreError(
      "validation",
      `cannot send ${JSON.stringify(value)} to Quest: a value beginning with "-" would be parsed as a flag`,
      "rename the value so it does not begin with '-'",
      { value },
    );
  return value;
}
function string(v: unknown, name: string): string {
  if (typeof v !== "string" || !v)
    throw new LoreError("drift", `Quest returned an invalid ${name}`, `Quest ${REQUIRED_VERSION} is required`);
  return v;
}
function nullableString(v: unknown, name: string): string | null {
  return v === null || v === undefined ? null : string(v, name);
}
function strings(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new LoreError("drift", `Quest returned invalid ${name}`, `Quest ${REQUIRED_VERSION} is required`);
  return [...v];
}
function statusFlow(value: unknown): string[] {
  if (!record(value))
    throw new LoreError("drift", "Quest returned invalid task status flow", `Quest ${REQUIRED_VERSION} is required`);
  const statuses = strings(value.statuses, "task status-flow statuses");
  const terminalStatuses = strings(value.terminalStatuses, "task status-flow terminalStatuses");
  if (terminalStatuses.some((status) => !statuses.includes(status)))
    throw new LoreError(
      "drift",
      "Quest returned terminal statuses outside its status flow",
      `Quest ${REQUIRED_VERSION} is required`,
    );
  return statuses;
}
function verifyManifest(value: unknown): void {
  if (!record(value) || !Array.isArray(value.commands))
    throw drift("manifest --json", "did not contain a commands array");
  for (const [name, kind, mutates] of REQUIRED_COMMANDS) {
    const command = value.commands.find((candidate) => record(candidate) && candidate.name === name);
    if (
      !record(command) ||
      command.schemaVersion !== QUEST_SCHEMA_VERSION ||
      command.kind !== kind ||
      command.mutates !== mutates
    )
      throw drift("manifest --json", `did not contain the required ${JSON.stringify(name)} command descriptor`);
  }
}
function migrationMappings(value: unknown): QuestMigrationMapping[] {
  if (!Array.isArray(value))
    throw new LoreError("drift", "Quest returned invalid migration mappings", `Quest ${REQUIRED_VERSION} is required`);
  return value.map((item) => {
    if (!record(item))
      throw new LoreError("drift", "Quest returned invalid migration mapping", `Quest ${REQUIRED_VERSION} is required`);
    return {
      sourceIdentifier: string(item.sourceIdentifier, "migration source identifier"),
      sourceFolder: string(item.sourceFolder, "migration source folder"),
      targetIdentifier: string(item.targetIdentifier, "migration target identifier"),
      aliases: strings(item.aliases, "migration aliases"),
    };
  });
}
function migrationPreview(value: unknown): QuestMigrationPreview {
  if (!record(value) || value.requiresApproval !== true)
    throw new LoreError(
      "drift",
      "Quest returned invalid Backlog migration preview",
      `Quest ${REQUIRED_VERSION} is required`,
    );
  return {
    sourceFingerprint: string(value.sourceFingerprint, "migration source fingerprint"),
    digest: string(value.digest, "migration digest"),
    mappings: migrationMappings(value.mappings),
    requiresApproval: true,
  };
}
function migrationReceipt(value: unknown): QuestMigrationReceipt {
  if (
    !record(value) ||
    value.schemaVersion !== QUEST_SCHEMA_VERSION ||
    value.kind !== "migration.backlog.receipt" ||
    !["applying", "applied", "failed", "rolled-back"].includes(value.state as string) ||
    !record(value.taskFingerprints) ||
    Object.values(value.taskFingerprints).some((fingerprint) => typeof fingerprint !== "string" || !fingerprint)
  )
    throw new LoreError(
      "drift",
      "Quest returned invalid Backlog migration receipt",
      `Quest ${REQUIRED_VERSION} is required`,
    );
  return {
    schemaVersion: 1,
    kind: "migration.backlog.receipt",
    sourceFingerprint: string(value.sourceFingerprint, "migration source fingerprint"),
    digest: string(value.digest, "migration digest"),
    mappings: migrationMappings(value.mappings),
    survivors: strings(value.survivors, "migration survivors"),
    taskFingerprints: value.taskFingerprints as Readonly<Record<string, string>>,
    state: value.state as QuestMigrationReceipt["state"],
  };
}
function criteria(v: unknown, name: string): BacklogCriterion[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new LoreError("drift", `Quest returned invalid ${name}`, `Quest ${REQUIRED_VERSION} is required`);
  return v.map((text) => ({ text, checked: false }));
}
function comments(v: unknown): BacklogComment[] {
  if (!Array.isArray(v) || v.some((x) => !record(x) || typeof x.body !== "string"))
    throw new LoreError("drift", "Quest returned invalid comments", `Quest ${REQUIRED_VERSION} is required`);
  return v.map((x) => ({
    author: nullableString(x.author ?? x.authorId, "comment author"),
    createdAt: nullableString(x.createdAt, "comment createdAt"),
    body: x.body as string,
  }));
}
function lineBlock(v: unknown, name: string): string | null {
  if (v === undefined || v === null) return null;
  return strings(v, name).join("\n") || null;
}
function summary(value: unknown): BacklogTask {
  const task = record(value) ? value : {};
  return {
    id: string(task.id, "task id"),
    aliases: strings(task.aliases ?? [], "task aliases"),
    title: string(task.title, "task title"),
    status: string(task.status, "task status"),
    priority: nullableString(task.priority, "task priority"),
    ordinal:
      task.ordinal === null || task.ordinal === undefined
        ? null
        : typeof task.ordinal === "number"
          ? task.ordinal
          : (() => {
              throw new LoreError(
                "drift",
                "Quest returned an invalid task ordinal",
                `Quest ${REQUIRED_VERSION} is required`,
              );
            })(),
    assignees: strings(task.assignees ?? [], "assignees"),
    labels: strings(task.labels ?? [], "labels"),
    milestone: nullableString(task.milestone, "milestone"),
    parentTaskId: nullableString(task.parentId ?? task.parentTaskId, "parent task id"),
  };
}
function list(value: unknown, opts?: ListTasksOptions): BacklogTask[] {
  if (!Array.isArray(value))
    throw new LoreError("drift", "Quest returned invalid task list", `Quest ${REQUIRED_VERSION} is required`);
  return value
    .map(summary)
    .filter(
      (task) =>
        (opts?.status === undefined || task.status === opts.status) &&
        (opts?.labels ?? []).every((label) => task.labels.includes(label)),
    );
}
function detail(value: unknown): BacklogTaskDetail {
  if (!record(value))
    throw new LoreError("drift", "Quest returned invalid task detail", `Quest ${REQUIRED_VERSION} is required`);
  const task = summary(value);
  const subtasks = value.subtasks ?? [];
  if (
    !Array.isArray(subtasks) ||
    subtasks.some((x) => !record(x) || typeof x.id !== "string" || typeof x.title !== "string")
  )
    throw new LoreError("drift", "Quest returned invalid subtasks", `Quest ${REQUIRED_VERSION} is required`);
  return {
    ...task,
    file: nullableString(value.file ?? value.path, "task file"),
    reporter: nullableString(value.reporter, "reporter"),
    createdAt: nullableString(value.createdAt, "createdAt"),
    updatedAt: nullableString(value.updatedAt, "updatedAt"),
    dependencies: strings(value.dependencies ?? [], "dependencies"),
    references: strings(value.references ?? [], "references"),
    documentation: strings(value.documentation ?? [], "documentation"),
    modifiedFiles: strings(value.modifiedFiles ?? [], "modifiedFiles"),
    subtasks: subtasks.map((x) => ({ id: x.id as string, title: x.title as string })),
    acceptanceCriteria: criteria(value.acceptanceCriteria ?? [], "acceptanceCriteria"),
    definitionOfDone: criteria(value.definitionOfDone ?? [], "definitionOfDone"),
    description: nullableString(value.description, "description"),
    implementationPlan: lineBlock(value.plan, "plan"),
    implementationNotes: lineBlock(value.implementationNotes, "implementationNotes"),
    finalSummary: nullableString(value.finalSummary, "finalSummary"),
    comments: comments(value.comments ?? []),
  };
}
