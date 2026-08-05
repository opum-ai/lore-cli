/**
 * reconcile-shared.ts — resolve every concept that declares `tasks:` into a reconciled status and
 * managed-block rows, shared by `lore sync` (LORE-26, writes the result) and `lore check` (LORE-27,
 * diffs it against disk and never writes — ADR-0007). A zero-length list produces no status rollup
 * and zero rows, but still participates so the managed block can converge to `_No linked tasks._`.
 *
 * Both commands need the *identical* gather: skip reserved-stem concepts (`index`/`log`, regenerated
 * wholesale elsewhere), read and validate the project's status flow/overrides **before** spending any
 * Backlog subprocess round-trip (so a broken `.lore/config.toml` is reported immediately rather than
 * masked behind N task resolutions — sync's own fail-fast property, LORE-26 round 4), resolve every
 * distinct linked task id once, and run `core/reconcile.ts`'s `reconcileStatus` per concept. Only what
 * happens with the result differs, so that part stays with each command.
 */

import { posix } from "node:path";
import { type BacklogAdapter, type BacklogTaskDetail, readStatusFlow } from "../adapters/backlog";
import { loadConfig } from "../config";
import { toRefList } from "../core/bundle";
import type { Concept } from "../core/concept";
import type { ManagedTaskRow } from "../core/managed-block";
import { type ReconciledStatus, reconcileStatus, validateReconcileInputs } from "../core/reconcile";
import { RESERVED_STEMS } from "../core/scaffold";
import { LoreError } from "../errors";
// `mapWithConcurrency`/`TASK_DETAILS_CONCURRENCY` moved to the neutral `./concurrency` module
// (LORE-233) so `link.ts` can share them too without a `link -> reconcile-shared -> link` import
// cycle (this file already imports `dedupeTaskIds`/`defaultAdapter`/`verifiedViewTask` FROM
// `link.ts`). Re-exported here so `check.ts` and `reconcile-shared.test.ts`, which import both
// from this module, keep working unchanged.
import { mapWithConcurrency, TASK_DETAILS_CONCURRENCY } from "./concurrency";
import { dedupeTaskIds, defaultAdapter, verifiedViewTask } from "./link";

export { mapWithConcurrency, TASK_DETAILS_CONCURRENCY };

/** The outcome of resolving one task id: its live detail, or the error resolving it hit. */
export type TaskResolution =
  | { readonly ok: true; readonly detail: BacklogTaskDetail }
  | { readonly ok: false; readonly error: unknown };

/** One concept's resolved reconciliation: its recomputed status and live managed-block rows. */
export interface ReconcileTarget {
  /** The concept as loaded (unmodified) — its version-selected task rollup field is unchanged. */
  readonly concept: Concept;
  /** The rolled-up task progress (`core/reconcile.ts`), or `null` when the concept explicitly links no tasks. */
  readonly newTaskStatus: ReconciledStatus | null;
  /** The linked tasks' live data, in the concept's own `tasks:` order, ready for `regenerateTaskBlock`. */
  readonly rows: ManagedTaskRow[];
}

/** One concept carrying a managed `tasks:` field: not a reserved stem, with zero or more linked tasks. */
export interface EligibleConcept {
  readonly concept: Concept;
  /** Its `tasks:` frontmatter, deduplicated (case-insensitively) but otherwise in authored order. */
  readonly linked: string[];
}

/**
 * Filter `concepts` to those that explicitly declare `tasks:`, including an empty list. An empty
 * list still owns a managed task block: `lore sync` must render the frozen no-tasks paragraph and
 * `lore check` must detect a stale block left behind by the final unlink. It does not, however,
 * require status-flow config or any Backlog task lookup.
 */
export function taskBlockConcepts(concepts: Iterable<Concept>): EligibleConcept[] {
  const eligible: EligibleConcept[] = [];
  for (const concept of concepts) {
    if (RESERVED_STEMS.has(posix.basename(concept.id)) || !Object.hasOwn(concept.frontmatter, "tasks")) {
      continue;
    }
    eligible.push({ concept, linked: dedupeTaskIds(toRefList(concept.frontmatter.tasks)) });
  }
  return eligible;
}

/**
 * Filter `concepts` to those eligible for reconciliation: not a reserved stem (`index`/`log` —
 * regenerated wholesale elsewhere, so a reconciled write here would only be silently discarded,
 * mirroring `link`/`rename`/`supersede`'s shared `assertNotReservedStem` policy) and linking at
 * least one task. Pure and synchronous — callers use it to decide *whether* reconciliation is
 * needed at all (e.g. `lore check` deciding sync-vs-async) without paying for any Backlog IO.
 *
 * Deliberately type-agnostic: a `tasks:` list is reconciled on ANY concept type, not only
 * `Story`/`Spec` — `lore link` (LORE-24) never restricts which type it targets, and this predates
 * LORE-27 entirely (`tasks:` on a `Reference`/`ADR`/etc. is an OKF 0.2 §11 / 0.1 §9-tolerated unknown-key warning,
 * never an error). Narrowing eligibility to specific types here would make `check` (which shares
 * this exact function) more restrictive than `sync` — the disagreement-with-`sync` failure mode
 * this module's callers otherwise take pains to avoid — not fix a LORE-27-introduced gap.
 */
export function linkedConcepts(concepts: Iterable<Concept>): EligibleConcept[] {
  return taskBlockConcepts(concepts).filter(({ linked }) => linked.length > 0);
}

/** The project's reconciliation config: its ordered status flow and `[reconcile.overrides]`. */
export interface ReconcileConfig {
  readonly flow: readonly string[];
  readonly overrides: Readonly<Record<string, string>>;
}

/**
 * Read (but do not validate) `backlog/config.yml`'s status flow and `.lore/config.toml`'s
 * `[reconcile.overrides]` — pure IO, no semantic check, no Backlog subprocess round-trip. Split out
 * from {@link resolveReconcileConfig} so a caller with its OWN precedence to preserve (`lore sync`,
 * against `.lore/profile.toml`) can interleave the syntactic reads, the semantic validation, and
 * whatever else it needs in the exact order its own contract requires, rather than this module
 * silently deciding that order.
 */
export function readReconcileConfig(root: string): ReconcileConfig {
  const flow = readStatusFlow(root);
  const config = loadConfig({ root });
  return { flow, overrides: config.reconcile.overrides };
}

/**
 * {@link readReconcileConfig} plus its semantic validation — the fast, local, IO-only half of
 * reconciliation, with no Backlog subprocess round-trip. This is what {@link gatherReconciliation}
 * uses by default; a caller that already resolved (and validated) its own config up front (`lore
 * sync`, see {@link readReconcileConfig}'s doc comment) passes it straight to `gatherReconciliation`
 * instead, so the files are never read/validated twice in the same command run.
 *
 * @throws LoreError `validation` if the status flow has fewer than two entries, a duplicate entry,
 *   or an override's target is not a valid rollup status.
 */
export function resolveReconcileConfig(root: string): ReconcileConfig {
  const resolved = readReconcileConfig(root);
  validateReconcileInputs(resolved.flow, resolved.overrides);
  return resolved;
}

/**
 * Resolve every `tasks:`-declaring, non-reserved-stem concept in `concepts` to a
 * {@link ReconcileTarget}. Returns `[]` when no concept declares the field. Explicit empty lists
 * return zero-row targets without reading config or constructing an adapter; only actual task ids
 * require Backlog IO.
 *
 * @param root the repo root `backlog/config.yml` / `.lore/config.toml` / the Backlog adapter resolve
 *   against — independent of whichever docs bundle root `concepts` was loaded from.
 * @param concepts the concepts to consider (already loaded/scoped by the caller).
 * @param adapterOverride test seam; defaults to {@link defaultAdapter}.
 * @param configOverride an already-resolved-and-validated {@link ReconcileConfig} (`lore sync` passes
 *   its own, having already called {@link resolveReconcileConfig} itself for ordering reasons); when
 *   omitted, resolved (and validated) here.
 * @param detailsOverride an already-resolved {@link TaskResolution} map, keyed by lowercase task id,
 *   covering (at least) every id `concepts` links — `lore check`'s multi-root drift pass (LORE-50)
 *   resolves the union of every bundle root's linked ids exactly once and passes the shared result
 *   to each root's own `gatherReconciliation` call, rather than each root re-fetching the same id.
 *   When omitted, every id is resolved fresh via `adapterOverride`/`defaultAdapter`, as before.
 * @param configErrorOverride a config-validation failure another caller already hit resolving the
 *   SAME config this call would otherwise read fresh (LORE-50: `lore check`'s multi-root pass
 *   resolves the config once, up front, for every bundle root that has any eligible concept). When
 *   set (and `configOverride` is not), thrown immediately in place of re-reading/re-validating —
 *   preserving the exact fail-fast point a fresh {@link resolveReconcileConfig} call would have hit
 *   for THIS call's own eligible concepts, without a second disk read. Ignored when `eligible` is
 *   empty (mirrors `resolveReconcileConfig` never running for a concept list with nothing to
 *   reconcile) or when `configOverride` is given (a caller with a genuinely resolved config, like
 *   `lore sync`, never also carries a cached failure).
 * @throws LoreError `validation` if the status flow/overrides are malformed (before any task
 *   resolution); `not_found` (exit 3) naming the first linked task id that no longer exists, OR
 *   whose resolved detail's `id` does not case-insensitively match the requested id.
 */
export async function gatherReconciliation(
  root: string,
  concepts: Iterable<Concept>,
  adapterOverride?: BacklogAdapter,
  configOverride?: ReconcileConfig,
  detailsOverride?: ReadonlyMap<string, TaskResolution>,
  configErrorOverride?: unknown,
): Promise<ReconcileTarget[]> {
  const targets = taskBlockConcepts(concepts);
  if (targets.length === 0) {
    return [];
  }

  const eligible = targets.filter(({ linked }) => linked.length > 0);
  if (eligible.length === 0) {
    return targets.map(({ concept }) => ({ concept, newTaskStatus: null, rows: [] }));
  }

  if (configOverride === undefined && configErrorOverride !== undefined) {
    throw configErrorOverride;
  }
  const { flow, overrides } = configOverride ?? resolveReconcileConfig(root);

  const allTaskIds = dedupeTaskIds(eligible.flatMap((e) => e.linked));
  const details = detailsOverride
    ? pickResolved(detailsOverride, allTaskIds)
    : await resolveAllTasks(adapterOverride ?? defaultAdapter(root), allTaskIds);

  return targets.map(({ concept, linked }) => {
    if (linked.length === 0) {
      return { concept, newTaskStatus: null, rows: [] };
    }
    const detailList = linked.map((id) => details.get(id.toLowerCase()) as BacklogTaskDetail);
    const newTaskStatus = reconcileStatus(
      detailList.map((d) => d.status),
      flow,
      overrides,
    );
    const rows: ManagedTaskRow[] = detailList.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      file: d.file,
    }));
    return { concept, newTaskStatus, rows };
  });
}

/**
 * Resolve every task id to a {@link TaskResolution}, keyed by lowercase id — a not-found, an
 * identity-mismatched, or a rejected `viewTask` all become an `ok: false` entry rather than a
 * thrown error, so a caller resolving ids shared across several independent groups (bundle roots,
 * in `lore check`'s multi-root drift pass) can fetch each distinct id exactly once and let EACH
 * group decide for itself whether ids IT needs failed, instead of one failing id aborting every
 * group's resolution. Reads run concurrently, bounded to {@link TASK_DETAILS_CONCURRENCY} in
 * flight at once (via {@link mapWithConcurrency}); this never throws.
 *
 * Every resolved detail's own `id` is checked (case-insensitively) against the requested `taskId`
 * via `link.ts`'s shared {@link verifiedViewTask} — a mismatch is treated exactly like a not-found
 * rather than stored as `ok: true` (it throws a `LoreError`, caught below and stored verbatim, same
 * as any other `viewTask` rejection). Nothing downstream (`gatherReconciliation`'s
 * `details.get(id.toLowerCase())` lookup keys purely on the REQUESTED id) would otherwise notice an
 * adapter handing back the wrong task's detail, and a mismatch here would silently attribute
 * another task's title/status to this concept's managed `tasks:` block. This is the ONE place the
 * check lives — `verifiedViewTask` — shared with `link.ts`'s own `viewTask` consumers and
 * `tasks.ts`'s `resolveRollup` (LORE-125), so the comparison/`LoreError` never drifts between sites.
 */
export async function resolveTaskDetails(
  adapter: BacklogAdapter,
  taskIds: readonly string[],
): Promise<Map<string, TaskResolution>> {
  const resolved = new Map<string, TaskResolution>();
  await mapWithConcurrency(taskIds, TASK_DETAILS_CONCURRENCY, async (taskId) => {
    try {
      const detail = await verifiedViewTask(adapter, taskId);
      if (detail === null) {
        resolved.set(taskId.toLowerCase(), {
          ok: false,
          error: new LoreError(
            "not_found",
            `task "${taskId}" does not exist`,
            "a linked concept's tasks: list must reference only live Backlog tasks — check the id, or unlink it",
            { taskId },
          ),
        });
      } else {
        resolved.set(taskId.toLowerCase(), { ok: true, detail });
      }
    } catch (cause) {
      resolved.set(taskId.toLowerCase(), {
        ok: false,
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
  });
  return resolved;
}

/**
 * Resolve every task id to its live {@link BacklogTaskDetail}, keyed by lowercase id. Every id is
 * validated to exist BEFORE any concept's status/managed-block is computed — mirrors
 * `commands/link.ts`'s up-front validation exactly, including running the reads concurrently
 * (`allSettled`) but reporting the first not-found/failure in argument order.
 *
 * @throws LoreError `not_found` (exit 3) naming the first missing task id, in `taskIds` order.
 */
async function resolveAllTasks(
  adapter: BacklogAdapter,
  taskIds: readonly string[],
): Promise<Map<string, BacklogTaskDetail>> {
  const resolved = await resolveTaskDetails(adapter, taskIds);
  return pickResolved(resolved, taskIds);
}

/**
 * Extract `taskIds` from an already-resolved {@link TaskResolution} map, throwing the FIRST (in
 * `taskIds` order) unresolved id's own error — the same contract {@link resolveAllTasks} always
 * had, now shared by a caller (`lore check`, LORE-50) that resolved the map once, up front, for a
 * UNION of ids spanning more than this one `taskIds` list. An id genuinely absent from `resolved`
 * (the caller's union omitted one `gatherReconciliation` call actually needs — never expected in
 * practice, since every caller derives its union from the same eligible concepts) fails loud rather
 * than silently treating it as resolved.
 */
function pickResolved(
  resolved: ReadonlyMap<string, TaskResolution>,
  taskIds: readonly string[],
): Map<string, BacklogTaskDetail> {
  const details = new Map<string, BacklogTaskDetail>();
  for (const taskId of taskIds) {
    const r = resolved.get(taskId.toLowerCase());
    if (r === undefined) {
      throw new Error(`internal: task "${taskId}" was never resolved`);
    }
    if (!r.ok) {
      throw r.error;
    }
    details.set(taskId.toLowerCase(), r.detail);
  }
  return details;
}
