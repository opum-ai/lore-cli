import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph, conceptNotInBundle, type Edge, loadBundle, resolvePath } from "../src/core/bundle";
import { type CheckInputFile, checkBundle } from "../src/core/check";
import { parseConcept } from "../src/core/concept";
import { compileProfile, parseProfile } from "../src/core/profile";
import { LoreError, WarningCollector } from "../src/errors";

// ── Fixtures ───────────────────────────────────────────────────────────────────

/** Build a concept from a path + frontmatter/body, in canonical form. */
function concept(path: string, frontmatter: string, body = ""): ReturnType<typeof parseConcept> {
  return parseConcept(path, `---\n${frontmatter}\n---\n${body}`);
}

/** A minimal Reference concept at `path` whose body is `body`. */
function ref(path: string, body = ""): ReturnType<typeof parseConcept> {
  return concept(path, "type: Reference", body);
}

/** Find the edges leaving `from`, for terse assertions. */
function edgesFrom(edges: readonly Edge[], from: string): Edge[] {
  return edges.filter((e) => e.from === from);
}

// ── buildGraph: nodes ───────────────────────────────────────────────────────────

describe("buildGraph — concepts", () => {
  test("indexes every concept by id, in ascending id order", () => {
    const g = buildGraph([ref("reference/z"), ref("adr/a"), ref("index")]);
    expect([...g.concepts.keys()]).toEqual(["adr/a", "index", "reference/z"]);
    expect(g.concepts.get("adr/a")?.type).toBe("Reference");
  });

  test("throws conflict on a duplicate id", () => {
    try {
      buildGraph([ref("adr/a"), ref("adr/a")]);
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("conflict");
      return;
    }
    throw new Error("expected a conflict LoreError");
  });

  test("is order-independent: shuffled input yields identical concepts and edges", () => {
    const inputs = [ref("b/two", "[one](../a/one.md)"), ref("a/one", "[two](../b/two.md)"), ref("c/three")];
    const forward = buildGraph(inputs);
    const reversed = buildGraph([...inputs].reverse());
    expect([...forward.concepts.keys()]).toEqual([...reversed.concepts.keys()]);
    expect(forward.edges).toEqual(reversed.edges);
  });
});

// ── buildGraph: body cross-link edges ────────────────────────────────────────────

describe("buildGraph — body links", () => {
  test("resolves a relative .md link to the target concept id", () => {
    const g = buildGraph([ref("adr/a", "see [orders](../reference/orders.md)"), ref("reference/orders")]);
    expect(edgesFrom(g.edges, "adr/a")).toEqual([
      { from: "adr/a", to: "reference/orders", target: "../reference/orders.md", kind: "link" },
    ]);
  });

  test("a link to a missing concept is a tolerated dangling edge (to: null)", () => {
    const g = buildGraph([ref("adr/a", "see [ghost](../reference/ghost.md)")]);
    expect(edgesFrom(g.edges, "adr/a")).toEqual([
      { from: "adr/a", to: null, target: "../reference/ghost.md", kind: "link" },
    ]);
  });

  test("ignores example links inside fenced and inline code", () => {
    const body = [
      "real [a](../x/a.md) link",
      "```markdown",
      "fenced [b](../x/b.md)",
      "```",
      "inline `[c](../x/c.md)` code",
      "~~~",
      "tilde [d](../x/d.md)",
      "~~~",
    ].join("\n");
    const g = buildGraph([ref("y/doc", body), ref("x/a"), ref("x/b"), ref("x/c"), ref("x/d")]);
    expect(edgesFrom(g.edges, "y/doc").map((e) => e.to)).toEqual(["x/a"]);
  });

  test("ignores images, external schemes, and bare anchors", () => {
    const body = [
      "![pic](../img/p.md)", // image
      "[ext](https://example.com/x.md)", // external scheme
      "[mail](mailto:a@b.md)", // mailto scheme
      "[sec](#a-heading)", // bare anchor
      "[asset](../data/table.csv)", // non-.md
      "[ok](../x/a.md)", // the only real edge
    ].join("\n\n");
    const g = buildGraph([ref("y/doc", body), ref("x/a")]);
    expect(edgesFrom(g.edges, "y/doc")).toEqual([{ from: "y/doc", to: "x/a", target: "../x/a.md", kind: "link" }]);
  });

  test("URL-encoded targets and #anchors resolve to the bare concept id", () => {
    const g = buildGraph([ref("y/doc", "[t](../x/a%20b.md#section) and [u](../x/a%20b.md)"), ref("x/a b")]);
    expect(edgesFrom(g.edges, "y/doc").map((e) => e.to)).toEqual(["x/a b", "x/a b"]);
  });

  test("a link escaping the bundle root dangles rather than throwing", () => {
    const g = buildGraph([ref("doc", "[up](../../README.md)")]);
    expect(edgesFrom(g.edges, "doc")).toEqual([{ from: "doc", to: null, target: "../../README.md", kind: "link" }]);
  });

  test("body links preserve document order", () => {
    const g = buildGraph([ref("d", "[b](b.md) then [a](a.md)"), ref("a"), ref("b")]);
    expect(edgesFrom(g.edges, "d").map((e) => e.to)).toEqual(["b", "a"]);
  });
});

// ── CommonMark extraction (parser-backed) ────────────────────────────────────────

describe("buildGraph — CommonMark link extraction", () => {
  test("ignores a link in a real indented (4-space) code block", () => {
    // A blank line then 4-space indent is a CommonMark code block, not a paragraph.
    const g = buildGraph([ref("y/doc", "intro\n\n    example [x](../x/a.md) link\n"), ref("x/a")]);
    expect(edgesFrom(g.edges, "y/doc")).toEqual([]);
  });

  test("extracts the OUTER link of a linked image [![alt](img)](target.md)", () => {
    const g = buildGraph([ref("y/doc", "[![diagram](../img/d.svg)](../specs/design.md)"), ref("specs/design")]);
    expect(edgesFrom(g.edges, "y/doc")).toEqual([
      { from: "y/doc", to: "specs/design", target: "../specs/design.md", kind: "link" },
    ]);
  });

  test("resolves an angle-bracketed destination containing a space", () => {
    const g = buildGraph([ref("y/doc", "see [x](<../x/a b.md>)"), ref("x/a b")]);
    expect(edgesFrom(g.edges, "y/doc").map((e) => e.to)).toEqual(["x/a b"]);
  });

  test("resolves a reference-style link via its definition", () => {
    const g = buildGraph([ref("y/doc", "use [the spec][s]\n\n[s]: ../specs/design.md"), ref("specs/design")]);
    expect(edgesFrom(g.edges, "y/doc").map((e) => e.to)).toEqual(["specs/design"]);
  });

  test("an orphan (unused) reference definition is NOT a phantom edge", () => {
    // `[ghost]: …` with no `[ghost]` reference renders as nothing — it must not be an edge.
    const g = buildGraph([ref("y/doc", "plain prose, no links\n\n[ghost]: ../x/missing.md"), ref("x/a")]);
    expect(edgesFrom(g.edges, "y/doc")).toEqual([]);
  });

  test("an unbalanced inline backtick forms a code span, so an enclosed link is not an edge (CommonMark)", () => {
    const g = buildGraph([ref("y/doc", "see `query and [arch](../reference/a.md) for `x`"), ref("reference/a")]);
    expect(edgesFrom(g.edges, "y/doc")).toEqual([]);
  });

  test("a pathologically deep body does not overflow the stack (iterative walk)", () => {
    // ~20k nested blockquotes overflow a recursive AST walk; the iterative walk copes.
    const deep = `${">".repeat(20000)} deep [x](a.md)\n`;
    const g = buildGraph([ref("doc", deep), ref("a")]);
    expect(edgesFrom(g.edges, "doc").map((e) => e.to)).toEqual(["a"]);
  });

  test("a protocol-relative URL (//host/x.md) is external, not an internal edge", () => {
    const g = buildGraph([ref("y/doc", "[cdn](//cdn.example.com/x.md)"), ref("x")]);
    expect(edgesFrom(g.edges, "y/doc")).toEqual([]);
  });
});

// ── buildGraph: frontmatter ref edges ────────────────────────────────────────────

describe("buildGraph — frontmatter refs", () => {
  test("specs / supersedes / superseded_by become edges in canonical field order", () => {
    const story = concept(
      "stories/s",
      "type: Story\nspecs:\n  - specs/design\nsupersedes: stories/old\nsuperseded_by:\n  - stories/new",
    );
    const g = buildGraph([story, ref("specs/design"), ref("stories/old"), ref("stories/new")]);
    expect(edgesFrom(g.edges, "stories/s")).toEqual([
      { from: "stories/s", to: "specs/design", target: "specs/design", kind: "specs" },
      { from: "stories/s", to: "stories/old", target: "stories/old", kind: "supersedes" },
      { from: "stories/s", to: "stories/new", target: "stories/new", kind: "superseded_by" },
    ]);
  });

  test("resolves an id-style ref and a relative-path-style ref to the same concept", () => {
    const byId = concept("adr/a", "type: ADR\nsupersedes: adr/old"); // bundle-relative id
    const byPath = concept("adr/b", "type: ADR\nsupersedes: ../adr/old.md"); // relative path
    const g = buildGraph([byId, byPath, ref("adr/old")]);
    expect(edgesFrom(g.edges, "adr/a")[0]?.to).toBe("adr/old");
    expect(edgesFrom(g.edges, "adr/b")[0]?.to).toBe("adr/old");
  });

  test("a dangling frontmatter ref is tolerated (to: null)", () => {
    const g = buildGraph([concept("adr/a", "type: ADR\nsupersedes: adr/ghost")]);
    expect(edgesFrom(g.edges, "adr/a")).toEqual([{ from: "adr/a", to: null, target: "adr/ghost", kind: "supersedes" }]);
  });

  test("an absolute-URL frontmatter ref dangles (treated as external, not path-resolved)", () => {
    const g = buildGraph([concept("adr/a", "type: ADR\nsupersedes: http://example.com/x.md")]);
    expect(edgesFrom(g.edges, "adr/a")).toEqual([
      { from: "adr/a", to: null, target: "http://example.com/x.md", kind: "supersedes" },
    ]);
  });

  test("a YAML-coerced numeric ref (unknown type) becomes a visible edge, not silently dropped", () => {
    // `type: Glossary` is unknown, so the schema does not constrain supersedes; the
    // numeric value must still surface as a (dangling) edge rather than vanish.
    const g = buildGraph([concept("g/x", "type: Glossary\nsupersedes: 123")]);
    expect(edgesFrom(g.edges, "g/x")).toEqual([{ from: "g/x", to: null, target: "123", kind: "supersedes" }]);
  });

  test("a bare-anchor frontmatter ref dangles, not resolving to the referring directory", () => {
    // Regression: "#section" reduces to "" — it must NOT resolve to the sibling
    // directory-named concept ("adr"), it must dangle.
    const g = buildGraph([concept("adr/a", "type: ADR\nsupersedes: '#section'"), ref("adr")]);
    expect(edgesFrom(g.edges, "adr/a")).toEqual([{ from: "adr/a", to: null, target: "#section", kind: "supersedes" }]);
  });

  test("a frontmatter ref strips a trailing ?query, like a body link", () => {
    const g = buildGraph([concept("adr/a", "type: ADR\nsupersedes: ../adr/old.md?v=2"), ref("adr/old")]);
    expect(edgesFrom(g.edges, "adr/a")[0]?.to).toBe("adr/old");
  });

  test("a percent-encoded ref is URL-decoded exactly once (no double decode)", () => {
    // %2520 decodes ONCE to %20, naming a concept id literally containing "%20";
    // a second decode would wrongly resolve to the space-bearing "adr/a b".
    const g = buildGraph([
      concept("adr/x", "type: ADR\nsupersedes: ../adr/a%2520b.md"),
      ref("adr/a b"),
      ref("adr/a%20b"),
    ]);
    expect(edgesFrom(g.edges, "adr/x")[0]?.to).toBe("adr/a%20b");
  });

  test("tasks are NOT edges (they point at Backlog, not concepts)", () => {
    const g = buildGraph([concept("stories/s", "type: Story\ntasks:\n  - LORE-1\n  - LORE-2")]);
    expect(g.edges).toEqual([]);
    expect(g.concepts.get("stories/s")?.frontmatter.tasks).toEqual(["LORE-1", "LORE-2"]);
  });

  test("blank/empty ref values produce no edge", () => {
    const g = buildGraph([concept("adr/a", "type: ADR\nsupersedes: []\nsuperseded_by:")]);
    expect(edgesFrom(g.edges, "adr/a")).toEqual([]);
  });
});

// ── resolveRef: dir-relative path wins over a same-string root id (LORE-134) ─────

describe("resolveRef — dir-relative path is tried before the bundle-root id", () => {
  test("a relative/.md-suffixed ref resolves dir-relative even when the same string also names a distinct root id", () => {
    // "sibling.md" is authored as a path relative to "notes/". Read bare (stripped of
    // its ".md"), it also equals the *different*, unrelated root concept "sibling".
    // Both concepts exist here: the intended dir-relative target "notes/sibling" must win.
    const g = buildGraph([
      concept("notes/x", "type: ADR\nsupersedes: sibling.md"),
      ref("notes/sibling"), // the intended dir-relative target
      ref("sibling"), // the decoy root id an id-first lookup would wrongly hit
    ]);
    expect(edgesFrom(g.edges, "notes/x")).toEqual([
      { from: "notes/x", to: "notes/sibling", target: "sibling.md", kind: "supersedes" },
    ]);
  });

  test("a bundle-relative id ref with no dir-relative match still falls back to id-form resolution", () => {
    // Regression guard: reordering must not break the legitimate id-authored form (what
    // `lore supersede` itself writes) when dir-joining the ref produces no real concept.
    const g = buildGraph([concept("notes/x", "type: ADR\nsupersedes: adr/old"), ref("adr/old")]);
    expect(edgesFrom(g.edges, "notes/x")).toEqual([
      { from: "notes/x", to: "adr/old", target: "adr/old", kind: "supersedes" },
    ]);
  });
});

// ── resolveRef: a bare bundle-root id is not shadowed by a mirroring dir (LORE-184) ─

describe("resolveRef — a suffix-less bare id wins over a dir-joined shadow", () => {
  test("a bare id ref resolves to the bundle-root concept even when a mirroring directory shadows it", () => {
    // "adr/old" is authored bare (the canonical `lore supersede`/rename form) by a concept
    // living in "notes/". Dir-joining it against "notes/" lands on "notes/adr/old", which
    // ALSO happens to be a real concept here (e.g. an archive/ tree mirroring the live one).
    // The bare id must still win — the shadow must not silently steal the ref.
    const g = buildGraph([
      concept("notes/x", "type: ADR\nsupersedes: adr/old"),
      ref("adr/old"), // the true, intended target of the bare id
      ref("notes/adr/old"), // the shadow at the dir-joined location
    ]);
    expect(edgesFrom(g.edges, "notes/x")).toEqual([
      { from: "notes/x", to: "adr/old", target: "adr/old", kind: "supersedes" },
    ]);
  });

  test("a dir-relative bare id with no root-id match still falls back to the dir-joined concept", () => {
    // Regression guard: the shape-first classifier must still resolve a bare ref that has
    // no matching root id but genuinely does dir-join to a real concept.
    const g = buildGraph([concept("notes/x", "type: ADR\nsupersedes: sibling"), ref("notes/sibling")]);
    expect(edgesFrom(g.edges, "notes/x")).toEqual([
      { from: "notes/x", to: "notes/sibling", target: "sibling", kind: "supersedes" },
    ]);
  });
});

// ── Cycle tolerance ──────────────────────────────────────────────────────────────

describe("buildGraph — cycle tolerance", () => {
  test("a two-node link cycle loads with both edges and no hang", () => {
    const g = buildGraph([ref("a", "[b](b.md)"), ref("b", "[a](a.md)")]);
    expect([...g.concepts.keys()]).toEqual(["a", "b"]);
    expect(g.edges).toEqual([
      { from: "a", to: "b", target: "b.md", kind: "link" },
      { from: "b", to: "a", target: "a.md", kind: "link" },
    ]);
  });

  test("a self-link is kept as a from==to edge", () => {
    const g = buildGraph([ref("a", "[self](a.md)")]);
    expect(g.edges).toEqual([{ from: "a", to: "a", target: "a.md", kind: "link" }]);
  });

  test("a supersession loop loads fine", () => {
    const g = buildGraph([
      concept("adr/a", "type: ADR\nsuperseded_by: adr/b"),
      concept("adr/b", "type: ADR\nsupersedes: adr/a"),
    ]);
    expect(g.edges.map((e) => `${e.from}->${e.to}`)).toEqual(["adr/a->adr/b", "adr/b->adr/a"]);
  });
});

// ── Path normalization ───────────────────────────────────────────────────────────

describe("buildGraph — path normalization", () => {
  test("a non-normalized concept path and a clean link resolve to the same id", () => {
    const target = concept("adr/./x.md", "type: Reference"); // id normalizes to adr/x
    const g = buildGraph([ref("adr/a", "[x](x.md)"), target]);
    expect(g.concepts.has("adr/x")).toBe(true);
    expect(edgesFrom(g.edges, "adr/a")[0]?.to).toBe("adr/x");
  });
});

// ── resolvePath: leading-`/` bundle-root resolution (LORE-133) ───────────────────

describe("resolvePath — leading-`/` targets resolve against the bundle root", () => {
  test("a /-absolute path resolves against the bundle root, not `dir`", () => {
    const byId = buildGraph([ref("reference/orders")]).concepts;
    expect(resolvePath("/reference/orders.md", "adr", byId)).toBe("reference/orders");
  });

  test("a plain relative path still resolves against `dir` unchanged (non-slash targets are unaffected)", () => {
    const byId = buildGraph([ref("adr/orders")]).concepts;
    expect(resolvePath("orders.md", "adr", byId)).toBe("adr/orders");
  });

  test("a /-absolute target is NOT the dir-joined concept, even when that concept also exists", () => {
    // Without the leading-`/` special case, resolvePath would join "adr" + "/reference/orders.md"
    // via posix.join — which does not treat an embedded leading slash as root-absolute — into
    // "adr/reference/orders.md", a real, *different* concept that also exists in this bundle. The
    // fix must resolve to the bundle-root concept instead of this dir-joined decoy.
    const g = buildGraph([
      ref("adr/x", "See [o](/reference/orders.md)."),
      ref("reference/orders"),
      ref("adr/reference/orders"), // the decoy a naive dir-join would hit
    ]);
    expect(edgesFrom(g.edges, "adr/x")).toEqual([
      { from: "adr/x", to: "reference/orders", target: "/reference/orders.md", kind: "link" },
    ]);
  });

  test("resolvePath (bundle.ts) and the check.ts link-check gate agree on the same concept for a /-absolute target", () => {
    // Same directory shape as above: a linking file two directories deep, a bundle-root concept
    // named by the /-absolute target, and a decoy at the dir-joined path — root-relative and
    // dir-relative resolution disagree here (they name two different, both-real concepts). The
    // fingerprint for "which concept did check.ts's gate resolve to" is the heading anchor: checkBundle
    // never exposes a resolved id directly, but a broken-anchor finding reveals a wrong resolution
    // (the decoy's heading slug does not match "root-heading").
    const linkBody = "See [o](/reference/orders.md#root-heading).";
    const rootFile: CheckInputFile = {
      path: "reference/orders.md",
      raw: "---\ntype: Reference\n---\n\n## Root Heading\n",
    };
    const decoyFile: CheckInputFile = {
      path: "adr/reference/orders.md",
      raw: "---\ntype: Reference\n---\n\n## Decoy Heading\n",
    };
    const linkingFile: CheckInputFile = { path: "adr/x.md", raw: `---\ntype: Reference\n---\n\n${linkBody}\n` };

    // check.ts's own gate: resolves cleanly, anchored against the root concept's heading.
    expect(checkBundle([linkingFile, rootFile, decoyFile]).errorCount).toBe(0);

    // bundle.ts's resolver, over the identical directory shape: lands on the same
    // "reference/orders" concept — not the decoy at the dir-joined path.
    const g = buildGraph([ref("adr/x", linkBody), ref("reference/orders"), ref("adr/reference/orders")]);
    expect(edgesFrom(g.edges, "adr/x")[0]?.to).toBe("reference/orders");
  });
});

// ── Token estimate ───────────────────────────────────────────────────────────────

describe("buildGraph — tokenEstimate", () => {
  test("per-concept is chars/4 of the canonical serialized bytes", () => {
    const c = ref("a", "hello");
    const g = buildGraph([c]);
    const serialized = "---\ntype: Reference\n---\nhello"; // canonical bytes for this concept
    expect(g.tokenEstimate("a")).toBe(Math.ceil(serialized.length / 4));
  });

  test("the whole-bundle estimate sums the per-concept estimates", () => {
    const g = buildGraph([ref("a", "one"), ref("b", "two")]);
    expect(g.tokenEstimate()).toBe(g.tokenEstimate("a") + g.tokenEstimate("b"));
  });

  test("an empty bundle estimates zero", () => {
    expect(buildGraph([]).tokenEstimate()).toBe(0);
  });

  test("throws not_found for an unknown id", () => {
    try {
      buildGraph([ref("a")]).tokenEstimate("nope");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("not_found");
      return;
    }
    throw new Error("expected a not_found LoreError");
  });
});

// ── conceptNotInBundle: the shared not_found hint ─────────────────────────────────

describe("conceptNotInBundle", () => {
  test("hints at `lore query`/`lore graph`, never `lore check` (LORE-259)", () => {
    // `link`/`unlink`, `tasks`, `supersede`, `lore rename`'s rewrite engine, and `lore graph`/
    // `context`'s subgraph traversal all surface a bad id through this ONE function — `lore check`
    // only prints a pass/fail summary count, never a concept-id listing, so pointing there was a
    // misdirecting hint; `lore query`/`lore graph` (run with no args) both actually list every id.
    const err = conceptNotInBundle("stories/ghost");
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("stories/ghost");
    expect(err.hint).toContain("lore query");
    expect(err.hint).toContain("lore graph");
    expect(err.hint).not.toContain("lore check");
  });
});

// ── loadBundle: filesystem integration ───────────────────────────────────────────

describe("loadBundle — filesystem", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** Materialize a `{ relpath: contents }` map under a fresh temp dir; return the root. */
  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "lore-bundle-"));
    roots.push(root);
    for (const [rel, contents] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, contents);
    }
    return root;
  }

  test("walks nested directories, ids are bundle-root-relative, edges resolve", () => {
    const root = fixture({
      "index.md": "---\ntype: Reference\n---\nroot [adr](adr/0001-x.md)",
      "adr/0001-x.md": "---\ntype: ADR\n---\nbody",
      "reference/r.md": "---\ntype: Reference\n---\nbody",
    });
    const g = loadBundle(root);
    expect([...g.concepts.keys()]).toEqual(["adr/0001-x", "index", "reference/r"]);
    expect(edgesFrom(g.edges, "index")).toEqual([
      { from: "index", to: "adr/0001-x", target: "adr/0001-x.md", kind: "link" },
    ]);
  });

  test("skips non-.md files and frontmatter-less markdown, warning on the latter", () => {
    const root = fixture({
      "index.md": "---\ntype: Reference\n---\nok",
      "adr/notes.md": "# Plain notes, no frontmatter\n",
      "notes.txt": "not markdown",
    });
    const warnings = new WarningCollector();
    const g = loadBundle(root, { warnings });
    expect([...g.concepts.keys()]).toEqual(["index"]);
    expect(warnings.list().some((w) => w.includes("adr/notes.md") && w.includes("no frontmatter"))).toBe(true);
  });

  test("skips a known-reserved stem (index/log) SILENTLY — no advisory, unlike a genuine non-concept file (LORE-258)", () => {
    // `adr/index.md` and `log.md` are lore's own machine-generated hubs (indexes.ts/log.ts) —
    // always frontmatter-less below the bundle root — so warning about them on every
    // loadBundle-backed command was spurious noise (LORE-258). A stray, unexpected non-concept
    // file (`adr/stray.md`) still warns: only the two reserved stems go quiet.
    const root = fixture({
      "index.md": "---\ntype: Reference\n---\nok",
      "adr/index.md": "# Generated hub, no frontmatter\n",
      "log.md": "# Generated changelog, no frontmatter\n",
      "adr/stray.md": "# An unexpected non-concept file\n",
    });
    const warnings = new WarningCollector();
    const g = loadBundle(root, { warnings });
    expect([...g.concepts.keys()]).toEqual(["index"]);
    const list = warnings.list();
    expect(list.some((w) => w.startsWith("skipping adr/index.md:"))).toBe(false);
    expect(list.some((w) => w.startsWith("skipping log.md:"))).toBe(false);
    expect(list.some((w) => w.includes("adr/stray.md") && w.includes("no frontmatter"))).toBe(true);
  });

  test("a malformed (mapping but invalid) concept throws validation, not a silent skip", () => {
    const root = fixture({ "bad.md": "---\ntitle: no type here\n---\nbody" });
    try {
      loadBundle(root);
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("validation");
      return;
    }
    throw new Error("expected a validation LoreError");
  });

  test("a non-concept doc that merely opens with a `---` thematic break is skipped, not crashed", () => {
    // Regression: such a doc parses to non-mapping/empty frontmatter; it must skip
    // (and warn), never abort the whole bundle load.
    const root = fixture({
      "index.md": "---\ntype: Reference\n---\nok",
      "notes.md": "---\n# Just a heading under a horizontal rule\n---\n\nbody prose",
    });
    const warnings = new WarningCollector();
    const g = loadBundle(root, { warnings });
    expect([...g.concepts.keys()]).toEqual(["index"]);
    expect(warnings.list().some((w) => w.includes("notes.md"))).toBe(true);
  });

  test("an unreadable SUBdirectory is warned and skipped, not fatal", () => {
    const root = fixture({
      "index.md": "---\ntype: Reference\n---\nok",
      "locked/secret.md": "---\ntype: Reference\n---\nbody",
    });
    const locked = join(root, "locked");
    try {
      chmodSync(locked, 0o000);
    } catch {
      return; // chmod unavailable — skip
    }
    try {
      const warnings = new WarningCollector();
      const g = loadBundle(root, { warnings });
      // Running as root ignores perms and reads the dir; only assert when it was denied.
      if (g.concepts.has("locked/secret")) {
        return;
      }
      expect(g.concepts.has("index")).toBe(true);
      expect(warnings.list().some((w) => w.includes("locked") && w.includes("unreadable"))).toBe(true);
    } finally {
      chmodSync(locked, 0o755); // restore so afterAll cleanup can remove it
    }
  });

  test("an unreadable bundle ROOT is a denied error", () => {
    const root = fixture({ "r.md": "---\ntype: Reference\n---\nbody" });
    try {
      chmodSync(root, 0o000);
    } catch {
      return; // chmod unavailable — skip
    }
    try {
      let caught: unknown;
      try {
        loadBundle(root);
      } catch (err) {
        caught = err;
      }
      if (!(caught instanceof LoreError)) {
        return; // running as root (perms ignored)
      }
      expect(caught.type).toBe("denied");
    } finally {
      chmodSync(root, 0o755); // restore so afterAll cleanup can remove it
    }
  });

  test("collects only lowercase `.md`; an uppercase `.MD` file is not a concept", () => {
    // Matching `.MD` too would fold `Foo.md`/`Foo.MD` to one id on Linux (a spurious
    // conflict); the walk is lowercase-only so the id space is collision-free.
    const root = fixture({
      "a.md": "---\ntype: Reference\n---\nok",
      "b.MD": "---\ntype: Reference\n---\nignored",
    });
    expect([...loadBundle(root).concepts.keys()]).toEqual(["a"]);
  });

  test("is deterministic: two loads of the same tree are deep-equal", () => {
    const root = fixture({
      "a.md": "---\ntype: Reference\n---\n[b](b.md)",
      "b.md": "---\ntype: Reference\n---\n[a](a.md)",
    });
    const first = loadBundle(root);
    const second = loadBundle(root);
    expect([...first.concepts.keys()]).toEqual([...second.concepts.keys()]);
    expect(first.edges).toEqual(second.edges);
    expect(first.tokenEstimate()).toBe(second.tokenEstimate());
  });

  test("does not follow a symlinked directory (no walk loop) and warns about it", () => {
    const root = fixture({ "real/r.md": "---\ntype: Reference\n---\nbody" });
    try {
      symlinkSync(root, join(root, "loop"), "dir"); // a symlink pointing back at the root
    } catch {
      return; // symlinks unavailable in this environment — skip the assertion
    }
    const warnings = new WarningCollector();
    const g = loadBundle(root, { warnings });
    expect([...g.concepts.keys()]).toEqual(["real/r"]);
    expect(warnings.list().some((w) => w.includes("loop") && w.includes("symlink"))).toBe(true);
  });

  test("loads a concept whose opening fence line has trailing whitespace", () => {
    // gray-matter parses a "--- \n" fence to a mapping; tryParseConcept must load it.
    const root = fixture({ "x.md": "--- \ntype: Reference\n---\nbody" });
    const warnings = new WarningCollector();
    const g = loadBundle(root, { warnings });
    expect([...g.concepts.keys()]).toEqual(["x"]);
    expect(warnings.list().some((w) => w.includes("no frontmatter"))).toBe(false);
  });

  test("throws not_found for a missing bundle root", () => {
    try {
      loadBundle(join(tmpdir(), "lore-bundle-does-not-exist-xyz"));
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("not_found");
      return;
    }
    throw new Error("expected a not_found LoreError");
  });

  test("loads the project's own docs/ bundle without error", () => {
    // The real bundle is a useful smoke test: it must parse and graph cleanly.
    const g = loadBundle("docs");
    expect(g.concepts.size).toBeGreaterThan(10);
    expect(g.concepts.has("reference/architecture")).toBe(true);
    expect(g.tokenEstimate()).toBeGreaterThan(0);
  });

  test("validates against the passed-in custom profile, not the built-in default (LORE-84)", () => {
    // A "Widget" concept missing its custom-required "owner" field: the built-in default profile
    // doesn't know the "Widget" type at all, so it's tolerated (unknown-type warning only, no
    // field check) — the very silent-pass this bug produced. Passing the custom profile that DOES
    // declare Widget.owner as required must make the exact same file fail validation instead.
    const root = fixture({ "widget.md": "---\ntype: Widget\n---\nbody" });
    const profile = compileProfile(
      parseProfile(
        {
          profile: { name: "custom", okf_version: "0.1" },
          base: { fields: { type: { required: true } } },
          types: [{ name: "Widget", fields: { owner: { required: true } } }],
        },
        "test-profile",
      ),
    );

    // Without the custom profile: silently tolerated as an unknown type — the pre-fix behavior for
    // every loadBundle caller, since loadBundle never had a way to receive a project's profile.
    const withoutProfile = loadBundle(root);
    expect(withoutProfile.concepts.has("widget")).toBe(true);

    // With the custom profile forwarded: the now-known "Widget" type's required "owner" is enforced.
    try {
      loadBundle(root, { profile });
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("validation");
      expect((err as LoreError).message).toContain("owner");
      return;
    }
    throw new Error("expected a validation LoreError");
  });

  test("a concept satisfying the custom profile's required field loads cleanly", () => {
    const root = fixture({ "widget.md": "---\ntype: Widget\nowner: alice\n---\nbody" });
    const profile = compileProfile(
      parseProfile(
        {
          profile: { name: "custom", okf_version: "0.1" },
          base: { fields: { type: { required: true } } },
          types: [{ name: "Widget", fields: { owner: { required: true } } }],
        },
        "test-profile",
      ),
    );
    const g = loadBundle(root, { profile });
    expect(g.concepts.get("widget")?.type).toBe("Widget");
  });
});
