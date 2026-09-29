/**
 * lcli639-release-notes-from-tagged-commit.test.ts — the release notes are CHANGELOG.md's bytes AT
 * THE COMMIT v<version> PEELS TO, never the operator's working tree (LCLI-639, the rule agreed
 * with quest-cli as QCLI-407: one rule, both repositories, no divergence).
 *
 * The defect: scripts/github-release.mjs releaseNotesFor read `join(root, "CHANGELOG.md")` from the
 * checkout scripts/promote-latest.mjs ran in, so an uncommitted edit, or a section edited after the
 * tag, became the body of a NEW vX release. An existing release was never at risk -- differing
 * notes are refused, not edited -- which is why this needed a test rather than a hotfix.
 *
 * THE FIXTURE IS A CHECKOUT, NOT A MOCK. A tmpdir holds the scripts (copied from scripts/, so the
 * module's own `root` is that tmpdir), and the tmpdir's CHANGELOG.md carries an edit that is NOT in
 * the tagged commit. The stub gh answers the raw-contents read at the peeled SHA with the COMMITTED
 * bytes, so the two sources genuinely disagree and every assertion below can tell which one won.
 * The same tmpdir is then run against the PRE-CHANGE module (vendored in
 * test/fixtures/lcli639/github-release.pre-change.mjs) and against promote-latest.mjs mutated back
 * to the defect's shape, which must BOTH let the working-tree edit through: a fixture that cannot
 * reproduce the defect cannot vouch for the test that catches it.
 *
 * Both call sites are covered end to end, because the defect had two: the promote path (step 9's
 * preflight and step 13's cut: dry run and --promote) and the repair tool main() in
 * scripts/github-release.mjs. Every gh/npm call is answered by one in-process runner, so nothing
 * here reaches a network, and the module run is a copy on disk rather than an import of the live
 * one -- the point of the fixture is that the module reads the checkout it lives in.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { changelogAtRefArgs, changelogSection } from "../scripts/github-release.mjs";
import {
  expectedTarballNames,
  PAIR_RECEIPT_KIND,
  PLATFORMS,
  RELEASE_PACKAGES,
  tarballName,
} from "../scripts/pair-receipt.mjs";

const SCRIPTS = resolve(import.meta.dir, "..", "scripts");
/** The pre-change module, vendored: `git show fee53bc6:scripts/github-release.mjs` (= 0305ca90^). */
const PRE_CHANGE = resolve(import.meta.dir, "fixtures", "lcli639", "github-release.pre-change.mjs");
/** The original file's first line, which starts the body below the provenance header. */
const PRE_CHANGE_FIRST_LINE =
  "// Cuts lore's GitHub Release for a version tag, its body taken from that version's CHANGELOG.md";
const PRE_CHANGE_BLOB = "6dde69ea5a2ea92ce42c91f4981d00dccab8eeb2";

const V = "5.6.7";
const RC = "5.6.7-rc.2";
const PRIOR = "5.6.6";
const RUN = "4242";
const COMMIT = "a".repeat(40);
const TAG_OBJECT = "9".repeat(40);
const ROOT_TREE = "b".repeat(40);
const SKILLS_TREE = "c".repeat(40);
const LAUNCHER = "@opum-ai/lore";
const RC_FILE = `opum-ai-lore-${RC}.tgz`;
const X_FILE = `opum-ai-lore-${V}.tgz`;

/** The marker: present in the working tree's CHANGELOG.md, absent from the tagged commit's. */
const WORKING_TREE_MARKER = "WORKING TREE EDIT: never committed, never tagged";
const WORKING_TREE_NOTE = `- **${WORKING_TREE_MARKER}** (LCLI-639).`;
const COMMITTED_NOTE = "- **Committed and tagged** (LCLI-639): the bytes v5.6.7 peels to.";

const changelog = (note: string) =>
  [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "- Not released yet.",
    "",
    `## [${V}] - 2026-09-28`,
    "",
    note,
    "",
    `## [${PRIOR}] - 2026-09-01`,
    "",
    "- The prior release.",
  ].join("\n");

const COMMITTED_CHANGELOG = changelog(COMMITTED_NOTE);
const WORKING_TREE_CHANGELOG = changelog(WORKING_TREE_NOTE);
/** The section each source would yield, as releaseNotesFor would return it. */
const committedNotes = () => changelogSection(COMMITTED_CHANGELOG, V)?.body ?? "";
const workingTreeNotes = () => changelogSection(WORKING_TREE_CHANGELOG, V)?.body ?? "";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sri = (bytes: Uint8Array) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const integrity = (name: string) => `sha512-${Buffer.from(name).toString("base64")}==`;

// ── The artifact's eight tarballs, as real gzipped ustar archives (readArtifact runs the real
// launcher-equivalence gate over the two launchers, so stand-in bytes would only test the fixture).
function tarball(entries: Array<{ path: string; content: string; mode?: number }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content, "utf8");
    const header = Buffer.alloc(512);
    const put = (text: string, offset: number, length: number) => header.write(text, offset, length, "utf8");
    const num = (n: number, offset: number, length: number) =>
      put(`${n.toString(8).padStart(length - 1, "0")}\0`, offset, length);
    put(entry.path, 0, 100);
    num(entry.mode ?? 0o644, 100, 8);
    num(0, 108, 8);
    num(0, 116, 8);
    num(content.length, 124, 12);
    num(499162500, 136, 12);
    header.fill(32, 148, 156);
    put("0", 156, 1);
    put("ustar\0", 257, 6);
    put("00", 263, 2);
    let sum = 0;
    for (const byte of header) sum += byte;
    put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
    blocks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

/** The root launcher: the same entries at X-rc.N and at X, differing only by the version string. */
function launcher(version: string): Buffer {
  const manifest = `${JSON.stringify(
    {
      name: LAUNCHER,
      version,
      optionalDependencies: Object.fromEntries(PLATFORMS.map((p) => [`@opum-ai/lore-${p}`, V])),
      bin: { lore: "bin/lore.cjs" },
    },
    null,
    2,
  )}\n`;
  return tarball([
    { path: "package/LICENSE", content: "MIT\n" },
    { path: "package/bin/lore.cjs", content: "#!/usr/bin/env node\n", mode: 0o755 },
    { path: "package/package.json", content: manifest },
    { path: "package/README.md", content: `# lore\n\n> **Status: ${version} released.** Tag \`v${version}\`\n` },
  ]);
}

/** The Release run's npm-packages artifact: the six platforms at X, and both launchers. */
function artifact(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const p of PLATFORMS) files.set(`opum-ai-lore-${p}-${V}.tgz`, Buffer.from(`platform ${p} ${V}\n`));
  files.set(RC_FILE, launcher(RC));
  files.set(X_FILE, launcher(V));
  return files;
}

const artifactFiles = artifact();

const pass1Receipt = () => ({
  schemaVersion: 1,
  kind: "opum.qualification-receipt.v1",
  product: "lore",
  version: V,
  commit: COMMIT,
  releaseRunId: Number(RUN),
  tarballs: Object.fromEntries(
    expectedTarballNames(V, RC).map((name) => [name, sha256(artifactFiles.get(name) as Buffer)]),
  ),
  launcherVersion: RC,
  launcherSubstitution: {
    verdict: "MATCH",
    finalTarball: { filename: X_FILE, sha256: sha256(artifactFiles.get(X_FILE) as Buffer) },
    method: "entry by entry, X-rc.N -> X",
    mismatches: [],
  },
  verdict: "QUALIFIED",
});

const pairReceipt = () => ({
  schemaVersion: 1,
  kind: PAIR_RECEIPT_KIND,
  pair: {
    lore: {
      version: V,
      commit: COMMIT,
      launcherVersion: RC,
      tarballs: Object.fromEntries(
        expectedTarballNames(V, RC).map((n) => [n, { sha256: "c".repeat(64), distIntegrity: integrity(n) }]),
      ),
    },
    quest: { version: V, commit: "b".repeat(40), launcherVersion: RC, tarballs: {} },
  },
  installedFrom: { lore: { source: "registry" }, quest: { source: "registry" } },
  verdict: "QUALIFIED",
});

type Run = (
  command: string,
  args: string[],
  options?: Record<string, unknown>,
) => Promise<{ stdout: string; stderr?: string }>;

/**
 * One in-memory GitHub and npm behind a single runner: the tag v<V> (annotated), the COMMITTED
 * CHANGELOG at the commit it peels to, the Release run and its artifact, both receipts, the
 * registry, and a v<V> release that does not exist yet. `notesSeen` is every notes file
 * `gh release create` was handed, read while it ran.
 */
function world({
  changelogAtCommit = COMMITTED_CHANGELOG,
}: {
  /** The bytes the raw-contents read answers, or "fail" for a gh that cannot read them at all. */
  changelogAtCommit?: string | "fail";
} = {}) {
  const tags: Record<string, Record<string, string>> = {};
  for (const name of RELEASE_PACKAGES) tags[name] = { latest: PRIOR, "release-candidate": name === LAUNCHER ? RC : V };
  const calls: string[][] = [];
  const writes: string[] = [];
  const notesSeen: string[] = [];
  const state: { xPublished: Buffer | null } = { xPublished: null };
  // The runner's third argument (cwd/env for the read-back) is accepted and ignored: this world
  // never reads an environment, so nothing here can depend on one.
  const run: Run = async (command, args, _options = {}) => {
    calls.push([command, ...args]);
    const line = [command, ...args].join(" ");
    if (command === "security") throw Object.assign(new Error("no keychain item"), { code: 44 });
    if (command === "gh" && args[0] === "api") {
      const path = args[args.length - 1] as string;
      if (path === `repos/opum-ai/lore-cli/git/ref/tags/v${V}`)
        return { stdout: JSON.stringify({ ref: `refs/tags/v${V}`, object: { type: "tag", sha: TAG_OBJECT } }) };
      if (path === `repos/opum-ai/lore-cli/git/tags/${TAG_OBJECT}`)
        return { stdout: JSON.stringify({ sha: TAG_OBJECT, object: { type: "commit", sha: COMMIT } }) };
      if (line === `gh ${changelogAtRefArgs(COMMIT).join(" ")}`) {
        if (changelogAtCommit === "fail")
          throw Object.assign(new Error("Command failed: gh api"), { stderr: "HTTP 502: Bad gateway\n" });
        return { stdout: changelogAtCommit };
      }
      // The two receipts, read by ref from opum-cli-e2e (`?ref=main` on the contents path).
      if (path.includes("/opum-cli-e2e/contents/receipts/pair/")) return { stdout: JSON.stringify(pairReceipt()) };
      if (path.includes("/opum-cli-e2e/contents/receipts/lore/")) return { stdout: JSON.stringify(pass1Receipt()) };
      if (path === `repos/opum-ai/lore-cli/actions/runs/${RUN}`)
        return {
          stdout: JSON.stringify({
            id: Number(RUN),
            path: ".github/workflows/release.yml",
            head_sha: COMMIT,
            conclusion: "success",
            event: "workflow_dispatch",
            head_repository: { full_name: "opum-ai/lore-cli" },
          }),
        };
      if (path === `repos/opum-ai/lore-cli/git/commits/${COMMIT}`)
        return { stdout: JSON.stringify({ sha: COMMIT, tree: { sha: ROOT_TREE } }) };
      if (path === `repos/opum-ai/lore-cli/git/trees/${ROOT_TREE}`)
        return {
          stdout: JSON.stringify({ sha: ROOT_TREE, tree: [{ path: "skills", type: "tree", sha: SKILLS_TREE }] }),
        };
      throw new Error(`unexpected gh api path in test: ${path}`);
    }
    if (command === "gh" && args[0] === "run" && args[1] === "download") {
      const into = args[args.length - 1] as string;
      for (const [name, bytes] of artifactFiles) writeFileSync(join(into, name), bytes);
      return { stdout: "" };
    }
    if (command === "gh" && args[0] === "release" && args[1] === "view")
      throw Object.assign(new Error("Command failed: gh release view"), { stderr: "release not found\n" });
    if (command === "gh" && args[0] === "release" && args[1] === "create") {
      notesSeen.push(readFileSync(args[args.indexOf("--notes-file") + 1] as string, "utf8"));
      return { stdout: "" };
    }
    if (command === "npm" && args[0] === "view" && args[2] === "dist-tags") {
      if (args[1] === "@opum-ai/quest") return { stdout: JSON.stringify([{ latest: V, "release-candidate": V }]) };
      return { stdout: JSON.stringify([tags[args[1] as string]]) };
    }
    if (command === "npm" && args[0] === "view" && args[2] === "--json") {
      const spec = args[1] as string;
      const at = spec.lastIndexOf("@");
      const [name, version] = [spec.slice(0, at), spec.slice(at + 1)];
      if (name === LAUNCHER && version !== RC) {
        if (state.xPublished === null)
          throw Object.assign(new Error("Command failed: npm view"), {
            stderr: `npm error code E404\nnpm error 404 No match found for version ${V}`,
            stdout: JSON.stringify({ error: { code: "E404" } }),
          });
        return { stdout: JSON.stringify([{ name, version, dist: { integrity: sri(state.xPublished) } }]) };
      }
      return {
        stdout: JSON.stringify([{ name, version, dist: { integrity: integrity(tarballName(name, version)) } }]),
      };
    }
    if (command === "npm" && args[0] === "pack") {
      const into = args[3] as string;
      writeFileSync(join(into, RC_FILE), artifactFiles.get(RC_FILE) as Buffer);
      return { stdout: JSON.stringify({ [LAUNCHER]: { id: `${LAUNCHER}@${RC}`, filename: RC_FILE } }) };
    }
    if (command === "npm" && args[0] === "publish") {
      state.xPublished = readFileSync(args[1] as string);
      (tags[LAUNCHER] as Record<string, string>).latest = V;
      writes.push("publish");
      return { stdout: `+ ${LAUNCHER}@${V}` };
    }
    if (command === "npm" && args[0] === "dist-tag" && args[1] === "add") {
      const spec = args[2] as string;
      const at = spec.lastIndexOf("@");
      (tags[spec.slice(0, at)] as Record<string, string>)[args[3] as string] = spec.slice(at + 1);
      writes.push(`dist-tag add ${spec} ${args[3]}`);
      return { stdout: "" };
    }
    if (command === "bash" && args[0]?.endsWith("readme-readback.sh"))
      return { stdout: "A4 VERDICT: PASSED (LCLI-639 stand-in; the real script has its own suite)\n", stderr: "" };
    throw new Error(`unexpected command in test: ${line}`);
  };
  return { run, calls, writes, notesSeen, tags, state };
}

type World = ReturnType<typeof world>;

// ── The fixture: a tmpdir checkout whose CHANGELOG.md is the WORKING TREE's, plus copied scripts ──

const CHECKOUT_SCRIPTS = [
  "github-release.mjs",
  "promote-latest.mjs",
  "pair-receipt.mjs",
  "is-main.mjs",
  "launcher-equivalence.mjs",
];

/** The two files this test is about, and how the promote path's step-9 read is put back to the
 * defect's shape. The anchor is the FIXED line: if a later edit moves it, the replacement silently
 * does nothing, the mutant behaves like the fix, and the control below fails rather than passing. */
const DEFECT_ANCHOR = "      const changelogRead = await readChangelogAtCommit(peeled.commit, { execFile });";
const DEFECT_SHAPE = [
  "      // THE PRE-CHANGE SHAPE (LCLI-639's defect), restored for the control: the notes read from",
  "      // the checkout this script runs in, so a working-tree edit becomes the release body.",
  "      const changelogRead = {",
  '        source: join(root, "CHANGELOG.md"),',
  '        changelog: await readFile(join(root, "CHANGELOG.md"), "utf8").catch(() => null),',
  "      };",
].join("\n");

/**
 * A tmpdir checkout: `scripts/` holds the real scripts (promote-latest.mjs optionally mutated back
 * to the defect's shape, github-release.mjs optionally the vendored pre-change module), and the
 * root's CHANGELOG.md is the WORKING TREE's -- the edit no tag ever carried.
 */
function checkout({
  githubRelease = "current",
  mutate = false,
}: {
  githubRelease?: "current" | "pre-change";
  mutate?: boolean;
} = {}) {
  const dir = mkdtempSync(resolve(tmpdir(), "lcli639-"));
  mkdirSync(join(dir, "scripts"));
  for (const name of CHECKOUT_SCRIPTS) writeFileSync(join(dir, "scripts", name), readFileSync(join(SCRIPTS, name)));
  if (mutate) {
    const path = join(dir, "scripts", "promote-latest.mjs");
    const source = readFileSync(path, "utf8");
    expect(source).toContain(DEFECT_ANCHOR);
    writeFileSync(path, source.replace(DEFECT_ANCHOR, DEFECT_SHAPE));
  }
  if (githubRelease === "pre-change")
    writeFileSync(join(dir, "scripts", "github-release.mjs"), readFileSync(PRE_CHANGE));
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "@opum-ai/lore", version: V }, null, 2)}\n`);
  writeFileSync(join(dir, "CHANGELOG.md"), WORKING_TREE_CHANGELOG);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const load = async (dir: string, name: string) => import(pathToFileURL(join(dir, "scripts", name)).href);

/** main() of the module in the tmpdir checkout, with the world's runner and captured output. */
async function promote(
  dir: string,
  argv: string[],
  w: World,
  { recordPath }: { recordPath: string },
): Promise<{ code: number; out: string[]; err: string[]; text: string }> {
  const { main } = await load(dir, "promote-latest.mjs");
  const out: string[] = [];
  const err: string[] = [];
  const code = await main([...argv, "--record", recordPath, "--release-run", RUN], {
    run: w.run,
    env: { NPM_TOKEN: "" },
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    readPackageVersion: async () => V,
    verifyOptions: { attempts: 1, delayMs: 0, sleep: async () => {} },
  });
  return { code, out, err, text: [...out, ...err].join("\n") };
}

async function repair(
  dir: string,
  w: World,
  argv: string[] = ["--version", V, "--create"],
): Promise<{ code: number; out: string[]; err: string[] }> {
  const { main } = await load(dir, "github-release.mjs");
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    execFile: (file: string, args: readonly string[], options?: { maxBuffer?: number }) =>
      w.run(file, [...args], options),
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  });
  return { code, out, err };
}

/** The one gh call the notes may come from: the raw-contents read at the peeled commit. */
const contentsReads = (w: World) =>
  w.calls.filter((c) => c[0] === "gh" && c[1] === "api" && String(c.at(-1)).includes("/contents/CHANGELOG.md"));

/**
 * THE ARGV THE NOTES MUST BE READ WITH, WRITTEN OUT (review F1). It is deliberately NOT derived
 * from `changelogAtRefArgs`: the world's stub matches that builder, so an assertion built from it
 * too would move with the builder and stay green -- a builder pointed at `?ref=main` would pass
 * every test in this file while the notes came from a movable ref. Measured: with the builder
 * pointed at `main`, this literal reddens the assertion below and the builder-derived form it
 * replaced did not.
 */
const CONTENTS_ARGV = [
  "gh",
  "api",
  "--hostname",
  "github.com",
  "-H",
  "Accept: application/vnd.github.raw",
  `repos/opum-ai/lore-cli/contents/CHANGELOG.md?ref=${COMMIT}`,
];

describe("LCLI-639: the promote path reads the notes at the tagged commit, never the working tree", () => {
  const record = (dir: string) => join(dir, "promotion-record.json");

  test("--dry-run: the notes it plans to cut are the tagged commit's, byte length and all", async () => {
    const c = checkout();
    const w = world();
    try {
      const r = await promote(c.dir, ["--dry-run"], w, { recordPath: record(c.dir) });
      expect(r.code).toBe(0);
      // The two sources must actually disagree, or this proves nothing: the counts differ.
      expect(Buffer.byteLength(committedNotes())).not.toBe(Buffer.byteLength(workingTreeNotes()));
      expect(r.text).toContain(
        `would create release v${V} "Lore CLI ${V}" (${Buffer.byteLength(committedNotes())} bytes of notes), marked latest`,
      );
      expect(r.text).not.toContain(workingTreeNotes());
      expect(contentsReads(w)).toEqual([CONTENTS_ARGV]);
      // The run the world served is the one the module asked for (its reader matches the exact
      // path), so a run id this test had merely chosen would have thrown instead of passing here.
      expect(w.calls.some((c) => c.at(-1) === `repos/opum-ai/lore-cli/actions/runs/${RUN}`)).toBe(true);
    } finally {
      c.cleanup();
    }
  });

  test("--promote: the cut's notes file holds the tagged commit's section, not the edited file's", async () => {
    const c = checkout();
    const w = world();
    try {
      const r = await promote(c.dir, ["--promote"], w, { recordPath: record(c.dir) });
      expect(r.code).toBe(0);
      // Exactly one create, and this is what it wrote.
      expect(w.notesSeen).toEqual([`${committedNotes()}\n`]);
      expect(w.notesSeen[0]).not.toContain(WORKING_TREE_MARKER);
      expect(w.notesSeen[0]).toContain("Committed and tagged");
      // The working-tree file was there, and divergent -- the positive control for the two above.
      expect(readFileSync(join(c.dir, "CHANGELOG.md"), "utf8")).toContain(WORKING_TREE_MARKER);
      expect(w.writes.filter((line) => line === "publish")).toHaveLength(1);
      // EXACTLY ONE contents read per --promote run (review F3): step 13 reuses step 9's capture,
      // and a second read would be invisible to a deterministic stub that serves the same sha.
      expect(contentsReads(w)).toEqual([CONTENTS_ARGV]);
    } finally {
      c.cleanup();
    }
  });

  // REVIEW F2: the state that was missing. Every other test in this file hands the module a
  // SUCCESSFUL contents read, so a regression that fell back to `join(root, "CHANGELOG.md")` when
  // the read FAILED -- gh 502 plus an uncommitted section, which is precisely the defect LCLI-639
  // is about -- would cut a release from the working tree and keep all of them green.
  test("a FAILED contents read refuses, and never falls back to this checkout's CHANGELOG.md", async () => {
    const c = checkout();
    const w = world({ changelogAtCommit: "fail" });
    try {
      // The fallback's bait: a real, non-empty section sits in the checkout the module runs in.
      expect(readFileSync(join(c.dir, "CHANGELOG.md"), "utf8")).toContain(WORKING_TREE_NOTE);
      for (const mode of ["--dry-run", "--promote"] as const) {
        const r = await promote(c.dir, [mode], w, { recordPath: record(c.dir) });
        expect({ mode, code: r.code }).toEqual({ mode, code: 1 });
        expect(r.text).toContain(
          `Refusing to promote ${V}: opum-ai/lore-cli@${COMMIT}:CHANGELOG.md could not be read (HTTP 502: Bad gateway)`,
        );
        expect(r.text).toContain("Nothing has moved.");
      }
      // No release was cut (the fallback would have cut one), nothing moved, and no notes file was
      // ever written.
      expect(w.notesSeen).toEqual([]);
      expect(w.calls.filter((a) => a[0] === "gh" && a[1] === "release")).toEqual([]);
      expect(w.writes).toEqual([]);
    } finally {
      c.cleanup();
    }
  });

  test("and with the local CHANGELOG.md unreadable, the refusal still names the remote source", async () => {
    const c = checkout();
    const w = world({ changelogAtCommit: "fail" });
    try {
      // A DIRECTORY where the file was: any read of `join(root, "CHANGELOG.md")` now fails with
      // EISDIR (on every platform), so an implementation that touched it -- fallback, probe, or
      // anything else -- could not produce this refusal's words.
      rmSync(join(c.dir, "CHANGELOG.md"));
      mkdirSync(join(c.dir, "CHANGELOG.md"));
      const r = await promote(c.dir, ["--promote"], w, { recordPath: record(c.dir) });
      expect(r.code).toBe(1);
      expect(r.text).toContain(`opum-ai/lore-cli@${COMMIT}:CHANGELOG.md could not be read (HTTP 502: Bad gateway)`);
      expect(r.text).not.toContain("EISDIR");
      expect(r.text).not.toContain(c.dir);
      expect(w.notesSeen).toEqual([]);
    } finally {
      c.cleanup();
    }
  });

  test("(control) the same fixture against the pre-change promote shape DOES cut the working-tree edit", async () => {
    const c = checkout({ mutate: true });
    const w = world();
    try {
      const dry = await promote(c.dir, ["--dry-run"], w, { recordPath: record(c.dir) });
      expect(dry.code).toBe(0);
      expect(dry.text).toContain(
        `would create release v${V} "Lore CLI ${V}" (${Buffer.byteLength(workingTreeNotes())} bytes of notes), marked latest`,
      );
      const cut = await promote(c.dir, ["--promote"], w, { recordPath: record(c.dir) });
      expect(cut.code).toBe(0);
      expect(w.notesSeen).toEqual([`${workingTreeNotes()}\n`]);
      expect(w.notesSeen[0]).toContain(WORKING_TREE_MARKER);
      // It never asked for the tagged commit's bytes at all.
      expect(contentsReads(w)).toEqual([]);
    } finally {
      c.cleanup();
    }
  });
});

describe("LCLI-639: the repair tool reads the notes at the tagged commit too", () => {
  test("--create: the tag is resolved first, and the cut carries the tagged commit's bytes", async () => {
    const c = checkout();
    const w = world();
    try {
      const r = await repair(c.dir, w);
      expect(r.code).toBe(0);
      expect(w.notesSeen).toEqual([`${committedNotes()}\n`]);
      expect(w.notesSeen[0]).not.toContain(WORKING_TREE_MARKER);
      // The order: the tag ref, then the tag object it names, then the contents AT that commit --
      // every one of them before the write.
      expect(w.calls.slice(0, 3)).toEqual([
        ["gh", "api", "--hostname", "github.com", `repos/opum-ai/lore-cli/git/ref/tags/v${V}`],
        ["gh", "api", "--hostname", "github.com", `repos/opum-ai/lore-cli/git/tags/${TAG_OBJECT}`],
        CONTENTS_ARGV,
      ]);
      expect(w.calls.filter((a) => a[0] === "gh" && a[1] === "release").map((a) => a[2])).toEqual(["view", "create"]);
    } finally {
      c.cleanup();
    }
  });

  test("a tag whose commit carries no section refuses naming that commit, and writes nothing", async () => {
    const c = checkout();
    const w = world({ changelogAtCommit: COMMITTED_CHANGELOG.replace(`## [${V}] - 2026-09-28`, `## [${PRIOR}] - x`) });
    try {
      const r = await repair(c.dir, w);
      expect(r.code).toBe(1);
      expect(r.err.at(-1)).toContain(`CHANGELOG.md at v${V}'s commit ${COMMIT} has no non-empty "## [${V}]" section`);
      expect(r.err.at(-1)).toContain("no edit to this checkout can add the section");
      expect(w.calls.filter((a) => a[1] === "release")).toEqual([]);
      expect(w.notesSeen).toEqual([]);
    } finally {
      c.cleanup();
    }
  });

  test("(control) the same fixture against the PRE-CHANGE module DOES cut the working-tree edit", async () => {
    const c = checkout({ githubRelease: "pre-change" });
    const w = world();
    try {
      const r = await repair(c.dir, w);
      expect(r.code).toBe(0);
      expect(w.notesSeen).toEqual([`${workingTreeNotes()}\n`]);
      expect(w.notesSeen[0]).toContain(WORKING_TREE_MARKER);
      // No tag read and no contents read: the pre-change module had no idea a commit existed.
      expect(contentsReads(w)).toEqual([]);
      expect(w.calls.filter((a) => String(a.at(-1)).includes("/git/ref/tags/"))).toEqual([]);
      // The control is a control: the pre-change module is not the module under test.
      const vendored = readFileSync(PRE_CHANGE, "utf8");
      expect(vendored).toContain("changelogPath");
      expect(vendored).not.toContain("readChangelogAtCommit");
      expect(readFileSync(join(SCRIPTS, "github-release.mjs"), "utf8")).not.toContain("changelogPath");
    } finally {
      c.cleanup();
    }
  });
});

// REVIEW F5. The runbook now names the command, so the command has to be pinned from both ends:
// the DOC against a literal written here, and the MODULE against that same literal. Neither half
// borrows from the other, which is what keeps a doc drift and a builder drift separately visible --
// and the builder half is why this is not the F1 weakness again (the doc literal below is
// hand-written, and every word of the argv, header included, is compared).
describe("LCLI-639: the runbook's command is the argv the module sends", () => {
  /** A sample peeled sha, only ever substituted into the two literals below. */
  const SAMPLE = "1f2e3d4c5b6a79887766554433221100ffeeddcc";
  /** The runbook's own words, as an operator would type them into a shell. */
  const RUNBOOK_COMMAND =
    'gh api --hostname github.com -H "Accept: application/vnd.github.raw" repos/opum-ai/lore-cli/contents/CHANGELOG.md?ref=<that commit>';

  test("the runbook carries the command, and changelogAtRefArgs produces the same one", () => {
    const runbook = readFileSync(join(import.meta.dir, "..", "docs", "runbooks", "release-publishing.md"), "utf8");
    // (a) doc drift reddens here. The runbook writes the header shell-quoted; that quoting is the
    // ONLY difference the argv comparison below tolerates, and the test is what removes it.
    expect(runbook).toContain(RUNBOOK_COMMAND);
    // (b) builder drift reddens here: `?ref=main` (or any other spelling) cannot equal this literal.
    expect(["gh", ...changelogAtRefArgs(SAMPLE)].join(" ")).toBe(
      RUNBOOK_COMMAND.replaceAll('"', "").replace("<that commit>", SAMPLE),
    );
  });
});

describe("LCLI-639: the fixture's own numbers, so the assertions above cannot be vacuous", () => {
  test("each source yields a non-empty section, and the two differ", () => {
    expect(committedNotes()).toBe(COMMITTED_NOTE);
    expect(workingTreeNotes()).toBe(WORKING_TREE_NOTE);
    expect(committedNotes()).not.toBe(workingTreeNotes());
    // And so the byte-length comparator the dry run leans on discriminates between them.
    expect(Buffer.byteLength(committedNotes())).not.toBe(Buffer.byteLength(workingTreeNotes()));
  });

  test("the vendored control is the bytes git held at fee53bc6, below its provenance header", () => {
    const vendored = readFileSync(PRE_CHANGE, "utf8");
    const at = vendored.indexOf(PRE_CHANGE_FIRST_LINE);
    expect(at).toBeGreaterThan(0);
    const body = Buffer.from(vendored.slice(at), "utf8");
    // The git blob hash, not a byte comparison: an edit to the control fails HERE rather than
    // quietly changing what the control above is evidence about.
    expect(createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex")).toBe(PRE_CHANGE_BLOB);
  });
});
