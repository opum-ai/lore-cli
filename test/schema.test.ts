import { describe, expect, test } from "bun:test";
import { defaultProfile } from "../src/core/profile";
import { isKnownType, validateFrontmatter } from "../src/core/schema";
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

describe("schema — the default (story-convention) profile", () => {
  test("the built-in profile is exactly the six story-convention types", () => {
    expect([...defaultProfile().types.keys()]).toEqual(["Epic", "Story", "Spec", "ADR", "Runbook", "Reference"]);
  });

  test("isKnownType narrows known vs unknown types against the default profile", () => {
    expect(isKnownType("Story")).toBe(true);
    expect(isKnownType("Glossary")).toBe(false);
  });

  test("each known type carries a generated validator", () => {
    for (const type of defaultProfile().types.values()) {
      expect(type.schema).toBeDefined();
    }
    expect(defaultProfile().types.get("Glossary")).toBeUndefined();
  });

  test("the canonical key order covers every declared field across all types (drift guard)", () => {
    // A field a type declares but the canonical order omits would serialize into the unknown-key
    // tail in arbitrary order. Pin that the canonical order is a superset of every declared field.
    const profile = defaultProfile();
    const ordered = new Set<string>(profile.canonicalKeyOrder);
    for (const type of profile.types.values()) {
      for (const field of type.declaredFields) {
        expect(ordered.has(field)).toBe(true);
      }
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

  test("a differently-cased known type classifies on its canonical value, not as unknown (LORE-167)", () => {
    // `type: story` must resolve to Story's real schema (case-insensitive classification),
    // not fall into the unknown-type branch and skip validation entirely.
    const warnings = new WarningCollector();
    const err = expectValidation(() => validateFrontmatter({ type: "story", tags: "orders" }, { warnings }));
    // It classified as Story (not "unknown type") and ran Story's schema, surfacing the
    // real field mismatch (`tags` must be a list) rather than silently letting it through.
    expect(err.message).toContain("Story");
    expect(err.message).toContain("tags");
    expect(warnings.list().some((w) => w.includes("unknown type"))).toBe(false);
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

  test("okf_version is exempt on the root index (repo-relative `docs/index.md` path form, LORE-168 AC#2)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "docs/index.md" },
    );
    expect(warnings.list().some((w) => w.includes("okf_version"))).toBe(false);
  });

  test("okf_version is exempt on the root index (bundle-root-relative `index.md` path form, LORE-168 AC#2)", () => {
    // `loadBundle`-backed commands (sync/query/graph/...) reach validateFrontmatter with the root
    // index's path as bare "index.md" (no `docs/` prefix) — both spellings must recognize the root.
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "index.md" },
    );
    expect(warnings.list().some((w) => w.includes("okf_version"))).toBe(false);
  });

  test("okf_version on a non-root concept surfaces the extra-key conformance warning (LORE-168 AC#1)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "docs/reference/r.md" },
    );
    expect(
      warnings.list().some((w) => w.includes('unknown key "okf_version"') && w.includes("docs/reference/r.md")),
    ).toBe(true);
  });

  test("okf_version on a sub-index (e.g. docs/adr/index.md) also surfaces the warning, not just an ordinary concept (LORE-168 AC#1)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings, path: "docs/adr/index.md" },
    );
    expect(warnings.list().some((w) => w.includes('unknown key "okf_version"'))).toBe(true);
  });

  test("okf_version is flagged when no path is given (cannot be proven root, so no longer unconditionally exempt)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", okf_version: defaultProfile().okfVersion },
      { warnings },
    );
    expect(warnings.list().some((w) => w.includes('unknown key "okf_version"'))).toBe(true);
  });

  test("`resource` is OKF-reserved on an ordinary concept (the stamped canonical link)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", resource: "https://x.dev/docs/reference/r.md" },
      { warnings, path: "docs/reference/r.md" },
    );
    expect(warnings.list().some((w) => w.includes("resource"))).toBe(false);
  });

  test("`resource` is NOT reserved on an index file — a hand-authored one is warned (it carries none)", () => {
    const warnings = new WarningCollector();
    validateFrontmatter(
      { type: "Reference", title: "T", summary: "s", resource: "https://x.dev/docs/index.md" },
      { warnings, path: "docs/index.md" },
    );
    expect(warnings.list().some((w) => w.includes('unknown key "resource"'))).toBe(true);
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

  test("a summary of 150 non-BMP emoji (300 UTF-16 code units, 150 code points) does not warn", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: "😀".repeat(150) }, { warnings });
    expect(warnings.list().some((w) => w.includes("chars"))).toBe(false);
  });

  test("a summary of 250 non-BMP emoji (250 code points) warns and reports 250 chars, not 500", () => {
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Reference", summary: "😀".repeat(250) }, { warnings });
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
