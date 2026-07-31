import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertLadybugBenchmarkSourcesUnchanged,
  canonicalProjectionByteLength,
  ladybugCacheLogicalBytes,
  snapshotLadybugBenchmarkSources,
} from "../benchmark/ladybug/accounting";
import { generateLadybugBenchmarkFixture, loadLadybugBenchmarkFixtureSpec } from "../benchmark/ladybug/fixture";
import {
  type LadybugBenchmarkScenario,
  ladybugBenchmarkScenarios,
  runLadybugBenchmarkPass,
} from "../benchmark/ladybug/orchestrator";
import { disposeLadybugProjection } from "../src/core/ladybug-lifecycle";

const FIXTURES = join(import.meta.dir, "..", "benchmark", "ladybug", "fixtures", "v1");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      disposeLadybugProjection(root);
    } catch {
      makeWritable(root);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Ladybug benchmark worker and orchestrator", () => {
  test("accounts only exact cache bytes and detects repository source writes", () => {
    const root = tempRoot("accounting");
    for (const path of ["docs", "backlog", ".git", ".lore", ".lore/cache/graph/ladybug/1"]) {
      mkdirSync(join(root, path), { recursive: true });
    }
    writeFileSync(join(root, "docs", "index.md"), "source");
    writeFileSync(join(root, ".lore", "profile.toml"), "profile");
    writeFileSync(join(root, ".lore", "outside-cache.txt"), "kept");
    writeFileSync(join(root, ".lore", "cache", "graph", "ladybug", "1", "projection.lbdb"), "derived");
    const before = snapshotLadybugBenchmarkSources(root);
    expect(ladybugCacheLogicalBytes(root)).toBe(Buffer.byteLength("derived"));

    writeFileSync(join(root, ".lore", "cache", "graph", "ladybug", "1", "projection.lbdb"), "larger-derived");
    expect(() => assertLadybugBenchmarkSourcesUnchanged(before, snapshotLadybugBenchmarkSources(root))).not.toThrow();
    writeFileSync(join(root, "docs", "index.md"), "changed source");
    expect(() => assertLadybugBenchmarkSourcesUnchanged(before, snapshotLadybugBenchmarkSources(root))).toThrow(
      "docs/index.md",
    );
  });

  test("derives deterministic fixture scenario definitions", () => {
    const spec = loadLadybugBenchmarkFixtureSpec(join(FIXTURES, "small.json"));
    const scenarios = ladybugBenchmarkScenarios(spec);
    expect(scenarios[0]).toEqual({ id: "warm-open", operation: { kind: "warm-open" } });
    expect(scenarios.some((scenario) => scenario.id === "graph-full")).toBe(true);
    expect(scenarios.filter((scenario) => scenario.id.startsWith("query-"))).toHaveLength(spec.coverage.queries.length);
    expect(scenarios.filter((scenario) => scenario.id.startsWith("context-"))).toHaveLength(
      spec.coverage.graphDepths.length * spec.coverage.contextBudgets.length,
    );
  });

  test("runs fresh indexed/reference workers, proves parity first, and records process resources", async () => {
    const spec = loadLadybugBenchmarkFixtureSpec(join(FIXTURES, "small.json"));
    const generated = generateLadybugBenchmarkFixture(spec, tempRoot("pass"));
    expect(canonicalProjectionByteLength(generated.source)).toBeGreaterThan(spec.counts.markdownBodyBytes);
    const scenarios: LadybugBenchmarkScenario[] = [
      { id: "warm-open", operation: { kind: "warm-open" } },
      { id: "graph-depth-1", operation: { kind: "graph", root: "index", depth: 1 } },
      {
        id: "query-common",
        operation: { kind: "query", text: "constellation-common", limit: spec.counts.concepts },
      },
      { id: "context-budget", operation: { kind: "context", root: "index", depth: 1, maxTokens: 512 } },
    ];
    const before = snapshotLadybugBenchmarkSources(generated.root);
    const pass = await runLadybugBenchmarkPass({ root: generated.root, scenarios, order: ["indexed", "reference"] });

    expect(pass.canonicalInputBytes).toBe(canonicalProjectionByteLength(generated.source));
    expect(pass.coldBuild.result.backend).toBe("indexed");
    expect(pass.coldBuild.cacheLogicalBytesBefore).toBe(0);
    expect(pass.coldBuild.cacheLogicalBytesAfter).toBeGreaterThan(0);
    expect(pass.parity).toHaveLength(scenarios.length);
    expect(pass.measured).toHaveLength(scenarios.length);
    for (const pair of [...pass.parity, ...pass.measured]) {
      expect(pair.samples[0].result.resultDigest).toBe(pair.samples[1].result.resultDigest);
      if (pair.scenario.operation.kind === "warm-open") {
        expect(pair.samples[0].result.emittedBytes).toBe(0);
        expect(pair.samples[1].result.emittedBytes).toBe(0);
      }
      for (const sample of pair.samples) {
        expect(sample.wallNanoseconds).toBeGreaterThan(0);
        expect(sample.result.operationNanoseconds).toBeGreaterThan(0);
        expect(sample.cpuMicroseconds.total).toBeGreaterThan(0);
        expect(sample.maxRSSBytes).toBeGreaterThan(0);
        expect(sample.result.diagnosticBytes).toBe(0);
        if (pair.scenario.operation.kind !== "warm-open") expect(sample.result.emittedBytes).toBeGreaterThan(0);
      }
    }
    expect(() =>
      assertLadybugBenchmarkSourcesUnchanged(before, snapshotLadybugBenchmarkSources(generated.root)),
    ).not.toThrow();
    expect(readdirSync(join(generated.root, ".lore", "cache", "graph", "ladybug", "1", "generations"))).toHaveLength(1);
  }, 60_000);
});

function tempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `lore-ladybug-benchmark-${name}-`));
  roots.push(root);
  return root;
}

function makeWritable(path: string): void {
  try {
    chmodSync(path, 0o700);
  } catch {
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) makeWritable(join(path, entry.name));
  }
}
