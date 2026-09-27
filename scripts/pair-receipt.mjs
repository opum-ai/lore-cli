// The opum-cli-e2e gate on moving `latest` (LCLI-613).
//
// Constitution Article 3 clause 5: `latest` moves only after opum-cli-e2e has
// qualified the STAGED lore/quest pair from clean registry installs, and it is
// read from a machine-readable verdict that repository wrote -- never from a
// relayed "it passed". The receipt format is opum-cli-e2e's, agreed with
// quest-cli and lore-cli on their TASK-120 (opum-ai/opum-cli-e2e#298), in
// receipts/README.md "Pair receipts" and "What a reader must do".
//
// SOURCE READ FOR THAT CONTRACT, named because it is not where the reader
// reads receipts from: the section is not on opum-cli-e2e `main` yet (main
// b73e9c26, 2026-09-25). It was read at #298's head cfe8e533, byte-identical to
// the merge commit 9c1c6121 on opum-cli-e2e `dev`.
//
// THIS IS THE MIRROR OF quest-cli's scripts/qualification/pair-receipt.mjs
// (QCLI-388, opum-ai/quest-cli#307, commit 1b6edff9), read unchanged at
// quest-cli main eb1d9f46, blob 21467f38, with its override rule (evaluateVerdict) taken from the same
// commit's e2e-receipt.mjs. The steps are the contract's, from lore's side:
//
//   1. kind is opum.pair-qualification-receipt.v1
//   2. verdict is QUALIFIED, or a four-field override (printed verbatim)
//   3. pair.lore.version AND pair.quest.version are the version being
//      promoted -- Article 3.1 gives both the one number -- and
//      pair.lore.commit is the commit that version resolves to
//   4. pair.lore.tarballs names exactly the seven archives, and each
//      distIntegrity is what npm serves for that package right now
//   5. (LCLI-621, opum-cli-e2e TASK-126) pair.lore.launcherVersion is
//      <version>-rc.<N>, and the launcher entry is keyed, read and verified at
//      THAT version: the X launcher is not on the registry until promotion
//      publishes it. A receipt without launcherVersion -- every one written
//      before the amendment -- is refused, as quest-cli's reader refuses it
//      (QCLI-399): there is no older shape this flow can promote.
//
// Steps 6 and 7 -- the substitution re-check against the rc npm serves, and
// `latest` serving X afterwards -- are the promotion's, in promote-latest.mjs.
//
// The contract for step 5 was read by ref at opum-cli-e2e 4f078e6b (#309,
// TASK-126), receipts/README.md "Root launcher rc-staging" and "What a reader
// must do"; quest-cli's reader at e3c59d7b (draft #344, QCLI-399) is the mirror.
//
// This file also re-reads the PASS-1 receipt, receipts/lore/<version>.json, for
// promotion (evaluateReleaseReceipt, below): the X launcher that reaches
// `latest` is named and hashed there, in launcherSubstitution.finalTarball.
//
// Also: installedFrom.lore.source must be "registry", because a verdict on a
// candidate bundle is a pre-publication receipt, not this.
//
// ONE PLACE THIS CANNOT MIRROR QUEST, measured rather than assumed. quest binds
// step 3's commit to the `gitHead` npm records for the version. npm records NO
// gitHead for any @opum-ai/lore package: lore publishes the Release run's .tgz
// FILES, and a file publish carries none (read 2026-09-26 with npm 12.0.2:
// @opum-ai/lore@0.9.3 and 0.9.2 and their platform packages return
// dist.integrity alone, where @opum-ai/quest@0.10.0 returns both). So what
// lore's version resolves to is its `v<version>` tag on opum-ai/lore-cli,
// peeled to a commit -- the same derivation opum-cli-e2e's receipts/README.md
// "Fields" row gives for a lore receipt's `commit` ("re-derived by peeling the
// v<version> tag"). If npm ever does record a gitHead for the version, it must
// agree as well. Accepted by opum-agent on 2026-09-27 with three conditions, all
// implemented in resolveTagCommit(): peel ALL the way through annotated (and
// nested) tag objects to a commit; fail closed on a missing tag and on a peel
// that ends on anything but a commit, with no fallback to a branch head; and
// keep the npm-gitHead agreement rule.
//
// Every read is pinned: host github.com (GH_HOST cannot redirect it),
// repository and ref are constants, never inputs. A 403, a 404, a network
// error and a malformed document all read as NO RECEIPT.

import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const PAIR_RECEIPT_KIND = "opum.pair-qualification-receipt.v1";
export const RECEIPT_HOST = "github.com";
export const RECEIPT_REPOSITORY = "opum-ai/opum-cli-e2e";
export const RECEIPT_REF = "main";
export const OWN_REPOSITORY = "opum-ai/lore-cli";

export const PLATFORMS = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
]);

/** The root launcher: package.json, README.md, LICENSE, bin/. Staged as X-rc.N, published as X. */
export const LAUNCHER = "@opum-ai/lore";

/** Platforms first, launcher last: the order publish-release.sh writes in. */
export const RELEASE_PACKAGES = Object.freeze([...PLATFORMS.map((platform) => `@opum-ai/lore-${platform}`), LAUNCHER]);

const OVERRIDE_FIELDS = Object.freeze(["by", "reason", "task", "adr"]);

/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function pairReceiptPath(version) {
  return `receipts/pair/${version}.json`;
}

/** `@opum-ai/lore-linux-x64` -> `opum-ai-lore-linux-x64-<v>.tgz`, as npm pack names it. */
export function tarballName(pkgName, version) {
  return `${pkgName.replace("@", "").replace("/", "-")}-${version}.tgz`;
}

/**
 * Is `launcherVersion` an rc of exactly `version`? opum-cli-e2e's receipts/README.md validates it
 * against ^<X>-rc\.[1-9][0-9]*$ with X taken from the release, never a bare pattern an rc of some
 * other release would also satisfy. The same predicate as quest-cli's isLauncherVersionOf.
 * @param {unknown} version @param {unknown} launcherVersion
 */
export function isLauncherVersionOf(version, launcherVersion) {
  if (typeof version !== "string" || typeof launcherVersion !== "string") return false;
  const prefix = `${version}-rc.`;
  return launcherVersion.startsWith(prefix) && /^[1-9][0-9]*$/.test(launcherVersion.slice(prefix.length));
}

/**
 * The seven archives a lore release STAGES, named as `npm pack` names them: the six platforms at X
 * and the root launcher at its rc version (LCLI-621), in RELEASE_PACKAGES order. The X launcher is
 * not one of them; it is published only on promotion.
 * @param {string} version @param {string} launcherVersion
 */
export function expectedTarballNames(version, launcherVersion) {
  if (!isLauncherVersionOf(version, launcherVersion))
    throw new Error(`the launcher version must be ${version}-rc.<N>, got ${JSON.stringify(launcherVersion)}`);
  return RELEASE_PACKAGES.map((name) => tarballName(name, name === LAUNCHER ? launcherVersion : version));
}

/** The receipt's pair.lore.launcherVersion when it is an rc of `version`, else null. */
export function receiptLauncherVersion(doc, version) {
  const candidate =
    isObject(doc) && isObject(doc.pair) && isObject(doc.pair.lore) ? doc.pair.lore.launcherVersion : null;
  return isLauncherVersionOf(version, candidate) ? /** @type {string} */ (candidate) : null;
}

/**
 * The verdict half every opum-cli-e2e receipt shares: QUALIFIED, or a
 * well-formed override. Identical to quest-cli's evaluateVerdict.
 */
export function evaluateVerdict(doc) {
  const problems = [];
  // An override is a signed waiver, not a truthy value: it must carry the four
  // fields the agreed format names, each a non-empty string, or it waives
  // nothing and its banner would print an empty object.
  let override = null;
  if (doc.override !== undefined) {
    const candidate = doc.override;
    const shaped = candidate && typeof candidate === "object" && !Array.isArray(candidate);
    const missing = OVERRIDE_FIELDS.filter(
      (field) => !shaped || typeof candidate[field] !== "string" || !candidate[field].trim(),
    );
    if (missing.length)
      problems.push(
        `override must name ${OVERRIDE_FIELDS.join(", ")} as non-empty strings; missing or empty: ${missing.join(", ")}`,
      );
    else override = candidate;
  }
  // The key is verdict alone (opum-cli-e2e TASK-107).
  if (doc.verdict !== "QUALIFIED" && !override && doc.override === undefined)
    problems.push(`verdict is ${JSON.stringify(doc.verdict)}, not "QUALIFIED", and the receipt carries no override`);
  return { problems, override };
}

/**
 * Pure verdict over a pair receipt and what lore's release resolves to now.
 * `observed.integrities` is keyed by tarball name; `observed.commit` is the
 * commit `v<version>` peels to on lore-cli; `observed.gitHead` is what npm
 * records for the staged launcher, @opum-ai/lore@<launcherVersion>, or null
 * when it records none. `launcherVersion`, when given, is the rc the Release
 * run's artifact stages; the receipt must have qualified exactly that one.
 */
export function evaluatePairReceipt(doc, { version, observed, launcherVersion = undefined }) {
  if (!isObject(doc)) return { ok: false, problems: ["pair receipt is not a JSON object"], override: null };
  const problems = [];
  // Step 1.
  if (doc.kind !== PAIR_RECEIPT_KIND)
    problems.push(`kind must be ${PAIR_RECEIPT_KIND}, got ${JSON.stringify(doc.kind)}`);

  // Step 3.
  const lore = isObject(doc.pair?.lore) ? doc.pair.lore : {};
  const quest = isObject(doc.pair?.quest) ? doc.pair.quest : {};
  if (lore.version !== version)
    problems.push(`pair.lore.version is ${JSON.stringify(lore.version)}, the promotion is ${version}`);
  // A receipt for a different pairing -- a same-numbered lore qualified
  // against another quest -- must not read as covering this one.
  if (quest.version !== version)
    problems.push(
      `pair.quest.version is ${JSON.stringify(quest.version)}; Article 3 pairs lore ${version} with quest ${version}`,
    );
  if (!observed.commit || lore.commit !== observed.commit)
    problems.push(
      `pair.lore.commit is ${JSON.stringify(lore.commit)}, ${observed.commitSource ?? `v${version}`} resolves to ${JSON.stringify(observed.commit ?? null)}${observed.commitError ? ` (${observed.commitError})` : ""}`,
    );
  // Step 5: the launcher entry is verified at launcherVersion, not version.
  const qualifiedRc = receiptLauncherVersion(doc, version);
  if (!qualifiedRc)
    problems.push(
      `pair.lore.launcherVersion is ${JSON.stringify(lore.launcherVersion)}, not ${version}-rc.<N>; a receipt without it predates root-launcher rc-staging (LCLI-621) and cannot promote`,
    );
  else if (launcherVersion !== undefined && qualifiedRc !== launcherVersion)
    problems.push(
      `pair.lore.launcherVersion is ${qualifiedRc}, but the Release run's artifact stages the launcher as ${JSON.stringify(launcherVersion)}`,
    );
  // observed.gitHead is read from the staged launcher, the only root launcher on npm yet.
  if (observed.gitHead && lore.commit !== observed.gitHead)
    problems.push(
      `pair.lore.commit is ${JSON.stringify(lore.commit)}, npm records gitHead ${JSON.stringify(observed.gitHead)} for ${LAUNCHER}@${qualifiedRc ?? lore.launcherVersion}`,
    );
  if (doc.installedFrom?.lore?.source !== "registry")
    problems.push(
      `installedFrom.lore.source is ${JSON.stringify(doc.installedFrom?.lore?.source)}, not "registry": this is not a verdict on the staged packages`,
    );

  // Step 4. Set equality over the names, then each digest. Object.hasOwn,
  // never `in`: `in` also finds inherited keys such as `constructor`.
  const recorded = isObject(lore.tarballs) ? lore.tarballs : {};
  if (recorded !== lore.tarballs) problems.push("pair.lore.tarballs is not an object");
  // Without a valid launcherVersion the launcher entry cannot be named, so only the platforms are
  // checked and step 5's problem above refuses. An extra key is reported only when the full set is
  // known, as quest-cli does: otherwise the launcher's own entry would be reported as extra.
  const expected = qualifiedRc
    ? expectedTarballNames(version, qualifiedRc)
    : expectedTarballNames(version, `${version}-rc.1`).filter(
        (name) => !name.startsWith(`opum-ai-lore-${version}-rc.`),
      );
  for (const name of expected) {
    if (!Object.hasOwn(recorded, name)) {
      problems.push(`${name}: not in the pair receipt, so it was never qualified`);
      continue;
    }
    const recordedIntegrity = recorded[name]?.distIntegrity;
    const served = Object.hasOwn(observed.integrities, name) ? observed.integrities[name] : undefined;
    if (typeof recordedIntegrity !== "string" || !recordedIntegrity)
      problems.push(`${name}: pair receipt records no distIntegrity`);
    else if (recordedIntegrity !== served)
      problems.push(`${name}: qualified ${recordedIntegrity}, npm serves ${served ?? "nothing"}`);
  }
  for (const name of Object.keys(recorded))
    if (qualifiedRc && !expected.includes(name))
      problems.push(`${name}: named in the pair receipt but not part of this release`);

  // Step 2.
  const verdict = evaluateVerdict(doc);
  problems.push(...verdict.problems);
  return { ok: problems.length === 0, problems, override: verdict.override };
}

const firstLine = (error) =>
  String(error?.stderr || error?.message || error)
    .trim()
    .split("\n")[0];

/** The one argv a receipt at `path` on opum-cli-e2e main is read with: host, repo and ref pinned. */
function contentsReadArgs(path) {
  return [
    "api",
    "--hostname",
    RECEIPT_HOST,
    "-H",
    "Accept: application/vnd.github.raw",
    `repos/${RECEIPT_REPOSITORY}/contents/${path}?ref=${RECEIPT_REF}`,
  ];
}

/** The one argv the pair receipt is read with. Exported so a test can pin it. */
export function receiptReadArgs(version) {
  return contentsReadArgs(pairReceiptPath(version));
}

/** Every failure is `doc: null` with the reason, never thrown and never retried into a pass. */
async function fetchReceiptAt(path, execFileFn) {
  const source = `${RECEIPT_REPOSITORY}@${RECEIPT_REF}:${path}`;
  try {
    const { stdout } = await execFileFn("gh", contentsReadArgs(path), { maxBuffer: 8 * 1024 * 1024 });
    return { doc: JSON.parse(stdout), source };
  } catch (error) {
    return { doc: null, source, error: firstLine(error) };
  }
}

/**
 * Reads the pair receipt from opum-cli-e2e's main. Every failure is returned
 * as `doc: null` with the reason, never thrown and never retried into a pass.
 */
export async function fetchPairReceipt(version, { execFile: execFileFn = execFile } = {}) {
  return fetchReceiptAt(pairReceiptPath(version), execFileFn);
}

// ── The pass-1 receipt, re-read at promotion (LCLI-621) ─────────────────────────────────────────
// receipts/lore/<version>.json is what scripts/publish-release.sh gates STAGING on (LCLI-578). The
// promotion reads it again, against the Release run's artifact downloaded afresh, because it is the
// one record that names and hashes the X launcher about to become `latest`: opum-cli-e2e's own
// re-derived launcherSubstitution verdict and its finalTarball {filename, sha256} (TASK-126, read at
// opum-cli-e2e 4f078e6b). The rules publish-release.sh's receipt_check_js applies are applied here
// unchanged, plus three a promotion can and staging cannot:
//   - `commit` is bound to what v<version> peels to: at staging lore had no tag to peel yet
//     (receipts/README.md "Fields"), and by promotion it has one, which must peel to that commit;
//   - launcherVersion is required, an rc of exactly <version>, and the artifact's rc;
//   - launcherSubstitution is MATCH with no mismatches, its finalTarball.filename is the BASENAME
//     opum-ai-lore-<version>.tgz, and its sha256 is the artifact's X launcher.

export const RELEASE_RECEIPT_KIND = "opum.qualification-receipt.v1";

export function releaseReceiptPath(version) {
  return `receipts/lore/${version}.json`;
}

/** The one argv the pass-1 receipt is read with. Exported so a test can pin it. */
export function releaseReceiptReadArgs(version) {
  return contentsReadArgs(releaseReceiptPath(version));
}

/** Reads receipts/lore/<version>.json from opum-cli-e2e's main; failures are `doc: null`. */
export async function fetchReleaseReceipt(version, { execFile: execFileFn = execFile } = {}) {
  return fetchReceiptAt(releaseReceiptPath(version), execFileFn);
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Pure verdict over the pass-1 receipt and the Release run's artifact as downloaded now.
 *
 * `staged` maps each of the seven staged tarball names (the X-rc.N launcher among them) to its
 * sha256; `final` is the carried X launcher's `{ filename, sha256 }`. `commit` is what v<version>
 * peels to, `releaseRunId` the run the artifact came from, `launcherVersion` the artifact's rc.
 *
 * The override waives the VERDICT and nothing else, as at staging: a receipt about other bytes, or
 * one with no MATCH on the launcher substitution, refuses whatever its override says, because
 * Article 3 clause 5 is what makes publishing X to `latest` legitimate at all.
 */
export function evaluateReleaseReceipt(doc, { version, commit, releaseRunId, staged, final, launcherVersion }) {
  if (!isObject(doc)) return { ok: false, problems: ["receipt is not a JSON object"], override: null };
  const show = (/** @type {unknown} */ v) => JSON.stringify(v);
  /** @type {string[]} */
  const problems = [];
  if (doc.kind !== RELEASE_RECEIPT_KIND)
    problems.push(
      `kind is ${show(doc.kind)}, not "${RELEASE_RECEIPT_KIND}" (an unknown kind is refused, never guessed at)`,
    );
  if (doc.schemaVersion !== 1) problems.push(`schemaVersion is ${show(doc.schemaVersion)}, not 1`);
  if (doc.product !== "lore") problems.push(`product is ${show(doc.product)}, not "lore"`);
  if (doc.version !== version) problems.push(`version is ${show(doc.version)}, not "${version}"`);
  if (!SHA1_HEX.test(String(doc.commit ?? "")) || doc.commit !== commit)
    problems.push(`commit is ${show(doc.commit)}, but v${version} peels to ${show(commit)}`);
  // Run ids compared as normalised digit strings, exactly as publish-release.sh compares them.
  const norm = (/** @type {string} */ text) => text.replace(/^0+(?=\d)/, "");
  const rid = doc.releaseRunId;
  const ridText =
    typeof rid === "number" && Number.isSafeInteger(rid) && rid > 0
      ? String(rid)
      : typeof rid === "string" && /^[0-9]+$/.test(rid)
        ? norm(rid)
        : null;
  if (ridText === null || ridText !== norm(String(releaseRunId)))
    problems.push(`releaseRunId is ${show(rid)}, not ${releaseRunId} (the run the artifact was downloaded from)`);

  // Own-property lookup and set equality over the seven staged tarballs. The carried X launcher MAY
  // be named too, as at staging, and then its digest must match; nothing else may be named.
  const tarballs = doc.tarballs;
  if (!isObject(tarballs)) problems.push(`tarballs is ${show(tarballs)}, not an object of {filename: sha256}`);
  else {
    const digestProblem = (/** @type {string} */ name, /** @type {string} */ actual, /** @type {string} */ what) => {
      const recorded = tarballs[name];
      if (typeof recorded !== "string" || recorded.toLowerCase() !== actual)
        problems.push(`sha256 MISMATCH for ${name}: receipt says ${show(recorded)}, the ${what} is ${actual}`);
    };
    for (const [name, digest] of Object.entries(staged)) {
      if (!Object.hasOwn(tarballs, name)) problems.push(`tarballs has no entry for ${name}`);
      else digestProblem(name, digest, "staged tarball in the artifact");
    }
    if (Object.hasOwn(tarballs, final.filename)) digestProblem(final.filename, final.sha256, "carried X launcher");
    for (const key of Object.keys(tarballs))
      if (!Object.hasOwn(staged, key) && key !== final.filename)
        problems.push(`tarballs names ${show(key)}, which this release does not carry`);
  }

  // The launcher (TASK-126): the staged rc, and opum-cli-e2e's own substitution verdict.
  if (!isLauncherVersionOf(version, doc.launcherVersion))
    problems.push(
      `launcherVersion is ${show(doc.launcherVersion)}, not ${version}-rc.<N>; a receipt without it predates root-launcher rc-staging (LCLI-621) and cannot promote`,
    );
  else if (doc.launcherVersion !== launcherVersion)
    problems.push(
      `launcherVersion is ${doc.launcherVersion}, but the artifact stages the launcher as ${launcherVersion}`,
    );
  const substitution = doc.launcherSubstitution;
  if (!isObject(substitution))
    problems.push(
      `receipt has no launcherSubstitution, so nothing re-derived that the ${version} launcher is the qualified rc with only its version changed`,
    );
  else {
    const mismatches = Array.isArray(substitution.mismatches) ? substitution.mismatches : [];
    if (substitution.verdict !== "MATCH")
      problems.push(
        `launcherSubstitution.verdict is ${show(substitution.verdict)}, not "MATCH"${mismatches.length ? `: ${mismatches.map((m) => show(m)).join("; ")}` : ""}`,
      );
    else if (mismatches.length)
      problems.push(
        `launcherSubstitution.verdict is "MATCH" but lists ${mismatches.length} mismatch(es); a MATCH has none`,
      );
    const recorded = isObject(substitution.finalTarball) ? substitution.finalTarball : {};
    // The BASENAME npm pack gives the X launcher, exactly: a path, or another version's name, is not it.
    if (recorded.filename !== final.filename)
      problems.push(
        `launcherSubstitution.finalTarball.filename is ${show(recorded.filename)}, not the basename ${show(final.filename)}`,
      );
    if (!SHA256_HEX.test(String(recorded.sha256 ?? "")) || recorded.sha256 !== final.sha256)
      problems.push(
        `launcherSubstitution.finalTarball.sha256 is ${show(recorded.sha256)}, the artifact's ${final.filename} is ${final.sha256}`,
      );
  }

  // `override: null` waives nothing and is not malformed: publish-release.sh treats it as absent.
  const verdict = evaluateVerdict(doc.override === null ? { ...doc, override: undefined } : doc);
  problems.push(...verdict.problems);
  return { ok: problems.length === 0, problems, override: verdict.override };
}

/** Reads one version's registry metadata as an object, or null. npm 12 wraps it in a one-element array. */
export async function viewVersion(name, version, { execFile: execFileFn = execFile } = {}) {
  const { stdout } = await execFileFn("npm", ["view", `${name}@${version}`, "--json", "--prefer-online"], {
    maxBuffer: 16 * 1024 * 1024,
  });
  const parsed = JSON.parse(stdout);
  const view = Array.isArray(parsed) ? (parsed.length === 1 ? parsed[0] : null) : parsed;
  return isObject(view) ? view : null;
}

/**
 * What the registry serves for the seven packages, and the commit the version resolves to. The
 * platforms are read at `version`; the launcher at `launcherVersion` (LCLI-621), and a null
 * launcherVersion leaves it unread, which the verdict reports as not served. A package that cannot
 * be read is simply absent from the result, which the verdict then reports; it is never guessed.
 */
export async function observeRelease(
  version,
  packages = RELEASE_PACKAGES,
  { execFile: execFileFn = execFile, launcherVersion = null } = {},
) {
  const integrities = {};
  let gitHead = null;
  for (const name of packages) {
    const atVersion = name === LAUNCHER ? launcherVersion : version;
    if (!atVersion) continue;
    try {
      const view = await viewVersion(name, atVersion, { execFile: execFileFn });
      const integrity = view && isObject(view.dist) ? view.dist.integrity : undefined;
      if (typeof integrity === "string") integrities[tarballName(name, atVersion)] = integrity;
      // By presence, not value: a tarball publish records no gitHead at all.
      if (name === LAUNCHER && view && Object.hasOwn(view, "gitHead") && typeof view.gitHead === "string")
        gitHead = view.gitHead;
    } catch {
      // Left absent on purpose: see above.
    }
  }
  const peeled = await resolveTagCommit(version, { execFile: execFileFn });
  return {
    integrities,
    gitHead,
    commit: peeled.commit,
    commitSource: `${OWN_REPOSITORY} tag v${version}`,
    ...(peeled.error ? { commitError: peeled.error } : {}),
    peel: peeled.chain,
  };
}

/** Annotated tags can in principle point at other tags; nothing legitimate nests this deep. */
export const MAX_PEEL_DEPTH = 8;
const SHA1_HEX = /^[0-9a-f]{40}$/;

/** The argv that reads one git object on lore-cli, pinned to github.com. Exported so a test can pin it. */
export function ownRepoReadArgs(path) {
  return ["api", "--hostname", RECEIPT_HOST, `repos/${OWN_REPOSITORY}/${path}`];
}

/**
 * The commit `v<version>` peels to on lore-cli, dereferenced EXPLICITLY (opum-agent ruling on
 * LCLI-613, 2026-09-27). lore's release tags are ANNOTATED: refs/tags/v0.9.3 names a tag object
 * (c07b0ea4), which names the commit (819a682c) -- measured 2026-09-26. Comparing the receipt with
 * the ref's own sha would therefore never match, and is the mistake this function exists to rule
 * out. So: read the exact ref (`git/ref/tags/...`, singular, which matches exactly -- `v0.9`
 * answers 404, not a prefix match), then follow `git/tags/<sha>` while the object is a tag, up to
 * MAX_PEEL_DEPTH, and accept ONLY a commit at the end.
 *
 * FAILS CLOSED, with `commit: null` and the reason, on: no such tag (404), a ref that is not
 * exactly refs/tags/v<version>, a malformed answer, a sha that is not 40 hex, a peel that ends on
 * anything but a commit (a tree, a blob), or a chain deeper than MAX_PEEL_DEPTH (a cycle included).
 * There is NO fallback to a branch head or to any other ref: the only paths read are the tag ref
 * and tag objects. `chain` records every object visited, for the refusal message and for tests.
 */
export async function resolveTagCommit(version, { execFile: execFileFn = execFile } = {}) {
  const ref = `refs/tags/v${version}`;
  /** @type {string[]} */
  const chain = [];
  const fail = (/** @type {string} */ error) => ({ commit: null, chain, error });
  const read = async (/** @type {string} */ path) => {
    const { stdout } = await execFileFn("gh", ownRepoReadArgs(path));
    return JSON.parse(stdout);
  };
  let object;
  try {
    const answer = await read(`git/${ref.replace(/^refs\//, "ref/")}`);
    if (!isObject(answer) || answer.ref !== ref)
      return fail(`asked for ${ref}, the API answered ${JSON.stringify(isObject(answer) ? answer.ref : answer)}`);
    object = answer.object;
  } catch (error) {
    return fail(`${ref} could not be read (${firstLine(error)})`);
  }
  for (let depth = 0; ; depth++) {
    if (!isObject(object) || typeof object.type !== "string" || !SHA1_HEX.test(String(object.sha)))
      return fail(`${ref} resolves to a malformed object ${JSON.stringify(object)}`);
    chain.push(`${object.type} ${object.sha}`);
    if (object.type === "commit") return { commit: object.sha, chain };
    if (object.type !== "tag")
      return fail(`${ref} peels to a ${object.type} ${object.sha}, not a commit (chain: ${chain.join(" -> ")})`);
    if (depth >= MAX_PEEL_DEPTH)
      return fail(`${ref} is still a tag after ${MAX_PEEL_DEPTH} dereferences (chain: ${chain.join(" -> ")})`);
    try {
      const tag = await read(`git/tags/${object.sha}`);
      // LCLI-613 review N5: the answer must be about the object asked for.
      if (!isObject(tag) || tag.sha !== object.sha)
        return fail(
          `asked for tag object ${object.sha} under ${ref}, the API answered for ${JSON.stringify(isObject(tag) ? tag.sha : tag)}`,
        );
      object = tag.object;
    } catch (error) {
      return fail(`tag object ${object.sha} under ${ref} could not be read (${firstLine(error)})`);
    }
  }
}

/**
 * The whole gate: fetch the pair receipt, read what the release resolves to, compare. The launcher
 * is read at the receipt's own launcherVersion (step 5); `launcherVersion`, when given, is the rc
 * the Release run's artifact stages, and the receipt must name that same one.
 */
export async function requirePairQualification({
  version,
  packages = RELEASE_PACKAGES,
  launcherVersion = undefined,
  fetch = (v) => fetchPairReceipt(v),
  observe = (v, rc) => observeRelease(v, packages, { launcherVersion: rc }),
}) {
  const fetched = await fetch(version);
  if (!fetched.doc)
    return {
      ok: false,
      problems: [`no opum-cli-e2e pair receipt at ${fetched.source} (${fetched.error ?? "unreadable"})`],
      override: null,
      source: fetched.source,
      launcherVersion: null,
    };
  const qualifiedRc = receiptLauncherVersion(fetched.doc, version);
  const verdict = evaluatePairReceipt(fetched.doc, {
    version,
    observed: await observe(version, qualifiedRc),
    launcherVersion,
  });
  return { ...verdict, source: fetched.source, launcherVersion: qualifiedRc };
}

/** Printed verbatim whenever an override is what let a promotion proceed. */
export function describeOverride(override, source) {
  return [
    "",
    "!!! QUALIFICATION OVERRIDE IN USE !!!",
    `The receipt at ${source} does not record QUALIFIED. It carries this override, printed verbatim:`,
    JSON.stringify(override, null, 2),
    "",
  ].join("\n");
}
