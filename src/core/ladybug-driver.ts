/**
 * Private @ladybugdb/core boundary for ladybug-projection/1.
 *
 * Physical tables and Cypher remain internal implementation details. Callers
 * provide validated export-source records and receive only Lore identities and
 * structural verification facts.
 */

import ladybug, { Connection, Database, type LbugValue, type QueryResult } from "@ladybugdb/core";
import { LoreError } from "../errors";
import {
  canonicalJson,
  LADYBUG_INDEX_FORMAT,
  type LadybugProjectionSource,
  type ProjectionEdgeRecord,
} from "./ladybug-source";

export const LADYBUG_VERSION = String(ladybug.VERSION);
export const LADYBUG_STORAGE_VERSION = String(ladybug.STORAGE_VERSION);

export interface LadybugDatabaseVerification {
  readonly repositoryScopeKey: string;
  readonly snapshotKey: string;
  readonly sourceFingerprint: string;
  readonly exportDigest: string;
  readonly taskSnapshotDigest: string;
  readonly sourceRecordsDigest: string;
  readonly recordKeysDigest: string;
  readonly recordCount: number;
  readonly conceptCount: number;
  readonly taskCount: number;
  readonly authoredEdgeCount: number;
}

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
    body STRING,
    contentHash STRING,
    tokenEstimate INT64,
    sourceRecordJson STRING,
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
  "CREATE REL TABLE HAS_SNAPSHOT(FROM RepositoryProjection TO ProjectionSnapshot)",
  "CREATE REL TABLE AT_COMMIT(FROM ProjectionSnapshot TO SourceCommit)",
  "CREATE REL TABLE HAS_CONCEPT(FROM ProjectionSnapshot TO ConceptRecord)",
  "CREATE REL TABLE HAS_TASK(FROM ProjectionSnapshot TO TaskRecord)",
  "CREATE REL TABLE HAS_EDGE(FROM ProjectionSnapshot TO AuthoredEdgeRecord)",
  "CREATE REL TABLE EDGE_SOURCE(FROM ConceptRecord TO AuthoredEdgeRecord)",
  "CREATE REL TABLE EDGE_CONCEPT_TARGET(FROM AuthoredEdgeRecord TO ConceptRecord)",
  "CREATE REL TABLE EDGE_TASK_TARGET(FROM AuthoredEdgeRecord TO TaskRecord)",
] as const;

/** Create and populate a new isolated database. The path must not be published. */
export async function buildLadybugDatabase(databasePath: string, source: LadybugProjectionSource): Promise<void> {
  const database = writableDatabase(databasePath);
  const connection = new Connection(database);
  try {
    for (const query of SCHEMA_QUERIES) await executeQuery(connection, query);
    await executeQuery(connection, "BEGIN TRANSACTION");
    try {
      await insertProjection(connection, source);
      await executeQuery(connection, "COMMIT");
    } catch (cause) {
      try {
        await executeQuery(connection, "ROLLBACK");
      } catch {
        // Preserve the original write failure. Closing the isolated staging
        // database is the remaining rollback boundary.
      }
      throw cause;
    }
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

    await verifyRecordTable(connection, "ConceptRecord", source.concepts);
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
    await expectCount(
      connection,
      "MATCH ()-[r:EDGE_SOURCE]->() RETURN count(r) AS count",
      source.counts.authoredEdges,
      "EDGE_SOURCE",
    );
    const conceptTargets = source.authoredEdges.filter((edge) => edge.kind !== "task" && !edge.dangling).length;
    const taskTargets = source.authoredEdges.filter((edge) => edge.kind === "task" && !edge.dangling).length;
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
      source.authoredEdges.map((record) => [record.from, record.key]),
      "EDGE_SOURCE",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:AuthoredEdgeRecord)-[:EDGE_CONCEPT_TARGET]->(b:ConceptRecord)
       RETURN a.recordKey AS fromKey, b.recordKey AS toKey`,
      source.authoredEdges
        .filter((record) => record.kind !== "task" && !record.dangling && record.to !== null)
        .map((record) => [record.key, record.to as string]),
      "EDGE_CONCEPT_TARGET",
    );
    await expectRelationshipPairs(
      connection,
      `MATCH (a:AuthoredEdgeRecord)-[:EDGE_TASK_TARGET]->(b:TaskRecord)
       RETURN a.recordKey AS fromKey, b.recordKey AS toKey`,
      source.authoredEdges
        .filter((record) => record.kind === "task" && !record.dangling && record.to !== null)
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

/** Read canonical source records for deterministic tests and later bounded readers. */
export async function readLadybugSourceRecords(databasePath: string): Promise<ReadonlyMap<string, string>> {
  const database = readOnlyDatabase(databasePath);
  const connection = new Connection(database);
  try {
    const result = new Map<string, string>();
    for (const table of ["ConceptRecord", "TaskRecord", "AuthoredEdgeRecord"] as const) {
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

function writableDatabase(path: string): Database {
  return new Database(path, 0, true, false, 0, false, -1, true, true, true);
}

function readOnlyDatabase(path: string): Database {
  return new Database(path, 0, true, true, 0, true, -1, true, true, true);
}

async function insertProjection(connection: Connection, source: LadybugProjectionSource): Promise<void> {
  const common = {
    repositoryScopeKey: source.repositoryScopeKey,
    snapshotKey: source.snapshotKey,
    bundleId: source.manifest.bundle.id,
    gitCommit: source.manifest.bundle.gitCommit,
    exportDigest: source.exportDigest,
  };
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
      recordCount: $recordCount,
      conceptCount: $conceptCount,
      taskCount: $taskCount,
      authoredEdgeCount: $authoredEdgeCount,
      manifestJson: $manifestJson,
      trailerJson: $trailerJson
    })`,
    snapshotMetadata(source),
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

  const conceptStatement = await prepare(
    connection,
    `CREATE (n:ConceptRecord {
      recordKey: $recordKey,
      repositoryScopeKey: $repositoryScopeKey,
      snapshotKey: $snapshotKey,
      bundleId: $bundleId,
      gitCommit: $gitCommit,
      exportDigest: $exportDigest,
      conceptId: $conceptId,
      path: $path,
      conceptType: $conceptType,
      frontmatterJson: $frontmatterJson,
      body: $body,
      contentHash: $contentHash,
      tokenEstimate: $tokenEstimate,
      sourceRecordJson: $sourceRecordJson
    })`,
  );
  for (const record of source.concepts) {
    await executeStatement(connection, conceptStatement, {
      ...common,
      recordKey: record.key,
      conceptId: record.id,
      path: record.path,
      conceptType: record.type,
      frontmatterJson: canonicalJson(record.frontmatter),
      body: record.body,
      contentHash: record.contentHash,
      tokenEstimate: record.tokenEstimate,
      sourceRecordJson: JSON.stringify(record),
    });
  }

  const taskStatement = await prepare(
    connection,
    `CREATE (n:TaskRecord {
      recordKey: $recordKey,
      repositoryScopeKey: $repositoryScopeKey,
      snapshotKey: $snapshotKey,
      bundleId: $bundleId,
      gitCommit: $gitCommit,
      exportDigest: $exportDigest,
      taskId: $taskId,
      title: $title,
      status: $status,
      labelsJson: $labelsJson,
      priority: $priority,
      ordinal: $ordinal,
      assigneesJson: $assigneesJson,
      milestone: $milestone,
      parentTaskId: $parentTaskId,
      sourceAdapterVersion: $sourceAdapterVersion,
      sourceRecordJson: $sourceRecordJson
    })`,
  );
  for (const record of source.tasks) {
    await executeStatement(connection, taskStatement, {
      ...common,
      recordKey: record.key,
      taskId: record.id,
      title: record.title,
      status: record.status,
      labelsJson: canonicalJson(record.labels),
      priority: record.priority,
      ordinal: record.ordinal,
      assigneesJson: canonicalJson(record.assignees),
      milestone: record.milestone,
      parentTaskId: record.parentTaskId,
      sourceAdapterVersion: record.sourceAdapterVersion,
      sourceRecordJson: JSON.stringify(record),
    });
  }

  const edgeStatement = await prepare(
    connection,
    `CREATE (n:AuthoredEdgeRecord {
      recordKey: $recordKey,
      repositoryScopeKey: $repositoryScopeKey,
      snapshotKey: $snapshotKey,
      bundleId: $bundleId,
      gitCommit: $gitCommit,
      exportDigest: $exportDigest,
      fromRecordKey: $fromRecordKey,
      toRecordKey: $toRecordKey,
      kind: $kind,
      target: $target,
      ordinal: $ordinal,
      dangling: $dangling,
      sourceRecordJson: $sourceRecordJson
    })`,
  );
  for (const record of source.authoredEdges) {
    await executeStatement(connection, edgeStatement, {
      ...common,
      recordKey: record.key,
      fromRecordKey: record.from,
      toRecordKey: record.to,
      kind: record.kind,
      target: record.target,
      ordinal: record.ordinal,
      dangling: record.dangling,
      sourceRecordJson: JSON.stringify(record),
    });
  }

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
  for (const record of source.concepts) {
    await createRelationship(
      connection,
      "ProjectionSnapshot",
      "snapshotKey",
      source.snapshotKey,
      "HAS_CONCEPT",
      "ConceptRecord",
      "recordKey",
      record.key,
    );
  }
  for (const record of source.tasks) {
    await createRelationship(
      connection,
      "ProjectionSnapshot",
      "snapshotKey",
      source.snapshotKey,
      "HAS_TASK",
      "TaskRecord",
      "recordKey",
      record.key,
    );
  }
  for (const edge of source.authoredEdges) {
    await createRelationship(
      connection,
      "ProjectionSnapshot",
      "snapshotKey",
      source.snapshotKey,
      "HAS_EDGE",
      "AuthoredEdgeRecord",
      "recordKey",
      edge.key,
    );
    await createRelationship(
      connection,
      "ConceptRecord",
      "recordKey",
      edge.from,
      "EDGE_SOURCE",
      "AuthoredEdgeRecord",
      "recordKey",
      edge.key,
    );
    if (!edge.dangling && edge.to !== null) await createTargetRelationship(connection, edge);
  }
}

function snapshotMetadata(source: LadybugProjectionSource): Record<string, LbugValue> {
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
    recordCount: source.trailer.recordCount,
    conceptCount: source.counts.concepts,
    taskCount: source.counts.tasks,
    authoredEdgeCount: source.counts.authoredEdges,
    manifestJson: JSON.stringify(source.manifest),
    trailerJson: JSON.stringify(source.trailer),
  };
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
    `MATCH (n:ConceptRecord)
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
            n.tokenEstimate AS tokenEstimate
     ORDER BY n.recordKey LIMIT 1`,
    concept === undefined
      ? undefined
      : {
          ...commonExpected(source),
          recordKey: concept.key,
          conceptId: concept.id,
          path: concept.path,
          conceptType: concept.type,
          frontmatterJson: canonicalJson(concept.frontmatter),
          body: concept.body,
          contentHash: concept.contentHash,
          tokenEstimate: concept.tokenEstimate,
        },
    "ConceptRecord",
  );

  const task = [...source.tasks].sort((a, b) => compare(a.key, b.key))[0];
  await expectSample(
    connection,
    `MATCH (n:TaskRecord)
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
            n.sourceAdapterVersion AS sourceAdapterVersion
     ORDER BY n.recordKey LIMIT 1`,
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
  );

  const edge = [...source.authoredEdges].sort((a, b) => compare(a.key, b.key))[0];
  await expectSample(
    connection,
    `MATCH (n:AuthoredEdgeRecord)
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
            n.dangling AS dangling
     ORDER BY n.recordKey LIMIT 1`,
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
): Promise<void> {
  const rows = await queryRows(connection, query);
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

async function createTargetRelationship(connection: Connection, edge: ProjectionEdgeRecord): Promise<void> {
  if (edge.to === null) return;
  if (edge.kind === "task") {
    await createRelationship(
      connection,
      "AuthoredEdgeRecord",
      "recordKey",
      edge.key,
      "EDGE_TASK_TARGET",
      "TaskRecord",
      "recordKey",
      edge.to,
    );
  } else {
    await createRelationship(
      connection,
      "AuthoredEdgeRecord",
      "recordKey",
      edge.key,
      "EDGE_CONCEPT_TARGET",
      "ConceptRecord",
      "recordKey",
      edge.to,
    );
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

function corrupt(message: string): never {
  throw new LoreError(
    "validation",
    `Ladybug projection verification failed: ${message}`,
    "quarantine and rebuild the disposable local projection under exclusive writer ownership",
  );
}
