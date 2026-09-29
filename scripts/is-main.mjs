// scripts/is-main.mjs — is THIS module the file the process was started with? (LCLI-637)
//
// WHY THIS IS NOT `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`: that comparison
// is FALSE whenever a script is invoked through a symlinked path. resolve() only normalizes the
// string and does not follow symlinks, while Node resolves import.meta.url to the module's REAL
// path, so the two sides differ and the caller silently skips its CLI. The macOS tmpdir is the
// everyday case (/var -> /private/var), and the failure is invisible in the worst way: the
// process exits 0 having done nothing, which reads as a release gate that passed.
//
// Measured 2026-09-28 (LCLI-637, before the fix): `node scripts/version-parity.mjs --help` exits
// 2 with 52 bytes of usage on stderr; the same file through a symlinked directory exits 0 with
// 0 bytes on both streams. All six release scripts carried it: launcher-equivalence, pair-receipt,
// promote-latest, version-parity, github-release and check-breaking-bump.
//
// So BOTH sides are resolved through the filesystem before they are compared.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * True when the module named by `importMetaUrl` is the file this process was started with.
 *
 * Tolerates both shapes the old comparison tolerated, and never throws: no `process.argv[1]` at
 * all (a REPL, `node -e`, a bare import) answers false, and so does a path that no longer exists,
 * where `realpathSync` throws. A script imported as a module must not run its CLI.
 *
 * @param {string} importMetaUrl the calling module's `import.meta.url`
 * @returns {boolean}
 */
export function isMain(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}
