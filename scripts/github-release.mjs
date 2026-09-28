// Cuts lore's GitHub Release for a version tag, its body taken from that version's CHANGELOG.md
// section (LCLI-622, opum-agent OPAG-646, paired with quest-cli QCLI-398 and QCLI-401).
//
// The release used to be a printed line in the post-latest checklist, carried out by hand. Lore's
// releases stayed current only because someone remembered; quest's lagged to v0.6.0 unnoticed the
// same way. scripts/promote-latest.mjs now calls ensureGitHubRelease twice: as a read-only
// preflight before anything moves (dry run and --promote alike), and for real once `latest` is
// verified. This file is also the repair tool that preflight and a failed cut name:
//
//   node scripts/github-release.mjs --version 0.11.0                      # dry run: read, report
//   node scripts/github-release.mjs --version 0.11.0 --create             # cut it, marked latest
//   node scripts/github-release.mjs --version 0.9.0 --create --not-latest # a backfill
//
// THE MIRROR OF quest-cli's scripts/github-release.mjs, read by ref at 06fa623a (opum-ai/quest-cli
// #360, merged as 93fca842), with the same export names and the same outcome for every state of an
// existing release. Where it differs, each difference agreed on LCLI-622's PAIRING AGREED note:
//   - The CHANGELOG is Keep a Changelog: headings read `## [X] - YYYY-MM-DD`, and the last section
//     also stops at the trailing link-reference block (`[0.1.0]: https://...`), which quest's rule
//     would fold into the oldest release's notes.
//   - main() returns an exit code (0 done, 1 refused or failed, 2 usage) instead of calling
//     process.exit, as every lore release script does, so a test drives it with a stubbed gh.
//   - Types are in scripts/github-release.d.mts, as this repository's other scripts imported by
//     test/ are, and the JSDoc here is checked by tsconfig.scripts.json.
//
// It never creates a tag (`--verify-tag`), never edits an existing release's body or state, and
// pins the host (`-R github.com/opum-ai/lore-cli`) so GH_HOST cannot redirect it. An existing
// release counts as done only when it is published (not a draft, not a prerelease) and carries
// these notes; anything else is refused and left for a person, because publishing a draft or
// rewriting a published body is a decision, not a release step.

import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { OWN_REPOSITORY, RECEIPT_HOST } from "./pair-receipt.mjs";

const execFileAsync = promisify(execFileCallback);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Host and repository, pinned the way every other gh call in lore's release tooling pins them. */
export const RELEASE_REPOSITORY = `${RECEIPT_HOST}/${OWN_REPOSITORY}`;

/** The command a failed or refused cut names: this file, run by hand once the cause is fixed. */
export const REPAIR_COMMAND = (/** @type {string} */ version) =>
  `node scripts/github-release.mjs --version ${version} --create`;

/**
 * A version a CHANGELOG section can be named for: X.Y.Z, optionally with a prerelease or build
 * suffix. "Unreleased" is never one, so its section is never cut as a release.
 */
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** A Markdown link-reference definition: `[label]: url`, the block Keep a Changelog ends with. */
const LINK_REFERENCE = /^\s{0,3}\[[^\]]+\]:\s*\S/;

/** @param {string} text */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The body of `## [<version>]` in CHANGELOG.md, trimmed, heading excluded. The heading may carry a
 * suffix (`## [0.11.0] - 2026-09-27`), but `## [0.1.1]` never matches `## [0.1.10]`, and the brackets
 * are required. The body ends at the next `## ` heading or, for the last section, at the trailing
 * link-reference block. Returns null when there is no such section or it is empty: a release with
 * no notes is refused, not cut.
 * @param {string} changelog @param {string} version
 * @returns {{ heading: string, body: string } | null}
 */
export function changelogSection(changelog, version) {
  if (!VERSION.test(version)) return null;
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s.*)?$`);
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end === -1) {
    // The last section: Keep a Changelog's link references sit at the end of the file, below it.
    end = lines.length;
    while (end > start + 1) {
      const line = /** @type {string} */ (lines[end - 1]);
      if (line.trim() !== "" && !LINK_REFERENCE.test(line)) break;
      end--;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  return body === "" ? null : { heading: /** @type {string} */ (lines[start]), body };
}

/**
 * "Lore CLI 0.11.0", the title every hand-cut lore release carries. Quest's "(tagged, never
 * published)" rule is kept for pair symmetry, though no lore promotion reaches it.
 * @param {string} version @param {string} [heading]
 */
export function releaseTitle(version, heading = "") {
  return /never published/i.test(heading) ? `Lore CLI ${version} (tagged, never published)` : `Lore CLI ${version}`;
}

/** Notes compared as GitHub may store them: CRLF line ends, outer whitespace. @param {string} text */
const normaliseNotes = (text) => text.replace(/\r\n/g, "\n").trim();

/** @param {any} error */
const firstLine = (error) =>
  String(error?.stderr || error?.message || error)
    .trim()
    .split("\n")[0];

/** @typedef {(file: string, args: readonly string[]) => Promise<{ stdout: string, stderr?: string }>} ExecFile */
/** @typedef {{ ok: boolean, action: "created" | "exists" | "marked-latest" | "would-create" | "would-mark-latest" | "none", detail: string }} ReleaseOutcome */

/** @type {ExecFile} */
const defaultExecFile = (file, args) => execFileAsync(file, [...args]);

/**
 * Creates the release for v<version>, or confirms one exists. Never edits an existing release's
 * notes or state. An existing release must be published (isDraft and isPrerelease both strictly
 * false, checked BEFORE the notes) and carry `notes`, compared after CRLF -> LF and trim on both
 * sides, or the result is a failure. When `latest` is asked for and the release already exists, it
 * is marked latest, because that is the state a finished release must leave behind. `dryRun` reads
 * and reports, and writes nothing. Returns {ok, action, detail}; every failure is returned, never
 * thrown, so a caller that has already moved npm `latest` can report it without a stack trace that
 * reads like the promotion failed.
 * @param {{ version: string, notes: string, title?: string, latest?: boolean, dryRun?: boolean, execFile?: ExecFile }} args
 * @returns {Promise<ReleaseOutcome>}
 */
export async function ensureGitHubRelease({
  version,
  notes,
  title = releaseTitle(version),
  latest = true,
  dryRun = false,
  execFile = defaultExecFile,
}) {
  const tag = `v${version}`;
  const repo = ["-R", RELEASE_REPOSITORY];
  /** @type {any} */
  let state;
  let exists;
  try {
    const { stdout } = await execFile("gh", [
      "release",
      "view",
      tag,
      ...repo,
      "--json",
      "tagName,body,isDraft,isPrerelease",
    ]);
    try {
      state = JSON.parse(stdout);
    } catch {
      state = undefined;
    }
    if (state === null || typeof state !== "object" || Array.isArray(state) || typeof state.body !== "string")
      return {
        ok: false,
        action: "none",
        detail: `could not read release ${tag}: gh release view did not return its state`,
      };
    exists = true;
  } catch (error) {
    const detail = String(/** @type {any} */ (error)?.stderr || /** @type {any} */ (error)?.message || error);
    // gh prints "release not found" for a missing repository too. The repository is a constant
    // here, so that case is an access loss, and the create that follows fails closed on it.
    if (!/release not found/i.test(detail))
      return { ok: false, action: "none", detail: `could not read release ${tag}: ${detail.trim().split("\n")[0]}` };
    exists = false;
  }

  if (exists) {
    // Refused, never repaired: publishing a draft or rewriting a release body is a person's call.
    if (state.isDraft !== false || state.isPrerelease !== false)
      return {
        ok: false,
        action: "none",
        detail: `release ${tag} exists but is a ${state.isDraft !== false ? "draft" : "prerelease"}; publish or delete it by hand, then re-run`,
      };
    if (normaliseNotes(state.body) !== normaliseNotes(notes))
      return {
        ok: false,
        action: "none",
        detail: `release ${tag} exists but its notes differ from the CHANGELOG section; it is never edited here, so reconcile it by hand, then re-run`,
      };
    if (!latest) return { ok: true, action: "exists", detail: `release ${tag} already exists; left as is` };
    if (dryRun) return { ok: true, action: "would-mark-latest", detail: `release ${tag} exists; would mark it latest` };
    try {
      await execFile("gh", ["release", "edit", tag, ...repo, "--latest"]);
      return { ok: true, action: "marked-latest", detail: `release ${tag} already existed; marked latest` };
    } catch (error) {
      return {
        ok: false,
        action: "none",
        detail: `release ${tag} exists but could not be marked latest: ${firstLine(error)}`,
      };
    }
  }

  if (dryRun)
    return {
      ok: true,
      action: "would-create",
      detail: `would create release ${tag} "${title}" (${Buffer.byteLength(notes)} bytes of notes)${latest ? ", marked latest" : ""}`,
    };

  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), "lore-release-notes-"));
    const notesFile = join(dir, "notes.md");
    await writeFile(notesFile, `${notes}\n`);
    await execFile("gh", [
      "release",
      "create",
      tag,
      ...repo,
      "--verify-tag",
      "--title",
      title,
      "--notes-file",
      notesFile,
      `--latest=${latest ? "true" : "false"}`,
    ]);
    return {
      ok: true,
      action: "created",
      detail: `created release ${tag} "${title}"${latest ? ", marked latest" : ""}`,
    };
  } catch (error) {
    return { ok: false, action: "none", detail: `could not create release ${tag}: ${firstLine(error)}` };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The notes and title for a version, read from this checkout's CHANGELOG.md. Null when there is no
 * non-empty `## [<version>]` section. Throws only when the file cannot be read.
 * @param {string} version @param {{ changelogPath?: string }} [options]
 * @returns {Promise<{ notes: string, title: string } | null>}
 */
export async function releaseNotesFor(version, { changelogPath = join(root, "CHANGELOG.md") } = {}) {
  const section = changelogSection(await readFile(changelogPath, "utf8"), version);
  if (!section) return null;
  return { notes: section.body, title: releaseTitle(version, section.heading) };
}

const USAGE = "usage: node scripts/github-release.mjs --version <x.y.z> [--create] [--not-latest]";

/**
 * The repair and backfill command. Returns an exit code: 0 done (or, without --create, nothing to
 * refuse), 1 refused or failed, 2 bad arguments.
 * @param {string[]} argv
 * @param {{ execFile?: ExecFile, changelogPath?: string, out?: (line: string) => void, err?: (line: string) => void }} [options]
 * @returns {Promise<number>}
 */
export async function main(
  argv,
  {
    execFile = defaultExecFile,
    changelogPath = join(root, "CHANGELOG.md"),
    out = (line) => console.log(line),
    err = (line) => console.error(line),
  } = {},
) {
  const known = new Set(["--version", "--create", "--not-latest"]);
  for (let i = 0; i < argv.length; i++) {
    if (!known.has(/** @type {string} */ (argv[i]))) {
      err(`unknown argument: ${argv[i]}\n${USAGE}`);
      return 2;
    }
    if (argv[i] === "--version") i++;
  }
  const index = argv.indexOf("--version");
  const version = index === -1 ? undefined : argv[index + 1];
  if (!version || !VERSION.test(version)) {
    err(`--version needs a version like 0.11.0 (no "v" prefix)\n${USAGE}`);
    return 2;
  }
  let release;
  try {
    release = await releaseNotesFor(version, { changelogPath });
  } catch (error) {
    err(`${changelogPath} could not be read: ${firstLine(error)}`);
    return 1;
  }
  if (!release) {
    err(`CHANGELOG.md has no non-empty "## [${version}]" section; refusing to cut a release without notes.`);
    return 1;
  }
  const outcome = await ensureGitHubRelease({
    version,
    ...release,
    latest: !argv.includes("--not-latest"),
    dryRun: !argv.includes("--create"),
    execFile,
  });
  (outcome.ok ? out : err)(outcome.detail);
  return outcome.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
