/**
 * backlog-archive.ts — verified repository-local ZIP archival of `backlog/` before the coordinated
 * cutover deletes it (LCLI-333.1 / ODOC-63.3 L1, outcome 4).
 *
 * Invariants:
 * - Only repository-local IGNORED evidence is written (`.lore/archive/`, gitignored) — never
 *   published, never committed.
 * - Symlinks anywhere in a walked path, non-regular entries, and unsafe zip entry names are
 *   refused loud; nothing is ever deleted unless the full plan → build → verify → re-scan pipeline
 *   succeeded.
 * - Failure-atomic transaction: pre-commit drift/refusal aborts with `backlog/` untouched; the
 *   commit boundary is ONE atomic same-volume directory rename of `backlog/` into a durable
 *   staging path, and post-commit failures either roll back completely or name the staging path
 *   where the recoverable tree (plus the verified archive) lives. No undocumented partial-delete
 *   state exists: every original regular file is always either recoverably present on disk or in
 *   the verified immutable archive.
 * - Idempotent/resumable: the cutover coordinator persists phase `archived` + evidence after
 *   success; a resumed run verifies the existing archive instead of rebuilding/redeleting.
 *
 * Git residue (ADR-0012 note): `backlog/` is normally git-TRACKED, and this leg performs zero git
 * operations by design — after archive-and-delete the worktree carries uncommitted deletions of
 * the old task files. That is intentional: committing the deletion is the repository owner's (or a
 * later lore command's) ordinary commit decision, not a side effect of selecting Quest. The
 * coordinator's `done` marker + `.lore/archive/` evidence are the durable record that the deletion
 * was verified before it happened.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, posix } from "node:path";
import { ensureDir } from "./commands/fswrite";
import { LoreError } from "./errors";

/** One archived file: repo-relative path plus raw-byte integrity. */
export interface ArchiveEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** The evidence record persisted by the coordinator before any later phase runs. */
export interface ArchiveEvidence {
  readonly zipRel: string;
  readonly zipSha256: string;
  readonly inventoryRel: string;
  readonly entries: readonly ArchiveEntry[];
}

/**
 * The injectable ZIP transport. Kept minimal so tests can be hermetic and so the concrete writer
 * (fflate today) stays swappable without touching the verification pipeline.
 */
export interface ZipWriter {
  /** Write a deterministic STORE-method zip of exactly these entries (name → bytes). */
  write(zipAbs: string, files: ReadonlyMap<string, Uint8Array>): void;
  /** Read a zip back into entry name → bytes; refuses nothing here (verification does that). */
  read(zipAbs: string): Map<string, Uint8Array>;
}

const ARCHIVE_DIR = ".lore/archive";
const STAGING_PARENT = ".lore/cutover";

/**
 * Snapshot every REGULAR file under `root/<dir>` (default `backlog`) deterministically: lstat-walk
 * every segment refusing ANY symlink, archiving only regular files, sorted by path. A directory
 * containing anything other than regular files/directories is drift.
 */
export function planBacklogSnapshot(root: string, dir = "backlog"): readonly ArchiveEntry[] {
  const absDir = join(root, dir);
  if (!existsSync(absDir)) return [];
  const out: ArchiveEntry[] = [];
  walk(absDir, dir);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  function walk(abs: string, rel: string): void {
    assertNoSymlinkSegments(root, rel);
    const st = lstatSync(abs);
    if (st.isFile()) {
      const bytes = readFileSync(abs);
      out.push({ path: rel, sha256: sha256(bytes), bytes: bytes.length });
      return;
    }
    if (!st.isDirectory()) {
      throw new LoreError(
        "drift",
        `refusing to archive "${rel}": not a regular file or directory`,
        "remove or replace the special entry, then rerun the cutover",
        { path: rel },
      );
    }
    for (const name of readdirSync(abs).sort()) {
      walk(join(abs, name), posix.join(rel, name));
    }
  }
}

/**
 * Build the ignored archive + inventory evidence from a snapshot. Fixed metadata keeps the zip
 * byte-reproducible for the same inputs.
 */
export function buildArchive(
  root: string,
  entries: readonly ArchiveEntry[],
  zip: ZipWriter,
  id: string,
): ArchiveEvidence {
  if (entries.length === 0)
    throw new LoreError("validation", "refusing to archive an empty backlog snapshot", "nothing to preserve");
  mkdirSync(join(root, ARCHIVE_DIR), { recursive: true });
  const zipRel = `${ARCHIVE_DIR}/backlog-${sanitizeId(id)}.zip`;
  const files = new Map<string, Uint8Array>();
  for (const e of entries) files.set(e.path, readFileSync(join(root, e.path)));
  zip.write(join(root, zipRel), files);
  const zipBytes = readFileSync(join(root, zipRel));
  const evidence: ArchiveEvidence = {
    zipRel,
    zipSha256: sha256(zipBytes),
    inventoryRel: `${ARCHIVE_DIR}/backlog-${id}.inventory.json`,
    entries,
  };
  writeFileSync(
    join(root, evidence.inventoryRel),
    `${JSON.stringify({ schema: "lore-backlog-archive-inventory/1", ...evidence }, null, 2)}\n`,
  );
  return evidence;
}

/**
 * Verify an archive against its own inventory: unzip, refuse unsafe entry names, then require every
 * entry's bytes to hash and size-match. Throws on ANY mismatch — the caller must treat a failed
 * verify as "no deletion happened".
 */
export function verifyArchive(root: string, ev: ArchiveEvidence, zip: ZipWriter): void {
  assertSafeEntryNames(ev.entries.map((e) => e.path));
  const zipBytes = readFileSync(join(root, ev.zipRel));
  if (sha256(zipBytes) !== ev.zipSha256)
    throw new LoreError(
      "drift",
      "archive zip does not match its recorded digest",
      "the archive is corrupt; do not delete backlog/",
      {
        zipRel: ev.zipRel,
      },
    );
  const round = zip.read(join(root, ev.zipRel));
  if (round.size !== ev.entries.length)
    throw new LoreError("drift", "archive entry count does not match the inventory", undefined, {
      expected: ev.entries.length,
      actual: round.size,
    });
  for (const e of ev.entries) {
    const bytes = round.get(e.path);
    if (bytes === undefined || bytes.length !== e.bytes || sha256(bytes) !== e.sha256)
      throw new LoreError("drift", `archive entry "${e.path}" does not match the inventory`, undefined, {
        path: e.path,
      });
  }
}

/**
 * The full archive-and-delete leg as a FAILURE-ATOMIC transaction:
 *
 *   1. Pre-commit — snapshot `backlog/`, build the zip, verify it against its inventory, then
 *      re-hash EVERY live source file. Any drift/refusal here aborts with `backlog/` untouched
 *      and no partial zip (source immutability holds until the commit boundary).
 *   2. Commit boundary — ONE atomic `rename` of the whole storage directory into
 *      `.lore/cutover/staging-backlog-<id>`. Same-volume directory rename is all-or-nothing:
 *      after it, every original file is recoverably present under the staging path and none has
 *      been deleted.
 *   3. Post-commit — re-verify the staged tree against the inventory, then unlink inside staging
 *      and prune. A failure here can never lose data: the surviving staged files remain
 *      recoverably present at a durable, documented path, and when the staged tree is still
 *      complete the transaction ROLLS BACK by renaming it to `backlog/` before rethrowing.
 *
 * The invariant proven at every exit point: each original regular Backlog file is either still
 * recoverably present on disk or present in the verified immutable archive. There is no
 * undocumented partial-delete state; a post-commit failure that cannot roll back names the exact
 * staging path holding the recoverable tree.
 */
export function archiveAndDeleteBacklog(
  root: string,
  zip: ZipWriter,
  id: string,
  txn: ArchiveTransaction = defaultTransaction,
): ArchiveEvidence {
  // ── Phase 1: pre-commit. Nothing below may touch `backlog/`. ──────────────────
  const entries = planBacklogSnapshot(root);
  let evidence: ArchiveEvidence | undefined;
  try {
    evidence = buildArchive(root, entries, zip, id);
    verifyArchive(root, evidence, zip);
    if (evidence.entries.length === 0)
      throw new LoreError("validation", "refusing to delete from an empty archive plan");
    const firstEntry = evidence.entries[0];
    if (firstEntry === undefined) throw new LoreError("validation", "refusing to delete from an empty archive plan");
    const topDir = firstEntry.path.split("/")[0] ?? firstEntry.path;
    // Source immutability until the commit boundary: EVERY source must still match the snapshot.
    for (const e of evidence.entries) {
      const st = statSync(join(root, e.path));
      if (!st.isFile() || st.size !== e.bytes || sha256(readFileSync(join(root, e.path))) !== e.sha256)
        throw new LoreError(
          "drift",
          `"${e.path}" changed between archive scan and deletion`,
          "backlog/ was modified during the cutover; nothing has been deleted — rerun the cutover",
          { path: e.path },
        );
    }

    // ── Phase 2: the atomic commit boundary. ──────────────────────────────────────
    ensureDir(root, STAGING_PARENT);
    const stagingRel = `${STAGING_PARENT}/staging-backlog-${sanitizeId(id)}`;
    const stagingAbs = join(root, stagingRel);
    if (existsSync(stagingAbs))
      throw new LoreError(
        "conflict",
        `staging path ${stagingRel} already exists`,
        "a prior transaction did not settle; resolve the staging directory, then rerun",
        { stagingRel },
      );
    // ── From here on the original files live ONLY under stagingAbs (recoverable). ─
    const handlePostCommit = (postCommit: unknown): never => {
      // Post-commit failure: the staged tree (or what survives of it) is still recoverable.
      // Roll back only while NOTHING has been deleted yet — i.e. the staged tree is complete.
      // Definitely assigned above (phase 1 completed); the closure defeats narrowing.
      const verified = evidence as ArchiveEvidence;
      const complete = verified.entries.every((e) => existsSync(join(stagingAbs, e.path.slice(topDir.length + 1))));
      if (complete && !existsSync(join(root, topDir))) {
        try {
          txn.renameSync(stagingAbs, join(root, topDir)); // rollback of an untouched tree
        } catch {
          // Rollback refused: leave the COMPLETE staged tree in place and say exactly where.
          throw recoveryLoreError(
            `archive/delete transaction failed after staging and rollback was refused: ${describeCause(postCommit)}`,
            `the complete original tree remains recoverable under ${stagingRel} — restore it before rerunning`,
            { stagingRel, zipRel: verified.zipRel },
          );
        }
        // Full rollback succeeded: backlog/ holds exactly the staged (never-deleted) tree.
        throw new LoreError(
          "drift",
          `archive/delete transaction faulted and was rolled back: ${describeCause(postCommit)}`,
          "backlog/ is fully restored — resolve the cause and rerun the cutover",
          {},
        );
      }
      throw recoveryLoreError(
        `archive/delete transaction failed mid-deletion: ${describeCause(postCommit)}`,
        `all deleted files are present in the verified archive (${verified.zipRel}); any undeleted originals remain recoverable under ${stagingRel} — no Backlog content is lost; settle the staging directory before rerunning`,
        { stagingRel, zipRel: verified.zipRel },
      );
    };
    try {
      txn.renameSync(join(root, topDir), stagingAbs);
    } catch (cause) {
      // A thrown rename may still have performed the move on some platforms/filesystems: classify
      // by OBSERVED state, not by the exception alone.
      if (existsSync(stagingAbs) && !existsSync(join(root, topDir))) {
        handlePostCommit(new LoreError("drift", `post-rename fault: ${describeCause(cause)}`));
      }
      throw new LoreError(
        "drift",
        `could not stage "${topDir}" for verified deletion: ${describeCause(cause)}`,
        "backlog/ was NOT modified — resolve the filesystem error and rerun the cutover",
        { from: topDir, to: stagingRel },
      );
    }
    try {
      // Prove the staged tree still matches the verified archive before deleting anything.
      for (const e of evidence.entries) {
        const staged = join(stagingAbs, e.path.slice(topDir.length + 1));
        const st = statSync(staged);
        if (!st.isFile() || st.size !== e.bytes || sha256(readFileSync(staged)) !== e.sha256)
          throw new LoreError(
            "drift",
            `staged file "${e.path}" does not match the verified archive`,
            `nothing has been deleted; the complete original tree remains recoverable under ${stagingRel}`,
            { path: e.path, stagingRel },
          );
      }
      for (const e of evidence.entries) {
        txn.unlinkSync(join(stagingAbs, e.path.slice(topDir.length + 1)));
      }
      pruneEmptyDirs(stagingAbs);
      return evidence;
    } catch (postCommit) {
      return handlePostCommit(postCommit);
    }
  } catch (error) {
    // Never leave a partially-written zip behind on any pre/post-commit refusal that did NOT
    // consume the archive as recovery evidence.
    try {
      if (evidence === undefined || !isRecoveryFailure(error)) {
        const candidate = `${ARCHIVE_DIR}/backlog-${sanitizeId(id)}.zip`;
        if (existsSync(join(root, candidate))) unlinkSync(join(root, candidate));
        else if (evidence !== undefined && existsSync(join(root, evidence.zipRel)))
          unlinkSync(join(root, evidence.zipRel));
      }
    } catch {
      /* best-effort cleanup; the thrown error still names the state */
    }
    throw error;
  }
}

/** Injected rename/unlink seams so tests can fail the commit boundary or the delete loop deterministically. */
export interface ArchiveTransaction {
  readonly renameSync: (from: string, to: string) => void;
  readonly unlinkSync: (path: string) => void;
}

const defaultTransaction: ArchiveTransaction = {
  renameSync: (from, to) => renameSync(from, to),
  unlinkSync: (path) => unlinkSync(path),
};

/**
 * A recovery failure carries the durable evidence locations STRUCTURALLY in its `input`
 * (`stagingRel`/`zipRel`): classification never depends on prose wording, so the archive is
 * retained exactly when it is recovery evidence.
 */
function recoveryLoreError(message: string, hint: string, input: { stagingRel: string; zipRel: string }): LoreError {
  return new LoreError("drift", message, hint, input);
}

/** Recovery failures must keep their archive + staging evidence on disk; everything else cleans up. */
function isRecoveryFailure(error: unknown): boolean {
  return (
    error instanceof LoreError && typeof error.input === "object" && error.input !== null && "stagingRel" in error.input
  );
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Filesystem-safe id fragment for staging/archive artifact names. */
function sanitizeId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24);
  return safe.length > 0 ? safe : "cutover";
}

/** Refuse absolute paths, `..` climbs, backslash separators, drive/UNC shapes, and duplicates. */
function assertSafeEntryNames(names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (
      name.length === 0 ||
      posix.isAbsolute(name) ||
      /^[A-Za-z]:/.test(name) ||
      name.startsWith("\\\\") ||
      name.includes("\\") ||
      name.split("/").includes("..") ||
      seen.has(name)
    )
      throw new LoreError(
        "drift",
        `refusing unsafe archive entry ${JSON.stringify(name)}`,
        "the archive contains an entry outside the expected relative layout; do not delete backlog/",
        { entry: name },
      );
    seen.add(name);
  }
}

/** Every segment from the root down to `rel` must be symlink-free (lstat, not stat). */
function assertNoSymlinkSegments(root: string, rel: string): void {
  let cur = root;
  for (const segment of rel.split("/")) {
    cur = join(cur, segment);
    if (lstatSync(cur).isSymbolicLink())
      throw new LoreError(
        "drift",
        `refusing to archive through symlink "${rel}"`,
        "replace the symlink with a real path, then rerun the cutover",
        { path: rel },
      );
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Depth-first bottom-up prune: remove `dir` and its descendants while they hold no entries. */
function pruneEmptyDirs(dir: string): void {
  let children: string[];
  try {
    children = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of children) {
    const abs = join(dir, name);
    if (lstatSync(abs).isDirectory()) pruneEmptyDirs(abs);
  }
  try {
    rmdirSync(dir); // succeeds only when empty; a leftover entry is left loudly in place
  } catch {
    /* first non-prunable dir stops this branch; remaining content surfaces via the caller */
  }
}
