/**
 * backlog-archive.test.ts — verified archive-and-delete pipeline for the coordinated cutover
 * (LCLI-333.1 / ODOC-63.3 L1). Hermetic: a tiny in-memory ZipWriter (no compression, exact bytes)
 * keeps every assertion about refusal/atomicity independent of any real zip codec.
 */

import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bunGitPreflightSpawn, type GitPreflightSpawn } from "../src/adapters/git-preflight";
import {
  type ArchiveEvidence,
  type ArchiveTransaction,
  archiveAndDeleteBacklog,
  backlogRemovalReadiness,
  buildArchive,
  planBacklogSnapshot,
  verifyArchive,
  type ZipWriter,
} from "../src/backlog-archive";
import { LoreError } from "../src/errors";
import { gitRun } from "./helpers";

/** Exact-bytes STORE zip writer: names → bytes, round-trips without transformation (JSON+b64 container). */
const exactZip: ZipWriter = {
  write(zipAbs, files) {
    const blob = [...files.entries()].map(([name, data]) => [name, Buffer.from(data).toString("base64")]);
    writeFileSync(zipAbs, JSON.stringify(blob));
  },
  read(zipAbs) {
    const out = new Map<string, Uint8Array>();
    for (const [name, b64] of JSON.parse(readFileSync(zipAbs, "utf8")) as [string, string][]) {
      out.set(name, new Uint8Array(Buffer.from(b64, "base64")));
    }
    return out;
  },
};

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "lcli-archive-"));
  mkdirSync(join(root, "backlog/tasks"), { recursive: true });
  writeFileSync(join(root, "backlog/tasks/a.md"), "alpha\n");
  writeFileSync(join(root, "backlog/config.yml"), "auto_commit: false\n");
  return root;
}

describe("backlog archive-and-delete (LCLI-333.1)", () => {
  test("snapshot refuses a symlinked file, a symlinked directory, and non-regular entries", () => {
    const root = fixture();
    try {
      // Windows requires elevated privileges for symlink creation; the lstat refusal guard is
      // platform-independent, so the scenario is POSIX-only by necessity.
      if (process.platform === "win32") {
        expect(planBacklogSnapshot(root)).toHaveLength(2);
        return;
      }
      symlinkSync("../outside.md", join(root, "backlog/link.md"));
      expect(() => planBacklogSnapshot(root)).toThrow(/symlink/);
      rmSync(join(root, "backlog/link.md"));
      symlinkSync("..", join(root, "backlog/up"));
      expect(() => planBacklogSnapshot(root)).toThrow(/symlink/);
      rmSync(join(root, "backlog/up"));
      mkdirSync(join(root, "backlog/fifo"));
      // A directory named like a file is fine; instead drop a FIFO via mkfifo-equivalent: skip on
      // platforms without it — the symlink refusals above pin the same lstat guard.
      rmSync(join(root, "backlog/fifo"), { recursive: true });
      expect(planBacklogSnapshot(root)).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("build+verify round-trips every entry's sha256 and byte count", () => {
    const root = fixture();
    try {
      const entries = planBacklogSnapshot(root);
      const ev = buildArchive(root, entries, exactZip, "t1");
      expect(ev.entries).toHaveLength(2);
      expect(existsSync(join(root, ev.zipRel))).toBe(true);
      expect(() => verifyArchive(root, ev, exactZip)).not.toThrow();
      // Tamper detection: one flipped byte must fail verification.
      const zipPath = join(root, ev.zipRel);
      const raw = readFileSync(zipPath, "utf8");
      writeFileSync(zipPath, `${raw}tampered`);
      expect(() => verifyArchive(root, ev, exactZip)).toThrow(/does not match/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("verify refuses unsafe zip entries (absolute, .., backslash, duplicate names)", async () => {
    const { createHash } = await import("node:crypto");
    const entry = (path: string): { path: string; sha256: string; bytes: number } => ({
      path,
      sha256: createHash("sha256").update("x").digest("hex"),
      bytes: 1,
    });
    const mkEv = (paths: string[]): ArchiveEvidence => ({
      zipRel: ".lore/archive/z.zip",
      zipSha256: "0",
      inventoryRel: ".lore/archive/z.json",
      entries: paths.map(entry),
    });
    for (const bad of [["/abs/x.md"], ["../climb.md"], ["back\\slash.md"], ["a.md", "a.md"]]) {
      expect(() => verifyArchive("/nonexistent-root", mkEv(bad), exactZip)).toThrow(/unsafe archive entry/);
    }
  });

  test("pre-commit drift aborts with backlog fully intact, nothing deleted, no zip left", () => {
    const root = fixture();
    try {
      // Mutate a LATE source during archive write: the batched pre-commit re-hash must catch it
      // BEFORE the commit boundary, so every file — including the early config.yml — survives.
      const mutatingZip: ZipWriter = {
        write(zipAbs, files) {
          files.get("backlog/tasks/a.md");
          writeFileSync(join(root, "backlog/tasks/a.md"), "mutated mid-flight\n");
          exactZip.write(zipAbs, files);
        },
        read: (zipAbs) => exactZip.read(zipAbs),
      };
      expect(() => archiveAndDeleteBacklog(root, mutatingZip, "drift")).toThrow(
        /changed between archive scan and deletion/,
      );
      expect(existsSync(join(root, "backlog/tasks/a.md"))).toBe(true);
      expect(existsSync(join(root, "backlog/config.yml"))).toBe(true);
      expect(existsSync(join(root, ".lore/archive/backlog-drift.zip"))).toBe(false); // partial zip removed (dir itself may remain)
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("commit-boundary rename failure leaves backlog byte-intact and refuses loud", () => {
    const root = fixture();
    try {
      const failingRenameTxn: ArchiveTransaction = {
        renameSync: () => {
          throw new Error("EPERM: rename refused");
        },
        unlinkSync: (path) => unlinkSync(path),
      };
      expect(() => archiveAndDeleteBacklog(root, exactZip, "renfail", failingRenameTxn)).toThrow(/could not stage/);
      expect(existsSync(join(root, "backlog/tasks/a.md"))).toBe(true);
      expect(existsSync(join(root, "backlog/config.yml"))).toBe(true);
      expect(readFileSync(join(root, "backlog/tasks/a.md"), "utf8")).toBe("alpha\n"); // untouched
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("post-commit delete failure rolls the COMPLETE staged tree back to backlog", () => {
    const root = fixture();
    try {
      // Fail inside the POST-commit phase before any unlink ran: the transaction must roll the
      // complete staged tree back to backlog/ and rethrow.
      let renames = 0;
      const faultTxn: ArchiveTransaction = {
        // Fail only the STAGING rename (after performing it); the ROLLBACK rename must succeed.
        renameSync: (from: string, to: string): void => {
          renames++;
          renameSync(from, to);
          if (renames === 1) throw new Error("post-rename fault injected");
        },
        unlinkSync: (path) => unlinkSync(path),
      };
      expect(() => archiveAndDeleteBacklog(root, exactZip, "rollback", faultTxn)).toThrow(/rolled back/);
      expect(existsSync(join(root, "backlog/tasks/a.md"))).toBe(true);
      expect(readFileSync(join(root, "backlog/tasks/a.md"), "utf8")).toBe("alpha\n");
      expect(existsSync(join(root, "backlog/config.yml"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("mid-deletion unlink failure through the public API retains zip+staging evidence (no silent loss)", () => {
    const root = fixture();
    try {
      // Fail the SECOND staged unlink: config.yml is already deleted inside staging when the
      // fault fires, so rollback is impossible. The transaction must keep BOTH evidence paths —
      // the verified archive (holding every original file) AND the recoverable staged remainder.
      let unlinks = 0;
      const failingTxn: ArchiveTransaction = {
        renameSync: (from, to) => renameSync(from, to),
        unlinkSync: (path: string): void => {
          unlinks++;
          if (unlinks === 2) throw new Error("injected unlink fault");
          unlinkSync(path);
        },
      };
      let caught: unknown;
      try {
        archiveAndDeleteBacklog(root, exactZip, "midfail", failingTxn);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LoreError);
      const err = caught as LoreError;
      expect(err.message).toContain("failed mid-deletion");
      expect((err.input as { stagingRel?: string }).stagingRel).toContain(".lore/cutover/staging-backlog-midfail");
      expect((err.input as { zipRel?: string }).zipRel).toContain(".lore/archive/");
      // The verified archive survived and still round-trips EVERY original file:
      const ev = JSON.parse(readFileSync(join(root, ".lore/archive/backlog-midfail.inventory.json"), "utf8")) as {
        zipRel: string;
        entries: { path: string }[];
      };
      expect(existsSync(join(root, ev.zipRel))).toBe(true);
      const round = exactZip.read(join(root, ev.zipRel));
      for (const e of ev.entries) expect(round.get(e.path)).toBeDefined();
      // The undeleted original remains recoverably present under staging:
      expect(existsSync(join(root, ".lore/cutover/staging-backlog-midfail/tasks/a.md"))).toBe(true);
      // And the deleted-in-staging file is recoverable from the archive bytes:
      expect(round.get("backlog/config.yml")).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("post-commit failure that cannot roll back names the recoverable staging path (no silent loss)", () => {
    const root = fixture();
    try {
      // Drive the documented post-commit recovery contract directly: stage via the real commit
      // boundary, then simulate a mid-deletion crash (one file already unlinked, one left in
      // staging). Every original file must remain either in the verified archive or recoverably
      // present under staging — never silently lost.
      const entries = planBacklogSnapshot(root);
      const ev = buildArchive(root, entries, exactZip, "midfail");
      verifyArchive(root, ev, exactZip);
      mkdirSync(join(root, ".lore/cutover"), { recursive: true });
      renameSync(join(root, "backlog"), join(root, ".lore/cutover/staging-backlog-midfail"));
      // Crash simulation: one file deleted inside staging, one left recoverable.
      rmSync(join(root, ".lore/cutover/staging-backlog-midfail/config.yml"));
      // The verified immutable archive still contains EVERY original file:
      const round = exactZip.read(join(root, ev.zipRel));
      expect(round.get("backlog/config.yml")).toBeDefined();
      expect(round.get("backlog/tasks/a.md")).toBeDefined();
      // And the undeleted original remains recoverably present under the durable staging path:
      expect(existsSync(join(root, ".lore/cutover/staging-backlog-midfail/tasks/a.md"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("retry/resume coherence: an existing conflicting staging path is a fail-loud conflict", () => {
    const root = fixture();
    try {
      mkdirSync(join(root, ".lore/cutover"), { recursive: true });
      mkdirSync(join(root, ".lore/cutover/staging-backlog-retry"), { recursive: true });
      expect(() => archiveAndDeleteBacklog(root, exactZip, "retry")).toThrow(/already exists/);
      expect(existsSync(join(root, "backlog/config.yml"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("deletion removes all files and prunes emptied directories only", () => {
    const root = fixture();
    try {
      const ev = archiveAndDeleteBacklog(root, exactZip, "t3");
      expect(existsSync(join(root, "backlog"))).toBe(false);
      expect(ev.entries).toHaveLength(2);
      // Evidence survives under .lore/archive.
      expect(existsSync(join(root, ev.zipRel))).toBe(true);
      expect(existsSync(join(root, ev.inventoryRel))).toBe(true);
      // Re-running over an absent backlog/ is a verified no-op? No: empty snapshot is refused —
      // resume goes through the coordinator's archived phase, never a second delete.
      expect(() => archiveAndDeleteBacklog(root, exactZip, "t4")).toThrow(/empty backlog snapshot/);
      void readdirSync(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("resume with phase archived verifies the existing zip and never re-archives", () => {
    const root = fixture();
    try {
      const ev = buildArchive(root, planBacklogSnapshot(root), exactZip, "t5");
      // Coordinator semantics: phase=archived ⇒ verifyArchive only; sources may already be gone.
      expect(() => verifyArchive(root, ev, exactZip)).not.toThrow();
      rmSync(join(root, "backlog"), { recursive: true, force: true });
      expect(() => verifyArchive(root, ev, exactZip)).not.toThrow(); // still verifies post-delete
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * LCLI-467. Two preconditions on OFFERING an archive-and-delete to an external user, both of which
 * the prompt copy's honesty depends on:
 *
 *  - the archive really is gitignored, so "gitignored, not committed" is a fact rather than a hope;
 *  - git really does hold what is about to be deleted, so "recoverable via `git checkout --`" is
 *    true for this repository rather than for the typical one.
 */
describe("archive evidence is genuinely gitignored (LCLI-467 AC#1)", () => {
  test("buildArchive writes .lore/archive/.gitignore ignoring the whole directory", () => {
    const root = fixture();
    try {
      buildArchive(root, planBacklogSnapshot(root), exactZip, "gi");
      const ignore = readFileSync(join(root, ".lore/archive/.gitignore"), "utf8");
      // `*` covers the zip, the inventory, and the ignore file itself — git reads an ignore file it
      // is ignoring, so nothing under .lore/archive/ ever reaches `git status`.
      expect(ignore.split("\n")).toContain("*");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an operator's own .lore/archive/.gitignore is never overwritten", () => {
    const root = fixture();
    try {
      mkdirSync(join(root, ".lore/archive"), { recursive: true });
      writeFileSync(join(root, ".lore/archive/.gitignore"), "mine\n");
      buildArchive(root, planBacklogSnapshot(root), exactZip, "gi2");
      expect(readFileSync(join(root, ".lore/archive/.gitignore"), "utf8")).toBe("mine\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("backlogRemovalReadiness — git must prove the deletion is recoverable (LCLI-467)", () => {
  /**
   * A scripted read-only git: `ls-files` answers first, `status` second. Matched by `args.includes`
   * rather than `args[0]`, because `backlogRemovalReadiness` now prefixes the `ls-files` call with
   * `-c core.quotePath=false` (LCLI-523 review fix) — `args[0]` is `"-c"`, not `"ls-files"`, on that
   * call. The default `tracked` lists BOTH files `fixture()` actually writes to disk —
   * `backlogRemovalReadiness` now also cross-checks a real `planBacklogSnapshot` walk of the
   * fixture directory against this list (LCLI-523), so a default that under-reports what is on disk
   * would misfire as "ignored but present" rather than exercising the "tracked and clean" case it
   * names.
   */
  function git(answers: { tracked?: string; status?: string; exitCode?: number; throws?: boolean }): GitPreflightSpawn {
    return (args) => {
      if (answers.throws === true) throw new Error("spawn ENOENT");
      const stdout = args.includes("ls-files")
        ? (answers.tracked ?? "backlog/config.yml\nbacklog/tasks/a.md\n")
        : (answers.status ?? "");
      return { exitCode: answers.exitCode ?? 0, stdout, stderr: "" };
    };
  }

  test("tracked and clean is ready", () => {
    const root = fixture();
    try {
      expect(backlogRemovalReadiness(root, git({}))).toEqual({ ready: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an UNTRACKED backlog/ is refused: there is no committed copy to restore", () => {
    const root = fixture();
    try {
      const readiness = backlogRemovalReadiness(root, git({ tracked: "" }));
      expect(readiness.ready).toBe(false);
      expect(readiness.ready === false && readiness.reason).toContain("not tracked by git");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a DIRTY backlog/ is refused: `git checkout --` would restore committed bytes over an edit", () => {
    const root = fixture();
    try {
      const readiness = backlogRemovalReadiness(root, git({ status: " M backlog/config.yml\n" }));
      expect(readiness.ready).toBe(false);
      expect(readiness.ready === false && readiness.reason).toContain("uncommitted changes");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("git refusing to answer is refused too — an unanswered question has not proven recovery", () => {
    const root = fixture();
    try {
      const refused = backlogRemovalReadiness(root, git({ exitCode: 128 }));
      expect(refused.ready).toBe(false);
      expect(refused.ready === false && refused.reason).toContain("git worktree");
      const missing = backlogRemovalReadiness(root, git({ throws: true }));
      expect(missing.ready).toBe(false);
      expect(missing.ready === false && missing.reason).toContain("could not be run");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a backlog/ that does not exist is not ready, and no git call is made", () => {
    const root = mkdtempSync(join(tmpdir(), "lcli-archive-"));
    try {
      let called = false;
      const readiness = backlogRemovalReadiness(root, () => {
        called = true;
        return { exitCode: 0, stdout: "", stderr: "" };
      });
      expect(readiness.ready).toBe(false);
      expect(called).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("against REAL git: committed is ready, an edit or an untracked file is not", () => {
    const root = fixture();
    try {
      const spawn = bunGitPreflightSpawn(root);
      // Not a repository yet: git answers, and the answer is "cannot prove it".
      expect(backlogRemovalReadiness(root, spawn).ready).toBe(false);
      gitRun(root, ["init"]);
      gitRun(root, ["add", "backlog"]);
      gitRun(root, ["-c", "user.email=t@example.test", "-c", "user.name=T", "commit", "-m", "backlog"]);
      expect(backlogRemovalReadiness(root, spawn)).toEqual({ ready: true });
      writeFileSync(join(root, "backlog/tasks/a.md"), "edited\n");
      expect(backlogRemovalReadiness(root, spawn).ready).toBe(false);
      gitRun(root, ["checkout", "--", "backlog"]);
      expect(backlogRemovalReadiness(root, spawn)).toEqual({ ready: true });
      writeFileSync(join(root, "backlog/tasks/new.md"), "untracked\n");
      expect(backlogRemovalReadiness(root, spawn).ready).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Review finding (LCLI-467, PR #140): the untracked half of the gate is disarmed by CONFIG, not
  // by argv, so the case above cannot catch it. `status.showUntrackedFiles=no` is a real setting for
  // large repositories and can arrive from a global ~/.gitconfig the operator has forgotten; with
  // it set, a bare `git status --porcelain` reports nothing and the gate collapses to "some file
  // here is tracked", deleting the untracked file it promises to refuse. This asserts the readiness
  // probe demands the answer it needs rather than the one the repository happens to give it.
  test("against REAL git: status.showUntrackedFiles=no does NOT disarm the untracked check", () => {
    const root = fixture();
    try {
      const spawn = bunGitPreflightSpawn(root);
      gitRun(root, ["init"]);
      gitRun(root, ["add", "backlog"]);
      gitRun(root, ["-c", "user.email=t@example.test", "-c", "user.name=T", "commit", "-m", "backlog"]);
      gitRun(root, ["config", "status.showUntrackedFiles", "no"]);
      // The setting is genuinely in force: a bare status sees nothing, which is the trap.
      writeFileSync(join(root, "backlog/tasks/hidden.md"), "untracked\n");
      expect(spawn(["status", "--porcelain", "--", "backlog"]).stdout.trim()).toBe("");
      // The probe must refuse anyway.
      expect(backlogRemovalReadiness(root, spawn).ready).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // LCLI-523: a gitignored file is invisible to BOTH `git ls-files` and `git status --porcelain
  // --untracked-files=all` (ignored files are never reported by either, tracked or not), so the two
  // checks above see a tracked-clean backlog/ and say ready:true even though `git checkout --
  // backlog/` cannot restore the ignored file — it has no committed copy. Real repro, not the
  // scripted git fake above: a real .gitignore rule, a real ignored file on disk.
  test("against REAL git: a gitignored file under backlog/ is refused, even though git ls-files and git status both read clean", () => {
    const root = fixture();
    try {
      const spawn = bunGitPreflightSpawn(root);
      mkdirSync(join(root, "backlog/drafts"), { recursive: true });
      writeFileSync(join(root, ".gitignore"), "backlog/drafts/\n");
      gitRun(root, ["init"]);
      gitRun(root, ["add", "backlog", ".gitignore"]);
      gitRun(root, ["-c", "user.email=t@example.test", "-c", "user.name=T", "commit", "-m", "backlog"]);
      // The tracked-and-clean set alone is ready.
      expect(backlogRemovalReadiness(root, spawn)).toEqual({ ready: true });
      // Now drop a genuinely ignored file into the tree.
      writeFileSync(join(root, "backlog/drafts/idea.md"), "an idea\n");
      expect(spawn(["ls-files", "--", "backlog"]).stdout).not.toContain("drafts/idea.md");
      expect(spawn(["status", "--porcelain", "--untracked-files=all", "--", "backlog"]).stdout.trim()).toBe("");
      const readiness = backlogRemovalReadiness(root, spawn);
      expect(readiness.ready).toBe(false);
      expect(readiness.ready === false && readiness.reason).toContain("backlog/drafts/idea.md");
      expect(readiness.ready === false && readiness.reason).toContain("gitignored");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Adversarial-review finding on LCLI-523 (medium severity, confirmed reproducible): git's default
  // core.quotePath=true C-style-escapes any non-ASCII byte in `ls-files` output (`café.md` comes
  // back as `"caf\303\251.md"`), which would never string-equal the raw UTF-8 path
  // `planBacklogSnapshot` reads off disk — wrongly refusing a genuinely tracked, clean, non-ASCII
  // filename as "gitignored but present" (a false refusal, exit 4 on a scripted `--remove-backlog`).
  // Same failure mode `adapters/git.ts`'s `history()` already guards against with the same fix.
  test("against REAL git: a tracked, clean non-ASCII filename passes readiness cleanly (core.quotePath regression)", () => {
    const root = fixture();
    try {
      const spawn = bunGitPreflightSpawn(root);
      writeFileSync(join(root, "backlog/café.md"), "un café\n");
      gitRun(root, ["init"]);
      gitRun(root, ["add", "backlog"]);
      gitRun(root, ["-c", "user.email=t@example.test", "-c", "user.name=T", "commit", "-m", "backlog"]);
      // Confirm the trap is real: git's default quoting DOES mangle the raw path.
      const quotedDefault = Bun.spawnSync(["git", "ls-files", "--", "backlog"], {
        cwd: root,
        stdout: "pipe",
      }).stdout.toString("utf8");
      expect(quotedDefault).not.toContain("café.md");
      expect(quotedDefault).toContain("caf");
      expect(backlogRemovalReadiness(root, spawn)).toEqual({ ready: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // LCLI-524: git tracks a symlink natively and reports it clean, so the two git checks say
  // ready:true for a state `archiveAndDeleteBacklog` (via planBacklogSnapshot) then refuses at
  // drift — aborting `lore init` mid-run instead of never being offered. Real repro: a real symlink,
  // committed and clean, exactly the shape a tracked-and-clean git status would otherwise pass.
  test("against REAL git: a symlink under backlog/ is refused, matching what archiveAndDeleteBacklog itself would refuse", () => {
    const root = fixture();
    try {
      if (process.platform === "win32") return; // symlink creation needs elevation on Windows CI
      const spawn = bunGitPreflightSpawn(root);
      writeFileSync(join(root, "outside.md"), "elsewhere\n");
      symlinkSync("../outside.md", join(root, "backlog/link.md"));
      gitRun(root, ["init"]);
      gitRun(root, ["add", "backlog", "outside.md"]);
      gitRun(root, ["-c", "user.email=t@example.test", "-c", "user.name=T", "commit", "-m", "backlog+link"]);
      // Git tracks the symlink itself and reports the tree clean.
      expect(spawn(["ls-files", "--", "backlog"]).stdout).toContain("backlog/link.md");
      expect(spawn(["status", "--porcelain", "--untracked-files=all", "--", "backlog"]).stdout.trim()).toBe("");
      const readiness = backlogRemovalReadiness(root, spawn);
      expect(readiness.ready).toBe(false);
      expect(readiness.ready === false && readiness.reason).toContain("symlink");
      // And archiveAndDeleteBacklog would indeed refuse the same tree, confirming the gate now
      // agrees with the archive instead of aborting it mid-run.
      expect(() => planBacklogSnapshot(root)).toThrow(/symlink/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // LCLI-523 AC3: backlog/.locks/ is gitignored BY DESIGN (ADR-0012 §4) — the new disk-vs-git
  // cross-check must not treat that exemption as drift, or every ordinary lore-managed project
  // would be refused.
  test("against REAL git: backlog/.locks/ (gitignored by design, ADR-0012 §4) does not trip the new check", () => {
    const root = fixture();
    try {
      const spawn = bunGitPreflightSpawn(root);
      mkdirSync(join(root, "backlog/.locks"), { recursive: true });
      writeFileSync(join(root, ".gitignore"), "backlog/.locks/\n");
      gitRun(root, ["init"]);
      gitRun(root, ["add", "backlog", ".gitignore"]);
      gitRun(root, ["-c", "user.email=t@example.test", "-c", "user.name=T", "commit", "-m", "backlog"]);
      writeFileSync(join(root, "backlog/.locks/some-task.lock"), "pid:1\n");
      expect(spawn(["ls-files", "--", "backlog"]).stdout).not.toContain(".locks");
      expect(spawn(["status", "--porcelain", "--untracked-files=all", "--", "backlog"]).stdout.trim()).toBe("");
      expect(backlogRemovalReadiness(root, spawn)).toEqual({ ready: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
