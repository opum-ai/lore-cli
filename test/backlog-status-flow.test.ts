/**
 * backlog-status-flow.test.ts — reading the project's ordered status flow from `backlog/config.yml`
 * (LORE-26, backlog-cli-contract.md §3.1).
 *
 * `parseStatusFlow` is exercised directly (pure, no filesystem); `readStatusFlow` is exercised
 * against a real temp directory so the ENOENT-is-default-flow and permission-failure paths are
 * driven end to end.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_STATUS_FLOW, parseStatusFlow, readStatusFlow } from "../src/adapters/backlog";
import { exitCodeFor, LoreError } from "../src/errors";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-status-flow-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(yamlText: string): void {
  mkdirSync(join(root, "backlog"), { recursive: true });
  writeFileSync(join(root, "backlog", "config.yml"), yamlText);
}

describe("parseStatusFlow", () => {
  test("a custom ordered statuses: list is returned verbatim", () => {
    const yamlText = "statuses:\n  - Backlog\n  - Doing\n  - Shipped\n";
    expect(parseStatusFlow(yamlText)).toEqual(["Backlog", "Doing", "Shipped"]);
  });

  test("no statuses: key falls back to the documented default", () => {
    expect(parseStatusFlow("some_other_key: value\n")).toEqual([...DEFAULT_STATUS_FLOW]);
  });

  test("an empty document falls back to the default (a fresh backlog init that has not touched this key)", () => {
    expect(parseStatusFlow("")).toEqual([...DEFAULT_STATUS_FLOW]);
    expect(parseStatusFlow("---\n")).toEqual([...DEFAULT_STATUS_FLOW]);
  });

  test("unparseable YAML is a fail-loud validation error", () => {
    const err = loreError(() => parseStatusFlow("statuses: [unterminated\n"));
    expect(err.type).toBe("validation");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("backlog/config.yml");
  });

  test("a top-level non-mapping document is a fail-loud validation error", () => {
    const err = loreError(() => parseStatusFlow("- just\n- a\n- list\n"));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("mapping");
  });

  test("statuses: present but not a list of strings is a fail-loud validation error", () => {
    expect(() => parseStatusFlow("statuses: not-a-list\n")).toThrow(LoreError);
    expect(() => parseStatusFlow("statuses:\n  - Backlog\n  - 42\n")).toThrow(LoreError);
  });
});

describe("readStatusFlow", () => {
  test("reads a real backlog/config.yml's statuses: list", () => {
    writeConfig("statuses:\n  - To Do\n  - In Progress\n  - Review\n  - Done\n");
    expect(readStatusFlow(root)).toEqual(["To Do", "In Progress", "Review", "Done"]);
  });

  test("a missing backlog/config.yml yields the default flow, not an error", () => {
    expect(readStatusFlow(root)).toEqual([...DEFAULT_STATUS_FLOW]);
  });

  test("an unreadable (permission-denied) config.yml is a denied error", () => {
    if (process.getuid?.() === 0) {
      return; // a 000-mode file is still readable as root — this probe can't be set up
    }
    writeConfig("statuses:\n  - To Do\n  - Done\n");
    const path = join(root, "backlog", "config.yml");
    chmodSync(path, 0o000);
    let unreadable = false;
    try {
      readFileSync(path, "utf8");
    } catch {
      unreadable = true;
    }
    if (!unreadable) {
      chmodSync(path, 0o644); // environment ignores the mode (e.g. permissive FS) — skip
      return;
    }
    try {
      const err = loreError(() => readStatusFlow(root));
      expect(err.type).toBe("denied");
      expect(exitCodeFor(err)).toBe(4);
    } finally {
      chmodSync(path, 0o644); // restore so afterEach's rmSync can clean up
    }
  });
});

/** Run the thunk and return the {@link LoreError} it throws, failing the test if it does not throw. */
function loreError(run: () => unknown): LoreError {
  try {
    run();
  } catch (err) {
    if (err instanceof LoreError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected a LoreError to be thrown, but it returned");
}
