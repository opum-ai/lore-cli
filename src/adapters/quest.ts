/** Quest 0.2 tracker adapter. Quest owns task storage; Lore consumes its pinned JSON CLI contract. */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { type ErrorType, errnoCode, LoreError } from "../errors";
import type { BacklogComment, BacklogCriterion, BacklogTask, BacklogTaskDetail, ListTasksOptions } from "./backlog";
import { atLeast } from "./semver";
import type { TrackerAdapter, TrackerCapability } from "./tracker";

export const QUEST_SCHEMA_VERSION = 1;
export const QUEST_TIMEOUT_ENV_VAR = "LORE_QUEST_TIMEOUT_MS";
export const DEFAULT_QUEST_TIMEOUT_MS = 30_000;
/**
 * The oldest Quest whose JSON contract this adapter is qualified against. A **minimum floor**, not a
 * bounded set (LCLI-356).
 *
 * LCLI-353 deliberately froze an exact-match allowlist (`["0.2.7", "0.2.8"]`) and its tests asserted
 * rejection of anything else. That design has a cost it was chosen without: Lore and Quest release
 * independently, so the set went stale the moment Quest shipped 0.2.9 — the two current published
 * packages could not be used together at all, and every later Quest patch would need a fresh Lore
 * release before the pair worked again. Reversed by product-owner decision on 2026-08-28.
 *
 * A floor is safe here because the version is NOT what actually enforces compatibility. Every single
 * Quest call already validates the envelope structurally — `schemaVersion === {@link
 * QUEST_SCHEMA_VERSION}`, the exact `kind`, the presence of `data`, and {@link REQUIRED_COMMANDS}
 * through the manifest — so a Quest that broke the contract would be rejected by those checks with a
 * `drift` diagnostic naming what changed, whether or not its version number happened to sit inside
 * some allowlist. The floor's job is only to give a clearly-too-old Quest a better message than a
 * mid-call structural failure would.
 */
export const MIN_QUEST_VERSION = "0.2.7";

/**
 * The stable discriminator on a below-the-floor rejection, so a caller can act on THAT failure
 * specifically without matching message text (LCLI-356).
 *
 * The distinction it enables is load-bearing: an installed Quest below the floor is a pairing that
 * cannot work at all, and no action inside the repository fixes it — the operator must install a
 * different Quest. Every other probe failure ("workspace is not initialized", "not on PATH") is one
 * setup step away in the same directory, which is exactly why LORE-319 made the capability check
 * advisory rather than fatal. `lore init` withholds a tracker selection for the first and kept
 * reporting the second as a warning — until LCLI-376: an uninitialized workspace produced a
 * SILENT broken state (`backend = "quest"` persisted, `lore check` staying green) rather than the
 * loud, later failure "one setup step away" implied, so the user reversed that half of LORE-319's
 * call. "Not on PATH" (the package genuinely missing) is unchanged and stays advisory here.
 */
export const QUEST_VERSION_FLOOR_CODE = "quest.version-below-floor";

/** Whether `error` is the below-the-floor rejection {@link QUEST_VERSION_FLOOR_CODE} marks. */
export function isQuestVersionFloorFailure(error: unknown): boolean {
  return (
    error instanceof LoreError &&
    typeof error.input === "object" &&
    error.input !== null &&
    (error.input as { code?: unknown }).code === QUEST_VERSION_FLOOR_CODE
  );
}

/** The stable discriminator on an uninitialized-workspace rejection (LCLI-376), mirroring {@link QUEST_VERSION_FLOOR_CODE}. */
export const QUEST_WORKSPACE_NOT_INITIALIZED_CODE = "quest.workspace-not-initialized";

/** Whether `error` is the uninitialized-workspace rejection {@link QUEST_WORKSPACE_NOT_INITIALIZED_CODE} marks. */
export function isQuestWorkspaceNotInitializedFailure(error: unknown): boolean {
  return (
    error instanceof LoreError &&
    typeof error.input === "object" &&
    error.input !== null &&
    (error.input as { code?: unknown }).code === QUEST_WORKSPACE_NOT_INITIALIZED_CODE
  );
}
const QUEST_VERSION_SET_HINT = `Quest ${MIN_QUEST_VERSION} or newer is required`;
const QUEST_VERSION_GATE_MESSAGE = "`quest --version` did not report a supported Quest version";
/**
 * Env vars an operator or a delegated agent session sets to declare who a Quest write is on
 * behalf of (LCLI-434). Read only at the point of an actual write — `probe`/`statusFlow`/`listTasks`
 * never require them, mirroring Quest's own write-only actor requirement.
 */
export const QUEST_ACTOR_ENV_VAR = "LORE_QUEST_ACTOR";
export const QUEST_ACTOR_KIND_ENV_VAR = "LORE_QUEST_ACTOR_KIND";
export const QUEST_ACCOUNTABLE_HUMAN_ENV_VAR = "LORE_QUEST_ACCOUNTABLE_HUMAN";
/** The stable discriminators {@link resolveActor}'s three rejections mark, for {@link isQuestActorContextFailure}. */
const QUEST_ACTOR_CONTEXT_CODES = new Set([
  "quest.actor-context-required",
  "quest.actor-kind-invalid",
  "quest.accountable-human-required",
]);
/**
 * Whether `error` is one of {@link resolveActor}'s three actor-declaration rejections (LCLI-459).
 * Every one of them is a caller configuration error, identical for every task in a batch — it
 * depends only on the global actor/env context, never on which task is being written — not a
 * genuine per-task write failure. `lore link`/`lore unlink` check this to re-throw the original
 * `validation` error directly instead of folding it into their generic per-task `drift` wrapper
 * (LORE-58's {@link backRefFailure}), matching the shape `lore init --migrate-backlog`'s Quest
 * apply/rollback already had (nothing wraps a single migration write).
 */
export function isQuestActorContextFailure(error: unknown): boolean {
  return (
    error instanceof LoreError &&
    typeof error.input === "object" &&
    error.input !== null &&
    QUEST_ACTOR_CONTEXT_CODES.has((error.input as { code?: unknown }).code as string)
  );
}
const ACTOR_CONTEXT_HINT = `set ${QUEST_ACTOR_ENV_VAR} and ${QUEST_ACTOR_KIND_ENV_VAR} before this command, e.g. ${QUEST_ACTOR_ENV_VAR}=jdoe ${QUEST_ACTOR_KIND_ENV_VAR}=human (add ${QUEST_ACCOUNTABLE_HUMAN_ENV_VAR}=<their id> for kind=delegated-agent), or pass an explicit actor to the Quest adapter's own API`;
const INSTALL_HINT = `install @opum-ai/quest@>=${MIN_QUEST_VERSION} and ensure the \`quest\` binary is on PATH`;
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

/**
 * Who a Quest write is on behalf of (LCLI-434) — mirrors Quest's own `--actor`/`--actor-kind`/
 * `--accountable-human` contract exactly, so a delegated caller's identity and accountable human
 * survive through Lore instead of being flattened to a hardcoded human attribution.
 */
export interface QuestActorContext {
  readonly id: string;
  readonly kind: "human" | "delegated-agent";
  /** Required when `kind` is `"delegated-agent"`; meaningless (and ignored) for `"human"`. */
  readonly accountableHumanId?: string;
}

export interface QuestAdapterOptions {
  readonly binary?: string;
  readonly spawn?: QuestSpawn;
  /** Injectable workspace gate; production requires Quest's durable workspace marker. */
  readonly workspaceInitialized?: QuestWorkspaceInitialized;
  /**
   * Explicit actor context for Quest writes. Falls back to `LORE_QUEST_ACTOR` /
   * `LORE_QUEST_ACTOR_KIND` / `LORE_QUEST_ACCOUNTABLE_HUMAN` when omitted; resolved (and
   * validated) only at the point of an actual write, so a caller that never writes never needs it.
   */
  readonly actor?: QuestActorContext;
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
/**
 * Quest's positional-renumbering escape hatch (LCLI-465): `preserveSourceIds` keeps each Backlog
 * record's own literal id instead of Quest's default positional renumbering (which flattens a
 * dotted subtask into a fresh sequential id, and can — Quest's own docs are explicit about this —
 * land that fresh id on a string an unrelated, never-dotted record already holds, refusing the
 * migration with an "Alias collision" error). `sourceFamily` selects which id family to import when
 * preserving ids; Quest requires it whenever `preserveSourceIds` is set, since a Backlog holding
 * more than one family (e.g. LCLI and LORE) imports one family per run.
 *
 * Must be re-supplied identically to `apply` as given to `preview` — Quest's own contract, not a
 * Lore invention — because `apply` re-derives its plan from these options rather than the digest
 * alone; the digest only proves the reviewed preview hasn't drifted since.
 */
export interface QuestBacklogMigrationOptions {
  readonly preserveSourceIds?: boolean;
  readonly sourceFamily?: string;
}

export interface QuestBacklogMigration {
  preview(source: string, options?: QuestBacklogMigrationOptions): Promise<QuestMigrationPreview>;
  apply(source: string, digest: string, options?: QuestBacklogMigrationOptions): Promise<QuestMigrationReceipt>;
  status(digest: string): Promise<QuestMigrationReceipt>;
  rollback(digest: string): Promise<QuestMigrationReceipt>;
}

function timeout(): number {
  const value = Number(process.env[QUEST_TIMEOUT_ENV_VAR]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_QUEST_TIMEOUT_MS;
}

/** Narrow a raw actor-kind string, rejecting anything but Quest's own two valid values. */
function isQuestActorKind(value: string): value is QuestActorContext["kind"] {
  return value === "human" || value === "delegated-agent";
}

/**
 * Resolve and validate the actor context for a Quest write (LCLI-434): `options.actor` when given,
 * else the `LORE_QUEST_ACTOR`/`LORE_QUEST_ACTOR_KIND`/`LORE_QUEST_ACCOUNTABLE_HUMAN` env vars.
 * Called once per write, never at adapter construction or for a read-only operation, so a caller
 * that never writes never needs an actor declared at all.
 *
 * @throws LoreError `validation` when no actor id/kind is available, the kind is neither `human`
 *   nor `delegated-agent`, or a `delegated-agent` actor has no accountable human — the write never
 *   reaches Quest with a fabricated or defaulted attribution.
 */
function resolveActor(options: QuestAdapterOptions): QuestActorContext {
  const explicit = options.actor;
  const id = explicit?.id ?? process.env[QUEST_ACTOR_ENV_VAR];
  const rawKind = explicit?.kind ?? process.env[QUEST_ACTOR_KIND_ENV_VAR];
  const accountableHumanId = explicit?.accountableHumanId ?? process.env[QUEST_ACCOUNTABLE_HUMAN_ENV_VAR];
  if (!id || !rawKind)
    throw new LoreError("validation", "Quest write requires an explicit actor declaration", ACTOR_CONTEXT_HINT, {
      code: "quest.actor-context-required",
    });
  if (!isQuestActorKind(rawKind))
    throw new LoreError(
      "validation",
      `Quest actor-kind ${JSON.stringify(rawKind)} is not valid`,
      'use "human" or "delegated-agent"',
      { code: "quest.actor-kind-invalid", kind: rawKind },
    );
  if (rawKind === "delegated-agent" && !accountableHumanId)
    throw new LoreError(
      "validation",
      "a delegated-agent Quest actor requires an accountable human",
      `set ${QUEST_ACCOUNTABLE_HUMAN_ENV_VAR}=<their id> alongside ${QUEST_ACTOR_ENV_VAR}=${id}, or pass accountableHumanId on the actor context`,
      { code: "quest.accountable-human-required", id },
    );
  return rawKind === "delegated-agent" ? { id, kind: rawKind, accountableHumanId } : { id, kind: rawKind };
}

/** Quest's `--actor`/`--actor-kind`[/`--accountable-human`] flags for a resolved {@link QuestActorContext}. */
function actorFlags(actor: QuestActorContext): string[] {
  const flags = ["--actor", actor.id, "--actor-kind", actor.kind];
  if (actor.accountableHumanId !== undefined) flags.push("--accountable-human", actor.accountableHumanId);
  return flags;
}

/**
 * `undefined`/omitted options build zero flags, preserving the default positional-renumbering
 * behavior exactly as before this option existed. Quest itself enforces that `--source-family`
 * accompanies `--preserve-source-ids` (LCLI-465) — this only forwards what the caller supplied,
 * it does not validate the pairing; that's `assertFlagCombinations` in `commands/init.ts`.
 */
function preserveSourceIdsFlags(options: QuestBacklogMigrationOptions | undefined): string[] {
  if (options?.preserveSourceIds !== true) return [];
  const flags = ["--preserve-source-ids"];
  if (options.sourceFamily !== undefined) flags.push("--source-family", safe(options.sourceFamily));
  return flags;
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
        code: QUEST_WORKSPACE_NOT_INITIALIZED_CODE,
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
    const reported = versionResult.stdout.trim();
    if (versionResult.exitCode !== 0 || !reported)
      throw new LoreError("validation", QUEST_VERSION_GATE_MESSAGE, QUEST_VERSION_SET_HINT);
    const comparison = atLeast(reported, MIN_QUEST_VERSION);
    if (comparison === null)
      throw new LoreError("validation", "`quest --version` did not print a bare semver", QUEST_VERSION_SET_HINT, {
        reported,
      });
    if (!comparison.ok)
      throw new LoreError(
        "validation",
        `Quest ${comparison.version.raw} is below the ${MIN_QUEST_VERSION} floor this adapter is qualified against`,
        INSTALL_HINT,
        { code: QUEST_VERSION_FLOOR_CODE, version: comparison.version.raw, floor: MIN_QUEST_VERSION },
      );
    const version = comparison.version.raw;
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
    async pausedStatus() {
      return pausedStatusField(
        await data(["task", "status-flow", "--json"], "task status-flow --json", "task.status-flow"),
      );
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
          "Quest does not support task-to-milestone attachment",
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
      const args = ["task", "create", safe(input.title), ...actorFlags(resolveActor(options))];
      if (input.id !== undefined) args.push("--id", safe(input.id));
      if (input.description !== undefined) args.push("--description", safe(input.description));
      for (const label of input.labels ?? []) args.push("--label", safe(label));
      for (const doc of input.doc ?? []) args.push("--doc", safe(doc));
      const value = await data([...args, "--json"], "task create", "task.created");
      if (!record(value)) throw new LoreError("drift", "Quest returned invalid created task", QUEST_VERSION_SET_HINT);
      return string(value.id, "created task id");
    },
    async editTask(id, patch) {
      const args = ["task", "edit", safe(id), ...actorFlags(resolveActor(options))];
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
    async preview(source, migrationOptions) {
      return migrationPreview(
        await data(
          [
            "migration",
            "backlog",
            "preview",
            "--source",
            safe(source),
            ...preserveSourceIdsFlags(migrationOptions),
            "--json",
          ],
          "migration.backlog-preview",
        ),
      );
    },
    async apply(source, digest, migrationOptions) {
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
            ...preserveSourceIdsFlags(migrationOptions),
            ...actorFlags(resolveActor(options)),
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
          [
            "migration",
            "backlog",
            "rollback",
            "--digest",
            safe(digest),
            ...actorFlags(resolveActor(options)),
            "--json",
          ],
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
    `${QUEST_VERSION_SET_HINT.replace(" is required", "")} with schemaVersion ${QUEST_SCHEMA_VERSION} is required`,
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
    throw new LoreError("drift", `Quest returned an invalid ${name}`, QUEST_VERSION_SET_HINT);
  return v;
}
function nullableString(v: unknown, name: string): string | null {
  return v === null || v === undefined ? null : string(v, name);
}
function strings(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string"))
    throw new LoreError("drift", `Quest returned invalid ${name}`, QUEST_VERSION_SET_HINT);
  return [...v];
}
function statusFlow(value: unknown): string[] {
  if (!record(value)) throw new LoreError("drift", "Quest returned invalid task status flow", QUEST_VERSION_SET_HINT);
  const statuses = strings(value.statuses, "task status-flow statuses");
  const terminalStatuses = strings(value.terminalStatuses, "task status-flow terminalStatuses");
  if (terminalStatuses.some((status) => !statuses.includes(status)))
    throw new LoreError("drift", "Quest returned terminal statuses outside its status flow", QUEST_VERSION_SET_HINT);
  return statuses;
}
/**
 * Quest 0.4.0's optional `pausedStatus` field (QCLI-229, LCLI-455): a non-terminal "paused" status
 * (`Blocked`, by Quest's own default) deliberately excluded from `statuses` — Quest's own
 * `LifecyclePolicy` rejects a `pausedStatus` colliding with `statuses`, so a Quest that violates
 * that invariant is drift, not a value this adapter should pass through silently.
 */
function pausedStatusField(value: unknown): string | undefined {
  if (!record(value)) throw new LoreError("drift", "Quest returned invalid task status flow", QUEST_VERSION_SET_HINT);
  if (value.pausedStatus === undefined) return undefined;
  const paused = string(value.pausedStatus, "task status-flow pausedStatus");
  const statuses = strings(value.statuses, "task status-flow statuses");
  if (statuses.includes(paused))
    throw new LoreError(
      "drift",
      "Quest returned a pausedStatus colliding with its own status flow",
      QUEST_VERSION_SET_HINT,
    );
  return paused;
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
    throw new LoreError("drift", "Quest returned invalid migration mappings", QUEST_VERSION_SET_HINT);
  return value.map((item) => {
    if (!record(item)) throw new LoreError("drift", "Quest returned invalid migration mapping", QUEST_VERSION_SET_HINT);
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
    throw new LoreError("drift", "Quest returned invalid Backlog migration preview", QUEST_VERSION_SET_HINT);
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
    throw new LoreError("drift", "Quest returned invalid Backlog migration receipt", QUEST_VERSION_SET_HINT);
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
  const invalid = () => new LoreError("drift", `Quest returned invalid ${name}`, QUEST_VERSION_SET_HINT);
  if (!Array.isArray(v)) throw invalid();
  return v.map((item) => {
    if (!record(item)) throw invalid();
    const { index, text, checked } = item;
    if (typeof text !== "string" || typeof checked !== "boolean") throw invalid();
    if (index !== undefined && (typeof index !== "number" || !Number.isInteger(index) || index < 0)) throw invalid();
    return { text, checked };
  });
}
function comments(v: unknown): BacklogComment[] {
  if (!Array.isArray(v) || v.some((x) => !record(x) || typeof x.body !== "string"))
    throw new LoreError("drift", "Quest returned invalid comments", QUEST_VERSION_SET_HINT);
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
              throw new LoreError("drift", "Quest returned an invalid task ordinal", QUEST_VERSION_SET_HINT);
            })(),
    assignees: strings(task.assignees ?? [], "assignees"),
    labels: strings(task.labels ?? [], "labels"),
    milestone: nullableString(task.milestone, "milestone"),
    parentTaskId: nullableString(task.parentId ?? task.parentTaskId, "parent task id"),
    // Unlike Backlog.md, Quest's own `task list --json` already carries the full documentation
    // array per item (LCLI-374) -- no extra per-task fetch needed to read it here.
    documentation: strings(task.documentation ?? [], "documentation"),
  };
}
function list(value: unknown, opts?: ListTasksOptions): BacklogTask[] {
  if (!Array.isArray(value)) throw new LoreError("drift", "Quest returned invalid task list", QUEST_VERSION_SET_HINT);
  return value
    .map(summary)
    .filter(
      (task) =>
        (opts?.status === undefined || task.status === opts.status) &&
        (opts?.labels ?? []).every((label) => task.labels.includes(label)),
    );
}
function detail(value: unknown): BacklogTaskDetail {
  if (!record(value)) throw new LoreError("drift", "Quest returned invalid task detail", QUEST_VERSION_SET_HINT);
  const task = summary(value);
  const subtasks = value.subtasks ?? [];
  if (
    !Array.isArray(subtasks) ||
    subtasks.some((x) => !record(x) || typeof x.id !== "string" || typeof x.title !== "string")
  )
    throw new LoreError("drift", "Quest returned invalid subtasks", QUEST_VERSION_SET_HINT);
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
