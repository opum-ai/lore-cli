import { describe, expect, test } from "bun:test";
import { parseConcept } from "../src/core/concept";
import { canonicalType, KNOWN_TYPES, type KnownType, typeDirectory } from "../src/core/schema";
import { buildNewConcept, builtinTemplateFor, renderTemplate, slugify } from "../src/core/template";
import { LoreError, WarningCollector } from "../src/errors";

const TIMESTAMP = "2026-06-25T12:00:00Z";

/** Build a concept of `type` from its built-in body at the type's conventional path. */
function buildBuiltin(type: string, over: { title?: string; summary?: string; tags?: string[] } = {}) {
  const docPath = `docs/${typeDirectory(canonicalType(type))}/sample.md`;
  return buildNewConcept({
    docPath,
    type: canonicalType(type),
    title: over.title ?? "Sample Title",
    summary: over.summary ?? "A one-line summary.",
    timestamp: TIMESTAMP,
    tags: over.tags,
    bodyTemplate: builtinTemplateFor(canonicalType(type)),
    vars: Object.create(null),
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
      const docPath = `docs/${typeDirectory(type as KnownType)}/sample.md`;
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
});
