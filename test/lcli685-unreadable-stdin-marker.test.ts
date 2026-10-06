/**
 * LCLI-685: an UNREADABLE stdin is one caller-visible condition, so it must be
 * classified the same way on both binding paths. Before this fix the default
 * path (no `--request`) read fd 0 unwrapped, so a throw fell through
 * `emitBindingFailure`'s generic branch to `OPUM_WORKFLOW_LORE_INCOMPATIBLE`,
 * while `--request -` wrapped the same read and reported
 * `OPUM_WORKFLOW_LORE_BINDING_ABSENT`. The default-path read now routes through
 * the same helper, so both paths agree.
 *
 * The trigger here is a WRITE-ONLY descriptor bound to fd 0: reading it raises
 * EBADF, which is the portable spelling of the in-the-field trigger (a directory
 * bound to stdin, EISDIR — `openSync` on a directory is not portable to
 * Windows CI, so the test does not use it). A shell-closed fd is NOT usable: bun
 * normalizes it to an empty read. On any platform where this particular fd does
 * happen to read empty, the empty-stdin branch yields the SAME marker, so the
 * assertion stays correct there — just weaker.
 *
 * The pre-fix control is recorded in the task: the DEFAULT-path case emitted
 * INCOMPATIBLE before the change and BINDING_ABSENT after.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const BINDING_ABSENT = "OPUM_WORKFLOW_LORE_BINDING_ABSENT";
const INCOMPATIBLE = "OPUM_WORKFLOW_LORE_INCOMPATIBLE";

let root: string;
let sink: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-685-unreadable-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "docs", "index.md"),
    [
      "---",
      "type: Reference",
      "title: test bundle",
      "description: minimal fixture bundle",
      "summary: minimal fixture bundle root",
      "timestamp: 2026-08-27T00:00:00Z",
      'okf_version: "0.1"',
      "---",
      "",
      "# test bundle",
      "",
      "Fixture root concept for the LCLI-685 unreadable-stdin marker.",
      "",
    ].join("\n"),
  );
  mkdirSync(join(root, ".lore", "agents"), { recursive: true });
  writeFileSync(join(root, ".lore", "profile.toml"), "# Built-in Lore profile; fixture bytes are intentional.\n");
  writeFileSync(
    join(root, ".lore", "agents", "pair.toml"),
    [
      "schema_version = 1",
      'name = "pair"',
      'description = "fixture profile for the LCLI-685 unreadable-stdin marker"',
      'kind = "specialist"',
      "max_tokens = 1000",
      'sources = ["index"]',
      "",
    ].join("\n"),
  );
  sink = join(root, "sink.bin");
  writeFileSync(sink, "");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run the contract seam with fd 0 bound to a write-only descriptor (unreadable). */
function runWithUnreadableStdin(extraArgs: string[]): { exitCode: number; stdout: string; stderr: string } {
  const fd = openSync(sink, "w");
  try {
    const result = spawnSync(
      process.execPath,
      [CLI, "agent", "context", "pair", "--contract", "opum-agent-workflow/v1", "--json", ...extraArgs],
      { cwd: root, stdio: [fd, "pipe", "pipe"], encoding: "utf8", timeout: 30_000 },
    );
    return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  } finally {
    closeSync(fd);
  }
}

function bindingFor(profileId: string): Record<string, unknown> {
  return {
    contract: "opum-agent-workflow",
    supportedVersions: [1],
    requestId: "a".repeat(32),
    taskId: "T-1",
    profileId,
  };
}

describe("LCLI-685: an unreadable stdin reports BINDING_ABSENT on both binding paths", () => {
  test("the DEFAULT path (no --request) reports BINDING_ABSENT, not INCOMPATIBLE", () => {
    const { exitCode, stdout, stderr } = runWithUnreadableStdin([]);
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${BINDING_ABSENT}\n`);
    expect(stderr).not.toBe(`${INCOMPATIBLE}\n`);
  });

  test("--request - reports BINDING_ABSENT for the same condition", () => {
    const { exitCode, stdout, stderr } = runWithUnreadableStdin(["--request", "-"]);
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${BINDING_ABSENT}\n`);
  });

  test("both paths agree: the unreadable-stdin marker is identical", () => {
    const dflt = runWithUnreadableStdin([]);
    const viaFlag = runWithUnreadableStdin(["--request", "-"]);
    expect(dflt.stderr).toBe(viaFlag.stderr);
    expect(dflt.exitCode).toBe(viaFlag.exitCode);
  });

  test("positive control: a READABLE stdin on the default path still succeeds", () => {
    const result = spawnSync(
      process.execPath,
      [CLI, "agent", "context", "pair", "--contract", "opum-agent-workflow/v1", "--json"],
      { cwd: root, input: `${JSON.stringify(bindingFor("pair"))}\n`, encoding: "utf8", timeout: 30_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("OPUM_WORKFLOW_LORE_");
    expect(JSON.parse((result.stdout ?? "").trim()).profileId).toBe("pair");
  });
});
