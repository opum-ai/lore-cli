import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraph } from "../src/core/bundle";
import { parseConcept } from "../src/core/concept";
import type {
  LadybugControlManifest,
  LadybugProjectionGeneration,
  LadybugProjectionLifecycleResult,
} from "../src/core/ladybug-lifecycle";
import {
  canonicalJson,
  LADYBUG_CACHE_REL_ROOT,
  type LadybugProjectionSource,
  loadLadybugProjectionSource,
  prepareLadybugProjectionSource,
} from "../src/core/ladybug-source";
import { buildProjection, projectionStreamHash } from "../src/core/projection";
import { fakeAdapter, makeTask } from "./helpers";

// Bun 1.2.23 crashes in the Windows process while loading Ladybug's native
// addon, before a test can run or skip. Native Windows packaging/qualification
// belongs to LCLI-283.1.4, so keep source-contract coverage active there while
// loading and exercising the native lifecycle only on qualified hosts.
const nativeDriver = process.platform === "win32" ? null : await import("../src/core/ladybug-driver");
const nativeLifecycle = process.platform === "win32" ? null : await import("../src/core/ladybug-lifecycle");
const LADYBUG_VERSION = nativeDriver?.LADYBUG_VERSION ?? "0.19.0";
const LADYBUG_STORAGE_VERSION = nativeDriver?.LADYBUG_STORAGE_VERSION ?? "43";
const readLadybugSourceRecords: typeof import("../src/core/ladybug-driver").readLadybugSourceRecords =
  nativeDriver?.readLadybugSourceRecords ??
  (async () => {
    throw new Error("native Ladybug lifecycle is unavailable on this host");
  });
const reconcileLadybugProjection: typeof import("../src/core/ladybug-lifecycle").reconcileLadybugProjection =
  nativeLifecycle?.reconcileLadybugProjection ??
  (async () => {
    throw new Error("native Ladybug lifecycle is unavailable on this host");
  });
const disposeLadybugProjection: typeof import("../src/core/ladybug-lifecycle").disposeLadybugProjection =
  nativeLifecycle?.disposeLadybugProjection ??
  (() => {
    throw new Error("native Ladybug lifecycle is unavailable on this host");
  });
const isUnsupportedDirectoryFsyncError:
  | typeof import("../src/core/ladybug-lifecycle").isUnsupportedDirectoryFsyncError
  | undefined = nativeLifecycle?.isUnsupportedDirectoryFsyncError;
const nativeDescribe = process.platform === "win32" ? describe.skip : describe;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    makeDirectoriesWritable(root);
    rmSync(root, { recursive: true, force: true });
  }
});

function tempRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "lore-ladybug-lifecycle-"));
  roots.push(root);
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs/source-marker.txt"), "source truth\n");
  mkdirSync(join(root, ".lore"), { recursive: true });
  writeFileSync(join(root, ".lore/profile.toml"), "# active profile bytes\n");
  return root;
}

function fixtureSource(
  variant: "full" | "changed" = "full",
  generatedAt = "2026-07-30T00:00:00.000Z",
): LadybugProjectionSource {
  const concepts =
    variant === "full"
      ? [
          parseConcept(
            "index.md",
            '---\ntype: Reference\ntitle: Root\nokf_version: "0.1"\nproducer_extension:\n  nested: kept\n---\n',
          ),
          parseConcept(
            "stories/ship.md",
            "---\ntype: Story\ntitle: Ship\ntasks:\n  - TASK-1\n  - MISSING-9\n  - TASK-1\nunknown_list:\n  - α\n---\n[one](../index.md) [again](../index.md) [gone](missing.md)\n",
          ),
        ]
      : [
          parseConcept(
            "index.md",
            '---\ntype: Reference\ntitle: Root changed\nokf_version: "0.1"\nproducer_extension:\n  nested: still-kept\n---\n',
          ),
        ];
  const graph = buildGraph(concepts);
  const tasks =
    variant === "full"
      ? [makeTask("TASK-1", { title: "Original task", labels: ["cache", "α"] })]
      : [makeTask("TASK-1", { title: "Changed task", labels: ["cache"] })];
  const built = buildProjection({
    graph,
    tasks,
    docsRoot: "docs",
    okfVersion: "0.1",
    exporterVersion: "0.0.0",
    gitCommit: "a".repeat(40),
    generatedAt,
  });
  const semanticRecords = built.records.slice(0, -1).map((record) => {
    if (record.record === "manifest") return { ...record, futureManifestField: { preserved: true } };
    if (record.record === "task") return { ...record, futureTaskField: ["preserved", 1] };
    if (record.record === "edge") return { ...record, futureEdgeField: "preserved" };
    return record;
  });
  const trailer = built.records.at(-1);
  if (trailer === undefined) throw new Error("projection fixture has no trailer");
  const records = [
    ...semanticRecords,
    {
      ...trailer,
      streamHash: projectionStreamHash(semanticRecords),
      futureTrailerField: "preserved",
    },
  ];
  const projection = {
    records,
    jsonl: `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  };
  return prepareLadybugProjectionSource({
    projection,
    inventory: [
      {
        path: "docs/index.md",
        byteLength: variant === "full" ? 10 : 11,
        byteHash: sha(variant),
      },
    ],
    profileInventory: [{ path: ".lore/profile.toml", bytes: "# active profile bytes\n" }],
    ladybugVersion: LADYBUG_VERSION,
    ladybugStorageVersion: LADYBUG_STORAGE_VERSION,
    warnings: [],
  });
}

describe("Ladybug projection source", () => {
  test("validates export 1.0 and derives stable fingerprints while preserving unknown, duplicate, and dangling records", () => {
    const first = fixtureSource("full", "2026-07-30T00:00:00.000Z");
    const second = fixtureSource("full", "2026-07-31T00:00:00.000Z");
    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(first.snapshotKey).toBe(second.snapshotKey);
    expect(first.generationKey).toMatch(/^[0-9a-f]{64}$/);
    expect(first.generationKey).not.toContain(":");

    const story = first.concepts.find((record) => record.id === "stories/ship");
    expect(story?.frontmatter).toMatchObject({ unknown_list: ["α"] });
    expect(first.manifest.futureManifestField).toEqual({ preserved: true });
    expect(first.tasks[0]?.futureTaskField).toEqual(["preserved", 1]);
    const conceptEdges = first.authoredEdges.filter((edge) => edge.kind === "link");
    expect(conceptEdges[0]?.futureEdgeField).toBe("preserved");
    expect(conceptEdges.map((edge) => [edge.target, edge.ordinal, edge.dangling])).toEqual([
      ["../index.md", 0, false],
      ["../index.md", 1, false],
      ["missing.md", 2, true],
    ]);
    const taskEdges = first.authoredEdges.filter((edge) => edge.kind === "task");
    expect(taskEdges.map((edge) => [edge.target, edge.ordinal, edge.dangling])).toEqual([
      ["TASK-1", 0, false],
      ["MISSING-9", 0, true],
      ["TASK-1", 1, false],
    ]);
    expect(new Set(first.authoredEdges.map((edge) => edge.key)).size).toBe(first.authoredEdges.length);
    expect(first.trailer.futureTrailerField).toBe("preserved");
  });

  test("loads the validated export snapshot without writing docs, Backlog, profile, Git, or cache state", async () => {
    const root = tempRepository();
    const index = '---\ntype: Reference\ntitle: Root\nokf_version: "0.1"\n---\n';
    const story = "---\ntype: Story\ntitle: Ship\ntasks:\n  - TASK-1\n---\n[Root](../index.md)\n";
    writeFileSync(join(root, "docs/index.md"), index);
    mkdirSync(join(root, "docs/stories"), { recursive: true });
    writeFileSync(join(root, "docs/stories/ship.md"), story);
    const profile = readFileSync(join(root, ".lore/profile.toml"));

    const source = await loadLadybugProjectionSource({
      root,
      ladybugVersion: LADYBUG_VERSION,
      ladybugStorageVersion: LADYBUG_STORAGE_VERSION,
      adapter: fakeAdapter([makeTask("TASK-1")], { listTasks: "ok" }),
      resolveGitCommit: () => "b".repeat(40),
    });
    expect(source.counts).toEqual({ concepts: 2, tasks: 1, authoredEdges: 2 });
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toBe(index);
    expect(readFileSync(join(root, "docs/stories/ship.md"), "utf8")).toBe(story);
    expect(readFileSync(join(root, ".lore/profile.toml"))).toEqual(profile);
    expect(existsSync(join(root, LADYBUG_CACHE_REL_ROOT))).toBe(false);
  });
});

nativeDescribe("Ladybug projection lifecycle", () => {
  test("accepts only documented unsupported directory flush errors for each host", () => {
    const error = (code: string): NodeJS.ErrnoException => Object.assign(new Error(code), { code });
    expect(isUnsupportedDirectoryFsyncError?.(error("EINVAL"), "linux")).toBe(true);
    expect(isUnsupportedDirectoryFsyncError?.(error("ENOTSUP"), "darwin")).toBe(true);
    expect(isUnsupportedDirectoryFsyncError?.(error("EPERM"), "win32")).toBe(true);
    expect(isUnsupportedDirectoryFsyncError?.(error("EPERM"), "linux")).toBe(false);
    expect(isUnsupportedDirectoryFsyncError?.(error("EIO"), "win32")).toBe(false);
  });

  test("builds, verifies, reuses, disposes, and deterministically rebuilds one immutable generation", async () => {
    const root = tempRepository();
    const source = fixtureSource();
    const beforeDocs = readFileSync(join(root, "docs/source-marker.txt"));
    const beforeProfile = readFileSync(join(root, ".lore/profile.toml"));
    let sourceLoads = 0;
    let freshnessLoads = 0;
    const loadSource = async () => {
      sourceLoads++;
      return source;
    };
    const loadFreshness = async () => {
      freshnessLoads++;
      return { inputFingerprint: source.inputFingerprint };
    };

    const built = await reconcileLadybugProjection({ root, loadSource, loadFreshness });
    expect(built.classification).toBe("rebuildable");
    expect(built.outcome).toBe("built");
    expect({ sourceLoads, freshnessLoads }).toEqual({ sourceLoads: 1, freshnessLoads: 1 });
    const generation = requireGeneration(built);
    expect(generation.generationPath).toContain(join(LADYBUG_CACHE_REL_ROOT, "generations"));
    expect(statSync(generation.databasePath).mode & 0o222).toBe(0);
    expect(statSync(generation.controlPath).mode & 0o222).toBe(0);
    expect(statSync(generation.generationPath).mode & 0o222).toBe(0);

    const records = await readLadybugSourceRecords(generation.databasePath);
    expect(records.size).toBe(source.counts.concepts + source.counts.tasks + source.counts.authoredEdges);
    for (const record of [...source.concepts, ...source.tasks, ...source.authoredEdges]) {
      expect(records.get(record.key)).toBe(JSON.stringify(record));
    }

    const reused = await reconcileLadybugProjection({ root, loadSource, loadFreshness });
    expect(reused.classification).toBe("reusable");
    expect(reused.outcome).toBe("reused");
    expect(reused.generation?.control).toEqual(generation.control);
    expect({ sourceLoads, freshnessLoads }).toEqual({ sourceLoads: 1, freshnessLoads: 2 });

    expect(disposeLadybugProjection(root)).toBe(true);
    expect(existsSync(generation.generationPath)).toBe(false);
    const rebuilt = await reconcileLadybugProjection({ root, loadSource, loadFreshness });
    expect(rebuilt.outcome).toBe("built");
    expect({ sourceLoads, freshnessLoads }).toEqual({ sourceLoads: 2, freshnessLoads: 3 });
    const rebuiltGeneration = requireGeneration(rebuilt);
    expect(rebuiltGeneration.generationPath).toBe(generation.generationPath);
    expect(stableControl(rebuiltGeneration.control)).toEqual(stableControl(generation.control));

    expect(readFileSync(join(root, "docs/source-marker.txt"))).toEqual(beforeDocs);
    expect(readFileSync(join(root, ".lore/profile.toml"))).toEqual(beforeProfile);
  });

  test("changed and deleted records publish a replacement generation without stale nodes or edges", async () => {
    const root = tempRepository();
    let source = fixtureSource("full");
    const first = await reconcileLadybugProjection({ root, loadSource: async () => source });
    const oldKeys = new Set([...source.concepts, ...source.tasks, ...source.authoredEdges].map((record) => record.key));

    source = fixtureSource("changed");
    const replacement = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(replacement.classification).toBe("rebuildable");
    expect(replacement.outcome).toBe("built");
    expect(replacement.generation?.generationPath).not.toBe(first.generation?.generationPath);
    const replacementRecords = await readLadybugSourceRecords(requireGeneration(replacement).databasePath);
    expect(replacementRecords.size).toBe(source.counts.concepts + source.counts.tasks + source.counts.authoredEdges);
    for (const staleKey of oldKeys) {
      if (![...source.concepts, ...source.tasks, ...source.authoredEdges].some((record) => record.key === staleKey)) {
        expect(replacementRecords.has(staleKey)).toBe(false);
      }
    }
  });

  test("an interruption before control publication is invisible and the next writer cleans staging then rebuilds", async () => {
    const root = tempRepository();
    const source = fixtureSource();
    await expect(
      reconcileLadybugProjection({
        root,
        loadSource: async () => source,
        hooks: {
          afterDatabaseClose() {
            throw new Error("simulated interruption");
          },
        },
      }),
    ).rejects.toThrow("simulated interruption");
    const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
    expect(readdirSync(cacheRoot).some((name) => name.startsWith(".building-"))).toBe(true);
    expect(readdirSync(join(cacheRoot, "generations"))).toEqual([]);
    expect(existsSync(join(cacheRoot, "writer.lock"))).toBe(false);

    const recovered = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(recovered.outcome).toBe("built");
    expect(readdirSync(cacheRoot).some((name) => name.startsWith(".building-"))).toBe(false);
  });

  test("an interruption at the atomic publication point leaves a complete immutable reusable generation", async () => {
    const root = tempRepository();
    const source = fixtureSource();
    let publishedPath = "";
    await expect(
      reconcileLadybugProjection({
        root,
        loadSource: async () => source,
        hooks: {
          afterPublication(generationPath) {
            publishedPath = generationPath;
            throw new Error("simulated publication interruption");
          },
        },
      }),
    ).rejects.toThrow("simulated publication interruption");

    expect(publishedPath).not.toBe("");
    expect(statSync(publishedPath).mode & 0o222).toBe(0);
    expect(statSync(join(publishedPath, "projection.lbdb")).mode & 0o222).toBe(0);
    expect(statSync(join(publishedPath, "index.json")).mode & 0o222).toBe(0);

    const recovered = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(recovered.classification).toBe("reusable");
    expect(recovered.outcome).toBe("reused");
    expect(recovered.generation?.generationPath).toBe(publishedPath);
  });

  test("database corruption is quarantined only under writer ownership and rebuilt from source", async () => {
    const root = tempRepository();
    const source = fixtureSource();
    const first = await reconcileLadybugProjection({ root, loadSource: async () => source });
    const databasePath = requireGeneration(first).databasePath;
    chmodSync(databasePath, 0o600);
    appendFileSync(databasePath, "corruption");
    chmodSync(databasePath, 0o444);

    const recovered = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(recovered.classification).toBe("corrupt");
    expect(recovered.outcome).toBe("built");
    const cacheEntries = readdirSync(join(root, LADYBUG_CACHE_REL_ROOT));
    expect(cacheEntries.some((name) => name.startsWith(`.corrupt-${source.generationKey}-`))).toBe(true);
    expect((await readLadybugSourceRecords(requireGeneration(recovered).databasePath)).size).toBe(
      source.counts.concepts + source.counts.tasks + source.counts.authoredEdges,
    );
  });

  test("duplicated control metadata disagreement is corruption, not a freshness rebuild", async () => {
    const root = tempRepository();
    const source = fixtureSource();
    const first = await reconcileLadybugProjection({ root, loadSource: async () => source });
    const generation = requireGeneration(first);
    chmodSync(generation.generationPath, 0o700);
    chmodSync(generation.controlPath, 0o600);
    const control = JSON.parse(readFileSync(generation.controlPath, "utf8")) as LadybugControlManifest;
    writeFileSync(
      generation.controlPath,
      `${canonicalJson({
        ...control,
        counts: { ...control.counts, concepts: control.counts.concepts + 1 },
      })}\n`,
    );
    chmodSync(generation.controlPath, 0o444);
    chmodSync(generation.generationPath, 0o555);

    const recovered = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(recovered.classification).toBe("corrupt");
    expect(recovered.outcome).toBe("built");
  });

  test("a stale lock is recovered only with same-host process-instance evidence", async () => {
    const root = tempRepository();
    let source = fixtureSource("full");
    await reconcileLadybugProjection({ root, loadSource: async () => source });
    source = fixtureSource("changed");
    const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
    const deadPid = 2_147_483_647;
    writeFileSync(
      join(cacheRoot, "writer.lock"),
      `${JSON.stringify({
        ownerToken: "stale-owner",
        pid: deadPid,
        processStartIdentity: `pid:${deadPid}:started:1`,
        hostname: hostname(),
        acquiredAt: "2026-07-30T00:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );

    const recovered = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(recovered.classification).toBe("rebuildable");
    expect(recovered.outcome).toBe("built");
    expect(readdirSync(cacheRoot).some((name) => name.startsWith(".stale-lock-"))).toBe(true);
  });

  test("known compatibility changes use rebuild-only replacement without mutating the old generation in place", async () => {
    const root = tempRepository();
    const source = fixtureSource();
    const first = await reconcileLadybugProjection({ root, loadSource: async () => source });
    const generation = requireGeneration(first);
    chmodSync(generation.generationPath, 0o700);
    chmodSync(generation.controlPath, 0o600);
    const control = JSON.parse(readFileSync(generation.controlPath, "utf8")) as LadybugControlManifest;
    writeFileSync(
      generation.controlPath,
      `${canonicalJson({
        ...control,
        ladybugVersion: "0.18.3",
        ladybugStorageVersion: "42",
      })}\n`,
    );
    chmodSync(generation.controlPath, 0o444);
    chmodSync(generation.generationPath, 0o555);

    const rebuilt = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(rebuilt.classification).toBe("rebuildable");
    expect(rebuilt.outcome).toBe("built");
    expect(readdirSync(join(root, LADYBUG_CACHE_REL_ROOT)).some((name) => name.startsWith(".rebuildable-"))).toBe(true);
  });

  test("classification is ordered: a live writer lock wins, then a newer format is preserved as unsupported", async () => {
    const root = tempRepository();
    const source = fixtureSource();
    const first = await reconcileLadybugProjection({ root, loadSource: async () => source });
    const generation = requireGeneration(first);
    chmodSync(generation.generationPath, 0o700);
    chmodSync(generation.controlPath, 0o600);
    const control = JSON.parse(readFileSync(generation.controlPath, "utf8")) as LadybugControlManifest;
    writeFileSync(
      generation.controlPath,
      `${canonicalJson({ ...control, indexFormatVersion: "ladybug-projection/2" })}\n`,
    );
    chmodSync(generation.controlPath, 0o444);
    chmodSync(generation.generationPath, 0o555);

    const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
    writeFileSync(
      join(cacheRoot, "writer.lock"),
      `${JSON.stringify({
        ownerToken: "other-live-owner",
        pid: process.pid,
        processStartIdentity: "known-live-process-instance",
        hostname: hostname(),
        acquiredAt: "2026-07-30T00:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );
    const locked = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(locked.classification).toBe("locked");
    expect(locked.outcome).toBe("unavailable");
    rmSync(join(cacheRoot, "writer.lock"));

    const unsupported = await reconcileLadybugProjection({ root, loadSource: async () => source });
    expect(unsupported.classification).toBe("unsupported");
    expect(unsupported.outcome).toBe("unavailable");
    expect(existsSync(generation.generationPath)).toBe(true);
    expect(readdirSync(cacheRoot).some((name) => name.startsWith(".corrupt-"))).toBe(false);
  });

  test("repository cache artifacts are ignored by Git", () => {
    const result = Bun.spawnSync(
      ["git", "check-ignore", ".lore/cache/graph/ladybug/1/generations/example/projection.lbdb"],
      { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" },
    );
    expect(result.exitCode).toBe(0);
  });

  test.skipIf(process.platform === "win32")(
    "refuses a symlinked cache ancestor without writing its external target",
    async () => {
      const root = tempRepository();
      const outside = mkdtempSync(join(tmpdir(), "lore-ladybug-outside-"));
      roots.push(outside);
      symlinkSync(outside, join(root, ".lore/cache"));
      const source = fixtureSource();

      await expect(reconcileLadybugProjection({ root, loadSource: async () => source })).rejects.toMatchObject({
        type: "denied",
      });
      expect(readdirSync(outside)).toEqual([]);
    },
  );
});

function sha(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stableControl(control: LadybugControlManifest): unknown {
  return { ...control, database: { ...control.database, digest: "<physical-database-digest>" } };
}

function requireGeneration(result: LadybugProjectionLifecycleResult): LadybugProjectionGeneration {
  if (result.generation === undefined) {
    throw new Error(`expected a generation, received ${result.classification}/${result.outcome}`);
  }
  return result.generation;
}

function makeDirectoriesWritable(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path)) makeDirectoriesWritable(join(path, entry));
}
