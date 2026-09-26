/**
 * LCLI-592 — the opum-lore marketplace plugin check in `lore init` and `lore agents --check`; and
 * LCLI-593 — `lore agents --target claude|codex`, and the plugin update `--target <runtime> --force`
 * runs.
 *
 * Binding record: opum-doc ADR "Distribute lore and quest agent skills through the plugin
 * marketplace" (main 7831fff, Amendments 1-4; rulings (a), (d), 18, 20, 22, 23, 24, 26; and main
 * 99e8ce5, Amendment 5, ruling 27, with rulings 19, 21, 25 and 26 iii for the update). Parity
 * source: quest-cli QCLI-371 (opum-ai/quest-cli#266, merged 30a6846).
 *
 * Hermetic. No case here starts the real `claude` or `codex`:
 *  - listing cases serve RECORDED `plugin list --json` output through the adapter's runner seam, so
 *    the decoders see the real shape without any binary;
 *  - command cases inject a fake port;
 *  - the subprocess cases put fake `claude`/`codex` scripts on a PATH that contains no other agent
 *    CLI, log every invocation, and are skipped on Windows, where a `#!/bin/sh` script cannot run.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  CliAgentPluginPort,
  createAgentPluginPort,
  DisabledAgentPluginPort,
  type PluginCommandResult,
  type PluginCommandRunner,
} from "../src/adapters/agent-plugins";
import { run } from "../src/cli";
import { type AgentsResult, runAgents } from "../src/commands/agents";
import { type InitResult, runInit } from "../src/commands/init";
import {
  type AgentPluginCheck,
  type AgentPluginChecks,
  type AgentPluginListing,
  type AgentPluginPort,
  type AgentPluginUpdateOutcome,
  type AgentRuntime,
  detectLorePlugins,
  LORE_PLUGIN_ID,
} from "../src/core/agent-plugins";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };
const onWindows = process.platform === "win32";

// ---- Recorded list output --------------------------------------------------------------------
// Row shapes recorded 2026-09-26 from `claude plugin list --json` (Claude Code 2.1.283) and
// `codex plugin list --json` (codex-cli 0.155.1) on a developer machine, home directory redacted.
// Every key the runtimes emit is kept, so a decoder that leaned on one they do not emit would fail.

type ClaudeRow = Record<string, unknown>;

function claudeRow(overrides: ClaudeRow): ClaudeRow {
  return {
    id: LORE_PLUGIN_ID,
    version: "0.9.0",
    scope: "user",
    enabled: true,
    installPath: "/home/dev/.claude/plugins/cache/opum/opum-lore/0.9.0",
    installedAt: "2026-09-05T11:57:41.872Z",
    lastUpdated: "2026-09-24T04:10:04.498Z",
    ...overrides,
  };
}

/** Rows for other plugins, as a real listing carries them — including a local row for another project and a synced row. */
const CLAUDE_NEIGHBOURS: ClaudeRow[] = [
  {
    id: "frontend-design@claude-plugins-official",
    version: "c447c3207a42",
    scope: "local",
    enabled: false,
    installPath: "/home/dev/.claude/plugins/cache/claude-plugins-official/frontend-design/c447c3207a42",
    installedAt: "2026-09-09T14:34:29.016Z",
    lastUpdated: "2026-09-19T15:49:57.007Z",
    projectPath: "/home/dev/repos/opum-web",
  },
  {
    id: "cowork-plugin-management@synced",
    version: "0.2.2",
    scope: "synced",
    enabled: true,
    installPath: "/home/dev/.claude/plugins/synced/8ac0179a/cowork-plugin-management~g2",
  },
];

function codexRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    pluginId: LORE_PLUGIN_ID,
    name: "opum-lore",
    marketplaceName: "opum",
    version: "0.9.0",
    installed: true,
    enabled: true,
    source: { source: "local", path: "/home/dev/.codex/plugins/opum/opum-lore" },
    marketplaceSource: { sourceType: "git", source: "opum-ai/opum-marketplace" },
    installPolicy: "AVAILABLE",
    authPolicy: "ON_USE",
    ...overrides,
  };
}

const CODEX_NEIGHBOUR = codexRow({ pluginId: "documents@openai-primary-runtime", name: "documents" });

// ---- Harness ---------------------------------------------------------------------------------

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-lcli592-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A runner that serves one recorded result per runtime and records every argv it was asked to run. */
function recordedRunner(results: Partial<Record<AgentRuntime, PluginCommandResult>>): PluginCommandRunner & {
  calls: string[];
} {
  const calls: string[] = [];
  const runner: PluginCommandRunner = async (argv) => {
    calls.push(argv.join(" "));
    return results[argv[0] as AgentRuntime] ?? { failure: `${argv[0]} was not found on PATH.` };
  };
  return Object.assign(runner, { calls });
}

const listed = (stdout: unknown): PluginCommandResult => ({
  exitCode: 0,
  stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
  stderr: "",
});

/** Detect one runtime through the REAL adapter over a recorded listing. */
async function detect(runtime: AgentRuntime, result: PluginCommandResult, at = root): Promise<AgentPluginCheck> {
  const port = new CliAgentPluginPort(at, { runner: recordedRunner({ [runtime]: result }) });
  const checks = await detectLorePlugins(port, [runtime]);
  return checks[runtime] as AgentPluginCheck;
}

/**
 * A fake port: answers asynchronously (the live path's shape), records list calls and every update
 * it was asked to run (`runtime` or `runtime@scope`), runs `onList` at call time, and answers an
 * update with `updateOutcome`.
 */
function fakePort(
  listings: Partial<Record<AgentRuntime, AgentPluginListing>>,
  onList?: (runtime: AgentRuntime) => void,
  updateOutcome: AgentPluginUpdateOutcome = { ok: true, detail: "updated" },
): AgentPluginPort & { calls: AgentRuntime[]; updates: string[] } {
  const calls: AgentRuntime[] = [];
  const updates: string[] = [];
  return {
    calls,
    updates,
    list: async (runtime) => {
      calls.push(runtime);
      onList?.(runtime);
      return listings[runtime] ?? { kind: "listed", plugins: [] };
    },
    update: async (runtime, scope) => {
      updates.push(scope === undefined ? runtime : `${runtime}@${scope}`);
      return updateOutcome;
    },
  };
}

// ---- Detection over recorded listings: the four states ----------------------------------------

describe("claude: detection over recorded `claude plugin list --json`", () => {
  test("installed: an enabled user-scope row, with version, scope and the update command as remedy", async () => {
    const check = await detect("claude", listed([...CLAUDE_NEIGHBOURS, claudeRow({})]));
    expect(check).toEqual({
      runtime: "claude",
      id: "opum-lore@opum",
      state: "installed",
      version: "0.9.0",
      scope: "user",
      remedy: "claude plugin update opum-lore@opum --scope user",
    });
  });

  test("disabled: an enabled:false row is never reported installed, and names the enable command", async () => {
    const check = await detect("claude", listed([...CLAUDE_NEIGHBOURS, claudeRow({ enabled: false })]));
    expect(check.state).toBe("disabled");
    expect(check.remedy).toBe("claude plugin enable opum-lore@opum --scope user");
  });

  test("not-installed: a listing without the plugin names the marketplace add and install", async () => {
    const check = await detect("claude", listed(CLAUDE_NEIGHBOURS));
    expect(check.state).toBe("not-installed");
    expect(check.remedy).toBe(
      "claude plugin marketplace add opum-ai/opum-marketplace && claude plugin install opum-lore@opum",
    );
  });

  test("not-installed: an empty listing is an empty install, not an unreadable one", async () => {
    expect((await detect("claude", listed([]))).state).toBe("not-installed");
  });

  test("ruling 26 (i): an enabled local row for ANOTHER project is not this project's install", async () => {
    const foreign = claudeRow({ scope: "local", projectPath: "/home/dev/repos/some-other-project" });
    const check = await detect("claude", listed([...CLAUDE_NEIGHBOURS, foreign]));
    expect(check.state).toBe("not-installed");
    expect(check.scope).toBeUndefined();
  });

  test("ruling 26 (i): a foreign-project row does not mask this project's user-scope install", async () => {
    const foreign = claudeRow({ scope: "local", enabled: false, projectPath: "/home/dev/repos/some-other-project" });
    const check = await detect("claude", listed([foreign, claudeRow({})]));
    expect({ state: check.state, scope: check.scope }).toEqual({ state: "installed", scope: "user" });
  });

  test("ruling 26 (ii): this project's disabled local row overrides an enabled user row, in either order", async () => {
    const user = claudeRow({ scope: "user", enabled: true });
    const local = claudeRow({ scope: "local", enabled: false, projectPath: root });
    for (const order of ["user-first", "local-first"] as const) {
      const rows = order === "user-first" ? [user, local] : [local, user];
      const check = await detect("claude", listed(rows));
      expect({ order, state: check.state, scope: check.scope, remedy: check.remedy }).toEqual({
        order,
        state: "disabled",
        scope: "local",
        remedy: "claude plugin enable opum-lore@opum --scope local",
      });
    }
  });

  test("ruling 26 (ii): the full precedence is local > project > user > managed > synced", async () => {
    const scopes = ["synced", "managed", "user", "project", "local"];
    for (let winner = 0; winner < scopes.length; winner += 1) {
      // Rows for every scope from the least specific up to `winner`; only the winner is disabled.
      const rows = scopes
        .slice(0, winner + 1)
        .map((scope, index) => claudeRow({ scope, enabled: index !== winner, projectPath: root }));
      const check = await detect("claude", listed(rows));
      expect({ scope: check.scope, state: check.state }).toEqual({ scope: scopes[winner], state: "disabled" });
    }
  });

  test("ruling 26 (i): a row for an ANCESTOR of this project applies, and a sibling with a shared prefix does not", async () => {
    const nested = join(root, "packages", "app");
    mkdirSync(nested, { recursive: true });
    const ancestor = claudeRow({ scope: "project", enabled: false, projectPath: root });
    expect((await detect("claude", listed([ancestor]), nested)).state).toBe("disabled");
    // `${root}-sibling` shares `root` as a string prefix but is not an ancestor directory.
    const sibling = claudeRow({ scope: "project", projectPath: `${root}-sibling` });
    expect((await detect("claude", listed([sibling]), nested)).state).toBe("not-installed");
  });

  test.skipIf(onWindows)("ruling 26 (i): paths are compared after resolving symlinks", async () => {
    const real = join(root, "real");
    const link = join(root, "link");
    mkdirSync(real);
    symlinkSync(real, link);
    const row = claudeRow({ scope: "local", enabled: false, projectPath: real });
    expect((await detect("claude", listed([row]), link)).state).toBe("disabled");
  });

  test("ruling 26 (i): ancestry is by whole path segment — a row for /x/foo is dropped at /x/foobar", async () => {
    // Review finding 5: the pre-existing sibling case could not see a missing separator, because
    // `${root}-sibling` is not a string prefix of the nested project at all. This one is.
    const foo = join(root, "foo");
    const foobar = join(root, "foobar");
    mkdirSync(foo);
    mkdirSync(foobar);
    const row = claudeRow({ scope: "local", enabled: false, projectPath: foo });
    expect((await detect("claude", listed([row]), foobar)).state).toBe("not-installed");
    // Positive control in the same invocation: the same row does apply at /x/foo itself.
    expect((await detect("claude", listed([row]), foo)).state).toBe("disabled");
  });

  test("ruling 26 (ii): within one scope, the deeper applicable projectPath decides, in either row order", async () => {
    // Review finding 4: an enabled local row for /p/outer and a disabled one for /p/outer/inner both
    // apply at /p/outer/inner. The inner one is the more specific and must decide, whatever the order.
    const outer = root;
    const inner = join(root, "inner");
    mkdirSync(inner);
    const outerRow = claudeRow({ scope: "local", enabled: true, projectPath: outer });
    const innerRow = claudeRow({ scope: "local", enabled: false, projectPath: inner });
    for (const order of ["outer-first", "inner-first"] as const) {
      const rows = order === "outer-first" ? [outerRow, innerRow] : [innerRow, outerRow];
      expect({ order, state: (await detect("claude", listed(rows), inner)).state }).toEqual({
        order,
        state: "disabled",
      });
      // At /p/outer only the outer row applies.
      expect({ order, state: (await detect("claude", listed(rows), outer)).state }).toEqual({
        order,
        state: "installed",
      });
    }
  });

  test("ruling 26 (ii): a more specific SCOPE still beats a deeper path in a less specific scope", async () => {
    const inner = join(root, "inner");
    mkdirSync(inner);
    const localOuter = claudeRow({ scope: "local", enabled: false, projectPath: root });
    const projectInner = claudeRow({ scope: "project", enabled: true, projectPath: inner });
    for (const rows of [
      [localOuter, projectInner],
      [projectInner, localOuter],
    ]) {
      const check = await detect("claude", listed(rows), inner);
      expect({ state: check.state, scope: check.scope }).toEqual({ state: "disabled", scope: "local" });
    }
  });
});

describe("codex: detection over recorded `codex plugin list --json`", () => {
  test("installed: an installed[] row, with the marketplace upgrade as the update remedy", async () => {
    const check = await detect("codex", listed({ installed: [CODEX_NEIGHBOUR, codexRow({})], available: [] }));
    expect(check).toEqual({
      runtime: "codex",
      id: "opum-lore@opum",
      state: "installed",
      version: "0.9.0",
      remedy: "codex plugin marketplace upgrade opum && codex plugin add opum-lore@opum",
    });
  });

  test("disabled: enabled:false reads disabled, and the remedy names the config.toml key (codex has no enable command)", async () => {
    const check = await detect("codex", listed({ installed: [codexRow({ enabled: false })], available: [] }));
    expect(check.state).toBe("disabled");
    expect(check.remedy).toBe(
      'set enabled = true under [plugins."opum-lore@opum"] in $CODEX_HOME/config.toml (default ~/.codex/config.toml)',
    );
  });

  test("not-installed: a plugin only in available[] is not installed", async () => {
    const check = await detect("codex", listed({ installed: [CODEX_NEIGHBOUR], available: [codexRow({})] }));
    expect(check.state).toBe("not-installed");
    expect(check.remedy).toBe(
      "codex plugin marketplace add opum-ai/opum-marketplace && codex plugin add opum-lore@opum",
    );
  });

  test("ruling 22: a row with no enabled field reads installed; disabled is never synthesised", async () => {
    const row = codexRow({});
    delete row.enabled;
    expect((await detect("codex", listed({ installed: [row] }))).state).toBe("installed");
  });
});

describe("not-detectable: the runtime could not be asked, which is never not-installed", () => {
  for (const runtime of ["claude", "codex"] as const) {
    const good = runtime === "claude" ? [claudeRow({})] : { installed: [codexRow({})] };

    test(`${runtime}: a missing binary reports the runner's reason and no remedy`, async () => {
      const check = await detect(runtime, { failure: `${runtime} was not found on PATH.` });
      expect(check).toEqual({
        runtime,
        id: "opum-lore@opum",
        state: "not-detectable",
        reason: `${runtime} was not found on PATH.`,
      });
    });

    test(`${runtime}: a non-zero exit is not-detectable even with a well-formed listing`, async () => {
      const check = await detect(runtime, { exitCode: 2, stdout: JSON.stringify(good), stderr: "boom" });
      expect(check.state).toBe("not-detectable");
      expect(check.reason).toBe(`${runtime} plugin list exited 2: boom`);
    });

    test(`${runtime}: output that is not JSON is not-detectable`, async () => {
      const check = await detect(runtime, listed("Plugins:\n  opum-lore@opum (enabled)"));
      expect(check.state).toBe("not-detectable");
      expect(check.reason).toBe(`${runtime} plugin list --json did not return JSON.`);
    });

    test(`${runtime}: rows present but none readable (the shape moved) is not-detectable`, async () => {
      const moved = runtime === "claude" ? [{ name: "opum-lore" }] : { installed: [{ id: "opum-lore@opum" }] };
      const check = await detect(runtime, listed(moved));
      expect(check.state).toBe("not-detectable");
      expect(check.reason).toBe(`${runtime} plugin list --json returned an unrecognised shape.`);
    });
  }

  test("the wrong top-level shape for each runtime is not-detectable", async () => {
    expect((await detect("claude", listed({ installed: [] }))).state).toBe("not-detectable");
    expect((await detect("codex", listed([]))).state).toBe("not-detectable");
  });
});

// ---- The off switch (ruling 23) ---------------------------------------------------------------

describe("LORE_AGENT_PLUGINS=off", () => {
  test("the suite runs with it set (bunfig.toml preload)", () => {
    expect(process.env.LORE_AGENT_PLUGINS).toBe("off");
  });

  test("off: every runtime is not-detectable, synchronously, and the runner is never called", () => {
    const runner = recordedRunner({ claude: listed([claudeRow({})]), codex: listed({ installed: [codexRow({})] }) });
    const port = createAgentPluginPort(root, { env: { LORE_AGENT_PLUGINS: "off" }, runner });
    expect(port).toBeInstanceOf(DisabledAgentPluginPort);
    const checks = detectLorePlugins(port, ["claude", "codex"]);
    // Not a Promise: the off path must not turn a synchronous command asynchronous.
    expect(checks).not.toBeInstanceOf(Promise);
    const resolved = checks as AgentPluginChecks;
    for (const runtime of ["claude", "codex"] as const) {
      expect(resolved[runtime]).toEqual({
        runtime,
        id: "opum-lore@opum",
        state: "not-detectable",
        reason: "plugin detection is off (LORE_AGENT_PLUGINS=off).",
      });
    }
    expect(runner.calls).toEqual([]);
  });

  test("positive control: without it the same runner IS asked, once per runtime, for the list only", async () => {
    const runner = recordedRunner({ claude: listed([claudeRow({})]), codex: listed({ installed: [codexRow({})] }) });
    const port = createAgentPluginPort(root, { env: {}, runner });
    expect(port).toBeInstanceOf(CliAgentPluginPort);
    const checks = await detectLorePlugins(port, ["claude", "codex"]);
    expect([checks.claude?.state, checks.codex?.state]).toEqual(["installed", "installed"]);
    expect(runner.calls.sort()).toEqual(["claude plugin list --json", "codex plugin list --json"]);
  });

  test("only the exact value off switches it off", () => {
    for (const value of ["OFF", "0", "false", ""]) {
      expect(createAgentPluginPort(root, { env: { LORE_AGENT_PLUGINS: value } })).toBeInstanceOf(CliAgentPluginPort);
    }
  });
});

// ---- lore agents --check ----------------------------------------------------------------------

/** Seed a current Claude bridge (and optionally a Codex one) so `--check` is clean apart from the plugin. */
async function seedBridges(codex = false): Promise<void> {
  expect(runAgents({ root, output: JSON_CTX, args: [], stdout: capture() })).toBe(EXIT_OK);
  if (codex) {
    const code = await runInit({
      root,
      output: JSON_CTX,
      stdout: capture(),
      stderr: capture(),
      args: ["--codex", "--no-tracker", "--allow-no-git"],
      agentPlugins: fakePort({}),
    });
    expect(code).toBe(EXIT_OK);
  }
}

async function agentsCheck(
  port: AgentPluginPort,
  output: OutputContext = JSON_CTX,
): Promise<{ code: number; text: string; data?: AgentsResult }> {
  const stdout = capture();
  const code = await runAgents({ root, output, args: ["--check"], stdout, agentPlugins: port });
  const text = stdout.text();
  return { code, text, data: output.mode === "json" ? (JSON.parse(text).data as AgentsResult) : undefined };
}

describe("lore agents --check reports data.plugins.<runtime>, never a bare data.plugin (ruling 27)", () => {
  test("a disabled plugin is reported under plugins.claude, and a clean bridge still exits 0", async () => {
    await seedBridges();
    const port = fakePort({
      claude: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: false, scope: "user" }] },
    });
    const { code, data } = await agentsCheck(port);
    expect(code).toBe(EXIT_OK);
    expect(data?.plugins).toEqual({
      claude: {
        runtime: "claude",
        id: "opum-lore@opum",
        state: "disabled",
        scope: "user",
        remedy: "claude plugin enable opum-lore@opum --scope user",
      },
    });
    expect(data).not.toHaveProperty("plugin");
    expect(port.calls).toEqual(["claude"]);
  });

  test("no exit-code change: bridge drift still exits 6 whatever the plugin state, and an installed plugin does not clear it", async () => {
    // Fresh repository: the Claude bridge does not exist, so --check reports drift.
    for (const listing of [
      { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: true }] },
      { kind: "listed", plugins: [] },
      { kind: "unavailable", reason: "x" },
    ] as AgentPluginListing[]) {
      const { code, data } = await agentsCheck(fakePort({ claude: listing }));
      expect(code).toBe(EXIT_CODES.drift);
      expect(data?.plugins?.claude?.runtime).toBe("claude");
    }
  });

  test("no mutation: --check writes nothing while detecting", async () => {
    const port = fakePort({ claude: { kind: "listed", plugins: [] } });
    await agentsCheck(port);
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
    expect(port.calls).toEqual(["claude"]);
  });

  test("a Codex-only repository reports plugins.codex alone, and no bare plugin", async () => {
    await seedBridges(true);
    // Remove the Claude bridge so only Codex is armed.
    rmSync(join(root, ".claude"), { recursive: true, force: true });
    rmSync(join(root, "CLAUDE.md"), { force: true });
    const port = fakePort({ codex: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: true }] } });
    const { data } = await agentsCheck(port);
    expect(Object.keys(data?.plugins ?? {})).toEqual(["codex"]);
    expect(data?.plugins?.codex?.state).toBe("installed");
    // Ruling 27: even with exactly one runtime checked, a bare call never gets `data.plugin`.
    expect(data).not.toHaveProperty("plugin");
    expect(port.calls).toEqual(["codex"]);
  });

  test("both bridges: plugins carries both runtimes, and there is no bare plugin to pick one", async () => {
    await seedBridges(true);
    const port = fakePort({
      claude: { kind: "listed", plugins: [] },
      codex: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: false }] },
    });
    const { data } = await agentsCheck(port);
    expect(data?.plugins?.claude?.state).toBe("not-installed");
    expect(data?.plugins?.codex?.state).toBe("disabled");
    expect(data).not.toHaveProperty("plugin");
    expect(port.calls.sort()).toEqual(["claude", "codex"]);
  });

  test("a writing run (no --check) reports plugins.<runtime> too, and never a bare plugin or an update (ruling 27.3)", async () => {
    // LCLI-592 reported plugin state under --check only; ruling 27.3 reports it on every call that
    // names no runtime, so a plain `lore agents` now asks the runtime whose bridge it wrote.
    const port = fakePort({
      claude: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: true, scope: "user" }] },
    });
    const stdout = capture();
    const code = await runAgents({ root, output: JSON_CTX, args: [], stdout, agentPlugins: port });
    expect(code).toBe(EXIT_OK);
    const data = JSON.parse(stdout.text()).data;
    expect(data).not.toHaveProperty("plugin");
    expect(data).not.toHaveProperty("target");
    expect(data.plugins.claude).toEqual({
      runtime: "claude",
      id: LORE_PLUGIN_ID,
      state: "installed",
      scope: "user",
      remedy: "claude plugin update opum-lore@opum --scope user",
    });
    expect(port.calls).toEqual(["claude"]);
    expect(port.updates).toEqual([]);
  });

  test("--plain renders a stable plugin line plus its remedy", async () => {
    await seedBridges();
    const port = fakePort({
      claude: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: false, scope: "user" }] },
    });
    const { text } = await agentsCheck(port, PLAIN_CTX);
    expect(text.split("\n").filter((line) => line.startsWith("plugin-"))).toEqual([
      "plugin-claude disabled opum-lore@opum scope=user",
      "plugin-claude-remedy claude plugin enable opum-lore@opum --scope user",
    ]);
  });

  test("the router threads the agentPlugins seam through to agents --check", async () => {
    await seedBridges();
    const port = fakePort({ claude: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: true }] } });
    const stdout = capture();
    const code = await run(["bun", "lore", "agents", "--check", "--json"], {
      cwd: root,
      stdout,
      stderr: capture(),
      agentPlugins: port,
    });
    expect(code).toBe(EXIT_OK);
    expect(JSON.parse(stdout.text()).data.plugins.claude.state).toBe("installed");
    expect(port.calls).toEqual(["claude"]);
  });
});

// ---- lore agents --target and the update (LCLI-593, ADR Amendment 5 ruling 27) ------------------

const installedAt = (scope?: string): AgentPluginListing => ({
  kind: "listed",
  plugins: [{ id: LORE_PLUGIN_ID, enabled: true, version: "0.9.0", ...(scope ? { scope } : {}) }],
});
const disabledAt = (scope?: string): AgentPluginListing => ({
  kind: "listed",
  plugins: [{ id: LORE_PLUGIN_ID, enabled: false, ...(scope ? { scope } : {}) }],
});

async function agents(
  args: string[],
  port: AgentPluginPort,
  output: OutputContext = JSON_CTX,
): Promise<{ code: number; text: string; data: AgentsResult }> {
  const stdout = capture();
  const code = await runAgents({ root, output, args, stdout, agentPlugins: port });
  const text = stdout.text();
  return { code, text, data: output.mode === "json" ? (JSON.parse(text).data as AgentsResult) : ({} as AgentsResult) };
}

describe("lore agents --target scopes the bridge and reports data.plugin (ruling 27.2)", () => {
  test("--target claude --check on a fresh repository checks the Claude bridge only, reports data.plugin, and still exits 6 on drift", async () => {
    const port = fakePort({ claude: installedAt("user") });
    const { code, data } = await agents(["--target", "claude", "--check"], port);
    expect(code).toBe(EXIT_CODES.drift);
    expect(data.target).toBe("claude");
    expect(data.files.map((file) => file.path).sort()).toEqual([".claude/skills/lore/SKILL.md", "CLAUDE.md"]);
    expect(data.plugin).toMatchObject({ runtime: "claude", state: "installed", scope: "user" });
    // Ruling 27: a targeted call reports the bare field, and never plugins alongside it.
    expect(data).not.toHaveProperty("plugins");
    // --check is not the update command: no update fields, and nothing run.
    expect(data.plugin).not.toHaveProperty("update");
    expect(port.calls).toEqual(["claude"]);
    expect(port.updates).toEqual([]);
  });

  test("--target codex writes the Codex bridge on a Claude-only repository and leaves the Claude bridge alone", async () => {
    await seedBridges();
    const claudeBefore = readFileSync(join(root, "CLAUDE.md"), "utf8");
    const port = fakePort({ codex: { kind: "listed", plugins: [] } });
    const { code, data } = await agents(["--target", "codex"], port);
    expect(code).toBe(EXIT_OK);
    expect(data.files).toEqual([
      { path: ".codex/skills/lore/SKILL.md", action: "created" },
      { path: "AGENTS.md", action: "created" },
    ]);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe(claudeBefore);
    expect(data.plugin).toMatchObject({ runtime: "codex", state: "not-installed" });
    expect(port.calls).toEqual(["codex"]);
  });

  test("--target claude on a Codex-only repository never proposes the Codex bridge, and --target codex --check on it is clean", async () => {
    await seedBridges(true);
    rmSync(join(root, ".claude"), { recursive: true, force: true });
    rmSync(join(root, "CLAUDE.md"), { force: true });
    const codexCheck = await agents(["--target", "codex", "--check"], fakePort({}));
    expect(codexCheck.code).toBe(EXIT_OK);
    expect(codexCheck.data.files.every((file) => file.path !== "CLAUDE.md")).toBe(true);
    const claudeCheck = await agents(["--target", "claude", "--check"], fakePort({}));
    // An explicit ask for the Claude bridge means it, as `lore init --claude` does: absent is drift.
    expect(claudeCheck.code).toBe(EXIT_CODES.drift);
    expect(claudeCheck.data.files.map((file) => file.path).sort()).toEqual([
      ".claude/skills/lore/SKILL.md",
      "CLAUDE.md",
    ]);
  });

  test("a plain --target write (no --force) reports the plugin and runs no update", async () => {
    const port = fakePort({ claude: installedAt("user") });
    const { data } = await agents(["--target", "claude"], port);
    expect(data.plugin).not.toHaveProperty("update");
    expect(data.plugin?.remedy).toBe("claude plugin update opum-lore@opum --scope user");
    expect(port.updates).toEqual([]);
  });

  test("usage: an unknown runtime or a repeated --target is exit 2", () => {
    for (const args of [["--target", "gemini"], ["--target", "claude", "--target", "codex"], ["--target"]]) {
      expect(() => runAgents({ root, output: JSON_CTX, args, stdout: capture(), agentPlugins: fakePort({}) })).toThrow(
        expect.objectContaining({ type: "usage" }),
      );
    }
  });

  test("the router threads --target through to agents", async () => {
    const port = fakePort({ codex: installedAt() });
    const stdout = capture();
    const code = await run(["bun", "lore", "agents", "--target", "codex", "--check", "--json"], {
      cwd: root,
      stdout,
      stderr: capture(),
      agentPlugins: port,
    });
    expect(code).toBe(EXIT_CODES.drift);
    const data = JSON.parse(stdout.text()).data;
    expect(data.plugin.runtime).toBe("codex");
    expect(data).not.toHaveProperty("plugins");
  });
});

describe("lore agents --target <runtime> --force runs that runtime's plugin update (rulings 19, 25, 26 iii)", () => {
  test("claude: installed at its deciding scope runs `claude plugin update opum-lore@opum --scope <scope>` and reports it", async () => {
    const port = fakePort({ claude: installedAt("project") }, undefined, {
      ok: true,
      detail: "claude plugin update opum-lore@opum --scope project",
    });
    const { code, data } = await agents(["--target", "claude", "--force"], port);
    expect(code).toBe(EXIT_OK);
    expect(port.updates).toEqual(["claude@project"]);
    expect(data.plugin).toEqual({
      runtime: "claude",
      id: LORE_PLUGIN_ID,
      state: "installed",
      version: "0.9.0",
      scope: "project",
      update: "ran",
      updateOk: true,
      updateDetail: "claude plugin update opum-lore@opum --scope project",
    });
    // The bridge was regenerated too: --force is still the bridge's own --force.
    expect(existsSync(join(root, ".claude/skills/lore/SKILL.md"))).toBe(true);
  });

  test("codex: installed runs the marketplace upgrade and says, in its own output, that it refreshes every opum plugin (ruling 25)", async () => {
    const port = fakePort({ codex: installedAt() });
    const { data } = await agents(["--target", "codex", "--force"], port);
    expect(port.updates).toEqual(["codex"]);
    expect(data.plugin).toMatchObject({ runtime: "codex", update: "ran", updateOk: true });
    const detail = (data.plugin as { updateDetail?: string }).updateDetail ?? "";
    expect(detail).toContain("refreshes every opum plugin installed in Codex");
    const plain = await agents(["--target", "codex", "--force"], fakePort({ codex: installedAt() }), PLAIN_CTX);
    const lines = plain.text.split("\n");
    expect(lines).toContain("plugin-codex-update ran-ok");
    expect(lines.find((line) => line.startsWith("plugin-codex-update-detail "))).toContain(
      "refreshes every opum plugin installed in Codex (opum-quest included), not only opum-lore@opum",
    );
  });

  test("a failed update keeps exit 0, reports updateOk false, and keeps the update command as the remedy", async () => {
    const port = fakePort({ claude: installedAt("user") }, undefined, { ok: false, detail: "network down" });
    const { code, data } = await agents(["--target", "claude", "--force"], port);
    expect(code).toBe(EXIT_OK);
    expect(data.plugin).toMatchObject({
      update: "ran",
      updateOk: false,
      updateDetail: "network down",
      remedy: "claude plugin update opum-lore@opum --scope user",
    });
  });

  test("--force with --check never updates: --check does not mutate (ruling 19)", async () => {
    const port = fakePort({ claude: installedAt("user") });
    const { data } = await agents(["--target", "claude", "--force", "--check"], port);
    expect(port.updates).toEqual([]);
    expect(data.plugin).not.toHaveProperty("update");
  });

  test("disabled: never enabled and never updated; reported with the enable command (ruling 21)", async () => {
    for (const [runtime, remedy] of [
      ["claude", "claude plugin enable opum-lore@opum --scope user"],
      [
        "codex",
        `set enabled = true under [plugins."opum-lore@opum"] in $CODEX_HOME/config.toml (default ~/.codex/config.toml)`,
      ],
    ] as const) {
      const port = fakePort({ [runtime]: disabledAt(runtime === "claude" ? "user" : undefined) });
      const { code, data } = await agents(["--target", runtime, "--force"], port);
      expect(code).toBe(EXIT_OK);
      expect(port.updates).toEqual([]);
      expect(data.plugin).toMatchObject({ runtime, state: "disabled", update: "not-run", remedy });
      expect(data.plugin).not.toHaveProperty("updateOk");
      expect((data.plugin as { updateDetail?: string }).updateDetail).toContain("never enables");
    }
  });

  test("not-installed and not-detectable: nothing runs, the remedy is printed, and the repo-copy bridge is written as before", async () => {
    for (const listing of [
      { kind: "listed", plugins: [] },
      { kind: "unavailable", reason: "claude was not found on PATH." },
    ] as AgentPluginListing[]) {
      rmSync(join(root, ".claude"), { recursive: true, force: true });
      rmSync(join(root, "CLAUDE.md"), { force: true });
      const port = fakePort({ claude: listing });
      const { code, data } = await agents(["--target", "claude", "--force"], port);
      expect(code).toBe(EXIT_OK);
      expect(port.updates).toEqual([]);
      expect(data.plugin).toMatchObject({ update: "not-run" });
      expect(data.files).toEqual([
        { path: ".claude/skills/lore/SKILL.md", action: "created" },
        { path: "CLAUDE.md", action: "created" },
      ]);
      expect(existsSync(join(root, ".claude/skills/lore/SKILL.md"))).toBe(true);
    }
  });

  test("ruling 26 (iii): a Claude scope that cannot be named in a command is never updated", async () => {
    const port = fakePort({ claude: installedAt("user; rm -rf ~") });
    const { data } = await agents(["--target", "claude", "--force"], port);
    expect(port.updates).toEqual([]);
    expect(data.plugin).toMatchObject({ update: "not-run" });
  });
});

describe("a bare lore agents --force names no runtime, so it updates none (rulings 25, 27.3)", () => {
  test("both plugins installed: no update runs, each plugins.<runtime> is not-run with the update command as remedy, and no bare plugin", async () => {
    await seedBridges(true);
    const port = fakePort({ claude: installedAt("user"), codex: installedAt() });
    const { code, data } = await agents(["--force"], port);
    expect(code).toBe(EXIT_OK);
    expect(port.updates).toEqual([]);
    expect(data).not.toHaveProperty("plugin");
    expect(data).not.toHaveProperty("target");
    expect(data.plugins?.claude).toMatchObject({
      state: "installed",
      update: "not-run",
      remedy: "claude plugin update opum-lore@opum --scope user",
    });
    expect(data.plugins?.codex).toMatchObject({
      state: "installed",
      update: "not-run",
      remedy: "codex plugin marketplace upgrade opum && codex plugin add opum-lore@opum",
    });
    expect((data.plugins?.claude as { updateDetail?: string }).updateDetail).toContain(
      "`lore agents --target claude --force` updates this one",
    );
  });

  test("--plain prints the remedy and the not-run outcome for each runtime", async () => {
    const port = fakePort({ claude: installedAt("user") });
    const { text } = await agents(["--force"], port, PLAIN_CTX);
    const lines = text.split("\n").filter((line) => line.startsWith("plugin-"));
    expect(lines.slice(0, 3)).toEqual([
      "plugin-claude installed opum-lore@opum scope=user",
      "plugin-claude-remedy claude plugin update opum-lore@opum --scope user",
      "plugin-claude-update not-run",
    ]);
    expect(port.updates).toEqual([]);
  });
});

describe("the update adapter: one argv source, a separate budget, stop at the first failed step", () => {
  function timedRunner(results: PluginCommandResult[] = []): PluginCommandRunner & {
    calls: Array<{ argv: string; timeoutMs: number }>;
  } {
    const calls: Array<{ argv: string; timeoutMs: number }> = [];
    const runner: PluginCommandRunner = async (argv, timeoutMs) => {
      calls.push({ argv: argv.join(" "), timeoutMs });
      return results[calls.length - 1] ?? { exitCode: 0, stdout: "", stderr: "" };
    };
    return Object.assign(runner, { calls });
  }

  test("claude runs one step naming the scope, on the update budget rather than the listing's", async () => {
    const runner = timedRunner();
    const outcome = await new CliAgentPluginPort(root, { runner }).update("claude", "local");
    expect(outcome).toEqual({ ok: true, detail: "claude plugin update opum-lore@opum --scope local" });
    expect(runner.calls).toEqual([{ argv: "claude plugin update opum-lore@opum --scope local", timeoutMs: 600_000 }]);
  });

  test("codex runs the marketplace upgrade then the add, in that order", async () => {
    const runner = timedRunner();
    const outcome = await new CliAgentPluginPort(root, { runner }).update("codex", undefined);
    expect(outcome.ok).toBe(true);
    expect(runner.calls.map((call) => call.argv)).toEqual([
      "codex plugin marketplace upgrade opum",
      "codex plugin add opum-lore@opum",
    ]);
  });

  test("a failing first step stops the run and reports the step, its exit code and one line of its stderr", async () => {
    const runner = timedRunner([{ exitCode: 3, stdout: "", stderr: "fatal: could not fetch\n\u001b[31mred\u001b[0m" }]);
    const outcome = await new CliAgentPluginPort(root, { runner }).update("codex", undefined);
    expect(runner.calls).toHaveLength(1);
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toStartWith("codex plugin marketplace upgrade opum exited 3: fatal: could not fetch");
    expect(outcome.detail).not.toContain("\n");
    expect(outcome.detail).not.toContain("\u001b");
  });

  test("LORE_AGENT_PLUGINS_UPDATE_TIMEOUT_MS sets the update budget, and the listing budget does not", async () => {
    const runner = timedRunner();
    const port = createAgentPluginPort(root, {
      env: { LORE_AGENT_PLUGINS_TIMEOUT_MS: "700", LORE_AGENT_PLUGINS_UPDATE_TIMEOUT_MS: "90000" },
      runner,
    });
    await port.list("claude");
    await port.update("claude", "user");
    expect(runner.calls.map((call) => call.timeoutMs)).toEqual([700, 90_000]);
  });

  test("the disabled port's update runs nothing", async () => {
    const runner = timedRunner();
    const port = createAgentPluginPort(root, { env: { LORE_AGENT_PLUGINS: "off" }, runner });
    expect(await port.update("claude", "user")).toEqual({
      ok: false,
      detail: "plugin detection is off (LORE_AGENT_PLUGINS=off).",
    });
    expect(runner.calls).toEqual([]);
  });
});

// ---- Runtime-supplied text on --plain (review finding 2) --------------------------------------

describe("runtime-supplied text cannot inject ANSI or forge a --plain record", () => {
  const HOSTILE = "\x1b[31mboom\x1b[0m\nup-to-date FORGED.md\r\n\x07tail";

  /** `lore agents --check --plain` through the REAL adapter, with a runtime answering `result`. */
  async function plainCheck(result: PluginCommandResult): Promise<string> {
    await seedBridges();
    const port = new CliAgentPluginPort(root, { runner: recordedRunner({ claude: result }) });
    const { text } = await agentsCheck(port, PLAIN_CTX);
    return text;
  }

  function assertClean(text: string): void {
    expect(text).not.toContain("\x1b");
    expect(text).not.toContain("\x07");
    expect(text).not.toContain("\r");
    // The forged record must not stand as a line of its own.
    expect(text.split("\n")).not.toContain("up-to-date FORGED.md");
  }

  test("stderr of a failing runtime: ESC, BEL and line breaks never reach --plain stdout", async () => {
    const text = await plainCheck({ exitCode: 1, stdout: "", stderr: HOSTILE });
    assertClean(text);
    expect(text.split("\n")).toContain(
      "plugin-claude-reason claude plugin list exited 1: boom up-to-date FORGED.md tail",
    );
  });

  test("version and scope from the listing are reduced to one printable line, and a hostile scope is never put in a command", async () => {
    const text = await plainCheck(listed([claudeRow({ version: HOSTILE, scope: "user\n; rm -rf ~" })]));
    assertClean(text);
    expect(text).not.toContain("--scope user");
    const plugin = text.split("\n").find((line) => line.startsWith("plugin-claude "));
    expect(plugin).toBe("plugin-claude installed opum-lore@opum scope=user ; rm -rf ~");
    expect(text.split("\n")).toContain("plugin-claude-remedy claude plugin update opum-lore@opum");
  });

  test("a port's own reason is sanitized too (core boundary, not only the CLI adapter)", async () => {
    await seedBridges();
    const { data } = await agentsCheck(fakePort({ claude: { kind: "unavailable", reason: HOSTILE } }));
    expect(data?.plugins?.claude?.reason).toBe("boom up-to-date FORGED.md tail");
  });
});

// ---- lore init --------------------------------------------------------------------------------

async function init(args: string[], port: AgentPluginPort): Promise<{ code: number; data: InitResult }> {
  const stdout = capture();
  const code = await runInit({
    root,
    output: JSON_CTX,
    stdout,
    stderr: capture(),
    args: [...args, "--no-tracker", "--allow-no-git"],
    agentPlugins: port,
  });
  return { code, data: JSON.parse(stdout.text()).data as InitResult };
}

describe("lore init reports data.plugins.<runtime>", () => {
  test("--claude --codex: one entry per selected runtime, each detected BEFORE any bridge file was written", async () => {
    const seenBeforeWrite: Record<string, boolean> = {};
    const port = fakePort(
      {
        claude: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: true, version: "0.9.0", scope: "user" }] },
        codex: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: false }] },
      },
      (runtime) => {
        seenBeforeWrite[runtime] =
          !existsSync(join(root, ".claude", "skills", "lore", "SKILL.md")) &&
          !existsSync(join(root, "CLAUDE.md")) &&
          !existsSync(join(root, ".codex", "skills", "lore", "SKILL.md")) &&
          !existsSync(join(root, "AGENTS.md"));
      },
    );
    const { code, data } = await init(["--claude", "--codex"], port);
    expect(code).toBe(EXIT_OK);
    expect(data.plugins).toEqual({
      claude: {
        runtime: "claude",
        id: "opum-lore@opum",
        state: "installed",
        version: "0.9.0",
        scope: "user",
        remedy: "claude plugin update opum-lore@opum --scope user",
      },
      codex: {
        runtime: "codex",
        id: "opum-lore@opum",
        state: "disabled",
        remedy:
          'set enabled = true under [plugins."opum-lore@opum"] in $CODEX_HOME/config.toml (default ~/.codex/config.toml)',
      },
    });
    expect(seenBeforeWrite).toEqual({ claude: true, codex: true });
    // The bridges were still written afterwards: detection reports, it does not gate.
    expect(existsSync(join(root, ".claude", "skills", "lore", "SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  });

  test("--agents is the same Claude selection as --claude", async () => {
    const port = fakePort({ claude: { kind: "listed", plugins: [] } });
    const { data } = await init(["--agents"], port);
    expect(Object.keys(data.plugins ?? {})).toEqual(["claude"]);
    expect(data.plugins?.claude?.state).toBe("not-installed");
  });

  test("no exit-code change: a not-detectable runtime still exits 0", async () => {
    const port = fakePort({ codex: { kind: "unavailable", reason: "codex was not found on PATH." } });
    const { code, data } = await init(["--codex"], port);
    expect(code).toBe(EXIT_OK);
    expect(data.plugins?.codex).toMatchObject({ state: "not-detectable", reason: "codex was not found on PATH." });
  });

  test("no Claude or Codex selection: no plugins field, and no runtime asked", async () => {
    for (const args of [[], ["--hermes"], ["--antigravity"]]) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root);
      const port = fakePort({});
      const { data } = await init(args, port);
      expect(data).not.toHaveProperty("plugins");
      expect(port.calls).toEqual([]);
    }
  });

  test("--plain renders the plugin lines after the bridge lines", async () => {
    const port = fakePort({ claude: { kind: "listed", plugins: [] } });
    const stdout = capture();
    await runInit({
      root,
      output: PLAIN_CTX,
      stdout,
      stderr: capture(),
      args: ["--claude", "--no-tracker", "--allow-no-git"],
      agentPlugins: port,
    });
    const lines = stdout.text().split("\n");
    expect(lines.filter((line) => line.startsWith("plugin-"))).toEqual([
      "plugin-claude not-installed opum-lore@opum",
      "plugin-claude-remedy claude plugin marketplace add opum-ai/opum-marketplace && claude plugin install opum-lore@opum",
    ]);
    expect(lines.findIndex((line) => line.startsWith("plugin-"))).toBeGreaterThan(
      lines.findIndex((line) => line.startsWith("agents-")),
    );
  });
});

// ---- The real CLI in a subprocess, against fake runtime binaries -------------------------------

const CLI_ENTRY = resolve(import.meta.dir, "..", "src", "cli.ts");

describe.skipIf(onWindows)("subprocess: the real lore against fake claude/codex on PATH", () => {
  let bin: string;
  let log: string;

  beforeEach(() => {
    bin = join(root, ".fake-bin");
    log = join(root, ".fake-calls.log");
    mkdirSync(bin);
  });

  /** A fake runtime: `plugin list --json` prints `listing`; every invocation is appended to the log. */
  function fake(runtime: AgentRuntime, listing: unknown, body?: string): void {
    const listingFile = join(bin, `${runtime}.listing`);
    writeFileSync(listingFile, JSON.stringify(listing));
    const script =
      body ??
      `#!/bin/sh\necho "${runtime} $*" >> "${log}"\nif [ "$1 $2 $3" = "plugin list --json" ]; then cat "${listingFile}"; fi\n`;
    writeFileSync(join(bin, runtime), script);
    chmodSync(join(bin, runtime), 0o755);
  }

  function calls(): string[] {
    return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
  }

  /** `bun src/cli.ts <args>` with a PATH holding only the fakes and the system directories. */
  async function lore(
    args: readonly string[],
    off: boolean,
    extraEnv: Record<string, string> = {},
  ): Promise<{ code: number; data: Record<string, unknown>; elapsedMs: number }> {
    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      NO_COLOR: "1",
      ...extraEnv,
    };
    if (off) env.LORE_AGENT_PLUGINS = "off";
    else delete env.LORE_AGENT_PLUGINS;
    const started = Date.now();
    const child = Bun.spawn([process.execPath, CLI_ENTRY, ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
    // `stdout` is read to EOF alongside `exited`, so `elapsedMs` is when the lore PROCESS was gone,
    // not when its report was printed — the two differ by exactly the defect review finding 1 names.
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, data: JSON.parse(stdout).data, elapsedMs: Date.now() - started };
  }

  function alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  test("LORE_AGENT_PLUGINS=off starts no runtime process at all, for init or --check", async () => {
    fake("claude", [claudeRow({})]);
    fake("codex", { installed: [codexRow({})], available: [] });
    const initRun = await lore(["init", "--claude", "--codex", "--no-tracker", "--allow-no-git", "--json"], true);
    expect(initRun.code).toBe(EXIT_OK);
    const plugins = initRun.data.plugins as AgentPluginChecks;
    expect([plugins.claude?.state, plugins.codex?.state]).toEqual(["not-detectable", "not-detectable"]);
    const checkRun = await lore(["agents", "--check", "--json"], true);
    expect((checkRun.data.plugins as AgentPluginChecks).claude?.state).toBe("not-detectable");
    expect(checkRun.data).not.toHaveProperty("plugin");
    expect(calls()).toEqual([]);
  });

  test("positive control: without the switch, the same fakes ARE started, for the list command only", async () => {
    fake("claude", [claudeRow({ enabled: false })]);
    fake("codex", { installed: [codexRow({})], available: [] });
    const initRun = await lore(["init", "--claude", "--codex", "--no-tracker", "--allow-no-git", "--json"], false);
    expect(initRun.code).toBe(EXIT_OK);
    const plugins = initRun.data.plugins as AgentPluginChecks;
    expect([plugins.claude?.state, plugins.codex?.state]).toEqual(["disabled", "installed"]);
    const checkRun = await lore(["agents", "--check", "--json"], false);
    expect(checkRun.code).toBe(EXIT_OK);
    expect((checkRun.data.plugins as AgentPluginChecks).claude?.state).toBe("disabled");
    expect(checkRun.data).not.toHaveProperty("plugin");
    expect(calls().sort()).toEqual([
      "claude plugin list --json",
      "claude plugin list --json",
      "codex plugin list --json",
      "codex plugin list --json",
    ]);
  });

  // ---- LCLI-593: the update path, driven through the stubs. Never the real claude or codex. ----

  const LIST_CLAUDE = "claude plugin list --json";
  const LIST_CODEX = "codex plugin list --json";

  test("--target claude --force runs `claude plugin update ... --scope <deciding scope>` through the stub, and reports it", async () => {
    fake("claude", [claudeRow({ scope: "user" })]);
    const run = await lore(["agents", "--target", "claude", "--force", "--json"], false);
    expect(run.code).toBe(EXIT_OK);
    expect(calls()).toEqual([LIST_CLAUDE, "claude plugin update opum-lore@opum --scope user"]);
    expect(run.data.plugin).toMatchObject({ runtime: "claude", state: "installed", update: "ran", updateOk: true });
    expect(run.data).not.toHaveProperty("plugins");
  });

  test("--target codex --force runs the marketplace upgrade then the add, and its output names the all-opum-plugins refresh", async () => {
    fake("codex", { installed: [codexRow({})], available: [] });
    const run = await lore(["agents", "--target", "codex", "--force", "--json"], false);
    expect(run.code).toBe(EXIT_OK);
    expect(calls()).toEqual([LIST_CODEX, "codex plugin marketplace upgrade opum", "codex plugin add opum-lore@opum"]);
    const plugin = run.data.plugin as { update?: string; updateOk?: boolean; updateDetail?: string };
    expect([plugin.update, plugin.updateOk]).toEqual(["ran", true]);
    expect(plugin.updateDetail).toContain("refreshes every opum plugin installed in Codex");
  });

  test("a stub whose update fails: exit 0, updateOk false, the failure named, and the command kept as the remedy", async () => {
    const listing = join(bin, "claude.stub-listing");
    writeFileSync(listing, JSON.stringify([claudeRow({ scope: "user" })]));
    fake(
      "claude",
      [],
      `#!/bin/sh\necho "claude $*" >> "${log}"\nif [ "$1 $2" = "plugin list" ]; then cat "${listing}"; exit 0; fi\necho "update refused" >&2\nexit 1\n`,
    );
    const run = await lore(["agents", "--target", "claude", "--force", "--json"], false);
    expect(run.code).toBe(EXIT_OK);
    expect(run.data.plugin).toMatchObject({
      update: "ran",
      updateOk: false,
      updateDetail: "claude plugin update opum-lore@opum --scope user exited 1: update refused",
      remedy: "claude plugin update opum-lore@opum --scope user",
    });
  });

  test("a bare `lore agents --force` starts the list commands only, never an update, for both installed runtimes", async () => {
    fake("claude", [claudeRow({})]);
    fake("codex", { installed: [codexRow({})], available: [] });
    // Seed both bridges with detection off, so the log starts empty for the run under test.
    expect((await lore(["init", "--claude", "--codex", "--no-tracker", "--allow-no-git", "--json"], true)).code).toBe(
      EXIT_OK,
    );
    expect(calls()).toEqual([]);
    const run = await lore(["agents", "--force", "--json"], false);
    expect(run.code).toBe(EXIT_OK);
    expect(calls().sort()).toEqual([LIST_CLAUDE, LIST_CODEX]);
    const plugins = run.data.plugins as Record<string, { state: string; update: string }>;
    expect([plugins.claude?.state, plugins.claude?.update]).toEqual(["installed", "not-run"]);
    expect([plugins.codex?.state, plugins.codex?.update]).toEqual(["installed", "not-run"]);
    expect(run.data).not.toHaveProperty("plugin");
  });

  test("a disabled plugin under --target --force: only the list command runs, nothing enables or updates it", async () => {
    fake("claude", [claudeRow({ enabled: false })]);
    fake("codex", { installed: [codexRow({ enabled: false })], available: [] });
    const claudeRun = await lore(["agents", "--target", "claude", "--force", "--json"], false);
    const codexRun = await lore(["agents", "--target", "codex", "--force", "--json"], false);
    expect(calls()).toEqual([LIST_CLAUDE, LIST_CODEX]);
    expect(claudeRun.data.plugin).toMatchObject({
      state: "disabled",
      update: "not-run",
      remedy: "claude plugin enable opum-lore@opum --scope user",
    });
    expect(codexRun.data.plugin).toMatchObject({ state: "disabled", update: "not-run" });
  });

  test("LORE_AGENT_PLUGINS=off: --target <runtime> --force starts no runtime process at all", async () => {
    fake("claude", [claudeRow({})]);
    fake("codex", { installed: [codexRow({})], available: [] });
    for (const runtime of ["claude", "codex"]) {
      const run = await lore(["agents", "--target", runtime, "--force", "--json"], true);
      expect(run.code).toBe(EXIT_OK);
      expect(run.data.plugin).toMatchObject({ runtime, state: "not-detectable", update: "not-run" });
    }
    expect(calls()).toEqual([]);
  });

  test("the update deadline is its own budget, and bounds the lore process even when a grandchild holds the pipes", async () => {
    const listing = join(bin, "claude.stub-listing");
    const pidFile = join(root, ".update-grandchild.pid");
    writeFileSync(listing, JSON.stringify([claudeRow({ scope: "user" })]));
    fake(
      "claude",
      [],
      `#!/bin/sh\nif [ "$1 $2" = "plugin list" ]; then cat "${listing}"; exit 0; fi\ntrap '' TERM\nsleep 12 &\necho $! > "${pidFile}"\nsleep 12\n`,
    );
    const run = await lore(["agents", "--target", "claude", "--force", "--json"], false, {
      LORE_AGENT_PLUGINS_UPDATE_TIMEOUT_MS: "500",
    });
    expect(run.code).toBe(EXIT_OK);
    expect(run.data.plugin).toMatchObject({
      update: "ran",
      updateOk: false,
      updateDetail: "claude plugin update opum-lore@opum --scope user did not finish within 0.5s.",
    });
    expect(run.elapsedMs).toBeLessThan(6000);
    await Bun.sleep(200);
    expect(alive(Number(readFileSync(pidFile, "utf8").trim()))).toBe(false);
  }, 30_000);

  test("a runtime missing from PATH is not-detectable with its reason", async () => {
    const check = await new CliAgentPluginPort(root, { env: { PATH: bin } }).list("claude");
    expect(check).toEqual({ kind: "unavailable", reason: "claude was not found on PATH." });
  });

  test("a runtime whose grandchild holds stdout and which ignores TERM returns at the deadline", async () => {
    fake("claude", [], `#!/bin/sh\ntrap '' TERM\nsleep 30 &\nsleep 30\n`);
    const started = Date.now();
    const listing = await new CliAgentPluginPort(root, {
      env: { PATH: `${bin}:/usr/bin:/bin` },
      listTimeoutMs: 500,
    }).list("claude");
    expect(listing).toEqual({ kind: "unavailable", reason: "claude plugin list --json did not finish within 0.5s." });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test("review finding 1: the deadline bounds when the lore PROCESS exits, and the grandchild holding its pipes is reaped", async () => {
    // A runtime that ignores TERM and leaves a grandchild holding stdout/stderr for 12s. Before the
    // fix lore printed its report at the deadline and then stayed alive until the grandchild exited.
    const pidFile = join(root, ".grandchild.pid");
    fake("claude", [], `#!/bin/sh\ntrap '' TERM\nsleep 12 &\necho $! > "${pidFile}"\nsleep 12\n`);
    const run = await lore(["agents", "--check", "--json"], false, { LORE_AGENT_PLUGINS_TIMEOUT_MS: "500" });
    const claude = (run.data.plugins as AgentPluginChecks).claude;
    expect(claude?.state).toBe("not-detectable");
    expect(claude?.reason).toBe("claude plugin list --json did not finish within 0.5s.");
    // 0.5s deadline plus bun's own start-up; nowhere near the 12s the grandchild would hold it.
    expect(run.elapsedMs).toBeLessThan(6000);
    const grandchild = Number(readFileSync(pidFile, "utf8").trim());
    expect(grandchild).toBeGreaterThan(0);
    await Bun.sleep(200);
    expect(alive(grandchild)).toBe(false);
  }, 30_000);

  test("output past the cap is not-detectable and is not held in memory", async () => {
    // Streams ~2 MiB of `[` and then keeps going; the cap stops the read and kills the group.
    fake("claude", [], `#!/bin/sh\nyes '[' | head -c 2200000\nsleep 12\n`);
    const started = Date.now();
    const listing = await new CliAgentPluginPort(root, { env: { PATH: `${bin}:/usr/bin:/bin` } }).list("claude");
    expect(listing).toEqual({
      kind: "unavailable",
      reason: "claude plugin list --json printed more than 1048576 bytes.",
    });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
