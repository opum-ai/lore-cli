/**
 * adapters/git.ts — the real, `git log`-shelling {@link GitAdapter} (`core/log.ts`, LORE-26).
 *
 * `core/log.ts`'s `GitAdapter.history()` is **synchronous** (LORE-47's already-shipped contract:
 * `buildLog`/`generateLog` are pure, sync functions), so this real implementation shells `git`
 * via `Bun.spawnSync` — not the async `Bun.spawn` seam `state.ts`/`adapters/backlog.ts` use for
 * their own, independently-async, concerns. This is a *different* git concern from `state.ts`
 * (which commits `backlog/`): this module only ever *reads* history to build `docs/`'s `log.md`,
 * and never writes.
 *
 * Parsing strategy: git's `--name-only` output separates a commit's file list from the next
 * commit's header with a blank line, which is a reliable, well-documented convention — but rather
 * than lean on that alone, each commit's formatted header is prefixed with a control-character
 * sentinel line ({@link SENTINEL}) that can never collide with a real subject or file path, so
 * splitting the whole output into per-commit blocks never depends on counting blank lines.
 */

import type { GitAdapter, GitCommit, GitLogRange } from "../core/log";
import { LoreError, stderrHint } from "../errors";

/** A control-character line prefixing every commit's formatted header — never a legitimate subject or file path. */
const SENTINEL = "\x01lore:log-entry\x01";

/** `git log --pretty=format:` string: one sentinel line, then hash/committer-date/subject each on their own line. */
const PRETTY_FORMAT = `${SENTINEL}%n%H%n%cI%n%s`;

/** Build the real {@link GitAdapter}, shelling `git` in `cwd` (the repo root). */
export function realGitAdapter(cwd: string): GitAdapter {
  return {
    history(range: GitLogRange): readonly GitCommit[] {
      // `--relative` (a no-op when `cwd` is the git repository's own top level) makes `--name-only`
      // report paths relative to `cwd` instead of git's default of always relative to the repo's
      // top level: without it, a bundle nested below the repo root (docs/backlog not at the git
      // top level) would get every file path prefixed with that nesting, which core/log.ts's
      // `isUnderRoot` (matched against the bundle-relative `docs` root) would never recognize as
      // under the bundle -- silently producing an empty log.md forever.
      const args = ["log", "--name-only", "--relative", `--pretty=format:${PRETTY_FORMAT}`, ...rangeArgs(range)];
      const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
      if (proc.exitCode !== 0) {
        throw new LoreError(
          "drift",
          `\`git log\` exited ${proc.exitCode}: could not build log.md`,
          stderrHint(proc.stderr.toString("utf8")) ??
            "check that this is a git repository and the given range is valid",
          { exitCode: proc.exitCode, range },
        );
      }
      return parseHistory(proc.stdout.toString("utf8"));
    },
  };
}

/**
 * Resolve `HEAD` to a concrete sha in `cwd`, or `null` when there is no `HEAD` yet (a freshly
 * `lore init`ed repository with no commits at all). Callers treat `null` as "no history" and skip
 * `history()` entirely, rather than pinning to a sha that does not exist.
 *
 * `git rev-parse HEAD` exits non-zero both for this legitimate "empty repo" case AND for a
 * genuinely broken one (not a git repository at all, a corrupted `.git`, …) — the two are NOT the
 * same condition and must not collapse to the same `null` result: only the first should silently
 * skip history (there is none to skip to), while the second must fail loud, matching
 * {@link realGitAdapter}'s own `history()` behavior for the identical condition. Disambiguated with
 * a second, cheap check — `git rev-parse --git-dir` succeeds in ANY valid repository regardless of
 * commit count, so it succeeding while `HEAD` still fails to resolve is the fingerprint of "a real,
 * merely empty repository"; failing itself means "not a git repository" (or worse), which propagates.
 *
 * @throws LoreError `drift` (exit 6) when `HEAD` fails to resolve for any reason OTHER than the
 *   repository being real but commit-less.
 */
export function resolveHeadSha(cwd: string): string | null {
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd, stdout: "pipe", stderr: "pipe" });
  if (head.exitCode === 0) {
    return head.stdout.toString("utf8").trim();
  }
  const isRealRepo = Bun.spawnSync(["git", "rev-parse", "--git-dir"], { cwd, stdout: "pipe", stderr: "pipe" });
  if (isRealRepo.exitCode === 0) {
    return null; // a real repository with no commits yet
  }
  throw new LoreError(
    "drift",
    `\`git rev-parse HEAD\` exited ${head.exitCode}: could not resolve the repository's history`,
    stderrHint(head.stderr.toString("utf8")) ?? "check that this is a git repository",
    { exitCode: head.exitCode },
  );
}

/** `git log`'s range arguments: `from..to` when `from` is given, else just `to` (from repo start). */
function rangeArgs(range: GitLogRange): string[] {
  return [range.from !== undefined ? `${range.from}..${range.to}` : range.to];
}

/**
 * Split `git log`'s stdout into one {@link GitCommit} per {@link SENTINEL}-prefixed block: the
 * block's first three lines are the hash, ISO committer date, and subject (in that order — the
 * exact {@link PRETTY_FORMAT} layout); every remaining non-empty line is a touched file path (the
 * blank separator line `--name-only` puts before the file list is dropped by the empty-line filter).
 */
function parseHistory(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const block of output.split(`${SENTINEL}\n`)) {
    if (block.trim() === "") {
      continue; // the split's leading part, before the first sentinel, is always empty
    }
    const lines = block.split("\n");
    const hash = lines[0];
    const timestamp = lines[1];
    const subject = lines[2];
    if (hash === undefined || timestamp === undefined || subject === undefined) {
      continue; // defensive: a well-formed block always has all three header lines
    }
    const files = lines.slice(3).filter((line) => line !== "");
    commits.push({ hash, timestamp, subject, files });
  }
  return commits;
}
