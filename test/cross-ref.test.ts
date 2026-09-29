/**
 * test/cross-ref.test.ts — `lore query --across-refs` (LCLI-652, DEC-40 / ODOC-330).
 *
 * The view's contract is a cross-CLI agreement with quest-cli (QCLI-417), so the assertions here
 * are deliberately about SPELLINGS and SHAPES rather than only about behaviour: the envelope
 * position of `coverage`, the null-instead-of-omitted `pullRequest`, the full 40-hex `sha`, and the
 * exit/error_type pair for an incomplete read are all things a consumer of both tools depends on.
 *
 * Remote-dependent paths are proven with FIXTURES, never by adding a remote from a shell: the
 * `origin` section is written into `.git/config` by the fixture itself (operator ruling,
 * ODOC-OP-2026-09-29-11 — `git remote add` is a remote-changing shape even in a throwaway repo).
 * The forge is injected everywhere the open-PR population is exercised, so no test dials a network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ForgeAdapter, type ForgeDiscovery, realForgeAdapter } from "../src/adapters/forge";
import { run } from "../src/cli";
import { runQuery } from "../src/commands/query";
import type { CrossRefCoverage, CrossRefGit, RefProvenance } from "../src/core/cross-ref";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-cross-ref-"));
  git(root, ["init", "-q", "-b", "dev"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "fixture"]);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run one git command in `cwd`, returning trimmed stdout (throws on a non-zero exit). */
function git(cwd: string, args: readonly string[]): string {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${proc.exitCode}: ${proc.stderr.toString("utf8")}`);
  }
  return proc.stdout.toString("utf8").trim();
}

/** Write a file under `root`, creating parent directories. */
function write(rel: string, contents: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

/** A minimal valid bundle: a root index plus one story whose body mentions `retention`. */
function writeBundle(body = "Soft delete retention.\n"): void {
  write("docs/index.md", "---\ntype: Reference\nsummary: Root.\n---\nRoot.\n");
  write("docs/stories/retention.md", `---\ntype: Story\ntitle: Retention\nsummary: Soft delete.\n---\n${body}`);
}

/** Commit everything currently in the working tree. */
function commit(message: string): string {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

/**
 * Point `origin` at `url` by writing the config SECTION directly. Never `git remote add`: that is a
 * remote-changing command shape, refused first-party even for a fixture (ODOC-OP-2026-09-29-11).
 */
function setOrigin(url: string): void {
  // QUOTED, with backslashes normalized to forward slashes: a Windows path in an unquoted value
  // is parsed for backslash escapes, and every git call then dies with "fatal: bad config line N"
  // — measured on the Windows CI runner (a D:\a\… fixture path) and reproduced locally with a
  // backslash-bearing path before the quotes went in.
  const portable = url.replaceAll("\\", "/");
  appendFileSync(
    join(root, ".git", "config"),
    `[remote "origin"]\n\turl = "${portable}"\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
  );
}

/**
 * Create the remote-tracking anchor the view reads — `refs/remotes/origin/dev` — the way a
 * checkout that has fetched would have it. `git fetch origin dev` writes FETCH_HEAD only, so the
 * fixture materializes the ref directly, exactly as `test/assert-main-fast-forward.test.ts` does.
 */
function anchorOriginDev(sha?: string): void {
  git(root, ["update-ref", "refs/remotes/origin/dev", sha ?? git(root, ["rev-parse", "dev"])]);
}

/** A bare repository standing in for a real remote, with `dev` pushed into it. */
function bareRemoteWithDev(): string {
  const bare = mkdtempSync(join(tmpdir(), "lore-cross-ref-remote-"));
  Bun.spawnSync(["git", "init", "--bare", "-q", bare], { stdout: "pipe", stderr: "pipe" });
  git(root, ["push", "-q", bare, "dev:refs/heads/dev"]);
  return bare;
}

/** A forge seam returning a fixed discovery outcome. */
function fakeForge(discovery: ForgeDiscovery): ForgeAdapter {
  return { listOpenPullRequests: async () => discovery };
}

/** A forge seam listing one pull request at `headRefOid`. */
function forgeWithPullRequests(
  repository: string,
  pullRequests: readonly { number: number; headRefOid: string }[],
): ForgeAdapter {
  return fakeForge({
    ok: true,
    repository,
    pullRequests: pullRequests.map((entry) => ({
      number: entry.number,
      headRefName: `feature-${entry.number}`,
      headRefOid: entry.headRefOid,
    })),
  });
}

/** Run `query` in-process with the given args and seams; returns the exit code and both streams. */
async function queryAt(
  args: readonly string[],
  seams: { forge?: ForgeAdapter; now?: () => Date; git?: CrossRefGit } = {},
) {
  const stdout = capture();
  const stderr = capture();
  const code = await Promise.resolve(
    runQuery({ root, output: JSON_CTX, stdout, stderr, args: [...args], crossRef: seams }),
  );
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

/** Run `query` through the CLI dispatch (real output modes, real error rendering). */
async function queryViaCli(args: readonly string[], output: OutputContext = JSON_CTX) {
  const stdout = capture();
  const stderr = capture();
  const code = await run(["bun", "cli", "query", ...args], { stdout, stderr, cwd: root, isTTY: false });
  return { code, stdout: stdout.text(), stderr: stderr.text(), mode: output.mode };
}

/** The envelope a cross-ref success emits, with the pieces every test wants. */
function parseEnvelope(text: string): {
  keys: string[];
  data: { hits: { id: string; refProvenance?: RefProvenance }[]; total: number; shown: number; truncated: boolean };
  coverage: CrossRefCoverage;
} {
  const envelope = JSON.parse(text) as Record<string, unknown>;
  return {
    keys: Object.keys(envelope),
    data: envelope.data as never,
    coverage: envelope.coverage as CrossRefCoverage,
  };
}

// ── the explicit population: rows, provenance, coverage ────────────────────────

describe("cross-ref — explicit refs", () => {
  test("a document that exists only on a named ref is visible, with its ref and commit as provenance", async () => {
    writeBundle();
    commit("base");
    git(root, ["checkout", "-qb", "feature"]);
    write(
      "docs/adr-branch-model.md",
      "---\ntype: ADR\ntitle: Branch model\nsummary: Records stay atomic.\n---\nRecords stay atomic with their branch.\n",
    );
    const featureSha = commit("feature adds an ADR");

    const { code, stdout } = await queryAt(["records", "--across-refs=dev", "--across-refs=feature"]);
    expect(code).toBe(0);
    const { data, coverage } = parseEnvelope(stdout);

    expect(data.hits.map((hit) => hit.id)).toEqual(["adr-branch-model"]);
    expect(data.hits[0]?.refProvenance).toEqual({ ref: "feature", pullRequest: null, sha: featureSha });
    expect(coverage).toMatchObject({ complete: true, population: "explicit" });
    expect(coverage.refsRead.map((entry) => entry.ref)).toEqual(["dev", "feature"]);
    for (const entry of coverage.refsRead) expect(entry.sha).toMatch(/^[0-9a-f]{40}$/u);
  });

  test("coverage sits after data and before principal — the position agreed with quest-cli", async () => {
    writeBundle();
    commit("base");
    const { stdout } = await queryAt(["retention", "--across-refs=dev"]);
    expect(parseEnvelope(stdout).keys).toEqual(["schemaVersion", "kind", "data", "coverage", "principal"]);
  });

  test("a differing copy on another ref is shown beside dev's, and an identical one is not duplicated", async () => {
    writeBundle("Soft delete retention.\n");
    const devSha = commit("base");
    git(root, ["checkout", "-qb", "feature"]);
    // Only the story changes; the ADR is identical on both refs.
    write(
      "docs/stories/retention.md",
      "---\ntype: Story\ntitle: Retention\nsummary: Soft delete.\n---\nSoft delete retention, rewritten on the branch.\n",
    );
    write(
      "docs/adr-shared.md",
      "---\ntype: ADR\ntitle: Shared\nsummary: Same on both refs.\n---\nIdentical on both refs.\n",
    );
    commit("feature rewrites the story");
    git(root, ["checkout", "-q", "dev"]);
    write(
      "docs/adr-shared.md",
      "---\ntype: ADR\ntitle: Shared\nsummary: Same on both refs.\n---\nIdentical on both refs.\n",
    );
    const devWithShared = commit("dev adds the same ADR");

    const { stdout } = await queryAt(["--type", "Story", "--across-refs=dev", "--across-refs=feature"]);
    const rows = parseEnvelope(stdout).data.hits;
    expect(rows.map((row) => [row.id, row.refProvenance?.ref])).toEqual([
      ["stories/retention", "dev"],
      ["stories/retention", "feature"],
    ]);
    // dev's row carries the commit dev was read at, the branch's row its own.
    expect(rows[0]?.refProvenance?.sha).toBe(devWithShared);
    expect(rows[0]?.refProvenance?.sha).not.toBe(devSha);

    const shared = await queryAt(["identical", "--across-refs=dev", "--across-refs=feature"]);
    const sharedRows = parseEnvelope(shared.stdout).data.hits;
    expect(sharedRows.map((row) => row.refProvenance?.ref)).toEqual(["dev"]);
  });

  test("the anchor need not be named first, and a ref-order that puts it last still collapses", async () => {
    writeBundle();
    commit("base");
    git(root, ["checkout", "-qb", "feature"]);
    write(
      "docs/adr-shared.md",
      "---\ntype: ADR\ntitle: Shared\nsummary: Same on both refs.\n---\nIdentical on both refs.\n",
    );
    commit("feature adds a doc dev also has");
    git(root, ["checkout", "-q", "dev"]);
    write(
      "docs/adr-shared.md",
      "---\ntype: ADR\ntitle: Shared\nsummary: Same on both refs.\n---\nIdentical on both refs.\n",
    );
    commit("dev adds the same doc");

    // The anchor is named LAST here: the collapse needs dev's digests before another ref's rows
    // are considered, so the reader must reorder rather than trust the caller's order.
    const { stdout } = await queryAt(["identical", "--across-refs=feature", "--across-refs=dev"]);
    const { data, coverage } = parseEnvelope(stdout);
    expect(data.hits.map((hit) => hit.refProvenance?.ref)).toEqual(["dev"]);
    expect(coverage.refsRead.map((entry) => entry.ref)).toEqual(["dev", "feature"]);
  });

  test("an id absent from dev is shown once per ref carrying it, and coverage key order is fixed", async () => {
    writeBundle();
    commit("base");
    git(root, ["checkout", "-qb", "alpha"]);
    write("docs/adr-shared.md", "---\ntype: ADR\ntitle: Shared\nsummary: Only on branches.\n---\nOnly on branches.\n");
    commit("alpha adds it");
    git(root, ["checkout", "-qb", "beta", "dev"]);
    write("docs/adr-shared.md", "---\ntype: ADR\ntitle: Shared\nsummary: Only on branches.\n---\nOnly on branches.\n");
    commit("beta adds it too");

    const discovered = new Date("2026-09-29T00:00:00.000Z");
    const { stdout } = await queryAt(["branches", "--across-refs=alpha", "--across-refs=beta"], {
      now: () => discovered,
    });
    const { data, coverage } = parseEnvelope(stdout);
    // No dev among the named refs, so there is nothing to collapse against: one row per ref.
    expect(data.hits.map((hit) => hit.refProvenance?.ref)).toEqual(["alpha", "beta"]);
    // The coverage object's own key order is part of the cross-CLI agreement, so it is asserted
    // rather than left to `toMatchObject` (which cannot see order).
    expect(Object.keys(coverage)).toEqual(["complete", "population", "discoveredAt", "refsRead", "refsUnreadable"]);
    expect(coverage.discoveredAt).toBe("2026-09-29T00:00:00.000Z");
  });

  test("a ref with more matches than the default cap is not truncated per ref", async () => {
    writeBundle();
    for (let index = 0; index < 25; index += 1) {
      write(
        `docs/adr-${index}.md`,
        `---\ntype: ADR\ntitle: A${index}\nsummary: retention ${index}\n---\nretention ${index}.\n`,
      );
    }
    commit("many matches");

    const { stdout } = await queryAt(["retention", "--across-refs=dev"]);
    const { data } = parseEnvelope(stdout);
    // A per-ref default cap of 20 would report total 20 and truncated false: a silent cut.
    expect(data.total).toBeGreaterThan(20);
    expect(data.shown).toBe(20);
    expect(data.truncated).toBe(true);
  });

  test("a ref with no bundle at all was still read — it documents nothing, and coverage stays complete", async () => {
    writeBundle();
    commit("base");
    git(root, ["checkout", "-qb", "no-docs"]);
    git(root, ["rm", "-rq", "docs"]);
    commit("a branch that carries no bundle");

    const { code, stdout } = await queryAt(["retention", "--across-refs=dev", "--across-refs=no-docs"]);
    expect(code).toBe(0);
    const { data, coverage } = parseEnvelope(stdout);
    // Read, not unreadable: one branch that predates `docs/` must not fail the whole view.
    expect(coverage.complete).toBe(true);
    expect(coverage.refsRead.map((entry) => entry.ref)).toEqual(["dev", "no-docs"]);
    expect(coverage.refsUnreadable).toEqual([]);
    expect(data.hits.map((hit) => hit.refProvenance?.ref)).toEqual(["dev"]);
  });

  test("an unreadable ref refuses with exit 6, a drift envelope carrying coverage in input, and nothing on stdout", async () => {
    writeBundle();
    commit("base");
    const { code, stdout, stderr } = await queryViaCli([
      "retention",
      "--across-refs=dev",
      "--across-refs=nope",
      "--json",
    ]);
    expect(code).toBe(6);
    expect(stdout).toBe("");
    const envelope = JSON.parse(stderr) as {
      error_type: string;
      message: string;
      input: { coverage: CrossRefCoverage };
    };
    expect(envelope.error_type).toBe("drift");
    expect(envelope.message).toContain("nope");
    expect(envelope.input.coverage).toMatchObject({ complete: false, population: "explicit" });
    expect(envelope.input.coverage.refsUnreadable).toHaveLength(1);
    expect(envelope.input.coverage.refsUnreadable[0]).toMatchObject({ ref: "nope", pullRequest: null });
    expect(envelope.input.coverage.refsRead.map((entry) => entry.ref)).toEqual(["dev"]);
  });

  test("--allow-partial answers the same run with complete:false instead of refusing", async () => {
    writeBundle();
    commit("base");
    const { code, stdout, stderr } = await queryViaCli([
      "retention",
      "--across-refs=dev",
      "--across-refs=nope",
      "--allow-partial",
      "--json",
    ]);
    expect(code).toBe(0);
    const { data, coverage } = parseEnvelope(stdout);
    expect(data.hits.map((hit) => hit.refProvenance?.ref)).toEqual(["dev"]);
    expect(coverage.complete).toBe(false);
    expect(coverage.refsUnreadable.map((entry) => entry.ref)).toEqual(["nope"]);
    // The human half of coverage: a reason reaches stderr even though the run succeeded.
    expect(stderr).toContain("could not read nope");
  });

  test("--limit caps the merged listing and says so", async () => {
    writeBundle();
    commit("base");
    git(root, ["checkout", "-qb", "feature"]);
    write("docs/adr-a.md", "---\ntype: ADR\ntitle: A\nsummary: retention A\n---\nretention A.\n");
    write("docs/adr-b.md", "---\ntype: ADR\ntitle: B\nsummary: retention B\n---\nretention B.\n");
    commit("feature adds two ADRs");

    const unlimited = parseEnvelope(
      (await queryAt(["retention", "--across-refs=dev", "--across-refs=feature"])).stdout,
    );
    const capped = parseEnvelope(
      (await queryAt(["retention", "--across-refs=dev", "--across-refs=feature", "--limit", "2"])).stdout,
    );
    expect(unlimited.data.total).toBeGreaterThan(2);
    expect(capped.data).toMatchObject({ shown: 2, truncated: true });
    expect(capped.data.total).toBe(unlimited.data.total);
  });
});

// ── the open-PR population ────────────────────────────────────────────────────

describe("cross-ref — open pull requests", () => {
  test("origin/dev plus a PR head, with pullRequest provenance on the PR's row", async () => {
    writeBundle();
    commit("base");
    const bare = bareRemoteWithDev();
    try {
      git(root, ["checkout", "-qb", "feature"]);
      write(
        "docs/adr-from-pr.md",
        "---\ntype: ADR\ntitle: From the PR\nsummary: Discovery reads.\n---\nDiscovery reads pull requests.\n",
      );
      const prSha = commit("feature adds an ADR");
      setOrigin(bare);
      anchorOriginDev();

      const { code, stdout, stderr } = await queryAt(["discovery", "--across-refs"], {
        forge: forgeWithPullRequests("opum-ai/fixture", [{ number: 42, headRefOid: prSha }]),
      });
      expect(stderr).toBe("");
      expect(code).toBe(0);
      const { data, coverage } = parseEnvelope(stdout);
      expect(coverage).toMatchObject({ complete: true, population: "open-prs" });
      expect(coverage.refsRead.map((entry) => [entry.ref, entry.pullRequest])).toEqual([
        ["origin/dev", null],
        ["refs/pull/42/head", "opum-ai/fixture#42"],
      ]);
      expect(data.hits.map((hit) => [hit.id, hit.refProvenance?.pullRequest])).toEqual([
        ["adr-from-pr", "opum-ai/fixture#42"],
      ]);
      expect(data.hits[0]?.refProvenance?.ref).toBe("refs/pull/42/head");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  }, 30_000);

  test("a discovered PR head that is not local is fetched by refspec, and no ref is created", async () => {
    writeBundle();
    commit("base");
    const bare = bareRemoteWithDev();
    // A second checkout authors the PR commit, so the object does NOT exist in the fixture — which
    // is what forces the fetch path rather than the already-local shortcut.
    const author = mkdtempSync(join(tmpdir(), "lore-cross-ref-author-"));
    try {
      // Cloned at `dev` so the PR commit is a CHILD of it: a real pull request's tree carries the
      // base's bundle, and a commit built on an empty tree would prove nothing about this path.
      git(root, ["clone", "-q", "-b", "dev", bare, author]);
      git(author, ["checkout", "-qb", "pr-branch"]);
      writeFileSync(
        join(author, "docs", "adr-from-pr.md"),
        "---\ntype: ADR\ntitle: From the PR\nsummary: Discovery reads.\n---\nDiscovery reads pull requests.\n",
      );
      // Identity inline rather than two extra `git config` calls: this test is subprocess-heavy
      // enough that its budget is asserted (below), so it does not spend spawns on ceremony.
      git(author, ["-c", "user.email=pr@example.invalid", "-c", "user.name=pr", "add", "-A"]);
      git(author, [
        "-c",
        "user.email=pr@example.invalid",
        "-c",
        "user.name=pr",
        "commit",
        "-qm",
        "the pull request's commit",
      ]);
      const prSha = git(author, ["rev-parse", "HEAD"]);
      git(author, ["push", "-q", "origin", "HEAD:refs/pull/7/head"]);

      setOrigin(bare);
      anchorOriginDev();
      // The predicate this test rests on: the commit really is absent locally before the run.
      expect(Bun.spawnSync(["git", "cat-file", "-e", `${prSha}^{commit}`], { cwd: root }).exitCode).not.toBe(0);
      const refsBefore = git(root, ["for-each-ref", "--format=%(refname)"]);

      const { code, stdout } = await queryAt(["discovery", "--across-refs"], {
        forge: forgeWithPullRequests("opum-ai/fixture", [{ number: 7, headRefOid: prSha }]),
      });
      expect(code).toBe(0);
      const { data } = parseEnvelope(stdout);
      expect(data.hits.map((hit) => [hit.id, hit.refProvenance?.sha])).toEqual([["adr-from-pr", prSha]]);
      // The fetch is destination-less: objects and FETCH_HEAD only, no ref appears.
      expect(git(root, ["for-each-ref", "--format=%(refname)"])).toBe(refsBefore);
    } finally {
      rmSync(author, { recursive: true, force: true });
      rmSync(bare, { recursive: true, force: true });
    }
    // 30s, matching this repo's other subprocess-heavy suites (agent-plugins, release-provenance):
    // these five tests build a bare remote, and this one clones, commits, pushes and fetches across
    // two repositories. The default 10s budget killed the spawn mid-call on a loaded CI runner, on
    // both platforms, which reported as `git for-each-ref exited null` — a slow runner, not a hang.
  }, 30_000);

  test("reading origin/dev fetches objects WITHOUT moving refs/remotes/origin/dev", async () => {
    writeBundle();
    commit("base");
    const bare = bareRemoteWithDev();
    try {
      // The remote moves ahead of this checkout's remote-tracking ref — the ordinary case, and the
      // one where a fetch that updates refs is observable.
      write("docs/adr-later.md", "---\ntype: ADR\ntitle: Later\nsummary: retention later.\n---\nretention, later.\n");
      const ahead = commit("dev moves ahead");
      git(root, ["push", "-q", bare, "dev:refs/heads/dev"]);
      setOrigin(bare);
      const anchor = git(root, ["rev-parse", "HEAD~1"]);
      anchorOriginDev(anchor);

      const { code, stdout } = await queryAt(["retention", "--across-refs"], {
        forge: forgeWithPullRequests("opum-ai/fixture", []),
      });
      expect(code).toBe(0);
      // The commit READ is the remote's tip...
      expect(parseEnvelope(stdout).coverage.refsRead[0]?.sha).toBe(ahead);
      // ...and the remote-tracking ref has not moved: the fetch is `--refmap=` (FETCH_HEAD only),
      // which is what "the view never writes" rests on. Without the flag git applies the configured
      // heads refspec and this assertion fails — measured both ways on git 2.55.0.
      expect(git(root, ["rev-parse", "refs/remotes/origin/dev"])).toBe(anchor);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  }, 30_000);

  test("every discovered pull request is read, in ascending number order", async () => {
    writeBundle();
    commit("base");
    const bare = bareRemoteWithDev();
    try {
      git(root, ["checkout", "-qb", "feature"]);
      write("docs/adr-one.md", "---\ntype: ADR\ntitle: One\nsummary: discovery one.\n---\ndiscovery one.\n");
      const first = commit("first pull request");
      write("docs/adr-two.md", "---\ntype: ADR\ntitle: Two\nsummary: discovery two.\n---\ndiscovery two.\n");
      const second = commit("second pull request");
      setOrigin(bare);
      anchorOriginDev();

      // Discovered out of order on purpose: the listing is ordered by number, not by discovery.
      const { code, stdout } = await queryAt(["discovery", "--across-refs"], {
        forge: forgeWithPullRequests("opum-ai/fixture", [
          { number: 9, headRefOid: second },
          { number: 3, headRefOid: first },
        ]),
      });
      expect(code).toBe(0);
      const { coverage } = parseEnvelope(stdout);
      expect(coverage.refsRead.map((entry) => entry.pullRequest)).toEqual([
        null,
        "opum-ai/fixture#3",
        "opum-ai/fixture#9",
      ]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  }, 30_000);

  test("a read of ZERO refs is refused even with --allow-partial", async () => {
    writeBundle();
    commit("base");
    // `{complete: false, refsRead: [], hits: []}` cannot be told apart from "nothing is
    // documented", so partiality cannot answer it — the boundary quest-cli's landed half
    // (QCLI-417) names, and ADR decision 7's rule read to its end.
    const { code, stdout, stderr } = await queryViaCli([
      "retention",
      "--across-refs=does-not-exist",
      "--allow-partial",
      "--json",
    ]);
    expect(code).toBe(6);
    expect(stdout).toBe("");
    const envelope = JSON.parse(stderr) as {
      error_type: string;
      message: string;
      input: { coverage: CrossRefCoverage };
    };
    expect(envelope.error_type).toBe("drift");
    expect(envelope.message).toContain("read no refs at all");
    expect(envelope.input.coverage).toMatchObject({ complete: false, refsRead: [] });
  });

  test("a failure reason carries no absolute path and no remote URL", async () => {
    writeBundle();
    commit("base");
    // A remote that exists as a NAME but cannot be reached. The POSIX form is the common one; the
    // backslash UNC form is here because a review pass measured an earlier POSIX-only scrubber
    // letting it through byte-identical, and because git echoes the CONFIGURED URL on any platform.
    setOrigin("/nonexistent/lore-cross-ref-remote.git");
    anchorOriginDev();

    const { code, stderr } = await queryViaCli(["retention", "--across-refs", "--json"]);
    expect(code).toBe(6);
    const envelope = JSON.parse(stderr) as { input: { coverage: CrossRefCoverage } };
    const reasons = envelope.input.coverage.refsUnreadable.map((entry) => entry.reason).join(" | ");
    expect(reasons).not.toContain("/nonexistent");
    expect(reasons).not.toContain("does not appear to be a git repository");

    // The same, for a UNC-shaped remote: nothing that looks like a path or a URL may survive.
    git(root, ["config", "remote.origin.url", String.raw`\\server\share\secret\repo.git`]);
    const unc = await queryViaCli(["retention", "--across-refs", "--json"]);
    expect(unc.code).toBe(6);
    const uncReasons = (
      JSON.parse(unc.stderr) as { input: { coverage: CrossRefCoverage } }
    ).input.coverage.refsUnreadable
      .map((entry) => entry.reason)
      .join(" | ");
    expect(uncReasons).not.toContain("server");
    expect(uncReasons).not.toContain("<path>");
  }, 30_000);

  test("discovery that cannot run is incomplete coverage: exit 6, drift, coverage in input, stdout empty", async () => {
    writeBundle();
    commit("base");
    // A WORKING remote that is simply not GitHub: a local path. Discovery fails (non-GitHub) while
    // the dev read still succeeds, which is the real shape of the case — a GitLab remote, not a
    // dead one.
    const bare = bareRemoteWithDev();
    try {
      setOrigin(bare);
      anchorOriginDev();

      const { code, stdout, stderr } = await queryViaCli(["retention", "--across-refs", "--json"]);
      expect(code).toBe(6);
      expect(stdout).toBe("");
      const envelope = JSON.parse(stderr) as { error_type: string; input: { coverage: CrossRefCoverage } };
      expect(envelope.error_type).toBe("drift");
      // Population degrades to dev-only, and the discovery failure is the single unreadable entry.
      expect(envelope.input.coverage).toMatchObject({ complete: false, population: "dev-only" });
      expect(envelope.input.coverage.refsUnreadable).toHaveLength(1);
      expect(envelope.input.coverage.refsUnreadable[0]).toMatchObject({ ref: null, pullRequest: null });
      expect(envelope.input.coverage.refsUnreadable[0]?.reason).toContain("not a GitHub remote");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  }, 30_000);

  test("--allow-partial degrades a failed discovery to a dev-only answer, never to complete:true", async () => {
    writeBundle();
    commit("base");
    const bare = bareRemoteWithDev();
    try {
      setOrigin(bare);
      anchorOriginDev();
      const { code, stdout } = await queryAt(["retention", "--across-refs", "--allow-partial"], {
        forge: fakeForge({ ok: false, reason: "the `gh` CLI is not installed or not on PATH" }),
      });
      expect(code).toBe(0);
      const { coverage } = parseEnvelope(stdout);
      expect(coverage).toMatchObject({ complete: false, population: "dev-only" });
      expect(coverage.refsRead.map((entry) => entry.ref)).toEqual(["origin/dev"]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  }, 30_000);

  test("a repository with no origin at all is a not_found (exit 3) — the agreed anchor check, before discovery", async () => {
    writeBundle();
    commit("base");
    const { code, stdout, stderr } = await queryViaCli(["retention", "--across-refs", "--json"]);
    expect(code).toBe(3);
    expect(stdout).toBe("");
    expect((JSON.parse(stderr) as { error_type: string }).error_type).toBe("not_found");
  });

  test("an origin without a resolvable origin/dev is exit 3 too", async () => {
    writeBundle();
    commit("base");
    setOrigin("git@github.com:opum-ai/fixture.git");
    const { code, stderr } = await queryViaCli(["retention", "--across-refs", "--json"]);
    expect(code).toBe(3);
    expect((JSON.parse(stderr) as { message: string }).message).toContain("origin/dev");
  });
});

// ── the view is read-only ─────────────────────────────────────────────────────

describe("cross-ref — the view never writes", () => {
  test("the working tree, the index, HEAD and the ref list are untouched by a run", async () => {
    writeBundle();
    commit("base");
    git(root, ["checkout", "-qb", "feature"]);
    write(
      "docs/adr-from-pr.md",
      "---\ntype: ADR\ntitle: From the PR\nsummary: Discovery reads.\n---\nDiscovery reads pull requests.\n",
    );
    const prSha = commit("feature adds an ADR");
    git(root, ["checkout", "-q", "dev"]);
    const bare = bareRemoteWithDev();
    try {
      setOrigin(bare);
      anchorOriginDev();
      const before = {
        status: git(root, ["status", "--porcelain"]),
        head: git(root, ["rev-parse", "HEAD"]),
        refs: git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]),
        index: git(root, ["ls-files", "--stage"]),
      };
      const { code } = await queryAt(["discovery", "--across-refs"], {
        forge: forgeWithPullRequests("opum-ai/fixture", [{ number: 7, headRefOid: prSha }]),
      });
      expect(code).toBe(0);
      const after = {
        status: git(root, ["status", "--porcelain"]),
        head: git(root, ["rev-parse", "HEAD"]),
        refs: git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]),
        index: git(root, ["ls-files", "--stage"]),
      };
      expect(after).toEqual(before);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  }, 30_000);

  test("a mutating command refuses the flag as an unknown option", async () => {
    writeBundle();
    commit("base");
    const stdout = capture();
    const stderr = capture();
    const code = await run(["bun", "cli", "sync", "--across-refs", "--json"], {
      stdout,
      stderr,
      cwd: root,
      isTTY: false,
    });
    expect(code).toBe(2);
    expect(JSON.parse(stderr.text())).toMatchObject({ error_type: "usage" });
  });
});

// ── usage errors ──────────────────────────────────────────────────────────────

describe("cross-ref — flag shape", () => {
  test("bare and valued forms cannot be mixed, and allow-partial needs the flag", async () => {
    writeBundle();
    commit("base");
    const mixed = await queryViaCli(["retention", "--across-refs", "--across-refs=dev", "--json"]);
    expect(mixed.code).toBe(2);
    expect((JSON.parse(mixed.stderr) as { message: string }).message).toContain("bare and valued");

    const lone = await queryViaCli(["retention", "--allow-partial", "--json"]);
    expect(lone.code).toBe(2);
    expect((JSON.parse(lone.stderr) as { message: string }).message).toContain("requires --across-refs");
  });

  test("a search text that followed the flag is refused as a ref name, not read as one", async () => {
    writeBundle();
    commit("base");
    // `--across-refs` takes an optional value, so Commander hands the text to the flag. A ref name
    // cannot contain spaces, so this is a usage error rather than an unreadable ref named
    // "soft delete" and an exit 6 that reads like a repository problem.
    const { code, stderr } = await queryViaCli(["--across-refs", "soft delete", "--json"]);
    expect(code).toBe(2);
    const envelope = JSON.parse(stderr) as { error_type: string; message: string; hint: string };
    expect(envelope.error_type).toBe("usage");
    expect(envelope.message).toContain("soft delete");
    expect(envelope.hint).toContain("cannot contain spaces");
  });

  test("--across-refs and --workspace are one explicit scope, not two", async () => {
    writeBundle();
    commit("base");
    const { code, stderr } = await queryViaCli(["retention", "--across-refs=dev", "--workspace", "w.json", "--json"]);
    expect(code).toBe(2);
    expect((JSON.parse(stderr) as { message: string }).message).toContain("cannot be combined");
  });
});

// ── rendering ─────────────────────────────────────────────────────────────────

describe("cross-ref — text modes", () => {
  test("plain output names each row's ref and always prints the coverage line", async () => {
    writeBundle();
    commit("base");
    const stdout = capture();
    await Promise.resolve(
      runQuery({ root, output: PLAIN_CTX, stdout, stderr: capture(), args: ["retention", "--across-refs=dev"] }),
    );
    const lines = stdout.text().split("\n");
    expect(lines[0]).toContain("across 1 ref");
    expect(lines.some((line) => line.includes("@dev"))).toBe(true);
    expect(lines).toContain("coverage: complete — 1 ref read");
  });

  test("an incomplete view says so in the text, and an empty listing still states what was read", async () => {
    writeBundle();
    commit("base");
    const stdout = capture();
    await Promise.resolve(
      runQuery({
        root,
        output: PLAIN_CTX,
        stdout,
        stderr: capture(),
        args: ["nothing-matches-this", "--across-refs=dev", "--across-refs=nope", "--allow-partial"],
      }),
    );
    const text = stdout.text();
    expect(text).toContain("0 rows");
    expect(text).toContain("coverage: INCOMPLETE — 1 ref read; unreadable: nope");
  });
});

// ── adapters/forge: the real adapter's classifications, offline ────────────────

describe("forge adapter — classifications", () => {
  /** A fixture origin that LOOKS like GitHub, so the adapter reaches its spawn. */
  function githubShapedFixture(): void {
    writeBundle();
    commit("base");
    setOrigin("git@github.com:opum-ai/fixture.git");
  }

  test("no origin remote", async () => {
    writeBundle();
    commit("base");
    const discovery = await realForgeAdapter().listOpenPullRequests({ cwd: root, base: "dev" });
    expect(discovery).toMatchObject({ ok: false });
    if (!discovery.ok) expect(discovery.reason).toContain("no `origin` remote");
  });

  test("a non-GitHub origin — and the URL itself never reaches the reason", async () => {
    writeBundle();
    commit("base");
    setOrigin("https://gitlab.example.invalid/owner/secret-token@fixture.git");
    const discovery = await realForgeAdapter().listOpenPullRequests({ cwd: root, base: "dev" });
    expect(discovery).toMatchObject({ ok: false });
    if (!discovery.ok) {
      expect(discovery.reason).toContain("not a GitHub remote");
      expect(discovery.reason).not.toContain("secret-token");
    }
  });

  test("a gh binary that cannot be started at all (the no-gh-on-PATH case)", async () => {
    githubShapedFixture();
    const forge = realForgeAdapter({
      spawn: () => {
        throw new Error("ENOENT: no such file or directory, posix_spawn 'gh'");
      },
    });
    const discovery = await forge.listOpenPullRequests({ cwd: root, base: "dev" });
    expect(discovery).toMatchObject({ ok: false });
    if (!discovery.ok) expect(discovery.reason).toContain("not installed or not on PATH");
  });

  test("a non-zero gh exit is classified by code, and carries no raw stderr", async () => {
    githubShapedFixture();
    const forge = realForgeAdapter({
      spawn: async () => ({ stdout: "", stderr: "auth required in /home/someone/.config/gh\n", exitCode: 4 }),
    });
    const discovery = await forge.listOpenPullRequests({ cwd: root, base: "dev" });
    expect(discovery).toMatchObject({ ok: false });
    if (!discovery.ok) {
      expect(discovery.reason).toContain("exited 4");
      expect(discovery.reason).toContain("not authenticated");
      expect(discovery.reason).not.toContain("/home/someone");
    }
  });

  test("malformed payloads are refused rather than guessed at", async () => {
    githubShapedFixture();
    const notJson = realForgeAdapter({ spawn: async () => ({ stdout: "not json", stderr: "", exitCode: 0 }) });
    expect((await notJson.listOpenPullRequests({ cwd: root, base: "dev" })).ok).toBe(false);

    const badRecord = realForgeAdapter({
      spawn: async () => ({
        stdout: JSON.stringify([{ number: 1, headRefName: "x", headRefOid: "short" }]),
        stderr: "",
        exitCode: 0,
      }),
    });
    const discovery = await badRecord.listOpenPullRequests({ cwd: root, base: "dev" });
    expect(discovery).toMatchObject({ ok: false });
    if (!discovery.ok) expect(discovery.reason).toContain("unexpected shape");
  });

  test("a well-formed gh payload becomes records plus the repository slug", async () => {
    githubShapedFixture();
    const sha = git(root, ["rev-parse", "HEAD"]);
    const forge = realForgeAdapter({
      spawn: async () => ({
        stdout: JSON.stringify([{ number: 9, headRefName: "feat/x", headRefOid: sha, baseRefName: "dev" }]),
        stderr: "",
        exitCode: 0,
      }),
    });
    expect(await forge.listOpenPullRequests({ cwd: root, base: "dev" })).toEqual({
      ok: true,
      repository: "opum-ai/fixture",
      pullRequests: [{ number: 9, headRefName: "feat/x", headRefOid: sha }],
    });
  });
});
