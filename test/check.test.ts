import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter } from "../src/adapters/backlog";
import { run } from "../src/cli";
import { driftFindingsForBundle, type FetchLike, isDocsRoot, type ResolveHost, runCheck } from "../src/commands/check";
import {
  type CheckInputFile,
  checkBundle,
  classifyAddress,
  collectExternalLinks,
  extractHeadingSlugs,
  slugify,
} from "../src/core/check";
import { type ManagedTaskRow, regenerateTaskBlock } from "../src/core/managed-block";
import { EXIT_CODES, EXIT_OK, EXIT_UNCAUGHT, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, concept, fakeAdapter, makeTask, storyDoc } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

/**
 * A DNS fake that resolves every hostname to one real, public, non-blocked address — the default
 * `resolveHost` for every `--external` test that isn't itself testing LORE-71's SSRF guard (the
 * `.example` hostnames these fixtures use are RFC 2606-reserved and never resolve for real, so
 * without this every such test would otherwise hit — and fail against — real DNS).
 */
const ALLOW_ALL_HOSTS: ResolveHost = async () => ["93.184.216.34"];

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

// ── classifyAddress: LORE-71's SSRF range classifier ──────────────────────────────

describe("classifyAddress — IP-range classification (LORE-71)", () => {
  test.each([
    ["0.0.0.0", true, "this-network"],
    ["0.255.255.255", true, "this-network"],
    ["1.0.0.0", false, undefined],
    ["9.255.255.255", false, undefined],
    ["10.0.0.0", true, "private"],
    ["10.255.255.255", true, "private"],
    ["11.0.0.0", false, undefined],
    ["100.63.255.255", false, undefined],
    ["100.64.0.0", true, "carrier-grade NAT"],
    ["100.127.255.255", true, "carrier-grade NAT"],
    ["100.128.0.0", false, undefined],
    ["126.255.255.255", false, undefined],
    ["127.0.0.0", true, "loopback"],
    ["127.0.0.1", true, "loopback"],
    ["127.255.255.255", true, "loopback"],
    ["128.0.0.0", false, undefined],
    ["169.253.255.255", false, undefined],
    ["169.254.0.0", true, "link-local"],
    ["169.254.169.254", true, "link-local"], // the task's own cloud-metadata example
    ["169.254.255.255", true, "link-local"],
    ["169.255.0.0", false, undefined],
    ["172.15.255.255", false, undefined],
    ["172.16.0.0", true, "private"],
    ["172.31.255.255", true, "private"],
    ["172.32.0.0", false, undefined],
    ["192.167.255.255", false, undefined],
    ["192.168.0.0", true, "private"],
    ["192.168.255.255", true, "private"],
    ["192.169.0.0", false, undefined],
    ["255.255.255.255", false, undefined],
    ["8.8.8.8", false, undefined],
    ["93.184.216.34", false, undefined],
  ])("IPv4 %s -> blocked=%p (%s)", (ip, expectedBlocked, expectedReasonSubstring) => {
    const result = classifyAddress(ip);
    expect(result.blocked).toBe(expectedBlocked);
    if (expectedReasonSubstring !== undefined) {
      expect(result.reason).toContain(expectedReasonSubstring);
    }
  });

  test.each([
    ["::1", true, "loopback"],
    ["0:0:0:0:0:0:0:1", true, "loopback"], // fully-expanded spelling of ::1
    ["::", true, "unspecified"],
    ["fe80::", true, "link-local"],
    ["fe80::1", true, "link-local"],
    ["febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", true, "link-local"], // fe80::/10's top boundary
    ["fec0::", false, undefined], // just past fe80::/10
    ["fc00::", true, "unique-local"],
    ["fd00::1", true, "unique-local"],
    ["fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", true, "unique-local"], // fc00::/7's top boundary
    ["fe00::", false, undefined], // just past fc00::/7
    ["2001:4860:4860::8888", false, undefined], // a real public IPv6 address (Google DNS)
    ["2606:2800:220:1:248:1893:25c8:1946", false, undefined], // example.com's real IPv6 address
  ])("IPv6 %s -> blocked=%p (%s)", (ip, expectedBlocked, expectedReasonSubstring) => {
    const result = classifyAddress(ip);
    expect(result.blocked).toBe(expectedBlocked);
    if (expectedReasonSubstring !== undefined) {
      expect(result.reason).toContain(expectedReasonSubstring);
    }
  });

  test.each([
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:7f00:1", "loopback"], // the same value, hex-hextet spelling
    ["::ffff:169.254.169.254", "link-local"],
    ["::FFFF:A9FE:A9FE", "link-local"], // uppercase hex
    ["::ffff:10.0.0.1", "private"],
    ["::ffff:192.168.1.1", "private"],
  ])("IPv4-mapped IPv6 %s is blocked the same as its plain IPv4 form (%s)", (ip, expectedReasonSubstring) => {
    // The classic SSRF-filter bypass this file's own doc comment calls out: an IPv4-only
    // blocklist missing the IPv6-mapped spelling of the exact same address.
    const result = classifyAddress(ip);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain(expectedReasonSubstring);
  });

  test.each([
    ["::169.254.169.254", "deprecated"], // legacy IPv4-compatible form (::/96), NOT the same value as ::ffff:...
    ["::127.0.0.1", "deprecated"],
    ["64:ff9b::a9fe:a9fe", "NAT64"], // NAT64 well-known prefix embedding 169.254.169.254
    ["64:ff9b::169.254.169.254", "NAT64"],
  ])("legacy/translation IPv6 address forms are blocked wholesale (%s -> %s)", (ip, expectedReasonSubstring) => {
    const result = classifyAddress(ip);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain(expectedReasonSubstring);
  });

  test.each([
    "not-an-ip",
    "",
    "999.1.1.1",
    "1.2.3",
    "gggg::1",
    "http://example.com",
  ])("a malformed/non-IP literal %p is blocked (fails closed, not silently allowed)", (input) => {
    expect(classifyAddress(input).blocked).toBe(true);
  });

  test("case, leading-zero, and zone-id spelling variants of the same address all agree", () => {
    const spellings = ["fe80::1", "FE80::1", "fe80:0000:0000:0000:0000:0000:0000:0001", "fe80::1%eth0"];
    const verdicts = spellings.map((s) => classifyAddress(s).blocked);
    expect(new Set(verdicts)).toEqual(new Set([true]));
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

  test("anchor matching is decode-tolerant on an exact-case match", () => {
    const orders2: CheckInputFile = { path: "reference/orders.md", raw: ref("Orders", "## Archival Policy") };
    const adr: CheckInputFile = {
      path: "adr/x.md",
      // The hyphen is percent-encoded but decodes to the real, exact-case slug.
      raw: ref("X", "See [p](../reference/orders.md#archival%2Dpolicy)."),
    };
    expect(checkBundle([adr, orders2]).errorCount).toBe(0);
  });

  test("AC#1/AC#2: an anchor differing only in case from the heading slug is a broken-anchor error", () => {
    const orders2: CheckInputFile = { path: "reference/orders.md", raw: ref("Orders", "## Archival Policy") };
    const adr: CheckInputFile = {
      path: "adr/x.md",
      raw: ref("X", "See [p](../reference/orders.md#Archival-Policy)."),
    };
    const report = checkBundle([adr, orders2]);
    expect(report.errorCount).toBe(1);
    expect(report.findings[0]?.rule).toBe("broken-anchor");
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

  test("raw HTML after a comment in one html node is still flagged (LORE-48 review)", () => {
    // `<!-- c --><div>` is one html node beginning with a comment; the trailing <div> must not be
    // skipped just because the node starts with `<!--`.
    const finding = checkBundle([{ path: "x.md", raw: ref("X", "<!-- c --><div>body</div>") }]).findings.find((f) =>
      f.message.includes("raw HTML"),
    );
    expect(finding?.severity).toBe("warning");
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

  test("a caret followed by inline formatting is NOT flagged (LORE-48 review: block-end, not text-node-end)", () => {
    // mdast splits this into [text 'see note ^id ', strong]; the caret is mid-paragraph, before the
    // bold, so it must not be mistaken for a block-end ^id.
    expect(warnings("see note ^id **bold**")).toBe(0);
  });

  test("a caret-id that genuinely ends the block after inline formatting IS flagged", () => {
    const finding = checkBundle([{ path: "x.md", raw: ref("X", "**bold** then ^real-id") }]).findings.find((f) =>
      f.message.includes("block reference"),
    );
    expect(finding?.severity).toBe("warning");
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
    return { root, output, args, stdout: capture(), stderr: capture(), resolveHost: ALLOW_ALL_HOSTS };
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

  // ── LORE-71: --external's SSRF guard ─────────────────────────────────────────

  test("LORE-71 AC1/AC3: a literal cloud-metadata address is never fetched — the task's own repro", async () => {
    // http://169.254.169.254/... is the task's own example (AWS/GCP/Azure instance metadata).
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[meta](http://169.254.169.254/latest/meta-data/)."));
    let calls = 0;
    const fetchFake: FetchLike = async () => {
      calls++;
      return { ok: true, status: 200 };
    };
    const o = { ...opts(["--external"]), fetch: fetchFake };
    expect(await runCheck(o)).toBe(EXIT_OK); // liveness never gates
    expect(calls).toBe(0); // the fetch was never issued at all
    const out = (o.stdout as ReturnType<typeof capture>).text();
    expect(out).toContain("[external-link]");
    expect(out).toContain("was not probed");
    expect(out).toContain("link-local");
  });

  test("LORE-71 AC1: loopback, private (RFC1918), and IPv4-mapped-IPv6 literal addresses are all blocked", async () => {
    writeFileSync(
      join(root, "docs", "adr", "x.md"),
      ref(
        "X",
        [
          "[a](http://127.0.0.1/)",
          "[b](http://10.1.2.3/)",
          "[c](http://192.168.1.1/)",
          "[d](http://[::ffff:127.0.0.1]/)", // IPv4-mapped IPv6 — a classic filter-bypass encoding
        ].join(" "),
      ),
    );
    let calls = 0;
    const fetchFake: FetchLike = async () => {
      calls++;
      return { ok: true, status: 200 };
    };
    const o = { ...opts(["--external"]), fetch: fetchFake };
    await runCheck(o);
    expect(calls).toBe(0);
    const out = (o.stdout as ReturnType<typeof capture>).text();
    expect((out.match(/was not probed/g) ?? []).length).toBe(4);
  });

  test("LORE-71 AC1: a hostname that RESOLVES to a blocked address is refused before fetching (DNS-based, not just literal-IP)", async () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[internal](http://internal.example/)."));
    let fetchCalls = 0;
    const fetchFake: FetchLike = async () => {
      fetchCalls++;
      return { ok: true, status: 200 };
    };
    const resolveFake: ResolveHost = async (hostname) =>
      hostname === "internal.example" ? ["169.254.169.254"] : ["93.184.216.34"];
    const o = { ...opts(["--external"]), fetch: fetchFake, resolveHost: resolveFake };
    await runCheck(o);
    expect(fetchCalls).toBe(0);
    expect((o.stdout as ReturnType<typeof capture>).text()).toContain("was not probed");
  });

  test("LORE-71 AC1: a hostname resolving to MULTIPLE addresses is blocked if ANY of them is disallowed", async () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[multi](http://multi.example/)."));
    let fetchCalls = 0;
    const fetchFake: FetchLike = async () => {
      fetchCalls++;
      return { ok: true, status: 200 };
    };
    const resolveFake: ResolveHost = async () => ["93.184.216.34", "127.0.0.1"]; // one public, one loopback
    const o = { ...opts(["--external"]), fetch: fetchFake, resolveHost: resolveFake };
    await runCheck(o);
    expect(fetchCalls).toBe(0); // blocked BEFORE any hop, since one resolved address is disallowed
  });

  test("LORE-71 AC2/AC3: a redirect to a blocked destination is rejected, not silently followed — the second (blocked) hop is never fetched", async () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[r](https://redirect.example/)."));
    const calls: string[] = [];
    const fetchFake: FetchLike = async (url) => {
      calls.push(url);
      if (url === "https://redirect.example/") {
        return { ok: false, status: 302, location: "http://169.254.169.254/latest/meta-data/" };
      }
      return { ok: true, status: 200 }; // would only be reached if the redirect were (wrongly) followed
    };
    const o = { ...opts(["--external"]), fetch: fetchFake, resolveHost: ALLOW_ALL_HOSTS };
    await runCheck(o);
    expect(calls).toEqual(["https://redirect.example/"]); // the blocked hop was never fetched
    expect((o.stdout as ReturnType<typeof capture>).text()).toContain("was not probed");
  });

  test("LORE-71 AC2: a redirect to an ALLOWED destination is followed and the final response wins", async () => {
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[r](https://redirect.example/)."));
    const calls: string[] = [];
    const fetchFake: FetchLike = async (url) => {
      calls.push(url);
      if (url === "https://redirect.example/") {
        return { ok: false, status: 302, location: "https://final.example/" };
      }
      return { ok: true, status: 200 };
    };
    const o = { ...opts(["--external"]), fetch: fetchFake, resolveHost: ALLOW_ALL_HOSTS };
    expect(await runCheck(o)).toBe(EXIT_OK);
    expect(calls).toEqual(["https://redirect.example/", "https://final.example/"]);
    const out = (o.stdout as ReturnType<typeof capture>).text();
    expect(out).not.toContain("[external-link]"); // the final hop was 200 OK — no finding
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

  test("LORE-110: probeLiveness caps the number of distinct URLs it probes and reports the rest as skipped (AC#1-3)", async () => {
    // Comfortably more distinct URLs than any reasonable cap — proves a bound is enforced without
    // the test needing to know (and duplicate) the exact cap value baked into check.ts.
    const total = 800;
    const links = Array.from({ length: total }, (_, i) => `[l${i}](https://host${i}.example/)`).join(" ");
    writeFileSync(join(root, "docs", "adr", "many.md"), ref("Many", links));
    let fetchCalls = 0;
    const fetchFake: FetchLike = async () => {
      fetchCalls++;
      return { ok: true, status: 200 }; // every PROBED url is alive — any finding must come from a skip
    };
    const o = { ...opts(["--external"]), fetch: fetchFake };
    const start = performance.now();
    await runCheck(o);
    const elapsedMs = performance.now() - start;

    expect(fetchCalls).toBeGreaterThan(0); // the cap still lets some URLs through
    expect(fetchCalls).toBeLessThan(total); // but not all `total` distinct URLs were probed
    expect(elapsedMs).toBeLessThan(5000); // bounded — not one 5s-timeout-per-URL blowup

    const out = (o.stdout as ReturnType<typeof capture>).text();
    const skippedCount = (out.match(/was not probed: exceeded the liveness cap/g) ?? []).length;
    expect(skippedCount).toBe(total - fetchCalls); // every un-probed URL surfaces its own advisory finding
    expect((out.match(/\[external-link\]/g) ?? []).length).toBe(skippedCount); // no OTHER findings (all probed URLs were "alive")
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
    const o = {
      root,
      output: JSON_CTX,
      args: ["--external"],
      stdout: capture(),
      stderr: capture(),
      fetch: fetchFake,
      resolveHost: ALLOW_ALL_HOSTS,
    };
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

  test("skips a symlinked file with an advisory (does not follow it), emitted exactly once", () => {
    writeFileSync(join(root, "docs", "adr", "real.md"), ref("R", "Body."));
    symlinkSync(join(root, "docs", "adr", "real.md"), join(root, "docs", "adr", "link.md"));
    const o = opts([]);
    runCheck(o);
    const stderrText = (o.stderr as ReturnType<typeof capture>).text();
    expect(stderrText).toContain("symlink");
    // Regression: the reconciliation-eligibility scan reuses the SAME already-walked files rather
    // than re-walking the directory, so this advisory (from the one raw-file walk) is never doubled.
    // (Counting whole lines, not occurrences of the substring "symlink" — the message itself
    // contains it twice: "skipping symlink ...: symlinks are not followed".)
    const lines = stderrText.split("\n").filter((l) => l.includes("skipping symlink"));
    expect(lines).toHaveLength(1);
  });

  test("advisories flush before the report on the plain, fully-synchronous path too (LORE-27 regression)", () => {
    // Pins the deliberate ordering (round 3) for the single most common invocation: no reconciliation,
    // no --external. Every other path in runCheck already has an order-pinning test; this one didn't.
    writeFileSync(join(root, "docs", "adr", "real.md"), ref("R", "Body."));
    symlinkSync(join(root, "docs", "adr", "real.md"), join(root, "docs", "adr", "link.md"));
    const order: string[] = [];
    const stdout = { write: (): void => void order.push("stdout") };
    const stderr = { write: (): void => void order.push("stderr") };
    const o = { root, output: JSON_CTX, args: [], stdout, stderr };
    const result = runCheck(o);
    expect(typeof result).toBe("number"); // stays fully synchronous
    expect(order[0]).toBe("stderr");
  });

  test("a frontmatter-free doc produces no advisory noise (LORE-27 regression)", () => {
    // docs/index.md (from beforeEach) has no frontmatter. Before the fix, the reconciliation-
    // eligibility scan called loadBundle() directly, which itself warns "no frontmatter mapping"
    // for every non-concept file — spurious noise on a fully clean, coherent bundle.
    const o = opts([]);
    expect(runCheck(o)).toBe(EXIT_OK);
    expect((o.stderr as ReturnType<typeof capture>).text()).toBe("");
  });

  test("a malformed concept elsewhere in the bundle does not crash the gate (LORE-27 regression)", () => {
    // Before the fix, the reconciliation-eligibility scan used loadBundle(), which THROWS on any
    // schema-invalid frontmatter anywhere in the bundle — even a file with no tasks: link at all —
    // dropping the real check.report (here, the broken link below) entirely.
    writeFileSync(join(root, "docs", "bad.md"), "---\ntype: Story\nstatus: 12345\n---\n# Bad\n\nBody.\n");
    writeFileSync(join(root, "docs", "adr", "x.md"), ref("X", "[ghost](../reference/ghost.md)."));
    const o = opts([], JSON_CTX);
    const code = runCheck(o);
    expect(code).toBe(EXIT_CODES.validation);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(parsed.data.findings.some((f: { rule: string }) => f.rule === "broken-link")).toBe(true);
  });
});

// ── isDocsRoot ─────────────────────────────────────────────────────────────────

describe("isDocsRoot", () => {
  // A pure string check, tested directly (not through a real directory) so the assertions hold
  // regardless of the test machine's own filesystem case-sensitivity (macOS/Windows default to
  // case-insensitive; Linux CI does not — this codebase has been bitten by that split before).
  test.each([
    ["docs", true],
    ["./docs", true],
    ["docs/", true],
    ["Docs", true], // case-insensitive: the identical directory on macOS/Windows (LORE-27 regression)
    ["DOCS", true],
    ["docs\\", true], // Windows trailing-backslash idiom, mirroring the "docs/" case (LORE-27 regression)
    [".\\docs", true], // Windows leading-relative idiom, mirroring "./docs"
    ["alt", false],
    ["docs2", false],
    ["adocs", false],
  ])("isDocsRoot(%p) === %p", (label, expected) => {
    expect(isDocsRoot(label)).toBe(expected);
  });
});

// ── driftFindingsForBundle: docPath/fixable consistency on a non-canonical label (LORE-113) ──────

describe("driftFindingsForBundle — docPath agrees with the fixable/isDocsRoot verdict on a non-canonical label (LORE-113)", () => {
  /**
   * One `LORE-1` task whose `file` is deliberately placed INSIDE `docs/` — a real linked task's
   * `file` never is (it always points at `backlog/tasks/…`), but a docs-relative target is what
   * makes the managed block's rendered link SENSITIVE to `docPath`'s own directory prefix: with a
   * canonical `docs/stories/x.md` docPath the link collapses to `../other-task-ref.md`, but a
   * case-mismatched or literal-backslash-carrying docPath (the pre-fix bug: the raw, un-normalized
   * `bundle.label`) fails to collapse the shared `docs` prefix and renders a longer, DIFFERENT
   * link — the only way this internal, never-returned `docPath` value's correctness is observable
   * from `driftFindingsForBundle`'s own findings.
   */
  const row: ManagedTaskRow = {
    id: "LORE-1",
    title: "Title for LORE-1",
    status: "Done",
    file: "docs/other-task-ref.md",
  };

  /** Everything one `driftFindingsForBundle` call needs for `stories/x.md`, keyed off `label`. */
  function fixtureFor(label: string) {
    // The doc's persisted `status: todo` deliberately disagrees with the `Done` task's reconciled
    // "done" rollup (a status-drift finding, whose hint text reveals `fixable`), while its managed
    // block is pre-rendered against the CANONICAL docPath — exactly what a correctly-normalized
    // `label` must resolve to for the block comparison to see no drift.
    const original = regenerateTaskBlock(storyDoc("X", ["lore-1"], "todo"), [row], { docPath: "docs/stories/x.md" });
    const bundle = { label, files: [{ path: "stories/x.md", raw: original }], filenameFindings: [] };
    const concepts = [concept("stories/x.md", { type: "Story", status: "todo", tasks: ["lore-1"] })];
    const pooled = {
      config: { flow: ["To Do", "In Progress", "Done"], overrides: {} },
      details: new Map([
        ["lore-1", { ok: true as const, detail: makeTask("LORE-1", { status: row.status, file: row.file }) }],
      ]),
      configError: null,
    };
    return { bundle, concepts, pooled };
  }

  test.each([
    ["Docs", "a different-case spelling"],
    ["docs\\", "a Windows trailing-backslash idiom"],
  ])("%p (%s): docPath and fixable are mutually consistent", async (label) => {
    // Ground truth: this non-canonical label IS the docs root `isDocsRoot` (and so `fixable`)
    // judges it against.
    expect(isDocsRoot(label)).toBe(true);

    const { bundle, concepts, pooled } = fixtureFor(label);
    const result = await driftFindingsForBundle("/fake-root", bundle, concepts, false, fakeAdapter([]), pooled);

    expect(result.error).toBeNull();
    // Exactly the one expected status-drift finding, carrying the "run `lore sync`" hint that
    // only appears when `fixable` is true — proving `fixable` was correctly computed for this
    // label. Critically, there is no SECOND "managed-block-drift" finding alongside it: before
    // the LORE-113 fix, `docPath` embedded the raw (non-canonical) `label`, so the block's
    // re-rendered link diverged from the one pre-rendered against the canonical spelling, and a
    // spurious drift finding appeared here even though `fixable` correctly said this root could be
    // `sync`'d — the exact inconsistency this test guards against.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe("status-drift");
    expect(result.findings[0]?.message).toContain("run `lore sync`");
  });
});

// ── Command layer: runCheck — status + managed-block drift (LORE-27) ─────────────

describe("runCheck — status + managed-block drift (LORE-27)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-check-drift-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeDoc(rel: string, contents: string): void {
    const abs = join(root, "docs", rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }

  function opts(args: string[], adapter: BacklogAdapter, output: OutputContext = JSON_CTX) {
    return { root, output, args, adapter, stdout: capture(), stderr: capture(), resolveHost: ALLOW_ALL_HOSTS };
  }

  /** A doc-LORE-1 row for a Done task, matching `makeTask`'s defaults. */
  const doneRow: ManagedTaskRow = {
    id: "LORE-1",
    title: "Title for LORE-1",
    status: "Done",
    file: "backlog/tasks/lore-1 - title.md",
  };

  test("a fully reconciled doc has no drift findings and stays synchronous-free of extra findings", async () => {
    const reconciled = regenerateTaskBlock(storyDoc("X", ["lore-1"], "done"), [doneRow], {
      docPath: "docs/stories/x.md",
    });
    writeDoc("stories/x.md", reconciled);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const code = await runCheck(opts([], adapter));
    expect(code).toBe(EXIT_OK);
  });

  test("a stale persisted status is a status-drift error (exit 6)", async () => {
    // Block already matches live data; only the frontmatter `status:` is behind.
    const doc = regenerateTaskBlock(storyDoc("X", ["lore-1"], "todo"), [doneRow], { docPath: "docs/stories/x.md" });
    writeDoc("stories/x.md", doc);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_CODES.validation);
    expect(parsed.data.findings).toHaveLength(1);
    expect(parsed.data.findings[0].rule).toBe("status-drift");
    expect(parsed.data.findings[0].file).toBe("stories/x.md");
  });

  test("an unset status (no status: key) displays as (unset), not the bare word 'undefined' (LORE-27 regression)", async () => {
    const doc = regenerateTaskBlock(storyDoc("X", ["lore-1"]), [doneRow], { docPath: "docs/stories/x.md" }); // no status: key at all
    writeDoc("stories/x.md", doc);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    const drift = parsed.data.findings.find((f: { rule: string }) => f.rule === "status-drift");
    expect(drift.message).toContain("(unset)");
    expect(drift.message).not.toContain("undefined");
  });

  test("an explicit null status (status: with no value) also displays as (unset), not the bare word 'null' (LORE-27 regression)", async () => {
    const raw =
      "---\ntype: Story\ntitle: X\nstatus:\ntasks:\n  - lore-1\n---\n# X\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n";
    const doc = regenerateTaskBlock(raw, [doneRow], { docPath: "docs/stories/x.md" });
    writeDoc("stories/x.md", doc);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    const drift = parsed.data.findings.find((f: { rule: string }) => f.rule === "status-drift");
    expect(drift.message).toContain("(unset)");
    expect(drift.message).not.toContain("null");
  });

  test("a stale managed block is a managed-block-drift error (exit 6)", async () => {
    // Frontmatter status already matches; the block itself (still the storyDoc default, empty) is stale.
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "done"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_CODES.validation);
    expect(parsed.data.findings).toHaveLength(1);
    expect(parsed.data.findings[0].rule).toBe("managed-block-drift");
  });

  test("both status and managed-block drift are reported together", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo")); // stale status AND empty (stale) block
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_CODES.validation);
    const rules = parsed.data.findings.map((f: { rule: string }) => f.rule).sort();
    expect(rules).toEqual(["managed-block-drift", "status-drift"]);
  });

  test("--strict has no bearing on drift — it already always gates", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    expect(await runCheck(opts(["--strict"], adapter))).toBe(EXIT_CODES.validation);
  });

  test("reconciliation drift and --external liveness compose in the same run (LORE-27 regression)", async () => {
    // Previously untested combination: needsReconciliation && parsed.external together.
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo")); // status-drift: task is Done, doc says todo
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const fetchFake: FetchLike = async () => ({ ok: false, status: 404 });

    const o = {
      root,
      output: JSON_CTX,
      args: ["--external"],
      adapter,
      fetch: fetchFake,
      resolveHost: ALLOW_ALL_HOSTS,
      stdout: capture(),
      stderr: capture(),
    };
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_CODES.validation); // the drift, not liveness, is what gates
    expect(parsed.data.findings.some((f: { rule: string }) => f.rule === "status-drift")).toBe(true);
    expect(parsed.data.externalFindings).toEqual([]); // no external link in this fixture at all
  });

  test("--external liveness runs concurrently with drift reconciliation, not serialized after it (LORE-27 regression)", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo")); // needs reconciliation (slow adapter below)
    writeDoc("adr/x.md", ref("X", "[d](https://d.example)")); // needs liveness
    const order: string[] = [];
    const base = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const adapter: BacklogAdapter = {
      ...base,
      async viewTask(id: string) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("drift-resolved");
        return base.viewTask(id);
      },
    };
    const fetchFake: FetchLike = async () => {
      order.push("liveness-started");
      return { ok: false, status: 404 };
    };

    const o = {
      root,
      output: JSON_CTX,
      args: ["--external"],
      adapter,
      fetch: fetchFake,
      resolveHost: ALLOW_ALL_HOSTS,
      stdout: capture(),
      stderr: capture(),
    };
    await runCheck(o);
    // If liveness were only started AFTER drift resolved (the pre-fix serialized behavior), the
    // slower drift call (a 20ms delay) would always finish first. Started concurrently, liveness
    // (no artificial delay) finishes first.
    expect(order[0]).toBe("liveness-started");
  });

  test("a concept with no tasks: is never reconciled and constructs no adapter", async () => {
    writeDoc("stories/plain.md", "---\ntype: Story\ntitle: Plain\n---\n# Plain\n\nNo tasks.\n");
    const poison = new Proxy(
      {},
      {
        get(): never {
          throw new Error("no adapter method should ever be called");
        },
      },
    ) as BacklogAdapter;

    const result = runCheck(opts([], poison));
    expect(typeof result).toBe("number"); // stays fully synchronous: no reconciliation needed at all
    expect(result).toBe(EXIT_OK);
  });

  test("a missing linked task rejects with not_found (exit 3), never a soft finding", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-99"], "todo"));
    const adapter = fakeAdapter([]); // lore-99 resolves to null

    const result = runCheck(opts([], adapter));
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow(/lore-99/);
  });

  test("a driftPromise error marks the emitted report complete: false, even with errorCount 0 (LORE-112)", async () => {
    // The missing linked task makes `gatherReconciliation` throw before any drift finding is ever
    // produced for this root, so `errorCount` stays 0 -- `complete` is the ONLY signal in the emitted
    // JSON that distinguishes this partial-failure run from a genuinely clean one.
    writeDoc("stories/x.md", storyDoc("X", ["lore-99"], "todo"));
    const adapter = fakeAdapter([]); // lore-99 resolves to null -- rejects with not_found

    const o = opts([], adapter);
    await expect(runCheck(o)).rejects.toThrow(/lore-99/);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(parsed.data.errorCount).toBe(0);
    expect(parsed.data.complete).toBe(false);
  });

  test("a clean, fully reconciled run's emitted report is complete: true (LORE-112)", async () => {
    const reconciled = regenerateTaskBlock(storyDoc("X", ["lore-1"], "done"), [doneRow], {
      docPath: "docs/stories/x.md",
    });
    writeDoc("stories/x.md", reconciled);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_OK);
    expect(parsed.data.complete).toBe(true);
  });

  test("discovery advisories are not lost when reconciliation rejects (LORE-27 regression)", async () => {
    // A symlink advisory is collected during discovery; a missing linked task rejects afterward.
    // Advisories must flush regardless — before the fix they were only flushed in the fulfillment
    // branch of the reconciliation promise, so a rejection silently dropped them.
    writeFileSync(join(root, "docs", "real.md"), ref("R", "Body."));
    symlinkSync(join(root, "docs", "real.md"), join(root, "docs", "link.md"));
    writeDoc("stories/x.md", storyDoc("X", ["lore-99"], "todo"));
    const adapter = fakeAdapter([]); // lore-99 resolves to null

    const o = opts([], adapter);
    await expect(runCheck(o)).rejects.toThrow(/lore-99/);
    expect((o.stderr as ReturnType<typeof capture>).text()).toContain("symlink");
  });

  test("the already-computed report is still emitted when reconciliation rejects (LORE-27 regression)", async () => {
    // A genuine broken link exists alongside a missing linked task. Before the fix, a rejection from
    // reconciliation meant runCheck's driftPromise fulfillment callback (the ONLY place that emitted
    // anything on this path) never ran, silently discarding the broken-link finding entirely.
    writeDoc("adr/x.md", ref("X", "[ghost](../reference/ghost.md)."));
    writeDoc("stories/x.md", storyDoc("X", ["lore-99"], "todo"));
    const adapter = fakeAdapter([]); // lore-99 resolves to null

    const o = opts([], adapter);
    await expect(runCheck(o)).rejects.toThrow(/lore-99/);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(parsed.kind).toBe("check.report");
    expect(parsed.data.findings.some((f: { rule: string }) => f.rule === "broken-link")).toBe(true);
  });

  test("a malformed concept that ALSO links tasks rejects instead of silently passing (LORE-27 regression)", async () => {
    // Unlike a malformed concept with no tasks: link (silently skipped -- lore validate's job), one
    // that DOES link a task is reconciliation-relevant: `lore sync` would refuse to touch it too, so
    // silently treating it as un-linked would be a false negative.
    writeDoc(
      "stories/bad.md",
      "---\ntype: Story\nstatus: 12345\ntasks:\n  - lore-1\n---\n# Bad\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const poison = new Proxy(
      {},
      {
        get(): never {
          throw new Error("no adapter method should ever be called -- the throw happens before any Backlog IO");
        },
      },
    ) as BacklogAdapter;

    // needsReconciliation is true (the scan found a linked-but-invalid concept), so runCheck takes
    // its async path and returns a rejecting Promise, not a synchronous throw.
    const result = runCheck(opts([], poison));
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toThrow(/invalid Story frontmatter/);
  });

  test("the already-computed report survives even a malformed-linked-concept rejection (LORE-27 regression)", async () => {
    writeDoc("adr/x.md", ref("X", "[ghost](../reference/ghost.md)."));
    writeDoc(
      "stories/bad.md",
      "---\ntype: Story\nstatus: 12345\ntasks:\n  - lore-1\n---\n# Bad\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const poison = new Proxy(
      {},
      {
        get: (): never => {
          throw new Error("unreachable");
        },
      },
    ) as BacklogAdapter;

    const o = opts([], poison);
    await expect(runCheck(o)).rejects.toThrow(/invalid Story frontmatter/);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(parsed.kind).toBe("check.report");
    expect(parsed.data.findings.some((f: { rule: string }) => f.rule === "broken-link")).toBe(true);
  });

  test("advisories flush before the report is emitted, even on a malformed-linked-concept rejection (LORE-27 regression)", async () => {
    // Matches every other path in runCheck: flushing after emit would mean a failing emit() drops
    // the advisories entirely (exactly the bug class fixed for the async rejection path).
    writeFileSync(join(root, "docs", "real.md"), ref("R", "Body."));
    symlinkSync(join(root, "docs", "real.md"), join(root, "docs", "link.md"));
    writeDoc(
      "stories/bad.md",
      "---\ntype: Story\nstatus: 12345\ntasks:\n  - lore-1\n---\n# Bad\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const poison = new Proxy(
      {},
      {
        get: (): never => {
          throw new Error("unreachable");
        },
      },
    ) as BacklogAdapter;

    const order: string[] = [];
    const stdout = { write: (): void => void order.push("stdout") };
    const stderr = { write: (): void => void order.push("stderr") };
    const o = { root, output: JSON_CTX, args: [], adapter: poison, stdout, stderr };
    await expect(runCheck(o)).rejects.toThrow(/invalid Story frontmatter/);
    expect(order[0]).toBe("stderr");
  });

  test("a concept with genuinely unparseable frontmatter YAML also re-throws, not just schema-invalid (LORE-27 regression)", async () => {
    // Unlike a schema-invalid-but-PARSEABLE mapping (the tests above), this frontmatter's YAML
    // itself doesn't parse at all -- there is no raw mapping to safely peek at for a tasks: field,
    // so it must NOT be assumed innocent (silently skipped) the way an unrelated malformed doc is.
    writeDoc("stories/bad.md", "---\ntype: [1,2\ntasks:\n  - lore-1\n---\n# Bad\n\nBody.\n");
    const poison = new Proxy(
      {},
      {
        get: (): never => {
          throw new Error("unreachable");
        },
      },
    ) as BacklogAdapter;

    expect(() => runCheck(opts([], poison))).toThrow(/not valid YAML/);
  });

  test("one bundle root's rejection does not discard another root's already-resolved drift findings (LORE-27 regression)", async () => {
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    writeFileSync(join(root, "a", "index.md"), "# A\n\nClean.\n");
    writeFileSync(join(root, "b", "index.md"), "# B\n\nClean.\n");
    writeFileSync(join(root, "a", "x.md"), storyDoc("A", ["lore-1"], "done")); // stale (empty) block -- real drift
    writeFileSync(join(root, "b", "x.md"), storyDoc("B", ["lore-99"], "todo")); // lore-99 does not exist -- rejects
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = { root, output: JSON_CTX, args: ["a", "b"], adapter, stdout: capture(), stderr: capture() };
    await expect(runCheck(o)).rejects.toThrow(/lore-99/);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    // Root "a"'s managed-block-drift finding survives even though root "b" failed outright.
    expect(
      parsed.data.findings.some(
        (f: { rule: string; file: string }) => f.rule === "managed-block-drift" && f.file === "a/x.md",
      ),
    ).toBe(true);
  });

  test("one bundle root's concept-scan failure does not discard another root's drift findings (LORE-27 regression)", async () => {
    // Distinct from the test above: this failure originates in the concept-scan pass
    // (tryConceptsForBundle, which itself runs synchronously per root), before any async
    // reconciliation even begins -- a bare `bundles.map()` over that scan would abort for EVERY
    // root the instant one root's scan throws, discarding drift that was never even computed for
    // the others (not just already-computed-and-lost). The overall runCheck() call is still async
    // either way (needsReconciliation is true), same as every other reconciliation-rejection test.
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    writeFileSync(join(root, "a", "index.md"), "# A\n\nClean.\n");
    writeFileSync(join(root, "b", "index.md"), "# B\n\nClean.\n");
    writeFileSync(join(root, "a", "x.md"), storyDoc("A", ["lore-1"], "done")); // stale (empty) block -- real drift
    writeFileSync(
      join(root, "b", "bad.md"),
      "---\ntype: Story\nstatus: 12345\ntasks:\n  - lore-1\n---\n# Bad\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = { root, output: JSON_CTX, args: ["a", "b"], adapter, stdout: capture(), stderr: capture() };
    await expect(runCheck(o)).rejects.toThrow(/invalid Story frontmatter/);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(
      parsed.data.findings.some(
        (f: { rule: string; file: string }) => f.rule === "managed-block-drift" && f.file === "a/x.md",
      ),
    ).toBe(true);
  });

  test("a non-docs bundle root's drift message never suggests `lore sync` (it can't fix that root)", async () => {
    mkdirSync(join(root, "alt"), { recursive: true });
    writeFileSync(join(root, "alt", "index.md"), "# Alt\n\nClean.\n");
    writeFileSync(join(root, "alt", "x.md"), storyDoc("X", ["lore-1"], "done")); // stale (empty) block
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = { root, output: JSON_CTX, args: ["alt"], adapter, stdout: capture(), stderr: capture() };
    await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    const drift = parsed.data.findings.find((f: { rule: string }) => f.rule === "managed-block-drift");
    expect(drift.message).not.toContain("lore sync");
  });

  test("a non-canonical spelling of the docs root (./docs) still gets the `lore sync` hint (LORE-27 regression)", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "done")); // stale (empty) block
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = { root, output: JSON_CTX, args: ["./docs"], adapter, stdout: capture(), stderr: capture() };
    await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    const drift = parsed.data.findings.find((f: { rule: string }) => f.rule === "managed-block-drift");
    expect(drift.message).toContain("lore sync");
  });

  test("a concept with tasks: but no managed-block markers is a fail-loud validation error", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nNo markers here.\n");
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const result = runCheck(opts([], adapter));
    await expect(result).rejects.toThrow(LoreError);
    await expect(result).rejects.toThrow(/managed task region/);
  });

  test("a later concept's malformed managed-block markers do not discard an earlier concept's drift finding in the SAME root (LORE-27 regression)", async () => {
    writeDoc("stories/a.md", storyDoc("A", ["lore-1"], "done")); // stale (empty) block -- real drift
    writeDoc("stories/b.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nNo markers here.\n"); // malformed; processed after a.md
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    await expect(runCheck(o)).rejects.toThrow(/managed task region/);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(
      parsed.data.findings.some(
        (f: { rule: string; file: string }) => f.rule === "managed-block-drift" && f.file === "stories/a.md",
      ),
    ).toBe(true);
  });

  test("a later file's scan failure does not discard an earlier file's already-scanned concept in the SAME bundle (LORE-27 regression)", async () => {
    // Distinct from the test above (which fails during reconcileDriftFindings, after the scan
    // already succeeded): this file fails during the concept-SCAN stage itself
    // (tryConceptsForBundle). An earlier version shared one try/catch across that whole loop, so
    // this failure silently discarded stories/a.md's ALREADY-collected concept too, not just
    // stories/bad.md's -- losing a.md's real drift finding entirely, before reconciliation even ran.
    writeDoc("stories/a.md", storyDoc("A", ["lore-1"], "done")); // stale (empty) block -- real drift, scans fine
    writeDoc(
      "stories/bad.md", // processed after a.md; malformed AND tasks:-linked -- fails during the scan itself
      "---\ntype: Story\nstatus: 12345\ntasks:\n  - lore-1\n---\n# Bad\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = opts([], adapter);
    await expect(runCheck(o)).rejects.toThrow(/invalid Story frontmatter/);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(
      parsed.data.findings.some(
        (f: { rule: string; file: string }) => f.rule === "managed-block-drift" && f.file === "stories/a.md",
      ),
    ).toBe(true);
  });

  test("a tasks:-linked concept violating a custom-profile-required field is caught by check's own scan, matching validate/query/sync (LORE-89)", async () => {
    // The built-in default Story schema has no "owner" field at all, so this doc would otherwise
    // pass check silently (the exact false negative LORE-89 fixes) — the project's own profile
    // requires it, and lore query/validate/sync already correctly reject the identical file.
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      `[profile]\nname = "custom"\nokf_version = "0.1"\n\n[base.fields]\ntype = { required = true }\n\n[[types]]\nname = "Story"\nfields = { owner = { required = true } }\n`,
    );
    writeDoc(
      "stories/x.md",
      "---\ntype: Story\ntasks:\n  - lore-1\n---\n# X\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const result = runCheck(opts([], adapter));
    await expect(result).rejects.toThrow(LoreError);
    await expect(result).rejects.toThrow(/owner/);
  });

  test("a tasks:-linked concept satisfying the custom profile's required field passes check cleanly (LORE-89, no regression)", async () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      `[profile]\nname = "custom"\nokf_version = "0.1"\n\n[base.fields]\ntype = { required = true }\n\n[[types]]\nname = "Story"\nfields = { owner = { required = true } }\n`,
    );
    const doc = regenerateTaskBlock(
      "---\ntype: Story\ntitle: X\nowner: alice\nstatus: done\ntasks:\n  - lore-1\n---\n# X\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
      [doneRow],
      { docPath: "docs/stories/x.md" },
    );
    writeDoc("stories/x.md", doc);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const code = await runCheck(opts([], adapter));
    expect(code).toBe(EXIT_OK);
  });

  test("a reserved-stem concept (index/log) is never reconciled even if it carries tasks:", async () => {
    writeFileSync(
      join(root, "docs", "index.md"),
      "---\ntype: Reference\ntitle: Documentation\ntasks:\n  - lore-1\n---\n# Documentation\n\n<!-- lore:index:begin -->\n<!-- lore:index:end -->\n",
    );
    const poison = new Proxy(
      {},
      {
        get(): never {
          throw new Error("no adapter method should ever be called for a reserved-stem concept");
        },
      },
    ) as BacklogAdapter;

    expect(runCheck(opts([], poison))).toBe(EXIT_OK); // synchronous: the only tasks:-carrying concept is reserved
  });

  test("two bundle roots are each reconciled independently, findings labeled by root", async () => {
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    writeFileSync(join(root, "a", "index.md"), "# A\n\nClean.\n");
    writeFileSync(join(root, "b", "index.md"), "# B\n\nClean.\n");
    writeFileSync(join(root, "a", "x.md"), storyDoc("A", ["lore-1"], "done")); // stale (empty) block
    let calls = 0;
    const base = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const adapter: BacklogAdapter = {
      ...base,
      async viewTask(id: string) {
        calls++;
        return base.viewTask(id);
      },
    };

    const o = { root, output: JSON_CTX, args: ["a", "b"], adapter, stdout: capture(), stderr: capture() };
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_CODES.validation);
    expect(parsed.data.findings).toHaveLength(1);
    expect(parsed.data.findings[0].rule).toBe("managed-block-drift");
    expect(parsed.data.findings[0].file).toBe("a/x.md"); // labeled by its root, same convention as link/anchor findings
    expect(calls).toBe(1); // one adapter instance shared across both roots -- its capability probe runs once
  });

  test("a task id linked from concepts in two different bundle roots is resolved exactly once (LORE-50)", async () => {
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    writeFileSync(join(root, "a", "index.md"), "# A\n\nClean.\n");
    writeFileSync(join(root, "b", "index.md"), "# B\n\nClean.\n");
    writeFileSync(join(root, "a", "x.md"), storyDoc("A", ["lore-1"], "done")); // stale (empty) block -- real drift
    writeFileSync(join(root, "b", "x.md"), storyDoc("B", ["LORE-1"], "done")); // SAME task id (different casing), different root
    let calls = 0;
    const base = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const adapter: BacklogAdapter = {
      ...base,
      async viewTask(id: string) {
        calls++;
        return base.viewTask(id);
      },
    };

    const o = { root, output: JSON_CTX, args: ["a", "b"], adapter, stdout: capture(), stderr: capture() };
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_CODES.validation);
    // Both roots' own stale managed-block is still found independently...
    const files = parsed.data.findings.map((f: { file: string }) => f.file).sort();
    expect(files).toEqual(["a/x.md", "b/x.md"]);
    // ...but the shared task id is fetched from Backlog exactly once for the whole run, not once per root.
    expect(calls).toBe(1);
  });

  test("a status-flow override resolved once applies uniformly across every bundle root (LORE-50)", async () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "config.toml"), '[reconcile.overrides]\nCancelled = "done"\n');
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    writeFileSync(join(root, "a", "index.md"), "# A\n\nClean.\n");
    writeFileSync(join(root, "b", "index.md"), "# B\n\nClean.\n");
    writeFileSync(join(root, "a", "x.md"), storyDoc("A", ["lore-1"], "todo")); // stale status; LORE-1 is Cancelled
    writeFileSync(join(root, "b", "x.md"), storyDoc("B", ["lore-2"], "todo")); // stale status; LORE-2 is also Cancelled
    const adapter = fakeAdapter([
      makeTask("LORE-1", { status: "Cancelled" }),
      makeTask("LORE-2", { status: "Cancelled" }),
    ]);

    const o = { root, output: JSON_CTX, args: ["a", "b"], adapter, stdout: capture(), stderr: capture() };
    const code = await runCheck(o);
    const parsed = JSON.parse((o.stdout as ReturnType<typeof capture>).text());
    expect(code).toBe(EXIT_CODES.validation);
    const statusDrifts = parsed.data.findings.filter((f: { rule: string }) => f.rule === "status-drift");
    // Without the override, an unrecognized "Cancelled" status would fail loud (validation error)
    // instead of producing a status-drift finding -- both roots reconciling successfully proves the
    // resolved config correctly reached both roots. This does NOT by itself prove the config was read
    // only ONCE (a per-root re-read of the same file would produce an identical result) -- that half of
    // LORE-50's AC #2 is covered instead by reconcile-shared.test.ts's "configOverride bypasses disk
    // entirely" test, which proves the underlying mechanism `resolveSharedReconciliation` depends on:
    // a caller holding an already-resolved config never touches disk again for it.
    expect(statusDrifts.map((f: { file: string }) => f.file).sort()).toEqual(["a/x.md", "b/x.md"]);
    for (const finding of statusDrifts) {
      expect((finding as { message: string }).message).toContain("done");
    }
  });

  test("a bundle root's own concept-scan error still wins over another root's shared config failure, in argument order (LORE-50 regression)", async () => {
    // Reproduces the exact regression an earlier version of the LORE-50 pooling introduced: root "b"
    // has its OWN scan error (a malformed concept -- no Backlog IO involved at all) and comes FIRST in
    // argument order; root "a" has a real eligible concept that only fails because the shared config
    // is ALSO broken. A version that short-circuited computeDriftFindings on the pooled config failure
    // discarded b's own (more specific, actionable) scan error in favor of the generic
    // config-validation error, regardless of argument order -- breaking the documented "first error,
    // in bundle-argument order" contract.
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "config.toml"), '[reconcile.overrides]\nCancelled = "bogus"\n');
    mkdirSync(join(root, "a"), { recursive: true });
    mkdirSync(join(root, "b"), { recursive: true });
    writeFileSync(join(root, "a", "index.md"), "# A\n\nClean.\n");
    writeFileSync(join(root, "b", "index.md"), "# B\n\nClean.\n");
    writeFileSync(join(root, "a", "x.md"), storyDoc("A", ["lore-1"], "done")); // real eligible concept
    writeFileSync(
      join(root, "b", "bad.md"), // b's ONLY concept fails to scan at all -- b collects zero concepts
      "---\ntype: Story\nstatus: 12345\ntasks:\n  - lore-2\n---\n# Bad\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const o = { root, output: JSON_CTX, args: ["b", "a"], adapter, stdout: capture(), stderr: capture() };
    await expect(runCheck(o)).rejects.toThrow(/invalid Story frontmatter/);
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
    return { cwd, env: {}, isTTY: false, stdout: capture(), stderr: capture(), resolveHost: ALLOW_ALL_HOSTS };
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

  test("`lore check` forwards RunContext.adapter for reconciliation (LORE-27 regression)", async () => {
    // Before the fix, cli.ts's dispatch() never passed context.adapter through to runCheck (unlike
    // link/unlink/rename/sync), so this injected fake was silently ignored in favor of the real
    // `backlog` binary on PATH. A distinctive poisoned-view failure proves THIS adapter was reached:
    // the real adapter (a bare temp dir with no backlog/ at all) would fail differently (a capability
    // probe error), not with this exact message.
    writeFileSync(join(cwd, "docs", "x.md"), storyDoc("X", ["lore-1"], "done"));
    const poison = fakeAdapter([], { poisonViews: ["lore-1"] });
    const c = { ...ctx(), adapter: poison };
    const code = await run(["bun", "lore", "check", "--plain"], c);
    expect(code).toBe(EXIT_UNCAUGHT);
    expect((c.stderr as ReturnType<typeof capture>).text()).toContain("simulated Backlog read failure viewing lore-1");
  });
});
