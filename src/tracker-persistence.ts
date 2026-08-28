/**
 * tracker-persistence.ts — the backend-owned repository persistence seam (LCLI-333.1).
 *
 * `state.ts` owns HOW lore commits Backlog storage (`commitBacklogFiles` per-write,
 * `commitBacklogIfDirty` sweep; ADR-0012). This module owns WHETHER repository persistence
 * happens at all for a command run, keyed off the single selected tracker backend:
 *
 * - `tracker=backlog`: delegate unchanged to the state.ts primitives — byte-for-byte compatible
 *   behavior (same messages, `:(literal)` pathspecs, {@link BacklogCommitResult} shapes, renderer
 *   lines).
 * - any other backend (quest today): Quest owns its own storage; lore performs ZERO `git`
 *   invocations and never touches `backlog/`. A non-null repo file reported by such a backend is
 *   `drift` (never silently dropped); a path outside the backend's commit domain is likewise
 *   refused.
 *
 * Selection is single-valued: commands call {@link resolveSelectedBackend} exactly once per run;
 * there is no fallback, no dual write, no ambiguous backend (LCLI-333.1 AC#5).
 */

import type { TrackerBackend } from "./config";
import { LoreError } from "./errors";
import {
  type BacklogCommitResult,
  bunGitSpawn,
  commitBacklogFiles,
  commitBacklogIfDirty,
  type GitSpawn,
} from "./state";
import { resolveTrackerSelection } from "./tracker-selection";

/** One tracker-side edit a command made, with the backend-reported repo file (`null` when the backend has none). */
export interface TrackerWriteRef {
  /** The task id whose record was edited (diagnostic only). */
  readonly taskId: string;
  /**
   * The repo-relative task file the backend reported, or `null` when the backend keeps its records
   * outside this repository (e.g. quest) or reported no usable path.
   */
  readonly file: string | null;
}

/** The shared nothing-committed result, used verbatim by reports so envelopes stay byte-compatible. */
export const NO_COMMIT: BacklogCommitResult = { committed: false, files: [] };

/**
 * Resolve the run's tracker backend exactly once. An explicit test/CI override wins; otherwise
 * {@link resolveTrackerSelection} decides (explicit config > legacy `backlog/` presence > quest),
 * throwing on ambiguous legacy bundles exactly like `createConfiguredTrackerAdapter`.
 */
export function resolveSelectedBackend(root: string, explicit?: TrackerBackend): TrackerBackend {
  return explicit ?? resolveTrackerSelection(root).backend;
}

/**
 * Persist one command run's tracker-side effects, owned by the selected backend.
 *
 * `backlog`: delegates to {@link commitBacklogFiles} with the normalized non-null files — the
 * unchanged ADR-0012 per-write path. Any other backend must observe ONLY null files: a non-null
 * repo file under a backend whose storage is not this repository's git tree is a hard `drift`
 * refusal before anything is committed. Empty refs are a git-free no-op for every backend.
 *
 * A captured git-side failure rides in the result's `error`/`hint` fields exactly as
 * {@link commitBacklogFiles} does, so callers keep emitting their per-task report before exiting.
 */
export async function persistTrackerWrites(
  backend: TrackerBackend,
  refs: readonly TrackerWriteRef[],
  opts: { readonly root: string; readonly message: string; readonly gitSpawn?: GitSpawn },
): Promise<BacklogCommitResult> {
  if (backend === "backlog") {
    const files = refs.flatMap((ref) => (ref.file ? [ref.file] : []));
    return commitBacklogFiles(files, { root: opts.root, gitSpawn: opts.gitSpawn }, opts.message);
  }
  for (const ref of refs) {
    if (ref.file !== null) {
      throw new LoreError(
        "drift",
        `tracker "${backend}" reported repository file "${ref.file}" for task "${ref.taskId}" — non-backlog trackers do not own paths in this repository`,
        "this is a bug — a backend leaked a storage path through the adapter contract; report it",
        { backend, taskId: ref.taskId, file: ref.file },
      );
    }
  }
  // Quest (and any future out-of-repo backend) persists its own records; lore commits nothing.
  return NO_COMMIT;
}

/**
 * The catch-all post-run sweep policy: `backlog` runs {@link commitBacklogIfDirty}'s `backlog/`
 * sweep (sync's historical behavior, unchanged); every other backend is a no-op that never invokes
 * `git` at all — quest storage dirt is quest's own concern, not a lore-authored commit.
 */
export async function sweepTrackerStorage(
  backend: TrackerBackend,
  opts: { readonly root: string; readonly gitSpawn?: GitSpawn },
): Promise<BacklogCommitResult> {
  if (backend !== "backlog") {
    return NO_COMMIT;
  }
  return commitBacklogIfDirty(opts.gitSpawn ?? bunGitSpawn(opts.root));
}
