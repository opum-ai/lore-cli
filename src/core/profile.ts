/**
 * profile.ts — the declarative type profile: lore's type vocabulary as **data**.
 *
 * Per [ADR-0006](../../docs/adr/0006-schema-types-templates.md) (amended by LORE-46),
 * the OKF type system is **profile-driven**: a committed, declarative
 * `.lore/profile.toml` is the single source of truth for the type vocabulary, each
 * type's frontmatter shape, its required body sections, and its template. lore
 * **generates** its runtime Zod validators and the editor Draft-7 JSON Schemas *from*
 * the profile at load — inverting the old "Zod-in-code is the source of truth" so a
 * project can add or retype concepts by editing data, never code (AC#4, AC#5).
 *
 * This module owns **loading and compiling** a profile; `schema.ts` consumes the
 * compiled {@link Profile} to validate frontmatter and emit editor schemas. The split
 * keeps the data/IO concern (here) apart from the validation/emission concern (there)
 * and means the compiler has one home with one test surface.
 *
 * Three properties define its behavior, mirroring {@link import("../config")}:
 *
 * - **Zero-config.** A missing `profile.toml` is not an error: {@link loadProfile}
 *   returns the built-in {@link defaultProfile} — the six story-convention types
 *   (Epic/Story/Spec/ADR/Runbook/Reference), byte-for-byte the behavior lore shipped
 *   before the profile existed (AC#3). The file exists only to extend or replace it.
 * - **The declarative language is the boundary.** The grammar expresses field kinds,
 *   enums, list items, required-ness, required sections, and a template ref — and
 *   nothing else (AC#5). There is no code-registration escape hatch and no
 *   cross-field/custom refinement; the [ADR-0006 §5 summary heuristic](../../docs/adr/0006-schema-types-templates.md)
 *   stays a lore built-in in `validate.ts` precisely because it is not declaratively
 *   expressible.
 * - **Deterministic + injectable.** The repo `root` is an injectable seam
 *   (lore-design §8); compilation reads no clock and no global state, so the same
 *   profile always compiles to the same validators and the same emitted bytes
 *   ([ADR-0014](../../docs/adr/0014-core-has-no-llm-dependency.md)).
 *
 * Profile parsing adds **no dependency**: Bun parses TOML natively (`Bun.TOML.parse`)
 * and shape validation is hand-rolled, exactly as `config.ts` does. A malformed
 * profile is a {@link LoreError} of type `"validation"` (exit 6) — the same diagnostic
 * contract as the rest of lore. `profile.toml` is **separate from `config.toml`**
 * ([ADR-0013](../../docs/adr/0013-lore-state-directory.md)): config carries operational
 * knobs (reconcile/validate/Confluence), the profile carries the type system.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join, posix, win32 } from "node:path";
import { z } from "zod";
import { errnoCode, LoreError } from "../errors";

/** Where the declarative profile lives, relative to the repo root (ADR-0013). `.toml` wins over `.json`. */
export const PROFILE_REL_PATH = ".lore/profile.toml";

/** The JSON form a project may use instead of TOML; identical semantics, lower precedence. */
export const PROFILE_JSON_REL_PATH = ".lore/profile.json";

/**
 * The scalar kinds a field may declare (the grammar's `kind`). Named `kind` — not
 * `type` — to avoid colliding with the OKF `type` frontmatter key. `string` is the
 * default; `datetime` is an ISO-8601 string with offset (never coerced to a `Date`,
 * ADR-0006 §2); `list` is a sequence whose element shape comes from `items`.
 */
export const FIELD_KINDS = ["string", "list", "datetime", "number", "integer", "boolean"] as const;

/** A declared field's scalar/sequence kind. */
export type FieldKind = (typeof FIELD_KINDS)[number];

/** A scalar (non-list) kind — what a list's element may be (no nested lists). */
export type ScalarKind = Exclude<FieldKind, "list">;

/**
 * The casing convention a profile's type names follow. Powers the unknown-type
 * "did you mean" hint and is advisory only — it never coerces an authored `type`
 * value. `Title` is the default (and what both the story convention and ECK use).
 */
export const CASE_STYLES = ["Title", "lower", "UPPER", "kebab", "snake"] as const;

/** A profile's declared casing convention. */
export type CaseStyle = (typeof CASE_STYLES)[number];

/**
 * One declared field's spec — the parsed form of an inline table in `[base.fields]`
 * or a type's `fields`. `{}` (every attribute defaulted) is an optional string field.
 */
export interface FieldSpec {
  /** Whether the field must be present and non-null (default `false`). OKF's only hard requirement is `type`. */
  readonly required: boolean;
  /** The scalar/sequence kind (default `"string"`). */
  readonly kind: FieldKind;
  /** A closed set of allowed string values (implies `kind: "string"`, exact case-sensitive match). */
  readonly enum?: readonly string[];
  /** For a `list`, the element kind/enum (default: string elements; no nested lists). */
  readonly items?: { readonly kind: ScalarKind; readonly enum?: readonly string[] };
  /**
   * Editor-advertised default surfaced in the JSON Schema — **never** stamped onto a concept
   * (byte-stability). Validated at PARSE time ({@link assertDefaultMatchesShape}, LORE-242)
   * against this same spec's `kind`/`enum`/`items` — a `default` that contradicts its own
   * field's declared shape is a load-time `validation` error, not a silently-emitted lie in the
   * editor schema. For a `list` field the whole-list shape is checked (an array whose elements
   * satisfy `items`), not merely "is it an array" — the same {@link baseKindToZod} an element/
   * scalar field's own default is checked against, so list and scalar defaults share one rule.
   */
  readonly default?: unknown;
}

/** A declared type — the parsed form of one `[[types]]` table. */
export interface ParsedType {
  /** The OKF `type` value (canonical spelling). */
  readonly name: string;
  /** Fields ADDED to the base, or a base field OVERRIDDEN by re-declaring its name (full replace). */
  readonly fields: Readonly<Record<string, FieldSpec>>;
  /** Required body section headings (matched by text, depth ≤2, order not enforced — ADR-0007 Tier 2). */
  readonly sections: readonly string[];
  /** The template filename under `.lore/templates/` `lore new` renders for this type. */
  readonly template?: string;
}

/** A fully-parsed-but-uncompiled profile — what {@link compileProfile} turns into a {@link Profile}. */
export interface ParsedProfile {
  readonly name: string;
  readonly okfVersion: string;
  readonly case: CaseStyle;
  readonly resourceBase: string;
  /** Fields every type carries, in declaration order (insertion-ordered object). `type` must be required. */
  readonly baseFields: Readonly<Record<string, FieldSpec>>;
  /** Declared types, in declaration order. */
  readonly types: readonly ParsedType[];
}

/** A compiled type: its generated runtime validator plus the metadata the commands need. */
export interface CompiledType {
  /** The canonical OKF `type` value. */
  readonly name: string;
  /** The LOWER-KEBAB slug — the stem of its schema file and conventional template (`QA Plan` → `qa-plan`). */
  readonly slug: string;
  /** The generated loose Zod object (extra keys pass; warned separately, OKF tolerance). */
  readonly schema: z.ZodType;
  /**
   * The generated Draft-7 JSON Schema for editors (ADR-0006 §3): the **lenient** tier
   * (`required: ["type"]`, open `additionalProperties`) with each field's editor-advertised
   * `default` injected. Derived once at compile, written verbatim to `.lore/schemas/<slug>.schema.json`.
   */
  readonly jsonSchema: Record<string, unknown>;
  /** The required body sections (ADR-0007 Tier 2). */
  readonly requiredSections: readonly string[];
  /** The template filename under `.lore/templates/`, if the type declares one. */
  readonly template?: string;
  /** The field names this type declares (base ∪ own ∪ reserved), for the extra-key warning. */
  readonly declaredFields: ReadonlySet<string>;
  /**
   * Whether `lore new` may auto-stamp a `resource` URL string onto a concept of **this** type
   * (LORE-47 / AC#4). `true` unless the type **owns** a `resource` field whose shape a URL string
   * cannot satisfy — i.e. a declared `resource` field with a non-`string` `kind` (a `datetime`,
   * `number`, … `resource` would reject the stamped URL) or an `enum` (a closed value set a free
   * URL is not in). A type that does **not** declare `resource`, or declares it as a plain
   * (optionally required) string, accepts the stamp. Computed per-type so one type declaring its
   * own `resource` never suppresses stamping for the others (the old global-key-order guard did),
   * and a `resource = { required = true }` string field is **satisfied** by the stamp rather than
   * failing `lore new` with a missing-required error. The single fact {@link import("./template").expectedResource}
   * reads to decide whether to stamp.
   */
  readonly acceptsStampedResource: boolean;
}

/**
 * A compiled, ready-to-use profile: the type vocabulary as runtime validators plus the
 * derived facts the serializer and scaffolder consume. Immutable; build it once
 * ({@link loadProfile}/{@link defaultProfile}) and thread it through the pure core.
 */
export interface Profile {
  /** The profile name (`[profile].name`). */
  readonly name: string;
  /** The OKF version the profile targets, stamped on the bundle-root index. */
  readonly okfVersion: string;
  /** The declared casing convention (advisory; powers the did-you-mean hint). */
  readonly case: CaseStyle;
  /** The base a stamped `resource` value joins to a concept path (empty → no `resource` stamped). */
  readonly resourceBase: string;
  /** Compiled types keyed by canonical `type` value, in declaration order. */
  readonly types: ReadonlyMap<string, CompiledType>;
  /** Canonical `type` value keyed by its lower-cased spelling, for case-insensitive resolution. */
  readonly byLowerName: ReadonlyMap<string, string>;
  /**
   * The canonical frontmatter key emission order: base fields (declaration order) then each type's
   * own fields appended in first-seen order (ADR-0011 append-slot = profile declaration order).
   * `concept.ts` orders known keys by this on serialize; unknown producer keys follow verbatim.
   */
  readonly canonicalKeyOrder: readonly string[];
}

/** Options for {@link loadProfile}; `root` is an injectable seam for determinism in tests. */
export interface LoadProfileOptions {
  /** Repo root containing `.lore/`; defaults to {@link process.cwd}. */
  root?: string;
}

// ── Slug ───────────────────────────────────────────────────────────────────────

/**
 * The LOWER-KEBAB slug for a type name — the stem of its `.lore/schemas/<slug>.schema.json`
 * and its conventional `.lore/templates/<slug>.md` (AC#7). Lower-cased, every run of
 * non-alphanumerics collapsed to a single `-`, edges trimmed: `"QA Plan"` → `"qa-plan"`,
 * `"ADR"` → `"adr"`, `"Reference"` → `"reference"`. For the single-word story-convention
 * types the slug equals the lower-cased name, so their schema filenames are unchanged from
 * before the profile existed. A name with no alphanumeric content yields `""` (rejected at
 * load as an invalid type name), so a slug is never empty and never an invalid path segment.
 */
export function slugForTypeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Load ─────────────────────────────────────────────────────────────────────—

/**
 * Load and compile the active profile under `root` (default cwd). Reads
 * `.lore/profile.toml` (or `.lore/profile.json`, lower precedence) and compiles it to a
 * {@link Profile}; a **missing** — or present-but-empty (every line commented) — profile yields
 * the built-in {@link defaultProfile} (zero-config, AC#3), so the commented file `lore init`
 * scaffolds changes nothing until a team fills it in. Malformed TOML/JSON or an out-of-grammar
 * value throws a {@link LoreError} of type `"validation"` (exit 6).
 */
export function loadProfile(options: LoadProfileOptions = {}): Profile {
  const root = options.root ?? process.cwd();
  // A present-but-empty `.toml` (the commented file `lore init` scaffolds) is NOT a populated
  // profile, so it must not shadow a real `.json` form — fall through to it, exactly as an absent
  // `.toml` would. Only a non-empty profile (either form) is compiled; otherwise the default.
  const tomlText = readProfileText(join(root, PROFILE_REL_PATH), PROFILE_REL_PATH);
  if (tomlText !== undefined) {
    const doc = parseToml(tomlText);
    if (!isEmptyDoc(doc)) {
      return compileProfile(parseProfile(doc, PROFILE_REL_PATH));
    }
  }
  const jsonText = readProfileText(join(root, PROFILE_JSON_REL_PATH), PROFILE_JSON_REL_PATH);
  if (jsonText !== undefined) {
    const doc = parseJson(jsonText);
    if (!isEmptyDoc(doc)) {
      return compileProfile(parseProfile(doc, PROFILE_JSON_REL_PATH));
    }
  }
  return defaultProfile();
}

/**
 * Read a profile file as UTF-8, returning `undefined` for an absent file (`ENOENT` — the
 * zero-config case, no separate `existsSync` so no time-of-check/time-of-use window) and
 * surfacing any other failure with its OS reason. Mirrors `config.ts`'s reader.
 */
function readProfileText(path: string, relPath: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    // ENOENT (no file) and ENOTDIR (a path component — e.g. `.lore` itself — is not a directory)
    // both mean "no profile here": fall back to the default rather than failing the load. A
    // genuinely broken `.lore` directory is surfaced where it belongs (the scaffold/IO layer).
    const code = errnoCode(cause);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return undefined;
    }
    return fail(withReason(`${relPath} could not be read`, cause), `ensure ${relPath} is a readable file`, {
      path: relPath,
    });
  }
}

/** Parse TOML via Bun's native parser, stripping a leading BOM (as `config.ts` does) and surfacing the parser's message. */
function parseToml(raw: string): Record<string, unknown> {
  let text = raw;
  while (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  try {
    return Bun.TOML.parse(text) as Record<string, unknown>;
  } catch (cause) {
    return fail(
      withReason(`${PROFILE_REL_PATH} is not valid TOML`, cause),
      `fix the TOML syntax in ${PROFILE_REL_PATH}`,
      {
        path: PROFILE_REL_PATH,
      },
    );
  }
}

/** True for a parsed doc with no own keys — an empty or all-commented profile file (→ zero-config default). */
function isEmptyDoc(doc: Record<string, unknown>): boolean {
  return Object.keys(doc).length === 0;
}

/** Parse the JSON profile form, surfacing the parser's message on failure. */
function parseJson(raw: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    return fail(
      withReason(`${PROFILE_JSON_REL_PATH} is not valid JSON`, cause),
      `fix the JSON syntax in ${PROFILE_JSON_REL_PATH}`,
      { path: PROFILE_JSON_REL_PATH },
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(`${PROFILE_JSON_REL_PATH} must be a JSON object`, `make ${PROFILE_JSON_REL_PATH} a JSON object`, {
      path: PROFILE_JSON_REL_PATH,
    });
  }
  return value as Record<string, unknown>;
}

// ── Parse (grammar → ParsedProfile) ───────────────────────────────────────────—

/**
 * Project a parsed TOML/JSON document onto a {@link ParsedProfile}, validating the
 * finalized grammar (LORE-46). Load-tier **errors** (throw): a duplicate type name, an
 * `enum` on a non-string kind, a malformed field/type table, a missing required `[profile]`
 * key, a `type` base field that is not `{ required = true }`, or an empty/invalid type name.
 * An **unknown** top-level/`[profile]` key is ignored (forward-compatible; a load warning is
 * a future nicety, not an error). `source` names the file in diagnostics.
 */
export function parseProfile(doc: Record<string, unknown>, source: string): ParsedProfile {
  const profileTable = asTable(doc.profile, "profile", source) ?? {};
  const name = requireString(profileTable.name, "profile.name", source);
  const okfVersion = requireString(profileTable.okf_version, "profile.okf_version", source);
  const caseStyle = asEnum(profileTable.case, "profile.case", CASE_STYLES, source) ?? "Title";
  // Trim at the config boundary so a whitespace-only `resource_base` is treated as unset (no stamp)
  // and a base padded with stray whitespace can never join into an embedded-space (broken) URL.
  const resourceBase = (asString(profileTable.resource_base, "profile.resource_base", source) ?? "").trim();

  const baseTable = asTable(doc.base, "base", source) ?? {};
  const baseFields = parseFieldTable(asTable(baseTable.fields, "base.fields", source) ?? {}, "base.fields", source);
  if (!baseFields.type || baseFields.type.required !== true) {
    fail(
      `${source}: [base.fields] must declare \`type\` as { required = true } (OKF's one hard requirement)`,
      "add `type = { required = true }` under [base.fields]",
      { key: "base.fields.type" },
    );
  }

  const types = parseTypes(doc.types, source);
  if (types.length === 0) {
    // A profile with no types validates nothing — every concept would fall through to the
    // unknown-type warning tier, silently turning `lore validate` green over real defects. The
    // common cause is uncommenting [profile]/[base.fields] but leaving the example [[types]]
    // commented; fail loud so the gate is never accidentally disabled.
    fail(
      `${source}: a profile must declare at least one [[types]]`,
      'add a [[types]] block (name = "…"), or remove the file to use the built-in story-convention profile',
      { key: "types" },
    );
  }
  return { name, okfVersion, case: caseStyle, resourceBase, baseFields, types };
}

/** The keys a `[[types]]` table may declare. */
const TYPE_TABLE_KEYS = ["name", "fields", "sections", "template"] as const;

/** Parse the `[[types]]` array-of-tables into {@link ParsedType}s, rejecting a duplicate type name. */
function parseTypes(value: unknown, source: string): ParsedType[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(`${source}: \`types\` must be an array of tables ([[types]])`, "declare each type with a [[types]] table", {
      key: "types",
    });
  }
  const seen = new Set<string>();
  const seenSlugs = new Set<string>();
  const types: ParsedType[] = [];
  for (let i = 0; i < value.length; i++) {
    const table = asTable(value[i], `types[${i}]`, source);
    if (table === undefined) {
      fail(`${source}: types[${i}] must be a table`, "declare each type with a [[types]] table", {
        key: `types[${i}]`,
      });
    }
    rejectUnknownKeys(table, TYPE_TABLE_KEYS, `types[${i}]`, source);
    const name = requireString(table.name, `types[${i}].name`, source).trim();
    const slug = slugForTypeName(name);
    if (slug === "") {
      fail(
        `${source}: types[${i}].name "${name}" has no slug-able characters`,
        "give the type a name with at least one letter or digit",
        { key: `types[${i}].name` },
      );
    }
    const lower = name.toLowerCase();
    if (seen.has(lower)) {
      fail(`${source}: duplicate type "${name}"`, "each [[types]] name must be unique (case-insensitively)", {
        key: `types[${i}].name`,
      });
    }
    // Two type names that differ but reduce to the same LOWER-KEBAB slug (e.g. "Foo Bar" / "Foo-Bar")
    // would key the SAME `.lore/schemas/<slug>.schema.json` and `.lore/templates/<slug>.md` file, so the
    // second silently overwrites the first on export/scaffold (a count-lying data loss). The slug is the
    // file identity, so it must be unique too — not just the type name. Reject the collision at load.
    if (seenSlugs.has(slug)) {
      fail(
        `${source}: types[${i}].name "${name}" reduces to the schema/template slug "${slug}", already used by another type`,
        "two type names must not share a lower-kebab slug (it names their schema and template files); rename one",
        { key: `types[${i}].name` },
      );
    }
    seen.add(lower);
    seenSlugs.add(slug);
    const fields = parseFieldTable(
      asTable(table.fields, `types[${i}].fields`, source) ?? {},
      `types[${i}].fields`,
      source,
    );
    const sections = asStringArray(table.sections, `types[${i}].sections`, source) ?? [];
    const template = asString(table.template, `types[${i}].template`, source);
    if (template !== undefined) {
      assertTemplateConfined(template, `types[${i}].template`, source);
    }
    types.push(template === undefined ? { name, fields, sections } : { name, fields, sections, template });
  }
  return types;
}

/**
 * The way a template name/path value can fail {@link templateConfinementViolation}'s containment
 * check: an absolute path, or a value that resolves outside `.lore/templates/` via a `..` escape.
 */
export type TemplateConfinementViolation = "absolute" | "escape";

/**
 * The single containment check shared by every place lore resolves a template name/path into a
 * file under `.lore/templates/` — the profile-declared `[[types]].template` value (LORE-139) and
 * `commands/new.ts`'s `--template` CLI flag (LORE-69). Both used to run their own edge-case-
 * divergent copy of this arithmetic (one normalized backslashes and needed no real `root`, the
 * other used the host `resolve()`/`relative()` and did not); LORE-185 consolidates them onto this
 * one pure predicate so the invariant can never again drift between call sites. Left unchecked, a
 * `.lore/profile.toml` type table declaring `template = "../../../secret/leak"` — or a
 * `lore new --template ../../../secret/leak` — would have `lore new` read and embed an arbitrary
 * file's contents into the generated concept, exit `0`, no error.
 *
 * Absolute paths are rejected on the host `isAbsolute` AND both `posix.isAbsolute`/
 * `win32.isAbsolute` explicitly: lore ships as a compiled binary for both POSIX and win32 from the
 * same source, so a Windows drive-letter path must be caught even when this runs on a POSIX host
 * (it is otherwise inert syntax there), and a POSIX-style absolute path must be caught even when
 * this runs on the win32 binary. A `..`-segment escape is then caught by resolving the value
 * (backslash segments normalized to `/` first, so a Windows-style `..\..\secret` traversal is
 * caught even when parsed on a POSIX host — the cross-host drift LORE-69's own host-`resolve()`
 * implementation had) against a fixed anchor and confirming the result stays inside it — no real
 * `root` is needed: the check is pure path arithmetic, identical however the anchor is spelled, so
 * it holds regardless of where the caller's templates directory is ultimately loaded from.
 *
 * Returns the violation kind rather than throwing, so each call site can raise its own typed
 * error: a profile-declared value is a `validation` {@link LoreError} at profile PARSE time
 * (repo config, wrong exit code for a CLI mistake), while a `--template` flag value is a `usage`
 * error (a user-typed CLI argument) — those exit codes are part of each command's own observable
 * contract and must not collapse into one just because the underlying arithmetic is now shared.
 */
export function templateConfinementViolation(value: string): TemplateConfinementViolation | undefined {
  if (isAbsolute(value) || posix.isAbsolute(value) || win32.isAbsolute(value)) {
    return "absolute";
  }
  const anchor = "/.lore/templates";
  const resolved = posix.resolve(anchor, value.replace(/\\/g, "/"));
  const rel = posix.relative(anchor, resolved);
  return rel === ".." || rel.startsWith("../") ? "escape" : undefined;
}

/**
 * Reject a `[[types]].template` value that could escape `.lore/templates/` once `commands/new.ts`
 * joins it into a file path (LORE-139), via the shared {@link templateConfinementViolation}
 * predicate. Checked here, at profile PARSE time, so every current and future consumer of a
 * compiled type's `template` is protected, not just `resolveTemplate`'s one call site.
 */
function assertTemplateConfined(value: string, key: string, source: string): void {
  const violation = templateConfinementViolation(value);
  if (violation === "absolute") {
    fail(`${source}: ${key} "${value}" must not be an absolute path`, `declare a bare template name for ${key}`, {
      key,
    });
  } else if (violation === "escape") {
    fail(
      `${source}: ${key} "${value}" must not escape .lore/templates/`,
      `declare a bare template name for ${key}, without any ".." segment`,
      { key },
    );
  }
}

/**
 * True for a field name that cannot be a plain-object key without being dropped or shadowing an
 * inherited member — every `Object.prototype` member (`__proto__`, `constructor`, `toString`, …)
 * plus `prototype`. The same guard `config.ts` applies to untrusted `[reconcile.overrides]` keys;
 * field specs are built the same way (bracket assignment from untrusted TOML keys), so a field
 * literally named `__proto__` would otherwise hit the prototype setter and silently vanish — a
 * required field that never enters the generated Zod object, so concepts missing it validate clean.
 */
function isUnsafeFieldName(name: string): boolean {
  return name === "prototype" || name in Object.prototype;
}

/** Parse a `fields` table (`name -> inline-table spec`) into {@link FieldSpec}s, preserving declaration order. */
function parseFieldTable(table: Record<string, unknown>, where: string, source: string): Record<string, FieldSpec> {
  const fields: Record<string, FieldSpec> = {};
  for (const [fieldName, raw] of Object.entries(table)) {
    if (isUnsafeFieldName(fieldName)) {
      fail(
        `${source}: ${where}.${fieldName} uses a reserved object key`,
        `rename the "${fieldName}" field to a real frontmatter key name`,
        { key: `${where}.${fieldName}` },
      );
    }
    fields[fieldName] = parseFieldSpec(raw, `${where}.${fieldName}`, source);
  }
  return fields;
}

/** The attribute keys a field spec inline table (`{ required = ..., kind = ..., ... }`) may declare. */
const FIELD_SPEC_KEYS = ["required", "kind", "enum", "items", "default"] as const;

/** Parse one inline-table field spec, defaulting and cross-checking its attributes. */
function parseFieldSpec(raw: unknown, where: string, source: string): FieldSpec {
  const table = asTable(raw, where, source);
  if (table === undefined) {
    fail(`${source}: ${where} must be an inline table`, `write ${where} as an inline table, e.g. { required = true }`, {
      key: where,
    });
  }
  rejectUnknownKeys(table, FIELD_SPEC_KEYS, where, source);
  const required = asBoolean(table.required, `${where}.required`, source) ?? false;
  const enumValues = asStringArray(table.enum, `${where}.enum`, source);
  assertNonEmptyEnum(enumValues, where, source);
  const declaredKind = asEnum(table.kind, `${where}.kind`, FIELD_KINDS, source);
  if (enumValues !== undefined && declaredKind !== undefined && declaredKind !== "string") {
    fail(
      `${source}: ${where} has an enum but kind "${declaredKind}" — enum implies kind "string"`,
      `drop the kind, or set kind = "string"`,
      { key: where },
    );
  }
  const kind: FieldKind = enumValues !== undefined ? "string" : (declaredKind ?? "string");
  const spec: {
    required: boolean;
    kind: FieldKind;
    enum?: readonly string[];
    items?: FieldSpec["items"];
    default?: unknown;
  } = { required, kind };
  if (enumValues !== undefined) {
    spec.enum = enumValues;
  }
  if (kind === "list") {
    spec.items = parseItems(table.items, `${where}.items`, source);
  }
  if ("default" in table) {
    assertDefaultMatchesShape(spec as FieldSpec, table.default, where, source);
    spec.default = table.default;
  }
  return spec;
}

/**
 * Reject an `enum` attribute that parsed to a zero-length array (LORE-140), shared by both
 * {@link parseFieldSpec} (a scalar field's own `enum`) and {@link parseItems} (a list field's
 * `items.enum`, LORE-193) — `baseKindToZod`/`itemToZod` pass the value straight to
 * `z.enum([...enumValues])`; Zod's `z.enum([])` rejects every possible value, so `enum = []`
 * would otherwise compile cleanly here and only surface later as a field or list element
 * (required or not) that can never validate, with no error pointing at the actual mistake.
 * Checked at parse time, right where `where` still names the offending field, so the error
 * lands where the author can fix it instead of at some unrelated concept's validation failure.
 */
function assertNonEmptyEnum(enumValues: readonly string[] | undefined, where: string, source: string): void {
  if (enumValues !== undefined && enumValues.length === 0) {
    fail(
      `${source}: ${where}.enum must not be empty`,
      `declare at least one allowed value for ${where}.enum, or remove the enum attribute`,
      { key: `${where}.enum` },
    );
  }
}

/**
 * Reject a `default` attribute whose value contradicts the field's own declared `kind`/`enum`/
 * `items` shape (LORE-242) — same class of author-mistake cross-check as
 * {@link assertNonEmptyEnum}, the enum-implies-kind-"string" check, and
 * {@link assertTemplateConfined}, each raising a `validation` {@link LoreError} that names the
 * offending field. Without this, `{ kind = "integer", default = "x" }` or
 * `{ enum = ["red","green"], default = "purple" }` loaded clean and `buildJsonSchema` emitted the
 * bad `default` verbatim into the editor-facing JSON Schema — an internally-inconsistent schema
 * that misleads autocompletion.
 *
 * Judges the default with {@link baseKindToZod} — the SAME kind→Zod predicates
 * {@link buildJsonSchema}'s emitted `type`/`enum`/`items` ultimately derive from (via
 * `z.toJSONSchema`) — rather than a second, hand-rolled kind→JS-type mapping that could drift
 * from it. This one call also covers AC#4 for free: `baseKindToZod` returns `z.array(itemToZod(…))`
 * for a `kind: "list"` field, so a list's `default` is validated as a WHOLE LIST (every element
 * checked against `items`), not merely checked for being an array.
 */
function assertDefaultMatchesShape(spec: FieldSpec, defaultValue: unknown, where: string, source: string): void {
  const result = baseKindToZod(spec).safeParse(defaultValue);
  if (!result.success) {
    const shape = spec.enum !== undefined ? "enum" : spec.kind;
    fail(
      `${source}: ${where}.default (${JSON.stringify(defaultValue)}) does not match its declared ${shape}`,
      `set ${where}.default to a value valid for its ${shape}, or remove the default attribute`,
      { key: `${where}.default` },
    );
  }
}

/** The attribute keys a list field's `items` inline table (`{ kind = ..., enum = ... }`) may declare. */
const ITEMS_TABLE_KEYS = ["kind", "enum"] as const;

/** Parse a list field's `items` element spec (default: string elements). Only `kind`/`enum` apply to an element. */
function parseItems(raw: unknown, where: string, source: string): { kind: ScalarKind; enum?: readonly string[] } {
  if (raw === undefined) {
    return { kind: "string" };
  }
  const table = asTable(raw, where, source);
  if (table === undefined) {
    fail(`${source}: ${where} must be an inline table`, `write ${where} as an inline table, e.g. { kind = "string" }`, {
      key: where,
    });
  }
  rejectUnknownKeys(table, ITEMS_TABLE_KEYS, where, source);
  const enumValues = asStringArray(table.enum, `${where}.enum`, source);
  assertNonEmptyEnum(enumValues, where, source);
  const kind =
    enumValues !== undefined ? "string" : (asEnum(table.kind, `${where}.kind`, FIELD_KINDS, source) ?? "string");
  if (kind === "list") {
    fail(`${source}: ${where}.kind cannot be "list" (no nested lists)`, "use a scalar element kind", { key: where });
  }
  return enumValues !== undefined ? { kind: "string", enum: enumValues } : { kind };
}

// ── Compile (ParsedProfile → Profile) ─────────────────────────────────────────—

/**
 * Compile a {@link ParsedProfile} into a ready-to-use {@link Profile}: generate each type's
 * loose Zod validator, compute the LOWER-KEBAB slugs, and derive the canonical key order
 * (base fields then each type's own fields, first-seen). Pure and deterministic.
 */
export function compileProfile(parsed: ParsedProfile): Profile {
  // Each type's field order is: the declarative `[base.fields]` (declaration order), then that
  // type's own new fields, then lore's reserved coupling fields (see RESERVED_FIELDS) LAST. The
  // coupling fields carry a built-in validator (their `string | list-of-refs` shape is not
  // declaratively expressible — AC#5), so they live here, like the §5 summary heuristic; emitting
  // them last keeps the canonical key order — and thus concept serialization — byte-stable against
  // what lore emitted before the profile existed (ADR-0011). A profile may still override one by
  // declaring it in `[base.fields]`, in which case it keeps its declared position.
  const declaredBase = Object.keys(parsed.baseFields);
  const reservedBase = RESERVED_FIELD_NAMES.filter((name) => !(name in parsed.baseFields));

  const types = new Map<string, CompiledType>();
  const byLowerName = new Map<string, string>();
  const canonicalKeyOrder: string[] = [...declaredBase];
  const seenKeys = new Set<string>([...declaredBase, ...reservedBase]);

  for (const type of parsed.types) {
    // Merge base ∪ own (own overrides a base/reserved field by name = full replace); collect the
    // type's genuinely-new fields (neither base nor reserved) in declaration order.
    const merged: Record<string, FieldSpec> = { ...parsed.baseFields };
    const ownNew: string[] = [];
    for (const [fieldName, spec] of Object.entries(type.fields)) {
      merged[fieldName] = spec;
      if (!declaredBase.includes(fieldName) && !reservedBase.includes(fieldName)) {
        ownNew.push(fieldName);
        if (!seenKeys.has(fieldName)) {
          canonicalKeyOrder.push(fieldName);
          seenKeys.add(fieldName);
        }
      }
    }
    const fieldOrder = [...declaredBase, ...ownNew, ...reservedBase];
    const schema = buildTypeSchema(type.name, merged, fieldOrder);
    const compiled: CompiledType = {
      name: type.name,
      slug: slugForTypeName(type.name),
      schema,
      jsonSchema: buildJsonSchema(schema, merged, fieldOrder),
      requiredSections: type.sections,
      declaredFields: new Set(fieldOrder),
      acceptsStampedResource: acceptsStampedResource(merged.resource),
      ...(type.template === undefined ? {} : { template: type.template }),
    };
    types.set(type.name, compiled);
    byLowerName.set(type.name.toLowerCase(), type.name);
  }
  // Reserved coupling fields trail every authored/known key in the global canonical order.
  canonicalKeyOrder.push(...reservedBase);

  return {
    name: parsed.name,
    okfVersion: parsed.okfVersion,
    case: parsed.case,
    resourceBase: parsed.resourceBase,
    types,
    byLowerName,
    canonicalKeyOrder,
  };
}

/**
 * lore's reserved coupling fields, present on every type: the supersession links `lore supersede`
 * writes. Their shape is **`string | list-of-strings`** (a concept may supersede one or several) —
 * a union the declarative `kind` grammar cannot express — so they carry a built-in validator here
 * (AC#5 expressiveness limit), exactly as the ADR-0006 §5 summary heuristic stays a lore built-in.
 * A profile may still override one by declaring a field of the same name in `[base.fields]`.
 */
const RESERVED_FIELDS: Readonly<Record<string, () => z.ZodType>> = Object.freeze({
  supersedes: () => conceptRefs(),
  superseded_by: () => conceptRefs(),
});

/** The reserved field names, appended to the base set in this fixed order when not re-declared. */
const RESERVED_FIELD_NAMES = Object.keys(RESERVED_FIELDS);

/** A concept reference or a list of them (the `supersedes`/`superseded_by` shape), accepting absent and null. */
function conceptRefs(): z.ZodType {
  return z.union([z.string(), z.array(z.string())]).nullish();
}

/**
 * Whether an auto-stamped `resource` URL string is valid for a type owning the given `resource`
 * field spec ({@link CompiledType.acceptsStampedResource}). `undefined` (the type declares no
 * `resource` field) → `true`: lore stamps a recognized reserved key. A declared field accepts the
 * stamp only when it is a plain `string` with no `enum` — a free URL satisfies a (required or
 * optional) string field, but never a `datetime`/`number`/`list` field or a closed `enum`.
 */
function acceptsStampedResource(spec: FieldSpec | undefined): boolean {
  return spec === undefined || (spec.kind === "string" && spec.enum === undefined);
}

/**
 * Build a type's loose Zod object from its merged fields, emitting properties in `fieldOrder`
 * so the generated JSON Schema's property order is stable and declaration-driven. `type` is
 * always a `z.literal(name)` (the OKF floor). A reserved coupling field with no declared spec
 * uses its built-in {@link RESERVED_FIELDS} validator; everything else comes from {@link fieldToZod}.
 * Loose (not strict) so extra keys pass — the extra-key warning is computed separately, preserving
 * OKF producer-extension tolerance.
 */
function buildTypeSchema(name: string, merged: Record<string, FieldSpec>, fieldOrder: readonly string[]): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const fieldName of fieldOrder) {
    const reserved = RESERVED_FIELDS[fieldName];
    if (fieldName === "type") {
      shape[fieldName] = z.literal(name);
    } else if (merged[fieldName] !== undefined) {
      shape[fieldName] = fieldToZod(merged[fieldName] as FieldSpec);
    } else if (reserved !== undefined) {
      shape[fieldName] = reserved();
    }
  }
  return z.looseObject(shape);
}

/**
 * Emit a type's Draft-7 JSON Schema from its generated Zod object (the **lenient** editor tier:
 * `required: ["type"]`, open `additionalProperties`), then inject each field's editor-advertised
 * `default`. The default is added only to the JSON Schema — never to the runtime Zod — so an
 * editor offers it while a written concept stays byte-stable (it is never stamped). Property order
 * follows the Zod object's field order, so the emitted bytes are deterministic (ADR-0014).
 */
function buildJsonSchema(
  schema: z.ZodType,
  merged: Record<string, FieldSpec>,
  fieldOrder: readonly string[],
): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  const properties = json.properties as Record<string, Record<string, unknown>> | undefined;
  if (properties !== undefined) {
    for (const fieldName of fieldOrder) {
      const spec = merged[fieldName];
      if (spec?.default !== undefined && properties[fieldName] !== undefined) {
        properties[fieldName] = { ...properties[fieldName], default: spec.default };
      }
    }
  }
  return json;
}

/**
 * Translate one {@link FieldSpec} to a Zod schema. An optional field is `.nullish()` (accepts
 * both absent and a YAML `key:` null — an OKF-tolerated cleared value, never promoted to an
 * error); a required field must be present and non-null. `datetime` is an ISO-8601 string with
 * offset, never a `Date` (ADR-0006 §2). The editor-advertised `default` is **not** applied here
 * — `.default()` would coerce on parse and break byte-stability — it is surfaced only in the
 * emitted JSON Schema (`schema.ts`).
 */
function fieldToZod(spec: FieldSpec): z.ZodType {
  const base = baseKindToZod(spec);
  return spec.required ? base : base.nullish();
}

/** The Zod schema for a field's kind/enum (without the optional/required wrapper). */
function baseKindToZod(spec: FieldSpec): z.ZodType {
  if (spec.enum !== undefined) {
    return z.enum([...spec.enum]);
  }
  return spec.kind === "list" ? z.array(itemToZod(spec.items)) : scalarKindToZod(spec.kind);
}

/** The Zod element schema for a list's `items` spec (default: string elements). */
function itemToZod(items: FieldSpec["items"]): z.ZodType {
  if (items === undefined) {
    return z.string();
  }
  return items.enum !== undefined ? z.enum([...items.enum]) : scalarKindToZod(items.kind);
}

/**
 * The Zod schema for a scalar (non-list) kind — the single source shared by {@link baseKindToZod}
 * and {@link itemToZod} so a field and a list element of the same kind can never diverge. `list`
 * is never passed here (a field's list wraps this for its element; nested lists are rejected at
 * parse). `datetime` is an ISO-8601 string with offset, never a `Date` (ADR-0006 §2).
 */
function scalarKindToZod(kind: Exclude<FieldKind, "list">): z.ZodType {
  switch (kind) {
    case "datetime":
      return z.iso.datetime({ offset: true });
    case "number":
      return z.number();
    case "integer":
      return z.int();
    case "boolean":
      return z.boolean();
    default:
      return z.string();
  }
}

// ── The built-in story-convention profile (zero-config default) ────────────────—

/**
 * An optional string field (`{}`): the common case. Helper so the default profile reads as data.
 */
const optionalString: FieldSpec = { required: false, kind: "string" };
/** An optional list-of-strings field (`{ kind = "list" }`). */
const optionalStringList: FieldSpec = { required: false, kind: "list", items: { kind: "string" } };

/**
 * The built-in **story-convention** profile (AC#3): the six types lore shipped before the
 * profile existed, re-expressed as data and run through the same {@link compileProfile} as a
 * loaded profile (so the default is exercised by the real path). Its generated validators are
 * byte-compatible with the old hand-authored Zod, with one documented narrowing: `supersedes` /
 * `superseded_by` are `list` rather than the old `string | list` union, which the declarative
 * `kind` grammar cannot express (AC#5 expressiveness limit) — invisible to every existing
 * concept (none use these lifecycle keys yet). The ADR-0006 §5 summary heuristic is NOT here;
 * it stays a lore built-in in `validate.ts` for the same reason.
 */
function storyConventionProfile(): ParsedProfile {
  return {
    name: "story-convention",
    okfVersion: "0.1",
    case: "Title",
    resourceBase: "",
    baseFields: {
      type: { required: true, kind: "string" },
      title: optionalString,
      description: optionalString,
      tags: optionalStringList,
      summary: optionalString,
      timestamp: { required: false, kind: "datetime" },
      status: optionalString,
      // supersedes / superseded_by are reserved coupling fields (RESERVED_FIELDS): their
      // `string | list` union is added by the compiler, not declared here.
    },
    // The story-convention types declare NO `template`: their bodies come from the built-in
    // code templates (template.ts BUILTIN_TEMPLATES via builtinTemplateFor), not from a file
    // under .lore/templates/. A declared `template` is for a custom profile that ships its own
    // template files; setting one here would force `lore new`'s lookup to a lowercased filename
    // and stop honoring a canonical-case `Reference.md` on a case-sensitive filesystem.
    types: [
      { name: "Epic", fields: {}, sections: [] },
      {
        name: "Story",
        fields: { tasks: optionalStringList, specs: optionalStringList },
        sections: ["Acceptance criteria"],
      },
      { name: "Spec", fields: {}, sections: [] },
      { name: "ADR", fields: {}, sections: ["Status", "Context", "Decision", "Consequences"] },
      { name: "Runbook", fields: {}, sections: [] },
      { name: "Reference", fields: {}, sections: [] },
    ],
  };
}

/** Memoized compiled default — building its Zod schemas once, since the serializer reaches for it on every concept. */
let DEFAULT_PROFILE: Profile | undefined;

/**
 * The built-in story-convention {@link Profile} {@link loadProfile} returns when no
 * `.lore/profile.toml` exists. Compiled once and cached: it is pure and immutable, and the
 * concept serializer/validator default to it on every call, so rebuilding its Zod schemas each
 * time would be wasted work. This is a deterministic constant, not mutable global state.
 */
export function defaultProfile(): Profile {
  DEFAULT_PROFILE ??= compileProfile(storyConventionProfile());
  return DEFAULT_PROFILE;
}

// ── Validators (mirroring config.ts's hand-rolled shape checks) ────────────────—

/** Throw a `"validation"` {@link LoreError}; typed `never` so callers can `return fail(...)`. */
function fail(message: string, hint: string, input: Record<string, unknown>): never {
  throw new LoreError("validation", message, hint, input);
}

/** Append `: <reason>` from a thrown cause when one can be derived (single-lined). */
function withReason(base: string, cause: unknown): string {
  const reason =
    cause !== null && typeof cause === "object" && typeof (cause as { message?: unknown }).message === "string"
      ? (cause as { message: string }).message.replace(/\s*[\r\n]+\s*/g, " ").trim()
      : "";
  return reason ? `${base}: ${reason}` : base;
}

/**
 * Fail when `table` carries a key outside `allowed` — the closed-vocabulary gate for a field
 * spec, a `[[types]]` table, or an `items` table (LORE-83). Unlike the top-level/`[profile]`
 * table (documented forward-compatible tolerance, {@link parseProfile}'s own docstring), these
 * nested tables have a small, fixed attribute set with no forward-compat need — so a typo
 * (`require` for `required`) is a `validation` error rather than a silently-ignored no-op that
 * leaves the intended attribute at its default (every concept then validating clean despite
 * missing a field the author believed was required).
 */
function rejectUnknownKeys(
  table: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
  source: string,
): void {
  const unknown = Object.keys(table).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    fail(
      `${source}: ${where} has unrecognized key${unknown.length === 1 ? "" : "s"} ${unknown.map((k) => `"${k}"`).join(", ")}`,
      `${where} only accepts: ${allowed.join(", ")} — fix the typo or remove the key`,
      { key: where, unknown },
    );
  }
}

/** Require a table (plain object) when present; `undefined` passes through for "absent". */
function asTable(value: unknown, name: string, source: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${source}: ${name} must be a table`, `make ${name} a table`, { key: name });
  }
  return value as Record<string, unknown>;
}

/** Require a string value present and non-empty. */
function requireString(value: unknown, key: string, source: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${source}: ${key} must be a non-empty string`, `set ${key} to a string`, { key });
  }
  return value;
}

/** Require a string when present. */
function asString(value: unknown, key: string, source: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    fail(`${source}: ${key} must be a string`, `quote ${key} as a string`, { key });
  }
  return value;
}

/** Require a boolean when present. */
function asBoolean(value: unknown, key: string, source: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    fail(`${source}: ${key} must be a boolean`, `set ${key} to true or false`, { key });
  }
  return value;
}

/** Require one of `allowed` when present. */
function asEnum<T extends string>(value: unknown, key: string, allowed: readonly T[], source: string): T | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(
      `${source}: ${key} must be one of ${allowed.map((a) => `"${a}"`).join(", ")}`,
      `set ${key} to one of: ${allowed.join(", ")}`,
      {
        key,
      },
    );
  }
  return value as T;
}

/** Require an array of strings when present. */
function asStringArray(value: unknown, key: string, source: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    fail(`${source}: ${key} must be an array of strings`, `write ${key} as a list of strings`, { key });
  }
  return value as string[];
}
