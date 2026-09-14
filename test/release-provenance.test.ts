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
import { readFileSync } from "node:fs";
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
 * 0.7.4 is the case that killed the launcher-only shortcut: release.yml's `publish_or_skip` is
 * resumable, so a release can legitimately be completed by a second dispatch from a second
 * commit. Here the launcher pins a live commit and the platform package pins a destroyed one —
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
        const pin = PINS[version]?.[name];
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
    const { code, out } = await runGate(["--post", "--version", "0.6.1", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.6.1`)).toBe("absent");
    // Loud, not silent: the gap has to be a recorded fact on the run, every run.
    expect(out).toContain("::warning::");
    expect(out).toContain("LCLI-482");
    expect(out).not.toContain("::error::");
  });

  test("attestation PRESENT pinning a resolvable commit passes with no annotation", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.0", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.0`)).toBe("ok");
    expect(out).not.toContain("::error::");
    expect(out).not.toContain("::warning::");
  });

  test("attestation PRESENT pinning a commit the API cannot resolve FAILS (the LCLI-481 defect)", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.1", "--package", LAUNCHER]);
    expect(code).toBe(1);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.1`)).toBe("dangling");
    expect(out).toContain("::error::");
    expect(out).toContain(GONE_SHA);
  });

  test("the failure message states BOTH sanctioned ways out, so deleting the job is never the only move", async () => {
    // A gate whose only reachable remedy is deletion gets deleted. `--pre` re-checks published
    // history, so this finding never clears on its own and `publish` stays unreachable until
    // someone acts; the error text is where an operator finds out what the legitimate action is.
    const { out } = await runGate(["--post", "--version", "0.7.1", "--package", LAUNCHER]);
    expect(out).toContain("acknowledge_dangling_provenance");
    expect(out).toContain("KNOWN_DANGLING_THROUGH");
    expect(out).toContain("WILL NOT CLEAR ON ITS OWN");
  });

  test("a commit is established as missing WITHOUT trusting GitHub's wording", async () => {
    // 0.7.5's 422 says "No commit object found for SHA" — one word inserted. If the single
    // substring match were the deciding branch, this would pass silently and the gate would be
    // dead the day GitHub reworded its error. The verdict comes from 422 + the repository
    // itself resolving, so it still fails; the wording only labels the log line.
    const { code, out } = await runGate(["--post", "--version", "0.7.5", "--package", LAUNCHER]);
    expect(code).toBe(1);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.5`)).toBe("dangling");
    expect(out).toContain("UNRECOGNISED wording");
  });

  test("a 422 whose repository is ALSO unreadable is inconclusive, not dangling", async () => {
    // Without being able to read the repo, a 422 corroborates nothing: it could be a token or
    // visibility problem rather than a destroyed commit.
    const { code, out } = await runGate(["--post", "--version", "0.7.6", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.6`)).toBe("inconclusive");
    expect(out).toContain("is not readable");
  });

  test("a rate limit is inconclusive, never dangling, and never red", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.2", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.2`)).toBe("inconclusive");
    expect(out).toContain("rate limit");
    expect(out).not.toContain("::error::");
  });

  test("a 404 on the repository is inconclusive, not a missing commit", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.3", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.3`)).toBe("inconclusive");
    expect(out).toContain("NOT evidence about the commit");
  });

  test("a version at or below the baseline reports its pinned commit and does not fail", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.6.0", "--package", LAUNCHER]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.6.0`)).toBe("baseline");
    expect(out).toContain(GONE_SHA);
    expect(out).not.toContain("::error::");
  });
});

describe("release-provenance acknowledgement (the escape hatch)", () => {
  test("a waiver turns a dangling finding into a loud pass, naming the reference", async () => {
    const { code, out } = await runGate([
      "--post",
      "--version",
      "0.7.1",
      "--package",
      LAUNCHER,
      "--acknowledge",
      "LCLI-481",
    ]);
    expect(code).toBe(0);
    expect(outcomeOf(out, `${LAUNCHER}@0.7.1`)).toBe("acknowledged");
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
    const { code } = await runGate(["--post", "--version", "0.7.1", "--package", LAUNCHER]);
    expect(code).toBe(1);
  });
});

describe("release-provenance --pre over the published history", () => {
  test("EVERY package of a scanned release is checked, not just the launcher", async () => {
    // 0.7.4 is a release completed across two dispatches from two commits (release.yml's
    // publish_or_skip makes that a supported, documented flow): the launcher pins a live
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
    // 0.7.1's launcher is attested and the platform package is not, so the platform package is
    // the lagging case. One second of window is enough to prove the branch is taken and that
    // the window is per package rather than shared.
    const { out } = await runGate([
      "--post",
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
