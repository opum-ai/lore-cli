/** Indexed/reference retrieval for one explicitly selected workspace. */

import type { BacklogAdapter } from "../adapters/backlog";
import { LoreError, WarningCollector } from "../errors";
import { reconcileLadybugProjection } from "./ladybug-lifecycle";
import {
  type LadybugIndexedReader,
  type LadybugNativeLoader,
  loadLadybugNativeDriver,
  memoizeLadybugNativeLoader,
  supportsLadybugNative,
} from "./ladybug-native";
import { query } from "./query";
import type { RetrievalGraph, RetrievalPolicy } from "./retrieval";
import type { WorkspaceRecordProvenance, WorkspaceResultScope } from "./workspace-contract";
import type { WorkspaceProjectedLink, WorkspaceProjection } from "./workspace-projection";
import { selectWorkspaceProjection } from "./workspace-projection";
import { type LoadWorkspaceProjectionOptions, loadWorkspaceProjection } from "./workspace-source";

export interface WorkspaceRetrievalSelection {
  readonly manifestPath: string;
  readonly memberIds: readonly string[];
}

export interface WorkspaceRetrievalContext {
  readonly scope: WorkspaceResultScope;
  readonly provenanceById: ReadonlyMap<string, WorkspaceRecordProvenance>;
  readonly taskProvenanceById: ReadonlyMap<string, WorkspaceRecordProvenance>;
  readonly links: readonly WorkspaceProjectedLink[];
}

export interface LoadWorkspaceRetrievalOptions {
  readonly root: string;
  readonly selection: WorkspaceRetrievalSelection;
  readonly warnings?: WarningCollector;
  readonly adapter?: BacklogAdapter;
  readonly policy?: RetrievalPolicy;
  readonly platform?: NodeJS.Platform;
  readonly loadNativeDriver?: LadybugNativeLoader;
  readonly sourceOptions?: Omit<LoadWorkspaceProjectionOptions, "root" | "manifestPath" | "warnings">;
}

export async function loadWorkspaceRetrievalGraph(options: LoadWorkspaceRetrievalOptions): Promise<RetrievalGraph> {
  const policy = options.policy ?? "auto";
  if (policy === "reference" || !supportsLadybugNative(options.platform)) {
    if (policy === "indexed" && !supportsLadybugNative(options.platform)) throw indexedUnavailable();
    return loadReference(options);
  }
  const loadNative = memoizeLadybugNativeLoader(options.loadNativeDriver ?? loadLadybugNativeDriver);
  let latest: WorkspaceProjection | undefined;
  let latestWarnings = new WarningCollector();
  const loadCandidate = async () => {
    const attemptWarnings = new WarningCollector();
    const loaded = await loadWorkspaceProjection({
      root: options.root,
      manifestPath: options.selection.manifestPath,
      warnings: attemptWarnings,
      ...options.sourceOptions,
    });
    latest = loaded.projection;
    latestWarnings = attemptWarnings;
    return loaded.projection.ladybugSource;
  };
  try {
    // Load once to resolve the stable workspace key that owns this contained cache.
    await loadCandidate();
    const workspaceSegment = select(latest, []).identity.workspaceKey.replace(/^sha256:/u, "");
    const lifecycle = await reconcileLadybugProjection({
      root: options.root,
      cacheRelRoot: `.lore/cache/workspaces/1/${workspaceSegment}`,
      retainOnlyCurrent: true,
      loadSource: loadCandidate,
      loadNativeDriver: loadNative,
    });
    if (lifecycle.generation === undefined) {
      if (policy === "indexed") throw indexedUnavailable();
      return referenceFromProjection(select(latest, options.selection.memberIds));
    }
    const projection = select(latest, options.selection.memberIds);
    const native = await loadNative();
    const reader = native.openLadybugIndexedReader(lifecycle.generation.databasePath, lifecycle.source);
    const indexed = subsetReader(reader, projection, options.selection.memberIds.length > 0);
    // The lifecycle may retry source capture. Publish only the last successful
    // attempt's advisories after the indexed reader has opened completely.
    copyWarnings(latestWarnings, options.warnings);
    return {
      graph: projection.graph,
      indexed,
      dispose: () => indexed.close(),
      backend: "indexed",
      provenance: {
        repositoryScopeKey: lifecycle.source.repositoryScopeKey,
        snapshotKey: lifecycle.source.snapshotKey,
        sourceFingerprint: lifecycle.source.sourceFingerprint,
        exportDigest: lifecycle.source.exportDigest,
        gitCommit: null,
      },
      workspace: contextFor(projection),
    };
  } catch (cause) {
    if (policy === "indexed") throw cause;
    // Invalid/missing/conflicting explicit candidates still fail loud here; the
    // reference load applies the same manifest/export validation and never leaks
    // a partial indexed candidate.
    try {
      return await loadReference(options);
    } catch {
      throw cause;
    }
  }
}

async function loadReference(options: LoadWorkspaceRetrievalOptions): Promise<RetrievalGraph> {
  const loaded = await loadWorkspaceProjection({
    root: options.root,
    manifestPath: options.selection.manifestPath,
    warnings: options.warnings,
    ...options.sourceOptions,
  });
  return referenceFromProjection(selectWorkspaceProjection(loaded.projection, options.selection.memberIds));
}

function referenceFromProjection(projection: WorkspaceProjection): RetrievalGraph {
  return { graph: projection.graph, backend: "reference", workspace: contextFor(projection) };
}

function select(projection: WorkspaceProjection | undefined, memberIds: readonly string[]): WorkspaceProjection {
  if (projection === undefined) throw new LoreError("drift", "workspace source was not retained after reconciliation");
  return selectWorkspaceProjection(projection, memberIds);
}

function subsetReader(
  reader: LadybugIndexedReader,
  projection: WorkspaceProjection,
  selectedSubset: boolean,
): LadybugIndexedReader {
  if (!selectedSubset) return reader;
  return {
    readBundleGraph: async () => projection.graph,
    readConceptBody: async (id) => projection.graph.concepts.get(id)?.body,
    query: async (options) => query(projection.graph, options),
    close: () => reader.close(),
  };
}

function contextFor(projection: WorkspaceProjection): WorkspaceRetrievalContext {
  return {
    scope: projection.scope,
    provenanceById: projection.provenanceById,
    taskProvenanceById: projection.taskProvenanceById,
    links: projection.links,
  };
}

function copyWarnings(from: WarningCollector, to?: WarningCollector): void {
  if (to === undefined) return;
  to.merge(from);
}

function indexedUnavailable(): LoreError {
  return new LoreError(
    "validation",
    "verified indexed workspace retrieval is unavailable",
    "retry after the explicit workspace projection can be rebuilt, or use Lore's automatic in-memory fallback",
  );
}
