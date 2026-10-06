/**
 * The controller-composed `TaskContract` that `lore agent context --task-contract` accepts
 * (LCLI-681; ODOC-437 slice 2; DEC-163 (5a)).
 *
 * lore does NOT hydrate the task itself — opum-cli owns hydration and hands this document in.
 * This module therefore defines NO new shape: it parses the `TaskContract/v1` the design of
 * record already specifies (opum-doc `docs/specs/opum-task-context-and-evidence-contract.md`),
 * consuming only the fields the lean task-startup pack needs — `purpose`, `acceptance`,
 * `dependencies` and `documentation` — and accepting the rest of the v1 field set unchanged so a
 * richer contract from the controller is never a rejection.
 *
 * `--task` keeps its existing meaning (free text); this is a separate, opt-in input.
 */

import { LoreError } from "../errors";

/** The only `TaskContract` version this build understands. */
export const TASK_CONTRACT_SCHEMA_VERSION = 1;

/**
 * The stable public marker for a MANDATORY documentation reference that does not resolve to a
 * concept (and, when it carries one, an anchor). A missing OPTIONAL reference is not an error —
 * it becomes an omission carrying its reason (AC3).
 */
export const CONTEXT_REQUIRED_SOURCE_MISSING = "CONTEXT_REQUIRED_SOURCE_MISSING";

/**
 * How a documentation link relates to the task. `requires` and `constrains` are MANDATORY: the
 * task cannot be prepared without them. `explains` and `verifies` are optional background — a
 * missing one is recorded as an omission, never a failure.
 */
export type TaskContractLinkRelation = "requires" | "constrains" | "explains" | "verifies";

const MANDATORY_RELATIONS: ReadonlySet<TaskContractLinkRelation> = new Set(["requires", "constrains"]);
const RELATIONS: ReadonlySet<string> = new Set(["requires", "constrains", "explains", "verifies"]);

export interface TaskContractDocumentationLink {
  readonly repositoryId: string;
  readonly conceptId: string;
  /** A stable section anchor, preferred over the whole concept (selection step 2). */
  readonly anchor?: string;
  readonly relation: TaskContractLinkRelation;
}

export interface TaskContractAcceptance {
  readonly id: string;
  readonly text: string;
  readonly evidenceRule: string;
}

export interface TaskContractDependency {
  readonly taskId: string;
  readonly revision: string;
  readonly satisfied: boolean;
}

/** The subset of `TaskContract/v1` the lean startup pack carries. */
export interface ParsedTaskContract {
  readonly schemaVersion: typeof TASK_CONTRACT_SCHEMA_VERSION;
  readonly task: { readonly repositoryId: string; readonly id: string; readonly revision: string };
  readonly purpose: string;
  readonly phase: string;
  readonly acceptance: readonly TaskContractAcceptance[];
  readonly dependencies: readonly TaskContractDependency[];
  readonly documentation: readonly TaskContractDocumentationLink[];
}

/** True when a link must resolve for preparation to proceed. */
export function isMandatoryLink(link: TaskContractDocumentationLink): boolean {
  return MANDATORY_RELATIONS.has(link.relation);
}

// The full v1 top-level field set (the design of record). Every one is accepted; only the four
// this build consumes are validated in depth, so a controller that adds a field it already
// declared does not break on a stale lore.
const CONTRACT_KEYS: ReadonlySet<string> = new Set([
  "schemaVersion",
  "task",
  "purpose",
  "phase",
  "acceptance",
  "scope",
  "dependencies",
  "documentation",
  "decisions",
  "repository",
  "policyDigest",
  "profile",
  "contextBudget",
  "outputContract",
  "runBudgetId",
  "principalRef",
]);
const TASK_KEYS: ReadonlySet<string> = new Set(["repositoryId", "id", "revision"]);
const ACCEPTANCE_KEYS: ReadonlySet<string> = new Set(["id", "text", "evidenceRule"]);
const DEPENDENCY_KEYS: ReadonlySet<string> = new Set(["taskId", "revision", "satisfied"]);
const DOCUMENTATION_KEYS: ReadonlySet<string> = new Set(["repositoryId", "conceptId", "anchor", "relation"]);

/**
 * Parse and strictly validate one `TaskContract/v1` document. Malformed input is a stable
 * `validation` diagnostics — never a guess or a fallback, matching the workflow-request seam.
 */
export function parseTaskContract(raw: string): ParsedTaskContract {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw malformed("task contract is not valid JSON", cause instanceof Error ? cause.message : String(cause));
  }
  if (!isRecord(parsed)) throw malformed("task contract must be a JSON object");
  for (const key of Object.keys(parsed)) {
    if (!CONTRACT_KEYS.has(key)) throw malformed(`unknown task contract field "${key}"`);
  }
  if (parsed.schemaVersion !== TASK_CONTRACT_SCHEMA_VERSION) {
    throw malformed(
      `unsupported task contract schemaVersion ${JSON.stringify(parsed.schemaVersion)}`,
      `this build serves schemaVersion ${TASK_CONTRACT_SCHEMA_VERSION}`,
    );
  }
  if (!isRecord(parsed.task)) throw malformed('task contract field "task" must be an object');
  for (const key of Object.keys(parsed.task)) {
    if (!TASK_KEYS.has(key)) throw malformed(`unknown task contract task field "${key}"`);
  }
  const task = {
    repositoryId: requireString(parsed.task.repositoryId, 'task contract task field "repositoryId"'),
    id: requireString(parsed.task.id, 'task contract task field "id"'),
    revision: requireString(parsed.task.revision, 'task contract task field "revision"'),
  };
  const purpose = requireString(parsed.purpose, 'task contract field "purpose"');
  const phase = requireString(parsed.phase, 'task contract field "phase"');
  return {
    schemaVersion: TASK_CONTRACT_SCHEMA_VERSION,
    task,
    purpose,
    phase,
    acceptance: parseAcceptance(parsed.acceptance),
    dependencies: parseDependencies(parsed.dependencies),
    documentation: parseDocumentation(parsed.documentation),
  };
}

function parseAcceptance(value: unknown): readonly TaskContractAcceptance[] {
  return records(value, 'task contract field "acceptance"').map((entry, index) => {
    for (const key of Object.keys(entry)) {
      if (!ACCEPTANCE_KEYS.has(key)) throw malformed(`unknown acceptance field "${key}" at index ${index}`);
    }
    return {
      id: requireString(entry.id, `acceptance[${index}].id`),
      text: requireString(entry.text, `acceptance[${index}].text`),
      evidenceRule: requireString(entry.evidenceRule, `acceptance[${index}].evidenceRule`),
    };
  });
}

function parseDependencies(value: unknown): readonly TaskContractDependency[] {
  return records(value, 'task contract field "dependencies"').map((entry, index) => {
    for (const key of Object.keys(entry)) {
      if (!DEPENDENCY_KEYS.has(key)) throw malformed(`unknown dependency field "${key}" at index ${index}`);
    }
    if (typeof entry.satisfied !== "boolean") {
      throw malformed(`dependency[${index}].satisfied must be a boolean`);
    }
    return {
      taskId: requireString(entry.taskId, `dependency[${index}].taskId`),
      revision: requireString(entry.revision, `dependency[${index}].revision`),
      satisfied: entry.satisfied,
    };
  });
}

function parseDocumentation(value: unknown): readonly TaskContractDocumentationLink[] {
  return records(value, 'task contract field "documentation"').map((entry, index) => {
    for (const key of Object.keys(entry)) {
      if (!DOCUMENTATION_KEYS.has(key)) throw malformed(`unknown documentation field "${key}" at index ${index}`);
    }
    const relation = requireString(entry.relation, `documentation[${index}].relation`);
    if (!RELATIONS.has(relation)) {
      throw malformed(
        `documentation[${index}].relation "${relation}" is not one of requires, constrains, explains, verifies`,
      );
    }
    const anchor =
      entry.anchor === undefined ? undefined : requireString(entry.anchor, `documentation[${index}].anchor`);
    return {
      repositoryId: requireString(entry.repositoryId, `documentation[${index}].repositoryId`),
      conceptId: requireString(entry.conceptId, `documentation[${index}].conceptId`),
      ...(anchor === undefined ? {} : { anchor }),
      relation: relation as TaskContractLinkRelation,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown, field: string): readonly Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw malformed(`${field} must be an array`);
  for (const entry of value) {
    if (!isRecord(entry)) throw malformed(`${field} entries must be objects`);
  }
  return value as readonly Record<string, unknown>[];
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw malformed(`${field} must be a non-empty string`);
  return value;
}

function malformed(message: string, hint?: string): LoreError {
  return new LoreError(
    "validation",
    message,
    hint ?? "pass a TaskContract/v1 JSON object on stdin or via --task-contract <file|->",
    { schemaVersion: TASK_CONTRACT_SCHEMA_VERSION },
  );
}
