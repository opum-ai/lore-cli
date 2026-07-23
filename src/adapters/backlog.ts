/**
 * adapters/backlog.ts — the **only** place a `backlog` subprocess is spawned (design spec §2.3, §8).
 *
 * This is the Backlog subprocess seam: the second of lore's three injectable determinism seams
 * (the clock and the git history seam are the others; lore-design §8). Everything that shells out to
 * the `backlog` binary flows through the {@link BacklogSpawn} interface here, so unit and golden tests
 * inject a fake that returns fixed output instead of driving a real subprocess.
 *
 * **Scope.** This file ships the capability probe (LORE-4) and the full typed read/write adapter
 * (`task list`/`view`/`search` parsing, status mapping, the `doc:<id>` back-reference — LORE-21).
 * Both target the same contract: upstream's (MrLesk/Backlog.md) independently-shipped `--json`
 * implementation (PR #790, BACK-545), adopted in place of upstreaming the jeremy-newhouse/Backlog.md
 * fork this file originally shipped against (LORE-5). The migration ran in two steps — LORE-53
 * migrated the probe alone (`probeBacklog`), LORE-54 migrated the rest (`EnvelopeSchema`,
 * `parseEnvelope`, and the typed read functions) — so the probe and the full adapter were briefly on
 * two different contracts; both now target upstream's real, per-command envelope shape: numeric
 * `schemaVersion: 1`, hyphenated `kind` (`"task-list"` / `"task-view"` / `"search"`), and a
 * per-command payload key (`tasks` / `task` / `results`), not a shared `data` key.
 *
 * Normative contract: docs/reference/backlog-cli-contract.md §5 (capability probe) and
 * docs/reference/backlog-json-schema.md (the schema of record, §1–§7 now describing upstream's shape
 * directly).
 *
 * This file also reads the project's ordered status flow directly from `backlog/config.yml`'s own
 * `statuses:` key (LORE-26) — plain repo-committed YAML, not a `--json` envelope, so it is a direct
 * file read rather than a spawn; see {@link readStatusFlow} at the bottom of this file.
 */

import { join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { deriveMessage, errnoCode, LoreError, readFileIfPresent, stderrHint } from "../errors";

/**
 * The **binary version floor** the probe requires (`backlog --version`, contract §5 step 3). A sanity
 * floor only — it does not by itself distinguish a `--json`-capable binary from plain stock, since a
 * pre-`--json` stock release can still report a version at or above this floor. The `--json` envelope
 * parse (step 3 below) is the real discriminator — a binary without `--json` support rejects the option
 * and exits non-zero.
 */
export const MIN_BACKLOG_VERSION = "1.47.1";

/**
 * The `schemaVersion` every `--json` envelope carries — upstream's real envelope, a **number**
 * (`1`), shared by the capability probe and the full read adapter now that both target the same
 * contract (LORE-53 migrated the probe alone first; LORE-54 migrated the rest and retired the
 * probe-only `PROBE_SCHEMA_VERSION` split).
 */
export const EXPECTED_SCHEMA_VERSION = 1;

/** The `kind` a `backlog task list --json` envelope carries. Shared by the probe and `listTasks`. */
const TASK_LIST_KIND = "task-list";
/** The `kind` a `backlog task view <id> --json` (or bare `task <id> --json`) envelope carries. */
const TASK_VIEW_KIND = "task-view";
/** The `kind` a `backlog search --json` envelope carries. */
const SEARCH_KIND = "search";

/** The default binary name resolved from PATH. */
const BACKLOG_BINARY = "backlog";

/**
 * The environment variable an operator overrides {@link DEFAULT_BACKLOG_TIMEOUT_MS} with (LORE-217
 * AC #2). Exported so a test can target the exact name {@link bunBacklogSpawn} reads rather than
 * duplicating the string literal.
 */
export const BACKLOG_TIMEOUT_ENV_VAR = "LORE_BACKLOG_TIMEOUT_MS";

/**
 * The default wall-clock bound, in milliseconds, on one real `backlog` subprocess invocation
 * (LORE-217 AC #2) — generous enough that a legitimately slow `backlog task list --json` on a large
 * project never trips it in normal use, while still recovering a wedged/non-terminating process
 * well within a human agent's patience rather than hanging lore forever.
 */
export const DEFAULT_BACKLOG_TIMEOUT_MS = 30_000;

/**
 * Resolve the timeout bound {@link bunBacklogSpawn} enforces, re-read from
 * {@link BACKLOG_TIMEOUT_ENV_VAR} on every call (not cached at import time) so an operator — or a
 * test — can change it between invocations. Unset, blank, non-numeric, or non-positive falls back to
 * {@link DEFAULT_BACKLOG_TIMEOUT_MS} rather than silently disabling the guard.
 */
function resolveBacklogTimeoutMs(): number {
  const raw = process.env[BACKLOG_TIMEOUT_ENV_VAR];
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_BACKLOG_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BACKLOG_TIMEOUT_MS;
}

/**
 * Build the fail-loud "the real `backlog` subprocess did not exit in time" error (`validation`, exit
 * 6) — LORE-217 AC #1. Mirrors the wording style of this file's other environment-diagnosis errors
 * ({@link notJsonCapable}, `configError`): a single-line message plus an actionable hint naming the
 * override knob.
 */
function timeoutError(binary: string, args: readonly string[], timeoutMs: number): LoreError {
  return new LoreError(
    "validation",
    `\`${binary} ${args.join(" ")}\` did not exit within ${timeoutMs}ms and was killed`,
    `the \`backlog\` process appears wedged; if this is a legitimately slow invocation, raise ${BACKLOG_TIMEOUT_ENV_VAR} (currently ${timeoutMs}ms) — otherwise investigate why \`${binary}\` hung`,
    { binary, args: [...args], timeoutMs },
  );
}

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
 * spawned at all (e.g. `ENOENT`) — a process that ran and failed resolves with a non-zero `exitCode`.
 * The one further rejection case is specific to the real {@link bunBacklogSpawn} implementation, not
 * this contract in general: a subprocess that runs but does not exit within the operator-overridable
 * wall-clock bound (LORE-217) is killed and rejects with a typed {@link LoreError} instead of hanging
 * — fakes are free to ignore this case entirely, since they never spawn a real process.
 */
export type BacklogSpawn = (args: readonly string[]) => Promise<SpawnResult>;

/** What the probe learned about the `backlog` binary once it passes — cached by the caller (§5). */
export interface BacklogCapability {
  /** The `major.minor.patch` the binary reported (extra pre-release/build metadata dropped). */
  readonly version: string;
  /** The `schemaVersion` its `--json` envelope carried (always {@link EXPECTED_SCHEMA_VERSION} today). */
  readonly schemaVersion: number;
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
  "lore needs a --json-capable Backlog.md. Build MrLesk/Backlog.md pinned at or past commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 (PR #790; no tagged release contains it yet) per docs/runbooks/backlog-json-patch.md and put its `backlog` binary on PATH.";

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
 * 3. `backlog task list --json` — a non-zero exit (a binary without `--json` rejects the unknown
 *    option), unparseable stdout, the wrong `kind`, a non-array `tasks`, or an unrecognized
 *    `schemaVersion` are all fail-loud "not --json-capable" (exit 6). This step, not the version, is
 *    what proves `--json` support.
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

  // Step 2 — version floor. Below the tested floor is fail-loud; note a pre-`--json` stock release can
  // still pass this check, so passing here does NOT yet prove --json — step 3 does.
  const floor = parseSemver(MIN_BACKLOG_VERSION);
  if (floor && compareSemver(version, floor) < 0) {
    notJsonCapable(`version ${version.raw} is below the ${MIN_BACKLOG_VERSION} floor`, {
      version: version.raw,
      floor: MIN_BACKLOG_VERSION,
    });
  }

  // Step 3 — the dry `task list --json` probe. THIS is the real discriminator: a binary without --json
  // support has no such option, so Commander exits non-zero here. A --json-capable binary emits one
  // parseable envelope in upstream's shape (backlog-json-schema.md §8): {schemaVersion: 1, kind:
  // "task-list", tasks: [...]}.
  const listResult = await spawn(["task", "list", "--json"]);
  if (listResult.exitCode !== 0) {
    notJsonCapable("`task list --json` exited non-zero (binary does not support --json)", {
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
  const { schemaVersion, kind, tasks } = envelope as { schemaVersion?: unknown; kind?: unknown; tasks?: unknown };
  if (kind !== TASK_LIST_KIND) {
    notJsonCapable(`envelope kind was ${JSON.stringify(kind)}, expected ${JSON.stringify(TASK_LIST_KIND)}`);
  }
  if (!Array.isArray(tasks)) {
    notJsonCapable("envelope `tasks` was not an array");
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
 *
 * **Wall-clock bound (LORE-217).** Every lore coupling command (link/unlink/rename/sync/reconcile)
 * ultimately flows through this seam, so a `backlog` invocation that wedges — never printing on
 * either stream and never exiting — would otherwise leave lore blocked forever with no diagnostic.
 * A timer armed for {@link resolveBacklogTimeoutMs}'s bound kills the process (`SIGKILL`, so a
 * process ignoring `SIGTERM` still terminates) and the call rejects with a typed
 * {@link LoreError} ({@link timeoutError}) instead of awaiting `proc.exited` indefinitely. The
 * buffered-stream `Promise.all` is otherwise unchanged — a normal exit within the bound clears the
 * timer and resolves exactly as before.
 */
export function bunBacklogSpawn(binary: string = BACKLOG_BINARY, cwd?: string): BacklogSpawn {
  return async (args: readonly string[]): Promise<SpawnResult> => {
    const timeoutMs = resolveBacklogTimeoutMs();
    const proc = Bun.spawn([binary, ...args], { stdout: "pipe", stderr: "pipe", cwd });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // SIGKILL, not the default SIGTERM: a wedged process may be ignoring or unable to act on
      // SIGTERM (the very reason it never exited on its own), so only an unmaskable signal
      // guarantees `proc.exited` below actually resolves instead of also hanging past the bound.
      proc.kill("SIGKILL");
    }, timeoutMs);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (timedOut) {
        throw timeoutError(binary, args, timeoutMs);
      }
      return { exitCode, stdout, stderr };
    } finally {
      // Always disarm: on the normal-exit path this prevents a stray kill() firing after the
      // process (and possibly its pid, reused by the OS) has already exited.
      clearTimeout(timer);
    }
  };
}

// ── The `--json` contract mirror (schema of record) ────────────────────────────────
//
// A Zod encoding of docs/reference/backlog-json-schema.md §1–§5 — the schema of record for what
// upstream's `--json` emits (CLI-INSTRUCTIONS.md "Stable JSON output", src/formatters/json-output.ts).
// Every read validates its envelope's payload against the matching shape here: unknown *extra* keys
// are tolerated (`z.looseObject`, the additive-only contract — "Version 1 may gain backward-compatible
// fields"), missing required keys are rejected. This is the runtime authority the doc describes (§7
// step 4); the golden test (`test/backlog-json-golden.test.ts`) re-imports these same schemas via
// `test/support/backlog-golden.ts` so the committed fixtures and the adapter can never validate against
// two different contracts.

/**
 * `priority` and `type` are both open, config-driven labels upstream (CLI-INSTRUCTIONS.md: priority
 * comes from `backlog/config.yml`'s `priorities:`; `type` from its `types:`) — not the fork's closed
 * `"high"|"medium"|"low"` enum. A free string or null.
 */
const OpenLabel = z.string().nullable();

/** An acceptance-criterion / definition-of-done item; `index` is positional and NON-durable (§6). */
const Criterion = z.looseObject({
  index: z.number(),
  text: z.string(),
  checked: z.boolean(),
});

/** A task comment; `author` may be null. Field names match upstream's wire shape (`body`, `createdAt`). */
const Comment = z.looseObject({
  index: z.number(),
  body: z.string(),
  createdAt: z.string().nullable(),
  author: z.string().nullable(),
});

/**
 * `kind: "task-list"` entry / a `search` task hit's payload — the compact summary fields
 * (CLI-INSTRUCTIONS.md: "Task list and task search results use these compact fields"). Upstream's
 * summary carries **no path** — only `task view` does (§4; contract §1.2) — so `file` on lore's mapped
 * {@link BacklogTask} comes exclusively from {@link TaskSchema} via {@link mapTask}.
 */
export const TaskSummarySchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  type: OpenLabel,
  priority: OpenLabel,
  assignees: z.array(z.string()),
  reporter: z.string().nullable(),
  labels: z.array(z.string()),
  milestone: z.string().nullable(),
  parentTaskId: z.string().nullable(),
  ordinal: z.number().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

/**
 * `kind: "task-view"` — the full task object (§3), the richest shape. `looseObject` tolerates unknown
 * additive keys. Excludes internal/git fields the fork used to carry (`source`, `branch`,
 * `onStatusChange`) — upstream deliberately does not expose them (CLI-INSTRUCTIONS.md: "branch
 * metadata... are not exposed").
 */
export const TaskSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  type: OpenLabel,
  priority: OpenLabel,
  assignees: z.array(z.string()),
  reporter: z.string().nullable(),
  labels: z.array(z.string()),
  milestone: z.string().nullable(),
  parentTaskId: z.string().nullable(),
  ordinal: z.number().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  path: z.string().nullable(),
  description: z.string().nullable(),
  dependencies: z.array(z.string()),
  references: z.array(z.string()),
  documentation: z.array(z.string()),
  modifiedFiles: z.array(z.string()),
  subtasks: z.array(z.looseObject({ id: z.string(), title: z.string() })),
  acceptanceCriteria: z.array(Criterion),
  definitionOfDone: z.array(Criterion),
  implementationPlan: z.string().nullable(),
  implementationNotes: z.string().nullable(),
  comments: z.array(Comment),
  finalSummary: z.string().nullable(),
});

/**
 * One search hit (§5): a `type`-tagged wrapper around the matched `data`. Upstream drops `score`
 * entirely ("Search scores are not part of the version 1 public contract") — no fork-shaped `item`/
 * `score` keys survive. `data`'s shape depends on `type`; `lore` only consumes task hits, which match
 * {@link TaskSummarySchema}; document/decision hits are Backlog-owned and only shape-checked loosely.
 */
export const SearchHitSchema = z.looseObject({
  type: z.enum(["task", "document", "decision"]),
  data: z.looseObject({}),
});

/** The per-`kind` envelope (§1): one object, numeric `schemaVersion`, hyphenated `kind`, a per-command payload key. */
export const EnvelopeSchema = z.discriminatedUnion("kind", [
  z.looseObject({
    schemaVersion: z.literal(EXPECTED_SCHEMA_VERSION),
    kind: z.literal(TASK_VIEW_KIND),
    task: TaskSchema,
  }),
  z.looseObject({
    schemaVersion: z.literal(EXPECTED_SCHEMA_VERSION),
    kind: z.literal(TASK_LIST_KIND),
    tasks: z.array(TaskSummarySchema),
  }),
  z.looseObject({
    schemaVersion: z.literal(EXPECTED_SCHEMA_VERSION),
    kind: z.literal(SEARCH_KIND),
    results: z.array(SearchHitSchema),
  }),
]);

/** The three envelope kinds a `--json` command can carry, in upstream's hyphenated spelling. */
export type EnvelopeKind = typeof TASK_LIST_KIND | typeof TASK_VIEW_KIND | typeof SEARCH_KIND;

// ── lore's internal task model (the mapped read surface) ────────────────────────────
//
// The adapter maps the validated `--json` payload into these types before any coupling command sees
// it. The mapping bakes in the load-bearing caveats from backlog-json-schema.md §6 so a caller cannot
// get them wrong: `file` is the project-relative `path` upstream's `task view` carries — `task list`/
// `search` summaries carry no path at all (§4; contract §1.2), so {@link BacklogTask} has no `file`
// field and only {@link BacklogTaskDetail} (the `task view` shape) does — and AC/DoD items drop their
// NON-durable positional `index` so callers must match on `text`. `id` is kept verbatim as identity
// (display-cased); a filename is never derived from it.

/** Task priority (or task `type`), mirroring the JSON's open, config-driven label — a free string or null. */
export type BacklogPriority = string | null;

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
  readonly createdAt: string | null;
  readonly body: string;
}

/**
 * The **summary** of a task — the stable subset `task list` and `search` surface. Enough to render a
 * listing and reconcile status without a per-task `view`. Carries no file path (§4; contract §1.2) —
 * only {@link BacklogTaskDetail} (`task view`) does. `labels` includes any `doc:<conceptId>`
 * back-reference.
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
  /** Includes the `doc:<conceptId>` back-reference label lore reads for coupling. */
  readonly labels: readonly string[];
  readonly milestone: string | null;
  readonly parentTaskId: string | null;
}

/**
 * The **full** task (output of `backlog task view <id> --json`, `kind: "task-view"`), extending
 * {@link BacklogTask} with the fields only the per-id view carries: the project-relative {@link file}
 * path, dependencies, the doc/ref arrays, the structured body sections, and comments. Upstream does not
 * expose `source`/`branch`/`onStatusChange` (internal/git fields the fork used to carry) or a
 * `parentTaskTitle`.
 */
export interface BacklogTaskDetail extends BacklogTask {
  /** Project-relative (`backlog/tasks/…`) or `null` on a not-yet-written task; upstream carries no absolute path. */
  readonly file: string | null;
  readonly reporter: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly dependencies: readonly string[];
  readonly references: readonly string[];
  readonly documentation: readonly string[];
  readonly modifiedFiles: readonly string[];
  readonly subtasks: readonly { readonly id: string; readonly title: string }[];
  readonly acceptanceCriteria: readonly BacklogCriterion[];
  readonly definitionOfDone: readonly BacklogCriterion[];
  readonly description: string | null;
  readonly implementationPlan: string | null;
  readonly implementationNotes: string | null;
  readonly finalSummary: string | null;
  readonly comments: readonly BacklogComment[];
}

/** Map a validated `task-list`/`search` summary item into lore's {@link BacklogTask}. */
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
  };
}

/** Strip the non-durable `index` from AC/DoD items (§6): callers match on text, never position. */
function mapCriteria(items: readonly z.infer<typeof Criterion>[]): BacklogCriterion[] {
  return items.map((c) => ({ text: c.text, checked: c.checked }));
}

/** Map a validated `task-view` payload into lore's {@link BacklogTaskDetail} (full per-id view). */
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
    file: data.path,
    reporter: data.reporter,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    dependencies: data.dependencies,
    references: data.references,
    documentation: data.documentation,
    modifiedFiles: data.modifiedFiles,
    subtasks: data.subtasks,
    acceptanceCriteria: mapCriteria(data.acceptanceCriteria),
    definitionOfDone: mapCriteria(data.definitionOfDone),
    description: data.description,
    implementationPlan: data.implementationPlan,
    implementationNotes: data.implementationNotes,
    finalSummary: data.finalSummary,
    comments: data.comments.map((c) => ({ author: c.author, createdAt: c.createdAt, body: c.body })),
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
 * and return the validated payload found at `payloadKey` — upstream's envelope has **no shared `data`
 * key**; each command names its own (`tasks` / `task` / `results`). Staged like the probe so each
 * failure names its cause: parseable JSON → an envelope object → the pinned `schemaVersion` → the
 * expected `kind` → the per-kind payload shape (Zod). Every step failing is {@link readDrift} (exit 6)
 * — never a silent degrade.
 */
function parseEnvelope<S extends z.ZodType>(
  stdout: string,
  expectedKind: EnvelopeKind,
  payloadKey: "tasks" | "task" | "results",
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
  const envelope = parsed as Record<string, unknown>;
  const { schemaVersion, kind } = envelope as { schemaVersion?: unknown; kind?: unknown };
  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    readDrift(
      `\`${command}\` envelope schemaVersion was ${JSON.stringify(schemaVersion)} (this lore understands ${JSON.stringify(EXPECTED_SCHEMA_VERSION)})`,
      { schemaVersion },
    );
  }
  if (kind !== expectedKind) {
    readDrift(`\`${command}\` envelope kind was ${JSON.stringify(kind)}, expected ${JSON.stringify(expectedKind)}`);
  }
  const result = dataSchema.safeParse(envelope[payloadKey]);
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

/** The `tasks` schema for a `task-list` envelope: an array of summaries. */
const TaskListData = z.array(TaskSummarySchema);
/** The `results` schema for a `search` envelope: an array of scored hits. */
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
  /** `task view <id> --json` → the full task, or `null` when the id has no task (exit code 1). */
  viewTask(id: string): Promise<BacklogTaskDetail | null>;
  /** `task list --json --labels <label>` → tasks carrying an exact label (e.g. a `doc:<conceptId>` back-ref). */
  searchByLabel(label: string): Promise<BacklogTask[]>;
  /** `search <query> --json` → the **task** hits only (document/decision hits are dropped, §5). */
  searchTasks(query: string): Promise<BacklogTask[]>;
  /** `task create` (no `--plain`/`--json`) → the new display-cased id, captured from `Created task <ID>`. */
  createTask(input: CreateTaskInput): Promise<string>;
  /** `task edit <id>` (no `--json` — unsupported, LORE-57) with an incremental patch; fail-loud on a missing task or a non-zero exit. */
  editTask(id: string, patch: EditTaskPatch): Promise<void>;
}

/** Captures the display-cased id from a create's first stdout line (`Created task LORE-1` / `Created draft …`). */
const CREATED_ID = /^Created (?:task|draft) (\S+)$/m;

/**
 * Reject a caller-controlled value that begins with `-` before it reaches a `spawn` argv position.
 * Backlog's own CLI parses argv positionally: an id, title, label, status, milestone, description, doc
 * ref, or search query beginning with `-` is read by Backlog's flag parser as an option rather than the
 * literal data lore intends — with no `--` option-terminator inserted at each call site (several push a
 * real flag like `--json` immediately after the data position, which a terminator would itself swallow),
 * a dash-prefixed value could alter or hijack the invoked Backlog command. There is no per-value escape
 * for this (Backlog looks only at the leading character), so — matching {@link commaJoin}'s existing
 * policy for an unescapable embedded comma — a dash-prefixed value is rejected outright rather than risking
 * misinterpretation.
 */
function rejectFlagLike(value: string): string {
  if (value.startsWith("-")) {
    throw new LoreError(
      "validation",
      `cannot send "${value}" to Backlog: a value beginning with "-" would be parsed as a flag, not literal data`,
      "rename the value so it does not begin with '-'",
      { value },
    );
  }
  return value;
}

/**
 * Join multiple values for a single-value, last-wins flag into one comma-separated argument (§2.4).
 * Backlog's CLI has no escape for an embedded comma — the comma **is** the delimiter — so a value
 * containing one cannot be sent safely: it would silently split into two (or more) unrelated
 * Backlog-side values instead of the one lore intends. Reject it instead. Each value is also run
 * through {@link rejectFlagLike} — the comma-join happens after the flag itself (e.g. `--labels`), but a
 * leading `-` on any individual label is still ambiguous flag-like data, so it is rejected the same way.
 */
function commaJoin(values: readonly string[]): string {
  for (const value of values) {
    rejectFlagLike(value);
  }
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
        args.push("--status", rejectFlagLike(opts.status));
      }
      if (opts?.labels !== undefined && opts.labels.length > 0) {
        args.push("--labels", commaJoin(opts.labels));
      }
      const result = await read(args, "task list --json");
      return parseEnvelope(result.stdout, TASK_LIST_KIND, "tasks", TaskListData, "task list --json").map(mapSummary);
    },

    async viewTask(id: string): Promise<BacklogTaskDetail | null> {
      await ensureProbed();
      const result = await spawn(["task", "view", rejectFlagLike(id), "--json"]);
      // A missing task exits 1 unconditionally, in every output mode (upstream, PR #790; contract
      // §2.2's migration note) — the fork's old "exit 0, empty stdout" signal no longer applies. Any
      // other nonzero exit, or a 1 that unexpectedly printed something, is a fail-loud drift. This is
      // why `viewTask` cannot share the `read` helper's exit-code guard (it treats every nonzero as
      // fatal).
      if (result.exitCode === 1) {
        if (result.stdout.trim() !== "") {
          readDrift("`task view --json` exited 1 (the missing-task signal) but printed something to stdout", {
            id,
          });
        }
        return null;
      }
      if (result.exitCode !== 0) {
        readDrift(`\`task view --json\` exited ${result.exitCode}`, { exitCode: result.exitCode, id });
      }
      return mapTask(parseEnvelope(result.stdout, TASK_VIEW_KIND, "task", TaskSchema, "task view --json"));
    },

    async searchByLabel(label: string): Promise<BacklogTask[]> {
      return this.listTasks({ labels: [label] });
    },

    async searchTasks(query: string): Promise<BacklogTask[]> {
      const result = await read(["search", rejectFlagLike(query), "--json"], "search --json");
      const hits = parseEnvelope(result.stdout, SEARCH_KIND, "results", SearchResultData, "search --json");
      // lore consumes only task hits (§5); document/decision hits are Backlog-owned. Re-validate each
      // task hit's loosely-typed `data` against the summary contract before mapping.
      const tasks: BacklogTask[] = [];
      for (const hit of hits) {
        if (hit.type !== "task") {
          continue;
        }
        const item = TaskSummarySchema.safeParse(hit.data);
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
      const args = ["task", "create", rejectFlagLike(input.title)];
      if (input.description !== undefined) {
        args.push("--description", rejectFlagLike(input.description));
      }
      if (input.labels !== undefined && input.labels.length > 0) {
        args.push("--labels", commaJoin(input.labels));
      }
      if (input.milestone !== undefined) {
        args.push("--milestone", rejectFlagLike(input.milestone));
      }
      for (const doc of input.doc ?? []) {
        args.push("--doc", rejectFlagLike(doc)); // --doc is an accumulator (§2.4): repeat, don't comma-join.
      }
      const result = await spawn(args);
      if (result.exitCode !== 0) {
        throw new LoreError(
          "validation",
          `\`backlog task create\` exited ${result.exitCode}`,
          stderrHint(result.stderr),
          {
            exitCode: result.exitCode,
          },
        );
      }
      const newId = CREATED_ID.exec(result.stdout)?.[1];
      if (newId === undefined) {
        // `task create` already exited 0 — Backlog genuinely created the task — so failing loud with
        // no context would leave it orphaned and unreferenceable: the caller has no id to look it up
        // by. Echo the raw stdout (and the title Backlog was given) in the error's `input` so a caller
        // can still recover the new task, e.g. via `backlog task list --search "<title>"`.
        readDrift("`task create` exited 0 but did not print a `Created task <ID>` line to capture the new id", {
          title: input.title,
          stdout: result.stdout,
        });
      }
      return newId;
    },

    async editTask(id: string, patch: EditTaskPatch): Promise<void> {
      await ensureProbed();
      const args = ["task", "edit", rejectFlagLike(id)];
      if (patch.addLabels !== undefined && patch.addLabels.length > 0) {
        args.push("--add-label", commaJoin(patch.addLabels)); // single-value flag (§2.4): comma-join.
      }
      if (patch.removeLabels !== undefined && patch.removeLabels.length > 0) {
        args.push("--remove-label", commaJoin(patch.removeLabels));
      }
      if (patch.status !== undefined) {
        args.push("--status", rejectFlagLike(patch.status));
      }
      for (const doc of patch.doc ?? []) {
        args.push("--doc", rejectFlagLike(doc)); // accumulator, SET/REPLACE the whole array (§2.4).
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
          stderrHint(result.stderr),
          { id, exitCode: result.exitCode },
        );
      }
    },
  };
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
 * command-layer I/O half of {@link parseStatusFlow}, via `errors.ts`'s shared
 * {@link readFileIfPresent} (adapters cannot import `commands/discover.ts`, which owns the
 * analogous `readSource`). A missing file yields {@link DEFAULT_STATUS_FLOW} (mirrors `config.ts`'s
 * own missing-file-is-zero-config policy); a permission failure is `denied` (exit 4); any other read
 * failure propagates unclassified (there is no sensible fallback for, say, a directory sitting at
 * the path).
 */
export function readStatusFlow(root: string): string[] {
  const relPath = BACKLOG_CONFIG_REL_PATH;
  const text = readFileIfPresent(join(root, relPath), relPath);
  return text === undefined ? [...DEFAULT_STATUS_FLOW] : parseStatusFlow(text);
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

/**
 * Append `: <reason>` when a non-empty message can be derived from a thrown cause, via the shared,
 * guarded {@link deriveMessage} — not a hand-rolled `instanceof Error` check, which would lose the
 * reason (or itself throw) for a non-`Error` cause carrying its own `.message`, or one with a
 * hostile `toString`/`Symbol.toPrimitive`.
 */
function reasonSuffix(cause: unknown): string {
  const message = deriveMessage(cause).trim();
  return message === "" ? "" : `: ${message}`;
}
