/**
 * The pinned runtime must be one whose parser survives a TS contextual keyword STARTING A LARGER
 * EXPRESSION (LCLI-648; OPAG-734; quest-cli QCLI-411; oven-sh/bun#31239).
 *
 * What this test does NOT claim: that lore uses `Bun.Transpiler`, or that lore's source carries a
 * top-level binding named `declare`. It does not — verified by grep, neither appears anywhere under
 * `src/`; the only occurrences are in this file's own repro — and the check that established that is
 * recorded on LCLI-648. What this pins is the REASON for a 1.4.2 floor.
 *
 * THAT FLOOR IS NO LONGER THE PIN. DEC-163 (8) (opum-doc, relayed 2026-10-06) pinned BACK to
 * 1.3.14, because the two-window LCLI-660 measurement found the Linux epoll race on the pinned
 * 1.4.2 (10/20 and 17/20) and never on 1.3.14 (0/20 in both windows). The workaround that ruling
 * names is AVOIDING THE CONSTRUCT, which shipped lore already does, so the panic below cannot
 * reach shipped code. This test therefore SKIPS on the 1.3.14 floor — kept rather than deleted, so
 * it re-arms on its own if the pin ever moves forward again (DEC-163 (8): only once the same
 * two-window measurement confirms a Bun epoll fix).
 *
 * The discriminator, both directions measured 2026-09-29 on the identical input:
 *
 *   Bun 1.3.14 -> exit 133 (SIGTRAP), a panic report on stderr, no stdout.
 *   Bun 1.4.2  -> exit 0, "transpile-ok" on stdout.
 *
 * The child is spawned with `process.execPath`, so it runs on the SAME runtime as this suite — the
 * pinned one in CI.
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

/**
 * True on the exact runtime DEC-163 (8) pinned back to. Gated by the floor's own version string
 * rather than a general `>=` test, so the skip says precisely "this is the pinned version whose
 * parser carries the LCLI-648 panic" and not something broader about every older Bun.
 */
const PINNED_FLOOR_HAS_LCLI648_PANIC = Bun.version === "1.3.14";

describe("the pinned runtime parses a contextual keyword starting a larger expression (LCLI-648)", () => {
  test.skipIf(PINNED_FLOOR_HAS_LCLI648_PANIC)(
    "the upstream repro transpiles instead of panicking the runtime [skipped on the 1.3.14 floor, which has the LCLI-648 panic — DEC-163 (8)]",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "lore-bun-contextual-keyword-"));
      const file = join(dir, "repro.ts");
      writeFileSync(file, REPRO);

      const proc = Bun.spawnSync([process.execPath, file]);

      // Asserted by NAME, not only by exit code: an unrelated crash must not read as this check
      // passing, and on 1.3.14 the failure prints a panic banner rather than a normal error.
      expect(proc.exitCode).toBe(0);
      expect(proc.stdout.toString()).toContain("transpile-ok");
      expect(proc.stderr.toString()).not.toContain("Internal error");
    },
  );
});
