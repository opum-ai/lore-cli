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

import { LoreError } from "../errors";

/** A decision id: a bare `DEC-N`, or a `<repo>:DEC-N` already qualified. */
const DECISION_REF = /^(?:([^:\s]+):)?(DEC-[0-9]+)$/i;

/** Whether a raw string is shaped like a decision id (bare or qualified). */
export function isDecisionRef(raw: string): boolean {
  return DECISION_REF.test(raw);
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

/** The last path segment of the `origin` remote URL, without `.git`; `undefined` when it cannot be read. */
export function originRepositoryName(root: string): string | undefined {
  // Git's own command, deliberately: a hand parse of .git/config would have to model the file's
  // include/rewrite rules and would silently disagree with git about a redirect.
  try {
    const result = Bun.spawnSync(["git", "remote", "get-url", "origin"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) return undefined;
    return repositoryNameFromRemoteUrl(result.stdout.toString("utf8").trim());
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
  if (name === "" || name.includes(":") || name.includes("\\") || name.includes("/")) return undefined;
  return name;
}

/**
 * The qualifier a bare decision id takes, in DEC-192 (5)'s order. `--repo` wins outright; the
 * workspace member id is the next arm (no caller yet); otherwise the `origin` remote's name; and
 * when none applies this REFUSES by name rather than inventing one.
 */
export function resolveDecisionQualifier(options: { root: string; repoFlag?: string; memberId?: string }): string {
  if (options.repoFlag !== undefined) {
    // An explicit qualifier still has to BE a name: empty, or carrying a separator, it would write
    // an id no reader can split back into repository and decision.
    const name = options.repoFlag.trim();
    if (name === "" || name.includes(":") || name.includes("\\")) {
      throw new LoreError(
        "usage",
        `invalid --repo "${options.repoFlag}"`,
        "pass a repository NAME, e.g. --repo lore-cli",
      );
    }
    return name;
  }
  if (options.memberId !== undefined) return options.memberId;
  const fromRemote = originRepositoryName(options.root);
  if (fromRemote !== undefined) return fromRemote;
  throw new LoreError(
    "usage",
    "cannot qualify a decision id: this bundle has no readable `origin` remote",
    "pass --repo <name> to name the repository the decision lives in",
    { root: options.root },
  );
}
