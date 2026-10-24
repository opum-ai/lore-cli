import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { type ClearCheckoutCacheFs, clearCheckoutCache } from "../src/core/ladybug-lifecycle";
import { EXIT_CODES, exitCodeFor, LoreError } from "../src/errors";
import { capture } from "./helpers";

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    thaw(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});

function thaw(path: string): void {
  try {
    chmodSync(path, 0o700);
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) thaw(join(path, entry.name));
    }
  } catch {
    // best-effort test cleanup
  }
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lore-cache-clear-"));
  scratch.push(dir);
  return dir;
}

/** A populated cache shaped like the lifecycle's own: a 0555 generation holding 0400/0444 files. */
function populatedCheckout(): { checkout: string; generation: string } {
  const checkout = tempDir();
  const generation = join(checkout, ".lore", "cache", "graph", "ladybug", "1", "generations", "a".repeat(64));
  mkdirSync(generation, { recursive: true });
  writeFileSync(join(generation, "index.json"), "{}");
  writeFileSync(join(generation, "projection.lbdb"), "db");
  chmodSync(join(generation, "index.json"), 0o400);
  chmodSync(join(generation, "projection.lbdb"), 0o444);
  chmodSync(generation, 0o555);
  mkdirSync(join(checkout, ".lore", "cache", "playwright-results"), { recursive: true });
  writeFileSync(join(checkout, ".lore", "profile.toml"), "keep");
  return { checkout, generation };
}

describe("clearCheckoutCache (LCLI-740)", () => {
  test("removes a populated cache including the 0555 generation, and nothing else", () => {
    const { checkout, generation } = populatedCheckout();
    expect(statSync(generation).mode & 0o222).toBe(0); // positive control: really sealed
    const result = clearCheckoutCache(checkout);
    expect(result.action).toBe("cleared");
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(false);
    expect(existsSync(join(checkout, ".lore", "profile.toml"))).toBe(true);
  });

  test("works on a directory with no .git, and when handed the .lore/cache path itself", () => {
    const { checkout } = populatedCheckout();
    expect(existsSync(join(checkout, ".git"))).toBe(false);
    expect(clearCheckoutCache(join(checkout, ".lore", "cache")).action).toBe("cleared");
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(false);
  });

  test("is idempotent: an absent cache reports absent and creates nothing", () => {
    const checkout = tempDir();
    expect(clearCheckoutCache(checkout).action).toBe("absent");
    expect(existsSync(join(checkout, ".lore"))).toBe(false);
  });

  test("refuses a symlinked .lore/cache and leaves its target untouched", () => {
    const checkout = tempDir();
    const outside = tempDir();
    writeFileSync(join(outside, "precious.txt"), "keep");
    mkdirSync(join(checkout, ".lore"));
    symlinkSync(outside, join(checkout, ".lore", "cache"));
    expect(() => clearCheckoutCache(checkout)).toThrow(LoreError);
    expect(existsSync(join(outside, "precious.txt"))).toBe(true);
  });

  test("refuses a symlinked .lore directory and leaves its target untouched", () => {
    const checkout = tempDir();
    const outside = tempDir();
    mkdirSync(join(outside, "cache"));
    writeFileSync(join(outside, "cache", "precious.txt"), "keep");
    symlinkSync(outside, join(checkout, ".lore"));
    expect(() => clearCheckoutCache(checkout)).toThrow(LoreError);
    expect(existsSync(join(outside, "cache", "precious.txt"))).toBe(true);
  });

  test("a path outside .lore/cache removes nothing: a sibling directory is never touched", () => {
    const { checkout } = populatedCheckout();
    mkdirSync(join(checkout, "docs"));
    writeFileSync(join(checkout, "docs", "page.md"), "keep");
    expect(clearCheckoutCache(join(checkout, "docs")).action).toBe("absent");
    expect(existsSync(join(checkout, "docs", "page.md"))).toBe(true);
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true);
  });

  test("refuses a .lore/cache that is a regular file", () => {
    const checkout = tempDir();
    mkdirSync(join(checkout, ".lore"));
    writeFileSync(join(checkout, ".lore", "cache"), "x");
    expect(() => clearCheckoutCache(checkout)).toThrow(LoreError);
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true);
  });

  test("a symlink INSIDE the cache pointing outside is unlinked: the target survives with its mode unchanged", () => {
    const { checkout } = populatedCheckout();
    const outside = tempDir();
    const sealed = join(outside, "sealed");
    mkdirSync(sealed);
    writeFileSync(join(sealed, "precious.txt"), "keep");
    chmodSync(sealed, 0o555);
    symlinkSync(outside, join(checkout, ".lore", "cache", "graph", "link"));
    const before = statSync(sealed).mode;
    expect(clearCheckoutCache(checkout).action).toBe("cleared");
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(false);
    expect(existsSync(join(sealed, "precious.txt"))).toBe(true);
    expect(statSync(sealed).mode).toBe(before);
    expect(statSync(outside).mode & 0o777).not.toBe(0); // the outside directory itself is intact
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "a permission failure is `denied` (exit 4), not an uncaught crash",
    () => {
      const { checkout } = populatedCheckout();
      const lore = join(checkout, ".lore");
      chmodSync(lore, 0o555); // .lore not writable: the cache directory cannot be unlinked
      try {
        const err = expectDenied(() => clearCheckoutCache(checkout));
        expect(err.message).toContain("cannot clear");
      } finally {
        chmodSync(lore, 0o700);
      }
    },
  );
});

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "an lstat permission failure on .lore is `denied` (exit 4), not an uncaught crash",
  () => {
    const { checkout } = populatedCheckout();
    chmodSync(checkout, 0o600); // no search bit: lstat("<checkout>/.lore") fails with EACCES
    try {
      const err = expectDenied(() => clearCheckoutCache(checkout));
      expect(err.message).toContain("cannot clear");
    } finally {
      chmodSync(checkout, 0o700);
    }
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true); // nothing was removed
  },
);

describe("clearCheckoutCache path classes (DEC-208 (a1))", () => {
  test("a regular file is not_found (exit 3) naming 'not a directory', and is not touched", () => {
    const root = tempDir();
    const file = join(root, "README.md");
    writeFileSync(file, "keep");
    const err = expectLoreError("not_found", () => clearCheckoutCache(file));
    expect(err.message).toContain("has no .lore/cache to clear"); // a phrase only notADirectory writes
    expect(existsSync(file)).toBe(true);
  });

  test("a path that traverses a regular file is not_found (exit 3), with the reason on POSIX", () => {
    const root = tempDir();
    writeFileSync(join(root, "file"), "keep");
    const err = expectLoreError("not_found", () => clearCheckoutCache(join(root, "file", "sub")));
    // POSIX realpath reports ENOTDIR here, so DEC-208 (a1) F1's reason applies; win32 reports ENOENT
    // for the same path, so there the contract is the exit code only.
    if (process.platform !== "win32") expect(err.message).toContain("has no .lore/cache to clear");
  });

  test("a missing path stays not_found, and a directory with no cache stays absent naming the path it looked at", () => {
    const root = tempDir();
    expectLoreError("not_found", () => clearCheckoutCache(join(root, "nope")));
    const result = clearCheckoutCache(root);
    expect(result.action).toBe("absent");
    expect(result.path).toBe(join(realpathSync(root), ".lore", "cache"));
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "EACCES from realpath on an ancestor is denied (exit 4), not not_found and not exit 1",
    () => {
      const root = tempDir();
      mkdirSync(join(root, "locked", "checkout"), { recursive: true });
      chmodSync(join(root, "locked"), 0o000);
      try {
        const err = expectDenied(() => clearCheckoutCache(join(root, "locked", "checkout")));
        expect(err.message).toContain("cannot clear");
      } finally {
        chmodSync(join(root, "locked"), 0o700);
      }
    },
  );

  test("every outcome through run() stays in [0,2,3,4]: a regular file exits 3", async () => {
    const root = tempDir();
    writeFileSync(join(root, "README.md"), "keep");
    const code = await run(["bun", "lore", "cache", "clear", "README.md", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_CODES.not_found);
  });
});

function expectLoreError(type: LoreError["type"], fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe(type);
    return err as LoreError;
  }
  throw new Error(`expected a ${type} LoreError`);
}

/** An errno whose message does NOT lead with its code, so only the command's own naming can supply it. */
function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error("injected failure"), { code });
}

function throwing(code: string): () => never {
  return () => {
    throw errno(code);
  };
}

/** The first `times` calls throw `code`; later calls run `real`. Counts every call. */
function failingFirst<A extends unknown[], R>(
  code: string,
  times: number,
  real: (...args: A) => R,
): ((...args: A) => R) & { calls: number } {
  const wrapped = ((...args: A): R => {
    wrapped.calls++;
    if (wrapped.calls <= times) throw errno(code);
    return real(...args);
  }) as ((...args: A) => R) & { calls: number };
  wrapped.calls = 0;
  return wrapped;
}

/** Throws `code` on every call, counting the calls. */
function alwaysThrowing(code: string): (() => never) & { calls: number } {
  const wrapped = (() => {
    wrapped.calls++;
    throw errno(code);
  }) as (() => never) & { calls: number };
  wrapped.calls = 0;
  return wrapped;
}

describe("clearCheckoutCache errno phases (DEC-208 (a2)): nothing reaches exit 1", () => {
  test("RESOLUTION: an unclassified errno from realpath is not_found (exit 3) naming the errno", () => {
    const { checkout } = populatedCheckout();
    for (const code of ["EIO", "ELOOP", "ENAMETOOLONG"]) {
      const err = expectLoreError("not_found", () => clearCheckoutCache(checkout, { realpath: throwing(code) }));
      expect(err.message).toContain(code);
      expect(exitCodeFor(err)).toBe(EXIT_CODES.not_found);
    }
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true);
  });

  test("RESOLUTION: ENOENT from stat after realpath (a race) is not_found naming ENOENT", () => {
    const { checkout } = populatedCheckout();
    const err = expectLoreError("not_found", () => clearCheckoutCache(checkout, { stat: throwing("ENOENT") }));
    expect(err.message).toContain("ENOENT");
  });

  test("RESOLUTION: an unclassified errno from lstat is not_found naming the errno, and removes nothing", () => {
    const { checkout } = populatedCheckout();
    const err = expectLoreError("not_found", () => clearCheckoutCache(checkout, { lstat: throwing("EIO") }));
    expect(err.message).toContain("EIO");
    expect(exitCodeFor(err)).toBe(EXIT_CODES.not_found);
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true);
  });

  test("RESOLUTION, other way: EACCES, EPERM and EBUSY in the same phase are denied (exit 4), errno named", () => {
    const { checkout } = populatedCheckout();
    const cases: [string, ClearCheckoutCacheFs][] = [
      ["EACCES", { realpath: throwing("EACCES") }],
      ["EPERM", { stat: throwing("EPERM") }],
      ["EBUSY", { lstat: throwing("EBUSY") }],
    ];
    for (const [code, hooks] of cases) {
      const err = expectDenied(() => clearCheckoutCache(checkout, hooks));
      expect(err.message).toContain(code);
      expect(exitCodeFor(err)).toBe(EXIT_CODES.denied);
    }
  });

  test("RESOLUTION: EROFS cannot arise from realpath, stat or lstat (all read-only), so it is not special-cased", () => {
    const { checkout } = populatedCheckout();
    // Were it special-cased it would be denied; it is an unclassified errno here, so not_found.
    const err = expectLoreError("not_found", () => clearCheckoutCache(checkout, { lstat: throwing("EROFS") }));
    expect(err.message).toContain("EROFS");
  });

  test("POSTCONDITION check: an errno from the post-walk lstat is denied (exit 4), named, and the cache is still present", () => {
    const { checkout } = populatedCheckout();
    // lstat calls: 1 and 2 are the resolution loop (.lore, cache), 3 is inside removeContained, 4 is
    // the post-walk existence check. Only call 4 fails, and rm is a no-op so the cache stays present.
    let calls = 0;
    const lstat = (path: string) => {
      calls++;
      if (calls === 4) throw errno("EIO");
      return lstatSync(path);
    };
    const err = expectDenied(() => clearCheckoutCache(checkout, { lstat, rm: () => {} }));
    expect(err.message).toContain("EIO");
    expect(exitCodeFor(err)).toBe(EXIT_CODES.denied);
    expect(calls).toBe(4);
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true);
  });

  test("REMOVAL, chmod: ENOENT mid-thaw is re-walked, the cache is really gone, and only then is it cleared", () => {
    const { checkout } = populatedCheckout();
    const chmod = failingFirst("ENOENT", 1, chmodSync);
    const result = clearCheckoutCache(checkout, { chmod });
    expect(result.action).toBe("cleared");
    expect(chmod.calls).toBeGreaterThan(1);
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(false); // "cleared" means gone, not "returned"
  });

  test("REMOVAL, readdir: ENOENT mid-thaw is re-walked and the cache is really gone", () => {
    const { checkout } = populatedCheckout();
    const readdir = failingFirst("ENOENT", 1, (path: string) => readdirSync(path, { withFileTypes: true }));
    expect(clearCheckoutCache(checkout, { readdir }).action).toBe("cleared");
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(false);
  });

  test("REMOVAL, rm: ENOENT is re-walked and the cache is really gone", () => {
    const { checkout } = populatedCheckout();
    const rm = failingFirst("ENOENT", 1, rmSync);
    expect(clearCheckoutCache(checkout, { rm }).action).toBe("cleared");
    expect(rm.calls).toBe(2);
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(false);
  });

  test("POSTCONDITION, survives every walk: a cache that never goes away exits 4 naming ENOENT and the writer", () => {
    const { checkout } = populatedCheckout();
    const chmod = alwaysThrowing("ENOENT"); // every walk returns quietly inside removeContained
    const err = expectDenied(() => clearCheckoutCache(checkout, { chmod }));
    expect(err.message).toContain("ENOENT");
    expect(err.message).toContain("still being written");
    expect(exitCodeFor(err)).toBe(EXIT_CODES.denied);
    expect(chmod.calls).toBe(1 + 3); // the first walk plus the named 3 re-walks
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true);
  });

  test("POSTCONDITION, gone on re-walk 2: a cache that disappears on the second walk exits 0 cleared", () => {
    const { checkout } = populatedCheckout();
    const chmod = failingFirst("ENOENT", 1, chmodSync); // walk 1 quietly stops early, walk 2 is real
    const result = clearCheckoutCache(checkout, { chmod });
    expect(result.action).toBe("cleared");
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(false);
  });

  test("POSTCONDITION: the bound is exactly 3 re-walks (4 walks): goes on the last one, one more failure is denied", () => {
    const { checkout } = populatedCheckout();
    const lastChance = failingFirst("ENOENT", 3, chmodSync); // walks 1-3 stop early; walk 4 (re-walk 3) is real
    expect(clearCheckoutCache(checkout, { chmod: lastChance }).action).toBe("cleared");
    const again = populatedCheckout();
    const tooMany = failingFirst("ENOENT", 4, chmodSync); // walk 4 stops early too: one re-walk too many
    expectDenied(() => clearCheckoutCache(again.checkout, { chmod: tooMany }));
  });

  test("REMOVAL: ENOENT from rm that never stops exits 4 naming ENOENT and the writer, after the bound", () => {
    const { checkout } = populatedCheckout();
    const rm = alwaysThrowing("ENOENT");
    const err = expectDenied(() => clearCheckoutCache(checkout, { rm }));
    expect(err.message).toContain("ENOENT");
    expect(err.message).toContain("still being written");
    expect(rm.calls).toBe(1 + 3);
  });

  test("REMOVAL: any other errno at chmod, readdir or rm is denied (exit 4) naming it, with no retry", () => {
    const cases: [string, (code: string) => ClearCheckoutCacheFs][] = [
      ["chmod", (code) => ({ chmod: throwing(code) })],
      ["readdir", (code) => ({ readdir: throwing(code) })],
      ["rm", (code) => ({ rm: throwing(code) })],
    ];
    for (const [call, hooksFor] of cases) {
      for (const code of ["ENOTEMPTY", "EIO", "EEXIST"]) {
        const { checkout } = populatedCheckout();
        const hooks = hooksFor(code);
        const counted = alwaysThrowing(code);
        const err = expectDenied(() => clearCheckoutCache(checkout, { ...hooks, [call]: counted }));
        expect(err.message).toContain(code);
        expect(exitCodeFor(err)).toBe(EXIT_CODES.denied);
        expect(counted.calls).toBe(1);
      }
    }
  });

  test("REMOVAL: rm is called with force:false, so a vanished target is an error to handle, not silently absorbed", () => {
    const { checkout } = populatedCheckout();
    let seen: { recursive: boolean; force: boolean } | undefined;
    clearCheckoutCache(checkout, {
      rm: (path, options) => {
        seen = options;
        rmSync(path, options);
      },
    });
    expect(seen).toEqual({ recursive: true, force: false });
  });

  test("an error with no errno code is still denied in removal and not_found in resolution, never uncaught", () => {
    const { checkout } = populatedCheckout();
    const bare = () => {
      throw new Error("no code");
    };
    expect(exitCodeFor(expectDenied(() => clearCheckoutCache(checkout, { rm: bare })))).toBe(EXIT_CODES.denied);
    expect(exitCodeFor(expectLoreError("not_found", () => clearCheckoutCache(checkout, { realpath: bare })))).toBe(
      EXIT_CODES.not_found,
    );
  });
});

describe("a stray non-directory .lore (DEC-208 (a3) Q2)", () => {
  test("a regular file at <path>/.lore is exit 0 absent, the reason names it, and the file is untouched", () => {
    const checkout = tempDir();
    writeFileSync(join(checkout, ".lore"), "stray");
    const result = clearCheckoutCache(checkout);
    expect(result.action).toBe("absent");
    expect(result.reason).toContain(join(realpathSync(checkout), ".lore"));
    expect(result.reason).toContain("is not a directory");
    expect(existsSync(join(checkout, ".lore"))).toBe(true);
  });

  test("through run() it exits 0 and the output names <path>/.lore as not a directory", async () => {
    const checkout = tempDir();
    writeFileSync(join(checkout, ".lore"), "stray");
    const stdout = capture();
    const code = await run(["bun", "lore", "cache", "clear", checkout, "--json"], {
      cwd: tempDir(),
      stdout,
      stderr: capture(),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text()) as { data: { action: string; reason: string } };
    expect(envelope.data.action).toBe("absent");
    expect(envelope.data.reason).toContain("is not a directory");
  });

  test("other way: a SYMLINKED .lore is still refused (exit 4), because it is a refusal, not an absence", () => {
    const checkout = tempDir();
    const outside = tempDir();
    symlinkSync(outside, join(checkout, ".lore"));
    expectDenied(() => clearCheckoutCache(checkout));
  });

  test("other way: a .lore/cache that is a regular file under a real .lore is still refused", () => {
    const checkout = tempDir();
    mkdirSync(join(checkout, ".lore"));
    writeFileSync(join(checkout, ".lore", "cache"), "x");
    expectDenied(() => clearCheckoutCache(checkout));
  });
});

function expectDenied(fn: () => unknown): LoreError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("denied");
    return err as LoreError;
  }
  throw new Error("expected clearCheckoutCache to throw denied");
}

describe("lore cache clear (end to end through run)", () => {
  test("a relative path resolves against the injected root, never the process cwd", async () => {
    const root = tempDir();
    const { checkout } = populatedCheckout();
    const projectCache = join(process.cwd(), ".lore", "cache");
    const cwdCacheBefore = existsSync(projectCache);
    mkdirSync(join(root, "wt"));
    mkdirSync(join(root, "wt", ".lore", "cache"), { recursive: true });
    writeFileSync(join(root, "wt", ".lore", "cache", "x"), "x");
    const stdout = capture();
    const code = await run(["bun", "lore", "cache", "clear", "wt", "--json"], {
      cwd: root,
      stdout,
      stderr: capture(),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: { action: string } };
    expect(envelope.kind).toBe("cache.result");
    expect(envelope.data.action).toBe("cleared");
    expect(existsSync(join(root, "wt", ".lore", "cache"))).toBe(false);
    expect(existsSync(join(checkout, ".lore", "cache"))).toBe(true); // an unrelated checkout is untouched
    expect(existsSync(projectCache)).toBe(cwdCacheBefore); // the runner's own cache is untouched
  });

  test("a missing path exits 3, and the wrong verb exits 2", async () => {
    const root = tempDir();
    const missing = await run(["bun", "lore", "cache", "clear", "nope", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(missing).toBe(EXIT_CODES.not_found);
    const usage = await run(["bun", "lore", "cache", "wipe", "wt", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(usage).toBe(EXIT_CODES.usage);
  });

  test("a symlinked .lore/cache exits 4 through the CLI", async () => {
    const root = tempDir();
    const outside = tempDir();
    mkdirSync(join(root, ".lore"));
    symlinkSync(outside, join(root, ".lore", "cache"));
    const code = await run(["bun", "lore", "cache", "clear", root, "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_CODES.denied);
  });
});
