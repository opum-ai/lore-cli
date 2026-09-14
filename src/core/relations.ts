/**
 * relations.ts — the typed authored-relationship vocabulary, in one place.
 *
 * Before [ADR-0021](../../docs/adr/0021-typed-authored-relationships-and-claim-state.md) a bundle
 * had exactly one way to record that one document depends on, contradicts, or competes with
 * another: an ordinary markdown cross-link, which reaches the graph as {@link
 * import("./bundle").EdgeKind} `"link"` alongside every "see also" aside. An argument written that
 * way is legible to a human reader and invisible to `lore graph`, `lore path` and `lore impact` —
 * the three commands anyone would use to ask what a change breaks.
 *
 * This module owns the vocabulary that fixes that, and owns it **alone** so it cannot be spelled
 * two ways. It declares:
 *
 * - {@link RELATION_KINDS} — the closed set a `relations[]` entry's `kind` may take;
 * - {@link PROOF_RELATION_KINDS} — the subset a proof-only view selects, which is the one thing a
 *   hand-written `--edge` list reliably gets wrong;
 * - {@link CLAIM_OUTCOMES}/{@link CLAIM_EVIDENCE_LEVELS} — the claim-state vocabularies, a third
 *   axis beside the OKF lifecycle and the task rollup [ADR-0019](../../docs/adr/0019-separate-okf-lifecycle-from-lore-task-progress.md) already
 *   separated;
 * - {@link readRelations} — the one reader every layer uses, so the graph, `lore check` and the
 *   rewrite engine agree on what a relation *is*.
 *
 * ### Why structure rather than more ref fields
 *
 * A flat `requires: [ids]` field would slot into `REF_FIELDS` for free and be rewritten by `lore
 * rename` without a line of new code. It cannot carry the two qualifiers that make a relation
 * precise — *which* statement, at *which* version — without encoding them inside the string, which
 * is the same opaque-metadata defect one layer down. So `relations` is a list of mappings, and the
 * rewrite engine is taught about `relations[].target` explicitly.
 *
 * ### The tolerance rule, applied uniformly
 *
 * **Structural shape is an error; vocabulary membership is a warning.** A `relations` that is not a
 * list, an entry that is not a mapping, or an entry with no `kind`/`target` is a malformed known
 * field and fails validation like any other. An unrecognised `kind` — or `claim_outcome`,
 * or `claim_evidence_level` — is reported by `lore check` and otherwise tolerated.
 *
 * The asymmetry is deliberate and is about who pays. A validation error fails `loadBundle`, so one
 * unrecognised word would brick every command against the whole bundle; and because these
 * vocabularies are lore-native and will grow, an older lore that *errored* on a value a newer lore
 * writes would make them impossible to extend without a flag day. Tolerating the value while naming
 * it is the only reading under which a bundle stays portable across versions.
 *
 * Tolerated is not silent: an unrecognised `kind` produces **no edge**, so the relation is visibly
 * absent from the graph rather than quietly reinterpreted as something else, and `lore check`
 * attributes it to its file.
 */

import { z } from "zod";

/**
 * The closed set of authored relationship kinds. Declaration order is the order they were named in
 * the finding that produced them, with `superseded_by` — the mirror of `supersedes` — last.
 *
 * `supersedes` and `superseded_by` are **not new**: they are lore's existing reserved coupling
 * fields, and a `relations[]` entry naming one is a second, more precise spelling of the same fact
 * rather than a rival to it. Both spellings produce the same edge kind, so a reader walking edges
 * never has to know which the author used, and `lore supersede` keeps writing the flat field.
 */
export const RELATION_KINDS = ["requires", "alternative", "refutes", "supersedes", "superseded_by"] as const;

/** One member of the closed {@link RELATION_KINDS} vocabulary. */
export type RelationKind = (typeof RELATION_KINDS)[number];

/**
 * The relation kinds a proof-only view selects: everything that bears on whether a claim stands.
 *
 * `alternative` is excluded **deliberately**, and it is exactly the member a hand-written `--edge`
 * list gets wrong — an alternative is a relationship *between* claims, not support *for* one.
 * Naming the set in one place instead of asking every caller to remember that is the whole value of
 * `--proof-only`.
 *
 * `superseded_by` is included although the finding named only four kinds. It is the same relation
 * authored from the other endpoint, and a view that honours one spelling but not its mirror reports
 * a different graph depending on which side of the pair the author happened to write on. That is a
 * defect, not a policy.
 */
export const PROOF_RELATION_KINDS = [
  "requires",
  "refutes",
  "supersedes",
  "superseded_by",
] as const satisfies readonly RelationKind[];

/**
 * What the document's claim currently amounts to. Deliberately **not** `proved`: lore validates the
 * syntax of a record and never the truth of one, and a vocabulary that says `proved` invites a
 * documentation tool to be quoted as a proof assistant.
 */
export const CLAIM_OUTCOMES = ["open", "supported", "refuted", "withdrawn"] as const;

/**
 * How strongly the claim is evidenced, weakest to strongest — the order is part of the vocabulary,
 * so a consumer can ask for "at least `argument`" rather than enumerating members.
 *
 * `checked` rather than `verified`, because `verified` is already an OKF 0.2 frontmatter key
 * carrying verification *events*; reusing the word as an enum value would collide with it.
 */
export const CLAIM_EVIDENCE_LEVELS = ["none", "assertion", "argument", "empirical", "checked"] as const;

/** The frontmatter key carrying the typed relationship list. */
export const RELATIONS_FIELD = "relations";
/** The frontmatter key carrying {@link CLAIM_OUTCOMES}. */
export const CLAIM_OUTCOME_FIELD = "claim_outcome";
/** The frontmatter key carrying {@link CLAIM_EVIDENCE_LEVELS}. */
export const CLAIM_EVIDENCE_LEVEL_FIELD = "claim_evidence_level";
/** The frontmatter key carrying the author-declared statement version. */
export const CLAIM_VERSION_FIELD = "claim_version";

/** Every reserved claim-state key, in canonical emission order. */
export const CLAIM_FIELDS = [CLAIM_OUTCOME_FIELD, CLAIM_EVIDENCE_LEVEL_FIELD, CLAIM_VERSION_FIELD] as const;

/** One authored relation, normalized: trimmed strings, absent qualifiers omitted rather than null. */
export interface AuthoredRelation {
  /** The relation's kind, already confirmed to be in {@link RELATION_KINDS}. */
  readonly kind: RelationKind;
  /** The concept reference as authored (trimmed) — an id or a relative path, resolved by the caller. */
  readonly target: string;
  /** The precise statement within the target this relation is about, when the author named one. */
  readonly statement?: string;
  /** The target's {@link CLAIM_VERSION_FIELD} the author relied on, when one was recorded. */
  readonly version?: string;
  /** This entry's zero-based position in the authored `relations` list, preserved for determinism. */
  readonly ordinal: number;
}

/** A `relations[]` entry whose `kind` is outside {@link RELATION_KINDS}: reported, never an edge. */
export interface UnknownRelationKind {
  /** The entry's zero-based position in the authored `relations` list. */
  readonly ordinal: number;
  /** The `kind` exactly as authored (trimmed), for the message that names it. */
  readonly kind: string;
  /** The entry's `target`, so a report can say which relation was dropped and not merely that one was. */
  readonly target: string;
}

/** What {@link readRelations} found: the usable relations, and the entries it could not classify. */
export interface AuthoredRelations {
  /** Every entry whose `kind` is recognized, in authored order. */
  readonly relations: readonly AuthoredRelation[];
  /** Every entry whose `kind` is not, in authored order. */
  readonly unknownKinds: readonly UnknownRelationKind[];
}

const NO_RELATIONS: AuthoredRelations = { relations: [], unknownKinds: [] };

/** Whether `value` names one of the closed {@link RELATION_KINDS}. */
export function isRelationKind(value: string): value is RelationKind {
  return (RELATION_KINDS as readonly string[]).includes(value);
}

/** Whether `value` names one of the {@link PROOF_RELATION_KINDS}. */
export function isProofRelationKind(value: string): boolean {
  return (PROOF_RELATION_KINDS as readonly string[]).includes(value);
}

/**
 * Read a concept's `relations` list into normalized {@link AuthoredRelation}s.
 *
 * Deliberately **tolerant of shape**, because this runs against two different inputs: frontmatter
 * that {@link import("./schema").validateFrontmatter} has already accepted (the graph), and raw
 * frontmatter that may never have been validated at all (`lore check` reads files directly, and
 * reports on bundles that do not load). A malformed entry is skipped here rather than thrown on —
 * the validator is where a malformed *shape* is reported, and duplicating the throw in the reader
 * would mean a file that fails validation could not even be described.
 *
 * `version` accepts a number as well as a string, because `version: 3` is what a YAML author writes
 * and quoting it is a papercut with no compensating benefit. It is normalized to its string form so
 * every downstream comparison is between strings and `3` never fails to equal `"3"`.
 */
export function readRelations(frontmatter: Record<string, unknown>): AuthoredRelations {
  const authored = frontmatter[RELATIONS_FIELD];
  if (!Array.isArray(authored)) {
    return NO_RELATIONS;
  }
  const relations: AuthoredRelation[] = [];
  const unknownKinds: UnknownRelationKind[] = [];
  authored.forEach((entry, ordinal) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return; // not a mapping — the validator's finding, not this reader's
    }
    const record = entry as Record<string, unknown>;
    const kind = text(record.kind);
    const target = text(record.target);
    if (kind === undefined || target === undefined) {
      return; // missing the two required keys — likewise the validator's finding
    }
    if (!isRelationKind(kind)) {
      unknownKinds.push({ ordinal, kind, target });
      return;
    }
    const statement = text(record.statement);
    const version = versionText(record.version);
    relations.push({
      kind,
      target,
      ...(statement !== undefined ? { statement } : {}),
      ...(version !== undefined ? { version } : {}),
      ordinal,
    });
  });
  return { relations, unknownKinds };
}

/** A concept's declared {@link CLAIM_VERSION_FIELD}, normalized to a string, or `undefined`. */
export function claimVersion(frontmatter: Record<string, unknown>): string | undefined {
  return versionText(frontmatter[CLAIM_VERSION_FIELD]);
}

/**
 * How a relation's recorded `version` stands against its target's current {@link
 * CLAIM_VERSION_FIELD}.
 *
 * All four states are distinct on purpose. Folding `unversioned` and `untracked` into `current`
 * would make the *absence* of a drift report ambiguous between "nothing drifted" and "nothing was
 * comparable" — a marker that cannot announce its own applicability, which is the same defect the
 * reporting exists to prevent. Precision here is opt-in, so most relations will legitimately be one
 * of the two "no comparison was possible" states, and saying so is the honest answer.
 */
export type RelationVersionState = "current" | "stale" | "unversioned" | "untracked";

/**
 * Classify one relation against its resolved target's frontmatter. A dangling relation has no
 * target to compare against and is `untracked` — the broken reference is its own, separate finding.
 */
export function relationVersionState(
  recorded: string | undefined,
  targetFrontmatter: Record<string, unknown> | undefined,
): RelationVersionState {
  if (recorded === undefined) return "unversioned";
  const current = targetFrontmatter === undefined ? undefined : claimVersion(targetFrontmatter);
  if (current === undefined) return "untracked";
  return current === recorded ? "current" : "stale";
}

/**
 * The runtime validator for the reserved `relations` field, used by the compiled profile.
 *
 * Structural only, per this module's tolerance rule: the list, its mappings, and the presence of
 * non-blank `kind`/`target` are enforced; membership of `kind` in {@link RELATION_KINDS} is not,
 * and is `lore check`'s finding instead. Loose per entry so a producer extension on a relation
 * survives round-tripping the way it does everywhere else in OKF.
 */
export function relationsValidator(): z.ZodType {
  return z
    .array(
      z.looseObject({
        kind: nonBlank(),
        target: nonBlank(),
        statement: nonBlank().nullish(),
        version: scalarValue().nullish(),
      }),
    )
    .nullish();
}

/**
 * The runtime validator for a reserved claim-state field. A non-blank scalar is required; the
 * vocabulary is not enforced here (see {@link relationsValidator} and this module's header).
 */
export function claimFieldValidator(): z.ZodType {
  return scalarValue().nullish();
}

function nonBlank(): z.ZodType {
  return z.string().regex(/\S/u);
}

function scalarValue(): z.ZodType {
  return z.union([nonBlank(), z.number()]);
}

/** A trimmed non-empty string, or `undefined` for anything else (including a blank one). */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** {@link text}, additionally accepting a finite number and normalizing it to its string form. */
function versionText(value: unknown): string | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  return text(value);
}
