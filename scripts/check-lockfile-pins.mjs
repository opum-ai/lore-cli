#!/usr/bin/env node
/**
 * check-lockfile-pins.mjs — asserts that the platform-package pins recorded in `bun.lock` agree
 * with root `package.json`'s `optionalDependencies` (LCLI-544).
 *
 * THE DEFECT THIS EXISTS FOR, as the measurement rather than the lesson. (The 0.8.0 numbers are
 * the LCLI-544 record's measurement, taken when the incident was fresh; what this change measured
 * itself — the same shape reproduced deliberately, locally and in CI — is in the LCLI-544 record
 * and PR #431.) During the 0.8.0 release (2026-09-19) the bump moved root `package.json` and the
 * six `npm/<platform>/package.json` manifests to 0.8.0 and left `bun.lock` resolving the platform
 * packages at 0.7.0. PR #180 (the bump) was green, and so was #181's promotion push run — #181's PR
 * rollup also carries the deliberate `promotion is manual` failure this repository puts on every PR
 * into `main`, which is not a red anyone acted on (see CLAUDE.md's repo profile on the two runs a
 * landing SHA carries). Publishing made 0.8.0 resolvable, and the SAME UNCHANGED LOCKFILE became
 * stale the instant the registry could answer: every job that runs a frozen install then failed in
 * `setup-bun` with `error: lockfile had changes, but lockfile is frozen` — read 2026-09-29, that is
 * nine of ci.yml's twelve jobs, four of them jobs the `dev` ruleset requires (`lint · typecheck ·
 * test` on both OSes, `lore check (docs gate)`, `compile smoke (ubuntu)`) — on `dev` and on every
 * open pull request at once, with no source change between the green run and the red, and no test
 * output to read. `lore-cli` had shipped the same shape once before, at 0.3.5 (LCLI-369).
 *
 * WHY NO EXISTING GATE CATCHES IT, which is the half that decides where this file lives.
 * `release.yml`'s `verify-versions` job compares the declared version across `package.json`, the
 * six `npm/<platform>/package.json` manifests, `.claude-plugin/plugin.json` and the `optionalDependencies` pins — all of
 * them FILES, internally consistent, all correct. `bun.lock` is the one version site whose
 * agreement is decided by `bun install --frozen-lockfile`, and a check that would catch a stale
 * lockfile by RESOLVING the dependency cannot run before the publish: at bump time the new platform
 * versions do not exist on the registry, so bun resolves nothing, leaves the lockfile alone, and
 * the frozen check compares two things that still agree. It passes on a lockfile that is already
 * wrong; the publish is what arms it. A pure FILE comparison has no such ordering problem, which is
 * why this script is one — and why it runs on every pull request rather than only at dispatch.
 *
 * WHAT IS ASSERTED, one message per problem, every problem printed rather than the first:
 *
 *   1. `bun.lock` carries a root workspace entry (`workspaces[""]`) holding an
 *      `optionalDependencies` object — the block bun mirrors from the manifest;
 *   2. its key set equals root `package.json`'s `optionalDependencies` key set, in BOTH directions:
 *      a declared platform the lockfile does not record, and a platform it records that the
 *      manifest does not declare;
 *   3. every pin's VALUE equals the manifest's pin for the same package;
 *   4. any `@opum-ai/lore-*` entry under the lockfile's `packages` map carries the same version.
 *      No such entry exists on today's tree — bun records no resolved entry for an optional
 *      dependency it did not install — so this clause is "if present, it must agree", and the
 *      success line reports how many entries it read. A `packages` key that is present but not a map
 *      is a finding, and an absent one is named in the success line rather than counted as zero:
 *      "none found" and "nothing was read" are different facts and must not share a sentence.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED. The manifest's own pins against the manifest's own `version`
 * field. That assertion belongs to `release.yml`'s `verify-versions` job ("Assert version, license,
 * author, repository, os/cpu, binary filename, and the optionalDependencies pin all match") and it
 * cannot run on a pull request, because `release.yml` is `workflow_dispatch` only. The composite
 * property — the lockfile agrees with the version being released — is those two checks together,
 * and each half names the other rather than restating it. This script's subject is the LOCKFILE's
 * agreement with the manifest, and nothing else.
 *
 * READING THE LOCKFILE. `bun.lock` is JSONC: bun writes trailing commas. The only non-JSON feature
 * handled here is exactly that — a comma whose next non-whitespace character is `}` or `]`, outside
 * a string — because that is the only one bun writes. Comments are NOT handled, so a lockfile that
 * still fails to parse after the strip is reported as a FINDING (exit 1) rather than a pass: a file
 * this check could not read is a file it did not clear. The SHAPE is checked too, not only the
 * parse — a `bun.lock` parsing to `null` (or to any other non-object) is a finding, because a
 * sentinel that doubles as a parsed value lets such a file fall through every read below and exit 0
 * with a success line claiming the pins were compared (found in review, 2026-09-29).
 *
 * EXIT CODES
 *   0  every assertion held
 *   1  at least one finding: a mismatch, a missing or unparseable `bun.lock`, or a manifest whose
 *      `optionalDependencies` holds no `@opum-ai/lore-*` pin to compare. Every finding is printed.
 *   2  usage error, or the tree could not be evaluated (no root `package.json`, an unreadable
 *      root). "Could not evaluate" is never a pass: it says nothing was checked.
 *
 * `--root <dir>` points the check at a fixture tree so the tests can drive every branch without
 * restating the rule they are testing — the same convention `check-package-artifacts.mjs` uses. It
 * is the ONLY way to repoint the gate: an environment fallback would silently redirect a call site
 * that nothing in a workflow or a test names.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIN_PREFIX = "@opum-ai/lore-";

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Remove the trailing commas bun writes, and nothing else. Scans outside strings so a comma inside
 * an integrity hash or a URL survives; a comma whose next non-whitespace character is `}` or `]` is
 * dropped. Deliberately NOT a general JSONC reader — see the docblock for why an unreadable
 * lockfile is reported rather than tolerated.
 */
function stripTrailingCommas(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === ",") {
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next++;
      if (text[next] === "}" || text[next] === "]") continue;
    }
    out += char;
  }
  return out;
}

/** `"@opum-ai/lore-darwin-arm64@0.11.0"` → `"0.11.0"`, or null when the tuple is not that shape. */
function resolvedVersionOf(entry) {
  if (!Array.isArray(entry) || typeof entry[0] !== "string") return null;
  const at = entry[0].lastIndexOf("@");
  if (at <= 0 || at === entry[0].length - 1) return null;
  return entry[0].slice(at + 1);
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The pinned Bun, named in the remedy at the point of failure where it is readable. */
function pinnedBunVersion(root) {
  try {
    return readFileSync(join(root, ".bun-version"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Evaluate the tree rooted at `root`. Returns the findings (empty on a clean tree) plus what was
 * actually read, for the success line. Throws when the tree cannot be evaluated at all — the caller
 * turns that into exit 2, never into a pass.
 */
function checkLockfilePins(root) {
  const problems = [];

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`${root} is not a directory, so there is no tree to check`);
  }

  const manifestPath = join(root, "package.json");
  let manifest;
  try {
    manifest = readJsonFile(manifestPath);
  } catch (error) {
    throw new Error(`could not read ${manifestPath}: ${messageOf(error)}`);
  }

  const declared = manifest.optionalDependencies;
  const manifestPins = {};
  if (declared === null || typeof declared !== "object" || Array.isArray(declared)) {
    problems.push(
      `${manifestPath}: optionalDependencies is ${JSON.stringify(declared)}, so no platform pins are declared and the lockfile has been compared against nothing`,
    );
  } else {
    for (const [name, version] of Object.entries(declared)) {
      if (name.startsWith(PIN_PREFIX)) manifestPins[name] = version;
    }
    if (Object.keys(manifestPins).length === 0) {
      problems.push(
        `${manifestPath}: optionalDependencies holds no ${PIN_PREFIX}* pin, so no platform package was compared — an empty comparison is not a clean one`,
      );
    }
  }

  const lockPath = join(root, "bun.lock");
  let lock = null;
  if (!existsSync(lockPath)) {
    problems.push(
      `${lockPath} does not exist, so nothing about its platform pins was compared. Regenerate it with the pinned Bun and commit it with the same change that moved package.json.`,
    );
  } else {
    let parsed;
    let parsedOk = false;
    try {
      parsed = JSON.parse(stripTrailingCommas(readFileSync(lockPath, "utf8")));
      parsedOk = true;
    } catch (error) {
      problems.push(
        `${lockPath} does not parse as JSON after trailing-comma stripping: ${messageOf(error)}. Nothing about its pins was compared, and a lockfile this check cannot read is not a lockfile it cleared.`,
      );
    }
    // The SHAPE is checked as well as the parse: a lockfile parsing to `null` (or any other
    // non-object) would otherwise fall through every read below and exit 0 while the success line
    // claimed six pins compared. A sentinel that doubles as a parsed value is how that happens.
    if (parsedOk) {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        problems.push(
          `${lockPath} parses to ${JSON.stringify(parsed)}, not an object, so nothing about its pins was compared — a lockfile this check could not read is not a lockfile it cleared`,
        );
      } else {
        lock = parsed;
      }
    }
  }

  let resolvedCount = 0;
  let packagesMapRead = false;
  if (lock !== null) {
    const locked = lock.workspaces?.[""]?.optionalDependencies;
    if (locked === null || typeof locked !== "object" || Array.isArray(locked)) {
      problems.push(
        `${lockPath}: workspaces[""].optionalDependencies is ${JSON.stringify(locked)}, so the lockfile records no platform pins at all — nothing was compared against ${manifestPath}`,
      );
    } else {
      const manifestNames = Object.keys(manifestPins);
      for (const name of manifestNames) {
        if (!(name in locked)) {
          problems.push(
            `${lockPath}: records no optionalDependencies pin for ${name}, which ${manifestPath} pins at ${manifestPins[name]}`,
          );
        } else if (locked[name] !== manifestPins[name]) {
          problems.push(
            `${lockPath}: pins ${name} at ${locked[name]}, but ${manifestPath} pins it at ${manifestPins[name]}. This is the stale-lockfile defect: \`bun install --frozen-lockfile\` passes while the new version is unpublished and unresolvable, then fails in setup-bun in EVERY CI job the moment publishing makes it resolvable.`,
          );
        }
      }
      for (const name of Object.keys(locked)) {
        if (!manifestNames.includes(name)) {
          problems.push(
            `${lockPath}: pins ${name}, which ${manifestPath}'s optionalDependencies does not declare (declared: ${manifestNames.length > 0 ? manifestNames.join(", ") : "none"})`,
          );
        }
      }
    }

    // Clause 4 reads only when there IS a readable map. Both other shapes are said out loud rather
    // than skipped: a malformed map is a finding, and an absent one is named in the success line, so
    // "no resolved entry" can never be printed for a map that was never read.
    const packages = lock.packages;
    if (packages === undefined) {
      packagesMapRead = false;
    } else if (packages === null || typeof packages !== "object" || Array.isArray(packages)) {
      problems.push(
        `${lockPath}: "packages" is ${JSON.stringify(packages)}, which this check cannot read as a map, so no resolved entry was compared`,
      );
    } else {
      packagesMapRead = true;
      for (const [name, entry] of Object.entries(packages)) {
        if (!name.startsWith(PIN_PREFIX)) continue;
        resolvedCount++;
        const resolved = resolvedVersionOf(entry);
        const expected = manifestPins[name] ?? manifest.version;
        if (resolved === null) {
          problems.push(
            `${lockPath}: the resolved entry for ${name} is not a \`name@version\` tuple this check can read (${JSON.stringify(entry?.[0] ?? null)}), so its version was not compared`,
          );
        } else if (typeof expected === "string" && resolved !== expected) {
          problems.push(`${lockPath}: resolves ${name} at ${resolved}, but ${manifestPath} pins it at ${expected}`);
        }
      }
    }
  }

  const pinVersions = [...new Set(Object.values(manifestPins))];
  return {
    problems,
    comparedPins: Object.keys(manifestPins).length,
    comparedVersion: pinVersions.length === 1 ? pinVersions[0] : pinVersions.join(", "),
    resolvedCount,
    packagesMapRead,
  };
}

function parseArgs(argv) {
  const options = { root: REPO_ROOT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[++i] ?? "";
      if (!value) throw new Error("--root needs a directory");
      options.root = resolve(value);
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
    console.error("usage: node scripts/check-lockfile-pins.mjs [--root <dir>]");
    return 2;
  }

  let result;
  try {
    result = checkLockfilePins(options.root);
  } catch (error) {
    console.error(
      `::error::the lockfile pins could not be evaluated — nothing was checked, and this is not a pass: ${messageOf(error)}`,
    );
    return 2;
  }

  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(`::error::${problem}`);
    const pinned = pinnedBunVersion(options.root);
    console.error(
      `${result.problems.length} lockfile pin problem(s) under ${options.root}. If a bump moved package.json and bun.lock was not regenerated, run \`bun install\` from a checkout of that commit with the Bun pinned in .bun-version${pinned === null ? "" : ` (${pinned})`}, then commit bun.lock with the bump.`,
    );
    return 1;
  }

  console.log(
    `bun.lock agrees with package.json under ${options.root}: ${result.comparedPins} platform pin(s) compared, all at ${result.comparedVersion}; ${
      result.packagesMapRead
        ? `${result.resolvedCount} resolved ${PIN_PREFIX}* entr(ies) under packages`
        : "no packages map recorded, so no resolved entry was read"
    }`,
  );
  return 0;
}

process.exit(main());
