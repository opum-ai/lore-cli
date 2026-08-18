import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const WORKFLOW_PATH = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");

interface WorkflowJob {
  env?: Record<string, string>;
  if?: string;
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
      "ladybug-benchmark-smoke",
      "build",
      "explorer-browser-qualification",
      "scaffold-mkdocs",
      "scaffold-docusaurus",
      "docker-e2e",
    ]);

    const exactHostSkipGuard = "github.event_name != 'workflow_dispatch' || inputs.ladybug_exact_hosts_only != true";
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "check") continue;
      expect(job.if).toBe(exactHostSkipGuard);
    }
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
    expect(testScript).toContain("timeout 6m bun test --isolate --max-concurrency=1 --timeout=10000");
    expect(testScript).toContain("error: EEXIST: file already exists, epoll_ctl");
    expect(testScript).toContain("lore_bun_status=$" + "{PIPESTATUS[0]}");
    expect(testScript).toContain('exit "$' + '{lore_bun_status}"');
    expect(testScript).toContain("else\n  bun test --isolate --timeout=10000");
  });
});
