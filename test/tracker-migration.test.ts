import { describe, expect, test } from "bun:test";
import type { BacklogTaskDetail, CreateTaskInput, EditTaskPatch } from "../src/adapters/backlog";
import type { TrackerAdapter } from "../src/adapters/tracker";
import { LoreError } from "../src/errors";
import { migrateBacklogTasksToQuest } from "../src/tracker-migration";

function task(overrides: Partial<BacklogTaskDetail> = {}): BacklogTaskDetail {
  return {
    id: "T-1",
    title: "Migrate safely",
    status: "In Progress",
    priority: "High",
    ordinal: 42,
    assignees: [],
    labels: ["docs"],
    milestone: null,
    parentTaskId: null,
    file: "backlog/tasks/lcli-1.md",
    reporter: null,
    createdAt: "2026-08-17T00:00:00Z",
    updatedAt: "2026-08-17T01:00:00Z",
    dependencies: [],
    references: [],
    documentation: ["docs/story.md"],
    modifiedFiles: [],
    subtasks: [],
    acceptanceCriteria: [],
    definitionOfDone: [],
    description: "Body",
    implementationPlan: null,
    implementationNotes: null,
    finalSummary: null,
    comments: [],
    ...overrides,
  };
}

function adapter(
  options: {
    tasks?: BacklogTaskDetail[];
    flow?: string[];
    creates?: CreateTaskInput[];
    edits?: Array<{ id: string; patch: EditTaskPatch }>;
    existing?: Map<string, BacklogTaskDetail>;
  } = {},
): TrackerAdapter {
  const tasks = options.tasks ?? [];
  return {
    probe: async () => ({ version: "test" }),
    statusFlow: async () => options.flow ?? ["To Do", "In Progress", "Done"],
    listTasks: async () => tasks,
    viewTask: async (id) => options.existing?.get(id) ?? tasks.find((item) => item.id === id) ?? null,
    searchByLabel: async () => [],
    searchTasks: async () => [],
    createTask: async (input) => {
      options.creates?.push(input);
      return input.id ?? "unexpected";
    },
    editTask: async (id, patch) => {
      options.edits?.push({ id, patch });
    },
  };
}

describe("migrateBacklogTasksToQuest", () => {
  test("preflights every task, preserves ids/content, and advances through legal statuses", async () => {
    const creates: CreateTaskInput[] = [];
    const edits: Array<{ id: string; patch: EditTaskPatch }> = [];
    const source = adapter({ tasks: [task()] });
    const destination = adapter({ creates, edits, existing: new Map() });

    expect(await migrateBacklogTasksToQuest(source, destination)).toEqual({ created: ["T-1"], reused: [] });
    expect(creates).toEqual([
      {
        id: "T-1",
        title: "Migrate safely",
        description: "Body",
        labels: ["docs", "lore:migration:priority:High", "lore:migration:ordinal:42"],
        doc: ["docs/story.md"],
      },
    ]);
    expect(edits).toEqual([{ id: "T-1", patch: { status: "In Progress" } }]);
  });

  test("reuses an equivalent existing Quest task without writing", async () => {
    const creates: CreateTaskInput[] = [];
    const sourceTask = task();
    const result = await migrateBacklogTasksToQuest(
      adapter({ tasks: [sourceTask] }),
      adapter({ creates, existing: new Map([[sourceTask.id, sourceTask]]) }),
    );
    expect(result).toEqual({ created: [], reused: ["T-1"] });
    expect(creates).toEqual([]);
  });

  test("rejects unsupported rich fields before the first Quest write", async () => {
    const creates: CreateTaskInput[] = [];
    const source = adapter({
      tasks: [task(), task({ id: "T-2", acceptanceCriteria: [{ text: "works", checked: false }] })],
    });
    const error = await migrateBacklogTasksToQuest(source, adapter({ creates, existing: new Map() })).catch(
      (cause) => cause,
    );
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).message).toContain("cannot be represented losslessly");
    expect((error as LoreError).input).toEqual({ id: "T-2", unsupported: ["acceptanceCriteria"] });
    expect(creates).toEqual([]);
  });

  test("rejects a conflicting existing id before creating any later task", async () => {
    const creates: CreateTaskInput[] = [];
    const first = task();
    const second = task({ id: "T-2", title: "Second" });
    const existing = task({ title: "Different" });
    const error = await migrateBacklogTasksToQuest(
      adapter({ tasks: [first, second] }),
      adapter({ creates, existing: new Map([[first.id, existing]]) }),
    ).catch((cause) => cause);
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).type).toBe("conflict");
    expect(creates).toEqual([]);
  });

  test("rejects mismatched ordering metadata instead of reusing an existing Quest id", async () => {
    const creates: CreateTaskInput[] = [];
    const sourceTask = task();
    const existing = task({ priority: null, ordinal: 7 });
    const error = await migrateBacklogTasksToQuest(
      adapter({ tasks: [sourceTask] }),
      adapter({ creates, existing: new Map([[sourceTask.id, existing]]) }),
    ).catch((cause) => cause);
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).input).toEqual({ id: "T-1", mismatched: ["priority", "ordinal"] });
    expect(creates).toEqual([]);
  });

  test("rejects Backlog ids that Quest cannot preserve before any Quest write", async () => {
    const creates: CreateTaskInput[] = [];
    const error = await migrateBacklogTasksToQuest(
      adapter({ tasks: [task({ id: "LCLI-315.4" })] }),
      adapter({ creates, existing: new Map() }),
    ).catch((cause) => cause);
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).input).toEqual({ id: "LCLI-315.4", unsupported: ["id:LCLI-315.4"] });
    expect(creates).toEqual([]);
  });
});
