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
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  changelogSection,
  type ExecFile,
  ensureGitHubRelease,
  main,
  RELEASE_REPOSITORY,
  REPAIR_COMMAND,
  releaseNotesFor,
  releaseTitle,
} from "../scripts/github-release.mjs";

const REPO = "github.com/opum-ai/lore-cli";

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

test("releaseNotesFor reads the file it is given, and returns null for no section", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "lore-ghrel-"));
  try {
    const changelogPath = join(dir, "CHANGELOG.md");
    writeFileSync(changelogPath, CHANGELOG);
    expect(await releaseNotesFor("0.0.9", { changelogPath })).toEqual({
      notes: "Never shipped.",
      title: "Lore CLI 0.0.9 (tagged, never published)",
    });
    expect(await releaseNotesFor("9.9.9", { changelogPath })).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── ensureGitHubRelease, with a stubbed gh ──────────────────────────────────────────────────────

type Answer = { stdout: string } | { throw: { message: string; stderr?: string } };

/** A stub gh: `view` answers as given; create/edit succeed unless `writeFails`. Records every call. */
function gh(view: Answer, { writeFails }: { writeFails?: string } = {}) {
  const calls: string[][] = [];
  const notesSeen: string[] = [];
  const execFile: ExecFile = async (_file, args) => {
    calls.push([...args]);
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
  return { calls, notesSeen, execFile, verbs: () => calls.map((a) => a[1]) };
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
    // A refusal does not depend on `latest`: a draft is refused in a backfill too.
    const draft = gh(published({ isDraft: true }));
    expect(
      (await ensureGitHubRelease({ version: "1.2.3", notes: "N", latest: false, execFile: draft.execFile })).ok,
    ).toBe(false);
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
  const withChangelog = async (fn: (changelogPath: string) => Promise<void>) => {
    const dir = mkdtempSync(resolve(tmpdir(), "lore-ghrel-cli-"));
    try {
      const changelogPath = join(dir, "CHANGELOG.md");
      writeFileSync(changelogPath, CHANGELOG);
      await fn(changelogPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test("without --create it only reads; with it, it cuts; each returns its exit code", async () => {
    await withChangelog(async (changelogPath) => {
      const out: string[] = [];
      const dry = gh(absent);
      expect(
        await main(["--version", "0.10.0"], { execFile: dry.execFile, changelogPath, out: (l) => out.push(l) }),
      ).toBe(0);
      expect(dry.verbs()).toEqual(["view"]);
      expect(out).toEqual(['would create release v0.10.0 "Lore CLI 0.10.0" (4 bytes of notes), marked latest']);
      const real = gh(absent);
      expect(
        await main(["--version", "0.10.0", "--create"], { execFile: real.execFile, changelogPath, out: () => {} }),
      ).toBe(0);
      expect(real.verbs()).toEqual(["view", "create"]);
      const backfill = gh(absent);
      expect(
        await main(["--version", "0.10.0", "--create", "--not-latest"], {
          execFile: backfill.execFile,
          changelogPath,
          out: () => {},
        }),
      ).toBe(0);
      expect(backfill.calls.find((a) => a[1] === "create")).toContain("--latest=false");
    });
  });

  test("no section, a refused state, or a failed cut exits 1; bad arguments exit 2", async () => {
    await withChangelog(async (changelogPath) => {
      const err: string[] = [];
      const quiet = { changelogPath, out: () => {}, err: (l: string) => err.push(l) };
      const none = gh(absent);
      expect(await main(["--version", "9.9.9", "--create"], { ...quiet, execFile: none.execFile })).toBe(1);
      expect(none.calls).toEqual([]);
      expect(err.at(-1)).toContain('no non-empty "## [9.9.9]" section');
      expect(
        await main(["--version", "0.10.0"], { ...quiet, execFile: gh(published({ isDraft: true })).execFile }),
      ).toBe(1);
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
