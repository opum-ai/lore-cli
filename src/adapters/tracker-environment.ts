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
 * **This module detects; it never installs** (ADR-0024, DEC-57). The two facts above are the
 * operator's to establish with their own package manager and the tracker's own init command; what
 * lore hands them is {@link installCommandFor}'s text, which nothing in lore ever executes. The
 * install seam that used to live here (`installTrackerPackage`) was this repository's only
 * global-install site and is retired — see the ADR's "Consequences" for why the machine-mutating
 * behavior itself, not the Windows red it caused, was the thing to remove.
 *
 * Jira's `initialized` is deliberately `undefined` rather than `false`. Its readiness is
 * credential-profile state that `jira-cli` owns and that has no repository-local marker at all, so
 * reporting `false` would assert something this module cannot know. `adapters/jira-onboarding.ts`
 * answers it by asking jira-cli directly (LCLI-358.4) — but that costs a subprocess, so it runs
 * only for a jira selection the operator actually made, never for all three backends up front.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TrackerBackend } from "../config";
import { VERSION } from "../meta";

/** What is known about one backend's CLI and this repository's setup for it. */
export interface TrackerEnvironmentEntry {
  readonly backend: Exclude<TrackerBackend, "none">;
  /** The executable name looked up on PATH. */
  readonly binary: string;
  /** The npm package that provides {@link binary}, used verbatim in install commands and hints. */
  readonly package: string;
  /** The PATH lookup of {@link binary}. */
  readonly installed: boolean;
  /**
   * Whether this repository is already set up for the backend. `undefined` means "not knowable from
   * the repository" — the jira case, whose readiness lives in jira-cli's own credential profiles.
   */
  readonly initialized: boolean | undefined;
  /**
   * The repository-local file {@link initialized} is read from, or `undefined` when the backend has
   * none. Carried so a stop can NAME the missing marker (`.quest/workspace.toml`) rather than
   * describe it, the same way {@link binary} and {@link package} are carried for the remedy text.
   */
  readonly marker: string | undefined;
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
    marker: entry.marker,
  }));
}

/** The entry for one backend, or `undefined` for `none` (which has no CLI to detect). */
export function trackerEntry(
  environment: TrackerEnvironment,
  backend: TrackerBackend,
): TrackerEnvironmentEntry | undefined {
  return environment.find((entry) => entry.backend === backend);
}

/**
 * The exact command an operator can run, themselves, to install one backend's CLI. **Text only:
 * nothing in lore runs it** (ADR-0024).
 *
 * Quest's command is pinned to **lore's own exact version** (LCLI-650's pair lock, DEC-31): lore X
 * runs only against quest X, so handing a new user a bare `npm install -g @opum-ai/quest` — which
 * resolves to `latest` — can install a quest that the very next command refuses. The onboarding
 * message and the runtime remedy are then one sentence. Backlog keeps its own package name
 * unpinned, because only lore and quest share a version; Backlog's requirement is the `1.49.0`
 * FLOOR its adapter enforces, not an exact pair.
 */
export function installCommandFor(entry: TrackerEnvironmentEntry): string {
  return entry.backend === "quest" ? `npm install -g ${entry.package}@${VERSION}` : `npm install -g ${entry.package}`;
}

/*
 * There is deliberately no installer here any more (ADR-0024). `installTrackerPackage` — the
 * `npm install -g <package>` this module used to shell on the operator's behalf — was removed with
 * the whole install arm: `lore init` detects, offers, and instructs, and never installs. What
 * survives is the TEXT (`installCommandFor` above), which a stop hands the operator to run
 * themselves, exactly where `lore init` used to run it for them. If an install path is ever
 * re-added, it belongs behind ADR-0024's own principle rather than back in this module.
 */
