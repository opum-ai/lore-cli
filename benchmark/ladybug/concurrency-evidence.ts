/** Sanitized evidence contract emitted only by the real-process concurrency qualification tests. */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../../src/core/ladybug-native";
import { LADYBUG_CACHE_REL_ROOT } from "../../src/core/ladybug-source";
import { VERSION } from "../../src/meta";
import type { BenchmarkSourceSnapshot } from "./accounting";
import type { LadybugConcurrencyPausePoint } from "./concurrency-protocol";

export const LADYBUG_CONCURRENCY_EVIDENCE_SCHEMA = "lore.ladybug-concurrency-evidence/1";
export const LADYBUG_CONCURRENCY_EVIDENCE_SCENARIOS = [
  "multi-reader-publication",
  "writer-race-live-lock",
  "crash-recovery",
] as const;
export const LADYBUG_CONCURRENCY_EVIDENCE_KILL_POINTS = [
  "after-database-close",
  "after-control-manifest-fsync",
  "after-atomic-rename",
  "before-lock-release",
] as const satisfies readonly LadybugConcurrencyPausePoint[];

export type LadybugConcurrencyEvidenceScenario = (typeof LADYBUG_CONCURRENCY_EVIDENCE_SCENARIOS)[number];

export interface LadybugConcurrencyEvidenceRecord {
  readonly scenario: LadybugConcurrencyEvidenceScenario;
  readonly checkpoint: LadybugConcurrencyPausePoint | null;
  readonly sourceBefore: BenchmarkSourceSnapshot;
  readonly sourceAfter: BenchmarkSourceSnapshot;
  readonly cache: BenchmarkSourceSnapshot;
  readonly generationCount: number;
  readonly deterministicResultDigest: string;
  readonly recoveryOutcome: "built" | "reused" | "not-applicable";
  readonly nativeConflict: "same-file-conflict" | "read-write-compatible" | null;
  readonly cacheContained: true;
  readonly stagingAbsent: true;
  readonly writerLockAbsent: true;
  scratchRemoved: boolean;
}

export interface LadybugConcurrencyEvidenceReport {
  readonly schema: typeof LADYBUG_CONCURRENCY_EVIDENCE_SCHEMA;
  readonly generatedAt: string;
  readonly toolchain: {
    readonly lore: string;
    readonly bun: string;
    readonly ladybug: string;
    readonly storage: string;
  };
  readonly host: { readonly platform: NodeJS.Platform; readonly arch: string };
  readonly repository: { readonly commit: string | null; readonly dirty: boolean };
  readonly coverage: {
    readonly simultaneousReaderProcesses: 8;
    readonly longRunningProcessConnections: 4;
    readonly oldGenerationReaderDuringPublication: true;
    readonly missingGenerationWriterRace: true;
    readonly liveWriterLock: true;
    readonly stableRedactedDiagnostics: true;
    readonly killPoints: readonly LadybugConcurrencyPausePoint[];
  };
  readonly records: readonly LadybugConcurrencyEvidenceRecord[];
  readonly status: "pass";
}

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const SnapshotSchema = z.strictObject({
  digest: Sha256Schema,
  byteLength: z.number().int().nonnegative(),
  entries: z.array(
    z.strictObject({ path: z.string(), byteLength: z.number().int().nonnegative(), digest: Sha256Schema }),
  ),
});
const RecordSchema = z.strictObject({
  scenario: z.enum(LADYBUG_CONCURRENCY_EVIDENCE_SCENARIOS),
  checkpoint: z.enum(LADYBUG_CONCURRENCY_EVIDENCE_KILL_POINTS).nullable(),
  sourceBefore: SnapshotSchema,
  sourceAfter: SnapshotSchema,
  cache: SnapshotSchema,
  generationCount: z.number().int().positive(),
  deterministicResultDigest: Sha256Schema,
  recoveryOutcome: z.enum(["built", "reused", "not-applicable"]),
  nativeConflict: z.enum(["same-file-conflict", "read-write-compatible"]).nullable(),
  cacheContained: z.literal(true),
  stagingAbsent: z.literal(true),
  writerLockAbsent: z.literal(true),
  scratchRemoved: z.literal(true),
});

export const LadybugConcurrencyEvidenceReportSchema = z.strictObject({
  schema: z.literal(LADYBUG_CONCURRENCY_EVIDENCE_SCHEMA),
  generatedAt: z.iso.datetime({ offset: true }),
  toolchain: z.strictObject({
    lore: z.string().min(1),
    bun: z.string().min(1),
    ladybug: z.literal(EXPECTED_LADYBUG_VERSION),
    storage: z.literal(EXPECTED_LADYBUG_STORAGE_VERSION),
  }),
  host: z.strictObject({ platform: z.string().min(1), arch: z.string().min(1) }),
  repository: z.strictObject({
    commit: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .nullable(),
    dirty: z.boolean(),
  }),
  coverage: z.strictObject({
    simultaneousReaderProcesses: z.literal(8),
    longRunningProcessConnections: z.literal(4),
    oldGenerationReaderDuringPublication: z.literal(true),
    missingGenerationWriterRace: z.literal(true),
    liveWriterLock: z.literal(true),
    stableRedactedDiagnostics: z.literal(true),
    killPoints: z.tuple([
      z.literal("after-database-close"),
      z.literal("after-control-manifest-fsync"),
      z.literal("after-atomic-rename"),
      z.literal("before-lock-release"),
    ]),
  }),
  records: z.array(RecordSchema).length(6),
  status: z.literal("pass"),
});

export function createLadybugConcurrencyEvidenceReport(
  records: readonly LadybugConcurrencyEvidenceRecord[],
  repository = repositoryFacts(),
): LadybugConcurrencyEvidenceReport {
  const scenarios = records.map((record) => record.scenario);
  if (scenarios.filter((scenario) => scenario === "multi-reader-publication").length !== 1) {
    throw new Error("concurrency evidence requires exactly one multi-reader publication record");
  }
  if (scenarios.filter((scenario) => scenario === "writer-race-live-lock").length !== 1) {
    throw new Error("concurrency evidence requires exactly one writer-race/live-lock record");
  }
  const crashRecords = records.filter((record) => record.scenario === "crash-recovery");
  if (
    JSON.stringify(crashRecords.map((record) => record.checkpoint)) !==
    JSON.stringify(LADYBUG_CONCURRENCY_EVIDENCE_KILL_POINTS)
  ) {
    throw new Error("concurrency evidence does not cover every ordered writer kill point");
  }
  for (const record of records) {
    if (record.sourceBefore.digest !== record.sourceAfter.digest) {
      throw new Error(`concurrency evidence source inventory changed during ${record.scenario}`);
    }
    if (!record.scratchRemoved) throw new Error(`concurrency evidence scratch remained after ${record.scenario}`);
  }
  const report: LadybugConcurrencyEvidenceReport = {
    schema: LADYBUG_CONCURRENCY_EVIDENCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    toolchain: {
      lore: VERSION,
      bun: Bun.version,
      ladybug: EXPECTED_LADYBUG_VERSION,
      storage: EXPECTED_LADYBUG_STORAGE_VERSION,
    },
    host: { platform: process.platform, arch: process.arch },
    repository,
    coverage: {
      simultaneousReaderProcesses: 8,
      longRunningProcessConnections: 4,
      oldGenerationReaderDuringPublication: true,
      missingGenerationWriterRace: true,
      liveWriterLock: true,
      stableRedactedDiagnostics: true,
      killPoints: LADYBUG_CONCURRENCY_EVIDENCE_KILL_POINTS,
    },
    records: [...records],
    status: "pass",
  };
  return parseLadybugConcurrencyEvidenceReport(report);
}

export function parseLadybugConcurrencyEvidenceReport(value: unknown): LadybugConcurrencyEvidenceReport {
  const report = LadybugConcurrencyEvidenceReportSchema.parse(value) as LadybugConcurrencyEvidenceReport;
  if (report.records.some((record) => record.sourceBefore.digest !== record.sourceAfter.digest)) {
    throw new Error("concurrency evidence contains a changed source inventory");
  }
  return report;
}

export function writeLadybugConcurrencyEvidenceReport(path: string, report: LadybugConcurrencyEvidenceReport): void {
  parseLadybugConcurrencyEvidenceReport(report);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}

export function sanitizedSnapshot(snapshot: BenchmarkSourceSnapshot): BenchmarkSourceSnapshot {
  return {
    digest: snapshot.digest,
    byteLength: snapshot.byteLength,
    entries: snapshot.entries.map((entry) => ({
      path: sanitizedInventoryPath(entry.path),
      byteLength: entry.byteLength,
      digest: entry.digest,
    })),
  };
}

export const LADYBUG_CONCURRENCY_CACHE_ROOT = LADYBUG_CACHE_REL_ROOT;

function sanitizedInventoryPath(path: string): string {
  if (path.startsWith("generations/")) {
    return `generations/<generation>/${path.split("/").slice(2).join("/")}`;
  }
  if (path.startsWith(".stale-lock-")) return ".stale-lock-<owner>";
  return path;
}

function repositoryFacts(): LadybugConcurrencyEvidenceReport["repository"] {
  const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "ignore" });
  const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  return {
    commit: commit.exitCode === 0 ? commit.stdout.toString().trim() || null : null,
    dirty: status.exitCode !== 0 || status.stdout.toString().trim().length > 0,
  };
}
