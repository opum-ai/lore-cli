/**
 * commands/tasks.ts — `lore tasks <id> [--status <S>]` (cli-surface §tasks).
 *
 * The thin, read-only view of a concept's **live** Backlog task rollup: it loads the
 * `docs/` bundle, resolves the target concept by id, reads that concept's `tasks:`
 * frontmatter list, and fetches each linked task's CURRENT state from the Backlog
 * JSON adapter — the same live data `lore sync` materializes into a concept's managed
 * `<!-- lore:tasks -->` block, but rendered directly here and written nowhere.
 *
 * Output follows the uniform CLI modes: the `{schemaVersion, kind: "tasks.rollup",
 * data}` envelope under `--json` — `data` an object `{ concept, status?, tasks }` whose
 * `tasks` are `{id, title, status}` rows in the concept's own `tasks:` order (wrapped in
 * an object, like every sibling list command, so the contract can grow additively) —
 * and otherwise an aligned text table. `--status <S>` filters the rows to one Backlog
 * status (case-insensitive match on the configured label) and is echoed back on `status`.
 *
 * Failure modes, in the order they can occur:
 * - a bad flag / missing-or-duplicate `<id>` is a `usage` error (exit 2);
 * - an `<id>` absent from the bundle is a `not_found` error (exit 3);
 * - Backlog being unavailable is fail-fast: the adapter's capability probe runs UP FRONT,
 *   so a missing binary (exit 3) or a stock, non-`--json` binary (exit 6) is reported
 *   before any per-task read. That ordering is what lets a `viewTask` null AFTER a passing
 *   probe mean, unambiguously, "this linked id is a dangling reference" — dropped from the
 *   rollup with a stderr advisory, exit 0 — rather than "Backlog is broken". `orphans`
 *   (LORE-32) is the dedicated dangling-link report; `tasks` only notes them so its rollup
 *   shows just the live tasks. A per-task read that *fails* (Backlog drift) still propagates.
 */

import { join } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { conceptNotInBundle, loadBundle, toRefList } from "../core/bundle";
import { idFromPath } from "../core/concept";
import { DOCS_DIR } from "../core/scaffold";
import { ANSI, EXIT_OK, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { usage } from "./args";
import { dedupeTaskIds, defaultAdapter } from "./link";

/** Options for {@link runTasks}; `root`, the streams, and the adapter are injectable for tests. */
export interface TasksOptions {
  /** The repo root the `docs/` bundle and the Backlog adapter resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `tasks`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for advisory warnings; defaults to `process.stderr`. */
  stderr?: Writer;
  /** The Backlog adapter; defaults to the real `backlog` binary resolved against `root`. Injected for tests. */
  adapter?: BacklogAdapter;
}

/** The parsed form of `lore tasks`'s arguments. */
interface TasksArgs {
  /** The target concept id (positional, already {@link idFromPath}-normalized). */
  id: string;
  /** The `--status` filter, when given (case-insensitively matched against each task's live status). */
  status?: string;
}

/** One row of the rollup: a linked task's live identity + current Backlog status, in `tasks:` order. */
export interface TaskRollupRow {
  /** Display-cased task id (`"LORE-21"`). */
  readonly id: string;
  readonly title: string;
  /** The raw configured Backlog status string (no presentation icon). */
  readonly status: string;
}

/** The `tasks.rollup` payload: the concept, the applied `--status` filter (when any), and the live rows. */
export interface TaskRollup {
  /** The resolved concept id whose `tasks:` were rolled up. */
  readonly concept: string;
  /** The `--status` filter that was applied, echoed back; omitted when no filter was given. */
  readonly status?: string;
  /** The linked tasks' live data, in the concept's own `tasks:` order (dangling ids dropped). */
  readonly tasks: readonly TaskRollupRow[];
}

/**
 * Run `lore tasks`: parse the arguments, load the bundle, resolve the concept, fetch its
 * linked tasks' live status from Backlog, emit the `tasks.rollup`, and return `0`. Async
 * because it drives the Backlog subprocess. See the module docstring for the failure modes.
 */
export async function runTasks(options: TasksOptions): Promise<number> {
  const parsed = parseTasksArgs(options.args);
  const docsRoot = join(options.root, DOCS_DIR);
  const advisories = new WarningCollector();
  const graph = loadBundle(docsRoot, { warnings: advisories });
  // Flush load warnings before the not_found throw below, so an advisory explaining *why* a
  // file is not a concept survives on exactly the path that most needs it (mirrors `lore context`).
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const concept = graph.concepts.get(parsed.id);
  if (concept === undefined) {
    throw conceptNotInBundle(parsed.id);
  }

  const linked = dedupeTaskIds(toRefList(concept.frontmatter.tasks));
  const tasks = await resolveRollup(linked, parsed.status, options);
  const data: TaskRollup =
    parsed.status === undefined ? { concept: parsed.id, tasks } : { concept: parsed.id, status: parsed.status, tasks };

  emit(tasksRenderable(data), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * Resolve every linked task id to its live {@link TaskRollupRow}, filtered to `status` when given.
 * Returns `[]` without touching Backlog when the concept links nothing (mirrors
 * `gatherReconciliation` constructing no adapter for an uncoupled concept).
 *
 * The Backlog capability probe runs UP FRONT so a missing/incapable binary fails fast (exit 3/6)
 * before any per-task read — the disambiguation the module docstring relies on. Reads then run
 * concurrently via `allSettled` (mirroring `resolveTaskDetails`, so a second failing read never
 * escapes as an unhandled rejection): the FIRST read that *fails* — in `tasks:` order — is rethrown
 * as a hard error (Backlog drift), exactly as `lore check`/`sync` treat it, while a clean `null` — a
 * task Backlog does not know — is soft: dropped from the rollup with a stderr advisory (`orphans`
 * owns the dangling-link report). The `--status` filter is applied last, to the live rows only.
 */
async function resolveRollup(
  linked: readonly string[],
  status: string | undefined,
  options: TasksOptions,
): Promise<TaskRollupRow[]> {
  if (linked.length === 0) {
    return [];
  }
  const adapter = options.adapter ?? defaultAdapter(options.root);
  await adapter.probe();

  const settled = await Promise.allSettled(linked.map((id) => adapter.viewTask(id)));
  const dangling: string[] = [];
  const rows: TaskRollupRow[] = [];
  for (let i = 0; i < linked.length; i++) {
    const result = settled[i] as PromiseSettledResult<Awaited<ReturnType<BacklogAdapter["viewTask"]>>>;
    if (result.status === "rejected") {
      // A read that FAILED (not a clean not-found null) is Backlog drift — hard-fail on the first,
      // in tasks: order, before any partial rollup or advisory is emitted.
      throw result.reason;
    }
    if (result.value === null) {
      dangling.push(linked[i] as string);
      continue;
    }
    rows.push({ id: result.value.id, title: result.value.title, status: result.value.status });
  }
  if (dangling.length > 0) {
    warnDangling(dangling, options);
  }

  return status === undefined ? rows : rows.filter((row) => row.status.toLowerCase() === status.toLowerCase());
}

/**
 * Advise (on stderr) that one or more `tasks:` ids no longer resolve to a live Backlog task and were
 * dropped from the rollup — a coupling gap worth surfacing without failing the read (`lore orphans`
 * is the CI-grade report). Silent when no stderr sink is wired.
 */
function warnDangling(ids: readonly string[], options: TasksOptions): void {
  if (options.stderr === undefined) {
    return;
  }
  const noun = ids.length === 1 ? "task" : "tasks";
  const message = `warning: ${ids.length} linked ${noun} not in Backlog, dropped from the rollup: ${ids.join(", ")}`;
  options.stderr.write(`${paint(message, ANSI.yellow, options.output.color)}\n`);
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `tasks`'s tokens into the required `<id>` positional and the value flag `--status <S>` (also
 * accepting the `--status=value` form). The router has already stripped lore's global flags, so a
 * `--`-prefixed token here is a command flag: an unrecognized one, a repeated/value-less `--status`, a
 * missing `<id>`, or a second positional is a `usage` error (exit 2). A `--` ends option parsing. The
 * `<id>` is {@link idFromPath}-normalized so path/`.md`/`./` forms resolve (mirrors `lore context`).
 */
function parseTasksArgs(args: readonly string[]): TasksArgs {
  const positionals: string[] = [];
  let status: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const inline = eq === -1 ? undefined : body.slice(eq + 1);
      if (name === "status") {
        if (status !== undefined) {
          throw usage("--status given more than once", "pass --status at most once");
        }
        status = readValue("--status", inline, args, i);
        if (inline === undefined) {
          i++;
        }
      } else {
        throw usage(`unknown option "--${name}"`, "run `lore tasks --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore tasks --help` to list options");
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length === 0) {
    throw usage("missing concept <id>", "give the concept whose task rollup to show, e.g. `lore tasks stories/x`");
  }
  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore tasks <id> [--status <S>]`");
  }
  return { id: idFromPath(positionals[0] as string), status };
}

/**
 * Read a value flag's argument: its inline `--flag=value` form when present, else the **next** token.
 * A missing/empty value — or a next token that is itself an option — is a `usage` error rather than a
 * silently swallowed flag (mirrors `lore context`'s value-flag guard).
 */
function readValue(flag: string, inline: string | undefined, args: readonly string[], i: number): string {
  if (inline !== undefined) {
    if (inline === "") {
      throw usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} "In Progress"\``);
    }
    return inline;
  }
  const next = args[i + 1];
  if (next === undefined || next === "" || (next.startsWith("-") && next !== "-")) {
    throw usage(`${flag} needs a value`, `pass a value, e.g. \`${flag} "In Progress"\``);
  }
  return next;
}

// ── Output ─────────────────────────────────────────────────────────────────────

/**
 * The rendering bundle for `tasks` (output.ts dispatches on the mode). `--json` carries the structured
 * {@link TaskRollup}; the pretty/plain text is an aligned table. The two text modes differ only in the
 * painted header, so they share one renderer.
 */
function tasksRenderable(data: TaskRollup): Renderable<TaskRollup> {
  return {
    kind: "tasks.rollup",
    data,
    pretty: (d, opts) => renderTable(d, opts.color),
    plain: (d) => renderTable(d, false),
  };
}

/**
 * A human/pipe-stable rollup: a header naming the concept, its live task count, and the `--status`
 * filter (when any), then one `  <id>  <status>  <title>` row per live task (columns padded to align).
 * An empty rollup renders a single explanatory line. ANSI only on the header, and only when `color`.
 */
function renderTable(data: TaskRollup, color: boolean): string {
  const filter = data.status !== undefined ? `, status "${data.status}"` : "";
  const noun = data.tasks.length === 1 ? "task" : "tasks";
  const header = paint(`tasks: ${data.concept} — ${data.tasks.length} ${noun}${filter}`, ANSI.green, color);
  if (data.tasks.length === 0) {
    return `${header}\n${data.status !== undefined ? "(no linked tasks match that status)" : "(no linked tasks)"}`;
  }
  const idWidth = Math.max(...data.tasks.map((row) => row.id.length));
  const statusWidth = Math.max(...data.tasks.map((row) => row.status.length));
  const rows = data.tasks.map((row) => `  ${row.id.padEnd(idWidth)}  ${row.status.padEnd(statusWidth)}  ${row.title}`);
  return [header, ...rows].join("\n");
}
