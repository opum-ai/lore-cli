/** Consume Quest's public, receipt-backed Backlog migration lifecycle. */

import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type {
  QuestBacklogMigration,
  QuestBacklogMigrationOptions,
  QuestMigrationPreview,
  QuestMigrationReceipt,
} from "./adapters/quest";
import { assertNoSymlinkInPath, ensureDir, writeFileAtomic } from "./commands/fswrite";
import { LoreError } from "./errors";
import { VERSION } from "./meta";

const PENDING_MIGRATION_REL_PATH = ".lore/quest-backlog-migration.pending.json";

/**
 * The digest of the LAST migration this repository applied (LCLI-700). Recorded on every successful
 * apply and deliberately NOT cleared by a completed run — unlike {@link PENDING_MIGRATION_REL_PATH},
 * which a run that finishes (with or without `--remove-backlog`) clears. It is the durable HINT a
 * later rerun uses to ask Quest's own `migration backlog status` whether that migration is still
 * applied, so idempotence no longer depends on the local pending cache surviving.
 */
const APPLIED_MIGRATION_REL_PATH = ".lore/quest-backlog-migration.applied.json";

export interface TrackerMigrationResult {
  readonly digest: string;
  readonly sourceFingerprint: string;
  readonly mappings: readonly QuestMigrationMapping[];
  readonly survivors: readonly string[];
  /**
   * Records `--preserve-source-ids` left behind because they belong to a different id family than
   * the one selected for this run (LCLI-521). Always present, empty (`[]`) outside preservation mode
   * or when nothing was excluded — never `undefined` here, so a renderer can check `.length` without
   * an existence guard; the optionality lives one layer down, on Quest's own preview response (see
   * {@link QuestMigrationExcludedRecord}), because a default-mode preview omits the field entirely.
   */
  readonly excluded: readonly QuestMigrationExcludedRecord[];
  readonly taskFingerprints: Readonly<Record<string, string>>;
  readonly state: "applied";
  /**
   * LCLI-699: present as `true` ONLY when this run RECOGNISED an earlier migration's receipt and so
   * applied nothing -- the idempotent-rerun path. Absent when this run performed the migration, so
   * the field is ADDITIVE (an existing consumer is unaffected) and a new one reads
   * `alreadyApplied === true` without having to tell "absent" from "false".
   */
  readonly alreadyApplied?: boolean;
}

export interface QuestMigrationMapping {
  readonly sourceIdentifier: string;
  readonly sourceFolder: string;
  readonly targetIdentifier: string;
  readonly aliases: readonly string[];
}

/** Mirrors {@link import("./adapters/quest").QuestMigrationExcludedRecord} (LCLI-521) — see that type's doc comment for why this is `excluded`, not `survivors`. */
export interface QuestMigrationExcludedRecord {
  readonly sourceIdentifier: string;
  readonly family: string;
}

/**
 * Lore-owned migration state. The pending half is a crash-recovery CACHE — the reviewed preview,
 * written before apply and cleared once a run completes. The applied half is a durable HINT — the
 * digest of the last migration this repository applied (LCLI-700). Both hold only public Quest data.
 */
export interface PendingMigrationStore {
  read(root: string): QuestMigrationPreview | undefined;
  write(root: string, preview: QuestMigrationPreview): void;
  clear(root: string): void;
  /**
   * The last-applied migration digest (LCLI-700), or `undefined` when this repository records none.
   * It survives a completed run, which is the whole point: a rerun uses it to ask Quest whether the
   * recorded migration is still applied even after {@link clear} removed the pending cache.
   */
  readApplied(root: string): string | undefined;
  /** Record `digest` as the last-applied migration hint (LCLI-700). */
  writeApplied(root: string, digest: string): void;
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
  readApplied(root) {
    const path = join(root, APPLIED_MIGRATION_REL_PATH);
    assertNoSymlinkInPath(root, APPLIED_MIGRATION_REL_PATH);
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
        "Lore's applied Quest migration hint record is malformed",
        "remove or repair the Lore-owned applied migration hint record",
      );
    }
    return appliedHint(value);
  },
  writeApplied(root, digest) {
    ensureDir(root, ".lore");
    assertNoSymlinkInPath(root, APPLIED_MIGRATION_REL_PATH);
    writeFileAtomic(
      join(root, APPLIED_MIGRATION_REL_PATH),
      `${JSON.stringify({ digest })}\n`,
      APPLIED_MIGRATION_REL_PATH,
    );
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
 *
 * **Idempotence keys on Quest's DURABLE STATUS, not on Lore's local record (LCLI-700).** A completed
 * migration writes a durable HINT — the digest it applied, in `store.readApplied` — and a later rerun
 * uses that hint to ask Quest `migration backlog status` whether the migration is still applied, even
 * when the pending cache was cleared by the earlier run finishing. The pending record survives only
 * as a CRASH-recovery cache, read when no hint exists; it is never the idempotence gate.
 */
export async function migrateBacklogTasksToQuest(
  migration: QuestBacklogMigration,
  source: string,
  store: PendingMigrationStore = diskPendingMigrationStore,
  migrationOptions?: QuestBacklogMigrationOptions,
): Promise<TrackerMigrationResult> {
  // LCLI-700: the durable hint (last applied digest) is preferred; the pending preview is the
  // crash-recovery fallback for a run that recorded a review but never reached a completed apply.
  const hint = store.readApplied(source);
  const pending = store.read(source);
  const recorded = hint ?? pending?.digest;

  // DEC-172 (4ap)(a): the fresh/divergence split is conditioned on Quest CONFIRMING the recorded
  // migration, NOT on the digests alone — the divergence row is "differs from a CONFIRMED hint" and the
  // fresh row is "no hint, OR an unconfirmed one", with no digest qualifier. So status(recorded) is
  // asked FIRST: an unconfirmed record (a migration rolled back in Quest, or a crashed run that never
  // reached an apply) is FRESH whatever the current digest, and only a confirmed one can diverge.
  let confirmed: { receipt: QuestMigrationReceipt; digest: string } | undefined;
  if (recorded !== undefined) {
    try {
      confirmed = { receipt: await migration.status(recorded), digest: recorded };
    } catch (cause) {
      if (!(cause instanceof LoreError) || cause.type !== "not_found") throw cause;
      confirmed = undefined;
    }
  }

  if (confirmed === undefined) {
    // FRESH — nothing is recorded here, or the recorded migration is one Quest no longer holds.
    // Preview, durably record, then apply.
    const preview = await migration.preview(source, migrationOptions);
    assertPreview(preview);
    // This must precede apply: a process crash cannot make Lore forget the approved digest.
    store.write(source, preview);
    const receipt = await migration.apply(source, preview.digest, migrationOptions);
    assertReceipt(preview, receipt);
    store.writeApplied(source, receipt.digest);
    return result(receipt, preview);
  }

  // CONFIRMED — Quest holds the recorded migration. ONE read-only preview fingerprints the CURRENT
  // source; both the digest and the fingerprint are Quest's to compute and Lore has no local way to
  // derive them, so one preview is the cost this path pays against the re-apply it avoids.
  const fresh = await migration.preview(source, migrationOptions);
  assertPreview(fresh);
  if (fresh.digest !== confirmed.digest) {
    throw divergenceError(confirmed.digest, fresh.digest);
  }
  // The recorded preview (the reviewed migration) is what supplies `excluded`; a rerun whose pending
  // cache was already cleared falls back to the fresh preview, which — because the digest matched —
  // carries the same exclusions.
  const recordedPreview = pending ?? fresh;
  // The receipt Quest returns for the recorded digest must be a valid, APPLIED receipt for the same
  // digest/fingerprint/mappings — the same guard the fresh path applies. `assertReceipt` is what
  // enforces `state === "applied"`, so a receipt still in `applying`/`failed`/`rolled-back` can
  // never be reported as a recognised applied migration or authorise the removal.
  assertReceipt(recordedPreview, confirmed.receipt);
  // Re-record the receipt's digest so a crash-recovery resume that finished here leaves the hint.
  store.writeApplied(source, confirmed.receipt.digest);
  return result(confirmed.receipt, recordedPreview, true);
}

/**
 * The named divergence refusal (LCLI-699; remedy widened under DEC-172 (4as), LCLI-700). Quest's
 * preview digest is OPTION-SENSITIVE — unchanged `backlog/` bytes migrated with different flags yield
 * a different digest — so a mismatch does not by itself mean the source changed. The remedy names BOTH
 * causes, and the rollback command carries `--actor`/`--actor-kind`, because Quest refuses an actorful
 * write without them.
 */
function divergenceError(recorded: string, current: string): LoreError {
  return new LoreError(
    "conflict",
    "the backlog has diverged from the recorded migration, so this run cannot resume it",
    "Quest's preview digest is option-sensitive, so a different digest does not by itself mean the " +
      "backlog changed: (a) if backlog/ changed since the recorded migration, restore it " +
      "(`git checkout -- backlog/`) and rerun; or (b) if THIS run's migration options differ from the " +
      "original run's, rerun with the original flags, e.g. `--preserve-source-ids --source-family " +
      "<PREFIX>`. To migrate the CHANGED backlog instead, first roll the recorded migration back in " +
      `Quest (\`quest migration backlog rollback --digest ${recorded} --actor <name> --actor-kind ` +
      "human`, or `--actor-kind delegated-agent --accountable-human <human-id>`), then rerun",
    { code: "backlog.diverged-from-migration", recorded, current },
  );
}

function result(
  receipt: QuestMigrationReceipt,
  preview: QuestMigrationPreview,
  alreadyApplied?: boolean,
): TrackerMigrationResult {
  return {
    digest: receipt.digest,
    sourceFingerprint: receipt.sourceFingerprint,
    mappings: receipt.mappings,
    survivors: receipt.survivors,
    // Preservation mode only (LCLI-521); a default-mode preview never sets this.
    excluded: preview.excluded ?? [],
    taskFingerprints: receipt.taskFingerprints,
    state: "applied",
    // Additive (LCLI-699): set only on the recognised-receipt path, so a fresh migration's shape is
    // byte-unchanged.
    ...(alreadyApplied === true ? { alreadyApplied: true } : {}),
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

/** Validate the durable applied-digest hint record (LCLI-700): a `{ digest }` object with a non-empty string. */
function appliedHint(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new LoreError("drift", "Lore's applied Quest migration hint record is invalid");
  const digest = (value as { digest?: unknown }).digest;
  if (typeof digest !== "string" || digest.length === 0)
    throw new LoreError("drift", "Lore's applied Quest migration hint record is invalid");
  return digest;
}

function assertPreview(preview: QuestMigrationPreview): void {
  if (!preview.requiresApproval || !preview.digest || !preview.sourceFingerprint || !validMappings(preview.mappings))
    throw new LoreError("drift", "Quest returned an invalid Backlog migration preview", `Quest ${VERSION} is required`);
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
 * The wizard's collision retry (LCLI-466) asked this before offering to re-run with different
 * migration options: once a preview has been approved and recorded, {@link
 * migrateBacklogTasksToQuest} resumes by re-`status`ing THAT digest (re-`apply`ing only when Quest
 * holds no receipt for it), and Quest re-derives its plan from
 * whatever options it is handed — so a retry that changes the options against an already-recorded
 * digest could only be refused a second time, for a different and more confusing reason. The retry
 * was therefore offered only when nothing had been approved yet, which is every refusal raised by
 * the preview itself.
 *
 * **DORMANT since ADR-0024 (LCLI-656), retained deliberately rather than dead by oversight.** That
 * retry was this function's only production caller, and the wizard no longer runs a migration at
 * all — it stops with the migration commands instead — so nothing in `src/` calls this today. It is
 * kept because the Jira-to-Quest offer DEC-62 option A defers would plausibly reuse the same
 * question ("is something already approved here?"), and because `test/tracker-migration.test.ts`
 * still covers it as a unit. If that offer is never built, this is a deletion candidate; nothing
 * else depends on it.
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

/**
 * Classify a failed migration; `undefined` for anything that is not one of Quest's id-collision
 * refusals.
 *
 * **DORMANT since ADR-0024 (LCLI-656), retained deliberately rather than dead by oversight.** Its
 * only production caller was the wizard's collision retry (LCLI-466), removed with the wizard's
 * migration arm — the wizard now stops with the commands instead of migrating, so `src/` has no
 * caller left. The classification survives because the Jira-to-Quest offer DEC-62 option A defers
 * would need exactly this discrimination (and the QCLI-322 note above outlives the caller), and
 * because `test/tracker-migration.test.ts` still covers it as a unit.
 */
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
