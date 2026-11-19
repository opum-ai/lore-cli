/**
 * bin-lore.test.ts — `bin/lore.cjs`, the published package's launcher (LORE-9, ADR-0001).
 *
 * `bin/lore.cjs` is plain Node CommonJS, not part of the `src/` TypeScript program, so it
 * is exercised here as a real subprocess rather than imported. `NODE_PATH` points Node's
 * module resolution at a scratch directory shaped like an installed platform package
 * (`@opum-ai/lore-<platform>-<arch>/{package.json,bin/lore}`) — the same resolution
 * mechanism `require.resolve` uses for a real npm install, without needing an actual
 * compiled binary or a real `npm install`. POSIX-only: the stub "binary" here is a
 * shebang script, which Windows cannot exec directly the way the launcher execs a real
 * `lore.exe` (see the module docstring's win32 handling) — the real end-to-end proof for
 * every platform, including Windows, is `.github/workflows/release.yml`'s install-sanity
 * step (a real `npm pack` + `npm install` + run).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAUNCHER = join(import.meta.dir, "..", "bin", "lore.cjs");
const PKG_NAME = `@opum-ai/lore-${process.platform}-${process.arch}`;

let nodePathDir: string;

beforeEach(() => {
  nodePathDir = mkdtempSync(join(tmpdir(), "lore-launcher-"));
});
afterEach(() => {
  rmSync(nodePathDir, { recursive: true, force: true });
});

/** Install a fake platform package under `nodePathDir` with the given stub "binary" script. */
function installFakePlatformPackage(binaryScript: string): void {
  const pkgDir = join(nodePathDir, PKG_NAME);
  mkdirSync(join(pkgDir, "bin"), { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: PKG_NAME, version: "0.0.0" }));
  const binPath = join(pkgDir, "bin", "lore");
  writeFileSync(binPath, binaryScript);
  chmodSync(binPath, 0o755);
}

/**
 * Install a fake platform package whose `package.json` declares an `exports` map that does NOT
 * include `./package.json` — `require.resolve("<pkg>/package.json")` then throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`, a real, distinct-from-`MODULE_NOT_FOUND` resolution failure
 * (verified interactively), standing in for "the package is installed but something else is
 * wrong" (a permission error, a corrupted install, …).
 */
function installFakePackageWithRestrictedExports(): void {
  const pkgDir = join(nodePathDir, PKG_NAME);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: PKG_NAME, version: "0.0.0", exports: {} }));
}

/**
 * Run the launcher with `NODE_PATH` pointed at `nodePathDir`, returning its stdout/stderr/exit
 * code. Spawns the literal `"node"` on `PATH` — NOT `process.execPath`, which under `bun test`
 * *is* the Bun executable, not Node (`bun -e 'console.log(process.execPath)'` prints the bun
 * binary). `bin/lore.cjs` is "the ONLY file that runs under plain Node rather than Bun"; spawning
 * it via `process.execPath` would silently test it under Bun's own CJS/`NODE_PATH`/`spawnSync`
 * semantics instead, which could diverge from real Node's without this suite ever noticing. CI
 * (`ci.yml`) runs on GitHub-hosted runners, which ship Node preinstalled on `PATH`.
 */
function runLauncher(args: readonly string[]): { stdout: string; stderr: string; code: number } {
  // Run a COPY of the launcher from inside the fixture directory, not the repository's own
  // bin/lore.cjs (LCLI-369). NODE_PATH is only a FALLBACK: Node first walks up from the script's
  // own location looking for node_modules, and the repository is an ancestor of bin/lore.cjs.
  // Since lore lists its platform packages as optionalDependencies at the version under
  // development, publishing 0.3.5 caused `bun install` to place lore's own compiled binary at
  // <repo>/node_modules/@opum-ai/lore-darwin-arm64 -- which then wins the ancestor walk and
  // shadows the fixture these tests install. Before the publish that directory did not exist, so
  // NODE_PATH won by default and these tests passed BY ACCIDENT.
  //
  // Copying the launcher into nodePathDir puts the fixture's node_modules on the ancestor path,
  // so resolution finds the stub for the same reason a real install finds the real package.
  const launcher = join(nodePathDir, "lore.cjs");
  copyFileSync(LAUNCHER, launcher);
  const result = Bun.spawnSync(["node", launcher, ...args], {
    env: { ...process.env, NODE_PATH: nodePathDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    code: result.exitCode,
  };
}

describe.skipIf(process.platform === "win32")("bin/lore.cjs — resolves and execs the platform binary", () => {
  test("forwards argv to the resolved binary", () => {
    installFakePlatformPackage("#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n");
    const { stdout, code } = runLauncher(["check", "--plain", "--tag", "a b"]);
    expect(JSON.parse(stdout.trim())).toEqual(["check", "--plain", "--tag", "a b"]);
    expect(code).toBe(0);
  });

  test("forwards the binary's exit code verbatim", () => {
    installFakePlatformPackage("#!/usr/bin/env node\nprocess.exit(6);\n");
    expect(runLauncher([]).code).toBe(6);
  });

  test("forwards the binary's stdout/stderr (stdio: inherit)", () => {
    installFakePlatformPackage(
      '#!/usr/bin/env node\nprocess.stdout.write("out-line\\n");\nprocess.stderr.write("err-line\\n");\n',
    );
    const { stdout, stderr } = runLauncher([]);
    expect(stdout).toContain("out-line");
    expect(stderr).toContain("err-line");
  });

  test("a signal-terminated binary reports the conventional 128+signal exit code, not a generic 1", () => {
    // SIGTERM (15) -> 143. The binary sends itself SIGTERM and then busy-waits, so it is the
    // signal — not a self-inflicted process.exit — that actually ends the process.
    installFakePlatformPackage(
      "#!/usr/bin/env node\nprocess.kill(process.pid, 'SIGTERM');\nconst start = Date.now();\nwhile (Date.now() - start < 5000) {}\n",
    );
    expect(runLauncher([]).code).toBe(143);
  });
});

describe("bin/lore.cjs — missing platform package", () => {
  test("exits 1 with an actionable stderr message naming the expected package", () => {
    const { stdout, stderr, code } = runLauncher(["--version"]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(PKG_NAME);
    expect(stderr).toContain(`${process.platform}-${process.arch}`);
    expect(stderr).toContain("Windows x64/arm64");
  });
});

describe('bin/lore.cjs — a resolution error that is NOT "package missing"', () => {
  test("surfaces distinctly from the missing-package message, not folded into 'unsupported platform'", () => {
    installFakePackageWithRestrictedExports();
    const { stdout, stderr, code } = runLauncher(["--version"]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("unexpected error");
    expect(stderr).not.toContain("not yet supported");
  });
});

// LCLI-797 (DEC-282 item 7, (a2)): the wrapper must never orphan the native child or what it spawns,
// and a caller must see the child's death by signal as the wrapper's own. POSIX-only: Windows
// delivers process.kill(pid, "SIGTERM") as an unconditional TerminateProcess to the wrapper with no
// handler run, so this proof cannot be made there; the Windows path is a recorded residual on
// LCLI-797, not covered by this test.
describe.skipIf(process.platform === "win32")("bin/lore.cjs — never orphans the native child (LCLI-797)", () => {
  /** True while `pid` is a live process (signal 0 probes without delivering anything). */
  function alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await Bun.sleep(25);
    }
    return predicate();
  }

  /** The process group id of `pid`, read with ps (the group relationship is what is under test). */
  function pgidOf(pid: number): number {
    const out = Bun.spawnSync(["ps", "-o", "pgid=", "-p", String(pid)])
      .stdout.toString()
      .trim();
    return Number(out);
  }

  const spawned: number[] = [];
  /** Stop tracking a pid once it is confirmed dead, so the cleanup can never SIGKILL a reused pid. */
  function forget(pid: number): void {
    const at = spawned.indexOf(pid);
    if (at >= 0) spawned.splice(at, 1);
  }
  afterEach(() => {
    // An unpatched launcher leaves the stub running for its full timer; never leak it from a test.
    for (const pid of spawned.splice(0)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  });

  /**
   * The stub "binary": records its own pid, then spawns a GRANDCHILD that ignores SIGTERM, SIGINT
   * and SIGHUP (so only a group sweep can end it) and records that pid too, then idles. The stub IS
   * the long-running process (a node script, not a shell wrapping a sleep).
   */
  function stubScript(pidFile: string): string {
    const grandchild =
      'for (const s of ["SIGTERM","SIGINT","SIGHUP"]) process.on(s, () => {}); setInterval(() => {}, 1000);';
    return [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      'const { spawn } = require("node:child_process");',
      `const gc = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "ignore" });`,
      `fs.writeFileSync(${JSON.stringify(pidFile)}, process.pid + "\\n" + gc.pid + "\\n");`,
      "setInterval(() => {}, 1000);",
      "",
    ].join("\n");
  }

  /**
   * Start the launcher over the stub, with stdin NOT a terminal (so the wrapper puts the child in its
   * own group). Returns once both the child and its grandchild are recorded and live.
   */
  async function startLauncher(nodeArgs: readonly string[] = [], expectLive = true) {
    const pidFile = join(nodePathDir, "child.pid");
    installFakePlatformPackage(stubScript(pidFile));
    const launcher = join(nodePathDir, "lore.cjs");
    copyFileSync(LAUNCHER, launcher);
    const wrapper = Bun.spawn(["node", ...nodeArgs, launcher], {
      env: { ...process.env, NODE_PATH: nodePathDir },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      const ready = () => existsSync(pidFile) && readFileSync(pidFile, "utf8").split("\n").filter(Boolean).length === 2;
      expect(await waitFor(ready, 15000)).toBe(true);
      const [childPid, grandchildPid] = readFileSync(pidFile, "utf8").split("\n").filter(Boolean).map(Number) as [
        number,
        number,
      ];
      spawned.push(childPid, grandchildPid);
      // The exit-path test reaps everything the instant it starts, so it cannot assert liveness here;
      // the pid file proves the stub ran.
      if (expectLive) {
        expect(alive(childPid)).toBe(true);
        expect(alive(grandchildPid)).toBe(true);
      }
      return { wrapper, childPid, grandchildPid };
    } catch (error) {
      wrapper.kill("SIGKILL"); // never leave the wrapper behind when the fixture itself failed
      throw error;
    }
  }

  test("positive control: the liveness detector reports a killed child as dead", async () => {
    const { wrapper, childPid } = await startLauncher();
    process.kill(childPid, "SIGKILL");
    expect(await waitFor(() => !alive(childPid), 15000)).toBe(true);
    forget(childPid);
    await wrapper.exited;
  }, 60000);

  // Off a terminal the child runs in its own group, so forwarding reaches it AND the sweep after it
  // exits reaps a grandchild that ignores the signal. The wrapper then DIES BY the signal (item 5):
  // a caller sees signalCode, not exit 128+n.
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    test(`${signal} to the wrapper reaps the child and its signal-ignoring grandchild, and the wrapper dies by ${signal}`, async () => {
      const { wrapper, childPid, grandchildPid } = await startLauncher();
      process.kill(wrapper.pid, signal); // the WRAPPER's pid, never a group: a group kill would hide the bug
      await wrapper.exited; // judge the others only once the wrapper is gone
      expect(await waitFor(() => !alive(childPid) && !alive(grandchildPid), 15000)).toBe(true);
      forget(childPid);
      forget(grandchildPid);
      expect(wrapper.signalCode).toBe(signal);
    }, 60000);
  }

  // The wrapper's own `exit` handler: the one path no forwarded signal reaches. A preload makes the
  // wrapper die of an uncaught exception once the child is up, with no signal sent at all, so only the
  // exit-time sweep can reap them. A mutant removing just that handler leaves the grandchild alive.
  test("an uncaught exception in the wrapper leaves no surviving child or grandchild (the exit-time sweep)", async () => {
    const preload = join(nodePathDir, "boom.cjs");
    writeFileSync(
      preload,
      `const fs = require("node:fs");\nconst pidFile = ${JSON.stringify(join(nodePathDir, "child.pid"))};\nconst t = setInterval(() => { if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8").split("\\n").filter(Boolean).length === 2) { clearInterval(t); throw new Error("boom"); } }, 10);\n`,
    );
    const { wrapper, childPid, grandchildPid } = await startLauncher(["--require", preload], false);
    await wrapper.exited;
    expect(wrapper.exitCode).not.toBe(0);
    expect(await waitFor(() => !alive(childPid) && !alive(grandchildPid), 15000)).toBe(true);
    forget(childPid);
    forget(grandchildPid);
  }, 60000);

  // On a terminal the child must stay in the caller's foreground group, or Ctrl-C and terminal I/O
  // stop working (a background group is stopped by SIGTTIN/SIGTTOU). A pty is needed for stdin, so
  // python3's pty module provides one; the property asserted is the group relationship itself.
  const hasPython = Bun.spawnSync(["python3", "-c", "import pty"]).exitCode === 0;
  test.skipIf(!hasPython)(
    "on a terminal the child stays in the wrapper's own process group",
    async () => {
      const pidFile = join(nodePathDir, "child.pid");
      installFakePlatformPackage(stubScript(pidFile));
      const launcher = join(nodePathDir, "lore.cjs");
      copyFileSync(LAUNCHER, launcher);
      const helper = [
        "import os, pty, subprocess, sys",
        "master, slave = pty.openpty()",
        "p = subprocess.Popen(['node', sys.argv[1]], stdin=slave, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)",
        "print(p.pid, flush=True)",
        "p.wait()",
      ].join("\n");
      const holder = Bun.spawn(["python3", "-c", helper, launcher], {
        env: { ...process.env, NODE_PATH: nodePathDir },
        stdout: "pipe",
        stderr: "ignore",
      });
      let wrapperPid = 0;
      try {
        const reader = holder.stdout.getReader();
        const first = await reader.read();
        wrapperPid = Number(new TextDecoder().decode(first.value).trim());
        expect(wrapperPid).toBeGreaterThan(0);
        const ready = () =>
          existsSync(pidFile) && readFileSync(pidFile, "utf8").split("\n").filter(Boolean).length === 2;
        expect(await waitFor(ready, 15000)).toBe(true);
        const [childPid, grandchildPid] = readFileSync(pidFile, "utf8").split("\n").filter(Boolean).map(Number) as [
          number,
          number,
        ];
        spawned.push(childPid, grandchildPid);
        expect(pgidOf(childPid)).toBe(pgidOf(wrapperPid));
      } finally {
        if (wrapperPid > 0) {
          try {
            process.kill(wrapperPid, "SIGKILL");
          } catch {}
        }
        holder.kill("SIGKILL");
      }
    },
    60000,
  );
});
