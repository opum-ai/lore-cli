/**
 * commands/orphans.ts — `lore orphans [--tasks-only | --docs-only] [--limit <n>]` (cli-surface §orphans).
 *
 * The read-only, **bidirectional** doc↔task coupling report: the CI/agent signal that the
 * coupling `lore link`/`sync` maintain has gaps. Two directions, one envelope:
 *
 *   - **orphanTasks** — tasks with **no owning doc**: no concept lists the task in its `tasks:`
 *     frontmatter AND the task carries no `doc:<conceptId>` back-reference label AND (LORE-261) no
 *     ancestor in its Backlog `parentTaskId` chain is owned either — a subtask of an already-linked
 *     parent task is not reported, since linking the parent does not stamp each subtask with its own
 *     back-reference (see {@link hasOwnedAncestor}). Work that exists in Backlog but is documented
 *     nowhere, at any level of its parent/subtask hierarchy.
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
 *
 * ## Bounded output (cli-contract §3)
 *
 * `orphans` is named alongside `query`/`graph`/`context` as a read-heavy command that must cap its
 * output rather than dump an unbounded snapshot into a CI log or an agent's context window. Its two
 * sections are independent (an unrelated task backlog and an unrelated doc set), so each is capped —
 * and reports its own `total`/`shown`/`truncated` — separately against the same `--limit` (default
 * {@link DEFAULT_ORPHANS_LIMIT}), mirroring `query`'s single-section shape once per section.
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
  renderTruncationLine,
  type TaskSummaryRow,
  truncation,
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

/** The parsed form of `lore orphans`'s arguments — the two mutually-exclusive section filters, plus the cap. */
interface OrphansArgs {
  /** `--tasks-only`: report only the orphan-task side (omit `danglingLinks`). */
  readonly tasksOnly: boolean;
  /** `--docs-only`: report only the dangling-link side (omit `orphanTasks`). */
  readonly docsOnly: boolean;
  /** `--limit` (at most once); `undefined` falls back to {@link DEFAULT_ORPHANS_LIMIT}. */
  readonly limit?: number;
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
 * carries only the orphan-task fields, `--docs-only` only the dangling-link fields. An excluded section
 * is entirely absent (not `[]`) so a consumer can tell "not requested" from "requested, found none".
 *
 * Each section carries its own `total`/`shown`/`truncated` (cli-contract §3) rather than one combined
 * triple — `orphanTasks` and `danglingLinks` count unrelated things (a task backlog vs. a doc set), so a
 * single combined cap would make one section's truncation state say nothing about the other.
 */
export interface OrphansReport {
  /** Tasks with no owning doc, sorted by id (case-insensitive), capped to `--limit`. Omitted under `--docs-only`. */
  readonly orphanTasks?: readonly OrphanTask[];
  /** The full count of orphan tasks before the `--limit` cap. Present iff {@link orphanTasks} is. */
  readonly orphanTasksTotal?: number;
  /** The number of orphan tasks actually returned (`orphanTasksShown <= orphanTasksTotal`). */
  readonly orphanTasksShown?: number;
  /** `true` when the `--limit` cap dropped orphan tasks. */
  readonly orphanTasksTruncated?: boolean;
  /** Docs whose linked task vanished, sorted by (concept, task), capped to `--limit`. Omitted under `--tasks-only`. */
  readonly danglingLinks?: readonly DanglingLink[];
  /** The full count of dangling links before the `--limit` cap. Present iff {@link danglingLinks} is. */
  readonly danglingLinksTotal?: number;
  /** The number of dangling links actually returned (`danglingLinksShown <= danglingLinksTotal`). */
  readonly danglingLinksShown?: number;
  /** `true` when the `--limit` cap dropped dangling links. */
  readonly danglingLinksTruncated?: boolean;
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
  const byId = new Map(snapshot.map((task) => [task.id.toLowerCase(), task])); // for the parent-chain walk below
  const orphanTasks = snapshot
    .filter(
      (task) =>
        !referenced.has(task.id.toLowerCase()) && !hasDocLabel(task) && !hasOwnedAncestor(task, referenced, byId),
    )
    .map((task): OrphanTask => ({ id: task.id, title: task.title, status: task.status }))
    .sort((a, b) => compareLower(a.id, b.id));
  const danglingLinks = references
    .filter((ref) => !known.has(ref.task.toLowerCase()))
    .sort((a, b) => compareLower(a.concept, b.concept) || compareLower(a.task, b.task));

  const limit = parsed.limit ?? DEFAULT_ORPHANS_LIMIT;

  // Compute both directions unconditionally (both are cheap and share the same inputs), then omit the
  // section a flag excluded — omission, not an empty array, is how the envelope says "not requested".
  // Each section is capped to `limit` independently and carries its own total/shown/truncated (§3):
  // the two counts are unrelated, so one combined cap would make one section's truncation state say
  // nothing about the other.
  const report: {
    orphanTasks?: OrphanTask[];
    orphanTasksTotal?: number;
    orphanTasksShown?: number;
    orphanTasksTruncated?: boolean;
    danglingLinks?: DanglingLink[];
    danglingLinksTotal?: number;
    danglingLinksShown?: number;
    danglingLinksTruncated?: boolean;
  } = {};
  if (!parsed.docsOnly) {
    const shown = orphanTasks.slice(0, limit);
    report.orphanTasks = shown;
    report.orphanTasksTotal = orphanTasks.length;
    report.orphanTasksShown = shown.length;
    report.orphanTasksTruncated = shown.length < orphanTasks.length;
  }
  if (!parsed.tasksOnly) {
    const shown = danglingLinks.slice(0, limit);
    report.danglingLinks = shown;
    report.danglingLinksTotal = danglingLinks.length;
    report.danglingLinksShown = shown.length;
    report.danglingLinksTruncated = shown.length < danglingLinks.length;
  }
  return report;
}

/** The default `--limit` when none is given, matching `query`'s cap (cli-surface §orphans). */
export const DEFAULT_ORPHANS_LIMIT = 20;

/** Whether a task claims an owning doc via a `doc:<conceptId>` back-reference label (case-insensitive). */
function hasDocLabel(task: BacklogTask): boolean {
  return task.labels.some((label) => label.toLowerCase().startsWith("doc:"));
}

/**
 * LORE-261: exempt a Backlog **subtask** from the orphan report when an ancestor in its
 * `parentTaskId` chain is already owned — forward-referenced by some concept's `tasks:` list, or
 * itself carrying a `doc:` label. Linking a parent task to a Story does not (and per ADR-0009 §2
 * cannot cheaply) stamp every subtask with its own back-reference, so without this walk a
 * correctly-coupled Story's subtasks would all read as false-positive orphans (the Meridian stress
 * test: 8 reported instead of the intended 2).
 *
 * This is **orphans-side hierarchy awareness**, chosen over a link-side cascade (`lore link` writing
 * a `doc:` label onto every subtask): the `--json` adapter already carries `parentTaskId` on every
 * task in the SAME `listTasks()` snapshot this command already reads (no extra per-task `view`
 * call, preserving the "one snapshot" design above), and a cascade would go stale the instant a new
 * subtask is added after the parent was linked — this walk instead recomputes fresh on every run.
 *
 * Only the task's **ancestors** are walked (never siblings or descendants) — starting at
 * `task.parentTaskId`, not `task` itself, since the caller already tested the task's own
 * reference/label directly. A parent absent from the current snapshot (deleted, archived, or
 * renamed out from under a stale `parentTaskId`) grants no exemption — a subtask under a vanished
 * ancestor is reported, matching how `orphans` already treats an archived task as gone everywhere
 * else (module docstring, "Scope boundary"). A visited-id set guards a corrupt or cyclic parent
 * chain: a cycle yields `false` (not owned, so still reported) rather than looping forever — this
 * is the fail-toward-reporting side of AC#3's no-false-negatives requirement.
 */
function hasOwnedAncestor(
  task: BacklogTask,
  referenced: ReadonlySet<string>,
  byId: ReadonlyMap<string, BacklogTask>,
): boolean {
  const visited = new Set<string>([task.id.toLowerCase()]);
  let parentId = task.parentTaskId;
  while (parentId !== null) {
    const key = parentId.toLowerCase();
    if (visited.has(key)) {
      return false; // a cycle/self-reference in the parent chain — fail toward "still reported"
    }
    visited.add(key);
    const parent = byId.get(key);
    if (parent === undefined) {
      return false; // the ancestor isn't in the current-branch snapshot — no exemption to grant
    }
    if (referenced.has(key) || hasDocLabel(parent)) {
      return true;
    }
    parentId = parent.parentTaskId;
  }
  return false;
}

/** Case-insensitive string order, locale-independent, for the report's deterministic sort. */
function compareLower(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `orphans`'s tokens: the two boolean switches `--tasks-only` / `--docs-only`, the value flag
 * `--limit <n>` (also accepting `--limit=<n>`), and nothing else. The router has already stripped
 * lore's global flags, so a `--`-prefixed token here is a command flag; an unrecognized one, a
 * positional (orphans takes none), a repeated or value-bearing `--tasks-only`/`--docs-only`, passing
 * **both** section filters, or a repeated/value-less/non-integer/too-large/non-positive `--limit` is a
 * `usage` error (exit 2). A `--` ends option parsing (after which any token is a stray positional).
 */
function parseOrphansArgs(args: readonly string[]): OrphansArgs {
  let tasksOnly = false;
  let docsOnly = false;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      const rest = args.slice(i + 1);
      if (rest.length > 0) {
        throw usage(`unexpected argument "${rest[0]}"`, "orphans takes no positional arguments");
      }
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const inline = eq === -1 ? undefined : body.slice(eq + 1);
      if (name === "tasks-only") {
        if (inline !== undefined) {
          throw usage("--tasks-only takes no value", "pass --tasks-only on its own");
        }
        if (tasksOnly) {
          throw usage("--tasks-only given more than once", "pass --tasks-only at most once");
        }
        tasksOnly = true;
      } else if (name === "docs-only") {
        if (inline !== undefined) {
          throw usage("--docs-only takes no value", "pass --docs-only on its own");
        }
        if (docsOnly) {
          throw usage("--docs-only given more than once", "pass --docs-only at most once");
        }
        docsOnly = true;
      } else if (name === "limit") {
        if (limit !== undefined) {
          throw usage("--limit given more than once", "pass --limit at most once");
        }
        limit = parseCount("--limit", readValue("--limit", inline, args, i));
        if (inline === undefined) {
          i++;
        }
      } else {
        throw usage(`unknown option "--${name}"`, "run `lore orphans --help` to list options");
      }
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
  return { tasksOnly, docsOnly, limit };
}

/**
 * Parse `--limit`'s value as a positive integer. Rejects a non-digit run (`Number()` would coerce
 * `"1.5"`/`"0x2"`/`" 2 "`/`"1e3"`), `0` (a zero cap returns nothing useful), and a precision-losing
 * `> 2^53` run — mirroring `query`'s `--limit` guard so every capped command accepts counts identically.
 */
function parseCount(flag: string, value: string): number {
  if (!/^\d+$/.test(value)) {
    throw usage(`invalid ${flag} "${value}"`, `pass an integer ≥ 1, e.g. \`${flag} 20\``);
  }
  const count = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(count)) {
    throw usage(`${flag} "${value}" is too large`, "pass a smaller integer");
  }
  if (count < 1) {
    throw usage(`invalid ${flag} "${value}"`, `pass an integer ≥ 1, e.g. \`${flag} 20\``);
  }
  return count;
}

/**
 * Read a value flag's argument: its inline `--flag=value` form when present, else the **next** token.
 * A missing/empty value — or a next token that is itself an option (`--limit --tasks-only`) — is a
 * `usage` error rather than a silently swallowed flag (mirroring `query`/`graph`/`context`'s guard).
 */
function readValue(flag: string, inline: string | undefined, args: readonly string[], i: number): string {
  if (inline !== undefined) {
    if (inline === "") {
      throw usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} 20\``);
    }
    return inline;
  }
  const next = args[i + 1];
  if (next === undefined || next === "" || (next.startsWith("-") && next !== "-")) {
    throw usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} 20\``);
  }
  return next;
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

/** The narrow-it hint on each section's §3 truncation line — the one actionable way to see more of it. */
const LIMIT_HINT = "raise --limit to see more";

/**
 * A human/pipe-stable report: a header summarizing the requested sections' **total** counts, then one
 * aligned block per non-empty section (`  <id>  <status>  <title>` for orphan tasks; `  <concept>  ->
 * <task>` for dangling links), each followed by its own §3 truncation footer when `--limit` dropped
 * rows. When every requested section is empty, a single all-clear line stands in for the blocks. ANSI
 * only on the header, and only when `color`.
 */
function renderReport(data: OrphansReport, color: boolean): string {
  const { orphanTasks, danglingLinks } = data;
  const counts: string[] = [];
  if (orphanTasks !== undefined) {
    const total = data.orphanTasksTotal as number;
    counts.push(`${total} orphan ${total === 1 ? "task" : "tasks"}`);
  }
  if (danglingLinks !== undefined) {
    const total = data.danglingLinksTotal as number;
    counts.push(`${total} dangling ${total === 1 ? "link" : "links"}`);
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
    const footer = renderTruncationLine(
      truncation(data.orphanTasksTotal as number, data.orphanTasksShown as number, LIMIT_HINT),
    );
    if (footer !== "") {
      lines.push(footer);
    }
  }
  if (danglingLinks !== undefined && danglingLinks.length > 0) {
    const conceptWidth = maxLen(danglingLinks, (link) => link.concept.length);
    lines.push("", "docs with a vanished linked task:");
    for (const link of danglingLinks) {
      lines.push(`  ${link.concept.padEnd(conceptWidth)}  -> ${link.task}`);
    }
    const footer = renderTruncationLine(
      truncation(data.danglingLinksTotal as number, data.danglingLinksShown as number, LIMIT_HINT),
    );
    if (footer !== "") {
      lines.push(footer);
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
