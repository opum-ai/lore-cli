import { describe, expect, test } from "bun:test";
import { buildGraph } from "../src/core/bundle";
import { generateIndexes, INDEX_BLOCK_BEGIN, INDEX_BLOCK_END, locateManagedBlock } from "../src/core/indexes";
import { LoreError } from "../src/errors";
import { concept } from "./helpers";

/** Wrap listing lines in the canonical managed block. */
function block(...lines: string[]): string {
  return `${INDEX_BLOCK_BEGIN}\n${lines.join("\n")}\n${INDEX_BLOCK_END}`;
}

const SAMPLE = [
  concept("index.md", { title: "Docs root", okf_version: "0.1" }),
  concept("adr/0001-x.md", { title: "First decision" }),
  concept("adr/0002-y.md", { title: "Second decision" }),
  concept("reference/architecture.md", { title: "Architecture" }),
];

const ROOT_AUTHORED = '---\ntype: Reference\nokf_version: "0.1"\n---\n\n# Docs\n\nIntro.\n';

describe("generateIndexes — graph-derived navigable hubs (LORE-29)", () => {
  test("produces an index for the root and every concept-bearing directory", () => {
    const out = generateIndexes(buildGraph(SAMPLE));
    expect([...out.keys()].sort()).toEqual(["adr/index.md", "index.md", "reference/index.md"]);
  });

  test("root index lists child-directory hubs, sorted by link; excludes the root index itself", () => {
    const out = generateIndexes(buildGraph(SAMPLE));
    // The root index file is absent from `existing`, so a frontmatter-free hub is synthesized.
    expect(out.get("index.md")).toBe(
      `# index\n\n${block("- [adr](adr/index.md)", "- [reference](reference/index.md)")}\n`,
    );
  });

  test("sub-index lists immediate child concepts, sorted by link, with frontmatter title", () => {
    const out = generateIndexes(buildGraph(SAMPLE));
    expect(out.get("adr/index.md")).toBe(
      `# adr\n\n${block("- [First decision](0001-x.md)", "- [Second decision](0002-y.md)")}\n`,
    );
  });

  test("AC#2: a synthesized sub-index carries no frontmatter fence", () => {
    const out = generateIndexes(buildGraph(SAMPLE));
    for (const [path, bytes] of out) {
      if (path !== "index.md") {
        expect(bytes.startsWith("---")).toBe(false);
      }
    }
  });

  test("title falls back to the file base name when frontmatter has no usable title", () => {
    const out = generateIndexes(buildGraph([concept("notes/raw-note.md", { title: "   " })]));
    expect(out.get("notes/index.md")).toContain("- [raw-note](raw-note.md)");
  });

  test("link path segments are percent-encoded (portable markdown form)", () => {
    const out = generateIndexes(buildGraph([concept("guides/getting started.md", { title: "Getting started" })]));
    expect(out.get("guides/index.md")).toContain("- [Getting started](getting%20started.md)");
  });

  test("characters left raw by encodeURIComponent (! ' ( ) *) are escaped so a ) cannot truncate the link", () => {
    const out = generateIndexes(buildGraph([concept("guides/a(b)'c!.md", { title: "Weird" })]));
    expect(out.get("guides/index.md")).toContain("- [Weird](a%28b%29%27c%21.md)");
  });

  test("an intermediate directory with concepts only deeper still gets a hub that links down", () => {
    const out = generateIndexes(buildGraph([concept("a/b/c/deep.md", { title: "Deep" })]));
    expect([...out.keys()].sort()).toEqual(["a/b/c/index.md", "a/b/index.md", "a/index.md", "index.md"]);
    expect(out.get("a/index.md")).toContain("- [b](b/index.md)");
    expect(out.get("a/b/index.md")).toContain("- [c](c/index.md)");
    expect(out.get("a/b/c/index.md")).toContain("- [Deep](deep.md)");
  });

  test("title text is escaped so brackets cannot break the markdown link", () => {
    const out = generateIndexes(buildGraph([concept("adr/0001-x.md", { title: "Plan [B] (draft)" })]));
    expect(out.get("adr/index.md")).toContain("- [Plan \\[B\\] (draft)](0001-x.md)");
  });

  test("a pre-existing backslash-escaped bracket is not re-escaped into a live link boundary (LORE-149)", () => {
    const out = generateIndexes(buildGraph([concept("adr/0001-x.md", { title: "Plan \\]B\\[ (draft)" })]));
    const line = out.get("adr/index.md") ?? "";
    // The backslash is doubled *before* the bracket is escaped, so the title's own `\]`/`\[` render
    // as a literal backslash (`\\`) followed by a literal, non-delimiting bracket (`\]`/`\[`) —
    // reproducing `Plan \]B\[ (draft)` verbatim instead of shifting text into a real `](` boundary.
    expect(line).toContain("- [Plan \\\\\\]B\\\\\\[ (draft)](0001-x.md)");
    // Exactly one real `](` link boundary — the title's escaped brackets must not open another.
    expect(line.split("](").length).toBe(2);
  });

  test("a title is single-lined so a newline cannot split the entry out of the list", () => {
    const out = generateIndexes(buildGraph([concept("adr/0001-x.md", { title: "Line one\nline two" })]));
    expect(out.get("adr/index.md")).toContain("- [Line one line two](0001-x.md)");
  });

  test("a title containing the end sentinel is neutralized, so the block stays a fixpoint (regression for the self-poison bug)", () => {
    const g = buildGraph([concept("adr/0001-x.md", { title: "Decision <!-- lore:index:end --> note" })]);
    const first = generateIndexes(g).get("adr/index.md") ?? "";
    // The raw end marker never reaches the block interior...
    expect(first).not.toContain(`note ${INDEX_BLOCK_END}`);
    expect(first.split(INDEX_BLOCK_END).length).toBe(2); // exactly one (real) end marker
    // ...so regeneration is byte-identical instead of corrupting/growing the file each run.
    const second = generateIndexes(g, { existing: new Map([["adr/index.md", first]]) }).get("adr/index.md");
    expect(second).toBe(first);
  });

  test("reserved index.md/log.md are never listed as children", () => {
    const out = generateIndexes(buildGraph([concept("adr/index.md"), concept("adr/0001-x.md", { title: "X" })]));
    const adr = out.get("adr/index.md") ?? "";
    expect(adr).toContain("- [X](0001-x.md)");
    expect(adr).not.toContain("index.md)");
  });
});

describe("generateIndexes — managed-region splice preserves authored bytes (lore-design §6.2)", () => {
  const ROOT_RAW =
    "---\n" +
    "# yaml-language-server: $schema=../.lore/schemas/reference.schema.json\n" +
    'type: Reference\ntitle: lore documentation\nokf_version: "0.1"\n' +
    "---\n\n# lore documentation\n\nCurated intro prose the author wrote.\n";

  test("appends the block to an existing index without markers, preserving frontmatter + modeline + prose", () => {
    const existing = new Map([["index.md", ROOT_RAW]]);
    const out = generateIndexes(buildGraph(SAMPLE), { existing });
    const root = out.get("index.md") ?? "";
    // Everything the author wrote is intact...
    expect(root.startsWith(ROOT_RAW.replace(/\n+$/, ""))).toBe(true);
    expect(root).toContain("# yaml-language-server:");
    expect(root).toContain('okf_version: "0.1"');
    expect(root).toContain("Curated intro prose the author wrote.");
    // ...and the listing block is appended.
    expect(root).toContain(block("- [adr](adr/index.md)", "- [reference](reference/index.md)"));
  });

  test("a truncated block (begin marker, no end marker) is a validation error, not silently rewritten whole (LORE-86)", () => {
    const g = buildGraph([concept("adr/0001-x.md", { title: "X" })]);
    const existing = new Map([["adr/index.md", `# ADRs\n\nProse.\n\n${INDEX_BLOCK_BEGIN}\n- [stale](stale.md)\n`]]);
    // Previously the orphan begin was silently absorbed (region extended to end-of-file); LORE-86
    // makes this a fail-loud error instead of guessing that the whole tail was machine-owned.
    expect(() => generateIndexes(g, { existing })).toThrow(LoreError);
  });

  test("duplicate marker pairs with real prose between them is a validation error, not a silent collapse-and-delete (LORE-86)", () => {
    const g = buildGraph([concept("adr/0001-x.md", { title: "X" })]);
    const proseBetween = "Hand-authored prose a merge conflict left between two duplicate blocks.";
    const existing = new Map([
      ["adr/index.md", `# ADRs\n\n${block("- [live](live.md)")}\n\n${proseBetween}\n\n${block("- [stale2](s2.md)")}\n`],
    ]);
    // Previously first-begin→last-end collapsed both blocks AND the prose between them into one
    // regenerated block, silently deleting `proseBetween` with no warning (LORE-86's exact repro:
    // a merge conflict/hand edit leaving duplicate `lore:index` markers). Now it fails loud instead
    // of ever writing over that prose.
    expect(() => generateIndexes(g, { existing })).toThrow(LoreError);
  });

  test("locateManagedBlock: well-formed, no-markers, truncated, duplicated, and crossed-marker contracts", () => {
    const BEGIN = "<!-- x:begin -->";
    const END = "<!-- x:end -->";

    // No markers at all: null (an unmanaged file the caller appends to).
    expect(locateManagedBlock("plain prose", BEGIN, END)).toBeNull();

    // Exactly one well-formed pair: the `[start, end)` span, markers included.
    const wellFormed = `pre\n${BEGIN}\nbody\n${END}\npost`;
    const bounds = locateManagedBlock(wellFormed, BEGIN, END);
    expect(bounds).not.toBeNull();
    expect(wellFormed.slice(bounds?.start, bounds?.end)).toBe(`${BEGIN}\nbody\n${END}`);

    // A begin with no end anywhere: validation error, not a guessed to-EOF span.
    expect(() => locateManagedBlock(`${BEGIN}\nbody, no end`, BEGIN, END)).toThrow(LoreError);

    // Two begins and two ends: validation error, not a collapsed first-begin→last-end span.
    expect(() => locateManagedBlock(`${BEGIN}\na\n${END}\nmid\n${BEGIN}\nb\n${END}`, BEGIN, END)).toThrow(LoreError);

    // An end that precedes the begin (crossed): validation error.
    expect(() => locateManagedBlock(`${END}\nmid\n${BEGIN}`, BEGIN, END)).toThrow(LoreError);
  });

  test("a present-but-empty index file is synthesized like an absent one (heading, no leading blanks)", () => {
    const g = buildGraph([concept("notes/a.md", { title: "A" })]);
    const out = generateIndexes(g, { existing: new Map([["notes/index.md", "   \n\n"]]) });
    expect(out.get("notes/index.md")).toBe(`# notes\n\n${block("- [A](a.md)")}\n`);
  });

  test("replaces an existing block in place, keeping prose above and below it", () => {
    const existing = new Map([
      [
        "adr/index.md",
        `# Architecture Decision Records\n\nProcess prose.\n\n${block("- [stale](stale.md)")}\n\nFooter prose.\n`,
      ],
    ]);
    const out = generateIndexes(buildGraph([concept("adr/0001-x.md", { title: "X" })]), { existing });
    expect(out.get("adr/index.md")).toBe(
      `# Architecture Decision Records\n\nProcess prose.\n\n${block("- [X](0001-x.md)")}\n\nFooter prose.\n`,
    );
  });
});

describe("generateIndexes — determinism (AC#1)", () => {
  test("is byte-identical across runs for the same graph", () => {
    const a = generateIndexes(buildGraph(SAMPLE));
    const b = generateIndexes(buildGraph([...SAMPLE].reverse()));
    expect([...b.entries()]).toEqual([...a.entries()]);
  });

  test("regeneration over already-generated bytes is a fixpoint (no-change is a no-op)", () => {
    const g = buildGraph(SAMPLE);
    const first = generateIndexes(g, { existing: new Map([["index.md", ROOT_AUTHORED]]) });
    const second = generateIndexes(g, { existing: first });
    expect([...second.entries()]).toEqual([...first.entries()]);
  });
});
