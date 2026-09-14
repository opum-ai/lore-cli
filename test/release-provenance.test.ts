/**
 * release-provenance.test.ts — exercises `scripts/release-provenance.mjs` (LCLI-481) against a
 * stub registry + stub GitHub API.
 *
 * WHY A STUB AND NOT THE REAL ENDPOINTS: the gate's three outcomes are defined by what two
 * remote services answer, and the only one reproducible against production today is "absent"
 * (every version at or below the baseline is deliberately not re-checked, and no post-baseline
 * version carries provenance yet). A release-path check that can only be exercised by cutting
 * a release is a check nobody runs, so the script takes its two base URLs from
 * LORE_PROVENANCE_REGISTRY / LORE_PROVENANCE_GITHUB_API and this file points them at a local
 * server that can produce every answer, including the ones we hope never to see again.
 *
 * The assertion that matters most is the negative one: a 404 from the GitHub API (repository
 * not found / not readable) and a rate limit must NOT be reported as a dangling commit. Those
 * are failures to check, and a gate that confuses them with a failed check either cries
 * tampering over a bad token or gets switched off.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "release-provenance.mjs");

/** A destroyed commit — the shape 0.6.0's real attestation has today. */
const GONE_SHA = "59ba30e497f8e98aa6c6be022d9363fd718fb4ee";
/** A commit the stub GitHub API resolves. */
const LIVE_SHA = "a694b40c5cfe9e0e02b4a2f712f25a6428c68b6b";
/** Resolving this one exhausts the stub's rate limit instead of answering. */
const RATE_LIMITED_SHA = "1111111111111111111111111111111111111111";
/** This one is attested against a repository the stub answers 404 for. */
const UNKNOWN_REPO_SHA = "2222222222222222222222222222222222222222";

const REPO = "opum-ai/lore-cli";
const MISSING_REPO = "opum-ai/does-not-exist";

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

/**
 * Which attestation (if any) the stub registry serves per version. `null` means "no
 * attestation" — served as the 404 npm really answers with.
 */
const ATTESTED: Record<string, { commit: string; repo: string } | null> = {
  "0.5.0": { commit: GONE_SHA, repo: REPO }, // at/below baseline: reported, never re-checked
  "0.6.0": { commit: GONE_SHA, repo: REPO }, // the baseline itself
  "0.6.1": null, // manual publish, no provenance at all
  "0.7.0": { commit: LIVE_SHA, repo: REPO }, // post-baseline, healthy
  "0.7.1": { commit: GONE_SHA, repo: REPO }, // post-baseline, dangling => the gate failure
  "0.7.2": { commit: RATE_LIMITED_SHA, repo: REPO }, // post-baseline, undeterminable
  "0.7.3": { commit: UNKNOWN_REPO_SHA, repo: MISSING_REPO }, // 404 on the repo, not the commit
};

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const path = decodeURIComponent(url.pathname);

      // --- stub GitHub API -------------------------------------------------
      const commitMatch = /^\/repos\/([^/]+\/[^/]+)\/commits\/([0-9a-f]+)$/.exec(path);
      if (commitMatch) {
        const repo = commitMatch[1] ?? "";
        const sha = commitMatch[2] ?? "";
        if (repo !== REPO) {
          // GitHub's answer when the REPOSITORY is missing or unreadable — never when a
          // commit is missing from a visible repo.
          return Response.json({ message: "Not Found", status: "404" }, { status: 404 });
        }
        if (sha === RATE_LIMITED_SHA) {
          return Response.json(
            { message: "API rate limit exceeded" },
            {
              status: 403,
              headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "4102444800" },
            },
          );
        }
        if (sha === LIVE_SHA) return Response.json({ sha });
        return Response.json({ message: `No commit found for SHA: ${sha}`, status: "422" }, { status: 422 });
      }

      // --- stub npm registry -----------------------------------------------
      const attestationMatch = /^\/-\/npm\/v1\/attestations\/(.+)@([^@]+)$/.exec(path);
      if (attestationMatch) {
        const version = attestationMatch[2] ?? "";
        const attested = ATTESTED[version];
        if (!attested) return Response.json({ error: "Not found" }, { status: 404 });
        return new Response(attestationBody(attested.commit, attested.repo, `refs/tags/v${version}`), {
          headers: { "content-type": "application/json" },
        });
      }
      if (path === "/@opum-ai/lore") {
        const versions: Record<string, unknown> = {};
        for (const version of Object.keys(ATTESTED)) versions[version] = { version };
        return Response.json({ name: "@opum-ai/lore", versions });
      }

      return new Response("unexpected stub request", { status: 500 });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

async function runGate(args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["node", SCRIPT, ...args], {
    env: {
      ...process.env,
      LORE_PROVENANCE_REGISTRY: base,
      LORE_PROVENANCE_GITHUB_API: base,
      // Keep the real token out of the stub, and keep the job summary out of the test run.
      GITHUB_TOKEN: "",
      GH_TOKEN: "",
      GITHUB_STEP_SUMMARY: "",
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

describe("release-provenance gate outcomes", () => {
  test("attestation ABSENT passes, loudly, naming the manual-publish cause (LCLI-482)", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.6.1", "--package", "@opum-ai/lore"]);
    expect(code).toBe(0);
    expect(out).toContain("absent       @opum-ai/lore@0.6.1");
    // Loud, not silent: the gap has to be a recorded fact on the run, every run.
    expect(out).toContain("::warning::");
    expect(out).toContain("LCLI-482");
    expect(out).not.toContain("::error::");
  });

  test("attestation PRESENT pinning a resolvable commit passes with no annotation", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.0", "--package", "@opum-ai/lore"]);
    expect(code).toBe(0);
    expect(out).toContain("ok           @opum-ai/lore@0.7.0");
    expect(out).not.toContain("::error::");
    expect(out).not.toContain("::warning::");
  });

  test("attestation PRESENT pinning a commit the API cannot resolve FAILS (the LCLI-481 defect)", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.1", "--package", "@opum-ai/lore"]);
    expect(code).toBe(1);
    expect(out).toContain("dangling     @opum-ai/lore@0.7.1");
    expect(out).toContain("::error::");
    expect(out).toContain(GONE_SHA);
  });

  test("a rate limit is inconclusive, never dangling, and never red", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.2", "--package", "@opum-ai/lore"]);
    expect(code).toBe(0);
    expect(out).toContain("inconclusive @opum-ai/lore@0.7.2");
    expect(out).toContain("rate limit");
    // The outcome COLUMN is what must never say dangling; the warning prose deliberately
    // mentions the word to say it is not drawing that conclusion.
    expect(out).not.toContain("dangling     @opum-ai");
    expect(out).not.toContain("::error::");
  });

  test("a 404 on the repository is inconclusive, not a missing commit", async () => {
    const { code, out } = await runGate(["--post", "--version", "0.7.3", "--package", "@opum-ai/lore"]);
    expect(code).toBe(0);
    expect(out).toContain("inconclusive @opum-ai/lore@0.7.3");
    expect(out).toContain("NOT evidence about the commit");
    expect(out).not.toContain("dangling     @opum-ai");
  });

  test("--post covers every package of the release, not a sample", async () => {
    const { code, out } = await runGate([
      "--post",
      "--version",
      "0.7.0",
      "--package",
      "@opum-ai/lore",
      "--package",
      "@opum-ai/lore-darwin-arm64",
    ]);
    expect(code).toBe(0);
    expect(out).toContain("@opum-ai/lore@0.7.0");
    expect(out).toContain("@opum-ai/lore-darwin-arm64@0.7.0");
  });
});

describe("release-provenance --pre over the published history", () => {
  test("baseline versions are reported but never failed on; a post-baseline dangle fails", async () => {
    const { code, out } = await runGate(["--pre"]);
    // 0.7.1 dangles above the baseline — that is a new rewrite and it must be red.
    expect(code).toBe(1);
    expect(out).toContain("dangling     @opum-ai/lore@0.7.1");
    // 0.5.0/0.6.0 dangle too, but they are the accepted, unrepairable 2026-09-10 loss. They
    // stay on the record without reding every release forever.
    expect(out).toContain("baseline set");
    expect(out).toContain("0.5.0, 0.6.0");
    expect(out).not.toContain("dangling     @opum-ai/lore@0.6.0");
  });

  test("--limit bounds how much history is re-verified", async () => {
    const { out } = await runGate(["--pre", "--limit", "1"]);
    // Only the newest post-baseline version (0.7.3) is scanned.
    expect(out).toContain("checking the most recent 1");
    expect(out).not.toContain("@opum-ai/lore@0.7.1 ");
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
