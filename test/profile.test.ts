import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileProfile,
  defaultProfile,
  loadProfile,
  PROFILE_JSON_REL_PATH,
  PROFILE_REL_PATH,
  parseProfile,
  slugForTypeName,
} from "../src/core/profile";
import { validateFrontmatter } from "../src/core/schema";
import { LoreError, WarningCollector } from "../src/errors";

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

describe("slugForTypeName — LOWER-KEBAB slug (AC#7)", () => {
  test("single-word story types slug to their lower-cased name (filenames unchanged)", () => {
    expect(slugForTypeName("ADR")).toBe("adr");
    expect(slugForTypeName("Reference")).toBe("reference");
    expect(slugForTypeName("Runbook")).toBe("runbook");
  });

  test("a multi-word type name slugs to lower-kebab — 'QA Plan' -> 'qa-plan'", () => {
    expect(slugForTypeName("QA Plan")).toBe("qa-plan");
    expect(slugForTypeName("Test  Plan")).toBe("test-plan"); // collapses runs of whitespace
    expect(slugForTypeName("Bug/Fix!")).toBe("bug-fix"); // non-alphanumerics collapse, edges trim
  });

  test("a name with no alphanumeric content slugs to the empty string (rejected at load)", () => {
    expect(slugForTypeName("---")).toBe("");
  });
});

describe("defaultProfile — the built-in story convention (AC#3)", () => {
  test("compiles the six story types in declaration order", () => {
    expect([...defaultProfile().types.keys()]).toEqual(["Epic", "Story", "Spec", "ADR", "Runbook", "Reference"]);
  });

  test("carries okf_version 0.1, Title case, and an empty resource_base", () => {
    const p = defaultProfile();
    expect(p.okfVersion).toBe("0.1");
    expect(p.case).toBe("Title");
    expect(p.resourceBase).toBe("");
    expect(p.name).toBe("story-convention");
  });

  test("canonical key order: base, then Story's own fields, then the reserved coupling fields LAST", () => {
    // Reserved coupling fields trail per-type fields, matching the order lore emitted before the
    // profile existed (ADR-0011 byte-stability), so a Story with tasks/specs AND supersedes keeps
    // its on-disk key order.
    expect(defaultProfile().canonicalKeyOrder).toEqual([
      "type",
      "title",
      "description",
      "tags",
      "summary",
      "timestamp",
      "status",
      "tasks",
      "specs",
      "supersedes",
      "superseded_by",
    ]);
  });

  test("compiling the same profile twice yields byte-identical JSON Schemas (deterministic, ADR-0014)", () => {
    const doc = {
      profile: { name: "t", okf_version: "0.1" },
      base: { fields: { type: { required: true }, title: {}, tags: { kind: "list" } } },
      types: [{ name: "Story", fields: { tasks: { kind: "list" } } }, { name: "ADR" }],
    };
    const emit = () =>
      JSON.stringify([...compileProfile(parseProfile(doc, "t")).types.values()].map((type) => type.jsonSchema));
    expect(emit()).toBe(emit());
  });
});

describe("loadProfile — zero-config and file resolution", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-profile-"));
    mkdirSync(join(root, ".lore"), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("a missing profile yields the built-in default (zero-config, AC#3)", () => {
    expect(loadProfile({ root }).name).toBe("story-convention");
  });

  test("a profile.toml is loaded and its custom types compiled", () => {
    writeFileSync(
      join(root, PROFILE_REL_PATH),
      [
        "[profile]",
        'name = "eck"',
        'okf_version = "0.1"',
        "",
        "[base.fields]",
        "type = { required = true }",
        "title = {}",
        "",
        "[[types]]",
        'name = "PRD"',
        'sections = ["Goal", "Scope"]',
        'template = "prd.md"',
      ].join("\n"),
    );
    const p = loadProfile({ root });
    expect(p.name).toBe("eck");
    expect([...p.types.keys()]).toEqual(["PRD"]);
    expect(p.types.get("PRD")?.requiredSections).toEqual(["Goal", "Scope"]);
    expect(p.types.get("PRD")?.template).toBe("prd.md");
  });

  test("profile.json is read when no profile.toml exists", () => {
    writeFileSync(
      join(root, PROFILE_JSON_REL_PATH),
      JSON.stringify({
        profile: { name: "json-profile", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "Note" }],
      }),
    );
    const p = loadProfile({ root });
    expect(p.name).toBe("json-profile");
    expect([...p.types.keys()]).toEqual(["Note"]);
  });

  test("profile.toml wins over profile.json when both exist", () => {
    writeFileSync(
      join(root, PROFILE_REL_PATH),
      '[profile]\nname = "from-toml"\nokf_version = "0.1"\n[base.fields]\ntype = { required = true }\n[[types]]\nname = "T"\n',
    );
    writeFileSync(
      join(root, PROFILE_JSON_REL_PATH),
      JSON.stringify({
        profile: { name: "from-json", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "T" }],
      }),
    );
    expect(loadProfile({ root }).name).toBe("from-toml");
  });

  test("a non-directory .lore is treated as no profile (falls back to the default)", () => {
    const fileRoot = mkdtempSync(join(tmpdir(), "lore-profile-file-"));
    try {
      writeFileSync(join(fileRoot, ".lore"), "not a directory");
      expect(loadProfile({ root: fileRoot }).name).toBe("story-convention");
    } finally {
      rmSync(fileRoot, { recursive: true, force: true });
    }
  });

  test("malformed TOML throws a validation error naming the file", () => {
    writeFileSync(join(root, PROFILE_REL_PATH), "this is = = not toml");
    const err = expectValidation(() => loadProfile({ root }));
    expect(err.message).toContain(PROFILE_REL_PATH);
  });

  test("an all-commented profile.toml (what `lore init` scaffolds) is zero-config — yields the default", () => {
    writeFileSync(join(root, PROFILE_REL_PATH), '# every line commented\n# name = "x"\n');
    expect(loadProfile({ root }).name).toBe("story-convention");
  });

  test("an empty/commented profile.toml does NOT shadow a populated profile.json", () => {
    // Regression: lore init scaffolds a commented .toml; it must fall through to a real .json,
    // not short-circuit to the default and silently ignore the user's JSON profile.
    writeFileSync(join(root, PROFILE_REL_PATH), "# commented out\n");
    writeFileSync(
      join(root, PROFILE_JSON_REL_PATH),
      JSON.stringify({
        profile: { name: "from-json", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "Note" }],
      }),
    );
    const p = loadProfile({ root });
    expect(p.name).toBe("from-json");
    expect([...p.types.keys()]).toEqual(["Note"]);
  });
});

describe("parseProfile — grammar errors throw (exit 6)", () => {
  function parse(doc: Record<string, unknown>): unknown {
    return parseProfile(doc, "test-profile");
  }

  test("a missing profile.name is an error", () => {
    expectValidation(() => parse({ profile: { okf_version: "0.1" }, base: { fields: { type: { required: true } } } }));
  });

  test("a missing profile.okf_version is an error", () => {
    expectValidation(() => parse({ profile: { name: "x" }, base: { fields: { type: { required: true } } } }));
  });

  test("[base.fields].type must be { required = true }", () => {
    const err = expectValidation(() =>
      parse({ profile: { name: "x", okf_version: "0.1" }, base: { fields: { type: {} } } }),
    );
    expect(err.message).toContain("required = true");
  });

  test("a duplicate type name (case-insensitive) is an error", () => {
    const err = expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "Spec" }, { name: "spec" }],
      }),
    );
    expect(err.message).toContain("duplicate type");
  });

  test("an enum on a non-string kind is an error (enum implies kind string)", () => {
    const err = expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "T", fields: { status: { kind: "number", enum: ["a", "b"] } } }],
      }),
    );
    expect(err.message).toContain("enum");
  });

  test("a type name with no slug-able characters is an error", () => {
    expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "---" }],
      }),
    );
  });

  test("a field spec that is not a table is an error", () => {
    expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true }, title: "nope" } },
      }),
    );
  });

  test("`types` that is not an array is an error", () => {
    const err = expectValidation(() =>
      parse({ profile: { name: "x", okf_version: "0.1" }, base: { fields: { type: { required: true } } }, types: {} }),
    );
    expect(err.message).toContain("array of tables");
  });

  test("a types entry that is not a table is an error", () => {
    expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: ["nope"],
      }),
    );
  });

  test("a nested list element kind is rejected (no lists of lists)", () => {
    const err = expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "T", fields: { matrix: { kind: "list", items: { kind: "list" } } } }],
      }),
    );
    expect(err.message).toContain("list");
  });

  test("an out-of-range profile.case value is an error", () => {
    expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1", case: "PascalCase" },
        base: { fields: { type: { required: true } } },
      }),
    );
  });

  test("a non-string sections entry is an error", () => {
    expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "T", sections: ["ok", 7] }],
      }),
    );
  });

  test("a non-boolean `required` on a field is an error", () => {
    expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true }, f: { required: "yes" } } },
      }),
    );
  });

  test("a non-empty profile that declares no [[types]] is an error (the gate must never silently empty)", () => {
    const err = expectValidation(() =>
      parse({ profile: { name: "x", okf_version: "0.1" }, base: { fields: { type: { required: true } } } }),
    );
    expect(err.message).toContain("at least one [[types]]");
  });

  test("a field named after an Object.prototype member is rejected (prototype-pollution guard)", () => {
    for (const bad of ["__proto__", "constructor", "toString"]) {
      const err = expectValidation(() =>
        parse({
          profile: { name: "x", okf_version: "0.1" },
          base: { fields: { type: { required: true }, [bad]: {} } },
        }),
      );
      expect(err.message).toContain("reserved object key");
    }
  });

  test("a misspelled field-spec attribute (`require` for `required`) is an error, not silent tolerance (LORE-83)", () => {
    // An otherwise-complete, valid profile (a real [[types]] declared) — pre-fix this parsed
    // clean, silently defaulting `owner.required` to `false` instead of erroring on the typo.
    const err = expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true }, owner: { require: true } } },
        types: [{ name: "T" }],
      }),
    );
    expect(err.message).toContain("base.fields.owner");
    expect(err.message).toContain('"require"');
  });

  test("an unrecognized key in a [[types]] table is an error, not silently ignored (LORE-83)", () => {
    const err = expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "T", sction: ["Oops"] }],
      }),
    );
    expect(err.message).toContain("types[0]");
    expect(err.message).toContain('"sction"');
  });

  test("an unrecognized key in an `items` table is an error, not silently ignored (LORE-83)", () => {
    const err = expectValidation(() =>
      parse({
        profile: { name: "x", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "T", fields: { tags: { kind: "list", items: { knd: "string" } } } }],
      }),
    );
    expect(err.message).toContain("items");
    expect(err.message).toContain('"knd"');
  });
});

describe("compileProfile — field kinds generate the right validators", () => {
  const profile = compileProfile(
    parseProfile(
      {
        profile: { name: "kinds", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [
          {
            name: "T",
            fields: {
              count: { kind: "number" },
              seq: { kind: "integer" },
              flag: { kind: "boolean" },
              labels: { kind: "list", items: { enum: ["a", "b"] } },
              when: { kind: "datetime" },
              level: { default: "info" },
            },
          },
        ],
      },
      "kinds",
    ),
  );

  test("number / integer / boolean / datetime / enum-list values validate", () => {
    expect(
      validateFrontmatter(
        { type: "T", count: 1.5, seq: 3, flag: true, labels: ["a", "b"], when: "2026-01-01T00:00:00Z" },
        { profile },
      ),
    ).toBe("T");
  });

  test("an integer field rejects a non-integer", () => {
    expectValidation(() => validateFrontmatter({ type: "T", seq: 1.2 }, { profile }));
  });

  test("a boolean field rejects a non-boolean", () => {
    expectValidation(() => validateFrontmatter({ type: "T", flag: "true" }, { profile }));
  });

  test("an enum-list element outside the closed set is rejected", () => {
    expectValidation(() => validateFrontmatter({ type: "T", labels: ["a", "z"] }, { profile }));
  });

  test("an editor-advertised `default` is surfaced in the JSON Schema but never coerced at runtime", () => {
    const json = profile.types.get("T")?.jsonSchema as { properties: Record<string, { default?: unknown }> };
    expect(json.properties.level?.default).toBe("info");
    // Runtime: a concept that omits `level` validates and the value is never stamped.
    expect(validateFrontmatter({ type: "T" }, { profile })).toBe("T");
  });
});

describe("loadProfile — JSON form errors", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-profile-json-"));
    mkdirSync(join(root, ".lore"), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("malformed JSON throws a validation error naming the file", () => {
    writeFileSync(join(root, PROFILE_JSON_REL_PATH), "{ not json");
    const err = expectValidation(() => loadProfile({ root }));
    expect(err.message).toContain(PROFILE_JSON_REL_PATH);
  });

  test("a JSON profile that is not an object is an error", () => {
    writeFileSync(join(root, PROFILE_JSON_REL_PATH), "[1, 2, 3]");
    expectValidation(() => loadProfile({ root }));
  });
});

describe("generated validators — the profile drives validateFrontmatter", () => {
  // A profile exercising required, enum, list, datetime, and a base-field override.
  const profile = compileProfile(
    parseProfile(
      {
        profile: { name: "test", okf_version: "0.1" },
        base: { fields: { type: { required: true }, title: {}, summary: {} } },
        types: [
          {
            name: "FRD",
            // Override-by-redeclare: promote a base-shaped field to required (FRD/Spec pattern).
            fields: {
              feature: { required: true },
              priority: { enum: ["low", "high"] },
              owners: { kind: "list" },
              due: { kind: "datetime" },
            },
            sections: ["Requirements"],
          },
        ],
      },
      "test-profile",
    ),
  );

  test("a required custom field is enforced (throws when absent)", () => {
    const err = expectValidation(() => validateFrontmatter({ type: "FRD" }, { profile }));
    expect(err.message).toContain("feature");
  });

  test("a valid FRD with all fields passes", () => {
    expect(
      validateFrontmatter(
        { type: "FRD", feature: "checkout", priority: "high", owners: ["a", "b"], due: "2026-06-25T00:00:00Z" },
        { profile },
      ),
    ).toBe("FRD");
  });

  test("an enum value outside the closed set throws", () => {
    const err = expectValidation(() =>
      validateFrontmatter({ type: "FRD", feature: "x", priority: "urgent" }, { profile }),
    );
    expect(err.message).toContain("priority");
  });

  test("a list field given a scalar throws", () => {
    expectValidation(() => validateFrontmatter({ type: "FRD", feature: "x", owners: "solo" }, { profile }));
  });

  test("a non-ISO datetime throws", () => {
    expectValidation(() => validateFrontmatter({ type: "FRD", feature: "x", due: "tomorrow" }, { profile }));
  });

  test("an unknown type under a custom profile warns, never throws (OKF tolerance)", () => {
    expect(() => validateFrontmatter({ type: "Glossary" }, { profile })).not.toThrow();
  });

  test("the reserved coupling fields accept both a string and a list on a custom type", () => {
    expect(() => validateFrontmatter({ type: "FRD", feature: "x", supersedes: "old/frd" }, { profile })).not.toThrow();
    expect(() =>
      validateFrontmatter({ type: "FRD", feature: "x", superseded_by: ["a/b", "c/d"] }, { profile }),
    ).not.toThrow();
  });

  test("the summary length heuristic stays a lore built-in, not declared in the profile", () => {
    // ADR-0006 §5: an over-long summary still warns even though no profile field expresses it.
    const profileWithSummary = compileProfile(
      parseProfile(
        {
          profile: { name: "t", okf_version: "0.1" },
          base: { fields: { type: { required: true }, summary: {} } },
          types: [{ name: "Note" }],
        },
        "p",
      ),
    );
    const warnings = new WarningCollector();
    validateFrontmatter({ type: "Note", summary: "x".repeat(250) }, { profile: profileWithSummary, warnings });
    expect(warnings.list().some((w) => w.includes("250 chars"))).toBe(true);
  });
});

describe("AC#8 — reconciles ECK's 17-type SDD profile with zero consumer edits", () => {
  // The 17 Title-Case types ECK re-stamps when adopting lore (ECK-ALIGNMENT.md D1). lore bundles
  // NO consumer profile; this fixture stands in for the profile ECK ships in its own repo, proving
  // the declarative grammar expresses the whole vocabulary without a code change on either side.
  const ECK_TYPES = [
    "ADR",
    "PRD",
    "FRD",
    "Spec",
    "Design",
    "Discovery",
    "Research",
    "Risk",
    "QA Plan",
    "Tasks",
    "Review",
    "Guide",
    "Reference",
    "Overview",
    "Template",
    "Bug",
    "Policy",
  ];

  const eckProfile = compileProfile(
    parseProfile(
      {
        profile: { name: "eck-sdd", okf_version: "0.1", case: "Title", resource_base: "https://docs.example.com/" },
        base: {
          fields: {
            type: { required: true },
            title: {},
            description: {},
            tags: { kind: "list" },
            summary: {},
            timestamp: { kind: "datetime" },
          },
        },
        types: ECK_TYPES.map((name) => ({
          name,
          // A representative per-type shape: FRD/Spec promote a required `feature`, QA Plan carries
          // an enum'd status — enough to exercise required/enum/sections across the vocabulary.
          fields:
            name === "FRD" || name === "Spec"
              ? { feature: { required: true } }
              : name === "QA Plan"
                ? { coverage: { enum: ["partial", "full"] } }
                : {},
          sections: name === "ADR" ? ["Status", "Context", "Decision", "Consequences"] : [],
        })),
      },
      "eck-profile",
    ),
  );

  test("all 17 types compile and are present", () => {
    expect(eckProfile.types.size).toBe(17);
    for (const name of ECK_TYPES) {
      expect(eckProfile.types.has(name)).toBe(true);
    }
  });

  test("'QA Plan' produces a valid lower-kebab slug + schema filename (no invalid path/URI, AC#7)", () => {
    expect(eckProfile.types.get("QA Plan")?.slug).toBe("qa-plan");
  });

  test("resource_base from the profile is exposed (drives LORE-47 stamping)", () => {
    expect(eckProfile.resourceBase).toBe("https://docs.example.com/");
  });

  test("a sample concept of every ECK type validates against the generated validators", () => {
    for (const name of ECK_TYPES) {
      const fm: Record<string, unknown> = { type: name, title: `A ${name}`, summary: "One line." };
      if (name === "FRD" || name === "Spec") {
        fm.feature = "checkout";
      }
      if (name === "QA Plan") {
        fm.coverage = "full";
      }
      expect(validateFrontmatter(fm, { profile: eckProfile })).toBe(name);
    }
  });

  test("every ECK type's generated JSON Schema requires `type` and stays open (OKF tolerance)", () => {
    for (const type of eckProfile.types.values()) {
      // `type` is always required (the OKF floor); a declared-required field (FRD/Spec `feature`)
      // is additionally required, which is the intended editor behavior. The schema stays open.
      expect(type.jsonSchema.required).toContain("type");
      expect(type.jsonSchema.additionalProperties).toEqual({});
    }
  });
});
