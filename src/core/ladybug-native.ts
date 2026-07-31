/**
 * Lazy native boundary for the repository-local Ladybug projection.
 *
 * This module is safe to import on every supported Lore platform. It contains
 * only the exact compatibility facts selected by LCLI-283.1.2 and a dynamic
 * loader for the private driver. The @ladybugdb/core addon is evaluated only
 * when {@link loadLadybugNativeDriver} is called on a supported host.
 */

import { LoreError } from "../errors";
import type { BundleGraph } from "./bundle";
import type { LadybugProjectionSource } from "./ladybug-source";

/** Exact package/runtime version frozen into ladybug-projection/1 fingerprints. */
export const EXPECTED_LADYBUG_VERSION = "0.18.2";
/** Exact storage version reported by @ladybugdb/core 0.18.2. */
export const EXPECTED_LADYBUG_STORAGE_VERSION = "42";

/** Structural facts proven by a complete read-only native verification. */
export interface LadybugDatabaseVerification {
  readonly repositoryScopeKey: string;
  readonly snapshotKey: string;
  readonly sourceFingerprint: string;
  readonly exportDigest: string;
  readonly taskSnapshotDigest: string;
  readonly sourceRecordsDigest: string;
  readonly recordKeysDigest: string;
  readonly recordCount: number;
  readonly conceptCount: number;
  readonly taskCount: number;
  readonly authoredEdgeCount: number;
}

/** The private capabilities exposed by the dynamically loaded native driver. */
export interface LadybugNativeDriver {
  readonly LADYBUG_VERSION: string;
  readonly LADYBUG_STORAGE_VERSION: string;
  buildLadybugDatabase(databasePath: string, source: LadybugProjectionSource): Promise<void>;
  verifyLadybugDatabase(databasePath: string, source: LadybugProjectionSource): Promise<LadybugDatabaseVerification>;
  readLadybugBundleGraph(databasePath: string, source: LadybugProjectionSource): Promise<BundleGraph>;
}

export type LadybugNativeLoader = () => Promise<LadybugNativeDriver>;

/** Share one dynamic import/native-module evaluation across one retrieval operation. */
export function memoizeLadybugNativeLoader(loader: LadybugNativeLoader): LadybugNativeLoader {
  let pending: Promise<LadybugNativeDriver> | undefined;
  return () => (pending ??= loader());
}

/**
 * Bun 1.2.23 segfaults while evaluating the Ladybug addon on Windows. Native
 * Windows qualification belongs to LCLI-283.1.4, so indexed routing must select
 * the reference fallback before invoking the dynamic loader there.
 */
export function supportsLadybugNative(platform: NodeJS.Platform = process.platform): boolean {
  return platform !== "win32";
}

/** Dynamically evaluate and verify the exact private native driver. */
export async function loadLadybugNativeDriver(): Promise<LadybugNativeDriver> {
  const driver = await import("./ladybug-driver");
  if (
    driver.LADYBUG_VERSION !== EXPECTED_LADYBUG_VERSION ||
    driver.LADYBUG_STORAGE_VERSION !== EXPECTED_LADYBUG_STORAGE_VERSION
  ) {
    throw new LoreError(
      "validation",
      "installed Ladybug runtime does not match the projection compatibility contract",
      "reinstall the exact locked dependencies before rebuilding the disposable projection",
    );
  }
  return driver;
}
