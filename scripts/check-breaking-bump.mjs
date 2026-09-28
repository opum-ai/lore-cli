// A breaking CHANGELOG entry needs at least a minor version bump (LCLI-632,
// mirror of quest-cli QCLI-328).
//
// This is quest-cli's scripts/check-breaking-bump.mjs, read by ref at
// opum-ai/quest-cli commit bee163610791547e7bb6cefc48f967daaf8bab2d (the merge
// of opum-ai/quest-cli#367, QCLI-328). The rule is recorded in opum-doc
// docs/adr/gate-release-prep-on-a-breaking-changelog-entry-at-a-patch-bump.md,
// read at opum-doc main 6b258f0e1a9a1eee37d37c923322c9b99b0cf133. Because lore
// and quest share one version (constitution Article 3 clause 1), a breaking
// entry in either CHANGELOG forces the pair to at least minor — so this check
// reads BOTH changelogs: lore's own on disk, and quest-cli's BY REF through the
// GitHub API (default ref dev; release.yml passes --quest-ref main to match the
// version-parity read). An unreadable quest changelog is not a clean one and
// refuses too (AC3, enforced).
//
// Where this file differs from quest-cli's, each difference is named:
//
//   1. One parser tolerates both heading families: lore's Keep-a-Changelog
//      form ("## [Unreleased]", "## [0.11.0] - date") and quest's bare form
//      ("## Unreleased", "## 0.11.0 - date").
//   2. The notes section checked is the one for the version being released
//      (orchestrator ruling, 2026-09-28, recorded on LCLI-632): the
//      [Unreleased] section while it holds the notes, and the version's own
//      "## [X]" section once the bump is in. Released sections are history and
//      are never scanned — so lore's released 0.11.0 section, which still
//      carries a legacy marker, does not bind the next bump.
//   3. lore's legacy bold "**BEHAVIOUR CHANGE:**" bullet marker is refused at
//      ANY bump level, with a message naming the canonical spelling
//      (orchestrator ruling, 2026-09-28, recorded on LCLI-632). quest-cli's
//      file knows only the canonical "### ... (breaking)" heading; without
//      this, lore's existing style would read as "no breaking change" and the
//      gate would certify what it exists to catch.
//
//   node scripts/check-breaking-bump.mjs                         # the package.json version
//   node scripts/check-breaking-bump.mjs --next 0.12.0           # release prep, before the bump
//   node scripts/check-breaking-bump.mjs --quest-ref main        # the ref release.yml reads

import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = fileURLToPath(new URL("..", import.meta.url));

/** A `### ...` heading marked `(breaking)`, e.g. `### Changed (breaking)`. Byte-for-byte quest-cli's, read at bee16361. */
export const BREAKING_HEADING = /^###\s.*\(breaking\)/im;

/**
 * lore's legacy bold bullet marker, e.g. `- **BEHAVIOUR CHANGE: ...**`. Line-
 * anchored with an optional list prefix, which is lore's existing style. The
 * canonical spelling is a `### ... (breaking)` heading (BREAKING_HEADING).
 */
export const LEGACY_BREAKING_MARKER = /^\s*(?:[-*+]\s+)?\*\*BEHAVIOUR CHANGE:/m;

/** The peer whose CHANGELOG the pair's bump also answers to (AC3, enforced). */
/** @type {{ repository: string, ref: string }} */
export const QUEST = Object.freeze({
  repository: "opum-ai/quest-cli",
  ref: "dev",
});

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1, 4).map(Number) : null;
}

/** "major", "minor" or "patch" for the step from `previous` to `next`. Byte-for-byte quest-cli's, read at bee16361. */
export function bumpLevel(previous, next) {
  const [a, b] = [parse(previous), parse(next)];
  if (!a || !b) return null;
  if (a[0] !== b[0]) return "major";
  if (a[1] !== b[1]) return "minor";
  return "patch";
}

/** `## <text>` — a version heading in either family (bracketed or bare). */
const VERSION_HEADING = /^\[?(\d+\.\d+\.\d+)\]?(?:\s.*)?$/;
/** `## Unreleased` or `## [Unreleased]`. */
const UNRELEASED_HEADING = /^\[?Unreleased\]?\s*$/;

/** Every `## ` section, in file order, with its heading and body. */
function sections(changelog) {
  const lines = changelog.split("\n");
  const out = [];
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("## ")) continue;
    const last = out.at(-1);
    if (last) last.end = index;
    out.push({ heading: line, start: index + 1, end: lines.length });
  }
  return out.map(({ heading, start, end }) => {
    const text = heading.slice(3).trim();
    return {
      heading,
      version: VERSION_HEADING.exec(text)?.[1] ?? null,
      unreleased: UNRELEASED_HEADING.test(text),
      body: lines.slice(start, end).join("\n"),
    };
  });
}

/**
 * Problems with releasing `version` given `changelog`, plus what was read, so
 * a caller can tell a clean answer from one that read nothing. `label` names
 * the changelog in problem messages (quest's side names its ref).
 */
export function breakingBumpProblems(changelog, version, label = "CHANGELOG.md") {
  const all = sections(changelog);
  const versioned = all.filter((section) => section.version !== null);
  const top = versioned[0];
  const unreleased = all.find((section) => section.unreleased);
  const problems = [];
  let notes = null;
  let previous = null;
  let source = null;
  if (unreleased && unreleased.body.trim() !== "") {
    // The notes for the version being released still sit under Unreleased
    // (the bump PR, before the entries move). Released sections below it are
    // history and are never scanned (orchestrator ruling B).
    notes = unreleased;
    previous = top?.version ?? null;
    source = unreleased.heading;
  } else if (top && top.version === version) {
    // The bump is in: the version's own section holds its notes, and the
    // heading below it is the previous release.
    notes = top;
    previous = versioned[1]?.version ?? null;
    source = top.heading;
  } else {
    problems.push(
      `${label} has no section holding ${version}'s notes: ${
        unreleased
          ? `${unreleased.heading} is empty and no "## ${version}" section exists`
          : `no Unreleased section and no "## ${version}" section exist`
      }`,
    );
  }
  const breaking = notes ? BREAKING_HEADING.test(notes.body) : false;
  const legacy = notes ? LEGACY_BREAKING_MARKER.test(notes.body) : false;
  const level = previous ? bumpLevel(previous, version) : null;
  if (legacy)
    problems.push(
      `${source} carries lore's legacy **BEHAVIOUR CHANGE:** marker; use a \`### Changed (breaking)\` heading instead (the canonical spelling, per quest-cli QCLI-328)`,
    );
  if (breaking && previous === null)
    problems.push(
      `${source} carries a breaking heading, but no earlier version heading exists to compare ${version} with`,
    );
  if (breaking && level === "patch")
    problems.push(
      `${source} carries a breaking heading, but ${previous} -> ${version} is a patch bump; a breaking change needs at least a minor bump (QCLI-328; 0.6.2 shipped this way)${
        previous === version ? `; package.json still names ${version} — pass --next <x.y.z> to name the bump` : ""
      }`,
    );
  return {
    problems,
    version,
    previous,
    level,
    source,
    breaking,
    legacyMarker: legacy,
    sectionsRead: all.length,
  };
}

/** The one argv this reads quest's CHANGELOG with. Exported so a test can pin it. */
export function questChangelogArgs(ref = QUEST.ref) {
  return [
    "api",
    "--hostname",
    "github.com",
    "-H",
    "Accept: application/vnd.github.raw",
    `repos/${QUEST.repository}/contents/CHANGELOG.md?ref=${ref}`,
  ];
}

/**
 * quest-cli's CHANGELOG.md on its ref. Every failure comes back as
 * `changelog: null` with the reason, never thrown and never defaulted — an
 * unreadable changelog is not a clean one and refuses.
 */
export async function readQuestChangelog({ ref = QUEST.ref, execFile: execFileFn = execFile } = {}) {
  const source = `${QUEST.repository}@${ref}:CHANGELOG.md`;
  try {
    const { stdout } = await execFileFn("gh", questChangelogArgs(ref), {
      maxBuffer: 8 * 1024 * 1024,
    });
    if (typeof stdout !== "string" || !stdout.trim())
      return { changelog: null, source, error: "gh answered with no changelog text" };
    return { changelog: stdout, source };
  } catch (caught) {
    // The cast types the catch binding for checkJs; the expression is version-parity.mjs's.
    const error = /** @type {{ stderr?: string, message?: string }} */ (caught);
    const detail = String(error?.stderr || error?.message || error)
      .trim()
      .split("\n")[0];
    return { changelog: null, source, error: detail };
  }
}

/**
 * Both sides of the pair's release-prep gate: lore's own CHANGELOG.md and
 * quest-cli's by ref, against the same version. `readQuest` is injectable so
 * tests never hit the network; `questChangelog` is a fixture override for the
 * same reason.
 * @param {{ directory?: string, next?: string, questRef?: string, questChangelog?: string, readQuest?: () => Promise<{ changelog: string | null, source: string, error?: string }> }} [options]
 */
export async function checkBreakingBump({
  directory = root,
  next,
  questRef = QUEST.ref,
  questChangelog,
  readQuest = () => readQuestChangelog({ ref: questRef }),
} = {}) {
  const version = next ?? JSON.parse(await readFile(join(directory, "package.json"), "utf8")).version;
  const changelog = await readFile(join(directory, "CHANGELOG.md"), "utf8");
  const lore = breakingBumpProblems(changelog, version);
  const loreProblems = [...lore.problems];
  if (lore.sectionsRead === 0) loreProblems.push("CHANGELOG.md has no ## sections; nothing was checked.");

  const readSource = `${QUEST.repository}@${questRef}:CHANGELOG.md`;
  const questRead =
    questChangelog === undefined ? await readQuest() : { changelog: questChangelog, source: readSource };
  let quest;
  let questProblems;
  if (questRead.changelog === null) {
    quest = {
      problems: [],
      version,
      previous: null,
      level: null,
      source: null,
      breaking: false,
      legacyMarker: false,
      sectionsRead: 0,
    };
    questProblems = [
      `quest's CHANGELOG could not be read from ${questRead.source} (${questRead.error}); a breaking entry in either changelog forces the pair's bump, so an unreadable one refuses rather than assumes (QCLI-328, opum-doc ADR gate-release-prep-on-a-breaking-changelog-entry-at-a-patch-bump)`,
    ];
  } else {
    quest = breakingBumpProblems(questRead.changelog, version, `quest's CHANGELOG (${questRead.source})`);
    questProblems = [...quest.problems];
    if (quest.sectionsRead === 0)
      questProblems.push(`quest's CHANGELOG (${questRead.source}) has no ## sections; nothing was checked.`);
  }

  return {
    version,
    lore: { ...lore, problems: loreProblems },
    quest: { ...quest, problems: questProblems, readSource: questRead.source },
    // Both sides can carry the same problem shape ("## Unreleased carries a
    // breaking heading..."), so each aggregated problem names its changelog.
    problems: [
      ...loreProblems.map((problem) => `lore: ${problem}`),
      ...questProblems.map((problem) => `quest: ${problem}`),
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const atNext = argv.indexOf("--next");
  const next = atNext === -1 ? undefined : argv[atNext + 1];
  if (atNext !== -1 && (!next || !parse(next))) {
    console.error("usage: check-breaking-bump.mjs [--next <x.y.z>] [--quest-ref <ref>]");
    process.exit(2);
  }
  const atRef = argv.indexOf("--quest-ref");
  const questRef = atRef === -1 ? QUEST.ref : argv[atRef + 1];
  if (atRef !== -1 && (!questRef || questRef.startsWith("--"))) {
    console.error("usage: check-breaking-bump.mjs [--next <x.y.z>] [--quest-ref <ref>]");
    process.exit(2);
  }
  const result = await checkBreakingBump({ next, questRef });
  if (result.problems.length) {
    console.error(
      `The version bump does not match the CHANGELOGs (lore read ${result.lore.sectionsRead} sections; quest read ${result.quest.sectionsRead} sections from ${result.quest.readSource}):\n` +
        result.problems.map((problem) => `  - ${problem}`).join("\n"),
    );
    process.exit(1);
  }
  const note = (side) =>
    side.breaking
      ? `which carries a breaking heading, and ${side.previous} -> ${side.version} is a ${side.level} bump`
      : `with no breaking heading${side.level ? ` (${side.previous} -> ${side.version} is a ${side.level} bump)` : ""}`;
  console.log(
    `${result.version}: lore read ${result.lore.sectionsRead} CHANGELOG sections; its notes are ${result.lore.source}, ` +
      `${note(result.lore)}. quest read ${result.quest.sectionsRead} CHANGELOG sections from ${result.quest.readSource}; ` +
      `its notes are ${result.quest.source}, ${note(result.quest)}.`,
  );
}
