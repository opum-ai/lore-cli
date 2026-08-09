/**
 * Deterministic repository generator for the versioned Ladybug qualification fixtures.
 *
 * The committed JSON files describe scale and scenarios; generated repositories are
 * always disposable. Keeping the large Markdown payload out of Git makes the fixture
 * reviewable while the pinned semantic digests still detect generator drift.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import { z } from "zod";
import type { BacklogAdapter, BacklogTask, ListTasksOptions } from "../../src/adapters/backlog";
import { loadBundle } from "../../src/core/bundle";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../../src/core/ladybug-native";
import {
  canonicalJson,
  digest,
  type LadybugProjectionSource,
  prepareLadybugProjectionSource,
  readProfileInventory,
  readSourceInventory,
} from "../../src/core/ladybug-source";
import { buildProjection } from "../../src/core/projection";
import { VERSION } from "../../src/meta";
import { LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH, LADYBUG_BENCHMARK_TASK_SNAPSHOT_SCHEMA } from "./fixture-contract";

export {
  LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH,
  LADYBUG_BENCHMARK_TASK_SNAPSHOT_SCHEMA,
} from "./fixture-contract";

export const LADYBUG_BENCHMARK_FIXTURE_SCHEMA = "ladybug-benchmark-fixture/1";
export const LADYBUG_BENCHMARK_FIXTURE_EXPORTER_VERSION = VERSION;
export const LADYBUG_BENCHMARK_FIXTURE_COMMIT = null;
export const LADYBUG_BENCHMARK_FIXTURE_BODY_BYTES_PER_CONCEPT = 16 * 1024;

export type QueryClass = "common" | "rare" | "tied" | "no-hit" | "unicode";

export interface BenchmarkQuerySpec {
  readonly id: string;
  readonly text: string;
  readonly class: QueryClass;
  readonly expectedMatches: number;
  readonly expectTopTie?: boolean;
}

export interface LadybugBenchmarkFixtureSpec {
  readonly schema: typeof LADYBUG_BENCHMARK_FIXTURE_SCHEMA;
  readonly name: "small" | "large";
  readonly seed: number;
  readonly counts: {
    readonly concepts: number;
    readonly tasks: number;
    readonly authoredEdges: number;
    readonly markdownBodyBytes: number;
  };
  readonly coverage: {
    readonly graphShapes: readonly ["chain", "star", "cycle", "duplicate", "dangling"];
    readonly graphDepths: readonly number[];
    readonly contextBudgets: readonly number[];
    readonly queries: readonly BenchmarkQuerySpec[];
    readonly unicode: readonly string[];
    readonly additiveFields: readonly string[];
  };
  readonly expected: {
    readonly canonicalExportSha256: string;
    readonly sourceInventorySha256: string;
    readonly taskSnapshotSha256: string;
  };
}

export interface LadybugBenchmarkFixtureDigests {
  readonly canonicalExportSha256: string;
  readonly sourceInventorySha256: string;
  readonly taskSnapshotSha256: string;
}

export interface GeneratedLadybugBenchmarkFixture {
  readonly root: string;
  readonly spec: LadybugBenchmarkFixtureSpec;
  readonly tasks: readonly BacklogTask[];
  readonly source: LadybugProjectionSource;
  readonly markdownBodyBytes: number;
  readonly digests: LadybugBenchmarkFixtureDigests;
}

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const QuerySpecSchema = z.strictObject({
  id: z.string().min(1),
  text: z.string().min(1),
  class: z.enum(["common", "rare", "tied", "no-hit", "unicode"]),
  expectedMatches: z.number().int().nonnegative(),
  expectTopTie: z.boolean().optional(),
});
const BacklogTaskSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  priority: z.string().min(1).nullable(),
  ordinal: z.number().int().nonnegative().nullable(),
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
  milestone: z.string().min(1).nullable(),
  parentTaskId: z.string().min(1).nullable(),
});
const TaskSnapshotSchema = z.strictObject({
  schema: z.literal(LADYBUG_BENCHMARK_TASK_SNAPSHOT_SCHEMA),
  tasks: z.array(BacklogTaskSchema).min(1),
});
const FixtureSpecSchema = z.strictObject({
  schema: z.literal(LADYBUG_BENCHMARK_FIXTURE_SCHEMA),
  name: z.enum(["small", "large"]),
  seed: z.number().int().positive(),
  counts: z.strictObject({
    concepts: z.number().int().positive(),
    tasks: z.number().int().positive(),
    authoredEdges: z.number().int().positive(),
    markdownBodyBytes: z.number().int().positive(),
  }),
  coverage: z.strictObject({
    graphShapes: z.tuple([
      z.literal("chain"),
      z.literal("star"),
      z.literal("cycle"),
      z.literal("duplicate"),
      z.literal("dangling"),
    ]),
    graphDepths: z.array(z.number().int().nonnegative()).min(1),
    contextBudgets: z.array(z.number().int().positive()).min(1),
    queries: z.array(QuerySpecSchema).length(5),
    unicode: z.array(z.string().min(1)).min(1),
    additiveFields: z.array(z.string().min(1)).min(1),
  }),
  expected: z.strictObject({
    canonicalExportSha256: Sha256Schema,
    sourceInventorySha256: Sha256Schema,
    taskSnapshotSha256: Sha256Schema,
  }),
});

/** Load and validate one committed fixture specification. */
export function loadLadybugBenchmarkFixtureSpec(path: string): LadybugBenchmarkFixtureSpec {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  assertFixtureSpec(value, path);
  return value;
}

/** Read the benchmark-private task snapshot without consulting a host Backlog executable. */
export function loadLadybugBenchmarkTasks(root: string): BacklogTask[] {
  const value: unknown = JSON.parse(readFileSync(join(root, LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH), "utf8"));
  const parsed = TaskSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`invalid benchmark task snapshot: ${parsed.error.issues[0]?.message ?? "does not match schema"}`);
  }
  return parsed.data.tasks;
}

/**
 * A read-only adapter for disposable benchmark fixtures. This keeps timing and
 * package evidence independent of an undeclared host Backlog installation.
 */
export function createLadybugBenchmarkBacklogAdapter(root: string): BacklogAdapter {
  const tasks = loadLadybugBenchmarkTasks(root);
  const unavailable = (): never => {
    throw new Error("benchmark task adapter supports only probe and listTasks");
  };
  return {
    async probe() {
      return { version: "1.49.0", schemaVersion: 1 };
    },
    statusFlow: () => ["To Do", "In Progress", "Done"],
    async listTasks(options?: ListTasksOptions) {
      let selected = tasks;
      if (options?.status !== undefined) {
        const status = options.status.toLowerCase();
        selected = selected.filter((task) => task.status.toLowerCase() === status);
      }
      if (options?.labels !== undefined && options.labels.length > 0) {
        const labels = options.labels.map((label) => label.toLowerCase());
        selected = selected.filter((task) => {
          const present = new Set(task.labels.map((label) => label.toLowerCase()));
          return labels.every((label) => present.has(label));
        });
      }
      return selected;
    },
    async viewTask() {
      return unavailable();
    },
    async searchByLabel() {
      return unavailable();
    },
    async searchTasks() {
      return unavailable();
    },
    async createTask() {
      return unavailable();
    },
    async editTask() {
      return unavailable();
    },
  };
}

/**
 * Materialize and project a fixture in an empty temporary directory.
 *
 * The returned source uses an unborn Git commit (`null`), the current Lore package
 * version, and pinned native metadata so digests are independent of the invoking host.
 */
export function generateLadybugBenchmarkFixture(
  spec: LadybugBenchmarkFixtureSpec,
  root: string,
): GeneratedLadybugBenchmarkFixture {
  assertFixtureSpec(spec, spec.name);
  assertEmptyDirectory(root);
  const tasks = buildTasks(spec);
  const markdownBodyBytes = writeRepository(spec, root, tasks);
  const graph = loadBundle(join(root, "docs"));
  const projection = buildProjection({
    graph,
    tasks,
    docsRoot: "docs",
    okfVersion: "0.1",
    exporterVersion: LADYBUG_BENCHMARK_FIXTURE_EXPORTER_VERSION,
    gitCommit: LADYBUG_BENCHMARK_FIXTURE_COMMIT,
    generatedAt: null,
  });
  const source = prepareLadybugProjectionSource({
    projection,
    inventory: readSourceInventory(root),
    profileInventory: readProfileInventory(root),
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    loreVersion: LADYBUG_BENCHMARK_FIXTURE_EXPORTER_VERSION,
  });
  const digests = {
    canonicalExportSha256: source.exportDigest,
    sourceInventorySha256: digest(canonicalJson(source.inventory)),
    taskSnapshotSha256: source.taskSnapshotDigest,
  };
  return { root, spec, tasks, source, markdownBodyBytes, digests };
}

function writeRepository(spec: LadybugBenchmarkFixtureSpec, root: string, tasks: readonly BacklogTask[]): number {
  mkdirSync(join(root, "docs", "concepts"), { recursive: true });
  mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
  mkdirSync(join(root, ".lore"), { recursive: true });
  writeFileSync(join(root, ".lore", "profile.toml"), "# Built-in Lore profile; fixture bytes are intentional.\n");
  writeFileSync(
    join(root, "backlog", "config.yml"),
    [
      `project_name: "${spec.name}-ladybug-benchmark"`,
      'default_status: "To Do"',
      'statuses: ["To Do", "In Progress", "Done"]',
      "labels: []",
      "date_format: yyyy-mm-dd",
      "max_column_width: 20",
      "auto_open_browser: false",
      "default_port: 6420",
      "remote_operations: false",
      "auto_commit: false",
      "filesystem_only: true",
      "bypass_git_hooks: false",
      "check_active_branches: false",
      "active_branch_days: 30",
      'task_prefix: "BENCH"',
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(root, LADYBUG_BENCHMARK_TASK_SNAPSHOT_REL_PATH),
    `${canonicalJson({ schema: LADYBUG_BENCHMARK_TASK_SNAPSHOT_SCHEMA, tasks })}\n`,
  );

  const random = xorshift32(spec.seed);
  let markdownBodyBytes = 0;
  for (let ordinal = 0; ordinal < spec.counts.concepts; ordinal++) {
    const path = conceptPath(ordinal);
    const body = conceptBody(spec, ordinal, random);
    markdownBodyBytes += Buffer.byteLength(body);
    const absolute = join(root, "docs", path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${conceptFrontmatter(spec, ordinal)}${body}`);
  }
  for (const task of tasks) {
    writeFileSync(join(root, "backlog", "tasks", taskFilename(task)), taskMarkdown(task, spec));
  }

  const git = Bun.spawnSync(["git", "init", "--quiet", "--initial-branch=benchmark"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (git.exitCode !== 0) {
    throw new Error(`git init failed for generated benchmark fixture: ${git.stderr.toString("utf8").trim()}`);
  }
  return markdownBodyBytes;
}

function conceptFrontmatter(spec: LadybugBenchmarkFixtureSpec, ordinal: number): string {
  const primaryTask = taskId(ordinal % spec.counts.tasks);
  const secondTask =
    ordinal % 8 === 0
      ? primaryTask
      : ordinal % 8 === 1
        ? `MISSING-${padded(ordinal)}`
        : taskId((ordinal * 17 + 3) % spec.counts.tasks);
  const specification = conceptId((ordinal + 7) % spec.counts.concepts);
  const lines = [
    "---",
    "type: Reference",
    `title: ${JSON.stringify(conceptTitle(ordinal))}`,
    `summary: ${JSON.stringify(`Seeded benchmark concept ${padded(ordinal)}.`)}`,
    ...(ordinal === 0 ? ['okf_version: "0.1"'] : []),
    `specs: ${JSON.stringify(specification)}`,
    "tasks:",
    `  - ${primaryTask}`,
    `  - ${secondTask}`,
    "fixture_extension:",
    `  schema: ${LADYBUG_BENCHMARK_FIXTURE_SCHEMA}`,
    `  seed: ${spec.seed}`,
    `  ordinal: ${ordinal}`,
    '  unicode: "café 東京 🪲"',
    "---",
    "",
  ];
  return lines.join("\n");
}

function conceptBody(spec: LadybugBenchmarkFixtureSpec, ordinal: number, random: () => number): string {
  const next = (ordinal + 1) % spec.counts.concepts;
  const previous = (ordinal + spec.counts.concepts - 1) % spec.counts.concepts;
  const star = Math.floor(ordinal / 16) * 16;
  const markers = [
    "constellation-common",
    ...(ordinal === 0 ? ["axolotl-rare", "café-unicode"] : []),
    ...(ordinal === 2 || ordinal === 3 ? ["balanced-tie"] : []),
  ].join(" ");
  const prefix = [
    `# Benchmark concept ${padded(ordinal)}`,
    "",
    markers,
    "",
    `[chain](${bodyTarget(ordinal, next)})`,
    `[star](${bodyTarget(ordinal, star)})`,
    `[cycle](${bodyTarget(ordinal, previous)})`,
    `[duplicate](${bodyTarget(ordinal, next)})`,
    `[dangling](${danglingTarget(ordinal)})`,
    "",
  ].join("\n");
  const targetBytes = spec.counts.markdownBodyBytes / spec.counts.concepts;
  const prefixBytes = Buffer.byteLength(prefix);
  if (!Number.isInteger(targetBytes) || prefixBytes + 1 > targetBytes) {
    throw new Error(`${spec.name}: Markdown body byte budget cannot be divided across concepts`);
  }
  const paddingBytes = targetBytes - prefixBytes - 1;
  return `${prefix}${seededAscii(paddingBytes, random)}\n`;
}

function bodyTarget(from: number, to: number): string {
  const fromPath = conceptPath(from);
  const toPath = conceptPath(to);
  return posix.relative(posix.dirname(fromPath), toPath);
}

function danglingTarget(ordinal: number): string {
  return ordinal === 0 ? "missing/dangling.md" : `../missing/dangling-${padded(ordinal)}.md`;
}

function conceptPath(ordinal: number): string {
  return ordinal === 0 ? "index.md" : `concepts/concept-${padded(ordinal)}.md`;
}

function conceptId(ordinal: number): string {
  return conceptPath(ordinal).replace(/\.md$/, "");
}

function conceptTitle(ordinal: number): string {
  if (ordinal === 0) return "Café 東京 🪲 benchmark root";
  if (ordinal === 2 || ordinal === 3) return `Balanced tie ${padded(ordinal)}`;
  return `Benchmark concept ${padded(ordinal)}`;
}

function seededAscii(length: number, random: () => number): string {
  if (length === 0) return "";
  // No whitespace: every concept gets the same token count as well as the same
  // byte count, so the deliberately tied lexical documents remain a real BM25 tie.
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = Buffer.allocUnsafe(length);
  for (let index = 0; index < length; index++) {
    bytes[index] = alphabet.charCodeAt(Math.floor(random() * alphabet.length));
  }
  return bytes.toString("ascii");
}

function buildTasks(spec: LadybugBenchmarkFixtureSpec): BacklogTask[] {
  return Array.from({ length: spec.counts.tasks }, (_, ordinal) => ({
    id: taskId(ordinal),
    title: ordinal === 0 ? "Café qualification task" : `Benchmark task ${padded(ordinal)}`,
    status: ordinal % 3 === 0 ? "In Progress" : "To Do",
    priority: ordinal % 5 === 0 ? "high" : null,
    ordinal,
    assignees: ordinal % 11 === 0 ? ["@benchmark"] : [],
    labels: ordinal % 7 === 0 ? ["common", "qualification"] : ["qualification"],
    milestone: ordinal % 13 === 0 ? "m-benchmark" : null,
    parentTaskId: null,
  }));
}

function taskMarkdown(task: BacklogTask, spec: LadybugBenchmarkFixtureSpec): string {
  return [
    "---",
    `id: ${task.id}`,
    `title: ${JSON.stringify(task.title)}`,
    `status: ${task.status}`,
    ...(task.assignees.length > 0
      ? ["assignee:", ...task.assignees.map((value) => `  - ${JSON.stringify(value)}`)]
      : []),
    'created_date: "2026-01-01 00:00"',
    "labels:",
    ...task.labels.map((value) => `  - ${value}`),
    ...(task.milestone === null ? [] : [`milestone: ${task.milestone}`]),
    ...(task.priority === null ? [] : [`priority: ${task.priority}`]),
    "type: task",
    `ordinal: ${task.ordinal}`,
    "fixture_extension:",
    `  schema: ${LADYBUG_BENCHMARK_FIXTURE_SCHEMA}`,
    `  seed: ${spec.seed}`,
    "---",
    "",
    "## Description",
    "",
    `Synthetic task ${task.id} for the ${spec.name} Ladybug benchmark fixture.`,
    "",
  ].join("\n");
}

function taskFilename(task: BacklogTask): string {
  return `${task.id.toLowerCase()} - ${basename(task.title).replace(/[^a-zA-Z0-9-]+/g, "-")}.md`;
}

function taskId(ordinal: number): string {
  return `BENCH-${padded(ordinal)}`;
}

function padded(value: number): string {
  return String(value).padStart(6, "0");
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function assertEmptyDirectory(root: string): void {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
    return;
  }
  if (readdirSync(root).length !== 0) {
    throw new Error(`benchmark fixture target must be empty: ${root}`);
  }
}

function assertFixtureSpec(value: unknown, source: string): asserts value is LadybugBenchmarkFixtureSpec {
  const parsed = FixtureSpecSchema.safeParse(value);
  if (!parsed.success) {
    invalidSpec(source, parsed.error.issues[0]?.message ?? "does not match schema");
  }
  const spec = value as Partial<LadybugBenchmarkFixtureSpec>;
  const counts = spec.counts as LadybugBenchmarkFixtureSpec["counts"];
  if (counts.authoredEdges !== counts.concepts * 8) invalidSpec(source, "authoredEdges must equal concepts * 8");
  if (counts.markdownBodyBytes % counts.concepts !== 0) {
    invalidSpec(source, "Markdown body bytes must divide evenly across concepts");
  }
  if (counts.markdownBodyBytes < counts.concepts * LADYBUG_BENCHMARK_FIXTURE_BODY_BYTES_PER_CONCEPT) {
    invalidSpec(source, "every concept must receive at least 16 KiB of Markdown body bytes");
  }
  const coverage = spec.coverage as LadybugBenchmarkFixtureSpec["coverage"];
  if (canonicalJson(coverage.graphShapes) !== canonicalJson(["chain", "star", "cycle", "duplicate", "dangling"])) {
    invalidSpec(source, "graphShapes must freeze all five required shapes in order");
  }
  for (const values of [coverage.graphDepths, coverage.contextBudgets]) {
    if (values.some((value, index) => index > 0 && value <= (values[index - 1] as number))) {
      invalidSpec(source, "graph depths and context budgets must each be strictly increasing");
    }
  }
  const classes = new Set(coverage.queries.map((query) => query.class));
  for (const queryClass of ["common", "rare", "tied", "no-hit", "unicode"] satisfies QueryClass[]) {
    if (!classes.has(queryClass)) invalidSpec(source, `queries must include ${queryClass}`);
  }
}

function invalidSpec(source: string, message: string): never {
  throw new Error(`invalid Ladybug benchmark fixture ${source}: ${message}`);
}
