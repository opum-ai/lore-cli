#!/usr/bin/env node
"use strict";

/**
 * bin/lore.cjs — the published package's future `bin` entry (ADR-0001 §"Distribution", LORE-9).
 *
 * This is the ONLY file that runs under plain Node rather than Bun: it is what makes
 * `npx @opum-ai/lore` / a global `npm install -g` work for a user who has Node
 * but not Bun. Its entire job is to locate the compiled binary for the current
 * platform (installed as one of the package's `optionalDependencies`, gated by npm's
 * `os`/`cpu` fields so only the matching one lands in `node_modules`) and exec it,
 * forwarding argv/stdio/exit code verbatim.
 *
 * NOT YET the active `bin` target: `package.json`'s `bin.lore` still points at
 * `src/cli.ts` (the pre-publish install path — git dependency, `npm`/`bun link`), because
 * this file only works once the five platform packages it resolves are actually published.
 * Flipping `bin.lore` to this file is the first step of cutting a real release, not a
 * standing state — see docs/runbooks/release-publishing.md.
 *
 * Kept deliberately tiny and dependency-free plain CommonJS (`.cjs`, so it runs as
 * CJS regardless of the package's own `"type": "module"`) — per ADR-0001, "the
 * launcher must stay plain, dependency-light, Node-compatible CJS: it cannot use
 * Bun-only APIs." All of lore's actual logic lives in the compiled binary; this file
 * never imports `src/`.
 */

const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

/** The compiled binary's name inside its platform package (`.exe` on Windows). */
const BINARY_NAME = process.platform === "win32" ? "lore.exe" : "lore";

/**
 * The `optionalDependencies` package name for the current platform, matching
 * `process.platform`/`process.arch` directly (`darwin-arm64`, `linux-x64`, …) so the
 * mapping needs no lookup table — it must stay byte-identical to the `npm/<name>/`
 * directories this repo publishes from and to `package.json`'s `optionalDependencies`.
 */
function platformPackageName() {
  return `@opum-ai/lore-${process.platform}-${process.arch}`;
}

/**
 * Resolve the absolute path to the current platform's compiled binary, or `null` when its
 * optional package genuinely never installed (npm skips `optionalDependencies` whose `os`/`cpu`
 * don't match the host). Only `require.resolve`'s own `MODULE_NOT_FOUND` is treated as "not
 * installed" — any other thrown error (a permission error reading the package directory, a
 * corrupted install, `ERR_PACKAGE_PATH_NOT_EXPORTED`, …) propagates to the caller instead of
 * being silently folded into the same "unsupported platform" message, which would misdirect a
 * user with a real, fixable install problem.
 */
function resolveBinaryPath() {
  const pkgName = platformPackageName();
  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve(`${pkgName}/package.json`);
  } catch (err) {
    if (err && err.code === "MODULE_NOT_FOUND") {
      return null;
    }
    throw err;
  }
  return path.join(path.dirname(pkgJsonPath), "bin", BINARY_NAME);
}

/**
 * The exit code to forward for a `spawnSync` result with no exit `status` (i.e. the child was
 * terminated by a signal, `result.signal` set). Uses the conventional `128 + signal number`
 * (matching a POSIX shell) so a caller inspecting `$?` — e.g. to tell a user's Ctrl-C (SIGINT,
 * conventionally 130) apart from a genuine tool failure — sees the real signal, not a generic 1.
 * Falls back to `1` only if the signal name is somehow unrecognized (`os.constants.signals` has
 * no entry for it), which should not happen for any signal Node itself can report.
 */
function exitCodeForSignal(signal) {
  const signalNumber = os.constants.signals[signal];
  return signalNumber === undefined ? 1 : 128 + signalNumber;
}

function main() {
  let binaryPath;
  try {
    binaryPath = resolveBinaryPath();
  } catch (err) {
    process.stderr.write(
      `lore: unexpected error resolving the compiled binary for ${platformPackageName()}: ${err.message}\n`,
    );
    process.exit(1);
  }
  if (binaryPath === null) {
    process.stderr.write(
      `lore: no compiled binary found for this platform (${process.platform}-${process.arch}).\n` +
        `Expected the optional dependency "${platformPackageName()}" to be installed alongside\n` +
        `@opum-ai/lore, but it is missing. If your platform/architecture is one lore\n` +
        `ships (macOS x64/arm64, Linux x64/arm64, Windows x64), try reinstalling with npm;\n` +
        `otherwise this platform is not yet supported.\n`,
    );
    process.exit(1);
  }

  const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`lore: failed to run the compiled binary at ${binaryPath}: ${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status === null ? exitCodeForSignal(result.signal) : result.status);
}

main();
