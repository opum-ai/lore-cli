import { describe, expect, test } from "bun:test";
import { NAME, VERSION } from "../src/meta";

// Smoke test: proves the Bun test harness is wired up and runnable, and that
// coverage has real source to instrument. Real unit tests for the deterministic
// core/ library arrive with M1 (LORE-15 onward).
describe("toolchain", () => {
  test("bun test harness runs", () => {
    expect(1 + 1).toBe(2);
  });

  test("package metadata is exposed", () => {
    expect(NAME).toBe("lore");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
