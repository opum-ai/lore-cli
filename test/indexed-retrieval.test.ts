import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter } from "../src/adapters/backlog";
import { run } from "../src/cli";
import type { LadybugNativeDriver, LadybugNativeLoader } from "../src/core/ladybug-native";
import { canonicalJson, LADYBUG_CACHE_REL_ROOT } from "../src/core/ladybug-source";
import { loadReferenceRetrievalGraph, loadRetrievalGraph, type RetrievalGraphLoader } from "../src/core/retrieval";
import { WarningCollector } from "../src/errors";
import { capture, fakeAdapter, gitRun, makeTask } from "./helpers";

const nativeDescribe = process.platform === "win32" ? describe.skip : describe;
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-indexed-retrieval-"));
  mkdirSync(join(root, "docs/stories"), { recursive: true });
  mkdirSync(join(root, "docs/specs"), { recursive: true });
  mkdirSync(join(root, "docs/reference"), { recursive: true });
  writeFixture();
});

afterEach(() => {
  makeDirectoriesWritable(root);
  rmSync(root, { recursive: true, force: true });
});

const adapter = fakeAdapter(
  [
    makeTask("TASK-1", { title: "Indexed task α", status: "In Progress", labels: ["graph", "unicode"] }),
    makeTask("TASK-2", { title: "Second task", status: "To Do" }),
  ],
  { listTasks: "ok" },
);

const referenceLoader: RetrievalGraphLoader = (options) =>
  loadReferenceRetrievalGraph({ ...options, resolveGitCommit: () => null });

const indexedLoader: RetrievalGraphLoader = (options) =>
  loadRetrievalGraph({
    ...options,
    adapter,
    policy: "indexed",
    resolveGitCommit: () => null,
  });

const automaticLoader: RetrievalGraphLoader = (options) =>
  loadRetrievalGraph({
    ...options,
    adapter,
    resolveGitCommit: () => null,
  });

interface Observation {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function invoke(
  loader: RetrievalGraphLoader,
  args: readonly string[],
  options: { isTTY?: boolean; env?: Record<string, string | undefined> } = {},
): Promise<Observation> {
  const stdout = capture();
  const stderr = capture();
  const code = await run(["bun", "lore", ...args], {
    cwd: root,
    stdout,
    stderr,
    stderrIsTTY: options.isTTY ?? false,
    isTTY: options.isTTY ?? false,
    env: options.env ?? {},
    adapter,
    retrieval: loader,
  });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

function writeFixture(): void {
  writeFileSync(
    join(root, "docs/index.md"),
    '---\ntype: Reference\ntitle: Lore α root\nokf_version: "0.1"\n---\nRoot index.\n',
  );
  writeFileSync(
    join(root, "docs/stories/root.md"),
    [
      "---",
      "type: Story",
      "title: Archive café orders",
      "summary: Deterministic archive flow α",
      "status: In Progress",
      "tags:",
      "  - orders",
      "  - unicode",
      "specs:",
      "  - ../specs/archive.md",
      "  - ../specs/archive.md",
      "tasks:",
      "  - TASK-1",
      "  - MISSING-9",
      "producer_extension:",
      "  nested: preserved",
      "---",
      "Archive archive orders. [reference](../reference/orders.md) [again](../reference/orders.md).",
      "A dangling [ghost](./missing.md) remains authored.",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs/specs/archive.md"),
    "---\ntype: Spec\ntitle: Archive policy\nsummary: Retain orders safely\nstatus: Done\ntags:\n  - orders\n---\nArchive retention.\n",
  );
  writeFileSync(
    join(root, "docs/reference/orders.md"),
    "---\ntype: Reference\ntitle: Orders café\nsummary: Unicode order reference β\n---\nBack to [root](../stories/root.md).\n",
  );
  writeFileSync(join(root, "docs/reference/empty.md"), "---\ntype: Reference\n---\n");
  writeFileSync(
    join(root, "docs/reference/tie-a.md"),
    "---\ntype: Reference\ntitle: Tie A\nsummary: tielex\n---\ntielex\n",
  );
  writeFileSync(
    join(root, "docs/reference/tie-b.md"),
    "---\ntype: Reference\ntitle: Tie B\nsummary: tielex\n---\ntielex\n",
  );
}

nativeDescribe("indexed/reference retrieval conformance", () => {
  const cases: ReadonlyArray<readonly [string, readonly string[], { isTTY?: boolean; env?: Record<string, string> }?]> =
    [
      ["graph JSON", ["graph", "--json"]],
      ["graph plain", ["graph", "--plain"]],
      ["graph pretty", ["graph"], { isTTY: true }],
      ["graph depth and duplicate/dangling edges", ["graph", "stories/root", "--depth", "1", "--json"]],
      [
        "path typed concept-to-task evidence",
        [
          "path",
          "stories/root",
          "TASK-1",
          "--from-kind",
          "concept",
          "--to-kind",
          "task",
          "--direction",
          "outbound",
          "--json",
        ],
      ],
      [
        "impact typed authored-edge expansion",
        ["impact", "stories/root", "--kind", "concept", "--direction", "outbound", "--max-depth", "2", "--json"],
      ],
      ["query lexical ranking", ["query", "archive orders", "--json"]],
      ["query deterministic score tie", ["query", "tielex", "--json"]],
      ["query plain truncation", ["query", "archive", "--limit", "1", "--plain"]],
      ["query pretty", ["query", "archive"], { isTTY: true }],
      [
        "query filters, Unicode, and truncation",
        ["query", "café", "--type", "story", "--tag", "unicode", "--limit", "1", "--json"],
      ],
      ["query filters-only empty text boundary", ["query", "--status", "Done", "--json"]],
      ["query punctuation-only boundary", ["query", "%%%", "--field", "status=In Progress", "--json"]],
      ["context JSON", ["context", "stories/root", "--depth", "2", "--json"]],
      ["context budget truncation", ["context", "stories/root", "--max-tokens", "1", "--plain"]],
      ["context pretty", ["context", "stories/root"], { isTTY: true }],
      ["context depth zero", ["context", "stories/root", "--depth", "0", "--json"]],
      ["graph not-found error envelope", ["graph", "missing/id", "--json"]],
      ["context not-found plain error", ["context", "missing/id", "--plain"]],
    ];

  for (const [name, args, options] of cases) {
    test(name, async () => {
      const reference = await invoke(referenceLoader, args, options);
      const indexed = await invoke(indexedLoader, args, options);
      expect(indexed).toEqual(reference);
    });
  }

  test("verified indexed provenance is internal and public output contains no native identifiers, paths, or Cypher", async () => {
    const result = await loadRetrievalGraph({
      root,
      adapter,
      policy: "indexed",
      resolveGitCommit: () => null,
    });
    expect(result.backend).toBe("indexed");
    expect(result.provenance).toMatchObject({
      repositoryScopeKey: expect.stringContaining("sha256:"),
      snapshotKey: expect.stringContaining("sha256:"),
      sourceFingerprint: expect.stringContaining("sha256:"),
      exportDigest: expect.stringContaining("sha256:"),
      gitCommit: null,
    });
    const observed = await invoke(indexedLoader, ["graph", "--json"]);
    expect(observed.stdout).not.toMatch(/MATCH \(|recordKey|projection\.lbdb|ladybug|databasePath|sourceFingerprint/i);
    expect(observed.stderr).not.toMatch(/MATCH \(|recordKey|projection\.lbdb|ladybug|databasePath|sourceFingerprint/i);
  });

  test("lexical score ties break by ascending id in both implementations", async () => {
    const reference = await invoke(referenceLoader, ["query", "tielex", "--json"]);
    const indexed = await invoke(indexedLoader, ["query", "tielex", "--json"]);
    expect(indexed).toEqual(reference);
    const envelope = JSON.parse(indexed.stdout) as { data: { hits: Array<{ id: string; score: number }> } };
    expect(envelope.data.hits.map((hit) => hit.id)).toEqual(["reference/tie-a", "reference/tie-b"]);
    expect(envelope.data.hits[0]?.score).toBe(envelope.data.hits[1]?.score);
  });

  test("empty bundles preserve graph/query success and context not-found semantics", async () => {
    rmSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "docs"));
    for (const args of [
      ["graph", "--json"],
      ["query", "--json"],
      ["context", "missing", "--json"],
    ] as const) {
      expect(await invoke(indexedLoader, args)).toEqual(await invoke(referenceLoader, args));
    }
  });

  test("malformed source errors fall back to the exact reference error before stdout", async () => {
    writeFileSync(join(root, "docs/specs/archive.md"), "---\ntype: Spec\ntags: invalid-scalar\n---\n");
    const expected = await invoke(referenceLoader, ["graph", "--json"]);
    const actual = await invoke(automaticLoader, ["graph", "--json"]);
    expect(actual).toEqual(expected);
    expect(actual.code).toBe(6);
    expect(actual.stdout).toBe("");
  });

  test("a source-snapshot retry emits only the successful attempt's reference warnings", async () => {
    let listCalls = 0;
    const driftingAdapter: BacklogAdapter = {
      ...adapter,
      listTasks: async () => {
        if (listCalls++ === 0) {
          writeFileSync(
            join(root, "docs/reference/empty.md"),
            "---\ntype: Reference\ntitle: Changed during snapshot\n---\nChanged source.\n",
          );
        }
        return adapter.listTasks();
      },
    };
    const indexed = await invoke(
      (options) =>
        loadRetrievalGraph({
          ...options,
          adapter: driftingAdapter,
          policy: "indexed",
          resolveGitCommit: () => null,
        }),
      ["graph", "--json"],
    );
    expect(indexed).toEqual(await invoke(referenceLoader, ["graph", "--json"]));
  });

  test("the default Commander handler selects indexed retrieval when the native path is supported", async () => {
    gitRun(root, ["init", "-q"]);
    const stdout = capture();
    const stderr = capture();
    const code = await run(["bun", "lore", "graph", "--json"], {
      cwd: root,
      stdout,
      stderr,
      isTTY: false,
      stderrIsTTY: false,
      adapter,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.text())).toMatchObject({ kind: "graph.export" });
    expect(existsSync(join(root, LADYBUG_CACHE_REL_ROOT, "generations"))).toBe(true);
  });

  test("missing and stale indexes build immutable content-addressed generations without writing repository sources", async () => {
    const before = sourceBytes();
    const first = await loadRetrievalGraph({
      root,
      adapter,
      policy: "indexed",
      resolveGitCommit: () => null,
    });
    expect(first.backend).toBe("indexed");
    expect(sourceBytes()).toEqual(before);
    const generationRoot = join(root, LADYBUG_CACHE_REL_ROOT, "generations");
    expect(readdirSync(generationRoot)).toHaveLength(1);

    writeFileSync(
      join(root, "docs/reference/empty.md"),
      "---\ntype: Reference\ntitle: Changed\n---\nChanged source.\n",
    );
    const changedSource = sourceBytes();
    const second = await loadRetrievalGraph({
      root,
      adapter,
      policy: "indexed",
      resolveGitCommit: () => null,
    });
    expect(second.backend).toBe("indexed");
    expect(second.provenance?.sourceFingerprint).not.toBe(first.provenance?.sourceFingerprint);
    expect(sourceBytes()).toEqual(changedSource);
    expect(readdirSync(generationRoot).filter((name) => /^[0-9a-f]{64}$/.test(name))).toHaveLength(2);
  });

  test("corrupt native bytes are quarantined and rebuilt before one parity result is emitted", async () => {
    const built = await loadRetrievalGraph({
      root,
      adapter,
      policy: "indexed",
      resolveGitCommit: () => null,
    });
    const generation = generationFor(built.provenance?.sourceFingerprint);
    const database = join(generation, "projection.lbdb");
    chmodSync(database, 0o600);
    appendFileSync(database, "corrupt");
    chmodSync(database, 0o444);

    const expected = await invoke(referenceLoader, ["query", "archive", "--json"]);
    const recovered = await invoke(automaticLoader, ["query", "archive", "--json"]);
    expect(recovered).toEqual(expected);
    expect(readdirSync(join(root, LADYBUG_CACHE_REL_ROOT)).some((name) => name.startsWith(".corrupt-"))).toBe(true);
  });

  test("known compatibility changes rebuild while a newer unsupported format is preserved and falls back without native load", async () => {
    const built = await loadRetrievalGraph({
      root,
      adapter,
      policy: "indexed",
      resolveGitCommit: () => null,
    });
    const generation = generationFor(built.provenance?.sourceFingerprint);
    const controlPath = join(generation, "index.json");
    mutateControl(generation, { ladybugVersion: "0.18.3", ladybugStorageVersion: "42" });
    const rebuilt = await loadRetrievalGraph({
      root,
      adapter,
      policy: "indexed",
      resolveGitCommit: () => null,
    });
    expect(rebuilt.backend).toBe("indexed");

    mutateControl(generation, { indexFormatVersion: "ladybug-projection/2" });
    const unsupportedBytes = readFileSync(controlPath, "utf8");
    chmodSync(generation, 0o700);
    chmodSync(controlPath, 0o600);
    let loads = 0;
    const noNative: LadybugNativeLoader = async () => {
      loads++;
      throw new Error("native loader must not run");
    };
    const expected = await invoke(referenceLoader, ["context", "stories/root", "--json"]);
    const actual = await invoke(
      (options) =>
        loadRetrievalGraph({
          ...options,
          adapter,
          resolveGitCommit: () => null,
          loadNativeDriver: noNative,
        }),
      ["context", "stories/root", "--json"],
    );
    expect(actual).toEqual(expected);
    expect(loads).toBe(0);
    expect(readFileSync(controlPath, "utf8")).toBe(unsupportedBytes);
    expect(lstatSync(generation).mode & 0o222).not.toBe(0);
    expect(lstatSync(controlPath).mode & 0o222).not.toBe(0);
  });

  test("active writer contention with no matching generation falls back before native loading", async () => {
    await loadRetrievalGraph({ root, adapter, policy: "indexed", resolveGitCommit: () => null });
    writeFileSync(join(root, "docs/reference/empty.md"), "---\ntype: Reference\ntitle: New source\n---\n");
    const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
    writeFileSync(
      join(cacheRoot, "writer.lock"),
      `${JSON.stringify({
        ownerToken: "active-owner",
        pid: process.pid,
        processStartIdentity: "known-live-process-instance",
        hostname: hostname(),
        acquiredAt: "2026-07-30T00:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );
    let loads = 0;
    const expected = await invoke(referenceLoader, ["graph", "--json"]);
    const actual = await invoke(
      (options) =>
        loadRetrievalGraph({
          ...options,
          adapter,
          resolveGitCommit: () => null,
          loadNativeDriver: async () => {
            loads++;
            throw new Error("native loader must not run under contended missing generation");
          },
        }),
      ["graph", "--json"],
    );
    expect(actual).toEqual(expected);
    expect(loads).toBe(0);
  });

  test("an active writer lock reuses the exact fully verified generation", async () => {
    const built = await loadRetrievalGraph({
      root,
      adapter,
      policy: "indexed",
      resolveGitCommit: () => null,
    });
    expect(built.backend).toBe("indexed");
    const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
    writeFileSync(
      join(cacheRoot, "writer.lock"),
      `${JSON.stringify({
        ownerToken: "active-owner",
        pid: process.pid,
        processStartIdentity: "known-live-process-instance",
        hostname: hostname(),
        acquiredAt: "2026-07-30T00:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );

    const selected = await loadRetrievalGraph({
      root,
      adapter,
      resolveGitCommit: () => null,
    });
    expect(selected.backend).toBe("indexed");
    expect(selected.provenance?.sourceFingerprint).toBe(built.provenance?.sourceFingerprint);
    expect(await invoke(automaticLoader, ["graph", "--json"])).toEqual(
      await invoke(referenceLoader, ["graph", "--json"]),
    );
  });

  test("native read and loader failures preserve indexed state and emit only the complete reference result", async () => {
    const real = (await import("../src/core/ladybug-driver")) as LadybugNativeDriver;
    const failingRead: LadybugNativeLoader = async () => ({
      ...real,
      openLadybugIndexedReader: () => {
        throw new Error("private native read detail");
      },
    });
    const expected = await invoke(referenceLoader, ["graph", "--json"]);
    const actual = await invoke(
      (options) =>
        loadRetrievalGraph({
          ...options,
          adapter,
          resolveGitCommit: () => null,
          loadNativeDriver: failingRead,
        }),
      ["graph", "--json"],
    );
    expect(actual.code).toBe(expected.code);
    expect(actual.stdout).toBe(expected.stdout);
    expect(actual.stdout.split("\n").filter(Boolean)).toHaveLength(1);
    expect(actual.stderr).toContain("native indexed retrieval failed; using the in-memory reference backend");
    expect(actual.stderr).not.toContain("private native read detail");

    const cacheRoot = join(root, LADYBUG_CACHE_REL_ROOT);
    const generationRoot = join(cacheRoot, "generations");
    const generations = readdirSync(generationRoot);
    const unavailable = await invoke(
      (options) =>
        loadRetrievalGraph({
          ...options,
          adapter,
          resolveGitCommit: () => null,
          loadNativeDriver: async () => {
            throw new Error("private native loader detail");
          },
        }),
      ["graph", "--json"],
    );
    expect(unavailable.code).toBe(expected.code);
    expect(unavailable.stdout).toBe(expected.stdout);
    expect(unavailable.stderr).toContain("native indexed retrieval failed; using the in-memory reference backend");
    expect(unavailable.stderr).not.toContain("private native loader detail");
    expect(readdirSync(generationRoot)).toEqual(generations);
    expect(readdirSync(cacheRoot).some((name) => name.startsWith(".corrupt-"))).toBe(false);
  });
});

describe("native lazy-loading and fallback boundary", () => {
  test("the Windows policy selects reference retrieval without evaluating the addon loader", async () => {
    let loads = 0;
    const warnings = new WarningCollector();
    const result = await loadRetrievalGraph({
      root,
      platform: "win32",
      warnings,
      loadNativeDriver: async () => {
        loads++;
        throw new Error("Windows must not load the native addon");
      },
    });
    expect(result.backend).toBe("reference");
    expect(loads).toBe(0);
    expect(warnings.list()).toContain(
      "native indexed retrieval is unsupported on this platform; using the in-memory reference backend",
    );
  });

  test("command usage errors are resolved before any retrieval or native boundary", async () => {
    let retrievals = 0;
    const observed = await invoke(async () => {
      retrievals++;
      throw new Error("must not retrieve");
    }, ["context", "--depth", "1", "--json"]);
    expect(observed.code).toBe(2);
    expect(retrievals).toBe(0);
    expect(observed.stdout).toBe("");
    expect(JSON.parse(observed.stderr)).toMatchObject({ error_type: "usage" });
  });
});

function generationFor(fingerprint: string | undefined): string {
  if (fingerprint === undefined) throw new Error("missing indexed provenance");
  return join(root, LADYBUG_CACHE_REL_ROOT, "generations", fingerprint.replace(/^sha256:/, ""));
}

function mutateControl(generation: string, patch: Record<string, unknown>): void {
  const controlPath = join(generation, "index.json");
  chmodSync(generation, 0o700);
  chmodSync(controlPath, 0o600);
  const control = JSON.parse(readFileSync(controlPath, "utf8")) as Record<string, unknown>;
  writeFileSync(controlPath, `${canonicalJson({ ...control, ...patch })}\n`);
  chmodSync(controlPath, 0o444);
  chmodSync(generation, 0o555);
}

function sourceBytes(): Record<string, string> {
  return Object.fromEntries(
    [
      "docs/index.md",
      "docs/stories/root.md",
      "docs/specs/archive.md",
      "docs/reference/orders.md",
      "docs/reference/empty.md",
      "docs/reference/tie-a.md",
      "docs/reference/tie-b.md",
    ].map((path) => [path, readFileSync(join(root, path), "utf8")]),
  );
}

function makeDirectoriesWritable(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path)) makeDirectoriesWritable(join(path, entry));
}
