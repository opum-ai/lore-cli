/**
 * commands/fswrite.ts — the shared write seam for file-writing commands.
 *
 * Two write disciplines live here, one per command family:
 *
 * - **never-clobber** — `lore init` and `lore new` create files **only when absent**
 *   ({@link createIfAbsent}), so a re-run (or a pre-existing user edit) is never overwritten.
 *   A directory or symlink sitting where a file must go is a `conflict` {@link LoreError}
 *   (exit 5) for both, instead of each command re-deriving the `wx`/`EEXIST`/`lstat` dance.
 * - **overwrite** — the refactoring commands (`lore replace`/`rename`/`supersede`) rewrite
 *   the bytes of files that already exist ({@link writeFileOverwriting}). This is deliberately
 *   *not* never-clobber: the whole point is to edit an existing doc in place.
 *
 * All side effects live in the command layer (lore-design §2.1); core stays pure. These
 * helpers are that side-effecting layer, factored to one module so the filesystem-conflict
 * semantics are identical across every command.
 */

import { lstatSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { errnoCode, LoreError } from "../errors";

/** `mkdir -p` for a scaffold directory, mapping a permission failure to a `denied` error. */
export function ensureDir(absPath: string, relPath: string): void {
  try {
    mkdirSync(absPath, { recursive: true });
  } catch (cause) {
    throw ioError(cause, relPath, "create directory");
  }
}

/**
 * Atomically create a file only if it does not exist (`flag: "wx"`), returning `true`
 * when it was created and `false` when a regular file already existed. Using `wx` rather
 * than an `existsSync` precheck closes the TOCTOU window and guarantees the never-clobber
 * contract: a concurrent or pre-existing file is left exactly as it was. A **non-regular**
 * entry (directory, symlink, …) occupying the path is a structural `conflict`, not a benign
 * skip — surfaced so a malformed bundle never reads as a clean re-run.
 */
export function createIfAbsent(absPath: string, contents: string, relPath: string): boolean {
  try {
    writeFileSync(absPath, contents, { flag: "wx" });
    return true;
  } catch (cause) {
    if (errnoCode(cause) === "EEXIST") {
      if (existingIsRegularFile(absPath)) {
        return false;
      }
      throw conflictError(relPath);
    }
    throw ioError(cause, relPath, "write file");
  }
}

/**
 * Overwrite (or create) a file with `contents`, the write discipline the refactoring commands
 * need: `lore replace`/`rename`/`supersede` edit the bytes of a doc that already exists, so —
 * unlike {@link createIfAbsent} — an existing regular file is *meant* to be replaced. Parent
 * directories are assumed to exist (a refactor writes back over a file it just read); a
 * permission failure maps to `denied` and a non-regular entry blocking the path to `conflict`,
 * via the shared {@link ioError}.
 */
export function writeFileOverwriting(absPath: string, contents: string, relPath: string): void {
  try {
    writeFileSync(absPath, contents);
  } catch (cause) {
    throw ioError(cause, relPath, "write file");
  }
}

/**
 * Relocate a file from `fromAbs` to `toAbs` — the filesystem half of `lore rename`. A rename
 * **renames the source** (rather than writing a new file and deleting the old) for one critical
 * reason: on a case-insensitive filesystem a case-only rename (`Foo.md` → `foo.md`) targets the
 * **same inode**, where a write-new-then-delete-old sequence would delete the very file it just
 * wrote — silent data loss. `renameSync` instead atomically changes the name (including its case)
 * and is crash-safe: the old path is never gone before the new one exists. The caller guarantees
 * the destination directory exists and is unoccupied (the never-clobber pre-flight). A permission
 * failure maps to `denied` and a non-regular blocker to `conflict` via the shared {@link ioError}.
 */
export function moveFile(fromAbs: string, toAbs: string, relPath: string): void {
  try {
    renameSync(fromAbs, toAbs);
  } catch (cause) {
    throw ioError(cause, relPath, "move file");
  }
}

/**
 * Whether the entry already at `absPath` is a regular file. Uses `lstat` (does not
 * follow symlinks), so a symlink occupying a path is treated as the non-regular conflict
 * it is rather than silently honored via its target. A failing stat — the entry vanished
 * in a concurrent race after the `wx` EEXIST — degrades to `true` so the caller reports a
 * benign skip instead of crashing on a self-resolving race.
 */
function existingIsRegularFile(absPath: string): boolean {
  try {
    return lstatSync(absPath).isFile();
  } catch {
    return true;
  }
}

/**
 * Map a filesystem failure to a diagnostic. A permission error (`EACCES`/`EPERM`)
 * becomes a `denied` {@link LoreError}; a non-regular entry occupying a path lore needs — a directory
 * where a file must go (`EISDIR` on an overwrite, `EEXIST` on a never-clobber `mkdir`) or a file
 * sitting on an ancestor segment (`ENOTDIR`) — becomes a `conflict` {@link LoreError}. Both carry an
 * actionable hint. Anything else is rethrown so a genuinely unexpected IO fault surfaces as an
 * uncaught failure (exit 1, "report this") rather than being mislabeled a user condition.
 */
export function ioError(cause: unknown, relPath: string, action: string): unknown {
  const code = errnoCode(cause);
  if (code === "EACCES" || code === "EPERM") {
    return new LoreError(
      "denied",
      `permission denied trying to ${action} ${relPath}`,
      "check write permissions on the bundle directory, then re-run the command",
      { path: relPath, code },
    );
  }
  if (code === "EEXIST" || code === "ENOTDIR" || code === "EISDIR") {
    return conflictError(relPath, code);
  }
  return cause;
}

/** A `conflict` {@link LoreError}: a non-regular file blocks a path the command must create. */
export function conflictError(relPath: string, code?: string): LoreError {
  return new LoreError(
    "conflict",
    `cannot write ${relPath}: a conflicting file already exists where lore needs to create it`,
    "remove or rename the conflicting entry, then re-run the command",
    code ? { path: relPath, code } : { path: relPath },
  );
}
