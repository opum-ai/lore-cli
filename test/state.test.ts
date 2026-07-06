/**
 * state.test.ts — `.lore/` + git ownership of `backlog/` (LORE-26, ADR-0012, design spec §2.4).
 *
 * Two layers: a fake {@link GitSpawn} drives `commitBacklogIfDirty`'s parsing/orchestration logic
 * deterministically (no real subprocess), and a small real-git integration suite proves the actual
 * `bunGitSpawn` seam + `commitBacklogIfDirty` work end to end against a real temp repository.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exitCodeFor, LoreError } from "../src/errors";
import { bunGitSpawn, commitBacklogIfDirty, type GitSpawn, type GitSpawnResult } from "../src/state";

/** A recorded invocation, for assertions on exact argv. */
interface Call {
  readonly args: readonly string[];
}

/** A scripted fake {@link GitSpawn}: each call consumes the next canned {@link GitSpawnResult} in order. */
function scriptedSpawn(results: readonly GitSpawnResult[]): GitSpawn & { calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const spawn = (async (args: readonly string[]): Promise<GitSpawnResult> => {
    calls.push({ args: [...args] });
    const result = results[i++];
    if (result === undefined) {
      throw new Error(`scriptedSpawn: no result queued for call ${i} (${args.join(" ")})`);
    }
    return result;
  }) as GitSpawn & { calls: Call[] };
  spawn.calls = calls;
  return spawn;
}

function ok(stdout: string): GitSpawnResult {
  return { exitCode: 0, stdout, stderr: "" };
}
function fail(exitCode: number, stderr: string): GitSpawnResult {
  return { exitCode, stdout: "", stderr };
}

/** Build `-z` (NUL-delimited) porcelain stdout from `XY path` entries (each becomes one NUL-terminated field). */
function porcelainZ(...entries: string[]): string {
  return entries.length === 0 ? "" : `${entries.join("\0")}\0`;
}

/** One `XY path` entry for {@link porcelainZ}. */
function entry(status: string, path: string): string {
  return `${status} ${path}`;
}

/** A rename/copy entry: two NUL-terminated fields, `XY new-path\0old-path` (no `" -> "` text token at all in `-z` mode). */
function renameEntry(status: string, newPath: string, oldPath: string): string {
  return `${status} ${newPath}\0${oldPath}`;
}

describe("commitBacklogIfDirty — fake GitSpawn", () => {
  test("clean backlog/ (empty porcelain output) is a no-op: no add, no commit", async () => {
    const spawn = scriptedSpawn([ok("")]);
    const result = await commitBacklogIfDirty(spawn);
    expect(result).toEqual({ committed: false, files: [] });
    expect(spawn.calls).toHaveLength(1); // status only
    expect(spawn.calls[0]?.args).toEqual(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "backlog/"]);
  });

  test("dirty backlog/ stages exactly the reported paths and commits them, scoped to those paths", async () => {
    const stdout = porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"), entry("??", "backlog/tasks/lore-2 - y.md"));
    const spawn = scriptedSpawn([ok(stdout), ok(""), ok("")]);
    const result = await commitBacklogIfDirty(spawn, "chore(backlog): sync task changes");
    expect(result.committed).toBe(true);
    expect(result.files).toEqual(["backlog/tasks/lore-1 - x.md", "backlog/tasks/lore-2 - y.md"]);
    expect(spawn.calls[1]?.args).toEqual(["add", "--", "backlog/tasks/lore-1 - x.md", "backlog/tasks/lore-2 - y.md"]);
    // The commit is scoped to the same pathspec (not a bare `git commit`) — see the real-git
    // regression test below proving this actually excludes unrelated staged content.
    expect(spawn.calls[2]?.args).toEqual([
      "commit",
      "-m",
      "chore(backlog): sync task changes",
      "--",
      "backlog/tasks/lore-1 - x.md",
      "backlog/tasks/lore-2 - y.md",
    ]);
  });

  test("a staged rename (porcelain 'R  new\\0old') commits only the new path, not a literal '-> '-split", async () => {
    const stdout = porcelainZ(renameEntry("R ", "backlog/tasks/lore-1 - new.md", "backlog/tasks/lore-1 - old.md"));
    const spawn = scriptedSpawn([ok(stdout), ok(""), ok("")]);
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/lore-1 - new.md"]);
  });

  test("a copy (status 'C') is treated the same two-field way as a rename", async () => {
    const stdout = porcelainZ(renameEntry("C ", "backlog/tasks/lore-2 - copy.md", "backlog/tasks/lore-1 - x.md"));
    const spawn = scriptedSpawn([ok(stdout), ok(""), ok("")]);
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/lore-2 - copy.md"]);
  });

  test("regression: an ordinary (non-rename) entry whose filename literally contains ' -> ' is never mis-split", async () => {
    // Before the -z rewrite, a text-format parser that blindly searched for " -> " would slice this
    // untracked add's own filename in half. -z mode has no " -> " separator at all for non-R/C
    // entries, so the full filename must come through unmangled.
    const stdout = porcelainZ(entry("??", "backlog/tasks/lore-5 - Cache -> DB fallback.md"));
    const spawn = scriptedSpawn([ok(stdout), ok(""), ok("")]);
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/lore-5 - Cache -> DB fallback.md"]);
  });

  test("regression: an UNSTAGED rename (reported as two independent entries, not one 'R' entry) commits both sides", async () => {
    // git only detects a rename once both sides are staged; an on-disk-only move (exactly what a
    // human editing a task file by hand produces) shows up as a plain deletion plus a plain
    // untracked add — both must be picked up and committed, not just one.
    const stdout = porcelainZ(
      entry(" D", "backlog/tasks/lore-1 - old title.md"),
      entry("??", "backlog/tasks/lore-1 - new title.md"),
    );
    const spawn = scriptedSpawn([ok(stdout), ok(""), ok("")]);
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/lore-1 - old title.md", "backlog/tasks/lore-1 - new title.md"]);
  });

  test("the default commit message is used when none is given", async () => {
    const spawn = scriptedSpawn([ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))), ok(""), ok("")]);
    await commitBacklogIfDirty(spawn);
    expect(spawn.calls[2]?.args).toEqual([
      "commit",
      "-m",
      "chore(backlog): sync task changes",
      "--",
      "backlog/tasks/lore-1 - x.md",
    ]);
  });

  test("a failing `git status` throws a drift LoreError and never attempts add/commit", async () => {
    const spawn = scriptedSpawn([fail(128, "fatal: not a git repository")]);
    let err: unknown;
    try {
      await commitBacklogIfDirty(spawn);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect(exitCodeFor(err)).toBe(6);
    expect(spawn.calls).toHaveLength(1);
  });

  test("a failing `git add` throws drift and never attempts commit", async () => {
    const spawn = scriptedSpawn([
      ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))),
      fail(1, "error: pathspec did not match"),
    ]);
    let err: unknown;
    try {
      await commitBacklogIfDirty(spawn);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect(spawn.calls).toHaveLength(2); // status + add, no commit
  });

  test("a failing `git commit` (e.g. a rejected pre-commit hook) throws drift", async () => {
    const spawn = scriptedSpawn([
      ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))),
      ok(""),
      fail(1, "hook rejected"),
    ]);
    const err = await commitBacklogIfDirty(spawn).catch((e) => e);
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect((err as LoreError).hint).toContain("hook rejected");
  });
});

describe("bunGitSpawn + commitBacklogIfDirty — real git integration", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-state-"));
    run(["init", "-q"]);
    run(["config", "user.name", "lore test"]);
    run(["config", "user.email", "lore-test@example.com"]);
    // An initial commit so `backlog/` changes are additions atop real history, not the repo's first commit.
    writeFileSync(join(root, ".gitkeep"), "");
    run(["add", "."]);
    run(["commit", "-q", "-m", "initial"]);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function run(args: string[]): void {
    const proc = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString("utf8")}`);
    }
  }

  function log(): string {
    const proc = Bun.spawnSync(["git", "log", "--oneline"], { cwd: root, stdout: "pipe" });
    return proc.stdout.toString("utf8");
  }

  test("commits an untracked backlog/ file in one lore-authored commit", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    writeFileSync(join(root, "backlog", "tasks", "lore-1 - x.md"), "hello\n");

    const result = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(result).toEqual({ committed: true, files: ["backlog/tasks/lore-1 - x.md"] });
    expect(log()).toContain("chore(backlog): sync task changes");
  });

  test("a clean backlog/ (nothing to commit) is a true no-op — idempotent re-run", async () => {
    const first = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(first).toEqual({ committed: false, files: [] });

    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "x.md"), "a\n");
    await commitBacklogIfDirty(bunGitSpawn(root));
    const beforeSha = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" })
      .stdout.toString("utf8")
      .trim();

    // Second run: backlog/ is clean again — HEAD must not move.
    const second = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(second).toEqual({ committed: false, files: [] });
    const afterSha = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" })
      .stdout.toString("utf8")
      .trim();
    expect(afterSha).toBe(beforeSha);
  });

  test("a non-ASCII filename round-trips correctly (-z mode returns raw bytes, no quoting to undo)", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const name = "lore-1 - café 日本語.md";
    writeFileSync(join(root, "backlog", "tasks", name), "hi\n");

    const result = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(result).toEqual({ committed: true, files: [`backlog/tasks/${name}`] });
    const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString(
      "utf8",
    );
    expect(status).toBe("");
  });

  test("a filename containing a literal ' -> ' commits correctly (regression: no text-based rename ambiguity)", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const name = "lore-5 - Cache -> DB fallback.md";
    writeFileSync(join(root, "backlog", "tasks", name), "a\n");

    const result = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(result).toEqual({ committed: true, files: [`backlog/tasks/${name}`] });
    const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString(
      "utf8",
    );
    expect(status).toBe("");
  });

  test("regression: an unrelated already-staged change is never swept into lore's commit", async () => {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "foo.ts"), "a\n");
    run(["add", "."]);
    run(["commit", "-q", "-m", "add src/foo.ts"]);

    // A developer stages in-progress work...
    writeFileSync(join(root, "src", "foo.ts"), "b\n");
    run(["add", "src/foo.ts"]);
    // ...then a backlog/ task file becomes dirty, and sync's commit step runs.
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "x.md"), "a\n");

    const result = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(result).toEqual({ committed: true, files: ["backlog/x.md"] });

    const committedFiles = Bun.spawnSync(["git", "show", "--stat=200", "--pretty=format:", "HEAD"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(committedFiles).toContain("backlog/x.md");
    expect(committedFiles).not.toContain("foo.ts");
    // The developer's unrelated staged change is untouched — still staged, not committed.
    const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString(
      "utf8",
    );
    expect(status).toBe("M  src/foo.ts\n");
  });

  test("regression: an unstaged on-disk rename (the human-edit case) commits both sides as one logical change", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const oldPath = join(root, "backlog", "tasks", "lore-1 - old title.md");
    const newPath = join(root, "backlog", "tasks", "lore-1 - new title.md");
    writeFileSync(oldPath, "a\n");
    run(["add", "."]);
    run(["commit", "-q", "-m", "add task"]);

    // A plain filesystem rename, exactly what hand-editing a Backlog task's title produces — no
    // `git add` in between, so git cannot detect this as a staged rename (it shows up as two
    // independent porcelain entries: a deletion and an untracked add).
    rmSync(oldPath);
    writeFileSync(newPath, "a\n");

    const result = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(result.committed).toBe(true);
    expect([...result.files].sort()).toEqual(
      ["backlog/tasks/lore-1 - new title.md", "backlog/tasks/lore-1 - old title.md"].sort(),
    );
    const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString(
      "utf8",
    );
    expect(status).toBe(""); // both the deletion and the addition are fully committed
  });

  test("a change outside backlog/ is never staged or committed", async () => {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "unrelated docs change\n");
    mkdirSync(join(root, "backlog"), { recursive: true });
    writeFileSync(join(root, "backlog", "x.md"), "backlog change\n");

    await commitBacklogIfDirty(bunGitSpawn(root));

    const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(status).toContain("docs/index.md"); // still uncommitted/untracked
    expect(status).not.toContain("backlog/x.md"); // committed
  });
});
