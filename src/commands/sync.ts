/**
 * commands/sync.ts — `lore sync [paths…] [--dry-run] [--no-index] [--fail-on-drop]` (LORE-26,
 * cli-surface §sync).
 *
 * The **write** counterpart to `lore check`. For every concept linking Backlog tasks via its
 * `tasks:` frontmatter: resolves each linked task's live status (`BacklogAdapter.viewTask`),
 * recomputes the concept's task rollup (`core/reconcile.ts`, honoring `[reconcile.overrides]`) and
 * rewrites the version-selected field (`status` for OKF 0.1, `lore_task_status` for 0.2) when it
 * changed, and regenerates the `<!-- lore:tasks -->` managed region
 * (`core/managed-block.ts`) from the same live data. Then — unless `--no-index` — regenerates every
 * bundle `index.md` (`core/indexes.ts`) and the git-history-derived `log.md` (`core/log.ts`, via the
 * real `git log`-shelling adapter in `adapters/git.ts`). Every write is a byte-diff against the
 * current on-disk content first, so a clean tree is a true no-op (AC#1) — and, unless `--dry-run`,
 * the whole write set is committed **all-or-nothing** via {@link writeManyAtomicOrRollback}
 * (LORE-120): each file is still written atomically ({@link writeFileAtomic}), but if any write in
 * the set throws partway through, every file already written *in that same run* is rolled back to
 * its pre-run bytes (or removed, if it did not exist before) rather than left in a mixed old/new
 * state. Since this is the one command that can write many files in a single invocation, it is also
 * the one that needs this cross-file guarantee, on top of `writeFileAtomic`'s own per-file one.
 *

 * **A linked task id that no longer resolves aborts the whole run before any write** (`not_found`,
 * exit 3) — every linked task, across every scoped concept, is resolved up front, mirroring
 * `commands/link.ts`'s "validate before write" precedent: a doc's `status` and managed block must
 * never be computed from a partially-resolved task set.
 *
 * **`lore` is the sole committer of `backlog/`** (ADR-0012, design §2.4): after its own `docs/`
 * writes, `sync` calls `state.ts`'s {@link commitBacklogIfDirty} to commit whatever is currently
 * uncommitted under `backlog/`. This is independent of whether `sync` itself changed anything in
 * `docs/`, and (like every write here) is skipped entirely under `--dry-run`. `link`/`unlink`/
 * `rename` already commit their own touched files via `commitBacklogFiles` right after writing them
 * (LORE-49) — nothing is left pending for `sync` on their account. `sync`'s commit step is a
 * catch-all sweep: it picks up whatever is still dirty under `backlog/` from another source (a
 * human's direct `backlog task edit`, or a prior run's commit that failed).
 *
 * A concept with `tasks:` but no managed-block markers is a fail-loud `validation` error
 * (`core/managed-block.ts`'s own contract, ADR-0008) — `sync` never guesses or writes a partial
 * block. A concept with no `tasks:` at all is never touched, and (mirroring `rename.ts`) no
 * {@link BacklogAdapter} is even constructed unless at least one scoped concept links a task.
 *
 * **Log regeneration reports what it could not keep (LCLI-485).** `log.md` is generated, so anything
 * in the committed file that is neither a folder heading nor an entry line — hand-authored prose, a
 * note pasted under the title — cannot be re-emitted and disappears on the next sync. That used to
 * be discoverable only by diffing the file afterwards. Now every run that regenerates the log
 * reports `added` / `carriedForward` / `dropped` in {@link SyncReport.log} (and in the rendered
 * report), and a run that would drop anything also writes a warning to stderr naming the count and a
 * sample of the content. The written bytes are untouched by either: both are diagnostics on the
 * side, so a repeated sync stays byte-identical.
 *
 * **`--fail-on-drop` is the fail-closed variant of that warning (LCLI-492).** A warning is a signal
 * that requires a reader, and an unattended run — a CI job, a scheduled sync, an agent loop — has
 * none: the run exits `0`, the loss is real, and it surfaces later in a diff someone thinks to take.
 * With the flag, a regeneration that would drop anything throws `drift` (exit `6`) instead, from
 * exactly where the warning is built — which is **before** the `!parsed.dryRun` write blocks below,
 * so nothing in `docs/` is written and the tracker sweep never runs. Everything reached ahead of that
 * point only reads: `loadProfile`/`loadBundle`/`readSource`, `readReconcileConfig` (a `.lore/config.toml`
 * read plus the adapter's `task status-flow`), `gatherReconciliation` (`task view` per linked id), and
 * regeneration itself, which stages into `writes` rather than writing. The Backlog adapter's spawn
 * seam does create a throwaway isolation directory under the system tmpdir, and removes it — outside
 * the repository either way. Default behaviour is unchanged: without the flag `sync` still warns,
 * proceeds, and exits `0`.
 *
 * The surface is a **flag and not a `.lore/config.toml` setting**, deliberately. The guard changes a
 * run's outcome, and `sync`'s documented default is "warn and proceed": a repository-wide setting
 * would make an interactive `lore sync` exit `6` for a reason invisible at the call site, and would
 * then need an inverse flag to escape for one run — two new surfaces where the unattended callers who
 * asked for this already pass their flags explicitly, in a file where `--fail-on-drop` greps. The
 * exit code is `drift`, already in this command's manifest `exitCodes`: per cli-contract §4.1 a
 * warning changes the exit code when the command is a defined gate for that condition, and §5.3's
 * `drift` is the category for on-disk bytes that lore's own generator can no longer account for.
 *
 * An on-disk `index.md` whose directory no longer holds any concept — directly or via any
 * descendant, e.g. after a manual `rm`/`mv` outside `lore rename` — is an **orphan**
 * (`core/indexes.ts`'s {@link orphanedIndexPaths}, LORE-150): `generateIndexes` never emits an entry
 * for it (only live directories are regenerated), so unlike every other stale file it is never
 * written. It is still surfaced, distinctly from an "updated" file, in `SyncReport.orphanedIndexes`
 * and the rendered report — left untouched on disk (deleting a hand-authored file is not this
 * command's call to make unprompted) but no longer silently unmentioned.
 */

import { dirname, join } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { realGitAdapter, resolveHeadSha } from "../adapters/git";
import type { TrackerBackend } from "../config";
import { type BundleGraph, loadBundle } from "../core/bundle";
import { type Concept, idFromPath, parseConcept, serializeConcept } from "../core/concept";
import { generateIndexes, orphanedIndexPaths } from "../core/indexes";
import { buildLogWithStats, type GitAdapter, generateLogWithStats, type LogMergeStats } from "../core/log";
import { regenerateTaskBlock } from "../core/managed-block";
import { taskRollupFieldFor } from "../core/okf-version";
import { loadProfile, type Profile, profileForBundle } from "../core/profile";
import { type ReconciledStatus, validateReconcileInputs } from "../core/reconcile";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, readFileIfPresent, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { type BacklogCommitResult, bunGitSpawn, type GitSpawn, renderBacklogCommitLine } from "../state";
import { resolveSelectedBackend, sweepTrackerStorage } from "../tracker-persistence";
import { parseCommandArgs } from "./args";
import { readIndexBytes, readSource } from "./discover";
import { type AtomicRollbackWrite, assertNoSymlinkInAnyPath, ensureDir, writeManyAtomicOrRollback } from "./fswrite";
import { gatherReconciliation, linkedConcepts, readReconcileConfig } from "./reconcile-shared";

/** The reserved log file name, excluded from concept scanning (mirrors `rename.ts`'s index handling). */
const LOG_FILE = "log.md";

/** Options for {@link runSync}; `root`, the streams, and the adapters/seams are injectable for tests. */
export interface SyncOptions {
  /** The repo root the `docs/` bundle (and `backlog/`) resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional + flag tokens from Commander. */
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
  /** Explicit tracker-backend override (LCLI-333.1); production resolves via `resolveTrackerSelection`. Test/CI pin only — never a runtime fallback. */
  backend?: TrackerBackend;
}

/** The parsed form of `lore sync`'s arguments. */
interface SyncArgs {
  /** Concept ids/paths to scope reconciliation + managed-block regen to; empty means every concept. Index/log regeneration is always whole-bundle. */
  paths: string[];
  /** `--dry-run`: report what would change, write nothing (docs/ or backlog/). */
  dryRun: boolean;
  /** `--no-index`: skip both index.md and log.md regeneration. */
  noIndex: boolean;
  /** `--fail-on-drop`: refuse the whole run, before any write, if log regeneration would drop unrecognized lines (LCLI-492). */
  failOnDrop: boolean;
}

/** One written (or, under `--dry-run`, would-be-written) file, for the report. */
interface ChangedFile {
  /** Repo-relative POSIX path of the file. */
  readonly path: string;
}

/**
 * The `log.md` regeneration accounting carried on {@link SyncReport} (LCLI-485) — `core/log.ts`'s
 * {@link LogMergeStats} minus its sample lines, which belong in the stderr warning rather than in
 * the machine payload.
 */
export interface LogSummary {
  /** Entries this sync added to the log from git history (0 when the history holds nothing new). */
  readonly added: number;
  /** Committed entries the visible history can no longer account for, preserved rather than replaced. */
  readonly carriedForward: number;
  /** Committed lines regeneration could not keep — the number to watch (see the module header). */
  readonly dropped: number;
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
  /**
   * Repo-relative paths of on-disk `index.md` files whose directory no longer holds any concept,
   * directly or via any descendant (LORE-150) — e.g. after a manual `rm`/`mv` outside `lore rename`.
   * Reported distinctly from `files` (not counted in `filesChanged`): the file is left untouched on
   * disk, since deleting a hand-authored file is not this command's call to make unprompted, but it
   * is no longer silently unmentioned either. Always `[]` when `--no-index` skipped index regen.
   * Ascending.
   */
  readonly orphanedIndexes: readonly string[];
  /**
   * What regenerating `log.md` added, carried forward, and dropped (LCLI-485). Absent — not a zeroed
   * summary — when `--no-index` skipped log regeneration entirely: nothing was merged, so there are
   * no counts, and reporting three zeroes would read as "nothing was dropped" rather than "nothing
   * was looked at".
   */
  readonly log?: LogSummary;
}

/**
 * Run `lore sync`: reconcile every scoped concept's `status` and managed task block from live
 * Backlog data, regenerate `index.md`/`log.md` (unless `--no-index`), write every changed file
 * (unless `--dry-run`), commit any dirty `backlog/` changes, emit the `sync.result`, and return the
 * exit code.
 *
 * @returns `0` on success (a fully clean tree is still `0` — idempotent). Throws (never returns) a
 *   `usage` {@link LoreError} (exit `2`) for `--fail-on-drop --no-index`, `not_found` (exit `3`) when
 *   a linked task id no longer exists, or `validation`/`drift` (exit `6`) when reconciliation, the
 *   managed block, or the `backlog/` commit fails — or, under `--fail-on-drop`, when regenerating
 *   `log.md` would drop unrecognized content (LCLI-492), thrown before any write.
 */
export async function runSync(options: SyncOptions): Promise<number> {
  const parsed = parseSyncArgs(options.args);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  // Loaded unconditionally, before the bundle: loadBundle validates every concept's frontmatter
  // against this profile (LORE-84), and it runs regardless of reconciliation eligibility, so the
  // profile can no longer be deferred to the eligibility-gated block below.
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(docsRoot, { warnings: advisories, profile });
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const scoped = scopeConcepts(graph, parsed.paths);
  // This command's precedence for when MULTIPLE local config sources are simultaneously broken:
  // a malformed .lore/profile.toml now surfaces FIRST, unconditionally — profile loads above,
  // before loadBundle, so its own parse failure throws before docsRoot is even walked (LORE-84
  // superseded the pre-LORE-27 "profile loads only when reconciliation is eligible" precedence:
  // loadBundle needs the same profile for every sync run, eligible or not). backlog/config.yml/
  // .lore/config.toml SYNTAX errors (readReconcileConfig, a plain read — no semantic check yet)
  // surface next, then validateReconcileInputs's SEMANTIC checks (a duplicate flow entry, an
  // invalid override target) — both still conditioned on eligibility (mirrors gatherReconciliation's
  // own check) so a bundle with nothing to reconcile never pays for either. The resolved,
  // already-validated config is then passed straight into gatherReconciliation so it is never
  // read/validated a second time.
  const eligible = linkedConcepts(scoped).length > 0;
  const config = eligible
    ? options.adapter === undefined
      ? await readReconcileConfig(options.root)
      : await readReconcileConfig(options.root, options.adapter)
    : undefined;
  if (config !== undefined) {
    validateReconcileInputs(config.flow, config.overrides);
  }
  const targets = await gatherReconciliation(options.root, scoped, options.adapter, config);

  // bundle-relative path -> { before: pre-run bytes (undefined if the file didn't exist), after: new
  // bytes }. `before` is captured here, at diff time, alongside `after` — never re-derived later —
  // so a mid-run rollback (LORE-120) always restores exactly what was actually on disk before this
  // run touched it, not a re-read that could itself race against a concurrent edit.
  const writes = new Map<string, { before: string | undefined; after: string }>();
  const taskStatusField = taskRollupFieldFor(graph.state.okfVersion);
  const bundleProfile = profileForBundle(profile, graph.state);
  for (const { concept, newTaskStatus, rows } of targets) {
    const docPath = `${DOCS_DIR}/${concept.path}`;
    const original = readSource(join(docsRoot, concept.path), docPath);
    // Derived from the FRESHLY re-read `original` bytes, not the stale in-memory `concept` object
    // captured (in `targets`, via `gatherReconciliation`) before the async Backlog round-trip: a
    // concurrent on-disk edit landing on this doc during that round-trip must survive a
    // status-changing sync write, not be silently discarded in favor of a pre-round-trip snapshot
    // (LORE-119).
    const base =
      newTaskStatus !== null && newTaskStatus !== concept.frontmatter[taskStatusField]
        ? withUpdatedTaskStatus(concept.path, original, taskStatusField, newTaskStatus, bundleProfile)
        : original;

    const final = regenerateTaskBlock(base, rows, { docPath });
    if (final !== original) {
      writes.set(concept.path, { before: original, after: final });
    }
  }

  const regenerated = parsed.noIndex ? undefined : regenerateIndexAndLog(options, docsRoot, graph, writes);
  const orphanedIndexes = regenerated?.orphanedIndexes ?? [];

  // Emitted BEFORE the write, and on `--dry-run` too: the whole point is that the loss is visible in
  // the run that causes it, rather than in a diff someone thinks to take afterwards. A fresh
  // collector, because `advisories` above was already flushed and flushing is non-draining.
  if (regenerated !== undefined && regenerated.log.dropped > 0) {
    // `--fail-on-drop` (LCLI-492) replaces the warning rather than adding to it: the refusal carries
    // strictly more than the warning does (the same count and samples, plus a hint and the machine-
    // readable `input`), and emitting both would make the unattended log this exists for report the
    // same loss twice in two shapes. Thrown HERE, where the warning is built, because this is the
    // last statement before the `!parsed.dryRun` write blocks — the refusal is structurally
    // pre-write rather than merely early (see the module header).
    if (parsed.failOnDrop) {
      throw droppedContentRefusal(regenerated.log);
    }
    const warnings = new WarningCollector();
    warnings.add(droppedContentWarning(regenerated.log, parsed.dryRun));
    warnings.flush({ color: options.output.color, stderr: options.stderr });
  }

  if (!parsed.dryRun) {
    // Swept as a whole BEFORE any write starts (LORE-93 AC#5): ensureDir's own per-call guard
    // below is reactive — in this loop, it would only refuse once it REACHES a bad target, by
    // which point earlier targets in the same `writes` map may already be on disk. A single
    // preflight over every planned path makes the write either fully proceed or refuse before
    // touching anything.
    assertNoSymlinkInAnyPath(
      options.root,
      [...writes.keys()].map((path) => `${DOCS_DIR}/${path}`),
    );
    // All-or-nothing across the whole set (LORE-120): every parent directory is created up front
    // (mkdir -p is itself idempotent — nothing to roll back there), then the actual byte writes go
    // through writeManyAtomicOrRollback, which undoes every write already applied in this same run
    // if a later one throws, rather than leaving an arbitrary prefix of `writes` committed and the
    // rest not.
    const rollbackWrites: AtomicRollbackWrite[] = [];
    for (const [path, { before, after }] of writes) {
      ensureDir(options.root, dirname(`${DOCS_DIR}/${path}`));
      rollbackWrites.push({ abs: join(docsRoot, path), relPath: `${DOCS_DIR}/${path}`, before, after });
    }
    writeManyAtomicOrRollback(rollbackWrites);
  }

  let backlogCommit: BacklogCommitResult = { committed: false, files: [] };
  if (!parsed.dryRun) {
    // Backend-owned catch-all sweep (LCLI-333.1): under `backlog` this is the unchanged
    // ADR-0012 `backlog/` sweep; under any other backend it is a no-op that never invokes git
    // (and never even constructs the spawn seam).
    const backend = resolveSelectedBackend(options.root, options.backend);
    if (backend === "backlog") {
      backlogCommit = await sweepTrackerStorage(backend, {
        root: options.root,
        gitSpawn: options.gitSpawn ?? bunGitSpawn(options.root),
      });
    } else {
      backlogCommit = await sweepTrackerStorage(backend, { root: options.root });
    }
  }

  const files = [...writes.keys()].sort().map((path) => ({ path: `${DOCS_DIR}/${path}` }));
  const report: SyncReport = {
    files,
    filesChanged: files.length,
    backlogCommit,
    dryRun: parsed.dryRun,
    orphanedIndexes: orphanedIndexes.map((path) => `${DOCS_DIR}/${path}`),
    ...(regenerated === undefined
      ? {}
      : {
          log: {
            added: regenerated.log.added,
            carriedForward: regenerated.log.carriedForward,
            dropped: regenerated.log.dropped,
          },
        }),
  };
  emit(reportRenderable(report), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * Re-parse `raw` — the freshly re-read on-disk bytes for the concept at `path` — and re-serialize it
 * with the version-selected task-rollup field applied to its frontmatter. Every other frontmatter key and the body come straight
 * from `raw` itself, never from an earlier in-memory snapshot, so a concurrent on-disk edit made to
 * the doc between the initial bundle load and this status-changing write survives it (LORE-119). Only
 * that one task-rollup field is overwritten — lifecycle `status` in an OKF 0.2 bundle is never
 * touched. A concurrent edit to the selected rollup field is still resolved to what Backlog reports,
 * exactly as an uncontended sync would resolve it; no lifecycle/task-progress conversion exists.
 */
function withUpdatedTaskStatus(
  path: string,
  raw: string,
  field: "status" | "lore_task_status",
  status: ReconciledStatus,
  profile: Profile,
): string {
  const fresh = parseConcept(path, raw, { profile });
  return serializeConcept({ ...fresh, frontmatter: { ...fresh.frontmatter, [field]: status } }, { profile });
}

// ── Index + log regeneration ────────────────────────────────────────────────────

/**
 * Regenerate every `index.md` and `log.md`, adding an entry to `writes` for each one whose bytes
 * actually changed, and return the bundle-relative paths of any **orphaned** on-disk `index.md`
 * files — one whose directory no longer holds a concept, directly or via any descendant (LORE-150) —
 * so the caller can report them distinctly instead of `generateIndexes` silently never mentioning
 * them (it only ever emits entries for live directories; a stale disk entry outside that set is
 * simply absent from its returned map, indistinguishable from "unchanged" without this comparison).
 * Always whole-bundle, regardless of `[paths…]` scoping — both index regeneration and orphan
 * detection are inherently global (a hub lists its whole directory; the log is derived from all of
 * git history). Also returns the log merge's own accounting, so the caller can report and warn on
 * what regeneration could not keep (LCLI-485) without re-deriving it from the bytes.
 */
function regenerateIndexAndLog(
  options: SyncOptions,
  docsRoot: string,
  graph: BundleGraph,
  writes: Map<string, { before: string | undefined; after: string }>,
): { orphanedIndexes: readonly string[]; log: LogMergeStats } {
  const diskIndexBytes = readIndexBytes(docsRoot);
  const regeneratedIndexes = generateIndexes(graph, { existing: diskIndexBytes });
  for (const [path, bytes] of regeneratedIndexes) {
    const before = diskIndexBytes.get(path);
    if (bytes !== before) {
      writes.set(path, { before, after: bytes });
    }
  }
  const orphaned = orphanedIndexPaths(graph, diskIndexBytes);

  // The committed log is an INPUT to regeneration, not just the thing it is compared against: any
  // entry the visible history can no longer account for is carried forward rather than destroyed
  // (LCLI-474, `core/log.ts`). The no-HEAD branch needs it just as much as the normal one — a
  // repository whose HEAD does not resolve has the emptiest possible history, so replacing there
  // would erase the whole file.
  const existingLog = readFileIfPresent(join(docsRoot, LOG_FILE), `${DOCS_DIR}/${LOG_FILE}`);
  const logOptions = { root: DOCS_DIR, existing: existingLog };
  const resolveHead = options.resolveHead ?? resolveHeadSha;
  const headSha = resolveHead(options.root);
  const regenerated =
    headSha === null
      ? generateLogWithStats([], logOptions)
      : buildLogWithStats(options.gitAdapter ?? realGitAdapter(options.root), { to: headSha }, logOptions);
  if (regenerated.bytes !== existingLog) {
    writes.set(LOG_FILE, { before: existingLog, after: regenerated.bytes });
  }
  return { orphanedIndexes: orphaned, log: regenerated.stats };
}

/**
 * The stderr warning for a regeneration that cannot keep some of the committed `log.md`. Names the
 * count first (the part a reader acts on) and then a bounded sample of the content, so the reader
 * can tell "my paragraph of notes" from "a line of trailing whitespace" without opening the diff.
 * Only reached when `dropped > 0`; `core/log.ts`'s `isStructural` is what keeps the blank lines and
 * title of a perfectly healthy generated log from ever getting here.
 */
function droppedContentWarning(stats: LogMergeStats, dryRun: boolean): string {
  return (
    `${DOCS_DIR}/${LOG_FILE}: regeneration ${dryRun ? "would drop" : "drops"} ${droppedCount(stats)} ` +
    `(${droppedSampleList(stats)}) — this file is generated by lore sync from git history; ` +
    "only folder headings and entry lines survive it"
  );
}

/**
 * The `--fail-on-drop` refusal (LCLI-492): the same count and the same bounded samples the warning
 * above carries, so an unattended runner's captured log is enough to act on without re-running
 * interactively, plus the `input` a `--json` caller can read the numbers off without parsing prose.
 *
 * Always "would drop", with no `--dry-run` variant: a refused run never writes, so the warning's
 * indicative "drops" is never true here — the flag makes every run a dry one at this point.
 *
 * `drift` (exit `6`), never a bare number: it is already in `sync`'s manifest `exitCodes`, and it is
 * the cli-contract §5.3 category for on-disk bytes a lore generator can no longer account for. §4.1
 * is the rest of the grounding — a warning changes the exit code precisely when the command is a
 * defined gate for that condition, which is what `--fail-on-drop` opts this run into being.
 */
function droppedContentRefusal(stats: LogMergeStats): LoreError {
  return new LoreError(
    "drift",
    `${DOCS_DIR}/${LOG_FILE}: refusing to sync — regeneration would drop ${droppedCount(stats)} ` +
      `(${droppedSampleList(stats)})`,
    `move that content out of ${DOCS_DIR}/${LOG_FILE} (it is generated by lore sync from git history; ` +
      "only folder headings and entry lines survive regeneration), or drop --fail-on-drop to accept the loss",
    { path: `${DOCS_DIR}/${LOG_FILE}`, dropped: stats.dropped, droppedSamples: [...stats.droppedSamples] },
  );
}

/** `"3 unrecognized lines"` — the part a reader acts on, shared by the warning and the refusal. */
function droppedCount(stats: LogMergeStats): string {
  return `${stats.dropped} unrecognized ${stats.dropped === 1 ? "line" : "lines"}`;
}

/**
 * The bounded sample list, quoted, with a trailing `…` when the samples do not cover every dropped
 * line — so a reader can tell "my paragraph of notes" from "a line of trailing whitespace" without
 * opening the diff, and can still tell that they are not seeing all of it.
 */
function droppedSampleList(stats: LogMergeStats): string {
  const samples = stats.droppedSamples.map((line) => JSON.stringify(line)).join(", ");
  return stats.dropped > stats.droppedSamples.length ? `${samples}, …` : samples;
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
  // Strip a trailing slash before deriving the id: idFromPath() preserves it verbatim, and a
  // trailing "/" (natural from shell tab-completion of a directory) would otherwise never match
  // any concept id (`c.id === "stories/foo/"` and `c.id.startsWith("stories/foo//")` are both
  // always false), silently scoping to nothing rather than the whole "stories/foo" directory.
  const prefixes = paths.map((p) => idFromPath(p.replace(/\/+$/, "")));
  for (const prefix of prefixes) {
    if (!all.some((c) => matchesScope(c.id, prefix))) {
      // A path/id that matches nothing (a typo, a trailing slash that still resolves to no
      // directory, a concept that was never linked) is a fail-loud usage error, not a silent
      // empty scope — matching link/unlink/rename's `conceptNotInBundle` precedent: a `lore sync`
      // that quietly reconciled zero concepts and reported "0 files changed" would read as "already
      // in sync" when it never looked at the intended target at all.
      throw new LoreError(
        "not_found",
        `no concept found at or under "${prefix}"`,
        "check the id/path and try again — run `lore query` or `lore graph` to see known concept ids",
        { path: prefix },
      );
    }
  }
  return all.filter((c) => prefixes.some((prefix) => matchesScope(c.id, prefix)));
}

/** Whether `id` is exactly `prefix` or lives under it as a directory prefix. */
function matchesScope(id: string, prefix: string): boolean {
  return id === prefix || id.startsWith(`${prefix}/`);
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `sync`'s tokens into `[paths…]`, `--dry-run`, `--no-index`, and `--fail-on-drop` via the
 * shared parser.
 *
 * `--fail-on-drop --no-index` is a fail-loud `usage` error rather than a silent no-op (LCLI-492).
 * `--no-index` skips log regeneration entirely, so the guard can never fire, and the combination
 * would hand an unattended caller a flag that reads as protection in their CI file while providing
 * none — the exact "reported and passed" failure this flag exists to remove. Refusing here, in
 * argument parsing, also keeps it the cheapest possible failure: before the bundle is even loaded.
 * `--dry-run` is deliberately NOT a conflict: a dry run already writes nothing, so the guard there is
 * purely an exit code, and a nonzero exit from a pre-check is exactly what an unattended runner wants
 * — it is how a job asks "would a real sync lose anything?" without changing the tree.
 */
function parseSyncArgs(args: readonly string[]): SyncArgs {
  const { positionals, flags } = parseCommandArgs(args, "sync");
  if (flags.has("fail-on-drop") && flags.has("no-index")) {
    throw new LoreError(
      "usage",
      "--fail-on-drop cannot be combined with --no-index",
      "--no-index skips log regeneration, so there is nothing for --fail-on-drop to refuse — drop one of them",
      { flags: ["fail-on-drop", "no-index"] },
    );
  }
  return {
    paths: positionals,
    dryRun: flags.has("dry-run"),
    noIndex: flags.has("no-index"),
    failOnDrop: flags.has("fail-on-drop"),
  };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `sync` (output.ts dispatches on the mode). */
function reportRenderable(data: SyncReport): Renderable<SyncReport> {
  return { kind: "sync.result", data, pretty: render, plain: render };
}

/**
 * One line per changed file, one line per orphaned index (distinct from "updated": the file is
 * reported but not written, LORE-150), the log merge's accounting when the log was regenerated
 * (LCLI-485), the backlog-commit outcome (if any), then a summary line. (No color: no severities.)
 */
function render(data: SyncReport): string {
  const verb = data.dryRun ? "would update" : "updated";
  const lines = data.files.map((f) => `${verb} ${f.path}`);
  for (const path of data.orphanedIndexes) {
    lines.push(`orphaned index ${path} (no concepts remain under this directory; left untouched)`);
  }
  if (data.log !== undefined) {
    // Printed on every regenerating run, not only when something was dropped: a count that appears
    // only once it is nonzero is a count nobody is watching, and the point is that a reader notices
    // the moment it moves. A healthy repository reads "0 entries added, 0 carried forward, 0 ...".
    const { added, carriedForward, dropped } = data.log;
    const entries = added === 1 ? "entry" : "entries";
    const droppedNoun = dropped === 1 ? "line" : "lines";
    lines.push(
      `${DOCS_DIR}/${LOG_FILE}: ${added} ${entries} added, ${carriedForward} carried forward, ` +
        `${dropped} unrecognized ${droppedNoun} dropped`,
    );
  }
  const commitLine = renderBacklogCommitLine(data.backlogCommit);
  if (commitLine !== undefined) {
    lines.push(commitLine);
  }
  const noun = data.filesChanged === 1 ? "file" : "files";
  lines.push(`${data.filesChanged} ${noun} changed${data.dryRun ? " (dry-run)" : ""}`);
  return lines.join("\n");
}
