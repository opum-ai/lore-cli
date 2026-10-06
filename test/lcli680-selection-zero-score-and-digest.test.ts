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
 * Measured 2026-10-06 against this branch: the LCLI-289 pack selects 197 of the 254 declared
 * candidates and the LCLI-380 pack 223, with 21 sections in only the first and 47 in only the second
 * — non-empty in BOTH directions, so the two selections are genuinely different, not nested. Neither
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

    // The reason-eliminator: neither pack is budget-truncated (the profile's 108000-token budget
    // holds every eligible candidate). So a section that is absent from one pack is absent because
    // step 4 excluded it as zero-score, NOT because step 9's budget dropped it. This is what makes
    // the absence assertions below statements about relevance.
    expect(packA.truncated).toBe(false);
    expect(packB.truncated).toBe(false);

    // Every selected section is relevant to its own task: no zero-score filler leaked into either
    // pack (step 6: unused capacity is never filled with low-value sections).
    for (const item of packA.sections) expect(item.score ?? 0).toBeGreaterThan(0);
    for (const item of packB.sections) expect(item.score ?? 0).toBeGreaterThan(0);

    // A section task A selects but task B does not is a section that scored zero for B, and such
    // sections exist in both directions. Concrete, named instances of the exclusion:
    const selectionA = selectedSections(packA);
    const selectionB = selectedSections(packB);
    const onlyA = [...selectionA].filter((key) => !selectionB.has(key));
    const onlyB = [...selectionB].filter((key) => !selectionA.has(key));
    expect(onlyA.length).toBeGreaterThan(0);
    expect(onlyB.length).toBeGreaterThan(0);

    // Spot-check one real section from each side: present in its own task's pack, and absent (as a
    // zero-score section) from the unrelated task's pack.
    const sampleOnlyA = onlyA.find((key) => key.startsWith("specs/lore-design\u0000"));
    const sampleOnlyB = onlyB.find((key) => key.startsWith("adr/0018-"));
    if (sampleOnlyA === undefined || sampleOnlyB === undefined) {
      throw new Error("expected a specs/lore-design section only in A and an adr/0018 section only in B");
    }
    expect(selectionA.has(sampleOnlyA)).toBe(true);
    expect(selectionB.has(sampleOnlyA)).toBe(false);
    expect(selectionB.has(sampleOnlyB)).toBe(true);
    expect(selectionA.has(sampleOnlyB)).toBe(false);
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

  test("the real tasks drop zero-score candidates without reporting any budget omission", () => {
    for (const task of [realTaskTitle(TASK_A_ID), realTaskTitle(TASK_B_ID)]) {
      const pack = compile(task);
      // Neither real pack is truncated, so every omission in it is a relevance omission; nothing may
      // read `omitted-by-budget`.
      expect(pack.truncated).toBe(false);
      expect(pack.catalog.some((entry) => entry.reason === "omitted-by-budget")).toBe(false);
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
