/**
 * lcli632-breaking-bump-gate.test.ts — release-prep refuses a patch-level bump
 * when the checked CHANGELOG section carries a breaking-change marker
 * (LCLI-632, mirror of quest-cli QCLI-328; opum-doc
 * docs/adr/gate-release-prep-on-a-breaking-changelog-entry-at-a-patch-bump.md).
 *
 * quest-cli's implementation is scripts/check-breaking-bump.mjs, read by ref
 * at opum-ai/quest-cli commit bee163610791547e7bb6cefc48f967daaf8bab2d (the
 * merge of opum-ai/quest-cli#367). Because lore and quest share one version
 * (constitution Article 3 clause 1), a breaking entry in EITHER changelog
 * forces the pair to at least minor: lore's gate also reads quest-cli's
 * CHANGELOG.md by ref and refuses when it cannot be read (AC3, enforced).
 *
 * Proven here on one tree, both ways: the same CHANGELOG is refused at a
 * patch bump and accepted at a minor/major bump. The orchestrator's AC2
 * rulings are proven too: quest's `### ... (breaking)` heading is canonical
 * (byte-for-byte the same regex), lore's legacy bold `**BEHAVIOUR CHANGE:**`
 * marker fails at ANY bump level naming the canonical spelling, and the notes
 * section is chosen by quest's own rule, verbatim: the version's own
 * "## [X]" section when it exists (checked against the section below it),
 * otherwise the Unreleased section (checked against the first versioned
 * section). The quest-side fetch is injected or stubbed everywhere, so no
 * test here hits the network.
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import {
  BREAKING_HEADING,
  breakingBumpProblems,
  bumpLevel,
  checkBreakingBump,
  LEGACY_BREAKING_MARKER,
  QUEST,
  questChangelogArgs,
  readQuestChangelog,
} from "../scripts/check-breaking-bump.mjs";

const SCRIPT = join(import.meta.dir, "..", "scripts", "check-breaking-bump.mjs");

/** lore's Keep-a-Changelog heading family (bracketed), with a canonical breaking heading. */
const BREAKING_UNRELEASED = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Changed (breaking)",
  "",
  "- An envelope moved.",
  "",
  "## [1.4.0] - 2026-09-01",
  "",
  "### Fixed",
  "",
  "- Something.",
].join("\n");

/** The same fixture in quest's bare heading family. */
const BARE_BREAKING_UNRELEASED = BREAKING_UNRELEASED.replace("## [Unreleased]", "## Unreleased").replace(
  "## [1.4.0] - 2026-09-01",
  "## 1.4.0 - 2026-09-01",
);

/** lore's legacy bold marker, the spelling the AC2 ruling names. */
const LEGACY_UNRELEASED = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Changed",
  "",
  "- **BEHAVIOUR CHANGE: something changed** (EXAMPLE-1).",
  "",
  "## [1.4.0] - 2026-09-01",
  "",
  "### Fixed",
  "",
  "- Something.",
].join("\n");

const QUEST_BREAKING_UNRELEASED = BARE_BREAKING_UNRELEASED;
const QUEST_CLEAN_UNRELEASED = BARE_BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed");

test("bump levels", () => {
  expect(bumpLevel("1.4.0", "1.4.1")).toBe("patch");
  expect(bumpLevel("1.4.0", "1.5.0")).toBe("minor");
  expect(bumpLevel("0.10.0", "0.11.0")).toBe("minor");
  expect(bumpLevel("1.4.0", "2.0.0")).toBe("major");
  expect(bumpLevel("1.4.0", "1.4.0")).toBe("patch");
});

test("the canonical heading vocabulary is byte-for-byte quest-cli's (bee16361)", () => {
  expect(BREAKING_HEADING.source).toBe("^###\\s.*\\(breaking\\)");
  expect(BREAKING_HEADING.flags).toBe("im");
});

test("one tree: a patch bump over a breaking [Unreleased] is refused, minor and major pass", () => {
  const patch = breakingBumpProblems(BREAKING_UNRELEASED, "1.4.1");
  expect(patch).toMatchObject({
    source: "## [Unreleased]",
    previous: "1.4.0",
    level: "patch",
    breaking: true,
    legacyMarker: false,
  });
  expect(patch.problems).toHaveLength(1);
  expect(patch.problems[0]).toContain("1.4.0 -> 1.4.1 is a patch bump");
  expect(patch.problems[0]).toContain("at least a minor bump");
  for (const version of ["1.5.0", "2.0.0"])
    expect(breakingBumpProblems(BREAKING_UNRELEASED, version).problems).toEqual([]);
});

test("quest's bare heading family parses to the same verdicts", () => {
  const patch = breakingBumpProblems(BARE_BREAKING_UNRELEASED, "1.4.1");
  expect(patch).toMatchObject({ source: "## Unreleased", previous: "1.4.0", level: "patch", breaking: true });
  expect(patch.problems).toHaveLength(1);
  expect(breakingBumpProblems(BARE_BREAKING_UNRELEASED, "1.5.0").problems).toEqual([]);
});

test("after the changelog is finalized: the version's own section is read against the heading below it", () => {
  const finalized = BREAKING_UNRELEASED.replace("## [Unreleased]", "## [Unreleased]\n\n## [1.4.1] - 2026-09-02");
  const patch = breakingBumpProblems(finalized, "1.4.1");
  expect(patch).toMatchObject({
    source: "## [1.4.1] - 2026-09-02",
    previous: "1.4.0",
    breaking: true,
  });
  expect(patch.problems).toHaveLength(1);
  const minor = finalized.replace("## [1.4.1] -", "## [1.5.0] -");
  expect(breakingBumpProblems(minor, "1.5.0").problems).toEqual([]);
});

test("no breaking heading: a patch bump passes", () => {
  const plain = BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed");
  const result = breakingBumpProblems(plain, "1.4.1");
  expect(result).toMatchObject({ breaking: false, legacyMarker: false, level: "patch" });
  expect(result.problems).toEqual([]);
});

describe("the version's own section wins over [Unreleased] (quest parity; reviewer findings)", () => {
  test("a breaking own section refuses a patch bump even when [Unreleased] holds a clean leftover note", () => {
    // The certification hole: package.json names the bumped version, its
    // "## [X]" section carries the breaking heading, and one clean note is
    // still under [Unreleased]. quest's rule checks the own section, so the
    // patch bump must refuse — [Unreleased] must not redirect the check.
    const hybrid = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Changed",
      "",
      "- A clean leftover note.",
      "",
      "## [1.4.1] - 2026-09-02",
      "",
      "### Changed (breaking)",
      "",
      "- An envelope moved.",
      "",
      "## [1.4.0] - 2026-09-01",
    ].join("\n");
    const patch = breakingBumpProblems(hybrid, "1.4.1");
    expect(patch).toMatchObject({
      source: "## [1.4.1] - 2026-09-02",
      previous: "1.4.0",
      level: "patch",
      breaking: true,
    });
    expect(patch.problems).toHaveLength(1);
    expect(patch.problems[0]).toContain("1.4.0 -> 1.4.1 is a patch bump");
    const minor = hybrid.replace("## [1.4.1] -", "## [1.5.0] -");
    expect(breakingBumpProblems(minor, "1.5.0").problems).toEqual([]);
  });

  test("a breaking [Unreleased] does not bind once the bump is in with a clean own section, and previous is the section below", () => {
    // The inverse false positive: the NEXT release's breaking notes are still
    // under [Unreleased] while the checked version's own section is clean. The
    // gate must pass with no self-patch problem ("1.4.1 -> 1.4.1") and
    // previous naming the section BELOW the own one, never the own version.
    const hybrid = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Changed (breaking)",
      "",
      "- The next release's note.",
      "",
      "## [1.4.1] - 2026-09-02",
      "",
      "### Fixed",
      "",
      "- Something.",
      "",
      "## [1.4.0] - 2026-09-01",
    ].join("\n");
    const result = breakingBumpProblems(hybrid, "1.4.1");
    expect(result).toMatchObject({
      source: "## [1.4.1] - 2026-09-02",
      previous: "1.4.0",
      level: "patch",
      breaking: false,
      legacyMarker: false,
    });
    expect(result.problems).toEqual([]);
  });
});

test("an older section's breaking or legacy markers do not bind the current bump, and previous is the section below it", () => {
  // The checked version's own section is what gets scanned (quest's rule), so
  // markers in sections further down the file are never consulted.
  const history = [
    "## [Unreleased]",
    "",
    "## [1.5.1] - 2026-09-03",
    "",
    "### Fixed",
    "",
    "## [1.5.0] - 2026-09-02",
    "",
    "### Changed (breaking)",
    "",
    "- **BEHAVIOUR CHANGE: old news** (EXAMPLE-2).",
    "",
    "## [1.4.0] - 2026-09-01",
  ].join("\n");
  const result = breakingBumpProblems(history, "1.5.1");
  expect(result).toMatchObject({
    source: "## [1.5.1] - 2026-09-03",
    previous: "1.5.0",
    breaking: false,
    legacyMarker: false,
  });
  expect(result.problems).toEqual([]);
});

describe("the AC2 legacy marker", () => {
  test("fails at ANY bump level, naming the canonical spelling", () => {
    const patch = breakingBumpProblems(LEGACY_UNRELEASED, "1.4.1");
    expect(patch).toMatchObject({ breaking: false, legacyMarker: true, level: "patch" });
    // Exactly one problem — the legacy marker is not a canonical breaking
    // heading, so the patch-bump problem does not also fire.
    expect(patch.problems).toHaveLength(1);
    expect(patch.problems[0]).toContain("**BEHAVIOUR CHANGE:**");
    expect(patch.problems[0]).toContain("### Changed (breaking)");
    for (const version of ["1.5.0", "2.0.0"]) {
      const result = breakingBumpProblems(LEGACY_UNRELEASED, version);
      expect(result.legacyMarker).toBe(true);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]).toContain("### Changed (breaking)");
    }
  });

  test("both markers in one section produce both problems", () => {
    const both = LEGACY_UNRELEASED.replace("### Changed", "### Changed (breaking)");
    const result = breakingBumpProblems(both, "1.4.1");
    expect(result.breaking).toBe(true);
    expect(result.legacyMarker).toBe(true);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toContain("BEHAVIOUR CHANGE");
    expect(result.problems[1]).toContain("1.4.0 -> 1.4.1 is a patch bump");
  });

  test("the marker matches lore's bullet style and not the lowercase variant", () => {
    expect(LEGACY_BREAKING_MARKER.test("- **BEHAVIOUR CHANGE: x**")).toBe(true);
    expect(LEGACY_BREAKING_MARKER.test("  * **BEHAVIOUR CHANGE: x**")).toBe(true);
    // The ruling names the bold uppercase marker; a lowercase aside is not it.
    expect(LEGACY_BREAKING_MARKER.test("- **Behaviour change:** x")).toBe(false);
    expect(LEGACY_BREAKING_MARKER.test("### Changed (breaking)")).toBe(false);
  });
});

describe("the quest-side read (AC3, enforced)", () => {
  test("the read is pinned: gh, github.com, the raw media type, quest-cli's CHANGELOG.md at the named ref", async () => {
    const seen: Array<{ file: string; args: string[] }> = [];
    const read = await readQuestChangelog({
      ref: "main",
      execFile: async (file, args) => {
        seen.push({ file, args });
        return { stdout: QUEST_CLEAN_UNRELEASED };
      },
    });
    expect(seen).toEqual([
      {
        file: "gh",
        args: [
          "api",
          "--hostname",
          "github.com",
          "-H",
          "Accept: application/vnd.github.raw",
          "repos/opum-ai/quest-cli/contents/CHANGELOG.md?ref=main",
        ],
      },
    ]);
    expect(questChangelogArgs("main")).toEqual(seen[0]?.args as string[]);
    expect(questChangelogArgs().at(-1)).toBe("repos/opum-ai/quest-cli/contents/CHANGELOG.md?ref=dev");
    expect(QUEST).toEqual({ repository: "opum-ai/quest-cli", ref: "dev" });
    expect(read).toEqual({ changelog: QUEST_CLEAN_UNRELEASED, source: "opum-ai/quest-cli@main:CHANGELOG.md" });
  });

  test("an unreadable quest changelog is not a clean one", async () => {
    const read = await readQuestChangelog({
      execFile: async () => {
        throw Object.assign(new Error("Command failed"), { stderr: "gh: Not Found (HTTP 404)\nmore" });
      },
    });
    expect(read.changelog).toBeNull();
    expect(read.error).toContain("HTTP 404");
  });

  test("a breaking heading in quest's changelog forces lore's bump, and a clean one does not", async () => {
    const dir = await makeTree("1.4.0", BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed"));
    try {
      const patch = await checkBreakingBump({
        directory: dir,
        next: "1.4.1",
        questRef: "main",
        questChangelog: QUEST_BREAKING_UNRELEASED,
      });
      expect(patch.lore.problems).toEqual([]);
      expect(patch.quest.breaking).toBe(true);
      expect(patch.quest.sectionsRead).toBeGreaterThan(0);
      expect(patch.quest.readSource).toBe("opum-ai/quest-cli@main:CHANGELOG.md");
      expect(patch.problems).toHaveLength(1);
      expect(patch.problems[0]).toContain("quest:");
      expect(patch.problems[0]).toContain("1.4.0 -> 1.4.1 is a patch bump");

      // The same rule on the quest side: minor passes, and each side's
      // sections-read count is reported.
      const minor = await checkBreakingBump({
        directory: dir,
        next: "1.5.0",
        questRef: "main",
        questChangelog: QUEST_BREAKING_UNRELEASED,
      });
      expect(minor.quest.level).toBe("minor");
      expect(minor.problems).toEqual([]);
      expect(minor.lore.sectionsRead).toBeGreaterThan(0);
      expect(minor.quest.sectionsRead).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unreadable quest changelog refuses even when lore's side is clean", async () => {
    const dir = await makeTree("1.4.0", BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed"));
    try {
      const result = await checkBreakingBump({
        directory: dir,
        next: "1.4.1",
        readQuest: async () => ({
          changelog: null,
          source: "opum-ai/quest-cli@dev:CHANGELOG.md",
          error: "spawn gh ENOENT",
        }),
      });
      expect(result.lore.problems).toEqual([]);
      expect(result.problems).toEqual([
        expect.stringContaining(
          "quest: quest's CHANGELOG could not be read from opum-ai/quest-cli@dev:CHANGELOG.md (spawn gh ENOENT)",
        ),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a quest changelog with no ## sections is a failure, not a pass", async () => {
    const dir = await makeTree("1.4.0", BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed"));
    try {
      const result = await checkBreakingBump({
        directory: dir,
        next: "1.4.1",
        questChangelog: "# Changelog\n\nno sections here",
      });
      expect(result.quest.sectionsRead).toBe(0);
      // Two truthful problems: no section holds the notes, and zero sections
      // were read — nothing was checked.
      expect(result.problems).toHaveLength(2);
      expect(result.problems[0]).toContain("quest: quest's CHANGELOG");
      expect(result.problems[1]).toContain("no ## sections; nothing was checked");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("the real CHANGELOG: --next checks [Unreleased] against the current version; a no-flag run checks the released section (stale-tree window)", () => {
  const real = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  // Pre-bump: --next names a version with no section of its own, so
  // [Unreleased] (which carries the LCLI-612 canonical breaking heading) is
  // checked against the first versioned section.
  const patch = breakingBumpProblems(real, "0.11.1");
  expect(patch).toMatchObject({ source: "## [Unreleased]", previous: version, level: "patch", breaking: true });
  expect(patch.problems).toEqual([expect.stringContaining(`${version} -> 0.11.1 is a patch bump`)]);
  const next = breakingBumpProblems(real, "0.12.0");
  expect(next).toMatchObject({ previous: version, level: "minor", breaking: true });
  expect(next.problems).toEqual([]);
  // Stale-tree window: with no --next, package.json still names the released
  // 0.11.0, so its own section is the checked one — and that released section
  // carries the legacy marker, so the run reds naming the canonical spelling.
  // Documented in the script header (item 4); release prep runs --next and a
  // CI dispatch has the bump in by then.
  const stale = breakingBumpProblems(real, "0.11.0");
  expect(stale.sectionsRead).toBeGreaterThan(10);
  expect(stale).toMatchObject({
    source: "## [0.11.0] - 2026-09-27",
    previous: "0.9.3",
    level: "minor",
    breaking: false,
    legacyMarker: true,
  });
  expect(stale.problems).toHaveLength(1);
  expect(stale.problems[0]).toContain("**BEHAVIOUR CHANGE:**");
  expect(stale.problems[0]).toContain("### Changed (breaking)");
});

describe("the command, with a stubbed gh (no network)", () => {
  // A fake `gh` that answers with a fixture changelog or fails, so the CLI can
  // be exercised end to end exactly as release.yml runs it.
  function withStubGh(fixture: string | null) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "lcli632-cli-")));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const stub = join(bin, "gh");
    writeFileSync(
      stub,
      [
        "#!/bin/sh",
        'if [ -n "$FAKE_GH_EXIT" ]; then',
        '  echo "stub gh failing with $FAKE_GH_EXIT" >&2',
        '  exit "$FAKE_GH_EXIT"',
        "fi",
        'if [ -z "$FAKE_GH_CHANGELOG" ]; then',
        '  echo "stub gh: FAKE_GH_CHANGELOG is not set" >&2',
        "  exit 1",
        "fi",
        'cat "$FAKE_GH_CHANGELOG"',
        "",
      ].join("\n"),
    );
    chmodSync(stub, 0o755);
    if (fixture !== null) {
      writeFileSync(join(dir, "quest-changelog.md"), fixture);
    }
    return { dir, bin };
  }

  async function run(dir: string, args: string[], env: Record<string, string | undefined> = {}) {
    const copy = join(dir, "check.mjs");
    // The script reads the checkout it lives in; copy it next to the files.
    writeFileSync(
      copy,
      readFileSync(SCRIPT, "utf8").replace('new URL("..", import.meta.url)', 'new URL(".", import.meta.url)'),
    );
    const child = Bun.spawnSync(["node", copy, ...args], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: `${env.BIN}${delimiter}${process.env.PATH}`, ...env },
    });
    return { exitCode: child.exitCode, stdout: child.stdout.toString(), stderr: child.stderr.toString() };
  }

  test("a patch bump over lore's breaking section exits 1 naming the bump; a minor exits 0 reporting both sides", async () => {
    const { dir, bin } = withStubGh(QUEST_CLEAN_UNRELEASED);
    try {
      await makeTreeInto(dir, "1.4.0", BREAKING_UNRELEASED);
      const env = { BIN: bin, FAKE_GH_CHANGELOG: join(dir, "quest-changelog.md") };
      const patch = await run(dir, ["--next", "1.4.1"], env);
      expect(patch.exitCode).toBe(1);
      expect(patch.stderr).toContain("lore: ## [Unreleased] carries a breaking heading");
      expect(patch.stderr).toContain("1.4.0 -> 1.4.1 is a patch bump");
      expect(patch.stderr).toContain("lore read 2 sections");
      expect(patch.stderr).toContain("quest read 2 sections from opum-ai/quest-cli@dev:CHANGELOG.md");
      const minor = await run(dir, ["--next", "1.5.0"], env);
      expect(minor.exitCode).toBe(0);
      expect(minor.stdout).toContain("lore read 2 CHANGELOG sections");
      expect(minor.stdout).toContain("quest read 2 CHANGELOG sections from opum-ai/quest-cli@dev:CHANGELOG.md");
      expect(minor.stdout).toContain("1.4.0 -> 1.5.0 is a minor bump");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a breaking heading in quest's changelog forces lore's bump through the real command", async () => {
    const { dir, bin } = withStubGh(QUEST_BREAKING_UNRELEASED);
    try {
      await makeTreeInto(dir, "1.4.0", BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed"));
      const env = { BIN: bin, FAKE_GH_CHANGELOG: join(dir, "quest-changelog.md") };
      // Lore's side is clean; the red comes from the quest side at a patch bump.
      const patch = await run(dir, ["--next", "1.4.1"], env);
      expect(patch.exitCode).toBe(1);
      expect(patch.stderr).toContain("quest: ## Unreleased carries a breaking heading");
      expect(patch.stderr).toContain("1.4.0 -> 1.4.1 is a patch bump");
      // The same rule applies on the quest side: a minor bump passes.
      expect((await run(dir, ["--next", "1.5.0"], env)).exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unreadable quest changelog exits 1, even with a clean lore side", async () => {
    const { dir, bin } = withStubGh(null);
    try {
      await makeTreeInto(dir, "1.4.0", BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed"));
      const result = await run(dir, ["--next", "1.4.1"], { BIN: bin, FAKE_GH_EXIT: "1" });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "quest: quest's CHANGELOG could not be read from opum-ai/quest-cli@dev:CHANGELOG.md",
      );
      expect(result.stderr).toContain("stub gh failing with 1");
      expect(result.stderr).toContain("quest read 0 sections");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a malformed --next exits 2", async () => {
    const { dir, bin } = withStubGh(QUEST_CLEAN_UNRELEASED);
    try {
      await makeTreeInto(dir, "1.4.0", BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed"));
      const result = await run(dir, ["--next", "nope"], {
        BIN: bin,
        FAKE_GH_CHANGELOG: join(dir, "quest-changelog.md"),
      });
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("usage: check-breaking-bump.mjs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the --quest-ref=main equals form is honored, and an empty one exits 2", async () => {
    const { dir, bin } = withStubGh(QUEST_CLEAN_UNRELEASED);
    try {
      await makeTreeInto(dir, "1.4.0", BREAKING_UNRELEASED.replace("### Changed (breaking)", "### Changed"));
      const env = { BIN: bin, FAKE_GH_CHANGELOG: join(dir, "quest-changelog.md") };
      // The readSource names the ref the flag carried: had the equals form
      // been silently ignored, the default dev would appear instead of main.
      const main = await run(dir, ["--next", "1.5.0", "--quest-ref=main"], env);
      expect(main.exitCode).toBe(0);
      expect(main.stdout).toContain("quest read 2 CHANGELOG sections from opum-ai/quest-cli@main:CHANGELOG.md");
      const empty = await run(dir, ["--next", "1.5.0", "--quest-ref="], env);
      expect(empty.exitCode).toBe(2);
      expect(empty.stderr).toContain("usage: check-breaking-bump.mjs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── scratch-tree helpers ──────────────────────────────────────────────────────

/** A scratch directory holding package.json and CHANGELOG.md. */
async function makeTree(version: string, changelog: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lcli632-fn-")));
  await makeTreeInto(dir, version, changelog);
  return dir;
}

async function makeTreeInto(dir: string, version: string, changelog: string) {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
  writeFileSync(join(dir, "CHANGELOG.md"), changelog);
}
