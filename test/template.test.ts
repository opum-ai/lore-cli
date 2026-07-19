import { describe, expect, test } from "bun:test";
import { parseConcept, serializeConcept } from "../src/core/concept";
import { compileProfile, defaultProfile, type Profile, parseProfile } from "../src/core/profile";
import { canonicalType, isKnownType, schemaModeline, typeDirectory } from "../src/core/schema";
import { buildNewConcept, builtinTemplateFor, renderTemplate, resourceFor, slugify } from "../src/core/template";
import { LoreError, WarningCollector } from "../src/errors";

/**
 * Compile a minimal one-type (`Reference`) profile carrying `resourceBase`, for the
 * `resource`-stamping tests. `extraBaseFields` are extra `[base.fields]` lines (e.g. a profile-owned
 * `resource = { … }`) spliced in, so a test that needs the profile to own `resource` does not have
 * to re-inline the whole document.
 */
function profileWithResourceBase(resourceBase: string, extraBaseFields: string[] = []): Profile {
  const doc = Bun.TOML.parse(
    [
      "[profile]",
      'name = "t"',
      'okf_version = "0.1"',
      `resource_base = "${resourceBase}"`,
      "[base.fields]",
      "type = { required = true }",
      ...extraBaseFields,
      "[[types]]",
      'name = "Reference"',
    ].join("\n"),
  ) as Record<string, unknown>;
  return compileProfile(parseProfile(doc, "test-profile"));
}

/** The six story-convention type names, sourced from the built-in profile. */
const KNOWN_TYPES = [...defaultProfile().types.keys()];

const TIMESTAMP = "2026-06-25T12:00:00Z";

/** Build a concept of `type` from its built-in body at the type's conventional path, with the known-type modeline. */
function buildBuiltin(type: string, over: { title?: string; summary?: string; tags?: string[] } = {}) {
  const canonical = canonicalType(type);
  const docPath = `docs/${typeDirectory(canonical)}/sample.md`;
  return buildNewConcept({
    docPath,
    type: canonical,
    title: over.title ?? "Sample Title",
    summary: over.summary ?? "A one-line summary.",
    timestamp: TIMESTAMP,
    tags: over.tags,
    bodyTemplate: builtinTemplateFor(canonical),
    vars: Object.create(null),
    modeline: isKnownType(canonical) ? schemaModeline(docPath, canonical) : undefined,
  });
}

describe("slugify", () => {
  test("lower-cases, collapses non-alphanumerics, and trims dashes", () => {
    expect(slugify("Bulk Archive Orders!")).toBe("bulk-archive-orders");
    expect(slugify("  Leading / trailing --- ")).toBe("leading-trailing");
    expect(slugify("Multiple   spaces")).toBe("multiple-spaces");
    expect(slugify("ADR-0006: Schema & types")).toBe("adr-0006-schema-types");
  });

  test("strips diacritics via NFKD normalization", () => {
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });

  test("a title with no alphanumeric content yields an empty slug", () => {
    expect(slugify("!!! --- ???")).toBe("");
    expect(slugify("")).toBe("");
  });
});

describe("renderTemplate", () => {
  test("substitutes known keys, with or without inner padding", () => {
    expect(renderTemplate("a {{x}} {{ y }} b", { x: "1", y: "2" })).toEqual({ text: "a 1 2 b", unresolved: [] });
  });

  test("a present empty-string value resolves to an empty string (not unresolved)", () => {
    expect(renderTemplate("[{{x}}]", { x: "" })).toEqual({ text: "[]", unresolved: [] });
  });

  test("reports each unfilled placeholder once, in order, leaving the literal token in place", () => {
    const result = renderTemplate("{{a}} {{a}} {{b}}", {});
    expect(result.unresolved).toEqual(["a", "b"]);
    expect(result.text).toBe("{{a}} {{a}} {{b}}");
  });

  test("an inherited key (e.g. __proto__) is treated as unresolved, not silently resolved", () => {
    expect(renderTemplate("{{__proto__}}", {}).unresolved).toEqual(["__proto__"]);
  });
});

describe("buildNewConcept — known types validate clean by construction (AC#1)", () => {
  for (const type of KNOWN_TYPES) {
    test(`${type}: built-in renders a zero-warning, re-parseable concept`, () => {
      const result = buildBuiltin(type);
      expect(result.type).toBe(type);
      expect(result.warnings).toEqual([]);

      // The bytes parse back as the same type with no warnings — the AC#1 guarantee.
      const warnings = new WarningCollector();
      const docPath = `docs/${typeDirectory(type)}/sample.md`;
      const concept = parseConcept(docPath, result.contents, { warnings });
      expect(concept.type).toBe(type);
      expect(concept.frontmatter.title).toBe("Sample Title");
      expect(concept.frontmatter.summary).toBe("A one-line summary.");
      expect(concept.frontmatter.timestamp).toBe(TIMESTAMP);
      expect(warnings.list()).toEqual([]);
    });
  }

  test("a known type carries the editor modeline inside the fence", () => {
    const contents = buildBuiltin("ADR").contents;
    expect(contents.startsWith("---\n# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json\n")).toBe(
      true,
    );
  });
});

describe("buildNewConcept — frontmatter is structural, never substituted", () => {
  test("a title with YAML-special characters round-trips intact (no YAML corruption)", () => {
    const tricky = "Drop the table: orders # really";
    const result = buildBuiltin("Reference", { title: tricky });
    const concept = parseConcept("docs/reference/sample.md", result.contents);
    expect(concept.frontmatter.title).toBe(tricky);
  });

  test("--tags becomes a YAML sequence on the frontmatter", () => {
    const result = buildBuiltin("Story", { tags: ["retention", "orders"] });
    const concept = parseConcept("docs/stories/sample.md", result.contents);
    expect(concept.frontmatter.tags).toEqual(["retention", "orders"]);
  });

  test("the Story template ships the lore:tasks managed-block markers (LORE-59)", () => {
    const body = builtinTemplateFor("Story");
    expect(body).toContain("<!-- lore:tasks:begin -->");
    expect(body).toContain("<!-- lore:tasks:end -->");
  });
});

describe("buildNewConcept — unknown types are tolerated (no modeline)", () => {
  test("an unknown type validates on type-only, warns, and gets no schema modeline", () => {
    const result = buildNewConcept({
      docPath: "docs/decision/sample.md",
      type: "Decision",
      title: "Pick a queue",
      summary: "Which queue to use.",
      timestamp: TIMESTAMP,
      bodyTemplate: builtinTemplateFor("Decision"),
      vars: Object.create(null),
    });
    expect(result.type).toBe("Decision");
    expect(result.warnings.some((w) => w.includes('unknown type "Decision"'))).toBe(true);
    expect(result.contents).not.toContain("yaml-language-server");
    expect(result.contents.startsWith("---\ntype: Decision\n")).toBe(true);
  });
});

describe("buildNewConcept — unfilled body placeholders fail loud (exit 6)", () => {
  test("an unresolved {{var}} throws a validation LoreError naming it", () => {
    try {
      buildNewConcept({
        docPath: "docs/reference/sample.md",
        type: "Reference",
        title: "Orders table",
        summary: "The orders table.",
        timestamp: TIMESTAMP,
        bodyTemplate: "\n# {{title}}\n\nOwner: {{owner}}\n",
        vars: Object.create(null),
      });
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("validation");
      expect((err as LoreError).message).toContain("{{owner}}");
      return;
    }
    throw new Error("expected an unfilled-placeholder LoreError, but build returned");
  });

  test("the auto tokens (title/type/timestamp/summary) override a same-named --var", () => {
    const result = buildNewConcept({
      docPath: "docs/reference/sample.md",
      type: "Reference",
      title: "Real Title",
      summary: "Real summary.",
      timestamp: TIMESTAMP,
      bodyTemplate: "\n# {{title}} ({{type}})\n",
      vars: Object.assign(Object.create(null), { title: "Ignored", type: "Ignored" }),
    });
    expect(result.contents).toContain("# Real Title (Reference)");
  });

  test("a --var shadowing an auto token surfaces a warning instead of being silently dropped", () => {
    const result = buildNewConcept({
      docPath: "docs/reference/sample.md",
      type: "Reference",
      title: "Real Title",
      summary: "Real summary.",
      timestamp: TIMESTAMP,
      bodyTemplate: "\n# {{title}}\n",
      vars: Object.assign(Object.create(null), { title: "Ignored" }),
    });
    expect(result.warnings.some((w) => w.includes("ignoring --var title"))).toBe(true);
  });
});

describe("resourceFor — base + repo-rel path, one slash, URL-encoded segments (AC#4)", () => {
  test("joins with exactly one slash, trimming the base's trailing slash(es)", () => {
    expect(resourceFor("https://docs.example.com", "docs/stories/foo.md")).toBe(
      "https://docs.example.com/docs/stories/foo.md",
    );
    expect(resourceFor("https://docs.example.com/", "docs/stories/foo.md")).toBe(
      "https://docs.example.com/docs/stories/foo.md",
    );
    expect(resourceFor("https://docs.example.com///", "docs/stories/foo.md")).toBe(
      "https://docs.example.com/docs/stories/foo.md",
    );
  });

  test("keeps the .md suffix and a slug's safe characters unchanged", () => {
    expect(resourceFor("https://x.dev", "docs/adr/0006-schema-types.md")).toBe(
      "https://x.dev/docs/adr/0006-schema-types.md",
    );
  });

  test("URL-encodes each path segment but never the separators", () => {
    expect(resourceFor("https://x.dev", "docs/qa plan/déjà vu.md")).toBe(
      "https://x.dev/docs/qa%20plan/d%C3%A9j%C3%A0%20vu.md",
    );
  });

  test("preserves a base that carries its own path", () => {
    expect(resourceFor("https://x.atlassian.net/wiki/spaces/ENG", "docs/index-of-things.md")).toBe(
      "https://x.atlassian.net/wiki/spaces/ENG/docs/index-of-things.md",
    );
  });

  test("trims surrounding whitespace on the base so no space is embedded at the seam", () => {
    expect(resourceFor("  https://x.dev/  ", "docs/a.md")).toBe("https://x.dev/docs/a.md");
  });
});

describe("buildNewConcept — resource stamping is profile-gated (AC#4)", () => {
  const build = (docPath: string, profile: Profile) =>
    buildNewConcept({
      docPath,
      type: "Reference",
      title: "Orders",
      summary: "The orders.",
      timestamp: TIMESTAMP,
      bodyTemplate: builtinTemplateFor("Reference"),
      vars: Object.create(null),
      profile,
    });

  test("stamps `resource` when the profile sets resource_base", () => {
    const result = build("docs/reference/orders.md", profileWithResourceBase("https://docs.example.com/"));
    const concept = parseConcept("docs/reference/orders.md", result.contents);
    expect(concept.frontmatter.resource).toBe("https://docs.example.com/docs/reference/orders.md");
    // It is a recognized OKF key — stamping it raises no extra-key warning.
    expect(result.warnings.some((w) => w.includes("resource"))).toBe(false);
  });

  test("omits `resource` under the default profile (empty resource_base) — byte-identical to before", () => {
    const result = build("docs/reference/orders.md", defaultProfile());
    expect(result.contents).not.toContain("resource:");
    expect(parseConcept("docs/reference/orders.md", result.contents).frontmatter.resource).toBeUndefined();
  });

  test("never stamps `resource` on an index/sub-index file, even with a resource_base", () => {
    const profile = profileWithResourceBase("https://docs.example.com/");
    for (const indexPath of ["docs/index.md", "docs/reference/index.md"]) {
      const result = build(indexPath, profile);
      expect(result.contents).not.toContain("resource:");
    }
  });

  test("`resource` trails the profile's declared keys and round-trips byte-stably", () => {
    const profile = profileWithResourceBase("https://docs.example.com/");
    const first = build("docs/reference/orders.md", profile).contents;
    const concept = parseConcept("docs/reference/orders.md", first, { profile });
    // The genuine fixpoint: re-serializing the parsed-back concept reproduces the exact bytes, so a
    // regression that reordered/dropped the trailing `resource` key on re-emit would fail here.
    expect(serializeConcept(concept, { profile })).toBe(first);
    expect(Object.keys(concept.frontmatter).at(-1)).toBe("resource");
  });

  test("defers to a type that owns an INCOMPATIBLE `resource` field (no auto-stamp, no crash)", () => {
    // A type owning `resource` as a datetime would reject a stamped URL string; lore must not
    // auto-stamp — the field is the profile's to fill, not lore's. Would throw exit-6 if it did.
    const profile = profileWithResourceBase("https://docs.example.com/", ['resource = { kind = "datetime" }']);
    const result = build("docs/reference/orders.md", profile);
    expect(result.contents).not.toContain("https://docs.example.com");
  });

  test("STAMPS into a `resource = { required = true }` string field the type owns (satisfies it, no exit-6)", () => {
    // A required *string* `resource` is satisfied by the stamp, not failed: the old global guard
    // deferred here and `lore new` then died exit-6 on the missing required field.
    const profile = profileWithResourceBase("https://docs.example.com/", ["resource = { required = true }"]);
    const result = build("docs/reference/orders.md", profile);
    const concept = parseConcept("docs/reference/orders.md", result.contents, { profile });
    expect(concept.frontmatter.resource).toBe("https://docs.example.com/docs/reference/orders.md");
  });

  test("a `resource` field on ONE type no longer suppresses stamping on ANOTHER (per-type guard)", () => {
    const doc = Bun.TOML.parse(
      [
        "[profile]",
        'name = "multi"',
        'okf_version = "0.1"',
        'resource_base = "https://x.dev/"',
        "[base.fields]",
        "type = { required = true }",
        "[[types]]",
        'name = "Reference"',
        "[[types]]",
        'name = "Pinned"',
        'fields.resource = { kind = "datetime" }',
      ].join("\n"),
    ) as Record<string, unknown>;
    const profile = compileProfile(parseProfile(doc, "multi"));
    // Reference does NOT own `resource`, so it is still stamped even though Pinned declares its own
    // (the old `canonicalKeyOrder.includes("resource")` union suppressed every type here).
    const result = buildNewConcept({
      docPath: "docs/reference/orders.md",
      type: "Reference",
      title: "Orders",
      summary: "The orders.",
      timestamp: TIMESTAMP,
      bodyTemplate: builtinTemplateFor("Reference"),
      vars: Object.create(null),
      profile,
    });
    expect(parseConcept("docs/reference/orders.md", result.contents, { profile }).frontmatter.resource).toBe(
      "https://x.dev/docs/reference/orders.md",
    );
  });

  test("a whitespace-only `resource_base` is treated as unset (no stamp)", () => {
    const result = build("docs/reference/orders.md", profileWithResourceBase("   "));
    expect(result.contents).not.toContain("resource:");
  });

  test("trims surrounding whitespace on the base instead of embedding a space in the URL", () => {
    const result = build("docs/reference/orders.md", profileWithResourceBase("  https://docs.example.com/  "));
    const concept = parseConcept("docs/reference/orders.md", result.contents);
    expect(concept.frontmatter.resource).toBe("https://docs.example.com/docs/reference/orders.md");
  });
});

describe("buildNewConcept — the modeline is caller-supplied", () => {
  test("no modeline is spliced when none is provided (e.g. an un-initialized bundle)", () => {
    const result = buildNewConcept({
      docPath: "docs/reference/sample.md",
      type: "Reference",
      title: "Orders",
      summary: "The orders.",
      timestamp: TIMESTAMP,
      bodyTemplate: "\n# {{title}}\n",
      vars: Object.create(null),
    });
    expect(result.contents).not.toContain("yaml-language-server");
    expect(result.contents.startsWith("---\ntype: Reference\n")).toBe(true);
  });
});
