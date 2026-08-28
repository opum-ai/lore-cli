/**
 * adapters/tracker-environment.ts — what `lore init` can learn about each tracker backend BEFORE it
 * asks the operator to choose one (LCLI-358.3).
 *
 * The wizard used to ask which tracker to use while knowing nothing about the environment, then
 * never check the answer was usable: a repository could be pinned to Quest with no `quest` binary
 * installed and no Quest workspace, and nothing said so until the first tracker command failed.
 * This module answers the two questions that make the choice informed — is the backend's CLI
 * installed, and is this repository already set up for it — for every backend at once, so the
 * question can be asked with that state in view.
 *
 * **Detection here is deliberately cheap and local.** `installed` is a PATH lookup and `initialized`
 * is a single marker file; neither spawns the backend. The authoritative readiness check is still
 * the adapter's own `probe()`, which `commands/init.ts` runs against the selected backend — this is
 * what lets the wizard render a summary for three backends without paying three subprocess spawns
 * for choices the operator will not make.
 *
 * Jira's `initialized` is deliberately `undefined` rather than `false`. Its readiness is
 * credential-profile state that `jira-cli` owns and that has no repository-local marker at all, so
 * reporting `false` would assert something this module cannot know. LCLI-358.4 adds the profile
 * check that can answer it.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TrackerBackend } from "../config";
import { LoreError, stderrHint } from "../errors";

/** What is known about one backend's CLI and this repository's setup for it. */
export interface TrackerEnvironmentEntry {
  readonly backend: Exclude<TrackerBackend, "none">;
  /** The executable name looked up on PATH. */
  readonly binary: string;
  /** The npm package that provides {@link binary}, used verbatim in install commands and hints. */
  readonly package: string;
  /** Whether {@link binary} is on PATH. */
  readonly installed: boolean;
  /**
   * Whether this repository is already set up for the backend. `undefined` means "not knowable from
   * the repository" — the jira case, whose readiness lives in jira-cli's own credential profiles.
   */
  readonly initialized: boolean | undefined;
}

/** One entry per backend `lore init` can offer, in the order the wizard presents them. */
export type TrackerEnvironment = readonly TrackerEnvironmentEntry[];

/** The backend → binary/package/marker table. The single place these three facts are written down. */
const BACKENDS = [
  { backend: "quest", binary: "quest", package: "@opum-ai/quest", marker: ".quest/workspace.toml" },
  // A bare `backlog/` directory is NOT a project (LCLI-358.5): `backlog init` writes `config.yml`
  // inside it, and any repository may happen to have a directory by that name.
  { backend: "backlog", binary: "backlog", package: "backlog.md", marker: "backlog/config.yml" },
  { backend: "jira", binary: "jira", package: "@salient-ai/jira-cli", marker: undefined },
] as const;

/** Look one backend's executable up on PATH, treating a broken PATH as "not installed". */
function onPath(binary: string): boolean {
  try {
    return Bun.which(binary) !== null;
  } catch {
    return false;
  }
}

/** Detect every backend's CLI and repository state for `root`. Never throws, never spawns a backend. */
export function detectTrackerEnvironment(root: string): TrackerEnvironment {
  return BACKENDS.map((entry) => ({
    backend: entry.backend,
    binary: entry.binary,
    package: entry.package,
    installed: onPath(entry.binary),
    initialized: entry.marker === undefined ? undefined : existsSync(join(root, entry.marker)),
  }));
}

/** The entry for one backend, or `undefined` for `none` (which has no CLI to detect). */
export function trackerEntry(
  environment: TrackerEnvironment,
  backend: TrackerBackend,
): TrackerEnvironmentEntry | undefined {
  return environment.find((entry) => entry.backend === backend);
}

/** The exact command an operator can run to install one backend's CLI themselves. */
export function installCommandFor(entry: TrackerEnvironmentEntry): string {
  return `npm install -g ${entry.package}`;
}

/**
 * Install one backend's package globally and report whether its binary is on PATH afterwards.
 *
 * Shells the same `npm install -g <package>` this module hands the operator in {@link
 * installCommandFor}, so what `lore init` does on their behalf is exactly what they would have run —
 * no private install path, nothing to reverse-engineer from a failure. A non-zero npm exit is a
 * classified {@link LoreError} carrying npm's own stderr rather than a bare "install failed".
 *
 * The re-detection is not ceremony: a `npm install -g` that succeeds can still leave the binary off
 * PATH (a prefix outside PATH, a shell that caches lookups), and reporting success on npm's exit
 * code alone would send the caller straight into a probe that fails for a reason it cannot explain.
 */
export async function installTrackerPackage(entry: TrackerEnvironmentEntry): Promise<boolean> {
  const command = installCommandFor(entry);
  let exitCode: number;
  let stderr: string;
  try {
    const child = Bun.spawn(["npm", "install", "-g", entry.package], { stdout: "pipe", stderr: "pipe" });
    [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  } catch (cause) {
    throw new LoreError(
      "not_found",
      `could not run \`${command}\`: npm is not installed or not on PATH`,
      `install ${entry.package} with your own package manager, then rerun \`lore init\``,
      { cause: cause instanceof Error ? cause.message : String(cause) },
    );
  }
  if (exitCode !== 0) {
    throw new LoreError(
      "validation",
      `\`${command}\` exited ${exitCode}: could not install ${entry.package}`,
      stderrHint(stderr) ?? `run \`${command}\` yourself to see npm's own diagnostic, then rerun \`lore init\``,
      { exitCode, package: entry.package },
    );
  }
  return onPath(entry.binary);
}
