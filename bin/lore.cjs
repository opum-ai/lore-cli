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
 * This is the active `bin` target since the `0.1.0` release. It resolves only
 * published platform packages, so source contributors should use `bun run lore`
 * when exercising an unpublished platform addition; see
 * docs/runbooks/release-publishing.md.
 *
 * Kept deliberately tiny and dependency-free plain CommonJS (`.cjs`, so it runs as
 * CJS regardless of the package's own `"type": "module"`) — per ADR-0001, "the
 * launcher must stay plain, dependency-light, Node-compatible CJS: it cannot use
 * Bun-only APIs." All of lore's actual logic lives in the compiled binary; this file
 * never imports `src/`.
 */

const { spawn, spawnSync } = require("node:child_process");
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

/**
 * Windows Bun executables can lose output when they inherit a redirected file
 * handle through Node. Give the executable real Node-owned pipes instead, then
 * stream those pipes to the launcher's own stdout/stderr. This preserves live
 * output without imposing spawnSync's maxBuffer limit.
 */
function spawnWindowsBinary(binaryPath) {
  const child = spawn(binaryPath, process.argv.slice(2), {
    stdio: ["inherit", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);

  let spawnFailed = false;
  child.once("error", (err) => {
    spawnFailed = true;
    process.stderr.write(`lore: failed to run the compiled binary at ${binaryPath}: ${err.message}\n`);
    process.exitCode = 1;
  });
  child.once("close", (status, signal) => {
    if (!spawnFailed) process.exitCode = status === null ? exitCodeForSignal(signal) : status;
  });
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
        `ships (macOS x64/arm64, Linux x64/arm64, Windows x64/arm64), try reinstalling with npm;\n` +
        `otherwise this platform is not yet supported.\n`,
    );
    process.exit(1);
  }

  if (process.platform === "win32") {
    spawnWindowsBinary(binaryPath);
    return;
  }

  const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(`lore: failed to run the compiled binary at ${binaryPath}: ${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status === null ? exitCodeForSignal(result.signal) : result.status);
}

main();
