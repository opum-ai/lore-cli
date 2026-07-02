/**
 * reconcile.test.ts — the pure status-rollup engine (LORE-23, ADR-0009 §3).
 *
 * The two acceptance criteria are exercised directly:
 *   AC#1 — custom Backlog statuses (a 5-state flow, not the 3 defaults) map correctly.
 *   AC#2 — a doc with no linked tasks keeps its authored status (returns `null`).
 *
 * Plus the fail-loud guarantees ADR-0009 requires: an unrecognized task status and a degenerate
 * (empty/duplicate) status flow are both `LoreError` (validation, exit 6), and the literal
 * elimination-order corner case (a Done+To-Do-only mix rolls up to `"todo"`, not `"in-progress"`).
 */

import { describe, expect, test } from "bun:test";
import { reconcileStatus, type StatusFlow } from "../src/core/reconcile";
import { exitCodeFor, LoreError } from "../src/errors";

/** The Backlog default 3-state flow. */
const DEFAULT_FLOW: StatusFlow = ["To Do", "In Progress", "Done"];

/** A custom 5-state flow (AC#1): distinct not-started/terminal ends, three active middle states. */
const CUSTOM_FLOW: StatusFlow = ["To Do", "In Progress", "Review", "Testing", "Done"];

/** Run the thunk and return the {@link LoreError} it throws, failing the test if it does not throw. */
function loreError(run: () => unknown): LoreError {
  try {
    run();
  } catch (err) {
    if (err instanceof LoreError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected a LoreError to be thrown, but it returned");
}

describe("reconcileStatus — AC#2: no linked tasks keeps the authored status", () => {
  test("an empty taskStatuses array returns null regardless of the flow", () => {
    expect(reconcileStatus([], DEFAULT_FLOW)).toBeNull();
    expect(reconcileStatus([], CUSTOM_FLOW)).toBeNull();
  });
});

describe("reconcileStatus — default 3-state flow", () => {
  test("every task Done -> done", () => {
    expect(reconcileStatus(["Done", "Done"], DEFAULT_FLOW)).toBe("done");
  });

  test("any task In Progress -> in-progress", () => {
    expect(reconcileStatus(["Done", "In Progress"], DEFAULT_FLOW)).toBe("in-progress");
    expect(reconcileStatus(["To Do", "In Progress"], DEFAULT_FLOW)).toBe("in-progress");
  });

  test("every task To Do -> todo", () => {
    expect(reconcileStatus(["To Do", "To Do"], DEFAULT_FLOW)).toBe("todo");
  });

  test("a single task rolls up on its own classification", () => {
    expect(reconcileStatus(["To Do"], DEFAULT_FLOW)).toBe("todo");
    expect(reconcileStatus(["In Progress"], DEFAULT_FLOW)).toBe("in-progress");
    expect(reconcileStatus(["Done"], DEFAULT_FLOW)).toBe("done");
  });

  test("corner case: Done + To Do only (no explicit active-state task) rolls up to todo, not in-progress", () => {
    // Literal elimination order (cli-contract §3.2): "in-progress" requires a task in a
    // non-first, non-terminal state. Neither Done nor To Do qualifies, so this is NOT "every
    // task terminal" (falls through the "done" check) and falls to "todo" by elimination.
    expect(reconcileStatus(["Done", "To Do"], DEFAULT_FLOW)).toBe("todo");
  });
});

describe("reconcileStatus — AC#1: custom status flows map correctly, not hardcoded", () => {
  test("the custom flow's not-started/terminal ends are respected", () => {
    expect(reconcileStatus(["To Do", "To Do"], CUSTOM_FLOW)).toBe("todo");
    expect(reconcileStatus(["Done", "Done"], CUSTOM_FLOW)).toBe("done");
  });

  test("every one of the custom flow's three middle states counts as active", () => {
    expect(reconcileStatus(["In Progress", "To Do"], CUSTOM_FLOW)).toBe("in-progress");
    expect(reconcileStatus(["Review", "To Do"], CUSTOM_FLOW)).toBe("in-progress");
    expect(reconcileStatus(["Testing", "To Do"], CUSTOM_FLOW)).toBe("in-progress");
  });

  test("a status valid in the default flow but absent from a custom flow is fail-loud, not silently mapped", () => {
    // Proves the engine is NOT hardcoded to the 3 defaults: "In Progress" is a real Backlog
    // default status, but this project's custom flow spells it differently.
    const differentSpelling: StatusFlow = ["Backlog", "Doing", "Shipped"];
    const err = loreError(() => reconcileStatus(["In Progress"], differentSpelling));
    expect(err.type).toBe("validation");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("In Progress");
  });

  test("order in taskStatuses does not affect the rollup", () => {
    expect(reconcileStatus(["Done", "Review", "To Do"], CUSTOM_FLOW)).toBe(
      reconcileStatus(["To Do", "Done", "Review"], CUSTOM_FLOW),
    );
  });
});

describe("reconcileStatus — fail-loud on an unrecognized task status", () => {
  test("a status absent from the flow throws validation naming the status and the flow", () => {
    const err = loreError(() => reconcileStatus(["Blocked"], DEFAULT_FLOW));
    expect(err.type).toBe("validation");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("Blocked");
    expect(err.message).toContain("To Do");
  });

  test("one bad status among otherwise-valid ones still throws (fails loud, never partial)", () => {
    const err = loreError(() => reconcileStatus(["Done", "Archived"], DEFAULT_FLOW));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("Archived");
  });
});

describe("reconcileStatus — fail-loud on a degenerate status flow", () => {
  test("an empty status flow is a validation error (only reached once a task exists)", () => {
    const err = loreError(() => reconcileStatus(["Done"], []));
    expect(err.type).toBe("validation");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("empty");
  });

  test("a duplicate entry in the status flow is a validation error naming the duplicate", () => {
    const dupFlow: StatusFlow = ["To Do", "Done", "Done"];
    const err = loreError(() => reconcileStatus(["Done"], dupFlow));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("duplicate");
    expect(err.message).toContain("Done");
  });

  test("an empty taskStatuses array never validates the flow (AC#2 short-circuits first)", () => {
    // Even a degenerate flow is fine when there are no tasks to classify against it.
    expect(reconcileStatus([], [])).toBeNull();
  });
});
