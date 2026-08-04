import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
});
