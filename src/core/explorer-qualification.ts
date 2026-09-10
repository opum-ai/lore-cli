/** Frozen browser and scale qualification for the static graph explorer. */

export const EXPLORER_QUALIFICATION_SCHEMA_VERSION = "lore-explorer-qualification/1" as const;

export const EXPLORER_SUPPORTED_BROWSERS = Object.freeze(["chromium", "firefox", "webkit"] as const);

export const EXPLORER_LARGE_FIXTURE = Object.freeze({
  seed: "lore-explorer-large-v1",
  concepts: 5_000,
  tasks: 1_000,
  authoredEdges: 10_000,
});

export const EXPLORER_QUALIFICATION_BUDGETS = Object.freeze({
  artifactBytes: 32 * 1024 * 1024,
  loadMilliseconds: 15_000,
  interactionMilliseconds: 2_500,
  mountedElements: 7_500,
  heapBytes: 512 * 1024 * 1024,
});

export interface ExplorerQualificationFixture {
  readonly schemaVersion: typeof EXPLORER_QUALIFICATION_SCHEMA_VERSION;
  readonly playwrightVersion: "1.62.1";
  readonly browsers: typeof EXPLORER_SUPPORTED_BROWSERS;
  readonly seed: typeof EXPLORER_LARGE_FIXTURE.seed;
  readonly records: {
    readonly concepts: typeof EXPLORER_LARGE_FIXTURE.concepts;
    readonly tasks: typeof EXPLORER_LARGE_FIXTURE.tasks;
    readonly authoredEdges: typeof EXPLORER_LARGE_FIXTURE.authoredEdges;
  };
  readonly budgets: {
    readonly artifactBytes: number;
    readonly loadMilliseconds: number;
    readonly interactionMilliseconds: number;
    readonly mountedElements: number;
    readonly heapBytes: number;
  };
}

export function assertExplorerQualificationFixture(value: unknown): ExplorerQualificationFixture {
  const expected: ExplorerQualificationFixture = {
    schemaVersion: EXPLORER_QUALIFICATION_SCHEMA_VERSION,
    playwrightVersion: "1.62.1",
    browsers: EXPLORER_SUPPORTED_BROWSERS,
    seed: EXPLORER_LARGE_FIXTURE.seed,
    records: {
      concepts: EXPLORER_LARGE_FIXTURE.concepts,
      tasks: EXPLORER_LARGE_FIXTURE.tasks,
      authoredEdges: EXPLORER_LARGE_FIXTURE.authoredEdges,
    },
    budgets: EXPLORER_QUALIFICATION_BUDGETS,
  };
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`explorer qualification fixture must match ${EXPLORER_QUALIFICATION_SCHEMA_VERSION}`);
  }
  return expected;
}
