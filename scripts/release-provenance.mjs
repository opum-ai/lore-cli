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
 *           registry: for each published release of the launcher newer than the
 *           KNOWN_DANGLING_THROUGH baseline, re-resolves the commit pinned by EVERY package
 *           of that release (see RELEASES, NOT VERSION STRINGS below). This is the mode that detects a history rewrite that happened
 *           between two releases — the damage is done to the earlier release, and the signal
 *           is that its previously-good provenance stopped resolving. Catching it here stops
 *           the release in progress from adding another version to the pile before anyone
 *           has decided what to do about the rewrite.
 *
 *           WHY ALL SEVEN PACKAGES AND NOT JUST THE LAUNCHER. An earlier revision sampled the
 *           launcher alone, justified as "verify-versions asserts one version across every
 *           manifest, so they share a commit". That warrant was FALSE and is recorded here so
 *           it does not get reintroduced: verify-versions asserts version/license/author/
 *           os/cpu/pin equality and says nothing whatsoever about commits. And one version CAN
 *           be published by two runs: release.yml's `publish_or_skip` skips an already-published
 *           package when its registry integrity equals the resuming run's tarball, so a
 *           partially-failed publish finished by a different run (or by
 *           scripts/publish-release.sh) whose tarballs are byte-identical leaves packages
 *           published from two commits. That needs byte-identical rebuilds: a same-commit
 *           rebuild was byte-identical the one time it was measured, and a rebuild from a
 *           different commit is unmeasured. When it happens a launcher-only probe sees one
 *           commit of two. Commit lookups are cached per repo+sha, so the
 *           normal case (all seven pinning one commit) still costs a single GitHub call.
 *
 *           RELEASES, NOT VERSION STRINGS (LCLI-627). Since LCLI-621 the launcher stages as
 *           X-rc.N, so its packument holds rc strings the platform packages never have: a
 *           Release run publishes the platforms at X only. --pre therefore groups the launcher's
 *           versions into releases by X — a version with ONLY a trailing -rc.N stripped, so a
 *           prerelease X such as 1.0.0-beta.1 is a release of its own and every other string is
 *           its own release too (see groupReleases) — and, per release, checks every
 *           platform package at X exactly once and the launcher at each version it actually
 *           has — each rc, and X once promote-latest.mjs has published it — exactly once. A
 *           release whose launcher packument holds only rcs (staged, not yet promoted, or
 *           abandoned) still has its platforms re-verified at X. --limit counts releases. An
 *           earlier revision checked all seven packages at every version string: each rc asked
 *           for six platform versions that can never exist, the platforms at X went unchecked
 *           until promotion (forever, for an abandoned rc), and three rcs of one release filled
 *           a --limit 3 window on their own.
 *
 *           The package set comes from the CURRENT package.json, so a platform package added
 *           after a scanned version existed reads as `absent` for it. That is honest (that
 *           package really has no attestation at that version) and loud rather than red — the
 *           alternative, reconstructing each historical release's package set, would infer it
 *           from the same registry data whose trustworthiness is the thing in question.
 *
 *   --post  Runs AFTER the publish job. Looks at what THIS release just produced: the six
 *           platform packages at X and the launcher at X-rc.N (LCLI-625). It cannot un-publish
 *           anything; what it does is put the verdict on the release run, so an attested
 *           release that pins an unreachable commit is known within minutes rather than after
 *           a user reports it.
 *
 *           WHY THE LAUNCHER IS CHECKED AT X-rc.N AND NEVER AT X. Since LCLI-621 (constitution
 *           Article 3 clause 5 as amended by ODOC-302) a Release run stages the launcher as
 *           X-rc.N; the launcher at X reaches npm only later, when scripts/promote-latest.mjs
 *           fresh-publishes it --tag latest from an operator's machine. An earlier revision
 *           checked every package at X, so on a publish:true run it asked for a launcher
 *           version that did not exist yet and never looked at the rc the run DID publish —
 *           a check on the wrong object that still passed. N is release.yml's `launcher_rc`
 *           input, passed as --launcher-rc and REQUIRED in this mode: a default here would
 *           quietly check rc.1 on a re-stage that published rc.2. The version is assigned by
 *           package NAME (the launcher is package.json's own `name`), so a --package override
 *           cannot route the launcher back to X either. The X launcher carries no provenance
 *           at all — "provenance-missing, byte-bound to the qualified rc" — and restoring it is
 *           opum-agent's OPAG-127, for both CLIs; this mode says so on every run.
 *
 *           NOT PUBLISHED IS NOT ABSENT (LCLI-628). npm's attestation endpoint answers a version
 *           that was never published with the SAME 404 `{"error":"Not found"}` it gives a
 *           published version with no attestation — measured 2026-09-28 (npm 12.1.0) against
 *           @opum-ai/lore@0.11.0 (published, unattested) and @opum-ai/lore@9.9.9-rc.1 (never
 *           published): identical status, identical body. So an attestation 404 alone cannot say
 *           which one it is. That matters on the run this job exists for: release.yml publishes the
 *           six platform packages first and the launcher X-rc.N LAST, and provenance-post still
 *           runs when publish failed, so a publish that died before the launcher used to report the
 *           launcher `absent` with the LCLI-482 manual-publish explanation — wrong cause — and, if
 *           any platform package was attested, spend the whole propagation window polling for an
 *           attestation on a version that does not exist.
 *
 *           So pass 1 of --post asks whether the version exists BEFORE reading the attestation
 *           (versionOnRegistry). Version present -> check the attestation as before. Version
 *           document 404 AND the package's packument answers without it -> `not-published`: its
 *           own outcome and warning, naming a partial publish, never `absent`, never waited on.
 *           Anything short of that (network, 5xx, a 404 for the whole package, no versions map)
 *           -> unknown, which is NEVER read as not-published: the
 *           attestation is still read, because a 200 there proves the version exists and a
 *           dangling pin must not go unchecked because a different endpoint was down; only
 *           "existence unknown AND attestation 404" is reported, as `inconclusive`. --pre does not
 *           take this read: every version it checks comes from the packument it already read.
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
 *   0  pass — including "no attestation", "not published", "could not determine", and
 *      "acknowledged", all annotated loudly
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
  /** the version is on the registry, with no attestation published for it */
  ABSENT: "absent",
  /**
   * --post only: the package's packument answered and does not list this version, so there is
   * no attestation to be missing — the version itself is (see NOT PUBLISHED IS NOT ABSENT).
   */
  NOT_PUBLISHED: "not-published",
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
 * A prerelease/build suffix is stripped rather than ordered, so `0.6.0-rc.1` compares as
 * `0.6.0` — the conservative answer for a baseline test, and the same answer semver precedence
 * gives against a release baseline (X-rc.N sits above every release below X). It also means
 * compareVersions treats X-rc.N and X as EQUAL, so nothing may rely on it to separate or order
 * them: --pre groups and orders them itself (groupReleases, LCLI-627).
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

/**
 * A TRAILING `-rc.N`, N a positive integer with no leading zero. This is the same N grammar as
 * --launcher-rc and release.yml's `launcher_rc`: the launcher at X-rc.N is the one shape LCLI-621
 * stages that the platform packages never have. Group 1 is X, whatever X is.
 */
const LAUNCHER_RC = /^(.+)-rc\.([1-9][0-9]*)$/;

/** Plain code-unit string order: deterministic, locale-free. */
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The release a launcher version belongs to: X for `X-rc.N` (when X is itself semver-shaped),
 * and otherwise the version string itself. Only a trailing -rc.N is stripped — nothing else.
 *
 * @param {string} version
 * @returns {{release: string, rc: number}} rc is N, or 0 for the release's own version
 */
function releaseOf(version) {
  const rc = LAUNCHER_RC.exec(version);
  const release = rc?.[1] ?? "";
  if (rc && parseVersion(release)) return { release, rc: Number(rc[2]) };
  return { release: version, rc: 0 };
}

/**
 * Order two releases, oldest first. Decided here, NOT by compareVersions, which strips every
 * suffix and so calls 1.0.0-beta.1 and 1.0.0 (and X-rc.N and X) equal, leaving their order to
 * whatever key order the registry served.
 *   1. semver-shaped releases before unparseable ones, which sort last by string — the same
 *      place compareVersions puts them;
 *   2. by numeric M.m.p core;
 *   3. same core: a suffixed release (a prerelease X such as 1.0.0-beta.1) before the bare one,
 *      as semver precedence has it; two suffixed releases of one core by plain string order.
 *      That is NOT full semver prerelease precedence (beta.10 sorts before beta.2) — it is only
 *      a deterministic tiebreak, and it matters only to where --limit cuts and to report order.
 *
 * @param {{release: string, parseable: boolean}} a
 * @param {{release: string, parseable: boolean}} b
 */
function compareReleases(a, b) {
  if (a.parseable !== b.parseable) return a.parseable ? -1 : 1;
  if (!a.parseable) return byString(a.release, b.release);
  const core = compareVersions(a.release, b.release);
  if (core !== 0) return core;
  const aSuffixed = /[-+]/.test(a.release);
  const bSuffixed = /[-+]/.test(b.release);
  if (aSuffixed !== bSuffixed) return aSuffixed ? -1 : 1;
  return byString(a.release, b.release);
}

/**
 * Group the launcher's published versions into RELEASES, oldest release first (LCLI-627).
 *
 * WHY GROUP AT ALL. A release X is the unit a Release run publishes: the platform packages at X
 * and the launcher at X-rc.N, with the launcher at X following later from promote-latest.mjs. So
 * the launcher's packument can hold several strings for one release (X-rc.1, X-rc.2, X) while the
 * platforms hold exactly one (X). Checking every package at every string asks for platform
 * versions that cannot exist and lets rcs crowd releases out of --limit.
 *
 * GROUPING. X is found by stripping ONLY a trailing -rc.N (see LAUNCHER_RC), and only when what
 * is left is semver-shaped: X-rc.N and X share one group, and the platforms are checked at X.
 * EVERY OTHER VERSION STRING IS ITS OWN RELEASE, checked at that exact string for every package.
 * That includes a prerelease X — 1.0.0-beta.1 is a release of its own, distinct from 1.0.0, and
 * 1.0.0-beta.1-rc.1 is its rc; scripts/publish-release.sh accepts any version that starts with a
 * digit, so that shape is possible. An earlier revision of this fix grouped by numeric core, so it
 * checked the platforms at 1.0.0 (which did not exist) instead of 1.0.0-beta.1 (which did), and
 * merged the two releases into one --limit slot (LCLI-627 review). A string that does not match
 * the rc grammar exactly (X-rc.0, X-rc.01) is also its own release. A version that is not
 * semver-shaped at all is likewise its own release, checked at every package: nothing is known
 * about it, so nothing is assumed (see parseVersion).
 *
 * ORDER: releases by compareReleases; within a release, X-rc.N ascending by NUMERIC N (rc.2
 * before rc.10), then X itself last, because X is published after its rcs. The in-release order
 * fixes the report order only; it never changes WHICH specs are checked.
 *
 * @param {string[]} versions the launcher packument's version keys, in any order
 * @returns {{release: string, parseable: boolean, launcherVersions: string[]}[]}
 */
function groupReleases(versions) {
  /** @type {Map<string, {release: string, parseable: boolean, launcherVersions: string[], rcOf: Map<string, number>}>} */
  const byRelease = new Map();
  for (const version of new Set(versions)) {
    const { release, rc } = releaseOf(version);
    let group = byRelease.get(release);
    if (!group) {
      group = { release, parseable: parseVersion(release) !== null, launcherVersions: [], rcOf: new Map() };
      byRelease.set(release, group);
    }
    group.launcherVersions.push(version);
    group.rcOf.set(version, rc);
  }

  // X itself (rc 0) goes last; rcs by numeric N.
  const inRelease = (group) => (version) => {
    const n = group.rcOf.get(version) ?? 0;
    return n === 0 ? Number.POSITIVE_INFINITY : n;
  };
  return [...byRelease.values()]
    .map((group) => {
      const rank = inRelease(group);
      const launcherVersions = [...group.launcherVersions].sort((a, b) => rank(a) - rank(b));
      return { release: group.release, parseable: group.parseable, launcherVersions };
    })
    .sort(compareReleases);
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
  // expected answer for every manually published version — AND, byte for byte, for a version
  // that was never published (LCLI-628). `absent` here therefore means "no attestation"; it is
  // checkPublishedOne's existence read, not this 404, that says whether the version is there.
  if (response.status === 404) return { state: "absent", detail: "registry has no attestations for this version" };
  if (!response.ok) return { state: "error", detail: `registry returned HTTP ${response.status}` };

  /** @type {any} — the registry's response shape is not ours to declare; guarded below. */
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
    return {
      ...record,
      outcome: OUTCOME.UNREADABLE,
      detail: "provenance names no source repository to resolve against",
    };
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
 * Published versions of a package, from its packument. Sorted by compareVersions, which leaves
 * X and X-rc.N in key order — --pre does its own ordering in groupReleases and needs none here.
 * @param {string} name
 */
async function publishedVersions(name) {
  return (await packumentVersions(name)).sort(compareVersions);
}

/**
 * The version keys of a package's abbreviated packument, in the registry's key order. Throws
 * RemoteUnavailableError for EVERY answer that is not "200 with a versions map" — including a
 * 404 for the whole package — so a caller can never mistake a registry that did not answer for
 * one that answered "no such version".
 *
 * @param {string} name
 * @returns {Promise<string[]>}
 */
async function packumentVersions(name) {
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
  /** @type {any} — packument shape is the registry's, not ours; validated on the next line. */
  const body = await response.json().catch(() => null);
  const versions = body?.versions;
  if (!versions || typeof versions !== "object") {
    throw new RemoteUnavailableError(`the packument for ${name} carried no versions map`);
  }
  return Object.keys(versions);
}

/**
 * Is package@version on the registry at all? (LCLI-628; see NOT PUBLISHED IS NOT ABSENT.)
 *
 * Same shape as the GitHub side's "422 corroborated by the repository resolving": a VERSIONED
 * 404 is never believed on its own, because it looks the same whether the version is missing or
 * something between here and the registry is. It is believed only once a PACKAGE-level read has
 * answered and does not list the version either.
 *
 *   version document 200                         -> published
 *   version document 404, packument 200 without  -> not-published. The only way to get it.
 *   version document 404, packument 200 with     -> published (the package-level answer wins;
 *                                                   two reads of a propagating registry can
 *                                                   disagree for a while)
 *   version document 404, packument unreadable   -> unknown (thrown fetch, 5xx, a 404 for the
 *                                                   whole package, no versions map)
 *   version document anything else, or thrown    -> unknown
 *
 * `unknown` is NEVER not-published: see checkPublishedOne for what it does instead.
 *
 * @param {string} name
 * @param {string} version
 * @returns {Promise<{state: "published"|"not-published"|"unknown", detail: string}>}
 */
async function versionOnRegistry(name, version) {
  let response;
  try {
    response = await request(`${REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
      accept: "application/json",
    });
  } catch (error) {
    return { state: "unknown", detail: `the registry did not answer for ${name}@${version}: ${describeError(error)}` };
  }
  if (response.ok) return { state: "published", detail: `the registry serves ${name}@${version}` };
  if (response.status !== 404) {
    return { state: "unknown", detail: `the registry answered HTTP ${response.status} for ${name}@${version}` };
  }

  let versions;
  try {
    versions = await packumentVersions(name);
  } catch (error) {
    if (!(error instanceof RemoteUnavailableError)) throw error;
    return {
      state: "unknown",
      detail: `the registry answered 404 for ${name}@${version}, and a 404 alone is not proof of absence; the package-level read that would corroborate it failed: ${error.message}`,
    };
  }
  if (versions.includes(version)) {
    return {
      state: "published",
      detail: `the packument for ${name} lists ${version} (its version document did not answer yet)`,
    };
  }
  return {
    state: "not-published",
    detail: `the registry answered 404 for ${name}@${version}, and ${name}'s packument answers without it (${versions.length} version(s) listed)`,
  };
}

/**
 * --post pass 1 for one package@version: existence first, then the attestation (LCLI-628).
 *
 * @param {string} name
 * @param {string} version
 * @param {string} expectedRepo
 */
async function checkPublishedOne(name, version, expectedRepo) {
  const existence = await versionOnRegistry(name, version);
  if (existence.state === "not-published") {
    return { name, version, spec: `${name}@${version}`, outcome: OUTCOME.NOT_PUBLISHED, detail: existence.detail };
  }
  const result = await checkOne(name, version, expectedRepo);
  // Existence unknown, and the attestation endpoint's 404 cannot say whether the version exists
  // either: neither `absent` (which asserts it is published) nor `not-published` (which asserts
  // it is not) is warranted. Any other attestation answer stands on its own — a readable
  // attestation proves the version exists, so a dangling pin is still caught during an outage
  // of the packument endpoint.
  if (existence.state === "unknown" && result.outcome === OUTCOME.ABSENT) {
    return {
      ...result,
      outcome: OUTCOME.INCONCLUSIVE,
      detail: `could not confirm ${name}@${version} is on the registry (${existence.detail}), and the attestation endpoint's answer (${result.detail}) is the same for a version that was never published — so whether it is published without an attestation, or not published at all, is unknown`,
    };
  }
  return result;
}

/** The launcher plus every platform package it pins — this release's full package set. */
function releasePackages(options, manifest) {
  if (options.packages.length > 0) return options.packages;
  return [manifest.name, ...Object.keys(manifest.optionalDependencies ?? {})];
}

/**
 * The exact package@version set a Release run publishes (LCLI-625): every platform package at X
 * and the launcher at X-rc.N. The version is chosen by NAME, not by position or by whether a
 * --package override was given, so no path through --post can ask for the launcher at X.
 *
 * @param {{launcherRc: string, packages: string[]}} options
 * @param {{name: string, optionalDependencies?: Record<string, string>}} manifest
 * @param {string} version X
 * @returns {{name: string, version: string}[]}
 */
function postReleaseSpecs(options, manifest, version) {
  const rcVersion = `${version}-rc.${options.launcherRc}`;
  return releasePackages(options, manifest).map((name) => ({
    name,
    version: name === manifest.name ? rcVersion : version,
  }));
}

/**
 * The exact package@version set --pre checks for one release group (LCLI-627). Platform packages
 * are checked at X ONLY — never at an X-rc.N string, which no platform is ever published at — and
 * exactly once per release however many launcher versions it has, including a release whose
 * launcher packument holds only rcs. The launcher is checked at each version it actually has,
 * once each; it is chosen by NAME, as in postReleaseSpecs. X is the exact string groupReleases
 * derived (a prerelease X such as 1.0.0-beta.1 included), so a release with no rcs has every
 * package checked at that one string. An unparseable group is checked at every package too.
 *
 * @param {{release: string, parseable: boolean, launcherVersions: string[]}} group
 * @param {string[]} packages
 * @param {string} launcherName
 * @returns {{name: string, version: string}[]}
 */
function preReleaseSpecs(group, packages, launcherName) {
  if (!group.parseable) return packages.map((name) => ({ name, version: group.release }));
  /** @type {{name: string, version: string}[]} */
  const specs = [];
  for (const name of packages) {
    if (name === launcherName) {
      for (const version of group.launcherVersions) specs.push({ name, version });
    } else {
      specs.push({ name, version: group.release });
    }
  }
  return specs;
}

async function runPre(options, manifest) {
  const launcher = manifest.name;
  const packages = releasePackages(options, manifest);
  const all = await publishedVersions(launcher);

  // Group first, then decide baseline and window on RELEASES (LCLI-627). A release is at or below
  // the baseline exactly when its X is, and every launcher string of it (rcs included) goes with
  // it. isAtOrBelowBaseline reads X's numeric core, so a prerelease X of the baseline's own core
  // (0.6.0-beta.1) counts as at or below it, which is what semver precedence says too.
  const groups = groupReleases(all);
  const baselineGroups = groups.filter((g) => g.parseable && isAtOrBelowBaseline(g.release));
  const baseline = baselineGroups.flatMap((g) => g.launcherVersions);
  const unparseable = all.filter((v) => parseVersion(v) === null);
  const candidates = groups.filter((g) => !(g.parseable && isAtOrBelowBaseline(g.release)));
  // --limit counts releases, not version strings: three rcs of one release take one slot.
  const scanned = candidates.slice(-options.limit);
  const specs = scanned.flatMap((g) => preReleaseSpecs(g, packages, launcher));

  console.log(`--pre  re-verifying provenance already on the registry for ${launcher}`);
  console.log(
    `       ${all.length} published version(s) in ${groups.length} release(s); ${baselineGroups.length} release(s) at or below the ${KNOWN_DANGLING_THROUGH} baseline; ${candidates.length} release(s) to re-verify, taking the most recent ${scanned.length}: ${scanned.map((g) => g.release).join(", ") || "none"} — ${specs.length} package version(s)`,
  );
  console.log(
    "       per release X: the platform packages at X only (never at an X-rc.N string), the launcher at each version it has (X-rc.N and/or X), each exactly once; X is a version with only a trailing -rc.N stripped",
  );
  if (baseline.length > 0) {
    console.log(
      `       baseline set (provenance destroyed by the 2026-09-10 rewrite, unrepairable, listed not re-checked): ${baseline.join(", ")}`,
    );
  }
  if (unparseable.length > 0) {
    // Loudly, because the alternative is the silent skip an earlier revision had.
    console.log(
      `::warning::the registry lists ${unparseable.length} version(s) that are not semver-shaped: ${unparseable.join(", ")}. They are NOT assumed to be below the baseline — each is its own release, sorted after every semver-shaped one, and checked at that exact string for every package.`,
    );
  }

  const results = [];
  for (const spec of specs) {
    results.push(await checkOne(spec.name, spec.version, options.expectedRepo));
  }
  return { results, scannedVersions: scanned.length, notes: [] };
}

async function runPost(options, manifest) {
  const version = options.version || manifest.version;
  // verify-versions has already asserted every manifest shares X and that root's
  // optionalDependencies pin it exactly. The Release run publishes those six platform packages
  // at X and the launcher at X-rc.N (LCLI-621), so THAT is the set this release published —
  // not the launcher at X, which scripts/promote-latest.mjs publishes later (LCLI-625).
  const specs = postReleaseSpecs(options, manifest, version);
  const rcVersion = `${version}-rc.${options.launcherRc}`;
  const launcherFinal = `${manifest.name}@${version}`;

  console.log(
    `--post checking the provenance this release just produced: ${specs.length} package(s): ${specs.map((s) => `${s.name}@${s.version}`).join(", ")}`,
  );
  // Said on every run, in the log and the job summary, so the absence of a launcher@X row is
  // never read as that launcher having been checked and found clean (OPAG-127 wording).
  const notes = [
    `${launcherFinal} is NOT checked here, because this run does not publish it: the Release run stages the launcher as ${rcVersion}, and scripts/promote-latest.mjs will publish ${launcherFinal} later with --tag latest, outside the CI OIDC path, so it will carry no provenance. It will be provenance-missing, byte-bound to the qualified rc: before that publish, promote-latest.mjs will require the equivalence gate to find it identical to the qualified ${rcVersion} once ${rcVersion} is substituted for ${version}, and its sha256 to equal finalTarball.sha256 in the pass-1 qualification receipt, which does not exist yet when this check runs. That binding is not a substitute for provenance, which attests where and from what the bytes were built (workflow, commit, runner). Restoring provenance on that final publish is opum-agent's OPAG-127, for both CLIs.`,
  ];
  for (const note of notes) console.log(`       ${note}`);

  // PASS 1 — no waiting. Ask every package once: is it on the registry, then what does its
  // attestation say (LCLI-628). A `not-published` result is final here — pass 2 only ever
  // revisits `absent`, which now means "published, no attestation yet" and nothing else.
  const results = [];
  for (const spec of specs) {
    results.push(await checkPublishedOne(spec.name, spec.version, options.expectedRepo));
  }

  // PASS 2 — propagation grace, but ONLY when it can possibly pay out. Attestations lag the
  // registry read API the same way tarballs do (LCLI-460: 0.5.0 took ~25 minutes), so a
  // genuinely attested release could be reported unattested purely because the check was
  // fast. But if NOT ONE package of this release has an attestation, the release was not
  // attested at all — the structural case with LCLI-482 open — and polling would burn the
  // whole window to re-learn what pass 1 already established. Each package that does wait
  // gets its OWN deadline; an earlier revision shared one across all seven, so the first
  // package could consume the entire window and leave the rest no grace at all.
  // A version that is not on the registry gets no window at all (LCLI-628): there is no
  // attestation propagating for a version nobody published, however many siblings are attested.
  // `commit` is absent on the early-return arms (provenance absent/unreadable/error), which
  // is precisely the case this asks about: no commit means not attested. Reading a property
  // that only some union arms carry is intentional here, not an oversight.
  const anyAttested = results.some((r) => Boolean(/** @type {any} */ (r).commit));
  if (options.waitSeconds > 0 && anyAttested) {
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.outcome !== OUTCOME.ABSENT) continue;
      // Each result carries its OWN version: the launcher's is X-rc.N, the platforms' X.
      const name = results[i]?.name ?? "";
      const specVersion = results[i]?.version ?? "";
      const deadline = Date.now() + options.waitSeconds * 1000;
      while (Date.now() < deadline) {
        const remaining = Math.ceil((deadline - Date.now()) / 1000);
        console.log(
          `       ${name}@${specVersion}: no attestation yet, but other packages in this release have one; ${remaining}s of its propagation window left`,
        );
        await defaultSleep(Math.min(15000, Math.max(1000, deadline - Date.now())));
        // specVersion, NOT the release's X: for the launcher that would retry a version this
        // run never published. Pinned by the lagging-launcher test (LCLI-625 review).
        const retry = await checkOne(name, specVersion, options.expectedRepo);
        results[i] = retry;
        if (retry.outcome !== OUTCOME.ABSENT) break;
      }
    }
  } else if (options.waitSeconds > 0) {
    console.log(
      `       not one package of this release carries an attestation, so there is nothing propagating to wait for — skipping the ${options.waitSeconds}s window rather than spending it to re-learn that.`,
    );
  }

  return { results, scannedVersions: 1, notes };
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

/**
 * @param {{results: any[], scannedVersions: number, notes: string[]}} checked
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
  const notPublished = results.filter((r) => r.outcome === OUTCOME.NOT_PUBLISHED);
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
  if (notPublished.length > 0) {
    // Deliberately NOT the LCLI-482 text above: that explains a published version with no
    // attestation, and these versions are not published at all (LCLI-628).
    console.log(
      `::warning::${notPublished.length} package version(s) this ${mode} check expected are NOT ON THE REGISTRY: ${notPublished.map((r) => r.spec).join(", ")}. This is not a missing attestation, and LCLI-482 does not explain it: each package's packument answered and does not list that version. The likely cause is a PARTIAL PUBLISH — the publish job stopped before these went out. release.yml publishes the platform packages first and the launcher X-rc.N last, so a publish that died partway leaves the launcher unpublished. The one other explanation is the registry read API lagging a publish that did succeed (LCLI-460); the publish job's own read-back step is where that shows. No propagation window was spent waiting on these: there is no attestation to wait for on a version nobody published. The sanctioned resume is "Re-run failed jobs" on the same run. This check does not fail the run.`,
    );
  }
  for (const r of inconclusive) {
    console.log(
      `::warning::${r.spec}: provenance could NOT be determined — ${r.detail}. This is a failure to check, not a failed check: it is explicitly not being reported as a dangling commit, and it is not failing the run.`,
    );
  }

  writeStepSummary(mode, summary, {
    dangling,
    waived,
    absent,
    notPublished,
    verifiedNothing,
    acknowledge: options.acknowledge,
    notes: checked.notes,
  });

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
        : state.notPublished.length > 0
          ? `Passed, but ${state.notPublished.length} package version(s) this release should have published are **NOT ON THE REGISTRY** — a partial publish, or read-API lag (LCLI-460); see the job log. That is not a missing attestation${state.absent.length > 0 ? `; separately, ${state.absent.length} published package(s) ship no provenance at all (LCLI-482, open)` : ""}.`
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
    ...state.notes.flatMap((note) => [note, ""]),
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
  /** @type {{ mode: string, limit: number, waitSeconds: number, version: string, launcherRc: string, acknowledge: string, expectedRepo: string, packages: string[] }} */
  const options = {
    mode: "",
    limit: 10,
    waitSeconds: 0,
    version: "",
    launcherRc: "",
    acknowledge: "",
    expectedRepo: "",
    packages: [],
  };
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
    } else if (arg === "--launcher-rc") {
      // N in X-rc.N, the launcher version this Release run staged. Same rule as release.yml's
      // own launcher_rc checks: a positive integer with no leading zero. Fail closed — a
      // malformed N would otherwise check a launcher version nobody published (LCLI-625).
      const rc = argv[++i] ?? "";
      if (!/^[1-9][0-9]*$/.test(rc)) {
        throw new Error(`--launcher-rc must be a positive integer with no leading zero (X-rc.N, N >= 1); got '${rc}'`);
      }
      options.launcherRc = rc;
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
  // Required, not defaulted, for --post: the launcher this run published is X-rc.N, and a
  // silent default of 1 would check the wrong rc on every re-stage (LCLI-625). --pre scans
  // published history and has no use for it, so passing it there is a mistake worth naming.
  if (options.mode === "post" && !options.launcherRc) {
    throw new Error("--post needs --launcher-rc N: the launcher a Release run publishes is X-rc.N, never X");
  }
  if (options.mode === "pre" && options.launcherRc) {
    throw new Error("--launcher-rc applies only to --post");
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${describeError(error)}`);
    console.error(
      "usage: node scripts/release-provenance.mjs (--pre [--limit N] | --post --launcher-rc N [--wait-seconds N] [--version V]) [--package NAME]... [--acknowledge REF]",
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
