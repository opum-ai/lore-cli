/**
 * lcli631-promote-refuses-older-or-prerelease.test.ts — LCLI-631, paired with quest-cli QCLI-402
 * (opum-ai/quest-cli#369), under opum-doc ADR
 * refuse-a-lore-quest-promotion-that-would-move-npm-latest-backwards and its Amendment 1.
 *
 * A FRESH run of scripts/promote-latest.mjs, --dry-run and --promote alike, refuses before any
 * registry write when --version is (a) strictly older than the current `latest` of any package it
 * would move, compared numerically, or (b) not a plain X.Y.Z. Both would otherwise write a record
 * that resume and --rollback then refuse (LCLI-617), stranding the promotion. The one gate is
 * validateRecord on the record planPromotion builds. Through main(), (b) is in fact refused one
 * step earlier, by the artifact's launcher-equivalence check, which the (b) cases below pin.
 * Equal-to-latest keeps its existing behaviour: a fresh run refuses it as a lost record, and a
 * resume accepts it.
 *
 * LCLI-638 (paired with quest-cli QCLI-405) closes the other half: the gate above is fresh-only,
 * because a fresh record is what it validates, and a resume keeps the record the FIRST run wrote.
 * So a resume now compares every package's CURRENT `latest` with --version too, and refuses a
 * strictly newer one before any write; equal-to-version stays accepted (that partial state is what
 * a resume is for). Its cases are the last describe block, and they reuse this file's runner. A
 * fresh run's non-plain-current-latest refusal was re-worded in the same change: nothing has been
 * recorded yet, so validateRecord's "recorded prior latest ..." was naming an artifact that did
 * not exist.
 *
 * Every case drives main() end to end through its one injectable runner, against an in-memory
 * GitHub and registry keyed by the version under test. (test/promote-latest.test.ts has the full
 * world, pinned to one version; this is the same shape, parameterised, and only as much as the
 * fresh and resumed --promote paths need.) Every refusal is proven with ZERO registry writes and
 * no record file, and every refusal names the gate's headline, so it cannot pass by being refused
 * earlier for some other reason.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  expectedTarballNames,
  PAIR_RECEIPT_KIND,
  PLATFORMS,
  RELEASE_PACKAGES,
  tarballName,
} from "../scripts/pair-receipt.mjs";
import {
  commitReadArgs,
  main,
  planPromotion,
  README_READBACK_SCRIPT,
  RECORD_KIND,
  releaseRunReadArgs,
  treeReadArgs,
} from "../scripts/promote-latest.mjs";

const RUN = "4242";
const COMMIT = "a".repeat(40);
const TAG_OBJECT = "9".repeat(40);
const ROOT_TREE = "b".repeat(40);
const LAUNCHER = "@opum-ai/lore";
const PLATFORM_PACKAGES = RELEASE_PACKAGES.filter((name) => name !== LAUNCHER);
const REGISTRY = "https://registry.npmjs.org/";
const PINS = [`--registry=${REGISTRY}`, `--@opum-ai:registry=${REGISTRY}`];
const FAST = { attempts: 1, delayMs: 0, sleep: async () => {} };
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sri = (bytes: Uint8Array) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const integrity = (name: string) => `sha512-${Buffer.from(name).toString("base64")}==`;
const rcOf = (version: string) => `${version}-rc.2`;

// ── Launcher tarballs: the same minimal ustar writer test/promote-latest.test.ts uses, so the real
// launcher-equivalence gate reads real archives.
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

function launcher(release: string, version: string): Buffer {
  const manifest = `${JSON.stringify(
    {
      name: LAUNCHER,
      version,
      optionalDependencies: Object.fromEntries(PLATFORMS.map((p) => [`@opum-ai/lore-${p}`, release])),
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

type WorldOptions = {
  /** The release under test: --version. */
  version: string;
  /** Every package's current `latest`, unless `latestFor` names it. */
  latest: string;
  latestFor?: Record<string, string>;
};

/**
 * An in-memory GitHub + registry behind one runner, serving release `version` as staged and
 * qualified in every respect, so the ONLY thing that can refuse it is the relation between
 * `version` and each package's current `latest`. `writes` records every registry write in order.
 */
function world({ version: V, latest, latestFor = {} }: WorldOptions) {
  const RC = rcOf(V);
  const X_FILE = tarballName(LAUNCHER, V);
  const RC_FILE = tarballName(LAUNCHER, RC);
  const tags: Record<string, Record<string, string>> = {};
  for (const name of RELEASE_PACKAGES)
    tags[name] = { latest: latestFor[name] ?? latest, "release-candidate": name === LAUNCHER ? RC : V };
  const files = new Map<string, Buffer>();
  for (const p of PLATFORMS) files.set(tarballName(`@opum-ai/lore-${p}`, V), Buffer.from(`platform ${p} ${V}\n`));
  files.set(RC_FILE, launcher(V, RC));
  files.set(X_FILE, launcher(V, V));
  const digest = (name: string) => sha256(files.get(name) ?? Buffer.alloc(0));
  const pass1 = {
    schemaVersion: 1,
    kind: "opum.qualification-receipt.v1",
    product: "lore",
    version: V,
    commit: COMMIT,
    releaseRunId: Number(RUN),
    tarballs: Object.fromEntries(expectedTarballNames(V, RC).map((name) => [name, digest(name)])),
    launcherVersion: RC,
    launcherSubstitution: {
      verdict: "MATCH",
      finalTarball: { filename: X_FILE, sha256: digest(X_FILE) },
      method: "entry by entry, X-rc.N -> X",
      mismatches: [],
    },
    verdict: "QUALIFIED",
  };
  const pair = {
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
  };
  const calls: string[][] = [];
  const writes: string[] = [];
  const state: { xPublished: Buffer | null; downloadDir: string | null } = { xPublished: null, downloadDir: null };
  const run = async (command: string, args: string[]) => {
    calls.push([command, ...args]);
    const line = [command, ...args].join(" ");
    const write = () => writes.push(args.filter((a) => !PINS.includes(a)).join(" "));
    if (command === "security") throw Object.assign(new Error("no keychain item"), { code: 44 });
    const receiptAt = (path: string) =>
      `gh api --hostname github.com -H Accept: application/vnd.github.raw repos/opum-ai/opum-cli-e2e/contents/${path}?ref=main`;
    if (line === receiptAt(`receipts/pair/${V}.json`)) return { stdout: JSON.stringify(pair) };
    if (line === receiptAt(`receipts/lore/${V}.json`)) return { stdout: JSON.stringify(pass1) };
    if (line === `gh api --hostname github.com repos/opum-ai/lore-cli/git/ref/tags/v${V}`)
      return { stdout: JSON.stringify({ ref: `refs/tags/v${V}`, object: { type: "tag", sha: TAG_OBJECT } }) };
    if (line === `gh api --hostname github.com repos/opum-ai/lore-cli/git/tags/${TAG_OBJECT}`)
      return { stdout: JSON.stringify({ sha: TAG_OBJECT, object: { type: "commit", sha: COMMIT } }) };
    if (line === `gh ${releaseRunReadArgs(RUN).join(" ")}`)
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
    if (command === "gh" && args[0] === "run" && args[1] === "download") {
      const dir = args[args.length - 1] as string;
      state.downloadDir = dir;
      for (const [name, bytes] of files) writeFileSync(join(dir, name), bytes);
      return { stdout: "" };
    }
    if (line === `gh ${commitReadArgs(COMMIT).join(" ")}`)
      return { stdout: JSON.stringify({ sha: COMMIT, tree: { sha: ROOT_TREE } }) };
    if (line === `gh ${treeReadArgs(ROOT_TREE).join(" ")}`)
      return {
        stdout: JSON.stringify({ sha: ROOT_TREE, tree: [{ path: "skills", type: "tree", sha: "c".repeat(40) }] }),
      };
    if (command === "npm" && args[0] === "view" && args[1] === "@opum-ai/quest" && args[2] === "dist-tags")
      return { stdout: JSON.stringify([{ latest: V, "release-candidate": V }]) };
    if (command === "npm" && args[0] === "view" && args[2] === "dist-tags") {
      const t = tags[args[1] as string];
      if (!t) throw new Error("E404");
      return { stdout: JSON.stringify([t]) };
    }
    if (command === "npm" && args[0] === "view" && args[2] === "--json" && args[1] === `${LAUNCHER}@${V}`) {
      if (state.xPublished === null)
        throw Object.assign(new Error("Command failed: npm view"), {
          stderr: `npm error code E404\nnpm error 404 No match found for version ${V}`,
          stdout: JSON.stringify({ error: { code: "E404" } }),
        });
      return { stdout: JSON.stringify([{ name: LAUNCHER, version: V, dist: { integrity: sri(state.xPublished) } }]) };
    }
    if (command === "npm" && args[0] === "view" && args[2] === "--json") {
      const spec = args[1] as string;
      const at = spec.lastIndexOf("@");
      const [name, version] = [spec.slice(0, at), spec.slice(at + 1)];
      return {
        stdout: JSON.stringify([{ name, version, dist: { integrity: integrity(tarballName(name, version)) } }]),
      };
    }
    if (command === "npm" && args[0] === "pack") {
      const into = args[3] as string;
      writeFileSync(join(into, RC_FILE), files.get(RC_FILE) as Buffer);
      return { stdout: JSON.stringify({ [LAUNCHER]: { id: `${LAUNCHER}@${RC}`, filename: RC_FILE } }) };
    }
    if (command === "npm" && args[0] === "publish") {
      write();
      state.xPublished = readFileSync(args[1] as string);
      (tags[LAUNCHER] as Record<string, string>).latest = V;
      return { stdout: `+ ${LAUNCHER}@${V}` };
    }
    if (command === "npm" && args[0] === "dist-tag" && args[1] === "add") {
      write();
      const spec = args[2] as string;
      const at = spec.lastIndexOf("@");
      (tags[spec.slice(0, at)] as Record<string, string>)[args[3] as string] = spec.slice(at + 1);
      return { stdout: "" };
    }
    // LCLI-622: no v<V> GitHub Release yet, so the preflight passes and the cut creates it.
    if (command === "gh" && args[0] === "release" && args[1] === "view")
      throw Object.assign(new Error("Command failed: gh release view"), { stderr: "release not found" });
    if (command === "gh" && args[0] === "release" && args[1] === "create") return { stdout: "" };
    // The read-back's verdict is platform-independent here: this file is about the gate before it.
    if (command === "bash" && args[0] === README_READBACK_SCRIPT)
      return { stdout: "A4 VERDICT: PASSED (stand-in: LCLI-631 tests the gate before the first write)\n", stderr: "" };
    throw new Error(`unexpected command in test: ${line}`);
  };
  return { run, tags, calls, writes, state, V, RC, X_FILE };
}

type World = ReturnType<typeof world>;

async function go(w: World, mode: "--dry-run" | "--promote", setup?: (recordPath: string) => void) {
  const dir = mkdtempSync(resolve(tmpdir(), "lore-lcli631-"));
  const record = join(dir, "promotion-record.json");
  // LCLI-622: the GitHub Release is cut from CHANGELOG.md's ## [V] section, so the release has one.
  const changelogPath = join(dir, "CHANGELOG.md");
  writeFileSync(changelogPath, `# Changelog\n\n## [${w.V}] - 2026-09-28\n\n- Released.\n`);
  setup?.(record);
  const out: string[] = [];
  const err: string[] = [];
  try {
    const code = await main(["--record", record, "--version", w.V, "--release-run", RUN, mode], {
      run: w.run,
      env: { NPM_TOKEN: "" },
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      readPackageVersion: async () => "0.0.0-not-read",
      verifyOptions: FAST,
      changelogPath,
    });
    const recordText = existsSync(record) ? readFileSync(record, "utf8") : null;
    return { code, out, err, text: [...out, ...err].join("\n"), errText: err.join("\n"), recordText };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const olderHeadline = (name: string, version: string, current: string) =>
  `${name}: ${version} is older than the current latest ${current}, so promoting it would move latest backwards. Backports are not a promote use case: an older version belongs on a non-latest dist-tag through a separate path that is not built`;
const prereleaseHeadline = (version: string) =>
  `${version} is not a plain X.Y.Z release, and latest only ever takes a release. A prerelease, like a backport, is not a promote use case: it belongs on a non-latest dist-tag through a separate path that is not built`;

const MODES = ["--dry-run", "--promote"] as const;

/** A refusal by the LCLI-631 gate: exit 1, zero registry writes, no record, and the gate's words. */
async function expectRefused(options: WorldOptions, mode: (typeof MODES)[number], headlines: string[]) {
  const w = world(options);
  const r = await go(w, mode);
  expect(r.code).toBe(1);
  expect(w.writes).toEqual([]);
  expect(w.calls.some(([c, a]) => c === "npm" && (a === "publish" || a === "dist-tag"))).toBe(false);
  expect(r.recordText).toBeNull();
  expect(r.errText).toContain(`Refusing to promote ${options.version}:`);
  for (const headline of headlines) expect(r.errText).toContain(headline);
  // It never reached the pair receipt, quest-first or step 6: the gate is the planning step.
  expect(r.text).not.toContain("Pair receipt");
  return { w, r };
}

describe("LCLI-631 (a): a --version strictly older than a current latest is refused before any write", () => {
  const cases: Array<[string, string, string]> = [
    ["older by patch", "5.6.6", "5.6.7"],
    ["older by minor", "5.5.9", "5.6.0"],
    ["older by major", "4.9.9", "5.0.0"],
    ["numeric, not lexical", "0.9.0", "0.10.0"],
    ["past 2^53, where Number() collapses the two", "0.0.9007199254740992", "0.0.9007199254740993"],
  ];
  for (const [label, version, latest] of cases)
    for (const mode of MODES)
      test(`${label} (${version} over ${latest}), ${mode}: exit 1, zero writes, both versions named`, async () => {
        await expectRefused(
          { version, latest },
          mode,
          RELEASE_PACKAGES.map((name) => olderHeadline(name, version, latest)),
        );
      });

  for (const mode of MODES)
    test(`a mixed state, ${mode}: only the one package whose latest is newer is named, and nothing moves`, async () => {
      const newer = PLATFORM_PACKAGES[2] as string;
      const { r } = await expectRefused({ version: "5.6.7", latest: "5.6.6", latestFor: { [newer]: "5.7.0" } }, mode, [
        olderHeadline(newer, "5.6.7", "5.7.0"),
      ]);
      for (const name of RELEASE_PACKAGES.filter((n) => n !== newer))
        expect(r.errText).not.toContain(`${name}: 5.6.7 is older`);
      // validateRecord's own reason follows the headline: the verdict is the gate's, not the prose's.
      expect(r.errText).toContain(`${newer}: recorded prior latest 5.7.0 is newer than the release 5.6.7`);
    });

  for (const mode of MODES)
    test(`a mixed state where only the LAUNCHER's latest is newer, ${mode}: refused, zero writes`, async () => {
      await expectRefused({ version: "5.6.7", latest: "5.6.6", latestFor: { [LAUNCHER]: "6.0.0" } }, mode, [
        olderHeadline(LAUNCHER, "5.6.7", "6.0.0"),
      ]);
    });
});

const NOT_PLAIN = ["1.0.0-beta.1", "0.12.0-rc.1", "0.12.0+build.7"];

describe("LCLI-631 (b): a --version that is not plain X.Y.Z is refused before any write", () => {
  // Measured while writing this file: through main(), a non-plain --version never reaches
  // planPromotion. Step 2's readArtifact runs the launcher-equivalence gate, whose
  // versionPairProblem (scripts/launcher-equivalence.mjs, LCLI-621 bb8b2662) refuses any X that
  // is not a final MAJOR.MINOR.PATCH. That was already true before LCLI-631. These cases pin the
  // outcome AC5 asks for -- exit 1, zero registry writes, no record -- whichever gate gives it,
  // and pin WHICH gate gives it today, so a change that lets a prerelease past the artifact
  // reddens here rather than silently leaning on planPromotion's gate below.
  for (const version of NOT_PLAIN)
    for (const mode of MODES)
      test(`${version} (over an older latest 0.11.0), ${mode}: exit 1, zero writes, no record`, async () => {
        const w = world({ version, latest: "0.11.0" });
        const r = await go(w, mode);
        expect(r.code).toBe(1);
        expect(w.writes).toEqual([]);
        expect(w.calls.some(([c, a]) => c === "npm" && (a === "publish" || a === "dist-tag"))).toBe(false);
        expect(r.recordText).toBeNull();
        expect(r.errText).toContain(
          `Refusing to promote ${version}: the npm-packages artifact of run ${RUN} is not a lore ${version} release. Nothing has moved.`,
        );
        expect(r.errText).toContain(`version ${JSON.stringify(version)} is not a final MAJOR.MINOR.PATCH version`);
        // Refused at step 2: no registry read of any package's tags happened at all.
        expect(w.calls.some(([c, a, , t]) => c === "npm" && a === "view" && t === "dist-tags")).toBe(false);
      });

  // The gate's own prerelease clause, on the planning step the ADR names. Unreachable through
  // main() today (above); it is what stops the record if the artifact gate ever lets one through.
  for (const version of NOT_PLAIN)
    test(`planPromotion, fresh, ${version} over 0.11.0: refused with the prerelease headline and validateRecord's reason`, async () => {
      const plan = await planPromotion({
        version,
        launcherVersion: rcOf(version),
        readTags: async (name) => ({
          latest: "0.11.0",
          "release-candidate": name === LAUNCHER ? rcOf(version) : version,
        }),
      });
      expect(plan.ok).toBe(false);
      expect((plan as { problems: string[] }).problems).toEqual([
        prereleaseHeadline(version),
        `record's version ${JSON.stringify(version)} is not a plain X.Y.Z release version`,
      ]);
    });
});

describe("LCLI-631: what the gate still accepts", () => {
  test("0.10.0 over 0.9.0 (numeric order), --dry-run: exit 0, zero writes, the record it would write", async () => {
    const w = world({ version: "0.10.0", latest: "0.9.0" });
    const r = await go(w, "--dry-run");
    expect(r.errText).toBe("");
    expect(r.code).toBe(0);
    expect(w.writes).toEqual([]);
    expect(r.recordText).toBeNull();
    expect(r.out.join("\n")).toContain("Dry run only: nothing was written, published or tag-moved.");
  });

  test("0.10.0 over 0.9.0, --promote: records 0.9.0 as every prior, moves six platforms, publishes X last", async () => {
    const w = world({ version: "0.10.0", latest: "0.9.0" });
    const r = await go(w, "--promote");
    expect(r.errText).toBe("");
    expect(r.code).toBe(0);
    expect(w.writes).toEqual([
      ...PLATFORM_PACKAGES.map((name) => `dist-tag add ${name}@0.10.0 latest`),
      `publish ${join(w.state.downloadDir as string, w.X_FILE)} --tag latest`,
    ]);
    const record = JSON.parse(r.recordText as string);
    expect(record.version).toBe("0.10.0");
    expect(record.packages.map((e: { priorLatest: string }) => e.priorLatest)).toEqual(
      RELEASE_PACKAGES.map(() => "0.9.0"),
    );
  });
});

describe("LCLI-631: equal-to-latest keeps its existing behaviour", () => {
  // The state a first --promote leaves when it stopped part-way: two platforms already read the
  // release. That is "equal to latest" for those two, and it is exactly what a resume exists for.
  const V = "5.6.7";
  const PRIOR = "5.6.6";
  const moved = PLATFORM_PACKAGES.slice(0, 2);
  const partial = () => ({ version: V, latest: PRIOR, latestFor: Object.fromEntries(moved.map((n) => [n, V])) });

  for (const mode of MODES)
    test(`fresh (no record), ${mode}: refused as a lost record, as before LCLI-631, not by the new gate`, async () => {
      const w = world(partial());
      const r = await go(w, mode);
      expect(r.code).toBe(1);
      expect(w.writes).toEqual([]);
      expect(r.recordText).toBeNull();
      for (const name of moved)
        expect(r.errText).toContain(
          `${name}: latest already reads ${V}; a new record would store that as the prior value -- pass the record written by the first run`,
        );
      expect(r.errText).not.toContain("is older than the current latest");
      expect(r.errText).not.toContain("is not a plain X.Y.Z release, and latest");
    });

  test("resumed (the first run's record), --promote: accepted, re-moves every platform, publishes X, exit 0", async () => {
    const w = world(partial());
    const first = {
      schemaVersion: 1,
      kind: RECORD_KIND,
      version: V,
      launcherVersion: rcOf(V),
      releaseRunId: RUN,
      recordedAt: "2026-09-28T00:00:00.000Z",
      packages: RELEASE_PACKAGES.map((name) => ({ name, priorLatest: PRIOR })),
    };
    const written = `${JSON.stringify(first, null, 2)}\n`;
    const r = await go(w, "--promote", (path) => writeFileSync(path, written));
    expect(r.errText).toBe("");
    expect(r.code).toBe(0);
    expect(r.out.join("\n")).toContain("Reusing the record");
    expect(r.recordText).toBe(written);
    expect(w.writes).toEqual([
      ...PLATFORM_PACKAGES.map((name) => `dist-tag add ${name}@${V} latest`),
      `publish ${join(w.state.downloadDir as string, w.X_FILE)} --tag latest`,
    ]);
  });
});

describe("LCLI-638 (paired with quest-cli QCLI-405): a RESUME refuses when a current latest is newer", () => {
  // The first run's record, verbatim: what a resume reuses. Written to disk by `setup`, and what
  // the refusal must leave byte-identical.
  const V = "5.6.7";
  const PRIOR = "5.6.6";
  const recordFor = () => ({
    schemaVersion: 1,
    kind: RECORD_KIND,
    version: V,
    launcherVersion: rcOf(V),
    releaseRunId: RUN,
    recordedAt: "2026-09-28T00:00:00.000Z",
    packages: RELEASE_PACKAGES.map((name) => ({ name, priorLatest: PRIOR })),
  });
  const resumeHeadline = (name: string, current: string) =>
    `${name}: ${V} is older than the current latest ${current}, so resuming would move latest backwards. latest has moved on since the record was written, so this record is stale: re-run against the newer release's checkout. Moving latest back is a deliberate, manual decision -- --rollback refuses here, because ${current} is neither this record's release nor its recorded prior`;

  for (const mode of MODES)
    test(`every package's latest has moved ahead (${V} over 5.7.0), ${mode}: exit 1, zero writes, record unchanged, both versions named`, async () => {
      const w = world({ version: V, latest: "5.7.0" });
      const written = `${JSON.stringify(recordFor(), null, 2)}\n`;
      const r = await go(w, mode, (path) => writeFileSync(path, written));
      expect(r.code).toBe(1);
      expect(w.writes).toEqual([]);
      expect(w.calls.some(([c, a]) => c === "npm" && (a === "publish" || a === "dist-tag"))).toBe(false);
      expect(r.recordText).toBe(written);
      expect(r.errText).toContain(`Refusing to promote ${V}:`);
      for (const name of RELEASE_PACKAGES) expect(r.errText).toContain(resumeHeadline(name, "5.7.0"));
      // The refusal is the resume gate: the reused record is validated and reported, and then the
      // plan refuses -- the pair receipt that follows the plan is never reached.
      expect(r.text).not.toContain("Pair receipt");
    });

  for (const mode of MODES)
    test(`one platform's latest has moved ahead, ${mode}: only that package is named, zero writes`, async () => {
      const moved = PLATFORM_PACKAGES[3] as string;
      const w = world({ version: V, latest: PRIOR, latestFor: { [moved]: "6.0.0" } });
      const written = `${JSON.stringify(recordFor(), null, 2)}\n`;
      const r = await go(w, mode, (path) => writeFileSync(path, written));
      expect(r.code).toBe(1);
      expect(w.writes).toEqual([]);
      expect(r.recordText).toBe(written);
      expect(r.errText).toContain(resumeHeadline(moved, "6.0.0"));
      for (const name of RELEASE_PACKAGES.filter((n) => n !== moved))
        expect(r.errText).not.toContain(`${name}: ${V} is older than the current latest`);
    });

  for (const mode of MODES)
    test(`only the LAUNCHER's latest has moved ahead, ${mode}: refused, zero writes`, async () => {
      const w = world({ version: V, latest: PRIOR, latestFor: { [LAUNCHER]: "6.0.0" } });
      const written = `${JSON.stringify(recordFor(), null, 2)}\n`;
      const r = await go(w, mode, (path) => writeFileSync(path, written));
      expect(r.code).toBe(1);
      expect(w.writes).toEqual([]);
      expect(r.recordText).toBe(written);
      expect(r.errText).toContain(resumeHeadline(LAUNCHER, "6.0.0"));
    });

  // The state a resume exists for, and the boundary the rule must not cross: a package already at
  // --version (the first run moved it and stopped) and the rest still at the prior value.
  test("resume with a partial move (two platforms already at --version) still proceeds, exit 0", async () => {
    const moved = PLATFORM_PACKAGES.slice(0, 2);
    const w = world({
      version: V,
      latest: PRIOR,
      latestFor: Object.fromEntries(moved.map((n) => [n, V])),
    });
    const written = `${JSON.stringify(recordFor(), null, 2)}\n`;
    const r = await go(w, "--promote", (path) => writeFileSync(path, written));
    expect(r.errText).toBe("");
    expect(r.code).toBe(0);
    expect(r.recordText).toBe(written);
    expect(w.writes).toEqual([
      ...PLATFORM_PACKAGES.map((name) => `dist-tag add ${name}@${V} latest`),
      `publish ${join(w.state.downloadDir as string, w.X_FILE)} --tag latest`,
    ]);
  });

  test("resume with every latest one patch below --version still proceeds, exit 0", async () => {
    const w = world({ version: V, latest: "5.6.6" });
    const written = `${JSON.stringify(recordFor(), null, 2)}\n`;
    const r = await go(w, "--dry-run", (path) => writeFileSync(path, written));
    expect(r.errText).toBe("");
    expect(r.code).toBe(0);
    expect(w.writes).toEqual([]);
    expect(r.recordText).toBe(written);
  });
});

describe("LCLI-631: planPromotion's gate, directly", () => {
  const tagsFor =
    (latest: Record<string, string>, version: string) =>
    async (name: string): Promise<Record<string, string>> => ({
      latest: latest[name] as string,
      "release-candidate": name === LAUNCHER ? rcOf(version) : version,
    });
  const all = (v: string) => Object.fromEntries(RELEASE_PACKAGES.map((n) => [n, v]));

  // LCLI-638 inverted this test. It used to pin the gap -- resuming, an older version was accepted
  // because main() validates only the reused record. Since LCLI-638 the resume path refuses too,
  // naming the package and both versions, so the same inputs now refuse on both paths.
  test("the gate covers resume too: resuming an older version is refused, naming both versions", async () => {
    const fresh = await planPromotion({
      version: "0.9.0",
      launcherVersion: rcOf("0.9.0"),
      readTags: tagsFor(all("0.10.0"), "0.9.0"),
    });
    expect(fresh.ok).toBe(false);
    const resumed = await planPromotion({
      version: "0.9.0",
      launcherVersion: rcOf("0.9.0"),
      readTags: tagsFor(all("0.10.0"), "0.9.0"),
      resuming: true,
    });
    expect(resumed.ok).toBe(false);
    // Every package's CURRENT latest is 0.10.0, so every one of them is named, both versions in each.
    expect((resumed as { problems: string[] }).problems).toEqual(
      RELEASE_PACKAGES.map(
        (name) =>
          `${name}: 0.9.0 is older than the current latest 0.10.0, so resuming would move latest backwards. latest has moved on since the record was written, so this record is stale: re-run against the newer release's checkout. Moving latest back is a deliberate, manual decision -- --rollback refuses here, because 0.10.0 is neither this record's release nor its recorded prior`,
      ),
    );
  });

  // LCLI-638 review F1: "strictly newer" is a SEMVER-PRECEDENCE question, and the live value is not
  // always a plain X.Y.Z. A prerelease is decided by the release it leads with -- 5.7.0-rc.1 is
  // newer than 5.6.7 and refuses -- while a prerelease or build-metadata value of the SAME release
  // is not newer than it and still resumes. Pinned here at the precedence boundary.
  const precedence: Array<[string, boolean]> = [
    ["5.7.0-rc.1", false],
    ["5.6.8-rc.1", false],
    ["5.6.7+build.7", true],
    ["5.6.7-rc.1", true],
    ["5.6.6-rc.1", true],
  ];
  for (const [live, accepted] of precedence)
    test(`resuming with a live latest of ${live} against ${"5.6.7"}: ${accepted ? "accepted" : "refused"}`, async () => {
      const plan = await planPromotion({
        version: "5.6.7",
        launcherVersion: "5.6.7-rc.2",
        resuming: true,
        readTags: async (name) => ({
          latest: name === RELEASE_PACKAGES[1] ? live : "5.6.6",
          "release-candidate": name === LAUNCHER ? "5.6.7-rc.2" : "5.6.7",
        }),
      });
      expect(plan.ok).toBe(accepted);
      if (!accepted) {
        const problems = (plan as { problems: string[] }).problems;
        // Only the one package whose live value leads with a newer release is named.
        expect(problems).toEqual([
          `${RELEASE_PACKAGES[1]}: 5.6.7 is older than the current latest ${live}, so resuming would move latest backwards. latest has moved on since the record was written, so this record is stale: re-run against the newer release's checkout. Moving latest back is a deliberate, manual decision -- --rollback refuses here, because ${live} is neither this record's release nor its recorded prior`,
        ]);
      }
    });

  // The same boundary end to end: a live prerelease that is newer than --version refuses with zero
  // writes. (The LCLI-638 describe block holds the plain-version e2e cases; this one belongs here
  // because the precedence boundary is this describe's subject.)
  const V1 = "5.6.7";
  const PRIOR1 = "5.6.6";
  for (const mode of MODES)
    test(`a platform's live latest is a newer prerelease (5.7.0-rc.1), ${mode}: exit 1, zero writes`, async () => {
      const odd = PLATFORM_PACKAGES[1] as string;
      const w = world({ version: V1, latest: PRIOR1, latestFor: { [odd]: "5.7.0-rc.1" } });
      const first = {
        schemaVersion: 1,
        kind: RECORD_KIND,
        version: V1,
        launcherVersion: rcOf(V1),
        releaseRunId: RUN,
        recordedAt: "2026-09-28T00:00:00.000Z",
        packages: RELEASE_PACKAGES.map((name) => ({ name, priorLatest: PRIOR1 })),
      };
      const written = `${JSON.stringify(first, null, 2)}\n`;
      const r = await go(w, mode, (path) => writeFileSync(path, written));
      expect(r.code).toBe(1);
      expect(w.writes).toEqual([]);
      expect(r.recordText).toBe(written);
      expect(r.errText).toContain(
        `${odd}: ${V1} is older than the current latest 5.7.0-rc.1, so resuming would move latest backwards`,
      );
      expect(r.text).not.toContain("Pair receipt");
    });

  // The case a resume exists for: the registry has NOT moved ahead, so the new resume refusal must
  // stay silent -- equal-to-latest and older-than-latest both resume.
  test("resuming is still accepted when every current latest is older than, or equal to, --version", async () => {
    const older = await planPromotion({
      version: "0.10.0",
      launcherVersion: rcOf("0.10.0"),
      readTags: tagsFor(all("0.9.0"), "0.10.0"),
      resuming: true,
    });
    expect(older.ok).toBe(true);
    const equal = await planPromotion({
      version: "0.10.0",
      launcherVersion: rcOf("0.10.0"),
      readTags: tagsFor({ ...all("0.9.0"), [PLATFORM_PACKAGES[0] as string]: "0.10.0" }, "0.10.0"),
      resuming: true,
    });
    expect(equal.ok).toBe(true);
  });

  test("a current latest that is not a plain X.Y.Z is refused, now explained in the registry's own terms", async () => {
    const odd = { ...all("0.9.0"), [LAUNCHER]: "0.9.0-rc.1" };
    const plan = await planPromotion({
      version: "0.10.0",
      launcherVersion: rcOf("0.10.0"),
      readTags: tagsFor(odd, "0.10.0"),
    });
    expect(plan.ok).toBe(false);
    const problems = (plan as { problems: string[] }).problems;
    expect(problems).toEqual([
      `${LAUNCHER}: its current latest is "0.9.0-rc.1", not a plain X.Y.Z release. A promotion records the current latest as the value --rollback would restore, so latest must read a release: move ${LAUNCHER}'s latest onto the release it should return to, then re-run`,
      `${LAUNCHER}: recorded prior latest "0.9.0-rc.1" is not a plain X.Y.Z release version`,
    ]);
  });
});
