import { describe, expect, test } from "bun:test";
import { idFromPath } from "../src/core/concept";
import {
  decodeTarget,
  isExternalTarget,
  type LinkFinding,
  normalizeLink,
  stripFragment,
  stripQuery,
  validateLink,
} from "../src/core/links";

// ── normalizeLink: the canonical writer ──────────────────────────────────────────

describe("normalizeLink — relative computation", () => {
  test("links to a sibling file as a bare relative name (no ./ prefix)", () => {
    expect(normalizeLink("reference/orders.md", "reference/customers.md")).toBe("customers.md");
  });

  test("links to another subtree from the linking file's directory", () => {
    expect(normalizeLink("stories/bulk-archive.md", "reference/orders.md")).toBe("../reference/orders.md");
  });

  test("links down into a nested directory", () => {
    expect(normalizeLink("index.md", "reference/orders.md")).toBe("reference/orders.md");
  });

  test("crosses out of the bundle for a docs/-to-backlog link (same coordinate space)", () => {
    expect(normalizeLink("docs/stories/x.md", "backlog/tasks/task-42.md")).toBe("../../backlog/tasks/task-42.md");
  });

  test("never emits a leading slash", () => {
    expect(normalizeLink("a/b/c.md", "d/e.md").startsWith("/")).toBe(false);
  });

  test("is cwd-independent for a `..`-escaping fromPath (rooted at a virtual /)", () => {
    expect(normalizeLink("a/../b/x.md", "b/y.md")).toBe("y.md");
  });

  test("rejects an absolute operand as a caller bug (LORE-48 guard)", () => {
    expect(() => normalizeLink("/abs/x.md", "reference/orders.md")).toThrow(/relative paths/);
    expect(() => normalizeLink("stories/x.md", "/abs/orders.md")).toThrow(/relative paths/);
  });
});

describe("normalizeLink — .md suffix", () => {
  test("adds the .md suffix when the target is a bare concept id", () => {
    expect(normalizeLink("stories/x.md", "reference/orders")).toBe("../reference/orders.md");
  });

  test("keeps an existing .md suffix without doubling it", () => {
    expect(normalizeLink("stories/x.md", "reference/orders.md")).toBe("../reference/orders.md");
  });

  test("does not require the linking file to carry a .md suffix (uses its directory only)", () => {
    expect(normalizeLink("stories/x", "reference/orders.md")).toBe("../reference/orders.md");
  });

  test("coerces a wrong-case .MD suffix to canonical lowercase .md", () => {
    expect(normalizeLink("stories/x.md", "reference/orders.MD")).toBe("../reference/orders.md");
  });
});

describe("normalizeLink — URL encoding", () => {
  test("percent-encodes spaces in a segment but leaves the / separators literal", () => {
    expect(normalizeLink("stories/x.md", "reference/order schema.md")).toBe("../reference/order%20schema.md");
  });

  test("encodes a spaced Backlog task filename", () => {
    expect(normalizeLink("docs/stories/x.md", "backlog/tasks/task-42 - Bulk archive.md")).toBe(
      "../../backlog/tasks/task-42%20-%20Bulk%20archive.md",
    );
  });

  test("encodes a space exactly once — never double-encodes to %2520", () => {
    const link = normalizeLink("stories/x.md", "reference/order schema.md");
    expect(link).toContain("%20");
    expect(link).not.toContain("%2520");
  });

  test("escapes parentheses (encodeURIComponent leaves them raw and they break markdown destinations)", () => {
    expect(normalizeLink("docs/stories/x.md", "backlog/tasks/task-12 - Archive (legacy).md")).toBe(
      "../../backlog/tasks/task-12%20-%20Archive%20%28legacy%29.md",
    );
  });

  test("the writer's output passes the linter (validateLink(normalizeLink(...)) is clean)", () => {
    const link = normalizeLink("docs/stories/x.md", "backlog/tasks/task-12 - Archive (legacy).md");
    expect(validateLink(link)).toEqual([]);
  });

  test("is deterministic: same inputs yield the same output (regenerate-and-compare safe)", () => {
    const a = normalizeLink("stories/x.md", "reference/order schema.md", "h");
    const b = normalizeLink("stories/x.md", "reference/order schema.md", "h");
    expect(a).toBe(b);
  });
});

describe("normalizeLink — anchors", () => {
  test("appends a pre-slugified heading anchor verbatim", () => {
    expect(normalizeLink("stories/x.md", "reference/orders.md", "archival-policy")).toBe(
      "../reference/orders.md#archival-policy",
    );
  });

  test("omits the # when no anchor is given", () => {
    expect(normalizeLink("stories/x.md", "reference/orders.md")).toBe("../reference/orders.md");
  });

  test("an empty anchor string is treated as no anchor", () => {
    expect(normalizeLink("stories/x.md", "reference/orders.md", "")).toBe("../reference/orders.md");
  });
});

// ── validateLink: the per-link portability classifier ─────────────────────────────

/** The set of issue kinds a target produces, for terse assertions. */
function issues(target: string): LinkFinding["issue"][] {
  return validateLink(target).map((f) => f.issue);
}

describe("validateLink — portable links pass clean", () => {
  test("a relative, encoded, .md-suffixed link has no findings", () => {
    expect(validateLink("../reference/orders.md")).toEqual([]);
  });

  test("a sibling link is clean", () => {
    expect(validateLink("customers.md")).toEqual([]);
  });

  test("an already-encoded space is clean (no double-encoding demand)", () => {
    expect(validateLink("../reference/order%20schema.md")).toEqual([]);
  });

  test("accepts valid lowercase-hex percent-encoding (RFC-3986 case-insensitive)", () => {
    expect(validateLink("../reference/caf%c3%a9.md")).toEqual([]);
  });

  test("a link with a heading anchor is clean (the fragment is ignored for the form)", () => {
    expect(validateLink("../reference/orders.md#archival-policy")).toEqual([]);
  });
});

describe("validateLink — external destinations are not linted", () => {
  test.each([
    "",
    "#archival-policy",
    "http://example.com/x",
    "https://example.com",
    "mailto:a@b.co",
    "//cdn/x.md",
  ])("external/anchor-only target %p yields no findings", (target) => {
    expect(validateLink(target)).toEqual([]);
  });

  test("flags an accidental-colon filename read as a scheme (notes:2026 draft.md) — LORE-48", () => {
    expect(issues("notes:2026 draft.md")).toEqual(["accidental-colon"]);
  });

  test("a real scheme whose tail is not a .md file stays clean (mailto:, http://…)", () => {
    expect(validateLink("mailto:team@x.md.co")).toEqual([]);
    expect(validateLink("https://example.com/page.md")).toEqual([]);
  });

  test("a known scheme whose value ends in the .md TLD is NOT an accidental colon (LORE-48 review)", () => {
    // `.md` is the Moldova TLD, so "ends in .md" alone must not flag a real URL. A known scheme,
    // a `/`-tail, or an `@`-tail all mark it as a genuine link, not a mistyped filename.
    expect(validateLink("mailto:doctor@clinic.md")).toEqual([]);
    expect(validateLink("https://news.md")).toEqual([]);
    expect(validateLink("file:///notes/x.md")).toEqual([]);
  });
});

describe("validateLink — leading slash", () => {
  test("flags a /-absolute link", () => {
    expect(issues("/reference/orders.md")).toEqual(["leading-slash"]);
  });

  test("a /-absolute extensionless link is both leading-slash and missing-extension", () => {
    expect(issues("/reference/orders").sort()).toEqual(["leading-slash", "missing-extension"]);
  });
});

describe("validateLink — missing extension", () => {
  test("flags an internal link without a .md suffix", () => {
    expect(issues("../reference/orders")).toEqual(["missing-extension"]);
  });

  test("does NOT flag a non-.md asset link (it has an extension; resolver ignores it, not a dropped suffix)", () => {
    expect(issues("../img/diagram.png")).toEqual([]);
  });

  test("flags a dotted extensionless concept link (orders.v2 for orders.v2.md) as missing-extension (LORE-152)", () => {
    // "v2" is not a recognized asset extension, so this is presumed a dropped .md suffix rather
    // than an opaque asset — the shape that used to be invisible to both the portability lint and
    // the broken-link existence check (bundle.ts/check.ts both gate on a literal .md suffix).
    expect(issues("orders.v2")).toEqual(["missing-extension"]);
    expect(issues("../reference/orders.v2")).toEqual(["missing-extension"]);
  });

  test("ignores the fragment when checking the extension", () => {
    expect(validateLink("../reference/orders.md#h")).toEqual([]);
  });
});

describe("validateLink — unencoded segments", () => {
  test("flags a raw space in a segment", () => {
    expect(issues("../reference/order schema.md")).toEqual(["unencoded"]);
  });

  test("flags malformed percent-escaping", () => {
    expect(issues("../reference/order%2.md")).toEqual(["unencoded"]);
  });

  test("flags raw parentheses (markdown-significant, left raw by encodeURIComponent)", () => {
    expect(issues("../tasks/Archive (legacy).md")).toEqual(["unencoded"]);
  });

  test("reports a single unencoded finding even with several bad segments", () => {
    expect(issues("../a b/c d.md")).toEqual(["unencoded"]);
  });

  test("carries the offending target and a message on each finding", () => {
    const [finding] = validateLink("/reference/orders.md");
    expect(finding?.target).toBe("/reference/orders.md");
    expect(finding?.message).toContain("/reference/orders.md");
  });
});

// ── validateLink: the folded PR #19 /code-review classifier defects (LORE-30) ─────

describe("validateLink — wrong-case .md suffix (404s on a case-sensitive host)", () => {
  test("flags an uppercase .MD as missing the lowercase suffix", () => {
    expect(issues("../reference/orders.MD")).toEqual(["missing-extension"]);
  });

  test("flags a mixed-case .Md", () => {
    expect(issues("orders.Md")).toEqual(["missing-extension"]);
  });
});

describe("validateLink — dotfile and directory links", () => {
  test("does NOT flag a dotfile link (.gitignore is an asset, not a missing .md)", () => {
    expect(issues("../config/.gitignore")).toEqual([]);
  });

  test("flags a trailing-slash directory link as directory-link (LORE-48), not missing-extension", () => {
    expect(issues("../reference/")).toEqual(["directory-link"]);
  });

  test("a /-absolute directory link is both leading-slash and directory-link", () => {
    expect(issues("/reference/").sort()).toEqual(["directory-link", "leading-slash"]);
  });
});

describe("validateLink — destination-breaking chars in the fragment/query", () => {
  test("flags a raw space inside a #fragment (it truncates the destination)", () => {
    expect(issues("orders.md#Archival Policy")).toEqual(["unencoded"]);
  });

  test("flags a raw space inside a ?query", () => {
    expect(issues("orders.md?v=draft 2")).toEqual(["unencoded"]);
  });

  test("a normal slugified anchor is clean", () => {
    expect(validateLink("orders.md#archival-policy")).toEqual([]);
  });
});

describe("validateLink — accepts valid but non-canonical encoding", () => {
  test("does NOT flag an over-encoded segment (a%41b.md == aAb.md everywhere)", () => {
    expect(validateLink("../reference/a%41b.md")).toEqual([]);
  });

  test("an over-encoded extension dot (orders%2Emd) is read as .md, not a dropped suffix", () => {
    expect(validateLink("orders%2Emd")).toEqual([]);
  });
});

describe("validateLink — interior double slash", () => {
  test("flags an empty interior path segment (a//b.md)", () => {
    expect(issues("a//b.md")).toEqual(["unencoded"]);
  });

  test("the empty-segment message names the // problem, not 'encode a space'", () => {
    const [finding] = validateLink("a//b.md");
    expect(finding?.message).toContain('"//"');
  });
});

describe("validateLink — writer/linter agree on the canonical alphabet", () => {
  test.each([
    "../reference/order!.md",
    "../ref/it's.md",
    "../ref/order*.md",
  ])("flags a raw char the writer percent-encodes: %p", (target) => {
    expect(issues(target)).toEqual(["unencoded"]);
  });

  test("still accepts an over-encoded segment (does not regress the defect-5 fix)", () => {
    expect(validateLink("../reference/a%41b.md")).toEqual([]);
  });
});

describe("validateLink — malformed percent-escape gets its own message", () => {
  test("a malformed % escape is flagged with a distinct, non-'space' message", () => {
    const [finding] = validateLink("../reference/order%2.md");
    expect(finding?.issue).toBe("unencoded");
    expect(finding?.message).toContain("malformed");
  });
});

// ── Shared destination classifiers (the bundle graph reuses these) ────────────────

describe("isExternalTarget", () => {
  test.each([
    ["", true],
    ["#anchor", true],
    ["//cdn/x.md", true],
    ["http://x", true],
    ["mailto:a@b", true],
    ["../reference/orders.md", false],
    ["/reference/orders.md", false],
    ["orders.md", false],
  ])("classifies %p as external=%p", (input, expected) => {
    expect(isExternalTarget(input as string)).toBe(expected);
  });
});

describe("stripFragment / stripQuery", () => {
  test("stripFragment drops the #fragment", () => {
    expect(stripFragment("../x.md#sec")).toBe("../x.md");
  });

  test("stripQuery drops the ?query", () => {
    expect(stripQuery("../x.md?v=1")).toBe("../x.md");
  });

  test("both are no-ops when the marker is absent", () => {
    expect(stripQuery(stripFragment("../x.md"))).toBe("../x.md");
  });
});

describe("decodeTarget", () => {
  test("URL-decodes a percent-encoded target", () => {
    expect(decodeTarget("order%20schema.md")).toBe("order schema.md");
  });

  test("decodes one level only (so %2520 -> %20, not a space)", () => {
    expect(decodeTarget("%2520")).toBe("%20");
  });

  test("degrades to the raw text on malformed encoding", () => {
    expect(decodeTarget("%2")).toBe("%2");
  });

  // ── LORE-151: %2F must not forge a structural / boundary ──────────────────────

  test("an encoded slash within a single segment is not decoded into a literal /", () => {
    expect(decodeTarget("orders%2Fv2.md")).toBe("orders%2Fv2.md");
  });

  test("a literal orders%2Fv2.md target does not resolve to the concept id orders/v2 (AC#2)", () => {
    // Mirrors how bundle.ts/check.ts turn a decoded destination into a concept id:
    // idFromPath(decodeTarget(target)). Before the fix, decodeTarget whole-string-decoded
    // "orders%2Fv2.md" into "orders/v2.md", so this id came out "orders/v2" — a two-segment
    // id the link's literal, single-segment text never named.
    const id = idFromPath(decodeTarget("orders%2Fv2.md"));
    expect(id).not.toBe("orders/v2");
  });

  test("an encoded slash does not merge with a real neighboring segment", () => {
    // Raw target has exactly one *literal* / (between "a%2Fb" and "c.md"); the decoded
    // result must still have exactly one, not two.
    expect(decodeTarget("a%2Fb/c.md")).toBe("a%2Fb/c.md");
  });

  test("real segments on either side of an encoded slash still decode normally", () => {
    expect(decodeTarget("order%20a/b%2Fc/order%20d.md")).toBe("order a/b%2Fc/order d.md");
  });

  test("a lowercase %2f is folded back the same way as %2F", () => {
    expect(decodeTarget("orders%2fv2.md")).toBe("orders%2Fv2.md");
  });
});
