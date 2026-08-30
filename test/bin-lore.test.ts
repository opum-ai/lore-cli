/**
 * bin-lore.test.ts — `bin/lore.cjs`, the published package's launcher (LORE-9, ADR-0001).
 *
 * `bin/lore.cjs` is plain Node CommonJS, not part of the `src/` TypeScript program, so it
 * is exercised here as a real subprocess rather than imported. `NODE_PATH` points Node's
 * module resolution at a scratch directory shaped like an installed platform package
 * (`@opum-ai/lore-<platform>-<arch>/{package.json,bin/lore}`) — the same resolution
 * mechanism `require.resolve` uses for a real npm install, without needing an actual
 * compiled binary or a real `npm install`. POSIX-only: the stub "binary" here is a
 * shebang script, which Windows cannot exec directly the way `spawnSync` execs a real
 * `lore.exe` (see the module docstring's win32 handling) — the real end-to-end proof for
 * every platform, including Windows, is `.github/workflows/release.yml`'s install-sanity
 * step (a real `npm pack` + `npm install` + run).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
