/**
 * type-rules.ts — per-type document rules the declarative profile cannot express (LCLI-595).
 *
 * The profile grammar (profile.ts) declares a type's fields, their kinds, and its required `##`
 * sections, and deliberately nothing else: no patterns, no cross-field comparisons, no rules about
 * what a section must contain, and no cardinality. OPAG-425's Constitution type needs all four, so
 * they live here as a small registry keyed by **canonical type name**, with one entry per built-in
 * type that has such rules. Each entry carries three optional facets:
 *
 * - `check` — content rules over one document's parsed frontmatter and body. Run by BOTH
 *   `lore validate` ({@link import("./validate").validateConceptText}) and `lore check` (the second
 *   call site beside its per-file type peek, `commands/check.ts`), so the two gates can never
 *   disagree about a document of this type (OPAG-425 R3; ADR-0007).
 * - `singleton` — at most one document of this type per bundle (R2). Bundle-scoped, so only
 *   `lore check` can judge it: `lore validate` is per-file and stateless by design (ADR-0007).
 * - `seed` — the frontmatter values and body `{{vars}}` `lore new` supplies for this type, so the
 *   document it writes satisfies `check` by construction (R9).
 * - `bundle` — rules that need more than the one document (LCLI-596): the links INTO it from the
 *   rest of the bundle, and repository files it names. Only `lore check` runs it, for the same
 *   ADR-0007 reason as `singleton`. It stays pure: the command layer hands it the inbound links and
 *   an injected `readSource`, and it returns findings plus counts of what it read, which
 *   `check.report` prints beside its findings (`readCounts`).
 *
 * Registering a new type is one {@link TYPE_RULES} entry; neither call site names a type.
 * Constitution (LCLI-595) and Constants (LCLI-596) are the two registered today.
 *
 * Rules apply only when the active profile's declaration of the type IS lore's built-in one
 * ({@link typeRuleFor}). A custom `.lore/profile.toml` replaces the built-in vocabulary wholesale
 * (profile.ts): if it omits Constitution, a `type: Constitution` document is an ordinary unknown
 * producer extension; if it declares its OWN Constitution, that declaration keeps exactly the
 * fields and sections it states and none of these rules (OPAG-425 review finding 2, ruling A).
 *
 * Pure: no filesystem, no clock (a seed takes the caller's injected timestamp).
 */

import GithubSlugger, { slug as githubSlug } from "github-slugger";
import * as yaml from "js-yaml";
import type { Heading, Nodes, Root, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { nodeText, walkMdast } from "./bundle";
import type { Finding } from "./finding";
import { CONSTANTS_TYPE, CONSTITUTION_TYPE, type CompiledType, isBuiltinTypeDeclaration } from "./profile";

/** The rule every content finding carries, in both `validate.report` and `check.report`. */
export const TYPE_SHAPE_RULE = "type-shape";
/** The rule a second document of a singleton type carries in `check.report`. */
export const SINGLETON_RULE = "singleton-type";

/** One content finding from a type's rules, before a caller attributes it to a file. */
export type TypeShapeFinding = Finding<typeof TYPE_SHAPE_RULE>;

/** What `lore new` supplies for a type: frontmatter values and body template variables. */
export interface TypeSeed {
  /** Frontmatter values added beside the ones `lore new` always writes (type/title/summary/provenance). */
  readonly frontmatter: Readonly<Record<string, string>>;
  /** Body `{{placeholders}}` the type's built-in template uses, filled like the auto tokens. */
  readonly vars: Readonly<Record<string, string>>;
}

/** One registered type's rules. */
export interface TypeRule {
  /** The canonical type name this entry applies to. */
  readonly type: string;
  /** At most one document of this type per bundle (`lore check` only). */
  readonly singleton: boolean;
  /** Content rules over one document; each finding is attributed to it by the caller. */
  readonly check: (frontmatter: Readonly<Record<string, unknown>>, body: string) => TypeShapeFinding[];
  /** Values `lore new` seeds for this type, from the caller's injected ISO-8601 timestamp. */
  readonly seed?: (timestamp: string) => TypeSeed;
  /** Bundle-scoped rules over one document of this type (`lore check` only); see {@link TypeBundleContext}. */
  readonly bundle?: (context: TypeBundleContext) => TypeBundleResult;
}

/** The rule an entry whose `source_of_truth` disagrees with it, or cannot be read, carries. */
export const SOURCE_OF_TRUTH_RULE = "source-of-truth";
/**
 * The rule a link citing a deprecated OR retired entry carries (a warning; its message names which).
 * One rule for both, so a consumer already filtering on it sees retired citations too.
 */
export const DEPRECATED_REFERENCE_RULE = "deprecated-reference";
/** The positive control: a document of an entry-reading type from which no entry was read. */
export const ZERO_ENTRIES_RULE = "zero-entries-read";

/** Every rule a {@link TypeRule.bundle} facet can raise. */
export type TypeBundleRuleName =
  | typeof SOURCE_OF_TRUTH_RULE
  | typeof DEPRECATED_REFERENCE_RULE
  | typeof ZERO_ENTRIES_RULE;

/** A link from a bundle file into the document under judgement. */
export interface InboundLink {
  /** The citing file, bundle-root-relative (the document itself for an in-page `#anchor`). */
  readonly file: string;
  /** The link's `#fragment`, percent-decoded; `""` for a link to the document as a whole. */
  readonly fragment: string;
}

/** One repository file's text as the command layer read it, or why it could not be read. */
export type SourceRead = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string };

/** Everything a {@link TypeRule.bundle} facet may consult. No filesystem: `readSource` is injected. */
export interface TypeBundleContext {
  /** The document's bundle-root-relative path; a finding about the document itself carries it. */
  readonly file: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
  /** Every link in the bundle that resolves to this document, in bundle file order. */
  readonly inboundLinks: readonly InboundLink[];
  /** Read a REPOSITORY-relative file. Only ever called with a path {@link isRepoRelativePath} accepts. */
  readonly readSource: (path: string) => SourceRead;
}

/** One bundle-scoped finding, attributed to the file that carries it (the document, or a citing file). */
export type TypeBundleFinding = Finding<TypeBundleRuleName> & { readonly file: string };

/** A {@link TypeRule.bundle} facet's result: its findings, and how much it read (reported, never gating). */
export interface TypeBundleResult {
  readonly findings: readonly TypeBundleFinding[];
  /** Named counts of what was read, e.g. `{ entries: 3, references: 2 }`; summed per type across bundles. */
  readonly counts: Readonly<Record<string, number>>;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────—

/** SemVer 2.0.0, the regular expression semver.org publishes (no leading `v`). */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** A real UTC calendar date in `YYYY-MM-DD` form, not merely date-shaped (`2026-02-30` fails). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Unresolved template placeholders, two forms:
 *
 * - lore's own `{{name}}` token, anywhere it can hide: prose, link and image URLs and titles,
 *   and frontmatter strings.
 * - the `[UPPER_SNAKE]` bracket token of Spec Kit's constitution template (the reference
 *   OPAG-425's research names), which a constitution copied from it carries until filled in —
 *   `[PROJECT_NAME]`, `[PRINCIPLE_1_NAME]`, `[LAST_AMENDED_DATE]`. The rule, chosen so a citation
 *   or link reference never matches: two or more `_`-joined upper-case segments whose FIRST and
 *   LAST segments are letters only (a middle segment may be digits), not followed by `[` or `(`.
 *   So `[RFC_2119]` and `[ISO_8601]` (a trailing number is a citation) and `[RFC2119]` (no
 *   underscore) do not match, and neither does an unresolved reference link such as
 *   `[FOO_BAR][]`. A RESOLVED reference (`[FOO_BAR]` with a `[FOO_BAR]: <url>` definition) never
 *   reaches this scan at all: the parser turns it into a link whose text has no brackets.
 */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [/\{\{[^{}]*\}\}/g, /\[[A-Z]+(?:_(?:[A-Z]+|\d+))*_[A-Z]+\](?![[(])/g];

/** Every distinct placeholder token in `text`, in first-seen order. */
function placeholdersIn(text: string): string[] {
  const found: string[] = [];
  for (const pattern of PLACEHOLDER_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (!found.includes(match[0])) {
        found.push(match[0]);
      }
    }
  }
  return found;
}

/** Every string in a frontmatter value, through lists and mappings (explicit stack, no recursion). */
function frontmatterStrings(value: unknown): string[] {
  const strings: string[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === "string") {
      strings.push(current);
    } else if (Array.isArray(current)) {
      stack.push(...current);
    } else if (current !== null && typeof current === "object") {
      stack.push(...Object.values(current));
    }
  }
  return strings;
}

/**
 * Depth-first pre-order walk over `roots` in document order that neither visits nor descends
 * into a node `skip` accepts. An **explicit stack**, like {@link import("./bundle").walkMdast}
 * (which cannot skip a subtree): a body of tens of thousands of nested blockquotes parses fine
 * and must not overflow the call stack here either.
 */
function walkSkipping(roots: readonly Nodes[], skip: (node: Nodes) => boolean, visit: (node: Nodes) => void): void {
  const stack: Nodes[] = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop() as Nodes;
    if (skip(node)) {
      continue;
    }
    visit(node);
    if ("children" in node) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i] as Nodes);
      }
    }
  }
}

/**
 * Not prose: code blocks, code spans and raw HTML (comments included). A document can quote
 * `{{name}}`, `MUST` or `Rationale:` in backticks while explaining the rules without that counting
 * as a placeholder, a normative keyword, or a label.
 */
function isNotProse(node: Nodes): boolean {
  return node.type === "code" || node.type === "inlineCode" || node.type === "html";
}

/** The prose text under `nodes`: every `text` node outside {@link isNotProse} subtrees, newline-joined. */
function proseText(nodes: readonly Nodes[]): string {
  const parts: string[] = [];
  walkSkipping(nodes, isNotProse, (node) => {
    if (node.type === "text") {
      parts.push(node.value);
    }
  });
  return parts.join("\n");
}

/** Every link, image and definition URL and title under `nodes` — a placeholder can hide in a URL. */
function linkTargets(nodes: readonly Nodes[]): string[] {
  const targets: string[] = [];
  walkSkipping(nodes, isNotProse, (node) => {
    if (node.type === "link" || node.type === "image" || node.type === "definition") {
      targets.push(node.url, node.title ?? "");
    }
  });
  return targets;
}

/** Stands in for a code span in {@link paragraphLines}: content (so `Check: \`ci\`` has a body), never a label. */
const CODE_SPAN = "￼";

/** Heading text normalized the way required-section matching does (validate.ts). */
function normalizeHeading(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** One top-level `##` section: its heading and the root children up to the next `#`/`##`. */
interface Section {
  readonly heading: RootContent;
  readonly nodes: readonly RootContent[];
}

/** The first top-level `##` section whose heading normalizes to `name`, or `null`. */
function findSection(root: Root, name: string): Section | null {
  const children = root.children;
  const start = children.findIndex(
    (node) => node.type === "heading" && node.depth === 2 && normalizeHeading(nodeText(node)) === name,
  );
  if (start === -1) {
    return null;
  }
  const nodes: RootContent[] = [];
  for (const node of children.slice(start + 1)) {
    if (node.type === "heading" && node.depth <= 2) {
      break;
    }
    nodes.push(node);
  }
  return { heading: children[start] as RootContent, nodes };
}

/**
 * Every paragraph's text within `nodes`, split into lines, at any nesting depth (list items,
 * quotes), with an explicit stack throughout. A soft line break (a newline inside a `text` node)
 * and a hard one (an mdast `break`: a trailing `\` or two spaces) both end a line. A code span
 * becomes {@link CODE_SPAN}, so `Check: \`ci.yml\`` still has content after its label while
 * `` `Rationale:` `` quoted in code is not a label. Raw inline HTML contributes nothing.
 */
function paragraphLines(nodes: readonly Nodes[]): string[] {
  const lines: string[] = [];
  walkSkipping(nodes, isNotProse, (node) => {
    if (node.type !== "paragraph") {
      return;
    }
    let text = "";
    walkSkipping(
      node.children,
      (inline) => inline.type === "html",
      (inline) => {
        if (inline.type === "text") {
          text += inline.value;
        } else if (inline.type === "inlineCode") {
          text += CODE_SPAN;
        } else if (inline.type === "break") {
          text += "\n";
        }
      },
    );
    lines.push(...text.split("\n").map((line) => line.trim()));
  });
  return lines;
}

// ── Constitution (OPAG-425 R4, R9) ─────────────────────────────────────────────—

/** A principle heading: `P<n>. <Name>`. */
const PRINCIPLE_HEADING = /^P(\d+)\.\s+(\S.*)$/;

/** The uppercase RFC 2119 / RFC 8174 keywords; case-sensitive by design (RFC 8174: only in capitals). */
const RFC_2119_KEYWORD = /\b(?:MUST|REQUIRED|SHALL|SHOULD|RECOMMENDED|MAY|OPTIONAL)\b/;

/** Above this many lines, the always-loaded Principles section draws a warning (R4). */
export const PRINCIPLES_LINE_BUDGET = 150;

/** Constitution content rules (R4). Frontmatter presence is the profile's; FORMAT is checked here. */
function constitutionFindings(frontmatter: Readonly<Record<string, unknown>>, body: string): TypeShapeFinding[] {
  const findings: TypeShapeFinding[] = [];
  const error = (message: string): void => {
    findings.push({ severity: "error", rule: TYPE_SHAPE_RULE, message: `Constitution ${message}` });
  };

  const version = typeof frontmatter.version === "string" ? frontmatter.version.trim() : undefined;
  const ratified = typeof frontmatter.ratified === "string" ? frontmatter.ratified.trim() : undefined;
  const lastAmended = typeof frontmatter.last_amended === "string" ? frontmatter.last_amended.trim() : undefined;
  if (version !== undefined && !SEMVER.test(version)) {
    error(`version ${JSON.stringify(version)} is not a SemVer version (MAJOR.MINOR.PATCH, e.g. 1.0.0)`);
  }
  for (const [key, value] of [
    ["ratified", ratified],
    ["last_amended", lastAmended],
  ] as const) {
    if (value !== undefined && !isCalendarDate(value)) {
      error(`${key} ${JSON.stringify(value)} is not an ISO calendar date (YYYY-MM-DD)`);
    }
  }
  if (
    ratified !== undefined &&
    lastAmended !== undefined &&
    isCalendarDate(ratified) &&
    isCalendarDate(lastAmended) &&
    lastAmended < ratified
  ) {
    error(`last_amended ${lastAmended} is earlier than ratified ${ratified}`);
  }
  if (typeof frontmatter.amendment_authority === "string" && frontmatter.amendment_authority.trim() === "") {
    error("amendment_authority is empty -- name who may ratify an amendment");
  }

  const root = fromMarkdown(body);
  findings.push(...principleFindings(root));
  findings.push(...amendmentLogFindings(root, body, version, lastAmended));

  const placeholders = [
    ...new Set(
      [...frontmatterStrings(frontmatter), proseText([root]), ...linkTargets([root])].flatMap((text) =>
        placeholdersIn(text),
      ),
    ),
  ];
  if (placeholders.length > 0) {
    error(`has unresolved template placeholder(s): ${placeholders.join(", ")} -- fill them in`);
  }
  return findings;
}

/** The Principles rules: heading form, unique ids, keyword + Rationale + Check, and the line budget. */
function principleFindings(root: Root): TypeShapeFinding[] {
  const section = findSection(root, "principles");
  if (section === null) {
    return []; // the missing section itself is the profile's required-section finding
  }
  const findings: TypeShapeFinding[] = [];
  const error = (message: string): void => {
    findings.push({ severity: "error", rule: TYPE_SHAPE_RULE, message: `Constitution ${message}` });
  };

  // Split the section into principles at each `###`; a `####` or deeper stays inside its principle.
  const principles: { heading: string; nodes: RootContent[] }[] = [];
  for (const node of section.nodes) {
    if (node.type === "heading" && node.depth === 3) {
      principles.push({ heading: nodeText(node).trim(), nodes: [] });
    } else {
      principles.at(-1)?.nodes.push(node);
    }
  }
  if (principles.length === 0) {
    error('"## Principles" declares no principle -- add one as a "### P1. <Name>" heading');
  }

  const seen = new Map<number, string>();
  for (const principle of principles) {
    const match = PRINCIPLE_HEADING.exec(principle.heading);
    if (match === null) {
      error(`principle heading ${JSON.stringify(principle.heading)} is not of the form "P<n>. <Name>"`);
      continue;
    }
    const ordinal = Number(match[1]);
    const earlier = seen.get(ordinal);
    if (earlier !== undefined) {
      error(
        `principle id P${ordinal} is used twice (${JSON.stringify(earlier)} and ${JSON.stringify(principle.heading)}) -- a principle id is stable and never reused`,
      );
    } else {
      seen.set(ordinal, principle.heading);
    }
    const label = `principle ${JSON.stringify(principle.heading)}`;
    const prose = proseText(principle.nodes);
    if (!RFC_2119_KEYWORD.test(prose)) {
      error(`${label} has no uppercase RFC 2119/8174 keyword (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, ...)`);
    }
    const lines = paragraphLines(principle.nodes);
    if (!lines.some((line) => /^Rationale:\s*\S/.test(line))) {
      error(`${label} has no "Rationale:" line`);
    }
    if (!lines.some((line) => /^Check:\s*\S/.test(line))) {
      error(
        `${label} has no "Check:" line naming how compliance is verified (a CI job, a lint, a review gate, or "review only")`,
      );
    }
  }

  const headingLine = section.heading.position?.start.line;
  const lastLine = section.nodes.at(-1)?.position?.end.line;
  if (headingLine !== undefined && lastLine !== undefined && lastLine - headingLine > PRINCIPLES_LINE_BUDGET) {
    findings.push({
      severity: "warning",
      rule: TYPE_SHAPE_RULE,
      message: `Constitution "## Principles" runs ${lastLine - headingLine} lines, above the ${PRINCIPLES_LINE_BUDGET}-line budget for always-loaded context -- move concrete values to a Constants document and keep principles normative`,
    });
  }
  return findings;
}

/** A GFM table delimiter row: `|---|:--:|`, with or without the outer pipes. */
const TABLE_DELIMITER_ROW = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/;

/** The raw cell sources of one GFM pipe-table row: outer pipes dropped, split on unescaped `|`. */
function rawCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) {
    row = row.slice(1);
  }
  if (row.endsWith("|") && !row.endsWith("\\|")) {
    row = row.slice(0, -1);
  }
  return row.split(/(?<!\\)\|/);
}

/**
 * A cell's rendered text: its inline markdown parsed, so `**1.0.0**`, `_1.0.0_`, `` `1.0.0` ``,
 * `[1.0.0](url)` and `1.0.0` all read as `1.0.0`, and `\|` as `|`.
 */
function cellText(cell: string): string {
  return nodeText(fromMarkdown(cell.trim())).trim();
}

/**
 * The first pipe table among `nodes`, as rows of cell text (header first, delimiter row dropped),
 * or `null`. Read from the raw `body` rather than the mdast: lore parses CommonMark with no GFM
 * extension (tech-stack.md), so a table arrives inside a plain paragraph. It need not BE the whole
 * paragraph: GFM lets a table interrupt a paragraph, so prose lines directly above it (no blank
 * line) render as a paragraph plus a table on GitHub, and are skipped here the same way. The header
 * is the line above the first delimiter row whose cell count matches it, as GFM requires; every
 * line after the delimiter row belongs to the table (the paragraph ends at the table's blank line).
 */
function firstPipeTable(nodes: readonly RootContent[], body: string): string[][] | null {
  for (const node of nodes) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (node.type !== "paragraph" || start === undefined || end === undefined) {
      continue;
    }
    const lines = body.slice(start, end).split("\n");
    for (let i = 0; i + 1 < lines.length; i++) {
      const header = lines[i] ?? "";
      const delimiter = (lines[i + 1] ?? "").trim();
      if (TABLE_DELIMITER_ROW.test(delimiter) && rawCells(header).length === rawCells(delimiter).length) {
        return [header, ...lines.slice(i + 2)].map((line) => rawCells(line).map(cellText));
      }
    }
  }
  return null;
}

/** The Amendment log rule: a table whose top row's Version and Date match `version`/`last_amended`. */
function amendmentLogFindings(
  root: Root,
  body: string,
  version: string | undefined,
  lastAmended: string | undefined,
): TypeShapeFinding[] {
  const section = findSection(root, "amendment log");
  if (section === null) {
    return []; // the missing section itself is the profile's required-section finding
  }
  const error = (message: string): TypeShapeFinding[] => [
    { severity: "error", rule: TYPE_SHAPE_RULE, message: `Constitution "## Amendment log" ${message}` },
  ];
  const table = firstPipeTable(section.nodes, body);
  if (table === null) {
    return error('has no table -- add one with "Version" and "Date" columns, newest row first');
  }
  const header = (table[0] ?? []).map(normalizeHeading);
  const versionColumn = header.indexOf("version");
  const dateColumn = header.indexOf("date");
  if (versionColumn === -1 || dateColumn === -1) {
    return error('table needs "Version" and "Date" columns');
  }
  const top = table[1];
  if (top === undefined) {
    return error("table has no entry -- its top row records the current version");
  }
  const cell = (column: number): string => top[column] ?? "";
  const findings: TypeShapeFinding[] = [];
  if (version !== undefined && cell(versionColumn) !== version) {
    findings.push(
      ...error(
        `top row's Version ${JSON.stringify(cell(versionColumn))} does not match frontmatter version ${JSON.stringify(version)}`,
      ),
    );
  }
  if (lastAmended !== undefined && cell(dateColumn) !== lastAmended) {
    findings.push(
      ...error(
        `top row's Date ${JSON.stringify(cell(dateColumn))} does not match frontmatter last_amended ${JSON.stringify(lastAmended)}`,
      ),
    );
  }
  return findings;
}

/**
 * The frontmatter `lore new constitution` writes: version 1.0.0, ratified and last-amended on the
 * creation date, and an amendment authority that names a human. The same date fills the template's
 * Amendment log row (`{{date}}`), which is what keeps the two in agreement on a fresh document.
 */
function constitutionSeed(timestamp: string): TypeSeed {
  const date = timestamp.slice(0, 10);
  return {
    frontmatter: {
      version: "1.0.0",
      ratified: date,
      last_amended: date,
      amendment_authority: "project maintainers (human ratification by pull request)",
    },
    vars: { version: "1.0.0", date },
  };
}

// ── Constants (OPAG-425 R5-R7, R9) ─────────────────────────────────────────────—

/*
 * The Constants document (R5), and the concrete syntax lore-cli chose where the ADR left it open.
 *
 *     ## Ports                        a group: any `##` heading; it carries no rule of its own
 *
 *     ### service.http-port           an entry: its heading text IS its id
 *
 *     - value: 8080                   its field list: ONE bullet list, one `name: value` item per
 *     - meaning: The port the ...     field, nothing else under the heading
 *     - source_of_truth: deploy/app.yaml#service.port
 *     - status: active
 *
 * - An entry is a `###` heading under a `##` group. Its id matches {@link CONSTANT_ID} and is unique
 *   in the document. Its citation anchor is the heading's GitHub slug, which drops the dots
 *   (`service.http-port` is cited as `#servicehttp-port`), so two ids whose slugs collide, or an id
 *   whose slug an earlier heading already took, are an error: every entry must own its anchor (R6).
 * - Field syntax: the list items are read as RENDERED text, so emphasis, code spans and link text
 *   contribute their text: `- **value**: \`8080\`` is field `value` with value `8080`. A field's
 *   value runs from the item's first `:` to its end, trimmed; a line break inside it reads as one
 *   space. HTML comments are ignored; any other content under an entry (prose, a nested list, a
 *   `####` heading, a second list) is an error, so the list is always the whole entry.
 * - Required: `value`, `meaning`, `source_of_truth` (`<path>#<key>`, or the literal `this-doc`),
 *   `status` (`active` | `deprecated` | `retired`); each non-empty. Optional: `kind`, `avoid`,
 *   `owner`, `used_by` (free text), `hot` (`true` | `false`), `replaced_by` (an id in this
 *   document; REQUIRED when `status` is `deprecated`, and then it must name an ACTIVE entry). Any
 *   other field name is an error.
 * - `<path>` is repository-relative (never absolute, never a `..` segment); `<key>` is a dotted path
 *   into the file, where an all-digit segment indexes an array. A key segment cannot itself
 *   contain a dot.
 *
 * The frontmatter's `version` is SemVer, `last_reviewed` an ISO calendar date, `owner` non-empty.
 *
 * R7, the value comparison, is the bundle facet ({@link constantsBundle}) because it reads files:
 * see {@link renderSourceScalar} for how a source value becomes the string compared with `value`.
 */

/** An entry id (R5): lower-case alphanumeric segments, dot-separated, at least two. */
const CONSTANT_ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

/** The fields every entry carries (R5). */
const REQUIRED_CONSTANT_FIELDS = ["value", "meaning", "source_of_truth", "status"] as const;

/** Every field an entry may carry; anything else is rejected (R5). */
const CONSTANT_FIELDS: ReadonlySet<string> = new Set([
  ...REQUIRED_CONSTANT_FIELDS,
  "kind",
  "avoid",
  "owner",
  "used_by",
  "replaced_by",
  "hot",
]);

/** An entry's lifecycle. */
const CONSTANT_STATUSES: readonly string[] = ["active", "deprecated", "retired"];

/** The `source_of_truth` that names this document itself: nothing to compare against (R7). */
export const THIS_DOC_SOURCE = "this-doc";

/** One field-list item: a field name, a colon, and the value (possibly empty). */
const FIELD_ITEM = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/s;

/** One `### <id>` entry as read from a Constants document. */
interface ConstantsEntry {
  /** The heading text: the entry's id, whether or not it is well-formed. */
  readonly id: string;
  /** The heading's anchor in this document (GitHub slug, after earlier headings), without `#`. */
  readonly anchor: string;
  /** Its fields, first occurrence of each name. */
  readonly fields: ReadonlyMap<string, string>;
}

/** A Constants document's entries and every R5 finding about them. */
interface ParsedConstants {
  readonly entries: readonly ConstantsEntry[];
  readonly findings: readonly TypeShapeFinding[];
}

/** A `source_of_truth`, parsed. */
type SourceOfTruth =
  | { readonly kind: "this-doc" }
  | { readonly kind: "file"; readonly path: string; readonly key: string }
  | { readonly kind: "invalid"; readonly reason: string };

/**
 * Whether `path` is repository-relative and stays inside the repository: not empty, not absolute
 * (`/x`, `C:/x`, `\\x`), no backslash, no `..` segment. The command layer's `readSource` is only
 * ever handed such a path.
 */
export function isRepoRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path) || path.includes("\0")) {
    return false;
  }
  return !path.split("/").some((segment) => segment === "..");
}

/** Parse a `source_of_truth` value: `this-doc`, or `<path>#<key>` split at the first `#`. */
function parseSourceOfTruth(value: string): SourceOfTruth {
  if (value === THIS_DOC_SOURCE) {
    return { kind: "this-doc" };
  }
  const hash = value.indexOf("#");
  if (hash === -1) {
    return { kind: "invalid", reason: `is neither "${THIS_DOC_SOURCE}" nor "<path>#<key>"` };
  }
  const path = value.slice(0, hash).trim();
  const key = value.slice(hash + 1).trim();
  if (!isRepoRelativePath(path)) {
    return {
      kind: "invalid",
      reason: `names ${JSON.stringify(path)}, which is not a repository-relative path (no leading "/", no "..")`,
    };
  }
  if (key === "" || key.split(".").some((segment) => segment === "")) {
    return { kind: "invalid", reason: `has key ${JSON.stringify(key)}, which is not a dotted key path such as a.b.c` };
  }
  return { kind: "file", path, key };
}

/** A field item's rendered text: text and code-span content, HTML skipped, each line break one space. */
function fieldItemText(nodes: readonly Nodes[]): string {
  let text = "";
  walkSkipping(
    nodes,
    (node) => node.type === "html",
    (node) => {
      if (node.type === "text" || node.type === "inlineCode") {
        text += node.value;
      } else if (node.type === "break") {
        text += "\n";
      }
    },
  );
  return text.replace(/[ \t]*\n[ \t]*/g, " ").trim();
}

/** Every heading's anchor in `root`, computed exactly as `lore check` computes them (one slugger, document order). */
function headingAnchors(root: Root): Map<Nodes, string> {
  const slugger = new GithubSlugger();
  const anchors = new Map<Nodes, string>();
  walkMdast(root, (node) => {
    if (node.type === "heading") {
      anchors.set(node, slugger.slug(nodeText(node)));
    }
  });
  return anchors;
}

/** Read every entry of a Constants body and judge its shape (R5). Pure; shared by both facets. */
function parseConstants(body: string): ParsedConstants {
  const root = fromMarkdown(body);
  const anchors = headingAnchors(root);
  const findings: TypeShapeFinding[] = [];
  const error = (message: string): void => {
    findings.push({ severity: "error", rule: TYPE_SHAPE_RULE, message: `Constants ${message}` });
  };

  // Split the top level into entries: a `###` opens one; a `#`/`##` closes it. Deeper headings and
  // every other node under an open entry belong to it (and are judged below).
  const raw: { heading: Heading; grouped: boolean; nodes: RootContent[] }[] = [];
  let grouped = false;
  let open: (typeof raw)[number] | undefined;
  for (const node of root.children) {
    if (node.type === "heading" && node.depth <= 2) {
      grouped = node.depth === 2;
      open = undefined;
    } else if (node.type === "heading" && node.depth === 3) {
      open = { heading: node, grouped, nodes: [] };
      raw.push(open);
    } else {
      open?.nodes.push(node);
    }
  }

  const entries: ConstantsEntry[] = [];
  const seenIds = new Set<string>();
  for (const candidate of raw) {
    const id = nodeText(candidate.heading).trim();
    const label = `entry ${JSON.stringify(id)}`;
    const anchor = anchors.get(candidate.heading) ?? "";
    if (!CONSTANT_ID.test(id)) {
      error(
        `entry heading ${JSON.stringify(id)} is not a valid id: lower-case alphanumeric segments joined by dots, such as "service.http-port" (${CONSTANT_ID.source})`,
      );
    } else if (seenIds.has(id)) {
      error(`${label} is declared twice -- an entry id is unique in the document and never reused`);
    } else if (anchor !== githubSlug(id)) {
      error(
        `${label} has anchor "#${anchor}", not "#${githubSlug(id)}", because an earlier heading already slugs to "#${githubSlug(id)}" -- rename one so every entry is cited by its own anchor`,
      );
    }
    seenIds.add(id);
    if (!candidate.grouped) {
      error(`${label} is not under a "##" group heading`);
    }

    const fields = new Map<string, string>();
    const content = candidate.nodes.filter((node) => node.type !== "html");
    const list = content[0];
    if (list === undefined) {
      error(`${label} has no field list -- add a bullet list of "name: value" items under its heading`);
    } else if (list.type !== "list" || list.ordered === true) {
      error(`${label} must open with a bullet list of "name: value" fields, not a ${list.type}`);
    } else {
      for (const extra of content.slice(1)) {
        error(`${label} has a ${extra.type} after its field list -- an entry holds only its field list`);
      }
      for (const item of list.children) {
        const blocks = item.children.filter((node) => node.type !== "html");
        const only = blocks[0];
        if (blocks.length !== 1 || only?.type !== "paragraph") {
          error(`${label} has a field item that is not a single "name: value" line`);
          continue;
        }
        const match = FIELD_ITEM.exec(fieldItemText(only.children));
        if (match === null) {
          error(`${label} has a field item that is not of the form "name: value"`);
          continue;
        }
        const name = match[1] as string;
        const value = (match[2] as string).trim();
        if (!CONSTANT_FIELDS.has(name)) {
          error(`${label} has unknown field ${JSON.stringify(name)} (known: ${[...CONSTANT_FIELDS].join(", ")})`);
        } else if (fields.has(name)) {
          error(`${label} sets field ${JSON.stringify(name)} twice`);
        } else {
          fields.set(name, value);
        }
      }
    }
    for (const name of REQUIRED_CONSTANT_FIELDS) {
      if (!fields.has(name)) {
        error(`${label} is missing required field ${JSON.stringify(name)}`);
      } else if (fields.get(name) === "") {
        error(`${label} has an empty ${JSON.stringify(name)}`);
      }
    }
    const status = fields.get("status");
    if (status !== undefined && status !== "" && !CONSTANT_STATUSES.includes(status)) {
      error(`${label} has status ${JSON.stringify(status)}, not one of ${CONSTANT_STATUSES.join(", ")}`);
    }
    const source = fields.get("source_of_truth");
    if (source !== undefined && source !== "") {
      const parsed = parseSourceOfTruth(source);
      if (parsed.kind === "invalid") {
        error(`${label} source_of_truth ${JSON.stringify(source)} ${parsed.reason}`);
      }
    }
    const hot = fields.get("hot");
    if (hot !== undefined && hot !== "true" && hot !== "false") {
      error(`${label} has hot ${JSON.stringify(hot)}, not true or false`);
    }
    entries.push({ id, anchor, fields });
  }

  // replaced_by resolves within this document: to any entry, and to an ACTIVE one when deprecated.
  const byId = new Map<string, ConstantsEntry>();
  for (const entry of entries) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry);
    }
  }
  for (const entry of entries) {
    const label = `entry ${JSON.stringify(entry.id)}`;
    const status = entry.fields.get("status");
    const replacedBy = entry.fields.get("replaced_by");
    if (replacedBy === undefined || replacedBy === "") {
      if (status === "deprecated") {
        error(`${label} is deprecated but names no replaced_by -- name the active entry that replaces it`);
      }
      continue;
    }
    const target = byId.get(replacedBy);
    if (target === undefined) {
      error(`${label} has replaced_by ${JSON.stringify(replacedBy)}, which is not an entry in this document`);
    } else if (target === entry) {
      error(`${label} names itself as its replaced_by`);
    } else if (status === "deprecated" && target.fields.get("status") !== "active") {
      error(
        `${label} is deprecated and its replaced_by ${JSON.stringify(replacedBy)} is ${target.fields.get("status") ?? "without a status"}, not active`,
      );
    }
  }
  return { entries, findings };
}

/** Constants content rules (R5): frontmatter formats plus {@link parseConstants}' entry findings. */
function constantsFindings(frontmatter: Readonly<Record<string, unknown>>, body: string): TypeShapeFinding[] {
  const findings: TypeShapeFinding[] = [];
  const error = (message: string): void => {
    findings.push({ severity: "error", rule: TYPE_SHAPE_RULE, message: `Constants ${message}` });
  };
  if (typeof frontmatter.version === "string" && !SEMVER.test(frontmatter.version.trim())) {
    error(`version ${JSON.stringify(frontmatter.version)} is not a SemVer version (MAJOR.MINOR.PATCH, e.g. 1.0.0)`);
  }
  if (typeof frontmatter.last_reviewed === "string" && !isCalendarDate(frontmatter.last_reviewed.trim())) {
    error(`last_reviewed ${JSON.stringify(frontmatter.last_reviewed)} is not an ISO calendar date (YYYY-MM-DD)`);
  }
  if (typeof frontmatter.owner === "string" && frontmatter.owner.trim() === "") {
    error("owner is empty -- name who keeps these values current");
  }
  findings.push(...parseConstants(body).findings);
  return findings;
}

/** The source formats R7 compares, by lower-cased file extension. Anything else is not comparable. */
const SOURCE_FORMATS: Readonly<Record<string, "json" | "toml" | "yaml">> = {
  ".json": "json",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml",
};

/** The comparable format of `path`, or `undefined` when its extension is not JSON, TOML or YAML. */
function sourceFormat(path: string): "json" | "toml" | "yaml" | undefined {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  return dot > slash ? SOURCE_FORMATS[path.slice(dot).toLowerCase()] : undefined;
}

/**
 * Parse a source file's text. JSON by `JSON.parse`; TOML by Bun's built-in parser (which, as of Bun
 * 1.3, rejects TOML date-times: such a file is reported as unparseable, never silently skipped);
 * YAML by js-yaml under the YAML 1.2 CORE schema, so a bare `2026-01-01` stays a string and only
 * `true`/`false` (any case) are booleans. A leading BOM is ignored.
 */
function parseSource(text: string, format: "json" | "toml" | "yaml"): unknown {
  const source = text.replace(/^\uFEFF/, "");
  if (format === "json") {
    return JSON.parse(source);
  }
  if (format === "toml") {
    return Bun.TOML.parse(source);
  }
  return yaml.load(source, { schema: yaml.CORE_SCHEMA });
}

/** The value at a dotted `key` in parsed data, or `undefined` when any segment is absent. */
function lookupKey(data: unknown, key: string): { readonly found: boolean; readonly value?: unknown } {
  let current: unknown = data;
  for (const segment of key.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(segment) && Number(segment) < current.length) {
      current = current[Number(segment)];
    } else if (
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      Object.hasOwn(current, segment)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

/**
 * How a source value is rendered for the R7 comparison, which is then EXACT string equality with the
 * entry's `value`: a string as itself; a number by JavaScript's `String()` (shortest round-trip
 * form, so `8080` is "8080" and `1.50` is "1.5" -- quote a version-like value in its source); a
 * boolean as "true"/"false"; null as "null". An object or array is not a scalar, and returns
 * `undefined` so the caller can report it rather than compare a rendering nobody wrote.
 */
export function renderSourceScalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  return undefined;
}

/** A parser's message, on one line and bounded, for a finding. */
function oneLine(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

/**
 * The Constants bundle rules (R6, R7, and the positive control), run only by `lore check`:
 *
 * - R7: every non-retired entry whose `source_of_truth` names a `.json`, `.toml`, `.yaml` or `.yml`
 *   file must hold, at that key, a scalar whose rendering ({@link renderSourceScalar}) EQUALS its
 *   `value`. A file that cannot be read or parsed, a missing key and a non-scalar value all FAIL.
 *   A `this-doc` entry is not compared. Any other extension is NOT COMPARABLE: counted, never
 *   failed, because lore has no reader for it. A retired entry is not compared either: it records
 *   a value that is no longer in force, whose source may rightly be gone (active and deprecated
 *   entries are; confirmed by opum-agent ruling 2026-09-26).
 * - R6: every link into this document is counted, and one citing a DEPRECATED or RETIRED entry's
 *   anchor draws a `deprecated-reference` warning on the citing file, its message naming which
 *   (retired extended by opum-agent ruling 2026-09-26). A link to an anchor that does not exist is
 *   already `lore check`'s `broken-anchor` error, which this rule does not duplicate.
 * - Positive control: a Constants document from which zero entries were read FAILS, so an empty or
 *   unreadable-to-lore document can never pass as "every entry compared clean".
 *
 * Counts (never gating): `entries` read, `comparableSources` actually compared (read, key found,
 * scalar), `notComparableSources`, and `references` (links into the document).
 */
function constantsBundle(context: TypeBundleContext): TypeBundleResult {
  const { entries } = parseConstants(context.body);
  const findings: TypeBundleFinding[] = [];
  const fail = (rule: TypeBundleRuleName, message: string): void => {
    findings.push({ severity: "error", rule, file: context.file, message: `Constants ${message}` });
  };
  if (entries.length === 0) {
    fail(
      ZERO_ENTRIES_RULE,
      `document ${context.file} yielded zero entries, so nothing in it was compared or can be cited -- add a "### <id>" entry under a "## <group>" heading`,
    );
  }

  const parsedSources = new Map<string, { readonly data?: unknown; readonly problem?: string }>();
  const load = (
    path: string,
    format: "json" | "toml" | "yaml",
  ): { readonly data?: unknown; readonly problem?: string } => {
    const cached = parsedSources.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const read = context.readSource(path);
    let result: { data?: unknown; problem?: string };
    if (!read.ok) {
      result = { problem: `cannot be read (${read.reason})` };
    } else {
      try {
        result = { data: parseSource(read.text, format) };
      } catch (err) {
        result = {
          problem: `cannot be parsed as ${format.toUpperCase()} (${oneLine(err instanceof Error ? err.message : String(err))})`,
        };
      }
    }
    parsedSources.set(path, result);
    return result;
  };

  let comparableSources = 0;
  let notComparableSources = 0;
  for (const entry of entries) {
    if (entry.fields.get("status") === "retired") {
      continue;
    }
    const source = parseSourceOfTruth(entry.fields.get("source_of_truth") ?? "");
    if (source.kind !== "file") {
      continue; // `this-doc`, or malformed (already a type-shape error)
    }
    const format = sourceFormat(source.path);
    if (format === undefined) {
      notComparableSources++;
      continue;
    }
    const label = `entry ${JSON.stringify(entry.id)}`;
    const named = `${source.path}#${source.key}`;
    const loaded = load(source.path, format);
    if (loaded.problem !== undefined) {
      fail(SOURCE_OF_TRUTH_RULE, `${label}: source_of_truth ${source.path} ${loaded.problem}`);
      continue;
    }
    const found = lookupKey(loaded.data, source.key);
    if (!found.found) {
      fail(SOURCE_OF_TRUTH_RULE, `${label}: source_of_truth ${named} names a key that ${source.path} does not have`);
      continue;
    }
    const rendered = renderSourceScalar(found.value);
    if (rendered === undefined) {
      fail(SOURCE_OF_TRUTH_RULE, `${label}: source_of_truth ${named} is a table or list, not a single value`);
      continue;
    }
    comparableSources++;
    const value = entry.fields.get("value") ?? "";
    if (rendered !== value) {
      fail(
        SOURCE_OF_TRUTH_RULE,
        `${label} has value ${JSON.stringify(value)}, but its source_of_truth ${named} holds ${JSON.stringify(rendered)} -- update whichever is wrong`,
      );
    }
  }

  // Entries a citation should move off: deprecated (R6) and retired (opum-agent ruling 2026-09-26).
  const superseded = new Map<string, { readonly entry: ConstantsEntry; readonly status: string }>();
  for (const entry of entries) {
    const status = entry.fields.get("status");
    if ((status === "deprecated" || status === "retired") && entry.anchor !== "") {
      superseded.set(entry.anchor, { entry, status });
    }
  }
  for (const link of context.inboundLinks) {
    const cited = superseded.get(link.fragment);
    if (cited === undefined) {
      continue;
    }
    const replacement = cited.entry.fields.get("replaced_by");
    findings.push({
      severity: "warning",
      rule: DEPRECATED_REFERENCE_RULE,
      file: link.file,
      message: `link to #${link.fragment} in ${context.file} cites Constants entry ${JSON.stringify(cited.entry.id)}, which is ${cited.status}${replacement ? ` -- cite ${JSON.stringify(replacement)} instead` : ""}`,
    });
  }

  return {
    findings,
    counts: {
      entries: entries.length,
      comparableSources,
      notComparableSources,
      references: context.inboundLinks.length,
    },
  };
}

/**
 * The frontmatter `lore new constants` writes: version 1.0.0, reviewed on the creation date, and an
 * owner to replace. The template's one example entry is `source_of_truth: this-doc`, so a fresh
 * document passes R7 without naming a file the project may not have.
 */
function constantsSeed(timestamp: string): TypeSeed {
  return {
    frontmatter: { version: "1.0.0", last_reviewed: timestamp.slice(0, 10), owner: "project maintainers" },
    vars: {},
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────—

/** Every registered type's rules, keyed by canonical type name. */
const TYPE_RULES: ReadonlyMap<string, TypeRule> = new Map<string, TypeRule>([
  [
    CONSTITUTION_TYPE,
    { type: CONSTITUTION_TYPE, singleton: true, check: constitutionFindings, seed: constitutionSeed },
  ],
  [
    CONSTANTS_TYPE,
    { type: CONSTANTS_TYPE, singleton: true, check: constantsFindings, seed: constantsSeed, bundle: constantsBundle },
  ],
]);

/**
 * The rules for `canonical`, or `undefined` unless the active profile's declaration of it is lore's
 * OWN built-in one ({@link isBuiltinTypeDeclaration}). A custom `.lore/profile.toml` that declares
 * a type of the same name — `Constitution` or `Constants` — opts out of every rule here
 * (content rules, singleton, `lore new` seed) and keeps only what it declared itself, exactly as
 * before the built-in existed (OPAG-425 review finding 2, ruling A). So does a profile that does
 * not declare the type at all. Callers pass the type already canonicalized against `declared`.
 */
export function typeRuleFor(
  canonical: string,
  declared: { readonly types: ReadonlyMap<string, CompiledType> },
): TypeRule | undefined {
  return isBuiltinTypeDeclaration(declared.types.get(canonical)) ? TYPE_RULES.get(canonical) : undefined;
}

/** A document of a singleton type, for {@link singletonFindings}. */
export interface SingletonCandidate {
  /** The file the document lives in, as the caller reports it. */
  readonly file: string;
  /** Its canonical type (one whose {@link TypeRule.singleton} is set). */
  readonly type: string;
}

/**
 * One error for every document past the first of each singleton type, in the caller's file order,
 * each naming the first so the reader knows which one lore counted. `candidates` holds only
 * singleton-type documents from ONE bundle.
 */
export function singletonFindings(candidates: readonly SingletonCandidate[]): {
  readonly severity: "error";
  readonly rule: typeof SINGLETON_RULE;
  readonly file: string;
  readonly message: string;
}[] {
  const first = new Map<string, string>();
  const findings: { severity: "error"; rule: typeof SINGLETON_RULE; file: string; message: string }[] = [];
  for (const candidate of candidates) {
    const earlier = first.get(candidate.type);
    if (earlier === undefined) {
      first.set(candidate.type, candidate.file);
      continue;
    }
    findings.push({
      severity: "error",
      rule: SINGLETON_RULE,
      file: candidate.file,
      message: `a bundle may hold at most one ${candidate.type}, and ${earlier} is already one -- merge ${candidate.file} into it or change its type`,
    });
  }
  return findings;
}
