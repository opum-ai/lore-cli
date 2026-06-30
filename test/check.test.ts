import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { type FetchLike, runCheck } from "../src/commands/check";
import {
  type CheckInputFile,
  checkBundle,
  collectExternalLinks,
  extractHeadingSlugs,
  slugify,
} from "../src/core/check";
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

// ── checkBundle: MDX-safety lint (LORE-48) ───────────────────────────────────────

describe("checkBundle — MDX hazards (LORE-48)", () => {
  function messages(body: string): string[] {
    return checkBundle([{ path: "x.md", raw: ref("X", body) }]).findings.map((f) => f.message);
  }

  test("a raw < in prose is a portability warning", () => {
    expect(messages("When temperature < 0 it freezes.").some((m) => m.includes('raw "<"'))).toBe(true);
  });

  test("a raw { in prose is a portability warning", () => {
    expect(messages("A literal { not code } in a sentence.").some((m) => m.includes('raw "{"'))).toBe(true);
  });

  test("a < inside inline code is NOT flagged (code excluded)", () => {
    expect(checkBundle([{ path: "x.md", raw: ref("X", "Use `Promise<T>` generics.") }]).warningCount).toBe(0);
  });

  test("a < inside a fenced code block is NOT flagged", () => {
    expect(checkBundle([{ path: "x.md", raw: ref("X", "```ts\nconst a = 1 < 2;\n```") }]).warningCount).toBe(0);
  });

  test("a raw HTML tag (a non-comment html node) is flagged as raw HTML", () => {
    const finding = checkBundle([{ path: "x.md", raw: ref("X", "Press <kbd>Esc</kbd> now.") }]).findings.find((f) =>
      f.message.includes("raw HTML"),
    );
    expect(finding?.severity).toBe("warning");
  });

  test("an HTML comment is NOT flagged (portable; lore's managed regions use it)", () => {
    expect(checkBundle([{ path: "x.md", raw: ref("X", "<!-- a portable comment -->\n\nBody.") }]).warningCount).toBe(0);
  });

  test("a long raw-HTML snippet is clipped with an ellipsis", () => {
    const longTag = `<div data-x="${"y".repeat(80)}"></div>`;
    const finding = checkBundle([{ path: "x.md", raw: ref("X", longTag) }]).findings.find((f) =>
      f.message.includes("raw HTML"),
    );
    expect(finding?.message).toContain("…");
  });
});

// ── checkBundle: Obsidian block references (LORE-48) ──────────────────────────────

describe("checkBundle — Obsidian block references (LORE-48)", () => {
  function warnings(body: string): number {
    return checkBundle([{ path: "x.md", raw: ref("X", body) }]).warningCount;
  }

  test("a block-ref marker at the end of a block is flagged", () => {
    const finding = checkBundle([{ path: "x.md", raw: ref("X", "Some claim worth citing. ^block-id") }]).findings.find(
      (f) => f.message.includes("block reference"),
    );
    expect(finding?.severity).toBe("warning");
  });

  test("a digit-leading auto id (^3f9a2b) is still caught", () => {
    const finding = checkBundle([{ path: "x.md", raw: ref("X", "An auto-generated id ^3f9a2b") }]).findings.find((f) =>
      f.message.includes("block reference"),
    );
    expect(finding).toBeDefined();
  });

  test("a superscript x^2 is NOT flagged (caret not preceded by whitespace)", () => {
    expect(warnings("The area is x^2 in total.")).toBe(0);
  });

  test("a GFM footnote marker [^1] is NOT flagged", () => {
    expect(warnings("A claim with a footnote.[^1]")).toBe(0);
  });

  test("a mid-block caret is NOT flagged (only end-of-block markers)", () => {
    expect(warnings("foo ^bar baz qux")).toBe(0);
  });
});

// ── collectExternalLinks: the --external worklist (LORE-48) ───────────────────────

describe("collectExternalLinks (LORE-48)", () => {
  test("returns http(s) targets per file, deduped within a file, skipping internal/mailto/protocol-relative", () => {
    const files: CheckInputFile[] = [
      {
        path: "a.md",
        raw: ref(
          "A",
          "[1](https://x.example) [2](https://x.example) [3](http://y.example) [in](./b.md) [m](mailto:a@b.co) [pr](//cdn/z)",
        ),
      },
      { path: "b.md", raw: ref("B", "[4](https://z.example)") },
    ];
    expect(collectExternalLinks(files)).toEqual([
      { file: "a.md", url: "https://x.example" },
      { file: "a.md", url: "http://y.example" },
      { file: "b.md", url: "https://z.example" },
    ]);
  });

  test("a bundle with no external links yields an empty worklist", () => {
    expect(collectExternalLinks([{ path: "a.md", raw: ref("A", "Just [internal](./b.md).") }])).toEqual([]);
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

  test("--external reports a dead link as an advisory but keeps the gate exit (AC#1/#2)", async () => {
    writeFileSync(
      join(root, "docs", "adr", "x.md"),
      ref("X", "See [up](https://up.example) and [down](https://down.example)."),
    );
    const fetchFake: FetchLike = async (url) => ({ ok: url.includes("up"), status: url.includes("up") ? 200 : 404 });
    const o = { ...opts(["--external"]), fetch: fetchFake };
    expect(await runCheck(o)).toBe(EXIT_OK); // a dead external link never fails the gate
    const out = (o.stdout as ReturnType<typeof capture>).text();
    expect(out).toContain("[external-link]");
    expect(out).toContain("https://down.example");
    expect(out).not.toContain("https://up.example"); // a live URL yields no finding
  });

  test("--external liveness never gates, even under --strict (AC#2)", async () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[down](https://down.example)."));
    const fetchFake: FetchLike = async () => ({ ok: false, status: 500 });
    expect(await runCheck({ ...opts(["--external", "--strict"]), fetch: fetchFake })).toBe(EXIT_OK);
  });

  test("without --external no network is touched and the run stays synchronous", () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[down](https://down.example)."));
    let fetched = false;
    const fetchFake: FetchLike = async () => {
      fetched = true;
      return { ok: false, status: 404 };
    };
    const result = runCheck({ ...opts([]), fetch: fetchFake });
    expect(typeof result).toBe("number"); // synchronous: no Promise without --external
    expect(result).toBe(EXIT_OK);
    expect(fetched).toBe(false);
  });

  test("--external fetches a repeated URL once but reports it per file", async () => {
    writeFileSync(join(root, "docs", "adr", "a.md"), ref("A", "[x](https://dup.example)"));
    writeFileSync(join(root, "docs", "adr", "b.md"), ref("B", "[x](https://dup.example)"));
    let calls = 0;
    const fetchFake: FetchLike = async () => {
      calls++;
      return { ok: false, status: 404 };
    };
    const o = { ...opts(["--external"]), fetch: fetchFake };
    await runCheck(o);
    expect(calls).toBe(1); // deduped
    const out = (o.stdout as ReturnType<typeof capture>).text();
    expect((out.match(/\[external-link\]/g) ?? []).length).toBe(2); // reported per file
  });

  test("--external classifies a timeout and an unreachable host", async () => {
    writeFileSync(join(root, "docs", "adr", "a.md"), ref("A", "[t](https://slow.example) [u](https://gone.example)"));
    const fetchFake: FetchLike = async (url) => {
      if (url.includes("slow")) {
        const e = new Error("timed out");
        e.name = "TimeoutError";
        throw e;
      }
      throw new Error("getaddrinfo ENOTFOUND");
    };
    const o = { ...opts(["--external"]), fetch: fetchFake };
    await runCheck(o);
    const out = (o.stdout as ReturnType<typeof capture>).text();
    expect(out).toContain("did not respond");
    expect(out).toContain("is unreachable");
  });

  test("--external folds liveness into the --json envelope without changing the gate counts", async () => {
    writeFileSync(join(root, "docs", "adr", "a.md"), ref("A", "[d](https://d.example)"));
    const fetchFake: FetchLike = async () => ({ ok: false, status: 404 });
    const o = { root, output: JSON_CTX, args: ["--external"], stdout: capture(), stderr: capture(), fetch: fetchFake };
    await runCheck(o);
    const env = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(env.data.errorCount).toBe(0);
    expect(env.data.warningCount).toBe(0);
    expect(env.data.externalFindings).toHaveLength(1);
    expect(env.data.externalFindings[0].rule).toBe("external-link");
  });

  test("flags a leading-underscore filename as a portability warning (LORE-48)", () => {
    writeFileSync(join(root, "docs", "_partial.md"), ref("P", "Body."));
    const o = opts([]);
    runCheck(o);
    expect((o.stdout as ReturnType<typeof capture>).text()).toContain('non-portable name "_partial.md"');
  });

  test("flags a .mdx file as a portability warning, without content-checking it (LORE-48)", () => {
    // The .mdx carries a broken internal link; because lore never treats .mdx as a concept, the
    // broken link is NOT a gate error — only the filename warning fires.
    writeFileSync(join(root, "docs", "weird.mdx"), ref("W", "[ghost](./nope.md)"));
    const o = opts([]);
    expect(runCheck(o)).toBe(EXIT_OK);
    expect((o.stdout as ReturnType<typeof capture>).text()).toContain('non-portable ".mdx" file');
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

  test("`lore check --external` returns a Promise resolving to the gate code (via injected fetch)", async () => {
    writeFileSync(join(cwd, "docs", "x.md"), ref("X", "[d](https://d.example)"));
    const fetchFake: FetchLike = async () => ({ ok: false, status: 404 });
    const c = { ...ctx(), fetch: fetchFake };
    const result = run(["bun", "lore", "check", "--external", "--plain"], c);
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(EXIT_OK); // a dead external link never fails the gate
    expect((c.stdout as ReturnType<typeof capture>).text()).toContain("[external-link]");
  });
});
