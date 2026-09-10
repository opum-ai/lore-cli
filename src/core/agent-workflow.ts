/** Public, versioned, read-only `opum-agent-workflow/v1` context projection. */

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { LoreError } from "../errors";
import type { AgentContextExport } from "./agent-context";
import { compileAgentContext } from "./agent-context";
import { type AgentProfileSnapshot, findAgentProfile } from "./agent-profile";
import type { BundleGraph } from "./bundle";

/** The public contract name served by `lore agent project` / `agent context --contract`. */
export const WORKFLOW_CONTRACT = "opum-agent-workflow";
/** The only request envelope version this build understands. */
export const WORKFLOW_VERSION = "v1";
/** The combined `--contract` selector accepted on the CLI facade. */
export const WORKFLOW_CONTRACT_SELECTOR = `${WORKFLOW_CONTRACT}/${WORKFLOW_VERSION}`;

/** Strict caller identity bound into every projection. */
export interface WorkflowRequest {
  readonly contract?: string;
  readonly version?: string;
  readonly task: {
    /** Caller-chosen correlation identity for the task (echoed verbatim). */
    readonly id: string;
    /** Task text compiled exactly like `lore agent context --task`. */
    readonly text: string;
  };
  readonly expect?: {
    /** Pin the previously observed packDigest; a mismatch is a conflict. */
    readonly contextDigest: string;
  };
}

const REQUEST_KEYS = new Set(["contract", "version", "task", "expect"]);
const TASK_KEYS = new Set(["id", "text"]);
const EXPECT_KEYS = new Set(["contextDigest"]);

/**
 * Parse and strictly validate one request envelope.
 * Unknown keys, missing fields, wrong contract/version, or empty strings are
 * stable public `validation` diagnostics — never a guess or a fallback.
 */
export function parseWorkflowRequest(raw: string): WorkflowRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw malformed("request envelope is not valid JSON", cause instanceof Error ? cause.message : String(cause));
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw malformed("request envelope must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!REQUEST_KEYS.has(key)) throw malformed(`unknown request field "${key}"`);
  }
  const contract = record.contract ?? WORKFLOW_CONTRACT;
  if (contract !== WORKFLOW_CONTRACT) {
    throw malformed(`unsupported contract "${String(contract)}"`, `this build serves ${WORKFLOW_CONTRACT}`);
  }
  const version = record.version ?? WORKFLOW_VERSION;
  if (version !== WORKFLOW_VERSION) {
    throw malformed(
      `unsupported version "${String(version)}"`,
      `this build serves ${WORKFLOW_CONTRACT}/${WORKFLOW_VERSION}`,
    );
  }
  if (typeof record.task !== "object" || record.task === null || Array.isArray(record.task)) {
    throw malformed('request field "task" must be an object with "id" and "text"');
  }
  const taskRecord = record.task as Record<string, unknown>;
  for (const key of Object.keys(taskRecord)) {
    if (!TASK_KEYS.has(key)) throw malformed(`unknown task field "${key}"`);
  }
  if (typeof taskRecord.id !== "string" || taskRecord.id.trim() === "") {
    throw malformed('request task field "id" must be a non-empty string');
  }
  if (typeof taskRecord.text !== "string" || taskRecord.text.trim() === "") {
    throw malformed('request task field "text" must be a non-empty string');
  }
  let expect: WorkflowRequest["expect"];
  if (record.expect !== undefined) {
    if (typeof record.expect !== "object" || record.expect === null || Array.isArray(record.expect)) {
      throw malformed('request field "expect" must be an object with "contextDigest"');
    }
    const expectRecord = record.expect as Record<string, unknown>;
    for (const key of Object.keys(expectRecord)) {
      if (!EXPECT_KEYS.has(key)) throw malformed(`unknown expect field "${key}"`);
    }
    if (typeof expectRecord.contextDigest !== "string" || expectRecord.contextDigest === "") {
      throw malformed('request expect field "contextDigest" must be a non-empty string');
    }
    expect = { contextDigest: expectRecord.contextDigest };
  }
  return {
    contract,
    version,
    task: { id: taskRecord.id, text: taskRecord.text },
    ...(expect === undefined ? {} : { expect }),
  };
}

function malformed(message: string, hint?: string): LoreError {
  return new LoreError(
    "validation",
    message,
    hint ?? `send a ${WORKFLOW_CONTRACT}/${WORKFLOW_VERSION} JSON object: {"contract","version","task":{"id","text"}}`,
    { contract: WORKFLOW_CONTRACT, version: WORKFLOW_VERSION },
  );
}

export interface WorkflowRevision {
  readonly path: string;
  readonly sha256: string;
  /** Freshness metadata only — never part of determinism claims. */
  readonly mtimeMs: number;
}

/** The public read-only projection envelope for one profile/task pair. */
export interface AgentWorkflowProjection {
  readonly contract: typeof WORKFLOW_CONTRACT;
  readonly version: typeof WORKFLOW_VERSION;
  /** Facade validator field: the single accepted envelope version, as a number. */
  readonly selectedVersion: 1;
  /** Deterministic correlation id: sha256 over contract|version|profile|taskId|digest. */
  readonly contextId: string;
  /** Bare 64-hex sha256 of the rendered context (facade form of packDigest). */
  readonly contextDigestSha256: string;
  readonly request: WorkflowRequest;
  readonly contextDigest: string;
  readonly packDigest: string;
  readonly sources: readonly string[];
  readonly profileRevision: WorkflowRevision;
  readonly inputRevisions: readonly WorkflowRevision[];
  readonly context: AgentContextExport;
}

/** The stable public failure markers served by the workflow binding seam. */
export type WorkflowBindingFailureCode =
  | "OPUM_WORKFLOW_LORE_ABSENT"
  | "OPUM_WORKFLOW_LORE_STALE"
  | "OPUM_WORKFLOW_LORE_INCOMPATIBLE"
  | "OPUM_WORKFLOW_LORE_MISMATCH";

/** The exact request binding accepted on the workflow binding seam. */
export interface WorkflowBinding {
  readonly contract: typeof WORKFLOW_CONTRACT;
  readonly supportedVersions: readonly [1];
  readonly requestId: string;
  readonly taskId: string;
  readonly profileId: string;
  readonly profileRevision?: string;
}

const BINDING_KEYS = new Set(["contract", "supportedVersions", "requestId", "taskId", "profileId", "profileRevision"]);

/** Thrown when the binding fails closed; the command layer maps it to a stable marker. */
export class WorkflowBindingError extends LoreError {
  readonly marker: WorkflowBindingFailureCode;
  constructor(marker: WorkflowBindingFailureCode, message: string, input?: Record<string, unknown>) {
    super(
      "validation",
      message,
      `the ${WORKFLOW_CONTRACT}/${WORKFLOW_VERSION} binding seam rejects this request`,
      input,
    );
    this.marker = marker;
  }
}

/**
 * Parse and strictly validate one request binding: unknown keys, a wrong
 * contract, a negotiation set that is not exactly [1], a non-32-hex requestId,
 * or empty taskId/profileId are stable public failures — never a guess or a
 * fallback. Fidelity of the echoed identity is the caller's contract.
 */
export function parseWorkflowBinding(raw: string): WorkflowBinding {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_INCOMPATIBLE", "binding is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_INCOMPATIBLE", "binding must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!BINDING_KEYS.has(key)) {
      throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_INCOMPATIBLE", `unknown binding field "${key}"`);
    }
  }
  if (record.contract !== WORKFLOW_CONTRACT) {
    throw new WorkflowBindingError(
      "OPUM_WORKFLOW_LORE_INCOMPATIBLE",
      `unsupported binding contract "${String(record.contract)}"`,
    );
  }
  const versions = record.supportedVersions;
  const negotiated = Array.isArray(versions) && versions.length === 1 && versions[0] === 1;
  if (!negotiated) {
    throw new WorkflowBindingError(
      "OPUM_WORKFLOW_LORE_INCOMPATIBLE",
      'binding "supportedVersions" must be exactly [1]',
    );
  }
  if (typeof record.requestId !== "string" || !/^[a-f0-9]{32}$/.test(record.requestId)) {
    throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_INCOMPATIBLE", 'binding "requestId" must be a 32-hex string');
  }
  if (typeof record.taskId !== "string" || record.taskId.trim() === "") {
    throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_INCOMPATIBLE", 'binding "taskId" must be a non-empty string');
  }
  if (typeof record.profileId !== "string" || record.profileId.trim() === "") {
    throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_INCOMPATIBLE", 'binding "profileId" must be a non-empty string');
  }
  if (
    record.profileRevision !== undefined &&
    (typeof record.profileRevision !== "string" || record.profileRevision === "")
  ) {
    throw new WorkflowBindingError(
      "OPUM_WORKFLOW_LORE_INCOMPATIBLE",
      'binding "profileRevision" must be a non-empty string when present',
    );
  }
  return {
    contract: WORKFLOW_CONTRACT,
    supportedVersions: [1],
    requestId: record.requestId,
    taskId: record.taskId,
    profileId: record.profileId,
    ...(record.profileRevision === undefined ? {} : { profileRevision: record.profileRevision as string }),
  };
}

/**
 * Compile the deterministic agent-context export and wrap it in the public
 * workflow projection. Read-only: stats/hashes inputs, never writes. When the
 * caller pins `context.expect.digest`, it must equal the freshly compiled
 * `packDigest` (the same evidence `lore agent context` already emits).
 */
export function compileAgentWorkflowProjection(
  snapshot: AgentProfileSnapshot,
  graph: BundleGraph,
  profileName: string,
  request: WorkflowRequest,
  options: { root: string; maxTokens?: number },
): AgentWorkflowProjection {
  const context = compileAgentContext(snapshot, graph, profileName, request.task.text, options.maxTokens);
  const pinned = request.expect?.contextDigest;
  if (pinned !== undefined && pinned !== context.packDigest) {
    throw new LoreError(
      "conflict",
      "context changed since the pinned digest",
      "recompile without expect.contextDigest, then pin the fresh contextDigest",
      { expected: pinned, actual: context.packDigest },
    );
  }
  const profile = findAgentProfile(snapshot, profileName);
  const profileRevision = revisionOf(resolve(options.root, profile.path), options.root);
  const sourcePaths = [...new Set(context.catalog.map((entry) => entry.sourcePath))].sort();
  const inputRevisions = sourcePaths.map((sourcePath) => revisionOf(resolve(options.root, sourcePath), options.root));
  return {
    contract: WORKFLOW_CONTRACT,
    version: WORKFLOW_VERSION,
    selectedVersion: 1,
    contextId: `sha256-${createHash("sha256")
      .update([WORKFLOW_CONTRACT, WORKFLOW_VERSION, profileName, request.task.id, context.packDigest].join("|"))
      .digest("hex")}`,
    contextDigestSha256: context.packDigest.replace(/^sha256:/, ""),
    request,
    contextDigest: context.packDigest,
    // packDigest is repeated verbatim so callers can correlate this envelope
    // with `lore agent context`'s existing evidence without re-deriving it.
    packDigest: context.packDigest,
    sources: context.catalog.map((entry) => entry.reference),
    profileRevision,
    inputRevisions,
    context,
  };
}

function revisionOf(absPath: string, root: string): WorkflowRevision {
  let stats: import("node:fs").Stats;
  const display = relative(root, absPath).split(sep).join("/");
  try {
    stats = statSync(absPath);
  } catch (cause) {
    throw new LoreError(
      "not_found",
      `projection input "${display}" disappeared`,
      "re-run the projection; the bundle or profile changed underneath it",
      { path: display, cause: cause instanceof Error ? cause.message : String(cause) },
    );
  }
  if (!stats.isFile()) {
    throw new LoreError(
      "validation",
      `projection input "${display}" is not a regular file`,
      "point sources and profiles at regular files inside the repository",
      { path: display },
    );
  }
  return {
    path: display,
    sha256: `sha256:${createHash("sha256").update(readFileSync(absPath)).digest("hex")}`,
    mtimeMs: stats.mtimeMs,
  };
}
