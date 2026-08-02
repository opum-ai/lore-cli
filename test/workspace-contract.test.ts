import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWorkspaceIdentity,
  classifyWorkspaceTransition,
  namespaceWorkspaceRecord,
  parseWorkspaceManifest,
  serializeWorkspaceIdentity,
  serializeWorkspaceManifest,
  WORKSPACE_IDENTITY_SCHEMA_VERSION,
  WORKSPACE_LINK_CONTRACT,
  WORKSPACE_MANIFEST_SCHEMA_VERSION,
  WORKSPACE_STORAGE_CONTRACT,
  type WorkspaceMemberObservation,
  type WorkspaceSourceSnapshot,
} from "../src/core/workspace-contract";

interface Fixture {
  readonly schemaVersion: string;
  readonly manifest: unknown;
  readonly sources: readonly WorkspaceSourceSnapshot[];
  readonly record: {
    readonly kind: "concept";
    readonly sourceRecordKey: string;
    readonly sourcePath: string;
  };
}

const fixture = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "workspace", "v1.json"), "utf8")) as Fixture;
const spec = readFileSync(join(import.meta.dir, "..", "docs", "specs", "local-workspace-identity-contract.md"), "utf8");
const roadmap = readFileSync(join(import.meta.dir, "..", "docs", "specs", "local-graph-platform-roadmap.md"), "utf8");

describe("local workspace identity contract", () => {
  test("requires explicit canonical membership and explicit namespaced links", () => {
    const manifest = parseWorkspaceManifest(fixture.manifest);
    expect(fixture.schemaVersion).toBe("lore-workspace-conformance/1");
    expect(manifest.schemaVersion).toBe(WORKSPACE_MANIFEST_SCHEMA_VERSION);
    expect(manifest.members.map((member) => member.memberId)).toEqual(["api-primary", "api-secondary"]);
    expect(manifest.members.map((member) => member.displayName)).toEqual(["Lore API", "Lore API"]);
    expect(manifest.links[0]?.from.memberId).toBe("api-primary");
    expect(manifest.links[0]?.to.memberId).toBe("api-secondary");

    expect(() => parseWorkspaceManifest({ ...manifest, members: [...manifest.members].reverse() })).toThrow(
      "workspace members must be unique and sorted",
    );
    expect(() =>
      parseWorkspaceManifest({
        ...manifest,
        links: [
          {
            ...manifest.links[0],
            to: { memberId: "not-selected", kind: "task", id: "LAPI-10" },
          },
        ],
      }),
    ).toThrow("unknown link target member not-selected");
    expect(() => parseWorkspaceManifest({ ...manifest, allRepositories: true })).toThrow();
  });

  test("serializes canonical manifest bytes and rejects duplicate explicit links", () => {
    const first = serializeWorkspaceManifest(fixture.manifest);
    expect(serializeWorkspaceManifest(JSON.parse(first))).toBe(first);
    expect(first.endsWith("\n")).toBeTrue();

    const manifest = parseWorkspaceManifest(fixture.manifest);
    const link = manifest.links[0];
    if (link === undefined) throw new Error("fixture link is missing");
    expect(() =>
      parseWorkspaceManifest({
        ...manifest,
        links: [link, { ...link, linkId: "duplicate-endpoint" }].sort((a, b) => a.linkId.localeCompare(b.linkId)),
      }),
    ).toThrow("duplicate explicit link");
  });

  test("namespaces duplicate repositories and source records without reinterpreting M6 keys", () => {
    const identity = buildWorkspaceIdentity(fixture.manifest, fixture.sources);
    expect(identity.schemaVersion).toBe(WORKSPACE_IDENTITY_SCHEMA_VERSION);
    expect(identity.repositories).toHaveLength(2);
    expect(identity.links).toHaveLength(1);
    expect(identity.links[0]?.workspaceLinkKey).toMatch(/^sha256:[0-9a-f]{64}$/u);
    const primary = identity.repositories[0];
    const secondary = identity.repositories[1];
    if (primary === undefined || secondary === undefined) throw new Error("fixture repositories are missing");

    expect(primary.source.repositoryScopeKey).toBe(secondary.source.repositoryScopeKey);
    expect(primary.source.bundleId).toBe(secondary.source.bundleId);
    for (const field of ["memberKey", "repositoryKey", "bundleKey", "commitKey", "exportKey"] as const) {
      expect(primary[field]).not.toBe(secondary[field]);
    }

    const primaryKeys = new Set<string>();
    for (const kind of ["concept", "task", "authored-edge"] as const) {
      const primaryRecord = namespaceWorkspaceRecord(
        primary,
        kind,
        fixture.record.sourceRecordKey,
        fixture.record.sourcePath,
      );
      const secondaryRecord = namespaceWorkspaceRecord(
        secondary,
        kind,
        fixture.record.sourceRecordKey,
        fixture.record.sourcePath,
      );
      expect(primaryRecord.sourceRecordKey).toBe(secondaryRecord.sourceRecordKey);
      expect(primaryRecord.workspaceRecordKey).not.toBe(secondaryRecord.workspaceRecordKey);
      expect(primaryRecord.workspaceSourceKey).not.toBe(secondaryRecord.workspaceSourceKey);
      primaryKeys.add(primaryRecord.workspaceRecordKey);
    }
    expect(primaryKeys.size).toBe(3);
  });

  test("excludes local locators and database surfaces from projection identity bytes", () => {
    const identity = buildWorkspaceIdentity(fixture.manifest, fixture.sources);
    const serialized = serializeWorkspaceIdentity(identity);
    expect(serialized).toContain(WORKSPACE_IDENTITY_SCHEMA_VERSION);
    for (const forbidden of ["../lore-api", "locator", "databaseUri", "databasePassword", "rawCypher", "MATCH ("]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(() => serializeWorkspaceIdentity({ ...identity, locator: "/private/repositories/lore-api" })).toThrow();
    expect(() =>
      serializeWorkspaceIdentity({
        ...identity,
        repositories: identity.repositories.map((repository, index) =>
          index === 0
            ? { ...repository, source: { ...repository.source, locator: "D:/private/lore-api" } }
            : repository,
        ),
      }),
    ).toThrow();

    const manifest = parseWorkspaceManifest(fixture.manifest);
    const relocated = {
      ...manifest,
      members: manifest.members.map((member, index) => ({
        ...member,
        locator: index === 0 ? "/Volumes/example/renamed-api" : "D:/worktrees/lore-api",
      })),
    };
    expect(buildWorkspaceIdentity(relocated, fixture.sources)).toEqual(identity);

    const changedBundleSources = fixture.sources.map((source, index) =>
      index === 0
        ? { ...source, bundleId: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }
        : source,
    );
    expect(buildWorkspaceIdentity(manifest, changedBundleSources).snapshotKey).not.toBe(identity.snapshotKey);
    const changedLinkManifest = {
      ...manifest,
      links: manifest.links.map((link) => ({ ...link, kind: "supersedes" })),
    };
    expect(buildWorkspaceIdentity(changedLinkManifest, fixture.sources).snapshotKey).not.toBe(identity.snapshotKey);
  });

  test("classifies every required lifecycle state with stable precedence", () => {
    const previous = readyObservation("api-primary");
    const cases: readonly [string, Parameters<typeof classifyWorkspaceTransition>[0], string][] = [
      ["unchanged", { previous, current: previous }, "reuse"],
      ["add", { previous: null, current: previous }, "rebuild"],
      ["remove", { previous, current: null }, "rebuild"],
      [
        "branch-change",
        {
          previous,
          current: { ...previous, gitRef: "refs/heads/feature", gitCommit: "2222222222222222222222222222222222222222" },
        },
        "rebuild",
      ],
      [
        "missing-repository",
        {
          previous,
          current: {
            state: "missing",
            memberId: previous.memberId,
            locator: previous.locator,
            gitRef: previous.gitRef,
          },
        },
        "reject-candidate",
      ],
      ["renamed-repository", { previous, current: { ...previous, locator: "../renamed-api" } }, "reuse"],
      [
        "repository-replaced",
        {
          previous,
          current: {
            ...previous,
            repositoryScopeKey: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          },
        },
        "rebuild",
      ],
      ["conflicting-link", { previous, current: previous, linkConflict: true }, "reject-candidate"],
      [
        "stale-snapshot",
        {
          previous,
          current: {
            ...previous,
            exportDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          },
        },
        "rebuild",
      ],
    ];
    for (const [kind, input, disposition] of cases) {
      expect(classifyWorkspaceTransition(input)).toMatchObject({ kind, candidateDisposition: disposition });
    }
    expect(classifyWorkspaceTransition({ previous, current: previous, linkConflict: true }).servePrevious).toBeTrue();
    expect(classifyWorkspaceTransition({ previous, current: null }).removePriorEvidence).toBeTrue();
    expect(() => classifyWorkspaceTransition({ previous: null, current: null })).toThrow(
      "a transition requires a previous or current member",
    );
  });

  test("freezes disposable projection, privacy, linking, and documentation boundaries", () => {
    expect(WORKSPACE_STORAGE_CONTRACT).toEqual({
      projectionRoot: ".lore/cache/workspaces/1/<workspaceKey>/",
      sourceOfTruth: "explicit-manifest-and-validated-exports",
      discoversMachineRepositories: false,
      storesRepositoryLocators: false,
      storesCredentials: false,
      exposesQueryLanguage: false,
      rebuildOnly: true,
      deletionScope: "one-workspace-projection",
      requiresContainmentAndSymlinkChecks: true,
    });
    expect(WORKSPACE_LINK_CONTRACT).toMatchObject({
      repositoryLocalAuthoredLinksRemainLocal: true,
      infersCrossRepositoryLinksFromNames: false,
      explicitCrossRepositoryEndpointsRequired: true,
      conflictingCandidateDisposition: "reject-candidate",
    });
    for (const phrase of [
      WORKSPACE_MANIFEST_SCHEMA_VERSION,
      WORKSPACE_IDENTITY_SCHEMA_VERSION,
      "missing-repository",
      "renamed-repository",
      "conflicting-link",
      WORKSPACE_STORAGE_CONTRACT.projectionRoot,
    ]) {
      expect(spec).toContain(phrase);
    }
    expect(roadmap).toContain("local-workspace-identity-contract.md");
  });
});

function readyObservation(memberId: string): Extract<WorkspaceMemberObservation, { readonly state: "ready" }> {
  return {
    state: "ready",
    memberId,
    locator: "../lore-api",
    gitRef: "refs/heads/main",
    repositoryScopeKey: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    bundleId: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    gitCommit: "1111111111111111111111111111111111111111",
    exportDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  };
}
