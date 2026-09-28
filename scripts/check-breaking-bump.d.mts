// Types for scripts/check-breaking-bump.mjs (LCLI-632, mirror of quest-cli QCLI-328),
// so test/ can import it under strict tsc.

export const BREAKING_HEADING: RegExp;
export const LEGACY_BREAKING_MARKER: RegExp;

export const QUEST: Readonly<{
  repository: string;
  ref: string;
}>;

export function bumpLevel(
  previous: string,
  next: string,
): "major" | "minor" | "patch" | null;

export interface BreakingBumpResult {
  readonly problems: readonly string[];
  readonly version: string;
  readonly previous: string | null;
  readonly level: "major" | "minor" | "patch" | null;
  readonly source: string | null;
  readonly breaking: boolean;
  readonly legacyMarker: boolean;
  readonly sectionsRead: number;
}

export function breakingBumpProblems(
  changelog: string,
  version: string,
  label?: string,
): BreakingBumpResult;

export type ExecFile = (
  file: string,
  args: string[],
  options?: Record<string, unknown>,
) => Promise<{ stdout: string; stderr?: string }>;

export interface QuestChangelogRead {
  readonly changelog: string | null;
  readonly source: string;
  readonly error?: string;
}

export function questChangelogArgs(ref?: string): string[];
export function readQuestChangelog(options?: {
  ref?: string;
  execFile?: ExecFile;
}): Promise<QuestChangelogRead>;

export interface CheckBreakingBumpResult {
  readonly version: string;
  readonly lore: BreakingBumpResult;
  readonly quest: BreakingBumpResult & { readonly readSource: string };
  readonly problems: readonly string[];
}

export function checkBreakingBump(options?: {
  directory?: string;
  next?: string;
  questRef?: string;
  questChangelog?: string;
  readQuest?: () => Promise<QuestChangelogRead>;
}): Promise<CheckBreakingBumpResult>;
