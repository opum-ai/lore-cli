/** Storage-neutral retained projection snapshots, bounded comparison, and provenance. */

import { z } from "zod";
import { LoreError } from "../errors";
import type {
  LadybugProjectionSource,
  ProjectionConceptRecord,
  ProjectionEdgeRecord,
  ProjectionTaskRecord,
} from "./ladybug-source";
import { canonicalJson } from "./ladybug-source";
import { compareCodeUnits } from "./order";
import type { WorkspaceRecordProvenance, WorkspaceResultRepository } from "./workspace-contract";
import type { WorkspaceProjection } from "./workspace-projection";

export const RETAINED_SNAPSHOT_SCHEMA_VERSION = "lore-retained-snapshot/1" as const;
export const CHANGED_RESULT_SCHEMA_VERSION = "lore-changed-result/1" as const;
export const PROVENANCE_RESULT_SCHEMA_VERSION = "lore-provenance-result/1" as const;
export const SNAPSHOT_RETENTION_LIMIT = 16;
export const CHANGED_DEFAULT_LIMIT = 100;
export const CHANGED_MAX_LIMIT = 1_000;
export const CHANGED_FACT_SCAN_LIMIT = 1_000_000;

export type RetainedFactKind = "concept" | "task" | "edge";
export type RetainedScopeKind = "repository" | "workspace";

export interface RetainedRepositoryProvenance {
  readonly memberId: string | null;
  readonly repositoryKey: string;
  readonly repositoryScopeKey: string;
  readonly bundleKey: string;
  readonly bundleId: string;
  readonly commitKey: string | null;
  readonly gitCommit: string | null;
  readonly exportKey: string;
  readonly exportDigest: string;
}

export interface RetainedRecordProvenance extends RetainedRepositoryProvenance {
  readonly recordKey: string;
  readonly sourceRecordKey: string;
  readonly sourceKey: string | null;
  readonly sourcePath: string | null;
}

export interface RetainedFact {
  readonly kind: RetainedFactKind;
  /** Public concept/task id, or exact edge record key. */
  readonly id: string;
  readonly recordKey: string;
  readonly provenance: RetainedRecordProvenance;
  /** Canonical authored/comparison fields. Snapshot provenance is deliberately separate. */
  readonly value: Readonly<Record<string, unknown>>;
}

export interface RetainedSnapshotDescriptor {
  readonly schemaVersion: typeof RETAINED_SNAPSHOT_SCHEMA_VERSION;
  readonly scopeKind: RetainedScopeKind;
  readonly scopeKey: string;
  readonly workspaceId: string | null;
  readonly snapshotKey: string;
  readonly repositories: readonly RetainedRepositoryProvenance[];
  readonly counts: Readonly<Record<RetainedFactKind, number>>;
}

export interface RetainedSnapshot extends RetainedSnapshotDescriptor {
  readonly facts: readonly RetainedFact[];
}

export interface SnapshotChange {
  readonly change: "added" | "removed" | "changed";
  readonly recordKind: RetainedFactKind;
  readonly recordKey: string;
  readonly id: string;
  readonly relationshipDelta: "added" | "removed" | "changed" | null;
  readonly fieldsChanged: readonly string[];
  readonly from: RetainedFact | null;
  readonly to: RetainedFact | null;
}

export interface ChangedResult {
  readonly schemaVersion: typeof CHANGED_RESULT_SCHEMA_VERSION;
  readonly from: RetainedSnapshotDescriptor;
  readonly to: RetainedSnapshotDescriptor;
  readonly filters: {
    readonly repositories: readonly string[];
    readonly kinds: readonly RetainedFactKind[];
  };
  readonly limits: { readonly result: number; readonly factScan: number };
  readonly changes: readonly SnapshotChange[];
  readonly shown: number;
  readonly totalChanges: number;
  readonly scanned: number;
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface ProvenanceResult {
  readonly schemaVersion: typeof PROVENANCE_RESULT_SCHEMA_VERSION;
  readonly snapshot: RetainedSnapshotDescriptor;
  readonly fact: RetainedFact;
}

const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const commitSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/u)
  .nullable();
const repositorySchema = z
  .object({
    memberId: z.string().min(1).nullable(),
    repositoryKey: digestSchema,
    repositoryScopeKey: digestSchema,
    bundleKey: digestSchema,
    bundleId: digestSchema,
    commitKey: digestSchema.nullable(),
    gitCommit: commitSchema,
    exportKey: digestSchema,
    exportDigest: digestSchema,
  })
  .strict();
const repositoryPathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    { message: "source paths must be repository-relative POSIX paths" },
  );
const provenanceSchema = repositorySchema
  .extend({
    recordKey: digestSchema,
    sourceRecordKey: z.string().min(1),
    sourceKey: digestSchema.nullable(),
    sourcePath: repositoryPathSchema.nullable(),
  })
  .strict();
const conceptValueSchema = z
  .object({
    id: z.string().min(1),
    path: repositoryPathSchema,
    type: z.string().min(1),
    frontmatter: z.record(z.string(), z.unknown()).refine((value) => !hasSensitiveKey(value), {
      message: "retained frontmatter contains a sensitive key",
    }),
    contentHash: digestSchema,
    tokenEstimate: z.number().int().nonnegative(),
  })
  .strict();
const taskValueSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.string().min(1),
    labels: z.array(z.string()),
    priority: z.string().nullable(),
    ordinal: z.number().int().nonnegative().nullable(),
    assignees: z.array(z.string()),
    milestone: z.string().nullable(),
    parentTaskId: z.string().nullable(),
    sourceAdapterVersion: z.string().min(1),
  })
  .strict();
const edgeValueSchema = z
  .object({
    from: digestSchema,
    to: digestSchema.nullable(),
    kind: z.string().min(1),
    target: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    dangling: z.boolean(),
    workspaceFromKind: z.enum(["concept", "task"]).nullable(),
    workspaceToKind: z.enum(["concept", "task"]).nullable(),
    workspaceLinkKind: z.string().min(1).nullable(),
  })
  .strict();
const factBaseSchema = z
  .object({ id: z.string().min(1), recordKey: digestSchema, provenance: provenanceSchema })
  .strict();
const factSchema = z.discriminatedUnion("kind", [
  factBaseSchema.extend({ kind: z.literal("concept"), value: conceptValueSchema }).strict(),
  factBaseSchema.extend({ kind: z.literal("task"), value: taskValueSchema }).strict(),
  factBaseSchema.extend({ kind: z.literal("edge"), value: edgeValueSchema }).strict(),
]);
const snapshotSchema = z
  .object({
    schemaVersion: z.literal(RETAINED_SNAPSHOT_SCHEMA_VERSION),
    scopeKind: z.enum(["repository", "workspace"]),
    scopeKey: digestSchema,
    workspaceId: z.string().min(1).nullable(),
    snapshotKey: digestSchema,
    repositories: z.array(repositorySchema).min(1).max(256),
    counts: z
      .object({
        concept: z.number().int().nonnegative(),
        task: z.number().int().nonnegative(),
        edge: z.number().int().nonnegative(),
      })
      .strict(),
    facts: z.array(factSchema).max(CHANGED_FACT_SCAN_LIMIT),
  })
  .strict();

/** Convert the current validated repository projection into immutable retained facts. */
export function buildRepositoryRetainedSnapshot(source: LadybugProjectionSource): RetainedSnapshot {
  const repository: RetainedRepositoryProvenance = {
    memberId: null,
    repositoryKey: source.repositoryScopeKey,
    repositoryScopeKey: source.repositoryScopeKey,
    bundleKey: source.manifest.bundle.id,
    bundleId: source.manifest.bundle.id,
    commitKey: source.commitKey,
    gitCommit: source.manifest.bundle.gitCommit,
    exportKey: source.exportDigest,
    exportDigest: source.exportDigest,
  };
  const conceptByKey = new Map(source.concepts.map((record) => [record.key, record]));
  return finalizeSnapshot({
    scopeKind: "repository",
    scopeKey: source.repositoryScopeKey,
    workspaceId: null,
    snapshotKey: source.snapshotKey,
    repositories: [repository],
    facts: [
      ...source.concepts.map((record) => repositoryConcept(record, repository)),
      ...source.tasks.map((record) => repositoryTask(record, repository)),
      ...source.authoredEdges.map((record) => repositoryEdge(record, repository, conceptByKey.get(record.from))),
    ],
  });
}

/** Convert the current complete workspace projection while preserving member provenance. */
export function buildWorkspaceRetainedSnapshot(projection: WorkspaceProjection): RetainedSnapshot {
  const repositoryByMember = new Map(
    projection.scope.repositories.map((repository) => [repository.memberId, retainedWorkspaceRepository(repository)]),
  );
  const provenanceByRecord = new Map<string, WorkspaceRecordProvenance>();
  for (const provenance of projection.provenanceById.values()) provenanceByRecord.set(provenance.recordKey, provenance);
  for (const provenance of projection.taskProvenanceById.values())
    provenanceByRecord.set(provenance.recordKey, provenance);
  const facts: RetainedFact[] = [];
  for (const record of projection.ladybugSource.concepts) {
    const provenance = requiredWorkspaceProvenance(provenanceByRecord, record.key);
    facts.push(workspaceConcept(record, provenance, requiredRepository(repositoryByMember, provenance.memberId)));
  }
  for (const record of projection.ladybugSource.tasks) {
    const provenance = requiredWorkspaceProvenance(provenanceByRecord, record.key);
    facts.push(workspaceTask(record, provenance, requiredRepository(repositoryByMember, provenance.memberId)));
  }
  for (const record of projection.ladybugSource.authoredEdges) {
    const source = requiredWorkspaceProvenance(provenanceByRecord, record.from);
    facts.push(workspaceEdge(record, source, requiredRepository(repositoryByMember, source.memberId)));
  }
  return finalizeSnapshot({
    scopeKind: "workspace",
    scopeKey: projection.scope.workspaceKey,
    workspaceId: projection.scope.workspaceId,
    snapshotKey: projection.scope.snapshotKey,
    repositories: projection.scope.repositories.map(retainedWorkspaceRepository),
    facts,
  });
}

export function parseRetainedSnapshot(value: unknown): RetainedSnapshot {
  let parsed: RetainedSnapshot;
  try {
    parsed = snapshotSchema.parse(value) as RetainedSnapshot;
  } catch (cause) {
    throw new LoreError(
      "validation",
      "retained snapshot is malformed or unsupported",
      cause instanceof Error ? cause.message : undefined,
    );
  }
  const normalized = finalizeSnapshot(parsed);
  assertSnapshotInvariants(normalized);
  if (canonicalJson(normalized) !== canonicalJson(parsed)) {
    throw new LoreError(
      "validation",
      "retained snapshot is not canonical",
      "re-retain the source with this Lore version",
    );
  }
  return parsed;
}

export function serializeRetainedSnapshot(value: unknown): string {
  return `${canonicalJson(parseRetainedSnapshot(value))}\n`;
}

export function snapshotDescriptor(snapshot: RetainedSnapshot): RetainedSnapshotDescriptor {
  const { facts: _facts, ...descriptor } = snapshot;
  return descriptor;
}

export function compareRetainedSnapshots(
  from: RetainedSnapshot,
  to: RetainedSnapshot,
  options: {
    readonly limit?: number;
    readonly repositories?: readonly string[];
    readonly kinds?: readonly RetainedFactKind[];
  } = {},
): ChangedResult {
  if (from.scopeKind !== to.scopeKind || from.scopeKey !== to.scopeKey) {
    throw new LoreError(
      "conflict",
      "retained snapshots belong to different scopes",
      "compare snapshots retained for the same repository or workspace",
    );
  }
  const limit = options.limit ?? CHANGED_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > CHANGED_MAX_LIMIT) {
    throw new LoreError("usage", `changed limit must be between 1 and ${CHANGED_MAX_LIMIT}`);
  }
  const repositories = uniqueSorted(options.repositories ?? []);
  const kinds = uniqueKinds(options.kinds ?? ["concept", "task", "edge"]);
  const allowedKinds = new Set(kinds);
  const allowedRepositories = new Set(repositories);
  const selected = (fact: RetainedFact) =>
    allowedKinds.has(fact.kind) &&
    (allowedRepositories.size === 0 ||
      (fact.provenance.memberId !== null && allowedRepositories.has(fact.provenance.memberId)));
  const left = from.facts.filter(selected);
  const right = to.facts.filter(selected);
  const changes: SnapshotChange[] = [];
  let totalChanges = 0;
  let scanned = 0;
  let i = 0;
  let j = 0;
  while ((i < left.length || j < right.length) && scanned < CHANGED_FACT_SCAN_LIMIT) {
    const a = left[i];
    const b = right[j];
    scanned += 1;
    let change: SnapshotChange | null = null;
    if (a === undefined) {
      change = changeRow("added", null, b as RetainedFact);
      j += 1;
    } else if (b === undefined) {
      change = changeRow("removed", a, null);
      i += 1;
    } else {
      const order = compareFact(a, b);
      if (order < 0) {
        change = changeRow("removed", a, null);
        i += 1;
      } else if (order > 0) {
        change = changeRow("added", null, b);
        j += 1;
      } else {
        if (canonicalJson(a.value) !== canonicalJson(b.value)) change = changeRow("changed", a, b);
        i += 1;
        j += 1;
      }
    }
    if (change !== null) {
      totalChanges += 1;
      if (changes.length < limit) changes.push(change);
    }
  }
  const scanBoundReached = i < left.length || j < right.length;
  return {
    schemaVersion: CHANGED_RESULT_SCHEMA_VERSION,
    from: snapshotDescriptor(from),
    to: snapshotDescriptor(to),
    filters: { repositories, kinds },
    limits: { result: limit, factScan: CHANGED_FACT_SCAN_LIMIT },
    changes,
    shown: changes.length,
    totalChanges,
    scanned,
    truncated: scanBoundReached || totalChanges > changes.length,
    complete: !scanBoundReached,
  };
}

export function findRetainedProvenance(
  snapshot: RetainedSnapshot,
  input: { readonly id: string; readonly kind: RetainedFactKind; readonly repositories?: readonly string[] },
): ProvenanceResult {
  const repositories = new Set(uniqueSorted(input.repositories ?? []));
  const exact = snapshot.facts.filter(
    (fact) =>
      fact.kind === input.kind &&
      (repositories.size === 0 || (fact.provenance.memberId !== null && repositories.has(fact.provenance.memberId))) &&
      (fact.id === input.id || fact.recordKey === input.id || fact.provenance.sourceRecordKey === input.id),
  );
  if (exact.length === 0)
    throw new LoreError("not_found", `${input.kind} ${JSON.stringify(input.id)} is not in the retained snapshot`);
  if (exact.length > 1) {
    throw new LoreError(
      "conflict",
      `${input.kind} ${JSON.stringify(input.id)} is ambiguous in the retained snapshot`,
      "use the exact record key",
    );
  }
  return {
    schemaVersion: PROVENANCE_RESULT_SCHEMA_VERSION,
    snapshot: snapshotDescriptor(snapshot),
    fact: exact[0] as RetainedFact,
  };
}

function repositoryConcept(record: ProjectionConceptRecord, repository: RetainedRepositoryProvenance): RetainedFact {
  return fact(
    "concept",
    record.id,
    record.key,
    provenance(repository, record.key, record.key, record.path),
    conceptValue(record),
  );
}

function repositoryTask(record: ProjectionTaskRecord, repository: RetainedRepositoryProvenance): RetainedFact {
  return fact("task", record.id, record.key, provenance(repository, record.key, record.key, null), taskValue(record));
}

function repositoryEdge(
  record: ProjectionEdgeRecord,
  repository: RetainedRepositoryProvenance,
  source?: ProjectionConceptRecord,
): RetainedFact {
  return fact(
    "edge",
    record.key,
    record.key,
    provenance(repository, record.key, record.key, source?.path ?? null),
    edgeValue(record),
  );
}

function workspaceConcept(
  record: ProjectionConceptRecord,
  source: WorkspaceRecordProvenance,
  repository: RetainedRepositoryProvenance,
): RetainedFact {
  return fact("concept", record.id, record.key, workspaceProvenance(repository, source), conceptValue(record));
}

function workspaceTask(
  record: ProjectionTaskRecord,
  source: WorkspaceRecordProvenance,
  repository: RetainedRepositoryProvenance,
): RetainedFact {
  return fact("task", record.id, record.key, workspaceProvenance(repository, source), taskValue(record));
}

function workspaceEdge(
  record: ProjectionEdgeRecord,
  source: WorkspaceRecordProvenance,
  repository: RetainedRepositoryProvenance,
): RetainedFact {
  return fact(
    "edge",
    record.key,
    record.key,
    provenance(repository, record.key, record.workspaceSourceRecordKey ?? record.key, source.sourcePath),
    edgeValue(record),
  );
}

function conceptValue(record: ProjectionConceptRecord): Record<string, unknown> {
  return {
    id: record.id,
    path: record.path,
    type: record.type,
    frontmatter: privacyFiltered(record.frontmatter),
    contentHash: record.contentHash,
    tokenEstimate: record.tokenEstimate,
  };
}

function taskValue(record: ProjectionTaskRecord): Record<string, unknown> {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    labels: record.labels,
    priority: record.priority,
    ordinal: record.ordinal,
    assignees: record.assignees,
    milestone: record.milestone,
    parentTaskId: record.parentTaskId,
    sourceAdapterVersion: record.sourceAdapterVersion,
  };
}

function edgeValue(record: ProjectionEdgeRecord): Record<string, unknown> {
  return {
    from: record.from,
    to: record.to,
    kind: record.kind,
    target: record.target,
    ordinal: record.ordinal,
    dangling: record.dangling,
    workspaceFromKind: record.workspaceFromKind ?? null,
    workspaceToKind: record.workspaceToKind ?? null,
    workspaceLinkKind: record.workspaceLinkKind ?? null,
  };
}

function fact(
  kind: RetainedFactKind,
  id: string,
  recordKey: string,
  recordProvenance: RetainedRecordProvenance,
  value: Record<string, unknown>,
): RetainedFact {
  return { kind, id, recordKey, provenance: recordProvenance, value };
}

function provenance(
  repository: RetainedRepositoryProvenance,
  recordKey: string,
  sourceRecordKey: string,
  sourcePath: string | null,
): RetainedRecordProvenance {
  return { ...repository, recordKey, sourceRecordKey, sourceKey: null, sourcePath };
}

function workspaceProvenance(
  repository: RetainedRepositoryProvenance,
  source: WorkspaceRecordProvenance,
): RetainedRecordProvenance {
  return {
    ...repository,
    recordKey: source.recordKey,
    sourceRecordKey: source.sourceRecordKey,
    sourceKey: source.sourceKey,
    sourcePath: source.sourcePath,
  };
}

function retainedWorkspaceRepository(repository: WorkspaceResultRepository): RetainedRepositoryProvenance {
  return { ...repository };
}

function finalizeSnapshot(
  input: Omit<RetainedSnapshot, "schemaVersion" | "counts"> | RetainedSnapshot,
): RetainedSnapshot {
  const facts = [...input.facts].sort(compareFact);
  const repositories = [...input.repositories].sort((a, b) => compareCodeUnits(a.memberId ?? "", b.memberId ?? ""));
  const counts = {
    concept: facts.filter((fact) => fact.kind === "concept").length,
    task: facts.filter((fact) => fact.kind === "task").length,
    edge: facts.filter((fact) => fact.kind === "edge").length,
  };
  return { ...input, schemaVersion: RETAINED_SNAPSHOT_SCHEMA_VERSION, repositories, counts, facts };
}

function assertSnapshotInvariants(snapshot: RetainedSnapshot): void {
  if (snapshot.scopeKind === "repository") {
    if (
      snapshot.workspaceId !== null ||
      snapshot.repositories.length !== 1 ||
      snapshot.repositories[0]?.memberId !== null
    ) {
      throw new LoreError("validation", "repository retained snapshot has inconsistent scope evidence");
    }
    if (snapshot.repositories[0]?.repositoryScopeKey !== snapshot.scopeKey) {
      throw new LoreError("validation", "repository retained snapshot scope key disagrees with repository provenance");
    }
  } else if (
    snapshot.workspaceId === null ||
    snapshot.repositories.some((repository) => repository.memberId === null)
  ) {
    throw new LoreError("validation", "workspace retained snapshot has incomplete member evidence");
  }

  const repositories = new Map<string, RetainedRepositoryProvenance>();
  for (const repository of snapshot.repositories) {
    if ((repository.gitCommit === null) !== (repository.commitKey === null)) {
      throw new LoreError("validation", "retained repository commit identity is incomplete");
    }
    const key = repository.memberId ?? repository.repositoryScopeKey;
    if (repositories.has(key)) throw new LoreError("validation", `duplicate retained repository ${key}`);
    repositories.set(key, repository);
  }

  const recordKeys = new Set<string>();
  for (const fact of snapshot.facts) {
    if (recordKeys.has(fact.recordKey))
      throw new LoreError("validation", `duplicate retained record key ${fact.recordKey}`);
    recordKeys.add(fact.recordKey);
    if (fact.provenance.recordKey !== fact.recordKey) {
      throw new LoreError("validation", `retained ${fact.kind} record and provenance keys disagree`);
    }
    const repository = repositories.get(fact.provenance.memberId ?? fact.provenance.repositoryScopeKey);
    if (
      repository === undefined ||
      canonicalJson(repository) !== canonicalJson(repositoryProvenance(fact.provenance))
    ) {
      throw new LoreError("validation", `retained ${fact.kind} provenance has no exact repository evidence`);
    }
    if (fact.kind === "edge" && fact.value.dangling !== (fact.value.to === null)) {
      throw new LoreError("validation", `retained edge ${fact.recordKey} has inconsistent dangling state`);
    }
  }
}

function repositoryProvenance(provenance: RetainedRecordProvenance): RetainedRepositoryProvenance {
  const {
    recordKey: _recordKey,
    sourceRecordKey: _sourceRecordKey,
    sourceKey: _sourceKey,
    sourcePath: _sourcePath,
    ...repository
  } = provenance;
  return repository;
}

function privacyFiltered(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (sensitiveKey(key)) continue;
    filtered[key] = Array.isArray(entry)
      ? entry.map((item) =>
          item !== null && typeof item === "object" ? privacyFiltered(item as Record<string, unknown>) : item,
        )
      : entry !== null && typeof entry === "object"
        ? privacyFiltered(entry as Record<string, unknown>)
        : entry;
  }
  return filtered;
}

function hasSensitiveKey(value: Readonly<Record<string, unknown>>): boolean {
  for (const [key, entry] of Object.entries(value)) {
    if (sensitiveKey(key)) return true;
    if (Array.isArray(entry)) {
      if (
        entry.some(
          (item) => item !== null && typeof item === "object" && hasSensitiveKey(item as Record<string, unknown>),
        )
      )
        return true;
    } else if (entry !== null && typeof entry === "object" && hasSensitiveKey(entry as Record<string, unknown>)) {
      return true;
    }
  }
  return false;
}

function sensitiveKey(key: string): boolean {
  return /(?:password|credential|secret|api[-_]?key|database(?:path|uri))/iu.test(key);
}

function compareFact(a: RetainedFact, b: RetainedFact): number {
  return compareCodeUnits(a.kind, b.kind) || compareCodeUnits(a.recordKey, b.recordKey);
}

function changeRow(
  change: SnapshotChange["change"],
  from: RetainedFact | null,
  to: RetainedFact | null,
): SnapshotChange {
  const selected = from ?? (to as RetainedFact);
  return {
    change,
    recordKind: selected.kind,
    recordKey: selected.recordKey,
    id: selected.id,
    relationshipDelta: selected.kind === "edge" ? change : null,
    fieldsChanged: change === "changed" ? changedFields(from?.value ?? {}, to?.value ?? {}) : [],
    from,
    to,
  };
}

function changedFields(from: Readonly<Record<string, unknown>>, to: Readonly<Record<string, unknown>>): string[] {
  return [...new Set([...Object.keys(from), ...Object.keys(to)])]
    .filter((key) => canonicalJson(from[key]) !== canonicalJson(to[key]))
    .sort(compareCodeUnits);
}

function uniqueSorted(values: readonly string[]): string[] {
  const unique = [...new Set(values)];
  if (unique.length !== values.length) throw new LoreError("usage", "repository filters must be unique");
  return unique.sort(compareCodeUnits);
}

function uniqueKinds(values: readonly RetainedFactKind[]): RetainedFactKind[] {
  const known = new Set<RetainedFactKind>(["concept", "task", "edge"]);
  for (const kind of values)
    if (!known.has(kind)) throw new LoreError("usage", `unknown retained fact kind ${JSON.stringify(kind)}`);
  const unique = [...new Set(values)];
  if (unique.length !== values.length) throw new LoreError("usage", "kind filters must be unique");
  return unique.sort(compareCodeUnits);
}

function requiredWorkspaceProvenance(
  values: ReadonlyMap<string, WorkspaceRecordProvenance>,
  recordKey: string,
): WorkspaceRecordProvenance {
  const value = values.get(recordKey);
  if (value === undefined)
    throw new LoreError("validation", `workspace retained snapshot is missing provenance for ${recordKey}`);
  return value;
}

function requiredRepository(
  values: ReadonlyMap<string, RetainedRepositoryProvenance>,
  memberId: string,
): RetainedRepositoryProvenance {
  const value = values.get(memberId);
  if (value === undefined)
    throw new LoreError("validation", `workspace retained snapshot is missing repository ${memberId}`);
  return value;
}
