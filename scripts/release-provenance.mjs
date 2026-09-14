#!/usr/bin/env node
/**
 * release-provenance.mjs — the release-time gate for dangling SLSA provenance (LCLI-481).
 *
 * WHAT WENT WRONG, AND WHAT THIS CAN AND CANNOT FIX
 *
 * Every `@opum-ai/lore*` version published from CI before 0.6.1 carries an npm SLSA
 * provenance attestation pinning a git commit in `resolvedDependencies[0].digest.gitCommit`.
 * This repository's history was destroyed and recreated on 2026-09-10, so those commits no
 * longer exist on GitHub: npmjs.com's provenance panel links a 404, and verification against
 * the source repo cannot reach the tree it names. 0.6.0 pins
 * 59ba30e497f8e98aa6c6be022d9363fd718fb4ee, which the live GitHub API answers 422 for.
 *
 * NOTHING REPAIRS THOSE LINKS — an attestation is signed and immutable, and republishing a
 * consumed version is impossible. This script is therefore NOT a repair. It exists so that
 * the NEXT history rewrite is caught here, on a release run, instead of being discovered
 * months later on a package page where a provenance link to a non-existent commit reads as
 * tampering rather than as housekeeping.
 *
 * THE DESIGN CONSTRAINT THAT SHAPED EVERYTHING BELOW
 *
 * A gate that fails the only publish path that currently works gets disabled on first
 * contact, and then nobody trusts the next one either. Three consequences, all deliberate:
 *
 *   1. A MISSING attestation is a PASS, not a failure — but a loud one. 0.6.1 shipped with
 *      no attestation at all and 0.6.2 will too: OIDC trusted publishing is broken for this
 *      repository (LCLI-482, OPEN as of 2026-09-13, do not read this comment as saying it is
 *      fixed), so releases go out through the manual scripts/publish-release.sh path, which
 *      cannot mint provenance. Failing on absence would red every release for a condition
 *      the release cannot fix. Passing SILENTLY would be just as bad the other way: the
 *      unattested releases would accumulate invisibly and only be noticed by someone reading
 *      a packument. So absence is reported as a `::warning::` annotation plus a job-summary
 *      line — a recorded fact on every single release run.
 *
 *   2. An INCONCLUSIVE check is a PASS too, also loud. Rate limiting, a 5xx, or a DNS blip
 *      is not evidence of a dangling commit, and turning GitHub's flakiness into a red
 *      release is how gates get deleted. Only a definitive negative answer fails the run.
 *
 *   3. A TRUE POSITIVE HAS A SANCTIONED WAY OUT — see THE ESCAPE HATCH below. Without one,
 *      the first real detection makes `publish` permanently unreachable and the only move
 *      left to an operator is to delete the gate.
 *
 * The only FAILURE is: an attestation is PRESENT and pins a commit the live GitHub API
 * definitively does not have. That is the LCLI-481 defect, and nothing else is. (A defect in
 * THIS SCRIPT is the one other way the run goes red — exit 3 — because a gate that crashed
 * checked nothing, and silently passing on our own bug is how a gate becomes decoration.)
 *
 * WHY THE LIVE GITHUB API AND NEVER `git cat-file`
 *
 * This is the whole point, not an implementation detail. A local clone that predates (or was
 * fetched across) the rewrite still holds the destroyed commits as loose objects — verified
 * in this repository on 2026-09-13: `git cat-file -t 59ba30e497f8e98aa6c6be022d9363fd718fb4ee`
 * prints `commit` and exits 0, while api.github.com answers 422 for the same SHA. A local
 * check therefore PASSES on exactly the artifacts this gate exists to catch, and passes
 * silently. The authority for "does this commit exist" is the remote, so every lookup here
 * goes to api.github.com. There is no git invocation anywhere in this file, and adding one
 * would quietly convert the gate into a no-op.
 *
 * HOW A MISSING COMMIT IS ESTABLISHED (not by reading English)
 *
 * GitHub answers a destroyed SHA with 422 and the message "No commit found for SHA: <sha>".
 * Classifying on that sentence alone would mean one reworded GitHub error turns the gate
 * into a silent pass — the failure this whole file is built to prevent, reintroduced at its
 * own core. So a 422 is CORROBORATED: the repository itself is fetched, and only
 * `repo resolves 200` + `commit endpoint 422` is called missing. That inference does not
 * depend on wording at all. The message is still matched, but only to label the log line
 * `recognised`/`unrecognised`, never to decide the verdict.
 *
 * THE TWO MODES
 *
 *   --pre   Runs BEFORE the publish job, and gates it. Looks at what is ALREADY on the
 *           registry: for each published version of the launcher newer than the
 *           KNOWN_DANGLING_THROUGH baseline, re-resolves the commit pinned by EVERY package
 *           of that release. This is the mode that detects a history rewrite that happened
 *           between two releases — the damage is done to the earlier release, and the signal
 *           is that its previously-good provenance stopped resolving. Catching it here stops
 *           the release in progress from adding another version to the pile before anyone
 *           has decided what to do about the rewrite.
 *
 *           WHY ALL SEVEN PACKAGES AND NOT JUST THE LAUNCHER. An earlier revision sampled the
 *           launcher alone, justified as "verify-versions asserts one version across every
 *           manifest, so they share a commit". That warrant was FALSE and is recorded here so
 *           it does not get reintroduced: verify-versions asserts version/license/author/
 *           os/cpu/pin equality and says nothing whatsoever about commits. Worse, release.yml's
 *           `publish_or_skip` exists precisely so a release CAN complete across two dispatches
 *           from two different commits — dispatch 1 publishes six platform packages from
 *           commit X and dies before the launcher, dispatch 2 publishes only the launcher from
 *           commit Y. One version then carries two distinct pinned commits, and a
 *           launcher-only probe sees only Y. Commit lookups are cached per repo+sha, so the
 *           normal case (all seven pinning one commit) still costs a single GitHub call.
 *
 *           The package set comes from the CURRENT package.json, so a platform package added
 *           after a scanned version existed reads as `absent` for it. That is honest (that
 *           package really has no attestation at that version) and loud rather than red — the
 *           alternative, reconstructing each historical release's package set, would infer it
 *           from the same registry data whose trustworthiness is the thing in question.
 *
 *   --post  Runs AFTER the publish job. Looks at what THIS release just produced: every
 *           package at the version being released. It cannot un-publish anything; what it
 *           does is put the verdict on the release run, so an attested release that pins an
 *           unreachable commit is known within minutes rather than after a user reports it.
 *
 * THE BASELINE, AND WHY --pre WOULD OTHERWISE BE USELESS
 *
 * Every attested version at or below KNOWN_DANGLING_THROUGH already dangles, permanently. A
 * --pre that failed on those would fail EVERY future release, forever, for damage no release
 * can repair — the exact "disabled on first contact" failure above. So --pre LISTS those
 * versions by version number on every run (it does not fetch their attestations, so it does
 * not print the commits they pin; --post on such a version does, as outcome `baseline`) and
 * never fails on them. Versions ABOVE the baseline are the ones a new rewrite would break,
 * and those fail.
 *
 * THE ESCAPE HATCH (read this before deleting anything)
 *
 * --pre re-checks PUBLISHED history, so a true positive does not clear by itself: once a
 * post-baseline version dangles it dangles on every subsequent run, `provenance-pre` exits 1
 * every time, and because `publish` lists it in `needs:` the release path is blocked until
 * someone acts. That is intended — an unexamined rewrite should stop a release — but it must
 * not leave "delete the job" as the only available action. Two sanctioned exits, both louder
 * than deletion:
 *
 *   TEMPORARY: dispatch the release with the `acknowledge_dangling_provenance` input set to
 *   the task id tracking the loss. Every dangling finding is then reported as `acknowledged`,
 *   with the reference echoed into the log and the job summary, and the run proceeds. It is
 *   per-dispatch: it never persists, never hides a NEW dangling version from the next run,
 *   and leaves the acknowledgement in that run's record.
 *
 *   DURABLE: once the loss is accepted and recorded on a task, raise KNOWN_DANGLING_THROUGH
 *   to cover those versions, in a commit whose message cites that task. Do this only when the
 *   commits are genuinely gone for good — raising it to silence a failure nobody investigated
 *   is how this gate becomes ceremony.
 *
 * EXIT CODES
 *   0  pass — including "no attestation", "could not determine", and "acknowledged", all
 *      annotated loudly
 *   1  gate failure — an attestation pins a commit GitHub definitively does not have
 *   2  usage error
 *   3  this script itself failed (a bug here, not a finding about any artifact)
 *
 * TESTING WITHOUT A RELEASE
 *   LORE_PROVENANCE_REGISTRY / LORE_PROVENANCE_GITHUB_API override the two endpoints, so the
 *   whole gate runs against a local stub server. Anything in a release path that cannot be
 *   exercised locally will not be exercised at all; see test/release-provenance.test.ts.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Versions at or below this carry provenance destroyed by the 2026-09-10 history rewrite
 * (LCLI-481). 0.3.5 through 0.6.0 are the attested set; 0.6.1 and later were published
 * manually and carry no attestation at all.
 *
 * THIS LITERAL IS THE MOST DANGEROUS EDIT IN THIS FILE: raising it retires the gate's memory
 * of everything below the new value, permanently and silently. test/release-provenance.test.ts
 * pins it so the change cannot pass review unnoticed. Read THE ESCAPE HATCH above first.
 */
const KNOWN_DANGLING_THROUGH = "0.6.0";

const SLSA_PREDICATE_TYPE = "https://slsa.dev/provenance/v1";
const REGISTRY = process.env.LORE_PROVENANCE_REGISTRY || "https://registry.npmjs.org";
const GITHUB_API = process.env.LORE_PROVENANCE_GITHUB_API || "https://api.github.com";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

/**
 * Per-request ceiling. A hung connection would otherwise hold a CI runner for the full job
 * timeout while `publish` waits on this job — an outage must degrade to a loud pass in
 * seconds, not occupy a runner for hours.
 */
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.LORE_PROVENANCE_TIMEOUT_MS || "20000", 10);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = join(SCRIPT_DIR, "..", "package.json");

/** Per-package verdicts. Only `dangling` fails the run; the rest are pass-with-a-note. */
const OUTCOME = {
  /** attestation present, pinned commit resolves on GitHub */
  OK: "ok",
  /** attestation present, GitHub definitively does not have the commit */
  DANGLING: "dangling",
  /** dangling, but waived for this one dispatch against a named reference */
  ACKNOWLEDGED: "acknowledged",
  /** at or below KNOWN_DANGLING_THROUGH — the accepted, unrepairable 2026-09-10 loss */
  BASELINE: "baseline",
  /** no attestation published for this package@version */
  ABSENT: "absent",
  /** attestation present but not in a shape we can read a commit from */
  UNREADABLE: "unreadable",
  /** the network, not the artifact, is what could not be resolved */
  INCONCLUSIVE: "inconclusive",
};

/** Thrown for a remote that would not answer — distinct from a bug in this script (exit 3). */
class RemoteUnavailableError extends Error {}

// ---------------------------------------------------------------------------
// version ordering
// ---------------------------------------------------------------------------

/**
 * Parse a semver-shaped version into a numeric triple, or return null when it is not
 * semver-shaped at all.
 *
 * Returning null rather than coercing is load-bearing. An earlier revision ran every string
 * through `parseInt(...) || 0`, which quietly turned `"abc"`, `""` and `"0.6"` into values at
 * or below the baseline — i.e. SILENTLY SKIPPED them. In a file whose doctrine is "when
 * unsure, pass loudly", a version we cannot parse must be checked and reported, never
 * assumed harmless.
 *
 * A prerelease/build suffix is stripped rather than ordered: this project has never shipped
 * one, and treating `0.6.0-rc.1` as `0.6.0` is the conservative answer for a baseline test.
 *
 * @param {string} version
 * @returns {number[] | null}
 */
function parseVersion(version) {
  const core = String(version).split(/[-+]/)[0] ?? "";
  if (!/^\d+\.\d+\.\d+$/.test(core)) return null;
  return core.split(".").map((n) => Number.parseInt(n, 10));
}

/**
 * Order two versions. Unparseable versions sort after every parseable one, deterministically
 * by string, so a packument carrying junk keys still sorts stably.
 *
 * @param {string} a
 * @param {string} b
 */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    if (left) return -1;
    if (right) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** True only for a version we could parse AND that sits at or below the baseline. */
function isAtOrBelowBaseline(version) {
  if (!parseVersion(version)) return false;
  return compareVersions(version, KNOWN_DANGLING_THROUGH) <= 0;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 * @returns {Promise<Response>}
 */
async function request(url, headers) {
  return await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

// ---------------------------------------------------------------------------
// registry: read the attestation
// ---------------------------------------------------------------------------

/** npm's attestation endpoint wants the scope slash percent-encoded, the `@version` plain. */
const attestationUrl = (name, version) => `${REGISTRY}/-/npm/v1/attestations/${encodeURIComponent(name)}@${version}`;

/**
 * Fetch and decode the SLSA provenance for one package@version.
 *
 * The sigstore bundle is not directly readable: the statement lives base64-encoded in
 * `dsseEnvelope.payload`, and the endpoint returns BOTH npm's own publish attestation and the
 * SLSA one, so the predicateType has to be matched rather than the array indexed.
 *
 * @param {string} name
 * @param {string} version
 * @returns {Promise<{state: "found"|"absent"|"unreadable"|"error", commit?: string,
 *                    repo?: string, ref?: string, detail?: string}>}
 */
async function readProvenance(name, version) {
  let response;
  try {
    response = await request(attestationUrl(name, version), { accept: "application/json" });
  } catch (error) {
    return { state: "error", detail: `registry request failed: ${describeError(error)}` };
  }
  // 404 is npm's answer for "this version has no attestations", which is the normal,
  // expected answer for every manually published version.
  if (response.status === 404) return { state: "absent", detail: "registry has no attestations for this version" };
  if (!response.ok) return { state: "error", detail: `registry returned HTTP ${response.status}` };

  let body;
  try {
    body = await response.json();
  } catch (error) {
    return { state: "error", detail: `registry response was not JSON: ${describeError(error)}` };
  }
  // The endpoint has also been observed answering 200 with `{"error":"Not found"}`.
  if (body?.error) return { state: "absent", detail: `registry: ${body.error}` };

  const attestations = Array.isArray(body?.attestations) ? body.attestations : [];
  if (attestations.length === 0) return { state: "absent", detail: "no attestations published" };

  const slsa = attestations.find((a) => a?.predicateType === SLSA_PREDICATE_TYPE);
  if (!slsa) {
    // npm's publish attestation alone, without SLSA provenance: nothing pins a commit, so
    // there is no dangling link to have. Same verdict as absent.
    return { state: "absent", detail: "attestations published, but none of type SLSA provenance" };
  }

  let statement;
  try {
    statement = JSON.parse(Buffer.from(slsa.bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  } catch (error) {
    return { state: "unreadable", detail: `could not decode the DSSE payload: ${describeError(error)}` };
  }

  const build = statement?.predicate?.buildDefinition;
  const commit = build?.resolvedDependencies?.[0]?.digest?.gitCommit;
  if (typeof commit !== "string" || !/^[0-9a-f]{7,40}$/.test(commit)) {
    // A shape change in npm/SLSA must not red a release: report it and pass. We cannot
    // assert a commit is missing when we never found the field that names it.
    return { state: "unreadable", detail: "provenance carries no readable resolvedDependencies[0].digest.gitCommit" };
  }

  // Resolve the commit against the repository the ATTESTATION names, not a hardcoded one —
  // that is the only repo the pin is meaningful in. A mismatch against package.json is
  // surfaced as a warning by the caller, never as a failure (a rename or a fork is not a
  // dangling commit).
  const repoUrl = build?.externalParameters?.workflow?.repository || "";
  const repo = repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  const ref = build?.externalParameters?.workflow?.ref || "";
  return { state: "found", commit, repo, ref };
}

// ---------------------------------------------------------------------------
// GitHub: does the commit still exist?
// ---------------------------------------------------------------------------

function githubHeaders() {
  /** @type {Record<string, string>} */
  const headers = { accept: "application/vnd.github+json", "user-agent": "lore-cli-release-provenance" };
  if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

/**
 * Is the repository itself readable right now? This is the corroboration that lets a 422 be
 * classified without trusting GitHub's prose (see the header).
 *
 * @param {string} repo
 * @returns {Promise<boolean>}
 */
async function repositoryIsReadable(repo) {
  try {
    const response = await request(`${GITHUB_API}/repos/${repo}`, githubHeaders());
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Ask the live GitHub API whether a commit exists.
 *
 * The classification here is the part that must not be sloppy, because every wrong answer is
 * expensive in one direction or the other:
 *
 *   200                        -> exists. Pass.
 *   422, repo readable         -> DEFINITIVELY gone. The only answer that fails the gate. The
 *                                 "No commit found for SHA" wording is logged but not relied
 *                                 on: 422 on a well-formed 7-40 hex sha in a repo we can
 *                                 otherwise read has no other meaning, and pinning the verdict
 *                                 to an English sentence would make one GitHub copy edit turn
 *                                 this gate into a silent pass.
 *   422, repo NOT readable     -> inconclusive. Without knowing the repo is visible to us, a
 *                                 422 proves nothing about the commit.
 *   404                        -> inconclusive, NOT missing. On this endpoint 404 means the
 *                                 REPOSITORY is not found or not accessible (renamed, private,
 *                                 bad token) — a missing commit in a visible repo is 422.
 *                                 Conflating the two reports every token problem as tampering.
 *   401/403/429                -> inconclusive (auth or rate limit).
 *   5xx / thrown fetch         -> retried, then inconclusive.
 *
 * Retries cover only the transient classes; a 200 or a corroborated 422 is a final answer.
 *
 * @param {string} repo
 * @param {string} sha
 * @returns {Promise<{state: "resolved"|"missing"|"inconclusive", detail: string}>}
 */
async function resolveCommitUncached(repo, sha, { attempts = 3, backoffMs = 1000, sleep = defaultSleep } = {}) {
  let last = "no attempt made";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await request(`${GITHUB_API}/repos/${repo}/commits/${sha}`, githubHeaders());
    } catch (error) {
      last = `request failed: ${describeError(error)}`;
      if (attempt < attempts) await sleep(backoffMs * attempt);
      continue;
    }

    if (response.status === 200) return { state: "resolved", detail: `GitHub resolves ${sha} in ${repo}` };

    const text = await response.text().catch(() => "");
    if (response.status === 422) {
      const worded = /No commit found for SHA/i.test(text) ? "recognised" : "UNRECOGNISED";
      if (await repositoryIsReadable(repo)) {
        return {
          state: "missing",
          detail: `GitHub: 422 (${worded} wording) for SHA ${sha} while ${repo} itself resolves — the commit is gone`,
        };
      }
      return {
        state: "inconclusive",
        detail: `GitHub returned 422 for SHA ${sha} but ${repo} itself is not readable, so this says nothing about the commit: ${firstLine(text)}`,
      };
    }
    if (response.status === 404) {
      return {
        state: "inconclusive",
        detail: `GitHub returned 404 for repository ${repo} — the repo is missing or not readable with these credentials; this is NOT evidence about the commit`,
      };
    }
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const rateLimited = remaining === "0" || response.status === 429;
      last = rateLimited
        ? `GitHub rate limit exhausted (HTTP ${response.status}, resets at ${resetAt(response)})`
        : `GitHub returned HTTP ${response.status}: ${firstLine(text)}`;
      // A rate limit does not clear inside a few seconds of backoff; do not burn the budget.
      if (rateLimited) return { state: "inconclusive", detail: last };
      if (attempt < attempts) await sleep(backoffMs * attempt);
      continue;
    }

    last = `GitHub returned HTTP ${response.status}: ${firstLine(text)}`;
    if (response.status >= 500 && attempt < attempts) {
      await sleep(backoffMs * attempt);
      continue;
    }
    return { state: "inconclusive", detail: last };
  }
  return { state: "inconclusive", detail: last };
}

/**
 * Memoised commit resolution. Every package of a release normally pins the SAME commit, so
 * checking all seven costs one GitHub call rather than seven — which is what makes the
 * all-packages sweep in --pre affordable.
 *
 * @type {Map<string, Promise<{state: "resolved"|"missing"|"inconclusive", detail: string}>>}
 */
const commitCache = new Map();

function resolveCommit(repo, sha) {
  const key = `${repo}@${sha}`;
  const hit = commitCache.get(key);
  if (hit) return hit;
  const pending = resolveCommitUncached(repo, sha);
  commitCache.set(key, pending);
  return pending;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const firstLine = (text) => String(text).replace(/\s+/g, " ").slice(0, 200);
const describeError = (error) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

function resetAt(response) {
  const reset = Number.parseInt(response.headers.get("x-ratelimit-reset") || "", 10);
  return Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : "unknown";
}

// ---------------------------------------------------------------------------
// one package@version, end to end
// ---------------------------------------------------------------------------

/**
 * @param {string} name
 * @param {string} version
 * @param {string} expectedRepo
 */
async function checkOne(name, version, expectedRepo) {
  const provenance = await readProvenance(name, version);
  const base = { name, version, spec: `${name}@${version}` };

  if (provenance.state === "absent") return { ...base, outcome: OUTCOME.ABSENT, detail: provenance.detail };
  if (provenance.state === "unreadable") return { ...base, outcome: OUTCOME.UNREADABLE, detail: provenance.detail };
  if (provenance.state === "error") return { ...base, outcome: OUTCOME.INCONCLUSIVE, detail: provenance.detail };

  const { commit, repo, ref } = provenance;
  const record = { ...base, commit, repo, ref, repoMismatch: "" };

  if (!repo || !commit) {
    return { ...record, outcome: OUTCOME.UNREADABLE, detail: "provenance names no source repository to resolve against" };
  }
  if (expectedRepo && repo !== expectedRepo) {
    // Not a failure: a rename or a legitimate fork looks exactly like this, and the commit is
    // still resolved against the repo the attestation itself names.
    record.repoMismatch = `provenance names ${repo}, package.json names ${expectedRepo}`;
  }

  // The accepted, unrepairable loss. Reported with the commit it pins, never failed on. Note
  // this branch is only reachable from --post: --pre filters baseline versions out before it
  // gets here (it lists them by version instead of fetching seven attestations apiece).
  if (isAtOrBelowBaseline(version)) {
    return {
      ...record,
      outcome: OUTCOME.BASELINE,
      detail: `pins ${commit} (${ref || "no ref"}); at or below the ${KNOWN_DANGLING_THROUGH} baseline destroyed by the 2026-09-10 rewrite — not re-checked, not failed`,
    };
  }

  const resolution = await resolveCommit(repo, commit);
  if (resolution.state === "resolved") return { ...record, outcome: OUTCOME.OK, detail: resolution.detail };
  if (resolution.state === "missing") return { ...record, outcome: OUTCOME.DANGLING, detail: resolution.detail };
  return { ...record, outcome: OUTCOME.INCONCLUSIVE, detail: resolution.detail };
}

// ---------------------------------------------------------------------------
// modes
// ---------------------------------------------------------------------------

/**
 * Published versions of a package, oldest first, from its packument.
 * @param {string} name
 */
async function publishedVersions(name) {
  let response;
  try {
    response = await request(`${REGISTRY}/${encodeURIComponent(name)}`, {
      accept: "application/vnd.npm.install-v1+json",
    });
  } catch (error) {
    throw new RemoteUnavailableError(`could not reach the registry for ${name}: ${describeError(error)}`);
  }
  if (!response.ok) {
    throw new RemoteUnavailableError(`could not read the packument for ${name}: HTTP ${response.status}`);
  }
  const body = await response.json().catch(() => null);
  const versions = body?.versions;
  if (!versions || typeof versions !== "object") {
    throw new RemoteUnavailableError(`the packument for ${name} carried no versions map`);
  }
  return Object.keys(versions).sort(compareVersions);
}

/** The launcher plus every platform package it pins — this release's full package set. */
function releasePackages(options, manifest) {
  if (options.packages.length > 0) return options.packages;
  return [manifest.name, ...Object.keys(manifest.optionalDependencies ?? {})];
}

async function runPre(options, manifest) {
  const launcher = manifest.name;
  const packages = releasePackages(options, manifest);
  const all = await publishedVersions(launcher);

  const baseline = all.filter((v) => isAtOrBelowBaseline(v));
  const unparseable = all.filter((v) => parseVersion(v) === null);
  const candidates = all.filter((v) => !isAtOrBelowBaseline(v));
  const scanned = candidates.slice(-options.limit);

  console.log(`--pre  re-verifying provenance already on the registry for ${launcher}`);
  console.log(
    `       ${all.length} published version(s); ${baseline.length} at or below the ${KNOWN_DANGLING_THROUGH} baseline; ${candidates.length} to re-verify, taking the most recent ${scanned.length} × ${packages.length} package(s)`,
  );
  if (baseline.length > 0) {
    console.log(
      `       baseline set (provenance destroyed by the 2026-09-10 rewrite, unrepairable, listed not re-checked): ${baseline.join(", ")}`,
    );
  }
  if (unparseable.length > 0) {
    // Loudly, because the alternative is the silent skip an earlier revision had.
    console.log(
      `::warning::the registry lists ${unparseable.length} version(s) that are not semver-shaped: ${unparseable.join(", ")}. They are NOT assumed to be below the baseline — they are checked like any other version.`,
    );
  }

  const results = [];
  for (const version of scanned) {
    for (const name of packages) {
      results.push(await checkOne(name, version, options.expectedRepo));
    }
  }
  return { results, scannedVersions: scanned.length };
}

async function runPost(options, manifest) {
  const version = options.version || manifest.version;
  // verify-versions has already asserted every manifest shares this version and that root's
  // optionalDependencies pin it exactly, so this IS the set this release published.
  const packages = releasePackages(options, manifest);

  console.log(`--post checking the provenance this release just produced: ${packages.length} package(s) at ${version}`);

  // PASS 1 — no waiting. Ask every package once.
  const results = [];
  for (const name of packages) {
    results.push(await checkOne(name, version, options.expectedRepo));
  }

  // PASS 2 — propagation grace, but ONLY when it can possibly pay out. Attestations lag the
  // registry read API the same way tarballs do (LCLI-460: 0.5.0 took ~25 minutes), so a
  // genuinely attested release could be reported unattested purely because the check was
  // fast. But if NOT ONE package of this release has an attestation, the release was not
  // attested at all — the structural case with LCLI-482 open — and polling would burn the
  // whole window to re-learn what pass 1 already established. Each package that does wait
  // gets its OWN deadline; an earlier revision shared one across all seven, so the first
  // package could consume the entire window and leave the rest no grace at all.
  const anyAttested = results.some((r) => Boolean(r.commit));
  if (options.waitSeconds > 0 && anyAttested) {
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.outcome !== OUTCOME.ABSENT) continue;
      const name = results[i]?.name ?? "";
      const deadline = Date.now() + options.waitSeconds * 1000;
      while (Date.now() < deadline) {
        const remaining = Math.ceil((deadline - Date.now()) / 1000);
        console.log(
          `       ${name}@${version}: no attestation yet, but other packages in this release have one; ${remaining}s of its propagation window left`,
        );
        await defaultSleep(Math.min(15000, Math.max(1000, deadline - Date.now())));
        const retry = await checkOne(name, version, options.expectedRepo);
        results[i] = retry;
        if (retry.outcome !== OUTCOME.ABSENT) break;
      }
    }
  } else if (options.waitSeconds > 0) {
    console.log(
      `       not one package of this release carries an attestation, so there is nothing propagating to wait for — skipping the ${options.waitSeconds}s window rather than spending it to re-learn that.`,
    );
  }

  return { results, scannedVersions: 1 };
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

/**
 * @param {{results: any[], scannedVersions: number}} checked
 * @param {string} mode
 * @param {{acknowledge: string}} options
 */
function report(checked, mode, options) {
  const { results, scannedVersions } = checked;
  const acknowledged = options.acknowledge.length > 0;

  /** @type {string[]} */
  const summary = [];
  for (const r of results) {
    if (acknowledged && r.outcome === OUTCOME.DANGLING) r.outcome = OUTCOME.ACKNOWLEDGED;
    // One stable line per package: outcome first so a log is greppable and a test can assert
    // on it without parsing prose.
    console.log(`${String(r.outcome).padEnd(12)} ${r.spec}  ${r.detail}`);
    if (r.repoMismatch) console.log(`::warning::${r.spec}: ${r.repoMismatch}`);
    summary.push(`| \`${r.outcome}\` | \`${r.spec}\` | ${r.commit ? `\`${r.commit}\`` : "—"} | ${r.detail} |`);
  }

  const dangling = results.filter((r) => r.outcome === OUTCOME.DANGLING);
  const waived = results.filter((r) => r.outcome === OUTCOME.ACKNOWLEDGED);
  const absent = results.filter((r) => r.outcome === OUTCOME.ABSENT);
  const inconclusive = results.filter((r) => r.outcome === OUTCOME.INCONCLUSIVE || r.outcome === OUTCOME.UNREADABLE);

  // NOTHING CHECKED IS NOT A PASS. Reachable if the packument shape changes, the package is
  // renamed, or the baseline is raised to the current version — after which a silent "passed"
  // would be a gate reporting success for work it never did.
  const verifiedNothing = results.length === 0;
  if (verifiedNothing) {
    console.log(
      `::warning::the ${mode} provenance check verified ZERO package versions${scannedVersions === 0 ? " (no version was in scope)" : ""}. This is NOT a pass: no attestation was inspected and no commit was resolved. Check that the package name still resolves on the registry and that KNOWN_DANGLING_THROUGH has not been raised past every published version.`,
    );
  }

  for (const r of dangling) {
    console.log(
      `::error::${r.spec} carries SLSA provenance pinning commit ${r.commit}, which the live GitHub API says does not exist in ${r.repo}. That is the LCLI-481 failure mode: on npmjs.com this reads as tampering, and it cannot be repaired after the fact because the attestation is signed and the version cannot be republished. Something rewrote this repository's history after that release. THIS WILL NOT CLEAR ON ITS OWN and it blocks publish. The two sanctioned ways forward, both of which leave a record (deleting or neutering this job does not): (1) to release now, re-dispatch with the 'acknowledge_dangling_provenance' input set to the task id tracking this loss — a per-dispatch waiver, not a suppression; (2) once the loss is accepted and recorded on a task, raise KNOWN_DANGLING_THROUGH in scripts/release-provenance.mjs to cover these versions in a commit citing that task. Do not raise it merely to make this green.`,
    );
  }
  if (waived.length > 0) {
    console.log(
      `::warning::${waived.length} DANGLING provenance finding(s) were waived for this dispatch against reference "${options.acknowledge}": ${waived.map((r) => r.spec).join(", ")}. The commits they pin are still gone and this waiver does not persist — the next run fails again unless KNOWN_DANGLING_THROUGH is raised in a commit citing that reference.`,
    );
  }
  if (absent.length > 0) {
    console.log(
      `::warning::${absent.length} package(s) in this ${mode} check have NO provenance attestation: ${absent.map((r) => r.spec).join(", ")}. This is expected and is not a gate failure — OIDC trusted publishing is broken for this repository (LCLI-482, still OPEN), so releases go out through the manual scripts/publish-release.sh path, which cannot mint an attestation. It is recorded on every release run rather than passed over silently: these versions ship without verifiable provenance, and that is a standing gap, not a resolved one.`,
    );
  }
  for (const r of inconclusive) {
    console.log(
      `::warning::${r.spec}: provenance could NOT be determined — ${r.detail}. This is a failure to check, not a failed check: it is explicitly not being reported as a dangling commit, and it is not failing the run.`,
    );
  }

  writeStepSummary(mode, summary, { dangling, waived, absent, verifiedNothing, acknowledge: options.acknowledge });

  return dangling.length > 0 ? 1 : 0;
}

function writeStepSummary(mode, rows, state) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const verdict = state.verifiedNothing
    ? "**VERIFIED NOTHING** — zero package versions were in scope. Not a pass; see the job log."
    : state.dangling.length > 0
      ? `**FAILED** — ${state.dangling.length} attestation(s) pin a commit GitHub cannot resolve (LCLI-481).`
      : state.waived.length > 0
        ? `**WAIVED for this dispatch** against "${state.acknowledge}" — ${state.waived.length} dangling finding(s) are still dangling.`
        : state.absent.length > 0
          ? `Passed, with ${state.absent.length} package(s) shipping no provenance at all (LCLI-482, open).`
          : "Passed.";
  const lines = [
    `### Release provenance (${mode})`,
    "",
    "| outcome | package | pinned commit | detail |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    verdict,
    "",
  ];
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  } catch {
    // A summary that cannot be written must never change the verdict.
  }
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { mode: "", limit: 10, waitSeconds: 0, version: "", acknowledge: "", expectedRepo: "", packages: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pre" || arg === "--post") {
      if (options.mode) throw new Error("--pre and --post are mutually exclusive");
      options.mode = arg.slice(2);
    } else if (arg === "--limit") {
      options.limit = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(options.limit) || options.limit < 1) throw new Error("--limit needs a positive integer");
    } else if (arg === "--wait-seconds") {
      options.waitSeconds = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(options.waitSeconds) || options.waitSeconds < 0) {
        throw new Error("--wait-seconds needs a non-negative integer");
      }
    } else if (arg === "--version") {
      options.version = argv[++i] ?? "";
      if (!options.version) throw new Error("--version needs a value");
    } else if (arg === "--package") {
      const name = argv[++i] ?? "";
      if (!name) throw new Error("--package needs a value");
      options.packages.push(name);
    } else if (arg === "--acknowledge") {
      // Deliberately NOT a boolean. A bare "--yes I know" flag would be indistinguishable in
      // the log from a gate nobody read; requiring a reference means the waiver names the
      // record it is accountable to.
      options.acknowledge = (argv[++i] ?? "").trim();
      if (!options.acknowledge) throw new Error("--acknowledge needs a reference (the task id tracking the loss)");
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!options.mode) throw new Error("one of --pre or --post is required");
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${describeError(error)}`);
    console.error(
      "usage: node scripts/release-provenance.mjs (--pre | --post) [--limit N] [--wait-seconds N] [--version V] [--package NAME]... [--acknowledge REF]",
    );
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  } catch (error) {
    console.error(`::error::could not read ${PACKAGE_JSON}: ${describeError(error)}`);
    process.exit(3);
  }
  options.expectedRepo = String(manifest?.repository?.url ?? "")
    .replace(/^git\+/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");

  if (options.acknowledge) {
    console.log(
      `::warning::running with a dangling-provenance waiver for this dispatch: "${options.acknowledge}". Any dangling finding below is reported and then waived rather than failing the run.`,
    );
  }

  let checked;
  try {
    // THE ONLY TEST HOOK IN THIS FILE. Nothing statically analyses scripts/ (LCLI-486), so the
    // test suite is the whole of the safety net — and the exit-3 path below is unreachable from
    // any test without a way to make this script fail the way a defect in it would. An error
    // path in a gate's own error handling that has never once executed is precisely the thing
    // that turns out to be broken the day it fires.
    if (process.env.LORE_PROVENANCE_SELFTEST_THROW) {
      throw new TypeError("selftest: simulated defect inside the gate itself");
    }
    checked = options.mode === "pre" ? await runPre(options, manifest) : await runPost(options, manifest);
  } catch (error) {
    // A REMOTE that would not answer is a failure to check: loud, not red, for the same
    // reason a rate limit is not. A failure of any OTHER kind is a bug in THIS script, and
    // passing on it would mean a broken gate reports success — so that one goes red (exit 3),
    // named as our defect rather than dressed up as a finding about an artifact.
    if (error instanceof RemoteUnavailableError) {
      console.log(
        `::warning::the ${options.mode} provenance check could not run: ${error.message}. No conclusion is being drawn about any attestation, and nothing was verified.`,
      );
      process.exit(0);
    }
    console.error(
      `::error::the ${options.mode} provenance check CRASHED — this is a defect in scripts/release-provenance.mjs, not a finding about any published artifact. Nothing was verified. ${describeError(error)}`,
    );
    if (error instanceof Error && error.stack) console.error(error.stack);
    process.exit(3);
  }

  process.exit(report(checked, options.mode, options));
}

await main();
