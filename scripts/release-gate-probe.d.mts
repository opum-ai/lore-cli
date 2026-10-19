// Types for scripts/release-gate-probe.mjs (LCLI-738), so test/ can import it under strict tsc.

export type Expectation = "present" | "absent";

export interface ProbeOptions {
  binary: string;
  expect: Expectation;
  cwd: string;
}

export interface ProbeResult {
  ok: boolean;
  kind: "ran" | "spawn-error";
  exitCode: number | null;
  signature: boolean;
  output: string;
  detail?: string;
}

export const STALE_CONTROL_GUIDANCE: string;

export function parseArgs(argv: string[]): ProbeOptions;

export function runProbe(options: ProbeOptions): ProbeResult;

export function main(argv: string[], io?: { out?: (line: string) => void; err?: (line: string) => void }): number;
