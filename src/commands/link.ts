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
 * task's whole `documentation:` array, so both commands read the task's current array — freshly,
 * right before the edit, never reusing an earlier snapshot (see below) — and compute the full
 * desired array: `link` never clobbers an existing unrelated doc reference, and `unlink` never
 * disturbs a *different* doc's reference on a multiply-referenced task. When removal would leave
 * the array empty, `unlink` omits `--doc` entirely: Backlog's CLI cannot clear it via an empty
 * value (§2.4), so the stale annotation cosmetically lingers until the next `lore link` — an
 * accepted ADR-0009 tradeoff, not a bug this command works around.
 *
 * **Per-task back-reference edits are independent, freshly-read, and run sequentially.** The
 * doc-side `tasks:` write never depends on any Backlog edit succeeding (existence is already
 * validated up front for `link`; `unlink`'s doc-side removal needs no Backlog round-trip at all),
 * so a single edit failure is caught and reported on that task's row (`backRef: "failed"`) rather
 * than aborting the rest or leaving an opaque, uncaught exception — the command still exits
 * non-zero (`drift`, exit 6) when any edit failed, so the failure is never silently swallowed, but
 * a transient Backlog error on one task id never blocks or corrupts the others. This is the
 * ADR-0009 "two references can disagree" tradeoff made visible and reported rather than an
 * all-or-nothing transaction lore cannot actually provide across two independent systems (a local
 * file write and N Backlog subprocess calls). Each edit re-reads its task **fresh** right before
 * writing (never the up-front existence-check's snapshot), closing a race where the task changed
 * out-of-band in between — and every edit runs **one at a time**, never concurrently: ADR-0012 §5
 * is a locked decision that `lore` does not run concurrent mutating Backlog commands within one
 * invocation, so a multi-task `link`/`unlink` serializes its `editTask` calls (see
 * {@link runSequentially}) even though each one's *outcome* is still independent of the others'.
 *
 * [ADR-0009]: ../../docs/adr/0009-story-task-coupling-reconciliation.md
 */

import { join, posix } from "node:path";
import {
  type BacklogAdapter,
  type BacklogTaskDetail,
  bunBacklogSpawn,
  createBacklogAdapter,
} from "../adapters/backlog";
import { type BundleGraph, conceptNotInBundle, loadBundle, toRefList } from "../core/bundle";
import { type Concept, idFromPath, serializeConcept } from "../core/concept";
import { loadProfile } from "../core/profile";
import { DOCS_DIR, RESERVED_STEMS } from "../core/scaffold";
import { EXIT_CODES, EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";
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
  /** Whether the task's `doc:<conceptId>` label was written, already present, the edit was skipped (`--no-back-ref`), or the edit failed. */
  readonly backRef: "added" | "already-present" | "skipped" | "failed";
  /** A one-line reason, present only when `backRef` is `"failed"`. */
  readonly error?: string;
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
  /** Whether the task's `doc:<conceptId>` label was removed, was already absent, the edit was skipped (`--no-back-ref`, or the task no longer exists in Backlog), or the edit failed. */
  readonly backRef: "removed" | "already-absent" | "skipped" | "failed";
  /** A one-line reason, present only when `backRef` is `"failed"`. */
  readonly error?: string;
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
 * (`not_found`, exit 3) before any write, so a bad id never leaves a partial edit; the doc write
 * never depends on that validation succeeding for anything BUT existence, so an individual
 * back-reference edit failing afterward cannot corrupt or block it — see the module doc.
 *
 * @returns `0` when every back-reference edit (if any ran) succeeded; `6` (`drift`) when at
 *   least one failed — the report still names every task's actual outcome either way.
 */
export async function runLink(options: LinkOptions): Promise<number> {
  const { concept, taskIds, noBackRef, docsRoot } = await prepare(options, "link");
  const adapter = options.adapter ?? defaultAdapter(options.root);
  const docPath = repoRelativePath(concept.path);
  const label = backRefLabel(concept.id);

  // Validate every task exists BEFORE any write — a missing id fails the whole command loud,
  // rather than leaving the doc half-linked. Reads are independent so they run concurrently
  // (`allSettled`, not `all`: a rejection must not race ahead of an earlier id's not-found), but the
  // FIRST invalid id in argument order — not-found or a genuine read failure — is what gets
  // reported, decided by an in-order scan after every read has settled.
  const detailResults = await Promise.allSettled(taskIds.map((taskId) => adapter.viewTask(taskId)));
  for (let i = 0; i < taskIds.length; i++) {
    const taskId = taskIds[i] as string;
    const result = detailResults[i] as PromiseSettledResult<BacklogTaskDetail | null>;
    if (result.status === "rejected") {
      throw result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    }
    if (result.value === null) {
      throw new LoreError("not_found", `task "${taskId}" does not exist`, "check the task id and try again", {
        taskId,
      });
    }
  }

  const existingTasks = toRefList(concept.frontmatter.tasks);
  const tasks: LinkedTask[] = taskIds.map((taskId) => {
    const alreadyLinked = existingTasks.some((t) => t.toLowerCase() === taskId.toLowerCase());
    return { task: taskId, status: alreadyLinked ? "already-linked" : "added", backRef: "skipped" };
  });
  const nextTasks = [...existingTasks, ...tasks.filter((t) => t.status === "added").map((t) => t.task.toLowerCase())];

  const changed = writeTasksIfChanged(options.root, docsRoot, concept, existingTasks, nextTasks);

  let anyBackRefFailed = false;
  if (!noBackRef) {
    const outcomes = await runSequentially(taskIds, async (taskId) => {
      // Re-read fresh right before editing (not the up-front validation snapshot): matches
      // runUnlink's freshness and closes a narrow race where the task changed out-of-band
      // between the existence check above and this edit.
      const detail = await adapter.viewTask(taskId);
      if (detail === null) {
        throw new Error(`task "${taskId}" no longer exists in Backlog`);
      }
      const wasPresent = hasLabel(detail, label);
      const docChanged = !detail.documentation.includes(docPath);
      if (wasPresent && !docChanged) {
        return "already-present" as const; // both the label and --doc already reflect this link
      }
      const desiredDocs = addDoc(detail.documentation, docPath);
      await adapter.editTask(taskId, { addLabels: [label], doc: desiredDocs });
      return "added" as const;
    });
    outcomes.forEach((outcome, i) => {
      const entry = tasks[i] as LinkedTask;
      if (outcome.status === "fulfilled") {
        tasks[i] = { ...entry, backRef: outcome.value };
      } else {
        anyBackRefFailed = true;
        tasks[i] = { ...entry, backRef: "failed", error: describeError(outcome.reason) };
      }
    });
  }

  const report: LinkReport = { concept: docPath, tasks, changed };
  emit(reportRenderable("link.result", report, renderTaskReport), options.output, options.stdout);
  return anyBackRefFailed ? EXIT_CODES.drift : EXIT_OK;
}

/**
 * Run `lore unlink`: remove every `taskId` from the concept's `tasks:` frontmatter and, unless
 * `--no-back-ref`, remove the matching `doc:<conceptId>` label and shrink `--doc` on each task.
 * Unlike {@link runLink}, a task id no longer present in Backlog is tolerated (cli-surface's
 * unlink exit table has no task-not-found case) — the doc-side reference is still cleaned up and
 * the back-reference edit is skipped for that id. The doc-side write needs no Backlog round-trip
 * at all, so it never depends on any back-reference edit's outcome.
 *
 * @returns `0` when every back-reference edit (if any ran) succeeded; `6` (`drift`) when at
 *   least one failed — the report still names every task's actual outcome either way.
 */
export async function runUnlink(options: LinkOptions): Promise<number> {
  const { concept, taskIds, noBackRef, docsRoot } = await prepare(options, "unlink");
  const adapter = options.adapter ?? defaultAdapter(options.root);
  const docPath = repoRelativePath(concept.path);
  const label = backRefLabel(concept.id);

  const existingTasks = toRefList(concept.frontmatter.tasks);
  const tasks: UnlinkedTask[] = taskIds.map((taskId) => {
    const wasLinked = existingTasks.some((t) => t.toLowerCase() === taskId.toLowerCase());
    return { task: taskId, status: wasLinked ? "removed" : "not-linked", backRef: "skipped" };
  });
  const removedLower = new Set(tasks.filter((t) => t.status === "removed").map((t) => t.task.toLowerCase()));
  const nextTasks = existingTasks.filter((t) => !removedLower.has(t.toLowerCase()));

  // Write the doc-side removal FIRST — mirrors runLink's order. The doc write needs no Backlog
  // round-trip and never depends on any back-reference edit's outcome, so committing it before the
  // per-task Backlog edits means a failure on the Backlog side can never strand it (the reverse
  // order would leave already-applied Backlog mutations unreported if this write then failed).
  const changed = writeTasksIfChanged(options.root, docsRoot, concept, existingTasks, nextTasks);

  let anyBackRefFailed = false;
  if (!noBackRef) {
    const outcomes = await runSequentially(taskIds, async (taskId) => {
      const detail = await adapter.viewTask(taskId);
      if (detail === null) {
        return "skipped" as const; // the task no longer exists in Backlog — nothing to clean up
      }
      const hadLabel = hasLabel(detail, label);
      const hadDoc = detail.documentation.includes(docPath);
      if (!hadLabel && !hadDoc) {
        return "already-absent" as const; // nothing to remove — skip the edit entirely
      }
      const desiredDocs = removeDoc(detail.documentation, docPath);
      await adapter.editTask(taskId, {
        removeLabels: [label],
        // Backlog cannot clear `--doc` via an empty value (contract §2.4); omit the flag
        // entirely rather than send a no-op empty accumulator that would be silently ignored.
        doc: desiredDocs.length > 0 ? desiredDocs : undefined,
      });
      return "removed" as const;
    });
    outcomes.forEach((outcome, i) => {
      const entry = tasks[i] as UnlinkedTask;
      if (outcome.status === "fulfilled") {
        tasks[i] = { ...entry, backRef: outcome.value };
      } else {
        anyBackRefFailed = true;
        tasks[i] = { ...entry, backRef: "failed", error: describeError(outcome.reason) };
      }
    });
  }

  const report: UnlinkReport = { concept: docPath, tasks, changed };
  emit(reportRenderable("unlink.result", report, renderTaskReport), options.output, options.stdout);
  return anyBackRefFailed ? EXIT_CODES.drift : EXIT_OK;
}

// ── Shared setup ───────────────────────────────────────────────────────────────

/** The default {@link BacklogAdapter}: the real `backlog` binary resolved from PATH, spawned in `root` so a non-default root routes writes to the right project. */
function defaultAdapter(root: string): BacklogAdapter {
  return createBacklogAdapter(bunBacklogSpawn(undefined, root));
}

/** Everything {@link runLink}/{@link runUnlink} need after parsing and loading the bundle. */
interface Prepared {
  readonly concept: Concept;
  readonly taskIds: string[];
  readonly noBackRef: boolean;
  readonly docsRoot: string;
}

/**
 * Parse arguments, load the bundle, and resolve the concept — shared by both commands. Advisories
 * are flushed immediately after `loadBundle`, before the lookup that can throw `not_found`, so a
 * load warning is never lost on the failing path.
 */
async function prepare(options: LinkOptions, command: "link" | "unlink"): Promise<Prepared> {
  const parsed = parseLinkArgs(options.args, command);
  const id = idFromPath(parsed.id);
  assertNotReserved(id, command);
  assertNoCommaInId(id, command);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const concept = graph.concepts.get(id);
  if (concept === undefined) {
    throw conceptNotInBundle(id);
  }
  assertNoLabelCaseCollision(graph, concept);
  return { concept, taskIds: dedupeTaskIds(parsed.taskIds), noBackRef: parsed.noBackRef, docsRoot };
}

/** Reject a reserved hub name (`index`/`log`) as a link/unlink principal — a `usage` error. Mirrors `rename.ts`/`supersede.ts`'s guard. */
function assertNotReserved(id: string, command: "link" | "unlink"): void {
  if (RESERVED_STEMS.has(posix.basename(id))) {
    throw usage(
      `cannot ${command} "${id}": "${posix.basename(id)}" is a reserved, machine-generated file name`,
      "index.md/log.md are generated by lore, not authored concepts",
    );
  }
}

/**
 * Reject a concept id containing a comma as a link/unlink principal — a `usage` error, checked
 * unconditionally and before any write (like {@link assertNotReserved}), not only when a `doc:`
 * label would actually be sent. Backlog's `--add-label`/`--remove-label` have no escape for an
 * embedded comma (backlog-cli-contract §2.4; `commaJoin` in `adapters/backlog.ts` now rejects one
 * outright rather than silently splitting it into two labels) — so a comma-bearing id could never
 * get a working `doc:` back-reference either way. Failing loud here, once, up front gives one clear
 * reason instead of every per-task `editTask` call failing forever and reporting `drift` on every
 * future invocation for that concept.
 */
function assertNoCommaInId(id: string, command: "link" | "unlink"): void {
  if (id.includes(",")) {
    throw usage(
      `cannot ${command} "${id}": a concept id containing a comma cannot be encoded as a Backlog doc: label`,
      "Backlog's --add-label/--remove-label have no escape for an embedded comma — rename the concept so its id contains no comma",
    );
  }
}

/**
 * Reject linking/unlinking a concept whose id collides case-insensitively with another concept's
 * id (`conflict`, exit 5). Concept ids are case-sensitive in the graph (`buildGraph`'s lookup is a
 * plain `Map`), so two such concepts are legitimately distinct nodes — but Backlog's own
 * `--add-label`/`--remove-label` de-dup case-insensitively in its label store (backlog-cli-contract
 * §2.4), so no encoding lore sends can give them independently addressable `doc:` back-references.
 * Rather than silently let one concept's unlink strip the other's real back-reference, refuse the
 * operation outright.
 */
export function assertNoLabelCaseCollision(graph: BundleGraph, concept: Concept): void {
  for (const other of graph.concepts.values()) {
    if (other.id !== concept.id && other.id.toLowerCase() === concept.id.toLowerCase()) {
      throw new LoreError(
        "conflict",
        `cannot link/unlink "${concept.id}": concept "${other.id}" has an id differing only by case`,
        "Backlog's own doc: label store de-dups case-insensitively, so these two concepts cannot have independent back-references — rename one so their ids are case-distinct",
        { id: concept.id, collidesWith: other.id },
      );
    }
  }
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

/**
 * The queryable back-reference label (ADR-0009 §2): `doc:<conceptId>`, case-preserved. Concept ids
 * are case-sensitive throughout the graph (`buildGraph`'s lookup is a plain, case-sensitive `Map`),
 * so two concepts differing only by case are distinct nodes; lowercasing here would collapse them
 * onto the same label and let unlinking one strip the other's real back-reference.
 */
function backRefLabel(conceptId: string): string {
  return `doc:${conceptId}`;
}

/** Whether a task's labels already carry `label`, matched case-insensitively (Backlog's own label de-dup). */
function hasLabel(detail: BacklogTaskDetail, label: string): boolean {
  return detail.labels.some((l) => l.toLowerCase() === label.toLowerCase());
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
    repoRelativePath(concept.path),
  );
  return true;
}

/** Whether two string lists carry the same elements in the same order. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `link`/`unlink`'s tokens into `<id> <taskId…>` and `--no-back-ref`, via the shared
 * {@link parseCommandArgs} tokenizer (mirrors `commands/rename.ts`/`commands/supersede.ts`'s
 * parsers). Positional arity is validated here since it differs per command (a variadic task-id
 * tail, not a fixed count).
 */
function parseLinkArgs(args: readonly string[], command: "link" | "unlink"): LinkArgs {
  const { positionals, flags } = parseCommandArgs(args, command, ["no-back-ref"]);

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
  return { id, taskIds, noBackRef: flags.has("no-back-ref") };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** Build a `Renderable` for a link/unlink report — pretty and plain share a layout (no color; no severities). */
function reportRenderable<T>(kind: string, data: T, render: (data: T) => string): Renderable<T> {
  return { kind, data, pretty: render, plain: render };
}

/** The shape {@link renderTaskReport} needs — both {@link LinkReport} and {@link UnlinkReport} satisfy it structurally. */
interface TaskReportLike {
  readonly concept: string;
  readonly changed: boolean;
  readonly tasks: readonly {
    readonly task: string;
    readonly status: string;
    readonly backRef: string;
    readonly error?: string;
  }[];
}

/** One line per task's doc-side + back-ref outcome (with its error, if any), then a summary line. Shared by `link` and `unlink` — the two reports render identically. */
function renderTaskReport(data: TaskReportLike): string {
  const lines = data.tasks.map((t) => {
    const suffix = t.error !== undefined ? ` (${t.error})` : "";
    return `${t.task}: ${t.status} (doc), back-ref ${t.backRef}${suffix}`;
  });
  lines.push(`${data.concept}: ${data.changed ? "updated" : "unchanged"}`);
  return lines.join("\n");
}

/**
 * Run `fn` over `items` one at a time — never concurrently — collecting each result as a
 * {@link PromiseSettledResult}, exactly like `Promise.allSettled` would, but serialized: ADR-0012
 * §5 is a locked decision that `lore` does not run concurrent mutating Backlog commands within one
 * invocation. A failure on one item is still caught and does not stop the rest from running (the
 * per-task independence the round-1 fix established); only the *concurrency* is removed.
 */
async function runSequentially<T>(
  items: readonly string[],
  fn: (item: string) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (const item of items) {
    try {
      results.push({ status: "fulfilled", value: await fn(item) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  return results;
}

/** A one-line message for a rejected `editTask` call, for the report's `error` field. */
function describeError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
