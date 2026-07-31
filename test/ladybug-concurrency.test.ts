import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  assertLadybugBenchmarkSourcesUnchanged,
  benchmarkDigest,
  ladybugGenerationCount,
  snapshotLadybugBenchmarkSources,
  snapshotLadybugCache,
} from "../benchmark/ladybug/accounting";
import {
  createLadybugConcurrencyEvidenceReport,
  type LadybugConcurrencyEvidenceRecord,
  sanitizedSnapshot,
  writeLadybugConcurrencyEvidenceReport,
} from "../benchmark/ladybug/concurrency-evidence";
import {
  LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
  type LadybugConcurrencyPausePoint,
  type LadybugConcurrencyWorkerEvent,
  type LadybugConcurrencyWorkerRequest,
  type LadybugConcurrencyWorkerResult,
  parseLadybugConcurrencyWorkerEvent,
  parseLadybugConcurrencyWorkerResult,
} from "../benchmark/ladybug/concurrency-protocol";
import {
  type GeneratedLadybugBenchmarkFixture,
  generateLadybugBenchmarkFixture,
  loadLadybugBenchmarkFixtureSpec,
} from "../benchmark/ladybug/fixture";
import { run } from "../src/cli";
import { loadBundle } from "../src/core/bundle";
import {
  disposeLadybugProjection,
  type LadybugProjectionGeneration,
  type LadybugProjectionLifecycleResult,
  reconcileLadybugProjection,
} from "../src/core/ladybug-lifecycle";
import {
  EXPECTED_LADYBUG_STORAGE_VERSION,
  EXPECTED_LADYBUG_VERSION,
  loadLadybugNativeDriver,
} from "../src/core/ladybug-native";
import {
  LADYBUG_CACHE_REL_ROOT,
  type LadybugProjectionSource,
  prepareLadybugProjectionSource,
  readProfileInventory,
  readSourceInventory,
} from "../src/core/ladybug-source";
import { buildProjection } from "../src/core/projection";
import { loadReferenceRetrievalGraph, type RetrievalGraphLoader } from "../src/core/retrieval";
import { LoreError } from "../src/errors";
import { VERSION } from "../src/meta";
import { capture } from "./helpers";

const REPOSITORY_ROOT = resolve(import.meta.dir, "..");
const WORKER_PATH = join(REPOSITORY_ROOT, "benchmark", "ladybug", "concurrency-worker.ts");
const SMALL_FIXTURE_PATH = join(REPOSITORY_ROOT, "benchmark", "ladybug", "fixtures", "v1", "small.json");
const nativeDescribe = process.platform === "win32" ? describe.skip : describe;
const cleanupRoots: string[] = [];
const evidenceRecords: LadybugConcurrencyEvidenceRecord[] = [];

interface ConcurrencyFixture extends GeneratedLadybugBenchmarkFixture {
  readonly container: string;
  readonly sourcePath: string;
}

interface Observation {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

afterEach(() => {
  const roots = cleanupRoots.splice(0);
  for (const root of roots) {
    makeDirectoriesWritable(root);
    rmSync(root, { recursive: true, force: true });
  }
  if (roots.length > 0) {
    for (const record of evidenceRecords.filter((candidate) => !candidate.scratchRemoved)) {
      record.scratchRemoved = roots.every((root) => !existsSync(root));
    }
  }
});

afterAll(() => {
  const output = process.env.LADYBUG_CONCURRENCY_EVIDENCE;
  if (output === undefined) return;
  writeLadybugConcurrencyEvidenceReport(output, createLadybugConcurrencyEvidenceReport(evidenceRecords));
});

nativeDescribe("Ladybug real-process concurrency and crash recovery", () => {
  test("eight processes and one multi-connection process read one immutable generation while an old reader survives replacement publication", async () => {
    const fixture = makeFixture();
    const built = await runWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: { kind: "reconcile", root: fixture.root, sourcePath: fixture.sourcePath },
    });
    expect(built).toMatchObject({ kind: "reconcile", classification: "rebuildable", outcome: "built" });
    expect(built.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const generation = generationFor(fixture.root, fixture.source);

    const readers = Array.from({ length: 8 }, () =>
      spawnWorker({
        schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
        operation: { kind: "read", databasePath: generation.databasePath, connections: 1 },
      }),
    );
    const ready = await Promise.all(readers.map(nextEvent));
    expect(ready.map((event) => event.point)).toEqual(Array(8).fill("read-connections-open"));
    readers.forEach(releaseWorker);
    const readerResults = await Promise.all(readers.map(finishWorker));
    expect(new Set(readerResults.map((result) => result.resultDigest)).size).toBe(1);
    expect(readerResults.every((result) => result.connectionCount === 1)).toBe(true);
    const simultaneousDigest = readerResults[0]?.resultDigest;
    if (simultaneousDigest === undefined) throw new Error("simultaneous readers returned no digest");

    const longRunning = spawnWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: { kind: "read", databasePath: generation.databasePath, connections: 4 },
    });
    expect(await nextEvent(longRunning)).toMatchObject({ point: "read-connections-open", connectionCount: 4 });
    releaseWorker(longRunning);
    const longRunningResult = await finishWorker(longRunning);
    expect(longRunningResult.resultDigest).toBe(simultaneousDigest);
    expect(longRunningResult.connectionCount).toBe(4);

    const oldReader = spawnWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: { kind: "read", databasePath: generation.databasePath, connections: 2 },
    });
    await nextEvent(oldReader);
    const changedPath = fixture.source.concepts[0]?.path;
    if (changedPath === undefined) throw new Error("small fixture has no concept path");
    appendFileSync(join(fixture.root, changedPath), "\nReplacement-generation source marker.\n");
    const changedSource = sourceForFixture(fixture);
    const changedSourcePath = writeSourceSnapshot(fixture.container, "source-2.json", changedSource);
    const changedBytes = snapshotLadybugBenchmarkSources(fixture.root);
    const replacement = await runWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: { kind: "reconcile", root: fixture.root, sourcePath: changedSourcePath },
    });
    expect(replacement).toMatchObject({ kind: "reconcile", classification: "rebuildable", outcome: "built" });
    expect(replacement.resultDigest).not.toBe(built.resultDigest);
    expect(existsSync(generation.databasePath)).toBe(true);
    expect(existsSync(generationFor(fixture.root, changedSource).databasePath)).toBe(true);

    releaseWorker(oldReader);
    const oldReaderResult = await finishWorker(oldReader);
    expect(oldReaderResult.resultDigest).toBe(simultaneousDigest);
    const stableReplacement = await runWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: { kind: "reconcile", root: fixture.root, sourcePath: changedSourcePath },
    });
    expect(stableReplacement).toMatchObject({ classification: "reusable", outcome: "reused" });
    expect(stableReplacement.resultDigest).toBe(replacement.resultDigest);
    if (replacement.resultDigest === null) throw new Error("replacement writer returned no deterministic digest");
    const changedAfter = snapshotLadybugBenchmarkSources(fixture.root);
    assertLadybugBenchmarkSourcesUnchanged(changedBytes, changedAfter);
    assertCacheContained(fixture.container, fixture.root);
    evidenceRecords.push(
      evidenceRecord({
        scenario: "multi-reader-publication",
        sourceBefore: changedBytes,
        sourceAfter: changedAfter,
        fixture,
        deterministicResultDigest: replacement.resultDigest,
      }),
    );
  }, 120_000);

  test("writer races, live-lock freshness, dispose diagnostics, and native same-file conflicts are classified without leaks", async () => {
    const fixture = makeFixture();
    const before = snapshotLadybugBenchmarkSources(fixture.root);
    const racers = Array.from({ length: 2 }, () =>
      spawnWorker({
        schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
        operation: { kind: "reconcile", root: fixture.root, sourcePath: fixture.sourcePath, pauseAt: "start" },
      }),
    );
    await Promise.all(racers.map(nextEvent));
    racers.forEach(releaseWorker);
    const raced = await Promise.all(racers.map(finishWorker));
    expect(raced.filter((result) => result.outcome === "built")).toHaveLength(1);
    expect(raced.filter((result) => result.outcome === "reused" || result.outcome === "unavailable")).toHaveLength(1);
    const owner = raced.find((result) => result.outcome === "built");
    if (owner?.resultDigest === null || owner?.resultDigest === undefined) throw new Error("race owner has no digest");
    const stable = await runWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: { kind: "reconcile", root: fixture.root, sourcePath: fixture.sourcePath },
    });
    expect(stable).toMatchObject({ classification: "reusable", outcome: "reused" });
    expect(stable.resultDigest).toBe(owner.resultDigest);

    const changedPath = fixture.source.concepts[0]?.path;
    if (changedPath === undefined) throw new Error("small fixture has no concept path");
    appendFileSync(join(fixture.root, changedPath), "\nLive-lock changed source marker.\n");
    const changedSource = sourceForFixture(fixture);
    const changedSourcePath = writeSourceSnapshot(fixture.container, "source-2.json", changedSource);
    const changedBytes = snapshotLadybugBenchmarkSources(fixture.root);
    const writer = spawnWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: {
        kind: "reconcile",
        root: fixture.root,
        sourcePath: changedSourcePath,
        pauseAt: "after-database-close",
      },
    });
    expect(await nextEvent(writer)).toMatchObject({ point: "after-database-close" });
    const lockPath = join(fixture.root, LADYBUG_CACHE_REL_ROOT, "writer.lock");
    const ownerToken = lockOwnerToken(lockPath);

    const reusable = await reconcileLadybugProjection({
      root: fixture.root,
      loadSource: async () => fixture.source,
    });
    expect(reusable).toMatchObject({
      classification: "locked",
      outcome: "reused",
      reason: "another live writer owns writer.lock; the exact verified generation remains reusable",
    });
    const stale = await reconcileLadybugProjection({
      root: fixture.root,
      loadSource: async () => changedSource,
    });
    expect(stale).toMatchObject({
      classification: "locked",
      outcome: "unavailable",
      reason: "another live writer owns writer.lock or stale ownership cannot be proved safely",
    });

    let disposeError: LoreError | undefined;
    try {
      disposeLadybugProjection(fixture.root);
    } catch (cause) {
      if (cause instanceof LoreError) disposeError = cause;
      else throw cause;
    }
    expect(disposeError).toMatchObject({
      type: "conflict",
      message: "cannot dispose the Ladybug projection while another writer owns writer.lock",
      hint: "retry after the active writer exits",
    });
    assertRedacted(JSON.stringify(disposeError), fixture.root, ownerToken);

    const expected = await invoke(fixture.root, (options) => loadReferenceRetrievalGraph(options));
    const automatic = await invoke(fixture.root);
    expect(automatic).toEqual(expected);
    assertRedacted(`${automatic.stdout}${automatic.stderr}`, fixture.root, ownerToken);

    await killWorker(writer);
    const recovered = await reconcileLadybugProjection({
      root: fixture.root,
      loadSource: async () => changedSource,
    });
    expect(recovered.outcome).toBe("built");
    expect(readdirSync(join(fixture.root, LADYBUG_CACHE_REL_ROOT)).some((name) => name.startsWith(".building-"))).toBe(
      false,
    );
    expect(existsSync(lockPath)).toBe(false);

    const changedGeneration = requireGeneration(recovered);
    const nativeConflictRoot = join(fixture.container, "native-conflict-probe");
    mkdirSync(nativeConflictRoot);
    const nativeConflictDatabase = join(nativeConflictRoot, "probe.lbdb");
    copyFileSync(changedGeneration.databasePath, nativeConflictDatabase);
    chmodSync(nativeConflictDatabase, 0o600);
    const conflict = await runWorker({
      schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
      operation: { kind: "classify-write-conflict", databasePath: nativeConflictDatabase },
    });
    expect(conflict).toMatchObject({ kind: "classify-write-conflict", resultDigest: null });
    if (conflict.kind === "classify-write-conflict") {
      if (conflict.nativeConflict === undefined) throw new Error("native conflict worker returned no classification");
      expect(["same-file-conflict", "read-write-compatible"]).toContain(conflict.nativeConflict);
    }
    assertRedacted(JSON.stringify(conflict), fixture.root, ownerToken);

    const native = await loadLadybugNativeDriver();
    const classifiedLock = await reconcileLadybugProjection({
      root: fixture.root,
      loadSource: async () => changedSource,
      loadNativeDriver: async () => ({
        ...native,
        verifyLadybugDatabase: async () => {
          throw new Error(`could not set lock for private owner ${ownerToken}`);
        },
      }),
    });
    expect(classifiedLock).toMatchObject({
      classification: "locked",
      outcome: "unavailable",
      reason: "Ladybug database is unexpectedly locked",
    });
    assertRedacted(classifiedLock.reason ?? "", fixture.root, ownerToken);
    const afterConflict = await reconcileLadybugProjection({
      root: fixture.root,
      loadSource: async () => changedSource,
    });
    expect(afterConflict).toMatchObject({ classification: "reusable", outcome: "reused" });

    const changedAfter = snapshotLadybugBenchmarkSources(fixture.root);
    assertLadybugBenchmarkSourcesUnchanged(changedBytes, changedAfter);
    expect(before.digest).not.toBe(changedBytes.digest);
    assertCacheContained(fixture.container, fixture.root);
    if (conflict.kind !== "classify-write-conflict")
      throw new Error("native conflict worker returned the wrong result");
    evidenceRecords.push(
      evidenceRecord({
        scenario: "writer-race-live-lock",
        sourceBefore: changedBytes,
        sourceAfter: changedAfter,
        fixture,
        deterministicResultDigest: owner.resultDigest,
        nativeConflict: conflict.nativeConflict,
      }),
    );
  }, 120_000);

  test("real child writers killed at every publication boundary recover without partial output or source/cache escape", async () => {
    const fixture = makeFixture();
    const sourceBefore = snapshotLadybugBenchmarkSources(fixture.root);
    const expected = await invoke(fixture.root, (options) => loadReferenceRetrievalGraph(options));
    const checkpoints: readonly LadybugConcurrencyPausePoint[] = [
      "after-database-close",
      "after-control-manifest-fsync",
      "after-atomic-rename",
      "before-lock-release",
    ];

    for (const checkpoint of checkpoints) {
      if (existsSync(join(fixture.root, LADYBUG_CACHE_REL_ROOT))) disposeLadybugProjection(fixture.root);
      const writer = spawnWorker({
        schema: LADYBUG_CONCURRENCY_WORKER_REQUEST_SCHEMA,
        operation: {
          kind: "reconcile",
          root: fixture.root,
          sourcePath: fixture.sourcePath,
          pauseAt: checkpoint,
        },
      });
      expect(await nextEvent(writer)).toMatchObject({ point: checkpoint });
      const cacheRoot = join(fixture.root, LADYBUG_CACHE_REL_ROOT);
      expect(existsSync(join(cacheRoot, "writer.lock"))).toBe(true);
      const unpublished = checkpoint === "after-database-close" || checkpoint === "after-control-manifest-fsync";
      expect(readdirSync(cacheRoot).some((name) => name.startsWith(".building-"))).toBe(unpublished);
      expect(existsSync(generationFor(fixture.root, fixture.source).generationPath)).toBe(!unpublished);
      const killed = await killWorker(writer);
      expect(killed.lines).toEqual([]);
      expect(killed.stderr).toBe("");

      const recovered = await reconcileLadybugProjection({
        root: fixture.root,
        loadSource: async () => fixture.source,
      });
      expect(recovered.outcome).toBe(unpublished ? "built" : "reused");
      expect(existsSync(join(cacheRoot, "writer.lock"))).toBe(false);
      expect(readdirSync(cacheRoot).some((name) => name.startsWith(".building-"))).toBe(false);
      expect(readdirSync(cacheRoot).filter((name) => name.startsWith(".stale-lock-"))).toHaveLength(1);
      expect(readdirSync(join(cacheRoot, "generations"))).toHaveLength(1);
      const generation = requireGeneration(recovered);
      expect(lstatSync(generation.generationPath).mode & 0o222).toBe(0);
      expect(lstatSync(generation.databasePath).mode & 0o222).toBe(0);
      expect(lstatSync(generation.controlPath).mode & 0o222).toBe(0);

      const automatic = await invoke(fixture.root);
      expect(automatic).toEqual(expected);
      assertRedacted(`${automatic.stdout}${automatic.stderr}`, fixture.root, lockOwnerTokenFromStale(cacheRoot));
      const sourceAfter = snapshotLadybugBenchmarkSources(fixture.root);
      assertLadybugBenchmarkSourcesUnchanged(sourceBefore, sourceAfter);
      assertCacheContained(fixture.container, fixture.root);
      evidenceRecords.push(
        evidenceRecord({
          scenario: "crash-recovery",
          checkpoint,
          sourceBefore,
          sourceAfter,
          fixture,
          deterministicResultDigest: benchmarkDigest(automatic.stdout),
          recoveryOutcome: recovered.outcome === "built" ? "built" : "reused",
        }),
      );
    }
  }, 180_000);
});

function evidenceRecord(options: {
  readonly scenario: LadybugConcurrencyEvidenceRecord["scenario"];
  readonly checkpoint?: LadybugConcurrencyPausePoint;
  readonly sourceBefore: ReturnType<typeof snapshotLadybugBenchmarkSources>;
  readonly sourceAfter: ReturnType<typeof snapshotLadybugBenchmarkSources>;
  readonly fixture: ConcurrencyFixture;
  readonly deterministicResultDigest: string;
  readonly recoveryOutcome?: LadybugConcurrencyEvidenceRecord["recoveryOutcome"];
  readonly nativeConflict?: LadybugConcurrencyEvidenceRecord["nativeConflict"];
}): LadybugConcurrencyEvidenceRecord {
  return {
    scenario: options.scenario,
    checkpoint: options.checkpoint ?? null,
    sourceBefore: sanitizedSnapshot(options.sourceBefore),
    sourceAfter: sanitizedSnapshot(options.sourceAfter),
    cache: sanitizedSnapshot(snapshotLadybugCache(options.fixture.root)),
    generationCount: ladybugGenerationCount(options.fixture.root),
    deterministicResultDigest: options.deterministicResultDigest,
    recoveryOutcome: options.recoveryOutcome ?? "not-applicable",
    nativeConflict: options.nativeConflict ?? null,
    cacheContained: true,
    stagingAbsent: true,
    writerLockAbsent: true,
    scratchRemoved: false,
  };
}

function makeFixture(): ConcurrencyFixture {
  const container = mkdtempSync(join(tmpdir(), "lore-ladybug-concurrency-"));
  cleanupRoots.push(container);
  const root = join(container, "repository");
  mkdirSync(root);
  const spec = loadLadybugBenchmarkFixtureSpec(SMALL_FIXTURE_PATH);
  const generated = generateLadybugBenchmarkFixture(spec, root);
  const sourcePath = writeSourceSnapshot(container, "source-1.json", generated.source);
  return { ...generated, container, sourcePath };
}

function sourceForFixture(fixture: GeneratedLadybugBenchmarkFixture): LadybugProjectionSource {
  const graph = loadBundle(join(fixture.root, "docs"));
  const projection = buildProjection({
    graph,
    tasks: fixture.tasks,
    docsRoot: "docs",
    okfVersion: "0.1",
    exporterVersion: VERSION,
    gitCommit: null,
    generatedAt: null,
  });
  return prepareLadybugProjectionSource({
    projection,
    inventory: readSourceInventory(fixture.root),
    profileInventory: readProfileInventory(fixture.root),
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    loreVersion: VERSION,
  });
}

function writeSourceSnapshot(container: string, name: string, source: LadybugProjectionSource): string {
  const path = join(container, name);
  writeFileSync(path, `${JSON.stringify(source)}\n`, { mode: 0o600 });
  return path;
}

function generationFor(root: string, source: LadybugProjectionSource): LadybugProjectionGeneration {
  const generationPath = join(root, LADYBUG_CACHE_REL_ROOT, "generations", source.generationKey);
  return {
    root: join(root, LADYBUG_CACHE_REL_ROOT),
    generationPath,
    databasePath: join(generationPath, "projection.lbdb"),
    controlPath: join(generationPath, "index.json"),
    control: undefined as never,
    verification: undefined as never,
  };
}

function requireGeneration(result: LadybugProjectionLifecycleResult): LadybugProjectionGeneration {
  if (result.generation === undefined) throw new Error(`missing ${result.classification}/${result.outcome} generation`);
  return result.generation;
}

function spawnWorker(request: LadybugConcurrencyWorkerRequest) {
  const child = Bun.spawn([process.execPath, WORKER_PATH, JSON.stringify(request)], {
    cwd: REPOSITORY_ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    child,
    reader: child.stdout.getReader(),
    decoder: new TextDecoder(),
    buffer: "",
    released: false,
  };
}

type WorkerHandle = ReturnType<typeof spawnWorker>;

async function nextEvent(worker: WorkerHandle): Promise<LadybugConcurrencyWorkerEvent> {
  return parseLadybugConcurrencyWorkerEvent(JSON.parse(await nextLine(worker)) as unknown);
}

function releaseWorker(worker: WorkerHandle): void {
  if (worker.released) return;
  worker.released = true;
  worker.child.stdin.end();
}

async function finishWorker(worker: WorkerHandle): Promise<LadybugConcurrencyWorkerResult> {
  const result = parseLadybugConcurrencyWorkerResult(JSON.parse(await nextLine(worker)) as unknown);
  const exitCode = await deadline(worker.child.exited, "concurrency worker exit");
  const stderr = await new Response(worker.child.stderr).text();
  if (exitCode !== 0 || stderr !== "") {
    throw new Error(`concurrency worker failed with exit ${exitCode}; diagnostic=${digest(stderr)}`);
  }
  return result;
}

async function runWorker(request: LadybugConcurrencyWorkerRequest): Promise<LadybugConcurrencyWorkerResult> {
  const worker = spawnWorker(request);
  releaseWorker(worker);
  return finishWorker(worker);
}

async function killWorker(worker: WorkerHandle): Promise<{ readonly lines: string[]; readonly stderr: string }> {
  worker.child.kill("SIGKILL");
  await deadline(worker.child.exited, "killed concurrency worker exit");
  const lines = await remainingLines(worker);
  const stderr = await new Response(worker.child.stderr).text();
  return { lines, stderr };
}

async function nextLine(worker: WorkerHandle): Promise<string> {
  while (true) {
    const newline = worker.buffer.indexOf("\n");
    if (newline >= 0) {
      const line = worker.buffer.slice(0, newline);
      worker.buffer = worker.buffer.slice(newline + 1);
      return line;
    }
    const part = await deadline(worker.reader.read(), "concurrency worker output");
    if (part.done) throw new Error("concurrency worker ended before emitting the expected line");
    worker.buffer += worker.decoder.decode(part.value, { stream: true });
  }
}

async function remainingLines(worker: WorkerHandle): Promise<string[]> {
  while (true) {
    const part = await worker.reader.read();
    if (part.done) break;
    worker.buffer += worker.decoder.decode(part.value, { stream: true });
  }
  worker.buffer += worker.decoder.decode();
  const lines = worker.buffer.split("\n").filter(Boolean);
  worker.buffer = "";
  return lines;
}

async function deadline<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), 60_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function invoke(root: string, retrieval?: RetrievalGraphLoader): Promise<Observation> {
  const stdout = capture();
  const stderr = capture();
  const code = await run([process.execPath, "lore", "graph", "--json"], {
    cwd: root,
    stdout,
    stderr,
    isTTY: false,
    stderrIsTTY: false,
    env: {},
    retrieval,
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

function lockOwnerToken(path: string): string {
  const value = JSON.parse(readFileSync(path, "utf8")) as { ownerToken?: unknown };
  if (typeof value.ownerToken !== "string") throw new Error("writer lock has no owner token");
  return value.ownerToken;
}

function lockOwnerTokenFromStale(cacheRoot: string): string {
  const stale = readdirSync(cacheRoot).find((name) => name.startsWith(".stale-lock-"));
  if (stale === undefined) throw new Error("recovery did not retain a stale-lock audit record");
  return lockOwnerToken(join(cacheRoot, stale));
}

function assertRedacted(output: string, root: string, ownerToken: string): void {
  expect(output).not.toContain(root);
  expect(output).not.toContain(ownerToken);
  expect(output).not.toMatch(/MATCH\s*\(|recordKey|sourceFingerprint|projection\.lbdb|lbugjs|segmentation|addon/i);
}

function assertCacheContained(container: string, repositoryRoot: string): void {
  const cacheRoot = join(repositoryRoot, LADYBUG_CACHE_REL_ROOT);
  const escaped = walk(container).filter((path) => {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const isLadybugArtifact =
      name === "projection.lbdb" ||
      name === "index.json" ||
      name === "writer.lock" ||
      name.startsWith(".building-") ||
      name.startsWith(".stale-lock-") ||
      name.startsWith(".corrupt-") ||
      name.startsWith(".rebuildable-");
    return isLadybugArtifact && !contained(cacheRoot, path);
  });
  expect(escaped).toEqual([]);
}

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return [path];
  return [path, ...readdirSync(path).flatMap((name) => walk(join(path, name)))];
}

function contained(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function makeDirectoriesWritable(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(path, 0o700);
  for (const child of readdirSync(path)) makeDirectoriesWritable(join(path, child));
}
