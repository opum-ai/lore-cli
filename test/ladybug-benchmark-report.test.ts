import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { benchmarkDigest } from "../benchmark/ladybug/accounting";
import { loadLadybugBenchmarkFixtureSpec } from "../benchmark/ladybug/fixture";
import type { BenchmarkOperation, BenchmarkPolicy } from "../benchmark/ladybug/protocol";
import {
  calibrationReport,
  LADYBUG_BENCHMARK_REPORT_SCHEMA,
  type LadybugBenchmarkRawSample,
  type LadybugBenchmarkReport,
  parseLadybugBenchmarkReport,
  stableReportJson,
  summarizeLadybugBenchmarkFixture,
} from "../benchmark/ladybug/report";
import {
  assertLadybugBenchmarkRuntime,
  ladybugBenchmarkExitCode,
  parseLadybugBenchmarkCliArgs,
  qualificationRunConfiguration,
  randomizedPolicyOrders,
} from "../benchmark/ladybug/run";
import { summarizeCalibration, summarizeDistribution, summarizePairedRatios } from "../benchmark/ladybug/statistics";

const FIXTURES = resolve(import.meta.dir, "..", "benchmark", "ladybug", "fixtures", "v1");

describe("Ladybug benchmark report contract", () => {
  test("calculates deterministic robust and paired statistics", () => {
    expect(summarizeDistribution([4, 1, 3, 2])).toEqual({
      count: 4,
      median: 2.5,
      p95: 3.8499999999999996,
      mad: 1,
      max: 4,
    });
    expect(summarizeCalibration([10, 10, 10])).toEqual({
      count: 3,
      mean: 10,
      standardDeviation: 0,
      coefficientOfVariation: 0,
    });
    const first = summarizePairedRatios([1, 2, 3], [2, 4, 3], { seed: 283, iterations: 500 });
    const second = summarizePairedRatios([1, 2, 3], [2, 4, 3], { seed: 283, iterations: 500 });
    expect(first).toEqual(second);
    expect(first.median).toBe(0.5);
    expect(first.upperOneSided95).toBe(1);
  });

  test("freezes qualification counts and balanced deterministic AB/BA schedules", () => {
    expect(qualificationRunConfiguration("qualification")).toMatchObject({
      coldSetupRepetitions: 0,
      coldRepetitions: 1,
      warmups: 0,
      repetitions: 5,
      batches: 1,
      confidence: 0.95,
    });
    expect(qualificationRunConfiguration("smoke")).toMatchObject({
      coldRepetitions: 1,
      warmups: 0,
      repetitions: 1,
      batches: 1,
    });
    const orders = randomizedPolicyOrders(28310401, 5);
    expect(orders).toEqual(randomizedPolicyOrders(28310401, 5));
    expect(new Set(orders.map((order) => order[0]))).toEqual(new Set(["indexed", "reference"]));
    expect(() => assertLadybugBenchmarkRuntime("qualification", "1.3.14")).not.toThrow();
    expect(() => assertLadybugBenchmarkRuntime("qualification", "1.2.23")).toThrow("requires Bun 1.3.14");
    expect(() => assertLadybugBenchmarkRuntime("smoke", "1.3.14")).not.toThrow();
    expect(() => assertLadybugBenchmarkRuntime("observation", "1.2.23")).toThrow("requires Bun 1.3.14");
  });

  test("parses repeatable fixtures, required output, runner identity, and smoke mode", () => {
    const cwd = "/tmp/benchmark-cwd";
    expect(
      parseLadybugBenchmarkCliArgs(
        [
          "--fixture",
          "small",
          "--fixture",
          "large",
          "--fixture",
          "small",
          "--output",
          "artifact.json",
          "--runner-image",
          "test-image",
          "--smoke",
        ],
        cwd,
      ),
    ).toEqual({
      fixtureNames: ["small", "large"],
      output: resolve(cwd, "artifact.json"),
      mode: "smoke",
      runnerImage: "test-image",
    });
    expect(() => parseLadybugBenchmarkCliArgs(["--fixture", "small"], "/tmp")).toThrow("--output");
    expect(() => parseLadybugBenchmarkCliArgs(["--fixture", "medium", "--output", "x"], "/tmp")).toThrow(
      "unknown Ladybug benchmark fixture",
    );
  });

  test("marks calibration noise above ten percent inconclusive", () => {
    expect(calibrationReport([100, 100, 100], 1).status).toBe("pass");
    const noisy = calibrationReport([1, 100, 1, 100], 1);
    expect(noisy.status).toBe("inconclusive");
    expect(noisy.reasons[0]).toContain("exceeds 0.100000");
  });

  test("emits one strictly parsed, ordered, digest-pinned report document", () => {
    const spec = loadLadybugBenchmarkFixtureSpec(resolve(FIXTURES, "small.json"));
    const warmOpen = { kind: "warm-open" } as const;
    const queryRare = { kind: "query", text: "axolotl-rare", limit: 64 } as const;
    const scenarios = [
      { id: "warm-open", operation: warmOpen },
      { id: "query-rare", operation: queryRare },
    ];
    const samples: LadybugBenchmarkRawSample[] = [
      sample(0, "cold-measurement", "projection-cold", { kind: "projection-cold" }, "indexed", null, 80),
      sample(1, "measurement", "warm-open", warmOpen, "reference", "warm-open:1", 40),
      sample(2, "measurement", "warm-open", warmOpen, "indexed", "warm-open:1", 20),
      sample(3, "measurement", "query-rare", queryRare, "indexed", "query-rare:1", 30),
      sample(4, "measurement", "query-rare", queryRare, "reference", "query-rare:1", 60),
    ];
    const fixture = summarizeLadybugBenchmarkFixture({
      spec,
      canonicalInputBytes: 1_234_567,
      scenarios,
      samples,
      bootstrapIterations: 100,
    });
    const report: LadybugBenchmarkReport = {
      schema: LADYBUG_BENCHMARK_REPORT_SCHEMA,
      generatedAt: "2026-07-31T12:00:00.000Z",
      mode: "smoke",
      toolchain: {
        loreVersion: "0.0.0",
        bunVersion: "1.3.14",
        nodeVersion: "22.0.0",
        ladybugPackageVersion: "0.19.0",
        ladybugRuntimeVersion: "0.19.0",
        ladybugStorageVersion: "43",
      },
      host: {
        platform: "linux",
        arch: "x64",
        osRelease: "test",
        runnerImage: "test-image",
        cpuModel: "test-cpu",
        logicalCpuCount: 4,
        ramBytes: 8_589_934_592,
      },
      repository: { commit: "a".repeat(40), dirty: false },
      configuration: qualificationRunConfiguration("smoke"),
      calibration: calibrationReport([100, 100, 100, 100, 100], 1),
      fixtures: [fixture],
      gates: {
        source: {
          schema: "lore.ladybug-benchmark-gates/1",
          approvedTask: "LCLI-283.1.4",
          approvedPlanItem: 11,
          approvedAt: "2026-07-31",
          digest: `sha256:${"d".repeat(64)}`,
        },
        definitions: [],
        results: [],
        evaluation: { status: "inconclusive", reasons: ["thresholds pending"] },
      },
    };
    expect(parseLadybugBenchmarkReport(report)).toEqual(report);
    const json = stableReportJson(report);
    expect(Object.keys(JSON.parse(json) as object)).toEqual([
      "schema",
      "generatedAt",
      "mode",
      "toolchain",
      "host",
      "repository",
      "configuration",
      "calibration",
      "fixtures",
      "gates",
    ]);
    expect(benchmarkDigest(json)).toBe("sha256:8c12256043549b231ecab4fec9a5a658f7d5cb32382195ec5c279880f46152d5");
    expect(() => parseLadybugBenchmarkReport({ ...report, unexpected: true })).toThrow();

    const noisySmoke = {
      ...report,
      calibration: calibrationReport([1, 100, 1, 100], 1),
    };
    expect(ladybugBenchmarkExitCode(noisySmoke)).toBe(0);
    expect(ladybugBenchmarkExitCode({ ...report, mode: "qualification" })).toBe(2);
    expect(
      ladybugBenchmarkExitCode({
        ...report,
        mode: "qualification",
        gates: { ...report.gates, evaluation: { status: "fail", reasons: ["regression"] } },
      }),
    ).toBe(1);
    expect(
      ladybugBenchmarkExitCode({
        ...report,
        mode: "qualification",
        gates: { ...report.gates, evaluation: { status: "pass", reasons: [] } },
      }),
    ).toBe(0);
  });
});

function sample(
  sequence: number,
  phase: LadybugBenchmarkRawSample["phase"],
  scenarioId: string,
  _operation: BenchmarkOperation,
  policy: BenchmarkPolicy,
  pairId: string | null,
  operationNanoseconds: number,
): LadybugBenchmarkRawSample {
  const order: BenchmarkPolicy[] =
    pairId === null ? [policy] : pairId.startsWith("warm-open") ? ["reference", "indexed"] : ["indexed", "reference"];
  return {
    sequence,
    phase,
    batch: phase === "measurement" ? 1 : null,
    repetition: 1,
    pairId,
    scenarioId,
    policy,
    order,
    resultDigest: `sha256:${"b".repeat(64)}`,
    operationNanoseconds,
    wallNanoseconds: operationNanoseconds + 10,
    cpuMicroseconds: { user: operationNanoseconds, system: 1, total: operationNanoseconds + 1 },
    maxRSSBytes: 1000 + operationNanoseconds,
    canonicalInputBytes: 1_234_567,
    emittedBytes: scenarioId === "warm-open" ? 0 : 100,
    diagnosticBytes: 0,
    cacheLogicalBytesBefore: policy === "indexed" ? 500 : 600,
    cacheLogicalBytesAfter: policy === "indexed" ? 500 : 600,
    sourceDigest: `sha256:${"c".repeat(64)}`,
  };
}
