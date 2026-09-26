/**
 * adapters/agent-plugins.ts — reads a runtime's installed plugins through its own public list
 * command, and nothing else (LCLI-592; opum-doc ADR ruling (d): lore and quest detect the same way).
 *
 * `claude plugin list --json` and `codex plugin list --json` are the only commands this starts. It
 * never reads either runtime's internal files, and it never installs, enables or updates a plugin —
 * `init` and `--check` only report (ruling 19). Ported from quest-cli's
 * `src/adapters/agents/cli-agent-plugins.ts` at `30a6846` (QCLI-371), list half only: the update
 * half belongs to `lore agents --force` (LCLI-593).
 *
 * `LORE_AGENT_PLUGINS=off` (ruling 23) swaps in {@link DisabledAgentPluginPort}, which answers every
 * runtime `not-detectable` synchronously and starts no process. The test suite sets it by default
 * (`bunfig.toml` preload), so no test reaches the developer's real agent install.
 */

import { realpathSync } from "node:fs";
import { sep } from "node:path";
import type { AgentPluginListing, AgentPluginPort, AgentRuntime, ListedAgentPlugin } from "../core/agent-plugins";

/** Listing is a local read (quest-cli measured 0.14s claude, 0.44s codex); a hung runtime must not hang init or --check. */
const DEFAULT_LIST_TIMEOUT_MS = 15_000;

/** The environment variable and value that switch detection off (ruling 23). */
export const AGENT_PLUGINS_ENV = "LORE_AGENT_PLUGINS";
const OFF_REASON = `plugin detection is off (${AGENT_PLUGINS_ENV}=off).`;

/** What one runtime command produced, or why it produced nothing. */
export type PluginCommandResult =
  | { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
  | { readonly failure: string };

/** Runs one runtime command. Injectable so a test can serve a recorded listing and count spawns without any binary. */
export type PluginCommandRunner = (
  argv: readonly string[],
  timeoutMs: number,
  env: Record<string, string | undefined> | undefined,
) => Promise<PluginCommandResult>;

/**
 * Run one command with a HARD deadline. Bun's own `timeout` sends a single SIGTERM and then still
 * waits for the output pipes, which a grandchild can hold open (the codex Node launcher forwards TERM
 * to its native binary and waits for it), so the deadline here stops waiting, SIGKILLs the child, and
 * returns (quest-cli QCLI-371 review, finding 4).
 */
export const bunPluginCommandRunner: PluginCommandRunner = async (argv, timeoutMs, env) => {
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn([...argv], { stdin: "ignore", stdout: "pipe", stderr: "pipe", ...(env ? { env } : {}) });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return {
      failure:
        code === "ENOENT"
          ? `${argv[0]} was not found on PATH.`
          : `${argv[0]} could not be started (${String(code ?? error)}).`,
    };
  }
  if (!(child.stdout instanceof ReadableStream) || !(child.stderr instanceof ReadableStream)) {
    return { failure: `${argv[0]} output streams are unavailable.` };
  }
  const completed = Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const outcome = await Promise.race([completed, deadline]);
  clearTimeout(timer);
  if (outcome === "timeout") {
    child.kill("SIGKILL");
    // Do not keep this process alive for pipes a grandchild still holds.
    child.unref();
    return { failure: `${argv.join(" ")} did not finish within ${timeoutMs / 1000}s.` };
  }
  const [exitCode, stdout, stderr] = outcome;
  if (child.signalCode !== null) {
    return { failure: `${argv.join(" ")} was terminated by ${child.signalCode}.` };
  }
  return { exitCode, stdout, stderr };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep `enabled` only when the runtime reported it as a boolean; a missing or malformed field stays absent rather than being guessed (ruling 22). */
function toListed(id: unknown, row: Record<string, unknown>, scope?: string): ListedAgentPlugin | undefined {
  if (typeof id !== "string") return undefined;
  return {
    id,
    ...(typeof row.enabled === "boolean" ? { enabled: row.enabled } : {}),
    ...(typeof row.version === "string" ? { version: row.version } : {}),
    ...(scope !== undefined ? { scope } : {}),
  };
}

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Claude's scope precedence, most specific first (ruling 26 ii): a local or project setting
 * overrides the user's, which overrides a managed default. The ADR names local > project > user;
 * this is quest-cli's five-level form of the same principle, which the ADR records as not a
 * departure from it.
 */
const CLAUDE_SCOPE_PRECEDENCE = ["local", "project", "user", "managed", "synced"];

/**
 * `claude plugin list --json`: an array with one row PER SCOPE, each `{id, scope, enabled, version,
 * projectPath?}` (measured on claude 2.1.283). A local or project row carries the `projectPath` it
 * belongs to and applies only there, so a row for another project is dropped (ruling 26 i) and the
 * most specific applicable row decides (ruling 26 ii). `root` is this project; a row applies when it
 * names `root` itself or an ancestor of it, compared after resolving symlinks.
 *
 * Returns `undefined` for a shape it cannot read: not an array, or rows present but none decodable.
 * That is `not-detectable`, never `not-installed` — the list shape moving is not an empty install.
 */
export function decodeClaudePluginList(parsed: unknown, root: string): readonly ListedAgentPlugin[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const here = canonical(root);
  const byId = new Map<string, { rank: number; listed: ListedAgentPlugin }>();
  let decodable = 0;
  for (const row of parsed) {
    if (!isRecord(row) || typeof row.id !== "string") continue;
    decodable += 1;
    const scope = typeof row.scope === "string" ? row.scope : "user";
    if (typeof row.projectPath === "string") {
      const project = canonical(row.projectPath);
      if (here !== project && !here.startsWith(`${project}${sep}`)) continue;
    }
    const rank = CLAUDE_SCOPE_PRECEDENCE.indexOf(scope);
    const effectiveRank = rank < 0 ? CLAUDE_SCOPE_PRECEDENCE.length : rank;
    const listed = toListed(row.id, row, scope);
    const current = byId.get(row.id);
    if (listed && (!current || effectiveRank < current.rank)) byId.set(row.id, { rank: effectiveRank, listed });
  }
  if (parsed.length > 0 && decodable === 0) return undefined;
  return [...byId.values()].map((entry) => entry.listed);
}

/**
 * `codex plugin list --json`: `{installed: [{pluginId, enabled, version, ...}], available: [...]}`
 * (measured on codex-cli 0.155.1). Only `installed` rows are installed; a plugin that appears only in
 * `available` is not. Codex exposes `enabled`, so its side carries all four states (ADR Amendment 3's
 * measurement resolving ruling 22).
 */
export function decodeCodexPluginList(parsed: unknown): readonly ListedAgentPlugin[] | undefined {
  if (!isRecord(parsed) || !Array.isArray(parsed.installed)) return undefined;
  const listed = parsed.installed.flatMap((row) => {
    const decoded = isRecord(row) ? toListed(row.pluginId, row) : undefined;
    return decoded ? [decoded] : [];
  });
  if (parsed.installed.length > 0 && listed.length === 0) return undefined;
  return listed;
}

/** Reaches each runtime only through its public CLI, never its internal files. */
export class CliAgentPluginPort implements AgentPluginPort {
  constructor(
    private readonly root: string,
    private readonly options: {
      readonly env?: Record<string, string | undefined>;
      readonly listTimeoutMs?: number;
      readonly runner?: PluginCommandRunner;
    } = {},
  ) {}

  async list(runtime: AgentRuntime): Promise<AgentPluginListing> {
    const runner = this.options.runner ?? bunPluginCommandRunner;
    const result = await runner(
      [runtime, "plugin", "list", "--json"],
      this.options.listTimeoutMs ?? DEFAULT_LIST_TIMEOUT_MS,
      this.options.env,
    );
    if ("failure" in result) return { kind: "unavailable", reason: result.failure };
    if (result.exitCode !== 0) {
      return {
        kind: "unavailable",
        reason: `${runtime} plugin list exited ${result.exitCode}: ${result.stderr.trim().slice(0, 200)}`,
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      return { kind: "unavailable", reason: `${runtime} plugin list --json did not return JSON.` };
    }
    const plugins = runtime === "claude" ? decodeClaudePluginList(parsed, this.root) : decodeCodexPluginList(parsed);
    return plugins === undefined
      ? { kind: "unavailable", reason: `${runtime} plugin list --json returned an unrecognised shape.` }
      : { kind: "listed", plugins };
  }
}

/**
 * `LORE_AGENT_PLUGINS=off`: every runtime reads as not detectable and no runtime CLI is ever
 * started. Answers synchronously, so a run with detection off is exactly as synchronous as before.
 */
export class DisabledAgentPluginPort implements AgentPluginPort {
  list(): AgentPluginListing {
    return { kind: "unavailable", reason: OFF_REASON };
  }
}

/** Whether `env` switches plugin detection off (ruling 23). Only the exact value `off` does. */
export function agentPluginsOff(env: Record<string, string | undefined> = process.env): boolean {
  return env[AGENT_PLUGINS_ENV] === "off";
}

/** The port `lore init` and `lore agents --check` use unless a caller injects one. */
export function createAgentPluginPort(
  root: string,
  options: { readonly env?: Record<string, string | undefined>; readonly runner?: PluginCommandRunner } = {},
): AgentPluginPort {
  return agentPluginsOff(options.env ?? process.env)
    ? new DisabledAgentPluginPort()
    : new CliAgentPluginPort(root, { runner: options.runner, env: options.env });
}
