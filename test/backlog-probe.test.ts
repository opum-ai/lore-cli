import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  BACKLOG_TIMEOUT_ENV_VAR,
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

/**
 * A `{schemaVersion, kind, tasks}` envelope string, matching upstream's real `task list --json` output
 * (backlog-json-schema.md §8) — a numeric `schemaVersion`, hyphenated `kind`, and a `tasks` payload key.
 */
function envelope(kind: unknown, tasks: unknown, schemaVersion: unknown = EXPECTED_SCHEMA_VERSION): string {
  return JSON.stringify({ schemaVersion, kind, tasks });
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

describe("probeBacklog — passes on a --json-capable upstream build (AC#2)", () => {
  test("returns the version and schemaVersion when --version and task list --json both succeed", async () => {
    const spawn = fakeSpawn({
      version: ok("1.47.1\n"),
      list: ok(envelope("task-list", [{ id: "BACK-1" }])),
    });

    const capability: BacklogCapability = await probeBacklog(spawn);

    expect(capability).toEqual({ version: "1.47.1", schemaVersion: EXPECTED_SCHEMA_VERSION });
    // Order and fail-forward: --version first, then the dry task list probe.
    expect(spawn.calls).toEqual([["--version"], ["task", "list", "--json"]]);
  });

  test("tolerates a version above the floor and an empty task list", async () => {
    const spawn = fakeSpawn({ version: ok("1.48.0\n"), list: ok(envelope("task-list", [])) });
    expect(await probeBacklog(spawn)).toEqual({ version: "1.48.0", schemaVersion: EXPECTED_SCHEMA_VERSION });
  });

  test("drops pre-release/build metadata and extra envelope keys", async () => {
    const spawn = fakeSpawn({
      version: ok("1.47.1-beta.2+build5\n"),
      // A future additive key on the envelope must be tolerated, not rejected.
      list: ok(JSON.stringify({ schemaVersion: 1, kind: "task-list", tasks: [], generatedAt: "whenever" })),
    });
    expect(await probeBacklog(spawn)).toEqual({ version: "1.47.1", schemaVersion: EXPECTED_SCHEMA_VERSION });
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

describe("probeBacklog — fails loud on a non-json-capable binary (AC#2, exit 6)", () => {
  test("a binary without --json support rejects it (task list exits non-zero) → validation", async () => {
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

  test("the wrong envelope kind is fail-loud (guards the hyphenated `task-list` discriminator)", async () => {
    // Upstream emits the hyphenated "task-list"; this fork's camelCase "taskList" must be rejected —
    // this pins the probe to the real (upstream) value, not the fork's.
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok(envelope("taskList", [])) });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("task-list");
  });

  test("a non-array `tasks` is fail-loud", async () => {
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok(envelope("task-list", { not: "an array" })) });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("`tasks` was not an array");
  });

  test("an unrecognized schemaVersion is fail-loud rather than mis-read", async () => {
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok(envelope("task-list", [], 2)) });
    const err = await probeError(spawn);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("schemaVersion");
  });

  test('the fork\'s string schemaVersion "1" is also an unrecognized (non-numeric) schemaVersion', async () => {
    const spawn = fakeSpawn({ version: ok("1.47.1\n"), list: ok(envelope("task-list", [], "1")) });
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
    // Spawns the current runtime binary itself (not an external `pwd`, which isn't reliably on
    // PATH on Windows CI runners) with an inline script printing its own cwd — portable across all
    // three CI platforms. realpath: on macOS, tmpdir() resolves through a /tmp -> /private/tmp
    // symlink, which the spawned process's own cwd resolution follows too — resolve both sides the
    // same way before comparing.
    const dir = realpathSync(mkdtempSync(`${tmpdir()}/lore-spawn-cwd-`));
    try {
      const result = await bunBacklogSpawn(process.execPath, dir)(["-e", "console.log(process.cwd())"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("kills a deliberately non-terminating process and rejects with a typed timeout error within the bound (LORE-217)", async () => {
    // Same portable pattern as the cwd test above: the current runtime binary itself with an
    // inline script, not an external `sleep` (not reliably on PATH on Windows CI runners). The
    // busy loop never yields to the event loop and has no other way to exit — if the timeout
    // guard did not kill it, this test would hang until bun's own per-test timeout fired.
    const previous = process.env[BACKLOG_TIMEOUT_ENV_VAR];
    process.env[BACKLOG_TIMEOUT_ENV_VAR] = "200";
    try {
      const start = Date.now();
      const spawn = bunBacklogSpawn(process.execPath);
      let caught: unknown;
      try {
        await spawn(["-e", "while (true) {}"]);
      } catch (err) {
        caught = err;
      }
      const elapsed = Date.now() - start;

      // Terminates well within the bound (generous margin over the 200ms timeout for process
      // start/teardown overhead) rather than hanging — the property the AC requires.
      expect(elapsed).toBeLessThan(4_000);

      expect(caught).toBeInstanceOf(LoreError);
      const err = caught as LoreError;
      expect(err.type).toBe("validation");
      expect(exitCodeFor(err)).toBe(6);
      expect(err.message).toContain("did not exit within 200ms");
      expect(err.hint).toContain(BACKLOG_TIMEOUT_ENV_VAR);
    } finally {
      if (previous === undefined) {
        delete process.env[BACKLOG_TIMEOUT_ENV_VAR];
      } else {
        process.env[BACKLOG_TIMEOUT_ENV_VAR] = previous;
      }
    }
  });
});
