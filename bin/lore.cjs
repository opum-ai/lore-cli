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

const { spawn } = require("node:child_process");
const os = require("node:os");
const { isatty } = require("node:tty");
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
  } catch (/** @type {any} */ err) {
    if (err && err.code === "MODULE_NOT_FOUND") {
      return null;
    }
    throw err;
  }
  return path.join(path.dirname(pkgJsonPath), "bin", BINARY_NAME);
}

/**
 * The exit code to forward for a child that reports no exit `status` (i.e. it was terminated by a
 * signal, `signal` set). Uses the conventional `128 + signal number`
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

/**
 * POSIX path (LCLI-797, DEC-282 item 7 and (a2)): run the binary asynchronously so the event loop
 * stays free to relay signals, and never let the child, or anything it spawned, outlive this
 * wrapper. A caller that times out and kills only this wrapper (a status daemon, `timeout`, a
 * harness) used to leave the native binary running, because a blocking `spawnSync` registers no
 * handler and nothing tore the child down. This is the same shape as `bin/quest.cjs` (QCLI-567).
 *
 * When none of fds 0, 1 and 2 is a terminal (every daemon and supervisor caller) the child gets its
 * own session and process group (`detached`), so a forwarded signal goes to the whole group
 * (`-pid`) and the wrapper sweeps the group with SIGKILL when it is done, which also reaps a
 * grandchild that ignored the signal (the native lore spawns quest, git, gh, backlog and jira). When
 * ANY of the three is a terminal (DEC-282 (a3): `cat x | lore` with output on a terminal counts) the
 * child stays in the caller's group, so Ctrl-C, Ctrl-\\, Ctrl-Z and /dev/tty prompts (an ssh
 * passphrase during lore's `git fetch`) keep working; there a signal sent to the wrapper alone
 * reaches only the direct child, not what it spawned. A job started from a shell with `&` is in the
 * caller's group too, where the caller's own group kill already reaches it.
 *
 * SIGTERM, SIGINT and SIGHUP are forwarded. When the child dies of a signal the wrapper dies of the
 * same one (listeners dropped, then raised on itself, as foreground-child and tini do), so a caller
 * sees death by that signal and a shell loop still breaks on Ctrl-C; except SIGPIPE and SIGXFSZ
 * (Node ignores them) and SIGUSR1 (a self-kill would open Node's inspector), which give exit
 * `128 + signal`. Otherwise it exits with the child's own status. The `exit` handler sweeps on an
 * uncaught exception and `process.exit`. A fatal signal that is not forwarded (SIGQUIT, SIGALRM,
 * SIGUSR2, ...) kills Node without running it. A repeated SIGINT is possible on a terminal Ctrl-C
 * (the tty signals the whole foreground group, then this forwards it again).
 *
 * Caller remedy for a runaway lore: send SIGTERM to the wrapper (or to a group you created for
 * it), wait a few seconds, then SIGKILL. A plain SIGTERM is fully handled here.
 *
 * Not covered: SIGKILL of the wrapper, which no handler can intercept (a lifeline pipe is the
 * follow-up, DEC-282 (a2) item 2), and, off a terminal, a caller's group-wide SIGKILL, because the
 * child has left that group. The group sweep names a process group id that could in principle be
 * reused once every member is gone; the window is the time between the child's exit and the sweep.
 */
function spawnPosixBinary(binaryPath) {
  const ownGroup = ![0, 1, 2].some((fd) => isatty(fd));
  /** @type {import("node:child_process").ChildProcess | undefined} */
  let child;
  let spawnFailed = false;
  let swept = false;

  const childRunning = () => child !== undefined && child.exitCode === null && child.signalCode === null;

  /** @param {NodeJS.Signals} signal */
  function signalChild(signal) {
    if (child === undefined || !childRunning()) return;
    try {
      if (ownGroup && typeof child.pid === "number") process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      // The child is already gone.
    }
  }

  /**
   * SIGKILL whatever is left: the whole group off a terminal, the child itself on one. At most once:
   * after the first sweep the group is empty, so a second one could only ever hit a reused group id.
   */
  function sweep() {
    if (swept || child === undefined) return;
    swept = true;
    try {
      if (ownGroup && typeof child.pid === "number") process.kill(-child.pid, "SIGKILL");
      else if (childRunning()) child.kill("SIGKILL");
    } catch {
      // Nothing left to kill (ESRCH is the normal answer for an empty group).
    }
  }

  // Registered BEFORE the spawn, which is what closes the window in which a signal would take its
  // default action while the child is already running (a handler cannot run inside the synchronous
  // tick that holds spawn(), so no "signal arrived before the child existed" case remains).
  for (const signal of FORWARDED_SIGNALS) process.on(signal, () => signalChild(signal));
  process.on("exit", () => {
    if (!spawnFailed) sweep();
  });

  function failed(/** @type {Error} */ err) {
    spawnFailed = true;
    process.stderr.write(`lore: failed to run the compiled binary at ${binaryPath}: ${err.message}\n`);
    process.exit(1);
  }
  try {
    // Node throws from spawn() itself for errors outside EACCES/EAGAIN/EMFILE/ENFILE/ENOENT (E2BIG
    // on a very long argv is the realistic one); the old spawnSync path reported all of them cleanly.
    child = spawn(binaryPath, process.argv.slice(2), { stdio: "inherit", detached: ownGroup });
  } catch (/** @type {any} */ err) {
    failed(err);
    return;
  }
  child.once("error", failed);

  child.once("close", (status, signal) => {
    if (spawnFailed) return;
    if (status !== null) process.exit(status);
    sweep(); // dying by a signal skips the exit handler, so reap the group first
    reraise(signal);
  });
}

/** The signals forwarded to the child; also the handlers dropped when the wrapper dies of one. */
const FORWARDED_SIGNALS = /** @type {NodeJS.Signals[]} */ (["SIGTERM", "SIGINT", "SIGHUP"]);

/**
 * Signals Node leaves at, or reserves from, their default action: SIGPIPE and SIGXFSZ are ignored by
 * Node, and SIGUSR1 starts its inspector (a debugger on 127.0.0.1:9229). Raising one of these on
 * ourselves would do nothing or open the inspector, so the wrapper exits `128 + signal` instead.
 */
const NOT_RERAISED = new Set(["SIGPIPE", "SIGXFSZ", "SIGUSR1"]);

/**
 * Die of `signal` ourselves, as the child did (foreground-child and tini do the same): drop every
 * forwarded-signal handler so the default disposition is back, then raise it on this process. The
 * exit code is set first, so a signal that is ignored in this process (inherited SIG_IGN) leaves the
 * event loop to drain and the wrapper to exit with the conventional `128 + signal`.
 */
function reraise(signal) {
  if (signal === null || os.constants.signals[signal] === undefined) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = exitCodeForSignal(signal);
  if (NOT_RERAISED.has(signal)) return;
  for (const forwarded of FORWARDED_SIGNALS) process.removeAllListeners(forwarded);
  process.removeAllListeners(signal);
  process.kill(process.pid, signal);
}

function main() {
  let binaryPath;
  try {
    binaryPath = resolveBinaryPath();
  } catch (/** @type {any} */ err) {
    process.stderr.write(
      `lore: unexpected error resolving the compiled binary for ${platformPackageName()}: ${err.message}\n`,
    );
    process.exit(1);
  }
  if (binaryPath === null) {
    process.stderr.write(
      `lore: no compiled binary found for this platform (${process.platform}-${process.arch}).\n` +
        `Expected the optional dependency "${platformPackageName()}" to be installed alongside\n` +
        "@opum-ai/lore, but it is missing. If your platform/architecture is one lore\n" +
        "ships (macOS x64/arm64, Linux x64/arm64, Windows x64/arm64), try reinstalling with npm;\n" +
        "otherwise this platform is not yet supported.\n",
    );
    process.exit(1);
  }

  if (process.platform === "win32") {
    spawnWindowsBinary(binaryPath);
    return;
  }

  spawnPosixBinary(binaryPath);
}

main();
