import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LadybugProjectionSource } from "../src/core/ladybug-source";
import {
  buildRepositoryRetainedSnapshot,
  CHANGED_DEFAULT_LIMIT,
  compareRetainedSnapshots,
  findRetainedProvenance,
  parseRetainedSnapshot,
  type RetainedFact,
  type RetainedRepositoryProvenance,
  type RetainedSnapshot,
  SNAPSHOT_RETENTION_LIMIT,
} from "../src/core/snapshot";
import { deleteSnapshots, listSnapshots, loadSnapshot, retainSnapshot } from "../src/core/snapshot-store";

const D = (char: string) => `sha256:${char.repeat(64)}`;
const C = (char: string) => char.repeat(40);
const sharedFixture = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/snapshot/v1.json"), "utf8")) as {
  readonly schemaVersion: string;
  readonly from: unknown;
  readonly to: unknown;
};
type MutableFixture = {
  facts: Array<{
    provenance: { sourcePath: string | null; bundleId: string };
    value: { frontmatter: Record<string, unknown> };
  }>;
  counts: { concept: number };
};

describe("retained snapshot comparison and provenance", () => {
  test("shares one versioned canonical fixture across retained-history consumers", () => {
    const from = parseRetainedSnapshot(sharedFixture.from);
    const to = parseRetainedSnapshot(sharedFixture.to);
    expect(sharedFixture.schemaVersion).toBe("lore-retained-snapshot-fixture/1");
    expect(
      compareRetainedSnapshots(from, to).changes.map((change) => [change.change, change.recordKind, change.id]),
    ).toEqual([
      ["changed", "concept", "specs/history"],
      ["added", "edge", D("c")],
      ["added", "edge", D("d")],
      ["added", "task", "LCLI-283.3.4"],
    ]);
    expect(compareRetainedSnapshots(from, to, { repositories: ["beta"] }).changes.map((change) => change.id)).toEqual([
      "LCLI-283.3.4",
    ]);
    expect(findRetainedProvenance(to, { kind: "concept", id: "specs/history" }).fact.provenance.sourcePath).toBe(
      "docs/specs/retained-history.md",
    );
    expect(() => findRetainedProvenance(to, { kind: "concept", id: "specs/history", repositories: ["beta"] })).toThrow(
      "is not in",
    );
  });

  test("classifies path renames, authored relationship deltas, and exact provenance deterministically", () => {
    const before = repositorySnapshot(D("1"), C("1"), [conceptFact("specs/a", "docs/specs/a.md", D("a"))]);
    const after = repositorySnapshot(D("2"), C("2"), [
      conceptFact("specs/a", "docs/specs/renamed.md", D("a")),
      edgeFact(D("e"), D("a"), D("b"), "supersedes", 0),
    ]);
    const result = compareRetainedSnapshots(before, after);
    expect(result.schemaVersion).toBe("lore-changed-result/1");
    expect(result.limits.result).toBe(CHANGED_DEFAULT_LIMIT);
    expect(result.complete).toBe(true);
    expect(result.changes.map((change) => [change.change, change.recordKind, change.fieldsChanged])).toEqual([
      ["changed", "concept", ["path"]],
      ["added", "edge", []],
    ]);
    expect(result.changes[1]?.relationshipDelta).toBe("added");
    expect(result.changes[0]?.to?.provenance).toMatchObject({
      gitCommit: C("2"),
      exportDigest: D("2"),
      recordKey: D("a"),
      sourcePath: "docs/specs/renamed.md",
    });
  });

  test("does not infer renames across changed ids and preserves duplicate links by record key", () => {
    const before = repositorySnapshot(D("1"), C("1"), [conceptFact("old", "docs/old.md", D("a"))]);
    const after = repositorySnapshot(D("2"), C("2"), [
      conceptFact("new", "docs/new.md", D("b")),
      edgeFact(D("c"), D("b"), D("d"), "link", 0),
      edgeFact(D("d"), D("b"), D("d"), "link", 1),
    ]);
    const result = compareRetainedSnapshots(before, after);
    expect(result.changes.map((change) => [change.change, change.recordKey])).toEqual([
      ["removed", D("a")],
      ["added", D("b")],
      ["added", D("c")],
      ["added", D("d")],
    ]);
  });

  test("applies result truncation while retaining complete scan accounting", () => {
    const facts = Array.from({ length: 4 }, (_, index) =>
      conceptFact(`specs/${index}`, `docs/${index}.md`, D(String(index + 1))),
    );
    const result = compareRetainedSnapshots(
      repositorySnapshot(D("a"), C("1"), []),
      repositorySnapshot(D("b"), C("2"), facts),
      { limit: 2 },
    );
    expect(result).toMatchObject({ shown: 2, totalChanges: 4, truncated: true, complete: true });
  });

  test("looks up exact concept and edge provenance and rejects ambiguous source identities", () => {
    const snapshot = repositorySnapshot(D("1"), C("1"), [
      conceptFact("specs/a", "docs/a.md", D("a")),
      edgeFact(D("b"), D("a"), D("c"), "link", 0, "duplicate-source"),
      edgeFact(D("c"), D("a"), D("c"), "link", 1, "duplicate-source"),
    ]);
    expect(findRetainedProvenance(snapshot, { kind: "concept", id: "specs/a" }).fact.provenance.sourcePath).toBe(
      "docs/a.md",
    );
    expect(findRetainedProvenance(snapshot, { kind: "edge", id: D("b") }).fact.recordKey).toBe(D("b"));
    expect(() => findRetainedProvenance(snapshot, { kind: "edge", id: "duplicate-source" })).toThrow("ambiguous");
  });

  test("rejects mixed, duplicate, unsafe, and sensitive retained evidence", () => {
    const unsafePath = structuredClone(sharedFixture.to) as MutableFixture;
    firstFixtureFact(unsafePath).provenance.sourcePath = "/private/repository/docs/spec.md";
    expect(() => parseRetainedSnapshot(unsafePath)).toThrow("malformed or unsupported");

    const sensitive = structuredClone(sharedFixture.to) as MutableFixture;
    firstFixtureFact(sensitive).value.frontmatter.databasePassword = "do-not-retain";
    expect(() => parseRetainedSnapshot(sensitive)).toThrow("malformed or unsupported");

    const mixed = structuredClone(sharedFixture.to) as MutableFixture;
    firstFixtureFact(mixed).provenance.bundleId = D("0");
    expect(() => parseRetainedSnapshot(mixed)).toThrow("no exact repository evidence");

    const duplicate = structuredClone(sharedFixture.to) as MutableFixture;
    duplicate.facts.push(structuredClone(firstFixtureFact(duplicate)));
    duplicate.counts.concept += 1;
    expect(() => parseRetainedSnapshot(duplicate)).toThrow("duplicate retained record key");
  });

  function firstFixtureFact(value: MutableFixture): MutableFixture["facts"][number] {
    const fact = value.facts[0];
    if (fact === undefined) throw new Error("shared retained fixture needs a fact");
    return fact;
  }

  test("omits sensitive authored frontmatter keys before retention", () => {
    const source = {
      repositoryScopeKey: D("f"),
      snapshotKey: D("1"),
      commitKey: D("d"),
      exportDigest: D("1"),
      manifest: { bundle: { id: D("e"), gitCommit: C("1") } },
      concepts: [
        {
          key: D("a"),
          id: "specs/privacy",
          path: "docs/specs/privacy.md",
          type: "Spec",
          frontmatter: { title: "Privacy", databasePassword: "secret", nested: { apiKey: "secret", safe: true } },
          contentHash: D("c"),
          tokenEstimate: 10,
        },
      ],
      tasks: [],
      authoredEdges: [],
    } as unknown as LadybugProjectionSource;
    const bytes = JSON.stringify(buildRepositoryRetainedSnapshot(source));
    expect(bytes).not.toContain("databasePassword");
    expect(bytes).not.toContain("apiKey");
    expect(bytes).toContain('"safe":true');
  });
});

describe("explicit retained snapshot store", () => {
  test("retains idempotently, resolves commit selectors, and deletes only exact scope evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-snapshot-"));
    const first = repositorySnapshot(D("1"), C("1"), [conceptFact("a", "docs/a.md", D("a"))]);
    const second = repositorySnapshot(D("2"), C("2"), [conceptFact("a", "docs/a.md", D("a"))]);
    expect(retainSnapshot(root, first).action).toBe("retained");
    expect(retainSnapshot(root, first).action).toBe("unchanged");
    expect(retainSnapshot(root, second).retained).toBe(2);
    const scope = { kind: "repository" as const, scopeKey: D("f") };
    expect(listSnapshots(root, scope).map((snapshot) => snapshot.snapshotKey)).toEqual([D("1"), D("2")]);
    expect(loadSnapshot(root, scope, C("2")).snapshotKey).toBe(D("2"));
    expect(deleteSnapshots(root, scope, { snapshotKey: D("1") }).deleted).toEqual([D("1")]);
    expect(listSnapshots(root, scope).map((snapshot) => snapshot.snapshotKey)).toEqual([D("2")]);
    expect(deleteSnapshots(root, scope, { all: true }).deleted).toEqual([D("2")]);
    expect(listSnapshots(root, scope)).toEqual([]);
  });

  test("never evicts silently at the per-scope retention cap", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-snapshot-cap-"));
    for (let index = 0; index < SNAPSHOT_RETENTION_LIMIT; index += 1) {
      retainSnapshot(root, repositorySnapshot(digestFor(index), C("1"), []));
    }
    expect(() => retainSnapshot(root, repositorySnapshot(D("f"), C("2"), []))).toThrow("limit 16 reached");
    expect(listSnapshots(root, { kind: "repository", scopeKey: D("f") })).toHaveLength(SNAPSHOT_RETENTION_LIMIT);
  });

  test.skipIf(process.platform === "win32")("refuses a symlinked retained-snapshot cache ancestor", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-snapshot-link-"));
    const outside = mkdtempSync(join(tmpdir(), "lore-snapshot-outside-"));
    mkdirSync(join(root, ".lore", "cache"), { recursive: true });
    symlinkSync(outside, join(root, ".lore", "cache", "snapshots"));
    expect(() => retainSnapshot(root, repositorySnapshot(D("1"), C("1"), []))).toThrow("symlink");
  });

  test("rejects ambiguous commit selectors rather than choosing by order", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-snapshot-ambiguous-"));
    retainSnapshot(root, repositorySnapshot(D("1"), C("1"), []));
    retainSnapshot(root, repositorySnapshot(D("2"), C("1"), []));
    expect(() => loadSnapshot(root, { kind: "repository", scopeKey: D("f") }, C("1"))).toThrow("ambiguous");
  });
});

function repositorySnapshot(snapshotKey: string, commit: string, facts: readonly RetainedFact[]): RetainedSnapshot {
  const repository = repositoryProvenance(commit, snapshotKey);
  return parseRetainedSnapshot({
    schemaVersion: "lore-retained-snapshot/1",
    scopeKind: "repository",
    scopeKey: D("f"),
    workspaceId: null,
    snapshotKey,
    repositories: [repository],
    counts: {
      concept: facts.filter((fact) => fact.kind === "concept").length,
      task: facts.filter((fact) => fact.kind === "task").length,
      edge: facts.filter((fact) => fact.kind === "edge").length,
    },
    facts: facts.map((fact) => ({ ...fact, provenance: { ...fact.provenance, ...repository } })),
  });
}

function repositoryProvenance(commit: string, exportDigest: string): RetainedRepositoryProvenance {
  return {
    memberId: null,
    repositoryKey: D("f"),
    repositoryScopeKey: D("f"),
    bundleKey: D("e"),
    bundleId: D("e"),
    commitKey: D("d"),
    gitCommit: commit,
    exportKey: exportDigest,
    exportDigest,
  };
}

function conceptFact(id: string, path: string, recordKey: string): RetainedFact {
  return {
    kind: "concept",
    id,
    recordKey,
    provenance: {
      ...repositoryProvenance(C("0"), D("0")),
      recordKey,
      sourceRecordKey: recordKey,
      sourceKey: null,
      sourcePath: path,
    },
    value: { id, path, type: "Spec", contentHash: D("c"), frontmatter: { title: id }, tokenEstimate: 10 },
  };
}

function edgeFact(
  recordKey: string,
  from: string,
  to: string,
  kind: string,
  ordinal: number,
  sourceRecordKey = recordKey,
): RetainedFact {
  return {
    kind: "edge",
    id: recordKey,
    recordKey,
    provenance: {
      ...repositoryProvenance(C("0"), D("0")),
      recordKey,
      sourceRecordKey,
      sourceKey: null,
      sourcePath: "docs/source.md",
    },
    value: {
      from,
      to,
      kind,
      target: "target",
      ordinal,
      dangling: false,
      workspaceFromKind: null,
      workspaceToKind: null,
      workspaceLinkKind: null,
    },
  };
}

function digestFor(index: number): string {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}
