import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const WORKFLOW_PATH = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");

interface WorkflowJob {
  if?: string;
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
    expect(Object.keys(jobs)).toEqual(["check", "build", "scaffold-mkdocs", "scaffold-docusaurus", "docker-e2e"]);

    const exactHostSkipGuard = "github.event_name != 'workflow_dispatch' || inputs.ladybug_exact_hosts_only != true";
    for (const [name, job] of Object.entries(jobs)) {
      if (name === "check") continue;
      expect(job.if).toBe(exactHostSkipGuard);
    }
  });
});
