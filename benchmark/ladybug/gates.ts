/** Approved plan-item-4 threshold loader and pure benchmark gate evaluation. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type {
  LadybugBenchmarkFixtureReport,
  LadybugBenchmarkGateDefinition,
  LadybugBenchmarkGateResult,
  LadybugBenchmarkMode,
  LadybugBenchmarkPolicySummary,
  LadybugBenchmarkReport,
  LadybugBenchmarkRunConfiguration,
  LadybugBenchmarkScenarioSummary,
} from "./report";

export const LADYBUG_BENCHMARK_GATE_SCHEMA = "lore.ladybug-benchmark-gates/1";
export const LADYBUG_BENCHMARK_GATE_PATH = join(import.meta.dir, "gates", "v1.json");
export const LADYBUG_BENCHMARK_GATE_DIGEST = "sha256:169cc001f5334988aacff1fa89b864b1724396aebe4865256db5635f84479a59";
export const LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT = 175;

const FixtureThresholdSchema = z.strictObject({
  coldBuildP95WallNanoseconds: z.number().int().positive(),
  warmOpenP95WallNanoseconds: z.number().int().positive(),
  coldPeakMaxRSSBytes: z.number().int().positive(),
  warmCommandPeakMaxRSSBytes: z.number().int().positive(),
  indexLogicalBytes: z.number().int().positive(),
});

const LadybugBenchmarkGateSetSchema = z.strictObject({
  schema: z.literal(LADYBUG_BENCHMARK_GATE_SCHEMA),
  approvedTask: z.literal("LCLI-283.1.4"),
  approvedPlanItem: z.literal(4),
  approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  units: z.strictObject({
    duration: z.literal("nanoseconds"),
    memory: z.literal("bytes"),
    storage: z.literal("logical-bytes"),
    ratio: z.literal("indexed-over-reference"),
  }),
  metrics: z.strictObject({
    coldBuildLatency: z.literal("wallNanoseconds.p95"),
    warmOpenLatency: z.literal("wallNanoseconds.p95"),
    warmCommandLatency: z.literal("operationNanoseconds"),
    resourcePeak: z.literal("maxRSSBytes.max"),
    indexSize: z.literal("cacheLogicalBytesAfter.max"),
    pairedRatio: z.literal("indexedOverReferenceOperation"),
  }),
  coverage: z.strictObject({
    warmCommandMemory: z.tuple([z.literal("graph"), z.literal("query"), z.literal("context")]),
    smallWarmRegression: z.tuple([
      z.literal("warm-open"),
      z.literal("graph"),
      z.literal("query"),
      z.literal("context"),
    ]),
    largeQuery: z.tuple([z.literal("query")]),
    largeGraphContext: z.tuple([z.literal("graph"), z.literal("context")]),
  }),
  absolute: z.strictObject({
    small: FixtureThresholdSchema,
    large: FixtureThresholdSchema.extend({
      indexLogicalBytesFormula: z.strictObject({
        baseBytes: z.number().int().positive(),
        canonicalInputMultiplier: z.number().int().positive(),
      }),
    }),
  }),
  relative: z.strictObject({
    largeQuery: z.strictObject({
      medianRatio: z.number().positive(),
      p95Ratio: z.number().positive(),
      upperOneSided95MedianRatio: z.number().positive(),
    }),
    largeGraphContext: z.strictObject({
      medianRatio: z.number().positive(),
      p95Ratio: z.number().positive(),
    }),
    smallWarmRegression: z.strictObject({
      medianAbsoluteNanoseconds: z.number().int().positive(),
      medianRelative: z.number().positive(),
      p95AbsoluteNanoseconds: z.number().int().positive(),
      p95Relative: z.number().positive(),
    }),
  }),
});

export type LadybugBenchmarkGateSet = z.infer<typeof LadybugBenchmarkGateSetSchema>;

export function loadLadybugBenchmarkGateSet(path = LADYBUG_BENCHMARK_GATE_PATH): LadybugBenchmarkGateSet {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  const parsed = LadybugBenchmarkGateSetSchema.parse(value);
  assertApprovedValues(parsed);
  return parsed;
}

export function evaluateLadybugBenchmarkGates(options: {
  readonly mode: LadybugBenchmarkMode;
  readonly configuration: LadybugBenchmarkRunConfiguration;
  readonly calibration: LadybugBenchmarkReport["calibration"];
  readonly fixtures: readonly LadybugBenchmarkFixtureReport[];
  readonly gateSet?: LadybugBenchmarkGateSet;
}): LadybugBenchmarkReport["gates"] {
  const gateSet = options.gateSet ?? loadLadybugBenchmarkGateSet();
  const source = gateSource(gateSet, options.gateSet === undefined);
  const observations: Array<{ definition: LadybugBenchmarkGateDefinition; observed: number }> = [];
  const inconclusiveReasons = qualificationEvidenceIssues(options);
  for (const fixture of options.fixtures) {
    addAbsoluteGates(observations, fixture, gateSet);
    if (fixture.name === "small") addSmallRegressionGates(observations, fixture, gateSet);
    else addLargeRelativeGates(observations, fixture, gateSet);
  }
  if (
    options.mode === "qualification" &&
    options.fixtures.some((fixture) => fixture.name === "small") &&
    options.fixtures.some((fixture) => fixture.name === "large") &&
    observations.length !== LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT
  ) {
    inconclusiveReasons.push(
      `expected ${LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT} approved gates but resolved ${observations.length}`,
    );
  }
  const definitions = observations.map(({ definition }) => definition);
  const results = observations.map(({ definition, observed }) =>
    evaluateObservation(definition, observed, inconclusiveReasons),
  );
  if (inconclusiveReasons.length > 0) {
    return {
      source,
      definitions,
      results,
      evaluation: { status: "inconclusive", reasons: inconclusiveReasons },
    };
  }
  const failures = results.filter((result) => result.status === "fail");
  return {
    source,
    definitions,
    results,
    evaluation:
      failures.length === 0
        ? { status: "pass", reasons: [`all ${results.length} approved quantitative gates passed`] }
        : { status: "fail", reasons: failures.map((result) => result.reason) },
  };
}

function gateSource(
  gateSet: LadybugBenchmarkGateSet,
  committedFile: boolean,
): LadybugBenchmarkReport["gates"]["source"] {
  const bytes = committedFile ? readFileSync(LADYBUG_BENCHMARK_GATE_PATH) : JSON.stringify(gateSet);
  return {
    schema: gateSet.schema,
    approvedTask: gateSet.approvedTask,
    approvedPlanItem: gateSet.approvedPlanItem,
    approvedAt: gateSet.approvedAt,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

function addAbsoluteGates(
  observations: Array<{ definition: LadybugBenchmarkGateDefinition; observed: number }>,
  fixture: LadybugBenchmarkFixtureReport,
  gateSet: LadybugBenchmarkGateSet,
): void {
  const thresholds = gateSet.absolute[fixture.name];
  add(observations, {
    id: `${fixture.name}.cold-build.wall-p95`,
    fixture: fixture.name,
    scenarioId: "projection-cold",
    policy: "indexed",
    metric: "wallNanoseconds",
    statistic: "p95",
    threshold: thresholds.coldBuildP95WallNanoseconds,
    unit: gateSet.units.duration,
    sourceRule: "absolute.coldBuildP95WallNanoseconds",
    observed: fixture.summaries.coldBuild.wallNanoseconds.p95,
  });
  add(observations, {
    id: `${fixture.name}.cold-build.max-rss`,
    fixture: fixture.name,
    scenarioId: "projection-cold",
    policy: "indexed",
    metric: "maxRSSBytes",
    statistic: "max",
    threshold: thresholds.coldPeakMaxRSSBytes,
    unit: gateSet.units.memory,
    sourceRule: "absolute.coldPeakMaxRSSBytes",
    observed: fixture.summaries.coldBuild.maxRSSBytes.max,
  });
  add(observations, {
    id: `${fixture.name}.index.logical-bytes`,
    fixture: fixture.name,
    scenarioId: "projection-cold",
    policy: "indexed",
    metric: "cacheLogicalBytesAfter",
    statistic: "max",
    threshold: thresholds.indexLogicalBytes,
    unit: gateSet.units.storage,
    sourceRule: "absolute.indexLogicalBytes",
    observed: fixture.summaries.coldBuild.cacheLogicalBytesAfter.max,
  });
  if (fixture.name === "large") {
    const largeThresholds = gateSet.absolute.large;
    add(observations, {
      id: "large.index.logical-bytes-scaled",
      fixture: "large",
      scenarioId: "projection-cold",
      policy: "indexed",
      metric: "cacheLogicalBytesAfter",
      statistic: "max",
      threshold:
        largeThresholds.indexLogicalBytesFormula.baseBytes +
        largeThresholds.indexLogicalBytesFormula.canonicalInputMultiplier * fixture.canonicalInputBytes,
      unit: gateSet.units.storage,
      sourceRule: "absolute.large.indexLogicalBytesFormula",
      observed: fixture.summaries.coldBuild.cacheLogicalBytesAfter.max,
    });
  }
  const warmOpen = requiredScenario(fixture, "warm-open");
  const indexedWarmOpen = requiredPolicy(warmOpen, "indexed");
  add(observations, {
    id: `${fixture.name}.warm-open.wall-p95`,
    fixture: fixture.name,
    scenarioId: warmOpen.scenarioId,
    policy: "indexed",
    metric: "wallNanoseconds",
    statistic: "p95",
    threshold: thresholds.warmOpenP95WallNanoseconds,
    unit: gateSet.units.duration,
    sourceRule: "absolute.warmOpenP95WallNanoseconds",
    observed: indexedWarmOpen.wallNanoseconds.p95,
  });
  for (const scenario of commandScenarios(fixture)) {
    add(observations, {
      id: `${fixture.name}.${scenario.scenarioId}.max-rss`,
      fixture: fixture.name,
      scenarioId: scenario.scenarioId,
      policy: "indexed",
      metric: "maxRSSBytes",
      statistic: "max",
      threshold: thresholds.warmCommandPeakMaxRSSBytes,
      unit: gateSet.units.memory,
      sourceRule: "absolute.warmCommandPeakMaxRSSBytes",
      observed: requiredPolicy(scenario, "indexed").maxRSSBytes.max,
    });
  }
}

function addSmallRegressionGates(
  observations: Array<{ definition: LadybugBenchmarkGateDefinition; observed: number }>,
  fixture: LadybugBenchmarkFixtureReport,
  gateSet: LadybugBenchmarkGateSet,
): void {
  const rule = gateSet.relative.smallWarmRegression;
  for (const scenario of fixture.summaries.warm) {
    const indexed = requiredPolicy(scenario, "indexed");
    const reference = requiredPolicy(scenario, "reference");
    add(observations, {
      id: `small.${scenario.scenarioId}.operation-regression-median`,
      fixture: "small",
      scenarioId: scenario.scenarioId,
      policy: "indexed",
      metric: "operationNanoseconds",
      statistic: "median",
      threshold:
        reference.operationNanoseconds.median +
        Math.max(rule.medianAbsoluteNanoseconds, reference.operationNanoseconds.median * rule.medianRelative),
      unit: gateSet.units.duration,
      sourceRule: "relative.smallWarmRegression.median",
      observed: indexed.operationNanoseconds.median,
    });
    add(observations, {
      id: `small.${scenario.scenarioId}.operation-regression-p95`,
      fixture: "small",
      scenarioId: scenario.scenarioId,
      policy: "indexed",
      metric: "operationNanoseconds",
      statistic: "p95",
      threshold:
        reference.operationNanoseconds.p95 +
        Math.max(rule.p95AbsoluteNanoseconds, reference.operationNanoseconds.p95 * rule.p95Relative),
      unit: gateSet.units.duration,
      sourceRule: "relative.smallWarmRegression.p95",
      observed: indexed.operationNanoseconds.p95,
    });
  }
}

function addLargeRelativeGates(
  observations: Array<{ definition: LadybugBenchmarkGateDefinition; observed: number }>,
  fixture: LadybugBenchmarkFixtureReport,
  gateSet: LadybugBenchmarkGateSet,
): void {
  for (const scenario of fixture.summaries.warm.filter((summary) => summary.scenarioId.startsWith("query-"))) {
    const rule = gateSet.relative.largeQuery;
    addRatio(observations, fixture, scenario, "median", rule.medianRatio, "relative.largeQuery.medianRatio");
    addRatio(observations, fixture, scenario, "p95", rule.p95Ratio, "relative.largeQuery.p95Ratio");
    addRatio(
      observations,
      fixture,
      scenario,
      "upperOneSided95",
      rule.upperOneSided95MedianRatio,
      "relative.largeQuery.upperOneSided95MedianRatio",
    );
  }
  for (const scenario of fixture.summaries.warm.filter(
    (summary) => summary.scenarioId.startsWith("graph-") || summary.scenarioId.startsWith("context-"),
  )) {
    const rule = gateSet.relative.largeGraphContext;
    addRatio(observations, fixture, scenario, "median", rule.medianRatio, "relative.largeGraphContext.medianRatio");
    addRatio(observations, fixture, scenario, "p95", rule.p95Ratio, "relative.largeGraphContext.p95Ratio");
  }
}

function addRatio(
  observations: Array<{ definition: LadybugBenchmarkGateDefinition; observed: number }>,
  fixture: LadybugBenchmarkFixtureReport,
  scenario: LadybugBenchmarkScenarioSummary,
  statistic: "median" | "p95" | "upperOneSided95",
  threshold: number,
  sourceRule: string,
): void {
  add(observations, {
    id: `${fixture.name}.${scenario.scenarioId}.indexed-over-reference-${statistic}`,
    fixture: fixture.name,
    scenarioId: scenario.scenarioId,
    policy: "paired",
    metric: "indexedOverReferenceOperation",
    statistic,
    threshold,
    unit: "indexed-over-reference",
    sourceRule,
    observed: scenario.paired.indexedOverReferenceOperation[statistic],
  });
}

function add(
  observations: Array<{ definition: LadybugBenchmarkGateDefinition; observed: number }>,
  value: Omit<LadybugBenchmarkGateDefinition, "comparator"> & { readonly observed: number },
): void {
  const { observed, ...definition } = value;
  if (!Number.isFinite(observed) || observed < 0 || !Number.isFinite(definition.threshold)) {
    throw new Error(`invalid gate observation for ${definition.id}`);
  }
  observations.push({ definition: { ...definition, comparator: "at-most" }, observed });
}

function evaluateObservation(
  definition: LadybugBenchmarkGateDefinition,
  observed: number,
  inconclusiveReasons: readonly string[],
): LadybugBenchmarkGateResult {
  if (inconclusiveReasons.length > 0) {
    return {
      id: definition.id,
      observed,
      status: "inconclusive",
      reason: `not evaluated: ${inconclusiveReasons.join("; ")}`,
    };
  }
  const passed =
    definition.comparator === "at-most" ? observed <= definition.threshold : observed >= definition.threshold;
  return {
    id: definition.id,
    observed,
    status: passed ? "pass" : "fail",
    reason: `${definition.id}: observed ${observed} ${passed ? "satisfies" : "violates"} approved ${definition.comparator} ${definition.threshold} ${definition.unit}`,
  };
}

function qualificationEvidenceIssues(options: {
  readonly mode: LadybugBenchmarkMode;
  readonly configuration: LadybugBenchmarkRunConfiguration;
  readonly calibration: LadybugBenchmarkReport["calibration"];
  readonly fixtures: readonly LadybugBenchmarkFixtureReport[];
}): string[] {
  const reasons: string[] = [];
  if (options.mode !== "qualification") reasons.push("smoke mode is functional evidence, not qualification evidence");
  if (!isQualificationConfiguration(options.configuration))
    reasons.push("benchmark methodology does not match the frozen qualification counts");
  if (options.calibration.status !== "pass") reasons.push(...options.calibration.reasons);
  const names = options.fixtures.map((fixture) => fixture.name);
  for (const required of ["small", "large"] as const) {
    if (!names.includes(required)) reasons.push(`missing required ${required} fixture evidence`);
  }
  if (new Set(names).size !== names.length) reasons.push("fixture evidence contains duplicate fixture names");
  for (const fixture of options.fixtures) {
    if (fixture.summaries.coldBuild.operationNanoseconds.count !== 7) {
      reasons.push(`${fixture.name} cold build does not contain 7 measured repetitions`);
    }
    for (const scenario of fixture.summaries.warm) {
      if (
        scenario.paired.count !== 30 ||
        scenario.policies.some((policy) => policy.operationNanoseconds.count !== 30)
      ) {
        reasons.push(`${fixture.name}/${scenario.scenarioId} does not contain 30 measured policy pairs`);
      }
    }
  }
  return reasons;
}

function isQualificationConfiguration(configuration: LadybugBenchmarkRunConfiguration): boolean {
  return (
    configuration.mode === "qualification" &&
    configuration.coldSetupRepetitions === 1 &&
    configuration.coldRepetitions === 7 &&
    configuration.warmups === 5 &&
    configuration.repetitions === 30 &&
    configuration.batches === 3 &&
    configuration.bootstrapIterations === 10_000 &&
    configuration.confidence === 0.95 &&
    configuration.calibrationWarmups === 5 &&
    configuration.calibrationRepetitions === 20 &&
    configuration.calibrationCoefficientOfVariationLimit === 0.1
  );
}

function commandScenarios(fixture: LadybugBenchmarkFixtureReport): LadybugBenchmarkScenarioSummary[] {
  return fixture.summaries.warm.filter(
    (summary) =>
      summary.scenarioId.startsWith("graph-") ||
      summary.scenarioId.startsWith("query-") ||
      summary.scenarioId.startsWith("context-"),
  );
}

function requiredScenario(fixture: LadybugBenchmarkFixtureReport, scenarioId: string): LadybugBenchmarkScenarioSummary {
  const scenario = fixture.summaries.warm.find((candidate) => candidate.scenarioId === scenarioId);
  if (scenario === undefined) throw new Error(`${fixture.name} benchmark report is missing ${scenarioId}`);
  return scenario;
}

function requiredPolicy(
  scenario: LadybugBenchmarkScenarioSummary,
  policy: "indexed" | "reference",
): LadybugBenchmarkPolicySummary {
  const summary = scenario.policies.find((candidate) => candidate.policy === policy);
  if (summary === undefined) throw new Error(`${scenario.scenarioId} benchmark summary is missing ${policy}`);
  return summary;
}

function assertApprovedValues(gateSet: LadybugBenchmarkGateSet): void {
  const actual = JSON.stringify({ absolute: gateSet.absolute, relative: gateSet.relative });
  const approved = JSON.stringify({
    absolute: {
      small: {
        coldBuildP95WallNanoseconds: 2_000_000_000,
        warmOpenP95WallNanoseconds: 350_000_000,
        coldPeakMaxRSSBytes: 512 * 1024 * 1024,
        warmCommandPeakMaxRSSBytes: 384 * 1024 * 1024,
        indexLogicalBytes: 64 * 1024 * 1024,
      },
      large: {
        coldBuildP95WallNanoseconds: 30_000_000_000,
        warmOpenP95WallNanoseconds: 3_000_000_000,
        coldPeakMaxRSSBytes: 2 * 1024 * 1024 * 1024,
        warmCommandPeakMaxRSSBytes: 1024 * 1024 * 1024,
        indexLogicalBytes: 512 * 1024 * 1024,
        indexLogicalBytesFormula: { baseBytes: 64 * 1024 * 1024, canonicalInputMultiplier: 4 },
      },
    },
    relative: {
      largeQuery: { medianRatio: 0.6, p95Ratio: 0.75, upperOneSided95MedianRatio: 0.75 },
      largeGraphContext: { medianRatio: 1.1, p95Ratio: 1.2 },
      smallWarmRegression: {
        medianAbsoluteNanoseconds: 15_000_000,
        medianRelative: 0.15,
        p95AbsoluteNanoseconds: 30_000_000,
        p95Relative: 0.25,
      },
    },
  });
  if (actual !== approved) throw new Error("Ladybug benchmark gates do not match the approved plan-item-4 thresholds");
}
