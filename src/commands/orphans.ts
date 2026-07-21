/**
 * commands/orphans.ts — `lore orphans [--tasks-only | --docs-only]` (cli-surface §orphans).
 *
 * The read-only, **bidirectional** doc↔task coupling report: the CI/agent signal that the
 * coupling `lore link`/`sync` maintain has gaps. Two directions, one envelope:
 *
 *   - **orphanTasks** — tasks with **no owning doc**: no concept lists the task in its `tasks:`
 *     frontmatter AND the task carries no `doc:<conceptId>` back-reference label. Work that exists
 *     in Backlog but is documented nowhere.
 *   - **danglingLinks** — docs whose linked task **vanished**: a `tasks:` id the current-branch
 *     Backlog snapshot no longer knows. A doc pointing at a task that has been deleted or renamed.
 *
 * ## One snapshot, pure set arithmetic — not a per-task probe
 *
 * Unlike `lore tasks` (which `viewTask`s each of *one* concept's linked ids), `orphans` spans the
 * whole bundle, so it reads Backlog **once**: `adapter.listTasks()` returns the current-branch
 * on-disk truth across every status (backlog-cli-contract.md §: `task list --json` — "Never
 * `backlog board`"), and both directions fall out of set arithmetic against the loaded graph:
 * `orphanTasks` from the snapshot minus the forward `tasks:` set (and the `doc:` labels the snapshot
 * itself carries), `danglingLinks` from each concept's `tasks:` minus the snapshot's known ids. No
 * N+1 per-id reads.
 *
 * ## A report, never a gate
 *
 * The Backlog capability probe runs UP FRONT (fail-fast: a missing binary is `not_found`/exit 3, a
 * stock non-`--json` binary is `validation`/exit 6), and the single `listTasks()` either returns the
 * snapshot or throws hard drift (exit 6) — there is no soft-null path here, because a dangling link
 * is the *content* of the report, not an advisory swallowed on the way to a rollup. Everything after
 * the snapshot is pure, so `orphans` always returns exit `0` (ADR-0007: `orphans` is a detection
 * report, not a coherence gate — even a non-empty report is exit 0). Only a *usage* error (a bad
 * flag / a stray positional), a *bundle* failure (unreadable/malformed `docs/`), or the *probe/read*
 * failure above throws, funneling through the router's one error seam like every command.
 *
 * ## Scope boundary
 *
 * "No owning doc" is the *literal* surface definition: **any** `doc:` label exempts a task, even one
 * pointing at a since-removed concept (a `doc:`→dead-concept is a third asymmetry, out of this
 * command's two-direction scope). Broken doc→doc cross-links are `lore check`'s job (its link/anchor
 * pass), not repeated here. An **archived** Backlog task reads identically to a deleted one through the
 * JSON adapter — archiving moves it to `backlog/archive/tasks/`, dropping it from BOTH `task list` and
 * `task view` (ADR-0002 keeps lore to that JSON-only surface, so the archive directory is deliberately
 * never consulted) — so a doc still linking an archived task surfaces here as a dangling link, exactly
 * as `lore tasks` drops that same id from its rollup. That is intentional and consistent, not a
 * distinction lore could draw. Output follows the uniform CLI modes: the `{schemaVersion, kind:
 * "orphans.report", data}` envelope under `--json` — `data` an object `{ orphanTasks?, danglingLinks? }`
 * (object-wrapped so the contract can grow additively; the section a flag excludes is **omitted**, not
 * emitted empty, so `--docs-only --json` never shows a misleading `orphanTasks: []`) — and otherwise an
 * aligned text report.
 */

import { join } from "node:path";
import type { BacklogAdapter, BacklogTask } from "../adapters/backlog";
import { loadBundle, toRefList } from "../core/bundle";
import type { Concept } from "../core/concept";
import { loadProfile } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { ANSI, EXIT_OK, paint, WarningCollector, type Writer } from "../errors";
import {
  emit,
  maxLen,
  type OutputContext,
  type Renderable,
  renderTaskSummaryRows,
  type TaskSummaryRow,
} from "../output";
import { usage } from "./args";
import { dedupeTaskIds, defaultAdapter } from "./link";

/** Options for {@link runOrphans}; `root`, the streams, and the adapter are injectable for tests. */
export interface OrphansOptions {
  /** The repo root the `docs/` bundle and the Backlog adapter resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's flag tokens (everything after `orphans`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for advisory warnings; defaults to `process.stderr`. */
  stderr?: Writer;
  /** The Backlog adapter; defaults to the real `backlog` binary resolved against `root`. Injected for tests. */
  adapter?: BacklogAdapter;
}

/** The parsed form of `lore orphans`'s arguments — the two mutually-exclusive section filters. */
interface OrphansArgs {
  /** `--tasks-only`: report only the orphan-task side (omit `danglingLinks`). */
  readonly tasksOnly: boolean;
  /** `--docs-only`: report only the dangling-link side (omit `orphanTasks`). */
  readonly docsOnly: boolean;
}

/** One task with no owning doc: its live identity + current Backlog status, from the Backlog snapshot. */
export type OrphanTask = TaskSummaryRow;

/** One dangling doc→task link: a concept and the `tasks:` id Backlog no longer knows. */
export interface DanglingLink {
  /** The owning concept's id (`"stories/bulk-archive-orders"`). */
  readonly concept: string;
  /** The vanished task id, echoed **verbatim** as the concept's `tasks:` frontmatter wrote it (Backlog has no record to re-case it). */
  readonly task: string;
}

/**
 * The `orphans.report` payload. Both keys are optional: a run with no flag carries both, `--tasks-only`
 * carries only {@link orphanTasks}, `--docs-only` only {@link danglingLinks}. An excluded section is
 * absent (not `[]`) so a consumer can tell "not requested" from "requested, found none".
 */
export interface OrphansReport {
  /** Tasks with no owning doc, sorted by id (case-insensitive). Omitted under `--docs-only`. */
  readonly orphanTasks?: readonly OrphanTask[];
  /** Docs whose linked task vanished, sorted by (concept, task). Omitted under `--tasks-only`. */
  readonly danglingLinks?: readonly DanglingLink[];
}

/**
 * Run `lore orphans`: parse the flags, load the bundle, take the one Backlog snapshot, compute both
 * coupling-gap directions by set arithmetic, emit the `orphans.report`, and return `0`. Async because
 * it drives the Backlog subprocess. See the module docstring for the failure modes.
 */
export async function runOrphans(options: OrphansOptions): Promise<number> {
  const parsed = parseOrphansArgs(options.args);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const profile = loadProfile({ root: options.root });
  const graph = loadBundle(docsRoot, { warnings: advisories, profile });
  // Flush load advisories (e.g. a file skipped for a malformed header) before any Backlog I/O, so a
  // "why isn't this a concept" note survives even if the snapshot read below throws (mirrors `lore tasks`).
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const adapter = options.adapter ?? defaultAdapter(options.root);
  // Probe UP FRONT (fail-fast 3/6) before the snapshot, so an incapable binary is reported as such and
  // never mistaken for "the project has zero tasks" — the disambiguation the report's meaning relies on.
  await adapter.probe();
  const snapshot = await adapter.listTasks();

  emit(orphansRenderable(computeOrphans(graph.concepts.values(), snapshot, parsed)), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * The pure heart of the command: from the bundle's concepts and one Backlog snapshot, derive both
 * coupling-gap directions and apply the section filter. Kept side-effect-free (a plain iterable of
 * concepts + the snapshot array in, a report out) so it is exercised directly in tests without a bundle
 * or a subprocess.
 *
 * A single pass over the concepts builds the forward `tasks:` set (for the orphan-task test) and the
 * flat list of every `(concept, taskId)` reference (for the dangling test) at once; `orphanTasks` then
 * filters the snapshot and `danglingLinks` filters the references, both against case-insensitive id
 * sets. Both outputs are sorted for a deterministic, diff-stable report.
 */
export function computeOrphans(
  concepts: Iterable<Concept>,
  snapshot: readonly BacklogTask[],
  parsed: OrphansArgs,
): OrphansReport {
  const referenced = new Set<string>(); // lower-cased task ids any concept forward-links
  const references: DanglingLink[] = []; // every (concept, taskId) pair, for the dangling test
  for (const concept of concepts) {
    for (const task of dedupeTaskIds(toRefList(concept.frontmatter.tasks))) {
      referenced.add(task.toLowerCase());
      references.push({ concept: concept.id, task });
    }
  }

  const known = new Set(snapshot.map((task) => task.id.toLowerCase())); // lower-cased ids Backlog knows
  const orphanTasks = snapshot
    .filter((task) => !referenced.has(task.id.toLowerCase()) && !hasDocLabel(task))
    .map((task): OrphanTask => ({ id: task.id, title: task.title, status: task.status }))
    .sort((a, b) => compareLower(a.id, b.id));
  const danglingLinks = references
    .filter((ref) => !known.has(ref.task.toLowerCase()))
    .sort((a, b) => compareLower(a.concept, b.concept) || compareLower(a.task, b.task));

  // Compute both directions unconditionally (both are cheap and share the same inputs), then omit the
  // section a flag excluded — omission, not an empty array, is how the envelope says "not requested".
  const report: { orphanTasks?: OrphanTask[]; danglingLinks?: DanglingLink[] } = {};
  if (!parsed.docsOnly) {
    report.orphanTasks = orphanTasks;
  }
  if (!parsed.tasksOnly) {
    report.danglingLinks = danglingLinks;
  }
  return report;
}

/** Whether a task claims an owning doc via a `doc:<conceptId>` back-reference label (case-insensitive). */
function hasDocLabel(task: BacklogTask): boolean {
  return task.labels.some((label) => label.toLowerCase().startsWith("doc:"));
}

/** Case-insensitive string order, locale-independent, for the report's deterministic sort. */
function compareLower(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `orphans`'s tokens: the two boolean switches `--tasks-only` / `--docs-only` and nothing else.
 * The router has already stripped lore's global flags, so a `--`-prefixed token here is a command flag;
 * an unrecognized one, a positional (orphans takes none), or passing **both** section filters is a
 * `usage` error (exit 2). A `--` ends option parsing (after which any token is a stray positional).
 */
function parseOrphansArgs(args: readonly string[]): OrphansArgs {
  let tasksOnly = false;
  let docsOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      const rest = args.slice(i + 1);
      if (rest.length > 0) {
        throw usage(`unexpected argument "${rest[0]}"`, "orphans takes no positional arguments");
      }
      break;
    }
    if (arg === "--tasks-only") {
      tasksOnly = true;
    } else if (arg === "--docs-only") {
      docsOnly = true;
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore orphans --help` to list options");
    } else {
      throw usage(`unexpected argument "${arg}"`, "orphans takes no positional arguments");
    }
  }

  if (tasksOnly && docsOnly) {
    throw usage(
      "--tasks-only and --docs-only are mutually exclusive",
      "pass at most one of them, or neither for the full report",
    );
  }
  return { tasksOnly, docsOnly };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/**
 * The rendering bundle for `orphans` (output.ts dispatches on the mode). `--json` carries the structured
 * {@link OrphansReport}; the pretty/plain text is an aligned report. The two text modes differ only in the
 * painted header, so they share one renderer.
 */
function orphansRenderable(data: OrphansReport): Renderable<OrphansReport> {
  return {
    kind: "orphans.report",
    data,
    pretty: (d, opts) => renderReport(d, opts.color),
    plain: (d) => renderReport(d, false),
  };
}

/**
 * A human/pipe-stable report: a header summarizing the requested section counts, then one aligned block
 * per non-empty section (`  <id>  <status>  <title>` for orphan tasks; `  <concept>  -> <task>` for
 * dangling links). When every requested section is empty, a single all-clear line stands in for the
 * blocks. ANSI only on the header, and only when `color`.
 */
function renderReport(data: OrphansReport, color: boolean): string {
  const { orphanTasks, danglingLinks } = data;
  const counts: string[] = [];
  if (orphanTasks !== undefined) {
    counts.push(`${orphanTasks.length} orphan ${orphanTasks.length === 1 ? "task" : "tasks"}`);
  }
  if (danglingLinks !== undefined) {
    counts.push(`${danglingLinks.length} dangling ${danglingLinks.length === 1 ? "link" : "links"}`);
  }
  const lines = [paint(`orphans: ${counts.join(", ")}`, ANSI.green, color)];

  if (orphanTasks !== undefined && orphanTasks.length > 0) {
    lines.push("", "tasks with no owning doc:");
    // A per-item loop, not `lines.push(...renderTaskSummaryRows(orphanTasks))` — spreading a large
    // array into a function-call argument list has its own engine argument-count ceiling, the same
    // class of RangeError the spread-free `maxLen` (below and in output.ts) was written to avoid.
    for (const row of renderTaskSummaryRows(orphanTasks)) {
      lines.push(row);
    }
  }
  if (danglingLinks !== undefined && danglingLinks.length > 0) {
    const conceptWidth = maxLen(danglingLinks, (link) => link.concept.length);
    lines.push("", "docs with a vanished linked task:");
    for (const link of danglingLinks) {
      lines.push(`  ${link.concept.padEnd(conceptWidth)}  -> ${link.task}`);
    }
  }

  const allClear = allClearLine(orphanTasks, danglingLinks);
  if (allClear !== undefined) {
    lines.push(allClear);
  }
  return lines.join("\n");
}

/**
 * The all-clear line when every **requested** section is empty, else `undefined` (a section had entries,
 * so its block already stands on its own). Crucially, the phrasing asserts cleanliness ONLY for the
 * sections that were actually computed: under `--tasks-only`/`--docs-only` the excluded side (an
 * `undefined` argument) was never checked, so it is left out of the sentence rather than falsely
 * declared clean. At least one side is always requested (the parser rejects both flags), so the line is
 * never empty.
 */
function allClearLine(
  orphanTasks: readonly OrphanTask[] | undefined,
  danglingLinks: readonly DanglingLink[] | undefined,
): string | undefined {
  if ((orphanTasks?.length ?? 0) > 0 || (danglingLinks?.length ?? 0) > 0) {
    return undefined;
  }
  const clauses: string[] = [];
  if (orphanTasks !== undefined) {
    clauses.push("every task has an owning doc");
  }
  if (danglingLinks !== undefined) {
    clauses.push("every linked task is live");
  }
  return `(none — ${clauses.join(", ")})`;
}
