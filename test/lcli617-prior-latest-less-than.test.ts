/**
 * lcli617-prior-latest-less-than.test.ts — a promotion record's every prior `latest` must be OLDER
 * than the record's release (LCLI-617, paired with quest-cli QCLI-391 at opum-ai/quest-cli#353).
 *
 * --rollback moves `latest` to exactly the record's prior values and is gated on no receipt, so a
 * hand-edited record whose prior is NEWER than its release ("5.7.0" in a 5.6.7 record) would move
 * `latest` onto a version nothing qualified. validateRecord refuses it, and refuses a record whose
 * own version is not a plain X.Y.Z without comparing anything against it.
 *
 * Three rules, each named on the cases that exercise it so a mutation's red subset can be predicted
 * from this file alone:
 *   R1  record.version must be a plain X.Y.Z, else one problem and no comparison.
 *   R2  a prior compareReleaseVersions puts above record.version is refused.
 *   R3  compareReleaseVersions orders each component by length, then lexically: numeric order,
 *       exact past 2^53.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RELEASE_PACKAGES } from "../scripts/pair-receipt.mjs";
import { compareReleaseVersions, main, RECORD_KIND, validateRecord } from "../scripts/promote-latest.mjs";

const NEWER = "a rollback may only move latest backwards";

/** A record in the shape planPromotion writes: every package with the same prior unless overridden. */
function record(version: unknown, prior: string, overrides: Record<number, string> = {}) {
  return {
    schemaVersion: 1,
    kind: RECORD_KIND,
    version,
    recordedAt: "2026-09-28T00:00:00.000Z",
    packages: RELEASE_PACKAGES.map((name, i) => ({ name, priorLatest: overrides[i] ?? prior })),
  };
}

describe("compareReleaseVersions (R3)", () => {
  test("[R3 numeric] 0.9.0 is older than 0.10.0, in both argument orders", () => {
    expect(compareReleaseVersions("0.9.0", "0.10.0")).toBeLessThan(0);
    expect(compareReleaseVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });

  test("[R3 2^53] a component past 2^53 still orders exactly, where Number() calls the two equal", () => {
    // The premise: Number() cannot tell these apart, so a Number-based comparison would say 0.
    expect(Number("9007199254740993")).toBe(Number("9007199254740992"));
    expect(compareReleaseVersions("0.0.9007199254740993", "0.0.9007199254740992")).toBeGreaterThan(0);
    expect(compareReleaseVersions("0.0.9007199254740992", "0.0.9007199254740993")).toBeLessThan(0);
  });

  test("[R3 order] equal versions compare 0, and an earlier component outranks every later one", () => {
    expect(compareReleaseVersions("9.9.9", "9.9.9")).toBe(0);
    expect(compareReleaseVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareReleaseVersions("0.1.0", "0.0.99")).toBeGreaterThan(0);
  });
});

describe("validateRecord: a prior newer than the release is refused (R2)", () => {
  for (const prior of ["9.10.0", "10.0.0", "9.9.10"]) {
    test(`[R2 greater] prior ${prior} in a 9.9.9 record is refused`, () => {
      const result = validateRecord(record("9.9.9", "9.9.8", { 3: prior }));
      expect(result.ok).toBe(false);
      expect(result.problems).toEqual([
        `${RELEASE_PACKAGES[3]}: recorded prior latest ${prior} is newer than the release 9.9.9; ${NEWER}`,
      ]);
    });
  }

  test("[R2 greater, same widths] prior 5.7.0 in a 5.6.7 record, the task's own example, is refused", () => {
    const result = validateRecord(record("5.6.7", "5.7.0"));
    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(RELEASE_PACKAGES.length);
    for (const problem of result.problems) expect(problem).toContain(`5.7.0 is newer than the release 5.6.7; ${NEWER}`);
  });

  test("[equal] a prior equal to the release is still refused, as the release itself", () => {
    const result = validateRecord(record("9.9.9", "9.9.8", { 0: "9.9.9" }));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([
      `${RELEASE_PACKAGES[0]}: recorded prior latest is the release itself (9.9.9); rolling back to it restores nothing`,
    ]);
  });

  test("[lesser] a prior older than the release passes", () => {
    expect(validateRecord(record("9.9.9", "9.9.8"))).toEqual({ ok: true, problems: [] });
    expect(validateRecord(record("9.9.9", "0.0.0"))).toEqual({ ok: true, problems: [] });
  });

  test("[lesser, wider release] prior 9.9.9 in a 9.10.0 record passes: a wider component is newer", () => {
    expect(validateRecord(record("9.10.0", "9.9.9"))).toEqual({ ok: true, problems: [] });
    expect(validateRecord(record("10.0.0", "9.99.99"))).toEqual({ ok: true, problems: [] });
  });

  test("[R2 numeric] prior 0.10.0 in a 0.9.0 record is refused", () => {
    const result = validateRecord(record("0.9.0", "0.10.0"));
    expect(result.ok).toBe(false);
    for (const problem of result.problems) expect(problem).toContain("0.10.0 is newer than the release 0.9.0");
  });

  test("[numeric] prior 0.9.0 in a 0.10.0 record passes, though it sorts after 0.10.0 as a string", () => {
    expect("0.9.0" > "0.10.0").toBe(true);
    expect(validateRecord(record("0.10.0", "0.9.0"))).toEqual({ ok: true, problems: [] });
  });

  test("[R2 2^53] prior 0.0.9007199254740993 in a 0.0.9007199254740992 record is refused", () => {
    const result = validateRecord(record("0.0.9007199254740992", "0.0.9007199254740993"));
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain(
      "0.0.9007199254740993 is newer than the release 0.0.9007199254740992; a rollback",
    );
  });

  test("[2^53] the reverse, prior 0.0.9007199254740992 in a 0.0.9007199254740993 record, passes", () => {
    expect(validateRecord(record("0.0.9007199254740993", "0.0.9007199254740992"))).toEqual({
      ok: true,
      problems: [],
    });
  });
});

describe("validateRecord: a record whose own version is not a plain X.Y.Z is refused, and nothing is compared (R1)", () => {
  // The prior is newer than any reading of these versions, so a comparison that ran would add a
  // second problem -- or throw, on "latest" and undefined, which split into fewer than three parts.
  for (const version of ["latest", "v9.9.9", "9.9.9-rc.1", undefined]) {
    test(`[R1] record.version ${JSON.stringify(version)} is refused with one problem and no comparison`, () => {
      const result = validateRecord(record(version, "100.0.0"));
      expect(result.ok).toBe(false);
      expect(result.problems).toEqual([
        `record's version ${JSON.stringify(version)} is not a plain X.Y.Z release version`,
      ]);
    });
  }

  test('[R1 non-string] record.version ["9.9.9"], which a RegExp test would coerce to a match, is refused without throwing', () => {
    const result = validateRecord(record(["9.9.9"], "9.9.8"));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([`record's version ["9.9.9"] is not a plain X.Y.Z release version`]);
  });

  test("[R1 with version] --promote's resume check names both the mismatch and the malformed record version", () => {
    const result = validateRecord(record("latest", "9.9.8"), { version: "9.9.9" });
    expect(result.problems).toEqual([
      `record is for "latest", the release is 9.9.9`,
      `record's version "latest" is not a plain X.Y.Z release version`,
    ]);
  });
});

/**
 * The command AC1 names: `promote-latest --rollback <record>` through main(), against an in-memory
 * registry. Every package's `latest` reads the record's release, so checkRollbackState would pass:
 * the only thing that can refuse the newer prior is validateRecord.
 */
function registry(version: string) {
  const tags: Record<string, Record<string, string>> = Object.fromEntries(
    RELEASE_PACKAGES.map((name) => [name, { latest: version }]),
  );
  const calls: string[][] = [];
  const writes: string[] = [];
  const run = async (command: string, args: string[]) => {
    calls.push([command, ...args]);
    if (command === "security") throw new Error("no keychain entry in this test");
    if (command === "npm" && args[0] === "view" && args[2] === "dist-tags")
      return { stdout: JSON.stringify(tags[args[1] as string] ?? {}) };
    if (command === "npm" && args[0] === "dist-tag" && args[1] === "add") {
      const spec = args[2] as string;
      const at = spec.lastIndexOf("@");
      const name = spec.slice(0, at);
      tags[name] = { ...tags[name], [args[3] as string]: spec.slice(at + 1) };
      writes.push(`dist-tag add ${spec} ${args[3]}`);
      return { stdout: "" };
    }
    throw new Error(`unexpected call: ${command} ${args.join(" ")}`);
  };
  return { tags, calls, writes, run };
}

async function rollbackFrom(rec: unknown, version: string) {
  const dir = mkdtempSync(join(tmpdir(), "lore-lcli617-"));
  const path = join(dir, "promotion-record.json");
  writeFileSync(path, JSON.stringify(rec));
  const r = registry(version);
  const out: string[] = [];
  const err: string[] = [];
  try {
    const code = await main(["--rollback", path], {
      run: r.run,
      env: { NPM_TOKEN: "" },
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      verifyOptions: { attempts: 1, delayMs: 0, sleep: async () => {} },
    });
    return { code, out, err, path, ...r };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("promote-latest --rollback refuses a record with a prior newer than its release (AC1)", () => {
  test("[R2 e2e] a 5.6.7 record with one prior 5.7.0 exits 1 before reading or moving anything", async () => {
    const h = await rollbackFrom(record("5.6.7", "5.6.6", { 2: "5.7.0" }), "5.6.7");
    expect(h.code).toBe(1);
    expect(h.err[0]).toBe(`Refusing to roll back from ${h.path}:`);
    expect(h.err.join("\n")).toContain(
      `${RELEASE_PACKAGES[2]}: recorded prior latest 5.7.0 is newer than the release 5.6.7; ${NEWER}`,
    );
    expect(h.calls).toEqual([]);
    expect(h.writes).toEqual([]);
    for (const name of RELEASE_PACKAGES) expect(h.tags[name]?.latest).toBe("5.6.7");
  });

  test("[control e2e] the same record with every prior older rolls all seven back and exits 0", async () => {
    const h = await rollbackFrom(record("5.6.7", "5.6.6"), "5.6.7");
    expect(h.err).toEqual([]);
    expect(h.code).toBe(0);
    expect(h.writes).toEqual(RELEASE_PACKAGES.map((name) => `dist-tag add ${name}@5.6.6 latest`));
    for (const name of RELEASE_PACKAGES) expect(h.tags[name]?.latest).toBe("5.6.6");
  });

  test("[numeric e2e] a 0.10.0 record with prior 0.9.0 rolls back: numeric order, not string order", async () => {
    const h = await rollbackFrom(record("0.10.0", "0.9.0"), "0.10.0");
    expect(h.err).toEqual([]);
    expect(h.code).toBe(0);
    for (const name of RELEASE_PACKAGES) expect(h.tags[name]?.latest).toBe("0.9.0");
  });
});
