// Types for scripts/release-gate-probe.mjs (LCLI-738, re-based by LCLI-751), so test/ can import it under strict tsc.

export type Expectation = "present" | "absent";

/** The fields of child_process.spawnSync's result this script reads. */
export interface SpawnResult {
  status: number | null;
  signal?: string | null;
  stdout?: string | Buffer | null;
  stderr?: string | Buffer | null;
  error?: Error;
}

/** The child_process.spawnSync seam, injectable so every arm is testable everywhere. */
export type SpawnLike = (binary: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined> }) => SpawnResult;

export interface ProbeArgs {
  binary: string;
  expect: Expectation;
  freshBinary: string | null;
}

export interface ProbeOptions {
  binary: string;
  expect: Expectation;
  /** The binary that writes the bridge; defaults to `binary`. Required in practice for `absent`. */
  freshBinary?: string | null;
  spawn?: SpawnLike;
  makeDir?: () => string;
  removeDir?: (dir: string) => void;
}

export interface ProbeResult {
  ok: boolean;
  kind: "ran" | "spawn-error" | "no-status" | "fixture-error";
  exitCode: number | null;
  /** The signal that ended the process, when `kind` is "no-status". */
  signal?: string | null;
  signature: boolean;
  output: string;
  detail?: string;
}

export const ABSENT_SIGNATURE: string;

export const STALE_CONTROL_GUIDANCE: string;

export function parseArgs(argv: string[]): ProbeArgs;

export function runProbe(options: ProbeOptions): ProbeResult;

export function main(
  argv: string[],
  io?: {
    out?: (line: string) => void;
    err?: (line: string) => void;
    spawn?: SpawnLike;
    makeDir?: () => string;
    removeDir?: (dir: string) => void;
  },
): number;
