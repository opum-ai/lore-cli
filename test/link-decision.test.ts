/**
 * LCLI-670 / DEC-192 (2) and (5) — a concept links a DECISION id the way it links task ids: a
 * `decisions:` frontmatter list, written by `lore link --decision`, doc-side only. Every stored entry
 * is repository-qualified `<repo>:DEC-N`, because a `DEC-n` exists in more than one fleet tracker,
 * and the qualifier resolves `--repo` > workspace member id > the `origin` remote's name > a refusal
 * that names the flag to pass. The remote's name — never the directory name — is what makes a
 * primary checkout and a review worktree write the SAME entry.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLink } from "../src/commands/link";
import { loadBundle } from "../src/core/bundle";
import { originRepositoryName, repositoryNameFromRemoteUrl, resolveDecisionQualifier } from "../src/core/decision-ref";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const PLAIN_OUTPUT: OutputContext = { mode: "plain", color: false };
const ORIGIN = "git@github.com:opum-ai/lore-cli.git";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-link-decision-"));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * A real, EMPTY repo whose only remote is `origin`: `git init` plus a hand-written config stanza.
 * Deliberately not `git remote add`, which is a tier-3 action the fleet rules forbid even in a temp
 * repo — the fixture gives `git remote get-url origin` something real to read without touching a
 * remote.
 */
function initRepoWithOrigin(dir: string, url: string): void {
  Bun.spawnSync(["git", "init", "-q"], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  appendFileSync(join(dir, ".git", "config"), `[remote "origin"]\n\turl = ${url}\n`);
}

function adr(id: string, body = "Body.\n"): void {
  writeFileSync(join(root, "docs", "adr", `${id}.md`), `---\ntype: ADR\ntitle: ${id}\n---\n\n${body}`);
}

async function link(args: readonly string[]): Promise<{ code: number; stdout: ReturnType<typeof capture> }> {
  const stdout = capture();
  const code = await runLink({ root, args, stdout, stderr: capture(), output: PLAIN_OUTPUT });
  return { code, stdout };
}

function decisionsOf(id: string): readonly string[] {
  const text = readFileSync(join(root, "docs", "adr", `${id}.md`), "utf8");
  const match = /^decisions:\n((?: {2}- .*\n)+)/m.exec(text);
  return match === null
    ? []
    : (match[1] as string)
        .trim()
        .split("\n")
        .map((line) => line.trim().slice(2));
}

describe("lore link --decision (LCLI-670)", () => {
  test("repositoryNameFromRemoteUrl handles SSH and HTTPS, with and without .git", () => {
    expect(repositoryNameFromRemoteUrl("git@github.com:opum-ai/lore-cli.git")).toBe("lore-cli");
    expect(repositoryNameFromRemoteUrl("https://github.com/opum-ai/lore-cli")).toBe("lore-cli");
    expect(repositoryNameFromRemoteUrl("https://github.com/opum-ai/lore-cli.git")).toBe("lore-cli");
    expect(repositoryNameFromRemoteUrl("ssh://git@github.com/opum-ai/lore-cli.git")).toBe("lore-cli");
    expect(repositoryNameFromRemoteUrl("https://github.com/opum-ai/lore-cli/")).toBe("lore-cli");
    expect(repositoryNameFromRemoteUrl("")).toBeUndefined();
  });

  test("a bare DEC-N is stored qualified from the ORIGIN REMOTE", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    expect((await link(["adr/0012-new-decision", "--decision", "DEC-192"])).code).toBe(0);
    expect(decisionsOf("0012-new-decision")).toEqual(["lore-cli:DEC-192"]);
  });

  test("a primary checkout and a review worktree write the SAME entry", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await link(["adr/0012-new-decision", "--decision", "DEC-192"]);
    // The same bundle, but the checkout directory is a WORKTREE-shaped name. The qualifier still
    // comes from the remote, so the entry must not become `lore-cli-review-669-r2:DEC-192`.
    const worktreeish = mkdtempSync(join(tmpdir(), "lore-cli-review-669-r2-"));
    try {
      mkdirSync(join(worktreeish, "docs", "adr"), { recursive: true });
      initRepoWithOrigin(worktreeish, ORIGIN);
      writeFileSync(
        join(worktreeish, "docs", "adr", "0012-new-decision.md"),
        "---\ntype: ADR\ntitle: same\n---\n\nBody.\n",
      );
      const stdout = capture();
      expect(
        await runLink({
          root: worktreeish,
          args: ["adr/0012-new-decision", "--decision", "DEC-192"],
          stdout,
          stderr: capture(),
          output: PLAIN_OUTPUT,
        }),
      ).toBe(0);
      const text = readFileSync(join(worktreeish, "docs", "adr", "0012-new-decision.md"), "utf8");
      expect(text).toContain("lore-cli:DEC-192");
      expect(text).not.toContain("lore-cli-review-669-r2:DEC-192");
    } finally {
      rmSync(worktreeish, { recursive: true, force: true });
    }
  });

  test("--repo beats the remote", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    expect((await link(["adr/0012-new-decision", "--decision", "DEC-1", "--repo", "other-repo"])).code).toBe(0);
    expect(decisionsOf("0012-new-decision")).toEqual(["other-repo:DEC-1"]);
  });

  test("no origin refuses by name and says to pass --repo", async () => {
    adr("0012-new-decision");
    let error: { message?: string; hint?: string } = {};
    try {
      await link(["adr/0012-new-decision", "--decision", "DEC-192"]);
    } catch (cause) {
      error = cause as { message?: string; hint?: string };
    }
    expect(error.message ?? "").toContain("origin");
    expect(error.hint ?? "").toContain("--repo");
  });

  test("an already-qualified <repo>:DEC-N is kept as authored", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await link(["adr/0012-new-decision", "--decision", "opum-doc:DEC-9"]);
    expect(decisionsOf("0012-new-decision")).toEqual(["opum-doc:DEC-9"]);
  });

  test("a type with no `decisions` field is refused", async () => {
    initRepoWithOrigin(root, ORIGIN);
    writeFileSync(join(root, "docs", "reference.md"), "---\ntype: Reference\ntitle: R\n---\n\nBody.\n");
    let error: { message?: string } = {};
    try {
      await link(["reference", "--decision", "DEC-1"]);
    } catch (cause) {
      error = cause as { message?: string };
    }
    expect(error.message ?? "").toContain("decisions");
  });

  test("a duplicated decision id is ONE entry, not two (deduped case-insensitively)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await link(["adr/0012-new-decision", "--decision", "DEC-9", "--decision", "DEC-9"]);
    expect(decisionsOf("0012-new-decision")).toEqual(["lore-cli:DEC-9"]);
  });

  test("a bare id and its qualified twin collapse to one entry", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await link(["adr/0012-new-decision", "--decision", "DEC-9", "--decision", "lore-cli:DEC-9"]);
    expect(decisionsOf("0012-new-decision")).toEqual(["lore-cli:DEC-9"]);
  });

  test("mixing task ids and --decision is refused (usage)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await expect(link(["adr/0012-new-decision", "task-42", "--decision", "DEC-1"])).rejects.toThrow(/cannot mix/);
  });

  test("--no-back-ref with --decision is refused (usage)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await expect(link(["adr/0012-new-decision", "--decision", "DEC-1", "--no-back-ref"])).rejects.toThrow(
      /--no-back-ref/,
    );
  });

  test("--repo without --decision is refused (usage)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await expect(link(["adr/0012-new-decision", "task-42", "--repo", "lore-cli"])).rejects.toThrow(
      /--repo requires --decision/,
    );
  });

  test("an empty --repo is refused (usage)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await expect(link(["adr/0012-new-decision", "--decision", "DEC-1", "--repo="])).rejects.toThrow(
      /--repo needs a value/,
    );
  });

  test("no ids at all is a usage error (it was one before this change too)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    await expect(link(["adr/0012-new-decision"])).rejects.toThrow(/at least one task id or --decision id/);
  });

  test("an ownerless scp remote yields the name; a separator-carrying name is refused", () => {
    expect(repositoryNameFromRemoteUrl("git@host:lore-cli.git")).toBe("lore-cli");
    // A local Windows path is not a remote URL: its last `:`-or-`/` segment still carries `\`.
    expect(repositoryNameFromRemoteUrl("C:\\repos\\lore-cli")).toBeUndefined();
    expect(repositoryNameFromRemoteUrl("git@host:opum-ai/lore-cli.git")).toBe("lore-cli");
  });
});

// ── LCLI-727 F11: the qualifier is a NAME, at every arm that writes it ─────────

describe("lore link --decision: one qualifier predicate across every arm (LCLI-727 F11)", () => {
  // The stored entry is `<repo>:DEC-N` and a reader splits it back with `[^:\s]+`, so a qualifier
  // carrying whitespace is unparseable the moment it is written; `/` or `\` makes it a PATH where
  // DEC-192 (5) specifies a repository NAME that is identical in every clone and worktree. The arms
  // had drifted: `--repo` rejected `:` and `\` but not `/` or whitespace, while the derived remote
  // name rejected `/` but not whitespace — so `--repo "lore cli"` wrote an id nothing could read
  // back, and `--repo opum-ai/lore-cli` stored a second spelling of a repository its remote already
  // names. Proved both ways at every arm.
  for (const bad of ["lore cli", "lore\tcli", "opum-ai/lore-cli", "a\\b", "a:b"]) {
    test(`--repo ${JSON.stringify(bad)} is refused by name, and nothing is written`, async () => {
      initRepoWithOrigin(root, ORIGIN);
      adr("0012-new-decision");
      await expect(link(["adr/0012-new-decision", "--decision", "DEC-1", "--repo", bad])).rejects.toThrow(
        /invalid --repo/,
      );
      expect(decisionsOf("0012-new-decision")).toEqual([]);
    });
  }

  test("...and a NAME still passes at that same arm, writing the entry (the other way)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    expect((await link(["adr/0012-new-decision", "--decision", "DEC-1", "--repo", "lore-cli"])).code).toBe(0);
    expect(decisionsOf("0012-new-decision")).toEqual(["lore-cli:DEC-1"]);
  });

  test("the DERIVED remote name takes the same predicate", () => {
    expect(repositoryNameFromRemoteUrl("git@host:lore cli.git")).toBeUndefined();
    expect(repositoryNameFromRemoteUrl("git@host:lore-cli.git")).toBe("lore-cli"); // control
  });

  test("a whitespace-bearing origin remote refuses by name rather than writing it", async () => {
    initRepoWithOrigin(root, "git@github.com:opum-ai/lore cli.git");
    adr("0012-new-decision");
    let error: { message?: string; hint?: string } = {};
    try {
      await link(["adr/0012-new-decision", "--decision", "DEC-1"]);
    } catch (cause) {
      error = cause as { message?: string; hint?: string };
    }
    // The remote name is refused, so the derived arm finds nothing and the caller's own refusal
    // answers — a whitespace qualifier is never written, which is the claim.
    expect(error.message ?? "").toContain("origin");
    expect(error.hint ?? "").toContain("--repo");
    expect(decisionsOf("0012-new-decision")).toEqual([]);
  });

  test("the workspace memberId arm takes the same predicate (it writes the same value)", () => {
    for (const bad of ["lore cli", "opum-ai/lore-cli", "a:b", "a\\b", ""]) {
      expect(() => resolveDecisionQualifier({ root, memberId: bad })).toThrow(/invalid workspace member id/);
    }
    // ...and a NAME passes, without the arm falling through to the remote.
    expect(resolveDecisionQualifier({ root: join(root, "no-such-repo"), memberId: "lore-cli" })).toBe("lore-cli");
  });
});

// ── LCLI-727 F12: the Backlog-label guards do not run on the doc-side arm ──────

describe("lore link --decision: the label guards are skipped on the doc-side arm (LCLI-727 F12)", () => {
  // Both guards exist because a Backlog LABEL cannot round-trip a comma and because Backlog's label
  // store de-dups case-insensitively. `--decision` writes no label at all — and `--no-back-ref` is
  // refused beside it, so it can never be set here — yet the guards ran on this arm regardless and
  // refused a document id for a reason the arm can never encounter.
  //
  // Only the COMMA half is observable from here, and that is not an omission: `loadBundle` folds
  // case-colliding ids, so two ids differing only by case cannot both be concepts of a loaded bundle
  // and the case-collision guard can never fire on one. It is reachable only from a graph built by
  // hand (`test/link.test.ts` does exactly that, for `lore rename`'s call pattern). The
  // `--decision` arm skips BOTH through the one `sendsLabel` predicate, and the comma arm below is
  // what holds that predicate in place — reverting it to `!noBackRef` reddens it.
  test("a comma-bearing ADR id links with --decision", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0001-a,b");
    expect((await link(["adr/0001-a,b", "--decision", "DEC-9"])).code).toBe(0);
    expect(decisionsOf("0001-a,b")).toEqual(["lore-cli:DEC-9"]);
  });

  test("...and the SAME id is still refused on the task arm, where a label IS written", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0001-a,b");
    await expect(link(["adr/0001-a,b", "task-42"])).rejects.toThrow(/comma/i);
  });

  test("the case-collision half cannot be observed from here: loadBundle folds such ids", () => {
    // Not a test of the skip — a MEASUREMENT of why the skip cannot be observed from here, so a
    // later reader does not spend an afternoon building a fixture that cannot exist. See this
    // describe's comment. The guard's own test builds the graph by hand (test/link.test.ts).
    adr("0001-a");
    adr("0001-A");
    expect(existsSync(join(root, "docs", "adr", "0001-A.md"))).toBe(true); // the file IS there
    expect([...loadBundle(join(root, "docs"), {}).concepts.keys()]).toEqual(["adr/0001-a"]);
  });
});

// ── LCLI-727 F13: the unreadable-remote catch branch is reachable ─────────────

describe("originRepositoryName: 'no git to run' is an ordinary 'no remote' (LCLI-727 F13)", () => {
  // The branch is the `catch` around the spawn: Bun THROWS when the binary cannot be started at
  // all, and an uncaught throw would exit 1 with a code link's exit set does not name. It was
  // untestable because the only way to reach it for real is to remove `git` from the environment —
  // which `Bun.spawnSync`'s startup environment snapshot ignores, and which a `PATH` mutation would
  // leak into every other test in the same run. The sync spawner is injectable for exactly this.
  test("a spawn that throws yields undefined rather than propagating", () => {
    const noGit = (): never => {
      throw new Error("spawn git ENOENT");
    };
    expect(originRepositoryName(root, noGit)).toBeUndefined();
  });

  test("a non-zero exit yields undefined (the control: the branch that already worked)", () => {
    expect(originRepositoryName(root, () => ({ exitCode: 128, stdout: "", stderr: "fatal" }))).toBeUndefined();
  });

  test("...and a readable remote still resolves through the same seam", () => {
    initRepoWithOrigin(root, ORIGIN);
    expect(originRepositoryName(root)).toBe("lore-cli");
    expect(originRepositoryName(root, () => ({ exitCode: 0, stdout: `${ORIGIN}\n`, stderr: "" }))).toBe("lore-cli");
  });
});
