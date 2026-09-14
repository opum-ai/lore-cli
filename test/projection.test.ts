import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "..", "src");

import type { BacklogAdapter } from "../src/adapters/backlog";
import { runExport } from "../src/commands/export";
import { buildGraph } from "../src/core/bundle";
import { parseConcept } from "../src/core/concept";
import { buildProjection } from "../src/core/projection";
import type { OutputContext } from "../src/output";
import { capture, fakeAdapter, makeTask } from "./helpers";

const PLAIN: OutputContext = { mode: "plain", color: false };

function fixture() {
  const graph = buildGraph([
    parseConcept("index.md", '---\ntype: Reference\ntitle: "Café ✓"\nokf_version: "0.1"\nunknown: kept\n---\n'),
    parseConcept(
      "stories/unicode.md",
      "---\ntype: ProducerExtension\ntitle: naïve\ntasks:\n  - TASK-1\n  - MISSING-9\n  - TASK-1\n---\nSee [one](../index.md) and [again](../index.md) and [gone](missing.md).\n",
    ),
  ]);
  const tasks = [makeTask("TASK-1", { title: "Ship café", labels: ["unicode"] })];
  return { graph, tasks };
}

describe("OKF projection core", () => {
  test("emits deterministic full records, duplicate ordinals, dangling references, and stable hashes", () => {
    const { graph, tasks } = fixture();
    const input = {
      graph,
      tasks,
      docsRoot: "docs",
      okfVersion: "0.1",
      exporterVersion: "0.1.0",
      gitCommit: "a".repeat(40),
      generatedAt: "2026-07-27T00:00:00.000Z",
    };
    const first = buildProjection(input);
    const second = buildProjection(input);
    expect(second.jsonl).toBe(first.jsonl);
    expect(first.jsonl).toBe(readFileSync(join(import.meta.dir, "fixtures/projection/v1.jsonl"), "utf8"));
    expect(first.jsonl.endsWith("\n")).toBe(true);

    const concepts = first.records.filter((record) => record.record === "concept");
    expect(concepts).toHaveLength(2);
    expect(concepts[0]?.frontmatter).toMatchObject({ title: "Café ✓", unknown: "kept" });
    expect(concepts[0]?.body).toBe("");
    expect(String(concepts[0]?.contentHash)).toMatch(/^sha256:[0-9a-f]{64}$/);

    const conceptEdges = first.records.filter((record) => record.record === "edge" && record.kind === "link");
    expect(conceptEdges.map((edge) => edge.ordinal)).toEqual([0, 1, 2]);
    expect(new Set(conceptEdges.map((edge) => edge.key)).size).toBe(3);
    expect(conceptEdges[2]).toMatchObject({ target: "missing.md", dangling: true, to: null });

    const taskEdges = first.records.filter((record) => record.record === "edge" && record.kind === "task");
    expect(taskEdges.map((edge) => [edge.target, edge.ordinal, edge.dangling])).toEqual([
      ["TASK-1", 0, false],
      ["MISSING-9", 0, true],
      ["TASK-1", 1, false],
    ]);
    expect(first.records.at(-1)).toMatchObject({
      record: "trailer",
      recordCount: first.records.length - 1,
      streamHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  test("emits task -> task dependency edges, dependent to prerequisite, dangling when unresolved (LCLI-476)", () => {
    // The fixture shape from the original finding: PGF-1 parent, PGF-2 prerequisite, PGF-3 dependent.
    // PGF-3 depends on PGF-2 and is PARENTED by PGF-1, so the two relationships are present on the
    // same task and must not be conflated — parenthood does not gate readiness, dependency does.
    const graph = buildGraph([
      parseConcept("index.md", '---\ntype: Reference\ntitle: Root\nokf_version: "0.1"\n---\n'),
    ]);
    const tasks = [
      makeTask("PGF-1", { title: "Parent" }),
      makeTask("PGF-2", { title: "Prerequisite" }),
      makeTask("PGF-3", { title: "Dependent", parentTaskId: "PGF-1", dependencies: ["PGF-2", "PGF-404"] }),
    ];
    const projection = buildProjection({
      graph,
      tasks,
      docsRoot: "docs",
      okfVersion: "0.1",
      exporterVersion: "0.1.0",
      gitCommit: null,
      generatedAt: null,
    });

    const taskKey = (id: string) =>
      projection.records.find((record) => record.record === "task" && record.id === id)?.key;
    const dependencyEdges = projection.records.filter(
      (record) => record.record === "edge" && record.kind === "dependency",
    );

    expect(dependencyEdges).toHaveLength(2);
    // from = the DEPENDENT, to = the PREREQUISITE: an outbound walk reaches what the task waits on.
    expect(dependencyEdges[0]).toMatchObject({
      from: taskKey("PGF-3"),
      to: taskKey("PGF-2"),
      target: "PGF-2",
      ordinal: 0,
      dangling: false,
      workspaceFromKind: "task",
      workspaceToKind: "task",
    });
    // An unresolvable prerequisite is DANGLING, never dropped — omitting it would make a blocked
    // task look ready, which is the precise failure this edge exists to prevent.
    expect(dependencyEdges[1]).toMatchObject({ target: "PGF-404", to: null, dangling: true });

    // Parenthood is carried on the task record and is NOT an edge, so it cannot be mistaken for
    // ordering by anything walking edges.
    const parented = projection.records.find((record) => record.record === "task" && record.id === "PGF-3");
    expect(parented).toMatchObject({ parentTaskId: "PGF-1", dependencies: ["PGF-2", "PGF-404"] });
    expect(dependencyEdges.some((edge) => edge.target === "PGF-1")).toBe(false);

    // A task with no declared prerequisites contributes no edges at all.
    expect(dependencyEdges.filter((edge) => edge.from === taskKey("PGF-2"))).toEqual([]);
  });

  test("no module hard-codes a projection schema version; every site reads the constant (LCLI-476)", () => {
    // Prevents the CLASS, not the instance. Two modules carried a literal "1.0" while the exporter
    // read a constant, and both were invisible until the version actually moved:
    //   - ladybug-lifecycle compared a cached generation against "1.0", so the first bump made every
    //     generation permanently incompatible and the reuse fast path missed silently, forever.
    //   - workspace-projection SYNTHESIZED a manifest announcing "1.0" while emitting records of the
    //     current shape — a contract stating a version it does not produce, which a tolerant reader
    //     accepts without complaint. Nothing failed when it was fixed, which is why this test exists.
    // A literal is fine in `projection.ts` itself: that is where the versions are DECLARED, and
    // READABLE_PROJECTION_SCHEMA_VERSIONS must name superseded versions explicitly by design.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".ts") && full !== join(SRC, "core", "projection.ts")) {
          readFileSync(full, "utf8")
            .split("\n")
            .forEach((line, index) => {
              if (/(?:projectionS|s)chemaVersion\s*(?::|!==|===)\s*"\d+\.\d+"/u.test(line)) {
                offenders.push(`${relative(SRC, full)}:${index + 1}: ${line.trim()}`);
              }
            });
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });

  test("generation time is excluded from the semantic stream hash", () => {
    const { graph, tasks } = fixture();
    const base = {
      graph,
      tasks,
      docsRoot: "docs",
      okfVersion: "0.1",
      exporterVersion: "0.1.0",
      gitCommit: null,
    };
    const a = buildProjection({ ...base, generatedAt: "2026-01-01T00:00:00.000Z" });
    const b = buildProjection({ ...base, generatedAt: "2026-02-01T00:00:00.000Z" });
    expect(a.records.at(-1)?.streamHash).toBe(b.records.at(-1)?.streamHash);
  });
});

describe("lore export command", () => {
  test("rejects an unsupported schema before bundle, Backlog, or Git reads", async () => {
    let backlogReads = 0;
    let gitReads = 0;
    const adapter = fakeAdapter([]);
    const wrapped = {
      ...adapter,
      async listTasks() {
        backlogReads++;
        return [];
      },
    } satisfies BacklogAdapter;
    await expect(
      runExport({
        root: "/definitely/missing",
        output: PLAIN,
        args: ["--schema-version", "2.0"],
        stdout: capture(),
        adapter: wrapped,
        resolveGitCommit: () => {
          gitReads++;
          return null;
        },
      }),
    ).rejects.toMatchObject({ type: "usage" });
    expect(backlogReads).toBe(0);
    expect(gitReads).toBe(0);
  });

  test("a tracker-none bundle exports successfully with an empty task projection, no adapter injected (LCLI-435)", async () => {
    const root = mkdtempSync(join(tmpdir(), "lore-export-tracker-none-"));
    try {
      mkdirSync(join(root, ".lore"), { recursive: true });
      writeFileSync(join(root, ".lore", "config.toml"), '[tracker]\nbackend = "none"\n');
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(join(root, "docs", "index.md"), '---\ntype: Reference\ntitle: Docs\nokf_version: "0.2"\n---\n');
      const stdout = capture();
      const code = await runExport({ root, output: PLAIN, args: [], stdout, resolveGitCommit: () => null });
      expect(code).toBe(0);
      const records = stdout
        .text()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
      expect(records.some((r) => r.record === "task")).toBe(false);
      expect(records.find((r) => r.record === "trailer")?.recordCount).toBe(records.length - 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
