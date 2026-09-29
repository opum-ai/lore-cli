/**
 * github-release.test.ts — scripts/github-release.mjs (LCLI-622, opum-agent OPAG-646), the step that
 * cuts lore's GitHub Release from CHANGELOG.md once `latest` is verified. Paired with quest-cli
 * QCLI-398 and QCLI-401: quest's module at 06fa623a (opum-ai/quest-cli#360, merged 93fca842) is the
 * spec for every existing-release state, and the verdict table below is the one QCLI-401 AC6 asks
 * lore for. Every gh call goes through a stubbed execFile; nothing here reaches a network.
 *
 * Measured, not tested (no network in a test): on 2026-09-28 the hand-cut v0.11.0 release body,
 * trimmed, was byte-equal to changelogSection(CHANGELOG.md, "0.11.0").body. So the automated cut
 * reproduces the practice it replaces, and an existing v0.11.0 would read as an exact match.
 *
 * SINCE LCLI-639 the notes come from CHANGELOG.md AT the commit v<version> peels to, read with one
 * pinned gh api raw-contents call, and never from this checkout: releaseNotesFor takes the TEXT,
 * and the repair command resolves the tag first. So every stub below answers the tag reads and the
 * contents read as well as the release ones. The end-to-end proof that a divergent working-tree
 * CHANGELOG.md does not reach the release body (and the pre-change control for it) is
 * test/lcli639-release-notes-from-tagged-commit.test.ts; the fenced-code-block vectors just below
 * are here, beside the extractor's other unit tests.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  changelogAtRefArgs,
  changelogSection,
  type ExecFile,
  ensureGitHubRelease,
  main,
  RELEASE_REPOSITORY,
  REPAIR_COMMAND,
  readChangelogAtCommit,
  releaseNotesFor,
  releaseTitle,
} from "../scripts/github-release.mjs";

const REPO = "github.com/opum-ai/lore-cli";
/** The annotated tag the stub resolves: refs/tags/v<version> -> tag object -> this commit. */
const TAG_OBJECT = "9".repeat(40);
const COMMIT = "a".repeat(40);
/** The two tag reads, in the order resolveTagCommit makes them. The third is the contents read. */
const tagRefArgs = (version: string) => [
  "api",
  "--hostname",
  "github.com",
  `repos/opum-ai/lore-cli/git/ref/tags/v${version}`,
];
const tagObjectArgs = ["api", "--hostname", "github.com", `repos/opum-ai/lore-cli/git/tags/${TAG_OBJECT}`];

const CHANGELOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "- Not released yet.",
  "",
  "## [0.10.0] - 2026-09-24",
  "",
  "Ten.",
  "",
  "## [0.1.10] - 2026-08-20",
  "",
  "Not a version 0.1.1 should match.",
  "",
  "## [0.1.1] - 2026-08-17",
  "",
  "One.",
  "",
  "## 0.0.8 - 2026-08-02",
  "",
  "An unbracketed heading: not a Keep a Changelog version heading.",
  "",
  "## [0.0.9] - 2026-08-01 (tagged, never published)",
  "",
  "Never shipped.",
  "",
  "## [0.0.7] - 2026-07-01",
  "",
  "",
  "## [0.0.1] - 2026-06-01",
  "",
  "The first.",
  "",
  "[Unreleased]: https://github.com/opum-ai/lore-cli/commits/dev",
  "[0.0.1]: https://github.com/opum-ai/lore-cli/releases/tag/v0.0.1",
  "",
].join("\n");

describe("changelogSection: Keep a Changelog headings (LCLI-622)", () => {
  test("a dated bracketed heading's section, up to the next heading, heading excluded, trimmed", () => {
    expect(changelogSection(CHANGELOG, "0.10.0")).toEqual({ heading: "## [0.10.0] - 2026-09-24", body: "Ten." });
  });

  test("0.1.1 does not match the 0.1.10 heading listed above it", () => {
    expect(changelogSection(CHANGELOG, "0.1.1")?.body).toBe("One.");
    expect(changelogSection(CHANGELOG, "0.1.10")?.body).toBe("Not a version 0.1.1 should match.");
  });

  test("the brackets are required: an unbracketed ## X heading is not a version section", () => {
    expect(changelogSection(CHANGELOG, "0.0.8")).toBeNull();
    // Positive control: the same text bracketed is found.
    expect(changelogSection(CHANGELOG.replace("## 0.0.8 -", "## [0.0.8] -"), "0.0.8")?.body).toBe(
      "An unbracketed heading: not a Keep a Changelog version heading.",
    );
  });

  test("absent, empty or Unreleased is null, never an empty release", () => {
    expect(changelogSection(CHANGELOG, "9.9.9")).toBeNull();
    expect(changelogSection(CHANGELOG, "0.0.7")).toBeNull();
    expect(changelogSection(CHANGELOG, "Unreleased")).toBeNull();
    expect(changelogSection(CHANGELOG, "")).toBeNull();
  });

  test("the last section stops at the trailing link-reference block", () => {
    expect(changelogSection(CHANGELOG, "0.0.1")).toEqual({ heading: "## [0.0.1] - 2026-06-01", body: "The first." });
  });

  test("CRLF line ends read the same as LF", () => {
    expect(changelogSection(CHANGELOG.replace(/\n/g, "\r\n"), "0.10.0")?.body).toBe("Ten.");
  });

  // ── Fenced code blocks (LCLI-639, extractor parity with quest-cli QCLI-407) ───────────────────
  // A `## ` line inside a fence is the fence's content, not a heading: without this, a section
  // holding an example CHANGELOG heading is silently truncated at it. The predicate is CommonMark's
  // at its edges: an opener is ``` or ~~~ indented at most three spaces, a closer is the same with
  // nothing after it, and while CLOSED a bare "```" OPENS rather than closing on itself.
  const fenced = (open: string, close: string) =>
    [
      "# Changelog",
      "",
      "## [1.0.0] - 2026-09-28",
      "",
      "Before.",
      "",
      open,
      "## [0.9.0] - a heading inside the fence",
      close,
      "",
      "After.",
      "",
      "## [0.5.0] - 2026-09-01",
      "",
      "Older.",
    ].join("\n");
  test("(i) a ## line inside an unindented fence does not end the section", () => {
    expect(changelogSection(fenced("```js", "```"), "1.0.0")).toEqual({
      heading: "## [1.0.0] - 2026-09-28",
      body: ["Before.", "", "```js", "## [0.9.0] - a heading inside the fence", "```", "", "After."].join("\n"),
    });
  });

  test("(ii) a ## line inside a 2-space-indented fence does not end the section", () => {
    expect(changelogSection(fenced("  ```", "  ```"), "1.0.0")).toEqual({
      heading: "## [1.0.0] - 2026-09-28",
      body: ["Before.", "", "  ```", "## [0.9.0] - a heading inside the fence", "  ```", "", "After."].join("\n"),
    });
  });

  test("(iii) a ## line after a CLOSED fence still ends the section", () => {
    const text = fenced("~~~", "~~~");
    expect(changelogSection(text, "1.0.0")?.body).not.toContain("Older.");
    // Positive control: the section below it is a real section, found as its own.
    expect(changelogSection(text, "0.5.0")?.body).toBe("Older.");
  });

  test("(iv) an UNCLOSED fence runs the section to EOF, carrying the ## lines that follow", () => {
    const unclosed = [
      "# Changelog",
      "",
      "## [1.0.0] - 2026-09-28",
      "",
      "```",
      "## [0.9.0] - also inside the unclosed fence",
      "",
      "## [0.5.0] - 2026-09-01",
      "",
      "Older.",
      "",
      "[0.5.0]: https://github.com/opum-ai/lore-cli/releases/tag/v0.5.0",
      "",
    ].join("\n");
    const body = changelogSection(unclosed, "1.0.0")?.body ?? "";
    expect(body).toContain("## [0.9.0] - also inside the unclosed fence");
    expect(body).toContain("## [0.5.0] - 2026-09-01");
    expect(body).toContain("Older.");
    // The trailing link-reference trim still applies on the EOF branch an unclosed fence reaches.
    expect(body).not.toContain("[0.5.0]: https://");
  });

  test("a fenced body reads the same with CRLF line ends as with LF", () => {
    const text = fenced("```js", "```");
    expect(changelogSection(text.replace(/\n/g, "\r\n"), "1.0.0")).toEqual(changelogSection(text, "1.0.0"));
  });

  // ── The refined fence rule, the three defects both reviews found (LCLI-639) ────────────────────
  // The fence state of the WHOLE document is computed FIRST, remembering the opener's CHARACTER and
  // RUN LENGTH: a closer must be the same character at least as many times, and a BACKTICK fence's
  // info string may not itself contain a backtick ("```a`b" opens nothing, so the `## ` line under
  // it really is a heading). The section's START is subject to that state too, so a fenced
  // "## [X]" line cannot hijack a section out of the real heading below it, and END cannot be a
  // fenced `## ` line. The three defects the previous predicate had, all measured on it: a tilde
  // line closed a backtick fence (truncation), a four-marker fence swallowed the next entry (a
  // regression the fence rule introduced), and a fenced "## [X]" hijacked the section (also a
  // regression). Bodies below are quest-cli's, measured on its side of the same rule.
  //
  // MUTATION CONTROL. PREDICTION, written before measuring: of the THIRTEEN fence tests in this
  // file -- the eight vectors below and the five above it -- the SEVEN that go red against the
  // PREVIOUS predicate are exactly (a), (b), (c), (d), (e), (g) and (f-bracketed), and the SIX
  // that stay green are (f) itself, because an unbracketed `## 9.9.9` is not a lore version heading
  // under either rule, plus the five vectors above, because each of those is exactly three markers
  // of one character -- the only shape the old predicate gets right. That predicate is a two-regex
  // toggle: it opens on any ```/~~~ line, closes on an EXACT three-marker line, tracks neither
  // character nor run, and applies no fence state to the START scan. A blanket red would not be
  // localised; a 7-of-13 red set is.
  // MEASURED, and the prediction held exactly: the mutant was `c6c248b1`'s extractor read out of
  // git (not hand-patched), and it was RED on those 7 -- (a) "```md\nalpha\n~~~", (b) the next
  // entry swallowed, (c) the body running to EOF, (d) "````\nalpha\n```", (e) the next entry
  // swallowed, (f-bracketed) a body out of the fenced heading, (g) "```a`b\n## not a heading\n```"
  // -- and GREEN on the other 6. The harness carried twelve of the thirteen cases and measured 7
  // red / 5 green; the thirteenth, the fenced-CRLF pair above, differs only in line endings and is
  // green in this file, and the refined extractor matched all twelve it carried. The fence-BLIND
  // pre-change extractor (fee53bc6) was measured in the same harness: it truncates (a) exactly as
  // the mutant does, matches (d) and (g) by the same blindness that produced the defect, and its
  // bounded-but-wrong bodies on (b), (c), (e) and (f-bracketed) are what make those four
  // regressions rather than defects the fence rule never reached.
  const refined: Array<[string, string, string | null, string?]> = [
    [
      "(a) a tilde line inside a backtick fence is content, not a closer",
      "## [9.9.9]\n\n```md\nalpha\n~~~\n## still inside the fence\nbeta\n```\n\n## [9.9.8]\n\nolder\n",
      "```md\nalpha\n~~~\n## still inside the fence\nbeta\n```",
    ],
    [
      "(b) a four-marker fence is closed by its own four, and the next ## ends the section",
      "## [9.9.9]\n\n````\nalpha\n````\n\n## [9.9.8]\n\nolder\n",
      "````\nalpha\n````",
    ],
    [
      "(c) a fenced ## [X] does not hijack the section: START is the real heading",
      "## Unreleased\n\n```\n## [9.9.9]\n```\n\n## [9.9.9]\n\nreal body\n\n## [9.9.8]\n\nolder\n",
      "real body",
      "## [9.9.9]",
    ],
    [
      "(d) three markers inside a four-marker fence do NOT close it",
      "## [9.9.9]\n\n````\nalpha\n```\n## still inside\n````\n\n## [9.9.8]\n\nolder\n",
      "````\nalpha\n```\n## still inside\n````",
    ],
    [
      "(e) five markers inside a three-marker fence DO close it (at least the opener's run)",
      "## [9.9.9]\n\n```\nalpha\n`````\n\n## [9.9.8]\n\nolder\n",
      "```\nalpha\n`````",
    ],
    [
      "(f) a fenced `## 9.9.9` is no section at all: an unbracketed heading is never one",
      "## Unreleased\n\n```\n## 9.9.9\n```\n\n## [9.9.8]\n\nolder\n",
      null,
    ],
    [
      "(f-bracketed) a fenced `## [9.9.9]` is no section at all: the only match is inside a fence",
      "## Unreleased\n\n```\n## [9.9.9]\n```\n\n## [9.9.8]\n\nolder\n",
      null,
    ],
    [
      "(g) a backtick in a backtick fence's info string means no fence opened, so ## ends the section",
      "## [9.9.9]\n\n```a`b\n## not a heading\n```\n\n## [9.9.8]\n\nolder\n",
      "```a`b",
    ],
  ];

  for (const [name, doc, body, heading] of refined)
    test(`${name}`, () => {
      const section = changelogSection(doc, "9.9.9");
      expect(section?.body ?? null).toBe(body);
      if (heading !== undefined) expect(section?.heading).toBe(heading);
    });

  test("every ## [X] heading in the real CHANGELOG.md yields notes, and the oldest carries no link references", () => {
    const real = readFileSync(join(import.meta.dir, "..", "CHANGELOG.md"), "utf8");
    const versions = [...real.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1] as string);
    // Positive control: the file has version headings to check, not zero.
    expect(versions.length).toBeGreaterThan(20);
    const empty = versions.filter((version) => (changelogSection(real, version)?.body.length ?? 0) === 0);
    expect(empty).toEqual([]);
    const oldest = versions.at(-1) as string;
    expect(changelogSection(real, oldest)?.body).not.toMatch(/^\[[^\]]+\]:\s*https?:/m);
  });
});

test("title: 'Lore CLI X', and a never-published heading says so (quest's rule, kept for symmetry)", () => {
  expect(releaseTitle("0.10.0", "## [0.10.0] - 2026-09-24")).toBe("Lore CLI 0.10.0");
  expect(releaseTitle("0.0.9", "## [0.0.9] - 2026-08-01 (tagged, never published)")).toBe(
    "Lore CLI 0.0.9 (tagged, never published)",
  );
});

test("releaseNotesFor is a pure function of the TEXT it is given, and null for no section", () => {
  expect(releaseNotesFor("0.0.9", { changelog: CHANGELOG })).toEqual({
    notes: "Never shipped.",
    title: "Lore CLI 0.0.9 (tagged, never published)",
  });
  expect(releaseNotesFor("9.9.9", { changelog: CHANGELOG })).toBeNull();
});

// ── The tagged commit's CHANGELOG.md, read at the peeled SHA (LCLI-639) ─────────────────────────

describe("the notes' source is a commit, never a ref that can move (LCLI-639)", () => {
  test("changelogAtRefArgs pins the host, the raw accept header, and the read AT a sha", () => {
    expect(changelogAtRefArgs(COMMIT)).toEqual([
      "api",
      "--hostname",
      "github.com",
      "-H",
      "Accept: application/vnd.github.raw",
      `repos/opum-ai/lore-cli/contents/CHANGELOG.md?ref=${COMMIT}`,
    ]);
  });

  test("readChangelogAtCommit answers gh's bytes with the source it asked for, at the ONE argv", async () => {
    const seen: string[][] = [];
    const read = await readChangelogAtCommit(COMMIT, {
      execFile: async (_file, args, options) => {
        seen.push([...args]);
        // The 8 MiB buffer is check-breaking-bump.mjs's precedent: a raw contents answer is the
        // whole file, and the default 1 MiB would truncate it into a different failure.
        expect(options).toEqual({ maxBuffer: 8 * 1024 * 1024 });
        return { stdout: CHANGELOG };
      },
    });
    expect(read).toEqual({ changelog: CHANGELOG, source: `opum-ai/lore-cli@${COMMIT}:CHANGELOG.md` });
    expect(seen).toEqual([changelogAtRefArgs(COMMIT)]);
  });

  test("every failure comes back as {changelog: null, error}, never thrown", async () => {
    const failed = await readChangelogAtCommit(COMMIT, {
      execFile: async () => {
        throw Object.assign(new Error("exit 1"), { stderr: "HTTP 502: Bad gateway\nmore" });
      },
    });
    expect(failed.changelog).toBeNull();
    expect(failed.error).toBe("HTTP 502: Bad gateway");
    expect(failed.source).toBe(`opum-ai/lore-cli@${COMMIT}:CHANGELOG.md`);
    const empty = await readChangelogAtCommit(COMMIT, { execFile: async () => ({ stdout: "  \n" }) });
    expect({ changelog: empty.changelog, error: empty.error }).toEqual({
      changelog: null,
      error: "gh answered with no changelog text",
    });
  });

  test("a ref that is not a commit sha is refused without a gh call", async () => {
    for (const ref of ["main", "refs/tags/v0.11.0", "deadbeef", "", undefined]) {
      const calls: string[][] = [];
      const read = await readChangelogAtCommit(ref as unknown as string, {
        execFile: async (_file, args) => {
          calls.push([...args]);
          return { stdout: CHANGELOG };
        },
      });
      expect({ ref, changelog: read.changelog, calls: calls.length }).toEqual({ ref, changelog: null, calls: 0 });
      expect(read.error).toContain("is not a commit sha");
    }
  });
});

// ── ensureGitHubRelease, with a stubbed gh ──────────────────────────────────────────────────────

type Answer = { stdout: string } | { throw: { message: string; stderr?: string } };

/**
 * A stub gh. `view` answers as given; create/edit succeed unless `writeFails`. The LCLI-639 reads
 * answer a fixed annotated tag (refs/tags/v<anything> -> TAG_OBJECT -> COMMIT) and the contents of
 * CHANGELOG.md at that commit, unless `tagFails`/`contentsFails` say otherwise. Records every call:
 * `api()` is the three tag/contents reads, `verbs()` every gh verb with each api read as "api".
 */
function gh(
  view: Answer,
  {
    writeFails,
    changelog = CHANGELOG,
    tagFails,
    contentsFails,
  }: { writeFails?: string; changelog?: string; tagFails?: string; contentsFails?: string } = {},
) {
  const calls: string[][] = [];
  const notesSeen: string[] = [];
  const execFile: ExecFile = async (_file, args) => {
    calls.push([...args]);
    if (args[0] === "api") {
      const path = args[args.length - 1] as string;
      const tagged = /\/git\/ref\/tags\/(v.+)$/.exec(path);
      if (tagged) {
        if (tagFails) throw Object.assign(new Error("exit 1"), { stderr: `${tagFails}\n` });
        return {
          stdout: JSON.stringify({ ref: `refs/tags/${tagged[1]}`, object: { type: "tag", sha: TAG_OBJECT } }),
        };
      }
      if (path.includes("/git/tags/"))
        return { stdout: JSON.stringify({ sha: TAG_OBJECT, object: { type: "commit", sha: COMMIT } }) };
      if (path.includes("/contents/CHANGELOG.md")) {
        if (contentsFails) throw Object.assign(new Error("exit 1"), { stderr: `${contentsFails}\n` });
        return { stdout: changelog };
      }
      throw new Error(`unexpected gh api path in test: ${path}`);
    }
    const answer: Answer =
      args[1] === "view"
        ? view
        : writeFails
          ? { throw: { message: "exit 1", stderr: `${writeFails}\n` } }
          : { stdout: "" };
    if (args[1] === "create") notesSeen.push(readFileSync(args[args.indexOf("--notes-file") + 1] as string, "utf8"));
    if ("throw" in answer) throw Object.assign(new Error(answer.throw.message), { stderr: answer.throw.stderr });
    return answer;
  };
  return {
    calls,
    notesSeen,
    execFile,
    api: () => calls.filter((a) => a[0] === "api"),
    verbs: () => calls.map((a) => (a[0] === "api" ? "api" : a[1])),
  };
}

const absent: Answer = { throw: { message: "exit 1", stderr: "release not found\n" } };
const published = (fields: Record<string, unknown> = {}): Answer => ({
  stdout: JSON.stringify({ tagName: "v1.2.3", body: "Notes.\n", isDraft: false, isPrerelease: false, ...fields }),
});
const without = (key: string): Answer => {
  const doc: Record<string, unknown> = { tagName: "v1.2.3", body: "Notes.", isDraft: false, isPrerelease: false };
  delete doc[key];
  return { stdout: JSON.stringify(doc) };
};

/**
 * THE QCLI-401 AC6 VERDICT TABLE: ensureGitHubRelease's {ok, action} and the gh verbs it issued,
 * for every existing-release state, with dryRun true and false (latest: true, the promotion's call).
 * The same inputs, run through quest's module at 93fca842, are compared in LCLI-622's notes.
 */
const TABLE: Array<{
  state: string;
  view: Answer;
  dry: [boolean, string, string[]];
  real: [boolean, string, string[]];
  reason?: string;
}> = [
  {
    state: "release absent",
    view: absent,
    dry: [true, "would-create", ["view"]],
    real: [true, "created", ["view", "create"]],
  },
  {
    state: "exact match",
    view: published(),
    dry: [true, "would-mark-latest", ["view"]],
    real: [true, "marked-latest", ["view", "edit"]],
  },
  {
    state: "CRLF-only difference",
    view: published({ body: "\r\nNotes.\r\n\r\n" }),
    dry: [true, "would-mark-latest", ["view"]],
    real: [true, "marked-latest", ["view", "edit"]],
  },
  {
    state: "draft",
    view: published({ isDraft: true }),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "is a draft",
  },
  {
    state: "prerelease",
    view: published({ isPrerelease: true }),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "is a prerelease",
  },
  {
    state: "draft AND differing notes (state is checked before notes)",
    view: published({ isDraft: true, body: "Hand-edited." }),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "is a draft",
  },
  {
    state: "differing notes",
    view: published({ body: "Hand-edited.\n" }),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "notes differ",
  },
  {
    state: "unparseable output (not JSON)",
    view: { stdout: "not json" },
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: "unparseable output (empty)",
    view: { stdout: "" },
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: "non-object output ([])",
    view: { stdout: "[]" },
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: "non-object output (null)",
    view: { stdout: "null" },
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: 'non-object output ("a string")',
    view: { stdout: '"a string"' },
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: "missing body",
    view: without("body"),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: "non-string body (42)",
    view: published({ body: 42 }),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: "non-string body (null)",
    view: published({ body: null }),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "did not return its state",
  },
  {
    state: "missing isDraft key",
    view: without("isDraft"),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "is a draft",
  },
  {
    state: "missing isPrerelease key",
    view: without("isPrerelease"),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "is a prerelease",
  },
  {
    state: 'isDraft not strictly false ("false")',
    view: published({ isDraft: "false" }),
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "is a draft",
  },
  {
    state: "gh cannot read the repository (not 'release not found')",
    view: { throw: { message: "exit 1", stderr: "error connecting to api.github.com\nmore" } },
    dry: [false, "none", ["view"]],
    real: [false, "none", ["view"]],
    reason: "could not read release v1.2.3: error connecting to api.github.com",
  },
];

describe("ensureGitHubRelease: the QCLI-401 AC6 verdict table (LCLI-622)", () => {
  for (const row of TABLE)
    for (const dryRun of [true, false]) {
      const [ok, action, verbs] = dryRun ? row.dry : row.real;
      test(`${row.state}, dryRun ${dryRun}: ok ${ok}, ${action}, gh ${verbs.join(" + ")}`, async () => {
        const stub = gh(row.view);
        const out = await ensureGitHubRelease({ version: "1.2.3", notes: "Notes.", dryRun, execFile: stub.execFile });
        expect({ ok: out.ok, action: out.action as string, verbs: stub.verbs() }).toEqual({ ok, action, verbs });
        if (row.reason) expect(out.detail).toContain(row.reason);
      });
    }

  test("not-latest (a backfill): an exact match is left as is, an absent release is created --latest=false", async () => {
    const same = gh(published());
    expect(
      await ensureGitHubRelease({ version: "1.2.3", notes: "Notes.", latest: false, execFile: same.execFile }),
    ).toMatchObject({
      ok: true,
      action: "exists",
    });
    expect(same.verbs()).toEqual(["view"]);
    const none = gh(absent);
    await ensureGitHubRelease({ version: "1.2.3", notes: "Notes.", latest: false, execFile: none.execFile });
    expect(none.calls.find((a) => a[1] === "create")).toContain("--latest=false");
    // A refusal does not depend on `latest`: a draft is refused in a backfill too. Same notes, so the
    // draft is the ONLY reason (M4 found an earlier revision passing "N", masked by notes-differ).
    const draft = gh(published({ isDraft: true }));
    const refused = await ensureGitHubRelease({
      version: "1.2.3",
      notes: "Notes.",
      latest: false,
      execFile: draft.execFile,
    });
    expect({ ok: refused.ok, draft: refused.detail.includes("is a draft") }).toEqual({ ok: false, draft: true });
  });
});

describe("ensureGitHubRelease: the calls it makes", () => {
  test("the state is read in ONE view call, host pinned, with all four fields", async () => {
    const stub = gh(published());
    await ensureGitHubRelease({ version: "1.2.3", notes: "Notes.", execFile: stub.execFile });
    expect(stub.calls[0]).toEqual([
      "release",
      "view",
      "v1.2.3",
      "-R",
      REPO,
      "--json",
      "tagName,body,isDraft,isPrerelease",
    ]);
    expect(stub.calls.filter((a) => a[1] === "view")).toHaveLength(1);
  });

  test("create: host pinned, tag verified (never created), titled, notes from a file, marked latest", async () => {
    const stub = gh(absent);
    const out = await ensureGitHubRelease({ version: "1.2.3", notes: "Line one.\n\n- two", execFile: stub.execFile });
    expect(out).toEqual({
      ok: true,
      action: "created",
      detail: 'created release v1.2.3 "Lore CLI 1.2.3", marked latest',
    });
    const create = stub.calls.find((a) => a[1] === "create") as string[];
    const notesFile = create[create.indexOf("--notes-file") + 1] as string;
    expect(create).toEqual([
      "release",
      "create",
      "v1.2.3",
      "-R",
      REPO,
      "--verify-tag",
      "--title",
      "Lore CLI 1.2.3",
      "--notes-file",
      notesFile,
      "--latest=true",
    ]);
    // The notes file held exactly the section plus a newline, and is removed afterwards.
    expect(stub.notesSeen).toEqual(["Line one.\n\n- two\n"]);
    expect(existsSync(notesFile)).toBe(false);
    expect(RELEASE_REPOSITORY).toBe(REPO);
  });

  test("an exact match is marked latest with exactly `gh release edit vX -R <repo> --latest`, nothing else", async () => {
    const stub = gh(published());
    await ensureGitHubRelease({ version: "1.2.3", notes: "Notes.", execFile: stub.execFile });
    expect(stub.calls.find((a) => a[1] === "edit")).toEqual(["release", "edit", "v1.2.3", "-R", REPO, "--latest"]);
  });

  test("a failed create or edit is returned, not thrown, with gh's first line", async () => {
    const create = gh(absent, { writeFails: "HTTP 403: Resource not accessible by integration" });
    const created = await ensureGitHubRelease({ version: "1.2.3", notes: "N", execFile: create.execFile });
    expect(created).toEqual({
      ok: false,
      action: "none",
      detail: "could not create release v1.2.3: HTTP 403: Resource not accessible by integration",
    });
    const edit = gh(published({ body: "N" }), { writeFails: "HTTP 403" });
    const edited = await ensureGitHubRelease({ version: "1.2.3", notes: "N", execFile: edit.execFile });
    expect(edited.ok).toBe(false);
    expect(edited.detail).toBe("release v1.2.3 exists but could not be marked latest: HTTP 403");
  });

  test("'release not found' only in the message (empty stderr) still reads as absent", async () => {
    const stub = gh({ throw: { message: "release not found" } });
    expect(await ensureGitHubRelease({ version: "1.2.3", notes: "N", execFile: stub.execFile })).toMatchObject({
      ok: true,
      action: "created",
    });
  });
});

describe("scripts/github-release.mjs as the repair command", () => {
  test("without --create it only reads; with it, it cuts; each returns its exit code", async () => {
    const out: string[] = [];
    const dry = gh(absent);
    expect(await main(["--version", "0.10.0"], { execFile: dry.execFile, out: (l) => out.push(l) })).toBe(0);
    expect(dry.verbs()).toEqual(["api", "api", "api", "view"]);
    expect(out).toEqual(['would create release v0.10.0 "Lore CLI 0.10.0" (4 bytes of notes), marked latest']);
    const real = gh(absent);
    expect(await main(["--version", "0.10.0", "--create"], { execFile: real.execFile, out: () => {} })).toBe(0);
    expect(real.verbs()).toEqual(["api", "api", "api", "view", "create"]);
    const backfill = gh(absent);
    expect(
      await main(["--version", "0.10.0", "--create", "--not-latest"], { execFile: backfill.execFile, out: () => {} }),
    ).toBe(0);
    expect(backfill.calls.find((a) => a[1] === "create")).toContain("--latest=false");
  });

  test("the tag is resolved FIRST, and the notes are read AT the commit it peels to (LCLI-639)", async () => {
    const stub = gh(absent);
    expect(await main(["--version", "0.10.0", "--create"], { execFile: stub.execFile, out: () => {} })).toBe(0);
    expect(stub.api()).toEqual([tagRefArgs("0.10.0"), tagObjectArgs, changelogAtRefArgs(COMMIT)]);
    expect(stub.api()[2]?.at(-1)).toContain(COMMIT);
  });

  test("a tag that does not resolve refuses before the contents read, and never writes", async () => {
    const err: string[] = [];
    const stub = gh(absent, { tagFails: "gh: Not Found (HTTP 404)" });
    expect(await main(["--version", "0.10.0", "--create"], { execFile: stub.execFile, err: (l) => err.push(l) })).toBe(
      1,
    );
    expect(stub.api()).toEqual([tagRefArgs("0.10.0")]);
    expect(stub.calls.filter((a) => a[0] === "release")).toEqual([]);
    expect(err.at(-1)).toContain("refusing to cut a release for 0.10.0");
    expect(err.at(-1)).toContain("refs/tags/v0.10.0 could not be read");
    expect(err.at(-1)).toContain("It never creates a tag");
  });

  test("no section at the tagged commit, a refused state, or a failed cut exits 1; bad arguments exit 2", async () => {
    const err: string[] = [];
    const quiet = { out: () => {}, err: (l: string) => err.push(l) };
    const none = gh(absent);
    expect(await main(["--version", "9.9.9", "--create"], { ...quiet, execFile: none.execFile })).toBe(1);
    // The bytes were READ, at the tagged commit, and the refusal names them: the section is absent
    // there, and no edit to this checkout could add it (the tag is immutable).
    expect(none.api()).toEqual([tagRefArgs("9.9.9"), tagObjectArgs, changelogAtRefArgs(COMMIT)]);
    expect(none.calls.filter((a) => a[0] === "release")).toEqual([]);
    expect(err.at(-1)).toContain(`CHANGELOG.md at v9.9.9's commit ${COMMIT} has no non-empty "## [9.9.9]" section`);
    expect(err.at(-1)).toContain("no edit to this checkout can add the section");
    expect(err.at(-1)).toContain("re-tag v9.9.9 at a commit whose CHANGELOG.md carries it");
    // A contents read that failed refuses too, naming the commit it could not read.
    const unreadable = gh(absent, { contentsFails: "HTTP 502: Bad gateway" });
    expect(await main(["--version", "0.10.0", "--create"], { ...quiet, execFile: unreadable.execFile })).toBe(1);
    expect(err.at(-1)).toContain(
      `CHANGELOG.md could not be read at v0.10.0's commit ${COMMIT} (HTTP 502: Bad gateway)`,
    );
    expect(await main(["--version", "0.10.0"], { ...quiet, execFile: gh(published({ isDraft: true })).execFile })).toBe(
      1,
    );
    expect(
      await main(["--version", "0.10.0", "--create"], {
        ...quiet,
        execFile: gh(absent, { writeFails: "HTTP 403" }).execFile,
      }),
    ).toBe(1);
    for (const argv of [[], ["--version"], ["--version", "v0.10.0"], ["--version", "0.10.0", "--force"]])
      expect({ argv, code: await main(argv, { ...quiet, execFile: gh(absent).execFile }) }).toEqual({
        argv,
        code: 2,
      });
  });

  test("bad arguments refuse before the tag is read: no gh call at all", async () => {
    const stub = gh(absent);
    expect(await main(["--version", "v0.10.0"], { execFile: stub.execFile, out: () => {}, err: () => {} })).toBe(2);
    expect(stub.calls).toEqual([]);
  });

  test("the repair command promote-latest prints is this file's --create", () => {
    expect(REPAIR_COMMAND("1.2.3")).toBe("node scripts/github-release.mjs --version 1.2.3 --create");
  });

  test("run as a process: bad arguments exit 2 with the usage line", () => {
    const r = Bun.spawnSync({ cmd: ["node", join(import.meta.dir, "..", "scripts", "github-release.mjs")] });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("usage: node scripts/github-release.mjs --version <x.y.z>");
  });
});
