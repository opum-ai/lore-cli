// Types for scripts/github-release.mjs (LCLI-622), so test/ and promote-latest.mjs can import it
// under strict tsc. Mirrors quest-cli's scripts/github-release.d.mts at 06fa623a.

export declare const RELEASE_REPOSITORY: string;

export declare function REPAIR_COMMAND(version: string): string;

export declare function changelogSection(changelog: string, version: string): { heading: string; body: string } | null;

export declare function releaseTitle(version: string, heading?: string): string;

export type ExecFile = (file: string, args: readonly string[]) => Promise<{ stdout: string; stderr?: string }>;

export interface ReleaseOutcome {
  readonly ok: boolean;
  readonly action: "created" | "exists" | "marked-latest" | "would-create" | "would-mark-latest" | "none";
  readonly detail: string;
}

export declare function ensureGitHubRelease(options: {
  version: string;
  notes: string;
  title?: string;
  latest?: boolean;
  dryRun?: boolean;
  execFile?: ExecFile;
}): Promise<ReleaseOutcome>;

export declare function releaseNotesFor(
  version: string,
  options?: { changelogPath?: string },
): Promise<{ notes: string; title: string } | null>;

export declare function main(
  argv: string[],
  options?: {
    execFile?: ExecFile;
    changelogPath?: string;
    out?: (line: string) => void;
    err?: (line: string) => void;
  },
): Promise<number>;
