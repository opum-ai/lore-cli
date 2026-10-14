/**
 * DECISION-id references on a concept (DEC-192 (2) and (5); LCLI-670).
 *
 * A concept may link a decision the way it links task ids — a `decisions:` frontmatter list (mirrors
 * `tasks:`) written by `lore link --decision`. Decision ids live in more than one fleet tracker, so
 * every stored entry is REPOSITORY-QUALIFIED as `<repo>:DEC-N` and a bare `DEC-N` is qualified on
 * write. The qualifier resolution order is DEC-192 (5)'s:
 *
 *   1. `--repo <name>`, which always wins;
 *   2. the workspace member id (no caller yet — `lore link` operates on a bare bundle);
 *   3. the name from `git remote get-url origin`: the last path segment without `.git`, identical
 *      for SSH and HTTPS;
 *   4. otherwise, refuse by name and say to pass `--repo`.
 *
 * The qualifier is the NAME only, never a path: a directory name would be wrong inside a review
 * worktree (`lore-cli-review-669-r2`), and a fork yields its own name from ITS remote while
 * `--repo` overrides it.
 */

import { bunGitPreflightSpawn, type GitPreflightSpawn } from "../adapters/git-preflight";
import { LoreError } from "../errors";

/** A decision id: a bare `DEC-N`, or a `<repo>:DEC-N` already qualified. */
const DECISION_REF = /^(?:([^:\s]+):)?(DEC-[0-9]+)$/i;

/**
 * Whether `name` is usable as a repository QUALIFIER: non-empty, and carrying no `:`, no path
 * separator and no whitespace (LCLI-727 F11).
 *
 * ONE predicate for every arm that produces a stored qualifier, because all three write the SAME
 * value into a document and a reader has to split it back out of `<repo>:DEC-N`. {@link DECISION_REF}
 * matches the repository part with `[^:\s]+`, so a whitespace-bearing name is unparseable the moment
 * it is written; `/` or `\` makes the qualifier a PATH, where DEC-192 (5) specifies a repository
 * NAME that is identical in every clone and worktree — the whole reason the directory name is never
 * used. The arms had drifted apart on exactly that: `--repo` rejected `:` and `\` but not `/` or
 * whitespace, while the derived remote name rejected `/` but not whitespace, so `--repo "lore cli"`
 * wrote `lore cli:DEC-1` and `--repo opum-ai/lore-cli` stored a second spelling of a repository
 * already named by its remote.
 */
function isValidQualifier(name: string): boolean {
  return name !== "" && !/[\s:/\\]/.test(name);
}

/**
 * Qualify one decision id. A bare `DEC-N` takes `qualifier`; an already-qualified `<repo>:DEC-N` is
 * kept as authored, so a caller can name another repository's decision explicitly. The decision part
 * is normalised to its canonical uppercase `DEC-N` spelling.
 */
export function qualifyDecisionRef(raw: string, qualifier: string): string {
  const trimmed = raw.trim();
  const match = DECISION_REF.exec(trimmed);
  if (match === null) {
    throw new LoreError("usage", `invalid decision id "${raw}"`, "pass DEC-N, or <repo>:DEC-N", { decision: raw });
  }
  const id = (match[2] as string).toUpperCase();
  const repo = match[1];
  return repo === undefined ? `${qualifier}:${id}` : `${repo}:${id}`;
}

/**
 * The last path segment of the `origin` remote URL, without `.git`; `undefined` when it cannot be
 * read.
 *
 * `spawn` is the SYNC `git` transport, injectable for one reason (LCLI-727 F13): the `catch` below
 * is the branch that turns "there is no `git` on PATH at all" into an ordinary "there is no remote
 * to read", and the only way to reach it for real is to remove `git` from the environment — which a
 * test cannot do safely. `Bun.spawnSync` snapshots the environment at startup, so mutating
 * `process.env` mid-suite provokes nothing, and emptying `PATH` for a call would leak a
 * process-global into every other test in the same run, `windows-latest` included. Injecting a
 * thrower reaches the branch without touching either. It is deliberately the SYNC transport and not
 * `state.ts`'s async `GitSpawn`: `resolveDecisionQualifier` and its callers are synchronous, and
 * making them async to satisfy a test would be a far larger change than the branch is worth.
 */
export function originRepositoryName(
  root: string,
  spawn: GitPreflightSpawn = bunGitPreflightSpawn(root),
): string | undefined {
  // Git's own command, deliberately: a hand parse of .git/config would have to model the file's
  // include/rewrite rules and would silently disagree with git about a redirect.
  try {
    const result = spawn(["remote", "get-url", "origin"]);
    if (result.exitCode !== 0) return undefined;
    return repositoryNameFromRemoteUrl(result.stdout.trim());
  } catch {
    // Bun THROWS when the binary cannot be started at all — no `git` on PATH. That is "there is no
    // remote to read", not an internal error, and an uncaught throw would exit 1 with a code link's
    // exit set does not name. Returning undefined routes it to the caller's own refusal.
    return undefined;
  }
}

/**
 * The repository name a remote URL names: the segment after the LAST `:` or `/`, without a `.git`
 * suffix. Written for every shape a remote can take — `git@github.com:opum-ai/lore-cli.git`
 * (scp-style, no scheme), `https://github.com/opum-ai/lore-cli`, `ssh://git@host/lore-cli.git`, a
 * bare `git@host:lore-cli.git` with no owner — and a name that still carries `\` or `/` (what a local
 * Windows path leaves behind) is REFUSED rather than written into an id.
 */
export function repositoryNameFromRemoteUrl(url: string): string | undefined {
  const trimmed = url.replace(/[/\\]+$/, "");
  if (trimmed === "") return undefined;
  const lastSegment = trimmed.split(/[:/]/).pop() ?? "";
  const name = lastSegment.replace(/\.git$/i, "");
  return isValidQualifier(name) ? name : undefined;
}

/**
 * The qualifier a bare decision id takes, in DEC-192 (5)'s order. `--repo` wins outright; the
 * workspace member id is the next arm (no caller yet); otherwise the `origin` remote's name; and
 * when none applies this REFUSES by name rather than inventing one.
 */
export function resolveDecisionQualifier(options: { root: string; repoFlag?: string; memberId?: string }): string {
  if (options.repoFlag !== undefined) {
    // An explicit qualifier still has to BE a name: empty, carrying a path separator, or carrying
    // whitespace, it would write an id no reader can split back into repository and decision.
    const name = options.repoFlag.trim();
    if (!isValidQualifier(name)) {
      throw new LoreError(
        "usage",
        `invalid --repo "${options.repoFlag}"`,
        "pass a repository NAME, e.g. --repo lore-cli",
      );
    }
    return name;
  }
  if (options.memberId !== undefined) {
    // The same value reaches the same field, so the same predicate holds it (LCLI-727 F11). NOT
    // trimmed: a member id is configuration rather than a flag, and a padded one would store a
    // padded qualifier that no reader can match to the member it names.
    if (!isValidQualifier(options.memberId)) {
      throw new LoreError(
        "usage",
        `invalid workspace member id "${options.memberId}"`,
        "a member id is a repository NAME: no `/`, `:`, `\\` or whitespace",
        { memberId: options.memberId },
      );
    }
    return options.memberId;
  }
  const fromRemote = originRepositoryName(options.root);
  if (fromRemote !== undefined) return fromRemote;
  throw new LoreError(
    "usage",
    "cannot qualify a decision id: this bundle has no readable `origin` remote",
    "pass --repo <name> to name the repository the decision lives in",
    { root: options.root },
  );
}
