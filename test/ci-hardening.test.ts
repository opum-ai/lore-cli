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
import { QUALIFICATION_DISTRIBUTIONS } from "../benchmark/ladybug/package-qualification";

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
/** The `matrix.os` allowance is scoped to ONE job: ci.yml's `check`, whose matrix is the literal os list written there. */
const STATIC_MATRIX_EXPRESSION = { where: ".github/workflows/ci.yml job check", expression: "matrix.os" };

/**
 * Every `${{ ... }}` body in a run: text. Scans to the closing `}}` outside a single-quoted string, so a
 * function call whose literal contains a brace (`format('{0}', x)`) is read whole rather than cut short.
 */
function workflowExpressions(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf("${{", from);
    if (start < 0) return out;
    let end = start + 3;
    let quoted = false;
    for (; end < text.length; end++) {
      const char = text[end];
      if (char === "'") quoted = !quoted;
      else if (!quoted && char === "}" && text[end + 1] === "}") break;
    }
    out.push(text.slice(start + 3, end).trim());
    from = end + 2;
  }
}

function runInterpolationViolations(units: Unit[]): string[] {
  const out: string[] = [];
  for (const unit of units) {
    unit.steps.forEach((step, index) => {
      for (const expression of workflowExpressions(step.run ?? "")) {
        const staticMatrix =
          unit.where === STATIC_MATRIX_EXPRESSION.where && expression === STATIC_MATRIX_EXPRESSION.expression;
        if (!SAFE_RUN_EXPRESSION.test(expression) && !staticMatrix) {
          out.push(
            `${unit.where} step ${index} (${step.name ?? step.id ?? "unnamed"}): \${{ ${expression} }} inside run:`,
          );
        }
      }
    });
  }
  return out;
}

/**
 * The npm verbs that install: `install`, its aliases `i`/`add`, and `ci`, with any run of `-`/`--` options
 * allowed BEFORE the verb, each with an optional value: `npm --prefix "$d" install`, `npm -g i`. Without that the
 * scan missed exactly the spellings a helper reaches for, so `npm --prefix x install "@opum-ai/lore@$V"` read as
 * no install at all (the L3 residual in rv329-lcli685).
 */
const NPM_OPTIONS = String.raw`(?:\s+-{1,2}[^\s]+(?:\s+[^-\s][^\s]*)?)*`;
const NPM_INSTALL_SHELL = String.raw`npm\b${NPM_OPTIONS}\s+(?:install|i|add|ci)\b`;
const NPM_INSTALL_VERB = new RegExp(String.raw`\b${NPM_INSTALL_SHELL}`);
/** What makes an install one of ours: a lore/quest/claude-code package, a `.tgz`, or any `$...TARBALL...` variable. */
const OUR_INSTALL_TARGET = /@opum-ai\/(?:lore|quest)|@anthropic-ai\/claude-code|\.tgz\b|\$\{?\w*tarball\w*\}?/i;

/** A shell body with backslash-continued lines joined, so a flag on the next line belongs to its command. */
function joinContinuations(text: string): string[] {
  return text.replace(/\\\r?\n\s*/g, " ").split("\n");
}

/** An `npm install` of a lore or quest package (or a lore tarball) must not run lifecycle scripts. */
function installViolations(units: Unit[]): string[] {
  const out: string[] = [];
  for (const unit of units) {
    unit.steps.forEach((step, index) => {
      for (const line of joinContinuations(step.run ?? "")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#") || !NPM_INSTALL_VERB.test(trimmed) || !OUR_INSTALL_TARGET.test(trimmed)) continue;
        if (!trimmed.includes("--ignore-scripts")) out.push(`${unit.where} step ${index}: ${trimmed}`);
      }
    });
  }
  return out;
}

/** `benchmark/` and `scripts/` sources an install can hide in, besides workflow `run:` lines. */
const SOURCE_DIRS = ["benchmark", "scripts", "docker"];
/** Under these, EVERY npm install is held to the flag; elsewhere (docker/) only an install of ours is. */
const BLANKET_DIRS = ["benchmark/", "scripts/"];
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
      if (entry.name === "node_modules" || entry.name === ".npm-cache") continue;
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
  args: '"install", "--global", ...installTarballs',
};

/**
 * The (a4) exception is ONE helper, and the helper may be called from exactly two places: the (a5) fixture install
 * that proves npm blocks an unapproved script, and the qualification's own global install. Counting the call sites
 * is what stops a third caller from inheriting the exception; the helper's own guards (absolute path, existing
 * .tgz, inside its root, two allowed extras, merged-env config readback) are proved in
 * test/ladybug-package-qualification.test.ts.
 */
const FLAGLESS_INSTALL_CALL_SITES = 2;

function flaglessInstallCallSites(text: string): number {
  return [...text.matchAll(/\bflaglessGlobalInstall\s*\(/g)].filter(
    (match) => !/\bfunction\s+$/.test(text.slice(Math.max(0, (match.index ?? 0) - 9), match.index ?? 0)),
  ).length;
}

/** Every npm install in a source file: a spawn-style argument list `["install", ...]` or a shell `npm install` line. */
function sourceInstalls(file: SourceFile): { args: string; line: number }[] {
  const out: { args: string; line: number }[] = [];
  const lineOf = (index: number): number => file.text.slice(0, index).split("\n").length;
  for (const match of file.text.matchAll(/\bnpm\w*["']?\s*,\s*\[\s*["'](install|i|add|ci)["']\s*,([^\]]*)\]/gi)) {
    out.push({ args: `"${match[1]}",${match[2] ?? ""}`.replace(/,\s+/g, ", ").trim(), line: lineOf(match.index ?? 0) });
  }
  // A shell install is a command in a .sh file; in a script it is a string that BEGINS with `npm install`
  // (prose that merely mentions the words, like an error message, is not an install).
  const shellInstall = file.path.endsWith(".sh")
    ? new RegExp(String.raw`^[ \t]*(?!#)(?:[^\n]*(?:&&|;|\|\|)[ \t]*)?${NPM_INSTALL_SHELL}(?:[^\n]|(?<=\\)\n)*`, "gm")
    : new RegExp(String.raw`^[^\n]*["'\`]${NPM_INSTALL_SHELL}[^\n]*$`, "gm");
  for (const match of file.text.matchAll(shellInstall)) {
    out.push({ args: match[0].trim().replace(/\\\r?\n\s*/g, " "), line: lineOf(match.index ?? 0) });
  }
  return out;
}

function sourceInstallViolations(files: SourceFile[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    let exceptionsUsed = 0;
    for (const install of sourceInstalls(file)) {
      if (install.args.includes("--ignore-scripts")) continue;
      // Outside benchmark/ and scripts/ (docker/) only an install of ours is held to the flag.
      if (!BLANKET_DIRS.some((dir) => file.path.startsWith(dir)) && !OUR_INSTALL_TARGET.test(install.args)) continue;
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
        {
          where: ".github/workflows/ci.yml job check",
          steps: [{ run: 'echo "${{ matrix.os }} ${{ github.run_id }}"' }],
        },
      ]),
    ).toEqual([]);
  });

  test("rejects a function call whose literal holds a brace, and matrix.os outside ci.yml's check job (L1, L2)", () => {
    // `format('{0}', ...)` carries a `}` inside its string, which cut a `[^}]*` scan short and read as no expression.
    const formatted: Unit = {
      where: "w job f",
      steps: [{ run: "echo \"${{ format('{0}', steps.a.outputs.b) }}\"\necho \"${{ format('{{0}}', inputs.x) }}\"" }],
    };
    expect(runInterpolationViolations([formatted])).toHaveLength(2);
    // The static-matrix allowance is one job, not the whole file.
    const elsewhere: Unit = {
      where: ".github/workflows/ci.yml job build",
      steps: [{ run: 'echo "${{ matrix.os }}"' }],
    };
    expect(runInterpolationViolations([elsewhere])).toHaveLength(1);
    // The tokenizer itself: reads each body whole, two to a line, and an unterminated one to the end.
    expect(workflowExpressions("a ${{ format('{0}', x) }} b ${{ github.run_id }}")).toEqual([
      "format('{0}', x)",
      "github.run_id",
    ]);
    expect(workflowExpressions("${{ unterminated")).toEqual(["unterminated"]);
  });
});

describe("DEC-240 item 1: lore and quest install without lifecycle scripts", () => {
  test("every npm install of a lore or quest package in CI carries --ignore-scripts", () => {
    const units = loadUnits();
    const installs = units
      .flatMap((unit) => unit.steps)
      .flatMap((step) => joinContinuations(step.run ?? ""))
      .filter((line) => NPM_INSTALL_VERB.test(line) && OUR_INSTALL_TARGET.test(line));
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

  test("rejects the install spellings the first scan missed: npm i, npm ci, a continued line, other tarball variables (L3)", () => {
    for (const run of [
      'npm i -g "@opum-ai/quest@$V"',
      'npm add "@opum-ai/lore@$V"',
      'npm ci "$RELEASE_TARBALL"',
      'npm install \\\n  --prefix "$d" \\\n  "@opum-ai/lore-linux-x64@$V"',
      'npm install "$PLATFORM_TARBALL"',
      "npm install ./pkg/opum-ai-lore-0.14.1.tgz",
      // An option BEFORE the verb is still an install (rv329-lcli685's L3 residual): both the long and short form.
      'npm --prefix "$d" install "@opum-ai/lore@$V"',
      'npm -g i "@opum-ai/quest@$V"',
      'npm --prefix="$d" i "@opum-ai/lore@$V"',
    ]) {
      expect(installViolations([{ where: "w job m", steps: [{ run }] }])).toHaveLength(1);
    }
    // And the other direction: a flagged install is accepted in that shape too, and an npm that is not installing
    // anything is not an install just because it has an option before a word.
    expect(
      installViolations([
        { where: "w job p", steps: [{ run: 'npm --prefix "$d" install --ignore-scripts "@opum-ai/lore@$V"' }] },
        { where: "w job q", steps: [{ run: 'npm --prefix "$d" run build' }] },
      ]),
    ).toEqual([]);
    // Accepts: the flag on a continuation line, and an install that is not ours.
    expect(
      installViolations([
        { where: "w job n", steps: [{ run: 'npm install \\\n  --ignore-scripts \\\n  "@opum-ai/lore@$V"' }] },
        { where: "w job o", steps: [{ run: "npm install\nnpm ci" }] },
      ]),
    ).toEqual([]);
  });

  test("benchmark/ and scripts/ sources: every npm install carries --ignore-scripts but the one DEC-240 (a4) exception", () => {
    const files = loadSources();
    // Positive control: the walk read both trees, and the exception's own file with its one install.
    expect(files.some((f) => f.path.startsWith("benchmark/"))).toBe(true);
    expect(files.some((f) => f.path.startsWith("scripts/"))).toBe(true);
    expect(files.some((f) => f.path.startsWith("docker/"))).toBe(true);
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
    expect(sourceInstallViolations([{ path: home, text: 'run(npm, ["install", "--global", other]);' }])).toHaveLength(
      1,
    );
    expect(sourceInstallViolations([{ path: "scripts/x.sh", text: 'npm install "$tarball"\n' }])).toHaveLength(1);
    // The same residual in a shell source: the option sits before the verb.
    expect(
      sourceInstallViolations([{ path: "scripts/x.sh", text: 'npm --prefix "$d" install "$tarball"\n' }]),
    ).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/x.sh", text: 'npm -g i "$tarball"\n' }])).toHaveLength(1);
    expect(
      sourceInstallViolations([{ path: "scripts/y.mjs", text: 'run("npm", ["install", "lodash"]);' }]),
    ).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/z.mjs", text: 'sh("npm install foo");' }])).toHaveLength(1);
    expect(
      sourceInstallViolations([{ path: "scripts/z.mjs", text: "throw new Error(`the npm install failed`);" }]),
    ).toEqual([]);
    // L3: the other verbs, a continued shell install, a git-add array that is NOT an npm call, and docker/.
    expect(sourceInstallViolations([{ path: "scripts/a.mjs", text: 'run(npm, ["ci", tarball]);' }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/a.mjs", text: 'run(npm, ["i", "-g", pkg]);' }])).toHaveLength(1);
    expect(sourceInstallViolations([{ path: "scripts/b.sh", text: 'npm ci \\\n  --prefix "$d"\n' }])).toHaveLength(1);
    expect(
      sourceInstallViolations([{ path: "scripts/b.sh", text: 'npm install \\\n  --ignore-scripts "$t"\n' }]),
    ).toEqual([]);
    expect(sourceInstallViolations([{ path: "scripts/c.mjs", text: 'run("git", ["add", "-A"]);' }])).toEqual([]);
    expect(
      sourceInstallViolations([{ path: "docker/e2e/x.sh", text: 'npm install -g "@opum-ai/lore@$V"\n' }]),
    ).toHaveLength(1);
    expect(
      sourceInstallViolations([{ path: "docker/e2e/x.sh", text: "cd website && npm install --prefer-offline\n" }]),
    ).toEqual([]);
    // Accepts: the hardened shapes.
    expect(
      sourceInstallViolations([
        { path: "scripts/x.sh", text: 'npm install --ignore-scripts "$tarball"\n# npm install "$tarball"\n' },
        { path: home, text: 'run(npm, ["install", "--ignore-scripts", a, b]);' },
      ]),
    ).toEqual([]);
  });

  test("the (a4) exception has exactly two call sites, so a third caller cannot inherit it", () => {
    const own = loadSources().find((file) => file.path === FLAGLESS_INSTALL_EXCEPTION.path);
    expect(own).toBeDefined();
    expect(flaglessInstallCallSites(own?.text ?? "")).toBe(FLAGLESS_INSTALL_CALL_SITES);
    // Mutant: the defect's own shape -- a third caller added beside the two real ones, the declaration unchanged.
    const thirdCaller = `${own?.text ?? ""}\nasync function anotherInstaller(npm) {\n  return flaglessGlobalInstall(npm, {}, "/tmp", ["@opum-ai/lore@0.14.1"]);\n}\n`;
    expect(flaglessInstallCallSites(thirdCaller)).toBe(FLAGLESS_INSTALL_CALL_SITES + 1);
    // The counter itself: the declaration is not a call site, and a call in a comment or a string still counts.
    expect(flaglessInstallCallSites("async function flaglessGlobalInstall(a, b, c, d) {}")).toBe(0);
    expect(flaglessInstallCallSites("await flaglessGlobalInstall(npm, env, root, [a]);")).toBe(1);
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

describe("DEC-240 (a5) item 1: every package-qualification host pins an exact Node and an exact npm 12 first", () => {
  const doc = yaml.load(readFileSync(join(WORKFLOWS_DIR, "release.yml"), "utf8")) as {
    jobs: Record<string, { name?: string; steps?: Step[] }>;
  };
  const jobs = Object.entries(doc.jobs).filter(([, job]) =>
    (job.name ?? "").startsWith("matching-host package qualification"),
  );

  /** The violations of one such job's step list, so the real tree and a broken copy go through the same check. */
  function pinViolations(steps: Step[]): string[] {
    const out: string[] = [];
    const nodeAt = steps.findIndex((step) => (step.uses ?? "").startsWith("actions/setup-node@"));
    const npmAt = steps.findIndex((step) => /npm install\b.*\bnpm@\S+/.test(step.run ?? ""));
    const qualifyAt = steps.findIndex((step) => (step.run ?? "").includes("package-qualification.ts"));
    if (nodeAt < 0) return ["no actions/setup-node step"];
    if (!/^actions\/setup-node@[0-9a-f]{40}\b/.test(steps[nodeAt]?.uses ?? "")) {
      out.push("setup-node is not pinned to a 40-character SHA");
    }
    const nodeVersion = String(steps[nodeAt]?.with?.["node-version"] ?? "");
    const [major = 0, minor = 0, patch = 0] = nodeVersion.split(".").map(Number);
    // npm 12's engines: ^22.22.2 || ^24.15.0 || >=26.0.0, and EXACT (three numeric parts).
    const accepted =
      /^\d+\.\d+\.\d+$/.test(nodeVersion) &&
      ((major === 22 && (minor > 22 || (minor === 22 && patch >= 2))) || (major === 24 && minor >= 15) || major >= 26);
    if (!accepted) out.push(`node-version ${JSON.stringify(nodeVersion)} is not an exact version npm 12 accepts`);
    // EVERY npm-self-install line (the Windows branch takes --prefix) is exact npm 12 and carries the flag.
    const installs = (steps[npmAt]?.run ?? "").split("\n").filter((line) => /npm install\b.*\bnpm@/.test(line));
    if (
      npmAt < 0 ||
      installs.length === 0 ||
      !installs.every((line) => /npm install -g --ignore-scripts\b.* npm@12\.\d+\.\d+\s*$/.test(line))
    ) {
      out.push("no exact `npm install -g --ignore-scripts npm@12.x.y` step");
    }
    if (!(nodeAt < npmAt && npmAt < qualifyAt)) {
      out.push("setup-node, then the npm pin, must both precede package-qualification");
    }
    return out;
  }

  test("the real release.yml: one job serves all six hosts, and it carries the pins in order", () => {
    // Positive control: the job was found (a name filter that matched nothing would pass vacuously).
    expect(jobs).toHaveLength(1);
    expect(pinViolations(jobs[0]?.[1].steps ?? [])).toEqual([]);
  });

  test("the distributions the report validator scores are exactly the six the release matrix qualifies", () => {
    // The matrix is a JSON literal the setup job writes to $GITHUB_OUTPUT; the qualification jobs consume it.
    const literal = Object.values(doc.jobs)
      .flatMap((job) => job.steps ?? [])
      .map((step) => /^\s*matrix='(\[.*\])'$/m.exec(step.run ?? "")?.[1])
      .find((value) => value !== undefined);
    expect(literal).toBeDefined();
    const names = (JSON.parse(literal as string) as { name: string }[]).map((entry) => entry.name).sort();
    // Positive control: six names were read, so a shape change here cannot pass vacuously.
    expect(names).toHaveLength(6);
    expect(names).toEqual([...QUALIFICATION_DISTRIBUTIONS].sort());
  });

  test("rejects the shapes that lose the guarantee", () => {
    const node: Step = {
      uses: "actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5.0.0",
      with: { "node-version": "24.21.0" },
    };
    const pin: Step = { run: "npm install -g --ignore-scripts npm@12.2.1\nnpm --version" };
    const qualify: Step = { run: "bun benchmark/ladybug/package-qualification.ts --name x" };
    expect(pinViolations([node, pin, qualify])).toEqual([]);
    for (const version of ["24", "24.x", "lts/*", "24.14.0", "22.22.1", "20.19.0", "^24.15.0"]) {
      expect(pinViolations([{ ...node, with: { "node-version": version } }, pin, qualify])).not.toEqual([]);
    }
    expect(pinViolations([{ ...node, with: { "node-version": "22.22.2" } }, pin, qualify])).toEqual([]);
    expect(pinViolations([pin, qualify])).toEqual(["no actions/setup-node step"]);
    expect(pinViolations([node, qualify])).not.toEqual([]);
    expect(pinViolations([node, { run: "npm install -g npm@12.2.1" }, qualify])).not.toEqual([]);
    expect(pinViolations([node, { run: "npm install -g --ignore-scripts npm@^12" }, qualify])).not.toEqual([]);
    // The Windows branch counts too: a flagless or ranged second install line is a violation.
    expect(
      pinViolations([
        node,
        {
          run: "if w; then\n  npm install -g --ignore-scripts --prefix x npm@12.2.1\nelse\n  npm install -g --ignore-scripts npm@12.2.1\nfi",
        },
        qualify,
      ]),
    ).toEqual([]);
    expect(
      pinViolations([
        node,
        {
          run: "if w; then\n  npm install -g --prefix x npm@12.2.1\nelse\n  npm install -g --ignore-scripts npm@12.2.1\nfi",
        },
        qualify,
      ]),
    ).not.toEqual([]);
    expect(pinViolations([node, { run: "npm install -g --ignore-scripts npm@11.19.0" }, qualify])).not.toEqual([]);
    expect(pinViolations([node, qualify, pin])).not.toEqual([]);
    expect(
      pinViolations([{ uses: "actions/setup-node@v5", with: { "node-version": "24.21.0" } }, pin, qualify]),
    ).not.toEqual([]);
  });
});

describe.skipIf(onWindows)(
  "DEC-240 item 3 (L5): release.yml's previous_version is an exact X.Y.Z before it is installed",
  () => {
    /** The release-gate probe step's run body, cut from the assignment to the install, read as data. */
    function probeSnippet(): string {
      const doc = yaml.load(readFileSync(join(WORKFLOWS_DIR, "release.yml"), "utf8")) as {
        jobs: Record<string, { steps?: Step[] }>;
      };
      const runs = Object.values(doc.jobs)
        .flatMap((job) => job.steps ?? [])
        .map((step) => step.run ?? "")
        .filter((run) => run.includes('previous_version="$(npm view @opum-ai/lore version)"'));
      expect(runs).toHaveLength(1);
      const run = runs[0] ?? "";
      const from = run.indexOf('previous_version="$(npm view');
      const to = run.indexOf('npm install --ignore-scripts --prefix "$previous_dir"');
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      return run.slice(from, to);
    }

    /** Runs the snippet with an `npm` stub that prints `printed`; the snippet's install is not reached. */
    function runWith(printed: string): { status: number | null; out: string } {
      const work = mkdtempSync(join(tmpdir(), "lcli768-prevver-"));
      try {
        const bin = join(work, "bin");
        mkdirSync(bin);
        writeFileSync(join(bin, "npm"), `#!/bin/sh\nprintf '%s' "$NPM_STUB_OUT"\n`, { mode: 0o755 });
        const result = spawnSync("bash", ["-c", `${probeSnippet()}\necho "REACHED:$previous_version"`], {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            NPM_STUB_OUT: printed,
            RUNNER_TEMP: work,
            PLATFORM_NAME: "linux-x64",
          },
        });
        return { status: result.status, out: `${result.stdout}${result.stderr}` };
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }

    test("accepts an exact version, and reaches the install with it", () => {
      const ok = runWith("0.14.1");
      expect(ok.status).toBe(0);
      expect(ok.out).toContain("REACHED:0.14.1");
    });

    test("refuses a range, a flag, a shell fragment, a prerelease and nothing, before the install", () => {
      for (const printed of [
        "^0.14.1",
        "0.14.1 --foreground-scripts",
        "0.14.1;touch pwned",
        "0.14.1-rc.1",
        "0.14",
        "latest",
        "",
        // MULTI-LINE: the old gate was `printf '%s\n' | grep -Eq '^...$'`, which succeeds when ANY line matches,
        // so this value passed it and carried its second line into the install argument below.
        "0.14.1\n;pwned",
      ]) {
        const bad = runWith(printed);
        expect(`${JSON.stringify(printed)} -> ${bad.status}`).toBe(`${JSON.stringify(printed)} -> 1`);
        expect(bad.out).not.toContain("REACHED:");
      }
    });
  },
);

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
