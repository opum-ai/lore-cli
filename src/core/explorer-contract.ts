/**
 * Versioned, database-neutral read contract for the local graph explorer.
 *
 * The snapshot contains only source and derived health facts. Browser-local
 * layout coordinates and interaction state use the separate presentation
 * schema below and never participate in snapshot identity or serialization.
 */

import { z } from "zod";
import { compareCodeUnits } from "./order";

export const EXPLORER_SNAPSHOT_SCHEMA_VERSION = "lore-explorer-snapshot/1" as const;
export const EXPLORER_PRESENTATION_SCHEMA_VERSION = "lore-explorer-presentation/1" as const;

export const EXPLORER_RENDER_LIMITS = Object.freeze({
  initialNodeLimit: 750,
  initialEdgeLimit: 1_500,
  maximumVisibleNodes: 5_000,
  maximumVisibleEdges: 10_000,
  maximumFocusDepth: 4,
});

export const EXPLORER_REFRESH_CONTRACT = Object.freeze({
  hosts: Object.freeze(["127.0.0.1", "::1"] as const),
  method: "GET",
  responseSchemaVersion: EXPLORER_SNAPSHOT_SCHEMA_VERSION,
  canonicalSnapshotBytes: true,
  sameOriginOnly: true,
  acceptsQueryLanguage: false,
  acceptsDatabaseConfiguration: false,
  acceptsWrites: false,
});

export const EXPLORER_INTERACTION_CONTRACT = Object.freeze({
  keyboard: Object.freeze({
    id: "KBD-01",
    compositeNavigationKeys: Object.freeze(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const),
    selectKey: "Enter",
    returnFocusKey: "Escape",
    pointerRequired: false,
  }),
  screenReader: Object.freeze({
    id: "SR-01",
    equivalentListRequired: true,
    liveRegionPoliteness: "polite",
    canvasOnlyTextAllowed: false,
  }),
  color: Object.freeze({
    id: "COLOR-01",
    minimumContrast: "WCAG 2.2 AA",
    redundantNonColorCueRequired: true,
  }),
  responsive: Object.freeze({
    id: "RESPONSIVE-01",
    minimumViewportCssPixels: 320,
    zoomPercent: 200,
    twoDimensionalPageScrollAllowed: false,
  }),
  empty: Object.freeze({
    id: "EMPTY-01",
    healthState: "empty",
    initialFocus: "status-heading",
    navigationEnabled: false,
  }),
  corrupt: Object.freeze({
    id: "CORRUPT-01",
    healthState: "corrupt",
    navigationEnabled: false,
    destructiveActionAllowed: false,
  }),
  stale: Object.freeze({
    id: "STALE-01",
    healthState: "stale",
    preservesLastCompleteViewOnRefreshFailure: true,
    displayedProvenanceRequired: true,
  }),
  largeGraph: Object.freeze({
    id: "SCALE-01",
    announcesTotalAndVisibleCounts: true,
    requiresExplicitExpansion: true,
    limits: EXPLORER_RENDER_LIMITS,
  }),
});

const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const commitSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/u)
  .nullable();
const sourcePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    {
      message: "source paths must be repository-relative POSIX paths",
    },
  );

const sourceIdentitySchema = z
  .object({
    repositoryScopeKey: digestSchema,
    snapshotKey: digestSchema,
    bundleId: digestSchema,
    gitCommit: commitSchema,
    exportDigest: digestSchema,
  })
  .strict();

const recordProvenanceSchema = sourceIdentitySchema
  .extend({
    recordKey: digestSchema,
    sourcePath: sourcePathSchema.nullable(),
  })
  .strict();

const repositoryFactSchema = sourceIdentitySchema
  .extend({
    kind: z.literal("repository"),
    docsRoot: sourcePathSchema,
    displayName: z.string().min(1).max(256),
  })
  .strict();

const conceptFactSchema = recordProvenanceSchema
  .extend({
    kind: z.literal("concept"),
    conceptId: z.string().min(1),
    conceptType: z.string().min(1),
    title: z.string().max(1_024).nullable(),
    summary: z.string().max(4_096).nullable(),
    status: z.string().max(256).nullable(),
    tags: z.array(z.string().max(256)).max(256),
    contentHash: digestSchema,
    tokenEstimate: z.number().int().nonnegative(),
  })
  .strict();

const taskFactSchema = recordProvenanceSchema
  .extend({
    kind: z.literal("task"),
    taskId: z.string().min(1),
    title: z.string().min(1).max(1_024),
    summary: z.string().max(4_096).nullable(),
    status: z.string().min(1).max(256),
    labels: z.array(z.string().max(256)).max(256),
    priority: z.string().max(256).nullable(),
    assignees: z.array(z.string().max(256)).max(256),
    milestone: z.string().max(256).nullable(),
    parentTaskId: z.string().max(256).nullable(),
  })
  .strict();

const authoredEdgeFactSchema = recordProvenanceSchema
  .extend({
    kind: z.literal("authored-edge"),
    edgeKind: z.string().min(1).max(256),
    fromRecordKey: digestSchema,
    toRecordKey: digestSchema.nullable(),
    target: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    dangling: z.boolean(),
  })
  .strict();

const graphCountsSchema = z
  .object({
    repositories: z.number().int().nonnegative(),
    concepts: z.number().int().nonnegative(),
    tasks: z.number().int().nonnegative(),
    authoredEdges: z.number().int().nonnegative(),
    danglingEdges: z.number().int().nonnegative(),
    duplicateEdges: z.number().int().nonnegative(),
  })
  .strict();

export const explorerSnapshotSchema = z
  .object({
    schemaVersion: z.literal(EXPLORER_SNAPSHOT_SCHEMA_VERSION),
    source: sourceIdentitySchema.extend({
      docsRoot: sourcePathSchema,
      sourceFingerprint: digestSchema,
      generatedAt: z.null(),
    }),
    facts: z
      .object({
        repositories: z.array(repositoryFactSchema),
        concepts: z.array(conceptFactSchema),
        tasks: z.array(taskFactSchema),
        authoredEdges: z.array(authoredEdgeFactSchema),
      })
      .strict(),
    health: z
      .object({
        state: z.enum(["ready", "empty", "stale", "corrupt"]),
        messageCode: z.string().max(256).nullable(),
        counts: graphCountsSchema,
        warnings: z.array(z.string().max(1_024)).max(64),
      })
      .strict(),
  })
  .strict();

export const explorerPresentationStateSchema = z
  .object({
    schemaVersion: z.literal(EXPLORER_PRESENTATION_SCHEMA_VERSION),
    snapshotKey: digestSchema,
    filters: z
      .object({
        search: z.string().max(256),
        kinds: z.array(z.enum(["repository", "concept", "task"])),
        statuses: z.array(z.string().max(256)),
        edgeKinds: z.array(z.string().max(256)),
        graphHealth: z.array(z.enum(["dangling", "duplicate", "supersession"])),
      })
      .strict(),
    selection: z
      .object({
        selectedRecordKey: digestSchema.nullable(),
        focusRecordKey: digestSchema.nullable(),
        depth: z.number().int().min(0).max(EXPLORER_RENDER_LIMITS.maximumFocusDepth),
      })
      .strict(),
    layout: z
      .object({
        algorithmVersion: z.string().min(1).max(256),
        coordinates: z
          .array(
            z
              .object({
                recordKey: digestSchema,
                x: z.number().finite(),
                y: z.number().finite(),
              })
              .strict(),
          )
          .max(EXPLORER_RENDER_LIMITS.maximumVisibleNodes),
        viewport: z
          .object({
            x: z.number().finite(),
            y: z.number().finite(),
            zoom: z.number().finite().positive(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type ExplorerSnapshot = z.infer<typeof explorerSnapshotSchema>;
export type ExplorerPresentationState = z.infer<typeof explorerPresentationStateSchema>;

/** Parse the public snapshot and enforce cross-record determinism/provenance invariants. */
export function parseExplorerSnapshot(value: unknown): ExplorerSnapshot {
  const snapshot = explorerSnapshotSchema.parse(value);
  assertSortedUnique(snapshot.facts.repositories, (record) => record.repositoryScopeKey, "repositories");
  assertSortedUnique(snapshot.facts.concepts, (record) => record.recordKey, "concepts");
  assertSortedUnique(snapshot.facts.tasks, (record) => record.recordKey, "tasks");
  assertSortedUnique(snapshot.health.warnings, (warning) => warning, "warnings");
  assertEdgesSortedUnique(snapshot.facts.authoredEdges);

  const sourceIdentity = identityTuple(snapshot.source);
  const recordKeys = new Set<string>();
  for (const repository of snapshot.facts.repositories) {
    assertIdentity(repository, sourceIdentity, "repository");
  }
  for (const record of [...snapshot.facts.concepts, ...snapshot.facts.tasks]) {
    assertIdentity(record, sourceIdentity, record.kind);
    if (recordKeys.has(record.recordKey)) throw contractError(`duplicate record key ${record.recordKey}`);
    recordKeys.add(record.recordKey);
  }
  const nodeKeys = new Set(recordKeys);

  const edgeFingerprints = new Set<string>();
  let duplicateEdges = 0;
  let danglingEdges = 0;
  for (const edge of snapshot.facts.authoredEdges) {
    assertIdentity(edge, sourceIdentity, "authored edge");
    if (recordKeys.has(edge.recordKey)) throw contractError(`duplicate record key ${edge.recordKey}`);
    recordKeys.add(edge.recordKey);
    if (!nodeKeys.has(edge.fromRecordKey)) throw contractError(`missing edge source ${edge.fromRecordKey}`);
    if (edge.dangling !== (edge.toRecordKey === null)) {
      throw contractError(`edge ${edge.recordKey} has inconsistent dangling state`);
    }
    if (edge.toRecordKey !== null && !nodeKeys.has(edge.toRecordKey)) {
      throw contractError(`missing edge target ${edge.toRecordKey}`);
    }
    if (edge.dangling) danglingEdges++;
    const fingerprint = [edge.fromRecordKey, edge.edgeKind, edge.target].join("\0");
    if (edgeFingerprints.has(fingerprint)) duplicateEdges++;
    edgeFingerprints.add(fingerprint);
  }

  const actualCounts = {
    repositories: snapshot.facts.repositories.length,
    concepts: snapshot.facts.concepts.length,
    tasks: snapshot.facts.tasks.length,
    authoredEdges: snapshot.facts.authoredEdges.length,
    danglingEdges,
    duplicateEdges,
  };
  if (canonicalJson(snapshot.health.counts) !== canonicalJson(actualCounts)) {
    throw contractError("graph-health counts do not match source facts");
  }
  const factCount = actualCounts.repositories + actualCounts.concepts + actualCounts.tasks + actualCounts.authoredEdges;
  if (snapshot.health.state === "empty" && factCount !== 0) {
    throw contractError("empty graph-health state cannot carry source facts");
  }
  if (snapshot.health.state !== "empty" && actualCounts.repositories !== 1) {
    throw contractError(`${snapshot.health.state} graph-health state requires exactly one M6 repository`);
  }
  if (
    (snapshot.health.state === "stale" || snapshot.health.state === "corrupt") &&
    snapshot.health.messageCode === null
  ) {
    throw contractError(`${snapshot.health.state} graph-health state requires a stable message code`);
  }
  return snapshot;
}

/** Serialize one validated snapshot as canonical UTF-8 JSON with a trailing newline. */
export function serializeExplorerSnapshot(value: unknown): string {
  return `${canonicalJson(parseExplorerSnapshot(value))}\n`;
}

function identityTuple(identity: z.infer<typeof sourceIdentitySchema>): string {
  return [
    identity.repositoryScopeKey,
    identity.snapshotKey,
    identity.bundleId,
    identity.gitCommit ?? "",
    identity.exportDigest,
  ].join("\0");
}

function assertIdentity(identity: z.infer<typeof sourceIdentitySchema>, expected: string, label: string): void {
  if (identityTuple(identity) !== expected) throw contractError(`${label} provenance differs from snapshot source`);
}

function assertSortedUnique<T>(records: readonly T[], key: (record: T) => string, label: string): void {
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1];
    const current = records[index];
    if (previous === undefined || current === undefined) continue;
    if (compareCodeUnits(key(previous), key(current)) >= 0) {
      throw contractError(`${label} must be unique and sorted by UTF-16 code units`);
    }
  }
}

function assertEdgesSortedUnique(edges: readonly z.infer<typeof authoredEdgeFactSchema>[]): void {
  const key = (edge: z.infer<typeof authoredEdgeFactSchema>) =>
    [edge.fromRecordKey, edge.edgeKind, edge.target, String(edge.ordinal).padStart(16, "0"), edge.recordKey].join("\0");
  assertSortedUnique(edges, key, "authored edges");
}

function contractError(message: string): Error {
  return new Error(`invalid ${EXPLORER_SNAPSHOT_SCHEMA_VERSION}: ${message}`);
}

/** RFC-8259-compatible deterministic JSON with lexicographically sorted object keys. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined && typeof entry !== "function" && typeof entry !== "symbol") {
      result[key] = canonicalValue(entry);
    }
  }
  return result;
}
