/**
 * sync.test.ts — `lore sync` (LORE-26, cli-surface §sync).
 *
 * Most cases inject a fake `BacklogAdapter` (helpers.ts), a fake `GitAdapter`/`resolveHead` (so
 * `log.md` regeneration needs no real git history), and a scripted `GitSpawn` (so the `backlog/`
 * commit step needs no real subprocess) — fast and deterministic. A final "real git integration"
 * suite proves the actual seams (`bunGitSpawn`, `realGitAdapter`, `resolveHeadSha`) and the CLI
 * router wiring end to end.
 *
 *   AC#1 — idempotent: a second sync makes no changes.
 *   AC#2 — lore is the sole committer of backlog/ (satisfied here, per the locked decision, by
 *          sync vacuuming up whatever is dirty under backlog/ regardless of source).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter } from "../src/adapters/backlog";
import { realGitAdapter, resolveHeadSha } from "../src/adapters/git";
import { run } from "../src/cli";
import { runUnlink } from "../src/commands/link";
import { runSync, type SyncOptions, type SyncReport } from "../src/commands/sync";
import { type GitAdapter, type GitCommit, type GitLogRange, generateLog } from "../src/core/log";
import { regenerateTaskBlock } from "../src/core/managed-block";
import { builtinTemplateFor, renderTemplate } from "../src/core/template";
import { EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { bunGitSpawn } from "../src/state";
import { capture, cleanGitSpawn, dirtyGitSpawn, fakeAdapter, gitRun, makeTask, storyDoc } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-sync-"));
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

function docExists(rel: string): boolean {
  try {
    readDoc(rel);
    return true;
  } catch {
    return false;
  }
}

/** A fake GitAdapter returning a fixed, empty history (log.md regenerates to just its heading). */
function emptyGitAdapter(): GitAdapter {
  return { history: (_range: GitLogRange): readonly GitCommit[] => [] };
}

const FIXED_SHA = "0000000000000000000000000000000000000000";

function baseOptions(overrides: Partial<SyncOptions> = {}): Omit<SyncOptions, "root" | "output" | "args"> {
  return {
    stdout: capture(),
    stderr: capture(),
    gitAdapter: emptyGitAdapter(),
    resolveHead: () => FIXED_SHA,
    gitSpawn: cleanGitSpawn(),
    ...overrides,
  };
}

async function syncCmd(
  args: string[],
  adapter: BacklogAdapter,
  overrides: Partial<SyncOptions> = {},
): Promise<{ code: number; report: SyncReport }> {
  const stdout = capture();
  const code = await runSync({ root, output: JSON_CTX, args, adapter, ...baseOptions(overrides), stdout });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: SyncReport };
  expect(envelope.kind).toBe("sync.result");
  return { code, report: envelope.data };
}

async function expectSyncError(
  args: string[],
  adapter: BacklogAdapter,
  overrides: Partial<SyncOptions> = {},
): Promise<LoreError> {
  try {
    await runSync({ root, output: JSON_CTX, args, adapter, ...baseOptions(overrides) });
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runSync returned");
}

// ── AC#1: idempotency ────────────────────────────────────────────────────────────

describe("lore sync — AC#1: idempotent", () => {
  test("reconciles status + managed block, regenerates index/log, then a second run changes nothing", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", title: "Ship it" })]);

    const first = await syncCmd([], adapter);
    expect(first.code).toBe(EXIT_OK);
    expect(first.report.filesChanged).toBeGreaterThan(0);
    expect(first.report.files.map((f) => f.path)).toContain("docs/stories/x.md");
    expect(first.report.files.map((f) => f.path)).toContain("docs/index.md");
    expect(first.report.files.map((f) => f.path)).toContain("docs/log.md");

    const updated = readDoc("stories/x.md");
    expect(updated).toContain("status: done");
    expect(updated).not.toContain("lore_task_status");
    expect(updated).toContain("Ship it");
    expect(updated).toContain("Done");

    const second = await syncCmd([], adapter, { gitSpawn: cleanGitSpawn() });
    expect(second.code).toBe(EXIT_OK);
    expect(second.report.files).toEqual([]);
    expect(second.report.filesChanged).toBe(0);
    expect(readDoc("stories/x.md")).toBe(updated); // byte-identical, untouched
  });

  test("OKF 0.2 reconciles lore_task_status without touching lifecycle status", async () => {
    writeDoc("index.md", '---\ntype: Reference\nokf_version: "0.2"\n---\n# Docs\n');
    writeDoc(
      "stories/x.md",
      "---\ntype: Story\ntitle: X\nstatus: deprecated\nlore_task_status: todo\ntasks:\n  - lore-1\n---\n# X\n\n<!-- lore:tasks:begin -->\n<!-- lore:tasks:end -->\n",
    );
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", title: "Ship it" })]);

    const first = await syncCmd(["--no-index"], adapter);
    expect(first.code).toBe(EXIT_OK);
    expect(first.report.files).toEqual([{ path: "docs/stories/x.md" }]);
    const updated = readDoc("stories/x.md");
    const lines = updated.split("\n");
    expect(lines).toContain("status: deprecated");
    expect(lines).toContain("lore_task_status: done");
    expect(lines).not.toContain("status: done");

    const second = await syncCmd(["--no-index"], adapter, { gitSpawn: cleanGitSpawn() });
    expect(second.report.filesChanged).toBe(0);
    expect(readDoc("stories/x.md")).toBe(updated);
  });

  test("a concept with no tasks: is never touched, and no BacklogAdapter call is ever made", async () => {
    const doc = "---\ntype: Story\ntitle: Untouched\n---\nBody.\n";
    writeDoc("stories/plain.md", doc);
    const poison = fakeAdapter([], { poisonViews: ["never-called"] });
    // A poisoned id that's never referenced proves the adapter's viewTask is never invoked at all
    // for a bundle with no tasks: anywhere (no adapter methods are called; a real call would throw
    // "not implemented" for anything but viewTask, which would poison-throw here if ever invoked).

    const { report } = await syncCmd([], poison);
    expect(readDoc("stories/plain.md")).toBe(doc);
    expect(report.files.map((f) => f.path)).not.toContain("docs/stories/plain.md");
  });

  test("LCLI-316: a generated log subject with MDX hazards survives lore check --strict", async () => {
    writeDoc("stories/x.md", storyDoc("X", [], "todo"));
    const gitAdapter: GitAdapter = {
      history: () => [
        {
          hash: "abc1234",
          timestamp: "2026-08-04T20:00:00Z",
          subject: "docs: sync managed blocks after Story<->Task {coupling} fix",
          files: ["docs/stories/x.md"],
        },
      ],
    };

    const synced = await syncCmd([], fakeAdapter([]), { gitAdapter });
    expect(synced.code).toBe(EXIT_OK);
    expect(readDoc("log.md")).toContain("` docs: sync managed blocks after Story<->Task {coupling} fix `");

    const stdout = capture();
    const checkCode = await run(["bun", "lore", "check", "--strict", "--json"], {
      cwd: root,
      stdout,
      stderr: capture(),
    });
    expect(checkCode).toBe(EXIT_OK);
    expect(JSON.parse(stdout.text()).data).toMatchObject({ errorCount: 0, warningCount: 0 });
  });

  test("regenerates a stale managed block after tasks: transitions from one linked task to empty", async () => {
    const linked = regenerateTaskBlock(
      storyDoc("X", ["lore-1"], "done"),
      [{ id: "LORE-1", title: "Removed task", status: "Done", file: "backlog/tasks/lore-1 - removed.md" }],
      { docPath: "docs/stories/x.md" },
    );
    writeDoc("stories/x.md", linked);
    const adapter = fakeAdapter([], { poisonViews: ["lore-1"] });

    await runUnlink({
      root,
      output: JSON_CTX,
      args: ["stories/x", "lore-1", "--no-back-ref"],
      adapter,
      gitSpawn: cleanGitSpawn(),
      stdout: capture(),
      stderr: capture(),
    });
    expect(readDoc("stories/x.md")).toContain("tasks: []");
    expect(readDoc("stories/x.md")).toContain("Removed task");

    const first = await syncCmd(["--no-index"], adapter);
    expect(first.code).toBe(EXIT_OK);
    expect(first.report.files).toEqual([{ path: "docs/stories/x.md" }]);
    expect(readDoc("stories/x.md")).toContain("_No linked tasks._");
    expect(readDoc("stories/x.md")).not.toContain("Removed task");
    expect(adapter.calls).toEqual([]);

    const after = readDoc("stories/x.md");
    const second = await syncCmd(["--no-index"], adapter, { gitSpawn: cleanGitSpawn() });
    expect(second.report.filesChanged).toBe(0);
    expect(readDoc("stories/x.md")).toBe(after);
    expect(adapter.calls).toEqual([]);
  });
});

// ── log.md full-history projection (LCLI-326) ──────────────────────────────────

describe("lore sync — log.md is a full-history projection", () => {
  const history: readonly GitCommit[] = [
    {
      hash: "1111111111111111111111111111111111111111",
      timestamp: "2026-08-13T04:17:00Z",
      subject: "add story",
      files: ["docs/stories/x.md", "docs/adr/a.md"],
    },
  ];

  function historyAdapter(): GitAdapter {
    return { history: () => history };
  }

  test("repairs duplicate seeded log entries from the full git history in one sync", async () => {
    writeDoc("stories/x.md", storyDoc("X", [], "todo"));
    const expected = generateLog(history, { root: "docs" });
    const entry = "- 2026-08-13T04:17:00Z 1111111111111111111111111111111111111111 add story";
    writeDoc("log.md", expected.replace(entry, `${entry}\n${entry}`));

    const { report } = await syncCmd([], fakeAdapter([]), { gitAdapter: historyAdapter() });

    expect(report.files.map((file) => file.path)).toContain("docs/log.md");
    expect(readDoc("log.md")).toBe(expected);
    expect(readDoc("log.md").split(history[0]?.hash ?? "").length - 1).toBe(1);
  });

  test("leaves a repaired log byte-identical on a consecutive sync with unchanged history", async () => {
    writeDoc("stories/x.md", storyDoc("X", [], "todo"));
    const expected = generateLog(history, { root: "docs" });
    const entry = "- 2026-08-13T04:17:00Z 1111111111111111111111111111111111111111 add story";
    writeDoc("log.md", expected.replace(entry, `${entry}\n${entry}`));

    await syncCmd([], fakeAdapter([]), { gitAdapter: historyAdapter() });
    const firstBytes = readDoc("log.md");
    const second = await syncCmd([], fakeAdapter([]), { gitAdapter: historyAdapter() });

    expect(firstBytes).toBe(expected);
    expect(firstBytes.split(history[0]?.hash ?? "").length - 1).toBe(1);
    expect(readDoc("log.md")).toBe(firstBytes);
    expect(second.report.files.map((file) => file.path)).not.toContain("docs/log.md");
  });
});

// ── AC#2: sole committer of backlog/ ──────────────────────────────────────────────

describe("lore sync — AC#2: sole committer of backlog/", () => {
  test("commits whatever is dirty under backlog/ in one lore-authored commit", async () => {
    writeDoc("index.md", "# Index\n");
    const adapter = fakeAdapter([]);
    const gitSpawn = dirtyGitSpawn(" M backlog/tasks/lore-1 - x.md");

    const { report } = await syncCmd([], adapter, { gitSpawn });
    expect(report.backlogCommit).toEqual({ committed: true, files: ["backlog/tasks/lore-1 - x.md"] });
    expect(gitSpawn.calls[2]).toEqual(["add", "--", ":(literal)backlog/tasks/lore-1 - x.md"]);
    expect(gitSpawn.calls[3]?.[0]).toBe("commit");
  });

  test("a clean backlog/ makes no commit and the report says so", async () => {
    const adapter = fakeAdapter([]);
    const { report } = await syncCmd([], adapter, { gitSpawn: cleanGitSpawn() });
    expect(report.backlogCommit).toEqual({ committed: false, files: [] });
  });
});

// ── Missing task: fail loud, no partial writes ────────────────────────────────────

describe("lore sync — a linked task that no longer exists", () => {
  test("aborts with not_found (exit 3) before writing anything", async () => {
    const doc = storyDoc("X", ["lore-99"], "todo");
    writeDoc("stories/x.md", doc);
    const adapter = fakeAdapter([]); // lore-99 resolves to null

    const err = await expectSyncError([], adapter);
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("lore-99");
    expect(readDoc("stories/x.md")).toBe(doc); // untouched
    expect(docExists("index.md")).toBe(false); // no index/log write either
  });
});

describe("lore sync — the up-front symlink sweep, not ensureDir's reactive guard, catches a NON-FIRST target (LORE-266, LORE-93 AC#5)", () => {
  // POSIX-only, matching this codebase's existing symlink tests' own skip guard (e.g. rename.test.ts).
  test.skipIf(process.platform === "win32")(
    "a symlinked docs/index.md (a later target than the concept rewrite) refuses BEFORE the concept's legitimate status rewrite is ever written",
    async () => {
      // `writes` (commands/sync.ts) is filled in two phases: the per-concept status/task-block
      // rewrites first, THEN regenerateIndexAndLog appends any stale index.md/log.md hubs
      // afterward — so a real, linked concept always lands in `writes` BEFORE the root index.md
      // does. Symlinking docs/index.md therefore plants the bad target SECOND, mirroring the
      // CLAUDE.md-is-second setup in agents.test.ts (LORE-266): ensureDir's own per-call guard only
      // inspects each target's PARENT directory as the write loop reaches it — for docs/index.md
      // that parent is plain "docs" (not itself a symlink), so the reactive guard alone would let
      // the earlier concept write land first. Only the up-front `assertNoSymlinkInAnyPath` sweep,
      // run before the write loop starts, can refuse before that first, legitimate write happens.
      // The symlink target need not exist: walkMarkdown skips (warns on, never follows) a symlinked
      // entry outright, so root index.md is simply absent from `readIndexBytes`, and regeneration
      // unconditionally re-adds it to `writes` since generated bytes always differ from "absent".
      const doc = storyDoc("Aaa", ["lore-1"], "todo");
      writeDoc("stories/aaa.md", doc);
      symlinkSync(join(root, "this-target-does-not-exist"), join(root, "docs", "index.md"));
      const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", title: "Ship it" })]);

      const err = await expectSyncError([], adapter);
      expect(err.type).toBe("conflict");

      // The whole point (distinguishing the up-front sweep from ensureDir's reactive guard): the
      // FIRST target — the concept's own legitimate status rewrite — must never have landed, even
      // though it sorts before docs/index.md in `writes`' insertion order and has nothing wrong
      // with its own path.
      expect(readDoc("stories/aaa.md")).toBe(doc); // untouched — still "todo", not "done"
      // The docs/index.md symlink itself is untouched — neither followed nor replaced.
      expect(lstatSync(join(root, "docs", "index.md")).isSymbolicLink()).toBe(true);
    },
  );
});

describe("lore sync — config is validated before spending any tracker task round-trip", () => {
  test("an invalid selected-tracker status flow surfaces even when a linked task is also missing", async () => {
    // The selected adapter owns its workflow vocabulary. Validate it before resolving a task id
    // that does not exist, so backend-neutral reconciliation keeps its fail-fast boundary.
    writeDoc("stories/x.md", storyDoc("X", ["lore-99"], "todo"));
    const base = fakeAdapter([], { poisonViews: ["lore-99"] });
    const adapter = { ...base, statusFlow: async () => ["To Do", "To Do"] };

    const err = await expectSyncError([], adapter);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("duplicate entry");
  });

  test("an ALSO-malformed .lore/profile.toml is now reported before a malformed backlog/config.yml (LORE-84 precedence change)", async () => {
    // Was: "a malformed backlog/config.yml is reported before an ALSO-malformed .lore/profile.toml
    // (LORE-27 regression)" — config.yml won when both were broken, because profile only loaded
    // (eligibility-gated) AFTER config.yml's own syntax check. LORE-84 makes loadBundle itself
    // validate every concept's frontmatter against the profile, and loadBundle runs unconditionally
    // (before eligibility can even be computed — eligibility is derived FROM the loaded graph), so
    // profile now loads first, unconditionally, ahead of config.yml's syntax check. This is a
    // deliberate, necessary consequence of LORE-84, not a reintroduced LORE-27 regression: profile
    // loading first is now correct regardless of reconciliation eligibility.
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses: not-a-list\n");
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "profile.toml"), "not valid toml {{{\n");
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const err = await expectSyncError([], adapter);
    expect(err.message).toContain("profile.toml");
  });

  test("a SEMANTICALLY-invalid backlog/config.yml is reported AFTER an also-malformed .lore/profile.toml (LORE-27 regression, round 4)", async () => {
    // Unlike a config.yml SYNTAX error (the test above; caught by readStatusFlow's own parse, which
    // runs before profile is loaded either way), a semantic-only problem -- a duplicate flow entry,
    // valid YAML -- is caught only by validateReconcileInputs, which this command's ORIGINAL
    // (pre-LORE-27) precedence ran LAST, after profile had already loaded successfully. So when
    // profile is ALSO malformed, profile's error must win here, the mirror image of the test above.
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses:\n  - Todo\n  - Todo\n  - Done\n");
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "profile.toml"), "not valid toml {{{\n");
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const err = await expectSyncError([], adapter);
    expect(err.message).toContain("profile.toml");
  });
});

describe("lore sync — a reserved-stem concept (index/log) is never reconciled, even if it carries tasks:", () => {
  test("a root index.md with a tasks: field is skipped entirely -- untouched, no Backlog calls", async () => {
    // index.md is regenerated wholesale by generateIndexes, keyed by the SAME bundle-relative path
    // sync's own per-concept reconciliation writes to -- treating it as a task-linked concept would
    // have its reconciled write silently discarded by that regeneration. A `tasks:` field here is
    // tolerated by schema validation as an unrecognized extra key (a warning at most), not rejected,
    // so this must be guarded explicitly rather than relying on validation to prevent it.
    writeDoc(
      "index.md",
      "---\ntype: Reference\ntitle: Documentation\ntasks:\n  - lore-1\n---\n# Documentation\n\n<!-- lore:index:begin -->\n<!-- lore:index:end -->\n",
    );
    const poison = fakeAdapter([], { poisonViews: ["lore-1"] }); // throws if sync ever tries to resolve it

    const { code } = await syncCmd([], poison);
    expect(code).toBe(EXIT_OK);
    expect(readDoc("index.md")).toContain("tasks:\n  - lore-1"); // frontmatter untouched
  });
});

describe("lore sync — reserved-stem non-concept files stay silent (LORE-258)", () => {
  // `docs/log.md` and a child `index.md` are lore's own machine-generated hubs, always
  // frontmatter-less — loadBundle used to warn "no frontmatter mapping" for them on every sync
  // run, spurious noise `lore check` never raised for the same bundle. Only the two reserved
  // stems (index/log) go quiet; a genuinely unexpected non-concept file still warns.
  test("emits no advisory for docs/log.md or a child docs/adr/index.md", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    writeDoc("log.md", "# Generated changelog, no frontmatter\n");
    writeDoc("adr/index.md", "# Generated hub, no frontmatter\n");
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", title: "Ship it" })]);
    const stderr = capture();

    const code = await runSync({ root, output: JSON_CTX, args: [], adapter, ...baseOptions(), stderr });
    expect(code).toBe(EXIT_OK);
    expect(stderr.text()).not.toContain("no frontmatter mapping");
  });

  test("still warns about a genuinely unexpected non-concept file (not a reserved stem)", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    writeDoc("stray.md", "# Unexpected, no frontmatter\n");
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done", title: "Ship it" })]);
    const stderr = capture();

    const code = await runSync({ root, output: JSON_CTX, args: [], adapter, ...baseOptions(), stderr });
    expect(code).toBe(EXIT_OK);
    expect(stderr.text()).toContain("skipping stray.md: no frontmatter mapping");
  });
});

// ── A concept with tasks: but no managed-block markers ────────────────────────────

describe("lore sync — a concept with tasks: but no managed block", () => {
  test("is a fail-loud validation error (exit 6), not a guess", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nNo markers here.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const err = await expectSyncError([], adapter);
    expect(err.type).toBe("validation");
  });
});

// ── A freshly `lore new`-created Story (LORE-59 regression) ───────────────────────

describe("lore sync — a freshly `lore new`-created Story (LORE-59 regression)", () => {
  test("the built-in Story template already carries the managed block, so first sync succeeds", async () => {
    // Build the body from the REAL built-in Story template -- not the storyDoc() helper above,
    // which hardcodes the markers and would not catch a template regression -- then hand-add
    // `tasks:` frontmatter the way `lore link` would, mirroring exactly what a fresh
    // `lore new Story "X"; lore link stories/x LORE-1` leaves on disk.
    const body = renderTemplate(builtinTemplateFor("Story"), {
      type: "Story",
      title: "X",
      timestamp: "2026-06-25T12:00:00Z",
      summary: "A new story.",
    }).text;
    writeDoc("stories/x.md", `---\ntype: Story\ntitle: X\ntasks:\n  - lore-1\n---\n${body}`);
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const { code } = await syncCmd([], adapter);
    expect(code).toBe(EXIT_OK);
    const after = readDoc("stories/x.md");
    expect(after).toContain("<!-- lore:tasks:begin -->");
    expect(after).toContain("Title for LORE-1"); // the row actually rendered, not just empty markers
  });
});

// ── --dry-run ──────────────────────────────────────────────────────────────────

describe("lore sync — --dry-run", () => {
  test("reports what would change but writes nothing, and never touches backlog/", async () => {
    const doc = storyDoc("X", ["lore-1"], "todo");
    writeDoc("stories/x.md", doc);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const gitSpawn = dirtyGitSpawn(" M backlog/tasks/lore-1 - x.md");

    const { report } = await syncCmd(["--dry-run"], adapter, { gitSpawn });
    expect(report.dryRun).toBe(true);
    expect(report.filesChanged).toBeGreaterThan(0);
    expect(report.backlogCommit).toEqual({ committed: false, files: [] });
    expect(gitSpawn.calls).toHaveLength(0); // git is never even queried under --dry-run
    expect(readDoc("stories/x.md")).toBe(doc); // untouched
    expect(docExists("index.md")).toBe(false);
  });
});

// ── --no-index ─────────────────────────────────────────────────────────────────

describe("lore sync — --no-index", () => {
  test("skips both index.md and log.md regeneration", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const { report } = await syncCmd(["--no-index"], adapter);
    expect(report.files.map((f) => f.path)).toContain("docs/stories/x.md");
    expect(report.files.map((f) => f.path)).not.toContain("docs/index.md");
    expect(report.files.map((f) => f.path)).not.toContain("docs/log.md");
    expect(docExists("index.md")).toBe(false);
    expect(docExists("log.md")).toBe(false);
  });
});

// ── Orphaned index detection (LORE-150) ────────────────────────────────────────────

describe("lore sync — orphaned index detection (LORE-150)", () => {
  test("AC#1/#2: an on-disk index.md for a directory with no concepts is reported, not silently left untouched", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntitle: X\n---\nBody.\n"); // no tasks: — no Backlog dependency
    const stale = "# gone\n\n<!-- lore:index:begin -->\n- [gone](gone.md)\n<!-- lore:index:end -->\n";
    writeDoc("gone/index.md", stale); // "gone/" holds no concept in the graph at all

    const { report } = await syncCmd([], fakeAdapter([]));

    expect(report.orphanedIndexes).toEqual(["docs/gone/index.md"]);
    // Reported, not written: absent from `files`/`filesChanged`, and byte-identical on disk.
    expect(report.files.map((f) => f.path)).not.toContain("docs/gone/index.md");
    expect(readDoc("gone/index.md")).toBe(stale);
  });

  test("AC#3: a directory that still holds a live concept regenerates exactly as before, unaffected by an orphan elsewhere", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntitle: X\n---\nBody.\n");
    writeDoc("gone/index.md", "# gone\n\n<!-- lore:index:begin -->\n<!-- lore:index:end -->\n");

    const { report } = await syncCmd([], fakeAdapter([]));

    expect(report.files.map((f) => f.path)).toContain("docs/index.md");
    expect(readDoc("index.md")).toContain("[stories](stories/index.md)");
    expect(report.files.map((f) => f.path)).toContain("docs/stories/index.md");
    expect(readDoc("stories/index.md")).toContain("[X](x.md)");
  });

  test("the plain-text report renders the orphan distinctly from an updated file", async () => {
    writeDoc("gone/index.md", "# gone\n\n<!-- lore:index:begin -->\n<!-- lore:index:end -->\n");
    const stdout = capture();
    const code = await runSync({
      root,
      output: { mode: "plain", color: false },
      args: [],
      adapter: fakeAdapter([]),
      ...baseOptions(),
      stdout,
    });
    expect(code).toBe(EXIT_OK);
    const text = stdout.text();
    expect(text).toContain("orphaned index docs/gone/index.md");
    expect(text).not.toContain("updated docs/gone/index.md");
  });

  test("an orphan already reported stays reported on a second run (it is never auto-deleted)", async () => {
    const stale = "# gone\n\n<!-- lore:index:begin -->\n<!-- lore:index:end -->\n";
    writeDoc("gone/index.md", stale);
    const adapter = fakeAdapter([]);

    const first = await syncCmd([], adapter);
    expect(first.report.orphanedIndexes).toEqual(["docs/gone/index.md"]);

    const second = await syncCmd([], adapter, { gitSpawn: cleanGitSpawn() });
    expect(second.report.orphanedIndexes).toEqual(["docs/gone/index.md"]);
    expect(second.report.files).toEqual([]); // still not written — a report-only signal
    expect(readDoc("gone/index.md")).toBe(stale);
  });

  test("--no-index skips orphan detection along with index/log regeneration", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntitle: X\n---\nBody.\n");
    writeDoc("gone/index.md", "# gone\n\n<!-- lore:index:begin -->\n<!-- lore:index:end -->\n");

    const { report } = await syncCmd(["--no-index"], fakeAdapter([]));
    expect(report.orphanedIndexes).toEqual([]);
  });

  test("a clean bundle with no stale index files reports no orphans", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntitle: X\n---\nBody.\n");
    const { report } = await syncCmd([], fakeAdapter([]));
    expect(report.orphanedIndexes).toEqual([]);
  });
});

// ── [reconcile.overrides] wiring ──────────────────────────────────────────────────

describe("lore sync — [reconcile.overrides] (LORE-26, ADR-0009 §3)", () => {
  test("a status outside the default flow reconciles via a configured override instead of failing loud", async () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "config.toml"), '[reconcile.overrides]\nCancelled = "done"\n');
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Cancelled" })]);

    const { code } = await syncCmd([], adapter);
    expect(code).toBe(EXIT_OK);
    expect(readDoc("stories/x.md")).toContain("status: done");
  });

  test("without the override, the same unrecognized status is a fail-loud validation error", async () => {
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Cancelled" })]);

    const err = await expectSyncError([], adapter);
    expect(err.type).toBe("validation");
  });
});

// ── LORE-119: a concurrent on-disk edit survives a status-changing write ─────────

describe("lore sync — LORE-119: a concurrent on-disk edit survives a status-changing write", () => {
  test("a doc edited on disk during the Backlog round-trip keeps that edit after its status is reconciled", async () => {
    const path = "stories/x.md";
    writeDoc(path, storyDoc("X", ["lore-1"], "todo"));

    // gatherReconciliation resolves every linked task id via adapter.viewTask AFTER the bundle has
    // already been loaded (and the pre-round-trip `concept` snapshot captured) — the exact async gap
    // LORE-119 describes. This adapter simulates a concurrent edit (e.g. a human's direct edit, or
    // another `lore` invocation) landing on `path` during that gap, on the first `viewTask` call.
    const inner = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    let mutated = false;
    const adapter: BacklogAdapter = {
      ...inner,
      async viewTask(id: string) {
        if (!mutated) {
          mutated = true;
          const abs = join(root, "docs", path);
          const onDisk = readFileSync(abs, "utf8");
          writeFileSync(abs, onDisk.replace("# X\n", "# X\n\nA concurrently-added paragraph.\n"));
        }
        return inner.viewTask(id);
      },
    };

    const { code } = await syncCmd([], adapter, { gitSpawn: cleanGitSpawn() });
    expect(code).toBe(EXIT_OK);

    const final = readDoc(path);
    expect(final).toContain("status: done"); // the status change itself still landed
    expect(final).toContain("A concurrently-added paragraph."); // the concurrent edit was NOT discarded
  });
});

// ── LORE-120: cross-file rollback on a mid-loop write failure ────────────────────

describe("lore sync — LORE-120: no file is left in a mixed state after a mid-loop write failure", () => {
  test("a real IO failure partway through the multi-file write loop rolls back everything already written in this run", async () => {
    if (process.getuid?.() === 0) {
      return; // root bypasses a read-only directory -- this probe can't be set up
    }
    const originalDoc = storyDoc("X", ["lore-1"], "todo");
    writeDoc("stories/x.md", originalDoc);
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    // `writes` is populated in a fixed order: every per-concept status/managed-block entry first
    // (only "stories/x.md" here), THEN index.md/log.md (regenerateIndexAndLog runs after). Locking
    // docs/ (the ROOT dir) read-only blocks index.md/log.md, which live directly in it, WITHOUT
    // blocking docs/stories/ (a sibling directory, unaffected by its parent's own mode) -- so the
    // concept write below succeeds first, exactly like a real crash landing after some, but not all,
    // of a multi-file sync's writes.
    const docsAbs = join(root, "docs");
    chmodSync(docsAbs, 0o555);
    let blocked = true;
    try {
      writeFileSync(join(docsAbs, "probe.md"), "x");
      blocked = false;
      rmSync(join(docsAbs, "probe.md"), { force: true });
    } catch {
      // expected: docs/ is read-only, so creating a file directly in it fails.
    }
    if (!blocked) {
      chmodSync(docsAbs, 0o755);
      return; // environment ignores the mode (e.g. permissive FS) -- skip, can't force the failure
    }

    try {
      const err = await expectSyncError([], adapter, { gitSpawn: cleanGitSpawn() });
      expect(["denied", "conflict"]).toContain(err.type); // the real EACCES, mapped by ioError
    } finally {
      chmodSync(docsAbs, 0o755); // restore so afterEach's rmSync can clean up
    }

    // The concept write landed first (a different, still-writable directory), then rolled back to
    // its ORIGINAL bytes when the index.md/log.md write that came later in the same run threw --
    // never left holding the new "status: done" bytes with no corresponding index/log update.
    expect(readDoc("stories/x.md")).toBe(originalDoc);
    // Neither of the root-level files this run would have created ever survives -- either never
    // attempted (the loop stopped at the first failure) or written-then-rolled-back.
    expect(docExists("index.md")).toBe(false);
    expect(docExists("log.md")).toBe(false);
  });
});

// ── [paths…] scoping ─────────────────────────────────────────────────────────────

describe("lore sync — [paths…] scoping", () => {
  test("scopes reconciliation to only the given concept, leaving the other linked concept untouched", async () => {
    writeDoc("stories/a.md", storyDoc("A", ["lore-1"], "todo"));
    writeDoc("stories/b.md", storyDoc("B", ["lore-2"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" }), makeTask("LORE-2", { status: "Done" })]);

    const { report } = await syncCmd(["stories/a"], adapter, { gitSpawn: cleanGitSpawn() });
    expect(report.files.map((f) => f.path)).toContain("docs/stories/a.md");
    expect(report.files.map((f) => f.path)).not.toContain("docs/stories/b.md");
    expect(readDoc("stories/a.md")).toContain("status: done");
    expect(readDoc("stories/b.md")).toContain("status: todo"); // untouched
  });

  test("regression: a trailing slash on a directory scope still matches (not silently empty)", async () => {
    // idFromPath() preserves a trailing slash verbatim, so the naive prefix match
    // (`id === prefix || id.startsWith(prefix + "/")`) would otherwise never match anything for
    // "stories/" -- silently scoping to zero concepts (0 files changed, exit 0) instead of matching
    // every concept under stories/, exactly the natural shell-tab-completed form of the argument.
    writeDoc("stories/a.md", storyDoc("A", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const { report } = await syncCmd(["stories/"], adapter, { gitSpawn: cleanGitSpawn() });
    expect(report.files.map((f) => f.path)).toContain("docs/stories/a.md");
    expect(readDoc("stories/a.md")).toContain("status: done");
  });

  test("regression: a path/id matching no concept is a fail-loud not_found, not a silent no-op", async () => {
    writeDoc("stories/a.md", storyDoc("A", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);

    const err = await expectSyncError(["stories/typo-does-not-exist"], adapter);
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("stories/typo-does-not-exist");
    // LORE-259: hints at a command that actually lists concept ids — `lore check` prints only a
    // pass/fail summary count, never an id listing.
    expect(err.hint).toContain("lore query");
    expect(err.hint).not.toContain("lore check");
  });
});

// ── Real git integration + CLI router wiring ──────────────────────────────────────

describe("lore sync — real git integration + router", () => {
  function git(args: string[]): void {
    gitRun(root, args);
  }

  test("regenerates log.md from real history and commits a real dirty backlog/ file", async () => {
    git(["init", "-q"]);
    git(["config", "user.name", "lore test"]);
    git(["config", "user.email", "lore-test@example.com"]);
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    git(["add", "."]);
    git(["commit", "-q", "-m", "add story"]);

    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    writeFileSync(join(root, "backlog", "tasks", "lore-1 - x.md"), "a real task file\n");

    const adapter = fakeAdapter([makeTask("LORE-1", { status: "Done" })]);
    const code = await runSync({
      root,
      output: JSON_CTX,
      args: [],
      adapter,
      gitAdapter: realGitAdapter(root),
      resolveHead: resolveHeadSha,
      gitSpawn: bunGitSpawn(root),
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_OK);
    expect(readDoc("log.md")).toContain("add story");

    const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString(
      "utf8",
    );
    // `sync` commits ONLY backlog/ (lore is its sole committer there) — its own docs/ writes are
    // left staged-or-not per the user's own workflow, so they still show up as changes here.
    expect(status).toContain("stories/x.md");
    expect(status).toContain("index.md");
    expect(status).toContain("log.md");
    expect(status).not.toContain("backlog"); // the backlog/ file specifically was committed
  });

  test("router integration: `lore sync --json` dispatches through the real CLI", async () => {
    git(["init", "-q"]);
    git(["config", "user.name", "lore test"]);
    git(["config", "user.email", "lore-test@example.com"]);
    writeDoc("stories/x.md", storyDoc("X", [], "todo")); // no tasks: — no Backlog dependency at all
    const stdout = capture();
    const code = await run(["bun", "lore", "sync", "--json"], { cwd: root, stdout, stderr: capture() });
    expect(code).toBe(EXIT_OK);
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: SyncReport };
    expect(envelope.kind).toBe("sync.result");
  });
});
