/**
 * commands/discover.ts — the shared file-discovery + read seam for the command layer.
 *
 * Every command that operates over a set of bundle files — `validate`, `check`, `replace` (and the
 * `rename`/`supersede` consumers next) — needs the same three primitives: read a file as UTF-8 with
 * the project's `denied`/`not_found` error classification, derive a stable **canonical identity** for
 * de-duplication, and render a file's **repo-relative** display path. They lived as near-identical
 * copies in each command (a `/code-review max` finding); centralizing them here keeps one behavior, so
 * two commands can't classify a read failure or fold a duplicate path differently. Pairs with
 * {@link fswrite} (the write seam) — discovery/read here, write there, judgement in `core/`.
 */

import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { errnoCode, LoreError } from "../errors";

/** Read one file as UTF-8, mapping an I/O failure to a classified {@link LoreError}. */
export function readSource(abs: string, display: string): string {
  try {
    return readFileSync(abs, "utf8");
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `permission denied reading ${display}`, `make ${display} readable`, {
        path: display,
        code,
      });
    }
    throw new LoreError("not_found", `cannot read ${display}`, "check the path exists and is readable", {
      path: display,
    });
  }
}

/**
 * A stable de-duplication key for an absolute file path: its `realpath` when resolvable (which folds
 * case on a case-insensitive filesystem and collapses symlinks, so two spellings of one physical file
 * — or a symlink and its target — share a key), else the path verbatim (a file that vanished mid-walk
 * still gets a key, and {@link readSource} raises the real I/O error).
 */
export function canonicalIdentity(abs: string): string {
  try {
    return realpathSync.native(abs);
  } catch {
    return abs;
  }
}

/**
 * The repo-relative POSIX path for a discovered file, for stable display and de-duplication. A path
 * inside the repo renders relative (`docs/adr/x.md`); a path **outside** the repo keeps its absolute
 * form (the relative path would escape with `../`). The `..` escape is matched by path **segment**, so
 * a real in-repo file whose first segment merely starts with `..` (e.g. `..notes/x.md`) is not pushed
 * out to its absolute form.
 */
export function toRepoRelative(root: string, abs: string): string {
  const rel = relative(root, abs);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return abs;
  }
  return rel.split(sep).join("/");
}

/**
 * Whether `abs` resolves **inside** the repo `root` — the single repo-containment predicate the
 * commands share, so the bundle-escape decision is made one way everywhere (a `/code-review max`
 * finding: `validate` and `replace` had drifted on the `..`-segment edge). Matches
 * {@link toRepoRelative}'s segment rule: a path equal to `..`, beginning `../`, or absolute after
 * relativizing is outside; anything else is inside.
 */
export function withinRepo(root: string, abs: string): boolean {
  const rel = relative(root, abs);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
