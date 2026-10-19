/**
 * LCLI-669 / DEC-192 — the OKF lifecycle `status` enum (`draft`/`stable`/`deprecated`) is enforced
 * on ADR documents on EVERY OKF version, and ONLY there on 0.1, because on 0.1 the same `status`
 * field is the task-rollup key for task-coupled types (`check.ts`'s version-selected rollup) whose
 * vocabulary is `todo`/`in-progress`/`done`. Proved both ways on both versions, plus the rollup
 * carve-out that made the broad reading wrong.
 *
 * The rollup carve-out below holds for the BUILT-IN profile, whose base `status` is an OPEN optional
 * string. It does NOT hold for a profile that CLOSES `status` on a 0.1 task-coupled type: there the
 * generated TYPE SCHEMA refuses the rollup value before the lifecycle check is reached. That scoping
 * is LCLI-730 (DEC-192 (8), (10)) — the `task-status-enum-inherited` warning names it.
 */
import { describe, expect, test } from "bun:test";
import type { BundleState } from "../src/core/okf-version";
import { defaultProfile } from "../src/core/profile";
import { validateFrontmatter } from "../src/core/schema";

const V01: BundleState = { okfVersion: "0.1", source: "legacy-missing" };
const V02: BundleState = { okfVersion: "0.2", source: "declared" };

function validate(fm: Record<string, unknown>, state: BundleState, path: string): () => unknown {
  return () => validateFrontmatter(fm, { profile: defaultProfile(), bundleState: state, path });
}

describe("lifecycle status enum — ADRs, both OKF versions (LCLI-669, DEC-192)", () => {
  for (const [label, state, dir] of [
    ["0.1", V01, "docs/adr/0001-x.md"],
    ["0.2", V02, "docs/adr/0001-x.md"],
  ] as const) {
    test(`${label}: an out-of-enum ADR status is an error, naming the value`, () => {
      for (const bad of ["superseded", "done"]) {
        expect(validate({ type: "ADR", status: bad }, state, dir)).toThrow(/invalid OKF lifecycle status/);
        expect(validate({ type: "ADR", status: bad }, state, dir)).toThrow(new RegExp(`got "${bad}"`));
      }
    });

    test(`${label}: each of the three valid lifecycle values passes`, () => {
      for (const good of ["draft", "stable", "deprecated"]) {
        expect(validate({ type: "ADR", status: good }, state, dir)).not.toThrow();
      }
    });
  }

  test("0.1: a Story carrying the ROLLUP vocabulary in `status` still passes ON THE BUILT-IN profile, whose base `status` is OPEN (the carve-out)", () => {
    // Scoped to the BUILT-IN profile (LCLI-730, DEC-192 (8), (10)): `validate` compiles
    // `defaultProfile()`, whose base `status` is an OPEN optional string, so the generated TYPE
    // SCHEMA accepts any value and only the lifecycle check could refuse it — and on 0.1 that check
    // returns early for a non-ADR type, leaving the rollup vocabulary alone. The claim is FALSE for
    // a profile that CLOSES `status`: there the type schema refuses `status: done` before the
    // lifecycle check is reached, which is exactly what the `task-status-enum-inherited` warning
    // (LCLI-730) names. On 0.1 `status` IS the task-rollup key, or the whole status-drift surface
    // breaks (this is the 38 -> 9 finding, decided by the leader).
    for (const rollup of ["todo", "in-progress", "done"]) {
      expect(validate({ type: "Story", status: rollup }, V01, "docs/stories/x.md")).not.toThrow();
    }
  });

  test("0.2: the same Story status is NOT a lifecycle value, so the enum does reach it there", () => {
    expect(validate({ type: "Story", status: "done" }, V02, "docs/stories/x.md")).toThrow(
      /invalid OKF lifecycle status/,
    );
  });
});
