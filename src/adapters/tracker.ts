/** Backend-neutral tracker contract and construction seam. */

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
export type TrackerBackend = "backlog";

/** Factory input kept separate from `.lore/config.toml` until tracker configuration lands. */
export interface TrackerAdapterConfig {
  readonly backend?: TrackerBackend;
}

/** Construct the selected tracker for `root`; the sole concrete construction site in production. */
export function createTrackerAdapter(root: string, config: TrackerAdapterConfig = {}): TrackerAdapter {
  const backend: unknown = config.backend ?? "backlog";
  if (backend !== "backlog") {
    throw new LoreError(
      "validation",
      `unsupported tracker backend ${JSON.stringify(backend)}`,
      'use "backlog"; no other tracker backend is reachable in this release',
      { backend },
    );
  }
  return createBacklogAdapter(bunBacklogSpawn(undefined, root), root);
}
