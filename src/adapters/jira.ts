/** Jira Cloud tracker adapter backed exclusively by the installed `jira` CLI. */

import type { JiraTrackerConfig } from "../config";
import { errnoCode, LoreError } from "../errors";
import type {
  BacklogComment,
  BacklogCriterion,
  BacklogTask,
  BacklogTaskDetail,
  CreateTaskInput,
  EditTaskPatch,
  ListTasksOptions,
} from "./backlog";
import type { TrackerAdapter, TrackerCapability } from "./tracker";

const INSTALL_HINT = "install @salient-ai/jira-cli, then run `jira init --yes` in the project root";
const MANAGED_BEGIN = "LORE-JIRA-METADATA-BEGIN";
const MANAGED_END = "LORE-JIRA-METADATA-END";
const SEARCH_FIELDS = "key,summary,status,assignee,priority,labels,issuetype,parent,subtasks,fixVersions";

export interface JiraSpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Injectable subprocess seam. Tests never execute the real CLI or require credentials. */
export type JiraSpawn = (args: readonly string[]) => Promise<JiraSpawnResult>;

export interface JiraAdapterOptions {
  readonly binary?: string;
  readonly spawn?: JiraSpawn;
}

interface JiraCliErrorEnvelope {
  readonly success: false;
  readonly error: string;
  readonly statusCode?: number;
}

interface JiraVocabulary {
  readonly capability: TrackerCapability;
  readonly issueTypes: ReadonlySet<string>;
  readonly priorities: ReadonlySet<string>;
}

interface LoreJiraMetadata {
  readonly version: 1;
  readonly description: string | null;
  readonly milestone: string | null;
  readonly references: readonly string[];
  readonly documentation: readonly string[];
  readonly acceptanceCriteria: readonly BacklogCriterion[];
  readonly definitionOfDone: readonly BacklogCriterion[];
  readonly implementationPlan: string | null;
  readonly implementationNotes: string | null;
  readonly finalSummary: string | null;
}

/** Real Bun subprocess transport. The child inherits jira-cli's own credential environment. */
export function bunJiraSpawn(root: string, binary = "jira"): JiraSpawn {
  return async (args) => {
    const child = Bun.spawn([binary, ...args], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, exitCode };
  };
}

/** Construct a Jira adapter. Configuration is non-secret; jira-cli owns credentials and HTTP. */
export function createJiraAdapter(
  root: string,
  config: JiraTrackerConfig,
  options: JiraAdapterOptions = {},
): TrackerAdapter {
  const project = required(config.project, "tracker.jira.project");
  const issueType = required(config.issueType, "tracker.jira.issue_type");
  const statusFlow = nonEmptyStrings(config.statusFlow, "tracker.jira.status_flow");
  const defaultLabels = strings(config.defaultLabels, "tracker.jira.default_labels");
  const spawn = options.spawn ?? bunJiraSpawn(root, options.binary);
  const prefix = config.profile === undefined ? [] : ["--profile", required(config.profile, "tracker.jira.profile")];
  let vocabulary: Promise<JiraVocabulary> | undefined;

  async function invoke(args: readonly string[]): Promise<JiraSpawnResult> {
    try {
      return await spawn([...prefix, ...args]);
    } catch (cause) {
      const code = errnoCode(cause);
      if (code === "ENOENT") {
        throw new LoreError("not_found", "the `jira` CLI is not installed or not on PATH", INSTALL_HINT, {
          binary: options.binary ?? "jira",
        });
      }
      throw new LoreError(
        "conflict",
        `the \`jira\` CLI could not be started${cause instanceof Error ? `: ${cause.message}` : ""}`,
        INSTALL_HINT,
        code === undefined ? undefined : { code },
      );
    }
  }

  async function invokeJson(args: readonly string[], operation: string): Promise<Record<string, unknown>> {
    const result = await invoke(args);
    if (result.exitCode !== 0) {
      throwCliError(result, operation, args);
    }
    const envelope = parseJsonObject(result.stdout, `jira ${operation}`);
    if (envelope.success !== true || !isRecord(envelope.data)) {
      drift(`\`jira ${operation}\` did not return a success JSON envelope`, { operation });
    }
    return envelope.data as Record<string, unknown>;
  }

  async function loadVocabulary(): Promise<JiraVocabulary> {
    const versionResult = await invoke(["--version"]);
    if (versionResult.exitCode !== 0 || versionResult.stdout.trim() === "") {
      if (versionResult.exitCode !== 0) {
        throwCliError(versionResult, "--version", ["--version"]);
      }
      drift("`jira --version` returned an empty version");
    }

    const [projectData, priorityData] = await Promise.all([
      invokeJson(["project", "get", project], "project get"),
      invokeJson(["metadata", "priorities"], "metadata priorities"),
    ]);
    const projectValue = recordAt(projectData, "project", "jira project get");
    const issueTypes = new Set(
      arrayAt(projectValue, "issue_types", "jira project get").map((entry, index) =>
        stringAt(asRecord(entry, `jira project get issue_types[${index}]`), "name", "jira project get"),
      ),
    );
    if (!issueTypes.has(issueType)) {
      throw new LoreError(
        "validation",
        `Jira issue type ${JSON.stringify(issueType)} is not available in project ${project}`,
        `set tracker.jira.issue_type to one of: ${[...issueTypes].join(", ")}`,
        { project, issueType },
      );
    }
    const priorities = new Set(
      arrayAt(priorityData, "priorities", "jira metadata priorities").map((entry, index) =>
        stringAt(asRecord(entry, `jira metadata priorities[${index}]`), "name", "jira metadata priorities"),
      ),
    );
    return {
      capability: { version: versionResult.stdout.trim() },
      issueTypes,
      priorities,
    };
  }

  function ensureProbed(): Promise<JiraVocabulary> {
    vocabulary ??= loadVocabulary();
    return vocabulary;
  }

  async function search(jql: string): Promise<BacklogTask[]> {
    const vocab = await ensureProbed();
    const tasks: BacklogTask[] = [];
    let token: string | undefined;
    const seenTokens = new Set<string>();
    do {
      const args = ["issue", "search", "--jql", jql, "--fields", SEARCH_FIELDS, "--max-results", "50"];
      if (token !== undefined) {
        args.push("--next-page-token", token);
      }
      const data = await invokeJson(args, "issue search");
      for (const [index, issue] of arrayAt(data, "issues", "jira issue search").entries()) {
        tasks.push(mapSummary(asRecord(issue, `jira issue search issues[${index}]`), vocab));
      }
      const next = optionalString(data.next_page_token, "jira issue search next_page_token");
      const isLast = data.is_last;
      if (isLast !== undefined && typeof isLast !== "boolean") {
        drift("`jira issue search` returned a non-boolean is_last");
      }
      if (isLast === false && next === undefined) {
        drift("`jira issue search` reported another page without a next_page_token");
      }
      if (next !== undefined && seenTokens.has(next)) {
        drift("`jira issue search` repeated a next_page_token");
      }
      if (next !== undefined) seenTokens.add(next);
      token = isLast === true ? undefined : next;
    } while (token !== undefined);
    return tasks;
  }

  async function getIssue(id: string): Promise<Record<string, unknown> | null> {
    try {
      const data = await invokeJson(["issue", "get", id], "issue get");
      return recordAt(data, "issue", "jira issue get");
    } catch (error) {
      if (error instanceof LoreError && error.type === "not_found") return null;
      throw error;
    }
  }

  async function getComments(id: string): Promise<BacklogComment[]> {
    const comments: BacklogComment[] = [];
    let startAt = 0;
    for (;;) {
      const data = await invokeJson(
        ["comment", "list", id, "--max-results", "100", "--start-at", String(startAt), "--order-by", "created"],
        "comment list",
      );
      const page = arrayAt(data, "comments", "jira comment list");
      for (const [index, value] of page.entries()) {
        const comment = asRecord(value, `jira comment list comments[${index}]`);
        comments.push({
          author: nullableString(comment.author, "jira comment author"),
          createdAt: nullableString(comment.created, "jira comment created"),
          body: stringAt(comment, "body", "jira comment list"),
        });
      }
      const total = numberAt(data, "total", "jira comment list");
      startAt += page.length;
      if (startAt >= total) return comments;
      if (page.length === 0) drift("`jira comment list` returned an empty page before total comments were read");
    }
  }

  async function resolveTransition(id: string, status: string): Promise<string> {
    if (!statusFlow.includes(status)) {
      throw new LoreError(
        "validation",
        `status ${JSON.stringify(status)} is outside tracker.jira.status_flow`,
        `use one of: ${statusFlow.join(", ")}`,
        { id, status },
      );
    }
    const data = await invokeJson(["issue", "transitions", id], "issue transitions");
    const transitions = arrayAt(data, "transitions", "jira issue transitions").map((value, index) =>
      asRecord(value, `jira issue transitions[${index}]`),
    );
    const match = transitions.find((transition) => transition.to_status === status || transition.name === status);
    if (match === undefined) {
      const available = transitions
        .map((transition) => optionalString(transition.to_status, "jira transition to_status"))
        .filter((value): value is string => value !== undefined);
      throw new LoreError(
        "conflict",
        `Jira transition graph does not allow ${id} to move to ${JSON.stringify(status)}`,
        `run \`jira issue transitions ${id}\` and choose a reachable status${available.length ? ` (${available.join(", ")})` : ""}`,
        { id, status, available },
      );
    }
    return stringAt(match, "id", "jira issue transitions");
  }

  return {
    async probe(): Promise<TrackerCapability> {
      return (await ensureProbed()).capability;
    },

    statusFlow: () => statusFlow,

    async listTasks(opts?: ListTasksOptions): Promise<BacklogTask[]> {
      const clauses = [`project = ${jqlString(project)}`];
      if (opts?.status !== undefined) clauses.push(`status = ${jqlString(opts.status)}`);
      for (const label of opts?.labels ?? []) clauses.push(`labels = ${jqlString(label)}`);
      return search(clauses.join(" AND "));
    },

    async viewTask(id: string): Promise<BacklogTaskDetail | null> {
      const vocab = await ensureProbed();
      const issue = await getIssue(id);
      if (issue === null) return null;
      const comments = await getComments(id);
      return mapDetail(issue, comments, vocab);
    },

    async searchByLabel(label: string): Promise<BacklogTask[]> {
      return search(`project = ${jqlString(project)} AND labels = ${jqlString(label)}`);
    },

    async searchTasks(query: string): Promise<BacklogTask[]> {
      return search(`project = ${jqlString(project)} AND text ~ ${jqlString(query)}`);
    },

    async createTask(input: CreateTaskInput): Promise<string> {
      await ensureProbed();
      const metadata = emptyMetadata({
        description: input.description ?? null,
        documentation: input.doc ?? [],
        milestone: input.milestone ?? null,
      });
      const args = [
        "issue",
        "create",
        "--project",
        project,
        "--summary",
        required(input.title, "task title"),
        "--type",
        issueType,
        "--description",
        renderManagedDescription(metadata),
      ];
      const labels = unique([...defaultLabels, ...(input.labels ?? [])]);
      if (labels.length > 0) args.push("--labels", ...labels);
      const data = await invokeJson(args, "issue create");
      return stringAt(data, "issue_key", "jira issue create");
    },

    async editTask(id: string, patch: EditTaskPatch): Promise<void> {
      await ensureProbed();
      const transitionId = patch.status === undefined ? undefined : await resolveTransition(id, patch.status);
      const hasLabelPatch = (patch.addLabels?.length ?? 0) > 0 || (patch.removeLabels?.length ?? 0) > 0;
      const needsIssue = patch.doc !== undefined || hasLabelPatch;
      if (needsIssue) {
        const issue = await getIssue(id);
        if (issue === null) {
          throw new LoreError(
            "not_found",
            `Jira issue ${id} was not found`,
            `check the issue key in project ${project}`,
            { id },
          );
        }
        const fields = recordAt(issue, "fields", "jira issue get");
        const updateArgs = ["issue", "update", id];
        if (patch.doc !== undefined) {
          const current = parseManagedDescription(nullableString(fields.description, "jira issue description"));
          const metadata = { ...current.metadata, documentation: strings(patch.doc, "task documentation") };
          updateArgs.push("--description", renderManagedDescription(metadata));
        }
        if (hasLabelPatch) {
          const current = stringArray(fields.labels, "jira issue labels");
          const remove = new Set(patch.removeLabels ?? []);
          const labels = unique([...current.filter((label) => !remove.has(label)), ...(patch.addLabels ?? [])]);
          if (labels.length === 0) {
            updateArgs.push("--custom-fields", JSON.stringify({ labels: [] }));
          } else {
            updateArgs.push("--labels", ...labels);
          }
        }
        if (updateArgs.length > 3) await invokeJson(updateArgs, "issue update");
      }
      if (transitionId !== undefined) {
        await invokeJson(["issue", "transition", id, "--id", transitionId], "issue transition");
      }
    },
  };
}

function mapSummary(issue: Record<string, unknown>, vocab: JiraVocabulary): BacklogTask {
  const fields = recordAt(issue, "fields", "Jira issue");
  validateVocabulary(fields, vocab);
  const assignee = nullableRecord(fields.assignee, "Jira assignee");
  const parent = nullableRecord(fields.parent, "Jira parent");
  const priority = nullableRecord(fields.priority, "Jira priority");
  const versions = optionalRecordArray(fields.fixVersions, "Jira fixVersions");
  return {
    id: stringAt(issue, "key", "Jira issue"),
    title: stringAt(fields, "summary", "Jira issue fields"),
    status: stringAt(recordAt(fields, "status", "Jira issue fields"), "name", "Jira status"),
    priority: priority === null ? null : stringAt(priority, "name", "Jira priority"),
    ordinal: null,
    assignees: assignee === null ? [] : [displayName(assignee)],
    labels: stringArray(fields.labels, "Jira labels"),
    milestone: versions[0] === undefined ? null : stringAt(versions[0], "name", "Jira fixVersion"),
    parentTaskId: parent === null ? null : stringAt(parent, "key", "Jira parent"),
  };
}

function mapDetail(
  issue: Record<string, unknown>,
  comments: readonly BacklogComment[],
  vocab: JiraVocabulary,
): BacklogTaskDetail {
  const summary = mapSummary(issue, vocab);
  const fields = recordAt(issue, "fields", "Jira issue");
  const parsed = parseManagedDescription(nullableString(fields.description, "Jira description"));
  const reporter = nullableRecord(fields.reporter, "Jira reporter");
  const links = optionalRecordArray(fields.issuelinks, "Jira issue links");
  const dependencies = unique(
    links.flatMap((link) => {
      const inward = nullableRecord(link.inwardIssue, "Jira inward issue");
      const outward = nullableRecord(link.outwardIssue, "Jira outward issue");
      return [inward, outward]
        .filter((value): value is Record<string, unknown> => value !== null)
        .map((value) => stringAt(value, "key", "Jira linked issue"));
    }),
  );
  const subtasks = optionalRecordArray(fields.subtasks, "Jira subtasks").map((subtask) => ({
    id: stringAt(subtask, "key", "Jira subtask"),
    title: stringAt(recordAt(subtask, "fields", "Jira subtask"), "summary", "Jira subtask fields"),
  }));
  return {
    ...summary,
    milestone: parsed.metadata.milestone ?? summary.milestone,
    file: null,
    reporter: reporter === null ? null : displayName(reporter),
    createdAt: nullableString(fields.created, "Jira created"),
    updatedAt: nullableString(fields.updated, "Jira updated"),
    dependencies,
    references: parsed.metadata.references,
    documentation: parsed.metadata.documentation,
    modifiedFiles: [],
    subtasks,
    acceptanceCriteria: parsed.metadata.acceptanceCriteria,
    definitionOfDone: parsed.metadata.definitionOfDone,
    description: parsed.metadata.description,
    implementationPlan: parsed.metadata.implementationPlan,
    implementationNotes: parsed.metadata.implementationNotes,
    finalSummary: parsed.metadata.finalSummary,
    comments,
  };
}

function validateVocabulary(fields: Record<string, unknown>, vocab: JiraVocabulary): void {
  const issueType = stringAt(recordAt(fields, "issuetype", "Jira issue fields"), "name", "Jira issue type");
  if (!vocab.issueTypes.has(issueType)) {
    throw new LoreError(
      "validation",
      `Jira returned issue type ${JSON.stringify(issueType)} outside the project vocabulary`,
      `use one of: ${[...vocab.issueTypes].join(", ")}`,
      { issueType },
    );
  }
  const priority = nullableRecord(fields.priority, "Jira priority");
  if (priority !== null) {
    const name = stringAt(priority, "name", "Jira priority");
    if (!vocab.priorities.has(name)) {
      throw new LoreError(
        "validation",
        `Jira returned priority ${JSON.stringify(name)} outside its vocabulary`,
        `use one of: ${[...vocab.priorities].join(", ")}`,
        { priority: name },
      );
    }
  }
}

function emptyMetadata(overrides: Partial<LoreJiraMetadata> = {}): LoreJiraMetadata {
  return {
    version: 1,
    description: null,
    milestone: null,
    references: [],
    documentation: [],
    acceptanceCriteria: [],
    definitionOfDone: [],
    implementationPlan: null,
    implementationNotes: null,
    finalSummary: null,
    ...overrides,
  };
}

/** Render the visible Markdown plus a deterministic JSON region jira-cli converts to ADF. */
export function renderManagedDescription(metadata: LoreJiraMetadata): string {
  const encoded = JSON.stringify(metadata, null, 2);
  if (encoded.includes(MANAGED_BEGIN) || encoded.includes(MANAGED_END)) {
    throw new LoreError(
      "validation",
      "task description contains a reserved Lore Jira metadata marker",
      "remove the LORE-JIRA-METADATA marker text from the authored description",
    );
  }
  const visible = metadata.description?.trimEnd();
  return [
    ...(visible ? [visible, ""] : []),
    "---",
    "",
    MANAGED_BEGIN,
    "",
    "```json",
    encoded,
    "```",
    "",
    MANAGED_END,
  ].join("\n");
}

function parseManagedDescription(markdown: string | null): { metadata: LoreJiraMetadata } {
  if (markdown === null || markdown.trim() === "") return { metadata: emptyMetadata() };
  const begin = markdown.indexOf(MANAGED_BEGIN);
  const end = markdown.indexOf(MANAGED_END);
  if (begin === -1 && end === -1) return { metadata: emptyMetadata({ description: markdown }) };
  if (
    begin === -1 ||
    end < begin ||
    markdown.indexOf(MANAGED_BEGIN, begin + 1) !== -1 ||
    markdown.indexOf(MANAGED_END, end + 1) !== -1
  ) {
    drift("Jira description has a malformed Lore metadata region");
  }
  const region = markdown.slice(begin + MANAGED_BEGIN.length, end);
  const match = /```json\s*\n([\s\S]*?)\n```/.exec(region);
  if (match === null) drift("Jira description Lore metadata region has no JSON code block");
  let value: unknown;
  try {
    value = JSON.parse(match[1] as string);
  } catch {
    drift("Jira description Lore metadata region is not valid JSON");
  }
  return { metadata: parseMetadata(value) };
}

function parseMetadata(value: unknown): LoreJiraMetadata {
  const data = asRecord(value, "Lore Jira metadata");
  if (data.version !== 1) drift("Jira description Lore metadata has an unsupported version", { version: data.version });
  return {
    version: 1,
    description: nullableString(data.description, "Lore Jira metadata description"),
    milestone: nullableString(data.milestone, "Lore Jira metadata milestone"),
    references: stringArray(data.references, "Lore Jira metadata references"),
    documentation: stringArray(data.documentation, "Lore Jira metadata documentation"),
    acceptanceCriteria: criteria(data.acceptanceCriteria, "Lore Jira metadata acceptanceCriteria"),
    definitionOfDone: criteria(data.definitionOfDone, "Lore Jira metadata definitionOfDone"),
    implementationPlan: nullableString(data.implementationPlan, "Lore Jira metadata implementationPlan"),
    implementationNotes: nullableString(data.implementationNotes, "Lore Jira metadata implementationNotes"),
    finalSummary: nullableString(data.finalSummary, "Lore Jira metadata finalSummary"),
  };
}

function criteria(value: unknown, label: string): BacklogCriterion[] {
  if (!Array.isArray(value)) drift(`${label} must be an array`);
  return value.map((item, index) => {
    const record = asRecord(item, `${label}[${index}]`);
    if (typeof record.text !== "string" || typeof record.checked !== "boolean") {
      drift(`${label}[${index}] must contain string text and boolean checked`);
    }
    return { text: record.text, checked: record.checked };
  });
}

function throwCliError(result: JiraSpawnResult, operation: string, args: readonly string[]): never {
  const envelope = parseCliError(result.stderr);
  const statusCode = envelope.statusCode;
  const message = envelope.error;
  const lower = message.toLowerCase();
  let type: LoreError["type"] = "validation";
  let hint = `run \`jira ${args.join(" ")}\` directly for more detail`;
  if (statusCode === 404) {
    type = "not_found";
    hint = "check the Jira project and issue key";
  } else if (statusCode === 401 || statusCode === 403 || lower.includes("profile") || lower.includes("credential")) {
    type = "denied";
    hint = INSTALL_HINT;
  } else if (statusCode === 429) {
    type = "conflict";
    hint = "wait for the Jira rate-limit window to reset, then rerun the command; Lore does not retry silently";
  } else if (lower.includes("timed out") || lower.includes("timeout")) {
    type = "conflict";
    hint = "check Jira connectivity or adjust jira-cli's JIRA_TIMEOUT_MS, then rerun; Lore does not retry silently";
  } else if (operation === "issue transition" || operation === "issue transitions") {
    type = "conflict";
    hint = `run \`jira issue transitions ${args[2] ?? "<issue>"}\` and choose a reachable status`;
  }
  throw new LoreError(type, `\`jira ${operation}\` failed: ${message}`, hint, {
    operation,
    exitCode: result.exitCode,
    ...(statusCode === undefined ? {} : { statusCode }),
  });
}

function parseCliError(stderr: string): JiraCliErrorEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(stderr.trim());
  } catch {
    drift("`jira` failed without a JSON error envelope", { stderr: stderr.trim() });
  }
  const record = asRecord(value, "jira error envelope");
  if (record.success !== false || typeof record.error !== "string") {
    drift("`jira` failed with an invalid JSON error envelope");
  }
  const rawStatus = record.status_code;
  if (rawStatus !== undefined && typeof rawStatus !== "number") {
    drift("`jira` error envelope status_code was not a number");
  }
  return { success: false, error: record.error, ...(rawStatus === undefined ? {} : { statusCode: rawStatus }) };
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text.trim());
  } catch {
    drift(`\`${label}\` did not print parseable JSON`);
  }
  return asRecord(value, `${label} envelope`);
}

function required(value: string | undefined, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new LoreError("validation", `${key} is required for the Jira tracker`, `set ${key} in .lore/config.toml`, {
      key,
    });
  }
  return value.trim();
}

function nonEmptyStrings(values: readonly string[], key: string): readonly string[] {
  const result = strings(values, key);
  if (result.length === 0) {
    throw new LoreError(
      "validation",
      `${key} must contain at least one status`,
      `configure the Jira workflow order in ${key}`,
    );
  }
  return result;
}

function strings(values: readonly string[], key: string): readonly string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new LoreError("validation", `${key} must contain only non-empty strings`, `fix ${key} in .lore/config.toml`);
  }
  return values.map((value) => value.trim());
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function jqlString(value: string): string {
  return JSON.stringify(value);
}

function displayName(user: Record<string, unknown>): string {
  return optionalString(user.displayName, "Jira user displayName") ?? stringAt(user, "accountId", "Jira user");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) drift(`${label} must be an object`);
  return value;
}

function nullableRecord(value: unknown, label: string): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return asRecord(value, label);
}

function optionalRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) drift(`${label} must be an array`);
  return value.map((item, index) => asRecord(item, `${label}[${index}]`));
}

function recordAt(record: Record<string, unknown>, key: string, label: string): Record<string, unknown> {
  return asRecord(record[key], `${label}.${key}`);
}

function arrayAt(record: Record<string, unknown>, key: string, label: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) drift(`${label}.${key} must be an array`);
  return value;
}

function stringAt(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string") drift(`${label}.${key} must be a string`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) drift(`${label} must be a string array`);
  return value as string[];
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") drift(`${label} must be a string or null`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return optionalString(value, label) ?? null;
}

function numberAt(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) drift(`${label}.${key} must be a number`);
  return value;
}

function drift(message: string, input?: Record<string, unknown>): never {
  throw new LoreError(
    "drift",
    message,
    "upgrade @salient-ai/jira-cli or adjust the Jira adapter to its current JSON contract",
    input,
  );
}
