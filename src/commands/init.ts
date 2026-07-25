/**
 * commands/init.ts — `lore init`: scaffold an empty, conformant OKF bundle, and fold the rest of
 * onboarding into the SAME one command (LORE-260): the Claude Code agent bridge, downstream
 * doc-site scaffolds (mkdocs/docusaurus/obsidian), and a backlog-coupling capability check —
 * replacing the old `init` → `agents` → external `lore-setup.sh` → manual Obsidian sequence.
 *
 * ## The locked design decision (2026-07-24)
 *
 * A **bare** `lore init` on an interactive terminal runs a guided wizard that asks about each
 * configurable consumer; it is **TTY-gated** — when stdin is not a TTY (CI, pipes, a test) or ANY
 * of this command's own flags is passed, it runs fully **non-interactively** with defaults and no
 * prompt can ever block it (the npm-init pattern: interactive on a bare TTY invocation, `-y`/non-TTY
 * skips prompts). Every wizard question maps 1:1 to a flag (`--agents`, `--scaffold <target>`,
 * `--obsidian`, `--no-backlog`/`--check-backlog`), so a script gets the exact same outcome as
 * answering the wizard, with zero prompts. This is documented in
 * [ADR-0017](../../docs/adr/0017-interactive-init-wizard-tty-gated.md) (an amendment to ADR-0004/
 * ADR-0005's non-interactive CLI contract).
 *
 * **The non-interactive default is UNCHANGED from before this task**: with no flags and a non-TTY
 * stdin (the automatic case for every existing caller — CI, `lore-setup.sh`, this file's own
 * pre-LORE-260 tests), `lore init` does exactly what it always did — scaffold `docs/`/`.lore/` and
 * nothing else. The agent bridge, scaffolds, and the backlog check are strictly opt-in via flags (or
 * the wizard); this is what keeps the docker e2e harness's existing bare `lore init` calls, and
 * every pre-existing unit test, byte-for-byte compatible with the prior behavior.
 *
 * The base bundle scaffold (this file's original, sole responsibility) is the thin command layer
 * over the pure {@link buildScaffold} (lore-design §2.2, §3.1): it resolves the repo root and a
 * clock, asks core for the intended bytes, and applies them to the filesystem **idempotently**.
 * The load-bearing behavior is idempotency (AC#2/AC#3): every file is created only when **absent**
 * (an atomic `wx` write, so there is no time-of-check/time-of-use race and no clobber of a user's
 * edits), and directories are `mkdir -p` (already-exists is not an error). The agent bridge and
 * scaffold steps reuse the SAME idempotent primitives `lore agents`/`lore scaffold` ship
 * ({@link applyAgentsBridge}/{@link applyScaffold}) rather than duplicating their logic, so a second
 * run of any combination of flags is a no-op wherever the first run already finished.
 *
 * The interactive wizard's TTY gate and its I/O are both **injectable** ({@link InitOptions.stdinIsTTY}
 * / {@link InitOptions.prompter}), never read from `process.stdin` at this call site — a test drives
 * the wizard path by passing `stdinIsTTY: true` plus a scripted {@link InitPrompter}, never a real
 * terminal. `runInit` itself stays a plain (non-`async`) function returning `number | Promise<number>`
 * (mirroring `commands/check.ts`'s own `runCheck`): the common, fully-synchronous path (no flags, no
 * backlog check) returns a plain number exactly as before LORE-260, and only the wizard or an
 * actually-requested backlog check return a `Promise`.
 */

import { join } from "node:path";
import * as readline from "node:readline/promises";
import type { BacklogAdapter } from "../adapters/backlog";
import { loadProfile } from "../core/profile";
import { buildScaffold } from "../core/scaffold";
import { ANSI, EXIT_OK, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { type AgentsResult, applyAgentsBridge } from "./agents";
import { usage } from "./args";
import { assertNoSymlinkInPath, createIfAbsent, ensureDir } from "./fswrite";
import { defaultAdapter } from "./link";
import { applyScaffold, TARGETS as SCAFFOLD_TARGETS, type ScaffoldResult } from "./scaffold";

/** The backlog-coupling capability check's outcome, folded into {@link InitResult} when it ran. */
export interface InitBacklogCheck {
  /** Always `true` when this field is present at all — kept explicit (vs. field presence alone) so a `--json` consumer can branch without an `in` check. */
  readonly checked: true;
  /** Whether a `--json`-capable `backlog` was found on PATH. */
  readonly capable: boolean;
  /** The reported `backlog --version`, when capable. */
  readonly version?: string;
  /** The advisory message (also written to stderr) when NOT capable. */
  readonly warning?: string;
}

/** The result of a `lore init` run: the base scaffold, plus whichever optional consumers ran. */
export interface InitResult {
  /** The repo root the bundle was initialized in. */
  root: string;
  /** Repo-relative POSIX paths created this run, in scaffold order (base OKF bundle only). */
  created: string[];
  /** Repo-relative POSIX paths that already existed and were left untouched (base OKF bundle only). */
  skipped: string[];
  /** Whether the interactive wizard ran this invocation. */
  interactive: boolean;
  /** The agent bridge's result, present iff this run set it up (wizard "yes", or `--agents`). */
  agents?: AgentsResult;
  /** One entry per downstream doc-site/vault actually scaffolded this run (wizard picks, `--scaffold`, `--obsidian`); empty when none were requested. */
  scaffolds: ScaffoldResult[];
  /** The backlog-coupling capability check's outcome, present iff it ran this invocation. */
  backlog?: InitBacklogCheck;
}

/** The interactive wizard's minimal prompt vocabulary — confirm (yes/no) and choose (one of a fixed list). Injected so the wizard is unit-testable without a real terminal. */
export interface InitPrompter {
  /** Ask a yes/no question; an empty answer (bare Enter) resolves to `defaultValue`. */
  confirm(question: string, defaultValue: boolean): Promise<boolean>;
  /** Ask the user to pick one of `choices`; an empty or unrecognized answer resolves to `defaultValue`. */
  choose(question: string, choices: readonly string[], defaultValue: string): Promise<string>;
  /** Release the prompter's I/O resources (the real implementation's `readline` interface). */
  close(): void;
}

/** Options for {@link runInit}; `root`, `clock`, the streams, the TTY gate, the prompter, and the backlog adapter are all injectable for tests. */
export interface InitOptions {
  /** The repo root to initialize. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's own tokens (everything after `init`), as split by the router. */
  args?: readonly string[];
  /** Clock seam for the root index timestamp (and a fresh scaffold's timestamp); defaults to the real wall clock. */
  clock?: () => Date;
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for the backlog-check advisory; defaults to `process.stderr`. */
  stderr?: Writer;
  /**
   * Whether STDIN is an interactive terminal — the wizard's TTY gate (AC#2). Resolved once at the
   * CLI boundary (`cli.ts`'s `run`, mirroring its own `isTTY`/`stderrIsTTY` handling) and handed in
   * here as a plain boolean; this module never reads `process.stdin.isTTY` itself. Defaults to
   * `false` (non-interactive) so an omitted value can never accidentally enable a blocking prompt —
   * the safe default for every existing caller (tests, `lore-setup.sh`, CI) that predates this flag.
   */
  stdinIsTTY?: boolean;
  /** The interactive wizard's I/O seam; defaults to a real `node:readline/promises` session over stdin/stderr. Injected in tests so the wizard never touches a real terminal. */
  prompter?: InitPrompter;
  /** The Backlog adapter for the coupling capability check; defaults to the real `backlog` binary on PATH. */
  adapter?: BacklogAdapter;
}

/** The parsed, validated `lore init` arguments. */
interface InitArgs {
  /** `--yes`: force the non-interactive path (with defaults) even on a TTY — the npm-init `-y` equivalent. */
  yes: boolean;
  /** `--agents`: also set up the Claude Code agent bridge. */
  agents: boolean;
  /** `--scaffold <target>` (repeatable) and/or `--obsidian`, deduped; targets from {@link SCAFFOLD_TARGETS}. */
  scaffolds: string[];
  /** `--no-backlog`: skip the backlog-coupling capability check entirely. */
  noBacklog: boolean;
  /** `--check-backlog`: run the backlog-coupling capability check even with no other flag requesting it. */
  checkBacklog: boolean;
}

/**
 * Run `lore init` against `options.root`: scaffold the base bundle idempotently (unchanged from
 * before LORE-260), then resolve the optional consumers — via the interactive wizard on a bare TTY
 * invocation, or from flags otherwise — apply whichever were chosen (also idempotently), render the
 * result, and return the exit code. A filesystem permission failure throws a `denied` {@link
 * LoreError}; a scaffold collision throws `conflict`; a bad flag throws `usage`; any other
 * unexpected IO error propagates to the CLI's top-level handler.
 *
 * Stays a plain (non-`async`) function, like `commands/check.ts`'s `runCheck`: the common path (no
 * flags, no implied backlog check) returns a plain `number`, so every pre-LORE-260 synchronous
 * caller — this file's own original tests, and the router's `--bogus`/positional usage-error paths —
 * is untouched. Only the wizard, or a backlog check actually requested/implied, return a `Promise`.
 */
export function runInit(options: InitOptions): number | Promise<number> {
  const parsed = parseInitArgs(options.args ?? []);
  const stdinIsTTY = options.stdinIsTTY ?? false;
  const interactive = stdinIsTTY && !anyFlagGiven(parsed);

  const clock = options.clock ?? (() => new Date());
  // Honor a pre-existing `.lore/profile.toml` so `init` scaffolds schemas for a project's custom
  // types; with none present this is the built-in story-convention profile (zero-config).
  const profile = loadProfile({ root: options.root });
  const plan = buildScaffold({ timestamp: clock().toISOString(), profile });

  for (const dir of plan.dirs) {
    // LORE-77/LORE-93: ensureDir itself refuses a pre-existing symlink at (or above) this
    // directory before its mkdirSync gets a chance to transparently walk through it.
    ensureDir(options.root, dir);
  }

  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of plan.files) {
    assertNoSymlinkInPath(options.root, file.path);
    if (createIfAbsent(join(options.root, file.path), file.contents, file.path)) {
      created.push(file.path);
    } else {
      skipped.push(file.path);
    }
  }
  const base = { root: options.root, created, skipped };

  if (interactive) {
    return runInteractiveWizard(options, base);
  }

  const scaffoldTargets = [...new Set(parsed.scaffolds)];
  const agents = parsed.agents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const scaffolds = scaffoldTargets.map((target) => applyScaffold({ root: options.root, target, force: false, clock }));

  // The backlog check is advisory-only (never fails the run) and, off-TTY/via-flags, runs only when
  // it's actually relevant: explicitly requested (`--check-backlog`), or implied by onboarding a
  // consumer that depends on the coupling (`--agents`/`--scaffold`/`--obsidian`) — unless the user
  // opted all the way out with `--no-backlog`. A completely bare `lore init` therefore never spawns
  // a `backlog` subprocess, exactly as before this task.
  const shouldCheckBacklog =
    parsed.checkBacklog || (!parsed.noBacklog && (parsed.agents || scaffoldTargets.length > 0));
  if (!shouldCheckBacklog) {
    const result: InitResult = { ...base, interactive: false, agents, scaffolds, backlog: undefined };
    emit(initRenderable(result), options.output, options.stdout);
    return EXIT_OK;
  }

  const warnings = new WarningCollector();
  return probeBacklogCapability(options, warnings).then((backlog) => {
    warnings.flush({ color: options.output.color, stderr: options.stderr ?? process.stderr });
    const result: InitResult = { ...base, interactive: false, agents, scaffolds, backlog };
    emit(initRenderable(result), options.output, options.stdout);
    return EXIT_OK;
  });
}

/**
 * The interactive wizard (AC#1): ask the three fold-in questions over the injected {@link
 * InitPrompter} (or a real `readline` session over stdin/stderr — prompts and the whole UI live on
 * **stderr**, per cli-contract §4: stdout must stay exclusively `init`'s own envelope), apply
 * whichever were chosen (idempotently, via the exact same core primitives the flag path uses), then
 * ALWAYS run the backlog-coupling detection (a fact-check, not a choice — mirrors AC#1's "detection"
 * wording, not a fourth question) before rendering the combined result.
 */
async function runInteractiveWizard(
  options: InitOptions,
  base: { root: string; created: string[]; skipped: string[] },
): Promise<number> {
  const prompter = options.prompter ?? createRealPrompter();
  const scaffoldTargets: string[] = [];
  let wantAgents: boolean;
  try {
    wantAgents = await prompter.confirm("Set up the Claude Code agent bridge (SKILL.md + CLAUDE.md nudge)?", true);
    const site = await prompter.choose("Scaffold a downstream docs site?", ["none", "mkdocs", "docusaurus"], "none");
    if (site !== "none") {
      scaffoldTargets.push(site);
    }
    const wantObsidian = await prompter.confirm("Also scaffold an Obsidian vault config (docs/.obsidian)?", false);
    if (wantObsidian) {
      scaffoldTargets.push("obsidian");
    }
  } finally {
    prompter.close();
  }

  const clock = options.clock ?? (() => new Date());
  const agents = wantAgents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const scaffolds = scaffoldTargets.map((target) => applyScaffold({ root: options.root, target, force: false, clock }));

  const warnings = new WarningCollector();
  const backlog = await probeBacklogCapability(options, warnings);
  warnings.flush({ color: options.output.color, stderr: options.stderr ?? process.stderr });

  const result: InitResult = { ...base, interactive: true, agents, scaffolds, backlog };
  emit(initRenderable(result), options.output, options.stdout);
  return EXIT_OK;
}

/** A real, interactive {@link InitPrompter} over `process.stdin`/`process.stderr` — constructed only when the wizard actually runs and no test-injected prompter was given. */
function createRealPrompter(): InitPrompter {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return {
    async confirm(question, defaultValue) {
      const suffix = defaultValue ? "Y/n" : "y/N";
      const raw = (await rl.question(`${question} [${suffix}] `)).trim().toLowerCase();
      if (raw === "") {
        return defaultValue;
      }
      return raw === "y" || raw === "yes";
    },
    async choose(question, choices, defaultValue) {
      const raw = (await rl.question(`${question} (${choices.join("/")}) [${defaultValue}] `)).trim().toLowerCase();
      return choices.includes(raw) ? raw : defaultValue;
    },
    close() {
      rl.close();
    },
  };
}

/**
 * Run the backlog-coupling capability check (AC#1/AC#4): probe the injected {@link
 * InitOptions.adapter} (defaulting to the real `backlog` binary on PATH). Never throws — a
 * missing/incapable binary is recorded as `warnings` advisory (stderr) plus the returned {@link
 * InitBacklogCheck}, never a failed `lore init` run, since the base scaffold (and any agent
 * bridge/doc-site scaffold already applied) succeeded regardless of whether Backlog.md coupling is
 * available yet.
 */
async function probeBacklogCapability(options: InitOptions, warnings: WarningCollector): Promise<InitBacklogCheck> {
  const adapter = options.adapter ?? defaultAdapter(options.root);
  try {
    const capability = await adapter.probe();
    return { checked: true, capable: true, version: capability.version };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = err instanceof LoreError ? err.hint : undefined;
    warnings.add(`backlog coupling unavailable: ${message}${hint ? ` — ${hint}` : ""}`);
    return { checked: true, capable: false, warning: message };
  }
}

/** Whether any of `lore init`'s own flags was passed — the signal that overrides a bare-TTY invocation into the non-interactive path (AC#2). */
function anyFlagGiven(parsed: InitArgs): boolean {
  return parsed.yes || parsed.agents || parsed.scaffolds.length > 0 || parsed.noBacklog || parsed.checkBacklog;
}

/**
 * Parse `init`'s tokens: no positionals (unchanged from before LORE-260 — a bare/`--`-terminated
 * positional is still a `usage` error, byte-identical wording to the router's old blanket
 * `rejectCommandArgs` guard so every pre-existing regression test keeps passing), plus the boolean
 * `--yes`/`--agents`/`--obsidian`/`--no-backlog`/`--check-backlog` and the repeatable value flag
 * `--scaffold <target>`. An unknown flag, an invalid `--scaffold` target, a stray positional, or the
 * mutually-exclusive `--no-backlog`+`--check-backlog` pair all throw a `usage` {@link LoreError}
 * (exit `2`) before any scaffold work runs.
 */
function parseInitArgs(args: readonly string[]): InitArgs {
  let yes = false;
  let agents = false;
  let noBacklog = false;
  let checkBacklog = false;
  const scaffolds: string[] = [];
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const body = arg.slice(2);
      if (body === "yes") {
        yes = true;
        continue;
      }
      if (body === "agents") {
        agents = true;
        continue;
      }
      if (body === "obsidian") {
        if (!scaffolds.includes("obsidian")) {
          scaffolds.push("obsidian");
        }
        continue;
      }
      if (body === "no-backlog") {
        noBacklog = true;
        continue;
      }
      if (body === "check-backlog") {
        checkBacklog = true;
        continue;
      }
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const inline = eq === -1 ? undefined : body.slice(eq + 1);
      if (name === "scaffold") {
        const value = readScaffoldValue(inline, args, i);
        if (inline === undefined) {
          i++;
        }
        if (!SCAFFOLD_TARGETS.has(value)) {
          throw usage(`unknown scaffold target "${value}"`, `valid targets are ${[...SCAFFOLD_TARGETS].join(", ")}`);
        }
        if (!scaffolds.includes(value)) {
          scaffolds.push(value);
        }
        continue;
      }
      throw usage(`unknown option "--${name}"`, "run `lore init --help` to list options");
    }
    if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore init --help` to list options");
    }
    positionals.push(arg);
  }

  if (positionals.length > 0) {
    // Byte-identical wording to the router's pre-LORE-260 `rejectCommandArgs` guard (cli.ts), which
    // used to reject EVERY token this command received — `lore init` still takes no positionals.
    throw usage(
      `\`lore init\` takes no arguments, got "${positionals[0]}"`,
      "run `lore init` with no positional arguments",
      { command: "init", unexpected: [...positionals] },
    );
  }
  if (noBacklog && checkBacklog) {
    throw usage(
      "--no-backlog and --check-backlog are mutually exclusive",
      "pass at most one of --no-backlog / --check-backlog",
    );
  }
  return { yes, agents, scaffolds, noBacklog, checkBacklog };
}

/** Read `--scaffold`'s value: its inline `--scaffold=value` form when present, else the next token. A missing/empty value, or a next token that looks like another flag, is a `usage` error. */
function readScaffoldValue(inline: string | undefined, args: readonly string[], i: number): string {
  if (inline !== undefined) {
    if (inline === "") {
      throw usage("--scaffold needs a value", "pass a value, e.g. `--scaffold mkdocs`");
    }
    return inline;
  }
  const next = args[i + 1];
  if (next === undefined || (next.startsWith("-") && next !== "-")) {
    throw usage("--scaffold needs a value", "pass a value, e.g. `--scaffold mkdocs`");
  }
  return next;
}

/** The per-result-type rendering bundle for `init` (output.ts dispatches on the mode). */
function initRenderable(data: InitResult): Renderable<InitResult> {
  return { kind: "init", data, pretty: renderPretty, plain: renderPlain };
}

/** Human view: the base scaffold summary, then a section per optional consumer that ran this run. */
function renderPretty(data: InitResult, opts: { color: boolean }): string {
  const head = data.created.length
    ? `Initialized lore bundle at ${data.root}`
    : `lore bundle already initialized at ${data.root} (nothing to create)`;
  const lines = [head];
  for (const path of data.created) {
    lines.push(`  ${paint("+", ANSI.green, opts.color)} ${path}`);
  }
  for (const path of data.skipped) {
    lines.push(`  ${paint(`· ${path} (exists)`, ANSI.dim, opts.color)}`);
  }
  if (data.agents) {
    lines.push("Agent bridge:");
    for (const file of data.agents.files) {
      const color = file.action === "unchanged" ? ANSI.dim : ANSI.green;
      lines.push(`  ${paint(file.action, color, opts.color)} ${file.path}`);
    }
  }
  for (const scaffold of data.scaffolds) {
    lines.push(`Scaffold (${scaffold.target}):`);
    if (scaffold.files.length === 0) {
      lines.push(`  ${paint("already up to date", ANSI.dim, opts.color)}`);
    }
    for (const file of scaffold.files) {
      lines.push(`  ${paint(file.action, ANSI.green, opts.color)} ${file.path}`);
    }
  }
  if (data.backlog) {
    lines.push(
      data.backlog.capable
        ? `backlog: --json-capable${data.backlog.version ? ` (v${data.backlog.version})` : ""}`
        : paint("backlog: not --json-capable — see the warning above (coupling unavailable)", ANSI.yellow, opts.color),
    );
  }
  if (data.interactive) {
    lines.push("Run `lore instructions` for the canonical agent loop.");
  }
  return lines.join("\n");
}

/** ANSI-free, diff-stable view: one line per base-scaffold path, then one line per optional-consumer action. */
function renderPlain(data: InitResult): string {
  const lines = [...data.created.map((path) => `created ${path}`), ...data.skipped.map((path) => `exists ${path}`)];
  if (data.agents) {
    for (const file of data.agents.files) {
      lines.push(`agents-${file.action} ${file.path}`);
    }
  }
  for (const scaffold of data.scaffolds) {
    for (const file of scaffold.files) {
      lines.push(`scaffold-${scaffold.target}-${file.action} ${file.path}`);
    }
  }
  if (data.backlog) {
    lines.push(data.backlog.capable ? "backlog capable" : "backlog incapable");
  }
  return lines.join("\n");
}
