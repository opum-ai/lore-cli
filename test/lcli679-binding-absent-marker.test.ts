/**
 * LCLI-679: the workflow binding seam splits two conditions that used to share
 * one marker. An EMPTY or ABSENT binding emits
 * `OPUM_WORKFLOW_LORE_BINDING_ABSENT`; a binding that names a profile which
 * does not exist (a `not_found`) still emits `OPUM_WORKFLOW_LORE_ABSENT`. Both
 * directions are pinned here so neither half of the split can silently collapse
 * back into the other. The CLI runs as a real subprocess so the
 * stdout/stderr/exit contract is exactly what a caller observes.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const BINDING_ABSENT = "OPUM_WORKFLOW_LORE_BINDING_ABSENT";
const NOT_FOUND = "OPUM_WORKFLOW_LORE_ABSENT";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-679-binding-"));
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
      "Fixture root concept for the LCLI-679 marker split.",
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
      'description = "fixture profile for the LCLI-679 marker split"',
      'kind = "specialist"',
      "max_tokens = 1000",
      'sources = ["index"]',
      "",
    ].join("\n"),
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runContract(profile: string, input: string | undefined): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [CLI, "agent", "context", profile, "--contract", "opum-agent-workflow/v1", "--json"],
    { cwd: root, input, encoding: "utf8", timeout: 30_000 },
  );
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
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

describe("LCLI-679: absent-binding and not-found markers are distinct", () => {
  test("an EMPTY binding on stdin emits BINDING_ABSENT, not ABSENT", () => {
    const { exitCode, stdout, stderr } = runContract("pair", "");
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${BINDING_ABSENT}\n`);
    expect(stderr).not.toBe(`${NOT_FOUND}\n`);
  });

  test("a WHITESPACE-only binding emits BINDING_ABSENT", () => {
    const { exitCode, stdout, stderr } = runContract("pair", "\n   \n");
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${BINDING_ABSENT}\n`);
  });

  test("NO binding at all (nothing on stdin) emits BINDING_ABSENT", () => {
    const { exitCode, stdout, stderr } = runContract("pair", undefined);
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${BINDING_ABSENT}\n`);
  });

  test("a binding naming a missing profile still emits ABSENT (not BINDING_ABSENT)", () => {
    const { exitCode, stdout, stderr } = runContract("missing", `${JSON.stringify(bindingFor("missing"))}\n`);
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe(`${NOT_FOUND}\n`);
    expect(stderr).not.toBe(`${BINDING_ABSENT}\n`);
  });

  test("a valid binding emits the success record and neither marker", () => {
    const { exitCode, stdout, stderr } = runContract("pair", `${JSON.stringify(bindingFor("pair"))}\n`);
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain("OPUM_WORKFLOW_LORE_");
    const record = JSON.parse(stdout.trim()) as Record<string, unknown>;
    expect(record.profileId).toBe("pair");
  });
});
