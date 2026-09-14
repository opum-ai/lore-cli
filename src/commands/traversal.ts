/** Shared CLI parsing and rendering for bounded typed traversal commands. */

import { idFromPath } from "../core/concept";
import { PROOF_RELATION_KINDS } from "../core/relations";
import {
  DEFAULT_TRAVERSAL_LIMIT,
  DEFAULT_TRAVERSAL_MAX_DEPTH,
  type ImpactResult,
  MAX_TRAVERSAL_DEPTH,
  MAX_TRAVERSAL_LIMIT,
  type PathResult,
  type TraversalDirection,
  type TraversalEndpointKind,
  type TraversalSnapshot,
  type TraversalStep,
} from "../core/traversal";
import { parseQualifiedWorkspaceId, qualifyWorkspaceId } from "../core/workspace-contract";
import { singleLine } from "../errors";
import type { Renderable } from "../output";
import { assertFlagAtMostOnce, optionValues, type ParsedArgs, requiredChoice, singleOptionValue, usage } from "./args";

/** The traversal options a command passes to {@link findPaths}/{@link findImpact}. */
export interface TraversalOptions {
  readonly direction: TraversalDirection;
  readonly edgeKinds?: readonly string[];
  readonly maxDepth: number;
  readonly limit: number;
}

/** {@link TraversalOptions} plus how the edge selection was arrived at, which decides how it is validated. */
export interface TraversalFlags extends TraversalOptions {
  /**
   * Whether `edgeKinds` came from `--proof-only` rather than from explicit `--edge` values.
   *
   * It changes how the selection is VALIDATED, which is the whole reason it is carried separately.
   * {@link assertKnownEdgeKinds} rejects an `--edge` naming a kind the snapshot does not contain,
   * because that is almost always a typo. The same rule applied to a preset would turn "this bundle
   * records no proof relations yet" into a usage ERROR, when it is the correct, informative answer:
   * a proof-only view of a bundle without proof relations is legitimately empty.
   */
  readonly proofOnly: boolean;
}

export function parseTraversalFlags(parsed: ParsedArgs): TraversalFlags {
  const direction = requiredChoice(parsed, "direction", ["outbound", "inbound", "either"] as const);
  assertFlagAtMostOnce(parsed, "proof-only");
  const proofOnly = parsed.flags.has("proof-only");
  const edgeKinds = optionValues(parsed, "edge").map((value) => requiredValue("edge", value));
  if (new Set(edgeKinds).size !== edgeKinds.length) {
    throw usage("--edge values must be unique", "pass each authored edge kind at most once");
  }
  // Refused rather than intersected. Both flags answer "which edge kinds", and a caller who passes
  // both has two different answers in mind; guessing which one they meant is how a filter silently
  // returns less than either flag alone would have.
  if (proofOnly && edgeKinds.length > 0) {
    throw usage(
      "--proof-only cannot be combined with --edge",
      "--proof-only is the preset for the proof-bearing kinds; pass one or the other",
    );
  }
  const selected = proofOnly ? [...PROOF_RELATION_KINDS] : edgeKinds;
  const maxDepth = boundedInteger(parsed, "max-depth", DEFAULT_TRAVERSAL_MAX_DEPTH, 0, MAX_TRAVERSAL_DEPTH);
  const limit = boundedInteger(parsed, "limit", DEFAULT_TRAVERSAL_LIMIT, 1, MAX_TRAVERSAL_LIMIT);
  return {
    direction,
    ...(selected.length > 0 ? { edgeKinds: selected } : {}),
    maxDepth,
    limit,
    proofOnly,
  };
}

/** Split {@link TraversalFlags} into the core options and the preset marker the core does not take. */
export function traversalOptions(flags: TraversalFlags): TraversalOptions {
  const { proofOnly: _proofOnly, ...options } = flags;
  return options;
}

export function parseEndpointKind(parsed: ParsedArgs, name: string): TraversalEndpointKind {
  return requiredChoice(parsed, name, ["concept", "task"] as const);
}

export function normalizeEndpointId(raw: string, kind: TraversalEndpointKind, workspace: boolean): string {
  const value = raw.trim();
  if (value === "") throw usage("endpoint id must not be empty", "pass a concept or task id");
  if (!workspace) return kind === "concept" ? idFromPath(value) : value;
  try {
    const parsed = parseQualifiedWorkspaceId(value);
    return qualifyWorkspaceId(parsed.memberId, kind === "concept" ? idFromPath(parsed.sourceId) : parsed.sourceId);
  } catch {
    throw usage(`invalid workspace ${kind} id "${value}"`, "use the unambiguous <member-id>::<source-id> form");
  }
}

/**
 * Reject an `--edge` value naming a kind this snapshot does not contain.
 *
 * Callers pass `undefined` for a `--proof-only` selection: see {@link TraversalFlags.proofOnly} for
 * why a preset must not be validated the way an explicitly typed kind is.
 */
export function assertKnownEdgeKinds(snapshot: TraversalSnapshot, requested?: readonly string[]): void {
  if (requested === undefined) return;
  const known = new Set(snapshot.edges.map((edge) => edge.kind));
  const unknown = requested.find((kind) => !known.has(kind));
  if (unknown !== undefined) {
    throw usage(`unknown authored edge kind "${unknown}"`, "omit --edge to traverse all authored edge kinds");
  }
}

export function pathRenderable(data: PathResult): Renderable<PathResult> {
  return { kind: "path.result", data, pretty: renderPaths, plain: renderPaths };
}

export function impactRenderable(data: ImpactResult): Renderable<ImpactResult> {
  return {
    kind: "impact.result",
    data,
    pretty: renderImpact,
    plain: renderImpact,
  };
}

function renderPaths(data: PathResult): string {
  const header = `${data.shown} path${data.shown === 1 ? "" : "s"} from ${typed(data.from.kind, data.from.id)} to ${typed(data.to.kind, data.to.id)}`;
  const lines = data.paths.map((path, index) => `${index + 1}. ${renderChain(path.edges, data.from.id)}`);
  return `${[...lines, header, accounting(data)].join("\n")}\n`;
}

function renderImpact(data: ImpactResult): string {
  const lines = data.impacts.map(
    (impact) =>
      `${typed(impact.endpoint.kind, impact.endpoint.id)}  ${impact.relationship}  depth ${impact.depth}  via ${renderChain(impact.evidence, data.root.id)}`,
  );
  const header = `${data.shown} impact${data.shown === 1 ? "" : "s"} from ${typed(data.root.kind, data.root.id)}`;
  return `${[...lines, header, accounting(data)].join("\n")}\n`;
}

function renderChain(steps: readonly TraversalStep[], rootId: string): string {
  if (steps.length === 0) return singleLine(rootId);
  return [
    singleLine(rootId),
    ...steps.flatMap((step) => [
      step.direction === "outbound" ? `-${singleLine(step.edge.kind)}->` : `<-${singleLine(step.edge.kind)}-`,
      singleLine(step.to.id),
    ]),
  ].join(" ");
}

function accounting(data: PathResult | ImpactResult): string {
  return `depth<=${data.limits.maxDepth}, edge-visits=${data.edgeVisits}/${data.limits.maxEdgeVisits}, complete=${String(data.complete)}, truncated=${String(data.truncated)}`;
}

function typed(kind: TraversalEndpointKind, id: string): string {
  return `${kind}:${singleLine(id)}`;
}

function requiredValue(name: string, raw: string): string {
  const value = raw.trim();
  if (value === "") throw usage(`--${name} needs a value`, `pass --${name}=<value>`);
  return value;
}

function boundedInteger(
  parsed: ParsedArgs,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const raw = singleOptionValue(parsed, name);
  if (raw === undefined) return defaultValue;
  if (!/^\d+$/u.test(raw)) {
    throw usage(`invalid --${name} "${raw}"`, `pass an integer from ${minimum} through ${maximum}`);
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw usage(`--${name} must be between ${minimum} and ${maximum}`, `pass an integer no greater than ${maximum}`);
  }
  return value;
}
