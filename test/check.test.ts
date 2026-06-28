import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { runCheck } from "../src/commands/check";
import { type CheckInputFile, checkBundle, extractHeadingSlugs, slugify } from "../src/core/check";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

/** A minimal Reference concept with the given body, for membership/anchor fixtures. */
function ref(title: string, body: string): string {
  return `---\ntype: Reference\ntitle: ${title}\nsummary: A ref.\ntimestamp: 2026-06-21T00:00:00Z\n---\n\n# ${title}\n\n${body}\n`;
}

/** The `issue`-free shorthand: the set of rules a bundle produces. */
function rules(files: CheckInputFile[]): string[] {
  return checkBundle(files).findings.map((f) => f.rule);
}

// ── slugify: GitHub-style heading slugs ──────────────────────────────────────────

describe("slugify — GitHub-style slugs", () => {
  test.each([
    ["Archival Policy", "archival-policy"],
    ["Hello, World!", "hello-world"],
    ["Status: Done", "status-done"],
    ["  Trim Me  ", "trim-me"],
    ["Multiple   spaces", "multiple---spaces"],
    ["snake_case-and-dash", "snake_case-and-dash"],
  ])("slugifies %p to %p", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  test("keeps unicode letters (Café stays café, not caf)", () => {
    expect(slugify("Café Münü")).toBe("café-münü");
  });
});

// ── extractHeadingSlugs ──────────────────────────────────────────────────────────

describe("extractHeadingSlugs", () => {
  test("collects a slug per heading at every depth", () => {
    const slugs = extractHeadingSlugs("# Top\n\n## Archival Policy\n\n### Deep One\n");
    expect([...slugs].sort()).toEqual(["archival-policy", "deep-one", "top"]);
  });

  test("de-duplicates repeated headings GitHub-style (-1, -2)", () => {
    const slugs = extractHeadingSlugs("# Intro\n\n## Intro\n\n## Intro\n");
    expect([...slugs].sort()).toEqual(["intro", "intro-1", "intro-2"]);
  });

  test("a deduped slug that collides with a natural slug skips ahead (github-slugger loop)", () => {
    // "Release" / "Release 1" / "Release": the 2nd "Release" must become release-2, not a
    // second release-1 that would shadow the real "Release 1" anchor.
    const slugs = extractHeadingSlugs("# Release\n\n## Release 1\n\n## Release\n");
    expect([...slugs].sort()).toEqual(["release", "release-1", "release-2"]);
  });

  test("a `#` inside a fenced code block is not a heading", () => {
    const slugs = extractHeadingSlugs("# Real\n\n```\n# not a heading\n```\n");
    expect([...slugs]).toEqual(["real"]);
  });

  test("concatenates inline-code text in a heading", () => {
    const slugs = extractHeadingSlugs("## The `foo` bar\n");
    expect([...slugs]).toEqual(["the-foo-bar"]);
  });
});

// ── checkBundle: internal cross-link gate ────────────────────────────────────────

describe("checkBundle — internal cross-link existence (error tier)", () => {
  const orders: CheckInputFile = { path: "reference/orders.md", raw: ref("Orders", "## Archival Policy\n\nText.") };

  test("a link to a real bundle file is clean", () => {
    const adr: CheckInputFile = { path: "adr/x.md", raw: ref("X", "See [orders](../reference/orders.md).") };
    expect(checkBundle([adr, orders]).errorCount).toBe(0);
  });

  test("a link to a missing file is a broken-link error", () => {
    const adr: CheckInputFile = { path: "adr/x.md", raw: ref("X", "See [ghost](../reference/ghost.md).") };
    const report = checkBundle([adr, orders]);
    expect(report.errorCount).toBe(1);
    expect(report.findings[0]?.rule).toBe("broken-link");
  });

  test("resolves a forward reference (target walked after the linking file)", () => {
    const a: CheckInputFile = { path: "a.md", raw: ref("A", "See [b](b.md).") };
    const b: CheckInputFile = { path: "b.md", raw: ref("B", "Body.") };
    expect(checkBundle([a, b]).errorCount).toBe(0);
  });

  test("a reserved, frontmatter-free index.md hub link resolves (the LORE-29/LORE-27 case)", () => {
    const hub: CheckInputFile = { path: "reference/index.md", raw: "# Reference\n\nA hub.\n" };
    const adr: CheckInputFile = { path: "adr/x.md", raw: ref("X", "See [hub](../reference/index.md).") };
    expect(checkBundle([adr, hub]).errorCount).toBe(0);
  });

  test("an external URL is not an internal link (skipped)", () => {
    const adr: CheckInputFile = { path: "adr/x.md", raw: ref("X", "See [site](https://example.com/x.md).") };
    expect(checkBundle([adr]).errorCount).toBe(0);
  });

  test("a non-.md asset link is not a concept edge (skipped)", () => {
    const adr: CheckInputFile = { path: "adr/x.md", raw: ref("X", "See [img](../img/diagram.png).") };
    expect(checkBundle([adr]).errorCount).toBe(0);
  });

  test("a cross-bundle ../-escaping link is out of scope (skipped, not broken)", () => {
    const adr: CheckInputFile = { path: "x.md", raw: ref("X", "See [task](../backlog/tasks/task-1.md).") };
    expect(checkBundle([adr]).errorCount).toBe(0);
  });

  test("a /-absolute link resolves against the bundle root, not the linking dir", () => {
    // The link is non-portable (a leading-slash portability warning), but its existence must be
    // judged from the bundle root — so a real root-relative target is found, and a missing one
    // names the right path.
    const adr: CheckInputFile = { path: "adr/x.md", raw: ref("X", "See [o](/reference/orders.md).") };
    const report = checkBundle([adr, orders]);
    expect(report.errorCount).toBe(0); // reference/orders.md exists at the root
    expect(report.findings.some((f) => f.rule === "portability")).toBe(true); // still flagged non-portable
  });

  test("a /-absolute link to a missing root target reports the root-relative path", () => {
    const adr: CheckInputFile = { path: "adr/x.md", raw: ref("X", "See [g](/reference/ghost.md).") };
    const broken = checkBundle([adr, orders]).findings.find((f) => f.rule === "broken-link");
    expect(broken?.message).toContain("reference/ghost.md");
  });
});

// ── checkBundle: heading-anchor validation (AC#1) ────────────────────────────────

describe("checkBundle — anchor rot (AC#1)", () => {
  const orders: CheckInputFile = { path: "reference/orders.md", raw: ref("Orders", "## Archival Policy\n\nText.") };

  test("a link to a real heading anchor is clean", () => {
    const adr: CheckInputFile = {
      path: "adr/x.md",
      raw: ref("X", "See [policy](../reference/orders.md#archival-policy)."),
    };
    expect(checkBundle([adr, orders]).errorCount).toBe(0);
  });

  test("AC#1: a link to a nonexistent heading anchor is a broken-anchor error", () => {
    const adr: CheckInputFile = {
      path: "adr/x.md",
      raw: ref("X", "See [gone](../reference/orders.md#nonexistent)."),
    };
    const report = checkBundle([adr, orders]);
    expect(report.errorCount).toBe(1);
    expect(report.findings[0]?.rule).toBe("broken-anchor");
  });

  test("a same-file anchor resolves against the file's own headings", () => {
    const doc: CheckInputFile = {
      path: "x.md",
      raw: ref("X", "Jump to [policy](#archival-policy).\n\n## Archival Policy"),
    };
    expect(checkBundle([doc]).errorCount).toBe(0);
  });

  test("AC#1: a rotted same-file anchor is a broken-anchor error", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "Jump to [gone](#no-such-heading).") };
    const report = checkBundle([doc]);
    expect(report.errorCount).toBe(1);
    expect(report.findings[0]?.rule).toBe("broken-anchor");
  });

  test("anchor matching is case-insensitive and decode-tolerant", () => {
    const orders2: CheckInputFile = { path: "reference/orders.md", raw: ref("Orders", "## Archival Policy") };
    const adr: CheckInputFile = {
      path: "adr/x.md",
      raw: ref("X", "See [p](../reference/orders.md#Archival-Policy)."),
    };
    expect(checkBundle([adr, orders2]).errorCount).toBe(0);
  });
});

// ── checkBundle: portability lint (AC#2, warn tier) ──────────────────────────────

describe("checkBundle — portability warnings (AC#2)", () => {
  test("AC#2: a wikilink is a portability warning, not an error", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "See [[orders]] for more.") };
    const report = checkBundle([doc]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(1);
    expect(report.findings[0]?.rule).toBe("portability");
    expect(report.findings[0]?.message).toContain("wikilink");
  });

  test("AC#2: an embed is a portability warning", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "Inline ![[diagram.png]] here.") };
    const finding = checkBundle([doc]).findings.find((f) => f.message.includes("embed"));
    expect(finding?.severity).toBe("warning");
  });

  test("AC#2: a callout is a portability warning", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "> [!note] Heads up\n> body") };
    const finding = checkBundle([doc]).findings.find((f) => f.message.includes("callout"));
    expect(finding?.severity).toBe("warning");
  });

  test.each([
    ["==highlight==", "highlight"],
    ["%% hidden %%", "comment"],
  ])("flags Obsidian-ism %p as a warning", (snippet, needle) => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", `Text with ${snippet} inside.`) };
    const finding = checkBundle([doc]).findings.find((f) => f.message.includes(needle));
    expect(finding?.severity).toBe("warning");
  });

  test("a callout `[!type]` mid-prose is NOT a callout (no false positive)", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "Please mark it [!important] in the tracker.") };
    expect(checkBundle([doc]).warningCount).toBe(0);
  });

  test("a wikilink inside an inline code span is NOT flagged (code is excluded)", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "Use `[[orders]]` syntax in code.") };
    expect(checkBundle([doc]).warningCount).toBe(0);
  });

  test("a non-portable link form surfaces as a portability warning", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "See [raw](../a%20b/c%20d.md)?") };
    // The %20-encoded link is portable; an unencoded one warns.
    const bad: CheckInputFile = { path: "x.md", raw: ref("X", "Bad [raw](orders) link.") };
    expect(checkBundle([doc]).warningCount).toBe(0);
    expect(checkBundle([bad]).findings.some((f) => f.rule === "portability")).toBe(true);
  });
});

describe("checkBundle — clean bundle and aggregation", () => {
  test("a clean bundle yields no findings", () => {
    const a: CheckInputFile = { path: "reference/orders.md", raw: ref("Orders", "## Archival Policy") };
    const b: CheckInputFile = {
      path: "adr/x.md",
      raw: ref("X", "See [orders](../reference/orders.md#archival-policy)."),
    };
    const report = checkBundle([a, b]);
    expect(report.findings).toEqual([]);
    expect(report.fileCount).toBe(2);
  });

  test("counts errors and warnings independently", () => {
    const doc: CheckInputFile = { path: "x.md", raw: ref("X", "[ghost](ghost.md) and [[wikilink]].") };
    const report = checkBundle([doc]);
    expect(report.errorCount).toBe(1);
    expect(report.warningCount).toBe(1);
    expect(rules([doc]).sort()).toEqual(["broken-link", "portability"]);
  });

  test("a file opening with an unclosed frontmatter fence is scanned as all-body", () => {
    // No closing `---`: bodyText treats the whole file as body, so its links are still checked.
    const doc: CheckInputFile = { path: "x.md", raw: "---\ntype: ADR\n\nSee [ghost](ghost.md).\n" };
    const report = checkBundle([doc]);
    expect(report.errorCount).toBe(1);
    expect(report.findings[0]?.rule).toBe("broken-link");
  });
});

// ── Command layer: runCheck ──────────────────────────────────────────────────────

describe("runCheck — exit codes and discovery", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-check-"));
    mkdirSync(join(root, "docs", "reference"), { recursive: true });
    mkdirSync(join(root, "docs", "adr"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
    writeFileSync(join(root, "docs", "reference", "orders.md"), ref("Orders", "## Archival Policy\n\nText."));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function opts(args: string[], output: OutputContext = PLAIN_CTX) {
    return { root, output, args, stdout: capture(), stderr: capture() };
  }

  test("exit 0 on a coherent bundle", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[orders](../reference/orders.md#archival-policy)."));
    expect(runCheck(opts([]))).toBe(EXIT_OK);
  });

  test("exit 6 on a broken internal link", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[ghost](../reference/ghost.md)."));
    expect(runCheck(opts([]))).toBe(EXIT_CODES.validation);
  });

  test("exit 6 on a rotted anchor (AC#1)", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[bad](../reference/orders.md#nope)."));
    expect(runCheck(opts([]))).toBe(EXIT_CODES.validation);
  });

  test("portability warnings alone do not fail the gate (exit 0)", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "A [[wikilink]] only."));
    expect(runCheck(opts([]))).toBe(EXIT_OK);
  });

  test("--strict promotes a portability warning to exit 6", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "A [[wikilink]] only."));
    expect(runCheck(opts(["--strict"]))).toBe(EXIT_CODES.validation);
  });

  test("--external is accepted but flushes a deferred advisory to stderr", () => {
    const o = opts(["--external"]);
    runCheck(o);
    expect((o.stderr as ReturnType<typeof capture>).text()).toContain("external-URL liveness");
  });

  test("an unknown flag is a usage error", () => {
    expect(() => runCheck(opts(["--bogus"]))).toThrow(LoreError);
  });

  test("an unknown short flag is a usage error", () => {
    expect(() => runCheck(opts(["-x"]))).toThrow(LoreError);
  });

  test("a `--` terminator ends option parsing (remaining tokens are paths)", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[orders](../reference/orders.md#archival-policy)."));
    expect(runCheck(opts(["--", "docs"]))).toBe(EXIT_OK);
  });

  test("a nonexistent bundle root is a not_found error", () => {
    expect(() => runCheck(opts(["does-not-exist"]))).toThrow(/does not exist/);
  });

  test("a single-file path is a usage error (check is whole-bundle)", () => {
    expect(() => runCheck(opts(["docs/index.md"]))).toThrow(/not a directory/);
  });

  test("two distinct roots are checked independently — the 2nd root's broken link is caught (#1)", () => {
    // Two bundles, each with its own index.md; the second's link is broken. The old shared-seen
    // keying dropped the 2nd index.md and passed the bundle; each must be checked in full.
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    writeFileSync(join(root, "a", "index.md"), "# A\n\nClean.\n");
    writeFileSync(join(root, "b", "index.md"), "# B\n\nSee [ghost](./ghost.md).\n");
    const o = opts(["a", "b"], JSON_CTX);
    const code = runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(parsed.data.fileCount).toBe(2); // both index.md files examined
    expect(parsed.data.errorCount).toBe(1); // b/index.md's broken link is caught
    expect(parsed.data.findings[0].file).toBe("b/index.md"); // labelled by its root
    expect(code).toBe(EXIT_CODES.validation);
  });

  test("the same root passed twice de-duplicates its files", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[orders](../reference/orders.md#archival-policy)."));
    const o = opts(["docs", "docs"], JSON_CTX);
    runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(parsed.data.fileCount).toBe(3); // index.md + orders.md + x.md, each once
  });

  test("pretty mode paints the severity token and the error count", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[ghost](../reference/ghost.md)."));
    const o = opts([], { mode: "pretty", color: true });
    runCheck(o);
    const text = (o.stdout as ReturnType<typeof capture>).text();
    expect(text).toContain("["); // ANSI escape — color was emitted
    expect(text).toContain("error");
  });

  test("--json emits the check.report envelope", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[ghost](../reference/ghost.md)."));
    const o = opts([], JSON_CTX);
    runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(parsed.kind).toBe("check.report");
    expect(parsed.data.errorCount).toBe(1);
  });

  test("skips a symlinked file with an advisory (does not follow it)", () => {
    writeFileSync(join(root, "docs", "adr", "real.md"), ref("R", "Body."));
    symlinkSync(join(root, "docs", "adr", "real.md"), join(root, "docs", "adr", "link.md"));
    const o = opts([]);
    runCheck(o);
    expect((o.stderr as ReturnType<typeof capture>).text()).toContain("symlink");
  });
});

// ── CLI router wiring ────────────────────────────────────────────────────────────

describe("cli — check dispatch", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-check-"));
    mkdirSync(join(cwd, "docs"), { recursive: true });
    writeFileSync(join(cwd, "docs", "index.md"), "# Docs\n\nRoot.\n");
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  function ctx() {
    return { cwd, env: {}, isTTY: false, stdout: capture(), stderr: capture() };
  }

  test("`lore check` on a clean bundle exits 0", () => {
    expect(run(["bun", "lore", "check", "--plain"], ctx())).toBe(EXIT_OK);
  });

  test("`lore check --bogus` is a usage error", () => {
    expect(run(["bun", "lore", "check", "--bogus"], ctx())).toBe(EXIT_CODES.usage);
  });
});
