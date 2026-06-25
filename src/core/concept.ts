/**
 * concept.ts — a single concept `.md` file ⇄ a typed {@link Concept}.
 *
 * This module is the **frontmatter boundary**
 * ([ADR-0011](../../docs/adr/0011-frontmatter-serialization-stability.md) §1): the
 * one place lore turns a file's raw bytes into a structured object
 * ({@link parseConcept}) and back again ({@link serializeConcept}). Everything
 * downstream — the bundle graph, validation, status reconciliation, refactoring —
 * reads and writes concepts through here, so the byte-stability contract has a
 * single home to enforce and test.
 *
 * The load-bearing guarantee is **byte-stable serialization** (ADR-0011, design
 * §6): re-serializing a concept whose frontmatter is already in lore-canonical form
 * reproduces the exact bytes, so a semantic no-op is a *byte-level* no-op and
 * `lore sync`/`lore check` produce clean diffs and a trustworthy drift gate. The
 * tested property is a **fixpoint**: for any input,
 * `serialize(parse(serialize(parse(raw))))` equals `serialize(parse(raw))` — the
 * first write normalizes to canonical form, every write after is identical
 * (design §9.2).
 *
 * Four mechanisms make that true:
 *
 * - **A frozen YAML config.** The YAML is parsed and dumped by js-yaml under one
 *   pinned config ({@link YAML_DUMP_OPTIONS}) reused by every path — no
 *   line-wrapping, no key sorting, deterministic block style, minimal-but-stable
 *   quoting.
 * - **`JSON_SCHEMA` on parse.** js-yaml's `JSON_SCHEMA` never resolves a timestamp
 *   to a `Date`, so `2026-06-21T00:00:00Z` stays the ISO **string** ADR-0006 §2
 *   requires — which is also what keeps it byte-stable and Zod-validatable.
 * - **Canonical key order on serialize.** Known keys are emitted in a fixed order
 *   ({@link CANONICAL_KEY_ORDER}, the single source of truth in schema.ts); unknown
 *   producer-extension keys follow in their existing order, preserved verbatim
 *   (ADR-0011 §3, §5; OKF tolerance).
 * - **Input normalization on parse.** A leading BOM, CRLF/CR line endings, and
 *   blank-line padding before the opening fence are normalized to canonical form (no
 *   BOM, LF, fence-first) on read, so such a file is *accepted* (not rejected) and
 *   reaches a fixpoint after one write rather than churning or erroring.
 *
 * Serialization composes the fence directly (`---` + dumped YAML + `---` + body)
 * rather than going through gray-matter's `stringify`: that helper internally does
 * `Object.assign({}, data)`, whose `[[Set]]` semantics **silently drop an own
 * `__proto__` data key** (a tolerated OKF producer extension) and reflow the body —
 * both of which would break the no-key-dropped (ADR-0011 §5) and byte-stability
 * guarantees this module exists to provide. gray-matter remains the *parse* boundary
 * (it splits the fence from the body).
 *
 * Per the core contract (design §2.1) this module is a pure library: it returns a
 * {@link Concept} or throws a {@link LoreError}; it never prints, reads flags, or
 * calls `process.exit`. Advisory warnings flow to an optional {@link WarningCollector}.
 *
 * Scope note: a concept document is the `---`-fenced frontmatter plus its body. The
 * editor modeline (`# yaml-language-server: …`) is written *above* the fence by
 * `lore new` (ADR-0006 §3) and is that command's concern, not this module's.
 *
 * Documented limitations, all for inputs no real concept produces (frontmatter keys
 * are field-name identifiers and values are short scalars/dates/lists — never comments,
 * blank-line-terminated values, integer keys, or huge numbers). Each still reaches a
 * stable fixpoint; only the *first* write may normalize:
 *
 * - An in-frontmatter YAML *comment* is not preserved across a round-trip (the YAML
 *   emitter drops comments — an accepted ADR-0011 limitation).
 * - A frontmatter scalar value ending in two-or-more newlines emits a `|+` keep-chomped
 *   block that abuts the closing fence and loses one trailing newline on the first
 *   re-parse (a value with ≤1 trailing newline round-trips exactly).
 * - Integer-like keys (e.g. a `9:` producer-extension key) are emitted in ascending
 *   numeric order ahead of the named keys, not in authored order — JS object semantics
 *   reorder integer keys at parse time (`js-yaml` builds a plain object), so the order
 *   is unrecoverable here regardless of {@link CANONICAL_KEY_ORDER}.
 * - A large/high-precision unquoted *numeric* value loses precision (`js-yaml`'s
 *   `JSON_SCHEMA` parses numbers to JS doubles); quote such a value to keep it exact.
 */

import { posix } from "node:path";
import matter from "gray-matter";
import type { DumpOptions, LoadOptions } from "js-yaml";
import yaml from "js-yaml";
import { deriveMessage, LoreError, singleLine, type WarningCollector } from "../errors";
import { CANONICAL_KEY_ORDER, validateFrontmatter } from "./schema";

/**
 * A single concept file as a typed object. `frontmatter` is the **verbatim**
 * parsed YAML mapping (every key preserved, never coerced or reordered on read);
 * `type` is a convenience mirror of `frontmatter.type` (always a non-empty string
 * after {@link parseConcept}); `body` is the markdown after the closing fence.
 *
 * `id`, `path`, and `type` are **`readonly`** identity/derived fields: they snapshot
 * what was parsed and are not the write surface. `frontmatter` is authoritative for
 * serialization — to retype a concept, set `frontmatter.type` (assigning the readonly
 * `type` mirror is a compile error precisely because serialize ignores it).
 */
export interface Concept {
  /** Repo-relative path minus the `.md` suffix, e.g. `stories/bulk-archive`. */
  readonly id: string;
  /** Repo-relative path as given to {@link parseConcept}, e.g. `stories/bulk-archive.md`. */
  readonly path: string;
  /**
   * The resolved (trimmed, non-empty) `type` — a read-only mirror of
   * `frontmatter.type`. `frontmatter.type` is authoritative for serialization; to
   * retype a concept, set `frontmatter.type` (this mirror cannot be assigned).
   */
  readonly type: string;
  /**
   * The verbatim parsed frontmatter mapping — validated where known, passthrough
   * where not. Keys are never dropped or reordered on read; a value may be `null`
   * (an empty `key:`), so consumers must be null-safe, not merely absent-safe.
   */
  frontmatter: Record<string, unknown>;
  /** The markdown body after the frontmatter fence. */
  body: string;
}

/** The frontmatter fence delimiter. */
const FENCE = "---\n";

/**
 * The frozen js-yaml load config (ADR-0011 §2). `JSON_SCHEMA` is the crux: it
 * resolves only JSON's own types, so an ISO timestamp stays a **string** (never a
 * `Date`) and round-trips byte-for-byte.
 */
const YAML_LOAD_OPTIONS: LoadOptions = Object.freeze({ schema: yaml.JSON_SCHEMA });

/**
 * The frozen js-yaml dump config (ADR-0011 §2) — chosen for *stability over
 * prettiness* and reused by every write:
 *
 * - `schema: JSON_SCHEMA` — symmetric with the load schema.
 * - `lineWidth: -1` — never wrap/reflow long strings or lists into different bytes.
 * - `sortKeys: false` — we control key order ourselves ({@link CANONICAL_KEY_ORDER}).
 * - `noRefs: true` — never emit YAML anchors/aliases for a shared object.
 * - `quotingType: '"'` + `forceQuotes: false` — when a value *must* be quoted, use
 *   double quotes; otherwise leave it unquoted (don't gratuitously re-quote).
 * - `noCompatMode: true` — don't quote for YAML-1.1 compatibility (e.g. `yes`/`on`).
 */
const YAML_DUMP_OPTIONS: DumpOptions = Object.freeze({
  schema: yaml.JSON_SCHEMA,
  lineWidth: -1,
  sortKeys: false,
  noRefs: true,
  quotingType: '"',
  forceQuotes: false,
  noCompatMode: true,
});

/**
 * gray-matter options carrying the frozen parse engine. Only `parse` is used:
 * serialization composes the fence itself (see the module header), so gray-matter's
 * `stringify` is never invoked.
 */
const MATTER_OPTIONS = {
  engines: { yaml: { parse: (input: string): object => yaml.load(input, YAML_LOAD_OPTIONS) as object } },
} as const;

/** Options for {@link parseConcept}. */
export interface ParseConceptOptions {
  /** Sink for advisory warnings (unknown type, extra keys, summary); absent → dropped. */
  warnings?: WarningCollector;
}

/**
 * Parse a concept file's raw bytes into a typed {@link Concept}.
 *
 * Normalizes the input ({@link normalizeInput}), splits the frontmatter via
 * gray-matter (under the frozen YAML engine), validates it against the lore profile
 * ({@link validateFrontmatter} — throws a `validation` {@link LoreError} on a missing
 * `type` or a mistyped known field; warns on unknown types/keys), and returns the
 * **verbatim** frontmatter object so a later {@link serializeConcept} can reproduce
 * the bytes.
 *
 * @param path repo-relative path, used to derive {@link Concept.id} and to name diagnostics.
 * @param raw  the file's raw text (the `---`-fenced frontmatter plus body).
 */
export function parseConcept(path: string, raw: string, options: ParseConceptOptions = {}): Concept {
  const split = splitFrontmatter(path, normalizeInput(raw));
  if (!split.present) {
    throw absentFrontmatterError(path, split.reason);
  }
  return conceptFromSplit(path, split, options);
}

/**
 * Like {@link parseConcept}, but returns `null` when `raw` is **not a concept
 * file** — it has no frontmatter, an empty fence, or a non-mapping fence (a bare
 * scalar/list, e.g. a hand-written doc that merely *opens* with a `---` thematic
 * break). It still **throws** for a real but malformed concept: unparseable YAML,
 * or a frontmatter *mapping* that fails the lore profile (missing/invalid `type`,
 * mistyped field).
 *
 * This is the distinction a bundle walk ({@link loadBundle}) needs: a non-concept
 * is skipped, a broken concept fails loud. A plain `hasFrontmatter`-style prefix
 * check cannot draw it — telling "an empty/HR `---`" from "real frontmatter"
 * requires actually parsing the YAML, which is exactly what this does (once), so a
 * caller never parses the same bytes twice.
 */
export function tryParseConcept(path: string, raw: string, options: ParseConceptOptions = {}): Concept | null {
  const split = splitFrontmatter(path, normalizeInput(raw));
  return split.present ? conceptFromSplit(path, split, options) : null;
}

/**
 * Validate a present frontmatter split against the lore profile and assemble the
 * {@link Concept}. Shared by {@link parseConcept} and {@link tryParseConcept} so
 * the validate-and-construct step (and the byte-stable `frontmatter`/`body`
 * passthrough) has one home. `validateFrontmatter` returns the resolved (trimmed,
 * non-empty) `type`, so the `type` mirror is correct even when `frontmatter.type`
 * carries stray whitespace; it throws a `validation` {@link LoreError} on a
 * malformed mapping.
 */
function conceptFromSplit(path: string, split: PresentSplit, options: ParseConceptOptions): Concept {
  const type = validateFrontmatter(split.frontmatter, { warnings: options.warnings, path });
  return { id: idFromPath(path), path, type, frontmatter: split.frontmatter, body: split.body };
}

/**
 * Serialize a {@link Concept} back to bytes with the byte-stable contract:
 * `---` + frontmatter (canonical key order, frozen YAML config) + `---` + body.
 * Re-serializing an already-canonical concept reproduces the exact input bytes. The
 * body is emitted verbatim (line-ending/whitespace normalization happens on parse,
 * not here), so an empty or no-trailing-newline body is not silently padded.
 *
 * Serialization re-asserts the **same** {@link validateFrontmatter} the read path
 * runs (its warnings are irrelevant on write and are dropped), so lore can never
 * write bytes it would then refuse to parse back — a hand-built or edited Concept
 * with a missing/whitespace-padded/mistyped `type` or a mistyped known field throws a
 * `validation` {@link LoreError} here instead of producing an unreadable file. This is
 * exact write/read symmetry, not a weaker non-empty-`type` floor.
 */
export function serializeConcept(concept: Concept): string {
  validateFrontmatter(concept.frontmatter, { path: concept.path });
  const ordered = canonicalize(concept.frontmatter);
  return `${FENCE}${yaml.dump(ordered, YAML_DUMP_OPTIONS)}${FENCE}${concept.body}`;
}

/**
 * Normalize raw bytes to lore-canonical encoding before parsing: strip leading UTF-8
 * BOM(s), convert CRLF/CR line endings to LF, and drop any leading whitespace
 * (blank lines, spaces, tabs) before the opening fence. This makes a BOM-prefixed,
 * Windows-CRLF, or whitespace-padded concept *parse* (rather than be rejected as
 * "no frontmatter") and reach a fixpoint after one write.
 *
 * lore canonicalizes line endings to **LF** — the repo pins LF (`.gitattributes`), so
 * a CRLF/CR file is non-canonical and is rewritten to LF (frontmatter *and* body,
 * including line endings *inside* frontmatter values) on the first write, exactly as a
 * BOM is dropped; this is a deliberate one-time normalization, not incidental churn.
 * Multiple leading BOMs are all stripped (some Windows editors emit more than one —
 * the same case config.ts handles).
 */
function normalizeInput(raw: string): string {
  return raw
    .replace(/^\uFEFF+/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s+/, "");
}

/** A frontmatter split that yielded a usable mapping. */
interface PresentSplit {
  readonly present: true;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

/**
 * The outcome of splitting a normalized file: either a usable frontmatter mapping
 * ({@link PresentSplit}), or **absent** — the file is not a concept at all. `reason`
 * distinguishes the two absent shapes so {@link parseConcept} can raise the precise
 * diagnostic: `"non-mapping"` is a fence holding a bare scalar/list (e.g. a doc
 * that merely *opens* with a `---` thematic break), `"missing"` is no fence, an
 * empty fence, or a `null` fence.
 */
type FrontmatterSplit = PresentSplit | { readonly present: false; readonly reason: "non-mapping" | "missing" };

/**
 * Split normalized bytes into a frontmatter mapping + body via gray-matter.
 *
 * It **throws** a `validation` {@link LoreError} only for genuinely malformed YAML
 * inside a fence. The two *not-a-concept* shapes — a non-mapping fence (a bare
 * scalar/list, which is what a leading `---` thematic break parses to) and a
 * missing/empty/`null` fence — are returned as `present: false`, **not** thrown, so
 * a caller can decide: {@link parseConcept} turns them into the matching error,
 * while {@link tryParseConcept} skips the file. This is what keeps a stray
 * thematic-break doc from aborting a whole {@link loadBundle}.
 */
function splitFrontmatter(path: string, raw: string): FrontmatterSplit {
  let file: matter.GrayMatterFile<string>;
  try {
    file = matter(raw, MATTER_OPTIONS);
  } catch (cause) {
    throw new LoreError(
      "validation",
      `frontmatter in ${path} is not valid YAML: ${singleLine(deriveMessage(cause))}`,
      "fix the YAML syntax inside the --- frontmatter fences",
      { path },
    );
  }

  const data: unknown = file.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { present: false, reason: "non-mapping" };
  }
  if (Object.getOwnPropertyNames(data).length === 0) {
    // gray-matter maps a missing fence, an empty fence, AND a fence holding a bare
    // `null` all to `{}` — one "no usable frontmatter mapping" outcome.
    return { present: false, reason: "missing" };
  }
  return { present: true, frontmatter: data as Record<string, unknown>, body: file.content };
}

/**
 * The `validation` {@link LoreError} {@link parseConcept} raises when frontmatter
 * is absent — the strict-parse counterpart to {@link tryParseConcept} returning
 * `null`. The message matches the absent `reason` so the diagnostic points at the
 * real fix.
 */
function absentFrontmatterError(path: string, reason: "non-mapping" | "missing"): LoreError {
  if (reason === "non-mapping") {
    return new LoreError(
      "validation",
      `frontmatter in ${path} must be a YAML mapping`,
      "write frontmatter as `key: value` lines between the --- fences",
      { path },
    );
  }
  return new LoreError(
    "validation",
    `${path} has no usable frontmatter (it is missing, empty, or null); a concept file needs at least a \`type:\``,
    "add a frontmatter block, e.g. `---` then `type: Reference` then `---`",
    { path },
  );
}

/**
 * Reorder a frontmatter mapping into canonical emission order — {@link CANONICAL_KEY_ORDER}
 * first (those present, in order), then every remaining key in its existing order.
 *
 * The result is a **null-prototype** object so a literal `__proto__` data key (which
 * js-yaml stores as an own property, a tolerated OKF producer extension) is assigned
 * as an own property rather than hitting the prototype setter — no key is dropped
 * (ADR-0011 §5). This mirrors the `Object.create(null)` technique errors.ts uses for
 * the same prototype-pollution hazard; js-yaml dumps a null-prototype object the same
 * as a plain one. Reads are plain index access: an own `__proto__` *data* property
 * shadows the inherited accessor, so `frontmatter["__proto__"]` returns its value (no
 * descriptor read needed); the null-proto target is what makes the *write* side safe.
 */
function canonicalize(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = Object.create(null);
  for (const key of CANONICAL_KEY_ORDER) {
    if (Object.hasOwn(frontmatter, key)) {
      ordered[key] = frontmatter[key];
    }
  }
  for (const key of Object.getOwnPropertyNames(frontmatter)) {
    if (!Object.hasOwn(ordered, key)) {
      ordered[key] = frontmatter[key];
    }
  }
  return ordered;
}

/**
 * Derive a concept id from its path: the path minus a trailing `.md`, matched
 * **case-insensitively** so the same on-disk file yields one id whether referenced
 * as `Foo.md` or `Foo.MD` (a real divergence on case-insensitive filesystems).
 *
 * Exported as the single source of the path→id rule so the bundle layer
 * ({@link loadBundle}) strips the `.md` suffix the exact same way when resolving a
 * cross-link target to a concept id — the resolution must agree byte-for-byte with
 * how this module derived the id, or a valid link would dangle. The path is
 * POSIX-normalized first (`adr/./x.md` and `a/../adr/x.md` collapse to `adr/x`), so
 * a stored id and a link that resolves to it agree even when one side carries a
 * redundant `.`/`..` segment.
 */
export function idFromPath(path: string): string {
  const normalized = posix.normalize(path);
  return /\.md$/i.test(normalized) ? normalized.slice(0, -3) : normalized;
}
