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
import { compareCodeUnits } from "./order";
import { DOCS_DIR } from "./scaffold";

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
   * The bundle root the log is scoped to (default {@link DOCS_DIR}, `"docs"`). A commit's files
   * outside this root are ignored, so `log.md` reflects bundle history, not unrelated source churn.
   * Compared by path segment, so `"docs"` matches `docs/x.md` but never a sibling like `docsite/x.md`.
   * An empty string falls back to the default (an empty root would match nothing).
   */
  readonly root?: string;
  /** The document's top-level heading (default `"Change log"`). */
  readonly title?: string;
}

/** One commit as it renders in `log.md` — the commit's identity plus its subject collapsed once. */
interface LogEntry {
  readonly hash: string;
  readonly timestamp: string;
  readonly subject: string;
}

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
  const root = options.root || DOCS_DIR;
  const title = options.title ?? "Change log";

  // folder → the commits touching it. `foldersTouched` already returns a *set* of folders, so each
  // commit is appended at most once per folder — no dedup keyed by hash, which would otherwise
  // collapse two genuinely distinct commits that share an abbreviated hash. The subject is collapsed
  // once here (per commit), not once per folder it lands in.
  const byFolder = new Map<string, LogEntry[]>();
  for (const commit of commits) {
    const folders = foldersTouched(commit.files, root);
    if (folders.size === 0) {
      continue;
    }
    const entry: LogEntry = { hash: commit.hash, timestamp: commit.timestamp, subject: singleLine(commit.subject) };
    for (const folder of folders) {
      const bucket = byFolder.get(folder);
      if (bucket === undefined) {
        byFolder.set(folder, [entry]);
      } else {
        bucket.push(entry);
      }
    }
  }

  const sections = [...byFolder.entries()]
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .map(([folder, entries]) => {
      const lines = entries.sort(compareEntries).map((e) => `- ${e.timestamp} ${e.hash} ${e.subject}`);
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

/**
 * True when `file` sits **strictly under** the bundle root (`<root>/…`). A file whose path *equals*
 * the root is deliberately excluded: it is a file literally named `docs` (not a bundle document), and
 * `posix.dirname` would put it under the root's *parent* (`.`), emitting a section above the bundle.
 * A document directly under the root — `docs/index.md` — still matches and groups under `## docs`.
 */
function isUnderRoot(file: string, root: string): boolean {
  return file.startsWith(`${root}/`);
}

/** Collapse any newline run in a commit subject to a single space so one commit is always one line. */
function singleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/**
 * Order entries by ascending **instant**, tie-broken by `hash`. Timestamps are ISO-8601 *with
 * offset* (see {@link GitCommit.timestamp}), so two equal instants written in different offsets must
 * compare equal — a lexical string compare would order them by wall-clock text instead. Parse each to
 * epoch milliseconds and compare numerically; fall back to a code-unit compare only when a value is
 * unparseable (so the order stays total and deterministic even on malformed input).
 */
function compareEntries(a: LogEntry, b: LogEntry): number {
  const ta = Date.parse(a.timestamp);
  const tb = Date.parse(b.timestamp);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) {
    return ta < tb ? -1 : 1;
  }
  return compareCodeUnits(a.timestamp, b.timestamp) || compareCodeUnits(a.hash, b.hash);
}
