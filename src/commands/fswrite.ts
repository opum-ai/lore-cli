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
 * Both disciplines share one symlink guard ({@link assertNoSymlinkInPath}, LORE-76/LORE-77):
 * `lore init`'s never-clobber loop and `lore scaffold`'s all-or-nothing `writeAllOrRollback` both
 * call it before touching a path, so a symlinked ancestor directory or final target refuses loudly
 * instead of silently redirecting a write outside the repo.
 *
 * All side effects live in the command layer (lore-design §2.1); core stays pure. These
 * helpers are that side-effecting layer, factored to one module so the filesystem-conflict
 * semantics are identical across every command.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { errnoCode, LoreError } from "../errors";

/**
 * Refuse if any path segment from `root` down to (and including) `relPath` already exists as a
 * symlink — `lstatSync` per segment, never following. Standard `mkdirSync`/`writeFileSync` calls
 * always transparently resolve symlinks in the MIDDLE of a path (that's ordinary POSIX path
 * resolution, not something an `O_CREAT`/`O_EXCL`-style flag can disable), and an unforced overwrite
 * or a `--force` write can follow a symlink at the FINAL component too — so a symlinked ancestor
 * directory, or a symlinked final target, would otherwise let a write land outside the repo
 * entirely unnoticed. Shared by every write discipline this module owns: `writeAllOrRollback`'s
 * all-or-nothing scaffold writes (LORE-76) and `lore init`'s own never-clobber `ensureDir`/
 * `createIfAbsent` loop (LORE-77) both call this, rather than each re-deriving the same
 * `lstatSync`-per-segment walk. Mirrors this codebase's established READ-path convention
 * (`core/bundle.ts`, `commands/replace.ts`: explicit `lstatSync(...).isSymbolicLink()`, never a
 * stat-follows-symlinks helper) rather than inventing a new pattern. A path segment that does not
 * exist yet is fine — there is nothing to guard against until something is actually there to
 * redirect through.
 */
export function assertNoSymlinkInPath(root: string, relPath: string): void {
  let prefix = root;
  for (const segment of relPath.split("/")) {
    if (segment === "") {
      continue; // relPath is always a POSIX-relative path; never emits an empty leading segment
    }
    prefix = join(prefix, segment);
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(prefix);
    } catch {
      continue; // does not exist yet at this segment — nothing here to redirect through
    }
    if (stat.isSymbolicLink()) {
      throw new LoreError(
        "conflict",
        `refusing to write ${relPath}: "${segment}" is a symlink, not a real directory or file`,
        "lore does not write through a symlink (it may resolve outside the repo) — remove or replace it, then re-run",
        { path: relPath, symlink: segment },
      );
    }
  }
}

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
 * Overwrite (or create) a file **atomically**: write the new bytes to a sibling temp file, then
 * `renameSync` it over `absPath`. `lore sync` (LORE-26) is the one command that can write many
 * files in a single invocation, so a crash or kill mid-run must never leave any *one* target file
 * truncated or half-written — a plain `writeFileSync` truncates the destination before writing,
 * which a crash between those two steps would leave corrupted; a same-directory rename is atomic
 * (same filesystem, POSIX and NTFS both guarantee it) so the destination is always either its old
 * complete bytes or its new complete bytes, never a partial write. Only `lore sync`'s writes use
 * this; every other command keeps {@link writeFileOverwriting} — see that function's own doc for why
 * a plain overwrite is the right discipline there.
 */
export function writeFileAtomic(absPath: string, contents: string, relPath: string): void {
  const tmpPath = join(dirname(absPath), `.lore-sync-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  let tmpFileExists = false;
  try {
    writeFileSync(tmpPath, contents);
    tmpFileExists = true; // only true once the write itself has actually succeeded
    renameSync(tmpPath, absPath);
  } catch (cause) {
    let cleanupFailed = false;
    if (tmpFileExists) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // The write/rename failure below is what's primarily reported; a failure here (rare — the
        // process is already failing) is folded into that error's own hint/input rather than
        // silently dropped, so a stray `.lore-sync-tmp-*` file is at least surfaced, not silent litter.
        cleanupFailed = true;
      }
    }
    // A `writeFileSync` failure (e.g. EACCES on a read-only directory — the most common real-world
    // trigger) never creates `tmpPath` at all, so cleanup is skipped above rather than attempted and
    // its inevitable ENOENT misreported as "cleanup failed": the error below must never claim a temp
    // file remains when none was ever created.
    const err = ioError(cause, relPath, "write file");
    if (cleanupFailed && err instanceof LoreError) {
      throw new LoreError(
        err.type,
        err.message,
        `${err.hint ?? ""} A temp file may also remain at ${tmpPath} — remove it manually.`.trim(),
        typeof err.input === "object" && err.input !== null ? { ...err.input, staleTempFile: tmpPath } : err.input,
      );
    }
    throw err;
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

// ── All-or-nothing scaffold writes ─────────────────────────────────────────────

/** One file {@link writeAllOrRollback} plans to write, with the exact bytes to apply. */
export interface WriteAllOrRollbackFile {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** The exact bytes to write — the caller's already-built content. */
  readonly contents: string;
}

/** One file {@link writeAllOrRollback} wrote (or, under `force`, overwrote), for the caller's report. */
export interface WriteAllOrRollbackResult {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** Whether this call created the file fresh or overwrote a pre-existing one (`force` only). */
  readonly action: "created" | "updated";
}

/**
 * Ensure `dirs` exist and write every file in `files`, tracking an undo action per directory/file as
 * it succeeds. If any step throws partway through, every already-applied step this call made is
 * rolled back — directories removed (only if still empty; they can hold only files this same call
 * wrote, and those are undone first by the LIFO order below) and files restored to their pre-call
 * bytes, or removed if they did not exist before — before the original error is rethrown. This is
 * the shared all-or-nothing write primitive `commands/scaffold.ts` needs (LORE-39); `commands/rename.ts`
 * flags the identical need ("cross-file transactional rollback is a shared concern with `lore replace`,
 * deferred") and can adopt this later. Factored here — rather than kept private to one command — so
 * the filesystem-conflict semantics stay identical across every command (this module's own docstring).
 *
 * Every directory and file path is checked via {@link assertNoSymlinkInPath} BEFORE any mkdir/write
 * touches it (LORE-76) — a symlinked ancestor directory or a symlinked final target refuses loudly
 * rather than silently redirecting the write outside the repo; that check throws before this call's
 * own undo stack has anything to roll back for the offending step, so it composes with the rollback
 * discipline below without special-casing.
 *
 * Two write disciplines, chosen by `opts.force`:
 * - **not forced** — every file is expected to be absent (the caller's own preflight has typically
 *   already confirmed this across the whole plan, so it can name every collision at once). Routed
 *   through {@link createIfAbsent}'s atomic `wx` open rather than a plain `existsSync` + write, so a
 *   file that appears in the TOCTOU window between the caller's preflight and this call is a loud
 *   `conflict` — never a silent clobber.
 * - **forced** — a file may already exist and is meant to be overwritten. Its prior bytes are read
 *   *before* the write, so a later failure elsewhere in this call can restore them. If a pre-existing
 *   file's bytes cannot be read (e.g. write-only permissions, or a non-regular entry occupying the
 *   path) the call refuses **before ever writing that file** — it never proceeds to
 *   overwrite-then-maybe-delete it, because deleting a file that existed before this call ran is never
 *   an acceptable rollback outcome.
 *
 * Rollback is best-effort: a failure while undoing is swallowed so the original error — not a
 * secondary cleanup failure — is what the caller sees.
 */
export function writeAllOrRollback(
  root: string,
  dirs: readonly string[],
  files: readonly WriteAllOrRollbackFile[],
  opts: { readonly force: boolean },
): WriteAllOrRollbackResult[] {
  const undo: Array<() => void> = [];
  try {
    for (const dir of dirs) {
      assertNoSymlinkInPath(root, dir);
      const abs = join(root, dir);
      const dirExisted = existsSync(abs);
      ensureDir(abs, dir);
      if (!dirExisted) {
        undo.push(() => {
          try {
            // Only removes an EMPTY directory — never a recursive delete. This is a no-op if
            // this call's own file writes into it were not already undone first (they always
            // are, since `undo` is a single LIFO stack and every file undo below is pushed
            // after this directory's), so a directory this call did not create is never at risk.
            rmdirSync(abs);
          } catch {
            // Best-effort rollback; see the shared catch below.
          }
        });
      }
    }
    return files.map((file) => {
      assertNoSymlinkInPath(root, file.path);
      const abs = join(root, file.path);
      if (!opts.force) {
        if (!createIfAbsent(abs, file.contents, file.path)) {
          throw conflictError(file.path);
        }
        undo.push(() => rmSync(abs, { force: true }));
        return { path: file.path, action: "created" as const };
      }
      if (existsSync(abs)) {
        const before = readExistingOrThrow(abs, file.path);
        writeFileOverwriting(abs, file.contents, file.path);
        undo.push(() => writeFileSync(abs, before));
        return { path: file.path, action: "updated" as const };
      }
      writeFileOverwriting(abs, file.contents, file.path);
      undo.push(() => rmSync(abs, { force: true }));
      return { path: file.path, action: "created" as const };
    });
  } catch (err) {
    for (const step of undo.reverse()) {
      try {
        step();
      } catch {
        // Best-effort rollback; the original write failure above is what's reported.
      }
    }
    throw err;
  }
}

/**
 * Read a pre-existing file's current bytes so {@link writeAllOrRollback} can restore them on
 * rollback — or refuse, via the shared {@link ioError} classification, rather than ever proceeding to
 * overwrite (and potentially later delete on rollback) a file whose original bytes could not be
 * captured. A file that existed before a call to {@link writeAllOrRollback} must never be destroyed
 * by that same call's own undo path.
 */
function readExistingOrThrow(absPath: string, relPath: string): string {
  try {
    return readFileSync(absPath, "utf8");
  } catch (cause) {
    throw ioError(cause, relPath, "read pre-existing file before overwriting");
  }
}
