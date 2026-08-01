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
      readonly maxTokens?: number;
      readonly out?: string;
      readonly force: boolean;
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
    advisories.flush({ color: options.output.color, stderr: options.stderr });
    if (action.kind === "list") {
      const data: AgentProfilesResult = {
        profiles: [...snapshot.profiles.values()].sort((a, b) => compareCodeUnits(a.name, b.name)).map(summary),
      };
      emit(profilesRenderable(data), options.output, options.stdout);
      return EXIT_OK;
    }
    const profile = findAgentProfile(snapshot, action.name);
    if (action.kind === "show") {
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

    const task = resolveTask(action, options);
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

function parseAgentArgs(args: readonly string[]): AgentAction {
  const parsed = parseCommandArgs(args, "agent");
  for (const flag of ["task", "task-file", "max-tokens", "out", "force"]) {
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
  if (action !== "context") {
    throw usage(`unknown agent action "${action}"`, "use list, show, or context", { action });
  }
  if (parsed.positionals.length !== 2) {
    throw usage("`lore agent context` needs exactly one profile name", "run `lore agent context <name> --task <text>`");
  }
  const task = nonEmptyOption(parsed, "task");
  const taskFile = nonEmptyOption(parsed, "task-file");
  if ((task === undefined) === (taskFile === undefined)) {
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
  return {
    kind: "context",
    name: parsed.positionals[1] as string,
    ...(task === undefined ? {} : { task }),
    ...(taskFile === undefined ? {} : { taskFile }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(out === undefined ? {} : { out }),
    force,
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

function confineOutFile(out: string, root: string): { absPath: string; relPath: string } {
  return confineRepoFile(out, root, "--out");
}

function confineRepoFile(
  path: string,
  root: string,
  flag: "--out" | "--task-file",
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
