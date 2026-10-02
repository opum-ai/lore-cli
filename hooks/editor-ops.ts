// LCLI-664. The pane's lightweight body editor: every editing operation, as a pure
// function over an immutable `@codemirror/state` state — so the client surface module
// that draws and keys it stays a drawing, and every operation is unit-testable with no
// engine present.
//
// What is the library's and what is this file's: the document, the transactions, the
// line index and grapheme-cluster boundaries are `@codemirror/state`'s (vendored, see
// `hooks/vendor/README.md`); this file is the key mapping and the undo ring over its
// states. Nothing here re-implements text handling — cursor motion goes through
// `findClusterBreak`, and every edit goes through `state.update`, so combining marks,
// emoji and surrogate pairs move and delete the way the library moves them.

import { EditorState, findClusterBreak } from "./vendor/codemirror-state.js";

/** The editor's whole local state: the CodeMirror state, plus an undo ring over it. */
export type EditorLocal = {
  readonly state: EditorState;
  readonly past: readonly EditorState[];
  readonly future: readonly EditorState[];
};

/** Steps kept in each direction. A document body is small; the ring is capped anyway. */
const HISTORY_CAP = 100;

export function editorCreate(text: string): EditorLocal {
  // The cursor starts at the end of the body: the editor is opened to add to a
  // document, and `EditorState.create` would otherwise put it at position 0.
  const state = EditorState.create({ doc: text });

  return { state: state.update({ selection: { anchor: text.length } }).state, past: [], future: [] };
}

export function editorText(local: EditorLocal): string {
  return local.state.doc.toString();
}

export function editorCursor(local: EditorLocal): number {
  return local.state.selection.main.head;
}

/**
 * One edit: the previous state joins the undo ring and the redo ring is dropped.
 *
 * An update that leaves the document alone is not an edit. `state.update` returns a
 * NEW state for a transaction whose change range is empty, and adopting it would put
 * a step on the undo ring that undoes nothing — a Ctrl+Z that appears dead — and drop
 * the redo ring along with it.
 */
function edited(local: EditorLocal, next: EditorState): EditorLocal {
  if (next === local.state || next.doc.eq(local.state.doc)) {
    return local;
  }

  return { state: next, past: [...local.past, local.state].slice(-HISTORY_CAP), future: [] };
}

/** A cursor move: `state.update` returns the same state when nothing changed. */
function moved(local: EditorLocal, anchor: number, head = anchor): EditorLocal {
  const next = local.state.update({ selection: { anchor, head } }).state;

  return next === local.state ? local : { ...local, state: next };
}

export function insertText(local: EditorLocal, text: string): EditorLocal {
  if (text === "") {
    return local;
  }
  const { from, to } = local.state.selection.main;

  return edited(
    local,
    local.state.update({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } }).state,
  );
}

export function deleteBackward(local: EditorLocal): EditorLocal {
  const { from, to } = local.state.selection.main;
  if (from !== to) {
    return edited(local, local.state.update({ changes: { from, to, insert: "" }, selection: { anchor: from } }).state);
  }
  if (from === 0) {
    return local;
  }
  // The line, not the document: the boundary is a property of the text around the
  // cursor, and a body can be long enough that copying it per keystroke shows.
  const line = local.state.doc.lineAt(from);
  // At a line's start the character behind the cursor is the line break, which is not
  // part of `line.text`, so the cluster walk has nothing to step over and the range
  // would come out empty. Backspace there joins the line with the one above it.
  const back = from === line.from ? from - 1 : findClusterBreak(line.text, from - line.from, false) + line.from;

  return edited(
    local,
    local.state.update({ changes: { from: back, to: from, insert: "" }, selection: { anchor: back } }).state,
  );
}

export function deleteForward(local: EditorLocal): EditorLocal {
  const { from, to } = local.state.selection.main;
  if (from !== to) {
    return edited(local, local.state.update({ changes: { from, to, insert: "" }, selection: { anchor: from } }).state);
  }
  const line = local.state.doc.lineAt(from);
  if (from === line.to) {
    // At a line's end the character ahead of the cursor is the line break, which is
    // not part of `line.text`. Only the last line has nothing after it; anywhere else
    // the delete removes the break and joins the next line up.
    if (line.number === local.state.doc.lines) {
      return local;
    }

    return edited(
      local,
      local.state.update({ changes: { from, to: from + 1, insert: "" }, selection: { anchor: from } }).state,
    );
  }
  const forward = findClusterBreak(line.text, from - line.from, true) + line.from;

  return edited(local, local.state.update({ changes: { from, to: forward, insert: "" } }).state);
}

export type MoveKey = "left" | "right" | "up" | "down" | "home" | "end";

export function moveCursor(local: EditorLocal, key: MoveKey): EditorLocal {
  const from = local.state.selection.main.head;
  const line = local.state.doc.lineAt(from);
  if (key === "left") {
    return moved(local, from === line.from ? Math.max(0, line.from - 1) : findClusterBreak(line.text, from - line.from, false) + line.from);
  }
  if (key === "right") {
    return moved(
      local,
      from === line.to && line.number < local.state.doc.lines
        ? line.to + 1
        : findClusterBreak(line.text, from - line.from, true) + line.from,
    );
  }
  if (key === "home") {
    return moved(local, line.from);
  }
  if (key === "end") {
    return moved(local, line.to);
  }
  const number = line.number + (key === "up" ? -1 : 1);
  // Off either end of the document there is no line to move to, so the key does
  // nothing. `Text.line` THROWS on an out-of-range number rather than returning
  // nothing, and `editorCreate` opens with the cursor on the last line — so an
  // unguarded +1 here is a throw on the first Down press of a freshly opened editor.
  if (number < 1 || number > local.state.doc.lines) {
    return local;
  }
  const target = local.state.doc.line(number);
  // Character column, deliberately: a visual column would need the surface's width
  // and the line's tab stops, which is more than "lightweight" pays for.
  return moved(local, Math.min(target.from + (from - line.from), target.to));
}

export function undo(local: EditorLocal): EditorLocal {
  const previous = local.past[local.past.length - 1];
  if (!previous) {
    return local;
  }

  return { state: previous, past: local.past.slice(0, -1), future: [local.state, ...local.future].slice(0, HISTORY_CAP) };
}

export function redo(local: EditorLocal): EditorLocal {
  const next = local.future[0];
  if (!next) {
    return local;
  }

  return { state: next, past: [...local.past, local.state].slice(-HISTORY_CAP), future: local.future.slice(1) };
}

/** One key, as the client surface reports it (`ClientKeyEvent`). */
export function editorKey(
  local: EditorLocal,
  key: string,
  modifiers: { ctrl?: true; shift?: true; meta?: true } = {},
): EditorLocal {
  const chord = modifiers.ctrl === true || modifiers.meta === true;
  if (chord) {
    const lower = key.toLowerCase();
    if (lower === "z") {
      return modifiers.shift === true ? redo(local) : undo(local);
    }
    if (lower === "y") {
      return redo(local);
    }

    return local;
  }
  if (key === "backspace") {
    return deleteBackward(local);
  }
  if (key === "delete") {
    return deleteForward(local);
  }
  if (key === "return" || key === "enter") {
    return insertText(local, "\n");
  }
  if (key === "left" || key === "right" || key === "up" || key === "down" || key === "home" || key === "end") {
    return moveCursor(local, key);
  }
  if (key === "space") {
    // The space bar is the ONE key the engine delivers as a name rather than as the
    // character typed. Measured on Claude Code 2.1.287, in the dispatch that builds a
    // Client's key event: `Jr.find(([m]) => i[m])?.[1] ?? (o === " " ? "space" : o)` —
    // every other key is its table name (`up`, `return`, `backspace`, …) or the
    // character itself. Inserting the name would type the word "space" into the body.
    return insertText(local, " ");
  }
  if (key === "tab" || key === "escape" || key.startsWith("page")) {
    return local;
  }
  // A printable key is "the character typed", and nothing else is: one character is
  // text, and anything longer is a key's NAME this editor does not act on. An earlier
  // heuristic here accepted any name up to 8 characters that was not in a hand-kept
  // list, which let "space" through — and would have let any name the engine adds.
  if ([...key].length === 1) {
    return insertText(local, key);
  }

  return local;
}

/**
 * One line split so its middle is a whole grapheme — the cursor's cell. The surface
 * draws the middle inverted; slicing by code unit instead would tear a surrogate pair
 * or a combining sequence in half at the cursor.
 */
export function splitGrapheme(text: string, at: number): { before: string; cell: string; after: string } {
  const end = findClusterBreak(text, at, true);

  return { before: text.slice(0, at), cell: text.slice(at, end), after: text.slice(end) };
}

/** What the drawing draws: the rows in view, and where the cursor cell is. */
export type EditorView = {
  readonly rows: { number: number; text: string }[];
  readonly cursorRow: number;
  readonly cursorColumn: number;
};

/**
 * The window of lines to draw, scrolled so the cursor is in it. `rows` is the
 * region's height; when the cursor sits below the window the window follows it.
 */
export function editorView(local: EditorLocal, rows: number): EditorView {
  const cursor = local.state.selection.main.head;
  const line = local.state.doc.lineAt(cursor);
  const height = Math.max(1, rows);
  const last = Math.min(local.state.doc.lines, Math.max(height, line.number));
  const first = Math.max(1, last - height + 1);
  const window: { number: number; text: string }[] = [];
  for (let at = first; at <= last; at += 1) {
    window.push({ number: at, text: local.state.doc.line(at).text });
  }

  return { rows: window, cursorRow: line.number - first, cursorColumn: cursor - line.from };
}
