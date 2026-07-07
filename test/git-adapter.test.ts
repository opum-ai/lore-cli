/**
 * git-adapter.test.ts — the real, `git log`-shelling {@link GitAdapter} (LORE-26, `core/log.ts`).
 *
 * Drives `realGitAdapter`/`resolveHeadSha` against a real temp git repository (no fake — this IS
 * the seam), then feeds the resulting `GitCommit[]` through the already-tested pure `generateLog`
 * (LORE-47) to prove the two compose end to end.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realGitAdapter, resolveHeadSha } from "../src/adapters/git";
import { generateLog } from "../src/core/log";
import { LoreError } from "../src/errors";
import { gitRun as run } from "./helpers";

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

      // The commit that only touched a file OUTSIDE this project's own root reports no files here at
      // all (matching --relative's "exclude changes outside the directory" semantics) rather than a
      // path like "../outside.txt" that isUnderRoot could never match either.
      const outsideCommit = commits.find((c) => c.subject === "add file outside the nested project");
      expect(outsideCommit?.files).toEqual([]);
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
});
