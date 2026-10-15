/**
 * LCLI-670 / DEC-192 (2) and (5) — a concept links a DECISION id the way it links task ids: a
 * `decisions:` frontmatter list, written by `lore link --decision`, doc-side only. Every stored entry
 * is repository-qualified `<repo>:DEC-N`, because a `DEC-n` exists in more than one fleet tracker,
 * and the qualifier resolves `--repo` > workspace member id > the `origin` remote's name > a refusal
 * that names the flag to pass. The remote's name — never the directory name — is what makes a
 * primary checkout and a review worktree write the SAME entry.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLink } from "../src/commands/link";
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

/**
 * Whether this filesystem can hold two names differing ONLY in case (LCLI-727). It cannot on macOS's
 * default APFS or on NTFS: the second write lands on the SAME inode, so a fixture written that way is
 * silently a ONE-file fixture and any claim drawn from it is a claim about the filesystem, not about
 * the code. Probed at RUNTIME rather than read off `process.platform`, because APFS can be formatted
 * case-sensitive and a Linux mount can be case-insensitive — the platform is not the property these
 * tests need.
 *
 * NOTE, because it is a bug this file has already shipped once: the probe is deliberately NOT wrapped
 * in a try/catch. A temp directory that cannot be created or written is a broken environment, and a
 * probe that silently answered "no" would skip the proof everywhere while looking considered. It
 * throws, loudly, at registration time.
 *
 * `test.skipIf`'s condition is evaluated at REGISTRATION time, before any `beforeEach`, which is why
 * this is a module-level constant and touches no per-test `root`.
 */
const CASE_SENSITIVE_FILESYSTEM: boolean = (() => {
  const dir = mkdtempSync(join(tmpdir(), "lore-case-probe-"));
  try {
    writeFileSync(join(dir, "probe"), "");
    writeFileSync(join(dir, "PROBE"), "");
    return readdirSync(dir).length === 2;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();

/**
 * The marker the two case-collision tests carry IN THEIR NAME when, and only when, they are skipped,
 * so a skip says why on the face of it. Empty where the tests actually run, because a passing test
 * announcing a precondition it has already met reads as though it had been skipped.
 */
const CASE_SKIP_MARKER = CASE_SENSITIVE_FILESYSTEM
  ? ""
  : " [SKIPPED: needs a case-sensitive filesystem — a runtime probe wrote `probe` and `PROBE` and got fewer than two entries back]";

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

  test("a derived name that is not a NAME at all is refused (LCLI-729 (2))", () => {
    // The split on `:` takes the LAST colon, so a bare `host:port` leaves the PORT as the last
    // segment. A port is not a repository, and writing `8080:DEC-1` into a committed document is
    // worse than refusing to guess — the caller then answers with its own by-name `--repo` refusal.
    expect(repositoryNameFromRemoteUrl("https://host:8080")).toBeUndefined();
    expect(repositoryNameFromRemoteUrl("https://host:8080/")).toBeUndefined();
    expect(repositoryNameFromRemoteUrl("git@host:8080")).toBeUndefined();
    expect(repositoryNameFromRemoteUrl("https://host:8080/lore-cli")).toBe("lore-cli"); // control
    // A segment that truncates to NOTHING was already safe; pinned now that the pair is written down.
    expect(repositoryNameFromRemoteUrl("git@host:.git")).toBeUndefined();
    // The single-suffix strip is DELIBERATE, and it is what `git clone` does to name the directory:
    // one `.git` is removed, so `x.git.git` yields the directory git itself would create. That is the
    // remote's own name rather than a truncation this tool invents, so it is kept rather than refused.
    expect(repositoryNameFromRemoteUrl("x.git.git")).toBe("x.git");
    expect(repositoryNameFromRemoteUrl("x.git")).toBe("x"); // ...the same rule, one suffix along
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

  test("a PADDED memberId is refused — it does NOT trim where --repo does (LCLI-729 (3))", () => {
    // The asymmetry is DELIBERATE, and was previously unstated by any test: `--repo` trims because a
    // flag value is something a human typed, while a member id is CONFIGURATION — a padded one would
    // store a padded qualifier that no reader can match back to the member it names. F11's tests
    // covered this arm's separators but not its padding, so both halves are pinned together here.
    expect(() => resolveDecisionQualifier({ root, memberId: " lore-cli " })).toThrow(/invalid workspace member id/);
    // ...the UNPADDED id at that same arm passes, so the refusal is about the padding and not the arm.
    expect(resolveDecisionQualifier({ root, memberId: "lore-cli" })).toBe("lore-cli");
    // ...and `--repo` accepts the SAME padded string because it trims: the asymmetry itself, proved.
    expect(resolveDecisionQualifier({ root, repoFlag: " lore-cli " })).toBe("lore-cli");
  });
});

// ── LCLI-729 (1): a by-hand qualified id takes the same predicate ─────────────

describe("lore link --decision: a hand-supplied qualifier is a NAME too (LCLI-729 (1))", () => {
  // `--decision opum-ai/lore-cli:DEC-9` is the FOURTH arm that writes the stored `<repo>:DEC-N`
  // field, after `--repo`, the derived remote name and the workspace member id — and it was the only
  // one that skipped the predicate, so an owner/repo PATH was written VERBATIM into a document.
  // DEC-192 (5) specifies a repository NAME, identical in every clone and worktree; a path is not
  // one, and the reader splits the entry back with `[^:\s]+`. Whitespace cannot reach this arm
  // (DECISION_REF's repo part excludes it), so `/` and `\` are the residual hole, proved both ways.
  for (const bad of ["opum-ai/lore-cli:DEC-9", "a\\b:DEC-9"]) {
    test(`--decision ${JSON.stringify(bad)} is refused by name, and nothing is written`, async () => {
      initRepoWithOrigin(root, ORIGIN);
      adr("0012-new-decision");
      await expect(link(["adr/0012-new-decision", "--decision", bad])).rejects.toThrow(/not a NAME/);
      expect(decisionsOf("0012-new-decision")).toEqual([]);
    });
  }

  test("...and a NAME still passes at that same arm, stored verbatim (the other way)", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    expect((await link(["adr/0012-new-decision", "--decision", "opum-doc:DEC-9"])).code).toBe(0);
    expect(decisionsOf("0012-new-decision")).toEqual(["opum-doc:DEC-9"]);
  });

  test("...and a bare DEC-N still takes the resolved qualifier unchanged", async () => {
    initRepoWithOrigin(root, ORIGIN);
    adr("0012-new-decision");
    expect((await link(["adr/0012-new-decision", "--decision", "DEC-9"])).code).toBe(0);
    expect(decisionsOf("0012-new-decision")).toEqual(["lore-cli:DEC-9"]);
  });
});

// ── LCLI-727 F12: the Backlog-label guards do not run on the doc-side arm ──────

describe("lore link --decision: the label guards are skipped on the doc-side arm (LCLI-727 F12)", () => {
  // Both guards exist because a Backlog LABEL cannot round-trip a comma and because Backlog's label
  // store de-dups case-insensitively. `--decision` writes no label at all — and `--no-back-ref` is
  // refused beside it, so it can never be set here — yet the guards ran on this arm regardless and
  // refused a document id for a reason the arm can never encounter.
  //
  // The COMMA half is provable anywhere. The CASE-COLLISION half needs a filesystem that can hold
  // two names differing only in case, so its two tests below are gated on a runtime probe.
  //
  // An earlier revision of this file got that wrong, and the way it got it wrong is the reason this
  // comment is long. It asserted that the pair "cannot be observed from here" because `loadBundle`
  // "folds case-colliding ids", and passed `loadBundle` the fixture to prove it. That expectation
  // came from this machine's case-insensitive APFS, where the second write lands on the same inode —
  // a claim about a FILESYSTEM, reported as a claim about `loadBundle`. It was green on macOS and on
  // windows-latest (NTFS collapses the pair too) and red on the case-sensitive ubuntu runner, which
  // is the only place it could show. The lesson, as a rule rather than an incident: a test whose
  // fixture differs only by case proves nothing until a case-sensitive filesystem has run it.
  // The `--decision` arm skips BOTH halves through the one `sendsLabel` predicate, and the four
  // tests here are what hold it in place — reverting it to `!noBackRef` reddens the comma pair.
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

  // The real proof of the case-collision half, both ways: the doc-side arm links the id, the task
  // arm still refuses it. Gated on the runtime probe rather than on the platform — see it above.
  test.skipIf(!CASE_SENSITIVE_FILESYSTEM)(
    `a case-colliding ADR id links with --decision${CASE_SKIP_MARKER}`,
    async () => {
      initRepoWithOrigin(root, ORIGIN);
      adr("0001-a");
      adr("0001-A");
      expect((await link(["adr/0001-A", "--decision", "DEC-9"])).code).toBe(0);
      expect(decisionsOf("0001-A")).toEqual(["lore-cli:DEC-9"]);
      // The guard this arm skips exists because a Backlog LABEL cannot round-trip a name differing
      // only by case from a sibling's, so proving the skip also shows the SIBLING was left alone
      // (LCLI-729 (a)) — the half the claim does not otherwise make.
      expect(decisionsOf("0001-a")).toEqual([]);
    },
  );

  test.skipIf(!CASE_SENSITIVE_FILESYSTEM)(
    `...and that same id is still refused on the task arm${CASE_SKIP_MARKER}`,
    async () => {
      initRepoWithOrigin(root, ORIGIN);
      adr("0001-a");
      adr("0001-A");
      await expect(link(["adr/0001-A", "task-42"])).rejects.toThrow(/differing only by case/);
    },
  );

  // LCLI-729 (b). The two tests above are the only real proof that the doc-side arm skips the
  // case-collision guard, and they are GATED on the runtime probe — so a runner whose filesystem
  // collapsed the pair (a case-INsensitive ubuntu image, a case-SENSITIVE macOS one) would turn the
  // proof into a GREEN SKIP and nothing would say so. Where the environment states this IS the
  // case-sensitive leg, assert the probe rather than trusting it: the probe has to be able to FAIL,
  // not only to skip. The guard is deliberately narrow — `CI` unset or a non-Linux runner is simply
  // not the leg this protects, and asserting there would fail on the very machines that legitimately
  // cannot run the pair.
  test("the case probe reports TRUE on the case-sensitive leg (a probe that can only skip proves nothing)", () => {
    if (process.env.CI === undefined || process.platform !== "linux") return; // not the leg under test
    expect(CASE_SENSITIVE_FILESYSTEM).toBe(true);
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
