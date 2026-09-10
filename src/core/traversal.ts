/** Storage-neutral bounded path and impact traversal over authored projection facts. */

import { LoreError } from "../errors";
import type {
  LadybugProjectionSource,
  ProjectionConceptRecord,
  ProjectionEdgeRecord,
  ProjectionTaskRecord,
} from "./ladybug-source";
import { compareCodeUnits } from "./order";
import type { WorkspaceRecordProvenance, WorkspaceResultScope } from "./workspace-contract";

export type TraversalEndpointKind = "concept" | "task";
export type TraversalDirection = "outbound" | "inbound" | "either";

export const DEFAULT_TRAVERSAL_MAX_DEPTH = 4;
export const MAX_TRAVERSAL_DEPTH = 16;
export const DEFAULT_TRAVERSAL_LIMIT = 20;
export const MAX_TRAVERSAL_LIMIT = 100;
export const MAX_TRAVERSAL_EDGE_VISITS = 10_000;

export interface RepositoryRecordProvenance {
  readonly repositoryScopeKey: string;
  readonly bundleId: string;
  readonly gitCommit: string | null;
  readonly exportDigest: string;
  readonly recordKind: TraversalEndpointKind;
  readonly recordKey: string;
  readonly sourceRecordKey: string;
  readonly sourcePath: string | null;
  readonly sourceId: string;
}

export type TraversalRecordProvenance = RepositoryRecordProvenance | WorkspaceRecordProvenance;

export interface TraversalEndpointRef {
  readonly kind: TraversalEndpointKind;
  readonly id: string;
}

export interface TraversalEndpoint extends TraversalEndpointRef {
  readonly recordKey: string;
  readonly provenance: TraversalRecordProvenance;
}

export interface TraversalEdge {
  readonly recordKey: string;
  readonly from: TraversalEndpointRef;
  readonly to: TraversalEndpointRef | null;
  /** Public authored kind. Workspace manifest kinds replace the storage-level link/task kind. */
  readonly kind: string;
  readonly sourceKind: string;
  readonly target: string;
  readonly ordinal: number;
  readonly dangling: boolean;
  readonly provenance: TraversalEdgeProvenance;
}

export interface TraversalEdgeProvenance {
  readonly recordKind: "authored-edge";
  readonly recordKey: string;
  readonly sourceRecordKey: string;
  readonly from: TraversalRecordProvenance;
  readonly to: TraversalRecordProvenance | null;
}

export interface TraversalStep {
  readonly from: TraversalEndpoint;
  readonly to: TraversalEndpoint;
  readonly edge: TraversalEdge;
  /** How this step traversed the authored edge, whose stored orientation remains in edge.from/edge.to. */
  readonly direction: "outbound" | "inbound";
}

export interface TraversalSnapshot {
  readonly endpoints: ReadonlyMap<string, TraversalEndpoint>;
  readonly edges: readonly TraversalEdge[];
  readonly workspace?: WorkspaceResultScope;
}

export interface TraversalSourceRecords {
  readonly concepts: readonly ProjectionConceptRecord[];
  readonly tasks: readonly ProjectionTaskRecord[];
  readonly authoredEdges: readonly ProjectionEdgeRecord[];
}

export interface BuildTraversalSnapshotOptions {
  readonly workspace?: WorkspaceResultScope;
  readonly conceptProvenanceById?: ReadonlyMap<string, WorkspaceRecordProvenance>;
  readonly taskProvenanceById?: ReadonlyMap<string, WorkspaceRecordProvenance>;
  /** Restrict a full workspace source to the already validated selected repository subset. */
  readonly allowedIds?: ReadonlySet<string>;
}

export interface TraversalLimits {
  readonly maxDepth: number;
  readonly limit: number;
  readonly maxEdgeVisits: number;
}

export interface TraversalAccounting {
  readonly edgeVisits: number;
  readonly depthBoundReached: boolean;
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface PathOptions {
  readonly from: TraversalEndpointRef;
  readonly to: TraversalEndpointRef;
  readonly direction: TraversalDirection;
  readonly edgeKinds?: readonly string[];
  readonly maxDepth?: number;
  readonly limit?: number;
}

export interface TraversalPath {
  readonly depth: number;
  readonly endpoints: readonly TraversalEndpoint[];
  readonly edges: readonly TraversalStep[];
}

export interface PathResult extends TraversalAccounting {
  readonly schemaVersion: "lore-path-result/1";
  readonly from: TraversalEndpoint;
  readonly to: TraversalEndpoint;
  readonly direction: TraversalDirection;
  readonly edgeKinds: readonly string[];
  readonly limits: TraversalLimits;
  readonly paths: readonly TraversalPath[];
  readonly shown: number;
  readonly workspace?: WorkspaceResultScope;
}

export interface ImpactOptions {
  readonly root: TraversalEndpointRef;
  readonly direction: TraversalDirection;
  readonly edgeKinds?: readonly string[];
  readonly maxDepth?: number;
  readonly limit?: number;
}

export interface ImpactEntry {
  readonly endpoint: TraversalEndpoint;
  readonly depth: number;
  readonly relationship: "direct" | "transitive";
  readonly evidence: readonly TraversalStep[];
}

export interface ImpactResult extends TraversalAccounting {
  readonly schemaVersion: "lore-impact-result/1";
  readonly root: TraversalEndpoint;
  readonly direction: TraversalDirection;
  readonly edgeKinds: readonly string[];
  readonly limits: TraversalLimits;
  readonly impacts: readonly ImpactEntry[];
  readonly shown: number;
  readonly workspace?: WorkspaceResultScope;
}

interface WalkState {
  readonly endpointKey: string;
  readonly endpoints: readonly TraversalEndpoint[];
  readonly steps: readonly TraversalStep[];
  readonly visited: ReadonlySet<string>;
}

interface AdjacentStep {
  readonly endpointKey: string;
  readonly step: TraversalStep;
}

/** Build exact typed traversal facts from the already validated projection source. */
export function buildTraversalSnapshot(
  source: LadybugProjectionSource,
  records: TraversalSourceRecords = source,
  options: BuildTraversalSnapshotOptions = {},
): TraversalSnapshot {
  const endpoints = new Map<string, TraversalEndpoint>();
  const byRecordKey = new Map<string, TraversalEndpoint>();
  for (const record of records.concepts) addEndpoint(record, "concept", source, options, endpoints, byRecordKey);
  for (const record of records.tasks) addEndpoint(record, "task", source, options, endpoints, byRecordKey);

  const edges: TraversalEdge[] = [];
  for (const record of records.authoredEdges) {
    const from = byRecordKey.get(record.from);
    const to = record.to === null ? null : byRecordKey.get(record.to);
    if (from === undefined || (record.to !== null && to === undefined)) {
      // A selected workspace subset deliberately excludes cross-boundary facts.
      if (options.allowedIds !== undefined) continue;
      throw invalidTraversal(`edge ${record.key} names an unknown endpoint`);
    }
    edges.push({
      recordKey: record.key,
      from: endpointRef(from),
      to: to === null || to === undefined ? null : endpointRef(to),
      kind: record.workspaceLinkKind ?? record.kind,
      sourceKind: record.kind,
      target: record.target,
      ordinal: record.ordinal,
      dangling: record.dangling || to === null,
      provenance: {
        recordKind: "authored-edge",
        recordKey: record.key,
        sourceRecordKey: record.workspaceSourceRecordKey ?? record.key,
        from: from.provenance,
        to: to?.provenance ?? null,
      },
    });
  }
  edges.sort(compareEdges);
  return {
    endpoints,
    edges,
    ...(options.workspace !== undefined ? { workspace: options.workspace } : {}),
  };
}

/** Return up to the requested number of shortest deterministic simple paths. */
export function findPaths(snapshot: TraversalSnapshot, options: PathOptions): PathResult {
  const limits = normalizedLimits(options.maxDepth, options.limit);
  const from = requireEndpoint(snapshot, options.from);
  const to = requireEndpoint(snapshot, options.to);
  const allowedKinds = normalizedKinds(options.edgeKinds, snapshot.edges);
  const adjacency = buildDirectedAdjacency(snapshot, options.direction, new Set(allowedKinds));
  const queue: WalkState[] = [stateFor(from)];
  const matches: TraversalPath[] = [];
  let cursor = 0;
  let edgeVisits = 0;
  let visitTruncated = false;
  let depthBoundReached = false;

  while (cursor < queue.length && matches.length <= limits.limit && !visitTruncated) {
    const state = queue[cursor++] as WalkState;
    if (state.endpointKey === endpointKey(to)) {
      matches.push({
        depth: state.steps.length,
        endpoints: state.endpoints,
        edges: state.steps,
      });
      continue;
    }
    if (state.steps.length >= limits.maxDepth) {
      if ((adjacency.get(state.endpointKey) ?? []).some((adjacent) => !state.visited.has(adjacent.endpointKey))) {
        depthBoundReached = true;
      }
      continue;
    }
    for (const adjacent of adjacency.get(state.endpointKey) ?? []) {
      edgeVisits += 1;
      if (edgeVisits > limits.maxEdgeVisits) {
        visitTruncated = true;
        break;
      }
      if (state.visited.has(adjacent.endpointKey)) continue;
      const endpoint = snapshot.endpoints.get(adjacent.endpointKey);
      if (endpoint === undefined) throw invalidTraversal("adjacency names an unknown endpoint");
      queue.push({
        endpointKey: adjacent.endpointKey,
        endpoints: [...state.endpoints, endpoint],
        steps: [...state.steps, adjacent.step],
        visited: new Set([...state.visited, adjacent.endpointKey]),
      });
    }
  }

  const resultTruncated = matches.length > limits.limit;
  const paths = matches.slice(0, limits.limit);
  const truncated = resultTruncated || visitTruncated;
  return {
    schemaVersion: "lore-path-result/1",
    from,
    to,
    direction: options.direction,
    edgeKinds: allowedKinds,
    limits,
    paths,
    shown: paths.length,
    edgeVisits: Math.min(edgeVisits, limits.maxEdgeVisits),
    depthBoundReached,
    truncated,
    complete: !truncated,
    ...(snapshot.workspace !== undefined ? { workspace: snapshot.workspace } : {}),
  };
}

/** Expand a bounded impact frontier and retain one canonical shortest evidence chain per endpoint. */
export function findImpact(snapshot: TraversalSnapshot, options: ImpactOptions): ImpactResult {
  const limits = normalizedLimits(options.maxDepth, options.limit);
  const root = requireEndpoint(snapshot, options.root);
  const allowedKinds = normalizedKinds(options.edgeKinds, snapshot.edges);
  const adjacency = buildDirectedAdjacency(snapshot, options.direction, new Set(allowedKinds));
  const queue: WalkState[] = [stateFor(root)];
  const visited = new Set<string>([endpointKey(root)]);
  const impacts: ImpactEntry[] = [];
  let cursor = 0;
  let edgeVisits = 0;
  let visitTruncated = false;
  let depthBoundReached = false;

  while (cursor < queue.length && impacts.length <= limits.limit && !visitTruncated) {
    const state = queue[cursor++] as WalkState;
    if (state.steps.length >= limits.maxDepth) {
      if ((adjacency.get(state.endpointKey) ?? []).some((adjacent) => !visited.has(adjacent.endpointKey))) {
        depthBoundReached = true;
      }
      continue;
    }
    for (const adjacent of adjacency.get(state.endpointKey) ?? []) {
      edgeVisits += 1;
      if (edgeVisits > limits.maxEdgeVisits) {
        visitTruncated = true;
        break;
      }
      if (visited.has(adjacent.endpointKey)) continue;
      const endpoint = snapshot.endpoints.get(adjacent.endpointKey);
      if (endpoint === undefined) throw invalidTraversal("adjacency names an unknown endpoint");
      visited.add(adjacent.endpointKey);
      const steps = [...state.steps, adjacent.step];
      impacts.push({
        endpoint,
        depth: steps.length,
        relationship: steps.length === 1 ? "direct" : "transitive",
        evidence: steps,
      });
      queue.push({
        endpointKey: adjacent.endpointKey,
        endpoints: [...state.endpoints, endpoint],
        steps,
        visited,
      });
      if (impacts.length > limits.limit) break;
    }
  }

  const resultTruncated = impacts.length > limits.limit;
  const shown = impacts.slice(0, limits.limit);
  const truncated = resultTruncated || visitTruncated;
  return {
    schemaVersion: "lore-impact-result/1",
    root,
    direction: options.direction,
    edgeKinds: allowedKinds,
    limits,
    impacts: shown,
    shown: shown.length,
    edgeVisits: Math.min(edgeVisits, limits.maxEdgeVisits),
    depthBoundReached,
    truncated,
    complete: !truncated,
    ...(snapshot.workspace !== undefined ? { workspace: snapshot.workspace } : {}),
  };
}

function addEndpoint(
  record: ProjectionConceptRecord | ProjectionTaskRecord,
  kind: TraversalEndpointKind,
  source: LadybugProjectionSource,
  options: BuildTraversalSnapshotOptions,
  endpoints: Map<string, TraversalEndpoint>,
  byRecordKey: Map<string, TraversalEndpoint>,
): void {
  if (options.allowedIds !== undefined && !options.allowedIds.has(record.id)) return;
  const workspaceProvenance =
    kind === "concept" ? options.conceptProvenanceById?.get(record.id) : options.taskProvenanceById?.get(record.id);
  const provenance: TraversalRecordProvenance = workspaceProvenance ?? repositoryProvenance(record, kind, source);
  const endpoint: TraversalEndpoint = {
    kind,
    id: record.id,
    recordKey: record.key,
    provenance,
  };
  const key = endpointKey(endpoint);
  if (endpoints.has(key) || byRecordKey.has(record.key))
    throw invalidTraversal(`duplicate ${kind} endpoint ${record.id}`);
  endpoints.set(key, endpoint);
  byRecordKey.set(record.key, endpoint);
}

function repositoryProvenance(
  record: ProjectionConceptRecord | ProjectionTaskRecord,
  kind: TraversalEndpointKind,
  source: LadybugProjectionSource,
): RepositoryRecordProvenance {
  return {
    repositoryScopeKey: source.repositoryScopeKey,
    bundleId: source.manifest.bundle.id,
    gitCommit: source.manifest.bundle.gitCommit,
    exportDigest: source.exportDigest,
    recordKind: kind,
    recordKey: record.key,
    sourceRecordKey: record.key,
    sourcePath: kind === "concept" ? (record as ProjectionConceptRecord).path : null,
    sourceId: record.id,
  };
}

function normalizedLimits(maxDepth = DEFAULT_TRAVERSAL_MAX_DEPTH, limit = DEFAULT_TRAVERSAL_LIMIT): TraversalLimits {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_TRAVERSAL_DEPTH) {
    throw invalidTraversal(`maximum depth must be between 0 and ${MAX_TRAVERSAL_DEPTH}`);
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TRAVERSAL_LIMIT) {
    throw invalidTraversal(`result limit must be between 1 and ${MAX_TRAVERSAL_LIMIT}`);
  }
  return { maxDepth, limit, maxEdgeVisits: MAX_TRAVERSAL_EDGE_VISITS };
}

function normalizedKinds(requested: readonly string[] | undefined, edges: readonly TraversalEdge[]): string[] {
  const values = requested === undefined || requested.length === 0 ? edges.map((edge) => edge.kind) : requested;
  return [...new Set(values)].sort(compareCodeUnits);
}

function requireEndpoint(snapshot: TraversalSnapshot, ref: TraversalEndpointRef): TraversalEndpoint {
  const endpoint = snapshot.endpoints.get(endpointKey(ref));
  if (endpoint !== undefined) return endpoint;
  throw new LoreError(
    "not_found",
    `${ref.kind} "${ref.id}" is not in the selected traversal scope`,
    "check the typed endpoint and explicit repository selection",
  );
}

function stateFor(endpoint: TraversalEndpoint): WalkState {
  const key = endpointKey(endpoint);
  return {
    endpointKey: key,
    endpoints: [endpoint],
    steps: [],
    visited: new Set([key]),
  };
}

function buildDirectedAdjacency(
  snapshot: TraversalSnapshot,
  direction: TraversalDirection,
  allowedKinds: ReadonlySet<string>,
): Map<string, AdjacentStep[]> {
  const adjacency = new Map<string, AdjacentStep[]>();
  const add = (
    from: TraversalEndpoint,
    to: TraversalEndpoint,
    edge: TraversalEdge,
    stepDirection: "outbound" | "inbound",
  ) => {
    const key = endpointKey(from);
    const values = adjacency.get(key) ?? [];
    values.push({
      endpointKey: endpointKey(to),
      step: { from, to, edge, direction: stepDirection },
    });
    adjacency.set(key, values);
  };
  for (const edge of snapshot.edges) {
    if (edge.to === null || !allowedKinds.has(edge.kind)) continue;
    const from = snapshot.endpoints.get(endpointKey(edge.from));
    const to = snapshot.endpoints.get(endpointKey(edge.to));
    if (from === undefined || to === undefined)
      throw invalidTraversal("edge endpoint is missing from traversal snapshot");
    if (direction === "outbound" || direction === "either") add(from, to, edge, "outbound");
    if (direction === "inbound" || direction === "either") add(to, from, edge, "inbound");
  }
  return adjacency;
}

function endpointRef(endpoint: TraversalEndpoint): TraversalEndpointRef {
  return { kind: endpoint.kind, id: endpoint.id };
}

function endpointKey(endpoint: TraversalEndpointRef): string {
  return `${endpoint.kind}\0${endpoint.id}`;
}

function compareEdges(a: TraversalEdge, b: TraversalEdge): number {
  return (
    compareCodeUnits(a.from.kind, b.from.kind) ||
    compareCodeUnits(a.from.id, b.from.id) ||
    compareCodeUnits(a.to?.kind ?? "", b.to?.kind ?? "") ||
    compareCodeUnits(a.to?.id ?? "", b.to?.id ?? "") ||
    compareCodeUnits(a.kind, b.kind) ||
    a.ordinal - b.ordinal ||
    compareCodeUnits(a.recordKey, b.recordKey)
  );
}

function invalidTraversal(message: string): LoreError {
  return new LoreError("validation", `traversal projection is invalid: ${message}`);
}
