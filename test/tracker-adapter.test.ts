import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTrackerAdapter } from "../src/adapters/tracker";
import { LoreError } from "../src/errors";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-tracker-adapter-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createTrackerAdapter", () => {
  test("defaults to a root-bound Backlog adapter whose statusFlow reads that project", () => {
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses:\n  - Planned\n  - Building\n  - Shipped\n");

    const adapter = createTrackerAdapter(root, {});

    expect(adapter.statusFlow()).toEqual(["Planned", "Building", "Shipped"]);
  });

  test("fails loud instead of making an unimplemented backend reachable", () => {
    expect(() => createTrackerAdapter(root, { backend: "jira" } as never)).toThrow(LoreError);
    expect(() => createTrackerAdapter(root, { backend: "jira" } as never)).toThrow("unsupported tracker backend");
  });
});
