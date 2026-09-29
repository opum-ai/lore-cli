// Cuts lore's GitHub Release for a version tag, its body taken from that version's CHANGELOG.md
// section AT THE COMMIT v<version> PEELS TO (LCLI-622, opum-agent OPAG-646, paired with quest-cli
// QCLI-398 and QCLI-401; the tagged-commit source is LCLI-639, paired with quest-cli QCLI-407).
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
//
// THE NOTES COME FROM THE TAGGED COMMIT, NEVER FROM THIS CHECKOUT (LCLI-639). The bytes are read
// with one pinned `gh api` raw-contents call addressed by the peeled SHA -- the same rule and the
// same call shape as scripts/check-breaking-bump.mjs's quest-side read (LCLI-632), exported here
// as changelogAtRefArgs so a test can pin the argv. Two reasons it is the network read and not
// `git show`: this file and promote-latest.mjs contain no local-git invocation at all today, and
// the tag is created REMOTELY by release.yml, so the commit it names is not guaranteed to exist as
// a local object in the checkout that runs the promotion. The SHA (not the tag ref) is the
// address, because a tag ref can be re-pointed and a commit cannot.
//
// That makes scripts/check-breaking-bump.mjs's working-tree read deliberate rather than an
// inconsistency: it gates the version bump BEFORE any tag exists, so there is no commit to read.

import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { isMain } from "./is-main.mjs";
import { OWN_REPOSITORY, RECEIPT_HOST, resolveTagCommit } from "./pair-receipt.mjs";

const execFileAsync = promisify(execFileCallback);

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

/**
 * A fenced-code-block opener: three or more backticks or tildes, indented at most three spaces,
 * with the rest of the line as its info string.
 */
const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
/** A fenced-code-block closer candidate: a run of ONE fence character, nothing after it. */
const CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/** A commit SHA, the only ref the release notes are ever read at. */
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** @param {string} text */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The fence state of every line of a document: the opener's character and run length while a fence
 * is open, and null outside one. The opener's own line and its closer's line carry the open state
 * too, which is harmless: neither can be a `## ` heading, since a heading line starts with `##` and
 * a fence line starts with its fence character.
 * @param {string[]} lines
 * @returns {(null | { char: string, length: number })[]}
 */
function fenceState(lines) {
  /** @type {(null | { char: string, length: number })[]} */
  const state = [];
  /** @type {null | { char: string, length: number }} */
  let open = null;
  for (const line of lines) {
    if (open) {
      state.push(open);
      const run = CLOSE_FENCE.exec(line)?.[1];
      // Same character, at least the opener's run: a four-marker fence is closed by four or more
      // of its own character and by nothing else, so a three-marker line inside it is content.
      if (run?.startsWith(open.char) && run.length >= open.length) open = null;
      continue;
    }
    const match = OPEN_FENCE.exec(line);
    const run = match?.[1];
    // CommonMark: a BACKTICK fence's info string may not contain a backtick, so "```a`b" opens
    // nothing and the `## ` line under it really is a heading. A tilde fence takes any info
    // string, which is why the restriction is tested against the fence's own character.
    if (run !== undefined && !(run.startsWith("`") && (match?.[2] ?? "").includes("`"))) {
      open = { char: run.startsWith("`") ? "`" : "~", length: run.length };
      state.push(open);
      continue;
    }
    state.push(null);
  }
  return state;
}

/**
 * The body of `## [<version>]` in CHANGELOG.md, trimmed, heading excluded. The heading may carry a
 * suffix (`## [0.11.0] - 2026-09-27`), but `## [0.1.1]` never matches `## [0.1.10]`, and the brackets
 * are required. The body ends at the next `## ` heading or, for the last section, at the trailing
 * link-reference block. Returns null when there is no such section or it is empty: a release with
 * no notes is refused, not cut.
 *
 * A fenced code block SUSPENDS the heading rule (LCLI-639, extractor parity with quest-cli
 * QCLI-407), for the section's START as much as for its end: the fence state of the WHOLE document
 * is computed first, and a `## ` line inside a fence is the fence's content, not a heading. So a
 * fenced `## [<version>]` line cannot hijack a section out of the real one below it, and a fenced
 * `## ` line cannot truncate one. An UNCLOSED fence runs the section to the end of the file, as
 * CommonMark reads it, and the trailing link-reference trim below still applies there. CRLF is
 * normalised before the split, so a CRLF file reads exactly as an LF one (quest-cli's extractor
 * carries the same split).
 *
 * SCOPE, stated as a decision rather than as an omission: this implements the fence state, and
 * nothing else of CommonMark -- no indented-code-block interaction, no lazy continuation, and no
 * container or list scoping. A CHANGELOG section is prose plus fenced examples; the rest of
 * CommonMark's block grammar would buy nothing here that its first misreading would not cost.
 * @param {string} changelog @param {string} version
 * @returns {{ heading: string, body: string } | null}
 */
export function changelogSection(changelog, version) {
  if (!VERSION.test(version)) return null;
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s.*)?$`);
  const lines = changelog.replace(/\r\n/g, "\n").split("\n");
  const fences = fenceState(lines);
  const start = lines.findIndex((line, i) => !fences[i] && heading.test(line));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && !fences[i] && line.startsWith("## "));
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

/** @typedef {(file: string, args: readonly string[], options?: { maxBuffer?: number }) => Promise<{ stdout: string, stderr?: string }>} ExecFile */
/** @typedef {{ ok: boolean, action: "created" | "exists" | "marked-latest" | "would-create" | "would-mark-latest" | "none", detail: string }} ReleaseOutcome */

/** @type {ExecFile} */
const defaultExecFile = (file, args, options = {}) => execFileAsync(file, [...args], options);

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

/** The one argv a commit's CHANGELOG.md is read with. Exported so a test can pin it (LCLI-639). */
export function changelogAtRefArgs(sha) {
  return [
    "api",
    "--hostname",
    RECEIPT_HOST,
    "-H",
    "Accept: application/vnd.github.raw",
    `repos/${OWN_REPOSITORY}/contents/CHANGELOG.md?ref=${sha}`,
  ];
}

/**
 * lore-cli's CHANGELOG.md AT `sha`, through the pinned raw-contents call. Every failure comes back
 * as `changelog: null` with the reason, never thrown and never defaulted -- notes that could not be
 * read are not notes. `sha` must be a commit sha: a branch or tag ref is refused here rather than
 * sent, so the read can only ever answer with the bytes of a commit (LCLI-639).
 * @param {string} sha @param {{ execFile?: ExecFile }} [options]
 * @returns {Promise<{ changelog: string | null, source: string, error?: string }>}
 */
export async function readChangelogAtCommit(sha, { execFile: execFileFn = defaultExecFile } = {}) {
  const source = `${OWN_REPOSITORY}@${sha}:CHANGELOG.md`;
  if (typeof sha !== "string" || !COMMIT_SHA.test(sha))
    return {
      changelog: null,
      source,
      error: `${JSON.stringify(sha)} is not a commit sha, and the release notes are read at a commit, never at a ref that can move`,
    };
  try {
    const { stdout } = await execFileFn("gh", changelogAtRefArgs(sha), { maxBuffer: 8 * 1024 * 1024 });
    if (typeof stdout !== "string" || !stdout.trim())
      return { changelog: null, source, error: "gh answered with no changelog text" };
    return { changelog: stdout, source };
  } catch (caught) {
    // The cast types the catch binding for checkJs; the expression is check-breaking-bump.mjs's.
    const error = /** @type {{ stderr?: string, message?: string }} */ (caught);
    const detail = String(error?.stderr || error?.message || error)
      .trim()
      .split("\n")[0];
    return { changelog: null, source, error: detail };
  }
}

/**
 * The notes and title for a version, FROM THE TEXT IT IS GIVEN. Null when there is no non-empty
 * `## [<version>]` section. Pure, and deliberately so (LCLI-639): it holds no path and reads
 * nothing, so the caller decides WHICH bytes -- promote-latest.mjs and main() below both pass the
 * bytes of the tagged commit, never this checkout's.
 * @param {string} version @param {{ changelog: string }} options
 * @returns {{ notes: string, title: string } | null}
 */
export function releaseNotesFor(version, { changelog }) {
  const section = changelogSection(changelog, version);
  if (!section) return null;
  return { notes: section.body, title: releaseTitle(version, section.heading) };
}

const USAGE = "usage: node scripts/github-release.mjs --version <x.y.z> [--create] [--not-latest]";

/**
 * The repair and backfill command. The tag is resolved FIRST and the notes are read at the commit
 * it peels to (LCLI-639), so this tool cuts exactly the bytes the preflight compares -- and so a
 * tag that does not resolve refuses before any gh call that writes. Returns an exit code: 0 done
 * (or, without --create, nothing to refuse), 1 refused or failed, 2 bad arguments.
 * @param {string[]} argv
 * @param {{ execFile?: ExecFile, out?: (line: string) => void, err?: (line: string) => void }} [options]
 * @returns {Promise<number>}
 */
export async function main(
  argv,
  { execFile = defaultExecFile, out = (line) => console.log(line), err = (line) => console.error(line) } = {},
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
  // The tag first, then the bytes it names (LCLI-639). resolveTagCommit fails closed: no such tag,
  // a ref that is not exactly refs/tags/v<version>, a peel ending on anything but a commit, and a
  // chain too deep all come back as commit: null, with no fallback to a branch head.
  const peeled = await resolveTagCommit(version, { execFile });
  if (!peeled.commit) {
    err(`refusing to cut a release for ${version}: ${peeled.error}. It never creates a tag.`);
    return 1;
  }
  const read = await readChangelogAtCommit(peeled.commit, { execFile });
  if (!read.changelog) {
    err(
      `CHANGELOG.md could not be read at v${version}'s commit ${peeled.commit} (${read.error}); the notes are those bytes, not this checkout's.`,
    );
    return 1;
  }
  const release = releaseNotesFor(version, { changelog: read.changelog });
  if (!release) {
    err(
      `CHANGELOG.md at v${version}'s commit ${peeled.commit} has no non-empty "## [${version}]" section; refusing to cut a release without notes. The tag exists and is immutable, so no edit to this checkout can add the section: re-tag v${version} at a commit whose CHANGELOG.md carries it, or cut that release by hand with notes you choose.`,
    );
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

if (isMain(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
