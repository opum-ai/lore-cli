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
import type { BacklogAdapter, BacklogTaskDetail, EditTaskPatch } from "../src/adapters/backlog";
import { TASK_DETAILS_CONCURRENCY } from "../src/commands/concurrency";
import {
  assertNoLabelCaseCollision,
  type LinkOptions,
  type LinkReport,
  moveBackRefs,
  runLink,
  runUnlink,
  type UnlinkReport,
  verifiedViewTask,
} from "../src/commands/link";
import { buildGraph } from "../src/core/bundle";
import { parseConcept } from "../src/core/concept";
import { EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import type { GitSpawn } from "../src/state";
import { capture, cleanGitSpawn, dirtyGitSpawn, failingCommitGitSpawn, fakeAdapter, makeTask } from "./helpers";

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

async function expectLinkError(args: string[], adapter: BacklogAdapter, gitSpawn?: GitSpawn): Promise<LoreError> {
  const stdout = capture();
  try {
    await runLink({ ...opts(args, adapter, gitSpawn), stdout });
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    // AC#2 (LORE-58): stdout parses or stays silent — empty on every link/unlink failure, partial or otherwise.
    expect(stdout.text()).toBe("");
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runLink returned");
}

async function expectUnlinkError(args: string[], adapter: BacklogAdapter, gitSpawn?: GitSpawn): Promise<LoreError> {
  const stdout = capture();
  try {
    await runUnlink({ ...opts(args, adapter, gitSpawn), stdout });
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    // AC#2 (LORE-58): stdout parses or stays silent — empty on every link/unlink failure, partial or otherwise.
    expect(stdout.text()).toBe("");
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runUnlink returned");
}

describe("verified task aliases", () => {
  test("accepts a canonical Quest id only when the requested reference is a validated alias", async () => {
    const canonical = { ...makeTask("T-1"), aliases: ["LCLI-1"] };
    const adapter: BacklogAdapter = { ...fakeAdapter([]), viewTask: async () => canonical };
    await expect(verifiedViewTask(adapter, "LCLI-1")).resolves.toBe(canonical);
  });

  test("still rejects an unrelated canonical mismatch", async () => {
    const canonical = { ...makeTask("T-1"), aliases: ["LCLI-2"] };
    const adapter: BacklogAdapter = { ...fakeAdapter([]), viewTask: async () => canonical };
    await expect(verifiedViewTask(adapter, "LCLI-1")).rejects.toMatchObject({ type: "not_found" });
  });
});

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

  test("a casing-variant --doc entry is recognized, not duplicated, when the doc: label is already present (LORE-234)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-42\n---\nBody.\n");
    const before = readDoc("stories/x.md");
    // The label is present and --doc already carries a case-variant of the computed docPath
    // (docs/stories/x.md) — this must be recognized as already-current, not forced through an
    // unnecessary edit that would append a second, differently-cased entry.
    const adapter = fakeAdapter([
      makeTask("TASK-42", { labels: ["doc:stories/x"], documentation: ["docs/Stories/X.md"] }),
    ]);

    const { report } = await linkCmd(["stories/x", "task-42"], adapter);
    expect(report.changed).toBe(false);
    expect(report.tasks).toEqual([{ task: "task-42", status: "already-linked", backRef: "already-present" }]);
    expect(readDoc("stories/x.md")).toBe(before);
    expect(adapter.calls).toHaveLength(0); // no edit at all — the casing variant already covers it
  });

  test("a casing-variant --doc entry is recognized, not duplicated, when the doc: label is absent (LORE-234)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-42\n---\nBody.\n");
    const before = readDoc("stories/x.md");
    // The label is missing (so the label side still needs repair), but --doc already carries a
    // case-variant of the computed docPath. Before the fix, addDoc's exact-case `includes` would
    // append a second, differently-cased documentation entry alongside the repaired label.
    const adapter = fakeAdapter([makeTask("TASK-42", { documentation: ["docs/Stories/X.md"] })]);

    const { report } = await linkCmd(["stories/x", "task-42"], adapter);
    expect(report.changed).toBe(false);
    expect(report.tasks).toEqual([{ task: "task-42", status: "already-linked", backRef: "added" }]);
    expect(readDoc("stories/x.md")).toBe(before);
    // The label is repaired, but --doc carries exactly one entry for the doc — the pre-existing
    // casing variant is preserved as-is, not duplicated with a freshly-cased second entry.
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.patch.doc).toEqual(["docs/Stories/X.md"]);
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

  test("refuses a type whose active-profile schema does not declare tasks before task IO or writes (LCLI-304)", async () => {
    const before = "---\ntype: Runbook\ntitle: Recovery\n---\n# Recovery\n";
    writeDoc("runbooks/recovery.md", before);
    let views = 0;
    const base = fakeAdapter([makeTask("LORE-42")]);
    const adapter: BacklogAdapter = {
      ...base,
      async viewTask(id: string) {
        views++;
        return base.viewTask(id);
      },
    };

    const err = await expectLinkError(["runbooks/recovery", "lore-42"], adapter);

    expect(err.type).toBe("validation");
    expect(err.message).toContain('type "Runbook" does not declare a `tasks` field');
    expect(err.input).toMatchObject({ id: "runbooks/recovery", type: "Runbook", field: "tasks" });
    expect(views).toBe(0);
    expect(base.calls).toHaveLength(0);
    expect(readDoc("runbooks/recovery.md")).toBe(before);
  });

  test("allows a custom-profile type that explicitly declares tasks (LCLI-304)", async () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      `[profile]\nname = "custom"\nokf_version = "0.1"\n\n[base.fields]\ntype = { required = true }\n\n[[types]]\nname = "Runbook"\nfields = { tasks = { kind = "list" } }\n`,
    );
    writeDoc(
      "runbooks/recovery.md",
      "---\ntype: Runbook\ntasks: []\n---\n# Recovery\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const adapter = fakeAdapter([makeTask("LORE-42")]);

    const { report } = await linkCmd(["runbooks/recovery", "lore-42", "--no-back-ref"], adapter);

    expect(report.changed).toBe(true);
    const concept = parseConcept("runbooks/recovery.md", readDoc("runbooks/recovery.md"));
    expect(concept.frontmatter.tasks).toEqual(["lore-42"]);
  });

  test("a missing concept id fails loud (exit 3)", async () => {
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const err = await expectLinkError(["stories/missing", "lore-1"], adapter);
    expect(err.type).toBe("not_found");
    // LORE-259: the hint points at a command that actually lists concept ids — `lore query`
    // and `lore graph` (run with no args) both do; `lore check` only prints a summary count.
    expect(err.hint).toContain("lore query");
    expect(err.hint).not.toContain("lore check");
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

  test("removing the final legacy link from an unsupported type deletes the stray tasks key (LCLI-304)", async () => {
    writeDoc("runbooks/recovery.md", "---\ntype: Runbook\ntitle: Recovery\ntasks:\n  - lore-1\n---\n# Recovery\n");
    const adapter = fakeAdapter([]);

    const { code, report } = await unlinkCmd(["runbooks/recovery", "lore-1", "--no-back-ref"], adapter);

    expect(code).toBe(EXIT_OK);
    expect(report.changed).toBe(true);
    expect(report.tasks).toEqual([{ task: "lore-1", status: "removed", backRef: "skipped" }]);
    const concept = parseConcept("runbooks/recovery.md", readDoc("runbooks/recovery.md"));
    expect(Object.hasOwn(concept.frontmatter, "tasks")).toBe(false);
    expect(readDoc("runbooks/recovery.md")).not.toContain("tasks:");
  });

  test("repeating unlink heals an unsupported empty tasks key left by an older binary (LCLI-304)", async () => {
    writeDoc("runbooks/recovery.md", "---\ntype: Runbook\ntitle: Recovery\ntasks: []\n---\n# Recovery\n");
    const adapter = fakeAdapter([]);

    const { report } = await unlinkCmd(["runbooks/recovery", "lore-1", "--no-back-ref"], adapter);

    expect(report.changed).toBe(true);
    expect(report.tasks).toEqual([{ task: "lore-1", status: "not-linked", backRef: "skipped" }]);
    const concept = parseConcept("runbooks/recovery.md", readDoc("runbooks/recovery.md"));
    expect(Object.hasOwn(concept.frontmatter, "tasks")).toBe(false);
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
    expect(stdout.text()).toBe("lore-1: tasks: added, back-ref: added\ndocs/stories/x.md: updated\n");
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
    expect(stdout.text()).toBe("lore-1: tasks: removed, back-ref: already-absent\ndocs/stories/x.md: updated\n");
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
    expect(stdout.text()).toBe("lore-1: tasks: added, back-ref: added\ndocs/stories/x.md: updated\n");
  });

  test("refuses a bare-scalar legacy tasks field on a type whose schema does not support coupling", async () => {
    writeDoc("reference/x.md", "---\ntype: Reference\ntasks: task-1\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-2")]);
    const before = readDoc("reference/x.md");

    const err = await expectLinkError(["reference/x", "lore-2"], adapter);
    expect(err.type).toBe("validation");
    expect(readDoc("reference/x.md")).toBe(before);
    expect(adapter.calls).toHaveLength(0);
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
  test("link: one poisoned task's back-ref fails, the other still succeeds, doc-side write includes both, throws drift (LORE-58)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2")], { poisonEdits: ["lore-2"] });

    // Since LORE-58, a partial failure throws a `drift` LoreError (stdout stays empty, per
    // expectLinkError) instead of emitting a success-shaped envelope on a nonzero exit — the
    // same per-task detail now lives in the error's `input` instead of stdout.
    const err = await expectLinkError(["stories/x", "lore-1", "lore-2"], adapter);
    expect(err.type).toBe("drift");
    const input = err.input as LinkReport;
    expect(input.changed).toBe(true);
    expect(input.tasks).toEqual([
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

  test("unlink: one poisoned task's back-ref fails, the other still succeeds, doc-side removal includes both, throws drift (LORE-58)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n  - lore-2\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2", { labels: ["doc:stories/x"] })], {
      poisonEdits: ["lore-2"],
    });

    const err = await expectUnlinkError(["stories/x", "lore-1", "lore-2"], adapter);
    expect(err.type).toBe("drift");
    const input = err.input as UnlinkReport;
    expect(input.changed).toBe(true);
    expect(input.tasks).toEqual([
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

  test("a non-string legacy tasks entry on an unsupported type is refused without normalization", async () => {
    writeDoc("reference/x.md", "---\ntype: Reference\ntasks:\n  - 42\n  - task-2\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-3")]);
    const before = readDoc("reference/x.md");

    const err = await expectLinkError(["reference/x", "lore-3"], adapter);
    expect(err.type).toBe("validation");
    expect(readDoc("reference/x.md")).toBe(before);
    expect(adapter.calls).toHaveLength(0);
  });
});

// ── viewTask identity verification (LORE-177, sibling of LORE-122/125) ────────────

describe("lore link/unlink — viewTask identity verification (LORE-177)", () => {
  test("link's pre-write validation refuses a task id whose resolved detail belongs to a different task, before any write", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const before = readDoc("stories/x.md");
    // A stub adapter that always answers with a DIFFERENT task's detail than whatever was asked
    // for — the exact shape `viewTask` must never be trusted blindly against (mirrors
    // reconcile-shared.test.ts's LORE-122 coverage of the same failure mode).
    const base = fakeAdapter([]);
    const mismatched: typeof base = {
      ...base,
      async viewTask(): Promise<BacklogTaskDetail | null> {
        return makeTask("LORE-999", { status: "Done", title: "Wrong task entirely" });
      },
    };

    const err = await expectLinkError(["stories/x", "lore-1"], mismatched);
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("lore-1");
    expect(err.message).toContain("LORE-999");
    expect(readDoc("stories/x.md")).toBe(before); // untouched — refused before any write
    expect(mismatched.calls).toHaveLength(0); // no back-ref edit either
  });

  test("link's back-ref edit refuses a task whose fresh re-read resolves to a different task, never borrowing its documentation", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    let viewCount = 0;
    const originalViewTask = adapter.viewTask.bind(adapter);
    adapter.viewTask = async (id: string) => {
      viewCount++;
      // 1st read: the up-front existence check — genuine. 2nd read: the back-ref edit's fresh
      // re-read — an adapter bug/id-collision hands back an entirely different task's detail.
      if (viewCount === 2) {
        return makeTask("LORE-999", { status: "Done", documentation: ["docs/other/wrong.md"] });
      }
      return originalViewTask(id);
    };

    const err = await expectLinkError(["stories/x", "lore-1"], adapter);
    expect(err.type).toBe("drift");
    const input = err.input as LinkReport;
    expect(input.tasks[0]).toMatchObject({ backRef: "failed" });
    expect(input.tasks[0]?.error).toContain("LORE-999");
    // Refusing the mismatched detail means no editTask call is ever made — lore-1's real
    // documentation/labels can never be overwritten with LORE-999's borrowed data.
    expect(adapter.calls).toHaveLength(0);
  });

  test("unlink refuses to remove a back-reference when the resolved detail belongs to a different task", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    const base = fakeAdapter([]);
    const mismatched: typeof base = {
      ...base,
      async viewTask(): Promise<BacklogTaskDetail | null> {
        return makeTask("LORE-999", {
          status: "Done",
          labels: ["doc:stories/x"],
          documentation: ["docs/other/wrong.md"],
        });
      },
    };

    const err = await expectUnlinkError(["stories/x", "lore-1"], mismatched);
    expect(err.type).toBe("drift");
    const input = err.input as UnlinkReport;
    expect(input.tasks[0]).toMatchObject({ backRef: "failed" });
    expect(input.tasks[0]?.error).toContain("LORE-999");
    // Refused before any editTask call — never computes a removal from LORE-999's borrowed labels/docs.
    expect(mismatched.calls).toHaveLength(0);
    // The doc-side tasks: removal is independent of the Backlog-side outcome and already happened.
    const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
    expect(concept.frontmatter.tasks).toEqual([]);
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

    const err = await expectLinkError(["stories/x", "lore-1"], adapter);
    expect(err.type).toBe("drift");
    const input = err.input as LinkReport;
    expect(input.tasks[0]).toMatchObject({ backRef: "failed" });
    expect(input.tasks[0]?.error).toContain("no longer exists");
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
    writeDoc("notes/release-notes,v2.md", "---\ntype: Story\n---\nBody.\n");
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

// ── runLink's up-front existence check: bounded concurrency (LORE-233) ────────────

describe("lore link — up-front existence check runs bounded, not fully unbounded (LORE-233)", () => {
  test("never runs more than TASK_DETAILS_CONCURRENCY viewTask calls in flight, saturates the cap, and a valid multi-id link still writes every back-reference (AC#1/#3/#4)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    // Comfortably more distinct ids than the cap, so the pool must refill at least twice — a
    // single unbounded burst (the pre-fix `Promise.allSettled(taskIds.map(...))` behavior) would
    // let `active` climb past the cap immediately instead of ever waiting on the gate below.
    const total = TASK_DETAILS_CONCURRENCY * 3 + 2;
    const ids = Array.from({ length: total }, (_, i) => `lore-${i}`);
    const adapter = fakeAdapter(ids.map((id) => makeTask(id.toUpperCase())));

    let active = 0;
    let peak = 0;
    let started = 0;
    // Every in-flight call blocks on this single shared gate, released only once the pool has
    // saturated at the cap — proving the pool actually overlaps that many calls, rather than
    // merely never happening (by luck of scheduling) to exceed the cap.
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const originalViewTask = adapter.viewTask.bind(adapter);
    adapter.viewTask = async (id: string) => {
      active++;
      peak = Math.max(peak, active);
      started++;
      if (started === TASK_DETAILS_CONCURRENCY) {
        releaseGate();
      }
      await gate;
      active--;
      return originalViewTask(id);
    };

    const { report } = await linkCmd(["stories/x", ...ids], adapter);

    expect(peak).toBeLessThanOrEqual(TASK_DETAILS_CONCURRENCY);
    expect(peak).toBe(TASK_DETAILS_CONCURRENCY); // the pool saturates — this isn't just trivially bounded
    expect(active).toBe(0); // every worker settled
    expect(report.tasks).toHaveLength(total);
    expect(report.tasks.every((t) => t.status === "added" && t.backRef === "added")).toBe(true);
    expect(adapter.calls).toHaveLength(total); // every task's back-reference was actually written
  });

  test("still reports the first invalid id in argument order under a fan-out larger than the cap", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const total = TASK_DETAILS_CONCURRENCY * 2 + 3;
    const ids = Array.from({ length: total }, (_, i) => `lore-${i}`);
    // Seed every id EXCEPT "lore-1" (the second in argument order), which stays not-found — the
    // first invalid id must still be reported even though it resolves well after the pool has
    // already moved past the first worker batch.
    const seeded = ids.filter((id) => id !== "lore-1");
    const adapter = fakeAdapter(seeded.map((id) => makeTask(id.toUpperCase())));

    const err = await expectLinkError(["stories/x", ...ids], adapter);
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("lore-1");
    expect(adapter.calls).toHaveLength(0); // no back-reference was ever written on a failed pre-check
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
  // makeTask("LORE-1")'s file path (helpers.ts) — the exact path the commit must scope itself to.
  const DIRTY_PATH = "backlog/tasks/lore-1 - title.md";
  const DIRTY = ` M ${DIRTY_PATH}`;

  test("link commits the doc: back-reference it just wrote, scoped to that one task file", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const git = dirtyGitSpawn(DIRTY);

    const { code, report } = await linkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK);
    expect(report.backlogCommit).toEqual({ committed: true, files: [DIRTY_PATH] });
    // SCOPED: `git status` queries only the edited task file (its `detail.file`), never all of
    // `backlog/` — so an unrelated dirty `backlog/` edit can never be swept in (ADR-0012 §1).
    // Each path is `:(literal)`-quoted so a wildcard in a filename can't glob-match a sibling.
    expect(git.calls[1]).toEqual([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      `:(literal)${DIRTY_PATH}`,
    ]);
    // Stages exactly that path and commits it with lore's own attributable message.
    expect(git.calls[2]).toEqual(["add", "--", `:(literal)${DIRTY_PATH}`]);
    expect(git.calls[3]).toEqual([
      "commit",
      "-m",
      "chore(backlog): add doc back-references (lore link)",
      "--",
      `:(literal)${DIRTY_PATH}`,
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

  test("a fully idempotent link (every id already linked) against a genuinely CLEAN tree is a true no-op (LORE-121 AC#3)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    // Already carries the label + --doc, so the edit is skipped (already-present) — a true no-op,
    // since the file itself is also clean on disk (never touched by a prior run either).
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/x"], documentation: ["docs/stories/x.md"] }),
    ]);
    const git = cleanGitSpawn();

    const { code, report } = await linkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK);
    expect(report.tasks[0]?.backRef).toBe("already-present");
    expect(report.backlogCommit).toEqual({ committed: false, files: [] });
  });

  test("a retry after a failed backlog/ commit recommits the still-dirty task file instead of silently no-opping (LORE-121 AC#1/#2)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    // Simulates a PRIOR `lore link` run: its Backlog edit (label + --doc) already succeeded — the
    // task already carries both — but that run's own `commitBacklogFiles` call failed (e.g. a
    // rejected pre-commit hook), leaving `DIRTY_PATH` uncommitted on disk. `wasPresent && !docChanged`
    // is true, so this retry skips the Backlog edit (rightly — it's already applied), but must still
    // discover and commit the leftover drift rather than reporting a false no-op success.
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/x"], documentation: ["docs/stories/x.md"] }),
    ]);
    const git = dirtyGitSpawn(DIRTY);

    const { code, report } = await linkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK);
    expect(report.tasks[0]?.backRef).toBe("already-present"); // no Backlog edit was needed or made
    expect(adapter.calls).toHaveLength(0); // confirms no editTask call — the drift is purely git-side
    expect(report.backlogCommit).toEqual({ committed: true, files: [DIRTY_PATH] }); // but it IS committed
    // Scoped to exactly lore-1's own file, same as a normal edit's commit — never a bundle-wide sweep.
    expect(git.calls[1]).toEqual([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      `:(literal)${DIRTY_PATH}`,
    ]);
    expect(git.calls[2]).toEqual(["add", "--", `:(literal)${DIRTY_PATH}`]);
    expect(git.calls[3]).toEqual([
      "commit",
      "-m",
      "chore(backlog): add doc back-references (lore link)",
      "--",
      `:(literal)${DIRTY_PATH}`,
    ]);
  });

  test("a partial back-ref failure still commits the successful writes and throws drift (LORE-58)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2")], { poisonEdits: ["lore-2"] });
    const git = dirtyGitSpawn(DIRTY);

    const err = await expectLinkError(["stories/x", "lore-1", "lore-2"], adapter, git);

    expect(err.type).toBe("drift"); // lore-2's edit failed
    const input = err.input as LinkReport;
    expect(input.backlogCommit.committed).toBe(true); // lore-1's successful write is still committed
    // Scoped to ONLY lore-1's file — lore-2 (failed, wrote nothing) is excluded from the commit, so a
    // read/write failure never drags an unrelated dirty backlog/ path into the commit.
    expect(git.calls[1]).toEqual([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ":(literal)backlog/tasks/lore-1 - title.md",
    ]);
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
      `:(literal)${DIRTY_PATH}`,
    ]);
  });

  test("unlink: an already-absent back-ref against a genuinely CLEAN tree is a true no-op (LORE-179 AC#3)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    // The task never carried the label/doc — already-absent, so the edit is skipped — and the file
    // itself is also clean on disk, so this stays a true no-op.
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const git = cleanGitSpawn();

    const { code, report } = await unlinkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK);
    expect(report.tasks[0]?.backRef).toBe("already-absent");
    expect(report.backlogCommit).toEqual({ committed: false, files: [] });
  });

  test("unlink: a retry after a failed backlog/ commit recommits the still-dirty task file instead of silently no-opping (LORE-179 AC#1)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    // Simulates a PRIOR `lore unlink` run: its Backlog edit (label + --doc removal) already
    // succeeded — the task already carries neither — but that run's own `commitBacklogFiles` call
    // failed (e.g. a rejected pre-commit hook), leaving `DIRTY_PATH` uncommitted on disk.
    // `!hadLabel && !hadDoc` is true, so this retry skips the Backlog edit (rightly — it's already
    // applied), but must still discover and commit the leftover drift rather than reporting a false
    // no-op success.
    const adapter = fakeAdapter([makeTask("LORE-1")]); // no label, no documentation — already absent
    const git = dirtyGitSpawn(DIRTY);

    const { code, report } = await unlinkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK);
    expect(report.tasks[0]?.backRef).toBe("already-absent"); // no Backlog edit was needed or made
    expect(adapter.calls).toHaveLength(0); // confirms no editTask call — the drift is purely git-side
    expect(report.backlogCommit).toEqual({ committed: true, files: [DIRTY_PATH] }); // but it IS committed
    // Scoped to exactly lore-1's own file, same as a normal edit's commit — never a bundle-wide sweep.
    expect(git.calls[1]).toEqual([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      `:(literal)${DIRTY_PATH}`,
    ]);
    expect(git.calls[2]).toEqual(["add", "--", `:(literal)${DIRTY_PATH}`]);
    expect(git.calls[3]).toEqual([
      "commit",
      "-m",
      "chore(backlog): remove doc back-references (lore unlink)",
      "--",
      `:(literal)${DIRTY_PATH}`,
    ]);
  });

  // `moveBackRefs` is `lore rename`'s back-reference-move engine (called by `commands/rename.ts`,
  // exercised end-to-end in `rename.test.ts`) but this file is the single owner of the
  // `doc:<conceptId>` coupling contract it implements, so its "already fully migrated" no-edit
  // outcome is unit-tested directly here, alongside its `runLink`/`runUnlink` siblings.
  test("moveBackRefs: a retry after a failed backlog/ commit surfaces the still-dirty task file as a commit candidate instead of silently no-opping (LORE-179 AC#2)", async () => {
    // Simulates a PRIOR `lore rename` run: its Backlog edit (new label + doc, old label/doc
    // removed) already succeeded — the task is already fully migrated to the new id/path — but
    // that run's own `commitBacklogFiles` call failed, leaving the task's file uncommitted on
    // disk. The "already fully migrated" branch must surface the file as a commit candidate
    // rather than silently no-opping; `commands/rename.ts` forwards `editedFiles` straight into
    // `commitBacklogFiles`, whose own `git status` (dirty, per the retry premise, or clean — see
    // rename.test.ts's paired "genuinely CLEAN tree" test, LORE-179 AC#3) is what actually decides
    // whether to stage and commit it — `moveBackRefs` itself never touches git.
    const adapter = fakeAdapter([
      makeTask("LORE-1", { labels: ["doc:stories/y"], documentation: ["docs/stories/y.md"] }),
    ]);

    const { outcomes, editedFiles } = await moveBackRefs(
      adapter,
      ["lore-1"],
      "stories/x",
      "stories/y",
      "docs/stories/x.md",
      "docs/stories/y.md",
    );

    expect(outcomes).toEqual([{ task: "lore-1", backRef: "already-current" }]);
    expect(adapter.calls).toHaveLength(0); // confirms no editTask call — a retry makes none
    expect(editedFiles).toEqual(["backlog/tasks/lore-1 - title.md"]); // but IS a commit candidate
  });

  test("moveBackRefs: a task never given a back-ref at all contributes no commit candidate (unlike the fully-migrated retry case)", async () => {
    // No trace of this concept's back-reference, old or new — e.g. linked with `--no-back-ref`.
    // Unlike the fully-migrated case above, no prior run of THIS move could ever have applied an
    // edit here, so there is no leftover drift of this kind for it to hide — must NOT be pushed as
    // a candidate (would risk sweeping in an unrelated dirty edit on a task this move never touched).
    const adapter = fakeAdapter([makeTask("LORE-1")]); // no labels, no documentation at all

    const { outcomes, editedFiles } = await moveBackRefs(
      adapter,
      ["lore-1"],
      "stories/x",
      "stories/y",
      "docs/stories/x.md",
      "docs/stories/y.md",
    );

    expect(outcomes).toEqual([{ task: "lore-1", backRef: "already-current" }]);
    expect(editedFiles).toEqual([]);
  });

  test("a successfully-edited task with an empty file path is skipped, never passed as an empty git pathspec", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    // filePathRelative is nullable/possibly-empty (backlog.ts) — a "" path must not become an empty
    // git pathspec (`git status -- ""` is a fatal error). The truthy guard skips it entirely.
    const adapter = fakeAdapter([makeTask("LORE-1", { file: "" })]);
    const git = dirtyGitSpawn(DIRTY);

    const { code, report } = await linkCmd(["stories/x", "lore-1"], adapter, git);

    expect(code).toBe(EXIT_OK); // the link itself succeeds — no drift(6) from an empty pathspec
    expect(report.tasks[0]?.backRef).toBe("added");
    expect(report.backlogCommit).toEqual({ committed: false, files: [] }); // no usable path → nothing committed
    expect(git.calls).toHaveLength(0); // git is never invoked (empty editedFiles)
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
      "lore-1: tasks: added, back-ref: added\ndocs/stories/x.md: updated\ncommitted backlog/: 1 file\n",
    );
  });

  test("a git commit failure routes through the same drift ErrorEnvelope as a failed edit (LORE-58): the successful edit's outcome survives in input.tasks", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    // The back-ref edit succeeds but `git commit` is rejected (e.g. a pre-commit hook). The failure
    // is captured into backlogCommit.error, and the per-task outcome is still named — but since
    // LORE-58, both live in the thrown error's `input`, not a stdout envelope.
    const err = await expectLinkError(["stories/x", "lore-1"], adapter, failingCommitGitSpawn(DIRTY));

    expect(err.type).toBe("drift");
    const input = err.input as LinkReport;
    expect(input.tasks[0]?.backRef).toBe("added"); // the back-ref write happened and is reported
    expect(input.backlogCommit.committed).toBe(false);
    expect(input.backlogCommit.error).toContain("could not commit backlog/");
    expect(err.hint).toContain("backlog/ commit:");
  });

  test("a drift failure throws identically under plain output mode too — stdout stays empty either way (LORE-58)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);
    const stdout = capture();

    let thrown: unknown;
    try {
      await runLink({
        root,
        output: PLAIN_CTX,
        args: ["stories/x", "lore-1"],
        stdout,
        stderr: capture(),
        adapter,
        gitSpawn: failingCommitGitSpawn(DIRTY),
      });
    } catch (err) {
      thrown = err;
    }

    // stdout parses or stays silent (cli-contract §4) regardless of output mode — no partial-success
    // text leaks out under plain mode either. Rendering the thrown LoreError for stderr (plain text vs
    // --json envelope) is the CLI dispatch layer's job (reportError/formatErrorText), not runLink's.
    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("drift");
    expect(stdout.text()).toBe("");
  });
});

describe("lore link/unlink — reserved-stem non-concept files stay silent (LORE-258)", () => {
  // `docs/log.md` and a child `index.md` are lore's own machine-generated hubs, always
  // frontmatter-less — loadBundle used to warn "no frontmatter mapping" for them on every
  // link/unlink run, spurious noise `lore check` never raised for the same bundle. Only the
  // two reserved stems (index/log) go quiet; a genuinely unexpected non-concept file still warns.
  test("lore link emits no advisory for docs/log.md or a child docs/adr/index.md", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    writeDoc("log.md", "# Generated changelog, no frontmatter\n");
    writeDoc("adr/index.md", "# Generated hub, no frontmatter\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const { code } = await linkCmd(["stories/x", "lore-1"], adapter);
    expect(code).toBe(EXIT_OK);
  });

  test("lore link/unlink still warn about a genuinely unexpected non-concept file (not a reserved stem)", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
    writeDoc("stray.md", "# Unexpected, no frontmatter\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const stderr = capture();
    const code = await runLink({ ...opts(["stories/x", "lore-1"], adapter), stderr });
    expect(code).toBe(EXIT_OK);
    expect(stderr.text()).toContain("skipping stray.md: no frontmatter mapping");
  });

  test("lore unlink emits no advisory for docs/log.md or a child docs/adr/index.md", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
    writeDoc("log.md", "# Generated changelog, no frontmatter\n");
    writeDoc("adr/index.md", "# Generated hub, no frontmatter\n");
    const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/x"] })]);

    const stderr = capture();
    const code = await runUnlink({ ...opts(["stories/x", "lore-1"], adapter), stderr });
    expect(code).toBe(EXIT_OK);
    expect(stderr.text()).not.toContain("no frontmatter mapping");
  });
});
