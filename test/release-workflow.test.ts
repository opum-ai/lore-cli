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
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

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
    // launcher tarball (`salient-data-lore-<version>.tgz`) BEFORE its five platform
    // optionalDependencies (`salient-data-lore-<platform>-<version>.tgz`) — a digit
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
});
