/**
 * LCLI-670 / DEC-192 (2) and (5) — a concept links a DECISION id the way it links task ids: a
 * `decisions:` frontmatter list, written by `lore link --decision`, doc-side only. Every stored entry
 * is repository-qualified `<repo>:DEC-N`, because a `DEC-n` exists in more than one fleet tracker,
 * and the qualifier resolves `--repo` > workspace member id > the `origin` remote's name > a refusal
 * that names the flag to pass. The remote's name — never the directory name — is what makes a
 * primary checkout and a review worktree write the SAME entry.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLink } from "../src/commands/link";
import { repositoryNameFromRemoteUrl } from "../src/core/decision-ref";
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
      const text = require("node:fs").readFileSync(
        join(worktreeish, "docs", "adr", "0012-new-decision.md"),
        "utf8",
      ) as string;
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
});
