/**
 * core/markdown-render.ts — render a markdown body as terminal text, for `lore read`'s pretty mode
 * (LCLI-615).
 *
 * Pure and deterministic: the same `(source, { color, width })` always yields the same string, and
 * nothing here reads the process, the environment or a stream. The caller owns the two decisions
 * that depend on the terminal — whether color is allowed (`output.ts`, cli-contract §6) and how
 * wide the terminal is — and passes them in, so every rendering path is testable without a TTY.
 *
 * The parse is the parser lore already ships (`mdast-util-from-markdown`) plus the GFM syntax
 * extensions (`micromark-extension-gfm` / `mdast-util-gfm`'s `gfmFromMarkdown`) so tables, task
 * lists, strikethrough, autolinks and footnotes parse as themselves. Only the `fromMarkdown` halves
 * are imported: tech-stack §5 keeps lore parse-only, and nothing here serializes markdown.
 *
 * **Security (LCLI-249 / LCLI-153 class).** A document is untrusted input to a terminal. Every ESC
 * sequence, C0/C1 control byte and bidi/invisible format character is removed twice, with the one
 * shared primitive {@link stripAnsiAndControls} — never a second copy of it:
 *
 * 1. from the **source**, before parsing, so a raw escape in the file never reaches the parser; and
 * 2. from **every string taken from the tree** (text, code, URLs, alt text, HTML, labels), because
 *    the parser DECODES character references: `&#13;` becomes a carriage return and `&#x202E;` a
 *    right-to-left override, neither of which existed as a byte in the source. micromark replaces
 *    most control code points with U+FFFD, but deliberately keeps 9, 10, 12 and 13 and every
 *    non-control format character.
 *
 * Line feeds and tabs survive both passes (they are layout, not control), which is why the strip is
 * applied between them rather than across them.
 *
 * **Color versus layout.** With `color: false` (`NO_COLOR`, cli-contract §6) no escape sequence is
 * emitted at all, and the layout still renders: heading markers, bullets and numbers, task boxes,
 * quote bars, the indented code block, table rules. Emphasis, strong, strikethrough and inline code
 * fall back to their textual markers (`_x_`, `**x**`, `~~x~~`, `` `x` ``), so no meaning is carried
 * by color alone.
 *
 * **Links** render as `text (url)`. No OSC 8 hyperlink is ever emitted: that needs terminal
 * detection which fails closed, and plain text is correct everywhere.
 *
 * **Width.** Prose and headings are word-wrapped to the width. Code blocks are never reflowed: a line
 * wider than the space available is cut and ends in `…`. Tables shrink their widest columns and cut
 * cells the same way.
 */

import type {
  Blockquote,
  Code,
  FootnoteDefinition,
  Heading,
  List,
  Nodes,
  PhrasingContent,
  Root,
  RootContent,
  Table,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import stringWidth from "string-width";

import { stripAnsiAndControls } from "../errors";

/** The width used when the terminal does not report one (or reports something unusable). */
export const DEFAULT_RENDER_WIDTH = 80;

/** Below this many columns there is no useful layout; a smaller reported width is ignored. */
const MIN_RENDER_WIDTH = 20;

/** Options for {@link renderMarkdownForTerminal}. */
export interface MarkdownRenderOptions {
  /** Whether ANSI SGR styling may be emitted. `false` emits no escape sequence at all. */
  readonly color: boolean;
  /** The terminal width in columns; pass the result of {@link renderWidth}. */
  readonly width: number;
}

/**
 * Resolve the render width from a terminal's reported column count (`process.stdout.columns`):
 * a finite integer of at least {@link MIN_RENDER_WIDTH} is used as-is; anything else — `undefined`
 * off a TTY, `0` from some emulated consoles, `NaN` — falls back to {@link DEFAULT_RENDER_WIDTH}.
 */
export function renderWidth(columns: number | undefined): number {
  if (columns === undefined || !Number.isInteger(columns) || columns < MIN_RENDER_WIDTH) {
    return DEFAULT_RENDER_WIDTH;
  }
  return columns;
}

/**
 * Remove every terminal control sequence from `text` while keeping its line feeds and tabs:
 * {@link stripAnsiAndControls} applied to each run between them. A CSI sequence cannot contain a line
 * feed or tab, and an OSC split by one loses its ESC either way (the primitive's two-byte form and
 * its control-byte pass both remove it), so no escape survives the split.
 */
export function neutraliseControls(text: string): string {
  return text.replace(/[^\n\t]+/g, (run) => stripAnsiAndControls(run));
}

/**
 * Render `source` (a markdown body, frontmatter already removed) as terminal text. The result has no
 * trailing newline.
 */
export function renderMarkdownForTerminal(source: string, options: MarkdownRenderOptions): string {
  const tree: Root = fromMarkdown(neutraliseControls(source), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const ctx: RenderContext = { color: options.color, definitions: collectDefinitions(tree) };
  return renderBlocks(tree.children, ctx, Math.max(options.width, 1), true).join("\n");
}

// --- styling ---------------------------------------------------------------------------------------

const SGR = Object.freeze({
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  strike: "\x1b[9m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
});

interface RenderContext {
  readonly color: boolean;
  /** Link reference definitions by normalized identifier, so `[text][ref]` can show its URL. */
  readonly definitions: ReadonlyMap<string, string>;
}

/** Wrap `text` in `sgr` (reset-terminated) when color is on and there is something to wrap. */
function paint(text: string, sgr: string, ctx: RenderContext): string {
  return ctx.color && sgr !== "" && text !== "" ? `${sgr}${text}${SGR.reset}` : text;
}

/** A string taken from the parsed tree, cleaned of anything the parser decoded into a control. */
function clean(text: string | null | undefined): string {
  return neutraliseControls(text ?? "");
}

// --- blocks ----------------------------------------------------------------------------------------

/** Render a sequence of block nodes; `spread` separates them with a blank line. */
function renderBlocks(nodes: readonly RootContent[], ctx: RenderContext, width: number, spread: boolean): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const lines = renderBlock(node, ctx, width);
    if (lines.length === 0) {
      continue;
    }
    if (out.length > 0 && spread) {
      out.push("");
    }
    out.push(...lines);
  }
  return out;
}

function renderBlock(node: RootContent, ctx: RenderContext, width: number): string[] {
  switch (node.type) {
    case "heading":
      return renderHeading(node, ctx, width);
    case "paragraph":
      return wrapRuns(inlineRuns(node.children, ctx, ""), width, ctx);
    case "blockquote":
      return renderBlockquote(node, ctx, width);
    case "list":
      return renderList(node, ctx, width);
    case "code":
      return renderCode(node, ctx, width);
    case "table":
      return renderTable(node, ctx, width);
    case "thematicBreak":
      return [paint("─".repeat(Math.min(width, DEFAULT_RENDER_WIDTH)), SGR.dim, ctx)];
    case "html":
      return clean(node.value)
        .split("\n")
        .map((line) => paint(capWidth(expandTabs(line), width), SGR.dim, ctx));
    case "definition":
      return [paint(capWidth(`[${clean(node.label ?? node.identifier)}]: ${clean(node.url)}`, width), SGR.dim, ctx)];
    case "footnoteDefinition":
      return renderFootnoteDefinition(node, ctx, width);
    default:
      return renderUnknown(node, ctx, width);
  }
}

function renderHeading(node: Heading, ctx: RenderContext, width: number): string[] {
  const marker = `${"#".repeat(node.depth)} `;
  const sgr = node.depth === 1 ? `${SGR.bold}${SGR.underline}` : SGR.bold;
  const lines = wrapRuns(inlineRuns(node.children, ctx, sgr), Math.max(width - marker.length, 1), ctx);
  return lines.map((line, i) =>
    i === 0 ? `${paint(marker, `${SGR.bold}${SGR.magenta}`, ctx)}${line}` : `${" ".repeat(marker.length)}${line}`,
  );
}

function renderBlockquote(node: Blockquote, ctx: RenderContext, width: number): string[] {
  const bar = paint("│", SGR.dim, ctx);
  return renderBlocks(node.children, ctx, Math.max(width - 2, 1), true).map((line) =>
    line === "" ? bar : `${bar} ${line}`,
  );
}

function renderList(node: List, ctx: RenderContext, width: number): string[] {
  const start = node.start ?? 1;
  const bullets = node.children.map((_, i) => (node.ordered ? `${start + i}.` : "•"));
  // One bullet column for the whole list, so `9.` and `10.` align their text.
  const bulletWidth = Math.max(...bullets.map((b) => stringWidth(b))) + 1;
  const loose = node.spread === true;
  const out: string[] = [];
  node.children.forEach((item, i) => {
    const bullet = bullets[i] as string;
    // A task box belongs to its own item only: it must not widen its untasked siblings.
    const box = item.checked === true ? "[x] " : item.checked === false ? "[ ] " : "";
    const indent = bulletWidth + box.length;
    const body = renderBlocks(item.children, ctx, Math.max(width - indent, 1), loose || item.spread === true);
    if (out.length > 0 && loose) {
      out.push("");
    }
    const head = `${paint(bullet, SGR.dim, ctx)}${" ".repeat(bulletWidth - stringWidth(bullet))}${box}`;
    if (body.length === 0) {
      out.push(head.trimEnd());
      return;
    }
    body.forEach((line, j) => {
      if (j === 0) {
        out.push(`${head}${line}`);
      } else {
        out.push(line === "" ? "" : `${" ".repeat(indent)}${line}`);
      }
    });
  });
  return out;
}

/** Four-space indented, never reflowed; an over-wide line is cut and ends in `…`. */
function renderCode(node: Code, ctx: RenderContext, width: number): string[] {
  const indent = "    ";
  const available = Math.max(width - indent.length, 1);
  return clean(node.value)
    .split("\n")
    .map((line) => {
      const capped = capWidth(expandTabs(line), available);
      return capped === "" ? "" : `${indent}${paint(capped, SGR.cyan, ctx)}`;
    });
}

function renderFootnoteDefinition(node: FootnoteDefinition, ctx: RenderContext, width: number): string[] {
  const label = `[^${clean(node.label ?? node.identifier)}]: `;
  const labelWidth = stringWidth(label);
  const body = renderBlocks(node.children, ctx, Math.max(width - labelWidth, 1), true);
  const head = paint(label.trimEnd(), SGR.dim, ctx);
  if (body.length === 0) {
    return [head];
  }
  return body.map((line, i) => (i === 0 ? `${head} ${line}` : line === "" ? "" : `${" ".repeat(labelWidth)}${line}`));
}

/** A node type this renderer does not special-case: its children, else its text, else nothing. */
function renderUnknown(node: RootContent, ctx: RenderContext, width: number): string[] {
  const n = node as Nodes & { children?: unknown; value?: unknown };
  if (Array.isArray(n.children)) {
    return renderBlocks(n.children as RootContent[], ctx, width, true);
  }
  if (typeof n.value === "string") {
    return clean(n.value)
      .split("\n")
      .map((line) => capWidth(expandTabs(line), width));
  }
  return [];
}

// --- tables ----------------------------------------------------------------------------------------

function renderTable(node: Table, ctx: RenderContext, width: number): string[] {
  // Cells are rendered without styling so they can be measured, cut and padded as plain strings.
  const plainCtx: RenderContext = { ...ctx, color: false };
  const rows = node.children.map((row) =>
    row.children.map((cell) =>
      runsToText(inlineRuns(cell.children, plainCtx, ""))
        .replace(/[ \t\n]+/g, " ")
        .trim(),
    ),
  );
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (columns === 0) {
    return [];
  }
  const widths = Array.from({ length: columns }, (_, c) =>
    Math.max(1, ...rows.map((row) => stringWidth(row[c] ?? ""))),
  );
  const separator = " │ ";
  const total = (): number => widths.reduce((sum, w) => sum + w, 0) + separator.length * (columns - 1);
  while (total() > width) {
    const widest = widths.indexOf(Math.max(...widths));
    if ((widths[widest] as number) <= 3) {
      break;
    }
    widths[widest] = (widths[widest] as number) - 1;
  }
  const align = node.align ?? [];
  const renderRow = (row: readonly string[]): string =>
    widths
      .map((w, c) => alignCell(capWidth(row[c] ?? "", w), w, align[c] ?? null))
      .join(separator)
      .trimEnd();
  const out: string[] = [];
  rows.forEach((row, r) => {
    if (r === 0) {
      out.push(paint(renderRow(row), SGR.bold, ctx));
      out.push(paint(widths.map((w) => "─".repeat(w)).join("─┼─"), SGR.dim, ctx));
    } else {
      out.push(renderRow(row));
    }
  });
  return out;
}

function alignCell(text: string, w: number, align: "left" | "right" | "center" | null): string {
  const gap = Math.max(w - stringWidth(text), 0);
  if (align === "right") {
    return `${" ".repeat(gap)}${text}`;
  }
  if (align === "center") {
    const left = Math.floor(gap / 2);
    return `${" ".repeat(left)}${text}${" ".repeat(gap - left)}`;
  }
  return `${text}${" ".repeat(gap)}`;
}

// --- inline ----------------------------------------------------------------------------------------

/** A styled span of inline text, or a hard line break. `sgr` is the accumulated opening sequence. */
type Run = { readonly text: string; readonly sgr: string } | { readonly hardBreak: true };

function inlineRuns(nodes: readonly PhrasingContent[], ctx: RenderContext, sgr: string): Run[] {
  const runs: Run[] = [];
  const marked = (marker: string, children: readonly PhrasingContent[], style: string): void => {
    if (ctx.color) {
      runs.push(...inlineRuns(children, ctx, `${sgr}${style}`));
    } else {
      runs.push({ text: marker, sgr }, ...inlineRuns(children, ctx, sgr), { text: marker, sgr });
    }
  };
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        runs.push({ text: clean(node.value), sgr });
        break;
      case "emphasis":
        marked("_", node.children, SGR.italic);
        break;
      case "strong":
        marked("**", node.children, SGR.bold);
        break;
      case "delete":
        marked("~~", node.children, SGR.strike);
        break;
      case "inlineCode":
        runs.push(
          ctx.color ? { text: clean(node.value), sgr: `${sgr}${SGR.cyan}` } : { text: `\`${clean(node.value)}\``, sgr },
        );
        break;
      case "break":
        runs.push({ hardBreak: true });
        break;
      case "link": {
        const text = inlineRuns(node.children, ctx, `${sgr}${SGR.underline}${SGR.blue}`);
        runs.push(...text, ...urlSuffix(runsToText(text), clean(node.url), sgr));
        break;
      }
      case "linkReference": {
        const text = inlineRuns(node.children, ctx, `${sgr}${SGR.underline}${SGR.blue}`);
        const url = ctx.definitions.get(node.identifier.toLowerCase());
        runs.push(...text, ...(url === undefined ? [] : urlSuffix(runsToText(text), url, sgr)));
        break;
      }
      case "image":
        runs.push(
          { text: `[image: ${clean(node.alt)}]`, sgr: `${sgr}${SGR.magenta}` },
          ...urlSuffix("", clean(node.url), sgr),
        );
        break;
      case "imageReference": {
        const url = ctx.definitions.get(node.identifier.toLowerCase());
        runs.push(
          { text: `[image: ${clean(node.alt)}]`, sgr: `${sgr}${SGR.magenta}` },
          ...(url === undefined ? [] : urlSuffix("", url, sgr)),
        );
        break;
      }
      case "footnoteReference":
        runs.push({ text: `[^${clean(node.label ?? node.identifier)}]`, sgr: `${sgr}${SGR.dim}` });
        break;
      case "html":
        runs.push({ text: clean(node.value), sgr: `${sgr}${SGR.dim}` });
        break;
      default: {
        const n = node as { children?: unknown; value?: unknown };
        if (Array.isArray(n.children)) {
          runs.push(...inlineRuns(n.children as PhrasingContent[], ctx, sgr));
        } else if (typeof n.value === "string") {
          runs.push({ text: clean(n.value), sgr });
        }
      }
    }
  }
  return runs;
}

/** ` (url)`, dimmed — omitted when the link text already IS the URL (an autolink). */
function urlSuffix(text: string, url: string, sgr: string): Run[] {
  if (url === "" || url === text || url === `mailto:${text}`) {
    return [];
  }
  return [
    { text: " (", sgr },
    { text: url, sgr: `${sgr}${SGR.dim}` },
    { text: ")", sgr },
  ];
}

function runsToText(runs: readonly Run[]): string {
  return runs.map((run) => ("hardBreak" in run ? "\n" : run.text)).join("");
}

/**
 * Greedy word wrap over styled runs. Each word is painted on its own, so a style never spans a line
 * break and a container prefix (a quote bar, a list indent) is never painted by a style it precedes.
 * A word wider than the line is left whole on a line of its own rather than split mid-token.
 */
function wrapRuns(runs: readonly Run[], width: number, ctx: RenderContext): string[] {
  const lines: string[] = [];
  let line = "";
  let lineWidth = 0;
  let word = "";
  let wordWidth = 0;
  const flushWord = (): void => {
    if (wordWidth === 0 && word === "") {
      return;
    }
    if (lineWidth > 0 && lineWidth + 1 + wordWidth > width) {
      lines.push(line);
      line = "";
      lineWidth = 0;
    }
    if (lineWidth > 0) {
      line += " ";
      lineWidth += 1;
    }
    line += word;
    lineWidth += wordWidth;
    word = "";
    wordWidth = 0;
  };
  for (const run of runs) {
    if ("hardBreak" in run) {
      flushWord();
      lines.push(line);
      line = "";
      lineWidth = 0;
      continue;
    }
    for (const part of run.text.split(/([ \t\n]+)/)) {
      if (part === "") {
        continue;
      }
      if (/^[ \t\n]+$/.test(part)) {
        flushWord();
        continue;
      }
      word += paint(part, run.sgr, ctx);
      wordWidth += stringWidth(part);
    }
  }
  flushWord();
  lines.push(line);
  return lines;
}

// --- measurement -----------------------------------------------------------------------------------

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Cut `text` (unstyled) to at most `width` display columns, ending in `…` when anything was cut. */
function capWidth(text: string, width: number): string {
  if (stringWidth(text) <= width) {
    return text;
  }
  const room = Math.max(width - 1, 0);
  let out = "";
  let used = 0;
  for (const { segment } of graphemes.segment(text)) {
    const w = stringWidth(segment);
    if (used + w > room) {
      break;
    }
    out += segment;
    used += w;
  }
  return `${out}…`;
}

/** Expand tabs to four-column tab stops, so a code line's width is measurable and stable. */
function expandTabs(line: string): string {
  if (!line.includes("\t")) {
    return line;
  }
  let out = "";
  let column = 0;
  for (const { segment } of graphemes.segment(line)) {
    if (segment === "\t") {
      const pad = 4 - (column % 4);
      out += " ".repeat(pad);
      column += pad;
    } else {
      out += segment;
      column += stringWidth(segment);
    }
  }
  return out;
}

function collectDefinitions(tree: Root): Map<string, string> {
  const definitions = new Map<string, string>();
  const visit = (nodes: readonly Nodes[]): void => {
    for (const node of nodes) {
      if (node.type === "definition" && !definitions.has(node.identifier.toLowerCase())) {
        definitions.set(node.identifier.toLowerCase(), clean(node.url));
      }
      const children = (node as { children?: unknown }).children;
      if (Array.isArray(children)) {
        visit(children as Nodes[]);
      }
    }
  };
  visit(tree.children);
  return definitions;
}
