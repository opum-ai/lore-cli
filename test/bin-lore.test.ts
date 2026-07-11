/**
 * bin-lore.test.ts — `bin/lore.cjs`, the published package's launcher (LORE-9, ADR-0001).
 *
 * `bin/lore.cjs` is plain Node CommonJS, not part of the `src/` TypeScript program, so it
 * is exercised here as a real subprocess rather than imported. `NODE_PATH` points Node's
 * module resolution at a scratch directory shaped like an installed platform package
 * (`@salient-data/lore-<platform>-<arch>/{package.json,bin/lore}`) — the same resolution
 * mechanism `require.resolve` uses for a real npm install, without needing an actual
 * compiled binary or a real `npm install`. POSIX-only: the stub "binary" here is a
 * shebang script, which Windows cannot exec directly the way `spawnSync` execs a real
 * `lore.exe` (see the module docstring's win32 handling) — the real end-to-end proof for
 * every platform, including Windows, is `.github/workflows/release.yml`'s install-sanity
 * step (a real `npm pack` + `npm install` + run).
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LAUNCHER = join(import.meta.dir, "..", "bin", "lore.cjs");
const PKG_NAME = `@salient-data/lore-${process.platform}-${process.arch}`;

/** Build a scratch `NODE_PATH` directory containing a fake installed platform package. */
function fakePlatformPackage(binaryScript: string): { nodePathDir: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "lore-launcher-"));
  const pkgDir = join(root, PKG_NAME);
  mkdirSync(join(pkgDir, "bin"), { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: PKG_NAME, version: "0.0.0" }));
  const binPath = join(pkgDir, "bin", "lore");
  writeFileSync(binPath, binaryScript);
  chmodSync(binPath, 0o755);
  return { nodePathDir: root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
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
function runLauncher(nodePathDir: string, args: readonly string[]): { stdout: string; stderr: string; code: number } {
  const result = Bun.spawnSync(["node", LAUNCHER, ...args], {
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
    const { nodePathDir, cleanup } = fakePlatformPackage(
      "#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n",
    );
    try {
      const { stdout, code } = runLauncher(nodePathDir, ["check", "--plain", "--tag", "a b"]);
      expect(JSON.parse(stdout.trim())).toEqual(["check", "--plain", "--tag", "a b"]);
      expect(code).toBe(0);
    } finally {
      cleanup();
    }
  });

  test("forwards the binary's exit code verbatim", () => {
    const { nodePathDir, cleanup } = fakePlatformPackage("#!/usr/bin/env node\nprocess.exit(6);\n");
    try {
      expect(runLauncher(nodePathDir, []).code).toBe(6);
    } finally {
      cleanup();
    }
  });

  test("forwards the binary's stdout/stderr (stdio: inherit)", () => {
    const { nodePathDir, cleanup } = fakePlatformPackage(
      '#!/usr/bin/env node\nprocess.stdout.write("out-line\\n");\nprocess.stderr.write("err-line\\n");\n',
    );
    try {
      const { stdout, stderr } = runLauncher(nodePathDir, []);
      expect(stdout).toContain("out-line");
      expect(stderr).toContain("err-line");
    } finally {
      cleanup();
    }
  });
});

describe("bin/lore.cjs — missing platform package", () => {
  test("exits 1 with an actionable stderr message naming the expected package", () => {
    const root = mkdtempSync(join(tmpdir(), "lore-launcher-empty-"));
    try {
      const { stdout, stderr, code } = runLauncher(root, ["--version"]);
      expect(code).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain(PKG_NAME);
      expect(stderr).toContain(`${process.platform}-${process.arch}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
