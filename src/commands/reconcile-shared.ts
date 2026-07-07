/**
 * reconcile-shared.ts — resolve every `tasks:`-linked concept's live Backlog data and compute its
 * reconciled status + managed-block rows, shared by `lore sync` (LORE-26, writes the result) and
 * `lore check` (LORE-27, diffs it against disk and never writes — ADR-0007).
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
import { dedupeTaskIds, defaultAdapter } from "./link";

/** One concept's resolved reconciliation: its recomputed status and live managed-block rows. */
export interface ReconcileTarget {
  /** The concept as loaded (unmodified) — its `frontmatter.status` is the pre-reconciliation value. */
  readonly concept: Concept;
  /** The rolled-up status (`core/reconcile.ts`), or `null` when the concept links no tasks (never true here). */
  readonly newStatus: ReconciledStatus | null;
  /** The linked tasks' live data, in the concept's own `tasks:` order, ready for `regenerateTaskBlock`. */
  readonly rows: ManagedTaskRow[];
}

/** One concept eligible for reconciliation: not a reserved stem, and linking at least one task. */
export interface EligibleConcept {
  readonly concept: Concept;
  /** Its `tasks:` frontmatter, deduplicated (case-insensitively) but otherwise in authored order. */
  readonly linked: string[];
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
 * LORE-27 entirely (`tasks:` on a `Reference`/`ADR`/etc. is an OKF §9-tolerated unknown-key warning,
 * never an error). Narrowing eligibility to specific types here would make `check` (which shares
 * this exact function) more restrictive than `sync` — the disagreement-with-`sync` failure mode
 * this module's callers otherwise take pains to avoid — not fix a LORE-27-introduced gap.
 */
export function linkedConcepts(concepts: Iterable<Concept>): EligibleConcept[] {
  const eligible: EligibleConcept[] = [];
  for (const concept of concepts) {
    if (RESERVED_STEMS.has(posix.basename(concept.id))) {
      continue;
    }
    const linked = dedupeTaskIds(toRefList(concept.frontmatter.tasks));
    if (linked.length > 0) {
      eligible.push({ concept, linked });
    }
  }
  return eligible;
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
 * Resolve every `tasks:`-linked, non-reserved-stem concept in `concepts` to a {@link ReconcileTarget}.
 * Returns `[]` (constructing no adapter at all, mirroring `rename.ts`'s precedent) when nothing in
 * `concepts` links a task — so a bundle with no Story/Spec coupling never shells out to Backlog.
 *
 * @param root the repo root `backlog/config.yml` / `.lore/config.toml` / the Backlog adapter resolve
 *   against — independent of whichever docs bundle root `concepts` was loaded from.
 * @param concepts the concepts to consider (already loaded/scoped by the caller).
 * @param adapterOverride test seam; defaults to {@link defaultAdapter}.
 * @param configOverride an already-resolved-and-validated {@link ReconcileConfig} (`lore sync` passes
 *   its own, having already called {@link resolveReconcileConfig} itself for ordering reasons); when
 *   omitted, resolved (and validated) here.
 * @throws LoreError `validation` if the status flow/overrides are malformed (before any task
 *   resolution); `not_found` (exit 3) naming the first linked task id that no longer exists.
 */
export async function gatherReconciliation(
  root: string,
  concepts: Iterable<Concept>,
  adapterOverride?: BacklogAdapter,
  configOverride?: ReconcileConfig,
): Promise<ReconcileTarget[]> {
  const eligible = linkedConcepts(concepts);
  if (eligible.length === 0) {
    return [];
  }

  const { flow, overrides } = configOverride ?? resolveReconcileConfig(root);

  const adapter = adapterOverride ?? defaultAdapter(root);
  const allTaskIds = dedupeTaskIds(eligible.flatMap((e) => e.linked));
  const details = await resolveAllTasks(adapter, allTaskIds);

  return eligible.map(({ concept, linked }) => {
    const detailList = linked.map((id) => details.get(id.toLowerCase()) as BacklogTaskDetail);
    const newStatus = reconcileStatus(
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
    return { concept, newStatus, rows };
  });
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
  const results = await Promise.allSettled(taskIds.map((id) => adapter.viewTask(id)));
  const details = new Map<string, BacklogTaskDetail>();
  for (let i = 0; i < taskIds.length; i++) {
    const taskId = taskIds[i] as string;
    const result = results[i] as PromiseSettledResult<BacklogTaskDetail | null>;
    if (result.status === "rejected") {
      throw result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    }
    if (result.value === null) {
      throw new LoreError(
        "not_found",
        `task "${taskId}" does not exist`,
        "a linked concept's tasks: list must reference only live Backlog tasks — check the id, or unlink it",
        { taskId },
      );
    }
    details.set(taskId.toLowerCase(), result.value);
  }
  return details;
}
