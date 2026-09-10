import { describe, expect, test } from "bun:test";
import { parseConcept } from "../src/core/concept";
import { compileProfile, parseProfile } from "../src/core/profile";
import { buildScaffold, type ScaffoldFile } from "../src/core/scaffold";
import { VERSION } from "../src/meta";

/** A fixed ISO timestamp so every plan in this suite is byte-deterministic. */
const TS = "2026-06-25T12:00:00.000Z";

/** Built once (it runs 7 Zod→JSON-Schema conversions + a serialize) and reused across assertions. */
const PLAN = buildScaffold({ timestamp: TS });

/** The single file in {@link PLAN} with the given repo-relative path (fails if absent). */
function fileNamed(path: string): ScaffoldFile {
  const file = PLAN.files.find((f) => f.path === path);
  if (file === undefined) {
    throw new Error(`scaffold plan has no file ${path}`);
  }
  return file;
}

describe("scaffold — the empty-bundle plan", () => {
  test("ensures the .lore/ + docs/ directory tree, parents before children", () => {
    expect(buildScaffold({ timestamp: TS }).dirs).toEqual([
      ".lore",
      ".lore/schemas",
      ".lore/templates",
      ".lore/cache",
      "docs",
    ]);
  });

  test("emits a stable, ordered file set", () => {
    expect(buildScaffold({ timestamp: TS }).files.map((f) => f.path)).toEqual([
      ".lore/config.toml",
      ".lore/profile.toml",
      ".lore/.gitignore",
      ".lore/schemas/epic.schema.json",
      ".lore/schemas/story.schema.json",
      ".lore/schemas/spec.schema.json",
      ".lore/schemas/adr.schema.json",
      ".lore/schemas/runbook.schema.json",
      ".lore/schemas/reference.schema.json",
      ".lore/schemas/attested-computation.schema.json",
      ".lore/templates/.gitkeep",
      "docs/index.md",
    ]);
  });

  test("is deterministic — identical options yield a byte-identical plan", () => {
    expect(buildScaffold({ timestamp: TS })).toEqual(buildScaffold({ timestamp: TS }));
  });

  test("templates/.gitkeep is empty — template content is LORE-18's concern", () => {
    expect(fileNamed(".lore/templates/.gitkeep").contents).toBe("");
  });
});

describe("scaffold — .lore/config.toml default", () => {
  test("is fully commented, so it parses to an empty (zero-config) table", () => {
    const toml = fileNamed(".lore/config.toml").contents;
    expect(Bun.TOML.parse(toml)).toEqual({});
    expect(toml.endsWith("\n")).toBe(true);
  });

  test("documents the env-only token rule, never committing a token key", () => {
    const toml = fileNamed(".lore/config.toml").contents;
    expect(toml).toContain("LORE_CONFLUENCE_TOKEN");
    // No *uncommented* token assignment may appear (the committed-token guard in config.ts).
    expect(toml.split("\n").some((line) => /^\s*token\s*=/.test(line))).toBe(false);
  });
});

describe("scaffold — .lore/.gitignore", () => {
  test("ignores the transient cache directory", () => {
    const ignore = fileNamed(".lore/.gitignore").contents;
    expect(ignore.split("\n")).toContain("cache/");
    expect(ignore.endsWith("\n")).toBe(true);
  });
});

describe("scaffold — exported JSON Schemas", () => {
  const cases = [
    { path: ".lore/schemas/epic.schema.json", type: "Epic", required: ["type"] },
    { path: ".lore/schemas/story.schema.json", type: "Story", required: ["type"] },
    { path: ".lore/schemas/spec.schema.json", type: "Spec", required: ["type"] },
    { path: ".lore/schemas/adr.schema.json", type: "ADR", required: ["type"] },
    { path: ".lore/schemas/runbook.schema.json", type: "Runbook", required: ["type"] },
    { path: ".lore/schemas/reference.schema.json", type: "Reference", required: ["type"] },
    {
      path: ".lore/schemas/attested-computation.schema.json",
      type: "Attested Computation",
      required: ["type", "runtime"],
    },
  ] as const;

  for (const { path, type, required } of cases) {
    test(`${path} is a valid Draft-7 schema for ${type}`, () => {
      const file = fileNamed(path);
      expect(file.contents.endsWith("\n")).toBe(true);
      const schema = JSON.parse(file.contents) as Record<string, unknown>;
      expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(schema.required).toEqual(required);
      // The editor schema is the lenient tier: extra keys are allowed (open
      // additionalProperties), so an author's custom frontmatter never errors mid-edit.
      expect(schema.additionalProperties).toEqual({});
      const properties = schema.properties as Record<string, { const?: string }>;
      expect(properties.type?.const).toBe(type);
    });
  }

  test("Story's schema carries its per-type coupling fields", () => {
    const schema = JSON.parse(fileNamed(".lore/schemas/story.schema.json").contents) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).toContain("tasks");
    expect(Object.keys(schema.properties)).toContain("specs");
  });

  test("OKF 0.2 editor schemas recognize generated and sources provenance", () => {
    const schema = JSON.parse(fileNamed(".lore/schemas/reference.schema.json").contents) as {
      properties: Record<
        string,
        {
          required?: string[];
          properties?: Record<string, unknown>;
          items?: { required?: string[]; properties?: Record<string, unknown> };
        }
      >;
    };
    expect(schema.properties.generated?.required).toEqual(["by"]);
    expect(Object.keys(schema.properties.generated?.properties ?? {})).toEqual(["by", "at"]);
    expect(schema.properties.sources?.items?.required).toEqual(["resource"]);
    expect(Object.keys(schema.properties.sources?.items?.properties ?? {})).toEqual([
      "resource",
      "id",
      "title",
      "author",
      "usage_count",
      "last_modified",
      "usage_window",
    ]);
    expect(schema.properties.usage_window?.required).toEqual(["from", "to"]);
  });
});

describe("scaffold — the reserved root index", () => {
  const GOLDEN = `---
# yaml-language-server: $schema=../.lore/schemas/reference.schema.json
type: Reference
title: Documentation
summary: Root index of this OKF documentation bundle, created by \`lore init\`.
generated:
  by: lore/${VERSION}
  at: 2026-06-25T12:00:00.000Z
okf_version: "0.2"
---

# Documentation

This is the root index of an OKF documentation bundle, created by \`lore init\`.
Add concepts under \`docs/\` and link them from here. This file is the bundle's
entry point and the only one that carries \`okf_version\`.
`;

  test("matches the byte-exact golden (modeline inside the fence, okf_version carrier)", () => {
    expect(fileNamed("docs/index.md").contents).toBe(GOLDEN);
  });

  test("round-trips through parseConcept as a Reference carrying okf_version", () => {
    const concept = parseConcept("docs/index.md", fileNamed("docs/index.md").contents);
    expect(concept.type).toBe("Reference");
    expect(concept.frontmatter.okf_version).toBe("0.2");
  });

  test("stamps the injected instant as generated.at", () => {
    expect(fileNamed("docs/index.md").contents).toContain(`generated:\n  by: lore/${VERSION}\n  at: ${TS}`);
  });

  test.each(["0.1", "0.2"] as const)("honors a custom profile targeting OKF %s", (okfVersion) => {
    const profile = compileProfile(
      parseProfile(
        {
          profile: { name: "custom", okf_version: okfVersion },
          base: { fields: { type: { required: true } } },
          types: [{ name: "Reference" }],
        },
        "test-profile",
      ),
    );
    const plan = buildScaffold({ timestamp: TS, profile });
    const index = plan.files.find((file) => file.path === "docs/index.md");
    expect(index?.contents).toContain(`okf_version: "${okfVersion}"`);
    expect(index?.contents).toContain(okfVersion === "0.1" ? `timestamp: ${TS}` : `generated:\n  by: lore/${VERSION}`);
  });
});
