// The slice of the vendored `@codemirror/state` build (codemirror-state.js) that the
// pane's editor uses, typed for the mod's own typecheck. Hand-written, deliberately
// narrow: an untyped `.js` import would be an implicit any under the mod harness's
// `strict`, and typing the whole library here would be a second copy of it. Every
// member below is used; nothing else of the library is reachable from this file.
//
// The vendored build carries its own license text and its patch record beside it
// (`README.md`, `LICENSE-codemirror-state.txt`).

/** A document's text with a line index. */
export declare class Text {
  readonly length: number;
  readonly lines: number;
  toString(): string;
  /** The line containing `pos`. */
  lineAt(pos: number): { from: number; to: number; number: number; text: string; length: number };
  /** The 1-based line number `number`; throws when out of range. */
  line(number: number): { from: number; to: number; number: number; text: string; length: number };
}

export declare class EditorSelection {
  static single(anchor: number, head?: number): EditorSelection;
  readonly main: { anchor: number; head: number; from: number; to: number; empty: boolean };
}

/** An immutable editor state: the document and the selection. */
export declare class EditorState {
  static create(config: { doc?: string; selection?: { anchor: number; head?: number } }): EditorState;
  readonly doc: Text;
  readonly selection: EditorSelection;
  /** Applies a transaction, returning `{ state }` — the new state, or the same one for a no-op. */
  update(spec: {
    changes?: { from: number; to?: number; insert?: string };
    selection?: { anchor: number; head?: number };
  }): { state: EditorState };
}

/** The next (or previous) grapheme-cluster boundary from `pos` in `str`. */
export declare function findClusterBreak(
  str: string,
  pos: number,
  forward?: boolean,
  includeExtending?: boolean,
): number;
