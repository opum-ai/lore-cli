/**
 * adapters/jira-onboarding.ts — the two live jira-cli reads `lore init` needs to configure the jira
 * backend, and nothing else (LCLI-358.4).
 *
 * Selecting `jira` used to produce a bundle that broke on its first tracker command: `lore init`
 * wrote `backend = "jira"` and no `[tracker.jira]` table at all, so `createTrackerAdapter` threw
 * `tracker.jira configuration is required when the tracker backend is jira`. Writing that table
 * needs exactly two facts from the operator's own jira-cli installation — which credential profile
 * to use, and that the project key resolves under it — so this module answers exactly those and
 * stops.
 *
 * **jira-cli owns credentials; Lore never sees them.** Neither function reads a token, prompts for
 * one, or persists one, and `jira init` — the interactive, credential-bearing setup — is only ever
 * named in a hint for the operator to run themselves. The zero-profile case is precisely that hint:
 * it is not a state `lore init` can fix on the operator's behalf.
 *
 * Kept separate from {@link import("./jira").createJiraAdapter} on purpose. That adapter is
 * constructed *from* a `JiraTrackerConfig` and cannot exist before one is written, which is the
 * chicken-and-egg this module breaks: it talks to jira-cli with no Lore configuration at all,
 * passing `--profile` explicitly rather than reading it back out of a file that does not yet exist.
 */

import { LoreError } from "../errors";
import { bunJiraSpawn, type JiraSpawn, type JiraSpawnResult } from "./jira";

const INSTALL_HINT = "install @salient-ai/jira-cli, then run `jira init` in the project root";

/** One jira-cli credential profile, as `jira config list-profiles` reports it. Never carries a secret. */
export interface JiraProfile {
  readonly name: string;
  /** The Jira site the profile points at, shown so an operator with several can tell them apart. */
  readonly jiraUrl: string | undefined;
  /** Whether jira-cli treats this as its default profile — the answer Lore offers first. */
  readonly isDefault: boolean;
}

/** What a validated project key resolved to, used to seed `tracker.jira.issue_type`. */
export interface JiraProjectSummary {
  readonly key: string;
  readonly name: string;
  /** Issue-type names available in the project, in jira-cli's own order. */
  readonly issueTypes: readonly string[];
}

/**
 * The live jira-cli reads `lore init` performs. An injectable interface, not a pair of loose
 * functions, so the wizard's whole jira branch is testable without jira-cli installed and without
 * any credential on the machine running the tests.
 */
export interface JiraOnboarding {
  /** Every credential profile jira-cli knows about. An empty list is a valid answer, not an error. */
  listProfiles(): Promise<readonly JiraProfile[]>;
  /** Resolve `key` under `profile`, or throw carrying jira-cli's own reason for the failure. */
  describeProject(key: string, profile: string): Promise<JiraProjectSummary>;
}

/** The real implementation, shelling the `jira` binary from `root`. */
export function realJiraOnboarding(root: string, spawn: JiraSpawn = bunJiraSpawn(root)): JiraOnboarding {
  return {
    async listProfiles() {
      const data = await invokeJson(spawn, ["config", "list-profiles"], "config list-profiles");
      const raw = data.profiles;
      if (!Array.isArray(raw)) {
        throw drift("`jira config list-profiles` did not return a profiles array");
      }
      return raw.map((entry, index) => {
        const record = asRecord(entry, `jira config list-profiles profiles[${index}]`);
        if (typeof record.name !== "string" || record.name === "") {
          throw drift(`\`jira config list-profiles\` profiles[${index}] has no name`);
        }
        return {
          name: record.name,
          jiraUrl: typeof record.jiraUrl === "string" ? record.jiraUrl : undefined,
          isDefault: record.isDefault === true,
        };
      });
    },

    async describeProject(key, profile) {
      const data = await invokeJson(spawn, ["--profile", profile, "project", "get", key], `project get ${key}`);
      const project = asRecord(data.project, "jira project get project");
      const issueTypes = Array.isArray(project.issue_types)
        ? project.issue_types.flatMap((entry) => {
            const record = asRecord(entry, "jira project get issue_types entry");
            return typeof record.name === "string" ? [record.name] : [];
          })
        : [];
      return {
        key: typeof project.key === "string" ? project.key : key,
        name: typeof project.name === "string" ? project.name : key,
        issueTypes,
      };
    },
  };
}

/** Run one jira-cli command and return its success envelope's `data`, classifying every failure. */
async function invokeJson(
  spawn: JiraSpawn,
  args: readonly string[],
  operation: string,
): Promise<Record<string, unknown>> {
  let result: JiraSpawnResult;
  try {
    result = await spawn(args);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      throw new LoreError("not_found", "the `jira` CLI is not installed or not on PATH", INSTALL_HINT, {
        binary: "jira",
      });
    }
    throw new LoreError(
      "conflict",
      `the \`jira\` CLI could not be started${cause instanceof Error ? `: ${cause.message}` : ""}`,
      INSTALL_HINT,
      code === undefined ? undefined : { code },
    );
  }
  if (result.exitCode !== 0) {
    throw cliError(result, operation, args);
  }
  const envelope = parseJson(result.stdout, `jira ${operation}`);
  if (envelope.success !== true || !isRecord(envelope.data)) {
    throw drift(`\`jira ${operation}\` did not return a success JSON envelope`);
  }
  return envelope.data;
}

/**
 * Translate a non-zero jira-cli exit into a classified {@link LoreError} **carrying jira-cli's own
 * `error` string verbatim** (LCLI-358.4 AC#3).
 *
 * That verbatim pass-through is the requirement, not a nicety. jira-cli already knows why a key did
 * not resolve — "No project could be found with key 'NOPEKEY'" — and replacing it with a generic
 * "project validation failed" throws away the only sentence that tells the operator whether they
 * mistyped a key, picked the wrong site, or lost their credentials.
 */
function cliError(result: JiraSpawnResult, operation: string, args: readonly string[]): LoreError {
  const parsed = parseErrorEnvelope(result.stderr);
  const message = parsed?.error ?? `exited ${result.exitCode}`;
  const statusCode = parsed?.statusCode;
  const lower = message.toLowerCase();
  if (statusCode === 404) {
    return new LoreError("not_found", `\`jira ${operation}\` failed: ${message}`, "check the Jira project key", {
      operation,
      exitCode: result.exitCode,
      statusCode,
    });
  }
  if (statusCode === 401 || statusCode === 403 || lower.includes("profile") || lower.includes("credential")) {
    return new LoreError(
      "denied",
      `\`jira ${operation}\` failed: ${message}`,
      "re-authenticate with `jira init`; Lore never stores Jira credentials",
      { operation, exitCode: result.exitCode, ...(statusCode === undefined ? {} : { statusCode }) },
    );
  }
  return new LoreError(
    "validation",
    `\`jira ${operation}\` failed: ${message}`,
    `run \`jira ${args.join(" ")}\` directly for more detail`,
    { operation, exitCode: result.exitCode, ...(statusCode === undefined ? {} : { statusCode }) },
  );
}

/** jira-cli's failure envelope on stderr, or `undefined` when it printed something else entirely. */
function parseErrorEnvelope(stderr: string): { error: string; statusCode?: number } | undefined {
  let value: unknown;
  try {
    value = JSON.parse(stderr.trim());
  } catch {
    const text = stderr.trim();
    return text === "" ? undefined : { error: text };
  }
  if (!isRecord(value) || typeof value.error !== "string") {
    return undefined;
  }
  return {
    error: value.error,
    ...(typeof value.status_code === "number" ? { statusCode: value.status_code } : {}),
  };
}

function parseJson(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text.trim());
  } catch {
    throw drift(`\`${label}\` did not print parseable JSON`);
  }
  if (!isRecord(value)) {
    throw drift(`\`${label}\` did not print a JSON object`);
  }
  return value;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw drift(`${label} was not a JSON object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** jira-cli returned a shape this contract does not recognize — a version skew, not operator error. */
function drift(message: string): LoreError {
  return new LoreError("drift", message, "check the installed @salient-ai/jira-cli version against Lore's contract");
}
