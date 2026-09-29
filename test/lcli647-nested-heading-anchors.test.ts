/**
 * LCLI-647 (DEC-22 option A, accepted first-party at opum-agent origin/main): a heading nested in a
 * blockquote or a list item IS a valid anchor target, so the RENDERER must resolve what the
 * validator (`headingSlugs`) admits — one shared heading enumeration and slug sequence.
 *
 * Before the fix the renderer read top-level headings only and threw a PLAIN `Error` when the
 * search missed, which the CLI reported as an uncaught exit 1 with zero bytes of stdout, for a
 * profile the validator had accepted (LCLI-642 review F1).
 *
 * Tag map, so a mutation of the shared enumeration can be PREDICTED from this file alone:
 *
 *   [nested]        2 cases: blockquote- and list-item-nested anchors resolve -> RED if the renderer
 *                   goes back to top-level-only headings.
 *   [shift]         1 case: the slug-shift shape — a blockquoted duplicate takes `overview`, the
 *                   real top-level heading becomes `overview-1` -> RED if the renderer's slug
 *                   sequence stops matching the validator's.
 *   [scope]         3 cases: (a) a nested heading's region stops at its container -> RED if the
 *                   region runs past the blockquote again; (b) a heading nested deeper inside the
 *                   region does not cut it short (review F1) -> RED if scope is compared by
 *                   container END OFFSET, which collides whenever a container ends its parent;
 *                   (c) a nested region never ends with a dangling container marker (review F2)
 *                   -> RED if the line-start trim is dropped.
 *   [breadcrumb]    2 cases: the scope-aware trail -> RED (both) if the pop becomes unqualified
 *                   again (a nested H1 evicts its enclosing section, `"Overview"` where
 *                   `"Dup > Overview"` is true), and RED if a nested entry keeps parenting the
 *                   following top-level one (`Overview > Overview`).
 *   [classifiable]  1 case: an anchor the renderer cannot resolve -> RED if the refusal goes back to
 *                   a plain Error (uncaught/1, empty stdout) instead of LoreError(validation/6).
 *   [control]       2 cases: the vendored pre-fix resolver, run in the same invocation -> RED if the
 *                   control stops reproducing the pre-fix throw, or drifts toward the current code.
 *   [agreement]     1 case: every slug `headingSlugs` reports for the shift fixture resolves through
 *                   the CLI -> RED if the two enumerations diverge again.
 *
 * Measured against that map, over the 12 cases here (re-measured 2026-09-29 after the review-F1/F2
 * fixes and the fix-verification pass): F1's defect restored (scope compared by container end
 * offset) reddens exactly 1 of 12, its own case; dropping the line-start trim (F2's defect) reddens
 * exactly 1 of 12, its own case; making the breadcrumb pop unqualified again reddens exactly 2 of
 * 12, both [breadcrumb] cases; dropping scope-awareness (region bound and breadcrumb container pop)
 * reddens 3 of 12 — [scope]-container-bound and both [breadcrumb] cases; taking BOTH readers back to
 * top-level-only headings (the pre-fix enumeration) reddens 9 of 12 — every case except
 * [classifiable], the [breadcrumb]-enclosing case (it anchors a TOP-level heading, so it is
 * insensitive to nested support), and the static vendored-source check. No figure is inferred from
 * another.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { run } from "../src/cli";
import { headingSlugs } from "../src/core/agent-profile";
import { EXIT_CODES, EXIT_UNCAUGHT, reportError } from "../src/errors";
import { capture } from "./helpers";

/** `concept.body` of `docs/reference/nested.md`: a quoted heading, and a listed heading. */
const NESTED_BODY = [
  "# Nested",
  "",
  "Intro.",
  "",
  "> ## Quoted heading",
  ">",
  "> Body of the quote.",
  "",
  "After the quote.",
  "",
  "## Real section",
  "",
  "Real body.",
  "",
  "- item",
  "",
  "  ### Listed heading",
  "",
  "  List body.",
  "",
].join("\n");

/** `concept.body` of `docs/reference/dup.md`: the blockquoted `# Overview` takes `overview`. */
const DUP_BODY = ["# Dup", "", "> # Overview", "", "## Overview", "", "Real overview body.", ""].join("\n");

/** The vendored pre-fix resolver; see its header for provenance. */
const PRE_CHANGE = resolve(import.meta.dir, "fixtures", "lcli647", "region-for-reference.pre-change.mjs");

interface ControlModule {
  regionForReference(body: string, anchor?: string): { readonly body: string; readonly breadcrumb?: string };
}

interface SectionItem {
  readonly reference: string;
  readonly breadcrumb?: string;
  readonly body: string;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-lcli647-"));
  mkdirSync(join(root, "docs/reference"), { recursive: true });
  mkdirSync(join(root, ".lore/agents"), { recursive: true });
  writeFileSync(join(root, "docs/index.md"), "# Docs\n\nRoot.\n");
  writeFileSync(join(root, "docs/reference/nested.md"), `---\ntype: Reference\ntitle: Nested\n---\n\n${NESTED_BODY}`);
  writeFileSync(join(root, "docs/reference/dup.md"), `---\ntype: Reference\ntitle: Dup\n---\n\n${DUP_BODY}`);
  writeFileSync(join(root, "docs/reference/big.md"), "---\ntype: Reference\ntitle: Big\n---\n\n# Big\n\nBig body.\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeProfile(name: string, sources: readonly string[]): void {
  const list = sources.map((source) => `  "${source}",`).join("\n");
  writeFileSync(
    join(root, ".lore/agents", `${name}.toml`),
    `schema_version = 1\nname = "${name}"\ndescription = "fixture profile ${name}"\nkind = "specialist"\nmax_tokens = 4000\nsources = [\n${list}\n]\n`,
  );
}

/** Drive the real CLI router, the same seam `bin/lore.cjs` wraps. */
async function runCli(args: readonly string[]): Promise<{ code: number; out: string; err: string }> {
  const stdout = capture();
  const stderr = capture();
  const code = await run(["bun", "lore", ...args], { cwd: root, stdout, stderr, isTTY: false });
  return { code, out: stdout.text(), err: stderr.text() };
}

async function contextSection(
  profile: string,
): Promise<{ code: number; out: string; err: string; section: SectionItem }> {
  const result = await runCli(["agent", "context", profile, "--task", "probe the nested heading", "--json"]);
  const envelope = JSON.parse(result.out) as { data: { sections: SectionItem[] } };
  return { ...result, section: envelope.data.sections[0] as SectionItem };
}

describe("LCLI-647: nested headings are valid anchor targets (DEC-22 A)", () => {
  test("[nested] an anchor on a heading inside a blockquote resolves to the quoted region", async () => {
    writeProfile("quote", ["reference/nested#quoted-heading"]);
    const { code, section } = await contextSection("quote");
    expect(code).toBe(0);
    expect(section.body).toContain("## Quoted heading");
    expect(section.body).toContain("Body of the quote.");
    expect(section.breadcrumb).toBe("Nested > Quoted heading");
  });

  test("[nested] an anchor on a heading inside a list item resolves to the listed region", async () => {
    writeProfile("listed", ["reference/nested#listed-heading"]);
    const { code, section } = await contextSection("listed");
    expect(code).toBe(0);
    expect(section.body).toContain("### Listed heading");
    expect(section.body).toContain("List body.");
  });

  test("[shift] a nested duplicate heading does not push the real heading's slug out of reach", async () => {
    // `> # Overview` takes `overview`; the real top-level `## Overview` becomes `overview-1`. The
    // anchor here names the SHIFTED slug: the validator admits it, so the renderer must resolve it
    // — and to the real heading, not to the quoted one.
    writeProfile("shift", ["reference/dup#overview-1"]);
    const { code, section } = await contextSection("shift");
    expect(code).toBe(0);
    expect(section.body).toBe("## Overview\n\nReal overview body.\n");
  });

  test("[scope] a nested heading's region stops at its container", async () => {
    // "After the quote." follows the blockquote at top level; it is not part of the quoted section.
    writeProfile("quote", ["reference/nested#quoted-heading"]);
    const { section } = await contextSection("quote");
    expect(section.body).not.toContain("After the quote.");
  });

  test("[scope] a heading nested deeper inside the region does not cut it short (review F1)", async () => {
    // The collision: a blockquote that ENDS a list item shares that item's end offset, and comparing
    // container end OFFSETS treated the quote's heading as a sibling of the item's, truncating the
    // region at the quote's first line and silently dropping the whole quoted section. Scope is
    // compared by container IDENTITY now, so the item's region runs to the item's end.
    writeFileSync(
      join(root, "docs/reference/collide.md"),
      [
        "---",
        "type: Reference",
        "title: Collide",
        "---",
        "",
        "# Registry",
        "",
        "- ## Alpha",
        "",
        "  Alpha body.",
        "",
        "  > ## Legacy note",
        "  >",
        "  > Legacy body.",
        "",
      ].join("\n"),
    );
    writeProfile("alpha", ["reference/collide#alpha"]);
    const { code, section } = await contextSection("alpha");
    expect(code).toBe(0);
    // trimEnd() because this case's subject is NOT where the region ends (the container's end vs
    // EOF is the first [scope] case above): under a region that runs to EOF the same content carries one
    // trailing newline, and pinning that here would red this case for a reason it does not test.
    expect(section.body.trimEnd()).toBe("## Alpha\n\n  Alpha body.\n\n  > ## Legacy note\n  >\n  > Legacy body.");
  });

  test("[scope] a nested region does not end with a dangling container marker (review F2)", async () => {
    // `> # A ... > # B`: the terminator's own line begins with its container marker, so a slice
    // ending at the heading's offset left a dangling `"> "` tail. The region ends at the START of
    // that line; the tail below is a complete quoted line, not a marker fragment.
    writeFileSync(
      join(root, "docs/reference/siblings.md"),
      [
        "---",
        "type: Reference",
        "title: Siblings",
        "---",
        "",
        "> # A",
        ">",
        "> body A",
        ">",
        "> # B",
        ">",
        "> body B",
        "",
      ].join("\n"),
    );
    writeProfile("siblings", ["reference/siblings#a"]);
    const { section } = await contextSection("siblings");
    expect(section.body).toBe("# A\n>\n> body A\n>\n");
    expect(section.body.endsWith("> ")).toBe(false);
  });

  test("[breadcrumb] a quoted heading neither parents the top-level heading nor evicts its ancestor", async () => {
    // `## Overview` is a subsection of `# Dup`; the quoted `# Overview` is scoped to its blockquote.
    // An unqualified depth pop let that nested H1 evict `Dup` on push, and the later container pop
    // left the trail as bare "Overview" (fix-verification finding 1); the true trail keeps Dup.
    writeProfile("shift", ["reference/dup#overview-1"]);
    const { section } = await contextSection("shift");
    expect(section.breadcrumb).toBe("Dup > Overview");
  });

  test("[breadcrumb] a nested heading one level down keeps its enclosing section on the trail", async () => {
    // The shape that forced the qualified pop, with no duplicate slug involved: `# Doc`, a quoted
    // `# Nested`, then the real `## Target`, whose trail must keep `Doc`.
    writeFileSync(
      join(root, "docs/reference/enclosing.md"),
      [
        "---",
        "type: Reference",
        "title: Enclosing",
        "---",
        "",
        "# Doc",
        "",
        "> # Nested",
        "",
        "## Target",
        "",
        "text",
        "",
      ].join("\n"),
    );
    writeProfile("enclosing", ["reference/enclosing#target"]);
    const { section } = await contextSection("enclosing");
    expect(section.breadcrumb).toBe("Doc > Target");
  });

  test("[classifiable] an unresolvable anchor is a LoreError refusal, not an uncaught crash", async () => {
    // The validator deliberately skips qualified references, so a typo'd anchor on one reaches the
    // renderer; it must be reported as validation/6 with empty stdout — never uncaught/1.
    writeProfile("typo", ["other-member::reference/big#no-such-heading"]);
    const { code, out, err } = await runCli([
      "agent",
      "context",
      "typo",
      "--task",
      "probe the nested heading",
      "--json",
    ]);
    expect(code).toBe(EXIT_CODES.validation);
    expect(out).toBe("");
    // The fixture's docs warn about missing summaries first; the envelope is the last stderr line.
    const envelope = JSON.parse(err.trim().split("\n").at(-1) as string) as {
      error_type: string;
      input?: { anchor?: string };
    };
    expect(envelope.error_type).toBe("validation");
    expect(envelope.error_type).not.toBe("uncaught");
    expect(envelope.input?.anchor).toBe("no-such-heading");
  });

  test("[control] the vendored pre-fix resolver reproduces the defect in the same invocation", async () => {
    const control = (await import(pathToFileURL(PRE_CHANGE).href)) as ControlModule;

    // The control is a control: it still cannot resolve a nested anchor, and its failure is a
    // PLAIN Error — the thing the CLI maps to uncaught/1 with empty stdout.
    for (const [body, anchor] of [
      [NESTED_BODY, "quoted-heading"],
      [NESTED_BODY, "listed-heading"],
      [DUP_BODY, "overview-1"],
    ] as const) {
      let thrown: unknown;
      try {
        control.regionForReference(body, anchor);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).name).toBe("Error");
      expect((thrown as Error).message).toBe(`validated heading disappeared: ${anchor}`);
      const stderr = capture();
      expect(reportError(thrown, { json: true, stderr })).toBe(EXIT_UNCAUGHT);
      expect(JSON.parse(stderr.text())).toMatchObject({ error_type: "uncaught" });
    }

    // ...while the current build, on the same body and anchor, compiles. Both halves in one run is
    // the pair that says the fixture reproduces the defect AND that the fix addresses it.
    writeProfile("quote", ["reference/nested#quoted-heading"]);
    const { code, out, section } = await contextSection("quote");
    expect(code).toBe(0);
    expect(out.length).toBeGreaterThan(0);
    expect(section.body).toContain("Body of the quote.");
  });

  test("[agreement] every slug headingSlugs reports resolves through the renderer", async () => {
    const slugs = [...headingSlugs(DUP_BODY)].sort();
    // Positive control on the fixture: the shift actually happened, or the property below is empty.
    expect(slugs).toEqual(["dup", "overview", "overview-1"]);
    for (const slug of slugs) {
      writeProfile(`agree-${slug}`, [`reference/dup#${slug}`]);
      const { code, section } = await contextSection(`agree-${slug}`);
      expect(code).toBe(0);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });
});

// What THIS case alone proves is that the vendored file carries the pre-fix resolver's source, by
// distinctive bytes; a file that merely mentioned those strings in a comment would satisfy it. The
// BEHAVIOUR that makes it a control is enforced by the dynamic case above, which drives the module
// and requires its throw and the current build's success on identical bytes (review F4).
test("[control] the vendored file carries the pre-fix resolver source (behaviour is enforced by the dynamic case)", () => {
  const vendored = readFileSync(PRE_CHANGE, "utf8");
  expect(vendored).toContain("throw new Error(");
  expect(vendored).toContain("validated heading disappeared:");
  expect(vendored).toContain('tree.children.filter((child) => child.type === "heading")');
  const current = readFileSync(resolve(import.meta.dir, "..", "src", "core", "agent-context.ts"), "utf8");
  expect(current).not.toContain("validated heading disappeared");
});
