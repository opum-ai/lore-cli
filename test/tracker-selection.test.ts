import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoreError } from "../src/errors";
import { resolveTrackerSelection } from "../src/tracker-selection";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-tracker-selection-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(toml: string): void {
  mkdirSync(join(root, ".lore"), { recursive: true });
  writeFileSync(join(root, ".lore", "config.toml"), toml);
}

describe("resolveTrackerSelection", () => {
  test("defaults a missing config in a new empty repository to Quest", () => {
    expect(resolveTrackerSelection(root)).toEqual({ backend: "quest", source: "default" });
  });

  test("defaults an omitted tracker in unrelated configuration to Quest", () => {
    writeConfig("[validate]\nexternal_links = true\n");

    expect(resolveTrackerSelection(root)).toEqual({ backend: "quest", source: "default" });
  });

  test("keeps a legacy Backlog repository on Backlog when tracker is omitted", () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses:\n  - To Do\n");

    expect(resolveTrackerSelection(root)).toEqual({ backend: "backlog", source: "legacy-backlog" });
  });

  test.each([
    ["quest", '[tracker]\nbackend = "quest"\n'],
    ["backlog", 'tracker.backend = "backlog"\n'],
    ["jira", '[tracker]\nbackend = "jira"\n[tracker.jira]\nproject = "JT"\n'],
    ["none", '[tracker]\nbackend = "none"\n'],
  ] as const)("honors an explicit %s selection over legacy artifacts", (backend, toml) => {
    mkdirSync(join(root, "backlog"));
    writeConfig(toml);

    expect(resolveTrackerSelection(root)).toEqual({ backend, source: "explicit" });
  });

  test("propagates loadConfig validation failures before attempting compatibility selection", () => {
    mkdirSync(join(root, "backlog"));
    writeConfig('[tracker]\nbackend = "not-a-backend"\n');

    expect(() => resolveTrackerSelection(root)).toThrow(LoreError);
    expect(() => resolveTrackerSelection(root)).toThrow('tracker.backend must be one of "quest", "backlog", "jira"');
  });

  test("does not mistake nested future dotted keys for a root tracker selection", () => {
    mkdirSync(join(root, "backlog"));
    writeConfig('[future]\ntracker.backend = "quest"\n[tracker.jira]\nbackend = "jira"\n');

    expect(resolveTrackerSelection(root)).toEqual({ backend: "backlog", source: "legacy-backlog" });
  });
});
