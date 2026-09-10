import { describe, expect, test } from "bun:test";
import type { JiraSpawn, JiraSpawnResult } from "../src/adapters/jira";
import { realJiraOnboarding } from "../src/adapters/jira-onboarding";
import type { LoreError } from "../src/errors";

/**
 * The exact envelopes jira-cli 1.0.2 printed on 2026-08-28. Copied from real runs rather than
 * written from the documentation, so a drift in jira-cli's actual output breaks these tests.
 */
const PROFILES_STDOUT =
  '{"success":true,"data":{"profiles":[{"name":"salient","jiraUrl":"https://salient-data.atlassian.net","isDefault":true}]}}';
const PROJECT_STDOUT =
  '{"success":true,"data":{"project":{"id":"10004","key":"SD","name":"SD Platform","description":"","lead":"A Lead","project_type":"software","issue_types":[{"id":"10013","name":"Story"},{"id":"10014","name":"Task"}]}}}';
const NOT_FOUND_STDERR =
  '{"success":false,"error":"No project could be found with key \'NOPEKEY\'.","status_code":404}';

/** A spawn seam that records its arguments and replays a canned result. */
function spawnStub(
  result: Partial<JiraSpawnResult> | (() => never),
  calls: string[][] = [],
): { spawn: JiraSpawn; calls: string[][] } {
  const spawn: JiraSpawn = async (args) => {
    calls.push([...args]);
    if (typeof result === "function") result();
    return { stdout: "", stderr: "", exitCode: 0, ...result };
  };
  return { spawn, calls };
}

async function rejection(promise: Promise<unknown>): Promise<LoreError> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (caught: unknown) => caught as LoreError,
  );
}

describe("jira onboarding — listing credential profiles", () => {
  test("parses jira-cli's real profile envelope without asking for a profile itself", async () => {
    const { spawn, calls } = spawnStub({ stdout: PROFILES_STDOUT });
    const profiles = await realJiraOnboarding("/tmp", spawn).listProfiles();
    expect(profiles).toEqual([{ name: "salient", jiraUrl: "https://salient-data.atlassian.net", isDefault: true }]);
    // No `--profile` prefix: which profile to use is the question this call exists to answer.
    expect(calls).toEqual([["config", "list-profiles"]]);
  });

  test("an empty profile list is data, not an error — the caller decides what it means", async () => {
    const { spawn } = spawnStub({ stdout: '{"success":true,"data":{"profiles":[]}}' });
    expect(await realJiraOnboarding("/tmp", spawn).listProfiles()).toEqual([]);
  });

  test("a profile with no jiraUrl still resolves, with the site left unknown", async () => {
    const { spawn } = spawnStub({ stdout: '{"success":true,"data":{"profiles":[{"name":"bare"}]}}' });
    expect(await realJiraOnboarding("/tmp", spawn).listProfiles()).toEqual([
      { name: "bare", jiraUrl: undefined, isDefault: false },
    ]);
  });

  test("a missing `jira` binary is a not_found naming the package, not a raw ENOENT", async () => {
    const { spawn } = spawnStub(() => {
      const error = new Error("spawn jira ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    });
    const err = await rejection(realJiraOnboarding("/tmp", spawn).listProfiles());
    expect(err.type).toBe("not_found");
    expect(err.hint).toContain("@salient-ai/jira-cli");
  });

  test("an unrecognized envelope shape is drift, not operator error", async () => {
    for (const stdout of ['{"success":true,"data":{}}', '{"success":true}', "not json at all"]) {
      const { spawn } = spawnStub({ stdout });
      expect((await rejection(realJiraOnboarding("/tmp", spawn).listProfiles())).type).toBe("drift");
    }
  });
});

describe("jira onboarding — validating a project key", () => {
  test("passes the chosen profile explicitly and reports the project's own issue types", async () => {
    const { spawn, calls } = spawnStub({ stdout: PROJECT_STDOUT });
    const summary = await realJiraOnboarding("/tmp", spawn).describeProject("SD", "salient");
    expect(summary).toEqual({ key: "SD", name: "SD Platform", issueTypes: ["Story", "Task"] });
    // Explicit `--profile`, never jira-cli's ambient default: the profile being validated is the
    // one Lore is about to record, and there is no `.lore` config to read it back from yet.
    expect(calls).toEqual([["--profile", "salient", "project", "get", "SD"]]);
  });

  test("an unresolvable key carries jira-cli's own sentence verbatim", async () => {
    const { spawn } = spawnStub({ exitCode: 1, stderr: NOT_FOUND_STDERR });
    const err = await rejection(realJiraOnboarding("/tmp", spawn).describeProject("NOPEKEY", "salient"));
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("No project could be found with key 'NOPEKEY'.");
    expect((err.input as { statusCode?: number }).statusCode).toBe(404);
  });

  test("an authentication failure is denied, and says Lore never stores credentials", async () => {
    const { spawn } = spawnStub({
      exitCode: 1,
      stderr: '{"success":false,"error":"Unauthorized","status_code":401}',
    });
    const err = await rejection(realJiraOnboarding("/tmp", spawn).describeProject("SD", "salient"));
    expect(err.type).toBe("denied");
    expect(err.hint).toContain("never stores Jira credentials");
  });

  test("a failure with no JSON envelope still surfaces whatever jira-cli printed", async () => {
    const { spawn } = spawnStub({ exitCode: 2, stderr: "segfault" });
    const err = await rejection(realJiraOnboarding("/tmp", spawn).describeProject("SD", "salient"));
    expect(err.type).toBe("validation");
    expect(err.message).toContain("segfault");
  });

  test("a silent non-zero exit still fails, reporting the exit code", async () => {
    const { spawn } = spawnStub({ exitCode: 3 });
    const err = await rejection(realJiraOnboarding("/tmp", spawn).describeProject("SD", "salient"));
    expect(err.message).toContain("exited 3");
  });
});
