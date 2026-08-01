/** Fresh-process worker for benchmark-private indexed/reference qualification. */

import { isAbsolute } from "node:path";
import { run } from "../../src/cli";
import { buildGraphExport } from "../../src/core/graph";
import { loadRetrievalGraph, type RetrievalGraph, type RetrievalGraphLoader } from "../../src/core/retrieval";
import type { Writer } from "../../src/errors";
import { benchmarkDigest, ladybugGenerationCount } from "./accounting";
import { createLadybugBenchmarkBacklogAdapter } from "./fixture";
import {
  type BenchmarkOperation,
  type BenchmarkPolicy,
  LADYBUG_BENCHMARK_SESSION_REQUEST_SCHEMA,
  LADYBUG_BENCHMARK_SESSION_RESULT_SCHEMA,
  LADYBUG_BENCHMARK_WORKER_REQUEST_SCHEMA,
  LADYBUG_BENCHMARK_WORKER_RESULT_SCHEMA,
  type LadybugBenchmarkSessionRequest,
  type LadybugBenchmarkSessionResult,
  type LadybugBenchmarkWorkerRequest,
  type LadybugBenchmarkWorkerResult,
  parseLadybugBenchmarkSessionRequest,
  parseLadybugBenchmarkWorkerRequest,
} from "./protocol";

export async function executeLadybugBenchmarkWorker(
  request: LadybugBenchmarkWorkerRequest,
): Promise<LadybugBenchmarkWorkerResult> {
  if (!isAbsolute(request.root)) throw new Error("benchmark worker root must be absolute");
  assertGenerationState(request.root, request.policy, request.operation);

  if (request.operation.kind === "projection-cold" || request.operation.kind === "warm-open") {
    const started = process.hrtime.bigint();
    const loaded = await load(request.root, request.policy);
    const operationNanoseconds = elapsedNanoseconds(started);
    assertBackend(request.policy, loaded);
    if (request.operation.kind === "projection-cold" && ladybugGenerationCount(request.root) !== 1) {
      throw new Error("projection-cold worker did not publish exactly one immutable generation");
    }
    const resultBytes = JSON.stringify(buildGraphExport(loaded.graph));
    return workerResult(request, loaded, operationNanoseconds, resultBytes, 0, "");
  }

  const loaded = await load(request.root, request.policy);
  assertBackend(request.policy, loaded);
  const stdout = capture();
  const stderr = capture();
  const retrieval: RetrievalGraphLoader = async () => loaded;
  const args = commandArgs(request.operation);
  const started = process.hrtime.bigint();
  const code = await run([process.execPath, "lore", ...args], {
    cwd: request.root,
    stdout,
    stderr,
    isTTY: false,
    stderrIsTTY: false,
    env: {},
    retrieval,
  });
  const operationNanoseconds = elapsedNanoseconds(started);
  if (code !== 0) throw new Error(`benchmark command ${request.operation.kind} exited ${code}: ${stderr.text()}`);
  const emitted = stdout.text();
  return workerResult(request, loaded, operationNanoseconds, emitted, Buffer.byteLength(emitted), stderr.text());
}

export async function executeLadybugBenchmarkSessionWorker(
  request: LadybugBenchmarkSessionRequest,
): Promise<LadybugBenchmarkSessionResult> {
  if (!isAbsolute(request.root)) throw new Error("benchmark session root must be absolute");
  if (
    request.operations[0]?.kind !== "warm-open" ||
    request.operations.slice(1).some(({ kind }) => kind === "warm-open")
  ) {
    throw new Error("benchmark session must begin with exactly one warm-open operation");
  }
  assertGenerationState(request.root, request.policy, request.operations[0]);
  const cpuStarted = process.cpuUsage();
  const started = process.hrtime.bigint();
  const loaded = await load(request.root, request.policy);
  const operationNanoseconds = elapsedNanoseconds(started);
  const cpuMicroseconds = operationCpuMicroseconds(cpuStarted);
  assertBackend(request.policy, loaded);
  const warmOpenRequest: LadybugBenchmarkWorkerRequest = {
    schema: LADYBUG_BENCHMARK_WORKER_REQUEST_SCHEMA,
    root: request.root,
    policy: request.policy,
    operation: request.operations[0],
  };
  const samples: LadybugBenchmarkSessionResult["samples"] = [
    {
      result: workerResult(
        warmOpenRequest,
        loaded,
        operationNanoseconds,
        JSON.stringify(buildGraphExport(loaded.graph)),
        0,
        "",
      ),
      cpuMicroseconds,
    },
  ];
  for (const operation of request.operations.slice(1)) {
    if (operation.kind === "projection-cold") throw new Error("benchmark session cannot contain a cold build");
    const operationRequest: LadybugBenchmarkWorkerRequest = {
      schema: LADYBUG_BENCHMARK_WORKER_REQUEST_SCHEMA,
      root: request.root,
      policy: request.policy,
      operation,
    };
    samples.push(await executeLoadedOperation(operationRequest, loaded));
  }
  return {
    schema: LADYBUG_BENCHMARK_SESSION_RESULT_SCHEMA,
    policy: request.policy,
    backend: loaded.backend,
    samples,
  };
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (raw === undefined || process.argv.length !== 3) {
    throw new Error("usage: bun benchmark/ladybug/worker.ts '<worker-request-json>'");
  }
  const value = JSON.parse(raw) as { schema?: unknown };
  const result =
    value.schema === LADYBUG_BENCHMARK_SESSION_REQUEST_SCHEMA
      ? await executeLadybugBenchmarkSessionWorker(parseLadybugBenchmarkSessionRequest(value))
      : await executeLadybugBenchmarkWorker(parseLadybugBenchmarkWorkerRequest(value));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function executeLoadedOperation(
  request: LadybugBenchmarkWorkerRequest,
  loaded: RetrievalGraph,
): Promise<LadybugBenchmarkSessionResult["samples"][number]> {
  if (request.operation.kind === "projection-cold" || request.operation.kind === "warm-open") {
    throw new Error("loaded benchmark operation must be graph, query, or context");
  }
  const stdout = capture();
  const stderr = capture();
  const retrieval: RetrievalGraphLoader = async () => loaded;
  const args = commandArgs(request.operation);
  const cpuStarted = process.cpuUsage();
  const started = process.hrtime.bigint();
  const code = await run([process.execPath, "lore", ...args], {
    cwd: request.root,
    stdout,
    stderr,
    isTTY: false,
    stderrIsTTY: false,
    env: {},
    retrieval,
  });
  const measured = elapsedNanoseconds(started);
  const cpuMicroseconds = operationCpuMicroseconds(cpuStarted);
  if (code !== 0) throw new Error(`benchmark command ${request.operation.kind} exited ${code}: ${stderr.text()}`);
  const emitted = stdout.text();
  return {
    result: workerResult(request, loaded, measured, emitted, Buffer.byteLength(emitted), stderr.text()),
    cpuMicroseconds,
  };
}

function operationCpuMicroseconds(started: NodeJS.CpuUsage): { user: number; system: number; total: number } {
  const { user, system } = process.cpuUsage(started);
  return { user, system, total: user + system };
}

function load(root: string, policy: BenchmarkPolicy): Promise<RetrievalGraph> {
  return loadRetrievalGraph({ root, policy, adapter: createLadybugBenchmarkBacklogAdapter(root) });
}

function workerResult(
  request: LadybugBenchmarkWorkerRequest,
  loaded: RetrievalGraph,
  operationNanoseconds: number,
  resultBytes: string,
  emittedBytes: number,
  diagnostic: string,
): LadybugBenchmarkWorkerResult {
  return {
    schema: LADYBUG_BENCHMARK_WORKER_RESULT_SCHEMA,
    policy: request.policy,
    operation: request.operation,
    backend: loaded.backend,
    operationNanoseconds,
    resultDigest: benchmarkDigest(resultBytes),
    emittedBytes,
    diagnosticBytes: Buffer.byteLength(diagnostic),
  };
}

function assertGenerationState(root: string, policy: BenchmarkPolicy, operation: BenchmarkOperation): void {
  const generations = ladybugGenerationCount(root);
  if (operation.kind === "projection-cold") {
    if (policy !== "indexed") throw new Error("projection-cold is defined only for the indexed policy");
    if (generations !== 0) throw new Error("projection-cold requires no existing immutable generation");
    return;
  }
  if (policy === "indexed" && generations === 0) {
    throw new Error(`${operation.kind} requires an existing immutable generation for indexed policy`);
  }
}

function assertBackend(policy: BenchmarkPolicy, loaded: RetrievalGraph): void {
  if (loaded.backend !== policy) {
    throw new Error(`benchmark requested ${policy} policy but observed ${loaded.backend} backend`);
  }
}

function commandArgs(operation: Exclude<BenchmarkOperation, { kind: "projection-cold" | "warm-open" }>): string[] {
  if (operation.kind === "graph") {
    return [
      "graph",
      ...(operation.root === undefined ? [] : [operation.root]),
      ...(operation.depth === undefined ? [] : ["--depth", String(operation.depth)]),
      "--json",
    ];
  }
  if (operation.kind === "query") {
    return ["query", operation.text, "--limit", String(operation.limit), "--json"];
  }
  return [
    "context",
    operation.root,
    "--depth",
    String(operation.depth),
    "--max-tokens",
    String(operation.maxTokens),
    "--json",
  ];
}

function capture(): Writer & { text(): string } {
  const chunks: string[] = [];
  return {
    write(chunk: string): void {
      chunks.push(chunk);
    },
    text(): string {
      return chunks.join("");
    },
  };
}

function elapsedNanoseconds(started: bigint): number {
  const elapsed = process.hrtime.bigint() - started;
  const value = Number(elapsed);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("benchmark duration exceeded safe integer range");
  return value;
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
