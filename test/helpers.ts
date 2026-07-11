import type {
  BacklogAdapter,
  BacklogCapability,
  BacklogTask,
  BacklogTaskDetail,
  EditTaskPatch,
  ListTasksOptions,
} from "../src/adapters/backlog";
import { type Concept, idFromPath } from "../src/core/concept";
import type { Writer } from "../src/errors";
import { LoreError } from "../src/errors";
import type { GitSpawn, GitSpawnResult } from "../src/state";

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

/** A successful {@link GitSpawnResult} (exit 0) carrying `stdout`; the building block of the scripted git fakes below. */
export function gitOk(stdout: string): GitSpawnResult {
  return { exitCode: 0, stdout, stderr: "" };
}

/**
 * A scripted {@link GitSpawn} reporting a **clean** `backlog/` — every call resolves exit-0 with
 * empty stdout, so `commitBacklogIfDirty` finds nothing dirty and never runs `add`/`commit`. Records
 * every call's args on `.calls` for assertions. Shared by `sync`/`link`/`rename` tests, all of which
 * inject a fake git seam rather than shelling a real subprocess.
 */
export function cleanGitSpawn(): GitSpawn & { calls: string[][] } {
  const calls: string[][] = [];
  const spawn = (async (args: readonly string[]): Promise<GitSpawnResult> => {
    calls.push([...args]);
    return gitOk("");
  }) as GitSpawn & { calls: string[][] };
  spawn.calls = calls;
  return spawn;
}

/**
 * A scripted {@link GitSpawn} reporting **one dirty** `backlog/` file, then succeeding `add`/`commit`.
 * Mirrors `commitBacklogIfDirty`'s call sequence: call 1 is `git rev-parse --show-prefix` (answered
 * `""` — not a nested bundle), call 2 is `git status` (answered with the given `-z`/NUL-terminated
 * porcelain entry), calls 3+ (`add`, `commit`) succeed. Records every call's args on `.calls`.
 */
export function dirtyGitSpawn(porcelainEntry: string): GitSpawn & { calls: string[][] } {
  const calls: string[][] = [];
  let call = 0;
  const spawn = (async (args: readonly string[]): Promise<GitSpawnResult> => {
    calls.push([...args]);
    call++;
    return call === 2 ? gitOk(`${porcelainEntry}\0`) : gitOk("");
  }) as GitSpawn & { calls: string[][] };
  spawn.calls = calls;
  return spawn;
}

/**
 * Like {@link dirtyGitSpawn} but the `commit` call FAILS (exit 1, a rejected pre-commit hook) —
 * every earlier call (`rev-parse`, `status`, `add`) still succeeds. Exercises
 * `commitBacklogFiles`'s capture of a `drift` git failure into the report: `link`/`unlink`/`rename`
 * still emit their per-task report and exit `drift`, rather than throwing before the report is built.
 */
export function failingCommitGitSpawn(porcelainEntry: string): GitSpawn & { calls: string[][] } {
  const calls: string[][] = [];
  let call = 0;
  const spawn = (async (args: readonly string[]): Promise<GitSpawnResult> => {
    calls.push([...args]);
    call++;
    if (call === 2) return gitOk(`${porcelainEntry}\0`);
    if (args[0] === "commit") return { exitCode: 1, stdout: "", stderr: "hook rejected" };
    return gitOk("");
  }) as GitSpawn & { calls: string[][] };
  spawn.calls = calls;
  return spawn;
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

/** Project a full {@link BacklogTaskDetail} down to the {@link BacklogTask} summary subset `listTasks` returns. */
function toSummary(task: BacklogTaskDetail): BacklogTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    ordinal: task.ordinal,
    assignees: task.assignees,
    labels: task.labels,
    milestone: task.milestone,
    parentTaskId: task.parentTaskId,
    file: task.file,
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
 * `listTasks` returns the seed as summaries (honoring the `status`/`labels` filters like the real
 * adapter), `editTask` mutates it and records the call. `probe` is **not implemented by default** — it
 * throws on any call, so `link.test.ts`/`rename.test.ts` keep their implicit guard that those commands
 * never probe Backlog; only a caller that opts in (`opts.probe`) makes it resolve or fail. Shared by
 * `link.test.ts`, `rename.test.ts`, `tasks.test.ts`, and `orphans.test.ts`, so there is one fake to
 * evolve, not a copy.
 *
 * @param opts.probe `"ok"` makes `probe` resolve to a `--json`-capable verdict (`lore tasks`/`orphans`
 *   probe up front); an `Error` makes it reject (to exercise the capability-failure path). Omitted →
 *   `probe` throws "not implemented" like the other unused methods.
 * @param opts.listTasks `"ok"` makes `listTasks` return the seeded summaries (honoring the
 *   `status`/`labels` filters, like the real adapter); an `Error` makes it reject (the snapshot-read
 *   drift path `lore orphans` propagates). Omitted → `listTasks` throws "not implemented", preserving
 *   the loud guard that a command NOT expected to take a full Backlog snapshot (link/rename/tasks)
 *   fails visibly if it ever starts.
 */
export function fakeAdapter(
  seed: readonly BacklogTaskDetail[],
  opts: {
    poisonEdits?: readonly string[];
    poisonViews?: readonly string[];
    probe?: "ok" | Error;
    listTasks?: "ok" | Error;
  } = {},
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
  const probeOpt = opts.probe;
  return {
    probe:
      probeOpt === undefined
        ? notImplemented("probe")
        : async (): Promise<BacklogCapability> => {
            if (probeOpt instanceof Error) {
              throw probeOpt;
            }
            return { version: "1.47.1", schemaVersion: "1" };
          },
    listTasks:
      opts.listTasks === undefined
        ? notImplemented("listTasks")
        : async (listOpts?: ListTasksOptions): Promise<BacklogTask[]> => {
            const mode = opts.listTasks;
            if (mode instanceof Error) {
              throw mode;
            }
            let out = [...tasks.values()].map(toSummary);
            if (listOpts?.status !== undefined) {
              const want = listOpts.status.toLowerCase();
              out = out.filter((task) => task.status.toLowerCase() === want);
            }
            if (listOpts?.labels !== undefined && listOpts.labels.length > 0) {
              const wanted = listOpts.labels.map((label) => label.toLowerCase());
              out = out.filter((task) => {
                const have = new Set(task.labels.map((label) => label.toLowerCase()));
                return wanted.every((label) => have.has(label));
              });
            }
            return out;
          },
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
