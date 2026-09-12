import { describe, expect, test } from "bun:test";
import { checkBundle } from "../src/core/check";
import { buildLog, type GitAdapter, type GitCommit, type GitLogRange, generateLog } from "../src/core/log";

/**
 * A fixed, hand-authored fake history — never real `git` (LORE-47 / AC#3). Deliberately given out
 * of timestamp order and with cross-folder, multi-file, and out-of-bundle commits so the tests pin
 * deepest-common-folder assignment, the `(timestamp, hash)` sort, and the bundle-root scope.
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

describe("generateLog — one entry per commit, directory-sorted, byte-stable (AC#3)", () => {
  test("assigns each commit to its deepest common bundle folder; folders and entries are sorted", () => {
    expect(generateLog(FAKE_HISTORY)).toBe(
      [
        "# Change log",
        "",
        "## docs",
        "",
        "- 2026-06-20T10:00:00Z aaa1 Add ADR-0014 and a story",
        "- 2026-06-20T11:00:00Z bbb2 Root index + unrelated src",
        "",
        "## docs/adr",
        "",
        "- 2026-06-22T09:00:00Z ddd4 Revise ADR-0014",
        "",
        "## docs/stories",
        "",
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

  test("a commit touching several bundle folders appears exactly once in their deepest common folder", () => {
    const out = generateLog(FAKE_HISTORY);
    expect(out.match(/aaa1/g)?.length).toBe(1);
    expect(out).toContain("## docs\n\n- 2026-06-20T10:00:00Z aaa1 Add ADR-0014 and a story");
    const adrSection = out.slice(out.indexOf("## docs/adr"));
    const storiesSection = out.slice(out.indexOf("## docs/stories"));
    expect(adrSection).not.toContain("aaa1");
    expect(storiesSection).not.toContain("aaa1");
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

  test("MDX-hazardous subjects render as collision-safe code spans that pass the portability scan", () => {
    const out = generateLog([
      {
        hash: "safe7",
        timestamp: "2026-06-20T00:00:00Z",
        subject: "docs: sync Story<->Task {coupling} after `literal` fix",
        files: ["docs/x.md"],
      },
    ]);

    expect(out).toContain("`` docs: sync Story<->Task {coupling} after `literal` fix ``");
    expect(checkBundle([{ path: "log.md", raw: out }])).toMatchObject({ errorCount: 0, warningCount: 0 });
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

describe("LCLI-474 — regeneration merges with the committed log instead of replacing it", () => {
  /**
   * The committed `log.md` of a repository whose history was later rewritten: `old1`/`old2` are
   * entries for commits no ref can reach any more, so the file itself is their only record. Built by
   * `generateLog` rather than hand-typed, so the parse is always exercised against bytes this module
   * genuinely emits, not against a fixture that could drift from the renderer.
   */
  const UNREACHABLE: readonly GitCommit[] = [
    { hash: "old1", timestamp: "2026-06-01T10:00:00Z", subject: "Pre-rewrite ADR edit", files: ["docs/adr/0001.md"] },
    { hash: "old2", timestamp: "2026-06-02T10:00:00Z", subject: "Pre-rewrite story", files: ["docs/stories/a.md"] },
  ];
  const COMMITTED = generateLog(UNREACHABLE);

  test("carries forward every entry the visible history can no longer account for", () => {
    const merged = generateLog(FAKE_HISTORY, { existing: COMMITTED });
    // The whole point: a rewritten history sees none of these commits, and a replace deleted them.
    expect(merged).toContain("- 2026-06-01T10:00:00Z old1 Pre-rewrite ADR edit");
    expect(merged).toContain("- 2026-06-02T10:00:00Z old2 Pre-rewrite story");
    // ...and the derived ones are still there, so the result is a superset of both inputs.
    expect(merged).toContain("ddd4 Revise ADR-0014");
    expect(merged.split("\n").length).toBeGreaterThan(generateLog(FAKE_HISTORY).split("\n").length);
  });

  test("a carried-forward entry keeps the folder section it was recorded under", () => {
    const merged = generateLog(FAKE_HISTORY, { existing: COMMITTED });
    const adr = merged.slice(merged.indexOf("## docs/adr"), merged.indexOf("## docs/stories"));
    expect(adr).toContain("old1 Pre-rewrite ADR edit");
    expect(adr).not.toContain("old2");
  });

  test("is byte-identical to a replace when the history is a superset of the committed log (the normal case)", () => {
    // History only ever grows, so every committed entry is re-derived and nothing is carried
    // forward. Byte-stability and the drift story are therefore unchanged for every healthy repo.
    const committed = generateLog(FAKE_HISTORY.slice(0, 2));
    expect(generateLog(FAKE_HISTORY, { existing: committed })).toBe(generateLog(FAKE_HISTORY));
  });

  test("a depth-limited checkout preserves the entries the shallow history cannot reach", () => {
    // The case that needs no rewrite at all: `git clone --depth`, a grafted history, or a CI
    // checkout with a limited fetch depth all hand lore a strict subset of the committed log.
    const full = generateLog(FAKE_HISTORY);
    const shallow = generateLog(FAKE_HISTORY.slice(0, 1), { existing: full });
    expect(shallow).toBe(full);
  });

  test("is idempotent: re-running over its own output changes nothing", () => {
    const once = generateLog(FAKE_HISTORY, { existing: COMMITTED });
    expect(generateLog(FAKE_HISTORY, { existing: once })).toBe(once);
  });

  test("a carried-forward subject needing MDX escaping is not re-escaped on every sync", () => {
    // Feeding an already-rendered code span back through `renderSubject` would grow its delimiter by
    // one backtick per sync — a superset that is no longer byte-stable.
    const escaped: readonly GitCommit[] = [
      {
        hash: "esc1",
        timestamp: "2026-06-03T10:00:00Z",
        subject: "Handle <Foo> and {bar}",
        files: ["docs/adr/0002.md"],
      },
    ];
    const committed = generateLog(escaped);
    expect(committed).toContain("` Handle <Foo> and {bar} `");
    const merged = generateLog([], { existing: committed });
    expect(merged).toBe(committed);
    expect(generateLog([], { existing: merged })).toBe(committed);
  });

  test("a rewritten commit renders under both hashes, deliberately, rather than being silently dropped", () => {
    const before = generateLog([
      { hash: "was9", timestamp: "2026-06-04T10:00:00Z", subject: "Same change", files: ["docs/adr/0003.md"] },
    ]);
    const after = generateLog(
      [{ hash: "now8", timestamp: "2026-06-04T10:00:00Z", subject: "Same change", files: ["docs/adr/0003.md"] }],
      { existing: before },
    );
    // Indistinguishable from two genuine commits, so both are kept: over-reporting history is
    // recoverable by reading it, under-reporting is not.
    expect(after).toContain("was9 Same change");
    expect(after).toContain("now8 Same change");
  });

  test("an entry already derived is never duplicated, even when its subject rendered differently before", () => {
    // Keying the merge on (timestamp, hash) rather than on the whole line: an entry written by an
    // older lore whose subject rendered differently is still the same commit.
    const stale = [
      "# Change log",
      "",
      "## docs/adr",
      "",
      "- 2026-06-22T09:00:00Z ddd4 Revise ADR-14 (old wording)",
      "",
    ].join("\n");
    const merged = generateLog(FAKE_HISTORY, { existing: stale });
    expect(merged).toContain("ddd4 Revise ADR-0014");
    expect(merged).not.toContain("old wording");
  });

  test("the parse is total: a hand-edited or malformed log preserves what is legible and throws on nothing", () => {
    const mangled = [
      "# Change log",
      "",
      "Someone pasted a note here.",
      "- 2026-06-05T10:00:00Z orph1 an entry before any folder heading",
      "",
      "## docs/adr",
      "",
      "- 2026-06-06T10:00:00Z keep1 a legible entry",
      "not an entry line at all",
      "- malformed",
      "",
    ].join("\n");
    const merged = generateLog(FAKE_HISTORY, { existing: mangled });
    expect(merged).toContain("keep1 a legible entry");
    // An entry with no folder heading above it has no section to belong to, and free prose is not an
    // entry. Both are dropped rather than failing the sync — the direction that still loses no entries.
    expect(merged).not.toContain("orph1");
    expect(merged).not.toContain("Someone pasted a note");
  });

  test("a CRLF committed log parses identically to an LF one (Windows checkouts)", () => {
    // JavaScript's `$` without the `m` flag matches at end of input or before a final `\n`, never
    // before a `\r`. Without stripping the CR, NEITHER the heading nor the entry pattern matches a
    // single line of a CRLF file: the parse yields nothing, the merge carries nothing forward, and
    // regeneration silently degrades to the replace semantics this whole change exists to prevent --
    // on Windows only, with every other test still green, because fixtures are written with `\n`.
    const crlf = COMMITTED.replace(/\n/g, "\r\n");
    expect(generateLog(FAKE_HISTORY, { existing: crlf })).toBe(generateLog(FAKE_HISTORY, { existing: COMMITTED }));
    expect(generateLog(FAKE_HISTORY, { existing: crlf })).toContain("- 2026-06-01T10:00:00Z old1 Pre-rewrite ADR edit");
  });

  test("a CRLF entry carries no stray carriage return into the regenerated bytes", () => {
    // Stripping the CR at parse time rather than at render time: a carried-forward entry must be
    // byte-identical to a derived one, not merely present.
    expect(generateLog([], { existing: COMMITTED.replace(/\n/g, "\r\n") })).toBe(COMMITTED);
  });

  test("an absent or empty committed log regenerates exactly as before the merge existed", () => {
    expect(generateLog(FAKE_HISTORY, { existing: undefined })).toBe(generateLog(FAKE_HISTORY));
    expect(generateLog(FAKE_HISTORY, { existing: "" })).toBe(generateLog(FAKE_HISTORY));
  });

  test("buildLog forwards the committed bytes through the adapter seam", () => {
    expect(buildLog(fakeAdapter(), { to: "HEADSHA" }, { existing: COMMITTED })).toBe(
      generateLog(FAKE_HISTORY, { existing: COMMITTED }),
    );
  });

  test("an empty history preserves the whole committed log rather than emptying it", () => {
    // `lore sync` takes this path when HEAD does not resolve — the emptiest possible history, and
    // the one where a replace erased the entire file.
    expect(generateLog([], { existing: COMMITTED })).toBe(COMMITTED);
  });
});
