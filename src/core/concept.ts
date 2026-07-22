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
 * - **Canonical key order on serialize.** Known keys are emitted in a fixed order (the active
 *   profile's {@link Profile.canonicalKeyOrder}, from [core/profile.ts](./profile.ts)); unknown
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
 * editor modeline (`# yaml-language-server: …`) is spliced in as the first line
 * *inside* the opening fence by {@link serializeConceptWithModeline} — the only
 * placement lore's own parser reads back as a concept (`parseConcept` needs `---` at
 * byte 0, so an above-fence comment makes the file a non-concept). The modeline text
 * itself is `schema.schemaModeline`'s concern (ADR-0006 §3).
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
 *   is unrecoverable here regardless of the profile's canonical key order.
 * - A large/high-precision unquoted *numeric* value loses precision (`js-yaml`'s
 *   `JSON_SCHEMA` parses numbers to JS doubles); quote such a value to keep it exact.
 */

import { posix } from "node:path";
import matter from "gray-matter";
import type { DumpOptions, LoadOptions } from "js-yaml";
import yaml from "js-yaml";
import { deriveMessage, LoreError, singleLine, type WarningCollector } from "../errors";
import { defaultProfile, type Profile } from "./profile";
import { validateFrontmatter } from "./schema";

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
 * - `sortKeys: false` — we control key order ourselves (the active profile's canonical key order).
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
 *
 * `assertBoundedYamlExpansion` runs on every parsed document before gray-matter ever
 * sees it — the single choke point every read path (`parseConcept`/`tryParseConcept`/
 * `tryReadFrontmatter`, all via {@link splitFrontmatter}) shares, so a malicious file is
 * rejected the moment it is first read, before any downstream consumer (validation, the
 * bundle graph, a later `serializeConcept` dump) can ever touch the dangerous object
 * (LORE-85). A thrown error here is caught and path-annotated by `splitFrontmatter`'s
 * existing `matter(...)` try/catch, exactly like a plain YAML syntax error already is —
 * no separate error-wrapping needed.
 */
const MATTER_OPTIONS = {
  engines: {
    yaml: {
      parse: (input: string): object => {
        const parsed = yaml.load(input, YAML_LOAD_OPTIONS) as object;
        assertBoundedYamlExpansion(parsed);
        return parsed;
      },
    },
  },
} as const;

/**
 * The budget {@link assertBoundedYamlExpansion} enforces, in "expanded units" (roughly
 * chars — see its own doc for the exact accounting). Frontmatter is metadata, never
 * prose (the body carries that) — real frontmatter is at most a few KB even for a
 * concept with a long tags/list field, so this leaves generous headroom (hundreds of
 * KB) while still aborting a doubling-anchor attack within a couple dozen levels,
 * almost instantly (LORE-85).
 */
const MAX_EXPANDED_YAML_UNITS = 100_000;

/**
 * Reject a parsed YAML document whose anchor/alias structure would expand to an
 * unreasonable size or contains a cycle, **before** anything downstream (validation,
 * canonicalization, a later `noRefs: true` {@link YAML_DUMP_OPTIONS} dump) ever walks it
 * naively and pays the cost.
 *
 * js-yaml's `load` never expands an alias (`*a`) — it points the SAME JS object
 * reference back at its anchor (`&a`), so parsing a doubling-anchor chain is always
 * fast regardless of depth (LORE-85's own repro: an 18-level, ~400-byte chain loads in
 * ~1ms). The danger is downstream: any code that walks the result treating shared
 * references as if they were distinct subtrees — exactly what `yaml.dump({noRefs:
 * true})` does, by design, so a re-serialize never emits `&`/`*` — re-visits each
 * shared subtree once per incoming reference, and a chain of `n` doubling levels
 * revisits the base subtree `2^n` times: ~400 bytes of source YAML can demand
 * megabytes-to-gigabytes of work.
 *
 * This walker performs the SAME kind of naive, reference-blind traversal (deliberately
 * NOT memoizing by object identity — a memoized walk would undercount the very
 * blowup a real `dump` would suffer), but tracks a running total and aborts the
 * instant it crosses {@link MAX_EXPANDED_YAML_UNITS} — since the total at least
 * doubles every level in an exponential attack, the walk itself never runs longer
 * than a small multiple of the budget, however deep the malicious chain goes.
 *
 * A **cycle** (an anchor referencing one of its own ancestors — legal under js-yaml's
 * `JSON_SCHEMA`, confirmed empirically: `a: &a {b: *a}` loads with `doc.a === doc.a.b`)
 * is a distinct, unbounded hazard a size budget alone cannot catch (an unmemoized walk
 * of a true cycle never terminates) — detected via a path-scoped ancestor set (added on
 * entering a node, removed on leaving it), which correctly tells a real cycle apart
 * from harmless DAG-style sharing (the same anchor reused by two unrelated siblings,
 * an ordinary and safe YAML pattern that must not be rejected).
 *
 * @throws Error when the budget is exceeded or a cycle is found; caught and
 *   path-annotated by {@link splitFrontmatter}'s surrounding `matter(...)` try/catch.
 */
function assertBoundedYamlExpansion(value: unknown): void {
  const ancestors = new Set<object>();
  let units = 0;

  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      units += node.length;
    } else if (typeof node !== "object" || node === null) {
      units += 1; // number, boolean, null — a fixed small cost
    } else {
      if (ancestors.has(node)) {
        throw new Error("frontmatter contains a cyclic YAML anchor (an anchor referencing one of its own ancestors)");
      }
      ancestors.add(node);
      if (Array.isArray(node)) {
        units += 1;
        for (const item of node) {
          walk(item);
        }
      } else {
        units += 1;
        for (const [key, val] of Object.entries(node)) {
          units += key.length;
          walk(val);
        }
      }
      ancestors.delete(node);
    }
    if (units > MAX_EXPANDED_YAML_UNITS) {
      throw new Error(
        `frontmatter's YAML anchors/aliases would expand to over ${MAX_EXPANDED_YAML_UNITS.toLocaleString()} characters when fully resolved — refusing rather than risk unbounded memory/CPU use`,
      );
    }
  };
  walk(value);
}

/** Options for {@link parseConcept}. */
export interface ParseConceptOptions {
  /** Sink for advisory warnings (unknown type, extra keys, summary); absent → dropped. */
  warnings?: WarningCollector;
  /** The active profile to validate against; defaults to the built-in {@link defaultProfile}. */
  profile?: Profile;
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
 * Best-effort read of a file's frontmatter **mapping alone**, without validating it against any
 * profile schema — deliberately narrower than {@link tryParseConcept} (which always validates), but
 * NOT more tolerant of a genuine parse failure: like {@link tryParseConcept}, this returns `null` for
 * a file with no usable frontmatter mapping (nothing to skip), but still **throws** when the YAML
 * itself is unparseable — there is no mapping to safely hand back in that case, so a caller cannot
 * treat "unparseable" and "absent" as the same outcome (an unparseable file could easily have
 * declared `tasks:`; there is no way to know, so it must not be assumed innocent).
 *
 * For a caller that needs to know a FACT about a file's frontmatter (e.g. does it declare `tasks:`?)
 * without committing to full schema validation succeeding: `lore check`'s reconciliation-eligibility
 * scan (LORE-27) uses this to recognize a concept that fails the lore profile but still links a
 * Backlog task as reconciliation-relevant (and so re-throw the original error loud, matching what
 * `lore sync` would do for the identical file) — rather than silently treating it as if it never
 * existed, which it does for every OTHER malformed file with no such bearing. When the YAML itself
 * is unparseable, this function's own throw propagates the same way, which is the conservative,
 * correct default for that case.
 *
 * @throws LoreError `validation` — {@link splitFrontmatter}'s own contract — for unparseable YAML.
 */
export function tryReadFrontmatter(path: string, raw: string): Record<string, unknown> | null {
  const split = splitFrontmatter(path, normalizeInput(raw));
  return split.present ? split.frontmatter : null;
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
  const type = validateFrontmatter(split.frontmatter, { warnings: options.warnings, path, profile: options.profile });
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
export function serializeConcept(concept: Concept, options: SerializeConceptOptions = {}): string {
  const profile = options.profile ?? defaultProfile();
  validateFrontmatter(concept.frontmatter, { path: concept.path, profile });
  const ordered = canonicalize(concept.frontmatter, profile.canonicalKeyOrder);
  return `${FENCE}${yaml.dump(ordered, YAML_DUMP_OPTIONS)}${FENCE}${concept.body}`;
}

/** Options for {@link serializeConcept}/{@link serializeConceptWithModeline}. */
export interface SerializeConceptOptions {
  /**
   * The active profile, supplying the canonical key order (ADR-0011 append-slot = profile field
   * declaration order) and the validators re-asserted on write. Defaults to the built-in
   * {@link defaultProfile}, so a caller that does not opt into a custom profile is unaffected.
   */
  profile?: Profile;
}

/**
 * Serialize a {@link Concept} and splice an editor modeline (a `# yaml-language-server:`
 * comment, produced by `schema.schemaModeline`) in as the **first line inside** the
 * opening `---` fence. The single home for that placement, so every command that emits a
 * modeline-bearing doc (`lore init`, and `lore new` next) shares one implementation
 * instead of re-deriving the splice.
 *
 * Inside-fence is the only placement lore's own parser reads back as a concept
 * ({@link parseConcept} requires `---` at byte 0, so an above-fence comment would make
 * the file a non-concept). The splice slices off {@link serializeConcept}'s known `---\n`
 * opening fence and re-prepends it with the modeline — operating on that fixed prefix,
 * never a content search, so a `---\n` occurring later in a value or the body can never
 * be targeted.
 *
 * Round-trip caveat (ADR-0011 §2): js-yaml drops the in-fence comment if the file is
 * ever re-serialized, so a doc written this way is emitted once, not rewritten in place.
 */
export function serializeConceptWithModeline(
  concept: Concept,
  modeline: string,
  options: SerializeConceptOptions = {},
): string {
  const serialized = serializeConcept(concept, options);
  return `${FENCE}${modeline}\n${serialized.slice(FENCE.length)}`;
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
export function normalizeInput(raw: string): string {
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
 * Guard against gray-matter's loose closing-delimiter search (LORE-141):
 * `lib/index.js` locates the close with `str.indexOf('\n' + '---')`, a plain
 * substring search that matches the FIRST four characters of a longer run (e.g. a
 * closing fence hand-authored as `----`, or one with any other trailing junk like
 * `---x`) and then slices off only those four characters — leaking the rest of
 * that malformed delimiter line into `file.content` (the parsed body) as silent
 * corruption instead of a parse error.
 *
 * This recomputes, independently of gray-matter's internals, the exact byte index
 * in `raw` immediately after the delimiter gray-matter matched (`file.matter`'s
 * length tells us where that match starts: gray-matter strips exactly the 3-byte
 * open delimiter — `"---".length` — before searching, and never touches `raw`
 * itself), and returns whether the very next byte is a newline or end-of-file (a
 * clean fence line) or something else (a malformed one).
 *
 * Only called when `raw` starts with the exact bare fence lore itself ever emits
 * ({@link FENCE}, `"---\n"` — see the caller), which rules out gray-matter's
 * language-tag feature ever having consumed extra bytes after the open delimiter
 * (a tag needs a non-newline character right after the dashes; `FENCE` guarantees
 * a newline is there instead) — so the recomputed offset always lines up with
 * gray-matter's own, and this only ever tightens an already bare-fenced, plain-YAML
 * document; it never changes whether a fence is considered present in the first
 * place.
 *
 * When gray-matter's search found no closing delimiter at all (an unterminated
 * fence — pre-existing, untouched behavior: the whole rest of the file becomes
 * frontmatter with an empty body), the recomputed offset lands past the end of
 * `raw`; `String.charAt` returns `""` for any out-of-range index, which this
 * treats as clean — so that pre-existing case is deliberately left alone.
 */
function closingFenceIsClean(raw: string, file: matter.GrayMatterFile<string>): boolean {
  const openDelimiterLength = 3; // "---", not counting the newline FENCE also guarantees follows it
  const closeDelimiterStart = openDelimiterLength + file.matter.length; // index of the `\n` starting `\n---`, in raw
  const afterCloseDelimiter = closeDelimiterStart + "\n---".length;
  const next = raw.charAt(afterCloseDelimiter);
  return next === "" || next === "\n";
}

/**
 * Split normalized bytes into a frontmatter mapping + body via gray-matter.
 *
 * It **throws** a `validation` {@link LoreError} for genuinely malformed YAML
 * inside a fence, or for a malformed *closing* fence ({@link closingFenceIsClean},
 * LORE-141). The two *not-a-concept* shapes — a non-mapping fence (a bare
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

  if (raw.startsWith(FENCE) && !closingFenceIsClean(raw, file)) {
    throw new LoreError(
      "validation",
      `frontmatter in ${path} has a malformed closing fence (extra characters after the closing ---)`,
      "close the frontmatter with a line containing exactly `---` and nothing else",
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
 * Reorder a frontmatter mapping into canonical emission order — the profile's
 * {@link Profile.canonicalKeyOrder} first (those present, in order), then every remaining key in
 * its existing order. The order is the active profile's field-declaration order (ADR-0011
 * append-slot), so a custom profile drives where its own fields sit; unknown producer keys always
 * trail verbatim.
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
function canonicalize(frontmatter: Record<string, unknown>, keyOrder: readonly string[]): Record<string, unknown> {
  const ordered: Record<string, unknown> = Object.create(null);
  for (const key of keyOrder) {
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
