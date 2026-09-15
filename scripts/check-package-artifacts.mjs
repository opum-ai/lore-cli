#!/usr/bin/env node
/**
 * check-package-artifacts.mjs — asserts that the platform packages ON DISK under `npm/` are exactly
 * the platform packages root `package.json` DECLARES in `optionalDependencies` (LCLI-513).
 *
 * THE DEFECT THIS EXISTS FOR, stated as the measurement rather than the lesson. On 2026-09-15 a
 * tracker-only pull request in quest-cli — one `.quest/` file — deleted an entire platform package:
 *
 *   npm/quest-darwin-arm64/LICENSE      |  21 -----
 *   npm/quest-darwin-arm64/bin/quest    | Bin 64634978 -> 0 bytes
 *   npm/quest-darwin-arm64/package.json |  21 -----
 *
 * Nothing in that session touched those files. They were merely ABSENT from the working tree when
 * `git add -A` ran, and `git add -A` stages a deletion for any tracked file that is missing. After
 * the commit the index matched the tree, so `git status` reported clean and `git diff HEAD -- npm/`
 * was empty. Every command anyone would reach for said nothing was wrong; the commit message and PR
 * body both said "tracker-only" and both were false. Their PR-time package check caught it.
 *
 * This repository had the same comparison — and ran it only in `release.yml`, which is
 * `workflow_dispatch` only. A platform package lost the same way here would pass every gate on the
 * PR, land on `dev`, and first be detected during a release dispatch, at the moment it is most
 * expensive and most likely to be misread as a release-machinery fault. `.gitignore` carries
 * `npm/<platform>/bin/`, so each directory holds ONE tracked file where quest's holds three; that is a
 * smaller blast radius, not a guard, and the same mechanism loses it just as silently.
 *
 * WHAT IS ASSERTED, one message per problem, every problem printed rather than the first:
 *
 *   1. root `package.json` declares a non-empty `optionalDependencies`, every key of which is
 *      `@opum-ai/lore-<platform>` — the shape `bin/lore.cjs` resolves by name;
 *   2. the set of directories under `npm/` equals that key set with the scope prefix removed, in
 *      BOTH directions: a declared package with no directory is a loss (the incident above), a
 *      directory with no declaration is an artifact nothing publishes;
 *   3. every `npm/<platform>/package.json` exists, parses, and carries the `name` its directory
 *      implies;
 *   4. every one of them carries an EXPLICIT `files` list whose CONTENT is exactly the one binary
 *      that platform ships: `["bin/lore.exe"]` when the os token before the first "-" is win32,
 *      `["bin/lore"]` otherwise — the same convention release.yml derives `binary` from. Presence
 *      alone is not enough: a darwin manifest declaring `["bin/lore.exe"]` packs to package.json
 *      and nothing else (measured with `npm pack --dry-run` during review), an empty platform
 *      package that only matching-host qualification would catch, mid-dispatch. Without any list,
 *      npm packs whatever the staging directory happens to contain — a discovered set, which
 *      changes membership in both directions without announcing it. An enumerated set does not.
 *      This is the declared-subject clause of the shipped-README contract arriving from the other
 *      direction (LCLI-510).
 *
 * Hidden DIRECTORIES under `npm/` count toward the set (`npm/.stale-darwin-x64/` is an extra
 * directory, not an exemption); hidden FILES are skipped, because `.DS_Store` on a macOS checkout
 * must not turn `check:packages` red.
 *
 * `--platforms "<names>"` adds a third declaration to the comparison: `release.yml`'s `setup` job
 * carries the build matrix as a literal, and it must name the same set. Passing it here is what
 * makes this ONE assertion invoked from two places (`ci.yml` on every pull request, `release.yml`
 * before any compile work) rather than two comparisons that can drift apart.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED. Per-platform `version`, `license`, `author`, `repository`,
 * `os`/`cpu` and the matrix entry's `binary` stay in `release.yml`'s `verify-versions` job, which
 * also holds the build matrix those checks are derived from. This script is the SET gate (and the
 * `files` content that defines each member); that job is the field gate.
 *
 * EXIT CODES
 *   0  every assertion held
 *   1  at least one assertion failed; every failure is printed, not just the first
 *   2  usage error, or the tree could not be evaluated (no root package.json, an unreadable root).
 *      "Could not evaluate" is never a pass: a missing `npm/` is reported as exit 1 because it is
 *      a finding about the tree (every declared package is missing), not an inability to look.
 *
 * `--root <dir>` points the check at a fixture tree so the tests can drive every branch without
 * restating the rule they are testing. It is the ONLY way to repoint the gate: an environment
 * fallback would silently redirect a call site nothing in a workflow or test names.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_PREFIX = "@opum-ai/lore-";

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function formatSet(names) {
  return `[${names.join(", ")}]`;
}

/**
 * Evaluate the tree rooted at `root`. Returns the list of problems (empty on a clean tree) and the
 * platform names that were declared, for the success line. Throws when the tree cannot be
 * evaluated at all — the caller turns that into exit 2, never into a pass.
 */
function checkPackageArtifacts(root, declaredPlatforms) {
  const problems = [];

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`${root} is not a directory, so there is no tree to check`);
  }

  const rootManifestPath = join(root, "package.json");
  let rootManifest;
  try {
    rootManifest = JSON.parse(readFileSync(rootManifestPath, "utf8"));
  } catch (error) {
    throw new Error(`could not read ${rootManifestPath}: ${messageOf(error)}`);
  }

  const optionalDependencies = rootManifest.optionalDependencies;
  if (
    optionalDependencies === null ||
    typeof optionalDependencies !== "object" ||
    Array.isArray(optionalDependencies)
  ) {
    problems.push(
      `${rootManifestPath}: optionalDependencies is ${JSON.stringify(optionalDependencies)}, so no platform package set is declared at all`,
    );
    return { problems, platforms: [] };
  }

  const declaredPackages = Object.keys(optionalDependencies).sort();
  if (declaredPackages.length === 0) {
    problems.push(`${rootManifestPath}: optionalDependencies is empty, so no platform package set is declared at all`);
    return { problems, platforms: [] };
  }

  const expectedPlatforms = [];
  for (const name of declaredPackages) {
    if (!name.startsWith(SCOPE_PREFIX) || name.length === SCOPE_PREFIX.length) {
      problems.push(
        `${rootManifestPath}: optionalDependencies key "${name}" is not of the form ${SCOPE_PREFIX}<platform>, so no npm/<platform>/ directory can correspond to it`,
      );
      continue;
    }
    expectedPlatforms.push(name.slice(SCOPE_PREFIX.length));
  }

  // The release matrix is a THIRD declaration of the set (see the docblock). Compare it to the
  // package.json one with the same wording release.yml used when this comparison lived inline,
  // so a release operator reading the log sees the sentence they already know.
  if (declaredPlatforms !== null) {
    const matrixPackages = declaredPlatforms.map((name) => `${SCOPE_PREFIX}${name}`).sort();
    if (JSON.stringify(matrixPackages) !== JSON.stringify(declaredPackages)) {
      problems.push(
        `platform set mismatch: setup job declares ${formatSet(matrixPackages)}, but root package.json optionalDependencies has ${formatSet(declaredPackages)}`,
      );
    }
  }

  const npmDir = join(root, "npm");
  const actualPlatforms = [];
  if (!existsSync(npmDir) || !statSync(npmDir).isDirectory()) {
    problems.push(
      `${npmDir} does not exist, so EVERY declared platform package is missing from the tree: ${formatSet(declaredPackages)}`,
    );
  } else {
    for (const entry of readdirSync(npmDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        problems.push(`${join(npmDir, entry.name)} is not a directory; npm/ holds only platform package directories`);
        continue;
      }
      actualPlatforms.push(entry.name);
    }
  }
  actualPlatforms.sort();

  const actualSet = new Set(actualPlatforms);
  const expectedSet = new Set(expectedPlatforms);
  for (const platform of expectedPlatforms) {
    if (!actualSet.has(platform)) {
      problems.push(
        `platform set mismatch: root package.json optionalDependencies declares ${SCOPE_PREFIX}${platform}, but npm/${platform}/ is missing (npm/ holds ${formatSet(actualPlatforms)})`,
      );
    }
  }
  for (const platform of actualPlatforms) {
    if (!expectedSet.has(platform)) {
      problems.push(
        `platform set mismatch: npm/${platform}/ exists, but root package.json optionalDependencies declares no ${SCOPE_PREFIX}${platform} (declared: ${formatSet(declaredPackages)})`,
      );
    }
  }

  for (const platform of expectedPlatforms) {
    if (!actualSet.has(platform)) continue;
    const manifestPath = join(npmDir, platform, "package.json");
    if (!existsSync(manifestPath)) {
      problems.push(`${manifestPath} is missing; the directory exists but nothing in it can be published`);
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      problems.push(`${manifestPath} does not parse: ${messageOf(error)}`);
      continue;
    }
    const expectedName = `${SCOPE_PREFIX}${platform}`;
    if (manifest.name !== expectedName) {
      problems.push(
        `${manifestPath}: name is ${JSON.stringify(manifest.name)}, expected "${expectedName}" (from its directory)`,
      );
    }
    const files = manifest.files;
    if (!Array.isArray(files)) {
      problems.push(
        `${manifestPath}: has no explicit "files" list (found ${JSON.stringify(files)}); without one npm packs whatever the staging directory contains, a discovered set rather than a declared one`,
      );
    } else if (files.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
      problems.push(`${manifestPath}: "files" must be a list of non-empty strings, found ${JSON.stringify(files)}`);
    } else {
      // The os token is the segment before the first "-", already in npm's spelling ("win32",
      // not "windows"); release.yml's verify-versions derives the matrix `binary` the same way.
      const expectedFiles = [platform.slice(0, platform.indexOf("-")) === "win32" ? "bin/lore.exe" : "bin/lore"];
      if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
        problems.push(
          `${manifestPath}: "files" is ${JSON.stringify(files)}, expected exactly ${JSON.stringify(expectedFiles)} (the one binary ${platform} ships); any other list packs a package that installs without its binary or ships something no host qualified`,
        );
      }
    }
  }

  return { problems, platforms: expectedPlatforms };
}

function parseArgs(argv) {
  const options = { root: REPO_ROOT, platforms: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[++i] ?? "";
      if (!value) throw new Error("--root needs a directory");
      options.root = resolve(value);
    } else if (arg === "--platforms") {
      // Space-separated because release.yml's setup job already emits the matrix names that way
      // (`namesSpace`). An empty value is a declaration of NO platforms, which is a finding, not
      // a usage error — the release would otherwise build nothing and say so only at pack time.
      if (i + 1 >= argv.length) throw new Error("--platforms needs a space-separated list of platform names");
      options.platforms = argv[++i]
        .split(/\s+/)
        .map((name) => name.trim())
        .filter((name) => name !== "");
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${messageOf(error)}`);
    console.error('usage: node scripts/check-package-artifacts.mjs [--root <dir>] [--platforms "<name> <name> ..."]');
    return 2;
  }

  let result;
  try {
    result = checkPackageArtifacts(options.root, options.platforms);
  } catch (error) {
    console.error(
      `::error::the platform package set could not be evaluated — nothing was checked, and this is not a pass: ${messageOf(error)}`,
    );
    return 2;
  }

  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(`::error::${problem}`);
    console.error(
      `${result.problems.length} platform package problem(s) under ${options.root}. If a directory under npm/ is missing and nothing in your change touched it, look at how it was staged: \`git add -A\` stages a deletion for any tracked file merely absent from the tree.`,
    );
    return 1;
  }

  console.log(
    `npm/ holds exactly the ${result.platforms.length} platform packages root package.json declares (${formatSet(result.platforms)}) under ${options.root}, each listing exactly its own binary in files`,
  );
  return 0;
}

process.exit(main());
