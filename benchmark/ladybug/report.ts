/** Ordered report contract and aggregation for Ladybug qualification evidence. */

import { z } from "zod";
import type { LadybugBenchmarkFixtureSpec } from "./fixture";
import {
  type BenchmarkOperation,
  BenchmarkOperationSchema,
  type BenchmarkPolicy,
  BenchmarkPolicySchema,
} from "./protocol";
import {
  type BootstrapSummary,
  type CalibrationSummary,
  type DistributionSummary,
  summarizeCalibration,
  summarizeDistribution,
  summarizePairedRatios,
} from "./statistics";

export const LADYBUG_BENCHMARK_REPORT_SCHEMA = "lore.ladybug-benchmark/1";
export const LADYBUG_BENCHMARK_CALIBRATION_CV_LIMIT = 0.1;

export type LadybugBenchmarkMode = "qualification" | "smoke" | "observation";
export type LadybugBenchmarkSamplePhase = "cold-setup" | "cold-measurement" | "parity" | "warmup" | "measurement";

export interface LadybugBenchmarkRunConfiguration {
  readonly mode: LadybugBenchmarkMode;
  readonly coldSetupRepetitions: number;
  readonly coldRepetitions: number;
  readonly warmups: number;
  readonly repetitions: number;
  readonly batches: number;
  readonly bootstrapIterations: number;
  readonly confidence: 0.95;
  readonly calibrationWarmups: number;
  readonly calibrationRepetitions: number;
  readonly calibrationCoefficientOfVariationLimit: number;
}

export interface LadybugBenchmarkRawSample {
  readonly sequence: number;
  readonly phase: LadybugBenchmarkSamplePhase;
  readonly batch: number | null;
  readonly repetition: number;
  readonly pairId: string | null;
  readonly scenarioId: string;
  readonly policy: BenchmarkPolicy;
  readonly order: readonly BenchmarkPolicy[];
  readonly resultDigest: string;
  readonly operationNanoseconds: number;
  readonly wallNanoseconds: number;
  readonly cpuMicroseconds: {
    readonly user: number;
    readonly system: number;
    readonly total: number;
  };
  readonly maxRSSBytes: number;
  readonly canonicalInputBytes: number;
  readonly emittedBytes: number;
  readonly diagnosticBytes: number;
  readonly cacheLogicalBytesBefore: number;
  readonly cacheLogicalBytesAfter: number;
  readonly sourceDigest: string;
}

export interface LadybugBenchmarkScenarioReport {
  readonly id: string;
  readonly operation: BenchmarkOperation;
}

export interface LadybugBenchmarkPolicySummary {
  readonly policy: BenchmarkPolicy;
  readonly operationNanoseconds: DistributionSummary;
  readonly wallNanoseconds: DistributionSummary;
  readonly cpuMicroseconds: DistributionSummary;
  readonly maxRSSBytes: DistributionSummary;
  readonly emittedBytes: DistributionSummary;
  readonly cacheLogicalBytesAfter: DistributionSummary;
}

export interface LadybugBenchmarkScenarioSummary {
  readonly scenarioId: string;
  readonly policies: readonly LadybugBenchmarkPolicySummary[];
  readonly paired: {
    readonly count: number;
    readonly indexedOverReferenceOperation: BootstrapSummary;
    readonly indexedOverReferenceWall: BootstrapSummary;
  };
}

export interface LadybugBenchmarkFixtureReport {
  readonly name: "small" | "large";
  readonly fixtureSchema: string;
  readonly seed: number;
  readonly digests: LadybugBenchmarkFixtureSpec["expected"];
  readonly counts: LadybugBenchmarkFixtureSpec["counts"];
  readonly canonicalInputBytes: number;
  readonly scenarios: readonly LadybugBenchmarkScenarioReport[];
  readonly samples: readonly LadybugBenchmarkRawSample[];
  readonly summaries: {
    readonly coldBuild: LadybugBenchmarkPolicySummary;
    readonly warm: readonly LadybugBenchmarkScenarioSummary[];
  };
  readonly resourceTotals: {
    readonly sampleCount: number;
    readonly cpuUserMicroseconds: number;
    readonly cpuSystemMicroseconds: number;
    readonly cpuTotalMicroseconds: number;
    readonly emittedBytes: number;
    readonly diagnosticBytes: number;
    readonly peakMaxRSSBytes: number;
    readonly peakCacheLogicalBytes: number;
  };
}

export interface LadybugBenchmarkReport {
  readonly schema: typeof LADYBUG_BENCHMARK_REPORT_SCHEMA;
  readonly generatedAt: string;
  readonly mode: LadybugBenchmarkMode;
  readonly toolchain: {
    readonly loreVersion: string;
    readonly bunVersion: string;
    readonly nodeVersion: string;
    readonly ladybugPackageVersion: string;
    readonly ladybugRuntimeVersion: string;
    readonly ladybugStorageVersion: string;
  };
  readonly host: {
    readonly platform: NodeJS.Platform;
    readonly arch: string;
    readonly osRelease: string;
    readonly runnerImage: string;
    readonly cpuModel: string;
    readonly logicalCpuCount: number;
    readonly ramBytes: number;
  };
  readonly repository: {
    readonly commit: string | null;
    readonly dirty: boolean;
  };
  readonly configuration: LadybugBenchmarkRunConfiguration;
  readonly calibration: {
    readonly workload: string;
    readonly warmups: number;
    readonly samplesNanoseconds: readonly number[];
    readonly statistics: CalibrationSummary;
    readonly status: "pass" | "inconclusive";
    readonly reasons: readonly string[];
  };
  readonly fixtures: readonly LadybugBenchmarkFixtureReport[];
  readonly gates: {
    readonly source: {
      readonly schema: string;
      readonly approvedTask: string;
      readonly approvedPlanItem: number;
      readonly approvedAt: string;
      readonly digest: string;
    };
    readonly definitions: readonly LadybugBenchmarkGateDefinition[];
    readonly results: readonly LadybugBenchmarkGateResult[];
    readonly evaluation: {
      readonly status: "pass" | "fail" | "inconclusive";
      readonly reasons: readonly string[];
    };
  };
}

export interface LadybugBenchmarkGateDefinition {
  readonly id: string;
  readonly fixture: "small" | "large";
  readonly scenarioId: string;
  readonly policy: "indexed" | "paired";
  readonly metric: string;
  readonly statistic: string;
  readonly comparator: "at-most" | "at-least";
  readonly threshold: number;
  readonly unit: string;
  readonly sourceRule: string;
}

export interface LadybugBenchmarkGateResult {
  readonly id: string;
  readonly observed: number;
  readonly status: "pass" | "fail" | "inconclusive";
  readonly reason: string;
}

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const NonNegativeFiniteSchema = z.number().finite().nonnegative();
const PositiveIntegerSchema = z.number().int().positive();
const DistributionSummarySchema = z.strictObject({
  count: PositiveIntegerSchema,
  median: NonNegativeFiniteSchema,
  p95: NonNegativeFiniteSchema,
  mad: NonNegativeFiniteSchema,
  max: NonNegativeFiniteSchema,
});
const BootstrapSummarySchema = DistributionSummarySchema.extend({
  upperOneSided95: NonNegativeFiniteSchema,
});
const PolicySummarySchema = z.strictObject({
  policy: BenchmarkPolicySchema,
  operationNanoseconds: DistributionSummarySchema,
  wallNanoseconds: DistributionSummarySchema,
  cpuMicroseconds: DistributionSummarySchema,
  maxRSSBytes: DistributionSummarySchema,
  emittedBytes: DistributionSummarySchema,
  cacheLogicalBytesAfter: DistributionSummarySchema,
});
const RawSampleSchema = z.strictObject({
  sequence: z.number().int().nonnegative(),
  phase: z.enum(["cold-setup", "cold-measurement", "parity", "warmup", "measurement"]),
  batch: z.number().int().nonnegative().nullable(),
  repetition: z.number().int().nonnegative(),
  pairId: z.string().min(1).nullable(),
  scenarioId: z.string().min(1),
  policy: BenchmarkPolicySchema,
  order: z.array(BenchmarkPolicySchema).min(1).max(2),
  resultDigest: Sha256Schema,
  operationNanoseconds: NonNegativeFiniteSchema,
  wallNanoseconds: NonNegativeFiniteSchema,
  cpuMicroseconds: z.strictObject({
    user: NonNegativeFiniteSchema,
    system: NonNegativeFiniteSchema,
    total: NonNegativeFiniteSchema,
  }),
  maxRSSBytes: NonNegativeFiniteSchema,
  canonicalInputBytes: NonNegativeFiniteSchema,
  emittedBytes: NonNegativeFiniteSchema,
  diagnosticBytes: NonNegativeFiniteSchema,
  cacheLogicalBytesBefore: NonNegativeFiniteSchema,
  cacheLogicalBytesAfter: NonNegativeFiniteSchema,
  sourceDigest: Sha256Schema,
});

export const LadybugBenchmarkReportSchema = z.strictObject({
  schema: z.literal(LADYBUG_BENCHMARK_REPORT_SCHEMA),
  generatedAt: z.iso.datetime({ offset: true }),
  mode: z.enum(["qualification", "smoke", "observation"]),
  toolchain: z.strictObject({
    loreVersion: z.string().min(1),
    bunVersion: z.string().min(1),
    nodeVersion: z.string().min(1),
    ladybugPackageVersion: z.string().min(1),
    ladybugRuntimeVersion: z.string().min(1),
    ladybugStorageVersion: z.string().min(1),
  }),
  host: z.strictObject({
    platform: z.string().min(1),
    arch: z.string().min(1),
    osRelease: z.string().min(1),
    runnerImage: z.string().min(1),
    cpuModel: z.string().min(1),
    logicalCpuCount: PositiveIntegerSchema,
    ramBytes: PositiveIntegerSchema,
  }),
  repository: z.strictObject({
    commit: Sha256Schema.or(z.string().regex(/^[0-9a-f]{40}$/)).nullable(),
    dirty: z.boolean(),
  }),
  configuration: z.strictObject({
    mode: z.enum(["qualification", "smoke", "observation"]),
    coldSetupRepetitions: z.number().int().nonnegative(),
    coldRepetitions: PositiveIntegerSchema,
    warmups: z.number().int().nonnegative(),
    repetitions: PositiveIntegerSchema,
    batches: PositiveIntegerSchema,
    bootstrapIterations: PositiveIntegerSchema,
    confidence: z.literal(0.95),
    calibrationWarmups: z.number().int().nonnegative(),
    calibrationRepetitions: PositiveIntegerSchema,
    calibrationCoefficientOfVariationLimit: z.number().positive().max(1),
  }),
  calibration: z.strictObject({
    workload: z.string().min(1),
    warmups: z.number().int().nonnegative(),
    samplesNanoseconds: z.array(NonNegativeFiniteSchema).min(1),
    statistics: z.strictObject({
      count: PositiveIntegerSchema,
      mean: NonNegativeFiniteSchema,
      standardDeviation: NonNegativeFiniteSchema,
      coefficientOfVariation: NonNegativeFiniteSchema,
    }),
    status: z.enum(["pass", "inconclusive"]),
    reasons: z.array(z.string().min(1)),
  }),
  fixtures: z
    .array(
      z.strictObject({
        name: z.enum(["small", "large"]),
        fixtureSchema: z.string().min(1),
        seed: PositiveIntegerSchema,
        digests: z.strictObject({
          canonicalExportSha256: Sha256Schema,
          sourceInventorySha256: Sha256Schema,
          taskSnapshotSha256: Sha256Schema,
        }),
        counts: z.strictObject({
          concepts: PositiveIntegerSchema,
          tasks: PositiveIntegerSchema,
          authoredEdges: PositiveIntegerSchema,
          markdownBodyBytes: PositiveIntegerSchema,
        }),
        canonicalInputBytes: PositiveIntegerSchema,
        scenarios: z.array(z.strictObject({ id: z.string().min(1), operation: BenchmarkOperationSchema })).min(1),
        samples: z.array(RawSampleSchema).min(1),
        summaries: z.strictObject({
          coldBuild: PolicySummarySchema,
          warm: z.array(
            z.strictObject({
              scenarioId: z.string().min(1),
              policies: z.array(PolicySummarySchema).length(2),
              paired: z.strictObject({
                count: PositiveIntegerSchema,
                indexedOverReferenceOperation: BootstrapSummarySchema,
                indexedOverReferenceWall: BootstrapSummarySchema,
              }),
            }),
          ),
        }),
        resourceTotals: z.strictObject({
          sampleCount: PositiveIntegerSchema,
          cpuUserMicroseconds: NonNegativeFiniteSchema,
          cpuSystemMicroseconds: NonNegativeFiniteSchema,
          cpuTotalMicroseconds: NonNegativeFiniteSchema,
          emittedBytes: NonNegativeFiniteSchema,
          diagnosticBytes: NonNegativeFiniteSchema,
          peakMaxRSSBytes: NonNegativeFiniteSchema,
          peakCacheLogicalBytes: NonNegativeFiniteSchema,
        }),
      }),
    )
    .min(1),
  gates: z.strictObject({
    source: z.strictObject({
      schema: z.string().min(1),
      approvedTask: z.string().min(1),
      approvedPlanItem: PositiveIntegerSchema,
      approvedAt: z.iso.date(),
      digest: Sha256Schema,
    }),
    definitions: z.array(
      z.strictObject({
        id: z.string().min(1),
        fixture: z.enum(["small", "large"]),
        scenarioId: z.string().min(1),
        policy: z.enum(["indexed", "paired"]),
        metric: z.string().min(1),
        statistic: z.string().min(1),
        comparator: z.enum(["at-most", "at-least"]),
        threshold: z.number().finite(),
        unit: z.string().min(1),
        sourceRule: z.string().min(1),
      }),
    ),
    results: z.array(
      z.strictObject({
        id: z.string().min(1),
        observed: NonNegativeFiniteSchema,
        status: z.enum(["pass", "fail", "inconclusive"]),
        reason: z.string().min(1),
      }),
    ),
    evaluation: z.strictObject({
      status: z.enum(["pass", "fail", "inconclusive"]),
      reasons: z.array(z.string().min(1)),
    }),
  }),
});

export function parseLadybugBenchmarkReport(value: unknown): LadybugBenchmarkReport {
  return LadybugBenchmarkReportSchema.parse(value) as LadybugBenchmarkReport;
}

export function calibrationReport(
  samplesNanoseconds: readonly number[],
  warmups: number,
  limit = LADYBUG_BENCHMARK_CALIBRATION_CV_LIMIT,
): LadybugBenchmarkReport["calibration"] {
  const statistics = summarizeCalibration(samplesNanoseconds);
  const reasons =
    statistics.coefficientOfVariation > limit
      ? [
          `calibration coefficient of variation ${statistics.coefficientOfVariation.toFixed(6)} exceeds ${limit.toFixed(6)}`,
        ]
      : [];
  return {
    workload: "sha256-16x-1MiB",
    warmups,
    samplesNanoseconds: [...samplesNanoseconds],
    statistics,
    status: reasons.length === 0 ? "pass" : "inconclusive",
    reasons,
  };
}

export function summarizeLadybugBenchmarkFixture(options: {
  readonly spec: LadybugBenchmarkFixtureSpec;
  readonly canonicalInputBytes: number;
  readonly scenarios: readonly LadybugBenchmarkScenarioReport[];
  readonly samples: readonly LadybugBenchmarkRawSample[];
  readonly bootstrapIterations: number;
}): LadybugBenchmarkFixtureReport {
  const cold = options.samples.filter((sample) => sample.phase === "cold-measurement");
  const warm = options.scenarios.map((scenario, scenarioIndex) => {
    const measured = options.samples.filter(
      (sample) => sample.phase === "measurement" && sample.scenarioId === scenario.id,
    );
    const pairs = pairedSamples(measured, scenario.id);
    const indexed = pairs.map((pair) => pair.indexed);
    const reference = pairs.map((pair) => pair.reference);
    return {
      scenarioId: scenario.id,
      policies: [policySummary("indexed", indexed), policySummary("reference", reference)],
      paired: {
        count: pairs.length,
        indexedOverReferenceOperation: summarizePairedRatios(
          indexed.map((sample) => sample.operationNanoseconds),
          reference.map((sample) => sample.operationNanoseconds),
          { seed: options.spec.seed ^ scenarioIndex, iterations: options.bootstrapIterations },
        ),
        indexedOverReferenceWall: summarizePairedRatios(
          indexed.map((sample) => sample.wallNanoseconds),
          reference.map((sample) => sample.wallNanoseconds),
          { seed: options.spec.seed ^ scenarioIndex ^ 0x5bd1_e995, iterations: options.bootstrapIterations },
        ),
      },
    } satisfies LadybugBenchmarkScenarioSummary;
  });
  return {
    name: options.spec.name,
    fixtureSchema: options.spec.schema,
    seed: options.spec.seed,
    digests: options.spec.expected,
    counts: options.spec.counts,
    canonicalInputBytes: options.canonicalInputBytes,
    scenarios: [...options.scenarios],
    samples: [...options.samples],
    summaries: { coldBuild: policySummary("indexed", cold), warm },
    resourceTotals: resourceTotals(options.samples),
  };
}

export function stableReportJson(report: LadybugBenchmarkReport): string {
  parseLadybugBenchmarkReport(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}

function policySummary(
  policy: BenchmarkPolicy,
  samples: readonly LadybugBenchmarkRawSample[],
): LadybugBenchmarkPolicySummary {
  if (samples.length === 0 || samples.some((sample) => sample.policy !== policy)) {
    throw new Error(`cannot summarize missing or mixed ${policy} benchmark samples`);
  }
  const invalidCpu = samples.find((sample) => !Number.isFinite(sample.cpuMicroseconds.total));
  if (invalidCpu !== undefined) {
    throw new Error(
      `cannot summarize ${policy} benchmark sample ${invalidCpu.sequence}: invalid CPU total ${String(invalidCpu.cpuMicroseconds.total)}`,
    );
  }
  return {
    policy,
    operationNanoseconds: summarizeDistribution(samples.map((sample) => sample.operationNanoseconds)),
    wallNanoseconds: summarizeDistribution(samples.map((sample) => sample.wallNanoseconds)),
    cpuMicroseconds: summarizeDistribution(samples.map((sample) => sample.cpuMicroseconds.total)),
    maxRSSBytes: summarizeDistribution(samples.map((sample) => sample.maxRSSBytes)),
    emittedBytes: summarizeDistribution(samples.map((sample) => sample.emittedBytes)),
    cacheLogicalBytesAfter: summarizeDistribution(samples.map((sample) => sample.cacheLogicalBytesAfter)),
  };
}

function pairedSamples(
  samples: readonly LadybugBenchmarkRawSample[],
  scenarioId: string,
): Array<{
  indexed: LadybugBenchmarkRawSample;
  reference: LadybugBenchmarkRawSample;
}> {
  const groups = new Map<string, LadybugBenchmarkRawSample[]>();
  for (const sample of samples) {
    if (sample.pairId === null) throw new Error(`measured scenario ${scenarioId} has an unpaired sample`);
    const group = groups.get(sample.pairId) ?? [];
    group.push(sample);
    groups.set(sample.pairId, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([pairId, group]) => {
      const indexed = group.filter((sample) => sample.policy === "indexed");
      const reference = group.filter((sample) => sample.policy === "reference");
      if (group.length !== 2 || indexed.length !== 1 || reference.length !== 1) {
        throw new Error(`measured pair ${pairId} for ${scenarioId} must contain one indexed and one reference sample`);
      }
      return { indexed: indexed[0] as LadybugBenchmarkRawSample, reference: reference[0] as LadybugBenchmarkRawSample };
    });
}

function resourceTotals(
  samples: readonly LadybugBenchmarkRawSample[],
): LadybugBenchmarkFixtureReport["resourceTotals"] {
  if (samples.length === 0) throw new Error("cannot total an empty benchmark sample set");
  return {
    sampleCount: samples.length,
    cpuUserMicroseconds: sum(samples.map((sample) => sample.cpuMicroseconds.user)),
    cpuSystemMicroseconds: sum(samples.map((sample) => sample.cpuMicroseconds.system)),
    cpuTotalMicroseconds: sum(samples.map((sample) => sample.cpuMicroseconds.total)),
    emittedBytes: sum(samples.map((sample) => sample.emittedBytes)),
    diagnosticBytes: sum(samples.map((sample) => sample.diagnosticBytes)),
    peakMaxRSSBytes: Math.max(...samples.map((sample) => sample.maxRSSBytes)),
    peakCacheLogicalBytes: Math.max(...samples.map((sample) => sample.cacheLogicalBytesAfter)),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
