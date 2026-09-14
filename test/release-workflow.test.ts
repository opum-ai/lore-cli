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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const WORKFLOW_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");

/** The handful of `release.yml` fields this file's assertions actually read. */
interface WorkflowStep {
  name?: string;
  uses?: string;
  with?: Record<string, string>;
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
    expect(script).toContain("expected_total_count=$((expected_platform_count + 1))");
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
