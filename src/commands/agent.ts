/** Thin CLI layer for singular task-scoped agent context profiles. */

import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { type AgentContextExport, compileAgentContext, renderAgentContextMarkdown } from "../core/agent-context";
import {
  type AgentProfile,
  findAgentProfile,
  loadAgentProfiles,
  validateAgentProfileReferences,
} from "../core/agent-profile";
import {
  type AgentWorkflowProjection,
  compileAgentWorkflowProjection,
  parseWorkflowBinding,
  parseWorkflowRequest,
  WORKFLOW_CONTRACT,
  WORKFLOW_CONTRACT_SELECTOR,
  type WorkflowBinding,
  WorkflowBindingError,
  type WorkflowBindingFailureCode,
} from "../core/agent-workflow";
import { compareCodeUnits } from "../core/order";
import { loadReferenceRetrievalGraph, type RetrievalGraphLoader } from "../core/retrieval";
import { EXIT_OK, LoreError, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertFlagAtMostOnce, parseCommandArgs, singleOptionValue, usage } from "./args";
import { readSource } from "./discover";
import { assertNoSymlinkInPath, classifyExistingFile, ensureDir, writeFileAtomic } from "./fswrite";

export interface AgentCommandOptions {
  readonly root: string;
  readonly output: OutputContext;
  readonly args: readonly string[];
  readonly stdout?: Writer;
  readonly stderr?: Writer;
  readonly adapter?: BacklogAdapter;
  readonly retrieval?: RetrievalGraphLoader;
  readonly readTaskFile?: (path: string) => string;
}

export interface AgentProfilesResult {
  readonly profiles: readonly AgentProfileSummary[];
}

export interface AgentProfileSummary {
  readonly name: string;
  readonly kind: AgentProfile["kind"];
  readonly description: string;
  readonly maxTokens: number;
  readonly sourceCount: number;
  readonly delegateCount: number;
}

export interface AgentProfileResult extends AgentProfileSummary {
  readonly pinned: readonly string[];
  readonly sources: readonly string[];
  readonly delegates: readonly string[];
  readonly path: string;
}

type AgentAction =
  | { readonly kind: "list" }
  | { readonly kind: "show"; readonly name: string }
  | {
      readonly kind: "context";
      readonly name: string;
      readonly task?: string;
      readonly taskFile?: string;
      readonly request?: string;
      readonly requestFile?: string;
      readonly maxTokens?: number;
      readonly out?: string;
      readonly force: boolean;
      readonly contract?: string;
    }
  | {
      readonly kind: "project";
      readonly name: string;
      readonly request?: string;
      readonly requestFile?: string;
    };

export async function runAgent(options: AgentCommandOptions): Promise<number> {
  const action = parseAgentArgs(options.args);
  const snapshot = loadAgentProfiles(options.root);
  const advisories = new WarningCollector();
  const retrieval = await (options.retrieval ?? loadReferenceRetrievalGraph)({
    root: options.root,
    warnings: advisories,
    adapter: options.adapter,
  });
  try {
    validateAgentProfileReferences(snapshot, retrieval.graph);
    // The workflow binding seam owns its public failure channel: contract-mode
    // failures are deterministic (stderr carries exactly the stable marker), so
    // dispatcher-level advisory noise is suppressed there and ordinary
    // non-contract paths keep their warnings.
    const bindingSeam = action.kind === "context" && action.contract !== undefined;
    if (!bindingSeam) advisories.flush({ color: options.output.color, stderr: options.stderr });
    if (action.kind === "list") {
      const data: AgentProfilesResult = {
        profiles: [...snapshot.profiles.values()].sort((a, b) => compareCodeUnits(a.name, b.name)).map(summary),
      };
      emit(profilesRenderable(data), options.output, options.stdout);
      return EXIT_OK;
    }
    // Only `show` needs the profile eagerly; the context/project paths resolve
    // their own profiles so the binding seam can fail closed with its own
    // stable markers instead of the generic top-level error.
    if (action.kind === "show") {
      const profile = findAgentProfile(snapshot, action.name);
      const data: AgentProfileResult = {
        ...summary(profile),
        pinned: profile.pinned.map((reference) => reference.normalized),
        sources: profile.sources.map((reference) => reference.normalized),
        delegates: [...profile.delegates],
        path: profile.path,
      };
      emit(profileRenderable(data), options.output, options.stdout);
      return EXIT_OK;
    }

    if (action.kind === "project") return runAgentProject(action, options);
    if (action.contract !== undefined) {
      return runContextContract({ ...action, contract: action.contract }, options);
    }

    const task = resolveTask(action, options);
    const profile = findAgentProfile(snapshot, action.name);
    let data = compileAgentContext(snapshot, retrieval.graph, profile.name, task, action.maxTokens);
    const markdown = renderAgentContextMarkdown(data);
    if (action.out !== undefined) {
      const target = confineOutFile(action.out, options.root);
      assertNoSymlinkInPath(options.root, target.relPath);
      const state = classifyExistingFile(target.absPath, markdown);
      if (state === "differs" && !action.force) {
        throw new LoreError(
          "conflict",
          `cannot overwrite differing context file ${target.relPath}`,
          "pass --force to replace it, choose another --out path, or remove the existing file",
          { path: target.relPath },
        );
      }
      const writeAction = state === "missing" ? "created" : state === "unchanged" ? "unchanged" : "updated";
      if (state !== "unchanged") {
        ensureDir(options.root, dirname(target.relPath));
        writeFileAtomic(target.absPath, markdown, target.relPath);
      }
      data = { ...data, write: { path: target.relPath, action: writeAction } };
    }
    emit(contextRenderable(data), options.output, options.stdout);
    return EXIT_OK;
  } finally {
    await retrieval.dispose?.();
  }
}

/**
 * Public workflow binding seam: `lore agent context <profile> --contract
 * opum-agent-workflow/v1 --json` with no `--task`. The request binding is read
 * from stdin exactly as the Opum facade sends it; stdout carries machine JSON
 * only (a bare success record on success; byte-empty on failure), and the
 * stable marker is echoed on stderr with the newline convention only. Every
 * failure mode is deterministic and fail-closed: no invented fallback data,
 * no advisory noise, ever.
 */
async function runWorkflowBinding(action: ContractContextAction, options: AgentCommandOptions) {
  let binding: WorkflowBinding;
  try {
    const raw =
      action.requestFile === undefined && action.request === undefined
        ? readFileSync(0, "utf8")
        : resolveBindingFile(action, options);
    if (raw.trim() === "") {
      throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_ABSENT", "binding is empty");
    }
    binding = parseWorkflowBinding(raw);
  } catch (error) {
    return emitBindingFailure(error, options);
  }
  try {
    if (action.task !== undefined && action.task !== binding.taskId) {
      throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_MISMATCH", "--task does not match the binding taskId", {
        flag: action.task,
        binding: binding.taskId,
      });
    }
    if (binding.profileId !== action.name) {
      throw new WorkflowBindingError(
        "OPUM_WORKFLOW_LORE_MISMATCH",
        "binding profileId does not match the requested profile",
        { binding: binding.profileId, profile: action.name },
      );
    }
    const snapshot = loadAgentProfiles(options.root);
    const advisories = new WarningCollector();
    const retrieval = await (options.retrieval ?? loadReferenceRetrievalGraph)({
      root: options.root,
      warnings: advisories,
      adapter: options.adapter,
    });
    try {
      validateAgentProfileReferences(snapshot, retrieval.graph);
      // Contract-mode determinism: advisory noise is deliberately discarded so
      // the public failure channel carries exactly the stable marker. Ordinary
      // non-contract paths keep their warnings.
      const request = parseWorkflowRequest(JSON.stringify({ task: { id: binding.taskId, text: binding.taskId } }));
      const projection = compileAgentWorkflowProjection(snapshot, retrieval.graph, action.name, request, {
        root: options.root,
        maxTokens: action.maxTokens,
      });
      const current = projection.profileRevision.sha256.replace(/^sha256:/, "");
      if (binding.profileRevision !== undefined && binding.profileRevision !== current) {
        throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_STALE", "binding pins a stale profile revision", {
          pinned: binding.profileRevision,
          current,
        });
      }
      const now = Date.now();
      const record = {
        contract: WORKFLOW_CONTRACT,
        selectedVersion: 1,
        requestId: binding.requestId,
        taskId: binding.taskId,
        profileId: binding.profileId,
        profileRevision: current,
        digestAlgorithm: "sha256",
        digest: projection.contextDigestSha256,
        contextId: projection.contextId,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 300_000).toISOString(),
        sourceIds: projection.sources,
      };
      options.stdout?.write(`${JSON.stringify(record)}\n`);
      return EXIT_OK;
    } finally {
      await retrieval.dispose?.();
    }
  } catch (error) {
    return emitBindingFailure(error, options);
  }
}

/** Read the binding envelope from a repo-confined --request file ("-" means stdin). */
function resolveBindingFile(action: ContractContextAction, options: AgentCommandOptions): string {
  const path = action.requestFile ?? action.request;
  if (path === undefined || path === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch (cause) {
      throw new WorkflowBindingError("OPUM_WORKFLOW_LORE_ABSENT", "cannot read the binding from stdin", {
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  const target = confineRepoFile(path, options.root, "--request");
  assertNoSymlinkInPath(options.root, target.relPath);
  return readSource(target.absPath, target.relPath);
}

function emitBindingFailure(error: unknown, options: AgentCommandOptions): number {
  const marker: WorkflowBindingFailureCode =
    error instanceof WorkflowBindingError
      ? error.marker
      : error instanceof LoreError
        ? error.type === "not_found"
          ? "OPUM_WORKFLOW_LORE_ABSENT"
          : error.type === "conflict"
            ? "OPUM_WORKFLOW_LORE_MISMATCH"
            : "OPUM_WORKFLOW_LORE_INCOMPATIBLE"
        : "OPUM_WORKFLOW_LORE_INCOMPATIBLE";
  // Strict contract: on failure stdout stays BYTE-EMPTY (machine JSON only on
  // success) and the stable marker is echoed on stderr; exit is nonzero.
  options.stderr?.write(`${marker}\n`);
  return 1;
}
/**
 * Facade: `lore agent context <profile> --task <taskId> --contract
 * opum-agent-workflow/v1 --json`. Additive adapter over the same projection
 * engine as `agent project`; the default context path is untouched.
 */
type ContractContextAction = AgentAction & { kind: "context"; contract: string };

async function runContextContract(action: ContractContextAction, options: AgentCommandOptions) {
  // The public binding seam owns EVERY --contract invocation — with or without
  // --task. The canonical Opum facade sends --task plus the exact stdin
  // binding; --task is an exact consistency check against the binding, and the
  // legacy envelope flow is not reachable in contract mode.
  return runWorkflowBinding(action, options);
}

/** Compile the read-only public opum-agent-workflow/v1 projection. */
async function runAgentProject(action: Extract<AgentAction, { kind: "project" }>, options: AgentCommandOptions) {
  const snapshot = loadAgentProfiles(options.root);
  const advisories = new WarningCollector();
  const retrieval = await (options.retrieval ?? loadReferenceRetrievalGraph)({
    root: options.root,
    warnings: advisories,
    adapter: options.adapter,
  });
  try {
    validateAgentProfileReferences(snapshot, retrieval.graph);
    advisories.flush({ color: options.output.color, stderr: options.stderr });
    findAgentProfile(snapshot, action.name);
    const request = parseWorkflowRequest(resolveRequest(action, options));
    const {
      selectedVersion: _sv,
      contextId: _cid,
      contextDigestSha256: _cds,
      ...facadeFields
    } = compileAgentWorkflowProjection(snapshot, retrieval.graph, action.name, request, {
      root: options.root,
    });
    // Byte-compatibility: the facade-only fields are stripped so existing
    // `agent project` consumers see exactly the pre-facade envelope.
    void _sv;
    void _cid;
    void _cds;
    emit(projectionRenderable(facadeFields as AgentWorkflowProjection), options.output, options.stdout);
    return EXIT_OK;
  } finally {
    await retrieval.dispose?.();
  }
}

function parseAgentArgs(args: readonly string[]): AgentAction {
  const parsed = parseCommandArgs(args, "agent");
  for (const flag of ["task", "task-file", "max-tokens", "out", "force", "request", "contract"]) {
    assertFlagAtMostOnce(parsed, flag);
  }
  const action = parsed.positionals[0];
  if (action === undefined) {
    throw usage(
      "`lore agent` needs an action",
      "run `lore agent list`, `lore agent show <name>`, or `lore agent context <name> --task <text>`",
    );
  }
  if (action === "list") {
    assertArityAndNoFlags(parsed, 1, "`lore agent list` takes no arguments or command flags", "run `lore agent list`");
    return { kind: "list" };
  }
  if (action === "show") {
    assertArityAndNoFlags(
      parsed,
      2,
      "`lore agent show` needs exactly one profile name",
      "run `lore agent show <name>`",
    );
    return { kind: "show", name: parsed.positionals[1] as string };
  }
  if (action === "project") {
    if (parsed.positionals.length !== 2) {
      throw usage(
        "`lore agent project` needs exactly one profile name",
        "run `lore agent project <name> --request <file>` (use --request - for stdin)",
      );
    }
    for (const flag of ["task", "task-file", "max-tokens", "out", "force"]) {
      if (parsed.flags.has(flag)) {
        throw usage(`--${flag} is not a \`lore agent project\` flag`, "`lore agent project` takes only --request");
      }
    }
    const request = nonEmptyOption(parsed, "request");
    return {
      kind: "project",
      name: parsed.positionals[1] as string,
      ...(request === undefined ? {} : { requestFile: request }),
    };
  }
  if (action !== "context") {
    throw usage(`unknown agent action "${action}"`, "use list, show, context, or project", { action });
  }
  if (parsed.positionals.length !== 2) {
    throw usage("`lore agent context` needs exactly one profile name", "run `lore agent context <name> --task <text>`");
  }
  const task = nonEmptyOption(parsed, "task");
  const taskFile = nonEmptyOption(parsed, "task-file");
  const contract = nonEmptyOption(parsed, "contract");
  const request = nonEmptyOption(parsed, "request");
  const requestFile = nonEmptyOption(parsed, "request-file");
  // Contract mode consumes the binding from stdin or --request; --task is an
  // optional exact consistency flag. Non-contract mode still needs task text.
  if (contract === WORKFLOW_CONTRACT_SELECTOR) {
    if (taskFile !== undefined) {
      throw usage("--task-file is not available with --contract", "pass the binding on stdin or via --request");
    }
    if (request !== undefined && requestFile !== undefined) {
      throw usage("pass the binding via stdin or --request, not both", "omit --request to read stdin");
    }
  } else if ((task === undefined) === (taskFile === undefined)) {
    throw usage(
      "agent context needs exactly one of --task or --task-file",
      "pass task text directly or read it from one path (use --task-file - for stdin)",
    );
  }
  const rawMaxTokens = nonEmptyOption(parsed, "max-tokens");
  const maxTokens = rawMaxTokens === undefined ? undefined : parsePositiveInteger("--max-tokens", rawMaxTokens);
  const out = nonEmptyOption(parsed, "out");
  const force = parsed.flags.has("force");
  if (force && out === undefined) {
    throw usage("--force requires --out", "pass an output path or remove --force");
  }
  if (contract !== undefined && contract !== WORKFLOW_CONTRACT_SELECTOR) {
    throw usage(`unsupported contract "${contract}"`, `this build serves ${WORKFLOW_CONTRACT_SELECTOR}`, { contract });
  }
  return {
    kind: "context",
    name: parsed.positionals[1] as string,
    ...(task === undefined ? {} : { task }),
    ...(taskFile === undefined ? {} : { taskFile }),
    ...(request === undefined ? {} : { request }),
    ...(requestFile === undefined ? {} : { requestFile }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(out === undefined ? {} : { out }),
    force,
    ...(contract === undefined ? {} : { contract }),
  };
}

function assertArityAndNoFlags(
  parsed: ReturnType<typeof parseCommandArgs>,
  arity: number,
  message: string,
  hint: string,
): void {
  if (parsed.positionals.length !== arity || parsed.flags.size > 0) throw usage(message, hint);
}

function nonEmptyOption(parsed: ReturnType<typeof parseCommandArgs>, name: string): string | undefined {
  const value = singleOptionValue(parsed, name);
  if (value === undefined) return undefined;
  if (value.trim() === "") throw usage(`--${name} needs a value`, `pass --${name}=<value>`);
  return value;
}

function parsePositiveInteger(flag: string, value: string): number {
  if (!/^\d+$/.test(value)) throw usage(`invalid ${flag} "${value}"`, `pass a positive integer, e.g. ${flag} 8000`);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) throw usage(`${flag} "${value}" is too large`, "pass a smaller integer");
  if (parsed < 1) throw usage(`invalid ${flag} "${value}"`, `pass a positive integer, e.g. ${flag} 8000`);
  return parsed;
}

function resolveTask(action: Extract<AgentAction, { kind: "context" }>, options: AgentCommandOptions): string {
  if (action.task !== undefined) return action.task;
  const path = action.taskFile as string;
  if (options.readTaskFile !== undefined) return options.readTaskFile(path);
  if (path === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch (cause) {
      throw new LoreError("denied", "cannot read task text from stdin", "pipe readable UTF-8 task text to stdin", {
        path: "-",
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  const target = confineRepoFile(path, options.root, "--task-file");
  assertNoSymlinkInPath(options.root, target.relPath);
  return readSource(target.absPath, target.relPath);
}

/** Read the workflow request envelope: repo-relative file or stdin (default/-). */
function resolveRequest(action: Extract<AgentAction, { kind: "project" }>, options: AgentCommandOptions): string {
  const path = action.requestFile;
  if (path === undefined || path === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch (cause) {
      throw new LoreError(
        "denied",
        "cannot read the request envelope from stdin",
        "pipe readable UTF-8 JSON to stdin or pass --request <file>",
        {
          path: "-",
          cause: cause instanceof Error ? cause.message : String(cause),
        },
      );
    }
  }
  const target = confineRepoFile(path, options.root, "--request");
  assertNoSymlinkInPath(options.root, target.relPath);
  return readSource(target.absPath, target.relPath);
}

function confineOutFile(out: string, root: string): { absPath: string; relPath: string } {
  return confineRepoFile(out, root, "--out");
}

function confineRepoFile(
  path: string,
  root: string,
  flag: "--out" | "--task-file" | "--request",
): { absPath: string; relPath: string } {
  const absPath = resolve(root, path);
  const rel = relative(root, absPath);
  if (isAbsolute(path) || rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw usage(`${flag} path "${path}" must name a file inside the repo`, `give ${flag} a repo-relative file path`);
  }
  return { absPath, relPath: rel.split(sep).join("/") };
}

function summary(profile: AgentProfile): AgentProfileSummary {
  return {
    name: profile.name,
    kind: profile.kind,
    description: profile.description,
    maxTokens: profile.maxTokens,
    sourceCount: profile.pinned.length + profile.sources.length,
    delegateCount: profile.delegates.length,
  };
}

function profilesRenderable(data: AgentProfilesResult): Renderable<AgentProfilesResult> {
  return {
    kind: "agent.profiles",
    data,
    pretty: renderProfiles,
    plain: renderProfiles,
  };
}

function profileRenderable(data: AgentProfileResult): Renderable<AgentProfileResult> {
  return {
    kind: "agent.profile",
    data,
    pretty: renderProfile,
    plain: renderProfile,
  };
}

function contextRenderable(data: AgentContextExport): Renderable<AgentContextExport> {
  return {
    kind: "agent.context.export",
    data,
    pretty: renderAgentContextMarkdown,
    plain: renderAgentContextMarkdown,
  };
}

function projectionRenderable(data: AgentWorkflowProjection): Renderable<AgentWorkflowProjection> {
  return {
    kind: "agent.workflow.projection",
    data,
    pretty: renderWorkflowProjection,
    plain: renderWorkflowProjection,
  };
}

function renderWorkflowProjection(data: AgentWorkflowProjection): string {
  const lines = [
    `${data.contract}/${data.version} — task ${data.request.task.id}`,
    `profile: ${data.context.profile.name}`,
    `contextDigest: ${data.contextDigest} (packDigest ${data.packDigest})`,
    `sources: ${data.sources.length === 0 ? "none" : data.sources.join(", ")}`,
    `profileRevision: ${data.profileRevision.path} ${data.profileRevision.sha256}`,
  ];
  if (data.inputRevisions.length === 0) {
    lines.push("inputRevisions: none");
  } else {
    lines.push("inputRevisions:");
    for (const revision of data.inputRevisions) {
      lines.push(`- ${revision.path} ${revision.sha256}`);
    }
  }
  lines.push(renderAgentContextMarkdown(data.context));
  return lines.join("\n");
}

function renderProfiles(data: AgentProfilesResult): string {
  if (data.profiles.length === 0) return "agent profiles: none";
  return [
    `agent profiles: ${data.profiles.length}`,
    ...data.profiles.map(
      (profile) =>
        `- ${profile.name} [${profile.kind}] — ${profile.description} (budget ${profile.maxTokens}; sources ${profile.sourceCount}; delegates ${profile.delegateCount})`,
    ),
  ].join("\n");
}

function renderProfile(data: AgentProfileResult): string {
  return [
    `${data.name} [${data.kind}] — ${data.description}`,
    `budget: ${data.maxTokens}`,
    `path: ${data.path}`,
    `pinned: ${data.pinned.length === 0 ? "none" : data.pinned.join(", ")}`,
    `sources: ${data.sources.length === 0 ? "none" : data.sources.join(", ")}`,
    `delegates: ${data.delegates.length === 0 ? "none" : data.delegates.join(", ")}`,
  ].join("\n");
}
