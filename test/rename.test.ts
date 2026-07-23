import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
// A namespace import alongside the named one below: `spyOn` (LORE-132's TOCTOU-race regression test)
// needs the module object itself to patch `writeFileSync` in place, not the already-bound named export
// (mirrors replace.test.ts's identical LORE-116 commit-phase-atomicity test).
import * as fs from "node:fs";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogTaskDetail } from "../src/adapters/backlog";
import { run } from "../src/cli";
import { type RenameReport, runRename } from "../src/commands/rename";
import { loadBundle } from "../src/core/bundle";
import { INDEX_BLOCK_BEGIN, INDEX_BLOCK_END } from "../src/core/indexes";
import { compileProfile, type Profile, parseProfile } from "../src/core/profile";
import { type RewritePlan, rewriteInbound } from "../src/core/rewrite";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, cleanGitSpawn, dirtyGitSpawn, failingCommitGitSpawn, fakeAdapter, makeTask } from "./helpers";

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

/** Load the `docs/` bundle written so far into a graph, optionally against a custom `profile` (LORE-88). */
function graph(profile?: Profile) {
  return loadBundle(join(root, "docs"), { profile });
}

/** A custom profile redefining the built-in Story type's `tasks` field as a scalar string, not a list (LORE-88). */
function customStoryScalarTasksProfile(): Profile {
  return compileProfile(
    parseProfile(
      {
        profile: { name: "custom", okf_version: "0.1" },
        base: { fields: { type: { required: true } } },
        types: [{ name: "Story", fields: { tasks: { kind: "string" } } }],
      },
      "test-profile",
    ),
  );
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

  test("repoints a reference definition whose label contains an escaped bracket (LORE-87)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    // The label `a\]x:y` decodes to identifier `a]x:y` — a naive indexOf("]", ...) scan for the
    // label's closing bracket would match the escaped `\]` instead of the real one, and then find
    // the wrong `:` too (the one inside "x:y"), corrupting the located destination range.
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nSee [it][a\\]x:y].\n\n[a\\]x:y]: ../reference/orders.md\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("[a\\]x:y]: ../reference/sales-orders.md");
    expect(body).not.toContain("]: ../reference/orders.md"); // the old destination must not linger
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

  test("rewrites a '/'-absolute inbound link to the renamed concept, not skipping it as if it dangled (LORE-180)", () => {
    writeDoc("target.md", "---\ntype: Reference\n---\nTarget.\n");
    // A decoy that happens to sit exactly at the naive `posix.join(dir, decoded)` path a
    // leading-slash-blind resolver would (wrongly) compute for the `/target.md` link below.
    writeDoc("sub/target.md", "---\ntype: Reference\n---\nDecoy at the dir-joined path.\n");
    writeDoc("sub/inbound.md", "---\ntype: Story\n---\nAbsolute [abs](/target.md) and relative [rel](target.md).\n");
    const plan = rewriteInbound(graph(), "target", "renamed-target", { move: true });
    const body = writesByPath(plan).get("sub/inbound.md") ?? "";
    // Resolves against the bundle root (leading `/` stripped) — the true target — and is rewritten.
    expect(body).toContain("[abs](../renamed-target.md)");
    // The relative link still names the untouched decoy.
    expect(body).toContain("[rel](target.md)");
  });

  test("a decoy concept at the dir-joined path cannot hijack a '/'-absolute link meant for the bundle root (LORE-180)", () => {
    writeDoc("target.md", "---\ntype: Reference\n---\nTarget.\n");
    writeDoc("sub/target.md", "---\ntype: Reference\n---\nDecoy at the dir-joined path.\n");
    writeDoc("sub/inbound.md", "---\ntype: Story\n---\nAbsolute [abs](/target.md) and relative [rel](target.md).\n");
    // Rename the decoy, not the true target. sub/inbound.md is genuinely affected (its relative
    // [rel] link is a real edge to the decoy), so its body is rewritten — but the classifier must
    // still tell the two links apart per-link, not conflate them by dir-joined string equality.
    const plan = rewriteInbound(graph(), "sub/target", "sub/renamed-decoy", { move: true });
    const body = writesByPath(plan).get("sub/inbound.md") ?? "";
    // The '/'-absolute link truly resolves to the ROOT "target" concept — untouched by this rename.
    expect(body).toContain("[abs](/target.md)");
    // The genuine relative edge to the decoy is correctly repointed.
    expect(body).toContain("[rel](renamed-decoy.md)");
  });

  test("a bare-id frontmatter ref is repointed to the renamed true target, not a mirroring-directory shadow (LORE-184)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n"); // the true target
    // A shadow that sits exactly at the dir-joined path a path-first resolver would (wrongly)
    // compute for the bare ref "reference/orders" authored from "stories/" (e.g. an archive/
    // tree mirroring the live one one directory down).
    writeDoc("stories/reference/orders.md", "---\ntype: Reference\n---\nShadow at the dir-joined path.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\nspecs:\n  - reference/orders\n---\nText.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    // The bare ref names the bundle-root concept, not the shadow — it is repointed.
    expect(body).toContain("- reference/sales-orders");
    expect(body).not.toContain("stories/reference/orders");
    // The shadow itself is untouched — it was never part of this rename.
    expect(writesByPath(plan).has("stories/reference/orders.md")).toBe(false);
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

  test("recomputes a '/'-absolute outbound link against the bundle root, not the file's old directory (LORE-180)", () => {
    writeDoc("target.md", "---\ntype: Reference\n---\nTarget.\n");
    writeDoc("sub/mover.md", "---\ntype: Story\n---\nRoot-absolute [abs](/target.md).\n");
    const plan = rewriteInbound(graph(), "sub/mover", "moved/mover", { move: true });
    const moved = writesByPath(plan).get("moved/mover.md") ?? "";
    // /target.md always names the bundle-root "target" concept, regardless of the file's own
    // old ("sub/") or new ("moved/") directory — so from moved/, it is one hop up: ../target.md.
    // A leading-slash-blind path-join would instead compute this as if `target.md` sat inside the
    // file's OLD "sub/" directory (mis-resolving to a nonexistent "sub/target.md").
    expect(moved).toContain("[abs](../target.md)");
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

  // LORE-68: a link that escapes the bundle root (e.g. a Story's managed task block linking
  // `backlog/tasks/…`, which lives one hop outside `docs/`) was silently truncated by one `../`
  // segment on every move, because the recompute resolved it in the bundle-relative coordinate
  // space instead of normalizeLink's required repo-relative one — the two only coincide for a
  // link that stays inside the bundle.
  test("an already-canonical outbound link escaping the bundle root is not truncated by a same-directory rename", () => {
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nLinks a task file [t](../../backlog/tasks/task-1.md).\n");
    const plan = rewriteInbound(graph(), "stories/bulk", "stories/bulk-renamed", { move: true });
    const moved = writesByPath(plan).get("stories/bulk-renamed.md") ?? "";
    expect(moved).toContain("[t](../../backlog/tasks/task-1.md)");
  });

  test("an outbound link escaping the bundle root gains a segment on a depth-changing move", () => {
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nLinks a task file [t](../../backlog/tasks/task-1.md).\n");
    const plan = rewriteInbound(graph(), "stories/bulk", "stories/nested/bulk", { move: true });
    const moved = writesByPath(plan).get("stories/nested/bulk.md") ?? "";
    expect(moved).toContain("[t](../../../backlog/tasks/task-1.md)");
  });

  test("renaming the referring file does not canonicalize its bare-id ref to a mirroring-directory shadow's id (LORE-184 consequence (c))", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n"); // the true target
    writeDoc("stories/reference/orders.md", "---\ntype: Reference\n---\nShadow at the dir-joined path.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\nspecs:\n  - reference/orders\n---\nText.\n");
    // Rename the REFERRING file itself; its own refs are canonicalized via the isMoved branch.
    const plan = rewriteInbound(graph(), "stories/bulk", "stories/bulk-renamed", { move: true });
    const moved = writesByPath(plan).get("stories/bulk-renamed.md") ?? "";
    expect(moved).toContain("- reference/orders"); // stays the canonical bare id
    expect(moved).not.toContain("stories/reference/orders"); // NOT corrupted to the shadow's id
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

  test("preserves a ?query suffix from the source bytes", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nLink [x](../reference/orders.md?v=2).\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    expect(writesByPath(plan).get("stories/bulk.md")).toContain("[x](../reference/sales-orders.md?v=2)");
  });
});

// ── core: the moved file's frontmatter and orphan definitions (review fixes) ───────

describe("rewriteInbound — moved-file outbound references (review fixes)", () => {
  test("canonicalizes a path-form frontmatter ref to another concept into a bare id (#8)", () => {
    writeDoc("adr/0009-x.md", "---\ntype: Reference\n---\nADR.\n");
    writeDoc("reference/orders.md", "---\ntype: Reference\nspecs:\n  - ../adr/0009-x.md\n---\nText.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "deep/nested/orders", { move: true });
    const moved = writesByPath(plan).get("deep/nested/orders.md") ?? "";
    expect(moved).toContain("- adr/0009-x"); // bare id survives the move regardless of depth
    expect(moved).not.toContain("0009-x.md");
  });

  test("recomputes the moved file's orphan (unused) reference definition (#12)", () => {
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nBulk.\n");
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nText.\n\n[orphan]: ../stories/bulk.md\n");
    const plan = rewriteInbound(graph(), "reference/orders", "deep/nested/orders", { move: true });
    const moved = writesByPath(plan).get("deep/nested/orders.md") ?? "";
    expect(moved).toContain("[orphan]: ../../stories/bulk.md"); // recomputed for the deeper location
  });

  test("rewrites a scalar (non-list) frontmatter ref pointing at the renamed concept", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    // An unknown type leaves fields unconstrained, so a single scalar `supersedes` is accepted —
    // the bundle still counts it as an inbound edge, so rename must repoint it.
    writeDoc("stories/heir.md", "---\ntype: Custom\nsupersedes: ../reference/orders.md\n---\nHeir.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true });
    expect(writesByPath(plan).get("stories/heir.md")).toContain("supersedes: reference/sales-orders");
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

  test("rewriteFrontmatterRefs=false repoints body links but leaves frontmatter refs intact (supersede)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/orders-v2.md", "---\ntype: Reference\n---\nNewer.\n");
    writeDoc(
      "stories/bulk.md",
      "---\ntype: Story\nspecs:\n  - ../reference/orders.md\n---\nUses [orders](../reference/orders.md).\n",
    );
    const plan = rewriteInbound(graph(), "reference/orders", "reference/orders-v2", {
      move: false,
      rewriteFrontmatterRefs: false,
    });
    const body = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(body).toContain("[orders](../reference/orders-v2.md)"); // body link repointed
    expect(body).toContain("- ../reference/orders.md"); // frontmatter ref preserved (history, not a dead pointer)
  });

  test("exclude skips the listed ids entirely — they are neither rewritten nor planned", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/orders-v2.md", "---\ntype: Reference\n---\nNewer.\n");
    // both bulk.md and the excluded heir.md link to orders; only bulk.md should be planned
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\n[orders](../reference/orders.md)\n");
    writeDoc("stories/heir.md", "---\ntype: Story\n---\n[orders](../reference/orders.md)\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/orders-v2", {
      move: false,
      exclude: new Set(["stories/heir"]),
    });
    const paths = plan.writes.map((w) => w.path);
    expect(paths).toContain("stories/bulk.md");
    expect(paths).not.toContain("stories/heir.md"); // excluded — engine never touches it
  });

  test("move=true with the move source itself excluded reports no rename (LORE-164)", () => {
    // Excluding `from` skips it before it ever reaches `writes` (the exclude contract), so `rename`
    // must not claim a move whose destination bytes were never planned — the two stay consistent.
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", {
      move: true,
      exclude: new Set(["reference/orders"]),
    });
    expect(plan.rename).toBeNull();
    expect(plan.writes).toEqual([]);
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

  test("rejects a toId that traverses outside the docs/ bundle root (LORE-80)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "../pwned", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects an absolute toId (LORE-80)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "/etc/pwned", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects a backslash-spelled relative toId traversal (LORE-80 review fix)", () => {
    // posix.normalize treats `\` as an ordinary character (not a separator) and win32.isAbsolute
    // rejects only an absolute form, so `..\pwned` trips neither of the earlier, incomplete
    // checks — yet a real Windows binary's path.join treats `\` as a separator, making this
    // exactly as real an escape as `../pwned`.
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "..\\pwned", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects a mixed-separator traversal that nets outside the bundle root (LORE-80 review fix)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "sub/..\\..\\pwned", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("does not reject a real segment that merely starts with '..' (no false positive)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "..foo/bar", { move: true });
    expect(plan.rename).toEqual({ from: "reference/orders.md", to: "..foo/bar.md" });
  });

  test("rejects a fromId that traverses outside the docs/ bundle root (LORE-80)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "../../etc/passwd", "reference/sales", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects a Windows drive-relative toId (LORE-95)", () => {
    // "C:foo" is real Windows syntax for "relative to drive C's current directory" — distinct from
    // the absolute "C:\foo" form LORE-72 already covers. win32.isAbsolute("C:foo") is false, and
    // no earlier check in assertConfinedToBundle catches this shape.
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "C:pwned", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects a Windows drive-relative fromId (LORE-95)", () => {
    try {
      rewriteInbound(graph(), "C:pwned", "reference/sales", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects a self-cancelling fromId, applied symmetrically via the shared guard (LORE-95)", () => {
    // assertConfinedToBundle checks both fromId and toId identically — confirms resolvesToRoot
    // isn't wired to toId alone. A `not_found` here (the id just doesn't resolve to a real concept)
    // would NOT prove this; the validation type specifically proves the confinement guard fired
    // before any concept lookup happened.
    try {
      rewriteInbound(graph(), "sub/..", "reference/sales", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects an empty toId, which would otherwise silently resolve to the bundle root (LORE-95)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("rejects a self-cancelling toId that nets to the bundle root (LORE-95)", () => {
    // "sub/.." never climbs ABOVE the start (escapesRoot's own concern) — it cancels to nothing,
    // which idFromPath's posix.normalize folds to ".", producing the literal toPath "..md".
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    try {
      rewriteInbound(graph(), "reference/orders", "sub/..", { move: true });
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
    }
  });

  test("does not reject a toId that legitimately cancels through a real intermediate directory (no false positive, LORE-95)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const plan = rewriteInbound(graph(), "reference/orders", "sub/../reference/sales-orders", { move: true });
    expect(plan.rename).toEqual({ from: "reference/orders.md", to: "reference/sales-orders.md" });
  });
});

describe("rewriteInbound — custom profile (LORE-88)", () => {
  test("without a profile, rewriting an inbound concept shaped only by a custom profile throws (repro)", () => {
    // reference/orders is renamed; stories/bulk links to it (an inbound edge, so rewriteInbound
    // re-serializes stories/bulk too) and declares `tasks: T-1` as a bare scalar — invalid under the
    // BUILT-IN default Story schema (tasks is a list there), valid ONLY under the custom profile
    // this describe block's other tests pass explicitly. Loading the graph itself already needs the
    // custom profile (a plain loadBundle() with no profile would fail before rewriteInbound even
    // runs), so this test loads the graph correctly but calls rewriteInbound with NO profile — the
    // exact LORE-88 gap: the read side is profile-aware (LORE-84), the internal serialize is not.
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\ntasks: T-1\n---\nUses [orders](../reference/orders.md).\n");
    const profile = customStoryScalarTasksProfile();
    const g = graph(profile); // the read side already honors the custom profile (LORE-84)

    try {
      rewriteInbound(g, "reference/orders", "reference/sales-orders", { move: true }); // no profile passed
      throw new Error("expected a validation error");
    } catch (err) {
      expect((err as LoreError).type).toBe("validation");
      expect((err as LoreError).message).toContain("tasks");
    }
  });

  test("with the profile forwarded, the identical rewrite succeeds and preserves the custom field shape (AC#1/AC#3)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\ntasks: T-1\n---\nUses [orders](../reference/orders.md).\n");
    const profile = customStoryScalarTasksProfile();
    const g = graph(profile);

    const plan = rewriteInbound(g, "reference/orders", "reference/sales-orders", { move: true, profile });
    const bulk = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(bulk).toContain("[orders](../reference/sales-orders.md)"); // the inbound link WAS repointed
    expect(bulk).toContain("tasks: T-1"); // the custom scalar shape survived re-serialize, not coerced/dropped
  });

  test("move=false (lore supersede's engine) honors the profile too (AC#2)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/orders-v2.md", "---\ntype: Reference\n---\nNewer.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\ntasks: T-1\n---\nUses [orders](../reference/orders.md).\n");
    const profile = customStoryScalarTasksProfile();
    const g = graph(profile);

    const plan = rewriteInbound(g, "reference/orders", "reference/orders-v2", { move: false, profile });
    const bulk = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(bulk).toContain("[orders](../reference/orders-v2.md)");
    expect(bulk).toContain("tasks: T-1");
  });

  test("a bundle with no custom profile sees no change in rewriteInbound's behavior (AC#5, no regression)", () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nUses [orders](../reference/orders.md).\n");
    const plan = rewriteInbound(graph(), "reference/orders", "reference/sales-orders", { move: true }); // no profile option at all
    const bulk = writesByPath(plan).get("stories/bulk.md") ?? "";
    expect(bulk).toContain("[orders](../reference/sales-orders.md)");
  });
});

// ── command: runRename ────────────────────────────────────────────────────────────

/** Run `rename` in JSON mode and return the parsed `data` payload plus the exit code. */
async function renameCmd(args: string[]): Promise<{ code: number; report: RenameReport }> {
  const stdout = capture();
  const code = await runRename({ root, output: JSON_CTX, args, stdout, stderr: capture() });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };
  expect(envelope.kind).toBe("rename.result");
  return { code, report: envelope.data };
}

/** Run `rename` expecting a thrown {@link LoreError}, returned for assertions. */
async function expectError(args: string[]): Promise<LoreError> {
  try {
    await runRename({ root, output: JSON_CTX, args, stdout: capture(), stderr: capture() });
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runRename returned");
}

describe("lore rename — end to end", () => {
  test("moves the file, deletes the old path, repoints inbound links, regenerates the hub", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntitle: Orders\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\nUses [orders](../reference/orders.md#Frag).\n");
    writeDoc(
      "reference/index.md",
      "# reference\n\n<!-- lore:index:begin -->\n- [Orders](orders.md)\n<!-- lore:index:end -->\n",
    );

    const { code, report } = await renameCmd(["reference/orders", "reference/sales-orders"]);
    expect(code).toBe(EXIT_OK);
    expect(report.from).toBe("docs/reference/orders.md");
    expect(report.to).toBe("docs/reference/sales-orders.md");

    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(false);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
    expect(readDoc("stories/bulk.md")).toContain("[orders](../reference/sales-orders.md#Frag)");
    expect(readDoc("reference/index.md")).toContain("[Orders](sales-orders.md)");
  });

  test("--dry-run reports the plan but writes nothing", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\n[orders](../reference/orders.md)\n");
    const { report } = await renameCmd(["reference/orders", "reference/sales-orders", "--dry-run"]);
    expect(report.dryRun).toBe(true);
    expect(report.filesChanged).toBeGreaterThan(0);
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // not moved
    expect(readDoc("stories/bulk.md")).toContain("[orders](../reference/orders.md)"); // not rewritten
  });

  test("honors a real .lore/profile.toml on disk when rewriting an inbound concept it reshapes (LORE-88, AC#1)", async () => {
    // Drives the real command layer (runRename → loadProfile reading the actual file) rather than
    // the in-memory compileProfile the "rewriteInbound — custom profile" describe block above uses —
    // the two are complementary: that block proves the engine honors an explicitly-passed profile;
    // this proves runRename actually loads and forwards ITS OWN project's profile end to end.
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      '[profile]\nname = "custom"\nokf_version = "0.1"\n\n[base.fields]\ntype = { required = true }\n\n[[types]]\nname = "Story"\nfields = { tasks = { kind = "string" } }\n',
    );
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\ntasks: T-1\n---\nUses [orders](../reference/orders.md).\n");

    const { code, report } = await renameCmd(["reference/orders", "reference/sales-orders"]);
    expect(code).toBe(EXIT_OK);
    expect(report.filesChanged).toBeGreaterThan(0);
    expect(readDoc("stories/bulk.md")).toContain("[orders](../reference/sales-orders.md)");
    expect(readDoc("stories/bulk.md")).toContain("tasks: T-1"); // custom scalar shape survived, not coerced
  });

  test("refuses to commit when an unreadable nested directory left the bundle graph incomplete (LORE-82)", async () => {
    // A concept inside `locked/` links to the concept being renamed — rewriteInbound can never see
    // that inbound link once `locked/` is unreadable, so committing the rename would silently leave
    // it stale/broken while still reporting success.
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("locked/linker.md", "---\ntype: Story\n---\n[orders](../reference/orders.md)\n");
    const locked = join(root, "docs", "locked");
    try {
      chmodSync(locked, 0o000);
    } catch {
      return; // chmod unavailable in this environment — skip
    }
    try {
      // Running as root ignores permissions and reads the dir anyway — the load then succeeds with
      // no skipped-directory warning, so the refusal this test targets never applies; skip rather
      // than assert a precondition that isn't actually true in that environment.
      if (loadBundle(join(root, "docs")).concepts.has("locked/linker")) {
        return;
      }
      const err = await expectError(["reference/orders", "reference/sales-orders"]);
      expect(err.type).toBe("validation");
      expect(err.message).toContain("incomplete");
      // No partial rewrite committed: the source file is untouched, no target file was created.
      expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true);
      expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(false);
    } finally {
      chmodSync(locked, 0o755); // restore so afterEach cleanup can remove it
    }
  });

  test("an unrelated, already-canonical index hub is not rewritten", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntitle: Orders\n---\nOrders.\n");
    writeDoc("stories/tale.md", "---\ntype: Story\ntitle: Tale\n---\nTale.\n");
    const storiesIndex = "# stories\n\n<!-- lore:index:begin -->\n- [Tale](tale.md)\n<!-- lore:index:end -->\n";
    writeDoc("stories/index.md", storiesIndex);
    const { report } = await renameCmd(["reference/orders", "reference/sales-orders"]);
    expect(report.files.map((f) => f.path)).not.toContain("docs/stories/index.md");
    expect(readDoc("stories/index.md")).toBe(storiesIndex); // byte-identical
  });

  test("plain mode renders a relocation line, per-file updates, and a summary", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("stories/bulk.md", "---\ntype: Story\n---\n[orders](../reference/orders.md)\n");
    const stdout = capture();
    await runRename({
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

  test("pretty (color) mode renders the same diff-stable report body", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nLonely.\n");
    const stdout = capture();
    await runRename({
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
  test("a missing new id is a usage error", async () => {
    expect((await expectError(["only-old"])).type).toBe("usage");
  });

  test("a third positional is a usage error", async () => {
    expect((await expectError(["a", "b", "c"])).type).toBe("usage");
  });

  test("a single-dash unknown flag is a usage error", async () => {
    expect((await expectError(["a", "b", "-x"])).type).toBe("usage");
  });

  test("an unknown flag is a usage error", async () => {
    expect((await expectError(["a", "b", "--bogus"])).type).toBe("usage");
  });

  test("renaming an id to itself is a usage error", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    expect((await expectError(["reference/orders", "reference/orders.md"])).type).toBe("usage"); // .md stripped → same id
  });

  test("an absent old id surfaces not_found (exit 3) through the command", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const err = await expectError(["reference/ghost", "reference/x"]);
    expect(err.type).toBe("not_found");
  });

  test("an existing new id surfaces conflict (exit 5) through the command", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    writeDoc("reference/sales.md", "---\ntype: Reference\n---\nTaken.\n");
    expect((await expectError(["reference/orders", "reference/sales"])).type).toBe("conflict");
  });

  test("accepts a -- options terminator before the ids", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const { code } = await renameCmd(["--", "reference/orders", "reference/sales-orders"]);
    expect(code).toBe(EXIT_OK);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
  });

  test("renaming onto a reserved file name (index/log) is a usage error (#4)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const err = await expectError(["reference/orders", "reference/index"]);
    expect(err.type).toBe("usage");
    expect(err.input).toEqual({ id: "reference/index" }); // the offending input is echoed back (cli-contract §5.2)
    expect((await expectError(["reference/orders", "reference/log"])).type).toBe("usage");
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // nothing moved
  });

  test("renaming FROM the reserved root index is a usage error, docs/index.md survives (LORE-81)", async () => {
    // Without the oldId-side check, this used to succeed: the regenerated index listing got written
    // to the source path, then immediately overwritten by the moved content, then the source was
    // renamed away — leaving docs/index.md missing entirely after the command completed.
    writeDoc("index.md", "---\ntype: Reference\n---\nRoot index.\n");
    const err = await expectError(["index", "reference/new-name"]);
    expect(err.type).toBe("usage");
    expect(err.input).toEqual({ id: "index" });
    expect(existsSync(join(root, "docs/index.md"))).toBe(true); // never deleted
    expect(existsSync(join(root, "docs/reference/new-name.md"))).toBe(false); // nothing written
  });

  test("renaming onto an existing non-concept .md file is a conflict, not a clobber (#3)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const nonConcept = "Just prose, no frontmatter — not a concept.\n";
    writeDoc("reference/notes.md", nonConcept);
    expect((await expectError(["reference/orders", "reference/notes"])).type).toBe("conflict");
    expect(readDoc("reference/notes.md")).toBe(nonConcept); // untouched
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // source intact
  });

  test("a traversal newId is rejected as usage (exit 2), before rewriteInbound's validation (LORE-79)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const err = await expectError(["reference/orders", "../../../../tmp/pwned"]);
    expect(err.type).toBe("usage");
    expect(err.input).toEqual({ id: "../../../../tmp/pwned" });
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // nothing moved
  });

  test("a `..`-segment newId is rejected as usage from argument parsing alone, with no oldId ever written (LORE-78)", async () => {
    // No doc is written at all — oldId ("reference/ghost") can never resolve. A usage error (not
    // not_found) proves the destination-id check needs no bundle load or oldId lookup to fire: it
    // is satisfied by parseRenameArgs (LORE-78) from the raw argument tokens alone, independent of
    // LORE-79's own defense-in-depth coverage (the traversal newId test above).
    const err = await expectError(["reference/ghost", "sub/../../pwned"]);
    expect(err.type).toBe("usage");
    expect(err.input).toEqual({ id: "sub/../../pwned" });
  });

  test("an absolute newId is rejected as usage (LORE-79)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    expect((await expectError(["reference/orders", "/etc/pwned"])).type).toBe("usage");
  });

  test("a backslash-spelled relative newId traversal is rejected as usage (LORE-79)", async () => {
    // Mirrors LORE-80's review-caught bypass: posix.normalize treats `\` as an ordinary character,
    // not a separator, so a naive forward-slash-only check would miss this.
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    expect((await expectError(["reference/orders", "..\\pwned"])).type).toBe("usage");
  });

  test("a mixed-separator newId traversal that nets outside the bundle root is rejected as usage (LORE-79)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    expect((await expectError(["reference/orders", "sub/..\\..\\pwned"])).type).toBe("usage");
  });

  test("does not reject a real newId segment that merely starts with '..' (no false positive, LORE-79)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const { code } = await renameCmd(["reference/orders", "..foo/bar"]);
    expect(code).toBe(EXIT_OK);
    expect(existsSync(join(root, "docs/..foo/bar.md"))).toBe(true);
  });

  test("a Windows drive-relative newId is rejected as usage, from argument parsing alone (LORE-95)", async () => {
    // No doc is written — mirrors LORE-78's own "argument parsing alone" test above: this shape is
    // rejected before any bundle load, purely from the raw newId token.
    const err = await expectError(["reference/ghost", "C:pwned"]);
    expect(err.type).toBe("usage");
    expect(err.input).toEqual({ id: "C:pwned" });
  });

  test("an empty newId is rejected as usage, before any file is written or moved (LORE-95)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const err = await expectError(["reference/orders", ""]);
    expect(err.type).toBe("usage");
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // source unchanged
    expect(existsSync(join(root, "docs/..md"))).toBe(false); // the hidden dotfile LORE-95 describes never appears
  });

  test("a self-cancelling newId ('sub/..') is rejected as usage, before any file is written or moved (LORE-95)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const err = await expectError(["reference/orders", "sub/.."]);
    expect(err.type).toBe("usage");
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // source unchanged
    expect(existsSync(join(root, "docs/..md"))).toBe(false);
  });
});

describe("lore rename — refuses to write through a symlinked ancestor directory (LORE-93)", () => {
  let outsideDir: string;

  beforeEach(() => {
    outsideDir = mkdtempSync(join(tmpdir(), "lore-rename-outside-"));
  });
  afterEach(() => {
    rmSync(outsideDir, { recursive: true, force: true });
  });

  // POSIX-only, matching this codebase's existing symlink tests' own skip guard (e.g. init.test.ts).
  test.skipIf(process.platform === "win32")(
    "regression: docs/evil symlinked outside the bundle refuses, writes nothing outside docs/, leaves the source untouched (AC#1/AC#4/AC#6)",
    async () => {
      // Reproduces the filing task's own live repro: docs/evil -> an outside directory.
      writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
      symlinkSync(outsideDir, join(root, "docs/evil"));

      const err = await expectError(["reference/orders", "evil/pwned"]);
      expect(err.type).toBe("conflict");
      expect(err.message.toLowerCase()).toContain("symlink");
      // Nothing was ever written outside the bundle, through the symlink.
      expect(existsSync(join(outsideDir, "pwned.md"))).toBe(false);
      // The source concept was never relocated — it's still exactly where it started.
      expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true);
      expect(readDoc("reference/orders.md")).toContain("Orders.");
      // The pre-existing symlink itself is untouched (not replaced/followed).
      expect(existsSync(join(root, "docs/evil"))).toBe(true);
    },
  );

  test.skipIf(process.platform === "win32")(
    "a symlinked destination refuses BEFORE a legitimate inbound rewrite is written — all-or-nothing, not partial (AC#5)",
    async () => {
      // A genuine, non-symlinked inbound file (bulk.md) has a real link to repoint, AND the move
      // destination is symlinked. commitWrites' preflight sweep (over the WHOLE planned write set,
      // before any single write) must refuse before bulk.md's own legitimate rewrite ever lands on
      // disk — proving the guard isn't merely reactive to loop order (which would let bulk.md's
      // in-place rewrite through before the loop reached the symlinked move destination).
      writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
      writeDoc("stories/bulk.md", "---\ntype: Story\n---\nUses [orders](../reference/orders.md).\n");
      symlinkSync(outsideDir, join(root, "docs/evil"));

      const err = await expectError(["reference/orders", "evil/pwned"]);
      expect(err.type).toBe("conflict");
      expect(existsSync(join(outsideDir, "pwned.md"))).toBe(false);
      // bulk.md's own legitimate, unrelated rewrite was NOT written either — all-or-nothing.
      expect(readDoc("stories/bulk.md")).toContain("[orders](../reference/orders.md)"); // still the OLD link
    },
  );
});

describe("lore rename — data-loss-safe relocation (review fixes)", () => {
  test("a case-only rename does not destroy the file (#1)", async () => {
    writeDoc("stories/Foo.md", "---\ntype: Story\n---\nBody of Foo.\n");
    const { code } = await renameCmd(["stories/Foo", "stories/foo"]);
    expect(code).toBe(EXIT_OK);
    // On any filesystem the lowercase target exists with the content preserved (never deleted).
    expect(existsSync(join(root, "docs/stories/foo.md"))).toBe(true);
    expect(readDoc("stories/foo.md")).toContain("Body of Foo.");
  });

  test("a file created at the destination after the plan-time precheck but before the move is never clobbered (LORE-132, AC#1/#2)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const destAbs = join(root, "docs/reference/sales-orders.md");
    const srcAbs = join(root, "docs/reference/orders.md");
    const raceContents = "RACE: concurrently created between precheck and move\n";

    // rewriteInbound's `assertTargetFree`-satisfying precheck already ran clean (the destination did
    // not exist at plan time) by the time commitWrites reaches the moved file's own write — the LAST
    // writeFileSync `moveFile`'s renameSync follows is the one writing the file's new bytes into its
    // OLD path (rename.ts's commitWrites: `writeFileOverwriting(absFrom, ...)` immediately before
    // `moveFile(absFrom, absTo, ...)`). Hooking exactly that call — identified by its unique
    // destination path, not by ordinal, so this survives an unrelated reordering of the other writes
    // in the same commit — and creating the destination file there simulates a concurrent writer (or
    // a second `lore` invocation) landing in the race window between the precheck and the real move,
    // deterministically, without any actual concurrency.
    const realWriteFileSync = fs.writeFileSync.bind(fs);
    const spy = spyOn(fs, "writeFileSync").mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      if (String(args[0]) === srcAbs) {
        realWriteFileSync(destAbs, raceContents);
      }
      // biome-ignore lint/suspicious/noExplicitAny: forwarding to the real writeFileSync overload set
      return (realWriteFileSync as any)(...args);
    });

    let thrown: unknown;
    try {
      await runRename({
        root,
        output: JSON_CTX,
        args: ["reference/orders", "reference/sales-orders"],
        stdout: capture(),
        stderr: capture(),
      });
    } catch (err) {
      thrown = err;
    } finally {
      spy.mockRestore();
    }

    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("conflict"); // the SAME conflict type assertTargetFree raises
    // The concurrently created file at the destination survives byte-for-byte — never silently
    // replaced by the renamed content.
    expect(readFileSync(destAbs, "utf8")).toBe(raceContents);
  });

  test("renames into a not-yet-existing directory (creates it) (#5)", async () => {
    writeDoc("stories/old.md", "---\ntype: Story\n---\nMoving to a new category.\n");
    const { code } = await renameCmd(["stories/old", "archive/2026/old"]);
    expect(code).toBe(EXIT_OK);
    expect(existsSync(join(root, "docs/archive/2026/old.md"))).toBe(true);
    expect(existsSync(join(root, "docs/stories/old.md"))).toBe(false);
  });

  test("clears the stale listing in a directory the rename empties (#7)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntitle: Orders\n---\nOrders.\n");
    const refIndex = `# reference\n\n${INDEX_BLOCK_BEGIN}\n- [Orders](orders.md)\n${INDEX_BLOCK_END}\n`;
    writeDoc("reference/index.md", refIndex);
    const { code } = await renameCmd(["reference/orders", "stories/orders"]);
    expect(code).toBe(EXIT_OK);
    const after = readDoc("reference/index.md");
    expect(after).not.toContain("[Orders](orders.md)"); // dead link gone from the managed block
    expect(after).toContain(INDEX_BLOCK_BEGIN); // block still present, now empty
    expect(after).toContain(INDEX_BLOCK_END);
  });
});

describe("lore rename — router integration", () => {
  test("`lore rename` is dispatched and relocates through the router", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const code = await run(["bun", "lore", "rename", "reference/orders", "reference/sales-orders", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_OK);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
  });

  test("a not_found surfaces exit 3 through the router", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const code = await run(["bun", "lore", "rename", "reference/ghost", "reference/x", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_CODES.not_found);
  });
});

// ── Backlog back-ref move (LORE-24 follow-up: rename keeps the doc: coupling intact) ──

describe("lore rename — Backlog back-ref move", () => {
  test("renaming a linked concept moves the doc: label and --doc path to the new id/path", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
    ]);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([{ task: "lore-1", backRef: "moved" }]);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toEqual({
      id: "lore-1",
      patch: {
        addLabels: ["doc:reference/sales-orders"],
        removeLabels: ["doc:reference/orders"],
        doc: ["docs/reference/sales-orders.md"],
      },
    });
  });

  test("renaming an unlinked concept never constructs a Backlog adapter at all", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const stdout = capture();

    // No `adapter` option passed — if the code tried to construct the real default adapter (which
    // spawns a subprocess), this would either hang or throw in a sandboxed test run. Succeeding
    // here proves the no-tasks: early-exit skips Backlog entirely.
    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([]);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
  });

  test("--dry-run skips the Backlog move entirely, even for a linked concept", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
    ]);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders", "--dry-run"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([]);
    expect(adapter.calls).toHaveLength(0);
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // not moved
  });

  test("one task's failed back-ref move is reported without blocking the file rename; exit is drift (6)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n  - lore-2\n---\nOrders.\n");
    const adapter = fakeAdapter(
      [
        makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
        makeTask("LORE-2", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
      ],
      { poisonEdits: ["lore-2"] },
    );
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_CODES.drift);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true); // the file still moved
    expect(envelope.data.backRefs).toEqual([
      { task: "lore-1", backRef: "moved" },
      { task: "lore-2", backRef: "failed", error: "simulated Backlog failure editing lore-2" },
    ]);
  });

  test("a task already deleted from Backlog is tolerated: already-current, no throw", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-999\n---\nOrders.\n");
    const adapter = fakeAdapter([]); // lore-999 doesn't exist

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout: capture(),
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });

    expect(code).toBe(EXIT_OK);
    expect(adapter.calls).toHaveLength(0);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true);
  });

  test("a task whose label/doc already reflect the new id/path is a full no-op: already-current, no edit call", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    // Already carries the NEW label/doc (e.g. a prior partial run already moved it) — nothing to do.
    const adapter = fakeAdapter([
      makeTask("LORE-1", {
        labels: ["doc:reference/sales-orders"],
        documentation: ["docs/reference/sales-orders.md"],
      }),
    ]);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([{ task: "lore-1", backRef: "already-current" }]);
    expect(adapter.calls).toHaveLength(0);
  });

  test("a case-only rename moves the label instead of destroying it (7th-pass fix)", async () => {
    writeDoc("stories/Foo.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody of Foo.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/Foo"], documentation: ["docs/stories/Foo.md"] }),
    ]);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["stories/Foo", "stories/foo"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([{ task: "lore-1", backRef: "moved" }]);
    // The label is actually MOVED (re-cased), not just removed: exactly one edit call, which both
    // removes the old-cased label and adds the new-cased one in the same patch.
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toEqual({
      id: "lore-1",
      patch: {
        addLabels: ["doc:stories/foo"],
        removeLabels: ["doc:stories/Foo"],
        doc: ["docs/stories/foo.md"],
      },
    });
  });

  test("a task already carrying both the old and new label/doc still has its stale old label removed (7th-pass fix)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    // A stale dual-labeled task (e.g. left over from a prior hand-edit, per ADR-0009's documented
    // cosmetic-drift tradeoff): it already carries BOTH the old and new label/doc.
    const adapter = fakeAdapter([
      makeTask("LORE-1", {
        labels: ["doc:reference/orders", "doc:reference/sales-orders"],
        documentation: ["docs/reference/orders.md", "docs/reference/sales-orders.md"],
      }),
    ]);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([{ task: "lore-1", backRef: "moved" }]); // NOT already-current
    expect(adapter.calls).toEqual([
      {
        id: "lore-1",
        patch: {
          addLabels: undefined,
          removeLabels: ["doc:reference/orders"],
          doc: ["docs/reference/sales-orders.md"],
        },
      },
    ]);
  });

  test("rejects a comma-bearing new id up front, before any write, when the concept is linked (7th-pass fix)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    try {
      await runRename({
        root,
        output: JSON_CTX,
        args: ["reference/orders", "reference/orders,v2"],
        stdout: capture(),
        stderr: capture(),
        adapter,
      });
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("usage");
      expect((err as LoreError).input).toEqual({ id: "reference/orders,v2" });
    }
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // nothing moved
    expect(adapter.calls).toHaveLength(0);
  });

  test("a comma-bearing new id is fine for an unlinked concept (the guard is scoped to when Backlog is actually touched)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/orders,v2"],
      stdout: capture(),
      stderr: capture(),
    });

    expect(code).toBe(EXIT_OK);
    expect(existsSync(join(root, "docs/reference/orders,v2.md"))).toBe(true);
  });

  test("a task never given a back-ref (e.g. linked with --no-back-ref) is left alone across a rename, not newly labeled (8th-pass fix)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]); // no labels, no documentation at all
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([{ task: "lore-1", backRef: "already-current" }]);
    expect(adapter.calls).toHaveLength(0); // never introduces a back-ref the task didn't already have
  });

  test("case-duplicate ids in tasks: frontmatter are deduped before the Backlog move (8th-pass fix)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n  - LORE-1\n---\nOrders.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
    ]);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(envelope.data.backRefs).toEqual([{ task: "lore-1", backRef: "moved" }]); // one row, not two
    expect(adapter.calls).toHaveLength(1); // one Backlog round trip, not two
  });

  test("moveBackRefs refuses a mismatched adapter detail rather than borrowing its data into the edit (LORE-183)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    // A stub adapter that always answers with a DIFFERENT task's detail, regardless of what id was
    // requested — carrying the OLD label/doc so an unguarded moveBackRefs would happily compute a
    // migrating edit from this borrowed data and write it under the REQUESTED id ("lore-1"). Mirrors
    // link.test.ts's LORE-177 mismatch fixtures for `link`/`unlink`'s own guarded viewTask reads.
    const base = fakeAdapter([]);
    const mismatched: typeof base = {
      ...base,
      async viewTask(): Promise<BacklogTaskDetail | null> {
        return makeTask("LORE-999", {
          labels: ["doc:reference/orders"],
          documentation: ["docs/reference/orders.md"],
        });
      },
    };
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter: mismatched,
      gitSpawn: cleanGitSpawn(),
    });
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: RenameReport };

    expect(code).toBe(EXIT_CODES.drift);
    expect(existsSync(join(root, "docs/reference/sales-orders.md"))).toBe(true); // the file still moved
    expect(envelope.data.backRefs).toHaveLength(1);
    expect(envelope.data.backRefs[0]).toMatchObject({ task: "lore-1", backRef: "failed" });
    expect(envelope.data.backRefs[0]?.error).toContain("lore-1");
    expect(envelope.data.backRefs[0]?.error).toContain("LORE-999");
    // Refused before any editTask call — never borrows LORE-999's labels/documentation into an
    // edit written under the requested "lore-1" id, which would corrupt LORE-999's own back-ref.
    expect(mismatched.calls).toHaveLength(0);
  });

  test("--dry-run previews a rename to a comma-bearing new id instead of throwing, even when linked (9th-pass fix)", async () => {
    // cli-surface.md documents --dry-run as never touching Backlog; the comma/case-collision
    // guards exist purely to protect the Backlog move, so they must not fire under --dry-run.
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");

    const { code, report } = await renameCmd(["reference/orders", "reference/orders,v2", "--dry-run"]);

    expect(code).toBe(EXIT_OK);
    expect(report.dryRun).toBe(true);
    expect(report.backRefs).toEqual([]); // never attempted under --dry-run
    expect(existsSync(join(root, "docs/reference/orders.md"))).toBe(true); // not moved
  });
});

// ── backlog/ commit (LORE-49): rename commits its back-ref move immediately ──

describe("lore rename — backlog/ commit (LORE-49)", () => {
  // makeTask("LORE-1")'s file path (helpers.ts) — the exact path the commit must scope itself to.
  const DIRTY_PATH = "backlog/tasks/lore-1 - title.md";
  const DIRTY = ` M ${DIRTY_PATH}`;

  test("renaming a linked concept commits the moved back-reference, scoped to that one task file", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
    ]);
    const git = dirtyGitSpawn(DIRTY);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: git,
    });
    const { data } = JSON.parse(stdout.text()) as { data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(data.backlogCommit).toEqual({ committed: true, files: [DIRTY_PATH] });
    // SCOPED: `git status` queries only the moved task's file, never all of `backlog/` (ADR-0012 §1).
    // Each path is `:(literal)`-quoted so a wildcard in a filename can't glob-match a sibling.
    expect(git.calls[1]).toEqual([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      `:(literal)${DIRTY_PATH}`,
    ]);
    expect(git.calls[3]).toEqual([
      "commit",
      "-m",
      "chore(backlog): move doc back-references (lore rename)",
      "--",
      `:(literal)${DIRTY_PATH}`,
    ]);
  });

  test("--dry-run never touches git, even for a linked concept", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
    ]);
    const git = dirtyGitSpawn(DIRTY);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders", "--dry-run"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: git,
    });
    const { data } = JSON.parse(stdout.text()) as { data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(data.backlogCommit).toEqual({ committed: false, files: [] });
    expect(git.calls).toHaveLength(0);
  });

  test("renaming an unlinked concept never touches git", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\n---\nOrders.\n");
    const git = dirtyGitSpawn(DIRTY);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      gitSpawn: git,
    });
    const { data } = JSON.parse(stdout.text()) as { data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(data.backlogCommit).toEqual({ committed: false, files: [] });
    expect(git.calls).toHaveLength(0);
  });

  test("an all-already-current move against a genuinely CLEAN tree writes nothing to Backlog and is a true no-op (LORE-179 AC#3)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    // Already carries the NEW label/doc — moveBackRefs is a no-op (already-current), no editTask.
    // The file itself is also clean on disk (never touched by a prior run either), so this stays a
    // true no-op — see the paired dirty-tree/retry case covered at the `moveBackRefs` unit level in
    // link.test.ts's "backlog/ commit (LORE-49)" suite (LORE-179 AC#2).
    const adapter = fakeAdapter([
      makeTask("LORE-1", {
        labels: ["doc:reference/sales-orders"],
        documentation: ["docs/reference/sales-orders.md"],
      }),
    ]);
    const git = cleanGitSpawn();
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: git,
    });
    const { data } = JSON.parse(stdout.text()) as { data: RenameReport };

    expect(code).toBe(EXIT_OK);
    expect(data.backRefs).toEqual([{ task: "lore-1", backRef: "already-current" }]);
    expect(data.backlogCommit).toEqual({ committed: false, files: [] });
    // `commitBacklogFiles` does still query `git status` for the candidate file (its own check
    // is what proves nothing is dirty) — it just never reaches `add`/`commit`, unlike the paired
    // dirty-tree case.
    expect(git.calls.some((c) => c[0] === "add" || c[0] === "commit")).toBe(false);
  });

  test("a partial back-ref failure still commits the successful move and exits drift (6)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n  - lore-2\n---\nOrders.\n");
    const adapter = fakeAdapter(
      [
        makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
        makeTask("LORE-2", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
      ],
      { poisonEdits: ["lore-2"] },
    );
    const git = dirtyGitSpawn(DIRTY);
    const stdout = capture();

    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: git,
    });
    const { data } = JSON.parse(stdout.text()) as { data: RenameReport };

    expect(code).toBe(EXIT_CODES.drift); // lore-2's move failed
    expect(data.backlogCommit.committed).toBe(true); // lore-1's successful move is still committed
    expect(git.calls[3]?.[0]).toBe("commit");
  });

  test("a git commit failure is captured, not thrown: the rename.result report is still emitted and exit is drift (6)", async () => {
    writeDoc("reference/orders.md", "---\ntype: Reference\ntasks:\n  - lore-1\n---\nOrders.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:reference/orders"], documentation: ["docs/reference/orders.md"] }),
    ]);
    const stdout = capture();

    // A rejected commit previously threw HERE — after the files were moved and back-refs edited, but
    // before emit + advisories.flush — dropping the report AND every buffered load advisory. The
    // capture keeps both on the write path: the report is emitted (below) and drift is returned.
    const code = await runRename({
      root,
      output: JSON_CTX,
      args: ["reference/orders", "reference/sales-orders"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: failingCommitGitSpawn(DIRTY),
    });
    const { data } = JSON.parse(stdout.text()) as { data: RenameReport };

    expect(code).toBe(EXIT_CODES.drift);
    expect(data.from).toBe("docs/reference/orders.md"); // the rename.result report survived the commit failure
    expect(data.backlogCommit.committed).toBe(false);
    expect(data.backlogCommit.error).toContain("could not commit backlog/");
  });
});
