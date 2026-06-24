import { describe, expect, test } from "bun:test";
import { type Concept, parseConcept, serializeConcept } from "../src/core/concept";
import { LoreError, WarningCollector } from "../src/errors";

/** A leading UTF-8 BOM, built ASCII-safely so there is no literal U+FEFF in source. */
const BOM = String.fromCharCode(0xfeff);

/** Read an own property's value through its descriptor — so a `__proto__` key reads its data, not the prototype. */
function readOwnKey(obj: Record<string, unknown>, key: string): unknown {
  return Object.getOwnPropertyDescriptor(obj, key)?.value;
}

/** Assert `fn` throws a `validation` {@link LoreError}, returning it for further assertions. */
function expectValidation(fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("validation");
    return err as LoreError;
  }
  throw new Error("expected a validation LoreError, but the call returned");
}

// ── Golden fixtures: exact canonical bytes (design §9.2) ───────────────────────
//
// Each is the byte-for-byte output lore emits, authored in canonical form so that
// `serialize(parse(raw)) === raw`. They are the tripwire for any unintended
// serialization change (a YAML-engine upgrade, an options edit) — if these bytes
// move without a deliberate edit here, a golden fails loudly in review.

const STORY_GOLDEN = `---
type: Story
title: Bulk archive
tags:
  - orders
  - archive
summary: Archive in bulk.
timestamp: 2026-06-21T00:00:00Z
tasks:
  - LORE-1
  - LORE-2
---
# Bulk archive

Archive many orders at once.
`;

const MINIMAL_GOLDEN = `---
type: Reference
---
Body only.
`;

describe("parseConcept — structure", () => {
  test("derives id (path minus .md), mirrors type, and splits frontmatter from body", () => {
    const concept = parseConcept("stories/bulk-archive.md", STORY_GOLDEN);
    expect(concept.id).toBe("stories/bulk-archive");
    expect(concept.path).toBe("stories/bulk-archive.md");
    expect(concept.type).toBe("Story");
    expect(concept.frontmatter.title).toBe("Bulk archive");
    expect(concept.body).toBe("# Bulk archive\n\nArchive many orders at once.\n");
  });

  test("a path without a .md suffix yields an id equal to the path", () => {
    expect(parseConcept("index", MINIMAL_GOLDEN).id).toBe("index");
  });

  test("timestamps stay ISO strings — never coerced to Date (ADR-0006 §2)", () => {
    const concept = parseConcept("x.md", "---\ntype: ADR\ntimestamp: 2026-06-21T00:00:00Z\n---\nB\n");
    expect(typeof concept.frontmatter.timestamp).toBe("string");
    expect(concept.frontmatter.timestamp).toBe("2026-06-21T00:00:00Z");
  });
});

describe("parseConcept — OKF tolerance (AC#2)", () => {
  test("an unknown type parses, validates on type only, and keeps every extra key verbatim", () => {
    const raw = "---\ntype: Glossary\nterm: idempotent\nseealso:\n  - retry\n  - replay\n---\nA definition.\n";
    const warnings = new WarningCollector();
    const concept = parseConcept("notes/idempotent.md", raw, { warnings });
    expect(concept.type).toBe("Glossary");
    expect(concept.frontmatter.term).toBe("idempotent");
    expect(concept.frontmatter.seealso).toEqual(["retry", "replay"]);
    expect(warnings.list().some((w) => w.includes("unknown type"))).toBe(true);
    // ...and the unknown concept still round-trips byte-stably.
    expect(serializeConcept(parseConcept(concept.path, serializeConcept(concept)))).toBe(serializeConcept(concept));
  });

  test("a whitespace-padded unknown type trims for the mirror while frontmatter keeps it verbatim", () => {
    const raw = '---\ntype: " Glossary "\n---\nB\n';
    const warnings = new WarningCollector();
    const concept = parseConcept("notes/x.md", raw, { warnings });
    expect(concept.type).toBe("Glossary"); // resolved/trimmed mirror
    expect(concept.frontmatter.type).toBe(" Glossary "); // verbatim, byte-stable
    expect(warnings.list().some((w) => w.includes("unknown type"))).toBe(true);
  });

  test("an extra key on a known type is preserved and warned, not rejected", () => {
    const raw = "---\ntype: Reference\ntitle: T\ncustom_key: kept\n---\nB\n";
    const warnings = new WarningCollector();
    const concept = parseConcept("reference/x.md", raw, { warnings });
    expect(concept.frontmatter.custom_key).toBe("kept");
    expect(warnings.list().some((w) => w.includes('unknown key "custom_key"'))).toBe(true);
  });
});

describe("parseConcept — error tier (throws validation, exit 6)", () => {
  test("malformed YAML in the frontmatter throws", () => {
    const err = expectValidation(() => parseConcept("x.md", "---\ntype: : :\n  bad\n---\nB\n"));
    expect(err.message).toContain("not valid YAML");
  });

  test("a file with no frontmatter throws (a concept needs at least a type)", () => {
    const err = expectValidation(() => parseConcept("x.md", "# Just a heading\n\nNo frontmatter.\n"));
    expect(err.message).toContain("no usable frontmatter");
  });

  test("an empty frontmatter block throws (no type)", () => {
    expectValidation(() => parseConcept("x.md", "---\n---\nbody\n"));
  });

  test("a null frontmatter block reports the broadened 'no usable frontmatter' diagnostic", () => {
    const err = expectValidation(() => parseConcept("x.md", "---\nnull\n---\nB\n"));
    expect(err.message).toContain("no usable frontmatter");
  });

  test("a non-mapping frontmatter (a bare scalar) throws", () => {
    const err = expectValidation(() => parseConcept("x.md", "---\njust a string\n---\nB\n"));
    expect(err.message).toContain("must be a YAML mapping");
  });

  test("a missing type throws even when other keys are present", () => {
    expectValidation(() => parseConcept("x.md", "---\ntitle: No type here\n---\nB\n"));
  });
});

describe("serializeConcept — golden byte-exactness (design §9.2)", () => {
  test("a Story serializes to its exact golden bytes", () => {
    expect(serializeConcept(parseConcept("stories/bulk-archive.md", STORY_GOLDEN))).toBe(STORY_GOLDEN);
  });

  test("a minimal Reference serializes to its exact golden bytes", () => {
    expect(serializeConcept(parseConcept("reference/x.md", MINIMAL_GOLDEN))).toBe(MINIMAL_GOLDEN);
  });

  test("serialize enforces full write/read symmetry — it never emits bytes parse would reject", () => {
    // No type at all.
    expectValidation(() => serializeConcept({ id: "x", path: "x.md", type: "", frontmatter: {}, body: "B\n" }));
    // A whitespace-padded known type (would fail the literal check on read).
    expectValidation(() =>
      serializeConcept({
        id: "x",
        path: "x.md",
        type: "Story",
        frontmatter: { type: " Story " },
        body: "B\n",
      }),
    );
    // A mistyped known field (would fail the per-type schema on read).
    expectValidation(() =>
      serializeConcept({
        id: "x",
        path: "x.md",
        type: "Story",
        frontmatter: { type: "Story", tags: "notarray" },
        body: "B\n",
      }),
    );
  });

  test("known keys are emitted in canonical order; unknown keys follow verbatim", () => {
    // Input keys are deliberately out of canonical order, with an unknown key last.
    const messy = "---\nsummary: S.\ntype: Reference\ntitle: T\ncustom_key: kept\n---\nBody.\n";
    const canonical = "---\ntype: Reference\ntitle: T\nsummary: S.\ncustom_key: kept\n---\nBody.\n";
    expect(serializeConcept(parseConcept("reference/x.md", messy))).toBe(canonical);
  });
});

describe("serializeConcept — quote-safety (stable, minimal quoting)", () => {
  test("values needing quotes are quoted identically and strings stay strings", () => {
    // Built via an object so we control the exact values: a leading `@` and a `: `
    // sequence force quoting, while a boolean-like ("true") and a leading-zero
    // ("007") string must stay quoted strings rather than become a bool/number.
    const concept: Concept = {
      id: "reference/x",
      path: "reference/x.md",
      type: "Reference",
      frontmatter: { type: "Reference", title: "@handle", description: "a: b", summary: "true", note: "007" },
      body: "B\n",
    };
    const bytes = serializeConcept(concept);
    expect(bytes).toBe(
      '---\ntype: Reference\ntitle: "@handle"\ndescription: "a: b"\nsummary: "true"\nnote: "007"\n---\nB\n',
    );
    // The quoted forms round-trip to the same string values (still strings).
    const back = parseConcept("reference/x.md", bytes).frontmatter;
    expect([back.title, back.description, back.summary, back.note]).toEqual(["@handle", "a: b", "true", "007"]);
  });

  test("a multi-line string serializes as a YAML block scalar and round-trips", () => {
    const concept: Concept = {
      id: "x",
      path: "x.md",
      type: "Reference",
      frontmatter: { type: "Reference", description: "line1\nline2" },
      body: "B\n",
    };
    const bytes = serializeConcept(concept);
    expect(bytes).toContain("description: |-");
    // Round-trips: parsing the block scalar back yields the same multi-line value.
    expect(parseConcept("x.md", bytes).frontmatter.description).toBe("line1\nline2");
    expect(serializeConcept(parseConcept("x.md", bytes))).toBe(bytes);
  });
});

describe("serializeConcept — idempotency & the fixpoint (AC#1, ADR-0011)", () => {
  // The corpus the byte-stability contract is tested against. Each is canonical, so
  // a single round-trip is byte-identical; a second application must be a no-op.
  const CORPUS: Array<{ path: string; raw: string }> = [
    { path: "stories/bulk-archive.md", raw: STORY_GOLDEN },
    { path: "reference/x.md", raw: MINIMAL_GOLDEN },
    {
      path: "notes/g.md",
      raw: "---\ntype: Glossary\nterm: idempotent\nseealso:\n  - retry\n  - replay\n---\nDef.\n",
    },
  ];

  test("round-tripping a canonical doc is byte-identical (AC#1)", () => {
    for (const { path, raw } of CORPUS) {
      expect(serializeConcept(parseConcept(path, raw))).toBe(raw);
    }
  });

  test("a second serialize over the first output is a no-op (fixpoint)", () => {
    for (const { path, raw } of CORPUS) {
      const once = serializeConcept(parseConcept(path, raw));
      const twice = serializeConcept(parseConcept(path, once));
      expect(twice).toBe(once);
    }
  });

  test("a non-canonical input reaches a fixpoint after the first write", () => {
    const messy = "---\nsummary: S.\ntype: Spec\ntitle: T\n---\nBody.\n";
    const first = serializeConcept(parseConcept("specs/x.md", messy));
    const second = serializeConcept(parseConcept("specs/x.md", first));
    expect(second).toBe(first);
  });
});

describe("serializeConcept — prototype-pollution safety", () => {
  test("a literal __proto__ frontmatter key is preserved (not dropped) and never pollutes the prototype", () => {
    const raw = "---\ntype: Glossary\n__proto__: producer-ext\n---\nB\n";
    const concept = parseConcept("x.md", raw);
    // Parsing must not pollute Object.prototype.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const bytes = serializeConcept(concept);
    // The key SURVIVES serialization (the gray-matter.stringify Object.assign trap
    // would silently drop it) and serializing must not pollute either.
    expect(bytes).toContain("__proto__: producer-ext");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // ...and it round-trips byte-stably with the value intact.
    expect(serializeConcept(parseConcept("x.md", bytes))).toBe(bytes);
    expect(readOwnKey(parseConcept("x.md", bytes).frontmatter, "__proto__")).toBe("producer-ext");
  });
});

describe("parseConcept — input normalization & byte-stability for non-canonical inputs (ADR-0011 §8)", () => {
  // The byte-stability contract is a FIXPOINT: a non-canonical input is accepted and
  // normalized to canonical form on the first write, after which writes are identical.
  function expectFixpoint(path: string, raw: string): string {
    const once = serializeConcept(parseConcept(path, raw));
    const twice = serializeConcept(parseConcept(path, once));
    expect(twice).toBe(once);
    return once;
  }

  test("a UTF-8 BOM is normalized away and the result is a fixpoint", () => {
    const bom = `${BOM}---\ntype: Reference\ntitle: T\n---\nBody.\n`;
    const out = expectFixpoint("reference/x.md", bom);
    expect(out.startsWith(BOM)).toBe(false);
    expect(out).toBe("---\ntype: Reference\ntitle: T\n---\nBody.\n");
  });

  test("multiple leading BOMs are all stripped (a single-strip would leave a residual and reject the file)", () => {
    const doubleBom = `${BOM}${BOM}---\ntype: Reference\n---\nB\n`;
    expect(() => parseConcept("reference/x.md", doubleBom)).not.toThrow();
    expect(expectFixpoint("reference/x.md", doubleBom)).toBe("---\ntype: Reference\n---\nB\n");
  });

  test("CRLF line endings are normalized to LF (no mixed endings) and the result is a fixpoint", () => {
    const crlf = "---\r\ntype: Reference\r\ntitle: T\r\n---\r\nBody line.\r\n";
    const out = expectFixpoint("reference/x.md", crlf);
    expect(out.includes("\r")).toBe(false);
    expect(out).toBe("---\ntype: Reference\ntitle: T\n---\nBody line.\n");
  });

  test("blank-line padding before the opening fence is accepted (not rejected) and normalized", () => {
    const padded = "\n\n---\ntype: Reference\n---\nBody.\n";
    // Regression: gray-matter alone sees no frontmatter here and would throw "no frontmatter".
    expect(() => parseConcept("reference/x.md", padded)).not.toThrow();
    const out = expectFixpoint("reference/x.md", padded);
    expect(out).toBe("---\ntype: Reference\n---\nBody.\n");
  });

  test("leading spaces/tabs before the opening fence are stripped (not just blank lines)", () => {
    const padded = "  \t\n---\ntype: Reference\n---\nBody.\n";
    expect(() => parseConcept("reference/x.md", padded)).not.toThrow();
    expect(expectFixpoint("reference/x.md", padded)).toBe("---\ntype: Reference\n---\nBody.\n");
  });

  test("a frontmatter scalar ending in multiple newlines converges (documented limitation)", () => {
    // KNOWN LIMITATION: a scalar value ending in 2+ newlines emits a `|+` keep-chomped
    // block that abuts the closing fence and loses one trailing newline on re-parse, so
    // it normalizes over the SECOND write rather than the first. Frontmatter scalars don't
    // legitimately end in blank lines, so this is a documented edge — but it must still
    // CONVERGE (reach a stable fixpoint), which is what this pins.
    const concept: Concept = {
      id: "x",
      path: "x.md",
      type: "Reference",
      frontmatter: { type: "Reference", description: "a\n\n" },
      body: "B\n",
    };
    const once = serializeConcept(concept);
    const twice = serializeConcept(parseConcept("x.md", once));
    const thrice = serializeConcept(parseConcept("x.md", twice));
    // Converged by the second write and stable thereafter.
    expect(thrice).toBe(twice);
  });

  test("an empty body is serialized verbatim — no trailing newline is invented", () => {
    const raw = "---\ntype: Reference\n---\n";
    expect(serializeConcept(parseConcept("reference/x.md", raw))).toBe(raw);
  });

  test("a body without a trailing newline is preserved byte-for-byte", () => {
    const raw = "---\ntype: Reference\n---\nno trailing newline";
    expect(serializeConcept(parseConcept("reference/x.md", raw))).toBe(raw);
  });

  test("unicode and nested maps round-trip byte-identically", () => {
    const raw = "---\ntype: Reference\ntitle: café — naïve ✓\nnested:\n  a: 1\n  b:\n    - x\n    - y\n---\nBödy.\n";
    expect(serializeConcept(parseConcept("reference/x.md", raw))).toBe(raw);
  });

  test("integer-like extension keys reorder (JS object limitation) but still converge to a fixpoint", () => {
    // DOCUMENTED LIMITATION: js-yaml builds a plain object, so integer-like keys are
    // hoisted ahead in ascending order at parse time — authored order is unrecoverable.
    // The realistic guarantee is convergence, which this pins.
    const raw = "---\ntype: Glossary\n9: nine\n3: three\n---\nB\n";
    const once = serializeConcept(parseConcept("notes/x.md", raw));
    const twice = serializeConcept(parseConcept("notes/x.md", once));
    expect(twice).toBe(once);
  });

  test("a huge unquoted numeric extension value normalizes once (JS double precision) then is a fixpoint", () => {
    // DOCUMENTED LIMITATION: JSON_SCHEMA parses numbers to JS doubles, so a value past
    // 2^53 loses precision on the first write; quoting keeps it exact. Pin convergence.
    const raw = "---\ntype: Glossary\nbig: 12345678901234567890\n---\nB\n";
    const once = serializeConcept(parseConcept("notes/x.md", raw));
    const twice = serializeConcept(parseConcept("notes/x.md", once));
    expect(twice).toBe(once);
    // ...and quoting the value preserves it byte-for-byte (the documented workaround).
    const quoted = '---\ntype: Glossary\nbig: "12345678901234567890"\n---\nB\n';
    expect(serializeConcept(parseConcept("notes/x.md", quoted))).toBe(quoted);
  });
});
