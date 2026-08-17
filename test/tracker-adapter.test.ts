import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfiguredTrackerAdapter, createTrackerAdapter } from "../src/adapters/tracker";
import { LoreError } from "../src/errors";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-tracker-adapter-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createTrackerAdapter", () => {
  test("defaults to a root-bound Backlog adapter whose statusFlow reads that project", async () => {
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses:\n  - Planned\n  - Building\n  - Shipped\n");

    const adapter = createTrackerAdapter(root, { backend: "backlog" });

    expect(await adapter.statusFlow()).toEqual(["Planned", "Building", "Shipped"]);
  });

  test("fails loud instead of making an unknown backend reachable", () => {
    expect(() => createTrackerAdapter(root, { backend: "bogus" } as never)).toThrow(LoreError);
    expect(() => createTrackerAdapter(root, { backend: "bogus" } as never)).toThrow("unsupported tracker backend");
  });
});

describe("createConfiguredTrackerAdapter", () => {
  test("routes the zero-config default to the root-bound Backlog adapter", async () => {
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses:\n  - Ready\n  - Done\n");

    expect(await createConfiguredTrackerAdapter(root).statusFlow()).toEqual(["Ready", "Done"]);
  });

  test("routes a configured Jira backend through its non-secret jira-cli settings", async () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore", "config.toml"),
      [
        "[tracker]",
        'backend = "jira"',
        "",
        "[tracker.jira]",
        'project = "JT"',
        'issue_type = "Task"',
        'status_flow = ["To Do", "In Progress", "Done"]',
      ].join("\n"),
    );

    const adapter = createConfiguredTrackerAdapter(root, {
      jira: { spawn: async () => Promise.reject(new Error("statusFlow must not spawn jira")) },
    });
    expect(await adapter.statusFlow()).toEqual(["To Do", "In Progress", "Done"]);
  });
});
