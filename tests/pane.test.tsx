import type { On, UiOpenResult } from "claude-code";
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
  unknownIds: readonly string[] = [],
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
      const id = e.argv[2] ?? "";
      if (unknownIds.includes(id)) {
        // What `lore read` does for a concept the bundle does not have: nothing on
        // stdout, its own words on stderr, exit 3 (not_found).
        return { value: { exitCode: 3, stdout: "", stderr: `lore: no concept "${id}"\n`, isStdoutTruncated: false, isStderrTruncated: false } };
      }

      return ok(readOf(id, body));
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

// ── The full-screen toggle (LCLI-666; sized per DEC-154, LCLI-675) ────────────

/**
 * Every `$.ui.open` the module made, in order: the args are what the toggle is.
 *
 * `answer` is what the engine replies with, defaulting to the placed arm. A test that
 * wants the other arm -- the engine refusing to place an unasked open below its floor --
 * passes one, because the module's honest answer is composed from it (LCLI-672).
 *
 * `$.ui.panes` is deliberately NOT answered anywhere in this file: the engine's test kit
 * has no such call at all (measured: `$.ui.panes is not a function`), so every path here
 * runs the arm the module keeps for an engine it cannot ask -- and that arm is what these
 * tests hold. The listing arm is measured in a live session instead (LCLI-672 note), where
 * the call exists and answers.
 */
function captureOpens(
  on: On,
  answer: () => UiOpenResult = () => ({ isPlaced: true }),
): Record<string, unknown>[] {
  const opens: Record<string, unknown>[] = [];
  on("ui.open", async (_$, e) => {
    opens.push({ ...e });

    return { value: answer() };
  });

  return opens;
}

/**
 * The engine answers a session needs beneath it: nothing answers them on its own, so a
 * test that starts a session says what the session start and the registrations return.
 * `commands` and `tools`, when given, collect the command and tool specs the module
 * registered, which is the only place they are visible: a command spec is captured so a
 * test can assert there is NONE (LCLI-667 -- the engine's `lore` skill owns that name,
 * so the pane registers no slash command), and a tool spec because the engine's own
 * registry sits below the test's hooks (LCLI-668).
 */
function mockSession(
  on: On,
  commands?: Record<string, unknown>[],
  tools?: Record<string, unknown>[],
): void {
  on("command.register", async (_$, e) => {
    commands?.push({ ...e });

    return { value: { command: e.name } };
  });
  on("tool.register", async (_$, e) => {
    tools?.push({ ...e });

    // What the engine answers with: the full name the model calls the tool by
    // (`ToolSpec` spells a declared name `mcp__<plugin>__<name>`).
    return { value: { tool: `mcp__opum-lore__${e.name}` } };
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

/**
 * The props a docked pane draws with, on a body of `bodyColumns` cells.
 *
 * The viewport beside a docked pane is the TRANSCRIPT column, not the terminal (read
 * from the 2.1.288 build, LCLI-674): the terminal a dock ask recovers is viewport
 * columns + this body + 1 for the divider (DEC-154 rule 2 as amended), so the two are
 * chosen per test from the shape being modelled.
 */
const docked = (bodyColumns: number, rows = 50) => ({
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
      props: docked(79),
      viewport: { columns: 80, rows: 50, isFullscreen: true },
    });
    // The hotkey is the pane's only key hook: a Button's `hotkey` is pressed while
    // the pane holds the focus, which is how `z` reaches the toggle.
    expect((await ui.find({ key: "full" }))?.props.hotkey).toBe("z");

    await ui.press({ key: "full" });
    await clock.settle();
    // DEC-154 rule 2 as amended: the ask is the terminal width recovered from this one
    // render -- the 80-column transcript plus the 79-cell drawn body plus 1, the pane's
    // frame edge where it meets the transcript (LCLI-674: 79 body cells under an 80-wide
    // pane) = 160 -- less the engine's 24-column floor: 136. Asserted as the WHOLE list,
    // so a second ask for the one toggle cannot pass (review F4).
    expect(opens).toEqual([{ id: "lore-pane", title: "Lore", focus: true, columns: 136 }]);

    // A redraw raises no ask of its own: the person's toggle asked once (review F4).
    await ui.press({ key: "refresh" });
    await clock.settle();
    expect(opens).toHaveLength(1);

    await ui.press({ key: "full" });
    await clock.settle();
    // Back to the normal size: no `columns` at all, which is the request for the
    // surface's own share (`PaneOpenArgs`: left out, the share).
    expect(opens).toEqual([
      { id: "lore-pane", title: "Lore", focus: true, columns: 136 },
      { id: "lore-pane", title: "Lore", focus: true },
    ]);
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
    // 40 rows of surface less the engine's 11 (PROMPT_FLOOR_ROWS 8 plus
    // TRANSCRIPT_PEEK_ROWS 3, DEC-154 rule 1): the ceiling the engine actually grants.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true, rows: 29 });
    // An inline pane short of its ask says NOTHING about it: the shortfall is the
    // content-sized pane being honest (rule 1), and the generic held hint is gone.
    expect(await ui.find({ type: "Text", text: /Width kept at/ })).toBeUndefined();
    expect(await ui.find({ type: "Text", text: /Drag the pane edge to resize/ })).toBeUndefined();
    await ui.press({ key: "full" });
    await clock.settle();
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", focus: true });
    await ui.unmount();
  }
});

test("a stored full mode and a tool call raise the same inline ask as the person's key", async ($, on) => {
  // DEC-154 rule 1's ask on the other paths that raise it -- the stored full mode's
  // first render, and a tool call carrying `full` -- so "every path" is measured on the
  // inline axis too and not only the dock's (LCLI-675 review, rule-1 note).
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  for (const surface of ["terminal", "desktop"] as const) {
    const at = async () => {
      const ui = await $.ui.mount({
        plugin: "opum-lore",
        surface,
        component: "Pane",
        requestId: "lore-pane",
        props: inlinePane(40, 12),
        viewport: { columns: 100, rows: 40, isFullscreen: false },
      });
      await clock.settle();

      return ui;
    };

    // The stored mode's first render, nobody's ask: unfocused, rows - 11.
    await $.session.start({ cwd: "/repo", surface, isInteractive: true });
    await clock.settle();
    opens.length = 0;
    const stored = await at();
    expect(opens).toEqual([{ id: "lore-pane", title: "Lore", rows: 29 }]);
    await stored.unmount();

    // The tool's ask, on the same surface: the mode does not change (it is already
    // full), so the tool's own open is what raises it -- unfocused too.
    await $.tool.call({ tool: DASHBOARD, full: true });
    opens.length = 0;
    const byTool = await at();
    expect(opens).toEqual([{ id: "lore-pane", title: "Lore", rows: 29 }]);
    await byTool.unmount();
  }
});

test("an open never lowers the ask a person's toggle left standing", async ($, on) => {
  // LCLI-675 review F1, measured there as a race: a tool call's open reads the mode from
  // before the person's toggle write lands, and the first implementation nulled the
  // standing ask on that stale read -- the pane then sat in full mode at the surface's
  // share with nothing left to ask. Staged deterministically here: the person's ask is
  // raised and STAYS (no viewport yet, so no draw can build it), a tool call opens the
  // pane beside it, and the next measured draw must spend the PERSON's ask -- keyboard
  // intent included.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();
  opens.length = 0;
  // A draw with no viewport at all: the full ask has nothing to build from, and stays.
  const blind = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: docked(79),
  });
  await clock.settle();
  await blind.press({ key: "full" });
  await clock.settle();
  expect(opens).toEqual([]);
  // The concurrent call: its open must leave the standing ask -- and the person's
  // keyboard intent with it -- exactly where it found it.
  const raced = await $.tool.call({ tool: DASHBOARD, full: true });
  expect(raced.result).toBe("Opened the Lore pane, full requested.");
  await blind.unmount();
  // The next measured draw spends the person's ask, with the focus their press carries.
  opens.length = 0;
  const sized = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: docked(79),
    viewport: { columns: 80, rows: 50, isFullscreen: true },
  });
  await clock.settle();
  expect(opens).toEqual([{ id: "lore-pane", title: "Lore", focus: true, columns: 136 }]);
  await sized.unmount();
});

test("a full pane asks once, on its first draw; a resize asks for nothing", async ($, on) => {
  // DEC-154 rule 2 as amended: the ask is made genuinely once -- a stored full mode asks
  // on its first render, and NOTHING re-derives it afterwards, not even a viewport that
  // moved under the pane. The earlier design re-asked on every viewport change, which is
  // exactly the shape that ends up chasing the pane's own new width.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  for (const surface of ["terminal", "desktop"] as const) {
    // Each surface models its own session: the stored full mode asks once per session,
    // on the session's first render.
    await $.session.start({ cwd: "/repo", surface, isInteractive: true });
    const at = async (columns: number) => {
      const ui = await $.ui.mount({
        plugin: "opum-lore",
        surface,
        component: "Pane",
        requestId: "lore-pane",
        props: docked(79),
        viewport: { columns, rows: 50, isFullscreen: true },
      });
      await clock.settle();

      return ui;
    };

    opens.length = 0;
    const first = await at(80);
    // Nobody asked for this one: the session remembered `full`, so the draw that sizes it
    // opens WITHOUT `focus` rather than taking the keyboard at startup. The one ask: the
    // 80-column transcript plus the 79 drawn plus 1, less the floor -- asserted as the
    // WHOLE list, so "exactly one ask on its first render" cannot pass on a second.
    expect(opens).toEqual([{ id: "lore-pane", title: "Lore", columns: 136 }]);
    await first.unmount();

    opens.length = 0;
    const same = await at(80);
    expect(opens).toEqual([]);
    await same.unmount();

    opens.length = 0;
    const wider = await at(120);
    // The viewport moved under the pane, and the amended rule holds: a resize asks for
    // nothing. The one ask stays the one the first render made.
    expect(opens).toEqual([]);
    await wider.unmount();
  }
});

test("a session opens the pane unsized, registers no command, and asks for no size", async ($, on) => {
  // What a session start does, in one place. It opens the pane unsized and unfocused;
  // it registers NO slash command (LCLI-667: the engine's `lore` skill owns that name,
  // and a command of the same name is refused on 2.1.288, which takes the whole hook
  // down with it -- the pane's entry point is the tool, asserted below the dashboard
  // tests); and the draws that follow ask for nothing, which is the control for the
  // toggle -- without a mode change there is no size to ask for, so the pane must not
  // reopen on every draw.
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const commands: Record<string, unknown>[] = [];
  mockSession(on, commands);
  const opens = captureOpens(on);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  expect(commands).toEqual([]);
  expect(opens).toEqual([{ id: "lore-pane", title: "Lore" }]);
  opens.length = 0;
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: docked(79),
    viewport: { columns: 80, rows: 50, isFullscreen: true },
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
      props: docked(79),
      viewport: { columns: 80, rows: 50, isFullscreen: true },
    });
    await clock.settle();
    // Restored, not asked for: the request carries no `focus`, and carries the ask the
    // amended rule builds -- 80 transcript + 79 drawn + 1, less the 24-column floor.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 136 });
    // The draw that asked says so too: the toggle now shows the CURRENT mode as state
    // with the key as the hint (seq 243), not the action it used to name.
    expect((await restored.find({ key: "full" }))?.props.label).toBe("Full · z for normal");
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
      props: docked(79),
      viewport: { columns: 80, rows: 50, isFullscreen: true },
    });
    await clock.settle();
    expect(opens).toEqual([]);
    expect((await reopened.find({ key: "full" }))?.props.label).toBe("Normal · z for full");
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
    props: docked(79),
    viewport: { columns: 80, rows: 50, isFullscreen: true },
  });
  await clock.settle();
  expect(opens).toEqual([]);
  await ui.unmount();
});

test("a full docked pane names a held width in one line, and only when one holds", async ($, on) => {
  // DEC-154 rule 3: while a width holds against the ask, the pane names it and how to
  // change it, and shows no generic held hint. "Holds" is the DESIGN'S OWN reading and
  // Quest's board's alike (seq 234): a docked full pane more than `SIZE_SLACK` short of
  // its ask is at a width the surface kept -- within 4 cells granted, anything further
  // off the person's own -- read on every draw, the spending render included, because a
  // kept width keeps the surface's answer and an ignored request raises no further draw
  // to say it on (measured, LCLI-676). The controls are direct: a pane that GOT its ask
  // draws nothing (matched as a PATTERN, so a line naming another width cannot pass as
  // absence -- review F5), and a shortfall with no ask in flight this session -- the
  // shape LCLI-675's F2 kept quiet and the LCLI-676 re-test (seq 243) put back in the
  // kept words, the same state both panes now classify the same way -- draws the line
  // too. That last arm is what a reintroduced spend-state suppression reddens.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  captureOpens(on);
  const GENERIC = /Drag the pane edge to resize/;
  const KEPT = "Width kept at 80 (you set it): drag the pane edge to change";
  for (const surface of ["terminal", "desktop"] as const) {
    const at = async (transcript: number, body: number) => {
      const ui = await $.ui.mount({
        plugin: "opum-lore",
        surface,
        component: "Pane",
        requestId: "lore-pane",
        props: docked(body),
        viewport: { columns: transcript, rows: 50, isFullscreen: true },
      });
      await clock.settle();

      return ui;
    };

    // The kept machine: a 79-cell body under its 80-wide frame beside an 80-column
    // transcript -- terminal 160, ask 136, far short of what drew. The mount's own
    // render spends the ask and is short, and a short docked draw is the line's
    // condition itself, so it is drawn there and on every redraw after it.
    await $.session.start({ cwd: "/repo", surface, isInteractive: true });
    const kept = await at(80, 79);
    expect(await kept.find({ type: "Text", text: KEPT })).toBeDefined();
    await kept.press({ key: "refresh" });
    await clock.settle();
    expect(await kept.find({ type: "Text", text: KEPT })).toBeDefined();
    expect(await kept.find({ type: "Text", text: GENERIC })).toBeUndefined();
    await kept.unmount();

    // Granted: the transcript at the engine's 24-column floor, the drawn body within the
    // slack of the ask -- nothing is drawn, before or after a redraw.
    await $.session.start({ cwd: "/repo", surface, isInteractive: true });
    const granted = await at(24, 135);
    expect(await granted.find({ type: "Text", text: /Width kept at/ })).toBeUndefined();
    await granted.press({ key: "refresh" });
    await clock.settle();
    expect(await granted.find({ type: "Text", text: /Width kept at/ })).toBeUndefined();
    expect(await granted.find({ type: "Text", text: GENERIC })).toBeUndefined();
    await granted.unmount();

    // A shortfall with no ask in flight -- the same 80/79 machine mounted again, with
    // the previous arms' asks long spent and none raised since (a terminal widened under
    // a granted pane reads exactly this way). A short docked draw is at a kept width by
    // the design's own reading (seq 234, the state Quest's board words the same way), so
    // the line is drawn -- LCLI-675's F2 kept this quiet; the re-test ruled otherwise.
    // No open rides this arm, so nothing redraws it and the assertion reads the draw
    // itself: this is where a reintroduced spend-state suppression reddens.
    const resized = await at(80, 79);
    await resized.press({ key: "refresh" });
    await clock.settle();
    expect(await resized.find({ type: "Text", text: KEPT })).toBeDefined();
    expect(await resized.find({ type: "Text", text: GENERIC })).toBeUndefined();
    await resized.unmount();
  }
});

test("a pane at its normal size says nothing about its size", async ($, on) => {
  // The second control: only a pane that asked for a size can have been denied one, so a
  // normal-size pane says nothing about the size it drew at -- not the kept-width line,
  // and not the generic hint the design used to keep.
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
    props: docked(60),
    viewport: { columns: 80, rows: 50, isFullscreen: true },
  });
  expect(await ui.find({ type: "Text", text: /Width kept at/ })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: /Drag the pane edge to resize/ })).toBeUndefined();
  await ui.unmount();
});

// ── The side-by-side layout (LCLI-666, design section 1's layout bullet) ──────

/**
 * A full-mode docked pane of `bodyColumns` cells, which is what the split is measured on.
 *
 * The transcript sits at the engine's 24-column floor, so the pane models one that got
 * the size it asked for -- wanted = transcript + body + 1, less the 24 floor, lands
 * within the slack of what drew -- and the kept-width line stays out of these drawings.
 */
const splitPane = (bodyColumns: number) => ({
  plugin: "opum-lore" as const,
  component: "Pane" as const,
  requestId: "lore-pane",
  props: docked(bodyColumns, 50),
  viewport: { columns: 24, rows: 50, isFullscreen: true },
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

// ── The dashboard tool (LCLI-668) ─────────────────────────────────────────────

/**
 * The tool the model calls, as `ToolSpec` spells a declared name: `mcp__<plugin>__<name>`,
 * with the plugin's name `opum-lore` from `.claude-plugin/plugin.json`. Spelled out here
 * rather than imported, because this is the model's side of the contract: a module whose
 * matcher disagreed with its registration would leave every call unanswered, which is
 * what the misspelled-name control below measures.
 */
const DASHBOARD = "mcp__opum-lore__dashboard";

test("the dashboard tool answers with the drawn size and why, and pins the slack at 4", async ($, on) => {
  // DEC-154 rule 4's middle arm -- the LCLI-674 photographed defect, "the full size"
  // claimed while the pane drew something else -- is the reason this task exists, so all
  // three arms are driven here, and the slack's own value is pinned by two renders one
  // column apart: the comparison is `drawn >= asked - SIZE_SLACK`, and with
  // wanted - drawn equal to transcript - 23 (the formula's own identity), a 27-column
  // transcript lands exactly on the boundary where 28 is the first miss.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);
  for (const surface of ["terminal", "desktop"] as const) {
    const at = async (transcript: number, body: number) => {
      const ui = await $.ui.mount({
        plugin: "opum-lore",
        surface,
        component: "Pane",
        requestId: "lore-pane",
        props: docked(body),
        viewport: { columns: transcript, rows: 50, isFullscreen: true },
      });
      await clock.settle();

      return ui;
    };
    const answer = async () => (await $.tool.call({ tool: DASHBOARD, full: true })).result;

    // No pane has drawn in this session: the size is unknown, and the answer says only
    // that it was asked for -- no number, no claim.
    await $.session.start({ cwd: "/repo", surface, isInteractive: true });
    await clock.settle();
    expect(await answer()).toBe("Opened the Lore pane, full requested.");

    // The granted shape: ask 136, drawn body 135 -- within the slack.
    const granted = await at(24, 135);
    expect(await answer()).toBe("Opened the Lore pane, the full size.");
    await granted.unmount();

    // The dock short shape, with no ask in flight this session: a docked full pane more
    // than the slack short of its ask is at a width the surface kept -- the design's own
    // rule (within 4 cells granted, anything further off the person's own, seq 234) and
    // the same classification Quest's board makes of the same state. LCLI-675's F2 had
    // this shape name no owner; the LCLI-676 re-test (seq 243) ruled the two panes word
    // it alike, so the kept wording stands wherever the shortfall does.
    const resized = await at(80, 79);
    expect(await answer()).toBe("Opened the Lore pane at 80 columns; the width is kept.");
    await resized.unmount();

    // The slack boundary, from the same identity: 27 lands exactly on
    // `drawn >= asked - 4` and 28 is the first miss.
    const edge = await at(27, 100);
    expect(await answer()).toBe("Opened the Lore pane, the full size.");
    await edge.unmount();
    const past = await at(28, 100);
    expect(await answer()).toBe("Opened the Lore pane at 101 columns; the width is kept.");
    await past.unmount();

    // Held: a fresh ask is spent and never granted (the pane keeps its 79-cell body), so
    // the shortfall is named as the person's own width -- the same words as the shape
    // above, because they are the same held state, however the ask got there.
    await $.session.start({ cwd: "/repo", surface, isInteractive: true });
    const held = await at(80, 79);
    await held.press({ key: "refresh" });
    await clock.settle();
    expect(await answer()).toBe("Opened the Lore pane at 80 columns; the width is kept.");
    await held.unmount();

    // Inline: the drawn size and the prompt's own reason, on the other axis -- joined the
    // same way, with no second "opened" (seq 243).
    const inline = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: inlinePane(40, 12),
      viewport: { columns: 100, rows: 40, isFullscreen: false },
    });
    await clock.settle();
    expect(await answer()).toBe("Opened the Lore pane at 12 rows; the screen keeps room for the prompt.");
    await inline.unmount();
  }
});

test("the dashboard tool registers at session start, and a bare call opens the pane without the keyboard", async ($, on) => {
  // Registration is asserted on the SPEC the module handed the engine, which is what the
  // model is listed; the full name cannot be read back in a test, because the engine's own
  // tool registry sits below the test's hooks. The call below is the other half: only a
  // matcher spelled as the engine spells the tool answers, and the misspelling control
  // after the loop is what says so.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  const tools: Record<string, unknown>[] = [];
  mockSession(on, undefined, tools);
  const opens = captureOpens(on);

  for (const surface of ["terminal", "desktop"] as const) {
    await $.session.start({ cwd: "/repo", surface, isInteractive: true });
    // The session's own refresh is waited out, so what the assertions read is the tool's
    // doing and not a race with the start.
    await clock.settle();
    opens.length = 0;

    expect(tools).toHaveLength(1);
    const spec = tools[0] ?? {};
    expect(spec.name).toBe("dashboard");
    // The description is listed to the model in EVERY session that loads the mod, so it
    // stays to one or two sentences (design of record).
    const description = String(spec.description ?? "");
    const sentences = (description.match(/[.!?](?:\s|$)/gu) ?? []).length;
    expect(sentences).toBeGreaterThanOrEqual(1);
    expect(sentences).toBeLessThanOrEqual(2);
    const schema = spec.inputSchema as { required?: unknown; properties: Record<string, unknown> };
    // Every field is optional, so a bare call is a valid call.
    expect(schema.required).toBeUndefined();
    expect(Object.keys(schema.properties)).toEqual(["doc", "query", "full"]);

    const answer = await $.tool.call({ tool: DASHBOARD });
    expect(answer.result).toBe("Opened the Lore pane.");
    // The open is what the pane was TOLD, not what a surface did with it: no `focus`,
    // because Claude may call this while the person is typing, and no `closeOnEscape` --
    // with `focus`, that pair is what would make the pane a dialog rather than a pane.
    expect(opens).toEqual([{ id: "lore-pane", title: "Lore" }]);

    // And the pane it opened draws on the surface that session is on.
    const ui = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: PANE,
    });
    expect(await ui.find({ key: "tab-browse" })).toBeDefined();
    await ui.unmount();

    tools.length = 0;
  }

  // The control: a name one character off is not this tool, so nothing answers it.
  opens.length = 0;
  let refused: unknown = null;
  try {
    await $.tool.call({ tool: "mcp__opum-lore__dashboards" });
  } catch (error) {
    refused = error;
  }
  expect(refused).not.toBeNull();
  expect(opens).toEqual([]);
});

test("each dashboard input lands where it should, on the terminal and the desktop", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);

  for (const surface of ["terminal", "desktop"] as const) {
    // `doc`: the concept is read through the CLI, and the pane is left on it.
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    // The session's own background refresh is allowed to land before the call, so what
    // the assertions below read is the tool's doing and not a race with the start.
    await clock.settle();
    opens.length = 0;
    seen.length = 0;
    const opened = await $.tool.call({ tool: DASHBOARD, doc: "adr/0001-x" });
    expect(opened.result).toBe("Opened the Lore pane, adr/0001-x on Read.");
    expect(seen).toContainEqual(["lore", "read", "adr/0001-x", "--json"]);
    expect(opens).toEqual([{ id: "lore-pane", title: "Lore" }]);
    const reading = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: PANE,
    });
    expect((await reading.find({ key: "tab-read" }))?.props.variant).toBe("primary");
    expect(await reading.find({ type: "Markdown", text: /The body of the notes\./ })).toBeDefined();
    await reading.unmount();

    // `query`: the text reaches `lore query` after the `--`, and the pane is left on the
    // Search tab, drawing the results that text produced.
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    await clock.settle();
    opens.length = 0;
    seen.length = 0;
    const searched = await $.tool.call({ tool: DASHBOARD, query: "retention" });
    expect(searched.result).toBe('Opened the Lore pane, Search for "retention".');
    expect(seen).toContainEqual(["lore", "query", "--json", "--", "retention"]);
    expect(opens).toEqual([{ id: "lore-pane", title: "Lore" }]);
    const searching = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: PANE,
    });
    expect((await searching.find({ key: "tab-search" }))?.props.variant).toBe("primary");
    await searching.unmount();

    // `full`: the mode changes, and the DRAW that follows asks the surface for the size --
    // with no `focus`, because the ask is Claude's and the keyboard is the person's. The
    // button's own label is a second reading of the same state.
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    await clock.settle();
    opens.length = 0;
    const sized = await $.tool.call({ tool: DASHBOARD, full: true });
    // DEC-154 rule 4: the answer reports the DRAWN size, never the asked one. No draw of
    // a full pane has completed at this point -- the pane is not even mounted -- so the
    // answer says only that the size was asked for, never what it will be.
    expect(sized.result).toBe("Opened the Lore pane, full requested.");
    const full = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: docked(79),
      viewport: { columns: 80, rows: 50, isFullscreen: true },
    });
    await clock.settle();
    // Two opens, and both are the tool's: the immediate one that shows the pane, then the
    // draw's sized request -- which is where the full size is actually asked for, because
    // a draw is the only place that knows the viewport. Neither carries `focus`.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 136 });
    expect(opens.every((one) => one.focus === undefined)).toBe(true);
    expect((await full.find({ key: "full" }))?.props.label).toBe("Full · z for normal");
    await full.unmount();

    // `full: false` asks for the normal size back, and leaves the store where the next
    // round's session start reads it: the size is remembered, as the toggle's is.
    const back = await $.tool.call({ tool: DASHBOARD, full: false });
    expect(back.result).toBe("Opened the Lore pane, its normal size.");
    // The call refreshed the pane, and that read is still in flight; it is waited out so
    // nothing a test started outlives the test.
    await clock.settle();
  }
});

test("a dashboard call on a pane that is already up restores the size its mode implies, once per open", async ($, on) => {
  // The live shape: the pane is MOUNTED before the call, and already full -- the steady
  // state of a remembered full mode, or of a `z` the person just pressed. The tool's open
  // is unsized (a `tool.call` carries no viewport to size from) and "each open sets it
  // anew", so that open CLEARS the size the surface was holding. The open raises ONE
  // restoration ask (DEC-154 rule 2 as amended: an ask is raised by a toggle, or by an
  // open that cleared the size, and never by a resize or a redraw), or nothing re-asks
  // and the pane stays collapsed at the surface's share (review F2). The signal is the
  // open args, not the kept-width line -- the harness draws whatever size the props name,
  // so it cannot show what a cleared request leaves on screen.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on, { "pane-mode": "full" });
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  const opens = captureOpens(on);

  for (const surface of ["terminal", "desktop"] as const) {
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    await clock.settle();
    opens.length = 0;
    const ui = await $.ui.mount({ ...splitPane(140), surface });
    await clock.settle();
    // The pane is up and full before the call, which is the premise: 24 transcript +
    // 140 drawn + 1, less the 24-column floor.
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 141 });

    // A call that asks for the size the pane is ALREADY at: the mode does not change, so
    // the restoration ask is the only thing that can put the size back. And the answer
    // reports what that pane DRAWS -- within the slack of the ask, so "the full size"
    // (DEC-154 rule 4).
    opens.length = 0;
    const same = await $.tool.call({ tool: DASHBOARD, full: true });
    expect(same.result).toBe("Opened the Lore pane, the full size.");
    // The engine redraws a state change itself ("the sites that read it while drawing are
    // drawn again"); the harness draws on an act, so this press stands in for that redraw.
    // What is under test is the DRAW it causes, not the press.
    await ui.press({ key: "refresh" });
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 141 });
    // Nobody asked the person's keyboard for it, then or now.
    expect(opens.every((one) => one.focus === undefined)).toBe(true);

    // The amended rule's control: a redraw with nothing raised asks nothing, so the
    // restoration cannot re-ask on every render either.
    const restored = opens.length;
    await ui.press({ key: "refresh" });
    expect(opens.length).toBe(restored);

    // And a bare call, which changes no state at all, still has to leave the pane at the
    // size its mode implies rather than at the surface's share.
    opens.length = 0;
    const bare = await $.tool.call({ tool: DASHBOARD });
    expect(bare.result).toBe("Opened the Lore pane.");
    await ui.press({ key: "refresh" });
    expect(opens[opens.length - 1]).toEqual({ id: "lore-pane", title: "Lore", columns: 141 });
    await ui.unmount();
  }
});

test("an unknown doc id is refused by name, and opens nothing else in its place", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  // `adr/nope` is the one id this bundle does not have.
  mockLore(on, seen, false, "The body of the notes.", undefined, ["adr/nope"]);
  mockSession(on);
  const opens = captureOpens(on);

  for (const surface of ["terminal", "desktop"] as const) {
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    await clock.settle();
    opens.length = 0;
    const answer = await $.tool.call({ tool: DASHBOARD, doc: "adr/nope" });
    // The model reads an error result naming the id it asked for, so it can correct the
    // call itself; nothing is opened and no tab is switched.
    expect(answer.deny).toContain("adr/nope");
    expect(answer.result).toBeUndefined();
    expect(opens).toEqual([]);
    // Nothing in the document's place: the pane draws lore's own message and no document
    // at all, rather than the last one that happened to be open.
    const ui = await $.ui.mount({
      plugin: "opum-lore",
      surface,
      component: "Pane",
      requestId: "lore-pane",
      props: PANE,
    });
    expect(await ui.find({ type: "Markdown", text: /The body of the notes\./ })).toBeUndefined();
    expect(await ui.find({ type: "Text", text: /Read adr\/nope failed \(lore exited 3\)/ })).toBeDefined();
    await ui.unmount();
  }
});

test("the landing strip belongs to an open document, not to an empty Read tab", async ($, on) => {
  // Restored to the base (LCLI-668 review F4): the Read tab drew the landing strip only
  // once a document was open, and the LCLI-666 move folded the empty-document tree into
  // the fallthrough that carries it. Whether the strip BELONGS on an empty Read tab is a
  // separate question; this pins that the move did not answer it by accident.
  //
  // The reads are mocked here rather than through `mockLore`, because the strip needs a
  // repository whose status read reports a changed `.md` -- `mockLore` answers every git
  // argv with the toplevel, which parses to no paths at all.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  mockSession(on);
  captureOpens(on);
  on("process.run", async (_$, e) => {
    const argv = [...e.argv];
    if (argv[0] === "git") {
      return ok(argv.includes("status") ? " M docs/adr/0001-x.md\n" : "/repo\n");
    }
    const sub = argv[1] ?? "";
    if (sub === "query") {
      return ok(CONCEPTS);
    }
    if (sub === "types") {
      return ok(TYPES);
    }
    if (sub === "read") {
      return ok(readOf(argv[2] ?? ""));
    }
    if (sub === "tasks") {
      return ok(ROLLUP);
    }

    return ok(JSON.stringify({ kind: "ok", data: {} }));
  });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();
  const ui = await $.ui.mount({
    plugin: "opum-lore",
    surface: "terminal",
    component: "Pane",
    requestId: "lore-pane",
    props: PANE,
  });
  await ui.press({ key: "refresh" });

  // Read with nothing open: the prompt, and no landed-work strip.
  await ui.press({ key: "tab-read" });
  expect(await ui.find({ type: "Text", text: /Pick a document from Browse or Search\./ })).toBeDefined();
  expect(await ui.find({ key: "land" })).toBeUndefined();

  // With a document open the strip is there, which is what makes the assertion above
  // about the empty tab rather than about a strip that never draws here.
  await ui.press({ key: "tab-browse" });
  await ui.press({ key: "open-adr/0001-x" });
  expect(await ui.find({ type: "Markdown", text: /The body of the notes\./ })).toBeDefined();
  expect(await ui.find({ key: "land" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /not committed yet/ })).toBeDefined();
  await ui.unmount();
});

test("every dashboard call refreshes the pane, as every slash-command call did", async ($, on) => {
  // The command this tool replaced ran `void refresh($)` on every accepted invocation, and
  // the tool has to keep that: only the `query` arm refreshes by itself -- through
  // `showTab` -- so a bare call or a `full`-only one would otherwise leave the catalogue as
  // stale as the 30-second timer allows. Counted rather than merely seen: the arm that
  // refreshes on its own must not be refreshed a second time for one ask.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  captureOpens(on);
  /** The catalogue reads since the last reset: `lore query`, on either arm of the pane. */
  const catalogReads = () => seen.filter((argv) => argv[1] === "query").length;
  const fresh = async () => {
    await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
    await clock.settle();
    seen.length = 0;
  };

  await fresh();
  await $.tool.call({ tool: DASHBOARD });
  await clock.settle();
  expect(catalogReads()).toBe(1);

  await fresh();
  await $.tool.call({ tool: DASHBOARD, full: true });
  await clock.settle();
  expect(catalogReads()).toBe(1);

  await fresh();
  await $.tool.call({ tool: DASHBOARD, doc: "adr/0001-x" });
  await clock.settle();
  expect(catalogReads()).toBe(1);

  // The query arm's own refresh IS the call's refresh.
  await fresh();
  await $.tool.call({ tool: DASHBOARD, query: "retention" });
  await clock.settle();
  expect(catalogReads()).toBe(1);
});

// ── The honest result and the band (LCLI-672) ─────────────────────────────────

/**
 * The engine's refusal, verbatim from a live session (Claude Code 2.1.288, LCLI-672 note):
 * a model's open of this pane at 100 columns. Its wording matters here -- it is what the
 * tool's answer carries, and the floor inside it moves with the pane's history (144
 * columns for a pane nobody has opened, 110 once the person has), which is why the module
 * reports the engine's sentence instead of composing one.
 */
const REFUSED =
  "unasked below 144 columns (100 now): placed when the person opens it, or when the terminal is widened to 144 columns";

test("the dashboard tool answers for the pane it found, not the pane it asked for", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  // The engine refuses the open: the call is the model's, and nobody asked for the pane by
  // hand. The kit cannot answer `$.ui.panes` at all, so this is the arm the module keeps for
  // an engine it cannot ask -- and the open's own answer is what decides in it.
  let answer: UiOpenResult = { isPlaced: false, reason: REFUSED };
  const refused = captureOpens(on, () => answer);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();

  const waiting = await $.tool.call({ tool: DASHBOARD, doc: "adr/0001-x" });
  expect(waiting.result).toBe(`The Lore pane is open but not drawn, adr/0001-x on Read: ${REFUSED}`);
  // The answer is the ENGINE'S sentence, not one composed here: the floor inside it is 144
  // columns or 110, depending on whether the person has opened this pane before, so a
  // number written into the module would be wrong exactly where it mattered.
  expect(String(waiting.result)).toContain("144");
  expect(String(waiting.result)).not.toContain("Opened the Lore pane");
  // The work the call asked for still happened: only the DRAWING waits.
  expect(seen).toContainEqual(["lore", "read", "adr/0001-x", "--json"]);
  // The refused open is still an open: it names the pane and its title, and asks for no
  // keyboard (`focus`) and no size -- the same shape every other open here has.
  expect(refused.at(-1)).toEqual({ id: "lore-pane", title: "Lore" });

  // The control: the same call and the same test, with the engine placing the pane. What
  // changes the answer is what the engine answered, not something the module decided.
  answer = { isPlaced: true };
  const shown = await $.tool.call({ tool: DASHBOARD, doc: "adr/0001-x" });
  expect(shown.result).toBe("Opened the Lore pane, adr/0001-x on Read.");
  // The calls above each start a refresh, and one left in flight when the environment goes
  // rejects with nothing to handle it -- a file-level failure rooted in no case at all.
  await clock.settle();
});


test("the band draws the line that offers the pane, and its Button seats what the engine would not", async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  // What the engine answers every open with in this test: refused, because nobody has asked
  // for this pane by hand -- the narrow-terminal case the band exists for. Held rather than
  // fixed, because the press below is the engine changing that answer.
  let answer: UiOpenResult = { isPlaced: false, reason: REFUSED };
  const opens = captureOpens(on, () => answer);
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();
  opens.length = 0;

  const props = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  };
  const band = await $.ui.mount({ plugin: "opum-lore", surface: "terminal", component: "AbovePrompt", props });
  // The line is read by its text and the Button by its key, because that is how a band mount
  // addresses them: the engine keeps an element's `key` for the ones it dispatches to (a
  // Button), and draws a plain Text with the key dropped -- measured on the kit, where
  // `find({ key: "ready" })` answers undefined over a Text that is plainly drawn.
  expect((await band.find({ type: "Text", text: / ready/ }))?.text).toContain("ready");
  const button = await band.find({ key: "open" });
  expect(button?.props.hotkey).toBe("o");
  expect(button?.props.label).toBe("Open");
  // The focus step is pinned as text, not merely described, because the line is the only place
  // the affordance teaches its own keystroke: `o` reaches the Button only once ctrl+x tab has
  // given the band the keys, and a click needs none (opum-doc seq 212, ODOC-OP-2026-10-03-43).
  // Asserting the hint's absence would pass just as well over a band that drew no line at all,
  // so the ready text above is this assertion's control.
  expect((await band.find({ type: "Text", text: /\(ctrl\+x tab, o\)/ }))?.text).toContain("ctrl+x tab, o");

  // The press IS the open, made inside the press -- which is what makes it asked, and so
  // what seats it at a width where the session's own open could not. Measured (LCLI-672): an
  // open deferred out of the press waits undrawn at that same width, so the shape is the
  // feature rather than an implementation detail. No `focus` either: the pane never takes
  // the keyboard from a person who may be typing, and this press is no exception.
  answer = { isPlaced: true };
  await band.press({ key: "open" });
  expect(opens).toEqual([{ id: "lore-pane", title: "Lore" }]);
  await band.unmount();
  await clock.settle();
});

test("the band yields where a survey holds it, and where the pane is drawn", async ($, on) => {
  // A second test because the engine's own band has to stand in for this one, and `on` may
  // only be called before the test first uses `$` -- the kit's own words: `on("ui.render")
  // after the test first called $`. The stand-in matters because a draw the module YIELDS on
  // has nothing beneath it in the kit: the redraw would reject rather than draw an empty
  // band. Every call it takes is one the module yielded -- counted rather than inferred from
  // an absent element, so a Button that failed to draw cannot read as one never drawn.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  mockLore(on, seen);
  mockSession(on);
  let answer: UiOpenResult = { isPlaced: false, reason: REFUSED };
  captureOpens(on, () => answer);
  let stoodIn = 0;
  on("ui.render", { component: "AbovePrompt" }, async ($, e) => {
    stoodIn += 1;
    const { Box, Text } = $.ui.resolve(e);

    return (
      <Box>
        <Text>nothing above the prompt</Text>
      </Box>
    );
  });
  await $.session.start({ cwd: "/repo", surface: "terminal", isInteractive: true });
  await clock.settle();

  const props = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  };
  const band = await $.ui.mount({ plugin: "opum-lore", surface: "terminal", component: "AbovePrompt", props });
  // Waiting: the module draws, and the stand-in is not reached. This is the control for the
  // yield counted below -- an absence there means the survey took the band, not that the
  // band was never drawn at all.
  expect(await band.find({ key: "open" })).toBeDefined();
  expect(stoodIn).toBe(0);

  // A survey holds the band, and every hook on it yields -- this one with them. The pane is
  // the same waiting pane as the read above, so the absence is the survey's doing.
  await band.redraw({ ...props, hasSurvey: true });
  expect(await band.find({ key: "open" })).toBeUndefined();
  expect(await band.find({ type: "Text", text: /nothing above the prompt/ })).toBeDefined();
  expect(stoodIn).toBeGreaterThan(0);

  // Drawn: the pane's last open came back placed, and the band has nothing left to offer.
  // The tool's own call is what moves that -- the engine places this one, where the
  // session's was refused -- and the yield it takes to get there is counted, the same way.
  const beforeDrawn = stoodIn;
  answer = { isPlaced: true };
  await $.tool.call({ tool: DASHBOARD });
  await band.redraw(props);
  expect(await band.find({ key: "open" })).toBeUndefined();
  expect(stoodIn).toBeGreaterThan(beforeDrawn);
  await band.unmount();
  await clock.settle();
});
