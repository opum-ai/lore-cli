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
 *   [scope]         1 case: a nested heading's region stops at its container -> RED if the region
 *                   runs past the blockquote again.
 *   [breadcrumb]    1 case: the scope-aware trail -> RED if a nested heading parents the following
 *                   top-level one again (`Overview > Overview`).
 *   [classifiable]  1 case: an anchor the renderer cannot resolve -> RED if the refusal goes back to
 *                   a plain Error (uncaught/1, empty stdout) instead of LoreError(validation/6).
 *   [control]       2 cases: the vendored pre-fix resolver, run in the same invocation -> RED if the
 *                   control stops reproducing the pre-fix throw, or drifts toward the current code.
 *   [agreement]     1 case: every slug `headingSlugs` reports for the shift fixture resolves through
 *                   the CLI -> RED if the two enumerations diverge again.
 *
 * Measured against that map. Dropping scope-awareness (region bound and breadcrumb container pop)
 * reddens exactly 2 of 9 — [scope] and [breadcrumb] — with the rest correctly green, because the
 * nested anchors still resolve and every other assertion is untouched by that clause. Taking BOTH
 * sides back to top-level-only headings (the pre-fix enumeration) reddens 7 of 9: every case except
 * [classifiable] and the vendored-file check. Neither figure is inferred from the other.
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

  test("[breadcrumb] a quoted heading does not parent the top-level heading that follows it", async () => {
    writeProfile("shift", ["reference/dup#overview-1"]);
    const { section } = await contextSection("shift");
    expect(section.breadcrumb).toBe("Overview");
    expect(section.breadcrumb).not.toContain(" > ");
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

// The vendored control is not the current implementation, checked by distinctive bytes rather than
// trusted: the pre-fix resolver's top-level filter and plain throw, and the current source's
// absence of them, so a copy that drifted toward the current code is caught.
test("[control] the vendored file is the pre-fix resolver, not a copy of the current one", () => {
  const vendored = readFileSync(PRE_CHANGE, "utf8");
  expect(vendored).toContain("throw new Error(");
  expect(vendored).toContain("validated heading disappeared:");
  expect(vendored).toContain('tree.children.filter((child) => child.type === "heading")');
  const current = readFileSync(resolve(import.meta.dir, "..", "src", "core", "agent-context.ts"), "utf8");
  expect(current).not.toContain("validated heading disappeared");
});
