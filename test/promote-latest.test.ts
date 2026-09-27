/**
 * promote-latest.test.ts — the `latest` move (LCLI-613, constitution Article 3 clause 5), and since
 * LCLI-621 the root launcher's fresh publish of X onto `latest` (Article 3 clause 5 as amended by
 * ODOC-302; the paired design with quest-cli QCLI-399; opum-cli-e2e receipts/README.md steps 5-7).
 *
 * scripts/promote-latest.mjs is driven end to end through its one injectable runner against an
 * in-memory GitHub and registry, so every npm and gh call it makes is observed and none reaches a
 * network. The world serves the Release run, its npm-packages artifact (eight tarballs, the two
 * launchers built here as real gzipped ustar archives so scripts/launcher-equivalence.mjs runs on
 * them for real), the pass-1 receipt, the pair receipt, the tag peel and the registry.
 *
 * Proven here: every pre-move refusal (tag, run, artifact, pass-1 receipt, staging, pair receipt,
 * quest first, step 6, X already on npm as other bytes) exits 1 with no record and no write; the
 * clean case promotes -- record first, six platforms by dist-tag, then exactly one
 * `npm publish <X> --tag latest`, last; step 6 re-runs after the platform move and a change there
 * rolls every moved tag back, the launcher's included; a resume moves the tag instead of
 * republishing; step 7 verifies all seven tags and npm's X integrity; the readme read-back reports
 * a byte count and warns on 0; --rollback restores all seven by dist-tag and unpublishes nothing.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { devNull, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  expectedTarballNames,
  PAIR_RECEIPT_KIND,
  PLATFORMS,
  RELEASE_PACKAGES,
  tarballName,
} from "../scripts/pair-receipt.mjs";
import {
  artifactDownloadArgs,
  checkReleaseRun,
  checkRollbackState,
  checkServedLauncher,
  distTagAddArgs,
  distTagReadArgs,
  downloadServedTarball,
  launcherPublishArgs,
  main,
  type PromotionRecord,
  publishFinalLauncher,
  RECORD_KIND,
  RELEASE_VERSION,
  readBackReadme,
  releaseRunReadArgs,
  rollback,
  SEMVER,
  tokenShape,
  validateRecord,
  verifyFinalLauncher,
} from "../scripts/promote-latest.mjs";

const V = "5.6.7";
const RC = "5.6.7-rc.2";
const PRIOR = "5.6.6";
const RUN = "4242";
const COMMIT = "a".repeat(40);
const TAG_OBJECT = "9".repeat(40);
const GIT = "git";
const LAUNCHER = "@opum-ai/lore";
const RC_FILE = `opum-ai-lore-${RC}.tgz`;
const X_FILE = `opum-ai-lore-${V}.tgz`;
const integrity = (name: string) => `sha512-${Buffer.from(name).toString("base64")}==`;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sri = (bytes: Uint8Array) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const FAST = { attempts: 1, delayMs: 0, sleep: async () => {} };
const REGISTRY = "https://registry.npmjs.org/";
const PLATFORM_PACKAGES = RELEASE_PACKAGES.filter((name) => name !== LAUNCHER);

// ── Launcher tarballs: a minimal ustar writer (as test/launcher-equivalence.test.ts), so the bytes
// are exactly what each case says on every platform and the real equivalence gate reads them.
function tarball(entries: Array<{ path: string; content: string; mode?: number }>, level?: number): Buffer {
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
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]), level === undefined ? {} : { level });
}

/** `level` repacks the SAME entries at another gzip level: other bytes, an equivalent launcher. */
function launcher(version: string, readmeExtra = "", level?: number): Buffer {
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
  return tarball(
    [
      { path: "package/LICENSE", content: "MIT\n" },
      { path: "package/bin/lore.cjs", content: "#!/usr/bin/env node\n", mode: 0o755 },
      { path: "package/package.json", content: manifest },
      {
        path: "package/README.md",
        content: `# lore\n\n> **Status: ${version} released.** Tag \`v${version}\`\n${readmeExtra}`,
      },
    ],
    level,
  );
}

/** The Release run's npm-packages artifact: eight tarballs. */
function artifact(): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const p of PLATFORMS) files.set(`opum-ai-lore-${p}-${V}.tgz`, Buffer.from(`platform ${p} ${V}\n`));
  files.set(RC_FILE, launcher(RC));
  files.set(X_FILE, launcher(V));
  return files;
}

function goodPass1(files: Map<string, Buffer>, commit = COMMIT): Record<string, unknown> {
  // An artifact case may have removed a file; the receipt still names what the release should carry.
  const digest = (name: string) => sha256(files.get(name) ?? Buffer.alloc(0));
  return {
    schemaVersion: 1,
    kind: "opum.qualification-receipt.v1",
    product: "lore",
    version: V,
    commit,
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
}

function goodReceipt(commit = COMMIT): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: PAIR_RECEIPT_KIND,
    pair: {
      lore: {
        version: V,
        commit,
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
}

type WorldOptions = {
  receipt?: unknown;
  pass1?: unknown | ((files: Map<string, Buffer>) => unknown);
  tags?: Record<string, Record<string, string>>;
  tagCommit?: string | null;
  run?: Record<string, unknown>;
  /** Edits the eight artifact files before the download serves them. */
  artifact?: (files: Map<string, Buffer>) => void;
  downloadFails?: boolean;
  /** What `npm pack @opum-ai/lore@<RC>` serves; default the artifact's rc. "fail" throws. */
  servedRc?: Buffer | "fail";
  /** @opum-ai/lore@V already on npm as these bytes (a resume), or unreadable. */
  xPublished?: Buffer | "unreadable";
  /** npm serves this integrity for X after the publish (step 7's mismatch). */
  publishedIntegrity?: string;
  failAdd?: string;
  failAfterApply?: string;
  failRestore?: string;
  failPublish?: boolean;
  failPublishAfterApply?: boolean;
  questLatest?: string | null;
  readme?: string | "fail";
  onAdd?: () => void;
  /** Runs once, when the LAST platform's latest move to V lands. */
  afterPlatforms?: (w: World) => void;
};

type World = ReturnType<typeof world>;

/**
 * An in-memory GitHub + registry behind one runner. `calls` records every argv; `writes` records
 * every registry write, dist-tag moves and publishes alike, in order.
 */
function world(options: WorldOptions = {}) {
  const tags: Record<string, Record<string, string>> = {};
  for (const name of RELEASE_PACKAGES)
    tags[name] = {
      latest: PRIOR,
      "release-candidate": name === LAUNCHER ? RC : V,
      ...(options.tags?.[name] ?? {}),
    };
  const calls: string[][] = [];
  const writes: string[] = [];
  /** Every registry write must name the public registry (review F6); recorded without the flag. */
  const unpinned: string[] = [];
  const write = (args: string[]) => {
    if (!args.includes(`--registry=${REGISTRY}`)) unpinned.push(args.join(" "));
    writes.push(args.filter((a) => a !== `--registry=${REGISTRY}`).join(" "));
  };
  const envs: Array<Record<string, string | undefined>> = [];
  const files = artifact();
  options.artifact?.(files);
  const commit = "tagCommit" in options ? options.tagCommit : COMMIT;
  const receipt = "receipt" in options ? options.receipt : goodReceipt(commit ?? COMMIT);
  const pass1 =
    "pass1" in options
      ? typeof options.pass1 === "function"
        ? (options.pass1 as (f: Map<string, Buffer>) => unknown)(files)
        : options.pass1
      : goodPass1(files, commit ?? COMMIT);
  const state: {
    servedRc: Buffer | "fail";
    xPublished: Buffer | "unreadable" | null;
    downloadDir: string | null;
    platformsMoved: number;
  } = {
    servedRc: options.servedRc ?? (files.get(RC_FILE) as Buffer),
    xPublished: options.xPublished ?? null,
    downloadDir: null,
    platformsMoved: 0,
  };
  const self = {
    run: async (command: string, args: string[], opts: Record<string, unknown> = {}) => {
      calls.push([command, ...args]);
      const line = [command, ...args].join(" ");
      if (command === "security") throw Object.assign(new Error("no keychain item"), { code: 44 });
      const receiptAt = (path: string) =>
        `gh api --hostname github.com -H Accept: application/vnd.github.raw repos/opum-ai/opum-cli-e2e/contents/${path}?ref=main`;
      const serve = (doc: unknown) => {
        if (doc === undefined) throw Object.assign(new Error("Command failed"), { stderr: "gh: Not Found (HTTP 404)" });
        return { stdout: typeof doc === "string" ? doc : JSON.stringify(doc) };
      };
      if (command === "gh" && line === receiptAt(`receipts/pair/${V}.json`)) return serve(receipt);
      if (command === "gh" && line === receiptAt(`receipts/lore/${V}.json`)) return serve(pass1);
      // lore's release tags are ANNOTATED: the ref names a tag object, which names the commit.
      if (command === "gh" && line === `gh api --hostname github.com repos/opum-ai/lore-cli/${GIT}/ref/tags/v${V}`) {
        if (commit === null) throw Object.assign(new Error("Command failed"), { stderr: "gh: Not Found (HTTP 404)" });
        return { stdout: JSON.stringify({ ref: `refs/tags/v${V}`, object: { type: "tag", sha: TAG_OBJECT } }) };
      }
      if (command === "gh" && line === `gh api --hostname github.com repos/opum-ai/lore-cli/${GIT}/tags/${TAG_OBJECT}`)
        return { stdout: JSON.stringify({ sha: TAG_OBJECT, object: { type: "commit", sha: commit } }) };
      if (command === "gh" && line === `gh ${releaseRunReadArgs(RUN).join(" ")}`)
        return {
          stdout: JSON.stringify({
            id: Number(RUN),
            path: ".github/workflows/release.yml",
            head_sha: commit,
            conclusion: "success",
            event: "workflow_dispatch",
            head_repository: { full_name: "opum-ai/lore-cli" },
            ...(options.run ?? {}),
          }),
        };
      if (command === "gh" && args[0] === "run" && args[1] === "download") {
        const dir = args[args.length - 1] as string;
        expect(args).toEqual(artifactDownloadArgs(RUN, dir));
        if (options.downloadFails) throw Object.assign(new Error("Command failed"), { stderr: "no artifact matches" });
        state.downloadDir = dir;
        for (const [name, bytes] of files) writeFileSync(join(dir, name), bytes);
        return { stdout: "" };
      }
      if (command === "npm" && args[0] === "view" && args[1] === "@opum-ai/quest" && args[2] === "dist-tags") {
        const questLatest = "questLatest" in options ? options.questLatest : V;
        if (questLatest === null) throw new Error("E503 registry unreachable");
        return { stdout: JSON.stringify([{ latest: questLatest, "release-candidate": V }]) };
      }
      if (command === "npm" && args[0] === "view" && args[2] === "dist-tags") {
        const t = tags[args[1] as string];
        if (!t) throw new Error("E404");
        return { stdout: JSON.stringify([t]) };
      }
      if (command === "npm" && args[0] === "view" && args[2] === "readme") {
        if (options.readme === "fail") throw new Error("E503 registry unreachable");
        const text = options.readme ?? "# lore\n\nThe README.\n";
        return { stdout: text ? `${text}\n` : "" };
      }
      if (command === "npm" && args[0] === "view" && args[2] === "--json") {
        // Every version read is ANONYMOUS against the public registry (review F6), the pair
        // receipt's observeRelease as much as probeVersion.
        expect(args.slice(3)).toEqual(["--prefer-online", `--userconfig=${devNull}`, `--registry=${REGISTRY}`]);
      }
      if (command === "npm" && args[0] === "view" && args[2] === "--json" && args[1] === `${LAUNCHER}@${V}`) {
        // probeVersion: the X launcher, the only version this script ever reads at X for the launcher.
        if (state.xPublished === "unreadable") throw new Error("ETIMEDOUT reading the registry");
        if (state.xPublished === null)
          throw Object.assign(new Error("Command failed: npm view"), {
            stderr: `npm error code E404\nnpm error 404 No match found for version ${V}`,
            stdout: JSON.stringify({ error: { code: "E404" } }),
          });
        const served = options.publishedIntegrity ?? sri(state.xPublished);
        return { stdout: JSON.stringify([{ name: LAUNCHER, version: V, dist: { integrity: served } }]) };
      }
      if (command === "npm" && args[0] === "view" && args[2] === "--json") {
        // observeRelease: the staged versions, platforms at V and the launcher at RC.
        const spec = args[1] as string;
        const at = spec.lastIndexOf("@");
        const name = spec.slice(0, at);
        const version = spec.slice(at + 1);
        return {
          stdout: JSON.stringify([{ name, version, dist: { integrity: integrity(tarballName(name, version)) } }]),
        };
      }
      if (command === "npm" && args[0] === "pack") {
        expect(args[1]).toBe(`${LAUNCHER}@${RC}`);
        if (state.servedRc === "fail")
          throw Object.assign(new Error("Command failed"), { stderr: "npm error E404\nmore" });
        const into = args[3] as string;
        writeFileSync(join(into, RC_FILE), state.servedRc);
        // npm 12.1.0's real shape: an object keyed by package name (measured against the registry).
        return { stdout: JSON.stringify({ [LAUNCHER]: { id: `${LAUNCHER}@${RC}`, filename: RC_FILE } }) };
      }
      if (command === "npm" && args[0] === "publish") {
        write(args);
        envs.push((opts.env ?? {}) as Record<string, string | undefined>);
        if (options.failPublish) throw new Error("E403 Forbidden");
        state.xPublished = readFileSync(args[1] as string);
        (tags[LAUNCHER] as Record<string, string>).latest = V;
        if (options.failPublishAfterApply) throw new Error("ETIMEDOUT (the registry applied the publish)");
        return { stdout: `+ ${LAUNCHER}@${V}` };
      }
      if (command === "npm" && args[0] === "dist-tag" && args[1] === "add") {
        options.onAdd?.();
        const spec = args[2] as string;
        const at = spec.lastIndexOf("@");
        const name = spec.slice(0, at);
        write(args);
        envs.push((opts.env ?? {}) as Record<string, string | undefined>);
        if (options.failAdd === name && spec.endsWith(`@${V}`)) throw new Error("E403 Forbidden");
        if (options.failRestore === name && !spec.endsWith(`@${V}`)) throw new Error("ETIMEDOUT restoring");
        (tags[name] as Record<string, string>)[args[3] as string] = spec.slice(at + 1);
        if (options.failAfterApply === name && spec.endsWith(`@${V}`))
          throw new Error("ETIMEDOUT (the registry applied the write; the client never heard back)");
        if (name !== LAUNCHER && spec.endsWith(`@${V}`) && ++state.platformsMoved === PLATFORMS.length)
          options.afterPlatforms?.(self);
        return { stdout: "" };
      }
      throw new Error(`unexpected command in test: ${line}`);
    },
    tags,
    calls,
    writes,
    unpinned,
    envs,
    files,
    state,
  };
  return self;
}

function harness() {
  const dir = mkdtempSync(resolve(tmpdir(), "lore-promote-"));
  const record = join(dir, "promotion-record.json");
  const out: string[] = [];
  const err: string[] = [];
  const go = (argv: string[], w: World, env: Record<string, string | undefined> = { NPM_TOKEN: "" }) =>
    main(argv.includes("--rollback") || argv.includes("--release-run") ? argv : [...argv, "--release-run", RUN], {
      run: w.run,
      env,
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      readPackageVersion: async () => V,
      verifyOptions: FAST,
    });
  return {
    dir,
    record,
    out,
    err,
    go,
    text: () => [...out, ...err].join("\n"),
    readRecord: () => JSON.parse(readFileSync(record, "utf8")) as PromotionRecord,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const platformMoves = (target: string) => PLATFORM_PACKAGES.map((name) => `dist-tag add ${name}@${target} latest`);
const publishLine = (w: World) => `publish ${join(w.state.downloadDir as string, X_FILE)} --tag latest`;

describe("scripts/promote-latest.mjs: the clean case (LCLI-621)", () => {
  test("--promote records every prior latest first, moves six platforms by dist-tag, then publishes X --tag latest LAST", async () => {
    const h = harness();
    const seen: { recordAtFirstWrite: boolean | null } = { recordAtFirstWrite: null };
    const w = world({
      onAdd: () => {
        seen.recordAtFirstWrite ??= existsSync(h.record);
      },
    });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(0);
      expect(seen.recordAtFirstWrite).toBe(true);
      // Exactly one publish, the X launcher from the artifact, with --tag latest, after all six moves.
      expect(w.writes).toEqual([...platformMoves(V), publishLine(w)]);
      expect(w.writes.filter((line) => line.startsWith("publish "))).toEqual([publishLine(w)]);
      // Every write, six dist-tag moves and the publish, named the public registry (review F6).
      expect(w.unpinned).toEqual([]);
      // The bytes npm now holds for X are the artifact's X launcher, not a repack.
      expect(sha256(w.state.xPublished as Buffer)).toBe(sha256(w.files.get(X_FILE) as Buffer));
      const record = h.readRecord();
      expect(record.kind).toBe(RECORD_KIND);
      expect(record.version).toBe(V);
      expect(record.launcherVersion).toBe(RC);
      expect(record.releaseRunId).toBe(RUN);
      // Seven priors, the launcher's included, so a rollback can restore it by dist-tag.
      expect(record.packages).toEqual(RELEASE_PACKAGES.map((name) => ({ name, priorLatest: PRIOR })));
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(V);
      for (const name of RELEASE_PACKAGES) expect(h.out).toContain(`  ${name}  ${PRIOR}`);
      expect(h.text()).toContain(
        `Pair receipt opum-ai/opum-cli-e2e@main:receipts/pair/${V}.json qualifies lore ${V} with quest ${V}`,
      );
      expect(h.text()).toContain(`Pass-1 receipt opum-ai/opum-cli-e2e@main:receipts/lore/${V}.json binds run ${RUN}`);
      expect(h.text()).toContain(
        `Promoted: latest reads ${V} on all 7 packages, and npm serves ${LAUNCHER}@${V} as ${X_FILE}`,
      );
      // Step 6 ran twice: before any move, and again after the platforms, before the publish.
      const packs = w.calls.filter((c) => c[0] === "npm" && c[1] === "pack");
      expect(packs.length).toBe(2);
      const firstPack = w.calls.findIndex((c) => c[0] === "npm" && c[1] === "pack");
      const lastPack = w.calls.findLastIndex((c) => c[0] === "npm" && c[1] === "pack");
      const firstMove = w.calls.findIndex((c) => c[1] === "dist-tag");
      const lastPlatformMove = w.calls.findLastIndex((c) => c[1] === "dist-tag");
      const publish = w.calls.findIndex((c) => c[1] === "publish");
      expect(firstPack).toBeLessThan(firstMove);
      expect(lastPlatformMove).toBeLessThan(lastPack);
      expect(lastPack).toBeLessThan(publish);
      // OPAG-474 AC3: the readme's byte count is read back and printed.
      expect(h.text()).toContain(
        `npm's package-level readme for ${LAUNCHER} is ${Buffer.byteLength("# lore\n\nThe README.\n")} bytes`,
      );
    } finally {
      h.cleanup();
    }
  });

  test("--dry-run reads everything, runs step 6 once, prints the record and each move, and writes NOTHING", async () => {
    const h = harness();
    const w = world();
    try {
      expect(await h.go(["--record", h.record, "--dry-run"], w)).toBe(0);
      expect(w.writes).toEqual([]);
      expect(existsSync(h.record)).toBe(false);
      for (const name of PLATFORM_PACKAGES)
        expect(h.out.join("\n")).toContain(
          `would    npm dist-tag add ${name}@${V} latest --registry=${REGISTRY}   (now ${PRIOR})`,
        );
      expect(h.out.join("\n")).toContain(
        `would    npm publish ${join(w.state.downloadDir as string, X_FILE)} --tag latest --registry=${REGISTRY}`,
      );
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(h.text()).toContain('"priorLatest": "5.6.6"');
      expect(h.text()).toContain("Dry run only: nothing was written, published or tag-moved.");
      expect(w.calls.filter((c) => c[1] === "pack").length).toBe(1);
      // No credential is even looked up.
      expect(w.calls.some((c) => c[0] === "security")).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  test("an override on the pair receipt proceeds and prints the override verbatim", async () => {
    const h = harness();
    const receipt = goodReceipt();
    receipt.verdict = "NOT QUALIFIED";
    receipt.override = { by: "op", reason: "unbound row", task: "TASK-9", adr: "docs/adr/x.md@abc" };
    try {
      expect(await h.go(["--record", h.record, "--dry-run"], world({ receipt }))).toBe(0);
      expect(h.text()).toContain("!!! QUALIFICATION OVERRIDE IN USE !!!");
      expect(h.text()).toContain('"reason": "unbound row"');
    } finally {
      h.cleanup();
    }
  });

  test("the artifact is downloaded afresh into a private directory, which is removed on exit", async () => {
    const h = harness();
    const w = world();
    try {
      expect(await h.go(["--record", h.record, "--dry-run"], w)).toBe(0);
      expect(w.state.downloadDir).not.toBeNull();
      expect(existsSync(w.state.downloadDir as string)).toBe(false);
    } finally {
      h.cleanup();
    }
  });
});

/** Every refusal below: exit 1, no record written, nothing written to the registry, no credential read. */
function expectRefusedBeforeAnyWrite(h: ReturnType<typeof harness>, w: World) {
  expect(w.writes).toEqual([]);
  expect(existsSync(h.record)).toBe(false);
  expect(w.calls.some((c) => c[0] === "security")).toBe(false);
}

function refusalSuite(title: string, header: string, cases: Array<[string, WorldOptions, string]>) {
  describe(title, () => {
    for (const [label, options, reason] of cases) {
      for (const mode of ["--promote", "--dry-run"] as const) {
        test(`${label} (${mode}): exit 1, no record, no write`, async () => {
          const h = harness();
          const w = world(options);
          try {
            expect(await h.go(["--record", h.record, mode], w)).toBe(1);
            expect(h.err.join("\n")).toContain(header);
            expect(h.err.join("\n")).toContain(reason);
            expectRefusedBeforeAnyWrite(h, w);
          } finally {
            h.cleanup();
          }
        });
      }
    }
  });
}

const edit = (name: string, change: (bytes: Buffer) => Buffer) => (files: Map<string, Buffer>) =>
  files.set(name, change(files.get(name) as Buffer));

refusalSuite("scripts/promote-latest.mjs: the tag and the Release run (LCLI-621)", `Refusing to promote ${V}`, [
  ["no v<version> tag", { tagCommit: null }, `refs/tags/v${V} could not be read (gh: Not Found (HTTP 404))`],
  [
    "a run of another workflow",
    { run: { path: ".github/workflows/ci.yml" } },
    `run ${RUN} is ".github/workflows/ci.yml", not .github/workflows/release.yml`,
  ],
  ["a run of another commit", { run: { head_sha: "e".repeat(40) } }, `but the tag peels to ${COMMIT}`],
  ["a run that did not succeed", { run: { conclusion: "failure" } }, `run ${RUN} concluded "failure", not "success"`],
  ["a run not dispatched", { run: { event: "push" } }, `run ${RUN} was triggered by "push", not "workflow_dispatch"`],
  [
    "a run built from a fork",
    { run: { head_repository: { full_name: "fork/lore-cli" } } },
    `run ${RUN} built "fork/lore-cli"'s code, not opum-ai/lore-cli's`,
  ],
  ["an artifact that cannot be downloaded", { downloadFails: true }, "artifact of run 4242 could not be downloaded"],
]);

refusalSuite(
  "scripts/promote-latest.mjs: the artifact must be the eight tarballs of this release (LCLI-621)",
  `the npm-packages artifact of run ${RUN} is not a lore ${V} release`,
  [
    ["no X launcher carried", { artifact: (f) => f.delete(X_FILE) }, `the artifact is missing ${X_FILE}`],
    [
      "an EMPTY download (distinguishable from an old seven-tarball artifact)",
      { artifact: (f) => f.clear() },
      "and holds 0; it holds 0 tarball(s) in all: []",
    ],
    [
      "an old seven-tarball artifact with no rc launcher",
      { artifact: (f) => f.delete(RC_FILE) },
      `it holds 7 tarball(s) in all: ["${X_FILE}",`,
    ],
    [
      "two rc launchers",
      { artifact: (f) => f.set(`opum-ai-lore-${V}-rc.3.tgz`, launcher(`${V}-rc.3`)) },
      "must hold exactly one launcher",
    ],
    [
      "an rc with a leading-zero N",
      {
        artifact: (f) => {
          f.set(`opum-ai-lore-${V}-rc.02.tgz`, f.get(RC_FILE) as Buffer);
          f.delete(RC_FILE);
        },
      },
      `opum-ai-lore-${V}-rc.02.tgz does not name a launcher ${V}-rc.<N>`,
    ],
    [
      "a platform missing",
      { artifact: (f) => f.delete(`opum-ai-lore-win32-x64-${V}.tgz`) },
      `the artifact is missing opum-ai-lore-win32-x64-${V}.tgz`,
    ],
    [
      "an extra tarball",
      { artifact: (f) => f.set(`opum-ai-lore-freebsd-x64-${V}.tgz`, Buffer.from("x")) },
      `the artifact carries opum-ai-lore-freebsd-x64-${V}.tgz`,
    ],
    [
      "an X launcher that differs from the rc beyond the version",
      { artifact: edit(X_FILE, () => launcher(V, "an extra line\n")) },
      "launcher equivalence (artifact): package/README.md: content differs beyond",
    ],
  ],
);

type Pass1Doc = {
  commit: string;
  releaseRunId: number;
  tarballs: Record<string, string>;
  launcherVersion?: string;
  launcherSubstitution: { verdict: string; finalTarball: { filename: string; sha256: string } };
};

/** A pass-1 receipt built from the files, then edited. */
const pass1With = (change: (r: Pass1Doc) => void) => (files: Map<string, Buffer>) => {
  const r = goodPass1(files) as unknown as Pass1Doc;
  change(r);
  return r;
};

refusalSuite(
  "scripts/promote-latest.mjs: the pass-1 receipt binds the artifact (LCLI-621)",
  `Refusing to promote ${V}`,
  [
    [
      "no pass-1 receipt (404)",
      { pass1: undefined },
      `no opum-cli-e2e qualification receipt at opum-ai/opum-cli-e2e@main:receipts/lore/${V}.json`,
    ],
    [
      "a commit the tag does not peel to",
      { pass1: pass1With((r) => (r.commit = "e".repeat(40))) },
      `but v${V} peels to "${COMMIT}"`,
    ],
    ["another run", { pass1: pass1With((r) => (r.releaseRunId = 1)) }, `releaseRunId is 1, not ${RUN}`],
    [
      "a staged digest that is not the artifact's",
      { pass1: pass1With((r) => (r.tarballs[RC_FILE] = "0".repeat(64))) },
      `sha256 MISMATCH for ${RC_FILE}`,
    ],
    [
      "no launcherVersion (a pre-amendment receipt)",
      { pass1: pass1With((r) => delete r.launcherVersion) },
      `launcherVersion is undefined, not ${V}-rc.<N>`,
    ],
    [
      "a launcherVersion that is not the artifact's rc",
      { pass1: pass1With((r) => (r.launcherVersion = `${V}-rc.1`)) },
      `launcherVersion is ${V}-rc.1, but the artifact stages the launcher as ${RC}`,
    ],
    [
      "a malformed launcherVersion",
      { pass1: pass1With((r) => (r.launcherVersion = `${V}-rc.0`)) },
      `launcherVersion is "${V}-rc.0", not ${V}-rc.<N>`,
    ],
    [
      "an EIGHT-entry receipt: the X launcher named in tarballs, even at its true digest (e0021c7)",
      {
        pass1: pass1With((r) => {
          r.tarballs[X_FILE] = r.launcherSubstitution.finalTarball.sha256;
        }),
      },
      `tarballs names "${X_FILE}", the built ${V} launcher; a pass-1 receipt's tarballs holds exactly the seven staged packages`,
    ],
    [
      "a MISMATCH launcherSubstitution beside a complete override (no override path for it)",
      {
        pass1: pass1With((r) => {
          r.launcherSubstitution.verdict = "MISMATCH";
          Object.assign(r, {
            verdict: "NOT QUALIFIED",
            override: { by: "op", reason: "r", task: "T-1", adr: "docs/adr/x.md@abc" },
          });
        }),
      },
      'launcherSubstitution.verdict is "MISMATCH", not "MATCH"',
    ],
    [
      "a MISMATCH launcherSubstitution",
      { pass1: pass1With((r) => (r.launcherSubstitution.verdict = "MISMATCH")) },
      'launcherSubstitution.verdict is "MISMATCH", not "MATCH"',
    ],
    [
      "a finalTarball that is a path, not the basename",
      { pass1: pass1With((r) => (r.launcherSubstitution.finalTarball.filename = `final/${X_FILE}`)) },
      `not the basename "${X_FILE}"`,
    ],
    [
      "a finalTarball sha256 that is not the artifact's X launcher",
      { pass1: pass1With((r) => (r.launcherSubstitution.finalTarball.sha256 = "9".repeat(64))) },
      `launcherSubstitution.finalTarball.sha256 is "${"9".repeat(64)}"`,
    ],
  ],
);

refusalSuite(
  "scripts/promote-latest.mjs refuses without a verifying pair receipt",
  `Refusing to promote ${V}: no opum-cli-e2e pair receipt qualifies`,
  [
    [
      "no receipt (404)",
      { receipt: undefined },
      "no opum-cli-e2e pair receipt at opum-ai/opum-cli-e2e@main:receipts/pair/5.6.7.json (gh: Not Found (HTTP 404))",
    ],
    ["a malformed receipt", { receipt: "{ nope" }, "no opum-cli-e2e pair receipt at"],
    [
      "step 1: an unknown kind",
      { receipt: { ...goodReceipt(), kind: "opum.qualification-receipt.v1" } },
      "kind must be opum.pair-qualification-receipt.v1",
    ],
    [
      "step 2: NOT QUALIFIED, no override",
      { receipt: { ...goodReceipt(), verdict: "NOT QUALIFIED" } },
      'verdict is "NOT QUALIFIED"',
    ],
    [
      "step 2: a partial override",
      { receipt: { ...goodReceipt(), verdict: "NOT QUALIFIED", override: { by: "x", reason: "y" } } },
      "missing or empty: task, adr",
    ],
    [
      "step 3: another lore version",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { lore: Record<string, unknown> } };
          r.pair.lore.version = "5.6.6";
          return r;
        })(),
      },
      'pair.lore.version is "5.6.6"',
    ],
    [
      "step 3: another quest version (a different pairing)",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { quest: Record<string, unknown> } };
          r.pair.quest.version = "5.6.8";
          return r;
        })(),
      },
      'pair.quest.version is "5.6.8"',
    ],
    ["step 3: a commit the tag does not peel to", { receipt: goodReceipt("e".repeat(40)) }, `resolves to "${COMMIT}"`],
    [
      "installedFrom not the registry",
      { receipt: { ...goodReceipt(), installedFrom: { lore: { source: "candidate" } } } },
      'installedFrom.lore.source is "candidate"',
    ],
    [
      "step 4: a missing platform archive",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { lore: { tarballs: Record<string, unknown> } } };
          delete r.pair.lore.tarballs[`opum-ai-lore-linux-x64-${V}.tgz`];
          return r;
        })(),
      },
      `opum-ai-lore-linux-x64-${V}.tgz: not in the pair receipt`,
    ],
    [
      "step 4: a digest npm does not serve",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { lore: { tarballs: Record<string, unknown> } } };
          r.pair.lore.tarballs[`opum-ai-lore-linux-arm64-${V}.tgz`] = { distIntegrity: "sha512-else" };
          return r;
        })(),
      },
      "qualified sha512-else, npm serves",
    ],
    [
      "step 5: no launcherVersion (a pre-amendment receipt)",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { lore: Record<string, unknown> } };
          delete r.pair.lore.launcherVersion;
          return r;
        })(),
      },
      `pair.lore.launcherVersion is undefined, not ${V}-rc.<N>`,
    ],
    [
      "step 5: a launcherVersion that is not the artifact's rc",
      {
        receipt: (() => {
          const r = goodReceipt() as {
            pair: { lore: { launcherVersion?: string; tarballs: Record<string, unknown> } };
          };
          r.pair.lore.launcherVersion = `${V}-rc.1`;
          const rc1 = `opum-ai-lore-${V}-rc.1.tgz`;
          r.pair.lore.tarballs[rc1] = { distIntegrity: integrity(rc1) };
          delete r.pair.lore.tarballs[RC_FILE];
          return r;
        })(),
      },
      `pair.lore.launcherVersion is ${V}-rc.1, but the Release run's artifact stages the launcher as "${RC}"`,
    ],
  ],
);

refusalSuite(
  "scripts/promote-latest.mjs: step 6 before anything moves (LCLI-621)",
  `Refusing to promote ${V}: the ${V} launcher is not the rc npm serves with only its version substituted`,
  [
    [
      "npm serves the rc as other bytes than the artifact's",
      { servedRc: launcher(RC, "restaged\n") },
      `npm serves ${LAUNCHER}@${RC} as sha256`,
    ],
    [
      "the served rc cannot be downloaded",
      { servedRc: "fail" },
      `${LAUNCHER}@${RC} could not be downloaded from the registry (npm error E404)`,
    ],
    // Step 6 is a live computation, not a receipt field: overrides on BOTH receipts waive nothing
    // there (opum-cli-e2e receipts/README.md at e0021c7, reader step 6).
    [
      "a served rc of other bytes while BOTH receipts carry complete overrides",
      {
        servedRc: launcher(RC, "restaged\n"),
        receipt: {
          ...goodReceipt(),
          verdict: "NOT QUALIFIED",
          override: { by: "op", reason: "r", task: "T-1", adr: "docs/adr/x.md@abc" },
        },
        pass1: pass1With((r) =>
          Object.assign(r, {
            verdict: "NOT QUALIFIED",
            override: { by: "op", reason: "r", task: "T-1", adr: "docs/adr/x.md@abc" },
          }),
        ),
      },
      `npm serves ${LAUNCHER}@${RC} as sha256`,
    ],
    // Equivalent entries at another gzip level: only the sha256 identity clause can see this.
    [
      "npm serves a REPACK of the rc (same entries, other bytes)",
      { servedRc: launcher(RC, "", 1) },
      `npm serves ${LAUNCHER}@${RC} as sha256`,
    ],
  ],
);

describe("scripts/promote-latest.mjs: X already on npm (a resume, LCLI-621)", () => {
  test("X on npm as exactly the artifact's bytes: the tag moves, nothing is republished", async () => {
    const h = harness();
    const w = world({ xPublished: artifact().get(X_FILE) as Buffer });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(0);
      expect(w.writes).toEqual([...platformMoves(V), `dist-tag add ${LAUNCHER}@${V} latest`]);
      expect(h.text()).toContain("already on npm as the artifact's bytes; tag moved");
    } finally {
      h.cleanup();
    }
  });

  for (const mode of ["--promote", "--dry-run"] as const) {
    test(`X on npm as OTHER bytes refuses before anything moves (${mode})`, async () => {
      const h = harness();
      const w = world({ xPublished: launcher(V, "someone else's\n") });
      try {
        expect(await h.go(["--record", h.record, mode], w)).toBe(1);
        expect(h.err.join("\n")).toContain(`${LAUNCHER}@${V} is already on the registry as sha512-`);
        expect(h.err.join("\n")).toContain("this needs a new version, not a rerun. Do NOT run npm unpublish.");
        expectRefusedBeforeAnyWrite(h, w);
      } finally {
        h.cleanup();
      }
    });
  }

  test("an unreadable registry is not read as 'X is absent': it refuses before anything moves", async () => {
    const h = harness();
    const w = world({ xPublished: "unreadable" });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(h.err.join("\n")).toContain(`npm view ${LAUNCHER}@${V} failed with something other than npm's not-found`);
      expectRefusedBeforeAnyWrite(h, w);
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: step 6 re-runs after the platform move (LCLI-621)", () => {
  test("npm serving another rc by then: no publish, and every moved latest is restored, the launcher's included", async () => {
    const h = harness();
    const w = world({
      afterPlatforms: (self) => {
        self.state.servedRc = launcher(RC, "swapped after the platforms moved\n");
      },
    });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(w.writes.some((line) => line.startsWith("publish "))).toBe(false);
      expect(w.writes).toEqual([
        ...platformMoves(V),
        ...platformMoves(PRIOR),
        `dist-tag add ${LAUNCHER}@${PRIOR} latest`,
      ]);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(h.err.join("\n")).toContain(`PROMOTION FAILED at ${LAUNCHER}`);
      expect(h.text()).toContain("step 6 no longer holds against the registry");
      expect(h.err.join("\n")).toContain("Nothing was unpublished.");
    } finally {
      h.cleanup();
    }
  });

  test("the X tarball REPACKED on disk by then: equivalent entries, but not the receipt's finalTarball bytes, so no publish", async () => {
    const h = harness();
    const repacked = launcher(V, "", 1);
    // The repack changes only the bytes, never an entry: the equivalence gate alone would pass it.
    expect(sha256(repacked)).not.toBe(sha256(launcher(V)));
    const w = world({
      afterPlatforms: (self) => {
        writeFileSync(join(self.state.downloadDir as string, X_FILE), repacked);
      },
    });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(w.writes.some((line) => line.startsWith("publish "))).toBe(false);
      expect(h.text()).toContain(`${X_FILE} hashes to sha256`);
      expect(h.text()).toContain("the pass-1 receipt's launcherSubstitution.finalTarball.sha256 is");
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: step 7 and the readme read-back (LCLI-621)", () => {
  test("npm serving X as other bytes after the publish fails, without rolling back or unpublishing", async () => {
    const h = harness();
    const w = world({ publishedIntegrity: "sha512-somethingelse" });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(h.err.join("\n")).toContain(
        `${LAUNCHER}@${V}: npm serves sha512-somethingelse, the artifact's ${X_FILE} is sha512-`,
      );
      expect(h.err.join("\n")).toContain("Do NOT run npm unpublish.");
      // Review F5: a step-7 failure restores nothing by itself, and names the rollback as the remedy.
      expect(h.err.join("\n")).toContain(`node scripts/promote-latest.mjs --rollback ${h.record}`);
      expect(h.err.join("\n")).toContain(
        "restore every latest with `node scripts/promote-latest.mjs --rollback <record>`",
      );
      expect(w.writes).toEqual([...platformMoves(V), publishLine(w)]);
    } finally {
      h.cleanup();
    }
  });

  test("a 0-byte readme WARNS loudly and names the re-measure command, but the verified promotion exits 0", async () => {
    const h = harness();
    const w = world({ readme: "" });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(0);
      const errText = h.err.join("\n");
      expect(errText).toContain("!!! WARNING: npm SERVES NO README FOR THE LAUNCHER YET (OPAG-474 AC3) !!!");
      expect(errText).toContain(`npm's package-level readme for ${LAUNCHER} is 0 bytes after 1 read(s).`);
      expect(errText).toContain(`npm view ${LAUNCHER} readme | wc -c`);
      expect(errText).toContain("do NOT roll back or unpublish for this");
      expect(w.calls).toContainEqual([
        "npm",
        "view",
        LAUNCHER,
        "readme",
        "--prefer-online",
        `--userconfig=${devNull}`,
        "--registry=https://registry.npmjs.org/",
      ]);
    } finally {
      h.cleanup();
    }
  });

  test("an unreadable readme is reported as unreadable, never as 0 bytes", async () => {
    const h = harness();
    const w = world({ readme: "fail" });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(0);
      expect(h.err.join("\n")).toContain("is unreadable (E503 registry unreachable)");
    } finally {
      h.cleanup();
    }
  });

  test("unit: readBackReadme re-reads through lag and stops at the first non-empty answer", async () => {
    const answers = ["", "", "# lore\n"];
    let reads = 0;
    const result = await readBackReadme({
      run: async () => ({ stdout: answers[reads++] ?? "" }),
      attempts: 5,
      sleep: async () => {},
    });
    expect(result).toEqual({ bytes: "# lore".length, attempts: 3 });
  });
});

describe("scripts/promote-latest.mjs: the staging precondition, the record, and rollback", () => {
  test("refuses unless ALL seven are staged: the platforms at X, the launcher at X-rc.N", async () => {
    for (const [name, rc, reason] of [
      ["@opum-ai/lore-win32-x64", "5.6.6", `@opum-ai/lore-win32-x64: release-candidate is "5.6.6", not ${V}`],
      [LAUNCHER, V, `${LAUNCHER}: release-candidate is "${V}", not ${RC}`],
      [LAUNCHER, `${V}-rc.1`, `${LAUNCHER}: release-candidate is "${V}-rc.1", not ${RC}`],
    ] as const) {
      const h = harness();
      const w = world({ tags: { [name]: { "release-candidate": rc } } });
      try {
        expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
        expect(h.err.join("\n")).toContain(`${reason}; stage it with scripts/publish-release.sh first`);
        expectRefusedBeforeAnyWrite(h, w);
      } finally {
        h.cleanup();
      }
    }
  });

  test("refuses to build a fresh record when latest already reads the version (a lost record)", async () => {
    const h = harness();
    const w = world({ tags: { [LAUNCHER]: { latest: V } } });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(h.err.join("\n")).toContain(
        "latest already reads 5.6.7; a new record would store that as the prior value",
      );
      expect(w.writes).toEqual([]);
    } finally {
      h.cleanup();
    }
  });

  test("a partial failure restores every tag this run moved, and says to retry at the SAME version", async () => {
    const h = harness();
    const w = world({ failAdd: "@opum-ai/lore-linux-arm64" });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(w.writes).toEqual([
        `dist-tag add @opum-ai/lore-darwin-arm64@${V} latest`,
        `dist-tag add @opum-ai/lore-darwin-x64@${V} latest`,
        `dist-tag add @opum-ai/lore-linux-arm64@${V} latest`,
        `dist-tag add @opum-ai/lore-darwin-arm64@${PRIOR} latest`,
        `dist-tag add @opum-ai/lore-darwin-x64@${PRIOR} latest`,
        // S2: the failed package is restored too; idempotent when its write did not land.
        `dist-tag add @opum-ai/lore-linux-arm64@${PRIOR} latest`,
      ]);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(h.err.join("\n")).toContain("PROMOTION FAILED at @opum-ai/lore-linux-arm64");
      expect(h.err.join("\n")).toContain("never skip to a different number (Article 3 clause 5)");
    } finally {
      h.cleanup();
    }
  });

  test("a failed launcher PUBLISH restores all six platforms AND the launcher's latest, by dist-tag", async () => {
    const h = harness();
    const w = world({ failPublishAfterApply: true });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(w.writes).toEqual([
        ...platformMoves(V),
        publishLine(w),
        ...platformMoves(PRIOR),
        `dist-tag add ${LAUNCHER}@${PRIOR} latest`,
      ]);
      // The publish landed before the client heard back; the launcher's latest is put back all the same.
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(h.err.join("\n")).toContain(`PROMOTION FAILED at ${LAUNCHER}`);
    } finally {
      h.cleanup();
    }
  });

  test("--rollback restores all seven by dist-tag, the launcher's included, needs no Release run, and is NOT gated on either receipt", async () => {
    const h = harness();
    const promoted = world();
    try {
      expect(await h.go(["--record", h.record, "--promote"], promoted)).toBe(0);
      const w = world({
        receipt: undefined,
        pass1: undefined,
        tags: Object.fromEntries(RELEASE_PACKAGES.map((n) => [n, { latest: V }])),
      });
      expect(await h.go(["--rollback", h.record], w)).toBe(0);
      expect(w.writes).toEqual(RELEASE_PACKAGES.map((name) => `dist-tag add ${name}@${PRIOR} latest`));
      expect(w.writes.at(-1)).toBe(`dist-tag add ${LAUNCHER}@${PRIOR} latest`);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(w.calls.some((c) => c.join(" ").includes("receipts/"))).toBe(false);
      expect(w.calls.some((c) => c[0] === "gh")).toBe(false);
      // Nothing is ever unpublished: no npm unpublish, and no publish, on the rollback path.
      expect(w.calls.some((c) => c[0] === "npm" && (c[1] === "unpublish" || c[1] === "publish"))).toBe(false);
      expect(h.text()).toContain("Nothing was unpublished.");
    } finally {
      h.cleanup();
    }
  });

  test("a rerun reuses the first run's record: prior values are never re-read after a partial move", async () => {
    const h = harness();
    try {
      expect(await h.go(["--record", h.record, "--promote"], world({ failPublish: true }))).toBe(1);
      const first = h.readRecord();
      // Simulate a crash that left two moved: a fresh read would record V as their "prior".
      const w = world({
        tags: { "@opum-ai/lore-darwin-arm64": { latest: V }, "@opum-ai/lore-darwin-x64": { latest: V } },
      });
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(0);
      expect(h.readRecord()).toEqual(first);
      expect(h.text()).toContain("prior values are NOT re-read");
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(V);
    } finally {
      h.cleanup();
    }
  });

  // Review F1: the invariant above only matters when the SECOND run rolls back, which the test above
  // never makes happen. Here it does: a rollback from a record rebuilt off the registry would put
  // the already-moved packages "back" to the new version.
  test("a rerun that ALSO fails rolls back to the FIRST run's priors, not to what the registry read then", async () => {
    const h = harness();
    try {
      expect(await h.go(["--record", h.record, "--promote"], world({ failPublish: true }))).toBe(1);
      const first = h.readRecord();
      // A crash left the first two platforms moved; this rerun then fails at the publish again.
      const moved = { latest: V };
      const w = world({
        failPublish: true,
        tags: { "@opum-ai/lore-darwin-arm64": moved, "@opum-ai/lore-darwin-x64": moved },
      });
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(h.readRecord()).toEqual(first);
      for (const [i, name] of RELEASE_PACKAGES.entries())
        expect([name, w.tags[name]?.latest ?? null]).toEqual([name, first.packages[i]?.priorLatest ?? null]);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
    } finally {
      h.cleanup();
    }
  });

  test("a record for another release is refused, not reused", async () => {
    const h = harness();
    try {
      writeFileSync(h.record, JSON.stringify({ kind: RECORD_KIND, version: "1.0.0", packages: [] }));
      expect(await h.go(["--record", h.record, "--promote"], world())).toBe(1);
      expect(h.err.join("\n")).toContain('record is for "1.0.0", the release is 5.6.7');
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: arguments and credentials", () => {
  test("says --dry-run or --promote, exactly one; --record and --release-run are required", async () => {
    const h = harness();
    try {
      await expect(h.go(["--record", h.record], world())).rejects.toThrow("exactly one");
      await expect(h.go(["--record", h.record, "--dry-run", "--promote"], world())).rejects.toThrow("exactly one");
      await expect(h.go(["--promote"], world())).rejects.toThrow("--record <path> is required");
      await expect(h.go(["--record", h.record, "--promote", "--force"], world())).rejects.toThrow(
        "unknown argument: --force",
      );
      const bare = world();
      await expect(
        main(["--record", h.record, "--promote"], { run: bare.run, readPackageVersion: async () => V }),
      ).rejects.toThrow("--release-run <id> is required");
      expect(bare.calls).toEqual([]);
      await expect(h.go(["--record", h.record, "--promote", "--release-run", "v1"], world())).rejects.toThrow(
        '--release-run must be a numeric run id, got "v1"',
      );
      await expect(h.go(["--rollback", h.record, "--release-run", RUN], world())).rejects.toThrow("stands alone");
    } finally {
      h.cleanup();
    }
  });

  test("a token goes to a private npmrc, only its shape is printed, and a bad shape moves nothing", async () => {
    const token = `npm_${"z".repeat(36)}`;
    const h = harness();
    const w = world();
    try {
      expect(await h.go(["--record", h.record, "--promote"], w, { NPM_TOKEN: token })).toBe(0);
      expect(h.text()).toContain("length=40 prefix=npm_ internal_whitespace=no");
      expect(h.text()).not.toContain(token);
      // Every write, the launcher publish included, used the private npmrc.
      expect(w.envs.length).toBe(RELEASE_PACKAGES.length);
      expect(w.envs.every((e) => typeof e.npm_config_userconfig === "string")).toBe(true);
      expect(existsSync(w.envs[0]?.npm_config_userconfig as string)).toBe(false);
    } finally {
      h.cleanup();
    }
    const h2 = harness();
    const w2 = world();
    try {
      await expect(h2.go(["--record", h2.record, "--promote"], w2, { NPM_TOKEN: "not-a-token" })).rejects.toThrow(
        "does not look like an npm token",
      );
      expect(w2.writes).toEqual([]);
      expect(tokenShape("npm_x y")).toEqual({ length: 7, prefix: "npm_", whitespace: true });
    } finally {
      h2.cleanup();
    }
  });

  test("with no token it uses ~/.npmrc and passes --otp to each move and to the publish", async () => {
    const h = harness();
    const w = world();
    try {
      expect(await h.go(["--record", h.record, "--promote", "--otp", "123456"], w)).toBe(0);
      expect(w.writes[0]).toBe(`dist-tag add @opum-ai/lore-darwin-arm64@${V} latest --otp 123456`);
      expect(w.writes.at(-1)).toBe(`${publishLine(w)} --otp 123456`);
    } finally {
      h.cleanup();
    }
  });

  test("downloadServedTarball reads npm 12's object answer and an older npm's array, and refuses anything else", async () => {
    const answer = (stdout: string) => async () => ({ stdout });
    const spec = `${LAUNCHER}@${RC}`;
    expect(
      await downloadServedTarball(spec, "/d", { run: answer(JSON.stringify({ [LAUNCHER]: { filename: RC_FILE } })) }),
    ).toBe(join("/d", RC_FILE));
    expect(await downloadServedTarball(spec, "/d", { run: answer(JSON.stringify([{ filename: RC_FILE }])) })).toBe(
      join("/d", RC_FILE),
    );
    for (const bad of [
      JSON.stringify({}),
      JSON.stringify([{ filename: RC_FILE }, { filename: X_FILE }]),
      JSON.stringify([{ filename: `../${RC_FILE}` }]),
      JSON.stringify([{}]),
    ])
      await expect(downloadServedTarball(spec, "/d", { run: answer(bad) })).rejects.toThrow(
        "reported no archive filename",
      );
  });

  test("launcherPublishArgs: the file, --tag latest, and nothing that stages", () => {
    expect(launcherPublishArgs("/a/opum-ai-lore-1.2.3.tgz")).toEqual([
      "publish",
      "/a/opum-ai-lore-1.2.3.tgz",
      "--tag",
      "latest",
      `--registry=${REGISTRY}`,
    ]);
    expect(launcherPublishArgs("/a/x.tgz", { otp: "1" })).toEqual([
      "publish",
      "/a/x.tgz",
      "--tag",
      "latest",
      `--registry=${REGISTRY}`,
      "--otp",
      "1",
    ]);
    expect(distTagAddArgs("@opum-ai/lore", "1.2.3", "latest")).toEqual([
      "dist-tag",
      "add",
      "@opum-ai/lore@1.2.3",
      "latest",
      `--registry=${REGISTRY}`,
    ]);
  });
});

describe("scripts/promote-latest.mjs: units", () => {
  test("checkReleaseRun: release.yml, the peeled commit, success, and the run asked for", () => {
    const good = {
      id: 7,
      path: ".github/workflows/release.yml",
      head_sha: COMMIT,
      conclusion: "success",
      event: "workflow_dispatch",
      head_repository: { full_name: "opum-ai/lore-cli" },
    };
    expect(checkReleaseRun(good, { runId: "7", commit: COMMIT })).toEqual([]);
    expect(checkReleaseRun({ ...good, id: 8 }, { runId: "7", commit: COMMIT })).toEqual([
      "the API answered for run 8, not 7",
    ]);
    // Review F8: dispatched, and built from this repository -- never a fork's head.
    expect(checkReleaseRun({ ...good, event: "pull_request" }, { runId: "7", commit: COMMIT })).toEqual([
      'run 7 was triggered by "pull_request", not "workflow_dispatch"',
    ]);
    expect(
      checkReleaseRun({ ...good, head_repository: { full_name: "someone/lore-cli" } }, { runId: "7", commit: COMMIT }),
    ).toEqual([`run 7 built "someone/lore-cli"'s code, not opum-ai/lore-cli's`]);
    expect(checkReleaseRun({ ...good, head_repository: undefined }, { runId: "7", commit: COMMIT })).toEqual([
      "run 7 built null's code, not opum-ai/lore-cli's",
    ]);
    expect(checkReleaseRun(null, { runId: "7", commit: COMMIT })).toEqual(["run 7 did not read as a workflow run"]);
  });

  test("publishFinalLauncher: step 6 first; a failed recheck neither publishes nor tags", async () => {
    const calls: string[] = [];
    const final = { filename: X_FILE, path: `/art/${X_FILE}`, sha256: "s", integrity: "sha512-final" };
    const go = (
      recheck: { ok: boolean; problems: string[] },
      probe: { state: "absent" } | { state: "present"; integrity: string | null },
    ) =>
      publishFinalLauncher({
        version: V,
        final,
        recheck: async () => {
          calls.push("recheck");
          return recheck;
        },
        publish: async (tarball) => {
          calls.push(`publish ${tarball}`);
        },
        setTag: async (name, version, tag) => {
          calls.push(`tag ${name}@${version} ${tag}`);
        },
        probe: async () => probe,
      });
    expect(await go({ ok: true, problems: [] }, { state: "absent" })).toBe(`published from ${X_FILE}`);
    expect(calls).toEqual(["recheck", `publish /art/${X_FILE}`]);
    calls.length = 0;
    await expect(go({ ok: false, problems: ["npm serves another rc"] }, { state: "absent" })).rejects.toThrow(
      "npm serves another rc",
    );
    expect(calls).toEqual(["recheck"]);
    calls.length = 0;
    await expect(go({ ok: true, problems: [] }, { state: "present", integrity: null })).rejects.toThrow(
      "could not be read; re-run the promotion at the same version",
    );
    expect(calls).toEqual(["recheck"]);
  });

  test("publishFinalLauncher: X already on npm as OTHER bytes at publish time throws, and neither tags nor publishes (review F3)", async () => {
    const calls: string[] = [];
    const final = { filename: X_FILE, path: `/art/${X_FILE}`, sha256: "s", integrity: "sha512-final" };
    await expect(
      publishFinalLauncher({
        version: V,
        final,
        recheck: async () => {
          calls.push("recheck");
          return { ok: true, problems: [] };
        },
        publish: async (tarball) => {
          calls.push(`publish ${tarball}`);
        },
        setTag: async (name, version, tag) => {
          calls.push(`tag ${name}@${version} ${tag}`);
        },
        probe: async () => ({ state: "present", integrity: "sha512-someone-else" }),
      }),
    ).rejects.toThrow(
      `${LAUNCHER}@${V} is already on the registry as sha512-someone-else, not the artifact's sha512-final; this needs a new version, not a rerun`,
    );
    expect(calls).toEqual(["recheck"]);
  });

  test("verifyFinalLauncher: lag is retried, a different integrity fails at once", async () => {
    const final = { filename: X_FILE, path: "/x", sha256: "s", integrity: "sha512-final" };
    let reads = 0;
    const lagging = await verifyFinalLauncher({
      version: V,
      final,
      attempts: 3,
      sleep: async () => {},
      probe: async () => {
        reads++;
        return reads < 3 ? { state: "absent" } : { state: "present", integrity: "sha512-final" };
      },
    });
    expect(lagging).toEqual({ ok: true, attempts: 3, problems: [] });
    reads = 0;
    const other = await verifyFinalLauncher({
      version: V,
      final,
      attempts: 3,
      sleep: async () => {},
      probe: async () => {
        reads++;
        return { state: "present", integrity: "sha512-other" };
      },
    });
    expect(reads).toBe(1);
    expect(other.ok).toBe(false);
  });

  test("checkServedLauncher: an X that differs from the SERVED rc beyond the version refuses, even when the digests hold", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "lore-served-"));
    try {
      const rcBytes = launcher(RC);
      const xBytes = launcher(V, "a banner\n");
      writeFileSync(join(dir, "x.tgz"), xBytes);
      const result = await checkServedLauncher({
        version: V,
        launcherVersion: RC,
        rc: { filename: RC_FILE, path: "/unused", sha256: sha256(rcBytes), integrity: "" },
        final: { filename: X_FILE, path: join(dir, "x.tgz"), sha256: sha256(xBytes), integrity: "" },
        finalSha256: sha256(xBytes),
        download: async (_spec, into) => {
          writeFileSync(join(into, RC_FILE), rcBytes);
          return join(into, RC_FILE);
        },
      });
      expect(result.ok).toBe(false);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]).toContain(
        `the served ${RC} and ${X_FILE} differ beyond the version string: package/README.md`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scripts/promote-latest.mjs as a command", () => {
  const describePosix = process.platform === "win32" ? describe.skip : describe;
  describePosix("with stubs on PATH", () => {
    test("the entrypoint wires the real runner: an unreadable tag refuses with exit 1 and moves nothing", () => {
      const dir = mkdtempSync(resolve(tmpdir(), "lore-promote-cli-"));
      try {
        const bin = join(dir, "bin");
        const log = join(dir, "npm.log");
        Bun.spawnSync({ cmd: ["mkdir", "-p", bin] });
        writeFileSync(
          join(bin, "npm"),
          `#!/usr/bin/env bash\necho "$*" >> "${log}"\ncase "$*" in *dist-tag\\ add*) exit 0 ;; *dist-tags*) echo '{"latest":"${PRIOR}","release-candidate":"${V}"}' ;; *) echo '{}' ;; esac\n`,
        );
        writeFileSync(join(bin, "gh"), "#!/usr/bin/env bash\necho 'gh: Not Found (HTTP 404)' >&2\nexit 1\n");
        writeFileSync(join(bin, "security"), "#!/usr/bin/env bash\nexit 44\n");
        Bun.spawnSync({ cmd: ["chmod", "+x", join(bin, "npm"), join(bin, "gh"), join(bin, "security")] });
        const r = Bun.spawnSync({
          cmd: [
            "node",
            join(import.meta.dir, "..", "scripts", "promote-latest.mjs"),
            "--record",
            join(dir, "rec.json"),
            "--promote",
            "--version",
            V,
            "--release-run",
            RUN,
          ],
          env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, NPM_TOKEN: "" },
        });
        expect(r.exitCode).toBe(1);
        expect(r.stderr.toString()).toContain("gh: Not Found (HTTP 404)");
        expect(existsSync(log) ? readFileSync(log, "utf8") : "").not.toContain("dist-tag add");
        expect(existsSync(log) ? readFileSync(log, "utf8") : "").not.toContain("publish");
        expect(existsSync(join(dir, "rec.json"))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("with no arguments it exits 2 and names what it needs", () => {
      const r = Bun.spawnSync({ cmd: ["node", join(import.meta.dir, "..", "scripts", "promote-latest.mjs")] });
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain("--record <path> is required");
    });
  });
});

// ── LCLI-613 adversarial review: S1-S4 and N4 ───────────────────────────────────────────────────
describe("scripts/promote-latest.mjs: --rollback moves latest only to what the record legitimately saw (review S1)", () => {
  function recordFile(h: ReturnType<typeof harness>, mutate: (r: PromotionRecord) => void = () => {}) {
    const record: PromotionRecord = {
      schemaVersion: 1,
      kind: RECORD_KIND,
      version: V,
      recordedAt: "2026-09-27T00:00:00.000Z",
      packages: RELEASE_PACKAGES.map((name) => ({ name, priorLatest: PRIOR })),
    };
    mutate(record);
    writeFileSync(h.record, JSON.stringify(record));
  }
  const promotedTags = () => Object.fromEntries(RELEASE_PACKAGES.map((n) => [n, { latest: V }]));

  for (const [label, prior, reason] of [
    ["a dist-tag NAME", "release-candidate", 'recorded prior latest "release-candidate" is not a plain X.Y.Z'],
    ["a v-prefixed tag", `v${PRIOR}`, `recorded prior latest "v${PRIOR}" is not a plain X.Y.Z`],
    // quest-cli's grammar (QCLI-390): no prerelease, so a staged candidate cannot be "restored" to.
    ["a PRERELEASE", `${PRIOR}-rc.1`, `recorded prior latest "${PRIOR}-rc.1" is not a plain X.Y.Z`],
    ["the release itself", V, "is the release itself"],
  ] as const) {
    test(`a hand-written record whose prior is ${label} is refused, and nothing moves`, async () => {
      const h = harness();
      const w = world({ receipt: undefined, tags: promotedTags() });
      try {
        recordFile(h, (r) => {
          (r.packages[3] as { priorLatest: string }).priorLatest = prior;
        });
        expect(await h.go(["--rollback", h.record], w)).toBe(1);
        expect(h.err.join("\n")).toContain(reason);
        expect(w.writes).toEqual([]);
      } finally {
        h.cleanup();
      }
    });
  }

  test("an OLD release's record, rolled back after a later promotion, refuses instead of downgrading", async () => {
    const h = harness();
    const w = world({
      receipt: undefined,
      tags: Object.fromEntries(RELEASE_PACKAGES.map((n) => [n, { latest: "5.6.8" }])),
    });
    try {
      recordFile(h);
      expect(await h.go(["--rollback", h.record], w)).toBe(1);
      expect(h.err.join("\n")).toContain(
        `@opum-ai/lore-darwin-arm64: latest reads "5.6.8", neither this record's release ${V} nor its recorded prior ${PRIOR}`,
      );
      expect(w.writes).toEqual([]);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe("5.6.8");
    } finally {
      h.cleanup();
    }
  });

  test("ONE package moved on is enough to refuse the whole rollback", async () => {
    const h = harness();
    const tags = { ...promotedTags(), "@opum-ai/lore": { latest: "5.6.8" } };
    const w = world({ receipt: undefined, tags });
    try {
      recordFile(h);
      expect(await h.go(["--rollback", h.record], w)).toBe(1);
      expect(w.writes).toEqual([]);
    } finally {
      h.cleanup();
    }
  });

  test("a rerun after a PARTIAL rollback is allowed: each package reads the release or its prior", async () => {
    const h = harness();
    const tags = { ...promotedTags(), "@opum-ai/lore-darwin-arm64": { latest: PRIOR } };
    const w = world({ receipt: undefined, tags });
    try {
      recordFile(h);
      expect(await h.go(["--rollback", h.record], w)).toBe(0);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
    } finally {
      h.cleanup();
    }
  });

  test("checkRollbackState refuses an unreadable tag set rather than assuming it", async () => {
    const record = {
      schemaVersion: 1 as const,
      kind: RECORD_KIND,
      version: V,
      recordedAt: "x",
      packages: [{ name: "@opum-ai/lore", priorLatest: PRIOR }],
    };
    const state = await checkRollbackState({
      record,
      readTags: async () => {
        throw new Error("E503");
      },
    });
    expect(state.ok).toBe(false);
    expect(state.problems).toEqual(["@opum-ai/lore: dist-tags unreadable (E503)"]);
  });

  test("the prior-value grammar is quest-cli's, exactly (QCLI-390): plain X.Y.Z only", () => {
    expect(RELEASE_VERSION.source).toBe("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$");
    for (const good of ["0.11.0", "1.0.0", "10.20.30"])
      expect([good, RELEASE_VERSION.test(good)]).toEqual([good, true]);
    for (const bad of ["v0.11.0", "0.11", "01.0.0", "0.11.0-rc.1", "0.11.0+b", "latest", "release-candidate", ""])
      expect([bad, RELEASE_VERSION.test(bad)]).toEqual([bad, false]);
    // --version (N4) takes full semver, prereleases included; that is a different field.
    expect(SEMVER.test("1.0.0-rc.1+build.5")).toBe(true);
    expect(SEMVER.test("v1.0.0")).toBe(false);
    const record = { kind: RECORD_KIND, version: V, packages: [{ name: "@opum-ai/lore", priorLatest: V }] };
    expect(validateRecord(record, { packages: ["@opum-ai/lore"] }).problems).toEqual([
      `@opum-ai/lore: recorded prior latest is the release itself (${V}); rolling back to it restores nothing`,
    ]);
  });

  test("every dist-tag read --rollback makes is ANONYMOUS, against the public registry", async () => {
    const h = harness();
    const w = world({ receipt: undefined, tags: promotedTags() });
    try {
      recordFile(h);
      expect(await h.go(["--rollback", h.record], w)).toBe(0);
      const reads = w.calls.filter((c) => c[0] === "npm" && c[1] === "view");
      expect(reads.length).toBe(2 * RELEASE_PACKAGES.length); // the state check, then the verify
      for (const c of reads) expect(c.slice(1)).toEqual(distTagReadArgs(c[2] as string));
      expect(distTagReadArgs("x")).toContain("--registry=https://registry.npmjs.org/");
      expect(distTagReadArgs("x").some((a) => a.startsWith("--userconfig="))).toBe(true);
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: the failed package is restored too (review S2)", () => {
  test("a write the registry APPLIED before the client failed is still put back, so no package stays moved", async () => {
    const h = harness();
    const w = world({ failAfterApply: "@opum-ai/lore-linux-arm64" });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(w.writes).toContain(`dist-tag add @opum-ai/lore-linux-arm64@${PRIOR} latest`);
      expect(h.err.join("\n")).toContain(
        "and @opum-ai/lore-linux-arm64 itself (its write may have landed), were restored",
      );
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: rollback() keeps going past a failed restore (review S3)", () => {
  test("unit: a failing restore in the MIDDLE is reported, and every package after it is still attempted", async () => {
    const record: PromotionRecord = {
      schemaVersion: 1,
      kind: RECORD_KIND,
      version: V,
      recordedAt: "x",
      packages: RELEASE_PACKAGES.map((name) => ({ name, priorLatest: PRIOR })),
    };
    const attempted: string[] = [];
    const outcome = await rollback({
      record,
      setTag: async (name) => {
        attempted.push(name);
        if (name === "@opum-ai/lore-linux-x64") throw new Error("ETIMEDOUT");
      },
    });
    expect(attempted).toEqual([...RELEASE_PACKAGES]);
    expect(outcome).toEqual({ ok: false, failed: ["@opum-ai/lore-linux-x64"] });
  });

  test("command: --rollback with one restore failing restores the other six and exits 1 naming it", async () => {
    const h = harness();
    try {
      expect(await h.go(["--record", h.record, "--promote"], world())).toBe(0);
      const w = world({
        receipt: undefined,
        failRestore: "@opum-ai/lore-linux-x64",
        tags: Object.fromEntries(RELEASE_PACKAGES.map((n) => [n, { latest: V }])),
      });
      expect(await h.go(["--rollback", h.record], w)).toBe(1);
      for (const name of RELEASE_PACKAGES)
        expect([name, w.tags[name]?.latest]).toEqual([name, name === "@opum-ai/lore-linux-x64" ? V : PRIOR]);
      expect(h.err.join("\n")).toContain("NOT restored: @opum-ai/lore-linux-x64. Re-run --rollback; it is idempotent.");
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: quest first, read not remembered (review S4)", () => {
  for (const mode of ["--promote", "--dry-run"] as const) {
    test(`${mode}: refuses while @opum-ai/quest's latest is not the version, before any record or move`, async () => {
      const h = harness();
      const w = world({ questLatest: PRIOR });
      try {
        expect(await h.go(["--record", h.record, mode], w)).toBe(1);
        expect(h.err.join("\n")).toContain(
          `Refusing to promote ${V}: @opum-ai/quest's latest is "${PRIOR}", not ${V}. Article 3 clause 5 moves quest's latest first`,
        );
        expectRefusedBeforeAnyWrite(h, w);
        expect(w.calls).toContainEqual(["npm", ...distTagReadArgs("@opum-ai/quest")]);
        // Quest first is checked before step 6's registry download.
        expect(w.calls.some((c) => c[1] === "pack")).toBe(false);
      } finally {
        h.cleanup();
      }
    });
  }

  test("an unreadable quest tag set refuses rather than assuming quest moved", async () => {
    const h = harness();
    const w = world({ questLatest: null });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(h.err.join("\n")).toContain("@opum-ai/quest's latest is null (E503 registry unreachable)");
      expect(w.writes).toEqual([]);
    } finally {
      h.cleanup();
    }
  });

  test("with quest already at the version, the success path says so", async () => {
    const h = harness();
    try {
      expect(await h.go(["--record", h.record, "--dry-run"], world())).toBe(0);
      expect(h.text()).toContain(`@opum-ai/quest latest reads ${V}: quest has moved first (Article 3 clause 5).`);
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: --version is strict semver (review N4)", () => {
  for (const bad of [`v${V}`, "latest", "release-candidate", "5.6", "05.6.7"]) {
    test(`--version ${bad} is refused before anything is read`, async () => {
      const h = harness();
      const w = world();
      try {
        await expect(h.go(["--record", h.record, "--dry-run", "--version", bad], w)).rejects.toThrow(
          "is not a semver version",
        );
        expect(w.calls).toEqual([]);
      } finally {
        h.cleanup();
      }
    });
  }
});
