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
 * sentinel line ({@link SENTINEL}) that is *practically never* a real subject or file path, so
 * splitting the whole output into per-commit blocks never depends on counting blank lines. That
 * sentinel is a fixed string, not a proof: a commit subject, body, or touched file path CAN
 * legitimately (if vanishingly rarely) contain the exact same bytes, which would otherwise silently
 * misparse block boundaries — `history()` closes that gap with a `git rev-list --count` cross-check
 * (see `countCommits`) rather than trusting the sentinel split unconditionally.
 */

import type { GitAdapter, GitCommit, GitLogRange } from "../core/log";
import { DOCS_DIR } from "../core/scaffold";
import { LoreError, stderrHint } from "../errors";

/**
 * A control-character line prefixing every commit's formatted header — practically never a
 * legitimate subject or file path, but NOT provably impossible (see this module's own doc comment
 * and {@link parseHistory}); `history()`'s `git rev-list --count` cross-check is what actually
 * guards against a collision instead of silently trusting this string is unique.
 */
const SENTINEL = "\x01lore:log-entry\x01";

/** `git log --pretty=format:` string: one sentinel line, then hash/committer-date/subject each on their own line. */
const PRETTY_FORMAT = `${SENTINEL}%n%H%n%cI%n%s`;

/** Build the real {@link GitAdapter}, shelling `git` in `cwd` (the repo root). */
export function realGitAdapter(cwd: string): GitAdapter {
  return {
    history(range: GitLogRange, root: string = DOCS_DIR): readonly GitCommit[] {
      // `--relative` (a no-op when `cwd` is the git repository's own top level) makes `--name-only`
      // report paths relative to `cwd` instead of git's default of always relative to the repo's
      // top level: without it, a bundle nested below the repo root (docs/backlog not at the git
      // top level) would get every file path prefixed with that nesting, which core/log.ts's
      // `isUnderRoot` (matched against the bundle-relative `docs` root) would never recognize as
      // under the bundle -- silently producing an empty log.md forever.
      //
      // The trailing `-- <root>` pathspec (LORE-143) is what actually scopes the walk: git prunes
      // any commit whose diff touches nothing under `root` *before* it ever reaches this process,
      // rather than this adapter buffering the entire repository's history for `core/log.ts` to
      // discard commit-by-commit. Interpreted relative to `cwd`, exactly like `--relative` above, so
      // the same nested-bundle case still scopes to `<cwd>/<root>`, not the repo top level's.
      // `-c core.quotePath=false` is a global option (must precede the `log` subcommand): without
      // it, git's default C-style quoting renders any non-ASCII byte in a `--name-only` path as
      // an escaped octal sequence inside a quoted string (e.g. `"caf\303\251.md"` for `café.md`)
      // instead of the raw UTF-8 bytes, which `parseHistory` has no unquoting logic for — every
      // non-ASCII path would round-trip mangled into the generated log.md.
      const args = [
        "-c",
        "core.quotePath=false",
        "log",
        "--name-only",
        "--relative",
        `--pretty=format:${PRETTY_FORMAT}`,
        ...rangeArgs(range),
        "--",
        root,
      ];
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
      const commits = parseHistory(proc.stdout.toString("utf8"));

      // Guard against SENTINEL-collision corruption (see parseHistory's own doc comment): a commit
      // subject, body, or touched file path that happens to literally contain the SENTINEL byte
      // sequence introduces a spurious split point, silently turning one real commit into multiple
      // malformed ones (or misattributing a file path as a hash/timestamp). That corruption always
      // changes how many blocks `parseHistory` ends up with, so cross-checking the parsed count
      // against `git rev-list --count` for the *identical* range and pathspec — independent ground
      // truth that never goes through SENTINEL-delimited parsing at all — reliably catches it and
      // fails loud instead of silently emitting a corrupted log.md.
      const expected = countCommits(cwd, range, root);
      if (commits.length !== expected) {
        throw new LoreError(
          "drift",
          `\`git log\` parsing produced ${commits.length} commit(s) but \`git rev-list --count\` reports ${expected} for the same range: a commit subject, body, or touched file path likely contains the literal control-character sequence lore uses to delimit each commit's block, corrupting the split`,
          "rename the offending file or amend the commit message so it no longer contains the byte sequence \\x01lore:log-entry\\x01, then retry",
          { range, root, parsedCount: commits.length, expectedCount: expected },
        );
      }
      return commits;
    },
  };
}

/**
 * Resolve `HEAD` to a concrete sha in `cwd`, or `null` when there is no `HEAD` yet (a freshly
 * `lore init`ed repository with no commits at all). Callers treat `null` as "no history" and skip
 * `history()` entirely, rather than pinning to a sha that does not exist.
 *
 * `git rev-parse HEAD` exits non-zero both for this legitimate "empty repo" case AND for a
 * genuinely broken one (not a git repository at all, a corrupted `.git`, a malformed `HEAD` file,
 * …) — the two are NOT the same condition and must not collapse to the same `null` result: only the
 * first should silently skip history (there is none to skip to), while the second must fail loud,
 * matching {@link realGitAdapter}'s own `history()` behavior for the identical condition.
 *
 * Disambiguated with a second, cheap check: `git symbolic-ref -q HEAD`. A genuinely unborn branch's
 * `HEAD` is a well-formed symbolic ref (e.g. `ref: refs/heads/main`) whose TARGET simply doesn't
 * exist yet — `symbolic-ref` only validates and dereferences the ref's own on-disk FORMAT, it never
 * checks whether the target exists, so it still succeeds in that case. A corrupted-but-present
 * `.git` (e.g. `HEAD` containing an invalid ref name, or bytes that are not a well-formed symbolic
 * ref at all) fails this check instead, correctly falling through to the throw below — unlike
 * `git rev-parse --git-dir` (the previous disambiguator), which only proves ".git exists and is
 * minimally readable" and succeeds even when `HEAD` itself is malformed, silently misclassifying
 * that corruption as the benign unborn-branch case.
 *
 * @throws LoreError `drift` (exit 6) when `HEAD` fails to resolve for any reason OTHER than the
 *   repository being real but commit-less.
 */
export function resolveHeadSha(cwd: string): string | null {
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd, stdout: "pipe", stderr: "pipe" });
  if (head.exitCode === 0) {
    return head.stdout.toString("utf8").trim();
  }
  const symbolicRef = Bun.spawnSync(["git", "symbolic-ref", "-q", "HEAD"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (symbolicRef.exitCode === 0) {
    return null; // a real repository whose HEAD is a well-formed symbolic ref with no commits yet
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
 * The ground-truth number of commits touching `root` within `range`, via `git rev-list --count`
 * scoped with the identical range and `-- <root>` pathspec `history()` used for `git log` — used
 * only to cross-check {@link parseHistory}'s output against a code path that never depends on
 * SENTINEL-delimited parsing, so a corrupted split (see {@link parseHistory}) is never silently
 * trusted. Failing here reuses `history()`'s own "could not build log.md" `drift` error, since it
 * is the identical class of failure (git itself rejecting the range/repository).
 */
function countCommits(cwd: string, range: GitLogRange, root: string): number {
  const proc = Bun.spawnSync(["git", "rev-list", "--count", ...rangeArgs(range), "--", root], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new LoreError(
      "drift",
      `\`git rev-list --count\` exited ${proc.exitCode}: could not build log.md`,
      stderrHint(proc.stderr.toString("utf8")) ?? "check that this is a git repository and the given range is valid",
      { exitCode: proc.exitCode, range },
    );
  }
  return Number.parseInt(proc.stdout.toString("utf8").trim(), 10);
}

/**
 * Split `git log`'s stdout into one {@link GitCommit} per {@link SENTINEL}-prefixed block: the
 * block's first three lines are the hash, ISO committer date, and subject (in that order — the
 * exact {@link PRETTY_FORMAT} layout); every remaining non-empty line is a touched file path (the
 * blank separator line `--name-only` puts before the file list is dropped by the empty-line filter).
 *
 * This split is NOT provably collision-proof on its own: if a commit's subject, body, or a touched
 * file path literally contains the {@link SENTINEL} byte sequence, `String.prototype.split` treats
 * that occurrence as a block boundary too, silently splitting one real commit into multiple
 * malformed ones (e.g. a file path ending up parsed as a `hash`). This function does not — and
 * cannot, from the split output alone — detect that; `history()` is the one that guards against it,
 * by cross-checking `commits.length` against an independent `git rev-list --count` of the same
 * range, which never depends on SENTINEL-delimited parsing at all.
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
