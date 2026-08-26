/**
 * cutover-state.ts — durable phase markers for the coordinated Backlog→Quest cutover
 * (LCLI-333.1 / ODOC-63.3 L1). Split from `tracker-cutover.ts` so the adoption command
 * (`commands/backlog.ts`) can refuse standalone applies while a cutover is mid-flight without
 * creating an import cycle with the coordinator that drives the adoption legs.
 */

import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { assertNoSymlinkInPath, ensureDir, writeFileAtomic } from "./commands/fswrite";
import { LoreError } from "./errors";

/** The schema of a persisted cutover plan. */
export const CUTOVER_SCHEMA = "lore-tracker-cutover/1";
const CUTOVER_DIR = ".lore/cutover";

/**
 * The phases a coordinated cutover passes through, each durably recorded BEFORE the next begins:
 *
 * - `planned`: Quest migration + knowledge-adoption previews recorded, NOTHING selected.
 * - `legs-applied`: the Quest receipt and the adoption ledger both verified applied.
 * - `archived`: `backlog/` verified-archived into ignored evidence and deleted.
 * - `done`: `[tracker].backend = "quest"` persisted and recovery records cleared.
 */
export type CutoverPhase = "planned" | "legs-applied" | "archived" | "done";

/** A durably recorded coordinated cutover plan (public receipt digests only). */
export interface CutoverPlan {
  readonly schema: typeof CUTOVER_SCHEMA;
  phase: CutoverPhase;
  /** The Quest migration digest + source fingerprint this cutover is bound to. */
  quest: { digest: string; sourceFingerprint: string };
  /** Present only when the cutover carries a knowledge-adoption leg. */
  adoption?: { manifestPath: string; approvalDigest: string; manifestDigest: string };
  /** Set after the archive-and-delete leg verifies; mirrors {@link ArchiveEvidence}. */
  archive?: { zipRel: string; zipSha256: string; inventoryRel: string; entryCount: number };
}

/** Disk persistence for {@link CutoverPlan}, mirroring the pending-migration store's atomicity. */
export interface CutoverPlanStore {
  read(root: string): CutoverPlan | undefined;
  write(root: string, plan: CutoverPlan): void;
  clear(root: string): void;
}

function markerRel(): string {
  // One active cutover per bundle: a fixed marker path, not per-digest, so a half-finished run can
  // never be orphaned under a renamed digest directory.
  return `${CUTOVER_DIR}/state.json`;
}

export const diskCutoverPlanStore: CutoverPlanStore = {
  read(root) {
    const rel = markerRel();
    assertNoSymlinkInPath(root, rel);
    let raw: string;
    try {
      raw = readFileSync(join(root, rel), "utf8");
    } catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return undefined;
      throw cause;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new LoreError("drift", "Lore's cutover record is malformed", "remove or repair .lore/cutover/state.json");
    }
    return cutoverPlan(value);
  },
  write(root, plan) {
    ensureDir(root, CUTOVER_DIR);
    const rel = markerRel();
    assertNoSymlinkInPath(root, rel);
    writeFileAtomic(join(root, rel), `${JSON.stringify(plan, null, 2)}\n`, rel);
  },
  clear(root) {
    const rel = markerRel();
    assertNoSymlinkInPath(root, rel);
    try {
      unlinkSync(join(root, rel));
    } catch (cause) {
      if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT")) throw cause;
    }
  },
};

/**
 * Refuse standalone Backlog adoption mutations while a coordinated cutover is mid-flight: applying
 * knowledge adoption outside the cutover's ordered legs could strand one leg applied and the other
 * not (the exact partial-selection state LCLI-333.1 forbids). A settled (`done`) cutover — or no
 * marker at all — leaves every standalone adoption path unchanged.
 */
export function assertNoPendingCutover(root: string, store: CutoverPlanStore = diskCutoverPlanStore): void {
  const plan = store.read(root);
  if (plan !== undefined && plan.phase !== "done") {
    throw new LoreError(
      "validation",
      `a coordinated Backlog-to-Quest cutover is mid-flight (phase ${plan.phase})`,
      "resume the cutover via `lore init --tracker quest --migrate-backlog --adopt-manifest <path>`; standalone `lore backlog adopt` stays locked until it settles",
      { phase: plan.phase, questDigest: plan.quest.digest },
    );
  }
}

function cutoverPlan(value: unknown): CutoverPlan {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new LoreError("drift", "Lore's cutover record is invalid");
  const p = value as Partial<CutoverPlan>;
  if (
    p.schema !== CUTOVER_SCHEMA ||
    !["planned", "legs-applied", "archived", "done"].includes(p.phase ?? "") ||
    typeof p.quest?.digest !== "string" ||
    p.quest.digest.length === 0 ||
    typeof p.quest.sourceFingerprint !== "string" ||
    p.quest.sourceFingerprint.length === 0
  ) {
    throw new LoreError("drift", "Lore's cutover record is invalid");
  }
  if (
    p.adoption !== undefined &&
    (typeof p.adoption.manifestPath !== "string" ||
      typeof p.adoption.approvalDigest !== "string" ||
      typeof p.adoption.manifestDigest !== "string")
  ) {
    throw new LoreError("drift", "Lore's cutover record is invalid");
  }
  return p as CutoverPlan;
}
