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

import { posix } from "node:path";
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

/**
 * The OKF version string lore's producer profile emits. It is a profile-wide
 * fact — the single source of truth so the scaffolder, and any future conformance
 * gate, agree on the version — and is carried by the bundle-root `index.md` alone
 * ([okf-conformance](../../docs/reference/okf-conformance.md)).
 */
export const OKF_VERSION = "0.1";

/**
 * OKF-reserved frontmatter keys that pass validation without an "unknown key"
 * warning even on a known type. `okf_version` is the bundle-root index's
 * conformance marker: it is a legitimate, recognized field — not a stray producer
 * extension — so flagging it as unknown (as the generic extra-key check otherwise
 * would) is a false positive on lore's own conformant output. Its placement
 * discipline — only the root index may carry it — is a whole-bundle conformance
 * check (`lore validate`/`lore check`), not a per-file extra-key warning, so it is
 * deliberately not enforced here. The key stays an unordered passthrough (it is not
 * in {@link CANONICAL_KEY_ORDER}), so serialized bytes are unchanged.
 */
const OKF_RESERVED_KEYS: ReadonlySet<string> = new Set(["okf_version"]);

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
 * The known types keyed by their lower-cased spelling, so a user-supplied `<type>`
 * token resolves case-insensitively to its canonical form. Built once at module load.
 */
const CANONICAL_BY_LOWER: ReadonlyMap<string, KnownType> = new Map(
  KNOWN_TYPES.map((type) => [type.toLowerCase(), type] as const),
);

/**
 * Resolve a user-supplied `<type>` token to its canonical spelling. `lore new` accepts
 * a type case-insensitively (`story`, `ADR`, `reference` — cli-surface §new), so a token
 * whose lower-case form names a {@link KnownType} returns that type's canonical casing
 * (`Story`, `ADR`, `Reference`) — the value lore writes to `type:` and keys its schema by.
 *
 * An **unknown** type is a tolerated OKF producer extension: it is returned **trimmed but
 * otherwise verbatim** (the author's own casing preserved), never folded or rejected, so
 * `lore new Decision "…"` scaffolds a `type: Decision` concept against the lenient shape.
 */
export function canonicalType(input: string): string {
  const trimmed = input.trim();
  return CANONICAL_BY_LOWER.get(trimmed.toLowerCase()) ?? trimmed;
}

/**
 * The bundle sub-directory each known type's concepts live under, relative to the bundle
 * root (`docs/`). This is the **type config's** single source of truth for `lore new`'s
 * conventional output location — kept here beside {@link KNOWN_TYPES} so the type
 * vocabulary and its on-disk home never drift. The directory names are **not derivable**
 * from the type by any single rule (the bundle uses the acronym `adr`, the singular
 * `reference`, and the plurals `runbooks`/`specs`), so they are mapped explicitly; they
 * match the directories the bundle already uses. A caller may always override the
 * computed path (`lore new … --out <path>`).
 */
const TYPE_DIRECTORIES: Readonly<Record<KnownType, string>> = Object.freeze({
  Epic: "epics",
  Story: "stories",
  Spec: "specs",
  ADR: "adr",
  Runbook: "runbooks",
  Reference: "reference",
});

/**
 * The bundle sub-directory a concept of `type` is scaffolded into. A known type maps via
 * {@link TYPE_DIRECTORIES}; an unknown (producer-extension) type falls back to its own
 * lower-cased name, so `lore new Decision "…"` lands under `docs/decision/`. Returns a path
 * segment relative to the bundle root, never including `docs/` itself.
 */
export function typeDirectory(type: string): string {
  return isKnownType(type) ? TYPE_DIRECTORIES[type] : type.toLowerCase();
}

/**
 * The **required body sections** (`##` headings) each known type must carry — the per-type
 * tier-2 section contract `lore validate` enforces as an **error** (ADR-0007 §"Per-type shape";
 * cli-surface §validate). This is the single source of truth for the section vocabulary,
 * deliberately kept beside {@link KNOWN_TYPES} and the schemas so the type profile and its
 * structural contract never drift.
 *
 * The policy is **minimal and evidence-based** (LORE-19): a section is required only where it is
 * either *universal across the existing bundle* or *named by ADR-0007*, so that lore's own
 * hand-authored `docs/` bundle — whose Reference/Spec/Runbook pages use heterogeneous,
 * page-specific headings — keeps validating clean rather than being mass-invalidated:
 *
 * - **ADR** → `Status`, `Context`, `Decision`, `Consequences`: present in every one of the
 *   bundle's ADRs and emitted verbatim by the built-in ADR template.
 * - **Story** → `Acceptance criteria`: the one section ADR-0007 names as load-bearing ("a
 *   `Story` without acceptance criteria … is a defect"); no authored Story pages exist yet, so
 *   only the built-in template must satisfy it (it does).
 * - **Epic / Spec / Runbook / Reference** → none: their real pages are structurally diverse, so
 *   requiring the template skeleton would reject conformant existing docs. Their built-in
 *   templates still scaffold a conventional skeleton; it is guidance, not a gate.
 *
 * Each known type's required set is a **subset** of the headings its built-in template emits, so
 * a no-flag `lore new <type>` is valid by construction (LORE-18) — pinned by a drift test.
 * Matching is case-insensitive on trimmed heading text ({@link validate}), so `## status` and
 * `## Status` both satisfy the `Status` requirement.
 */
const REQUIRED_SECTIONS: Readonly<Record<KnownType, readonly string[]>> = Object.freeze({
  Epic: [],
  Story: ["Acceptance criteria"],
  Spec: [],
  ADR: ["Status", "Context", "Decision", "Consequences"],
  Runbook: [],
  Reference: [],
});

/**
 * The body sections (`##` headings) a concept of `type` must carry, or an empty array for a type
 * with no structural contract — an unknown (producer-extension) type included (OKF tolerance: lore
 * never imposes a section shape on a type it does not own). The single source the validator reads,
 * so the required-section policy lives in one place beside the schemas.
 */
export function requiredSectionsFor(type: string): readonly string[] {
  return isKnownType(type) ? REQUIRED_SECTIONS[type] : [];
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
    if (!declared.has(key) && !OKF_RESERVED_KEYS.has(key)) {
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

// ── JSON Schema emission + editor modeline (ADR-0006 §3) ───────────────────────
//
// The same Zod schemas that gate frontmatter at runtime are the source of the
// **editor** experience: `lore init` exports each known type to a Draft-7 JSON
// Schema under `.lore/schemas/`, and `lore new`/the scaffolded root index carry a
// `# yaml-language-server:` modeline pointing at the matching file, so a
// `yaml-language-server`-aware editor validates and autocompletes frontmatter live.
// Keeping the filename convention and the modeline beside the schemas means the
// emitter, the modeline writer, and the runtime validator can never disagree about
// what a type's schema is called or where it lives.

/** Where lore writes the emitted JSON Schemas, relative to the repo root (ADR-0013). */
export const SCHEMAS_DIR = ".lore/schemas";

/**
 * The on-disk filename for a type's JSON Schema, e.g. `Reference` → `reference.schema.json`.
 * Lower-cased so the path is stable across case-insensitive filesystems and matches the
 * `$schema=` modelines authored throughout this bundle. The single source of the
 * convention, shared by {@link jsonSchemaFor}'s consumers and {@link schemaModeline}.
 */
export function schemaFileName(type: KnownType): string {
  return `${type.toLowerCase()}.schema.json`;
}

/**
 * Export a known type's Zod schema to a **Draft-7 JSON Schema** object (ADR-0006 §3).
 *
 * It descends from the *same* loose per-type schema the runtime validator uses
 * ({@link knownSchema}), so the editor schema is deliberately the **lenient** tier:
 * `required: ["type"]` and an open `additionalProperties`, so an author's custom
 * frontmatter keys never light up as errors mid-edit (OKF producer-extension
 * tolerance). The stricter "extra keys warn" enforcement lives only in the CLI path
 * ({@link validateFrontmatter}); editor = guide, CLI = gate. The output is a plain
 * JSON-serializable object; the caller owns byte formatting (and its golden test).
 */
export function jsonSchemaFor(type: KnownType): Record<string, unknown> {
  return z.toJSONSchema(SCHEMAS[type], { target: "draft-7" }) as Record<string, unknown>;
}

/**
 * The editor modeline for a concept at `docPath` of `type` — the comment
 * `# yaml-language-server: $schema=<relative path to .lore/schemas/<type>.schema.json>`
 * (ADR-0006 §3). The `$schema` path is computed **relative to the document's own
 * directory** with POSIX separators, so it resolves identically on every consumer
 * regardless of how deep the doc sits (`docs/index.md` → `../.lore/schemas/…`,
 * `docs/adr/x.md` → `../../.lore/schemas/…`). Pure and filesystem-free.
 *
 * The writer inserts the returned line as the **first line inside** the `---`
 * frontmatter fence (a YAML comment), which is the placement every modeline-bearing
 * doc in this bundle uses: it is the line `yaml-language-server` reads to bind the
 * schema to the frontmatter document, and the only placement lore's own parser reads
 * back as a concept (`parseConcept` requires `---` at byte 0, so an above-fence
 * comment would be treated as a non-concept body).
 */
export function schemaModeline(docPath: string, type: KnownType): string {
  const relDir = posix.relative(posix.dirname(docPath), SCHEMAS_DIR);
  return `# yaml-language-server: $schema=${posix.join(relDir, schemaFileName(type))}`;
}
