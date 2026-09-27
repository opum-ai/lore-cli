// Moves `latest` to a staged lore release, as a separate, recorded, reversible
// step (LCLI-613, constitution Article 3 clause 5).
//
// scripts/publish-release.sh STAGES a release under the release-candidate
// dist-tag and leaves `latest` where it was. opum-cli-e2e then qualifies the
// staged lore/quest pair from clean registry installs and lands
// receipts/pair/<version>.json, and only after that does `latest` move --
// Quest first, then Lore, on opum-agent's go. This script is lore's move.
//
// THE MIRROR OF quest-cli's scripts/promote-release.mjs (QCLI-385,
// opum-ai/quest-cli#306, commit 654274ab) and its pair-receipt gate (QCLI-388,
// #307, commit 1b6edff9), read unchanged at quest-cli main eb1d9f46. Same record,
// same order of checks, same rollback. Where it differs:
//   - Every registry and GitHub call goes through one injectable runner
//     (`run`), dist-tag READS included, so a test drives the whole script with
//     no network. quest reads dist-tags with an anonymous fetch(); this reads
//     them with `npm view <pkg> dist-tags --json --prefer-online`.
//   - It takes `--dry-run` or `--promote` explicitly; neither is a default.
//   - Auth is publish-release.sh's (Keychain npm-opum-ai-publish, then
//     NPM_TOKEN, into a private temp npmrc; else ~/.npmrc with an optional
//     --otp), with the same token-shape refusal.
//
// Registry publication is irreversible, so a failed promotion is never
// repaired by unpublishing. What rolls back is the dist-tags: every prior
// `latest` is written to a record file BEFORE any tag moves, a failure part
// way through restores the tags this run already moved, and `--rollback
// <record>` restores all of them later (for instance when this side's move
// fails after quest's succeeded, or quest's must be undone). The record is
// written once and reused on a rerun, never re-read from the registry: after a
// partial move the registry's current `latest` is the NEW version, and
// recording that as the prior value would make the rollback a no-op.
//
// Refuses unless opum-cli-e2e's pair receipt for this version verifies
// (scripts/pair-receipt.mjs). --rollback is deliberately not gated on it:
// restoring prior tags must always be possible.
//
// Usage:
//   node scripts/promote-latest.mjs --record <path> --dry-run     # read and report only
//   node scripts/promote-latest.mjs --record <path> --promote     # move latest
//   node scripts/promote-latest.mjs --rollback <path>             # restore it
// Optional: --version <v> (default: this checkout's package.json), --otp <code>.

import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  describeOverride,
  fetchPairReceipt,
  observeRelease,
  RELEASE_PACKAGES,
  requirePairQualification,
} from "./pair-receipt.mjs";

const execFileAsync = promisify(execFileCallback);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const STAGE_TAG = "release-candidate";
export const PROMOTE_TAG = "latest";
export const RECORD_KIND = "lore.promotion-record.v1";
export const KEYCHAIN_SERVICE = "npm-opum-ai-publish";

/** The one process runner. Tests replace it; nothing below spawns anything else. */
export const defaultRun = (command, args, options = {}) =>
  execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024, ...options });

/**
 * The one argv a `latest` (or rollback) move is made with.
 * @param {string} name @param {string} target @param {string} tag
 * @param {{ otp?: string }} [options]
 */
export function distTagAddArgs(name, target, tag, { otp } = {}) {
  return ["dist-tag", "add", `${name}@${target}`, tag, ...(otp ? ["--otp", otp] : [])];
}

/**
 * One package's dist-tags. Throws on anything but an object: an unreadable
 * tag set is not an empty one. npm 12 wraps the answer in a one-element array.
 */
export async function readDistTags(name, { run = defaultRun } = {}) {
  const { stdout } = await run("npm", ["view", name, "dist-tags", "--json", "--prefer-online"]);
  const parsed = JSON.parse(stdout);
  const tags = Array.isArray(parsed) ? (parsed.length === 1 ? parsed[0] : null) : parsed;
  if (!tags || typeof tags !== "object" || Array.isArray(tags))
    throw new Error(`npm view ${name} dist-tags did not return a dist-tag object`);
  return tags;
}

/** @param {unknown} error */
const reason = (error) => (error instanceof Error ? error.message : String(error));

/** @typedef {{ name: string, priorLatest: string | null }} RecordEntry */
/** @typedef {{ schemaVersion: 1, kind: string, version: string, recordedAt: string, packages: RecordEntry[] }} PromotionRecord */
/** @typedef {(name: string, target: string, tag: string) => Promise<unknown>} SetTag */

/**
 * Reads every package's tags and builds the record, or says why not. Refuses
 * unless the version is staged under release-candidate on ALL of them: moving
 * `latest` on a subset would pair a qualified launcher with a platform package
 * nobody staged.
 */
export async function planPromotion({
  version,
  packages = RELEASE_PACKAGES,
  readTags = (name) => readDistTags(name),
  now = () => new Date(),
  resuming = false,
}) {
  /** @type {string[]} */
  const problems = [];
  const entries = [];
  for (const name of packages) {
    let tags;
    try {
      tags = await readTags(name);
    } catch (error) {
      problems.push(`${name}: dist-tags unreadable (${reason(error)})`);
      continue;
    }
    if (tags[STAGE_TAG] !== version)
      problems.push(
        `${name}: ${STAGE_TAG} is ${JSON.stringify(tags[STAGE_TAG] ?? null)}, not ${version}; stage it with scripts/publish-release.sh first`,
      );
    if (typeof tags[PROMOTE_TAG] !== "string")
      problems.push(`${name}: has no ${PROMOTE_TAG} to record as the prior value`);
    else if (tags[PROMOTE_TAG] === version && !resuming)
      // Only a lost record reaches here: a fresh record would name the new
      // version as the prior one, and a rollback from it would restore nothing.
      problems.push(
        `${name}: ${PROMOTE_TAG} already reads ${version}; a new record would store that as the prior value -- pass the record written by the first run`,
      );
    entries.push({ name, priorLatest: tags[PROMOTE_TAG] ?? null });
  }
  if (problems.length) return /** @type {{ ok: false, problems: string[] }} */ ({ ok: false, problems });
  return /** @type {{ ok: true, record: PromotionRecord }} */ ({
    ok: true,
    record: { schemaVersion: 1, kind: RECORD_KIND, version, recordedAt: now().toISOString(), packages: entries },
  });
}

/**
 * Rejects a record that is not one this script wrote for this release.
 * @param {any} record
 * @param {{ version?: string, packages?: readonly string[] }} [options]
 */
export function validateRecord(record, { version, packages = RELEASE_PACKAGES } = {}) {
  const problems = [];
  if (record?.kind !== RECORD_KIND) problems.push(`record kind is ${JSON.stringify(record?.kind)}, not ${RECORD_KIND}`);
  if (version !== undefined && record?.version !== version)
    problems.push(`record is for ${JSON.stringify(record?.version)}, the release is ${version}`);
  const names = (record?.packages ?? []).map((entry) => entry?.name);
  if (JSON.stringify(names) !== JSON.stringify(packages))
    problems.push(`record names ${JSON.stringify(names)}, expected ${JSON.stringify(packages)}`);
  for (const entry of record?.packages ?? [])
    if (typeof entry?.priorLatest !== "string") problems.push(`record has no prior ${PROMOTE_TAG} for ${entry?.name}`);
  return { ok: problems.length === 0, problems };
}

/**
 * Moves `latest` to the version, in record order (platforms first, launcher
 * last). On the first failure it restores every tag it already moved to the
 * recorded prior value and stops.
 * @param {{ record: PromotionRecord, setTag: SetTag, log?: (line: string) => void }} args
 * @returns {Promise<{ ok: true, moved: string[] } | { ok: false, moved: string[], failed: string, restored: { ok: boolean, failed: string[] } }>}
 */
export async function promote({ record, setTag, log = () => {} }) {
  const moved = [];
  for (const { name } of record.packages) {
    try {
      await setTag(name, record.version, PROMOTE_TAG);
      moved.push(name);
      log(`${name}: ${PROMOTE_TAG} -> ${record.version}`);
    } catch (error) {
      log(`${name}: FAILED to move ${PROMOTE_TAG} (${reason(error)})`);
      const restored = await rollback({
        record: { ...record, packages: record.packages.filter((entry) => moved.includes(entry.name)) },
        setTag,
        log,
      });
      return { ok: false, moved, failed: name, restored };
    }
  }
  return { ok: true, moved };
}

/**
 * Restores every package's `latest` to its recorded prior value, past individual failures.
 * @param {{ record: PromotionRecord, setTag: SetTag, log?: (line: string) => void }} args
 */
export async function rollback({ record, setTag, log = () => {} }) {
  /** @type {string[]} */
  const failed = [];
  for (const { name, priorLatest } of record.packages) {
    try {
      // A string by construction: planPromotion and validateRecord both refuse a record without one.
      await setTag(name, /** @type {string} */ (priorLatest), PROMOTE_TAG);
      log(`${name}: ${PROMOTE_TAG} restored to ${priorLatest}`);
    } catch (error) {
      failed.push(name);
      log(`${name}: FAILED to restore ${PROMOTE_TAG} to ${priorLatest} (${reason(error)})`);
    }
  }
  return { ok: failed.length === 0, failed };
}

/**
 * Confirms the registry now serves the expected `latest` for every package. A
 * tag write returning success is not the registry serving it, so this re-reads,
 * with a bounded wait for the read to catch up.
 */
export async function verifyTags({
  expected,
  readTags = (name) => readDistTags(name),
  attempts = 10,
  delayMs = 15_000,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  let wrong = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    wrong = [];
    for (const [name, value] of Object.entries(expected)) {
      const tags = await readTags(name).catch(() => ({}));
      if (tags[PROMOTE_TAG] !== value)
        wrong.push(`${name}: ${PROMOTE_TAG} reads ${JSON.stringify(tags[PROMOTE_TAG] ?? null)}, expected ${value}`);
    }
    if (!wrong.length) return { ok: true, attempts: attempt, wrong };
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ok: false, attempts, wrong };
}

/** Length, prefix and a whitespace flag: the only things ever reported about a credential. */
export function tokenShape(token) {
  return {
    length: token.length,
    prefix: token.startsWith("npm_") ? "npm_" : "OTHER",
    whitespace: /\s/.test(token),
  };
}

/** publish-release.sh's credential order: Keychain, then NPM_TOKEN, else ~/.npmrc. */
export async function resolveToken({ run = defaultRun, env = process.env } = {}) {
  try {
    const { stdout } = await run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"]);
    const token = stdout.replace(/\n$/, "");
    if (token) return { token, source: `keychain:${KEYCHAIN_SERVICE}` };
  } catch {
    // No Keychain entry, or no `security` at all: fall through.
  }
  if (env.NPM_TOKEN) return { token: env.NPM_TOKEN, source: "NPM_TOKEN" };
  return { token: null, source: "~/.npmrc" };
}

function parseArgs(argv) {
  const flag = (name) => {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
    return value;
  };
  const known = new Set(["--record", "--rollback", "--otp", "--version", "--dry-run", "--promote"]);
  for (let i = 0; i < argv.length; i++) {
    if (!known.has(argv[i])) throw new Error(`unknown argument: ${argv[i]}`);
    if (!["--dry-run", "--promote"].includes(argv[i])) i++;
  }
  return {
    rollbackPath: flag("--rollback"),
    recordPath: flag("--record"),
    otp: flag("--otp"),
    version: flag("--version"),
    dryRun: argv.includes("--dry-run"),
    promoteRequested: argv.includes("--promote"),
  };
}

/**
 * The whole command. Returns an exit code rather than calling process.exit, so
 * a test can drive it with a stubbed runner and captured output.
 */
export async function main(
  argv,
  {
    run = defaultRun,
    env = process.env,
    out = (line) => console.log(line),
    err = (line) => console.error(line),
    readPackageVersion = async () => JSON.parse(await readFile(join(root, "package.json"), "utf8")).version,
    verifyOptions = {},
  } = {},
) {
  const args = parseArgs(argv);
  if (args.rollbackPath && (args.dryRun || args.promoteRequested || args.recordPath))
    throw new Error("--rollback <record> stands alone: it restores the prior latest values that record names");
  if (!args.rollbackPath) {
    if (!args.recordPath)
      throw new Error(
        "--record <path> is required: it is where every prior latest is written before any tag moves, and what --rollback reads",
      );
    if (args.dryRun === args.promoteRequested)
      throw new Error("say --dry-run (read and report, change nothing) or --promote (move latest); exactly one");
  }
  const readTags = (name) => readDistTags(name, { run });

  let record;
  if (args.rollbackPath) {
    record = JSON.parse(await readFile(args.rollbackPath, "utf8"));
    const valid = validateRecord(record);
    if (!valid.ok) {
      err(`Refusing to roll back from ${args.rollbackPath}:`);
      for (const problem of valid.problems) err(`  - ${problem}`);
      return 1;
    }
  } else {
    const version = args.version ?? (await readPackageVersion());
    out(`Promoting @opum-ai/lore ${version}${args.version ? " (--version)" : " (this checkout's package.json)"}.`);
    const existing = await readFile(args.recordPath, "utf8").catch(() => null);
    if (existing) {
      record = JSON.parse(existing);
      const valid = validateRecord(record, { version });
      if (!valid.ok) {
        err(`Refusing to reuse ${args.recordPath}:`);
        for (const problem of valid.problems) err(`  - ${problem}`);
        return 1;
      }
      out(`Reusing the record at ${args.recordPath} (written ${record.recordedAt}); prior values are NOT re-read.`);
    }
    // The staging precondition is checked on every run, a reused record
    // included: it is a fact about the registry now, not about the record.
    const plan = await planPromotion({ version, readTags, resuming: Boolean(existing) });
    if (!plan.ok) {
      err(`Refusing to promote ${version}:`);
      for (const problem of plan.problems) err(`  - ${problem}`);
      return 1;
    }
    record ??= plan.record;
    out(`${version} is staged under ${STAGE_TAG} on all ${record.packages.length} packages. Prior ${PROMOTE_TAG}:`);
    for (const entry of record.packages) out(`  ${entry.name}  ${entry.priorLatest}`);

    // opum-cli-e2e's verdict on the STAGED pair, read here rather than
    // relayed. Dry runs too, so a dry run answers "would this promote".
    const pair = await requirePairQualification({ version, packages: RELEASE_PACKAGES, ...pairIo(run) });
    if (!pair.ok) {
      err(
        `Refusing to promote ${version}: no opum-cli-e2e pair receipt qualifies the staged pair as it resolves now (Article 3 clause 5).`,
      );
      err(`  receipt: ${pair.source}`);
      for (const problem of pair.problems) err(`  - ${problem}`);
      return 1;
    }
    if (pair.override) out(describeOverride(pair.override, pair.source));
    out(
      `Pair receipt ${pair.source} qualifies lore ${version} with quest ${version}, and all ${RELEASE_PACKAGES.length} tarballs npm serves match it.`,
    );
    if (args.dryRun) {
      out(`\nThe record --promote would write to ${args.recordPath} before moving anything:`);
      out(JSON.stringify(record, null, 2));
      for (const entry of record.packages)
        out(
          `  would    npm ${distTagAddArgs(entry.name, version, PROMOTE_TAG).join(" ")}   (now ${entry.priorLatest})`,
        );
      out(`\nDry run only: nothing was written and no tag moved. Re-run with --promote to move ${PROMOTE_TAG}.`);
      return 0;
    }
    if (!existing) {
      await writeFile(args.recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
      out(`Recorded every prior ${PROMOTE_TAG} to ${args.recordPath} before moving anything.`);
    }
  }

  const { token, source } = await resolveToken({ run, env });
  let npmrcDir;
  const npmEnv = { ...env };
  if (token) {
    const shape = tokenShape(token);
    out(
      `Auth: ${source}; token shape: length=${shape.length} prefix=${shape.prefix} internal_whitespace=${shape.whitespace ? "yes" : "no"}.`,
    );
    if (shape.whitespace || shape.prefix !== "npm_")
      throw new Error(`Refusing: the credential from ${source} does not look like an npm token. Nothing has moved.`);
    npmrcDir = await mkdtemp(join(tmpdir(), "lore-promote-npmrc-"));
    const npmrc = join(npmrcDir, ".npmrc");
    await writeFile(npmrc, `//registry.npmjs.org/:_authToken=${token}\n`, { mode: 0o600 });
    await chmod(npmrc, 0o600);
    npmEnv.npm_config_userconfig = npmrc;
  } else {
    out(
      "Auth: no Keychain or NPM_TOKEN credential -- using ~/.npmrc. A web-login session asks for an OTP; pass --otp.",
    );
  }
  const setTag = (name, target, tag) =>
    run("npm", distTagAddArgs(name, target, tag, { otp: token ? undefined : args.otp }), { env: npmEnv });

  try {
    const log = (line) => out(`  ${line}`);
    if (args.rollbackPath) {
      out(`Restoring ${PROMOTE_TAG} from ${args.rollbackPath} (release ${record.version}):`);
      const outcome = await rollback({ record, setTag, log });
      if (!outcome.ok) {
        err(`NOT restored: ${outcome.failed.join(", ")}. Re-run --rollback; it is idempotent.`);
        return 1;
      }
      const check = await verifyTags({
        expected: Object.fromEntries(record.packages.map((entry) => [entry.name, entry.priorLatest])),
        readTags,
        ...verifyOptions,
      });
      for (const line of check.wrong) err(`  ${line}`);
      if (!check.ok) return 1;
      out(`Rolled back: every ${PROMOTE_TAG} reads its recorded prior value.`);
      return 0;
    }

    out(`\nMoving ${PROMOTE_TAG} to ${record.version}, platforms first, launcher last:`);
    const outcome = await promote({ record, setTag, log });
    if (!outcome.ok) {
      err(
        `\nPROMOTION FAILED at ${outcome.failed}. The ${outcome.moved.length} tag(s) this run moved were ` +
          (outcome.restored.ok
            ? "restored to their recorded prior values."
            : `NOT all restored (${outcome.restored.failed.join(", ")}); run --rollback ${args.recordPath}.`) +
          " Retry at the same version; never skip to a different number (Article 3 clause 5).",
      );
      return 1;
    }
    const check = await verifyTags({
      expected: Object.fromEntries(record.packages.map((entry) => [entry.name, record.version])),
      readTags,
      ...verifyOptions,
    });
    for (const line of check.wrong) err(`  ${line}`);
    if (!check.ok) {
      err(
        `The writes returned success but the registry does not serve ${PROMOTE_TAG} = ${record.version} everywhere after ${check.attempts} reads.`,
      );
      return 1;
    }
    out(
      `\nPromoted: ${PROMOTE_TAG} reads ${record.version} on all ${record.packages.length} packages. Rollback: node scripts/promote-latest.mjs --rollback ${args.recordPath}`,
    );
    out("Next: the LCLI-469 marketplace handshake (docs/runbooks/release-publishing.md, section 3).");
    return 0;
  } finally {
    if (npmrcDir) await rm(npmrcDir, { recursive: true, force: true });
  }
}

/** The pair-receipt gate's two reads, routed through this script's runner. */
function pairIo(run) {
  const execFile = (command, args, options) => run(command, args, options);
  return {
    fetch: (v) => fetchPairReceipt(v, { execFile }),
    observe: (v) => observeRelease(v, RELEASE_PACKAGES, { execFile }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
