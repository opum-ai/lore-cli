/**
 * log.ts — the bundle's `log.md` as a **git-history-derived**, byte-stable artifact (LORE-47).
 *
 * Where `index.md` is regenerated from the bundle graph, `log.md` is a per-folder change log
 * derived from the repository's own commit history: for each bundle folder, the commits that
 * touched a file under it. This module owns two things:
 *
 * - **The `GitAdapter` seam** — the *third* injectable deterministic seam, alongside the clock
 *   and the Backlog subprocess (lore-design §8; [ADR-0014](../../docs/adr/0014-core-has-no-llm-dependency.md)).
 *   git is *local, deterministic computation* — not a network model — so reading history over a
 *   **pinned commit range** is reproducible, offline-safe, and air-gap-safe. Core depends only on
 *   the interface; the real adapter that shells `git log` is impure command-layer wiring (the same
 *   boundary the real `() => new Date()` clock sits on), supplied where `lore sync` is built. Tests
 *   inject a fake adapter returning a fixed fake history, never real `git`.
 *
 * - **The pure `generateLog`** — given a set of {@link GitCommit}s, produce the exact `log.md`
 *   bytes. It is total and order-independent: folders are directory-sorted and the commits under
 *   each are sorted by `(timestamp, hash)`, so the same history always yields byte-identical output
 *   (idempotent) regardless of the order the adapter returned commits in (lore-design §8: directory
 *   walks are sorted; no nondeterminism in core).
 *
 * **Drift-gate exemption (ADR-0007).** Because a git-derived `log.md` changes on *every* commit, it
 * is materialized at **`lore sync`** time and **excluded** from `lore check`'s regenerate-and-compare
 * drift gate. Gating it would report permanent drift (the gate's own commit would invalidate it) and
 * break on shallow/read-only CI checkouts where full history is absent. `index.md` and the
 * `<!-- lore:tasks -->` managed blocks stay gated as before.
 *
 * Per the core contract (lore-design §2.1) this module is pure: no filesystem, no spawn, no clock.
 */

import { posix } from "node:path";

/**
 * One commit as the {@link GitAdapter} surfaces it — the minimal, deterministic projection
 * `generateLog` needs. All fields are stable for a given commit in a given repository.
 */
export interface GitCommit {
  /** The commit hash (full or a stable abbreviation). Emitted verbatim and used as the sort tiebreak. */
  readonly hash: string;
  /** The committer date as an ISO-8601 string with offset (never a `Date`, mirroring ADR-0006 §2). */
  readonly timestamp: string;
  /** The commit message's first line (subject). Treated as single-line; any stray newline is collapsed. */
  readonly subject: string;
  /** The repo-relative POSIX paths the commit touched (in any order; `generateLog` groups + sorts). */
  readonly files: readonly string[];
}

/**
 * A **pinned** commit range — the determinism boundary. `to` is the inclusive upper bound (a tag
 * or sha, e.g. `HEAD` resolved to a sha by the caller); `from`, when given, is the exclusive lower
 * bound. Pinning both ends is what makes a generated `log.md` reproducible: the same range over the
 * same repository yields the same commits.
 */
export interface GitLogRange {
  /** Exclusive lower bound (a tag/sha); absent → from the start of history. */
  readonly from?: string;
  /** Inclusive upper bound (a tag/sha) — pin this to a concrete sha for a reproducible log. */
  readonly to: string;
}

/**
 * The injectable git seam (lore-design §8, the third after clock + Backlog). The real
 * implementation shells `git log` and lives at the command layer (impure, like the real clock);
 * tests inject a fake returning a fixed fake history. Core knows only this interface.
 */
export interface GitAdapter {
  /** The commits touching the repository within `range`, in any order. */
  history(range: GitLogRange): readonly GitCommit[];
}

/** Options for {@link generateLog}. */
export interface GenerateLogOptions {
  /**
   * The bundle root the log is scoped to (default `"docs"`). A commit's files outside this root
   * are ignored, so `log.md` reflects bundle history, not unrelated source churn. Compared by path
   * segment, so `"docs"` matches `docs/x.md` but never a sibling like `docsite/x.md`.
   */
  readonly root?: string;
  /** The document's top-level heading (default `"Change log"`). */
  readonly title?: string;
}

/** The default bundle root `generateLog` scopes folders to. */
const DEFAULT_ROOT = "docs";

/**
 * Build a `log.md`'s bytes from a {@link GitAdapter} over a pinned range — the function `lore sync`
 * calls with the real adapter and tests call with a fake one, so the seam is exercised end-to-end.
 * The pure {@link generateLog} does the byte computation; this only resolves the history through
 * the seam.
 */
export function buildLog(adapter: GitAdapter, range: GitLogRange, options: GenerateLogOptions = {}): string {
  return generateLog(adapter.history(range), options);
}

/**
 * Render the byte-stable `log.md` for `commits`: group each commit under every bundle folder it
 * touched (the immediate parent directory of a touched file under the bundle root), emit folders in
 * directory-sorted order, and under each folder list its commits sorted by `(timestamp, hash)`.
 *
 * Pure, total, and order-independent — the same set of commits always produces byte-identical
 * output, so re-running `lore sync` with no new history is a byte-level no-op. A commit that touched
 * no file under the bundle root contributes nothing (it never appears). An empty history yields just
 * the heading, so the file is always well-formed.
 */
export function generateLog(commits: readonly GitCommit[], options: GenerateLogOptions = {}): string {
  const root = options.root ?? DEFAULT_ROOT;
  const title = options.title ?? "Change log";

  // folder → commits touching it. A Map keyed by commit hash dedups a commit that touched several
  // files in the same folder (it must appear once per folder, not once per file).
  const byFolder = new Map<string, Map<string, GitCommit>>();
  for (const commit of commits) {
    for (const folder of foldersTouched(commit.files, root)) {
      let bucket = byFolder.get(folder);
      if (bucket === undefined) {
        bucket = new Map<string, GitCommit>();
        byFolder.set(folder, bucket);
      }
      bucket.set(commit.hash, commit);
    }
  }

  const folders = [...byFolder.keys()].sort(compareStrings);
  const sections = folders.map((folder) => {
    const lines = [...(byFolder.get(folder) as Map<string, GitCommit>).values()]
      .sort(compareCommits)
      .map((commit) => `- ${commit.timestamp} ${commit.hash} ${singleLine(commit.subject)}`);
    return `## ${folder}\n\n${lines.join("\n")}\n`;
  });

  return [`# ${title}\n`, ...sections].join("\n");
}

/**
 * The distinct bundle folders a commit's `files` touch, scoped to `root`. A folder is the immediate
 * parent directory of a touched file (`docs/adr/0014.md` → `docs/adr`). A file directly under the
 * root (`docs/index.md` → `docs`) groups under the root itself. Files outside the root are dropped.
 */
function foldersTouched(files: readonly string[], root: string): Set<string> {
  const folders = new Set<string>();
  for (const file of files) {
    if (isUnderRoot(file, root)) {
      folders.add(posix.dirname(file));
    }
  }
  return folders;
}

/** True when `file` is the bundle root or sits under it, matched by path segment (not bare prefix). */
function isUnderRoot(file: string, root: string): boolean {
  return file === root || file.startsWith(`${root}/`);
}

/** Collapse any newline run in a commit subject to a single space so one commit is always one line. */
function singleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/** Stable, locale-independent string order (code-unit comparison) for folder sorting. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Order commits by ascending `timestamp`, tie-broken by `hash`, so the per-folder list is deterministic. */
function compareCommits(a: GitCommit, b: GitCommit): number {
  return compareStrings(a.timestamp, b.timestamp) || compareStrings(a.hash, b.hash);
}
