/**
 * Read-only tracker selection at the legacy-bundle boundary.
 *
 * `loadConfig` deliberately resolves an omitted tracker backend to its historical
 * Backlog default. New production callers instead use this module: it preserves
 * the distinction between an explicit selection and that compatibility default,
 * without adding a second configuration validator.
 */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_REL_PATH, loadConfig, type TrackerBackend } from "./config";
import { errnoCode, LoreError, readFileIfPresent } from "./errors";

/** Why {@link resolveTrackerSelection} chose its backend. */
export type TrackerSelectionSource = "explicit" | "legacy-backlog" | "default";

/** A resolved backend plus the durable fact from which it was selected. */
export interface TrackerSelection {
  readonly backend: TrackerBackend;
  readonly source: TrackerSelectionSource;
}

/** The directory Backlog.md owns at a repository root. */
export const LEGACY_BACKLOG_DIR = "backlog";

/**
 * The file `backlog init` writes, and the only durable evidence that `backlog/` is a Backlog.md
 * project rather than a directory that happens to share its name (LCLI-358.5).
 *
 * `adapters/tracker-environment.ts` already treats this exact path as the backend's marker; before
 * this constant existed the two disagreed, and the looser of them — a bare directory — decided both
 * the legacy tracker interpretation and whether `lore init` demanded a task migration.
 */
export const BACKLOG_PROJECT_MARKER = `${LEGACY_BACKLOG_DIR}/config.yml`;

/**
 * Resolve the tracker for `root` without mutating the repository or invoking a
 * tracker. Explicit `[tracker].backend` (including TOML's root dotted
 * `tracker.backend` spelling) always wins. When omitted, a real `backlog/`
 * directory preserves the legacy backend; a new/empty repository defaults to
 * Quest.
 *
 * "A real `backlog/` directory" means a real Backlog.md *project* — see {@link hasBacklogProject};
 * a directory that merely shares the name is not one.
 *
 * Configuration validation remains exclusively owned by {@link loadConfig}.
 * The subsequent raw TOML read answers only the provenance question that its
 * projected return type intentionally cannot express.
 */
export function resolveTrackerSelection(root: string): TrackerSelection {
  const config = loadConfig({ root });
  if (hasExplicitTrackerBackend(root)) {
    return { backend: config.tracker.backend, source: "explicit" };
  }
  if (hasBacklogProject(root)) {
    return { backend: "backlog", source: "legacy-backlog" };
  }
  return { backend: "quest", source: "default" };
}

/**
 * Whether the raw root TOML table explicitly owns `tracker.backend`. This uses
 * Bun's TOML parser solely for TOML's table/dotted-key semantics: a nested
 * future key such as `[future] tracker.backend = "backlog"` is not mistaken
 * for a root tracker setting. `loadConfig` has already validated this exact
 * file before this function parses it, so no validation policy is duplicated.
 */
function hasExplicitTrackerBackend(root: string): boolean {
  const raw = readFileIfPresent(join(root, CONFIG_REL_PATH), CONFIG_REL_PATH);
  if (raw === undefined) {
    return false;
  }
  let text = raw;
  while (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const parsed = Bun.TOML.parse(text) as Record<string, unknown>;
  const tracker = parsed.tracker;
  return isRecord(tracker) && Object.hasOwn(tracker, "backend");
}

/**
 * Whether `root` holds a real Backlog.md project: a real `backlog/` directory containing a real
 * {@link BACKLOG_PROJECT_MARKER} file.
 *
 * **A bare `backlog/` directory is not a project** (LCLI-358.5). It used to be, and that was wrong
 * in both directions: any repository with a directory by that name was interpreted as a legacy
 * Backlog bundle, and `lore init` demanded a task migration before it would select Quest — over a
 * directory that might hold no tasks at all. `backlog init` writes `config.yml`, and the `backlog`
 * CLI does not operate without it, so a directory lacking it is not a tracker this repository can
 * use.
 *
 * A symlink is deliberately not evidence, at either level: following one could let a sibling
 * repository decide this repository's tracker. Missing paths are normal; permission failures retain
 * Lore's standard denied diagnostic.
 */
export function hasBacklogProject(root: string): boolean {
  const dir = statOrAbsent(root, LEGACY_BACKLOG_DIR);
  if (dir === undefined || dir.isSymbolicLink() || !dir.isDirectory()) {
    return false;
  }
  const marker = statOrAbsent(root, BACKLOG_PROJECT_MARKER);
  if (marker === undefined) {
    return false;
  }
  // `lstat` never follows, so a symlink is already neither a file nor a directory here. The check
  // stays explicit anyway: it is the sentence that says a planted link must not count.
  return marker.isFile() && !marker.isSymbolicLink();
}

/** `lstat` one repository-relative path: `undefined` when absent, `denied` when unreadable. */
function statOrAbsent(root: string, rel: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(join(root, rel));
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return undefined;
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `cannot inspect ${rel}`, `check filesystem permissions on ${rel}`, {
        path: rel,
        code,
      });
    }
    throw cause;
  }
}

/** A non-null, non-array object suitable for inspecting a parsed TOML table. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
