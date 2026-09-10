/**
 * adapters/git-preflight.ts — the **synchronous** git seam `lore init` uses before it writes
 * anything (LCLI-358.1).
 *
 * This is a third, deliberately separate git seam, and the split is load-bearing rather than
 * accidental duplication:
 *
 * - `state.ts`'s {@link import("../state").GitSpawn} is **async** and *writes* (`git add`/`git
 *   commit` over `backlog/`).
 * - `adapters/git.ts` is **sync** and *reads history* (`git log` for `docs/log.md`).
 * - this module is **sync** and answers exactly two onboarding questions: is this a git worktree,
 *   and (only when a human says yes) make it one.
 *
 * Sync is the requirement, not a preference. `commands/init.ts`'s `runInit` returns
 * `number | Promise<number>` and its doc comment commits to the common path staying a plain number:
 * every pre-LORE-260 caller — this repository's own `runInit(...)` scaffolding calls in
 * `test/new.test.ts`, `test/graph.test.ts`, `test/validate.test.ts`, and
 * `test/schema-export.test.ts`, plus `lore-setup.sh` and CI — invokes it synchronously. The git
 * *detection* runs on every single invocation, so borrowing `state.ts`'s async spawn would have
 * turned that whole path into a Promise. `Bun.spawnSync` keeps it a number.
 *
 * {@link realGitPreflight} is the production implementation; `commands/init.ts` accepts any
 * {@link GitPreflight} so tests drive accept/decline/failure without a real repository.
 */

import { LoreError, stderrHint } from "../errors";

/**
 * git's own stable wording when the path simply has no repository — the ONE non-zero exit that is a
 * legitimate "no" rather than a failure to answer. Matched on stderr rather than on exit 128 alone,
 * which git also uses for a valid repository it refuses to operate on.
 */
const NO_REPOSITORY = /not a git repository/i;

/** A `git` binary that could not be started at all, reported as such rather than as "no repository". */
function missingGit(cause: unknown): LoreError {
  return new LoreError(
    "not_found",
    "could not run `git`: the binary is not installed or not on PATH",
    "install git and rerun `lore init`, or rerun with `--allow-no-git` for a docs-only bundle",
    { cause: cause instanceof Error ? cause.message : String(cause) },
  );
}

/** The two questions `lore init`'s preflight asks git, both synchronous. */
export interface GitPreflight {
  /**
   * Whether `root` is inside a git worktree. Uses `git rev-parse --is-inside-work-tree`, which
   * **walks up** to a parent repository, so a lore bundle nested below the repository root counts
   * as initialized — the same nested-bundle case `adapters/git.ts` already supports with
   * `--relative`.
   *
   * `false` means git answered and the answer was "no repository here". Every OTHER failure —
   * a missing `git` binary, or git refusing for a reason of its own — throws a typed
   * {@link LoreError} carrying git's stderr, rather than being flattened into `false`. That
   * distinction is load-bearing: `git rev-parse` exits 128 both for a genuinely absent repository
   * AND for a perfectly valid worktree it declines to operate on (`detected dubious ownership`,
   * a broken `GIT_DIR`, an unreadable object store). Collapsing those would tell an operator with
   * a real repository that their directory "is not a git worktree" and advise `git init` — which
   * either reinitializes their repository or creates a stray nested one.
   */
  isRepository(): boolean;
  /** Run `git init` in `root`. Throws a typed {@link LoreError} when git is absent or refuses. */
  initialize(): void;
}

/** One synchronous `git` invocation's outcome — the seam {@link realGitPreflight} classifies. */
export interface GitPreflightSpawnResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The synchronous `git` transport; `args` are the arguments after `git`. */
export type GitPreflightSpawn = (args: readonly string[]) => GitPreflightSpawnResult;

/** The real transport: `Bun.spawnSync` scoped to `cwd`, mirroring `adapters/git.ts`'s own sync shell. */
export function bunGitPreflightSpawn(cwd: string): GitPreflightSpawn {
  return (args) => {
    const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString("utf8"),
      stderr: result.stderr.toString("utf8"),
    };
  };
}

/**
 * The real, `git`-shelling {@link GitPreflight} rooted at `cwd`.
 *
 * `spawn` is injectable for one specific reason: the classification below turns on git's *stderr*,
 * and the failure that matters most — a valid worktree git refuses over ownership — cannot be
 * provoked from inside a test process. `Bun.spawnSync` snapshots the environment at startup
 * (verified: a `process.env` mutation is invisible to the child), so git's own
 * `GIT_TEST_ASSUME_DIFFERENT_OWNER` hook is unreachable without spawning a whole second runtime.
 * The real git behavior it stands in for was confirmed live on 2026-08-28: with that hook set,
 * `git rev-parse --is-inside-work-tree` exits 128 in a perfectly valid repository and prints
 * `fatal: detected dubious ownership in repository at '<path>'` — no "not a git repository" anywhere
 * in it.
 */
export function realGitPreflight(cwd: string, spawn: GitPreflightSpawn = bunGitPreflightSpawn(cwd)): GitPreflight {
  return {
    isRepository(): boolean {
      let exitCode: number;
      let stdout: string;
      let stderr: string;
      try {
        ({ exitCode, stdout, stderr } = spawn(["rev-parse", "--is-inside-work-tree"]));
      } catch (cause) {
        throw missingGit(cause);
      }
      if (exitCode === 0) {
        // git prints "true" for a worktree and "false" inside a bare repository's .git directory.
        // Only the first is somewhere lore can scaffold a bundle.
        return stdout.trim() === "true";
      }
      if (NO_REPOSITORY.test(stderr)) {
        // The one non-zero exit that genuinely means "there is no repository here" — the answer the
        // caller offers to fix by running `git init`.
        return false;
      }
      throw new LoreError(
        "validation",
        `\`git rev-parse --is-inside-work-tree\` exited ${exitCode}: git could not report whether ${cwd} is a repository`,
        stderrHint(stderr) ??
          "resolve the condition git reports, then rerun `lore init`; this is not evidence that the directory lacks a repository",
        { exitCode },
      );
    },
    initialize(): void {
      let exitCode: number;
      let stderr: string;
      try {
        ({ exitCode, stderr } = spawn(["init"]));
      } catch (cause) {
        throw missingGit(cause);
      }
      if (exitCode !== 0) {
        throw new LoreError(
          "validation",
          `\`git init\` exited ${exitCode}: could not create a repository at ${cwd}`,
          stderrHint(stderr) ?? "check filesystem permissions on the directory, or rerun with `--allow-no-git`",
          { exitCode },
        );
      }
    },
  };
}
