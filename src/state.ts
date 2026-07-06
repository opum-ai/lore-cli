/**
 * state.ts — `.lore/` and git ownership of `backlog/` (design spec §2.4, LORE-26).
 *
 * lore is the **sole committer** of `backlog/` (ADR-0012): Backlog.md itself never runs `git
 * add`/`git commit` (`auto_commit: false`), so whichever `lore` command wrote to a task through the
 * Backlog CLI (`task create`/`task edit`) leaves that write sitting uncommitted in the working tree.
 * `lore sync` is the point that closes the loop — its own writes are entirely to `docs/`, so
 * {@link commitBacklogIfDirty} instead scans `backlog/` for whatever is currently uncommitted
 * (from `link`/`unlink`/`rename`, or a human's direct `backlog task edit`) and commits exactly those
 * paths in one `lore`-authored commit, leaving anything outside `backlog/` untouched.
 *
 * This is the **fourth** injectable determinism seam (after the clock, the Backlog subprocess, and
 * the git-history `GitAdapter` in `core/log.ts`; lore-design §8): {@link GitSpawn} mirrors
 * `adapters/backlog.ts`'s `BacklogSpawn` pattern exactly — the real implementation shells `git`, and
 * tests inject a fake that returns canned output instead of driving a real subprocess.
 *
 * **Scope (LORE-26).** The design spec's §2.4 envisions `state.ts` more broadly — also reading
 * `.lore/config.toml`/`cache/`/`schemas/`/`templates/`. This file ships only the git-ownership half:
 * `commands/sync.ts` calls `config.ts`'s `loadConfig` directly rather than through this module, since
 * config-loading has nothing to do with git. Widening this file's scope, if ever warranted, is a
 * separate concern from the git-write seam it owns today.
 *
 * Per lore-design §2.1 this module is impure command-layer wiring (like `config.ts`), not `core/`:
 * it exists specifically to shell `git`.
 */

import { LoreError } from "./errors";

/** The result of one `git` invocation, mirroring `adapters/backlog.ts`'s `SpawnResult` shape. */
export interface GitSpawnResult {
  /** The process exit code (`0` on success). */
  readonly exitCode: number;
  /** Everything the process wrote to stdout. */
  readonly stdout: string;
  /** Everything the process wrote to stderr (human diagnostics; never parsed as data). */
  readonly stderr: string;
}

/**
 * The injectable git-write seam. `args` are the arguments after `git` (e.g.
 * `["status", "--porcelain", "--", "backlog/"]`); the binary and `cwd` are bound inside the real
 * implementation. Mirrors `adapters/backlog.ts`'s `BacklogSpawn` exactly, including its "rejects
 * only on a failed spawn, resolves with a non-zero `exitCode` on a failed run" contract.
 */
export type GitSpawn = (args: readonly string[]) => Promise<GitSpawnResult>;

/** The real {@link GitSpawn}: shells `git` via `Bun.spawn`, scoped to `cwd`. */
export function bunGitSpawn(cwd: string): GitSpawn {
  return async (args: readonly string[]): Promise<GitSpawnResult> => {
    const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe", cwd });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  };
}

/** The outcome of {@link commitBacklogIfDirty}. */
export interface BacklogCommitResult {
  /** Whether a commit was made (`false` when `backlog/` had no uncommitted changes). */
  readonly committed: boolean;
  /** The repo-relative paths committed, empty when {@link committed} is `false`. */
  readonly files: readonly string[];
}

/** Where Backlog.md's own working state lives, relative to the repo root — the one directory lore commits on its behalf. */
const BACKLOG_DIR = "backlog/";

/**
 * If `backlog/` has any uncommitted changes (tracked modifications, or new/untracked files),
 * stage exactly those paths and commit them in one `lore`-authored commit; otherwise a no-op.
 *
 * This is the concrete mechanism behind ADR-0012's "lore is the sole committer of `backlog/`": the
 * write itself (a Backlog CLI `task create`/`edit`) already happened elsewhere (`link`, `unlink`,
 * `rename`, or a human editing directly); this function only ever discovers and commits whatever is
 * sitting dirty under `backlog/` at the moment it runs. Nothing outside `backlog/` is staged, so an
 * in-flight, not-yet-committed change elsewhere in the tree (e.g. `sync`'s own `docs/` writes) is
 * never swept in.
 *
 * @throws LoreError `drift` (exit 6) when `git status`, `git add`, or `git commit` fails — surfaced
 *   clearly rather than left silent (ADR-0012's own documented tradeoff: a `lore` write can succeed
 *   while its commit fails, e.g. a pre-commit hook rejection).
 */
export async function commitBacklogIfDirty(
  spawn: GitSpawn,
  message: string = DEFAULT_COMMIT_MESSAGE,
): Promise<BacklogCommitResult> {
  const files = await porcelainPaths(spawn, BACKLOG_DIR);
  if (files.length === 0) {
    return { committed: false, files: [] };
  }
  await run(spawn, ["add", "--", ...files], "git add");
  await run(spawn, ["commit", "-m", message], "git commit");
  return { committed: true, files };
}

/** The default commit message when the caller does not supply one. */
const DEFAULT_COMMIT_MESSAGE = "chore(backlog): sync task changes";

/**
 * The repo-relative paths `git status --porcelain` reports as changed under `pathspec` (staged,
 * unstaged, or untracked — every porcelain status code). Each line is `XY PATH` (or `XY ORIG -> PATH`
 * for a rename, where only the new `PATH` is committed going forward); the two-character status
 * prefix and any `->` rename arrow are stripped, keeping just the current path, C-unquoted
 * ({@link unquoteGitPath}) so a path git wrapped in quotes (any path with a space — the common case
 * for Backlog task filenames — or other special characters) is a valid pathspec, not a literal
 * quoted string.
 */
async function porcelainPaths(spawn: GitSpawn, pathspec: string): Promise<string[]> {
  // `--untracked-files=all` expands a brand-new untracked directory into its individual file paths
  // (plain `--porcelain` reports only the directory itself, e.g. `?? backlog/`) — scoped to `pathspec`
  // so, unlike a bare repo-wide `-uall`, this never walks more of the tree than lore is committing.
  const result = await run(spawn, ["status", "--porcelain", "--untracked-files=all", "--", pathspec], "git status");
  const paths: string[] = [];
  for (const line of result.stdout.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const rest = line.slice(3); // "XY " is always exactly 3 chars (porcelain v1 format)
    const arrow = rest.indexOf(" -> ");
    const raw = arrow === -1 ? rest : rest.slice(arrow + 4);
    paths.push(unquoteGitPath(raw));
  }
  return paths;
}

/**
 * Undo git's C-style quoting of one porcelain path. git wraps a path in `"..."` whenever it
 * contains a space or another character its space-delimited porcelain format would otherwise
 * misparse, escaping `\`/`"`/control characters with C escapes and any other special byte —
 * including, for a non-ASCII path, each byte of a multi-byte UTF-8 sequence individually — as a
 * three-digit octal `\NNN`. Reassembled as raw bytes and UTF-8-decoded once, so a non-ASCII path
 * round-trips correctly rather than being reassembled one (mis-decoded) byte at a time. An
 * unquoted path (no special characters) passes through unchanged.
 */
function unquoteGitPath(path: string): string {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) {
    return path;
  }
  const inner = path.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i] as string;
    if (c !== "\\") {
      bytes.push(c.charCodeAt(0));
      continue;
    }
    i++;
    const next = inner[i];
    if (next !== undefined && /[0-7]/.test(next)) {
      const octal = (next + (inner[i + 1] ?? "") + (inner[i + 2] ?? "")).slice(0, 3);
      bytes.push(Number.parseInt(octal, 8));
      i += 2;
      continue;
    }
    bytes.push(ESCAPE_BYTES[next ?? ""] ?? next?.charCodeAt(0) ?? 0);
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

/** Single-character C escapes git emits (beyond the `\NNN` octal form handled separately). */
const ESCAPE_BYTES: Readonly<Record<string, number>> = { n: 10, t: 9, r: 13, "\\": 92, '"': 34 };

/** Run one `git` invocation through {@link GitSpawn}, mapping a non-zero exit to a `drift` {@link LoreError}. */
async function run(spawn: GitSpawn, args: readonly string[], label: string): Promise<GitSpawnResult> {
  const result = await spawn(args);
  if (result.exitCode !== 0) {
    throw new LoreError(
      "drift",
      `\`${label}\` exited ${result.exitCode}: lore could not commit backlog/ changes`,
      singleLineStderr(result) ?? "check the repository's git state (a dirty index, a rejected pre-commit hook, …)",
      { exitCode: result.exitCode },
    );
  }
  return result;
}

/** Collapse a failed invocation's stderr to a one-line hint (empty → undefined). */
function singleLineStderr(result: GitSpawnResult): string | undefined {
  const trimmed = result.stderr.trim().replace(/\s+/g, " ");
  return trimmed === "" ? undefined : trimmed;
}
