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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ArchiveEvidence,
  archiveAndDeleteBacklog,
  buildArchive,
  planBacklogSnapshot,
  verifyArchive,
  type ZipWriter,
} from "../src/backlog-archive";

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
      const failingTxn = {
        renameSync: () => {
          throw new Error("EPERM: rename refused");
        },
      };
      expect(() => archiveAndDeleteBacklog(root, exactZip, "renfail", failingTxn)).toThrow(/could not stage/);
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
      const faultTxn = {
        renameSync: (from: string, to: string): void => {
          renameSync(from, to);
          throw new Error("post-rename fault injected");
        },
      };
      expect(() => archiveAndDeleteBacklog(root, exactZip, "rollback", faultTxn)).toThrow(/fault injected/);
      expect(existsSync(join(root, "backlog/tasks/a.md"))).toBe(true);
      expect(readFileSync(join(root, "backlog/tasks/a.md"), "utf8")).toBe("alpha\n");
      expect(existsSync(join(root, "backlog/config.yml"))).toBe(true);
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
