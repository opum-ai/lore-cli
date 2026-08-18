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
 * Resolve the tracker for `root` without mutating the repository or invoking a
 * tracker. Explicit `[tracker].backend` (including TOML's root dotted
 * `tracker.backend` spelling) always wins. When omitted, a real `backlog/`
 * directory preserves the legacy backend; a new/empty repository defaults to
 * Quest.
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
  if (hasLegacyBacklogArtifacts(root)) {
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
 * Backlog's repository-owned state is rooted in a real `backlog/` directory.
 * A symlink is deliberately not an artifact: following it could let a sibling
 * repository change this repository's selection. Missing roots are normal;
 * permission failures retain Lore's standard denied diagnostic.
 */
function hasLegacyBacklogArtifacts(root: string): boolean {
  const path = join(root, LEGACY_BACKLOG_DIR);
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return false;
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError(
        "denied",
        `cannot inspect ${LEGACY_BACKLOG_DIR}`,
        `check filesystem permissions on ${LEGACY_BACKLOG_DIR}`,
        {
          path: LEGACY_BACKLOG_DIR,
          code,
        },
      );
    }
    throw cause;
  }
}

/** A non-null, non-array object suitable for inspecting a parsed TOML table. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
