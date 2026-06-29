import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { formatScore, type QueryCommandOptions, runQuery } from "../src/commands/query";
import { loadBundle } from "../src/core/bundle";
import { DEFAULT_QUERY_LIMIT, type QueryResult, query } from "../src/core/query";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-query-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a bundle file under `docs/` (path relative to `docs/`). */
function writeDoc(rel: string, contents: string): void {
  const abs = join(root, "docs", rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

/** Load the `docs/` bundle written so far into a graph. */
function graph() {
  return loadBundle(join(root, "docs"));
}

/**
 * A small mixed bundle exercising ranking, filters, and snippet fallbacks:
 *
 * - `stories/bulk-archive` — Story, tags [orders, archive], status "In Progress",
 *   a `summary` (its snippet); body is dense with "archive".
 * - `reference/orders` — Reference, title Orders, tags [orders], a `summary`; mentions
 *   "archive" once.
 * - `adr/0001-retention` — ADR, status Done, NO summary and NO title (snippet omitted);
 *   body is about "retention", not "archive".
 * - `notes/widget` — unknown type Widget, a whitespace-only `summary` (snippet falls
 *   back to title) and a `priority: 2` coerced scalar field; unrelated body.
 */
function writeMixedBundle(): void {
  writeDoc(
    "stories/bulk-archive.md",
    "---\ntype: Story\ntitle: Bulk archive orders\ntags:\n  - orders\n  - archive\nstatus: In Progress\nsummary: Bulk archive orders within a budget.\n---\nArchive old orders. Archive is a pure archive concern.\n",
  );
  writeDoc(
    "reference/orders.md",
    "---\ntype: Reference\ntitle: Orders\ntags:\n  - orders\nsummary: The orders domain reference.\n---\nOrders reference body that mentions archive once.\n",
  );
  writeDoc(
    "adr/0001-retention.md",
    "---\ntype: ADR\nstatus: Done\n---\nRetention policy for archived records and retention windows.\n",
  );
  writeDoc(
    "notes/widget.md",
    '---\ntype: Widget\ntitle: Widget Note\nsummary: "   "\npriority: 2\n---\nAn unrelated note about gadgets.\n',
  );
}

/** Run `query` in JSON mode and return the parsed `data` payload plus the exit code. */
function exportQuery(args: string[], options?: Partial<QueryCommandOptions>): { code: number; data: QueryResult } {
  const stdout = capture();
  const stderr = capture();
  const code = runQuery({ root, output: JSON_CTX, stdout, stderr, args, ...options });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: QueryResult };
  expect(envelope.kind).toBe("query.results");
  return { code, data: envelope.data };
}

/** Assert `fn` throws a {@link LoreError} of `type`, returning it for further assertions. */
function expectError(type: LoreError["type"], fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe(type);
    return err as LoreError;
  }
  throw new Error(`expected a ${type} LoreError, but it returned`);
}

// ── core/query: full-text ranking ───────────────────────────────────────────────

describe("query — text ranking (BM25)", () => {
  test("ranks by relevance, drops zero-score concepts, and sets the query field", () => {
    writeMixedBundle();
    const data = query(graph(), { text: "archive" });
    expect(data.query).toBe("archive");
    // bulk-archive (dense in "archive") outranks reference/orders (one mention); the
    // retention ADR and the unrelated widget note have no "archive" token → dropped.
    expect(data.hits.map((h) => h.id)).toEqual(["stories/bulk-archive", "reference/orders"]);
    expect(data.hits[0]?.score).toBeGreaterThan(data.hits[1]?.score ?? 0);
    expect(data).toMatchObject({ total: 2, shown: 2, truncated: false });
  });

  test("matches across id, frontmatter scalars, and body; a missing query term just contributes nothing", () => {
    writeMixedBundle();
    // "retention" appears only in the ADR body; "gibberishxyz" is in no document, so it
    // adds nothing — the ADR is still the sole hit (the term-not-in-doc branch).
    const data = query(graph(), { text: "retention gibberishxyz" });
    expect(data.hits.map((h) => h.id)).toEqual(["adr/0001-retention"]);
  });

  test("a tie in score breaks by ascending id (deterministic order)", () => {
    // Two concepts with identical searchable content tie on score; ids order them.
    writeDoc("b.md", "---\ntype: Reference\n---\nzebra zebra zebra.\n");
    writeDoc("a.md", "---\ntype: Reference\n---\nzebra zebra zebra.\n");
    const data = query(graph(), { text: "zebra" });
    expect(data.hits.map((h) => h.id)).toEqual(["a", "b"]);
    expect(data.hits[0]?.score).toBe(data.hits[1]?.score ?? -1);
  });

  test("a duplicated query term is counted once (deduped)", () => {
    writeMixedBundle();
    const once = query(graph(), { text: "archive" });
    const twice = query(graph(), { text: "archive archive" });
    expect(twice.hits.map((h) => h.id)).toEqual(once.hits.map((h) => h.id));
    expect(twice.hits[0]?.score).toBeCloseTo(once.hits[0]?.score ?? -1, 10);
  });

  test("a text with no indexable terms (punctuation only) is a filters-only query, honoring filters", () => {
    writeMixedBundle();
    // Punctuation-only text tokenizes to nothing → treated as filters-only (no query
    // field), NOT a ranked query that would score everything 0 and drop the filters.
    const filtered = query(graph(), { text: "!!! ???", type: "ADR" });
    expect(filtered.query).toBeUndefined();
    expect(filtered.hits.map((h) => h.id)).toEqual(["adr/0001-retention"]);
    // With no filter alongside it, it lists the whole (bounded) bundle.
    expect(query(graph(), { text: "..." }).total).toBe(4);
  });

  test("a whitespace-only or absent text is a filters-only query (no query field, score 0, id order)", () => {
    writeMixedBundle();
    const blank = query(graph(), { text: "   " });
    const absent = query(graph(), {});
    expect(blank.query).toBeUndefined();
    expect(absent.query).toBeUndefined();
    expect(absent.hits.map((h) => h.id)).toEqual([
      "adr/0001-retention",
      "notes/widget",
      "reference/orders",
      "stories/bulk-archive",
    ]);
    expect(absent.hits.every((h) => h.score === 0)).toBe(true);
  });

  test("an empty bundle yields zero hits for a text query (avgdl/N guard)", () => {
    const data = query(graph(), { text: "anything" });
    expect(data).toMatchObject({ query: "anything", total: 0, shown: 0, truncated: false });
  });
});

// ── core/query: frontmatter filters (AC#1) ──────────────────────────────────────

describe("query — frontmatter filters", () => {
  test("--type matches case-insensitively", () => {
    writeMixedBundle();
    expect(query(graph(), { type: "story" }).hits.map((h) => h.id)).toEqual(["stories/bulk-archive"]);
    expect(query(graph(), { type: "REFERENCE" }).hits.map((h) => h.id)).toEqual(["reference/orders"]);
  });

  test("--status matches case-insensitively; a concept without status never matches", () => {
    writeMixedBundle();
    expect(query(graph(), { status: "in progress" }).hits.map((h) => h.id)).toEqual(["stories/bulk-archive"]);
    // reference/orders and widget have no status at all → excluded from a status filter.
    expect(query(graph(), { status: "done" }).hits.map((h) => h.id)).toEqual(["adr/0001-retention"]);
  });

  test("--tag requires every listed tag (AND), case-insensitively; a bare-string tag counts as a one-tag list", () => {
    writeMixedBundle();
    // A bare (non-list) `tags:` value is treated as a single tag. Use an unknown type
    // so the bare string is not rejected by the known-type list validator.
    writeDoc("solo.md", "---\ntype: Widget\ntags: orders\n---\nSolo.\n");
    expect(query(graph(), { tags: ["orders"] }).hits.map((h) => h.id)).toEqual([
      "reference/orders",
      "solo",
      "stories/bulk-archive",
    ]);
    // Both tags required → only the story carries both.
    expect(query(graph(), { tags: ["ORDERS", "Archive"] }).hits.map((h) => h.id)).toEqual(["stories/bulk-archive"]);
  });

  test("--field matches a scalar (incl. a YAML-coerced number) and a list element; an absent key never matches", () => {
    writeMixedBundle();
    // Scalar string field.
    expect(query(graph(), { fields: [{ key: "status", value: "Done" }] }).hits.map((h) => h.id)).toEqual([
      "adr/0001-retention",
    ]);
    // A coerced number scalar (unknown type leaves `priority: 2` a number) stringifies to "2".
    expect(query(graph(), { fields: [{ key: "priority", value: "2" }] }).hits.map((h) => h.id)).toEqual([
      "notes/widget",
    ]);
    // List element match (tags is a list).
    expect(query(graph(), { fields: [{ key: "tags", value: "archive" }] }).hits.map((h) => h.id)).toEqual([
      "stories/bulk-archive",
    ]);
    // A key no concept has → no matches.
    expect(query(graph(), { fields: [{ key: "nonesuch", value: "x" }] }).hits).toEqual([]);
  });

  test("--field resolves the key case-insensitively (consistent with the value and the other filters)", () => {
    writeMixedBundle();
    // `Status`/`STATUS` find the `status:` frontmatter key, not just a verbatim-case match.
    expect(query(graph(), { fields: [{ key: "Status", value: "done" }] }).hits.map((h) => h.id)).toEqual([
      "adr/0001-retention",
    ]);
  });

  test("filters compose (AND) and combine with a text query", () => {
    writeMixedBundle();
    // Only the story is a Story tagged orders AND mentions archive.
    const data = query(graph(), { text: "archive", type: "Story", tags: ["orders"] });
    expect(data.hits.map((h) => h.id)).toEqual(["stories/bulk-archive"]);
  });
});

// ── core/query: snippets + bounded output (AC#2) ─────────────────────────────────

describe("query — snippets and bounded output", () => {
  test("snippet is the summary, falling back to title, else omitted; title is verbatim", () => {
    writeMixedBundle();
    const data = query(graph(), {});
    const byId = new Map(data.hits.map((h) => [h.id, h]));
    expect(byId.get("stories/bulk-archive")).toMatchObject({
      title: "Bulk archive orders",
      snippet: "Bulk archive orders within a budget.",
    });
    // widget's summary is whitespace-only → snippet falls back to its title.
    expect(byId.get("notes/widget")?.snippet).toBe("Widget Note");
    // the ADR has neither summary nor title → no snippet, no title.
    expect(byId.get("adr/0001-retention")).not.toHaveProperty("snippet");
    expect(byId.get("adr/0001-retention")).not.toHaveProperty("title");
  });

  test("--limit caps the hits and reports truncation; the default is DEFAULT_QUERY_LIMIT", () => {
    writeMixedBundle();
    const limited = query(graph(), { limit: 2 });
    expect(limited).toMatchObject({ total: 4, shown: 2, truncated: true });
    expect(limited.hits).toHaveLength(2);
    // With no --limit and only four concepts, nothing is truncated.
    expect(query(graph(), {}).truncated).toBe(false);
    expect(DEFAULT_QUERY_LIMIT).toBeGreaterThan(0);
  });
});

// ── command: runQuery ────────────────────────────────────────────────────────────

describe("lore query — command", () => {
  test("JSON export exits 0 with the query.results envelope", () => {
    writeMixedBundle();
    const { code, data } = exportQuery(["archive"]);
    expect(code).toBe(0);
    expect(data.query).toBe("archive");
    expect(data.hits[0]?.id).toBe("stories/bulk-archive");
  });

  test("parses every filter flag, repeatable tags/fields, and the --flag=value form", () => {
    writeMixedBundle();
    const { data } = exportQuery([
      "archive",
      "--type=Story",
      "--tag",
      "orders",
      "--tag=archive",
      "--status",
      "In Progress",
      "--field",
      "tags=archive",
      "--limit=5",
    ]);
    expect(data.hits.map((h) => h.id)).toEqual(["stories/bulk-archive"]);
  });

  test("filters alone (no text) are valid and exit 0", () => {
    writeMixedBundle();
    const { code, data } = exportQuery(["--type", "Reference"]);
    expect(code).toBe(0);
    expect(data.query).toBeUndefined();
    expect(data.hits.map((h) => h.id)).toEqual(["reference/orders"]);
  });

  test("zero hits is still exit 0", () => {
    writeMixedBundle();
    const { code, data } = exportQuery(["nonexistentterm"]);
    expect(code).toBe(0);
    expect(data).toMatchObject({ total: 0, shown: 0, truncated: false });
  });

  test("plain mode renders a ranked listing with scores and a snippet", () => {
    writeMixedBundle();
    const stdout = capture();
    runQuery({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["archive"] });
    const text = stdout.text();
    expect(text).toContain('query "archive": 2 matches');
    expect(text).toMatch(
      / {2}stories\/bulk-archive {2}\[Story] {2}\(\d+\.\d{2}\) {2}— Bulk archive orders within a budget\./,
    );
  });

  test("plain mode shows the §3 truncation footer with the narrow-it hint when --limit drops matches", () => {
    writeMixedBundle();
    const stdout = capture();
    runQuery({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["--limit", "1"] });
    const text = stdout.text();
    expect(text).toContain("query (filters): 4 matches");
    expect(text).toContain("showing 1 of 4 — narrow with --type/--tag/--status/--field, or raise --limit");
  });

  test('a singular match renders "1 match" (not matches)', () => {
    writeMixedBundle();
    const stdout = capture();
    runQuery({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["--type", "ADR"] });
    expect(stdout.text()).toContain("query (filters): 1 match");
  });

  test("`--` ends option parsing so a following dash-token is the search text", () => {
    writeMixedBundle();
    const { data } = exportQuery(["--", "archive"]);
    expect(data.query).toBe("archive");
  });

  test.each([
    [["a", "b"], 'unexpected argument "b"'],
    [["--bogus"], 'unknown option "--bogus"'],
    [["-x"], 'unknown option "-x"'],
    [["--type"], "--type needs a value"],
    [["--type="], "--type needs a value"],
    [["--type", "a", "--type", "b"], "--type given more than once"],
    [["--status", "a", "--status", "b"], "--status given more than once"],
    [["--limit", "1", "--limit", "2"], "--limit given more than once"],
    [["--limit", "0"], 'invalid --limit "0"'],
    [["--limit=0"], 'invalid --limit "0"'],
    [["--limit", "1.5"], 'invalid --limit "1.5"'],
    [["--limit", "abc"], 'invalid --limit "abc"'],
    [["--limit"], "--limit needs a value"],
    [["--limit", "99999999999999999999"], "too large"],
    [["--tag"], "--tag needs a value"],
    [["--field"], "--field needs a value"],
    [["--field", "novalue"], 'invalid --field "novalue"'],
    [["--field", "=orphan"], 'invalid --field "=orphan"'],
    [["--field", "status="], "the value after = must not be empty"],
    [["--field", "status=   "], "the value after = must not be empty"],
  ])("rejects %j with a usage error", (args, fragment) => {
    writeMixedBundle();
    const err = expectError("usage", () =>
      runQuery({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args }),
    );
    expect(`${err.message} ${err.hint ?? ""}`).toContain(fragment);
  });

  test("--field splits on the first = so a value may contain =", () => {
    writeDoc("x.md", "---\ntype: Reference\nslug: a=b\n---\nBody.\n");
    const { data } = exportQuery(["--field", "slug=a=b"]);
    expect(data.hits.map((h) => h.id)).toEqual(["x"]);
  });

  test("--field trims a space-padded value so it still matches", () => {
    writeMixedBundle();
    const { data } = exportQuery(["--field", "status=  In Progress  "]);
    expect(data.hits.map((h) => h.id)).toEqual(["stories/bulk-archive"]);
  });
});

// ── command: score formatting ────────────────────────────────────────────────────

describe("formatScore", () => {
  test("two decimals normally, but a positive sub-0.005 score keeps significant digits", () => {
    expect(formatScore(2.345)).toBe("2.35");
    expect(formatScore(0)).toBe("0.00"); // a genuine zero (filters-only) stays 0.00
    expect(formatScore(0.001)).toBe("0.0010"); // a tiny positive score is never shown as 0.00
  });
});

// ── router: cli dispatch ─────────────────────────────────────────────────────────

describe("cli — query dispatch", () => {
  test("`lore query <text> --json` routes to runQuery and emits the envelope", () => {
    writeMixedBundle();
    const stdout = capture();
    const code = run(["bun", "cli", "query", "archive", "--json"], {
      stdout,
      stderr: capture(),
      cwd: root,
      isTTY: false,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.text()).kind).toBe("query.results");
  });

  test("`lore query --bogus` exits 2 (usage)", () => {
    writeMixedBundle();
    const code = run(["bun", "cli", "query", "--bogus"], {
      stdout: capture(),
      stderr: capture(),
      cwd: root,
      isTTY: false,
    });
    expect(code).toBe(2);
  });
});
