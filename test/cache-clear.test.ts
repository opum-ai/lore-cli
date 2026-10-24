import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
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
import { clearCheckoutCache } from "../src/core/ladybug-lifecycle";
import { EXIT_CODES, LoreError } from "../src/errors";
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
    expect(err.message).toContain("not a directory");
    expect(existsSync(file)).toBe(true);
  });

  test("a path that traverses a regular file is not_found (exit 3), with the reason on POSIX", () => {
    const root = tempDir();
    writeFileSync(join(root, "file"), "keep");
    const err = expectLoreError("not_found", () => clearCheckoutCache(join(root, "file", "sub")));
    // POSIX realpath reports ENOTDIR here, so DEC-208 (a1) F1's reason applies; win32 reports ENOENT
    // for the same path, so there the contract is the exit code only.
    if (process.platform !== "win32") expect(err.message).toContain("not a directory");
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
