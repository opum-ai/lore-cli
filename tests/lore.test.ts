import { expect, test } from "claude-code/testing";

import {
  editorCreate,
  editorCursor,
  editorKey,
  editorText,
  editorView,
  insertText,
  deleteBackward,
  deleteForward,
  moveCursor,
  redo,
  undo,
} from "../hooks/editor-ops";
import {
  EDITOR_BODY_CAP,
  EDITOR_LINE_CAP,
  bundleIdFor,
  editorFits,
  failure,
  groupByType,
  hasSection,
  internalHrefs,
  parseBrowse,
  parsePorcelain,
  patchFrontmatter,
  replaceBody,
  repoPathFor,
  searchArgv,
} from "../hooks/lore";

const RAW = [
  "---",
  "type: Reference",
  "title: Old title",
  "tags:",
  "  - alpha",
  "summary: A summary.",
  "status: draft",
  "---",
  "",
  "Body stays put.",
  "",
].join("\n");

test("a body the engine's bounds cannot carry is refused before it can refuse the pane", () => {
  // The pane hands the editor the WHOLE body as `Client` props, and the engine bounds a
  // Client's props and tree at 100,000 characters "or the instance unmounts" — but the
  // refusal lands on the PANE's render, not the editor's ("opum-lore drew nothing on the
  // terminal surface"). Measured on 2.1.287: a 108,718-character body refuses the pane
  // and 99,000 opens cleanly. docs/runbooks/release-publishing.md in this repository
  // carries a 108,718-character body, so this is reachable without contriving anything.
  const manyShortLines = (length: number): string => {
    const out: string[] = [];
    let size = 0;
    while (size <= length) {
      out.push("x".repeat(50));
      size += 51; // the 50 characters plus the newline that will join this to the next
    }

    return out.join("\n").slice(0, length);
  };

  expect(editorFits("The body of the notes.")).toBe(true);
  expect(manyShortLines(EDITOR_BODY_CAP).length).toBe(EDITOR_BODY_CAP);
  expect(editorFits(manyShortLines(EDITOR_BODY_CAP))).toBe(true);
  expect(editorFits(manyShortLines(EDITOR_BODY_CAP + 1))).toBe(false);
  expect(editorFits(manyShortLines(108_718))).toBe(false);

  // A single line past what one `Text` child may hold unmounts the instance on its own,
  // inside a body well under the props bound: the module draws a line as one Text. So a
  // long body of short lines is fine while one enormous line is not, at equal length.
  expect(editorFits(`${"x".repeat(EDITOR_LINE_CAP)}\nshort`)).toBe(true);
  expect(editorFits(`${"x".repeat(EDITOR_LINE_CAP + 1)}\nshort`)).toBe(false);
});

test("patchFrontmatter replaces, removes and inserts keys, and touches nothing else", () => {
  const next = patchFrontmatter(RAW, {
    title: "New: title",
    tags: ["beta", "gamma"],
    status: null,
    owner: "jdnewhouse",
  });
  expect(next).not.toBeNull();
  const text = next ?? "";
  expect(text).toContain('title: "New: title"');
  expect(text).toContain('tags: ["beta", "gamma"]');
  expect(text).not.toContain("  - alpha");
  expect(text).not.toContain("status:");
  expect(text).toContain('owner: "jdnewhouse"');
  expect(text).toContain("summary: A summary.");
  expect(text.endsWith("Body stays put.\n")).toBe(true);
});

test("patchFrontmatter refuses a file with no frontmatter", () => {
  expect(patchFrontmatter("no frontmatter here\n", { title: "x" })).toBeNull();
});

test("replaceBody keeps the frontmatter byte for byte and owns everything after it", () => {
  // The inline editor writes a body and must not disturb a single byte above the
  // closing delimiter -- the fields form is the only thing that edits frontmatter.
  expect(replaceBody(RAW, "New body.\n")).toBe(`${RAW.slice(0, RAW.indexOf("\n---\n") + 5)}New body.\n`);
  // Normalised the way the file format expects: no leading blank lines, one trailing
  // newline, and an empty body leaves the file ending at the delimiter.
  expect(replaceBody(RAW, "\n\nBody.\n\n\n")).toBe(replaceBody(RAW, "Body.\n"));
  expect(replaceBody(RAW, "")).toBe(RAW.slice(0, RAW.indexOf("\n---\n") + 5));
  // No frontmatter is a refusal, not a silent whole-file rewrite.
  expect(replaceBody("no frontmatter here\n", "Body.")).toBeNull();
});

test("an internal href resolves to a bundle id relative to the open concept", () => {
  expect(bundleIdFor("../adr/0002-other.md", "reference/notes/page")).toBe("reference/adr/0002-other");
  expect(bundleIdFor("../../adr/0002-other.md", "reference/notes/page")).toBe("adr/0002-other");
  expect(bundleIdFor("./sibling.md#section", "reference/notes/page")).toBe("reference/notes/sibling");
  expect(bundleIdFor("https://example.com/x", "reference/notes/page")).toBeNull();
  expect(bundleIdFor("/absolute/path.md", "reference/notes/page")).toBeNull();
});

test("a bundle-relative path becomes the repository-relative one, once", () => {
  expect(repoPathFor("adr/0001-x.md")).toBe("docs/adr/0001-x.md");
  // A bundle path that itself starts with `docs/` is a concept in the bundle's own
  // `docs/` folder (id `docs/x`, file `docs/docs/x.md`), not an already-prefixed
  // path: `lore read`'s `path` is bundle-relative by contract and the prefix is
  // unconditional. Guarding on `startsWith("docs/")` addressed `docs/x.md`, a
  // different file the write path would have created and reported as saved
  // (LCLI-664 review F4).
  expect(repoPathFor("docs/x.md")).toBe("docs/docs/x.md");
});

test("a search term that starts with a dash is a term, not an option", () => {
  // Measured on lore 0.12.0: `query --json "-foo"` exits 2 ("unknown option
  // \"-foo\""), `query --json -- "-foo"` answers with a query.results envelope.
  // The filters precede `--`, because everything after it is positional
  // (LCLI-664 review F5).
  expect(searchArgv({ query: "-foo", typeFilter: "", tagFilter: "", acrossRefs: false })).toEqual([
    "query",
    "--json",
    "--",
    "-foo",
  ]);
  expect(
    searchArgv({ query: "-foo", typeFilter: "ADR", tagFilter: "fleet", acrossRefs: true }),
  ).toEqual(["query", "--json", "--type", "ADR", "--tag", "fleet", "--across-refs", "--allow-partial", "--", "-foo"]);
  expect(searchArgv({ query: "  ", typeFilter: "", tagFilter: "", acrossRefs: false })).toEqual(["query", "--json"]);
});

test("a truncated run is reported as an incomplete answer, not a parse failure", () => {
  // The engine caps each stream at 4 MiB; the pane sets `truncated` from its own
  // isStdoutTruncated/isStderrTruncated, and an answer that was cut off says so
  // rather than reading as malformed JSON (LCLI-664 review F7).
  expect(failure({ code: 0, stdout: '{"kind":"que', stderr: "", truncated: true }, "Browse")).toBe(
    "Browse: lore's output was cut off at the engine's 4 MiB cap, so this answer is incomplete; narrow the query",
  );
  expect(failure({ code: 2, stdout: "", stderr: "unknown option" }, "Search")).toBe(
    "Search failed (lore exited 2): unknown option",
  );
});

test("a run killed at the timeout budget says so, in both shapes it can take", () => {
  // The engine kills the child at timeoutMs. Neither shape that can come back
  // says so -- the declaration has the call reject, the review note has the
  // result read as exit 1 -- so runLore sets timedOutMs from the elapsed time and
  // the pane names the timeout instead of blaming lore or PATH (review F8).
  const timed = "Browse: lore did not answer within 30 seconds and was killed; run it in the terminal to see why";
  expect(failure({ code: 1, stdout: "", stderr: "", timedOutMs: 30_000 }, "Browse")).toBe(timed);
  expect(failure({ code: -1, stdout: "", stderr: "the call rejected", timedOutMs: 30_000 }, "Browse")).toBe(timed);
  // Without the flag, a run that could not start keeps its own message: the
  // timeout is measured, never inferred from the failure.
  expect(failure({ code: -1, stdout: "", stderr: "" }, "Browse")).toBe("Browse: lore could not run (is it on PATH?)");
});

test("a failed vocabulary read leaves the concepts browsable and says why", () => {
  const query = {
    code: 0,
    stdout: JSON.stringify({ kind: "query.results", data: { hits: [{ id: "adr/1", type: "ADR", title: "One" }] } }),
    stderr: "",
  };
  const types = { code: 1, stdout: "", stderr: "tracker unavailable" };
  const browse = parseBrowse(query, types);
  expect(browse.ok).toBe(true);
  expect(browse.ok ? browse.concepts.map((one) => one.id) : []).toEqual(["adr/1"]);
  expect(browse.ok ? browse.types : "unset").toBe(null);
  expect(browse.ok ? browse.typesNote : "unset").toBe("Types failed (lore exited 1): tracker unavailable");
  // The query itself failing is still a dead end: there is nothing to browse.
  expect(parseBrowse({ code: 1, stdout: "", stderr: "no bundle" }, types).ok).toBe(false);
});

test("porcelain paths survive git's quoting, including a rename's new name", () => {
  // The caller passes -c core.quotePath=false, so a non-ASCII name arrives raw
  // (measured against git) and quoting remains only for a backslash, a double
  // quote or a control byte. Before review F8 a quoted path was dropped.
  const stdout = [
    "?? docs/reference/notes.md",
    "?? docs/reference/café.md",
    '?? "docs/reference/we\\"ird.md"',
    '?? "docs/reference/ctrl\\ttab.md"',
    '?? "docs/reference/\\007bell.md"',
    'R  "docs/reference/old\\"name.md" -> "docs/reference/new\\"name.md"',
    "?? src/not-markdown.ts",
  ].join("\n");
  expect(parsePorcelain(stdout)).toEqual([
    "docs/reference/notes.md",
    "docs/reference/café.md",
    'docs/reference/we"ird.md',
    "docs/reference/ctrl\ttab.md",
    "docs/reference/\x07bell.md",
    'docs/reference/new"name.md',
  ]);
});

test("only internal hrefs are pressable, and sections match case-insensitively", () => {
  const body = [
    "See [one](./one.md) and [two](../two.md#anchor) and [web](https://example.com/).",
    "",
    "## Acceptance criteria",
  ].join("\n");
  expect(internalHrefs(body)).toEqual(["./one.md", "../two.md#anchor"]);
  expect(hasSection(body, "acceptance criteria")).toBe(true);
  expect(hasSection(body, "Missing section")).toBe(false);
});

test("groupByType groups rows under their type, in name order", () => {
  const groups = groupByType([
    { id: "b/2", type: "Reference", title: "Two" },
    { id: "a/1", type: "ADR", title: "One" },
    { id: "a/3", type: "ADR", title: "Three" },
  ]);
  expect(groups.map((group) => group.type)).toEqual(["ADR", "Reference"]);
  expect(groups[0]?.rows.map((row) => row.id)).toEqual(["a/1", "a/3"]);
});

test("editor ops insert, delete and cross a grapheme cluster in one step", () => {
  // The vendored CodeMirror state under these ops is what makes the boundaries
  // grapheme-correct; a code-unit implementation would leave half a cluster behind
  // (LCLI-664, ADR-0026).
  const start = editorCreate("a👍🏽b");
  expect(editorText(start)).toBe("a👍🏽b");
  expect(editorText(insertText(start, "!"))).toBe("a👍🏽b!");

  const trimmed = deleteBackward(deleteBackward(insertText(start, "!")));
  expect(editorText(trimmed)).toBe("a👍🏽");
  // One more backspace removes the WHOLE cluster: the emoji, its skin-tone modifier.
  expect(editorText(deleteBackward(trimmed))).toBe("a");

  // Cursor motion crosses it in one step as well: from the end, left is before `b`,
  // and left again is before the emoji, never inside it.
  // "a👍🏽b" is six code units; the cursor starts after `b` (6), one step left is
  // before it (5), and the next step left crosses the whole cluster to 1 — never 3
  // or 4, which is where a code-unit implementation would stop.
  const beforeB = moveCursor(start, "left");
  expect(editorCursor(beforeB)).toBe(5);
  expect(editorCursor(moveCursor(beforeB, "left"))).toBe(1);
});

test("editor ops undo and redo walk the ring, and a new edit drops the redo ring", () => {
  const typed = insertText(editorCreate("one"), " two");
  expect(editorText(typed)).toBe("one two");
  const undone = undo(typed);
  expect(editorText(undone)).toBe("one");
  expect(editorText(redo(undone))).toBe("one two");
  expect(editorText(undo(undone))).toBe("one");
  // A new edit after an undo discards what redo would have restored: redo is then a
  // no-op, returning the very state it was given.
  const branched = insertText(undone, "!");
  expect(editorText(branched)).toBe("one!");
  expect(redo(branched)).toBe(branched);
});

test("the editor's window follows the cursor", () => {
  const local = editorCreate("one\ntwo\nthree\nfour");
  const atEnd = editorView(local, 2);
  expect(atEnd.rows.map((row) => row.number)).toEqual([3, 4]);
  expect(atEnd.cursorRow).toBe(1);

  const atTop = editorView(moveCursor(moveCursor(moveCursor(local, "up"), "up"), "up"), 2);
  expect(atTop.rows.map((row) => row.number)).toEqual([1, 2]);
  expect(atTop.cursorRow).toBe(0);
});

// ── Regressions from the LCLI-664 editor-arm review pass ──────────────────────
// Each of these fails on the pre-review code and passes after it. They are separate
// cases rather than one, so a regression names which behaviour it broke.

test("the space bar types a space, and no key's NAME is ever typed into the body", () => {
  // The engine delivers the space bar as the NAME "space" rather than as the character
  // typed — measured on Claude Code 2.1.287, in the dispatch that builds a Client's key
  // event: `Jr.find(([m]) => i[m])?.[1] ?? (o === " " ? "space" : o)`, where every other
  // key is its table name (`up`, `return`, `backspace`, …) or the character itself.
  // A length heuristic ("a name of 8 characters or fewer is text") therefore typed the
  // word "space" into the document (LCLI-664 editor-arm review F2).
  const start = editorCreate("one two");
  expect(editorText(editorKey(start, "space"))).toBe("one two ");
  // Handled defensively too: if a surface ever hands the character itself, it types.
  expect(editorText(editorKey(start, " "))).toBe("one two ");
  // Every other multi-character key is a name this editor does not act on.
  for (const name of ["wheelup", "wheeldown", "f5", "insert", "pageup", "home"]) {
    expect(editorText(editorKey(start, name))).toBe("one two");
  }
  // A single character still types itself.
  expect(editorText(editorKey(start, "!"))).toBe("one two!");
});

test("an arrow key at either end of the document does nothing rather than throwing", () => {
  // `Text.line` THROWS on an out-of-range number rather than returning nothing, and
  // `editorCreate` opens with the cursor on the LAST line — so the unguarded ±1 was a
  // throw on the first Down press after opening the editor. The engine answers a throw
  // in a Client's key listener by unmounting the instance (LCLI-664 review F3).
  const last = editorCreate("one\ntwo");
  expect(moveCursor(last, "down")).toBe(last);

  const first = moveCursor(last, "up");
  // Column-preserving, not column-resetting: the cursor was at column 3 of "two" and
  // lands at column 3 of "one", which is that line's end.
  expect(editorCursor(first)).toBe(3);
  expect(moveCursor(first, "up")).toBe(first);

  // A one-line body — which is also what an empty document is.
  const single = editorCreate("only");
  expect(moveCursor(single, "down")).toBe(single);
  expect(moveCursor(single, "up")).toBe(single);
});

test("delete joins lines across a line break, which lives outside the line's text", () => {
  // At a line's end the character ahead is the line BREAK, which is not part of
  // `line.text` — so a cluster walk inside the line found nothing, the range came out
  // empty, and the newline was never crossed (LCLI-664 review F5).
  const two = editorCreate("alpha\nbeta");

  const endOfFirst = moveCursor(moveCursor(moveCursor(two, "home"), "up"), "end");
  expect(editorCursor(endOfFirst)).toBe(5);
  const joinedForward = deleteForward(endOfFirst);
  expect(editorText(joinedForward)).toBe("alphabeta");
  expect(joinedForward.past.length).toBe(1);

  const startOfSecond = moveCursor(two, "home");
  expect(editorCursor(startOfSecond)).toBe(6);
  const joinedBack = deleteBackward(startOfSecond);
  expect(editorText(joinedBack)).toBe("alphabeta");
  expect(joinedBack.past.length).toBe(1);
});

test("a key that cannot change anything leaves the undo and redo rings alone", () => {
  // `state.update` returns a NEW state for a transaction whose change range is empty.
  // Adopting one put a step on the undo ring that undoes nothing — a Ctrl+Z that
  // appears dead — and dropped the redo ring with it (LCLI-664 review F5).
  const typed = insertText(editorCreate("one"), "!");
  const undone = undo(typed);
  expect(editorText(undone)).toBe("one");

  // Delete at the end of the LAST line has nothing to remove, and says so by returning
  // the very state it was given rather than an equal one.
  const atEnd = moveCursor(editorCreate("only"), "end");
  expect(deleteForward(atEnd)).toBe(atEnd);

  // Backspace at the very start of an empty document, where there is nothing behind it.
  const empty = editorCreate("");
  expect(deleteBackward(empty)).toBe(empty);

  // A no-op key on an undone document leaves a pending redo intact.
  const noop = editorKey(undone, "f5");
  expect(noop).toBe(undone);
  expect(editorText(redo(noop))).toBe("one!");
});
