import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { type BundleGraph, buildGraph } from "../src/core/bundle";
import type { Concept } from "../src/core/concept";
import type { ContextExport } from "../src/core/context";
import type { GraphExport } from "../src/core/graph";
import {
  EXPECTED_LADYBUG_STORAGE_VERSION,
  EXPECTED_LADYBUG_VERSION,
  type LadybugNativeLoader,
} from "../src/core/ladybug-native";
import { type LadybugProjectionSource, prepareLadybugProjectionSource } from "../src/core/ladybug-source";
import { buildProjection } from "../src/core/projection";
import type { QueryResult } from "../src/core/query";
import type { RetrievalGraphLoader } from "../src/core/retrieval";
import { loadWorkspaceRetrievalGraph } from "../src/core/workspace-retrieval";
import { loadWorkspaceProjection } from "../src/core/workspace-source";
import { WarningCollector } from "../src/errors";
import { capture, makeTask } from "./helpers";

const nativeDescribe = process.platform === "win32" ? describe.skip : describe;
let root: string;
let manifestPath: string;
let sources: Map<string, LadybugProjectionSource>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-workspace-retrieval-"));
  mkdirSync(join(root, "members/alpha"), { recursive: true });
  mkdirSync(join(root, "members/beta"), { recursive: true });
  manifestPath = join(root, "workspace.json");
  writeManifest();
  sources = new Map([
    [
      "alpha",
      source("alpha", [
        concept("shared", "Alpha shared", "alpha evidence"),
        concept("alpha-only", "Alpha", "alpha only"),
      ]),
    ],
    [
      "beta",
      source("beta", [concept("shared", "Beta shared", "beta evidence"), concept("beta-only", "Beta", "beta only")]),
    ],
  ]);
});

afterEach(() => {
  makeWritable(root);
  rmSync(root, { recursive: true, force: true });
});

describe("workspace source and reference retrieval", () => {
  test("namespaces duplicate ids and carries complete locator-free provenance", async () => {
    const loaded = await candidate();
    expect([...loaded.projection.graph.concepts.keys()]).toEqual([
      "alpha::alpha-only",
      "alpha::shared",
      "beta::beta-only",
      "beta::shared",
    ]);
    const provenance = loaded.projection.provenanceById.get("alpha::shared");
    expect(provenance).toMatchObject({
      memberId: "alpha",
      sourceId: "shared",
      sourcePath: "docs/shared.md",
      recordKind: "concept",
      gitCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(JSON.stringify(provenance)).not.toContain(join(root, "members"));
    expect(loaded.projection.links.find((link) => link.linkId === "alpha-to-beta")).toMatchObject({
      linkId: "alpha-to-beta",
      kind: "depends_on",
      from: { memberId: "alpha", sourceId: "shared" },
      to: { memberId: "beta", sourceId: "shared" },
    });
  });

  test("repository subsets are canonical, isolated, and reject unknown or duplicate members", async () => {
    const graph = await loadWorkspaceRetrievalGraph({
      root,
      selection: { manifestPath, memberIds: ["beta"] },
      policy: "reference",
      sourceOptions: sourceOptions(),
    });
    expect([...graph.graph.concepts.keys()]).toEqual(["beta::beta-only", "beta::shared"]);
    expect(graph.workspace?.scope.repositories.map((repository) => repository.memberId)).toEqual(["beta"]);
    expect(graph.workspace?.links).toEqual([]);
    const reversed = await loadWorkspaceRetrievalGraph({
      root,
      selection: { manifestPath, memberIds: ["beta", "alpha"] },
      policy: "reference",
      sourceOptions: sourceOptions(),
    });
    expect(reversed.workspace?.scope.repositories.map((repository) => repository.memberId)).toEqual(["alpha", "beta"]);
    await expect(
      loadWorkspaceRetrievalGraph({
        root,
        selection: { manifestPath, memberIds: ["missing"] },
        policy: "reference",
        sourceOptions: sourceOptions(),
      }),
    ).rejects.toThrow("unknown workspace member missing");
  });

  test("unknown members fail as validation before reference or failed-native retrieval for every graph command", async () => {
    await expectUnknownMemberValidation(commandLoader("reference"));

    let nativeLoads = 0;
    const fallbackLoader = commandLoader("auto", {
      platform: "darwin",
      loadNativeDriver: async () => {
        nativeLoads += 1;
        throw new Error("private native loader detail: lbugjs.node was not found");
      },
    });
    const fallback = await invoke(fallbackLoader, ["graph", "--workspace", manifestPath, "--json"]);
    expect(fallback.code).toBe(0);
    expect(nativeLoads).toBeGreaterThan(0);

    const loadsAfterFallback = nativeLoads;
    await expectUnknownMemberValidation(fallbackLoader);
    expect(nativeLoads).toBe(loadsAfterFallback);
  });

  test("unknown members are rejected before a failing single workspace member is loaded", async () => {
    const singleManifestPath = join(root, "single-workspace.json");
    writeFileSync(
      singleManifestPath,
      `${JSON.stringify({
        schemaVersion: "lore-workspace-manifest/1",
        workspaceId: "single",
        members: [
          {
            memberId: "solo",
            locator: "members/alpha",
            displayName: "Solo",
            expectedRef: "refs/heads/main",
          },
        ],
        links: [],
      })}\n`,
    );
    let memberLoads = 0;
    let nativeLoads = 0;
    const loader: RetrievalGraphLoader = (options) => {
      if (options.workspace === undefined) throw new Error("workspace selection missing");
      return loadWorkspaceRetrievalGraph({
        root: options.root,
        selection: options.workspace,
        policy: "auto",
        platform: "darwin",
        loadNativeDriver: async () => {
          nativeLoads += 1;
          throw new Error("native loader must not run before workspace validation");
        },
        sourceOptions: {
          resolveGitRef: () => "refs/heads/main",
          loadMemberSource: async () => {
            memberLoads += 1;
            throw new Error("single-member source is not initialized");
          },
        },
      });
    };

    await expectUnknownMemberValidation(loader, singleManifestPath, "bogus-member");
    expect(memberLoads).toBe(0);
    expect(nativeLoads).toBe(0);

    const validMember = await invoke(loader, [
      "graph",
      "--workspace",
      singleManifestPath,
      "--repository",
      "solo",
      "--json",
    ]);
    expect(validMember.code).toBe(6);
    expect(JSON.parse(validMember.stderr)).toMatchObject({
      error_type: "validation",
      message: "workspace member solo could not be validated",
    });
    expect(memberLoads).toBe(2);
    expect(nativeLoads).toBe(0);
  });

  test("an explicitly selected manifest cannot return evidence from another workspace", async () => {
    const isolatedManifestPath = join(root, "isolated-workspace.json");
    const manifest = JSON.parse(await Bun.file(manifestPath).text()) as {
      workspaceId: string;
      members: Array<{ memberId: string }>;
      links: unknown[];
    };
    manifest.workspaceId = "isolated";
    manifest.members = manifest.members.filter((member) => member.memberId === "alpha");
    manifest.links = [];
    writeFileSync(isolatedManifestPath, `${JSON.stringify(manifest)}\n`);

    const original = await candidate();
    const isolated = await loadWorkspaceRetrievalGraph({
      root,
      selection: { manifestPath: isolatedManifestPath, memberIds: [] },
      policy: "reference",
      sourceOptions: sourceOptions(),
    });
    expect([...isolated.graph.concepts.keys()]).toEqual(["alpha::alpha-only", "alpha::shared"]);
    expect(isolated.workspace?.scope.workspaceId).toBe("isolated");
    expect(isolated.workspace?.scope.workspaceKey).not.toBe(original.projection.scope.workspaceKey);
  });

  test("missing explicit endpoints and expected-ref mismatches reject the complete candidate", async () => {
    sources.set("beta", source("beta", [concept("beta-only", "Beta", "beta only")]));
    await expect(candidate()).rejects.toThrow("names an endpoint absent");
    await expect(
      loadWorkspaceProjection({
        root,
        manifestPath,
        resolveGitRef: (memberRoot) => (memberRoot.endsWith("alpha") ? "refs/heads/wrong" : "refs/heads/main"),
        loadMemberSource: sourceOptions().loadMemberSource,
      }),
    ).rejects.toThrow("expected refs/heads/main");
  });

  test("failed indexed attempts do not duplicate warnings and diagnostics redact member locators", async () => {
    const warnings = new WarningCollector();
    let attempts = 0;
    const graph = await loadWorkspaceRetrievalGraph({
      root,
      selection: { manifestPath, memberIds: [] },
      warnings,
      loadNativeDriver: async () => {
        throw new Error("native failure");
      },
      sourceOptions: {
        resolveGitRef: () => "refs/heads/main",
        loadMemberSource: async ({ memberId, warnings: memberWarnings }) => {
          memberWarnings.add(`attempt ${++attempts}`);
          return sources.get(memberId) as LadybugProjectionSource;
        },
      },
    });
    expect(graph.backend).toBe("reference");
    expect(warnings.count).toBe(3);
    expect(warnings.list()).toContain(
      process.platform === "win32"
        ? "native indexed workspace retrieval is unsupported on this platform; using the in-memory reference backend"
        : "native indexed workspace retrieval failed; using the in-memory reference backend",
    );

    const privateLocator = join(root, "private-location");
    const manifest = JSON.parse(await Bun.file(manifestPath).text()) as { members: Array<{ locator: string }> };
    const firstMember = manifest.members[0];
    if (firstMember === undefined) throw new Error("fixture manifest has no first member");
    firstMember.locator = privateLocator;
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const failed = await invoke(commandLoader("reference"), ["graph", "--workspace", manifestPath, "--json"]);
    expect(failed.code).toBe(3);
    expect(failed.stderr).not.toContain(privateLocator);
  });

  test("graph, query, and context expose workspace scope and per-result provenance", async () => {
    const loader = commandLoader("reference");
    const graph = await invoke(loader, ["graph", "--workspace", manifestPath, "--json"]);
    expect(graph.code).toBe(0);
    const graphData = envelope<GraphExport>(graph.stdout).data;
    expect(graphData.workspace?.workspaceId).toBe("fixture");
    expect(graphData.nodes[0]?.provenance?.repositoryKey).toMatch(/^sha256:/u);
    expect(graphData.workspaceLinks?.find((link) => link.linkId === "alpha-to-beta")?.kind).toBe("depends_on");

    const path = await invoke(loader, [
      "path",
      "alpha::shared",
      "beta::shared",
      "--from-kind",
      "concept",
      "--to-kind",
      "concept",
      "--direction",
      "outbound",
      "--edge",
      "depends_on",
      "--workspace",
      manifestPath,
      "--json",
    ]);
    const pathData = envelope<{
      paths: Array<{ edges: Array<{ edge: { kind: string; provenance: { sourceRecordKey: string } } }> }>;
      workspace: { workspaceId: string };
    }>(path.stdout).data;
    expect(pathData.paths[0]?.edges[0]?.edge.kind).toBe("depends_on");
    expect(pathData.paths[0]?.edges[0]?.edge.provenance.sourceRecordKey).toBe("alpha-to-beta");
    expect(pathData.workspace.workspaceId).toBe("fixture");

    const query = await invoke(loader, [
      "query",
      "evidence",
      "--workspace",
      manifestPath,
      "--repository",
      "beta",
      "--json",
    ]);
    const queryData = envelope<QueryResult>(query.stdout).data;
    expect(queryData.hits.map((hit) => hit.id)).toEqual(["beta::shared"]);
    expect(queryData.hits[0]?.provenance?.memberId).toBe("beta");

    const bounded = await invoke(loader, [
      "query",
      "--type",
      "Reference",
      "--limit",
      "2",
      "--workspace",
      manifestPath,
      "--json",
    ]);
    const boundedData = envelope<QueryResult>(bounded.stdout).data;
    expect(boundedData.hits.map((hit) => hit.id)).toEqual(["alpha::alpha-only", "alpha::shared"]);
    expect(boundedData).toMatchObject({ total: 4, shown: 2, truncated: true });

    const context = await invoke(loader, [
      "context",
      "alpha::shared",
      "--workspace",
      manifestPath,
      "--depth",
      "1",
      "--json",
    ]);
    const contextData = envelope<ContextExport>(context.stdout).data;
    expect(contextData.target.provenance?.memberId).toBe("alpha");
    expect(contextData.neighbors.map((neighbor) => neighbor.id)).toContain("beta::shared");
  });

  test("workspace flags remain explicit and qualified ids fail loud", async () => {
    const loader = commandLoader("reference");
    expect((await invoke(loader, ["query", "x", "--repository", "alpha", "--json"])).code).toBe(2);
    expect((await invoke(loader, ["context", "shared", "--workspace", manifestPath, "--json"])).code).toBe(2);
    expect(
      (
        await invoke(loader, [
          "graph",
          "--workspace",
          manifestPath,
          "--repository",
          "alpha",
          "--repository",
          "alpha",
          "--json",
        ])
      ).code,
    ).toBe(2);
  });

  test("Windows policy falls back before loading the native addon", async () => {
    let loaded = false;
    const warnings = new WarningCollector();
    const graph = await loadWorkspaceRetrievalGraph({
      root,
      selection: { manifestPath, memberIds: [] },
      platform: "win32",
      warnings,
      loadNativeDriver: async () => {
        loaded = true;
        throw new Error("must not load");
      },
      sourceOptions: sourceOptions(),
    });
    expect(graph.backend).toBe("reference");
    expect(loaded).toBeFalse();
    expect(warnings.list()).toEqual([
      "native indexed workspace retrieval is unsupported on this platform; using the in-memory reference backend",
    ]);
  });
});

nativeDescribe("workspace indexed lifecycle", () => {
  test("unknown members remain validation errors after native indexed retrieval is active", async () => {
    const active = await indexed();
    expect(active.backend).toBe("indexed");
    await active.dispose?.();
    const generation = generationNames();

    const subset = await loadWorkspaceRetrievalGraph({
      root,
      selection: { manifestPath, memberIds: ["beta"] },
      policy: "indexed",
      sourceOptions: sourceOptions(),
    });
    expect(subset.backend).toBe("indexed");
    expect([...subset.graph.concepts.keys()]).toEqual(["beta::beta-only", "beta::shared"]);
    await subset.dispose?.();
    expect(generationNames()).toEqual(generation);

    await expectUnknownMemberValidation(commandLoader("indexed"));
  });

  test("builds, reuses, updates, and removes old generations without stale selected evidence", async () => {
    const first = await indexed();
    expect(first.backend).toBe("indexed");
    await first.dispose?.();
    expect(generationNames()).toHaveLength(1);
    const firstGeneration = generationNames()[0];
    if (firstGeneration === undefined) throw new Error("workspace generation missing");

    const warm = await indexed();
    expect(warm.backend).toBe("indexed");
    await warm.dispose?.();
    expect(generationNames()).toEqual([firstGeneration]);

    sources.set("beta", source("beta-v2", [concept("new", "Beta new", "updated evidence")]));
    writeManifest(false);
    const updated = await indexed();
    expect([...updated.graph.concepts.keys()]).toContain("beta::new");
    expect([...updated.graph.concepts.keys()]).not.toContain("beta::shared");
    await updated.dispose?.();
    expect(generationNames()).toHaveLength(1);
    expect(generationNames()[0]).not.toBe(firstGeneration);

    const manifest = JSON.parse(await Bun.file(manifestPath).text()) as {
      members: Array<{ memberId: string }>;
      links: unknown[];
    };
    manifest.members = manifest.members.filter((member) => member.memberId === "alpha");
    manifest.links = [];
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
    const removed = await indexed();
    expect([...removed.graph.concepts.keys()]).toEqual(["alpha::alpha-only", "alpha::shared"]);
    expect(removed.workspace?.scope.repositories.map((repository) => repository.memberId)).toEqual(["alpha"]);
    await removed.dispose?.();
    expect(generationNames()).toHaveLength(1);
  });

  test("a rejected candidate publishes nothing partial and preserves the verified generation", async () => {
    const first = await indexed();
    await first.dispose?.();
    const generation = generationNames();
    sources.delete("beta");
    await expect(indexed()).rejects.toThrow("workspace member beta could not be validated");
    expect(generationNames()).toEqual(generation);
  });
});

function writeManifest(withLink = true): void {
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "lore-workspace-manifest/1",
        workspaceId: "fixture",
        members: [
          { memberId: "alpha", locator: "members/alpha", displayName: "Same", expectedRef: "refs/heads/main" },
          { memberId: "beta", locator: "members/beta", displayName: "Same", expectedRef: "refs/heads/main" },
        ],
        links: withLink
          ? [
              {
                linkId: "alpha-task-to-beta",
                kind: "blocks",
                from: { memberId: "alpha", kind: "task", id: "TASK-ALPHA" },
                to: { memberId: "beta", kind: "concept", id: "shared" },
              },
              {
                linkId: "alpha-to-beta",
                kind: "depends_on",
                from: { memberId: "alpha", kind: "concept", id: "shared" },
                to: { memberId: "beta", kind: "concept", id: "shared" },
              },
              {
                linkId: "beta-to-alpha-task",
                kind: "implements",
                from: { memberId: "beta", kind: "concept", id: "shared" },
                to: { memberId: "alpha", kind: "task", id: "TASK-ALPHA" },
              },
            ]
          : [],
      },
      null,
      2,
    )}\n`,
  );
}

function source(seed: string, concepts: readonly Concept[]): LadybugProjectionSource {
  const graph: BundleGraph = buildGraph(concepts);
  const projection = buildProjection({
    graph,
    tasks: [makeTask(`TASK-${seed.toUpperCase()}`, { title: `${seed} task` })],
    docsRoot: "docs",
    okfVersion: "0.1",
    exporterVersion: "0.0.0",
    gitCommit: seed.startsWith("alpha")
      ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    generatedAt: null,
  });
  return prepareLadybugProjectionSource({
    projection,
    inventory: [
      { path: "docs/index.md", byteLength: seed.length, byteHash: `sha256:${seed.padEnd(64, "0").slice(0, 64)}` },
    ],
    profileInventory: [],
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    loreVersion: "0.0.0",
    warnings: [],
  });
}

function concept(id: string, title: string, body: string): Concept {
  return { id, path: `${id}.md`, type: "Reference", frontmatter: { type: "Reference", title, summary: body }, body };
}

function sourceOptions() {
  return {
    resolveGitRef: () => "refs/heads/main",
    loadMemberSource: async ({ memberId }: { memberId: string }) => {
      const value = sources.get(memberId);
      if (value === undefined) throw new Error(`missing source ${memberId}`);
      return value;
    },
  };
}

function candidate() {
  return loadWorkspaceProjection({ root, manifestPath, ...sourceOptions() });
}

function commandLoader(
  policy: "auto" | "reference" | "indexed",
  overrides: { platform?: NodeJS.Platform; loadNativeDriver?: LadybugNativeLoader } = {},
): RetrievalGraphLoader {
  return (options) => {
    if (options.workspace === undefined) throw new Error("workspace selection missing");
    return loadWorkspaceRetrievalGraph({
      root: options.root,
      selection: options.workspace,
      policy,
      ...overrides,
      sourceOptions: sourceOptions(),
      includeTraversal: options.includeTraversal,
    });
  };
}

async function expectUnknownMemberValidation(
  loader: RetrievalGraphLoader,
  selectedManifestPath = manifestPath,
  unknownMemberId = "missing",
): Promise<void> {
  for (const args of unknownMemberCommands(selectedManifestPath, unknownMemberId)) {
    const observed = await invoke(loader, args);
    expect(observed.code).toBe(6);
    expect(observed.stdout).toBe("");
    expect(JSON.parse(observed.stderr)).toMatchObject({
      error_type: "validation",
      message: `workspace projection is invalid: unknown workspace member ${unknownMemberId}`,
    });
    expect(observed.stderr).not.toContain("lbugjs.node");
  }
}

function unknownMemberCommands(selectedManifestPath = manifestPath, unknownMemberId = "missing"): string[][] {
  const selection = ["--workspace", selectedManifestPath, "--repository", unknownMemberId, "--json"];
  return [
    ["graph", ...selection],
    ["query", "evidence", ...selection],
    ["context", "alpha::shared", ...selection],
    [
      "path",
      "alpha::shared",
      "beta::shared",
      "--from-kind",
      "concept",
      "--to-kind",
      "concept",
      "--direction",
      "outbound",
      ...selection,
    ],
    ["impact", "alpha::shared", "--kind", "concept", "--direction", "outbound", ...selection],
  ];
}

function indexed() {
  return loadWorkspaceRetrievalGraph({
    root,
    selection: { manifestPath, memberIds: [] },
    policy: "indexed",
    sourceOptions: sourceOptions(),
  });
}

async function invoke(loader: RetrievalGraphLoader, args: readonly string[]) {
  const stdout = capture();
  const stderr = capture();
  const code = await run(["bun", "lore", ...args], { cwd: root, stdout, stderr, retrieval: loader });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

function envelope<T>(stdout: string): { data: T } {
  return JSON.parse(stdout) as { data: T };
}

function generationNames(): string[] {
  const workspaceRoot = join(root, ".lore/cache/workspaces/1");
  const workspace = readdirSync(workspaceRoot)[0] as string;
  return readdirSync(join(workspaceRoot, workspace, "generations")).sort();
}

function makeWritable(path: string): void {
  try {
    Bun.spawnSync(["chmod", "-R", "u+w", path]);
  } catch {
    // cleanup is best effort; rmSync(force) reports any real failure
  }
}
