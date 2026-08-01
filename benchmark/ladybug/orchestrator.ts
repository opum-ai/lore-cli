/** Benchmark-private fresh-process orchestration and parity enforcement. */

import { join } from "node:path";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../../src/core/ladybug-native";
import { loadLadybugProjectionSource } from "../../src/core/ladybug-source";
import {
  assertLadybugBenchmarkSourcesUnchanged,
  canonicalProjectionByteLength,
  ladybugCacheLogicalBytes,
  snapshotLadybugBenchmarkSources,
} from "./accounting";
import { createLadybugBenchmarkBacklogAdapter, type LadybugBenchmarkFixtureSpec } from "./fixture";
import {
  type BenchmarkOperation,
  type BenchmarkPolicy,
  LADYBUG_BENCHMARK_WORKER_REQUEST_SCHEMA,
  type LadybugBenchmarkWorkerRequest,
  type LadybugBenchmarkWorkerResult,
  parseLadybugBenchmarkWorkerResult,
} from "./protocol";

export interface LadybugBenchmarkScenario {
  readonly id: string;
  readonly operation: Exclude<BenchmarkOperation, { kind: "projection-cold" }>;
}

export interface LadybugBenchmarkSubprocessSample {
  readonly result: LadybugBenchmarkWorkerResult;
  readonly wallNanoseconds: number;
  readonly cpuMicroseconds: {
    readonly user: number;
    readonly system: number;
    readonly total: number;
  };
  readonly maxRSSBytes: number;
  readonly cacheLogicalBytesBefore: number;
  readonly cacheLogicalBytesAfter: number;
  readonly sourceDigest: string;
}

export interface LadybugBenchmarkPolicyPair {
  readonly scenario: LadybugBenchmarkScenario;
  readonly order: readonly [BenchmarkPolicy, BenchmarkPolicy];
  readonly samples: readonly [LadybugBenchmarkSubprocessSample, LadybugBenchmarkSubprocessSample];
}

export interface LadybugBenchmarkPass {
  readonly canonicalInputBytes: number;
  readonly coldBuild: LadybugBenchmarkSubprocessSample;
  readonly parity: readonly LadybugBenchmarkPolicyPair[];
  readonly measured: readonly LadybugBenchmarkPolicyPair[];
}

export function ladybugBenchmarkScenarios(spec: LadybugBenchmarkFixtureSpec): LadybugBenchmarkScenario[] {
  const scenarios: LadybugBenchmarkScenario[] = [{ id: "warm-open", operation: { kind: "warm-open" } }];
  scenarios.push({ id: "graph-full", operation: { kind: "graph" } });
  for (const depth of spec.coverage.graphDepths) {
    scenarios.push({ id: `graph-depth-${depth}`, operation: { kind: "graph", root: "index", depth } });
  }
  for (const query of spec.coverage.queries) {
    scenarios.push({
      id: `query-${query.id}`,
      operation: { kind: "query", text: query.text, limit: spec.counts.concepts },
    });
  }
  for (const depth of spec.coverage.graphDepths) {
    for (const maxTokens of spec.coverage.contextBudgets) {
      scenarios.push({
        id: `context-depth-${depth}-tokens-${maxTokens}`,
        operation: { kind: "context", root: "index", depth, maxTokens },
      });
    }
  }
  return scenarios;
}

/** The bounded timing envelope; the full scenario matrix remains in smoke/tests. */
export function ladybugQualificationScenarios(spec: LadybugBenchmarkFixtureSpec): LadybugBenchmarkScenario[] {
  const all = ladybugBenchmarkScenarios(spec);
  const ids = ["warm-open", "query-rare", "graph-depth-2", "context-depth-2-tokens-16384"];
  return ids.map((id) => {
    const scenario = all.find((candidate) => candidate.id === id);
    if (scenario === undefined) throw new Error(`benchmark fixture is missing representative scenario ${id}`);
    return scenario;
  });
}

/**
 * Run one non-qualification smoke pass. Every result is proven identical before
 * any measured policy pair begins; repetitions/statistics/reporting belong to plan item 3.
 */
export async function runLadybugBenchmarkPass(options: {
  readonly root: string;
  readonly scenarios: readonly LadybugBenchmarkScenario[];
  readonly order?: readonly [BenchmarkPolicy, BenchmarkPolicy];
}): Promise<LadybugBenchmarkPass> {
  const order = options.order ?? (["indexed", "reference"] as const);
  assertPolicyOrder(order);
  const canonicalInputBytes = await measureCanonicalInputBytes(options.root);
  const coldBuild = await spawnLadybugBenchmarkWorker(options.root, "indexed", { kind: "projection-cold" });
  const parity: LadybugBenchmarkPolicyPair[] = [];
  for (const scenario of options.scenarios) {
    parity.push(await runLadybugBenchmarkPolicyPair(options.root, scenario, ["reference", "indexed"]));
  }
  const measured: LadybugBenchmarkPolicyPair[] = [];
  for (const scenario of options.scenarios) {
    measured.push(await runLadybugBenchmarkPolicyPair(options.root, scenario, order));
  }
  return { canonicalInputBytes, coldBuild, parity, measured };
}

export async function spawnLadybugBenchmarkWorker(
  root: string,
  policy: BenchmarkPolicy,
  operation: BenchmarkOperation,
): Promise<LadybugBenchmarkSubprocessSample> {
  const request: LadybugBenchmarkWorkerRequest = {
    schema: LADYBUG_BENCHMARK_WORKER_REQUEST_SCHEMA,
    root,
    policy,
    operation,
  };
  const before = snapshotLadybugBenchmarkSources(root);
  const cacheLogicalBytesBefore = ladybugCacheLogicalBytes(root);
  const started = process.hrtime.bigint();
  const workerPath = join(import.meta.dir, "worker.ts");
  const subprocess = Bun.spawn([process.execPath, workerPath, JSON.stringify(request)], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const stdoutPromise = new Response(subprocess.stdout).text();
  const stderrPromise = new Response(subprocess.stderr).text();
  const exitCode = await subprocess.exited;
  const wallNanoseconds = elapsedNanoseconds(started);
  const stdout = await stdoutPromise;
  const stderr = await stderrPromise;
  const usage = subprocess.resourceUsage();
  const after = snapshotLadybugBenchmarkSources(root);
  assertLadybugBenchmarkSourcesUnchanged(before, after);
  if (exitCode !== 0) {
    throw new Error(`ladybug benchmark worker exited ${exitCode}: ${stderr.trim() || "no diagnostic"}`);
  }
  if (stderr !== "") throw new Error(`ladybug benchmark worker emitted stderr: ${stderr.trim()}`);
  if (usage === undefined) throw new Error("Bun did not provide completed subprocess resource usage");
  const result = parseLadybugBenchmarkWorkerResult(JSON.parse(stdout) as unknown);
  if (result.policy !== policy || JSON.stringify(result.operation) !== JSON.stringify(operation)) {
    throw new Error("ladybug benchmark worker result did not echo the requested policy and operation");
  }
  return {
    result,
    wallNanoseconds,
    cpuMicroseconds: {
      user: resourceCounter(usage.cpuTime.user, "user CPU microseconds"),
      system: resourceCounter(usage.cpuTime.system, "system CPU microseconds"),
      total: resourceCounter(usage.cpuTime.total, "total CPU microseconds"),
    },
    maxRSSBytes: resourceCounter(usage.maxRSS, "max RSS bytes"),
    cacheLogicalBytesBefore,
    cacheLogicalBytesAfter: ladybugCacheLogicalBytes(root),
    sourceDigest: before.digest,
  };
}

export async function runLadybugBenchmarkPolicyPair(
  root: string,
  scenario: LadybugBenchmarkScenario,
  order: readonly [BenchmarkPolicy, BenchmarkPolicy],
): Promise<LadybugBenchmarkPolicyPair> {
  assertPolicyOrder(order);
  const first = await spawnLadybugBenchmarkWorker(root, order[0], scenario.operation);
  const second = await spawnLadybugBenchmarkWorker(root, order[1], scenario.operation);
  if (first.result.resultDigest !== second.result.resultDigest) {
    throw new Error(
      `indexed/reference result digest mismatch for ${scenario.id}: ${first.result.resultDigest} != ${second.result.resultDigest}`,
    );
  }
  if (first.result.emittedBytes !== second.result.emittedBytes) {
    throw new Error(`indexed/reference emitted-byte mismatch for ${scenario.id}`);
  }
  return { scenario, order, samples: [first, second] };
}

function assertPolicyOrder(order: readonly [BenchmarkPolicy, BenchmarkPolicy]): void {
  if (order[0] === order[1] || !order.includes("indexed") || !order.includes("reference")) {
    throw new Error("benchmark policy order must contain indexed and reference exactly once");
  }
}

export async function measureCanonicalInputBytes(root: string): Promise<number> {
  const before = snapshotLadybugBenchmarkSources(root);
  const source = await loadLadybugProjectionSource({
    root,
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    adapter: createLadybugBenchmarkBacklogAdapter(root),
  });
  const after = snapshotLadybugBenchmarkSources(root);
  assertLadybugBenchmarkSourcesUnchanged(before, after);
  return canonicalProjectionByteLength(source);
}

function elapsedNanoseconds(started: bigint): number {
  const value = Number(process.hrtime.bigint() - started);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("benchmark duration exceeded safe integer range");
  return value;
}

function resourceCounter(value: number | bigint, label: string): number {
  const normalized = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`benchmark ${label} exceeded safe integer range`);
  }
  return normalized;
}
