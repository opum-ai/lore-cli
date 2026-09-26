/**
 * core/agent-plugins.ts — whether an agent runtime has the `opum-lore` marketplace plugin (LCLI-592).
 *
 * The binding decision is opum-doc's ADR "Distribute lore and quest agent skills through the plugin
 * marketplace" (main `7831fff`, Amendments 1-4). `lore init` and `lore agents --check` report which
 * of four states a selected runtime is in, and the command to run next. They never run it: `init`
 * and `--check` do not mutate the user's agent install (ruling 19). Ruling (d) requires lore and
 * quest to do this the same way, so the field names, the state strings and the remedy strings here
 * match quest-cli's `QCLI-371` (`opum-ai/quest-cli#266`, merged `30a6846`) with the plugin id
 * swapped from `opum-quest@opum` to `opum-lore@opum`.
 *
 * Pure: this module never spawns. It turns a runtime's {@link AgentPluginListing} (produced by
 * `adapters/agent-plugins.ts`, the only place a runtime CLI is started) into an
 * {@link AgentPluginCheck}. The port it is given may answer synchronously — the off switch's does —
 * and then so does {@link detectLorePlugins}, which is what keeps a run with detection switched off
 * exactly as synchronous as it was before this feature existed.
 */

import { stripAnsiAndControls } from "../errors";

/** The agent runtimes whose marketplace plugin lore checks. Each is reached only through its own public CLI. */
export type AgentRuntime = "claude" | "codex";

/** One plugin row as the runtime's own list command reports it. `enabled` is absent when the runtime did not report it; it is never inferred. */
export interface ListedAgentPlugin {
  readonly id: string;
  readonly enabled?: boolean;
  readonly version?: string;
  /** The install scope whose row decided this entry, where the runtime has scopes (Claude). */
  readonly scope?: string;
}

/**
 * A runtime's installed plugins, or why they could not be read. An unreadable listing is never an
 * empty one: "no plugins" and "could not ask" are different answers, and only the first may become
 * `not-installed`.
 */
export type AgentPluginListing =
  | { readonly kind: "listed"; readonly plugins: readonly ListedAgentPlugin[] }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Reads a runtime's installed plugins. Installing, enabling and updating are deliberately absent:
 * `init` and `--check` print those commands and never run them (ruling 19). A port may answer
 * synchronously; the disabled port does, so the off switch adds no `Promise` to a synchronous run.
 */
export interface AgentPluginPort {
  list(runtime: AgentRuntime): AgentPluginListing | Promise<AgentPluginListing>;
}

/** The opum-lore plugin as both runtimes name it: `plugin@marketplace`. */
export const LORE_PLUGIN_ID = "opum-lore@opum";
const MARKETPLACE_NAME = "opum";
const MARKETPLACE_REPOSITORY = "opum-ai/opum-marketplace";

/**
 * The four states (ADR Amendment 2, ruling 20), spelled as ruling 24's one shared kebab-case
 * vocabulary. `disabled` is installed with `enabled: false` and is never reported as `installed`,
 * because a disabled plugin's skill does not reach the agent. `not-detectable` means the runtime's
 * own CLI could not be asked (absent, failed, or unparseable) and is never folded into
 * `not-installed`.
 */
export type AgentPluginState = "installed" | "disabled" | "not-installed" | "not-detectable";

/** What `lore init` (as `data.plugins.<runtime>`) and `lore agents --check` (as `data.plugin`) report. */
export interface AgentPluginCheck {
  readonly runtime: AgentRuntime;
  readonly id: string;
  readonly state: AgentPluginState;
  readonly version?: string;
  /** The install scope that decided the state, where the runtime has one (Claude, ruling 26). */
  readonly scope?: string;
  /** Why the state is `not-detectable`. */
  readonly reason?: string;
  /** What to run next. Printed, never executed, by `init` and `--check`. */
  readonly remedy?: string;
}

/** Per-runtime checks, keyed by runtime — the shape of `lore init`'s `data.plugins`. */
export type AgentPluginChecks = Partial<Record<AgentRuntime, AgentPluginCheck>>;

/**
 * ` --scope <scope>`, or nothing. A scope is runtime-supplied text going into a command a user may
 * paste into a shell, so only a plain token is ever interpolated (every scope Claude reports —
 * local, project, user, managed, synced — is one).
 */
function scopeFlag(scope: string | undefined): string {
  return scope !== undefined && /^[A-Za-z0-9_-]+$/.test(scope) ? ` --scope ${scope}` : "";
}

/** The command that updates an installed plugin, naming its deciding scope (ruling 26 iii). */
export function lorePluginUpdateCommand(runtime: AgentRuntime, scope?: string): string {
  return runtime === "claude"
    ? `claude plugin update ${LORE_PLUGIN_ID}${scopeFlag(scope)}`
    : `codex plugin marketplace upgrade ${MARKETPLACE_NAME} && codex plugin add ${LORE_PLUGIN_ID}`;
}

/**
 * Runtime-supplied text as one printable line: whitespace (line breaks included) collapsed first,
 * then ANSI escape sequences and control bytes removed. Every field a runtime or a port supplies
 * passes through this before it can reach `--plain` or pretty output (LCLI-592 review, finding 2):
 * a newline would forge a standalone plain record (cli-contract §1.3), and an ESC byte would put
 * ANSI on a stream that must carry none (§6).
 */
function printable(text: string): string {
  return stripAnsiAndControls(text.replace(/\s+/g, " ")).replace(/\s+/g, " ").trim();
}

/** The next step for a state, or `undefined` for `not-detectable` (whose `reason` is the next step). */
function remedyFor(runtime: AgentRuntime, state: AgentPluginState, scope?: string): string | undefined {
  if (state === "not-installed") {
    return runtime === "claude"
      ? `claude plugin marketplace add ${MARKETPLACE_REPOSITORY} && claude plugin install ${LORE_PLUGIN_ID}`
      : `codex plugin marketplace add ${MARKETPLACE_REPOSITORY} && codex plugin add ${LORE_PLUGIN_ID}`;
  }
  if (state === "disabled") {
    // Codex has no plugin enable command (codex-cli 0.155.1; its --enable/--disable toggle
    // features, not plugins): enablement is this config key, which its own list command reads.
    return runtime === "claude"
      ? `claude plugin enable ${LORE_PLUGIN_ID}${scopeFlag(scope)}`
      : `set enabled = true under [plugins."${LORE_PLUGIN_ID}"] in $CODEX_HOME/config.toml (default ~/.codex/config.toml)`;
  }
  if (state === "installed") {
    return lorePluginUpdateCommand(runtime, scope);
  }
  return undefined;
}

/** Classify one runtime's listing. The single place a listing becomes a state. */
export function checkFromListing(runtime: AgentRuntime, listing: AgentPluginListing): AgentPluginCheck {
  if (listing.kind === "unavailable") {
    return { runtime, id: LORE_PLUGIN_ID, state: "not-detectable", reason: printable(listing.reason) };
  }
  const row = listing.plugins.find((plugin) => plugin.id === LORE_PLUGIN_ID);
  const state: AgentPluginState =
    row === undefined ? "not-installed" : row.enabled === false ? "disabled" : "installed";
  const version = row?.version !== undefined ? printable(row.version) : undefined;
  const scope = row?.scope !== undefined ? printable(row.scope) : undefined;
  const remedy = remedyFor(runtime, state, scope);
  return {
    runtime,
    id: LORE_PLUGIN_ID,
    state,
    ...(version ? { version } : {}),
    ...(scope ? { scope } : {}),
    ...(remedy !== undefined ? { remedy } : {}),
  };
}

/**
 * Detect the opum-lore plugin for each runtime through `port`. Read-only (ruling 19). Synchronous
 * when every listing is — the off switch's case — and a `Promise` only when a runtime CLI was
 * actually asked. Runtimes are de-duplicated and keyed, so the result is `init`'s `data.plugins`.
 */
export function detectLorePlugins(
  port: AgentPluginPort,
  runtimes: readonly AgentRuntime[],
): AgentPluginChecks | Promise<AgentPluginChecks> {
  const unique = [...new Set(runtimes)];
  const listings = unique.map((runtime) => port.list(runtime));
  const build = (resolved: readonly AgentPluginListing[]): AgentPluginChecks => {
    const checks: AgentPluginChecks = {};
    unique.forEach((runtime, index) => {
      checks[runtime] = checkFromListing(runtime, resolved[index] as AgentPluginListing);
    });
    return checks;
  };
  if (listings.some((listing) => listing instanceof Promise)) {
    return Promise.all(listings).then(build);
  }
  return build(listings as AgentPluginListing[]);
}

/** Continue with `value` whether it arrived synchronously or as a `Promise`, staying synchronous when it did. */
export function thenMaybe<T, R>(value: T | Promise<T>, next: (resolved: T) => R | Promise<R>): R | Promise<R> {
  return value instanceof Promise ? value.then(next) : next(value);
}

/** The label a plugin check renders as in `--plain`: `plugin-<runtime> <state> <id>`, plus the remedy or reason on its own line. */
export function renderPluginPlain(check: AgentPluginCheck): string[] {
  const lines = [`plugin-${check.runtime} ${check.state} ${check.id}${check.scope ? ` scope=${check.scope}` : ""}`];
  if (check.remedy !== undefined) lines.push(`plugin-${check.runtime}-remedy ${check.remedy}`);
  if (check.reason !== undefined) lines.push(`plugin-${check.runtime}-reason ${check.reason}`);
  return lines;
}

/** The human line for a plugin check. The state string is ruling 24's; the surrounding prose is lore's own. */
export function renderPluginPretty(check: AgentPluginCheck): string[] {
  const runtimeName = check.runtime === "claude" ? "Claude Code" : "Codex";
  const version = check.version !== undefined ? ` v${check.version}` : "";
  const scope = check.scope !== undefined ? ` (${check.scope} scope)` : "";
  const lines = [`${runtimeName} plugin ${check.id}: ${check.state}${version}${scope}`];
  if (check.reason !== undefined) lines.push(`  ${check.reason}`);
  // Ruling 19: init/--check print the command that would update an installed plugin, too.
  if (check.remedy !== undefined) lines.push(`  ${check.state === "installed" ? "to update" : "run"}: ${check.remedy}`);
  return lines;
}
