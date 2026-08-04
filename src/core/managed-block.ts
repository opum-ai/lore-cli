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
 * ### The generic sibling ({@link upsertManagedBlock})
 *
 * {@link regenerateTaskBlock} owns one fixed region and *requires* an author-placed marker pair.
 * {@link upsertManagedBlock} is the **insert-or-update** engine for lore-owned blocks that lore must
 * be able to add to a file that has never carried them — `lore agents`'s `CLAUDE.md` nudge. It shares
 * this module's structural, whitespace-tolerant location and fail-loud malformed-marker validation,
 * differing only in that a total absence of markers is an insert, not an error.
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
 * Match a top-level `html` node's value against a marker sentinel, tolerant of whitespace both inside
 * the comment (`<!--lore:tasks:begin-->` and the canonical spaced form both match) and *around* it —
 * the node value is trimmed before matching, because `mdast-util-from-markdown` keeps a marker line's
 * leading indent (1–3 spaces) and trailing spaces in the `html` node's `value`, and an invisible
 * trailing space must not make a visibly-correct marker read as "missing". The node must still be
 * *exactly* the marker comment; a node carrying other text (or both markers on one line) matches
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
 * A top-level `html` node whose (trimmed) value contains marker-like text but does not *exactly*
 * match either the begin or end sentinel — most commonly a begin/end pair that CommonMark's HTML-block
 * rules collapse onto a single line with no separating newline (`<!-- label:begin --><!-- label:end
 * -->`), which `mdast-util-from-markdown` parses as ONE `html` node whose value equals neither anchored
 * pattern (LORE-156). Surfaced distinctly from "no markers at all" so this detected-but-malformed case
 * is never read as a genuinely absent block.
 */
interface MalformedMarkerNode {
  readonly span: Marker;
  readonly value: string;
}

/**
 * Strip the `^`/`$` anchors from an exact marker-matching `RegExp` (as built for {@link BEGIN_MARKER}/
 * {@link END_MARKER} or the per-label patterns in {@link locateLabeledMarkers}), returning a pattern
 * that matches the same marker text anywhere within a string rather than requiring the whole (trimmed)
 * string to be exactly the marker. Used by {@link collectMarkerSpans} to recognize marker text that is
 * present but not a clean, standalone sentinel (LORE-156).
 */
function loosenMarkerPattern(anchored: RegExp): RegExp {
  return new RegExp(anchored.source.replace(/^\^/, "").replace(/\$$/, ""));
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
  return `${content.slice(0, begin.end)}\n${table}\n${content.slice(end.start)}`;
}

/**
 * Scan `content` for top-level `html` marker nodes, returning the source spans of those matching
 * `beginMarker` / `endMarker`, plus any top-level `html` nodes that carry marker-like text without
 * being a clean, standalone sentinel (`malformed`). The document is parsed with `fromMarkdown` and
 * only the root's **direct** `html` children are candidates, so a sentinel nested in a code fence or
 * blockquote is never a marker; the node value is trimmed before matching because mdast keeps a marker
 * line's leading indent and trailing spaces in the `html` node's `value`. The one shared primitive
 * behind both {@link findMarkers} (the fixed `lore:tasks` region) and {@link locateLabeledMarkers} (any
 * labeled block), so the two never drift on how a marker is located — each applies its own validation
 * to the spans this returns.
 *
 * `malformed` exists for LORE-156: when a begin and end marker sit on one line with no separating
 * newline (`<!-- label:begin --><!-- label:end -->`), CommonMark's HTML-block rules make
 * `fromMarkdown` collapse them into a single `html` node whose trimmed value equals neither anchored
 * pattern — so without this check the node is silently skipped and the pair reads as "0 begins, 0
 * ends", indistinguishable from a genuinely marker-free document. A node lands in `malformed` when its
 * trimmed value doesn't exactly match `beginMarker`/`endMarker` but does contain one of them as a
 * substring (a non-anchored, "loose" version of the same pattern) — callers surface this distinctly
 * from a true absence so a detected-but-malformed pair is never mistaken for "no block yet".
 */
function collectMarkerSpans(
  content: string,
  beginMarker: RegExp,
  endMarker: RegExp,
): { begins: Marker[]; ends: Marker[]; malformed: MalformedMarkerNode[] } {
  const tree: Root = fromMarkdown(content);
  const begins: Marker[] = [];
  const ends: Marker[] = [];
  const malformed: MalformedMarkerNode[] = [];
  const looseBegin = loosenMarkerPattern(beginMarker);
  const looseEnd = loosenMarkerPattern(endMarker);
  for (const node of tree.children) {
    if (node.type !== "html") {
      continue;
    }
    const span = offsetsOf(node);
    if (span === null) {
      continue; // defensive: a parsed html node always carries offsets
    }
    const value = node.value.trim();
    if (beginMarker.test(value)) {
      begins.push(span);
    } else if (endMarker.test(value)) {
      ends.push(span);
    } else if (looseBegin.test(value) || looseEnd.test(value)) {
      malformed.push({ span, value });
    }
  }
  return { begins, ends, malformed };
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
  const { begins, ends, malformed } = collectMarkerSpans(content, BEGIN_MARKER, END_MARKER);

  if (malformed.length > 0) {
    throw markerError(
      `found marker text that is not a clean, standalone \`${TASK_BLOCK_BEGIN}\`/\`${TASK_BLOCK_END}\` sentinel on its own line (commonly a begin/end pair placed on the same line with no separating newline): \`${malformed[0]?.value ?? ""}\``,
      { begins: begins.length, ends: ends.length, malformed: malformed.length },
    );
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

/**
 * Build the fail-loud "malformed managed-block markers" error for the fixed `lore:tasks` region
 * (ADR-0008 §2 → `validation`, exit 6). A thin specialization of {@link labeledMarkerError} so the
 * tasks-block and generic-block diagnostics share one wording/shape and cannot drift.
 */
function markerError(reason: string, input: Record<string, unknown>): LoreError {
  return labeledMarkerError("lore:tasks", reason, input);
}

/**
 * The `lore:tasks` region's full `[start, end)` byte span (markers included), located
 * **structurally** — the same {@link collectMarkerSpans} mdast scan {@link findMarkers} uses — or
 * `null` when the document carries no `lore:tasks` markers at all (most docs; only a linked
 * `Story`/`Spec` do). Exported for `core/replace.ts`'s managed-region registry, which must protect
 * exactly the span {@link regenerateTaskBlock} would rewrite.
 *
 * Deliberately **not** `indexes.ts`'s `locateManagedBlock` literal `indexOf` scan: that scan is safe
 * for `lore:index` only because the marker text never occurs outside a real index block in practice,
 * but `lore:tasks:begin`/`:end` are routinely *cited* in this project's own prose and fenced code
 * examples documenting the format — a literal scan misfires on those (a false "duplicated"/"unmatched"
 * validation error, or worse, silently treating a prose citation as a real block) (LORE-73). The
 * structural, top-level-`html`-node-only location this module already uses for `lore sync`/`lore
 * check` has no such ambiguity: a sentinel inside a code fence or blockquote is never a marker.
 *
 * @throws LoreError `validation` when markers are present but malformed (duplicated, unmatched, or
 *   crossed) — the same fail-loud contract {@link findMarkers} enforces. Total absence is `null`, not
 *   an error: a file with no `lore:tasks` block has nothing to protect.
 */
export function locateTaskBlock(content: string): { start: number; end: number } | null {
  const { begins, ends, malformed } = collectMarkerSpans(content, BEGIN_MARKER, END_MARKER);
  if (begins.length === 0 && ends.length === 0 && malformed.length === 0) {
    return null;
  }
  const { begin, end } = findMarkers(content);
  return { start: begin.start, end: end.end };
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
 * file is absent — `null`, or the empty string a not-yet-written task can carry — the id is rendered
 * as plain text: the task still appears, marked, rather than linking to a broken `..md` target or
 * erroring (ADR-0008 §5 tolerance).
 */
function renderRow(row: ManagedTaskRow, docPath: string): string {
  const label = escapeLinkText(row.id);
  const taskCell = row.file === null || row.file === "" ? label : `[${label}](${normalizeLink(docPath, row.file)})`;
  return `| ${taskCell} | ${cell(row.title)} | ${cell(row.status)} |`;
}

/**
 * Normalize one JSON value into safe GFM **table-cell** text. Four deterministic defenses keep the
 * table well-formed and byte-stable regardless of the source string:
 *
 * - **single-line** ({@link singleLine}) — a title carrying a newline would otherwise split the row;
 * - **escape `\`** — done *first*, before the `|` escape below. A pre-existing literal backslash
 *   immediately before a pipe (e.g. a title `x\|y`) would otherwise combine with the pipe-escape's
 *   inserted backslash into CommonMark's `\\` (an escaped backslash) followed by a live, cell-splitting
 *   `|` — silently adding a column. Doubling backslashes first, before any escaping backslashes are
 *   introduced, means the later steps' own backslashes are never mistaken for source content and never
 *   re-escaped.
 * - **escape `|`** — an unescaped pipe would open a spurious extra column;
 * - **neutralize the comment sentinels** (`<!--`/`-->` → entities) — a value literally containing an
 *   end marker cannot then be mistaken for the region boundary (defense-in-depth beyond the structural
 *   location; matches {@link generateIndexes}'s `linkText`). The entities render identically.
 */
function cell(text: string): string {
  return singleLine(text)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/<!--/g, "&lt;!--")
    .replace(/-->/g, "--&gt;");
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

/**
 * Insert or refresh a generic lore-managed block delimited by `<!-- {label}:begin -->` …
 * `<!-- {label}:end -->`, returning the new full file bytes.
 *
 * This is the **insert-or-update** sibling of {@link regenerateTaskBlock}. That engine owns the
 * fixed `lore:tasks` region and deliberately *requires* an author-placed marker pair (a missing
 * pair is a hard error), because a Story's task block only ever regenerates in a doc that already
 * declares it. `lore agents`'s `CLAUDE.md` nudge is the opposite shape: lore must be able to add
 * the block to a file that has never seen it. So this function tolerates a total absence of markers
 * (it appends the block) while keeping every other guarantee of {@link regenerateTaskBlock} —
 * structural, whitespace-tolerant location and fail-loud validation of a malformed pair.
 *
 * `label` names the region (`"lore:agents"`); `body` is the pre-rendered inner content, with no
 * surrounding newlines (the engine adds exactly one on each side).
 *
 * - **No markers present** → append the block after the file's existing content, which is preserved
 *   **byte-for-byte** (including an unrelated managed block like Backlog.md's, and any trailing
 *   whitespace); only the separation needed to guarantee a blank line before the block is added. An
 *   empty or whitespace-only file yields the block alone. If the existing content ends inside an
 *   unterminated code fence or `<!--` comment — which would swallow the appended markers so they are
 *   not at the top level — this is a fail-loud `validation` error rather than a silent, duplicating
 *   append (a later run, finding no top-level markers, would otherwise append a *second* block).
 * - **Exactly one balanced pair** → splice `\n{body}\n` between the markers, copying every other
 *   byte. The insert and update forms converge on the same canonical bytes, so regenerating an
 *   already-current block reproduces byte-identical output (idempotent) — the command layer can
 *   treat "no byte difference" as a genuine no-op. The result is re-located the same way the insert
 *   form is: a `body` that itself contains marker-like text, or disrupts top-level parsing (e.g. an
 *   unterminated code fence), is a fail-loud `validation` error rather than silently corrupted content.
 * - **Malformed** (a lone begin/end, duplicated markers, or a crossed pair) → a `validation`
 *   {@link LoreError} (exit 6); lore refuses to guess and never writes a partial block.
 *
 * Input is expected LF-normalized (the caller normalizes on read, as every lore read path does).
 */
export function upsertManagedBlock(content: string, options: { label: string; body: string }): string {
  const { label, body } = options;
  const block = `<!-- ${label}:begin -->\n${body}\n<!-- ${label}:end -->`;
  const located = locateLabeledMarkers(content, label);
  if (located !== null) {
    // Update: replace only the bytes strictly between the markers with `\n{body}\n` — a fixpoint over
    // already-current bytes (the begin node ends just after its `-->`, matching the insert form below).
    const updated = `${content.slice(0, located.begin.end)}\n${body}\n${content.slice(located.end.start)}`;
    // The splice must still parse as a single clean top-level marker pair. If `body` itself contains
    // marker-like text, or opens an unterminated code fence/comment that swallows a marker, the
    // structure breaks — re-locate in the result and fail loud instead of silently returning corrupted
    // content (mirrors the insert branch's post-condition check below).
    if (locateLabeledMarkers(updated, label) === null) {
      throw labeledMarkerError(
        label,
        "the updated body disrupts the document's top-level marker structure, so the block can no longer be located",
        { label },
      );
    }
    return updated;
  }
  // Insert: append the block, preserving `content` verbatim (only the blank-line separation is added).
  const inserted = appendBlock(content, block);
  // The append must land at the document top level. If `content` ends inside an unterminated code
  // fence or `<!--` comment, the appended markers are parsed *inside* that construct and are not
  // top-level nodes — a re-run would find none and append again, multiplying the block. Detect that
  // by re-locating in the result and fail loud instead of silently duplicating.
  if (locateLabeledMarkers(inserted, label) === null) {
    throw labeledMarkerError(
      label,
      "the document ends inside an unterminated code fence or `<!--` comment, so the block cannot be appended at the top level",
      { label },
    );
  }
  return inserted;
}

/**
 * Append `block` after `content`, preserving `content` byte-for-byte and adding only the separation
 * needed to guarantee a blank line before the block. An empty or whitespace-only `content` yields the
 * block alone (no leading blank lines on an otherwise-empty file).
 */
function appendBlock(content: string, block: string): string {
  if (!/\S/.test(content)) {
    return `${block}\n`;
  }
  const separator = content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${block}\n`;
}

/** Escape a literal for safe embedding in a `RegExp`. The label is lore-internal, but the matcher stays robust. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Locate the balanced `<!-- {label}:begin -->` / `<!-- {label}:end -->` marker pair in `content`, or
 * `null` when the file carries neither marker (the insert case {@link upsertManagedBlock} needs).
 * Shares {@link collectMarkerSpans} with {@link findMarkers} (so marker *location* never drifts
 * between the two); the one behavioral difference is that a *total* absence returns `null` instead of
 * throwing — a marker pair present yet malformed (a lone begin/end, duplicated, crossed, or collapsed
 * onto one line with no separating newline — LORE-156) is still a fail-loud `validation` error, never
 * read as "no block yet" (which would make {@link upsertManagedBlock} append a second, duplicate block
 * alongside the untouched malformed pair).
 *
 * @throws LoreError `validation` when markers are present but malformed.
 */
function locateLabeledMarkers(content: string, label: string): { begin: Marker; end: Marker } | null {
  const beginMarker = new RegExp(`^<!--\\s*${escapeRegExp(label)}:begin\\s*-->$`);
  const endMarker = new RegExp(`^<!--\\s*${escapeRegExp(label)}:end\\s*-->$`);
  const { begins, ends, malformed } = collectMarkerSpans(content, beginMarker, endMarker);

  if (malformed.length > 0) {
    // Marker text is present but not a clean, standalone sentinel — most commonly a begin/end pair
    // mdast collapsed onto one line (LORE-156). This must never be read as "no block yet": returning
    // null here would make the caller append a fresh block after the untouched malformed pair,
    // silently duplicating it.
    throw labeledMarkerError(
      label,
      `found marker text that is not a clean, standalone \`<!-- ${label}:begin -->\`/\`<!-- ${label}:end -->\` sentinel on its own line (commonly a begin/end pair placed on the same line with no separating newline): \`${malformed[0]?.value ?? ""}\``,
      { malformed: malformed.length },
    );
  }
  if (begins.length === 0 && ends.length === 0) {
    return null; // no block yet — the caller inserts one
  }
  if (begins.length !== 1 || ends.length !== 1) {
    throw labeledMarkerError(
      label,
      `expected exactly one \`<!-- ${label}:begin -->\` and one \`<!-- ${label}:end -->\`, found ${begins.length} begin and ${ends.length} end`,
      { begins: begins.length, ends: ends.length },
    );
  }
  const begin = begins[0];
  const end = ends[0];
  if (begin === undefined || end === undefined) {
    return null; // unreachable given the counts above; narrows the element access without a non-null assertion
  }
  if (end.start < begin.end) {
    throw labeledMarkerError(label, "the markers are crossed (the end marker precedes the begin marker)", {
      begin: begin.start,
      end: end.start,
    });
  }
  return { begin, end };
}

/**
 * Build the fail-loud "malformed managed-block markers" error for a labeled block (`validation`,
 * exit 6). The one builder behind both the generic and `lore:tasks`-specific ({@link markerError})
 * diagnostics, so their wording and shape stay in lockstep.
 */
function labeledMarkerError(label: string, reason: string, input: Record<string, unknown>): LoreError {
  return new LoreError(
    "validation",
    `cannot regenerate the \`${label}\` block: ${reason}`,
    `place exactly one \`<!-- ${label}:begin -->\` and one \`<!-- ${label}:end -->\` on their own lines, in order, at the top level of the doc`,
    input,
  );
}
