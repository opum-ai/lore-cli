import { describe, expect, test } from "bun:test";
import { buildLog, type GitAdapter, type GitCommit, type GitLogRange, generateLog } from "../src/core/log";

/**
 * A fixed, hand-authored fake history — never real `git` (LORE-47 / AC#3). Deliberately given out
 * of timestamp order and with cross-folder, multi-file, and out-of-bundle commits so the tests pin
 * grouping, the `(timestamp, hash)` sort, dedup, and the bundle-root scope.
 */
const FAKE_HISTORY: readonly GitCommit[] = [
  { hash: "ddd4", timestamp: "2026-06-22T09:00:00Z", subject: "Revise ADR-0014", files: ["docs/adr/0014.md"] },
  {
    hash: "aaa1",
    timestamp: "2026-06-20T10:00:00Z",
    subject: "Add ADR-0014 and a story",
    files: ["docs/adr/0014.md", "docs/stories/bulk-archive.md"],
  },
  {
    hash: "ccc3",
    timestamp: "2026-06-21T08:00:00Z",
    subject: "Touch two files in one folder",
    files: ["docs/stories/bulk-archive.md", "docs/stories/retention.md"],
  },
  {
    hash: "bbb2",
    timestamp: "2026-06-20T11:00:00Z",
    subject: "Root index + unrelated src",
    files: ["docs/index.md", "src/cli.ts"],
  },
];

/**
 * A fake {@link GitAdapter} that returns the fixed history regardless of range (records the range
 * AND the root/pathspec it saw — LORE-143 — so tests can assert `buildLog` actually forwards the
 * resolved root into the seam, not just into `generateLog`'s own post-filtering).
 */
function fakeAdapter(
  history: readonly GitCommit[] = FAKE_HISTORY,
): GitAdapter & { seen: GitLogRange[]; seenRoots: (string | undefined)[] } {
  const seen: GitLogRange[] = [];
  const seenRoots: (string | undefined)[] = [];
  return {
    seen,
    seenRoots,
    history(range: GitLogRange, root?: string): readonly GitCommit[] {
      seen.push(range);
      seenRoots.push(root);
      return history;
    },
  };
}

describe("generateLog — per-folder, directory-sorted, byte-stable (AC#3)", () => {
  test("groups commits by bundle folder, folders sorted, commits sorted by (timestamp, hash)", () => {
    expect(generateLog(FAKE_HISTORY)).toBe(
      [
        "# Change log",
        "",
        "## docs",
        "",
        "- 2026-06-20T11:00:00Z bbb2 Root index + unrelated src",
        "",
        "## docs/adr",
        "",
        "- 2026-06-20T10:00:00Z aaa1 Add ADR-0014 and a story",
        "- 2026-06-22T09:00:00Z ddd4 Revise ADR-0014",
        "",
        "## docs/stories",
        "",
        "- 2026-06-20T10:00:00Z aaa1 Add ADR-0014 and a story",
        "- 2026-06-21T08:00:00Z ccc3 Touch two files in one folder",
        "",
      ].join("\n"),
    );
  });

  test("output is independent of the order commits arrive in (byte-stable / idempotent)", () => {
    const reversed = [...FAKE_HISTORY].reverse();
    expect(generateLog(reversed)).toBe(generateLog(FAKE_HISTORY));
  });

  test("a commit touching several files in one folder appears once under that folder", () => {
    const out = generateLog(FAKE_HISTORY);
    const storiesSection = out.slice(out.indexOf("## docs/stories"));
    expect(storiesSection.match(/ccc3/g)?.length).toBe(1);
  });

  test("files outside the bundle root are ignored (no `src` section, but the docs/index commit stays)", () => {
    const out = generateLog(FAKE_HISTORY);
    expect(out).not.toContain("## src");
    expect(out).toContain("## docs\n");
  });

  test("the root is matched by segment, so a sibling like `docsite/` never groups under `docs`", () => {
    const out = generateLog([
      { hash: "e5", timestamp: "2026-06-20T00:00:00Z", subject: "sibling dir", files: ["docsite/x.md"] },
    ]);
    expect(out).toBe("# Change log\n");
  });

  test("an empty history yields just the heading", () => {
    expect(generateLog([])).toBe("# Change log\n");
  });

  test("a multi-line subject is collapsed to a single line", () => {
    const out = generateLog([
      { hash: "f6", timestamp: "2026-06-20T00:00:00Z", subject: "first\n\nbody leaked", files: ["docs/x.md"] },
    ]);
    expect(out).toContain("- 2026-06-20T00:00:00Z f6 first body leaked");
  });

  test("honors a custom root and title", () => {
    const out = generateLog([{ hash: "a1", timestamp: "2026-06-20T00:00:00Z", subject: "s", files: ["wiki/a.md"] }], {
      root: "wiki",
      title: "History",
    });
    expect(out.startsWith("# History\n")).toBe(true);
    expect(out).toContain("## wiki\n");
  });
});

describe("generateLog — determinism edge cases", () => {
  test("orders by true instant, not lexical text, across differing UTC offsets", () => {
    // 05:30-06:00 == 11:30Z is chronologically LATER than 10:00Z, though it sorts EARLIER lexically.
    const out = generateLog([
      { hash: "late", timestamp: "2026-06-20T05:30:00-06:00", subject: "later instant", files: ["docs/x.md"] },
      { hash: "early", timestamp: "2026-06-20T10:00:00Z", subject: "earlier instant", files: ["docs/x.md"] },
    ]);
    expect(out).toBe(
      [
        "# Change log",
        "",
        "## docs",
        "",
        "- 2026-06-20T10:00:00Z early earlier instant",
        "- 2026-06-20T05:30:00-06:00 late later instant",
        "",
      ].join("\n"),
    );
  });

  test("a file whose path equals the root is ignored (no `## .` section above the bundle)", () => {
    const out = generateLog([
      { hash: "r1", timestamp: "2026-06-20T00:00:00Z", subject: "file literally named docs", files: ["docs"] },
    ]);
    expect(out).toBe("# Change log\n");
    expect(out).not.toContain("## .");
  });

  test("two distinct commits sharing an abbreviated hash both render (no dedup-by-hash collapse)", () => {
    const out = generateLog([
      { hash: "abc1234", timestamp: "2026-06-20T10:00:00Z", subject: "first", files: ["docs/x.md"] },
      { hash: "abc1234", timestamp: "2026-06-21T10:00:00Z", subject: "second", files: ["docs/x.md"] },
    ]);
    expect(out.match(/abc1234/g)?.length).toBe(2);
  });

  test("an explicitly empty root falls back to the default bundle root", () => {
    expect(generateLog(FAKE_HISTORY, { root: "" })).toBe(generateLog(FAKE_HISTORY));
  });

  test("commits at the same instant tie-break deterministically by hash", () => {
    const out = generateLog([
      { hash: "zzz", timestamp: "2026-06-20T10:00:00Z", subject: "z", files: ["docs/x.md"] },
      { hash: "aaa", timestamp: "2026-06-20T10:00:00Z", subject: "a", files: ["docs/x.md"] },
    ]);
    expect(out).toBe(
      ["# Change log", "", "## docs", "", "- 2026-06-20T10:00:00Z aaa a", "- 2026-06-20T10:00:00Z zzz z", ""].join(
        "\n",
      ),
    );
  });

  test("commits sharing an instant AND an abbreviated hash tie-break by subject (no input-order churn)", () => {
    const out = generateLog([
      { hash: "dup", timestamp: "2026-06-20T10:00:00Z", subject: "zebra", files: ["docs/x.md"] },
      { hash: "dup", timestamp: "2026-06-20T10:00:00Z", subject: "alpha", files: ["docs/x.md"] },
    ]);
    expect(out).toBe(
      [
        "# Change log",
        "",
        "## docs",
        "",
        "- 2026-06-20T10:00:00Z dup alpha",
        "- 2026-06-20T10:00:00Z dup zebra",
        "",
      ].join("\n"),
    );
  });

  test("a trailing slash on the root still matches files under it (no silently-empty log)", () => {
    expect(generateLog(FAKE_HISTORY, { root: "docs/" })).toBe(generateLog(FAKE_HISTORY));
    expect(generateLog(FAKE_HISTORY, { root: "docs///" })).toBe(generateLog(FAKE_HISTORY));
  });

  test("LORE-243: equivalent spellings of the root — './docs', 'docs/.', './docs/' — canonicalize identically to 'docs' (none silently empty)", () => {
    const canonical = generateLog(FAKE_HISTORY);
    expect(generateLog(FAKE_HISTORY, { root: "./docs" })).toBe(canonical);
    expect(generateLog(FAKE_HISTORY, { root: "docs/." })).toBe(canonical);
    expect(generateLog(FAKE_HISTORY, { root: "./docs/" })).toBe(canonical);
  });

  test("LORE-243: internal redundant separators — 'docs//adr' and 'docs/./adr' — resolve to the same bundle root as 'docs/adr'", () => {
    const canonical = generateLog(FAKE_HISTORY, { root: "docs/adr" });
    // Sanity: the canonical root actually scopes to a non-empty section, so the equality below is
    // meaningful (not two empty logs agreeing vacuously).
    expect(canonical).toContain("## docs/adr");
    expect(generateLog(FAKE_HISTORY, { root: "docs//adr" })).toBe(canonical);
    expect(generateLog(FAKE_HISTORY, { root: "docs/./adr" })).toBe(canonical);
  });

  test("offset-less timestamps order by text, not a host-local-TZ parse (machine-independent)", () => {
    // Neither carries an offset, so neither is trusted as an absolute instant; they order by
    // deterministic code-unit text, identically on every machine and time zone.
    const out = generateLog([
      { hash: "b", timestamp: "2026-06-20T10:00:00", subject: "second", files: ["docs/x.md"] },
      { hash: "a", timestamp: "2026-06-20T09:00:00", subject: "first", files: ["docs/x.md"] },
    ]);
    expect(out).toBe(
      ["# Change log", "", "## docs", "", "- 2026-06-20T09:00:00 a first", "- 2026-06-20T10:00:00 b second", ""].join(
        "\n",
      ),
    );
  });

  test("an absolute-instant commit sorts before an offset-less one regardless of wall text", () => {
    const out = generateLog([
      { hash: "nooff", timestamp: "2026-06-20T01:00:00", subject: "no offset", files: ["docs/x.md"] },
      { hash: "withoff", timestamp: "2026-06-20T23:00:00Z", subject: "has offset", files: ["docs/x.md"] },
    ]);
    expect(out.indexOf("withoff")).toBeLessThan(out.indexOf("nooff"));
  });
});

describe("buildLog — the GitAdapter seam is exercised (AC#1)", () => {
  test("resolves history through the injected fake adapter and renders it", () => {
    const adapter = fakeAdapter();
    const range: GitLogRange = { from: "v0.1", to: "HEADSHA" };
    expect(buildLog(adapter, range)).toBe(generateLog(FAKE_HISTORY));
    expect(adapter.seen).toEqual([range]);
  });

  test("LORE-143: passes the default bundle root to adapter.history as a pathspec (not only to generateLog)", () => {
    const adapter = fakeAdapter();
    buildLog(adapter, { to: "HEADSHA" });
    expect(adapter.seenRoots).toEqual(["docs"]);
  });

  test("LORE-143: a custom `options.root` is forwarded to adapter.history, resolved the same way generateLog resolves it", () => {
    const adapter = fakeAdapter();
    buildLog(adapter, { to: "HEADSHA" }, { root: "wiki/" });
    // Same normalization `generateLog` applies (trailing slash stripped) — the two must always agree
    // on which root scopes a given `log.md`, or the pathspec would prune commits generateLog still
    // expected to see.
    expect(adapter.seenRoots).toEqual(["wiki"]);
  });

  test("LORE-243: an equivalent-spelling root resolves to the same canonicalized pathspec generateLog's post-filter uses", () => {
    const adapter = fakeAdapter();
    buildLog(adapter, { to: "HEADSHA" }, { root: "./docs/" });
    // './docs/' must canonicalize to exactly 'docs' — the same root generateLog resolves it to — so
    // the adapter's pathspec-scoped walk and generateLog's post-filter never disagree on scope.
    expect(adapter.seenRoots).toEqual(["docs"]);
  });
});
