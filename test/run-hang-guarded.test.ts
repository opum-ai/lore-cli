/**
 * run-hang-guarded.test.ts — proves scripts/run-hang-guarded.mjs both ways (LCLI-760, DEC-236).
 *
 * The script exists so ci.yml's macOS `bun test` cannot wedge for the 20-minute job timeout. The
 * claims that matter are behaviours, so each runs the REAL script against a real child process:
 *   - a command that goes silent is sampled, killed, and reported as 124 (the retry signal);
 *   - the kill reaches grandchildren, so nothing outlives it;
 *   - a command that keeps printing past the wall-clock backstop is 125, which is NOT a hang;
 *   - a command that exits (0, or a failing status) passes its own status through untouched, so a
 *     failing test can never be mistaken for a hang and retried;
 *   - on macOS, the sample of a silent bun contains a real bun call graph (positive control: a
 *     sample that came back empty or "no such process" would otherwise read as success).
 * POSIX-only: the script signals a process group, which Windows does not have.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "run-hang-guarded.mjs");
const describePosix = process.platform === "win32" ? describe.skip : describe;

function run(args: string[]): { status: number | null; ms: number; stderr: string; stdout: string } {
  const started = Date.now();
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 90_000 });
  return { status: result.status, ms: Date.now() - started, stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
}

/** Poll until `done()` or the deadline; the kill is asynchronous, so never sample liveness once. */
function waitFor(done: () => boolean, ms = 5_000): boolean {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (done()) return true;
    spawnSync("sleep", ["0.1"]);
  }
  return done();
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describePosix("run-hang-guarded.mjs (LCLI-760)", () => {
  test("a command that goes silent is sampled and killed, and the status is 124, not a hang", () => {
    const result = run([
      "--silence-seconds",
      "2",
      "--timeout-seconds",
      "60",
      "--",
      "sh",
      "-c",
      "echo started; sleep 300",
    ]);
    expect(result.status).toBe(124);
    // Bounded: ~2 s of silence plus the sample, nowhere near the 300 s sleep.
    expect(result.ms).toBeLessThan(40_000);
    expect(result.stdout).toContain("started");
    expect(result.stderr).toContain("HUNG? no output for");
    expect(result.stderr).toContain("process sample");
    expect(result.stderr).toContain("pid ppid pgid stat etime %cpu command");
  });

  test("the kill reaches grandchildren, so a wedged run's children do not outlive it", () => {
    const dir = mkdtempSync(join(tmpdir(), "run-hang-guarded-"));
    try {
      const pidFile = join(dir, "grandchild.pid");
      const script = `sleep 300 & echo $! > "${pidFile}"; wait`;
      const result = run(["--silence-seconds", "2", "--timeout-seconds", "60", "--", "sh", "-c", script]);
      expect(result.status).toBe(124);
      expect(existsSync(pidFile)).toBe(true);
      const pid = Number(readFileSync(pidFile, "utf8").trim());
      expect(Number.isInteger(pid) && pid > 1).toBe(true);
      expect(waitFor(() => !alive(pid))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a command that keeps printing past the backstop is 125, which a caller must not retry", () => {
    // Prints every 0.5 s forever, so it is never silent; the 3 s wall backstop ends it.
    const result = run([
      "--silence-seconds",
      "30",
      "--timeout-seconds",
      "3",
      "--",
      "sh",
      "-c",
      "while true; do echo tick; sleep 0.5; done",
    ]);
    expect(result.status).toBe(125);
    expect(result.stderr).toContain("backstop");
    expect(result.stderr).not.toContain("no output for");
  });

  test("a failing command's own status passes through untouched: a real failure is never reported as a hang", () => {
    const result = run([
      "--silence-seconds",
      "30",
      "--timeout-seconds",
      "60",
      "--",
      "sh",
      "-c",
      "echo '(fail) x'; exit 7",
    ]);
    expect(result.status).toBe(7);
    expect(result.stdout).toContain("(fail) x");
    expect(result.stderr).not.toContain("HUNG?");
  });

  test("a command that succeeds exits 0, forwarding stdout and stderr unchanged", () => {
    const result = run([
      "--silence-seconds",
      "30",
      "--timeout-seconds",
      "60",
      "--",
      "sh",
      "-c",
      "echo out; echo err 1>&2",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("out\n");
    expect(result.stderr).toBe("err\n");
  });

  test("a command killed by a signal reports 128+n, not 124", () => {
    const result = run(["--silence-seconds", "30", "--timeout-seconds", "60", "--", "sh", "-c", "kill -TERM $$"]);
    expect(result.status).toBe(143);
  });

  test("a command that cannot start is 127", () => {
    const result = run(["--silence-seconds", "5", "--timeout-seconds", "60", "--", "/no/such/binary-lcli760"]);
    expect(result.status).toBe(127);
  });

  test.skipIf(process.platform !== "darwin")(
    "positive control (macOS): the sample of a silent bun is a real bun call graph",
    () => {
      const result = run([
        "--silence-seconds",
        "2",
        "--timeout-seconds",
        "60",
        "--",
        process.execPath,
        "-e",
        'console.log("up"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)',
      ]);
      expect(result.status).toBe(124);
      expect(result.stderr).toContain("bun processes in the group: 1");
      expect(result.stderr).toContain("--- sample of bun pid");
      expect(result.stderr).toContain("Call graph:");
    },
    90_000,
  );

  test("usage errors exit 2 and never run anything", () => {
    for (const args of [
      [],
      ["--silence-seconds", "5", "--timeout-seconds", "9"],
      ["--silence-seconds", "0", "--timeout-seconds", "9", "--", "true"],
      ["--silence-seconds", "5", "--timeout-seconds", "x", "--", "true"],
      ["--timeout-seconds", "9", "--", "true"],
      ["--silence-seconds", "5", "--", "true"],
      ["--bogus", "--", "true"],
    ])
      expect(run(args).status).toBe(2);
  });
});
