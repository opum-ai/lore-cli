/** Consume Quest's public, receipt-backed Backlog migration lifecycle. */

import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  MIN_QUEST_VERSION,
  type QuestBacklogMigration,
  type QuestBacklogMigrationOptions,
  type QuestMigrationPreview,
  type QuestMigrationReceipt,
} from "./adapters/quest";
import { assertNoSymlinkInPath, ensureDir, writeFileAtomic } from "./commands/fswrite";
import { LoreError } from "./errors";

const PENDING_MIGRATION_REL_PATH = ".lore/quest-backlog-migration.pending.json";

export interface TrackerMigrationResult {
  readonly digest: string;
  readonly sourceFingerprint: string;
  readonly mappings: readonly QuestMigrationMapping[];
  readonly survivors: readonly string[];
  readonly taskFingerprints: Readonly<Record<string, string>>;
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
    assertNoSymlinkInPath(root, PENDING_MIGRATION_REL_PATH);
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
  migrationOptions?: QuestBacklogMigrationOptions,
): Promise<TrackerMigrationResult> {
  const pending = store.read(source);
  if (pending !== undefined) {
    let receipt: QuestMigrationReceipt;
    try {
      receipt = await migration.status(pending.digest);
    } catch (cause) {
      if (!(cause instanceof LoreError) || cause.type !== "not_found") throw cause;
      // The process may have stopped (or an older artifact may have rejected the argv) after Lore
      // durably recorded the preview but before Quest created its receipt. Reapply the SAME reviewed
      // digest: Quest revalidates the current source fingerprint before its first write. Quest's own
      // contract (LCLI-465) requires preserveSourceIds/sourceFamily to be re-supplied identically to
      // apply as given to preview — Lore doesn't persist them (they're not part of the preview
      // response, only its request), so a resumed `lore init` run supplies them fresh from its own
      // CLI flags, the same way the operator would re-supply them to Quest's own CLI directly.
      receipt = await migration.apply(source, pending.digest, migrationOptions);
    }
    assertReceipt(pending, receipt);
    return result(receipt);
  }
  const preview = await migration.preview(source, migrationOptions);
  assertPreview(preview);
  // This must precede apply: a process crash cannot make Lore forget the approved digest.
  store.write(source, preview);
  const receipt = await migration.apply(source, preview.digest, migrationOptions);
  assertReceipt(preview, receipt);
  return result(receipt);
}

function result(receipt: QuestMigrationReceipt): TrackerMigrationResult {
  return {
    digest: receipt.digest,
    sourceFingerprint: receipt.sourceFingerprint,
    mappings: receipt.mappings,
    survivors: receipt.survivors,
    taskFingerprints: receipt.taskFingerprints,
    state: "applied",
  };
}

function pendingPreview(value: unknown): QuestMigrationPreview {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new LoreError("drift", "Lore's pending Quest migration record is invalid");
  const preview = value as Partial<QuestMigrationPreview>;
  if (
    typeof preview.sourceFingerprint !== "string" ||
    typeof preview.digest !== "string" ||
    preview.sourceFingerprint.length === 0 ||
    preview.digest.length === 0 ||
    preview.requiresApproval !== true ||
    !validMappings(preview.mappings)
  )
    throw new LoreError("drift", "Lore's pending Quest migration record is invalid");
  return preview as QuestMigrationPreview;
}

function assertPreview(preview: QuestMigrationPreview): void {
  if (!preview.requiresApproval || !preview.digest || !preview.sourceFingerprint || !validMappings(preview.mappings))
    throw new LoreError(
      "drift",
      "Quest returned an invalid Backlog migration preview",
      `Quest ${MIN_QUEST_VERSION} or newer is required`,
    );
}

function validMappings(value: unknown): value is readonly QuestMigrationMapping[] {
  return (
    Array.isArray(value) &&
    value.every(
      (mapping) =>
        typeof mapping === "object" &&
        mapping !== null &&
        !Array.isArray(mapping) &&
        typeof mapping.sourceIdentifier === "string" &&
        mapping.sourceIdentifier.length > 0 &&
        typeof mapping.sourceFolder === "string" &&
        mapping.sourceFolder.length > 0 &&
        typeof mapping.targetIdentifier === "string" &&
        mapping.targetIdentifier.length > 0 &&
        Array.isArray(mapping.aliases) &&
        mapping.aliases.every((alias: unknown) => typeof alias === "string" && alias.length > 0),
    )
  );
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

/**
 * Whether a Lore-owned crash-recovery record already names an approved digest for `root`.
 *
 * The wizard's collision retry (LCLI-466) asks this before offering to re-run with different
 * migration options: once a preview has been approved and recorded, {@link
 * migrateBacklogTasksToQuest} resumes by re-applying THAT digest, and Quest re-derives its plan from
 * whatever options it is handed — so a retry that changes the options against an already-recorded
 * digest could only be refused a second time, for a different and more confusing reason. The retry
 * is therefore offered only when nothing has been approved yet, which is every refusal raised by the
 * preview itself.
 */
export function hasPendingQuestMigration(
  root: string,
  store: PendingMigrationStore = diskPendingMigrationStore,
): boolean {
  return store.read(root) !== undefined;
}

/**
 * Quest's two id-collision refusals, as they are actually returned rather than as they might be
 * inferred. Both are `conflict` (exit 5); what separates them is whether an automatic fix exists.
 *
 * - `alias-collision` is Quest's refusal in its DEFAULT positional-renumbering mode. Measured
 *   against quest 0.7.1 (QCLI-256) its message names BOTH possible causes in one sentence — "If
 *   this is from positional renumbering ... --preserve-source-ids ... avoids it by keeping each
 *   record's own source id instead" and "If instead this exact id is already a live, unrelated claim
 *   in the destination workspace, --preserve-source-ids will not resolve it" — and carries no
 *   structured `input` at all. It is a human explanation of two possibilities, NOT a machine-readable
 *   statement of which one occurred: two real repros built to produce the two different causes
 *   returned the same sentence, differing only in the id it quotes. So this classification
 *   deliberately claims nothing about the cause. It says only "an automatic fix might apply".
 * - `preservation-refused` is Quest's refusal in preservation mode and is unambiguous: "No further
 *   flag resolves a remaining id collision here". It is also structured (`input.collisions` /
 *   `input.unpreservable`), so it can be acted on without reading prose.
 *
 * Which leaves exactly one reliable discriminator: Quest's own preservation-mode PREVIEW, which
 * mutates nothing. It either produces a plan — the collision was positional renumbering and the
 * retry resolves it — or returns `preservation-refused`, a genuine dual claim no flag can fix.
 * Callers must not read `alias-collision` as "preservation will fix this".
 *
 * WHEN quest-cli QCLI-322 SHIPS, DO NOT DELETE THE PREVIEW CALL IN FAVOUR OF A `cause` FIELD.
 * quest-cli confirmed (2026-09-17) that Quest CAN tell a destination claim from an internal
 * renumbering at its throw site — so a structured cause is coming — and argued against relying on
 * it here, for a reason that outlives the field: that discriminator is necessary but NOT sufficient
 * for "preservation would resolve it". Preservation can independently refuse on an unpreservable
 * record (unresolvable parent) or on preserved ids that collide among themselves, so a cause
 * derived from the discriminator alone can promise a retry that then refuses — the exact failure
 * QCLI-256 exists to prevent, in a new costume. Only computing the preservation outcome answers it,
 * which is what asking the preview does. A `cause` field may improve the PROMPT COPY (naming the
 * likely cause before asking); it must never replace the preview as the authority on whether the
 * retry can succeed.
 */
export type MigrationCollision =
  | { readonly kind: "alias-collision"; readonly message: string; readonly sourceFamilyHint?: string }
  | { readonly kind: "preservation-refused"; readonly message: string; readonly input?: unknown };

/** Classify a failed migration; `undefined` for anything that is not one of Quest's id-collision refusals. */
export function classifyMigrationCollision(cause: unknown): MigrationCollision | undefined {
  if (!(cause instanceof LoreError) || cause.type !== "conflict") return undefined;
  if (/id preservation refused/i.test(cause.message) || hasCollisionReport(cause.input))
    return { kind: "preservation-refused", message: cause.message, input: cause.input };
  if (/alias collision/i.test(cause.message))
    return { kind: "alias-collision", message: cause.message, sourceFamilyHint: familyHint(cause.message) };
  return undefined;
}

/** Quest's itemized preservation-mode report: id collisions it cannot resolve, and unpreservable source ids. */
function hasCollisionReport(input: unknown): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const report = input as { collisions?: unknown; unpreservable?: unknown };
  return (
    (Array.isArray(report.collisions) && report.collisions.length > 0) ||
    (Array.isArray(report.unpreservable) && report.unpreservable.length > 0)
  );
}

/**
 * A SUGGESTED id family, read out of the quoted id in Quest's refusal (`Alias collision: "TASK-2"
 * conflicts with "TASK-2"`). It is offered as a prompt default the operator can overtype, never as a
 * decision: when the pattern does not match, nothing changes except that the operator is asked with
 * no default filled in. That keeps the prose-reading confined to a convenience.
 */
function familyHint(message: string): string | undefined {
  return /["'`]([A-Za-z][A-Za-z0-9_]*)-\d/.exec(message)?.[1];
}
