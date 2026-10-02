// LCLI-664. The opum-lore plugin's hooks module (a "mod") is exercised by Claude
// Code's own engine, not by bun: `claude plugin test <dir>` runs every `*.test.ts`
// and `*.test.tsx` under the directory it is given, and this repository's CLI suite
// under `test/` is not a mod suite -- pointed at the repository root, the engine
// would try to run all of it. So the files the plugin ships are staged into a temp
// directory and the engine is pointed there: the mod is then tested against exactly
// what the plugin ships, and nothing else. `bun test` must never pick the mod's
// tests up, and bunfig.toml's [test] pathIgnorePatterns prunes tests/** from its
// discovery -- `bun run test:mod` is what runs them.
//
// `claude` is required rather than optional, and a missing or too-old one fails here
// instead of skipping: the mod's tests are the only thing that runs them.
//
// The typecheck is a second step with three states, and the script says which one it
// ran rather than passing quietly. The engine writes its TypeScript declaration beside
// a mod only when a session loads that mod from a folder the person owns, and
// `claude plugin test` does not write one. So the module is typechecked against the
// declaration the engine laid beside the stage when one is there; otherwise against
// the bundled declaration the plugin-authoring skill leaves in the machine's temp
// directory, and only when that declaration's own first line names the exact Claude
// Code running these tests -- a typecheck against another build's declaration is a
// different measurement, and a differently-sourced one reported as clean would be
// exactly the implied green this step exists to avoid. When neither is available the
// run reports NOT TYPECHECKED explicitly.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { cp, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// What the opum-lore plugin ships. Everything here is staged; nothing the CLI owns
// is, which is the whole point of the stage.
const SHIPPED = ["hooks", "types", "tests", "skills"];
const MINIMUM_CLAUDE = [2, 1, 287];
// The tsconfig a hooks module is typed against, taken from the engine declaration's
// own header: `jsxFactory: h` is what a mod's JSX compiles against, and `lib` names
// no DOM because the environment has none.
const COMPILER_OPTIONS = {
  target: "es2023",
  lib: ["es2023"],
  types: [],
  module: "esnext",
  moduleResolution: "bundler",
  strict: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: true,
  jsx: "react",
  jsxFactory: "h",
  jsxFragmentFactory: "Fragment",
};

/** Run a command and capture its trimmed stdout, or null when it could not run at all. */
function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.error) return null;

  return { status: result.status ?? 1, stdout: (result.stdout ?? "").trim() };
}

/** Run a command with this process's streams, returning its exit status. */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    throw new Error(`${command} could not run: ${result.error.message}`);
  }

  return result.status ?? 1;
}

/** `"2.1.287 (Claude Code)"` -> `"2.1.287"`, or null when no version is printed. */
function versionIn(text) {
  const match = /(\d+\.\d+\.\d+)/u.exec(text ?? "");
  if (!match) return null;

  return match[0] ?? null;
}

/** Whether a dotted version is at least MINIMUM_CLAUDE; anything else is not. */
function versionAtLeast(version) {
  const found = (version ?? "").split(".").map(Number);
  if (found.length !== MINIMUM_CLAUDE.length || found.some(Number.isNaN)) return false;
  for (let at = 0; at < MINIMUM_CLAUDE.length; at += 1) {
    // The length and NaN checks above make both defaults unreachable; they exist so the
    // checker can see it.
    const mine = MINIMUM_CLAUDE[at] ?? 0;
    const theirs = found[at] ?? 0;
    if (theirs !== mine) return theirs > mine;
  }

  return true;
}

/**
 * Every declaration the plugin-authoring skill has left behind on this machine.
 *
 * Its path is `<temp>/claude-<uid>/bundled-skills/<version>/<hash>/
 * plugin-authoring/types/claude-code.d.ts`, where the hash changes per session, so it
 * is found by walking rather than by naming. Each one's own first line names the
 * Claude Code that wrote it, which is the only thing that says whether it describes
 * the build being shipped for; the modification time is carried along so that when
 * several name the same build, the freshest is the one picked.
 */
function findDeclarations() {
  const roots = ["/tmp", tmpdir()];
  const found = [];
  const seen = new Set();
  for (const tempRoot of roots) {
    const claudeDirs = existsSync(tempRoot) ? readdirSync(tempRoot) : [];
    for (const claudeDir of claudeDirs.filter((name) => name.startsWith("claude-"))) {
      const skills = join(tempRoot, claudeDir, "bundled-skills");
      if (!existsSync(skills)) continue;
      for (const version of readdirSync(skills)) {
        const versionDir = join(skills, version);
        for (const hash of readdirSync(versionDir)) {
          const candidate = join(versionDir, hash, "plugin-authoring/types/claude-code.d.ts");
          if (!existsSync(candidate) || seen.has(candidate)) continue;
          seen.add(candidate);
          const wrote = readFileSync(candidate, "utf8").split("\n")[0]?.trim() ?? "";
          found.push({ path: candidate, wrote, version, mtimeMs: statSync(candidate).mtimeMs });
        }
      }
    }
  }

  return found;
}

/**
 * The declaration that names the running Claude Code, and every declaration found
 * beside it. The rejected ones are returned rather than dropped so a NOT TYPECHECKED
 * run can name what it saw instead of reading as an empty machine.
 */
function pickDeclaration(version) {
  const all = findDeclarations();
  const matching = all.filter((one) => one.wrote === `// Written by Claude Code ${version}.`);
  matching.sort((left, right) => right.mtimeMs - left.mtimeMs);

  return { picked: matching[0] ?? null, all };
}

const claude = output("claude", ["--version"]);
if (claude?.status !== 0) {
  console.error("The `claude` CLI is required to run the mod's tests and was not found on PATH.");
  process.exit(1);
}
const claudeVersion = versionIn(claude.stdout);
if (claudeVersion === null || !versionAtLeast(claudeVersion)) {
  console.error(`Mods need Claude Code ${MINIMUM_CLAUDE.join(".")} or later; this is ${claude.stdout}.`);
  process.exit(1);
}

const tsc = join(root, "node_modules", ".bin", "tsc");
if (!existsSync(tsc)) {
  console.error("TypeScript is not installed in this checkout; run `bun install` before the mod's typecheck.");
  process.exit(1);
}

// A missing shipped entry would make the stage a partial copy and `cp` would throw a
// bare ENOENT, so it is named here instead: a run that could not stage is a run that
// tested nothing, and it must say so rather than read as a stack trace.
const missing = SHIPPED.filter((entry) => !existsSync(join(root, entry)));
if (missing.length > 0) {
  console.error(`Shipped directories are absent from the checkout (${missing.join(", ")}); nothing was tested.`);
  process.exit(1);
}

// The stage is realpath'd: on macOS the temp root is a symlink (/tmp), and a path
// through it is a path the tools may treat as a different directory.
const staged = await realpath(await mkdtemp(join(tmpdir(), "lore-mod-")));
await cp(join(root, ".claude-plugin"), join(staged, ".claude-plugin"), { recursive: true });
for (const entry of SHIPPED) {
  await cp(join(root, entry), join(staged, entry), { recursive: true });
}
if (!existsSync(join(staged, "hooks", "register.tsx"))) {
  // A stage that did not copy is a run that tested nothing, and it would otherwise pass.
  console.error(`The stage at ${staged} has no hooks module; nothing was tested.`);
  process.exit(1);
}

let failed = false;
// Named in the closing line, so a run that skipped the typecheck cannot be read as one
// that passed it -- the difference between the two is invisible in an exit code, and an
// exit code is what CI reads.
let typecheck = "NOT RUN";
const step = (name, command, args) => {
  const status = run(command, args);
  if (status !== 0) {
    failed = true;
    console.error(`\n${name} failed with exit ${status}.`);
  }

  return status === 0;
};

console.log(`Claude Code: ${claude.stdout} (mods need ${MINIMUM_CLAUDE.join(".")}+)`);
console.log(`Staged: ${staged}\n`);
// --strict is the CI arm of the validator: it fails on the unrecognized fields and
// missing metadata the runtime merely tolerates.
step("claude plugin validate --strict", "claude", ["plugin", "validate", "--strict", staged]);
step("claude plugin test", "claude", ["plugin", "test", staged]);

const laid = join(staged, ".claude-plugin", "types", "tsconfig.json");
if (existsSync(laid)) {
  if (step(`tsc (${laid})`, tsc, ["-p", laid])) {
    typecheck = `clean, against the declaration the engine laid at ${laid}`;
  }
} else {
  const { picked, all } = pickDeclaration(claudeVersion);
  if (picked) {
    const config = join(staged, "tsconfig.check.json");
    await writeFile(
      config,
      `${JSON.stringify(
        {
          compilerOptions: COMPILER_OPTIONS,
          // The bundled declaration is a single file rather than the laid folder, so it
          // is named directly; the plugin's own three folders are what the declaration's
          // header names.
          include: [picked.path, "hooks", "types", "tests"],
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nDeclaration: ${picked.path}\n${picked.wrote}`);
    if (step("tsc", tsc, ["-p", config])) {
      typecheck = `clean, against the plugin-authoring skill's ${claudeVersion} declaration at ${picked.path}`;
    }
  } else {
    typecheck = `NOT TYPECHECKED -- no declaration names Claude Code ${claudeVersion}`;
    console.log(`\nNOT TYPECHECKED: no engine declaration naming Claude Code ${claudeVersion} is on this machine.`);
    if (all.length > 0) {
      console.log("Declarations exist, but each names a different build:");
      for (const one of all) {
        console.log(`  ${one.path} -- ${one.wrote === "" ? "no version line" : one.wrote}`);
      }
    }
    console.log(
      "Load the plugin in a session (a --plugin-dir or the mods folder) to have one laid beside it,\n" +
        "or load the plugin-authoring skill, which writes a declaration for this build into the temp directory.",
    );
  }
}

if (failed) {
  console.error(`\nThe stage is kept for inspection: ${staged}`);
  process.exit(1);
}
await rm(staged, { recursive: true, force: true });
console.log(`\nThe mod validates and its tests pass. Typecheck: ${typecheck}.`);
