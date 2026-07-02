/**
 * managed-block.ts — regenerate the `<!-- lore:tasks:begin -->…<!-- lore:tasks:end -->` managed
 * region of a `Story`/`Spec` doc from live Backlog.md data (LORE-22, [ADR-0008]).
 *
 * A `Story` owns a set of Backlog tasks via its `tasks:` frontmatter list. So a reader sees live
 * task status without leaving the doc, lore maintains a **managed region** — a small GFM table
 * between two HTML-comment sentinels — that `lore sync` rewrites and `lore check` verifies without
 * writing. This module is the shared pure engine behind both; the command layer (LORE-24+) reads the
 * file bytes, calls the LORE-21 adapter's `viewTask(id)` once per linked task id to build the
 * {@link ManagedTaskRow rows}, invokes {@link regenerateTaskBlock}, and writes (or diffs) the result.
 *
 * ### Why a surgical string splice, not parse→stringify (the ADR-0008 amendment)
 *
 * [ADR-0008] §Decision describes building the block as mdast and re-serializing the document with a
 * frozen `remark-stringify`/`remark-gfm` config. lore, however, deliberately ships **no markdown
 * serializer** — the only markdown dependency is `mdast-util-from-markdown` (a parser); there is no
 * `remark-stringify`/`mdast-util-to-markdown` (ADR-0001 packaging constraint). Re-emitting the whole
 * document through a stringifier would also reflow the author's untouched prose (list markers,
 * emphasis, wrapping), which ADR-0008 §7 itself forbids. So this engine follows the settled lore
 * pattern ({@link rewriteInbound}, {@link generateIndexes}): **parse only to locate**, then splice a
 * frozen-format table STRING over the byte range strictly between the two marker nodes, copying every
 * other byte — frontmatter, editor modeline, and prose — verbatim. (ADR-0008's mdast prescription is
 * thus superseded on the serializer mechanism only; every guarantee it makes — structural location,
 * marker validation, byte-identity, bounded blast radius — is preserved here.)
 *
 * ### Structural location (what mdast buys over {@link generateIndexes}'s literal splice)
 *
 * Unlike {@link locateManagedBlock}'s `indexOf` scan, the markers are found **structurally**: the
 * document is parsed with `fromMarkdown` and only the direct children of the root that are `html`
 * nodes matching the canonical sentinel are candidates (ADR-0008 §1). A sentinel that appears inside
 * a fenced code block, a blockquote, or any other container is part of *that* node — never a
 * top-level `html` node — so it is never mistaken for a real marker. This is exactly the ambiguity
 * `generateIndexes`'s string splice documents as its one limitation.
 *
 * ### Guarantees
 *
 * - **Byte-identical on no change (AC#1).** Location is structural, row order is the caller's
 *   (deterministic) order, links come from the canonical `filePathRelative`, and the table is a
 *   frozen string — so regenerating an already-current block reproduces the exact same bytes, and a
 *   no-op `lore sync` touches zero bytes (the drift gate stays trustworthy). Splicing is a fixpoint.
 * - **Correct, portable links (AC#2).** Each row link is computed from the task's `filePathRelative`
 *   (the JSON's canonical repo-relative path) via {@link normalizeLink} — never reconstructed from
 *   the display id, which is upper-cased while the filename is lower-cased and carries the title with
 *   spaces (ADR-0008 §5). A linked id whose file is absent on the current branch is tolerated: its
 *   row renders the id as plain text rather than a broken link, and never errors.
 * - **Boundary safety.** Only the bytes between the markers change; the markers themselves and every
 *   byte before `begin`/after `end` pass through untouched. Malformed markers are a hard
 *   {@link LoreError} (`validation`, exit 6) — lore refuses to guess and never writes a partial block.
 *
 * Per the core contract (lore-design §2.1) this module is pure: a string (plus rows) in, a string or
 * a typed {@link LoreError} out — no filesystem, no spawn, no clock, no `process.exit`. Input is
 * expected to be LF-normalized (as every lore read path normalizes it — concept.ts `normalizeInput`).
 *
 * [ADR-0008]: ../../docs/adr/0008-managed-block-remark-ast.md
 */

import type { Nodes, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { LoreError, singleLine } from "../errors";
import { normalizeLink } from "./links";

/**
 * The HTML-comment sentinels bounding the managed task region (lore-design §6.2). HTML comments are
 * invisible in every target renderer (GitHub, Obsidian, MkDocs, Docusaurus), and the exact
 * `lore:tasks:*` tokens never occur in authored prose. Exported so `lore sync`/`lore check` and any
 * scaffolder emit and match the one canonical spelling. The parallel `lore:index:*` block that
 * {@link generateIndexes} owns uses the same shape.
 */
export const TASK_BLOCK_BEGIN = "<!-- lore:tasks:begin -->";
export const TASK_BLOCK_END = "<!-- lore:tasks:end -->";

/**
 * Match a top-level `html` node's value against a marker sentinel, tolerant of internal whitespace
 * (`<!--lore:tasks:begin-->` and the canonical spaced form both match) but requiring the node to be
 * *exactly* the marker comment — a node carrying other text (or both markers on one line) matches
 * neither, and is surfaced by {@link findMarkers}'s validation rather than silently paired.
 */
const BEGIN_MARKER = /^<!--\s*lore:tasks:begin\s*-->$/;
const END_MARKER = /^<!--\s*lore:tasks:end\s*-->$/;

/** The frozen table header row (single-space cell padding, ADR-0008 §Decision item 4). */
const TABLE_HEADER = "| Task | Title | Status |";
/** The frozen GFM delimiter row (compact, three dashes per column). */
const TABLE_DELIMITER = "|---|---|---|";
/** The frozen paragraph emitted in place of the table when a doc links no tasks (ADR-0008 §3). */
const NO_TASKS_PARAGRAPH = "_No linked tasks._";

/**
 * One task's row data, already resolved by the caller from a `backlog task view <id> --json` read
 * (the LORE-21 adapter's {@link BacklogTaskDetail}). The engine renders these verbatim in the given
 * order — it does not sort, fetch, or resolve; the caller supplies the ADR-0008 §4 order (the doc's
 * `tasks:` frontmatter list, with any out-of-band tasks appended in `task-N` numeric order).
 */
export interface ManagedTaskRow {
  /** The display-cased identity (`"LORE-42"`), shown as the row's link text verbatim (never a filename source). */
  readonly id: string;
  /** The task title, taken verbatim from the JSON (cell-normalized on render, never reflowed). */
  readonly title: string;
  /** The raw configured status string (`"Done"`, `"In Progress"`), verbatim from the JSON. */
  readonly status: string;
  /**
   * The task file's **repo-relative** path (`filePathRelative`, e.g. `backlog/tasks/lore-42 - x.md`),
   * or `null` when the task is not yet written to disk / absent on the current branch. A non-null
   * value is the link target (ADR-0008 §5); `null` is tolerated — the row renders the id as plain text.
   */
  readonly file: string | null;
}

/** Options for {@link regenerateTaskBlock}. */
export interface RegenerateTaskBlockOptions {
  /**
   * The **repo-relative** path of the doc being regenerated (`docs/stories/bulk-archive.md`). It
   * anchors each row link's relative computation against the task's repo-relative `filePathRelative`,
   * so a `docs/`-rooted story links a `backlog/`-rooted task as `../../backlog/tasks/…` (both operands
   * must share the repo-relative coordinate space — {@link normalizeLink}'s precondition).
   */
  readonly docPath: string;
}

/** A located marker: the mdast node and its `[start, end)` source byte offsets. */
interface Marker {
  readonly start: number;
  readonly end: number;
}

/**
 * Regenerate the managed task region of `content` from `rows`, returning the new full file bytes.
 *
 * The document is parsed only to locate the two top-level `html` marker nodes; the frozen table is
 * built as a string and spliced over the bytes strictly between them, so frontmatter, editor
 * modeline, and every line of prose outside the markers are preserved byte-for-byte. Regenerating an
 * already-current block reproduces identical bytes (AC#1), so the command layer can treat "no byte
 * difference" as a genuine no-op.
 *
 * @param content the doc's full raw bytes (LF-normalized), including frontmatter and the markers.
 * @param rows the linked tasks, in the caller's ADR-0008 §4 render order (may be empty).
 * @param options {@link RegenerateTaskBlockOptions.docPath} — the doc's repo-relative path for links.
 * @returns the new full file bytes with the region replaced.
 * @throws LoreError `validation` (exit 6) when the markers are missing, duplicated, unbalanced, or
 *   crossed — lore refuses to guess and never writes a partial or corrupted block (ADR-0008 §2).
 */
export function regenerateTaskBlock(
  content: string,
  rows: readonly ManagedTaskRow[],
  options: RegenerateTaskBlockOptions,
): string {
  const { begin, end } = findMarkers(content);
  const table = buildTable(rows, options.docPath);
  // Replace only the bytes between the markers with `\n{table}\n`; the begin node ends just after its
  // `-->` (its trailing newline is not part of the node), so this reproduces
  // `<!-- …begin -->\n{table}\n<!-- …end -->` — a fixpoint over already-generated bytes.
  return content.slice(0, begin.end) + `\n${table}\n` + content.slice(end.start);
}

/**
 * Locate the single balanced pair of top-level marker nodes in `content`, validating ADR-0008 §2.
 * The document is parsed with `fromMarkdown` and only the root's **direct** `html` children are
 * candidates, so a sentinel nested in a code fence or blockquote is never a marker.
 *
 * @throws LoreError `validation` when there is not exactly one begin and one end marker at top level,
 *   or the end precedes the begin (missing / duplicated / unbalanced / crossed).
 */
function findMarkers(content: string): { begin: Marker; end: Marker } {
  const tree: Root = fromMarkdown(content);
  const begins: Marker[] = [];
  const ends: Marker[] = [];
  for (const node of tree.children) {
    if (node.type !== "html") {
      continue;
    }
    const span = offsetsOf(node);
    if (span === null) {
      continue; // defensive: a parsed html node always carries offsets
    }
    if (BEGIN_MARKER.test(node.value)) {
      begins.push(span);
    } else if (END_MARKER.test(node.value)) {
      ends.push(span);
    }
  }

  if (begins.length === 0 || ends.length === 0) {
    throw markerError(
      `the managed task region is missing (need one \`${TASK_BLOCK_BEGIN}\` and one \`${TASK_BLOCK_END}\` at the document top level)`,
      { begins: begins.length, ends: ends.length },
    );
  }
  if (begins.length > 1 || ends.length > 1) {
    throw markerError(
      `the managed task region is duplicated (found ${begins.length} begin and ${ends.length} end markers; expected exactly one of each)`,
      { begins: begins.length, ends: ends.length },
    );
  }
  const begin = begins[0];
  const end = ends[0];
  if (begin === undefined || end === undefined) {
    throw markerError("the managed task region is missing", { begins: begins.length, ends: ends.length }); // unreachable given the counts above; narrows the element access without a non-null assertion
  }
  if (end.start < begin.end) {
    throw markerError("the managed task markers are crossed (the end marker precedes the begin marker)", {
      begin: begin.start,
      end: end.start,
    });
  }
  return { begin, end };
}

/** Build the fail-loud "malformed managed-block markers" error (ADR-0008 §2 → `validation`, exit 6). */
function markerError(reason: string, input: Record<string, unknown>): LoreError {
  return new LoreError(
    "validation",
    `cannot regenerate the \`lore:tasks\` block: ${reason}`,
    `place exactly one \`${TASK_BLOCK_BEGIN}\` and one \`${TASK_BLOCK_END}\` on their own lines, in order, at the top level of the doc`,
    input,
  );
}

/**
 * Build the frozen table string (no leading/trailing newline) for `rows`, or the "no linked tasks"
 * paragraph when there are none. The format is fixed byte-for-byte so identical input yields identical
 * output: a header row, a compact GFM delimiter, and one `| [id](link) | title | status |` row each.
 */
function buildTable(rows: readonly ManagedTaskRow[], docPath: string): string {
  if (rows.length === 0) {
    return NO_TASKS_PARAGRAPH;
  }
  const lines = [TABLE_HEADER, TABLE_DELIMITER];
  for (const row of rows) {
    lines.push(renderRow(row, docPath));
  }
  return lines.join("\n");
}

/**
 * Render one task as a table row. The id becomes the link text; its target is the canonical relative
 * link to the task file ({@link normalizeLink} over the repo-relative `docPath` and `file`). When the
 * file is absent (`null`), the id is rendered as plain text — the task still appears, marked, rather
 * than linking nowhere or erroring (ADR-0008 §5 tolerance).
 */
function renderRow(row: ManagedTaskRow, docPath: string): string {
  const label = escapeLinkText(row.id);
  const taskCell = row.file === null ? label : `[${label}](${normalizeLink(docPath, row.file)})`;
  return `| ${taskCell} | ${cell(row.title)} | ${cell(row.status)} |`;
}

/**
 * Normalize one JSON value into safe GFM **table-cell** text. Three deterministic defenses keep the
 * table well-formed and byte-stable regardless of the source string:
 *
 * - **single-line** ({@link singleLine}) — a title carrying a newline would otherwise split the row;
 * - **escape `|`** — an unescaped pipe would open a spurious extra column;
 * - **neutralize the comment sentinels** (`<!--`/`-->` → entities) — a value literally containing an
 *   end marker cannot then be mistaken for the region boundary (defense-in-depth beyond the structural
 *   location; matches {@link generateIndexes}'s `linkText`). The entities render identically.
 */
function cell(text: string): string {
  return singleLine(text).replace(/\|/g, "\\|").replace(/<!--/g, "&lt;!--").replace(/-->/g, "--&gt;");
}

/** Cell text for the id used as link **text**: additionally escape `[`/`]` so they cannot break the `[text](…)` syntax. */
function escapeLinkText(id: string): string {
  return cell(id).replace(/[[\]]/g, (c) => `\\${c}`);
}

/** A node's `[start, end)` source byte offsets, or `null` when position info is absent (defensive). */
function offsetsOf(node: Nodes): Marker | null {
  const position = node.position;
  if (position?.start.offset === undefined || position.end.offset === undefined) {
    return null;
  }
  return { start: position.start.offset, end: position.end.offset };
}
