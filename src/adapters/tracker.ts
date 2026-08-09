/** Backend-neutral tracker contract and construction seam. */

import { type JiraTrackerConfig, loadConfig, type TrackerBackend, type TrackerConfig } from "../config";
import { LoreError } from "../errors";
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
 */
export interface TrackerAdapter {
  /** Validate that the configured backend is reachable and supports the required operations. */
  probe(): Promise<TrackerCapability>;
  /** Return the backend/project's ordered workflow statuses without performing task I/O. */
  statusFlow(): readonly string[];
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
}

/** Load the repository's resolved tracker selection and construct that backend. */
export function createConfiguredTrackerAdapter(root: string, options: TrackerAdapterOptions = {}): TrackerAdapter {
  const config: TrackerConfig = loadConfig({ root }).tracker;
  return createTrackerAdapter(root, config, options);
}

/** Construct one selected tracker; configured production callers use `createConfiguredTrackerAdapter`. */
export function createTrackerAdapter(
  root: string,
  config: TrackerAdapterConfig = {},
  options: TrackerAdapterOptions = {},
): TrackerAdapter {
  const backend: unknown = config.backend ?? "backlog";
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
  throw new LoreError(
    "validation",
    `unsupported tracker backend ${JSON.stringify(backend)}`,
    'use "backlog" or "jira"',
    { backend },
  );
}
