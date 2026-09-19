import { describe, expect, test } from "bun:test";
import { compileProfile, defaultProfile, parseProfile } from "../src/core/profile";
import { buildTypeVocabulary, describeSchemaProperty } from "../src/core/type-vocabulary";

/** Build a compiled profile straight from a hand-built parsed-TOML-shaped `doc` (no filesystem). */
function buildProfile(doc: Record<string, unknown>) {
  return compileProfile(parseProfile(doc, "type-vocabulary-test"));
}

describe("buildTypeVocabulary — the default (story-convention) profile", () => {
  const report = buildTypeVocabulary(defaultProfile());

  test("carries the profile identity and every declared type, in declaration order", () => {
    expect(report.profile).toEqual({ name: "story-convention", okfVersion: "0.2", case: "Title" });
    expect(report.types.map((t) => t.name)).toEqual([
      "Epic",
      "Arc",
      "Spec",
      "ADR",
      "Runbook",
      "Reference",
      "Attested Computation",
    ]);
  });

  test("Arc carries its own fields (tasks/specs) as NOT common, and the shared base fields AS common", () => {
    const story = report.types.find((t) => t.name === "Arc");
    expect(story?.slug).toBe("arc");
    expect(story?.requiredSections).toEqual(["Acceptance criteria"]);
    const tasks = story?.fields.find((f) => f.name === "tasks");
    expect(tasks).toMatchObject({ required: false, common: false, kind: "list", itemKind: "string" });
    const title = story?.fields.find((f) => f.name === "title");
    expect(title).toMatchObject({ required: false, common: true, kind: "string" });
    // Arc's `type` is an enum of the canonical name plus every deprecated alias (LCLI-558), so
    // an un-migrated `type: Story` document still satisfies the schema's own literal check.
    const type = story?.fields.find((f) => f.name === "type");
    expect(type).toMatchObject({ required: true, common: true, kind: "enum", enum: ["Arc", "Story"] });
    // A type with no aliases keeps the plain string shape, so the enum above is the alias's
    // doing and not a change to every type.
    const epicType = report.types.find((t) => t.name === "Epic")?.fields.find((f) => f.name === "type");
    expect(epicType).toMatchObject({ required: true, common: true, kind: "string" });
  });

  test("Epic (declares no own fields) carries no fields marked non-common", () => {
    const epic = report.types.find((t) => t.name === "Epic");
    expect(epic?.fields.length).toBeGreaterThan(0);
    for (const field of epic?.fields ?? []) {
      expect(field.common).toBe(true);
    }
  });

  test("--type-equivalent `only` scopes the report to exactly one type", () => {
    const scoped = buildTypeVocabulary(defaultProfile(), { only: "Arc" });
    expect(scoped.types.map((t) => t.name)).toEqual(["Arc"]);
    // `only` takes the CANONICAL spelling by contract (this module never re-implements type
    // resolution), so a deprecated alias matches nothing HERE and is resolved by the caller --
    // `lore types --type Story` is covered end-to-end in types.test.ts.
    expect(buildTypeVocabulary(defaultProfile(), { only: "Story" }).types).toEqual([]);
  });

  test("the reserved supersedes/superseded_by fields render as a readable string-or-list union", () => {
    const epic = report.types.find((t) => t.name === "Epic");
    const supersedes = epic?.fields.find((f) => f.name === "supersedes");
    expect(supersedes?.kind).toBe("string | list");
    expect(supersedes?.common).toBe(true);
  });

  test("the reserved relations field is a list of structured objects", () => {
    const epic = report.types.find((t) => t.name === "Epic");
    const relations = epic?.fields.find((f) => f.name === "relations");
    expect(relations).toMatchObject({ kind: "list", itemKind: "object" });
  });

  test("timestamp is reported as datetime, not a bare string", () => {
    const epic = report.types.find((t) => t.name === "Epic");
    expect(epic?.fields.find((f) => f.name === "timestamp")?.kind).toBe("datetime");
  });

  test("Attested Computation (OKF 0.2) reports its own required runtime family, not shared with the others", () => {
    const computation = report.types.find((t) => t.name === "Attested Computation");
    const runtime = computation?.fields.find((f) => f.name === "runtime");
    expect(runtime).toMatchObject({ required: true, common: false });
    // The OKF 0.2 shared families (status/generated/sources/…) ARE common: every type gets them
    // under a 0.2 profile, so they must not be misclassified as this one type's own fields.
    expect(computation?.fields.find((f) => f.name === "status")?.common).toBe(true);
    const story = report.types.find((t) => t.name === "Arc");
    expect(story?.fields.some((f) => f.name === "runtime")).toBe(false);
    expect(story?.fields.find((f) => f.name === "status")?.common).toBe(true);
  });
});

describe("buildTypeVocabulary — a custom profile (enum, required, and list-of-enum fields)", () => {
  const profile = buildProfile({
    profile: { name: "custom", okf_version: "0.1" },
    base: { fields: { type: { required: true }, title: {} } },
    types: [
      {
        name: "Widget",
        sections: ["Overview"],
        template: "widget.md",
        fields: {
          owner: { required: true },
          priority: { enum: ["low", "medium", "high"] },
          labels: { kind: "list", items: { enum: ["red", "green"] } },
          count: { kind: "integer" },
        },
      },
      { name: "Gadget", sections: [], fields: {} },
    ],
  });
  const report = buildTypeVocabulary(profile);

  test("a required field is reported required and type-specific", () => {
    const widget = report.types.find((t) => t.name === "Widget");
    expect(widget?.template).toBe("widget.md");
    expect(widget?.requiredSections).toEqual(["Overview"]);
    expect(widget?.fields.find((f) => f.name === "owner")).toMatchObject({ required: true, common: false });
  });

  test("an enum field reports kind 'enum' with its closed value set", () => {
    const widget = report.types.find((t) => t.name === "Widget");
    expect(widget?.fields.find((f) => f.name === "priority")).toMatchObject({
      kind: "enum",
      enum: ["low", "medium", "high"],
    });
  });

  test("a list-of-enum field reports kind 'list', itemKind 'enum', and the element value set", () => {
    const widget = report.types.find((t) => t.name === "Widget");
    expect(widget?.fields.find((f) => f.name === "labels")).toMatchObject({
      kind: "list",
      itemKind: "enum",
      enum: ["red", "green"],
    });
  });

  test("an integer field reports kind 'integer'", () => {
    const widget = report.types.find((t) => t.name === "Widget");
    expect(widget?.fields.find((f) => f.name === "count")).toMatchObject({ kind: "integer", required: false });
  });

  test("Gadget (no own fields, no template) has no template and every field common", () => {
    const gadget = report.types.find((t) => t.name === "Gadget");
    expect(gadget?.template).toBeUndefined();
    for (const field of gadget?.fields ?? []) {
      expect(field.common).toBe(true);
    }
    // Widget's own fields must not leak onto Gadget.
    expect(gadget?.fields.some((f) => f.name === "owner")).toBe(false);
  });
});

describe("describeSchemaProperty — the generic Draft-7 shape reader", () => {
  test("a plain required string", () => {
    expect(describeSchemaProperty({ type: "string" })).toEqual({ kind: "string" });
  });

  test("a nullish (optional) string peels the null branch off an anyOf", () => {
    expect(describeSchemaProperty({ anyOf: [{ type: "string" }, { type: "null" }] })).toEqual({ kind: "string" });
  });

  test("a datetime string carries the date-time format", () => {
    expect(describeSchemaProperty({ type: "string", format: "date-time" })).toEqual({ kind: "datetime" });
  });

  test("an array of strings", () => {
    expect(describeSchemaProperty({ type: "array", items: { type: "string" } })).toEqual({
      kind: "list",
      itemKind: "string",
    });
  });

  test("a top-level enum", () => {
    expect(describeSchemaProperty({ type: "string", enum: ["a", "b"] })).toEqual({ kind: "enum", enum: ["a", "b"] });
  });

  test("a genuine multi-branch union joins each branch's own label", () => {
    expect(describeSchemaProperty({ anyOf: [{ type: "string" }, { type: "number" }] })).toEqual({
      kind: "string | number",
    });
  });

  test("an unrecognized fragment falls back to 'mixed'", () => {
    expect(describeSchemaProperty({})).toEqual({ kind: "mixed" });
    expect(describeSchemaProperty(null)).toEqual({ kind: "mixed" });
    expect(describeSchemaProperty("not an object")).toEqual({ kind: "mixed" });
  });
});
