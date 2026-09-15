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

/** A command result carrying the backend that produced it. See {@link withRetrievalBackend}. */
export type WithRetrievalBackend<T> = T & { readonly backend: RetrievalBackend };

/**
 * Stamp a result with the backend that served it, for the `--json` envelope's `data`.
 *
 * Every retrieval-family command emits through this, and its `backend` argument is REQUIRED rather
 * than optional so a call site cannot quietly omit it. That is the whole design of LCLI-499: until
 * now `RetrievalBackend` existed internally and reached no consumer, so nobody downstream could
 * prove the indexed path ran, prove it did not, or assert on either — which is why LCLI-497 (a
 * corruption that disabled the indexed backend entirely on any tracker with a prerequisite) could
 * only be found by accident.
 *
 * It is stamped on EVERY successful response, never only on a degraded one. A field that reported
 * the backend on some paths and not others reproduces the original defect at higher resolution: the
 * stderr advisory already behaves that way — three routes reach the reference backend under the
 * `auto` policy and one of them warns nothing at all — so empty stderr is consistent with both
 * "indexed ran" and "fell back silently". A partial signal invites the inference that it is total.
 *
 * It is added at the ENVELOPE layer rather than inside the shaping functions because `core/query`,
 * `core/graph`, `core/context` and `core/traversal` are storage-neutral by contract: which backend
 * answered is a fact about the load, not about the result, and teaching each shaper about storage
 * to carry one string would trade a real boundary for a small convenience.
 *
 * The `--json` envelope is versioned ADDITIVELY (cli-contract §7: consumers tolerate unknown keys),
 * so this needs no `schemaVersion` bump. Plain and pretty rendering is unchanged — the renderers
 * read the fields they name and ignore the rest.
 */
export function withRetrievalBackend<T extends object>(data: T, backend: RetrievalBackend): WithRetrievalBackend<T> {
  return { ...data, backend };
}

/**
 * Remove the {@link withRetrievalBackend} stamp from a `--json` envelope's text, for the one kind of
 * comparison that must ignore it: **backend parity**.
 *
 * The indexed and reference backends are required to produce the same answer, and are now required
 * to DISAGREE about exactly one field. A parity check that compares raw bytes therefore fails on
 * every result, and a parity check that quietly stopped comparing whole results to accommodate that
 * would be worse than the failure. This removes precisely the one field, so the rest of the payload
 * is still compared byte-for-byte — and a caller that wants the stamp itself asserts it separately,
 * which is a stronger check than the one it replaces.
 *
 * Non-JSON input (plain or pretty output, an error envelope on stderr, an empty stream) is returned
 * unchanged rather than rejected: a parity comparison covers those modes too, and they carry no
 * stamp to remove.
 */
export function stripRetrievalBackend(envelopeJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelopeJson);
  } catch {
    return envelopeJson;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return envelopeJson;
  const envelope = parsed as { data?: unknown };
  if (typeof envelope.data !== "object" || envelope.data === null || Array.isArray(envelope.data)) {
    return envelopeJson;
  }
  const { backend: _backend, ...data } = envelope.data as Record<string, unknown>;
  return JSON.stringify({ ...envelope, data });
}
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
 * existing in-memory graph. Failed indexed warnings and data are discarded; a
 * single sanitized advisory makes the backend downgrade visible without leaking
 * native-loader details.
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
    const reference = await loadReferenceGraph(options);
    warnReferenceFallback(options.warnings, "unsupported");
    return reference;
  }

  let indexedWarnings = new WarningCollector();
  const attemptState = { nativeReached: false };
  const memoizedNative = memoizeLadybugNativeLoader(options.loadNativeDriver ?? loadLadybugNativeDriver);
  const loadNative: LadybugNativeLoader = () => {
    attemptState.nativeReached = true;
    return memoizedNative();
  };
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
    const reference = await loadReferenceGraph(options);
    warnReferenceFallback(options.warnings, attemptState.nativeReached ? "failed" : "preflight");
    return reference;
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

function warnReferenceFallback(
  warnings: WarningCollector | undefined,
  reason: "unsupported" | "preflight" | "failed",
): void {
  warnings?.add(
    reason === "unsupported"
      ? "native indexed retrieval is unsupported on this platform; using the in-memory reference backend"
      : reason === "preflight"
        ? "indexed retrieval preflight failed before native activation; using the in-memory reference backend"
        : "native indexed retrieval failed; using the in-memory reference backend",
  );
}

function indexedUnavailable(): LoreError {
  return new LoreError(
    "validation",
    "verified indexed retrieval is unavailable",
    "retry after the local projection can be rebuilt, or use Lore's automatic in-memory fallback",
  );
}
