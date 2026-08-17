/** Explicit, preflighted migration from Backlog task storage to Quest. */

import type { BacklogTaskDetail, CreateTaskInput, EditTaskPatch, ListTasksOptions } from "./adapters/backlog";
import { questMigrationLabels } from "./adapters/quest";
import type { TrackerAdapter, TrackerCapability } from "./adapters/tracker";
import { LoreError } from "./errors";

export interface TrackerMigrationResult {
  readonly created: readonly string[];
  readonly reused: readonly string[];
}

/**
 * Preserve Backlog ids while migrating the subset Quest 0.2 can represent without semantic loss.
 * Every source and destination task is inspected before the first write. Unsupported rich fields
 * fail the whole preflight; Lore never silently flattens them into prose or switches the configured
 * backend after a partial copy.
 */
export async function migrateBacklogTasksToQuest(
  source: TrackerAdapter,
  destination: TrackerAdapter,
): Promise<TrackerMigrationResult> {
  const [sourceTasks, flow] = await Promise.all([source.listTasks(), destination.statusFlow()]);
  if (flow.length === 0) {
    throw new LoreError("drift", "Quest returned an empty status flow", "install the authorized Quest 0.2 RC");
  }

  const planned: Array<{ task: BacklogTaskDetail; existing: BacklogTaskDetail | null }> = [];
  for (const summary of sourceTasks) {
    const task = await source.viewTask(summary.id);
    if (task === null) {
      throw new LoreError(
        "conflict",
        `Backlog task ${summary.id} disappeared during migration preflight`,
        "retry after the Backlog task set is stable",
        { id: summary.id },
      );
    }
    assertMigratable(task, flow);
    const existing = await destination.viewTask(task.id);
    if (existing !== null) assertEquivalent(task, existing);
    planned.push({ task, existing });
  }

  const created: string[] = [];
  const reused: string[] = [];
  for (const item of planned) {
    if (item.existing !== null) {
      reused.push(item.task.id);
      continue;
    }
    const labels = [...item.task.labels, ...questMigrationLabels(item.task.priority, item.task.ordinal)];
    const input: CreateTaskInput = {
      id: item.task.id,
      title: item.task.title,
      ...(item.task.description === null ? {} : { description: item.task.description }),
      ...(labels.length === 0 ? {} : { labels }),
      ...(item.task.documentation.length === 0 ? {} : { doc: item.task.documentation }),
    };
    const id = await destination.createTask(input);
    if (id !== item.task.id) {
      throw new LoreError(
        "drift",
        `Quest created ${id} while migration requested ${item.task.id}`,
        "do not switch tracker backends; inspect the partial Quest migration",
        { requested: item.task.id, created: id },
      );
    }
    await advanceStatus(destination, item.task.id, item.task.status, flow);
    created.push(id);
  }
  return { created, reused };
}

function assertMigratable(task: BacklogTaskDetail, flow: readonly string[]): void {
  const unsupported: string[] = [];
  if (!/^T-[1-9][0-9]*$/.test(task.id)) unsupported.push(`id:${task.id}`);
  if (task.assignees.length > 0) unsupported.push("assignees");
  if (task.milestone !== null) unsupported.push("milestone");
  if (task.parentTaskId !== null) unsupported.push("parentTaskId");
  if (task.dependencies.length > 0) unsupported.push("dependencies");
  if (task.references.length > 0) unsupported.push("references");
  if (task.modifiedFiles.length > 0) unsupported.push("modifiedFiles");
  if (task.subtasks.length > 0) unsupported.push("subtasks");
  if (task.acceptanceCriteria.length > 0) unsupported.push("acceptanceCriteria");
  if (task.definitionOfDone.length > 0) unsupported.push("definitionOfDone");
  if (task.implementationPlan !== null) unsupported.push("implementationPlan");
  if (task.implementationNotes !== null) unsupported.push("implementationNotes");
  if (task.finalSummary !== null) unsupported.push("finalSummary");
  if (task.comments.length > 0) unsupported.push("comments");
  if (!flow.includes(task.status)) unsupported.push(`status:${task.status}`);
  if (unsupported.length > 0) {
    throw new LoreError(
      "validation",
      `Backlog task ${task.id} cannot be represented losslessly by Quest 0.2`,
      "pin Backlog with `lore init --tracker backlog`; non-T-N ids require an approved Story/task reference rewrite policy",
      { id: task.id, unsupported },
    );
  }
}

function assertEquivalent(source: BacklogTaskDetail, destination: BacklogTaskDetail): void {
  const mismatched: string[] = [];
  if (destination.title !== source.title) mismatched.push("title");
  if (destination.status !== source.status) mismatched.push("status");
  if (destination.description !== source.description) mismatched.push("description");
  if (destination.priority !== source.priority) mismatched.push("priority");
  if (destination.ordinal !== source.ordinal) mismatched.push("ordinal");
  if (!same(destination.labels, source.labels)) mismatched.push("labels");
  if (!same(destination.documentation, source.documentation)) mismatched.push("documentation");
  if (mismatched.length > 0) {
    throw new LoreError(
      "conflict",
      `Quest task ${source.id} already exists with different migration data`,
      "do not switch tracker backends; reconcile or remove the conflicting Quest task explicitly",
      { id: source.id, mismatched },
    );
  }
}

async function advanceStatus(
  destination: TrackerAdapter,
  id: string,
  target: string,
  flow: readonly string[],
): Promise<void> {
  const targetIndex = flow.indexOf(target);
  for (let index = 1; index <= targetIndex; index += 1) {
    await destination.editTask(id, { status: flow[index] });
  }
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Type-only fixture helper kept local to avoid widening the production adapter contract. */
export type TrackerMigrationAdapter = {
  probe(): Promise<TrackerCapability>;
  statusFlow(): Promise<readonly string[]>;
  listTasks(opts?: ListTasksOptions): ReturnType<TrackerAdapter["listTasks"]>;
  viewTask(id: string): ReturnType<TrackerAdapter["viewTask"]>;
  searchByLabel(label: string): ReturnType<TrackerAdapter["searchByLabel"]>;
  searchTasks(query: string): ReturnType<TrackerAdapter["searchTasks"]>;
  createTask(input: CreateTaskInput): Promise<string>;
  editTask(id: string, patch: EditTaskPatch): Promise<void>;
};
