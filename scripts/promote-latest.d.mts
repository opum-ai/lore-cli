// Types for scripts/promote-latest.mjs (LCLI-613), so test/ can import it under strict tsc.

export type Run = (
  command: string,
  args: string[],
  options?: Record<string, unknown>,
) => Promise<{ stdout: string; stderr?: string }>;

export interface RecordEntry {
  name: string;
  priorLatest: string | null;
}

export interface PromotionRecord {
  schemaVersion: 1;
  kind: string;
  version: string;
  recordedAt: string;
  packages: RecordEntry[];
}

export type SetTag = (name: string, target: string, tag: string) => Promise<unknown>;

export declare const STAGE_TAG: string;
export declare const PROMOTE_TAG: string;
export declare const RECORD_KIND: string;
export declare const KEYCHAIN_SERVICE: string;
export declare const defaultRun: Run;
export declare function distTagAddArgs(name: string, target: string, tag: string, options?: { otp?: string }): string[];
export declare function readDistTags(name: string, options?: { run?: Run }): Promise<Record<string, string>>;
export declare function planPromotion(args: {
  version: string;
  packages?: readonly string[];
  readTags?: (name: string) => Promise<Record<string, string>>;
  now?: () => Date;
  resuming?: boolean;
}): Promise<{ ok: true; record: PromotionRecord } | { ok: false; problems: string[] }>;
export declare function validateRecord(
  record: unknown,
  options?: { version?: string; packages?: readonly string[] },
): { ok: boolean; problems: string[] };
export declare function promote(args: {
  record: PromotionRecord;
  setTag: SetTag;
  log?: (line: string) => void;
}): Promise<
  | { ok: true; moved: string[] }
  | { ok: false; moved: string[]; failed: string; restored: { ok: boolean; failed: string[] } }
>;
export declare function rollback(args: {
  record: PromotionRecord;
  setTag: SetTag;
  log?: (line: string) => void;
}): Promise<{ ok: boolean; failed: string[] }>;
export declare function verifyTags(args: {
  expected: Record<string, string | null>;
  readTags?: (name: string) => Promise<Record<string, string>>;
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ ok: boolean; attempts: number; wrong: string[] }>;
export declare function tokenShape(token: string): { length: number; prefix: string; whitespace: boolean };
export declare function resolveToken(options?: {
  run?: Run;
  env?: Record<string, string | undefined>;
}): Promise<{ token: string | null; source: string }>;
export declare function main(
  argv: string[],
  options?: {
    run?: Run;
    env?: Record<string, string | undefined>;
    out?: (line: string) => void;
    err?: (line: string) => void;
    readPackageVersion?: () => Promise<string>;
    verifyOptions?: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> };
  },
): Promise<number>;
