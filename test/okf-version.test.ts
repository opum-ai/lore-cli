import { describe, expect, test } from "bun:test";
import {
  CURRENT_OKF_VERSION,
  LEGACY_OKF_VERSION,
  requireSupportedOkfVersion,
  resolveBundleState,
} from "../src/core/okf-version";
import { exitCodeFor, LoreError } from "../src/errors";

describe("OKF bundle-version negotiation", () => {
  test("a missing declaration is explicitly typed as legacy 0.1 without a new warning", () => {
    expect(resolveBundleState(null)).toEqual({
      state: { okfVersion: LEGACY_OKF_VERSION, source: "legacy-missing" },
      issues: [],
    });
  });

  test.each(["0.1", "0.2"] as const)("a declared supported %s version is authoritative", (version) => {
    expect(resolveBundleState({ okf_version: version })).toEqual({
      state: { okfVersion: version, source: "declared" },
      issues: [],
    });
  });

  test("an unknown future declaration is retained and consumed with best-effort current semantics", () => {
    const resolved = resolveBundleState({ okf_version: "0.3" });
    expect(resolved.state).toEqual({
      okfVersion: CURRENT_OKF_VERSION,
      source: "future-best-effort",
      declaredVersion: "0.3",
    });
    expect(resolved.issues).toEqual([
      expect.objectContaining({ severity: "warning", message: expect.stringContaining("best-effort") }),
    ]);
  });

  for (const [label, value] of [
    ["number", 0.2],
    ["null", null],
    ["empty string", ""],
    ["list", []],
    ["mapping", {}],
  ] as const) {
    test(`a malformed ${label} declaration is an error issue`, () => {
      const resolved = resolveBundleState({ okf_version: value });
      expect(resolved.issues).toEqual([expect.objectContaining({ severity: "error" })]);
    });
  }
});

describe("producer profile targets", () => {
  test.each(["0.1", "0.2"] as const)("accepts supported target %s", (version) => {
    expect(requireSupportedOkfVersion(version, "profile.okf_version", "profile.toml")).toBe(version);
  });

  test("rejects an unsupported producer target as validation", () => {
    expect(() => requireSupportedOkfVersion("0.3", "profile.okf_version", "profile.toml")).toThrow(LoreError);
    try {
      requireSupportedOkfVersion("0.3", "profile.okf_version", "profile.toml");
    } catch (error) {
      expect((error as LoreError).type).toBe("validation");
      expect(exitCodeFor(error)).toBe(6);
      expect((error as LoreError).message).toContain('"0.1", "0.2"');
    }
  });
});
