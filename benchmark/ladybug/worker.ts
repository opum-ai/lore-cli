/** Fresh-process worker for benchmark-private indexed/reference qualification. */

import { isAbsolute } from "node:path";
import { run } from "../../src/cli";
import { buildGraphExport } from "../../src/core/graph";
import { loadRetrievalGraph, type RetrievalGraph, type RetrievalGraphLoader } from "../../src/core/retrieval";
import type { Writer } from "../../src/errors";
import { benchmarkDigest, ladybugGenerationCount } from "./accounting";
import {
  type BenchmarkOperation,
  type BenchmarkPolicy,
  LADYBUG_BENCHMARK_WORKER_RESULT_SCHEMA,
  type LadybugBenchmarkWorkerRequest,
  type LadybugBenchmarkWorkerResult,
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

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (raw === undefined || process.argv.length !== 3) {
    throw new Error("usage: bun benchmark/ladybug/worker.ts '<worker-request-json>'");
  }
  const request = parseLadybugBenchmarkWorkerRequest(JSON.parse(raw) as unknown);
  const result = await executeLadybugBenchmarkWorker(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function load(root: string, policy: BenchmarkPolicy): Promise<RetrievalGraph> {
  return loadRetrievalGraph({ root, policy });
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
