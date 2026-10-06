/**
 * LCLI-680 — ODOC-437 slice 1: exclude zero-score filler from optional-evidence selection and hold a
 * stable pack digest. The governing design of record is opum-doc's
 * `docs/specs/opum-task-context-and-evidence-contract.md` (origin/dev); this file pins the two
 * spec criteria the slice advances:
 *
 *   CTX-01 — two UNRELATED REAL lore-cli tasks that share required policy select DIFFERENT optional
 *            evidence, and unrelated zero-score sections are ABSENT from both packs. Selection step 4
 *            ("Exclude zero-score search candidates unless a mandatory policy or task/graph relation
 *            independently requires them"); step 6 ("Never fill unused capacity with low-value
 *            sections").
 *   CTX-06 — repeated identical compilation yields an identical content digest and an identical
 *            selection, with wall-clock timestamps excluded from the reusable content prefix.
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
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
