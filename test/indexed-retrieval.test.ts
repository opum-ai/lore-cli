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
import { canonicalJson, INDEXED_VERIFICATION_FAILURE, LADYBUG_CACHE_REL_ROOT } from "../src/core/ladybug-source";
import {
  loadReferenceRetrievalGraph,
  loadRetrievalGraph,
  REFERENCE_FALLBACK_REASONS,
  type RetrievalGraphLoader,
  referenceFallbackMessage,
  stripRetrievalBackend,
} from "../src/core/retrieval";
import { LoreError, WarningCollector } from "../src/errors";
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

// TASK-1 depends on TASK-2 so every conformance case below carries a task->task `dependency` edge
// (LCLI-476's edge kind). Without one this whole suite passed while the indexed BundleGraph reader
// rejected those edges and `auto` fell back to the reference backend on every command (LCLI-497).
// The suite could always SEE that defect; its fixture simply never produced the trigger, which is
// the more useful half of the lesson: a detector needs capability and coverage both.
const adapter = fakeAdapter(
  [
    makeTask("TASK-1", {
      title: "Indexed task α",
      status: "In Progress",
      labels: ["graph", "unicode"],
      dependencies: ["TASK-2"],
    }),
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

/**
 * Assert two observations are the same result, ignoring the one field they are REQUIRED to differ
 * on since LCLI-499: `data.backend`. Everything else -- payload, exit code, stderr -- is still
 * compared exactly. The backend is asserted separately and positively, which is a stronger check
 * than the byte equality it replaces rather than a relaxation of it.
 */
function expectSameResult(actual: Observation, expected: Observation): void {
  expect({ ...actual, stdout: stripRetrievalBackend(actual.stdout) }).toEqual({
    ...expected,
    stdout: stripRetrievalBackend(expected.stdout),
  });
}

/** The `data.backend` an observed `--json` payload reported, or `undefined` when it reported none. */
function backendOf(observation: Observation): string | undefined {
  return (JSON.parse(observation.stdout) as { data?: { backend?: string } }).data?.backend;
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
  // The Spec declares a claim version and the Reference cites it at a STALE one, so the fixture
  // carries every ADR-0021 shape the two backends must agree on: a relation edge, its
  // `statement`/`version` qualifiers, its `relationOrdinal` discriminator, and a computed
  // `versionState`. An indexed read rebuilds all of it from the stored record rather than from a
  // promoted column, which is precisely the kind of fidelity gap only a conformance case catches.
  writeFileSync(
    join(root, "docs/specs/archive.md"),
    '---\ntype: Spec\ntitle: Archive policy\nsummary: Retain orders safely\nstatus: Done\ntags:\n  - orders\nclaim_outcome: supported\nclaim_evidence_level: argument\nclaim_version: "4"\n---\nArchive retention.\n',
  );
  writeFileSync(
    join(root, "docs/reference/orders.md"),
    [
      "---",
      "type: Reference",
      "title: Orders café",
      "summary: Unicode order reference β",
      "relations:",
      "  - kind: requires",
      "    target: ../specs/archive.md",
      "    statement: Retention window",
      '    version: "3"',
      "  - kind: alternative",
      "    target: specs/archive",
      "---",
      "Back to [root](../stories/root.md).",
      "",
    ].join("\n"),
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
      expectSameResult(indexed, reference);
    });
  }

  test("every retrieval-family command names the backend that served it (LCLI-499)", async () => {
    // The conformance cases above prove the two backends AGREE. This one proves they can be told
    // apart, which until now nothing downstream could do: `RetrievalBackend` existed internally and
    // reached no consumer, so a dead indexed backend and a live one were indistinguishable through
    // the public contract. That is why LCLI-497 could only be found by accident.
    const commands: readonly (readonly string[])[] = [
      ["graph", "--json"],
      ["query", "archive", "--json"],
      ["context", "stories/root", "--json"],
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
      ["impact", "stories/root", "--kind", "concept", "--direction", "outbound", "--json"],
    ];
    for (const args of commands) {
      expect(backendOf(await invoke(indexedLoader, args))).toBe("indexed");
      expect(backendOf(await invoke(referenceLoader, args))).toBe("reference");
    }
  });

  test("the stamp is present on a successful response, not only a degraded one (LCLI-499)", async () => {
    // The property that makes the field worth having. A marker that appeared only when something
    // went wrong would have an ABSENCE ambiguous between "the good case" and "a version that does
    // not report this" -- the same defect the stderr advisory already has, since one of the three
    // routes to the reference backend warns nothing at all.
    const observed = await invoke(indexedLoader, ["graph", "--json"]);
    // Nothing degraded: no fallback advisory anywhere on stderr (the fixture's own content
    // advisories are unrelated and expected). The stamp is there all the same.
    expect(observed.stderr).not.toMatch(/using the in-memory reference backend/);
    expect(backendOf(observed)).toBe("indexed");
  });

  test("relation qualifiers and version state survive an indexed read (LCLI-477)", async () => {
    // Compared field-by-field rather than only through the generic conformance cases above, because
    // the qualifiers are SPARSE: an indexed read that dropped them entirely would still produce
    // edges with the right endpoints and kinds, and a whole-output comparison of two backends that
    // both dropped them would agree with itself. This asserts the values.
    const observed = await invoke(indexedLoader, ["graph", "--json"]);
    const edges = (JSON.parse(observed.stdout).data as { edges: Record<string, unknown>[] }).edges;
    expect(edges.find((edge) => edge.kind === "requires")).toMatchObject({
      from: "reference/orders",
      to: "specs/archive",
      statement: "Retention window",
      version: "3",
      relationOrdinal: 0,
      versionState: "stale",
    });
    // The second relation records no `version` against a target that DOES declare one, which is
    // `unversioned` and not `untracked` — the two absences are on opposite sides of the comparison
    // and collapsing them is exactly the ambiguity the four states exist to prevent.
    expect(edges.find((edge) => edge.kind === "alternative")).toMatchObject({
      relationOrdinal: 1,
      versionState: "unversioned",
    });
    expectSameResult(observed, await invoke(referenceLoader, ["graph", "--json"]));
  });

  test("a proof-only view selects the same edges from either backend", async () => {
    const args = ["graph", "--proof-only", "--json"];
    const indexed = await invoke(indexedLoader, args);
    expectSameResult(indexed, await invoke(referenceLoader, args));
    const kinds = (JSON.parse(indexed.stdout).data as { edges: { kind: string }[] }).edges.map((edge) => edge.kind);
    // `alternative` is authored in this fixture and must not appear; neither may `link` or `specs`.
    expect(kinds).toEqual(["requires"]);
  });

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

  test("a task-dependency edge does not corrupt the indexed bundle graph (LCLI-497)", async () => {
    // Asserted directly rather than only through the conformance cases above, because those compare
    // the two backends and a regression that broke BOTH identically would slip past them. This one
    // names the backend it got: the failure mode being guarded is a downgrade to `reference`, which
    // still produces correct output.
    const indexed = await loadRetrievalGraph({ root, adapter, policy: "indexed", resolveGitCommit: () => null });
    const reference = await loadReferenceRetrievalGraph({ root, adapter, resolveGitCommit: () => null });
    try {
      expect(indexed.backend).toBe("indexed");
      const shape = (graph: typeof indexed.graph) =>
        graph.edges.map((edge) => `${edge.from}|${edge.to}|${edge.kind}|${edge.target}`);
      expect(shape(indexed.graph)).toEqual(shape(reference.graph));
      expect(shape(indexed.graph).some((edge) => edge.includes("|dependency|"))).toBe(false);
    } finally {
      await indexed.dispose?.();
      await reference.dispose?.();
    }
  });

  test("the automatic policy keeps the indexed backend when the tracker carries dependencies (LCLI-497)", async () => {
    // The `auto` path is the one every real invocation takes, and it is where the defect hid: it
    // catches an indexed failure and returns a correct reference graph, so no assertion about OUTPUT
    // can fail. Asserting the BACKEND is the only assertion that can.
    const automatic = await loadRetrievalGraph({ root, adapter, resolveGitCommit: () => null });
    try {
      expect(automatic.backend).toBe("indexed");
    } finally {
      await automatic.dispose?.();
    }
  });

  test("lexical score ties break by ascending id in both implementations", async () => {
    const reference = await invoke(referenceLoader, ["query", "tielex", "--json"]);
    const indexed = await invoke(indexedLoader, ["query", "tielex", "--json"]);
    expectSameResult(indexed, reference);
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
      expectSameResult(await invoke(indexedLoader, args), await invoke(referenceLoader, args));
    }
  });

  test("malformed source errors fall back to the exact reference error before stdout", async () => {
    writeFileSync(join(root, "docs/specs/archive.md"), "---\ntype: Spec\ntags: invalid-scalar\n---\n");
    const expected = await invoke(referenceLoader, ["graph", "--json"]);
    const actual = await invoke(automaticLoader, ["graph", "--json"]);
    expectSameResult(actual, expected);
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
    expectSameResult(indexed, await invoke(referenceLoader, ["graph", "--json"]));
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
    expectSameResult(recovered, expected);
    expect(readdirSync(join(root, LADYBUG_CACHE_REL_ROOT)).some((name) => name.startsWith(".corrupt-"))).toBe(true);
  });

  test("a verification failure is classified from a declared marker, not from its message (LCLI-498)", async () => {
    // The classifier reads a marker the driver stamps on every verification error, rather than
    // pattern-matching its prose. That distinction is the LCLI-497 lesson one layer up: a proxy that
    // happens to correlate with the thing you mean is not the thing you mean, and a message is free
    // to change without anyone noticing this stopped working.
    //
    // Staged with an injected reader rather than by corrupting a real generation, and the reason is
    // worth stating: the lifecycle QUARANTINES AND REBUILDS tampered bytes before a read can fail on
    // them (the test above proves exactly that), so corruption on disk produces a recovery, not a
    // verification failure. The error here is the real shape — constructed from the same exported
    // marker the driver's own `corrupt()` uses, so the two cannot drift.
    const stderr = capture();
    const result = await run(["bun", "lore", "graph", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr,
      isTTY: false,
      stderrIsTTY: false,
      env: {},
      adapter,
      retrieval: (options) =>
        loadRetrievalGraph({
          ...options,
          adapter,
          resolveGitCommit: () => null,
          loadNativeDriver: async () => {
            const real = (await import("../src/core/ladybug-driver")) as LadybugNativeDriver;
            return {
              ...real,
              openLadybugIndexedReader: (path, source) => ({
                ...real.openLadybugIndexedReader(path, source),
                readBundleGraph: () =>
                  Promise.reject(
                    new LoreError("validation", "Ladybug projection verification failed: staged", undefined, {
                      code: INDEXED_VERIFICATION_FAILURE,
                    }),
                  ),
              }),
            };
          },
        }),
    });
    expect(result).toBe(0);
    expect(stderr.text()).toContain(referenceFallbackMessage("verification-failed"));
    // And not the sentence every cause used to share.
    expect(stderr.text()).not.toContain(referenceFallbackMessage("driver-unavailable"));
    // The internal vocabulary from the cause never reaches the user.
    expect(stderr.text()).not.toMatch(/ladybug/i);
  });

  test("every fallback reason is a sentence the public contract can carry (LCLI-498 AC#3)", () => {
    // The closed set exists partly so this can be asserted over ALL of it rather than over whichever
    // reason a test happened to trigger. The storage engine is an implementation detail this CLI
    // does not expose, which is exactly why interpolating the underlying error — whose text reads
    // "Ladybug projection verification failed: …" — was not an option.
    for (const reason of REFERENCE_FALLBACK_REASONS) {
      const message = referenceFallbackMessage(reason);
      expect(message).not.toMatch(/MATCH \(|recordKey|projection\.lbdb|ladybug|databasePath|sourceFingerprint/i);
      expect(message).toContain("using the in-memory reference backend");
    }
    // ...and the reasons are distinct, which a set of identical sentences would not be.
    expect(new Set(REFERENCE_FALLBACK_REASONS.map(referenceFallbackMessage)).size).toBe(
      REFERENCE_FALLBACK_REASONS.length,
    );
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
    // The payload matches the reference backend's exactly; the stderr does not, and must not — this
    // route previously fell back with NO advisory at all, so its silence was indistinguishable from
    // the indexed path succeeding (LCLI-498). It now names the reason like every other route.
    expect(actual.code).toBe(expected.code);
    expect(stripRetrievalBackend(actual.stdout)).toBe(stripRetrievalBackend(expected.stdout));
    expect(actual.stderr).toContain(referenceFallbackMessage("generation-unavailable"));
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
    // Same shape as the compatibility case above: identical payload, plus the advisory this route
    // did not used to emit. A contended writer lock with no matching generation IS a fallback, and
    // saying so is the difference between a user who can act and one who cannot tell (LCLI-498).
    expect(actual.code).toBe(expected.code);
    expect(stripRetrievalBackend(actual.stdout)).toBe(stripRetrievalBackend(expected.stdout));
    expect(actual.stderr).toContain(referenceFallbackMessage("generation-unavailable"));
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
    expectSameResult(
      await invoke(automaticLoader, ["graph", "--json"]),
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
    // The reason is asserted, not merely that some advisory appeared (LCLI-498): a native read
    // failure is a DRIVER problem, and the sentence now says so instead of the one sentence that
    // used to cover every cause.
    expect(actual.stderr).toContain(referenceFallbackMessage("driver-unavailable"));
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
    expect(unavailable.stderr).toContain(referenceFallbackMessage("driver-unavailable"));
    expect(unavailable.stderr).not.toContain("private native loader detail");
    expect(readdirSync(generationRoot)).toEqual(generations);
    expect(readdirSync(cacheRoot).some((name) => name.startsWith(".corrupt-"))).toBe(false);
  });

  test("source preflight failures fall back without blaming or loading the native runtime", async () => {
    const privateDetail = "private Backlog source-read detail";
    const failingAdapter: BacklogAdapter = {
      ...adapter,
      listTasks: async () => {
        throw new Error(privateDetail);
      },
    };
    let loads = 0;
    const expected = await invoke(referenceLoader, ["graph", "--json"]);
    const actual = await invoke(
      (options) =>
        loadRetrievalGraph({
          ...options,
          adapter: failingAdapter,
          resolveGitCommit: () => null,
          loadNativeDriver: async () => {
            loads++;
            throw new Error("native loader must not run after a source preflight failure");
          },
        }),
      ["graph", "--json"],
    );

    expect(actual.code).toBe(expected.code);
    expect(actual.stdout).toBe(expected.stdout);
    expect(actual.stderr).toContain(referenceFallbackMessage("preflight-failed"));
    // ...and specifically NOT the driver reason, which is the distinction that did not exist before.
    expect(actual.stderr).not.toContain(referenceFallbackMessage("driver-unavailable"));
    expect(actual.stderr).not.toContain(privateDetail);
    expect(loads).toBe(0);
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
    expect(warnings.list()).toContain(referenceFallbackMessage("unsupported-platform"));
  });

  test("every route to the reference backend reports itself, warned or not (LCLI-499)", async () => {
    // `loadRetrievalGraph` reaches the reference backend by more than one route and they do NOT all
    // announce themselves: the unsupported-platform and failed-attempt routes warn, and the route
    // taken when no indexed generation exists returns `loadReferenceGraph(options)` with no advisory
    // at all. That is why empty stderr cannot be read as "indexed ran", and why the field had to be
    // a positive signal rather than the absence of a negative one.
    //
    // What makes the field total is structural rather than enumerated: there is exactly ONE function
    // producing a reference graph and `backend` is a REQUIRED field on `RetrievalGraph`, so a route
    // cannot return one without a stamp — the routes differ only in whether they also warn. The
    // three drivable from the public options are asserted here; the fourth returns the identical
    // call and cannot be forced through `RetrievalGraphOptions`, which is itself the reason this
    // test asserts the invariant rather than the instance.
    const explicit = await loadRetrievalGraph({ root, adapter, policy: "reference", resolveGitCommit: () => null });
    expect(explicit.backend).toBe("reference");
    await explicit.dispose?.();

    const unsupportedWarnings = new WarningCollector();
    const unsupported = await loadRetrievalGraph({
      root,
      adapter,
      platform: "win32",
      warnings: unsupportedWarnings,
      resolveGitCommit: () => null,
    });
    expect(unsupported.backend).toBe("reference");
    expect(unsupportedWarnings.list().join("\n")).toContain("using the in-memory reference backend");
    await unsupported.dispose?.();

    const failedWarnings = new WarningCollector();
    const failed = await loadRetrievalGraph({
      root,
      adapter,
      warnings: failedWarnings,
      resolveGitCommit: () => null,
      loadNativeDriver: async () => {
        throw new Error("native boundary is unavailable for this test");
      },
    });
    expect(failed.backend).toBe("reference");
    expect(failedWarnings.list().join("\n")).toContain("using the in-memory reference backend");
    await failed.dispose?.();
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
