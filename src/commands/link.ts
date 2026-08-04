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
 * `unlink --allow-missing` tolerates `id` itself not resolving to a live concept — the recovery
 * path for a concept relocated **outside** `lore rename` (`git mv`, an IDE refactor, a hand edit):
 * `lore link <newId> <taskId>` only ever adds its own label, with no notion of a previous id to
 * remove, so the old `doc:<id>` label and stale `--doc` entry would otherwise be permanently
 * un-cleanable (see ADR-0009 §2). In this mode there is no concept file to write `tasks:` on, so
 * only the Backlog-side label/`--doc` removal runs, computed directly from the given `id` string;
 * the case-collision guard still applies (a *live* concept whose id collides with `id` is still
 * protected, since Backlog's label store can't tell the two apart either).
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
 * so a single edit failure is caught and its per-task outcome recorded (`backRef: "failed"`)
 * rather than aborting the rest or leaving an opaque, uncaught exception. When any edit (or the
 * `backlog/` commit) failed, the command throws a `drift` (exit 6) `LoreError` instead of emitting
 * a success-shaped envelope (LORE-58) — cli-contract §4's "stdout parses or stays silent" invariant
 * applies to every command uniformly, including a *partial* failure here, so stdout stays empty and
 * the per-task detail moves into the `ErrorEnvelope`'s `input` field on stderr; the failure is never
 * silently swallowed, and a transient Backlog error on one task id never blocks or corrupts the
 * others. This is the
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

import { join } from "node:path";
import {
  type BacklogAdapter,
  type BacklogTaskDetail,
  bunBacklogSpawn,
  createBacklogAdapter,
} from "../adapters/backlog";
import { type BundleGraph, conceptNotInBundle, loadBundle, toRefList } from "../core/bundle";
import { type Concept, idFromPath, serializeConcept } from "../core/concept";
import { loadProfile, type Profile } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { type BacklogCommitResult, commitBacklogFiles, type GitSpawn, renderBacklogCommitLine } from "../state";
import { assertNotReservedStem, parseCommandArgs, usage } from "./args";
// The pure worker-pool + shared cap live in the neutral `./concurrency` module (LORE-233), not
// `./reconcile-shared` — `reconcile-shared.ts` already imports `verifiedViewTask`/`dedupeTaskIds`/
// `defaultAdapter` FROM this file, so importing back from it here would create a
// `link -> reconcile-shared -> link` cycle.
import { mapWithConcurrency, TASK_DETAILS_CONCURRENCY } from "./concurrency";
import { writeFileOverwriting } from "./fswrite";

/** Options shared by {@link runLink} and {@link runUnlink}; `root`, the streams, and `adapter` are injectable for tests. */
export interface LinkOptions {
  /** The repo root the `docs/` bundle resolves against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional + flag tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for bundle-load advisories; defaults to `process.stderr`. */
  stderr?: Writer;
  /** The Backlog adapter; defaults to the real `backlog` binary on PATH. Injected in tests so they touch no subprocess. */
  adapter?: BacklogAdapter;
  /** The git-write seam (`state.ts`) for committing `backlog/` after a back-reference edit; defaults to the real `git` binary. Injected in tests. */
  gitSpawn?: GitSpawn;
}

/** The parsed form of `link`/`unlink`'s arguments. `allowMissing` is `unlink`-only (see {@link parseLinkArgs}). */
interface LinkArgs {
  /** The concept id (or path) being linked/unlinked. */
  id: string;
  /** One or more Backlog task ids. */
  taskIds: string[];
  /** `--no-back-ref`: skip the Backlog-side label/`--doc` edit entirely. */
  noBackRef: boolean;
  /** `unlink --allow-missing`: tolerate `id` not resolving to a live concept — see {@link runUnlink}. Always `false` for `link`. */
  allowMissing: boolean;
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
  /** The `backlog/` commit outcome — `{committed: false, files: []}` when no back-reference edit was made (`--no-back-ref`, or every id already linked). */
  readonly backlogCommit: BacklogCommitResult;
}

/** One task's outcome in an {@link UnlinkReport}. */
export interface UnlinkedTask {
  /** The task id as given. */
  readonly task: string;
  /** Whether the concept's `tasks:` frontmatter lost this id or never carried it — always `"not-linked"` under `--allow-missing` (there is no `tasks:` list to check). */
  readonly status: "removed" | "not-linked";
  /** Whether the task's `doc:<conceptId>` label was removed, was already absent, the edit was skipped (`--no-back-ref`, or the task no longer exists in Backlog), or the edit failed. */
  readonly backRef: "removed" | "already-absent" | "skipped" | "failed";
  /** A one-line reason, present only when `backRef` is `"failed"`. */
  readonly error?: string;
}

/** The `unlink.result` payload. */
export interface UnlinkReport {
  /** The concept's repo-relative path — reconstructed from the given id (`docs/<id>.md`) under `--allow-missing`, since there is then no live concept to read a real path from. */
  readonly concept: string;
  /** Every task id passed, in argument order, deduplicated case-insensitively. */
  readonly tasks: readonly UnlinkedTask[];
  /** Whether the concept file was written; always `false` under `--allow-missing` (no concept file exists to write). */
  readonly changed: boolean;
  /** The `backlog/` commit outcome — `{committed: false, files: []}` when no back-reference edit was made (`--no-back-ref`, or every id already absent). */
  readonly backlogCommit: BacklogCommitResult;
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
 * @returns `0` when every back-reference edit (if any ran) succeeded, after emitting the
 *   `link.result` envelope. When at least one edit (or the `backlog/` commit) failed, throws a
 *   `drift` (exit 6) {@link LoreError} instead — see {@link backRefFailure}.
 */
export async function runLink(options: LinkOptions): Promise<number> {
  const { concept, id, taskIds, noBackRef, docsRoot, profile } = await prepare(options, "link");
  if (concept === undefined) {
    // Unreachable: `--allow-missing` is `unlink`-only (see `parseLinkArgs`), so `prepare` always
    // resolves `id` to a live concept or throws `not_found` for `link`.
    throw conceptNotInBundle(id);
  }
  const adapter = options.adapter ?? defaultAdapter(options.root);
  const docPath = repoRelativePath(concept.path);
  const label = backRefLabel(concept.id);

  // Validate every task exists BEFORE any write — a missing id fails the whole command loud,
  // rather than leaving the doc half-linked. Reads are independent so they run concurrently, but
  // bounded to TASK_DETAILS_CONCURRENCY in flight at once (`mapWithConcurrency`, LORE-233) rather
  // than firing the entire task-id list as one `Promise.allSettled(...map(...))` burst — a large
  // id list would otherwise spawn that many `backlog task view` subprocesses simultaneously
  // (process/file-descriptor exhaustion). Each outcome is written into `detailResults` by its
  // ORIGINAL index (never push order, which would follow completion order under the pool), so a
  // rejection never races ahead of an earlier id's not-found: the FIRST invalid id in argument
  // order — not-found or a genuine read failure — is still what gets reported, decided by the same
  // in-order scan below after every read has settled, byte-for-byte the same contract
  // `Promise.allSettled` gave. `verifiedViewTask` (LORE-177) also rejects a detail whose own `id`
  // doesn't match the requested `taskId` — surfaced here as a rejected settle, reported identically
  // to a genuine read failure.
  const detailResults: PromiseSettledResult<BacklogTaskDetail | null>[] = new Array(taskIds.length);
  await mapWithConcurrency(
    taskIds.map((taskId, index) => ({ taskId, index })),
    TASK_DETAILS_CONCURRENCY,
    async ({ taskId, index }) => {
      try {
        detailResults[index] = { status: "fulfilled", value: await verifiedViewTask(adapter, taskId) };
      } catch (reason) {
        detailResults[index] = { status: "rejected", reason };
      }
    },
  );
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
    const alreadyLinked = containsCaseInsensitive(existingTasks, taskId);
    return { task: taskId, status: alreadyLinked ? "already-linked" : "added", backRef: "skipped" };
  });
  const nextTasks = [...existingTasks, ...tasks.filter((t) => t.status === "added").map((t) => t.task.toLowerCase())];

  const changed = writeTasksIfChanged(docsRoot, concept, existingTasks, nextTasks, profile);

  let anyBackRefFailed = false;
  // The candidate `backlog/` task file paths this run's commit stages — never a bundle-wide sweep.
  // Populated inside the loop after either a successful edit, or an "already-present" no-edit
  // outcome whose file might still carry a prior run's uncommitted drift (LORE-121); either way,
  // `commitBacklogFiles`'s own `git status` (scoped to exactly these paths) is what decides which
  // of them, if any, are actually dirty and worth staging — a failed edit never reaches either push,
  // so it stays excluded (see the "partial back-ref failure" test).
  const editedFiles: string[] = [];
  if (!noBackRef) {
    const outcomes = await runSequentially(taskIds, async (taskId) => {
      // Re-read fresh right before editing (not the up-front validation snapshot): matches
      // runUnlink's freshness and closes a narrow race where the task changed out-of-band
      // between the existence check above and this edit. `verifiedViewTask` (LORE-177) also
      // refuses a detail whose own `id` doesn't match `taskId` — never used to compute
      // `desiredDocs`/labels below, which would otherwise borrow another task's data.
      const detail = await verifiedViewTask(adapter, taskId);
      if (detail === null) {
        throw new Error(`task "${taskId}" no longer exists in Backlog`);
      }
      const wasPresent = hasLabel(detail, label);
      // Matched case-insensitively, like `hasLabel` and `removeBackRefs`'s `hadDoc` — an existing
      // documentation entry that differs from `docPath` only by case (a hand-edit or out-of-band
      // move) already reflects this link, so it must not be treated as changed (which would force
      // an unnecessary edit) nor fall through to `addDoc` appending a casing-variant duplicate.
      const docChanged = !containsCaseInsensitive(detail.documentation, docPath);
      if (wasPresent && !docChanged) {
        // Both the label and --doc already reflect this link, so there is no Backlog edit to make
        // — but the task's file can still be dirty and uncommitted on disk if a PRIOR `lore link`
        // run already applied that same edit and then its own `commitBacklogFiles` call failed
        // (e.g. a rejected pre-commit hook, LORE-121). Recording the path here, even though this
        // run makes no edit, lets `commitBacklogFiles`'s own `git status` (scoped to exactly this
        // path) decide whether there is real drift to stage and commit: a clean file reports
        // nothing dirty and stays a true no-op (AC#3), while a dirty one gets picked up and
        // committed by this retry (AC#1/#2) instead of silently no-opping forever.
        if (detail.file) {
          editedFiles.push(detail.file);
        }
        return "already-present" as const;
      }
      const desiredDocs = addDoc(detail.documentation, docPath);
      await adapter.editTask(taskId, { addLabels: [label], doc: desiredDocs });
      if (detail.file) {
        // Only after a successful editTask, and only with a usable path — a truthy guard (not just
        // `!== null`) so a `""` filePathRelative is skipped too, never passed on as an empty git
        // pathspec (which `git status --` rejects). No path → nothing to commit here; `lore sync`'s
        // catch-all sweep still picks up any stray dirt later.
        editedFiles.push(detail.file);
      }
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

  // Commit whatever of this run's candidate task files (`editedFiles`) turns out to actually be
  // dirty — lore is the sole committer of `backlog/` (ADR-0012, design §3.6), so a `link` no longer
  // leaves an edit (this run's, or a prior run's uncommitted drift, LORE-121) sitting uncommitted
  // until the next `lore sync`. Scoped to `editedFiles`, so a `--no-back-ref` run (empty) commits
  // nothing, a genuinely clean run finds nothing dirty among its candidates and stays a true no-op,
  // and an unrelated dirty `backlog/` edit to some OTHER task's file is never swept in (ADR-0012 §1).
  const backlogCommit = await commitBacklogFiles(editedFiles, options, LINK_COMMIT_MESSAGE);
  const report: LinkReport = { concept: docPath, tasks, changed, backlogCommit };
  // A captured commit failure (backlogCommit.error) is drift too — routed through the same
  // ErrorEnvelope as a failed edit (LORE-58), never the success envelope on a nonzero exit.
  if (anyBackRefFailed || backlogCommit.error !== undefined) {
    throw backRefFailure("link", report);
  }
  emit(reportRenderable("link.result", report, renderTaskReport), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * Run `lore unlink`: remove every `taskId` from the concept's `tasks:` frontmatter and, unless
 * `--no-back-ref`, remove the matching `doc:<conceptId>` label and shrink `--doc` on each task.
 * Unlike {@link runLink}, a task id no longer present in Backlog is tolerated (cli-surface's
 * unlink exit table has no task-not-found case) — the doc-side reference is still cleaned up and
 * the back-reference edit is skipped for that id. The doc-side write needs no Backlog round-trip
 * at all, so it never depends on any back-reference edit's outcome.
 *
 * With `--allow-missing`, `id` itself may not resolve to a live concept ({@link prepare} returns
 * `concept: undefined`): there is then no `tasks:` frontmatter to write (`changed` is always
 * `false`, every task's doc-side `status` is `"not-linked"`), and only the Backlog-side label/
 * `--doc` removal runs, computed straight from `id` — see the module doc.
 *
 * @returns `0` when every back-reference edit (if any ran) succeeded, after emitting the
 *   `unlink.result` envelope. When at least one edit (or the `backlog/` commit) failed, throws a
 *   `drift` (exit 6) {@link LoreError} instead — see {@link backRefFailure}.
 */
export async function runUnlink(options: LinkOptions): Promise<number> {
  const { concept, id, taskIds, noBackRef, docsRoot, profile } = await prepare(options, "unlink");
  const adapter = options.adapter ?? defaultAdapter(options.root);
  const docPath = concept !== undefined ? repoRelativePath(concept.path) : `${DOCS_DIR}/${id}.md`;
  const label = backRefLabel(concept?.id ?? id);

  let tasks: UnlinkedTask[];
  let changed = false;
  if (concept !== undefined) {
    const existingTasks = toRefList(concept.frontmatter.tasks);
    tasks = taskIds.map((taskId) => {
      const wasLinked = containsCaseInsensitive(existingTasks, taskId);
      return { task: taskId, status: wasLinked ? "removed" : "not-linked", backRef: "skipped" };
    });
    const removedLower = new Set(tasks.filter((t) => t.status === "removed").map((t) => t.task.toLowerCase()));
    const nextTasks = existingTasks.filter((t) => !removedLower.has(t.toLowerCase()));
    // Write the doc-side removal FIRST — mirrors runLink's order. The doc write needs no Backlog
    // round-trip and never depends on any back-reference edit's outcome, so committing it before
    // the per-task Backlog edits means a failure on the Backlog side can never strand it (the
    // reverse order would leave already-applied Backlog mutations unreported if this write failed).
    changed = writeTasksIfChanged(docsRoot, concept, existingTasks, nextTasks, profile);
  } else {
    // --allow-missing, id doesn't resolve: no concept file exists to carry a tasks: list at all.
    tasks = taskIds.map((taskId) => ({ task: taskId, status: "not-linked", backRef: "skipped" }));
  }

  let anyBackRefFailed = false;
  let editedFiles: readonly string[] = [];
  if (!noBackRef) {
    const removal = await removeBackRefs(adapter, taskIds, label, docPath);
    editedFiles = removal.editedFiles;
    removal.outcomes.forEach((outcome, i) => {
      const entry = tasks[i] as UnlinkedTask;
      if (outcome.status === "fulfilled") {
        tasks[i] = { ...entry, backRef: outcome.value };
      } else {
        anyBackRefFailed = true;
        tasks[i] = { ...entry, backRef: "failed", error: describeError(outcome.reason) };
      }
    });
  }

  const backlogCommit = await commitBacklogFiles(editedFiles, options, UNLINK_COMMIT_MESSAGE);
  const report: UnlinkReport = { concept: docPath, tasks, changed, backlogCommit };
  // A captured commit failure (backlogCommit.error) is drift too — routed through the same
  // ErrorEnvelope as a failed edit (LORE-58), never the success envelope on a nonzero exit.
  if (anyBackRefFailed || backlogCommit.error !== undefined) {
    throw backRefFailure("unlink", report);
  }
  emit(reportRenderable("unlink.result", report, renderTaskReport), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * Remove `label`/`docPath` from every `taskId`'s Backlog record — the per-task removal loop shared
 * by {@link runUnlink}'s normal and `--allow-missing` (bare-id) paths, which differ only in how
 * `label`/`docPath` were derived, not in how the removal itself works.
 */
async function removeBackRefs(
  adapter: BacklogAdapter,
  taskIds: readonly string[],
  label: string,
  docPath: string,
): Promise<{
  readonly outcomes: readonly PromiseSettledResult<"removed" | "already-absent" | "skipped">[];
  readonly editedFiles: readonly string[];
}> {
  // The candidate task files for the caller's scoped commit — populated after either a successful
  // `editTask`, or an "already-absent" no-edit outcome whose file might still carry a prior run's
  // uncommitted drift (LORE-121's pattern, applied here per LORE-179); either way,
  // `commitBacklogFiles`'s own `git status` (scoped to exactly these paths) is what decides which
  // of them, if any, are actually dirty and worth staging (mirrors runLink's editedFiles).
  const editedFiles: string[] = [];
  const outcomes = await runSequentially(taskIds, async (taskId) => {
    // `verifiedViewTask` (LORE-177) refuses a detail whose own `id` doesn't match `taskId` — never
    // used below to decide `hadLabel`/`hadDoc` or compute `removeDoc`'s result, which would
    // otherwise borrow (and remove from) another task's documentation entirely.
    const detail = await verifiedViewTask(adapter, taskId);
    if (detail === null) {
      return "skipped" as const; // the task no longer exists in Backlog — nothing to clean up
    }
    const hadLabel = hasLabel(detail, label);
    // Matched case-insensitively, like `hasLabel` — necessary for `--allow-missing`, whose
    // `docPath` is *reconstructed* from the given id, not read from a live concept's real path, so
    // it may not match the originally-stored casing exactly. Safe because `assertNoLabelCaseCollision`
    // already ran up front and ruled out any other concept whose id (and so doc path) could
    // case-collide, so a case-insensitive match here can't strip a different concept's real entry.
    const hadDoc = containsCaseInsensitive(detail.documentation, docPath);
    if (!hadLabel && !hadDoc) {
      // Neither the label nor the doc entry is present, so there is no Backlog edit to make — but
      // the task's file can still be dirty and uncommitted on disk if a PRIOR `lore unlink` run
      // already applied this exact removal and then its own `commitBacklogFiles` call failed (e.g.
      // a rejected pre-commit hook — LORE-121's pattern, LORE-179). Recording the path here, even
      // though this run makes no edit, lets `commitBacklogFiles`'s own `git status` (scoped to
      // exactly this path) decide whether there is real drift to stage and commit: a clean file
      // reports nothing dirty and stays a true no-op (AC#3), while a dirty one gets picked up and
      // committed by this retry (AC#1) instead of silently no-opping forever.
      if (detail.file) {
        editedFiles.push(detail.file);
      }
      return "already-absent" as const; // nothing to remove — skip the edit entirely
    }
    // An empty `desiredDocs` is not special-cased: the real adapter's `--doc` accumulator
    // (`for (const doc of patch.doc ?? [])`) sends zero flags for `[]`, identical to `undefined` —
    // Backlog is left with whatever it already had (it cannot clear `--doc` via an empty value,
    // contract §2.4), so a stale annotation cosmetically lingers either way.
    await adapter.editTask(taskId, { removeLabels: [label], doc: removeDoc(detail.documentation, docPath) });
    if (detail.file) {
      editedFiles.push(detail.file);
    }
    return "removed" as const;
  });
  return { outcomes, editedFiles };
}

/** One task's outcome after {@link moveBackRefs} moves its back-reference to a concept's new id/path. */
export interface MovedBackRef {
  /** The task id, as given. */
  readonly task: string;
  /** Whether the label/`--doc` already reflected the new id/path, were moved, or the move failed. */
  readonly backRef: "moved" | "already-current" | "failed";
  /** A one-line reason, present only when `backRef` is `"failed"`. */
  readonly error?: string;
}

/**
 * Move every `taskId`'s back-reference from a concept's old id/path to its new one — the
 * Backlog-side half of `lore rename` keeping ADR-0009 §2's coupling intact across a move, called
 * by `commands/rename.ts` (this file is the single owner of the `doc:<conceptId>` label contract).
 * A task with neither the old label nor the old doc path (or one no longer present in Backlog) is
 * already current and its edit is skipped entirely — this also covers a task linked with
 * `--no-back-ref` (or one whose label was stripped by hand): it never had a back-reference for the
 * old id, so *moving* one never introduces a new one it didn't already have. Otherwise mirrors
 * `runLink`/`runUnlink`'s per-task resilience: edits run sequentially, never concurrently
 * (ADR-0012 §5), and a single task's failure is caught and reported without blocking the rest.
 *
 * Reads through {@link verifiedViewTask} (LORE-183), never a raw `adapter.viewTask` call: a
 * mismatched/ambiguous adapter detail is refused rather than trusted to compute the `editTask`
 * write below, which would otherwise borrow another task's labels/documentation while still
 * writing under the REQUESTED `taskId` — the same hazard class this function already guards
 * against for a genuinely-missing task. The refusal surfaces through the same per-task `"failed"`
 * outcome as any other rejected edit, degrading gracefully rather than corrupting the doc list.
 */
export async function moveBackRefs(
  adapter: BacklogAdapter,
  taskIds: readonly string[],
  oldConceptId: string,
  newConceptId: string,
  oldDocPath: string,
  newDocPath: string,
): Promise<{ readonly outcomes: readonly MovedBackRef[]; readonly editedFiles: readonly string[] }> {
  const oldLabel = backRefLabel(oldConceptId);
  const newLabel = backRefLabel(newConceptId);
  // The candidate task files for the caller's scoped commit — populated after a successful
  // `editTask` (a `"moved"` outcome), AND after the "already fully migrated" no-edit outcome below
  // whose file might still carry a prior run's uncommitted drift (LORE-121's pattern, applied here
  // per LORE-179); `commitBacklogFiles`'s own `git status` (scoped to exactly these paths) is what
  // decides which of them, if any, are actually dirty and worth staging. The OTHER `already-current`
  // outcome (no trace of a back-ref at all — never linked) contributes nothing: unlike a completed
  // migration, no prior run of *this* move could ever have applied an edit here, so there is no
  // drift of this kind for it to hide. A `failed` edit likewise contributes nothing.
  const editedFiles: string[] = [];
  const settled = await runSequentially(taskIds, async (taskId) => {
    const detail = await verifiedViewTask(adapter, taskId);
    if (detail === null) {
      return "already-current" as const; // the task no longer exists in Backlog — nothing to move
    }
    // `hasLabel`'s case-insensitive match can't distinguish "old" from "new" when a rename is
    // case-only (oldLabel/newLabel are then the SAME domain, just differently cased) — testing them
    // independently would find the one stored label under both names and wrongly conclude both are
    // present. Use an exact match for "is the new label already correct" and a case-insensitive
    // scan (excluding anything already exactly the new label) for "is there a stale label to
    // remove" — this handles a case-only rename (fixes the stored label's casing) and a normal
    // rename that already separately carries the new label (still removes the stale old one)
    // identically and correctly.
    const hasExactNewLabel = detail.labels.includes(newLabel);
    const staleLabel = detail.labels.find((l) => l.toLowerCase() === oldLabel.toLowerCase() && l !== newLabel);
    const hasOldDoc = detail.documentation.includes(oldDocPath);
    const hasNewDoc = detail.documentation.includes(newDocPath);
    if (!hasExactNewLabel && staleLabel === undefined && !hasOldDoc && !hasNewDoc) {
      // No trace of this concept's back-reference at all, old or new — the task was never given
      // one (e.g. linked with `--no-back-ref`) or had it stripped by hand. There is nothing to
      // *move*; unlike `runLink`, moving never introduces a back-reference that wasn't already
      // present under the old id, so this is left alone rather than newly adding one.
      return "already-current" as const;
    }
    if (hasExactNewLabel && staleLabel === undefined && hasNewDoc && !hasOldDoc) {
      // Already fully migrated to the new label/doc, so there is no Backlog edit to make — but the
      // task's file can still be dirty and uncommitted on disk if a PRIOR `lore rename` run already
      // applied this exact move and then its own `commitBacklogFiles` call failed (e.g. a rejected
      // pre-commit hook — LORE-121's pattern, LORE-179). Recording the path here, even though this
      // run makes no edit, lets `commitBacklogFiles`'s own `git status` (scoped to exactly this
      // path) decide whether there is real drift to stage and commit: a clean file reports nothing
      // dirty and stays a true no-op (AC#3), while a dirty one gets picked up and committed by this
      // retry (AC#2) instead of silently no-opping forever.
      if (detail.file) {
        editedFiles.push(detail.file);
      }
      return "already-current" as const; // already fully migrated — nothing to move
    }
    const docs = detail.documentation.filter((d) => d !== oldDocPath);
    if (!docs.includes(newDocPath)) {
      docs.push(newDocPath);
    }
    await adapter.editTask(taskId, {
      addLabels: hasExactNewLabel ? undefined : [newLabel],
      removeLabels: staleLabel !== undefined ? [staleLabel] : undefined,
      doc: docs,
    });
    if (detail.file) {
      editedFiles.push(detail.file);
    }
    return "moved" as const;
  });
  const outcomes = taskIds.map((task, i): MovedBackRef => {
    const outcome = settled[i] as PromiseSettledResult<"moved" | "already-current">;
    if (outcome.status === "fulfilled") {
      return { task, backRef: outcome.value };
    }
    return { task, backRef: "failed" as const, error: describeError(outcome.reason) };
  });
  return { outcomes, editedFiles };
}

// ── Shared setup ───────────────────────────────────────────────────────────────

/**
 * The default {@link BacklogAdapter}: the real `backlog` binary resolved from PATH, spawned in
 * `root` so a non-default root routes writes to the right project. Shared with `commands/rename.ts`,
 * which needs the same adapter to move a renamed concept's back-references (see
 * {@link moveBackRefs}) — this file is the single owner of the `doc:<conceptId>` coupling contract
 * (ADR-0009 §2), so any command that touches it goes through this module rather than re-deriving
 * the label/adapter rules itself.
 */
export function defaultAdapter(root: string): BacklogAdapter {
  return createBacklogAdapter(bunBacklogSpawn(undefined, root));
}

/**
 * Call `adapter.viewTask(taskId)` and verify the returned detail's own `id` matches the requested
 * `taskId` case-insensitively before trusting it (originally introduced alongside
 * `reconcile-shared.ts`'s `resolveTaskDetails`, LORE-122). A misbehaving or ambiguous adapter
 * handing back a DIFFERENT task's detail must never be trusted to decide a label/`--doc` edit or
 * the `tasks:` pre-write check: every one of this module's `viewTask` consumers — the pre-write
 * existence check, the back-reference edit's fresh re-read, `unlink`'s removal read, and
 * `moveBackRefs`'s move read (LORE-183; the last of these was an unguarded gap until then) — uses
 * the RETURNED detail's own `title`/`status`/`labels`/`documentation` to decide what to write, so
 * a mismatch left unchecked would silently borrow another task's data while still writing under
 * the REQUESTED `taskId`. Exported so `commands/tasks.ts`'s `resolveRollup` (LORE-125) AND
 * `reconcile-shared.ts`'s `resolveTaskDetails` (LORE-183) share this exact guard as the ONE place
 * the comparison/`LoreError` lives, instead of each hand-maintaining its own byte-identical copy.
 *
 * Returns the verified detail, or `null` when the task genuinely doesn't exist (unchanged from
 * `adapter.viewTask`'s own contract) — a mismatch is a THIRD outcome, always a thrown `LoreError`
 * `not_found`, never folded into the `null` case (so a caller can't mistake "wrong task" for
 * "no task" and silently skip a back-reference cleanup it should have refused outright instead).
 */
export async function verifiedViewTask(adapter: BacklogAdapter, taskId: string): Promise<BacklogTaskDetail | null> {
  const detail = await adapter.viewTask(taskId);
  if (detail === null) {
    return null;
  }
  if (detail.id.toLowerCase() !== taskId.toLowerCase()) {
    throw new LoreError(
      "not_found",
      `task "${taskId}" resolved to a different task ("${detail.id}") — refusing to use it`,
      "this points at a Backlog adapter bug or an id collision, not a missing task — verify the task id with `backlog task view` and report the mismatch",
      { taskId, resolvedId: detail.id },
    );
  }
  return detail;
}

/** The `git`-authored commit message for `lore link`'s `backlog/` writes (its `doc:` label additions). */
const LINK_COMMIT_MESSAGE = "chore(backlog): add doc back-references (lore link)";

/** The `git`-authored commit message for `lore unlink`'s `backlog/` writes (its `doc:` label removals). */
const UNLINK_COMMIT_MESSAGE = "chore(backlog): remove doc back-references (lore unlink)";

/**
 * Everything {@link runLink}/{@link runUnlink} need after parsing and loading the bundle.
 * `concept` is `undefined` only for `unlink --allow-missing` when `id` doesn't resolve to a live
 * concept — `id` is always the resolved (post-`idFromPath`) id, needed either way.
 */
interface Prepared {
  readonly concept: Concept | undefined;
  readonly id: string;
  readonly taskIds: string[];
  readonly noBackRef: boolean;
  readonly docsRoot: string;
  readonly profile: Profile;
}

/**
 * Parse arguments, load the bundle, and resolve the concept — shared by both commands. Advisories
 * are flushed immediately after `loadBundle`, before the lookup that can throw `not_found`, so a
 * load warning is never lost on the failing path. `link` (and `unlink` without `--allow-missing`)
 * always resolve `id` to a live concept or throw `not_found`; `unlink --allow-missing` tolerates a
 * miss and returns `concept: undefined` instead (see {@link runUnlink}).
 */
async function prepare(options: LinkOptions, command: "link" | "unlink"): Promise<Prepared> {
  const parsed = parseLinkArgs(options.args, command);
  const id = idFromPath(parsed.id);
  // Reserved-hub-stem is checked unconditionally: the doc-side tasks: write always happens
  // (--no-back-ref only skips the Backlog side), so index.md/log.md is never a safe target either
  // way. The comma/case-collision guards below are Backlog-label concerns, so they gate on
  // `!noBackRef` — --no-back-ref never sends a doc: label, so neither problem can occur on that path.
  assertNotReservedStem(id, command);
  if (!parsed.noBackRef) {
    assertNoCommaInId(id, command);
  }
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(docsRoot, { warnings: advisories, profile });
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const concept = graph.concepts.get(id);
  if (concept === undefined) {
    if (parsed.allowMissing) {
      // The case-collision guard still applies: Backlog's own label store can't distinguish `id`
      // from a *live* concept whose id collides with it case-insensitively, so removing `id`'s
      // label could otherwise strip that live concept's real back-reference.
      if (!parsed.noBackRef) {
        assertNoLabelCaseCollision(graph, id, id, command);
      }
      return {
        concept: undefined,
        id,
        taskIds: dedupeTaskIds(parsed.taskIds),
        noBackRef: parsed.noBackRef,
        docsRoot,
        profile,
      };
    }
    throw conceptNotInBundle(id);
  }
  if (!parsed.noBackRef) {
    assertNoLabelCaseCollision(graph, concept.id, concept.id, command);
  }
  return { concept, id, taskIds: dedupeTaskIds(parsed.taskIds), noBackRef: parsed.noBackRef, docsRoot, profile };
}

/**
 * Reject a concept id containing a comma as a `<action>` principal — a `usage` error. Backlog's
 * `--add-label`/`--remove-label` have no escape for an embedded comma (backlog-cli-contract §2.4;
 * `commaJoin` in `adapters/backlog.ts` now rejects one outright rather than silently splitting it
 * into two labels), so a comma-bearing id could never get a working `doc:` back-reference. Failing
 * loud here, once, up front (callers only call this when a back-ref edit will actually be
 * attempted) gives one clear reason instead of every per-task `editTask` call failing forever and
 * reporting `drift` on every future invocation for that concept. Shared by `link`/`unlink`
 * (`commands/link.ts`) and `lore rename` (`commands/rename.ts`, moving a linked concept's back-ref).
 */
export function assertNoCommaInId(id: string, action: string): void {
  if (id.includes(",")) {
    throw usage(
      `cannot ${action} "${id}": a concept id containing a comma cannot be encoded as a Backlog doc: label`,
      "Backlog's --add-label/--remove-label have no escape for an embedded comma — rename the concept so its id contains no comma",
      { id },
    );
  }
}

/**
 * Reject a `<candidateId>` that collides case-insensitively with another concept's id already in
 * `graph` (`conflict`, exit 5) — `excludeId` is the id to ignore (the concept's own current id, so
 * it never "collides with itself"; for `lore rename` this is the *old* id, since the concept is
 * still keyed under it in the graph passed in). Concept ids are case-sensitive in the graph
 * (`buildGraph`'s lookup is a plain `Map`), so two such concepts are legitimately distinct nodes —
 * but Backlog's own `--add-label`/`--remove-label` de-dup case-insensitively in its label store
 * (backlog-cli-contract §2.4), so no encoding lore sends can give them independently addressable
 * `doc:` back-references. Rather than silently let one concept's unlink (or a rename onto a
 * colliding id) strip or entangle the other's real back-reference, refuse the operation outright.
 * Shared by `link`/`unlink` (`commands/link.ts`) and `lore rename` (`commands/rename.ts`).
 */
export function assertNoLabelCaseCollision(
  graph: BundleGraph,
  candidateId: string,
  excludeId: string,
  action: string,
): void {
  for (const other of graph.concepts.values()) {
    if (other.id !== excludeId && other.id.toLowerCase() === candidateId.toLowerCase()) {
      throw new LoreError(
        "conflict",
        `cannot ${action} "${candidateId}": concept "${other.id}" has an id differing only by case`,
        "Backlog's own doc: label store de-dups case-insensitively, so these two concepts cannot have independent back-references — rename one so their ids are case-distinct",
        { id: candidateId, collidesWith: other.id },
      );
    }
  }
}

/**
 * Deduplicate task ids case-insensitively, keeping the first-seen casing and argument order.
 * Exported for `commands/rename.ts`, which needs the same dedup applied to a concept's `tasks:`
 * frontmatter list before {@link moveBackRefs} — that list isn't schema-enforced unique, so a
 * hand-edited case-duplicate (`["lore-1", "LORE-1"]`) would otherwise drive a redundant Backlog
 * round trip and a duplicate report row.
 */
export function dedupeTaskIds(taskIds: readonly string[]): string[] {
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

/** Whether `list` contains `value`, matched case-insensitively — the shared comparison `tasks:`/label membership always uses. */
function containsCaseInsensitive(list: readonly string[], value: string): boolean {
  return list.some((item) => item.toLowerCase() === value.toLowerCase());
}

/** Whether a task's labels already carry `label`, matched case-insensitively (Backlog's own label de-dup). */
function hasLabel(detail: BacklogTaskDetail, label: string): boolean {
  return containsCaseInsensitive(detail.labels, label);
}

/**
 * The desired full `documentation` array after adding `docPath` (SET/REPLACE-safe: preserves every
 * other entry). Matched case-insensitively, like `removeDoc` — an existing entry differing from
 * `docPath` only by case already covers it, so it is left as-is rather than gaining a duplicate.
 */
function addDoc(existing: readonly string[], docPath: string): string[] {
  return containsCaseInsensitive(existing, docPath) ? [...existing] : [...existing, docPath];
}

/**
 * The desired full `documentation` array after removing `docPath` (SET/REPLACE-safe: preserves
 * every other entry). Matched case-insensitively — see {@link removeBackRefs}'s `hadDoc` comment
 * for why this is safe.
 */
function removeDoc(existing: readonly string[], docPath: string): string[] {
  return existing.filter((d) => d.toLowerCase() !== docPath.toLowerCase());
}

/**
 * Write the concept's `tasks:` frontmatter when it changed, returning whether a write happened.
 * Serializes under the active profile so an already-canonical concept's other frontmatter and body
 * round-trip byte-for-byte and the `tasks:` edit is the only diff (ADR-0011).
 */
function writeTasksIfChanged(
  docsRoot: string,
  concept: Concept,
  existingTasks: readonly string[],
  nextTasks: readonly string[],
  profile: Profile,
): boolean {
  if (sameList(existingTasks, nextTasks)) {
    return false;
  }
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
 * {@link parseCommandArgs} parser (mirrors `commands/rename.ts`/`commands/supersede.ts`'s
 * parsers). Positional arity is validated here since it differs per command (a variadic task-id
 * tail, not a fixed count).
 */
function parseLinkArgs(args: readonly string[], command: "link" | "unlink"): LinkArgs {
  const { positionals, flags } = parseCommandArgs(args, command);

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
  return { id, taskIds, noBackRef: flags.has("no-back-ref"), allowMissing: flags.has("allow-missing") };
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
  readonly backlogCommit: BacklogCommitResult;
  readonly tasks: readonly {
    readonly task: string;
    readonly status: string;
    readonly backRef: string;
    readonly error?: string;
  }[];
}

/**
 * One line per task's doc-side + back-ref outcome (with its error, if any), the concept-write
 * line, then the `backlog/` commit line if one was made. Shared by `link` and `unlink` — the two
 * reports render identically. Both halves of each task line are named explicitly (`tasks:` for
 * the concept's own frontmatter list, `back-ref` for the Backlog `doc:<conceptId>` label/`--doc`
 * side) rather than the old bare `(doc)` qualifier, which read as unexplained shorthand without
 * already knowing the `doc:` label convention (LORE-259).
 */
function renderTaskReport(data: TaskReportLike): string {
  const lines = data.tasks.map((t) => {
    const suffix = t.error !== undefined ? ` (${t.error})` : "";
    return `${t.task}: tasks: ${t.status}, back-ref: ${t.backRef}${suffix}`;
  });
  lines.push(`${data.concept}: ${data.changed ? "updated" : "unchanged"}`);
  const commitLine = renderBacklogCommitLine(data.backlogCommit);
  if (commitLine !== undefined) {
    lines.push(commitLine);
  }
  return lines.join("\n");
}

/**
 * Build the `drift` {@link LoreError} `runLink`/`runUnlink` throw instead of emitting a
 * success-shaped stdout envelope when any per-task back-reference edit or the `backlog/` commit
 * failed (LORE-58). The doc-side write and any successful back-reference edits already happened
 * and are never undone — only how the *outcome* is reported changes: routed through the standard
 * `--json` `ErrorEnvelope` on stderr (cli-contract §5.2) with empty stdout, uniformly with every
 * other `lore` command's nonzero exit, instead of a partial-failure envelope on stdout. `input`
 * carries the same per-task detail the old stdout report did (`concept`/`changed`/`tasks`/
 * `backlogCommit`), so a caller loses no diagnostic granularity, just its location.
 */
function backRefFailure(kind: "link" | "unlink", report: TaskReportLike): LoreError {
  const failedTasks = report.tasks.filter((t) => t.backRef === "failed");
  const commitFailed = report.backlogCommit.error !== undefined;
  const summary = [
    failedTasks.length > 0 ? `${failedTasks.length} of ${report.tasks.length} task back-reference edit(s)` : undefined,
    commitFailed ? "the backlog/ commit" : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" and ");
  const reasons = failedTasks.map((t) => `${t.task}: ${t.error ?? "unknown error"}`);
  if (commitFailed) {
    reasons.push(`backlog/ commit: ${report.backlogCommit.error}`);
  }
  return new LoreError(
    "drift",
    `\`lore ${kind}\`: ${summary} failed`,
    `${reasons.join("; ")} — re-run \`lore ${kind}\` with the same arguments to retry the failure(s)`,
    { concept: report.concept, changed: report.changed, tasks: report.tasks, backlogCommit: report.backlogCommit },
  );
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
