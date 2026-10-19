/**
 * release-gate-probe.test.ts — proves the release gate probe both ways (LCLI-738, DEC-204 (b)).
 *
 * The probe's whole value is that it DEMANDS OPPOSITE OUTCOMES from two binaries, so a test that
 * only proved the happy path would pin nothing. Every arm is exercised with a stub binary:
 *
 *   - exit 0                       → passes `present`, FAILS `absent` (the self-obsolescing case)
 *   - nonzero carrying the EXACT rejection literal `Unrecognized key: "targets"`
 *                                  → passes `absent`, FAILS `present`
 *   - nonzero for another reason   → FAILS `absent` — the mutation control for the signature
 *                                    assertion: without it, any crash would satisfy the control
 *   - nonzero merely MENTIONING `targets` (or a near-miss literal)
 *                                  → FAILS `absent` — the signature is anchored on one string,
 *                                    not on a `\btargets\b` pattern that would accept this
 *   - no exit status (killed by a signal)
 *                                  → exits 2 on EITHER arm: nothing was measured, never a pass
 *   - exit 0 while carrying the rejection
 *                                  → still FAILS `absent`, because acceptance is not rejection
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
import type { SpawnLike } from "../scripts/release-gate-probe.mjs";
import { ABSENT_SIGNATURE, main, parseArgs, runProbe, STALE_CONTROL_GUIDANCE } from "../scripts/release-gate-probe.mjs";

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

function invoke(args: string[], io: { spawn?: SpawnLike } = {}): RunResult {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(args, { out: (line) => out.push(line), err: (line) => err.push(line), ...io });
  return { code, out, err };
}

function probe(expectation: "present" | "absent", cwd: string): RunResult {
  return invoke(["--binary", process.execPath, "--expect", expectation, "--cwd", cwd]);
}

const ACCEPTS = "process.exit(0);\n";
// The real rejection: this repository's agent profile under a binary built before `[targets]`.
const REJECTS_NAMING_TARGETS = `console.error('error: .lore/agents/documentation.toml does not match agent profile schema 1: ${ABSENT_SIGNATURE}');\nprocess.exit(6);\n`;
const REJECTS_FOR_ANOTHER_REASON = 'console.error("error: bundle root is unreadable");\nprocess.exit(6);\n';
// Carries the WORD `targets` with a nonzero exit, but not the anchored rejection. This is the
// case a signature built from the word (or a RegExp on it) wrongly accepted.
const MENTIONS_TARGETS = 'console.error("configured targets: profile budget target");\nprocess.exit(6);\n';

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
    expect(err).toContain("does not carry the exact rejection");
    expect(err).toContain(ABSENT_SIGNATURE);
    expect(err).toContain("UNRELATED reason");
    expect(err).toContain("cannot serve as the negative control");
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

  test("exit 0 while carrying the rejection still fails: acceptance is not rejection", () => {
    const dir = stubDir(`console.log(${JSON.stringify(ABSENT_SIGNATURE)});\nprocess.exit(0);\n`);
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.signature).toBe(true);
    expect(probe("absent", dir).code).toBe(1);
  });
});

describe("release gate probe: the absent signature is anchored on the exact rejection", () => {
  test("the exact literal, as the real pre-[targets] binary prints it, passes", () => {
    const dir = stubDir(REJECTS_NAMING_TARGETS);
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.ok).toBe(true);
    expect(result.signature).toBe(true);
    expect(result.output).toContain(ABSENT_SIGNATURE);

    const run = probe("absent", dir);
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(ABSENT_SIGNATURE);
  });

  test("'targets' in unrelated text with a nonzero exit FAILS the absent arm", () => {
    // The regression this pins: a word-boundary pattern on `targets` accepted any output that
    // mentioned the word. The gate exists to show the old binary rejected the FEATURE, not to
    // show that some string containing `targets` appeared somewhere.
    const dir = stubDir(MENTIONS_TARGETS);
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(6);
    expect(result.signature).toBe(false);

    const run = probe("absent", dir);
    expect(run.code).toBe(1);
    const err = run.err.join("\n");
    expect(err).toContain("does not carry the exact rejection");
    expect(err).toContain(STALE_CONTROL_GUIDANCE);
  });

  test("a NEAR-MISS literal does not satisfy the anchor", () => {
    const dir = stubDir("console.error('Unrecognized key: \"target\"');\nprocess.exit(6);\n");
    expect(runProbe({ binary: process.execPath, expect: "absent", cwd: dir }).signature).toBe(false);
    expect(probe("absent", dir).code).toBe(1);
  });
});

describe("release gate probe: a process with no exit status is not measured", () => {
  // On Windows a killed process reports an exit CODE and no signal, so no stub binary can
  // produce the null status this arm is about. The injected seam reproduces exactly what
  // spawnSync returns on the platforms where a signal does end the process.
  const killedBySignal: SpawnLike = () => ({
    status: null,
    signal: "SIGKILL",
    stdout: `error: ${ABSENT_SIGNATURE}\n`,
    stderr: "",
  });

  test("ON THE ABSENT ARM: a null status exits 2 even when the output carries the signature", () => {
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: process.cwd(), spawn: killedBySignal });
    expect(result.kind).toBe("no-status");
    expect(result.exitCode).toBeNull();
    expect(result.signature).toBe(true);
    expect(result.ok).toBe(false);

    const run = invoke(["--binary", process.execPath, "--expect", "absent"], { spawn: killedBySignal });
    expect(run.code).toBe(2);
    const err = run.err.join("\n");
    expect(err).toContain("terminated by SIGKILL without an exit status");
    expect(err).toContain("Nothing was measured");
  });

  test("ON THE PRESENT ARM: a null status exits 2 rather than passing", () => {
    const run = invoke(["--binary", process.execPath, "--expect", "present"], { spawn: killedBySignal });
    expect(run.code).toBe(2);
    expect(run.err.join("\n")).toContain("never a pass");
  });

  test("POSITIVE CONTROL: the real seam reports an integer status, so the branch above is specific", () => {
    const dir = stubDir(REJECTS_NAMING_TARGETS);
    const result = runProbe({ binary: process.execPath, expect: "absent", cwd: dir });
    expect(result.kind).toBe("ran");
    expect(Number.isInteger(result.exitCode)).toBe(true);
    expect(result.ok).toBe(true);
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
