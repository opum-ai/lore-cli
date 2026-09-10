import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXPLORER_INTERACTION_CONTRACT,
  EXPLORER_PRESENTATION_SCHEMA_VERSION,
  EXPLORER_REFRESH_CONTRACT,
  EXPLORER_RENDER_LIMITS,
  explorerPresentationStateSchema,
  parseExplorerSnapshot,
  serializeExplorerSnapshot,
} from "../src/core/explorer-contract";

const fixturePath = join(import.meta.dir, "fixtures/explorer/v1.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
const spec = readFileSync(
  join(import.meta.dir, "../docs/specs/graph-explorer-data-and-interaction-contract.md"),
  "utf8",
);
const specText = spec.replace(/\s+/gu, " ");

describe("graph explorer contract", () => {
  test("preserves repositories, concepts, tasks, duplicate/dangling edges, supersession, and provenance", () => {
    const snapshot = parseExplorerSnapshot(fixture);
    expect(snapshot.health.counts).toEqual({
      repositories: 1,
      concepts: 3,
      tasks: 1,
      authoredEdges: 5,
      danglingEdges: 1,
      duplicateEdges: 1,
    });
    expect(snapshot.facts.authoredEdges.filter((edge) => edge.target === "../index.md")).toHaveLength(2);
    expect(snapshot.facts.authoredEdges.find((edge) => edge.dangling)?.toRecordKey).toBeNull();
    expect(snapshot.facts.authoredEdges.find((edge) => edge.edgeKind === "supersedes")?.target).toBe("specs/old");
    expect(snapshot.facts.concepts[0]?.sourcePath).toBe("docs/specs/new.md");
    expect(snapshot.facts.tasks[0]?.status).toBe("In Progress");
    expect(snapshot.source.gitCommit).toBe("dddddddddddddddddddddddddddddddddddddddd");
  });

  test("serializes deterministic static bytes without presentation or database surfaces", () => {
    const first = serializeExplorerSnapshot(fixture);
    const second = serializeExplorerSnapshot(JSON.parse(first));
    expect(second).toBe(first);
    expect(first.endsWith("\n")).toBeTrue();
    for (const forbidden of ["coordinates", "databasePassword", "databaseUri", "rawCypher"]) {
      expect(first).not.toContain(forbidden);
    }
    expect(EXPLORER_REFRESH_CONTRACT).toEqual({
      hosts: ["127.0.0.1", "::1"],
      method: "GET",
      responseSchemaVersion: "lore-explorer-snapshot/1",
      canonicalSnapshotBytes: true,
      sameOriginOnly: true,
      acceptsQueryLanguage: false,
      acceptsDatabaseConfiguration: false,
      acceptsWrites: false,
    });
  });

  test("keeps layout coordinates in bounded disposable presentation state", () => {
    const snapshot = parseExplorerSnapshot(fixture);
    const recordKey = snapshot.facts.concepts[0]?.recordKey;
    expect(recordKey).toBeDefined();
    if (recordKey === undefined) throw new Error("fixture concept is missing");
    expect(() => parseExplorerSnapshot({ ...fixture, presentation: {} })).toThrow();
    const presentation = explorerPresentationStateSchema.parse({
      schemaVersion: EXPLORER_PRESENTATION_SCHEMA_VERSION,
      snapshotKey: snapshot.source.snapshotKey,
      filters: { search: "", kinds: ["concept"], statuses: [], edgeKinds: [], graphHealth: [] },
      selection: { selectedRecordKey: null, focusRecordKey: null, depth: EXPLORER_RENDER_LIMITS.maximumFocusDepth },
      layout: {
        algorithmVersion: "fixture-layout/1",
        coordinates: [{ recordKey, x: 10, y: 20 }],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });
    expect(presentation.layout.coordinates[0]).toEqual({ recordKey, x: 10, y: 20 });
  });

  test("fails loud on non-canonical order, provenance drift, unknown targets, and credential fields", () => {
    const parsed = parseExplorerSnapshot(fixture);
    const firstConcept = parsed.facts.concepts[0];
    if (firstConcept === undefined) throw new Error("fixture concept is missing");
    expect(() =>
      parseExplorerSnapshot({
        ...parsed,
        facts: { ...parsed.facts, concepts: [...parsed.facts.concepts].reverse() },
      }),
    ).toThrow("concepts must be unique and sorted");
    expect(() =>
      parseExplorerSnapshot({
        ...parsed,
        source: { ...parsed.source, databasePassword: "secret" },
      }),
    ).toThrow();
    expect(() =>
      parseExplorerSnapshot({
        ...parsed,
        facts: {
          ...parsed.facts,
          concepts: [{ ...firstConcept, sourcePath: "docs/./non-canonical.md" }, ...parsed.facts.concepts.slice(1)],
        },
      }),
    ).toThrow("repository-relative POSIX paths");
    expect(() =>
      parseExplorerSnapshot({
        ...parsed,
        facts: {
          ...parsed.facts,
          authoredEdges: parsed.facts.authoredEdges.map((edge, index) =>
            index === 0
              ? { ...edge, toRecordKey: "sha256:abababababababababababababababababababababababababababababababab" }
              : edge,
          ),
        },
      }),
    ).toThrow("missing edge target");
  });

  test("makes empty, stale, corrupt, and large-graph states deterministic", () => {
    const parsed = parseExplorerSnapshot(fixture);
    const empty = parseExplorerSnapshot({
      ...parsed,
      facts: { repositories: [], concepts: [], tasks: [], authoredEdges: [] },
      health: {
        state: "empty",
        messageCode: null,
        counts: { repositories: 0, concepts: 0, tasks: 0, authoredEdges: 0, danglingEdges: 0, duplicateEdges: 0 },
        warnings: [],
      },
    });
    expect(empty.health.state).toBe("empty");

    for (const state of ["stale", "corrupt"] as const) {
      expect(
        parseExplorerSnapshot({ ...parsed, health: { ...parsed.health, state, messageCode: `explorer.${state}` } })
          .health.state,
      ).toBe(state);
      expect(() =>
        parseExplorerSnapshot({ ...parsed, health: { ...parsed.health, state, messageCode: null } }),
      ).toThrow("requires a stable message code");
    }

    const oversizedCoordinates = Array.from({ length: EXPLORER_RENDER_LIMITS.maximumVisibleNodes + 1 }, (_, index) => ({
      recordKey: `sha256:${index.toString(16).padStart(64, "0")}`,
      x: index,
      y: index,
    }));
    expect(() =>
      explorerPresentationStateSchema.parse({
        schemaVersion: EXPLORER_PRESENTATION_SCHEMA_VERSION,
        snapshotKey: parsed.source.snapshotKey,
        filters: { search: "", kinds: [], statuses: [], edgeKinds: [], graphHealth: [] },
        selection: { selectedRecordKey: null, focusRecordKey: null, depth: 0 },
        layout: {
          algorithmVersion: "fixture-layout/1",
          coordinates: oversizedCoordinates,
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
    ).toThrow();
  });

  test("freezes testable interaction requirements for every required state", () => {
    const requirements = [
      EXPLORER_INTERACTION_CONTRACT.keyboard,
      EXPLORER_INTERACTION_CONTRACT.screenReader,
      EXPLORER_INTERACTION_CONTRACT.color,
      EXPLORER_INTERACTION_CONTRACT.responsive,
      EXPLORER_INTERACTION_CONTRACT.empty,
      EXPLORER_INTERACTION_CONTRACT.corrupt,
      EXPLORER_INTERACTION_CONTRACT.stale,
      EXPLORER_INTERACTION_CONTRACT.largeGraph,
    ];
    expect(requirements.map((requirement) => requirement.id)).toEqual([
      "KBD-01",
      "SR-01",
      "COLOR-01",
      "RESPONSIVE-01",
      "EMPTY-01",
      "CORRUPT-01",
      "STALE-01",
      "SCALE-01",
    ]);
    for (const requirement of requirements) {
      expect(spec).toContain(`\`${requirement.id}\``);
    }
    expect(EXPLORER_INTERACTION_CONTRACT.keyboard.pointerRequired).toBeFalse();
    expect(EXPLORER_INTERACTION_CONTRACT.screenReader.equivalentListRequired).toBeTrue();
    expect(EXPLORER_INTERACTION_CONTRACT.color.redundantNonColorCueRequired).toBeTrue();
    expect(EXPLORER_INTERACTION_CONTRACT.responsive).toMatchObject({
      minimumViewportCssPixels: 320,
      zoomPercent: 200,
      twoDimensionalPageScrollAllowed: false,
    });
    expect(EXPLORER_INTERACTION_CONTRACT.empty.navigationEnabled).toBeFalse();
    expect(EXPLORER_INTERACTION_CONTRACT.corrupt.destructiveActionAllowed).toBeFalse();
    expect(EXPLORER_INTERACTION_CONTRACT.stale.preservesLastCompleteViewOnRefreshFailure).toBeTrue();
    expect(EXPLORER_INTERACTION_CONTRACT.largeGraph.limits).toBe(EXPLORER_RENDER_LIMITS);
    expect(spec).toContain("127.0.0.1");
    expect(specText).toContain("same canonical snapshot bytes");
    expect(spec).toContain("never accepts Cypher");
  });
});
