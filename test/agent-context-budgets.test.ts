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
import {
  AGENT_CONTEXT_QUERY_HIT_LIMIT,
  compileAgentContext,
  compileAgentContextWithoutQueryHits,
  renderAgentContextMarkdown,
} from "../src/core/agent-context";
import { loadAgentProfiles } from "../src/core/agent-profile";
import { loadBundle } from "../src/core/bundle";
import { LoreError } from "../src/errors";
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
  function compileWithConstitution(maxTokens = 20000) {
    // `maxTokens` is a REQUIRED parameter of the call, so a profile file's own `max_tokens` is
    // overridden here — a test that sizes the pack budget in the profile file and not in this
    // argument silently exercises a 20000-token pack instead of the one it wrote.
    return compileAgentContext(
      loadAgentProfiles(root),
      loadBundle(join(root, "docs")),
      "frontend-dev",
      TASK,
      maxTokens,
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
    // SIXTY documents, not twenty (LCLI-722 review): at ~300 tokens each, twenty sum to ~6000, so a
    // silently-inferred default cap of 6000, 8000 or 16000 would still have selected all of them and
    // this test would have passed against the very defect it exists to catch. Sixty sum to ~18000,
    // which is over every plausible default.
    corpus(60);
    profile("", allSources(60));
    const pack = compile();
    expect(pack.budgets).toBeUndefined();
    // The claim asserted DIRECTLY rather than as a count: this pack's ranked evidence is larger than
    // any conceivable default cap, so a silently-inferred one cannot have been applied. (The count
    // itself is the pack budget's business — `max_tokens` still binds, as it should — which is why
    // pinning `shown` to the corpus size would have been pinning the wrong object.)
    const evidenceTokens = pack.sections.reduce((sum, item) => sum + item.tokenEstimate, 0);
    expect(evidenceTokens).toBeGreaterThan(16000);
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

  /**
   * A Constitution whose body shares NO term with `TASK`, so it scores zero and the ranking sorts it
   * LAST — behind every positive-scoring section. That ordering is what made the reservation
   * necessary: the cap filled before the mandatory candidate was ever reached.
   */
  function constitutionDoc(padWords = 40): void {
    writeFileSync(
      join(root, "docs/constitution.md"),
      `---\ntype: Constitution\ntitle: Project constitution\nsummary: The principles this project holds.\nversion: 1.0.0\nratified: "2026-01-01"\nlast_amended: "2026-01-01"\namendment_authority: project maintainers\n---\n\n# Project constitution\n\n## Principles\n\n${"accountable reversible scoped ".repeat(padWords)}\n\n## Governance\n\nShort.\n\n## Amendment log\n\nNone yet.\n`,
    );
  }

  test("REQUIRED content is KEPT when ranked evidence would fill the cap first (the reservation)", () => {
    corpus(20);
    constitutionDoc(40);
    profile("[targets]\ntask_evidence = 1200\n", ["constitution", ...allSources(20)]);
    const pack = compileWithConstitution();

    // The blocking case on the first version of this change: the Constitution scores ZERO, so it
    // sorts last, positive evidence filled the cap ahead of it, and the loop's `continue` skipped it
    // — a successful compile with the mandatory content silently absent.
    const ids = pack.sections.map((item) => item.conceptId);
    expect(ids).toContain("constitution");
    expect(pack.budgets?.taskEvidence.measured).toBeLessThanOrEqual(1200);

    // ...and the room was genuinely RESERVED, not merely left over: ranked evidence stops short of
    // the cap, because `evidenceBudget - requiredTokens` is what it was allowed to spend. Deleting
    // the reservation lets it run to ~1200 and this assertion is what goes red.
    const rankedTokens = pack.sections
      .filter((item) => item.conceptId !== "constitution")
      .reduce((sum, item) => sum + item.tokenEstimate, 0);
    expect(rankedTokens).toBeLessThan(1200);
  });

  test("a NO-TARGETS profile still reserves its ranked Constitution against the PACK budget (DEC-194 (5))", () => {
    // The ruling's second reservation site. With no `[targets]` there is no evidence CAP, so only
    // the pack budget binds — and required content has to reserve its room there too, exactly as
    // before this feature, or a profile that compiled yesterday stops compiling today.
    corpus(20);
    constitutionDoc(60);
    profile("", ["constitution", ...allSources(20)]);
    const pack = compileWithConstitution(3000);

    const ids = pack.sections.map((item) => item.conceptId);
    expect(ids).toContain("constitution"); // KEPT — mandatory content is reserved, not outranked
    expect(pack.budgets).toBeUndefined(); // ...and the no-targets profile is still unreported
    expect(ids.length).toBeLessThan(21); // ranked evidence was TRIMMED to make the room
    // A control on the same fact: the corpus could not all have fitted, so the trim is the pack's
    // doing rather than an empty corpus.
    expect(allSources(20).filter((source) => ids.includes(source)).length).toBeLessThan(20);
  });

  /**
   * The hit-free twin of {@link compileWithConstitution}: the same profile, ranking and budgeting
   * with NO query section at all (`compileAgentContextWithoutQueryHits`). Its compile floor is
   * therefore the honest "required content alone" boundary, and it is the control the test below
   * measures the with-section floor against.
   */
  function compileHitFree(maxTokens: number) {
    return compileAgentContextWithoutQueryHits(
      loadAgentProfiles(root),
      loadBundle(join(root, "docs")),
      "frontend-dev",
      TASK,
      maxTokens,
      "docs/constitution.md",
    );
  }

  /**
   * The smallest integer budget at which `attempt` succeeds, scanned up one token at a time, plus
   * the count of budgets that were REFUSED before it — reported so a caller can see how much the
   * scan read rather than resting on an equality that two identically-broken scans would also
   * satisfy.
   */
  function floorOf(attempt: (budget: number) => unknown): { budget: number; refusals: number } {
    for (let budget = 1; budget <= 20_000; budget += 1) {
      try {
        attempt(budget);
        return { budget, refusals: budget - 1 };
      } catch (cause) {
        if (!(cause instanceof LoreError && cause.type === "validation")) throw cause;
      }
    }
    throw new Error("no budget at or below 20000 compiled");
  }

  test("...and the query section's reserve never RAISES that floor (LCLI-722 review, blocking)", () => {
    // DEC-194 (5)'s exception is "required content alone cannot fit", so a budget that holds the
    // Constitution plus the pack's fixed overhead must compile — even when the three-hit query
    // section cannot fit alongside it, because that section is a supplement and, per the rule stated
    // with the mandatory-pin floor above, must NEVER turn a pack that used to compile into a failure.
    // Sizing its reserve against a pins-only pack (the first revision of this change) made exactly
    // that budget fail: the floor compared required + section, so a section-sized shortfall was
    // reported as a mandatory-content one, and DEC-194 (5)'s exception fired where its own condition
    // did not hold.
    //
    // Asserted as an INVARIANT rather than against a measured literal: the smallest budget at which
    // a WITH-section compile succeeds equals the smallest budget at which the hit-free compile does.
    // Any reserve that spends budget the section's own absence does not would separate the two
    // numbers, which is precisely the pre-fix behaviour — so this reddens on the defect and not on
    // the fixture's arithmetic.
    doc("reference/rules.md", "# Rules\n\nCheckout validation rules.\n", "Checkout validation rules");
    constitutionDoc(60);
    doc(
      "specs/ui.md",
      "# Checkout form\n\nCheckout validation checkout validation in the form.\n",
      "Checkout validation UI",
    );
    // FOUR documents the profile does NOT source, so the bundle-wide query has something to
    // advertise. Without them `roomy.queryHits` below would be empty and the equality would hold
    // vacuously, for a fixture that never exercised a query section at all.
    for (let i = 0; i < AGENT_CONTEXT_QUERY_HIT_LIMIT + 1; i += 1) {
      doc(`notes/n${i}.md`, `# Checkout note ${i}\n\nCheckout validation note ${i}.\n`, `Checkout note ${i}`);
    }
    profile("", ["constitution", "specs/ui"]);

    const withSection = floorOf((budget) => compileWithConstitution(budget));
    const hitFree = floorOf((budget) => compileHitFree(budget));
    // How much the scans read, so a fixture whose floor collapsed to 1 (where both arms would agree
    // for the wrong reason) cannot read as a pass.
    expect(hitFree.refusals).toBeGreaterThan(100);
    expect(withSection.budget).toBe(hitFree.budget);

    // The pressure is REAL: at a roomy budget the section carries every hit it is allowed...
    const roomy = compileWithConstitution(20_000);
    expect(roomy.queryHits).toHaveLength(AGENT_CONTEXT_QUERY_HIT_LIMIT);
    // ...and at the floor the very same section is squeezed away entirely, so the equality above is
    // proved against a reserve that genuinely could not fit rather than one with nothing to reserve.
    const atFloor = compileWithConstitution(withSection.budget);
    expect(atFloor.queryHits).toHaveLength(0);
    expect(atFloor.sections.map((item) => item.conceptId)).toContain("constitution");

    // The other arm of the same gate, so the exception is proved NARROWED rather than removed: one
    // token below the floor the required content itself does not fit, and the compile still fails.
    let thrown: unknown;
    try {
      compileWithConstitution(withSection.budget - 1);
    } catch (cause) {
      thrown = cause;
    }
    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("validation");
    expect((thrown as LoreError).message).toMatch(/CONTEXT_REQUIRED_CONTENT_OVER_BUDGET/);
  });

  test("...and a Constitution that cannot fit the PACK budget also FAILS rather than being skipped", () => {
    // The other route to the same silent drop: required content exempt from the cap but dropped by
    // the pack budget. The budget is sized to clear the pack's own fixed overhead (~374 tokens here,
    // header plus budgets section) and to be far short of overhead-plus-Constitution — taking it
    // under the overhead instead would trip the PRE-EXISTING "mandatory evidence needs ~N tokens"
    // floor first, which is a different error about a different tier, and this test would pass
    // without ever reaching the path it names.
    doc("reference/rules.md", "# Rules\n\nCheckout validation rules.\n", "Checkout validation rules");
    constitutionDoc(300);
    const path = join(root, ".lore/agents/frontend-dev.toml");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(
      path,
      `schema_version = 1\nname = "frontend-dev"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = 1000\npinned = ["reference/rules"]\nsources = ["constitution"]\n[targets]\ntask_evidence = 20000\n`,
    );
    expect(() => compileWithConstitution(1000)).toThrow(/CONTEXT_REQUIRED_CONTENT_OVER_BUDGET/);
  });

  test("equal scores are cut in DECLARATION order under the cap — sourceIndex, then sectionIndex", () => {
    // Every corpus document shares the task's only terms, so they all score identically and the
    // cap's cut is decided by the TIEBREAK alone. That makes this a pin on ORDER rather than on
    // size: the sections kept are the first ones in declaration order, not an arbitrary subset.
    corpus(12, 40);
    profile("[targets]\ntask_evidence = 400\n", allSources(12));
    const pack = compile();
    const kept = pack.sections.map((item) => item.conceptId);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(12);
    expect(kept).toEqual(allSources(12).slice(0, kept.length));
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

// ── DEC-194 (1)/(7)/(8) / LCLI-722: the four real profiles inside the AC3 ceilings ──────────────

/**
 * The reshape's acceptance test (DEC-194 (3)): all four REAL role profiles, measured with the same
 * command class the overrun was filed from, each inside the 3k policy-and-role target and the AC3
 * authored-bootstrap ceiling of 8k. DEC-194 (8) fixed all four pin sets, so these numbers are the
 * ruling's own arithmetic — 2725, 2621, 2171, 2353 — read back through the compiler rather than
 * restated. A test, not a docstring, because the 3k target is the thing a later edit to a PINNED
 * source can break — implementation pins five `reference/cli-contract` sections, so growing one of
 * them can push that profile over with no other test going red. A `sources` entry cannot move
 * either ceiling: policy and role sums the pinned tier alone, and ranked evidence is capped at the
 * declared `task_evidence` (6000), far under the 16k evidence ceiling. (LCLI-722 review F1: an
 * earlier revision of this comment named a RANKED source as the risk, which no assertion here can
 * catch — the writer session grew that very file and every assertion stayed green.)
 *
 * `authoredBootstrapCeiling` measures policy and role PLUS task contract (the spec's AC3 note), so
 * the two ceilings below are asserted as ceilings and the target as a target: crossing the 3k TARGET
 * is a `[targets]` measurement the compiler reports, while crossing the 8k CEILING is the AC3
 * failure this task exists to remove.
 */
describe("the four real role profiles measure inside the AC3 ceilings (DEC-194 (1)/(8), LCLI-722)", () => {
  const TASK = "review the context budget change to the role profiles";
  const REPO_ROOT = join(import.meta.dir, "..");
  const PINNED_SETS: Readonly<Record<string, readonly string[]>> = {
    documentation: [
      "index#current-control-set",
      "index#architecture--design",
      "index#references",
      "index#adrs",
      "index#runbooks",
    ],
    implementation: [
      "reference/cli-contract#1-output-modes-and-precedence",
      "reference/cli-contract#22-relationship-to-the-backlogmd-envelope",
      "reference/cli-contract#51-semantic-exit-codes",
      "reference/cli-contract#52-the---json-error-envelope",
      "reference/cli-contract#53-error_type--exit-code-alignment",
    ],
    review: [
      "reference/cli-contract#7-versioning-policy",
      "reference/cli-contract#22-relationship-to-the-backlogmd-envelope",
      "reference/cli-contract#51-semantic-exit-codes",
      "reference/cli-contract#52-the---json-error-envelope",
    ],
    verification: [
      "reference/okf-conformance#the-two-conformance-floors",
      "reference/okf-conformance#lores-validation-tiers",
      "reference/cli-contract#3-bounded-output-and-truncation-hints",
      "reference/cli-contract#51-semantic-exit-codes",
    ],
  };

  for (const [name, pinned] of Object.entries(PINNED_SETS)) {
    test(`${name}: pins its DEC-194 (8) sections and nothing else, inside both ceilings`, () => {
      const snapshot = loadAgentProfiles(REPO_ROOT);
      const profile = snapshot.profiles.get(name);
      expect(profile).toBeDefined();
      // The DECISION is asserted, not only its arithmetic: a set that fits because a pin was
      // silently dropped would pass the ceilings below while no longer being the ruled set.
      expect(profile?.pinned.map((reference) => reference.normalized)).toEqual([...pinned]);

      const pack = compileAgentContext(snapshot, loadBundle(join(REPO_ROOT, "docs")), name, TASK);
      const budgets = pack.budgets;
      expect(budgets).toBeDefined();
      expect(budgets?.policyAndRole.measured).toBeLessThanOrEqual(3000);
      expect(budgets?.policyAndRole.over).toBe(false);
      expect(budgets?.authoredBootstrapCeiling.measured).toBeLessThanOrEqual(8000);
      expect(budgets?.authoredBootstrapCeiling.over).toBe(false);
      // The AC3 evidence ceiling. With a cap declared this cannot bite — ranked evidence is capped
      // at `task_evidence` (6000) — so its value here is as a guard for a profile that LOSES its
      // cap, not as a stress of the 16k ceiling itself (LCLI-722 review F2).
      expect(budgets?.taskEvidenceCeiling.measured).toBeLessThanOrEqual(16000);
      expect(budgets?.taskEvidenceCeiling.over).toBe(false);
      // DEC-194 (3) asks each profile to REPORT a subtotal; this asserts one is reported, nothing
      // about its size. The numbered subtotals live in the PR body and the task record, which can
      // carry a dated figure that a docstring in a test cannot.
      expect(typeof budgets?.loreSubtotal.measured).toBe("number");
    });
  }
});

// ── DEC-194 (9) / LCLI-722 clause (c): selection SKIPS a misfit, it does not STOP ───────────────

/**
 * "When a ranked evidence item does not fit the evidence budget that remains, the compiler omits
 * that item, records it as omitted-by-budget, and continues with the next-ranked item. Selection
 * does not stop at the first item that does not fit, so a smaller lower-ranked item that fits is
 * still included." (DEC-194 (9), opum-doc.)
 *
 * The fixture is built so the misfit genuinely LEADS the ranking — the precondition is asserted,
 * not assumed — because a test whose large item happened to rank last would pass on a
 * stop-at-the-first-misfit compiler too. The mutation is `break` where the selection loop has
 * `continue`: it reddens exactly the assertions below and nothing else in this file.
 *
 * The required-content half of the clause is unchanged by this behaviour and is proved in the
 * declared-cap describe above (a ranked Constitution that cannot fit the cap fails the compile
 * with CONTEXT_REQUIRED_CONTENT_OVER_BUDGET rather than being skipped).
 */
describe("agent context — selection skips a misfit rather than stopping (DEC-194 (9), LCLI-722)", () => {
  const CAP = 300;

  function rankedFixture(): void {
    doc("reference/rules.md", "# Rules\n\nCheckout validation rules.\n", "Rules");
    // Descending size, and `big` outranks both on the task's terms despite its length.
    doc("specs/big.md", `# Big\n\n${"checkout validation ".repeat(60)}\n`, "Big");
    doc("specs/small.md", `# Small\n\n${"checkout validation ".repeat(6)}\n`, "Small");
    doc("specs/tiny.md", `# Tiny\n\n${"checkout validation ".repeat(3)}\n`, "Tiny");
    const path = join(root, ".lore/agents/skipper.toml");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(
      path,
      `schema_version = 1\nname = "skipper"\ndescription = "Ranks sections."\nkind = "specialist"\nmax_tokens = 20000\npinned = ["reference/rules"]\nsources = ["specs/big", "specs/small", "specs/tiny"]\n[targets]\ntask_evidence = ${CAP}\n`,
    );
  }

  function compileSkipper() {
    return compileAgentContext(
      loadAgentProfiles(root),
      loadBundle(join(root, "docs")),
      "skipper",
      "checkout validation",
    );
  }

  test("a large high-ranked misfit does not shut out the smaller lower-ranked items behind it", () => {
    rankedFixture();
    const pack = compileSkipper();
    const entry = (conceptId: string) => pack.catalog.find((candidate) => candidate.conceptId === conceptId);

    // PRECONDITION: `big` is the highest-ranked candidate and is larger than the whole cap, so it
    // can never be admitted. Without this the test could pass on a compiler that stops at the first
    // misfit simply because no misfit ever led the order.
    expect(entry("specs/big")?.topScore).toBeGreaterThan(entry("specs/small")?.topScore ?? Number.POSITIVE_INFINITY);
    expect(entry("specs/big")?.tokenEstimate).toBeGreaterThan(CAP);

    // OMITTED: not selected, and RECORDED as an omission rather than silently absent.
    expect(pack.sections.map((item) => item.conceptId)).not.toContain("specs/big");
    expect(entry("specs/big")?.reason).toBe("omitted-by-budget");
    expect(entry("specs/big")?.selectedCount).toBe(0);

    // CONTINUED PAST IT: the two items ranked behind the misfit are still selected, in rank order.
    expect(pack.sections.map((item) => item.conceptId)).toEqual(["specs/small", "specs/tiny"]);
    expect(entry("specs/small")?.selectedCount).toBe(1);
    expect(entry("specs/tiny")?.selectedCount).toBe(1);
  });
});

// ── LCLI-722 AC4 / DEC-194 (6), (11): the budget report attributes each OMITTED section ─────────

/**
 * AC4: per SECTION, the budget report says whether a section was cut by the CAP or scored zero, so
 * a reader can tell the two apart from the report alone. DEC-194 (11) took that one step further and
 * SPLIT the cut value, because the remedy differs by cause: `cut-by-task-evidence-cap` is answered
 * by the profile's declared target, `cut-by-max-tokens` by the pack's `max_tokens`. AC4 is met by
 * the two cut values together.
 *
 * The CATALOG cannot answer the question at all, and the fixture asserts it rather than assuming it:
 * its reason is per SOURCE, so one source with a section selected and another cut reads
 * `partially-included` whichever way the second one left — measured below, in the same report, for a
 * source that carries one of each.
 *
 * `omittedSections` is ADDITIVE under cli-contract §7.1: `content` keeps its `string[]` shape
 * (asserted), and the field is JSON-only — the rendered budget footer prints `content`, so nothing
 * here can move a capacity figure.
 */
describe("agent context — the budget report attributes each omitted section (LCLI-722 AC4)", () => {
  /**
   * One ranked source whose sections split three ways: `Alpha`, `Gamma` and `Delta` match the task;
   * `Beta` shares no term with it and is dropped by the zero-score filter; the intro paragraph is
   * selected. The document is long enough to be partitioned into sections (the threshold is
   * min(2000, maxTokens/4)), which is what makes a per-SECTION claim possible at all.
   *
   * `cap` is written into `[targets].task_evidence`. Leaving it out declares NO evidence target,
   * which is the case DEC-194 (11) names for `cut-by-max-tokens`: with no cap to bind, the pack's
   * own `max_tokens` is what refuses a section.
   */
  function attributionFixture(opts: { cap?: number; maxTokens?: number } = {}): void {
    doc("reference/rules.md", "# Rules\n\nCheckout validation rules.\n", "Checkout validation rules");
    doc(
      "specs/ranked.md",
      [
        "# Ranked",
        "",
        `Intro ${"checkout validation ".repeat(40)}`,
        "",
        "## Alpha",
        "",
        `Alpha ${"checkout validation ".repeat(40)}`,
        "",
        "## Beta",
        "",
        `Beta ${"unrelated theorem prose ".repeat(40)}`,
        "",
        "## Gamma",
        "",
        `Gamma ${"checkout validation ".repeat(40)}`,
        "",
        "## Delta",
        "",
        `Delta ${"checkout validation ".repeat(40)}`,
        "",
      ].join("\n"),
      "Ranked evidence",
    );
    const path = join(root, ".lore/agents/section-attribution.toml");
    mkdirSync(join(path, ".."), { recursive: true });
    const targets =
      opts.cap === undefined
        ? "[targets]\npolicy_and_role = 3000\nlore_subtotal = 11000\n"
        : `[targets]\npolicy_and_role = 3000\ntask_evidence = ${opts.cap}\nlore_subtotal = 11000\n`;
    writeFileSync(
      path,
      `schema_version = 1\nname = "section-attribution"\ndescription = "Attributes omitted sections."\nkind = "specialist"\nmax_tokens = ${opts.maxTokens ?? 4000}\npinned = ["reference/rules"]\nsources = ["specs/ranked"]\n${targets}`,
    );
  }

  function attributionPack(opts: { cap?: number; maxTokens?: number } = {}) {
    attributionFixture(opts);
    return compileAgentContext(loadAgentProfiles(root), loadBundle(join(root, "docs")), "section-attribution", TASK);
  }

  test("one source reports a cap cut and a zero-score drop side by side, per section", () => {
    const pack = attributionPack({ cap: 300 });
    const omitted = pack.budgets?.taskEvidence.omittedSections;
    expect(Array.isArray(omitted)).toBe(true);

    // BOTH reasons, in one report, from the SAME source — which is the whole point.
    expect(omitted).toContainEqual({
      reference: "specs/ranked",
      section: "Ranked > Alpha",
      reason: "cut-by-task-evidence-cap",
    });
    expect(omitted).toContainEqual({ reference: "specs/ranked", section: "Ranked > Beta", reason: "scored-zero" });

    // With a cap declared and a generous `max_tokens`, NOTHING can be attributed to the pack budget:
    // the cap binds first, so the pack's own ceiling never refuses a candidate here.
    expect((omitted ?? []).some((entry) => entry.reason === "cut-by-max-tokens")).toBe(false);

    // THE CONTROL: the section the pack DID carry is not advertised as omitted.
    expect(pack.sections.map((item) => item.breadcrumb)).toContain("Ranked");
    expect((omitted ?? []).map((entry) => entry.section)).not.toContain("Ranked");

    // THE PREMISE, measured rather than remembered: from the catalog alone this source reads
    // `partially-included`, exactly as it would if Beta had been cut by the cap instead.
    const catalogEntry = pack.catalog.find((entry) => entry.reference === "specs/ranked");
    expect(catalogEntry?.reason).toBe("partially-included");
    expect(catalogEntry?.selectedCount).toBeLessThan(catalogEntry?.candidateCount ?? 0);

    // ADDITIVE: `content` keeps its shape, and the class that does not rank candidates carries no
    // attribution at all — pins are never cut.
    const content = pack.budgets?.taskEvidence.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content?.every((line) => typeof line === "string")).toBe(true);
    expect(pack.budgets?.policyAndRole.omittedSections).toBeUndefined();
  });

  test("a section the pack's OWN max_tokens refuses is named apart from a cap cut (DEC-194 (11))", () => {
    // No `task_evidence` target at all: nothing binds the ranked tier but the pack's own budget, so
    // a section that shares a term with the task and does not fit is a max-tokens cut — the case
    // DEC-194 (11) keeps apart from the cap, because its remedy is `--max-tokens`, not the target.
    const pack = attributionPack({ maxTokens: 400 });
    const omitted = pack.budgets?.taskEvidence.omittedSections ?? [];

    expect(omitted).toContainEqual({
      reference: "specs/ranked",
      section: "Ranked > Alpha",
      reason: "cut-by-max-tokens",
    });
    // The pack really does not carry it — the attribution is not describing a section that is
    // present under another spelling.
    expect(pack.sections.map((item) => item.breadcrumb)).not.toContain("Ranked > Alpha");

    // BOTH values in one report, and the cap value is IMPOSSIBLE here: there is no declared cap for
    // it to name. That is what keeps the two cut reasons from collapsing into one another.
    expect(omitted).toContainEqual({ reference: "specs/ranked", section: "Ranked > Beta", reason: "scored-zero" });
    expect(omitted.some((entry) => entry.reason === "cut-by-task-evidence-cap")).toBe(false);
  });

  test("nothing omitted reads as an EMPTY list, not an absent field", () => {
    // The shared fixture's only ranked source matches the task and fits whole, so the class has
    // nothing to attribute — and a reader must still be able to tell that from "this report does
    // not carry the field".
    fixture(DECLARED);
    const pack = compile();
    expect(pack.budgets?.taskEvidence.omittedSections).toEqual([]);
  });
});
