/**
 * okf-version.ts — the typed negotiation seam for bundle-level OKF semantics.
 *
 * A producer profile declares one version lore knows how to emit. A consumed bundle declares its
 * target independently on the bundle-root `index.md`; that declaration, not the local profile,
 * selects read/check/template semantics. Missing declarations are classified explicitly as legacy
 * 0.1, while a future version is consumed best-effort with current 0.2 semantics as OKF §12 asks.
 */

import { LoreError } from "../errors";

/** The OKF versions this lore build can emit and model exactly. */
export const SUPPORTED_OKF_VERSIONS = ["0.1", "0.2"] as const;

/** One exactly-supported OKF semantic version. */
export type OkfVersion = (typeof SUPPORTED_OKF_VERSIONS)[number];

/** The version emitted by the built-in profile and used for best-effort future-version reads. */
export const CURRENT_OKF_VERSION: OkfVersion = "0.2";

/** The compatibility version assigned to an unstamped pre-negotiation bundle. */
export const LEGACY_OKF_VERSION: OkfVersion = "0.1";

/** How the effective version was obtained. This prevents a missing declaration becoming invisible. */
export type BundleVersionSource = "declared" | "legacy-missing" | "future-best-effort";

/** Typed state threaded through bundle, schema, template, and check layers. */
export interface BundleState {
  /** The supported semantics lore applies to this bundle. */
  readonly okfVersion: OkfVersion;
  /** How those semantics were selected. */
  readonly source: BundleVersionSource;
  /** The authored value for a future version; absent for declared-supported and missing cases. */
  readonly declaredVersion?: string;
}

/** A deterministic diagnostic produced while negotiating a consumed bundle. */
export interface BundleVersionIssue {
  readonly severity: "error" | "warning";
  readonly message: string;
}

/** A resolved state plus diagnostics; error issues mean a command must fail validation. */
export interface BundleStateResolution {
  readonly state: BundleState;
  readonly issues: readonly BundleVersionIssue[];
}

/** Narrow an arbitrary value to an exactly-supported version. */
export function isSupportedOkfVersion(value: unknown): value is OkfVersion {
  return typeof value === "string" && (SUPPORTED_OKF_VERSIONS as readonly string[]).includes(value);
}

/**
 * Parse the producer target from `.lore/profile.*`. Producers may emit only versions this build
 * understands exactly; unlike consumption, best-effort future-version output would manufacture a
 * contract lore cannot honor and therefore fails as a validation error (exit 6).
 */
export function requireSupportedOkfVersion(value: unknown, key: string, source: string): OkfVersion {
  if (isSupportedOkfVersion(value)) {
    return value;
  }
  throw new LoreError(
    "validation",
    `${source}: ${key} must be one of ${SUPPORTED_OKF_VERSIONS.map((version) => JSON.stringify(version)).join(", ")}`,
    `set ${key} to a supported OKF version`,
    { key, value },
  );
}

/**
 * Resolve bundle semantics from the root index frontmatter mapping.
 *
 * - Missing root/frontmatter/key is explicitly typed as legacy 0.1.
 * - A supported string is authoritative and clean.
 * - A future string uses current 0.2 semantics with an explicit best-effort warning (OKF §12).
 * - A present non-string/empty value is malformed and produces an error issue.
 */
export function resolveBundleState(rootFrontmatter: Record<string, unknown> | null): BundleStateResolution {
  if (rootFrontmatter === null || !Object.hasOwn(rootFrontmatter, "okf_version")) {
    return {
      state: { okfVersion: LEGACY_OKF_VERSION, source: "legacy-missing" },
      issues: [],
    };
  }

  const value = rootFrontmatter.okf_version;
  if (isSupportedOkfVersion(value)) {
    return { state: { okfVersion: value, source: "declared" }, issues: [] };
  }
  if (typeof value === "string" && value.trim() !== "") {
    return {
      state: { okfVersion: CURRENT_OKF_VERSION, source: "future-best-effort", declaredVersion: value },
      issues: [
        {
          severity: "warning",
          message: `bundle declares unsupported okf_version ${JSON.stringify(value)}; applying best-effort ${CURRENT_OKF_VERSION} semantics`,
        },
      ],
    };
  }
  return {
    state: { okfVersion: CURRENT_OKF_VERSION, source: "future-best-effort" },
    issues: [
      {
        severity: "error",
        message: `bundle-root index.md okf_version must be a non-empty string, got ${describeValue(value)}`,
      },
    ],
  };
}

/** Stable, bounded diagnostic rendering for malformed scalar values. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object") return "a mapping";
  return `${typeof value} ${JSON.stringify(value)}`;
}
