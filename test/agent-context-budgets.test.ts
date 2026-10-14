/**
 * LCLI-682 — the four role profiles declare context-budget TARGETS, and the compiler MEASURES a
 * compiled pack against them and against ODOC-437 AC3's acceptance ceilings, and reports it
 * (MDL-7; DEC-187). Both arms are proved here: a pack within target reports it with no content
 * named, and an overrun sets `over` and NAMES the content that required it. Provenance rides with
 * every figure; a class lore does not compose is not-applicable (`measured: null` plus a `note`),
 * never a 0 or an absent key. A profile with no `[targets]` table is not reported at all.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/commands/agent";
import { compileAgentContext, renderAgentContextMarkdown } from "../src/core/agent-context";
import { loadAgentProfiles } from "../src/core/agent-profile";
import { loadBundle } from "../src/core/bundle";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const TASK = "checkout validation";
const JSON_OUTPUT: OutputContext = { mode: "json", color: false };
const DECLARED =
  "[targets]\npolicy_and_role = 3000\ntask_contract = 2000\ntask_evidence = 6000\nlore_subtotal = 11000\n";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agent-budgets-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function doc(rel: string, body: string, title: string): void {
  const path = join(root, "docs", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `---\ntype: Reference\ntitle: ${title}\nsummary: Summary for ${title}.\ntags: [evidence]\n---\n${body}`,
  );
}

/**
 * The two profile documents (pinned `reference/rules`, ranked `specs/ui`) plus an optional
 * `[targets]` tail. `pinPad` grows the pinned body so the AC3 authored-bootstrap ceiling can be
 * pushed over; `maxTokens` must then be large enough that the (never-truncated) pin still fits.
 */
function fixture(targets?: string, opts: { maxTokens?: number; pinPad?: number } = {}): void {
  const pad = opts.pinPad === undefined ? "" : `\n${"checkout ".repeat(Math.ceil(opts.pinPad / 9))}`;
  doc(
    "reference/rules.md",
    `# Rules\n\nCheckout validation checkout validation checkout validation.${pad}\n`,
    "Checkout validation rules",
  );
  doc(
    "specs/ui.md",
    "# Checkout form\n\nCheckout validation checkout validation in the form.\n",
    "Checkout validation UI",
  );
  const path = join(root, ".lore/agents/frontend-dev.toml");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `schema_version = 1\nname = "frontend-dev"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = ${opts.maxTokens ?? 4000}\npinned = ["reference/rules"]\nsources = ["specs/ui"]\n${targets ?? ""}`,
  );
}

function compile(maxTokens?: number, providerInput?: number) {
  return compileAgentContext(
    loadAgentProfiles(root),
    loadBundle(join(root, "docs")),
    "frontend-dev",
    TASK,
    maxTokens,
    undefined,
    undefined,
    providerInput,
  );
}

describe("agent context — declared context budgets (LCLI-682)", () => {
  test("a profile that declares no targets is not reported at all", () => {
    fixture();
    expect(compile().budgets).toBeUndefined();
  });

  test("a declared profile reports every class with the chars/4 estimator and a target", () => {
    fixture(DECLARED);
    const budgets = compile().budgets;
    expect(budgets?.estimator).toBe("chars/4");
    for (const entry of [budgets?.policyAndRole, budgets?.taskContract, budgets?.taskEvidence, budgets?.loreSubtotal]) {
      expect(entry?.target).not.toBeNull();
      expect(typeof entry?.measured).toBe("number");
    }
  });

  test("within target: over is false and no content is named (the clean arm)", () => {
    fixture(DECLARED);
    const budgets = compile().budgets;
    expect(budgets?.policyAndRole.over).toBe(false);
    expect(budgets?.policyAndRole.content).toEqual([]);
    expect(budgets?.taskEvidence.over).toBe(false);
  });

  test("over target: over is true and the content that required it is named (AC3)", () => {
    fixture("[targets]\npolicy_and_role = 1\ntask_evidence = 1\nlore_subtotal = 1\n");
    const budgets = compile().budgets;
    expect(budgets?.policyAndRole.over).toBe(true);
    expect(budgets?.policyAndRole.content).toContain("reference/rules");
    expect(budgets?.taskEvidence.over).toBe(true);
    expect(budgets?.taskEvidence.content.some((reference) => reference.startsWith("specs/ui"))).toBe(true);
    expect(budgets?.loreSubtotal.over).toBe(true);
  });

  test("every lore figure carries its provenance; not-applicable is null + a note, never 0", () => {
    fixture(DECLARED);
    const budgets = compile().budgets;
    for (const entry of [budgets?.policyAndRole, budgets?.taskEvidence, budgets?.loreSubtotal]) {
      expect(entry?.measuredBy).toBe("chars/4 estimate");
    }
    for (const entry of [budgets?.codeMap, budgets?.harnessAndTools]) {
      expect(entry?.measured).toBeNull();
      expect(entry?.measuredBy).toBeUndefined();
      expect(entry?.note).toBe("composed by opum-cli");
    }
  });

  test("AC3 ceilings: authored bootstrap is policy+role+contract, task evidence is the ranked tier", () => {
    fixture(DECLARED);
    const budgets = compile().budgets;
    expect(budgets?.authoredBootstrapCeiling.target).toBe(8000);
    expect(budgets?.authoredBootstrapCeiling.measured).toBe(
      (budgets?.policyAndRole.measured ?? 0) + (budgets?.taskContract.measured ?? 0),
    );
    expect(budgets?.authoredBootstrapCeiling.over).toBe(false);
    expect(budgets?.taskEvidenceCeiling.target).toBe(16000);
    expect(budgets?.taskEvidenceCeiling.measured).toBe(budgets?.taskEvidence.measured);
  });

  test("an AC3 authored-bootstrap ceiling overrun names the policy content, independent of a class target", () => {
    // No policy_and_role target is declared, so the ceiling is the only thing that can flag this.
    fixture("[targets]\ntask_evidence = 6000\n", { maxTokens: 200_000, pinPad: 40_000 });
    const budgets = compile().budgets;
    expect(budgets?.authoredBootstrapCeiling.over).toBe(true);
    expect(budgets?.authoredBootstrapCeiling.content).toContain("reference/rules");
  });

  test("a manually supplied provider figure is recorded separately, with source manual", () => {
    fixture(DECLARED);
    const pack = compile(undefined, 4242);
    expect(pack.providerUsage).toEqual({ inputTokens: 4242, source: "manual" });
    // It never becomes the measured figure: the ceilings stay on lore's own estimate.
    expect(pack.budgets?.taskEvidenceCeiling.measured).toBe(pack.budgets?.taskEvidence.measured);
  });

  test("no provider figure supplied: the slot is absent, not zero", () => {
    fixture(DECLARED);
    expect(compile().providerUsage).toBeUndefined();
  });

  test("the plain pack renders a Context budgets section, and an overrun names its content there too", () => {
    fixture("[targets]\npolicy_and_role = 1\ntask_evidence = 1\n");
    const markdown = renderAgentContextMarkdown(compile());
    expect(markdown).toContain("## Context budgets");
    expect(markdown).toContain("OVER");
    expect(markdown).toContain("required by reference/rules");
    expect(markdown).toContain("not applicable — composed by opum-cli");
  });

  test("task contract measures 0 without a contract and is not over", () => {
    fixture(DECLARED);
    const budgets = compile().budgets;
    expect(budgets?.taskContract.measured).toBe(0);
    expect(budgets?.taskContract.over).toBe(false);
  });

  test("CLI: --provider-input-tokens reaches the export as source manual", async () => {
    fixture(DECLARED);
    const stdout = capture();
    const code = await runAgent({
      root,
      output: JSON_OUTPUT,
      args: ["context", "frontend-dev", "--task", TASK, "--provider-input-tokens", "4242"],
      stdout,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text());
    expect(envelope.data.providerUsage).toEqual({ inputTokens: 4242, source: "manual" });
    expect(envelope.data.budgets.authoredBootstrapCeiling.target).toBe(8000);
  });

  test("the repository's four role profiles declare [targets] (LCLI-682 review)", () => {
    const snapshot = loadAgentProfiles(join(import.meta.dir, ".."));
    for (const name of ["implementation", "review", "verification", "documentation"]) {
      const profile = snapshot.profiles.get(name);
      expect(profile).toBeDefined();
      expect(profile?.targets).toEqual({
        policyAndRole: 3000,
        taskContract: 2000,
        taskEvidence: 6000,
        loreSubtotal: 11000,
      });
    }
  });

  test("a class with no declared target says so once, not twice (LCLI-682 review)", () => {
    fixture("[targets]\ntask_evidence = 6000\n");
    const line = renderAgentContextMarkdown(compile())
      .split("\n")
      .find((candidate) => candidate.startsWith("- policy and role"));
    expect(line).toBeDefined();
    expect((line ?? "").match(/no target declared/g)).toHaveLength(1);
  });
});
