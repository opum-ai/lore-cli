import { describe, expect, test } from "bun:test";
import type { JiraSpawn, JiraSpawnResult } from "../src/adapters/jira";
import { createTrackerAdapter } from "../src/adapters/tracker";
import { LoreError } from "../src/errors";

const CONFIG = {
  project: "JT",
  issueType: "Task",
  defaultLabels: ["lore"],
  statusFlow: ["To Do", "In Progress", "Done"],
} as const;

function ok(data: Record<string, unknown>): JiraSpawnResult {
  return { exitCode: 0, stdout: JSON.stringify({ success: true, data }), stderr: "" };
}

function fail(error: string, statusCode?: number): JiraSpawnResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr: JSON.stringify({ success: false, error, ...(statusCode === undefined ? {} : { status_code: statusCode }) }),
  };
}

function projectData(issueTypes: readonly string[] = ["Task"]): JiraSpawnResult {
  return ok({
    project: {
      id: "10307",
      key: "JT",
      name: "JIRA Test",
      issue_types: issueTypes.map((name, index) => ({ id: String(100 + index), name })),
    },
  });
}

function prioritiesData(priorities: readonly string[] = ["Medium"]): JiraSpawnResult {
  return ok({ priorities: priorities.map((name, index) => ({ id: String(index + 1), name })) });
}

function summaryIssue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "17337",
    key: "JT-2",
    fields: {
      summary: "Lore adapter qualification",
      status: { name: "To Do" },
      issuetype: { name: "Task" },
      priority: { name: "Medium" },
      assignee: { accountId: "abc", displayName: "Ada" },
      labels: ["lore", "docs"],
      fixVersions: [{ name: "M1" }],
      parent: { key: "JT-1" },
      ...overrides,
    },
  };
}

function makeAdapter(spawn: JiraSpawn) {
  return createTrackerAdapter("/repo", { backend: "jira", jira: CONFIG }, { jira: { spawn } });
}

describe("jira-cli tracker adapter — full interface and Markdown round trip", () => {
  test("the factory returns a working adapter and every operation stays behind the mocked subprocess", async () => {
    const calls: string[][] = [];
    let createdDescription = "";
    const markdown = [
      "# Coupled task",
      "",
      "- [x] preserves **Markdown**",
      "- [ ] keeps [links](docs/reference/backlog-cli-contract.md)",
      "",
      "```ts",
      "const answer = 42;",
      "```",
    ].join("\n");

    const spawn: JiraSpawn = async (readonlyArgs) => {
      const args = [...readonlyArgs];
      calls.push(args);
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.0.2\n", stderr: "" };
      if (args.join(" ") === "project get JT") return projectData();
      if (args.join(" ") === "metadata priorities") return prioritiesData();
      if (args[0] === "issue" && args[1] === "search") {
        return ok({ issues: [summaryIssue()], next_page_token: null, is_last: true });
      }
      if (args[0] === "issue" && args[1] === "create") {
        createdDescription = args[args.indexOf("--description") + 1] as string;
        return ok({ issue_key: "JT-2", issue_id: "17337" });
      }
      if (args.join(" ") === "issue get JT-2") {
        return ok({
          issue: summaryIssue({
            description: createdDescription,
            reporter: { displayName: "Grace" },
            created: "2026-08-07T08:21:33.449-0500",
            updated: "2026-08-07T08:22:16.240-0500",
            issuelinks: [{ inwardIssue: { key: "JT-9" } }],
            subtasks: [{ key: "JT-3", fields: { summary: "Child" } }],
          }),
        });
      }
      if (args[0] === "comment" && args[1] === "list") {
        return ok({
          total: 1,
          comments: [
            {
              id: "13893",
              body: "A **comment**.",
              author: "Grace",
              created: "2026-08-07T08:22:16.240-0500",
            },
          ],
        });
      }
      if (args.join(" ") === "issue transitions JT-2") {
        return ok({
          issue_key: "JT-2",
          transitions: [{ id: "21", name: "In Progress", to_status: "In Progress" }],
        });
      }
      if (args[0] === "issue" && args[1] === "update") {
        return ok({ issue_key: "JT-2", updated_fields: ["description", "labels"] });
      }
      if (args.join(" ") === "issue transition JT-2 --id 21") {
        return ok({ issue_key: "JT-2", transition_id: "21" });
      }
      throw new Error(`unexpected jira call: ${args.join(" ")}`);
    };

    const adapter = makeAdapter(spawn);
    expect(await adapter.statusFlow()).toEqual(["To Do", "In Progress", "Done"]);
    expect(await adapter.probe()).toEqual({ version: "1.0.2" });

    const id = await adapter.createTask({
      title: "Lore adapter qualification",
      description: markdown,
      labels: ["docs"],
      doc: ["docs/reference/backlog-cli-contract.md"],
      milestone: "M2",
    });
    expect(id).toBe("JT-2");
    expect(createdDescription).toContain(markdown);
    expect(createdDescription).toContain("LORE-JIRA-METADATA-BEGIN");

    const detail = await adapter.viewTask("JT-2");
    expect(detail).not.toBeNull();
    expect(detail?.description).toBe(markdown);
    expect(detail?.documentation).toEqual(["docs/reference/backlog-cli-contract.md"]);
    expect(detail?.milestone).toBe("M2");
    expect(detail?.dependencies).toEqual(["JT-9"]);
    expect(detail?.subtasks).toEqual([{ id: "JT-3", title: "Child" }]);
    expect(detail?.comments).toEqual([
      { author: "Grace", createdAt: "2026-08-07T08:22:16.240-0500", body: "A **comment**." },
    ]);
    expect(detail?.ordinal).toBeNull();
    expect(detail?.modifiedFiles).toEqual([]);

    expect((await adapter.listTasks({ status: "To Do", labels: ["docs"] }))[0]?.id).toBe("JT-2");
    expect((await adapter.searchByLabel("docs"))[0]?.id).toBe("JT-2");
    expect((await adapter.searchTasks("qualification"))[0]?.id).toBe("JT-2");

    await adapter.editTask("JT-2", {
      addLabels: ["new"],
      removeLabels: ["docs"],
      doc: ["docs/new.md"],
      status: "In Progress",
    });
    const update = calls.find((args) => args[0] === "issue" && args[1] === "update");
    expect(update).toContain("--labels");
    expect(update).toContain("new");
    expect(update).not.toContain("docs");
    expect(update?.[update.indexOf("--description") + 1]).toContain('"documentation": [\n    "docs/new.md"');

    expect(calls.filter((args) => args[0] === "--version")).toHaveLength(1);
    expect(calls.every((args) => args[0] !== "fetch")).toBe(true);
  });

  test("passes an optional jira-cli profile through before every command", async () => {
    const calls: string[][] = [];
    const spawn: JiraSpawn = async (args) => {
      calls.push([...args]);
      const command = args.slice(2).join(" ");
      if (command === "--version") return { exitCode: 0, stdout: "1.0.2\n", stderr: "" };
      if (command === "project get JT") return projectData();
      if (command === "metadata priorities") return prioritiesData();
      throw new Error(`unexpected call: ${args.join(" ")}`);
    };
    const adapter = createTrackerAdapter(
      "/repo",
      { backend: "jira", jira: { ...CONFIG, profile: "work" } },
      { jira: { spawn } },
    );
    await adapter.probe();
    expect(calls.every((args) => args[0] === "--profile" && args[1] === "work")).toBe(true);
  });
});

describe("jira-cli tracker adapter — fail-loud boundaries", () => {
  test("rejects a configured issue type outside the project vocabulary", async () => {
    const spawn: JiraSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.0.2\n", stderr: "" };
      if (args.join(" ") === "project get JT") return projectData(["Bug"]);
      if (args.join(" ") === "metadata priorities") return prioritiesData();
      throw new Error(`unexpected call: ${args.join(" ")}`);
    };
    await expect(makeAdapter(spawn).probe()).rejects.toMatchObject({
      name: "LoreError",
      type: "validation",
      message: expect.stringContaining("issue type"),
    });
  });

  test("rejects a priority returned outside jira-cli metadata", async () => {
    const spawn: JiraSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.0.2\n", stderr: "" };
      if (args.join(" ") === "project get JT") return projectData();
      if (args.join(" ") === "metadata priorities") return prioritiesData();
      if (args[0] === "issue" && args[1] === "search") {
        return ok({ issues: [summaryIssue({ priority: { name: "Surprise" } })], is_last: true });
      }
      throw new Error(`unexpected call: ${args.join(" ")}`);
    };
    await expect(makeAdapter(spawn).listTasks()).rejects.toMatchObject({
      name: "LoreError",
      type: "validation",
      message: expect.stringContaining("priority"),
    });
  });

  test("turns an unreachable status into an actionable transition-graph LoreError", async () => {
    const calls: string[][] = [];
    const spawn: JiraSpawn = async (args) => {
      calls.push([...args]);
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.0.2\n", stderr: "" };
      if (args.join(" ") === "project get JT") return projectData();
      if (args.join(" ") === "metadata priorities") return prioritiesData();
      if (args.join(" ") === "issue transitions JT-2") {
        return ok({ transitions: [{ id: "41", name: "Done", to_status: "Done" }] });
      }
      throw new Error(`unexpected call: ${args.join(" ")}`);
    };
    try {
      await makeAdapter(spawn).editTask("JT-2", { status: "In Progress" });
      throw new Error("expected transition rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(LoreError);
      expect(error).toMatchObject({ type: "conflict", hint: expect.stringContaining("jira issue transitions JT-2") });
    }
    expect(calls.some((args) => args[1] === "transition")).toBe(false);
  });

  test.each([
    ["rate limit", fail("Too many requests", 429), "rate-limit"],
    ["timeout", fail("JIRA API request timed out after 30000ms"), "JIRA_TIMEOUT_MS"],
  ])("maps %s errors once without retrying", async (_name, failure, hintPart) => {
    let projectCalls = 0;
    const spawn: JiraSpawn = async (args) => {
      if (args[0] === "--version") return { exitCode: 0, stdout: "1.0.2\n", stderr: "" };
      if (args.join(" ") === "project get JT") {
        projectCalls += 1;
        return failure;
      }
      if (args.join(" ") === "metadata priorities") return prioritiesData();
      throw new Error(`unexpected call: ${args.join(" ")}`);
    };
    try {
      await makeAdapter(spawn).probe();
      throw new Error("expected probe failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LoreError);
      expect(error).toMatchObject({ type: "conflict", hint: expect.stringContaining(hintPart) });
    }
    expect(projectCalls).toBe(1);
  });

  test("a missing executable points to jira init and never asks Lore for credentials", async () => {
    const missing = Object.assign(new Error("spawn jira ENOENT"), { code: "ENOENT" });
    const adapter = makeAdapter(async () => Promise.reject(missing));
    try {
      await adapter.probe();
      throw new Error("expected missing executable");
    } catch (error) {
      expect(error).toBeInstanceOf(LoreError);
      expect(error).toMatchObject({ type: "not_found", hint: expect.stringContaining("jira init --yes") });
    }
  });
});
