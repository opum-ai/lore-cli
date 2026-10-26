/**
 * LCLI-768 — DEC-240 CI hardening (opum-doc, 2026-10-25).
 *
 *  1. lore and quest are installed on a runner with `--ignore-scripts`: a dependency's lifecycle
 *     script never runs there.
 *  2. Every `actions/checkout` sets `persist-credentials: false` unless its job pushes with the token.
 *  3. The declared Quest version is read only from inside the managed Quest block's markers and must be
 *     an exact X.Y.Z; anything else fails by name and never reaches npm as a range.
 *  4. A step output (or any other non-static expression) reaches a shell step through `env:`, never
 *     interpolated as `${{ }}` inside `run:`.
 *
 * The workflow assertions read the YAML as data, so a regression in any workflow or composite action
 * is one failing test naming the file, job and step. Each rule is proved both ways: against the real
 * tree (accepts) and against a deliberately broken copy of the same shape (rejects).
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import * as yaml from "js-yaml";

const ROOT = join(import.meta.dir, "..");
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");
const ACTIONS_DIR = join(ROOT, ".github", "actions");
const READER = join(ROOT, "scripts", "read-declared-quest-version.sh");
const onWindows = process.platform === "win32";

interface Step {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Unit {
  /** Repo-relative file plus the job it came from, for failure messages. */
  where: string;
  steps: Step[];
}

/** Every workflow job and every composite action, as a list of step lists. */
function loadUnits(): Unit[] {
  const units: Unit[] = [];
  for (const file of readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith(".yml"))) {
    const doc = yaml.load(readFileSync(join(WORKFLOWS_DIR, file), "utf8")) as {
      jobs?: Record<string, { steps?: Step[] }>;
    };
    for (const [job, body] of Object.entries(doc.jobs ?? {})) {
      units.push({ where: `.github/workflows/${file} job ${job}`, steps: body.steps ?? [] });
    }
  }
  for (const dir of readdirSync(ACTIONS_DIR)) {
    const path = join(ACTIONS_DIR, dir, "action.yml");
    if (!existsSync(path)) continue;
    const doc = yaml.load(readFileSync(path, "utf8")) as { runs?: { steps?: Step[] } };
    units.push({ where: `.github/actions/${dir}/action.yml`, steps: doc.runs?.steps ?? [] });
  }
  return units;
}

/** Jobs that legitimately push with the checkout token, each with why. None today (measured). */
const PUSHING_JOBS: Record<string, string> = {};

function checkoutViolations(units: Unit[]): string[] {
  const out: string[] = [];
  for (const unit of units) {
    unit.steps.forEach((step, index) => {
      if (!(step.uses ?? "").startsWith("actions/checkout@")) return;
      if (step.with?.["persist-credentials"] === false) return;
      if (unit.where in PUSHING_JOBS) return;
      out.push(`${unit.where} step ${index}: actions/checkout without persist-credentials: false`);
    });
  }
  return out;
}

/** An expression in a `run:` body is allowed only when its value is static or a runner-assigned id. */
const SAFE_RUN_EXPRESSION = /^github\.run_id$/;
/** ci.yml's matrix is the literal os list written in that file, not computed from another job's output. */
const STATIC_MATRIX_EXPRESSION = { file: ".github/workflows/ci.yml", expression: "matrix.os" };

function runInterpolationViolations(units: Unit[]): string[] {
  const out: string[] = [];
  for (const unit of units) {
    unit.steps.forEach((step, index) => {
      for (const match of (step.run ?? "").matchAll(/\$\{\{\s*([^}]*?)\s*\}\}/g)) {
        const expression = match[1] ?? "";
        const staticMatrix =
          unit.where.startsWith(`${STATIC_MATRIX_EXPRESSION.file} `) &&
          expression === STATIC_MATRIX_EXPRESSION.expression;
        if (!SAFE_RUN_EXPRESSION.test(expression) && !staticMatrix) {
          out.push(
            `${unit.where} step ${index} (${step.name ?? step.id ?? "unnamed"}): \${{ ${match[1]} }} inside run:`,
          );
        }
      }
    });
  }
  return out;
}

/** An `npm install` of a lore or quest package (or a lore tarball) must not run lifecycle scripts. */
function installViolations(units: Unit[]): string[] {
  const out: string[] = [];
  for (const unit of units) {
    unit.steps.forEach((step, index) => {
      for (const line of (step.run ?? "").split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !/\bnpm install\b/.test(trimmed)) continue;
        if (!/@opum-ai\/(lore|quest)|@anthropic-ai\/claude-code|\$tarball|\$LINUX_X64_TARBALL/.test(trimmed)) continue;
        if (!trimmed.includes("--ignore-scripts")) out.push(`${unit.where} step ${index}: ${trimmed}`);
      }
    });
  }
  return out;
}

/** `benchmark/` and `scripts/` sources an install can hide in, besides workflow `run:` lines. */
const SOURCE_DIRS = ["benchmark", "scripts"];
const SOURCE_EXTENSIONS = /\.(ts|mjs|cjs|sh)$/;

interface SourceFile {
  /** Repo-relative path, forward slashes. */
  path: string;
  text: string;
}

function loadSources(): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.test(entry.name)) {
        out.push({ path: relative(ROOT, full).split("\\").join("/"), text: readFileSync(full, "utf8") });
      }
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
  return out;
}

/**
 * DEC-240 (a4): the ONE ruled exception to item 1. Keyed by file and by the exact argument list, with a
 * count of one, so a second flagless install in that file (even a copy of this one) is a violation.
 */
const FLAGLESS_INSTALL_EXCEPTION = {
  path: "benchmark/ladybug/package-qualification.ts",
  args: '"install", "--global", rootTarball, platformTarball',
};

/** Every npm install in a source file: a spawn-style argument list `["install", ...]` or a shell `npm install` line. */
function sourceInstalls(file: SourceFile): { args: string; line: number }[] {
  const out: { args: string; line: number }[] = [];
  const lineOf = (index: number): number => file.text.slice(0, index).split("\n").length;
  for (const match of file.text.matchAll(/\[\s*(?:"install"|'install')\s*,([^\]]*)\]/g)) {
    out.push({ args: `"install",${match[1] ?? ""}`.replace(/,\s+/g, ", ").trim(), line: lineOf(match.index ?? 0) });
  }
  // A shell install is a command in a .sh file; in a script it is a string that BEGINS with `npm install`
  // (prose that merely mentions the words, like an error message, is not an install).
  const shellInstall = file.path.endsWith(".sh")
    ? /^[ \t]*(?!#)(?:[^\n]*(?:&&|;|\|\|)[ \t]*)?npm\s+install\b[^\n]*$/gm
    : /^[^\n]*["'`]npm\s+install\b[^\n]*$/gm;
  for (const match of file.text.matchAll(shellInstall)) {
    out.push({ args: match[0].trim(), line: lineOf(match.index ?? 0) });
  }
  return out;
}

function sourceInstallViolations(files: SourceFile[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    let exceptionsUsed = 0;
    for (const install of sourceInstalls(file)) {
      if (install.args.includes("--ignore-scripts")) continue;
      if (file.path === FLAGLESS_INSTALL_EXCEPTION.path && install.args === FLAGLESS_INSTALL_EXCEPTION.args) {
        exceptionsUsed += 1;
        if (exceptionsUsed === 1) continue;
      }
      out.push(`${file.path}:${install.line}: npm install without --ignore-scripts: ${install.args}`);
    }
  }
  return out;
}

describe("DEC-240 item 2: persist-credentials", () => {
  test("every actions/checkout step in every workflow and action sets persist-credentials: false", () => {
    const units = loadUnits();
    const checkouts = units.flatMap((unit) => unit.steps).filter((s) => (s.uses ?? "").startsWith("actions/checkout@"));
    // Positive control: the walk found checkouts at all (a loader that read nothing passes vacuously).
    expect(checkouts.length).toBeGreaterThanOrEqual(25);
    expect(checkoutViolations(units)).toEqual([]);
  });

  test("rejects a checkout without it, and a checkout with it set to true", () => {
    const bare: Unit = { where: "w job a", steps: [{ uses: "actions/checkout@abc # v6" }] };
    const wrong: Unit = {
      where: "w job b",
      steps: [{ uses: "actions/checkout@abc", with: { "persist-credentials": true } }],
    };
    expect(checkoutViolations([bare, wrong])).toHaveLength(2);
    expect(
      checkoutViolations([
        { where: "w job c", steps: [{ uses: "actions/checkout@abc", with: { "persist-credentials": false } }] },
      ]),
    ).toEqual([]);
  });

  test("no job pushes with the checkout token today, so the exception list is empty", () => {
    expect(PUSHING_JOBS).toEqual({});
    for (const file of readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith(".yml"))) {
      // A `git push` COMMAND, not the words inside an error message: a run line that starts with it.
      const pushes = loadUnits()
        .filter((unit) => unit.where.startsWith(`.github/workflows/${file} `))
        .flatMap((unit) => unit.steps)
        .flatMap((step) => (step.run ?? "").split("\n"))
        .filter((line) => /^\s*(?:git|\S*\/git)\s+push\b/.test(line));
      expect(`${file}: ${pushes.length}`).toBe(`${file}: 0`);
    }
  });
});

describe("DEC-240 item 4: no workflow expression interpolated inside a run: body", () => {
  test("the real tree interpolates only matrix values and github.run_id in run:", () => {
    const units = loadUnits();
    const runs = units.flatMap((unit) => unit.steps).filter((step) => typeof step.run === "string");
    expect(runs.length).toBeGreaterThan(40);
    expect(runInterpolationViolations(units)).toEqual([]);
  });

  test("rejects a step output, an input, a needs output and an event field interpolated into run:", () => {
    const bad: Unit = {
      where: "w job x",
      steps: [
        { run: 'npm install -g "@opum-ai/quest@${{ steps.quest.outputs.version }}"' },
        { run: 'echo "${{ inputs.version }}"' },
        { run: 'echo "${{ needs.a.outputs.b }}"' },
        { run: 'echo "${{ github.event.pull_request.title }}"' },
        // A matrix value is only static in ci.yml; anywhere else it may come from another job's output.
        { run: 'bun x --name "${{ matrix.name }}"' },
      ],
    };
    expect(runInterpolationViolations([bad])).toHaveLength(5);
    expect(
      runInterpolationViolations([
        { where: ".github/workflows/ci.yml job y", steps: [{ run: 'echo "${{ matrix.os }} ${{ github.run_id }}"' }] },
      ]),
    ).toEqual([]);
  });
});

describe("DEC-240 item 1: lore and quest install without lifecycle scripts", () => {
  test("every npm install of a lore or quest package in CI carries --ignore-scripts", () => {
    const units = loadUnits();
    const installs = units
      .flatMap((unit) => unit.steps)
      .flatMap((step) => (step.run ?? "").split("\n"))
      .filter(
        (line) =>
          /\bnpm install\b/.test(line) &&
          /@opum-ai\/(lore|quest)|@anthropic-ai\/claude-code|\$tarball|\$LINUX_X64_TARBALL/.test(line),
      );
    // Positive control: setup-quest (two installs) and release.yml (two) were found.
    expect(installs.length).toBeGreaterThanOrEqual(4);
    expect(installViolations(units)).toEqual([]);
  });

  test("rejects the old install shapes", () => {
    const old: Unit = {
      where: "w job z",
      steps: [{ run: 'npm install -g "@opum-ai/quest@$VERSION"\nnpm install "$GITHUB_WORKSPACE/$tarball"' }],
    };
    expect(installViolations([old])).toHaveLength(2);
  });

  test("benchmark/ and scripts/ sources: every npm install carries --ignore-scripts but the one DEC-240 (a4) exception", () => {
    const files = loadSources();
    // Positive control: the walk read both trees, and the exception's own file with its one install.
    expect(files.some((f) => f.path.startsWith("benchmark/"))).toBe(true);
    expect(files.some((f) => f.path.startsWith("scripts/"))).toBe(true);
    const own = files.find((f) => f.path === FLAGLESS_INSTALL_EXCEPTION.path);
    expect(own).toBeDefined();
    const flagless = sourceInstalls(own as SourceFile).filter((i) => !i.args.includes("--ignore-scripts"));
    expect(flagless.map((i) => i.args)).toEqual([FLAGLESS_INSTALL_EXCEPTION.args]);
    expect(sourceInstallViolations(files)).toEqual([]);
  });

  test("source scan rejects an unflagged install, a second copy of the exception, and a shell install; accepts the flagged one", () => {
    const exceptionLine = `await run(npm, [${FLAGLESS_INSTALL_EXCEPTION.args}], {});\n`;
    const home = FLAGLESS_INSTALL_EXCEPTION.path;
    expect(sourceInstallViolations([{ path: home, text: exceptionLine }])).toEqual([]);
    // Mutants: each is the defect's own shape and must go red.
    expect(sourceInstallViolations([{ path: home, text: exceptionLine + exceptionLine }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "benchmark/x.ts", text: exceptionLine }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: home, text: 'run(npm, ["install", "--global", other]);' }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/x.sh", text: 'npm install "$tarball"\n' }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/y.mjs", text: 'run("npm", ["install", "lodash"]);' }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/z.mjs", text: 'sh("npm install foo");' }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/z.mjs", text: 'throw new Error(`the npm install failed`);' }])).toEqual([]);
    // Accepts: the hardened shapes.
    expect(
      sourceInstallViolations([
        { path: "scripts/x.sh", text: 'npm install --ignore-scripts "$tarball"\n# npm install "$tarball"\n' },
        { path: home, text: 'run(npm, ["install", "--ignore-scripts", a, b]);' },
      ]),
    ).toEqual([]);
  });

  test("proved with a real install: a dependency whose postinstall fails still installs under --ignore-scripts, and fails without it", () => {
    const work = mkdtempSync(join(tmpdir(), "lcli768-postinstall-"));
    try {
      const dep = join(work, "dep");
      mkdirSync(dep);
      writeFileSync(
        join(dep, "package.json"),
        JSON.stringify({
          name: "failing-postinstall-dep",
          version: "1.0.0",
          // Writes a sentinel (path from the environment) and then fails: the sentinel is the proof
          // that THIS script ran, so the control cannot pass on a name match or a different failure.
          scripts: {
            postinstall: "node -e \"require('fs').writeFileSync(process.env.LCLI768_SENTINEL,'ran');process.exit(7)\"",
          },
        }),
      );
      const pack = spawnSync("npm", ["pack", "--silent", "--pack-destination", work], {
        cwd: dep,
        encoding: "utf8",
        shell: onWindows,
      });
      expect(pack.status).toBe(0);
      const tarball = join(work, pack.stdout.trim().split("\n").pop() ?? "");
      const install = (extra: string[]): { status: number | null; err: string; sentinel: string } => {
        const sentinel = join(work, `sentinel-${extra.length}-${Math.random().toString(36).slice(2)}`);
        const project = mkdtempSync(join(work, "project-"));
        writeFileSync(join(project, "package.json"), JSON.stringify({ name: "consumer", version: "1.0.0" }));
        // npm 12 blocks a dependency's install script unless allowed (allowScripts), so the control forces
        // scripts ON with --dangerously-allow-all-scripts; npm 10/11 run them by default and only warn on
        // the unknown flag. Without that the control would pass for the wrong reason on a newer npm.
        const result = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--offline", ...extra, tarball], {
          cwd: project,
          encoding: "utf8",
          shell: onWindows,
          env: { ...process.env, LCLI768_SENTINEL: sentinel },
        });
        return { status: result.status, err: result.stderr, sentinel };
      };
      // Control: without the flag the failing script runs and the install fails.
      const without = install(["--dangerously-allow-all-scripts"]);
      expect(without.status).not.toBe(0);
      expect(existsSync(without.sentinel)).toBe(true);
      // The hardened form: the script never runs (no sentinel), and the install succeeds.
      const hardened = install(["--ignore-scripts", "--dangerously-allow-all-scripts"]);
      expect(hardened.status).toBe(0);
      expect(existsSync(hardened.sentinel)).toBe(false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 120_000);
});

describe.skipIf(onWindows)("DEC-240 item 3: the Quest version is read from inside the managed block, exactly", () => {
  function read(claudeMd: string): { code: number | null; out: string; version?: string } {
    const work = mkdtempSync(join(tmpdir(), "lcli768-reader-"));
    try {
      const file = join(work, "CLAUDE.md");
      const outFile = join(work, "output");
      writeFileSync(file, claudeMd);
      writeFileSync(outFile, "");
      const result = spawnSync("bash", [READER, file], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: outFile },
      });
      const written = readFileSync(outFile, "utf8");
      const match = /^version=(.*)$/m.exec(written);
      return { code: result.status, out: result.stdout, ...(match?.[1] !== undefined ? { version: match[1] } : {}) };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  const block = (line: string): string =>
    `intro\n<!-- quest:agent-instructions:begin -->\n# Quest agent instructions\n\n${line}\n<!-- quest:agent-instructions:end -->\ntrailer\n`;

  test("accepts an exact version inside the block and writes version= to GITHUB_OUTPUT", () => {
    const result = read(block("This project uses Quest CLI 0.14.1 for tracker operations."));
    expect(result.code).toBe(0);
    expect(result.version).toBe("0.14.1");
  });

  test("accepts this repository's own CLAUDE.md (the real input)", () => {
    const result = read(readFileSync(join(ROOT, "CLAUDE.md"), "utf8"));
    expect(result.code).toBe(0);
    expect(result.version).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
  });

  test("a CRLF checkout reads the same", () => {
    const result = read(block("This project uses Quest CLI 0.14.1 for tracker operations.").replaceAll("\n", "\r\n"));
    expect(result.code).toBe(0);
    expect(result.version).toBe("0.14.1");
  });

  test.each([
    ["a partial version", "This project uses Quest CLI 0.14 for tracker operations.", "'0.14'"],
    ["a range", "This project uses Quest CLI ^0.14.1 for tracker operations.", "'^0.14.1'"],
    ["a pre-release", "This project uses Quest CLI 0.14.1-rc.1 for tracker operations.", "'0.14.1-rc.1'"],
    ["a four-part version", "This project uses Quest CLI 0.14.1.2 for tracker operations.", "'0.14.1.2'"],
    ["a tag", "This project uses Quest CLI latest for tracker operations.", "'latest'"],
    ["trailing punctuation", "This project uses Quest CLI 0.14.1. For tracker operations.", "'0.14.1.'"],
  ])("fails by name on %s, writes no output, and never reaches npm", (_label, line, shown) => {
    const result = read(block(line));
    expect(result.code).toBe(1);
    expect(result.version).toBeUndefined();
    expect(result.out).toContain("::error file=");
    expect(result.out).toContain(shown);
    expect(result.out).toContain("not an exact X.Y.Z");
  });

  test("a version stated only OUTSIDE the markers is not read, and neither is an empty or absent block", () => {
    const outside = read(
      "Quest CLI 0.14.1 appears out here.\n<!-- quest:agent-instructions:begin -->\nno version\n<!-- quest:agent-instructions:end -->\n",
    );
    expect(outside.code).toBe(1);
    expect(outside.out).toContain("has no 'Quest CLI <version>' line");
    const noBlock = read("This project uses Quest CLI 0.14.1 for tracker operations.\n");
    expect(noBlock.code).toBe(1);
    expect(noBlock.out).toContain("exactly one");
    const empty = read("<!-- quest:agent-instructions:begin -->\n<!-- quest:agent-instructions:end -->\n");
    expect(empty.code).toBe(1);
  });

  test.each([
    [
      "an unclosed block",
      "<!-- quest:agent-instructions:begin -->\nThis project uses Quest CLI 0.14.1 for tracker operations.\n",
      "found 1 begin and 0 end",
    ],
    [
      "a duplicated block",
      `${block("This project uses Quest CLI 0.14.1 for tracker operations.")}${block("This project uses Quest CLI 0.14.2 for tracker operations.")}`,
      "found 2 begin and 2 end",
    ],
    [
      "reversed markers",
      "<!-- quest:agent-instructions:end -->\nThis project uses Quest CLI 0.14.1 for tracker operations.\n<!-- quest:agent-instructions:begin -->\n",
      "are reversed",
    ],
    [
      "a stray extra end marker",
      `${block("This project uses Quest CLI 0.14.1 for tracker operations.")}<!-- quest:agent-instructions:end -->\n`,
      "found 1 begin and 2 end",
    ],
  ])("fails by name on %s, and writes no version", (_label, text, expected) => {
    const result = read(text);
    expect(result.code).toBe(1);
    expect(result.version).toBeUndefined();
    expect(result.out).toContain("::error file=");
    expect(result.out).toContain(expected);
  });

  test("a missing file fails by name", () => {
    const result = spawnSync("bash", [READER, join(tmpdir(), "lcli768-does-not-exist.md")], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("does not exist");
  });

  test("every workflow reader step calls the script, and no inline sed reader remains", () => {
    const units = loadUnits();
    const readers = units
      .flatMap((unit) => unit.steps)
      .filter((step) => step.name === "Resolve the Quest version CLAUDE.md declares");
    expect(readers).toHaveLength(4);
    for (const step of readers)
      expect(step.run ?? "").toContain("bash scripts/read-declared-quest-version.sh CLAUDE.md");
    for (const step of units.flatMap((unit) => unit.steps)) expect(step.run ?? "").not.toContain("Quest CLI \\(");
  });

  test("setup-quest refuses a non-exact version input before any npm call", () => {
    const action = yaml.load(readFileSync(join(ACTIONS_DIR, "setup-quest", "action.yml"), "utf8")) as {
      runs: { steps: Step[] };
    };
    const npm = action.runs.steps.find((step) => step.id === "npm");
    const run = npm?.run ?? "";
    expect(run.indexOf("=~")).toBeGreaterThan(-1);
    expect(run.indexOf("=~")).toBeLessThan(run.indexOf("npm install"));
    // Drive the real step body with a ranged input: it must exit non-zero without reaching npm.
    const work = mkdtempSync(join(tmpdir(), "lcli768-setup-"));
    try {
      const bin = join(work, "bin");
      mkdirSync(bin);
      const marker = join(work, "npm-called");
      writeFileSync(join(bin, "npm"), `#!/bin/sh\necho called > "${marker}"\nexit 0\n`, { mode: 0o755 });
      const result = spawnSync("bash", ["-c", run], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          VERSION: "^0.14.1",
          SOURCE_REF: "",
          GITHUB_OUTPUT: join(work, "out"),
        },
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("::error::setup-quest: the version input '^0.14.1' is not an exact X.Y.Z");
      expect(existsSync(marker)).toBe(false);
      // Control: an exact version reaches npm, with --ignore-scripts.
      writeFileSync(join(bin, "npm"), `#!/bin/sh\necho "$@" > "${marker}"\nexit 0\n`, { mode: 0o755 });
      const ok = spawnSync("bash", ["-c", run], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          VERSION: "0.14.1",
          SOURCE_REF: "",
          GITHUB_OUTPUT: join(work, "out"),
        },
      });
      expect(ok.status).toBe(0);
      expect(readFileSync(marker, "utf8")).toBe("install -g --ignore-scripts @opum-ai/quest@0.14.1\n");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
