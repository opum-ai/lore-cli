/**
 * record-backlog-goldens-guards.test.ts — LORE-106: isolated/unit coverage for the two
 * write-no-golden guards `test/support/record-backlog-goldens.ts` runs before trusting its inputs.
 *
 * `record-backlog-goldens.ts` is dev tooling that shells a real, locally-checked-out upstream
 * Backlog.md CLI (absent in CI and in most dev environments) — so this suite never drives its
 * `main()`/`record()` end to end. Instead it unit-tests the guard functions it exports directly,
 * per the task's own guidance: feed a mismatched commit / malformed specimen and assert a clear,
 * loud abort — the same proof a full regeneration run would give, without needing the upstream
 * binary.
 *
 * Importing the module itself must be side-effect-free (no shelled upstream, no fixtures-dir
 * writes): the module gates its `main()` call behind `import.meta.main`, so a bare `import` here
 * only defines functions.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitRun as run } from "./helpers";
import {
  assertCommitPinned,
  assertTaskViewSpecimenShape,
  readPinnedBacklogCommit,
  resolveGitCommit,
} from "./support/record-backlog-goldens";

/** The real Dockerfile this repo pins `BACKLOG_COMMIT` in — read-only, never written by these tests. */
const REAL_DOCKERFILE = join(import.meta.dir, "..", "docker", "e2e", "Dockerfile");

/** A real, valid `task-view` envelope — the committed golden itself — as the "good" specimen baseline. */
const GOOD_ENVELOPE = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "backlog-json", "task-view.json"), "utf8"),
) as Record<string, unknown>;

function freshRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "lore-golden-guard-"));
  run(root, ["init", "-q"]);
  run(root, ["config", "user.name", "lore test"]);
  run(root, ["config", "user.email", "lore-test@example.com"]);
  return root;
}

function commit(root: string, path: string, contents: string, message: string): void {
  writeFileSync(join(root, path), contents);
  run(root, ["add", "--", path]);
  run(root, ["commit", "-q", "-m", message]);
}

// ── AC#1: commit pin ──────────────────────────────────────────────────────────────

describe("readPinnedBacklogCommit", () => {
  test("extracts the real pinned BACKLOG_COMMIT from docker/e2e/Dockerfile", () => {
    expect(readPinnedBacklogCommit(REAL_DOCKERFILE)).toBe("22a091b570d44c4f302ca47e7fd36fa28ad8bcb0");
  });

  test("throws a clear error when the file has no ARG BACKLOG_COMMIT line", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-dockerfile-"));
    try {
      const path = join(dir, "Dockerfile");
      writeFileSync(path, "FROM oven/bun:1.2.23\nRUN echo hi\n");
      expect(() => readPinnedBacklogCommit(path)).toThrow(/could not find a pinned commit/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when the pinned value isn't a well-formed 40-hex-char sha", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-dockerfile-"));
    try {
      const path = join(dir, "Dockerfile");
      writeFileSync(path, "ARG BACKLOG_COMMIT=not-a-real-sha\n");
      expect(() => readPinnedBacklogCommit(path)).toThrow(/could not find a pinned commit/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveGitCommit", () => {
  test("returns the checked-out HEAD sha of a real git checkout", () => {
    const root = freshRepo();
    try {
      commit(root, "cli.ts", "// stub\n", "first");
      const sha = resolveGitCommit(root);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("throws a clear error when the directory is not a git checkout at all", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-not-a-repo-"));
    try {
      expect(() => resolveGitCommit(dir)).toThrow(/could not resolve the checked-out git commit/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("assertCommitPinned", () => {
  test("does not throw when the checkout matches the pin", () => {
    const sha = "22a091b570d44c4f302ca47e7fd36fa28ad8bcb0";
    expect(() => assertCommitPinned(sha, sha, "/some/path/src/cli.ts")).not.toThrow();
  });

  test("aborts with a clear error naming both shas and the checked path when they mismatch", () => {
    const actual = "1111111111111111111111111111111111111a";
    const pinned = "22a091b570d44c4f302ca47e7fd36fa28ad8bcb0";
    expect(() => assertCommitPinned(actual, pinned, "/repos/Backlog.md-upstream/src/cli.ts")).toThrow(
      /1111111111111111111111111111111111111a.*22a091b570d44c4f302ca47e7fd36fa28ad8bcb0|22a091b570d44c4f302ca47e7fd36fa28ad8bcb0.*1111111111111111111111111111111111111a/s,
    );
    try {
      assertCommitPinned(actual, pinned, "/repos/Backlog.md-upstream/src/cli.ts");
    } catch (err) {
      expect(String(err)).toContain(actual);
      expect(String(err)).toContain(pinned);
      expect(String(err)).toContain("/repos/Backlog.md-upstream/src/cli.ts");
    }
  });
});

// ── AC#2: specimen shape ──────────────────────────────────────────────────────────

describe("assertTaskViewSpecimenShape", () => {
  test("does not throw for the real committed golden specimen", () => {
    expect(() => assertTaskViewSpecimenShape(GOOD_ENVELOPE, "LORE-33")).not.toThrow();
  });

  test("throws when the envelope carries no task object", () => {
    expect(() => assertTaskViewSpecimenShape({ schemaVersion: 1, kind: "task-view" }, "LORE-33")).toThrow(
      /envelope has no `task` object/,
    );
  });

  test("throws when status isn't Done", () => {
    const task = { ...(GOOD_ENVELOPE.task as Record<string, unknown>), status: "In Progress" };
    expect(() => assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33")).toThrow(/status: expected "Done"/);
  });

  test("throws when implementationPlan is missing/empty", () => {
    const task = { ...(GOOD_ENVELOPE.task as Record<string, unknown>), implementationPlan: null };
    expect(() => assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33")).toThrow(
      /implementationPlan: expected a non-empty plan/,
    );
  });

  test("throws when implementationNotes is missing/empty", () => {
    const task = { ...(GOOD_ENVELOPE.task as Record<string, unknown>), implementationNotes: "" };
    expect(() => assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33")).toThrow(
      /implementationNotes: expected non-empty notes/,
    );
  });

  test("throws when acceptanceCriteria isn't exactly two entries", () => {
    const task = { ...(GOOD_ENVELOPE.task as Record<string, unknown>), acceptanceCriteria: [] };
    expect(() => assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33")).toThrow(
      /acceptanceCriteria: expected exactly 2 entries, got 0/,
    );
  });

  test("throws when dependencies is empty", () => {
    const task = { ...(GOOD_ENVELOPE.task as Record<string, unknown>), dependencies: [] };
    expect(() => assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33")).toThrow(
      /dependencies: expected at least one dependency/,
    );
  });

  test("throws when documentation is empty", () => {
    const task = { ...(GOOD_ENVELOPE.task as Record<string, unknown>), documentation: [] };
    expect(() => assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33")).toThrow(
      /documentation: expected at least one documentation link/,
    );
  });

  test("throws when finalSummary is not null", () => {
    const task = { ...(GOOD_ENVELOPE.task as Record<string, unknown>), finalSummary: "done!" };
    expect(() => assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33")).toThrow(
      /finalSummary: expected null, got "done!"/,
    );
  });

  test("collects every mismatch, not just the first", () => {
    const task = {
      ...(GOOD_ENVELOPE.task as Record<string, unknown>),
      status: "To Do",
      finalSummary: "not null",
      dependencies: [],
    };
    try {
      assertTaskViewSpecimenShape({ ...GOOD_ENVELOPE, task }, "LORE-33");
      throw new Error("expected assertTaskViewSpecimenShape to throw");
    } catch (err) {
      const message = String(err);
      expect(message).toContain("status: expected");
      expect(message).toContain("finalSummary: expected");
      expect(message).toContain("dependencies: expected");
    }
  });
});
