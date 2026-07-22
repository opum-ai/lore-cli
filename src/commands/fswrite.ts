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
 *   the bytes of files that already exist. This is deliberately *not* never-clobber: the whole
 *   point is to edit an existing doc in place. Most of these write a single file (or a handful) per
 *   run and use the plain {@link writeFileOverwriting}; `lore replace` can rewrite many files in one
 *   invocation, like `lore sync` below, so it uses the atomic {@link writeFileAtomic} instead
 *   (LORE-116) — a crash or I/O error partway through must never leave one of those files truncated.
 *
 * Both disciplines share one symlink guard ({@link assertNoSymlinkInPath}, LORE-76/LORE-77), so a
 * symlinked ancestor directory or final target refuses loudly instead of silently redirecting a
 * write outside the repo. {@link ensureDir} itself calls it (LORE-93), so every caller that
 * creates a parent directory before writing gets the guard automatically — `lore init`'s
 * never-clobber loop and `lore scaffold`'s all-or-nothing `writeAllOrRollback` no longer need
 * their own separate call. A multi-file caller additionally sweeps its whole planned write set
 * with {@link assertNoSymlinkInAnyPath} before writing any single file, so a bad target refuses
 * the operation up front rather than after some files already landed.
 *
 * All side effects live in the command layer (lore-design §2.1); core stays pure. These
 * helpers are that side-effecting layer, factored to one module so the filesystem-conflict
 * semantics are identical across every command.
 */

import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { errnoCode, LoreError } from "../errors";

/**
 * Refuse if any path segment from `root` down to (and including) `relPath` already exists as a
 * symlink — `lstatSync` per segment, never following. Standard `mkdirSync`/`writeFileSync` calls
 * always transparently resolve symlinks in the MIDDLE of a path (that's ordinary POSIX path
 * resolution, not something an `O_CREAT`/`O_EXCL`-style flag can disable) — no write discipline in
 * this module was ever safe against a symlinked ANCESTOR directory on its own. (A symlinked FINAL
 * component is a narrower story: `createIfAbsent`'s own `wx`+`lstat` check already refused that case
 * for `lore init`'s never-clobber writes before this guard existed, and `writeAllOrRollback`'s
 * `--force` overwrite branch follows a symlink at the final component too — this guard closes BOTH
 * gaps uniformly, at every segment, rather than leaving each write discipline with its own partial,
 * differently-shaped protection.) Shared by every write discipline this module owns:
 * `writeAllOrRollback`'s all-or-nothing scaffold writes (LORE-76) and `lore init`'s own
 * never-clobber `ensureDir`/`createIfAbsent` loop (LORE-77) both call this, rather than each
 * re-deriving the same `lstatSync`-per-segment walk. Mirrors this codebase's established READ-path
 * convention (`core/bundle.ts`, `commands/replace.ts`: explicit `lstatSync(...).isSymbolicLink()`,
 * never a stat-follows-symlinks helper) rather than inventing a new pattern. A path segment that
 * does not exist yet is fine — there is nothing to guard against until something is actually there
 * to redirect through.
 */
export function assertNoSymlinkInPath(root: string, relPath: string): void {
  const segment = findSymlinkSegment(root, relPath);
  if (segment !== null) {
    throw new LoreError(
      "conflict",
      `refusing to write ${relPath}: "${segment}" is a symlink, not a real directory or file`,
      "lore does not write through a symlink (it may resolve outside the repo) — remove or replace it, then re-run",
      { path: relPath, symlink: segment },
    );
  }
}

/**
 * The same per-segment `lstatSync` walk {@link assertNoSymlinkInPath} throws on, exposed as a
 * non-throwing query: the first path segment (from `root` down to `relPath`) that already exists as
 * a symlink, or `null` if none does. Lets a caller that wants to silently treat a symlinked path as
 * "not the directory I think it is" (rather than refuse the whole operation) reuse the identical
 * walk instead of re-deriving it — see `commands/schema.ts`'s `isManagedSchemasDir`.
 */
export function findSymlinkSegment(root: string, relPath: string): string | null {
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
      return segment;
    }
  }
  return null;
}

/**
 * `mkdir -p` for a directory a write is about to target, refusing first (via
 * {@link assertNoSymlinkInPath}) if any segment from `root` down to `relPath` is already a
 * symlink — every caller gets the LORE-76/77 guard for free rather than having to remember to
 * call it separately (LORE-93: five call sites — `new.ts`, `agents.ts`, `sync.ts`, `schema.ts`,
 * `rename.ts` — had no guard at all before this, since `mkdirSync` transparently follows a
 * symlinked ancestor). A permission failure maps to `denied`.
 */
export function ensureDir(root: string, relPath: string): void {
  assertNoSymlinkInPath(root, relPath);
  try {
    mkdirSync(join(root, relPath), { recursive: true });
  } catch (cause) {
    throw ioError(cause, relPath, "create directory");
  }
}

/**
 * Refuse (via {@link assertNoSymlinkInPath}) if ANY of `relPaths` has a symlinked ancestor —
 * a preflight sweep across a whole planned multi-file write set, run BEFORE any single write in
 * that set begins. `ensureDir`'s own per-call guard alone is reactive: in a loop writing several
 * files, it would only refuse when the LOOP REACHES the bad target, by which point earlier
 * targets in the same set may already be written — exactly the partial-write outcome LORE-93
 * AC#5 says a multi-file operation must never produce. Calling this once, before the loop starts,
 * makes the operation either fully proceed or refuse before touching anything. Reuses the
 * identical per-segment walk `ensureDir` itself uses, rather than a second check pattern.
 */
export function assertNoSymlinkInAnyPath(root: string, relPaths: Iterable<string>): void {
  for (const relPath of relPaths) {
    assertNoSymlinkInPath(root, relPath);
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
 * `renameSync` it over `absPath`. `lore sync` (LORE-26) and `lore replace` (LORE-116) are the
 * commands that can write many files in a single invocation, so a crash or kill mid-run must never
 * leave any *one* target file truncated or half-written — a plain `writeFileSync` truncates the
 * destination before writing, which a crash between those two steps would leave corrupted; a
 * same-directory rename is atomic (same filesystem, POSIX and NTFS both guarantee it) so the
 * destination is always either its old complete bytes or its new complete bytes, never a partial
 * write. This is per-file atomicity only — a failure partway through a multi-file commit loop still
 * leaves files already written in that same run committed, with no cross-file rollback (both
 * commands' own callers document that as a separate, deferred concern). Every other command keeps
 * {@link writeFileOverwriting} — see that function's own doc for why a plain overwrite is the right
 * discipline there.
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
 * where a file must go (`EISDIR` on an overwrite, `EEXIST` on a never-clobber `mkdir`), a file
 * sitting on an ancestor segment (`ENOTDIR`), or a symlink an `O_NOFOLLOW` open refused to follow
 * (`ELOOP`, see {@link writeFileNoFollow}) — becomes a `conflict` {@link LoreError}. Both carry an
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
  if (code === "EEXIST" || code === "ENOTDIR" || code === "EISDIR" || code === "ELOOP") {
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
 *   an acceptable rollback outcome. The overwrite itself goes through {@link writeFileNoFollow}, not
 *   the shared {@link writeFileOverwriting} (LORE-92): `assertNoSymlinkInPath` above is a
 *   check-then-act `lstatSync` walk, which cannot itself close a race against a symlink planted in
 *   the window between that check and this write — a concurrent process could still swap the target
 *   for a symlink after the guard passes and before a plain `writeFileSync` (which transparently
 *   follows symlinks) performs the overwrite. `writeFileNoFollow` closes that window structurally
 *   on POSIX, at the single `open()` call that does the write, rather than re-checking-then-still-
 *   racing — Windows lacks a POSIX-equivalent symlink-refusing open (libuv does not implement
 *   `UV_FS_O_NOFOLLOW` there), so this specific race window remains open on that platform; see
 *   {@link writeFileNoFollow}'s own docstring. The rollback restore below (on a *later* failure)
 *   goes through the same {@link writeFileNoFollow}, for the identical reason — a symlink swapped in
 *   after a successful write but before a later step's failure triggers rollback should not be
 *   silently written through either.
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
      const abs = join(root, dir);
      const dirExisted = existsSync(abs);
      ensureDir(root, dir);
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
        writeFileNoFollow(abs, file.contents, file.path);
        undo.push(() => writeFileNoFollow(abs, before, file.path));
        return { path: file.path, action: "updated" as const };
      }
      writeFileNoFollow(abs, file.contents, file.path);
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

/**
 * Write every byte of `buf` via `write`, looping on a short write — `write` accepting fewer bytes
 * than offered — rather than treating it as complete. Mirrors `writeFileSync`'s own internal loop
 * for a `Buffer` input, done for the same reason: a single `write(2)` is not guaranteed to consume
 * the whole buffer (e.g. a disk filling up mid-write returns a short, successful write, with the
 * real `ENOSPC` only surfacing on the *next* call) — treating one `write` call as the whole file
 * would silently truncate it with no error. `write` is injected (rather than this function calling
 * `writeSync` directly) so the loop's own accumulation logic can be unit-tested deterministically
 * with a fake writer that simulates short writes, since a genuine short write against a real fd
 * isn't reliably reproducible in a test.
 */
export function writeAllBytes(write: (buf: Buffer, offset: number, length: number) => number, buf: Buffer): void {
  let offset = 0;
  while (offset < buf.length) {
    offset += write(buf, offset, buf.length - offset);
  }
}

/**
 * Overwrite (or create) a file, refusing to follow a symlink at the final path component — even
 * one planted *after* an earlier {@link assertNoSymlinkInPath} check on the same path already
 * passed (LORE-92). That check is a check-then-act `lstatSync` walk; nothing stops a concurrent
 * process from swapping the target for a symlink in the window between the check and a later
 * plain `writeFileSync` (which transparently follows symlinks, mid-path or final component alike).
 * `O_NOFOLLOW` closes that window structurally on POSIX (Linux/macOS): the same `open()` call that
 * performs the write is also the one that refuses the symlink, so there is no gap for a race to
 * land in. **This guarantee does not extend to Windows** — libuv does not implement
 * `UV_FS_O_NOFOLLOW` there (no POSIX-style symlink-refusing open exists on that platform), so
 * `openSync` silently ignores the flag and this function's write-time protection degrades to the
 * same symlink-following behavior as the plain {@link writeFileOverwriting} it replaces. The
 * pre-existing `assertNoSymlinkInPath` check-then-act guard still runs first regardless of
 * platform, so Windows is no *more* exposed than it was before this fix — but the race window this
 * function exists to close on POSIX remains open there. A refused POSIX open fails `ELOOP`, given
 * the same explicit "is a symlink" message and `conflict` diagnosis `assertNoSymlinkInPath` uses.
 * `writeAllOrRollback`'s `--force` branch is the only caller — every other write discipline in this
 * module is either check-then-atomic-create ({@link createIfAbsent}'s `wx` open, independently
 * TOCTOU-safe on every platform: `O_CREAT|O_EXCL` refuses on ANY pre-existing entry at the path,
 * symlink or not, with no symlink-detection required) or doesn't need this
 * ({@link writeFileOverwriting}'s other callers — `lore rename`/`supersede` (and `lore replace`,
 * via {@link writeFileAtomic}) — write back over a concept file the bundle loader just read, and
 * that loader already skips symlinked files during its walk, so their target was never a symlink to
 * begin with). The write itself loops on a
 * short write via {@link writeAllBytes} rather than trusting one `writeSync` call to consume the
 * whole buffer.
 */
export function writeFileNoFollow(absPath: string, contents: string, relPath: string): void {
  let fd: number;
  try {
    fd = openSync(absPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o666);
  } catch (cause) {
    if (errnoCode(cause) === "ELOOP") {
      throw new LoreError(
        "conflict",
        `refusing to write ${relPath}: it is a symlink, not a real file`,
        "lore does not write through a symlink (it may resolve outside the repo) — remove or replace it, then re-run",
        { path: relPath, symlink: relPath },
      );
    }
    throw ioError(cause, relPath, "write file");
  }
  try {
    writeAllBytes((b, offset, length) => writeSync(fd, b, offset, length), Buffer.from(contents, "utf8"));
  } catch (cause) {
    try {
      closeSync(fd);
    } catch {
      // Best-effort cleanup; the write failure below is what's reported.
    }
    throw ioError(cause, relPath, "write file");
  }
  try {
    closeSync(fd);
  } catch (cause) {
    throw ioError(cause, relPath, "write file");
  }
}
