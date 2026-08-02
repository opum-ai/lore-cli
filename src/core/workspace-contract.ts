/**
 * Versioned control-plane and identity contract for explicit local workspaces.
 *
 * Repository locators are intentionally confined to the manifest and member
 * observations. They never participate in durable identity or projection
 * records, so moving a checkout does not silently rename its source facts.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { compareCodeUnits } from "./order";

export const WORKSPACE_MANIFEST_SCHEMA_VERSION = "lore-workspace-manifest/1" as const;
export const WORKSPACE_IDENTITY_SCHEMA_VERSION = "lore-workspace-identity/1" as const;

export const WORKSPACE_STORAGE_CONTRACT = Object.freeze({
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

export const WORKSPACE_LINK_CONTRACT = Object.freeze({
  repositoryLocalAuthoredLinksRemainLocal: true,
  infersCrossRepositoryLinksFromNames: false,
  explicitCrossRepositoryEndpointsRequired: true,
  conflictingCandidateDisposition: "reject-candidate",
  preservesLastVerifiedProjection: true,
});

const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const commitSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/u)
  .nullable();
const stableIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u);
const boundedTextSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine((value) => value === value.trim() && !value.includes("\0"), {
    message: "values must be trimmed and contain no NUL bytes",
  });
const sourcePathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    { message: "source paths must be repository-relative POSIX paths" },
  );

const workspaceMemberSchema = z
  .object({
    memberId: stableIdSchema,
    locator: boundedTextSchema,
    displayName: z.string().min(1).max(256).nullable(),
    expectedRef: boundedTextSchema.max(1_024).nullable(),
  })
  .strict();

const workspaceLinkEndpointSchema = z
  .object({
    memberId: stableIdSchema,
    kind: z.enum(["concept", "task"]),
    id: boundedTextSchema.max(1_024),
  })
  .strict();

const workspaceLinkSchema = z
  .object({
    linkId: stableIdSchema,
    kind: boundedTextSchema.max(256),
    from: workspaceLinkEndpointSchema,
    to: workspaceLinkEndpointSchema,
  })
  .strict();

export const workspaceManifestSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_MANIFEST_SCHEMA_VERSION),
    workspaceId: stableIdSchema,
    members: z.array(workspaceMemberSchema).min(1).max(256),
    links: z.array(workspaceLinkSchema).max(10_000),
  })
  .strict();

export type WorkspaceManifest = z.infer<typeof workspaceManifestSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceLink = z.infer<typeof workspaceLinkSchema>;

const workspaceSourceSnapshotSchema = z
  .object({
    memberId: stableIdSchema,
    repositoryScopeKey: digestSchema,
    bundleId: digestSchema,
    gitCommit: commitSchema,
    exportDigest: digestSchema,
  })
  .strict();

export type WorkspaceSourceSnapshot = z.infer<typeof workspaceSourceSnapshotSchema>;

const readyObservationSchema = workspaceSourceSnapshotSchema
  .extend({
    state: z.literal("ready"),
    locator: boundedTextSchema,
    gitRef: boundedTextSchema.max(1_024).nullable(),
  })
  .strict();
const missingObservationSchema = z
  .object({
    state: z.literal("missing"),
    memberId: stableIdSchema,
    locator: boundedTextSchema,
    gitRef: boundedTextSchema.max(1_024).nullable(),
  })
  .strict();
const workspaceMemberObservationSchema = z.discriminatedUnion("state", [
  readyObservationSchema,
  missingObservationSchema,
]);

export type WorkspaceMemberObservation = z.infer<typeof workspaceMemberObservationSchema>;
export type WorkspaceRecordKind = "concept" | "task" | "authored-edge";

export interface WorkspaceRepositoryIdentity {
  readonly memberId: string;
  readonly memberKey: string;
  readonly repositoryKey: string;
  readonly bundleKey: string;
  readonly commitKey: string | null;
  readonly exportKey: string;
  readonly source: WorkspaceSourceSnapshot;
}

export interface WorkspaceLinkIdentity {
  readonly linkId: string;
  readonly workspaceLinkKey: string;
  readonly source: WorkspaceLink;
}

export interface WorkspaceIdentity {
  readonly schemaVersion: typeof WORKSPACE_IDENTITY_SCHEMA_VERSION;
  readonly workspaceKey: string;
  readonly snapshotKey: string;
  readonly repositories: readonly WorkspaceRepositoryIdentity[];
  readonly links: readonly WorkspaceLinkIdentity[];
}

export interface WorkspaceRecordIdentity {
  readonly workspaceRecordKey: string;
  readonly workspaceSourceKey: string | null;
  readonly sourceRecordKey: string;
  readonly sourcePath: string | null;
}

/** Public, locator-free scope attached to every workspace command result. */
export interface WorkspaceResultScope {
  readonly schemaVersion: "lore-workspace-result-scope/1";
  readonly workspaceId: string;
  readonly workspaceKey: string;
  readonly snapshotKey: string;
  readonly repositories: readonly WorkspaceResultRepository[];
}

/** One selected repository in a workspace command result. */
export interface WorkspaceResultRepository {
  readonly memberId: string;
  readonly repositoryKey: string;
  readonly repositoryScopeKey: string;
  readonly bundleKey: string;
  readonly bundleId: string;
  readonly commitKey: string | null;
  readonly gitCommit: string | null;
  readonly exportKey: string;
  readonly exportDigest: string;
}

/** Complete namespaced and original provenance for one public workspace record. */
export interface WorkspaceRecordProvenance extends WorkspaceResultRepository {
  readonly recordKind: WorkspaceRecordKind;
  readonly recordKey: string;
  readonly sourceRecordKey: string;
  readonly sourceKey: string | null;
  readonly sourcePath: string | null;
  readonly sourceId: string;
}

/** Qualify a repository-local identity for the public workspace id space. */
export function qualifyWorkspaceId(memberId: string, sourceId: string): string {
  stableIdSchema.parse(memberId);
  if (sourceId.length === 0 || sourceId.includes("\0")) throw contractError("workspace source ids must be non-empty");
  return `${memberId}::${sourceId}`;
}

/** Split a public workspace id without guessing across repository members. */
export function parseQualifiedWorkspaceId(value: string): { memberId: string; sourceId: string } {
  const separator = value.indexOf("::");
  if (separator <= 0 || separator === value.length - 2) {
    throw contractError("workspace ids must use <member-id>::<source-id>");
  }
  const memberId = value.slice(0, separator);
  stableIdSchema.parse(memberId);
  return { memberId, sourceId: value.slice(separator + 2) };
}

const workspaceRepositoryIdentitySchema = z
  .object({
    memberId: stableIdSchema,
    memberKey: digestSchema,
    repositoryKey: digestSchema,
    bundleKey: digestSchema,
    commitKey: digestSchema.nullable(),
    exportKey: digestSchema,
    source: workspaceSourceSnapshotSchema,
  })
  .strict();
const workspaceLinkIdentitySchema = z
  .object({
    linkId: stableIdSchema,
    workspaceLinkKey: digestSchema,
    source: workspaceLinkSchema,
  })
  .strict();
export const workspaceIdentitySchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_IDENTITY_SCHEMA_VERSION),
    workspaceKey: digestSchema,
    snapshotKey: digestSchema,
    repositories: z.array(workspaceRepositoryIdentitySchema).min(1).max(256),
    links: z.array(workspaceLinkIdentitySchema).max(10_000),
  })
  .strict();

export type WorkspaceTransitionKind =
  | "unchanged"
  | "add"
  | "remove"
  | "branch-change"
  | "missing-repository"
  | "renamed-repository"
  | "repository-replaced"
  | "conflicting-link"
  | "stale-snapshot";

export interface WorkspaceTransition {
  readonly kind: WorkspaceTransitionKind;
  readonly candidateDisposition: "reuse" | "rebuild" | "reject-candidate";
  readonly servePrevious: boolean;
  readonly removePriorEvidence: boolean;
}

/** Parse a canonical manifest and enforce explicit membership/link invariants. */
export function parseWorkspaceManifest(value: unknown): WorkspaceManifest {
  const manifest = workspaceManifestSchema.parse(value);
  assertSortedUnique(manifest.members, (member) => member.memberId, "workspace members");
  assertSortedUnique(manifest.links, (link) => link.linkId, "workspace links");

  const members = new Set(manifest.members.map((member) => member.memberId));
  const linkFingerprints = new Set<string>();
  for (const link of manifest.links) {
    if (!members.has(link.from.memberId)) throw contractError(`unknown link source member ${link.from.memberId}`);
    if (!members.has(link.to.memberId)) throw contractError(`unknown link target member ${link.to.memberId}`);
    const fingerprint = [
      link.from.memberId,
      link.from.kind,
      link.from.id,
      link.kind,
      link.to.memberId,
      link.to.kind,
      link.to.id,
    ].join("\0");
    if (linkFingerprints.has(fingerprint)) throw contractError(`duplicate explicit link ${link.linkId}`);
    linkFingerprints.add(fingerprint);
  }
  return manifest;
}

/** Serialize a validated manifest as canonical UTF-8 JSON with a trailing newline. */
export function serializeWorkspaceManifest(value: unknown): string {
  return `${canonicalJson(parseWorkspaceManifest(value))}\n`;
}

/**
 * Build locator-free workspace identities from a complete set of validated
 * repository export observations.
 */
export function buildWorkspaceIdentity(manifestValue: unknown, sourceValues: readonly unknown[]): WorkspaceIdentity {
  const manifest = parseWorkspaceManifest(manifestValue);
  const sources = sourceValues.map((value) => workspaceSourceSnapshotSchema.parse(value));
  assertSortedUnique(sources, (source) => source.memberId, "workspace sources");
  const expectedMembers = manifest.members.map((member) => member.memberId);
  const observedMembers = sources.map((source) => source.memberId);
  if (canonicalJson(expectedMembers) !== canonicalJson(observedMembers)) {
    throw contractError("workspace sources must exactly match explicit manifest membership");
  }

  const workspaceKey = digest(`lore-workspace/1\0${manifest.workspaceId}`);
  const repositories = sources.map((source): WorkspaceRepositoryIdentity => {
    const memberKey = digest(`lore-workspace-member/1\0${workspaceKey}\0${source.memberId}`);
    const repositoryKey = digest(
      `lore-workspace-repository/1\0${workspaceKey}\0${memberKey}\0${source.repositoryScopeKey}`,
    );
    return {
      memberId: source.memberId,
      memberKey,
      repositoryKey,
      bundleKey: digest(`lore-workspace-bundle/1\0${repositoryKey}\0${source.bundleId}`),
      commitKey:
        source.gitCommit === null ? null : digest(`lore-workspace-commit/1\0${repositoryKey}\0${source.gitCommit}`),
      exportKey: digest(`lore-workspace-export/1\0${repositoryKey}\0${source.exportDigest}`),
      source,
    };
  });
  const links = manifest.links.map(
    (link): WorkspaceLinkIdentity => ({
      linkId: link.linkId,
      workspaceLinkKey: digest(`lore-workspace-link/1\0${workspaceKey}\0${link.linkId}`),
      source: link,
    }),
  );
  const snapshotKey = digest(
    `lore-workspace-snapshot/1\0${workspaceKey}\0${canonicalJson({
      repositories: repositories.map((repository) => ({
        memberKey: repository.memberKey,
        repositoryKey: repository.repositoryKey,
        bundleKey: repository.bundleKey,
        gitCommit: repository.source.gitCommit,
        exportDigest: repository.source.exportDigest,
      })),
      links: links.map((link) => ({
        workspaceLinkKey: link.workspaceLinkKey,
        source: link.source,
      })),
    })}`,
  );
  return { schemaVersion: WORKSPACE_IDENTITY_SCHEMA_VERSION, workspaceKey, snapshotKey, repositories, links };
}

/** Namespace one repository-local source record without reinterpreting its key. */
export function namespaceWorkspaceRecord(
  repository: WorkspaceRepositoryIdentity,
  kind: WorkspaceRecordKind,
  sourceRecordKeyValue: string,
  sourcePathValue: string | null,
): WorkspaceRecordIdentity {
  const sourceRecordKey = digestSchema.parse(sourceRecordKeyValue);
  const sourcePath = sourcePathValue === null ? null : sourcePathSchema.parse(sourcePathValue);
  return {
    workspaceRecordKey: digest(`lore-workspace-record/1\0${repository.repositoryKey}\0${kind}\0${sourceRecordKey}`),
    workspaceSourceKey:
      sourcePath === null ? null : digest(`lore-workspace-source/1\0${repository.repositoryKey}\0${sourcePath}`),
    sourceRecordKey,
    sourcePath,
  };
}

/**
 * Classify one explicit member transition. The precedence is part of the
 * public contract so simultaneous locator/source changes have one outcome.
 */
export function classifyWorkspaceTransition(input: {
  readonly previous: WorkspaceMemberObservation | null;
  readonly current: WorkspaceMemberObservation | null;
  readonly linkConflict?: boolean;
}): WorkspaceTransition {
  const previous = input.previous === null ? null : workspaceMemberObservationSchema.parse(input.previous);
  const current = input.current === null ? null : workspaceMemberObservationSchema.parse(input.current);
  if (previous === null && current === null) throw contractError("a transition requires a previous or current member");
  if (previous !== null && current !== null && previous.memberId !== current.memberId) {
    throw contractError("transition observations must use the same member id");
  }
  const hasPrevious = previous?.state === "ready";
  if (input.linkConflict === true) return transition("conflicting-link", "reject-candidate", hasPrevious, false);
  if (current === null) return transition("remove", "rebuild", hasPrevious, true);
  if (current.state === "missing") {
    return transition("missing-repository", "reject-candidate", hasPrevious, false);
  }
  if (previous === null || previous.state === "missing") return transition("add", "rebuild", false, false);
  if (previous.repositoryScopeKey !== current.repositoryScopeKey || previous.bundleId !== current.bundleId) {
    return transition("repository-replaced", "rebuild", true, true);
  }
  if (previous.gitCommit !== current.gitCommit || previous.gitRef !== current.gitRef) {
    return transition("branch-change", "rebuild", true, false);
  }
  if (previous.exportDigest !== current.exportDigest) {
    return transition("stale-snapshot", "rebuild", true, false);
  }
  if (previous.locator !== current.locator) {
    return transition("renamed-repository", "reuse", true, false);
  }
  return transition("unchanged", "reuse", true, false);
}

/** Canonical locator-free bytes suitable for projection metadata and evidence. */
export function serializeWorkspaceIdentity(value: unknown): string {
  const identity = workspaceIdentitySchema.parse(value);
  assertSortedUnique(identity.repositories, (repository) => repository.memberId, "workspace identity repositories");
  assertSortedUnique(identity.links, (link) => link.linkId, "workspace identity links");
  for (const repository of identity.repositories) {
    if (repository.memberId !== repository.source.memberId) {
      throw contractError(`repository identity member differs from source ${repository.memberId}`);
    }
  }
  for (const link of identity.links) {
    if (link.linkId !== link.source.linkId) throw contractError(`link identity differs from source ${link.linkId}`);
  }
  return `${canonicalJson(identity)}\n`;
}

function transition(
  kind: WorkspaceTransitionKind,
  candidateDisposition: WorkspaceTransition["candidateDisposition"],
  servePrevious: boolean,
  removePriorEvidence: boolean,
): WorkspaceTransition {
  return { kind, candidateDisposition, servePrevious, removePriorEvidence };
}

function assertSortedUnique<T>(records: readonly T[], key: (record: T) => string, label: string): void {
  for (let index = 1; index < records.length; index++) {
    const previous = records[index - 1];
    const current = records[index];
    if (previous === undefined || current === undefined) continue;
    if (compareCodeUnits(key(previous), key(current)) >= 0) {
      throw contractError(`${label} must be unique and sorted by UTF-16 code units`);
    }
  }
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function contractError(message: string): Error {
  return new Error(`invalid ${WORKSPACE_MANIFEST_SCHEMA_VERSION}: ${message}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined && typeof entry !== "function" && typeof entry !== "symbol") {
      result[key] = canonicalValue(entry);
    }
  }
  return result;
}
