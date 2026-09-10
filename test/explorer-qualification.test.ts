import { describe, expect, test } from "bun:test";
import { renderExplorerArtifact } from "../src/core/explorer";
import {
  EXPLORER_LARGE_FIXTURE,
  EXPLORER_QUALIFICATION_BUDGETS,
  EXPLORER_SUPPORTED_BROWSERS,
} from "../src/core/explorer-qualification";
import { buildLargeExplorerFixture, loadQualificationFixture } from "./support/explorer-browser-fixture";

describe("explorer qualification contract", () => {
  test("keeps the versioned fixture, browser matrix, and budgets synchronized", () => {
    const fixture = loadQualificationFixture();
    expect(fixture.browsers).toEqual(EXPLORER_SUPPORTED_BROWSERS);
    expect(fixture.seed).toBe(EXPLORER_LARGE_FIXTURE.seed);
    expect(fixture.records).toEqual({
      concepts: EXPLORER_LARGE_FIXTURE.concepts,
      tasks: EXPLORER_LARGE_FIXTURE.tasks,
      authoredEdges: EXPLORER_LARGE_FIXTURE.authoredEdges,
    });
    expect(fixture.budgets).toEqual(EXPLORER_QUALIFICATION_BUDGETS);
  });

  test("generates the exact deterministic large graph within its artifact budget", () => {
    const first = buildLargeExplorerFixture();
    const second = buildLargeExplorerFixture();
    expect(first.health.counts.concepts + first.health.counts.tasks).toBe(6_000);
    expect(first.health.counts.authoredEdges).toBe(10_000);
    const html = renderExplorerArtifact(first);
    expect(Buffer.byteLength(html)).toBeLessThanOrEqual(EXPLORER_QUALIFICATION_BUDGETS.artifactBytes);
    expect(renderExplorerArtifact(second)).toBe(html);
  });
});
