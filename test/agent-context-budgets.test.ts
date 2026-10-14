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
    // `task_evidence` can no longer be OVER: since DEC-194 (4) it is a CAP on selection, so a
    // one-token budget selects nothing rather than selecting everything and reporting an overrun
    // (LCLI-722). This assertion used to require `over` here; the cap is asserted in full in the
    // LCLI-722 describe below, and this line records the consequence where the old expectation was.
    expect(budgets?.taskEvidence.measured).toBe(0);
    expect(budgets?.taskEvidence.over).toBe(false);
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

// ── DEC-194 (4) / LCLI-722: the declared `task_evidence` CAP ───────────────────

/**
 * A declared `task_evidence` is a CAP on ranked selection, not only a measurement (DEC-194 (4),
 * chosen as A at opum-ai/opum-doc#1022). Both arms are proved: a profile that declares it selects
 * ranked evidence only up to it, highest-scoring first; a profile that declares NO `[targets]`
 * behaves exactly as before, because lore is published and a pack silently bounded by a number the
 * profile never wrote would surprise external users. Required content that cannot fit fails the
 * compile with `CONTEXT_REQUIRED_CONTENT_OVER_BUDGET` rather than being dropped (MDL-9).
 */
describe("agent context — the declared `task_evidence` cap (DEC-194 (4), LCLI-722)", () => {
  /** `count` ranked evidence documents, each one section of `padWords` words. */
  function corpus(count: number, padWords = 60): void {
    doc("reference/rules.md", "# Rules\n\nCheckout validation rules.\n", "Checkout validation rules");
    for (let i = 0; i < count; i += 1) {
      doc(`specs/e${i}.md`, `# Evidence ${i}\n\n${"checkout validation ".repeat(padWords)}\n`, `Evidence ${i}`);
    }
  }

  /** The profile, with `sources` defaulting to the whole corpus, over an optional `[targets]` tail. */
  function profile(targets: string, sources: readonly string[], extra = ""): void {
    const path = join(root, ".lore/agents/frontend-dev.toml");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(
      path,
      `schema_version = 1\nname = "frontend-dev"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = 20000\npinned = ["reference/rules"]\nsources = [${sources.map((s) => `"${s}"`).join(", ")}]\n${extra}${targets}`,
    );
  }

  const allSources = (count: number): string[] => Array.from({ length: count }, (_, i) => `specs/e${i}`);

  /**
   * Compile with the bundle's Constitution path supplied. `compile()` does not pass one, and
   * `constitutionConceptId` returns `undefined` without it — so a RANKED Constitution is not
   * recognised as the mandatory candidate and the required-content arm cannot be reached at all.
   */
  function compileWithConstitution() {
    return compileAgentContext(
      loadAgentProfiles(root),
      loadBundle(join(root, "docs")),
      "frontend-dev",
      TASK,
      20000,
      "docs/constitution.md",
    );
  }

  test("a declared task_evidence caps the selection, and names the cap as its target", () => {
    corpus(20);
    profile("[targets]\ntask_evidence = 200\n", allSources(20));
    const pack = compile();
    expect(pack.budgets?.taskEvidence.target).toBe(200);
    expect(pack.budgets?.taskEvidence.measured).toBeLessThanOrEqual(200);
    expect(pack.budgets?.taskEvidence.over).toBe(false);
    // The cap BITES: without it all 20 sources are selected (proved by the arm below).
    expect(pack.shown).toBeLessThan(20);
  });

  test("...and a profile declaring NO targets keeps today's behaviour — the cap is never inferred", () => {
    corpus(20);
    profile("", allSources(20));
    const pack = compile();
    expect(pack.budgets).toBeUndefined();
    expect(pack.shown).toBe(20);
  });

  test("the SAME corpus under a larger declared cap selects more — the cap is the profile's number", () => {
    corpus(20);
    profile("[targets]\ntask_evidence = 200\n", allSources(20));
    const capped = compile();
    const tight = capped.shown;
    rmSync(join(root, ".lore"), { recursive: true, force: true });
    profile("[targets]\ntask_evidence = 1000\n", allSources(20));
    const looser = compile().shown;
    expect(looser).toBeGreaterThan(tight);
  });

  test("required content over the cap FAILS instead of being dropped (CONTEXT_REQUIRED_CONTENT_OVER_BUDGET)", () => {
    // The Constitution, when a profile RANKS it in `sources`, is mandatory policy rather than ranked
    // evidence — the one candidate the ranking keeps at zero score on purpose. A cap it cannot fit
    // must fail the compile: a pack silently missing mandatory content is indistinguishable
    // downstream from a complete one, which is why this is an error and not an omission.
    doc("reference/rules.md", "# Rules\n\nCheckout validation rules.\n", "Checkout validation rules");
    doc("specs/ui.md", "# Checkout form\n\nCheckout validation in the form.\n", "Checkout validation UI");
    writeFileSync(
      join(root, "docs/constitution.md"),
      `---\ntype: Constitution\ntitle: Project constitution\nsummary: The principles this project holds.\nversion: 1.0.0\nratified: "2026-01-01"\nlast_amended: "2026-01-01"\namendment_authority: project maintainers\n---\n\n# Project constitution\n\n## Principles\n\n${"accountable reversible scoped ".repeat(120)}\n\n## Governance\n\n${"accountable reversible scoped ".repeat(120)}\n\n## Amendment log\n\nNone yet.\n`,
    );
    profile("[targets]\ntask_evidence = 50\n", ["constitution", "specs/ui"]);
    expect(() => compileWithConstitution()).toThrow(/CONTEXT_REQUIRED_CONTENT_OVER_BUDGET/);
  });

  test("...and the SAME profile compiles once the cap can hold it (the other way)", () => {
    doc("reference/rules.md", "# Rules\n\nCheckout validation rules.\n", "Checkout validation rules");
    doc("specs/ui.md", "# Checkout form\n\nCheckout validation in the form.\n", "Checkout validation UI");
    writeFileSync(
      join(root, "docs/constitution.md"),
      `---\ntype: Constitution\ntitle: Project constitution\nsummary: The principles this project holds.\nversion: 1.0.0\nratified: "2026-01-01"\nlast_amended: "2026-01-01"\namendment_authority: project maintainers\n---\n\n# Project constitution\n\n## Principles\n\nShort enough to fit.\n\n## Governance\n\nShort.\n\n## Amendment log\n\nNone yet.\n`,
    );
    profile("[targets]\ntask_evidence = 6000\n", ["constitution", "specs/ui"]);
    expect(compileWithConstitution().budgets?.taskEvidence.over).toBe(false);
  });

  test("a budget names the SECTION an entry came from, not just the concept (LCLI-722)", () => {
    // The labels matter where a class is OVER and its content is a SECTION. Post-cap the ranked tier
    // can no longer overrun, so this reads the pinned tier with an ANCHORED pin — the form the
    // profile reshape (DEC-194 (1)) introduces — where the same defect existed: a whole-document
    // reference tells a reader nothing about which part required the budget.
    doc("reference/rules.md", "# Rules\n\nIntro.\n\n## Alpha\n\nCheckout validation alpha.\n", "Rules");
    const profilePath = join(root, ".lore/agents/frontend-dev.toml");
    mkdirSync(join(profilePath, ".."), { recursive: true });
    writeFileSync(
      profilePath,
      `schema_version = 1\nname = "frontend-dev"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = 20000\npinned = ["reference/rules#alpha"]\nsources = []\n[targets]\npolicy_and_role = 1\n`,
    );
    const budgets = compile().budgets;
    expect(budgets?.policyAndRole.over).toBe(true);
    expect(budgets?.policyAndRole.content).toHaveLength(1);
    expect(budgets?.policyAndRole.content[0]).toContain("reference/rules");
    expect(budgets?.policyAndRole.content[0]).toContain("Alpha");
  });
});
