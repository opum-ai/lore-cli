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
import { isAbsolute, join, posix, relative, sep } from "node:path";
import { walkMarkdown } from "../core/bundle";
import { DOCS_DIR } from "../core/scaffold";
import { errnoCode, ioError, LoreError } from "../errors";

/** Read one file as UTF-8, mapping an I/O failure to a classified {@link LoreError} via the shared {@link ioError} policy. */
export function readSource(abs: string, display: string): string {
  try {
    return readFileSync(abs, "utf8");
  } catch (cause) {
    ioError(cause, {
      denied: { message: `permission denied reading ${display}`, hint: `make ${display} readable` },
      notFound: { message: `cannot read ${display}`, hint: "check the path exists and is readable" },
      input: { path: display },
    });
  }
}

/**
 * Read a file's bytes if it exists, else `undefined` — unlike {@link readSource}, absence is not an
 * error (e.g. a bundle's `log.md` may not exist yet before the first `lore sync`). A permission
 * failure still fails loud (`denied`); anything else (a directory sitting at the path, …) propagates
 * unclassified rather than being force-fit into a misleading "not found".
 */
export function readIfExists(abs: string, display: string): string | undefined {
  try {
    return readFileSync(abs, "utf8");
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "ENOENT") {
      return undefined;
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `cannot read ${display}`, `check filesystem permissions on ${display}`, {
        path: display,
        code,
      });
    }
    throw cause;
  }
}

/** The reserved index file name (mirrors `core/indexes.ts`'s own private constant of the same name). */
const INDEX_FILE = "index.md";

/**
 * Read every existing `index.md` under the bundle as `bundle-relative-path → raw bytes` — the
 * determinism seam `core/indexes.ts`'s `generateIndexes` splices into. Shared by `rename.ts` and
 * `sync.ts`, both of which regenerate index hubs against whatever is currently on disk.
 */
export function readIndexBytes(docsRoot: string): Map<string, string> {
  const bytes = new Map<string, string>();
  for (const rel of walkMarkdown(docsRoot, undefined)) {
    if (posix.basename(rel) === INDEX_FILE) {
      bytes.set(rel, readSource(join(docsRoot, rel), `${DOCS_DIR}/${rel}`));
    }
  }
  return bytes;
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
