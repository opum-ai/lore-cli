import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildExplorerSnapshot,
  deriveExplorerView,
  explorerArtifactDigest,
  renderExplorerArtifact,
} from "../src/core/explorer";
import { type ExplorerSnapshot, parseExplorerSnapshot, serializeExplorerSnapshot } from "../src/core/explorer-contract";
import type { LadybugProjectionSource } from "../src/core/ladybug-source";

const fixture = parseExplorerSnapshot(
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures/explorer/v1.json"), "utf8")),
);

describe("explorer production snapshot", () => {
  test("maps the indexed projection source into canonical browser facts and health", () => {
    const source = sourceFromFixture(fixture);
    const snapshot = buildExplorerSnapshot(source);
    expect(snapshot.source).toEqual(fixture.source);
    expect(snapshot.facts.repositories[0]?.displayName).toBe("Fixture root");
    expect(snapshot.facts.concepts.map((record) => record.recordKey)).toEqual(
      [...fixture.facts.concepts].map((record) => record.recordKey).sort(),
    );
    expect(snapshot.facts.tasks[0]).toMatchObject({ taskId: "TASK-1", status: "In Progress", sourcePath: null });
    expect(snapshot.facts.authoredEdges.find((edge) => edge.dangling)?.sourcePath).toBe("docs/specs/new.md");
    expect(snapshot.health.counts).toEqual(fixture.health.counts);
    expect(serializeExplorerSnapshot(snapshot)).toBe(serializeExplorerSnapshot(buildExplorerSnapshot(source)));
  });

  test("normalizes oversized presentation strings without leaking bodies or database configuration", () => {
    const source = sourceFromFixture(fixture);
    const first = source.concepts[0];
    if (first === undefined) throw new Error("fixture concept missing");
    const snapshot = buildExplorerSnapshot({
      ...source,
      concepts: [
        {
          ...first,
          frontmatter: { ...first.frontmatter, title: "x".repeat(2_000), summary: "y".repeat(6_000) },
          body: "private body databasePassword rawCypher",
        },
        ...source.concepts.slice(1),
      ],
    });
    const mapped = snapshot.facts.concepts.find((record) => record.recordKey === first.key);
    expect(mapped?.title?.length).toBe(1_024);
    expect(mapped?.summary?.length).toBe(4_096);
    const bytes = serializeExplorerSnapshot(snapshot);
    expect(bytes).not.toContain("private body");
    expect(bytes).not.toContain("databasePassword");
    expect(bytes).not.toContain("rawCypher");
  });
});

describe("explorer view model", () => {
  test("supports search, kind/status filters, bounded depth focus, and relationship highlighting", () => {
    expect(deriveExplorerView(fixture, { search: "RETAINED SUPERSEDED" }).nodes.map((node) => node.id)).toEqual([
      "specs/old",
    ]);
    expect(
      deriveExplorerView(fixture, { kinds: ["task"], statuses: ["in progress"] }).nodes.map((node) => node.id),
    ).toEqual(["TASK-1"]);
    expect(deriveExplorerView(fixture, { types: ["Spec"] }).nodes.map((node) => node.id)).toEqual([
      "specs/new",
      "specs/old",
    ]);
    expect(deriveExplorerView(fixture, { search: "docs/specs/new.md" }).nodes.map((node) => node.id)).toEqual([
      "specs/new",
    ]);
    const root = fixture.facts.concepts.find((record) => record.conceptId === "specs/new");
    const old = fixture.facts.concepts.find((record) => record.conceptId === "specs/old");
    if (root === undefined) throw new Error("fixture root missing");
    if (old === undefined) throw new Error("fixture old concept missing");
    const focused = deriveExplorerView(fixture, {
      focusRecordKey: root.recordKey,
      selectedRecordKey: root.recordKey,
      depth: 1,
    });
    expect(new Set(focused.nodes.map((node) => node.id))).toEqual(
      new Set(["specs/new", "index", "specs/old", "TASK-1"]),
    );
    expect(focused.edges.some((edge) => edge.relation === "outbound")).toBeTrue();
    expect(focused.edges.some((edge) => edge.dangling && edge.target === "missing.md")).toBeTrue();
    expect(focused.supersessionChain).toEqual([root.recordKey, old.recordKey].sort());
  });

  test("renders empty, single-node, cyclic, disconnected, duplicate-edge, Unicode, and large graphs", () => {
    const shapes = requiredShapes(fixture);
    for (const [name, snapshot] of Object.entries(shapes)) {
      const html = renderExplorerArtifact(snapshot);
      expect(html.startsWith("<!doctype html>"), name).toBeTrue();
      expect(html.endsWith("\n"), name).toBeTrue();
      expect(explorerArtifactDigest(html), name).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    expect(deriveExplorerView(shapes.empty).nodes).toEqual([]);
    expect(deriveExplorerView(shapes.single).nodes).toHaveLength(2); // repository + one concept
    const cycleFocus = shapes.cyclic.facts.concepts[0]?.recordKey;
    expect(deriveExplorerView(shapes.cyclic, { focusRecordKey: cycleFocus, depth: 4 }).nodes).toHaveLength(2);
    expect(deriveExplorerView(shapes.disconnected, { focusRecordKey: cycleFocus, depth: 4 }).nodes).toHaveLength(1);
    expect(deriveExplorerView(shapes.duplicate).edges.filter((edge) => edge.target === "../index.md")).toHaveLength(2);
    expect(deriveExplorerView(shapes.unicode, { search: "東京" }).nodes).toHaveLength(1);
    expect(deriveExplorerView(shapes.large).truncated).toBeTrue();
  });
});

describe("self-contained explorer artifact", () => {
  test("embeds canonical bytes under an offline CSP and implements every required interaction", () => {
    const html = renderExplorerArtifact(fixture);
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toMatch(/<(?:script|img)[^>]+src=/iu);
    expect(html).not.toMatch(/<link[^>]+href=/iu);
    for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "rawCypher", "databasePassword"]) {
      expect(html).not.toContain(forbidden);
    }
    for (const required of [
      "Search",
      "Record kind",
      "Status",
      "Focus depth",
      "Inbound",
      "Outbound",
      "dangling",
      "Supersession chain",
      "sourcePath",
      "exportDigest",
    ]) {
      expect(html).toContain(required);
    }
    expect(renderExplorerArtifact(JSON.parse(serializeExplorerSnapshot(fixture)))).toBe(html);
  });

  test("executes the embedded runtime through a DOM harness for search, selection, details, and focus", () => {
    const html = renderExplorerArtifact(fixture);
    const script = html.match(/<script>\n([\s\S]*?)\n<\/script>/u)?.[1];
    if (script === undefined) throw new Error("embedded runtime missing");
    const document = new FakeDocument([
      "provenance",
      "health",
      "status-heading",
      "announcement",
      "kind-filters",
      "type-filter",
      "status",
      "search",
      "depth",
      "clear-focus",
      "nodes",
      "counts",
      "details",
    ]);
    const browserWindow: Record<string, unknown> = {};
    new Function("document", "window", "atob", "TextDecoder", script)(
      document,
      browserWindow,
      globalThis.atob,
      TextDecoder,
    );

    expect(document.getElementById("counts").textContent).toBe("5 of 5 matching records");
    document.getElementById("search").dispatch("input", { target: { value: "retained superseded" } });
    expect(document.getElementById("counts").textContent).toBe("1 of 1 matching records");
    expect(document.getElementById("nodes").children).toHaveLength(1);

    document.getElementById("search").dispatch("input", { target: { value: "" } });
    const firstButton = document.getElementById("nodes").children[0]?.children[0];
    if (firstButton === undefined) throw new Error("first record button missing");
    firstButton.dispatch("click", { target: firstButton });
    expect(flattenText(document.getElementById("details"))).toContain("Relationships");
    expect(flattenText(document.getElementById("details"))).toContain("Export");
    const focusButton = findAllByTag(document.getElementById("details"), "button").find((button) =>
      flattenText(button).includes("Focus this record"),
    );
    if (focusButton === undefined) throw new Error("focus button missing");
    focusButton.dispatch("click", { target: focusButton });
    const runtime = browserWindow.__LORE_EXPLORER__ as { state: { focus: string | null } };
    expect(runtime.state.focus).not.toBeNull();
  });
});

class FakeElement {
  readonly listeners = new Map<
    string,
    (event: { target: unknown; key?: string; preventDefault?: () => void }) => void
  >();
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  textContent = "";
  className = "";
  type = "";
  value = "";
  checked = false;
  disabled = false;
  hidden = false;
  tabIndex = 0;
  focused = false;

  constructor(readonly tagName: string) {}

  append(...children: Array<FakeElement | { textContent: string }>): void {
    for (const child of children) {
      if (child instanceof FakeElement) this.children.push(child);
      else this.children.push(Object.assign(new FakeElement("#text"), { textContent: child.textContent }));
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  addEventListener(
    type: string,
    listener: (event: { target: unknown; key?: string; preventDefault?: () => void }) => void,
  ): void {
    this.listeners.set(type, listener);
  }

  dispatch(type: string, event: { target: unknown; key?: string; preventDefault?: () => void }): void {
    const listener = this.listeners.get(type);
    if (listener === undefined) throw new Error(`listener ${type} missing on ${this.tagName}`);
    listener(event);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  focus(): void {
    this.focused = true;
  }
}

class FakeDocument {
  private readonly elements = new Map<string, FakeElement>();

  constructor(ids: readonly string[]) {
    for (const id of ids) this.elements.set(id, new FakeElement("div"));
  }

  getElementById(id: string): FakeElement {
    const element = this.elements.get(id);
    if (element === undefined) throw new Error(`element ${id} missing`);
    return element;
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  createTextNode(textContent: string): { textContent: string } {
    return { textContent };
  }
}

function flattenText(element: FakeElement): string {
  return [element.textContent, ...element.children.map(flattenText)].join(" ");
}

function findAllByTag(element: FakeElement, tagName: string): FakeElement[] {
  return [
    ...(element.tagName === tagName ? [element] : []),
    ...element.children.flatMap((child) => findAllByTag(child, tagName)),
  ];
}

function sourceFromFixture(snapshot: ExplorerSnapshot): LadybugProjectionSource {
  return {
    manifest: {
      record: "manifest",
      schemaVersion: "1.0",
      bundle: {
        id: snapshot.source.bundleId,
        okfVersion: "0.1",
        docsRoot: snapshot.source.docsRoot,
        gitCommit: snapshot.source.gitCommit,
      },
      exporter: { name: "lore", version: "0.0.0" },
      generatedAt: null,
      normalizationVersion: "1",
    },
    trailer: { record: "trailer", recordCount: 0, streamHash: snapshot.source.exportDigest },
    concepts: snapshot.facts.concepts.map((record) => ({
      record: "concept",
      key: record.recordKey,
      id: record.conceptId,
      path: record.sourcePath as string,
      type: record.conceptType,
      frontmatter: {
        title: record.conceptId === "index" ? "Fixture root" : record.title,
        summary: record.summary,
        status: record.status,
        tags: record.tags,
      },
      body: "body excluded from explorer",
      contentHash: record.contentHash,
      tokenEstimate: record.tokenEstimate,
    })),
    tasks: snapshot.facts.tasks.map((record) => ({
      record: "task",
      key: record.recordKey,
      id: record.taskId,
      title: record.title,
      status: record.status,
      labels: record.labels,
      priority: record.priority,
      ordinal: null,
      assignees: record.assignees,
      milestone: record.milestone,
      parentTaskId: record.parentTaskId,
      sourceAdapterVersion: "backlog-json/1",
    })),
    authoredEdges: snapshot.facts.authoredEdges.map((record) => ({
      record: "edge",
      key: record.recordKey,
      from: record.fromRecordKey,
      to: record.toRecordKey,
      kind: record.edgeKind,
      target: record.target,
      ordinal: record.ordinal,
      dangling: record.dangling,
    })),
    repositoryScopeKey: snapshot.source.repositoryScopeKey,
    snapshotKey: snapshot.source.snapshotKey,
    exportDigest: snapshot.source.exportDigest,
    sourceFingerprint: snapshot.source.sourceFingerprint,
    warnings: snapshot.health.warnings,
    records: [],
    inventory: [],
    profileInventory: [],
    commitKey: null,
    taskSnapshotDigest: snapshot.source.exportDigest,
    sourceRecordsDigest: snapshot.source.exportDigest,
    recordKeysDigest: snapshot.source.exportDigest,
    inputFingerprint: snapshot.source.sourceFingerprint,
    warningsComplete: true,
    generationKey: "fixture",
    ladybugVersion: "0.19.0",
    ladybugStorageVersion: "43",
    counts: {
      concepts: snapshot.facts.concepts.length,
      tasks: snapshot.facts.tasks.length,
      authoredEdges: snapshot.facts.authoredEdges.length,
    },
  } as LadybugProjectionSource;
}

interface RequiredShapes {
  readonly empty: ExplorerSnapshot;
  readonly single: ExplorerSnapshot;
  readonly cyclic: ExplorerSnapshot;
  readonly disconnected: ExplorerSnapshot;
  readonly duplicate: ExplorerSnapshot;
  readonly unicode: ExplorerSnapshot;
  readonly large: ExplorerSnapshot;
}

function requiredShapes(base: ExplorerSnapshot): RequiredShapes {
  const concept = base.facts.concepts[0] as ExplorerSnapshot["facts"]["concepts"][number];
  const second = base.facts.concepts[1] as ExplorerSnapshot["facts"]["concepts"][number];
  const third = base.facts.concepts[2] as ExplorerSnapshot["facts"]["concepts"][number];
  const edge = base.facts.authoredEdges[0] as ExplorerSnapshot["facts"]["authoredEdges"][number];
  const reverse = {
    ...edge,
    recordKey: digestKey(250),
    fromRecordKey: second.recordKey,
    toRecordKey: concept.recordKey,
    target: concept.conceptId,
    ordinal: 0,
  };
  const forward = { ...edge, target: second.conceptId, ordinal: 0 };
  const largeConcepts = Array.from({ length: 800 }, (_, index) => ({
    ...concept,
    recordKey: digestKey(index + 1_000),
    conceptId: `specs/large-${index.toString().padStart(4, "0")}`,
    sourcePath: `docs/specs/large-${index.toString().padStart(4, "0")}.md`,
    contentHash: digestKey(index + 10_000),
  }));
  return {
    empty: shape(base, [], [], [], []),
    single: shape(base, base.facts.repositories, [concept], [], []),
    cyclic: shape(base, base.facts.repositories, [concept, second], [], [forward, reverse]),
    disconnected: shape(base, base.facts.repositories, [concept, second, third], [], []),
    duplicate: base,
    unicode: shape(base, base.facts.repositories, [{ ...concept, title: "東京の設計 🚀" }], [], []),
    large: shape(base, base.facts.repositories, largeConcepts, [], []),
  };
}

function shape(
  base: ExplorerSnapshot,
  repositories: ExplorerSnapshot["facts"]["repositories"],
  concepts: ExplorerSnapshot["facts"]["concepts"],
  tasks: ExplorerSnapshot["facts"]["tasks"],
  authoredEdges: ExplorerSnapshot["facts"]["authoredEdges"],
): ExplorerSnapshot {
  const sortedEdges = [...authoredEdges].sort((a, b) => {
    const key = (value: typeof a) =>
      [
        value.fromRecordKey,
        value.edgeKind,
        value.target,
        String(value.ordinal).padStart(16, "0"),
        value.recordKey,
      ].join("\0");
    return key(a).localeCompare(key(b), "en");
  });
  const seen = new Set<string>();
  let duplicateEdges = 0;
  for (const value of sortedEdges) {
    const key = [value.fromRecordKey, value.edgeKind, value.target].join("\0");
    if (seen.has(key)) duplicateEdges += 1;
    seen.add(key);
  }
  const facts = {
    repositories: [...repositories],
    concepts: [...concepts].sort((a, b) => a.recordKey.localeCompare(b.recordKey, "en")),
    tasks: [...tasks].sort((a, b) => a.recordKey.localeCompare(b.recordKey, "en")),
    authoredEdges: sortedEdges,
  };
  const factCount = facts.concepts.length + facts.tasks.length + facts.authoredEdges.length;
  return parseExplorerSnapshot({
    ...base,
    facts,
    health: {
      state: factCount === 0 ? "empty" : "ready",
      messageCode: null,
      counts: {
        repositories: facts.repositories.length,
        concepts: facts.concepts.length,
        tasks: facts.tasks.length,
        authoredEdges: facts.authoredEdges.length,
        danglingEdges: facts.authoredEdges.filter((value) => value.dangling).length,
        duplicateEdges,
      },
      warnings: [],
    },
  });
}

function digestKey(index: number): `sha256:${string}` {
  return `sha256:${index.toString(16).padStart(64, "0")}`;
}
