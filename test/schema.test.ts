import { describe, expect, test } from "bun:test";
import {
  CANONICAL_KEY_ORDER,
  declaredKnownFields,
  isKnownType,
  KNOWN_TYPES,
  OKF_VERSION,
  schemaForType,
  validateFrontmatter,
} from "../src/core/schema";
import { EXIT_CODES, LoreError, WarningCollector } from "../src/errors";

/** Assert `fn` throws a `validation` {@link LoreError}, returning it for further assertions. */
function expectValidation(fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("validation");
    return err as LoreError;
  }
  throw new Error("expected validateFrontmatter to throw a validation LoreError, but it returned");
}

describe("schema — the known-type profile", () => {
  test("KNOWN_TYPES is exactly the six story-convention types", () => {
    expect([...KNOWN_TYPES]).toEqual(["Epic", "Story", "Spec", "ADR", "Runbook", "Reference"]);
  });

  test("isKnownType narrows known vs unknown types", () => {
    expect(isKnownType("Story")).toBe(true);
    expect(isKnownType("Glossary")).toBe(false);
  });

  test("schemaForType resolves a schema for known types and undefined for unknown", () => {
    for (const type of KNOWN_TYPES) {
      expect(schemaForType(type)).toBeDefined();
    }
    expect(schemaForType("Glossary")).toBeUndefined();
  });

  test("CANONICAL_KEY_ORDER covers every schema-declared field (drift guard)", () => {
    // Single-source guard: a field added to a schema but forgotten in CANONICAL_KEY_ORDER
    // would silently serialize into the unknown-key tail in arbitrary order. Pin that the
    // canonical order is a superset of every declared field so that drift fails loudly here.
    const ordered = new Set<string>(CANONICAL_KEY_ORDER);
    for (const field of declaredKnownFields()) {
      expect(ordered.has(field)).toBe(true);
    }
  });
});

describe("schema — the error tier (throws, exit 6)", () => {
  test("validation maps to exit 6", () => {
    expect(EXIT_CODES.validation).toBe(6);
  });

  test("a missing `type` is the OKF §9 floor error", () => {
    const err = expectValidation(() => validateFrontmatter({ title: "no type" }));
    expect(err.message).toContain("missing a `type`");
  });

  test("the error envelope's input.path is the clean path, not the ` in <path>` display string", () => {
    const err = expectValidation(() => validateFrontmatter({ title: "no type" }, { path: "stories/foo.md" }));
    // Regression: input.path must be the real path an agent can open, not "in stories/foo.md".
    expect(err.input).toEqual({ path: "stories/foo.md" });
    expect(err.message).toContain("in stories/foo.md"); // ...while the human message still reads naturally
  });

  test("an empty or whitespace-only `type` is rejected", () => {
    for (const type of ["", "   "]) {
      expectValidation(() => validateFrontmatter({ type }));
    }
  });

  test("a present-but-non-string `type` is rejected as invalid, not reported as missing", () => {
    // A YAML `type: 2026` resolves to a number; the diagnostic must say "invalid"
    // (and hint to quote it), not "missing" — the field is present.
    const err = expectValidation(() => validateFrontmatter({ type: 2026 }));
    expect(err.message).toContain("invalid `type`");
    expect(err.message).not.toContain("missing");
  });

  test("a known type with a mistyped field throws, naming the field", () => {
    const err = expectValidation(() => validateFrontmatter({ type: "Story", tags: "orders" }));
    expect(err.message).toContain("Story");
    expect(err.message).toContain("tags");
    // The structured `input` echoes the offending field so a consumer needn't re-derive it.
    expect(err.input).toMatchObject({ type: "Story", issues: [{ path: "tags" }] });
  });

  test("a known type with a non-ISO timestamp throws (dates are strict ISO datetimes)", () => {
    const err = expectValidation(() => validateFrontmatter({ type: "ADR", timestamp: "last tuesday" }));
    expect(err.message).toContain("timestamp");
  });

  test("a date-only timestamp is rejected — lore emits full datetimes", () => {
    expectValidation(() => validateFrontmatter({ type: "ADR", timestamp: "2026-06-21" }));
  });
});

describe("schema — the warning tier (never throws)", () => {
  test("an empty (null) known field is tolerated, not a hard error", () => {
    // YAML `status:` / `tags:` with no value parse to null; an empty recommended field
    // is OKF-tolerated and must NOT be promoted to a fatal validation error (exit 6).
    expect(() =>
      validateFrontmatter({ type: "Story", title: null, tags: null, status: null, timestamp: null }),
    ).not.toThrow();
  });

  test("a whitespace-padded known type classifies on its trimmed value and fails loudly (not silent-unknown)", () => {
    // `type: " Story "` must not be silently demoted to an unvalidated unknown type:
    // it classifies as Story and then fails the literal check, surfacing the error.
    const err = expectValidation(() => validateFrontmatter({ type: " Story " }));
    expect(err.message).toContain("Story");
  });

  test("validateFrontmatter returns the resolved, trimmed type", () => {
    expect(validateFrontmatter({ type: "Reference", summary: "s" })).toBe("Reference");
    expect(validateFrontmatter({ type: " Glossary " })).toBe("Glossary");
  });

  test("a fully-valid known concept produces no warnings", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Story", title: "T", summary: "One line.", timestamp: "2026-06-21T00:00:00Z", tasks: ["LORE-1"] },
      { warnings },
    );
    expect(warnings.isEmpty).toBe(true);
  });

  test("an unknown type warns and validates on `type` only (never throws)", () => {
    const warnings = new WarningCollector();
    // Arbitrary extra keys on an unknown type must NOT throw (OKF tolerance, AC#2).
    expect(() =>
      validateFrontmatter({ type: "Glossary", anything: { nested: true }, count: 3 }, { warnings }),
    ).not.toThrow();
    expect(warnings.list().some((w) => w.includes('unknown type "Glossary"'))).toBe(true);
  });

  test("an extra key on a known type warns but does not throw", () => {
    const warnings = new WarningCollector();
    expect(() =>
      validateFrontmatter({ type: "Reference", title: "T", custom_key: "kept" }, { warnings }),
    ).not.toThrow();
    expect(warnings.list().some((w) => w.includes('unknown key "custom_key"'))).toBe(true);
  });

  test("okf_version is an OKF-reserved key, not flagged as unknown (the root index carries it)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", title: "T", summary: "s", okf_version: OKF_VERSION }, { warnings });
    expect(warnings.list().some((w) => w.includes("okf_version"))).toBe(false);
  });

  test("a missing summary warns", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", title: "T" }, { warnings });
    expect(warnings.list().some((w) => w.includes("missing `summary`"))).toBe(true);
  });

  test("a cleared (null) summary also warns — .nullish() must not let it pass silently", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: null }, { warnings });
    expect(warnings.list().some((w) => w.includes("missing `summary`"))).toBe(true);
  });

  test("an over-long summary warns with its length", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: "x".repeat(250) }, { warnings });
    expect(warnings.list().some((w) => w.includes("250 chars"))).toBe(true);
  });

  test("warnings are dropped silently when no collector is passed (core stays pure)", () => {
    expect(() => validateFrontmatter({ type: "Glossary", extra: 1 })).not.toThrow();
  });

  test("the path is woven into diagnostics when provided", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Glossary" }, { warnings, path: "notes/x.md" });
    expect(warnings.list().some((w) => w.includes("in notes/x.md"))).toBe(true);
  });
});
