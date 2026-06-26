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

/** A fake {@link GitAdapter} that returns the fixed history regardless of range (records the range it saw). */
function fakeAdapter(history: readonly GitCommit[] = FAKE_HISTORY): GitAdapter & { seen: GitLogRange[] } {
  const seen: GitLogRange[] = [];
  return {
    seen,
    history(range: GitLogRange): readonly GitCommit[] {
      seen.push(range);
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
});

describe("buildLog — the GitAdapter seam is exercised (AC#1)", () => {
  test("resolves history through the injected fake adapter and renders it", () => {
    const adapter = fakeAdapter();
    const range: GitLogRange = { from: "v0.1", to: "HEADSHA" };
    expect(buildLog(adapter, range)).toBe(generateLog(FAKE_HISTORY));
    expect(adapter.seen).toEqual([range]);
  });
});
