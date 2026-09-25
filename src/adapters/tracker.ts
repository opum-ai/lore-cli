/** Backend-neutral tracker contract and construction seam. */

import { type JiraTrackerConfig, loadConfig, type TrackerBackend, type TrackerConfig } from "../config";
import type { StatusFlowHints } from "../core/reconcile";
import { LoreError } from "../errors";
import { resolveTrackerSelection } from "../tracker-selection";
import {
  type BacklogTask,
  type BacklogTaskDetail,
  bunBacklogSpawn,
  type CreateTaskInput,
  createBacklogAdapter,
  type EditTaskPatch,
  type ListTasksOptions,
} from "./backlog";
import { createJiraAdapter, type JiraAdapterOptions } from "./jira";
import { createQuestAdapter, type QuestAdapterOptions } from "./quest";

/** The minimum capability shape commands consume after a backend-specific fail-loud probe. */
export interface TrackerCapability {
  readonly version: string;
  /** Optional backend-specific machine contract version (Backlog.md exposes its JSON schema). */
  readonly schemaVersion?: number;
}

/**
 * The behavior every tracker backend must provide.
 *
 * Implementations fail loud on capability and transport errors. Callers preserve bounded
 * concurrency around per-task fan-out and verify that a viewed task's returned id matches the id
 * requested; those safeguards remain obligations of this interface even though they live above it.
 *
 * Repository persistence is deliberately NOT part of this data contract (LCLI-333.1): whether a
 * command run commits anything to this repository's git tree — and what domain it may commit — is
 * owned by `tracker-persistence.ts`, keyed off the same single
 * `resolveTrackerSelection`/`resolveSelectedBackend` decision that constructed this adapter. Do
 * not re-add a per-adapter commit seam here.
 */
export interface TrackerAdapter {
  /**
   * This adapter's own identity, stamped onto every projection task record as
   * `sourceAdapterVersion` so a consumer can tell WHICH backend produced a record (LCLI-494).
   *
   * A **synchronous property, not a method**, on purpose: it is read while building a projection
   * from an already-fetched task list, where there is no I/O to await and no failure to handle.
   * Being part of this interface is the point — a new backend cannot be added without supplying
   * one, which is what stops the value drifting back to a literal at the projection site. It was
   * one before: every record claimed `backlog-json/1` regardless of the backend that produced it,
   * so a Quest-backed export stated a wrong answer rather than omitting one.
   *
   * The `<backend>-<transport>/<n>` shape names the ADAPTER CONTRACT, not the backend's own
   * version: `backlog-json/1` is "the Backlog.md adapter reading `--json`, first contract". Bump the
   * trailing integer when the records this adapter produces change shape, not when the tool behind
   * it releases.
   */
  readonly sourceAdapterVersion: string;
  /**
   * The reader-facing hints lore's status-flow errors carry for THIS backend (LCLI-503) — where
   * its {@link statusFlow} actually comes from and how to change it.
   *
   * A synchronous property for the same reason as {@link sourceAdapterVersion}, and added for the
   * same defect: the three throws in `core/reconcile.ts` named `backlog/config.yml` as a literal,
   * so a Quest-backed workspace was told to edit a file it does not have. Being on this interface
   * is what stops the literal coming back — a new backend cannot be added without saying where its
   * own flow lives.
   */
  readonly statusFlowHints: StatusFlowHints;
  /** Validate that the configured backend is reachable and supports the required operations. */
  probe(): Promise<TrackerCapability>;
  /** Return the backend/project's ordered workflow statuses without performing task I/O. */
  statusFlow(): Promise<readonly string[]>;
  /**
   * A non-terminal "paused"/side status this backend excludes from {@link statusFlow}'s ladder by
   * design (Quest 0.4.0's `Blocked`, LCLI-455), or `undefined` when the backend has none — never a
   * signal that no task is currently paused, only that this ladder alone classifies every status
   * the backend can report. Optional: a backend with no such concept (Backlog, Jira) omits it
   * entirely rather than implementing it as an always-`undefined` no-op.
   */
  pausedStatus?(): Promise<string | undefined>;
  /**
   * Throw the error a write would throw when that error is caller configuration rather than a
   * per-task failure, so a command can refuse BEFORE it writes anything of its own (LCLI-582).
   * Quest implements it as its actor-declaration check: a missing `LORE_QUEST_ACTOR` fails every
   * write identically, so `lore link` used to write the concept's `tasks:` and only then learn that
   * no back-reference edit could land. Synchronous and I/O-free on purpose — it asks only what the
   * adapter already knows. Optional: a backend whose writes need no such declaration omits it.
   */
  assertWriteReady?(): void;
  listTasks(opts?: ListTasksOptions): Promise<BacklogTask[]>;
  viewTask(id: string): Promise<BacklogTaskDetail | null>;
  searchByLabel(label: string): Promise<BacklogTask[]>;
  searchTasks(query: string): Promise<BacklogTask[]>;
  createTask(input: CreateTaskInput): Promise<string>;
  editTask(id: string, patch: EditTaskPatch): Promise<void>;
}

/** Backends currently constructible by production code. */
export type { TrackerBackend } from "../config";

/** Resolved tracker selection and backend-specific configuration accepted by the factory. */
export interface TrackerAdapterConfig {
  readonly backend?: TrackerBackend;
  readonly jira?: JiraTrackerConfig;
}

/** Injectable backend construction seams; production callers normally omit this. */
export interface TrackerAdapterOptions {
  readonly jira?: JiraAdapterOptions;
  readonly quest?: QuestAdapterOptions;
}

/** Load the repository's resolved tracker selection and construct that backend. */
export function createConfiguredTrackerAdapter(root: string, options: TrackerAdapterOptions = {}): TrackerAdapter {
  const selection = resolveTrackerSelection(root);
  if (selection.source === "legacy-backlog") {
    throw new LoreError(
      "validation",
      "this bundle has Backlog tasks but no explicit tracker backend",
      "run `quest init`, then `lore init --tracker quest --migrate-backlog`; or pin Backlog with `lore init --tracker backlog`",
      { backend: selection.backend, source: selection.source },
    );
  }
  const config: TrackerConfig = loadConfig({ root }).tracker;
  if (config.backend === "none") {
    throw new LoreError(
      "validation",
      "this bundle has issue-tracker coupling disabled",
      "select a tracker with `lore init --tracker quest`, `lore init --tracker backlog`, or `lore init --tracker jira`",
      { backend: "none" },
    );
  }
  return createTrackerAdapter(root, { ...config, backend: selection.backend }, options);
}

/**
 * List every task the configured tracker holds, or an empty list when the backend is explicitly
 * `"none"` (LCLI-435) — a docs-only bundle genuinely has no tasks to represent, which is not the
 * same fact as the issue-tracker-coupling-disabled error a real read/write against that backend
 * would throw. For a read-only projection (`lore export`, the Ladybug indexed source builder),
 * that distinction matters: `lore validate --strict` already accepts a tracker-none bundle, so its
 * export/index should too, while any genuine tracker write still rejects disabled coupling exactly
 * as before (`defaultAdapter`/`createConfiguredTrackerAdapter`, unchanged).
 *
 * An ambiguous legacy-Backlog bundle (`resolveTrackerSelection`'s `"legacy-backlog"` source) is
 * NOT short-circuited here — that is a real configuration ambiguity, not "no tracker", so it still
 * throws via `createConfiguredTrackerAdapter`'s own check. Only an *explicit* `"none"` selection
 * short-circuits.
 */
export async function listTasksOrEmpty(
  root: string,
  adapterOverride?: TrackerAdapter,
): Promise<readonly BacklogTask[]> {
  return (await listTasksWithSource(root, adapterOverride)).tasks;
}

/** A task list together with the identity of the adapter that produced it. */
export interface TrackerTaskListing {
  readonly tasks: readonly BacklogTask[];
  /**
   * The producing adapter's {@link TrackerAdapter.sourceAdapterVersion}, or `null` when no tracker
   * backend is selected — in which case {@link tasks} is necessarily empty, so there is no record
   * for the identity to stamp. The two travel together precisely so a caller cannot obtain the
   * tasks without also obtaining where they came from (LCLI-494).
   */
  readonly sourceAdapterVersion: string | null;
}

/**
 * {@link listTasksOrEmpty}, additionally returning the producing adapter's identity.
 *
 * Every projection caller uses this rather than the tasks alone. The provenance of a task record
 * has to be sourced from the same place as the record, or it becomes a guess made at the far end —
 * which is what it was: a literal `"backlog-json/1"` written at the projection site regardless of
 * the backend that had actually run.
 */
export async function listTasksWithSource(root: string, adapterOverride?: TrackerAdapter): Promise<TrackerTaskListing> {
  if (adapterOverride !== undefined) {
    return { tasks: await adapterOverride.listTasks(), sourceAdapterVersion: adapterOverride.sourceAdapterVersion };
  }
  const selection = resolveTrackerSelection(root);
  if (selection.source === "explicit" && selection.backend === "none") {
    return { tasks: [], sourceAdapterVersion: null };
  }
  const adapter = createConfiguredTrackerAdapter(root);
  return { tasks: await adapter.listTasks(), sourceAdapterVersion: adapter.sourceAdapterVersion };
}

/** Construct one selected tracker; configured production callers use `createConfiguredTrackerAdapter`. */
export function createTrackerAdapter(
  root: string,
  config: TrackerAdapterConfig = {},
  options: TrackerAdapterOptions = {},
): TrackerAdapter {
  const backend: unknown = config.backend ?? "quest";
  if (backend === "quest") {
    return createQuestAdapter(root, options.quest);
  }
  if (backend === "backlog") {
    return createBacklogAdapter(bunBacklogSpawn(undefined, root), root);
  }
  if (backend === "jira") {
    if (config.jira === undefined) {
      throw new LoreError(
        "validation",
        "tracker.jira configuration is required when the tracker backend is jira",
        "configure [tracker.jira] in .lore/config.toml and run `jira init --yes`",
        { backend },
      );
    }
    return createJiraAdapter(root, config.jira, options.jira);
  }
  if (backend === "none") {
    throw new LoreError(
      "validation",
      "this bundle has issue-tracker coupling disabled",
      "select a tracker with `lore init --tracker quest`, `lore init --tracker backlog`, or `lore init --tracker jira`",
      { backend },
    );
  }
  throw new LoreError(
    "validation",
    `unsupported tracker backend ${JSON.stringify(backend)}`,
    'use "quest", "backlog", "jira", or "none"',
    { backend },
  );
}
