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
  chmodSync,
  chownSync,
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
  statSync,
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
 * write. This is per-file atomicity only — a bare loop calling this directly still leaves files
 * already written in that same run committed if a later write throws, with no cross-file rollback;
 * `lore replace`'s own caller documents that as a separate, deferred concern (`lore rename`'s
 * `writeFileOverwriting` loop carries the identical note). `lore sync` (LORE-120) instead routes its
 * whole write set through {@link writeManyAtomicOrRollback}, which adds that cross-file undo on top
 * of this function's own per-file atomicity — see its own doc. Every other command keeps
 * {@link writeFileOverwriting} — see that function's own doc for why a plain overwrite is the right
 * discipline there.
 *
 * The temp file is otherwise created with the process's default umask, which would silently
 * replace any non-default mode (or ownership) the destination already had — a doc made
 * group-writable, or locked down to `0600`, would flip back to the umask default on every sync
 * write. To avoid that (LORE-117), the destination's existing mode/ownership is `statSync`'d
 * *before* the temp write and, when present, carried onto the temp file (mode via `chmodSync`,
 * ownership best-effort via `chownSync`) before the rename replaces it — so the destination's
 * permissions/ownership survive the swap instead of reverting to whatever the umask would produce.
 * A destination that doesn't exist yet (first write) has nothing to preserve: the stat is only
 * ever used to conditionally apply preservation, never to gate or fail the write itself, so that
 * case falls through to plain default-umask behavior exactly as before this fix.
 */
export function writeFileAtomic(absPath: string, contents: string, relPath: string): void {
  const tmpPath = join(dirname(absPath), `.lore-sync-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  let tmpFileExists = false;
  try {
    // Capture the destination's current mode/ownership, if it exists, BEFORE writing the temp
    // file, so there's something to carry over once the write succeeds. Any stat failure (no
    // prior file at all -- the common `ENOENT` first-write case -- or something else transient)
    // is treated identically: there's nothing to preserve, so the write proceeds with plain
    // default-umask behavior rather than erroring on what is not actually a failure condition.
    let destStat: ReturnType<typeof statSync> | null = null;
    try {
      destStat = statSync(absPath);
    } catch {
      destStat = null;
    }
    writeFileSync(tmpPath, contents);
    tmpFileExists = true; // only true once the write itself has actually succeeded
    if (destStat !== null) {
      // Mode preservation is not best-effort: a failure here means the file is about to land with
      // the wrong permissions, so it's surfaced as a write failure (below) like any other step in
      // this sequence, rather than silently swallowed.
      chmodSync(tmpPath, destStat.mode & 0o7777);
      try {
        // Ownership IS best-effort: an unprivileged process cannot `chown` to an arbitrary uid/gid
        // (EPERM is the expected outcome on every non-root run) and some platforms don't support
        // `chown` at all -- neither should fail a write that has already correctly preserved mode.
        chownSync(tmpPath, destStat.uid, destStat.gid);
      } catch {
        // Swallowed: see above.
      }
    }
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

// ── Atomic multi-file writes with rollback ─────────────────────────────────────

/** One file {@link writeManyAtomicOrRollback} plans to write, with enough state to undo it. */
export interface AtomicRollbackWrite {
  /** Absolute filesystem path to write. */
  readonly abs: string;
  /** Repo-relative path, for error messages (mirrors every other write helper's `relPath`). */
  readonly relPath: string;
  /** The file's bytes immediately before this write, or `undefined` if it did not exist yet — the
   *  state rollback restores it to. Callers must capture this from disk *before* the write phase
   *  starts (`lore sync`'s own re-read-then-diff loop already does, per-file, for exactly this
   *  reason — see LORE-119). */
  readonly before: string | undefined;
  /** The new bytes to write. */
  readonly after: string;
}

/**
 * Write every entry in `writes` via {@link writeFileAtomic} (each individual write keeping its own
 * per-file atomicity — a crash mid-write never truncates a single target), and if any write in the
 * list throws, undo every write this call already applied — in reverse order — before rethrowing:
 * a file that had prior content is restored to its `before` bytes; a file that did not exist before
 * this call (`before: undefined`) is removed. This closes the gap {@link writeFileAtomic}'s own
 * docstring flags ("a failure partway through a multi-file commit loop still leaves files already
 * written in that same run committed, with no cross-file rollback") for callers that opt in by
 * routing their whole write set through here instead of a bare loop (`lore sync`, LORE-120).
 *
 * `writeAtomic` is injectable (defaulting to the real {@link writeFileAtomic}) so a test can force a
 * failure on a specific write deterministically, mirroring {@link writeAllBytes}'s own injected
 * `write` — the same reason applies: a real disk failure at an exact, chosen point in a multi-file
 * loop is not reliably reproducible against a real filesystem.
 *
 * Rollback is best-effort, matching {@link writeAllOrRollback}'s own discipline: a failure while
 * undoing one entry is swallowed (rather than thrown) so the original write failure — not a
 * secondary cleanup failure — is what the caller ultimately sees, and every other already-applied
 * entry still gets its own undo attempt rather than the whole rollback aborting on the first one
 * that fails.
 */
export function writeManyAtomicOrRollback(
  writes: readonly AtomicRollbackWrite[],
  writeAtomic: (absPath: string, contents: string, relPath: string) => void = writeFileAtomic,
): void {
  const applied: AtomicRollbackWrite[] = [];
  try {
    for (const write of writes) {
      writeAtomic(write.abs, write.after, write.relPath);
      applied.push(write);
    }
  } catch (err) {
    for (const write of applied.reverse()) {
      try {
        if (write.before === undefined) {
          rmSync(write.abs, { force: true });
        } else {
          writeAtomic(write.abs, write.before, write.relPath);
        }
      } catch {
        // Best-effort rollback; see the shared discipline note above.
      }
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
 * and is crash-safe: the old path is never gone before the new one exists.
 *
 * The caller's own precheck (`rename.ts`'s `assertTargetFree`) only proves the destination was free
 * at PLAN time — an I/O-heavy window (rewriting every inbound file, regenerating indexes) can
 * separate that check from this function actually running, during which another process (or a
 * concurrent `lore` invocation) may create a file at `toAbs`. Without a fresh check here,
 * `renameSync` would atomically replace it without a trace (LORE-132). {@link assertMoveTargetSafe}
 * re-verifies immediately before the syscall, closing that window down to this one call — a
 * destination that appeared in the meantime and differs from the source is reported the same
 * `conflict` `assertTargetFree` raises, while a destination resolving to the source's own inode (the
 * case-only-rename case above) is let through unchanged. A permission failure maps to `denied` and a
 * non-regular blocker to `conflict` via the shared {@link ioError}.
 */
export function moveFile(fromAbs: string, toAbs: string, relPath: string): void {
  assertMoveTargetSafe(fromAbs, toAbs, relPath);
  try {
    renameSync(fromAbs, toAbs);
  } catch (cause) {
    throw ioError(cause, relPath, "move file");
  }
}

/**
 * The last-mile half of {@link moveFile}'s TOCTOU close (LORE-132): re-stat the destination
 * immediately before the rename syscall and refuse if it is now occupied by anything other than the
 * source's own inode. Identity is compared via `statSync`'s `dev`/`ino` (not a path/byte comparison,
 * and not `lstatSync` — this deliberately mirrors `canonicalIdentity`'s follow-symlinks semantics, so
 * a destination that is a symlink resolving to the source is treated the same "already the source"
 * way a real case-only rename is) — the ONLY way to tell "this is the same physical file under a
 * different spelling" (a legitimate case-only rename, which must still succeed) apart from "this is
 * really a different file that raced in after the plan-time check" (a genuine collision, which must
 * fail loudly rather than being silently replaced). Either stat failing (destination genuinely
 * absent, or a transient error) is treated as nothing to guard against — `renameSync` itself raises
 * the real error if something is actually wrong.
 */
function assertMoveTargetSafe(fromAbs: string, toAbs: string, relPath: string): void {
  let destStat: ReturnType<typeof statSync>;
  try {
    destStat = statSync(toAbs);
  } catch {
    return; // destination doesn't exist (or isn't stat-able) — nothing occupies it, proceed
  }
  let srcStat: ReturnType<typeof statSync>;
  try {
    srcStat = statSync(fromAbs);
  } catch {
    return; // can't identify the source here — fall through to renameSync, which raises the real error
  }
  if (destStat.dev === srcStat.dev && destStat.ino === srcStat.ino) {
    return; // same physical file (a case-only rename) — not a collision
  }
  throw new LoreError(
    "conflict",
    `cannot move to ${relPath}: a file already exists at that path`,
    "choose a target path that is not already taken (concept or not), or remove the conflicting file",
    { path: relPath },
  );
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
 * sitting on an ancestor segment (`ENOTDIR`), or a symlink loop encountered while the kernel
 * resolves the path (`ELOOP`) — becomes a `conflict` {@link LoreError}. Both carry an
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
 *   the shared {@link writeFileOverwriting} (LORE-92) or the in-place {@link writeFileAtomic} — a
 *   symlink-safe **and** crash-safe write-to-temp-then-`renameSync` (LORE-130): a symlink swapped
 *   into the destination's path in the TOCTOU window between `assertNoSymlinkInPath` above and this
 *   write cannot be written through, because `writeFileNoFollow` both refuses a symlinked destination
 *   up front AND, even if one raced in after that check, `renameSync` never follows a symlink at its
 *   destination in the first place (POSIX replaces the link itself, never whatever it points to) — see
 *   {@link writeFileNoFollow}'s own docstring for both properties in full. Layered on top of that,
 *   the write itself is now crash-safe against a kill or process crash mid-write, not just against a
 *   thrown JS exception: the destination is never opened/truncated in place, so a kill at any point
 *   before the commit `renameSync` leaves it holding its complete prior bytes untouched, and a kill
 *   after that single atomic rename leaves it holding the complete new bytes — never the partially
 *   overwritten state an in-place `O_TRUNC` write could leave behind. The rollback restore below (on
 *   a *later* failure) goes through the same {@link writeFileNoFollow}, for the identical reason — a
 *   symlink swapped in after a successful write, or a kill during the restore write itself, should
 *   get the same protection the forward write gets.
 *
 * Rollback is best-effort: a failure while undoing is swallowed so the original error — not a
 * secondary cleanup failure — is what the caller sees. A kill signal during the *undo* write itself
 * carries the same per-file crash-safety {@link writeFileNoFollow} now provides for the forward
 * write — see its own docstring — but a kill between two undo steps in this call's LIFO stack still
 * leaves whichever earlier steps hadn't run yet un-rolled-back, exactly as a thrown exception would;
 * this function's rollback was never, and still isn't, a transaction across the *whole* undo stack.
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
 * passed (LORE-92) — via a **write-to-temp-then-`renameSync`** commit, which doubles as the fix
 * for a second, distinct hazard (LORE-130): the destination is never opened/truncated in place, so
 * a process kill or crash *mid-write* can never leave it holding a partially-overwritten mix of old
 * and new bytes — a kill before the commit rename leaves it holding its complete prior content
 * untouched, and a kill after that single rename leaves it holding the complete new content. (An
 * earlier version of this function opened the destination directly with `O_TRUNC | O_NOFOLLOW` and
 * wrote in place with a `writeSync` loop — TOCTOU-safe against the symlink race, per below, but not
 * safe against this separate crash-mid-write data-loss risk, since `O_TRUNC` discards the old bytes
 * before the new ones are durably in place.)
 *
 * The symlink refusal itself: an `lstatSync` on `absPath`, checked *before* any temp-file I/O
 * begins, refuses (the same `conflict`/"is a symlink" diagnosis `assertNoSymlinkInPath` uses) if a
 * symlink already occupies the destination. That check-then-act `lstatSync` cannot, on its own,
 * close a race against a symlink planted in the (now slightly wider, since a temp file is written
 * first) window between it and the commit `renameSync` — but unlike a plain `writeFileSync`
 * (which transparently follows a symlink at open time, mid-path or final component alike),
 * `renameSync` structurally **never** follows a symlink at its destination on POSIX: `rename(2)`
 * always replaces the directory entry itself, never whatever a symlink there points to. So even a
 * symlink that races in after the `lstatSync` check and before the rename can never cause a write
 * to land outside the repo — the only thing that residual race can change is whether this call
 * throws `conflict` (the common case: the up-front check already caught it) or the rename silently
 * replaces the racing symlink with the new file (never dereferencing it either way). This is a
 * strictly stronger guarantee against the write-outside-the-repo hazard than the previous
 * `O_NOFOLLOW`-at-open-time design had, not a weaker one, even though the *refusal* itself is no
 * longer a single atomic syscall. **Windows** is not characterized here beyond what the existing
 * test suite already scopes to (every symlink-specific test in this codebase is POSIX-only) — see
 * the historical note above for what the prior, Windows-non-guaranteeing design looked like.
 *
 * Mode and ownership are carried from the pre-existing destination onto the temp file (best-effort
 * for ownership, matching {@link writeFileAtomic}'s own LORE-117 discipline) before the commit
 * rename, since the old in-place `O_TRUNC` write never re-created the inode and so never reset
 * these — a fresh temp file otherwise lands with the process's default umask, silently dropping
 * e.g. a `0600` lockdown the destination had before this call.
 *
 * `writeAllOrRollback`'s `--force` branch and `lore schema export`'s per-file write loop
 * ({@link runSchema} in `commands/schema.ts`, LORE-123) are the callers — both write to leaf paths
 * that no bundle-loader walk vetted for symlinks first. Every other write discipline in this
 * module is either check-then-atomic-create ({@link createIfAbsent}'s `wx` open, independently
 * TOCTOU-safe on every platform: `O_CREAT|O_EXCL` refuses on ANY pre-existing entry at the path,
 * symlink or not, with no symlink-detection required) or doesn't need this
 * ({@link writeFileOverwriting}'s other callers, e.g. `lore rename`/`supersede` (and `lore replace`,
 * via {@link writeFileAtomic}), write back over a concept file the bundle loader just read, and
 * that loader already skips symlinked files during its walk, so their target was never a symlink to
 * begin with). The temp file's own write loops on a short write via {@link writeAllBytes} rather
 * than trusting one `writeSync` call to consume the whole buffer.
 */
export function writeFileNoFollow(absPath: string, contents: string, relPath: string): void {
  let destStat: ReturnType<typeof lstatSync> | undefined;
  try {
    destStat = lstatSync(absPath);
  } catch {
    destStat = undefined; // no pre-existing entry (or an unreadable ancestor) -- nothing to refuse or preserve
  }
  if (destStat?.isSymbolicLink()) {
    throw new LoreError(
      "conflict",
      `refusing to write ${relPath}: it is a symlink, not a real file`,
      "lore does not write through a symlink (it may resolve outside the repo) — remove or replace it, then re-run",
      { path: relPath, symlink: relPath },
    );
  }

  const tmpPath = join(dirname(absPath), `.lore-nofollow-tmp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  let tmpFileExists = false;
  try {
    let fd: number;
    try {
      fd = openSync(tmpPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666);
    } catch (cause) {
      throw ioError(cause, relPath, "write file");
    }
    tmpFileExists = true;
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
    if (destStat !== undefined) {
      // Mode preservation is not best-effort, matching writeFileAtomic's own discipline: a failure
      // here means the file is about to land with the wrong permissions, so it's surfaced as a
      // write failure rather than silently swallowed.
      chmodSync(tmpPath, destStat.mode & 0o7777);
      try {
        // Ownership IS best-effort: an unprivileged process cannot `chown` to an arbitrary uid/gid
        // (EPERM is the expected outcome on every non-root run), and this must not fail a write
        // that has already correctly preserved mode.
        chownSync(tmpPath, destStat.uid, destStat.gid);
      } catch {
        // Swallowed: see above.
      }
    }
    renameSync(tmpPath, absPath);
  } catch (cause) {
    if (tmpFileExists) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup; the failure below is what's primarily reported.
      }
    }
    throw cause instanceof LoreError ? cause : ioError(cause, relPath, "write file");
  }
}
