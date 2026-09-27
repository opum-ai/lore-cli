// Types for scripts/pair-receipt.mjs (LCLI-613), so test/ can import it under strict tsc.

export type ExecFile = (
  file: string,
  args: string[],
  options?: Record<string, unknown>,
) => Promise<{ stdout: string; stderr?: string }>;

export interface Override {
  by: string;
  reason: string;
  task: string;
  adr: string;
}

export interface Observed {
  integrities: Record<string, string>;
  commit: string | null;
  commitSource?: string;
  commitError?: string;
  gitHead?: string | null;
  peel?: string[];
}

export interface Peeled {
  commit: string | null;
  chain: string[];
  error?: string;
}

export interface PairVerdict {
  ok: boolean;
  problems: string[];
  override: Override | null;
}

export interface Fetched {
  doc: unknown;
  source: string;
  error?: string;
}

export declare const PAIR_RECEIPT_KIND: string;
export declare const RECEIPT_HOST: string;
export declare const RECEIPT_REPOSITORY: string;
export declare const RECEIPT_REF: string;
export declare const OWN_REPOSITORY: string;
export declare const PLATFORMS: readonly string[];
export declare const RELEASE_PACKAGES: readonly string[];
export declare function pairReceiptPath(version: string): string;
export declare function tarballName(pkgName: string, version: string): string;
export declare function expectedTarballNames(version: string): string[];
export declare function evaluateVerdict(doc: Record<string, unknown>): {
  problems: string[];
  override: Override | null;
};
export declare function evaluatePairReceipt(
  doc: unknown,
  context: { version: string; observed: Observed },
): PairVerdict;
export declare function receiptReadArgs(version: string): string[];
export declare function fetchPairReceipt(version: string, options?: { execFile?: ExecFile }): Promise<Fetched>;
export declare function viewVersion(
  name: string,
  version: string,
  options?: { execFile?: ExecFile },
): Promise<Record<string, unknown> | null>;
export declare function observeRelease(
  version: string,
  packages?: readonly string[],
  options?: { execFile?: ExecFile },
): Promise<Observed>;
export declare const MAX_PEEL_DEPTH: number;
export declare function ownRepoReadArgs(path: string): string[];
export declare function resolveTagCommit(version: string, options?: { execFile?: ExecFile }): Promise<Peeled>;
export declare function requirePairQualification(args: {
  version: string;
  packages?: readonly string[];
  fetch?: (version: string) => Promise<Fetched>;
  observe?: (version: string) => Promise<Observed>;
}): Promise<PairVerdict & { source: string }>;
export declare function describeOverride(override: Override, source: string): string;
