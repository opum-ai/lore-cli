/**
 * fswrite.test.ts — `writeFileAtomic` mode/ownership preservation (LORE-117).
 *
 * `writeFileAtomic` (see fswrite.ts) is the write discipline `lore sync` and `lore replace` use to
 * overwrite existing docs without risking a partial write. Before this fix, its temp file was
 * always created with the process's default umask and never inherited the destination's existing
 * mode, so any non-default permission on a doc (group-writable, or locked down to `0600`) was
 * silently replaced by whatever the umask produced on every single overwrite.
 *
 *   AC#1 — an existing destination's mode bits survive an overwrite unchanged.
 *   AC#2 — a first write (no prior destination) still succeeds via plain default-umask behavior,
 *          without erroring just because there was nothing to preserve.
 *
 * The broader writeFileAtomic behavior this fix must not regress (creates a new file; overwrites
 * leaving no stray temp file; a conflicting directory fails loud with cleanup; a pre-temp-file
 * write failure never misreports "temp file may remain") is already covered by the `writeFileAtomic`
 * describe block in test/replace.test.ts (LORE-26) — this file adds only the LORE-117 coverage,
 * rather than duplicating that suite.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "../src/commands/fswrite";

describe("writeFileAtomic — mode preservation across overwrite (LORE-117)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lore-fswrite-mode-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("AC#1: a group-writable 0o640 mode survives an overwrite", () => {
    const path = join(dir, "f.md");
    writeFileSync(path, "old");
    chmodSync(path, 0o640);
    writeFileAtomic(path, "new", "f.md");
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(statSync(path).mode & 0o777).toBe(0o640);
    // Still atomic: no stray `.lore-sync-tmp-*` sibling left behind by the preservation logic.
    expect(readdirSync(dir)).toEqual(["f.md"]);
  });

  test("AC#1: a restrictive 0o600 mode survives an overwrite too", () => {
    const path = join(dir, "secret.md");
    writeFileSync(path, "old");
    chmodSync(path, 0o600);
    writeFileAtomic(path, "new", "secret.md");
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test("AC#1: mode is preserved across repeated overwrites, not just the first", () => {
    const path = join(dir, "f.md");
    writeFileSync(path, "v1");
    chmodSync(path, 0o640);
    writeFileAtomic(path, "v2", "f.md");
    expect(statSync(path).mode & 0o777).toBe(0o640);
    writeFileAtomic(path, "v3", "f.md");
    expect(readFileSync(path, "utf8")).toBe("v3");
    expect(statSync(path).mode & 0o777).toBe(0o640);
  });

  test("AC#2: a first write (no prior destination) succeeds without erroring", () => {
    const path = join(dir, "new-file.md");
    expect(() => writeFileAtomic(path, "hello", "new-file.md")).not.toThrow();
    expect(readFileSync(path, "utf8")).toBe("hello");
    // No prior file existed, so there was nothing to preserve -- the destination lands as a
    // plain regular file via default-umask behavior, exactly as writeFileAtomic behaved before
    // this fix. (The exact mode value depends on the environment's umask, so this only asserts
    // the write landed cleanly, not a specific mode.)
    expect(statSync(path).isFile()).toBe(true);
  });

  test("AC#2: a first write into a fresh directory still leaves no stray temp file", () => {
    const path = join(dir, "another-new-file.md");
    writeFileAtomic(path, "hello", "another-new-file.md");
    expect(readdirSync(dir)).toEqual(["another-new-file.md"]);
  });
});
