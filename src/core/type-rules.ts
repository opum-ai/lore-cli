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
 *
 * Registering a new type is one {@link TYPE_RULES} entry; neither call site names a type. That is
 * the seam LCLI-596 (Constants) is expected to use.
 *
 * Rules apply only when the active profile's declaration of the type IS lore's built-in one
 * ({@link typeRuleFor}). A custom `.lore/profile.toml` replaces the built-in vocabulary wholesale
 * (profile.ts): if it omits Constitution, a `type: Constitution` document is an ordinary unknown
 * producer extension; if it declares its OWN Constitution, that declaration keeps exactly the
 * fields and sections it states and none of these rules (OPAG-425 review finding 2, ruling A).
 *
 * Pure: no filesystem, no clock (a seed takes the caller's injected timestamp).
 */

import type { Nodes, Root, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { nodeText } from "./bundle";
import type { Finding } from "./finding";
import { CONSTITUTION_TYPE, type CompiledType, isBuiltinTypeDeclaration } from "./profile";

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

// ── Registry ─────────────────────────────────────────────────────────────────—

/** Every registered type's rules, keyed by canonical type name. */
const TYPE_RULES: ReadonlyMap<string, TypeRule> = new Map<string, TypeRule>([
  [
    CONSTITUTION_TYPE,
    { type: CONSTITUTION_TYPE, singleton: true, check: constitutionFindings, seed: constitutionSeed },
  ],
]);

/**
 * The rules for `canonical`, or `undefined` unless the active profile's declaration of it is lore's
 * OWN built-in one ({@link isBuiltinTypeDeclaration}). A custom `.lore/profile.toml` that declares
 * a type of the same name — `Constitution`, or later `Constants` — opts out of every rule here
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
