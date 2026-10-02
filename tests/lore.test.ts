import { expect, test } from "claude-code/testing";

import {
  bundleIdFor,
  failure,
  groupByType,
  hasSection,
  internalHrefs,
  patchFrontmatter,
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
