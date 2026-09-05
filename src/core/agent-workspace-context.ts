/**
 * `lore agent context --workspace` (LCLI-432): compile a profile-bounded, provenance-stamped
 * evidence pack across an explicit workspace manifest, reusing every existing single-repo
 * mechanism (scoring, budgeting, rendering) via {@link compileAgentContextForProfile} rather than
 * reinventing it.
 *
 * The one genuinely new concern is REFERENCE EXPANSION: a profile's `pinned`/`sources` entries are
 * written unqualified (e.g. `specs/lore-design`) so the SAME profile file works bare (single-repo)
 * and cross-repo without a fork. In workspace mode, an unqualified reference means "this path, in
 * EVERY selected `--repository` member" — fanned out N ways before it ever reaches the compiler. An
 * explicitly qualified reference (`opum-doc::reference/opum-fleet-operating-model`) is the opt-out:
 * it names one member and is never fanned out, for the case a fleet record genuinely lives in
 * exactly one repository (the orchestration profile's own worked example).
 *
 * `pinned` stays strict, `sources` relaxes, by explicit ruling (OPAG-49's shape is a pack that
 * looks complete but silently dropped something — never let that happen to a pinned reference):
 * a `pinned` reference missing from any member it resolves to is a hard failure, exactly like
 * single-repo `validateAgentProfileReferences`. A `sources` reference missing from one member is
 * reported in the catalog as `missing-in-member` and the pack still compiles; a member that could
 * not be loaded at all (OPAG-33's dormant-fleet-member case) reports every `sources` reference that
 * would have targeted it as `member-skipped`, and the member itself is named once at the top of the
 * pack so a reader cannot miss that it is incomplete.
 */

import { LoreError } from "../errors";
import type { AgentContextCatalogEntry, AgentContextExport, WorkspaceCompileExtras } from "./agent-context";
import { compileAgentContextForProfile } from "./agent-context";
import {
  type AgentProfile,
  type AgentProfileReference,
  type AgentProfileSnapshot,
  findAgentProfile,
  headingSlugs,
} from "./agent-profile";
import type { BundleGraph } from "./bundle";
import type { Concept } from "./concept";
import { compareCodeUnits } from "./order";
import { parseQualifiedWorkspaceId, qualifyWorkspaceId } from "./workspace-contract";
import {
  type LoadedWorkspaceProjection,
  type LoadWorkspaceProjectionOptions,
  loadWorkspaceProjection,
} from "./workspace-source";

export interface CompileWorkspaceAgentContextOptions {
  readonly manifestPath: string;
  /** `--repository` values; empty means every manifest member that loads successfully. */
  readonly memberIds: readonly string[];
  /** Test seam: override how the manifest/members load, mirroring the other workspace commands. */
  readonly loadProjection?: (options: LoadWorkspaceProjectionOptions) => Promise<LoadedWorkspaceProjection>;
}

/** Compile one profile/task pair across an explicit workspace manifest. */
export async function compileWorkspaceAgentContext(
  root: string,
  snapshot: AgentProfileSnapshot,
  profileName: string,
  task: string,
  maxTokens: number | undefined,
  workspace: CompileWorkspaceAgentContextOptions,
): Promise<AgentContextExport> {
  const profile = findAgentProfile(snapshot, profileName);
  const loader = workspace.loadProjection ?? loadWorkspaceProjection;
  const loaded = await loader({
    root,
    manifestPath: workspace.manifestPath,
    selectionMemberIds: workspace.memberIds,
    tolerateMemberFailures: true,
  });
  const skippedMemberIds = new Set(loaded.skippedMembers.map((skipped) => skipped.memberId));
  // The FULL considered set — every member this compile is "about", loaded or not — is what an
  // unqualified reference fans out across (LCLI-432): a skipped member must still produce a
  // `member-skipped` catalog row for each `sources` entry that would have targeted it, which is
  // only possible if the fan-out itself still visits that member. `loaded.manifest` is always the
  // ORIGINAL manifest (never the skip-reduced one `tolerateMemberFailures` builds internally), so
  // this reads every declared member when `--repository` was not given.
  const consideredMemberIds = new Set(
    workspace.memberIds.length > 0 ? workspace.memberIds : loaded.manifest.members.map((member) => member.memberId),
  );
  const graph = loaded.projection.graph;
  const expanded = expandWorkspaceProfileReferences(profile, graph, consideredMemberIds, skippedMemberIds);
  const expandedProfile: AgentProfile = { ...profile, pinned: expanded.pinned, sources: expanded.sources };
  const extras: WorkspaceCompileExtras = {
    provenanceById: loaded.projection.provenanceById,
    extraCatalogEntries: expanded.extraCatalogEntries,
    skippedWorkspaceMembers: loaded.skippedMembers.map((skipped) => ({
      memberId: skipped.memberId,
      reason: skipped.error.message,
    })),
  };
  return compileAgentContextForProfile(expandedProfile, graph, task, maxTokens, snapshot, extras);
}

interface ExpandedProfileReferences {
  readonly pinned: readonly AgentProfileReference[];
  readonly sources: readonly AgentProfileReference[];
  readonly extraCatalogEntries: readonly AgentContextCatalogEntry[];
}

type ExpansionAttempt =
  | { readonly kind: "resolved"; readonly reference: AgentProfileReference }
  | { readonly kind: "member-skipped"; readonly memberId: string }
  | { readonly kind: "member-unselected"; readonly memberId: string };

/** Expand every `pinned`/`sources` reference, applying the strict/relaxed split described above. */
function expandWorkspaceProfileReferences(
  profile: AgentProfile,
  graph: BundleGraph,
  consideredMemberIds: ReadonlySet<string>,
  skippedMemberIds: ReadonlySet<string>,
): ExpandedProfileReferences {
  const pinned: AgentProfileReference[] = [];
  for (const reference of profile.pinned) {
    for (const attempt of expandOneReference(reference, consideredMemberIds, skippedMemberIds)) {
      if (attempt.kind !== "resolved")
        throw pinnedMemberUnavailable(profile, reference, attempt.memberId, attempt.kind);
      pinned.push(resolvePinnedOrThrow(profile, attempt.reference, graph));
    }
  }

  const sources: AgentProfileReference[] = [];
  const extraCatalogEntries: AgentContextCatalogEntry[] = [];
  for (const reference of profile.sources) {
    for (const attempt of expandOneReference(reference, consideredMemberIds, skippedMemberIds)) {
      if (attempt.kind === "member-skipped") {
        extraCatalogEntries.push(
          omissionCatalogEntry(
            reference,
            attempt.memberId,
            "member-skipped",
            `workspace member ${attempt.memberId} could not be loaded`,
          ),
        );
        continue;
      }
      if (attempt.kind === "member-unselected") {
        extraCatalogEntries.push(
          omissionCatalogEntry(
            reference,
            attempt.memberId,
            "member-skipped",
            `workspace member ${attempt.memberId} was not selected via --repository (or is not in this manifest)`,
          ),
        );
        continue;
      }
      const resolved = resolveSourceOrOmit(attempt.reference, graph);
      if (resolved.kind === "missing") {
        extraCatalogEntries.push(
          omissionCatalogEntry(reference, resolved.memberId, "missing-in-member", resolved.reason),
        );
        continue;
      }
      sources.push(resolved.reference);
    }
  }
  return { pinned, sources, extraCatalogEntries };
}

/**
 * One profile reference's per-member attempts. An unqualified reference (no `::`) fans out across
 * every CONSIDERED member (`--repository`'s full set, or every manifest member when it was
 * omitted) — deliberately including a skipped one, so a `sources` entry still produces a
 * `member-skipped` catalog row for it rather than silently vanishing from the fan-out. An
 * explicitly qualified reference (`member::path`) targets exactly that member and is never
 * fanned out.
 */
function expandOneReference(
  reference: AgentProfileReference,
  consideredMemberIds: ReadonlySet<string>,
  skippedMemberIds: ReadonlySet<string>,
): readonly ExpansionAttempt[] {
  if (reference.conceptId.includes("::")) {
    const { memberId } = parseQualifiedWorkspaceId(reference.conceptId);
    if (skippedMemberIds.has(memberId)) return [{ kind: "member-skipped", memberId }];
    if (!consideredMemberIds.has(memberId)) return [{ kind: "member-unselected", memberId }];
    return [{ kind: "resolved", reference }];
  }
  return [...consideredMemberIds]
    .sort(compareCodeUnits)
    .map((memberId) =>
      skippedMemberIds.has(memberId)
        ? { kind: "member-skipped" as const, memberId }
        : { kind: "resolved" as const, reference: qualifyReference(reference, memberId) },
    );
}

function qualifyReference(reference: AgentProfileReference, memberId: string): AgentProfileReference {
  const conceptId = qualifyWorkspaceId(memberId, reference.conceptId);
  const normalized = reference.anchor === undefined ? conceptId : `${conceptId}#${reference.anchor}`;
  return {
    raw: reference.raw,
    conceptId,
    ...(reference.anchor === undefined ? {} : { anchor: reference.anchor }),
    normalized,
  };
}

function resolvePinnedOrThrow(
  profile: AgentProfile,
  reference: AgentProfileReference,
  graph: BundleGraph,
): AgentProfileReference {
  const concept = graph.concepts.get(reference.conceptId);
  if (concept === undefined) {
    throw validation(
      `${profile.path} references missing concept "${reference.conceptId}" in the selected workspace`,
      "add --repository for the member that carries it, fix the profile reference, or add the concept there",
      { path: profile.path, reference: reference.normalized },
    );
  }
  if (reference.anchor !== undefined && !headingSlugs(concept.body).has(reference.anchor)) {
    throw validation(
      `${profile.path} references missing heading "${reference.normalized}" in the selected workspace`,
      "use a GitHub-compatible heading anchor that exists in the referenced concept",
      { path: profile.path, reference: reference.normalized },
    );
  }
  return reference;
}

type SourceResolution =
  | { readonly kind: "resolved"; readonly reference: AgentProfileReference }
  | { readonly kind: "missing"; readonly memberId: string; readonly reason: string };

function resolveSourceOrOmit(reference: AgentProfileReference, graph: BundleGraph): SourceResolution {
  const { memberId, sourceId } = parseQualifiedWorkspaceId(reference.conceptId);
  const concept = graph.concepts.get(reference.conceptId) as Concept | undefined;
  if (concept === undefined) {
    return { kind: "missing", memberId, reason: `member ${memberId} has no concept "${sourceId}"` };
  }
  if (reference.anchor !== undefined && !headingSlugs(concept.body).has(reference.anchor)) {
    return {
      kind: "missing",
      memberId,
      reason: `member ${memberId}'s "${sourceId}" has no heading "${reference.anchor}"`,
    };
  }
  return { kind: "resolved", reference };
}

function pinnedMemberUnavailable(
  profile: AgentProfile,
  reference: AgentProfileReference,
  memberId: string,
  kind: "member-skipped" | "member-unselected",
): LoreError {
  const why = kind === "member-skipped" ? "could not be loaded" : "was not selected via --repository";
  return validation(
    `${profile.path} pins "${reference.normalized}" from workspace member ${memberId}, which ${why}`,
    "pass --repository for that member and confirm it loads, or unpin the reference",
    { path: profile.path, reference: reference.normalized, memberId },
  );
}

/**
 * An omitted reference never resolved to a real concept, so `sourcePath` (normally a real doc path)
 * carries the human-readable reason instead — the only place this field means something other than
 * a path, and the only reason `AgentContextCatalogEntry.sourcePath` stays a plain string rather than
 * gaining a separate detail field just for these two reasons.
 */
function omissionCatalogEntry(
  reference: AgentProfileReference,
  memberId: string,
  reason: "missing-in-member" | "member-skipped",
  detail: string,
): AgentContextCatalogEntry {
  const qualifiedId = reference.conceptId.includes("::")
    ? reference.conceptId
    : qualifyWorkspaceId(memberId, reference.conceptId);
  const normalized = reference.anchor === undefined ? qualifiedId : `${qualifiedId}#${reference.anchor}`;
  return {
    reference: normalized,
    conceptId: qualifiedId,
    sourcePath: detail,
    candidateCount: 0,
    selectedCount: 0,
    topScore: 0,
    tokenEstimate: 0,
    reason,
    memberId,
  };
}

function validation(message: string, hint: string, input: Record<string, unknown>): LoreError {
  return new LoreError("validation", message, hint, input);
}
