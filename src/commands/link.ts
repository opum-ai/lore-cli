/**
 * commands/link.ts — `lore link <id> <taskId…> [--no-back-ref]` and its inverse `lore unlink`
 * (LORE-24, [ADR-0009] §1–§2).
 *
 * The thin, side-effecting layer that wires the two independent, single-purpose coupling
 * references ADR-0009 defines: the concept's own `tasks:` frontmatter list (doc → task, edited
 * here directly) and the queryable `doc:<conceptId>` Backlog label (task → doc, edited through
 * the LORE-21 {@link BacklogAdapter}) plus the free-text `--doc` display annotation.
 *
 * `link` validates every task id exists (`adapter.viewTask`) **before** writing anything, so a
 * bad id never leaves a partial edit. `unlink` does not: per cli-surface's exit table it has no
 * task-not-found case — a task already deleted from Backlog is tolerated, the doc-side reference
 * is still cleaned up, and the back-reference edit is simply skipped for that id.
 *
 * `--doc` is a SET/REPLACE accumulator (backlog-cli-contract §2.4): repassing it replaces the
 * task's whole `documentation:` array, so both commands read the task's current array first
 * (via the same `viewTask` call used for existence) and compute the full desired array —
 * `link` never clobbers an existing unrelated doc reference, and `unlink` never disturbs a
 * *different* doc's reference on a multiply-referenced task. When removal would leave the array
 * empty, `unlink` omits `--doc` entirely: Backlog's CLI cannot clear it via an empty value (§2.4),
 * so the stale annotation cosmetically lingers until the next `lore link` — an accepted ADR-0009
 * tradeoff, not a bug this command works around.
 *
 * [ADR-0009]: ../../docs/adr/0009-story-task-coupling-reconciliation.md
 */

import { join } from "node:path";
import {
  type BacklogAdapter,
  type BacklogTaskDetail,
  bunBacklogSpawn,
  createBacklogAdapter,
} from "../adapters/backlog";
import { conceptNotInBundle, loadBundle } from "../core/bundle";
import { type Concept, idFromPath, serializeConcept } from "../core/concept";
import { loadProfile } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { writeFileOverwriting } from "./fswrite";

/** Options shared by {@link runLink} and {@link runUnlink}; `root`, the streams, and `adapter` are injectable for tests. */
export interface LinkOptions {
  /** The repo root the `docs/` bundle resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `link`/`unlink`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for bundle-load advisories; defaults to `process.stderr`. */
  stderr?: Writer;
  /** The Backlog adapter; defaults to the real `backlog` binary on PATH. Injected in tests so they touch no subprocess. */
  adapter?: BacklogAdapter;
}

/** The parsed form of `link`/`unlink`'s arguments: identical shape for both commands. */
interface LinkArgs {
  /** The concept id (or path) being linked/unlinked. */
  id: string;
  /** One or more Backlog task ids. */
  taskIds: string[];
  /** `--no-back-ref`: skip the Backlog-side label/`--doc` edit entirely. */
  noBackRef: boolean;
}

/** One task's outcome in a {@link LinkReport}. */
export interface LinkedTask {
  /** The task id as given (case as typed; Backlog accepts either case on input). */
  readonly task: string;
  /** Whether the concept's `tasks:` frontmatter gained this id or already carried it. */
  readonly status: "added" | "already-linked";
  /** Whether the task's `doc:<conceptId>` label was written, already present, or the edit was skipped (`--no-back-ref`). */
  readonly backRef: "added" | "already-present" | "skipped";
}

/** The `link.result` payload. */
export interface LinkReport {
  /** The concept's repo-relative path. */
  readonly concept: string;
  /** Every task id passed, in argument order, deduplicated case-insensitively. */
  readonly tasks: readonly LinkedTask[];
  /** Whether the concept file was written (false when every id was already linked). */
  readonly changed: boolean;
}

/** One task's outcome in an {@link UnlinkReport}. */
export interface UnlinkedTask {
  /** The task id as given. */
  readonly task: string;
  /** Whether the concept's `tasks:` frontmatter lost this id or never carried it. */
  readonly status: "removed" | "not-linked";
  /** Whether the task's `doc:<conceptId>` label was removed, was already absent, or the edit was skipped (`--no-back-ref`, or the task no longer exists in Backlog). */
  readonly backRef: "removed" | "already-absent" | "skipped";
}

/** The `unlink.result` payload. */
export interface UnlinkReport {
  /** The concept's repo-relative path. */
  readonly concept: string;
  /** Every task id passed, in argument order, deduplicated case-insensitively. */
  readonly tasks: readonly UnlinkedTask[];
  /** Whether the concept file was written (false when every id was already unlinked). */
  readonly changed: boolean;
}

/**
 * Run `lore link`: add every `taskId` to the concept's `tasks:` frontmatter (case-insensitive
 * dedup, stored lowercase per ADR-0009 §1) and, unless `--no-back-ref`, record the back-reference
 * on each task — a `doc:<conceptId>` label plus the concept's repo-relative path via `--doc`
 * (preserving any other existing `documentation` entry). Every task id is validated to exist
 * (`not_found`, exit 3) before any write, so a bad id never leaves a partial edit.
 */
export async function runLink(options: LinkOptions): Promise<number> {
  const { concept, taskIds, noBackRef, docsRoot, advisories } = await prepare(options, "link");
  const adapter = options.adapter ?? defaultAdapter();
  const docPath = repoRelativePath(concept.path);
  const label = backRefLabel(concept.id);

  // Validate every task exists BEFORE any write — a missing id fails the whole command loud,
  // rather than leaving the doc half-linked.
  const details = new Map<string, BacklogTaskDetail>();
  for (const taskId of taskIds) {
    const detail = await adapter.viewTask(taskId);
    if (detail === null) {
      throw new LoreError("not_found", `task "${taskId}" does not exist`, "check the task id and try again", {
        taskId,
      });
    }
    details.set(taskId, detail);
  }

  const existingTasks = frontmatterList(concept.frontmatter.tasks);
  const tasks: LinkedTask[] = [];
  const nextTasks = [...existingTasks];
  for (const taskId of taskIds) {
    const normalized = taskId.toLowerCase();
    const alreadyLinked = existingTasks.some((t) => t.toLowerCase() === normalized);
    if (!alreadyLinked) {
      nextTasks.push(normalized);
    }
    const backRef = noBackRef
      ? "skipped"
      : hasLabel(details.get(taskId) as BacklogTaskDetail, label)
        ? "already-present"
        : "added";
    tasks.push({ task: taskId, status: alreadyLinked ? "already-linked" : "added", backRef });
  }

  const changed = writeTasksIfChanged(options.root, docsRoot, concept, existingTasks, nextTasks);

  if (!noBackRef) {
    for (const taskId of taskIds) {
      const detail = details.get(taskId) as BacklogTaskDetail;
      const desiredDocs = addDoc(detail.documentation, docPath);
      await adapter.editTask(taskId, { addLabels: [label], doc: desiredDocs });
    }
  }

  const report: LinkReport = { concept: docPath, tasks, changed };
  emit(reportRenderable("link.result", report, renderLinkReport), options.output, options.stdout);
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  return EXIT_OK;
}

/**
 * Run `lore unlink`: remove every `taskId` from the concept's `tasks:` frontmatter and, unless
 * `--no-back-ref`, remove the matching `doc:<conceptId>` label and shrink `--doc` on each task.
 * Unlike {@link runLink}, a task id no longer present in Backlog is tolerated (cli-surface's
 * unlink exit table has no task-not-found case) — the doc-side reference is still cleaned up and
 * the back-reference edit is skipped for that id.
 */
export async function runUnlink(options: LinkOptions): Promise<number> {
  const { concept, taskIds, noBackRef, docsRoot, advisories } = await prepare(options, "unlink");
  const adapter = options.adapter ?? defaultAdapter();
  const docPath = repoRelativePath(concept.path);
  const label = backRefLabel(concept.id);

  const existingTasks = frontmatterList(concept.frontmatter.tasks);
  const tasks: UnlinkedTask[] = [];
  const nextTasks = existingTasks.filter((t) => !taskIds.some((taskId) => taskId.toLowerCase() === t.toLowerCase()));

  for (const taskId of taskIds) {
    const normalized = taskId.toLowerCase();
    const wasLinked = existingTasks.some((t) => t.toLowerCase() === normalized);

    let backRef: UnlinkedTask["backRef"] = "skipped";
    if (!noBackRef) {
      const detail = await adapter.viewTask(taskId);
      if (detail !== null) {
        const hadLabel = hasLabel(detail, label);
        backRef = hadLabel ? "removed" : "already-absent";
        const desiredDocs = removeDoc(detail.documentation, docPath);
        await adapter.editTask(taskId, {
          removeLabels: [label],
          // Backlog cannot clear `--doc` via an empty value (contract §2.4); omit the flag
          // entirely rather than send a no-op empty accumulator that would be silently ignored.
          doc: desiredDocs.length > 0 ? desiredDocs : undefined,
        });
      }
    }
    tasks.push({ task: taskId, status: wasLinked ? "removed" : "not-linked", backRef });
  }

  const changed = writeTasksIfChanged(options.root, docsRoot, concept, existingTasks, nextTasks);

  const report: UnlinkReport = { concept: docPath, tasks, changed };
  emit(reportRenderable("unlink.result", report, renderUnlinkReport), options.output, options.stdout);
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  return EXIT_OK;
}

// ── Shared setup ───────────────────────────────────────────────────────────────

/** The default {@link BacklogAdapter}: the real `backlog` binary resolved from PATH. */
function defaultAdapter(): BacklogAdapter {
  return createBacklogAdapter(bunBacklogSpawn());
}

/** Everything {@link runLink}/{@link runUnlink} need after parsing and loading the bundle. */
interface Prepared {
  readonly concept: Concept;
  readonly taskIds: string[];
  readonly noBackRef: boolean;
  readonly docsRoot: string;
  readonly advisories: WarningCollector;
}

/**
 * Parse arguments, load the bundle, and resolve the concept — shared by both commands. Advisories
 * are flushed immediately after `loadBundle`, before the lookup that can throw `not_found`, so a
 * load warning is never lost on the failing path.
 */
async function prepare(options: LinkOptions, command: "link" | "unlink"): Promise<Prepared> {
  const parsed = parseLinkArgs(options.args, command);
  const id = idFromPath(parsed.id);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const concept = graph.concepts.get(id);
  if (concept === undefined) {
    throw conceptNotInBundle(id);
  }
  return { concept, taskIds: dedupeTaskIds(parsed.taskIds), noBackRef: parsed.noBackRef, docsRoot, advisories };
}

/** Deduplicate task ids case-insensitively, keeping the first-seen casing and argument order. */
function dedupeTaskIds(taskIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const taskId of taskIds) {
    const key = taskId.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(taskId);
    }
  }
  return out;
}

/** The concept's repo-relative path (`docs/stories/x.md`), the display value stored via `--doc`. */
function repoRelativePath(conceptPath: string): string {
  return `${DOCS_DIR}/${conceptPath}`;
}

/** The queryable back-reference label (ADR-0009 §2): the concept id, lowercased. */
function backRefLabel(conceptId: string): string {
  return `doc:${conceptId.toLowerCase()}`;
}

/** Whether a task's labels already carry `label`, matched case-insensitively (Backlog's own label de-dup). */
function hasLabel(detail: BacklogTaskDetail, label: string): boolean {
  return detail.labels.some((l) => l.toLowerCase() === label.toLowerCase());
}

/** Read a frontmatter list field as a string array, tolerating absent/null/scalar authored values. */
function frontmatterList(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return typeof value === "string" ? [value] : [];
}

/** The desired full `documentation` array after adding `docPath` (SET/REPLACE-safe: preserves every other entry). */
function addDoc(existing: readonly string[], docPath: string): string[] {
  return existing.includes(docPath) ? [...existing] : [...existing, docPath];
}

/** The desired full `documentation` array after removing `docPath` (SET/REPLACE-safe: preserves every other entry). */
function removeDoc(existing: readonly string[], docPath: string): string[] {
  return existing.filter((d) => d !== docPath);
}

/**
 * Write the concept's `tasks:` frontmatter when it changed, returning whether a write happened.
 * Serializes under the active profile so an already-canonical concept's other frontmatter and body
 * round-trip byte-for-byte and the `tasks:` edit is the only diff (ADR-0011).
 */
function writeTasksIfChanged(
  root: string,
  docsRoot: string,
  concept: Concept,
  existingTasks: readonly string[],
  nextTasks: readonly string[],
): boolean {
  if (sameList(existingTasks, nextTasks)) {
    return false;
  }
  const profile = loadProfile({ root });
  const updated: Concept = { ...concept, frontmatter: { ...concept.frontmatter, tasks: [...nextTasks] } };
  writeFileOverwriting(
    join(docsRoot, concept.path),
    serializeConcept(updated, { profile }),
    `${DOCS_DIR}/${concept.path}`,
  );
  return true;
}

/** Whether two string lists carry the same elements in the same order. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `link`/`unlink`'s tokens into `<id> <taskId…>` and `--no-back-ref`. The router has
 * already stripped lore's global flags, so a `--`-prefixed token here is a command flag: an
 * unrecognized one is a `usage` error. A `--` ends option parsing so an id may begin with `-`.
 * Mirrors `commands/supersede.ts`'s parser.
 */
function parseLinkArgs(args: readonly string[], command: "link" | "unlink"): LinkArgs {
  const positionals: string[] = [];
  let noBackRef = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const name = arg.slice(2);
      if (name === "no-back-ref") {
        noBackRef = true;
      } else {
        throw usage(`unknown option "--${name}"`, `run \`lore ${command} --help\` to list options`);
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, `run \`lore ${command} --help\` to list options`);
    } else {
      positionals.push(arg);
    }
  }

  const id = positionals[0];
  if (id === undefined) {
    throw usage(`\`lore ${command}\` needs a concept id`, `run \`lore ${command} <id> <taskId…>\``);
  }
  const taskIds = positionals.slice(1);
  if (taskIds.length === 0) {
    throw usage(
      `\`lore ${command}\` needs at least one task id`,
      `pass one or more task ids, e.g. \`lore ${command} ${id} task-42\``,
    );
  }
  return { id, taskIds, noBackRef };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** Build a `Renderable` for a link/unlink report — pretty and plain share a layout (no color; no severities). */
function reportRenderable<T>(kind: string, data: T, render: (data: T) => string): Renderable<T> {
  return { kind, data, pretty: render, plain: render };
}

/** One line per task's doc-side + back-ref outcome, then a summary line. */
function renderLinkReport(data: LinkReport): string {
  const lines = data.tasks.map((t) => `${t.task}: ${t.status} (doc), back-ref ${t.backRef}`);
  lines.push(`${data.concept}: ${data.changed ? "updated" : "unchanged"}`);
  return lines.join("\n");
}

/** One line per task's doc-side + back-ref outcome, then a summary line. */
function renderUnlinkReport(data: UnlinkReport): string {
  const lines = data.tasks.map((t) => `${t.task}: ${t.status} (doc), back-ref ${t.backRef}`);
  lines.push(`${data.concept}: ${data.changed ? "updated" : "unchanged"}`);
  return lines.join("\n");
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
