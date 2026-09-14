/**
 * Consumer-neutral, deterministic OKF projection records.
 *
 * This module is deliberately pure: callers supply the already-loaded bundle,
 * Backlog snapshot, Git commit, and generation time. It contains no Neo4j,
 * embedding, or downstream database vocabulary.
 */

import { createHash } from "node:crypto";
import type { BacklogTask } from "../adapters/backlog";
import type { BundleGraph, Edge } from "./bundle";
import { effectiveProfileFor, toRefList } from "./bundle";
import { serializeConcept } from "./concept";
import { defaultProfile, type Profile } from "./profile";

export const PROJECTION_SCHEMA_VERSION = "1.1";

/**
 * Every export schema lore can READ, newest last. Writing is always {@link PROJECTION_SCHEMA_VERSION};
 * this list exists because the two are not the same question (LCLI-476).
 *
 * `1.1` added `dependencies` to task records and the `dependency` edge kind, and -- within the same
 * unreleased window -- LCLI-477's `requires`/`alternative`/`refutes` edge kinds with their optional
 * `statement`/`version` qualifiers. Both ride one version because neither has ever shipped: no
 * consumer has held a `1.1` without relations, so there is nothing for a second bump to
 * distinguish. Once `1.1` is tagged, the next shape change is `1.2`. Refusing `1.0` on read
 * would invalidate every RETAINED SNAPSHOT built before the bump -- `lore provenance` reads those to
 * answer questions about history, and history cannot be re-exported at a newer schema because the
 * source it described has moved on. So a tolerant reader is not a convenience here; it is the only
 * way retained provenance survives a schema change at all.
 *
 * Tolerant does not mean silent, which is the line that matters: the manifest still states its own
 * version, so a consumer can always tell WHICH schema it is holding and therefore whether
 * `dependencies` being absent means "none" or "not carried at this version".
 */
export const READABLE_PROJECTION_SCHEMA_VERSIONS: readonly string[] = ["1.0", PROJECTION_SCHEMA_VERSION];

/**
 * The authored-edge `kind` for a task->task prerequisite (LCLI-476). A distinct kind, not a reuse of
 * the `"task"` coupling kind, so `lore graph` can render ordering apart from Story ownership and
 * `--edge` can select one without the other -- AC#3's "rendered distinctly" is a property of the
 * data, not of the renderer.
 */
export const TASK_DEPENDENCY_EDGE_KIND = "dependency";
export const PROJECTION_NORMALIZATION_VERSION = "1";
const BOUNDED_MEMORY_GC_RECORD_INTERVAL = 1024;

export interface ProjectionInput {
  readonly graph: BundleGraph;
  readonly tasks: readonly BacklogTask[];
  readonly docsRoot: string;
  readonly okfVersion: string;
  readonly exporterVersion: string;
  readonly gitCommit: string | null;
  readonly generatedAt: string | null;
  /** Active producer profile, used only for canonical concept serialization. */
  readonly profile?: Profile;
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
  const profile = input.profile ?? defaultProfile();
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
    const canonical = serializeConcept(concept, {
      profile: effectiveProfileFor(concept.path, "index.md", profile),
      bundleState: input.graph.state,
    });
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
    if (input.materializeJsonl === false && records.length % BOUNDED_MEMORY_GC_RECORD_INTERVAL === 0) Bun.gc(true);
  }

  const ordinals = new Map<string, number>();
  for (const edge of input.graph.edges) {
    const ordinalKey = `${edge.from}\0concept`;
    const ordinal = ordinals.get(ordinalKey) ?? 0;
    ordinals.set(ordinalKey, ordinal + 1);
    records.push(conceptEdge(bundleId, conceptKeys, edge, ordinal));
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
      dependencies: [...task.dependencies],
      sourceAdapterVersion: "backlog-json/1",
    });
  }

  // Task -> task dependency edges (LCLI-476). Emitted as ordinary authored edges so bounded depth,
  // cycle handling and `--edge` filtering apply to them exactly as they already do to concept and
  // coupling edges -- nothing in traversal is taught about this kind specifically.
  //
  // `from` is the DEPENDENT and `to` is the PREREQUISITE, so an outbound walk from a task reaches
  // what it is waiting on. That direction is the one the tracker's own readiness filter implies:
  // PGF-3 depends on PGF-2, so PGF-3 is blocked until PGF-2 completes.
  //
  // A dependency naming a task outside this projection is DANGLING rather than dropped -- an
  // unresolvable prerequisite is a fact about the graph, and silently omitting it would make a
  // blocked task look ready.
  for (const task of tasks) {
    const from = taskKeys.get(task.id.toLowerCase());
    if (from === undefined) continue;
    const seen = new Map<string, number>();
    for (const dependencyId of task.dependencies) {
      const normalized = dependencyId.toLowerCase();
      const ordinal = seen.get(normalized) ?? 0;
      seen.set(normalized, ordinal + 1);
      const to = taskKeys.get(normalized) ?? null;
      records.push({
        record: "edge",
        key: keyFor(bundleId, "task-dependency-edge", task.id.toLowerCase(), normalized, String(ordinal)),
        from,
        to,
        kind: TASK_DEPENDENCY_EDGE_KIND,
        target: dependencyId,
        ordinal,
        dangling: to === null,
        // Both endpoints are tasks. Without these the validator resolves `from` against CONCEPT keys
        // (ladybug-source.ts defaults an absent `workspaceFromKind` to "concept"), so a
        // task-to-task edge would be rejected as having no concept source.
        workspaceFromKind: "task",
        workspaceToKind: "task",
      });
    }
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
    if (boundedMemory && index > 0 && index % BOUNDED_MEMORY_GC_RECORD_INTERVAL === 0) Bun.gc(true);
  });
  return `sha256:${digest.digest("hex")}`;
}

/**
 * One concept->concept authored edge as a projection record.
 *
 * ADR-0021's `statement`/`version` qualifiers are emitted ONLY when the authoring `relations[]`
 * entry carried them, never as explicit nulls. That is what keeps this change additive: a bundle
 * using no relations produces a byte-identical record stream, and therefore an identical export
 * digest, to the one it produced before the qualifiers existed.
 *
 * The record KEY deliberately does not include them. A key identifies which reference this is
 * (source, kind, target, ordinal); re-pinning a relation to a newer `version` is an edit to that
 * reference, not a different reference, and folding the version into the key would make every
 * re-pin look like a delete plus an insert to any consumer diffing two snapshots.
 */
function conceptEdge(
  bundleId: string,
  conceptKeys: ReadonlyMap<string, string>,
  edge: Edge,
  ordinal: number,
): ProjectionRecord {
  const { from, to, kind, target } = edge;
  return {
    record: "edge",
    key: keyFor(bundleId, "concept-edge", from, kind, target, String(ordinal)),
    from: conceptKeys.get(from),
    to: to === null ? null : conceptKeys.get(to),
    kind,
    target,
    ordinal,
    dangling: to === null,
    ...(edge.statement !== undefined ? { statement: edge.statement } : {}),
    ...(edge.version !== undefined ? { version: edge.version } : {}),
    // Two ordinals, deliberately: `ordinal` is this edge's position among ITS SOURCE CONCEPT's
    // edges (every edge has one), while `relationOrdinal` is its position within the authored
    // `relations` list and exists only on an edge a relation produced. The second is what tells a
    // reader that a `supersedes` edge came from a relation rather than the flat reserved field --
    // the two look identical otherwise and are not equivalent for version reporting.
    ...(edge.relationOrdinal !== undefined ? { relationOrdinal: edge.relationOrdinal } : {}),
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
