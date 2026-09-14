#!/usr/bin/env node
/**
 * release-provenance.mjs — the release-time gate for dangling SLSA provenance (LCLI-481).
 *
 * WHAT WENT WRONG, AND WHAT THIS CAN AND CANNOT FIX
 *
 * Every `@opum-ai/lore*` version published from CI before 0.6.1 carries an npm SLSA
 * provenance attestation pinning a git commit in `resolvedDependencies[0].digest.gitCommit`.
 * This repository's history was destroyed and recreated on 2026-09-10, so those commits no
 * longer exist on GitHub: npmjs.com's provenance panel links a 404, and `npm audit signatures`
 * style verification against the source repo cannot reach the tree it names. 0.6.0 pins
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
 * contact, and then nobody trusts the next one either. Two consequences, both deliberate:
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
 * The only FAILURE is: an attestation is PRESENT and pins a commit the live GitHub API
 * definitively does not have. That is the LCLI-481 defect, and nothing else is.
 *
 * WHY THE LIVE GITHUB API AND NEVER `git cat-file`
 *
 * This is the whole point, not an implementation detail. A local clone that predates (or was
 * fetched across) the rewrite still holds the destroyed commits as loose objects, so
 * `git cat-file -e <sha>` SUCCEEDS on exactly the artifacts this gate exists to catch — and
 * succeeds silently. The authority for "does this commit exist" is the remote, so every
 * lookup here goes to api.github.com. There is no git invocation anywhere in this file, and
 * adding one would quietly convert the gate into a no-op.
 *
 * THE TWO MODES
 *
 *   --pre   Runs BEFORE the publish job, and gates it. Looks at what is ALREADY on the
 *           registry: for each published version of the launcher package newer than the
 *           KNOWN_DANGLING_THROUGH baseline, re-resolves the commit its attestation pins.
 *           This is the mode that detects a history rewrite that happened between two
 *           releases — the damage is done to the earlier release, and the signal is that its
 *           previously-good provenance stopped resolving. Catching it here stops the release
 *           in progress from adding another version to the pile before anyone has decided
 *           what to do about the rewrite.
 *
 *           It samples ONE package per historical version (the launcher) rather than all
 *           seven. Within a release every package is published from a single commit by a
 *           single workflow run — verify-versions asserts one version across every manifest,
 *           and the publish loop runs once — so the launcher is a sound probe for that
 *           release's provenance, at a seventh of the HTTP cost.
 *
 *   --post  Runs AFTER the publish job. Looks at what THIS release just produced: every
 *           package (launcher + each platform package) at the version being released. Full
 *           coverage rather than a sample, because this is the one release whose bytes are
 *           still hot and whose provenance nobody has ever checked. It cannot un-publish
 *           anything; what it does is put the verdict on the release run, so an attested
 *           release that pins an unreachable commit is known within minutes rather than
 *           after a user reports it.
 *
 * THE BASELINE, AND WHY --pre WOULD OTHERWISE BE USELESS
 *
 * Every attested version at or below KNOWN_DANGLING_THROUGH already dangles, permanently. A
 * --pre that failed on those would fail EVERY future release, forever, for damage no release
 * can repair — the exact "disabled on first contact" failure above. So versions at or below
 * the baseline are reported (with the commit they pin, so the historical damage stays on the
 * record each run) and not failed on. Versions ABOVE it are the ones a new rewrite would
 * break, and those fail.
 *
 * Raise KNOWN_DANGLING_THROUGH only when a rewrite has ALREADY destroyed the commits of the
 * versions being folded under it and that loss has been accepted and recorded on a task.
 * Raising it to silence a failure is how this gate becomes ceremony.
 *
 * EXIT CODES
 *   0  pass — including "no attestation" and "could not determine", both annotated loudly
 *   1  gate failure — an attestation pins a commit GitHub definitively does not have
 *   2  usage error
 *
 * TESTING WITHOUT A RELEASE
 *   LORE_PROVENANCE_REGISTRY   / LORE_PROVENANCE_GITHUB_API override the two endpoints, so
 *   the whole gate runs against a local stub server. Anything in a release path that cannot
 *   be exercised locally will not be exercised at all; see test/release-provenance.test.ts,
 *   which drives all three outcomes that way.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Versions at or below this carry provenance destroyed by the 2026-09-10 history rewrite
 * (LCLI-481). 0.3.5 through 0.6.0 are the attested set; 0.6.1 and later were published
 * manually and carry no attestation at all. See the header before changing this.
 */
const KNOWN_DANGLING_THROUGH = "0.6.0";

const SLSA_PREDICATE_TYPE = "https://slsa.dev/provenance/v1";
const REGISTRY = process.env.LORE_PROVENANCE_REGISTRY || "https://registry.npmjs.org";
const GITHUB_API = process.env.LORE_PROVENANCE_GITHUB_API || "https://api.github.com";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = join(SCRIPT_DIR, "..", "package.json");

/** Per-package verdicts. Only `dangling` fails the run; the rest are pass-with-a-note. */
const OUTCOME = {
  OK: "ok", //           attestation present, pinned commit resolves on GitHub
  DANGLING: "dangling", //   attestation present, GitHub says the commit does not exist
  BASELINE: "baseline", //   dangling, but at or below KNOWN_DANGLING_THROUGH — already known
  ABSENT: "absent", //       no attestation published for this package@version
  UNREADABLE: "unreadable", // attestation present but not in a shape we can read a commit from
  INCONCLUSIVE: "inconclusive", // the network, not the artifact, is what we could not resolve
};

// ---------------------------------------------------------------------------
// version ordering
// ---------------------------------------------------------------------------

/**
 * Numeric-triple comparison. Prerelease/build suffixes are stripped rather than ordered:
 * this project has never shipped one, and the only question asked of this function is which
 * side of a baseline a version falls on — where treating `0.6.0-rc.1` as `0.6.0` is the
 * conservative answer (it lands under the baseline, i.e. does not fail the run).
 */
function compareVersions(a, b) {
  const parse = (v) =>
    String(v)
      .split(/[-+]/)[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

const isAtOrBelowBaseline = (version) => compareVersions(version, KNOWN_DANGLING_THROUGH) <= 0;

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
 * @returns {{state: "found"|"absent"|"unreadable"|"error", commit?: string, repo?: string,
 *            ref?: string, detail?: string}}
 */
async function readProvenance(name, version) {
  let response;
  try {
    response = await fetch(attestationUrl(name, version), { headers: { accept: "application/json" } });
  } catch (error) {
    return { state: "error", detail: `registry request failed: ${error.message}` };
  }
  // 404 is npm's answer for "this version has no attestations", which is the normal,
  // expected answer for every manually published version.
  if (response.status === 404) return { state: "absent", detail: "registry has no attestations for this version" };
  if (!response.ok) return { state: "error", detail: `registry returned HTTP ${response.status}` };

  let body;
  try {
    body = await response.json();
  } catch (error) {
    return { state: "error", detail: `registry response was not JSON: ${error.message}` };
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
    return { state: "unreadable", detail: `could not decode the DSSE payload: ${error.message}` };
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

/**
 * Ask the live GitHub API whether a commit exists.
 *
 * The classification here is the part that must not be sloppy, because every wrong answer is
 * expensive in one direction or the other:
 *
 *   200                                     -> exists. Pass.
 *   422 "No commit found for SHA: <sha>"    -> DEFINITIVELY gone. This is the only answer
 *                                              that fails the gate, and it is what the
 *                                              destroyed 0.6.0 commit returns today.
 *   422 anything else                       -> inconclusive. An unrecognised 422 is not
 *                                              proof of a destroyed commit; a future API
 *                                              change must not start failing releases.
 *   404                                     -> inconclusive, NOT missing. On this endpoint
 *                                              404 means the REPOSITORY is not found or not
 *                                              accessible (renamed, private, bad token) —
 *                                              a missing commit in a visible repo is 422.
 *                                              Conflating the two would report every
 *                                              token/visibility problem as tampering.
 *   401/403/429                             -> inconclusive (auth or rate limit).
 *   5xx / thrown fetch                      -> retried, then inconclusive.
 *
 * Retries cover only the transient classes; a 200 or a recognised 422 is a final answer and
 * is never retried.
 *
 * @returns {{state: "resolved"|"missing"|"inconclusive", detail: string}}
 */
async function resolveCommit(repo, sha, { attempts = 3, backoffMs = 1000, sleep = defaultSleep } = {}) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "lore-cli-release-provenance" };
  if (GITHUB_TOKEN) headers.authorization = `Bearer ${GITHUB_TOKEN}`;

  let last = "no attempt made";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetch(`${GITHUB_API}/repos/${repo}/commits/${sha}`, { headers });
    } catch (error) {
      last = `request failed: ${error.message}`;
      if (attempt < attempts) await sleep(backoffMs * attempt);
      continue;
    }

    if (response.status === 200) return { state: "resolved", detail: `GitHub resolves ${sha} in ${repo}` };

    const text = await response.text().catch(() => "");
    if (response.status === 422) {
      if (/No commit found for SHA/i.test(text)) {
        return { state: "missing", detail: `GitHub: 422 No commit found for SHA ${sha} in ${repo}` };
      }
      return { state: "inconclusive", detail: `GitHub returned an unrecognised 422: ${firstLine(text)}` };
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

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const firstLine = (text) => String(text).replace(/\s+/g, " ").slice(0, 200);

function resetAt(response) {
  const reset = Number.parseInt(response.headers.get("x-ratelimit-reset") || "", 10);
  return Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : "unknown";
}

// ---------------------------------------------------------------------------
// one package@version, end to end
// ---------------------------------------------------------------------------

async function checkOne(name, version, expectedRepo) {
  const provenance = await readProvenance(name, version);
  const base = { name, version, spec: `${name}@${version}` };

  if (provenance.state === "absent") return { ...base, outcome: OUTCOME.ABSENT, detail: provenance.detail };
  if (provenance.state === "unreadable") return { ...base, outcome: OUTCOME.UNREADABLE, detail: provenance.detail };
  if (provenance.state === "error") return { ...base, outcome: OUTCOME.INCONCLUSIVE, detail: provenance.detail };

  const { commit, repo, ref } = provenance;
  const record = { ...base, commit, repo, ref };

  if (!repo) {
    return { ...record, outcome: OUTCOME.UNREADABLE, detail: "provenance names no source repository to resolve against" };
  }
  if (expectedRepo && repo !== expectedRepo) {
    // Not a failure: a rename or a legitimate fork looks exactly like this, and the commit is
    // still resolved against the repo the attestation itself names.
    record.repoMismatch = `provenance names ${repo}, package.json names ${expectedRepo}`;
  }

  // Baseline versions are not looked up at all. Their outcome is already known and fixed, the
  // lookup cannot change it, and skipping it keeps --pre's cost proportional to the versions
  // that could actually have regressed rather than to the whole publish history.
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

/** Published versions of a package, newest last, from its packument. */
async function publishedVersions(name) {
  const response = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (!response.ok) throw new Error(`could not read the packument for ${name}: HTTP ${response.status}`);
  const body = await response.json();
  return Object.keys(body?.versions ?? {}).sort(compareVersions);
}

async function runPre(options, manifest) {
  const launcher = manifest.name;
  const all = await publishedVersions(launcher);
  const newer = all.filter((v) => !isAtOrBelowBaseline(v));
  const scanned = newer.slice(-options.limit);
  const skipped = all.filter((v) => isAtOrBelowBaseline(v));

  console.log(`--pre  re-verifying provenance already on the registry for ${launcher}`);
  console.log(
    `       ${all.length} published version(s); ${skipped.length} at or below the ${KNOWN_DANGLING_THROUGH} baseline; ${newer.length} newer, checking the most recent ${scanned.length}`,
  );
  if (skipped.length > 0) {
    console.log(
      `       baseline set (provenance destroyed by the 2026-09-10 rewrite, unrepairable, not failed on): ${skipped.join(", ")}`,
    );
  }

  const results = [];
  for (const version of scanned) {
    results.push(await checkOne(launcher, version, options.expectedRepo));
  }
  return results;
}

async function runPost(options, manifest) {
  const version = options.version || manifest.version;
  // The launcher plus every platform package it pins. verify-versions has already asserted
  // that those pins are exact and equal to the root version, so this is the complete set of
  // packages this release published.
  const packages = options.packages.length > 0 ? options.packages : [manifest.name, ...Object.keys(manifest.optionalDependencies ?? {})];

  console.log(`--post checking the provenance this release just produced: ${packages.length} package(s) at ${version}`);

  const deadline = Date.now() + options.waitSeconds * 1000;
  const results = [];
  for (const name of packages) {
    let result = await checkOne(name, version, options.expectedRepo);
    // Attestations propagate on the registry's own schedule, the same read-API lag LCLI-460
    // documents for tarballs. Without a bounded wait, a genuinely attested release publishes
    // and is then reported as unattested purely because the check was fast. Only `absent` is
    // retried — every other outcome is already a real answer about real bytes.
    while (result.outcome === OUTCOME.ABSENT && Date.now() < deadline) {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      console.log(`       ${name}@${version}: no attestation yet; ${remaining}s of the propagation window left`);
      await defaultSleep(Math.min(15000, Math.max(1000, deadline - Date.now())));
      result = await checkOne(name, version, options.expectedRepo);
    }
    results.push(result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

const ANNOTATION = {
  [OUTCOME.DANGLING]: "error",
  [OUTCOME.ABSENT]: "warning",
  [OUTCOME.BASELINE]: "warning",
  [OUTCOME.UNREADABLE]: "warning",
  [OUTCOME.INCONCLUSIVE]: "warning",
};

function report(results, mode) {
  const summary = [];
  for (const r of results) {
    // One stable line per package: outcome first so a log is greppable and a test can assert
    // on it without parsing prose.
    console.log(`${r.outcome.padEnd(12)} ${r.spec}  ${r.detail}`);
    if (r.repoMismatch) console.log(`::warning::${r.spec}: ${r.repoMismatch}`);
    summary.push(`| \`${r.outcome}\` | \`${r.spec}\` | ${r.commit ? `\`${r.commit}\`` : "—"} | ${r.detail} |`);
  }

  const dangling = results.filter((r) => r.outcome === OUTCOME.DANGLING);
  const absent = results.filter((r) => r.outcome === OUTCOME.ABSENT);
  const inconclusive = results.filter(
    (r) => r.outcome === OUTCOME.INCONCLUSIVE || r.outcome === OUTCOME.UNREADABLE,
  );

  for (const r of dangling) {
    console.log(
      `::error::${r.spec} carries SLSA provenance pinning commit ${r.commit}, which the live GitHub API says does not exist in ${r.repo}. That is the LCLI-481 failure mode: on npmjs.com this reads as tampering, and it cannot be repaired after the fact because the attestation is signed and the version cannot be republished. Something rewrote this repository's history after that release. Do not raise KNOWN_DANGLING_THROUGH in scripts/release-provenance.mjs to make this green.`,
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

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `### Release provenance (${mode})`,
      "",
      "| outcome | package | pinned commit | detail |",
      "| --- | --- | --- | --- |",
      ...summary,
      "",
      dangling.length > 0
        ? `**FAILED** — ${dangling.length} attestation(s) pin a commit GitHub cannot resolve (LCLI-481).`
        : absent.length > 0
          ? `Passed, with ${absent.length} package(s) shipping no provenance at all (LCLI-482, open).`
          : "Passed.",
      "",
    ];
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
    } catch {
      // A summary that cannot be written must never change the verdict.
    }
  }

  return dangling.length > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { mode: "", limit: 10, waitSeconds: 0, version: "", packages: [] };
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
    console.error(`::error::${error.message}`);
    console.error("usage: node scripts/release-provenance.mjs (--pre | --post) [--limit N] [--wait-seconds N] [--version V] [--package NAME]...");
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  options.expectedRepo = String(manifest?.repository?.url ?? "")
    .replace(/^git\+/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");

  let results;
  try {
    results = options.mode === "pre" ? await runPre(options, manifest) : await runPost(options, manifest);
  } catch (error) {
    // A failure to even enumerate what to check is a failure to check, and by this file's
    // rules that is loud but not red — the alternative is a registry outage reding a release.
    console.log(`::warning::the ${options.mode} provenance check could not run: ${error.message}. No conclusion is being drawn about any attestation.`);
    process.exit(0);
  }

  process.exit(report(results, options.mode));
}

await main();
