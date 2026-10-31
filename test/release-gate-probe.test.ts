/**
 * release-gate-probe.test.ts — proves the release gate probe both ways (LCLI-738, DEC-204 (b),
 * re-based onto LCLI-771's Codex skill path by LCLI-751).
 *
 * The probe's whole value is that it DEMANDS OPPOSITE OUTCOMES from two binaries: a bridge the
 * FRESH binary writes must pass `agents --check --target codex` under the fresh binary and FAIL it
 * under the previous release with the exact line `out-of-date .codex/skills/lore/SKILL.md`. A test
 * that only proved the happy path would pin nothing, so every arm runs through the injected
 * `spawn` seam, with no stub executable, no `bun <name>` resolution and no platform dependency
 * (the previous stub-script design depended on how the runtime resolves `check`, and failed on
 * hosts where it does not):
 *
 *   - check exits 0                → passes `present`, FAILS `absent` (the self-obsolescing case)
 *   - nonzero carrying the EXACT line → passes `absent`, FAILS `present`
 *   - nonzero for another reason   → FAILS `absent` — the mutation control for the signature
 *   - nonzero merely naming `.codex` or a near-miss line → FAILS `absent`
 *   - the fresh binary cannot write the bridge → exits 2, nothing measured
 *   - no exit status (killed by a signal)      → exits 2 on EITHER arm
 *   - exit 0 while carrying the line           → still FAILS `absent`
 *
 * One test runs the REAL fresh code (this checkout's CLI) through the seam, so the present arm is
 * proven against the actual feature, and the previous release's output is the one captured from
 * the v0.14.1 sources against a bridge this tree wrote (2026-10-31).
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnLike, SpawnResult } from "../scripts/release-gate-probe.mjs";
import { ABSENT_SIGNATURE, main, parseArgs, runProbe, STALE_CONTROL_GUIDANCE } from "../scripts/release-gate-probe.mjs";

interface RunResult {
  code: number;
  out: string[];
  err: string[];
}

interface Call {
  binary: string;
  args: string[];
  cwd: string | undefined;
  env: Record<string, string | undefined> | undefined;
}

/** What the real v0.14.1 prints for `agents --check --target codex` on a bridge this tree wrote. */
const V0_14_1_OUTPUT = `out-of-date .codex/skills/lore/SKILL.md
out-of-date AGENTS.md
bridge is out of date — run \`lore agents\` to regenerate (exit 6)
`;

const WROTE: SpawnResult = {
  status: 0,
  stdout: "created .agents/skills/lore/SKILL.md\ncreated AGENTS.md\n",
  stderr: "",
};

/** A seam that answers the generating call with `written` and the checking call with `checked`. */
function seam(
  checked: SpawnResult,
  written: SpawnResult = WROTE,
  layout: string[] = [".agents/skills/lore/SKILL.md"],
): { spawn: SpawnLike; calls: Call[] } {
  const calls: Call[] = [];
  const spawn: SpawnLike = (binary, args, options) => {
    calls.push({ binary, args, cwd: options.cwd, env: options.env });
    if (args.includes("--check")) return checked;
    // The generating call: lay the named files down in the scratch directory, as the real binary does.
    for (const rel of written.status === 0 ? layout : []) {
      const file = join(options.cwd as string, rel);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, "x");
    }
    return written;
  };
  return { spawn, calls };
}

function invoke(args: string[], io: { spawn: SpawnLike }): RunResult {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(args, { out: (line) => out.push(line), err: (line) => err.push(line), ...io });
  return { code, out, err };
}

const present = (checked: SpawnResult, written?: SpawnResult, layout?: string[]): RunResult =>
  invoke(["--binary", "/fresh/lore", "--expect", "present"], seam(checked, written, layout));
const absent = (checked: SpawnResult, written?: SpawnResult, layout?: string[]): RunResult =>
  invoke(
    ["--binary", "/previous/lore", "--expect", "absent", "--fresh-binary", "/fresh/lore"],
    seam(checked, written, layout),
  );

describe("release gate probe: --expect present", () => {
  test("a fresh binary whose own bridge checks clean passes", () => {
    const run = present({ status: 0, stdout: "up-to-date .agents/skills/lore/SKILL.md\n", stderr: "" });
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain("exited 0, as required");
    expect(run.err).toEqual([]);
  });

  test("a fresh binary that rejects a bridge it wrote fails, naming the exit status and output", () => {
    const run = present({ status: 6, stdout: "out-of-date .agents/skills/lore/SKILL.md\n", stderr: "" });
    expect(run.code).toBe(1);
    const err = run.err.join("\n");
    expect(err).toContain("exited 6, but --expect present requires exit 0");
    expect(err).toContain("out-of-date");
  });
});

describe("release gate probe: --expect absent", () => {
  test("the previous release's real output (the exact line, exit 6) passes", () => {
    const run = absent({ status: 6, stdout: V0_14_1_OUTPUT, stderr: "" });
    expect(run.code).toBe(0);
    expect(run.out.join("\n")).toContain(`carried the exact line ${ABSENT_SIGNATURE}`);
    expect(run.err).toEqual([]);
  });

  test("the signature is read from stderr as well as stdout", () => {
    expect(absent({ status: 6, stdout: "", stderr: V0_14_1_OUTPUT }).code).toBe(0);
  });

  test("MUTATION CONTROL: a nonzero exit for an UNRELATED reason fails the absent arm", () => {
    const run = absent({ status: 6, stdout: "", stderr: "error: bundle root is unreadable\n" });
    expect(run.code).toBe(1);
    expect(run.err.join("\n")).toContain("does not carry the exact line");
    expect(run.err).toContain(STALE_CONTROL_GUIDANCE);
  });

  test("a previous release that ACCEPTS the feature fails (self-obsolescence), with the update guidance", () => {
    const run = absent({ status: 0, stdout: "up-to-date .agents/skills/lore/SKILL.md\n", stderr: "" });
    expect(run.code).toBe(1);
    expect(run.err.join("\n")).toContain("The previous release ACCEPTED the probed feature");
    expect(run.err).toContain(STALE_CONTROL_GUIDANCE);
  });

  test("exit 0 while carrying the line still fails: acceptance is not rejection", () => {
    expect(absent({ status: 0, stdout: V0_14_1_OUTPUT, stderr: "" }).code).toBe(1);
  });
});

describe("release gate probe: the absent signature is anchored on the exact line", () => {
  test.each([
    ["the old path named without the out-of-date verb", "leftover .codex/skills/lore/SKILL.md\n"],
    ["a different file out of date", "out-of-date AGENTS.md\n"],
    ["the NEW path out of date", "out-of-date .agents/skills/lore/SKILL.md\n"],
    ["a near-miss spelling", "out-of-date .codex/skills/lore/SKILL.MD\n"],
  ])("%s with a nonzero exit FAILS the absent arm", (_name, text) => {
    expect(absent({ status: 6, stdout: text, stderr: "" }).code).toBe(1);
  });
});

describe("release gate probe: the signature is a WHOLE line, and each arm proves its own fixture (LCLI-751)", () => {
  test.each([
    ["a line that merely CONTAINS the signature", "note: out-of-date .codex/skills/lore/SKILL.md is mentioned here\n"],
    ["a longer path sharing the prefix", "out-of-date .codex/skills/lore/SKILL.md.bak\n"],
  ])("%s FAILS the absent arm", (_name, text) => {
    expect(absent({ status: 6, stdout: text, stderr: "" }).code).toBe(1);
  });

  test("CRLF output (a win32 binary) still carries the whole line", () => {
    expect(absent({ status: 6, stdout: V0_14_1_OUTPUT.replace(/\n/g, "\r\n"), stderr: "" }).code).toBe(0);
  });

  test.each([
    ["the new skill path is missing", []],
    ["the old skill path is also written", [".agents/skills/lore/SKILL.md", ".codex/skills/lore/SKILL.md"]],
    ["only the old skill path is written", [".codex/skills/lore/SKILL.md"]],
  ])("a bridge layout where %s is a fixture error (exit 2) on both arms, even if the check would pass", (_name, layout) => {
    const checked: SpawnResult = { status: 6, stdout: V0_14_1_OUTPUT, stderr: "" };
    for (const run of [absent(checked, WROTE, layout), present({ status: 0, stdout: "", stderr: "" }, WROTE, layout)]) {
      expect(run.code).toBe(2);
      expect(run.err.join("\n")).toContain("could not write the Codex bridge");
    }
  });
});

describe("release gate probe: nothing measured is never a pass", () => {
  test("a null exit status on the CHECK exits 2 on both arms, even carrying the line", () => {
    const killed: SpawnResult = { status: null, signal: "SIGKILL", stdout: V0_14_1_OUTPUT, stderr: "" };
    expect(absent(killed).code).toBe(2);
    expect(present(killed).code).toBe(2);
  });

  test("the fresh binary failing to write the bridge exits 2 and names the cause", () => {
    for (const run of [
      absent({ status: 6, stdout: V0_14_1_OUTPUT, stderr: "" }, { status: 1, stdout: "", stderr: "boom\n" }),
      present({ status: 0, stdout: "", stderr: "" }, { status: 1, stdout: "", stderr: "boom\n" }),
    ]) {
      expect(run.code).toBe(2);
      expect(run.err.join("\n")).toContain("could not write the Codex bridge");
    }
  });

  test("a binary that cannot be run exits 2", () => {
    const spawn: SpawnLike = () => ({ status: null, error: new Error("ENOENT") });
    expect(invoke(["--binary", "/nope", "--expect", "present"], { spawn }).code).toBe(2);
  });

  test("POSITIVE CONTROL: the real child_process seam reports an integer status", () => {
    const result = runProbe({
      binary: process.execPath,
      expect: "present",
      spawn: (binary, args, options) => {
        // The real spawnSync, on a runtime that has no `agents` verb, so the probe sees a real nonzero status.
        const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
        return spawnSync(binary, ["-e", "process.exit(3)", ...args.slice(0, 0)], {
          ...options,
          encoding: "utf8" as const,
        });
      },
    });
    expect(result.kind).toBe("fixture-error");
    expect(result.exitCode).toBe(3);
  });
});

describe("release gate probe: where it runs", () => {
  test("both calls run in one scratch directory under the OS temp dir, never the checkout, with plugin detection off, and it is removed", () => {
    const { spawn, calls } = seam({ status: 6, stdout: V0_14_1_OUTPUT, stderr: "" });
    const dir = mkdtempSync(join(tmpdir(), "lore-gate-probe-test-"));
    let removed: string | undefined;
    const result = runProbe({
      binary: "/previous/lore",
      freshBinary: "/fresh/lore",
      expect: "absent",
      spawn,
      makeDir: () => dir,
      removeDir: (d) => {
        removed = d;
        rmSync(d, { recursive: true, force: true });
      },
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.cwd)).toEqual([dir, dir]);
    expect(dir).not.toBe(process.cwd());
    expect(calls[0]).toMatchObject({ binary: "/fresh/lore", args: ["agents", "--target", "codex"] });
    expect(calls[1]).toMatchObject({ binary: "/previous/lore", args: ["agents", "--check", "--target", "codex"] });
    expect(calls.every((c) => c.env?.LORE_AGENT_PLUGINS === "off")).toBe(true);
    expect(removed).toBe(dir);
    expect(existsSync(dir)).toBe(false);
  });

  test("the present arm has the fresh binary write AND check its own bridge", () => {
    const { spawn, calls } = seam({ status: 0, stdout: "", stderr: "" });
    runProbe({ binary: "/fresh/lore", expect: "present", spawn });
    expect(calls.map((c) => c.binary)).toEqual(["/fresh/lore", "/fresh/lore"]);
  });

  test("REAL FRESH CODE: this checkout's CLI writes a bridge and passes its own check (the feature itself)", () => {
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const cli = join(import.meta.dir, "..", "src", "cli.ts");
    const spawn: SpawnLike = (_binary, args, options) =>
      spawnSync(process.execPath, ["run", cli, ...args], { ...options, encoding: "utf8" as const });
    const result = runProbe({ binary: "unused-because-the-seam-maps-it", expect: "present", spawn });
    expect(result.kind).toBe("ran");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(".agents/skills/lore/SKILL.md");
    expect(result.output).not.toContain(".codex/skills");
  });
});

describe("release gate probe: usage is never a pass", () => {
  test("usage errors exit 2", () => {
    const { spawn } = seam({ status: 0 });
    expect(invoke([], { spawn }).code).toBe(2);
    expect(invoke(["--binary", "/x"], { spawn }).code).toBe(2);
    expect(invoke(["--binary", "/x", "--expect", "sometimes"], { spawn }).code).toBe(2);
    expect(invoke(["--binary", "/x", "--expect", "absent"], { spawn }).code).toBe(2);
    expect(invoke(["--binary", "/x", "--expect", "present", "--cwd", "/y"], { spawn }).code).toBe(2);
    expect(invoke(["--wat"], { spawn }).code).toBe(2);
  });

  test("parseArgs resolves both binaries and requires --fresh-binary for absent", () => {
    const parsed = parseArgs(["--binary", "a/lore", "--expect", "absent", "--fresh-binary", "b/lore"]);
    expect(parsed.binary).toBe(join(process.cwd(), "a/lore"));
    expect(parsed.freshBinary).toBe(join(process.cwd(), "b/lore"));
    expect(() => parseArgs(["--binary", "a", "--expect", "absent"])).toThrow("--fresh-binary is required");
    expect(parseArgs(["--binary", "a", "--expect", "present"]).freshBinary).toBeNull();
  });
});
