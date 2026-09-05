/** Explicit workspace manifest and repository resolution boundary. */

import { lstatSync, readFileSync, realpathSync, type Stats } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { resolveHeadSha } from "../adapters/git";
import { LoreError, WarningCollector } from "../errors";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "./ladybug-native";
import { type LadybugProjectionSource, loadLadybugProjectionSource } from "./ladybug-source";
import { parseWorkspaceManifest, type WorkspaceManifest, type WorkspaceMember } from "./workspace-contract";
import {
  assertWorkspaceManifestSelection,
  buildWorkspaceProjection,
  type WorkspaceMemberSource,
  type WorkspaceProjection,
} from "./workspace-projection";

export interface LoadWorkspaceProjectionOptions {
  readonly root: string;
  readonly manifestPath: string;
  readonly warnings?: WarningCollector;
  readonly adapterForRoot?: (root: string) => BacklogAdapter | undefined;
  readonly resolveGitCommit?: (root: string) => string | null;
  readonly resolveGitRef?: (root: string) => string | null;
  readonly loadMemberSource?: (member: WorkspaceMemberSourceRequest) => Promise<LadybugProjectionSource>;
  readonly selectionMemberIds?: readonly string[];
  /**
   * Skip a member that fails to load or validate, reporting it in {@link LoadedWorkspaceProjection.skippedMembers}
   * instead of aborting the whole load (LCLI-432). Off by default, so every EXISTING caller —
   * `query`/`graph`/`context`/`path`/`impact`, all reached via `loadWorkspaceRetrievalGraph` — keeps
   * today's fail-fast contract unchanged. Only `lore agent context --workspace` opts in: a
   * compiled evidence pack that reports what it could not reach is worth more than one that
   * refuses to compile at all over a single dormant fleet member.
   */
  readonly tolerateMemberFailures?: boolean;
}

export interface WorkspaceMemberSourceRequest {
  readonly memberId: string;
  readonly root: string;
  readonly warnings: WarningCollector;
}

/** One manifest member `tolerateMemberFailures` skipped, and why. */
export interface SkippedWorkspaceMember {
  readonly memberId: string;
  readonly error: LoreError;
}

export interface LoadedWorkspaceProjection {
  readonly manifestPath: string;
  readonly manifest: WorkspaceManifest;
  readonly members: readonly WorkspaceMemberSource[];
  readonly projection: WorkspaceProjection;
  /** Members skipped under `tolerateMemberFailures`; always empty when that option is off. */
  readonly skippedMembers: readonly SkippedWorkspaceMember[];
}

/** Read one explicit manifest and load every declared repository as one complete candidate. */
export async function loadWorkspaceProjection(
  options: LoadWorkspaceProjectionOptions,
): Promise<LoadedWorkspaceProjection> {
  const manifestPath = resolveWorkspaceManifestPath(options.root, options.manifestPath);
  const manifest = readWorkspaceManifest(manifestPath);
  assertWorkspaceManifestSelection(manifest, options.selectionMemberIds ?? []);
  const members: WorkspaceMemberSource[] = [];
  const skippedMembers: SkippedWorkspaceMember[] = [];
  for (const member of manifest.members) {
    try {
      members.push(await loadOneWorkspaceMember(member, manifestPath, options));
    } catch (cause) {
      if (!options.tolerateMemberFailures) throw cause;
      const error = cause instanceof LoreError ? cause : memberValidationFailure(member.memberId, cause);
      options.warnings?.add(`[${member.memberId}] workspace member skipped: ${error.message}`);
      skippedMembers.push({ memberId: member.memberId, error });
    }
  }
  if (members.length === 0) {
    throw new LoreError(
      "validation",
      "no workspace member could be loaded",
      "inspect the skipped members and retry once at least one is reachable",
      { skipped: skippedMembers.map((skipped) => skipped.memberId) },
    );
  }
  // A skip drops that member's own `has-member`/other authored links too (LCLI-432): a link whose
  // endpoint no longer has a loaded export would otherwise fail buildWorkspaceProjection's own
  // "names an endpoint absent from the selected exports" check, turning one dormant member into a
  // hard failure for everyone else again. When nothing was skipped, the original manifest is passed
  // through untouched — this is the ONLY place tolerant and non-tolerant callers can observe any
  // difference in what reaches `buildWorkspaceProjection`.
  const skippedIds = new Set(skippedMembers.map((skipped) => skipped.memberId));
  const effectiveManifest: WorkspaceManifest =
    skippedIds.size === 0
      ? manifest
      : {
          ...manifest,
          members: manifest.members.filter((member) => !skippedIds.has(member.memberId)),
          links: manifest.links.filter(
            (link) => !skippedIds.has(link.from.memberId) && !skippedIds.has(link.to.memberId),
          ),
        };
  return {
    manifestPath,
    manifest,
    members,
    projection: buildWorkspaceProjection(effectiveManifest, members),
    skippedMembers,
  };
}

/** Load and validate exactly one manifest member; throws on any failure, wrapped or not. */
async function loadOneWorkspaceMember(
  member: WorkspaceMember,
  manifestPath: string,
  options: LoadWorkspaceProjectionOptions,
): Promise<WorkspaceMemberSource> {
  const root = resolveMemberRoot(manifestPath, member.locator, member.memberId);
  let actualRef: string | null;
  try {
    actualRef = (options.resolveGitRef ?? resolveCurrentGitRef)(root);
  } catch (cause) {
    throw memberValidationFailure(member.memberId, cause);
  }
  if (member.expectedRef !== null && actualRef !== member.expectedRef) {
    throw new LoreError(
      "conflict",
      `workspace member ${member.memberId} is at ${actualRef ?? "a detached HEAD"}, expected ${member.expectedRef}`,
      "check out the explicit expected ref or update the manifest before retrying",
      { memberId: member.memberId, expectedRef: member.expectedRef, actualRef },
    );
  }
  const memberWarnings = new WarningCollector();
  let source: LadybugProjectionSource;
  try {
    source =
      options.loadMemberSource === undefined
        ? await loadLadybugProjectionSource({
            root,
            ladybugVersion: EXPECTED_LADYBUG_VERSION,
            ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
            adapter: options.adapterForRoot?.(root),
            resolveGitCommit: options.resolveGitCommit ?? resolveHeadSha,
            warnings: memberWarnings,
          })
        : await options.loadMemberSource({ memberId: member.memberId, root, warnings: memberWarnings });
  } catch (cause) {
    throw memberValidationFailure(member.memberId, cause);
  }
  for (const warning of memberWarnings.list()) {
    options.warnings?.add(`[${member.memberId}] ${warning}`);
  }
  return { memberId: member.memberId, root, source };
}

export function resolveWorkspaceManifestPath(root: string, manifestPath: string): string {
  if (manifestPath.trim() === "") {
    throw new LoreError(
      "usage",
      "--workspace needs a manifest path",
      "pass an explicit lore-workspace-manifest/1 JSON file",
    );
  }
  const absolute = resolve(root, manifestPath);
  const stat = safeLstat(absolute, "workspace manifest");
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new LoreError("denied", "workspace manifest must be a real regular file, not a symlink");
  }
  return realpathSync(absolute);
}

function readWorkspaceManifest(path: string): WorkspaceManifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new LoreError(
        "validation",
        `workspace manifest is not valid JSON: ${cause.message}`,
        "fix the manifest and retry",
      );
    }
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", "cannot read workspace manifest", "check the explicit manifest permissions");
    }
    if (code === "ENOENT") {
      throw new LoreError("not_found", "cannot find workspace manifest", "check the explicit manifest path");
    }
    throw new LoreError("validation", "workspace manifest could not be read", "check the explicit manifest and retry");
  }
  try {
    return parseWorkspaceManifest(value);
  } catch (cause) {
    throw new LoreError(
      "validation",
      cause instanceof Error ? cause.message : "workspace manifest is invalid",
      "fix the explicit lore-workspace-manifest/1 file and retry",
    );
  }
}

function resolveMemberRoot(manifestPath: string, locator: string, memberId: string): string {
  const candidate = isAbsolute(locator) ? resolve(locator) : resolve(dirname(manifestPath), locator);
  const stat = safeLstat(candidate, `workspace member ${memberId}`);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new LoreError(
      "denied",
      `workspace member ${memberId} must resolve to a real repository directory, not a symlink`,
      "replace the locator with an explicit real checkout path",
      { memberId },
    );
  }
  return realpathSync(candidate);
}

function safeLstat(path: string, label: string): Stats {
  try {
    return lstatSync(path) as Stats;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `cannot read ${label}`, "check the explicit path permissions");
    }
    throw new LoreError("not_found", `cannot find ${label}`, "check the explicit path exists");
  }
}

function memberValidationFailure(memberId: string, cause: unknown): LoreError {
  const type = cause instanceof LoreError ? cause.type : "validation";
  return new LoreError(
    type,
    `workspace member ${memberId} could not be validated`,
    "inspect that explicitly selected repository and retry",
    { memberId },
  );
}

function resolveCurrentGitRef(root: string): string | null {
  const result = Bun.spawnSync(["git", "symbolic-ref", "-q", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode === 0) return result.stdout.toString("utf8").trim();
  // Prove this is still a valid repository/detached HEAD rather than hiding a Git error.
  resolveHeadSha(root);
  return null;
}
