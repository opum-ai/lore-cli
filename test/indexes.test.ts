import { describe, expect, test } from "bun:test";
import { buildGraph } from "../src/core/bundle";
import { type Concept, idFromPath } from "../src/core/concept";
import { generateIndexes, INDEX_BLOCK_BEGIN, INDEX_BLOCK_END } from "../src/core/indexes";

/**
 * Build a minimal valid {@link Concept} at a bundle-relative path. `buildGraph` does not re-validate
 * (the parse boundary already did), and `generateIndexes` reads only `id`, `path`, and
 * `frontmatter.title`, so a bare frontmatter is enough to pin the listing behavior.
 */
function concept(path: string, frontmatter: Record<string, unknown> = {}): Concept {
  const fm = { type: "Reference", ...frontmatter };
  return { id: idFromPath(path), path, type: String(fm.type), frontmatter: fm, body: "" };
}

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

  test("a truncated block (begin marker, no end marker) is treated as absent and a fresh block appended", () => {
    const existing = new Map([["adr/index.md", `# ADRs\n\nProse.\n\n${INDEX_BLOCK_BEGIN}\n- [stale](stale.md)\n`]]);
    const out = generateIndexes(buildGraph([concept("adr/0001-x.md", { title: "X" })]), { existing });
    const adr = out.get("adr/index.md") ?? "";
    // The unterminated prior block is left in place (authored bytes are never deleted)...
    expect(adr).toContain(`${INDEX_BLOCK_BEGIN}\n- [stale](stale.md)`);
    // ...and a fresh, well-formed block is appended.
    expect(adr.endsWith(`${block("- [X](0001-x.md)")}\n`)).toBe(true);
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
