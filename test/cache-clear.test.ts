import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearCheckoutCache } from "../src/core/ladybug-lifecycle";
import { LoreError } from "../src/errors";

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
});
