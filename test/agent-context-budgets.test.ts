/**
 * LCLI-682 — the four role profiles declare context-budget TARGETS, and the compiler MEASURES a
 * compiled pack against them and reports it (MDL-7; ODOC-437 AC3). Both arms are proved here: a pack
 * within target reports it with no content named, and an overrun sets `over` and NAMES the content
 * that required it. A profile with no `[targets]` table is not reported at all, so its pack stays
 * byte-identical to before the feature — the property that keeps this additive.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileAgentContext, renderAgentContextMarkdown } from "../src/core/agent-context";
import { loadAgentProfiles } from "../src/core/agent-profile";
import { loadBundle } from "../src/core/bundle";

const TASK = "checkout validation";
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

/** The two profile documents (pinned `reference/rules`, ranked `specs/ui`) plus an optional `[targets]` tail. */
function fixture(targets?: string): void {
  doc(
    "reference/rules.md",
    "# Rules\n\nCheckout validation checkout validation checkout validation.\n",
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
    `schema_version = 1\nname = "frontend-dev"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = 4000\npinned = ["reference/rules"]\nsources = ["specs/ui"]\n${targets ?? ""}`,
  );
}

function compile() {
  return compileAgentContext(loadAgentProfiles(root), loadBundle(join(root, "docs")), "frontend-dev", TASK);
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

  test("code map and harness/tools are not-applicable, naming opum-cli as the composer", () => {
    fixture(DECLARED);
    const budgets = compile().budgets;
    expect(budgets?.codeMap.measured).toBeNull();
    expect(budgets?.codeMap.over).toBe(false);
    expect(budgets?.codeMap.note).toContain("opum-cli");
    expect(budgets?.harnessAndTools.measured).toBeNull();
    expect(budgets?.harnessAndTools.note).toContain("opum-cli");
  });

  test("the plain pack renders a Context budgets section, and an overrun names its content there too", () => {
    fixture("[targets]\npolicy_and_role = 1\ntask_evidence = 1\n");
    const markdown = renderAgentContextMarkdown(compile());
    expect(markdown).toContain("## Context budgets");
    expect(markdown).toContain("OVER");
    expect(markdown).toContain("required by reference/rules");
  });

  test("task contract measures 0 without a contract and is not over", () => {
    fixture(DECLARED);
    const budgets = compile().budgets;
    expect(budgets?.taskContract.measured).toBe(0);
    expect(budgets?.taskContract.over).toBe(false);
  });
});
