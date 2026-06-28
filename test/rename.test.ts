import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { type RenameReport, runRename } from "../src/commands/rename";
import { loadBundle } from "../src/core/bundle";
import { type RewritePlan, rewriteInbound } from "../src/core/rewrite";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-rename-"));
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

/** Read a bundle file under `docs/`. */
function readDoc(rel: string): string {
  return readFileSync(join(root, "docs", rel), "utf8");
}

/** Load the `docs/` bundle written so far into a graph. */
function graph() {
  return loadBundle(join(root, "docs"));
}

/** The plan's writes as a `bundle-path → bytes` map, for terse assertions. */
function writesByPath(plan: RewritePlan): Map<string, string> {
  return new Map(plan.writes.map((w) => [w.path, w.bytes]));
}

// ── core: rewriteInbound — inbound references ─────────────────────────────────────

describe("rewriteInbound — inbound links and refs (move)", () => {
  test("repoints an inbound body link and preserves its #fragment", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nUses [orders](../reference/orders.md#Archival).\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const writes = writesByPath(plan);
    expect(writes.get("stories/bulk.md")).toContain("[orders](../reference/sales-orders.md#Archival)");
  });

  test("repoints a used reference definition but leaves an orphan definition alone", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc(
      "stories/bulk.md",
      "---\ntype: Story\n---\nSee [it][o].\n\n[o]: ../reference/orders.md\n[dead]: ../reference/orders.md\n",
    );
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("[o]: ../reference/sales-orders.md");
    expect(body).toContain("[dead]: ../reference/orders.md"); // orphan (unused) definition untouched
  });

  test("rewrites a frontmatter ref (any kind) to the bare-id new form", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\nspecs:\n  - ../reference/orders.md\n---\nText.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("- reference/sales-orders");
    expect(body).not.toContain("orders.md");
  });

  test("a bare-id frontmatter ref is rewritten too, and a non-matching sibling item is verbatim", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/other.md", "---\ntype: Reference\n---\nOther.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\nspecs:\n  - reference/orders\n  - reference/other\n---\nText.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("- reference/sales-orders");
    expect(body).toContain("- reference/other"); // untouched
  });

  test("does not rewrite a link whose case does not match the target (it dangles)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nWrong case [x](../reference/Orders.md).\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    // bulk.md has no edge to reference/orders (case mismatch dangles), so it is not written at all.
    expect(writesByPath(plan).has("stories/bulk.md")).toBe(false);
  });

  test("leaves external and non-.md destinations alone", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc(
      "stories/bulk.md",
      "---\ntype: Story\n---\n[ext](https://x.example/orders.md) [img](../reference/pic.png) [ok](../reference/orders.md)\n",
    );
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("[ext](https://x.example/orders.md)"); // external untouched
    expect(body).toContain("[img](../reference/pic.png)"); // non-.md untouched
    expect(body).toContain("[ok](../reference/sales-orders.md)"); // the real edge repointed
  });
});

// ── core: rewriteInbound — the moved file's own links ─────────────────────────────

describe("rewriteInbound — the moved file's outbound links (move)", () => {
  test("recomputes a cross-directory outbound link and retargets a self-link", () => {
    writeDoc(
      "reference/orders.md",
      "---\ntype: Reference\n---\nSee [bulk](../stories/bulk.md) and self [me](orders.md).\n",
    );
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nBulk.\n");
    // move into a deeper directory so the relative path to bulk.md must change
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales/orders", { move: true });
    const moved = writesByPath(plan).get("reference/sales/orders.md") ?? "";
    expect(moved).toContain("[bulk](../../stories/bulk.md)"); // was ../stories, now ../../stories
    expect(moved).toContain("[me](orders.md)"); // self-link follows: ../sales/orders relative to itself => orders.md
  });

  test("recomputes a dangling outbound link by pure path arithmetic", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nDangles to [gone](./missing.md).\n");
    const plan = rewriteInbound(graph(), "reference/orders", "stories/orders", { move: true });
    const moved = writesByPath(plan).get("stories/orders.md") ?? "";
    // missing.md was reference/missing.md; from stories/ it is ../reference/missing.md
    expect(moved).toContain("[gone](../reference/missing.md)");
  });

  test("a same-directory rename leaves an already-canonical outbound link unchanged (no churn)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nSee [bulk](../stories/bulk.md).\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nBulk.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const moved = writesByPath(plan).get("reference/sales-orders.md") ?? "";
    expect(moved).toContain("See [bulk](../stories/bulk.md).");
  });
});

// ── core: surgical splice fidelity (node.url ≠ source bytes) ───────────────────────

describe("rewriteInbound — splice fidelity", () => {
  test("rewrites an angle-bracket destination to the canonical encoded form", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nLink [x](<../reference/orders.md>).\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("[x](../reference/sales-orders.md)"); // angle wrapper dropped
  });

  test("locates a destination with escaped parens (node.url is decoded, source is not)", () => {
    writeDoc("reference/a(b).md", "---\ntype: Reference\n---\nWeird name.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nLink [x](../reference/a\\(b\\).md).\n");
    const plan = rewriteInbound(graph(), "reference/a(b)", "reference/c", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("[x](../reference/c.md)");
  });

  test("preserves a link title after the rewritten destination", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", `---\ntype: Story\n---\nLink [x](../reference/orders.md "the title").\n`);
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain(`[x](../reference/sales-orders.md "the title")`);
  });

  test("ignores a link inside a code span and rewrites two real links on one line right-to-left", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc(
      "stories/bulk.md",
      "---\ntype: Story\n---\nCode `[x](../reference/orders.md)` then [a](../reference/orders.md) and [b](../reference/orders.md).\n",
    );
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("Code `[x](../reference/orders.md)`"); // code span untouched
    expect(body).toContain("[a](../reference/sales-orders.md) and [b](../reference/sales-orders.md).");
  });

  test("rewrites an empty-label link and a linked-image's outer destination only", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc(
      "stories/bulk.md",
      "---\ntype: Story\n---\nEmpty [](../reference/orders.md) and image [![alt](pic.png)](../reference/orders.md).\n",
    );
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("[](../reference/sales-orders.md)");
    expect(body).toContain("[![alt](pic.png)](../reference/sales-orders.md)"); // inner image untouched
  });

  test("authored prose outside the destination is byte-for-byte unchanged (AC#3)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const original =
      "---\ntype: Story\n---\n# Heading\n\nA *careful*  paragraph with  double  spaces and a [link](../reference/orders.md) inline.\n\n- list\n- items\n";
    writeDoc("stories/bulk.md", original);
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toBe(original.replace("../reference/orders.md", "../reference/sales-orders.md"));
  });
});

// ── core: rewriteInbound — modes and errors ───────────────────────────────────────

describe("rewriteInbound — modes and validation", () => {
  test("with no inbound references, only the moved file is planned and rename is set", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nLonely.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    expect(plan.rename).toEqual({ from: "reference/orders.md", to: "reference/sales-orders.md" });
    expect(plan.writes.map((w) => w.path)).toEqual(["reference/sales-orders.md"]);
  });

  test("move=false repoints inbound references without relocating (the supersede engine)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/orders-v2.md", "---\ntype: Reference\n---\nNewer.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nUses [orders](../reference/orders.md).\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/orders-v2", { move: false });
    expect(plan.rename).toBeNull();
    const writes = writesByPath(plan);
    expect(writes.get("stories/bulk.md")).toContain("[orders](../reference/orders-v2.md)");
    expect(writes.has("reference/orders.md")).toBe(false); // the superseded file is not moved/rewritten
  });

  test("throws not_found when the old id is not a concept", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    expect(() => rewriteInbound(graph(), "reference/ghost", "reference/x", { move: true })).toThrow(LoreError);
    try {
      rewriteInbound(graph(), "reference/ghost", "reference/x", { move: true });
    } catch (err) {
      expect((err as LoreError).type).toBe("not_found");
    }
  });

  test("throws conflict when the new id already exists (move)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/sales.md", "---\ntype: Reference\n---\nTaken.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "reference/sales", { move: true });
      throw new Error("expected a conflict");
    } catch (err) {
      expect((err as LoreError).type).toBe("conflict");
    }
  });
});

// ── command: runRename ────────────────────────────────────────────────────────────

/** Run `rename` in JSON mode and return the parsed `data` payload plus the exit code. */
function renameCmd(args: string[]): { code: number; report: RenameReport } {
  const stdout = capture();
  const code = runRename({ root, output: JSON_CTX, args, stdout, stderr: capture() });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };
  expect(envelope.kind).toBe("rename.result");
  return { code, report: envelope.data };
}

/** Run `rename` expecting a thrown {@link LoreError}, returned for assertions. */
function expectError(args: string[]): LoreError {
  try {
    runRename({ root, output: JSON_CTX, args, stdout: capture(), stderr: capture() });
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runRename returned");
}

describe("lore rename — end to end", () => {
  test("moves the file, deletes the old path, repoints inbound links, regenerates the hub", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntitle: Orders\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nUses [orders](../reference/orders.md#Frag).\n");
    writeDoc(
      "reference/index.md",
      "# reference\n\n<!-- lore:index:begin -->\n- [Orders](orders.md)\n<!-- lore:index:end -->\n",
    );

    const { code, report } = renameCmd(["reference/orders", "reference/sales-orders"]);
    expect(code).toBe(EXIT_OK);
    expect(report.from).toBe("docs/reference/orders.md");
    expect(report.to).toBe("docs/reference/sales-orders.md");

    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(false);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
    expect(readDoc("stories/bulk.md")).toContain("[orders](../reference/sales-orders.md#Frag)");
    expect(readDoc("reference/index.md")).toContain("[Orders](sales-orders.md)");
  });

  test("--dry-run reports the plan but writes nothing", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\n[orders](../reference/orders.md)\n");
    const { report } = renameCmd(["reference/orders", "reference/sales-orders", "--dry-run"]);
    expect(report.dryRun).toBe(true);
    expect(report.filesChanged).toBeGreaterThan(0);
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // not moved
    expect(readDoc("stories/bulk.md")).toContain("[orders](../reference/orders.md)"); // not rewritten
  });

  test("an unrelated, already-canonical index hub is not rewritten", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntitle: Orders\n---\nOrders.\n");
    writeDoc("stories/tale.md", "---\ntype: Story\ntitle: Tale\n---\nTale.\n");
    const storiesIndex = "# stories\n\n<!-- lore:index:begin -->\n- [Tale](tale.md)\n<!-- lore:index:end -->\n";
    writeDoc("stories/index.md", storiesIndex);
    const { report } = renameCmd(["reference/orders", "reference/sales-orders"]);
    expect(report.files.map((f) => f.path)).not.toContain("docs/stories/index.md");
    expect(readDoc("stories/index.md")).toBe(storiesIndex); // byte-identical
  });

  test("plain mode renders a relocation line, per-file updates, and a summary", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\n[orders](../reference/orders.md)\n");
    const stdout = capture();
    runRename({
      root,
      output: { mode: "plain", color: false },
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
    });
    const text = stdout.text();
    expect(text).toContain("renamed docs/reference/orders.md -> docs/reference/sales-orders.md");
    expect(text).toContain("updated docs/stories/bulk.md");
    expect(text).toMatch(/\d+ files? changed/);
  });

  test("pretty (color) mode renders the same diff-stable report body", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nLonely.\n");
    const stdout = capture();
    runRename({
      root,
      output: { mode: "pretty", color: true },
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
    });
    expect(stdout.text()).toContain("renamed docs/reference/orders.md -> docs/reference/sales-orders.md");
    expect(stdout.text()).toMatch(/\d+ files? changed/);
  });
});

describe("lore rename — errors and arg parsing", () => {
  test("a missing new id is a usage error", () => {
    expect(expectError(["only-old"]).type).toBe("usage");
  });

  test("a third positional is a usage error", () => {
    expect(expectError(["a", "b", "c"]).type).toBe("usage");
  });

  test("a single-dash unknown flag is a usage error", () => {
    expect(expectError(["a", "b", "-x"]).type).toBe("usage");
  });

  test("an unknown flag is a usage error", () => {
    expect(expectError(["a", "b", "--bogus"]).type).toBe("usage");
  });

  test("renaming an id to itself is a usage error", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    expect(expectError(["reference/orders", "reference/orders.md"]).type).toBe("usage"); // .md stripped → same id
  });

  test("an absent old id surfaces not_found (exit 3) through the command", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const err = expectError(["reference/ghost", "reference/x"]);
    expect(err.type).toBe("not_found");
  });

  test("an existing new id surfaces conflict (exit 5) through the command", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/sales.md", "---\ntype: Reference\n---\nTaken.\n");
    expect(expectError(["reference/orders", "reference/sales"]).type).toBe("conflict");
  });

  test("accepts a -- options terminator before the ids", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const { code } = renameCmd(["--", "reference/orders", "reference/sales-orders"]);
    expect(code).toBe(EXIT_OK);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
  });
});

describe("lore rename — router integration", () => {
  test("`lore rename` is dispatched and relocates through the router", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const code = run(["bun", "lore", "rename", "reference/orders", "reference/sales-orders", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_OK);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
  });

  test("a not_found surfaces exit 3 through the router", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const code = run(["bun", "lore", "rename", "reference/ghost", "reference/x", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_CODES.not_found);
  });
});
