import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateLadybugBenchmarkFixture, loadLadybugBenchmarkFixtureSpec } from "../benchmark/ladybug/fixture";

const FIXTURES = join(import.meta.dir, "..", "benchmark", "ladybug", "fixtures", "v1");
const SHIM = join(import.meta.dir, "..", "benchmark", "ladybug", "backlog-shim.ts");
const roots: string[] = [];

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Ladybug fixture Backlog shim", () => {
  test("uses BACKLOG_CWD rather than its physical launch directory", () => {
    const projectRoot = tempRoot("lore-backlog-shim-project-");
    const isolationCwd = tempRoot("lore-backlog-shim-isolation-");
    const spec = loadLadybugBenchmarkFixtureSpec(join(FIXTURES, "small.json"));
    generateLadybugBenchmarkFixture(spec, projectRoot);

    const result = Bun.spawnSync([process.execPath, "run", SHIM, "task", "list", "--json"], {
      cwd: isolationCwd,
      env: { ...process.env, BACKLOG_CWD: projectRoot },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toMatchObject({ schemaVersion: 1, kind: "task-list" });
  });
});
