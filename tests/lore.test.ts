import { expect, test } from "claude-code/testing";

import {
  editorCreate,
  editorCursor,
  editorText,
  editorView,
  insertText,
  deleteBackward,
  moveCursor,
  redo,
  undo,
} from "../hooks/editor-ops";
import {
  bundleIdFor,
  failure,
  groupByType,
  hasSection,
  internalHrefs,
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
