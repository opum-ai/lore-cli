/**
 * fswrite.test.ts — `writeFileAtomic` mode/ownership preservation (LORE-117),
 * `writeManyAtomicOrRollback`'s cross-file undo (LORE-120), and `writeFileNoFollow`'s
 * crash-mid-write safety (LORE-130).
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
 *
 * The third describe block covers `writeFileNoFollow`'s LORE-130 fix: before it, `--force` overwrote
 * an existing destination in place (`open(..., O_TRUNC)` then a `writeSync` loop), so a process kill
 * or crash partway through left the destination holding neither its old nor its new complete bytes —
 * a truncated, partially-overwritten mix, unrecoverable. The fix routes the overwrite through a
 * sibling temp file plus a single commit `renameSync`, exactly like `writeFileAtomic` already does,
 * so a failure at any point before the rename leaves the destination's original bytes completely
 * untouched, and a failure after it leaves the complete new bytes — never a partial mix. A real
 * SIGKILL mid-write isn't reproducible in a test, so — mirroring this same file's own
 * `writeManyAtomicOrRollback` tests and test/replace.test.ts's LORE-116 commit-phase test — these
 * inject a failure on the temp file's byte-write (the `flag: "w"` `writeFileSync`, letting the
 * exclusive `wx` create through first — LORE-252's Windows-safe two-phase primitive) and
 * assert the destination is unaffected; the pre-existing symlink-refusal tests for `writeFileNoFollow`
 * (LORE-92, test/replace.test.ts) are unmodified and continue to prove that guarantee still holds.
 *
 *   AC#1 — the `--force` overwrite path no longer truncates the destination in place; a failure
 *          mid-write (standing in for a process kill) leaves the destination's original bytes fully
 *          intact, never partially overwritten, and the commit is provably a temp-file + rename, not
 *          a direct write to the destination.
 *
 * The fourth describe block covers `createIfAbsent`'s LORE-230 fix: `existingIsRegularFile` (the
 * helper that classifies a `wx` write's `EEXIST` as "a regular file already exists, benign skip" vs
 * "something non-regular blocks the path, conflict") used to catch EVERY `lstatSync` failure and
 * treat it as the benign skip — including a genuine permission/I-O fault (EACCES/EIO) on an entry the
 * `wx` write just proved exists, not just the documented raced-away `ENOENT` case. The fix narrows the
 * degrade-to-benign-skip path to `ENOENT` only; any other classifying-stat failure now propagates and
 * is surfaced by `createIfAbsent` as a `LoreError` via the shared `ioError`, exactly like the `wx`
 * write's own failures.
 *
 *   AC#1 — a non-ENOENT classifying lstat failure (e.g. EACCES) surfaces a `LoreError`, not a benign skip.
 *   AC#2 — the documented raced-away ENOENT case is unchanged: still a benign skip (`createIfAbsent`
 *          returns `false`).
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
// A namespace import alongside the named one below: `spyOn` needs the module object itself to patch
// `writeFileSync` in place, not the already-bound named export `writeFileNoFollow` calls internally —
// mirrors test/replace.test.ts's identical `fs`-namespace-import comment for the same reason.
import * as fs from "node:fs";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  type AtomicRollbackWrite,
  createIfAbsent,
  writeFileAtomic,
  writeFileNoFollow,
  writeManyAtomicOrRollback,
} from "../src/commands/fswrite";
import { LoreError } from "../src/errors";

// Unix mode bits (0o640/0o600) are a POSIX concept: on Windows `chmodSync` only toggles the
// read-only attribute and `statSync().mode & 0o777` never reflects group/other bits, so these
// preservation assertions cannot hold there. Skip the whole suite on win32 (LORE-252); mode
// preservation is meaningful — and fully covered — only on POSIX.
describe.skipIf(process.platform === "win32")("writeFileAtomic — mode preservation across overwrite (LORE-117)", () => {
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

// ── writeFileNoFollow: crash-mid-write safety on the --force overwrite path (LORE-130) ─────

describe("writeFileNoFollow — the --force overwrite path is crash-safe against a mid-write kill (LORE-130)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lore-fswrite-nofollow-crash-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("AC#1: a failure during the write (standing in for a kill) leaves the destination's ORIGINAL bytes fully intact, not truncated", () => {
    const path = join(dir, "f.md");
    const original = "ORIGINAL COMPLETE CONTENT — must survive a mid-write failure untouched\n";
    writeFileSync(path, original);
    // writeFileNoFollow creates its temp via an exclusive `wx` writeFileSync and writes the bytes in
    // a separate `flag: "w"` writeFileSync (LORE-231 two-phase split; LORE-252 Windows-safe primitive
    // — a numeric-flag openSync spuriously ENOENTs on Bun/Windows). Let the exclusive create through
    // (so the temp file genuinely exists) and inject the "kill" on the byte-write that follows.
    const realWriteFileSync = fs.writeFileSync.bind(fs);
    // biome-ignore lint/suspicious/noExplicitAny: writeFileSync's overload set collapses to `any[]` under mockImplementation's contravariant param check
    const spy = spyOn(fs, "writeFileSync").mockImplementation((...args: any[]) => {
      const opts = args[2];
      const flag = typeof opts === "object" && opts !== null ? opts.flag : opts;
      if (flag === "wx") {
        // biome-ignore lint/suspicious/noExplicitAny: forwarding to the real writeFileSync overload set
        return (realWriteFileSync as any)(...args);
      }
      throw new Error("simulated crash mid-write");
    });
    try {
      expect(() => writeFileNoFollow(path, "NEW CONTENT THAT MUST NEVER PARTIALLY LAND", "f.md")).toThrow();
    } finally {
      spy.mockRestore();
    }
    // Not a byte truncated, not a byte of the new content leaked in -- the destination's inode was
    // never opened for writing at all, so a failure (or a real kill) at this point cannot touch it.
    expect(readFileSync(path, "utf8")).toBe(original);
    // No stray `.lore-nofollow-tmp-*` litter left behind by the failed attempt either.
    expect(readdirSync(dir)).toEqual(["f.md"]);
  });

  test("AC#1: the commit is provably a temp-file + rename, not a direct write to the destination path", () => {
    const path = join(dir, "f.md");
    writeFileSync(path, "old");
    const realRenameSync = fs.renameSync.bind(fs);
    const renameCalls: Array<[string, string]> = [];
    const spy = spyOn(fs, "renameSync").mockImplementation((...args: Parameters<typeof fs.renameSync>) => {
      renameCalls.push([String(args[0]), String(args[1])]);
      // biome-ignore lint/suspicious/noExplicitAny: forwarding to the real renameSync overload set
      return (realRenameSync as any)(...args);
    });
    try {
      writeFileNoFollow(path, "new", "f.md");
    } finally {
      spy.mockRestore();
    }
    // Exactly one commit rename, from a `.lore-nofollow-tmp-*` sibling onto the real destination --
    // never a rename with the destination as its SOURCE (which would mean something else entirely).
    expect(renameCalls).toHaveLength(1);
    const [renameFrom, renameTo] = renameCalls[0] as [string, string];
    expect(basename(renameFrom).startsWith(".lore-nofollow-tmp-")).toBe(true);
    expect(renameTo).toBe(path);
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["f.md"]); // no stray temp file survives a successful commit
  });

  test("AC#1: a failure AFTER a successful commit rename is impossible to observe as a partial destination (the rename is the last step)", () => {
    // Documents the other half of the guarantee: once renameSync itself returns, the destination
    // already holds the complete new bytes -- there is no further step (e.g. no post-rename cleanup)
    // that could fail and leave it in a half-updated state. Verified structurally: closeSync/cleanup
    // only ever run BEFORE the commit rename in the success path, never after.
    const path = join(dir, "f.md");
    writeFileSync(path, "old");
    writeFileNoFollow(path, "new", "f.md");
    expect(readFileSync(path, "utf8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["f.md"]);
  });

  // POSIX-only, same reason as the writeFileAtomic mode-preservation suite above: Windows has no
  // Unix mode bits for statSync to report, so skip this mode assertion on win32 (LORE-252).
  test.skipIf(process.platform === "win32")(
    "mode is preserved across a force overwrite (mirrors writeFileAtomic's LORE-117 discipline -- the switch to temp+rename must not regress it)",
    () => {
      const path = join(dir, "secret.md");
      writeFileSync(path, "old");
      chmodSync(path, 0o600);
      writeFileNoFollow(path, "new", "secret.md");
      expect(readFileSync(path, "utf8")).toBe("new");
      expect(statSync(path).mode & 0o777).toBe(0o600);
    },
  );

  test("a fresh file (no prior destination) still succeeds via plain default-umask behavior", () => {
    const path = join(dir, "new-file.md");
    expect(() => writeFileNoFollow(path, "hello", "new-file.md")).not.toThrow();
    expect(readFileSync(path, "utf8")).toBe("hello");
    expect(readdirSync(dir)).toEqual(["new-file.md"]);
  });

  test("a directory blocking the destination fails loud (conflict/denied) and leaves no stray temp file", () => {
    const path = join(dir, "adir");
    mkdirSync(path);
    let thrown: unknown;
    try {
      writeFileNoFollow(path, "x", "adir");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LoreError);
    expect(["conflict", "denied"]).toContain((thrown as LoreError).type);
    expect(readdirSync(dir)).toEqual(["adir"]); // the temp file is cleaned up, not left as litter
  });
});

// ── createIfAbsent: a non-ENOENT classifying lstat failure must surface, not masquerade as a
// benign "already exists" skip (LORE-230) ──────────────────────────────────────────────────────

describe("createIfAbsent — a non-ENOENT lstat failure while classifying a wx EEXIST surfaces instead of a silent skip (LORE-230)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lore-fswrite-createifabsent-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("AC#1/#3: a non-ENOENT lstat failure (EACCES) while classifying a wx EEXIST surfaces a LoreError, not a benign skip", () => {
    const path = join(dir, "f.md");
    // Simulate the exact sequence createIfAbsent drives: the `wx` write hits EEXIST (something
    // demonstrably exists), then the classifying `lstatSync` fails with a genuine, non-ENOENT
    // permission/I-O error rather than the documented raced-away ENOENT.
    const writeSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw Object.assign(new Error("EEXIST: file already exists, open 'f.md'"), { code: "EEXIST" });
    });
    const lstatSpy = spyOn(fs, "lstatSync").mockImplementation(() => {
      throw Object.assign(new Error("EACCES: permission denied, lstat 'f.md'"), { code: "EACCES" });
    });
    try {
      let thrown: unknown;
      try {
        createIfAbsent(path, "contents", "f.md");
      } catch (err) {
        thrown = err;
      }
      // The error surfaces (never a silent skip) as a classified LoreError, mirroring how every
      // other filesystem failure in this module is reported -- not a raw/uncaught Error and not a
      // return value of `false`.
      expect(thrown).toBeInstanceOf(LoreError);
      expect((thrown as LoreError).type).toBe("denied");
    } finally {
      writeSpy.mockRestore();
      lstatSpy.mockRestore();
    }
  });

  test("AC#2: the documented raced-away case (lstat fails with ENOENT after the wx EEXIST) still degrades to a benign skip, unchanged", () => {
    const path = join(dir, "f.md");
    const writeSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw Object.assign(new Error("EEXIST: file already exists, open 'f.md'"), { code: "EEXIST" });
    });
    const lstatSpy = spyOn(fs, "lstatSync").mockImplementation(() => {
      throw Object.assign(new Error("ENOENT: no such file or directory, lstat 'f.md'"), { code: "ENOENT" });
    });
    try {
      expect(createIfAbsent(path, "contents", "f.md")).toBe(false);
    } finally {
      writeSpy.mockRestore();
      lstatSpy.mockRestore();
    }
  });

  test("the common case is unaffected: a real pre-existing regular file is still reported as a benign skip, left untouched", () => {
    const path = join(dir, "f.md");
    writeFileSync(path, "original");
    expect(createIfAbsent(path, "new contents", "f.md")).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("original");
  });

  test("a non-regular entry (a directory) at the path is still reported as a structural conflict, not swallowed by this fix", () => {
    const path = join(dir, "adir");
    mkdirSync(path);
    let thrown: unknown;
    try {
      createIfAbsent(path, "contents", "adir");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("conflict");
  });
});
