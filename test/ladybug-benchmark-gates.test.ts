import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { benchmarkDigest } from "../benchmark/ladybug/accounting";
import { loadLadybugBenchmarkFixtureSpec } from "../benchmark/ladybug/fixture";
import {
  evaluateLadybugBenchmarkGates,
  LADYBUG_BENCHMARK_GATE_PATH,
  LADYBUG_BENCHMARK_GATE_SCHEMA,
  LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT,
  loadLadybugBenchmarkGateSet,
} from "../benchmark/ladybug/gates";
import { ladybugBenchmarkScenarios, ladybugQualificationScenarios } from "../benchmark/ladybug/orchestrator";
import {
  calibrationReport,
  type LadybugBenchmarkFixtureReport,
  type LadybugBenchmarkPolicySummary,
  type LadybugBenchmarkScenarioSummary,
} from "../benchmark/ladybug/report";
import { qualificationRunConfiguration } from "../benchmark/ladybug/run";
import type { DistributionSummary } from "../benchmark/ladybug/statistics";

const FIXTURES = resolve(import.meta.dir, "..", "benchmark", "ladybug", "fixtures", "v1");

describe("Ladybug benchmark approved gates", () => {
  test("pins the committed bounded plan-item-11 gate file and every approved value", () => {
    const bytes = readFileSync(LADYBUG_BENCHMARK_GATE_PATH);
    const gateSet = loadLadybugBenchmarkGateSet();
    expect(gateSet.schema).toBe(LADYBUG_BENCHMARK_GATE_SCHEMA);
    expect(gateSet.approvedTask).toBe("LCLI-283.1.4");
    expect(gateSet.approvedPlanItem).toBe(11);
    expect(gateSet.metrics).toEqual({
      coldBuildLatency: "wallNanoseconds.p95",
      warmOpenLatency: "wallNanoseconds.p95",
      warmCommandLatency: "operationNanoseconds",
      resourcePeak: "maxRSSBytes.max",
      indexSize: "cacheLogicalBytesAfter.max",
      pairedRatio: "indexedOverReferenceOperation",
    });
    expect(gateSet.absolute.small).toEqual({
      coldBuildP95WallNanoseconds: 2_000_000_000,
      warmOpenP95WallNanoseconds: 350_000_000,
      coldPeakMaxRSSBytes: 512 * 1024 * 1024,
      warmCommandPeakMaxRSSBytes: 384 * 1024 * 1024,
      indexLogicalBytes: 64 * 1024 * 1024,
    });
    expect(gateSet.absolute.large.indexLogicalBytesFormula).toEqual({
      baseBytes: 64 * 1024 * 1024,
      canonicalInputMultiplier: 4,
    });
    expect(gateSet.absolute.large.warmCommandPeakMaxRSSBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(gateSet.absolute.large.warmQueryP95OperationNanoseconds).toBe(500_000_000);
    expect(gateSet.absolute.large.warmGraphContextP95OperationNanoseconds).toBe(1_000_000_000);
    expect(gateSet.relative).toEqual({
      largeQuery: { medianRatio: 0.6, p95Ratio: 0.75, upperOneSided95MedianRatio: 0.75 },
      largeGraphContext: { medianRatio: 1.1, p95Ratio: 1.2 },
      smallWarmRegression: {
        medianAbsoluteNanoseconds: 15_000_000,
        medianRelative: 0.15,
        p95AbsoluteNanoseconds: 30_000_000,
        p95Relative: 0.25,
      },
    });
    expect(benchmarkDigest(bytes)).toBe("sha256:3c686a06f4b680896a6d7894e2d28d78d686e0c687569730859e41d89f506038");
  });

  test("resolves all bounded gates and passes evidence inside every approved budget", () => {
    const fixtures = [fakeFixture("large")];
    const gates = evaluateLadybugBenchmarkGates({
      mode: "qualification",
      configuration: qualificationRunConfiguration("qualification"),
      calibration: calibrationReport(Array(5).fill(100), 1),
      fixtures,
    });
    expect(gates.evaluation).toEqual({
      status: "pass",
      reasons: [`all ${LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT} approved quantitative gates passed`],
    });
    expect(gates.definitions).toHaveLength(LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT);
    expect(gates.results).toHaveLength(LADYBUG_BENCHMARK_QUALIFICATION_GATE_COUNT);
    expect(gates.source.digest).toBe("sha256:3c686a06f4b680896a6d7894e2d28d78d686e0c687569730859e41d89f506038");
    expect(gates.results.every((result) => result.status === "pass")).toBe(true);
    expect(definition(gates.definitions, "large.query-rare.operation-p95").threshold).toBe(500_000_000);
    expect(definition(gates.definitions, "large.graph-depth-2.operation-p95").threshold).toBe(1_000_000_000);
    expect(definition(gates.definitions, "large.index.logical-bytes-scaled").threshold).toBe(
      64 * 1024 * 1024 + 4 * 110_000_000,
    );
  });

  test("fails conclusive evidence that exceeds a frozen large-query ratio", () => {
    const gates = evaluateLadybugBenchmarkGates({
      mode: "qualification",
      configuration: qualificationRunConfiguration("qualification"),
      calibration: calibrationReport(Array(5).fill(100), 1),
      fixtures: [fakeFixture("large", { largeQueryMedianRatio: 0.61 })],
    });
    expect(gates.evaluation.status).toBe("fail");
    expect(
      gates.results.some(
        (result) => result.id === "large.query-rare.indexed-over-reference-median" && result.status === "fail",
      ),
    ).toBe(true);
    expect(gates.evaluation.reasons[0]).toContain("approved at-most 0.6");
  });

  test("never passes smoke, missing-fixture, wrong-methodology, or noisy-calibration evidence", () => {
    const smoke = evaluateLadybugBenchmarkGates({
      mode: "smoke",
      configuration: qualificationRunConfiguration("smoke"),
      calibration: calibrationReport(Array(5).fill(100), 1),
      fixtures: [fakeFixture("small", { count: 1, coldCount: 1 })],
    });
    expect(smoke.evaluation.status).toBe("inconclusive");
    expect(smoke.evaluation.reasons).toContain("smoke mode is functional evidence, not qualification evidence");
    expect(smoke.evaluation.reasons).toContain("missing required large fixture evidence");
    expect(smoke.results.every((result) => result.status === "inconclusive")).toBe(true);

    const noisy = evaluateLadybugBenchmarkGates({
      mode: "qualification",
      configuration: qualificationRunConfiguration("qualification"),
      calibration: calibrationReport([1, 100, 1, 100], 5),
      fixtures: [fakeFixture("large")],
    });
    expect(noisy.evaluation.status).toBe("inconclusive");
    expect(noisy.evaluation.reasons.some((reason) => reason.includes("coefficient of variation"))).toBe(true);
  });
});

function fakeFixture(
  name: "small" | "large",
  options: { readonly count?: number; readonly coldCount?: number; readonly largeQueryMedianRatio?: number } = {},
): LadybugBenchmarkFixtureReport {
  const count = options.count ?? 5;
  const coldCount = options.coldCount ?? 1;
  const spec = loadLadybugBenchmarkFixtureSpec(resolve(FIXTURES, `${name}.json`));
  const scenarios = name === "small" ? ladybugBenchmarkScenarios(spec) : ladybugQualificationScenarios(spec);
  const canonicalInputBytes = name === "small" ? 2_000_000 : 110_000_000;
  const coldWall = name === "small" ? 1_000_000_000 : 10_000_000_000;
  const coldRSS = name === "small" ? 128 * 1024 * 1024 : 1024 * 1024 * 1024;
  const cacheBytes = name === "small" ? 32 * 1024 * 1024 : 128 * 1024 * 1024;
  const warm = scenarios.map((scenario) => fakeScenario(name, scenario.id, count, options.largeQueryMedianRatio));
  return {
    name,
    fixtureSchema: spec.schema,
    seed: spec.seed,
    digests: spec.expected,
    counts: spec.counts,
    canonicalInputBytes,
    scenarios,
    samples: [],
    summaries: {
      coldBuild: policySummary("indexed", coldCount, {
        operation: coldWall,
        wall: coldWall,
        rss: coldRSS,
        cache: cacheBytes,
      }),
      warm,
    },
    resourceTotals: {
      sampleCount: 1,
      cpuUserMicroseconds: 1,
      cpuSystemMicroseconds: 1,
      cpuTotalMicroseconds: 2,
      emittedBytes: 1,
      diagnosticBytes: 0,
      peakMaxRSSBytes: coldRSS,
      peakCacheLogicalBytes: cacheBytes,
    },
  };
}

function fakeScenario(
  fixture: "small" | "large",
  scenarioId: string,
  count: number,
  largeQueryMedianRatio = 0.5,
): LadybugBenchmarkScenarioSummary {
  const referenceOperation = 100_000_000;
  const ratio = fixture === "large" && scenarioId.startsWith("query-") ? largeQueryMedianRatio : 1;
  const indexedOperation = referenceOperation * ratio;
  const indexedWall = scenarioId === "warm-open" ? (fixture === "small" ? 100_000_000 : 1_000_000_000) : 150_000_000;
  return {
    scenarioId,
    policies: [
      policySummary("indexed", count, {
        operation: indexedOperation,
        wall: indexedWall,
        rss: fixture === "small" ? 128 * 1024 * 1024 : 512 * 1024 * 1024,
        cache: fixture === "small" ? 32 * 1024 * 1024 : 128 * 1024 * 1024,
      }),
      policySummary("reference", count, {
        operation: referenceOperation,
        wall: 150_000_000,
        rss: 128 * 1024 * 1024,
        cache: fixture === "small" ? 32 * 1024 * 1024 : 128 * 1024 * 1024,
      }),
    ],
    paired: {
      count,
      indexedOverReferenceOperation: {
        count,
        median: ratio,
        p95: fixture === "large" && scenarioId.startsWith("query-") ? 0.7 : ratio,
        mad: 0,
        max: ratio,
        upperOneSided95: fixture === "large" && scenarioId.startsWith("query-") ? 0.7 : ratio,
      },
      indexedOverReferenceWall: {
        count,
        median: 1,
        p95: 1,
        mad: 0,
        max: 1,
        upperOneSided95: 1,
      },
    },
  };
}

function policySummary(
  policy: "indexed" | "reference",
  count: number,
  values: { readonly operation: number; readonly wall: number; readonly rss: number; readonly cache: number },
): LadybugBenchmarkPolicySummary {
  return {
    policy,
    operationNanoseconds: distribution(count, values.operation),
    wallNanoseconds: distribution(count, values.wall),
    cpuMicroseconds: distribution(count, 1000),
    maxRSSBytes: distribution(count, values.rss),
    emittedBytes: distribution(count, 100),
    cacheLogicalBytesAfter: distribution(count, values.cache),
  };
}

function distribution(count: number, value: number): DistributionSummary {
  return { count, median: value, p95: value, mad: 0, max: value };
}

function definition(
  definitions: readonly { readonly id: string; readonly threshold: number }[],
  id: string,
): { readonly id: string; readonly threshold: number } {
  const found = definitions.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing test gate ${id}`);
  return found;
}
