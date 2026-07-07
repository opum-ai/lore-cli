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

import { LoreError, stderrHint } from "./errors";

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
  const { addPaths, allPaths } = await porcelainPaths(spawn, BACKLOG_DIR);
  if (allPaths.length === 0) {
    return { committed: false, files: [] };
  }
  // addPaths is never empty here: every entry porcelainPaths parses contributes at least one path to
  // BOTH addPaths and allPaths (a rename/copy's old path is the only thing added to allPaths alone),
  // so allPaths being non-empty (checked above) guarantees addPaths is too.
  await run(spawn, ["add", "--", ...addPaths], "git add");
  // Scoped with every touched path (including a staged rename/copy's old path, never passed to
  // `add` — see porcelainPaths): `git commit -- <paths>` commits ONLY those paths' content, leaving
  // any OTHER already-staged change (e.g. in-progress work a developer staged separately) untouched
  // in the index rather than swept into lore's commit — a bare, unscoped `git commit` would instead
  // commit the entire index.
  await run(spawn, ["commit", "-m", message, "--", ...allPaths], "git commit");
  return { committed: true, files: allPaths };
}

/** The default commit message when the caller does not supply one. */
const DEFAULT_COMMIT_MESSAGE = "chore(backlog): sync task changes";

/** {@link porcelainPaths}'s result: the paths to `git add`, and the full set to scope the commit to (and report). */
interface PorcelainPaths {
  /** Paths to `git add`. Excludes a staged rename/copy's OLD path — see the field below for why. */
  readonly addPaths: string[];
  /**
   * Every touched path, including a staged rename/copy's OLD path. `git commit -- <pathspec>` fills
   * in any path it does NOT see in the pathspec from `HEAD`'s tree rather than treating it as
   * absent, so a commit scoped to only the new path would resurrect the old file (its staged
   * deletion silently discarded, left stranded — staged and uncommitted — after the commit;
   * verified against real git). The old path is deliberately excluded from {@link addPaths}: a
   * `git mv`-staged rename has already fully removed the old path from the index (it is not a
   * pending change `add` can re-apply), so re-adding it fails outright with "did not match any
   * files" — it only ever needs to appear in the *commit's* pathspec, never `add`'s.
   */
  readonly allPaths: string[];
}

/**
 * The repo-relative paths `git status --porcelain -z` reports as changed under `pathspec` (staged,
 * unstaged, or untracked — every porcelain status code). Parses the NUL-delimited machine format
 * (`-z`), not the human `->`-separated text format: `-z` disables git's C-style quoting entirely
 * (every path is raw bytes, even one containing a space, a literal arrow, or non-ASCII characters —
 * no unescaping needed), and a rename/copy entry is two independent NUL-terminated fields
 * (`new-path\0old-path\0`, no `" -> "` text token at all) rather than one line joined by a literal
 * `" -> "` — which a text-format parser could otherwise mis-split when the path itself contains
 * that exact substring. An *unstaged* rename is reported by git as two ordinary independent entries
 * (a deletion, an untracked add) rather than one `R` entry at all — both come through as ordinary
 * single-field entries either way, so this needs no special casing (and both belong in `addPaths`
 * too, since neither is already-staged).
 */
async function porcelainPaths(spawn: GitSpawn, pathspec: string): Promise<PorcelainPaths> {
  // `--untracked-files=all` expands a brand-new untracked directory into its individual file paths
  // (plain `--porcelain` reports only the directory itself, e.g. `?? backlog/`) — scoped to `pathspec`
  // so, unlike a bare repo-wide `-uall`, this never walks more of the tree than lore is committing.
  const result = await run(
    spawn,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", pathspec],
    "git status",
  );
  const tokens = result.stdout.split("\0");
  const addPaths: string[] = [];
  const allPaths: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (entry === undefined || entry === "") {
      continue;
    }
    const status = entry.slice(0, 2);
    const path = entry.slice(3); // "XY " is always exactly 3 chars, even in -z mode
    addPaths.push(path);
    allPaths.push(path);
    if (status.includes("R") || status.includes("C")) {
      // The OLD path is the next NUL-terminated field — needed in the commit's pathspec (see
      // PorcelainPaths.allPaths) but NOT `add`'s (see PorcelainPaths.addPaths).
      const oldPath = tokens[++i];
      if (oldPath !== undefined && oldPath !== "") {
        allPaths.push(oldPath);
      }
    }
  }
  return { addPaths, allPaths };
}

/** Run one `git` invocation through {@link GitSpawn}, mapping a non-zero exit to a `drift` {@link LoreError}. */
async function run(spawn: GitSpawn, args: readonly string[], label: string): Promise<GitSpawnResult> {
  const result = await spawn(args);
  if (result.exitCode !== 0) {
    throw new LoreError(
      "drift",
      `\`${label}\` exited ${result.exitCode}: lore could not commit backlog/ changes`,
      stderrHint(result.stderr) ?? "check the repository's git state (a dirty index, a rejected pre-commit hook, …)",
      { exitCode: result.exitCode },
    );
  }
  return result;
}
