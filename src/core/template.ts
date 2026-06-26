/**
 * template.ts — the **pure** rendering core behind `lore new`.
 *
 * Where `commands/new.ts` is the thin side-effecting layer (read the template file, write
 * the result), this module computes — with no filesystem access — the exact bytes a new
 * concept file should contain, and is the reason `lore new`'s output validates **by
 * construction** ([ADR-0006](../../docs/adr/0006-schema-types-templates.md) §6; LORE-18 AC#1).
 *
 * The split that makes that guarantee hold (cli-surface §new: "valid OKF frontmatter **and**
 * the per-type required sections; the **body** is rendered from `.lore/templates/<type>.md`"):
 *
 * - **lore owns the frontmatter.** {@link buildNewConcept} builds the frontmatter mapping
 *   *structurally* from typed inputs (type/title/summary/timestamp/tags) and serializes it
 *   through the byte-stable concept boundary, so js-yaml quotes whatever needs quoting — a
 *   title or summary containing `:`, `#`, or a leading `-` can never corrupt the YAML the way
 *   raw string substitution into a `key: {{value}}` line would.
 * - **the template owns the body.** A template is body-only markdown with `{{placeholders}}`;
 *   {@link renderTemplate} fills the auto tokens (`{{title}}`/`{{type}}`/`{{timestamp}}`/
 *   `{{summary}}`) plus any `--var`, and *reports* an unfilled token rather than leaving a
 *   literal `{{…}}` in the file, so a missing value fails loud (exit `6`).
 *
 * The {@link BUILTIN_TEMPLATES} carry each known type's conventional section skeleton; a user
 * template under `.lore/templates/` overrides the built-in body wholesale (AC#2) — that
 * filesystem resolution is the command's concern, not this module's.
 */

import { posix } from "node:path";
import { LoreError, WarningCollector } from "../errors";
import { type Concept, idFromPath, serializeConcept, serializeConceptWithModeline } from "./concept";
import { defaultProfile, type Profile, slugForTypeName } from "./profile";
import { validateFrontmatter } from "./schema";

/**
 * Derive a filename slug from a concept title — the LOWER-KEBAB transform {@link slugForTypeName}
 * applies to type names (`"Bulk Archive Orders!"` → `"bulk-archive-orders"`). The result is the last
 * path segment of the new doc's id, so it uses the `[a-z0-9-]` alphabet a portable bundle path
 * needs. A title with no alphanumeric content yields `""`; the caller treats that as "cannot derive
 * a path, pass `--out`" rather than writing a `-.md` file. Aliased to the canonical slug algorithm
 * so a title and a type name can never slug two different ways.
 */
export const slugify = slugForTypeName;

/**
 * The OKF `resource` link value for a concept at `docPath` under `resourceBase` (LORE-47 / AC#4) —
 * the canonical published location a reader follows, joined producer-side from two parts:
 *
 * - **`resourceBase`** is the configured prefix verbatim (`[profile].resource_base`), with any
 *   trailing slash(es) trimmed so the join contributes exactly one. It is *not* re-encoded: it is
 *   a user-authored URL that may legitimately carry a scheme, host, and its own path separators.
 * - **`docPath`** is the doc's repo-relative POSIX path (e.g. `docs/stories/bulk-archive.md`),
 *   appended with each segment `encodeURIComponent`-encoded so a title-derived slug stays
 *   byte-identical (the `-` `_` `.` set is preserved) while a space- or non-ASCII-bearing `--out`
 *   path is percent-escaped into a valid URL. The `/` separators and the `.md` suffix are kept.
 *
 * Pure and total: the result is `<base-without-trailing-slash>/<encoded-doc-path>`, always exactly
 * one slash at the seam. The caller decides *whether* to stamp ({@link stampResource}); this only
 * computes the value.
 */
export function resourceFor(resourceBase: string, docPath: string): string {
  const base = resourceBase.replace(/\/+$/, "");
  const encodedPath = docPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encodedPath}`;
}

/** The `{{ key }}` token grammar: a name of word chars, dots, and dashes, with optional inner padding. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/** The outcome of {@link renderTemplate}: the filled text and any placeholders no value covered. */
export interface RenderResult {
  /** The template with every resolved `{{key}}` substituted; unresolved tokens are left verbatim. */
  text: string;
  /** Distinct placeholder names that had no value in `vars`, in first-seen order. */
  unresolved: string[];
}

/**
 * Substitute every `{{key}}` in `template` with `vars[key]`, reporting the names that had
 * no value rather than silently dropping or blanking them. Membership is tested with
 * {@link Object.hasOwn}, so a key present with an empty-string value resolves to `""`
 * (intentional) while a key that is merely inherited (or absent) is reported unresolved —
 * the caller turns a non-empty {@link RenderResult.unresolved} into a fail-loud error so a
 * literal `{{…}}` never reaches a written file.
 */
export function renderTemplate(template: string, vars: Record<string, string>): RenderResult {
  const unresolved: string[] = [];
  const seen = new Set<string>();
  const text = template.replace(PLACEHOLDER, (match: string, key: string) => {
    if (Object.hasOwn(vars, key)) {
      return vars[key] as string;
    }
    if (!seen.has(key)) {
      seen.add(key);
      unresolved.push(key);
    }
    return match;
  });
  return { text, unresolved };
}

/** The inputs {@link buildNewConcept} turns into final concept bytes. */
export interface BuildNewConceptInput {
  /** The new doc's repo-relative POSIX path — used for the id, diagnostics, and the modeline depth. */
  docPath: string;
  /** The concept `type` (canonical for a known type, verbatim for a producer extension). */
  type: string;
  /** The title — set on `title:` and available as `{{title}}` in the body. */
  title: string;
  /** The one-line summary — set on `summary:` and available as `{{summary}}` in the body. */
  summary: string;
  /** The ISO-8601 creation timestamp — set on `timestamp:` and available as `{{timestamp}}`. */
  timestamp: string;
  /** Optional `--tags` list, set on `tags:` as a YAML sequence (built structurally, never substituted). */
  tags?: readonly string[];
  /** The resolved **body** template (a user template, or a {@link builtinTemplateFor} fallback). */
  bodyTemplate: string;
  /** Extra `--var` placeholder values for the body (the auto tokens are added and take precedence). */
  vars: Record<string, string>;
  /**
   * The editor modeline to splice inside the fence, or absent for none. The command decides: a
   * known type whose exported schema actually exists on disk gets one; an unknown type, or a
   * doc written outside an initialized bundle, gets none rather than a modeline pointing at a
   * schema file that is not there.
   */
  modeline?: string;
  /** The active profile to validate/serialize against; defaults to the built-in {@link defaultProfile}. */
  profile?: Profile;
}

/** The result of {@link buildNewConcept}: the bytes to write and any advisory warnings raised on validation. */
export interface BuildNewConceptResult {
  /** The exact bytes to write — frontmatter (+ editor modeline for a known type) + rendered body. */
  contents: string;
  /** The resolved (trimmed, non-empty) `type` of the concept, for the command to report. */
  type: string;
  /** Advisory warnings from validating the frontmatter (unknown type, …). */
  warnings: readonly string[];
}

/**
 * Build the final concept bytes from typed inputs and a body template.
 *
 * The body is rendered first ({@link renderTemplate}); an unfilled `{{placeholder}}` is a
 * fail-loud `validation` {@link LoreError} (exit `6`, matching cli-surface §new "template
 * missing required `{{var}}`") so no `{{…}}` is ever written. The auto tokens
 * (`type`/`title`/`timestamp`/`summary`) are layered over any `--var` and **win**, so the
 * positional title/type and resolved summary are authoritative.
 *
 * The frontmatter is assembled **structurally** — never by substituting into YAML text — so
 * it is valid by construction regardless of what characters the title/summary/tags contain.
 * It is validated ({@link validateFrontmatter}: a known type yields a clean concept; an
 * unknown type warns and is tolerated) and serialized through the byte-stable concept
 * boundary, with the caller-supplied editor modeline spliced inside the fence when present
 * ({@link serializeConceptWithModeline}), else no modeline. A `--var` that shadows an auto
 * token is reported as an advisory warning rather than silently dropped.
 */
export function buildNewConcept(input: BuildNewConceptInput): BuildNewConceptResult {
  const warnings = new WarningCollector();
  warnShadowedVars(input.vars, input.docPath, warnings);
  const body = renderBody(input);

  const frontmatter: Record<string, unknown> = {
    type: input.type,
    title: input.title,
    summary: input.summary,
    timestamp: input.timestamp,
  };
  if (input.tags && input.tags.length > 0) {
    frontmatter.tags = [...input.tags];
  }

  const profile = input.profile ?? defaultProfile();
  stampResource(frontmatter, input.docPath, profile.resourceBase);
  const resolvedType = validateFrontmatter(frontmatter, { warnings, path: input.docPath, profile });
  const concept: Concept = {
    id: idFromPath(input.docPath),
    path: input.docPath,
    type: resolvedType,
    frontmatter,
    body,
  };

  const contents =
    input.modeline !== undefined
      ? serializeConceptWithModeline(concept, input.modeline, { profile })
      : serializeConcept(concept, { profile });
  return { contents, type: resolvedType, warnings: warnings.list() };
}

/**
 * Stamp the OKF `resource` key onto `frontmatter` when the profile opts in (LORE-47 / AC#4),
 * mutating in place to slot it alongside the other built structural keys. Two guards gate it,
 * so the zero-config default is **byte-identical to before the key existed**:
 *
 * - **`resourceBase` empty** (the default) → omit. A project that sets no `[profile].resource_base`
 *   gets no `resource` line at all.
 * - **the doc is an index** (`index.md`, root or sub-index) → omit. Index/sub-index files are
 *   bundle-structure pages lore generates, not authored concepts a reader cites; a `resource`
 *   link on them would point a reader at scaffolding. The basename test covers `docs/index.md`
 *   and every `docs/<dir>/index.md` in one rule.
 *
 * The value is {@link resourceFor}; `concept.ts` emits it as a recognized non-profile key
 * (trailing the profile's declared fields, in the canonical order), and `schema.ts` lists it in
 * `OKF_RESERVED_KEYS` so it never trips the extra-key warning.
 */
function stampResource(frontmatter: Record<string, unknown>, docPath: string, resourceBase: string): void {
  if (resourceBase === "" || posix.basename(docPath) === "index.md") {
    return;
  }
  frontmatter.resource = resourceFor(resourceBase, docPath);
}

/** The placeholder names lore fills automatically; a `--var` for one of these is ignored (it would be overridden). */
const AUTO_TOKENS = ["type", "title", "timestamp", "summary"] as const;

/** Warn for each `--var` whose key shadows an auto token, so a discarded override is visible rather than silent. */
function warnShadowedVars(vars: Record<string, string>, path: string, warnings: WarningCollector): void {
  for (const token of AUTO_TOKENS) {
    if (Object.hasOwn(vars, token)) {
      warnings.add(`ignoring --var ${token} in ${path}; \`${token}\` is set automatically by \`lore new\``);
    }
  }
}

/** Render the body template with the auto tokens layered over `--var` (autos win), failing loud on any unfilled token. */
function renderBody(input: BuildNewConceptInput): string {
  const vars: Record<string, string> = Object.create(null);
  for (const key of Object.keys(input.vars)) {
    vars[key] = input.vars[key] as string;
  }
  vars.type = input.type;
  vars.title = input.title;
  vars.timestamp = input.timestamp;
  vars.summary = input.summary;

  const rendered = renderTemplate(input.bodyTemplate, vars);
  if (rendered.unresolved.length > 0) {
    const tokens = rendered.unresolved.map((key) => `{{${key}}}`).join(", ");
    throw new LoreError(
      "validation",
      `template for ${input.docPath} has unfilled placeholder(s): ${tokens}`,
      "supply each missing value with `--var key=value`",
      { path: input.docPath, placeholders: [...rendered.unresolved] },
    );
  }
  return rendered.text;
}

/**
 * The built-in **body** template for `type`: the matching {@link BUILTIN_TEMPLATES} entry for
 * a known type, else the lenient {@link GENERIC_TEMPLATE} for a tolerated producer-extension
 * type (cli-surface §new accepts unknown types). Always returns a usable body, so `lore new`
 * has a fallback for every type when no user template is present.
 */
export function builtinTemplateFor(type: string): string {
  return Object.hasOwn(BUILTIN_TEMPLATES, type) ? (BUILTIN_TEMPLATES[type] as string) : GENERIC_TEMPLATE;
}

// ── Built-in body templates ──────────────────────────────────────────────────────
//
// Each is the markdown **body** (everything after the frontmatter fence) for a type, using
// only the auto-filled tokens so `lore new <type> "<title>"` with no flags renders cleanly.
// Each leads with a blank line (the body begins right after the closing `---\n`, so the
// leading newline gives the heading its own line) and carries the type's conventional
// section skeleton. lore builds the frontmatter and splices the editor modeline itself —
// templates contain neither.

/** Reference: a documentation page — intro plus a place for detail. */
const REFERENCE_TEMPLATE = `
# {{title}}

Describe the subject of this reference here.

## Details
`;

/** Spec: a design/requirements document with the usual sections. */
const SPEC_TEMPLATE = `
# {{title}}

## Summary

## Requirements

## Design

## Open questions
`;

/** ADR: an architecture decision record, starting in the Proposed state. */
const ADR_TEMPLATE = `
# {{title}}

## Status

Proposed

## Context

## Decision

## Consequences
`;

/** Runbook: an operational procedure with prerequisites, steps, and rollback. */
const RUNBOOK_TEMPLATE = `
# {{title}}

## Purpose

## Prerequisites

## Steps

## Rollback
`;

/** Epic: a body of work that groups stories. */
const EPIC_TEMPLATE = `
# {{title}}

## Goal

## Scope

## Stories
`;

/** Story: a unit of deliverable work with acceptance criteria. */
const STORY_TEMPLATE = `
# {{title}}

## Goal

## Acceptance criteria

## Notes
`;

/**
 * The built-in body template content lore ships for the six story-convention types — the
 * zero-config fallback when no `.lore/templates/<type>.md` is present. Keyed by canonical type
 * name (a plain string map, **independent of the active profile**): a custom-profile type lore
 * ships no body for falls back to {@link GENERIC_TEMPLATE}, and the project supplies its own
 * template file. Decoupling this from the profile is why {@link builtinTemplateFor} tests
 * membership here rather than asking whether the type is profile-known.
 */
const BUILTIN_TEMPLATES: Readonly<Record<string, string>> = Object.freeze({
  Reference: REFERENCE_TEMPLATE,
  Spec: SPEC_TEMPLATE,
  ADR: ADR_TEMPLATE,
  Runbook: RUNBOOK_TEMPLATE,
  Epic: EPIC_TEMPLATE,
  Story: STORY_TEMPLATE,
});

/**
 * The fallback body for an **unknown** (producer-extension) type — the lenient shape OKF
 * tolerates (cli-surface §new). lore validates the concept against the unknown-type floor (a
 * non-empty `type`) and writes it without an editor modeline (no schema exists for it).
 */
const GENERIC_TEMPLATE = `
# {{title}}

Describe this {{type}} here.
`;
