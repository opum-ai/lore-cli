// LCLI-664. The pane's lightweight inline body editor, as a `Client` surface module:
// it draws the window of lines and the cursor cell, keys them through
// `hooks/editor-ops`, and posts the text to the pane so Save writes what is on screen.
//
// A Client surface module runs on the drawing thread and receives no `$` — `post` is
// how it reaches the hooks module, and the props the pane sends back are how the pane
// reaches it. The instance's own state survives the pane's redraws, so the text being
// edited is not round-tripped through `$.state` on every keystroke.
//
// The props carry a `revision`: the pane bumps it when it wants the editor to adopt
// the text in the props (opening, a revert after a failed save, a reload after one).
// Equal revisions mean the person is typing and their text wins.

import type { ClientModule } from "claude-code";
import { editorCreate, editorKey, editorText, editorView, splitGrapheme, type EditorLocal } from "./editor-ops";

type BodyEditorProps = { text: string; revision: number };

/** The instance's local state: the editor, and the props revision it was built from. */
type BodyEditorCell = { editor: EditorLocal; revision: number };

const BodyEditor: ClientModule<BodyEditorProps, BodyEditorCell> = (props, surface) => {
  const { Box, Text } = surface.elements;
  const held = surface.state;
  const listed = typeof props.text === "string" ? props.text : "";
  const revision = typeof props.revision === "number" ? props.revision : 0;
  const cell: BodyEditorCell =
    held && held.revision === revision ? held : { editor: editorCreate(listed), revision };
  if (!held || held.revision !== revision) {
    // One call per props change, never on the draws in between: a `setState` on three
    // draws in a row with nothing between unmounts the instance.
    surface.setState(cell);
  }

  if (!held) {
    // The key listener is set once, while the instance has no state yet; a later call
    // would replace it. The handler reads `surface.state` at key time, so it always
    // acts on the text as it stands.
    surface.onKey((event) => {
      const current = surface.state;
      if (!current) {
        return;
      }
      const next = editorKey(current.editor, event.key, event);
      if (next !== current.editor) {
        surface.setState({ editor: next, revision: current.revision });
        surface.post({ kind: "text", text: editorText(next) });
      }
    });
  }

  // One row for the key hint, and the rest for the document.
  const view = editorView(cell.editor, Math.max(1, surface.rows - 1));
  const lines = view.rows.map((row, index) => {
    if (index !== view.cursorRow) {
      return Box({
        key: `line-${row.number}`,
        children: Text({ children: row.text === "" ? " " : row.text, wrap: "truncate" }),
      });
    }
    const { before, cell: at, after } = splitGrapheme(row.text, view.cursorColumn);

    return Box({
      key: `line-${row.number}`,
      flexDirection: "row",
      children: [
        Text({ children: before }),
        Text({ children: at === "" ? " " : at, inverse: true }),
        Text({ children: after }),
      ],
    });
  });

  return Box({
    flexDirection: "column",
    children: [
      ...lines,
      Text({ children: "Ctrl/⌘+Z undo · Ctrl/⌘+Shift+Z redo", dimColor: true, wrap: "truncate" }),
    ],
  });
};

export default BodyEditor;
