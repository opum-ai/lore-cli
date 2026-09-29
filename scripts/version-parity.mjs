// lore and quest publish at one version number, or not at all (LCLI-613,
// constitution Article 3 clause 6: "Each CLI's release workflow refuses to
// publish when the two version numbers differ. That check, not this
// paragraph, is what keeps the pair together.").
//
// THIS IS THE MIRROR OF quest-cli's scripts/qualification/version-parity.mjs
// (QCLI-386, opum-ai/quest-cli#308, commit 481f4654), read unchanged at
// quest-cli main eb1d9f46, blob 249c28dc. The two publishers implement ONE rule, so the rule here is theirs
// with the roles swapped: the peer is quest-cli, the package is @opum-ai/quest.
// checkVersionParity() is the rule and must stay identical to theirs. Where
// this file differs, it differs in how the inputs are READ, never in what is
// compared, and each difference is named:
//
//   1. The read pins the host (`gh api --hostname github.com`), as this
//      repository's receipt read does (LCLI-578), so GH_HOST cannot redirect
//      it. quest's call does not pass --hostname.
//   2. `--version <v>` may name the version being published. scripts/
//      publish-release.sh passes its own <version> argument, because that
//      script publishes tarballs from a Release run, not from the checkout it
//      is run in, so the checkout's package.json is not the version it is
//      about to write. It is not an override: it names the version under test,
//      and publish-release.sh passes the same $VERSION that names every tarball
//      and the receipt it reads. release.yml passes nothing, so it compares the
//      dispatched commit's package.json exactly as quest does.
//   3. The message names the ref of lore's own side as well as quest's.
//
// What is compared: lore's version against quest-cli's package.json version on
// quest-cli's `main`, read through the GitHub contents API. Not the registry,
// because whichever side stages first would see the other still on the old
// number and neither could ever go first. Not a quest tag, because that forces
// a tag order across repositories. `main` reading the same number on both
// sides is a state a paired release already has to reach before either side
// tags. quest-cli runs the mirror of this against lore-cli.
//
// Fail closed: a read that fails (404, network, no gh), answers something that
// is not a package.json, names another package, or carries no version refuses
// exactly like a mismatch. There is no override flag and no environment
// variable; changing the rule means amending Article 3.
//
//   node scripts/version-parity.mjs --require [--version <v>]

import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { isMain } from "./is-main.mjs";

const execFile = promisify(execFileCallback);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const PEER = Object.freeze({
  repository: "opum-ai/quest-cli",
  ref: "main",
  packageName: "@opum-ai/quest",
});

/** The one argv this reads the peer with. Exported so a test can pin it. */
export function peerReadArgs(peer = PEER) {
  return [
    "api",
    "--hostname",
    "github.com",
    "-H",
    "Accept: application/vnd.github.raw",
    `repos/${peer.repository}/contents/package.json?ref=${peer.ref}`,
  ];
}

/**
 * The peer's package.json version on its ref. Every failure comes back as
 * `version: null` with the reason, never thrown and never defaulted.
 */
export async function readPeerVersion({ peer = PEER, execFile: execFileFn = execFile } = {}) {
  const source = `${peer.repository}@${peer.ref}:package.json`;
  try {
    const { stdout } = await execFileFn("gh", peerReadArgs(peer), {
      maxBuffer: 4 * 1024 * 1024,
    });
    const manifest = JSON.parse(stdout);
    if (manifest?.name !== peer.packageName)
      return {
        version: null,
        source,
        error: `names package ${JSON.stringify(manifest?.name)}, not ${peer.packageName}`,
      };
    if (typeof manifest.version !== "string" || !manifest.version)
      return { version: null, source, error: "carries no version" };
    return { version: manifest.version, source };
  } catch (caught) {
    // The cast types the catch binding for checkJs; the expression is quest's, unchanged.
    const error = /** @type {{ stderr?: string, message?: string }} */ (caught);
    const detail = String(error?.stderr || error?.message || error)
      .trim()
      .split("\n")[0];
    return { version: null, source, error: detail };
  }
}

/**
 * Pure verdict: both versions present and identical. The same rule as
 * quest-cli's checkVersionParity; `versionSource` only names lore's side in the
 * message and never moves the verdict.
 */
export function checkVersionParity({ version, peerRead, versionSource = "this checkout's package.json" }) {
  if (peerRead.version === null)
    return {
      ok: false,
      problem: `quest's version could not be read from ${peerRead.source} (${peerRead.error}); Article 3.6 refuses rather than assumes`,
    };
  if (peerRead.version !== version)
    return {
      ok: false,
      problem: `lore is ${version} (${versionSource}) but quest is ${peerRead.version} (${peerRead.source}); Article 3.6: lore and quest publish at one version, or not at all`,
    };
  return {
    ok: true,
    problem: null,
    message: `lore ${version} (${versionSource}) and quest ${peerRead.version} (${peerRead.source}) are one version (Article 3.6).`,
  };
}

/**
 * Reads both sides and returns the verdict.
 * @param {{ version?: string, versionSource?: string, read?: () => Promise<{ version: string | null, source: string, error?: string }> }} [options]
 */
export async function requireVersionParity({ version, versionSource, read = () => readPeerVersion() } = {}) {
  return checkVersionParity({ version, versionSource, peerRead: await read() });
}

/** Names the ref lore's own package.json was read at. Best effort: it labels, it never decides. */
async function ownRef() {
  if (process.env.GITHUB_SHA)
    return `${process.env.GITHUB_REPOSITORY ?? "opum-ai/lore-cli"}@${process.env.GITHUB_REF_NAME ?? "?"} (${process.env.GITHUB_SHA.slice(0, 12)})`;
  try {
    const { stdout } = await execFile("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root });
    return `this checkout (${stdout.trim()})`;
  } catch {
    return "this checkout";
  }
}

async function main(argv) {
  if (!argv.includes("--require")) throw new Error("usage: version-parity.mjs --require [--version <v>]");
  const index = argv.indexOf("--version");
  let version;
  let versionSource;
  if (index !== -1) {
    version = argv[index + 1];
    if (version === undefined || version.startsWith("--")) throw new Error("--version requires a value");
    versionSource = "the version publish-release.sh is publishing";
  } else {
    ({ version } = JSON.parse(await readFile(join(root, "package.json"), "utf8")));
    versionSource = `package.json at ${await ownRef()}`;
  }
  const verdict = await requireVersionParity({ version, versionSource });
  if (!verdict.ok) {
    console.error(`Refusing to publish: ${verdict.problem}`);
    process.exit(1);
  }
  console.log(verdict.message);
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
