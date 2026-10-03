import type { On } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

const PANE = {
  title: "Lore",
  isFocused: true,
  bodyColumns: 80,
  placement: "dock" as const,
  scroll: { offset: 0, bodyRows: 80 },
  view: {},
};

const ok = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false },
});

const READ_RAW = [
  "---",
  "type: Reference",
  "title: Notes",
  "tags: [reference]",
  "status: stable",
  "---",
  "",
  "The body of the notes.",
  "",
].join("\n");

const CONCEPTS = JSON.stringify({
  kind: "query.results",
  data: {
    hits: [
      { id: "adr/0001-x", type: "ADR", title: "ADR-0001: X", snippet: "" },
      { id: "reference/notes", type: "Reference", title: "Notes", snippet: "" },
    ],
  },
});

const TYPES = JSON.stringify({
  kind: "types.report",
  data: {
    types: [
      { name: "ADR", requiredSections: ["Context", "Decision"] },
      { name: "Reference", requiredSections: ["Summary"] },
    ],
  },
});

const readOf = (id: string, body = "The body of the notes.") =>
  JSON.stringify({
    kind: "read.concept",
    data: {
      id,
      path: `${id}.md`,
      type: "Reference",
      frontmatter: { title: "Notes", tags: ["reference"], status: "stable" },
      body,
    },
  });

const ROLLUP = JSON.stringify({ kind: "tasks.rollup", data: { concept: "x", tasks: [] } });

function mockLore(
  on: On,
  seen: string[][],
  validateFails = false,
  body = "The body of the notes.",
  reads?: string[],
) {
  on("fs.read", async (_$, e) => {
    reads?.push(e.path);
    return { value: READ_RAW };
  });
  on("process.run", async (_$, e) => {
    seen.push([...e.argv]);
    if (e.argv[0] === "git") {
      return ok("/repo\n");
    }
    const sub = e.argv[1] ?? "";
    if (sub === "query") {
      return ok(CONCEPTS);
    }
    if (sub === "types") {
      return ok(TYPES);
    }
    if (sub === "read") {
      return ok(readOf(e.argv[2] ?? "", body));
    }
    if (sub === "tasks") {
      return ok(ROLLUP);
    }
    if (sub === "new") {
      return ok(
        JSON.stringify({ kind: "new.result", data: { type: e.argv[2], id: "adr/0009-new", path: "adr/0009-new.md" } }),
      );
    }
    if (sub === "validate") {
      if (!validateFails) {
        return ok(JSON.stringify({ kind: "validate.report", data: { files: [], errorCount: 0 } }));
      }
      return ok(
        JSON.stringify({
          kind: "validate.report",
          data: {
            files: [
              {
                path: e.argv[2],
                findings: [{ severity: "error", message: "summary is required" }],
              },
            ],
            errorCount: 1,
          },
        }),
        6,
      );
    }
    return ok(JSON.stringify({ kind: "ok", data: {} }));
  });
}

test("browse lists concepts, opens one, navigates back, and toggles raw", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const reads: string[] = [];
  mockLore(on, seen, false, "The body of the notes.", reads);

  for (const surface of ["terminal", "desktop"] as const) {
    seen.length = 0;
    const ui = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: PANE,
    });
    // Session state outlives a mount; normalize the tab before the flow.
    await ui.press({ key: "tab-browse" });
    await ui.press({ key: "refresh" });
    expect(await ui.find({ key: "open-adr/0001-x" })).toBeDefined();

    await ui.press({ key: "open-adr/0001-x" });
    expect(seen).toContainEqual(["lore", "read", "adr/0001-x", "--json"]);
    // The raw read addresses the file from the repository root: `lore read`
    // reports a bundle-relative path, and the pane must not join it blindly.
    expect(reads).toContain("/repo/docs/adr/0001-x.md");
    expect(await ui.find({ type: "Markdown", text: /The body of the notes\./ })).toBeDefined();

    await ui.press({ key: "view-raw" });
    // The Raw view shows the source FILE, frontmatter included -- asserted on the
    // Code element's own text, so a view that drew only the body fails here
    // (LCLI-664 acceptance criterion 2).
    expect(await ui.find({ type: "Code", text: /type: Reference/ })).toBeDefined();

    await ui.press({ key: "tab-browse" });
    await ui.press({ key: "open-reference/notes" });
    await ui.press({ key: "back" });
    const readIds = seen.filter((argv) => argv[1] === "read").map((argv) => argv[2]);
    expect(readIds[readIds.length - 1]).toBe("adr/0001-x");
    await ui.unmount();
  }
});

test("search submits text and the refs toggle reads across refs", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "tab-search" });
  await ui.input({ key: "search-text", text: "retention" });
  expect(seen).toContainEqual(["lore", "query", "--json", "--", "retention"]);
  await ui.press({ key: "across" });
  expect(seen.some((argv) => argv.includes("--across-refs") && argv.includes("--allow-partial"))).toBe(true);
  await ui.unmount();
});

test("the fields form saves through lore validate, and a failed validation restores the file", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: { path: string; text: string }[] = [];
  mockLore(on, seen);
  on("fs.write", async (_$, e) => {
    // The path is recorded, not just the bytes: a write that lands at the wrong
    // repository path still carries the right text, and would otherwise be green
    // (LCLI-664 review F2).
    writes.push({
      path: typeof e.path === "string" ? e.path : "",
      text: typeof e.text === "string" ? e.text : "",
    });
    return { value: undefined };
  });
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-fields" });
  await ui.input({ key: "f-title", text: "Renamed notes" });
  await ui.press({ key: "f-save" });
  expect(
    writes.some((one) => one.text.includes('title: "Renamed notes"') && one.path === "/repo/docs/adr/0001-x.md"),
  ).toBe(true);
  expect(seen.some((argv) => argv[1] === "validate")).toBe(true);
  expect(seen).toContainEqual(["lore", "validate", "docs/adr/0001-x.md", "--json"]);
  // The strip's read asks git for raw paths: `-c core.quotePath=false` is the half of
  // the contract parsePorcelain's unquoting is written against, so a change to either
  // half reddens here (LCLI-664 review F8).
  expect(seen).toContainEqual(["git", "-c", "core.quotePath=false", "status", "--porcelain"]);
  expect(await ui.find({ type: "Text", text: /Saved and validated\./ })).toBeDefined();
  await ui.unmount();
});

test("a validation failure keeps the previous file and shows lore's message", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: { path: string; text: string }[] = [];
  mockLore(on, seen, true);
  on("fs.write", async (_$, e) => {
    writes.push({
      path: typeof e.path === "string" ? e.path : "",
      text: typeof e.text === "string" ? e.text : "",
    });
    return { value: undefined };
  });
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-fields" });
  await ui.input({ key: "f-title", text: "Bad edit" });
  await ui.press({ key: "f-save" });
  expect(writes.some((one) => one.text.includes('title: "Bad edit"'))).toBe(true);
  // The restore writes the previous bytes back to the same file the bad edit went
  // to -- a restore that landed somewhere else would leave the bad edit in place.
  expect(writes[writes.length - 1]).toEqual({ path: "/repo/docs/adr/0001-x.md", text: READ_RAW });
  expect(await ui.find({ type: "Text", text: /Validation failed: summary is required/ })).toBeDefined();
  await ui.unmount();
});

test("new creates through lore new and opens the result", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "tab-new" });
  await ui.select({ key: "new-type", value: "ADR" });
  await ui.input({ key: "new-title", text: "A new ADR" });
  await ui.press({ key: "create" });
  expect(seen).toContainEqual(["lore", "new", "ADR", "A new ADR", "--json"]);
  expect(seen.some((argv) => argv[1] === "read" && argv[2] === "adr/0009-new")).toBe(true);
  await ui.unmount();
});

test("new creates with the type the picker already shows, untouched", async ($, on) => {
  // The picker draws its first option as the chosen one before anything is
  // chosen, so Create must submit that type: pressing Create with only a title
  // typed, and no Select interaction at all, sent no `lore new` and answered
  // "A type and a title are required." for a form visibly naming a type
  // (LCLI-664 review F1).
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "tab-new" });
  await ui.input({ key: "new-title", text: "A new ADR" });
  await ui.press({ key: "create" });
  expect(seen).toContainEqual(["lore", "new", "ADR", "A new ADR", "--json"]);
  expect(seen.some((argv) => argv[1] === "read" && argv[2] === "adr/0009-new")).toBe(true);
  await ui.unmount();
});

test("a type filter and a rename reach lore with the right argv", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "tab-search" });
  await ui.select({ key: "search-type", value: "ADR" });
  expect(seen).toContainEqual(["lore", "query", "--json", "--type", "ADR"]);
  await ui.press({ key: "tab-browse" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "act-rename" });
  await ui.input({ key: "action-value", text: "adr/0002-renamed" });
  expect(seen).toContainEqual(["lore", "rename", "adr/0001-x", "adr/0002-renamed", "--json"]);
  expect(seen).toContainEqual(["lore", "sync", "--json"]);
  await ui.unmount();
});

test("the inline body editor keys, draws the document and saves through lore validate", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: { path: string; text: string }[] = [];
  mockLore(on, seen);
  on("fs.write", async (_$, e) => {
    writes.push({
      path: typeof e.path === "string" ? e.path : "",
      text: typeof e.text === "string" ? e.text : "",
    });
    return { value: undefined };
  });
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-body" });
  // The editor opened on the body with the cursor at its end, and the cursor's own
  // cell is the character under it ("." — the body's last character).
  expect(await ui.find({ type: "Text", text: /Saved and validated|The body of the notes/, in: "body-editor" })).toBeDefined();
  await ui.key({ key: "!", in: "body-editor" });
  expect(await ui.find({ type: "Text", text: "!", in: "body-editor" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "The body of the notes.", in: "body-editor" })).toBeDefined();
  // Ctrl+Z takes it back, and typing again returns it — the operations run through
  // the vendored CodeMirror state, not through a buffer of this module's own.
  await ui.key({ key: "z", ctrl: true, in: "body-editor" });
  expect(await ui.find({ type: "Text", text: "!", in: "body-editor" })).toBeUndefined();
  await ui.key({ key: "?", in: "body-editor" });

  await ui.press({ key: "body-save" });
  const saved = writes.find((one) => one.text.includes("?"));
  expect(saved?.path).toBe("/repo/docs/adr/0001-x.md");
  // The frontmatter is untouched, byte for byte, and the body is the editor's.
  expect(saved?.text.startsWith("---\ntype: Reference\ntitle: Notes\ntags: [reference]\nstatus: stable\n---\n")).toBe(true);
  expect(saved?.text).toContain("The body of the notes.?");
  expect(seen).toContainEqual(["lore", "validate", "docs/adr/0001-x.md", "--json"]);
  expect(await ui.find({ type: "Text", text: /Saved and validated\./ })).toBeDefined();
  await ui.unmount();
});

test("a rejected body keeps the file and shows lore's message", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: { path: string; text: string }[] = [];
  mockLore(on, seen, true);
  on("fs.write", async (_$, e) => {
    writes.push({
      path: typeof e.path === "string" ? e.path : "",
      text: typeof e.text === "string" ? e.text : "",
    });
    return { value: undefined };
  });
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-body" });
  await ui.key({ key: "!", in: "body-editor" });
  await ui.press({ key: "body-save" });
  // The edited bytes went to the right file, and the file's previous bytes went back
  // to that same file when lore refused it.
  expect(writes.some((one) => one.path === "/repo/docs/adr/0001-x.md" && one.text.includes("!"))).toBe(true);
  expect(writes[writes.length - 1]).toEqual({ path: "/repo/docs/adr/0001-x.md", text: READ_RAW });
  expect(await ui.find({ type: "Text", text: /Validation failed: summary is required/ })).toBeDefined();
  await ui.unmount();
});

test("a link press in the body opens the linked concept", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen, false, "See [other](../reference/notes.md).");
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "body", link: { href: "../reference/notes.md" } });
  expect(seen.some((argv) => argv[1] === "read" && argv[2] === "reference/notes")).toBe(true);
  await ui.unmount();
});

test("opening another document closes the body editor rather than writing across documents", async ($, on) => {
  // The editor holds a BODY; Save pairs it with the OPEN document's FILE. Left open
  // across a document change, the first document's text sat beside the second
  // document's file and Save wrote it there — the second document's own body gone, its
  // frontmatter kept, so it still validated and the pane still said "Saved and
  // validated." (LCLI-664 editor-arm review F1.)
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: { path: string; text: string }[] = [];
  mockLore(on, seen);
  on("fs.write", async (_$, e) => {
    writes.push({
      path: typeof e.path === "string" ? e.path : "",
      text: typeof e.text === "string" ? e.text : "",
    });
    return { value: undefined };
  });
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-body" });
  await ui.key({ key: "!", in: "body-editor" });

  // Move to a different document with the editor still open.
  await ui.press({ key: "tab-browse" });
  await ui.press({ key: "open-reference/notes" });

  // The editor is bound to the document it opened on, so it is gone — and the Save
  // control that would have paired the first document's text with the second's file
  // went with it.
  expect(await ui.findAll({ type: "Button", key: "body-save" })).toHaveLength(0);
  expect(writes).toEqual([]);
  await ui.unmount();
});

test("a body too large to hand the editor is refused, and the pane keeps drawing", async ($, on) => {
  // The failure this guards is not the editor's. The pane passes the WHOLE body to the
  // `Client` as props, so a body past the engine's bound makes the engine refuse the
  // PANE's render — measured without the guard, on this body: `opum-lore drew nothing on
  // the terminal surface: opum-lore: ui.render (Pane) refused`. docs/runbooks/
  // release-publishing.md in this repository carries a 108,718-character body.
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen, false, "x".repeat(108_718));
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-body" });

  // The pane still draws, the refusal says why, and no editor region opened.
  expect(await ui.find({ type: "Text", text: /too large for the inline editor/ })).toBeDefined();
  expect(await ui.findAll({ type: "Button", key: "body-save" })).toHaveLength(0);
  expect(await ui.findAll({ type: "Button", key: "open-editor" })).toHaveLength(1);
  await ui.unmount();
});

test("a body that GROWS past what the editor can hand back closes the editor instead of killing the pane", async ($, on) => {
  // The other way a body gets too big: it opens small and grows. The posted text becomes
  // the editor's props on the next draw, and the engine refuses the whole pane's render
  // past its bound — a refusal the pane cannot be escaped from, because its own buttons
  // stop drawing with it. So the growth is refused and the editor closed.
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: { path: string; text: string }[] = [];
  mockLore(on, seen);
  on("fs.write", async (_$, e) => {
    writes.push({
      path: typeof e.path === "string" ? e.path : "",
      text: typeof e.text === "string" ? e.text : "",
    });
    return { value: undefined };
  });
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-body" });

  // The editor is open and posting normally.
  await ui.post({ kind: "text", text: "The body of the notes.!" }, { in: "body-editor" });
  expect(await ui.findAll({ type: "Button", key: "body-save" })).toHaveLength(1);

  // Now it posts something past the bound.
  await ui.post({ kind: "text", text: "x".repeat(108_718) }, { in: "body-editor" });

  // The pane still draws, the editor closed, and nothing was written.
  expect(await ui.find({ type: "Text", text: /grew past what the editor can hand back/ })).toBeDefined();
  expect(await ui.findAll({ type: "Button", key: "body-save" })).toHaveLength(0);
  expect(writes).toEqual([]);
  await ui.unmount();
});

test("the editor's region has an explicit height, so it is not sized by what it draws", async ($, on) => {
  // A `Client` with no `height` is "as tall as what the module draws", and the module
  // draws `surface.rows - 1` document rows — a region sized by its own content, whose
  // only fixed point is a single visible document line (LCLI-664 editor-arm review F4).
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  await ui.press({ key: "edit-body" });

  const editor = await ui.find({ type: "Client", key: "body-editor" });
  expect(typeof editor?.props.height).toBe("number");
  expect(Number(editor?.props.height)).toBeGreaterThan(1);
  await ui.unmount();
});

/**
 * Holds every lore run until the test releases it, so the test can move the
 * mocked clock while a run is in flight. A handler that moves the clock itself
 * leaves `press` returning before the pane has drawn, which is a test artifact
 * rather than the pane's behaviour.
 */
function holdRuns(on: On, reply: () => ReturnType<typeof ok>): () => void {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  on("process.run", async (_$, e) => {
    if (e.argv[0] === "git") {
      return ok("/repo\n");
    }
    await gate;
    return reply();
  });

  return () => release?.();
}

test("a run killed at the timeout budget says so, in the shape that rejects", async ($, on) => {
  // The engine kills the child at timeoutMs; the declaration has the call reject.
  // The message must name the timeout rather than report the bare rejection
  // (LCLI-664 review F8).
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const release = holdRuns(on, () => {
    throw new Error("the run was killed");
  });
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await clock.advance(31_000);
  release();
  await clock.settle();
  expect(await ui.find({ type: "Text", text: /did not answer within 30 seconds/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /the run was killed/ })).toBeUndefined();
  await ui.unmount();
});

test("a run that reads as exit 1 past the budget is still the timeout it was", async ($, on) => {
  // The other shape the timeout can take: a killed child's exit status is 1, the
  // same as a plain failure's, so only the elapsed time separates them.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const release = holdRuns(on, () => ok("", 1));
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  await clock.advance(31_000);
  release();
  await clock.settle();
  expect(await ui.find({ type: "Text", text: /did not answer within 30 seconds/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /lore exited 1/ })).toBeUndefined();
  await ui.unmount();
});

test("a run that fails fast keeps its own message, not the timeout's", async ($, on) => {
  // The control for the two above: the same exit-1 result without the elapsed
  // time is a plain failure, so the timeout text is earned by the clock and
  // never shown merely because a run failed.
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  on("process.run", async (_$, e) => (e.argv[0] === "git" ? ok("/repo\n") : ok("", 1)));
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });
  expect(await ui.find({ type: "Text", text: /lore exited 1/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /did not answer within/ })).toBeUndefined();
  await ui.unmount();
});

// ── The full-screen toggle (LCLI-666) ─────────────────────────────────────────

/** Every `$.ui.open` the module made, in order: the args are what the toggle is. */
function captureOpens(on: On): Record<string, unknown>[] {
  const opens: Record<string, unknown>[] = [];
  on("ui.open", async (_$, e) => {
    opens.push({ ...e });

    return { value: { isPlaced: true } };
  });

  return opens;
}

/**
 * The two engine answers a session needs beneath it: nothing answers them on its
 * own, so a test that starts a session says what the session start and the
 * command registration return. `registrations`, when given, collects the command
 * specs the module registered, which is the only place they are visible.
 */
function mockSession(on: On, registrations?: Record<string, unknown>[]): void {
  on("command.register", async (_$, e) => {
    registrations?.push({ ...e });

    return { value: { command: e.name } };
  });
  // `session.start` is one of the engine's own events: its hook answers the result
  // itself, where a plugin-noun event answers `{ value }`.
  on("session.start", async (_$, e) => ({ cwd: e.cwd }));
}

/**
 * The children of the first element carrying `key`, in drawing order: the split's
 * two columns as the surface received them, so which is left and which is right is
 * measured rather than assumed from the two being present.
 */
function childrenUnder(node: unknown, key: string): unknown[] {
  if (typeof node !== "object" || node === null) {
    return [];
  }
  const element = node as { props?: Record<string, unknown>; children?: unknown };
  if (element.props?.key === key) {
    return Array.isArray(element.children)
      ? element.children
      : element.children === undefined
        ? []
        : [element.children];
  }
  const children = Array.isArray(element.children)
    ? element.children
    : element.children === undefined
      ? []
      : [element.children];
  for (const child of children) {
    const found = childrenUnder(child, key);
    if (found.length > 0) {
      return found;
    }
  }

  return [];
}

/** The props a docked pane draws with: a terminal of `columns` and a body of `bodyColumns`. */
const docked = (columns: number, bodyColumns: number, rows = 50) => ({
  ...PANE,
  placement: "dock" as const,
  bodyColumns,
  scroll: { offset: 0, bodyRows: rows - 12 },
});

/** The props an inline pane draws with: the main screen, a block above the prompt. */
const inlinePane = (rows: number, bodyRows: number, columns = 100) => ({
  ...PANE,
  placement: "inline" as const,
  bodyColumns: columns,
  scroll: { offset: 0, bodyRows },
});

test("z asks for the largest docked width, and a second press asks for the normal share again", async ($, on) => {
  // The criterion's evidence is the open ARGS the module passes, so they are
  // asserted whole: an open that carried `closeOnEscape` would make the pane a
  // dialog rather than a pane, and one that carried a size on the way back would
  // never return to the normal size.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const opens = captureOpens(on);
  for (const surface of ["terminal", "desktop"] as const) {
    opens.length = 0;
    const ui = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: docked(160, 80),
      viewport: { columns: 160, rows: 50, isFullscreen: true },
    });
    // The hotkey is the pane's only key hook: a Button's `hotkey` is pressed while
    // the pane holds the focus, which is how `z` reaches the toggle.
    expect((await ui.find({ key: "full" }))?.props.hotkey).toBe("z");

    await ui.press({ key: "full" });
    await clock.settle();
    // 160 columns of terminal, less the transcript margin the design keeps.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true, columns: 140 });

    await ui.press({ key: "full" });
    await clock.settle();
    // Back to the normal size: no `columns` at all, which is the request for the
    // surface's own share (`PaneOpenArgs`: left out, the share).
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true });
    await ui.unmount();
  }
});

test("an inline pane asks for rows, the viewport less the prompt area", async ($, on) => {
  // The other axis: on the main screen the pane is a block above the prompt, so
  // it is `rows` that asks for its size and a `columns` request is ignored.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const opens = captureOpens(on);
  for (const surface of ["terminal", "desktop"] as const) {
    opens.length = 0;
    const ui = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: inlinePane(40, 12),
      viewport: { columns: 100, rows: 40, isFullscreen: false },
    });
    await ui.press({ key: "full" });
    await clock.settle();
    // 40 rows of surface less the design's 6 for the prompt area (PROMPT_AREA_ROWS).
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true, rows: 34 });
    await ui.press({ key: "full" });
    await clock.settle();
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true });
    await ui.unmount();
  }
});

test("a viewport that changed asks for the full size again, and one that did not asks for nothing", async ($, on) => {
  // The design's "Sizing details": a full-mode pane asks for its full size "on its
  // first draw, and again whenever the viewport size changes" -- the person widening
  // the terminal, or the dock growing. The request is named by the size it asks for,
  // so a draw at a new viewport is a new request; a draw at the same one is the
  // control, and asks nothing, which is what keeps the pane from asking on every draw
  // for a size the surface has already refused.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  for (const surface of ["terminal", "desktop"] as const) {
    const at = async (columns: number) => {
      const ui = await $.ui.mount({
        plugin: "opum-lore",
        surface,
        component: "Pane",
        requestId: "lore-pane",
        props: docked(columns, 80),
        viewport: { columns, rows: 50, isFullscreen: true },
      });
      await clock.settle();

      return ui;
    };

    opens.length = 0;
    const first = await at(160);
    // Nobody asked for this one: the session remembered `full`, so the draw that
    // sizes it opens WITHOUT `focus` rather than taking the keyboard at startup.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 140 });
    await first.unmount();

    opens.length = 0;
    const same = await at(160);
    expect(opens).toEqual([]);
    await same.unmount();

    opens.length = 0;
    const wider = await at(200);
    // The viewport moved under the pane; the re-request is still nobody's ask.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 180 });
    await wider.unmount();
  }
});

test("a session opens the pane unsized, registers the command with its argument, and asks for no size", async ($, on) => {
  // What a session start does, in one place. It opens the pane unsized and unfocused;
  // it registers the command, whose one argument is advertised rather than only
  // findable in the hook that parses it; and the draws that follow ask for nothing,
  // which is the control for the toggle -- without a mode change there is no size to
  // ask for, so the pane must not reopen on every draw.
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const registrations: Record<string, unknown>[] = [];
  mockSession(on, registrations);
  const opens = captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  expect(registrations).toEqual([
    { name: "lore-pane", description: expect.any(String), argumentHint: "full" },
  ]);
  expect(opens).toEqual([{ id: "lore-pane", title: "Lore" }]);
  opens.length = 0;
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: docked(160, 80),
    viewport: { columns: 160, rows: 50, isFullscreen: true },
  });
  expect(opens).toEqual([]);
  await ui.unmount();
});

test("the full-or-normal choice is written to the plugin's store, and a session opens where it was left", async ($, on) => {
  // The setting is read at session start and written on every toggle, so the test
  // reads it the way the module does: a session start, then a draw. The first
  // session of each round starts from a store holding `full` and asks for the full
  // width; the toggle then writes `normal`, and the SECOND session of the round
  // asks for nothing -- which it can only do if what it read was the toggle's
  // write. A write that never landed would leave the store at `full` and this
  // session would ask for the full width again.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  const start = () => $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  for (const surface of ["terminal", "desktop"] as const) {
    await start();
    opens.length = 0;
    const restored = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: docked(160, 80),
      viewport: { columns: 160, rows: 50, isFullscreen: true },
    });
    await clock.settle();
    // Restored, not asked for: the request carries no `focus`.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 140 });
    // The draw that asked says so too: the toggle offers the way back.
    expect((await restored.find({ key: "full" }))?.props.label).toBe("Normal size");
    await restored.press({ key: "full" });
    await clock.settle();
    await restored.unmount();

    await start();
    opens.length = 0;
    const reopened = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: docked(160, 80),
      viewport: { columns: 160, rows: 50, isFullscreen: true },
    });
    await clock.settle();
    expect(opens).toEqual([]);
    expect((await reopened.find({ key: "full" }))?.props.label).toBe("Full screen");
    // Left at `full` again, so the next round's premise is the one it started from.
    await reopened.press({ key: "full" });
    await clock.settle();
    await reopened.unmount();
  }
});

test("a session starting with no remembered choice opens at the normal size", async ($, on) => {
  // The control for the restore above: the same session, the same store, with
  // nothing remembered.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  opens.length = 0;
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: docked(160, 80),
    viewport: { columns: 160, rows: 50, isFullscreen: true },
  });
  await clock.settle();
  expect(opens).toEqual([]);
  await ui.unmount();
});

test("a pane that did not get the size it asked for says so, in one line", async ($, on) => {
  // The engine keeps a size the person dragged, and the request is a request. The
  // pane then says what it is and what to press rather than claiming the size it
  // asked for. Measured against the size the module itself would ask for from the
  // viewport it was handed, so a body that matches it shows no hint -- which is
  // the control, in the same test.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  captureOpens(on);
  const HINT = "Drag the pane edge to resize; z switches layouts";
  // Asked for 140 (160 less the margin). The design's rule for telling a granted size
  // from a person's drag: "a size within 4 cells of the request as granted, and
  // anything further off as the person's own drag", so the boundary is drawn at 136
  // and 135 as well as at the two ends -- a slack of 4 is a number, and these are the
  // two drawings that say which side of it each one falls on.
  const cases = [
    { columns: 60, hint: true },
    { columns: 135, hint: true },
    { columns: 136, hint: false },
    { columns: 140, hint: false },
  ] as const;
  for (const surface of ["terminal", "desktop"] as const) {
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    for (const one of cases) {
      const ui = await $.ui.mount({
        plugin: "opum-lore",
        surface,
        component: "Pane",
        requestId: "lore-pane",
        props: docked(160, one.columns),
        viewport: { columns: 160, rows: 50, isFullscreen: true },
      });
      await clock.settle();
      const shown = await ui.find({ type: "Text", text: HINT });
      expect(shown === undefined, `drawn ${one.columns} of the 140 asked for`).toBe(!one.hint);
      await ui.unmount();
    }
  }
});

test("a pane at its normal size shows no hint, however small the surface keeps it", async ($, on) => {
  // The second control: only a pane that asked for a size can have been denied
  // one, so a normal-size pane says nothing about the size it drew at.
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  captureOpens(on);
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: docked(160, 60),
    viewport: { columns: 160, rows: 50, isFullscreen: true },
  });
  expect(await ui.find({ type: "Text", text: /Drag the pane edge to resize/ })).toBeUndefined();
  await ui.unmount();
});

test("the pane command toggles with its argument and answers with the state it left", async ($, on) => {
  // `/lore-pane full` is the toggle's other arm, and `args` carries everything
  // after the name. The answer names the state, and an argument that is not
  // `full` changes nothing rather than being guessed at.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  // `args` is "" for a bare `/lore-pane`, which is what the engine passes when the
  // person types the name alone; the presentation is the docked fullscreen layout.
  const run = (args: string) =>
    $.command.run({
      command: "lore-pane",
      args,
      origin: { kind: "composer" },
      presentation: { isFullscreen: true, columns: 160 },
    });

  // The argument is a toggle, and each answer names the state it left.
  expect((await run("full")).text).toBe("Lore pane is full screen.");
  expect((await run("full")).text).toBe("Lore pane is at its normal size.");

  // An argument that is not `full` is refused rather than guessed at, and leaves
  // the pane where it was.
  const refused = await run("sideways");
  expect(refused.text).toContain("full");
  expect((await run("")).text).toBe("Lore pane opened.");

  // The bare command reopens the pane at the size it remembers, and it is the
  // person's own command, so it asks for the keyboard. Docked, the command's own
  // columns are enough to ask with (160 less the margin); at the normal size there
  // is no size to ask for at all.
  await clock.settle();
  expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true });
  await run("full");
  expect((await run("")).text).toBe("Lore pane is full screen.");
  await clock.settle();
  expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true, columns: 140 });

  // And what it left is remembered: the next session starts full -- restored on its
  // first draw, which is nobody's ask, so that open carries no `focus`.
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  opens.length = 0;
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: docked(160, 80),
    viewport: { columns: 160, rows: 50, isFullscreen: true },
  });
  await clock.settle();
  expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 140 });
  await ui.unmount();
  expect(seen.some((argv) => argv[1] === "query")).toBe(true);
});

// ── The side-by-side layout (LCLI-666, design section 1's layout bullet) ──────

/** A full-mode docked pane of `bodyColumns` cells, which is what the split is measured on. */
const splitPane = (bodyColumns: number) => ({
  plugin: "opum-lore" as const,
  component: "Pane" as const,
  requestId: "lore-pane",
  props: docked(160, bodyColumns, 50),
  viewport: { columns: 160, rows: 50, isFullscreen: true },
});

test("in full mode at 120 body columns Read draws the bundle list beside the document", async ($, on) => {
  // The design keeps the list in a left column with the document on the right from
  // 120 body columns, and the stacked layout below that. The list is the same bundle
  // list Browse draws, with the open document at full strength; the document is the
  // tree the stacked Read draws, so both are asserted in the one drawing.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  // Open a document once, from Browse, where the row is the tab's own body rather
  // than the split's left column: every mount after this one draws the Read tab with
  // it already open, which is also the state the threshold is measured in.
  const browse = await $.ui.mount({ ...splitPane(140), surface: "terminal" });
  await clock.settle();
  await browse.press({ key: "tab-browse" });
  await browse.press({ key: "refresh" });
  await browse.press({ key: "open-adr/0001-x" });
  await browse.unmount();

  for (const surface of ["terminal", "desktop"] as const) {
    // At 140, and at exactly the 120 the design names: the list is drawn beside the
    // document. One column under it is the control, and the drawing is otherwise the
    // same one -- the document is there in all three.
    for (const columns of [140, 120, 119]) {
      const ui = await $.ui.mount({ ...splitPane(columns), surface });
      await clock.settle();
      const [row, sibling, document] = await Promise.all([
        ui.find({ key: "open-adr/0001-x" }),
        ui.find({ key: "open-reference/notes" }),
        ui.find({ type: "Markdown", text: /The body of the notes\./ }),
      ]);
      // The document is drawn either way; the list and its container only at 120+.
      expect(document).toBeDefined();
      const split = await ui.find({ key: "side-by-side" });
      if (columns >= 120) {
        expect(split).toBeDefined();
        expect(row).toBeDefined();
        // The open document's own row is at full strength; its sibling stays dim.
        expect(row?.props.dimColor).toBe(false);
        expect(sibling?.props.dimColor).toBe(true);
        // The list is the LEFT column and the document the right one, which the two
        // being drawn in one row does not by itself say.
        const [left, right] = childrenUnder(await ui.drawn(), "side-by-side");
        expect(JSON.stringify(left)).toContain("open-adr/0001-x");
        expect(JSON.stringify(left)).not.toContain("The body of the notes.");
        expect(JSON.stringify(right)).toContain("The body of the notes.");
        expect(JSON.stringify(right)).not.toContain('"open-adr/0001-x"');
      } else {
        expect(split).toBeUndefined();
        expect(row).toBeUndefined();
      }
      await ui.unmount();
    }
  }
});

test("in full mode at 120 body columns Search draws the results beside the document", async ($, on) => {
  // On Search the list is the results. The form that makes them stays pane-wide, and
  // the open document's own hit is at full strength beside the document it names.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  for (const surface of ["terminal", "desktop"] as const) {
    const search = async (bodyColumns: number) => {
      const ui = await $.ui.mount({ ...splitPane(bodyColumns), surface });
      await clock.settle();
      await ui.press({ key: "refresh" });
      await ui.press({ key: "open-adr/0001-x" });
      await ui.press({ key: "tab-search" });
      await ui.input({ key: "search-text", text: "notes" });

      return ui;
    };

    const split = await search(140);
    expect(await split.find({ key: "side-by-side" })).toBeDefined();
    // Both lists are drawn at once: the results on the left, the document on the right.
    expect(await split.find({ key: "open-adr/0001-x" })).toBeDefined();
    expect(await split.find({ type: "Markdown", text: /The body of the notes\./ })).toBeDefined();
    expect((await split.find({ key: "open-adr/0001-x" }))?.props.dimColor).toBe(false);
    const [results, document] = childrenUnder(await split.drawn(), "side-by-side");
    expect(JSON.stringify(results)).toContain("open-adr/0001-x");
    expect(JSON.stringify(results)).not.toContain("The body of the notes.");
    expect(JSON.stringify(document)).toContain("The body of the notes.");
    await split.unmount();

    // Below the threshold the results are still drawn, stacked under the form.
    const stacked = await search(119);
    expect(await stacked.find({ key: "side-by-side" })).toBeUndefined();
    expect(await stacked.find({ key: "open-adr/0001-x" })).toBeDefined();
    await stacked.unmount();
  }
});

test("the split is full mode's, not a wide pane's on its own", async ($, on) => {
  // The design adapts the layout "in full mode". A normal-size pane that happens to
  // be wide -- a docked pane on a wide terminal -- keeps the stacked layout, so the
  // split is the mode's and not only the width's.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  const ui = await $.ui.mount({ ...splitPane(140), surface: "terminal" });
  await clock.settle();
  await ui.press({ key: "refresh" });
  await ui.press({ key: "open-adr/0001-x" });
  expect(await ui.find({ key: "side-by-side" })).toBeUndefined();
  expect(await ui.find({ key: "open-adr/0001-x" })).toBeUndefined();
  expect(await ui.find({ type: "Markdown", text: /The body of the notes\./ })).toBeDefined();
  await ui.unmount();
});
