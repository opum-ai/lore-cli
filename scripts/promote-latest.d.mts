// Types for scripts/promote-latest.mjs (LCLI-613, LCLI-621), so test/ can import it under strict tsc.

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
  launcherVersion?: string;
  releaseRunId?: string;
  recordedAt: string;
  packages: RecordEntry[];
}

export interface ArtifactFile {
  filename: string;
  path: string;
  sha256: string;
  integrity: string;
}

export type Probe = (
  name: string,
  version: string,
) => Promise<{ state: "absent" } | { state: "present"; integrity: string | null }>;

export type SetTag = (name: string, target: string, tag: string) => Promise<unknown>;

export declare const STAGE_TAG: string;
export declare const PROMOTE_TAG: string;
export declare const RECORD_KIND: string;
export declare const KEYCHAIN_SERVICE: string;
export declare const QUEST_PACKAGE: string;
export declare const RELEASE_WORKFLOW: string;
export declare const ARTIFACT_NAME: string;
export declare const SEMVER: RegExp;
export declare const RELEASE_VERSION: RegExp;
export declare function distTagReadArgs(name: string): string[];
export declare function versionReadArgs(spec: string): string[];
export declare function packArgs(spec: string, into: string): string[];
export declare function releaseRunReadArgs(runId: string): string[];
export declare function artifactDownloadArgs(runId: string, into: string): string[];
export declare function launcherPublishArgs(tarball: string, options?: { otp?: string }): string[];
export declare function sha256Hex(bytes: Uint8Array): string;
export declare function integrityOf(bytes: Uint8Array): string;
export declare function checkReleaseRun(run: unknown, expected: { runId: string; commit: string }): string[];
export declare function readArtifact(
  dir: string,
  version: string,
): Promise<{
  ok: boolean;
  problems: string[];
  launcherVersion?: string | null;
  staged?: Record<string, string>;
  rc?: ArtifactFile;
  final?: ArtifactFile;
}>;
export declare function downloadServedTarball(spec: string, into: string, options?: { run?: Run }): Promise<string>;
export declare function checkServedLauncher(args: {
  version: string;
  launcherVersion: string;
  rc: ArtifactFile;
  final: ArtifactFile;
  finalSha256: string;
  download: (spec: string, into: string) => Promise<string>;
}): Promise<{ ok: boolean; problems: string[] }>;
export declare function probeVersion(
  name: string,
  version: string,
  options?: { run?: Run },
): Promise<{ state: "absent" } | { state: "present"; integrity: string | null }>;
export declare function publishFinalLauncher(args: {
  version: string;
  final: ArtifactFile;
  recheck: () => Promise<{ ok: boolean; problems: string[] }>;
  publish: (tarball: string) => Promise<unknown>;
  setTag: SetTag;
  probe: Probe;
}): Promise<string>;
export declare function verifyFinalLauncher(args: {
  version: string;
  final: ArtifactFile;
  probe: Probe;
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ ok: boolean; attempts: number; problems: string[] }>;
export declare const README_READBACK_SCRIPT: string;
export declare const README_READBACK_EXIT: number;
export declare function readbackEnv(env: Record<string, string | undefined>): Record<string, string | undefined>;
export declare function readbackRereadCommands(
  version: string,
  tarballFilename: string,
): { size: string; view: string; rerun: string };
export declare function extractReadbackInputs(tarball: string, into: string): Promise<void>;
export declare const READBACK_PASSED: string;
export declare const READBACK_NOT_CONFIRMED: string;
export declare const READBACK_FAILED: string;
export declare const VERDICT_LINE: RegExp;
export declare const REGISTRY_WINDOW: RegExp;
export interface Readback {
  state: string;
  code: number | string | null;
  output: string;
  verdict: string;
  tooling: boolean;
}
export declare function runReadmeReadback(args: {
  run?: Run;
  final: ArtifactFile;
  env: Record<string, string | undefined>;
  tempRoot?: string;
}): Promise<Readback>;
export declare function commitReadArgs(sha: string): string[];
export declare function treeReadArgs(sha: string): string[];
export declare function resolveSkillsTree(
  commit: string,
  options?: { run?: Run },
): Promise<{ sha: string } | { error: string }>;
export declare const POST_LATEST_RUNBOOK_ITEM: string;
export declare function postLatestChecklist(args: {
  version: string;
  releaseRunId: string;
  recordPath: string;
  tagObject: string | null;
  commit: string;
  skillsTree: { sha: string } | { error: string };
  readback: { state: string; verdict: string };
}): string[];
export declare function checkRollbackState(args: {
  record: PromotionRecord;
  readTags: (name: string) => Promise<Record<string, string>>;
}): Promise<{ ok: boolean; problems: string[] }>;
export declare const defaultRun: Run;
export declare function distTagAddArgs(name: string, target: string, tag: string, options?: { otp?: string }): string[];
export declare function readDistTags(name: string, options?: { run?: Run }): Promise<Record<string, string>>;
export declare function planPromotion(args: {
  version: string;
  launcherVersion?: string;
  releaseRunId?: string;
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
  publishLauncher?: () => Promise<string>;
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
    readbackTempRoot?: string;
  },
): Promise<number>;
