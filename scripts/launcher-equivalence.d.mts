// Types for scripts/launcher-equivalence.mjs (LCLI-621), so test/ can import it under strict tsc.

export interface TarEntry {
  path: string;
  type: string;
  mode: number;
  content: Buffer;
}

export interface Equivalence {
  ok: boolean;
  problems: string[];
  entries: number;
}

export function versionPairProblem(version: unknown, rcVersion: unknown): string | null;

export function substituteVersion(bytes: Uint8Array, rcVersion: string, version: string): Buffer;

export function readTarEntries(gzipped: Uint8Array): TarEntry[];

export function compareLauncherTarballs(
  rcTarball: Uint8Array,
  finalTarball: Uint8Array,
  versions: { version: string; rcVersion: string },
): Equivalence;

export function main(argv: string[], io?: { out?: (line: string) => void; err?: (line: string) => void }): number;
