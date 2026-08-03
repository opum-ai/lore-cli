import { describe, expect, test } from "bun:test";
import {
  candidateReleases,
  isAncestorCompareStatus,
  renderIssueBody,
  TRACKING_LABEL,
  watchOnce,
} from "../src/scripts/upstream-backlog-watch";

const TARGET_COMMIT = "22a091b570d44c4f302ca47e7fd36fa28ad8bcb0";
const MERGE_CUTOFF = "2026-07-16T00:00:00Z";

describe("candidateReleases", () => {
  test("keeps only releases published at/after the cutoff (plain filter, no order assumption)", () => {
    const releases = [
      { tagName: "v1.50.0", publishedAt: "2026-07-20T00:00:00Z" },
      { tagName: "v1.49.0", publishedAt: "2026-07-17T00:00:00Z" },
      { tagName: "v1.48.0", publishedAt: "2026-07-12T00:00:00Z" },
      { tagName: "v1.47.1", publishedAt: "2026-06-01T00:00:00Z" },
    ];
    expect(candidateReleases(releases, MERGE_CUTOFF)).toEqual([
      { tagName: "v1.50.0", publishedAt: "2026-07-20T00:00:00Z" },
      { tagName: "v1.49.0", publishedAt: "2026-07-17T00:00:00Z" },
    ]);
  });

  test("keeps a later (out-of-order) qualifying release even after an older one in list order", () => {
    // GitHub's Releases API list order is created_at desc, not guaranteed published_at order, so
    // a qualifying release can appear after a disqualifying one in the raw list. This asserts the
    // filter still keeps it rather than stopping at the first out-of-order older entry.
    const releases = [
      { tagName: "v1.50.0", publishedAt: "2026-07-20T00:00:00Z" },
      { tagName: "v1.40.0", publishedAt: "2026-01-01T00:00:00Z" },
      { tagName: "v1.60.0", publishedAt: "2026-08-01T00:00:00Z" },
    ];
    expect(candidateReleases(releases, MERGE_CUTOFF)).toEqual([
      { tagName: "v1.50.0", publishedAt: "2026-07-20T00:00:00Z" },
      { tagName: "v1.60.0", publishedAt: "2026-08-01T00:00:00Z" },
    ]);
  });

  test("an empty release list yields no candidates", () => {
    expect(candidateReleases([], MERGE_CUTOFF)).toEqual([]);
  });
});

describe("isAncestorCompareStatus", () => {
  test("identical and ahead mean the base commit is an ancestor", () => {
    expect(isAncestorCompareStatus("identical")).toBe(true);
    expect(isAncestorCompareStatus("ahead")).toBe(true);
  });

  test("behind and diverged mean it is not — a merely-newer tag must not match", () => {
    expect(isAncestorCompareStatus("behind")).toBe(false);
    expect(isAncestorCompareStatus("diverged")).toBe(false);
  });
});

describe("renderIssueBody", () => {
  test("links the migration task LORE-253 and names the detected tag/commit", () => {
    const body = renderIssueBody({ tagName: "v1.49.0", sha: "deadbeef" });
    expect(body).toContain("LORE-253");
    expect(body).toContain("v1.49.0");
    expect(body).toContain("deadbeef");
    expect(body).toContain(TARGET_COMMIT);
    expect(body).toContain("docs/runbooks/upstream-backlog-md-json-tag-watch.md");
  });
});

/** A minimal fake `fetch` that answers a fixed sequence of GitHub REST calls by URL substring. */
function stubFetcher(handlers: Array<{ match: string; method?: string; response: unknown; status?: number }>) {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    const handler = handlers.find((h) => url.includes(h.match) && (h.method ?? "GET") === method);
    if (!handler) {
      throw new Error(`stubFetcher: no handler for ${method} ${url}`);
    }
    return new Response(JSON.stringify(handler.response), { status: handler.status ?? 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("watchOnce", () => {
  const env = { repoSlug: "opum-ai/lore-cli", token: "test-token" };

  test("already-surfaced: an existing tracking issue short-circuits before any upstream call", async () => {
    const { fetcher, calls } = stubFetcher([
      { match: `/issues?labels=${TRACKING_LABEL}`, response: [{ html_url: "https://example.com/issues/1" }] },
    ]);
    const result = await watchOnce(env, fetcher);
    expect(result).toEqual({ action: "already-surfaced" });
    // No release/commit/compare/label/create calls should have happened.
    expect(calls).toHaveLength(1);
  });

  test("a pull request carrying the label does not count as an existing tracking issue", async () => {
    const { fetcher } = stubFetcher([
      {
        match: `/issues?labels=${TRACKING_LABEL}`,
        response: [{ html_url: "https://example.com/pull/9", pull_request: {} }],
      },
      { match: "/releases?per_page=100", response: [] },
    ]);
    const result = await watchOnce(env, fetcher);
    expect(result).toEqual({ action: "no-match" });
  });

  test("a labeled PR ahead of a labeled issue in the same page is still recognized as already-surfaced", async () => {
    // Regression for per_page defeating the PR-vs-issue filter: if the query only fetched a
    // single row, a PR sorted first would hide a real tracking issue behind it.
    const { fetcher, calls } = stubFetcher([
      {
        match: `/issues?labels=${TRACKING_LABEL}`,
        response: [
          { html_url: "https://example.com/pull/9", pull_request: {} },
          { html_url: "https://example.com/issues/1" },
        ],
      },
    ]);
    const result = await watchOnce(env, fetcher);
    expect(result).toEqual({ action: "already-surfaced" });
    expect(calls).toHaveLength(1);
    // Pin the fix itself, not just the row-level filtering: the request must actually ask for
    // more than one row, or a revert to per_page=1 would hide the issue row behind the PR row
    // while this test's hand-crafted two-row stub response keeps passing regardless.
    expect(calls[0]).toContain("per_page=100");
  });

  test("no-match: no candidate release's tag contains the target commit", async () => {
    const { fetcher, calls } = stubFetcher([
      { match: "/issues?labels=", response: [] },
      {
        match: "/releases?per_page=100",
        response: [{ tag_name: "v1.49.0", published_at: "2026-07-17T00:00:00Z", draft: false }],
      },
      { match: "/commits/v1.49.0", response: { sha: "abc123" } },
      { match: "/compare/", response: { status: "diverged" } },
    ]);
    const result = await watchOnce(env, fetcher);
    expect(result).toEqual({ action: "no-match" });
    expect(calls.some((c) => c.includes("POST"))).toBe(false);
  });

  test("opened: a qualifying release ensures the label then creates the issue", async () => {
    const { fetcher, calls } = stubFetcher([
      { match: "/issues?labels=", response: [] },
      {
        match: "/releases?per_page=100",
        response: [{ tag_name: "v1.49.0", published_at: "2026-07-17T00:00:00Z", draft: false }],
      },
      { match: "/commits/v1.49.0", response: { sha: "abc123" } },
      { match: "/compare/", response: { status: "ahead" } },
      { match: "/labels", method: "POST", response: { name: TRACKING_LABEL }, status: 201 },
      { match: "/issues", method: "POST", response: { html_url: "https://example.com/issues/42" }, status: 201 },
    ]);
    const result = await watchOnce(env, fetcher);
    expect(result).toEqual({ action: "opened", tagName: "v1.49.0", issueUrl: "https://example.com/issues/42" });
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/labels"))).toBe(true);
    expect(calls.some((c) => c.startsWith("POST") && c.includes("/issues"))).toBe(true);
  });

  test("opened: a 422 from label-create (label already exists) does not block issue creation", async () => {
    const { fetcher } = stubFetcher([
      { match: "/issues?labels=", response: [] },
      {
        match: "/releases?per_page=100",
        response: [{ tag_name: "v1.49.0", published_at: "2026-07-17T00:00:00Z", draft: false }],
      },
      { match: "/commits/v1.49.0", response: { sha: "abc123" } },
      { match: "/compare/", response: { status: "identical" } },
      { match: "/labels", method: "POST", response: { message: "already_exists" }, status: 422 },
      { match: "/issues", method: "POST", response: { html_url: "https://example.com/issues/42" }, status: 201 },
    ]);
    const result = await watchOnce(env, fetcher);
    expect(result).toEqual({ action: "opened", tagName: "v1.49.0", issueUrl: "https://example.com/issues/42" });
  });

  test("draft releases and releases older than the merge cutoff are never probed", async () => {
    const { fetcher, calls } = stubFetcher([
      { match: "/issues?labels=", response: [] },
      {
        match: "/releases?per_page=100",
        response: [
          { tag_name: "v1.48.0", published_at: "2026-07-12T00:00:00Z", draft: false },
          { tag_name: "v1.99.0-draft", published_at: "2026-07-20T00:00:00Z", draft: true },
        ],
      },
    ]);
    const result = await watchOnce(env, fetcher);
    expect(result).toEqual({ action: "no-match" });
    expect(calls.some((c) => c.includes("/commits/"))).toBe(false);
  });
});
