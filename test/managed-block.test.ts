/**
 * managed-block.test.ts — the pure `lore:tasks` managed-region engine (LORE-22, ADR-0008).
 *
 * The two acceptance criteria are exercised directly:
 *   AC#1 — regenerating an already-current block reproduces BYTE-IDENTICAL output (idempotent; a
 *          no-op `lore sync` touches zero bytes and the `lore check` drift gate stays trustworthy).
 *   AC#2 — each row link resolves to the correct task file, computed from the JSON `filePathRelative`
 *          (never reconstructed from the upper-cased display id), portable and cross-subtree.
 *
 * Plus the boundary/validation guarantees ADR-0008 §§1–2 require: structural marker location (a
 * sentinel inside a code fence is never a marker), out-of-region bytes preserved verbatim, and
 * malformed markers as a fail-loud `LoreError` (validation, exit 6).
 */

import { describe, expect, test } from "bun:test";
import { type ManagedTaskRow, regenerateTaskBlock, TASK_BLOCK_BEGIN, TASK_BLOCK_END } from "../src/core/managed-block";
import { exitCodeFor, LoreError } from "../src/errors";

const OPTS = { docPath: "docs/stories/bulk-archive.md" };

/** A row with a real on-disk task file (the common case). */
function row(id: string, title: string, status: string, file: string): ManagedTaskRow {
  return { id, title, status, file };
}

/** Wrap table/paragraph lines in the canonical managed block, marker-to-marker. */
function block(...lines: string[]): string {
  return `${TASK_BLOCK_BEGIN}\n${lines.join("\n")}\n${TASK_BLOCK_END}`;
}

/** A minimal Story doc: frontmatter + prose + an empty managed block + trailing prose. */
function doc(inner = ""): string {
  const region = inner === "" ? `${TASK_BLOCK_BEGIN}\n${TASK_BLOCK_END}` : block(inner);
  return `---\ntype: Story\ntitle: Bulk archive\n---\n\n# Bulk archive\n\nIntro prose.\n\n${region}\n\nOutro prose.\n`;
}

/** Run the thunk and return the {@link LoreError} it throws, failing the test if it does not throw. */
function loreError(run: () => unknown): LoreError {
  try {
    run();
  } catch (err) {
    if (err instanceof LoreError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected a LoreError to be thrown, but it returned");
}

const TASKS: ManagedTaskRow[] = [
  row("LORE-42", "Bulk archive", "Done", "backlog/tasks/lore-42 - Bulk archive.md"),
  row("LORE-7", "Add filters", "In Progress", "backlog/tasks/lore-7 - Add-filters.md"),
];

describe("regenerateTaskBlock — table rendering (AC#2)", () => {
  test("renders one row per task in the frozen `| [id](link) | title | status |` format", () => {
    const out = regenerateTaskBlock(doc(), TASKS, OPTS);
    expect(out).toContain(
      block(
        "| Task | Title | Status |",
        "|---|---|---|",
        "| [LORE-42](../../backlog/tasks/lore-42%20-%20Bulk%20archive.md) | Bulk archive | Done |",
        "| [LORE-7](../../backlog/tasks/lore-7%20-%20Add-filters.md) | Add filters | In Progress |",
      ),
    );
  });

  test("AC#2: the link comes from filePathRelative, not the upper-cased display id (upper id, lower file)", () => {
    const out = regenerateTaskBlock(doc(), [TASKS[0] as ManagedTaskRow], OPTS);
    // Display id stays `LORE-42`; the target is the lower-cased on-disk filename, %20-encoded, cross-subtree.
    expect(out).toContain("[LORE-42](../../backlog/tasks/lore-42%20-%20Bulk%20archive.md)");
    // It must NOT reconstruct a filename from the id.
    expect(out).not.toContain("LORE-42.md");
  });

  test("row order follows the caller's order, not any internal sort", () => {
    const reversed = [TASKS[1], TASKS[0]] as ManagedTaskRow[];
    const out = regenerateTaskBlock(doc(), reversed, OPTS);
    expect(out.indexOf("LORE-7")).toBeLessThan(out.indexOf("LORE-42"));
  });

  test("a sibling-tree doc links a task with the correct relative arithmetic", () => {
    const out = regenerateTaskBlock(doc(), [TASKS[0] as ManagedTaskRow], { docPath: "docs/x.md" });
    expect(out).toContain("[LORE-42](../backlog/tasks/lore-42%20-%20Bulk%20archive.md)");
  });

  test("empty task list renders the frozen `_No linked tasks._` paragraph", () => {
    const out = regenerateTaskBlock(doc(), [], OPTS);
    expect(out).toContain(block("_No linked tasks._"));
    expect(out).not.toContain("| Task |");
  });
});

describe("regenerateTaskBlock — tolerance and cell hardening", () => {
  test("a null file (task absent on this branch) renders the id as plain text, never a broken link or an error", () => {
    const out = regenerateTaskBlock(
      doc(),
      [{ id: "LORE-99", title: "Not written yet", status: "To Do", file: null }],
      OPTS,
    );
    expect(out).toContain("| LORE-99 | Not written yet | To Do |");
    expect(out).not.toContain("[LORE-99]");
  });

  test("a pipe in a cell is escaped so it cannot open a spurious column", () => {
    const out = regenerateTaskBlock(doc(), [row("LORE-1", "a | b", "Done", "backlog/tasks/lore-1 - x.md")], OPTS);
    expect(out).toContain("| a \\| b | Done |");
  });

  test("brackets in the link-text id are escaped so they cannot break the `[text](…)` syntax", () => {
    const out = regenerateTaskBlock(doc(), [row("A[1]", "T", "Done", "backlog/tasks/a-1.md")], OPTS);
    expect(out).toContain("[A\\[1\\]](../../backlog/tasks/a-1.md)");
  });

  test("a newline in a title is collapsed to a single line", () => {
    const out = regenerateTaskBlock(
      doc(),
      [row("LORE-1", "line one\nline two", "Done", "backlog/tasks/lore-1 - x.md")],
      OPTS,
    );
    expect(out).toContain("| line one line two | Done |");
    expect(out).not.toContain("line one\nline two");
  });

  test("a comment sentinel embedded in a title is neutralized so it cannot be mistaken for a boundary", () => {
    const out = regenerateTaskBlock(
      doc(),
      [row("LORE-1", "danger <!-- lore:tasks:end -->", "Done", "backlog/tasks/lore-1 - x.md")],
      OPTS,
    );
    expect(out).toContain("danger &lt;!-- lore:tasks:end --&gt;");
    // The regenerated body still has exactly one real end marker (the neutralized one is not counted).
    expect(out.match(/<!-- lore:tasks:end -->/g)?.length).toBe(1);
  });
});

describe("regenerateTaskBlock — idempotency and boundary safety (AC#1)", () => {
  test("AC#1: regenerating an already-current block is byte-identical (a fixpoint)", () => {
    const first = regenerateTaskBlock(doc(), TASKS, OPTS);
    const second = regenerateTaskBlock(first, TASKS, OPTS);
    expect(second).toBe(first);
  });

  test("AC#1: the empty-list block is also a fixpoint", () => {
    const first = regenerateTaskBlock(doc(), [], OPTS);
    expect(regenerateTaskBlock(first, [], OPTS)).toBe(first);
  });

  test("every byte outside the markers — frontmatter, modeline, and prose — is preserved verbatim", () => {
    const withModeline =
      "---\ntype: Story\n---\n<!-- editor-modeline: keep me -->\n\n# Title\n\nAuthored **prose** with a [link](../ref/x.md).\n\n" +
      `${TASK_BLOCK_BEGIN}\nstale\n${TASK_BLOCK_END}\n\nTrailing.\n`;
    const out = regenerateTaskBlock(withModeline, [TASKS[0] as ManagedTaskRow], OPTS);
    const before = withModeline.slice(0, withModeline.indexOf(TASK_BLOCK_BEGIN) + TASK_BLOCK_BEGIN.length);
    const after = withModeline.slice(withModeline.indexOf(TASK_BLOCK_END));
    expect(out.startsWith(before)).toBe(true);
    expect(out.endsWith(after)).toBe(true);
  });

  test("markers nested in a fenced code block are structural non-markers and are left untouched", () => {
    const withFence =
      `${TASK_BLOCK_BEGIN}\nstale\n${TASK_BLOCK_END}\n\n` +
      "```markdown\n" +
      `${TASK_BLOCK_BEGIN}\nexample in a doc\n${TASK_BLOCK_END}\n` +
      "```\n";
    const out = regenerateTaskBlock(withFence, [], OPTS);
    // Only the real top-level block was regenerated; the fenced example survives byte-for-byte.
    expect(out).toContain("```markdown\n" + `${TASK_BLOCK_BEGIN}\nexample in a doc\n${TASK_BLOCK_END}\n` + "```");
    expect(out).toContain(block("_No linked tasks._"));
    expect(regenerateTaskBlock(out, [], OPTS)).toBe(out); // still a fixpoint with the fence present
  });

  test("the whitespace-tolerant sentinel form (`<!--lore:tasks:begin-->`) is recognized", () => {
    const tight = "# T\n\n<!--lore:tasks:begin-->\nstale\n<!--lore:tasks:end-->\n";
    const out = regenerateTaskBlock(tight, [], OPTS);
    expect(out).toContain("_No linked tasks._");
    // The author's marker bytes are preserved (only the region between them is spliced).
    expect(out).toContain("<!--lore:tasks:begin-->");
    expect(out).toContain("<!--lore:tasks:end-->");
  });
});

describe("regenerateTaskBlock — marker validation (ADR-0008 §2 → validation, exit 6)", () => {
  test("no markers at all is a fail-loud validation error", () => {
    const err = loreError(() => regenerateTaskBlock("# Just prose, no block.\n", TASKS, OPTS));
    expect(err.type).toBe("validation");
    expect(exitCodeFor(err)).toBe(6);
    expect(err.message).toContain("missing");
  });

  test("an unbalanced pair (begin without end) is a validation error", () => {
    const err = loreError(() => regenerateTaskBlock(`# T\n\n${TASK_BLOCK_BEGIN}\nrows\n`, TASKS, OPTS));
    expect(err.type).toBe("validation");
  });

  test("a duplicated block (two begins) is a validation error", () => {
    const dup = `${TASK_BLOCK_BEGIN}\na\n${TASK_BLOCK_END}\n\n${TASK_BLOCK_BEGIN}\nb\n${TASK_BLOCK_END}\n`;
    const err = loreError(() => regenerateTaskBlock(dup, TASKS, OPTS));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("duplicated");
  });

  test("crossed markers (end before begin) are a validation error", () => {
    const crossed = `${TASK_BLOCK_END}\n\nmid\n\n${TASK_BLOCK_BEGIN}\n`;
    const err = loreError(() => regenerateTaskBlock(crossed, TASKS, OPTS));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("crossed");
  });
});
