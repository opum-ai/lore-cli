/**
 * run-bounded.test.ts — proves scripts/run-bounded.mjs both ways (LCLI-753).
 *
 * The script exists so ci.yml's browser-engine install cannot hang for 20-38 minutes (four
 * recurrences on 2026-10-22). The claims that matter are behaviours, so each runs the REAL
 * script against a real child process:
 *   - a hung command is killed at the per-attempt timeout and the script FAILS, not hangs;
 *   - the kill reaches grandchildren (a hung `bunx` has children), so nothing outlives it;
 *   - one failed attempt is retried and a later success passes;
 *   - every attempt failing is a red exit, never a pass.
 * POSIX-only: the script signals a process group, which Windows does not have; the one workflow
 * step that uses it runs on ubuntu.
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "run-bounded.mjs");
const describePosix = process.platform === "win32" ? describe.skip : describe;

function run(args: string[]): { status: number | null; ms: number; stderr: string; stdout: string } {
  const started = Date.now();
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", timeout: 60_000 });
  return { status: result.status, ms: Date.now() - started, stderr: result.stderr ?? "", stdout: result.stdout ?? "" };
}

describePosix("run-bounded.mjs (LCLI-753)", () => {
  test("a command that hangs is killed at the timeout and the script exits 1, not hangs", () => {
    // Two attempts of a 30 s sleep at a 1 s cap: ~2 s, not ~60 s. The generous upper bound
    // only has to separate "bounded" from "hung".
    const result = run(["--timeout-seconds", "1", "--attempts", "2", "--", "sleep", "30"]);
    expect(result.status).toBe(1);
    expect(result.ms).toBeLessThan(20_000);
    expect(result.stderr).toContain("attempt 1/2 timed out after 1s");
    expect(result.stderr).toContain("attempt 2/2 timed out after 1s");
    expect(result.stderr).toContain("failed on every attempt");
  });

  test("the kill reaches grandchildren, so a hung install's children do not outlive it", () => {
    const dir = mkdtempSync(join(tmpdir(), "run-bounded-"));
    try {
      const pidFile = join(dir, "grandchild.pid");
      // The shell backgrounds a long sleep (the grandchild), records its pid, then waits.
      const script = `sleep 300 & echo $! > "${pidFile}"; wait`;
      const result = run(["--timeout-seconds", "1", "--attempts", "1", "--", "sh", "-c", script]);
      expect(result.status).toBe(1);
      expect(existsSync(pidFile)).toBe(true);
      const pid = Number(readFileSync(pidFile, "utf8").trim());
      expect(Number.isInteger(pid) && pid > 1).toBe(true);
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      expect(alive).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("one failed attempt is retried, and a later success exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "run-bounded-"));
    try {
      const marker = join(dir, "first-ran");
      // Fails the first time (creating the marker), succeeds once the marker exists.
      const script = `if [ -e "${marker}" ]; then exit 0; else : > "${marker}"; exit 3; fi`;
      const result = run(["--timeout-seconds", "10", "--attempts", "2", "--", "sh", "-c", script]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("needed 2 attempts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a command that fails on every attempt is red, and the retry count stays bounded", () => {
    const dir = mkdtempSync(join(tmpdir(), "run-bounded-"));
    try {
      const counter = join(dir, "count");
      writeFileSync(counter, "");
      const script = `echo x >> "${counter}"; exit 7`;
      const result = run(["--timeout-seconds", "10", "--attempts", "2", "--", "sh", "-c", script]);
      expect(result.status).toBe(1);
      expect(readFileSync(counter, "utf8").split("\n").filter(Boolean)).toHaveLength(2);
      expect(result.stderr).toContain("attempt 1/2 exited 7");
      expect(result.stderr).toContain("attempt 2/2 exited 7");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a command that succeeds the first time runs exactly once and exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "run-bounded-"));
    try {
      const counter = join(dir, "count");
      writeFileSync(counter, "");
      const result = run(["--timeout-seconds", "10", "--attempts", "2", "--", "sh", "-c", `echo x >> "${counter}"`]);
      expect(result.status).toBe(0);
      expect(readFileSync(counter, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
      expect(result.stdout).not.toContain("needed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("usage errors exit 2 and never run anything", () => {
    for (const args of [
      [],
      ["--timeout-seconds", "5", "--attempts", "2"],
      ["--timeout-seconds", "0", "--attempts", "2", "--", "true"],
      ["--timeout-seconds", "5", "--attempts", "x", "--", "true"],
      ["--attempts", "2", "--", "true"],
      ["--bogus", "--", "true"],
    ])
      expect(run(args).status).toBe(2);
  });
});
