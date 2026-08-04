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
}

interface WorkflowJob {
  if?: string;
  needs?: string[];
  permissions?: Record<string, string>;
  environment?: string;
  steps?: WorkflowStep[];
}

interface WorkflowDoc {
  on: {
    workflow_dispatch?: {
      inputs?: {
        publish?: { default?: boolean };
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

  test("the publish job depends on the package job (so build+verify-versions gate it transitively)", () => {
    const doc = loadWorkflow();
    expect(doc.jobs.publish?.needs).toContain("package");
    // `package` itself needs `build`, which needs `verify-versions` — asserted directly
    // here too, so this test still catches a regression if that chain is ever
    // shortened even though `publish` itself didn't change.
    expect(doc.jobs.package?.needs).toContain("build");
    expect(doc.jobs.build?.needs).toContain("verify-versions");
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
    // launcher tarball (`opum-ai-lore-<version>.tgz`) BEFORE its five platform
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
    // loud (the npm-floor assertion, the 6/5+1-tarball count asserts, verify-versions'
    // 12-value cross-check) — but nothing refused the one value that actually matters
    // for an irreversible `npm publish`: the placeholder version itself. Because the
    // First-release checklist deliberately orders Trusted Publisher registration
    // (step 1) before the version bump (step 2), a `publish: true` dispatch made
    // between those two steps would otherwise sail through every other check and
    // genuinely publish six installable `0.0.0` packages.
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
});
