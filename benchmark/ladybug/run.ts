#!/usr/bin/env bun
/** Executable report runner for lore.ladybug-benchmark/1. */

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../../src/core/ladybug-native";
import { VERSION } from "../../src/meta";
import {
  type GeneratedLadybugBenchmarkFixture,
  generateLadybugBenchmarkFixture,
  type LadybugBenchmarkFixtureSpec,
  loadLadybugBenchmarkFixtureSpec,
} from "./fixture";
import { evaluateLadybugBenchmarkGates } from "./gates";
import {
  type LadybugBenchmarkPolicyPair,
  type LadybugBenchmarkScenario,
  type LadybugBenchmarkSubprocessSample,
  ladybugBenchmarkScenarios,
  ladybugQualificationScenarios,
  measureCanonicalInputBytes,
  runLadybugBenchmarkPolicyPair,
  runLadybugBenchmarkSessionPair,
  spawnLadybugBenchmarkWorker,
} from "./orchestrator";
import type { BenchmarkPolicy } from "./protocol";
import {
  calibrationReport,
  LADYBUG_BENCHMARK_CALIBRATION_CV_LIMIT,
  LADYBUG_BENCHMARK_REPORT_SCHEMA,
  type LadybugBenchmarkFixtureReport,
  type LadybugBenchmarkMode,
  type LadybugBenchmarkRawSample,
  type LadybugBenchmarkReport,
  type LadybugBenchmarkRunConfiguration,
  type LadybugBenchmarkSamplePhase,
  stableReportJson,
  summarizeLadybugBenchmarkFixture,
} from "./report";

const REPOSITORY_ROOT = resolve(import.meta.dir, "..", "..");
const FIXTURE_ROOT = join(import.meta.dir, "fixtures", "v1");
export const LADYBUG_BENCHMARK_QUALIFICATION_BUN_VERSION = "1.3.14";

export interface LadybugBenchmarkCliOptions {
  readonly fixtureNames: readonly ("small" | "large")[];
  readonly output: string;
  readonly mode: LadybugBenchmarkMode;
  readonly runnerImage: string;
}

export function qualificationRunConfiguration(mode: LadybugBenchmarkMode): LadybugBenchmarkRunConfiguration {
  if (mode === "smoke") {
    return {
      mode,
      coldSetupRepetitions: 1,
      coldRepetitions: 1,
      warmups: 0,
      repetitions: 1,
      batches: 1,
      bootstrapIterations: 200,
      confidence: 0.95,
      calibrationWarmups: 1,
      calibrationRepetitions: 5,
      calibrationCoefficientOfVariationLimit: LADYBUG_BENCHMARK_CALIBRATION_CV_LIMIT,
    };
  }
  return {
    mode,
    coldSetupRepetitions: 0,
    coldRepetitions: 1,
    warmups: 0,
    repetitions: 5,
    batches: 1,
    bootstrapIterations: 1_000,
    confidence: 0.95,
    calibrationWarmups: 1,
    calibrationRepetitions: 5,
    calibrationCoefficientOfVariationLimit: LADYBUG_BENCHMARK_CALIBRATION_CV_LIMIT,
  };
}

export function parseLadybugBenchmarkCliArgs(args: readonly string[], cwd = process.cwd()): LadybugBenchmarkCliOptions {
  const fixtureNames: Array<"small" | "large"> = [];
  let output: string | undefined;
  let mode: LadybugBenchmarkMode = "qualification";
  let runnerImage = inferredRunnerImage();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index] as string;
    if (argument === "--fixture") {
      const value = requiredValue(args, ++index, argument);
      if (value !== "small" && value !== "large") throw new Error(`unknown Ladybug benchmark fixture: ${value}`);
      if (!fixtureNames.includes(value)) fixtureNames.push(value);
      continue;
    }
    if (argument === "--output") {
      output = requiredValue(args, ++index, argument);
      continue;
    }
    if (argument === "--runner-image") {
      runnerImage = requiredValue(args, ++index, argument);
      continue;
    }
    if (argument === "--smoke") {
      mode = "smoke";
      continue;
    }
    if (argument === "--observation-1gib") {
      mode = "observation";
      continue;
    }
    if (argument === "--help" || argument === "-h") throw new BenchmarkHelp();
    throw new Error(`unknown Ladybug benchmark option: ${argument}`);
  }
  if (fixtureNames.length === 0) throw new Error("at least one --fixture small|large is required");
  if (output === undefined) throw new Error("--output <path> is required");
  if (runnerImage.trim() === "") throw new Error("--runner-image must not be empty");
  if (mode === "observation" && (fixtureNames.length !== 1 || fixtureNames[0] !== "large")) {
    throw new Error("--observation-1gib requires exactly --fixture large");
  }
  return {
    fixtureNames,
    output: isAbsolute(output) ? output : resolve(cwd, output),
    mode,
    runnerImage,
  };
}

export async function runLadybugBenchmarkReport(options: LadybugBenchmarkCliOptions): Promise<LadybugBenchmarkReport> {
  assertLadybugBenchmarkRuntime(options.mode);
  const configuration = qualificationRunConfiguration(options.mode);
  assertConfiguration(configuration);
  const calibration = calibrationReport(
    runCalibration(configuration.calibrationWarmups, configuration.calibrationRepetitions),
    configuration.calibrationWarmups,
    configuration.calibrationCoefficientOfVariationLimit,
  );
  const fixtures: LadybugBenchmarkFixtureReport[] = [];
  for (const name of options.fixtureNames) {
    const loaded = loadLadybugBenchmarkFixtureSpec(join(FIXTURE_ROOT, `${name}.json`));
    const spec = options.mode === "observation" ? oneGiBObservationSpec(loaded) : loaded;
    fixtures.push(await runFixture(spec, configuration));
  }
  const repository = repositoryFacts(REPOSITORY_ROOT);
  const cpu = cpus();
  const gates = evaluateLadybugBenchmarkGates({ mode: options.mode, configuration, calibration, fixtures });
  const report: LadybugBenchmarkReport = {
    schema: LADYBUG_BENCHMARK_REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    toolchain: {
      loreVersion: VERSION,
      bunVersion: Bun.version,
      nodeVersion: process.versions.node,
      ladybugPackageVersion: EXPECTED_LADYBUG_VERSION,
      ladybugRuntimeVersion: EXPECTED_LADYBUG_VERSION,
      ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    },
    host: {
      platform: platform(),
      arch: process.arch,
      osRelease: release(),
      runnerImage: options.runnerImage,
      cpuModel: cpu[0]?.model.trim() || "unknown",
      logicalCpuCount: Math.max(cpu.length, 1),
      ramBytes: totalmem(),
    },
    repository,
    configuration,
    calibration,
    fixtures,
    gates,
  };
  return report;
}

export function assertLadybugBenchmarkRuntime(mode: LadybugBenchmarkMode, bunVersion = Bun.version): void {
  if (mode !== "smoke" && bunVersion !== LADYBUG_BENCHMARK_QUALIFICATION_BUN_VERSION) {
    throw new Error(
      `Ladybug qualification requires Bun ${LADYBUG_BENCHMARK_QUALIFICATION_BUN_VERSION}; observed ${bunVersion}. Use --smoke only for functional evidence.`,
    );
  }
}

export function randomizedPolicyOrders(
  seed: number,
  count: number,
): Array<readonly [BenchmarkPolicy, BenchmarkPolicy]> {
  if (!Number.isInteger(count) || count < 1) throw new Error("policy-order count must be a positive integer");
  const orders: Array<readonly [BenchmarkPolicy, BenchmarkPolicy]> = Array.from({ length: count }, (_, index) =>
    index % 2 === 0 ? (["indexed", "reference"] as const) : (["reference", "indexed"] as const),
  );
  const random = xorshift32(seed);
  for (let index = orders.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    const held = orders[index] as readonly [BenchmarkPolicy, BenchmarkPolicy];
    orders[index] = orders[target] as readonly [BenchmarkPolicy, BenchmarkPolicy];
    orders[target] = held;
  }
  return orders;
}

async function runFixture(
  spec: LadybugBenchmarkFixtureSpec,
  configuration: LadybugBenchmarkRunConfiguration,
): Promise<LadybugBenchmarkFixtureReport> {
  const temporaryRoots: string[] = [];
  const samples: LadybugBenchmarkRawSample[] = [];
  let sequence = 0;
  try {
    const warmFixture = generate(spec, temporaryRoots, "warm");
    benchmarkProgress(`${spec.name}: generated ${spec.counts.markdownBodyBytes} authored Markdown bytes`);
    if (configuration.mode !== "observation") assertFixtureDigests(warmFixture);
    const reportSpec = configuration.mode === "observation" ? { ...spec, expected: warmFixture.digests } : spec;
    const canonicalInputBytes = await measureCanonicalInputBytes(warmFixture.root);
    for (let repetition = 1; repetition <= configuration.coldSetupRepetitions; repetition++) {
      const setupFixture = generate(spec, temporaryRoots, `setup-${repetition}`);
      const setup = await spawnLadybugBenchmarkWorker(setupFixture.root, "indexed", { kind: "projection-cold" });
      samples.push(
        rawSample({
          sequence: sequence++,
          phase: "cold-setup",
          batch: null,
          repetition,
          pairId: null,
          scenarioId: "projection-cold",
          order: ["indexed"],
          canonicalInputBytes,
          sample: setup,
        }),
      );
      cleanupRoot(setupFixture.root);
      temporaryRoots.splice(temporaryRoots.indexOf(setupFixture.root), 1);
    }

    benchmarkProgress(`${spec.name}: starting the single cold projection build`);
    const cold = await spawnLadybugBenchmarkWorker(warmFixture.root, "indexed", { kind: "projection-cold" });
    samples.push(
      rawSample({
        sequence: sequence++,
        phase: "cold-measurement",
        batch: null,
        repetition: 1,
        pairId: null,
        scenarioId: "projection-cold",
        order: ["indexed"],
        canonicalInputBytes,
        sample: cold,
      }),
    );

    const scenarios =
      configuration.mode === "smoke" ? ladybugBenchmarkScenarios(spec) : ladybugQualificationScenarios(spec);
    if (configuration.mode === "smoke") {
      for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
        const scenario = scenarios[scenarioIndex] as LadybugBenchmarkScenario;
        const pair = await runLadybugBenchmarkPolicyPair(warmFixture.root, scenario, ["reference", "indexed"]);
        sequence = appendPair(samples, sequence, pair, "parity", null, 1, `parity:${scenario.id}`, canonicalInputBytes);
      }
    }

    const warmupOrders = scenarios.map((_, index) =>
      randomizedPolicyOrders(spec.seed ^ 0x1357_9bdf ^ index, Math.max(configuration.warmups, 1)),
    );
    for (let repetition = 1; repetition <= configuration.warmups; repetition++) {
      for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
        const scenario = scenarios[scenarioIndex] as LadybugBenchmarkScenario;
        const order = (warmupOrders[scenarioIndex] as Array<readonly [BenchmarkPolicy, BenchmarkPolicy]>)[
          repetition - 1
        ] as readonly [BenchmarkPolicy, BenchmarkPolicy];
        const pair = await runLadybugBenchmarkPolicyPair(warmFixture.root, scenario, order);
        sequence = appendPair(
          samples,
          sequence,
          pair,
          "warmup",
          null,
          repetition,
          `warmup:${scenario.id}:${padded(repetition)}`,
          canonicalInputBytes,
        );
      }
    }

    if (configuration.mode === "smoke") {
      const measuredOrders = scenarios.map((_, index) =>
        randomizedPolicyOrders(spec.seed ^ 0x2468_ace0 ^ index, configuration.repetitions),
      );
      const repetitionsPerBatch = configuration.repetitions / configuration.batches;
      for (let batch = 1; batch <= configuration.batches; batch++) {
        for (let inBatch = 1; inBatch <= repetitionsPerBatch; inBatch++) {
          const repetition = (batch - 1) * repetitionsPerBatch + inBatch;
          for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
            const scenario = scenarios[scenarioIndex] as LadybugBenchmarkScenario;
            const order = (measuredOrders[scenarioIndex] as Array<readonly [BenchmarkPolicy, BenchmarkPolicy]>)[
              repetition - 1
            ] as readonly [BenchmarkPolicy, BenchmarkPolicy];
            const pair = await runLadybugBenchmarkPolicyPair(warmFixture.root, scenario, order);
            sequence = appendPair(
              samples,
              sequence,
              pair,
              "measurement",
              batch,
              repetition,
              `measurement:${scenario.id}:${padded(repetition)}`,
              canonicalInputBytes,
            );
          }
        }
      }
    } else {
      const orders = randomizedPolicyOrders(spec.seed ^ 0x2468_ace0, configuration.repetitions);
      for (let repetition = 1; repetition <= configuration.repetitions; repetition++) {
        const order = orders[repetition - 1] as readonly [BenchmarkPolicy, BenchmarkPolicy];
        benchmarkProgress(`${spec.name}: warm session ${repetition}/${configuration.repetitions} (${order.join("/")})`);
        const pairs = await runLadybugBenchmarkSessionPair(warmFixture.root, scenarios, order);
        for (const pair of pairs) {
          sequence = appendPair(
            samples,
            sequence,
            pair,
            "measurement",
            1,
            repetition,
            `measurement:${pair.scenario.id}:${padded(repetition)}`,
            canonicalInputBytes,
          );
        }
      }
    }

    return summarizeLadybugBenchmarkFixture({
      spec: reportSpec,
      canonicalInputBytes,
      scenarios,
      samples,
      bootstrapIterations: configuration.bootstrapIterations,
    });
  } finally {
    for (const root of temporaryRoots.reverse()) cleanupRoot(root);
  }
}

function appendPair(
  samples: LadybugBenchmarkRawSample[],
  sequence: number,
  pair: LadybugBenchmarkPolicyPair,
  phase: Extract<LadybugBenchmarkSamplePhase, "parity" | "warmup" | "measurement">,
  batch: number | null,
  repetition: number,
  pairId: string,
  canonicalInputBytes: number,
): number {
  let nextSequence = sequence;
  for (const sample of pair.samples) {
    samples.push(
      rawSample({
        sequence: nextSequence++,
        phase,
        batch,
        repetition,
        pairId,
        scenarioId: pair.scenario.id,
        order: pair.order,
        canonicalInputBytes,
        sample,
      }),
    );
  }
  return nextSequence;
}

function rawSample(options: {
  readonly sequence: number;
  readonly phase: LadybugBenchmarkSamplePhase;
  readonly batch: number | null;
  readonly repetition: number;
  readonly pairId: string | null;
  readonly scenarioId: string;
  readonly order: readonly BenchmarkPolicy[];
  readonly canonicalInputBytes: number;
  readonly sample: LadybugBenchmarkSubprocessSample;
}): LadybugBenchmarkRawSample {
  return {
    sequence: options.sequence,
    phase: options.phase,
    batch: options.batch,
    repetition: options.repetition,
    pairId: options.pairId,
    scenarioId: options.scenarioId,
    policy: options.sample.result.policy,
    order: options.order,
    resultDigest: options.sample.result.resultDigest,
    operationNanoseconds: options.sample.result.operationNanoseconds,
    wallNanoseconds: options.sample.wallNanoseconds,
    cpuMicroseconds: options.sample.cpuMicroseconds,
    maxRSSBytes: options.sample.maxRSSBytes,
    canonicalInputBytes: options.canonicalInputBytes,
    emittedBytes: options.sample.result.emittedBytes,
    diagnosticBytes: options.sample.result.diagnosticBytes,
    cacheLogicalBytesBefore: options.sample.cacheLogicalBytesBefore,
    cacheLogicalBytesAfter: options.sample.cacheLogicalBytesAfter,
    sourceDigest: options.sample.sourceDigest,
  };
}

function generate(spec: LadybugBenchmarkFixtureSpec, roots: string[], label: string): GeneratedLadybugBenchmarkFixture {
  const root = mkdtempSync(join(tmpdir(), `lore-ladybug-${spec.name}-${label}-`));
  roots.push(root);
  return generateLadybugBenchmarkFixture(spec, root);
}

function assertFixtureDigests(fixture: GeneratedLadybugBenchmarkFixture): void {
  const actual = fixture.digests;
  const expected = fixture.spec.expected;
  for (const key of ["canonicalExportSha256", "sourceInventorySha256", "taskSnapshotSha256"] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${fixture.spec.name}: fixture ${key} drifted: ${actual[key]} != ${expected[key]}`);
    }
  }
}

function cleanupRoot(root: string): void {
  const relativeRoot = relative(tmpdir(), root);
  if (
    !isAbsolute(root) ||
    relativeRoot === "" ||
    relativeRoot.startsWith("..") ||
    isAbsolute(relativeRoot) ||
    !relativeRoot.startsWith("lore-ladybug-")
  ) {
    throw new Error(`refusing to remove non-benchmark temporary root: ${root}`);
  }
  makeWritable(root);
  rmSync(root, { recursive: true, force: true });
}

function makeWritable(path: string): void {
  try {
    chmodSync(path, 0o700);
  } catch {
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) makeWritable(join(path, entry.name));
  }
}

function runCalibration(warmups: number, repetitions: number): number[] {
  const payload = Buffer.alloc(1024 * 1024, 0xa5);
  const one = (): number => {
    const started = process.hrtime.bigint();
    for (let iteration = 0; iteration < 16; iteration++) createHash("sha256").update(payload).digest();
    const elapsed = Number(process.hrtime.bigint() - started);
    if (!Number.isSafeInteger(elapsed) || elapsed < 0) throw new Error("calibration duration exceeded safe range");
    return elapsed;
  };
  for (let index = 0; index < warmups; index++) one();
  return Array.from({ length: repetitions }, one);
}

function benchmarkProgress(message: string): void {
  process.stderr.write(`[ladybug-benchmark] ${message}\n`);
}

function repositoryFacts(root: string): LadybugBenchmarkReport["repository"] {
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const status = Bun.spawnSync(["git", "status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (status.exitCode !== 0) throw new Error(`git status failed: ${status.stderr.toString("utf8").trim()}`);
  const commit = head.exitCode === 0 ? head.stdout.toString("utf8").trim() : null;
  if (commit !== null && !/^[0-9a-f]{40}$/.test(commit)) throw new Error("git returned an invalid benchmark commit");
  return { commit, dirty: status.stdout.byteLength > 0 };
}

function assertConfiguration(configuration: LadybugBenchmarkRunConfiguration): void {
  if (configuration.coldRepetitions !== 1) throw new Error("bounded benchmark must contain exactly one cold build");
  if (configuration.repetitions % configuration.batches !== 0) {
    throw new Error("warm benchmark repetitions must divide evenly across batches");
  }
}

function oneGiBObservationSpec(spec: LadybugBenchmarkFixtureSpec): LadybugBenchmarkFixtureSpec {
  return {
    ...spec,
    seed: spec.seed ^ 0x1_0000,
    counts: { ...spec.counts, markdownBodyBytes: 1024 * 1024 * 1024 },
    expected: {
      canonicalExportSha256: `sha256:${"0".repeat(64)}`,
      sourceInventorySha256: `sha256:${"0".repeat(64)}`,
      taskSnapshotSha256: `sha256:${"0".repeat(64)}`,
    },
  };
}

function inferredRunnerImage(): string {
  const explicit = process.env.LORE_LADYBUG_RUNNER_IMAGE;
  if (explicit !== undefined && explicit.trim() !== "") return explicit.trim();
  const imageOS = process.env.ImageOS;
  const imageVersion = process.env.ImageVersion;
  return imageOS && imageVersion ? `${imageOS}-${imageVersion}` : "local-unmanaged";
}

function requiredValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function padded(value: number): string {
  return String(value).padStart(6, "0");
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

class BenchmarkHelp extends Error {}

function usage(): string {
  return [
    "Usage: bun benchmark/ladybug/run.ts --fixture small [--fixture large] --output <path> [options]",
    "",
    "Options:",
    "  --fixture small|large  Repeat for each fixture to include",
    "  --output <path>        Ordered lore.ladybug-benchmark/1 JSON report",
    "  --runner-image <id>    Exact runner image identifier (or LORE_LADYBUG_RUNNER_IMAGE)",
    "  --smoke                One-repetition functional run; never qualification evidence",
    "  --observation-1gib     Non-blocking 1 GiB informational run (requires --fixture large)",
    "  -h, --help             Show this help",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  let options: LadybugBenchmarkCliOptions;
  try {
    options = parseLadybugBenchmarkCliArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof BenchmarkHelp) {
      process.stdout.write(usage());
      return;
    }
    throw error;
  }
  const report = await runLadybugBenchmarkReport(options);
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, stableReportJson(report), { flag: "w" });
  process.stdout.write(`${options.output}\n`);
  if (report.mode === "smoke") {
    if (report.calibration.status === "inconclusive") process.exitCode = 2;
  } else if (report.gates.evaluation.status === "fail") {
    process.exitCode = 1;
  } else if (report.gates.evaluation.status === "inconclusive") {
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
