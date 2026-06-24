/**
 * schema.ts — Zod is the single source of truth for concept frontmatter.
 *
 * Per [ADR-0006](../../docs/adr/0006-schema-types-templates.md), every frontmatter
 * shape lore knows about is authored here in Zod and nowhere else: runtime
 * validation, the TypeScript types, and (later, at `lore init`/`lore new` time)
 * the editor JSON Schema all descend from these definitions. This module owns the
 * **story-convention producer profile** — the six known `type` values
 * (`Epic`/`Story`/`Spec`/`ADR`/`Runbook`/`Reference`) — layered inside OKF's
 * tolerance window ([okf-conformance](../../docs/reference/okf-conformance.md)).
 *
 * The validation tiers mirror OKF §9 + the lore profile
 * ([okf-conformance](../../docs/reference/okf-conformance.md) "How lore checks
 * conformance"):
 *
 * - **ERROR** (throws a `validation` {@link LoreError}, exit 6): unparseable
 *   frontmatter (handled upstream in concept.ts), a missing/empty `type`, or a
 *   *known* field carrying the wrong type (e.g. `tags` that is not an array).
 * - **WARNING** (recorded on a {@link WarningCollector}, never fatal): an unknown
 *   `type` (validated on `type` alone), an extra key on a *known* type, or a
 *   missing/over-long `summary`.
 *
 * Two deliberate departures from a naive reading of ADR-0006:
 *
 * 1. **Known schemas are *loose*, not `.strict()`.** OKF requires extra keys to be
 *    *tolerated*, and okf-conformance classes them as a tier-3 **warning**, not an
 *    error. A `.strict()` Zod object would *reject* them. So each known schema is a
 *    `z.looseObject` (extras pass validation) and the extra-key warning is computed
 *    separately ({@link validateFrontmatter}). This is "flagged at runtime" read as
 *    "warned", which is what preserves OKF tolerance.
 * 2. **Validation never rewrites the data.** {@link validateFrontmatter} only
 *    *inspects* the frontmatter (throw-or-warn); it returns nothing and the caller
 *    keeps the verbatim object js-yaml produced. Zod's parsed output is discarded,
 *    so byte-stable round-tripping ([ADR-0011](../../docs/adr/0011-frontmatter-serialization-stability.md))
 *    is never compromised by coercion, key-stripping, or reordering.
 *
 * Dates are kept as **ISO strings**, never coerced to `Date` (ADR-0006 §2): the
 * `timestamp` field is validated as an ISO-8601 datetime string and the YAML
 * engine in concept.ts parses under js-yaml's `JSON_SCHEMA`, which never resolves a
 * timestamp to a `Date`.
 */

import { z } from "zod";
import { LoreError, type WarningCollector } from "../errors";

/**
 * The six `type` values lore's story-convention profile knows and validates
 * strictly-by-field. Any other `type` is an OKF producer extension: tolerated,
 * validated on `type` alone, and preserved verbatim (see {@link validateFrontmatter}).
 */
export const KNOWN_TYPES = ["Epic", "Story", "Spec", "ADR", "Runbook", "Reference"] as const;

/** A `type` value lore validates against a per-type schema. */
export type KnownType = (typeof KNOWN_TYPES)[number];

// ── Field schemas, shared across the known types ───────────────────────────────
//
// Every field except `type` is OPTIONAL: OKF requires only a non-empty `type`, and
// the recommended fields (title/description/tags/summary/timestamp) are exactly
// that — recommended. A *present* field is type-checked; an absent one is fine.

/** A list of strings (tags, task ids, …). */
const stringList = z.array(z.string());

/**
 * An ISO-8601 datetime string with an offset/`Z` (e.g. `2026-06-21T00:00:00Z`) —
 * the form every `timestamp` in the bundle uses (ADR-0006 §2). Kept as a string,
 * never a `Date`. Date-only values are intentionally rejected: lore emits full
 * datetimes, so a bare date is malformed for this field.
 */
const isoTimestamp = z.iso.datetime({ offset: true });

/**
 * A concept reference, or a list of them — the shape of the supersession links
 * (`supersedes`/`superseded_by`) lore writes. Tolerant of either form because a
 * concept may supersede one or several others.
 */
const conceptRefs = z.union([z.string(), stringList]);

/**
 * The fields shared by every known type: OKF's recommended set plus lore's
 * profile fields (`summary`) and the lifecycle/coupling fields lore writes
 * (`status`, `supersedes`, `superseded_by`). `type` is added per-type as a literal.
 *
 * Every field is `.nullish()` (accepts both absent **and** `null`), not just
 * `.optional()`: a YAML `key:` with no value parses to `null`, and an empty/cleared
 * recommended field is OKF-tolerated — it must not be promoted from "absent" to a
 * hard validation error. The `null` is preserved as a value on the frontmatter object
 * (a bare `key:` re-serializes to the explicit `key: null` — a one-time normalization,
 * not byte-preservation of the empty form). Consumers must therefore treat any field
 * as possibly `null`, not just absent.
 */
const sharedFields = {
  title: z.string().nullish(),
  description: z.string().nullish(),
  tags: stringList.nullish(),
  summary: z.string().nullish(),
  timestamp: isoTimestamp.nullish(),
  status: z.string().nullish(),
  supersedes: conceptRefs.nullish(),
  superseded_by: conceptRefs.nullish(),
} as const;

/**
 * Build the loose per-type schema for `type`: a `z.literal` on `type`, the
 * {@link sharedFields}, and any per-type `extra` fields. Loose (not strict) so
 * extra keys pass validation and are handled as warnings, preserving OKF tolerance.
 */
function knownSchema(type: KnownType, extra: z.ZodRawShape = {}) {
  return z.looseObject({ type: z.literal(type), ...sharedFields, ...extra });
}

/**
 * The per-type schemas, keyed by `type`. Only `Story` carries extra coupling
 * fields today (`tasks`, `specs`); the rest validate the shared set. Adding a
 * per-type field is a one-line change here — the single source of truth.
 */
const SCHEMAS: Readonly<Record<KnownType, ReturnType<typeof knownSchema>>> = {
  Epic: knownSchema("Epic"),
  Story: knownSchema("Story", { tasks: stringList.nullish(), specs: stringList.nullish() }),
  Spec: knownSchema("Spec"),
  ADR: knownSchema("ADR"),
  Runbook: knownSchema("Runbook"),
  Reference: knownSchema("Reference"),
};

/**
 * The canonical frontmatter key emission order, and the single source of truth for
 * "which keys lore knows". concept.ts imports this to order known keys on serialize
 * (ADR-0011 §3); keeping it here, beside the schemas, means adding a known field is
 * one edit, not two parallel lists that can drift. {@link declaredKnownFields} backs
 * the drift test that every schema-declared field appears here.
 */
export const CANONICAL_KEY_ORDER = [
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
] as const;

/**
 * The declared field names per known type, precomputed once at module load (the set
 * is a compile-time constant per type). Used by {@link validateFrontmatter} to flag
 * extra keys without re-deriving `Object.keys(schema.shape)` and re-allocating a Set
 * on every per-concept call.
 */
const DECLARED_FIELDS: Readonly<Record<KnownType, ReadonlySet<string>>> = (() => {
  const fields = {} as Record<KnownType, ReadonlySet<string>>;
  for (const type of KNOWN_TYPES) {
    fields[type] = new Set(Object.keys(SCHEMAS[type].shape));
  }
  return Object.freeze(fields);
})();

/** The longest a `summary` should be before lore warns it is no longer a one-liner (ADR-0006 §5). */
const SUMMARY_SOFT_LIMIT = 200;

/**
 * The union of every field any known schema declares (plus `type`). Exported for the
 * drift test that pins {@link CANONICAL_KEY_ORDER} as a superset, so a field added to
 * a schema but forgotten in the canonical order fails loudly instead of silently
 * serializing into the unknown-key tail.
 */
export function declaredKnownFields(): ReadonlySet<string> {
  const fields = new Set<string>();
  for (const declared of Object.values(DECLARED_FIELDS)) {
    for (const field of declared) {
      fields.add(field);
    }
  }
  return fields;
}

/** Options for {@link validateFrontmatter}. */
export interface ValidateOptions {
  /** Sink for advisory warnings (unknown type, extra keys, summary). Absent → warnings are dropped. */
  warnings?: WarningCollector;
  /** The concept's repo-relative path, woven into diagnostics so a finding names its file. */
  path?: string;
}

/**
 * The Zod schema for a known `type`, or `undefined` for an unknown (producer
 * extension) type. Exported so other core modules can introspect the profile
 * without re-deriving the type list.
 */
export function schemaForType(type: string): ReturnType<typeof knownSchema> | undefined {
  return isKnownType(type) ? SCHEMAS[type] : undefined;
}

/** Narrow an arbitrary string to a {@link KnownType}. */
export function isKnownType(type: string): type is KnownType {
  return (KNOWN_TYPES as readonly string[]).includes(type);
}

/**
 * Validate a frontmatter object against the lore profile, **throwing** on an
 * error-tier problem and **recording** warning-tier ones on `options.warnings`.
 *
 * It never mutates `fm` — the caller keeps the verbatim object so byte-stable
 * round-tripping is preserved (ADR-0011). It **returns the resolved type** (the
 * `type` value, trimmed) so the caller doesn't re-derive it. Behavior by tier:
 *
 * - Missing/empty `type` → throw (`validation`). This is the OKF §9 floor.
 * - Unknown `type` → warn; the type-only floor already passed, so nothing else is
 *   checked and every key is preserved (OKF tolerance, AC#2).
 * - Known `type` with a mistyped field → throw (`validation`) citing the field(s).
 *   A `type` carrying surrounding whitespace (e.g. `" Story "`) classifies on its
 *   trimmed value and then fails the literal check loudly here, rather than being
 *   silently demoted to an unvalidated unknown type.
 * - Known `type` with extra keys → one warning per extra key.
 * - Missing or over-long (~{@link SUMMARY_SOFT_LIMIT}-char) `summary` → warn.
 */
export function validateFrontmatter(fm: Record<string, unknown>, options: ValidateOptions = {}): string {
  const where = options.path ? ` in ${options.path}` : "";
  const type = requireType(fm, where, options.path);

  if (!isKnownType(type)) {
    // Unknown type: the non-empty-`type` floor (OKF §9) is already satisfied, so
    // this is a tolerated producer extension — warn, validate nothing further, and
    // leave every key untouched (AC#2).
    options.warnings?.add(`unknown type "${type}"${where}; validated on \`type\` only`);
    return type;
  }

  const result = SCHEMAS[type].safeParse(fm);
  if (!result.success) {
    throw new LoreError(
      "validation",
      `invalid ${type} frontmatter${where}: ${describeIssues(result.error)}`,
      "fix the field(s) named above to match the type's schema, or run `lore validate`",
      { path: options.path, type, issues: issueList(result.error) },
    );
  }

  warnExtraKeys(fm, type, where, options.warnings);
  warnSummary(fm.summary, where, options.warnings);
  return type;
}

/**
 * Read a non-empty string `type` and return it **trimmed**, or throw the OKF §9
 * floor error. Trimming the return means a `type` with accidental surrounding
 * whitespace classifies on its real value (so a known type is type-checked, not
 * silently demoted to "unknown"); the frontmatter object keeps the verbatim value.
 * `path` (the raw repo-relative path, not the ` in <path>` display string) is echoed
 * on the error's `input.path` so a consumer reading the envelope gets a usable path.
 */
function requireType(fm: Record<string, unknown>, where: string, path: string | undefined): string {
  const type = fm.type;
  // Distinguish "absent" from "present but wrong" so the diagnostic + hint point the
  // user at the real fix: a YAML `type: 2026` is present (a number), not missing.
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
 * Warn for each key on a *known*-type concept that its schema does not declare.
 * Diffs the frontmatter's own keys against the precomputed {@link DECLARED_FIELDS}
 * set for `type` ({@link knownSchema} builds a loose object, so these extras
 * validated fine) — this is the tier-3 OKF-tolerance warning, not an error.
 */
function warnExtraKeys(
  fm: Record<string, unknown>,
  type: KnownType,
  where: string,
  warnings: WarningCollector | undefined,
): void {
  if (warnings === undefined) {
    return;
  }
  const declared = DECLARED_FIELDS[type];
  for (const key of Object.getOwnPropertyNames(fm)) {
    if (!declared.has(key)) {
      warnings.add(`unknown key "${key}"${where}; preserved but not validated`);
    }
  }
}

/** Warn when `summary` is absent or runs well past the one-liner soft limit (ADR-0006 §5). */
function warnSummary(summary: unknown, where: string, warnings: WarningCollector | undefined): void {
  if (warnings === undefined) {
    return;
  }
  // Treat an empty `summary:` (YAML null) as missing too — under `.nullish()` a cleared
  // summary parses to null, which must still nudge the author, not pass silently.
  if (summary === undefined || summary === null) {
    warnings.add(`missing \`summary\`${where}; add a one-line summary for indexes and query snippets`);
    return;
  }
  if (typeof summary === "string" && summary.length > SUMMARY_SOFT_LIMIT) {
    warnings.add(`\`summary\`${where} is ${summary.length} chars; keep it under ~${SUMMARY_SOFT_LIMIT} (one sentence)`);
  }
}

/**
 * Project one Zod issue onto its `{ path, message }` pair — the single source of the
 * dotted-path rendering, so the human message ({@link describeIssues}) and the JSON
 * envelope's `input.issues` ({@link issueList}) can never spell a nested path two
 * different ways if Zod's issue shape changes.
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
