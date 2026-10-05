/**
 * lcli528-kind-registry-matches-manifest.test.ts — LCLI-528, per DEC-160 (opum-doc, accepted 2026-10-05).
 *
 * cli-contract §2.1 is the human-readable `kind` registry; the machine-readable one is the
 * capability manifest (`lore help --json`), built by `buildManifest()`. DEC-160 settled that the
 * CODE is right and the docs were wrong: the registry's own convention is `<command>.<noun>`, and
 * the manifest declares `init.result` and `new.result`, while §2.1 had drifted to bare `init`/`new`.
 *
 * This is the recurrence guard for that drift: every kind §2.1 attributes to a lore COMMAND must be
 * a kind the manifest actually declares. The manifest's declared set is the union the module
 * docstring names — `commands[].kind`, `commands[].resultKinds`, and `globalFlags[].kind`. The
 * `version`/`help` row is emitted by the global `--version`/`--help` flags, which the prose above
 * the table says "are not commands and so are not in the manifest"; the property is scoped to
 * command kinds, so that row is skipped — its kinds are not a claim about a command.
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
 * Parse the §2.1 `| kind | Emitted by | data shape |` table and return each COMMAND row's kinds.
 * Compound kind cells (`a.result / b.result`) are split on `/`; backticks are stripped. Rows the
 * table marks as emitted by the global flags (the `--version`/`--help` meta envelopes) are skipped.
 */
function registryCommandKinds(doc: string): string[] {
  const lines = doc.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim().startsWith("|") && l.includes("| Emitted by |"));
  if (headerIdx === -1) throw new Error("cli-contract §2.1 kind registry table header not found");

  const kinds: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line.startsWith("|")) break;
    if (/^\|[\s:|-]+\|$/.test(line)) continue; // the `|---|---|---|` separator
    const cells = line.slice(1, -1).split("|").map((c) => c.trim());
    const kindCell = cells[0] ?? "";
    const emittedBy = cells[1] ?? "";
    if (emittedBy.includes("global flags")) continue; // meta envelope, not a command
    for (const token of kindCell.split("/")) {
      const kind = token.replace(/`/g, "").trim();
      if (kind) kinds.push(kind);
    }
  }
  return kinds;
}

describe("LCLI-528: the cli-contract §2.1 kind registry tracks the command manifest", () => {
  test("every command kind in the §2.1 registry is declared by the manifest", () => {
    const doc = readFileSync(CONTRACT, "utf8");
    const kinds = registryCommandKinds(doc);
    const declared = declaredKinds();

    // Positive controls: a parse that read nothing (or a manifest that declared nothing) would let
    // this pass vacuously — the exact "clean answer from zero inputs" trap.
    expect(kinds.length).toBeGreaterThan(0);
    expect(declared.size).toBeGreaterThan(0);

    const undeclared = kinds.filter((kind) => !declared.has(kind));
    expect(undeclared).toEqual([]);
  });

  test("the init and new rows carry the manifest's dotted kinds, not bare command names", () => {
    const kinds = registryCommandKinds(readFileSync(CONTRACT, "utf8"));
    expect(kinds).toContain("init.result");
    expect(kinds).toContain("new.result");
    expect(kinds).not.toContain("init");
    expect(kinds).not.toContain("new");
  });
});
