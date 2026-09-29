/**
 * adapters/forge.ts — the real, `gh`-shelling {@link ForgeAdapter} (LCLI-652 / DEC-40).
 *
 * The cross-ref view's `open-prs` population needs something git cannot answer: which pull
 * requests are OPEN, and against which base. That is deliberately not derivable from the
 * repository — measured for this fleet on 2026-09-29: `git ls-remote origin 'refs/pull/*\/head'`
 * returned 424 refs on lore-cli while `gh pr list --state open` returned 0. The PR ref namespace
 * is historical and carries no base, so a git-only mechanism can never back
 * `population: "open-prs"` — which is why this seam exists at all.
 *
 * Two properties are load-bearing, and both are contract rather than style:
 *
 * - **It never throws.** Every failure — no `gh` on PATH, an unauthenticated or offline `gh`, a
 *   non-GitHub `origin`, a malformed response — is a classified `{ ok: false, reason }`, because
 *   the caller's ruled behaviour (DEC-40, operator's condition) is to report INCOMPLETE COVERAGE
 *   at exit 6 and never to error out. A throw here would become an uncaught failure, which is
 *   exactly the outcome the ruling forbids.
 * - **It carries no credentials and stores none.** Authentication belongs to the user's own `gh`
 *   installation; lore reads only the JSON list it prints. The alternative considered and set
 *   aside (D1 option B) was a REST client with a token lore reads from the environment, which
 *   would make lore own token precedence and a second network stack.
 *
 * The `reason` strings it produces obey the shared cross-CLI guarantee settled with quest-cli on
 * 2026-09-29: free text, single line, no absolute paths. That is why a failing `gh` is classified
 * by exit code rather than quoted — raw stderr can carry a home-directory config path.
 */

import { singleLine } from "../errors";

/** One open pull request into the base branch, as the forge reports it. */
export interface ForgePullRequest {
  /** The pull request number, unique within the repository. */
  readonly number: number;
  /** The source branch name, as `gh` reports it (may live in a fork). */
  readonly headRefName: string;
  /** The head commit the forge currently reports — full 40-hex. */
  readonly headRefOid: string;
}

/** The classified outcome of one discovery read. */
export type ForgeDiscovery =
  | {
      readonly ok: true;
      /** `owner/repo`, from the remote the pull requests belong to — the prefix of every `pullRequest` provenance. */
      readonly repository: string;
      readonly pullRequests: readonly ForgePullRequest[];
    }
  | { readonly ok: false; readonly reason: string };

/** The injectable forge seam: how the cross-ref view learns which pull requests are open. */
export interface ForgeAdapter {
  /** List the open pull requests targeting `base`, or a classified reason it could not. Never throws. */
  listOpenPullRequests(options: { readonly cwd: string; readonly base: string }): Promise<ForgeDiscovery>;
}

/**
 * A GitHub remote URL, in any of the three forms `git remote get-url` returns. The enterprise
 * hosts are deliberately NOT matched: an unlisted host is a non-GitHub remote, which the ruling
 * makes an incomplete-coverage outcome rather than a guess about an API shape this adapter has
 * never been tested against.
 */
const GITHUB_REMOTE =
  /^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(?<slug>[^/\s]+\/[^/\s]+?)(?:\.git)?$/u;

/** The maximum pull requests one discovery read will request — `gh`'s own default is 30, which would silently truncate the population. */
const DISCOVERY_LIMIT = "1000";

/**
 * How the adapter runs `gh` — injectable so every classification below (missing binary, non-zero
 * exit, malformed payload) is testable offline and on every platform. A fake `gh` on PATH cannot
 * carry these on Windows, where a shell stub does not shadow an `.exe`; a seam can.
 */
export type ForgeSpawn = (
  args: readonly string[],
  cwd: string,
) => Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;

/** Build the real {@link ForgeAdapter}, shelling `gh` in `cwd` (the repository root). */
export function realForgeAdapter(options: { readonly spawn?: ForgeSpawn } = {}): ForgeAdapter {
  const spawn = options.spawn ?? spawnGh;
  return {
    async listOpenPullRequests({ cwd, base }): Promise<ForgeDiscovery> {
      const remote = originUrl(cwd);
      if (remote === null) {
        return { ok: false, reason: "no `origin` remote is configured, so open pull requests cannot be discovered" };
      }
      const slug = GITHUB_REMOTE.exec(remote)?.groups?.slug;
      if (slug === undefined) {
        return { ok: false, reason: "`origin` is not a GitHub remote, so open pull requests cannot be discovered" };
      }

      // Only the spawn and its read live inside the try: Bun throws here for a binary that does
      // not exist, which is the "no gh on PATH" case the ruling turns into incomplete coverage.
      // Everything after this block classifies values and never throws.
      let raw: { stdout: string; stderr: string; exitCode: number };
      try {
        raw = await spawn(
          [
            "pr",
            "list",
            "--state",
            "open",
            "--base",
            base,
            "--limit",
            DISCOVERY_LIMIT,
            "--json",
            "number,headRefName,headRefOid",
          ],
          cwd,
        );
      } catch {
        return { ok: false, reason: "the `gh` CLI is not installed or not on PATH" };
      }
      const { stdout, stderr, exitCode } = raw;
      if (exitCode !== 0) {
        // Classified, not quoted (see this module's doc): the exit code is the durable fact, and
        // stderr is where a home-directory config path would leak into a user-facing reason.
        return {
          ok: false,
          reason: `\`gh pr list\` exited ${exitCode}${
            /auth/i.test(stderr) ? " (not authenticated)" : " (offline, or the remote is not a GitHub repository)"
          }`,
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return { ok: false, reason: "`gh pr list` returned output that is not JSON" };
      }
      if (!Array.isArray(parsed)) {
        return { ok: false, reason: "`gh pr list` returned a non-list JSON payload" };
      }

      const pullRequests: ForgePullRequest[] = [];
      for (const entry of parsed) {
        const record = entry as { number?: unknown; headRefName?: unknown; headRefOid?: unknown };
        if (
          typeof record.number !== "number" ||
          !Number.isSafeInteger(record.number) ||
          typeof record.headRefName !== "string" ||
          typeof record.headRefOid !== "string" ||
          !/^[0-9a-f]{40}$/u.test(record.headRefOid)
        ) {
          return { ok: false, reason: "`gh pr list` returned a pull request record with an unexpected shape" };
        }
        pullRequests.push({
          number: record.number,
          headRefName: record.headRefName,
          headRefOid: record.headRefOid,
        });
      }
      return { ok: true, repository: slug, pullRequests };
    },
  };
}

/**
 * The default {@link ForgeSpawn}: shell `gh` and read it out. Throws only when the process cannot
 * be started at all — a missing binary is the case the caller's `catch` classifies — and resolves
 * with whatever exit code a running `gh` produced.
 */
async function spawnGh(
  args: readonly string[],
  cwd: string,
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  const proc = Bun.spawn(["gh", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

/**
 * `origin`'s URL, or `null` when there is no `origin` remote (or no repository). The URL is
 * checked against {@link GITHUB_REMOTE} by the caller and never echoed into a reason — a remote
 * URL can carry credentials in its userinfo, and the shared reason guarantee is that nothing
 * user-facing leaves this seam carrying them.
 */
function originUrl(cwd: string): string | null {
  let proc: { exitCode: number; stdout: Uint8Array };
  try {
    proc = Bun.spawnSync(["git", "remote", "get-url", "origin"], { cwd, stdout: "pipe", stderr: "pipe" });
  } catch {
    // Bun throws when `git` itself cannot be started. Every caller here treats `null` as "no
    // readable origin URL", which is the same incomplete-coverage outcome this seam promises; the
    // case is normally intercepted earlier by the guarded `hasRemote`, so this is belt and braces
    // rather than a path a run reaches first.
    return null;
  }
  if (proc.exitCode !== 0) return null;
  const url = singleLine(new TextDecoder().decode(proc.stdout).trim());
  return url === "" ? null : url;
}
