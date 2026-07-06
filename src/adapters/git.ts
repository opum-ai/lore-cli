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
import { LoreError } from "../errors";

/** A control-character line prefixing every commit's formatted header — never a legitimate subject or file path. */
const SENTINEL = "\x01lore:log-entry\x01";

/** `git log --pretty=format:` string: one sentinel line, then hash/committer-date/subject each on their own line. */
const PRETTY_FORMAT = `${SENTINEL}%n%H%n%cI%n%s`;

/** Build the real {@link GitAdapter}, shelling `git` in `cwd` (the repo root). */
export function realGitAdapter(cwd: string): GitAdapter {
  return {
    history(range: GitLogRange): readonly GitCommit[] {
      const args = ["log", "--name-only", `--pretty=format:${PRETTY_FORMAT}`, ...rangeArgs(range)];
      const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
      if (proc.exitCode !== 0) {
        throw new LoreError(
          "drift",
          `\`git log\` exited ${proc.exitCode}: could not build log.md`,
          singleLineStderr(proc.stderr) ?? "check that this is a git repository and the given range is valid",
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
 */
export function resolveHeadSha(cwd: string): string | null {
  const proc = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd, stdout: "pipe", stderr: "pipe" });
  return proc.exitCode === 0 ? proc.stdout.toString("utf8").trim() : null;
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

/** Collapse a failed invocation's stderr to a one-line hint (empty → undefined). */
function singleLineStderr(stderr: Buffer): string | undefined {
  const trimmed = stderr.toString("utf8").trim().replace(/\s+/g, " ");
  return trimmed === "" ? undefined : trimmed;
}
