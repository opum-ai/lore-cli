/**
 * git-adapter.test.ts — the real, `git log`-shelling {@link GitAdapter} (LORE-26, `core/log.ts`).
 *
 * Drives `realGitAdapter`/`resolveHeadSha` against a real temp git repository (no fake — this IS
 * the seam), then feeds the resulting `GitCommit[]` through the already-tested pure `generateLog`
 * (LORE-47) to prove the two compose end to end.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realGitAdapter, resolveHeadSha } from "../src/adapters/git";
import { generateLog } from "../src/core/log";
import { LoreError } from "../src/errors";
import { expectError, gitRun as run } from "./helpers";

function freshRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "lore-git-log-"));
  run(root, ["init", "-q"]);
  run(root, ["config", "user.name", "lore test"]);
  run(root, ["config", "user.email", "lore-test@example.com"]);
  return root;
}

function commit(root: string, path: string, contents: string, message: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), contents);
  run(root, ["add", "--", path]);
  run(root, ["commit", "-q", "-m", message]);
}

describe("resolveHeadSha", () => {
  test("returns null in a fresh repo with no commits", () => {
    const root = freshRepo();
    try {
      expect(resolveHeadSha(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns the current HEAD sha once a commit exists", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/index.md", "hello\n", "first");
      const sha = resolveHeadSha(root);
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("regression: throws (does NOT return null) when the directory is not a git repository at all", () => {
    // `git rev-parse HEAD` also exits non-zero for "not a git repository" — that must not collapse
    // to the same null as "a real, merely empty repository" (the case above), or sync would
    // silently emit an empty log.md instead of failing loud for a genuinely broken/missing repo.
    const dir = mkdtempSync(join(tmpdir(), "lore-not-a-repo-"));
    try {
      expect(() => resolveHeadSha(dir)).toThrow(LoreError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("regression: LORE-170 — throws (does NOT return null) when .git/HEAD is corrupted inside an otherwise-valid .git directory", () => {
    // Corrupt `HEAD` with a syntactically invalid ref name (`..` is disallowed by
    // git-check-ref-format) — this is the exact fingerprint the previous `git rev-parse --git-dir`
    // disambiguator could not tell apart from a genuine unborn branch: `--git-dir` still succeeds
    // (the `.git` directory itself is entirely intact and readable) even though `HEAD` cannot
    // resolve, so the old check misclassified this corruption as "real repo, no commits yet" and
    // returned null instead of failing loud, contradicting this function's own documented contract.
    const root = freshRepo();
    try {
      writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/..bad..name\n");
      expect(() => resolveHeadSha(root)).toThrow(LoreError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("realGitAdapter — history()", () => {
  test("parses hash/timestamp/subject/files for a single commit", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "add a");
      const sha = resolveHeadSha(root) as string;
      const commits = realGitAdapter(root).history({ to: sha });
      expect(commits).toHaveLength(1);
      const c = commits[0];
      expect(c?.hash).toBe(sha);
      expect(c?.subject).toBe("add a");
      expect(c?.files).toEqual(["docs/a.md"]);
      // committer date is a real ISO-8601 string with an explicit offset (log.ts's contract) — git's
      // `%cI` renders UTC as a bare "Z" (the common case on a UTC-configured CI runner) rather than
      // "+00:00", and both are valid per log.ts's own ISO_OFFSET pattern.
      expect(c?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("parses multiple commits, each touching multiple files, oldest and newest included", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "add a");
      mkdirSync(join(root, "docs"), { recursive: true });
      writeFileSync(join(root, "docs", "b.md"), "b\n");
      writeFileSync(join(root, "docs", "c.md"), "c\n");
      run(root, ["add", "."]);
      run(root, ["commit", "-q", "-m", "add b and c"]);
      const sha = resolveHeadSha(root) as string;

      const commits = realGitAdapter(root).history({ to: sha });
      expect(commits).toHaveLength(2);
      const subjects = commits.map((c) => c.subject).sort();
      expect(subjects).toEqual(["add a", "add b and c"]);
      const second = commits.find((c) => c.subject === "add b and c");
      expect([...(second?.files ?? [])].sort()).toEqual(["docs/b.md", "docs/c.md"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a `from` bound excludes commits at or before it (exclusive lower bound)", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "first");
      const firstSha = resolveHeadSha(root) as string;
      commit(root, "docs/b.md", "b\n", "second");
      const secondSha = resolveHeadSha(root) as string;

      const commits = realGitAdapter(root).history({ from: firstSha, to: secondSha });
      expect(commits).toHaveLength(1);
      expect(commits[0]?.subject).toBe("second");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("regression: a bundle nested below the git repository's own top level still reports bundle-relative paths", () => {
    // Without --relative, `git log --name-only` always reports paths relative to the repo's TOP
    // LEVEL, never `cwd` — so a lore project whose docs/ isn't at the git top level (a bundle
    // nested inside a larger checkout) would see every file prefixed with that nesting (e.g.
    // "project/docs/a.md" instead of "docs/a.md"), which core/log.ts's `isUnderRoot` (matched
    // against the bundle-relative "docs" root) would never recognize as under the bundle.
    const top = freshRepo();
    try {
      commit(top, "project/docs/a.md", "a\n", "add nested doc");
      writeFileSync(join(top, "outside.txt"), "not part of the bundle\n");
      run(top, ["add", "outside.txt"]);
      run(top, ["commit", "-q", "-m", "add file outside the nested project"]);

      const projectRoot = join(top, "project");
      const sha = resolveHeadSha(projectRoot) as string;
      const commits = realGitAdapter(projectRoot).history({ to: sha });

      const addDoc = commits.find((c) => c.subject === "add nested doc");
      expect(addDoc?.files).toEqual(["docs/a.md"]); // relative to projectRoot, not the repo top level

      // The commit that only touched a file OUTSIDE this project's own root is pruned by the `-- docs`
      // pathspec (LORE-143) before it ever reaches this process at all — it is simply absent here,
      // not present-with-empty-files the way an unscoped `git log` plus post-filtering would report it.
      const outsideCommit = commits.find((c) => c.subject === "add file outside the nested project");
      expect(outsideCommit).toBeUndefined();
    } finally {
      rmSync(top, { recursive: true, force: true });
    }
  });

  test("a subject containing characters near the sentinel/format boundary is not misparsed", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "fix: handle % and | and -> arrows safely");
      const sha = resolveHeadSha(root) as string;
      const commits = realGitAdapter(root).history({ to: sha });
      expect(commits).toHaveLength(1);
      expect(commits[0]?.subject).toBe("fix: handle % and | and -> arrows safely");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("regression: LORE-169 — a non-ASCII file path round-trips unquoted, not as git's default C-style octal-escaped form", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/café.md", "hello\n", "add café doc");
      const sha = resolveHeadSha(root) as string;
      const commits = realGitAdapter(root).history({ to: sha });
      expect(commits).toHaveLength(1);
      // Without `-c core.quotePath=false`, git would instead emit the quoted, octal-escaped form
      // `"docs/caf\303\251.md"` (a literal double-quoted string with backslash escapes) — this
      // adapter has no unquoting logic, so that mangled string would flow straight into log.md.
      expect(commits[0]?.files).toEqual(["docs/café.md"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("regression: LORE-169 — a commit subject containing the literal SENTINEL byte sequence fails loud instead of silently corrupting the parsed commits", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "first");
      // "\x01lore:log-entry\x01" mirrors adapters/git.ts's own SENTINEL exactly. `git commit -m`
      // takes this as a single argv entry (no shell involved), so git accepts it verbatim as the
      // commit subject. Once this subject reaches `git log`'s output, it IS the split delimiter
      // `parseHistory` looks for, so `String.prototype.split` treats it as an extra block boundary
      // splitting this one real commit into multiple malformed ones — the exact silent corruption
      // history()'s `git rev-list --count` cross-check exists to catch.
      commit(root, "docs/b.md", "b\n", "\x01lore:log-entry\x01");
      const sha = resolveHeadSha(root) as string;

      const err = expectError("drift", () => realGitAdapter(root).history({ to: sha }));
      expect(err.message).toContain("git rev-list --count");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an invalid range is a fail-loud drift LoreError", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "first");
      expect(() => realGitAdapter(root).history({ to: "not-a-real-sha" })).toThrow(LoreError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("composes with the pure generateLog (LORE-47) to produce a well-formed log.md", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/adr/0001-x.md", "x\n", "add ADR");
      const sha = resolveHeadSha(root) as string;
      const commits = realGitAdapter(root).history({ to: sha });
      const md = generateLog(commits, { root: "docs" });
      expect(md).toContain("# Change log");
      expect(md).toContain("## docs/adr");
      expect(md).toContain("add ADR");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("LORE-143: the `git log` invocation is scoped with a `-- <root>` pathspec, not left to walk the whole repository", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "add a");
      const sha = resolveHeadSha(root) as string;

      const realSpawnSync = Bun.spawnSync.bind(Bun);
      const seenArgs: string[][] = [];
      const spy = spyOn(Bun, "spawnSync").mockImplementation(
        // biome-ignore lint/suspicious/noExplicitAny: Bun.spawnSync's overload set can't be named as a single call signature
        (...args: any[]) => {
          const cmd = args[0];
          // `cmd[1]` is no longer always "log": history() now prefixes the invocation with
          // `-c core.quotePath=false` (LORE-169), and also shells a separate `git rev-list --count`
          // cross-check — `includes("log")` picks out only the actual `git log` call among those.
          if (Array.isArray(cmd) && cmd[0] === "git" && cmd.includes("log")) {
            seenArgs.push(cmd as string[]);
          }
          // biome-ignore lint/suspicious/noExplicitAny: forwarding to the real spawnSync overload set
          return (realSpawnSync as any)(...args);
        },
      );
      try {
        realGitAdapter(root).history({ to: sha }, "docs");
      } finally {
        spy.mockRestore();
      }

      expect(seenArgs).toHaveLength(1);
      const args = seenArgs[0] ?? [];
      // A pathspec always comes after a `--` separator, restricting the walk to exactly `docs` —
      // not merely narrowing `--name-only`'s per-commit file list after the fact.
      const dashIndex = args.indexOf("--");
      expect(dashIndex).toBeGreaterThan(-1);
      expect(args.slice(dashIndex + 1)).toEqual(["docs"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("LORE-143: a commit touching only files outside root is excluded from history() itself, not merely from its files", () => {
    const root = freshRepo();
    try {
      commit(root, "docs/a.md", "a\n", "add doc");
      writeFileSync(join(root, "src.ts"), "code\n");
      run(root, ["add", "src.ts"]);
      run(root, ["commit", "-q", "-m", "add unrelated source file"]);
      const sha = resolveHeadSha(root) as string;

      const commits = realGitAdapter(root).history({ to: sha }, "docs");
      // Not "commits with this subject report no files" — the commit is absent from the array
      // entirely, proving the `git log` walk itself was pruned to `docs`, not post-filtered later.
      expect(commits).toHaveLength(1);
      expect(commits.some((c) => c.subject === "add unrelated source file")).toBe(false);
      expect(commits[0]?.subject).toBe("add doc");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
