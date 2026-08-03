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
import {
  assertTaskViewSpecimenShape,
  assertVersionPinned,
  readPinnedBacklogVersion,
  resolveBacklogVersion,
} from "./support/record-backlog-goldens";

/** The real Dockerfile this repo pins `BACKLOG_VERSION` in — read-only, never written by these tests. */
const REAL_DOCKERFILE = join(import.meta.dir, "..", "docker", "e2e", "Dockerfile");

/** A real, valid `task-view` envelope — the committed golden itself — as the "good" specimen baseline. */
const GOOD_ENVELOPE = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "backlog-json", "task-view.json"), "utf8"),
) as Record<string, unknown>;

// ── AC#1: version pin ──────────────────────────────────────────────────────────────

describe("readPinnedBacklogVersion", () => {
  test("extracts the real pinned BACKLOG_VERSION from docker/e2e/Dockerfile", () => {
    expect(readPinnedBacklogVersion(REAL_DOCKERFILE)).toBe("1.49.1");
  });

  test("throws a clear error when the file has no ARG BACKLOG_VERSION line", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-dockerfile-"));
    try {
      const path = join(dir, "Dockerfile");
      writeFileSync(path, "FROM oven/bun:1.2.23\nRUN echo hi\n");
      expect(() => readPinnedBacklogVersion(path)).toThrow(/could not find a pinned version/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when the pinned value isn't a well-formed semver", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-dockerfile-"));
    try {
      const path = join(dir, "Dockerfile");
      writeFileSync(path, "ARG BACKLOG_VERSION=not-a-version\n");
      expect(() => readPinnedBacklogVersion(path)).toThrow(/could not find a pinned version/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveBacklogVersion", () => {
  test("returns the version a real binary reports on --version", () => {
    // process.execPath (the running Bun binary) is a real, cross-platform-safe binary that
    // genuinely supports --version -- a hand-written #!/bin/sh stub + chmod, tried first, failed
    // on Windows CI (no shebang, no exec bit). test/backlog-probe.test.ts's "bunBacklogSpawn --
    // the real Bun.spawn seam" suite already dodges this exact trap the same way.
    expect(resolveBacklogVersion(process.execPath)).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("throws a clear error when the binary can't be run", () => {
    const missing = join(tmpdir(), "lore-no-such-binary-ff3a1c");
    expect(() => resolveBacklogVersion(missing)).toThrow(/could not resolve/);
  });
});

describe("assertVersionPinned", () => {
  test("does not throw when the resolved version matches the pin", () => {
    expect(() => assertVersionPinned("1.49.1", "1.49.1", "/usr/local/bin/backlog")).not.toThrow();
  });

  test("aborts with a clear error naming both versions and the checked path when they mismatch", () => {
    const actual = "1.49.0";
    const pinned = "1.49.1";
    expect(() => assertVersionPinned(actual, pinned, "/usr/local/bin/backlog")).toThrow(
      /1\.49\.0.*1\.49\.1|1\.49\.1.*1\.49\.0/s,
    );
    try {
      assertVersionPinned(actual, pinned, "/usr/local/bin/backlog");
    } catch (err) {
      expect(String(err)).toContain(actual);
      expect(String(err)).toContain(pinned);
      expect(String(err)).toContain("/usr/local/bin/backlog");
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
