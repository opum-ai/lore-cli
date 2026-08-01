/**
 * Consumer-neutral, deterministic OKF projection records.
 *
 * This module is deliberately pure: callers supply the already-loaded bundle,
 * Backlog snapshot, Git commit, and generation time. It contains no Neo4j,
 * embedding, or downstream database vocabulary.
 */

import { createHash } from "node:crypto";
import type { BacklogTask } from "../adapters/backlog";
import type { BundleGraph, EdgeKind } from "./bundle";
import { toRefList } from "./bundle";
import { serializeConcept } from "./concept";

export const PROJECTION_SCHEMA_VERSION = "1.0";
export const PROJECTION_NORMALIZATION_VERSION = "1";

export interface ProjectionInput {
  readonly graph: BundleGraph;
  readonly tasks: readonly BacklogTask[];
  readonly docsRoot: string;
  readonly okfVersion: string;
  readonly exporterVersion: string;
  readonly gitCommit: string | null;
  readonly generatedAt: string | null;
  /** Internal large-snapshot optimization; public export callers keep the default `true`. */
  readonly materializeJsonl?: boolean;
}

export type ProjectionRecord = Record<string, unknown> & { readonly record: string };

export interface Projection {
  readonly records: readonly ProjectionRecord[];
  readonly jsonl: string;
}

/** Build the complete projection in deterministic record order. */
export function buildProjection(input: ProjectionInput): Projection {
  const root = input.graph.concepts.get("index");
  const identitySeed = JSON.stringify({
    docsRoot: input.docsRoot,
    title: scalar(root?.frontmatter.title) ?? null,
    resource: scalar(root?.frontmatter.resource) ?? null,
  });
  const bundleId = hash(identitySeed);
  const conceptKeys = new Map<string, string>();
  for (const concept of input.graph.concepts.values()) {
    conceptKeys.set(concept.id, keyFor(bundleId, "concept", concept.id));
  }

  const taskKeys = new Map<string, string>();
  const tasks = [...input.tasks].sort((a, b) => compare(a.id.toLowerCase(), b.id.toLowerCase()) || compare(a.id, b.id));
  for (const task of tasks) {
    taskKeys.set(task.id.toLowerCase(), keyFor(bundleId, "task", task.id.toLowerCase()));
  }

  const manifest: ProjectionRecord = {
    record: "manifest",
    schemaVersion: PROJECTION_SCHEMA_VERSION,
    bundle: {
      id: bundleId,
      okfVersion: input.okfVersion,
      docsRoot: input.docsRoot,
      gitCommit: input.gitCommit,
    },
    exporter: { name: "lore", version: input.exporterVersion },
    generatedAt: input.generatedAt,
    normalizationVersion: PROJECTION_NORMALIZATION_VERSION,
  };
  const records: ProjectionRecord[] = [manifest];

  for (const concept of input.graph.concepts.values()) {
    const canonical = serializeConcept(concept);
    records.push({
      record: "concept",
      key: conceptKeys.get(concept.id),
      id: concept.id,
      path: `${input.docsRoot}/${concept.path}`,
      type: concept.type,
      frontmatter: concept.frontmatter,
      body: concept.body,
      contentHash: hash(`${PROJECTION_NORMALIZATION_VERSION}\0${canonical}`),
      tokenEstimate: input.graph.tokenEstimate(concept.id),
    });
    if (input.materializeJsonl === false && records.length % 256 === 0) Bun.gc(true);
  }

  const ordinals = new Map<string, number>();
  for (const edge of input.graph.edges) {
    const ordinalKey = `${edge.from}\0concept`;
    const ordinal = ordinals.get(ordinalKey) ?? 0;
    ordinals.set(ordinalKey, ordinal + 1);
    records.push(conceptEdge(bundleId, conceptKeys, edge.from, edge.to, edge.kind, edge.target, ordinal));
  }

  for (const task of tasks) {
    records.push({
      record: "task",
      key: taskKeys.get(task.id.toLowerCase()),
      id: task.id,
      title: task.title,
      status: task.status,
      labels: [...task.labels],
      priority: task.priority,
      ordinal: task.ordinal,
      assignees: [...task.assignees],
      milestone: task.milestone,
      parentTaskId: task.parentTaskId,
      sourceAdapterVersion: "backlog-json/1",
    });
  }

  for (const concept of input.graph.concepts.values()) {
    const seen = new Map<string, number>();
    for (const taskId of toRefList(concept.frontmatter.tasks)) {
      const normalized = taskId.toLowerCase();
      const ordinal = seen.get(normalized) ?? 0;
      seen.set(normalized, ordinal + 1);
      const to = taskKeys.get(normalized) ?? null;
      records.push({
        record: "edge",
        key: keyFor(bundleId, "task-edge", concept.id, normalized, String(ordinal)),
        from: conceptKeys.get(concept.id),
        to,
        kind: "task",
        target: taskId,
        ordinal,
        dangling: to === null,
      });
    }
  }

  records.push({
    record: "trailer",
    recordCount: records.length,
    streamHash: projectionStreamHash(records, input.materializeJsonl === false),
  });
  return {
    records,
    jsonl: input.materializeJsonl === false ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  };
}

/**
 * Compute export schema 1.0's semantic stream hash for every record before the
 * trailer. The generated timestamp is deliberately normalized away so the same
 * source snapshot has one digest regardless of wall-clock time.
 */
export function projectionStreamHash(records: readonly ProjectionRecord[], boundedMemory = false): string {
  const digest = createHash("sha256");
  records.forEach((record, index) => {
    if (index > 0) digest.update("\n");
    digest.update(JSON.stringify(record.record === "manifest" ? { ...record, generatedAt: null } : record));
    if (boundedMemory && index > 0 && index % 256 === 0) Bun.gc(true);
  });
  return `sha256:${digest.digest("hex")}`;
}

function conceptEdge(
  bundleId: string,
  conceptKeys: ReadonlyMap<string, string>,
  from: string,
  to: string | null,
  kind: EdgeKind,
  target: string,
  ordinal: number,
): ProjectionRecord {
  return {
    record: "edge",
    key: keyFor(bundleId, "concept-edge", from, kind, target, String(ordinal)),
    from: conceptKeys.get(from),
    to: to === null ? null : conceptKeys.get(to),
    kind,
    target,
    ordinal,
    dangling: to === null,
  };
}

function keyFor(...parts: readonly string[]): string {
  return hash(parts.join("\0"));
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function scalar(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
