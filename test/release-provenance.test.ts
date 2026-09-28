/**
 * release-provenance.test.ts — exercises `scripts/release-provenance.mjs` (LCLI-481) against a
 * stub registry + stub GitHub API.
 *
 * THIS FILE IS THE ENTIRE SAFETY NET FOR THAT SCRIPT. `biome.json`'s `files.includes` and
 * `tsconfig.json`'s `include` are both `src|test|benchmark`, so nothing in `scripts/` is linted
 * or type-checked at all — that gap is tracked as LCLI-486 and deliberately not fixed on this
 * branch. Until it lands, no linter and no type checker will ever look at the script: a typo in
 * a rarely-taken branch reaches a release run unexamined. So these tests cover the error and
 * refusal paths as deliberately as the happy one, including the ones that only fire when
 * something has already gone wrong.
 *
 * WHY A STUB AND NOT THE REAL ENDPOINTS: the gate's outcomes are defined by what two remote
 * services answer, and the only one reproducible against production today is "absent" (every
 * version at or below the baseline is deliberately not re-checked, and no post-baseline version
 * carries provenance yet). A release-path check that can only be exercised by cutting a release
 * is a check nobody runs, so the script takes its two base URLs from LORE_PROVENANCE_REGISTRY /
 * LORE_PROVENANCE_GITHUB_API and this file points them at a local server that can produce every
 * answer, including the ones we hope never to see again.
 *
 * The assertions that matter most are the negative ones: a 404 from the GitHub API (repository
 * not found / not readable) and a rate limit must NOT be reported as a dangling commit, and a
 * check that inspected nothing must NOT be reported as a pass.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "release-provenance.mjs");

/** A destroyed commit — the shape 0.6.0's real attestation has today. */
const GONE_SHA = "59ba30e497f8e98aa6c6be022d9363fd718fb4ee";
/** Also destroyed, but the stub answers it with wording the script does not recognise. */
const GONE_SHA_ODD_WORDING = "3333333333333333333333333333333333333333";
/** A commit the stub GitHub API resolves. */
const LIVE_SHA = "a694b40c5cfe9e0e02b4a2f712f25a6428c68b6b";
/** Resolving this one exhausts the stub's rate limit instead of answering. */
const RATE_LIMITED_SHA = "1111111111111111111111111111111111111111";
/** Attested against a repository the stub answers 404 for. */
const UNKNOWN_REPO_SHA = "2222222222222222222222222222222222222222";
/** 422 on the commit, but its repo is ALSO unreadable — proves nothing, must be inconclusive. */
const GONE_SHA_IN_DARK_REPO = "4444444444444444444444444444444444444444";

const REPO = "opum-ai/lore-cli";
const MISSING_REPO = "opum-ai/does-not-exist";
/** Readable enough to 422 a commit, but `GET /repos/...` is 403 — the corroboration fails. */
const DARK_REPO = "opum-ai/dark-repo";

const LAUNCHER = "@opum-ai/lore";
const PLATFORM = "@opum-ai/lore-darwin-arm64";

/** A minimally faithful npm attestation response: the SLSA statement, base64 in a DSSE envelope. */
function attestationBody(commit: string, repo: string, ref: string): string {
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        resolvedDependencies: [{ uri: `git+https://github.com/${repo}@${ref}`, digest: { gitCommit: commit } }],
        externalParameters: {
          workflow: { ref, repository: `https://github.com/${repo}`, path: ".github/workflows/release.yml" },
        },
      },
    },
  };
  return JSON.stringify({
    attestations: [
      // npm publishes its own publish attestation alongside the SLSA one; the script must
      // match on predicateType rather than index into the array.
      { predicateType: "https://github.com/npm/attestation/tree/main/specs/publish/v0.1", bundle: {} },
      {
        predicateType: "https://slsa.dev/provenance/v1",
        bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString("base64") } },
      },
    ],
  });
}

type Pin = { commit: string; repo: string };

/**
 * What the stub registry serves, per package per version. `undefined` means "no attestation",
 * served as the 404 npm really answers with.
 *
 * 0.7.4 is the case that killed the launcher-only shortcut: release.yml's `publish_or_skip` can
 * resume a partial publish from a different run when its tarballs are byte-identical, so one
 * version can hold packages published from two commits. Here the launcher pins a live commit and
 * the platform package pins a destroyed one —
 * probing the launcher alone would report that release clean.
 */
const PINS: Record<string, Record<string, Pin | undefined>> = {
  "0.5.0": { [LAUNCHER]: { commit: GONE_SHA, repo: REPO } }, // below baseline
  "0.6.0": { [LAUNCHER]: { commit: GONE_SHA, repo: REPO } }, // the baseline itself
  "0.6.1": {}, // manual publish, no provenance at all
  "0.7.0": { [LAUNCHER]: { commit: LIVE_SHA, repo: REPO }, [PLATFORM]: { commit: LIVE_SHA, repo: REPO } },
  "0.7.1": { [LAUNCHER]: { commit: GONE_SHA, repo: REPO } },
  "0.7.2": { [LAUNCHER]: { commit: RATE_LIMITED_SHA, repo: REPO } },
  "0.7.3": { [LAUNCHER]: { commit: UNKNOWN_REPO_SHA, repo: MISSING_REPO } },
  "0.7.4": { [LAUNCHER]: { commit: LIVE_SHA, repo: REPO }, [PLATFORM]: { commit: GONE_SHA, repo: REPO } },
  "0.7.5": { [LAUNCHER]: { commit: GONE_SHA_ODD_WORDING, repo: REPO } },
  "0.7.6": { [LAUNCHER]: { commit: GONE_SHA_IN_DARK_REPO, repo: DARK_REPO } },
};

/**
 * --post checks the launcher at X-rc.N, never at X (LCLI-625), so the outcome tests below probe
 * the launcher at `<X>-rc.1`. The stub serves each such rc with the same pin as that X's launcher,
 * so every outcome the launcher at X exercised is exercised at its rc. The lookup stays exact:
 * a --post that asked for the launcher at X would get X's answer under X's spec, and the tests
 * assert on the rc spec, so they would not find their line.
 */
const STAGED_PINS: Record<string, Record<string, Pin | undefined>> = { ...PINS };
for (const [version, pins] of Object.entries(PINS)) {
  const launcherPin = pins[LAUNCHER];
  if (launcherPin) STAGED_PINS[`${version}-rc.1`] = { [LAUNCHER]: launcherPin };
}

/**
 * The release the package-set test runs --post against. Its launcher at X is attested with a
 * DESTROYED commit, so a --post that checked the launcher at X would go red on it, and its
 * launcher at X-rc.2 is attested with a live one. The platforms at X carry no attestation.
 */
const SET_VERSION = "0.8.0";
const SET_RC = "2";
STAGED_PINS[SET_VERSION] = { [LAUNCHER]: { commit: GONE_SHA, repo: REPO } };
STAGED_PINS[`${SET_VERSION}-rc.${SET_RC}`] = { [LAUNCHER]: { commit: LIVE_SHA, repo: REPO } };

/**
 * A release whose LAUNCHER is the lagging package: its platform at X is attested, and its
 * launcher at X-rc.1 has no attestation, so --post's propagation window retries the launcher.
 * The launcher at X is attested here on purpose: a retry that asked for X instead of X-rc.1
 * would find an answer and stop, which only the request log can tell apart (LCLI-625 review).
 */
const LAG_VERSION = "0.9.0";
STAGED_PINS[LAG_VERSION] = {
  [LAUNCHER]: { commit: LIVE_SHA, repo: REPO },
  [PLATFORM]: { commit: LIVE_SHA, repo: REPO },
};

/**
 * A release whose launcher packument holds ONLY an rc (LCLI-627): staged, never promoted. Its
 * launcher at X-rc.1 resolves; its platform at X pins a DESTROYED commit. So --pre goes red only
 * if it re-verifies the platforms at X for a release that has no launcher at X, and a --pre that
 * asked for the platforms at the rc string would find nothing there and pass.
 */
const RC_ONLY_VERSION = "0.10.0";
STAGED_PINS[`${RC_ONLY_VERSION}-rc.1`] = { [LAUNCHER]: { commit: LIVE_SHA, repo: REPO } };
STAGED_PINS[RC_ONLY_VERSION] = { [PLATFORM]: { commit: GONE_SHA, repo: REPO } };

/** The LCLI-625 reviewer's scratch packument, the one the pre-fix --pre never got past. */
const REVIEWER_PACKUMENT = ["0.7.0", "0.7.1", "0.8.0-rc.1", "0.8.0-rc.2", "0.8.0-rc.3"];

/** Every `name@version` the stub's attestation endpoint was asked for, in order. */
const attestationRequests: string[] = [];

/** Versions the stub packument lists. Overridable per test (see `packumentVersions`). */
let packumentVersions: string[] = Object.keys(PINS);
/** Set to a status to make the packument endpoint fail, for the remote-outage path. */
let packumentFailure: number | "no-versions" | null = null;

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname);

      // --- stub GitHub API: repository readability (the 422 corroboration) ----
      const repoMatch = /^\/repos\/([^/]+\/[^/]+)$/.exec(path);
      if (repoMatch) {
        const repo = repoMatch[1] ?? "";
        if (repo === REPO) return Response.json({ full_name: repo });
        if (repo === DARK_REPO) return Response.json({ message: "Forbidden" }, { status: 403 });
        return Response.json({ message: "Not Found", status: "404" }, { status: 404 });
      }

      // --- stub GitHub API: commits -----------------------------------------
      const commitMatch = /^\/repos\/([^/]+\/[^/]+)\/commits\/([0-9a-f]+)$/.exec(path);
      if (commitMatch) {
        const repo = commitMatch[1] ?? "";
        const sha = commitMatch[2] ?? "";
        if (repo === MISSING_REPO) {
          // GitHub's answer when the REPOSITORY is missing or unreadable — never when a
          // commit is missing from a visible repo.
          return Response.json({ message: "Not Found", status: "404" }, { status: 404 });
        }
        if (sha === RATE_LIMITED_SHA) {
          return Response.json(
            { message: "API rate limit exceeded" },
            { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "4102444800" } },
          );
        }
        if (sha === LIVE_SHA) return Response.json({ sha });
        if (sha === GONE_SHA_ODD_WORDING) {
          // ONE WORD INSERTED. If the verdict depended on this sentence, the gate would
          // silently pass here — which is the whole reason it corroborates with the repo
          // lookup instead of parsing prose.
          return Response.json({ message: `No commit object found for SHA: ${sha}` }, { status: 422 });
        }
        return Response.json({ message: `No commit found for SHA: ${sha}`, status: "422" }, { status: 422 });
      }

      // --- stub npm registry -------------------------------------------------
      const attestationMatch = /^\/-\/npm\/v1\/attestations\/(.+)@([^@]+)$/.exec(path);
      if (attestationMatch) {
        const name = attestationMatch[1] ?? "";
        const version = attestationMatch[2] ?? "";
        attestationRequests.push(`${name}@${version}`);
        const pin = STAGED_PINS[version]?.[name];
        if (!pin) return Response.json({ error: "Not found" }, { status: 404 });
        return new Response(attestationBody(pin.commit, pin.repo, `refs/tags/v${version}`), {
          headers: { "content-type": "application/json" },
        });
      }
      if (path === `/${LAUNCHER}`) {
        if (typeof packumentFailure === "number") {
          return Response.json({ error: "gone" }, { status: packumentFailure });
        }
        if (packumentFailure === "no-versions") return Response.json({ name: LAUNCHER });
        const versions: Record<string, unknown> = {};
        for (const version of packumentVersions) versions[version] = { version };
        return Response.json({ name: LAUNCHER, versions });
      }

      return new Response(`unexpected stub request: ${path}`, { status: 500 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

async function runGate(args: string[], extraEnv: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["node", SCRIPT, ...args], {
    env: {
      ...process.env,
      LORE_PROVENANCE_REGISTRY: base,
      LORE_PROVENANCE_GITHUB_API: base,
      // Keep the real token out of the stub, and keep the job summary out of the test run.
      GITHUB_TOKEN: "",
      GH_TOKEN: "",
      GITHUB_STEP_SUMMARY: "",
      LORE_PROVENANCE_SELFTEST_THROW: "",
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: out + err };
}

/**
 * The outcome column of the report line for one spec, or undefined if it was never reported.
 *
 * Anchored at the start of the line, because the report pads the outcome to a fixed width: a
 * 12-character outcome (`inconclusive`, `acknowledged`) leaves exactly one space before the
 * spec while a shorter one leaves several, and matching on the gap silently found nothing for
 * precisely those two.
 */
function outcomeOf(out: string, spec: string): string | undefined {
  const pattern = new RegExp(`^([a-z]+)\\s+${spec.replace(/[.*+?^${}()|[\]\\/@-]/g, "\\$&")}\\s\\s`);
  for (const line of out.split("\n")) {
    const match = pattern.exec(line);
    if (match) return match[1];
  }
  return undefined;
}

describe("release-provenance gate outcomes", () => {
  test("attestation ABSENT passes, loudly, naming the manual-publish cause (LCLI-482)", async () => {
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.6.1", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.6.1-rc.1`)).toBe("absent");
    // Loud, not silent: the gap has to be a recorded fact on the run, every run.
    expect(out).toContain("::warning::");
    expect(out).toContain("LCLI-482");
    expect(out).not.toContain("::error::");
  });

  test("attestation PRESENT pinning a resolvable commit passes with no annotation", async () => {
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.0", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.0-rc.1`)).toBe("ok");
    expect(out).not.toContain("::error::");
    expect(out).not.toContain("::warning::");
  });

  test("attestation PRESENT pinning a commit the API cannot resolve FAILS (the LCLI-481 defect)", async () => {
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.1", "--package", LAUNCHER]);
    expect(code).toBe(1);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.1-rc.1`)).toBe("dangling");
    expect(out).toContain("::error::");
    expect(out).toContain(GONE_SHA);
  });

  test("the failure message states BOTH sanctioned ways out, so deleting the job is never the only move", async () => {
    // A gate whose only reachable remedy is deletion gets deleted. `--pre` re-checks published
    // history, so this finding never clears on its own and `publish` stays unreachable until
    // someone acts; the error text is where an operator finds out what the legitimate action is.
    const { out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.1", "--package", LAUNCHER]);
    expect(out).toContain("acknowledge_dangling_provenance");
    expect(out).toContain("KNOWN_DANGLING_THROUGH");
    expect(out).toContain("WILL NOT CLEAR ON ITS OWN");
  });

  test("a commit is established as missing WITHOUT trusting GitHub's wording", async () => {
    // 0.7.5's 422 says "No commit object found for SHA" — one word inserted. If the single
    // substring match were the deciding branch, this would pass silently and the gate would be
    // dead the day GitHub reworded its error. The verdict comes from 422 + the repository
    // itself resolving, so it still fails; the wording only labels the log line.
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.5", "--package", LAUNCHER]);
    expect(code).toBe(1);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.5-rc.1`)).toBe("dangling");
    expect(out).toContain("UNRECOGNISED wording");
  });

  test("a 422 whose repository is ALSO unreadable is inconclusive, not dangling", async () => {
    // Without being able to read the repo, a 422 corroborates nothing: it could be a token or
    // visibility problem rather than a destroyed commit.
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.6", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.6-rc.1`)).toBe("inconclusive");
    expect(out).toContain("is not readable");
  });

  test("a rate limit is inconclusive, never dangling, and never red", async () => {
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.2", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.2-rc.1`)).toBe("inconclusive");
    expect(out).toContain("rate limit");
    expect(out).not.toContain("::error::");
  });

  test("a 404 on the repository is inconclusive, not a missing commit", async () => {
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.3", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.3-rc.1`)).toBe("inconclusive");
    expect(out).toContain("NOT evidence about the commit");
  });

  test("a version at or below the baseline reports its pinned commit and does not fail", async () => {
    const { code, out } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.6.0", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.6.0-rc.1`)).toBe("baseline");
    expect(out).toContain(GONE_SHA);
    expect(out).not.toContain("::error::");
  });
});

describe("release-provenance acknowledgement (the escape hatch)", () => {
  test("a waiver turns a dangling finding into a loud pass, naming the reference", async () => {
    const { code, out } = await runGate([
      "--post",
      "--launcher-rc",
      "1",
      "--version",
      "0.7.1",
      "--package",
      LAUNCHER,
      "--acknowledge",
      "LCLI-481",
    ]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.1-rc.1`)).toBe("acknowledged");
    expect(out).toContain("LCLI-481");
    expect(out).toContain("does not persist");
    // Waived, not hidden: the commit is still named and the annotation is still loud.
    expect(out).toContain(GONE_SHA);
    expect(out).toContain("::warning::");
  });

  test("a waiver must name a reference — it is not a bare yes", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.1", "--acknowledge"]);
    expect(code).toBe(2);
    expect(out).toContain("--acknowledge needs a reference");
  });

  test("without a waiver the same finding is still red", async () => {
    const { code } = await runGate(["--post", "--launcher-rc", "1", "--version", "0.7.1", "--package", LAUNCHER]);
    expect(code).toBe(1);
  });
});

describe("release-provenance --pre over the published history", () => {
  test("EVERY package of a scanned release is checked, not just the launcher", async () => {
    // 0.7.4 is a release whose packages were published from two commits (possible when
    // release.yml's publish_or_skip resumes from a byte-identical run): the launcher pins a live
    // commit, a platform package pins a destroyed one. A launcher-only probe would call this
    // release clean, which is exactly the false warrant the first revision of this gate shipped.
    const { code, out } = await runGate(["--pre", "--limit", "6", "--package", LAUNCHER, "--package", PLATFORM]);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.4`)).toBe("ok");
    expect(outcomeOf(out, `${PLATFORM}@0.7.4`)).toBe("dangling");
    expect(code).toBe(1);
  });

  test("baseline versions are listed but never failed on; a post-baseline dangle fails", async () => {
    const { code, out } = await runGate(["--pre", "--package", LAUNCHER]);
    expect(code).toBe(1);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.1`)).toBe("dangling");
    // 0.5.0/0.6.0 dangle too, but they are the accepted, unrepairable 2026-09-10 loss. They
    // stay on the record without reding every release forever.
    expect(out).toContain("baseline set");
    expect(out).toContain("0.5.0, 0.6.0");
    expect(outcomeOf(out, `${LAUNCHER}@0.6.0`)).toBeUndefined();
  });

  test("--limit bounds how much history is re-verified", async () => {
    const { out } = await runGate(["--pre", "--limit", "1", "--package", LAUNCHER]);
    expect(out).toContain("the most recent 1");
    expect(outcomeOf(out, `${LAUNCHER}@0.7.1`)).toBeUndefined();
  });

  test("checking ZERO versions is a loud warning, never a pass claim", async () => {
    // Reachable in production if the packument shape changes, the package is renamed, or the
    // baseline is raised past every published version — after which a silent "passed" would be
    // a gate reporting success for work it never did.
    const previous = packumentVersions;
    packumentVersions = ["0.5.0", "0.6.0"];
    try {
      const { code, out } = await runGate(["--pre", "--package", LAUNCHER]);
      expect(code).toBe(0);
      expect(out).toContain("verified ZERO package versions");
      expect(out).toContain("This is NOT a pass");
    } finally {
      packumentVersions = previous;
    }
  });

  test("a version string that is not semver-shaped is checked, not silently skipped", async () => {
    // The trap: coercing "abc"/""/"0.6" through parseInt yields 0.0.0, which reads as "below
    // the baseline" and drops it with no output at all — "when unsure, pass quietly" in a file
    // whose doctrine is "when unsure, pass loudly".
    const previous = packumentVersions;
    packumentVersions = ["0.6.0", "abc", "0.6"];
    try {
      const { code, out } = await runGate(["--pre", "--package", LAUNCHER]);
      expect(code).toBe(0);
      expect(out).toContain("not semver-shaped");
      expect(out).toContain("They are NOT assumed to be below the baseline");
      expect(outcomeOf(out, `${LAUNCHER}@abc`)).toBe("absent");
      expect(outcomeOf(out, `${LAUNCHER}@0.6`)).toBe("absent");
    } finally {
      packumentVersions = previous;
    }
  });
});

describe("release-provenance --pre groups launcher rcs into releases (LCLI-627)", () => {
  /**
   * Since LCLI-621 the launcher stages as X-rc.N, so its packument holds rc strings the platform
   * packages never have. These tests read the stub's request log, not only the report, so a spec
   * that was queried but not reported (or the reverse) cannot pass. Each names the acceptance
   * criterion it pins; the mutation proof on the task maps a revert of each part of the fix to
   * the tests below that must go red.
   */
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
    name: string;
    optionalDependencies?: Record<string, string>;
  };
  const platforms = Object.keys(manifest.optionalDependencies ?? {});

  async function withPackument<T>(versions: string[], body: () => Promise<T>): Promise<T> {
    const previous = packumentVersions;
    packumentVersions = versions;
    attestationRequests.length = 0;
    try {
      return await body();
    } finally {
      packumentVersions = previous;
    }
  }

  test("AC1: no platform package is ever requested at an X-rc.N version", async () => {
    await withPackument(REVIEWER_PACKUMENT, async () => {
      await runGate(["--pre"]);
      // Positive control: the run did read the rcs, so an empty log cannot pass this.
      expect(attestationRequests).toContain(`${LAUNCHER}@0.8.0-rc.1`);
      expect(platforms.length).toBeGreaterThan(0);
      const platformAtRc = attestationRequests.filter((spec) => !spec.startsWith(`${LAUNCHER}@`) && /-rc\./.test(spec));
      expect(platformAtRc).toEqual([]);
    });
  });

  test("the reviewer packument's exact request set: platforms once per release at X, launcher once per version", async () => {
    await withPackument(REVIEWER_PACKUMENT, async () => {
      const { out } = await runGate(["--pre"]);
      const expected = [
        ...["0.7.0", "0.7.1", "0.8.0"].flatMap((x) => platforms.map((p) => `${p}@${x}`)),
        ...["0.7.0", "0.7.1", "0.8.0-rc.1", "0.8.0-rc.2", "0.8.0-rc.3"].map((v) => `${LAUNCHER}@${v}`),
      ].sort();
      expect([...attestationRequests].sort()).toEqual(expected);
      // The launcher at 0.8.0 is not in the packument, so it is never asked for. The stub attests
      // it with a destroyed commit, so asking for it would also show up as a dangling row.
      expect(attestationRequests).not.toContain(`${LAUNCHER}@0.8.0`);
      expect(outcomeOf(out, `${LAUNCHER}@0.8.0`)).toBeUndefined();
    });
  });

  test("AC2: a release whose launcher has only rcs still has its platforms re-verified at X", async () => {
    await withPackument([`${RC_ONLY_VERSION}-rc.1`], async () => {
      const { code, out } = await runGate(["--pre"]);
      for (const platform of platforms) expect(attestationRequests).toContain(`${platform}@${RC_ONLY_VERSION}`);
      // The stub's platform at X pins a destroyed commit: re-verified, it is red.
      expect(outcomeOf(out, `${PLATFORM}@${RC_ONLY_VERSION}`)).toBe("dangling");
      expect(outcomeOf(out, `${LAUNCHER}@${RC_ONLY_VERSION}-rc.1`)).toBe("ok");
      expect(attestationRequests).not.toContain(`${LAUNCHER}@${RC_ONLY_VERSION}`);
      expect(code).toBe(1);
    });
  });

  test("AC3: --limit counts releases, so three rcs of one release do not push 0.7.1 out of --limit 3", async () => {
    await withPackument(REVIEWER_PACKUMENT, async () => {
      const three = await runGate(["--pre", "--limit", "3"]);
      expect(three.out).toContain("taking the most recent 3: 0.7.0, 0.7.1, 0.8.0");
      // 0.7.1's launcher pins a destroyed commit in the stub, so reaching it is a red run.
      expect(outcomeOf(three.out, `${LAUNCHER}@0.7.1`)).toBe("dangling");
      expect(three.code).toBe(1);

      // And the window is exactly releases: --limit 2 reaches 0.7.1 and stops before 0.7.0.
      attestationRequests.length = 0;
      const two = await runGate(["--pre", "--limit", "2"]);
      expect(two.out).toContain("taking the most recent 2: 0.7.1, 0.8.0");
      expect(attestationRequests).toContain(`${LAUNCHER}@0.7.1`);
      expect(attestationRequests.some((spec) => spec.endsWith("@0.7.0"))).toBe(false);
    });
  });

  test("within a release, rcs order by numeric N then X last, and each launcher version is checked once", async () => {
    // Keys served out of order on purpose: the order must not come from the packument, and
    // compareVersions calls X-rc.N and X equal, so it cannot supply one either.
    await withPackument(["1.2.0", "1.2.0-rc.10", "1.1.0", "1.2.0-rc.2"], async () => {
      const { code, out } = await runGate(["--pre", "--limit", "1"]);
      expect(code).toBe(0);
      const launcherSpecs = [`${LAUNCHER}@1.2.0-rc.2`, `${LAUNCHER}@1.2.0-rc.10`, `${LAUNCHER}@1.2.0`];
      expect([...attestationRequests].sort()).toEqual([...launcherSpecs, ...platforms.map((p) => `${p}@1.2.0`)].sort());
      const lines = out.split("\n");
      const at = (spec: string) => lines.findIndex((line) => outcomeOf(`${line}\n`, spec) !== undefined);
      const positions = launcherSpecs.map(at);
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });
  });

  test("a prerelease X is its own release: the platforms are checked at 1.0.0-beta.1, never at 1.0.0", async () => {
    // The LCLI-627 reviewer's packument. Only a trailing -rc.N is stripped to find X, so
    // 1.0.0-beta.1-rc.1 is an rc of 1.0.0-beta.1 — and 1.0.0-beta.1 is where the platforms really
    // are. An earlier revision of the fix grouped by numeric core and asked for them at 1.0.0,
    // which does not exist (publish-release.sh accepts any version that starts with a digit).
    await withPackument(["0.11.0", "1.0.0-beta.1-rc.1", "1.0.0-beta.1"], async () => {
      const { out } = await runGate(["--pre"]);
      expect(out).toContain("taking the most recent 2: 0.11.0, 1.0.0-beta.1");
      const expected = [
        ...[LAUNCHER, ...platforms].map((p) => `${p}@0.11.0`),
        `${LAUNCHER}@1.0.0-beta.1-rc.1`,
        `${LAUNCHER}@1.0.0-beta.1`,
        ...platforms.map((p) => `${p}@1.0.0-beta.1`),
      ].sort();
      expect([...attestationRequests].sort()).toEqual(expected);
      expect(attestationRequests.some((spec) => spec.endsWith("@1.0.0"))).toBe(false);
    });
  });

  test("a prerelease X and the bare X are two releases, two --limit slots, prerelease first", async () => {
    // Served bare-first on purpose: the order is semver's (1.0.0-beta.1 before 1.0.0), not the
    // registry's key order, so --limit 1 takes 1.0.0 alone.
    await withPackument(["1.0.0", "1.0.0-beta.1"], async () => {
      const one = await runGate(["--pre", "--limit", "1", "--package", LAUNCHER, "--package", PLATFORM]);
      expect(one.out).toContain("taking the most recent 1: 1.0.0 ");
      expect([...attestationRequests].sort()).toEqual([`${LAUNCHER}@1.0.0`, `${PLATFORM}@1.0.0`].sort());

      attestationRequests.length = 0;
      const two = await runGate(["--pre", "--limit", "2", "--package", LAUNCHER, "--package", PLATFORM]);
      expect(two.out).toContain("taking the most recent 2: 1.0.0-beta.1, 1.0.0 ");
      expect(attestationRequests).toContain(`${PLATFORM}@1.0.0-beta.1`);
    });
  });

  test("an rc string outside the -rc.N grammar (N = 0, a leading zero) is its own release", async () => {
    // The grammar is --launcher-rc's: N is a positive integer with no leading zero. Anything else
    // is not a staged rc, so nothing is assumed about it — every package at the exact string.
    await withPackument(["0.12.0-rc.0", "0.12.0-rc.01"], async () => {
      await runGate(["--pre", "--package", LAUNCHER, "--package", PLATFORM]);
      expect([...attestationRequests].sort()).toEqual(
        [
          `${LAUNCHER}@0.12.0-rc.0`,
          `${PLATFORM}@0.12.0-rc.0`,
          `${LAUNCHER}@0.12.0-rc.01`,
          `${PLATFORM}@0.12.0-rc.01`,
        ].sort(),
      );
    });
  });

  test("an unparseable version is checked at EVERY package, not the launcher alone", async () => {
    // The other unparseable test passes --package LAUNCHER only, so it cannot tell "every
    // package" from "launcher only" (the reviewer's M5 turned 0 of 48 red). This one uses the
    // default package set and reads the request log.
    await withPackument(["abc"], async () => {
      const { out } = await runGate(["--pre"]);
      expect(out).toContain("not semver-shaped");
      expect([...attestationRequests].sort()).toEqual([LAUNCHER, ...platforms].map((p) => `${p}@abc`).sort());
      expect(attestationRequests).toContain(`${PLATFORM}@abc`);
    });
  });

  test("the rcs of a baseline release are baseline too, listed and never fetched", async () => {
    await withPackument(["0.6.0-rc.1", "0.6.0", "0.6.1-rc.1"], async () => {
      const { out } = await runGate(["--pre", "--package", LAUNCHER, "--package", PLATFORM]);
      expect(out).toContain("baseline set");
      expect(out).toContain("0.6.0-rc.1, 0.6.0");
      expect(attestationRequests.some((spec) => spec.includes("@0.6.0"))).toBe(false);
      // 0.6.1-rc.1 sits above the baseline under semver precedence, and so it is checked.
      expect([...attestationRequests].sort()).toEqual([`${LAUNCHER}@0.6.1-rc.1`, `${PLATFORM}@0.6.1`].sort());
    });
  });
});

describe("release-provenance failure handling", () => {
  test("a registry that will not answer is a loud pass, not a finding", async () => {
    const previous = packumentFailure;
    packumentFailure = 503;
    try {
      const { code, out } = await runGate(["--pre", "--package", LAUNCHER]);
      expect(code).toBe(0);
      expect(out).toContain("could not run");
      expect(out).toContain("nothing was verified");
      expect(out).not.toContain("::error::");
    } finally {
      packumentFailure = previous;
    }
  });

  test("a packument with no versions map is treated as a remote problem, not a crash", async () => {
    const previous = packumentFailure;
    packumentFailure = "no-versions";
    try {
      const { code, out } = await runGate(["--pre", "--package", LAUNCHER]);
      expect(code).toBe(0);
      expect(out).toContain("carried no versions map");
    } finally {
      packumentFailure = previous;
    }
  });

  test("a defect in the gate itself exits 3 and says so — it is not dressed up as an outage", async () => {
    // The distinction that matters: an unreachable registry means "could not check" (exit 0,
    // loud). A TypeError in our own code means the gate is broken, and a broken gate reporting
    // success is how this whole mechanism would quietly stop working.
    const { code, out } = await runGate(["--pre", "--package", LAUNCHER], {
      LORE_PROVENANCE_SELFTEST_THROW: "1",
    });
    expect(code).toBe(3);
    expect(out).toContain("::error::");
    expect(out).toContain("defect in scripts/release-provenance.mjs");
    expect(out).toContain("Nothing was verified");
  });
});

describe("release-provenance propagation window", () => {
  test("no package attested means no waiting — the answer is already known", async () => {
    // With LCLI-482 open this is EVERY release: nothing is attested, so polling would spend the
    // whole window to re-learn what the first pass established. Bounded at 3s of tolerance so a
    // regression to "wait anyway" fails here instead of adding 7×180s to a real release.
    const started = Date.now();
    const { code, out } = await runGate([
      "--post",
      "--launcher-rc",
      "1",
      "--version",
      "0.6.1",
      "--package",
      LAUNCHER,
      "--package",
      PLATFORM,
      "--wait-seconds",
      "30",
    ]);
    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(out).toContain("nothing propagating to wait for");
  });

  test("an attested release DOES give a lagging package its own window", async () => {
    // 0.7.1-rc.1's launcher is attested and the platform package at 0.7.1 is not, so the
    // platform package is the lagging case. One second of window is enough to prove the branch
    // is taken and that the window is per package rather than shared. The retry must ask for
    // the platform at X, its own version, not the launcher's rc.
    attestationRequests.length = 0;
    const { out } = await runGate([
      "--post",
      "--launcher-rc",
      "1",
      "--version",
      "0.7.1",
      "--package",
      LAUNCHER,
      "--package",
      PLATFORM,
      "--wait-seconds",
      "1",
    ]);
    expect(out).toContain("propagation window left");
    expect(out).toContain(`${PLATFORM}@0.7.1`);
    // Pass 1 plus at least one retry, each at the platform's own version.
    expect(attestationRequests.filter((spec) => spec === `${PLATFORM}@0.7.1`).length).toBeGreaterThanOrEqual(2);
    expect(attestationRequests).not.toContain(`${LAUNCHER}@0.7.1`);
  });

  test("a lagging LAUNCHER is retried at X-rc.N, never at X", async () => {
    // The platform at X is attested and the launcher at X-rc.1 is not, so the window is spent on
    // the launcher. The previous test cannot catch a retry that uses the release's X instead of
    // the package's own version, because for a platform the two are the same string.
    attestationRequests.length = 0;
    const { out } = await runGate([
      "--post",
      "--launcher-rc",
      "1",
      "--version",
      LAG_VERSION,
      "--package",
      LAUNCHER,
      "--package",
      PLATFORM,
      "--wait-seconds",
      "1",
    ]);
    expect(out).toContain(`${LAUNCHER}@${LAG_VERSION}-rc.1: no attestation yet`);
    expect(
      attestationRequests.filter((spec) => spec === `${LAUNCHER}@${LAG_VERSION}-rc.1`).length,
    ).toBeGreaterThanOrEqual(2);
    expect(attestationRequests).not.toContain(`${LAUNCHER}@${LAG_VERSION}`);
    expect(outcomeOf(out, `${LAUNCHER}@${LAG_VERSION}-rc.1`)).toBe("absent");
  });
});

describe("release-provenance --post checks what a Release run published (LCLI-625)", () => {
  /**
   * Since LCLI-621 a Release run publishes the six platform packages at X and the launcher at
   * X-rc.N. The launcher at X is published later, by scripts/promote-latest.mjs. An earlier
   * --post checked every package at X, so it asked for a launcher that did not exist yet and
   * never looked at the rc the run did publish. These tests pin the exact set, read from the
   * stub's request log rather than from the report, so a spec that was queried but not reported
   * (or reported but not queried) cannot pass.
   */
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")) as {
    name: string;
    optionalDependencies?: Record<string, string>;
  };
  const platforms = Object.keys(manifest.optionalDependencies ?? {});

  test("the default set is the six platforms at X and the launcher at X-rc.N, and nothing else", async () => {
    // Guard the premise: the set is only "six platforms" while package.json pins six.
    expect(manifest.name).toBe(LAUNCHER);
    expect(platforms).toHaveLength(6);
    expect(platforms).toContain(PLATFORM);

    const expected = [...platforms.map((p) => `${p}@${SET_VERSION}`), `${LAUNCHER}@${SET_VERSION}-rc.${SET_RC}`].sort();

    attestationRequests.length = 0;
    const { code, out } = await runGate(["--post", "--version", SET_VERSION, "--launcher-rc", SET_RC]);

    expect([...new Set(attestationRequests)].sort()).toEqual(expected);
    expect(attestationRequests).toHaveLength(expected.length);
    // The launcher at X is absent from the set: never queried, never reported.
    expect(attestationRequests).not.toContain(`${LAUNCHER}@${SET_VERSION}`);
    expect(outcomeOf(out, `${LAUNCHER}@${SET_VERSION}`)).toBeUndefined();

    // The stub attests the launcher at X with a DESTROYED commit; a --post that asked for it
    // would exit 1. The rc resolves and the platforms are unattested, so this passes.
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@${SET_VERSION}-rc.${SET_RC}`)).toBe("ok");
    for (const platform of platforms) expect(outcomeOf(out, `${platform}@${SET_VERSION}`)).toBe("absent");
  });

  test("the run says, in the log and the job summary, that the launcher at X was not checked and why", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-provenance-summary-"));
    const summaryPath = join(dir, "summary.md");
    writeFileSync(summaryPath, "");
    try {
      const { out } = await runGate(["--post", "--version", SET_VERSION, "--launcher-rc", SET_RC], {
        GITHUB_STEP_SUMMARY: summaryPath,
      });
      const summary = readFileSync(summaryPath, "utf8");
      for (const text of [out, summary]) {
        expect(text).toContain(`${LAUNCHER}@${SET_VERSION} is NOT checked here`);
        expect(text).toContain("provenance-missing, byte-bound to the qualified rc");
        expect(text).toContain("is not a substitute for provenance");
        expect(text).toContain("OPAG-127");
      }
      // The summary table names the rc launcher, not the launcher at X.
      expect(summary).toContain(`\`${LAUNCHER}@${SET_VERSION}-rc.${SET_RC}\``);
      expect(summary).not.toContain(`\`${LAUNCHER}@${SET_VERSION}\``);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a --package override cannot route the launcher back to X", async () => {
    attestationRequests.length = 0;
    const { code } = await runGate([
      "--post",
      "--version",
      SET_VERSION,
      "--launcher-rc",
      SET_RC,
      "--package",
      LAUNCHER,
    ]);
    expect(code).toBe(0);
    expect(attestationRequests).toEqual([`${LAUNCHER}@${SET_VERSION}-rc.${SET_RC}`]);
  });

  test("--post without --launcher-rc fails closed rather than guessing N", async () => {
    attestationRequests.length = 0;
    const { code, out } = await runGate(["--post", "--version", SET_VERSION]);
    expect(code).toBe(2);
    expect(out).toContain("--post needs --launcher-rc N");
    expect(attestationRequests).toHaveLength(0);
  });

  for (const bad of ["0", "01", "-1", "1.5", "abc", "1 ", "rc.1", ""]) {
    test(`a malformed --launcher-rc ${JSON.stringify(bad)} fails closed`, async () => {
      attestationRequests.length = 0;
      const { code, out } = await runGate(["--post", "--version", SET_VERSION, "--launcher-rc", bad]);
      expect(code).toBe(2);
      expect(out).toContain("--launcher-rc must be a positive integer with no leading zero");
      expect(attestationRequests).toHaveLength(0);
    });
  }

  test("--launcher-rc is refused on --pre, whose behaviour it does not change", async () => {
    const { code, out } = await runGate(["--pre", "--launcher-rc", "1", "--package", LAUNCHER]);
    expect(code).toBe(2);
    expect(out).toContain("--launcher-rc applies only to --post");
  });
});

describe("release-provenance argument handling", () => {
  test("a mode is required", async () => {
    const { code, out } = await runGate([]);
    expect(code).toBe(2);
    expect(out).toContain("one of --pre or --post is required");
  });

  test("an unknown argument is a usage error, not a silent pass", async () => {
    const { code, out } = await runGate(["--post", "--nope"]);
    expect(code).toBe(2);
    expect(out).toContain("unknown argument: --nope");
  });
});

describe("release-provenance baseline literal", () => {
  test("KNOWN_DANGLING_THROUGH is pinned, so raising it cannot pass review unnoticed", () => {
    // Raising this retires the gate's memory of everything below the new value — permanently,
    // silently, and with no other signal anywhere. Pinning the literal means the most dangerous
    // edit in that file also has to edit this line, in the same diff, with a reason.
    //
    // If you are here because this test failed: raising the baseline is legitimate ONLY when a
    // rewrite has ALREADY destroyed the commits of the versions being folded under it and that
    // loss is recorded on a task. Cite the task in the commit message, then update this literal.
    const source = readFileSync(SCRIPT, "utf8");
    expect(source).toContain('const KNOWN_DANGLING_THROUGH = "0.6.0";');
  });

  test("the script never consults local git for a commit's existence", () => {
    // The destroyed SHAs still resolve in a pre-rewrite clone's loose objects (verified in this
    // repository: `git cat-file -t 59ba30e4...` prints `commit`), so any local check passes on
    // exactly the artifacts this gate exists to catch. There must be no git invocation at all.
    const source = readFileSync(SCRIPT, "utf8").replace(/gitCommit|git\+https|git cat-file|git history/g, "");
    expect(source).not.toMatch(/child_process|execSync|spawnSync|\bgit rev-parse\b/);
  });
});

describe("release-provenance live GitHub canary", () => {
  test("a destroyed SHA still answers 422, not 404 or 200", async () => {
    // The gate's central inference is "422 on the commit + 200 on the repo means the commit is
    // gone". That is an observed property of a live API, not a contract, and the stub above
    // cannot notice if GitHub changes it. This canary can.
    //
    // OFFLINE-TOLERANT ON PURPOSE: a unit suite that goes red on an aeroplane or behind a rate
    // limit gets `.skip`ped and then never runs again. Anything other than a clear answer is
    // reported and passed over.
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos/${REPO}/commits/${GONE_SHA}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "lore-cli-release-provenance-canary" },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      console.warn(`canary skipped — GitHub unreachable: ${String(error)}`);
      return;
    }
    if (response.status === 403 || response.status === 429) {
      console.warn("canary skipped — rate limited by GitHub");
      return;
    }
    expect(response.status).toBe(422);
    const body = await response.text();
    if (!/No commit found for SHA/i.test(body)) {
      // Not a failure: the gate deliberately does not depend on this wording. Worth saying out
      // loud, because the log line the script prints would change.
      console.warn(`canary: GitHub's 422 wording has changed — ${body.slice(0, 160)}`);
    }
  });
});
