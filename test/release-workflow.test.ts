/**
 * release-workflow.test.ts — safety-gate invariants for `.github/workflows/release.yml`'s
 * `publish` job (LORE-255).
 *
 * `release.yml` is manually rehearsed with `npm publish --dry-run` (see
 * docs/runbooks/release-publishing.md's "Dry-run rehearsal" section) rather than executed
 * by CI — bun:test has no GitHub Actions runner. What CAN be checked here, statically, is
 * the one property that matters most for an irreversible action like a real `npm publish`:
 * that the `publish` job stays gated behind an explicit `workflow_dispatch` input and never
 * inherits registry-publishing credentials by accident. A future edit that drops the `if:`
 * guard, widens the trigger beyond `workflow_dispatch`, or hoists `id-token: write` to the
 * workflow-level `permissions:` block (granting it to every job, not just `publish`) would
 * pass `bun run typecheck`/`bun run lint` and even `actionlint` (both are silent on this
 * kind of policy drift) — this test is the guard for exactly that regression.
 *
 * LORE-268 adds one more assertion in the same spirit: the `publish` job must declare
 * `environment: release`. That declaration is an OUT-OF-FILE gate — it ties the job to
 * GitHub Environment protection rules (required reviewers / allowed deployment branches)
 * configured in repo Settings, not in this file — which is what keeps a wholesale-replaced
 * copy of release.yml on an attacker-controlled branch from bypassing every in-file guard
 * this suite already checks (repo write access + `workflow_dispatch` is enough to dispatch
 * *some* copy of this workflow on *some* ref; npm Trusted Publishing matches on repo +
 * workflow filename, not a ref). Removing the `environment:` line fails this file's new
 * test even though it would still pass `typecheck`/`lint`/`actionlint`.
 */

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import * as yaml from "js-yaml";

const WORKFLOW_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");

/** The handful of `release.yml` fields this file's assertions actually read. */
interface WorkflowStep {
  name?: string;
  if?: string;
  uses?: string;
  with?: Record<string, string | boolean>;
  env?: Record<string, string>;
  run?: string;
  "continue-on-error"?: boolean;
}

interface WorkflowJob {
  if?: string;
  needs?: string[] | string;
  permissions?: Record<string, string>;
  environment?: string;
  steps?: WorkflowStep[];
  "continue-on-error"?: boolean;
  "timeout-minutes"?: number;
}

interface WorkflowDoc {
  on: {
    workflow_dispatch?: {
      inputs?: {
        publish?: { default?: boolean };
        acknowledge_dangling_provenance?: { type?: string; default?: string };
        launcher_rc?: { type?: string; default?: number };
      };
    };
  };
  permissions: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

// JSON_SCHEMA (not the default schema): this repo's established YAML-safety idiom
// (src/core/concept.ts) — rejects YAML 1.1 extras (e.g. `on`/`off` as booleans) that
// would otherwise silently misparse a GitHub Actions workflow's `on:` top-level key.
function loadWorkflow(): WorkflowDoc {
  return yaml.load(readFileSync(WORKFLOW_PATH, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
}

describe("release.yml publish job stays safely gated", () => {
  test("the workflow only ever triggers on workflow_dispatch (never push/tag)", () => {
    const doc = loadWorkflow();
    expect(Object.keys(doc.on)).toEqual(["workflow_dispatch"]);
  });

  test("the publish input defaults to false", () => {
    const doc = loadWorkflow();
    expect(doc.on.workflow_dispatch?.inputs?.publish?.default).toBe(false);
  });

  test("the publish job requires an explicit publish:true dispatch", () => {
    const doc = loadWorkflow();
    expect(doc.jobs.publish).toBeDefined();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax (release.yml's own `if:` value), not a JS template placeholder.
    expect(doc.jobs.publish?.if).toBe("${{ inputs.publish == true }}");
  });

  test("the publish job depends on packages produced by matching-host qualification", () => {
    const doc = loadWorkflow();
    expect(doc.jobs.publish?.needs).toContain("package");
    expect(doc.jobs.package?.needs).toContain("package-qualification");
    expect(doc.jobs["package-qualification"]?.needs).toContain("verify-versions");
    expect(doc.jobs.build).toBeUndefined();
  });

  test("id-token: write is scoped to the publish job only, not the workflow", () => {
    const doc = loadWorkflow();
    // Workflow-level permissions stay read-only — no job silently inherits an OIDC
    // token by omitting its own `permissions:` block.
    expect(doc.permissions).toEqual({ contents: "read" });
    expect(doc.jobs.publish?.permissions?.["id-token"]).toBe("write");
    // No OTHER job declares id-token: write.
    for (const [name, job] of Object.entries(doc.jobs)) {
      if (name === "publish") continue;
      expect(job.permissions?.["id-token"]).not.toBe("write");
    }
  });

  test("the publish job requires the 'release' GitHub Environment — an out-of-file gate (LORE-268)", () => {
    const doc = loadWorkflow();
    // Regression this guards: `if:`/version/floor guards all live INSIDE release.yml, so an
    // actor with write access can push a branch carrying a copy of this file with every one
    // of them stripped and dispatch it there — npm Trusted Publishing matches on repo +
    // workflow FILENAME, not a ref, so that forged dispatch would still authenticate. Only a
    // control configured OUTSIDE this file (GitHub Environment protection rules, evaluated
    // from repo Settings, not from workflow content) can survive the file itself being
    // replaced. This assertion only proves the job still NAMES the environment — the
    // protection rules themselves are repo-admin configuration this test cannot see or
    // enforce; see docs/runbooks/release-publishing.md for the required manual setup and the
    // residual risk until it exists.
    expect(doc.jobs.publish?.environment).toBe("release");
  });

  test("the publish job publishes via npm (no unrelated registry)", () => {
    const doc = loadWorkflow();
    const setupNodeStep = doc.jobs.publish?.steps?.find((s) => s.uses?.startsWith("actions/setup-node@"));
    expect(setupNodeStep).toBeDefined();
    expect(setupNodeStep?.with?.["registry-url"]).toBe("https://registry.npmjs.org");
  });

  test("the publish step publishes the root/launcher tarball LAST, after every platform tarball, not via a naive glob loop", () => {
    const doc = loadWorkflow();
    const publishStep = doc.jobs.publish?.steps?.find((s) => s.run?.includes("npm publish"));
    expect(publishStep).toBeDefined();
    const script = publishStep?.run ?? "";

    // The regression this guards: `for tgz in dist-npm/*.tgz; do ... npm publish
    // "$tgz" ... done` publishes in filesystem-collation order, which sorts the root
    // launcher tarball (`opum-ai-lore-<version>.tgz`) BEFORE its platform
    // optionalDependencies (`opum-ai-lore-<platform>-<version>.tgz`) — a digit
    // sorts before a letter. That inverts the required publish order for this
    // distribution shape (root's optionalDependencies pin the platform packages
    // exactly; bin/lore.cjs require.resolve()s them at runtime) and, combined with
    // `run:` executing under `bash -e`, makes a mid-loop failure leave the root
    // published with no working binaries — a version that can never be republished.
    expect(script).not.toMatch(/for\s+\w+\s+in\s+dist-npm\/\*\.tgz;\s*do\b/);

    // The root/launcher tarball must be split out from the platform tarballs (not
    // published inside the same undifferentiated loop) and published only after
    // every platform tarball has already been handled.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash array-expansion syntax from release.yml's own script, not a JS template placeholder.
    const platformLoopIndex = script.indexOf('for tgz in "${platform_tgz[@]}"');
    const rootPublishIndex = script.lastIndexOf('publish_or_skip "$root"');
    expect(platformLoopIndex).toBeGreaterThan(-1);
    expect(rootPublishIndex).toBeGreaterThan(platformLoopIndex);

    // Resumable: a run that fails partway through must be safe to re-dispatch without
    // 403ing (EPUBLISHCONFLICT) on packages already published.
    expect(script).toMatch(/npm view/);

    // ...but only past THIS run's bytes (LCLI-621 review): the skip compares the registry's
    // dist.integrity with the tarball's and fails before it can return. Pinned statically as well as
    // executed below, because the executed cases are POSIX-only.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash parameter expansion from release.yml's own script, not a JS template placeholder.
    const integrityRead = script.indexOf('npm view "${name}@${version}" dist.integrity');
    const refusal = script.indexOf("is already on the registry with different bytes", integrityRead);
    const skip = script.indexOf("already published as this run's bytes", integrityRead);
    expect(integrityRead).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(integrityRead);
    expect(skip).toBeGreaterThan(refusal);
    expect(script.slice(refusal, skip)).toContain("exit 1");
  });

  test("the publish step refuses to publish the pre-release placeholder version 0.0.0, before publishing anything", () => {
    const doc = loadWorkflow();
    const publishStep = doc.jobs.publish?.steps?.find((s) => s.run?.includes("npm publish"));
    expect(publishStep).toBeDefined();
    const script = publishStep?.run ?? "";

    // The regression this guards: every OTHER precondition in this workflow fails
    // loud (the npm-floor assertion, derived tarball-count assertions, and
    // verify-versions' metadata cross-check) — but nothing refused the one value that actually matters
    // for an irreversible `npm publish`: the placeholder version itself. Because the
    // First-release checklist deliberately orders Trusted Publisher registration
    // (step 1) before the version bump (step 2), a `publish: true` dispatch made
    // between those two steps would otherwise sail through every other check and
    // publish an installable `0.0.0` release.
    expect(script).toMatch(/0\.0\.0/);
    expect(script).toMatch(/refusing to publish version/);

    // The guard must run before ANY tarball is actually published — i.e. before the
    // platform-tarball publish loop starts, not interleaved with or after it.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash array-expansion syntax from release.yml's own script, not a JS template placeholder.
    const platformLoopIndex = script.indexOf('for tgz in "${platform_tgz[@]}"');
    const guardIndex = script.indexOf("0.0.0");
    expect(platformLoopIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(platformLoopIndex);
  });

  test("publish_or_skip fails loud (not open) if a tarball's name/version extraction produces nothing", () => {
    const doc = loadWorkflow();
    const publishStep = doc.jobs.publish?.steps?.find((s) => s.run?.includes("npm publish"));
    expect(publishStep).toBeDefined();
    const script = publishStep?.run ?? "";

    // The regression this guards: `read -r name version <<< "$(cmd)"` fails OPEN when
    // `cmd` errors — a here-string always supplies a trailing newline, so `read`
    // returns 0 even when the substitution produced nothing, and `run:` steps execute
    // under `bash -e` WITHOUT `pipefail`, so neither a `tar` extraction failure nor a
    // `node` JSON-parse crash aborts the function. Without an explicit emptiness
    // check immediately after the `read`, `name`/`version` silently become empty,
    // `npm view "@" version` fails (indistinguishable from "never published"), and
    // the tarball gets published unconditionally — turning a resumable re-dispatch
    // back into the EPUBLISHCONFLICT abort the resumability feature exists to prevent.
    const readIndex = script.indexOf("read -r name version");
    expect(readIndex).toBeGreaterThan(-1);
    const guardIndex = script.indexOf('[ -z "$name" ] || [ -z "$version" ]');
    expect(guardIndex).toBeGreaterThan(readIndex);
    // The guard's failure path must actually exit, not just log — the very next
    // `npm view`/`npm publish` calls must never see empty name/version.
    const npmViewIndex = script.indexOf("npm view", guardIndex);
    const exitIndex = script.indexOf("exit 1", guardIndex);
    expect(exitIndex).toBeGreaterThan(guardIndex);
    expect(exitIndex).toBeLessThan(npmViewIndex);
  });

  test("the publish inventory derives its expected counts from the platform matrix", () => {
    const doc = loadWorkflow();
    const publishStep = doc.jobs.publish?.steps?.find((s) => s.run?.includes("npm publish"));
    const script = publishStep?.run ?? "";

    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal bash array expansion in release.yml.
    expect(script).toContain("expected_platform_count=${#platform_names[@]}");
    // Eight in the artifact since LCLI-621: the platforms, the X-rc.N launcher, the carried X one.
    expect(script).toContain("expected_total_count=$((expected_platform_count + 2))");
    expect(script).not.toMatch(/platform_tgz\[@\].*-ne\s+[0-9]/);
  });

  test("install sanity rejects runtime dependencies and an installed Ladybug package", () => {
    const workflow = readFileSync(WORKFLOW_PATH, "utf8");
    expect(workflow).toContain("published launcher unexpectedly contains runtime dependencies");
    expect(workflow).toContain("published launcher unexpectedly installed @ladybugdb/core");
  });
});

describe("release.yml keeps the provenance gate ENFORCING, not merely present (LCLI-481)", () => {
  /**
   * These assertions are about enforcement, not shape. The first revision of this block
   * checked that the jobs existed and ran the right flags — and every standard way of
   * disabling a gate passed it: adding `continue-on-error: true` to the job (GitHub runs the
   * dependents of a job that failed under it, so `publish` proceeds past a red gate), adding
   * `|| true` to the step, or adding an `if:` that never matches. A test that a gate is
   * PRESENT is not a test that it can still STOP anything.
   */
  const NEUTERING_RUN_PATTERNS = [/\|\|\s*true/, /\|\|\s*:/, /;\s*true\s*$/m, /set\s+\+e/, /continue-on-error/];

  function provenanceStep(job: WorkflowJob | undefined): WorkflowStep | undefined {
    return job?.steps?.find((s) => s.run?.includes("release-provenance.mjs"));
  }

  test("the pre-publish provenance check gates the publish job", () => {
    const doc = loadWorkflow();
    expect(doc.jobs["provenance-pre"]).toBeDefined();
    expect(doc.jobs.publish?.needs).toContain("provenance-pre");
    expect(provenanceStep(doc.jobs["provenance-pre"])?.run).toContain("--pre");
  });

  test("a failure of the pre check actually stops the publish job", () => {
    const doc = loadWorkflow();
    const job = doc.jobs["provenance-pre"];
    // continue-on-error at either level converts the gate into a log message: the job reports
    // failure, GitHub treats it as success for `needs:` purposes, and publish runs anyway.
    expect(job?.["continue-on-error"]).toBeUndefined();
    for (const step of job?.steps ?? []) expect(step["continue-on-error"]).toBeUndefined();
    // No `if:` — the job must be unconditional. Anything conditional here is one edit away
    // from a gate that is silently never evaluated.
    expect(job?.if).toBeUndefined();
    // And the command itself must not swallow its own exit code.
    const run = provenanceStep(job)?.run ?? "";
    expect(run).not.toBe("");
    for (const pattern of NEUTERING_RUN_PATTERNS) expect(run).not.toMatch(pattern);
  });

  test("the waiver can only ever come from the dispatch input, never from the file", () => {
    const doc = loadWorkflow();
    const run = provenanceStep(doc.jobs["provenance-pre"])?.run ?? "";
    // A hardcoded `--acknowledge LCLI-481` in the workflow would waive every dangling finding
    // on every run, permanently and invisibly — a deleted gate that still looks wired up. The
    // only permitted form is the dispatch input, which is per-run and shows in the run record.
    expect(run).toContain('--acknowledge "$ACKNOWLEDGE"');
    expect(run.replace('--acknowledge "$ACKNOWLEDGE"', "")).not.toContain("--acknowledge");
    const input = doc.on.workflow_dispatch?.inputs?.acknowledge_dangling_provenance;
    expect(input?.type).toBe("string");
    expect(input?.default).toBe("");
  });

  test("the post-publish provenance check runs even when publish FAILED", () => {
    const doc = loadWorkflow();
    const job = doc.jobs["provenance-post"];
    expect(job?.needs).toBe("publish");
    // A bare `needs:` would skip this job whenever publish failed — and a partial publish is
    // exactly the case that produces one version carrying two different pinned commits
    // (release.yml's publish_or_skip is resumable across dispatches, by design). The literal is
    // asserted rather than merely "an if exists" so any edit to it has to be deliberate.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax from release.yml, not a JS template placeholder.
    expect(job?.if).toBe("${{ !cancelled() && needs.publish.result != 'skipped' }}");
    expect(job?.["continue-on-error"]).toBeUndefined();
    const run = provenanceStep(job)?.run ?? "";
    expect(run).toContain("--post");
    for (const pattern of NEUTERING_RUN_PATTERNS) expect(run).not.toMatch(pattern);
  });

  test("both provenance jobs are time-bounded", () => {
    const doc = loadWorkflow();
    // provenance-pre gates publish, so a hung connection would otherwise hold a runner for the
    // 6-hour default with the release waiting behind it.
    for (const name of ["provenance-pre", "provenance-post"]) {
      const timeout = doc.jobs[name]?.["timeout-minutes"];
      expect(typeof timeout).toBe("number");
      expect(timeout).toBeGreaterThan(0);
    }
  });

  test("neither provenance job is handed a registry credential line", () => {
    const doc = loadWorkflow();
    // `actions/setup-node` writes `//registry.npmjs.org/:_authToken=...` into .npmrc whenever
    // `registry-url` is set. These jobs only GET public JSON; a publish-shaped credential in a
    // job that never publishes is surface for nothing.
    for (const job of ["provenance-pre", "provenance-post"]) {
      const setupNode = doc.jobs[job]?.steps?.find((s) => s.uses?.startsWith("actions/setup-node@"));
      expect(setupNode).toBeDefined();
      expect(setupNode?.with?.["registry-url"]).toBeUndefined();
    }
  });
});

// ── Constitution Article 3 (LCLI-613) ──────────────────────────────────────────────────────────
// Clause 6: the release workflow refuses to publish when lore's and quest's versions differ.
// Clause 5: publication stages under `release-candidate` and never moves `latest`. Both are
// asserted against the parsed workflow, so a reordering or a dropped flag fails here even though
// actionlint and typecheck stay silent on it.
// ── The publish-site scanner (LCLI-621 refinement iv; hardened after final review F4) ─────────────
type ScannedFile = { path: string; text: string };
type PublishSite = { path: string; text: string };

/**
 * Tracked paths NOT scanned, each for a stated reason. Everything else that git tracks and that is
 * text is scanned, whatever its directory or extension.
 */
const PUBLISH_SCAN_EXCLUDED: RegExp[] = [
  /\.md$/, // prose: runbooks, CHANGELOG, CLAUDE.md and ADRs describe `npm publish` by the dozen
  /^\.quest\//, // tracker records: prose in JSON, never executed
  /^docs\//, // the documentation bundle, prose (its .md is excluded above; this covers any data beside it)
  /^archive\//, // retired material kept for history, never executed
  /^research\//, // survey data about other tools, never executed
  // Test sources and their fixtures: they spell publish argv on purpose, to drive stub `npm`s and to
  // assert on what the scripts hand to npm. They never run in a release. Scanning them would turn
  // this allowlist into a copy of every test's expectations.
  /^test\//,
];

const SHELL_LIKE = /\.(sh|bash|zsh|ya?ml|toml)$/;
const JS_LIKE = /\.(js|mjs|cjs|ts|mts|cts|tsx|jsx)$/;

/**
 * Every line that could be a publish. Rule A: a `publish` word on a line that also names npm, pnpm,
 * bun or yarn ANYWHERE -- so `x && npm publish`, `npm --registry r publish`, `- run: npm publish`,
 * `pnpm publish`, `bun publish` and a JS template all count. Rule B: a "publish" string literal in
 * JS/TS source, which catches an argv array built apart from its `npm`. Rule C: a shell array whose
 * first word is `publish` (`args=(publish ...)`, `args+=(publish ...)`), the bash form of the same
 * thing -- publish-release.sh's own site is one, and names no package manager on its line, so rule
 * A alone missed it (found by running this scanner on the real tree). Only FULL-LINE comments are
 * skipped (`#` in shell-like files, `//`, `*`, `/*` in JS/TS); a trailing comment is still read.
 * Known limit: a shell command split across lines with `\` (`npm \` then `publish`) is not seen.
 */
function publishSites(files: ScannedFile[]): PublishSite[] {
  const sites: PublishSite[] = [];
  for (const { path, text } of files) {
    const shellLike = SHELL_LIKE.test(path);
    const jsLike = JS_LIKE.test(path);
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (shellLike && line.startsWith("#")) continue;
      if (jsLike && (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*"))) continue;
      const ruleA = /\bpublish\b/.test(line) && /\b(npm|pnpm|bun|yarn)\b/.test(line);
      const ruleB = jsLike && /["'`]publish["'`]/.test(line);
      const ruleC = shellLike && /\(\s*["']?publish\b/.test(line);
      if (ruleA || ruleB || ruleC) sites.push({ path, text: line });
    }
  }
  return sites;
}

/**
 * EVERY line the scanner finds in the repository today, exact, in `git ls-files` order. Three run a
 * publish (marked RUNS); the rest are messages, a job name and a Keychain service name that happen
 * to name npm and publish together. Editing any of these lines means editing this list.
 * readme-readback.sh's two lines belong to LCLI-616's file: an edit there lands here too.
 */
const PUBLISH_SITE_ALLOWLIST: PublishSite[] = [
  { path: ".github/workflows/release.yml", text: "name: publish (npm, OIDC trusted publishing)" },
  {
    path: ".github/workflows/release.yml",
    text: 'echo "::error::a registry auth token is configured for this job. npm still ATTEMPTS OIDC first, but this token becomes the silent fallback if the exchange fails -- publishing under the wrong identity without provenance, or returning an E404 that looks like a missing trust relationship. Remove the NPM_TOKEN secret / node-auth-token input from the publish job; trusted publishing needs no stored credential."',
  },
  {
    path: ".github/workflows/release.yml",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
    text: "echo \"::error::${name}@${version} is already on the registry with different bytes (registry dist.integrity '${got}', this run's ${tgz} ${want}). It was published outside this run. npm versions are immutable: for the X-rc.N launcher, re-dispatch with launcher_rc set to the next N; for an X platform package a new rc cannot help (every rc pins X), so re-run the failed publish job of the Release run whose platform tarballs are the registry's ('Re-run failed jobs', NOT 'Re-run all jobs', which re-runs package and overwrites npm-packages; a re-dispatch rebuilds and may not match), or, if those platforms were staged by scripts/publish-release.sh from a publish: false run that has no failed publish job, run 'scripts/publish-release.sh ${version} <that run id>'; otherwise cut a new version. Do NOT run npm unpublish.\"",
  },
  { path: ".github/workflows/release.yml", text: 'echo "::group::npm publish $tgz ($name@$version)"' },
  // RUNS: staging, under release-candidate.
  { path: ".github/workflows/release.yml", text: 'npm publish "$tgz" --tag release-candidate' },
  {
    path: ".github/workflows/release.yml",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
    text: 'echo "::warning::still not visible on the registry read API after ${REGISTRY_WINDOW_SECONDS}s:${pending}. This is NOT proof the publish failed -- npm already confirmed it, and only the registry read API is behind (LCLI-460: 0.4.5 ~15s, 0.4.6 ~35s, 0.5.0 ~25min). Do NOT unpublish. Re-check before treating it as a failure."',
  },
  { path: "scripts/promote-latest.mjs", text: 'export const KEYCHAIN_SERVICE = "npm-opum-ai-publish";' },
  // RUNS: the ONE publish without release-candidate -- the X launcher, --tag latest.
  {
    path: "scripts/promote-latest.mjs",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
    text: 'return ["publish", tarball, "--tag", PROMOTE_TAG, `--registry=${PUBLIC_REGISTRY}`, ...(otp ? ["--otp", otp] : [])];',
  },
  {
    path: "scripts/promote-latest.mjs",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
    text: "`Refusing to promote ${version}: ${reason(error)}. Whether ${version} is already on npm decides publish or tag-move. Nothing has moved.`,",
  },
  // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
  { path: "scripts/publish-release.sh", text: 'KEYCHAIN_SERVICE="${KEYCHAIN_SERVICE:-npm-opum-ai-publish}"' },
  {
    path: "scripts/publish-release.sh",
    text: "gate and before npm publish. Something outside this script wrote to $ARTIFACTS. Find out what",
  },
  {
    path: "scripts/publish-release.sh",
    text: 'say "  IT MAY ALSO NOT BE LAG AT ALL (LCLI-502). npm 12 can park a publish in a non-public"',
  },
  {
    path: "scripts/publish-release.sh",
    text: 'workflow with launcher_rc set to the next N, then publish that run. Do NOT run npm unpublish."',
  },
  // RUNS: staging -- STAGE_TAG is release-candidate, asserted below.
  { path: "scripts/publish-release.sh", text: 'local npm_args=(publish "$tarball" --tag "$STAGE_TAG")' },
  {
    path: "scripts/publish-release.sh",
    text: 'die "npm publish for $pkg@$ver printed text this script recognises as a 2FA challenge',
  },
  {
    path: "scripts/readme-readback.sh",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
    text: "echo \"::warning::${name}: after ${REGISTRY_WINDOW_SECONDS}s the registry is still serving the README of the PREVIOUS release (${prev}), not ${version}'s. It satisfies ${prev}'s assertions exactly, which is what propagation lag looks like on an established package -- npm's readme field is package-level and updates when the publish finishes propagating (LCLI-460: 0.5.0 took ~25min). This is NOT a confirmed defect and NOT a reason to unpublish. Re-read 'npm view ${name} readme' later; if it still shows ${prev} once propagation is plainly done, THAT is the defect, and the fix is the next release.\"",
  },
  {
    path: "scripts/readme-readback.sh",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
    text: "echo \"::error::A4 FAILED for package '${name}', release '${version}', read $(date -u +%FT%TZ) after ${attempt} attempt(s) over ${REGISTRY_WINDOW_SECONDS}s. The readme npm serves satisfies NEITHER ${version}'s assertions NOR ${prev:-the previous release}'s, so propagation lag has been ruled out -- this is not a replica catching up, it is a page that matches no release we published. The packed tarball passed the gate, so the divergence was introduced at or after publish. This page is IMMUTABLE: the fix is the next release, never an unpublish. Findings against ${version}:\"",
  },
];

describe("release.yml enforces constitution Article 3 (LCLI-613)", () => {
  const publishSteps = () => loadWorkflow().jobs.publish?.steps ?? [];
  const parityIndex = (steps: WorkflowStep[]) =>
    steps.findIndex((s) => /node parity\/scripts\/version-parity\.mjs --require\s*$/.test(s.run ?? ""));

  test("the publish job gates on lore/quest version parity BEFORE its first npm publish", () => {
    const steps = publishSteps();
    const gate = parityIndex(steps);
    const firstPublish = steps.findIndex((s) => /^\s*npm publish\b/m.test(s.run ?? ""));
    expect(gate).toBeGreaterThan(-1);
    expect(firstPublish).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(firstPublish);
    const step = steps[gate] as WorkflowStep;
    // Fail closed: nothing lets a red gate through, and the read has a token to make.
    expect(step["continue-on-error"]).toBeUndefined();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax from release.yml, not a JS template placeholder.
    expect(step.env?.GH_TOKEN).toBe("${{ github.token }}");
  });

  test("the gate runs the checker it names, from a sparse checkout with no persisted credential", () => {
    const steps = publishSteps();
    const gate = parityIndex(steps);
    const checkout = steps.slice(0, gate).find((s) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout).toBeDefined();
    expect(checkout?.with?.path).toBe("parity");
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    const sparse = String(checkout?.with?.["sparse-checkout"] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    // Anchored: in non-cone mode an unanchored "package.json" matches at every depth.
    expect(sparse.sort()).toEqual(["/package.json", "/scripts/version-parity.mjs"]);
    expect(checkout?.with?.["sparse-checkout-cone-mode"]).toBe(false);
    // The file the gate runs exists at that path in this repository.
    expect(readFileSync(join(import.meta.dir, "..", "scripts", "version-parity.mjs"), "utf8")).toContain(
      "export function checkVersionParity",
    );
  });

  // LCLI-620: the publish job is skipped on a publish:false dispatch, taking its parity step with
  // it, so a rehearsal went green on a mismatched pair. A second job evaluates it on every dispatch.
  test("parity is evaluated on EVERY dispatch, and publish cannot start without it (LCLI-620)", () => {
    const doc = loadWorkflow();
    const job = doc.jobs["version-parity"];
    expect(job).toBeDefined();
    // No condition at all: any `if:` could reintroduce the publish-only skip, directly or not.
    expect(job?.if).toBeUndefined();
    expect(job?.["continue-on-error"]).toBeUndefined();
    // A `needs:` on any conditionally skipped job would skip this one with it, silently.
    expect(job?.needs).toBeUndefined();
    const steps = job?.steps ?? [];
    // A step-level `if:` would leave the job running and the gate skipped: green over a mismatch
    // (LCLI-620 review finding 1). No step in this job may carry one.
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) expect(s.if).toBeUndefined();
    const gate = parityIndex(steps);
    expect(gate).toBeGreaterThan(-1);
    const step = steps[gate] as WorkflowStep;
    expect(step["continue-on-error"]).toBeUndefined();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax from release.yml, not a JS template placeholder.
    expect(step.env?.GH_TOKEN).toBe("${{ github.token }}");
    const checkout = steps.slice(0, gate).find((s) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with?.path).toBe("parity");
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    expect(checkout?.with?.["sparse-checkout-cone-mode"]).toBe(false);
    const sparse = String(checkout?.with?.["sparse-checkout"] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(sparse.sort()).toEqual(["/package.json", "/scripts/version-parity.mjs"]);
    // A red parity job must block the real publish, not merely sit beside it.
    expect(doc.jobs.publish?.needs).toContain("version-parity");
  });

  test("every npm publish in release.yml stages under release-candidate, and nothing writes latest", () => {
    const doc = loadWorkflow();
    const commands: string[] = [];
    for (const job of Object.values(doc.jobs))
      for (const step of job.steps ?? [])
        for (const line of (step.run ?? "").split("\n"))
          if (/^\s*npm (publish|dist-tag)\b/.test(line)) commands.push(line.trim());
    // Positive control: the loop below must have something to check, or it passes vacuously.
    expect(commands.filter((c) => c.startsWith("npm publish")).length).toBeGreaterThanOrEqual(1);
    // NO EXCEPTION IN THIS FILE (LCLI-621). The paired design settled with quest-cli (QCLI-399,
    // refinement iv) admits exactly one publish without --tag release-candidate anywhere: the X
    // launcher's fresh publish with --tag latest, in the promote script only -- pinned repository-
    // wide by the next test. release.yml stages; the X launcher it packs is carried and never
    // published here, which the executed test of the publish step below pins.
    for (const command of commands) {
      if (command.startsWith("npm publish")) expect(command).toContain("--tag release-candidate");
      expect(command.split(/\s+/)).not.toContain("latest");
    }
  });

  // LCLI-621, the paired design's refinement iv: EXACTLY ONE `npm publish` in this repository omits
  // --tag release-candidate -- the X launcher's fresh publish with --tag latest -- and it is in
  // scripts/promote-latest.mjs's launcherPublishArgs and nowhere else. The scanner (publishSites,
  // below) reads EVERY git-tracked text file bar the prose/fixture classes in PUBLISH_SCAN_EXCLUDED
  // and reports every line that could be a publish, and the set must equal PUBLISH_SITE_ALLOWLIST
  // exactly. A new site anywhere, in any spelling the scanner sees, has to be admitted by editing
  // that list, which is the point: the exception is a reviewed line, not a pattern. Hardened after
  // the final review (F4) got eight spellings past a scanner that looked only at `npm publish` at
  // the start of a line in scripts/ and .github/; each spelling is a case below.
  test("exactly one npm publish site omits --tag release-candidate: promote-latest.mjs's X launcher, --tag latest", async () => {
    const repo = join(import.meta.dir, "..");
    const tracked = execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8" }).split("\n").filter(Boolean);
    const files: ScannedFile[] = [];
    for (const path of tracked) {
      if (PUBLISH_SCAN_EXCLUDED.some((rule) => rule.test(path))) continue;
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(repo, path));
      } catch {
        continue; // a tracked path deleted in the working tree is not a site
      }
      if (bytes.subarray(0, 8000).includes(0)) continue; // binary
      files.push({ path, text: bytes.toString("utf8") });
    }
    // Positive control: the scan read every tracked non-excluded text file, the known sites' among them.
    expect(files.length).toBeGreaterThan(100);
    for (const path of [
      ".github/workflows/release.yml",
      "scripts/publish-release.sh",
      "scripts/promote-latest.mjs",
      "package.json",
    ])
      expect(files.map((f) => f.path)).toContain(path);
    expect(publishSites(files)).toEqual(PUBLISH_SITE_ALLOWLIST);

    // Of the allowlisted sites, exactly three RUN a publish; two stage, one is the X launcher.
    const script = readFileSync(join(repo, "scripts", "publish-release.sh"), "utf8");
    expect(script.match(/^\s*STAGE_TAG=.*$/gm)).toEqual(['STAGE_TAG="release-candidate"']);
    expect(script).toContain('local npm_args=(publish "$tarball" --tag "$STAGE_TAG")');
    const promoteSource = readFileSync(join(repo, "scripts", "promote-latest.mjs"), "utf8").split("\n");
    const site = PUBLISH_SITE_ALLOWLIST.find(
      (s) => s.path === "scripts/promote-latest.mjs" && s.text.startsWith("return ["),
    );
    const index = promoteSource.findIndex((line) => line.trim() === site?.text);
    const owner = promoteSource
      .slice(0, index)
      .reverse()
      .find((line) => /^export function /.test(line));
    expect(owner).toBe("export function launcherPublishArgs(tarball, { otp } = {}) {");
    const promote = await import("../scripts/promote-latest.mjs");
    expect(promote.PROMOTE_TAG).toBe("latest");
    expect(promote.launcherPublishArgs("/artifact/opum-ai-lore-1.2.3.tgz")).toEqual([
      "publish",
      "/artifact/opum-ai-lore-1.2.3.tgz",
      "--tag",
      "latest",
      "--registry=https://registry.npmjs.org/",
    ]);
  });

  // The eight spellings the final review got past the previous scanner, plus a package.json script,
  // each fed to the scanner as a file of its own: every one must surface as a site the allowlist
  // does not admit.
  const evasions: Array<[string, ScannedFile]> = [
    ["a publish after &&", { path: "scripts/x.sh", text: "build && npm publish out.tgz\n" }],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exact text of a tracked file the scanner reads, not a JS template.
    ["a JS template string", { path: "scripts/x.mjs", text: "await sh(`npm publish ${tarball}`);\n" }],
    ["a JS argv built by concat", { path: "scripts/x.mjs", text: 'await run("npm", ["publish"].concat(args));\n' }],
    ["a run: step in another workflow", { path: ".github/workflows/other.yml", text: "      - run: npm publish\n" }],
    ["pnpm", { path: "scripts/x.sh", text: "pnpm publish --no-git-checks\n" }],
    ["bun", { path: "scripts/x.sh", text: "bun publish\n" }],
    ["a .bash file", { path: "scripts/release.bash", text: "npm publish dist/x.tgz\n" }],
    [
      "flags between npm and publish",
      { path: "scripts/x.sh", text: "npm --registry https://r.example publish x.tgz\n" },
    ],
    ["a package.json script", { path: "package.json", text: '    "release": "npm publish --tag latest",\n' }],
    ["yarn, outside scripts/", { path: "src/release.ts", text: 'execSync("yarn npm publish");\n' }],
    ["a bash argv array built apart from its npm", { path: "scripts/x.sh", text: 'args+=(publish "$t")\n' }],
  ];
  for (const [label, file] of evasions)
    test(`the scanner flags ${label} as an unadmitted publish site`, () => {
      const sites = publishSites([file]);
      expect(sites.length).toBe(1);
      expect(PUBLISH_SITE_ALLOWLIST).not.toContainEqual(sites[0]);
    });

  test("the scanner skips full-line comments, and only full-line comments", () => {
    expect(publishSites([{ path: "scripts/x.sh", text: "# npm publish x.tgz\n" }])).toEqual([]);
    expect(publishSites([{ path: "scripts/x.mjs", text: "// npm publish x.tgz\n * npm publish\n" }])).toEqual([]);
    expect(publishSites([{ path: "scripts/x.sh", text: "true # npm publish x.tgz\n" }])).toHaveLength(1);
    // JSON has no comments, so a `#` does not hide a line there.
    expect(publishSites([{ path: "package.json", text: '"#": "npm publish"\n' }])).toHaveLength(1);
  });
});

// ── The launcher stages as X-rc.N; the X launcher is carried and never staged (LCLI-621) ───────
// Constitution Article 3 clause 5 as amended by ODOC-302. The package job must produce and gate
// eight tarballs, and the publish job must stage exactly seven of them. The publish step's REAL
// `run:` block is executed below against a stub npm, because a static read of a selection loop
// cannot show which tarballs it actually hands to `npm publish`.
const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

describe("release.yml packs and gates both launchers (LCLI-621)", () => {
  const packageSteps = () => loadWorkflow().jobs.package?.steps ?? [];
  const indexOf = (steps: WorkflowStep[], pattern: RegExp) => steps.findIndex((s) => pattern.test(s.run ?? ""));

  test("the launcher_rc input is a number defaulting to 1, and both jobs that use it validate it", () => {
    const doc = loadWorkflow();
    expect(doc.on.workflow_dispatch?.inputs?.launcher_rc?.type).toBe("number");
    expect(doc.on.workflow_dispatch?.inputs?.launcher_rc?.default).toBe(1);
    const rcStep = packageSteps().find((s) => s.run?.includes("shipped-readme-version.mjs --write"));
    const publishStep = doc.jobs.publish?.steps?.find((s) => s.run?.includes("npm publish"));
    for (const step of [rcStep, publishStep]) {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax from release.yml.
      expect(step?.env?.LAUNCHER_RC).toBe("${{ inputs.launcher_rc }}");
      expect(step?.run).toContain('""|0*|*[!0-9]*)');
    }
  });

  test("the rc launcher is packed from the generator, restored, then README-gated, equivalence-gated and install-checked", () => {
    const steps = packageSteps();
    const packX = indexOf(steps, /npm pack --pack-destination/);
    const packRc = indexOf(steps, /shipped-readme-version\.mjs --write/);
    const readme = indexOf(steps, /--tarball "\$RC_TARBALL"/);
    const equivalence = indexOf(steps, /launcher-equivalence\.mjs --rc "\$RC_TARBALL" --final "\$ROOT_TARBALL"/);
    const sanity = indexOf(steps, /sanity "\$RC_TARBALL" "\$LAUNCHER_RC_VERSION"/);
    const upload = steps.findIndex((s) => s.uses?.startsWith("actions/upload-artifact@"));
    for (const i of [packX, packRc, readme, equivalence, sanity, upload]) expect(i).toBeGreaterThan(-1);
    expect(packX).toBeLessThan(packRc);
    expect(packRc).toBeLessThan(readme);
    expect(readme).toBeLessThan(upload);
    expect(equivalence).toBeLessThan(upload);
    expect(sanity).toBeLessThan(upload);
    const rcRun = steps[packRc]?.run ?? "";
    expect(rcRun).toContain("git checkout -- package.json README.md");
    expect(rcRun).toContain("git diff --exit-code -- package.json README.md");
    // Both launchers get the LCLI-510 assertion, and both get install-sanity.
    expect(steps[readme]?.run).toContain('--tarball "$ROOT_TARBALL"');
    expect(steps[sanity]?.run).toContain('sanity "$ROOT_TARBALL" "$expected"');
    for (const i of [packRc, readme, equivalence, sanity]) expect(steps[i]?.["continue-on-error"]).toBeUndefined();
    expect(readFileSync(join(import.meta.dir, "..", "scripts", "launcher-equivalence.mjs"), "utf8")).toContain(
      "export function compareLauncherTarballs",
    );
  });
});

describeOnPosix("release.yml's publish step stages seven of eight tarballs (LCLI-621)", () => {
  const X = "7.8.9";
  const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-arm64", "win32-x64"];

  function publishRun(): string {
    const step = loadWorkflow().jobs.publish?.steps?.find((s) => s.run?.includes("npm publish"));
    expect(step?.run).toBeDefined();
    return step?.run ?? "";
  }

  /** A workspace the publish step's run block can execute in: dist-npm, parity/, a stub npm. */
  function workspace(
    options: {
      rc?: number;
      omit?: string;
      extra?: string;
      rcManifestVersion?: string;
      /** Tarball file -> what the registry already holds for its name@version: its own bytes or others. */
      preexisting?: Record<string, "same" | "other">;
      /** Tarball file whose `npm view <name@version> version` fails with a NON-404 error. */
      broken?: string;
    } = {},
  ) {
    const root = mkdtempSync(join(tmpdir(), "release-publish-step-"));
    const dist = join(root, "dist-npm");
    const bin = join(root, "bin");
    mkdirSync(dist, { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(root, "parity"), { recursive: true });
    writeFileSync(join(root, "parity", "package.json"), JSON.stringify({ name: "@opum-ai/lore", version: X }));
    const rcVersion = `${X}-rc.${options.rc ?? 1}`;
    const pack = (file: string, name: string, version: string) => {
      const stage = mkdtempSync(join(root, "stage-"));
      mkdirSync(join(stage, "package"));
      writeFileSync(join(stage, "package", "package.json"), JSON.stringify({ name, version }));
      execFileSync("tar", ["-czf", join(dist, file), "package"], { cwd: stage });
    };
    for (const p of PLATFORMS) pack(`opum-ai-lore-${p}-${X}.tgz`, `@opum-ai/lore-${p}`, X);
    pack(`opum-ai-lore-${rcVersion}.tgz`, "@opum-ai/lore", options.rcManifestVersion ?? rcVersion);
    pack(`opum-ai-lore-${X}.tgz`, "@opum-ai/lore", X);
    if (options.extra) pack(options.extra, "@opum-ai/lore-extra", X);
    if (options.omit) rmSync(join(dist, options.omit));
    const log = join(root, "npm.log");
    writeFileSync(log, "");
    const sri = (bytes: Buffer) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const specOf = (file: string) => {
      const m = /^opum-ai-lore-(?:([a-z0-9]+-[a-z0-9]+)-)?(\d+\.\d+\.\d+(?:-rc\.\d+)?)\.tgz$/.exec(file);
      if (!m) throw new Error(`unrecognised tarball name ${file}`);
      return { spec: `@opum-ai/lore${m[1] ? `-${m[1]}` : ""}@${m[2]}`, version: m[2] as string };
    };
    const cases: string[] = [];
    if (options.broken)
      cases.push(`  "${specOf(options.broken).spec}") echo "npm error code ETIMEDOUT" >&2; exit 1 ;;`);
    for (const [file, held] of Object.entries(options.preexisting ?? {})) {
      const { spec, version } = specOf(file);
      const value = held === "same" ? sri(readFileSync(join(dist, file))) : sri(Buffer.from("other bytes"));
      cases.push(`  "${spec}") [ "\${3:-}" = dist.integrity ] && echo "${value}" || echo "${version}"; exit 0 ;;`);
    }
    // Anything else is not on the registry, answered as npm does: exit 1 with its E404.
    writeFileSync(
      join(bin, "npm"),
      `#!/usr/bin/env bash\necho "$*" >> "${log}"\n[ "$1" = view ] || exit 0\ncase "$2" in\n${cases.join("\n")}\nesac\necho "npm error code E404" >&2\necho "npm error 404 No match found for version" >&2\nexit 1\n`,
    );
    chmodSync(join(bin, "npm"), 0o755);
    const run = (launcherRc = String(options.rc ?? 1)) => {
      const result = Bun.spawnSync({
        cmd: ["bash", "-e", "-c", publishRun()],
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          PLATFORM_NAMES_SPACE: PLATFORMS.join(" "),
          LAUNCHER_RC: launcherRc,
        },
      });
      const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
      const staged = join(root, "staged-tarballs.txt");
      return {
        code: result.exitCode,
        out: result.stdout.toString() + result.stderr.toString(),
        publishes: calls.filter((c) => c.startsWith("publish ")),
        staged: existsSync(staged) ? readFileSync(staged, "utf8").split("\n").filter(Boolean) : [],
      };
    };
    return { run, rcVersion, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  }

  test("positive control: six platforms at X, then the X-rc.N launcher last, all under release-candidate", () => {
    const ws = workspace({ rc: 3 });
    try {
      const r = ws.run();
      expect(r.code).toBe(0);
      expect(r.publishes).toEqual([
        ...PLATFORMS.map((p) => `publish ./dist-npm/opum-ai-lore-${p}-${X}.tgz --tag release-candidate`),
        `publish ./dist-npm/opum-ai-lore-${X}-rc.3.tgz --tag release-candidate`,
      ]);
      // The carried X launcher is never handed to npm, and never recorded as staged.
      expect(r.publishes.join("\n")).not.toContain(`opum-ai-lore-${X}.tgz`);
      expect(r.staged).toHaveLength(7);
      expect(r.staged).not.toContain(`./dist-npm/opum-ai-lore-${X}.tgz`);
    } finally {
      ws.cleanup();
    }
  });

  const refuses = (name: string, options: Parameters<typeof workspace>[0], message: string, launcherRc?: string) =>
    test(name, () => {
      const ws = workspace(options);
      try {
        const r = ws.run(launcherRc);
        expect(r.code).not.toBe(0);
        expect(r.out).toContain(message);
        expect(r.publishes).toEqual([]);
      } finally {
        ws.cleanup();
      }
    });

  // LCLI-621 review: a skip is a resume only when the registry holds THIS run's bytes, platforms included.
  test("an already-published package holding this run's bytes is skipped, and the rest still stage", () => {
    const ws = workspace({ preexisting: { [`opum-ai-lore-darwin-arm64-${X}.tgz`]: "same" } });
    try {
      const r = ws.run();
      expect(r.code).toBe(0);
      expect(r.out).toContain(`@opum-ai/lore-darwin-arm64@${X} already published as this run's bytes`);
      expect(r.publishes).toEqual([
        ...PLATFORMS.filter((p) => p !== "darwin-arm64").map(
          (p) => `publish ./dist-npm/opum-ai-lore-${p}-${X}.tgz --tag release-candidate`,
        ),
        `publish ./dist-npm/opum-ai-lore-${X}-rc.1.tgz --tag release-candidate`,
      ]);
    } finally {
      ws.cleanup();
    }
  });

  refuses(
    "refuses an X platform package already on the registry with other bytes",
    { preexisting: { [`opum-ai-lore-darwin-arm64-${X}.tgz`]: "other" } },
    `::error::@opum-ai/lore-darwin-arm64@${X} is already on the registry with different bytes`,
  );

  // The pre-flight (LCLI-621 review): win32-x64 is the LAST platform in the loop and the rc launcher
  // comes after all six, so without it each of these would refuse only after earlier publishes.
  refuses(
    "the pre-flight refuses the LAST platform package with other bytes before anything publishes",
    { preexisting: { [`opum-ai-lore-win32-x64-${X}.tgz`]: "other" } },
    `::error::@opum-ai/lore-win32-x64@${X} is already on the registry with different bytes`,
  );
  refuses(
    "the pre-flight refuses an X-rc.N launcher already on the registry with other bytes before anything publishes",
    { rc: 2, preexisting: { [`opum-ai-lore-${X}-rc.2.tgz`]: "other" } },
    `::error::@opum-ai/lore@${X}-rc.2 is already on the registry with different bytes`,
  );

  // Only npm's own not-found (E404) is "absent" (LCLI-621 review); the positive control above is
  // the 404 case, where every package still publishes.
  refuses(
    "a NON-404 failure on the pre-flight's probe of the X-rc.N launcher fails the step before anything publishes",
    { broken: `opum-ai-lore-${X}-rc.1.tgz` },
    `::error::could not tell whether @opum-ai/lore@${X}-rc.1 is already on the registry`,
  );

  test("the pre-flight runs the publish step's own comparison, in check mode, before the publish loop", () => {
    const script = publishRun();
    const preflight = script.search(
      /for tgz in "\$\{platform_tgz\[@\]\}" "\$root"; do\s+publish_or_skip "\$tgz" check\n/,
    );
    const publishLoop = script.search(/for tgz in "\$\{platform_tgz\[@\]\}"; do\s+publish_or_skip "\$tgz"\n/);
    expect(preflight).toBeGreaterThan(-1);
    expect(publishLoop).toBeGreaterThan(preflight);
    const ws = workspace({ preexisting: { [`opum-ai-lore-linux-x64-${X}.tgz`]: "same" } });
    try {
      const r = ws.run();
      expect(r.code).toBe(0);
      expect(r.out).toContain(
        `pre-flight: @opum-ai/lore-linux-x64@${X} is already on the registry as this run's bytes`,
      );
      expect(r.publishes).toHaveLength(6);
    } finally {
      ws.cleanup();
    }
  });

  refuses("refuses when the carried X launcher is absent", { omit: `opum-ai-lore-${X}.tgz` }, "expected 8 tarballs");
  refuses("refuses an unexpected ninth tarball", { extra: `opum-ai-lore-freebsd-x64-${X}.tgz` }, "expected 8 tarballs");
  refuses("refuses a launcher_rc of 0", {}, "launcher_rc must be a positive integer", "0");
  refuses(
    "refuses when the input names an rc the artifact does not carry",
    { rc: 1 },
    "expected the launcher tarballs",
    "2",
  );
  refuses(
    "refuses an rc tarball whose own version is not X-rc.N",
    { rcManifestVersion: X },
    "names version '7.8.9', not '7.8.9-rc.1'",
  );
});
