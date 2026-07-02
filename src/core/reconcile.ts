/**
 * reconcile.ts — roll a `Story`/`Spec`'s `tasks:`-linked Backlog statuses up into one derived
 * doc `status` (LORE-23, [ADR-0009] §3).
 *
 * A Story's `status` frontmatter is not authored once and left stale — it is **recomputed** from
 * the live statuses of the tasks it links, so a reader (or `lore check`'s drift gate) never sees a
 * doc claiming `done` while a linked task is still open. This module is the shared pure engine
 * behind that computation: the command layer (LORE-24+) resolves each linked task id to its raw
 * `status` string (the LORE-21 adapter's `viewTask`/`listTasks`) and reads the project's ordered
 * status flow from `backlog/config.yml` (`statuses:`), then calls {@link reconcileStatus}. `lore
 * sync` writes the result; `lore check` diffs it against the persisted `status` and never writes
 * (ADR-0007).
 *
 * Per the core contract (lore-design §2.1) this module is pure: two string arrays in, a derived
 * status (or `null`) or a typed {@link LoreError} out — no filesystem, no spawn, no clock. Reading
 * `backlog/config.yml` and resolving each task's live status are command-layer concerns, kept out
 * of this engine so it stays a single deterministic function over already-resolved data.
 *
 * [ADR-0009]: ../../docs/adr/0009-story-task-coupling-reconciliation.md
 */

import { LoreError } from "../errors";

/** The three derived rollup values (ADR-0009 §3, backlog-cli-contract.md §3.2). */
export type ReconciledStatus = "todo" | "in-progress" | "done";

/** Where one task's status falls in the project's ordered {@link StatusFlow}. */
type StatusPosition = "not-started" | "active" | "terminal";

/**
 * A project's status set, **ordered** exactly as configured (`backlog/config.yml` `statuses:` /
 * `backlog config get statuses`) — never the hardcoded `["To Do", "In Progress", "Done"]` default
 * (backlog-cli-contract.md §3.1). Index `0` is the not-started state; the last index is the
 * terminal ("done") state; everything between is an active/started state (`In Progress`,
 * `Review`, `Testing`, `Blocked`, …). Reading this from config is a command-layer concern — this
 * engine only consumes the resolved list. Must carry **at least two** entries: a single-entry flow
 * cannot distinguish "not started" from "terminal" ({@link reconcileStatus} rejects it).
 */
export type StatusFlow = readonly string[];

/**
 * Roll `taskStatuses` — the raw `status` string of every task a Story links via its `tasks:`
 * frontmatter — up into one {@link ReconciledStatus}, per `statusFlow`'s config-driven ordering
 * (ADR-0009 §3):
 *
 * - `taskStatuses` empty (no linked tasks) → `null`: a narrative-only doc's authored `status` is
 *   never overwritten (AC#2) — the caller leaves the doc's existing `status` untouched.
 * - every linked task's status is `statusFlow`'s **last** (terminal) entry → `"done"`.
 * - any linked task's status is **neither** first nor last (an active/started state) →
 *   `"in-progress"`.
 * - otherwise (tasks exist, none active, not all terminal) → `"todo"`.
 *
 * The three rules are applied by elimination, in that order, exactly as backlog-cli-contract.md
 * §3.2 states it. One corner case follows directly from the literal rule and is intentional, not
 * a bug: a Story linking only a `Done` task and a `To Do` task (no task in an explicit mid-flow
 * status) rolls up to `"todo"`, not `"in-progress"` — "in-progress" is defined purely by the
 * presence of an active-state task, not by partial completion among terminal/not-started tasks.
 *
 * @param taskStatuses the raw configured `status` string of every linked task (AC#1: any custom
 *   flow, not just the three defaults), in any order — order does not affect the rollup.
 * @param statusFlow the project's ordered status set, resolved from Backlog config.
 * @returns the rolled-up status, or `null` when there are no linked tasks.
 * @throws LoreError `validation` when `statusFlow` has fewer than two entries, is empty, or
 *   carries a duplicate entry (an ambiguous flow lore cannot classify against — ADR-0009 "must
 *   report rather than guess"), or when a task's status is not present in `statusFlow` at all (a
 *   config/task drift lore refuses to guess past).
 */
export function reconcileStatus(taskStatuses: readonly string[], statusFlow: StatusFlow): ReconciledStatus | null {
  if (taskStatuses.length === 0) {
    return null;
  }
  validateStatusFlow(statusFlow);
  const positions = taskStatuses.map((status) => classify(status, statusFlow));
  if (positions.every((position) => position === "terminal")) {
    return "done";
  }
  if (positions.some((position) => position === "active")) {
    return "in-progress";
  }
  return "todo";
}

/**
 * Reject a `statusFlow` lore cannot classify against unambiguously: fewer than two entries (with
 * only one entry, index `0` is simultaneously the not-started **and** the terminal position — the
 * two roles {@link classify} treats as distinct would silently collapse to the same index) or
 * carrying a duplicate entry (an entry's position — and so its not-started/active/terminal
 * classification — would depend on which occurrence is meant).
 */
function validateStatusFlow(statusFlow: StatusFlow): void {
  if (statusFlow.length < 2) {
    throw new LoreError(
      "validation",
      `cannot reconcile status: the project's configured status flow has ${statusFlow.length} ${statusFlow.length === 1 ? "entry" : "entries"} (need at least 2 to distinguish "not started" from "terminal")`,
      'set `statuses:` in `backlog/config.yml` to an ordered list of at least two statuses (e.g. ["To Do", "In Progress", "Done"])',
      { statusFlow },
    );
  }
  const seen = new Set<string>();
  for (const status of statusFlow) {
    if (seen.has(status)) {
      throw new LoreError(
        "validation",
        `cannot reconcile status: the project's configured status flow has a duplicate entry ${JSON.stringify(status)}`,
        "each entry in `backlog/config.yml`'s `statuses:` must be unique so its position in the flow is unambiguous",
        { statusFlow },
      );
    }
    seen.add(status);
  }
}

/**
 * Classify one task's raw `status` string by its index in `statusFlow`: the first entry is
 * not-started, the last is terminal, everything between is active. Matching is exact-string
 * (Backlog status labels are canonical configured strings, verbatim in the `--json` payload — not
 * user-typed free text lore case-folds elsewhere).
 *
 * @throws LoreError `validation` when `status` is absent from `statusFlow` entirely.
 */
function classify(status: string, statusFlow: StatusFlow): StatusPosition {
  const index = statusFlow.indexOf(status);
  if (index === -1) {
    throw new LoreError(
      "validation",
      `cannot reconcile status: task status ${JSON.stringify(status)} is not in the project's configured status flow (${statusFlow.map((s) => JSON.stringify(s)).join(", ")})`,
      "the task's status must match one of `backlog/config.yml`'s `statuses:` exactly; re-run `backlog config get statuses` to check for drift",
      { status, statusFlow },
    );
  }
  if (index === statusFlow.length - 1) {
    return "terminal";
  }
  if (index === 0) {
    return "not-started";
  }
  return "active";
}
