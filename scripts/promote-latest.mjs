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
// THE LAUNCHER IS PUBLISHED, NOT TAG-MOVED (LCLI-621; constitution Article 3
// clause 5 as amended by ODOC-302, read at opum-doc f322cfff). The six platform
// packages still reach `latest` by a dist-tag move. The root launcher stages as
// X-rc.N and reaches `latest` by a FRESH PUBLISH of X, because only a publish
// onto `latest` makes npm derive the packument-level readme (OPAG-474). The X
// published is the never-staged launcher carried in the Release run's
// npm-packages artifact, downloaded here afresh from --release-run. Part B's
// spec is quest-cli's promote clause at e3c59d7b (draft opum-ai/quest-cli#344,
// QCLI-399), which lore agreed to adopt, and opum-cli-e2e's receipts/README.md
// at 4f078e6b (#309, TASK-126) "What a reader must do" steps 5-7. The order:
//   1. v<version> peels to a commit, and --release-run is release.yml's
//      successful run of exactly that commit
//   2. its npm-packages artifact holds the eight tarballs (six platforms at X,
//      the launcher at X-rc.N, the launcher at X), and the two launchers pass
//      scripts/launcher-equivalence.mjs
//   3. the PASS-1 receipt (receipts/lore/<version>.json) binds that artifact:
//      run id, commit, every sha256, launcherVersion = the artifact's rc, and
//      opum-cli-e2e's own launcherSubstitution MATCH whose finalTarball is the
//      basename opum-ai-lore-<X>.tgz at the artifact X launcher's sha256
//   4. release-candidate reads X on the platforms and X-rc.N on the launcher,
//      and every prior `latest` (the launcher's included) is recorded
//   5. the PAIR receipt verifies, its launcher entry read at launcherVersion
//   6. quest's `latest` already reads X (Article 3 clause 5: quest first)
//   7. STEP 6: npm serves X-rc.N as the artifact's rc, byte for byte by
//      sha256; X is that served rc with only its version substituted; and X
//      still hashes to the receipt's finalTarball.sha256
//   8. X is not on npm yet, or is on npm as exactly the artifact's bytes (a
//      resume); any other bytes refuse here, before anything moves
//   -- --dry-run stops here; --promote writes the record, then:
//   9. the six platforms move `latest` by dist-tag
//  10. STEP 6 again, then `npm publish <X> --tag latest`, LAST: the one publish
//      in this repository without --tag release-candidate
//      (test/release-workflow.test.ts holds it to exactly this site). On a
//      resume where X is already on npm as the artifact's bytes, the tag is
//      moved instead of republishing.
//  11. STEP 7: `latest` reads X on all seven, and npm's X dist.integrity is the
//      artifact's; then the package-level readme's byte count is read back and
//      reported (OPAG-474 AC3), warning loudly -- not failing -- on 0 bytes.
// A failure at 9 or 10 restores every `latest` this run moved by dist-tag, the
// launcher's included. Nothing is unpublished; retry at the same version.
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
// Refuses unless both opum-cli-e2e receipts verify (scripts/pair-receipt.mjs).
// --rollback is deliberately not gated on either, and needs no Release run:
// restoring prior tags must always be possible.
//
// Usage:
//   node scripts/promote-latest.mjs --record <path> --release-run <id> --dry-run     # read and report only
//   node scripts/promote-latest.mjs --record <path> --release-run <id> --promote     # move latest
//   node scripts/promote-latest.mjs --rollback <path>                                # restore it
// Optional: --version <v> (default: this checkout's package.json), --otp <code>.

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { compareLauncherTarballs } from "./launcher-equivalence.mjs";
import {
  describeOverride,
  evaluateReleaseReceipt,
  expectedTarballNames,
  fetchPairReceipt,
  fetchReleaseReceipt,
  isLauncherVersionOf,
  LAUNCHER,
  OWN_REPOSITORY,
  observeRelease,
  RECEIPT_HOST,
  REGISTRY_PINS,
  RELEASE_PACKAGES,
  requirePairQualification,
  resolveTagCommit,
  tarballName,
} from "./pair-receipt.mjs";

const execFileAsync = promisify(execFileCallback);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const STAGE_TAG = "release-candidate";
export const PROMOTE_TAG = "latest";
export const RECORD_KIND = "lore.promotion-record.v1";
export const KEYCHAIN_SERVICE = "npm-opum-ai-publish";
/** Article 3 clause 5 moves quest's `latest` first; this is the package whose tag says it has. */
export const QUEST_PACKAGE = "@opum-ai/quest";
/** The workflow whose run --release-run must name, and the artifact it uploads the eight tarballs as. */
export const RELEASE_WORKFLOW = ".github/workflows/release.yml";
export const ARTIFACT_NAME = "npm-packages";

/** Strict semver 2.0.0, the grammar from semver.org. A dist-tag name or a `v` prefix is not a version. */
export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * A recorded prior `latest`: a plain release version, X.Y.Z with no prerelease or build metadata.
 * The exact grammar quest-cli's promote-release.mjs uses for the same field (QCLI-390,
 * opum-ai/quest-cli#316), so the pair enforces one rule.
 */
export const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** The one process runner. Tests replace it; nothing below spawns anything else. */
export const defaultRun = (command, args, options = {}) =>
  execFileAsync(command, args, { maxBuffer: 64 * 1024 * 1024, ...options });

/**
 * The one argv a `latest` (or rollback) move is made with. Pinned by REGISTRY_PINS, as every read
 * is: `--registry=https://registry.npmjs.org/` AND `--@opum-ai:registry=https://registry.npmjs.org/`,
 * because npm prefers a configured `@opum-ai:registry` over `--registry` for a scoped package, so
 * the first flag alone would let a scope registry in any npmrc receive the write (LCLI-621 review
 * F6, measured on npm 12.1.0). Auth still resolves: npm keys a token by the chosen registry's
 * nerf-dart, and both the private npmrc this script writes and a web-login ~/.npmrc key it
 * `//registry.npmjs.org/`, which is exactly this registry.
 * @param {string} name @param {string} target @param {string} tag
 * @param {{ otp?: string }} [options]
 */
export function distTagAddArgs(name, target, tag, { otp } = {}) {
  return ["dist-tag", "add", `${name}@${target}`, tag, ...REGISTRY_PINS, ...(otp ? ["--otp", otp] : [])];
}

/**
 * THE ONE `npm publish` IN THIS REPOSITORY THAT DOES NOT STAGE (LCLI-621; the paired design's
 * refinement iv, agreed with quest-cli on QCLI-399): the Release run's X launcher, straight onto
 * `latest`. Every other publish -- publish-release.sh's and release.yml's -- carries
 * `--tag release-candidate`. test/release-workflow.test.ts scans every publish site the repository
 * has and admits exactly this one without it. The tarball is the artifact's file, never a repack.
 * @param {string} tarball @param {{ otp?: string }} [options]
 */
export function launcherPublishArgs(tarball, { otp } = {}) {
  return ["publish", tarball, "--tag", PROMOTE_TAG, ...REGISTRY_PINS, ...(otp ? ["--otp", otp] : [])];
}

/**
 * An anonymous read against the public registry: no ~/.npmrc token is sent (`--userconfig`), and
 * no mirror or scope registry in any npmrc answers (REGISTRY_PINS). Every npm READ uses this --
 * dist-tags, a version view, the readme, and `npm pack` of the served rc.
 */
const ANONYMOUS = Object.freeze([`--userconfig=${devNull}`, ...REGISTRY_PINS]);

/**
 * The one argv every dist-tag READ uses. ANONYMOUS, as quest-cli's anonymous registry fetch is
 * (QCLI-390): an empty user config (so no ~/.npmrc token is sent) against the public registry
 * (so a configured mirror cannot answer for npm). A read the public registry serves to anyone is
 * the fact every check here is about. Exported so a test can pin it.
 * @param {string} name
 */
export function distTagReadArgs(name) {
  return ["view", name, "dist-tags", "--json", "--prefer-online", ...ANONYMOUS];
}

/** The one argv a single version's registry metadata is read with, anonymously. @param {string} spec */
export function versionReadArgs(spec) {
  return ["view", spec, "--json", "--prefer-online", ...ANONYMOUS];
}

/** The one argv npm's PACKAGE-LEVEL readme is read with (not per-version: see readBackReadme). */
export function readmeReadArgs(name) {
  return ["view", name, "readme", "--prefer-online", ...ANONYMOUS];
}

/**
 * The one argv the registry-served rc launcher is downloaded with. `npm pack <spec>` fetches the
 * published tarball and checks it against npm's own integrity; its bytes are what step 6 hashes.
 * @param {string} spec @param {string} into
 */
export function packArgs(spec, into) {
  return ["pack", spec, "--pack-destination", into, "--json", "--prefer-online", ...ANONYMOUS];
}

/** The one argv the Release run is read with: host and repository pinned. @param {string} runId */
export function releaseRunReadArgs(runId) {
  return ["api", "--hostname", RECEIPT_HOST, `repos/${OWN_REPOSITORY}/actions/runs/${runId}`];
}

/**
 * The one argv the Release run's artifact is downloaded with. `--repo HOST/OWNER/REPO` pins the host
 * the way `--hostname` does for `gh api`, so GH_HOST cannot redirect it.
 * @param {string} runId @param {string} into
 */
export function artifactDownloadArgs(runId, into) {
  return [
    "run",
    "download",
    runId,
    "--repo",
    `${RECEIPT_HOST}/${OWN_REPOSITORY}`,
    "--name",
    ARTIFACT_NAME,
    "--dir",
    into,
  ];
}

/**
 * One package's dist-tags. Throws on anything but an object: an unreadable
 * tag set is not an empty one. npm 12 wraps the answer in a one-element array.
 */
export async function readDistTags(name, { run = defaultRun } = {}) {
  const { stdout } = await run("npm", distTagReadArgs(name));
  const parsed = JSON.parse(stdout);
  const tags = Array.isArray(parsed) ? (parsed.length === 1 ? parsed[0] : null) : parsed;
  if (!tags || typeof tags !== "object" || Array.isArray(tags))
    throw new Error(`npm view ${name} dist-tags did not return a dist-tag object`);
  return tags;
}

/** @param {unknown} error */
const reason = (error) => (error instanceof Error ? error.message : String(error));

/** @param {any} error */
const firstLine = (error) =>
  String(error?.stderr || error?.message || error)
    .trim()
    .split("\n")[0];

/** @param {Uint8Array} bytes */
export const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** npm's dist.integrity for these bytes: the SRI sha512 string npm verifies installs against. @param {Uint8Array} bytes */
export const integrityOf = (bytes) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

/** @typedef {{ name: string, priorLatest: string | null }} RecordEntry */
/** @typedef {{ schemaVersion: 1, kind: string, version: string, launcherVersion?: string, releaseRunId?: string, recordedAt: string, packages: RecordEntry[] }} PromotionRecord */
/** @typedef {(name: string, target: string, tag: string) => Promise<unknown>} SetTag */
/** @typedef {{ filename: string, path: string, sha256: string, integrity: string }} ArtifactFile */

/**
 * Reads every package's tags and builds the record, or says why not. Refuses
 * unless the release is staged under release-candidate on ALL of them -- X on
 * the six platforms, X-rc.N on the launcher (LCLI-621): moving `latest` on a
 * subset would pair a qualified launcher with a platform package nobody staged.
 * The launcher's own prior `latest` is recorded like every other package's, so a
 * rollback restores it by dist-tag.
 * @param {{ version: string, launcherVersion?: string, releaseRunId?: string, packages?: readonly string[],
 *   readTags?: (name: string) => Promise<Record<string, string>>, now?: () => Date, resuming?: boolean }} args
 */
export async function planPromotion({
  version,
  launcherVersion,
  releaseRunId = undefined,
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
    const staged = name === LAUNCHER ? launcherVersion : version;
    if (!staged || tags[STAGE_TAG] !== staged)
      problems.push(
        `${name}: ${STAGE_TAG} is ${JSON.stringify(tags[STAGE_TAG] ?? null)}, not ${staged ?? `${version}-rc.<N>`}; stage it with scripts/publish-release.sh first`,
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
    record: {
      schemaVersion: 1,
      kind: RECORD_KIND,
      version,
      ...(launcherVersion ? { launcherVersion } : {}),
      ...(releaseRunId ? { releaseRunId } : {}),
      recordedAt: now().toISOString(),
      packages: entries,
    },
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
  // LCLI-613 review S1, with quest-cli's exact rule (QCLI-390, opum-ai/quest-cli#316) so the pair
  // enforces one mechanism. A record is the ONLY input --rollback moves `latest` with, and
  // --rollback is deliberately not gated on a receipt, so every prior value must be a plain
  // X.Y.Z release (a hand-written "release-candidate", "v0.9.3" or "0.9.3-rc.1" is refused) and
  // must differ from the record's own version. checkRollbackState below is the other half.
  for (const entry of record?.packages ?? []) {
    const prior = entry?.priorLatest;
    if (typeof prior !== "string") problems.push(`record has no prior ${PROMOTE_TAG} for ${entry?.name}`);
    else if (!RELEASE_VERSION.test(prior))
      problems.push(
        `${entry?.name}: recorded prior ${PROMOTE_TAG} ${JSON.stringify(prior)} is not a plain X.Y.Z release version`,
      );
    else if (prior === record?.version)
      problems.push(
        `${entry?.name}: recorded prior ${PROMOTE_TAG} is the release itself (${prior}); rolling back to it restores nothing`,
      );
  }
  return { ok: problems.length === 0, problems };
}

/**
 * LCLI-613 review S1: what --rollback may touch NOW. Every package's current `latest` must read
 * either this record's release (it was promoted and not moved since) or its recorded prior value
 * (it was already restored; a rerun is idempotent). Anything else means `latest` has moved on
 * since this record was written -- typically a LATER release was promoted -- and rolling back
 * from this record would silently downgrade it. An unreadable tag set refuses too.
 * @param {{ record: PromotionRecord, readTags: (name: string) => Promise<Record<string, string>> }} args
 */
export async function checkRollbackState({ record, readTags }) {
  /** @type {string[]} */
  const problems = [];
  for (const { name, priorLatest } of record.packages) {
    let current;
    try {
      current = (await readTags(name))[PROMOTE_TAG];
    } catch (error) {
      problems.push(`${name}: dist-tags unreadable (${reason(error)})`);
      continue;
    }
    if (current !== record.version && current !== priorLatest)
      problems.push(
        `${name}: ${PROMOTE_TAG} reads ${JSON.stringify(current ?? null)}, neither this record's release ${record.version} nor its recorded prior ${priorLatest}; ${PROMOTE_TAG} has moved on since the record was written, and rolling back from it would move ${PROMOTE_TAG} somewhere this record never saw`,
      );
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Moves `latest` to the version, in record order (platforms first, launcher
 * last). On the first failure it restores every tag it already moved to the
 * recorded prior value and stops.
 *
 * LCLI-621: the launcher, last in the record, is not tag-moved but handed to
 * `publishLauncher`, which publishes X onto `latest` (or, on a resume, moves the
 * tag to an X already on npm as the artifact's bytes). Its failure rolls back
 * exactly like a tag failure, the launcher's own `latest` included.
 * @param {{ record: PromotionRecord, setTag: SetTag, publishLauncher?: () => Promise<string>, log?: (line: string) => void }} args
 * @returns {Promise<{ ok: true, moved: string[] } | { ok: false, moved: string[], failed: string, restored: { ok: boolean, failed: string[] } }>}
 */
export async function promote({ record, setTag, publishLauncher = undefined, log = () => {} }) {
  const moved = [];
  for (const { name } of record.packages) {
    try {
      if (name === LAUNCHER) {
        if (!publishLauncher)
          throw new Error("the launcher reaches latest by a publish of X, and no publisher was given");
        const how = await publishLauncher();
        moved.push(name);
        log(`${name}: ${PROMOTE_TAG} -> ${record.version} (${how})`);
        continue;
      }
      await setTag(name, record.version, PROMOTE_TAG);
      moved.push(name);
      log(`${name}: ${PROMOTE_TAG} -> ${record.version}`);
    } catch (error) {
      log(`${name}: FAILED to move ${PROMOTE_TAG} (${reason(error)})`);
      // LCLI-613 review S2: the FAILED package is restored too. A write can fail on the client
      // after the registry applied it (a timeout), so "it failed" does not mean "it did not
      // move". Restoring its recorded prior value is idempotent either way -- for the launcher
      // too, whose publish may have landed on `latest` before the client heard back.
      const toRestore = [...moved, name];
      const restored = await rollback({
        record: { ...record, packages: record.packages.filter((entry) => toRestore.includes(entry.name)) },
        setTag,
        log,
      });
      return { ok: false, moved, failed: name, restored };
    }
  }
  return { ok: true, moved };
}

/**
 * Restores every package's `latest` to its recorded prior value, past individual failures. By
 * dist-tag, the launcher's included: nothing is ever unpublished.
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

// ── The Release run and its artifact (LCLI-621) ─────────────────────────────────────────────────

/**
 * Is `run` (the GitHub API's workflow-run object) this repository's dispatched release.yml run of
 * exactly `commit`, and did it succeed? Returns every problem. quest-cli checks the same three fields of
 * its qualification run (QCLI-399, qualifyBundle).
 * @param {any} run @param {{ runId: string, commit: string }} expected
 */
export function checkReleaseRun(run, { runId, commit }) {
  /** @type {string[]} */
  const problems = [];
  if (!run || typeof run !== "object" || Array.isArray(run)) return [`run ${runId} did not read as a workflow run`];
  if (String(run.id ?? "") !== runId) problems.push(`the API answered for run ${JSON.stringify(run.id)}, not ${runId}`);
  if (run.path !== RELEASE_WORKFLOW)
    problems.push(`run ${runId} is ${JSON.stringify(run.path)}, not ${RELEASE_WORKFLOW}`);
  if (run.head_sha !== commit)
    problems.push(`run ${runId} built ${JSON.stringify(run.head_sha)}, but the tag peels to ${commit}`);
  if (run.conclusion !== "success")
    problems.push(`run ${runId} concluded ${JSON.stringify(run.conclusion)}, not "success"`);
  // release.yml is workflow_dispatch only, and its artifact must have been built from this
  // repository, never a fork's head (LCLI-621 review F8).
  if (run.event !== "workflow_dispatch")
    problems.push(`run ${runId} was triggered by ${JSON.stringify(run.event)}, not "workflow_dispatch"`);
  if (run.head_repository?.full_name !== OWN_REPOSITORY)
    problems.push(
      `run ${runId} built ${JSON.stringify(run.head_repository?.full_name ?? null)}'s code, not ${OWN_REPOSITORY}'s`,
    );
  return problems;
}

/**
 * Reads a downloaded npm-packages artifact: exactly eight tarballs -- the six platforms at X, ONE
 * launcher at X-rc.N (N read from its name, never passed) and the carried launcher at X -- each
 * hashed here from the bytes on disk, and the two launchers compared by
 * scripts/launcher-equivalence.mjs. publish-release.sh's resolve_launcher_rc and its equivalence
 * gate, re-run on the bytes this script is about to publish.
 * @param {string} dir @param {string} version
 */
export async function readArtifact(dir, version) {
  /** @type {string[]} */
  const problems = [];
  const present = (await readdir(dir)).filter((name) => name.endsWith(".tgz")).sort();
  const rcPrefix = `opum-ai-lore-${version}-rc.`;
  const rcNames = present.filter((name) => name.startsWith(rcPrefix));
  let launcherVersion = null;
  if (rcNames.length !== 1)
    problems.push(
      `the artifact must hold exactly one launcher ${rcPrefix}<N>.tgz, and holds ${rcNames.length}; it holds ${present.length} tarball(s) in all: ${JSON.stringify(present)}`,
    );
  else {
    const candidate = /** @type {string} */ (rcNames[0]).slice("opum-ai-lore-".length, -".tgz".length);
    if (isLauncherVersionOf(version, candidate)) launcherVersion = candidate;
    else problems.push(`${rcNames[0]} does not name a launcher ${version}-rc.<N> with N a positive integer`);
  }
  if (!launcherVersion) return { ok: false, problems };
  const finalName = tarballName(LAUNCHER, version);
  const stagedNames = expectedTarballNames(version, launcherVersion);
  const wanted = [...stagedNames, finalName].sort();
  for (const name of wanted) if (!present.includes(name)) problems.push(`the artifact is missing ${name}`);
  for (const name of present)
    if (!wanted.includes(name)) problems.push(`the artifact carries ${name}, which is not part of release ${version}`);
  if (problems.length) return { ok: false, problems };

  /** @type {(name: string) => Promise<ArtifactFile>} */
  const file = async (name) => {
    const path = join(dir, name);
    const bytes = await readFile(path);
    return { filename: name, path, sha256: sha256Hex(bytes), integrity: integrityOf(bytes) };
  };
  /** @type {Record<string, string>} */
  const staged = {};
  for (const name of stagedNames) staged[name] = (await file(name)).sha256;
  const rc = await file(tarballName(LAUNCHER, launcherVersion));
  const final = await file(finalName);
  try {
    const equivalence = compareLauncherTarballs(await readFile(rc.path), await readFile(final.path), {
      version,
      rcVersion: launcherVersion,
    });
    for (const problem of equivalence.problems) problems.push(`launcher equivalence (artifact): ${problem}`);
  } catch (error) {
    problems.push(`launcher equivalence (artifact) could not be measured: ${reason(error)}`);
  }
  return { ok: problems.length === 0, problems, launcherVersion, staged, rc, final };
}

/**
 * Downloads exactly what the registry serves for one package version, into `into`, and returns the
 * file's path. The name npm reports must be a bare filename, so the path cannot leave `into`.
 * @param {string} spec @param {string} into @param {{ run?: Function }} [options]
 */
export async function downloadServedTarball(spec, into, { run = defaultRun } = {}) {
  const { stdout } = await run("npm", packArgs(spec, into));
  const parsed = JSON.parse(stdout);
  // npm 12.1.0 answers with an object keyed by package name ({"@opum-ai/lore": {filename, ...}},
  // measured against the real registry); older npm with a one-element array. Exactly one entry.
  const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? Object.values(parsed) : [];
  const entry = entries.length === 1 ? entries[0] : null;
  const filename = entry?.filename;
  if (typeof filename !== "string" || !filename || basename(filename) !== filename)
    throw new Error(`npm pack ${spec} reported no archive filename (${JSON.stringify(filename)})`);
  return join(into, filename);
}

/**
 * STEP 6 (opum-cli-e2e receipts/README.md, "What a reader must do", read at 4f078e6b), re-derived
 * from the registry each time it is called, never from a recorded verdict:
 *   - the X launcher about to publish still hashes to the pass-1 receipt's
 *     launcherSubstitution.finalTarball.sha256 (the receipt is the authority, not an earlier read);
 *   - `npm pack` of the rc npm serves at launcherVersion RIGHT NOW is sha256-identical to the
 *     artifact's rc, so the rc opum-cli-e2e qualified is still the rc on the registry;
 *   - X is that SERVED rc with only its version substituted (scripts/launcher-equivalence.mjs).
 * Runs before anything moves, and again inside the launcher publish, after the platforms moved.
 * Every failure is returned, not just the first.
 * @param {{ version: string, launcherVersion: string, rc: ArtifactFile, final: ArtifactFile, finalSha256: string,
 *   download: (spec: string, into: string) => Promise<string> }} args
 */
export async function checkServedLauncher({ version, launcherVersion, rc, final, finalSha256, download }) {
  /** @type {string[]} */
  const problems = [];
  const finalBytes = await readFile(final.path);
  const finalDigest = sha256Hex(finalBytes);
  if (finalDigest !== finalSha256)
    problems.push(
      `${final.filename} hashes to sha256 ${finalDigest} now; the pass-1 receipt's launcherSubstitution.finalTarball.sha256 is ${finalSha256}`,
    );
  const scratch = await mkdtemp(join(tmpdir(), "lore-served-launcher-"));
  try {
    let served;
    try {
      served = await download(`${LAUNCHER}@${launcherVersion}`, scratch);
    } catch (error) {
      problems.push(`${LAUNCHER}@${launcherVersion} could not be downloaded from the registry (${firstLine(error)})`);
      return { ok: false, problems };
    }
    const servedBytes = await readFile(served);
    const servedDigest = sha256Hex(servedBytes);
    if (servedDigest !== rc.sha256)
      problems.push(
        `npm serves ${LAUNCHER}@${launcherVersion} as sha256 ${servedDigest}; the artifact's ${rc.filename} is ${rc.sha256}`,
      );
    try {
      const equivalence = compareLauncherTarballs(servedBytes, finalBytes, { version, rcVersion: launcherVersion });
      for (const problem of equivalence.problems)
        problems.push(
          `the served ${launcherVersion} and ${final.filename} differ beyond the version string: ${problem}`,
        );
    } catch (error) {
      problems.push(`launcher equivalence against the served rc could not be measured: ${reason(error)}`);
    }
    return { ok: problems.length === 0, problems };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * Is `name@version` on the registry, and as what? `absent` ONLY for npm's own not-found (E404, "No
 * match found for version" -- measured with npm 12.1.0); anything else that fails to read THROWS,
 * because an unreadable registry read as absent would publish over a version already there. The
 * same rule as publish-release.sh's registry_probe (LCLI-621 review F1). quest-cli's isPublished
 * reads any failure as absent; this deliberately does not.
 * @param {string} name @param {string} version @param {{ run?: Function }} [options]
 * @returns {Promise<{ state: "absent" } | { state: "present", integrity: string | null }>}
 */
export async function probeVersion(name, version, { run = defaultRun } = {}) {
  let stdout;
  try {
    ({ stdout } = await run("npm", versionReadArgs(`${name}@${version}`)));
  } catch (error) {
    const any = /** @type {any} */ (error);
    const text = `${any?.stdout ?? ""}\n${any?.stderr ?? ""}\n${reason(error)}`;
    if (/\bE404\b|No match found for version/.test(text)) return { state: "absent" };
    throw new Error(
      `npm view ${name}@${version} failed with something other than npm's not-found (${firstLine(error)})`,
    );
  }
  let view;
  try {
    const parsed = JSON.parse(stdout);
    view = Array.isArray(parsed) ? (parsed.length === 1 ? parsed[0] : null) : parsed;
  } catch {
    view = null;
  }
  if (!view || typeof view !== "object")
    throw new Error(`npm view ${name}@${version} answered without an error and without a version object`);
  const integrity = view.dist && typeof view.dist.integrity === "string" ? view.dist.integrity : null;
  return { state: "present", integrity };
}

/**
 * Publishes the X launcher onto `latest`, or -- on a rerun after it already landed -- confirms npm
 * holds exactly the artifact's bytes and moves the tag. Step 6 runs first, every time, so nothing
 * irreversible happens on a re-derivation that no longer holds.
 * @param {{ version: string, final: ArtifactFile, recheck: () => Promise<{ ok: boolean, problems: string[] }>,
 *   publish: (tarball: string) => Promise<unknown>, setTag: SetTag,
 *   probe: (name: string, version: string) => Promise<{ state: string, integrity?: string | null }> }} args
 */
export async function publishFinalLauncher({ version, final, recheck, publish, setTag, probe }) {
  const again = await recheck();
  if (!again.ok)
    throw new Error(
      `step 6 no longer holds against the registry, so ${version} was NOT published: ${again.problems.join("; ")}`,
    );
  const state = await probe(LAUNCHER, version);
  if (state.state === "present") {
    // An unreadable integrity is lag or a failed read, not a mismatch: the remedy is a rerun at the
    // same version (Article 3 clause 5).
    if (!state.integrity)
      throw new Error(
        `${LAUNCHER}@${version} is on the registry but its dist.integrity could not be read; re-run the promotion at the same version`,
      );
    if (state.integrity !== final.integrity)
      throw new Error(
        `${LAUNCHER}@${version} is already on the registry as ${state.integrity}, not the artifact's ${final.integrity}; this needs a new version, not a rerun. Do NOT run npm unpublish`,
      );
    await setTag(LAUNCHER, version, PROMOTE_TAG);
    return "already on npm as the artifact's bytes; tag moved";
  }
  await publish(final.path);
  return `published from ${final.filename}`;
}

/**
 * STEP 7's integrity half: npm serves X as the artifact's X launcher. An absent or unreadable
 * answer is retried, because the registry's read lags a publish; a different integrity is not.
 * @param {{ version: string, final: ArtifactFile, probe: (name: string, version: string) => Promise<{ state: string, integrity?: string | null }>,
 *   attempts?: number, delayMs?: number, sleep?: (ms: number) => Promise<void> }} args
 */
export async function verifyFinalLauncher({
  version,
  final,
  probe,
  attempts = 10,
  delayMs = 15_000,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  let last = "no read was made";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const state = await probe(LAUNCHER, version);
      if (state.state === "present" && state.integrity === final.integrity)
        return { ok: true, attempts: attempt, problems: [] };
      if (state.state === "present" && state.integrity)
        return {
          ok: false,
          attempts: attempt,
          problems: [
            `${LAUNCHER}@${version}: npm serves ${state.integrity}, the artifact's ${final.filename} is ${final.integrity}; restore every latest with \`node scripts/promote-latest.mjs --rollback <record>\`, and do NOT unpublish`,
          ],
        };
      last = state.state === "absent" ? "npm answered not-found" : "npm returned no dist.integrity";
    } catch (error) {
      last = reason(error);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ok: false, attempts, problems: [`${LAUNCHER}@${version}: ${last} after ${attempts} reads`] };
}

/**
 * OPAG-474 AC3's measurement: the byte count of npm's PACKAGE-LEVEL `readme` for the launcher, as
 * `npm view <pkg> readme` serves it (npm view takes `readme` from the packument's top level, not
 * from a version, which is why it is the field a dist-tag move never populated). Re-read until it
 * is non-empty or the attempts run out, because the field lags a publish (LCLI-460 measured ~25
 * minutes for 0.5.0). An unreadable read counts as unknown, never as 0.
 * @param {{ run?: Function, attempts?: number, delayMs?: number, sleep?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<{ bytes: number | null, attempts: number, error?: string }>}
 */
export async function readBackReadme({
  run = defaultRun,
  attempts = 10,
  delayMs = 15_000,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
} = {}) {
  /** @type {number | null} */
  let bytes = null;
  let error;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { stdout } = await run("npm", readmeReadArgs(LAUNCHER));
      // npm prints the field followed by one newline, and nothing at all for an empty field.
      bytes = Buffer.byteLength(String(stdout).replace(/\r?\n$/, ""), "utf8");
      error = undefined;
      if (bytes > 0) return { bytes, attempts: attempt };
    } catch (failure) {
      error = firstLine(failure);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  return { bytes, attempts, ...(error ? { error } : {}) };
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
  const known = new Set(["--record", "--rollback", "--otp", "--version", "--release-run", "--dry-run", "--promote"]);
  for (let i = 0; i < argv.length; i++) {
    if (!known.has(argv[i])) throw new Error(`unknown argument: ${argv[i]}`);
    if (!["--dry-run", "--promote"].includes(argv[i])) i++;
  }
  return {
    rollbackPath: flag("--rollback"),
    recordPath: flag("--record"),
    otp: flag("--otp"),
    version: flag("--version"),
    releaseRun: flag("--release-run"),
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
  if (args.rollbackPath && (args.dryRun || args.promoteRequested || args.recordPath || args.releaseRun !== undefined))
    throw new Error("--rollback <record> stands alone: it restores the prior latest values that record names");
  if (!args.rollbackPath) {
    if (!args.recordPath)
      throw new Error(
        "--record <path> is required: it is where every prior latest is written before any tag moves, and what --rollback reads",
      );
    if (args.dryRun === args.promoteRequested)
      throw new Error("say --dry-run (read and report, change nothing) or --promote (move latest); exactly one");
    if (args.releaseRun === undefined)
      throw new Error(
        "--release-run <id> is required: the Release run whose npm-packages artifact was staged, and whose X launcher is what publishes to latest (LCLI-621)",
      );
    if (!/^[1-9][0-9]*$/.test(args.releaseRun))
      throw new Error(`--release-run must be a numeric run id, got ${JSON.stringify(args.releaseRun)}`);
  }
  // LCLI-613 review N4: a version that is not strict semver is refused before anything is read.
  if (args.version !== undefined && !SEMVER.test(args.version))
    throw new Error(
      `--version ${JSON.stringify(args.version)} is not a semver version (no "v" prefix, no dist-tag name)`,
    );
  const readTags = (name) => readDistTags(name, { run });
  const execFile = (command, commandArgs, options) => run(command, commandArgs, options);
  const probe = (name, version) => probeVersion(name, version, { run });

  let record;
  /** The Part B facts --promote acts on; unset on --rollback. */
  let release = null;
  let artifactDir;
  let npmrcDir;
  try {
    if (args.rollbackPath) {
      record = JSON.parse(await readFile(args.rollbackPath, "utf8"));
      const valid = validateRecord(record);
      if (!valid.ok) {
        err(`Refusing to roll back from ${args.rollbackPath}:`);
        for (const problem of valid.problems) err(`  - ${problem}`);
        return 1;
      }
      const state = await checkRollbackState({ record, readTags });
      if (!state.ok) {
        err(`Refusing to roll back from ${args.rollbackPath} (release ${record.version}); nothing has moved:`);
        for (const problem of state.problems) err(`  - ${problem}`);
        return 1;
      }
    } else {
      const version = args.version ?? (await readPackageVersion());
      if (typeof version !== "string" || !SEMVER.test(version))
        throw new Error(`this checkout's package.json version ${JSON.stringify(version)} is not a semver version`);
      const runId = /** @type {string} */ (args.releaseRun);
      out(
        `Promoting @opum-ai/lore ${version}${args.version ? " (--version)" : " (this checkout's package.json)"} from Release run ${runId}.`,
      );

      // 1. The commit v<version> peels to, and the Release run that built it.
      const peeled = await resolveTagCommit(version, { execFile });
      if (!peeled.commit) {
        err(`Refusing to promote ${version}: ${peeled.error}. Nothing has moved.`);
        return 1;
      }
      out(`v${version} peels to ${peeled.commit} (${peeled.chain.join(" -> ")}).`);
      let runMeta;
      try {
        runMeta = JSON.parse((await run("gh", releaseRunReadArgs(runId))).stdout);
      } catch (error) {
        err(
          `Refusing to promote ${version}: Release run ${runId} could not be read (${firstLine(error)}). Nothing has moved.`,
        );
        return 1;
      }
      const runProblems = checkReleaseRun(runMeta, { runId, commit: peeled.commit });
      if (runProblems.length) {
        err(
          `Refusing to promote ${version}: run ${runId} is not a successful Release run of v${version}. Nothing has moved.`,
        );
        for (const problem of runProblems) err(`  - ${problem}`);
        return 1;
      }

      // 2. Its npm-packages artifact, downloaded afresh: the bytes that were staged, and the X launcher.
      artifactDir = await mkdtemp(join(tmpdir(), "lore-promote-artifact-"));
      try {
        await run("gh", artifactDownloadArgs(runId, artifactDir));
      } catch (error) {
        err(
          `Refusing to promote ${version}: the ${ARTIFACT_NAME} artifact of run ${runId} could not be downloaded (${firstLine(error)}). It is the only copy of the ${version} launcher that was qualified; it may have expired. Nothing has moved.`,
        );
        return 1;
      }
      const artifact = await readArtifact(artifactDir, version);
      if (!artifact.ok || !artifact.launcherVersion || !artifact.rc || !artifact.final || !artifact.staged) {
        err(
          `Refusing to promote ${version}: the ${ARTIFACT_NAME} artifact of run ${runId} is not a lore ${version} release. Nothing has moved.`,
        );
        for (const problem of artifact.problems) err(`  - ${problem}`);
        return 1;
      }
      const { launcherVersion, rc, final, staged } = artifact;
      out(
        `Artifact ${ARTIFACT_NAME} from run ${runId}: eight tarballs; the launcher staged as ${launcherVersion}; ${final.filename} sha256 ${final.sha256}; the two launchers differ only by the version string.`,
      );

      // 3. The pass-1 receipt, against these bytes and that commit.
      const pass1Fetched = await fetchReleaseReceipt(version, { execFile });
      if (!pass1Fetched.doc) {
        err(
          `Refusing to promote ${version}: no opum-cli-e2e qualification receipt at ${pass1Fetched.source} (${pass1Fetched.error ?? "unreadable"}). Nothing has moved.`,
        );
        return 1;
      }
      const pass1 = evaluateReleaseReceipt(pass1Fetched.doc, {
        version,
        commit: peeled.commit,
        releaseRunId: runId,
        staged,
        final: { filename: final.filename, sha256: final.sha256 },
        launcherVersion,
      });
      if (!pass1.ok) {
        err(
          `Refusing to promote ${version}: the pass-1 receipt ${pass1Fetched.source} does not bind run ${runId}'s artifact to v${version}. Nothing has moved.`,
        );
        for (const problem of pass1.problems) err(`  - ${problem}`);
        return 1;
      }
      if (pass1.override) out(describeOverride(pass1.override, pass1Fetched.source));
      // Verified equal to final.sha256 just above; kept as the RECEIPT's value, which is the authority.
      const finalSha256 = /** @type {any} */ (pass1Fetched.doc).launcherSubstitution.finalTarball.sha256;
      out(
        `Pass-1 receipt ${pass1Fetched.source} binds run ${runId} at ${peeled.commit.slice(0, 7)}: all seven staged tarballs, launcherVersion ${launcherVersion}, and launcherSubstitution MATCH naming ${final.filename} at sha256 ${finalSha256}.`,
      );

      // 4. The record, and the staging precondition.
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
      const plan = await planPromotion({
        version,
        launcherVersion,
        releaseRunId: runId,
        readTags,
        resuming: Boolean(existing),
      });
      if (!plan.ok) {
        err(`Refusing to promote ${version}:`);
        for (const problem of plan.problems) err(`  - ${problem}`);
        return 1;
      }
      record ??= plan.record;
      out(
        `${version} is staged under ${STAGE_TAG} on all ${record.packages.length} packages (the launcher as ${launcherVersion}). Prior ${PROMOTE_TAG}:`,
      );
      for (const entry of record.packages) out(`  ${entry.name}  ${entry.priorLatest}`);

      // 5. opum-cli-e2e's verdict on the STAGED pair, read here rather than
      // relayed. Dry runs too, so a dry run answers "would this promote".
      const pair = await requirePairQualification({
        version,
        packages: RELEASE_PACKAGES,
        launcherVersion,
        ...pairIo(run),
      });
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
        `Pair receipt ${pair.source} qualifies lore ${version} with quest ${version}, and all ${RELEASE_PACKAGES.length} tarballs npm serves match it (the launcher at ${launcherVersion}).`,
      );

      // 6. LCLI-613 review S4, Article 3 clause 5: "`latest` moves ... Quest first and then Lore."
      // Read from the registry through the same runner, not remembered: refuse unless
      // @opum-ai/quest's `latest` already reads this version. Dry runs too.
      let questLatest = null;
      let questError = "";
      try {
        questLatest = (await readTags(QUEST_PACKAGE))[PROMOTE_TAG] ?? null;
      } catch (error) {
        questError = ` (${reason(error)})`;
      }
      if (questLatest !== version) {
        err(
          `Refusing to promote ${version}: ${QUEST_PACKAGE}'s ${PROMOTE_TAG} is ${JSON.stringify(questLatest)}${questError}, not ${version}. Article 3 clause 5 moves quest's ${PROMOTE_TAG} first, then lore's: promote quest (quest-cli scripts/promote-release.mjs) and re-run. Nothing has moved.`,
        );
        return 1;
      }
      out(`${QUEST_PACKAGE} ${PROMOTE_TAG} reads ${version}: quest has moved first (Article 3 clause 5).`);

      // 7. STEP 6, before anything moves. It runs again inside the launcher publish, after the
      // platforms have moved and immediately before the one irreversible write.
      const servedCheck = () =>
        checkServedLauncher({
          version,
          launcherVersion,
          rc,
          final,
          finalSha256,
          download: (spec, into) => downloadServedTarball(spec, into, { run }),
        });
      const served = await servedCheck();
      if (!served.ok) {
        err(
          `Refusing to promote ${version}: the ${version} launcher is not the rc npm serves with only its version substituted (Article 3 clause 5). Nothing has moved.`,
        );
        for (const problem of served.problems) err(`  - ${problem}`);
        return 1;
      }
      out(
        `Step 6: npm serves ${LAUNCHER}@${launcherVersion} as the artifact's ${rc.filename} (sha256 ${rc.sha256}), and ${final.filename} differs from it only by the version string.`,
      );

      // 8. X on the registry already? Only as exactly the artifact's bytes (a resume). Read-only,
      // so any other answer refuses here rather than after six platforms have moved.
      let launcherAlready;
      try {
        launcherAlready = await probe(LAUNCHER, version);
      } catch (error) {
        err(
          `Refusing to promote ${version}: ${reason(error)}. Whether ${version} is already on npm decides publish or tag-move. Nothing has moved.`,
        );
        return 1;
      }
      if (launcherAlready.state === "present" && launcherAlready.integrity !== final.integrity) {
        err(
          `Refusing to promote ${version}: ${LAUNCHER}@${version} is already on the registry as ${launcherAlready.integrity ?? "<no dist.integrity>"}, not the artifact's ${final.filename} (${final.integrity}). npm versions are immutable, so this needs a new version, not a rerun. Do NOT run npm unpublish. Nothing has moved.`,
        );
        return 1;
      }
      const launcherMove =
        launcherAlready.state === "present"
          ? `npm ${distTagAddArgs(LAUNCHER, version, PROMOTE_TAG).join(" ")}   (${version} is already on npm as the artifact's bytes; a resume)`
          : `npm ${launcherPublishArgs(final.path).join(" ")}`;

      if (args.dryRun) {
        out(`\nThe record --promote would write to ${args.recordPath} before moving anything:`);
        out(JSON.stringify(record, null, 2));
        for (const entry of record.packages)
          out(
            entry.name === LAUNCHER
              ? `  would    ${launcherMove}   (now ${entry.priorLatest}; step 6 re-runs first)`
              : `  would    npm ${distTagAddArgs(entry.name, version, PROMOTE_TAG).join(" ")}   (now ${entry.priorLatest})`,
          );
        out(
          `\nDry run only: nothing was written, published or tag-moved. Re-run with --promote to move ${PROMOTE_TAG}.`,
        );
        return 0;
      }
      if (!existing) {
        await writeFile(args.recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
        out(`Recorded every prior ${PROMOTE_TAG} to ${args.recordPath} before moving anything.`);
      }
      release = { launcherVersion, final, servedCheck };
    }

    const { token, source } = await resolveToken({ run, env });
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
    const otp = token ? undefined : args.otp;
    const setTag = (name, target, tag) => run("npm", distTagAddArgs(name, target, tag, { otp }), { env: npmEnv });

    const log = (line) => out(`  ${line}`);
    if (args.rollbackPath) {
      out(`Restoring ${PROMOTE_TAG} from ${args.rollbackPath} (release ${record.version}), the launcher's included:`);
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
      out(`Rolled back: every ${PROMOTE_TAG} reads its recorded prior value. Nothing was unpublished.`);
      return 0;
    }

    const { final, servedCheck } = /** @type {any} */ (release);
    const publishLauncher = () =>
      publishFinalLauncher({
        version: record.version,
        final,
        // Step 6 again, after the platforms moved and immediately before the one irreversible write.
        recheck: servedCheck,
        publish: (tarball) =>
          run("npm", launcherPublishArgs(tarball, { otp }), { env: npmEnv, maxBuffer: 64 * 1024 * 1024 }),
        setTag,
        probe,
      });
    out(
      `\nMoving ${PROMOTE_TAG} to ${record.version}: the six platforms by dist-tag, then ${LAUNCHER}@${record.version} published onto ${PROMOTE_TAG} from ${final.filename}, last:`,
    );
    const outcome = await promote({ record, setTag, publishLauncher, log });
    if (!outcome.ok) {
      err(
        `\nPROMOTION FAILED at ${outcome.failed}. The ${outcome.moved.length} tag(s) this run moved, and ${outcome.failed} itself (its write may have landed), were ` +
          (outcome.restored.ok
            ? "restored to their recorded prior values."
            : `NOT all restored (${outcome.restored.failed.join(", ")}); run --rollback ${args.recordPath}.`) +
          " Nothing was unpublished. Retry at the same version; never skip to a different number (Article 3 clause 5).",
      );
      return 1;
    }
    // STEP 7: `latest` reads X on all seven...
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
    // ...and npm serves X as the artifact's bytes.
    const bytes = await verifyFinalLauncher({ version: record.version, final, probe, ...verifyOptions });
    if (!bytes.ok) {
      for (const problem of bytes.problems) err(`  ${problem}`);
      err(
        `${PROMOTE_TAG} reads ${record.version} everywhere, but npm does not serve ${final.filename} as ${LAUNCHER}@${record.version}. This run restores nothing by itself: put every ${PROMOTE_TAG} back with node scripts/promote-latest.mjs --rollback ${args.recordPath}. Do NOT run npm unpublish.`,
      );
      return 1;
    }
    out(
      `\nPromoted: ${PROMOTE_TAG} reads ${record.version} on all ${record.packages.length} packages, and npm serves ${LAUNCHER}@${record.version} as ${final.filename} (${final.integrity}). Rollback: node scripts/promote-latest.mjs --rollback ${args.recordPath}`,
    );

    // OPAG-474 AC3, measured and reported. A WARNING on 0 bytes, not a failure: the promotion above
    // is complete and verified, npm pages are immutable, and a rollback cannot give the page a
    // readme -- so a non-zero exit here would invite exactly the wrong remedy. The field also lags
    // a publish, so 0 inside the read window is more often lag than defect.
    const readme = await readBackReadme({ run, ...verifyOptions });
    const readCommand = `npm view ${LAUNCHER} readme | wc -c`;
    if (readme.bytes && readme.bytes > 0)
      out(
        `README read-back (OPAG-474 AC3): npm's package-level readme for ${LAUNCHER} is ${readme.bytes} bytes (read ${readme.attempts} time(s) with \`${readCommand}\`).`,
      );
    else {
      const seen = readme.bytes === null ? `unreadable (${readme.error ?? "no answer"})` : "0 bytes";
      for (const line of [
        "",
        "!!! WARNING: npm SERVES NO README FOR THE LAUNCHER YET (OPAG-474 AC3) !!!",
        `npm's package-level readme for ${LAUNCHER} is ${seen} after ${readme.attempts} read(s).`,
        "The promotion itself is complete and verified; do NOT roll back or unpublish for this. The field",
        "lags a publish (LCLI-460 measured ~25 minutes), so re-measure before concluding anything:",
        `    ${readCommand}`,
        "Record the byte count and the command on LCLI-621 / OPAG-474. Still 0 after the lag window means",
        `the fresh publish of ${record.version} did not populate the packument readme -- a defect to fix next release.`,
        "",
      ])
        err(line);
    }
    out("Next: the LCLI-469 marketplace handshake (docs/runbooks/release-publishing.md, section 3).");
    return 0;
  } finally {
    if (npmrcDir) await rm(npmrcDir, { recursive: true, force: true });
    if (artifactDir) await rm(artifactDir, { recursive: true, force: true });
  }
}

/** The pair-receipt gate's two reads, routed through this script's runner. */
function pairIo(run) {
  const execFile = (command, args, options) => run(command, args, options);
  return {
    fetch: (v) => fetchPairReceipt(v, { execFile }),
    observe: (v, rc) => observeRelease(v, RELEASE_PACKAGES, { execFile, launcherVersion: rc }),
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
