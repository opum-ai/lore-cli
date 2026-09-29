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
 *   [capacity]      asserts the comparison's outcome on an over-declared fixture -> RED when the
 *                   comparison is removed.
 *   [count]         asserts what the report says it read, over the same fixture -> RED too (the
 *                   over-capacity count comes from the same comparison).
 *   [silent]        a profile that fits, and an over-budget-only-in-a-task sense -> stays GREEN.
 *   [unmeasurable]  a profile this bundle cannot measure -> stays GREEN.
 *   [severity]      the DEC-11 severity plumbing, on a hand-built measurement -> stays GREEN.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { type AgentProfileCapacity, measureAgentProfileCapacity } from "../src/core/agent-context";
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
