/**
 * LCLI-575 — `lore agent context` is always query-augmented (opum-doc ADR "Make lore agent context
 * always query-augmented", ODOC-265, at opum-doc origin/main 9222079). One property per test, so a
 * mutation of one mechanism reddens a predictable subset rather than the whole file:
 *
 * - "carries hits" / "ranked best first" / "caps at three" — the section exists and is shaped (AC2).
 * - "dedup" — a concept already pinned or selected is never re-advertised (AC2, "not already selected").
 * - "no searchable term" — an unrankable task yields no hits, not three arbitrary concepts.
 * - "budget" — the section never pushes a pack over budget, nor turns a compilable pack into a failure.
 * - "plain" / "json" — the section appears in both output modes (AC2).
 * - "missing profile" — degrades to the section plus a warning, exit 0, not exit 3 (AC3).
 * - "floor" — the mandatory-pin floor is the pre-LCLI-575 one, pinned as a measured number (review B1).
 * - "explicit truncation" — a budget-emptied or budget-shortened section says so in --json and
 *   --plain, distinctly from a corpus with nothing to offer (review B2; cli-contract §3).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/commands/agent";
import {
  AGENT_CONTEXT_QUERY_HIT_LIMIT,
  compileAgentContext,
  renderAgentContextMarkdown,
} from "../src/core/agent-context";
import { loadAgentProfiles } from "../src/core/agent-profile";
import { loadBundle } from "../src/core/bundle";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };
const PLAIN_OUTPUT: OutputContext = { mode: "plain", color: false };
const TASK = "checkout validation";
/**
 * The mandatory-pin floor of {@link fixture} + {@link specialist} for {@link TASK}, MEASURED on the
 * pre-LCLI-575 compiler (lore-cli origin/dev 71f2c1e4): the smallest `--max-tokens` that compiled.
 * A literal, not a value derived from this compiler, because deriving it would move with the defect
 * it guards (review finding B1: the query section's heading once raised this floor to 263).
 */
const PRE_CHANGE_PIN_FLOOR = 219;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agent-query-hits-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function doc(rel: string, body: string, title: string, summary = `Summary for ${title}.`): void {
  const path = join(root, "docs", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `---\ntype: Reference\ntitle: ${title}\nsummary: ${summary}\ntags: [evidence]\n---\n${body}`);
}

function specialist(maxTokens = 4000): void {
  const path = join(root, ".lore/agents/frontend-dev.toml");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `schema_version = 1\nname = "frontend-dev"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = ${maxTokens}\npinned = ["reference/rules"]\nsources = ["specs/ui"]\n`,
  );
}

/**
 * The two profile documents (pinned `reference/rules`, ranked `specs/ui`) are deliberately the
 * STRONGEST matches for the task, so an undeduplicated section would be led by them. Four more
 * matching documents sit outside the profile, in a known score order, plus one that never matches.
 */
function fixture(): void {
  doc(
    "reference/rules.md",
    "# Rules\n\nCheckout validation checkout validation checkout validation checkout validation.\n",
    "Checkout validation rules",
  );
  doc(
    "specs/ui.md",
    "# Checkout form\n\nCheckout validation checkout validation checkout validation in the form.\n",
    "Checkout validation UI",
  );
  doc("guides/alpha.md", "# Alpha\n\nCheckout validation checkout validation and more.\n", "Alpha guide");
  doc("guides/bravo.md", "# Bravo\n\nCheckout validation and other text here.\n", "Bravo guide");
  doc("guides/charlie.md", "# Charlie\n\nCheckout only, nothing else relevant at all here.\n", "Charlie guide");
  doc(
    "guides/delta.md",
    "# Delta\n\nA long passage that mentions checkout once among many other words.\n",
    "Delta guide",
  );
  doc("guides/unrelated.md", "# Unrelated\n\nStorage engines and caching.\n", "Unrelated guide");
}

function compile(task = TASK, maxTokens?: number) {
  return compileAgentContext(loadAgentProfiles(root), loadBundle(join(root, "docs")), "frontend-dev", task, maxTokens);
}

describe("agent context — bundle-wide query hits (LCLI-575)", () => {
  test("carries hits, each with id, title and snippet", () => {
    fixture();
    specialist();
    const pack = compile();
    expect(pack.queryHits.length).toBeGreaterThan(0);
    for (const hit of pack.queryHits) {
      expect(typeof hit.id).toBe("string");
      expect(hit.title).toBeDefined();
      expect(hit.snippet).toBeDefined();
      expect(hit.score).toBeGreaterThan(0);
    }
    expect(pack.queryHits.find((hit) => hit.id === "guides/alpha")).toMatchObject({
      title: "Alpha guide",
      snippet: "Summary for Alpha guide.",
    });
  });

  test("ranked best first", () => {
    fixture();
    specialist();
    const scores = compile().queryHits.map((hit) => hit.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test("caps at three", () => {
    fixture();
    specialist();
    // Four matching documents live outside the profile, so the cap — not the corpus — binds.
    expect(AGENT_CONTEXT_QUERY_HIT_LIMIT).toBe(3);
    expect(compile().queryHits).toHaveLength(3);
  });

  test("dedup: a pinned or selected concept is never re-advertised as a hit", () => {
    fixture();
    specialist();
    const pack = compile();
    const packed = new Set([...pack.pinned, ...pack.sections].map((item) => item.conceptId));
    // Precondition, not the assertion: both profile documents really are in the pack.
    expect(packed.has("reference/rules")).toBe(true);
    expect(packed.has("specs/ui")).toBe(true);
    for (const hit of pack.queryHits) expect(packed.has(hit.id)).toBe(false);
    // Positive control: with the two profile documents excluded, the three next-best are exactly these.
    expect(pack.queryHits.map((hit) => hit.id)).toEqual(["guides/alpha", "guides/bravo", "guides/charlie"]);
  });

  test("no searchable term: no hits, rather than three arbitrary concepts in id order", () => {
    fixture();
    specialist();
    const pack = compile("%%% ---");
    expect(pack.queryHits).toEqual([]);
  });

  test("budget: the section shrinks to fit rather than overflowing or failing the pack", () => {
    fixture();
    specialist();
    // Find the pins-only floor, then give it a budget with room for a pack but not all three hits.
    const roomy = compile(TASK, 4000);
    let budget = 1;
    let tight = undefined as ReturnType<typeof compile> | undefined;
    for (budget = 50; budget < 4000; budget += 5) {
      try {
        tight = compile(TASK, budget);
        break;
      } catch {
        // Below the mandatory-pin floor: keep climbing.
      }
    }
    expect(tight).toBeDefined();
    const floor = tight as ReturnType<typeof compile>;
    // The first budget that compiles is the pins-only floor, where the query section cannot fit whole.
    expect(floor.queryHits.length).toBeLessThan(roomy.queryHits.length);
    expect(floor.tokenEstimate).toBeLessThanOrEqual(budget);
    expect(roomy.tokenEstimate).toBeLessThanOrEqual(4000);
  });
});

describe("lore agent context — output modes (LCLI-575)", () => {
  test("json: queryHits is an additive field on agent.context.export", async () => {
    fixture();
    specialist();
    const stdout = capture();
    const code = await runAgent({
      root,
      output: JSON_OUTPUT,
      args: ["context", "frontend-dev", "--task", TASK],
      stdout,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text());
    expect(envelope.kind).toBe("agent.context.export");
    expect(envelope.data.queryHits.map((hit: { id: string }) => hit.id)).toEqual([
      "guides/alpha",
      "guides/bravo",
      "guides/charlie",
    ]);
    // Existing fields are untouched by the addition.
    for (const field of ["profile", "task", "pinned", "sections", "catalog", "total", "shown", "truncated"]) {
      expect(envelope.data).toHaveProperty(field);
    }
    expect(envelope.data.profileMissing).toBeUndefined();
  });

  test("plain: the section renders with each hit's id, title and snippet", async () => {
    fixture();
    specialist();
    const stdout = capture();
    const code = await runAgent({
      root,
      output: PLAIN_OUTPUT,
      args: ["context", "frontend-dev", "--task", TASK],
      stdout,
    });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).toContain("## Bundle-wide query hits");
    expect(text).toMatch(/^- guides\/alpha — Alpha guide: Summary for Alpha guide\. \(score [0-9.]+\)$/m);
    expect(text.indexOf("## Bundle-wide query hits")).toBeLessThan(text.indexOf("## Pinned evidence"));
  });
});

describe("lore agent context — a missing profile degrades (LCLI-575, AC3)", () => {
  test("json: exit 0, the query section, profileMissing, and a warning on stderr", async () => {
    fixture();
    const stdout = capture();
    const stderr = capture();
    const code = await runAgent({
      root,
      output: JSON_OUTPUT,
      args: ["context", "no-such-profile", "--task", TASK],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout.text()).data;
    expect(data.profileMissing).toBe(true);
    expect(data.pinned).toEqual([]);
    expect(data.sections).toEqual([]);
    // With nothing packed, the top three are the three strongest matches bundle-wide.
    expect(data.queryHits.map((hit: { id: string }) => hit.id)).toEqual([
      "reference/rules",
      "specs/ui",
      "guides/alpha",
    ]);
    expect(stderr.text()).toContain('agent profile "no-such-profile" was not found');
  });

  test("plain: the pack itself carries the warning", async () => {
    fixture();
    const stdout = capture();
    const code = await runAgent({
      root,
      output: PLAIN_OUTPUT,
      args: ["context", "no-such-profile", "--task", TASK],
      stdout,
      stderr: capture(),
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('> Warning: agent profile "no-such-profile" was not found');
    expect(stdout.text()).toContain("## Bundle-wide query hits");
  });

  test("an existing profile carries no warning", async () => {
    fixture();
    specialist();
    const stdout = capture();
    const stderr = capture();
    await runAgent({ root, output: PLAIN_OUTPUT, args: ["context", "frontend-dev", "--task", TASK], stdout, stderr });
    expect(stdout.text()).not.toContain("> Warning:");
    expect(stderr.text()).not.toContain("was not found");
  });
});

function isValidationError(cause: unknown): cause is LoreError {
  return cause instanceof LoreError && cause.type === "validation";
}

/** The smallest budget at which `predicate` holds for the compiled pack, scanning up from the floor. */
function firstBudget(predicate: (pack: ReturnType<typeof compile>) => boolean): {
  budget: number;
  pack: ReturnType<typeof compile>;
} {
  for (let budget = PRE_CHANGE_PIN_FLOOR; budget < 4000; budget++) {
    let pack: ReturnType<typeof compile>;
    try {
      pack = compile(TASK, budget);
    } catch (cause) {
      // Below the floor: keep climbing, so these tests measure truncation, not the floor (B1's tests).
      if (isValidationError(cause)) continue;
      throw cause;
    }
    if (predicate(pack)) return { budget, pack };
  }
  throw new Error("no budget below 4000 satisfied the predicate");
}

describe("agent context — the mandatory-pin floor is unchanged (LCLI-575 review B1)", () => {
  test("floor: a budget that compiled before LCLI-575 still compiles", () => {
    fixture();
    specialist();
    const pack = compile(TASK, PRE_CHANGE_PIN_FLOOR);
    expect(pack.tokenEstimate).toBeLessThanOrEqual(PRE_CHANGE_PIN_FLOOR);
  });

  test("floor: one token below it still fails, naming the pre-LCLI-575 requirement", () => {
    fixture();
    specialist();
    let thrown: unknown;
    try {
      compile(TASK, PRE_CHANGE_PIN_FLOOR - 1);
    } catch (cause) {
      thrown = cause;
    }
    expect(isValidationError(thrown)).toBe(true);
    expect((thrown as LoreError).input).toMatchObject({ requiredTokens: PRE_CHANGE_PIN_FLOOR });
  });
});

describe("agent context — budget truncation of the query section is explicit (LCLI-575 review B2)", () => {
  test("explicit truncation, json: at the floor the section is dropped and the omission is counted", () => {
    fixture();
    specialist();
    const pack = compile(TASK, PRE_CHANGE_PIN_FLOOR);
    expect(pack.queryHits).toEqual([]);
    expect(pack.queryHitsSectionOmitted).toBe(true);
    expect(pack.queryHitsOmitted).toBe(AGENT_CONTEXT_QUERY_HIT_LIMIT);
    expect(renderAgentContextMarkdown(pack)).not.toContain("## Bundle-wide query hits");
  });

  test("explicit truncation, json: a budget-emptied section counts what it cut", () => {
    fixture();
    specialist();
    const { pack } = firstBudget((candidate) => candidate.queryHitsSectionOmitted !== true);
    expect(pack.queryHits).toEqual([]);
    expect(pack.queryHitsOmitted).toBe(AGENT_CONTEXT_QUERY_HIT_LIMIT);
  });

  test("explicit truncation, plain: a budget-emptied section says the budget emptied it", () => {
    fixture();
    specialist();
    const { pack } = firstBudget((candidate) => candidate.queryHitsSectionOmitted !== true);
    const text = renderAgentContextMarkdown(pack);
    expect(text).toContain("## Bundle-wide query hits");
    expect(text).toContain("_Omitted by budget: 3 bundle-wide hits outside this pack did not fit;");
    expect(text).not.toContain("_No bundle-wide hit outside this pack._");
  });

  test("explicit truncation: a budget-shortened section says how many it showed of how many", () => {
    fixture();
    specialist();
    const { pack } = firstBudget((candidate) => candidate.queryHits.length > 0);
    expect(pack.queryHits.length).toBeLessThan(AGENT_CONTEXT_QUERY_HIT_LIMIT);
    expect(pack.queryHitsOmitted).toBe(AGENT_CONTEXT_QUERY_HIT_LIMIT - pack.queryHits.length);
    expect(renderAgentContextMarkdown(pack)).toContain(
      `showing ${pack.queryHits.length} of 3 bundle-wide hits — the budget omitted ${pack.queryHitsOmitted};`,
    );
  });

  test("explicit truncation: an empty corpus is not reported as a budget cut", () => {
    fixture();
    specialist();
    const pack = compile("%%% ---");
    expect(pack.queryHitsOmitted).toBe(0);
    expect(renderAgentContextMarkdown(pack)).toContain("_No bundle-wide hit outside this pack._");
  });

  test("explicit truncation: an untruncated pack reports queryHitsOmitted 0 in --json", async () => {
    fixture();
    specialist();
    const stdout = capture();
    await runAgent({ root, output: JSON_OUTPUT, args: ["context", "frontend-dev", "--task", TASK], stdout });
    const data = JSON.parse(stdout.text()).data;
    expect(data.queryHits).toHaveLength(3);
    expect(data.queryHitsOmitted).toBe(0);
    expect(data.queryHitsSectionOmitted).toBeUndefined();
  });

  test("explicit truncation, cli: a dropped section is named on stderr and counted in --json", async () => {
    fixture();
    specialist();
    const stdout = capture();
    const stderr = capture();
    const code = await runAgent({
      root,
      output: JSON_OUTPUT,
      args: ["context", "frontend-dev", "--task", TASK, "--max-tokens", String(PRE_CHANGE_PIN_FLOOR)],
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout.text()).data;
    expect(data.queryHits).toEqual([]);
    expect(data.queryHitsOmitted).toBe(3);
    expect(data.queryHitsSectionOmitted).toBe(true);
    expect(stderr.text()).toContain("the token budget left no room for the bundle-wide query section; 3 hits");
  });
});

describe("agent context — a missing profile's pack (LCLI-575 review L3)", () => {
  test("the empty source catalog renders _None._", async () => {
    fixture();
    const stdout = capture();
    await runAgent({
      root,
      output: PLAIN_OUTPUT,
      args: ["context", "no-such-profile", "--task", TASK],
      stdout,
      stderr: capture(),
    });
    expect(stdout.text()).toContain("## Allowed source catalog\n\n_None._\n");
  });
});
