/**
 * Deterministic source snapshot for the repository-local Ladybug projection.
 *
 * Export schema 1.0 remains the sole ingestion boundary. This module validates
 * that stream, derives stable public/source identities, and fingerprints the
 * exact repository inputs without writing any repository file.
 */

import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";
import { type BacklogAdapter, type BacklogTask, bunBacklogSpawn, createBacklogAdapter } from "../adapters/backlog";
import { resolveHeadSha } from "../adapters/git";
import { LoreError, WarningCollector } from "../errors";
import { VERSION } from "../meta";
import { loadBundle, walkMarkdown } from "./bundle";
import { loadProfile, PROFILE_JSON_REL_PATH, PROFILE_REL_PATH } from "./profile";
import {
  buildProjection,
  PROJECTION_NORMALIZATION_VERSION,
  PROJECTION_SCHEMA_VERSION,
  type Projection,
  type ProjectionRecord,
  projectionStreamHash,
} from "./projection";
import { DOCS_DIR } from "./scaffold";

export const LADYBUG_INDEX_FORMAT = "ladybug-projection/1";
export const LADYBUG_INDEX_MAJOR = 1;
export const LADYBUG_CACHE_REL_ROOT = ".lore/cache/graph/ladybug/1";
export const LADYBUG_DATABASE_FILENAME = "projection.lbdb";
export const LADYBUG_CONTROL_FILENAME = "index.json";
export const LADYBUG_SOURCE_FINGERPRINT_DOMAIN = "ladybug-projection-source/1";
export const LADYBUG_INPUT_FINGERPRINT_DOMAIN = "ladybug-projection-input/1";

export interface SourceInventoryEntry {
  readonly path: string;
  readonly byteLength: number;
  readonly byteHash: string;
}

export interface ProfileInventoryEntry {
  readonly path: string;
  readonly bytes: string;
}

export interface LadybugProjectionCounts {
  readonly concepts: number;
  readonly tasks: number;
  readonly authoredEdges: number;
}

export interface ProjectionManifestRecord extends ProjectionRecord {
  readonly record: "manifest";
  readonly schemaVersion: string;
  readonly bundle: {
    readonly id: string;
    readonly okfVersion: string;
    readonly docsRoot: string;
    readonly gitCommit: string | null;
  };
  readonly exporter: {
    readonly name: string;
    readonly version: string;
  };
  readonly generatedAt: string | null;
  readonly normalizationVersion: string;
}

export interface ProjectionTrailerRecord extends ProjectionRecord {
  readonly record: "trailer";
  readonly recordCount: number;
  readonly streamHash: string;
}

export interface ProjectionConceptRecord extends ProjectionRecord {
  readonly record: "concept";
  readonly key: string;
  readonly id: string;
  readonly path: string;
  readonly type: string;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
  readonly contentHash: string;
  readonly tokenEstimate: number;
}

export interface ProjectionTaskRecord extends ProjectionRecord {
  readonly record: "task";
  readonly key: string;
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly labels: readonly string[];
  readonly priority: string | null;
  readonly ordinal: number | null;
  readonly assignees: readonly string[];
  readonly milestone: string | null;
  readonly parentTaskId: string | null;
  readonly sourceAdapterVersion: string;
}

export interface ProjectionEdgeRecord extends ProjectionRecord {
  readonly record: "edge";
  readonly key: string;
  readonly from: string;
  readonly to: string | null;
  readonly kind: string;
  readonly target: string;
  readonly ordinal: number;
  readonly dangling: boolean;
}

export interface LadybugProjectionSource {
  readonly records: readonly ProjectionRecord[];
  readonly manifest: ProjectionManifestRecord;
  readonly trailer: ProjectionTrailerRecord;
  readonly concepts: readonly ProjectionConceptRecord[];
  readonly tasks: readonly ProjectionTaskRecord[];
  readonly authoredEdges: readonly ProjectionEdgeRecord[];
  readonly inventory: readonly SourceInventoryEntry[];
  readonly profileInventory: readonly ProfileInventoryEntry[];
  readonly repositoryScopeKey: string;
  readonly snapshotKey: string;
  readonly commitKey: string | null;
  readonly exportDigest: string;
  readonly taskSnapshotDigest: string;
  readonly sourceRecordsDigest: string;
  readonly recordKeysDigest: string;
  readonly sourceFingerprint: string;
  /** Cheap exact-input identity used to reuse a generation without reparsing the bundle. */
  readonly inputFingerprint: string;
  /** Stable bundle warnings captured when this generation was fully built. */
  readonly warnings: readonly string[];
  /** True only when warnings came from the complete production source loader. */
  readonly warningsComplete: boolean;
  /** Portable directory segment for the content-addressed generation. */
  readonly generationKey: string;
  readonly ladybugVersion: string;
  readonly ladybugStorageVersion: string;
  readonly counts: LadybugProjectionCounts;
}

export interface PrepareLadybugProjectionSourceOptions {
  readonly projection: Projection;
  readonly inventory: readonly SourceInventoryEntry[];
  readonly profileInventory: readonly ProfileInventoryEntry[];
  readonly ladybugVersion: string;
  readonly ladybugStorageVersion: string;
  readonly loreVersion?: string;
  readonly warnings?: readonly string[];
}

export interface LadybugProjectionFreshness {
  readonly inputFingerprint: string;
}

export interface LoadLadybugProjectionSourceOptions {
  readonly root: string;
  readonly ladybugVersion: string;
  readonly ladybugStorageVersion: string;
  readonly adapter?: BacklogAdapter;
  readonly resolveGitCommit?: (root: string) => string | null;
  readonly warnings?: WarningCollector;
}

/**
 * Read the repository and build one complete preflight source snapshot. The
 * caller invokes this again after acquiring the writer lock and before
 * publication to detect changes made during the native build.
 */
export async function loadLadybugProjectionSource(
  options: LoadLadybugProjectionSourceOptions,
): Promise<LadybugProjectionSource> {
  const adapter = options.adapter ?? createBacklogAdapter(bunBacklogSpawn(undefined, options.root));
  const resolveGitCommit = options.resolveGitCommit ?? resolveHeadSha;
  for (let attempt = 0; attempt < 2; attempt++) {
    // A changed source snapshot abandons this entire attempt. Buffer its
    // advisories too, then merge only the stable attempt so indexed commands
    // cannot emit duplicate warnings that the reference loader would report
    // once.
    const attemptWarnings = options.warnings === undefined ? undefined : new WarningCollector();
    const inventory = readSourceInventory(options.root);
    const profileInventory = readProfileInventory(options.root);
    const profile = loadProfile({ root: options.root });
    const graph = loadBundle(join(options.root, DOCS_DIR), {
      warnings: attemptWarnings,
      profile,
      boundedMemory: true,
    });
    const tasks = await adapter.listTasks();
    const gitCommit = resolveGitCommit(options.root);
    const projection = buildProjection({
      graph,
      tasks,
      docsRoot: DOCS_DIR,
      okfVersion: profile.okfVersion,
      exporterVersion: VERSION,
      gitCommit,
      generatedAt: null,
      materializeJsonl: false,
    });
    const finalInventory = readSourceInventory(options.root);
    const finalProfileInventory = readProfileInventory(options.root);
    const finalGitCommit = resolveGitCommit(options.root);
    if (
      canonicalJson(inventory) === canonicalJson(finalInventory) &&
      canonicalJson(profileInventory) === canonicalJson(finalProfileInventory) &&
      gitCommit === finalGitCommit
    ) {
      const source = prepareLadybugProjectionSource({
        projection,
        inventory,
        profileInventory,
        ladybugVersion: options.ladybugVersion,
        ladybugStorageVersion: options.ladybugStorageVersion,
        loreVersion: VERSION,
        warnings: attemptWarnings?.list() ?? [],
      });
      if (attemptWarnings !== undefined && options.warnings !== undefined) {
        options.warnings.merge(attemptWarnings);
      }
      return source;
    }
  }
  throw new LoreError(
    "drift",
    "Ladybug projection source changed while its deterministic snapshot was being read",
    "retry after repository writes settle; no cache generation was published",
  );
}

/** Validate export schema 1.0 and derive its complete Ladybug source metadata. */
export function prepareLadybugProjectionSource(
  options: PrepareLadybugProjectionSourceOptions,
): LadybugProjectionSource {
  const { manifest, trailer, concepts, tasks, authoredEdges } = validateProjection(options.projection);
  const loreVersion = options.loreVersion ?? manifest.exporter.version;
  if (manifest.exporter.name !== "lore" || manifest.exporter.version !== loreVersion) {
    invalidProjection("exporter metadata does not match the active Lore version");
  }

  const repositoryScopeKey = digest(`lore-repository-scope/1\0${manifest.bundle.id}\0${manifest.bundle.docsRoot}`);
  const snapshotKey = digest(`lore-projection-snapshot/1\0${repositoryScopeKey}\0${trailer.streamHash}`);
  const commitKey =
    manifest.bundle.gitCommit === null
      ? null
      : digest(`lore-source-commit/1\0${repositoryScopeKey}\0${manifest.bundle.gitCommit}`);

  const taskRecords = [
    ...tasks.map((record) => JSON.stringify(record)),
    ...authoredEdges.filter((record) => record.kind === "task").map((record) => JSON.stringify(record)),
  ];
  const taskSnapshotDigest = digest(taskRecords.join("\n"));
  const sourceRecordsDigest = digestJsonLines([...concepts, ...tasks, ...authoredEdges], true);
  const recordKeysDigest = digest(
    [...concepts, ...tasks, ...authoredEdges]
      .map((record) => record.key)
      .sort(compareCodeUnits)
      .join("\n"),
  );

  const inventory = [...options.inventory].sort((a, b) => compareCodeUnits(a.path, b.path));
  const profileInventory = [...options.profileInventory].sort((a, b) => compareCodeUnits(a.path, b.path));
  const taskSnapshot = tasks
    .map((record) => JSON.parse(JSON.stringify(record)) as unknown)
    .sort((a, b) =>
      compareCodeUnits(String((a as { key?: unknown }).key ?? ""), String((b as { key?: unknown }).key ?? "")),
    );
  const fingerprintFacts = {
    indexFormatVersion: LADYBUG_INDEX_FORMAT,
    projectionSchemaVersion: manifest.schemaVersion,
    normalizationVersion: manifest.normalizationVersion,
    loreVersion,
    exporter: manifest.exporter,
    ladybugVersion: options.ladybugVersion,
    ladybugStorageVersion: options.ladybugStorageVersion,
    repositoryScopeKey,
    bundleId: manifest.bundle.id,
    gitCommit: manifest.bundle.gitCommit,
    inventory,
    profileInventory,
    taskSnapshot,
  };
  const sourceFingerprint = digest(`${LADYBUG_SOURCE_FINGERPRINT_DOMAIN}\0${canonicalJson(fingerprintFacts)}`);
  const inputFingerprint = projectionInputFingerprint({
    inventory,
    profileInventory,
    gitCommit: manifest.bundle.gitCommit,
    tasks,
    ladybugVersion: options.ladybugVersion,
    ladybugStorageVersion: options.ladybugStorageVersion,
    loreVersion,
  });

  return {
    records: options.projection.records,
    manifest,
    trailer,
    concepts,
    tasks,
    authoredEdges,
    inventory,
    profileInventory,
    repositoryScopeKey,
    snapshotKey,
    commitKey,
    exportDigest: trailer.streamHash,
    taskSnapshotDigest,
    sourceRecordsDigest,
    recordKeysDigest,
    sourceFingerprint,
    inputFingerprint,
    warnings: [...(options.warnings ?? [])],
    warningsComplete: options.warnings !== undefined,
    generationKey: digestHex(sourceFingerprint),
    ladybugVersion: options.ladybugVersion,
    ladybugStorageVersion: options.ladybugStorageVersion,
    counts: {
      concepts: concepts.length,
      tasks: tasks.length,
      authoredEdges: authoredEdges.length,
    },
  };
}

/** Fingerprint exact repository inputs without parsing Markdown or building a graph. */
export async function loadLadybugProjectionFreshness(
  options: LoadLadybugProjectionSourceOptions,
): Promise<LadybugProjectionFreshness> {
  const adapter = options.adapter ?? createBacklogAdapter(bunBacklogSpawn(undefined, options.root));
  const resolveGitCommit = options.resolveGitCommit ?? resolveHeadSha;
  for (let attempt = 0; attempt < 2; attempt++) {
    const inventory = readSourceInventory(options.root);
    const profileInventory = readProfileInventory(options.root);
    const tasks = await adapter.listTasks();
    const gitCommit = resolveGitCommit(options.root);
    const inputFingerprint = projectionInputFingerprint({
      inventory,
      profileInventory,
      gitCommit,
      tasks,
      ladybugVersion: options.ladybugVersion,
      ladybugStorageVersion: options.ladybugStorageVersion,
      loreVersion: VERSION,
    });
    if (
      canonicalJson(inventory) === canonicalJson(readSourceInventory(options.root)) &&
      canonicalJson(profileInventory) === canonicalJson(readProfileInventory(options.root)) &&
      gitCommit === resolveGitCommit(options.root)
    ) {
      return { inputFingerprint };
    }
  }
  throw new LoreError(
    "drift",
    "Ladybug projection source changed while its freshness was being checked",
    "retry after repository writes settle; no cache generation was selected",
  );
}

function projectionInputFingerprint(options: {
  readonly inventory: readonly SourceInventoryEntry[];
  readonly profileInventory: readonly ProfileInventoryEntry[];
  readonly gitCommit: string | null;
  readonly tasks: readonly (BacklogTask | ProjectionTaskRecord)[];
  readonly ladybugVersion: string;
  readonly ladybugStorageVersion: string;
  readonly loreVersion: string;
}): string {
  const tasks = options.tasks
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      labels: [...task.labels],
      priority: task.priority,
      ordinal: task.ordinal,
      assignees: [...task.assignees],
      milestone: task.milestone,
      parentTaskId: task.parentTaskId,
      sourceAdapterVersion: "backlog-json/1",
    }))
    .sort((a, b) => compareCodeUnits(a.id.toLowerCase(), b.id.toLowerCase()) || compareCodeUnits(a.id, b.id));
  const facts = {
    indexFormatVersion: LADYBUG_INDEX_FORMAT,
    projectionSchemaVersion: PROJECTION_SCHEMA_VERSION,
    normalizationVersion: PROJECTION_NORMALIZATION_VERSION,
    loreVersion: options.loreVersion,
    ladybugVersion: options.ladybugVersion,
    ladybugStorageVersion: options.ladybugStorageVersion,
    gitCommit: options.gitCommit,
    inventory: [...options.inventory].sort((a, b) => compareCodeUnits(a.path, b.path)),
    profileInventory: [...options.profileInventory].sort((a, b) => compareCodeUnits(a.path, b.path)),
    tasks,
  };
  return digest(`${LADYBUG_INPUT_FINGERPRINT_DOMAIN}\0${canonicalJson(facts)}`);
}

export function readSourceInventory(root: string): SourceInventoryEntry[] {
  const docsRoot = join(root, DOCS_DIR);
  const buffer = Buffer.allocUnsafe(64 * 1024);
  return walkMarkdown(docsRoot, undefined).map((relativePath) => {
    const { byteLength, byteHash } = hashFileSync(join(docsRoot, relativePath), buffer);
    return {
      path: `${DOCS_DIR}/${relativePath}`,
      byteLength,
      byteHash,
    };
  });
}

function hashFileSync(path: string, buffer: Buffer): { byteLength: number; byteHash: string } {
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  let byteLength = 0;
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.byteLength, null);
      if (count === 0) break;
      byteLength += count;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return { byteLength, byteHash: `sha256:${hash.digest("hex")}` };
}

export function readProfileInventory(root: string): ProfileInventoryEntry[] {
  const entries: ProfileInventoryEntry[] = [];
  for (const path of [PROFILE_REL_PATH, PROFILE_JSON_REL_PATH]) {
    const absolute = join(root, path);
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new LoreError(
          "denied",
          `refusing to fingerprint symlinked profile ${path}`,
          "replace it with a repository-local regular file",
          { path },
        );
      }
      if (stat.isFile()) {
        entries.push({ path, bytes: readFileSync(absolute, "utf8") });
      }
    } catch (cause) {
      if (isErrno(cause, "ENOENT") || isErrno(cause, "ENOTDIR")) continue;
      throw cause;
    }
  }
  return entries;
}

/** RFC-8259-compatible deterministic JSON with lexicographically sorted keys. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function digest(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digestJsonLines(values: readonly unknown[], boundedMemory = false): string {
  const hash = createHash("sha256");
  values.forEach((value, index) => {
    if (index > 0) hash.update("\n");
    hash.update(JSON.stringify(value));
    if (boundedMemory && index > 0 && index % 256 === 0) Bun.gc(true);
  });
  return `sha256:${hash.digest("hex")}`;
}

export function digestHex(value: string): string {
  const match = /^sha256:([0-9a-f]{64})$/.exec(value);
  if (!match) {
    throw new LoreError("validation", `expected a sha256 digest, received ${JSON.stringify(value)}`);
  }
  return match[1] as string;
}

function validateProjection(projection: Projection): {
  manifest: ProjectionManifestRecord;
  trailer: ProjectionTrailerRecord;
  concepts: ProjectionConceptRecord[];
  tasks: ProjectionTaskRecord[];
  authoredEdges: ProjectionEdgeRecord[];
} {
  if (projection.records.length < 2) invalidProjection("stream must contain a manifest and trailer");
  const first = projection.records[0];
  const last = projection.records.at(-1);
  if (!isManifest(first)) invalidProjection("first record must be a valid manifest");
  if (!isTrailer(last)) invalidProjection("last record must be a valid trailer");
  if (first.schemaVersion !== PROJECTION_SCHEMA_VERSION) {
    invalidProjection(`unsupported export schema ${JSON.stringify(first.schemaVersion)}`);
  }
  if (first.normalizationVersion !== PROJECTION_NORMALIZATION_VERSION) {
    invalidProjection(`unsupported normalization version ${JSON.stringify(first.normalizationVersion)}`);
  }
  const semanticRecords = projection.records.slice(0, -1);
  if (last.recordCount !== semanticRecords.length) {
    invalidProjection("trailer recordCount does not match the stream");
  }
  if (last.streamHash !== projectionStreamHash(semanticRecords, projection.jsonl === "")) {
    invalidProjection("trailer streamHash does not match the validated records");
  }

  const concepts: ProjectionConceptRecord[] = [];
  const tasks: ProjectionTaskRecord[] = [];
  const authoredEdges: ProjectionEdgeRecord[] = [];
  const keys = new Set<string>();
  for (const record of projection.records.slice(1, -1)) {
    if (isConcept(record)) concepts.push(record);
    else if (isTask(record)) tasks.push(record);
    else if (isEdge(record)) authoredEdges.push(record);
    else invalidProjection(`unsupported or malformed ${JSON.stringify(record.record)} record`);
    const key = (record as { key: string }).key;
    if (keys.has(key)) invalidProjection(`duplicate record key ${JSON.stringify(key)}`);
    keys.add(key);
  }

  const conceptKeys = new Set(concepts.map((record) => record.key));
  const taskKeys = new Set(tasks.map((record) => record.key));
  for (const edge of authoredEdges) {
    if (!conceptKeys.has(edge.from)) invalidProjection(`edge ${edge.key} has no concept source`);
    const targetExists = edge.to !== null && (edge.kind === "task" ? taskKeys.has(edge.to) : conceptKeys.has(edge.to));
    if (edge.dangling !== (edge.to === null) || (edge.to !== null && !targetExists)) {
      invalidProjection(`edge ${edge.key} has inconsistent target/dangling metadata`);
    }
  }
  return { manifest: first, trailer: last, concepts, tasks, authoredEdges };
}

function isManifest(record: ProjectionRecord | undefined): record is ProjectionManifestRecord {
  if (record?.record !== "manifest" || !isObject(record.bundle) || !isObject(record.exporter)) return false;
  const bundle = record.bundle;
  const exporter = record.exporter;
  return (
    typeof record.schemaVersion === "string" &&
    typeof record.normalizationVersion === "string" &&
    (record.generatedAt === null || typeof record.generatedAt === "string") &&
    typeof bundle.id === "string" &&
    typeof bundle.okfVersion === "string" &&
    typeof bundle.docsRoot === "string" &&
    (bundle.gitCommit === null || typeof bundle.gitCommit === "string") &&
    typeof exporter.name === "string" &&
    typeof exporter.version === "string"
  );
}

function isTrailer(record: ProjectionRecord | undefined): record is ProjectionTrailerRecord {
  return (
    record?.record === "trailer" &&
    Number.isSafeInteger(record.recordCount) &&
    Number(record.recordCount) >= 1 &&
    typeof record.streamHash === "string"
  );
}

function isConcept(record: ProjectionRecord): record is ProjectionConceptRecord {
  return (
    record.record === "concept" &&
    hasCommonKey(record) &&
    typeof record.id === "string" &&
    typeof record.path === "string" &&
    typeof record.type === "string" &&
    isObject(record.frontmatter) &&
    typeof record.body === "string" &&
    typeof record.contentHash === "string" &&
    Number.isSafeInteger(record.tokenEstimate)
  );
}

function isTask(record: ProjectionRecord): record is ProjectionTaskRecord {
  return (
    record.record === "task" &&
    hasCommonKey(record) &&
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.status === "string" &&
    isStringArray(record.labels) &&
    nullableString(record.priority) &&
    (record.ordinal === null || Number.isSafeInteger(record.ordinal)) &&
    isStringArray(record.assignees) &&
    nullableString(record.milestone) &&
    nullableString(record.parentTaskId) &&
    typeof record.sourceAdapterVersion === "string"
  );
}

function isEdge(record: ProjectionRecord): record is ProjectionEdgeRecord {
  return (
    record.record === "edge" &&
    hasCommonKey(record) &&
    typeof record.from === "string" &&
    nullableString(record.to) &&
    typeof record.kind === "string" &&
    typeof record.target === "string" &&
    Number.isSafeInteger(record.ordinal) &&
    typeof record.dangling === "boolean"
  );
}

function hasCommonKey(record: ProjectionRecord): record is ProjectionRecord & { key: string } {
  return typeof record.key === "string" && record.key !== "";
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (!isObject(value)) return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    const entry = value[key];
    if (entry !== undefined && typeof entry !== "function" && typeof entry !== "symbol") {
      result[key] = canonicalValue(entry);
    }
  }
  return result;
}

function invalidProjection(message: string): never {
  throw new LoreError(
    "validation",
    `Ladybug projection source is invalid: ${message}`,
    `rebuild the source through lore export --schema-version ${PROJECTION_SCHEMA_VERSION}`,
  );
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isErrno(value: unknown, code: string): boolean {
  return isObject(value) && value.code === code;
}
