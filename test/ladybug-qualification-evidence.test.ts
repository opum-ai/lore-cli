import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BenchmarkSourceSnapshot } from "../benchmark/ladybug/accounting";
import {
  createLadybugConcurrencyEvidenceReport,
  LADYBUG_CONCURRENCY_EVIDENCE_KILL_POINTS,
  type LadybugConcurrencyEvidenceRecord,
} from "../benchmark/ladybug/concurrency-evidence";
import { loadLadybugBenchmarkFixtureSpec } from "../benchmark/ladybug/fixture";
import { evaluateLadybugBenchmarkGates, LADYBUG_BENCHMARK_GATE_PATH } from "../benchmark/ladybug/gates";
import { ladybugQualificationScenarios } from "../benchmark/ladybug/orchestrator";
import {
  LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
  type PackageQualificationReport,
} from "../benchmark/ladybug/package-qualification";
import {
  buildLadybugQualificationEvidenceManifest,
  LADYBUG_QUALIFICATION_EVIDENCE_SCHEMA,
  LADYBUG_QUALIFICATION_PLATFORMS,
  parseLadybugQualificationEvidenceArgs,
  parseLadybugQualificationEvidenceManifest,
  type QualificationEvidenceArtifact,
} from "../benchmark/ladybug/qualification-evidence";
import {
  calibrationReport,
  LADYBUG_BENCHMARK_REPORT_SCHEMA,
  type LadybugBenchmarkFixtureReport,
  type LadybugBenchmarkPolicySummary,
  type LadybugBenchmarkRawSample,
  type LadybugBenchmarkReport,
  type LadybugBenchmarkScenarioSummary,
} from "../benchmark/ladybug/report";
import { qualificationRunConfiguration } from "../benchmark/ladybug/run";

const FIXTURES = resolve(import.meta.dir, "..", "benchmark", "ladybug", "fixtures", "v1");
const COMMIT = "a".repeat(40);
const SHA = `sha256:${"b".repeat(64)}`;

describe("LCLI-283.1.4 qualification evidence mapping", () => {
  test("maps only complete pinned executable artifacts to all four acceptance criteria", () => {
    const inputs = completeInputs();
    const manifest = buildLadybugQualificationEvidenceManifest(inputs);
    expect(manifest.schema).toBe(LADYBUG_QUALIFICATION_EVIDENCE_SCHEMA);
    expect(manifest.status).toBe("pass");
    expect(manifest.repository.commit).toBe(COMMIT);
    expect(manifest.acceptanceCriteria.map(({ number, status }) => ({ number, status }))).toEqual([
      { number: 1, status: "pass" },
      { number: 2, status: "pass" },
      { number: 3, status: "pass" },
      { number: 4, status: "pass" },
    ]);
    expect(manifest.platformVerdicts.map(({ distribution, supportClaim }) => ({ distribution, supportClaim }))).toEqual(
      LADYBUG_QUALIFICATION_PLATFORMS.map(({ distribution, supportClaim }) => ({ distribution, supportClaim })),
    );
    expect(manifest.platformVerdicts.filter((verdict) => verdict.executableEvidence)).toHaveLength(4);
    expect(manifest.platformVerdicts.at(-1)).toMatchObject({
      distribution: "win32-x64",
      supportClaim: "reference-fallback-only",
      executableEvidence: false,
      databaseCreated: false,
    });
    expect(parseLadybugQualificationEvidenceManifest(manifest)).toEqual(manifest);
  });

  test("rejects smoke, inconclusive primary, wrong-commit, duplicate, and fallback-policy evidence", () => {
    const smoke = completeInputs();
    smoke.linuxBenchmark = artifact("linux.json", {
      ...(smoke.linuxBenchmark.value as LadybugBenchmarkReport),
      mode: "smoke",
    });
    expect(() => buildLadybugQualificationEvidenceManifest(smoke)).toThrow();

    const inconclusive = completeInputs();
    inconclusive.linuxBenchmark = artifact("linux.json", {
      ...(inconclusive.linuxBenchmark.value as LadybugBenchmarkReport),
      gates: {
        ...(inconclusive.linuxBenchmark.value as LadybugBenchmarkReport).gates,
        evaluation: { status: "inconclusive", reasons: ["noisy"] },
      },
    });
    expect(() => buildLadybugQualificationEvidenceManifest(inconclusive)).toThrow("conclusive gate pass");

    const wrongCommit = completeInputs();
    const firstPackage = wrongCommit.packages[0] as QualificationEvidenceArtifact<PackageQualificationReport>;
    wrongCommit.packages[0] = artifact(firstPackage.name, {
      ...firstPackage.value,
      repository: { commit: "c".repeat(40) },
    });
    expect(() => buildLadybugQualificationEvidenceManifest(wrongCommit)).toThrow("one repository commit");

    const duplicate = completeInputs();
    duplicate.packages[1] = duplicate.packages[0] as QualificationEvidenceArtifact<unknown>;
    expect(() => buildLadybugQualificationEvidenceManifest(duplicate)).toThrow("artifact names must be unique");

    const windows = completeInputs();
    const windowsIndex = windows.packages.findIndex(
      (candidate) => (candidate.value as PackageQualificationReport).platform.distribution === "win32-x64",
    );
    const windowsArtifact = windows.packages[windowsIndex] as QualificationEvidenceArtifact<PackageQualificationReport>;
    windows.packages[windowsIndex] = artifact(windowsArtifact.name, {
      ...windowsArtifact.value,
      native: { ...windowsArtifact.value.native, supportClaim: "native-index" },
    });
    expect(() => buildLadybugQualificationEvidenceManifest(windows)).toThrow("approved native platform verdict");
  });

  test("requires explicit paths for the benchmark, gates, concurrency, five packages, and output", () => {
    const args = [
      "--linux-benchmark",
      "linux.json",
      "--gates",
      "gates.json",
      "--concurrency",
      "concurrency.json",
      "--output",
      "manifest.json",
      ...LADYBUG_QUALIFICATION_PLATFORMS.flatMap(({ distribution }) => ["--package-report", `${distribution}.json`]),
    ];
    expect(parseLadybugQualificationEvidenceArgs(args).packages).toHaveLength(5);
    expect(() => parseLadybugQualificationEvidenceArgs(args.slice(0, -2))).toThrow("five --package-report");
    expect(() => parseLadybugQualificationEvidenceArgs([...args, "--simulated", "yes"])).toThrow("unknown");
  });
});

function completeInputs(): {
  linuxBenchmark: QualificationEvidenceArtifact<unknown>;
  gates: QualificationEvidenceArtifact<unknown>;
  packages: QualificationEvidenceArtifact<unknown>[];
  concurrency: QualificationEvidenceArtifact<unknown>;
} {
  const linux = benchmarkReport("linux", "x64");
  const gateBytes = readFileSync(LADYBUG_BENCHMARK_GATE_PATH);
  const concurrency = concurrencyReport();
  return {
    linuxBenchmark: artifact("ladybug-benchmark-linux-x64.json", linux),
    gates: {
      name: "ladybug-gates-v1.json",
      bytes: gateBytes,
      value: JSON.parse(gateBytes.toString("utf8")) as unknown,
    },
    packages: LADYBUG_QUALIFICATION_PLATFORMS.map((platform) =>
      artifact(`ladybug-package-${platform.distribution}.json`, packageReport(platform)),
    ),
    concurrency: artifact("ladybug-concurrency.json", concurrency),
  };
}

function benchmarkReport(platform: NodeJS.Platform, arch: string): LadybugBenchmarkReport {
  const fixtures = [qualificationFixture("large")];
  const gates = evaluateLadybugBenchmarkGates({
    mode: "qualification",
    configuration: qualificationRunConfiguration("qualification"),
    calibration: calibrationReport(Array(5).fill(100), 1),
    fixtures,
  });
  if (gates.evaluation.status !== "pass") {
    throw new Error(`synthetic qualification gates must pass: ${gates.evaluation.reasons.join("; ")}`);
  }
  return {
    schema: LADYBUG_BENCHMARK_REPORT_SCHEMA,
    generatedAt: "2026-07-31T12:00:00.000Z",
    mode: "qualification",
    toolchain: {
      loreVersion: "0.0.0",
      bunVersion: "1.2.23",
      nodeVersion: "22.0.0",
      ladybugPackageVersion: "0.19.0",
      ladybugRuntimeVersion: "0.19.0",
      ladybugStorageVersion: "43",
    },
    host: {
      platform,
      arch,
      osRelease: "test",
      runnerImage: "test-image",
      cpuModel: "test-cpu",
      logicalCpuCount: 4,
      ramBytes: 8_589_934_592,
    },
    repository: { commit: COMMIT, dirty: false },
    configuration: qualificationRunConfiguration("qualification"),
    calibration: calibrationReport(Array(5).fill(100), 1),
    fixtures,
    gates,
  };
}

function qualificationFixture(name: "large"): LadybugBenchmarkFixtureReport {
  const spec = loadLadybugBenchmarkFixtureSpec(resolve(FIXTURES, `${name}.json`));
  const scenarios = ladybugQualificationScenarios(spec);
  const samples: LadybugBenchmarkRawSample[] = [];
  let sequence = 0;
  samples.push(sample(sequence++, "cold-measurement", "projection-cold", "indexed", null));
  for (const scenario of scenarios) {
    for (let repetition = 1; repetition <= 5; repetition++) {
      samples.push(sample(sequence++, "measurement", scenario.id, "reference", `${scenario.id}:${repetition}`));
      samples.push(sample(sequence++, "measurement", scenario.id, "indexed", `${scenario.id}:${repetition}`));
    }
  }
  const warm = scenarios.map((scenario) => qualificationSummary(name, scenario.id));
  const cold = policySummary("indexed", 1, 10_000_000_000);
  return {
    name,
    fixtureSchema: spec.schema,
    seed: spec.seed,
    digests: spec.expected,
    counts: spec.counts,
    canonicalInputBytes: 110_000_000,
    scenarios,
    samples,
    summaries: { coldBuild: cold, warm },
    resourceTotals: {
      sampleCount: samples.length,
      cpuUserMicroseconds: samples.length,
      cpuSystemMicroseconds: samples.length,
      cpuTotalMicroseconds: samples.length * 2,
      emittedBytes: samples.length,
      diagnosticBytes: 0,
      peakMaxRSSBytes: 1024 * 1024 * 1024,
      peakCacheLogicalBytes: 128 * 1024 * 1024,
    },
  };
}

function sample(
  sequence: number,
  phase: LadybugBenchmarkRawSample["phase"],
  scenarioId: string,
  policy: "indexed" | "reference",
  pairId: string | null,
  repetition = 1,
): LadybugBenchmarkRawSample {
  return {
    sequence,
    phase,
    batch: phase === "measurement" || phase === "warmup" ? 1 : null,
    repetition,
    pairId,
    scenarioId,
    policy,
    order: pairId === null ? [policy] : ["reference", "indexed"],
    resultDigest: SHA,
    operationNanoseconds: policy === "indexed" ? 50 : 100,
    wallNanoseconds: policy === "indexed" ? 50 : 100,
    cpuMicroseconds: { user: 1, system: 1, total: 2 },
    maxRSSBytes: 1024,
    canonicalInputBytes: 1024,
    emittedBytes: 1,
    diagnosticBytes: 0,
    cacheLogicalBytesBefore: 1024,
    cacheLogicalBytesAfter: 1024,
    sourceDigest: SHA,
  };
}

function qualificationSummary(_fixture: "large", scenarioId: string): LadybugBenchmarkScenarioSummary {
  const query = scenarioId.startsWith("query-");
  const ratio = query ? 0.5 : 1;
  return {
    scenarioId,
    policies: [policySummary("indexed", 5, query ? 50 : 100), policySummary("reference", 5, 100)],
    paired: {
      count: 5,
      indexedOverReferenceOperation: {
        count: 5,
        median: ratio,
        p95: ratio,
        mad: 0,
        max: ratio,
        upperOneSided95: ratio,
      },
      indexedOverReferenceWall: { count: 5, median: ratio, p95: ratio, mad: 0, max: ratio, upperOneSided95: ratio },
    },
  };
}

function policySummary(policy: "indexed" | "reference", count: number, value: number): LadybugBenchmarkPolicySummary {
  const distribution = { count, median: value, p95: value, mad: 0, max: value };
  const memory = { count, median: 128 * 1024 * 1024, p95: 128 * 1024 * 1024, mad: 0, max: 128 * 1024 * 1024 };
  const cache = { count, median: 32 * 1024 * 1024, p95: 32 * 1024 * 1024, mad: 0, max: 32 * 1024 * 1024 };
  return {
    policy,
    operationNanoseconds: distribution,
    wallNanoseconds: distribution,
    cpuMicroseconds: distribution,
    maxRSSBytes: memory,
    emittedBytes: distribution,
    cacheLogicalBytesAfter: cache,
  };
}

function packageReport(platform: (typeof LADYBUG_QUALIFICATION_PLATFORMS)[number]): PackageQualificationReport {
  const commands = ["version", "help", "graph", "query", "context"].map((name) => ({
    name,
    stdoutSha256: SHA,
  }));
  const windows = platform.os === "win32";
  return {
    schema: LADYBUG_PACKAGE_QUALIFICATION_SCHEMA,
    mode: "qualification",
    platform: {
      distribution: platform.distribution,
      os: platform.os,
      cpu: platform.cpu,
      bun: "1.2.23",
      node: "v22.0.0",
    },
    repository: { commit: COMMIT },
    ladybug: {
      core: "0.19.0",
      optionalPackage: `@ladybugdb/core-${platform.os}-${platform.cpu}`,
      lockIntegrity: "sha512-YWJjZA==",
      addonSha256: SHA,
      copiedAddonMatches: true,
    },
    package: {
      root: "@salient-data/lore",
      platform: `@salient-data/lore-${platform.distribution}`,
      rootTarballSha256: SHA,
      platformTarballSha256: SHA,
      standaloneBinarySha256: SHA,
    },
    smoke: { launcher: commands, standalone: commands, outputsStable: true },
    native: {
      supportClaim: platform.supportClaim,
      probeMode: windows ? "import" : "indexed",
      probeOutcome: windows ? "crash" : "pass",
      exitCode: windows ? 139 : 0,
      signal: null,
      stdoutSha256: SHA,
      stderrSha256: SHA,
      databaseCreated: !windows,
      executableEvidence: !windows,
      commandOutputsStable: true,
      referenceFallbackDatabaseAbsent: windows ? true : null,
    },
    cleanup: {
      launcherRemoved: true,
      packagesRemoved: true,
      addonRemoved: true,
      installScratchRemoved: true,
      isolatedGlobalClean: true,
      repositoryCachePreservedByUninstall: true,
      explicitCacheDisposalSucceeded: true,
      repositorySourcesPreserved: true,
    },
  };
}

function concurrencyReport() {
  const snapshot: BenchmarkSourceSnapshot = { digest: SHA, byteLength: 1, entries: [] };
  const records: LadybugConcurrencyEvidenceRecord[] = [
    record("multi-reader-publication", null, snapshot),
    record("writer-race-live-lock", null, snapshot),
    ...LADYBUG_CONCURRENCY_EVIDENCE_KILL_POINTS.map((checkpoint, index) =>
      record("crash-recovery", checkpoint, snapshot, index < 2 ? "built" : "reused"),
    ),
  ];
  const report = createLadybugConcurrencyEvidenceReport(records, { commit: COMMIT, dirty: false });
  return { ...report, toolchain: { ...report.toolchain, bun: "1.2.23" } };
}

function record(
  scenario: LadybugConcurrencyEvidenceRecord["scenario"],
  checkpoint: LadybugConcurrencyEvidenceRecord["checkpoint"],
  snapshot: BenchmarkSourceSnapshot,
  recoveryOutcome: LadybugConcurrencyEvidenceRecord["recoveryOutcome"] = "not-applicable",
): LadybugConcurrencyEvidenceRecord {
  return {
    scenario,
    checkpoint,
    sourceBefore: snapshot,
    sourceAfter: snapshot,
    cache: snapshot,
    generationCount: 1,
    deterministicResultDigest: SHA,
    recoveryOutcome,
    nativeConflict: scenario === "writer-race-live-lock" ? "read-write-compatible" : null,
    cacheContained: true,
    stagingAbsent: true,
    writerLockAbsent: true,
    scratchRemoved: true,
  };
}

function artifact<T>(name: string, value: T): QualificationEvidenceArtifact<T> {
  return { name, value, bytes: Buffer.from(`${JSON.stringify(value)}\n`) };
}
