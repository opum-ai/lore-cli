/**
 * LCLI-723 / DEC-192 (4) — the EFFECTIVE lifecycle `status` enum.
 *
 * DEC-192 (4) rules that the enum an ADR is judged against is the one its own profile DECLARES,
 * with the built-in `[draft, stable, deprecated]` as the fallback for a profile that declares none,
 * and that the emitted schema and the runtime load check must read the SAME enum. They did not:
 * `FieldSpec.enum` fed the emitted schema (`profile.ts`) while the load check hard-coded the
 * built-in triple (`schema.ts`), so a `[draft, approved]` profile emitted its own enum and enforced
 * the built-in one — its own committed schema declared documents valid that load refused.
 *
 * Proved BOTH ways, per the ruling: the custom profile ACCEPTS its declared value and REFUSES the
 * built-in one, and the default profile is unchanged. `test/lifecycle-status-enum.test.ts` keeps
 * the LCLI-669 half (the built-in vocabulary, and the 0.1 task-rollup carve-out).
 */
import { describe, expect, test } from "bun:test";
import type { BundleState } from "../src/core/okf-version";
import {
  BUILTIN_LIFECYCLE_STATUS,
  compileProfile,
  defaultProfile,
  type Profile,
  parseProfile,
} from "../src/core/profile";
import { emitSchemaFiles, schemaForVersion, validateFrontmatter } from "../src/core/schema";
import type { LoreError } from "../src/errors";

/** Run `fn` expecting a thrown {@link LoreError}, returned so `message` and `hint` are both readable. */
function thrownBy(fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    return err as LoreError;
  }
  throw new Error("expected the call to throw, but it returned");
}

/**
 * The enum values an emitted `status` property advertises. Read structurally rather than by shape,
 * because the two versions legitimately differ: an OPTIONAL declared field emits a nullish union
 * (`{anyOf:[{enum},{type:"null"}]}`), while 0.2's versioned override (`schemaForVersion`) replaces
 * the property with a flat `{type:"string",enum:[…]}`. Reading through both keeps the assertion
 * about the ENUM rather than about which wrapper the emitter happened to use.
 */
function emittedStatusEnum(property: unknown): readonly string[] | undefined {
  const p = property as { enum?: string[]; anyOf?: { enum?: string[] }[] } | undefined;
  return p?.enum ?? p?.anyOf?.find((arm) => arm.enum !== undefined)?.enum;
}

const V01: BundleState = { okfVersion: "0.1", source: "legacy-missing" };
const V02: BundleState = { okfVersion: "0.2", source: "declared" };

/**
 * A profile whose declared `status` enum REPLACES the built-in one: `[draft, approved]` only.
 *
 * It declares a `Story` as well as an `ADR`, and that second type is load-bearing rather than
 * incidental (LCLI-728 (2)). The 0.1 task-rollup carve-out is a claim about a type the profile
 * DECLARES: with `ADR` alone, a `type: "Story"` document is an UNKNOWN type, so the carve-out
 * return it exercised was the unknown-type one and the test proved less than its name said. The
 * rollup test below asserts this precondition, so the fixture cannot quietly regress to that.
 *
 * `Story` carries its OWN `status`, deliberately open (`{}`, an optional string), rather than
 * inheriting the base enum. That is not decoration either, and it was measured: with the inherited
 * `[draft, approved]`, a `status: "done"` Story is refused — but by the generated TYPE SCHEMA
 * (`invalid Story frontmatter: status: Invalid option`), which runs on every version, not by the
 * lifecycle check this test is about. A profile that closes `status` on a task-coupled 0.1 type has
 * closed its own rollup key, and the schema says so first. Declaring `status` open here mirrors how
 * the built-in profile declares it, and isolates the carve-out the test names.
 */
function customProfile(okfVersion: "0.1" | "0.2"): Profile {
  return compileProfile(
    parseProfile(
      {
        profile: { name: "custom", okf_version: okfVersion },
        base: { fields: { type: { required: true }, status: { enum: ["draft", "approved"] } } },
        types: [{ name: "ADR" }, { name: "Story", fields: { status: {} } }],
      },
      "test-profile",
    ),
  );
}

/** Validate an ADR frontmatter under `profile`/`state`, as a thunk so `expect` can catch it. */
function adr(status: unknown, profile: Profile, state: BundleState): () => unknown {
  return () =>
    validateFrontmatter({ type: "ADR", status }, { profile, bundleState: state, path: "docs/adr/0001-x.md" });
}

describe("effective status enum — a profile's DECLARED enum takes precedence (LCLI-723)", () => {
  for (const [label, version, state] of [
    ["0.1", "0.1", V01],
    ["0.2", "0.2", V02],
  ] as const) {
    const profile = customProfile(version);

    test(`${label}: a [draft, approved] profile ACCEPTS "approved" on an ADR`, () => {
      expect(adr("approved", profile, state)).not.toThrow();
      expect(adr("draft", profile, state)).not.toThrow();
    });

    test(`${label}: the same profile REFUSES "stable" — the declared enum replaced the built-in one`, () => {
      // The other half of the defect: before this, `stable` passed because load enforced the
      // built-in triple regardless of what the profile declared.
      const err = thrownBy(adr("stable", profile, state));
      expect(err.type).toBe("validation");
      expect(err.message).toMatch(/invalid OKF lifecycle status/);
      expect(err.message).toMatch(/got "stable"/);
      // The remedy must name the values that WOULD have been accepted — the profile's own — and
      // say so explicitly, because the built-in draft/stable/deprecated no longer apply here.
      expect(err.hint).toMatch(/"draft", "approved"/);
      expect(err.hint).toMatch(/declared values/);
    });
  }

  test("the default profile still refuses `superseded` — the built-in fallback is unchanged", () => {
    for (const state of [V01, V02]) {
      expect(adr("superseded", defaultProfile(), state)).toThrow(/invalid OKF lifecycle status/);
      expect(adr("superseded", defaultProfile(), state)).toThrow(/got "superseded"/);
    }
    for (const good of BUILTIN_LIFECYCLE_STATUS) {
      expect(adr(good, defaultProfile(), V01)).not.toThrow();
    }
  });

  test("the 0.1 task-rollup carve-out holds on a DECLARED type, not an unknown one", () => {
    const profile = customProfile("0.1");
    // The precondition that makes the rest of this test mean anything (LCLI-728 (2)): the carve-out
    // is defined for a type the profile KNOWS. With `Story` undeclared, `validateLifecycleStatus`
    // returned at the unknown-type guard instead and the test passed for the wrong reason.
    expect(profile.types.has("Story")).toBe(true);
    for (const rollup of ["todo", "in-progress", "done"]) {
      expect(validateFrontmatter({ type: "Story", status: rollup }, { profile, bundleState: V01 })).toBe("Story");
    }
  });

  test("...and the SAME declared type IS judged on 0.2, where the carve-out does not apply", () => {
    // The other half, so the test above cannot pass by the carve-out simply never firing: on 0.2
    // the effective enum governs every type, so this profile's `[draft, approved]` rejects a rollup
    // value on the very type 0.1 let through.
    const profile = customProfile("0.2");
    expect(profile.types.has("Story")).toBe(true);
    expect(() => validateFrontmatter({ type: "Story", status: "done" }, { profile, bundleState: V02 })).toThrow(
      /invalid OKF lifecycle status/,
    );
  });
});

describe("effective status enum — the emitted schema and the load check read ONE enum (LCLI-723)", () => {
  test("0.2: the shipped adr.schema.json declares the profile's own enum, and load agrees with it", () => {
    const profile = customProfile("0.2");
    const adrType = profile.types.get("ADR");
    expect(adrType?.lifecycleStatusEnum).toEqual(["draft", "approved"]);

    // The bytes that actually ship: `.lore/schemas/adr.schema.json` as `lore init`/`schema export`
    // write them. Asserting on the FILE, not on `schemaForVersion` alone, is what makes this a
    // claim about the emitted contract rather than about an internal helper.
    const file = emitSchemaFiles(profile).find((f) => f.path.endsWith("adr.schema.json"));
    expect(file).toBeDefined();
    const emitted = JSON.parse(file?.contents ?? "{}") as { properties: { status: unknown } };
    const advertised = emittedStatusEnum(emitted.properties.status);
    expect(advertised).toEqual(["draft", "approved"]);
    expect(advertised).toEqual(adrType?.lifecycleStatusEnum); // the SAME enum the load check reads

    // THE AGREEMENT ITSELF: every value the emitted schema advertises is accepted at load, and a
    // value it does NOT advertise is refused. That is the defect, stated as a property.
    for (const value of advertised ?? []) {
      expect(adr(value, profile, V02)).not.toThrow();
    }
    expect(advertised).not.toContain("stable");
    expect(adr("stable", profile, V02)).toThrow(/invalid OKF lifecycle status/);
  });

  test("0.1: the emitted schema carries the declared enum too — the emitter does not force the built-in", () => {
    const profile = customProfile("0.1");
    const adrType = profile.types.get("ADR");
    const properties = schemaForVersion(adrType!, profile).properties as Record<string, unknown>;
    expect(emittedStatusEnum(properties.status)).toEqual(["draft", "approved"]);
    expect(emittedStatusEnum(properties.status)).toEqual(adrType?.lifecycleStatusEnum);
  });

  test("the DEFAULT profile emits exactly the built-in triple — no committed schema moves (regression)", () => {
    const profile = defaultProfile();
    const adrType = profile.types.get("ADR");
    const properties = schemaForVersion(adrType!, profile).properties as Record<string, unknown>;
    const advertised = emittedStatusEnum(properties.status);
    expect(advertised).toEqual([...BUILTIN_LIFECYCLE_STATUS]);
    // ...and the load check agrees, value for value.
    for (const value of advertised ?? []) {
      expect(adr(value, profile, V02)).not.toThrow();
    }
    expect(adr("superseded", profile, V02)).toThrow(/invalid OKF lifecycle status/);
  });
});
