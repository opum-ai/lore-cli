/**
 * Backend selection for Lore's existing graph/query/context contracts.
 *
 * The indexed path reads one completely verified immutable Ladybug generation
 * into the same BundleGraph model the reference filesystem loader produces.
 * Selection and fallback complete before a command renders or writes output.
 */

import { join } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { LoreError, WarningCollector } from "../errors";
import { type BundleGraph, loadBundle } from "./bundle";
import { reconcileLadybugProjection } from "./ladybug-lifecycle";
import {
  EXPECTED_LADYBUG_STORAGE_VERSION,
  EXPECTED_LADYBUG_VERSION,
  type LadybugIndexedReader,
  type LadybugNativeLoader,
  loadLadybugNativeDriver,
  memoizeLadybugNativeLoader,
  supportsLadybugNative,
} from "./ladybug-native";
import { loadLadybugProjectionFreshness, loadLadybugProjectionSource } from "./ladybug-source";
import { loadProfile } from "./profile";
import { DOCS_DIR } from "./scaffold";
import { buildTraversalSnapshot, type TraversalSnapshot } from "./traversal";
import {
  loadWorkspaceRetrievalGraph,
  type WorkspaceRetrievalContext,
  type WorkspaceRetrievalSelection,
} from "./workspace-retrieval";

export type RetrievalBackend = "indexed" | "reference";
export type RetrievalPolicy = "auto" | RetrievalBackend;

/** Internal provenance proving which verified snapshot supplied an indexed graph. */
export interface IndexedRetrievalProvenance {
  readonly repositoryScopeKey: string;
  readonly snapshotKey: string;
  readonly sourceFingerprint: string;
  readonly exportDigest: string;
  readonly gitCommit: string | null;
}

export interface RetrievalGraph {
  readonly graph: BundleGraph;
  /** Bounded persisted operations available only for a verified indexed generation. */
  readonly indexed?: LadybugIndexedReader;
  /** Release native resources owned by this retrieval load. */
  readonly dispose?: () => Promise<void>;
  readonly backend: RetrievalBackend;
  readonly provenance?: IndexedRetrievalProvenance;
  /** Explicit multi-repository scope; absent for byte-compatible repository-local retrieval. */
  readonly workspace?: WorkspaceRetrievalContext;
  /** Exact typed authored facts for bounded path and impact operations. */
  readonly traversal?: TraversalSnapshot;
}

export interface RetrievalGraphOptions {
  readonly root: string;
  readonly warnings?: WarningCollector;
  readonly adapter?: BacklogAdapter;
  readonly resolveGitCommit?: (root: string) => string | null;
  /** Internal test/conformance control; never exposed as a public CLI flag. */
  readonly policy?: RetrievalPolicy;
  /** Injectable platform fact for objective Windows-safe fallback coverage. */
  readonly platform?: NodeJS.Platform;
  /** Injectable lazy native boundary for load-order and failure tests. */
  readonly loadNativeDriver?: LadybugNativeLoader;
  /** Explicit workspace selection; absence preserves the repository-local M6 path. */
  readonly workspace?: WorkspaceRetrievalSelection;
  /** Load the typed authored-edge traversal snapshot beside the concept graph. */
  readonly includeTraversal?: boolean;
}

export type RetrievalGraphLoader = (options: RetrievalGraphOptions) => Promise<RetrievalGraph>;

/**
 * Select a verified indexed graph when supported and usable, otherwise load the
 * existing in-memory graph. Failed indexed warnings and data are discarded so a
 * fallback run has exactly the reference path's observable stderr/stdout.
 */
export async function loadRetrievalGraph(options: RetrievalGraphOptions): Promise<RetrievalGraph> {
  if (options.workspace !== undefined) {
    return loadWorkspaceRetrievalGraph({
      root: options.root,
      selection: options.workspace,
      warnings: options.warnings,
      adapter: options.adapter,
      policy: options.policy,
      platform: options.platform,
      loadNativeDriver: options.loadNativeDriver,
      sourceOptions: {
        adapterForRoot: (root) => (root === options.root ? options.adapter : undefined),
      },
      includeTraversal: options.includeTraversal,
    });
  }
  const policy = options.policy ?? "auto";
  if (policy === "reference") {
    return loadReferenceGraph(options);
  }
  if (!supportsLadybugNative(options.platform)) {
    if (policy === "indexed") {
      throw indexedUnavailable();
    }
    return loadReferenceGraph(options);
  }

  let indexedWarnings = new WarningCollector();
  const loadNative = memoizeLadybugNativeLoader(options.loadNativeDriver ?? loadLadybugNativeDriver);
  const loadSource = async () => {
    const attemptWarnings = new WarningCollector();
    const source = await loadLadybugProjectionSource({
      root: options.root,
      ladybugVersion: EXPECTED_LADYBUG_VERSION,
      ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
      adapter: options.adapter,
      resolveGitCommit: options.resolveGitCommit,
      warnings: attemptWarnings,
    });
    indexedWarnings = attemptWarnings;
    return source;
  };
  const loadFreshness = () =>
    loadLadybugProjectionFreshness({
      root: options.root,
      ladybugVersion: EXPECTED_LADYBUG_VERSION,
      ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
      adapter: options.adapter,
      resolveGitCommit: options.resolveGitCommit,
    });
  try {
    const lifecycle = await reconcileLadybugProjection({
      root: options.root,
      loadSource,
      loadFreshness,
      loadNativeDriver: loadNative,
    });
    if (lifecycle.generation === undefined) {
      if (policy === "indexed") throw indexedUnavailable();
      return loadReferenceGraph(options);
    }
    const native = await loadNative();
    indexedWarnings = new WarningCollector();
    for (const warning of lifecycle.source.warnings) indexedWarnings.add(warning);
    const indexed = native.openLadybugIndexedReader(lifecycle.generation.databasePath, lifecycle.source);
    const graph = await indexed.readBundleGraph();
    const traversal = options.includeTraversal
      ? buildTraversalSnapshot(lifecycle.source, (await indexed.readTraversalRecords?.()) ?? lifecycle.source)
      : undefined;
    copyWarnings(indexedWarnings, options.warnings);
    return {
      graph,
      indexed,
      dispose: () => indexed.close(),
      backend: "indexed",
      provenance: {
        repositoryScopeKey: lifecycle.source.repositoryScopeKey,
        snapshotKey: lifecycle.source.snapshotKey,
        sourceFingerprint: lifecycle.source.sourceFingerprint,
        exportDigest: lifecycle.source.exportDigest,
        gitCommit: lifecycle.source.manifest.bundle.gitCommit,
      },
      ...(traversal !== undefined ? { traversal } : {}),
    };
  } catch (cause) {
    if (policy === "indexed") throw cause;
    return loadReferenceGraph(options);
  }
}

/** The retained filesystem/in-memory conformance oracle and fallback. */
export async function loadReferenceRetrievalGraph(options: RetrievalGraphOptions): Promise<RetrievalGraph> {
  return loadReferenceGraph(options);
}

async function loadReferenceGraph(options: RetrievalGraphOptions): Promise<RetrievalGraph> {
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(join(options.root, DOCS_DIR), {
    warnings: options.warnings,
    profile,
  });
  const traversal = options.includeTraversal
    ? buildTraversalSnapshot(
        await loadLadybugProjectionSource({
          root: options.root,
          ladybugVersion: EXPECTED_LADYBUG_VERSION,
          ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
          adapter: options.adapter,
          resolveGitCommit: options.resolveGitCommit,
        }),
      )
    : undefined;
  return {
    graph,
    backend: "reference",
    ...(traversal !== undefined ? { traversal } : {}),
  };
}

function copyWarnings(from: WarningCollector, to?: WarningCollector): void {
  if (to === undefined) return;
  for (const message of from.list()) to.add(message);
}

function indexedUnavailable(): LoreError {
  return new LoreError(
    "validation",
    "verified indexed retrieval is unavailable",
    "retry after the local projection can be rebuilt, or use Lore's automatic in-memory fallback",
  );
}
