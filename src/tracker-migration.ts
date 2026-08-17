/** Consume Quest's public, receipt-backed Backlog migration lifecycle. */

import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { QuestBacklogMigration, QuestMigrationPreview, QuestMigrationReceipt } from "./adapters/quest";
import { assertNoSymlinkInPath, ensureDir, writeFileAtomic } from "./commands/fswrite";
import { LoreError } from "./errors";

const PENDING_MIGRATION_REL_PATH = ".lore/quest-backlog-migration.pending.json";

export interface TrackerMigrationResult {
  readonly digest: string;
  readonly sourceFingerprint: string;
  readonly mappings: readonly QuestMigrationMapping[];
  readonly survivors: readonly string[];
  readonly state: "applied";
}

export interface QuestMigrationMapping {
  readonly sourceIdentifier: string;
  readonly sourceFolder: string;
  readonly targetIdentifier: string;
  readonly aliases: readonly string[];
}

/** Lore-owned crash-recovery record. It deliberately contains only public Quest receipt data. */
export interface PendingMigrationStore {
  read(root: string): QuestMigrationPreview | undefined;
  write(root: string, preview: QuestMigrationPreview): void;
  clear(root: string): void;
}

const diskPendingMigrationStore: PendingMigrationStore = {
  read(root) {
    const path = join(root, PENDING_MIGRATION_REL_PATH);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return undefined;
      throw cause;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new LoreError(
        "drift",
        "Lore's pending Quest migration record is malformed",
        "remove or repair the Lore-owned pending migration record",
      );
    }
    return pendingPreview(value);
  },
  write(root, preview) {
    ensureDir(root, ".lore");
    assertNoSymlinkInPath(root, PENDING_MIGRATION_REL_PATH);
    writeFileAtomic(join(root, PENDING_MIGRATION_REL_PATH), `${JSON.stringify(preview)}\n`, PENDING_MIGRATION_REL_PATH);
  },
  clear(root) {
    const path = join(root, PENDING_MIGRATION_REL_PATH);
    assertNoSymlinkInPath(root, PENDING_MIGRATION_REL_PATH);
    try {
      unlinkSync(path);
    } catch (cause) {
      if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT")) throw cause;
    }
  },
};

/** Clear the recovery record only after the caller has persisted the Quest backend selection. */
export function clearPendingQuestMigration(
  root: string,
  store: PendingMigrationStore = diskPendingMigrationStore,
): void {
  store.clear(root);
}

/**
 * Preview, approve, then verify Quest's own migration receipt. Lore never copies tasks,
 * assigns ids, or reads Quest storage; it only consumes versioned CLI envelopes.
 */
export async function migrateBacklogTasksToQuest(
  migration: QuestBacklogMigration,
  source: string,
  store: PendingMigrationStore = diskPendingMigrationStore,
): Promise<TrackerMigrationResult> {
  const pending = store.read(source);
  if (pending !== undefined) {
    const receipt = await migration.status(pending.digest);
    assertReceipt(pending, receipt);
    return result(receipt);
  }
  const preview = await migration.preview(source);
  assertPreview(preview);
  // This must precede apply: a process crash cannot make Lore forget the approved digest.
  store.write(source, preview);
  const receipt = await migration.apply(source, preview.digest);
  assertReceipt(preview, receipt);
  return result(receipt);
}

function result(receipt: QuestMigrationReceipt): TrackerMigrationResult {
  return {
    digest: receipt.digest,
    sourceFingerprint: receipt.sourceFingerprint,
    mappings: receipt.mappings,
    survivors: receipt.survivors,
    state: "applied",
  };
}

function pendingPreview(value: unknown): QuestMigrationPreview {
  if (typeof value !== "object" || value === null)
    throw new LoreError("drift", "Lore's pending Quest migration record is invalid");
  const preview = value as Partial<QuestMigrationPreview>;
  if (
    typeof preview.sourceFingerprint !== "string" ||
    typeof preview.digest !== "string" ||
    preview.requiresApproval !== true ||
    !Array.isArray(preview.mappings)
  )
    throw new LoreError("drift", "Lore's pending Quest migration record is invalid");
  return preview as QuestMigrationPreview;
}

function assertPreview(preview: QuestMigrationPreview): void {
  if (!preview.requiresApproval || (preview.mappings.length === 0 && preview.digest === ""))
    throw new LoreError("drift", "Quest returned an invalid Backlog migration preview", "Quest 0.2.2 is required");
}

function assertReceipt(preview: QuestMigrationPreview, receipt: QuestMigrationReceipt): void {
  if (receipt.state !== "applied")
    throw new LoreError(
      "conflict",
      `Quest migration ${receipt.digest} did not reach applied state`,
      "do not switch tracker backends; inspect the Quest migration receipt",
      { digest: receipt.digest, state: receipt.state },
    );
  if (receipt.digest !== preview.digest || receipt.sourceFingerprint !== preview.sourceFingerprint)
    throw new LoreError(
      "drift",
      "Quest migration receipt does not match the reviewed preview",
      "do not switch tracker backends; preview the Backlog migration again",
      { previewDigest: preview.digest, receiptDigest: receipt.digest },
    );
  if (!sameMappings(preview.mappings, receipt.mappings))
    throw new LoreError(
      "drift",
      "Quest migration receipt mappings do not match the reviewed preview",
      "do not switch tracker backends; preview the Backlog migration again",
      { digest: preview.digest },
    );
}

function sameMappings(left: readonly QuestMigrationMapping[], right: readonly QuestMigrationMapping[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
