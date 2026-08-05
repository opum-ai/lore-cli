import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLadybugBenchmarkBacklogAdapter,
  generateLadybugBenchmarkFixture,
  LADYBUG_BENCHMARK_FIXTURE_SCHEMA,
  LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH,
  type LadybugBenchmarkFixtureSpec,
  loadLadybugBenchmarkFixtureSpec,
  loadLadybugBenchmarkTasks,
} from "../benchmark/ladybug/fixture";
import { loadBundle } from "../src/core/bundle";
import { buildContext } from "../src/core/context";
import { LADYBUG_CACHE_REL_ROOT, loadLadybugProjectionSource } from "../src/core/ladybug-source";
import { query, subgraph } from "../src/core/query";
import { fakeAdapter, makeTask } from "./helpers";

const FIXTURES = join(import.meta.dir, "..", "benchmark", "ladybug", "fixtures", "v1");
const LARGE_FIXTURE_TIMEOUT_MS = process.platform === "win32" ? 60_000 : 30_000;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `lore-ladybug-${name}-`));
  roots.push(root);
  return root;
}

function load(name: "small" | "large"): LadybugBenchmarkFixtureSpec {
  return loadLadybugBenchmarkFixtureSpec(join(FIXTURES, `${name}.json`));
}

describe("Ladybug benchmark fixture v1", () => {
  test("freezes the schema and exercises the small fixture scenarios", async () => {
    const schema = JSON.parse(readFileSync(join(FIXTURES, "schema.json"), "utf8")) as {
      $id?: unknown;
      properties?: { schema?: { const?: unknown } };
    };
    expect(schema.$id).toBe(LADYBUG_BENCHMARK_FIXTURE_SCHEMA);
    expect(schema.properties?.schema?.const).toBe(LADYBUG_BENCHMARK_FIXTURE_SCHEMA);

    const spec = load("small");
    const generated = generateLadybugBenchmarkFixture(spec, tempRoot("small"));
    expect(generated.source.counts).toEqual({ concepts: 64, tasks: 128, authoredEdges: 512 });
    expect(generated.markdownBodyBytes).toBe(1024 * 1024);
    expect(generated.digests).toEqual(spec.expected);
    expect(generated.source.concepts.reduce((sum, concept) => sum + Buffer.byteLength(concept.body), 0)).toBe(
      spec.counts.markdownBodyBytes,
    );
    expect(readdirSync(join(generated.root, "backlog", "tasks"))).toHaveLength(spec.counts.tasks);
    expect(existsSync(join(generated.root, LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH))).toBe(true);
    expect(loadLadybugBenchmarkTasks(generated.root)).toEqual([...generated.tasks]);
    expect(await createLadybugBenchmarkBacklogAdapter(generated.root).listTasks()).toEqual([...generated.tasks]);
    expect(existsSync(join(generated.root, LADYBUG_CACHE_REL_ROOT))).toBe(false);

    const productionSource = await loadLadybugProjectionSource({
      root: generated.root,
      ladybugVersion: "0.18.2",
      ladybugStorageVersion: "42",
      adapter: fakeAdapter(
        generated.tasks.map((task) => makeTask(task.id, task)),
        { listTasks: "ok" },
      ),
      resolveGitCommit: () => null,
    });
    expect(productionSource.exportDigest).toBe(spec.expected.canonicalExportSha256);
    expect(productionSource.taskSnapshotDigest).toBe(spec.expected.taskSnapshotSha256);

    const root = generated.source.concepts.find((concept) => concept.id === "index");
    expect(root?.frontmatter.fixture_extension).toEqual({
      schema: LADYBUG_BENCHMARK_FIXTURE_SCHEMA,
      seed: spec.seed,
      ordinal: 0,
      unicode: "café 東京 🪲",
    });
    expect(root?.body).toContain("café-unicode");

    const dangling = generated.source.authoredEdges.filter((edge) => edge.dangling);
    expect(dangling.length).toBeGreaterThan(0);
    const multiplicities = new Map<string, number>();
    for (const edge of generated.source.authoredEdges) {
      const key = `${edge.from}\0${edge.kind}\0${edge.target}`;
      multiplicities.set(key, (multiplicities.get(key) ?? 0) + 1);
    }
    expect([...multiplicities.values()].some((count) => count > 1)).toBe(true);

    const graph = loadBundle(join(generated.root, "docs"));
    for (const querySpec of spec.coverage.queries) {
      const result = query(graph, { text: querySpec.text, limit: spec.counts.concepts });
      expect(result.total, querySpec.id).toBe(querySpec.expectedMatches);
      if (querySpec.expectTopTie === true) {
        expect(result.hits).toHaveLength(2);
        expect(result.hits[0]?.score).toBe(result.hits[1]?.score);
      }
    }

    let priorSize = 0;
    for (const depth of spec.coverage.graphDepths) {
      const reached = subgraph(graph, "index", depth);
      expect(reached.size).toBeGreaterThan(priorSize);
      priorSize = reached.size;
    }
    for (const maxTokens of spec.coverage.contextBudgets) {
      const context = buildContext(graph, "index", { depth: 2, maxTokens });
      expect(context.root).toBe("index");
      expect(context.maxTokens).toBe(maxTokens);
    }
  });

  test("repeats the seeded small fixture byte-for-byte", () => {
    const spec = load("small");
    const first = generateLadybugBenchmarkFixture(spec, tempRoot("small-a"));
    const second = generateLadybugBenchmarkFixture(spec, tempRoot("small-b"));
    expect(first.digests).toEqual(second.digests);
    expect(first.source.inventory).toEqual(second.source.inventory);
    for (const path of ["docs/index.md", "docs/concepts/concept-000063.md", "backlog/config.yml"]) {
      expect(readFileSync(join(first.root, path))).toEqual(readFileSync(join(second.root, path)));
    }
  });

  test(
    "pins the large fixture scale, lexical classes, and semantic digests",
    () => {
      const spec = load("large");
      const generated = generateLadybugBenchmarkFixture(spec, tempRoot("large"));
      expect(generated.source.counts).toEqual({ concepts: 4096, tasks: 4096, authoredEdges: 32768 });
      expect(generated.markdownBodyBytes).toBe(100 * 1024 * 1024);
      expect(generated.digests).toEqual(spec.expected);
      expect(generated.source.inventory).toHaveLength(spec.counts.concepts);
      expect(readdirSync(join(generated.root, "backlog", "tasks"))).toHaveLength(spec.counts.tasks);
      expect(existsSync(join(generated.root, LADYBUG_CACHE_REL_ROOT))).toBe(false);

      const matches = new Map(spec.coverage.queries.map((querySpec) => [querySpec.id, 0]));
      for (const concept of generated.source.concepts) {
        for (const querySpec of spec.coverage.queries) {
          if (concept.body.includes(querySpec.text)) {
            matches.set(querySpec.id, (matches.get(querySpec.id) ?? 0) + 1);
          }
        }
      }
      for (const querySpec of spec.coverage.queries) {
        expect(matches.get(querySpec.id), querySpec.id).toBe(querySpec.expectedMatches);
      }
    },
    LARGE_FIXTURE_TIMEOUT_MS,
  );
});
