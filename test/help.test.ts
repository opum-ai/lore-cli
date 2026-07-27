import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { run } from "../src/cli";
import { type HelpOptions, renderTopLevelHelp, runHelp } from "../src/commands/help";
import { LORE_COMMANDS } from "../src/core/agent-bridge";
import { buildManifest, findManifestCommand, type Manifest, manifestCommandNames } from "../src/core/manifest";
import { EXIT_CODES, EXIT_OK, EXIT_UNCAUGHT } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

/** Run `help` in JSON mode and return the parsed manifest `data` plus the exit code. */
function helpJson(args: string[], options?: Partial<HelpOptions>): { code: number; data: Manifest } {
  const stdout = capture();
  const code = runHelp({ output: JSON_CTX, args, stdout, ...options });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: Manifest };
  expect(envelope.kind).toBe("help.manifest");
  return { code, data: envelope.data };
}

describe("core/manifest — shape and invariants", () => {
  test("buildManifest carries the version, taxonomy, global flags, and commands", () => {
    const m = buildManifest();
    expect(m.schemaVersion).toBe(1);
    expect(m.commands.length).toBeGreaterThan(0);
    expect(m.globalFlags.map((f) => f.name)).toEqual(["json", "plain", "version", "help"]);
  });

  test("the exit-code taxonomy is sourced from errors.ts, so it cannot drift", () => {
    const tax = buildManifest().exitCodes;
    expect(tax.ok).toBe(EXIT_OK);
    expect(tax.uncaught).toBe(EXIT_UNCAUGHT);
    for (const [name, code] of Object.entries(EXIT_CODES)) {
      expect(tax[name]).toBe(code);
    }
  });

  test("every command name is unique", () => {
    const names = manifestCommandNames();
    expect(new Set(names).size).toBe(names.length);
  });

  test("every command has a non-empty kind, at least one example, and exit code 0", () => {
    for (const command of buildManifest().commands) {
      expect(command.kind.length).toBeGreaterThan(0);
      expect(command.examples.length).toBeGreaterThan(0);
      expect(command.exitCodes).toContain(0);
    }
  });

  test("every per-command exit code is one of the taxonomy's codes", () => {
    const valid = new Set(Object.values(buildManifest().exitCodes)); // {0,1,2,3,4,5,6}
    for (const command of buildManifest().commands) {
      for (const code of command.exitCodes) {
        expect(valid.has(code)).toBe(true);
      }
    }
  });

  test("each command's exitCodes match the call-chain-traced golden set", () => {
    // The golden set is transcribed from an authoritative trace of each command's
    // runX call chain against the shared seams (loadBundle/readSource/loadProfile/
    // fswrite/adapter/git). It is INDEPENDENT of manifest.ts's seam derivation, so a
    // mis-declared seam (the recurring under/over-reporting bug) fails here.
    const golden: Record<string, number[]> = {
      init: [0, 2, 4, 5, 6],
      new: [0, 2, 3, 4, 5, 6],
      validate: [0, 2, 3, 4, 6],
      check: [0, 2, 3, 4, 6],
      replace: [0, 2, 3, 4, 5], // no 6: rewrites raw bytes, never parses frontmatter
      rename: [0, 2, 3, 4, 5, 6],
      supersede: [0, 2, 3, 4, 5, 6],
      link: [0, 2, 3, 4, 5, 6],
      unlink: [0, 2, 3, 4, 5, 6],
      sync: [0, 2, 3, 4, 5, 6],
      tasks: [0, 2, 3, 4, 6], // bundle (3/4/6) + backlog (3/6); no write seam → no 5
      orphans: [0, 2, 3, 4, 6], // same seams as tasks: bundle + backlog; a report, not a gate
      schema: [0, 2, 4, 5, 6], // no 3: no read seam / no id lookup
      scaffold: [0, 2, 4, 5, 6], // profile (6) + write (4/5); no 3: no read seam / no id lookup
      graph: [0, 2, 3, 4, 6],
      export: [0, 2, 3, 4, 6],
      query: [0, 2, 3, 4, 6],
      context: [0, 2, 3, 4, 6],
      instructions: [0, 2, 3],
      agents: [0, 2, 4, 5, 6], // no 3: readFileIfPresent maps ENOENT→undefined
      help: [0, 2, 3],
    };
    expect(Object.keys(golden).sort()).toEqual([...manifestCommandNames()].sort());
    for (const command of buildManifest().commands) {
      // Key by name so a mismatch names the offending command in the failure output.
      expect({ [command.name]: [...command.exitCodes] }).toEqual({ [command.name]: golden[command.name] as number[] });
    }
  });

  test("each command's declared kind matches the live handler's emitted kind (golden cross-check)", () => {
    // The golden set is transcribed directly from each command handler's own `kind: "…"`
    // literal (e.g. src/commands/check.ts's `kind: "check.report"`, src/commands/link.ts's
    // `reportRenderable("link.result", …)` call site). It is INDEPENDENT of manifest.ts's
    // `kind` field — mirroring the exitCodes golden cross-check above — so a manifest entry
    // hand-edited (or left stale) to a `kind` the handler doesn't actually emit fails here,
    // where test/help.test.ts:45-51 only ever checked `kind.length > 0`.
    const golden: Record<string, string> = {
      init: "init",
      new: "new",
      validate: "validate.report",
      check: "check.report",
      replace: "replace.result",
      rename: "rename.result",
      supersede: "supersede.result",
      link: "link.result",
      unlink: "unlink.result",
      sync: "sync.result",
      tasks: "tasks.rollup",
      orphans: "orphans.report",
      schema: "schema.result",
      scaffold: "scaffold.result",
      graph: "graph.export",
      export: "projection.export",
      query: "query.results",
      context: "context.export",
      instructions: "instructions.text",
      agents: "agents.result",
      help: "help.manifest",
    };
    expect(Object.keys(golden).sort()).toEqual([...manifestCommandNames()].sort());
    for (const command of buildManifest().commands) {
      // Key by name so a mismatch names the offending command in the failure output.
      expect({ [command.name]: command.kind }).toEqual({ [command.name]: golden[command.name] as string });
    }
  });

  test("--json is universally available (self-describing per entry)", () => {
    for (const command of buildManifest().commands) {
      expect(command.json).toBe(true);
    }
  });
});

describe("core/manifest — deep immutability (LORE-220 AC#1/#2)", () => {
  // These tests exercise the exact hazard the task describes: a type-bypassing
  // (`as any`) or plain-JS consumer mutating the singleton the `readonly` TS
  // modifiers alone can't stop. `bun test` runs ESM, which is strict-mode by
  // default, so a mutation on a frozen object throws a TypeError rather than
  // silently no-op'ing.

  test("mutating the top-level envelope throws and leaves it unaffected", () => {
    const m = buildManifest();
    expect(() => {
      (m as unknown as { schemaVersion: number }).schemaVersion = 999;
    }).toThrow(TypeError);
    expect(m.schemaVersion).toBe(1);
  });

  test("pushing onto the commands array throws and leaves the array unaffected", () => {
    const m = buildManifest();
    const before = m.commands.length;
    expect(() => {
      (m.commands as unknown[]).push({ ...m.commands[0] });
    }).toThrow(TypeError);
    expect(m.commands.length).toBe(before);
  });

  test("reassigning a command's kind throws and leaves it unaffected", () => {
    const m = buildManifest();
    const command = m.commands.find((c) => c.name === "new");
    expect(command).toBeDefined();
    expect(() => {
      (command as unknown as { kind: string }).kind = "poisoned";
    }).toThrow(TypeError);
    expect(command?.kind).toBe("new");
  });

  test("mutating a command's flags array/entry throws and leaves it unaffected", () => {
    const m = buildManifest();
    const command = m.commands.find((c) => c.name === "new");
    expect(command?.flags.length).toBeGreaterThan(0);
    const flagsBefore = command?.flags.length;
    expect(() => {
      (command?.flags as unknown[] | undefined)?.push({ name: "bogus", takesValue: false, summary: "x" });
    }).toThrow(TypeError);
    expect(command?.flags.length).toBe(flagsBefore);

    const flag = command?.flags[0];
    expect(() => {
      (flag as unknown as { name: string }).name = "poisoned";
    }).toThrow(TypeError);
    expect(flag?.name).not.toBe("poisoned");
  });

  test("mutating globalFlags array/entry throws and leaves it unaffected", () => {
    const m = buildManifest();
    const before = m.globalFlags.length;
    expect(() => {
      (m.globalFlags as unknown[]).push({ name: "bogus", takesValue: false, summary: "x" });
    }).toThrow(TypeError);
    expect(m.globalFlags.length).toBe(before);

    const flag = m.globalFlags[0];
    expect(() => {
      (flag as unknown as { takesValue: boolean }).takesValue = true;
    }).toThrow(TypeError);
    expect(flag?.takesValue).toBe(false);
  });

  test("a mutation attempt on one buildManifest() call cannot poison a subsequent call", () => {
    const first = buildManifest();
    expect(() => {
      (first.commands as unknown[]).push({ ...first.commands[0], name: "poisoned" });
    }).toThrow(TypeError);
    expect(() => {
      (first.commands[0] as unknown as { kind: string }).kind = "poisoned";
    }).toThrow(TypeError);

    const second = buildManifest();
    expect(second.commands.map((c) => c.name)).toEqual(manifestCommandNames() as string[]);
    expect(second.commands.find((c) => c.name === first.commands[0]?.name)?.kind).toBe(first.commands[0]?.kind);
    expect(second.commands.some((c) => c.name === "poisoned")).toBe(false);
  });
});

describe("core/manifest — additive-only contract (AC#2)", () => {
  test("the manifest carries its required top-level keys", () => {
    const keys = Object.keys(buildManifest());
    for (const required of ["schemaVersion", "exitCodes", "globalFlags", "commands"]) {
      expect(keys).toContain(required);
    }
  });

  test("every command entry carries its required keys", () => {
    for (const command of buildManifest().commands) {
      const keys = Object.keys(command);
      for (const required of ["name", "summary", "args", "flags", "json", "kind", "exitCodes", "examples"]) {
        expect(keys).toContain(required);
      }
    }
  });
});

describe("manifest ⇔ router — bidirectional lockstep guard", () => {
  function argv(...args: string[]): string[] {
    return ["bun", "lore", ...args];
  }

  test("forward: every manifest command is a real dispatch case", () => {
    // A bogus flag on a real command is an "unknown option"; only a command the
    // router does not dispatch produces "unknown command". So no advertised
    // command may ever trigger that message (the LORE-37 phantom-command trap).
    for (const name of manifestCommandNames()) {
      const stdout = capture();
      const stderr = capture();
      run(argv(name, "--zzz-not-a-flag"), { stdout, stderr, isTTY: false, env: {} });
      expect(stderr.text()).not.toContain("unknown command");
    }
  });

  test("reverse: every dispatch case in cli.ts appears in the manifest", () => {
    // Grounded in the router source, scoped to the `switch (parsed.command)` block
    // (so an unrelated switch/case elsewhere in cli.ts can't pollute the set): a
    // command added to the router but omitted from the manifest fails here.
    const source = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
    const switchStart = source.indexOf("switch (parsed.command)");
    const dispatchBlock = source.slice(switchStart, source.indexOf("default:", switchStart));
    // Capture the full quoted token (not just [a-z]+) so a hyphenated/digit command can't slip the guard.
    const dispatched = [...dispatchBlock.matchAll(/case "([^"]+)":/g)].map((m) => m[1] as string);
    expect(dispatched.length).toBeGreaterThan(10); // sanity: the switch block was located and parsed
    // Order-sensitive: pins both membership AND the "in cli.ts dispatch order" claim the manifest makes,
    // which the hand-ordered self-contained array no longer guarantees mechanically.
    expect([...manifestCommandNames()]).toEqual(dispatched);
  });

  test("each command's summary is sourced from LORE_COMMANDS (no re-transcription drift)", () => {
    // The manifest derives name+summary from LORE_COMMANDS rather than re-declaring
    // them, so the SKILL.md and `lore help` catalogs can't drift; guard that here.
    for (const command of LORE_COMMANDS) {
      expect(findManifestCommand(command.name)?.summary).toBe(command.summary);
    }
  });
});

describe("runHelp — command resolution", () => {
  test("no args emits the full manifest", () => {
    const { code, data } = helpJson([]);
    expect(code).toBe(0);
    expect(data.commands.map((c) => c.name)).toEqual(manifestCommandNames() as string[]);
  });

  test("a command positional scopes the manifest to that one command, keeping the full shape", () => {
    const { code, data } = helpJson(["new"]);
    expect(code).toBe(0);
    expect(data.commands.map((c) => c.name)).toEqual(["new"]);
    // Same envelope shape as the full manifest, so `lore help <cmd> --json` and `lore help --json` parse identically.
    expect(data.schemaVersion).toBe(1);
    expect(data.exitCodes.ok).toBe(0);
    expect(data.globalFlags.length).toBeGreaterThan(0);
  });

  test("an unknown command is a not_found error whose hint lists valid names", () => {
    const err = expectError("not_found", () => runHelp({ output: JSON_CTX, args: ["frobnicate"] }));
    expect(err.message).toContain("frobnicate");
    expect(err.hint).toContain("init");
    expect(err.hint).toContain("help");
  });

  test("a second positional is a usage error", () => {
    expectError("usage", () => runHelp({ output: JSON_CTX, args: ["new", "extra"] }));
  });

  test("an unknown flag is a usage error", () => {
    expectError("usage", () => runHelp({ output: JSON_CTX, args: ["--bogus"] }));
  });
});

describe("runHelp — text rendering", () => {
  test("top-level --plain lists every command and the Usage header", () => {
    const stdout = capture();
    const code = runHelp({ output: PLAIN_CTX, args: [], stdout });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).not.toContain("\x1b[");
    expect(text).toContain("Usage:");
    for (const name of manifestCommandNames()) {
      expect(text).toContain(name);
    }
  });

  test("per-command --plain shows the flags, output kind, and exit codes", () => {
    const stdout = capture();
    runHelp({ output: PLAIN_CTX, args: ["query"], stdout });
    const text = stdout.text();
    expect(text).toContain("lore query");
    expect(text).toContain("--tag");
    expect(text).toContain("query.results");
    expect(text).toContain("Exit codes:");
  });

  test("renderTopLevelHelp defaults to the built manifest and names the command surface", () => {
    const text = renderTopLevelHelp();
    expect(text).toContain("Usage:");
    expect(text).toContain("help");
    expect(text).toContain(findManifestCommand("agents")?.summary as string);
  });
});

describe("cli — help wiring", () => {
  function argv(...args: string[]): string[] {
    return ["bun", "lore", ...args];
  }

  test("`lore help` runs through the router and exits 0", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("help"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(0);
    expect(stdout.text()).toContain("Usage:");
  });

  test("`lore help --json` emits the full manifest envelope through the router", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("help", "--json"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: Manifest };
    expect(envelope.kind).toBe("help.manifest");
    expect(envelope.data.commands.length).toBe(manifestCommandNames().length);
  });

  test("`lore help <bogus>` exits 3 through the router", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("help", "bogus"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(3);
  });

  test("`lore help --zzz` exits 2 through the router", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("help", "--zzz"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(2);
  });

  test("`lore help` and `lore --help` render byte-identical text (one source)", () => {
    const viaCommand = capture();
    run(argv("help"), { stdout: viaCommand, stderr: capture(), isTTY: false, env: {} });
    const viaFlag = capture();
    run(argv("--help"), { stdout: viaFlag, stderr: capture(), isTTY: false, env: {} });
    expect(viaCommand.text()).toBe(viaFlag.text());
  });

  test("`lore <command> --help` renders that command's own help, not the top-level catalog (LORE-107)", () => {
    const viaFlag = capture();
    const code = run(argv("query", "--help"), { stdout: viaFlag, stderr: capture(), isTTY: false, env: {} });
    expect(code).toBe(0);
    const viaHelpCommand = capture();
    run(argv("help", "query"), { stdout: viaHelpCommand, stderr: capture(), isTTY: false, env: {} });
    expect(viaFlag.text()).toBe(viaHelpCommand.text());
    // Guard against the regression: the generic catalog's usage line must not appear.
    expect(viaFlag.text()).not.toContain("lore <command> [options]");
    expect(viaFlag.text()).toContain("lore query");
  });

  test("`lore <command> -h` behaves the same as `lore <command> --help`", () => {
    const viaShort = capture();
    const code = run(argv("query", "-h"), { stdout: viaShort, stderr: capture(), isTTY: false, env: {} });
    expect(code).toBe(0);
    const viaLong = capture();
    run(argv("query", "--help"), { stdout: viaLong, stderr: capture(), isTTY: false, env: {} });
    expect(viaShort.text()).toBe(viaLong.text());
  });

  test("`lore --help` and `lore help` (no command token) keep rendering the top-level catalog unchanged", () => {
    const viaFlag = capture();
    run(argv("--help"), { stdout: viaFlag, stderr: capture(), isTTY: false, env: {} });
    const viaCommand = capture();
    run(argv("help"), { stdout: viaCommand, stderr: capture(), isTTY: false, env: {} });
    expect(viaFlag.text()).toContain("lore <command> [options]");
    expect(viaCommand.text()).toContain("lore <command> [options]");
  });
});
