/**
 * LCLI-592 — the opum-lore marketplace plugin check in `lore init` and `lore agents --check`.
 *
 * Binding record: opum-doc ADR "Distribute lore and quest agent skills through the plugin
 * marketplace" (main 7831fff, Amendments 1-4; rulings (a), (d), 18, 20, 22, 23, 24, 26). Parity
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

/** A fake port: answers asynchronously (the live path's shape), records calls, and runs `onList` at call time. */
function fakePort(
  listings: Partial<Record<AgentRuntime, AgentPluginListing>>,
  onList?: (runtime: AgentRuntime) => void,
): AgentPluginPort & { calls: AgentRuntime[] } {
  const calls: AgentRuntime[] = [];
  return {
    calls,
    list: async (runtime) => {
      calls.push(runtime);
      onList?.(runtime);
      return listings[runtime] ?? { kind: "listed", plugins: [] };
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

describe("lore agents --check reports data.plugin", () => {
  test("a disabled plugin is reported, and a clean bridge still exits 0", async () => {
    await seedBridges();
    const port = fakePort({
      claude: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: false, scope: "user" }] },
    });
    const { code, data } = await agentsCheck(port);
    expect(code).toBe(EXIT_OK);
    expect(data?.plugin).toEqual({
      runtime: "claude",
      id: "opum-lore@opum",
      state: "disabled",
      scope: "user",
      remedy: "claude plugin enable opum-lore@opum --scope user",
    });
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
      expect(data?.plugin?.runtime).toBe("claude");
    }
  });

  test("no mutation: --check writes nothing while detecting", async () => {
    const port = fakePort({ claude: { kind: "listed", plugins: [] } });
    await agentsCheck(port);
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
    expect(port.calls).toEqual(["claude"]);
  });

  test("a Codex-only repository reports the codex runtime", async () => {
    await seedBridges(true);
    // Remove the Claude bridge so only Codex is armed.
    rmSync(join(root, ".claude"), { recursive: true, force: true });
    rmSync(join(root, "CLAUDE.md"), { force: true });
    const port = fakePort({ codex: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: true }] } });
    const { data } = await agentsCheck(port);
    expect(data?.plugin?.runtime).toBe("codex");
    expect(data?.plugin?.state).toBe("installed");
    expect(Object.keys(data?.plugins ?? {})).toEqual(["codex"]);
    expect(port.calls).toEqual(["codex"]);
  });

  test("both bridges: data.plugins carries both runtimes and data.plugin is Claude's", async () => {
    await seedBridges(true);
    const port = fakePort({
      claude: { kind: "listed", plugins: [] },
      codex: { kind: "listed", plugins: [{ id: LORE_PLUGIN_ID, enabled: false }] },
    });
    const { data } = await agentsCheck(port);
    expect(data?.plugin?.runtime).toBe("claude");
    expect(data?.plugins?.claude?.state).toBe("not-installed");
    expect(data?.plugins?.codex?.state).toBe("disabled");
    expect(port.calls.sort()).toEqual(["claude", "codex"]);
  });

  test("a writing run (no --check) reports no plugin and asks no runtime", () => {
    const port = fakePort({});
    const stdout = capture();
    const code = runAgents({ root, output: JSON_CTX, args: [], stdout, agentPlugins: port });
    expect(code).toBe(EXIT_OK);
    expect(JSON.parse(stdout.text()).data).not.toHaveProperty("plugin");
    expect(port.calls).toEqual([]);
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
    expect(JSON.parse(stdout.text()).data.plugin.state).toBe("installed");
    expect(port.calls).toEqual(["claude"]);
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
  async function lore(args: readonly string[], off: boolean): Promise<{ code: number; data: Record<string, unknown> }> {
    const env: Record<string, string | undefined> = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, NO_COLOR: "1" };
    if (off) env.LORE_AGENT_PLUGINS = "off";
    else delete env.LORE_AGENT_PLUGINS;
    const child = Bun.spawn([process.execPath, CLI_ENTRY, ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    return { code, data: JSON.parse(stdout).data };
  }

  test("LORE_AGENT_PLUGINS=off starts no runtime process at all, for init or --check", async () => {
    fake("claude", [claudeRow({})]);
    fake("codex", { installed: [codexRow({})], available: [] });
    const initRun = await lore(["init", "--claude", "--codex", "--no-tracker", "--allow-no-git", "--json"], true);
    expect(initRun.code).toBe(EXIT_OK);
    const plugins = initRun.data.plugins as AgentPluginChecks;
    expect([plugins.claude?.state, plugins.codex?.state]).toEqual(["not-detectable", "not-detectable"]);
    const checkRun = await lore(["agents", "--check", "--json"], true);
    expect((checkRun.data.plugin as AgentPluginCheck).state).toBe("not-detectable");
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
    expect((checkRun.data.plugin as AgentPluginCheck).state).toBe("disabled");
    expect(calls().sort()).toEqual([
      "claude plugin list --json",
      "claude plugin list --json",
      "codex plugin list --json",
      "codex plugin list --json",
    ]);
  });

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
});
