import { describe, expect, test } from "bun:test";
import { type CompiledType, compileProfile, type Profile, parseProfile } from "../src/core/profile";
import { profileDigest } from "../src/core/schema";

/**
 * The generator stamp's digest stability contract (LCLI-565; the contract is the comment on
 * `profileDigest` in src/core/schema.ts). A digest change moves every committed schema in every
 * repository at once, so this file pins the value itself, shows each INCLUDED input moves it, and
 * shows each deliberately EXCLUDED input does not. The contract is ORDER-SENSITIVE: declaration
 * order is part of the projection, and a test below pins that too.
 */

/** A small fixed profile. Changing this document changes the golden value below — deliberately. */
function doc(overrides: { aliases?: string[]; requiredTitle?: boolean; swap?: boolean } = {}): Record<string, unknown> {
  const types = [
    {
      name: "Arc",
      aliases: overrides.aliases ?? ["User Story"],
      fields: { owner: { required: true }, tasks: { kind: "list" } },
      sections: ["Summary"],
    },
    { name: "Reference", fields: { audience: {} }, sections: [] },
  ];
  return {
    profile: { name: "digest-fixture", okf_version: "0.2" },
    base: { fields: { type: { required: true }, title: { required: overrides.requiredTitle ?? false } } },
    types: overrides.swap ? [types[1], types[0]] : types,
  };
}

const digestOf = (d: Record<string, unknown>): string =>
  profileDigest(compileProfile(parseProfile(d, "digest-fixture")));

/** `profile` with one type's compiled definition replaced — for inputs no profile document can change alone. */
function withType(profile: Profile, name: string, edit: (type: CompiledType) => CompiledType): Profile {
  const types = new Map([...profile.types].map(([key, type]) => [key, key === name ? edit(type) : type] as const));
  return { ...profile, types };
}

describe("profileDigest — golden value (projection lore-profile-digest/1)", () => {
  test("the fixed profile hashes to its recorded value", () => {
    // If this fails, the projection changed. That is a fleet-wide rollout event: bump
    // PROFILE_DIGEST_PROJECTION, ship a rollout note, and only then update this literal.
    //
    // Derived INDEPENDENTLY of the implementation, from the contract's text alone (Python, compact
    // `json.dumps` of ["lore-profile-digest/1", [[name, slug, aliases, [[field, required], ...]], ...]]
    // with base fields, then own fields, then the six reserved coupling fields), and it matched.
    expect(digestOf(doc())).toBe("sha256:fa8beb6f51a4f5eb7b2369e3b44e49f8bd36b810bce38ebfc13ba2f1f5ffa6c8");
  });

  test("the digest is well-formed and deterministic", () => {
    expect(digestOf(doc())).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(digestOf(doc())).toBe(digestOf(doc()));
  });
});

describe("profileDigest — every INCLUDED input moves it", () => {
  const base = digestOf(doc());

  test("changing an alias changes the digest", () => {
    expect(digestOf(doc({ aliases: ["Epic Story"] }))).not.toBe(base);
    expect(digestOf(doc({ aliases: [] }))).not.toBe(base);
  });

  test("flipping a field's requiredness changes the digest", () => {
    expect(digestOf(doc({ requiredTitle: true }))).not.toBe(base);
  });

  test("changing a type's slug changes the digest", () => {
    const profile = compileProfile(parseProfile(doc(), "digest-fixture"));
    const reslugged = withType(profile, "Arc", (type) => ({ ...type, slug: "arc-renamed" }));
    expect(profileDigest(reslugged)).not.toBe(profileDigest(profile));
  });

  test("declaration order is part of the projection — the contract is order-SENSITIVE", () => {
    expect(digestOf(doc({ swap: true }))).not.toBe(base);
  });
});

describe("profileDigest — every deliberately EXCLUDED input leaves it alone", () => {
  const base = digestOf(doc());

  test("[profile] scalars do not move it: name, case, resource_base, strict_types, okf_version", () => {
    const d = doc();
    d.profile = { name: "renamed", okf_version: "0.1", case: "lower", resource_base: "https://x/", strict_types: true };
    expect(digestOf(d)).toBe(base);
  });

  test("field kinds, enums, defaults, required sections and templates do not move it", () => {
    const d = doc();
    const [arc, reference] = d.types as Array<Record<string, unknown>>;
    d.types = [
      {
        ...arc,
        fields: { owner: { required: true, enum: ["a", "b"] }, tasks: { kind: "list", default: [] } },
        sections: [],
      },
      { ...reference, sections: ["Overview"], template: "reference.md" },
    ];
    expect(digestOf(d)).toBe(base);
  });

  test("compiled state outside the projection (the editor JSON Schema) does not move it", () => {
    const profile = compileProfile(parseProfile(doc(), "digest-fixture"));
    const edited = withType(profile, "Arc", (type) => ({ ...type, jsonSchema: { ...type.jsonSchema, title: "x" } }));
    expect(profileDigest(edited)).toBe(profileDigest(profile));
  });
});
