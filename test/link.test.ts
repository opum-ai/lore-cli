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

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter, BacklogTaskDetail, EditTaskPatch } from "../src/adapters/backlog";
import { type LinkOptions, type LinkReport, runLink, runUnlink, type UnlinkReport } from "../src/commands/link";
import { parseConcept } from "../src/core/concept";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

// ── Fixture bundle ──────────────────────────────────────────────────────────────

let root: string;

function freshRoot(): string {
  const r = mktempRoot();
  mkdirSync(join(r, "docs"), { recursive: true });
  return r;
}

function mktempRoot(): string {
  return mkdtempSync(join(tmpdir(), "lore-link-"));
}

function writeDoc(rel: string, contents: string): void {
  const abs = join(root, "docs", rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

function readDoc(rel: string): string {
  return readFileSync(join(root, "docs", rel), "utf8");
}

// ── Fake adapter ─────────────────────────────────────────────────────────────────

/** A recorded `editTask` call, for assertions. */
interface EditCall {
  readonly id: string;
  readonly patch: EditTaskPatch;
}

/** Build a minimal {@link BacklogTaskDetail}, overriding only the fields a test cares about. */
function makeTask(id: string, overrides: Partial<BacklogTaskDetail> = {}): BacklogTaskDetail {
  return {
    id,
    title: `Title for ${id}`,
    status: "To Do",
    priority: null,
    ordinal: null,
    assignees: [],
    labels: [],
    milestone: null,
    parentTaskId: null,
    file: `backlog/tasks/${id.toLowerCase()} - title.md`,
    reporter: null,
    createdDate: "2026-01-01T00:00:00Z",
    updatedDate: null,
    dependencies: [],
    references: [],
    documentation: [],
    modifiedFiles: [],
    parentTaskTitle: null,
    subtasks: [],
    acceptanceCriteria: [],
    definitionOfDone: [],
    description: null,
    implementationPlan: null,
    implementationNotes: null,
    finalSummary: null,
    comments: [],
    source: null,
    branch: null,
    ...overrides,
  };
}

/** An in-memory {@link BacklogAdapter} fake: `viewTask` reads a seeded map (case-insensitive), `editTask` mutates it and records the call. Every other method throws — link/unlink never call them. */
function fakeAdapter(
  seed: readonly BacklogTaskDetail[],
  opts: { poisonEdits?: readonly string[] } = {},
): BacklogAdapter & { calls: EditCall[] } {
  const tasks = new Map<string, BacklogTaskDetail>();
  for (const t of seed) {
    tasks.set(t.id.toLowerCase(), t);
  }
  const poison = new Set((opts.poisonEdits ?? []).map((id) => id.toLowerCase()));
  const calls: EditCall[] = [];
  const notImplemented = (name: string) => (): never => {
    throw new Error(`fakeAdapter: ${name} is not implemented (link/unlink never call it)`);
  };
  return {
    probe: notImplemented("probe"),
    listTasks: notImplemented("listTasks"),
    searchByLabel: notImplemented("searchByLabel"),
    searchTasks: notImplemented("searchTasks"),
    createTask: notImplemented("createTask"),
    calls,
    async viewTask(id: string): Promise<BacklogTaskDetail | null> {
      return tasks.get(id.toLowerCase()) ?? null;
    },
    async editTask(id: string, patch: EditTaskPatch): Promise<void> {
      calls.push({ id, patch });
      if (poison.has(id.toLowerCase())) {
        throw new Error(`simulated Backlog failure editing ${id}`);
      }
      const existing = tasks.get(id.toLowerCase());
      if (existing === undefined) {
        throw new LoreError("not_found", `task "${id}" not found`, "");
      }
      const labels = new Set(existing.labels.map((l) => l.toLowerCase()));
      const byLower = new Map(existing.labels.map((l) => [l.toLowerCase(), l]));
      for (const add of patch.addLabels ?? []) {
        if (!labels.has(add.toLowerCase())) {
          labels.add(add.toLowerCase());
          byLower.set(add.toLowerCase(), add);
        }
      }
      for (const remove of patch.removeLabels ?? []) {
        labels.delete(remove.toLowerCase());
        byLower.delete(remove.toLowerCase());
      }
      const nextLabels = [...labels].map((l) => byLower.get(l) as string);
      const nextDocs = patch.doc !== undefined ? [...patch.doc] : existing.documentation;
      tasks.set(id.toLowerCase(), { ...existing, labels: nextLabels, documentation: nextDocs });
    },
  };
}

function opts(args: string[], adapter: BacklogAdapter): LinkOptions {
  return { root, output: JSON_CTX, args, stdout: capture(), stderr: capture(), adapter };
}

async function linkCmd(args: string[], adapter: BacklogAdapter): Promise<{ code: number; report: LinkReport }> {
  const stdout = capture();
  const code = await runLink({ ...opts(args, adapter), stdout });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: LinkReport };
  expect(envelope.kind).toBe("link.result");
  return { code, report: envelope.data };
}

async function unlinkCmd(args: string[], adapter: BacklogAdapter): Promise<{ code: number; report: UnlinkReport }> {
  const stdout = capture();
  const code = await runUnlink({ ...opts(args, adapter), stdout });
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

// ── Setup ────────────────────────────────────────────────────────────────────────

function reset(): void {
  root = freshRoot();
}

function cleanup(): void {
  rmSync(root, { recursive: true, force: true });
}

// ── AC#1: link wires tasks: + doc: label + --doc ──────────────────────────────────

describe("lore link — wiring (AC#1)", () => {
  test("adds the task id to tasks: and the doc: label + --doc to the task", async () => {
    reset();
    try {
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
    } finally {
      cleanup();
    }
  });

  test("preserves an existing unrelated documentation entry on the task (--doc is SET/REPLACE)", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-42", { documentation: ["docs/other/y.md"] })]);

      await linkCmd(["stories/x", "lore-42"], adapter);

      expect(adapter.calls[0]?.patch.doc).toEqual(["docs/other/y.md", "docs/stories/x.md"]);
    } finally {
      cleanup();
    }
  });

  test("appends to an existing tasks: list without duplicating", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-1\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-42")]);

      const { report } = await linkCmd(["stories/x", "lore-42"], adapter);
      expect(report.changed).toBe(true);

      const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
      expect(concept.frontmatter.tasks).toEqual(["task-1", "lore-42"]);
    } finally {
      cleanup();
    }
  });

  test("is idempotent: re-linking an already-linked task writes no doc bytes", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-42\n---\nBody.\n");
      const before = readDoc("stories/x.md");
      const adapter = fakeAdapter([makeTask("TASK-42", { labels: ["doc:stories/x"] })]);

      const { report } = await linkCmd(["stories/x", "task-42"], adapter);
      expect(report.changed).toBe(false);
      expect(report.tasks).toEqual([{ task: "task-42", status: "already-linked", backRef: "already-present" }]);
      expect(readDoc("stories/x.md")).toBe(before);
    } finally {
      cleanup();
    }
  });

  test("matches an existing id case-insensitively (ADR-0009: ids compared case-insensitively)", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - task-42\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("TASK-42")]);

      const { report } = await linkCmd(["stories/x", "TASK-42"], adapter);
      expect(report.tasks[0]?.status).toBe("already-linked");
      const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
      expect(concept.frontmatter.tasks).toEqual(["task-42"]); // not duplicated as a second, differently-cased entry
    } finally {
      cleanup();
    }
  });

  test("dedupes repeated task ids in one invocation, case-insensitively", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-42")]);

      const { report } = await linkCmd(["stories/x", "lore-42", "LORE-42"], adapter);
      expect(report.tasks).toHaveLength(1);
      expect(adapter.calls).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  test("--no-back-ref skips the Backlog-side edit entirely", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-42")]);

      const { report } = await linkCmd(["stories/x", "lore-42", "--no-back-ref"], adapter);
      expect(report.tasks).toEqual([{ task: "lore-42", status: "added", backRef: "skipped" }]);
      expect(adapter.calls).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test("links multiple task ids in one invocation", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2")]);

      const { report } = await linkCmd(["stories/x", "lore-1", "lore-2"], adapter);
      expect(report.tasks.map((t) => t.task)).toEqual(["lore-1", "lore-2"]);
      const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
      expect(concept.frontmatter.tasks).toEqual(["lore-1", "lore-2"]);
    } finally {
      cleanup();
    }
  });

  test("a missing task id fails loud before any write (exit 3, no partial edit)", async () => {
    reset();
    try {
      const before = "---\ntype: Story\n---\nBody.\n";
      writeDoc("stories/x.md", before);
      const adapter = fakeAdapter([makeTask("LORE-1")]);

      const err = await expectLinkError(["stories/x", "lore-1", "lore-999"], adapter);
      expect(err.type).toBe("not_found");
      expect(readDoc("stories/x.md")).toBe(before); // untouched — validation ran before any write
      expect(adapter.calls).toHaveLength(0); // no back-ref edits either
    } finally {
      cleanup();
    }
  });

  test("a missing concept id fails loud (exit 3)", async () => {
    reset();
    try {
      const adapter = fakeAdapter([makeTask("LORE-1")]);
      const err = await expectLinkError(["stories/missing", "lore-1"], adapter);
      expect(err.type).toBe("not_found");
    } finally {
      cleanup();
    }
  });

  test("usage errors: missing concept id, missing task ids, unknown flag", async () => {
    reset();
    try {
      const adapter = fakeAdapter([]);
      expect((await expectLinkError([], adapter)).type).toBe("usage");
      expect((await expectLinkError(["stories/x"], adapter)).type).toBe("usage");
      expect((await expectLinkError(["stories/x", "lore-1", "--bogus"], adapter)).type).toBe("usage");
    } finally {
      cleanup();
    }
  });
});

// ── AC#2: unlink removes both sides cleanly ───────────────────────────────────────

describe("lore unlink — removal (AC#2)", () => {
  test("removes the task id from tasks: and the doc: label + shrinks --doc on the task", async () => {
    reset();
    try {
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
        patch: { removeLabels: ["doc:stories/x"], doc: undefined },
      });
    } finally {
      cleanup();
    }
  });

  test("preserves a different doc's reference while removing this one", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1", { documentation: ["docs/stories/x.md", "docs/other/y.md"] })]);

      await unlinkCmd(["stories/x", "lore-1"], adapter);

      expect(adapter.calls[0]?.patch.doc).toEqual(["docs/other/y.md"]);
    } finally {
      cleanup();
    }
  });

  test("omits --doc entirely when the remaining set would be empty (Backlog cannot clear via empty)", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1", { documentation: ["docs/stories/x.md"] })]);

      await unlinkCmd(["stories/x", "lore-1"], adapter);

      expect(adapter.calls[0]?.patch.doc).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  test("tolerates a task id no longer present in Backlog: doc-side cleaned, back-ref skipped, no throw", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n  - lore-999\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1")]);

      const { code, report } = await unlinkCmd(["stories/x", "lore-999"], adapter);
      expect(code).toBe(EXIT_OK);
      expect(report.tasks).toEqual([{ task: "lore-999", status: "removed", backRef: "skipped" }]);
      expect(adapter.calls).toHaveLength(0);

      const concept = parseConcept("stories/x.md", readDoc("stories/x.md"));
      expect(concept.frontmatter.tasks).toEqual(["lore-1"]);
    } finally {
      cleanup();
    }
  });

  test("is idempotent: unlinking a task not currently linked writes no doc bytes, but still self-heals a stray label", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
      const before = readDoc("stories/x.md");
      const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/x"] })]);

      const { report } = await unlinkCmd(["stories/x", "lore-1"], adapter);
      expect(report.tasks).toEqual([{ task: "lore-1", status: "not-linked", backRef: "removed" }]);
      expect(readDoc("stories/x.md")).toBe(before);
      expect(adapter.calls).toHaveLength(1); // the stray label is still cleaned up
    } finally {
      cleanup();
    }
  });

  test("--no-back-ref leaves the doc: label on the task", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1", { labels: ["doc:stories/x"] })]);

      const { report } = await unlinkCmd(["stories/x", "lore-1", "--no-back-ref"], adapter);
      expect(report.tasks).toEqual([{ task: "lore-1", status: "removed", backRef: "skipped" }]);
      expect(adapter.calls).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test("a missing concept id fails loud (exit 3) — unlink's only failure case", async () => {
    reset();
    try {
      const adapter = fakeAdapter([]);
      try {
        await runUnlink(opts(["stories/missing", "lore-1"], adapter));
        throw new Error("expected a LoreError");
      } catch (err) {
        expect(err).toBeInstanceOf(LoreError);
        expect((err as LoreError).type).toBe("not_found");
      }
    } finally {
      cleanup();
    }
  });
});

// ── Misc: plain-text rendering, scalar frontmatter, parser edge cases ─────────────

describe("lore link/unlink — plain rendering and parser edge cases", () => {
  test("plain mode renders one line per task plus a summary line", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1")]);
      const stdout = capture();

      await runLink({ root, output: PLAIN_CTX, args: ["stories/x", "lore-1"], stdout, stderr: capture(), adapter });
      expect(stdout.text()).toBe("lore-1: added (doc), back-ref added\ndocs/stories/x.md: updated\n");
    } finally {
      cleanup();
    }
  });

  test("plain mode renders unlink's report the same way", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1")]);
      const stdout = capture();

      await runUnlink({ root, output: PLAIN_CTX, args: ["stories/x", "lore-1"], stdout, stderr: capture(), adapter });
      expect(stdout.text()).toBe("lore-1: removed (doc), back-ref already-absent\ndocs/stories/x.md: updated\n");
    } finally {
      cleanup();
    }
  });

  test("reads a bare-scalar tasks: authored value as a single-element list (an undeclared field on a non-Story type is unvalidated passthrough)", async () => {
    reset();
    try {
      // `Reference` declares no `tasks` field, so it's an unvalidated passthrough key — unlike
      // `Story`'s schema-enforced array, a hand-authored scalar here is exactly what
      // frontmatterList's scalar-tolerance branch exists for.
      writeDoc("reference/x.md", "---\ntype: Reference\ntasks: task-1\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-2")]);

      const { report } = await linkCmd(["reference/x", "lore-2"], adapter);
      expect(report.changed).toBe(true);
      const concept = parseConcept("reference/x.md", readDoc("reference/x.md"));
      expect(concept.frontmatter.tasks).toEqual(["task-1", "lore-2"]);
    } finally {
      cleanup();
    }
  });

  test("a `--` end-of-options marker treats every following token as a positional", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1")]);

      const { report } = await linkCmd(["stories/x", "--", "lore-1"], adapter);
      expect(report.tasks[0]?.task).toBe("lore-1");
    } finally {
      cleanup();
    }
  });

  test("a bare single-dash unknown flag is a usage error", async () => {
    reset();
    try {
      const adapter = fakeAdapter([]);
      const err = await expectLinkError(["stories/x", "-z"], adapter);
      expect(err.type).toBe("usage");
    } finally {
      cleanup();
    }
  });
});

// ── Resilience: a per-task Backlog failure never aborts or corrupts the rest ──────

describe("lore link/unlink — per-task back-ref resilience", () => {
  test("link: one poisoned task's back-ref fails, the other still succeeds, doc-side write includes both, exit is drift (6)", async () => {
    reset();
    try {
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
    } finally {
      cleanup();
    }
  });

  test("unlink: one poisoned task's back-ref fails, the other still succeeds, doc-side removal includes both, exit is drift (6)", async () => {
    reset();
    try {
      writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n  - lore-2\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1"), makeTask("LORE-2")], { poisonEdits: ["lore-2"] });

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
    } finally {
      cleanup();
    }
  });

  test("a single WarningCollector flush: a load advisory is printed to stderr exactly once, not twice", async () => {
    reset();
    try {
      // A Story with no `summary` triggers a `loadBundle` advisory.
      writeDoc("stories/x.md", "---\ntype: Story\ntitle: X\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-1")]);
      const stderr = capture();

      await runLink({ root, output: JSON_CTX, args: ["stories/x", "lore-1"], stdout: capture(), stderr, adapter });

      const occurrences = stderr.text().split("missing `summary`").length - 1;
      expect(occurrences).toBe(1);
    } finally {
      cleanup();
    }
  });

  test("a non-string tasks: entry (a YAML-coerced number, on a type with no schema-declared tasks field) is preserved, not silently dropped", async () => {
    reset();
    try {
      // `Reference` declares no `tasks` field, so a numeric entry is unvalidated passthrough —
      // exactly the case toRefList's scalar coercion (shared with rewrite.ts's ref handling) exists for.
      writeDoc("reference/x.md", "---\ntype: Reference\ntasks:\n  - 42\n  - task-2\n---\nBody.\n");
      const adapter = fakeAdapter([makeTask("LORE-3")]);

      const { report } = await linkCmd(["reference/x", "lore-3"], adapter);
      expect(report.changed).toBe(true);
      const concept = parseConcept("reference/x.md", readDoc("reference/x.md"));
      expect(concept.frontmatter.tasks).toEqual(["42", "task-2", "lore-3"]);
    } finally {
      cleanup();
    }
  });
});
