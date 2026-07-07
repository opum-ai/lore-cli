import type { BacklogAdapter, BacklogTaskDetail, EditTaskPatch } from "../src/adapters/backlog";
import { type Concept, idFromPath } from "../src/core/concept";
import type { Writer } from "../src/errors";
import { LoreError } from "../src/errors";

/**
 * Build a minimal valid {@link Concept} at a bundle-relative path, defaulting `frontmatter.type` to
 * "Reference" — shared by `indexes.test.ts` and `reconcile-shared.test.ts`, which both only need a
 * `Concept` shape (id/path/frontmatter/body), never a specific `type`'s own semantics.
 */
export function concept(path: string, frontmatter: Record<string, unknown> = {}): Concept {
  const fm = { type: "Reference", ...frontmatter };
  return { id: idFromPath(path), path, type: String(fm.type), frontmatter: fm, body: "" };
}

/**
 * Run `git <args>` in `cwd` via a real subprocess, throwing if it exits non-zero. The shared
 * real-git test setup helper — `git-adapter.test.ts`, `state.test.ts`, and `sync.test.ts` each
 * defined a byte-for-byte copy of this before it was hoisted here.
 */
export function gitRun(cwd: string, args: string[]): void {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString("utf8")}`);
  }
}

/**
 * A capturing {@link Writer} for tests: it records every `write` so a test can
 * assert the exact bytes a stream received without touching the real process
 * streams. Shared by the errors and output suites (and future command suites) so
 * there is one fake to evolve, not a copy per file.
 *
 * - `text()` — the joined output verbatim; use it whenever blank-line position or
 *   exact whitespace matters.
 * - `lines()` — split on `\n` with blanks dropped; a convenience for "which
 *   non-empty lines were written", not a substitute for an exact `text()` check.
 */
export function capture(): Writer & { text(): string; lines(): string[] } {
  const chunks: string[] = [];
  return {
    write(s: string): void {
      chunks.push(s);
    },
    text(): string {
      return chunks.join("");
    },
    lines(): string[] {
      return chunks.join("").split("\n").filter(Boolean);
    },
  };
}

/** A recorded `editTask` call, for assertions. */
export interface EditCall {
  readonly id: string;
  readonly patch: EditTaskPatch;
}

/** Build a minimal {@link BacklogTaskDetail}, overriding only the fields a test cares about. */
export function makeTask(id: string, overrides: Partial<BacklogTaskDetail> = {}): BacklogTaskDetail {
  return {
    id,
    title: `Title for ${id}`,
    status: "To Do",
    priority: null,
    ordinal: null,
    assignees: [],
    labels: [],
    milestone: null,
    parentTaskId: null,
    file: `backlog/tasks/${id.toLowerCase()} - title.md`,
    reporter: null,
    createdDate: "2026-01-01T00:00:00Z",
    updatedDate: null,
    dependencies: [],
    references: [],
    documentation: [],
    modifiedFiles: [],
    parentTaskTitle: null,
    subtasks: [],
    acceptanceCriteria: [],
    definitionOfDone: [],
    description: null,
    implementationPlan: null,
    implementationNotes: null,
    finalSummary: null,
    comments: [],
    source: null,
    branch: null,
    ...overrides,
  };
}

/**
 * A minimal Story with `tasks:` and an already-present (empty) managed task block — shared by
 * `sync.test.ts` and `check.test.ts`, which both reconcile against the exact same doc shape.
 */
export function storyDoc(title: string, taskIds: readonly string[], status?: string): string {
  const tasksYaml = taskIds.map((t) => `\n  - ${t}`).join("");
  const statusLine = status !== undefined ? `status: ${status}\n` : "";
  return (
    `---\ntype: Story\ntitle: ${title}\n${statusLine}tasks:${tasksYaml}\n---\n` +
    `# ${title}\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n`
  );
}

/**
 * An in-memory {@link BacklogAdapter} fake: `viewTask` reads a seeded map (case-insensitive),
 * `editTask` mutates it and records the call. Every other method throws — shared by `link.test.ts`
 * (`runLink`/`runUnlink`) and `rename.test.ts` (`moveBackRefs`), neither of which calls them, so
 * there is one fake to evolve, not a copy per file.
 */
export function fakeAdapter(
  seed: readonly BacklogTaskDetail[],
  opts: { poisonEdits?: readonly string[]; poisonViews?: readonly string[] } = {},
): BacklogAdapter & { calls: EditCall[] } {
  const tasks = new Map<string, BacklogTaskDetail>();
  for (const t of seed) {
    tasks.set(t.id.toLowerCase(), t);
  }
  const poison = new Set((opts.poisonEdits ?? []).map((id) => id.toLowerCase()));
  const poisonViews = new Set((opts.poisonViews ?? []).map((id) => id.toLowerCase()));
  const calls: EditCall[] = [];
  const notImplemented = (name: string) => (): never => {
    throw new Error(`fakeAdapter: ${name} is not implemented`);
  };
  return {
    probe: notImplemented("probe"),
    listTasks: notImplemented("listTasks"),
    searchByLabel: notImplemented("searchByLabel"),
    searchTasks: notImplemented("searchTasks"),
    createTask: notImplemented("createTask"),
    calls,
    async viewTask(id: string): Promise<BacklogTaskDetail | null> {
      if (poisonViews.has(id.toLowerCase())) {
        throw new Error(`simulated Backlog read failure viewing ${id}`);
      }
      return tasks.get(id.toLowerCase()) ?? null;
    },
    async editTask(id: string, patch: EditTaskPatch): Promise<void> {
      calls.push({ id, patch });
      if (poison.has(id.toLowerCase())) {
        throw new Error(`simulated Backlog failure editing ${id}`);
      }
      const existing = tasks.get(id.toLowerCase());
      if (existing === undefined) {
        throw new LoreError("not_found", `task "${id}" not found`, "");
      }
      const labels = new Set(existing.labels.map((l) => l.toLowerCase()));
      const byLower = new Map(existing.labels.map((l) => [l.toLowerCase(), l]));
      for (const add of patch.addLabels ?? []) {
        if (!labels.has(add.toLowerCase())) {
          labels.add(add.toLowerCase());
          byLower.set(add.toLowerCase(), add);
        }
      }
      for (const remove of patch.removeLabels ?? []) {
        labels.delete(remove.toLowerCase());
        byLower.delete(remove.toLowerCase());
      }
      const nextLabels = [...labels].map((l) => byLower.get(l) as string);
      // Mirrors the real adapter's `--doc` accumulator (backlog.ts's `for (const doc of patch.doc ?? [])`):
      // it emits one repeated flag per entry, so an EMPTY array sends zero flags and is a no-op, exactly
      // like `undefined` — never a "clear". Both must leave `documentation` untouched.
      const nextDocs = patch.doc !== undefined && patch.doc.length > 0 ? [...patch.doc] : existing.documentation;
      tasks.set(id.toLowerCase(), { ...existing, labels: nextLabels, documentation: nextDocs });
    },
  };
}
