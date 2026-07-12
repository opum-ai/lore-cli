import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { type GraphOptions, runGraph } from "../src/commands/graph";
import { loadBundle } from "../src/core/bundle";
import { buildGraphExport, type GraphExport, toDot } from "../src/core/graph";
import { subgraph } from "../src/core/query";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-graph-"));
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
 * A small four-concept bundle with two components:
 *
 * - `reference/orders` ←link— `stories/bulk` —specs→ `specs/archive` (one connected trio)
 * - `adr/0001-x` —link→ `./missing.md` (a dangling link; its own component)
 */
function writeStandardBundle(): void {
  writeDoc("reference/orders.md", "---\ntype: Reference\ntitle: Orders\n---\nOrders reference.\n");
  writeDoc(
    "stories/bulk.md",
    "---\ntype: Story\nspecs:\n  - ../specs/archive.md\n---\nUses [orders](../reference/orders.md).\n",
  );
  writeDoc("specs/archive.md", "---\ntype: Spec\ntitle: Archive\n---\nArchive spec.\n");
  writeDoc("adr/0001-x.md", "---\ntype: Adr\n---\nSee [gone](./missing.md).\n");
}

/** Run `graph` in JSON mode and return the parsed `data` payload plus the exit code. */
function exportGraph(args: string[], options?: Partial<GraphOptions>): { code: number; data: GraphExport } {
  const stdout = capture();
  const stderr = capture();
  const code = runGraph({ root, output: JSON_CTX, stdout, stderr, args, ...options });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: GraphExport };
  expect(envelope.kind).toBe("graph.export");
  return { code, data: envelope.data };
}

// ── core/query: subgraph traversal ───────────────────────────────────────────────

describe("subgraph — depth-bounded undirected traversal", () => {
  test("throws not_found when the root id is not in the bundle", () => {
    writeStandardBundle();
    expectError("not_found", () => subgraph(graph(), "nope/missing", 1));
  });

  test("depth 0 is the root alone", () => {
    writeStandardBundle();
    expect([...subgraph(graph(), "reference/orders", 0)]).toEqual(["reference/orders"]);
  });

  test("depth 1 reaches neighbors via an inbound edge (undirected)", () => {
    writeStandardBundle();
    // `stories/bulk` links TO `reference/orders`; an undirected hop still finds it.
    expect([...subgraph(graph(), "reference/orders", 1)].sort()).toEqual(["reference/orders", "stories/bulk"]);
  });

  test("unbounded depth returns the whole connected component, not other components", () => {
    writeStandardBundle();
    const reached = [...subgraph(graph(), "reference/orders", Number.POSITIVE_INFINITY)].sort();
    expect(reached).toEqual(["reference/orders", "specs/archive", "stories/bulk"]);
    expect(reached).not.toContain("adr/0001-x"); // separate component
  });

  test("a dangling edge does not extend reach, and a cycle is tolerated", () => {
    writeDoc("a.md", "---\ntype: Story\n---\nTo [b](./b.md) and [gone](./missing.md).\n");
    writeDoc("b.md", "---\ntype: Story\n---\nBack to [a](./a.md).\n"); // a↔b cycle
    const reached = [...subgraph(graph(), "a", Number.POSITIVE_INFINITY)].sort();
    expect(reached).toEqual(["a", "b"]); // no "missing"; cycle did not loop
  });
});

// ── core/graph: export shaping ───────────────────────────────────────────────────

describe("buildGraphExport — whole-bundle shaping", () => {
  test("nodes are every concept in ascending id order with type, optional title, and token estimate", () => {
    writeStandardBundle();
    const data = buildGraphExport(graph());
    expect(data.nodes.map((n) => n.id)).toEqual(["adr/0001-x", "reference/orders", "specs/archive", "stories/bulk"]);
    const orders = data.nodes.find((n) => n.id === "reference/orders");
    expect(orders).toMatchObject({ type: "Reference", title: "Orders" });
    expect(orders?.tokenEstimate).toBeGreaterThan(0);
    // A concept with no `title` omits the field rather than emitting null/empty.
    expect(data.nodes.find((n) => n.id === "adr/0001-x")).not.toHaveProperty("title");
  });

  test("edges carry the resolved target or a dangling marker, in deterministic graph order", () => {
    writeStandardBundle();
    const { edges } = buildGraphExport(graph());
    expect(edges).toEqual([
      { from: "adr/0001-x", to: null, kind: "link", target: "./missing.md", dangling: true },
      { from: "stories/bulk", to: "specs/archive", kind: "specs", target: "../specs/archive.md", dangling: false },
      { from: "stories/bulk", to: "reference/orders", kind: "link", target: "../reference/orders.md", dangling: false },
    ]);
  });

  test("an empty/whitespace title is omitted; a YAML-coerced non-string title is coerced", () => {
    writeDoc("blank.md", '---\ntype: Story\ntitle: "   "\n---\nText.\n'); // whitespace-only
    writeDoc("num.md", "---\ntype: Widget\ntitle: 2024\n---\nText.\n"); // unknown type → unquoted number survives
    const nodes = buildGraphExport(graph()).nodes;
    expect(nodes.find((n) => n.id === "blank")).not.toHaveProperty("title");
    expect(nodes.find((n) => n.id === "num")?.title).toBe("2024");
  });

  test("an include id that names no concept is ignored, not an error", () => {
    writeStandardBundle();
    const { nodes } = buildGraphExport(graph(), { include: new Set(["reference/orders", "ghost/x"]) });
    expect(nodes.map((n) => n.id)).toEqual(["reference/orders"]);
  });

  test("the total token estimate is the sum over the included nodes", () => {
    writeStandardBundle();
    const data = buildGraphExport(graph());
    const sum = data.nodes.reduce((acc, n) => acc + n.tokenEstimate, 0);
    expect(data.tokenEstimate).toBe(sum);
    expect(data.root).toBeUndefined();
    expect(data.depth).toBeUndefined();
  });
});

describe("buildGraphExport — subgraph shaping", () => {
  test("narrows nodes to the include set and records root/depth", () => {
    writeStandardBundle();
    const include = subgraph(graph(), "reference/orders", 1);
    const data = buildGraphExport(graph(), { include, root: "reference/orders", depth: 1 });
    expect(data.nodes.map((n) => n.id)).toEqual(["reference/orders", "stories/bulk"]);
    expect(data.root).toBe("reference/orders");
    expect(data.depth).toBe(1);
  });

  test("drops edges that leave the subgraph but keeps internal and dangling ones", () => {
    writeStandardBundle();
    const include = subgraph(graph(), "reference/orders", 1); // {orders, bulk}
    const { edges } = buildGraphExport(graph(), { include });
    // The bulk→orders link is internal (kept); the bulk→archive specs edge leaves the set (dropped).
    expect(edges).toEqual([
      { from: "stories/bulk", to: "reference/orders", kind: "link", target: "../reference/orders.md", dangling: false },
    ]);
  });
});

describe("toDot — Graphviz serialization", () => {
  test("emits a digraph with labeled nodes (title or id) and resolved edges, omitting dangling", () => {
    writeStandardBundle();
    const dot = toDot(buildGraphExport(graph()));
    expect(dot.startsWith("digraph lore {")).toBe(true);
    expect(dot.endsWith("}")).toBe(true);
    expect(dot).toContain('"reference/orders" [label="Orders"];'); // title label
    expect(dot).toContain('"adr/0001-x" [label="adr/0001-x"];'); // id label (no title)
    expect(dot).toContain('"stories/bulk" -> "reference/orders" [label="link"];');
    expect(dot).not.toContain("missing"); // dangling edge omitted
  });

  test("escapes quotes and backslashes in labels", () => {
    writeDoc("weird.md", '---\ntype: Story\ntitle: a"b\\c\n---\nText.\n');
    const dot = toDot(buildGraphExport(graph()));
    expect(dot).toContain('[label="a\\"b\\\\c"];');
  });
});

// ── command: runGraph ────────────────────────────────────────────────────────────

describe("lore graph — command", () => {
  test("whole-bundle JSON export exits 0 with the graph.export envelope", () => {
    writeStandardBundle();
    const { code, data } = exportGraph([]);
    expect(code).toBe(0);
    expect(data.nodes).toHaveLength(4);
    expect(data.edges).toHaveLength(3);
  });

  test("a root id with --depth produces a subgraph carrying root and depth", () => {
    writeStandardBundle();
    const { data } = exportGraph(["reference/orders", "--depth", "1"]);
    expect(data.nodes.map((n) => n.id)).toEqual(["reference/orders", "stories/bulk"]);
    expect(data).toMatchObject({ root: "reference/orders", depth: 1 });
  });

  test("a path/.md-form root id is normalized like rename/supersede", () => {
    writeStandardBundle();
    // `reference/orders.md` and `./reference/orders` must resolve to the bundle key.
    expect(exportGraph(["reference/orders.md", "--depth", "0"]).data.root).toBe("reference/orders");
    expect(exportGraph(["./reference/orders", "--depth", "0"]).data.root).toBe("reference/orders");
  });

  test("plain mode lists nodes and edges with a header", () => {
    writeStandardBundle();
    const stdout = capture();
    runGraph({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: [] });
    const text = stdout.text();
    expect(text).toContain("4 concepts, 3 edges, ~");
    expect(text).toContain("reference/orders  [Reference]  ~");
    expect(text).toContain("adr/0001-x -link-> (dangling: ./missing.md)");
  });

  test("--dot renders DOT text in plain mode", () => {
    writeStandardBundle();
    const stdout = capture();
    runGraph({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["--dot"] });
    expect(stdout.text().startsWith("digraph lore {")).toBe(true);
  });

  test("--dot combined with --json is a usage error (DOT has no envelope)", () => {
    writeStandardBundle();
    const err = expectError("usage", () =>
      runGraph({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["--dot"] }),
    );
    expect(err.message).toContain("--dot cannot be combined with --json");
  });

  test("an unknown root id surfaces as a not_found error", () => {
    writeStandardBundle();
    expectError("not_found", () =>
      runGraph({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args: ["nope/x"] }),
    );
  });

  test.each([
    [["--bogus"], "unknown option"],
    [["--dot", "--dot"], "--dot given more than once"],
    [["--dot=x"], "--dot takes no value"],
    [["--depth", "1.5"], 'invalid --depth "1.5"'],
    [["--depth=-1"], 'invalid --depth "-1"'],
    [["--depth", "-1"], "--depth needs a value"],
    [["--depth", "1", "--depth", "2"], "--depth given more than once"],
    [["reference/orders", "--depth", "99999999999999999999"], "too large"],
    [["--depth", "2"], "--depth needs a root <id>"],
    [["-x"], 'unknown option "-x"'],
    [["a", "b"], 'unexpected argument "b"'],
  ])("rejects %j with a usage error", (args, fragment) => {
    writeStandardBundle();
    const err = expectError("usage", () =>
      runGraph({ root, output: JSON_CTX, stdout: capture(), stderr: capture(), args }),
    );
    expect(`${err.message} ${err.hint ?? ""}`).toContain(fragment);
  });

  test("`--` ends option parsing so a following token is the root id", () => {
    writeStandardBundle();
    const { data } = exportGraph(["--", "reference/orders"]);
    expect(data.root).toBe("reference/orders");
  });
});

// ── router: cli dispatch ─────────────────────────────────────────────────────────

describe("cli — graph dispatch", () => {
  test("`lore graph --json` routes to runGraph and emits the envelope", () => {
    writeStandardBundle();
    const stdout = capture();
    const code = run(["bun", "cli", "graph", "--json"], { stdout, stderr: capture(), cwd: root, isTTY: false });
    expect(code).toBe(0);
    expect(JSON.parse(stdout.text()).kind).toBe("graph.export");
  });

  test("`lore graph <missing>` exits 3 (not found)", () => {
    writeStandardBundle();
    const code = run(["bun", "cli", "graph", "nope/x"], {
      stdout: capture(),
      stderr: capture(),
      cwd: root,
      isTTY: false,
    });
    expect(code).toBe(3);
  });
});
