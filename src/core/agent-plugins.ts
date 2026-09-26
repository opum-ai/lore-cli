/**
 * core/agent-plugins.ts — whether an agent runtime has the `opum-lore` marketplace plugin (LCLI-592).
 *
 * The binding decision is opum-doc's ADR "Distribute lore and quest agent skills through the plugin
 * marketplace" (main `99e8ce5`, Amendments 1-5). `lore init` and `lore agents` report which of four
 * states a selected runtime is in, and the command to run next. `init` and `--check` never run it:
 * they do not mutate the user's agent install (ruling 19). The one mutation is LCLI-593's: `lore
 * agents --target <runtime> --force` updates that runtime's INSTALLED plugin (rulings 19, 25, 27) —
 * never installs one, never enables one (ruling 21), and never for a runtime the call did not name.
 * Ruling (d) requires lore and quest to do this the same way, so the field names, the state strings
 * and the remedy strings here match quest-cli's `QCLI-371` (`opum-ai/quest-cli#266`, merged
 * `30a6846`) with the plugin id swapped from `opum-quest@opum` to `opum-lore@opum`.
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

/** What running a plugin update produced: whether every step exited 0, and what to say about it. */
export interface AgentPluginUpdateOutcome {
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Reads a runtime's installed plugins, and updates an installed one. Installing and enabling are
 * deliberately absent: lore prints those commands and never runs them (rulings 19, 21). `list` may
 * answer synchronously; the disabled port does, so the off switch adds no `Promise` to a synchronous
 * run. `update` runs {@link lorePluginUpdateSteps} for `runtime`, and is called only by
 * {@link updateLorePlugin} — so only for an installed plugin, on a call that named its runtime.
 */
export interface AgentPluginPort {
  list(runtime: AgentRuntime): AgentPluginListing | Promise<AgentPluginListing>;
  update(runtime: AgentRuntime, scope: string | undefined): Promise<AgentPluginUpdateOutcome>;
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

/**
 * One runtime's plugin state: `lore init`'s and a bare `lore agents` call's `data.plugins.<runtime>`,
 * and `lore agents --target <runtime>`'s `data.plugin` (ruling 27: the bare field exactly when a
 * target is named).
 */
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
 * The manual update command's plugin report (`lore agents --force`, not `--check`), with quest-cli
 * QCLI-371's field names. `update` is `ran` only for an installed plugin on a call that named its
 * runtime with `--target`; every other case is `not-run`, keeps its remedy, and says why in
 * `updateDetail`. `updateOk` is present exactly when `update` is `ran`.
 */
export interface AgentPluginUpdateReport extends AgentPluginCheck {
  readonly update: "ran" | "not-run";
  readonly updateOk?: boolean;
  readonly updateDetail?: string;
}

/** Per-runtime update reports: a bare `lore agents --force` call's `data.plugins`, every entry `not-run`. */
export type AgentPluginUpdateReports = Partial<Record<AgentRuntime, AgentPluginUpdateReport>>;

/**
 * Whether a scope may be put into a command. A scope is runtime-supplied text going into a command a
 * user may paste into a shell, or that lore itself runs, so only a plain token is ever interpolated
 * (every scope Claude reports — local, project, user, managed, synced — is one).
 */
function isPlainScope(scope: string | undefined): scope is string {
  return scope !== undefined && /^[A-Za-z0-9_-]+$/.test(scope);
}

/** ` --scope <scope>`, or nothing. */
function scopeFlag(scope: string | undefined): string {
  return isPlainScope(scope) ? ` --scope ${scope}` : "";
}

/**
 * The argv of each step that updates an installed plugin: the ONE source for both the command lore
 * runs ({@link AgentPluginPort.update}) and the command it prints ({@link lorePluginUpdateCommand}),
 * so the two cannot drift. Claude names the deciding scope (ruling 26 iii). Codex has no per-plugin
 * update (codex-cli 0.155.1): refreshing the marketplace and re-adding the plugin is its equivalent,
 * and that refresh covers EVERY plugin the `opum` marketplace serves (ruling 25).
 */
export function lorePluginUpdateSteps(runtime: AgentRuntime, scope?: string): string[][] {
  return runtime === "claude"
    ? [["claude", "plugin", "update", LORE_PLUGIN_ID, ...(isPlainScope(scope) ? ["--scope", scope] : [])]]
    : [
        ["codex", "plugin", "marketplace", "upgrade", MARKETPLACE_NAME],
        ["codex", "plugin", "add", LORE_PLUGIN_ID],
      ];
}

/** The command that updates an installed plugin, naming its deciding scope (ruling 26 iii). */
export function lorePluginUpdateCommand(runtime: AgentRuntime, scope?: string): string {
  return lorePluginUpdateSteps(runtime, scope)
    .map((argv) => argv.join(" "))
    .join(" && ");
}

/**
 * Ruling 25: the Codex upgrade's marketplace-wide side effect is said where it happens, in the
 * command's own output, not only in documentation.
 */
export const CODEX_MARKETPLACE_NOTICE = `\`codex plugin marketplace upgrade ${MARKETPLACE_NAME}\` refreshes every ${MARKETPLACE_NAME} plugin installed in Codex (opum-quest included), not only ${LORE_PLUGIN_ID}`;

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

/** Why an update did not run: `updateDetail` on a `not-run` report. */
function notRunDetail(check: AgentPluginCheck, runtimeNamed: boolean): string {
  if (!runtimeNamed) {
    // Rulings 25 and 27: a call naming no runtime is not consent to updating one.
    return `this call named no runtime, so it updates none; \`lore agents --target ${check.runtime} --force\` updates this one`;
  }
  switch (check.state) {
    case "disabled":
      return "lore agents never enables a disabled plugin; enable it with the remedy, then update";
    case "not-installed":
      return "lore agents never installs a plugin; install it with the remedy";
    default:
      return "the plugin state could not be read, so nothing was run";
  }
}

/**
 * The report for a plugin whose update did not run: its check, unchanged (remedy included), marked
 * `not-run` with the reason. `runtimeNamed: false` is a bare `lore agents --force`, which names no
 * runtime and so is consent to updating none (rulings 25, 27). It takes no port, so it CANNOT run
 * anything: the bare path reaches a runtime's update only if someone rewires it to a different
 * function.
 */
export function notRunReport(check: AgentPluginCheck, runtimeNamed: boolean): AgentPluginUpdateReport {
  return { ...check, update: "not-run", updateDetail: notRunDetail(check, runtimeNamed) };
}

/**
 * The manual update command's plugin step for one runtime (ruling 19, second bullet): invoking
 * `lore agents --target <runtime> --force` is consent to updating that runtime's installed plugin,
 * so it runs the update. It is not consent to installing or enabling one (ruling 21), so every other
 * state is only reported, with its remedy, and nothing runs. A call that named no runtime never
 * reaches here: it uses {@link notRunReport}. Synchronous whenever nothing runs, so the off switch's
 * path stays as synchronous as it was.
 */
export function updateLorePlugin(
  port: AgentPluginPort,
  check: AgentPluginCheck,
): AgentPluginUpdateReport | Promise<AgentPluginUpdateReport> {
  // Ruling 21: never install, never enable. Only an installed plugin is updated.
  if (check.state !== "installed") return notRunReport(check, true);
  if (check.runtime === "claude" && !isPlainScope(check.scope)) {
    // Ruling 26 (iii): an update names its deciding scope, and never updates a row the reported state
    // did not come from. A scope that cannot be put into a command cannot be named, so nothing runs.
    return { ...check, update: "not-run", updateDetail: "the deciding scope could not be named in a command" };
  }
  return port.update(check.runtime, check.scope).then((outcome): AgentPluginUpdateReport => {
    const { remedy: _remedy, ...rest } = check;
    const detail = printable(outcome.detail);
    return {
      ...rest,
      update: "ran",
      updateOk: outcome.ok,
      updateDetail: check.runtime === "codex" ? `${detail}; note: ${CODEX_MARKETPLACE_NOTICE}` : detail,
      // A failed update keeps its command visible so it can be run by hand.
      ...(outcome.ok ? {} : { remedy: lorePluginUpdateCommand(check.runtime, check.scope) }),
    };
  });
}

/** Continue with `value` whether it arrived synchronously or as a `Promise`, staying synchronous when it did. */
export function thenMaybe<T, R>(value: T | Promise<T>, next: (resolved: T) => R | Promise<R>): R | Promise<R> {
  return value instanceof Promise ? value.then(next) : next(value);
}

/** Whether a plugin entry is an update report (a `--force` run) rather than a bare check. */
function isUpdateReport(check: AgentPluginCheck | AgentPluginUpdateReport): check is AgentPluginUpdateReport {
  return "update" in check;
}

/** The token an update report's outcome renders as in `--plain`: `ran-ok`, `ran-failed`, or `not-run`. */
function updateToken(report: AgentPluginUpdateReport): string {
  if (report.update === "not-run") return "not-run";
  return report.updateOk ? "ran-ok" : "ran-failed";
}

/**
 * The label a plugin check renders as in `--plain`: `plugin-<runtime> <state> <id>`, plus the remedy
 * or reason on its own line, and, on a `--force` run, `plugin-<runtime>-update <outcome>` and its
 * detail.
 */
export function renderPluginPlain(check: AgentPluginCheck | AgentPluginUpdateReport): string[] {
  const lines = [`plugin-${check.runtime} ${check.state} ${check.id}${check.scope ? ` scope=${check.scope}` : ""}`];
  if (check.remedy !== undefined) lines.push(`plugin-${check.runtime}-remedy ${check.remedy}`);
  if (check.reason !== undefined) lines.push(`plugin-${check.runtime}-reason ${check.reason}`);
  if (isUpdateReport(check)) {
    lines.push(`plugin-${check.runtime}-update ${updateToken(check)}`);
    if (check.updateDetail !== undefined) lines.push(`plugin-${check.runtime}-update-detail ${check.updateDetail}`);
  }
  return lines;
}

/** The human line for a plugin check. The state string is ruling 24's; the surrounding prose is lore's own. */
export function renderPluginPretty(check: AgentPluginCheck | AgentPluginUpdateReport): string[] {
  const runtimeName = check.runtime === "claude" ? "Claude Code" : "Codex";
  const version = check.version !== undefined ? ` v${check.version}` : "";
  const scope = check.scope !== undefined ? ` (${check.scope} scope)` : "";
  const lines = [`${runtimeName} plugin ${check.id}: ${check.state}${version}${scope}`];
  if (check.reason !== undefined) lines.push(`  ${check.reason}`);
  // Ruling 19: init/--check print the command that would update an installed plugin, too.
  if (check.remedy !== undefined) lines.push(`  ${check.state === "installed" ? "to update" : "run"}: ${check.remedy}`);
  if (isUpdateReport(check)) {
    const outcome = check.update === "not-run" ? "not run" : check.updateOk ? "ran" : "FAILED";
    lines.push(`  update ${outcome}${check.updateDetail !== undefined ? `: ${check.updateDetail}` : ""}`);
  }
  return lines;
}
