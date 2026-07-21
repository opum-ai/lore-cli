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
import {
  bunGitSpawn,
  commitBacklogFiles,
  commitBacklogIfDirty,
  type GitSpawn,
  type GitSpawnResult,
} from "../src/state";
import { gitRun } from "./helpers";

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

/**
 * A scripted fake, pre-seeded with the `git rev-parse --show-prefix` response every
 * `commitBacklogIfDirty` call makes first — `""` (not nested; `cwd` is the repo's own top level),
 * so every test below only needs to script what comes *after* it. The nested-repo translation
 * itself is covered separately, by the dedicated `showPrefix` tests and the real-git integration
 * suite below.
 */
function notNestedSpawn(...results: readonly GitSpawnResult[]): GitSpawn & { calls: Call[] } {
  return scriptedSpawn([ok(""), ...results]);
}

describe("commitBacklogIfDirty — fake GitSpawn", () => {
  test("clean backlog/ (empty porcelain output) is a no-op: no add, no commit", async () => {
    const spawn = notNestedSpawn(ok(""));
    const result = await commitBacklogIfDirty(spawn);
    expect(result).toEqual({ committed: false, files: [] });
    expect(spawn.calls).toHaveLength(2); // show-prefix + status only
    expect(spawn.calls[1]?.args).toEqual([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ":(literal)backlog/",
    ]);
  });

  test("dirty backlog/ stages exactly the reported paths and commits them, scoped to those paths", async () => {
    const stdout = porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"), entry("??", "backlog/tasks/lore-2 - y.md"));
    const spawn = notNestedSpawn(ok(stdout), ok(""), ok(""));
    const result = await commitBacklogIfDirty(spawn, "chore(backlog): sync task changes");
    expect(result.committed).toBe(true);
    expect(result.files).toEqual(["backlog/tasks/lore-1 - x.md", "backlog/tasks/lore-2 - y.md"]);
    expect(spawn.calls[2]?.args).toEqual([
      "add",
      "--",
      ":(literal)backlog/tasks/lore-1 - x.md",
      ":(literal)backlog/tasks/lore-2 - y.md",
    ]);
    // The commit is scoped to the same pathspec (not a bare `git commit`) — see the real-git
    // regression test below proving this actually excludes unrelated staged content. Each path is
    // `:(literal)`-quoted so a wildcard in a filename can't glob-match an unrelated sibling.
    expect(spawn.calls[3]?.args).toEqual([
      "commit",
      "-m",
      "chore(backlog): sync task changes",
      "--",
      ":(literal)backlog/tasks/lore-1 - x.md",
      ":(literal)backlog/tasks/lore-2 - y.md",
    ]);
  });

  test("a staged rename (porcelain 'R  new\\0old') includes BOTH paths, not just the new one", async () => {
    // Regression: `git commit -- <pathspec>` fills in any path outside the pathspec from HEAD
    // rather than treating it as absent, so committing only the new path resurrects the old file
    // into the tree instead of applying its staged deletion — the old path must be in the pathspec
    // too (see the real-git test below proving this against actual git, not just parsing).
    const stdout = porcelainZ(renameEntry("R ", "backlog/tasks/lore-1 - new.md", "backlog/tasks/lore-1 - old.md"));
    const spawn = notNestedSpawn(ok(stdout), ok(""), ok(""));
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/lore-1 - new.md", "backlog/tasks/lore-1 - old.md"]);
    // `add` gets only the new path — the old path of an already-staged rename is fully removed
    // from the index by `git mv`, so re-adding it fails outright ("did not match any files").
    expect(spawn.calls[2]?.args).toEqual(["add", "--", ":(literal)backlog/tasks/lore-1 - new.md"]);
    expect(spawn.calls[3]?.args).toEqual([
      "commit",
      "-m",
      "chore(backlog): sync task changes",
      "--",
      ":(literal)backlog/tasks/lore-1 - new.md",
      ":(literal)backlog/tasks/lore-1 - old.md",
    ]);
  });

  test("a copy (status 'C') is treated the same two-field way as a rename", async () => {
    const stdout = porcelainZ(renameEntry("C ", "backlog/tasks/lore-2 - copy.md", "backlog/tasks/lore-1 - x.md"));
    const spawn = notNestedSpawn(ok(stdout), ok(""), ok(""));
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/lore-2 - copy.md", "backlog/tasks/lore-1 - x.md"]);
  });

  test("regression: an ordinary (non-rename) entry whose filename literally contains ' -> ' is never mis-split", async () => {
    // Before the -z rewrite, a text-format parser that blindly searched for " -> " would slice this
    // untracked add's own filename in half. -z mode has no " -> " separator at all for non-R/C
    // entries, so the full filename must come through unmangled.
    const stdout = porcelainZ(entry("??", "backlog/tasks/lore-5 - Cache -> DB fallback.md"));
    const spawn = notNestedSpawn(ok(stdout), ok(""), ok(""));
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
    const spawn = notNestedSpawn(ok(stdout), ok(""), ok(""));
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/lore-1 - old title.md", "backlog/tasks/lore-1 - new title.md"]);
  });

  test("the default commit message is used when none is given", async () => {
    const spawn = notNestedSpawn(ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))), ok(""), ok(""));
    await commitBacklogIfDirty(spawn);
    expect(spawn.calls[3]?.args).toEqual([
      "commit",
      "-m",
      "chore(backlog): sync task changes",
      "--",
      ":(literal)backlog/tasks/lore-1 - x.md",
    ]);
  });

  test("a failing `git rev-parse --show-prefix` throws a drift LoreError and never attempts status/add/commit", async () => {
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

  test("a failing `git status` throws a drift LoreError and never attempts add/commit", async () => {
    const spawn = notNestedSpawn(fail(128, "fatal: not a git repository"));
    let err: unknown;
    try {
      await commitBacklogIfDirty(spawn);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect(exitCodeFor(err)).toBe(6);
    expect(spawn.calls).toHaveLength(2); // show-prefix + status
  });

  test("a failing `git add` throws drift and never attempts commit", async () => {
    const spawn = notNestedSpawn(
      ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))),
      fail(1, "error: pathspec did not match"),
    );
    let err: unknown;
    try {
      await commitBacklogIfDirty(spawn);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect(spawn.calls).toHaveLength(3); // show-prefix + status + add, no commit
  });

  test("a failing `git commit` (e.g. a rejected pre-commit hook) throws drift", async () => {
    const spawn = notNestedSpawn(
      ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))),
      ok(""),
      fail(1, "hook rejected"),
    );
    const err = await commitBacklogIfDirty(spawn).catch((e) => e);
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect((err as LoreError).hint).toContain("hook rejected");
  });
});

describe("commitBacklogFiles — capture + scope guard (fake GitSpawn)", () => {
  const opts = (spawn: GitSpawn) => ({ root: "/unused", gitSpawn: spawn });

  test("a `git commit` failure is captured into result.error (not thrown) so the caller can still report", async () => {
    const spawn = notNestedSpawn(
      ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))), // status: dirty
      ok(""), // add
      fail(1, "hook rejected"), // commit
    );
    const result = await commitBacklogFiles(["backlog/tasks/lore-1 - x.md"], opts(spawn), "msg");
    expect(result.committed).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.error).toContain("could not commit backlog/");
    // It did reach `git commit` — the failure was captured after the attempt, not short-circuited.
    expect(spawn.calls[3]?.args[0]).toBe("commit");
  });

  test("a non-drift error (a failed spawn, not a non-zero exit) still propagates — only a git failure is captured", async () => {
    const boom: GitSpawn = async () => {
      throw new Error("spawn failed");
    };
    await expect(commitBacklogFiles(["backlog/tasks/lore-1 - x.md"], opts(boom), "msg")).rejects.toThrow(
      "spawn failed",
    );
  });

  test("a path outside backlog/ is refused before any git call (scope guard, ADR-0012)", async () => {
    const spawn = notNestedSpawn(ok(""));
    let err: unknown;
    try {
      await commitBacklogFiles(["docs/stories/x.md"], opts(spawn), "msg");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect(spawn.calls).toHaveLength(0); // never reached git — the guard runs first
  });

  test.each([
    ["backlog/../docs/secret.md", "the task's own repro"],
    ["backlog/./../docs/secret.md", "a `.` segment ahead of the `..`"],
    ["backlog//../docs/secret.md", "a doubled slash ahead of the `..`"],
    ["backlog/tasks/../../docs/secret.md", "a deeper `..` climb"],
    ["/etc/passwd", "an absolute path"],
  ])("a `..`-traversal pathspec that textually starts with backlog/ is refused (%s: %s)", async (file) => {
    const spawn = notNestedSpawn(ok(""));
    let err: unknown;
    try {
      await commitBacklogFiles([file], opts(spawn), "msg");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LoreError);
    expect((err as LoreError).type).toBe("drift");
    expect(spawn.calls).toHaveLength(0); // never reached git — the guard runs first
  });

  test("a sibling directory sharing the `backlog` prefix (no `..` involved) is still refused", async () => {
    const spawn = notNestedSpawn(ok(""));
    await expect(commitBacklogFiles(["backlog-evil/x.md"], opts(spawn), "msg")).rejects.toThrow(LoreError);
    expect(spawn.calls).toHaveLength(0);
  });

  test("a redundant `./` segment normalizes to the plain safe path and is accepted", async () => {
    const spawn = notNestedSpawn(ok(porcelainZ(entry(" M", "backlog/tasks/lore-1 - x.md"))), ok(""), ok(""));
    const result = await commitBacklogFiles(["backlog/./tasks/lore-1 - x.md"], opts(spawn), "msg");
    expect(result.committed).toBe(true);
    // git status was scoped with the NORMALIZED path, not the raw `./`-containing one.
    expect(spawn.calls[1]?.args).toEqual([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--",
      ":(literal)backlog/tasks/lore-1 - x.md",
    ]);
  });
});

describe("commitBacklogIfDirty — nested-bundle cwd (fake GitSpawn)", () => {
  test("regression: a non-empty show-prefix is stripped from every reported path before add/commit", async () => {
    // Reproduces the nested-checkout bug with a fake: `git status` (repo-top-relative) reports
    // "project/backlog/tasks/x.md" while `cwd` is ".../project" — git add/commit resolve pathspecs
    // relative to cwd, so the prefix "project/" must be stripped before either is called.
    const stdout = porcelainZ(entry("??", "project/backlog/tasks/x.md"));
    const spawn = scriptedSpawn([ok("project/\n"), ok(stdout), ok(""), ok("")]);
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/x.md"]);
    expect(spawn.calls[0]?.args).toEqual(["rev-parse", "--show-prefix"]);
    expect(spawn.calls[2]?.args).toEqual(["add", "--", ":(literal)backlog/tasks/x.md"]);
    expect(spawn.calls[3]?.args).toEqual([
      "commit",
      "-m",
      "chore(backlog): sync task changes",
      "--",
      ":(literal)backlog/tasks/x.md",
    ]);
  });

  test("a staged rename under a nested cwd strips the prefix from BOTH the new and old path", async () => {
    const stdout = porcelainZ(renameEntry("R ", "project/backlog/tasks/new.md", "project/backlog/tasks/old.md"));
    const spawn = scriptedSpawn([ok("project/\n"), ok(stdout), ok(""), ok("")]);
    const result = await commitBacklogIfDirty(spawn);
    expect(result.files).toEqual(["backlog/tasks/new.md", "backlog/tasks/old.md"]);
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
    gitRun(root, args);
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

  // `>` is one of Windows/NTFS's reserved filename characters (`< > : " / \ | ? *`) — this exact
  // real-file reproduction is only possible on POSIX filesystems. The parsing logic itself (no real
  // file needed) is covered cross-platform by the fake-GitSpawn regression test above.
  test.skipIf(process.platform === "win32")(
    "a filename containing a literal ' -> ' commits correctly (regression: no text-based rename ambiguity)",
    async () => {
      mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
      const name = "lore-5 - Cache -> DB fallback.md";
      writeFileSync(join(root, "backlog", "tasks", name), "a\n");

      const result = await commitBacklogIfDirty(bunGitSpawn(root));
      expect(result).toEqual({ committed: true, files: [`backlog/tasks/${name}`] });
      const status = Bun.spawnSync(["git", "status", "--porcelain"], {
        cwd: root,
        stdout: "pipe",
      }).stdout.toString("utf8");
      expect(status).toBe("");
    },
  );

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

  test("regression: a STAGED rename (both sides already git-add'ed) commits cleanly, no resurrected old file", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    writeFileSync(join(root, "backlog", "tasks", "lore-1 - old title.md"), "a\n");
    run(["add", "."]);
    run(["commit", "-q", "-m", "add task"]);

    // `git mv` + it already being in the index stages BOTH sides of the rename, so `git status`
    // reports one `R` entry — the scenario the round-1 fix (commit scoped to only the new path)
    // got wrong: it left the deletion staged-but-uncommitted and resurrected the old file into the
    // commit's tree.
    run(["mv", "backlog/tasks/lore-1 - old title.md", "backlog/tasks/lore-1 - new title.md"]);

    const result = await commitBacklogIfDirty(bunGitSpawn(root));
    expect(result.committed).toBe(true);
    expect([...result.files].sort()).toEqual(
      ["backlog/tasks/lore-1 - new title.md", "backlog/tasks/lore-1 - old title.md"].sort(),
    );

    const tree = Bun.spawnSync(["git", "ls-tree", "-r", "HEAD", "--", "backlog/"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(tree).toContain("lore-1 - new title.md");
    expect(tree).not.toContain("lore-1 - old title.md"); // not resurrected from HEAD

    const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" }).stdout.toString(
      "utf8",
    );
    expect(status).toBe(""); // no stranded staged deletion left behind
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

describe("bunGitSpawn + commitBacklogFiles — scoped per-write commit (real git)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-state-scoped-"));
    gitRun(root, ["init", "-q"]);
    gitRun(root, ["config", "user.name", "lore test"]);
    gitRun(root, ["config", "user.email", "lore-test@example.com"]);
    writeFileSync(join(root, ".gitkeep"), "");
    gitRun(root, ["add", "."]);
    gitRun(root, ["commit", "-q", "-m", "initial"]);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const headSha = (): string =>
    Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout.toString("utf8").trim();

  test("commits ONLY the passed task file, leaving an unrelated dirty backlog/ file untouched (ADR-0012 §1)", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const edited = "backlog/tasks/lore-1 - title.md"; // the file link/unlink/rename just edited
    const unrelated = "backlog/tasks/lore-2 - hand edit.md"; // a developer's separate in-progress edit
    writeFileSync(join(root, edited), "the back-reference edit\n");
    writeFileSync(join(root, unrelated), "an unrelated in-progress hand-edit\n");

    const result = await commitBacklogFiles([edited], { root }, "chore(backlog): add doc back-references (lore link)");

    expect(result).toEqual({ committed: true, files: [edited] });
    // The commit's tree contains ONLY the edited task file (spaces in the path handled by argv, no shell).
    const committed = Bun.spawnSync(["git", "show", "--stat=200", "--pretty=format:", "HEAD"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(committed).toContain("lore-1 - title.md");
    expect(committed).not.toContain("lore-2 - hand edit.md");
    // The unrelated hand-edit is STILL uncommitted — never swept into lore's commit.
    const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(status).toContain("lore-2 - hand edit.md");
    expect(status).not.toContain("lore-1 - title.md"); // committed, no longer dirty
  });

  test("commits EVERY passed task file (multi-id), leaving an unrelated dirty backlog/ file untouched", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const editedA = "backlog/tasks/lore-1 - a.md"; // two task files a single `lore link t1 t2` edited
    const editedB = "backlog/tasks/lore-2 - b.md";
    const unrelated = "backlog/tasks/lore-3 - hand edit.md"; // a developer's separate in-progress edit
    writeFileSync(join(root, editedA), "edit A\n");
    writeFileSync(join(root, editedB), "edit B\n");
    writeFileSync(join(root, unrelated), "unrelated hand-edit\n");

    const result = await commitBacklogFiles(
      [editedA, editedB],
      { root },
      "chore(backlog): add doc back-references (lore link)",
    );

    expect(result.committed).toBe(true);
    expect(new Set(result.files)).toEqual(new Set([editedA, editedB])); // BOTH committed (order is git's)
    // The commit's tree contains both edited files and NOT the unrelated one.
    const committed = Bun.spawnSync(["git", "show", "--stat=200", "--pretty=format:", "HEAD"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(committed).toContain("lore-1 - a.md");
    expect(committed).toContain("lore-2 - b.md");
    expect(committed).not.toContain("lore-3 - hand edit.md");
    // The unrelated hand-edit is STILL uncommitted — never swept into lore's multi-file commit.
    const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(status).toContain("lore-3 - hand edit.md");
  });

  test("a filename containing a git wildcard ([…]) commits ONLY itself, never a glob-matched sibling", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const bracket = "backlog/tasks/lore-1 - Fix [urgent] bug.md"; // the edited file, name has a glob metachar
    const sibling = "backlog/tasks/lore-1 - Fix u bug.md"; // an unquoted `[urgent]` glob ALSO matches this
    writeFileSync(join(root, bracket), "the back-reference edit\n");
    writeFileSync(join(root, sibling), "an unrelated in-progress hand-edit\n");

    const result = await commitBacklogFiles([bracket], { root }, "chore(backlog): add doc back-references (lore link)");

    // `:(literal)` scoping means only the bracket file is staged/committed; the glob-matchable sibling
    // is untouched. Without it, `[urgent]` would expand and sweep the sibling in (the ADR-0012 §1 bug).
    expect(result).toEqual({ committed: true, files: [bracket] });
    const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(status).toContain("Fix u bug.md"); // sibling STILL uncommitted
  });

  test("empty files is a pure no-op: no commit, HEAD unmoved", async () => {
    const before = headSha();
    const result = await commitBacklogFiles([], { root }, "unused");
    expect(result).toEqual({ committed: false, files: [] });
    expect(headSha()).toBe(before);
  });

  test("a passed file that is not actually dirty commits nothing (idempotent no-op)", async () => {
    const before = headSha();
    const result = await commitBacklogFiles(["backlog/tasks/lore-9 - never written.md"], { root }, "unused");
    expect(result).toEqual({ committed: false, files: [] });
    expect(headSha()).toBe(before);
  });

  test("regression (LORE-69): a `..` pathspec that resolves outside backlog/ is refused, not committed — reproduces the task's live git repro", async () => {
    mkdirSync(join(root, "backlog"), { recursive: true });
    mkdirSync(join(root, "docs"), { recursive: true });
    const secret = join(root, "docs", "secret.md");
    writeFileSync(secret, "outside backlog/, must never be committed by lore\n");
    const before = headSha();

    await expect(
      commitBacklogFiles(["backlog/../docs/secret.md"], { root }, "chore(backlog): sync task changes"),
    ).rejects.toThrow(LoreError);

    // Confirms the guard, not git itself, is what stops this: without LORE-69's fix, real git DOES
    // resolve and commit the outside file even through a `:(literal)`-quoted pathspec (the task's own
    // confirmed repro). HEAD must not move, and the outside file must remain untracked.
    expect(headSha()).toBe(before);
    const status = Bun.spawnSync(["git", "status", "--porcelain", "--untracked-files=all"], {
      cwd: root,
      stdout: "pipe",
    }).stdout.toString("utf8");
    expect(status).toContain("docs/secret.md");
  });
});

describe("bunGitSpawn + commitBacklogIfDirty — nested-bundle checkout (real git)", () => {
  test("regression: a lore project nested below the git repository's own top level still commits correctly", async () => {
    // The exact topology adapters/git.ts's `--relative` fix handles for `git log` — `git status` has
    // no equivalent flag at all, so this exercises `porcelainPaths`'s `git rev-parse --show-prefix`
    // translation instead.
    const top = mkdtempSync(join(tmpdir(), "lore-state-nested-"));
    const projectRoot = join(top, "project");
    try {
      gitRun(top, ["init", "-q"]);
      gitRun(top, ["config", "user.name", "lore test"]);
      gitRun(top, ["config", "user.email", "lore-test@example.com"]);
      mkdirSync(join(projectRoot, "backlog", "tasks"), { recursive: true });
      writeFileSync(join(top, ".gitkeep"), "");
      gitRun(top, ["add", "."]);
      gitRun(top, ["commit", "-q", "-m", "initial"]);

      writeFileSync(join(projectRoot, "backlog", "tasks", "lore-1 - x.md"), "hello\n");
      const result = await commitBacklogIfDirty(bunGitSpawn(projectRoot));
      expect(result).toEqual({ committed: true, files: ["backlog/tasks/lore-1 - x.md"] });

      const tree = Bun.spawnSync(["git", "ls-tree", "-r", "HEAD", "--", "project/"], {
        cwd: top,
        stdout: "pipe",
      }).stdout.toString("utf8");
      expect(tree).toContain("project/backlog/tasks/lore-1 - x.md");
      const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: top, stdout: "pipe" }).stdout.toString(
        "utf8",
      );
      expect(status).toBe("");
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });
});
