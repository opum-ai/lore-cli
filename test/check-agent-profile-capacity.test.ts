/**
 * `lore check` reports a profile whose declared sources cannot fit its `max_tokens` budget
 * (LCLI-642, DEC-11). The gate is CAPACITY — declared sources against the budget, computed from the
 * declaration alone — and deliberately NOT the omission a real task's pack shows: a task-ranked pack
 * drops sources on almost every task while being perfectly within capacity, so a check built on a
 * compiled pack would false-positive on this repository's own profiles (LCLI-642's first note has
 * that measurement).
 *
 * The cases are tagged so a mutation of the capacity comparison can be PREDICTED from this file
 * alone, per the fleet's mutate-the-check rule:
 *
 *   [capacity]      2 cases: the comparison's outcome on an over-declared fixture -> RED when the
 *                   comparison is removed.
 *   [count]         2 cases: what the report says it read. The over-capacity count case -> RED too
 *                   (it comes from the same comparison); the printed-line case on a fitting
 *                   fixture -> stays GREEN.
 *   [silent]        1 case: a profile that fits -> stays GREEN.
 *   [measurable]    1 case: an anchor nested in a blockquote is measured like any other, because
 *                   renderer and validator share one heading enumeration (LCLI-647, DEC-22 A;
 *                   before the fix this profile was declined) -> RED if the renderer regresses to
 *                   top-level-only headings and the profile declines again.
 *   [unmeasurable]  3 cases: a profile this bundle cannot measure (a qualified reference that does
 *                   not resolve, and a qualified reference whose anchor cannot resolve) -> stay
 *                   GREEN.
 *   [severity]      2 cases: the DEC-11 severity plumbing. The builder-level case is hand-built and
 *                   stays GREEN; the command-level case also asserts a finding exists, so it goes
 *                   RED with the comparison.
 *   [pack-size]     1 case: the measurement counts what a real pack pays, with score annotations at
 *                   full width -> RED if the annotation is dropped from it, or if its placeholder
 *                   renders narrower than a real score (LCLI-662 completed F2's intent).
 *   [query-reserve] 1 case: the worst-case bundle-wide query section is reserved, so a budget the
 *                   measurement certifies holds every declared candidate for a task with three
 *                   bundle-wide hits -> RED if the reserve is removed from `declaredTokens`.
 *
 * Measured against that map (re-measured 2026-10-01 over the 12 cases here, after LCLI-662 added
 * [query-reserve]): forcing the comparison false reddens 4 of 12 (both [capacity], the
 * over-capacity [count], the command-level [severity]); removing the query-section reserve reddens
 * [query-reserve] alone, 1 of 12; rendering the score placeholder at one character reddens
 * [pack-size] alone, 1 of 12. The map is written out because predicting the subset from the file is the
 * point.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import {
  type AgentProfileCapacity,
  compileAgentContext,
  compileAgentContextWithoutQueryHits,
  measureAgentProfileCapacity,
} from "../src/core/agent-context";
import { loadAgentProfiles } from "../src/core/agent-profile";
import { loadBundle } from "../src/core/bundle";
import { AGENT_PROFILE_CAPACITY_SEVERITY, agentProfileCapacityFindings, tallySeverity } from "../src/core/check";
import { loadProfile } from "../src/core/profile";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

interface FindingJson {
  readonly severity: string;
  readonly rule: string;
  readonly file?: string;
  readonly message: string;
}

interface CheckJson {
  readonly findings: FindingJson[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly agentProfileCounts?: { readonly read: number; readonly overCapacity: number; readonly unmeasurable: number };
}

/** A Reference with a body of about `tokens` tokens (the estimate is chars/4, so 4 chars per token). */
function referenceDoc(title: string, tokens: number): string {
  const body = `Sentence about ${title.toLowerCase()} evidence and its shape. `.repeat(1);
  const filler = `${body}`.padEnd(Math.max(1, tokens * 4), "x");
  return `---\ntype: Reference\ntitle: ${title}\n---\n\n# ${title}\n\n${filler}\n`;
}

function profileToml(name: string, maxTokens: number, sources: readonly string[]): string {
  const list = sources.map((source) => `  "${source}",`).join("\n");
  return `schema_version = 1\nname = "${name}"\ndescription = "fixture profile ${name}"\nkind = "specialist"\nmax_tokens = ${maxTokens}\nsources = [\n${list}\n]\n`;
}

describe("lore check gates agent profile capacity (LCLI-642, DEC-11)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-check-capacity-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
    mkdirSync(join(root, ".lore", "agents"), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeDoc(rel: string, contents: string): void {
    const abs = join(root, "docs", rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }

  function writeProfile(name: string, maxTokens: number, sources: readonly string[]): void {
    writeFileSync(join(root, ".lore", "agents", `${name}.toml`), profileToml(name, maxTokens, sources));
  }

  /** `lore check --json`: exit code and the whole report. No fixture here links a task, so it is synchronous. */
  function check(args: string[] = []): { code: number; report: CheckJson } {
    const stdout = capture();
    const code = runCheck({ root, output: JSON_CTX, args, stdout, stderr: capture() });
    if (typeof code !== "number") {
      throw new Error("expected a synchronous check: no fixture in this file links a task");
    }
    return { code, report: JSON.parse(stdout.text()).data as CheckJson };
  }

  /** The over-declared fixture: ~8000 tokens declared against a 4000-token budget. */
  function overDeclared(): void {
    writeDoc("reference/big.md", referenceDoc("Big", 8000));
    writeDoc("reference/small.md", referenceDoc("Small", 200));
    writeProfile("over", 4000, ["reference/big", "reference/small"]);
  }

  /** The same declaration with a budget that holds all of it. */
  function fitting(): void {
    writeDoc("reference/big.md", referenceDoc("Big", 8000));
    writeDoc("reference/small.md", referenceDoc("Small", 200));
    writeProfile("fits", 20000, ["reference/big", "reference/small"]);
  }

  test("[capacity] an over-declared profile warns, naming the profile, its budget and the source that cannot fit", () => {
    overDeclared();
    const { code, report } = check();
    const findings = report.findings.filter((finding) => finding.rule === "agent-profile-capacity");
    expect(findings).toHaveLength(1);
    const finding = findings[0] as FindingJson;
    // The profile is the finding's file: the declaration that cannot fit, not a document inside it.
    expect(finding.file).toBe(".lore/agents/over.toml");
    expect(finding.message).toContain('"over"');
    expect(finding.message).toContain("4000-token budget");
    expect(finding.message).toContain("reference/big");
    // What the gate does about it is the [severity] cases' subject, and is written against the
    // constant there so DEC-11's flip moves one production line and no assertion.
    expect(finding.severity).toBe(AGENT_PROFILE_CAPACITY_SEVERITY);
    // The fixture produces this one finding and nothing else, so a failure here is about the profile
    // and never about an unrelated fixture defect. What the gate does with it is the [severity]
    // cases' subject; this case is about the report.
    expect(report.findings).toHaveLength(1);
    expect(typeof code).toBe("number");
  });

  test("[capacity] the fixture's declared set really is over its budget (positive control on the instrument)", () => {
    overDeclared();
    const snapshot = loadAgentProfiles(root);
    const graph = loadBundle(join(root, "docs"), { profile: loadProfile({ root }) });
    const capacity = measureAgentProfileCapacity(
      snapshot.profiles.get("over") as NonNullable<ReturnType<typeof snapshot.profiles.get>>,
      graph,
      snapshot,
    );
    // Without this, the [capacity] case above would pass on a fixture that never crossed the line:
    // the measurement itself must show the shortfall, and name the source that causes it.
    expect(capacity?.overCapacity).toBe(true);
    expect(capacity?.declaredTokens).toBeGreaterThan(4000);
    expect(capacity?.sources.find((source) => source.reference === "reference/big")?.fits).toBe(false);
    expect(capacity?.sources.find((source) => source.reference === "reference/small")?.fits).toBe(true);
  });

  test("[silent] a profile whose declared set fits is not reported, however a task's pack would rank it", () => {
    fitting();
    const { code, report } = check();
    expect(report.findings.filter((finding) => finding.rule === "agent-profile-capacity")).toHaveLength(0);
    expect(report.warningCount).toBe(0);
    expect(code).toBe(EXIT_OK);
  });

  test("[count] the report says how many profiles it read, and how many are over capacity", () => {
    overDeclared();
    const { report } = check();
    expect(report.agentProfileCounts).toEqual({ read: 1, overCapacity: 1, unmeasurable: 0 });
  });

  test("[count] the printed line carries the same counts, so a clean answer is never a zero-input artifact", () => {
    fitting();
    const stdout = capture();
    const code = runCheck({ root, output: PLAIN_CTX, args: [], stdout, stderr: capture() });
    expect(code).toBe(EXIT_OK);
    expect(stdout.text()).toContain("Agent profiles: 1 read, 0 over capacity");
  });

  test("[measurable] an anchor nested in a blockquote is measured, not declined (review F1, LCLI-647)", () => {
    // This case used to assert the opposite. A heading nested in a blockquote WAS visible only to
    // `validateAgentProfileReferences` (it walked every mdast node) while the renderer read
    // top-level headings only, so the reference validated and then threw — an uncaught exit 1 with
    // no report — and `lore check` could only decline to measure it. Since LCLI-647 (DEC-22 A) both
    // readers share one heading enumeration, the profile is measured like any other.
    writeDoc(
      "reference/nested.md",
      "---\ntype: Reference\ntitle: Nested\n---\n\n# Nested\n\n> ## Quoted heading\n>\n> Body.\n",
    );
    writeProfile("nested", 4000, ["reference/nested#quoted-heading"]);
    const { code, report } = check();
    expect(report.agentProfileCounts).toEqual({ read: 1, overCapacity: 0, unmeasurable: 0 });
    expect(report.findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("[unmeasurable] a qualified reference whose anchor cannot resolve is declined, not thrown on", () => {
    // The remaining anchor-shape decline after LCLI-647: the validator deliberately skips qualified
    // `member::id` references, so a typo'd anchor on one reaches the renderer, which refuses with a
    // classifiable `validation` error. `lore check` counts the profile unmeasurable rather than
    // turning that into a finding about a declaration it cannot read in this bundle.
    writeDoc("reference/big.md", referenceDoc("Big", 200));
    writeProfile("typo", 4000, ["other-member::reference/big#no-such-heading"]);
    const { code, report } = check();
    expect(report.agentProfileCounts).toEqual({ read: 0, overCapacity: 0, unmeasurable: 1 });
    expect(report.findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("[pack-size] the measurement pays what a real pack pays, score annotations at full width (review F2, completed by LCLI-662)", () => {
    // The measurement must stand for the pack a REAL task would compile, not only for one that
    // matched nothing: `compilePack` scores every candidate and the renderer spends bytes on that
    // annotation, per item and per catalog line. The fixture is MANY small candidates on purpose:
    // the annotation is a per-item cost, so a big-token fixture would bury it under the margin and
    // the case would pass with the annotation missing — precisely the mutation it exists to catch.
    //
    // The task MATCHES the sections, so the real pack renders ordinary BM25 scores (`0.142617`,
    // seven characters here) where the measurement renders its fixed-width placeholder. That is the
    // second half of F2, added by LCLI-662: the original fixture's task matched nothing, so every
    // real score rendered as `0` — one character, the same width as the old `1` placeholder — and a
    // placeholder that strips to one character passed this case while the measurement ran hundreds
    // of tokens small on any task that matched.
    const sections = ["---\ntype: Reference\ntitle: Many\n---\n\n# Many\n"];
    for (let index = 0; index < 40; index++) {
      sections.push(`\n## Section ${index}\n\nzephyr quirk evidence ${index}. ${"y".repeat(380)}\n`);
    }
    writeDoc("reference/many.md", sections.join(""));
    writeProfile("many", 200000, ["reference/many"]);

    const snapshot = loadAgentProfiles(root);
    const graph = loadBundle(join(root, "docs"), { profile: loadProfile({ root }) });
    const capacity = measureAgentProfileCapacity(
      snapshot.profiles.get("many") as NonNullable<ReturnType<typeof snapshot.profiles.get>>,
      graph,
      snapshot,
    ) as AgentProfileCapacity;
    // Positive control on the fixture: it really did partition into many candidates, so the
    // per-item annotation it is testing is a large share of the margin below.
    expect(capacity.sources[0]?.candidateCount).toBeGreaterThan(20);

    const compile = (maxTokens: number) =>
      compileAgentContextWithoutQueryHits(snapshot, graph, "many", "zephyr quirk", maxTokens);
    // The declared set alone — the worst-case section subtracted, because this case is about the
    // annotation and the section is the [query-reserve] case's subject — already holds the real
    // hit-free pack, scores and all. That is the narrowing placeholder's failure: with it, the
    // declared set is ~6 characters per item short of the pack it stands for, and this assertion
    // reddens. Measured against the fix: the declared set is 6134 against a real pack of 6133.
    const declaredSetTokens = capacity.declaredTokens - capacity.querySectionReserve;
    expect(compile(declaredSetTokens).truncated).toBe(false);
    // And the whole measurement, section included, holds it with room to spare; 400 is comfortably
    // more than the reserves this fixture can carry, so a budget that far under must drop.
    expect(compile(capacity.declaredTokens).truncated).toBe(false);
    expect(compile(capacity.declaredTokens - 400).truncated).toBe(true);
  });

  test("[query-reserve] a certified profile's real pack holds every declared candidate for a task with bundle-wide hits (LCLI-662, DEC-98 B)", () => {
    // LCLI-662's repro, as a property: the declared set fits the budget, the task matches three
    // documents the profile does NOT declare, so the real pack carries a full three-hit query
    // section — and before the reserve that section's cost was what pushed a declared source out
    // (`omitted-by-budget`) while `lore check` stayed green.
    writeDoc("evidence/alpha.md", referenceDoc("Alpha", 2000));
    writeDoc("evidence/beta.md", referenceDoc("Beta", 700));
    writeDoc("other/one.md", referenceDoc("Zephyr one", 400));
    writeDoc("other/two.md", referenceDoc("Zephyr two", 400));
    writeDoc("other/three.md", referenceDoc("Zephyr three", 400));
    writeProfile("probe", 200000, ["evidence/alpha", "evidence/beta"]);

    const snapshot = loadAgentProfiles(root);
    const graph = loadBundle(join(root, "docs"), { profile: loadProfile({ root }) });
    const capacity = measureAgentProfileCapacity(
      snapshot.profiles.get("probe") as NonNullable<ReturnType<typeof snapshot.profiles.get>>,
      graph,
      snapshot,
    ) as AgentProfileCapacity;
    // Positive control on the reserve: this fixture has concepts outside the pack, so the section
    // the measurement must stand for is non-trivial.
    expect(capacity.querySectionReserve).toBeGreaterThan(0);

    const TASK = "zephyr migration quirk";
    const withHits = compileAgentContext(snapshot, graph, "probe", TASK, capacity.declaredTokens);
    const withoutHits = compileAgentContextWithoutQueryHits(snapshot, graph, "probe", TASK, capacity.declaredTokens);
    // The reserve really covers the section a real task renders: the pack with hits is larger than
    // the hit-free one, and still fits the measured budget with every declared candidate selected.
    expect(withHits.tokenEstimate).toBeGreaterThan(withoutHits.tokenEstimate);
    expect(withHits.tokenEstimate - withoutHits.tokenEstimate).toBeLessThanOrEqual(capacity.querySectionReserve);
    expect(withHits.truncated).toBe(false);
    expect(withHits.catalog.filter((entry) => entry.selectedCount === 0)).toEqual([]);
  });

  test("[unmeasurable] a profile this bundle cannot resolve is counted, never silently treated as fitting", () => {
    writeDoc("reference/small.md", referenceDoc("Small", 200));
    // A qualified reference resolves only under `--workspace` (LCLI-432), so bare `lore check` must
    // not claim to have measured this profile — and must not warn about it either.
    writeProfile("elsewhere", 4000, ["other-member::reference/absent"]);
    const { code, report } = check();
    expect(report.agentProfileCounts).toEqual({ read: 0, overCapacity: 0, unmeasurable: 1 });
    expect(report.findings.filter((finding) => finding.rule === "agent-profile-capacity")).toHaveLength(0);
    expect(code).toBe(EXIT_OK);
  });

  test("[severity] both sides of DEC-11's flip are wired: the builder's severity decides the tally", () => {
    const capacity: AgentProfileCapacity = {
      name: "fixture",
      path: ".lore/agents/fixture.toml",
      maxTokens: 100,
      declaredTokens: 200,
      querySectionReserve: 12,
      overCapacity: true,
      sources: [{ reference: "reference/big", declaredTokens: 200, includedCount: 0, candidateCount: 1, fits: false }],
    };
    const warning = agentProfileCapacityFindings([capacity], "warning");
    expect(tallySeverity(warning)).toEqual({ errorCount: 0, warningCount: 1 });
    const error = agentProfileCapacityFindings([capacity], "error");
    expect(tallySeverity(error)).toEqual({ errorCount: 1, warningCount: 0 });
    // Same finding either way: the flip changes severity, never the rule, the file or the message.
    expect(error.map((finding) => finding.message)).toEqual(warning.map((finding) => finding.message));
    expect(error[0]?.rule).toBe("agent-profile-capacity");
  });

  test("[severity] the command reports at the constant's severity, and the exit code follows it", () => {
    overDeclared();
    const { code, report } = check();
    const finding = report.findings.find((candidate) => candidate.rule === "agent-profile-capacity") as FindingJson;
    expect(finding.severity).toBe(AGENT_PROFILE_CAPACITY_SEVERITY);
    // The exit code is the severity's, not a second opinion — written against the constant so
    // DEC-11's flip stays ONE line: while the warning is in force the gate passes on its own, and
    // after the flip to `"error"` every over-capacity profile fails it. Neither branch here, nor any
    // other line in the suite, has to move for that.
    const gating = AGENT_PROFILE_CAPACITY_SEVERITY === "error";
    expect(code).toBe(gating ? EXIT_CODES.validation : EXIT_OK);
    expect(report.errorCount).toBe(gating ? 1 : 0);
    // `--strict` is the existing contract for every warning: advisory alone, failing under the flag.
    const strict = check(["--strict"]);
    expect(strict.code).toBe(EXIT_CODES.validation);
  });
});
