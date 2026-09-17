import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  test("the Bun-epoll retry (LCLI-507) triggers on the bounded-timeout exit as well as the EEXIST string", () => {
    // The same race can present as a quick EEXIST error (the original guard) OR
    // as a full hang killed by the `timeout --kill-after=10s 6m` wrapper with
    // exit 124 — job 104458113048 on PR #107 hit exactly that and the grep-only
    // guard missed it. This asserts the source contains the widened condition;
    // "ci.yml ubuntu Bun-epoll retry trigger (LCLI-507)" below exercises it.
    const testScript = loadWorkflow().jobs.check?.steps?.find((step) => step.name === "Test")?.run ?? "";
    expect(testScript).toContain(
      'if grep -Fq "error: EEXIST: file already exists, epoll_ctl" "$' +
        '{lore_bun_log}" || [[ "$' +
        '{lore_bun_status}" -eq 124 ]]; then',
    );
  });
});

describe("ci.yml ubuntu Bun-epoll retry trigger (LCLI-507)", () => {
  // Extracts the actual retry condition from ci.yml's ubuntu Test step, rather
  // than a hand-copied approximation of it, so this test tracks the real guard
  // and fails loudly if a future edit narrows it back to a single signal.
  function extractRetryCondition(): string {
    const testScript = loadWorkflow().jobs.check?.steps?.find((step) => step.name === "Test")?.run ?? "";
    const match = testScript.match(/if (grep -Fq "error: EEXIST:[^\n]*?); then\n/);
    const condition = match?.[1];
    if (!condition) {
      throw new Error("could not find the ubuntu Bun-epoll retry condition in ci.yml's Test step");
    }
    return condition;
  }

  // Runs the extracted condition in a real bash subshell against a fabricated
  // log file and exit status, exactly the two inputs the condition reads in
  // ci.yml, and reports whether the retry branch fired. This is a behavioral
  // check of the guard's logic, not a second string match.
  function retryFires(logContents: string, exitStatus: number): boolean {
    const dir = mkdtempSync(join(tmpdir(), "lcli-507-retry-"));
    try {
      const logPath = join(dir, "lore-bun-test.log");
      writeFileSync(logPath, logContents);
      const condition = extractRetryCondition();
      const script = `
        lore_bun_log="${logPath}"
        lore_bun_status=${exitStatus}
        if ${condition}; then
          echo RETRY
        else
          echo NO_RETRY
        fi
      `;
      const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
      if (result.status !== 0) {
        throw new Error(`retry-condition harness exited ${result.status}: ${result.stderr}`);
      }
      return result.stdout.trim() === "RETRY";
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("retries on the EEXIST string, as before", () => {
    expect(retryFires("error: EEXIST: file already exists, epoll_ctl\n", 1)).toBe(true);
  });

  test("retries on exit 124 (the bounded-timeout hang) even with no EEXIST in the log", () => {
    expect(retryFires("", 124)).toBe(true);
  });

  test("retries when both signals are present", () => {
    expect(retryFires("error: EEXIST: file already exists, epoll_ctl\n", 124)).toBe(true);
  });

  test("does not retry a genuine product-test failure — neither signal present", () => {
    expect(retryFires("FAIL: expected 1 to equal 2\n", 1)).toBe(false);
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
