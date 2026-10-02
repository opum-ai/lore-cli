import { expect, test } from "claude-code/testing";

import { bundleIdFor, groupByType, hasSection, internalHrefs, patchFrontmatter, repoPathFor } from "../hooks/lore";

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
  expect(repoPathFor("docs/already.md")).toBe("docs/already.md");
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
