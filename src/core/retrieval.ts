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
import {
  isIndexedVerificationFailure,
  loadLadybugProjectionFreshness,
  loadLadybugProjectionSource,
} from "./ladybug-source";
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
    warnReferenceFallback(options.warnings, "unsupported-platform");
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
      // This route used to return silently (LCLI-498). It is a fallback like any other -- no usable
      // indexed snapshot, so the reference backend answered -- and a fallback that announces itself
      // on two routes out of three is worse than one that never does, because its silence then
      // reads as success. opum-cli-e2e found this by asking what their stderr assertion could
      // actually prove.
      const reference = await loadReferenceGraph(options);
      warnReferenceFallback(options.warnings, "generation-unavailable");
      return reference;
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
    warnReferenceFallback(options.warnings, fallbackReason(cause, attemptState.nativeReached));
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

/**
 * Why retrieval fell back to the in-memory reference backend — a **closed set**, defined here and
 * nowhere else (LCLI-498).
 *
 * Before this, every fallback but one produced the same sentence, "native indexed retrieval
 * failed", whether the cause was a corrupt edge record, an unopenable generation or an unsupported
 * driver. A user could not act on it and a maintainer could not triage it without attaching a
 * debugger and re-running under `policy: "indexed"` to see the real throw — which is literally the
 * route LCLI-497 took.
 *
 * It is a closed set rather than the underlying error's own text for two reasons, and both matter.
 * The cause reads "Ladybug projection verification failed: …", and the storage engine is an
 * implementation detail this CLI does not expose — a constraint an existing test enforces. And a
 * free-form interpolation is not testable: a caller can assert that a reason is `verification`, and
 * cannot assert anything useful about a sentence that may change with any internal message.
 */
export const REFERENCE_FALLBACK_REASONS = [
  "unsupported-platform",
  "driver-unavailable",
  "verification-failed",
  "generation-unavailable",
  "preflight-failed",
  "unexpected",
] as const;

/** One member of the closed {@link REFERENCE_FALLBACK_REASONS} set. */
export type ReferenceFallbackReason = (typeof REFERENCE_FALLBACK_REASONS)[number];

/**
 * The advisory for one fallback reason, in the CLI's own vocabulary.
 *
 * Every sentence names what happened and what it means for this run, and none names the storage
 * engine, a filesystem path, or a query — the same constraint the public-output test already
 * enforces, expressed here as data so a new reason cannot be added without a sentence that meets it.
 */
export function referenceFallbackMessage(reason: ReferenceFallbackReason): string {
  return `${FALLBACK_CAUSES[reason]}; using the in-memory reference backend`;
}

const FALLBACK_CAUSES: Readonly<Record<ReferenceFallbackReason, string>> = Object.freeze({
  "unsupported-platform": "indexed retrieval is unsupported on this platform",
  "driver-unavailable": "the indexed retrieval driver could not be loaded",
  "verification-failed": "the indexed snapshot disagrees with the exported records",
  "generation-unavailable": "no usable indexed snapshot was available",
  "preflight-failed": "indexed retrieval failed before it could start",
  unexpected: "indexed retrieval failed for an unrecognised reason",
});

function warnReferenceFallback(warnings: WarningCollector | undefined, reason: ReferenceFallbackReason): void {
  warnings?.add(referenceFallbackMessage(reason));
}

/**
 * Classify a thrown cause into one of the closed reasons.
 *
 * `nativeReached` separates "we never got as far as the native boundary" from "we did and it went
 * wrong", which no property of the error itself can tell you. Beyond that the classification reads
 * a DECLARED marker the verification failure carries, not its message text: matching on prose is
 * the proxy-instead-of-predicate mistake LCLI-497 was, one layer up.
 */
function fallbackReason(cause: unknown, nativeReached: boolean): ReferenceFallbackReason {
  if (!nativeReached) return "preflight-failed";
  if (cause instanceof LoreError) {
    return cause.type === "validation" && isIndexedVerificationFailure(cause) ? "verification-failed" : "unexpected";
  }
  return cause instanceof Error ? "driver-unavailable" : "unexpected";
}

function indexedUnavailable(): LoreError {
  return new LoreError(
    "validation",
    "verified indexed retrieval is unavailable",
    "retry after the local projection can be rebuilt, or use Lore's automatic in-memory fallback",
  );
}
