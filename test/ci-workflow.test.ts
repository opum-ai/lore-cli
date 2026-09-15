import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const WORKFLOW_PATH = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");

interface WorkflowJob {
  env?: Record<string, string>;
  if?: string;
  /** Present only when a job declares a dependency; the docs gate (LCLI-504) asserts it is absent. */
  needs?: string | string[];
  steps?: Array<{
    name?: string;
    run?: string;
  }>;
  strategy?: {
    matrix?: {
      os?: string;
    };
  };
}

interface WorkflowDoc {
  on: {
    workflow_dispatch?: {
      inputs?: {
        ladybug_exact_hosts_only?: {
          description?: string;
          default?: boolean;
          type?: string;
        };
      };
    };
  };
  jobs: Record<string, WorkflowJob>;
}

function loadWorkflow(): WorkflowDoc {
  return yaml.load(readFileSync(WORKFLOW_PATH, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
}

describe("ci.yml exact-host LadybugDB qualification", () => {
  test("the narrow manual mode is explicit and defaults off", () => {
    const input = loadWorkflow().on.workflow_dispatch?.inputs?.ladybug_exact_hosts_only;
    expect(input).toEqual({
      description: "Run only LadybugDB qualification on Darwin x64 and Linux arm64",
      type: "boolean",
      default: false,
    });
  });

  test("the narrow mode selects only Darwin x64 and Linux arm64 without changing normal matrices", () => {
    const matrix = loadWorkflow().jobs.check?.strategy?.matrix?.os ?? "";
    expect(matrix).toContain("inputs.ladybug_exact_hosts_only == true");
    expect(matrix).toContain('["macos-15-intel","ubuntu-24.04-arm"]');
    expect(matrix).toContain('["ubuntu-latest","windows-latest"]');
    expect(matrix).toContain('["ubuntu-latest","windows-latest","macos-latest"]');
  });

  test("the narrow mode skips every unrelated CI job", () => {
    const jobs = loadWorkflow().jobs;
    expect(Object.keys(jobs)).toEqual([
      "check",
      "tracker",
      "docs-gate",
      "package-set",
      "promotion-is-manual",
      "main-is-fast-forward-of-dev",
      "config-test-newest-bun",
      "ladybug-benchmark-smoke",
      "build",
      "explorer-browser-qualification",
      "scaffold-mkdocs",
      "scaffold-docusaurus",
      "docker-e2e",
    ]);

    // promotion-is-manual/main-is-fast-forward-of-dev (LCLI-458) are pull_request/push-scoped
    // promotion guardrails, not Ladybug-related — they never run under workflow_dispatch at all
    // (any variant, narrow or not), by virtue of their OWN if: condition, not this shared guard.
    const skippedUnderNarrowMode = new Set(["check", "promotion-is-manual", "main-is-fast-forward-of-dev"]);
    const exactHostSkipGuard = "github.event_name != 'workflow_dispatch' || inputs.ladybug_exact_hosts_only != true";
    for (const [name, job] of Object.entries(jobs)) {
      if (skippedUnderNarrowMode.has(name)) continue;
      expect(job.if).toBe(exactHostSkipGuard);
    }
  });

  test("the two promotion guardrails (LCLI-458) never run under any workflow_dispatch, narrow mode or not", () => {
    const jobs = loadWorkflow().jobs;
    expect(jobs["promotion-is-manual"]?.if).toBe("github.event_name == 'pull_request' && github.base_ref == 'main'");
    expect(jobs["main-is-fast-forward-of-dev"]?.if).toBe("github.event_name == 'push'");
  });

  test("the explorer qualification installs and runs all pinned Playwright engines from a repo-local cache", () => {
    const job = loadWorkflow().jobs["explorer-browser-qualification"];
    expect(job?.env?.PLAYWRIGHT_BROWSERS_PATH).toBe(".lore/cache/ms-playwright");
    expect(job?.steps?.find((step) => step.name === "Install pinned browser engines")?.run).toBe(
      "bunx playwright install --with-deps chromium firefox webkit",
    );
    expect(job?.steps?.find((step) => step.name === "Qualify the static explorer")?.run).toBe("bun run test:browser");
  });

  test("platform-specific concurrency and timeouts stay explicitly bounded", () => {
    const testScript = loadWorkflow().jobs.check?.steps?.find((step) => step.name === "Test")?.run ?? "";
    expect(testScript).toContain("bun test --isolate --max-concurrency=4 --timeout=60000");
    expect(testScript).toContain('"macos-15-intel"');
    expect(testScript).toContain("bun test --isolate --timeout=40000");
    expect(testScript).toContain('== "ubuntu-latest"');
    expect(testScript).toContain('== "ubuntu-24.04-arm"');
    expect(testScript).toContain("bun test --isolate --max-concurrency=1 --timeout=10000");
    expect(testScript).toContain("timeout --kill-after=10s 6m bun test --isolate --max-concurrency=1 --timeout=10000");
    expect(testScript).toContain("error: EEXIST: file already exists, epoll_ctl");
    expect(testScript).toContain("lore_bun_status=$" + "{PIPESTATUS[0]}");
    expect(testScript).toContain('exit "$' + '{lore_bun_status}"');
    expect(testScript).toContain("else\n  bun test --isolate --timeout=10000");
  });
});

describe("ci.yml docs gate (LCLI-504)", () => {
  test("a job actually runs `lore check`, and runs it from source", () => {
    // The fleet rule is "`lore check` exiting 0 is the definition of done for a docs
    // change". Before LCLI-504 no job in this workflow ran it at all, so the rule gated
    // nothing and `lore check` had been exiting 6 on dev unnoticed. This asserts the job
    // cannot be silently gutted back to that state.
    const job = loadWorkflow().jobs["docs-gate"];
    expect(job?.steps?.find((step) => step.name === "lore check")?.run).toBe("bun run lore check");
  });

  test("the docs gate installs the Quest CLI, which `lore check` cannot run without", () => {
    // Not a convenience: this repository's tracker backend is quest, so reconciliation
    // shells out to the quest binary. With it off PATH, `lore check` exits 3. A job that
    // dropped this step would fail for a reason that has nothing to do with the docs.
    const job = loadWorkflow().jobs["docs-gate"];
    const steps = job?.steps ?? [];
    expect(steps.some((step) => (step.run ?? "").includes('npm install -g "@opum-ai/quest@'))).toBe(true);
    // Derived from CLAUDE.md's managed block rather than pinned a second time here —
    // the same rule the tracker job states, and the reason the two must stay in step.
    expect(steps.some((step) => (step.run ?? "").includes("Quest CLI \\([0-9][0-9.]*\\)"))).toBe(true);
  });

  test("the docs gate never depends on another job, so a required context cannot go absent", () => {
    // A `needs:` would make this context SKIP when its dependency fails, and a skipped
    // context is absent rather than green — which blocks dev until an admin notices.
    // Same trap as an `if:` that evaluates false, reached through a dependency instead.
    expect(loadWorkflow().jobs["docs-gate"]?.needs).toBeUndefined();
  });
});
