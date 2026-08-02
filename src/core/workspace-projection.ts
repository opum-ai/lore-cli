/** Compose validated repository-local M6 exports into one namespaced workspace snapshot. */

import { LoreError } from "../errors";
import { VERSION } from "../meta";
import type { BundleGraph, Edge, EdgeKind } from "./bundle";
import type { Concept } from "./concept";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "./ladybug-native";
import {
  canonicalJson,
  digest,
  type LadybugProjectionSource,
  type ProjectionConceptRecord,
  type ProjectionEdgeRecord,
  type ProjectionTaskRecord,
  prepareLadybugProjectionSource,
} from "./ladybug-source";
import { type ProjectionRecord, projectionStreamHash } from "./projection";
import {
  buildWorkspaceIdentity,
  namespaceWorkspaceRecord,
  qualifyWorkspaceId,
  type WorkspaceIdentity,
  type WorkspaceManifest,
  type WorkspaceRecordProvenance,
  type WorkspaceRepositoryIdentity,
  type WorkspaceResultScope,
} from "./workspace-contract";

export interface WorkspaceMemberSource {
  readonly memberId: string;
  readonly root: string;
  readonly source: LadybugProjectionSource;
}

export interface WorkspaceProjectedLink {
  readonly linkId: string;
  readonly kind: string;
  readonly recordKey: string;
  readonly from: WorkspaceRecordProvenance;
  readonly to: WorkspaceRecordProvenance;
}

export interface WorkspaceProjection {
  readonly identity: WorkspaceIdentity;
  readonly scope: WorkspaceResultScope;
  readonly graph: BundleGraph;
  readonly provenanceById: ReadonlyMap<string, WorkspaceRecordProvenance>;
  readonly taskProvenanceById: ReadonlyMap<string, WorkspaceRecordProvenance>;
  readonly links: readonly WorkspaceProjectedLink[];
  readonly ladybugSource: LadybugProjectionSource;
}

/** Build a complete deterministic workspace projection from all explicit members. */
export function buildWorkspaceProjection(
  manifest: WorkspaceManifest,
  members: readonly WorkspaceMemberSource[],
): WorkspaceProjection {
  const ordered = [...members].sort((a, b) => compare(a.memberId, b.memberId));
  const identity = buildWorkspaceIdentity(
    manifest,
    ordered.map(({ memberId, source }) => ({
      memberId,
      repositoryScopeKey: source.repositoryScopeKey,
      bundleId: source.manifest.bundle.id,
      gitCommit: source.manifest.bundle.gitCommit,
      exportDigest: source.exportDigest,
    })),
  );
  const repositoryByMember = new Map(identity.repositories.map((repository) => [repository.memberId, repository]));
  const conceptKeyByMemberSource = new Map<string, string>();
  const taskKeyByMemberSource = new Map<string, string>();
  const conceptProvenanceByMemberId = new Map<string, WorkspaceRecordProvenance>();
  const taskProvenanceByMemberId = new Map<string, WorkspaceRecordProvenance>();
  const provenanceById = new Map<string, WorkspaceRecordProvenance>();
  const taskProvenanceById = new Map<string, WorkspaceRecordProvenance>();
  const concepts: ProjectionConceptRecord[] = [];
  const tasks: ProjectionTaskRecord[] = [];
  const authoredEdges: ProjectionEdgeRecord[] = [];
  const graphEdges: Edge[] = [];
  const graphConcepts = new Map<string, Concept>();
  const tokenEstimates = new Map<string, number>();

  for (const member of ordered) {
    const repository = requiredRepository(repositoryByMember, member.memberId);
    for (const record of member.source.concepts) {
      const qualifiedId = qualifyWorkspaceId(member.memberId, record.id);
      const identityRecord = namespaceWorkspaceRecord(repository, "concept", record.key, record.path);
      const provenance = provenanceFor(repository, "concept", record.id, identityRecord);
      conceptKeyByMemberSource.set(memberRecordKey(member.memberId, record.key), identityRecord.workspaceRecordKey);
      conceptProvenanceByMemberId.set(memberRecordKey(member.memberId, record.id), provenance);
      provenanceById.set(qualifiedId, provenance);
      concepts.push({
        ...record,
        key: identityRecord.workspaceRecordKey,
        id: qualifiedId,
        path: `workspace/${member.memberId}/${record.path}`,
      });
      graphConcepts.set(qualifiedId, {
        id: qualifiedId,
        path: `workspace/${member.memberId}/${record.path}`,
        type: record.type,
        frontmatter: record.frontmatter,
        body: record.body,
      });
      tokenEstimates.set(qualifiedId, record.tokenEstimate);
    }
    for (const record of member.source.tasks) {
      const qualifiedId = qualifyWorkspaceId(member.memberId, record.id);
      const identityRecord = namespaceWorkspaceRecord(repository, "task", record.key, null);
      const provenance = provenanceFor(repository, "task", record.id, identityRecord);
      taskKeyByMemberSource.set(memberRecordKey(member.memberId, record.key), identityRecord.workspaceRecordKey);
      taskProvenanceByMemberId.set(memberRecordKey(member.memberId, record.id), provenance);
      taskProvenanceById.set(qualifiedId, provenance);
      tasks.push({ ...record, key: identityRecord.workspaceRecordKey, id: qualifiedId });
    }
  }

  for (const member of ordered) {
    const repository = requiredRepository(repositoryByMember, member.memberId);
    const source = member.source;
    const conceptIdByKey = new Map(
      source.concepts.map((record) => [record.key, qualifyWorkspaceId(member.memberId, record.id)]),
    );
    for (const record of source.authoredEdges) {
      const identityRecord = namespaceWorkspaceRecord(repository, "authored-edge", record.key, null);
      const from = conceptKeyByMemberSource.get(memberRecordKey(member.memberId, record.from));
      const to =
        record.to === null
          ? null
          : (record.kind === "task" ? taskKeyByMemberSource : conceptKeyByMemberSource).get(
              memberRecordKey(member.memberId, record.to),
            );
      if (from === undefined || (record.to !== null && to === undefined)) {
        invalidWorkspace(`member ${member.memberId} contains an edge with an unknown endpoint`);
      }
      authoredEdges.push({
        ...record,
        key: identityRecord.workspaceRecordKey,
        from,
        to: to ?? null,
        target: record.dangling ? record.target : qualifyWorkspaceId(member.memberId, record.target),
      });
      if (record.kind !== "task") {
        const graphFrom = conceptIdByKey.get(record.from);
        const graphTo = record.to === null ? null : conceptIdByKey.get(record.to);
        if (graphFrom === undefined || (record.to !== null && graphTo === undefined)) {
          invalidWorkspace(`member ${member.memberId} contains a concept edge with an unknown endpoint`);
        }
        graphEdges.push({
          from: graphFrom,
          to: graphTo ?? null,
          kind: record.kind as EdgeKind,
          target: record.dangling ? record.target : qualifyWorkspaceId(member.memberId, record.target),
        });
      }
    }
  }

  const links: WorkspaceProjectedLink[] = [];
  for (const link of identity.links) {
    const fromMap = link.source.from.kind === "concept" ? conceptProvenanceByMemberId : taskProvenanceByMemberId;
    const toMap = link.source.to.kind === "concept" ? conceptProvenanceByMemberId : taskProvenanceByMemberId;
    const from = fromMap.get(memberRecordKey(link.source.from.memberId, link.source.from.id));
    const to = toMap.get(memberRecordKey(link.source.to.memberId, link.source.to.id));
    if (from === undefined || to === undefined) {
      invalidWorkspace(`explicit link ${link.linkId} names an endpoint absent from the selected exports`);
    }
    links.push({ linkId: link.linkId, kind: link.source.kind, recordKey: link.workspaceLinkKey, from, to });
    authoredEdges.push({
      record: "edge",
      key: link.workspaceLinkKey,
      from: from.recordKey,
      to: to.recordKey,
      kind: link.source.to.kind === "task" ? "task" : "link",
      target: qualifyWorkspaceId(link.source.to.memberId, link.source.to.id),
      ordinal: authoredEdges.length,
      dangling: false,
      workspaceFromKind: link.source.from.kind,
      workspaceToKind: link.source.to.kind,
      workspaceLinkKind: link.source.kind,
    });
    // Context/graph topology is concept-only today. Preserve every exact
    // authored endpoint in the projection while adding a structural edge only
    // when both endpoints are concepts.
    if (link.source.from.kind === "concept" && link.source.to.kind === "concept") {
      graphEdges.push({
        from: qualifyWorkspaceId(link.source.from.memberId, link.source.from.id),
        to: qualifyWorkspaceId(link.source.to.memberId, link.source.to.id),
        kind: "link",
        target: qualifyWorkspaceId(link.source.to.memberId, link.source.to.id),
      });
    }
  }

  concepts.sort((a, b) => compare(a.id, b.id));
  tasks.sort((a, b) => compare(a.id.toLowerCase(), b.id.toLowerCase()) || compare(a.id, b.id));
  graphEdges.sort((a, b) => compare(a.from, b.from) || compare(a.to ?? "", b.to ?? "") || compare(a.kind, b.kind));
  const manifestRecord: ProjectionRecord = {
    record: "manifest",
    schemaVersion: "1.0",
    bundle: { id: identity.workspaceKey, okfVersion: "workspace/1", docsRoot: "workspace", gitCommit: null },
    exporter: { name: "lore", version: VERSION },
    generatedAt: null,
    normalizationVersion: "1",
  };
  const semanticRecords: ProjectionRecord[] = [manifestRecord, ...concepts, ...authoredEdges, ...tasks];
  const trailer: ProjectionRecord = {
    record: "trailer",
    recordCount: semanticRecords.length,
    streamHash: projectionStreamHash(semanticRecords),
  };
  const records = [...semanticRecords, trailer];
  const identityBytes = canonicalJson(identity);
  const ladybugSource = prepareLadybugProjectionSource({
    projection: { records, jsonl: `${records.map((record) => JSON.stringify(record)).join("\n")}\n` },
    inventory: [
      {
        path: "workspace.identity.json",
        byteLength: Buffer.byteLength(identityBytes),
        byteHash: digest(identityBytes),
      },
    ],
    profileInventory: [],
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    loreVersion: VERSION,
    warnings: ordered.flatMap((member) => member.source.warnings.map((warning) => `[${member.memberId}] ${warning}`)),
  });
  const scope = scopeFor(manifest, identity);
  return {
    identity,
    scope,
    graph: workspaceGraph(graphConcepts, graphEdges, tokenEstimates),
    provenanceById,
    taskProvenanceById,
    links,
    ladybugSource,
  };
}

export function selectWorkspaceProjection(
  projection: WorkspaceProjection,
  memberIds: readonly string[],
): WorkspaceProjection {
  if (memberIds.length === 0) return projection;
  const requested = new Set(memberIds);
  if (requested.size !== memberIds.length) invalidWorkspace("repository selectors must be unique");
  const known = new Set(projection.identity.repositories.map((repository) => repository.memberId));
  for (const memberId of requested) if (!known.has(memberId)) invalidWorkspace(`unknown workspace member ${memberId}`);
  const selected = projection.identity.repositories.filter((repository) => requested.has(repository.memberId));
  const allowed = new Set(selected.map((repository) => repository.memberId));
  const concepts = new Map([...projection.graph.concepts].filter(([id]) => allowed.has(memberOfQualifiedId(id))));
  const provenanceById = new Map([...projection.provenanceById].filter(([, value]) => allowed.has(value.memberId)));
  const taskProvenanceById = new Map(
    [...projection.taskProvenanceById].filter(([, value]) => allowed.has(value.memberId)),
  );
  const edges = projection.graph.edges.filter(
    (edge) => concepts.has(edge.from) && (edge.to === null || concepts.has(edge.to)),
  );
  const tokens = new Map([...concepts].map(([id]) => [id, projection.graph.tokenEstimate(id)]));
  return {
    ...projection,
    scope: {
      ...projection.scope,
      repositories: projection.scope.repositories.filter((repo) => allowed.has(repo.memberId)),
    },
    graph: workspaceGraph(concepts, edges, tokens),
    provenanceById,
    taskProvenanceById,
    links: projection.links.filter((link) => allowed.has(link.from.memberId) && allowed.has(link.to.memberId)),
  };
}

function scopeFor(manifest: WorkspaceManifest, identity: WorkspaceIdentity): WorkspaceResultScope {
  return {
    schemaVersion: "lore-workspace-result-scope/1",
    workspaceId: manifest.workspaceId,
    workspaceKey: identity.workspaceKey,
    snapshotKey: identity.snapshotKey,
    repositories: identity.repositories.map((repository) => repositoryResult(repository)),
  };
}

function provenanceFor(
  repository: WorkspaceRepositoryIdentity,
  recordKind: WorkspaceRecordProvenance["recordKind"],
  sourceId: string,
  record: ReturnType<typeof namespaceWorkspaceRecord>,
): WorkspaceRecordProvenance {
  return {
    ...repositoryResult(repository),
    recordKind,
    recordKey: record.workspaceRecordKey,
    sourceRecordKey: record.sourceRecordKey,
    sourceKey: record.workspaceSourceKey,
    sourcePath: record.sourcePath,
    sourceId,
  };
}

function repositoryResult(repository: WorkspaceRepositoryIdentity) {
  return {
    memberId: repository.memberId,
    repositoryKey: repository.repositoryKey,
    repositoryScopeKey: repository.source.repositoryScopeKey,
    bundleKey: repository.bundleKey,
    bundleId: repository.source.bundleId,
    commitKey: repository.commitKey,
    gitCommit: repository.source.gitCommit,
    exportKey: repository.exportKey,
    exportDigest: repository.source.exportDigest,
  };
}

function workspaceGraph(
  concepts: ReadonlyMap<string, Concept>,
  edges: readonly Edge[],
  tokens: ReadonlyMap<string, number>,
): BundleGraph {
  let total: number | undefined;
  return {
    concepts,
    edges,
    tokenEstimate(id?: string): number {
      if (id === undefined) {
        total ??= [...tokens.values()].reduce((sum, value) => sum + value, 0);
        return total;
      }
      const value = tokens.get(id);
      if (value === undefined) throw new LoreError("not_found", `concept "${id}" is not in the workspace`);
      return value;
    },
  };
}

function requiredRepository(
  repositories: ReadonlyMap<string, WorkspaceRepositoryIdentity>,
  memberId: string,
): WorkspaceRepositoryIdentity {
  const repository = repositories.get(memberId);
  if (repository === undefined) invalidWorkspace(`identity is missing member ${memberId}`);
  return repository;
}

function memberRecordKey(memberId: string, value: string): string {
  return `${memberId}\0${value}`;
}

function memberOfQualifiedId(id: string): string {
  return id.slice(0, id.indexOf("::"));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function invalidWorkspace(message: string): never {
  throw new LoreError(
    "validation",
    `workspace projection is invalid: ${message}`,
    "fix the explicit workspace manifest or selected repository exports",
  );
}
