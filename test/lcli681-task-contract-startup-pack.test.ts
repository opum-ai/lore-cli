/**
 * LCLI-681 (ODOC-437 slice 2): the lean task-startup pack driven by a controller-composed
 * `TaskContract/v1` on `--task-contract <file|->`.
 *
 * What is pinned here, in the order the acceptance criteria name them:
 *  - AC1: the pack carries the task's PURPOSE, acceptance criteria and dependency artifacts, and
 *    the contract's links are seeded as pins — no task notes, no backlog, no transcript.
 *  - AC3: a MANDATORY link that resolves to no concept FAILS with `CONTEXT_REQUIRED_SOURCE_MISSING`;
 *    a missing OPTIONAL link is an omission carrying its reason, and the compile still succeeds.
 *
 * The CLI runs as a real subprocess, so the exit code and the pack envelope are exactly what a
 * caller observes.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const MARKER = "CONTEXT_REQUIRED_SOURCE_MISSING";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-681-contract-"));
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
      "Fixture root concept for the LCLI-681 startup pack.",
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
      'description = "fixture profile for the LCLI-681 startup pack"',
      'kind = "specialist"',
      "max_tokens = 4000",
      'sources = ["index"]',
      "",
    ].join("\n"),
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function contract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    task: { repositoryId: "lore-cli", id: "LCLI-681", revision: "deadbeef" },
    purpose: "compile the lean task-startup pack",
    phase: "implement",
    acceptance: [{ id: "AC1", text: "the pack carries purpose and criteria", evidenceRule: "bun test" }],
    dependencies: [{ taskId: "LCLI-680", revision: "390077f9", satisfied: true }],
    documentation: [],
    ...overrides,
  };
}

function run(input?: string, args: readonly string[] = []): { exit: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [CLI, "agent", "context", "pair", "--task-contract", "-", "--json", ...args],
    { cwd: root, input, encoding: "utf8", timeout: 30_000 },
  );
  return { exit: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("LCLI-681: the lean task-startup pack from --task-contract", () => {
  test("AC1: the pack carries purpose, acceptance criteria and dependency artifacts", () => {
    const { exit, stdout, stderr } = run(`${JSON.stringify(contract())}\n`);
    expect(stderr).not.toContain(MARKER);
    expect(exit).toBe(0);
    const pack = JSON.parse(stdout.trim()).data as Record<string, unknown>;
    const carried = pack.contract as Record<string, unknown>;
    expect(carried).toBeDefined();
    expect(carried.purpose).toBe("compile the lean task-startup pack");
    expect(carried.phase).toBe("implement");
    expect((carried.acceptance as unknown[]).length).toBe(1);
    expect((carried.dependencies as { taskId: string }[])[0]?.taskId).toBe("LCLI-680");
    // No task notes / backlog / transcript ever enters the pack.
    expect(JSON.stringify(pack)).not.toContain("implementationNotes");
  });

  test("AC1: a resolvable mandatory link is seeded as a pinned source", () => {
    const { exit, stdout } = run(
      `${JSON.stringify(contract({ documentation: [{ repositoryId: "lore-cli", conceptId: "index", relation: "requires" }] }))}\n`,
    );
    expect(exit).toBe(0);
    const pack = JSON.parse(stdout.trim()).data as { pinned: { conceptId: string }[] };
    expect(pack.pinned.some((item) => item.conceptId === "index")).toBe(true);
  });

  test("AC3: a missing MANDATORY link fails with CONTEXT_REQUIRED_SOURCE_MISSING", () => {
    const { exit, stderr } = run(
      `${JSON.stringify(contract({ documentation: [{ repositoryId: "lore-cli", conceptId: "nope", relation: "requires" }] }))}\n`,
    );
    expect(exit).not.toBe(0);
    expect(stderr).toContain(MARKER);
  });

  test("AC3: `constrains` is mandatory too", () => {
    const { exit, stderr } = run(
      `${JSON.stringify(contract({ documentation: [{ repositoryId: "lore-cli", conceptId: "nope", relation: "constrains" }] }))}\n`,
    );
    expect(exit).not.toBe(0);
    expect(stderr).toContain(MARKER);
  });

  test("AC3: a missing OPTIONAL link is an omission with a reason, and the compile succeeds", () => {
    const { exit, stdout, stderr } = run(
      `${JSON.stringify(contract({ documentation: [{ repositoryId: "lore-cli", conceptId: "nope", relation: "explains" }] }))}\n`,
    );
    expect(stderr).not.toContain(MARKER);
    expect(exit).toBe(0);
    const pack = JSON.parse(stdout.trim()).data as { omissions?: { source: string; reason: string }[] };
    expect(pack.omissions?.length).toBe(1);
    expect(pack.omissions?.[0]?.source).toContain("nope");
    expect(pack.omissions?.[0]?.reason).toContain("explains");
  });

  test("a malformed contract is a validation failure, not a silent fallback", () => {
    const { exit, stderr } = run(`${JSON.stringify(contract({ purpose: "" }))}\n`);
    expect(exit).not.toBe(0);
    expect(stderr).toContain("purpose");
  });
});
