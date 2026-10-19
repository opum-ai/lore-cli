/**
 * release-gate-probe.test.ts — proves the release gate probe both ways (LCLI-738, DEC-204 (b)).
 *
 * The probe's whole value is that it DEMANDS OPPOSITE OUTCOMES from two binaries, so a test that
 * only proved the happy path would pin nothing. Every arm is exercised with a stub binary:
 *
 *   - exit 0                       → passes `present`, FAILS `absent` (the self-obsolescing case)
 *   - nonzero naming `targets`     → passes `absent`, FAILS `present`
 *   - nonzero for another reason   → FAILS `absent` — the mutation control for the signature
 *                                    assertion: without it, any crash would satisfy the control
 *   - exit 0 while naming `targets`→ still FAILS `absent`, because acceptance is not rejection
 *
 * The stub is a Node script run through the runtime executing this suite: `<runtime> check`
 * resolves `check` (and `check.js`) in the probe's `--cwd`, so the same test runs on every
 * platform without an executable-bit or shebang dependency. Measured under bun and node before
 * this test was written.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseArgs, runProbe, STALE_CONTROL_GUIDANCE } from "../scripts/release-gate-probe.mjs";

const scratchDirs: string[] = [];

/** A directory holding a `check` script; the probe's own `--binary` is this runtime. */
function stubDir(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "lore-release-gate-probe-"));
  scratchDirs.push(dir);
  // Both spellings: Node and Bun both resolve `check` to `check.js`, but writing the exact
  // name too keeps the fixture independent of that resolver detail.
  writeFileSync(join(dir, "check"), source, "utf8");
  writeFileSync(join(dir, "check.js"), source, "utf8");
  return dir;
}

afterEach(() => {
  while (scratchDirs.length > 0) rmSync(scratchDirs.pop() as string, { recursive: true, force: true });
});

interface RunResult {
  code: number;
  out: string[];
  err: string[];
}

function invoke(args: string[]): RunResult {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(args, { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

function probe(expectation: "present" | "absent", cwd: string): RunResult {
  return invoke(["--binary", process.execPath, "--expect", expectation, "--cwd", cwd]);
}

const ACCEPTS = "process.exit(0);\n";
const REJECTS_NAMING_TARGETS = "console.error('error: Unrecognized key: \"targets\"');\nprocess.exit(6);\n";
const REJECTS_FOR_ANOTHER_REASON = 'console.error("error: bundle root is unreadable");\nprocess.exit(6);\n';

describe("release gate probe: --expect present", () => {
  test("a binary that exits 0 passes", () => {
    const dir = stubDir(ACCEPTS);
    const result = runProbe({ binary: process.execPath, expect: "present", cwd: dir });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("ran");
    expect(result.exitCode).toBe(0);

    const run = probe("present", dir);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("exited 0, as required");
    expect(run.err).toEqual([]);
  });

  test("a binary that rejects the feature fails, naming the exit status and its output", () => {
    const dir = stubDir(REJECTS_NAMING_TARGETS);
    const result = runProbe({ binary: process.execPath, expect: "present", cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(6);

    const run = probe("present", dir);
    expect(run.code).toBe(1);
    const err = run.err.join("\n");
    expect(err).toContain("exited 6, but --expect present requires exit 0");
    expect(err).toContain("Unrecognized key");
  });
});

describe("release gate probe: --expect absent", () => {
  test("a binary that exits nonzero naming the feature passes (the previous release)", () => {
    const dir = stubDir(REJECTS_NAMING_TARGETS);
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.ok).toBe(true);
    expect(result.signature).toBe(true);
    expect(result.exitCode).toBe(6);

    const run = probe("absent", dir);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("the previous release rejects it");
    expect(run.err).toEqual([]);
  });

  test("the signature is read from stdout as well as stderr", () => {
    const dir = stubDir("console.log('Unrecognized key: \"targets\"');\nprocess.exit(6);\n");
    expect(runProbe({ binary: process.execPath, expect: "absent", cwd: dir }).ok).toBe(true);
    expect(probe("absent", dir).code).toBe(0);
  });

  test("MUTATION CONTROL: a nonzero exit for an UNRELATED reason fails the absent arm", () => {
    // This is the case that makes the signature assertion testable. Every other arm would pass
    // if the probe accepted any nonzero exit; this one turns red exactly when the `targets`
    // check is removed from the gate.
    const dir = stubDir(REJECTS_FOR_ANOTHER_REASON);
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(6);
    expect(result.signature).toBe(false);

    const run = probe("absent", dir);
    expect(run.code).toBe(1);
    const err = run.err.join("\n");
    expect(err).toContain("does not name targets");
    expect(err).toContain("UNRELATED reason cannot serve as the negative control");
    // The upgrade path is part of the failure, never a silent red.
    expect(err).toContain(STALE_CONTROL_GUIDANCE);
    expect(err).toContain("SELF-OBSOLESCING");
    expect(err).toContain("feature that is NEW in this release");
  });

  test("a binary that ACCEPTS the feature fails (self-obsolescence), with the update guidance", () => {
    const dir = stubDir(ACCEPTS);
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(0);

    const run = probe("absent", dir);
    expect(run.code).toBe(1);
    const err = run.err.join("\n");
    expect(err).toContain("exited 0, but --expect absent requires a nonzero exit");
    expect(err).toContain("the negative control proved nothing");
    expect(err).toContain(STALE_CONTROL_GUIDANCE);
    expect(err).toContain("SELF-OBSOLESCING");
    expect(err).toContain("feature that is NEW in this release");
  });

  test("exit 0 while naming the feature still fails: acceptance is not rejection", () => {
    const dir = stubDir("console.log('targets are mentioned');\nprocess.exit(0);\n");
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.signature).toBe(true);
    expect(probe("absent", dir).code).toBe(1);
  });
});

describe("release gate probe: usage and measurement failures are never a pass", () => {
  test("a binary that cannot be run exits 2 and says nothing was measured", () => {
    const run = invoke(["--binary", join(tmpdir(), "lore-does-not-exist-release-gate-probe"), "--expect", "present"]);
    expect(run.code).toBe(2);
    expect(run.err.join("\n")).toContain("could not run");
  });

  test("usage errors exit 2", () => {
    expect(invoke([]).code).toBe(2);
    expect(invoke(["--expect", "present"]).code).toBe(2);
    expect(invoke(["--binary", process.execPath]).code).toBe(2);
    expect(invoke(["--binary", process.execPath, "--expect", "sometimes"]).code).toBe(2);
    expect(invoke(["--binary", process.execPath, "--expect", "present", "--wat"]).code).toBe(2);
    // A flag whose value is missing at the end of argv is refused, not read as empty or absent.
    expect(invoke(["--binary", process.execPath, "--expect"]).code).toBe(2);
    expect(invoke(["--binary", process.execPath, "--expect", "present", "--cwd"]).code).toBe(2);
  });

  test("parseArgs resolves the binary and cwd, and defaults cwd to the caller's", () => {
    const parsed = parseArgs(["--binary", process.execPath, "--expect", "absent"]);
    expect(parsed.binary).toBe(process.execPath);
    expect(parsed.expect).toBe("absent");
    expect(parsed.cwd).toBe(process.cwd());

    const explicit = parseArgs(["--binary", "./relative-lore", "--expect", "present", "--cwd", "."]);
    expect(explicit.binary).toBe(join(process.cwd(), "relative-lore"));
    expect(explicit.cwd).toBe(process.cwd());
  });
});
