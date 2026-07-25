import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coerceRealTTY, type RunContext, run } from "../src/cli";
import type { InitPrompter } from "../src/commands/init";
import { EXIT_CODES } from "../src/errors";
import { VERSION } from "../src/meta";
import { capture, fakeAdapter } from "./helpers";

/** Build an argv (`["bun", "lore", ...args]`) the way `run` slices it. */
function argv(...args: string[]): string[] {
  return ["bun", "lore", ...args];
}

/** A {@link RunContext} wired to capturing streams, non-TTY, empty env. */
function ctx(over: Partial<RunContext> = {}): RunContext & {
  stdout: ReturnType<typeof capture>;
  stderr: ReturnType<typeof capture>;
} {
  // Captures come last so they always win over `over` and the return type's
  // `stdout`/`stderr` are exactly the capturing sinks (callers only override cwd/flags).
  return { env: {}, isTTY: false, ...over, stdout: capture(), stderr: capture() };
}

describe("cli — version and help short-circuits", () => {
  test("--version prints the version and exits 0", () => {
    const c = ctx();
    expect(run(argv("--version"), c)).toBe(0);
    expect(c.stdout.text()).toBe(`${VERSION}\n`);
  });

  test("--version --json emits a parseable version envelope", () => {
    const c = ctx();
    expect(run(argv("--version", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { version: string } };
    expect(envelope.kind).toBe("version");
    expect(envelope.data.version).toBe(VERSION);
  });

  test("no command prints usage and exits 0", () => {
    const c = ctx();
    expect(run(argv(), c)).toBe(0);
    expect(c.stdout.text()).toContain("Usage:");
  });

  test("--help prints usage and exits 0", () => {
    const c = ctx();
    expect(run(argv("--help"), c)).toBe(0);
    expect(c.stdout.text()).toContain("init");
  });
});

describe("cli — usage errors (exit 2)", () => {
  test("an unknown command is a usage error", () => {
    const c = ctx();
    expect(run(argv("frobnicate"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown command");
  });

  test("an unknown option on a real command is a usage error", () => {
    // rejectUnknownFlags throws before runInit, so no scaffold touches the filesystem.
    const c = ctx();
    expect(run(argv("init", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("an unknown global flag is rejected even with no command (not swallowed)", () => {
    const c = ctx();
    expect(run(argv("--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("an unknown flag alongside --version is rejected, not swallowed", () => {
    const c = ctx();
    expect(run(argv("--version", "--bogus"), c)).toBe(EXIT_CODES.usage);
  });

  test("an unknown flag AFTER the command is not swallowed by --version", () => {
    // Regression guard: a post-command typo'd flag must still be rejected, not slip through
    // the --version short-circuit to a silent exit 0.
    const c = ctx();
    expect(run(argv("init", "--bogus", "--version"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
    expect(c.stdout.text()).toBe("");
  });

  test("an unknown flag after the command is not swallowed by --help either", () => {
    const c = ctx();
    expect(run(argv("init", "--bogus", "--help"), c)).toBe(EXIT_CODES.usage);
  });

  test("an extra positional on init is a usage error", () => {
    const c = ctx();
    expect(run(argv("init", "extra"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("takes no arguments");
  });

  test("a usage error in --json mode is a one-line error envelope on stderr", () => {
    const c = ctx();
    expect(run(argv("frobnicate", "--json"), c)).toBe(EXIT_CODES.usage);
    const envelope = JSON.parse(c.stderr.text()) as { error_type: string };
    expect(envelope.error_type).toBe("usage");
    expect(c.stdout.text()).toBe(""); // stdout stays silent on error
  });
});

describe("cli — init dispatch", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-init-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("`lore init --json` scaffolds the bundle and emits the init envelope", () => {
    const c = ctx({ cwd });
    expect(run(argv("init", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { created: string[] } };
    expect(envelope.kind).toBe("init");
    expect(envelope.data.created).toContain("docs/index.md");
    expect(existsSync(join(cwd, ".lore/schemas/reference.schema.json"))).toBe(true);
  });

  test("`lore init --` honors the POSIX end-of-options terminator and still scaffolds", () => {
    const c = ctx({ cwd });
    expect(run(argv("init", "--"), c)).toBe(0);
    expect(existsSync(join(cwd, "docs/index.md"))).toBe(true);
  });

  test("the router wires stdinIsTTY + stderrIsTTY + a fake prompter through to the wizard end-to-end (LORE-260)", async () => {
    // Proves cli.ts's own wiring (not just runInit called directly, as init.test.ts does): a bare
    // `lore init` through the REAL router, with BOTH streams TTY and an injected prompter, actually
    // engages the interactive wizard rather than the flag-driven default path. Deliberately does NOT
    // pass `--json` (review round 2, BLOCKING-1's sibling finding: a machine-readable run must never
    // prompt) — this scenario can only legitimately happen on the plain/pretty path, so the wizard's
    // engagement is proved via the async return shape and a real filesystem side effect instead of
    // parsing a JSON envelope.
    const prompter: InitPrompter = {
      confirm: async (_q, defaultValue) => defaultValue,
      choose: async (_q, _choices, defaultValue) => defaultValue,
      close: () => {},
    };
    // The wizard always runs the (advisory-only) backlog check, so a fake adapter is injected here
    // too — a real, host-dependent `backlog` subprocess must never be reachable from a unit test.
    const c = ctx({ cwd, stdinIsTTY: true, stderrIsTTY: true, prompter, adapter: fakeAdapter([], { probe: "ok" }) });
    const result = run(argv("init"), c);
    expect(result).toBeInstanceOf(Promise); // only the wizard (or an implied backlog check) returns a Promise
    expect(await result).toBe(0);
    // Every confirm/choose call above resolves to its own default; the agent-bridge question
    // defaults to "yes", so the bridge was actually applied — the strongest proof the wizard ran.
    expect(existsSync(join(cwd, ".claude/skills/lore/SKILL.md"))).toBe(true);
  });

  test("stdinIsTTY defaults to non-TTY when omitted, even with isTTY:true for stdout (independent axes)", () => {
    // ctx() always sets isTTY (stdout) per its own default; without an explicit stdinIsTTY override
    // the router must still resolve stdin as non-interactive (an injected stdout sink implies a
    // test harness, never a real terminal on any stream) — plain init, no wizard, a plain number.
    const c = ctx({ cwd });
    const result = run(argv("init", "--json"), c);
    expect(result).toBe(0); // NOT a Promise -- proves the wizard never engaged
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { interactive: boolean } };
    expect(envelope.data.interactive).toBe(false);
  });

  test("BLOCKING-1 (round 2): a TTY stdin with a non-TTY stderr never engages the wizard through the real router", () => {
    // The router's own reproduction of the exact bug confirmed live against `lore-setup.sh`'s
    // `cmd >/dev/null 2>&1` idiom: stdin stays a readable TTY, stderr is redirected. A prompter that
    // throws on any call proves the wizard is genuinely unreachable, not just answered fast.
    const forbidden: InitPrompter = {
      confirm: () => {
        throw new Error("the wizard must not run");
      },
      choose: () => {
        throw new Error("the wizard must not run");
      },
      close: () => {
        throw new Error("the wizard must not run");
      },
    };
    const c = ctx({ cwd, stdinIsTTY: true, stderrIsTTY: false, prompter: forbidden });
    const result = run(argv("init", "--json"), c);
    expect(result).toBe(0); // NOT a Promise -- the flag-free, non-interactive path
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { interactive: boolean } };
    expect(envelope.data.interactive).toBe(false);
  });

  test("BLOCKING-1's sibling (round 2): `lore init --json` never engages the wizard even with both streams TTY", () => {
    const forbidden: InitPrompter = {
      confirm: () => {
        throw new Error("the wizard must not run");
      },
      choose: () => {
        throw new Error("the wizard must not run");
      },
      close: () => {
        throw new Error("the wizard must not run");
      },
    };
    const c = ctx({ cwd, stdinIsTTY: true, stderrIsTTY: true, prompter: forbidden });
    const result = run(argv("init", "--json"), c);
    expect(result).toBe(0); // NOT a Promise -- a machine-readable run must never prompt
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { interactive: boolean } };
    expect(envelope.data.interactive).toBe(false);
  });
});

describe("cli — new dispatch", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-new-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test('`lore new <type> "<title>"` scaffolds and emits the new envelope', () => {
    const c = ctx({ cwd });
    expect(run(argv("new", "adr", "Use soft deletes", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { path: string } };
    expect(envelope.kind).toBe("new");
    expect(envelope.data.path).toBe("docs/adr/use-soft-deletes.md");
    expect(existsSync(join(cwd, "docs/adr/use-soft-deletes.md"))).toBe(true);
  });

  test("the router passes command flags (`--var`, `--summary`) through to the command", () => {
    // The global parser collects `--var owner=payments` as command args and `new` parses
    // it — a value-taking command flag the global parser does not itself understand.
    const c = ctx({ cwd });
    const tmplDir = join(cwd, ".lore/templates");
    mkdirSync(tmplDir, { recursive: true });
    writeFileSync(join(tmplDir, "reference.md"), "\n# {{title}}\n\nOwner: {{owner}}\n");
    expect(run(argv("new", "reference", "Orders", "--var", "owner=payments", "--json"), c)).toBe(0);
    expect(readFileSync(join(cwd, "docs/reference/orders.md"), "utf8")).toContain("Owner: payments");
  });

  test("an unknown flag on `new` is a usage error", () => {
    const c = ctx({ cwd });
    expect(run(argv("new", "adr", "Title", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("a missing title on `new` is a usage error", () => {
    const c = ctx({ cwd });
    expect(run(argv("new", "adr"), c)).toBe(EXIT_CODES.usage);
  });

  test("the `--` terminator is forwarded so a dash-leading title is accepted", () => {
    const c = ctx({ cwd });
    // `--json` must precede `--`; anything after the terminator is a positional (the title).
    expect(run(argv("new", "adr", "--json", "--", "-5 minute timeout"), c)).toBe(0);
    expect(existsSync(join(cwd, "docs/adr/5-minute-timeout.md"))).toBe(true);
  });
});

describe("cli — validate dispatch", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-validate-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("`lore validate` emits the validate.report envelope and exits 0 on a clean bundle", () => {
    const c = ctx({ cwd });
    expect(run(argv("init"), c)).toBe(0);
    const v = ctx({ cwd });
    expect(run(argv("validate", "--json"), v)).toBe(0);
    const envelope = JSON.parse(v.stdout.text()) as { kind: string; data: { errorCount: number } };
    expect(envelope.kind).toBe("validate.report");
    expect(envelope.data.errorCount).toBe(0);
  });

  test("`lore validate` returns exit 6 (not a thrown error) when a file has an error", () => {
    const c = ctx({ cwd });
    mkdirSync(join(cwd, "docs/adr"), { recursive: true });
    writeFileSync(join(cwd, "docs/adr/bad.md"), "---\ntype: ADR\nsummary: A short summary.\n---\n\n# X\n");
    // The report (payload) still lands on stdout; the exit code is the gate signal.
    expect(run(argv("validate", "--json"), c)).toBe(EXIT_CODES.validation);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { errorCount: number } };
    expect(envelope.kind).toBe("validate.report");
    expect(envelope.data.errorCount).toBeGreaterThan(0);
  });

  test("the router forwards `validate`'s paths and flags to the command", () => {
    const c = ctx({ cwd });
    expect(run(argv("init"), c)).toBe(0);
    const v = ctx({ cwd });
    // `--type` is a value-taking command flag the global parser forwards verbatim.
    expect(run(argv("validate", "--type", "ADR", "--json"), v)).toBe(0);
    const envelope = JSON.parse(v.stdout.text()) as { kind: string; data: { files: { type?: string }[] } };
    expect(envelope.data.files.every((f) => f.type === "ADR")).toBe(true);
  });

  test("an unknown flag on `validate` is a usage error", () => {
    const c = ctx({ cwd });
    expect(run(argv("validate", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("`lore --help` lists the validate command", () => {
    const c = ctx();
    expect(run(argv("--help"), c)).toBe(0);
    expect(c.stdout.text()).toContain("validate");
  });
});

describe("cli — option terminator and bare dash", () => {
  test("`--` ends options: a following flag-looking token is a positional, not parsed as a flag", () => {
    const c = ctx();
    // After `--`, `--version` is a positional (the command), so it is an unknown
    // command — not the version short-circuit.
    expect(run(argv("--", "--version"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown command");
    expect(c.stdout.text()).toBe(""); // not the version line
  });

  test("a bare `-` is treated as a positional (unknown command), not an unknown option", () => {
    const c = ctx();
    expect(run(argv("-"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown command");
  });
});

describe("cli — post-`--` tokens are positionals, not re-scanned flags (LORE-223)", () => {
  test("`--version <command> -- -x` still prints the version: a `-`-prefixed token after `--` is a positional", () => {
    const c = ctx();
    expect(run(argv("--version", "tasks", "--", "-x"), c)).toBe(0);
    expect(c.stdout.text()).toBe(`${VERSION}\n`);
  });

  test("`--help <command> -- -x` still renders that command's help: a `-`-prefixed token after `--` is a positional", () => {
    const c = ctx();
    expect(run(argv("--help", "tasks", "--", "-x"), c)).toBe(0);
    // Command-specific help (not the top-level catalog): has the command's own usage/flags.
    expect(c.stdout.text()).toContain("lore tasks <id>");
    expect(c.stdout.text()).toContain("--status");
    expect(c.stdout.text()).not.toContain("Commands:");
  });

  test("`init -- -bar` still errors, but classifies `-bar` as an unexpected argument, not an unknown option", () => {
    const c = ctx();
    expect(run(argv("init", "--", "-bar"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("takes no arguments");
    expect(c.stderr.text()).not.toContain("unknown option");
  });

  test("`init --json -- -bar` reports the same classification under the `--json` error envelope's `unexpected` key", () => {
    const c = ctx();
    expect(run(argv("init", "--json", "--", "-bar"), c)).toBe(EXIT_CODES.usage);
    const envelope = JSON.parse(c.stderr.text()) as { message: string; input: Record<string, unknown> };
    expect(envelope.message).toContain("takes no arguments");
    expect(envelope.input).toEqual({ command: "init", unexpected: ["-bar"] });
    expect(envelope.input.options).toBeUndefined();
  });

  test("regression guard: a stray flag BEFORE any `--` is still rejected on the version path", () => {
    const c = ctx();
    expect(run(argv("--version", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain('unknown option "--bogus"');
  });

  test("regression guard: a stray flag BEFORE any `--`, after a command, is still rejected on the version path", () => {
    const c = ctx();
    expect(run(argv("--version", "tasks", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain('unknown option "--bogus"');
  });

  test("regression guard: a stray flag BEFORE any `--` is still rejected on init as an unknown option", () => {
    const c = ctx();
    expect(run(argv("init", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain('unknown option "--bogus"');
    expect(c.stderr.text()).not.toContain("takes no arguments");
  });
});

describe("cli — stderr diagnostic color is independent of stdout's TTY state (LORE-250)", () => {
  test("AC#4: stdout TTY + non-TTY stderr + NO_COLOR unset → a reported LoreError writes no ESC byte to stderr", () => {
    const c = ctx({ isTTY: true, stderrIsTTY: false });
    expect(run(argv("frobnicate"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).not.toContain("\x1b");
    expect(c.stderr.text()).toContain("unknown command");
  });

  test("AC#5: both stdout and stderr TTYs + NO_COLOR unset → the stderr error head is still colored", () => {
    const c = ctx({ isTTY: true, stderrIsTTY: true });
    expect(run(argv("frobnicate"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("\x1b[31m"); // red error head
  });

  test("AC#2 (independence direction): stdout's own output is byte-identical regardless of stderrIsTTY — stdout's mode/color resolution never consults stderr's TTY state at all", () => {
    // The direct AC#2 claim (stdout at a TTY with NO_COLOR unset still emits color
    // to stdout) is `resolveOutput`'s pre-existing, untouched-by-LORE-250 contract
    // (see "pretty on a TTY with NO_COLOR unset enables color (§6)" in
    // output.test.ts); this end-to-end check adds the router-level guarantee that
    // varying stderrIsTTY cannot perturb stdout's bytes in either direction.
    const withTtyStderr = ctx({ isTTY: true, stderrIsTTY: true });
    const withoutTtyStderr = ctx({ isTTY: true, stderrIsTTY: false });
    expect(run(argv("--version"), withTtyStderr)).toBe(0);
    expect(run(argv("--version"), withoutTtyStderr)).toBe(0);
    expect(withTtyStderr.stdout.text()).toBe(withoutTtyStderr.stdout.text());
  });

  test("AC#3: NO_COLOR (including empty string) suppresses stderr color even with both streams at a TTY", () => {
    const c = ctx({ isTTY: true, stderrIsTTY: true, env: { NO_COLOR: "" } });
    expect(run(argv("frobnicate"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).not.toContain("\x1b");
  });

  test("omitting stderrIsTTY with an injected stderr sink defaults to non-TTY (no color leak by surprise)", () => {
    const c = ctx({ isTTY: true }); // no stderrIsTTY override; ctx() always injects a stderr sink
    expect(run(argv("frobnicate"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).not.toContain("\x1b");
  });
});

describe("cli — WarningCollector.flush through a real command honors the stderr TTY gate (LORE-250 AC#1)", () => {
  // Regression for the production leak Fable's review caught: every command's
  // `advisories.flush({ color: options.output.color, stderr })` call site reads
  // `options.output.color` directly — never `errorRenderOpts` — so this exercises
  // the router's real `dispatch()` seam end-to-end (not `errorRenderOpts`'s
  // arithmetic in isolation, which output.test.ts already covers) to prove the
  // fix lands where production code actually reads it.
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-flush-tty-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  /** Scaffold a bundle, then add a frontmatter-free file so `graph` emits a real advisory. */
  function scaffoldWithStray(): void {
    expect(run(argv("init"), ctx({ cwd }))).toBe(0);
    writeFileSync(join(cwd, "docs/stray.md"), "# Stray\n\nA plain file with no frontmatter.\n");
  }

  test("stdout TTY + non-TTY stderr + NO_COLOR unset → a real command's advisory warning writes no ESC byte to stderr", () => {
    scaffoldWithStray();
    const c = ctx({ cwd, isTTY: true, stderrIsTTY: false });
    expect(run(argv("graph"), c)).toBe(0);
    // Confirms the warning was actually emitted (not silently dropped) before asserting on its bytes.
    expect(c.stderr.text()).toContain("warning: skipping stray.md: no frontmatter mapping");
    expect(c.stderr.text()).not.toContain("\x1b");
  });

  test("both stdout and stderr TTYs + NO_COLOR unset → the same advisory warning is still colored", () => {
    scaffoldWithStray();
    const c = ctx({ cwd, isTTY: true, stderrIsTTY: true });
    expect(run(argv("graph"), c)).toBe(0);
    expect(c.stderr.text()).toContain("\x1b[33m"); // yellow "warning:" prefix
    expect(c.stderr.text()).toContain("skipping stray.md");
  });
});

describe("cli — real-process stderrIsTTY fallback coerces an absent .isTTY to false (LORE-250, round 3)", () => {
  // Round 2's fallback — `context.stderrIsTTY ?? (context.stderr ? false : process.stderr.isTTY)`
  // — leaked in the one code path no other test in this file reaches: an *uninjected*
  // context, where the real `process.stderr.isTTY` is read directly. Node/Bun leave that
  // property `undefined` (not `false`) on a non-TTY stream, and `resolveOutput`'s/
  // `errorRenderOpts`'s `?? true` back-compat defaults treat an absent value as "omitted",
  // not "false" — so the uncoerced `undefined` silently re-enabled color on a redirected
  // stderr in the shipped binary even though every test here (which always injects a
  // `stderr` capture sink via `ctx()`) stayed green. This block exercises the real,
  // uninjected path directly.

  /** Monkeypatch a stream's `.isTTY` to `value`, returning a restorer to call in `finally`. */
  function stubIsTTY(stream: NodeJS.WriteStream, value: boolean | undefined): () => void {
    const original = Object.getOwnPropertyDescriptor(stream, "isTTY");
    Object.defineProperty(stream, "isTTY", { value, configurable: true });
    return () => {
      if (original) {
        Object.defineProperty(stream, "isTTY", original);
      } else {
        delete (stream as { isTTY?: boolean }).isTTY;
      }
    };
  }

  test("coerceRealTTY: only a literal `true` reading is a TTY — an absent (undefined) or `false` reading is not", () => {
    // The unit-level guarantee the production fallback depends on: `undefined` (what
    // Node/Bun actually leave on a non-TTY `process.stderr.isTTY`) must coerce to `false`,
    // never fall through to a `?? true` default further down the pipeline.
    expect(coerceRealTTY(undefined)).toBe(false);
    expect(coerceRealTTY(false)).toBe(false);
    expect(coerceRealTTY(true)).toBe(true);
  });

  test("production leak repro: stdout TTY + stderr's real .isTTY absent (a redirected 2>) writes no ESC byte to stderr with NO injected context", () => {
    const restoreStdout = stubIsTTY(process.stdout, true);
    // `undefined` (a genuinely absent property), not `false` — this is exactly what
    // Node/Bun leave on `process.stderr.isTTY` when stderr is piped or redirected, and is
    // the reading round 2's fallback failed to coerce.
    const restoreStderr = stubIsTTY(process.stderr, undefined);
    const originalWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    // biome-ignore lint/suspicious/noExplicitAny: matching Node's overloaded WriteStream#write signature for a test-only stub.
    (process.stderr as any).write = (chunk: unknown, ...rest: unknown[]) => {
      captured += typeof chunk === "string" ? chunk : String(chunk);
      const cb = rest.find((a) => typeof a === "function") as (() => void) | undefined;
      cb?.();
      return true;
    };
    try {
      // No `context` at all: exercises `run(process.argv)`'s exact real-process seam
      // (cli.ts:429), only with a controlled `env` so a stray `NO_COLOR` in the ambient
      // test environment cannot make this test flaky in either direction.
      const code = run(argv("frobnicate"), { env: {} });
      expect(code).toBe(EXIT_CODES.usage);
      expect(captured).toContain("unknown command"); // the warning was actually emitted...
      expect(captured).not.toContain("\x1b"); // ...and carries no ANSI byte.
    } finally {
      process.stderr.write = originalWrite;
      restoreStderr();
      restoreStdout();
    }
  });

  test("production, both real TTYs: stdout TTY + stderr's real .isTTY true still colors the stderr error head", () => {
    const restoreStdout = stubIsTTY(process.stdout, true);
    const restoreStderr = stubIsTTY(process.stderr, true);
    const originalWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    // biome-ignore lint/suspicious/noExplicitAny: matching Node's overloaded WriteStream#write signature for a test-only stub.
    (process.stderr as any).write = (chunk: unknown, ...rest: unknown[]) => {
      captured += typeof chunk === "string" ? chunk : String(chunk);
      const cb = rest.find((a) => typeof a === "function") as (() => void) | undefined;
      cb?.();
      return true;
    };
    try {
      const code = run(argv("frobnicate"), { env: {} });
      expect(code).toBe(EXIT_CODES.usage);
      expect(captured).toContain("\x1b[31m"); // red error head, proving this isn't a blanket suppression
    } finally {
      process.stderr.write = originalWrite;
      restoreStderr();
      restoreStdout();
    }
  });
});

describe("cli — schema dispatch", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lore-cli-schema-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  test("`lore schema export` emits the schema.result envelope and writes schemas", () => {
    const c = ctx({ cwd });
    expect(run(argv("schema", "export", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { count: number } };
    expect(envelope.kind).toBe("schema.result");
    expect(envelope.data.count).toBe(6);
    expect(existsSync(join(cwd, ".lore/schemas/reference.schema.json"))).toBe(true);
  });

  test("the router forwards `schema`'s value flags to the command", () => {
    const c = ctx({ cwd });
    // `--type` is a value-taking command flag the global parser must forward verbatim.
    expect(run(argv("schema", "export", "--type", "ADR", "--json"), c)).toBe(0);
    const envelope = JSON.parse(c.stdout.text()) as { kind: string; data: { count: number } };
    expect(envelope.data.count).toBe(1);
  });

  test("an unknown flag on `schema` is a usage error", () => {
    const c = ctx({ cwd });
    expect(run(argv("schema", "export", "--bogus"), c)).toBe(EXIT_CODES.usage);
    expect(c.stderr.text()).toContain("unknown option");
  });

  test("`lore --help` lists the schema command", () => {
    const c = ctx();
    expect(run(argv("--help"), c)).toBe(0);
    expect(c.stdout.text()).toContain("schema");
  });
});
