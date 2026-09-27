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

/** Platforms first, launcher last: the order publish-release.sh writes in. */
export const RELEASE_PACKAGES = Object.freeze([
  ...PLATFORMS.map((platform) => `@opum-ai/lore-${platform}`),
  "@opum-ai/lore",
]);

const OVERRIDE_FIELDS = Object.freeze(["by", "reason", "task", "adr"]);

export function pairReceiptPath(version) {
  return `receipts/pair/${version}.json`;
}

/** `@opum-ai/lore-linux-x64` -> `opum-ai-lore-linux-x64-<v>.tgz`, as npm pack names it. */
export function tarballName(pkgName, version) {
  return `${pkgName.replace("@", "").replace("/", "-")}-${version}.tgz`;
}

/** The seven archives a lore release consists of. */
export function expectedTarballNames(version) {
  return RELEASE_PACKAGES.map((name) => tarballName(name, version));
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

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
 * records for @opum-ai/lore@<version>, or null when it records none.
 */
export function evaluatePairReceipt(doc, { version, observed }) {
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
  if (observed.gitHead && lore.commit !== observed.gitHead)
    problems.push(
      `pair.lore.commit is ${JSON.stringify(lore.commit)}, npm records gitHead ${JSON.stringify(observed.gitHead)} for @opum-ai/lore@${version}`,
    );
  if (doc.installedFrom?.lore?.source !== "registry")
    problems.push(
      `installedFrom.lore.source is ${JSON.stringify(doc.installedFrom?.lore?.source)}, not "registry": this is not a verdict on the staged packages`,
    );

  // Step 4. Set equality over the names, then each digest. Object.hasOwn,
  // never `in`: `in` also finds inherited keys such as `constructor`.
  const recorded = isObject(lore.tarballs) ? lore.tarballs : {};
  if (recorded !== lore.tarballs) problems.push("pair.lore.tarballs is not an object");
  const expected = expectedTarballNames(version);
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
    if (!expected.includes(name)) problems.push(`${name}: named in the pair receipt but not part of this release`);

  // Step 2.
  const verdict = evaluateVerdict(doc);
  problems.push(...verdict.problems);
  return { ok: problems.length === 0, problems, override: verdict.override };
}

const firstLine = (error) =>
  String(error?.stderr || error?.message || error)
    .trim()
    .split("\n")[0];

/** The one argv the receipt is read with. Exported so a test can pin it. */
export function receiptReadArgs(version) {
  return [
    "api",
    "--hostname",
    RECEIPT_HOST,
    "-H",
    "Accept: application/vnd.github.raw",
    `repos/${RECEIPT_REPOSITORY}/contents/${pairReceiptPath(version)}?ref=${RECEIPT_REF}`,
  ];
}

/**
 * Reads the pair receipt from opum-cli-e2e's main. Every failure is returned
 * as `doc: null` with the reason, never thrown and never retried into a pass.
 */
export async function fetchPairReceipt(version, { execFile: execFileFn = execFile } = {}) {
  const source = `${RECEIPT_REPOSITORY}@${RECEIPT_REF}:${pairReceiptPath(version)}`;
  try {
    const { stdout } = await execFileFn("gh", receiptReadArgs(version), { maxBuffer: 8 * 1024 * 1024 });
    return { doc: JSON.parse(stdout), source };
  } catch (error) {
    return { doc: null, source, error: firstLine(error) };
  }
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
 * What the registry serves for the seven packages at this version, and the
 * commit the version resolves to. A package that cannot be read is simply
 * absent from the result, which the verdict then reports; it is never guessed.
 */
export async function observeRelease(version, packages = RELEASE_PACKAGES, { execFile: execFileFn = execFile } = {}) {
  const integrities = {};
  let gitHead = null;
  for (const name of packages) {
    try {
      const view = await viewVersion(name, version, { execFile: execFileFn });
      const integrity = view && isObject(view.dist) ? view.dist.integrity : undefined;
      if (typeof integrity === "string") integrities[tarballName(name, version)] = integrity;
      if (name === "@opum-ai/lore" && view && Object.hasOwn(view, "gitHead") && typeof view.gitHead === "string")
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
      object = isObject(tag) ? tag.object : tag;
    } catch (error) {
      return fail(`tag object ${object.sha} under ${ref} could not be read (${firstLine(error)})`);
    }
  }
}

/** The whole gate: fetch the pair receipt, read what the release resolves to, compare. */
export async function requirePairQualification({
  version,
  packages = RELEASE_PACKAGES,
  fetch = (v) => fetchPairReceipt(v),
  observe = (v) => observeRelease(v, packages),
}) {
  const fetched = await fetch(version);
  if (!fetched.doc)
    return {
      ok: false,
      problems: [`no opum-cli-e2e pair receipt at ${fetched.source} (${fetched.error ?? "unreadable"})`],
      override: null,
      source: fetched.source,
    };
  const verdict = evaluatePairReceipt(fetched.doc, { version, observed: await observe(version) });
  return { ...verdict, source: fetched.source };
}

/** Printed verbatim whenever an override is what let a promotion proceed. */
export function describeOverride(override, source) {
  return [
    "",
    "!!! QUALIFICATION OVERRIDE IN USE !!!",
    `The pair receipt at ${source} does not record QUALIFIED. It carries this override, printed verbatim:`,
    JSON.stringify(override, null, 2),
    "",
  ].join("\n");
}
