/**
 * lcli637-is-main-symlink.test.ts — a release script must run its CLI when invoked through a
 * symlinked path (LCLI-637; twin of quest-cli QCLI-404).
 *
 * THE DEFECT. Every release script guarded its CLI with
 * `process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)`. resolve()
 * normalizes the string and never follows a symlink, while Node resolves import.meta.url to the
 * module's real path, so through any symlinked path the comparison is false — the macOS tmpdir
 * (/var -> /private/var) is the everyday case, and no symlink of our own is even needed for it.
 * main() then never runs and the process exits 0 with no output: a release gate reporting
 * success for work it never did.
 *
 * PROVEN PER SCRIPT, not per helper. Each case spawns the real script with `node` twice: once at
 * its real path, once through a symlink to the repository's scripts/ directory created in a
 * tmpdir. The symlinked run must do the SAME work as the direct one — same exit code, same bytes
 * on stdout and stderr. The assertion is deliberately never "exit 0": the pre-fix signature IS
 * exit 0 with no output, so a check asserting 0 here would assert nothing. Each invocation is the
 * script's own usage refusal, which reaches main() with no network, no registry and no fixture.
 *
 * BEFORE THE FIX, measured 2026-09-28 on macOS with node v24.20.0: every direct invocation below
 * exits 2 with usage on stderr (52-169 bytes as `wc -c` counts them, trailing newline included;
 * this file's table quotes shell-stripped lengths, which are one shorter), and every symlinked
 * invocation exits 0 with 0 bytes on both streams. After the fix the two agree byte for byte.
 *
 * WINDOWS: the six symlink cases are POSIX-only, following this repo's precedent for symlink tests
 * (`test.skipIf(process.platform === "win32")` in a dozen files; creating one on a runner needs
 * elevation), so the `windows-latest` leg runs the direct, import and tolerance controls and not
 * these. Alias shapes Windows does have — junctions, 8.3 short names — are unverified here; the
 * helper's realpath-both-sides comparison is the form that should handle them, but nothing in this
 * suite demonstrates it (LCLI-637 review F4).
 *
 * THE PATHS HERE ARE REALPATH'D DELIBERATELY. The direct control resolves scripts/ with
 * realpathSync first, so it is a true non-symlinked invocation on any machine — including one
 * whose checkout path is itself reached through a link — and stays green under the pre-fix
 * guard (AC3's mutation proof). This repository already carries one local workaround for this
 * defect rather than the fix: test/lcli632-breaking-bump-gate.test.ts realpaths its tmpdir before
 * copying a script into it (`realpathSync(mkdtempSync(join(tmpdir(), ...)))`), because otherwise
 * the /var prefix alone would stop that copy's CLI from running.
 *
 * THE MODULE-IMPORT CONTROL (AC4): each script is also imported as a module — the shape every
 * existing suite uses (test/launcher-equivalence.test.ts, test/pair-receipt.test.ts,
 * test/promote-latest.test.ts, test/version-parity.test.ts, test/github-release.test.ts,
 * test/lcli632-breaking-bump-gate.test.ts) — and must run nothing: exit 0, no output. That is
 * also the shape where process.argv[1] is absent entirely, which isMain must answer false for.
 * One last case covers isMain's other tolerance: an entry path that does not exist.
 *
 * The symlink cases skip on Windows, following this repository's precedent for symlink tests
 * (test/agents.test.ts, test/check.test.ts, test/replace.test.ts, test/schema-export.test.ts):
 * creating one there needs elevation, and the failure mode would be a false red rather than a
 * missed defect. The direct and module-import controls run everywhere.
 *
 * The vendored copy at test/fixtures/quest-cli/version-parity.mjs carries the same old guard and
 * is NOT edited here: it is pinned byte-for-byte to quest-cli's blob, and QCLI-404 has not
 * landed. See the note beside QUEST_BLOB in test/version-parity.test.ts.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { lstatSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The real path of the scripts under test, never a symlinked spelling of it. */
const SCRIPTS_DIR = realpathSync(join(import.meta.dir, "..", "scripts"));

/**
 * One script, and the invocation that reaches its main() with no network, registry or fixture:
 * its own usage refusal. `usage` is the text that refusal must carry, so a run that reaches main()
 * is distinguishable from one that never started.
 */
type Case = { script: string; args: string[]; usage: string };

const CASES: Case[] = [
  { script: "launcher-equivalence.mjs", args: [], usage: "usage: launcher-equivalence.mjs --rc" },
  { script: "pair-receipt.mjs", args: [], usage: "usage: pair-receipt.mjs --check-release-receipt" },
  { script: "promote-latest.mjs", args: [], usage: "--record <path> is required" },
  { script: "version-parity.mjs", args: ["--help"], usage: "usage: version-parity.mjs --require" },
  { script: "github-release.mjs", args: [], usage: "usage: node scripts/github-release.mjs --version" },
  { script: "check-breaking-bump.mjs", args: ["--next"], usage: "usage: check-breaking-bump.mjs" },
];

type Result = { code: number; stdout: string; stderr: string };

/** The script, run the way CI and a person run it: `node <path> ...args`. */
function runNode(scriptPath: string, args: string[]): Result {
  const proc = Bun.spawnSync(["node", scriptPath, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

/**
 * The same script imported as a module, with no argv[1] at all (`node -e`). If main() ran on
 * import, the script's own refusal would appear on stderr and move the exit code off 0.
 */
function importAsModule(scriptPath: string): Result {
  const source = `await import(${JSON.stringify(pathToFileURL(scriptPath).href)});`;
  const proc = Bun.spawnSync(["node", "--input-type=module", "-e", source], { stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

describe("release scripts invoked through a symlinked path (LCLI-637)", () => {
  let linkRoot: string | undefined;

  afterAll(() => {
    if (linkRoot !== undefined) rmSync(linkRoot, { recursive: true, force: true });
  });

  /** A real symlink to the repository's scripts/ directory, created once, in a tmpdir. */
  function linkedScriptsDir(): string {
    if (linkRoot === undefined) {
      linkRoot = mkdtempSync(join(tmpdir(), "lcli637-"));
      symlinkSync(SCRIPTS_DIR, join(linkRoot, "scripts-link"), "dir");
    }
    return join(linkRoot, "scripts-link");
  }

  for (const c of CASES) {
    test(`${c.script}: direct invocation reaches main() (control)`, () => {
      const direct = runNode(join(SCRIPTS_DIR, c.script), c.args);
      expect(direct.stderr).toContain(c.usage);
      expect(direct.code).not.toBe(0);
    });

    test.skipIf(process.platform === "win32")(
      `${c.script}: through a symlinked directory it does the same work as the direct run`,
      () => {
        const linked = linkedScriptsDir();
        expect(lstatSync(linked).isSymbolicLink()).toBe(true);
        const direct = runNode(join(SCRIPTS_DIR, c.script), c.args);
        const throughLink = runNode(join(linked, c.script), c.args);
        // Before the fix this was exit 0 with nothing on either stream — the defect's signature,
        // which is exactly why the comparison below is to the direct run and never to 0.
        expect(throughLink.stderr.length).toBeGreaterThan(0);
        expect(throughLink.code).toBe(direct.code);
        expect(throughLink.stdout).toBe(direct.stdout);
        expect(throughLink.stderr).toBe(direct.stderr);
      },
    );

    test(`${c.script}: imported as a module it runs nothing (AC4)`, () => {
      const imported = importAsModule(join(SCRIPTS_DIR, c.script));
      expect(imported.code).toBe(0);
      expect(`${imported.stdout}${imported.stderr}`).toBe("");
    });
  }

  // The helper's other documented tolerance, which the six scripts rely on: an entry path that
  // does not exist must answer false (realpathSync throws) rather than blowing up. argv[1] is the
  // fake path because `node -e <program> <arg>` sets argv to [node, <arg>]; the `--` separator some
  // node versions tunnel through is irrelevant here (measured: both forms agree).
  test("isMain answers false, not an exception, for an entry path that does not exist", () => {
    const helper = pathToFileURL(join(SCRIPTS_DIR, "is-main.mjs")).href;
    const source = `const { isMain } = await import(${JSON.stringify(helper)}); console.log(isMain(${JSON.stringify(helper)}));`;
    const proc = Bun.spawnSync(
      ["node", "--input-type=module", "-e", source, join(SCRIPTS_DIR, "no-such-file-here.mjs")],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(proc.stdout.toString().trim()).toBe("false");
    expect(proc.exitCode).toBe(0);
  });
});
