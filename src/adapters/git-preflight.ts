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

/** The two questions `lore init`'s preflight asks git, both synchronous. */
export interface GitPreflight {
  /**
   * Whether `root` is inside a git worktree. Uses `git rev-parse --is-inside-work-tree`, which
   * **walks up** to a parent repository, so a lore bundle nested below the repository root counts
   * as initialized — the same nested-bundle case `adapters/git.ts` already supports with
   * `--relative`. Never throws for the ordinary "not a repository" answer; that is `false`.
   */
  isRepository(): boolean;
  /** Run `git init` in `root`. Throws a typed {@link LoreError} when git is absent or refuses. */
  initialize(): void;
}

/** The real, `git`-shelling {@link GitPreflight} rooted at `cwd`. */
export function realGitPreflight(cwd: string): GitPreflight {
  return {
    isRepository(): boolean {
      try {
        const probe = Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        // git prints "true" for a worktree, "false" inside a bare repository's .git directory, and
        // exits 128 with "not a git repository" when there is none. Only the first is a worktree
        // lore can scaffold into.
        return probe.exitCode === 0 && probe.stdout.toString("utf8").trim() === "true";
      } catch {
        // A missing `git` binary is not an error *here*: the caller's next step is to offer to
        // create a repository, and `initialize()` reports the missing binary with an install-
        // shaped diagnostic. Answering "not a repository" keeps that single failure path.
        return false;
      }
    },
    initialize(): void {
      let exitCode: number;
      let stderr: string;
      try {
        const created = Bun.spawnSync(["git", "init"], { cwd, stdout: "pipe", stderr: "pipe" });
        exitCode = created.exitCode;
        stderr = created.stderr.toString("utf8");
      } catch (cause) {
        throw new LoreError(
          "not_found",
          "could not run `git init`: the `git` binary is not installed or not on PATH",
          "install git and rerun `lore init`, or rerun with `--allow-no-git` for a docs-only bundle",
          { cause: cause instanceof Error ? cause.message : String(cause) },
        );
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
