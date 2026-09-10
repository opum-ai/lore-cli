/**
 * tracker-cutover.ts — the coordinated Backlog→Quest cutover coordinator (LCLI-333.1 / ODOC-63.3
 * L1, outcomes 3–5). Binds the two independent migration legs — Quest's public task migration and
 * Lore's knowledge adoption — into one ordered, durably-checkpointed, resumable sequence that
 * selects Quest ONLY after every leg verifies:
 *
 *   plan (previews recorded, nothing selected)
 *     → apply Quest migration receipt        (existing tracker-migration lifecycle)
 *     → apply knowledge-adoption ledger      (digest-bound; when a manifest was given)
 *     → verify BOTH receipts
 *     → verified archive-and-delete of backlog/
 *     → persist [tracker].backend = "quest", clear recovery records, mark done
 *
 * Every phase is persisted to `.lore/cutover/state.json` BEFORE the next begins, so a crash at any
 * point resumes from the recorded phase with prior digests re-verified — never re-run blindly,
 * never partially selected, never dual-written.
 */

import { MIN_QUEST_VERSION, type QuestBacklogMigration } from "./adapters/quest";
import { type ArchiveEvidence, archiveAndDeleteBacklog, verifyArchive, type ZipWriter } from "./backlog-archive";
import { applyKnowledgeAdoption, previewKnowledgeAdoption } from "./commands/backlog";
import { CUTOVER_SCHEMA, type CutoverPlan, type CutoverPlanStore, diskCutoverPlanStore } from "./cutover-state";
import { LoreError } from "./errors";
import {
  clearPendingQuestMigration,
  migrateBacklogTasksToQuest,
  type TrackerMigrationResult,
} from "./tracker-migration";
import { storeZipWriter } from "./zip-store";

/** Persist `[tracker].backend` without reserializing config — injected to avoid an init.ts cycle. */
export type TrackerBackendPersister = (root: string) => void;

/** Dependencies of {@link planCutover}/{@link applyCutover}; all injectable for tests. */
export interface CutoverDeps {
  readonly root: string;
  /** The Quest public migration client (`createQuestBacklogMigration`). */
  readonly migration: QuestBacklogMigration;
  /** Optional knowledge-adoption manifest path (repo-relative); absent = migration-only cutover. */
  readonly adoptManifest?: string;
  /** The adoption approval digest binding the adoption leg; required with `adoptManifest`. */
  readonly approvalDigest?: string;
  /** Persists the quest backend selection (the final, irreversible step). */
  readonly persistQuestBackend: TrackerBackendPersister;
  readonly store?: CutoverPlanStore;
  readonly zip?: ZipWriter;
}

/**
 * Record both leg previews WITHOUT selecting anything: the Quest migration preview digest and (when
 * requested) the adoption approval/manifest digests. Idempotent — an existing non-done plan returns
 * as-is so a crashed plan phase can be retried safely.
 */
export async function planCutover(deps: CutoverDeps): Promise<CutoverPlan> {
  const store = deps.store ?? diskCutoverPlanStore;
  const existing = store.read(deps.root);
  if (existing !== undefined && existing.phase !== "done") return existing;
  const preview = await deps.migration.preview(deps.root);
  if (!preview.requiresApproval || !preview.digest || !preview.sourceFingerprint)
    throw new LoreError(
      "drift",
      "Quest returned an invalid Backlog migration preview",
      `Quest ${MIN_QUEST_VERSION} or newer is required`,
    );
  const adoption =
    deps.adoptManifest !== undefined
      ? (() => {
          const approvalDigest = deps.approvalDigest;
          if (approvalDigest === undefined)
            throw new LoreError(
              "validation",
              "--adopt-manifest requires its previewed --approval-digest",
              "run `lore backlog adopt preview --manifest <path>` first and pass its exact digest",
            );
          // Bind the CURRENT normalized preview: recomputing here proves the manifest still hashes
          // to the same approval digest the caller reviewed.
          const { plan, approval } = previewKnowledgeAdoption(deps.root, deps.adoptManifest);
          if (approval.approval.digest !== approvalDigest)
            throw new LoreError(
              "conflict",
              "adoption manifest no longer matches the supplied approval digest",
              "re-run the adoption preview and pass its current digest",
              { expected: approvalDigest, actual: approval.approval.digest },
            );
          return { manifestPath: deps.adoptManifest, approvalDigest, manifestDigest: plan.manifestDigest };
        })()
      : undefined;
  const plan: CutoverPlan = {
    schema: CUTOVER_SCHEMA,
    phase: "planned",
    quest: { digest: preview.digest, sourceFingerprint: preview.sourceFingerprint },
    ...(adoption !== undefined ? { adoption } : {}),
  };
  store.write(deps.root, plan);
  return plan;
}

/**
 * Drive the ordered cutover to completion from wherever the durable markers say it stopped. Each
 * step re-verifies prior digests before proceeding; `[tracker].backend` changes only after BOTH
 * legs verify AND `backlog/` is verified-archived-and-deleted.
 */
export async function applyCutover(deps: CutoverDeps): Promise<CutoverPlan> {
  const store = deps.store ?? diskCutoverPlanStore;
  // Settled cutover: a verified no-op — never re-preview, re-archive, or re-select.
  const settled = store.read(deps.root);
  if (settled?.phase === "done") return settled;
  // Resume coherence: a stored non-done plan must not be silently continued with DIFFERENT leg
  // arguments — the recorded adoption binding is what was reviewed, and nothing else.
  if (settled !== undefined) {
    if ((deps.adoptManifest ?? undefined) !== (settled.adoption?.manifestPath ?? undefined))
      throw new LoreError(
        "conflict",
        "the pending cutover was planned with a different --adopt-manifest",
        "resume with the exact manifest recorded in .lore/cutover/state.json, or resolve the pending cutover first",
        { recorded: settled.adoption?.manifestPath ?? null, supplied: deps.adoptManifest ?? null },
      );
    if (
      deps.adoptManifest !== undefined &&
      deps.approvalDigest !== undefined &&
      settled.adoption !== undefined &&
      deps.approvalDigest !== settled.adoption.approvalDigest
    )
      throw new LoreError(
        "conflict",
        "the supplied approval digest does not match the pending cutover's recorded adoption digest",
        "resume with the exact digest recorded in .lore/cutover/state.json",
        { recorded: settled.adoption.approvalDigest, supplied: deps.approvalDigest },
      );
  }
  let plan: CutoverPlan = await planCutover(deps);

  // Leg 1 — Quest task migration (resumable via its own pending-preview record).
  if (plan.phase === "planned") {
    const result: TrackerMigrationResult = await migrateBacklogTasksToQuest(deps.migration, deps.root);
    if (result.digest !== plan.quest.digest || result.sourceFingerprint !== plan.quest.sourceFingerprint)
      throw new LoreError(
        "drift",
        "applied Quest migration does not match the planned cutover digest",
        "do not switch tracker backends; inspect the cutover record and Quest receipt",
        { planned: plan.quest.digest, applied: result.digest },
      );
    plan = { ...plan, phase: "legs-applied" };
    store.write(deps.root, plan);
  }

  // Leg 2 — knowledge adoption, digest-bound to the plan. Any failure (including a
  // BlockedAdoptionError from partially-compensated writes) refuses BEFORE archiving or selecting
  // Quest; the durable phase marker stays `legs-applied` so a fixed cause resumes cleanly.
  if (plan.phase === "legs-applied" && plan.adoption !== undefined) {
    applyKnowledgeAdoption(deps.root, plan.adoption.manifestPath, plan.adoption.approvalDigest);
  }

  // Verify both legs before anything irreversible.
  if (plan.phase === "legs-applied") {
    const receipt = await deps.migration.status(plan.quest.digest);
    if (receipt.state !== "applied" || receipt.sourceFingerprint !== plan.quest.sourceFingerprint)
      throw new LoreError(
        "drift",
        "Quest migration receipt failed final verification",
        "do not switch tracker backends; inspect the Quest receipt",
        { digest: plan.quest.digest },
      );
  }

  // Archive-and-delete — only ever reached with both legs applied+verified.
  if (plan.phase === "legs-applied") {
    const zip = requireZip(deps);
    const evidence: ArchiveEvidence = archiveAndDeleteBacklog(
      deps.root,
      zip,
      plan.quest.digest.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24) || "cutover",
    );
    verifyArchive(deps.root, evidence, zip);
    const archived: CutoverPlan = {
      ...plan,
      phase: "archived",
      archive: {
        zipRel: evidence.zipRel,
        zipSha256: evidence.zipSha256,
        inventoryRel: evidence.inventoryRel,
        entryCount: evidence.entries.length,
      },
    };
    store.write(deps.root, archived);
    plan = archived;
  }

  // Final selection — the one irreversible step, last.
  if (plan.phase === "archived") {
    deps.persistQuestBackend(deps.root);
    clearPendingQuestMigration(deps.root);
    const done: CutoverPlan = { ...plan, phase: "done" };
    store.write(deps.root, done);
    return done;
  }

  return plan;
}

function requireZip(deps: CutoverDeps): ZipWriter {
  return deps.zip ?? storeZipWriter;
}
