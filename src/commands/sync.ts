/**
 * commands/sync.ts — `lore sync [paths…] [--dry-run] [--no-index]` (LORE-26, cli-surface §sync).
 *
 * The **write** counterpart to `lore check`. For every concept linking Backlog tasks via its
 * `tasks:` frontmatter: resolves each linked task's live status (`BacklogAdapter.viewTask`),
 * recomputes the concept's `status` (`core/reconcile.ts`, honoring `[reconcile.overrides]`) and
 * rewrites it when it changed, and regenerates the `<!-- lore:tasks -->` managed region
 * (`core/managed-block.ts`) from the same live data. Then — unless `--no-index` — regenerates every
 * bundle `index.md` (`core/indexes.ts`) and the git-history-derived `log.md` (`core/log.ts`, via the
 * real `git log`-shelling adapter in `adapters/git.ts`). Every write is a byte-diff against the
 * current on-disk content first, so a clean tree is a true no-op (AC#1) — and, unless `--dry-run`,
 * each changed file is written atomically ({@link writeFileAtomic}), since this is the one command
 * that can write many files in a single invocation.
 *
 * **A linked task id that no longer resolves aborts the whole run before any write** (`not_found`,
 * exit 3) — every linked task, across every scoped concept, is resolved up front, mirroring
 * `commands/link.ts`'s "validate before write" precedent: a doc's `status` and managed block must
 * never be computed from a partially-resolved task set.
 *
 * **`lore` is the sole committer of `backlog/`** (ADR-0012, design §2.4): after its own `docs/`
 * writes, `sync` calls `state.ts`'s {@link commitBacklogIfDirty} to commit whatever is currently
 * uncommitted under `backlog/` — from an earlier `link`/`unlink`/`rename`, or a human's direct
 * `backlog task edit` — in one `lore`-authored commit. This is independent of whether `sync` itself
 * changed anything in `docs/`, and (like every write here) is skipped entirely under `--dry-run`.
 * `link`/`unlink`/`rename` do not yet call `state.ts` themselves (LORE-49 follow-up) — `sync` is what
 * satisfies AC#2 for now, by picking up whatever is sitting dirty regardless of source.
 *
 * A concept with `tasks:` but no managed-block markers is a fail-loud `validation` error
 * (`core/managed-block.ts`'s own contract, ADR-0008) — `sync` never guesses or writes a partial
 * block. A concept with no `tasks:` at all is never touched, and (mirroring `rename.ts`) no
 * {@link BacklogAdapter} is even constructed unless at least one scoped concept links a task.
 */

import { dirname, join, posix } from "node:path";
import { type BacklogAdapter, type BacklogTaskDetail, readStatusFlow } from "../adapters/backlog";
import { realGitAdapter, resolveHeadSha } from "../adapters/git";
import { loadConfig } from "../config";
import { type BundleGraph, loadBundle, toRefList } from "../core/bundle";
import { type Concept, idFromPath, serializeConcept } from "../core/concept";
import { generateIndexes } from "../core/indexes";
import { buildLog, type GitAdapter, generateLog } from "../core/log";
import { type ManagedTaskRow, regenerateTaskBlock } from "../core/managed-block";
import { loadProfile } from "../core/profile";
import { reconcileStatus } from "../core/reconcile";
import { DOCS_DIR, RESERVED_STEMS } from "../core/scaffold";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { type BacklogCommitResult, bunGitSpawn, commitBacklogIfDirty, type GitSpawn } from "../state";
import { parseCommandArgs } from "./args";
import { readIfExists, readIndexBytes, readSource } from "./discover";
import { ensureDir, writeFileAtomic } from "./fswrite";
import { dedupeTaskIds, defaultAdapter } from "./link";

/** The reserved log file name, excluded from concept scanning (mirrors `rename.ts`'s index handling). */
const LOG_FILE = "log.md";

/** Options for {@link runSync}; `root`, the streams, and the adapters/seams are injectable for tests. */
export interface SyncOptions {
  /** The repo root the `docs/` bundle (and `backlog/`) resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `sync`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for bundle-load advisories; defaults to `process.stderr`. */
  stderr?: Writer;
  /** The Backlog adapter; defaults to the real `backlog` binary on PATH. Only constructed when at least one scoped concept links a task. */
  adapter?: BacklogAdapter;
  /** The git-history adapter (`core/log.ts`) for `log.md`; defaults to the real `git log`-shelling adapter. */
  gitAdapter?: GitAdapter;
  /** Resolves `HEAD` to a sha (or `null` with no commits yet); defaults to the real `git rev-parse HEAD`. */
  resolveHead?: (root: string) => string | null;
  /** The git-write seam (`state.ts`) for committing `backlog/`; defaults to the real `git` binary. */
  gitSpawn?: GitSpawn;
}

/** The parsed form of `lore sync`'s arguments. */
interface SyncArgs {
  /** Concept ids/paths to scope reconciliation + managed-block regen to; empty means every concept. Index/log regeneration is always whole-bundle. */
  paths: string[];
  /** `--dry-run`: report what would change, write nothing (docs/ or backlog/). */
  dryRun: boolean;
  /** `--no-index`: skip both index.md and log.md regeneration. */
  noIndex: boolean;
}

/** One written (or, under `--dry-run`, would-be-written) file, for the report. */
interface ChangedFile {
  /** Repo-relative POSIX path of the file. */
  readonly path: string;
}

/** The `sync.result` payload. */
export interface SyncReport {
  /** Every `docs/` file that changed (or would change), ascending. */
  readonly files: readonly ChangedFile[];
  /** How many files changed (== `files.length`). */
  readonly filesChanged: number;
  /** The `backlog/` commit outcome — always `{committed: false, files: []}` under `--dry-run`. */
  readonly backlogCommit: BacklogCommitResult;
  /** Whether this was a `--dry-run` (nothing was written). */
  readonly dryRun: boolean;
}

/**
 * Run `lore sync`: reconcile every scoped concept's `status` and managed task block from live
 * Backlog data, regenerate `index.md`/`log.md` (unless `--no-index`), write every changed file
 * (unless `--dry-run`), commit any dirty `backlog/` changes, emit the `sync.result`, and return the
 * exit code.
 *
 * @returns `0` on success (a fully clean tree is still `0` — idempotent). Throws (never returns) a
 *   `not_found` {@link LoreError} (exit `3`) when a linked task id no longer exists, or `validation`/
 *   `drift` (exit `6`) when reconciliation, the managed block, or the `backlog/` commit fails.
 */
export async function runSync(options: SyncOptions): Promise<number> {
  const parsed = parseSyncArgs(options.args);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const scoped = scopeConcepts(graph, parsed.paths);
  const linkedByConceptId = new Map<string, string[]>();
  for (const concept of scoped) {
    // A reserved-stem concept (index/log) is never eligible for task reconciliation, even if its
    // frontmatter happens to carry a `tasks:` list (tolerated by schema validation as an unknown
    // extra key, at most a warning): index.md/log.md are regenerated wholesale by
    // regenerateIndexAndLog below, keyed by the SAME bundle-relative path — a reconciled write here
    // would only be silently overwritten by that regeneration, never reach disk. Mirrors
    // `assertNotReservedStem`'s policy in `link`/`rename`/`supersede`.
    if (RESERVED_STEMS.has(posix.basename(concept.id))) {
      continue;
    }
    const linked = dedupeTaskIds(toRefList(concept.frontmatter.tasks));
    if (linked.length > 0) {
      linkedByConceptId.set(concept.id, linked);
    }
  }

  const writes = new Map<string, string>(); // bundle-relative path -> new bytes

  if (linkedByConceptId.size > 0) {
    // Fast, local, and can throw a `validation` config error: read these BEFORE spending any
    // Backlog subprocess round-trip, so a broken backlog/config.yml or .lore/config.toml is
    // reported immediately rather than being masked behind (and paid for after) N task resolutions.
    const flow = readStatusFlow(options.root);
    const config = loadConfig({ root: options.root });
    const profile = loadProfile({ root: options.root });

    const adapter = options.adapter ?? defaultAdapter(options.root);
    const allTaskIds = dedupeTaskIds([...linkedByConceptId.values()].flat());
    const details = await resolveAllTasks(adapter, allTaskIds);

    for (const concept of scoped) {
      const linked = linkedByConceptId.get(concept.id);
      if (linked === undefined) {
        continue;
      }
      const detailList = linked.map((id) => details.get(id.toLowerCase()) as BacklogTaskDetail);
      const newStatus = reconcileStatus(
        detailList.map((d) => d.status),
        flow,
        config.reconcile.overrides,
      );

      const docPath = `${DOCS_DIR}/${concept.path}`;
      const original = readSource(join(docsRoot, concept.path), docPath);
      const statusChanged = newStatus !== null && newStatus !== concept.frontmatter.status;
      const base = statusChanged
        ? serializeConcept({ ...concept, frontmatter: { ...concept.frontmatter, status: newStatus } }, { profile })
        : original;

      const rows: ManagedTaskRow[] = detailList.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        file: d.file,
      }));
      const final = regenerateTaskBlock(base, rows, { docPath });

      if (final !== original) {
        writes.set(concept.path, final);
      }
    }
  }

  if (!parsed.noIndex) {
    regenerateIndexAndLog(options, docsRoot, graph, writes);
  }

  if (!parsed.dryRun) {
    for (const [path, bytes] of writes) {
      const abs = join(docsRoot, path);
      ensureDir(dirname(abs), `${DOCS_DIR}/${path}`);
      writeFileAtomic(abs, bytes, `${DOCS_DIR}/${path}`);
    }
  }

  let backlogCommit: BacklogCommitResult = { committed: false, files: [] };
  if (!parsed.dryRun) {
    const gitSpawn = options.gitSpawn ?? bunGitSpawn(options.root);
    backlogCommit = await commitBacklogIfDirty(gitSpawn);
  }

  const files = [...writes.keys()].sort().map((path) => ({ path: `${DOCS_DIR}/${path}` }));
  const report: SyncReport = { files, filesChanged: files.length, backlogCommit, dryRun: parsed.dryRun };
  emit(reportRenderable(report), options.output, options.stdout);
  return EXIT_OK;
}

// ── Index + log regeneration ────────────────────────────────────────────────────

/**
 * Regenerate every `index.md` and `log.md`, adding an entry to `writes` for each one whose bytes
 * actually changed. Always whole-bundle, regardless of `[paths…]` scoping — both are inherently
 * global artifacts (a hub lists its whole directory; the log is derived from all of git history).
 */
function regenerateIndexAndLog(
  options: SyncOptions,
  docsRoot: string,
  graph: BundleGraph,
  writes: Map<string, string>,
): void {
  const diskIndexBytes = readIndexBytes(docsRoot);
  const regeneratedIndexes = generateIndexes(graph, { existing: diskIndexBytes });
  for (const [path, bytes] of regeneratedIndexes) {
    if (bytes !== diskIndexBytes.get(path)) {
      writes.set(path, bytes);
    }
  }

  const resolveHead = options.resolveHead ?? resolveHeadSha;
  const headSha = resolveHead(options.root);
  const logBytes =
    headSha === null
      ? generateLog([], { root: DOCS_DIR })
      : buildLog(options.gitAdapter ?? realGitAdapter(options.root), { to: headSha }, { root: DOCS_DIR });
  const existingLog = readIfExists(join(docsRoot, LOG_FILE), `${DOCS_DIR}/${LOG_FILE}`);
  if (logBytes !== existingLog) {
    writes.set(LOG_FILE, logBytes);
  }
}

// ── Task resolution ──────────────────────────────────────────────────────────────

/**
 * Resolve every task id to its live {@link BacklogTaskDetail}, keyed by lowercase id. Every id is
 * validated to exist BEFORE any concept's status/managed-block is computed — mirrors
 * `commands/link.ts`'s up-front validation exactly, including running the reads concurrently
 * (`allSettled`) but reporting the first not-found/failure in argument order.
 *
 * @throws LoreError `not_found` (exit 3) naming the first missing task id, in `taskIds` order.
 */
async function resolveAllTasks(
  adapter: BacklogAdapter,
  taskIds: readonly string[],
): Promise<Map<string, BacklogTaskDetail>> {
  const results = await Promise.allSettled(taskIds.map((id) => adapter.viewTask(id)));
  const details = new Map<string, BacklogTaskDetail>();
  for (let i = 0; i < taskIds.length; i++) {
    const taskId = taskIds[i] as string;
    const result = results[i] as PromiseSettledResult<BacklogTaskDetail | null>;
    if (result.status === "rejected") {
      throw result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    }
    if (result.value === null) {
      throw new LoreError(
        "not_found",
        `task "${taskId}" does not exist`,
        "a linked concept's tasks: list must reference only live Backlog tasks — check the id, or unlink it",
        { taskId },
      );
    }
    details.set(taskId.toLowerCase(), result.value);
  }
  return details;
}

// ── Scoping ────────────────────────────────────────────────────────────────────

/**
 * Filter `graph`'s concepts to those under one of `paths` (each resolved to a concept id via
 * {@link idFromPath}, matched as an exact id or a directory prefix); an empty `paths` scopes to
 * every concept. Index/log regeneration is never scoped this way (see {@link regenerateIndexAndLog}).
 */
function scopeConcepts(graph: BundleGraph, paths: readonly string[]): Concept[] {
  const all = [...graph.concepts.values()];
  if (paths.length === 0) {
    return all;
  }
  const prefixes = paths.map((p) => idFromPath(p));
  return all.filter((c) => prefixes.some((prefix) => c.id === prefix || c.id.startsWith(`${prefix}/`)));
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/** Parse `sync`'s tokens into `[paths…]`, `--dry-run`, and `--no-index` via the shared tokenizer. */
function parseSyncArgs(args: readonly string[]): SyncArgs {
  const { positionals, flags } = parseCommandArgs(args, "sync", ["dry-run", "no-index"]);
  return { paths: positionals, dryRun: flags.has("dry-run"), noIndex: flags.has("no-index") };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `sync` (output.ts dispatches on the mode). */
function reportRenderable(data: SyncReport): Renderable<SyncReport> {
  return { kind: "sync.result", data, pretty: render, plain: render };
}

/** One line per changed file, the backlog-commit outcome (if any), then a summary line. (No color: no severities.) */
function render(data: SyncReport): string {
  const verb = data.dryRun ? "would update" : "updated";
  const lines = data.files.map((f) => `${verb} ${f.path}`);
  if (data.backlogCommit.committed) {
    const noun = data.backlogCommit.files.length === 1 ? "file" : "files";
    lines.push(`committed backlog/: ${data.backlogCommit.files.length} ${noun}`);
  }
  const noun = data.filesChanged === 1 ? "file" : "files";
  lines.push(`${data.filesChanged} ${noun} changed${data.dryRun ? " (dry-run)" : ""}`);
  return lines.join("\n");
}
