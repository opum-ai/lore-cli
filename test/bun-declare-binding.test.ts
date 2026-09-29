/**
 * The pinned runtime must be one whose parser survives a TS contextual keyword STARTING A LARGER
 * EXPRESSION (LCLI-648; OPAG-734; quest-cli QCLI-411; oven-sh/bun#31239).
 *
 * What this test does NOT claim: that lore uses `Bun.Transpiler`, or that lore's source carries a
 * top-level binding named `declare`. It does not, and the check that established that is recorded on
 * LCLI-648. What this pins is the REASON for the 1.4.2 floor, so the reason cannot drift out from
 * under the pin the way a prose note can — measured in this repository twice in one week.
 *
 * The discriminator, both directions measured 2026-09-29 on the identical input:
 *
 *   Bun 1.3.14 -> exit 133 (SIGTRAP), a panic report on stderr, no stdout.
 *   Bun 1.4.2  -> exit 0, "transpile-ok" on stdout.
 *
 * The child is spawned with `process.execPath`, so it runs on the SAME runtime as this suite — the
 * pinned one in CI. A contributor on an older local Bun sees this go red, which is the floor
 * reporting itself rather than a false alarm.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The repro from oven-sh/bun#31239, as measured: `declare` begins a larger expression. */
const REPRO = [
  'const transpiler = new Bun.Transpiler({ loader: "ts" });',
  'transpiler.transformSync("declare = (...t) => R;e((a) => {(u=> uge);\\r\\n})");',
  'console.log("transpile-ok");',
  "",
].join("\n");

describe("the pinned runtime parses a contextual keyword starting a larger expression (LCLI-648)", () => {
  test("the upstream repro transpiles instead of panicking the runtime", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-bun-contextual-keyword-"));
    const file = join(dir, "repro.ts");
    writeFileSync(file, REPRO);

    const proc = Bun.spawnSync([process.execPath, file]);

    // Asserted by NAME, not only by exit code: an unrelated crash must not read as this check
    // passing, and on 1.3.14 the failure prints a panic banner rather than a normal error.
    expect(proc.exitCode).toBe(0);
    expect(proc.stdout.toString()).toContain("transpile-ok");
    expect(proc.stderr.toString()).not.toContain("Internal error");
  });
});
