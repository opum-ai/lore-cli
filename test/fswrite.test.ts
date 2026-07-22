/**
 * fswrite.test.ts — `writeFileAtomic` mode/ownership preservation (LORE-117) and
 * `writeManyAtomicOrRollback`'s cross-file undo (LORE-120).
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
 *
 * The second describe block below covers `writeManyAtomicOrRollback` directly, with an injected
 * `writeAtomic` so a failure on an exact, chosen write in a multi-file list is deterministic rather
 * than depending on a real disk fault landing at the right moment. `test/sync.test.ts` additionally
 * proves the same rollback against a REAL filesystem failure (a read-only directory) through the
 * full `lore sync` write loop.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AtomicRollbackWrite, writeFileAtomic, writeManyAtomicOrRollback } from "../src/commands/fswrite";

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

// ── writeManyAtomicOrRollback: cross-file undo on mid-loop failure (LORE-120) ──────

describe("writeManyAtomicOrRollback — all-or-nothing across a multi-file write (LORE-120)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lore-fswrite-rollback-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("the 2nd of 3 writes failing rolls back the 1st (already applied) and never attempts the 3rd", () => {
    const pathA = join(dir, "a.md");
    const pathB = join(dir, "b.md");
    const pathC = join(dir, "c.md");
    writeFileSync(pathA, "a-before");
    writeFileSync(pathC, "c-before");
    // b.md is a brand-new file (`before: undefined`) -- exercises the "remove on rollback" branch,
    // not just the "restore prior bytes" one, in the same run as the failure below.
    const writes: AtomicRollbackWrite[] = [
      { abs: pathA, relPath: "a.md", before: "a-before", after: "a-after" },
      { abs: pathB, relPath: "b.md", before: undefined, after: "b-after" },
      { abs: pathC, relPath: "c.md", before: "c-before", after: "c-after" },
    ];
    const attempted: string[] = [];
    const boom = new Error("simulated disk failure on the 2nd write");
    const writeAtomic = (absPath: string, contents: string, relPath: string): void => {
      attempted.push(relPath);
      if (relPath === "b.md") {
        throw boom;
      }
      writeFileAtomic(absPath, contents, relPath);
    };

    expect(() => writeManyAtomicOrRollback(writes, writeAtomic)).toThrow(boom);

    // The 1st write DID land (attempted before the failure) but is rolled back to its pre-run
    // bytes -- not left holding the new bytes it was briefly written with.
    expect(readFileSync(pathA, "utf8")).toBe("a-before");
    // The 2nd write never actually wrote anything (the injected failure fires before delegating to
    // the real writeFileAtomic), so there's nothing to roll back for it.
    expect(existsSync(pathB)).toBe(false);
    // The 3rd write is never even attempted -- the loop stops at the first throw. `attempted` also
    // records the rollback's own restore call for a.md (its 2nd appearance), since that goes
    // through the same injected `writeAtomic`.
    expect(existsSync(pathC)).toBe(true);
    expect(readFileSync(pathC, "utf8")).toBe("c-before");
    expect(attempted).toEqual(["a.md", "b.md", "a.md"]);
  });

  test("a freshly created file (no prior existence) is removed on rollback, not left with stale new bytes", () => {
    const pathA = join(dir, "new-a.md");
    const pathB = join(dir, "new-b.md");
    const writes: AtomicRollbackWrite[] = [
      { abs: pathA, relPath: "new-a.md", before: undefined, after: "fresh-a" },
      { abs: pathB, relPath: "new-b.md", before: undefined, after: "fresh-b" },
    ];
    const boom = new Error("simulated failure on the 2nd write");
    const writeAtomic = (absPath: string, contents: string, relPath: string): void => {
      if (relPath === "new-b.md") {
        throw boom;
      }
      writeFileAtomic(absPath, contents, relPath);
    };

    expect(() => writeManyAtomicOrRollback(writes, writeAtomic)).toThrow(boom);
    // new-a.md was created by the 1st write, then removed by rollback -- no file left behind at all.
    expect(existsSync(pathA)).toBe(false);
    expect(existsSync(pathB)).toBe(false);
  });

  test("every write succeeding leaves all the new bytes in place -- no rollback triggered", () => {
    const pathA = join(dir, "a.md");
    writeFileSync(pathA, "before");
    const pathB = join(dir, "b.md");
    const writes: AtomicRollbackWrite[] = [
      { abs: pathA, relPath: "a.md", before: "before", after: "after" },
      { abs: pathB, relPath: "b.md", before: undefined, after: "new" },
    ];
    expect(() => writeManyAtomicOrRollback(writes)).not.toThrow();
    expect(readFileSync(pathA, "utf8")).toBe("after");
    expect(readFileSync(pathB, "utf8")).toBe("new");
  });

  test("a rollback failure (the restore itself throws) is swallowed -- the original error is what's thrown", () => {
    const pathA = join(dir, "a.md");
    writeFileSync(pathA, "a-before");
    const writes: AtomicRollbackWrite[] = [
      { abs: pathA, relPath: "a.md", before: "a-before", after: "a-after" },
      { abs: join(dir, "b.md"), relPath: "b.md", before: undefined, after: "b-after" },
    ];
    const originalFailure = new Error("original write failure");
    let call = 0;
    const writeAtomic = (absPath: string, contents: string, relPath: string): void => {
      call += 1;
      if (call === 1) {
        writeFileAtomic(absPath, contents, relPath); // the real 1st write, applied normally
        return;
      }
      if (call === 2) {
        throw originalFailure; // the 2nd write fails -- triggers rollback of the 1st
      }
      throw new Error("rollback of the 1st write also fails"); // call #3: the undo attempt itself
    };

    expect(() => writeManyAtomicOrRollback(writes, writeAtomic)).toThrow(originalFailure);
  });
});
