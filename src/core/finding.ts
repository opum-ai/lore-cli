/**
 * finding.ts — the shared shape of a tiered lint/validation **finding**.
 *
 * `lore validate` (concept frontmatter/section/quote-safety checks) and `lore check`
 * (link/anchor + portability + external-liveness passes) each emit a list of typed problems.
 * Those two finding types had drifted into near-identical copies — the same `severity` tiering
 * and `{ severity, rule, message }` core, spelled twice (a `/code-review max` finding). This
 * module is the single home for that core so the two passes can never disagree on what a
 * finding *is*; each keeps only its own domain `rule` union (and `check` its per-file `file`
 * field) by parameterizing the shared shape.
 *
 * Pure types only — no runtime, no IO.
 */

/** The two finding tiers: an `error` fails the gate (exit 6); a `warning` is advisory. */
export type Severity = "error" | "warning";

/**
 * One tiered problem, parameterized by the domain `rule` union of the pass that raised it
 * ({@link import('./validate').FindingRule} for `validate`, {@link import('./check').CheckRule}
 * for `check`). The `severity`/`rule`/`message` core is shared; a pass that needs more (e.g.
 * `check`'s per-file attribution) intersects this with its own fields.
 */
export interface Finding<Rule extends string = string> {
  /** `error` (fails the gate / exit 6) or `warning` (advisory; fails only under `--strict`). */
  readonly severity: Severity;
  /** The pass-specific check that raised it. */
  readonly rule: Rule;
  /** A single-line, actionable description. */
  readonly message: string;
}
