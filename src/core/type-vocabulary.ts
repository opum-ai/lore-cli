/**
 * core/type-vocabulary.ts — the pure data assembly behind `lore types` (cli-surface §types;
 * LCLI-537).
 *
 * Before this module, no command read out a bundle's active type vocabulary: `lore schema export`
 * (`core/schema.ts` + `commands/schema.ts`) **writes** `.lore/schemas/*.schema.json` files and
 * requires the caller to already know a type name to inspect one usefully — a file-materialization
 * command, not a discovery command. An agent that hit the unknown-type warning had no CLI path to
 * ask "what types does this bundle actually support" short of hand-reading `.lore/profile.toml` and
 * `.lore/schemas/*.json` and reconciling the two.
 *
 * This module answers that question directly from the already-compiled {@link Profile}: for every
 * declared type, its slug, required body sections, declared template (if any), and its full field
 * set — each field's requiredness, a short human-readable shape label, enum values when it has a
 * closed vocabulary, and whether the field is **common** (carried by every declared type) or
 * **type-specific** (only some).
 *
 * ## Where the field data comes from — and why
 *
 * Every field's shape is read from {@link CompiledType.jsonSchema} through
 * {@link import("./schema").schemaForVersion} — the SAME Draft-7 JSON Schema `lore schema export`
 * writes to `.lore/schemas/<slug>.schema.json` (via `emitSchemaFiles`) — rather than re-deriving a
 * parallel description from the profile's own declarative `FieldSpec` grammar. Two reasons:
 *
 * 1. **Consistency with what's on disk.** `schemaForVersion` folds in the OKF 0.2 version-conditional
 *    families (`generated`, `sources`, `status`, …) that are validated by `core/schema.ts`'s
 *    `validateVersionedFrontmatter`, entirely outside the declarative profile grammar (LORE-46's own
 *    documented expressiveness limit — ADR-0006 §5's summary heuristic and these OKF 0.2 families
 *    both stay lore built-ins for the same reason). A report built only from `ParsedType.fields`
 *    would silently omit them for a 0.2 profile, understating the type's real field set.
 * 2. **No new data need cross the profile/schema boundary.** `Profile`/`CompiledType` already discard
 *    the parsed `FieldSpec`s after compiling each type's Zod validator + JSON Schema (see
 *    `profile.ts`'s module docstring: "the data/IO concern... apart from the validation/emission
 *    concern"). Reusing the already-compiled JSON Schema keeps this module a pure *consumer* of that
 *    boundary rather than reopening it to thread `FieldSpec`s through `CompiledType` for one reporting
 *    command.
 *
 * A field is classified **common** when its name appears in EVERY declared type's field set (by
 * name, not by shape) and **type-specific** otherwise. This is a name-based classification, not a
 * literal "declared in `[base.fields]` vs a type's own `fields`" one: a type may override a base
 * field by re-declaring it (`profile.ts` compiles that as a full replace, same name), and the override
 * is still correctly "common" under this definition, because the reader's actual question is "does
 * every type carry a field with this name", not "which TOML table first mentioned it".
 */

import type { CompiledType, Profile } from "./profile";
import { defaultProfile } from "./profile";
import { schemaForVersion } from "./schema";

/** A JSON Schema shape's short human-readable label, derived by {@link describeSchemaProperty}. */
export type TypeFieldKind = string;

/** One field on one type, as reported by `lore types`. */
export interface TypeVocabularyField {
  /** The frontmatter key. */
  readonly name: string;
  /** Whether the type's effective JSON Schema (post-{@link schemaForVersion}) requires it. */
  readonly required: boolean;
  /** Whether every declared type in the profile carries a field of this same name. */
  readonly common: boolean;
  /** A short shape label (`string`, `list`, `datetime`, `number`, `integer`, `boolean`, `enum`, `object`, a `"x | y"` union, or `mixed` when nothing more specific applies). */
  readonly kind: TypeFieldKind;
  /** The closed value set, when `kind` is `"enum"` or a list of one. */
  readonly enum?: readonly string[];
  /** The element shape label, when `kind` is `"list"`. */
  readonly itemKind?: TypeFieldKind;
}

/** One declared type, as reported by `lore types`. */
export interface TypeVocabularyEntry {
  /** The canonical OKF `type` value. */
  readonly name: string;
  /** The LOWER-KEBAB slug — the stem of its schema file and conventional template. */
  readonly slug: string;
  /** The declared custom template filename under `.lore/templates/`, when this type has one. */
  readonly template?: string;
  /** The required body sections (`##` headings), in declared order; empty when the type imposes none. */
  readonly requiredSections: readonly string[];
  /** Every field this type's effective schema carries, in profile declaration order. */
  readonly fields: readonly TypeVocabularyField[];
}

/** The `types.report` payload: the active profile's identity plus its full declared type vocabulary. */
export interface TypeVocabularyReport {
  readonly profile: {
    readonly name: string;
    readonly okfVersion: string;
    readonly case: string;
  };
  /** Every requested type (all of them, or just `options.only`), in profile declaration order. */
  readonly types: readonly TypeVocabularyEntry[];
}

/** Options for {@link buildTypeVocabulary}. */
export interface TypeVocabularyOptions {
  /** Scope the report to one already-resolved canonical type name; default: every declared type. */
  readonly only?: string;
}

/**
 * Assemble the `types.report` payload for `profile` (default: the built-in story-convention
 * profile). Pure and deterministic: the same profile always yields the same report. `options.only`
 * is expected to already be the type's CANONICAL spelling (as {@link import("./schema").canonicalType}
 * resolves it) — the caller's job, so this module stays a plain consumer of the compiled profile and
 * never re-implements case-insensitive type resolution.
 */
export function buildTypeVocabulary(
  profile: Profile = defaultProfile(),
  options: TypeVocabularyOptions = {},
): TypeVocabularyReport {
  const allTypes = [...profile.types.values()];
  const commonFieldNames = intersectFieldNames(allTypes, profile);
  const selected = options.only === undefined ? allTypes : allTypes.filter((type) => type.name === options.only);

  return {
    profile: { name: profile.name, okfVersion: profile.okfVersion, case: profile.case },
    types: selected.map((type) => buildTypeEntry(type, profile, commonFieldNames)),
  };
}

/** One type's effective field name set — every key its post-{@link schemaForVersion} JSON Schema declares. */
function fieldNamesFor(type: CompiledType, profile: Profile): string[] {
  const schema = schemaForVersion(type, profile);
  return Object.keys((schema.properties ?? {}) as Record<string, unknown>);
}

/** The field names present on EVERY declared type — the "common"/base classification, by name (see module docstring). */
function intersectFieldNames(types: readonly CompiledType[], profile: Profile): ReadonlySet<string> {
  if (types.length === 0) {
    return new Set();
  }
  let common = new Set(fieldNamesFor(types[0] as CompiledType, profile));
  for (const type of types.slice(1)) {
    const names = new Set(fieldNamesFor(type, profile));
    common = new Set([...common].filter((name) => names.has(name)));
  }
  return common;
}

/** Build one type's {@link TypeVocabularyEntry} from its effective (post-{@link schemaForVersion}) JSON Schema. */
function buildTypeEntry(
  type: CompiledType,
  profile: Profile,
  commonFieldNames: ReadonlySet<string>,
): TypeVocabularyEntry {
  const schema = schemaForVersion(type, profile);
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const required = new Set((schema.required ?? []) as string[]);
  const fields = Object.keys(properties).map((name) => {
    const shape = describeSchemaProperty(properties[name]);
    return {
      name,
      required: required.has(name),
      common: commonFieldNames.has(name),
      kind: shape.kind,
      ...(shape.enum === undefined ? {} : { enum: shape.enum }),
      ...(shape.itemKind === undefined ? {} : { itemKind: shape.itemKind }),
    };
  });
  return {
    name: type.name,
    slug: type.slug,
    ...(type.template === undefined ? {} : { template: type.template }),
    requiredSections: type.requiredSections,
    fields,
  };
}

/** The shape {@link describeSchemaProperty} derives for one JSON Schema fragment. */
interface SchemaShape {
  readonly kind: TypeFieldKind;
  readonly enum?: readonly string[];
  readonly itemKind?: TypeFieldKind;
}

/**
 * Derive a short, human-readable shape label from a Draft-7 JSON Schema property fragment — the
 * generic reader for whatever {@link CompiledType.jsonSchema}/{@link schemaForVersion} emits, rather
 * than a second hand-rolled kind→label mapping that could drift from the one the profile's Zod
 * validators actually generate (mirrors `profile.ts`'s own "judge the default with `baseKindToZod`,
 * not a second mapping" rule for the same reason).
 *
 * An optional (`.nullish()`) field's generated shape is `anyOf: [<real shape>, {type:"null"}]`
 * (Zod v4's `z.toJSONSchema` for a nullable value) — the null branch is peeled off and the remaining
 * branch recursed into, so `required: false` alone signals optionality; the label itself describes
 * the field's real shape, not its own optionality. A genuine union of more than one non-null shape
 * (the `supersedes`/`superseded_by` reserved fields' `string | list-of-strings`) renders as a
 * `"x | y"` join of each branch's own label rather than collapsing to a generic "mixed" — accurate
 * and still short. `mixed` is the last-resort fallback for a fragment this reader cannot classify at
 * all (e.g. an empty `anyOf`), not for every union.
 */
export function describeSchemaProperty(prop: unknown): SchemaShape {
  if (prop === null || typeof prop !== "object") {
    return { kind: "mixed" };
  }
  const p = prop as Record<string, unknown>;

  if (Array.isArray(p.enum) && p.enum.every((value) => typeof value === "string")) {
    return { kind: "enum", enum: p.enum as string[] };
  }
  if (Array.isArray(p.anyOf)) {
    const nonNull = (p.anyOf as unknown[]).filter((branch) => !isNullSchema(branch));
    if (nonNull.length === 1) {
      return describeSchemaProperty(nonNull[0]);
    }
    if (nonNull.length > 1) {
      const labels = nonNull.map((branch) => describeSchemaProperty(branch).kind);
      return { kind: labels.join(" | ") };
    }
    return { kind: "mixed" };
  }
  if (p.type === "array") {
    const item = describeSchemaProperty(p.items);
    return { kind: "list", itemKind: item.kind, ...(item.enum === undefined ? {} : { enum: item.enum }) };
  }
  if (p.type === "string" && p.format === "date-time") {
    return { kind: "datetime" };
  }
  if (typeof p.type === "string") {
    return { kind: p.type };
  }
  return { kind: "mixed" };
}

/** Whether a JSON Schema fragment is the bare `{"type":"null"}` branch `.nullish()` adds. */
function isNullSchema(branch: unknown): boolean {
  return branch !== null && typeof branch === "object" && (branch as Record<string, unknown>).type === "null";
}
