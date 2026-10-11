/**
 * lcli528-kind-registry-matches-manifest.test.ts — LCLI-528 (DEC-160, opum-doc) and LCLI-677
 * (DEC-160 amended again, option A).
 *
 * cli-contract §2.1 is the human-readable `kind` registry; the machine-readable one is the
 * capability manifest (`lore help --json`), built by `buildManifest()`. DEC-160 settled that the
 * CODE is right and the docs were wrong: the registry's own convention is `<command>.<noun>`, and
 * the manifest declares `init.result` and `new.result`, while §2.1 had drifted to bare `init`/`new`.
 *
 * LCLI-677 broadened the guard from one direction to SET EQUALITY, per DEC-160 amended: §2.1 is
 * declared EXHAUSTIVE, so the two sets must be identical. The manifest's declared set is the union
 * the module docstring names — `commands[].kind`, `commands[].resultKinds`, and
 * `globalFlags[].kind`. The `version`/`help` meta envelopes ARE declared there (the `--version` AND
 * `--help` flags each carry a `kind`), so §2.1's meta row is INCLUDED rather than skipped: the two
 * sets are equal only when that row is counted.
 *
 * Why the one-direction check was not enough: it could not see a DELETED row — it stayed green when
 * the table lost kinds (a review mutation proof: deleting 3 rows, 25 -> 22, kept it green), which
 * is exactly the omission drift it existed to catch. Equality is what makes that direction fail.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../src/core/manifest";

const ROOT = join(import.meta.dir, "..");
const CONTRACT = join(ROOT, "docs/reference/cli-contract.md");

/** Every kind the capability manifest declares: commands[].kind ∪ commands[].resultKinds ∪ globalFlags[].kind. */
function declaredKinds(): Set<string> {
  const declared = new Set<string>();
  for (const command of buildManifest().commands) {
    declared.add(command.kind);
    for (const kind of command.resultKinds ?? []) declared.add(kind);
  }
  for (const flag of buildManifest().globalFlags) {
    if (flag.kind) declared.add(flag.kind);
  }
  return declared;
}

/**
 * Parse the §2.1 `| kind | Emitted by | data shape |` table and return EVERY row's kinds, the
 * `--version`/`--help` meta row included. Compound kind cells (`a.result / b.result`) are split on
 * `/`; backticks are stripped. Nothing is skipped: §2.1 is declared exhaustive (LCLI-677), so the
 * meta row's `version`/`help` are part of the set the manifest must equal.
 */
function registryKinds(doc: string): string[] {
  const lines = doc.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim().startsWith("|") && l.includes("| Emitted by |"));
  if (headerIdx === -1) throw new Error("cli-contract §2.1 kind registry table header not found");

  const kinds: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line.startsWith("|")) break;
    if (/^\|[\s:|-]+\|$/.test(line)) continue; // the `|---|---|---|` separator
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    for (const token of (cells[0] ?? "").split("/")) {
      const kind = token.replace(/`/g, "").trim();
      if (kind) kinds.push(kind);
    }
  }
  return kinds;
}

describe("LCLI-528 / LCLI-677: the cli-contract §2.1 kind registry EQUALS the command manifest", () => {
  test("the §2.1 registry and the manifest declare exactly the same kinds", () => {
    const kinds = registryKinds(readFileSync(CONTRACT, "utf8"));
    const declared = declaredKinds();

    // Positive controls: a parse that read nothing (or a manifest that declared nothing) would make
    // equality hold vacuously — the exact "clean answer from zero inputs" trap.
    expect(kinds.length).toBeGreaterThan(0);
    expect(declared.size).toBeGreaterThan(0);

    // Both directions, named separately so a failure says WHICH drift it is: a table row the
    // manifest does not declare, or a manifest kind the table omits.
    const undeclared = kinds.filter((kind) => !declared.has(kind));
    expect(undeclared).toEqual([]);
    const omitted = [...declared].filter((kind) => !kinds.includes(kind)).sort();
    expect(omitted).toEqual([]);
    // A DUPLICATED row satisfies both filters while the table is wrong; equality means once each.
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  test("the init and new rows carry the manifest's dotted kinds, not bare command names", () => {
    const kinds = registryKinds(readFileSync(CONTRACT, "utf8"));
    expect(kinds).toContain("init.result");
    expect(kinds).toContain("new.result");
    expect(kinds).not.toContain("init");
    expect(kinds).not.toContain("new");
  });
});
