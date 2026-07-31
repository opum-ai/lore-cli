/** Benchmark/test-private subprocess for real Ladybug concurrency and crash qualification. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { Connection, Database, type QueryResult } from "@ladybugdb/core";
import { buildGraphExport } from "../../src/core/graph";
import { type LadybugLifecycleHooks, reconcileLadybugProjection } from "../../src/core/ladybug-lifecycle";
import { loadLadybugNativeDriver } from "../../src/core/ladybug-native";
import type { LadybugProjectionSource } from "../../src/core/ladybug-source";
import {
  LADYBUG_CONCURRENCY_WORKER_EVENT_SCHEMA,
  LADYBUG_CONCURRENCY_WORKER_RESULT_SCHEMA,
  type LadybugConcurrencyClassifyWriteConflictOperation,
  type LadybugConcurrencyPausePoint,
  type LadybugConcurrencyReadOperation,
  type LadybugConcurrencyWorkerEvent,
  type LadybugConcurrencyWorkerRequest,
  LadybugConcurrencyWorkerRequestSchema,
  type LadybugConcurrencyWorkerResult,
} from "./concurrency-protocol";

async function execute(request: LadybugConcurrencyWorkerRequest): Promise<LadybugConcurrencyWorkerResult> {
  if (request.operation.kind === "read") return readWithOpenConnections(request.operation);
  if (request.operation.kind === "classify-write-conflict") return classifyWriteConflict(request.operation);
  const operation = request.operation;
  assertAbsolute(operation.root, "repository root");
  assertAbsolute(operation.sourcePath, "source snapshot");
  if (operation.pauseAt === "start") await pause("start");
  const source = readSource(operation.sourcePath);
  const hooks = checkpointHooks(operation.pauseAt);
  const lifecycle = await reconcileLadybugProjection({
    root: operation.root,
    loadSource: async () => source,
    hooks,
  });
  let resultDigest: string | null = null;
  if (lifecycle.generation !== undefined) {
    const native = await loadLadybugNativeDriver();
    const graph = await native.readLadybugBundleGraph(lifecycle.generation.databasePath, lifecycle.source);
    resultDigest = digest(JSON.stringify(buildGraphExport(graph)));
  }
  return {
    schema: LADYBUG_CONCURRENCY_WORKER_RESULT_SCHEMA,
    kind: "reconcile",
    classification: lifecycle.classification,
    outcome: lifecycle.outcome,
    generationPresent: lifecycle.generation !== undefined,
    resultDigest,
  };
}

function checkpointHooks(pauseAt: LadybugConcurrencyPausePoint | undefined): LadybugLifecycleHooks {
  return {
    afterDatabaseClose: pauseAt === "after-database-close" ? () => pause("after-database-close") : undefined,
    afterControlManifest:
      pauseAt === "after-control-manifest-fsync" ? () => pause("after-control-manifest-fsync") : undefined,
    afterPublication: pauseAt === "after-atomic-rename" ? () => pause("after-atomic-rename") : undefined,
    beforeLockRelease: pauseAt === "before-lock-release" ? () => pause("before-lock-release") : undefined,
  };
}

async function readWithOpenConnections(
  operation: LadybugConcurrencyReadOperation,
): Promise<LadybugConcurrencyWorkerResult> {
  assertAbsolute(operation.databasePath, "database path");
  const database = readOnlyDatabase(operation.databasePath);
  const connections = Array.from({ length: operation.connections }, () => new Connection(database));
  try {
    const before = await Promise.all(connections.map(readDigest));
    assertOneDigest(before);
    await pause("read-connections-open", connections.length);
    const after = await Promise.all(connections.map(readDigest));
    const resultDigest = assertOneDigest(after);
    if (resultDigest !== before[0]) throw new Error("read-only result changed while connections remained open");
    return {
      schema: LADYBUG_CONCURRENCY_WORKER_RESULT_SCHEMA,
      kind: "read",
      connectionCount: connections.length,
      resultDigest,
    };
  } finally {
    await Promise.all(connections.map(closeConnection));
    await database.close();
  }
}

async function classifyWriteConflict(
  operation: LadybugConcurrencyClassifyWriteConflictOperation,
): Promise<LadybugConcurrencyWorkerResult> {
  assertAbsolute(operation.databasePath, "database path");
  const readDatabase = readOnlyDatabase(operation.databasePath);
  const readConnection = new Connection(readDatabase);
  let writeDatabase: Database | undefined;
  let writeConnection: Connection | undefined;
  try {
    await readDatabase.init();
    writeDatabase = writableDatabase(operation.databasePath);
    writeConnection = new Connection(writeDatabase);
    await writeDatabase.init();
    return {
      schema: LADYBUG_CONCURRENCY_WORKER_RESULT_SCHEMA,
      kind: "classify-write-conflict",
      nativeConflict: "read-write-compatible",
      resultDigest: null,
    };
  } catch (cause) {
    if (!/could not set lock|database.*lock|locked/i.test(cause instanceof Error ? cause.message : String(cause))) {
      throw cause;
    }
    return {
      schema: LADYBUG_CONCURRENCY_WORKER_RESULT_SCHEMA,
      kind: "classify-write-conflict",
      nativeConflict: "same-file-conflict",
      resultDigest: null,
    };
  } finally {
    if (writeConnection !== undefined) await closeConnection(writeConnection);
    if (writeDatabase !== undefined) await writeDatabase.close();
    await closeConnection(readConnection);
    await readDatabase.close();
  }
}

async function readDigest(connection: Connection): Promise<string> {
  const result = await connection.query(
    "MATCH (n:ConceptRecord) RETURN n.sourceRecordJson AS sourceRecordJson ORDER BY n.sourceRecordJson",
  );
  if (Array.isArray(result)) {
    closeResults(result);
    throw new Error("read-only probe returned multiple result sets");
  }
  try {
    return digest(JSON.stringify(await result.getAll()));
  } finally {
    result.close();
  }
}

function assertOneDigest(values: readonly string[]): string {
  const first = values[0];
  if (first === undefined || values.some((value) => value !== first)) {
    throw new Error("simultaneous read-only connections produced different results");
  }
  return first;
}

function readSource(path: string): LadybugProjectionSource {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    typeof value !== "object" ||
    value === null ||
    !("sourceFingerprint" in value) ||
    typeof value.sourceFingerprint !== "string" ||
    !("generationKey" in value) ||
    typeof value.generationKey !== "string"
  ) {
    throw new Error("invalid test-private Ladybug source snapshot");
  }
  return value as LadybugProjectionSource;
}

async function pause(point: LadybugConcurrencyWorkerEvent["point"], connectionCount?: number): Promise<void> {
  const event: LadybugConcurrencyWorkerEvent = {
    schema: LADYBUG_CONCURRENCY_WORKER_EVENT_SCHEMA,
    event: "ready",
    point,
    ...(connectionCount === undefined ? {} : { connectionCount }),
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
  await Bun.stdin.text();
}

function readOnlyDatabase(path: string): Database {
  return new Database(path, 0, true, true, 0, true, -1, true, true, true);
}

function writableDatabase(path: string): Database {
  return new Database(path, 0, true, false, 0, false, -1, true, true, true);
}

function closeResults(results: QueryResult[]): void {
  for (const result of results) result.close();
}

async function closeConnection(connection: Connection): Promise<void> {
  try {
    await connection.close();
  } catch {
    // Database.close is the final native resource boundary in this disposable child.
  }
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assertAbsolute(path: string, label: string): void {
  if (!isAbsolute(path)) throw new Error(`${label} must be absolute`);
}

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (raw === undefined || process.argv.length !== 3) throw new Error("invalid concurrency worker invocation");
  const request = LadybugConcurrencyWorkerRequestSchema.parse(JSON.parse(raw) as unknown);
  const result = await execute(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) {
  main().catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(
      `${JSON.stringify({ schema: "lore.ladybug-concurrency-worker-error/1", diagnosticDigest: digest(message) })}\n`,
    );
    process.exitCode = 1;
  });
}
