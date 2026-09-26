/**
 * adapters/agent-plugins.ts — reads a runtime's installed plugins through its own public list
 * command, and nothing else (LCLI-592; opum-doc ADR ruling (d): lore and quest detect the same way).
 *
 * `claude plugin list --json` and `codex plugin list --json` are what `init` and `--check` start,
 * and they only report (ruling 19). The one other thing this starts is the update
 * ({@link CliAgentPluginPort.update}, LCLI-593): `claude plugin update opum-lore@opum --scope
 * <scope>`, or `codex plugin marketplace upgrade opum` then `codex plugin add opum-lore@opum` —
 * reached only through core's `updateLorePlugin`, so only for an installed plugin on a `lore agents
 * --target <runtime> --force` call. It never reads either runtime's internal files, and it never
 * installs or enables a plugin (ruling 21). Ported from quest-cli's
 * `src/adapters/agents/cli-agent-plugins.ts` at `30a6846` (QCLI-371).
 *
 * `LORE_AGENT_PLUGINS=off` (ruling 23) swaps in {@link DisabledAgentPluginPort}, which answers every
 * runtime `not-detectable` synchronously and starts no process. The test suite sets it by default
 * (`bunfig.toml` preload), so no test reaches the developer's real agent install.
 */

import { realpathSync } from "node:fs";
import { sep } from "node:path";
import {
  type AgentPluginListing,
  type AgentPluginPort,
  type AgentPluginUpdateOutcome,
  type AgentRuntime,
  CLAUDE_MANAGED_SCOPE,
  type ListedAgentPlugin,
  lorePluginUpdateSteps,
  MANAGED_SCOPE_UPDATE_DETAIL,
} from "../core/agent-plugins";
import { stderrHint } from "../errors";

/** Listing is a local read (quest-cli measured 0.14s claude, 0.44s codex); a hung runtime must not hang init or --check. */
const DEFAULT_LIST_TIMEOUT_MS = 15_000;

/**
 * Updating fetches the marketplace, which the listing budget cannot cover: quest-cli measured
 * `codex plugin marketplace upgrade` at over two minutes on a git fetch (QCLI-371). A separate,
 * explicit budget, applied to each update step, and quest-cli's own value.
 */
export const DEFAULT_UPDATE_TIMEOUT_MS = 600_000;

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

/** A listing is a few kilobytes (claude 2.1.283: 9 rows, ~3 KB). Anything past this is not a listing, and is not held in memory. */
export const MAX_PLUGIN_OUTPUT_BYTES = 1024 * 1024;

/** Why a stream read stopped early. */
class OutputTooLarge extends Error {}

/** Read a stream to text, throwing {@link OutputTooLarge} once it passes {@link MAX_PLUGIN_OUTPUT_BYTES}. */
async function readCapped(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PLUGIN_OUTPUT_BYTES) throw new OutputTooLarge();
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Run one command with a HARD deadline that bounds when THIS PROCESS exits, not only when the
 * command's promise settles (LCLI-592 review, finding 1).
 *
 * A runtime can start a grandchild that inherits its stdout/stderr pipes and outlives it (the codex
 * Node launcher forwards TERM to its native binary and waits for it). SIGKILLing the direct child
 * then leaves the pipes open, and a pending read on them keeps lore's event loop alive until the
 * grandchild exits — measured on bun 1.3.14 with a fake runtime running `sleep 40 & sleep 40` under
 * `trap '' TERM`: the report printed at the 15s deadline and the process exited at 40s. `unref()`
 * does not help: it releases the child handle, not the pipe reads. So on the deadline this does two
 * things, each measured to matter on its own:
 *
 *  - kills the child's whole PROCESS GROUP. The child is spawned `detached`, which makes it a group
 *    leader, so the grandchild is reaped too instead of lingering. Windows has no process groups in
 *    this sense, so there only the child itself is killed;
 *  - cancels both pipe readers, which releases lore's event loop whether or not the kill reached
 *    every descendant.
 */
export const bunPluginCommandRunner: PluginCommandRunner = async (argv, timeoutMs, env) => {
  const posix = process.platform !== "win32";
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn([...argv], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      ...(posix ? { detached: true } : {}),
      ...(env ? { env } : {}),
    });
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
  const stdoutReader = child.stdout.getReader();
  const stderrReader = child.stderr.getReader();
  const stop = (): void => {
    try {
      if (posix) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      // Already gone: nothing left to kill.
    }
    void stdoutReader.cancel().catch(() => undefined);
    void stderrReader.cancel().catch(() => undefined);
    child.unref();
  };
  const completed = Promise.all([child.exited, readCapped(stdoutReader), readCapped(stderrReader)]);
  // Once the deadline wins, cancelling the readers makes this reject with nobody awaiting it.
  completed.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  let outcome: Awaited<typeof completed> | "timeout";
  try {
    outcome = await Promise.race([completed, deadline]);
  } catch (error) {
    clearTimeout(timer);
    stop();
    if (error instanceof OutputTooLarge) {
      return { failure: `${argv.join(" ")} printed more than ${MAX_PLUGIN_OUTPUT_BYTES} bytes.` };
    }
    throw error;
  }
  clearTimeout(timer);
  if (outcome === "timeout") {
    stop();
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
 * Claude's scope precedence, most deciding first: managed > local > project > user > synced (opum-doc
 * ADR Amendment 6, ruling 28, which supersedes ruling 26 (ii) for `managed` only). A managed row is
 * administrator policy the plugin user cannot override, so it decides ahead of every other scope when
 * present; below it, a local or project setting still overrides the user's (ruling 26 ii, otherwise
 * unchanged), and `synced` stays last. A scope outside this list ranks after all of them.
 */
const CLAUDE_SCOPE_PRECEDENCE: readonly string[] = [CLAUDE_MANAGED_SCOPE, "local", "project", "user", "synced"];

/**
 * `claude plugin list --json`: an array with one row PER SCOPE, each `{id, scope, enabled, version,
 * projectPath?}` (measured on claude 2.1.283). A local or project row carries the `projectPath` it
 * belongs to and applies only there, so a row for another project is dropped (ruling 26 i) and the
 * most specific applicable row decides (ruling 26 ii, in ruling 28's managed-first order). `root` is
 * this project; a row applies when it names `root` itself or an ancestor of it, compared after
 * resolving symlinks and on a whole path segment (`/x/foo` is not an ancestor of `/x/foobar`).
 *
 * A `managed` row applies to EVERY project (ruling 28: Claude Code's own code treats a managed row as
 * applicable everywhere, as it does a user row), so it is exempt from that filter whether or not it
 * carries a `projectPath`, and its `projectPath`, if any, is never compared — quest-cli's rule too.
 *
 * "Most specific" is the scope first, then — between two applicable rows of the SAME scope — the
 * deeper `projectPath` (ruling 29; LCLI-592 review, finding 4): an enabled local row for `/p/outer`
 * and a disabled one for `/p/outer/inner` both apply at `/p/outer/inner`, and the inner one decides
 * there whichever order the runtime lists them in. A row with no `projectPath` is the least specific,
 * and a managed row counts as having none, so it never enters that tie-break.
 *
 * Returns `undefined` for a shape it cannot read: not an array, or rows present but none decodable.
 * That is `not-detectable`, never `not-installed` — the list shape moving is not an empty install.
 */
export function decodeClaudePluginList(parsed: unknown, root: string): readonly ListedAgentPlugin[] | undefined {
  if (!Array.isArray(parsed)) return undefined;
  const here = canonical(root);
  const byId = new Map<string, { rank: number; depth: number; listed: ListedAgentPlugin }>();
  let decodable = 0;
  for (const row of parsed) {
    if (!isRecord(row) || typeof row.id !== "string") continue;
    decodable += 1;
    const scope = typeof row.scope === "string" ? row.scope : "user";
    let depth = 0;
    if (scope !== CLAUDE_MANAGED_SCOPE && typeof row.projectPath === "string") {
      const project = canonical(row.projectPath);
      if (here !== project && !here.startsWith(`${project}${sep}`)) continue;
      depth = project.length;
    }
    const rank = CLAUDE_SCOPE_PRECEDENCE.indexOf(scope);
    const effectiveRank = rank < 0 ? CLAUDE_SCOPE_PRECEDENCE.length : rank;
    const listed = toListed(row.id, row, scope);
    const current = byId.get(row.id);
    const moreSpecific =
      !current || effectiveRank < current.rank || (effectiveRank === current.rank && depth > current.depth);
    if (listed && moreSpecific) byId.set(row.id, { rank: effectiveRank, depth, listed });
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

/** `: <stderr>` as one sanitized line, or nothing when the runtime printed nothing readable. */
function stderrSuffix(stderr: string): string {
  const hint = stderrHint(stderr);
  return hint === undefined ? "" : `: ${hint}`;
}

/** Reaches each runtime only through its public CLI, never its internal files. */
export class CliAgentPluginPort implements AgentPluginPort {
  constructor(
    private readonly root: string,
    private readonly options: {
      readonly env?: Record<string, string | undefined>;
      readonly listTimeoutMs?: number;
      readonly updateTimeoutMs?: number;
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
        // Runtime stderr is foreign bytes headed for --plain stdout: `stderrHint` collapses line
        // breaks (a newline could forge a standalone plain record, cli-contract §1.3), strips ANSI and
        // control bytes (which must never reach --plain, even under NO_COLOR, §6), and caps length
        // (LCLI-592 review, finding 2).
        reason: `${runtime} plugin list exited ${result.exitCode}${stderrSuffix(result.stderr)}`,
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

  /**
   * Run each of {@link lorePluginUpdateSteps} in order on the same runner as the listing (process-group
   * kill on the deadline, output cap), stopping at the first that fails. The deadline is the update
   * budget, per step, never the listing's. A failure is an outcome, never a throw: the caller reports
   * it and keeps exit `0`.
   */
  async update(runtime: AgentRuntime, scope: string | undefined): Promise<AgentPluginUpdateOutcome> {
    const runner = this.options.runner ?? bunPluginCommandRunner;
    const steps = lorePluginUpdateSteps(runtime, scope);
    // A Claude managed row has no update command at all (ruling 28), so nothing runs even if this
    // port is reached directly rather than through core's `updateLorePlugin`, which never asks.
    if (steps.length === 0) return { ok: false, detail: MANAGED_SCOPE_UPDATE_DETAIL, completed: 0 };
    let completed = 0;
    for (const argv of steps) {
      const result = await runner(argv, this.options.updateTimeoutMs ?? DEFAULT_UPDATE_TIMEOUT_MS, this.options.env);
      if ("failure" in result) return { ok: false, detail: result.failure, completed };
      if (result.exitCode !== 0) {
        return {
          ok: false,
          detail: `${argv.join(" ")} exited ${result.exitCode}${stderrSuffix(result.stderr || result.stdout)}`,
          completed,
        };
      }
      completed += 1;
    }
    return { ok: true, detail: steps.map((argv) => argv.join(" ")).join(" && "), completed };
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

  /** Unreachable through `updateLorePlugin` (nothing here is ever `installed`), and runs nothing if reached. */
  async update(): Promise<AgentPluginUpdateOutcome> {
    return { ok: false, detail: OFF_REASON, completed: 0 };
  }
}

/** Whether `env` switches plugin detection off (ruling 23). Only the exact value `off` does. */
export function agentPluginsOff(env: Record<string, string | undefined> = process.env): boolean {
  return env[AGENT_PLUGINS_ENV] === "off";
}

/**
 * Override for the list deadline, in milliseconds — the same shape as `LORE_QUEST_TIMEOUT_MS`
 * (adapters/quest.ts). It exists so a test can prove the deadline bounds the process's own exit
 * without waiting out the 15s default; an unset, non-numeric or non-positive value keeps the default.
 */
export const AGENT_PLUGINS_TIMEOUT_ENV = "LORE_AGENT_PLUGINS_TIMEOUT_MS";

/**
 * Override for the UPDATE deadline, in milliseconds, per step (LCLI-593). Separate from
 * {@link AGENT_PLUGINS_TIMEOUT_ENV} on purpose: the listing budget is seconds and the update budget
 * is minutes, and one knob for both would either starve the Codex upgrade or let a hung listing hold
 * `init` for ten minutes.
 */
export const AGENT_PLUGINS_UPDATE_TIMEOUT_ENV = "LORE_AGENT_PLUGINS_UPDATE_TIMEOUT_MS";

function timeoutFrom(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The port `lore init` and `lore agents` use unless a caller injects one. */
export function createAgentPluginPort(
  root: string,
  options: { readonly env?: Record<string, string | undefined>; readonly runner?: PluginCommandRunner } = {},
): AgentPluginPort {
  const env = options.env ?? process.env;
  return agentPluginsOff(env)
    ? new DisabledAgentPluginPort()
    : new CliAgentPluginPort(root, {
        runner: options.runner,
        env: options.env,
        listTimeoutMs: timeoutFrom(env, AGENT_PLUGINS_TIMEOUT_ENV, DEFAULT_LIST_TIMEOUT_MS),
        updateTimeoutMs: timeoutFrom(env, AGENT_PLUGINS_UPDATE_TIMEOUT_ENV, DEFAULT_UPDATE_TIMEOUT_MS),
      });
}
