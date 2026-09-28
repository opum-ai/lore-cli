/**
 * lcli615-plain-is-verbatim.test.ts — LCLI-615, opum-agent ruling A (2026-09-28).
 *
 * `--plain` stays verbatim everywhere, a TTY included: agents run under ptys and rely on it for
 * exact reads. Only pretty mode neutralises a document's control sequences. The ruling also asks
 * that the places a person reads say so, so this pins the global `--plain` help line and the
 * cli-surface read section against drifting back to "ANSI-free", which `lore read --plain` is not.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

describe("LCLI-615: --plain is documented as verbatim, control sequences included", () => {
  test("the global --plain help line says read prints the body verbatim, control sequences included", () => {
    const run = Bun.spawnSync(["bun", join(ROOT, "src/cli.ts"), "--help"], { cwd: ROOT });
    expect(run.exitCode).toBe(0);
    const line = run.stdout
      .toString()
      .split("\n")
      .find((l) => l.trimStart().startsWith("--plain"));
    expect(line).toBeDefined();
    expect(line).toContain("verbatim, control sequences included");
    expect(line).not.toContain("ANSI-free");
  });

  test("cli-surface.md states --plain is verbatim everywhere and only pretty neutralises", () => {
    const doc = readFileSync(join(ROOT, "docs/reference/cli-surface.md"), "utf8");
    expect(doc).toContain("**`--plain` is verbatim everywhere, terminal control sequences included.**");
    expect(doc).toContain("Only pretty mode neutralises them.");
  });
});
