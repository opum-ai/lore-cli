/**
 * Repository-local, content-addressed lifecycle for ladybug-projection/1.
 *
 * A writer owns one explicit lock, builds only in an isolated staging
 * directory, closes/reopens the native database for verification, writes the
 * control manifest last, and publishes with one atomic directory rename.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { LoreError, type WarningCollector } from "../errors";
import {
  EXPECTED_LADYBUG_STORAGE_VERSION,
  EXPECTED_LADYBUG_VERSION,
  type LadybugDatabaseVerification,
  type LadybugNativeDriver,
  type LadybugNativeLoader,
  loadLadybugNativeDriver,
} from "./ladybug-native";
import {
  canonicalJson,
  digest,
  LADYBUG_CACHE_REL_ROOT,
  LADYBUG_CONTROL_FILENAME,
  LADYBUG_DATABASE_FILENAME,
  LADYBUG_INDEX_FORMAT,
  type LadybugProjectionFreshness,
  type LadybugProjectionSource,
  loadLadybugProjectionSource,
} from "./ladybug-source";

const CURRENT_PROCESS_START_IDENTITY = `pid:${process.pid}:started:${Math.floor(
  Date.now() - process.uptime() * 1_000,
)}`;

export type LadybugProjectionClassification = "locked" | "unsupported" | "corrupt" | "rebuildable" | "reusable";

export type LadybugProjectionOutcome = "reused" | "built" | "unavailable";

export interface LadybugControlManifest {
  readonly indexFormatVersion: string;
  readonly projectionSchemaVersion: string;
  readonly normalizationVersion: string;
  readonly loreVersion: string;
  readonly exporterName: string;
  readonly exporterVersion: string;
  readonly ladybugVersion: string;
  readonly ladybugStorageVersion: string;
  readonly repositoryScopeKey: string;
  readonly snapshotKey: string;
  readonly bundleId: string;
  readonly okfVersion: string;
  readonly docsRoot: string;
  readonly gitCommit: string | null;
  readonly exportDigest: string;
  readonly taskSnapshotDigest: string;
  readonly sourceFingerprint: string;
  readonly inputFingerprint: string;
  readonly warnings: readonly string[];
  readonly warningsComplete: boolean;
  readonly sourceRecordsDigest: string;
  readonly recordKeysDigest: string;
  readonly recordCount: number;
  readonly counts: {
    readonly concepts: number;
    readonly tasks: number;
    readonly authoredEdges: number;
  };
  readonly database: {
    readonly file: typeof LADYBUG_DATABASE_FILENAME;
    readonly byteLength: number;
    readonly digest: string;
  };
  readonly completed: true;
}

export interface LadybugProjectionGeneration {
  readonly root: string;
  readonly generationPath: string;
  readonly databasePath: string;
  readonly controlPath: string;
  readonly control: LadybugControlManifest;
  readonly verification: LadybugDatabaseVerification;
}

export interface LadybugProjectionLifecycleResult {
  /** The ordered state observed before any permitted recovery/build. */
  readonly classification: LadybugProjectionClassification;
  readonly outcome: LadybugProjectionOutcome;
  readonly source: LadybugProjectionSource;
  readonly generation?: LadybugProjectionGeneration;
  readonly reason?: string;
}

export interface LadybugLifecycleHooks {
  /** Test seam for a crash after the database is closed but before index.json. */
  readonly afterDatabaseClose?: (stagingPath: string) => void | Promise<void>;
  /** Test seam for a crash after index.json but before publication. */
  readonly afterControlManifest?: (stagingPath: string) => void | Promise<void>;
  /** Test seam for a crash after atomic publication is complete and immutable. */
  readonly afterPublication?: (generationPath: string) => void | Promise<void>;
  /** Test seam for a crash after reconciliation completes but before writer ownership is released. */
  readonly beforeLockRelease?: () => void | Promise<void>;
}

export interface ReconcileLadybugProjectionOptions {
  readonly root: string;
  readonly adapter?: BacklogAdapter;
  readonly resolveGitCommit?: (root: string) => string | null;
  readonly warnings?: WarningCollector;
  readonly loadSource?: () => Promise<LadybugProjectionSource>;
  /** Cheap exact-input probe used before the full Markdown/export source loader. */
  readonly loadFreshness?: () => Promise<LadybugProjectionFreshness>;
  /** Injectable lazy native boundary; never invoked before supported control-manifest preflight. */
  readonly loadNativeDriver?: LadybugNativeLoader;
  readonly hooks?: LadybugLifecycleHooks;
}

interface WriterLockRecord {
  readonly ownerToken: string;
  readonly pid: number;
  readonly processStartIdentity: string | null;
  readonly hostname: string;
  readonly acquiredAt: string;
}

interface OwnedWriterLock {
  readonly path: string;
  readonly record: WriterLockRecord;
}

interface GenerationInspection {
  readonly classification: LadybugProjectionClassification;
  readonly generation?: LadybugProjectionGeneration;
  readonly reason?: string;
}

class NativeDriverLoadFailure {
  constructor(readonly cause: unknown) {}
}

/**
 * Reuse or safely construct the exact generation for the current repository
 * source. Unsupported and actively locked states are non-destructive and return
 * `unavailable`; callers retain the existing in-memory fallback.
 */
export async function reconcileLadybugProjection(
  options: ReconcileLadybugProjectionOptions,
): Promise<LadybugProjectionLifecycleResult> {
  const root = canonicalRepositoryRoot(options.root);
  const loadNative = onceNativeDriver(options.loadNativeDriver ?? loadLadybugNativeDriver);
  const loadSource =
    options.loadSource ??
    (() =>
      loadLadybugProjectionSource({
        root,
        ladybugVersion: EXPECTED_LADYBUG_VERSION,
        ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
        adapter: options.adapter,
        resolveGitCommit: options.resolveGitCommit,
        warnings: options.warnings,
      }));
  const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
  assertExistingCacheLayoutSafe(root, cacheRoot);
  const lockState = inspectWriterLock(cacheRoot);
  if (options.loadFreshness !== undefined && hasPotentialGeneration(cacheRoot)) {
    const freshness = await options.loadFreshness();
    const fast = await inspectFreshGeneration(cacheRoot, freshness.inputFingerprint, loadNative);
    if (fast.classification === "reusable" && fast.generation !== undefined) {
      const source = sourceFromControl(fast.generation.control);
      return {
        classification: lockState === "active" ? "locked" : "reusable",
        outcome: "reused",
        source,
        generation: fast.generation,
        ...(lockState === "active"
          ? { reason: "another live writer owns writer.lock; the exact verified generation remains reusable" }
          : {}),
      };
    }
  }

  let source = await loadSource();
  assertNativeVersion(source);
  if (lockState === "active") {
    const inspection = await inspectGeneration(cacheRoot, source, loadNative);
    if (inspection.classification === "reusable" && inspection.generation !== undefined) {
      return {
        classification: "locked",
        outcome: "reused",
        source,
        generation: inspection.generation,
        reason: "another live writer owns writer.lock; the exact verified generation remains reusable",
      };
    }
    return {
      classification: "locked",
      outcome: "unavailable",
      source,
      reason: "another live writer owns writer.lock or stale ownership cannot be proved safely",
    };
  }

  let inspection = await inspectGeneration(cacheRoot, source, loadNative);
  const initialClassification = inspection.classification;
  if (lockState === "none" && inspection.classification === "reusable" && inspection.generation !== undefined) {
    return { classification: "reusable", outcome: "reused", source, generation: inspection.generation };
  }
  if (inspection.classification === "unsupported") {
    return {
      classification: "unsupported",
      outcome: "unavailable",
      source,
      reason: inspection.reason,
    };
  }
  if (inspection.classification === "locked") {
    return {
      classification: "locked",
      outcome: "unavailable",
      source,
      reason: inspection.reason,
    };
  }

  ensureCacheLayout(root, cacheRoot);
  const ownedLock = acquireWriterLock(cacheRoot);
  if (ownedLock === null) {
    inspection = await inspectGeneration(cacheRoot, source, loadNative);
    if (inspection.classification === "reusable" && inspection.generation !== undefined) {
      return {
        classification: "locked",
        outcome: "reused",
        source,
        generation: inspection.generation,
        reason: "another writer published the exact generation while ownership was contested",
      };
    }
    return {
      classification: "locked",
      outcome: "unavailable",
      source,
      reason: "writer ownership could not be acquired safely",
    };
  }

  try {
    cleanupAbandonedStaging(cacheRoot);
    for (let attempt = 0; attempt < 2; attempt++) {
      assertNativeVersion(source);
      inspection = await inspectGeneration(cacheRoot, source, loadNative);
      if (inspection.classification === "reusable" && inspection.generation !== undefined) {
        return {
          classification: initialClassification,
          outcome: "reused",
          source,
          generation: inspection.generation,
        };
      }
      if (inspection.classification === "unsupported") {
        return {
          classification: "unsupported",
          outcome: "unavailable",
          source,
          reason: inspection.reason,
        };
      }
      if (inspection.classification === "locked") {
        return {
          classification: "locked",
          outcome: "unavailable",
          source,
          reason: inspection.reason,
        };
      }
      if (inspection.classification === "corrupt") {
        quarantineGeneration(cacheRoot, source, ownedLock.record.ownerToken);
      } else if (inspection.classification === "rebuildable") {
        retireRebuildableGeneration(cacheRoot, source, ownedLock.record.ownerToken);
      }

      const stagingPath = join(cacheRoot, `.building-${ownedLock.record.ownerToken}-${attempt}`);
      assertContained(cacheRoot, stagingPath);
      mkdirSync(stagingPath, { mode: 0o700 });
      const databasePath = join(stagingPath, LADYBUG_DATABASE_FILENAME);
      const native = await loadNative();
      Bun.gc(true);
      await native.buildLadybugDatabase(databasePath, source);
      await options.hooks?.afterDatabaseClose?.(stagingPath);
      const verification = await native.verifyLadybugDatabase(databasePath, source);
      const database = await hashFile(databasePath);
      const control = controlManifest(source, database.byteLength, database.digest);
      const controlPath = join(stagingPath, LADYBUG_CONTROL_FILENAME);
      writeControlManifestLast(controlPath, control);
      await options.hooks?.afterControlManifest?.(stagingPath);

      const finalFreshness = await options.loadFreshness?.();
      const finalSource =
        finalFreshness === undefined || finalFreshness.inputFingerprint !== source.inputFingerprint
          ? await loadSource()
          : source;
      assertNativeVersion(finalSource);
      if (finalSource.sourceFingerprint !== source.sourceFingerprint) {
        removeContained(cacheRoot, stagingPath);
        source = finalSource;
        continue;
      }

      const generationPath = generationPathFor(cacheRoot, source);
      assertContained(cacheRoot, generationPath);
      if (existsSync(generationPath)) {
        removeContained(cacheRoot, stagingPath);
        const existing = await inspectGeneration(cacheRoot, source, loadNative);
        if (existing.classification === "reusable" && existing.generation !== undefined) {
          return {
            classification: initialClassification,
            outcome: "reused",
            source,
            generation: existing.generation,
          };
        }
        throw lifecycleError("the content-addressed generation appeared but did not verify");
      }
      chmodSync(databasePath, 0o444);
      renameSync(stagingPath, generationPath);
      chmodSync(generationPath, 0o555);
      await options.hooks?.afterPublication?.(generationPath);
      fsyncDirectory(join(cacheRoot, "generations"));
      return {
        classification: initialClassification,
        outcome: "built",
        source,
        generation: {
          root: cacheRoot,
          generationPath,
          databasePath: join(generationPath, LADYBUG_DATABASE_FILENAME),
          controlPath: join(generationPath, LADYBUG_CONTROL_FILENAME),
          control,
          verification,
        },
      };
    }
    return {
      classification: "rebuildable",
      outcome: "unavailable",
      source,
      reason: "repository inputs changed during both isolated build attempts",
    };
  } finally {
    try {
      await options.hooks?.beforeLockRelease?.();
    } finally {
      releaseWriterLock(ownedLock);
    }
  }
}

/**
 * Explicitly dispose every derived Ladybug artifact while holding the same
 * writer ownership boundary. Repository sources are never removed.
 */
export function disposeLadybugProjection(rootInput: string): boolean {
  const root = canonicalRepositoryRoot(rootInput);
  const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
  if (!existsSync(cacheRoot)) return false;
  ensureCacheLayout(root, cacheRoot);
  const lock = acquireWriterLock(cacheRoot);
  if (lock === null) {
    throw new LoreError(
      "conflict",
      "cannot dispose the Ladybug projection while another writer owns writer.lock",
      "retry after the active writer exits",
    );
  }
  try {
    for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
      if (entry.name === "writer.lock") continue;
      const target = join(cacheRoot, entry.name);
      assertContained(cacheRoot, target);
      removeContained(cacheRoot, target);
    }
    return true;
  } finally {
    releaseWriterLock(lock);
  }
}

function hasPotentialGeneration(cacheRoot: string): boolean {
  const generationsRoot = join(cacheRoot, "generations");
  if (!existsSync(generationsRoot)) return false;
  return readdirSync(generationsRoot, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && !entry.isSymbolicLink() && /^[0-9a-f]{64}$/.test(entry.name),
  );
}

async function inspectFreshGeneration(
  cacheRoot: string,
  inputFingerprint: string,
  loadNative: LadybugNativeLoader,
): Promise<GenerationInspection> {
  const generationsRoot = join(cacheRoot, "generations");
  if (!existsSync(generationsRoot)) return { classification: "rebuildable", reason: "no generation exists" };
  for (const entry of readdirSync(generationsRoot, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[0-9a-f]{64}$/.test(entry.name)) continue;
    const generationPath = join(generationsRoot, entry.name);
    const controlPath = join(generationPath, LADYBUG_CONTROL_FILENAME);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(controlPath, "utf8"));
    } catch {
      continue;
    }
    if (!isObject(parsed) || parsed.inputFingerprint !== inputFingerprint || parsed.warningsComplete !== true) continue;
    if (!isControlManifest(parsed)) return { classification: "corrupt", reason: "control manifest is incomplete" };
    const control = parsed;
    if (
      control.indexFormatVersion !== LADYBUG_INDEX_FORMAT ||
      control.projectionSchemaVersion !== "1.0" ||
      control.ladybugVersion !== EXPECTED_LADYBUG_VERSION ||
      control.ladybugStorageVersion !== EXPECTED_LADYBUG_STORAGE_VERSION
    ) {
      return { classification: "rebuildable", reason: "generation compatibility changed" };
    }
    if (entry.name !== control.sourceFingerprint.replace(/^sha256:/, "")) {
      return { classification: "corrupt", reason: "generation path differs from source identity" };
    }
    const databasePath = join(generationPath, LADYBUG_DATABASE_FILENAME);
    try {
      const generationStat = lstatSync(generationPath);
      const controlStat = lstatSync(controlPath);
      const databaseStat = lstatSync(databasePath);
      if (
        !generationStat.isDirectory() ||
        generationStat.isSymbolicLink() ||
        !controlStat.isFile() ||
        controlStat.isSymbolicLink() ||
        !databaseStat.isFile() ||
        databaseStat.isSymbolicLink() ||
        (generationStat.mode & 0o222) !== 0 ||
        (controlStat.mode & 0o222) !== 0 ||
        (databaseStat.mode & 0o222) !== 0 ||
        databaseStat.size !== control.database.byteLength
      ) {
        return { classification: "corrupt", reason: "generation files or permissions differ" };
      }
      if ((await hashFile(databasePath)).digest !== control.database.digest) {
        return { classification: "corrupt", reason: "projection database digest differs" };
      }
      const expected = verificationFromControl(control);
      const native = await loadNative();
      const verification = await native.verifyLadybugDatabaseMetadata(databasePath, expected);
      return {
        classification: "reusable",
        generation: { root: cacheRoot, generationPath, databasePath, controlPath, control, verification },
      };
    } catch (cause) {
      if (isNativeLockError(cause))
        return { classification: "locked", reason: "Ladybug database is unexpectedly locked" };
      return { classification: "corrupt", reason: errorMessage(cause) };
    }
  }
  return { classification: "rebuildable", reason: "no generation matches the current input fingerprint" };
}

function verificationFromControl(control: LadybugControlManifest): LadybugDatabaseVerification {
  return {
    repositoryScopeKey: control.repositoryScopeKey,
    snapshotKey: control.snapshotKey,
    sourceFingerprint: control.sourceFingerprint,
    exportDigest: control.exportDigest,
    taskSnapshotDigest: control.taskSnapshotDigest,
    sourceRecordsDigest: control.sourceRecordsDigest,
    recordKeysDigest: control.recordKeysDigest,
    recordCount: control.recordCount,
    conceptCount: control.counts.concepts,
    taskCount: control.counts.tasks,
    authoredEdgeCount: control.counts.authoredEdges,
  };
}

function sourceFromControl(control: LadybugControlManifest): LadybugProjectionSource {
  const manifest: LadybugProjectionSource["manifest"] = {
    record: "manifest",
    schemaVersion: control.projectionSchemaVersion,
    bundle: {
      id: control.bundleId,
      okfVersion: control.okfVersion,
      docsRoot: control.docsRoot,
      gitCommit: control.gitCommit,
    },
    exporter: { name: control.exporterName, version: control.exporterVersion },
    generatedAt: null,
    normalizationVersion: control.normalizationVersion,
  };
  const trailer: LadybugProjectionSource["trailer"] = {
    record: "trailer",
    recordCount: control.recordCount,
    streamHash: control.exportDigest,
  };
  return {
    records: [],
    manifest,
    trailer,
    concepts: [],
    tasks: [],
    authoredEdges: [],
    inventory: [],
    profileInventory: [],
    repositoryScopeKey: control.repositoryScopeKey,
    snapshotKey: control.snapshotKey,
    commitKey:
      control.gitCommit === null
        ? null
        : digest(`lore-source-commit/1\0${control.repositoryScopeKey}\0${control.gitCommit}`),
    exportDigest: control.exportDigest,
    taskSnapshotDigest: control.taskSnapshotDigest,
    sourceRecordsDigest: control.sourceRecordsDigest,
    recordKeysDigest: control.recordKeysDigest,
    sourceFingerprint: control.sourceFingerprint,
    inputFingerprint: control.inputFingerprint,
    warnings: control.warnings,
    warningsComplete: control.warningsComplete,
    generationKey: control.sourceFingerprint.replace(/^sha256:/, ""),
    ladybugVersion: control.ladybugVersion,
    ladybugStorageVersion: control.ladybugStorageVersion,
    counts: control.counts,
  };
}

async function inspectGeneration(
  cacheRoot: string,
  source: LadybugProjectionSource,
  loadNative: LadybugNativeLoader,
): Promise<GenerationInspection> {
  const generationPath = generationPathFor(cacheRoot, source);
  if (!existsSync(generationPath)) {
    return { classification: "rebuildable", reason: "the exact content-addressed generation does not exist" };
  }
  try {
    const generationStat = lstatSync(generationPath);
    if (!generationStat.isDirectory() || generationStat.isSymbolicLink()) {
      return { classification: "corrupt", reason: "generation path is not a real directory" };
    }
    const controlPath = join(generationPath, LADYBUG_CONTROL_FILENAME);
    const databasePath = join(generationPath, LADYBUG_DATABASE_FILENAME);
    const controlStat = lstatSync(controlPath);
    if (!controlStat.isFile() || controlStat.isSymbolicLink()) {
      return { classification: "corrupt", reason: "control manifest is missing or symlinked" };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(controlPath, "utf8"));
    } catch {
      return { classification: "corrupt", reason: "control manifest is not parseable JSON" };
    }
    const compatibility = classifyControlCompatibility(parsed, source);
    // Unsupported is ordered before corruption. A newer format may use
    // different publication permissions, so preserve it before applying this
    // version's immutable-generation checks.
    if (compatibility.classification === "unsupported") return compatibility;
    if ((generationStat.mode & 0o222) !== 0) {
      return { classification: "corrupt", reason: "generation directory is not immutable" };
    }
    if ((controlStat.mode & 0o222) !== 0) {
      return { classification: "corrupt", reason: "control manifest is not immutable" };
    }
    if (compatibility.classification !== "reusable") return compatibility;
    const control = parsed as LadybugControlManifest;
    const databaseStat = lstatSync(databasePath);
    if (!databaseStat.isFile() || databaseStat.isSymbolicLink()) {
      return { classification: "corrupt", reason: "projection database is missing or symlinked" };
    }
    if ((databaseStat.mode & 0o222) !== 0) {
      return { classification: "corrupt", reason: "projection database is not immutable" };
    }
    if (databaseStat.size !== control.database.byteLength) {
      return { classification: "corrupt", reason: "projection database byte length differs" };
    }
    const actualDigest = (await hashFile(databasePath)).digest;
    if (actualDigest !== control.database.digest) {
      return { classification: "corrupt", reason: "projection database digest differs" };
    }
    let native: LadybugNativeDriver;
    try {
      native = await loadNative();
    } catch (cause) {
      // Failure to load the addon describes the host/runtime, not the verified
      // generation bytes. Let the retrieval resolver fall back without
      // quarantining a generation that may remain valid once the runtime is
      // repaired.
      throw new NativeDriverLoadFailure(cause);
    }
    try {
      const verification = await native.verifyLadybugDatabase(databasePath, source);
      return {
        classification: "reusable",
        generation: { root: cacheRoot, generationPath, databasePath, controlPath, control, verification },
      };
    } catch (cause) {
      if (isNativeLockError(cause)) {
        return { classification: "locked", reason: "Ladybug database is unexpectedly locked" };
      }
      return { classification: "corrupt", reason: errorMessage(cause) };
    }
  } catch (cause) {
    if (cause instanceof NativeDriverLoadFailure) throw cause.cause;
    if (isErrno(cause, "ENOENT")) return { classification: "corrupt", reason: "generation is incomplete" };
    return { classification: "corrupt", reason: errorMessage(cause) };
  }
}

function classifyControlCompatibility(value: unknown, source: LadybugProjectionSource): GenerationInspection {
  if (!isObject(value)) return { classification: "corrupt", reason: "control manifest is not an object" };
  const indexFormatVersion = value.indexFormatVersion;
  const projectionSchemaVersion = value.projectionSchemaVersion;
  const indexMajor = formatMajor(indexFormatVersion, /^ladybug-projection\/(\d+)$/);
  const projectionMajor = formatMajor(projectionSchemaVersion, /^(\d+)(?:\.\d+)?$/);
  if (
    (indexMajor !== null && indexMajor > 1) ||
    (projectionMajor !== null && projectionMajor > 1) ||
    (typeof indexFormatVersion === "string" && indexMajor === null) ||
    (typeof projectionSchemaVersion === "string" && projectionMajor === null)
  ) {
    return { classification: "unsupported", reason: "control manifest uses a newer or unknown format major" };
  }
  if (!isControlManifest(value)) {
    return { classification: "corrupt", reason: "control manifest is missing required completion metadata" };
  }
  if (indexMajor !== 1 || projectionMajor !== 1) {
    return { classification: "rebuildable", reason: "known older projection formats are rebuild-only" };
  }
  const compatibilityFacts: Array<[unknown, unknown, string]> = [
    [value.indexFormatVersion, LADYBUG_INDEX_FORMAT, "index format"],
    [value.projectionSchemaVersion, source.manifest.schemaVersion, "projection schema"],
    [value.normalizationVersion, source.manifest.normalizationVersion, "normalization version"],
    [value.loreVersion, source.manifest.exporter.version, "Lore version"],
    [value.exporterName, source.manifest.exporter.name, "exporter name"],
    [value.exporterVersion, source.manifest.exporter.version, "exporter version"],
    [value.ladybugVersion, source.ladybugVersion, "Ladybug version"],
    [value.ladybugStorageVersion, source.ladybugStorageVersion, "Ladybug storage version"],
  ];
  const compatibilityMismatch = compatibilityFacts.find(([actual, expected]) => actual !== expected);
  if (compatibilityMismatch !== undefined) {
    return { classification: "rebuildable", reason: `${compatibilityMismatch[2]} changed` };
  }
  if (value.sourceFingerprint !== source.sourceFingerprint) {
    return { classification: "rebuildable", reason: "source fingerprint changed" };
  }
  const duplicatedFacts: Array<[unknown, unknown, string]> = [
    [value.repositoryScopeKey, source.repositoryScopeKey, "repository scope"],
    [value.snapshotKey, source.snapshotKey, "snapshot"],
    [value.bundleId, source.manifest.bundle.id, "bundle"],
    [value.okfVersion, source.manifest.bundle.okfVersion, "OKF version"],
    [value.docsRoot, source.manifest.bundle.docsRoot, "docs root"],
    [value.gitCommit, source.manifest.bundle.gitCommit, "Git commit"],
    [value.exportDigest, source.exportDigest, "export digest"],
    [value.taskSnapshotDigest, source.taskSnapshotDigest, "task snapshot"],
    [value.sourceRecordsDigest, source.sourceRecordsDigest, "source records"],
    [value.recordKeysDigest, source.recordKeysDigest, "record keys"],
    [value.inputFingerprint, source.inputFingerprint, "input fingerprint"],
    [value.recordCount, source.trailer.recordCount, "record count"],
    [value.counts.concepts, source.counts.concepts, "concept count"],
    [value.counts.tasks, source.counts.tasks, "task count"],
    [value.counts.authoredEdges, source.counts.authoredEdges, "authored-edge count"],
  ];
  const mismatch = duplicatedFacts.find(([actual, expected]) => actual !== expected);
  return mismatch === undefined
    ? { classification: "reusable" }
    : { classification: "corrupt", reason: `duplicated ${mismatch[2]} metadata disagrees` };
}

function controlManifest(
  source: LadybugProjectionSource,
  databaseByteLength: number,
  databaseDigest: string,
): LadybugControlManifest {
  return {
    indexFormatVersion: LADYBUG_INDEX_FORMAT,
    projectionSchemaVersion: source.manifest.schemaVersion,
    normalizationVersion: source.manifest.normalizationVersion,
    loreVersion: source.manifest.exporter.version,
    exporterName: source.manifest.exporter.name,
    exporterVersion: source.manifest.exporter.version,
    ladybugVersion: source.ladybugVersion,
    ladybugStorageVersion: source.ladybugStorageVersion,
    repositoryScopeKey: source.repositoryScopeKey,
    snapshotKey: source.snapshotKey,
    bundleId: source.manifest.bundle.id,
    okfVersion: source.manifest.bundle.okfVersion,
    docsRoot: source.manifest.bundle.docsRoot,
    gitCommit: source.manifest.bundle.gitCommit,
    exportDigest: source.exportDigest,
    taskSnapshotDigest: source.taskSnapshotDigest,
    sourceFingerprint: source.sourceFingerprint,
    inputFingerprint: source.inputFingerprint,
    warnings: source.warnings,
    warningsComplete: source.warningsComplete,
    sourceRecordsDigest: source.sourceRecordsDigest,
    recordKeysDigest: source.recordKeysDigest,
    recordCount: source.trailer.recordCount,
    counts: source.counts,
    database: {
      file: LADYBUG_DATABASE_FILENAME,
      byteLength: databaseByteLength,
      digest: databaseDigest,
    },
    completed: true,
  };
}

function writeControlManifestLast(path: string, control: LadybugControlManifest): void {
  const descriptor = openSync(path, "wx", 0o400);
  try {
    writeFileSync(descriptor, `${canonicalJson(control)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  fsyncDirectory(resolve(path, ".."));
}

function ensureCacheLayout(root: string, cacheRoot: string): void {
  const realRoot = canonicalRepositoryRoot(root);
  assertExistingCacheLayoutSafe(realRoot, cacheRoot);
  const segments = [".lore", "cache", "graph", "ladybug", "1"];
  let current = realRoot;
  for (const segment of segments) {
    current = join(current, segment);
    assertContained(realRoot, current);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
      } catch (cause) {
        if (!isErrno(cause, "EEXIST")) throw cause;
      }
    }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new LoreError(
        "denied",
        `refusing Ladybug cache path through non-directory or symlink ${relative(realRoot, current)}`,
        "replace it with a repository-local real directory",
      );
    }
  }
  if (current !== cacheRoot) throw lifecycleError("resolved cache root does not match the frozen storage path");
  const generations = join(cacheRoot, "generations");
  if (!existsSync(generations)) {
    try {
      mkdirSync(generations, { mode: 0o700 });
    } catch (cause) {
      if (!isErrno(cause, "EEXIST")) throw cause;
    }
  }
  const stat = lstatSync(generations);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new LoreError("denied", "refusing symlinked or non-directory Ladybug generations path");
  }
}

function assertExistingCacheLayoutSafe(root: string, cacheRoot: string): void {
  const segments = [".lore", "cache", "graph", "ladybug", "1", "generations"];
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(current);
    } catch (cause) {
      if (isErrno(cause, "ENOENT") || isErrno(cause, "ENOTDIR")) return;
      throw cause;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new LoreError(
        "denied",
        `refusing Ladybug cache path through non-directory or symlink ${relative(root, current)}`,
        "replace it with a repository-local real directory",
      );
    }
  }
  if (join(root, LADYBUG_CACHE_REL_ROOT) !== cacheRoot) {
    throw lifecycleError("resolved cache root does not match the frozen storage path");
  }
}

function inspectWriterLock(cacheRoot: string): "none" | "stale" | "active" {
  const path = join(cacheRoot, "writer.lock");
  if (!existsSync(path)) return "none";
  const record = readLock(path);
  return record !== null && canProveProcessGone(record) ? "stale" : "active";
}

function acquireWriterLock(cacheRoot: string): OwnedWriterLock | null {
  const path = join(cacheRoot, "writer.lock");
  const record: WriterLockRecord = {
    ownerToken: randomBytes(16).toString("hex"),
    pid: process.pid,
    processStartIdentity: processStartIdentity(process.pid),
    hostname: hostname(),
    acquiredAt: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const descriptor = openSync(path, "wx", 0o600);
      try {
        writeFileSync(descriptor, `${canonicalJson(record)}\n`, "utf8");
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      fsyncDirectory(cacheRoot);
      return { path, record };
    } catch (cause) {
      if (!isErrno(cause, "EEXIST")) throw cause;
      const existing = readLock(path);
      if (attempt > 0 || existing === null || !canProveProcessGone(existing)) return null;
      const stalePath = join(cacheRoot, `.stale-lock-${record.ownerToken}`);
      try {
        renameSync(path, stalePath);
      } catch (renameCause) {
        if (isErrno(renameCause, "ENOENT")) continue;
        return null;
      }
    }
  }
  return null;
}

function releaseWriterLock(lock: OwnedWriterLock): void {
  const current = readLock(lock.path);
  if (current?.ownerToken !== lock.record.ownerToken) return;
  try {
    unlinkSync(lock.path);
    fsyncDirectory(resolve(lock.path, ".."));
  } catch (cause) {
    if (!isErrno(cause, "ENOENT")) throw cause;
  }
}

function readLock(path: string): WriterLockRecord | null {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isWriterLockRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function canProveProcessGone(record: WriterLockRecord): boolean {
  if (
    record.hostname !== hostname() ||
    record.processStartIdentity === null ||
    !new RegExp(`^pid:${record.pid}:started:\\d+$`).test(record.processStartIdentity)
  ) {
    return false;
  }
  try {
    process.kill(record.pid, 0);
    // A live PID is not enough to prove it is the recorded process instance,
    // and this portable layer cannot inspect another process's start identity
    // without an external command. Conservatively retain ownership.
    return false;
  } catch (cause) {
    return isErrno(cause, "ESRCH");
  }
}

function processStartIdentity(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  return pid === process.pid ? CURRENT_PROCESS_START_IDENTITY : null;
}

function quarantineGeneration(cacheRoot: string, source: LadybugProjectionSource, ownerToken: string): void {
  const generationPath = generationPathFor(cacheRoot, source);
  if (!existsSync(generationPath)) return;
  const quarantinePath = join(cacheRoot, `.corrupt-${source.generationKey}-${ownerToken}`);
  assertContained(cacheRoot, quarantinePath);
  const stat = lstatSync(generationPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) chmodSync(generationPath, 0o700);
  renameSync(generationPath, quarantinePath);
  fsyncDirectory(join(cacheRoot, "generations"));
  fsyncDirectory(cacheRoot);
}

function retireRebuildableGeneration(cacheRoot: string, source: LadybugProjectionSource, ownerToken: string): void {
  const generationPath = generationPathFor(cacheRoot, source);
  if (!existsSync(generationPath)) return;
  const retiredPath = join(cacheRoot, `.rebuildable-${source.generationKey}-${ownerToken}`);
  assertContained(cacheRoot, retiredPath);
  const stat = lstatSync(generationPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) chmodSync(generationPath, 0o700);
  renameSync(generationPath, retiredPath);
  fsyncDirectory(join(cacheRoot, "generations"));
  fsyncDirectory(cacheRoot);
}

function cleanupAbandonedStaging(cacheRoot: string): void {
  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.name.startsWith(".building-")) continue;
    try {
      removeContained(cacheRoot, join(cacheRoot, entry.name));
    } catch {
      // Cleanup is advisory. A unique owner token keeps the new staging path
      // independent, so an undeletable abandoned build must not block it.
    }
  }
}

function removeContained(cacheRoot: string, target: string): void {
  assertContained(cacheRoot, target);
  try {
    const stat = lstatSync(target);
    if (stat.isDirectory() && !stat.isSymbolicLink()) makeDirectoryTreeWritable(target);
  } catch (cause) {
    if (isErrno(cause, "ENOENT")) return;
    throw cause;
  }
  rmSync(target, { recursive: true, force: false });
}

function makeDirectoryTreeWritable(path: string): void {
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      makeDirectoryTreeWritable(join(path, entry.name));
    }
  }
}

function generationPathFor(cacheRoot: string, source: LadybugProjectionSource): string {
  return join(cacheRoot, "generations", source.generationKey);
}

async function hashFile(path: string): Promise<{ byteLength: number; digest: string }> {
  const hash = createHash("sha256");
  let byteLength = 0;
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: Buffer) => {
      byteLength += chunk.byteLength;
      hash.update(chunk);
    });
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
  });
  const stat = statSync(path);
  if (stat.size !== byteLength) throw lifecycleError("projection database changed while hashing");
  return { byteLength, digest: `sha256:${hash.digest("hex")}` };
}

function canonicalRepositoryRoot(root: string): string {
  const resolved = resolve(root);
  try {
    return realpathSync(resolved);
  } catch (cause) {
    throw new LoreError(
      "not_found",
      `cannot resolve repository root ${resolved}: ${errorMessage(cause)}`,
      "use an existing repository directory",
      { root: resolved },
    );
  }
}

function assertContained(root: string, target: string): void {
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    if (rel === "") return;
    throw new LoreError(
      "denied",
      `Ladybug lifecycle path escapes its repository-local cache root: ${target}`,
      "use only the resolved .lore/cache/graph/ladybug/1 path",
    );
  }
}

function fsyncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (cause) {
    if (!isErrno(cause, "EINVAL") && !isErrno(cause, "ENOTSUP")) throw cause;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertNativeVersion(source: LadybugProjectionSource): void {
  if (
    source.ladybugVersion !== EXPECTED_LADYBUG_VERSION ||
    source.ladybugStorageVersion !== EXPECTED_LADYBUG_STORAGE_VERSION
  ) {
    throw lifecycleError("source fingerprint Ladybug runtime facts differ from the frozen compatibility contract");
  }
}

function onceNativeDriver(loader: LadybugNativeLoader): LadybugNativeLoader {
  let pending: Promise<LadybugNativeDriver> | undefined;
  return async () => {
    pending ??= loader().then((driver) => {
      if (
        driver.LADYBUG_VERSION !== EXPECTED_LADYBUG_VERSION ||
        driver.LADYBUG_STORAGE_VERSION !== EXPECTED_LADYBUG_STORAGE_VERSION
      ) {
        throw lifecycleError("loaded Ladybug runtime differs from the frozen compatibility contract");
      }
      return driver;
    });
    return pending;
  };
}

function isControlManifest(value: unknown): value is LadybugControlManifest {
  if (!isObject(value)) return false;
  return (
    typeof value.indexFormatVersion === "string" &&
    typeof value.projectionSchemaVersion === "string" &&
    typeof value.normalizationVersion === "string" &&
    typeof value.loreVersion === "string" &&
    typeof value.exporterName === "string" &&
    typeof value.exporterVersion === "string" &&
    typeof value.ladybugVersion === "string" &&
    typeof value.ladybugStorageVersion === "string" &&
    typeof value.repositoryScopeKey === "string" &&
    typeof value.snapshotKey === "string" &&
    typeof value.bundleId === "string" &&
    typeof value.okfVersion === "string" &&
    typeof value.docsRoot === "string" &&
    (value.gitCommit === null || typeof value.gitCommit === "string") &&
    typeof value.exportDigest === "string" &&
    typeof value.taskSnapshotDigest === "string" &&
    typeof value.sourceFingerprint === "string" &&
    typeof value.inputFingerprint === "string" &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string") &&
    typeof value.warningsComplete === "boolean" &&
    typeof value.sourceRecordsDigest === "string" &&
    typeof value.recordKeysDigest === "string" &&
    Number.isSafeInteger(value.recordCount) &&
    Number(value.recordCount) >= 1 &&
    isObject(value.counts) &&
    Number.isSafeInteger(value.counts.concepts) &&
    Number(value.counts.concepts) >= 0 &&
    Number.isSafeInteger(value.counts.tasks) &&
    Number(value.counts.tasks) >= 0 &&
    Number.isSafeInteger(value.counts.authoredEdges) &&
    Number(value.counts.authoredEdges) >= 0 &&
    isObject(value.database) &&
    value.database.file === LADYBUG_DATABASE_FILENAME &&
    Number.isSafeInteger(value.database.byteLength) &&
    Number(value.database.byteLength) >= 0 &&
    typeof value.database.digest === "string" &&
    value.completed === true
  );
}

function isWriterLockRecord(value: unknown): value is WriterLockRecord {
  return (
    isObject(value) &&
    typeof value.ownerToken === "string" &&
    Number.isSafeInteger(value.pid) &&
    (value.processStartIdentity === null || typeof value.processStartIdentity === "string") &&
    typeof value.hostname === "string" &&
    typeof value.acquiredAt === "string"
  );
}

function formatMajor(value: unknown, pattern: RegExp): number | null {
  if (typeof value !== "string") return null;
  const match = pattern.exec(value);
  return match === null ? null : Number(match[1]);
}

function isNativeLockError(cause: unknown): boolean {
  return /could not set lock|database.*lock|locked/i.test(errorMessage(cause));
}

function lifecycleError(message: string): LoreError {
  return new LoreError(
    "validation",
    `Ladybug projection lifecycle failed: ${message}`,
    "the in-memory projection remains authoritative; inspect or rebuild the disposable local cache",
  );
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrno(value: unknown, code: string): boolean {
  return isObject(value) && value.code === code;
}
