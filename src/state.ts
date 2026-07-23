/**
 * state.ts — `.lore/` and git ownership of `backlog/` (design spec §2.4, LORE-26).
 *
 * lore is the **sole committer** of `backlog/` (ADR-0012): Backlog.md itself never runs `git
 * add`/`git commit` (`auto_commit: false`), so whichever `lore` command wrote to a task through the
 * Backlog CLI (`task create`/`task edit`) has to be committed by `lore` itself. Two shapes:
 * {@link commitBacklogFiles} is the **per-write** commit — `link`/`unlink`/`rename` commit exactly the
 * task file(s) they just edited, immediately, staging **only** those paths (ADR-0012 §1: never sweep an
 * unrelated in-flight edit into the commit). {@link commitBacklogIfDirty} is the **catch-all** sweep —
 * `lore sync` (whose own writes are entirely to `docs/`) commits whatever is *still* uncommitted under
 * `backlog/` (a human's direct `backlog task edit`, or anything a prior command missed), leaving
 * anything outside `backlog/` untouched. Both are one `lore`-authored commit.
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

import { posix } from "node:path";
import { escapesRoot } from "./core/rewrite";
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

/** The outcome of {@link commitBacklogIfDirty} / {@link commitBacklogFiles}. */
export interface BacklogCommitResult {
  /** Whether a commit was made (`false` when there was nothing to commit, or a per-write commit failed). */
  readonly committed: boolean;
  /** The repo-relative paths committed, empty when {@link committed} is `false`. */
  readonly files: readonly string[];
  /**
   * Set only by {@link commitBacklogFiles} when a per-write commit was *attempted but failed* (a
   * `drift` git error, e.g. a rejected pre-commit hook): the failure message, captured rather than
   * thrown so the calling command can still emit its per-task report (naming every write it made)
   * before it exits `drift`. Never set on a success or a nothing-to-commit no-op, and never set by
   * {@link commitBacklogIfDirty} (`sync`'s catch-all sweep still throws on a git failure).
   */
  readonly error?: string;
  /**
   * Set alongside {@link error} when the underlying `drift` {@link LoreError} carried a `hint` — the
   * actual git/hook stderr reason `run()` captured via {@link stderrHint} (e.g. a rejected pre-commit
   * hook's real output), or its generic fallback when the failing invocation produced no stderr.
   * {@link renderBacklogCommitLine} folds this into its one output line so a caller sees the real
   * cause rather than only a bare "`git commit` exited N". Never set without {@link error}.
   */
  readonly hint?: string;
}

/** Where Backlog.md's own working state lives, relative to the repo root — the one directory lore commits on its behalf. */
const BACKLOG_DIR = "backlog/";

/**
 * Wrap a path in git's `:(literal)` pathspec magic so git matches it byte-for-byte: a filename
 * containing a wildcard (`*`, `?`, `[`…) then matches ONLY itself, never a glob-expanded unrelated
 * sibling. Without this the "scoped" commit could sweep in an unrelated `backlog/` file whose name
 * happens to satisfy the glob — defeating the very ADR-0012 §1 scoping guarantee. A plain directory
 * pathspec (`backlog/`) still recurses into everything under it: `:(literal)` disables only wildcard
 * interpretation, not directory-prefix matching (verified against real git).
 */
function literalPathspec(path: string): string {
  return `:(literal)${path}`;
}

/**
 * The single line a command prints for its `backlog/`-commit outcome: `committed backlog/: N files`
 * on success, `backlog/ commit failed: … (hint)` when {@link BacklogCommitResult.error} is set (the
 * trailing `(hint)` present only when {@link BacklogCommitResult.hint} is too — the real git/hook
 * stderr reason, not just the generic "exited N" message), or `undefined` when nothing was
 * committed and nothing failed (a no-op the report omits entirely). Shared by `link`/`unlink`/
 * `rename`/`sync` so the one line they all emit for the same event — its label, count, and
 * pluralization — stays byte-identical in exactly one place.
 */
export function renderBacklogCommitLine(commit: BacklogCommitResult): string | undefined {
  if (commit.error !== undefined) {
    const hintSuffix = commit.hint !== undefined ? ` (${commit.hint})` : "";
    return `backlog/ commit failed: ${commit.error}${hintSuffix}`;
  }
  if (commit.committed) {
    const noun = commit.files.length === 1 ? "file" : "files";
    return `committed backlog/: ${commit.files.length} ${noun}`;
  }
  return undefined;
}

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
  pathspecs: readonly string[] = [BACKLOG_DIR],
): Promise<BacklogCommitResult> {
  // An empty pathspec set means "commit nothing" — never a bare `git status` (which would report the
  // WHOLE repo, not just backlog/). A caller with no files to commit ({@link commitBacklogFiles}) is
  // a no-op here rather than a repo-wide sweep.
  if (pathspecs.length === 0) {
    return { committed: false, files: [] };
  }
  const { addPaths, allPaths } = await porcelainPaths(spawn, pathspecs);
  if (allPaths.length === 0) {
    return { committed: false, files: [] };
  }
  // addPaths is never empty here: every entry porcelainPaths parses contributes at least one path to
  // BOTH addPaths and allPaths (a rename/copy's old path is the only thing added to allPaths alone),
  // so allPaths being non-empty (checked above) guarantees addPaths is too.
  await run(spawn, ["add", "--", ...addPaths.map(literalPathspec)], "git add");
  // Scoped with every touched path (including a staged rename/copy's old path, never passed to
  // `add` — see porcelainPaths): `git commit -- <paths>` commits ONLY those paths' content, leaving
  // any OTHER already-staged change (e.g. in-progress work a developer staged separately) untouched
  // in the index rather than swept into lore's commit — a bare, unscoped `git commit` would instead
  // commit the entire index.
  await run(spawn, ["commit", "-m", message, "--", ...allPaths.map(literalPathspec)], "git commit");
  return { committed: true, files: allPaths };
}

/** The default commit message when the caller does not supply one. */
const DEFAULT_COMMIT_MESSAGE = "chore(backlog): sync task changes";

/**
 * Commit exactly the `backlog/` `files` a `lore` command just wrote (each repo-relative, e.g.
 * `backlog/tasks/lore-1 - x.md`), in one `lore`-authored commit — the **per-write** commit
 * `link`/`unlink`/`rename` use so their `doc:<conceptId>` back-reference edit is committed
 * immediately rather than left for the next `lore sync`. Unlike {@link commitBacklogIfDirty}'s
 * bundle-wide `backlog/` sweep (which `sync` uses as the catch-all), this stages **only** the given
 * files' pathspecs (each `:(literal)`-quoted so a wildcard in a filename cannot glob-match a
 * sibling), so an unrelated uncommitted edit to a **different** `backlog/` file is never swept in —
 * [ADR-0012](../docs/adr/0012-backlog-coexistence-git-ownership.md) §1's "stage only the specific
 * task file(s) it intended to change".
 *
 * Isolation is at **file** granularity — all a `git commit -- <pathspec>` can give. An unrelated,
 * uncommitted edit already sitting in the working tree of one of the *same* files being committed is
 * part of that file's content and IS included (the only way to hit this is a developer hand-editing
 * the very task file lore is about to write). Every path must be under `backlog/`: lore is the sole
 * committer of `backlog/` and of nothing else (ADR-0012), so a path escaping it is a caller bug and
 * throws rather than committing outside lore's domain.
 *
 * An empty `files` (the command wrote nothing — `--no-back-ref`, an idempotent no-op, a read-phase
 * failure) no-ops inside {@link commitBacklogIfDirty}'s own empty-pathspec guard, never reaching
 * `git`. `gitSpawn` defaults to the real `git` binary scoped to `root`; injected in tests. A failed
 * `git add`/`commit` (a `drift` git error, e.g. a rejected pre-commit hook) is captured into the
 * result's {@link BacklogCommitResult.error} (with its {@link LoreError.hint} riding along in
 * {@link BacklogCommitResult.hint}) rather than thrown, so the caller can still emit its per-task
 * report before it exits `drift`; any non-`drift` error still propagates.
 */
export async function commitBacklogFiles(
  files: readonly string[],
  opts: { readonly root: string; readonly gitSpawn?: GitSpawn },
  message: string,
): Promise<BacklogCommitResult> {
  // Structural scope guard: lore commits `backlog/` and nothing else (ADR-0012). Each path is
  // normalized (collapsing `.`/`..` segments) BEFORE the prefix check, and the NORMALIZED form —
  // not the raw one — is what gets passed to git from here on. A raw `startsWith` check alone is
  // fooled by a pathspec like `backlog/../docs/secret.md`: it textually starts with `backlog/` but
  // resolves outside it once git interprets the `..` segment — confirmed live that git honors `..`
  // even inside a `:(literal)`-quoted pathspec, so quoting alone does not neutralize it. Validating
  // only a normalized copy while still shelling the raw string out would leave the traversal
  // exploitable, hence normalizing in place. A NUL byte is rejected outright, BEFORE normalizing:
  // `posix.normalize` treats a segment like `"..\0"` as an ordinary (non-`..`) path component and
  // leaves it untouched, so it still passes the prefix check — but `Bun.spawn`'s argv is a C string,
  // silently truncated at that same NUL when it crosses into the actual `git` process. The two layers
  // disagree about where the path ends: normalize validates the full JS string, git only ever sees
  // the bytes before the NUL (confirmed live: a payload like `"backlog/.." + "\0" + "/x"` normalizes
  // to itself, starts with `backlog/`, and passes — but git receives only `:(literal)backlog/..`,
  // which resolves to the repo root). The paths come from Backlog's own `filePathRelative`, always
  // under `backlog/` today — this defends the invariant against a future Backlog layout change (or
  // an absolute/`../`/NUL-embedded path) rather than silently committing outside lore's domain, which
  // the removed bundle-wide sweep made structurally impossible. An empty `files` skips the loop
  // entirely (a no-op run).
  //
  // `posix.normalize` only ever collapses `/`-delimited segments, so a BACKSLASH-delimited `..`
  // climb (e.g. `backlog/x\..\..\outside.md` — the shape a platform-native `path.join` would resolve
  // outside `backlog/` under win32) survives it as one opaque, unchanged segment and still passes
  // the `startsWith` check above. `escapesRoot` (this codebase's shared, already-review-tested
  // traversal check — see LORE-69/72/80's convention of validating against the deployment platform,
  // not just the POSIX host running the fix) walks segments split on EITHER `/` or `\`, so it catches
  // this shape too. It must run on the path with the `backlog/` PREFIX ALREADY STRIPPED: running it
  // on the full, prefixed string would let the `backlog` segment itself absorb one level of the `..`
  // climb and miss the real payload — `escapesRoot` answers "does this climb above where it starts",
  // and the boundary that matters here is `backlog/`, not the string's own first character. Note this
  // guard is defense-in-depth rather than a fix for an active break today: downstream, git's own
  // `:(literal)` pathspec matching never treats `\` as a separator either, so this exact input shape
  // was already a silent no-op (nothing committed, in or out of `backlog/`) rather than an actual
  // escape — but the guard's own contract is a hard boundary regardless of what any current caller or
  // downstream consumer happens to do with the string, so it is rejected outright here too.
  const normalizedFiles = files.map((file) => {
    if (file.includes("\0")) {
      throw new LoreError(
        "drift",
        `refusing to commit "${JSON.stringify(file)}": embedded NUL byte`,
        "this is a bug — a task path with a NUL byte reached the per-write commit",
        { file },
      );
    }
    const normalized = posix.normalize(file);
    if (
      posix.isAbsolute(normalized) ||
      !normalized.startsWith(BACKLOG_DIR) ||
      escapesRoot(normalized.slice(BACKLOG_DIR.length))
    ) {
      throw new LoreError(
        "drift",
        `refusing to commit "${file}": lore only commits ${BACKLOG_DIR}`,
        "this is a bug — a task path outside backlog/ reached the per-write commit",
        { file },
      );
    }
    return normalized;
  });
  const gitSpawn = opts.gitSpawn ?? bunGitSpawn(opts.root);
  // Empty `files` is a no-op via commitBacklogIfDirty's own empty-pathspec guard — the single source
  // of truth for "nothing to commit", not re-implemented here.
  try {
    return await commitBacklogIfDirty(gitSpawn, message, normalizedFiles);
  } catch (err) {
    // Capture a git-side `drift` failure into the result so the caller still emits its report before
    // exiting `drift`; anything else is unexpected and propagates unchanged. `err.hint` rides along
    // (the actual git/hook stderr `run()` captured, or its generic fallback) so the rendered line
    // below isn't left with only a bare "exited N".
    if (err instanceof LoreError && err.type === "drift") {
      return { committed: false, files: [], error: err.message, hint: err.hint };
    }
    throw err;
  }
}

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
 * The **cwd-relative** paths `git status --porcelain -z` reports as changed under `pathspecs`
 * (staged, unstaged, or untracked — every porcelain status code). Parses the NUL-delimited machine
 * format (`-z`), not the human `->`-separated text format: `-z` disables git's C-style quoting
 * entirely (every path is raw bytes, even one containing a space, a literal arrow, or non-ASCII
 * characters — no unescaping needed), and a rename/copy entry is two independent NUL-terminated
 * fields (`new-path\0old-path\0`, no `" -> "` text token at all) rather than one line joined by a
 * literal `" -> "` — which a text-format parser could otherwise mis-split when the path itself
 * contains that exact substring. An *unstaged* rename is reported by git as two ordinary
 * independent entries (a deletion, an untracked add) rather than one `R` entry at all — both come
 * through as ordinary single-field entries either way, so this needs no special casing (and both
 * belong in `addPaths` too, since neither is already-staged).
 *
 * Unlike `adapters/git.ts`'s `git log --relative` fix for the identical concern, `git status` has
 * **no** `--relative` flag at all — it always reports paths relative to the repository's top level,
 * never `cwd`. Since `git add`/`git commit` (the very next calls, run in the same `cwd`) resolve
 * their own pathspecs relative to `cwd`, a nested-bundle checkout (`cwd` below the repo's top level)
 * would otherwise feed them a path they can never match (verified against real git: a project nested
 * one level down reports `project/backlog/tasks/x.md`, but `git add` from `cwd=.../project` looks
 * for `project/project/backlog/tasks/x.md`). `git rev-parse --show-prefix` gives exactly the
 * translation needed — the path from the repo's top level down to `cwd` (e.g. `"project/"`, or `""`
 * when `cwd` already is the top level) — stripped from every reported path before it is used.
 */
async function porcelainPaths(spawn: GitSpawn, pathspecs: readonly string[]): Promise<PorcelainPaths> {
  const prefixResult = await run(spawn, ["rev-parse", "--show-prefix"], "git rev-parse --show-prefix");
  // `.trim()` would also strip LEADING whitespace, corrupting the prefix when the bundle sits under
  // a directory whose name begins with whitespace (e.g. " proj/\n" -> "proj/", losing the leading
  // space that `git status` still reports). Strip only the single trailing newline git terminates
  // `--show-prefix` output with.
  const prefix = prefixResult.stdout.replace(/\r?\n$/, "");
  const cwdRelative = (path: string): string =>
    prefix !== "" && path.startsWith(prefix) ? path.slice(prefix.length) : path;

  // `--untracked-files=all` expands a brand-new untracked directory into its individual file paths
  // (plain `--porcelain` reports only the directory itself, e.g. `?? backlog/`) — scoped to `pathspecs`
  // so, unlike a bare repo-wide `-uall`, this never walks more of the tree than lore is committing.
  const result = await run(
    spawn,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...pathspecs.map(literalPathspec)],
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
    const path = cwdRelative(entry.slice(3)); // "XY " is always exactly 3 chars, even in -z mode
    addPaths.push(path);
    allPaths.push(path);
    if (status.includes("R") || status.includes("C")) {
      // The OLD path is the next NUL-terminated field — needed in the commit's pathspec (see
      // PorcelainPaths.allPaths) but NOT `add`'s (see PorcelainPaths.addPaths).
      const oldPath = tokens[++i];
      if (oldPath !== undefined && oldPath !== "") {
        allPaths.push(cwdRelative(oldPath));
      }
    }
  }
  // Last-line defense-in-depth (ADR-0012): every path `git status` reports back for a `backlog/`-
  // scoped pathspec must genuinely be under `backlog/` — both this function's callers (the catch-all
  // sweep's hardcoded `[BACKLOG_DIR]` default, and the per-write commit's caller-validated files)
  // only ever pass pathspecs already confined to `backlog/`, so this should never fire in practice.
  // It exists because the per-write caller's OWN validation (commitBacklogFiles) and what git
  // actually resolves/reports can diverge in ways that validation alone cannot rule out (LORE-69's
  // NUL-byte finding: a value can pass a JS-level check yet resolve differently once it crosses the
  // exec boundary into git) — re-checking git's own reported paths here, right before they are used
  // to `add`/`commit`, closes that whole class rather than just the one instance found.
  for (const path of allPaths) {
    if (!path.startsWith(BACKLOG_DIR)) {
      throw new LoreError(
        "drift",
        `refusing to commit "${path}": git reported a path outside ${BACKLOG_DIR} for a backlog/-scoped status`,
        "this is a bug — report it; lore's own scope guard did not prevent this",
        { path },
      );
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
