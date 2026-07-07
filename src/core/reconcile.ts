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
 * Per-repo `[reconcile.overrides]` (`.lore/config.toml`, LORE-26) lets a project map a specific
 * Backlog status straight to a {@link ReconciledStatus}, bypassing `statusFlow` position entirely —
 * the escape hatch for a status an ordered flow cannot classify unambiguously (see
 * {@link reconcileStatus}'s `overrides` parameter).
 *
 * Per the core contract (lore-design §2.1) this module is pure: two string arrays (plus an optional
 * overrides map) in, a derived status (or `null`) or a typed {@link LoreError} out — no filesystem,
 * no spawn, no clock. Reading `backlog/config.yml` and resolving each task's live status are
 * command-layer concerns, kept out of this engine so it stays a single deterministic function over
 * already-resolved data.
 *
 * [ADR-0009]: ../../docs/adr/0009-story-task-coupling-reconciliation.md
 */

import { LoreError } from "../errors";

/** The three derived rollup values (ADR-0009 §3, backlog-cli-contract.md §3.2). */
export type ReconciledStatus = "todo" | "in-progress" | "done";

/** The closed set {@link ReconciledStatus} draws from, for validating a `[reconcile.overrides]` target. */
const RECONCILED_STATUSES: readonly ReconciledStatus[] = ["todo", "in-progress", "done"];

/** Where one task's status falls in the project's ordered {@link StatusFlow}. */
type StatusPosition = "not-started" | "active" | "terminal";

/**
 * Per-repo `[reconcile.overrides]` (`.lore/config.toml`, `config.ts`'s {@link ReconcileConfig.overrides}):
 * a raw Backlog status string → the {@link ReconciledStatus} it should contribute to the rollup,
 * **bypassing** {@link StatusFlow} position entirely for that status (ADR-0009 §3). `config.ts` parses
 * this as an unvalidated `Record<string, string>` — "reconcile.ts owns the rollup-status vocabulary and
 * its semantics" (config.ts) — so {@link reconcileStatus} is where an out-of-vocabulary target value is
 * caught.
 */
export type StatusOverrides = Readonly<Record<string, string>>;

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
 * @param overrides per-repo `[reconcile.overrides]` (default `{}`): a status matching a key here
 *   contributes its mapped {@link ReconciledStatus} directly, bypassing `statusFlow` position
 *   entirely — the escape hatch for a status a strict ordered flow cannot classify unambiguously
 *   (a bespoke `Cancelled`/`Won't Fix` state, or one a team added without reordering `statuses:`).
 *   Takes precedence over position even when the status is *also* present in `statusFlow`.
 * @returns the rolled-up status, or `null` when there are no linked tasks.
 * @throws LoreError `validation` when `statusFlow` has fewer than two entries, is empty, or
 *   carries a duplicate entry (an ambiguous flow lore cannot classify against — ADR-0009 "must
 *   report rather than guess"), when an override's target is not one of `todo`/`in-progress`/
 *   `done`, or when a task's status is not present in `statusFlow` **and** has no override (a
 *   config/task drift lore refuses to guess past).
 */
export function reconcileStatus(
  taskStatuses: readonly string[],
  statusFlow: StatusFlow,
  overrides: StatusOverrides = {},
): ReconciledStatus | null {
  if (taskStatuses.length === 0) {
    return null;
  }
  validateStatusFlow(statusFlow);
  const validatedOverrides = validateOverrides(overrides);
  const positions = taskStatuses.map((status) => classify(status, statusFlow, validatedOverrides));
  if (positions.every((position) => position === "terminal")) {
    return "done";
  }
  if (positions.some((position) => position === "active")) {
    return "in-progress";
  }
  return "todo";
}

/**
 * Validate `statusFlow`/`overrides` up front, without needing any task data — the fail-fast half of
 * {@link reconcileStatus} exposed on its own so a caller resolving many tasks per invocation (e.g.
 * `lore sync`, one Backlog subprocess round-trip per linked task) can catch a semantically-broken
 * config (a degenerate flow, an out-of-vocabulary override target) **before** spending any of that
 * work — `reconcileStatus` itself only reaches this validation once real task data is in hand,
 * which is too late for that fail-fast property alone. Re-validates the same inputs
 * `reconcileStatus` will validate again per call; see that function's own note on why the
 * redundancy is accepted rather than threading a pre-validated value through its signature.
 *
 * @throws LoreError `validation` — see {@link reconcileStatus}'s throws for the exact conditions.
 */
export function validateReconcileInputs(statusFlow: StatusFlow, overrides: StatusOverrides = {}): void {
  validateStatusFlow(statusFlow);
  validateOverrides(overrides);
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
 * Validate a `[reconcile.overrides]` map and return it keyed for safe, exhaustive lookup: a `Map`
 * (not the input `Record`) so a status string that happens to name an `Object.prototype` member
 * (`constructor`, `toString`, …) can never resolve to an inherited value instead of a real miss —
 * the same class of hazard `config.ts`'s `asStringMap` guards on the write side.
 *
 * @throws LoreError `validation` naming the offending status and target when a target is not one
 *   of {@link RECONCILED_STATUSES} — `config.ts` deliberately leaves this vocabulary check to
 *   reconcile.ts (its own header comment), so a bad `.lore/config.toml` value is caught here.
 */
function validateOverrides(overrides: StatusOverrides): ReadonlyMap<string, ReconciledStatus> {
  const validated = new Map<string, ReconciledStatus>();
  for (const [status, target] of Object.entries(overrides)) {
    if (!isReconciledStatus(target)) {
      throw new LoreError(
        "validation",
        `cannot reconcile status: [reconcile.overrides] maps ${JSON.stringify(status)} to ${JSON.stringify(target)}, which is not a valid rollup status`,
        `set [reconcile.overrides] "${status}" in .lore/config.toml to one of: ${RECONCILED_STATUSES.join(", ")}`,
        { status, target, valid: RECONCILED_STATUSES },
      );
    }
    validated.set(status, target);
  }
  return validated;
}

/** Narrow an override's raw string target to {@link ReconciledStatus}, for {@link validateOverrides}. */
function isReconciledStatus(value: string): value is ReconciledStatus {
  return (RECONCILED_STATUSES as readonly string[]).includes(value);
}

/**
 * Classify one task's raw `status` string, checking `overrides` before falling back to its index in
 * `statusFlow`: the first entry is not-started, the last is terminal, everything between is active.
 * Matching is exact-string (Backlog status labels are canonical configured strings, verbatim in the
 * `--json` payload — not user-typed free text lore case-folds elsewhere).
 *
 * @throws LoreError `validation` when `status` has no override and is absent from `statusFlow` entirely.
 */
function classify(
  status: string,
  statusFlow: StatusFlow,
  overrides: ReadonlyMap<string, ReconciledStatus>,
): StatusPosition {
  const override = overrides.get(status);
  if (override !== undefined) {
    return positionForOverride(override);
  }
  const index = statusFlow.indexOf(status);
  if (index === -1) {
    throw new LoreError(
      "validation",
      `cannot reconcile status: task status ${JSON.stringify(status)} is not in the project's configured status flow (${statusFlow.map((s) => JSON.stringify(s)).join(", ")}) and has no [reconcile.overrides] entry`,
      "the task's status must match one of `backlog/config.yml`'s `statuses:` exactly, or add a `[reconcile.overrides]` entry for it in .lore/config.toml",
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

/** Map an override's validated target directly to the {@link StatusPosition} the aggregation rule expects. */
function positionForOverride(target: ReconciledStatus): StatusPosition {
  switch (target) {
    case "done":
      return "terminal";
    case "in-progress":
      return "active";
    case "todo":
      return "not-started";
  }
}
