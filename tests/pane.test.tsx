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
