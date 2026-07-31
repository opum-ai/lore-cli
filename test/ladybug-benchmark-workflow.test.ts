/** Static CI/release placement invariants for LCLI-283.1.4 plan item 5. */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "js-yaml";

const CI_PATH = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");
const RELEASE_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");

interface WorkflowStep {
  name?: string;
  if?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  name?: string;
  needs?: string | string[];
  "runs-on"?: string;
  "timeout-minutes"?: number;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  services?: unknown;
  strategy?: unknown;
  steps?: WorkflowStep[];
}

interface WorkflowDoc {
  jobs: Record<string, WorkflowJob>;
}

function loadWorkflow(path: string): WorkflowDoc {
  return yaml.load(readFileSync(path, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
}

function runStep(job: WorkflowJob, fragment: string): WorkflowStep {
  const step = job.steps?.find((candidate) => candidate.run?.includes(fragment));
  if (step === undefined) throw new Error(`workflow job is missing run fragment: ${fragment}`);
  return step;
}

function uploadStep(job: WorkflowJob): WorkflowStep {
  const step = job.steps?.find((candidate) => candidate.uses?.startsWith("actions/upload-artifact@"));
  if (step === undefined) throw new Error("workflow job is missing its artifact upload");
  return step;
}

function needs(job: WorkflowJob): string[] {
  return typeof job.needs === "string" ? [job.needs] : (job.needs ?? []);
}

describe("Ladybug benchmark workflow placement", () => {
  test("CI runs a complete two-fixture smoke without treating timings as qualification", () => {
    const job = loadWorkflow(CI_PATH).jobs["ladybug-benchmark-smoke"];
    expect(job).toBeDefined();
    expect(job?.name).toBe("ladybug benchmark smoke (non-timing)");
    expect(job?.["runs-on"]).toBe("ubuntu-24.04");
    expect(job?.["timeout-minutes"]).toBe(30);
    expect(job?.steps?.some((step) => step.uses === "./.github/actions/setup-bun")).toBe(true);

    const script = runStep(job as WorkflowJob, "benchmark/ladybug/run.ts").run ?? "";
    expect(script).toContain("--fixture small");
    expect(script).toContain("--fixture large");
    expect(script).toContain("--smoke");
    expect(script).toContain("artifacts/ladybug-benchmark-smoke-v1.json");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion from the workflow.
    expect(script).toContain('"${ImageOS}-${ImageVersion}"');

    const upload = uploadStep(job as WorkflowJob);
    expect(upload.if).toBe("always()");
    expect(String(upload.with?.path)).toContain("artifacts/ladybug-benchmark-smoke-v1.json");
    expect(String(upload.with?.path)).toContain("benchmark/ladybug/gates/v1.json");
  });

  test("release serializes one fixed Linux-x64 full qualification with no services or matrix", () => {
    const job = loadWorkflow(RELEASE_PATH).jobs["ladybug-qualification"];
    expect(job).toBeDefined();
    expect(job?.["runs-on"]).toBe("ubuntu-24.04");
    expect(job?.["timeout-minutes"]).toBe(240);
    expect(job?.services).toBeUndefined();
    expect(job?.strategy).toBeUndefined();
    expect(job?.concurrency).toEqual({ group: "ladybug-release-qualification", "cancel-in-progress": false });
    expect(needs(job as WorkflowJob)).toEqual(["verify-versions"]);
    expect(job?.steps?.some((step) => step.uses === "./.github/actions/setup-bun")).toBe(true);

    const hostScript = runStep(job as WorkflowJob, "Ladybug qualification requires Bun").run ?? "";
    expect(hostScript).toContain('actual_bun" != "1.2.23"');
    expect(hostScript).toContain('"$(uname -s)" != "Linux"');
    expect(hostScript).toContain('"$(uname -m)" != "x86_64"');

    const qualification = runStep(job as WorkflowJob, "benchmark/ladybug/run.ts").run ?? "";
    expect(qualification).toContain("--fixture small");
    expect(qualification).toContain("--fixture large");
    expect(qualification).not.toContain("--smoke");
    expect(qualification).toContain("artifacts/ladybug-benchmark-v1.json");

    const assertion = runStep(job as WorkflowJob, 'status !== "pass"').run ?? "";
    expect(assertion).toContain('report.mode !== "qualification"');
    expect(assertion).toContain('report.host?.platform !== "linux"');
    expect(assertion).toContain('report.host?.arch !== "x64"');
    expect(assertion).toContain("report.repository?.commit !== process.env.EXPECTED_COMMIT");
    expect(assertion).toContain("report.repository?.dirty !== false");

    const upload = uploadStep(job as WorkflowJob);
    expect(upload.if).toBe("always()");
    expect(String(upload.with?.path)).toContain("artifacts/ladybug-benchmark-v1.json");
    expect(String(upload.with?.path)).toContain("benchmark/ladybug/gates/v1.json");
  });

  test("release emits pinned real-process concurrency and crash evidence with source/cache inventories", () => {
    const job = loadWorkflow(RELEASE_PATH).jobs["ladybug-concurrency-qualification"];
    expect(job).toBeDefined();
    expect(job?.["runs-on"]).toBe("ubuntu-24.04");
    expect(job?.["timeout-minutes"]).toBe(15);
    expect(needs(job as WorkflowJob)).toEqual(["verify-versions"]);
    expect(job?.steps?.some((step) => step.uses === "./.github/actions/setup-bun")).toBe(true);

    const tests = runStep(job as WorkflowJob, "test/ladybug-concurrency.test.ts").run ?? "";
    expect(tests).toContain("bun test --isolate");
    expect(tests).toContain("test/ladybug-lifecycle.test.ts");
    expect(tests).toContain("test/indexed-retrieval.test.ts");

    const assertion = runStep(job as WorkflowJob, "parseLadybugConcurrencyEvidenceReport").run ?? "";
    expect(assertion).toContain('report.toolchain.bun !== "1.2.23"');
    expect(assertion).toContain("report.repository.commit !== process.env.EXPECTED_COMMIT");
    expect(assertion).toContain("LADYBUG_CONCURRENCY_EVIDENCE_KILL_POINTS");

    const upload = uploadStep(job as WorkflowJob);
    expect(upload.if).toBe("always()");
    expect(upload.with?.path).toBe("artifacts/ladybug-concurrency-evidence-v1.json");
    expect(upload.with?.["retention-days"]).toBe(90);
  });

  test("the existing build/package/publish chain cannot bypass qualification", () => {
    const jobs = loadWorkflow(RELEASE_PATH).jobs;
    expect(needs(jobs.build as WorkflowJob)).toContain("ladybug-qualification");
    expect(needs(jobs.build as WorkflowJob)).toContain("ladybug-concurrency-qualification");
    expect(needs(jobs.package as WorkflowJob)).toContain("build");
    expect(needs(jobs.publish as WorkflowJob)).toContain("package");

    const qualificationJobs = Object.entries(jobs).filter(([, job]) =>
      job.steps?.some((step) => step.run?.includes("benchmark/ladybug/run.ts")),
    );
    expect(qualificationJobs.map(([name]) => name)).toEqual(["ladybug-qualification"]);
  });
});
