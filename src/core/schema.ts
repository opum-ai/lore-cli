/**
 * schema.ts — validate concept frontmatter against the **active profile**.
 *
 * Per [ADR-0006](../../docs/adr/0006-schema-types-templates.md) (inverted by LORE-46),
 * the type vocabulary is no longer hand-authored Zod here: it is **data**, loaded and
 * compiled by [profile.ts](./profile.ts) into a {@link Profile} whose per-type Zod
 * validators and editor JSON Schemas are *generated* from a declarative
 * `.lore/profile.toml`. This module is the **consumer** of that compiled profile: it runs
 * the per-type validator, classifies findings into OKF's tiers, and owns the editor
 * schema-file naming + modeline conventions. With no profile passed, every function
 * defaults to the built-in story-convention {@link defaultProfile} — so a caller that
 * does not opt into a custom profile sees exactly the behavior lore shipped before the
 * profile existed.
 *
 * The validation tiers mirror OKF §9 + the active profile
 * ([okf-conformance](../../docs/reference/okf-conformance.md) "How lore checks conformance"):
 *
 * - **ERROR** (throws a `validation` {@link LoreError}, exit 6): unparseable frontmatter
 *   (handled upstream in concept.ts), a missing/empty `type`, or a *known* field carrying
 *   the wrong type (e.g. `tags` that is not a list).
 * - **WARNING** (recorded on a {@link WarningCollector}, never fatal): an unknown `type`
 *   (validated on `type` alone), an extra key on a *known* type, or a missing/over-long
 *   `summary`.
 *
 * Two deliberate departures from a naive reading of ADR-0006 are preserved by the
 * generated profile (see [profile.ts](./profile.ts)): known schemas are **loose** (extra
 * keys pass validation and are warned separately, preserving OKF tolerance), and
 * validation **never rewrites** the data — {@link validateFrontmatter} only inspects the
 * frontmatter and returns the resolved `type`, so byte-stable round-tripping
 * ([ADR-0011](../../docs/adr/0011-frontmatter-serialization-stability.md)) is never
 * compromised by coercion, key-stripping, or reordering. Dates stay **ISO strings**, never
 * coerced to `Date` (ADR-0006 §2).
 */

import { posix } from "node:path";
import { z } from "zod";
import { LoreError, type WarningCollector } from "../errors";
import type { BundleState } from "./okf-version";
import { type CompiledType, defaultProfile, type Profile, profileForBundle, slugForTypeName } from "./profile";

/**
 * The bundle-root index's path, in the two conventions a caller of {@link validateFrontmatter} may
 * pass for the identical physical file: **bundle-root-relative** (`"index.md"` — every
 * {@link import("./bundle").loadBundle}-backed command (`sync`/`query`/`graph`/`link`/…) reaches
 * this module through {@link import("./concept").parseConcept}/`tryParseConcept`, fed
 * bundle-root-relative paths by `loadBundle`'s own walk) and **repo-relative**
 * (`"docs/index.md"` — `core/validate.ts`'s `validateConceptText` threads this form instead; see
 * its own `ROOT_INDEX_PATH`, LORE-144). Both name the one file `lore init` ever stamps
 * `okf_version` onto, so both must be recognized as "the root" here. This module cannot import
 * `scaffold.ts`'s `ROOT_INDEX_PATH` directly — `scaffold.ts` already imports from this module, and
 * doing so would be a circular import — so the two literal spellings are pinned locally instead.
 */
const ROOT_INDEX_PATHS: ReadonlySet<string> = new Set(["index.md", "docs/index.md"]);

/** Whether `path` names the bundle-root index, under either convention {@link ROOT_INDEX_PATHS} pins. */
function isRootIndexPath(path: string | undefined): boolean {
  return path !== undefined && ROOT_INDEX_PATHS.has(path);
}

/**
 * Whether `key` is an OKF-reserved key that passes the extra-key warning on a known type.
 * `resource`, root-only `okf_version`, and 0.2-only `generated` are lore-recognized fields, not stray producer
 * extensions — so flagging either as unknown (as the generic extra-key check otherwise would)
 * would be a false positive on lore's own conformant output, but each is reserved only in the
 * ONE position lore itself ever writes it:
 *
 * - `resource` is the OKF-recommended canonical link `lore new` stamps from the profile's
 *   `resource_base` (LORE-47) onto an ordinary concept. **Index files are the exception**: lore
 *   never stamps `resource` on an `index.md` (it is a structure page, not a cited concept —
 *   LORE-47 AC#4/#5), so a `resource:` hand-authored onto one (`isIndex`) is not lore's
 *   recognized output and is warned like any other extra key.
 * - `okf_version` is the bundle-root index's conformance marker (OKF §4) — a whole-bundle
 *   conformance property, not a per-concept one. Only the bundle-ROOT index
 *   ({@link isRootIndexPath}) — the one file `lore init`'s `serializeStructuralConcept` ever
 *   stamps it onto — is exempt. A hand-authored `okf_version` anywhere else (an ordinary
 *   concept, or a *sub*-index like `docs/adr/index.md`) is not lore's own output and is warned
 *   like any other extra key (LORE-168; previously this was unconditionally exempt everywhere,
 *   contradicting the conformance check `docs/reference/okf-conformance.md` documents).
 */
function isReservedKey(key: string, isIndex: boolean, isRootIndex: boolean, profile: Profile): boolean {
  if (key === "resource") {
    return !isIndex;
  }
  if (key === "okf_version") {
    return isRootIndex;
  }
  if (key === "generated" || key === "sources" || key === "usage_window") {
    return profile.okfVersion === "0.2";
  }
  return false;
}

/** OKF 0.2's generated provenance mapping; JSON_SCHEMA keeps `at` a string before this check. */
const GENERATED_SCHEMA = z.looseObject({
  by: z.string().trim().min(1),
  at: z.iso.datetime({ offset: true }).nullish(),
});

/** The editor form is derived from the same runtime schema, never hand-maintained in parallel. */
const GENERATED_JSON_SCHEMA = z.toJSONSchema(GENERATED_SCHEMA, { target: "draft-7" });

/** OKF 0.2's shared/per-source usage window. Dates remain authored YYYY-MM-DD strings. */
const USAGE_WINDOW_SCHEMA = z.looseObject({
  from: z.iso.date(),
  to: z.iso.date(),
});

/** One OKF 0.2 provenance source. Unknown producer extensions remain round-trip-safe. */
const SOURCE_SCHEMA = z.looseObject({
  resource: z.string().trim().min(1),
  id: z.string().trim().min(1).nullish(),
  title: z.string().trim().min(1).nullish(),
  author: z.string().trim().min(1).nullish(),
  usage_count: z.number().int().nonnegative().nullish(),
  last_modified: z.iso.date().nullish(),
  usage_window: USAGE_WINDOW_SCHEMA.nullish(),
});

/** The complete OKF 0.2 sources family, derived once for runtime and editor use. */
const SOURCES_SCHEMA = z.array(SOURCE_SCHEMA);
const SOURCES_JSON_SCHEMA = z.toJSONSchema(SOURCES_SCHEMA, { target: "draft-7" });
const USAGE_WINDOW_JSON_SCHEMA = z.toJSONSchema(USAGE_WINDOW_SCHEMA, { target: "draft-7" });

/** The longest a `summary` should be before lore warns it is no longer a one-liner (ADR-0006 §5). */
const SUMMARY_SOFT_LIMIT = 200;

/** Options for {@link validateFrontmatter}. */
export interface ValidateOptions {
  /** Sink for advisory warnings (unknown type, extra keys, summary). Absent → warnings are dropped. */
  warnings?: WarningCollector;
  /** The concept's repo-relative path, woven into diagnostics so a finding names its file. */
  path?: string;
  /** The active profile to validate against; defaults to the built-in {@link defaultProfile}. */
  profile?: Profile;
  /** Typed bundle semantics resolved from the root index; absent only for isolated concept APIs. */
  bundleState?: BundleState;
}

/** Narrow an arbitrary string to a type the `profile` (default: built-in) validates strictly-by-field. */
export function isKnownType(type: string, profile: Profile = defaultProfile()): boolean {
  return profile.types.has(type);
}

/**
 * Resolve a user-supplied `<type>` token to its canonical spelling in `profile`. `lore new`
 * accepts a type case-insensitively (`story`, `ADR`, `reference`), so a token whose lower-case
 * form names a profile type returns that type's canonical casing (`Story`, `ADR`, `Reference`) —
 * the value lore writes to `type:` and keys its schema by. An **unknown** type is a tolerated OKF
 * producer extension: it is returned **trimmed but otherwise verbatim** (the author's own casing
 * preserved), never folded or rejected.
 */
export function canonicalType(input: string, profile: Profile = defaultProfile()): string {
  const trimmed = input.trim();
  return profile.byLowerName.get(trimmed.toLowerCase()) ?? trimmed;
}

/**
 * The **required body sections** (`##` headings) a concept of `type` must carry under `profile` —
 * the per-type tier-2 section contract `lore validate` enforces as an **error** (ADR-0007). An
 * unknown (producer-extension) type yields `[]` (OKF tolerance: lore never imposes a section shape
 * on a type it does not own). The single source the validator reads.
 */
export function requiredSectionsFor(type: string, profile: Profile = defaultProfile()): readonly string[] {
  return profile.types.get(type)?.requiredSections ?? [];
}

/**
 * The bundle sub-directory each story-convention type's concepts conventionally live under,
 * relative to the bundle root (`docs/`). These plural/acronym directory names are **not derivable**
 * from the type by any single rule (the bundle uses the acronym `adr`, the singular `reference`, and
 * the plurals `runbooks`/`specs`), so they are a lore built-in convenience map — independent of the
 * profile, which (by its finalized grammar) carries no per-type directory. A type outside this map
 * (a producer extension, or a custom-profile type) falls back to its LOWER-KEBAB slug.
 */
const TYPE_DIRECTORIES: Readonly<Record<string, string>> = Object.freeze({
  Epic: "epics",
  Story: "stories",
  Spec: "specs",
  ADR: "adr",
  Runbook: "runbooks",
  Reference: "reference",
});

/**
 * The bundle sub-directory a concept of `type` is scaffolded into: the {@link TYPE_DIRECTORIES}
 * convention for a story-convention type, else the type's {@link slugForTypeName LOWER-KEBAB slug}
 * (so `lore new "QA Plan" …` lands under `docs/qa-plan/`, never `docs/qa plan/`). Using the slug —
 * not a bare lower-case — keeps a multi-word/space-containing profile type from yielding an invalid
 * path segment. Returns a path segment relative to the bundle root, never including `docs/` itself.
 * A caller may always override the computed path (`lore new … --out`).
 */
export function typeDirectory(type: string): string {
  return TYPE_DIRECTORIES[type] ?? slugForTypeName(type);
}

/**
 * Validate a frontmatter object against `options.profile` (default: built-in), **throwing** on an
 * error-tier problem and **recording** warning-tier ones on `options.warnings`. It never mutates
 * `fm` — the caller keeps the verbatim object so byte-stable round-tripping is preserved (ADR-0011).
 * It **returns the resolved type** (the `type` value, trimmed). Behavior by tier:
 *
 * - Missing/empty `type` → throw (`validation`). This is the OKF §9 floor.
 * - Unknown `type` → warn; the type-only floor already passed, so nothing else is checked and
 *   every key is preserved (OKF tolerance).
 * - Known `type` with a mistyped field → throw (`validation`) citing the field(s). A `type`
 *   carrying surrounding whitespace, or spelled in a different casing than the profile's
 *   canonical form (`story` for `Story`), classifies via {@link canonicalType} — so it is
 *   looked up and validated against that type's *real* schema — and then fails the schema's
 *   `type` literal check loudly here, rather than being silently demoted to an unvalidated
 *   unknown type. Only the lookup key is folded; `fm` itself is never rewritten (ADR-0011).
 * - Known `type` with extra keys → one warning per extra key.
 * - Missing or over-long (~{@link SUMMARY_SOFT_LIMIT}-char) `summary` → warn.
 */
export function validateFrontmatter(fm: Record<string, unknown>, options: ValidateOptions = {}): string {
  const baseProfile = options.profile ?? defaultProfile();
  const profile = options.bundleState === undefined ? baseProfile : profileForBundle(baseProfile, options.bundleState);
  const where = options.path ? ` in ${options.path}` : "";
  const type = requireType(fm, where, options.path);

  validateVersionedFrontmatter(fm, profile, where, options.path, options.warnings);

  const compiled = profile.types.get(canonicalType(type, profile));
  if (compiled === undefined) {
    // Unknown type: the non-empty-`type` floor (OKF §9) is already satisfied, so this is a
    // tolerated producer extension — warn, validate nothing further, leave every key untouched.
    options.warnings?.add(`unknown type "${type}"${where}; validated on \`type\` only`);
    return type;
  }

  const result = compiled.schema.safeParse(fm);
  if (!result.success) {
    throw new LoreError(
      "validation",
      `invalid ${type} frontmatter${where}: ${describeIssues(result.error)}`,
      "fix the field(s) named above to match the type's schema, or run `lore validate`",
      { path: options.path, type, issues: issueList(result.error) },
    );
  }

  const isIndex = options.path !== undefined && posix.basename(options.path) === "index.md";
  const isRootIndex = isRootIndexPath(options.path);
  warnExtraKeys(fm, compiled, where, options.warnings, isIndex, isRootIndex, profile);
  warnSummary(fm.summary, where, options.warnings);
  return type;
}

/** Validate and classify the OKF 0.2 frontmatter families without mutating authored data. */
function validateVersionedFrontmatter(
  fm: Record<string, unknown>,
  profile: Profile,
  where: string,
  path: string | undefined,
  warnings: WarningCollector | undefined,
): void {
  if (profile.okfVersion !== "0.2") {
    return;
  }
  if (Object.hasOwn(fm, "generated") && fm.generated !== null) {
    const result = GENERATED_SCHEMA.safeParse(fm.generated);
    if (!result.success) {
      throw new LoreError(
        "validation",
        `invalid generated provenance${where}: ${describeIssues(result.error)}`,
        "set `generated.by` to a non-empty actor and `generated.at` to an ISO-8601 datetime",
        { path, issues: issueList(result.error) },
      );
    }
  }
  if (Object.hasOwn(fm, "sources")) {
    const result = SOURCES_SCHEMA.safeParse(fm.sources);
    if (!result.success) {
      throw new LoreError(
        "validation",
        `invalid sources provenance${where}: ${describeIssues(result.error)}`,
        "set `sources` to a list whose entries carry a non-empty `resource` and valid credibility signals",
        { path, key: "sources", issues: issueList(result.error) },
      );
    }
  }
  if (Object.hasOwn(fm, "usage_window")) {
    const result = USAGE_WINDOW_SCHEMA.safeParse(fm.usage_window);
    if (!result.success) {
      throw new LoreError(
        "validation",
        `invalid sources usage_window${where}: ${describeIssues(result.error)}`,
        "set `usage_window.from` and `usage_window.to` to YYYY-MM-DD dates",
        { path, key: "usage_window", issues: issueList(result.error) },
      );
    }
  }
  if (Object.hasOwn(fm, "timestamp")) {
    warnings?.add(`legacy key "timestamp"${where}; tolerated under OKF 0.2, but new content should use generated.at`);
  }
}

/**
 * Read a non-empty string `type` and return it **trimmed**, or throw the OKF §9 floor error.
 * Trimming the return means a `type` with accidental surrounding whitespace classifies on its real
 * value (so a known type is type-checked, not silently demoted to "unknown"); the frontmatter object
 * keeps the verbatim value. `path` is echoed on the error's `input.path` so a consumer gets a usable path.
 */
function requireType(fm: Record<string, unknown>, where: string, path: string | undefined): string {
  const type = fm.type;
  if (type === undefined || type === null) {
    throw new LoreError(
      "validation",
      `frontmatter${where} is missing a \`type\``,
      "every concept needs a `type:` field (OKF §9); add one, e.g. `type: Reference`",
      { path },
    );
  }
  if (typeof type !== "string" || type.trim() === "") {
    throw new LoreError(
      "validation",
      `frontmatter${where} has an invalid \`type\` (must be a non-empty string)`,
      'set `type` to a non-empty string; quote it if it looks like a number or date, e.g. `type: "2026"`',
      { path },
    );
  }
  return type.trim();
}

/**
 * Warn for each key on a *known*-type concept that its profile type does not declare. Diffs the
 * frontmatter's own keys against the compiled type's {@link CompiledType.declaredFields} (the
 * generated schema is loose, so these extras validated fine) — the tier-3 OKF-tolerance warning,
 * not an error.
 */
function warnExtraKeys(
  fm: Record<string, unknown>,
  compiled: CompiledType,
  where: string,
  warnings: WarningCollector | undefined,
  isIndex: boolean,
  isRootIndex: boolean,
  profile: Profile,
): void {
  if (warnings === undefined) {
    return;
  }
  for (const key of Object.getOwnPropertyNames(fm)) {
    if (!compiled.declaredFields.has(key) && !isReservedKey(key, isIndex, isRootIndex, profile)) {
      warnings.add(`unknown key "${key}"${where}; preserved but not validated`);
    }
  }
}

/** Warn when `summary` is absent or runs well past the one-liner soft limit (ADR-0006 §5). */
function warnSummary(summary: unknown, where: string, warnings: WarningCollector | undefined): void {
  if (warnings === undefined) {
    return;
  }
  if (summary === undefined || summary === null) {
    warnings.add(`missing \`summary\`${where}; add a one-line summary for indexes and query snippets`);
    return;
  }
  if (typeof summary === "string") {
    const codePointLength = [...summary].length;
    if (codePointLength > SUMMARY_SOFT_LIMIT) {
      warnings.add(
        `\`summary\`${where} is ${codePointLength} chars; keep it under ~${SUMMARY_SOFT_LIMIT} (one sentence)`,
      );
    }
  }
}

/**
 * Project one Zod issue onto its `{ path, message }` pair — the single source of the dotted-path
 * rendering, so the human message and the JSON envelope's `input.issues` can never spell a nested
 * path two different ways if Zod's issue shape changes.
 */
function projectIssue(issue: z.core.$ZodIssue): { path: string; message: string } {
  return { path: issue.path.join("."), message: issue.message };
}

/** Flatten Zod issues to a single-line, human "field: reason; field: reason" string. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const { path, message } = projectIssue(issue);
      return `${path || "(root)"}: ${message}`;
    })
    .join("; ");
}

/** Project Zod issues onto a plain, JSON-safe array for the error envelope's `input`. */
function issueList(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map(projectIssue);
}

// ── JSON Schema emission + editor modeline (ADR-0006 §3) ───────────────────────
//
// The generated profile already carries each type's Draft-7 JSON Schema
// ({@link CompiledType.jsonSchema}); `lore init` writes one per type under `.lore/schemas/`.
// This module owns the **filename + modeline conventions** that bind a doc to its schema, kept
// here beside the validator so the emitter, the modeline writer, and the runtime check can never
// disagree about what a type's schema is called or where it lives.

/** Where lore writes the emitted JSON Schemas, relative to the repo root (ADR-0013). */
export const SCHEMAS_DIR = ".lore/schemas";

/**
 * The on-disk filename for a type's JSON Schema: its LOWER-KEBAB slug plus `.schema.json`
 * (`Reference` → `reference.schema.json`, `QA Plan` → `qa-plan.schema.json` — AC#7). For the
 * single-word story-convention types the slug equals the lower-cased name, so the filenames are
 * unchanged from before the profile existed (the committed modelines in this bundle still resolve).
 * The single source of the convention, shared by the scaffolder and {@link schemaModeline}.
 */
export function schemaFileName(type: string): string {
  return `${slugForTypeName(type)}.schema.json`;
}

/**
 * The editor modeline for a concept at `docPath` of `type` — the comment
 * `# yaml-language-server: $schema=<relative path to .lore/schemas/<slug>.schema.json>` (ADR-0006 §3).
 * The `$schema` path is computed **relative to the document's own directory** with POSIX separators,
 * so it resolves identically on every consumer regardless of how deep the doc sits. Pure and
 * filesystem-free.
 */
export function schemaModeline(docPath: string, type: string): string {
  const relDir = posix.relative(posix.dirname(docPath), SCHEMAS_DIR);
  return `# yaml-language-server: $schema=${posix.join(relDir, schemaFileName(type))}`;
}

/** A single emitted JSON Schema file: its `<dir>`-relative path and the exact bytes to write. */
export interface SchemaFile {
  /** `<dir>/<slug>.schema.json`, POSIX-joined (`.lore/schemas/reference.schema.json`). */
  readonly path: string;
  /** The type's Draft-7 JSON Schema, two-space pretty-printed with one trailing newline (the byte contract). */
  readonly contents: string;
}

/** Options for {@link emitSchemaFiles}. */
export interface EmitSchemaFilesOptions {
  /** Directory the files are placed under (default {@link SCHEMAS_DIR}). */
  readonly dir?: string;
  /** Emit only this one compiled type; default: every type in the profile, in declaration order. */
  readonly only?: CompiledType;
}

/**
 * The emitted JSON Schema files for a `profile` — one {@link SchemaFile} per type (or just
 * `options.only`), each the type's generated Draft-7 JSON Schema pretty-printed with a two-space
 * indent and a single trailing newline (the committed byte contract), placed under `options.dir`.
 * Pure and deterministic: the same profile always yields the same files in the same order. This is
 * the **single source** `lore init` ({@link import("./scaffold").buildScaffold}) and
 * `lore schema export` share, so a scaffolded schema file and a re-exported one are byte-identical.
 */
export function emitSchemaFiles(profile: Profile, options: EmitSchemaFilesOptions = {}): SchemaFile[] {
  const dir = options.dir ?? SCHEMAS_DIR;
  const types = options.only ? [options.only] : [...profile.types.values()];
  return types.map((type) => ({
    path: posix.join(dir, schemaFileName(type.name)),
    contents: `${JSON.stringify(schemaForVersion(type.jsonSchema, profile), null, 2)}\n`,
  }));
}

/** Add the 0.2 provenance families to editor schemas without changing the 0.1 profile grammar. */
function schemaForVersion(schema: Record<string, unknown>, profile: Profile): Record<string, unknown> {
  if (profile.okfVersion !== "0.2") {
    return schema;
  }
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  return {
    ...schema,
    properties: {
      ...properties,
      generated: GENERATED_JSON_SCHEMA,
      sources: SOURCES_JSON_SCHEMA,
      usage_window: USAGE_WINDOW_JSON_SCHEMA,
    },
  };
}
