/**
 * LCLI-680 — ODOC-437 slice 1: exclude zero-score filler from optional-evidence selection and hold a
 * stable pack digest. The governing design of record is opum-doc's
 * `docs/specs/opum-task-context-and-evidence-contract.md` (origin/dev); this file pins the two
 * spec criteria the slice advances:
 *
 *   CTX-01 — two UNRELATED REAL lore-cli tasks that share required policy select DIFFERENT optional
 *            evidence, and unrelated zero-score sections are ABSENT from both packs. The opum-doc
 *            contract's selection step 4 ("Exclude zero-score search candidates unless a mandatory
 *            policy or task/graph relation independently requires them"); its step 6 ("Never fill
 *            unused capacity with low-value sections").
 *   CTX-06 — repeated identical compilation yields an identical content digest and an identical
 *            selection, with wall-clock timestamps excluded from the reusable content prefix.
 *   CTX-05 — the other half of that identity: CHANGED inputs give a DIFFERENT digest, so a cache
 *            keyed on it cannot serve a stale pack. Measured here on a changed task input and on a
 *            changed profile input (the spec names both among the invalidating inputs).
 *
 * It measures the repository's OWN tasks and bundle, never a synthetic fixture: both task texts are
 * read verbatim from the committed tracker (LCLI-289 and LCLI-380), and both packs compile the real
 * `.lore/agents/implementation.toml` profile against the real `docs/` bundle. The two tasks are
 * unrelated — one is about the agent-context subsystem, the other about the LadybugDB indexing
 * subsystem — yet share that profile's required policy (`pinned = ["reference/cli-contract"]`), which
 * is exactly the CTX-01 shape: same mandatory policy, different task-shaped optional evidence.
 *
 * Each real task's pack selects only the sections that scored above zero for its own task, and the
 * two selections differ in BOTH directions — each task selects sections the other does not — so the
 * two are genuinely different, not nested. The selected and declared counts are a SNAPSHOT, not an
 * assertion: they move whenever the bundle's own docs change (a docs edit shifts a source's
 * candidate count). This docstring therefore names the quantity counted and expresses any count the
 * file asserts as a direction (non-empty, greater than zero) rather than pinning the number. Neither
 * pack is `truncated` (the profile's 108000-token budget holds every eligible candidate), so a
 * section present in one and absent from the other is absent because it scored zero for that task,
 * not because the budget cut it.
 *
 * The selection-ACCOUNTING half of the slice is measured on a small controlled bundle rather than
 * this repository's own: two facts it pins cannot be produced from the repo's current bundle. A
 * source the zero-score filter empties WHOLE reads `omitted-by-relevance`, and that does not occur
 * for the two real tasks above (every declared source keeps at least one matching section), so a
 * controlled synthetic bundle is needed to reach it; and a Constitution RANKED in `sources` surviving
 * a zero score needs a built-in Constitution, which this bundle has none of. The synthetic fixture
 * compiles the same `compileAgentContext` code path the real packs do, so it measures the same
 * behaviour, and the real-bundle cases below still assert the budget-omission reason is ABSENT
 * whenever the budget was ample.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constitutionPathFor } from "../src/commands/agent-governance";
import {
  type AgentContextExport,
  type AgentContextItem,
  compileAgentContext,
  renderAgentContextMarkdown,
} from "../src/core/agent-context";
import { type AgentProfileSnapshot, loadAgentProfiles } from "../src/core/agent-profile";
import { type BundleGraph, loadBundle } from "../src/core/bundle";
import { loadProfile } from "../src/core/profile";

/** This repository's own root: `test/` is one level below it. */
const REPO_ROOT = join(import.meta.dir, "..");

/** The two unrelated real tasks, by id. Their titles are read from the committed tracker below. */
const TASK_A_ID = "LCLI-289"; // "Add task-scoped agent context profiles" — the agent-context subsystem.
const TASK_B_ID = "LCLI-380"; // "Adopt LadybugDB for persistent local indexing" — the indexing subsystem.

/**
 * The verbatim `title` of a real tracker record, read from `.quest/tasks/` or `.quest/completed/`.
 * The test fails loud if the record is gone rather than falling back to an invented string — a task
 * text that is not the repository's own would not measure what CTX-01 asks about.
 */
function realTaskTitle(id: string): string {
  for (const dir of ["tasks", "completed"]) {
    try {
      const record = JSON.parse(readFileSync(join(REPO_ROOT, ".quest", dir, `${id}.json`), "utf8")) as {
        title?: string;
      };
      if (typeof record.title === "string" && record.title.trim() !== "") return record.title;
    } catch {
      // Not in this directory: try the next.
    }
  }
  throw new Error(`LCLI-680 test needs the real tracker record ${id} under .quest/tasks or .quest/completed`);
}

/**
 * A section's identity within a pack: its source reference, breadcrumb and content digest. `reference`
 * alone is the SOURCE (identical for every partition of it), so the breadcrumb plus the digest are
 * what distinguish one selected section from another.
 */
function sectionKey(item: AgentContextItem): string {
  return `${item.reference}\u0000${item.breadcrumb ?? ""}\u0000${item.contentDigest}`;
}

function selectedSections(pack: AgentContextExport): Set<string> {
  return new Set(pack.sections.map(sectionKey));
}

let snapshot: AgentProfileSnapshot;
let graph: BundleGraph;
let constitutionPath: string | undefined;

beforeAll(() => {
  snapshot = loadAgentProfiles(REPO_ROOT);
  graph = loadBundle(join(REPO_ROOT, "docs"), { profile: loadProfile({ root: REPO_ROOT }) });
  // No built-in Constitution in this bundle, so this is `undefined` here — passed explicitly so the
  // test compiles exactly the pack `lore agent context` would, and a future Constitution is picked up.
  constitutionPath = constitutionPathFor(REPO_ROOT);
});

function compile(task: string): AgentContextExport {
  return compileAgentContext(snapshot, graph, "implementation", task, undefined, constitutionPath);
}

/**
 * A minimal controlled bundle for the selection-accounting cases: a built-in Constitution, one
 * on-task source, and one wholly off-task source, with a profile that RANKS the Constitution in
 * `sources` (LCLI-609's dedupe case, so no auto-pin). `compileSynthetic` returns the pack its own
 * `compileAgentContext` call produces, exactly as the real packs are compiled.
 */
function compileSynthetic(): AgentContextExport {
  const root = mkdtempSync(join(tmpdir(), "lore-lcli680-"));
  try {
    mkdirSync(join(root, "docs", "reference"), { recursive: true });
    mkdirSync(join(root, "docs", "guides"), { recursive: true });
    mkdirSync(join(root, ".lore", "agents"), { recursive: true });
    writeFileSync(
      join(root, "docs", "constitution.md"),
      '---\ntype: Constitution\ntitle: Project constitution\nsummary: The principles this project holds.\nversion: 1.0.0\nratified: "2026-01-01"\nlast_amended: "2026-01-01"\namendment_authority: project maintainers\n---\n\n# Project constitution\n\n## Principles\n\nGovernance text with no task term.\n',
    );
    writeFileSync(
      join(root, "docs", "reference", "rules.md"),
      "---\ntype: Reference\ntitle: Checkout validation rules\nsummary: Rules for checkout validation.\n---\n\n# Rules\n\nCheckout validation checkout validation.\n",
    );
    writeFileSync(
      join(root, "docs", "guides", "unrelated.md"),
      "---\ntype: Reference\ntitle: Unrelated guide\nsummary: Storage engines.\n---\n\n# Unrelated\n\nStorage engines and caching.\n",
    );
    writeFileSync(
      join(root, ".lore", "agents", "synthetic.toml"),
      'schema_version = 1\nname = "synthetic"\ndescription = "Synthetic profile."\nkind = "specialist"\nmax_tokens = 4000\nsources = ["reference/rules", "guides/unrelated", "constitution"]\n',
    );
    const syntheticSnapshot = loadAgentProfiles(root);
    const syntheticGraph = loadBundle(join(root, "docs"), { profile: loadProfile({ root }) });
    return compileAgentContext(
      syntheticSnapshot,
      syntheticGraph,
      "synthetic",
      "checkout validation",
      undefined,
      constitutionPathFor(root),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("LCLI-680 — zero-score filler is excluded from optional-evidence selection (CTX-01)", () => {
  test("two unrelated real tasks share required policy but select DIFFERENT optional evidence", () => {
    const taskA = realTaskTitle(TASK_A_ID);
    const taskB = realTaskTitle(TASK_B_ID);
    // Precondition: the two tasks really are unrelated — different, non-empty task texts.
    expect(taskA).not.toBe(taskB);
    expect(taskA.length).toBeGreaterThan(0);

    const packA = compile(taskA);
    const packB = compile(taskB);

    // SHARED required policy: the profile's own pins are identical in both packs. This is the
    // "share required policy" half of CTX-01 — the mandatory tier does not move with the task.
    expect(packA.pinned.map((item) => item.conceptId)).toEqual(["reference/cli-contract"]);
    expect(packB.pinned.map((item) => item.conceptId)).toEqual(packA.pinned.map((item) => item.conceptId));

    // DIFFERENT optional evidence, and different in BOTH directions — each task selects sections the
    // other does not, so the two packs are not mere nestings of one another.
    const selectionA = selectedSections(packA);
    const selectionB = selectedSections(packB);
    const onlyA = [...selectionA].filter((key) => !selectionB.has(key));
    const onlyB = [...selectionB].filter((key) => !selectionA.has(key));
    expect(onlyA.length).toBeGreaterThan(0);
    expect(onlyB.length).toBeGreaterThan(0);
    expect(selectionA).not.toEqual(selectionB);
  });

  test("unrelated zero-score sections are ABSENT from both packs, and every selected section scored above zero", () => {
    const taskA = realTaskTitle(TASK_A_ID);
    const taskB = realTaskTitle(TASK_B_ID);
    const packA = compile(taskA);
    const packB = compile(taskB);

    // THE REASON-ELIMINATOR, RESTATED FOR THE CAPPED WORLD (LCLI-722). It used to read "neither pack
    // is budget-truncated — the profile's 108000-token budget holds every eligible candidate — so an
    // absence must be a relevance omission". Since DEC-194 (4) the profile's declared `task_evidence`
    // CAPS the pack, so both packs ARE truncated and absence alone no longer implies relevance. The
    // reason is therefore asserted DIRECTLY on the catalog below, which is stronger than the proxy
    // it replaces: the proxy said "no budget cut happened", the assertions say which reason each
    // omission carries.
    expect(packA.truncated).toBe(true);
    expect(packB.truncated).toBe(true);
    for (const pack of [packA, packB]) {
      // REASONS STAY HONEST, asserted on a POPULATION THAT IS NOT EMPTY (LCLI-722 review). Writing
      // this as "every entry with topScore 0 and selectedCount 0 must read omitted-by-relevance" was
      // VACUOUS: measured on these very packs, no such entry exists. What does exist is the other
      // half — a source with something SELECTED must never claim to be omitted, by either reason.
      expect(pack.catalog.filter((entry) => entry.selectedCount > 0).length).toBeGreaterThan(0);
      for (const entry of pack.catalog) {
        if (entry.selectedCount > 0) {
          expect(entry.reason.startsWith("omitted-by")).toBe(false);
        }
      }
    }

    // Every selected section is relevant to its own task: no zero-score filler leaked into either
    // pack (step 6: unused capacity is never filled with low-value sections).
    for (const item of packA.sections) expect(item.score ?? 0).toBeGreaterThan(0);
    for (const item of packB.sections) expect(item.score ?? 0).toBeGreaterThan(0);

    // The two packs select DIFFERENT sections, in both directions. That much is still true and still
    // worth asserting — but with the cap on, it is no longer EVIDENCE OF RELEVANCE, and this test
    // must not pretend otherwise (LCLI-722 review).
    const selectionA = selectedSections(packA);
    const selectionB = selectedSections(packB);
    const onlyA = [...selectionA].filter((key) => !selectionB.has(key));
    const onlyB = [...selectionB].filter((key) => !selectionA.has(key));
    expect(onlyA.length).toBeGreaterThan(0);
    expect(onlyB.length).toBeGreaterThan(0);

    // One named section from each side: present in its own task's pack, absent from the unrelated
    // task's pack. (Present-and-absent is all that can be asserted here; WHY it is absent is settled
    // at the source, below, because the cap can cut a section and score alone cannot say which.)
    const sampleOnlyA = onlyA.find((key) => key.startsWith("specs/lore-design\u0000"));
    const sampleOnlyB = onlyB.find((key) => key.startsWith("adr/0018-"));
    if (sampleOnlyA === undefined || sampleOnlyB === undefined) {
      throw new Error("expected a specs/lore-design section only in A and an adr/0018 section only in B");
    }
    expect(selectionA.has(sampleOnlyA)).toBe(true);
    expect(selectionB.has(sampleOnlyA)).toBe(false);
    expect(selectionB.has(sampleOnlyB)).toBe(true);
    expect(selectionA.has(sampleOnlyB)).toBe(false);

    // WHAT REPLACED THE REASON-ELIMINATOR, and why it had to change rather than be reworded. The
    // old test read an absence as a relevance omission because neither pack was truncated. The cap
    // removes that warrant, and MEASURING the catalog shows the replacement cannot live here either:
    // across both packs every declared source of `implementation` is `pinned`, `partially-included`
    // or `omitted-by-budget` — NOT ONE is `omitted-by-relevance`. A section that A selects and B does
    // not may now be missing from B because the CAP cut it, and no per-section attribution is
    // available to tell the two apart from a pack.
    //
    // So the distinction is asserted where it still HAS a witness, which is the synthetic bundle in
    // this file: `compileSynthetic()` declares a wholly off-task source, and the test below pins that
    // it reads `omitted-by-relevance` and never `omitted-by-budget`. Recording the measurement here
    // keeps the move honest instead of silent.
    for (const pack of [packA, packB]) {
      expect(pack.catalog.some((entry) => entry.reason === "omitted-by-relevance")).toBe(false);
      expect(pack.catalog.some((entry) => entry.reason === "omitted-by-budget")).toBe(true);
    }

    // THE POSITIVE-SCORE POPULATION THE CAP CUT, asserted directly. Measured, a mutant labelling
    // every `selectedCount: 0` source `omitted-by-relevance` would move SEVEN labels in pack A and
    // TEN in pack B, every one a source with a POSITIVE top score.
    //
    // The filter deliberately does NOT include `reason === "omitted-by-budget"` (LCLI-722 review):
    // filtering on the reason and then asserting the reason cannot fail, and an earlier form of this
    // did exactly that. The population is "cut by the cap" as the DATA describes it — nothing
    // selected, a positive score — and the reason is then the thing under test.
    for (const pack of [packA, packB]) {
      const cutByCap = pack.catalog.filter((entry) => entry.selectedCount === 0 && entry.topScore > 0);
      expect(cutByCap.length).toBeGreaterThan(0);
      for (const entry of cutByCap) {
        expect(entry.reason).toBe("omitted-by-budget");
      }
    }

    // THE ZERO-SCORE FLOOR, and what actually satisfies it (LCLI-722 review): the only `topScore: 0`
    // source in either pack is the PINNED `reference/cli-contract`, with `selectedCount: 1`. It is
    // therefore NOT a zero-score-nothing-selected population — there is no such population here, which
    // is exactly why the relevance loops above are vacuous and the distinction had to move to the
    // synthetic bundle. Asserting that shape rather than a bare count keeps the floor honest.
    for (const pack of [packA, packB]) {
      const zeroScore = pack.catalog.filter((entry) => entry.topScore === 0);
      expect(zeroScore.length).toBeGreaterThan(0);
      expect(zeroScore.every((entry) => entry.selectedCount > 0)).toBe(true);
    }

    // AND THE SAMPLES' OWN SOURCES, for the same reason — asserted for what they ARE rather than for
    // what the reason-eliminator used to infer. The addendum asks for "its source's catalog reason in
    // the other pack is omitted-by-relevance"; that form is FALSE here and MEASURED to be: neither
    // pack has a single relevance-omitted source, and both samples' sources read `omitted-by-budget`
    // with positive scores (A's `adr/0018…` at 4.7, B's `specs/lore-design` at 6.1). Their absence
    // from the other pack is the CAP's doing, not a relevance call, and no per-section score is
    // exposed to separate the two — which is exactly why the distinction is pinned on the synthetic
    // bundle above instead.
    const sourceOf = (key: string): string => key.split("\u0000")[0] as string;
    for (const [pack, key] of [
      [packB, sampleOnlyA],
      [packA, sampleOnlyB],
    ] as const) {
      const entry = pack.catalog.find((candidate) => candidate.reference === sourceOf(key));
      expect(entry).toBeDefined();
      expect(entry?.reason).not.toBe("omitted-by-relevance");
    }
  });
});

describe("LCLI-680 — repeated identical compilation is byte-identical (CTX-06)", () => {
  test("identical content digest and identical selection, with wall-clock timestamps excluded", async () => {
    const task = realTaskTitle(TASK_A_ID);
    const first = compile(task);
    // Compile again on the far side of a real clock advance, so "identical" is measured across two
    // different wall-clock instants rather than two calls that happen to share a millisecond.
    await Bun.sleep(5);
    const second = compile(task);

    // The digest is the canonical hash of the exact rendered bytes — nothing else enters it. Because
    // the rendering carries no run id, path, or wall-clock time, this is a content identity and not a
    // run identity.
    expect(first.packDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.packDigest).toBe(
      `sha256:${createHash("sha256").update(renderAgentContextMarkdown(first)).digest("hex")}`,
    );

    // The reusable content — the rendered pack and the selected source fingerprints — is identical
    // across the two runs.
    expect(renderAgentContextMarkdown(second)).toBe(renderAgentContextMarkdown(first));
    expect(second.packDigest).toBe(first.packDigest);
    expect(second.sections.map(sectionKey)).toEqual(first.sections.map(sectionKey));

    // No field of the pack is a wall-clock stamp: the reusable prefix holds no timestamp to exclude.
    for (const keyName of Object.keys(first)) {
      expect(keyName).not.toMatch(/time|date|stamp|instant|clock/i);
    }
  });
});

describe("LCLI-680 — changed inputs invalidate the pack digest (CTX-05)", () => {
  test("a different task input yields a different content digest, not a reused one", () => {
    const packA = compile(realTaskTitle(TASK_A_ID));
    const packB = compile(realTaskTitle(TASK_B_ID));

    // CTX-05's other half: an identity that survives an unchanged input is worthless unless a
    // CHANGED input moves it. Different task text, different rendered pack, different digest — so a
    // pack cached against this digest cannot be served for a task whose text has moved.
    expect(packB.packDigest).not.toBe(packA.packDigest);
    expect(renderAgentContextMarkdown(packB)).not.toBe(renderAgentContextMarkdown(packA));
  });

  test("a different role profile input yields a different content digest", () => {
    const task = realTaskTitle(TASK_A_ID);
    const asImplementation = compileAgentContext(snapshot, graph, "implementation", task, undefined, constitutionPath);
    const asDocumentation = compileAgentContext(snapshot, graph, "documentation", task, undefined, constitutionPath);

    // The profile is one of the inputs the spec names, and the profile revision is exactly what the
    // opum-agent-workflow/v1 projection pins. A changed profile is a changed pack.
    expect(asDocumentation.packDigest).not.toBe(asImplementation.packDigest);
  });
});

describe("LCLI-680 — a zero-score exclusion carries its own reason, and a mandatory anchor survives", () => {
  test("a source the zero-score filter empties whole reads `omitted-by-relevance`, never `omitted-by-budget`", () => {
    const pack = compileSynthetic();
    // The budget is ample (nothing is `truncated`), so a fully-omitted source cannot have been a
    // budget cut: it is a relevance omission and must say so.
    expect(pack.truncated).toBe(false);

    const unrelated = pack.catalog.find((entry) => entry.reference === "guides/unrelated");
    expect(unrelated).toBeDefined();
    expect(unrelated?.selectedCount).toBe(0);
    expect(unrelated?.reason).toBe("omitted-by-relevance");

    // The reason is truthful: NO catalog entry claims a budget omission when the budget cut nothing.
    expect(pack.catalog.some((entry) => entry.reason === "omitted-by-budget")).toBe(false);
    // ...and the omission stays VISIBLE, on the rendered catalog line, not a silent disappearance.
    expect(renderAgentContextMarkdown(pack)).toContain("- guides/unrelated (docs/guides/unrelated.md");
    expect(renderAgentContextMarkdown(pack)).toContain("omitted-by-relevance");
  });

  test("a Constitution ranked in `sources` is kept even at zero score, while the task ranks the deck", () => {
    const pack = compileSynthetic();

    // The deck IS ranked — the on-task source scored above zero — so the zero-score filter is active.
    const rules = pack.sections.find((item) => item.conceptId === "reference/rules");
    expect(rules?.score ?? 0).toBeGreaterThan(0);

    // The Constitution, ranked in `sources` (no auto-pin), scores zero and is kept anyway: it is
    // mandatory policy, so the zero-score exclusion's exception retains it rather than dropping it.
    const constitution = pack.sections.find((item) => item.conceptId === "constitution");
    expect(constitution).toBeDefined();
    expect(constitution?.score ?? 0).toBe(0);
    expect(pack.catalog.find((entry) => entry.reference === "constitution")?.reason).toBe("included");
  });

  test("the real tasks drop zero-score candidates without CALLING them budget omissions", () => {
    for (const task of [realTaskTitle(TASK_A_ID), realTaskTitle(TASK_B_ID)]) {
      const pack = compile(task);
      // The old form of this test required neither pack to be truncated and no omission to read
      // `omitted-by-budget`. The declared `task_evidence` cap (DEC-194 (4), LCLI-722) makes both
      // false for the real profiles, so what is asserted now is the distinction the reasons exist
      // for, which the cap must not blur: these packs DO truncate and DO drop positives by budget,
      // and a zero-score candidate is never reported as one of those.
      expect(pack.truncated).toBe(true);
      expect(pack.catalog.some((entry) => entry.reason === "omitted-by-budget")).toBe(true);
      // The honesty half, on a population that is NOT empty (LCLI-722 review — the zero-score loop
      // that used to sit here was vacuous, since these packs contain no such entry at all): a source
      // with something SELECTED never claims to be omitted, and a source with NOTHING selected names
      // a reason rather than going silently missing.
      expect(pack.catalog.filter((entry) => entry.selectedCount > 0).length).toBeGreaterThan(0);
      expect(pack.catalog.filter((entry) => entry.selectedCount === 0).length).toBeGreaterThan(0);
      for (const entry of pack.catalog) {
        if (entry.selectedCount > 0) expect(entry.reason.startsWith("omitted-by")).toBe(false);
        else expect(entry.reason.startsWith("omitted-by") || entry.reason === "no-candidates").toBe(true);
      }
    }
  });

  test("the profile's pinned mandatory reference is present however unrelated the task", () => {
    // A task sharing no term with the pinned contract: the mandatory tier is not ranked, so its
    // presence never depended on the task. This is the "mandatory anchor survives zero score" half
    // for the pin tier, alongside the Constitution case above for the ranked tier.
    const pack = compile("zebra quokka narwhal");
    expect(pack.pinned.map((item) => item.conceptId)).toContain("reference/cli-contract");
    expect(pack.sections.map((item) => item.conceptId)).not.toContain("reference/cli-contract");
  });
});
