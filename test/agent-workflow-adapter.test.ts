/**
 * Process-seam tests for the public `opum-agent-workflow/v1` binding seam:
 * `lore agent context <profile> --contract opum-agent-workflow/v1 --json` with
 * the request binding piped on stdin. The CLI runs as a real subprocess so the
 * stdout/stderr/exit contract is exactly what the fixed Opum facade observes.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-workflow-binding-"));
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
      "Fixture root concept for the workflow binding seam.",
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
      'description = "fixture profile for the workflow binding seam"',
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

function runBinding(profile: string, binding: unknown): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [CLI, "agent", "context", profile, "--contract", "opum-agent-workflow/v1", "--json"],
    {
      cwd: root,
      input: `${JSON.stringify(binding)}\n`,
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function bindingFor(profileId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract: "opum-agent-workflow",
    supportedVersions: [1],
    requestId: "a".repeat(32),
    taskId: "T-1",
    profileId,
    ...overrides,
  };
}

function profileRevisionHex(): string {
  return createHash("sha256")
    .update(readFileSync(join(root, ".lore", "agents", "pair.toml")))
    .digest("hex");
}

describe("opum-agent-workflow/v1 binding seam", () => {
  test("success binds the exact request and emits the bare machine record on stdout", () => {
    const { exitCode, stdout, stderr } = runBinding("pair", bindingFor("pair"));
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain("OPUM_WORKFLOW_LORE_");
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
    expect(record.contract).toBe("opum-agent-workflow");
    expect(record.selectedVersion).toBe(1);
    expect(record.requestId).toBe("a".repeat(32));
    expect(record.taskId).toBe("T-1");
    expect(record.profileId).toBe("pair");
    expect(record.digestAlgorithm).toBe("sha256");
    expect(record.digest as string).toMatch(/^[a-f0-9]{64}$/);
    expect(record.contextId).toBeTypeOf("string");
    expect((record.contextId as string).length).toBeGreaterThan(0);
    expect(record.profileRevision as string).toMatch(/^[a-f0-9]{64}$/);
    const issued = Date.parse(record.issuedAt as string);
    const expires = Date.parse(record.expiresAt as string);
    expect(Number.isFinite(issued)).toBe(true);
    expect(expires - issued).toBeGreaterThan(0);
    expect(expires - issued).toBeLessThanOrEqual(300_000);
    const sourceIds = record.sourceIds as unknown[];
    expect(Array.isArray(sourceIds)).toBe(true);
    expect(sourceIds.length).toBeGreaterThan(0);
    // Canonical source identifiers: plain strings, never projection objects.
    expect(sourceIds.every((id) => typeof id === "string" && (id as string).length > 0)).toBe(true);
    expect(JSON.stringify(sourceIds)).not.toContain("{");
  });

  test("fails closed with OPUM_WORKFLOW_LORE_ABSENT for an uninstalled profile", () => {
    const { exitCode, stdout, stderr } = runBinding("missing", bindingFor("missing"));
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("OPUM_WORKFLOW_LORE_ABSENT");
  });

  test("fails closed with OPUM_WORKFLOW_LORE_INCOMPATIBLE for structurally invalid bindings", () => {
    for (const binding of [
      { ...bindingFor("pair"), contract: "other" },
      { ...bindingFor("pair"), supportedVersions: [1, 2] },
      { ...bindingFor("pair"), supportedVersions: [2] },
      { ...bindingFor("pair"), requestId: "short" },
      { ...bindingFor("pair"), taskId: "" },
      { ...bindingFor("pair"), unexpected: true },
    ]) {
      const { exitCode, stdout, stderr } = runBinding("pair", binding);
      expect(exitCode).not.toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toContain("OPUM_WORKFLOW_LORE_INCOMPATIBLE");
    }
  });

  test("fails closed with OPUM_WORKFLOW_LORE_MISMATCH when the binding disagrees with the CLI profile", () => {
    const { exitCode, stdout, stderr } = runBinding("pair", bindingFor("other"));
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("OPUM_WORKFLOW_LORE_MISMATCH");
  });

  test("fails closed with OPUM_WORKFLOW_LORE_STALE for a pinned stale profile revision", () => {
    const { exitCode, stdout, stderr } = runBinding("pair", bindingFor("pair", { profileRevision: "0".repeat(64) }));
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("OPUM_WORKFLOW_LORE_STALE");
  });

  test("succeeds when the pinned profile revision matches the installed profile", () => {
    const binding = bindingFor("pair", { profileRevision: profileRevisionHex() });
    const { exitCode, stdout, stderr } = runBinding("pair", binding);
    expect(exitCode).toBe(0);
    expect(stderr).not.toContain("OPUM_WORKFLOW_LORE_");
    const record = JSON.parse(stdout.trim()) as Record<string, unknown>;
    expect(record.profileRevision).toBe(profileRevisionHex());
  });
});
