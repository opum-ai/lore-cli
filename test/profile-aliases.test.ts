import { describe, expect, test } from "bun:test";
import { schemaDriftFindings } from "../src/core/check";
import { compileProfile, parseProfile, profileTypeDeclaresField } from "../src/core/profile";
import { canonicalType, emitSchemaFiles } from "../src/core/schema";
import { LoreError } from "../src/errors";

/**
 * Deprecated type aliases (LCLI-553) — the capability the Story -> Arc rename rides on.
 *
 * Each test names the assertion it exercises, so the mutation prediction recorded on LCLI-553 is a
 * READING of this file rather than a claim about it: seeding `byLowerName` and seeding `bySlug` are
 * two separate half-steps of the compile loop, and the cases below are grouped by which one they
 * depend on. A mutant that removes one seeding must redden that group and leave the other green.
 *
 * WHY A MULTI-WORD ALIAS IS LOAD-BEARING HERE, and it is not a stylistic choice. For a SINGLE-WORD
 * alias the lowercased name and the lower-kebab slug are the SAME STRING (`Story` -> `story` both
 * ways), so `bySlug` alone resolves it and the two seedings are indistinguishable. The first draft
 * of this file used only single-word aliases, and a mutant deleting the whole `byLowerName` alias
 * seeding left all thirteen cases GREEN — the suite was asserting a property it did not test. Only
 * a multi-word alias separates them: `User Story` lowercases to `user story` and slugs to
 * `user-story`, which are different keys in different maps. Do not "simplify" these fixtures back
 * to one word.
 */

/** A profile declaring `Arc` with `Story` as a deprecated alias — the real migration's shape. */
function aliasedDoc(aliases: readonly string[] = ["Story"]): Record<string, unknown> {
  return {
    profile: { name: "arc-test", okf_version: "0.2" },
    base: { fields: { type: { required: true } } },
    types: [{ name: "Arc", aliases, fields: { tasks: { kind: "list" } }, sections: [] }, { name: "Reference" }],
  };
}

function compiled(aliases?: readonly string[]) {
  return compileProfile(parseProfile(aliasedDoc(aliases), "test-profile"));
}

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

describe("alias NAME resolution (depends on the byLowerName seeding)", () => {
  test("canonicalType resolves an alias to the canonical name", () => {
    expect(canonicalType("Story", compiled())).toBe("Arc");
  });

  test("canonicalType resolves an alias case-insensitively, as it does a real name", () => {
    expect(canonicalType("story", compiled())).toBe("Arc");
    expect(canonicalType("STORY", compiled())).toBe("Arc");
  });

  test("profileTypeDeclaresField sees the canonical type's fields through an alias", () => {
    // The regression the whole migration exists to prevent: this predicate is what `lore link`
    // gates new task coupling on (commands/link.ts), so a false here is a hard failure on an
    // un-migrated document rather than a warning.
    expect(profileTypeDeclaresField("Story", "tasks", compiled())).toBe(true);
  });

  test("a MULTI-WORD alias resolves by its exact name — only byLowerName can do this", () => {
    // `user story` is not any type's slug, so bySlug cannot answer it. This is the one case that
    // fails if the byLowerName alias seeding is removed.
    expect(canonicalType("User Story", compiled(["User Story"]))).toBe("Arc");
    expect(profileTypeDeclaresField("user story", "tasks", compiled(["User Story"]))).toBe(true);
  });

  test("an unknown type is still unknown — the alias does not make resolution permissive", () => {
    expect(canonicalType("Saga", compiled())).toBe("Saga");
    expect(profileTypeDeclaresField("Saga", "tasks", compiled())).toBe(false);
  });
});

describe("alias SLUG ownership (depends on the bySlug seeding and the emitter)", () => {
  test("a MULTI-WORD alias also resolves by its SLUG — only bySlug can do this", () => {
    // The mirror of the byLowerName case: `user-story` is not the alias's lowercased name, so
    // byLowerName cannot answer it.
    expect(canonicalType("user-story", compiled(["User Story"]))).toBe("Arc");
  });

  test("emitSchemaFiles writes a byte-identical schema per alias spelling", () => {
    const files = emitSchemaFiles(compiled());
    const arc = files.find((f) => f.path.endsWith("arc.schema.json"));
    const story = files.find((f) => f.path.endsWith("story.schema.json"));
    expect(arc).toBeDefined();
    expect(story).toBeDefined();
    expect(story?.contents).toBe(arc?.contents as string);
  });

  test("the retained alias schema is OWNED, not orphaned, by the drift gate", () => {
    // The measured reason option (c) exists: under a resolve-only alias this same file came back
    // as `error ... no type in the active profile owns this schema`, error-tier, in every
    // consuming repository.
    //
    // `committed` is built INDEPENDENTLY of the alias emission -- it is what a consumer's repo
    // actually holds across the rename: the canonical file plus the old `story.schema.json` still
    // sitting there. Deriving it from `emitSchemaFiles` instead would make both sides of the
    // comparison move together, and the test would assert only that the emitter agrees with
    // itself. It did exactly that in its first draft and survived a mutant that deleted the alias
    // emission outright.
    const emitted = emitSchemaFiles(compiled());
    const arcBytes = emitted.find((f) => f.path.endsWith("arc.schema.json"))?.contents as string;
    // Build `committed` with the alias path added BY THIS TEST rather than taken from the
    // emitter's own alias output -- that is what keeps the two sides from moving together. If the
    // emitter stops emitting the alias path, this committed file becomes orphaned and the case
    // goes red, which is exactly the mutant it has to catch.
    const committed = new Map(
      emitted.filter((f) => !f.path.endsWith("story.schema.json")).map((f) => [f.path, f.contents] as const),
    );
    committed.set(".lore/schemas/story.schema.json", arcBytes);

    const regenerated = new Map(emitted.map((f) => [f.path, f.contents] as const));
    expect(schemaDriftFindings({ committed, regenerated })).toEqual([]);
  });
});

describe("alias collisions are rejected at compile time", () => {
  test("an alias that is already a declared type name is rejected", () => {
    const err = expectValidation(() => parseProfile(aliasedDoc(["Reference"]), "test-profile"));
    expect(err.message).toContain("already a declared type name");
  });

  test("an alias declared twice is rejected", () => {
    const doc = aliasedDoc(["Story", "story"]);
    expect(expectValidation(() => parseProfile(doc, "test-profile")).message).toContain("duplicate alias");
  });

  test("an alias whose SLUG collides with a declared type's slug is rejected", () => {
    // "Reference!" is not the NAME "Reference" (so the name check above lets it through) but slugs
    // to `reference`, which the Reference type owns. Slug is file identity: both would key
    // `.lore/schemas/reference.schema.json` and the second would silently overwrite the first.
    const err = expectValidation(() => parseProfile(aliasedDoc(["Reference!"]), "test-profile"));
    expect(err.message).toContain("slug");
  });

  test("two aliases that reduce to the SAME slug are rejected", () => {
    // Distinct spellings, distinct lower-cased names, one shared slug -- so only the slug check
    // can catch this pair.
    const err = expectValidation(() => parseProfile(aliasedDoc(["Foo Bar", "Foo-Bar"]), "test-profile"));
    expect(err.message).toContain("slug");
  });

  test("an alias with no slug-able characters is rejected", () => {
    expect(expectValidation(() => parseProfile(aliasedDoc(["---"]), "test-profile")).message).toContain("slug-able");
  });
});

describe("a profile with no aliases is unchanged", () => {
  test("types carry an empty alias list and emit exactly one schema each", () => {
    const p = compileProfile(
      parseProfile(
        {
          profile: { name: "plain", okf_version: "0.2" },
          base: { fields: { type: { required: true } } },
          types: [{ name: "Note" }],
        },
        "test-profile",
      ),
    );
    expect(p.types.get("Note")?.aliases).toEqual([]);
    expect(emitSchemaFiles(p).map((f) => f.path)).toEqual([".lore/schemas/note.schema.json"]);
  });
});

describe("alias ACCEPTANCE — the type field admits an alias spelling (LCLI-558)", () => {
  test("a document carrying the ALIAS spelling validates against the canonical type", () => {
    // LCLI-553 shipped resolution without this and the regression stayed live: an un-migrated
    // document resolved to Arc and was then rejected by `z.literal("Arc")`, so `lore link` still
    // refused it. The failure had moved from the coupling gate to the validation gate.
    const type = compiled().types.get("Arc");
    expect(type?.schema.safeParse({ type: "Story", title: "t" }).success).toBe(true);
    expect(type?.schema.safeParse({ type: "Arc", title: "t" }).success).toBe(true);
  });

  test("an UNDECLARED type is still rejected — acceptance widens to declared aliases only", () => {
    expect(compiled().types.get("Arc")?.schema.safeParse({ type: "Saga", title: "t" }).success).toBe(false);
  });

  test("the emitted JSON Schema admits both spellings, and the alias file stays byte-identical", () => {
    const files = emitSchemaFiles(compiled());
    const arc = files.find((f) => f.path.endsWith("arc.schema.json"));
    const story = files.find((f) => f.path.endsWith("story.schema.json"));
    const typeProp = (JSON.parse(arc?.contents as string).properties as Record<string, unknown>).type;
    expect(typeProp).toEqual({ type: "string", enum: ["Arc", "Story"] });
    expect(story?.contents).toBe(arc?.contents as string);
  });

  test("an ALIASLESS type keeps its existing `const` form — no churn for profiles without aliases", () => {
    const plain = compileProfile(
      parseProfile(
        {
          profile: { name: "plain", okf_version: "0.2" },
          base: { fields: { type: { required: true } } },
          types: [{ name: "Note" }],
        },
        "test-profile",
      ),
    );
    const json = JSON.parse(emitSchemaFiles(plain)[0]?.contents as string);
    expect((json.properties as Record<string, unknown>).type).toEqual({ type: "string", const: "Note" });
  });
});
