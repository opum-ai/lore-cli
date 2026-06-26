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
import type { z } from "zod";
import { LoreError, type WarningCollector } from "../errors";
import { type CompiledType, defaultProfile, type Profile, slugForTypeName } from "./profile";

/**
 * OKF-reserved frontmatter keys that pass validation without an "unknown key" warning even
 * on a known type. Both are legitimate, recognized fields — not stray producer extensions —
 * so flagging them as unknown (as the generic extra-key check otherwise would) is a false
 * positive on lore's own conformant output:
 *
 * - `okf_version` is the bundle-root index's conformance marker. Its placement discipline —
 *   only the root index may carry it — is a whole-bundle conformance check
 *   (`lore validate`/`lore check`), not a per-file extra-key warning.
 * - `resource` is the OKF-recommended canonical link `lore new` stamps from the profile's
 *   `resource_base` (LORE-47). It is a producer-stamped, recognized key rather than a profile
 *   field: keeping it here — instead of in `[base.fields]` — means it never changes a type's
 *   generated validator or the committed `.lore/schemas/*.json` (it is advisory metadata, not a
 *   shape constraint), while still suppressing the extra-key warning on lore's own output.
 */
const OKF_RESERVED_KEYS: ReadonlySet<string> = new Set(["okf_version", "resource"]);

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
 *   carrying surrounding whitespace classifies on its trimmed value and then fails the literal
 *   check loudly here, rather than being silently demoted to an unvalidated unknown type.
 * - Known `type` with extra keys → one warning per extra key.
 * - Missing or over-long (~{@link SUMMARY_SOFT_LIMIT}-char) `summary` → warn.
 */
export function validateFrontmatter(fm: Record<string, unknown>, options: ValidateOptions = {}): string {
  const profile = options.profile ?? defaultProfile();
  const where = options.path ? ` in ${options.path}` : "";
  const type = requireType(fm, where, options.path);

  const compiled = profile.types.get(type);
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

  warnExtraKeys(fm, compiled, where, options.warnings);
  warnSummary(fm.summary, where, options.warnings);
  return type;
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
): void {
  if (warnings === undefined) {
    return;
  }
  for (const key of Object.getOwnPropertyNames(fm)) {
    if (!compiled.declaredFields.has(key) && !OKF_RESERVED_KEYS.has(key)) {
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
  if (typeof summary === "string" && summary.length > SUMMARY_SOFT_LIMIT) {
    warnings.add(`\`summary\`${where} is ${summary.length} chars; keep it under ~${SUMMARY_SOFT_LIMIT} (one sentence)`);
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
