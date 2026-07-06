/**
 * adapters/backlog.ts — the **only** place a `backlog` subprocess is spawned (design spec §2.3, §8).
 *
 * This is the Backlog subprocess seam: the second of lore's three injectable determinism seams
 * (the clock and the git history seam are the others; lore-design §8). Everything that shells out to
 * the `backlog` binary flows through the {@link BacklogSpawn} interface here, so unit and golden tests
 * inject a fake that returns fixed output instead of driving a real subprocess.
 *
 * **Scope (LORE-4).** This file currently ships only the **capability probe** — the fail-loud gate
 * that asserts the `backlog` on PATH is a `--json`-capable build before any coupling feature relies on
 * it. The full typed read/write adapter (`task list`/`view`/`search` parsing, status mapping, the
 * `doc:<id>` back-reference) is **LORE-21**; it extends this same file, building typed reads on top of
 * the {@link BacklogSpawn} seam and the probe seeded here. Keeping the probe here (rather than a second
 * spawning module) preserves the design-spec invariant that this is the *only* backlog subprocess seam.
 *
 * Normative contract: docs/reference/backlog-cli-contract.md §5 (capability probe) and
 * docs/reference/backlog-json-schema.md (the `{schemaVersion, kind, data}` envelope). Where those two
 * documents disagree, the JSON schema reference — mirrored by the fork's actual output — wins: the
 * envelope carries `schemaVersion: "1"` (a string) and `kind: "taskList"` (camelCase), which is what
 * the probe asserts. (The CLI contract's prose `"task-list"` is a documentation slip, tracked in LORE-4.)
 *
 * This file also reads the project's ordered status flow directly from `backlog/config.yml`'s own
 * `statuses:` key (LORE-26) — plain repo-committed YAML, not a `--json` envelope, so it is a direct
 * file read rather than a spawn; see {@link readStatusFlow} at the bottom of this file.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { errnoCode, ioError, LoreError } from "../errors";

/**
 * The **binary version floor** the probe requires (`backlog --version`, contract §5 step 3). Pinned to
 * the fork's base release — the tested floor. Note this alone cannot distinguish the fork from stock:
 * stock v1.47.1 reports the same version. The `--json` envelope parse (step 4 below) is the real
 * discriminator — stock rejects `--json` as an unknown option and exits non-zero.
 */
export const MIN_BACKLOG_VERSION = "1.47.1";

/**
 * The `schemaVersion` the probe recognizes. The envelope is an **additive-only** versioned contract
 * (backlog-json-schema.md §2): unknown *extra keys* are tolerated, but an unrecognized `schemaVersion`
 * bump fails the probe rather than risking a mis-read (contract §5).
 */
export const EXPECTED_SCHEMA_VERSION = "1";

/** The `kind` a `backlog task list --json` envelope must carry (backlog-json-schema.md §4). */
const TASK_LIST_KIND = "taskList";

/** The default binary name resolved from PATH. */
const BACKLOG_BINARY = "backlog";

/**
 * The result of one `backlog` invocation as the {@link BacklogSpawn} seam surfaces it. The minimal,
 * deterministic projection the probe needs: an exit code plus captured streams. A fake returns a fixed
 * one; the real {@link bunBacklogSpawn} builds it from `Bun.spawn`.
 */
export interface SpawnResult {
  /** The process exit code (`0` on success). */
  readonly exitCode: number;
  /** Everything the process wrote to stdout (the JSON envelope, or the bare `--version` line). */
  readonly stdout: string;
  /** Everything the process wrote to stderr (human diagnostics; never parsed as data). */
  readonly stderr: string;
}

/**
 * The injectable Backlog subprocess seam (design spec §8). Callers hand the probe a `BacklogSpawn`
 * rather than a hardcoded `Bun.spawn`, so tests inject a fake returning canned {@link SpawnResult}s
 * (or throwing an `ENOENT`-coded error to simulate a missing binary). `args` are the arguments after
 * the binary name — e.g. `["--version"]` or `["task", "list", "--json"]`; the binary itself is bound
 * inside the implementation. The returned promise **rejects** only when the process could not be
 * spawned at all (e.g. `ENOENT`); a process that ran and failed resolves with a non-zero `exitCode`.
 */
export type BacklogSpawn = (args: readonly string[]) => Promise<SpawnResult>;

/** What the probe learned about the `backlog` binary once it passes — cached by the caller (§5). */
export interface BacklogCapability {
  /** The `major.minor.patch` the binary reported (extra pre-release/build metadata dropped). */
  readonly version: string;
  /** The `schemaVersion` its `--json` envelope carried (always {@link EXPECTED_SCHEMA_VERSION} today). */
  readonly schemaVersion: string;
}

/** A parsed semantic version — just the numeric release triple the floor comparison needs. */
interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The `"major.minor.patch"` string, echoed into {@link BacklogCapability.version}. */
  readonly raw: string;
}

/** The one hint pointing an operator at how to obtain a `--json`-capable Backlog.md. */
const RUNBOOK_HINT =
  "lore needs a --json-capable Backlog.md. Build the fork per docs/runbooks/backlog-json-patch.md and put its `backlog` binary on PATH.";

/**
 * Parse the leading `major.minor.patch` from `backlog --version` output. Backlog prints a **bare**
 * semver plus a trailing newline (`"1.47.1\n"`) — no `v` prefix, no program name — so we anchor at the
 * start of the trimmed string and ignore any pre-release/build suffix. Returns `null` when the output
 * is not a recognizable semver (an empty string, a name-prefixed line, garbage), which the probe treats
 * as a fail-loud condition rather than guessing.
 */
function parseSemver(output: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(output.trim());
  if (!match) {
    return null;
  }
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), raw: `${major}.${minor}.${patch}` };
}

/** Order two {@link Semver}s by release triple: negative if `a < b`, positive if `a > b`, else `0`. */
function compareSemver(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Raise the fail-loud "needs a `--json`-capable Backlog.md" error (contract §5): the binary is present
 * but does not emit the envelope lore requires (stock rejects `--json`, or the output is unparseable /
 * the wrong shape / an unrecognized `schemaVersion`). Maps to exit `6` (`validation`) so the caller can
 * refuse the coupling commands while still allowing pure-OKF commands.
 */
function notJsonCapable(reason: string, input?: Record<string, unknown>): never {
  throw new LoreError("validation", `The \`backlog\` binary is not --json-capable: ${reason}`, RUNBOOK_HINT, input);
}

/**
 * The capability probe (contract §5), run once at startup and cached by the caller in `.lore/cache/`.
 * Fail-loud: it either returns the {@link BacklogCapability} of a `--json`-capable binary or throws a
 * typed {@link LoreError} — it never best-effort parses or silently degrades (there is deliberately no
 * `--plain` text fallback; ADR-0002).
 *
 * Steps, in order:
 * 1. `backlog --version` — a missing binary (`ENOENT`) is `not_found` (exit 3) with an install hint;
 *    a non-zero exit or non-semver output is fail-loud.
 * 2. Compare the reported version against {@link MIN_BACKLOG_VERSION}; below the floor is fail-loud.
 * 3. `backlog task list --json` — a non-zero exit (stock rejects the unknown `--json` option),
 *    unparseable stdout, the wrong `kind`, a non-array `data`, or an unrecognized `schemaVersion` are
 *    all fail-loud "not --json-capable" (exit 6). This step, not the version, is what proves the fork.
 *
 * The `spawn` seam is injected so tests exercise every branch without a real subprocess.
 */
export async function probeBacklog(spawn: BacklogSpawn): Promise<BacklogCapability> {
  // Step 1 — version. A spawn rejection with an ENOENT code means the binary is absent from PATH; that
  // is `not_found` (exit 3) with an install hint, distinct from a present-but-incapable binary (exit 6).
  let versionResult: SpawnResult;
  try {
    versionResult = await spawn(["--version"]);
  } catch (cause) {
    if (errnoCode(cause) === "ENOENT") {
      throw new LoreError("not_found", "`backlog` was not found on PATH.", RUNBOOK_HINT, { binary: BACKLOG_BINARY });
    }
    throw cause;
  }
  if (versionResult.exitCode !== 0) {
    notJsonCapable("`backlog --version` exited non-zero", { exitCode: versionResult.exitCode });
  }
  const version = parseSemver(versionResult.stdout);
  if (!version) {
    notJsonCapable("`backlog --version` did not print a bare semver");
  }

  // Step 2 — version floor. Below the tested floor is fail-loud; note stock v1.47.1 passes this check
  // (same version as the fork), so passing here does NOT yet prove --json — step 3 does.
  const floor = parseSemver(MIN_BACKLOG_VERSION);
  if (floor && compareSemver(version, floor) < 0) {
    notJsonCapable(`version ${version.raw} is below the ${MIN_BACKLOG_VERSION} floor`, {
      version: version.raw,
      floor: MIN_BACKLOG_VERSION,
    });
  }

  // Step 3 — the dry `task list --json` probe. THIS is the real discriminator: stock Backlog.md has no
  // `--json` option, so Commander exits non-zero here. A fork emits one parseable envelope.
  const listResult = await spawn(["task", "list", "--json"]);
  if (listResult.exitCode !== 0) {
    notJsonCapable("`task list --json` exited non-zero (stock Backlog.md rejects --json)", {
      exitCode: listResult.exitCode,
    });
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(listResult.stdout);
  } catch {
    notJsonCapable("`task list --json` did not print parseable JSON");
  }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    notJsonCapable("`task list --json` did not print a JSON envelope object");
  }
  const { schemaVersion, kind, data } = envelope as { schemaVersion?: unknown; kind?: unknown; data?: unknown };
  if (kind !== TASK_LIST_KIND) {
    notJsonCapable(`envelope kind was ${JSON.stringify(kind)}, expected ${JSON.stringify(TASK_LIST_KIND)}`);
  }
  if (!Array.isArray(data)) {
    notJsonCapable("envelope `data` was not an array");
  }
  // An unrecognized schemaVersion is a contract drift lore must not mis-read (§5): fail loud rather than
  // parse a shape it does not understand.
  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    notJsonCapable(
      `unrecognized schemaVersion ${JSON.stringify(schemaVersion)} (this lore understands ${JSON.stringify(EXPECTED_SCHEMA_VERSION)})`,
      { schemaVersion },
    );
  }

  return { version: version.raw, schemaVersion: EXPECTED_SCHEMA_VERSION };
}

/**
 * The **real** {@link BacklogSpawn}: shells out to the `backlog` binary via `Bun.spawn`, capturing both
 * streams and the exit code. Impure command-layer wiring (like the real clock and the real `git`
 * adapter), supplied where coupling commands are built; the probe and the rest of core never construct
 * it. A binary missing from PATH surfaces as a rejected promise carrying an `ENOENT` code, which
 * {@link probeBacklog} maps to `not_found`.
 *
 * `binary` defaults to `"backlog"` (resolved from PATH); it is a parameter so a test or a pinned
 * install can point at an explicit path. `cwd` defaults to the current process's working directory
 * (`Bun.spawn`'s own default); a caller working against a non-default `root` must pass it explicitly,
 * or the subprocess resolves Backlog's project files against the wrong directory.
 */
export function bunBacklogSpawn(binary: string = BACKLOG_BINARY, cwd?: string): BacklogSpawn {
  return async (args: readonly string[]): Promise<SpawnResult> => {
    const proc = Bun.spawn([binary, ...args], { stdout: "pipe", stderr: "pipe", cwd });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  };
}

// ── The `--json` contract mirror (schema of record) ────────────────────────────────
//
// A Zod encoding of docs/reference/backlog-json-schema.md §1–§5 — the schema of record for what the
// fork's `--json` emits. Every read validates its envelope's `data` against the matching shape here:
// unknown *extra* keys are tolerated (`z.looseObject`, the additive-only contract §2), missing required
// keys are rejected. This is the runtime authority the doc describes (§7 step 4); the golden test
// (`test/backlog-json-golden.test.ts`) re-imports these same schemas via `test/support/backlog-golden.ts`
// so the committed fixtures and the adapter can never validate against two different contracts.

/** Priority is a closed set or null (§3.2). */
const Priority = z.enum(["high", "medium", "low"]).nullable();

/** Provenance is a closed set or null (§3.2 `source`). */
const Source = z.enum(["local", "remote", "completed", "local-branch"]).nullable();

/** An acceptance-criterion / definition-of-done item; `index` is positional and NON-durable (§6). */
const Criterion = z.looseObject({
  index: z.number(),
  text: z.string(),
  checked: z.boolean(),
});

/** A task comment (§3.1); `author` may be null. */
const Comment = z.looseObject({
  index: z.number(),
  author: z.string().nullable(),
  createdDate: z.string(),
  body: z.string(),
});

/**
 * `kind: "task"` — the full task object (§3.2), the richest shape. `looseObject` tolerates unknown
 * additive keys (§2). `rawContent` (opt-in, §6) and `lastModified` (omitted/normalized, §2) are
 * deliberately NOT declared here; the golden test asserts they are absent from the recorded output.
 */
export const TaskSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: Priority,
  ordinal: z.number().nullable(),
  filePath: z.string().nullable(),
  filePathRelative: z.string().nullable(),
  assignees: z.array(z.string()),
  reporter: z.string().nullable(),
  createdDate: z.string(),
  updatedDate: z.string().nullable(),
  labels: z.array(z.string()),
  milestone: z.string().nullable(),
  dependencies: z.array(z.string()),
  references: z.array(z.string()),
  documentation: z.array(z.string()),
  modifiedFiles: z.array(z.string()),
  parentTaskId: z.string().nullable(),
  // View-only enrichment (§6): present on `task view`, optional/absent on list/search.
  parentTaskTitle: z.string().nullable().optional(),
  subtasks: z.array(z.looseObject({ id: z.string(), title: z.string() })).optional(),
  acceptanceCriteria: z.array(Criterion),
  definitionOfDone: z.array(Criterion),
  description: z.string().nullable(),
  implementationPlan: z.string().nullable(),
  implementationNotes: z.string().nullable(),
  finalSummary: z.string().nullable(),
  comments: z.array(Comment),
  source: Source,
  branch: z.string().nullable(),
  onStatusChange: z.union([z.record(z.string(), z.unknown()), z.string()]).nullable(),
});

/**
 * A `taskList` entry / `searchResult` task item — the stable summary subset (§4). Field-compatible
 * with {@link TaskSchema} on its shared keys, per the fork's `serializeTaskSummary` contract.
 */
export const TaskSummarySchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  priority: Priority,
  ordinal: z.number().nullable(),
  assignees: z.array(z.string()),
  labels: z.array(z.string()),
  milestone: z.string().nullable(),
  parentTaskId: z.string().nullable(),
  filePath: z.string().nullable(),
  filePathRelative: z.string().nullable(),
});

/** One scored search hit (§5): a `type`-tagged, `score`d wrapper around the matched `item`. */
export const SearchHitSchema = z.looseObject({
  type: z.enum(["task", "document", "decision"]),
  score: z.number().nullable(),
  // `item` shape depends on `type`; `lore` only consumes task hits (§5). Task items must match the
  // summary subset; document/decision items are Backlog-owned and only shape-checked loosely.
  item: z.looseObject({}),
});

/** The per-`kind` envelope (§1): exactly one object, `schemaVersion` "1", camelCase `kind`, typed `data`. */
export const EnvelopeSchema = z.discriminatedUnion("kind", [
  z.looseObject({ schemaVersion: z.literal("1"), kind: z.literal("task"), data: TaskSchema }),
  z.looseObject({ schemaVersion: z.literal("1"), kind: z.literal("taskList"), data: z.array(TaskSummarySchema) }),
  z.looseObject({ schemaVersion: z.literal("1"), kind: z.literal("searchResult"), data: z.array(SearchHitSchema) }),
]);

/** The three envelope kinds a `--json` command can carry, in the fork's camelCase spelling. */
export type EnvelopeKind = "task" | "taskList" | "searchResult";

// ── lore's internal task model (the mapped read surface) ────────────────────────────
//
// The adapter maps the validated `--json` payload into these types before any coupling command sees
// it. The mapping bakes in two load-bearing caveats from backlog-json-schema.md §6 so a caller cannot
// get them wrong: `file` is always `filePathRelative` (the portable path) — the absolute, host-specific
// `filePath` is dropped and never surfaced — and AC/DoD items drop their NON-durable positional `index`
// so callers must match on `text`. `id` is kept verbatim as identity (display-cased); a filename is
// never derived from it.

/** Task priority, mirroring the JSON `priority` closed set. */
export type BacklogPriority = "high" | "medium" | "low" | null;

/** Task provenance, mirroring the JSON `source` closed set. */
export type BacklogSource = "local" | "remote" | "completed" | "local-branch" | null;

/**
 * An acceptance-criterion / definition-of-done line, with the JSON `index` **deliberately dropped**
 * (§6: it is positional and renumbers on edit). Callers key on {@link text}, never a position.
 */
export interface BacklogCriterion {
  readonly text: string;
  readonly checked: boolean;
}

/** A task comment, with the positional `index` dropped for the same reason as {@link BacklogCriterion}. */
export interface BacklogComment {
  readonly author: string | null;
  readonly createdDate: string;
  readonly body: string;
}

/**
 * The **summary** of a task — the stable subset every read surfaces (`task list`, `search`, and the
 * richer `task view`). Enough to render a listing and reconcile status without a per-task `view`.
 * {@link file} is the repo-relative path (`backlog/tasks/…`) or `null`; the absolute host-specific
 * `filePath` is never carried. `labels` includes any `doc:<conceptId>` back-reference (§3.2).
 */
export interface BacklogTask {
  /** Display-cased identity (`"LORE-21"`). Identity only — never derive a filename from it (§6). */
  readonly id: string;
  readonly title: string;
  /** The raw configured status string, no presentation icon (§2). */
  readonly status: string;
  readonly priority: BacklogPriority;
  /** Sort ordinal within status, or `null`. */
  readonly ordinal: number | null;
  readonly assignees: readonly string[];
  /** Includes the `doc:<conceptId>` back-reference label lore reads for coupling (§3.2). */
  readonly labels: readonly string[];
  readonly milestone: string | null;
  readonly parentTaskId: string | null;
  /** `filePathRelative` (portable) or `null` on a not-yet-written task; never the absolute path (§6). */
  readonly file: string | null;
}

/**
 * The **full** task (output of `backlog task view <id> --json`, `kind: "task"`), extending
 * {@link BacklogTask} with the fields only the per-id view carries: dependencies, the doc/ref arrays,
 * the structured body sections, and comments. The view-only enrichment fields (`parentTaskTitle`,
 * `subtasks`) are normalized to a value here (`null` / `[]`) rather than left possibly-absent.
 */
export interface BacklogTaskDetail extends BacklogTask {
  readonly reporter: string | null;
  readonly createdDate: string;
  readonly updatedDate: string | null;
  readonly dependencies: readonly string[];
  readonly references: readonly string[];
  readonly documentation: readonly string[];
  readonly modifiedFiles: readonly string[];
  readonly parentTaskTitle: string | null;
  readonly subtasks: readonly { readonly id: string; readonly title: string }[];
  readonly acceptanceCriteria: readonly BacklogCriterion[];
  readonly definitionOfDone: readonly BacklogCriterion[];
  readonly description: string | null;
  readonly implementationPlan: string | null;
  readonly implementationNotes: string | null;
  readonly finalSummary: string | null;
  readonly comments: readonly BacklogComment[];
  readonly source: BacklogSource;
  readonly branch: string | null;
}

/** Map a validated `taskList`/`searchResult` summary item into lore's {@link BacklogTask}. */
function mapSummary(item: z.infer<typeof TaskSummarySchema>): BacklogTask {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    ordinal: item.ordinal,
    assignees: item.assignees,
    labels: item.labels,
    milestone: item.milestone,
    parentTaskId: item.parentTaskId,
    file: item.filePathRelative,
  };
}

/** Strip the non-durable `index` from AC/DoD items (§6): callers match on text, never position. */
function mapCriteria(items: readonly z.infer<typeof Criterion>[]): BacklogCriterion[] {
  return items.map((c) => ({ text: c.text, checked: c.checked }));
}

/** Map a validated `task` payload into lore's {@link BacklogTaskDetail} (full per-id view). */
function mapTask(data: z.infer<typeof TaskSchema>): BacklogTaskDetail {
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    priority: data.priority,
    ordinal: data.ordinal,
    assignees: data.assignees,
    labels: data.labels,
    milestone: data.milestone,
    parentTaskId: data.parentTaskId,
    file: data.filePathRelative,
    reporter: data.reporter,
    createdDate: data.createdDate,
    updatedDate: data.updatedDate,
    dependencies: data.dependencies,
    references: data.references,
    documentation: data.documentation,
    modifiedFiles: data.modifiedFiles,
    parentTaskTitle: data.parentTaskTitle ?? null,
    subtasks: data.subtasks ?? [],
    acceptanceCriteria: mapCriteria(data.acceptanceCriteria),
    definitionOfDone: mapCriteria(data.definitionOfDone),
    description: data.description,
    implementationPlan: data.implementationPlan,
    implementationNotes: data.implementationNotes,
    finalSummary: data.finalSummary,
    comments: data.comments.map((c) => ({ author: c.author, createdDate: c.createdDate, body: c.body })),
    source: data.source,
    branch: data.branch,
  };
}

// ── Read/write fail-loud helpers ────────────────────────────────────────────────────

/** Flatten Zod issues to a single-line `field: reason; field: reason` string (mirrors core/schema.ts). */
function describeZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

/** Project Zod issues onto a plain, JSON-safe array for a {@link LoreError}'s `input.issues`. */
function zodIssueList(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

/**
 * A `--json` read did not return the envelope lore expects (unparseable stdout, a `schemaVersion`/`kind`
 * mismatch, or a `data` shape that fails the contract mirror). This is **fail-loud drift** (exit 6): the
 * adapter never best-effort parses and there is deliberately no `--plain` text fallback (ADR-0002).
 */
function readDrift(reason: string, input?: Record<string, unknown>): never {
  throw new LoreError("drift", `\`backlog\` --json read drift: ${reason}`, RUNBOOK_HINT, input);
}

/**
 * Parse and validate one `--json` envelope's stdout for `command`, asserting it carries `expectedKind`,
 * and return the validated `data`. Staged like the probe so each failure names its cause: parseable
 * JSON → an envelope object → the pinned `schemaVersion` → the expected `kind` → the per-kind `data`
 * shape (Zod). Every step failing is {@link readDrift} (exit 6) — never a silent degrade.
 */
function parseEnvelope<S extends z.ZodType>(
  stdout: string,
  expectedKind: EnvelopeKind,
  dataSchema: S,
  command: string,
): z.infer<S> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    readDrift(`\`${command}\` did not print parseable JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    readDrift(`\`${command}\` did not print a JSON envelope object`);
  }
  const { schemaVersion, kind, data } = parsed as { schemaVersion?: unknown; kind?: unknown; data?: unknown };
  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    readDrift(
      `\`${command}\` envelope schemaVersion was ${JSON.stringify(schemaVersion)} (this lore understands ${JSON.stringify(EXPECTED_SCHEMA_VERSION)})`,
      { schemaVersion },
    );
  }
  if (kind !== expectedKind) {
    readDrift(`\`${command}\` envelope kind was ${JSON.stringify(kind)}, expected ${JSON.stringify(expectedKind)}`);
  }
  const result = dataSchema.safeParse(data);
  if (!result.success) {
    throw new LoreError(
      "validation",
      `\`backlog ${command}\` --json payload failed contract validation: ${describeZodIssues(result.error)}`,
      RUNBOOK_HINT,
      { command, issues: zodIssueList(result.error) },
    );
  }
  return result.data;
}

/** The `data` schema for a `taskList` envelope: an array of summaries. */
const TaskListData = z.array(TaskSummarySchema);
/** The `data` schema for a `searchResult` envelope: an array of scored hits. */
const SearchResultData = z.array(SearchHitSchema);

// ── The typed adapter (JSON-only reads, CLI writes) ─────────────────────────────────

/** Filters for {@link BacklogAdapter.listTasks}, passed through to `task list --json`. */
export interface ListTasksOptions {
  /** Filter to one configured status (`--status`, case-insensitive). */
  readonly status?: string;
  /** Require every listed label (`--labels`, AND-match); e.g. `["doc:stories/x"]`. */
  readonly labels?: readonly string[];
}

/** Input for {@link BacklogAdapter.createTask}. Only the fields lore's coupling commands set. */
export interface CreateTaskInput {
  readonly title: string;
  /** Labels to set on the new task (comma-joined into one `--labels`, per contract §2.4). */
  readonly labels?: readonly string[];
  readonly description?: string;
  /** Documentation refs (`--doc`, accumulator) — the display cross-reference. */
  readonly doc?: readonly string[];
  readonly milestone?: string;
}

/** A patch for {@link BacklogAdapter.editTask}. Label ops are **incremental** (add/remove), never SET. */
export interface EditTaskPatch {
  /** Labels to add (`--add-label`, case-insensitive de-dup) — e.g. a `doc:<conceptId>` back-ref. */
  readonly addLabels?: readonly string[];
  /** Labels to remove (`--remove-label`). */
  readonly removeLabels?: readonly string[];
  /** New status (`--status`). */
  readonly status?: string;
  /** Documentation refs to set (`--doc`) — SET/REPLACE the whole array (contract §2.4). */
  readonly doc?: readonly string[];
}

/**
 * The typed Backlog.md read/write surface — the **only** consumer of the {@link BacklogSpawn} seam
 * beyond the probe, and the sole place the `--json` schema is parsed (design §2.3, schema doc §7).
 *
 * Reads are JSON-only: each shells the matching `--json` command, `JSON.parse`s the single envelope,
 * asserts `schemaVersion`/`kind`, validates `data` against the contract mirror, and maps to lore's
 * internal types — never touching `--plain` (ADR-0002). Writes go through `task create`/`task edit`;
 * a create's new id is captured from the `Created task <ID>` stdout line, not from JSON (contract §2.1).
 * Every method first runs the capability {@link probeBacklog} (memoized once per adapter), so a binary
 * that is not `--json`-capable is refused before any command's output is trusted.
 */
export interface BacklogAdapter {
  /** The cached capability probe verdict; runs `probeBacklog` at most once, fail-loud on an incapable binary. */
  probe(): Promise<BacklogCapability>;
  /** `task list --json` → the summaries on the current branch, optionally filtered by status/labels. */
  listTasks(opts?: ListTasksOptions): Promise<BacklogTask[]>;
  /** `task view <id> --json` → the full task, or `null` when the id has no task (never trusts exit code). */
  viewTask(id: string): Promise<BacklogTaskDetail | null>;
  /** `task list --json --labels <label>` → tasks carrying an exact label (e.g. a `doc:<conceptId>` back-ref). */
  searchByLabel(label: string): Promise<BacklogTask[]>;
  /** `search <query> --json` → the **task** hits only (document/decision hits are dropped, §5). */
  searchTasks(query: string): Promise<BacklogTask[]>;
  /** `task create` (no `--plain`/`--json`) → the new display-cased id, captured from `Created task <ID>`. */
  createTask(input: CreateTaskInput): Promise<string>;
  /** `task edit <id> --json` with an incremental patch; fail-loud on a missing task or a non-zero exit. */
  editTask(id: string, patch: EditTaskPatch): Promise<void>;
}

/** Captures the display-cased id from a create's first stdout line (`Created task LORE-1` / `Created draft …`). */
const CREATED_ID = /^Created (?:task|draft) (\S+)$/m;

/**
 * Join multiple values for a single-value, last-wins flag into one comma-separated argument (§2.4).
 * Backlog's CLI has no escape for an embedded comma — the comma **is** the delimiter — so a value
 * containing one cannot be sent safely: it would silently split into two (or more) unrelated
 * Backlog-side values instead of the one lore intends. Reject it instead.
 */
function commaJoin(values: readonly string[]): string {
  const offender = values.find((v) => v.includes(","));
  if (offender !== undefined) {
    throw new LoreError(
      "validation",
      `cannot send "${offender}" to Backlog: a comma-separated flag has no escape for an embedded comma`,
      "rename the concept/label/value so it contains no comma",
      { value: offender },
    );
  }
  return values.join(",");
}

/**
 * Build the typed {@link BacklogAdapter} over an injected {@link BacklogSpawn} (real via
 * {@link bunBacklogSpawn}, a fake in tests). The capability probe is memoized on first use — its promise
 * is cached so a passing verdict runs the underlying `--version` + dry `task list --json` exactly once
 * per adapter, and a failing verdict rejects every method the same way. (The cross-process cache in
 * `.lore/cache/` described in the schema doc §7 is a command-layer concern, layered on top of this.)
 */
export function createBacklogAdapter(spawn: BacklogSpawn): BacklogAdapter {
  let capability: Promise<BacklogCapability> | undefined;
  const ensureProbed = (): Promise<BacklogCapability> => {
    if (capability === undefined) {
      capability = probeBacklog(spawn);
    }
    return capability;
  };

  /** Run a read command through the probe gate and return its captured {@link SpawnResult}. */
  async function read(args: readonly string[], command: string): Promise<SpawnResult> {
    await ensureProbed();
    const result = await spawn(args);
    if (result.exitCode !== 0) {
      readDrift(`\`${command}\` exited ${result.exitCode}`, { exitCode: result.exitCode });
    }
    return result;
  }

  return {
    probe: ensureProbed,

    async listTasks(opts?: ListTasksOptions): Promise<BacklogTask[]> {
      const args = ["task", "list", "--json"];
      if (opts?.status !== undefined) {
        args.push("--status", opts.status);
      }
      if (opts?.labels !== undefined && opts.labels.length > 0) {
        args.push("--labels", commaJoin(opts.labels));
      }
      const result = await read(args, "task list --json");
      return parseEnvelope(result.stdout, "taskList", TaskListData, "task list --json").map(mapSummary);
    },

    async viewTask(id: string): Promise<BacklogTaskDetail | null> {
      await ensureProbed();
      const result = await spawn(["task", "view", id, "--json"]);
      // A missing task is NOT an error to Backlog: `task view <missing>` exits 0 with EMPTY stdout and a
      // "Task <id> not found." line on stderr (verified against the fork; contract §2.2 — the exit code is
      // meaningless here). Empty stdout is the clean missing signal; any other output must parse as a task
      // envelope or fail loud. This is why `viewTask` cannot share the `read` helper's exit-code guard.
      if (result.stdout.trim() === "") {
        return null;
      }
      if (result.exitCode !== 0) {
        readDrift(`\`task view --json\` exited ${result.exitCode}`, { exitCode: result.exitCode, id });
      }
      return mapTask(parseEnvelope(result.stdout, "task", TaskSchema, "task view --json"));
    },

    async searchByLabel(label: string): Promise<BacklogTask[]> {
      return this.listTasks({ labels: [label] });
    },

    async searchTasks(query: string): Promise<BacklogTask[]> {
      const result = await read(["search", query, "--json"], "search --json");
      const hits = parseEnvelope(result.stdout, "searchResult", SearchResultData, "search --json");
      // lore consumes only task hits (§5); document/decision hits are Backlog-owned. Re-validate each
      // task hit's loosely-typed `item` against the summary contract before mapping.
      const tasks: BacklogTask[] = [];
      for (const hit of hits) {
        if (hit.type !== "task") {
          continue;
        }
        const item = TaskSummarySchema.safeParse(hit.item);
        if (!item.success) {
          throw new LoreError(
            "validation",
            `\`backlog search --json\` task hit failed contract validation: ${describeZodIssues(item.error)}`,
            RUNBOOK_HINT,
            { issues: zodIssueList(item.error) },
          );
        }
        tasks.push(mapSummary(item.data));
      }
      return tasks;
    },

    async createTask(input: CreateTaskInput): Promise<string> {
      await ensureProbed();
      // Create runs WITHOUT --plain and WITHOUT --json (contract §2.1): --plain suppresses the
      // `Created task <ID>` line lore captures, and create emits no JSON envelope.
      const args = ["task", "create", input.title];
      if (input.description !== undefined) {
        args.push("--description", input.description);
      }
      if (input.labels !== undefined && input.labels.length > 0) {
        args.push("--labels", commaJoin(input.labels));
      }
      if (input.milestone !== undefined) {
        args.push("--milestone", input.milestone);
      }
      for (const doc of input.doc ?? []) {
        args.push("--doc", doc); // --doc is an accumulator (§2.4): repeat, don't comma-join.
      }
      const result = await spawn(args);
      if (result.exitCode !== 0) {
        throw new LoreError(
          "validation",
          `\`backlog task create\` exited ${result.exitCode}`,
          singleLineStderr(result),
          {
            exitCode: result.exitCode,
          },
        );
      }
      const newId = CREATED_ID.exec(result.stdout)?.[1];
      if (newId === undefined) {
        readDrift("`task create` did not print a `Created task <ID>` line to capture the new id");
      }
      return newId;
    },

    async editTask(id: string, patch: EditTaskPatch): Promise<void> {
      await ensureProbed();
      const args = ["task", "edit", id, "--json"];
      if (patch.addLabels !== undefined && patch.addLabels.length > 0) {
        args.push("--add-label", commaJoin(patch.addLabels)); // single-value flag (§2.4): comma-join.
      }
      if (patch.removeLabels !== undefined && patch.removeLabels.length > 0) {
        args.push("--remove-label", commaJoin(patch.removeLabels));
      }
      if (patch.status !== undefined) {
        args.push("--status", patch.status);
      }
      for (const doc of patch.doc ?? []) {
        args.push("--doc", doc); // accumulator, SET/REPLACE the whole array (§2.4).
      }
      const result = await spawn(args);
      // `task edit <missing>` exits 1 (contract §2.2) — the one write whose exit code IS meaningful.
      if (result.exitCode !== 0) {
        const missing = /not found/i.test(result.stderr);
        throw new LoreError(
          missing ? "not_found" : "validation",
          missing
            ? `\`backlog task edit\` could not find task ${JSON.stringify(id)}`
            : `\`backlog task edit\` exited ${result.exitCode}`,
          singleLineStderr(result),
          { id, exitCode: result.exitCode },
        );
      }
    },
  };
}

/** Collapse a failed invocation's stderr to a one-line hint for a {@link LoreError} (empty → undefined). */
function singleLineStderr(result: SpawnResult): string | undefined {
  const trimmed = result.stderr.trim().replace(/\s+/g, " ");
  return trimmed === "" ? undefined : trimmed;
}

// ── Status flow from `backlog/config.yml` (LORE-26, backlog-cli-contract.md §3.1) ──────
//
// `reconcile.ts`'s `reconcileStatus` needs the project's ordered status set — never the hardcoded
// three defaults. This is read directly from `backlog/config.yml`'s own `statuses:` key (plain
// repo-committed YAML Backlog.md itself owns and writes), not shelled through a `backlog` subprocess:
// ADR-0012's future config-drift assertion (`lore check`, LORE-27) already establishes the precedent
// of reading this same file directly, and it needs no `--json` envelope treatment (it is not a Task).

/** Where Backlog.md keeps its own project config, relative to the repo root. */
export const BACKLOG_CONFIG_REL_PATH = "backlog/config.yml";

/** The status flow backlog-cli-contract.md §3.1 documents as the default, used when `backlog/config.yml` is absent or carries no `statuses:` key. */
export const DEFAULT_STATUS_FLOW: readonly string[] = ["To Do", "In Progress", "Done"];

/** The frozen js-yaml load config (matches concept.ts's ADR-0011 §2 choice): `JSON_SCHEMA` avoids implicit type coercion on plain scalar status names. */
const CONFIG_YAML_LOAD_OPTIONS = Object.freeze({ schema: yaml.JSON_SCHEMA });

/**
 * Parse the ordered `statuses:` list out of `backlog/config.yml`'s raw YAML text. Pure — no
 * filesystem, so tests exercise it directly rather than through a real file. An absent `statuses:`
 * key (or an empty/`null` document, e.g. a freshly-`backlog init`ed project that has not yet touched
 * this key) yields {@link DEFAULT_STATUS_FLOW}, matching contract §3.1's documented default; a
 * `statuses:` key present but not a list of strings is a fail-loud `validation` error rather than a
 * silent guess.
 *
 * @throws LoreError `validation` when the YAML does not parse, is not a mapping, or `statuses:` is
 *   present but not a list of strings.
 */
export function parseStatusFlow(yamlText: string): string[] {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText, CONFIG_YAML_LOAD_OPTIONS);
  } catch (cause) {
    throw configError(`is not valid YAML${reasonSuffix(cause)}`);
  }
  if (parsed === null || parsed === undefined) {
    return [...DEFAULT_STATUS_FLOW]; // an empty document — Backlog's config carries no keys yet
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw configError("must be a YAML mapping");
  }
  const statuses = (parsed as Record<string, unknown>).statuses;
  if (statuses === undefined) {
    return [...DEFAULT_STATUS_FLOW];
  }
  if (!Array.isArray(statuses) || statuses.some((s) => typeof s !== "string")) {
    throw configError("`statuses:` must be a list of strings");
  }
  return statuses as string[];
}

/**
 * Read and parse the project's status flow from `backlog/config.yml` under `root` — the
 * command-layer I/O half of {@link parseStatusFlow}. A missing file yields
 * {@link DEFAULT_STATUS_FLOW} (mirrors `config.ts`'s own missing-file-is-zero-config policy); a
 * permission failure is `denied` (exit 4); any other read failure propagates unclassified (there is
 * no sensible fallback for, say, a directory sitting at the path).
 */
export function readStatusFlow(root: string): string[] {
  const relPath = BACKLOG_CONFIG_REL_PATH;
  let text: string;
  try {
    text = readFileSync(join(root, relPath), "utf8");
  } catch (cause) {
    if (errnoCode(cause) === "ENOENT") {
      return [...DEFAULT_STATUS_FLOW];
    }
    ioError(cause, {
      denied: { message: `cannot read ${relPath}`, hint: "check filesystem permissions on backlog/config.yml" },
      notFound: { message: `cannot read ${relPath}`, hint: "check filesystem permissions on backlog/config.yml" },
      input: { path: relPath },
      rethrowUnknown: true,
    });
  }
  return parseStatusFlow(text);
}

/** Build the fail-loud "malformed backlog/config.yml" error (`validation`, exit 6). */
function configError(reason: string): LoreError {
  return new LoreError(
    "validation",
    `cannot read the project's status flow: ${BACKLOG_CONFIG_REL_PATH} ${reason}`,
    `fix ${BACKLOG_CONFIG_REL_PATH}'s \`statuses:\` key, or remove it to use the default flow`,
    { path: BACKLOG_CONFIG_REL_PATH },
  );
}

/** Append `: <reason>` when a non-empty message can be derived from a thrown cause (mirrors config.ts). */
function reasonSuffix(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.trim() === "" ? "" : `: ${message.trim()}`;
}
