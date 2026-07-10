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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter } from "../src/adapters/backlog";
import { realGitAdapter, resolveHeadSha } from "../src/adapters/git";
import { run } from "../src/cli";
import { runSync, type SyncOptions, type SyncReport } from "../src/commands/sync";
import type { GitAdapter, GitCommit, GitLogRange } from "../src/core/log";
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
    expect(updated).toContain("Ship it");
    expect(updated).toContain("Done");

    const second = await syncCmd([], adapter, { gitSpawn: cleanGitSpawn() });
    expect(second.code).toBe(EXIT_OK);
    expect(second.report.files).toEqual([]);
    expect(second.report.filesChanged).toBe(0);
    expect(readDoc("stories/x.md")).toBe(updated); // byte-identical, untouched
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
});

// ── AC#2: sole committer of backlog/ ──────────────────────────────────────────────

describe("lore sync — AC#2: sole committer of backlog/", () => {
  test("commits whatever is dirty under backlog/ in one lore-authored commit", async () => {
    writeDoc("index.md", "# Index\n");
    const adapter = fakeAdapter([]);
    const gitSpawn = dirtyGitSpawn(" M backlog/tasks/lore-1 - x.md");

    const { report } = await syncCmd([], adapter, { gitSpawn });
    expect(report.backlogCommit).toEqual({ committed: true, files: ["backlog/tasks/lore-1 - x.md"] });
    expect(gitSpawn.calls[2]).toEqual(["add", "--", "backlog/tasks/lore-1 - x.md"]);
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

describe("lore sync — config is validated before spending any Backlog subprocess round-trip", () => {
  test("a malformed backlog/config.yml surfaces its validation error even when a linked task is also missing", async () => {
    // Regression: readStatusFlow/loadConfig/loadProfile must run BEFORE resolveAllTasks, so a
    // broken config surfaces immediately rather than being masked behind (and paid for after) a
    // wasted round-trip resolving a task id that doesn't even exist.
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses: not-a-list\n");
    writeDoc("stories/x.md", storyDoc("X", ["lore-99"], "todo"));
    const adapter = fakeAdapter([]); // lore-99 would resolve to null if ever asked -- must never be reached

    const err = await expectSyncError([], adapter);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("backlog/config.yml");
  });

  test("a malformed backlog/config.yml is reported before an ALSO-malformed .lore/profile.toml (LORE-27 regression)", async () => {
    // Regression: the reconcile-shared.ts extraction must not reverse this command's own
    // pre-existing precedence (status flow/config, THEN profile) when both happen to be broken.
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "config.yml"), "statuses: not-a-list\n");
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "profile.toml"), "not valid toml {{{\n");
    writeDoc("stories/x.md", storyDoc("X", ["lore-1"], "todo"));
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const err = await expectSyncError([], adapter);
    expect(err.message).toContain("backlog/config.yml");
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

// ── A concept with tasks: but no managed-block markers ────────────────────────────

describe("lore sync — a concept with tasks: but no managed block", () => {
  test("is a fail-loud validation error (exit 6), not a guess", async () => {
    writeDoc("stories/x.md", "---\ntype: Story\ntasks:\n  - lore-1\n---\nNo markers here.\n");
    const adapter = fakeAdapter([makeTask("LORE-1")]);

    const err = await expectSyncError([], adapter);
    expect(err.type).toBe("validation");
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
