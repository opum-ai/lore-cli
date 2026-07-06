import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  type BacklogCapability,
  type BacklogSpawn,
  bunBacklogSpawn,
  EXPECTED_SCHEMA_VERSION,
  MIN_BACKLOG_VERSION,
  probeBacklog,
  type SpawnResult,
} from "../src/adapters/backlog";
import { exitCodeFor, LoreError } from "../src/errors";

/**
 * A canned outcome for one `backlog` invocation: either a {@link SpawnResult} the process produced, or
 * an `Error` the spawn itself rejects with (used to simulate `ENOENT` — a binary missing from PATH).
 */
type Outcome = SpawnResult | Error;

/** A `{schemaVersion, kind, data}` envelope string, matching the fork's actual `task list --json` output. */
function envelope(kind: unknown, data: unknown, schemaVersion: unknown = EXPECTED_SCHEMA_VERSION): string {
  return JSON.stringify({ schemaVersion, kind, data });
}

/** Shorthand for a process that ran and exited `0` with `stdout` (and empty stderr). */
function ok(stdout: string): SpawnResult {
  return { exitCode: 0, stdout, stderr: "" };
}

/**
 * A fake {@link BacklogSpawn} that dispatches on the argument vector: `--version` returns `version`,
 * `task list --json` returns `list`. It records every call so tests can pin the invocation order and
 * assert fail-fast (that `task list` is never reached when the version step already failed).
 */
function fakeSpawn(script: { version?: Outcome; list?: Outcome }): BacklogSpawn & { calls: string[][] } {
  const calls: string[][] = [];
  const spawn = (async (args: readonly string[]): Promise<SpawnResult> => {
    calls.push([...args]);
    const key = args[0] === "--version" ? "version" : "list";
    const outcome = script[key];
    if (outcome === undefined) {
      throw new Error(`fakeSpawn: no scripted outcome for ${JSON.stringify(args)}`);
    }
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  }) as BacklogSpawn & { calls: string[][] };
  spawn.calls = calls;
  return spawn;
}

/** Run `probeBacklog` and return the {@link LoreError} it throws, failing the test if it does not throw. */
async function probeError(spawn: BacklogSpawn): Promise<LoreError> {
  try {
    await probeBacklog(spawn);
  } catch (err) {
    if (err instanceof LoreError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected probeBacklog to throw, but it resolved");
}

describe("probeBacklog — passes on a --json-capable fork (AC#2)", () => {
  test("returns the version and schemaVersion when --version and task list --json both succeed", async () => {
    const spawn = fakeSpawn({
      version: ok("1.47.1\n"),
      list: ok(envelope("taskList", [{ id: "BACK-1" }])),
    });

    const capability: BacklogCapability = await probeBacklog(spawn);

    expect(capability).toEqual({ version: "1.47.1", schemaVersion: "1" });
    // Order and fail-forward: --version first, then the dry task list probe.
    expect(spawn.calls).toEqual([["--version"], ["task", "list", "--json"]]);
  });

  test("tolerates a version above the floor and an empty task list", async () => {
    const spawn = fakeSpawn({ version: ok("1.48.0\n"), list: ok(envelope("taskList", [])) });
    expect(await probeBacklog(spawn)).toEqual({ version: "1.48.0", schemaVersion: "1" });
  });

  test("drops pre-release/build metadata and extra envelope keys", async () => {
    const spawn = fakeSpawn({
      version: ok("1.47.1-beta.2+build5\n"),
      // A future additive key on the envelope must be tolerated, not rejected.
      list: ok(JSON.stringify({ schemaVersion: "1", kind: "taskList", data: [], generatedAt: "whenever" })),
    });
    expect(await probeBacklog(spawn)).toEqual({ version: "1.47.1", schemaVersion: "1" });
  });
});

describe("probeBacklog — fails loud on a missing binary (AC#2, exit 3)", () => {
  test("an ENOENT-coded spawn rejection is not_found, and the list probe is never reached", async () => {
    const enoent = Object.assign(new Error("spawn backlog ENOENT"), { code: "ENOENT" });
    const spawn = fakeSpawn({ version: enoent });

    const err = await probeError(spawn);

    expect(err.type).toBe("not_found");
    expect(exitCodeFor(err)).toBe(3);
    expect(err.message).toContain("was not found on PATH");
    expect(spawn.calls).toEqual([["--version"]]);
  });

  test("a non-ENOENT spawn rejection propagates unchanged (an unexpected fault, not a probe verdict)", async () => {
    const boom = Object.assign(new Error("kernel said no"), { code: "EACCES" });
    await expect(probeBacklog(fakeSpawn({ version: boom }))).rejects.toThrow("kernel said no");
  });
});

describe("probeBacklog — fails loud on a non-fork binary (AC#2, exit 6)", () => {
  test("stock Backlog.md rejects --json (task list exits non-zero) → validation", async () => {
    const spawn = fakeSpawn({
      version: ok("1.47.1\n"),
      list: { exitCode: 1, stdout: "", stderr: "error: unknown option '--json'" },
    });

    const err = await probeError(spawn);

    expect(err.type).toBe("validation");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("not --json-capable");
    // The version passed, so the discriminator was the dry list probe — both calls happened.
    expect(spawn.calls).toEqual([["--version"], ["task", "list", "--json"]]);
  });

  test("a non-zero --version exit is fail-loud", async () => {
    const err = await probeError(fakeSpawn({ version: { exitCode: 2, stdout: "", stderr: "boom" } }));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("--version` exited non-zero");
  });

  test("a --version line that is not a bare semver is fail-loud", async () => {
    const err = await probeError(fakeSpawn({ version: ok("backlog version 1.47.1\n") }));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("did not print a bare semver");
  });

  test("a version below the floor is fail-loud and names the floor", async () => {
    const err = await probeError(fakeSpawn({ version: ok("1.46.9\n") }));
    expect(err.type).toBe("validation");
    expect(err.message).toContain(MIN_BACKLOG_VERSION);
    expect(err.message).toContain("below");
  });

  test("unparseable task list stdout is fail-loud", async () => {
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok("not json at all") });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("did not print parseable JSON");
  });

  test("a JSON array (not an envelope object) is fail-loud", async () => {
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok("[1,2,3]") });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("envelope object");
  });

  test("the wrong envelope kind is fail-loud (guards the camelCase `taskList` discriminator)", async () => {
    // The CLI-contract prose says "task-list"; the schema-of-record and the binary emit "taskList".
    // A hyphenated kind must be rejected — this pins the probe to the real value.
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok(envelope("task-list", [])) });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("taskList");
  });

  test("a non-array `data` is fail-loud", async () => {
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok(envelope("taskList", { not: "an array" })) });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("`data` was not an array");
  });

  test("an unrecognized schemaVersion is fail-loud rather than mis-read", async () => {
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok(envelope("taskList", [], "2")) });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("schemaVersion");
  });
});

describe("bunBacklogSpawn — the real Bun.spawn seam", () => {
  test("captures stdout and a zero exit from a real binary", async () => {
    // `printf` is a harmless stand-in for `backlog`, proving the seam wires stdout/exit correctly.
    const result = await bunBacklogSpawn("printf")(["hello"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello");
  });

  test("rejects with an ENOENT code when the binary is absent from PATH", async () => {
    const spawn = bunBacklogSpawn("lore-no-such-binary-ff3a1c");
    let code: unknown;
    try {
      await spawn(["--version"]);
    } catch (err) {
      code = (err as { code?: unknown }).code;
    }
    expect(code).toBe("ENOENT");
  });

  test("runs the subprocess in the given cwd, not the caller's own working directory", async () => {
    // realpath: on macOS, tmpdir() resolves through a /tmp -> /private/tmp symlink, which `pwd`
    // reports as the real path — resolve both sides the same way before comparing.
    const dir = realpathSync(mkdtempSync(`${tmpdir()}/lore-spawn-cwd-`));
    try {
      const result = await bunBacklogSpawn("pwd", dir)([]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
