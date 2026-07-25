#!/usr/bin/env bun
/**
 * upstream-backlog-watch.ts — LORE-254.
 *
 * Repo-maintenance script, **not** part of the `lore` CLI surface (no `--json` envelope, no
 * exit-code contract, not reachable through `lore <command>` at all). It is invoked directly by
 * `.github/workflows/upstream-backlog-watch.yml` on a schedule.
 *
 * Why this exists: MrLesk/Backlog.md merged commit 22a091b (PR #790 / BACK-545, stable `--json`
 * output on `task list`/`task view`/`search`) to `main` on 2026-07-16, but has not yet **tagged**
 * a release that contains it (the latest tag as of writing, v1.48.0, predates the merge). LORE-253
 * — the adapter migration that unblocks lore's own first npm release — is blocked on that tag
 * existing, and nothing upstream notifies lore when it ships. This script polls MrLesk/Backlog.md's
 * Releases API and, the first time it finds a release whose commit history actually **contains**
 * 22a091b (not merely a release numbered higher than v1.48.0 — a newer tag could still predate the
 * merge), opens a tracking issue in THIS repo labeled `upstream-watch` so the maintainer can pick up
 * LORE-253. See `docs/runbooks/upstream-backlog-watch.md` for the full runbook (where the signal
 * lands, who acts on it) and `docs/runbooks/backlog-json-patch.md` §8.1 for what LORE-253 does once
 * unblocked.
 *
 * Kept stateless by design: rather than persisting "already scanned up to tag X", it re-derives
 * "already surfaced" by asking GitHub whether a tracking issue carrying TRACKING_LABEL already
 * exists (open OR closed) before doing any upstream work. Once a qualifying release is found and
 * reported once, every later upstream release also contains 22a091b in its history forever after
 * (commits don't leave history) — so the existing-issue check is what stops this from re-notifying
 * on every future upstream release, not a per-tag dedupe.
 */

const UPSTREAM_REPO = "MrLesk/Backlog.md";
const TARGET_COMMIT = "22a091b570d44c4f302ca47e7fd36fa28ad8bcb0";
const TARGET_COMMIT_PR_URL = "https://github.com/MrLesk/Backlog.md/pull/790";
// PR #790 merged 2026-07-16 (docs/runbooks/backlog-json-patch.md §8.1) -- any release published
// strictly before this cannot possibly contain the commit, so it bounds the scan to real
// candidates instead of walking MrLesk/Backlog.md's entire release history on every run.
const TARGET_COMMIT_MERGED_AT = "2026-07-16T00:00:00Z";
export const TRACKING_LABEL = "upstream-watch";
const TRACKING_LABEL_COLOR = "6f42c1";
const TRACKING_LABEL_DESCRIPTION = "MrLesk/Backlog.md shipped a --json-capable tag (LORE-254); see the linked issue.";

export interface ReleaseInfo {
  tagName: string;
  publishedAt: string;
}

export interface QualifyingRelease {
  tagName: string;
  sha: string;
}

export type WatchResult =
  | { action: "already-surfaced" }
  | { action: "no-match" }
  | { action: "opened"; tagName: string; issueUrl: string };

/**
 * Keep only releases that could possibly contain {@link TARGET_COMMIT}: everything published
 * at/after {@link TARGET_COMMIT_MERGED_AT}. `releases` must already be sorted newest-first
 * (GitHub's Releases API default order) — the moment one release is older than the cutoff, every
 * remaining (older) release is guaranteed to be too, so this is a prefix-take, not a full scan.
 */
export function candidateReleases(releases: ReleaseInfo[], cutoffIso: string = TARGET_COMMIT_MERGED_AT): ReleaseInfo[] {
  const candidates: ReleaseInfo[] = [];
  for (const release of releases) {
    if (release.publishedAt < cutoffIso) break;
    candidates.push(release);
  }
  return candidates;
}

/**
 * GitHub's compare API (`/compare/{base}...{head}`) `status` field: `"identical"` or `"ahead"`
 * (head ahead of base) both mean `base` is an ancestor of (or equal to) `head` — i.e. the tag's
 * history actually contains the commit. This is what distinguishes a real `--json`-capable tag
 * from one that is merely numbered newer (`"behind"` / `"diverged"`).
 */
export function isAncestorCompareStatus(status: string): boolean {
  return status === "identical" || status === "ahead";
}

/** The tracking issue body for a release confirmed to contain {@link TARGET_COMMIT}. */
export function renderIssueBody(release: QualifyingRelease): string {
  const releaseUrl = `https://github.com/${UPSTREAM_REPO}/releases/tag/${release.tagName}`;
  return [
    `MrLesk/Backlog.md tag [\`${release.tagName}\`](${releaseUrl}) (commit \`${release.sha}\`) is the first`,
    `tagged release whose history contains commit \`${TARGET_COMMIT}\``,
    `([PR #790](${TARGET_COMMIT_PR_URL}) / BACK-545 — stable \`--json\` output on \`task list\`/\`task view\`/\`search\`),`,
    "confirmed via the GitHub compare API (not merely a tag numbered newer than v1.48.0).",
    "",
    'This is the external event **LORE-253** ("Migrate backlog adapter to the released --json',
    "Backlog.md...\") and `docs/runbooks/release-publishing.md`'s release Prerequisites were both",
    "waiting on — it is also the last gate on lore's own first npm release.",
    "",
    "**Next step:** `backlog task view LORE-253 --plain`, then follow",
    "`docs/runbooks/backlog-json-patch.md` §8.1 step 4 to point `src/adapters/backlog.ts` at the",
    "published package instead of the interim pinned-commit build.",
    "",
    "Detected by `.github/workflows/upstream-backlog-watch.yml` (LORE-254); see",
    "`docs/runbooks/upstream-backlog-watch.md` for how this signal works and who acts on it.",
  ].join("\n");
}

// ── I/O boundary ─────────────────────────────────────────────────────────────
// Everything below talks to the GitHub REST API. Every function threads through an injectable
// `fetcher` (defaulting to the real global `fetch` only at the `watchOnce` boundary) so the whole
// orchestration can be exercised in tests against a stub instead of the network.

type Fetcher = typeof fetch;

class GithubApiError extends Error {
  constructor(
    method: string,
    url: string,
    readonly status: number,
    body: string,
  ) {
    super(`GitHub API ${method} ${url} -> ${status}: ${body}`);
  }
}

async function githubApi<T>(fetcher: Fetcher, token: string, method: string, path: string, body?: unknown): Promise<T> {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const response = await fetcher(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lore-upstream-backlog-watch (LORE-254)",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new GithubApiError(method, url, response.status, await response.text());
  }
  return (await response.json()) as T;
}

interface UpstreamReleaseApiRow {
  tag_name: string;
  published_at: string | null;
  draft: boolean;
}

async function listUpstreamReleases(fetcher: Fetcher, token: string): Promise<ReleaseInfo[]> {
  const rows = await githubApi<UpstreamReleaseApiRow[]>(
    fetcher,
    token,
    "GET",
    `/repos/${UPSTREAM_REPO}/releases?per_page=100`,
  );
  return rows
    .filter((row): row is UpstreamReleaseApiRow & { published_at: string } => !row.draft && row.published_at !== null)
    .map((row) => ({ tagName: row.tag_name, publishedAt: row.published_at }));
}

async function resolveTagSha(fetcher: Fetcher, token: string, tag: string): Promise<string> {
  const commit = await githubApi<{ sha: string }>(fetcher, token, "GET", `/repos/${UPSTREAM_REPO}/commits/${tag}`);
  return commit.sha;
}

async function compareAgainstTarget(fetcher: Fetcher, token: string, sha: string): Promise<string> {
  const comparison = await githubApi<{ status: string }>(
    fetcher,
    token,
    "GET",
    `/repos/${UPSTREAM_REPO}/compare/${TARGET_COMMIT}...${sha}`,
  );
  return comparison.status;
}

/** The first candidate release (newest-first) whose history contains {@link TARGET_COMMIT}, if any. */
async function findQualifyingRelease(fetcher: Fetcher, token: string): Promise<QualifyingRelease | null> {
  const releases = await listUpstreamReleases(fetcher, token);
  for (const candidate of candidateReleases(releases)) {
    const sha = await resolveTagSha(fetcher, token, candidate.tagName);
    const status = await compareAgainstTarget(fetcher, token, sha);
    if (isAncestorCompareStatus(status)) {
      return { tagName: candidate.tagName, sha };
    }
  }
  return null;
}

interface OwnIssueApiRow {
  pull_request?: unknown;
}

async function trackingIssueAlreadyExists(fetcher: Fetcher, token: string, repoSlug: string): Promise<boolean> {
  const rows = await githubApi<OwnIssueApiRow[]>(
    fetcher,
    token,
    "GET",
    `/repos/${repoSlug}/issues?labels=${TRACKING_LABEL}&state=all&per_page=1`,
  );
  // The issues endpoint also returns pull requests carrying the label; a real hit must be an
  // actual issue.
  return rows.some((row) => !row.pull_request);
}

async function ensureTrackingLabelExists(fetcher: Fetcher, token: string, repoSlug: string): Promise<void> {
  try {
    await githubApi(fetcher, token, "POST", `/repos/${repoSlug}/labels`, {
      name: TRACKING_LABEL,
      color: TRACKING_LABEL_COLOR,
      description: TRACKING_LABEL_DESCRIPTION,
    });
  } catch (error) {
    // 422 = the label already exists; anything else is a real failure.
    if (!(error instanceof GithubApiError && error.status === 422)) {
      throw error;
    }
  }
}

interface CreatedIssueApiRow {
  html_url: string;
}

async function openTrackingIssue(
  fetcher: Fetcher,
  token: string,
  repoSlug: string,
  release: QualifyingRelease,
): Promise<string> {
  const created = await githubApi<CreatedIssueApiRow>(fetcher, token, "POST", `/repos/${repoSlug}/issues`, {
    title: `Upstream Backlog.md ${release.tagName} is --json-capable — LORE-253 is unblocked`,
    body: renderIssueBody(release),
    labels: [TRACKING_LABEL],
  });
  return created.html_url;
}

/**
 * Run one check: skip entirely if already surfaced, otherwise probe upstream and open the
 * tracking issue on a hit. `fetcher` defaults to the real global `fetch` — tests pass a stub.
 */
export async function watchOnce(
  env: { repoSlug: string; token: string },
  fetcher: Fetcher = fetch,
): Promise<WatchResult> {
  if (await trackingIssueAlreadyExists(fetcher, env.token, env.repoSlug)) {
    return { action: "already-surfaced" };
  }
  const found = await findQualifyingRelease(fetcher, env.token);
  if (!found) {
    return { action: "no-match" };
  }
  await ensureTrackingLabelExists(fetcher, env.token, env.repoSlug);
  const issueUrl = await openTrackingIssue(fetcher, env.token, env.repoSlug, found);
  return { action: "opened", tagName: found.tagName, issueUrl };
}

async function main(): Promise<number> {
  const repoSlug = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repoSlug || !token) {
    console.error("GITHUB_REPOSITORY and GITHUB_TOKEN must both be set (this script runs under GitHub Actions).");
    return 1;
  }
  const result = await watchOnce({ repoSlug, token });
  switch (result.action) {
    case "already-surfaced":
      console.log(`A "${TRACKING_LABEL}" tracking issue already exists in ${repoSlug}; nothing to do.`);
      break;
    case "no-match":
      console.log(`No MrLesk/Backlog.md release yet contains ${TARGET_COMMIT}.`);
      break;
    case "opened":
      console.log(`Opened ${result.issueUrl} for upstream tag ${result.tagName}.`);
      break;
  }
  return 0;
}

// Same shape as cli.ts's own entrypoint guard (LORE-70): set `process.exitCode` rather than call
// `process.exit()` so pending stdout/stderr writes flush before the process actually ends.
if (import.meta.main) {
  Promise.resolve(main()).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
