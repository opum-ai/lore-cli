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
 * - Scan⇄delete drift is refused: every source file is re-hashed immediately before its own
 *   unlink, and a mid-flight change aborts with nothing further deleted and no zip left behind.
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
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, posix } from "node:path";
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
  const zipRel = `${ARCHIVE_DIR}/backlog-${id}.zip`;
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
 * The full archive-and-delete leg: snapshot → build → verify the archive → re-hash live sources →
 * delete each regular file (re-hashed immediately before its unlink) → prune emptied directories →
 * persist inventory LAST as evidence. Any failure leaves `backlog/` intact and removes the partial
 * zip.
 */
export function archiveAndDeleteBacklog(root: string, zip: ZipWriter, id: string): ArchiveEvidence {
  const entries = planBacklogSnapshot(root);
  let evidence: ArchiveEvidence | undefined;
  try {
    evidence = buildArchive(root, entries, zip, id);
    verifyArchive(root, evidence, zip);
    // Delete: each file is re-hashed IMMEDIATELY before its own unlink (scan⇄delete drift
    // refusal per file), then every now-empty directory under the storage root is pruned
    // bottom-up (including previously-empty ones that held no archivable file).
    if (evidence.entries.length === 0)
      throw new LoreError("validation", "refusing to delete from an empty archive plan");
    const firstEntry = evidence.entries[0];
    if (firstEntry === undefined) throw new LoreError("validation", "refusing to delete from an empty archive plan");
    const topDir = firstEntry.path.split("/")[0] ?? firstEntry.path;
    for (const e of evidence.entries) {
      const st = statSync(join(root, e.path));
      if (!st.isFile() || st.size !== e.bytes || sha256(readFileSync(join(root, e.path))) !== e.sha256)
        throw new LoreError(
          "drift",
          `"${e.path}" changed between archive scan and deletion`,
          "backlog/ was modified during the cutover; it has NOT been deleted — rerun the cutover",
          { path: e.path },
        );
      unlinkSync(join(root, e.path));
    }
    pruneEmptyDirs(join(root, topDir));
  } catch (error) {
    // Never leave a partially-written zip behind on any refusal.
    try {
      if (existsSync(join(root, ARCHIVE_DIR))) {
        const candidate = `${ARCHIVE_DIR}/backlog-${id}.zip`;
        if (evidence === undefined && existsSync(join(root, candidate))) unlinkSync(join(root, candidate));
        else if (evidence !== undefined && existsSync(join(root, evidence.zipRel)))
          unlinkSync(join(root, evidence.zipRel));
      }
    } catch {
      /* best-effort cleanup; the drift error below still names the state */
    }
    throw error;
  }
  return evidence;
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
