import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { type ContextOptions, runContext } from "../src/commands/context";
import { estimateTokens, loadBundle } from "../src/core/bundle";
import { buildContext, type ContextExport } from "../src/core/context";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-context-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a bundle file under `docs/` (path relative to `docs/`). */
function writeDoc(rel: string, contents: string): void {
  const abs = join(root, "docs", rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

/** Load the `docs/` bundle written so far into a graph. */
function graph() {
  return loadBundle(join(root, "docs"));
}

/**
 * A four-concept chain so depth bounds and nearest-first order are observable:
 *
 *   stories/bulk —specs→ specs/archive —link→ adr/0001-x   (+ bulk —link→ reference/orders)
 *
 * From `stories/bulk`: depth 1 reaches `{specs/archive, reference/orders}` (in that
 * edge-insertion order), depth 2 also reaches `adr/0001-x`. Summaries vary so the
 * `summary → title → none` fallback is covered:
 *
 * - `reference/orders` has a `summary`;
 * - `specs/archive` has no `summary` but a `title` (the fallback);
 * - `adr/0001-x` has neither (no summary line at all).
 */
function writeChainBundle(): void {
  writeDoc(
    "stories/bulk.md",
    "---\ntype: Story\nsummary: Bulk archive orders within a budget.\nspecs:\n  - ../specs/archive.md\n---\nBulk archive story body.\nLinks [orders](../reference/orders.md).\n",
  );
  writeDoc(
    "reference/orders.md",
    "---\ntype: Reference\ntitle: Orders\nsummary: The orders domain reference.\n---\nOrders reference body.\n",
  );
  writeDoc("specs/archive.md", "---\ntype: Spec\ntitle: Archive\n---\nArchive spec. See [adr](../adr/0001-x.md).\n");
  writeDoc("adr/0001-x.md", "---\ntype: ADR\n---\nADR body.\n");
}

/** Run `context` in JSON mode and return the parsed `data` payload plus the exit code. */
function exportContext(args: string[], options?: Partial<ContextOptions>): { code: number; data: ContextExport } {
  const stdout = capture();
  const stderr = capture();
  const code = runContext({ root, output: JSON_CTX, stdout, stderr, args, ...options });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: ContextExport };
  expect(envelope.kind).toBe("context.export");
  return { code, data: envelope.data };
}

// ── core/context: pack shaping ─────────────────────────────────────────────────────

describe("buildContext — target shaping", () => {
  test("carries the target's full body, type, title, and the whole-concept token estimate", () => {
    writeChainBundle();
    const g = graph();
    const data = buildContext(g, "reference/orders", { depth: 0 });
    expect(data.target).toMatchObject({ id: "reference/orders", type: "Reference", title: "Orders" });
    expect(data.target.body).toBe("Orders reference body.\n");
    // The target's estimate is the same number `lore graph` reports for that concept.
    expect(data.target.tokenEstimate).toBe(g.tokenEstimate("reference/orders"));
  });

  test("depth 0 is the target alone — no neighbors, nothing truncated", () => {
    writeChainBundle();
    const data = buildContext(graph(), "stories/bulk", { depth: 0 });
    expect(data).toMatchObject({ root: "stories/bulk", depth: 0, total: 0, shown: 0, truncated: false });
    expect(data.neighbors).toEqual([]);
    expect(data.tokenEstimate).toBe(data.target.tokenEstimate);
    expect(data.maxTokens).toBeUndefined();
  });

  test("throws not_found when the target id is not in the bundle", () => {
    writeChainBundle();
    expectError("not_found", () => buildContext(graph(), "nope/missing"));
  });
});

describe("buildContext — neighbor compaction", () => {
  test("defaults to depth 1 and compacts neighbors nearest-first (summary → title → none)", () => {
    writeChainBundle();
    const data = buildContext(graph(), "stories/bulk"); // default depth 1
    expect(data.depth).toBe(1);
    expect(data.neighbors.map((n) => n.id)).toEqual(["specs/archive", "reference/orders"]);
    // specs/archive has no summary → falls back to its title.
    expect(data.neighbors.find((n) => n.id === "specs/archive")).toMatchObject({ type: "Spec", summary: "Archive" });
    // reference/orders has an explicit summary.
    expect(data.neighbors.find((n) => n.id === "reference/orders")?.summary).toBe("The orders domain reference.");
  });

  test("a neighbor with neither summary nor title omits the summary field; its cost is its id+type", () => {
    writeChainBundle();
    const data = buildContext(graph(), "stories/bulk", { depth: 2 });
    const adr = data.neighbors.find((n) => n.id === "adr/0001-x");
    // No title, no summary, but the always-emitted id + type still carry a (charged) cost.
    expect(adr).toMatchObject({ type: "ADR", tokenEstimate: estimateTokens("adr/0001-x ADR") });
    expect(adr).not.toHaveProperty("summary");
  });

  test("a neighbor's whitespace-only summary falls back to title; a YAML-coerced scalar summary is stringified", () => {
    writeDoc("hub.md", "---\ntype: Story\n---\nTo [n](./num.md) and [f](./flag.md).\n");
    // Whitespace-only summary → the title is the fallback.
    writeDoc("num.md", '---\ntype: Widget\ntitle: Num Title\nsummary: "   "\n---\nText.\n');
    // Unknown type → an unquoted number survives as a YAML scalar; it is stringified, not dropped.
    writeDoc("flag.md", "---\ntype: Widget\nsummary: 2024\n---\nText.\n");
    const data = buildContext(graph(), "hub", { depth: 1 });
    expect(data.neighbors.find((n) => n.id === "num")?.summary).toBe("Num Title");
    expect(data.neighbors.find((n) => n.id === "flag")?.summary).toBe("2024");
  });

  test("each neighbor's estimate is chars/4 of its id+type+title+summary, and the total sums target + included", () => {
    writeChainBundle();
    const data = buildContext(graph(), "stories/bulk", { depth: 2 });
    const ref = data.neighbors.find((n) => n.id === "reference/orders");
    // The whole emitted entry (id, type, title, summary) is charged — not the summary
    // alone — so a wide neighborhood of short summaries (behind long titles) can't
    // silently overrun the budget.
    expect(ref?.tokenEstimate).toBe(estimateTokens("reference/orders Reference Orders The orders domain reference."));
    const sum = data.target.tokenEstimate + data.neighbors.reduce((acc, n) => acc + n.tokenEstimate, 0);
    expect(data.tokenEstimate).toBe(sum);
  });

  test("a neighbor's tokenEstimate includes its title even behind a short summary (LORE-148)", () => {
    // Two otherwise-identical neighbors (same short summary), differing only in
    // whether they carry a long title. Before the fix, tokenEstimate was computed
    // from id+type+summary only, so a long title contributed nothing and both
    // neighbors cost the same — letting a bundle of long-titled, short-summarized
    // concepts blow well past --max-tokens without the accounting ever noticing.
    writeDoc("hub.md", "---\ntype: Story\n---\nTo [titled](./titled.md) and [bare](./bare.md).\n");
    writeDoc(
      "titled.md",
      '---\ntype: Widget\ntitle: "A Very Long Title That Should Count Toward The Token Budget"\nsummary: "Short."\n---\nText.\n',
    );
    writeDoc("bare.md", '---\ntype: Widget\nsummary: "Short."\n---\nText.\n');
    const data = buildContext(graph(), "hub", { depth: 1 });
    const titled = data.neighbors.find((n) => n.id === "titled");
    const bare = data.neighbors.find((n) => n.id === "bare");
    expect(titled?.title).toBe("A Very Long Title That Should Count Toward The Token Budget");
    expect(titled?.summary).toBe("Short.");
    expect(bare?.title).toBeUndefined();
    expect(bare?.summary).toBe("Short.");
    // Same id length ("titled" vs "bare" differ by 2 chars) and identical summary,
    // yet the titled neighbor's cost must be substantially higher — the title's
    // bytes are actually counted, not silently dropped.
    expect(titled?.tokenEstimate).toBeGreaterThan((bare?.tokenEstimate as number) + 10);
    expect(titled?.tokenEstimate).toBe(estimateTokens(`titled Widget ${titled?.title} Short.`));
    expect(bare?.tokenEstimate).toBe(estimateTokens("bare Widget Short."));
  });

  test("the target's and a neighbor's `title` are kept verbatim, matching `lore graph`", () => {
    // A title with surrounding whitespace must NOT be trimmed/collapsed (graph keeps it verbatim).
    writeDoc("hub.md", '---\ntype: Story\ntitle: "  Spaced Hub  "\n---\nTo [n](./n.md).\n');
    writeDoc("n.md", '---\ntype: Reference\ntitle: "  Edge Ref  "\n---\nText.\n');
    const data = buildContext(graph(), "hub", { depth: 1 });
    expect(data.target.title).toBe("  Spaced Hub  ");
    expect(data.neighbors.find((n) => n.id === "n")?.title).toBe("  Edge Ref  ");
  });
});

describe("buildContext — token budget", () => {
  test("stops at the first neighbor that would exceed --max-tokens (a nearest-first prefix)", () => {
    writeChainBundle();
    const g = graph();
    // Read the real costs from an unbudgeted run: the nearest neighbor (specs/archive)
    // and the target. A budget that fits exactly those two leaves no room for the
    // second neighbor, so the fill stops at it — a predictable nearest-first prefix.
    const full = buildContext(g, "stories/bulk", { depth: 2 });
    const target = g.tokenEstimate("stories/bulk");
    const firstCost = (full.neighbors.find((n) => n.id === "specs/archive") as { tokenEstimate: number }).tokenEstimate;
    const data = buildContext(g, "stories/bulk", { depth: 2, maxTokens: target + firstCost });
    expect(data.neighbors.map((n) => n.id)).toEqual(["specs/archive"]);
    expect(data).toMatchObject({ maxTokens: target + firstCost, total: 3, shown: 1, truncated: true });
    expect(data.tokenEstimate).toBe(target + firstCost);
  });

  test("the target is always included even when it alone exceeds the budget", () => {
    writeChainBundle();
    const g = graph();
    const data = buildContext(g, "stories/bulk", { depth: 1, maxTokens: 1 });
    expect(data.neighbors).toEqual([]);
    expect(data).toMatchObject({ total: 2, shown: 0, truncated: true });
    expect(data.tokenEstimate).toBe(g.tokenEstimate("stories/bulk")); // target still counted
  });

  test("an omitted budget keeps every neighbor within depth (nothing truncated)", () => {
    writeChainBundle();
    const data = buildContext(graph(), "stories/bulk", { depth: 2 });
    expect(data.neighbors.map((n) => n.id)).toEqual(["specs/archive", "reference/orders", "adr/0001-x"]);
    expect(data).toMatchObject({ total: 3, shown: 3, truncated: false });
    expect(data.maxTokens).toBeUndefined();
  });

  test("an over-budget target with no neighbors still reports truncated (not a silent overrun)", () => {
    writeChainBundle();
    const g = graph();
    // depth 0 → zero neighbors, so `shown < total` cannot fire; the only over-budget
    // signal is the target body itself exceeding --max-tokens.
    const data = buildContext(g, "stories/bulk", { depth: 0, maxTokens: 1 });
    expect(data).toMatchObject({ total: 0, shown: 0, truncated: true });
    expect(data.tokenEstimate).toBe(g.tokenEstimate("stories/bulk"));
    expect(data.tokenEstimate).toBeGreaterThan(1); // pack is over the requested budget
  });
});

// ── command: runContext ────────────────────────────────────────────────────────────

describe("lore context — command", () => {
  test("JSON export exits 0 with the context.export envelope", () => {
    writeChainBundle();
    const { code, data } = exportContext(["stories/bulk"]);
    expect(code).toBe(0);
    expect(data.root).toBe("stories/bulk");
    expect(data.depth).toBe(1);
  });

  test("a path/.md-form id is normalized like graph/rename/supersede", () => {
    writeChainBundle();
    expect(exportContext(["stories/bulk.md", "--depth", "0"]).data.root).toBe("stories/bulk");
    expect(exportContext(["./stories/bulk", "--depth", "0"]).data.root).toBe("stories/bulk");
  });

  test("--max-tokens and --depth flags are parsed (including the --flag=value form)", () => {
    writeChainBundle();
    const { data } = exportContext(["stories/bulk", "--depth=2", "--max-tokens=100000"]);
    expect(data).toMatchObject({ depth: 2, maxTokens: 100000 });
  });

  test("plain mode emits a pasteable pack: header, target body, neighbor lines", () => {
    writeChainBundle();
    const stdout = capture();
    runContext({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["stories/bulk"] });
    const text = stdout.text();
    expect(text).toContain("context: stories/bulk  [Story] — depth 1");
    expect(text).toContain("Bulk archive story body.");
    expect(text).toContain("neighbors (2 of 2):");
    expect(text).toContain("  - reference/orders  [Reference]  — The orders domain reference.");
    expect(text).toContain("  - specs/archive  [Spec]  — Archive");
  });

  test("plain mode shows the §3 truncation footer (raise --max-tokens) when the budget drops neighbors", () => {
    writeChainBundle();
    // A budget that fits the target exactly leaves no room for any neighbor, but is not
    // over budget — so it is the dropped-neighbor footer, with the corrected hint.
    const target = loadBundle(join(root, "docs")).tokenEstimate("stories/bulk");
    const stdout = capture();
    runContext({
      root,
      output: PLAIN_CTX,
      stdout,
      stderr: capture(),
      args: ["stories/bulk", "--max-tokens", String(target)],
    });
    const text = stdout.text();
    expect(text).toContain("neighbors (0 of 2):");
    expect(text).toContain("showing 0 of 2 — raise --max-tokens to include more");
    expect(text).not.toContain("lower --depth"); // the counterfactual clause is gone
  });

  test("plain mode warns when the always-included target alone exceeds --max-tokens", () => {
    writeChainBundle();
    const stdout = capture();
    runContext({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["stories/bulk", "--max-tokens", "1"] });
    const text = stdout.text();
    expect(text).toContain("over budget:");
    expect(text).toContain("exceeds the 1-token limit");
  });

  test("an unknown id surfaces as a not_found error", () => {
    writeChainBundle();
    expectError("not_found", () =>
      runContext({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["nope/x"] }),
    );
  });

  test.each([
    [[], "missing concept <id>"],
    [["--bogus", "x"], "unknown option"],
    [["-x", "x"], 'unknown option "-x"'],
    [["a", "b"], 'unexpected argument "b"'],
    [["x", "--depth", "1.5"], 'invalid --depth "1.5"'],
    [["x", "--depth", "-1"], "--depth needs a value"],
    [["x", "--depth=-1"], 'invalid --depth "-1"'],
    [["x", "--depth", "1", "--depth", "2"], "--depth given more than once"],
    [["x", "--max-tokens", "0"], 'invalid --max-tokens "0"'],
    [["x", "--max-tokens=0"], 'invalid --max-tokens "0"'],
    [["x", "--max-tokens"], "--max-tokens needs a value"],
    [["x", "--max-tokens="], "--max-tokens needs a value"],
    [["x", "--max-tokens", "abc"], 'invalid --max-tokens "abc"'],
    [["x", "--max-tokens", "1", "--max-tokens", "2"], "--max-tokens given more than once"],
    [["x", "--depth", "99999999999999999999"], "too large"],
  ])("rejects %j with a usage error", (args, fragment) => {
    writeChainBundle();
    const err = expectError("usage", () =>
      runContext({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args }),
    );
    expect(`${err.message} ${err.hint ?? ""}`).toContain(fragment);
  });

  test("`--` ends option parsing so a following token is the id", () => {
    writeChainBundle();
    expect(exportContext(["--", "stories/bulk"]).data.root).toBe("stories/bulk");
  });
});

// ── router: cli dispatch ─────────────────────────────────────────────────────────

describe("cli — context dispatch", () => {
  test("`lore context <id> --json` routes to runContext and emits the envelope", () => {
    writeChainBundle();
    const stdout = capture();
    const code = run(["bun", "cli", "context", "stories/bulk", "--json"], {
      stdout,
      stderr: capture(),
      cwd: root,
      isTTY: false,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.text()).kind).toBe("context.export");
  });

  test("`lore context <missing>` exits 3 (not found)", () => {
    writeChainBundle();
    const code = run(["bun", "cli", "context", "nope/x"], {
      stdout: capture(),
      stderr: capture(),
      cwd: root,
      isTTY: false,
    });
    expect(code).toBe(3);
  });

  test("`lore context` with no id exits 2 (usage)", () => {
    writeChainBundle();
    const code = run(["bun", "cli", "context"], { stdout: capture(), stderr: capture(), cwd: root, isTTY: false });
    expect(code).toBe(2);
  });
});
