/**
 * link.test.ts — `lore link` / `lore unlink` (LORE-24, ADR-0009 §1–§2).
 *
 * Drives {@link runLink}/{@link runUnlink} directly against a temp `docs/` bundle (the
 * `supersede.test.ts` pattern) and a minimal in-memory fake {@link BacklogAdapter} — link/unlink
 * only ever call `viewTask`/`editTask`, so the fake models just those two, tracking every
 * `editTask` call for assertions. The adapter's own `--json` parsing is already covered by
 * `backlog-adapter.test.ts`; these tests are about the command's frontmatter + back-reference
 * wiring, not the JSON contract.
 *
 *   AC#1 — orphans can find tasks owning a doc via the label: `lore link` writes `doc:<conceptId>`.
 *   AC#2 — unlink removes both sides cleanly.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter, EditTaskPatch } from "../src/adapters/backlog";
import {
  assertNoLabelCaseCollision,
  type LinkOptions,
  type LinkReport,
  runLink,
  runUnlink,
  type UnlinkReport,
} from "../src/commands/link";
import { buildGraph } from "../src/core/bundle";
import { parseConcept } from "../src/core/concept";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import type { GitSpawn } from "../src/state";
import { capture, cleanGitSpawn, dirtyGitSpawn, fakeAdapter, makeTask } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

// ── Fixture bundle ──────────────────────────────────────────────────────────────

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-link-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeDoc(rel: string, contents: string): void {
  const abs = join(root, "docs", rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

function readDoc(rel: string): string {
  return readFileSync(join(root, "docs", rel), "utf8");
}

// A clean fake git seam by default so the back-reference commit (`commitBacklogIfDirty`) is a no-op
// rather than shelling a real `git` in the temp bundle; a test asserting the commit passes its own
// `dirtyGitSpawn` and inspects its `.calls`.
function opts(args: string[], adapter: BacklogAdapter, gitSpawn: GitSpawn = cleanGitSpawn()): LinkOptions {
  return { root, output: JSON_CTX, args, stdout: capture(), stderr: capture(), adapter, gitSpawn };
}

async function linkCmd(
  args: string[],
  adapter: BacklogAdapter,
  gitSpawn: GitSpawn = cleanGitSpawn(),
): Promise<{ code: number; report: LinkReport }> {
  const stdout = capture();
  const code = await runLink({ ...opts(args, adapter, gitSpawn), stdout });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: LinkReport };
  expect(envelope.kind).toBe("link.result");
  return { code, report: envelope.data };
}

async function unlinkCmd(
  args: string[],
  adapter: BacklogAdapter,
  gitSpawn: GitSpawn = cleanGitSpawn(),
): Promise<{ code: number; report: UnlinkReport }> {
  const stdout = capture();
  const code = await runUnlink({ ...opts(args, adapter, gitSpawn), stdout });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: UnlinkReport };
  expect(envelope.kind).toBe("unlink.result");
  return { code, report: envelope.data };
}

async function expectLinkError(args: string[], adapter: BacklogAdapter): Promise<LoreError> {
  try {
    await runLink(opts(args, adapter));
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runLink returned");
}

// ── AC#1: link wires tasks: + doc: label + --doc ──────────────────────────────────

describe("lore link — wiring (AC#1)", () => {
  test("adds the task id to tasks: and the doc: label + --doc to the task", async () => {
    writeDoc("stories/bulk-archive.md", "---\ntype: Story\ntitle: Bulk archive\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-42")]);

    const { code, report } = await linkCmd(["stories/bulk-archive", "lore-42"], adapter);
    expect(code).toBe(EXIT_OK);
    expect(report.changed).toBe(true);
    expect(report.tasks).toEqual([{ task: "lore-42", status: "added", backRef: "added" }]);

    const concept = parseConcept("stories/bulk-archive.md", readDoc("stories/bulk-archive.md"));
    expect(concept.frontmatter.tasks).toEqual(["lore-42"]);

    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toEqual({
      id: "lore-42",
      patch: { addLabels: ["doc:stories/bulk-archive"], doc: ["docs/stories/bulk-archive.md"] },
    });
  });

  test("preserves an existing unrelated documentation entry on the task (--doc is SET/REPLACE)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-42", { documentation: ["docs/other/y.md"] })]);

    await linkCmd(["stories/x", "lore-42"], adapter);

    expect(adapter.calls[0]?.patch.doc).toEqual(["docs/other/y.md", "docs/stories/x.md"]);
  });

  test("appends to an existing tasks: list without duplicating", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-42")]);

    const { report } = await linkCmd(["stories/x", "lore-42"], adapter);
    expect(report.changed).toBe(true);

    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["task-1", "lore-42"]);
  });

  test("is idempotent: re-linking an already-linked, fully-synced task writes no doc bytes and calls no Backlog edit", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-42\n---\nBody.\n");
    const before = readDoc("stories/x.md");
    const adapter = fakeAdapter([
      makeTask("TASK-42", { labels: ["doc:stories/x"], documentation: ["docs/stories/x.md"] }),
    ]);

    const { report } = await linkCmd(["stories/x", "task-42"], adapter);
    expect(report.changed).toBe(false);
    expect(report.tasks).toEqual([{ task: "task-42", status: "already-linked", backRef: "already-present" }]);
    expect(readDoc("stories/x.md")).toBe(before);
    expect(adapter.calls).toHaveLength(0); // both the label and --doc already reflect this link — no-op, no edit
  });

  test("re-linking reports a silent --doc repair as added, not already-present, even when the label was already there", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-42\n---\nBody.\n");
    const before = readDoc("stories/x.md");
    // The label is present but --doc was never recorded (or was hand-cleared) — a real repair.
    const adapter = fakeAdapter([makeTask("TASK-42", { labels: ["doc:stories/x"] })]);

    const { report } = await linkCmd(["stories/x", "task-42"], adapter);
    expect(report.changed).toBe(false);
    expect(report.tasks).toEqual([{ task: "task-42", status: "already-linked", backRef: "added" }]);
    expect(readDoc("stories/x.md")).toBe(before); // the doc-side tasks: list is still unchanged
    expect(adapter.calls[0]?.patch.doc).toEqual(["docs/stories/x.md"]); // --doc silently repaired
  });

  test("matches an existing id case-insensitively (ADR-0009: ids compared case-insensitively)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-42\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("TASK-42")]);

    const { report } = await linkCmd(["stories/x", "TASK-42"], adapter);
    expect(report.tasks[0]?.status).toBe("already-linked");
    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["task-42"]); // not duplicated as a second, differently-cased entry
  });

  test("dedupes repeated task ids in one invocation, case-insensitively", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-42")]);

    const { report } = await linkCmd(["stories/x", "lore-42", "LORE-42"], adapter);
    expect(report.tasks).toHaveLength(1);
    expect(adapter.calls).toHaveLength(1);
  });

  test("--no-back-ref skips the Backlog-side edit entirely", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-42")]);

    const { report } = await linkCmd(["stories/x", "lore-42", "--no-back-ref"], adapter);
    expect(report.tasks).toEqual([{ task: "lore-42", status: "added", backRef: "skipped" }]);
    expect(adapter.calls).toHaveLength(0);
  });

  test("links multiple task ids in one invocation", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2")]);

    const { report } = await linkCmd(["stories/x", "lore-1", "lore-2"], adapter);
    expect(report.tasks.map((t) => t.task)).toEqual(["lore-1", "lore-2"]);
    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["lore-1", "lore-2"]);
  });

  test("a missing task id fails loud before any write (exit 3, no partial edit)", async () => {
    const before = "---\ntype: Story\n---\nBody.\n";
    writeDoc("stories/x.md", before);
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const err = await expectLinkError(["stories/x", "lore-1", "lore-999"], adapter);
    expect(err.type).toBe("not_found");
    expect(readDoc("stories/x.md")).toBe(before); // untouched — validation ran before any write
    expect(adapter.calls).toHaveLength(0); // no back-ref edits either
  });

  test("a missing concept id fails loud (exit 3)", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const err = await expectLinkError(["stories/missing", "lore-1"], adapter);
    expect(err.type).toBe("not_found");
  });

  test("usage errors: missing concept id, missing task ids, unknown flag", async () => {
    const adapter = fakeAdapter([]);
    expect((await expectLinkError([], adapter)).type).toBe("usage");
    expect((await expectLinkError(["stories/x"], adapter)).type).toBe("usage");
    expect((await expectLinkError(["stories/x", "lore-1", "--bogus"], adapter)).type).toBe("usage");
  });
});

// ── AC#2: unlink removes both sides cleanly ───────────────────────────────────────

describe("lore unlink — removal (AC#2)", () => {
  test("removes the task id from tasks: and the doc: label + shrinks --doc on the task", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n  - lore-2\n---\nBody.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/x"], documentation: ["docs/stories/x.md"] }),
    ]);

    const { code, report } = await unlinkCmd(["stories/x", "lore-1"], adapter);
    expect(code).toBe(EXIT_OK);
    expect(report.changed).toBe(true);
    expect(report.tasks).toEqual([{ task: "lore-1", status: "removed", backRef: "removed" }]);

    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["lore-2"]);

    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toEqual({
      id: "lore-1",
      patch: { removeLabels: ["doc:stories/x"], doc: [] },
    });
  });

  test("preserves a different doc's reference while removing this one", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1", { documentation: ["docs/stories/x.md", "docs/other/y.md"] })]);

    await unlinkCmd(["stories/x", "lore-1"], adapter);

    expect(adapter.calls[0]?.patch.doc).toEqual(["docs/other/y.md"]);
  });

  test("sends an empty --doc array when the remaining set would be empty (Backlog treats [] and undefined identically, contract §2.4)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1", { documentation: ["docs/stories/x.md"] })]);

    await unlinkCmd(["stories/x", "lore-1"], adapter);

    expect(adapter.calls[0]?.patch.doc).toEqual([]);
  });

  test("tolerates a task id no longer present in Backlog: doc-side cleaned, back-ref skipped, no throw", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n  - lore-999\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const { code, report } = await unlinkCmd(["stories/x", "lore-999"], adapter);
    expect(code).toBe(EXIT_OK);
    expect(report.tasks).toEqual([{ task: "lore-999", status: "removed", backRef: "skipped" }]);
    expect(adapter.calls).toHaveLength(0);

    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["lore-1"]);
  });

  test("is idempotent: unlinking a task not currently linked writes no doc bytes, but still self-heals a stray label", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const before = readDoc("stories/x.md");
    const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/x"] })]);

    const { report } = await unlinkCmd(["stories/x", "lore-1"], adapter);
    expect(report.tasks).toEqual([{ task: "lore-1", status: "not-linked", backRef: "removed" }]);
    expect(readDoc("stories/x.md")).toBe(before);
    expect(adapter.calls).toHaveLength(1); // the stray label is still cleaned up
  });

  test("--no-back-ref leaves the doc: label on the task", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/x"] })]);

    const { report } = await unlinkCmd(["stories/x", "lore-1", "--no-back-ref"], adapter);
    expect(report.tasks).toEqual([{ task: "lore-1", status: "removed", backRef: "skipped" }]);
    expect(adapter.calls).toHaveLength(0);
  });

  test("a missing concept id fails loud (exit 3) — unlink's only failure case", async () => {
    const adapter = fakeAdapter([]);
    try {
      await runUnlink(opts(["stories/missing", "lore-1"], adapter));
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("not_found");
    }
  });
});

// ── Misc: plain-text rendering, scalar frontmatter, parser edge cases ─────────────

describe("lore link/unlink — plain rendering and parser edge cases", () => {
  test("plain mode renders one line per task plus a summary line", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const stdout = capture();

    await runLink({
      root,
      output: PLAIN_CTX,
      args: ["stories/x", "lore-1"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    expect(stdout.text()).toBe("lore-1: added (doc), back-ref added\ndocs/stories/x.md: updated\n");
  });

  test("plain mode renders unlink's report the same way", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const stdout = capture();

    await runUnlink({
      root,
      output: PLAIN_CTX,
      args: ["stories/x", "lore-1"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    expect(stdout.text()).toBe("lore-1: removed (doc), back-ref already-absent\ndocs/stories/x.md: updated\n");
  });

  test("pretty (color) mode renders the same report body", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const stdout = capture();

    await runLink({
      root,
      output: { mode: "pretty", color: true },
      args: ["stories/x", "lore-1"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: cleanGitSpawn(),
    });
    expect(stdout.text()).toBe("lore-1: added (doc), back-ref added\ndocs/stories/x.md: updated\n");
  });

  test("reads a bare-scalar tasks: authored value as a single-element list (an undeclared field on a non-Story type is unvalidated passthrough)", async () => {
    // `Reference` declares no `tasks` field, so it's an unvalidated passthrough key — unlike
    // `Story`'s schema-enforced array, a hand-authored scalar here is exactly what
    // frontmatterList's scalar-tolerance branch exists for.
    writeDoc("reference/x.md", "---\ntype: Reference\ntasks: task-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-2")]);

    const { report } = await linkCmd(["reference/x", "lore-2"], adapter);
    expect(report.changed).toBe(true);
    const concept = parseConcept("reference/x.md", readDoc("reference/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["task-1", "lore-2"]);
  });

  test("a `--` end-of-options marker treats every following token as a positional", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const { report } = await linkCmd(["stories/x", "--", "lore-1"], adapter);
    expect(report.tasks[0]?.task).toBe("lore-1");
  });

  test("a bare single-dash unknown flag is a usage error", async () => {
    const adapter = fakeAdapter([]);
    const err = await expectLinkError(["stories/x", "-z"], adapter);
    expect(err.type).toBe("usage");
  });
});

// ── Resilience: a per-task Backlog failure never aborts or corrupts the rest ──────

describe("lore link/unlink — per-task back-ref resilience", () => {
  test("link: one poisoned task's back-ref fails, the other still succeeds, doc-side write includes both, exit is drift (6)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2")], { poisonEdits: ["lore-2"] });

    const { code, report } = await linkCmd(["stories/x", "lore-1", "lore-2"], adapter);
    expect(code).toBe(EXIT_CODES.drift);
    expect(report.changed).toBe(true);
    expect(report.tasks).toEqual([
      { task: "lore-1", status: "added", backRef: "added" },
      {
        task: "lore-2",
        status: "added",
        backRef: "failed",
        error: "simulated Backlog failure editing lore-2",
      },
    ]);

    // The doc-side write is unaffected by the Backlog-side failure: both ids are linked.
    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["lore-1", "lore-2"]);
    // The successful task's edit is unaffected by the other task's failure.
    expect(adapter.calls.find((c) => c.id === "lore-1")?.patch.addLabels).toEqual(["doc:stories/x"]);
  });

  test("unlink: one poisoned task's back-ref fails, the other still succeeds, doc-side removal includes both, exit is drift (6)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n  - lore-2\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2", { labels: ["doc:stories/x"] })], {
      poisonEdits: ["lore-2"],
    });

    const { code, report } = await unlinkCmd(["stories/x", "lore-1", "lore-2"], adapter);
    expect(code).toBe(EXIT_CODES.drift);
    expect(report.changed).toBe(true);
    expect(report.tasks).toEqual([
      { task: "lore-1", status: "removed", backRef: "already-absent" },
      {
        task: "lore-2",
        status: "removed",
        backRef: "failed",
        error: "simulated Backlog failure editing lore-2",
      },
    ]);

    // The doc-side removal is unaffected by the Backlog-side failure: both ids are unlinked.
    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual([]);
  });

  test("a single WarningCollector flush: a load advisory is printed to stderr exactly once, not twice", async () => {
    // A Story with no `summary` triggers a `loadBundle` advisory.
    writeDoc("stories/x.md", "---\ntype: Story\ntitle: X\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const stderr = capture();

    await runLink({
      root,
      output: JSON_CTX,
      args: ["stories/x", "lore-1"],
      stdout: capture(),
      stderr,
      adapter,
      gitSpawn: cleanGitSpawn(),
    });

    const occurrences = stderr.text().split("missing `summary`").length - 1;
    expect(occurrences).toBe(1);
  });

  test("a non-string tasks: entry (a YAML-coerced number, on a type with no schema-declared tasks field) is preserved, not silently dropped", async () => {
    // `Reference` declares no `tasks` field, so a numeric entry is unvalidated passthrough —
    // exactly the case toRefList's scalar coercion (shared with rewrite.ts's ref handling) exists for.
    writeDoc("reference/x.md", "---\ntype: Reference\ntasks:\n  - 42\n  - task-2\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-3")]);

    const { report } = await linkCmd(["reference/x", "lore-3"], adapter);
    expect(report.changed).toBe(true);
    const concept = parseConcept("reference/x.md", readDoc("reference/x.md"));
    expect(concept.frontmatter.tasks).toEqual(["42", "task-2", "lore-3"]);
  });
});

// ── 2nd-pass fixes: write order, no-op short-circuit, fresh reads, case-preserving labels ──

describe("lore link/unlink — 2nd-pass code-review fixes", () => {
  test("unlink writes the doc-side tasks: removal before any Backlog mutation (write-order safety)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/x"], documentation: ["docs/stories/x.md"] }),
    ]);
    let docAlreadyUpdatedWhenEditCalled = false;
    const originalEditTask = adapter.editTask.bind(adapter);
    adapter.editTask = async (id: string, patch: EditTaskPatch) => {
      docAlreadyUpdatedWhenEditCalled = !readDoc("stories/x.md").includes("lore-1");
      return originalEditTask(id, patch);
    };

    await unlinkCmd(["stories/x", "lore-1"], adapter);
    expect(docAlreadyUpdatedWhenEditCalled).toBe(true);
  });

  test("unlink is a full no-op on the Backlog side when the label and --doc were never set: no edit call", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]); // no label, no documentation entry

    const { report } = await unlinkCmd(["stories/x", "lore-1"], adapter);
    expect(report.tasks).toEqual([{ task: "lore-1", status: "removed", backRef: "already-absent" }]);
    expect(adapter.calls).toHaveLength(0);
  });

  test("existence pre-check reports the first invalid id in argument order, even when a later id's read rejects first", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")], { poisonViews: ["lore-3"] });

    // lore-2 is not-found (resolves null); lore-3's read genuinely rejects. Argument order must
    // still surface lore-2's not_found first, not race ahead on whichever settles/rejects first.
    const err = await expectLinkError(["stories/x", "lore-2", "lore-3"], adapter);
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("lore-2");
  });

  test("a genuine viewTask read failure during the existence pre-check surfaces (not swallowed)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")], { poisonViews: ["lore-1"] });

    try {
      await runLink(opts(["stories/x", "lore-1"], adapter));
      throw new Error("expected a throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("simulated Backlog read failure");
    }
  });

  test("link re-reads the task fresh right before editing, not the up-front validation snapshot", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    let viewCount = 0;
    const originalViewTask = adapter.viewTask.bind(adapter);
    adapter.viewTask = async (id: string) => {
      viewCount++;
      const detail = await originalViewTask(id);
      // The 2nd read (the back-ref edit's fresh read) sees a change that happened after the
      // up-front existence check (the 1st read) already ran.
      if (viewCount === 2 && detail !== null) {
        return { ...detail, documentation: ["docs/other/out-of-band.md"] };
      }
      return detail;
    };

    await linkCmd(["stories/x", "lore-1"], adapter);
    expect(adapter.calls[0]?.patch.doc).toEqual(["docs/other/out-of-band.md", "docs/stories/x.md"]);
  });

  test("link reports a task deleted between validation and the back-ref edit as failed, not a crash", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    let viewCount = 0;
    const originalViewTask = adapter.viewTask.bind(adapter);
    adapter.viewTask = async (id: string) => {
      viewCount++;
      return viewCount === 2 ? null : originalViewTask(id);
    };

    const { code, report } = await linkCmd(["stories/x", "lore-1"], adapter);
    expect(code).toBe(EXIT_CODES.drift);
    expect(report.tasks[0]).toMatchObject({ backRef: "failed" });
    expect(report.tasks[0]?.error).toContain("no longer exists");
  });

  test("backRefLabel preserves the concept id's case instead of lowercasing it (avoids collapsing two case-distinct concepts onto one label)", async () => {
    writeDoc("stories/Bulk-Archive.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-42")]);

    await linkCmd(["stories/Bulk-Archive", "lore-42"], adapter);
    expect(adapter.calls[0]?.patch.addLabels).toEqual(["doc:stories/Bulk-Archive"]);
  });

  test("rejects index/log as a link/unlink principal — a reserved, machine-generated hub", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    expect((await expectLinkError(["index", "lore-1"], adapter)).type).toBe("usage");
    expect((await expectLinkError(["log", "lore-1"], adapter)).type).toBe("usage");

    try {
      await runUnlink(opts(["index", "lore-1"], adapter));
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("usage");
    }
  });

  test("rejects a concept id containing a comma up front, before any write — Backlog's label ops have no escape for one", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const err = await expectLinkError(["notes/release-notes,v2", "lore-1"], adapter);
    expect(err.type).toBe("usage");
    expect(adapter.calls).toHaveLength(0);

    try {
      await runUnlink(opts(["notes/release-notes,v2", "lore-1"], adapter));
      throw new Error("expected a LoreError");
    } catch (err2) {
      expect(err2).toBeInstanceOf(LoreError);
      expect((err2 as LoreError).type).toBe("usage");
    }
  });

  test("--no-back-ref bypasses the comma-id guard: no Backlog label is ever sent on that path, so the comma problem cannot occur", async () => {
    writeDoc("notes/release-notes,v2.md", "---\ntype: Reference\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const { report } = await linkCmd(["notes/release-notes,v2", "lore-1", "--no-back-ref"], adapter);
    expect(report.changed).toBe(true);
    expect(adapter.calls).toHaveLength(0);
    const concept = parseConcept("notes/release-notes,v2.md", readDoc("notes/release-notes,v2.md"));
    expect(concept.frontmatter.tasks).toEqual(["lore-1"]);
  });

  test("assertNoLabelCaseCollision rejects two concepts whose ids differ only by case (Backlog's own label store can't distinguish them)", () => {
    // Can't reproduce this via real files: mac/windows filesystems are case-insensitive, so two
    // paths differing only by case would collide as the same file on disk. Build the graph
    // in-memory instead — buildGraph/parseConcept touch no filesystem.
    const a = parseConcept("stories/Bulk-Archive.md", "---\ntype: Story\n---\nA.\n");
    const b = parseConcept("stories/bulk-archive.md", "---\ntype: Story\n---\nB.\n");
    const graph = buildGraph([a, b]);

    try {
      assertNoLabelCaseCollision(graph, a.id, a.id, "link/unlink");
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("conflict");
    }
  });

  test("assertNoLabelCaseCollision allows a concept with no case-colliding sibling", () => {
    const a = parseConcept("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const graph = buildGraph([a]);
    expect(() => assertNoLabelCaseCollision(graph, a.id, a.id, "link/unlink")).not.toThrow();
  });

  test("assertNoLabelCaseCollision detects a collision when excludeId differs from candidateId (lore rename's own call pattern: candidateId=newId, excludeId=oldId)", () => {
    // A concept "a" is being renamed onto "stories/b", which case-collides with an unrelated
    // sibling "stories/B" already in the bundle — excludeId is "a"'s OLD id, not the candidate, so
    // the check must still fire even though candidateId !== excludeId.
    const a = parseConcept("stories/a.md", "---\ntype: Story\n---\nA.\n");
    const bColliding = parseConcept("stories/B.md", "---\ntype: Story\n---\nB.\n");
    const graph = buildGraph([a, bColliding]);

    try {
      assertNoLabelCaseCollision(graph, "stories/b", a.id, "rename to");
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("conflict");
    }
  });
});

// ── unlink --allow-missing: clean up a stale label after a hand-relocation ────────

describe("lore unlink --allow-missing", () => {
  test("cleans up a stale doc: label/--doc for an id that no longer resolves to any concept", async () => {
    // Simulates the aftermath of a hand relocation (git mv, an IDE refactor — not `lore rename`):
    // the concept that used to be "stories/foo" is gone from the bundle, but LORE-1 still carries
    // its stale back-reference.
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/foo"], documentation: ["docs/stories/foo.md"] }),
    ]);

    const { code, report } = await unlinkCmd(["stories/foo", "lore-1", "--allow-missing"], adapter);

    expect(code).toBe(EXIT_OK);
    expect(report.concept).toBe("docs/stories/foo.md");
    expect(report.changed).toBe(false); // no concept file exists to write tasks: on
    expect(report.tasks).toEqual([{ task: "lore-1", status: "not-linked", backRef: "removed" }]);
    expect(adapter.calls).toEqual([{ id: "lore-1", patch: { removeLabels: ["doc:stories/foo"], doc: [] } }]);
  });

  test("cleans up the stale --doc entry even when the recovery id's case doesn't match the originally-stored casing (9th-pass fix)", async () => {
    // The concept used to be "stories/Foo" (mixed case) before it was hand-relocated; the user
    // recalls/types the natural lowercase guess. The label matches case-insensitively regardless
    // (Backlog's own de-dup); the --doc path must too, or it would be silently stranded forever.
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/Foo"], documentation: ["docs/stories/Foo.md"] }),
    ]);

    const { report } = await unlinkCmd(["stories/foo", "lore-1", "--allow-missing"], adapter);

    expect(report.tasks).toEqual([{ task: "lore-1", status: "not-linked", backRef: "removed" }]);
    expect(adapter.calls).toEqual([{ id: "lore-1", patch: { removeLabels: ["doc:stories/foo"], doc: [] } }]);
  });

  test("without --allow-missing, the same id still fails loud (not_found)", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/foo"] })]);

    try {
      await runUnlink(opts(["stories/foo", "lore-1"], adapter));
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("not_found");
    }
    expect(adapter.calls).toHaveLength(0);
  });

  test("is idempotent: reports already-absent and calls nothing when the task never had the label", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1")]); // no labels, no documentation

    const { report } = await unlinkCmd(["stories/foo", "lore-1", "--allow-missing"], adapter);

    expect(report.tasks).toEqual([{ task: "lore-1", status: "not-linked", backRef: "already-absent" }]);
    expect(adapter.calls).toHaveLength(0);
  });

  test("still guards against a LIVE concept whose id collides case-insensitively with the given id", async () => {
    writeDoc("stories/Foo.md", "---\ntype: Story\n---\nBody.\n"); // a real, unrelated, currently-linked concept
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/foo"], documentation: ["docs/stories/foo.md"] }),
    ]);

    try {
      await runUnlink(opts(["stories/foo", "lore-1", "--allow-missing"], adapter));
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("conflict");
    }
    expect(adapter.calls).toHaveLength(0); // refused before any Backlog edit
  });

  test("still rejects a comma-bearing id up front", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    try {
      await runUnlink(opts(["notes/foo,bar", "lore-1", "--allow-missing"], adapter));
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("usage");
    }
  });

  test("combined with --no-back-ref is a full no-op (nothing to write, nothing to remove)", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/foo"] })]);

    const { code, report } = await unlinkCmd(["stories/foo", "lore-1", "--allow-missing", "--no-back-ref"], adapter);

    expect(code).toBe(EXIT_OK);
    expect(report.tasks).toEqual([{ task: "lore-1", status: "not-linked", backRef: "skipped" }]);
    expect(adapter.calls).toHaveLength(0);
  });

  test("`lore link` rejects --allow-missing as an unknown flag (unlink-only)", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const err = await expectLinkError(["stories/x", "lore-1", "--allow-missing"], adapter);
    expect(err.type).toBe("usage");
  });
});

// ── backlog/ commit (LORE-49): link/unlink commit their doc: back-ref writes immediately ──

describe("lore link/unlink — backlog/ commit (LORE-49)", () => {
  const DIRTY = " M backlog/tasks/lore-1 - x.md";
  const DIRTY_PATH = "backlog/tasks/lore-1 - x.md";

  test("link commits the doc: back-reference it just wrote, in one lore-authored commit", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const git = dirtyGitSpawn(DIRTY);

    const { code, report } = await linkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK);
    expect(report.backlogCommit).toEqual({ committed: true, files: [DIRTY_PATH] });
    // Stages exactly the dirty backlog/ path and commits it with lore's own attributable message.
    expect(git.calls[2]).toEqual(["add", "--", DIRTY_PATH]);
    expect(git.calls[3]).toEqual([
      "commit",
      "-m",
      "chore(backlog): add doc back-references (lore link)",
      "--",
      DIRTY_PATH,
    ]);
  });

  test("link --no-back-ref makes no Backlog write, so it never queries or commits backlog/", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const git = dirtyGitSpawn(DIRTY); // even against a dirty tree, --no-back-ref must not sweep it in

    const { report } = await linkCmd(["stories/x", "lore-1", "--no-back-ref"], adapter, git);

    expect(report.backlogCommit).toEqual({ committed: false, files: [] });
    expect(git.calls).toHaveLength(0);
  });

  test("a fully idempotent link (every id already linked) writes nothing and does not commit", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    // Already carries the label + --doc, so the edit is skipped (already-present) — a true no-op.
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/x"], documentation: ["docs/stories/x.md"] }),
    ]);
    const git = dirtyGitSpawn(DIRTY);

    const { report } = await linkCmd(["stories/x", "lore-1"], adapter, git);

    expect(report.tasks[0]?.backRef).toBe("already-present");
    expect(report.backlogCommit.committed).toBe(false);
    expect(git.calls).toHaveLength(0); // a no-op link never sweeps an unrelated dirty backlog/ edit
  });

  test("a partial back-ref failure still commits the successful writes and exits drift (6)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2")], { poisonEdits: ["lore-2"] });
    const git = dirtyGitSpawn(DIRTY);

    const { code, report } = await linkCmd(["stories/x", "lore-1", "lore-2"], adapter, git);

    expect(code).toBe(EXIT_CODES.drift); // lore-2's edit failed
    expect(report.backlogCommit.committed).toBe(true); // lore-1's successful write is still committed
    expect(git.calls[3]?.[0]).toBe("commit");
  });

  test("unlink commits the doc: back-reference removal it just wrote", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/x"], documentation: ["docs/stories/x.md"] }),
    ]);
    const git = dirtyGitSpawn(DIRTY);

    const { code, report } = await unlinkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK);
    expect(report.tasks[0]?.backRef).toBe("removed");
    expect(report.backlogCommit).toEqual({ committed: true, files: [DIRTY_PATH] });
    expect(git.calls[3]).toEqual([
      "commit",
      "-m",
      "chore(backlog): remove doc back-references (lore unlink)",
      "--",
      DIRTY_PATH,
    ]);
  });

  test("plain mode appends a `committed backlog/` line when a commit was made", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const stdout = capture();

    await runLink({
      root,
      output: PLAIN_CTX,
      args: ["stories/x", "lore-1"],
      stdout,
      stderr: capture(),
      adapter,
      gitSpawn: dirtyGitSpawn(DIRTY),
    });

    expect(stdout.text()).toBe(
      "lore-1: added (doc), back-ref added\ndocs/stories/x.md: updated\ncommitted backlog/: 1 file\n",
    );
  });
});
