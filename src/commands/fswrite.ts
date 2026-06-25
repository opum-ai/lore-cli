/**
 * commands/fswrite.ts — the shared write seam for scaffolding commands.
 *
 * `lore init` and `lore new` both create files the same way: ensure parent directories
 * exist, then write each file **only when absent** so a re-run (or a pre-existing user
 * edit) is never clobbered. Centralizing that here means the never-clobber and
 * filesystem-conflict semantics are identical across commands — a directory or symlink
 * sitting where a file must go is the same `conflict` {@link LoreError} (exit 5) whether
 * it blocks `init`'s scaffold or `new`'s output — instead of each command re-deriving the
 * `wx`/`EEXIST`/`lstat` dance and drifting.
 *
 * All side effects live in the command layer (lore-design §2.1); core stays pure. These
 * helpers are that side-effecting layer, factored to one module.
 */

import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
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
 * becomes a `denied` {@link LoreError}; a file occupying a path lore needs as a
 * directory (`EEXIST` on `mkdir`) or a file sitting on an ancestor segment (`ENOTDIR`)
 * becomes a `conflict` {@link LoreError}. Both carry an actionable hint. Anything else
 * is rethrown so a genuinely unexpected IO fault surfaces as an uncaught failure
 * (exit 1, "report this") rather than being mislabeled a user condition.
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
  if (code === "EEXIST" || code === "ENOTDIR") {
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
