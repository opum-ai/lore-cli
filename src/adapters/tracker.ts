/** Backend-neutral tracker contract and construction seam. */

import { type JiraTrackerConfig, loadConfig, type TrackerBackend, type TrackerConfig } from "../config";
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
  if (adapterOverride !== undefined) {
    return adapterOverride.listTasks();
  }
  const selection = resolveTrackerSelection(root);
  if (selection.source === "explicit" && selection.backend === "none") {
    return [];
  }
  return createConfiguredTrackerAdapter(root).listTasks();
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
