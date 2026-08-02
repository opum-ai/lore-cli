/** Shared CLI parsing and rendering for bounded typed traversal commands. */

import { idFromPath } from "../core/concept";
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
import { optionValues, type ParsedArgs, singleOptionValue, usage } from "./args";

export interface TraversalFlags {
  readonly direction: TraversalDirection;
  readonly edgeKinds?: readonly string[];
  readonly maxDepth: number;
  readonly limit: number;
}

export function parseTraversalFlags(parsed: ParsedArgs): TraversalFlags {
  const direction = requiredChoice(parsed, "direction", ["outbound", "inbound", "either"] as const);
  const edgeKinds = optionValues(parsed, "edge").map((value) => requiredValue("edge", value));
  if (new Set(edgeKinds).size !== edgeKinds.length) {
    throw usage("--edge values must be unique", "pass each authored edge kind at most once");
  }
  const maxDepth = boundedInteger(parsed, "max-depth", DEFAULT_TRAVERSAL_MAX_DEPTH, 0, MAX_TRAVERSAL_DEPTH);
  const limit = boundedInteger(parsed, "limit", DEFAULT_TRAVERSAL_LIMIT, 1, MAX_TRAVERSAL_LIMIT);
  return {
    direction,
    ...(edgeKinds.length > 0 ? { edgeKinds } : {}),
    maxDepth,
    limit,
  };
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

function requiredChoice<const T extends readonly string[]>(parsed: ParsedArgs, name: string, values: T): T[number] {
  const raw = singleOptionValue(parsed, name);
  if (raw === undefined || raw.trim() === "") {
    throw usage(`--${name} is required`, `pass --${name} <${values.join("|")}>`);
  }
  const value = raw.trim();
  if (!values.includes(value)) {
    throw usage(`invalid --${name} "${value}"`, `choose one of ${values.join(", ")}`);
  }
  return value as T[number];
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
