/**
 * check.ts — the **pure** engine behind `lore check`'s link/anchor + portability passes.
 *
 * `lore check` is lore's read-only CI **drift gate** (ADR-0007). Of its four specified
 * passes, this module owns the two that are deterministic and dependency-free today:
 *
 * - **Internal cross-link + heading-anchor validation** (the gate, exit `6`): every
 *   relative `.md` link target in the bundle must resolve to a real file, and every
 *   `#fragment` must resolve to a real heading slug in the target file. A broken link or
 *   a rotted anchor is an **error** {@link CheckFinding}.
 * - **Portability lint** (advisory, warn-only): non-portable link *form* (via the shared
 *   {@link validateLink} classifier) plus a body-text scan for Obsidian-isms (wikilinks,
 *   embeds, callouts, highlights, `%%`-comments). Every such finding is a **warning** that
 *   never fails the gate on its own (ADR-0007, portable-markdown.md).
 *
 * The other two `lore check` passes — status reconciliation and managed-block drift —
 * depend on the Backlog JSON adapter and `lore sync` (LORE-26) and are wired in by their
 * own later tasks; this module leaves them as a seam. External-URL liveness is opt-in and
 * deferred (no networking in core).
 *
 * Per the core contract (lore-design §2.1) everything here is pure: `{ path, raw }` files
 * in, typed findings out — no filesystem, no printing, no flags, no `process.exit`. The
 * command layer (`commands/check.ts`) discovers and reads the bundle's files and hands
 * their bytes here; this module owns the judgement.
 *
 * ### Resolution is against the whole bundle, not just concepts
 *
 * Link existence is checked against **every `.md` file** in the bundle — concepts *and*
 * the frontmatter-free `index.md`/`log.md` hubs — not just the concept graph. This is
 * exactly what `indexes.ts` documents as required: a generated hub links to sub-indexes
 * that are *not* concepts, so resolving only against the concept map would flag every
 * correct hub link as broken. Resolving against file membership makes those reserved
 * targets resolve with no special case.
 *
 * A link whose target resolves **above the bundle root** (a `../`-escaping path, e.g. a
 * managed `lore:tasks` block's link to a `backlog/tasks/*.md` file) is **out of scope**
 * here — the bundle membership cannot see outside `docs/` — and is skipped rather than
 * reported broken, the same way an external URL is. (Those cross-bundle links arrive with
 * `lore sync`/LORE-26; validating them is that pass's concern.)
 */

import { posix } from "node:path";
import matter from "gray-matter";
import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { extractLinkTargets, nodeText, walkMdast } from "./bundle";
import { idFromPath, normalizeInput } from "./concept";
import type { Finding, Severity } from "./finding";
import { decodeTarget, isExternalTarget, pathPart, validateLink } from "./links";

/** `error` fails the gate (exit `6`); `warning` is advisory (fails only under `--strict`). The shared {@link Severity}. */
export type CheckSeverity = Severity;

/**
 * Which check produced a {@link CheckFinding}. `broken-link`/`broken-anchor` are the
 * error-tier gate; `portability` is the warn-tier lint; `external-link` is the opt-in,
 * non-deterministic liveness advisory (`--external`) that never fails the gate (ADR-0007).
 */
export type CheckRule = "broken-link" | "broken-anchor" | "portability" | "external-link";

/**
 * One problem found in the bundle, attributed to the file that carries it: the shared
 * {@link Finding} (narrowed to `check`'s rules) plus that per-file attribution.
 */
export type CheckFinding = Finding<CheckRule> & {
  /** The bundle-root-relative POSIX path of the file the finding is in. */
  readonly file: string;
};

/** One bundle file handed to {@link checkBundle}: its **bundle-root-relative** path and raw bytes. */
export interface CheckInputFile {
  /** Bundle-root-relative POSIX path (e.g. `adr/0007-x.md`) — the id space links resolve within. */
  readonly path: string;
  /** The file's raw UTF-8 content (frontmatter fence included; stripped here). */
  readonly raw: string;
}

/** The aggregate result of a `lore check` run over a bundle. */
export interface CheckReport {
  /** Every deterministic finding, in file-then-document order (the gate + portability lint). */
  readonly findings: readonly CheckFinding[];
  /** Total error-severity findings (broken links + anchors) — the gate count. */
  readonly errorCount: number;
  /** Total warning-severity findings (portability) — advisory. */
  readonly warningCount: number;
  /** Number of files examined. */
  readonly fileCount: number;
  /**
   * Opt-in external-URL **liveness** results (`--external`), each an `external-link` warning. These
   * are **non-deterministic** (they depend on the network), so they are kept out of the gate
   * entirely: never folded into {@link errorCount}/{@link warningCount}, never affecting the exit
   * code — not even under `--strict` (ADR-0007). Absent (undefined) unless `--external` ran. Core
   * leaves this empty; the command layer fills it (the probing is network IO, ADR-0014).
   */
  readonly externalFindings?: readonly CheckFinding[];
}

/** One external URL discovered in the bundle, attributed to its file — the `--external` probe's worklist item. */
export interface ExternalLink {
  /** The bundle-root-relative POSIX path of the file the link is in. */
  readonly file: string;
  /** The external `http(s)` URL as authored. */
  readonly url: string;
}

/**
 * Collect the distinct `http(s)` link targets per file — the worklist the opt-in `--external`
 * liveness probe (command layer) fetches. Pure: it parses the same bundle bodies and returns URLs,
 * touching no network (ADR-0014). Only `http`/`https` are returned; other external schemes
 * (`mailto:`, `tel:`, protocol-relative `//host`) are not liveness-checkable and are skipped, as
 * are duplicates **within a file** (one finding per file per URL). Parsing here, rather than
 * reusing {@link checkBundle}'s internal parse, keeps that gate function's signature unpolluted by
 * the optional, non-deterministic feature.
 */
export function collectExternalLinks(files: readonly CheckInputFile[]): ExternalLink[] {
  const links: ExternalLink[] = [];
  for (const file of files) {
    const tree = fromMarkdown(bodyText(file.raw));
    const seen = new Set<string>();
    for (const target of extractLinkTargets(tree)) {
      const url = target.trim();
      if (HTTP_URL.test(url) && !seen.has(url)) {
        seen.add(url);
        links.push({ file: file.path, url });
      }
    }
  }
  return links;
}

/** An `http`/`https` URL — the only externally-probeable link scheme. */
const HTTP_URL = /^https?:\/\//i;

/**
 * Run the link/anchor + portability passes over a whole bundle and aggregate the findings.
 * Pure over its inputs (the command layer does the reading), so the resolution and slug
 * logic are testable without the filesystem.
 *
 * Two passes over the files: the first parses every file **once** and indexes its
 * heading-slug set under its bundle-relative id; the second resolves each file's
 * links/anchors against that index (the id set is the bundle membership the link gate
 * resolves against) and runs the portability lint over the same parsed tree. The split is
 * what lets a link resolve to a file walked *after* the linking file (a forward reference)
 * — every member is known before any link is checked — and the single parse per file is
 * shared across the heading, link, and portability consumers.
 */
export function checkBundle(files: readonly CheckInputFile[]): CheckReport {
  // Pass 1 — index: parse each file's body once into an mdast tree, keyed by bundle-relative
  // id, and record its heading-slug set. The id key set is the membership; every file is
  // indexed before any link is checked, so a forward reference resolves.
  const prepared: { file: CheckInputFile; tree: Nodes; id: string }[] = [];
  const slugsById = new Map<string, ReadonlySet<string>>();
  for (const file of files) {
    const tree = fromMarkdown(bodyText(file.raw));
    const id = idFromPath(file.path);
    prepared.push({ file, tree, id });
    slugsById.set(id, extractHeadingSlugs(tree));
  }

  // Pass 2 — judge: per file, the link/anchor gate then the portability lint, over the one
  // shared parse. Membership is `slugsById` itself — every file id is a key.
  const findings: CheckFinding[] = [];
  for (const { file, tree, id } of prepared) {
    const dir = posix.dirname(file.path);
    const targets = extractLinkTargets(tree);
    for (const target of targets) {
      findings.push(...linkFindings(target, file.path, dir, id, slugsById));
    }
    for (const target of targets) {
      for (const finding of validateLink(target)) {
        findings.push({ severity: "warning", rule: "portability", file: file.path, message: finding.message });
      }
    }
    findings.push(...portabilityScan(tree, file.path));
  }

  return summarize(findings, files.length);
}

// ── Link / anchor resolution (the gate) ──────────────────────────────────────────

/**
 * The error findings for one body-link **destination**: a broken internal cross-link
 * (target file not in the bundle) or a rotted anchor (`#fragment` resolving to no heading
 * in the target). Returns `[]` for anything out of the gate's scope — external URLs,
 * non-`.md` assets, and cross-bundle (`../`-escaping) targets.
 *
 * A **same-file** anchor (`[jump](#section)`, a destination that is *only* a fragment) is
 * validated against the linking file's own headings, so in-page anchor rot is caught too.
 */
function linkFindings(
  target: string,
  file: string,
  dir: string,
  fromId: string,
  slugsById: ReadonlyMap<string, ReadonlySet<string>>,
): CheckFinding[] {
  const trimmed = target.trim();
  const fragment = fragmentOf(trimmed);
  const path = pathPart(trimmed);

  if (path === "") {
    // A pure `#fragment` — an in-page anchor; resolve it against this file's own headings.
    return anchorFindings(target, file, fromId, fragment, slugsById);
  }
  if (isExternalTarget(path)) {
    return []; // external scheme / protocol-relative — not an internal cross-link
  }
  const decoded = decodeTarget(path);
  if (!/\.md$/i.test(decoded)) {
    return []; // a non-`.md` asset link — not a concept edge (matches the bundle resolver)
  }
  // A `/`-absolute destination resolves against the bundle root, not the linking file's
  // directory (it is non-portable — `validateLink` warns — but its existence is judged from
  // the root so the broken-link message names the path the author meant). A relative path
  // joins to the linking dir as usual.
  const resolved = posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : posix.join(dir, decoded));
  if (resolved === ".." || resolved.startsWith("../")) {
    return []; // escapes the bundle root — a cross-bundle link, out of scope for this pass
  }
  const targetId = idFromPath(resolved);
  if (!slugsById.has(targetId)) {
    return [
      {
        severity: "error",
        rule: "broken-link",
        file,
        message: `link "${target}" points at "${targetId}.md", which is not in the bundle`,
      },
    ];
  }
  return anchorFindings(target, file, targetId, fragment, slugsById);
}

/**
 * The broken-anchor finding (if any) for a resolved target: an **error** when a non-empty
 * `fragment` resolves to no heading slug in the target file (`targetId`). An empty fragment
 * (a plain file link) is clean. The fragment is decoded and lower-cased before the compare,
 * matching the lower-cased GitHub-style slugs {@link slugify} produces.
 */
function anchorFindings(
  target: string,
  file: string,
  targetId: string,
  fragment: string,
  slugsById: ReadonlyMap<string, ReadonlySet<string>>,
): CheckFinding[] {
  const anchor = decodeTarget(fragment).toLowerCase();
  if (anchor === "") {
    return [];
  }
  const slugs = slugsById.get(targetId);
  if (slugs?.has(anchor)) {
    return [];
  }
  return [
    {
      severity: "error",
      rule: "broken-anchor",
      file,
      message: `link "${target}" has anchor "#${fragment}", which is not a heading in "${targetId}.md"`,
    },
  ];
}

/** The fragment of a destination — the text after its first `#`, or `""` when it has none. */
function fragmentOf(target: string): string {
  const hash = target.indexOf("#");
  return hash === -1 ? "" : target.slice(hash + 1);
}

// ── Heading anchors (GitHub-style slugs) ─────────────────────────────────────────

/**
 * The set of heading-anchor slugs a markdown body exposes, computed the way **GitHub** —
 * the reference renderer (portable-markdown.md) — derives them: each heading's text is
 * {@link slugify}d, and a repeated slug gets a `-1`/`-2`/… disambiguator in document
 * order. Other renderers (MkDocs, Docusaurus) may slug differently; `lore check` validates
 * against the GitHub slug because that is the form lore writes and the matrix targets.
 *
 * Headings are read from an already-parsed mdast tree (shared with the link and portability
 * passes) and walked with the stack-safe {@link walkMdast}, so a `#` inside a fenced/indented
 * code block is not mistaken for a heading. A string overload is offered for tests.
 */
export function extractHeadingSlugs(source: Nodes | string): ReadonlySet<string> {
  const tree = typeof source === "string" ? fromMarkdown(source) : source;
  const seen = new Map<string, number>();
  const slugs = new Set<string>();
  walkMdast(tree, (node) => {
    if (node.type === "heading") {
      slugs.add(uniqueSlug(slugify(nodeText(node)), seen));
    }
  });
  return slugs;
}

/**
 * Slugify heading text the GitHub way: lower-case, drop punctuation (keeping letters,
 * numbers, spaces, `-`, and `_`), then turn each space into a hyphen. Unicode letters and
 * numbers survive (`Café` → `café`); double spaces become double hyphens, matching GitHub.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .replace(/ /g, "-");
}

/**
 * GitHub's per-document slug de-duplication (the github-slugger algorithm): the first
 * occurrence of a base slug is used verbatim; each later occurrence appends `-N` with an
 * incrementing per-base counter — but, crucially, if that candidate **collides with a slug
 * already taken** (a natural slug or an earlier disambiguation), the counter keeps advancing
 * until a free one is found. So headings `Release`, `Release 1`, `Release` yield
 * `release`, `release-1`, `release-2` — *not* a second `release-1` that would shadow the
 * real one and falsely fail a `#release-2` anchor. Every produced slug is registered (count
 * `0`) so a later natural collision is itself disambiguated. `seen` carries state across one
 * document.
 */
function uniqueSlug(base: string, seen: Map<string, number>): string {
  let slug = base;
  if (seen.has(base)) {
    let count = seen.get(base) ?? 0;
    do {
      count++;
      slug = `${base}-${count}`;
    } while (seen.has(slug));
    seen.set(base, count);
  }
  seen.set(slug, 0);
  return slug;
}

// ── Portability lint (warn-only body-text scan) ──────────────────────────────────

/** One non-portable-syntax detector: a global regex over body text, and the warning it raises. */
interface Detector {
  readonly re: RegExp;
  readonly describe: (match: RegExpExecArray) => string;
}

/**
 * The Obsidian-ism detectors (portable-markdown.md). Each renders as literal characters (or
 * not at all) outside Obsidian, so lore detects and **warns** — it never rewrites. Wikilinks,
 * embeds, and callouts are LORE-30 AC#2; highlights and `%%`-comments round out the
 * low-false-positive subset of the portable-markdown.md table.
 *
 * The patterns are tuned to flag the real syntax without crying wolf on ordinary prose:
 * wikilinks/embeds (`[[…]]`/`![[…]]`), highlights (`==…==`), and `%%`-comments are
 * distinctive enough to match anywhere in a text node, but a **callout** (`[!type]`) is only
 * a callout at the **start** of a blockquote line, so its pattern is anchored to the start of
 * the text node — a literal `[!important]` mid-sentence is left alone (it renders portably). (The
 * Obsidian **block-reference** `^id`, the MDX raw-`<`/`{` hazard, and the `_`-prefix/`.mdx`
 * filename rules are handled separately — {@link blockReferenceFinding}, {@link mdxHazardFindings},
 * and the command layer — not as body-text regexes, because each needs structural context a
 * per-text-node regex cannot see.)
 */
const DETECTORS: readonly Detector[] = [
  {
    // `![[embed]]` before `[[wikilink]]` so the leading `!` is attributed to the embed.
    re: /(!?)\[\[[^\]\n]*\]\]/g,
    describe: (m) =>
      m[1] === "!"
        ? `non-portable embed "${m[0]}"; use a normal markdown link or image (renders literally off Obsidian)`
        : `non-portable wikilink "${m[0]}"; use the relative .md link form (renders literally off Obsidian)`,
  },
  {
    // Anchored to the start of the text node: a real callout is `> [!type]`, where the
    // blockquote marker is stripped and the paragraph's first text starts with `[!type]`.
    re: /^\s*\[!([A-Za-z][\w-]*)\]/g,
    describe: (m) => `non-portable callout "[!${m[1]}]"; GitHub shows it as a plain blockquote with literal text`,
  },
  {
    re: /==[^=\n]+==/g,
    describe: (m) => `non-portable highlight "${m[0]}"; renders literally off Obsidian — use bold/italic`,
  },
  {
    re: /%%[^\n]*?%%/g,
    describe: () => `non-portable Obsidian comment "%% … %%"; use an HTML comment <!-- … -->, which hides everywhere`,
  },
];

/**
 * An Obsidian block-reference marker `^id`, matched only at the very **end of its block**: the
 * caret must be preceded by whitespace or the block start (so `x^2`, a GFM footnote `[^1]`, and any
 * mid-prose caret are spared) and the id — which may be digit-leading, e.g. `^3f9a2b` — runs to the
 * end. This is judged against a **block's last text child** (see {@link blockReferenceFinding}), not
 * an arbitrary text node, so `see note ^id **bold**` (where the caret is mid-paragraph, before the
 * bold) is *not* flagged. The `[[note#^id]]` reference form is already caught by the wikilink detector.
 */
const BLOCK_REFERENCE = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9-]*)$/;

/**
 * The portability warnings for a body's prose: the {@link DETECTORS Obsidian-ism detectors} plus
 * the {@link mdxHazardFindings MDX-safety} scan, over the parsed tree. The Obsidian detectors run
 * over **text nodes only** — scanning text (never `inlineCode`/`code`) excludes fenced and inline
 * code for free, so a `[[x]]` inside a code span is correctly left alone — while the MDX scan also
 * inspects raw-`html` nodes (the form CommonMark pulls a `<tag>` out of the text as), skipping
 * HTML comments.
 */
function portabilityScan(tree: Nodes, file: string): CheckFinding[] {
  const findings: CheckFinding[] = [];
  walkMdast(tree, (node) => {
    if (node.type === "text") {
      for (const detector of DETECTORS) {
        detector.re.lastIndex = 0;
        let match: RegExpExecArray | null = detector.re.exec(node.value);
        while (match !== null) {
          findings.push({ severity: "warning", rule: "portability", file, message: detector.describe(match) });
          match = detector.re.exec(node.value);
        }
      }
    }
    findings.push(...blockReferenceFinding(node, file));
    findings.push(...mdxHazardFindings(node, file));
  });
  return findings;
}

/**
 * The Obsidian block-reference warning for a block, judged from its **last inline child** so the
 * `^id` marker is only flagged when it truly ends the block ({@link BLOCK_REFERENCE}). Only a
 * `paragraph` is inspected — the block kind an Obsidian `^id` attaches to (a list item's text lives
 * in a nested paragraph, so it is covered too) — and only when that paragraph's last child is a text
 * node ending in `^id`. A caret followed by inline formatting (`^id **bold**`, where the last child
 * is the `strong`, not text) or sitting mid-prose is therefore not a false positive.
 */
function blockReferenceFinding(node: Nodes, file: string): CheckFinding[] {
  if (node.type !== "paragraph") {
    return [];
  }
  const last = node.children.at(-1);
  if (last?.type !== "text") {
    return [];
  }
  const match = BLOCK_REFERENCE.exec(last.value.trimEnd());
  if (match === null) {
    return [];
  }
  return [
    {
      severity: "warning",
      rule: "portability",
      file,
      message: `non-portable Obsidian block reference "^${match[1]}"; renders literally off Obsidian — link to a heading anchor instead`,
    },
  ];
}

/**
 * MDX-safety warnings (portable-markdown.md §MDX): Docusaurus parses Markdown as **MDX**, where a
 * raw `<` starts a JSX element and a raw `{` a JSX expression — so un-escaped, non-code `<`/`{` in
 * prose make its build throw even though the same source renders fine on GitHub/Obsidian/MkDocs.
 * lore detects (never escapes) two shapes, one finding apiece to keep the report readable:
 *
 * - a `<` or `{` CommonMark left literal in a **text** node (`temperature < 0`, `{ "k": 1 }`);
 * - a raw-`html` node that carries any non-comment markup (`<T>`, `<div>`, `<Component>` — what
 *   CommonMark pulled out of the text as inline/block HTML). HTML **comments** (`<!-- … -->`) are
 *   portable and are what lore writes for its managed regions, so they are stripped first; a node
 *   that is *only* comments is left alone, but `<!-- … --><div>` still flags the `<div>`.
 *
 * Code spans/blocks are `inlineCode`/`code` nodes, never `text`/`html`, so they never reach here.
 */
function mdxHazardFindings(node: Nodes, file: string): CheckFinding[] {
  const findings: CheckFinding[] = [];
  if (node.type === "text") {
    if (node.value.includes("<")) {
      findings.push(mdxHazard(file, "<"));
    }
    if (node.value.includes("{")) {
      findings.push(mdxHazard(file, "{"));
    }
  } else if (node.type === "html" && node.value.replace(HTML_COMMENT, "").trim() !== "") {
    findings.push({
      severity: "warning",
      rule: "portability",
      file,
      message: `non-portable raw HTML "${clip(node.value)}"; the portable subset has no raw HTML outside comments, and MDX (Docusaurus) parses it as JSX`,
    });
  }
  return findings;
}

/** An HTML comment span — stripped before judging whether an `html` node carries real (non-comment) markup. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** One MDX raw-character warning, naming the hazard and the portable escape. */
function mdxHazard(file: string, ch: "<" | "{"): CheckFinding {
  const role = ch === "<" ? "a JSX/HTML element" : "a JSX expression";
  const entity = ch === "<" ? "&lt;" : "&#123;";
  return {
    severity: "warning",
    rule: "portability",
    file,
    message: `non-portable raw "${ch}" in prose; MDX (Docusaurus) reads it as the start of ${role} — escape it (${entity}) or wrap the text in backticks`,
  };
}

/** Collapse whitespace and clip a raw-HTML snippet to a single readable line for a finding message. */
function clip(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 50 ? `${flat.slice(0, 50)}…` : flat;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Tally findings into the aggregate {@link CheckReport} counts. */
function summarize(findings: readonly CheckFinding[], fileCount: number): CheckReport {
  let errorCount = 0;
  let warningCount = 0;
  for (const finding of findings) {
    if (finding.severity === "error") {
      errorCount++;
    } else {
      warningCount++;
    }
  }
  return { findings, errorCount, warningCount, fileCount };
}

/**
 * The markdown **body** of a file — its content with a leading YAML frontmatter fence
 * removed — so heading and link extraction see the same body for a concept (frontmatter
 * stripped) and a frontmatter-free `index.md`/`log.md` (returned unchanged). Stripping the
 * fence matters: a `#`-prefixed YAML comment inside it would otherwise parse as a phantom
 * heading.
 *
 * Reuses the canonical parse boundary rather than re-rolling one: normalizeInput (the concept
 * parser's BOM/CRLF/leading-whitespace normalization) then gray-matter — the same fence split
 * concept.ts uses — so `lore check` and the parser cannot disagree on where a body begins.
 * gray-matter throws only on unparseable YAML; there the gate degrades to scanning the whole
 * (normalized) file rather than crashing — a genuinely malformed concept is `lore validate`'s
 * error to report, not `check`'s to die on. A file with no frontmatter (or no closing fence)
 * yields its whole content as the body.
 */
function bodyText(raw: string): string {
  const normalized = normalizeInput(raw);
  try {
    return matter(normalized).content;
  } catch {
    return normalized;
  }
}
