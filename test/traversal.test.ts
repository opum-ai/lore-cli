import { describe, expect, test } from "bun:test";
import { runImpact } from "../src/commands/impact";
import { runPath } from "../src/commands/path";
import type { BundleGraph } from "../src/core/bundle";
import {
  findImpact,
  findPaths,
  MAX_TRAVERSAL_EDGE_VISITS,
  type RepositoryRecordProvenance,
  type TraversalEdge,
  type TraversalEndpoint,
  type TraversalEndpointKind,
  type TraversalSnapshot,
} from "../src/core/traversal";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

const endpoint = (kind: TraversalEndpointKind, id: string): TraversalEndpoint => ({
  kind,
  id,
  recordKey: `${kind}:${id}`,
  provenance: {
    repositoryScopeKey: "repo",
    bundleId: "bundle",
    gitCommit: null,
    exportDigest: "sha256:export",
    recordKind: kind,
    recordKey: `${kind}:${id}`,
    sourceRecordKey: `${kind}:${id}`,
    sourcePath: kind === "concept" ? `docs/${id}.md` : null,
    sourceId: id,
  } satisfies RepositoryRecordProvenance,
});

function fixture(): TraversalSnapshot {
  const endpoints = [
    endpoint("concept", "a"),
    endpoint("concept", "b"),
    endpoint("task", "T-1"),
    endpoint("concept", "c"),
  ];
  const byKey = new Map(endpoints.map((value) => [`${value.kind}\0${value.id}`, value]));
  const edge = (from: TraversalEndpoint, to: TraversalEndpoint, kind: string, ordinal: number): TraversalEdge => ({
    recordKey: `edge:${ordinal}`,
    from: { kind: from.kind, id: from.id },
    to: { kind: to.kind, id: to.id },
    kind,
    sourceKind: kind === "implements" ? "task" : kind,
    target: to.id,
    ordinal,
    dangling: false,
    provenance: edgeProvenance(from, to, `edge:${ordinal}`),
  });
  return {
    endpoints: byKey,
    edges: [
      edge(endpoints[0] as TraversalEndpoint, endpoints[1] as TraversalEndpoint, "link", 0),
      edge(endpoints[0] as TraversalEndpoint, endpoints[2] as TraversalEndpoint, "implements", 1),
      edge(endpoints[1] as TraversalEndpoint, endpoints[3] as TraversalEndpoint, "link", 2),
      edge(endpoints[2] as TraversalEndpoint, endpoints[3] as TraversalEndpoint, "depends_on", 3),
      edge(endpoints[3] as TraversalEndpoint, endpoints[0] as TraversalEndpoint, "link", 4),
    ],
  };
}

describe("bounded traversal core", () => {
  test("returns deterministic shortest simple typed paths with exact evidence", () => {
    const result = findPaths(fixture(), {
      from: { kind: "concept", id: "a" },
      to: { kind: "concept", id: "c" },
      direction: "outbound",
      maxDepth: 4,
      limit: 20,
    });
    expect(result.paths.map((path) => path.edges.map((step) => step.edge.kind))).toEqual([
      ["link", "link"],
      ["implements", "depends_on"],
    ]);
    expect(result.paths[1]?.endpoints.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      "concept:a",
      "task:T-1",
      "concept:c",
    ]);
    expect(result.paths[1]?.edges[0]?.edge.provenance).toMatchObject({
      recordKind: "authored-edge",
      sourceRecordKey: "edge:1",
      from: { sourceId: "a" },
      to: { sourceId: "T-1" },
    });
    expect(result.complete).toBe(true);
    expect(result.limits.maxEdgeVisits).toBe(MAX_TRAVERSAL_EDGE_VISITS);
  });

  test("honors direction, edge allowlists, depth bounds, and result truncation", () => {
    const inbound = findPaths(fixture(), {
      from: { kind: "concept", id: "c" },
      to: { kind: "concept", id: "a" },
      direction: "inbound",
      edgeKinds: ["link"],
      maxDepth: 2,
      limit: 1,
    });
    expect(inbound.paths[0]?.edges.map((step) => step.direction)).toEqual(["inbound", "inbound"]);
    expect(inbound.edgeKinds).toEqual(["link"]);
    expect(inbound.complete).toBe(true);
    const bounded = findImpact(fixture(), {
      root: { kind: "concept", id: "a" },
      direction: "outbound",
      maxDepth: 1,
      limit: 20,
    });
    expect(bounded.depthBoundReached).toBe(true);
    const truncated = findPaths(fixture(), {
      from: { kind: "concept", id: "a" },
      to: { kind: "concept", id: "c" },
      direction: "outbound",
      limit: 1,
    });
    expect(truncated.shown).toBe(1);
    expect(truncated.truncated).toBe(true);
    expect(truncated.complete).toBe(false);
  });

  test("stops at the hard 10,000 edge-visit budget", () => {
    const root = endpoint("concept", "root");
    const target = endpoint("concept", "target");
    const endpoints = new Map<string, TraversalEndpoint>([
      ["concept\0root", root],
      ["concept\0target", target],
    ]);
    const edges: TraversalEdge[] = [];
    for (let index = 0; index < MAX_TRAVERSAL_EDGE_VISITS; index++) {
      const leaf = endpoint("concept", `leaf-${index}`);
      endpoints.set(`concept\0${leaf.id}`, leaf);
      edges.push({
        recordKey: `edge:${index}`,
        from: { kind: "concept", id: "root" },
        to: { kind: "concept", id: leaf.id },
        kind: "link",
        sourceKind: "link",
        target: leaf.id,
        ordinal: index,
        dangling: false,
        provenance: edgeProvenance(root, leaf, `edge:${index}`),
      });
    }
    edges.push({
      recordKey: "edge:target",
      from: { kind: "concept", id: "root" },
      to: { kind: "concept", id: "target" },
      kind: "link",
      sourceKind: "link",
      target: "target",
      ordinal: MAX_TRAVERSAL_EDGE_VISITS,
      dangling: false,
      provenance: edgeProvenance(root, target, "edge:target"),
    });
    const result = findPaths(
      { endpoints, edges },
      {
        from: { kind: "concept", id: "root" },
        to: { kind: "concept", id: "target" },
        direction: "outbound",
      },
    );
    expect(result.paths).toEqual([]);
    expect(result.edgeVisits).toBe(MAX_TRAVERSAL_EDGE_VISITS);
    expect(result.truncated).toBe(true);
    expect(result.complete).toBe(false);
  });

  test("impact keeps one canonical shortest chain and labels direct versus transitive", () => {
    const result = findImpact(fixture(), {
      root: { kind: "concept", id: "a" },
      direction: "outbound",
      maxDepth: 2,
      limit: 20,
    });
    expect(result.impacts.map(({ endpoint, depth, relationship }) => [endpoint.id, depth, relationship])).toEqual([
      ["b", 1, "direct"],
      ["T-1", 1, "direct"],
      ["c", 2, "transitive"],
    ]);
  });

  test("preserves duplicate authored evidence, ignores dangling targets, and reports no path deterministically", () => {
    const base = fixture();
    const first = base.edges[0] as TraversalEdge;
    const from = base.endpoints.get("concept\0a") as TraversalEndpoint;
    const to = base.endpoints.get("concept\0b") as TraversalEndpoint;
    const duplicate: TraversalEdge = {
      ...first,
      recordKey: "edge:duplicate",
      ordinal: 99,
      provenance: edgeProvenance(from, to, "edge:duplicate"),
    };
    const dangling: TraversalEdge = {
      recordKey: "edge:dangling",
      from: { kind: "concept", id: "a" },
      to: null,
      kind: "link",
      sourceKind: "link",
      target: "missing",
      ordinal: 100,
      dangling: true,
      provenance: {
        recordKind: "authored-edge",
        recordKey: "edge:dangling",
        sourceRecordKey: "edge:dangling",
        from: from.provenance,
        to: null,
      },
    };
    const snapshot = { ...base, edges: [...base.edges, duplicate, dangling] };
    const paths = findPaths(snapshot, {
      from: { kind: "concept", id: "a" },
      to: { kind: "concept", id: "b" },
      direction: "outbound",
      edgeKinds: ["link"],
    });
    expect(paths.paths.map((path) => path.edges[0]?.edge.recordKey)).toEqual(["edge:0", "edge:duplicate"]);
    const none = findPaths(snapshot, {
      from: { kind: "concept", id: "c" },
      to: { kind: "task", id: "T-1" },
      direction: "outbound",
      edgeKinds: ["link"],
    });
    expect(none).toMatchObject({ paths: [], shown: 0, truncated: false, complete: true });
  });

  test("rejects missing typed endpoints and bounds beyond the public hard caps", () => {
    expect(() =>
      findImpact(fixture(), {
        root: { kind: "task", id: "missing" },
        direction: "either",
      }),
    ).toThrow('task "missing" is not in the selected traversal scope');
    expect(() =>
      findPaths(fixture(), {
        from: { kind: "concept", id: "a" },
        to: { kind: "concept", id: "b" },
        direction: "outbound",
        maxDepth: 17,
      }),
    ).toThrow("maximum depth must be between 0 and 16");
  });
});

function edgeProvenance(from: TraversalEndpoint, to: TraversalEndpoint, recordKey: string) {
  return {
    recordKind: "authored-edge" as const,
    recordKey,
    sourceRecordKey: recordKey,
    from: from.provenance,
    to: to.provenance,
  };
}

describe("path and impact commands", () => {
  const graph: BundleGraph = {
    state: { okfVersion: "0.2", source: "declared" },
    concepts: new Map(),
    edges: [],
    tokenEstimate: () => 0,
  };
  const retrieval = async () => ({
    graph,
    traversal: fixture(),
    backend: "reference" as const,
  });

  test("path emits the additive JSON envelope with bounds and exact chains", async () => {
    const stdout = capture();
    await expect(
      runPath({
        root: ".",
        output: JSON_CTX,
        stdout,
        args: ["a", "T-1", "--from-kind", "concept", "--to-kind", "task", "--direction", "outbound"],
        retrieval,
      }),
    ).resolves.toBe(0);
    const envelope = JSON.parse(stdout.text());
    expect(envelope.kind).toBe("path.result");
    expect(envelope.data).toMatchObject({
      schemaVersion: "lore-path-result/1",
      shown: 1,
      complete: true,
    });
  });

  test("impact emits direct/transitive evidence in stable plain text", async () => {
    const stdout = capture();
    await runImpact({
      root: ".",
      output: PLAIN_CTX,
      stdout,
      args: ["a", "--kind", "concept", "--direction", "outbound", "--edge", "link"],
      retrieval,
    });
    expect(stdout.text()).toContain("concept:b  direct  depth 1");
    expect(stdout.text()).toContain("concept:c  transitive  depth 2");
  });

  test("plain evidence renders inbound authored orientation without reversing it", async () => {
    const stdout = capture();
    await runImpact({
      root: ".",
      output: PLAIN_CTX,
      stdout,
      args: ["c", "--kind", "concept", "--direction", "inbound", "--edge", "link"],
      retrieval,
    });
    expect(stdout.text()).toContain("via c <-link- b");
  });

  test("requires explicit endpoint kinds and direction and rejects unknown edge kinds", async () => {
    await expect(
      runImpact({
        root: ".",
        output: JSON_CTX,
        args: ["a", "--kind", "concept"],
        retrieval,
      }),
    ).rejects.toThrow("--direction is required");
    await expect(
      runImpact({
        root: ".",
        output: JSON_CTX,
        args: ["a", "--kind", "concept", "--direction", "outbound", "--edge", "invented"],
        retrieval,
      }),
    ).rejects.toThrow('unknown authored edge kind "invented"');
  });
});
