import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPLORER_SNAPSHOT_SCHEMA_VERSION,
  type ExplorerSnapshot,
  parseExplorerSnapshot,
} from "../../src/core/explorer-contract";
import {
  assertExplorerQualificationFixture,
  type ExplorerQualificationFixture,
} from "../../src/core/explorer-qualification";

export function loadQualificationFixture(): ExplorerQualificationFixture {
  return assertExplorerQualificationFixture(
    JSON.parse(readFileSync(join(SUPPORT_DIRECTORY, "../fixtures/explorer/v1/large.json"), "utf8")),
  );
}

export function loadSmallExplorerFixture(): ExplorerSnapshot {
  return parseExplorerSnapshot(
    JSON.parse(readFileSync(join(SUPPORT_DIRECTORY, "../fixtures/explorer/v1.json"), "utf8")),
  );
}

export function buildLargeExplorerFixture(): ExplorerSnapshot {
  const fixture = loadQualificationFixture();
  const common = {
    repositoryScopeKey: digest("repository"),
    snapshotKey: digest(fixture.seed),
    bundleId: digest("bundle"),
    gitCommit: "d".repeat(40),
    exportDigest: digest("export"),
  };
  const concepts = Array.from({ length: fixture.records.concepts }, (_, index) => {
    const suffix = index.toString().padStart(5, "0");
    return {
      ...common,
      recordKey: digest(`concept:${suffix}`),
      sourcePath: `docs/large/concept-${suffix}.md`,
      kind: "concept" as const,
      conceptId: `large/concept-${suffix}`,
      conceptType: index % 2 === 0 ? "Spec" : "Reference",
      title: `Large fixture concept ${suffix}`,
      summary: `Deterministic qualification record ${suffix}`,
      status: index % 7 === 0 ? "draft" : null,
      tags: ["qualification", index % 2 === 0 ? "even" : "odd"],
      contentHash: digest(`content:${suffix}`),
      tokenEstimate: 20 + (index % 80),
    };
  });
  const tasks = Array.from({ length: fixture.records.tasks }, (_, index) => {
    const suffix = index.toString().padStart(5, "0");
    return {
      ...common,
      recordKey: digest(`task:${suffix}`),
      sourcePath: null,
      kind: "task" as const,
      taskId: `LARGE-${suffix}`,
      title: `Large fixture task ${suffix}`,
      summary: null,
      status: index % 3 === 0 ? "Done" : "To Do",
      labels: ["qualification"],
      priority: null,
      assignees: [],
      milestone: "fixture-v1",
      parentTaskId: null,
    };
  });
  const records = [...concepts, ...tasks].sort((a, b) => a.recordKey.localeCompare(b.recordKey, "en"));
  const authoredEdges = Array.from({ length: fixture.records.authoredEdges }, (_, index) => {
    const from = records[index % records.length];
    const to = records[(index * 17 + 1 + Math.floor(index / records.length)) % records.length];
    if (from === undefined || to === undefined) throw new Error("large fixture record missing");
    return {
      ...common,
      recordKey: digest(`edge:${index.toString().padStart(5, "0")}`),
      sourcePath: from.kind === "concept" ? from.sourcePath : null,
      kind: "authored-edge" as const,
      edgeKind: index % 11 === 0 ? "supersedes" : "link",
      fromRecordKey: from.recordKey,
      toRecordKey: to.recordKey,
      target: to.kind === "concept" ? to.conceptId : to.taskId,
      ordinal: index,
      dangling: false,
    };
  }).sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b), "en"));
  return parseExplorerSnapshot({
    schemaVersion: EXPLORER_SNAPSHOT_SCHEMA_VERSION,
    source: {
      ...common,
      docsRoot: "docs",
      sourceFingerprint: digest("source"),
      generatedAt: null,
    },
    facts: {
      repositories: [{ ...common, kind: "repository", docsRoot: "docs", displayName: "Large qualification fixture" }],
      concepts: concepts.sort((a, b) => a.recordKey.localeCompare(b.recordKey, "en")),
      tasks: tasks.sort((a, b) => a.recordKey.localeCompare(b.recordKey, "en")),
      authoredEdges,
    },
    health: {
      state: "ready",
      messageCode: null,
      counts: {
        repositories: 1,
        concepts: concepts.length,
        tasks: tasks.length,
        authoredEdges: authoredEdges.length,
        danglingEdges: 0,
        duplicateEdges: 0,
      },
      warnings: [],
    },
  });
}

export function emptyExplorerFixture(base = loadSmallExplorerFixture()): ExplorerSnapshot {
  return parseExplorerSnapshot({
    ...base,
    facts: { repositories: [], concepts: [], tasks: [], authoredEdges: [] },
    health: {
      state: "empty",
      messageCode: null,
      counts: { repositories: 0, concepts: 0, tasks: 0, authoredEdges: 0, danglingEdges: 0, duplicateEdges: 0 },
      warnings: [],
    },
  });
}

export function corruptExplorerFixture(base = loadSmallExplorerFixture()): ExplorerSnapshot {
  return parseExplorerSnapshot({
    ...base,
    health: { ...base.health, state: "corrupt", messageCode: "explorer.snapshot.corrupt" },
  });
}

export function staleExplorerFixture(base = loadSmallExplorerFixture()): ExplorerSnapshot {
  return parseExplorerSnapshot({
    ...base,
    health: { ...base.health, state: "stale", messageCode: "explorer.refresh.failed" },
  });
}

function digest(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function edgeSortKey(edge: {
  fromRecordKey: string;
  edgeKind: string;
  target: string;
  ordinal: number;
  recordKey: string;
}) {
  return [edge.fromRecordKey, edge.edgeKind, edge.target, String(edge.ordinal).padStart(16, "0"), edge.recordKey].join(
    "\0",
  );
}

const SUPPORT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
