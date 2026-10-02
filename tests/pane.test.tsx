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

function mockLore(on: On, seen: string[][], validateFails = false, body = "The body of the notes.") {
  on("fs.read", async () => ({ value: READ_RAW }));
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
  mockLore(on, seen);

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
    expect(await ui.find({ type: "Markdown", text: /The body of the notes\./ })).toBeDefined();

    await ui.press({ key: "view-raw" });
    expect(await ui.find({ type: "Code" })).toBeDefined();

    await ui.press({ key: "tab-browse" });
    await ui.press({ key: "open-reference/notes" });
    await ui.press({ key: "back" });
    const reads = seen.filter((argv) => argv[1] === "read").map((argv) => argv[2]);
    expect(reads[reads.length - 1]).toBe("adr/0001-x");
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
  expect(seen).toContainEqual(["lore", "query", "--json", "retention"]);
  await ui.press({ key: "across" });
  expect(seen.some((argv) => argv.includes("--across-refs") && argv.includes("--allow-partial"))).toBe(true);
  await ui.unmount();
});

test("the fields form saves through lore validate, and a failed validation restores the file", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: string[] = [];
  mockLore(on, seen);
  on("fs.write", async (_$, e) => {
    writes.push(typeof e.text === "string" ? e.text : "");
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
  expect(writes.some((text) => text.includes('title: "Renamed notes"'))).toBe(true);
  expect(seen.some((argv) => argv[1] === "validate")).toBe(true);
  expect(await ui.find({ type: "Text", text: /Saved and validated\./ })).toBeDefined();
  await ui.unmount();
});

test("a validation failure keeps the previous file and shows lore's message", async ($, on) => {
  mock.clock(on, { now: Date.UTC(2026, 9, 2, 12) });
  mock.store(on);
  const seen: string[][] = [];
  const writes: string[] = [];
  mockLore(on, seen, true);
  on("fs.write", async (_$, e) => {
    writes.push(typeof e.text === "string" ? e.text : "");
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
  expect(writes.some((text) => text.includes('title: "Bad edit"'))).toBe(true);
  expect(writes[writes.length - 1]).toBe(READ_RAW);
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
