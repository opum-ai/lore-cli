/**
 * Private @ladybugdb/core boundary for ladybug-projection/1.
 *
 * Physical tables and Cypher remain internal implementation details. Callers
 * provide validated export-source records and receive only Lore identities and
 * structural verification facts.
 */

import { createHash, randomUUID } from "node:crypto";
import { closeSync, openSync, unlinkSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import ladybug, { Connection, Database, type LbugValue, type QueryResult } from "@ladybugdb/core";
import { LoreError } from "../errors";
import { type BundleGraph, type Edge, type EdgeKind, frontmatterScalar } from "./bundle";
import type { Concept } from "./concept";
import type { LadybugDatabaseVerification, LadybugIndexedReader } from "./ladybug-native";
import {
  canonicalJson,
  LADYBUG_INDEX_FORMAT,
  type LadybugProjectionSource,
  type ProjectionConceptRecord,
  type ProjectionEdgeRecord,
  type ProjectionTaskRecord,
} from "./ladybug-source";
import { resolveBundleState } from "./okf-version";
import {
  type Bm25Index,
  type QueryResult as LoreQueryResult,
  type QueryOptions,
  queryWithBm25Index,
  searchableConceptFields,
  tokenizeQueryText,
} from "./query";
import type { TraversalSourceRecords } from "./traversal";

export const LADYBUG_VERSION = String(ladybug.VERSION);
export const LADYBUG_STORAGE_VERSION = String(ladybug.STORAGE_VERSION);

const WRITER_BUFFER_BYTES = 256 * 1024 * 1024;
const READER_BUFFER_BYTES = 64 * 1024 * 1024;
const FULL_SCAN_BUFFER_BYTES = 512 * 1024 * 1024;
const VERIFIED_LEXICAL_LENGTHS = new WeakMap<LadybugProjectionSource, ReadonlyMap<string, number>>();
const CONCEPT_BODY_QUERY = "MATCH (n:ConceptRecord {recordKey: $recordKey}) RETURN n.body AS body";

const SCHEMA_QUERIES = [
  `CREATE NODE TABLE RepositoryProjection(
    repositoryScopeKey STRING,
    bundleId STRING,
    docsRoot STRING,
    PRIMARY KEY (repositoryScopeKey)
  )`,
  `CREATE NODE TABLE ProjectionSnapshot(
    snapshotKey STRING,
    indexFormatVersion STRING,
    projectionSchemaVersion STRING,
    normalizationVersion STRING,
    exporterName STRING,
    exporterVersion STRING,
    loreVersion STRING,
    ladybugVersion STRING,
    ladybugStorageVersion STRING,
    repositoryScopeKey STRING,
    bundleId STRING,
    okfVersion STRING,
    docsRoot STRING,
    gitCommit STRING,
    exportDigest STRING,
    taskSnapshotDigest STRING,
    sourceFingerprint STRING,
    sourceRecordsDigest STRING,
    recordKeysDigest STRING,
    lexicalDocumentCount INT64,
    lexicalTotalLength INT64,
    recordCount INT64,
    conceptCount INT64,
    taskCount INT64,
    authoredEdgeCount INT64,
    manifestJson STRING,
    trailerJson STRING,
    PRIMARY KEY (snapshotKey)
  )`,
  `CREATE NODE TABLE SourceCommit(
    commitKey STRING,
    repositoryScopeKey STRING,
    sha STRING,
    PRIMARY KEY (commitKey)
  )`,
  `CREATE NODE TABLE ConceptRecord(
    recordKey STRING,
    repositoryScopeKey STRING,
    snapshotKey STRING,
    bundleId STRING,
    gitCommit STRING,
    exportDigest STRING,
    conceptId STRING,
    path STRING,
    conceptType STRING,
    frontmatterJson STRING,
    title STRING,
    summary STRING,
    description STRING,
    tagsJson STRING,
    body STRING,
    contentHash STRING,
    tokenEstimate INT64,
    lexicalLength INT64,
    PRIMARY KEY (recordKey)
  )`,
  `CREATE NODE TABLE TaskRecord(
    recordKey STRING,
    repositoryScopeKey STRING,
    snapshotKey STRING,
    bundleId STRING,
    gitCommit STRING,
    exportDigest STRING,
    taskId STRING,
    title STRING,
    status STRING,
    labelsJson STRING,
    priority STRING,
    ordinal INT64,
    assigneesJson STRING,
    milestone STRING,
    parentTaskId STRING,
    sourceAdapterVersion STRING,
    sourceRecordJson STRING,
    PRIMARY KEY (recordKey)
  )`,
  `CREATE NODE TABLE AuthoredEdgeRecord(
    recordKey STRING,
    repositoryScopeKey STRING,
    snapshotKey STRING,
    bundleId STRING,
    gitCommit STRING,
    exportDigest STRING,
    fromRecordKey STRING,
    toRecordKey STRING,
    kind STRING,
    target STRING,
    ordinal INT64,
    dangling BOOL,
    sourceRecordJson STRING,
    PRIMARY KEY (recordKey)
  )`,
  `CREATE NODE TABLE LexicalTerm(
    termKey STRING,
    documentFrequency INT64,
    PRIMARY KEY (termKey)
  )`,
  "CREATE REL TABLE HAS_SNAPSHOT(FROM RepositoryProjection TO ProjectionSnapshot)",
  "CREATE REL TABLE AT_COMMIT(FROM ProjectionSnapshot TO SourceCommit)",
  "CREATE REL TABLE HAS_CONCEPT(FROM ProjectionSnapshot TO ConceptRecord)",
  "CREATE REL TABLE HAS_TASK(FROM ProjectionSnapshot TO TaskRecord)",
  "CREATE REL TABLE HAS_EDGE(FROM ProjectionSnapshot TO AuthoredEdgeRecord)",
  "CREATE REL TABLE EDGE_SOURCE(FROM ConceptRecord TO AuthoredEdgeRecord)",
  "CREATE REL TABLE EDGE_TASK_SOURCE(FROM TaskRecord TO AuthoredEdgeRecord)",
  "CREATE REL TABLE EDGE_CONCEPT_TARGET(FROM AuthoredEdgeRecord TO ConceptRecord)",
  "CREATE REL TABLE EDGE_TASK_TARGET(FROM AuthoredEdgeRecord TO TaskRecord)",
  "CREATE REL TABLE HAS_TERM(FROM ConceptRecord TO LexicalTerm, frequency INT64)",
] as const;

/** Create and populate a new isolated database. The path must not be published. */
export async function buildLadybugDatabase(databasePath: string, source: LadybugProjectionSource): Promise<void> {
  const database = writableDatabase(databasePath);
  const connection = new Connection(database);
  try {
    for (const query of SCHEMA_QUERIES) await executeQuery(connection, query);
    await insertProjection(connection, databasePath, source);
    await executeQuery(connection, "CHECKPOINT");
  } finally {
    await closeConnection(connection);
    await database.close();
  }
}

/**
 * Open an immutable generation read-only and prove that its promoted metadata,
 * source records, keys, counts, and structural relationship endpoints match the
 * validated export snapshot.
 */
export async function verifyLadybugDatabase(
  databasePath: string,
  source: LadybugProjectionSource,
): Promise<LadybugDatabaseVerification> {
  const database = readOnlyDatabase(databasePath);
  const connection = new Connection(database);
  try {
    const snapshotRows = await queryRows(
      connection,
      `MATCH (s:ProjectionSnapshot {snapshotKey: $snapshotKey})
       RETURN s.snapshotKey AS snapshotKey,
              s.indexFormatVersion AS indexFormatVersion,
              s.projectionSchemaVersion AS projectionSchemaVersion,
              s.normalizationVersion AS normalizationVersion,
              s.exporterName AS exporterName,
              s.exporterVersion AS exporterVersion,
              s.loreVersion AS loreVersion,
              s.ladybugVersion AS ladybugVersion,
              s.ladybugStorageVersion AS ladybugStorageVersion,
              s.repositoryScopeKey AS repositoryScopeKey,
              s.bundleId AS bundleId,
              s.okfVersion AS okfVersion,
              s.docsRoot AS docsRoot,
              s.gitCommit AS gitCommit,
              s.exportDigest AS exportDigest,
              s.taskSnapshotDigest AS taskSnapshotDigest,
              s.sourceFingerprint AS sourceFingerprint,
              s.sourceRecordsDigest AS sourceRecordsDigest,
              s.recordKeysDigest AS recordKeysDigest,
              s.recordCount AS recordCount,
              s.conceptCount AS conceptCount,
              s.taskCount AS taskCount,
              s.authoredEdgeCount AS authoredEdgeCount,
              s.manifestJson AS manifestJson,
              s.trailerJson AS trailerJson`,
      { snapshotKey: source.snapshotKey },
    );
    if (snapshotRows.length !== 1) corrupt("projection snapshot metadata is missing or duplicated");
    const actual = snapshotRows[0] as Record<string, unknown>;
    const expected = snapshotMetadata(source);
    for (const [key, value] of Object.entries(expected)) {
      if (!sameDatabaseValue(actual[key], value)) {
        corrupt(`projection snapshot metadata differs for ${key}`);
      }
    }

    await verifyConceptRecordTable(connection, source);
    await verifyRecordTable(connection, "TaskRecord", source.tasks);
    await verifyRecordTable(connection, "AuthoredEdgeRecord", source.authoredEdges);
    await verifyPromotedSamples(connection, source);

    await expectCount(connection, "MATCH (n:RepositoryProjection) RETURN count(n) AS count", 1, "repository");
    await expectCount(connection, "MATCH (n:ProjectionSnapshot) RETURN count(n) AS count", 1, "snapshot");
    await expectCount(
      connection,
      "MATCH (n:SourceCommit) RETURN count(n) AS count",
      source.commitKey === null ? 0 : 1,
      "source commit",
    );
    await expectCount(connection, "MATCH ()-[r:HAS_SNAPSHOT]->() RETURN count(r) AS count", 1, "HAS_SNAPSHOT");
    await expectCount(
      connection,
      "MATCH ()-[r:AT_COMMIT]->() RETURN count(r) AS count",
      source.commitKey === null ? 0 : 1,
      "AT_COMMIT",
    );
    await expectCount(
      connection,
      "MATCH ()-[r:HAS_CONCEPT]->() RETURN count(r) AS count",
      source.counts.concepts,
      "HAS_CONCEPT",
    );
    await expectCount(
      connection,
      "MATCH ()-[r:HAS_TASK]->() RETURN count(r) AS count",
      source.counts.tasks,
      "HAS_TASK",
    );
    await expectCount(
      connection,
      "MATCH ()-[r:HAS_EDGE]->() RETURN count(r) AS count",
      source.counts.authoredEdges,
      "HAS_EDGE",
    );
    const conceptSources = source.authoredEdges.filter((edge) => edgeSourceKind(edge) === "concept");
    const taskSources = source.authoredEdges.filter((edge) => edgeSourceKind(edge) === "task");
    await expectCount(
      connection,
      "MATCH ()-[r:EDGE_SOURCE]->() RETURN count(r) AS count",
      conceptSources.length,
      "EDGE_SOURCE",
    );
    if (taskSources.length > 0) {
      await expectCount(
        connection,
        "MATCH ()-[r:EDGE_TASK_SOURCE]->() RETURN count(r) AS count",
        taskSources.length,
        "EDGE_TASK_SOURCE",
      );
    }
    const conceptTargets = source.authoredEdges.filter(
      (edge) => edgeTargetKind(edge) === "concept" && !edge.dangling,
    ).length;
    const taskTargets = source.authoredEdges.filter((edge) => edgeTargetKind(edge) === "task" && !edge.dangling).length;
    await expectCount(
      connection,
      "MATCH ()-[r:EDGE_CONCEPT_TARGET]->() RETURN count(r) AS count",
      conceptTargets,
      "EDGE_CONCEPT_TARGET",
    );
    await expectCount(
      connection,
      "MATCH ()-[r:EDGE_TASK_TARGET]->() RETURN count(r) AS count",
      taskTargets,
      "EDGE_TASK_TARGET",
    );
    await expectCount(
      connection,
      `MATCH (source:ConceptRecord)-[:EDGE_SOURCE]->(edge:AuthoredEdgeRecord)
       WHERE source.recordKey <> edge.fromRecordKey
       RETURN count(edge) AS count`,
      0,
      "EDGE_SOURCE endpoint mismatch",
    );
    if (taskSources.length > 0) {
      await expectCount(
        connection,
        `MATCH (source:TaskRecord)-[:EDGE_TASK_SOURCE]->(edge:AuthoredEdgeRecord)
         WHERE source.recordKey <> edge.fromRecordKey
         RETURN count(edge) AS count`,
        0,
        "EDGE_TASK_SOURCE endpoint mismatch",
      );
    }
    await expectCount(
      connection,
      `MATCH (edge:AuthoredEdgeRecord)-[:EDGE_CONCEPT_TARGET]->(target:ConceptRecord)
       WHERE edge.toRecordKey <> target.recordKey OR edge.dangling = true
       RETURN count(edge) AS count`,
      0,
      "EDGE_CONCEPT_TARGET endpoint mismatch",
    );
    await expectCount(
      connection,
      `MATCH (edge:AuthoredEdgeRecord)-[:EDGE_TASK_TARGET]->(target:TaskRecord)
       WHERE edge.toRecordKey <> target.recordKey OR edge.dangling = true
       RETURN count(edge) AS count`,
      0,
      "EDGE_TASK_TARGET endpoint mismatch",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:RepositoryProjection)-[:HAS_SNAPSHOT]->(b:ProjectionSnapshot)
       RETURN a.repositoryScopeKey AS fromKey, b.snapshotKey AS toKey`,
      [[source.repositoryScopeKey, source.snapshotKey]],
      "HAS_SNAPSHOT",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:ProjectionSnapshot)-[:AT_COMMIT]->(b:SourceCommit)
       RETURN a.snapshotKey AS fromKey, b.commitKey AS toKey`,
      source.commitKey === null ? [] : [[source.snapshotKey, source.commitKey]],
      "AT_COMMIT",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:ProjectionSnapshot)-[:HAS_CONCEPT]->(b:ConceptRecord)
       RETURN a.snapshotKey AS fromKey, b.recordKey AS toKey`,
      source.concepts.map((record) => [source.snapshotKey, record.key]),
      "HAS_CONCEPT",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:ProjectionSnapshot)-[:HAS_TASK]->(b:TaskRecord)
       RETURN a.snapshotKey AS fromKey, b.recordKey AS toKey`,
      source.tasks.map((record) => [source.snapshotKey, record.key]),
      "HAS_TASK",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:ProjectionSnapshot)-[:HAS_EDGE]->(b:AuthoredEdgeRecord)
       RETURN a.snapshotKey AS fromKey, b.recordKey AS toKey`,
      source.authoredEdges.map((record) => [source.snapshotKey, record.key]),
      "HAS_EDGE",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:ConceptRecord)-[:EDGE_SOURCE]->(b:AuthoredEdgeRecord)
       RETURN a.recordKey AS fromKey, b.recordKey AS toKey`,
      conceptSources.map((record) => [record.from, record.key]),
      "EDGE_SOURCE",
    );
    if (taskSources.length > 0) {
      await expectRelationshipPairs(
        connection,
        `MATCH (a:TaskRecord)-[:EDGE_TASK_SOURCE]->(b:AuthoredEdgeRecord)
         RETURN a.recordKey AS fromKey, b.recordKey AS toKey`,
        taskSources.map((record) => [record.from, record.key]),
        "EDGE_TASK_SOURCE",
      );
    }
    await expectRelationshipPairs(
      connection,
      `MATCH (a:AuthoredEdgeRecord)-[:EDGE_CONCEPT_TARGET]->(b:ConceptRecord)
       RETURN a.recordKey AS fromKey, b.recordKey AS toKey`,
      source.authoredEdges
        .filter((record) => edgeTargetKind(record) === "concept" && !record.dangling && record.to !== null)
        .map((record) => [record.key, record.to as string]),
      "EDGE_CONCEPT_TARGET",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:AuthoredEdgeRecord)-[:EDGE_TASK_TARGET]->(b:TaskRecord)
       RETURN a.recordKey AS fromKey, b.recordKey AS toKey`,
      source.authoredEdges
        .filter((record) => edgeTargetKind(record) === "task" && !record.dangling && record.to !== null)
        .map((record) => [record.key, record.to as string]),
      "EDGE_TASK_TARGET",
    );

    return {
      repositoryScopeKey: source.repositoryScopeKey,
      snapshotKey: source.snapshotKey,
      sourceFingerprint: source.sourceFingerprint,
      exportDigest: source.exportDigest,
      taskSnapshotDigest: source.taskSnapshotDigest,
      sourceRecordsDigest: source.sourceRecordsDigest,
      recordKeysDigest: source.recordKeysDigest,
      recordCount: source.trailer.recordCount,
      conceptCount: source.counts.concepts,
      taskCount: source.counts.tasks,
      authoredEdgeCount: source.counts.authoredEdges,
    };
  } finally {
    await closeConnection(connection);
    await database.close();
  }
}

/** Verify bounded promoted metadata after the immutable file digest has already matched. */
export async function verifyLadybugDatabaseMetadata(
  databasePath: string,
  expected: LadybugDatabaseVerification,
): Promise<LadybugDatabaseVerification> {
  return withReadConnection(databasePath, async (connection) => {
    const rows = await queryRows(
      connection,
      `MATCH (s:ProjectionSnapshot {snapshotKey: $snapshotKey})
       RETURN s.repositoryScopeKey AS repositoryScopeKey, s.snapshotKey AS snapshotKey,
              s.sourceFingerprint AS sourceFingerprint, s.exportDigest AS exportDigest,
              s.taskSnapshotDigest AS taskSnapshotDigest, s.sourceRecordsDigest AS sourceRecordsDigest,
              s.recordKeysDigest AS recordKeysDigest, s.recordCount AS recordCount,
              s.conceptCount AS conceptCount, s.taskCount AS taskCount,
              s.authoredEdgeCount AS authoredEdgeCount`,
      { snapshotKey: expected.snapshotKey },
    );
    if (rows.length !== 1) corrupt("projection snapshot metadata is missing or duplicated");
    const row = rows[0] as Record<string, unknown>;
    for (const [key, value] of Object.entries(expected)) {
      if (!sameDatabaseValue(row[key], value)) corrupt(`projection snapshot metadata differs for ${key}`);
    }
    await expectCount(connection, "MATCH (n:ConceptRecord) RETURN count(n) AS count", expected.conceptCount, "concept");
    await expectCount(connection, "MATCH (n:TaskRecord) RETURN count(n) AS count", expected.taskCount, "task");
    await expectCount(
      connection,
      "MATCH (n:AuthoredEdgeRecord) RETURN count(n) AS count",
      expected.authoredEdgeCount,
      "authored edge",
    );
    return expected;
  });
}

/** Read canonical source records for deterministic tests and later bounded readers. */
export async function readLadybugSourceRecords(databasePath: string): Promise<ReadonlyMap<string, string>> {
  const database = fullScanDatabase(databasePath);
  const connection = new Connection(database);
  try {
    const result = new Map<string, string>();
    const concepts = await queryRows(
      connection,
      `MATCH (n:ConceptRecord)
       RETURN n.recordKey AS recordKey, n.conceptId AS conceptId, n.path AS path,
              n.conceptType AS conceptType, n.frontmatterJson AS frontmatterJson,
              n.body AS body, n.contentHash AS contentHash, n.tokenEstimate AS tokenEstimate
       ORDER BY n.recordKey`,
    );
    for (const row of concepts) {
      const record = conceptRecordFromPromotedRow(row);
      result.set(record.key, JSON.stringify(record));
    }
    for (const table of ["TaskRecord", "AuthoredEdgeRecord"] as const) {
      const rows = await queryRows(
        connection,
        `MATCH (n:${table}) RETURN n.recordKey AS key, n.sourceRecordJson AS sourceRecordJson ORDER BY n.recordKey`,
      );
      for (const row of rows) {
        const key = row.key;
        const sourceRecordJson = row.sourceRecordJson;
        if (typeof key !== "string" || typeof sourceRecordJson !== "string" || result.has(key)) {
          corrupt(`invalid or duplicate source record in ${table}`);
        }
        result.set(key, sourceRecordJson);
      }
    }
    return result;
  } finally {
    await closeConnection(connection);
    await database.close();
  }
}

/**
 * Read the verified projection into Lore's existing deterministic graph model.
 *
 * The database remains an implementation detail: canonical export records are
 * the read boundary, source record keys are translated back to concept ids, and
 * neither Ladybug ids nor physical schema values enter the returned graph.
 */
export async function readLadybugBundleGraph(
  databasePath: string,
  source: LadybugProjectionSource,
): Promise<BundleGraph> {
  const database = fullScanDatabase(databasePath);
  const connection = new Connection(database);
  try {
    const conceptRows = await queryRows(
      connection,
      `MATCH (n:ConceptRecord)
       RETURN n.recordKey AS recordKey, n.conceptId AS conceptId, n.path AS path,
              n.conceptType AS conceptType, n.frontmatterJson AS frontmatterJson,
              n.body AS body, n.contentHash AS contentHash, n.tokenEstimate AS tokenEstimate`,
    );
    const edgeRows = await queryRows(
      connection,
      "MATCH (n:AuthoredEdgeRecord) RETURN n.sourceRecordJson AS sourceRecordJson",
    );
    if (conceptRows.length !== source.counts.concepts || edgeRows.length !== source.counts.authoredEdges) {
      corrupt("indexed read counts differ from the verified source snapshot");
    }

    const records = conceptRows.map(conceptRecordFromPromotedRow);
    records.sort((a, b) => compare(a.id, b.id));
    const concepts = new Map<string, Concept>();
    const conceptIdsByRecordKey = new Map<string, string>();
    const tokenEstimates = new Map<string, number>();
    const docsPrefix = `${source.manifest.bundle.docsRoot}/`;
    for (const record of records) {
      if (concepts.has(record.id) || conceptIdsByRecordKey.has(record.key) || !record.path.startsWith(docsPrefix)) {
        corrupt("indexed concept identities are duplicated or outside the bundle root");
      }
      const concept: Concept = {
        id: record.id,
        path: record.path.slice(docsPrefix.length),
        type: record.type,
        frontmatter: record.frontmatter,
        body: record.body,
      };
      concepts.set(record.id, concept);
      conceptIdsByRecordKey.set(record.key, record.id);
      tokenEstimates.set(record.id, record.tokenEstimate);
    }

    const indexedEdges = edgeRows
      .map((row) => parseEdgeSourceRecord(row.sourceRecordJson))
      .filter((record) => edgeSourceKind(record) === "concept" && edgeTargetKind(record) === "concept")
      .map((record) => {
        const from = conceptIdsByRecordKey.get(record.from);
        const to = record.to === null ? null : conceptIdsByRecordKey.get(record.to);
        if (
          from === undefined ||
          (record.to !== null && to === undefined) ||
          record.dangling !== (record.to === null) ||
          !isEdgeKind(record.kind)
        ) {
          corrupt("indexed authored-edge identities or promoted fields disagree");
        }
        return { record, edge: { from, to: to ?? null, kind: record.kind, target: record.target } satisfies Edge };
      });
    indexedEdges.sort(
      (a, b) =>
        compare(a.edge.from, b.edge.from) || a.record.ordinal - b.record.ordinal || compare(a.record.key, b.record.key),
    );
    for (let index = 1; index < indexedEdges.length; index++) {
      const previous = indexedEdges[index - 1] as (typeof indexedEdges)[number];
      const current = indexedEdges[index] as (typeof indexedEdges)[number];
      if (previous.edge.from === current.edge.from && previous.record.ordinal === current.record.ordinal) {
        corrupt("indexed concept-edge ordinals are duplicated");
      }
    }
    const edges = indexedEdges.map(({ edge }) => edge);

    let total: number | undefined;
    const tokenEstimate = (id?: string): number => {
      if (id === undefined) {
        total ??= [...tokenEstimates.values()].reduce((sum, value) => sum + value, 0);
        return total;
      }
      const value = tokenEstimates.get(id);
      if (value === undefined) {
        throw new LoreError(
          "not_found",
          `concept "${id}" is not in the bundle`,
          "run `lore query` to find the right id, or check the path",
          { id },
        );
      }
      return value;
    };
    return {
      state: resolveBundleState({ okf_version: source.manifest.bundle.okfVersion }).state,
      concepts,
      edges,
      tokenEstimate,
    };
  } finally {
    await closeConnection(connection);
    await database.close();
  }
}

/** Open one shared read-only native session for bounded indexed operations in this CLI process. */
export function openLadybugIndexedReader(databasePath: string, source: LadybugProjectionSource): LadybugIndexedReader {
  const database = readOnlyDatabase(databasePath);
  const connection = new Connection(database);
  // Prepare the primary-key body lookup once during warm open. Context calls on
  // this reader then bind and execute it without reparsing/replanning Cypher.
  const conceptBodyStatement = prepareSync(connection, CONCEPT_BODY_QUERY);
  const recordKeyById = new Map<string, string>();
  let closed = false;
  return {
    readBundleGraph: (bodyId?: string) =>
      readIndexedBundleGraph(databasePath, source, bodyId, connection, (recordIds) => {
        for (const [recordKey, id] of recordIds) recordKeyById.set(id, recordKey);
      }),
    readConceptBody: async (id: string) => {
      const recordKey = recordKeyById.get(id);
      if (recordKey === undefined) return undefined;
      const rows = await queryPreparedRows(connection, conceptBodyStatement, { recordKey });
      if (rows.length !== 1) corrupt("indexed concept body is missing or duplicated");
      const body = rows[0]?.body;
      if (body !== null && typeof body !== "string") corrupt("indexed concept body is invalid");
      return body ?? "";
    },
    readTraversalRecords: () => readIndexedTraversalRecords(source, connection),
    query: (options: QueryOptions) => queryIndexedDatabase(databasePath, source, options, connection),
    close: async () => {
      if (closed) return;
      closed = true;
      await closeConnection(connection);
      await database.close();
    },
  };
}

async function readIndexedTraversalRecords(
  source: LadybugProjectionSource,
  connection: Connection,
): Promise<TraversalSourceRecords> {
  const read = async <T extends ProjectionTaskRecord | ProjectionEdgeRecord>(
    table: "TaskRecord" | "AuthoredEdgeRecord",
    discriminator: T["record"],
  ): Promise<T[]> => {
    const rows = await queryRows(
      connection,
      `MATCH (n:${table}) RETURN n.sourceRecordJson AS sourceRecordJson ORDER BY n.recordKey`,
    );
    return rows.map((row) => {
      const record = parseSourceRecord(row.sourceRecordJson);
      if (record.record !== discriminator) corrupt(`invalid ${table} traversal source record`);
      return record as unknown as T;
    });
  };
  const conceptRows = await queryRows(
    connection,
    `MATCH (n:ConceptRecord)
     RETURN n.recordKey AS recordKey, n.conceptId AS conceptId, n.path AS path,
            n.conceptType AS conceptType, n.frontmatterJson AS frontmatterJson,
            n.body AS body, n.contentHash AS contentHash, n.tokenEstimate AS tokenEstimate
     ORDER BY n.recordKey`,
  );
  const concepts = conceptRows.map(conceptRecordFromPromotedRow);
  const tasks = await read<ProjectionTaskRecord>("TaskRecord", "task");
  const authoredEdges = await read<ProjectionEdgeRecord>("AuthoredEdgeRecord", "edge");
  if (
    concepts.length !== source.counts.concepts ||
    tasks.length !== source.counts.tasks ||
    authoredEdges.length !== source.counts.authoredEdges
  ) {
    corrupt("indexed traversal counts differ from the verified source snapshot");
  }
  return { concepts, tasks, authoredEdges };
}

async function readIndexedBundleGraph(
  databasePath: string,
  source: LadybugProjectionSource,
  bodyId?: string,
  existingConnection?: Connection,
  observeRecordIds?: (recordIds: ReadonlyMap<string, string>) => void,
): Promise<BundleGraph> {
  return useReadConnection(databasePath, existingConnection, async (connection) => {
    const conceptRows = await queryRows(
      connection,
      `MATCH (n:ConceptRecord)
       RETURN n.recordKey AS recordKey, n.conceptId AS conceptId, n.path AS path,
              n.conceptType AS conceptType, n.frontmatterJson AS frontmatterJson,
              n.tokenEstimate AS tokenEstimate
       ORDER BY n.conceptId`,
    );
    if (conceptRows.length !== source.counts.concepts) corrupt("indexed concept count differs");
    const bodies = new Map<string, string>();
    if (bodyId !== undefined) {
      const rows = await queryRows(
        connection,
        `MATCH (n:ConceptRecord) WHERE n.conceptId = $conceptId
         RETURN n.conceptId AS conceptId, n.body AS body`,
        { conceptId: bodyId },
      );
      if (rows.length > 1) corrupt("indexed concept id is duplicated");
      const row = rows[0];
      if (
        row !== undefined &&
        typeof row.conceptId === "string" &&
        (typeof row.body === "string" || row.body === null)
      ) {
        bodies.set(row.conceptId, row.body ?? "");
      }
    }
    const { concepts, recordIds, tokenEstimates } = conceptsFromRows(conceptRows, source, bodies);
    observeRecordIds?.(recordIds);
    const edgeRows = await queryRows(
      connection,
      `MATCH (n:AuthoredEdgeRecord) WHERE n.kind <> 'task'
       RETURN n.recordKey AS recordKey, n.fromRecordKey AS fromRecordKey,
              n.toRecordKey AS toRecordKey, n.kind AS kind, n.target AS target,
              n.ordinal AS ordinal, n.dangling AS dangling
       ORDER BY n.fromRecordKey, n.ordinal, n.recordKey`,
    );
    const edges = edgesFromRows(edgeRows, recordIds);
    return bundleGraph(concepts, edges, tokenEstimates, source);
  });
}

async function queryIndexedDatabase(
  databasePath: string,
  source: LadybugProjectionSource,
  options: QueryOptions,
  existingConnection?: Connection,
): Promise<LoreQueryResult> {
  return useReadConnection(databasePath, existingConnection, async (connection) => {
    const terms = [...new Set(tokenizeQueryText((options.text ?? "").trim()))];
    if (terms.length === 0) {
      const rows = await queryConceptMetadata(connection);
      const { concepts, tokenEstimates } = conceptsFromRows(rows, source);
      return queryWithBm25Index(bundleGraph(concepts, [], tokenEstimates, source), options);
    }

    const snapshotRows = await queryRows(
      connection,
      `MATCH (s:ProjectionSnapshot {snapshotKey: $snapshotKey})
       RETURN s.lexicalDocumentCount AS documentCount, s.lexicalTotalLength AS totalLength`,
      { snapshotKey: source.snapshotKey },
    );
    if (snapshotRows.length !== 1) corrupt("lexical snapshot metadata is missing or duplicated");
    const n = requiredNumber(snapshotRows[0]?.documentCount, "lexical document count");
    const totalLength = requiredNumber(snapshotRows[0]?.totalLength, "lexical total length");
    const rowById = new Map<string, Record<string, LbugValue>>();
    const tfById = new Map<string, Map<string, number>>();
    const df = new Map<string, number>();
    for (const term of terms) {
      const rows = await queryRows(
        connection,
        `MATCH (t:LexicalTerm {termKey: $termKey})<-[p:HAS_TERM]-(c:ConceptRecord)
         RETURN t.documentFrequency AS documentFrequency,
                c.recordKey AS recordKey, c.conceptId AS conceptId, c.path AS path,
                c.conceptType AS conceptType, c.frontmatterJson AS frontmatterJson,
                c.tokenEstimate AS tokenEstimate, c.lexicalLength AS lexicalLength,
                p.frequency AS frequency
         ORDER BY c.conceptId`,
        { termKey: lexicalTermKey(term) },
      );
      for (const row of rows) {
        const id = requiredString(row.conceptId, "lexical concept id");
        rowById.set(id, row);
        const frequency = requiredNumber(row.frequency, "lexical term frequency");
        let frequencies = tfById.get(id);
        if (frequencies === undefined) {
          frequencies = new Map();
          tfById.set(id, frequencies);
        }
        frequencies.set(term, frequency);
        const documentFrequency = requiredNumber(row.documentFrequency, "lexical document frequency");
        const previous = df.get(term);
        if (previous !== undefined && previous !== documentFrequency) corrupt("lexical document frequency differs");
        df.set(term, documentFrequency);
      }
    }
    const rows = [...rowById.values()].sort((a, b) =>
      compare(requiredString(a.conceptId, "concept id"), requiredString(b.conceptId, "concept id")),
    );
    const { concepts, tokenEstimates } = conceptsFromRows(rows, source);
    const docs = new Map<string, { tf: ReadonlyMap<string, number>; length: number }>();
    for (const row of rows) {
      const id = requiredString(row.conceptId, "lexical concept id");
      docs.set(id, {
        tf: tfById.get(id) ?? new Map(),
        length: requiredNumber(row.lexicalLength, "lexical document length"),
      });
    }
    const index: Bm25Index = { docs, df, n, avgdl: n === 0 ? 0 : totalLength / n };
    return queryWithBm25Index(bundleGraph(concepts, [], tokenEstimates, source), options, index);
  });
}

async function queryConceptMetadata(connection: Connection): Promise<Record<string, LbugValue>[]> {
  return queryRows(
    connection,
    `MATCH (n:ConceptRecord)
     RETURN n.recordKey AS recordKey, n.conceptId AS conceptId, n.path AS path,
            n.conceptType AS conceptType, n.frontmatterJson AS frontmatterJson,
            n.tokenEstimate AS tokenEstimate
     ORDER BY n.conceptId`,
  );
}

function conceptsFromRows(
  rows: readonly Record<string, LbugValue>[],
  source: LadybugProjectionSource,
  bodies: ReadonlyMap<string, string> = new Map(),
): {
  concepts: Map<string, Concept>;
  recordIds: Map<string, string>;
  tokenEstimates: Map<string, number>;
} {
  const concepts = new Map<string, Concept>();
  const recordIds = new Map<string, string>();
  const tokenEstimates = new Map<string, number>();
  const docsPrefix = `${source.manifest.bundle.docsRoot}/`;
  for (const row of rows) {
    const recordKey = requiredString(row.recordKey, "concept record key");
    const id = requiredString(row.conceptId, "concept id");
    const path = requiredString(row.path, "concept path");
    const type = requiredString(row.conceptType, "concept type");
    if (!path.startsWith(docsPrefix) || concepts.has(id) || recordIds.has(recordKey)) {
      corrupt("indexed concept identities are duplicated or outside the bundle root");
    }
    const frontmatter = parseObjectJson(row.frontmatterJson, "concept frontmatter");
    concepts.set(id, { id, path: path.slice(docsPrefix.length), type, frontmatter, body: bodies.get(id) ?? "" });
    recordIds.set(recordKey, id);
    tokenEstimates.set(id, requiredNumber(row.tokenEstimate, "concept token estimate"));
  }
  return { concepts, recordIds, tokenEstimates };
}

function edgesFromRows(rows: readonly Record<string, LbugValue>[], recordIds: ReadonlyMap<string, string>): Edge[] {
  const indexed = rows.map((row) => {
    const fromKey = requiredString(row.fromRecordKey, "edge source key");
    const from = recordIds.get(fromKey);
    const toKey = row.toRecordKey;
    const to = typeof toKey === "string" ? recordIds.get(toKey) : undefined;
    const kind = requiredString(row.kind, "edge kind");
    const dangling = row.dangling;
    if (from === undefined || !isEdgeKind(kind) || typeof dangling !== "boolean") corrupt("indexed edge is invalid");
    if ((!dangling && (typeof toKey !== "string" || to === undefined)) || (dangling && toKey !== null)) {
      corrupt("indexed edge endpoint differs");
    }
    return {
      ordinal: requiredNumber(row.ordinal, "edge ordinal"),
      recordKey: requiredString(row.recordKey, "edge record key"),
      edge: { from, to: to ?? null, kind, target: requiredString(row.target, "edge target") } satisfies Edge,
    };
  });
  indexed.sort(
    (a, b) => compare(a.edge.from, b.edge.from) || a.ordinal - b.ordinal || compare(a.recordKey, b.recordKey),
  );
  return indexed.map(({ edge }) => edge);
}

function bundleGraph(
  concepts: ReadonlyMap<string, Concept>,
  edges: readonly Edge[],
  tokenEstimates: ReadonlyMap<string, number>,
  source: LadybugProjectionSource,
): BundleGraph {
  const neighbors = buildNeighborIndex(edges);
  let total: number | undefined;
  return {
    state: resolveBundleState({ okf_version: source.manifest.bundle.okfVersion }).state,
    concepts,
    edges,
    neighbors: (id) => neighbors.get(id) ?? EMPTY_NEIGHBORS,
    tokenEstimate(id?: string): number {
      if (id === undefined) {
        total ??= [...tokenEstimates.values()].reduce((sum, value) => sum + value, 0);
        return total;
      }
      const value = tokenEstimates.get(id);
      if (value === undefined) {
        throw new LoreError(
          "not_found",
          `concept "${id}" is not in the bundle`,
          "run `lore query` to find the right id, or check the path",
          { id },
        );
      }
      return value;
    },
  };
}

const EMPTY_NEIGHBORS: readonly string[] = [];

function buildNeighborIndex(edges: readonly Edge[]): ReadonlyMap<string, ReadonlySet<string>> {
  const neighbors = new Map<string, Set<string>>();
  const connect = (from: string, to: string): void => {
    let adjacent = neighbors.get(from);
    if (adjacent === undefined) {
      adjacent = new Set<string>();
      neighbors.set(from, adjacent);
    }
    adjacent.add(to);
  };
  for (const edge of edges) {
    if (edge.to === null || edge.to === edge.from) continue;
    connect(edge.from, edge.to);
    connect(edge.to, edge.from);
  }
  return neighbors;
}

async function withReadConnection<T>(databasePath: string, fn: (connection: Connection) => Promise<T>): Promise<T> {
  const database = readOnlyDatabase(databasePath);
  const connection = new Connection(database);
  try {
    return await fn(connection);
  } finally {
    await closeConnection(connection);
    await database.close();
  }
}

function useReadConnection<T>(
  databasePath: string,
  existing: Connection | undefined,
  fn: (connection: Connection) => Promise<T>,
): Promise<T> {
  return existing === undefined ? withReadConnection(databasePath, fn) : fn(existing);
}

function parseObjectJson(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "string") corrupt(`${label} JSON is missing`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    corrupt(`${label} JSON is malformed`);
  }
  if (!isObject(parsed)) corrupt(`${label} JSON is not an object`);
  return parsed;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") corrupt(`${label} is invalid`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  const number = numericValue(value);
  if (number === null || !Number.isSafeInteger(number) || number < 0) corrupt(`${label} is invalid`);
  return number;
}

function writableDatabase(path: string): Database {
  return new Database(path, WRITER_BUFFER_BYTES, true, false, 0, false, -1, true, true, true);
}

function readOnlyDatabase(path: string): Database {
  return new Database(path, READER_BUFFER_BYTES, true, true, 0, true, -1, true, true, true);
}

function fullScanDatabase(path: string): Database {
  return new Database(path, FULL_SCAN_BUFFER_BYTES, true, true, 0, true, -1, true, true, true);
}

async function insertProjection(
  connection: Connection,
  databasePath: string,
  source: LadybugProjectionSource,
): Promise<void> {
  const common = {
    repositoryScopeKey: source.repositoryScopeKey,
    snapshotKey: source.snapshotKey,
    bundleId: source.manifest.bundle.id,
    gitCommit: source.manifest.bundle.gitCommit,
    exportDigest: source.exportDigest,
  };
  const lexical = buildProjectionLexicalIndex(source);
  VERIFIED_LEXICAL_LENGTHS.set(source, new Map([...lexical.docs].map(([id, document]) => [id, document.length])));
  Bun.gc(true);
  await executePrepared(
    connection,
    `CREATE (n:RepositoryProjection {
      repositoryScopeKey: $repositoryScopeKey,
      bundleId: $bundleId,
      docsRoot: $docsRoot
    })`,
    {
      repositoryScopeKey: source.repositoryScopeKey,
      bundleId: source.manifest.bundle.id,
      docsRoot: source.manifest.bundle.docsRoot,
    },
  );
  await executePrepared(
    connection,
    `CREATE (n:ProjectionSnapshot {
      snapshotKey: $snapshotKey,
      indexFormatVersion: $indexFormatVersion,
      projectionSchemaVersion: $projectionSchemaVersion,
      normalizationVersion: $normalizationVersion,
      exporterName: $exporterName,
      exporterVersion: $exporterVersion,
      loreVersion: $loreVersion,
      ladybugVersion: $ladybugVersion,
      ladybugStorageVersion: $ladybugStorageVersion,
      repositoryScopeKey: $repositoryScopeKey,
      bundleId: $bundleId,
      okfVersion: $okfVersion,
      docsRoot: $docsRoot,
      gitCommit: $gitCommit,
      exportDigest: $exportDigest,
      taskSnapshotDigest: $taskSnapshotDigest,
      sourceFingerprint: $sourceFingerprint,
      sourceRecordsDigest: $sourceRecordsDigest,
      recordKeysDigest: $recordKeysDigest,
      lexicalDocumentCount: $lexicalDocumentCount,
      lexicalTotalLength: $lexicalTotalLength,
      recordCount: $recordCount,
      conceptCount: $conceptCount,
      taskCount: $taskCount,
      authoredEdgeCount: $authoredEdgeCount,
      manifestJson: $manifestJson,
      trailerJson: $trailerJson
    })`,
    snapshotMetadata(source, lexical),
  );
  if (source.commitKey !== null && source.manifest.bundle.gitCommit !== null) {
    await executePrepared(
      connection,
      `CREATE (n:SourceCommit {
        commitKey: $commitKey,
        repositoryScopeKey: $repositoryScopeKey,
        sha: $sha
      })`,
      {
        commitKey: source.commitKey,
        repositoryScopeKey: source.repositoryScopeKey,
        sha: source.manifest.bundle.gitCommit,
      },
    );
  }

  await copyRows(
    connection,
    databasePath,
    "ConceptRecord",
    (function* (): Generator<readonly CsvValue[]> {
      for (const record of source.concepts) {
        const doc = lexical.docs.get(record.id);
        if (doc === undefined) corrupt(`lexical document is missing for ${record.id}`);
        yield [
          record.key,
          common.repositoryScopeKey,
          common.snapshotKey,
          common.bundleId,
          common.gitCommit,
          common.exportDigest,
          record.id,
          record.path,
          record.type,
          JSON.stringify(record.frontmatter),
          frontmatterScalar(record.frontmatter.title) ?? null,
          frontmatterScalar(record.frontmatter.summary) ?? null,
          frontmatterScalar(record.frontmatter.description) ?? null,
          canonicalJson(record.frontmatter.tags ?? null),
          record.body,
          record.contentHash,
          record.tokenEstimate,
          doc.length,
        ];
      }
    })(),
  );
  Bun.gc(true);
  await executeQuery(connection, "CHECKPOINT");
  await copyRows(
    connection,
    databasePath,
    "TaskRecord",
    source.tasks.map((record) => [
      record.key,
      common.repositoryScopeKey,
      common.snapshotKey,
      common.bundleId,
      common.gitCommit,
      common.exportDigest,
      record.id,
      record.title,
      record.status,
      canonicalJson(record.labels),
      record.priority,
      record.ordinal,
      canonicalJson(record.assignees),
      record.milestone,
      record.parentTaskId,
      record.sourceAdapterVersion,
      JSON.stringify(record),
    ]),
  );
  await copyRows(
    connection,
    databasePath,
    "AuthoredEdgeRecord",
    source.authoredEdges.map((record) => [
      record.key,
      common.repositoryScopeKey,
      common.snapshotKey,
      common.bundleId,
      common.gitCommit,
      common.exportDigest,
      record.from,
      record.to,
      record.kind,
      record.target,
      record.ordinal,
      record.dangling,
      JSON.stringify(record),
    ]),
  );
  await executeQuery(connection, "CHECKPOINT");

  const terms = [...lexical.df.entries()].sort(([a], [b]) => compare(a, b));
  await copyRows(
    connection,
    databasePath,
    "LexicalTerm",
    terms.map(([termKey, documentFrequency]) => [termKey, documentFrequency]),
  );

  await createRelationship(
    connection,
    "RepositoryProjection",
    "repositoryScopeKey",
    source.repositoryScopeKey,
    "HAS_SNAPSHOT",
    "ProjectionSnapshot",
    "snapshotKey",
    source.snapshotKey,
  );
  if (source.commitKey !== null) {
    await createRelationship(
      connection,
      "ProjectionSnapshot",
      "snapshotKey",
      source.snapshotKey,
      "AT_COMMIT",
      "SourceCommit",
      "commitKey",
      source.commitKey,
    );
  }
  await copyRows(
    connection,
    databasePath,
    "HAS_CONCEPT",
    source.concepts.map((record) => [source.snapshotKey, record.key]),
  );
  await copyRows(
    connection,
    databasePath,
    "HAS_TASK",
    source.tasks.map((record) => [source.snapshotKey, record.key]),
  );
  await copyRows(
    connection,
    databasePath,
    "HAS_EDGE",
    source.authoredEdges.map((record) => [source.snapshotKey, record.key]),
  );
  await copyRows(
    connection,
    databasePath,
    "EDGE_SOURCE",
    source.authoredEdges
      .filter((record) => edgeSourceKind(record) === "concept")
      .map((record) => [record.from, record.key]),
  );
  await copyRows(
    connection,
    databasePath,
    "EDGE_TASK_SOURCE",
    source.authoredEdges
      .filter((record) => edgeSourceKind(record) === "task")
      .map((record) => [record.from, record.key]),
  );
  await copyRows(
    connection,
    databasePath,
    "EDGE_CONCEPT_TARGET",
    source.authoredEdges
      .filter((record) => edgeTargetKind(record) === "concept" && !record.dangling && record.to !== null)
      .map((record) => [record.key, record.to]),
  );
  await copyRows(
    connection,
    databasePath,
    "EDGE_TASK_TARGET",
    source.authoredEdges
      .filter((record) => edgeTargetKind(record) === "task" && !record.dangling && record.to !== null)
      .map((record) => [record.key, record.to]),
  );
  const recordKeys = new Map(source.concepts.map((record) => [record.id, record.key]));
  await copyRows(
    connection,
    databasePath,
    "HAS_TERM",
    (function* (): Generator<readonly CsvValue[]> {
      for (const [id, doc] of lexical.docs) {
        const recordKey = recordKeys.get(id);
        if (recordKey === undefined) corrupt(`lexical record key is missing for ${id}`);
        for (const [termKey, frequency] of doc.tf) yield [recordKey, termKey, frequency];
      }
    })(),
  );
  await executeQuery(connection, "CHECKPOINT");
}

type CsvValue = string | number | boolean | null;

function buildProjectionLexicalIndex(source: LadybugProjectionSource): Bm25Index {
  const docsPrefix = `${source.manifest.bundle.docsRoot}/`;
  const concepts = new Map<string, Concept>();
  for (const record of source.concepts) {
    if (!record.path.startsWith(docsPrefix)) corrupt("projection concept path is outside the bundle root");
    concepts.set(record.id, {
      id: record.id,
      path: record.path.slice(docsPrefix.length),
      type: record.type,
      frontmatter: record.frontmatter,
      body: record.body,
    });
  }
  const docs = new Map<string, { tf: ReadonlyMap<string, number>; length: number }>();
  const df = new Map<string, number>();
  let totalLength = 0;
  for (const concept of concepts.values()) {
    const tf = new Map<string, number>();
    let length = 0;
    for (const field of searchableConceptFields(concept)) {
      for (const match of field.matchAll(/[\p{L}\p{N}]+/gu)) {
        const termKey = lexicalTermKey((match[0] as string).toLowerCase());
        tf.set(termKey, (tf.get(termKey) ?? 0) + 1);
        length++;
      }
    }
    for (const termKey of tf.keys()) df.set(termKey, (df.get(termKey) ?? 0) + 1);
    docs.set(concept.id, { tf, length });
    totalLength += length;
  }
  const n = docs.size;
  return { docs, df, n, avgdl: n === 0 ? 0 : totalLength / n };
}

function lexicalTermKey(term: string): string {
  return createHash("sha256").update(term).digest("hex");
}

async function copyRows(
  connection: Connection,
  databasePath: string,
  table: string,
  rows: Iterable<readonly CsvValue[]>,
): Promise<void> {
  const maxBatchBytes = 16 * 1024 * 1024;
  const iterator = rows[Symbol.iterator]();
  let current = iterator.next();
  while (!current.done) {
    const path = join(dirname(databasePath), `.lore-import-${table}-${randomUUID()}.csv`);
    const file = openSync(path, "wx", 0o600);
    let batchBytes = 0;
    try {
      while (!current.done) {
        const line = `${current.value.map(csvValue).join(",")}\n`;
        const lineBytes = Buffer.byteLength(line);
        if (batchBytes > 0 && batchBytes + lineBytes > maxBatchBytes) break;
        writeSync(file, line);
        batchBytes += lineBytes;
        current = iterator.next();
      }
    } finally {
      closeSync(file);
    }
    try {
      await executeQuery(
        connection,
        `COPY ${table} FROM ${JSON.stringify(path)} (header=false, auto_detect=false, parallel=false, delim=",", quote="\\"", escape="\\"")`,
      );
    } finally {
      try {
        unlinkSync(path);
      } catch {
        // The generation staging directory remains disposable if cleanup races a failure.
      }
    }
  }
}

function csvValue(value: CsvValue): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `"${value.replace(/"/g, '""')}"`;
}

function snapshotMetadata(source: LadybugProjectionSource, lexical?: Bm25Index): Record<string, LbugValue> {
  return {
    snapshotKey: source.snapshotKey,
    indexFormatVersion: LADYBUG_INDEX_FORMAT,
    projectionSchemaVersion: source.manifest.schemaVersion,
    normalizationVersion: source.manifest.normalizationVersion,
    exporterName: source.manifest.exporter.name,
    exporterVersion: source.manifest.exporter.version,
    loreVersion: source.manifest.exporter.version,
    ladybugVersion: source.ladybugVersion,
    ladybugStorageVersion: source.ladybugStorageVersion,
    repositoryScopeKey: source.repositoryScopeKey,
    bundleId: source.manifest.bundle.id,
    okfVersion: source.manifest.bundle.okfVersion,
    docsRoot: source.manifest.bundle.docsRoot,
    gitCommit: source.manifest.bundle.gitCommit,
    exportDigest: source.exportDigest,
    taskSnapshotDigest: source.taskSnapshotDigest,
    sourceFingerprint: source.sourceFingerprint,
    sourceRecordsDigest: source.sourceRecordsDigest,
    recordKeysDigest: source.recordKeysDigest,
    ...(lexical === undefined
      ? {}
      : {
          lexicalDocumentCount: lexical.n,
          lexicalTotalLength: [...lexical.docs.values()].reduce((sum, doc) => sum + doc.length, 0),
        }),
    recordCount: source.trailer.recordCount,
    conceptCount: source.counts.concepts,
    taskCount: source.counts.tasks,
    authoredEdgeCount: source.counts.authoredEdges,
    manifestJson: JSON.stringify(source.manifest),
    trailerJson: JSON.stringify(source.trailer),
  };
}

async function verifyConceptRecordTable(connection: Connection, source: LadybugProjectionSource): Promise<void> {
  const expectedRecords = source.concepts;
  const lexicalLengths = VERIFIED_LEXICAL_LENGTHS.get(source);
  const expected = new Map(expectedRecords.map((record) => [record.key, record]));
  let count = 0;
  await queryEachRow(
    connection,
    `MATCH (n:ConceptRecord)
     RETURN n.recordKey AS recordKey, n.conceptId AS conceptId, n.path AS path,
            n.conceptType AS conceptType, n.frontmatterJson AS frontmatterJson,
            n.title AS title, n.summary AS summary, n.description AS description,
            n.tagsJson AS tagsJson, n.contentHash AS contentHash,
            n.tokenEstimate AS tokenEstimate, n.lexicalLength AS lexicalLength`,
    (row) => {
      count++;
      const key = requiredString(row.recordKey, "concept record key");
      const record = expected.get(key);
      if (
        record === undefined ||
        row.conceptId !== record.id ||
        row.path !== record.path ||
        row.conceptType !== record.type ||
        row.frontmatterJson !== JSON.stringify(record.frontmatter) ||
        row.title !== (frontmatterScalar(record.frontmatter.title) ?? null) ||
        row.summary !== (frontmatterScalar(record.frontmatter.summary) ?? null) ||
        row.description !== (frontmatterScalar(record.frontmatter.description) ?? null) ||
        row.tagsJson !== canonicalJson(record.frontmatter.tags ?? null) ||
        row.contentHash !== record.contentHash ||
        numericValue(row.tokenEstimate) !== record.tokenEstimate ||
        numericValue(row.lexicalLength) !== expectedLexicalLength(record, lexicalLengths)
      ) {
        corrupt("ConceptRecord source record differs");
      }
      expected.delete(key);
    },
  );
  if (count !== expectedRecords.length || expected.size !== 0) corrupt("ConceptRecord count differs");

  const expectedBodyDigests = new Map(
    expectedRecords.map((record) => [
      record.key,
      record.body === "" ? null : createHash("sha256").update(record.body).digest("hex"),
    ]),
  );
  await queryEachRow(
    connection,
    "MATCH (n:ConceptRecord) RETURN n.recordKey AS recordKey, sha256(n.body) AS bodyDigest",
    (row) => {
      const key = requiredString(row.recordKey, "concept body record key");
      if (!expectedBodyDigests.has(key) || row.bodyDigest !== expectedBodyDigests.get(key)) {
        corrupt("ConceptRecord body differs");
      }
      expectedBodyDigests.delete(key);
    },
  );
  if (expectedBodyDigests.size !== 0) corrupt("ConceptRecord bodies are missing");
}

function expectedLexicalLength(
  record: ProjectionConceptRecord,
  cached: ReadonlyMap<string, number> | undefined,
): number {
  const length = cached?.get(record.id);
  if (length !== undefined) return length;
  return searchableConceptFields({
    id: record.id,
    path: record.path,
    type: record.type,
    frontmatter: record.frontmatter,
    body: record.body,
  }).reduce((total, field) => total + tokenizeQueryText(field).length, 0);
}

async function verifyRecordTable(
  connection: Connection,
  table: "ConceptRecord" | "TaskRecord" | "AuthoredEdgeRecord",
  expectedRecords: readonly { readonly key: string; readonly record: string }[],
): Promise<void> {
  const rows = await queryRows(
    connection,
    `MATCH (n:${table}) RETURN n.recordKey AS key, n.sourceRecordJson AS sourceRecordJson ORDER BY n.recordKey`,
  );
  const expected = new Map(expectedRecords.map((record) => [record.key, JSON.stringify(record)]));
  if (rows.length !== expected.size) corrupt(`${table} count differs`);
  for (const row of rows) {
    const key = row.key;
    const sourceRecordJson = row.sourceRecordJson;
    if (typeof key !== "string" || typeof sourceRecordJson !== "string" || expected.get(key) !== sourceRecordJson) {
      corrupt(`${table} source record differs`);
    }
    expected.delete(key);
  }
  if (expected.size !== 0) corrupt(`${table} is missing source records`);
}

async function verifyPromotedSamples(connection: Connection, source: LadybugProjectionSource): Promise<void> {
  const concept = [...source.concepts].sort((a, b) => compare(a.key, b.key))[0];
  await expectSample(
    connection,
    `MATCH (n:ConceptRecord {recordKey: $recordKey})
     RETURN n.recordKey AS recordKey,
            n.repositoryScopeKey AS repositoryScopeKey,
            n.snapshotKey AS snapshotKey,
            n.bundleId AS bundleId,
            n.gitCommit AS gitCommit,
            n.exportDigest AS exportDigest,
            n.conceptId AS conceptId,
            n.path AS path,
            n.conceptType AS conceptType,
            n.frontmatterJson AS frontmatterJson,
            n.body AS body,
            n.contentHash AS contentHash,
            n.tokenEstimate AS tokenEstimate`,
    concept === undefined
      ? undefined
      : {
          ...commonExpected(source),
          recordKey: concept.key,
          conceptId: concept.id,
          path: concept.path,
          conceptType: concept.type,
          frontmatterJson: JSON.stringify(concept.frontmatter),
          body: concept.body === "" ? null : concept.body,
          contentHash: concept.contentHash,
          tokenEstimate: concept.tokenEstimate,
        },
    "ConceptRecord",
    { recordKey: concept?.key ?? "" },
  );

  const task = [...source.tasks].sort((a, b) => compare(a.key, b.key))[0];
  await expectSample(
    connection,
    `MATCH (n:TaskRecord {recordKey: $recordKey})
     RETURN n.recordKey AS recordKey,
            n.repositoryScopeKey AS repositoryScopeKey,
            n.snapshotKey AS snapshotKey,
            n.bundleId AS bundleId,
            n.gitCommit AS gitCommit,
            n.exportDigest AS exportDigest,
            n.taskId AS taskId,
            n.title AS title,
            n.status AS status,
            n.labelsJson AS labelsJson,
            n.priority AS priority,
            n.ordinal AS ordinal,
            n.assigneesJson AS assigneesJson,
            n.milestone AS milestone,
            n.parentTaskId AS parentTaskId,
            n.sourceAdapterVersion AS sourceAdapterVersion`,
    task === undefined
      ? undefined
      : {
          ...commonExpected(source),
          recordKey: task.key,
          taskId: task.id,
          title: task.title,
          status: task.status,
          labelsJson: canonicalJson(task.labels),
          priority: task.priority,
          ordinal: task.ordinal,
          assigneesJson: canonicalJson(task.assignees),
          milestone: task.milestone,
          parentTaskId: task.parentTaskId,
          sourceAdapterVersion: task.sourceAdapterVersion,
        },
    "TaskRecord",
    { recordKey: task?.key ?? "" },
  );

  const edge = [...source.authoredEdges].sort((a, b) => compare(a.key, b.key))[0];
  await expectSample(
    connection,
    `MATCH (n:AuthoredEdgeRecord {recordKey: $recordKey})
     RETURN n.recordKey AS recordKey,
            n.repositoryScopeKey AS repositoryScopeKey,
            n.snapshotKey AS snapshotKey,
            n.bundleId AS bundleId,
            n.gitCommit AS gitCommit,
            n.exportDigest AS exportDigest,
            n.fromRecordKey AS fromRecordKey,
            n.toRecordKey AS toRecordKey,
            n.kind AS kind,
            n.target AS target,
            n.ordinal AS ordinal,
            n.dangling AS dangling`,
    edge === undefined
      ? undefined
      : {
          ...commonExpected(source),
          recordKey: edge.key,
          fromRecordKey: edge.from,
          toRecordKey: edge.to,
          kind: edge.kind,
          target: edge.target,
          ordinal: edge.ordinal,
          dangling: edge.dangling,
        },
    "AuthoredEdgeRecord",
    { recordKey: edge?.key ?? "" },
  );
}

function commonExpected(source: LadybugProjectionSource): Record<string, LbugValue> {
  return {
    repositoryScopeKey: source.repositoryScopeKey,
    snapshotKey: source.snapshotKey,
    bundleId: source.manifest.bundle.id,
    gitCommit: source.manifest.bundle.gitCommit,
    exportDigest: source.exportDigest,
  };
}

async function expectSample(
  connection: Connection,
  query: string,
  expected: Record<string, LbugValue> | undefined,
  label: string,
  params: Record<string, LbugValue>,
): Promise<void> {
  const rows = await queryRows(connection, query, params);
  if (expected === undefined) {
    if (rows.length !== 0) corrupt(`${label} conformance sample should be empty`);
    return;
  }
  if (rows.length !== 1) corrupt(`${label} conformance sample is missing or duplicated`);
  const actual = rows[0] as Record<string, unknown>;
  for (const [key, value] of Object.entries(expected)) {
    if (!sameDatabaseValue(actual[key], value)) corrupt(`${label} conformance sample differs for ${key}`);
  }
}

async function expectRelationshipPairs(
  connection: Connection,
  query: string,
  expected: readonly (readonly [string, string])[],
  label: string,
): Promise<void> {
  const rows = await queryRows(connection, query);
  const actualPairs = rows.map((row) => {
    if (typeof row.fromKey !== "string" || typeof row.toKey !== "string") {
      corrupt(`${label} contains an invalid endpoint`);
    }
    return `${row.fromKey}\0${row.toKey}`;
  });
  const expectedPairs = expected.map(([from, to]) => `${from}\0${to}`);
  actualPairs.sort(compare);
  expectedPairs.sort(compare);
  if (actualPairs.length !== expectedPairs.length || actualPairs.some((pair, index) => pair !== expectedPairs[index])) {
    corrupt(`${label} endpoints differ`);
  }
}

async function createRelationship(
  connection: Connection,
  fromTable: string,
  fromProperty: string,
  fromValue: string,
  relationship: string,
  toTable: string,
  toProperty: string,
  toValue: string,
): Promise<void> {
  await executePrepared(
    connection,
    `MATCH (a:${fromTable} {${fromProperty}: $from}), (b:${toTable} {${toProperty}: $to})
     CREATE (a)-[:${relationship}]->(b)`,
    { from: fromValue, to: toValue },
  );
}

async function expectCount(connection: Connection, query: string, expected: number, label: string): Promise<void> {
  const rows = await queryRows(connection, query);
  if (rows.length !== 1 || numericValue(rows[0]?.count) !== expected) {
    corrupt(`${label} count differs`);
  }
}

async function executePrepared(
  connection: Connection,
  query: string,
  params: Record<string, LbugValue>,
): Promise<void> {
  const statement = await prepare(connection, query);
  await executeStatement(connection, statement, params);
}

async function prepare(connection: Connection, query: string) {
  const statement = await connection.prepare(query);
  if (!statement.isSuccess()) throw new Error(statement.getErrorMessage());
  return statement;
}

function prepareSync(connection: Connection, query: string): ReturnType<Connection["prepareSync"]> {
  const statement = connection.prepareSync(query);
  if (!statement.isSuccess()) throw new Error(statement.getErrorMessage());
  return statement;
}

async function executeStatement(
  connection: Connection,
  statement: Awaited<ReturnType<Connection["prepare"]>>,
  params: Record<string, LbugValue>,
): Promise<void> {
  const result = await connection.execute(statement, params);
  closeResult(result);
}

async function executeQuery(connection: Connection, query: string): Promise<void> {
  const result = await connection.query(query);
  closeResult(result);
}

async function queryRows(
  connection: Connection,
  query: string,
  params?: Record<string, LbugValue>,
): Promise<Record<string, LbugValue>[]> {
  const result =
    params === undefined
      ? await connection.query(query)
      : await connection.execute(await prepare(connection, query), params);
  return resultRows(result);
}

async function queryPreparedRows(
  connection: Connection,
  statement: Awaited<ReturnType<Connection["prepare"]>>,
  params: Record<string, LbugValue>,
): Promise<Record<string, LbugValue>[]> {
  return resultRows(await connection.execute(statement, params));
}

async function resultRows(result: QueryResult | QueryResult[]): Promise<Record<string, LbugValue>[]> {
  if (Array.isArray(result)) {
    closeResult(result);
    throw new Error("Ladybug returned multiple result sets for a single query");
  }
  try {
    return await result.getAll();
  } finally {
    result.close();
  }
}

async function queryEachRow(
  connection: Connection,
  query: string,
  visit: (row: Record<string, LbugValue>) => void,
): Promise<void> {
  const result = await connection.query(query);
  if (Array.isArray(result)) {
    closeResult(result);
    throw new Error("Ladybug returned multiple result sets for a single query");
  }
  try {
    while (result.hasNext()) {
      const row = await result.getNext();
      if (row !== null) visit(row);
    }
  } finally {
    result.close();
  }
}

function closeResult(result: QueryResult | QueryResult[]): void {
  if (Array.isArray(result)) {
    for (const item of result) item.close();
  } else {
    result.close();
  }
}

async function closeConnection(connection: Connection): Promise<void> {
  try {
    await connection.close();
  } catch {
    // Database.close remains the final native resource boundary.
  }
}

function numericValue(value: unknown): number | null {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : null;
}

function sameDatabaseValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "bigint" && typeof expected === "number") return actual === BigInt(expected);
  return actual === expected;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function conceptRecordFromPromotedRow(row: Record<string, LbugValue>): ProjectionConceptRecord {
  return {
    record: "concept",
    key: requiredString(row.recordKey, "concept record key"),
    id: requiredString(row.conceptId, "concept id"),
    path: requiredString(row.path, "concept path"),
    type: requiredString(row.conceptType, "concept type"),
    frontmatter: parseObjectJson(row.frontmatterJson, "concept frontmatter"),
    body: row.body === null ? "" : requiredString(row.body, "concept body"),
    contentHash: requiredString(row.contentHash, "concept content hash"),
    tokenEstimate: requiredNumber(row.tokenEstimate, "concept token estimate"),
  };
}

function parseEdgeSourceRecord(value: unknown): ProjectionEdgeRecord {
  const record = parseSourceRecord(value);
  if (
    record.record !== "edge" ||
    typeof record.key !== "string" ||
    typeof record.from !== "string" ||
    (record.to !== null && typeof record.to !== "string") ||
    typeof record.kind !== "string" ||
    typeof record.target !== "string" ||
    typeof record.ordinal !== "number" ||
    !Number.isSafeInteger(record.ordinal) ||
    record.ordinal < 0 ||
    typeof record.dangling !== "boolean"
  ) {
    corrupt("indexed authored-edge source record is invalid");
  }
  return record as ProjectionEdgeRecord;
}

function parseSourceRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") corrupt("indexed source record JSON is missing");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    corrupt("indexed source record JSON is malformed");
  }
  if (!isObject(parsed)) corrupt("indexed source record JSON is not an object");
  return parsed;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEdgeKind(value: string): value is EdgeKind {
  return (
    value === "link" || value === "sources" || value === "specs" || value === "supersedes" || value === "superseded_by"
  );
}

function edgeSourceKind(record: ProjectionEdgeRecord): "concept" | "task" {
  return record.workspaceFromKind ?? "concept";
}

function edgeTargetKind(record: ProjectionEdgeRecord): "concept" | "task" {
  return record.workspaceToKind ?? (record.kind === "task" ? "task" : "concept");
}

function corrupt(message: string): never {
  throw new LoreError(
    "validation",
    `Ladybug projection verification failed: ${message}`,
    "quarantine and rebuild the disposable local projection under exclusive writer ownership",
  );
}
