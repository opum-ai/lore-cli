/**
 * commands/init.ts — `lore init`: scaffold an empty, conformant OKF bundle, and fold the rest of
 * onboarding into the SAME one command (LORE-260): the Claude Code agent bridge, downstream
 * doc-site scaffolds (mkdocs/docusaurus/obsidian), and a backlog-coupling capability check —
 * replacing the old `init` → `agents` → external `lore-setup.sh` → manual Obsidian sequence.
 *
 * ## The locked design decision (2026-07-24)
 *
 * A **bare** `lore init` on an interactive terminal runs a guided wizard that asks about each
 * configurable consumer; it is **TTY-gated** — when stdin OR stderr is not a TTY (CI, pipes, a
 * test, or a caller that redirects only one stream), `--json` was requested, or ANY of this
 * command's own flags is passed, it runs fully **non-interactively** with defaults and no prompt
 * can ever block it (the npm-init pattern: interactive on a bare TTY invocation, `-y`/non-TTY skips
 * prompts). **Both stdin and stderr must be real terminals** — every wizard question is written to
 * stderr (cli-contract §4: stdout stays exclusively `init`'s own envelope), so gating on stdin alone
 * would leave the wizard blocked-but-invisible behind a redirected stderr (review round 2,
 * BLOCKING-1 — confirmed live: `lore init >/dev/null 2>&1` under a pty hung forever with zero
 * output). `--json` is a third, independent veto: a machine-readable run must never prompt even at a
 * genuinely interactive terminal. Every wizard question maps 1:1 to a flag (`--agents`,
 * `--scaffold <target>`, `--obsidian`, `--no-backlog`/`--check-backlog`), so a script gets the exact
 * same outcome as answering the wizard, with zero prompts. This is documented in
 * [ADR-0017](../../docs/adr/0017-interactive-init-wizard-tty-gated.md) (an amendment to ADR-0004/
 * ADR-0005's non-interactive CLI contract).
 *
 * **EOF (Ctrl-D) mid-wizard is a `usage` error, not a silent exit 0** (review round 2, BLOCKING-2):
 * `readline/promises`' `rl.question()` never settles on stdin EOF, so a naive implementation left the
 * wizard's promise abandoned forever — the process would exit 0 with `process.exitCode` never set,
 * zero stdout bytes even under `--json` (a parse error for a `| jq` consumer expecting either a valid
 * envelope or a classified failure), and a half-applied run (the base scaffold already written,
 * nothing else). {@link createRealPrompter} now races every question against the readline
 * interface's own `close` event and throws a `usage` {@link LoreError} on an early close, so the run
 * exits non-zero with a rendered diagnostic instead — chosen over silently falling back to each
 * question's default because BLOCKING-1's lesson applies here too: never silently do something the
 * user couldn't see coming.
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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import type { BacklogAdapter } from "../adapters/backlog";
import { createTrackerAdapter } from "../adapters/tracker";
import { CONFIG_REL_PATH, loadConfig, TRACKER_BACKENDS, type TrackerBackend } from "../config";
import { loadProfile } from "../core/profile";
import { buildScaffold } from "../core/scaffold";
import { ANSI, EXIT_OK, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { type AgentsResult, applyAgentsBridge, bridgeActionColor, renderTrailer } from "./agents";
import { optionValues, parseCommandArgs, singleOptionValue, usage } from "./args";
import { applyCodexBridge, type CodexBridgeResult } from "./codex-bridge";
import { assertNoSymlinkInPath, createIfAbsent, ensureDir, writeFileAtomic } from "./fswrite";
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
  /** Codex bridge result, present iff Codex setup was selected or explicitly requested. */
  codex?: CodexBridgeResult;
  /** One entry per downstream doc-site/vault actually scaffolded this run (wizard picks, `--scaffold`, `--obsidian`); empty when none were requested. */
  scaffolds: ScaffoldResult[];
  /** The backlog-coupling capability check's outcome, present iff it ran this invocation. */
  backlog?: InitBacklogCheck;
  /** Explicit tracker choice made by the wizard or `--tracker`; absent on the legacy bare path. */
  tracker?: TrackerBackend;
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
  /** The command's normalized tokens from Commander. */
  args?: readonly string[];
  /** Clock seam for the root index timestamp (and a fresh scaffold's timestamp); defaults to the real wall clock. */
  clock?: () => Date;
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for the backlog-check advisory; defaults to `process.stderr`. */
  stderr?: Writer;
  /**
   * Whether STDIN is an interactive terminal — one half of the wizard's TTY gate (AC#2). Resolved
   * once at the CLI boundary (`cli.ts`'s `run`, mirroring its own `isTTY`/`stderrIsTTY` handling) and
   * handed in here as a plain boolean; this module never reads `process.stdin.isTTY` itself. Defaults
   * to `false` (non-interactive) so an omitted value can never accidentally enable a blocking prompt —
   * the safe default for every existing caller (tests, `lore-setup.sh`, CI) that predates this flag.
   */
  stdinIsTTY?: boolean;
  /**
   * Whether STDERR is an interactive terminal — the wizard's OTHER required condition (review
   * round 2, BLOCKING-1). Every wizard question is written to stderr (cli-contract §4: stdout stays
   * exclusively `init`'s own envelope), so `stdinIsTTY` alone is not sufficient — a caller that
   * redirects only stderr (`lore init >out 2>/dev/null`, or the universal shell idiom
   * `cmd >/dev/null 2>&1` that `lore-setup.sh` itself uses) still has a readable stdin, and would
   * otherwise block forever on a prompt nobody can see. Resolved once at the CLI boundary exactly
   * like {@link stdinIsTTY} (`cli.ts` already computes this for the error-color gate; LORE-260 round
   * 2 threads the SAME resolved value here instead of leaving it unset). Defaults to `false` for the
   * same "never accidentally enable a blocking prompt" reason.
   */
  stderrIsTTY?: boolean;
  /**
   * Whether `--json` was requested for this run. A machine-readable invocation must never prompt —
   * even sitting at a real, fully-interactive terminal (review round 2, BLOCKING-1's sibling
   * finding) — since a script piping `--json` output can never answer a wizard question. Kept as its
   * own explicit boolean rather than derived from {@link InitOptions.output}'s `mode` (which governs
   * rendering only, per `output.ts`'s documented single-responsibility split): `output.mode` is
   * always `"json"` in exactly this case for a real `cli.ts` invocation (`resolveMode` maps `--json`
   * to `mode: "json"` unconditionally), but a unit test may also hand-build a `mode: "json"`
   * `OutputContext` purely so it can `JSON.parse` the result for assertions while still wanting the
   * wizard to run (see `test/init.test.ts`'s wizard-path tests) — a separate flag lets that stay
   * possible without conflating "how do we render" with "was `--json` actually on the command line".
   * Defaults to `false` (not requested) when omitted.
   */
  jsonRequested?: boolean;
  /** The interactive wizard's I/O seam; defaults to a real `node:readline/promises` session over stdin/stderr. Injected in tests so the wizard never touches a real terminal. */
  prompter?: InitPrompter;
  /** The Backlog adapter for the coupling capability check; defaults to the real `backlog` binary on PATH. */
  adapter?: BacklogAdapter;
  /** Injectable executable discovery for the interactive agent choices. */
  agentAvailability?: () => AgentAvailability;
}

export interface AgentAvailability {
  readonly claude: boolean;
  readonly codex: boolean;
}

/** The parsed, validated `lore init` arguments. */
interface InitArgs {
  /** `--yes` (or its `--non-interactive` alias, NIT-2): force the non-interactive path (with defaults) even on a TTY — the npm-init `-y` equivalent. */
  yes: boolean;
  /** `--agents`: also set up the Claude Code agent bridge. */
  agents: boolean;
  /** `--codex`: set up the Codex bridge. */
  codex: boolean;
  /** `--scaffold <target>` (repeatable) and/or `--obsidian`, deduped; targets from {@link SCAFFOLD_TARGETS}. */
  scaffolds: string[];
  /** `--no-backlog`: skip the backlog-coupling capability check entirely. */
  noBacklog: boolean;
  /** `--check-backlog`: run the backlog-coupling capability check even with no other flag requesting it. */
  checkBacklog: boolean;
  /** `--tracker <backlog|jira>`: persist the selected task backend without prompting. */
  tracker?: TrackerBackend;
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
  // BLOCKING-1 (review round 2): BOTH streams must be a real terminal — every wizard question is
  // written to stderr, so a redirected stderr with a still-TTY stdin must never engage the wizard
  // (the reader can't see the prompt to answer it). `--json` is an independent third veto: a
  // machine-readable run must never prompt even at a genuinely interactive terminal.
  const stderrIsTTY = options.stderrIsTTY ?? false;
  const jsonRequested = options.jsonRequested ?? false;
  const interactive = stdinIsTTY && stderrIsTTY && !jsonRequested && !anyFlagGiven(parsed);

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

  if (parsed.tracker !== undefined) {
    persistTrackerBackend(options.root, parsed.tracker);
  }

  const scaffoldTargets = [...new Set(parsed.scaffolds)];
  const agents = parsed.agents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const codex = parsed.codex ? applyCodexBridge({ root: options.root, force: false, check: false }) : undefined;
  const scaffolds = scaffoldTargets.map((target) => applyScaffold({ root: options.root, target, force: false, clock }));

  // The backlog check is advisory-only (never fails the run) and, off-TTY/via-flags, runs only when
  // it's actually relevant: explicitly requested (`--check-backlog`), or implied by onboarding a
  // consumer that depends on the coupling (`--agents`/`--scaffold`/`--obsidian`) — unless the user
  // opted all the way out with `--no-backlog`. A completely bare `lore init` therefore never spawns
  // a `backlog` subprocess, exactly as before this task.
  const shouldCheckBacklog =
    parsed.checkBacklog || (!parsed.noBacklog && (parsed.agents || parsed.codex || scaffoldTargets.length > 0));
  if (!shouldCheckBacklog) {
    const result: InitResult = {
      ...base,
      interactive: false,
      agents,
      codex,
      scaffolds,
      backlog: undefined,
      tracker: parsed.tracker,
    };
    emit(initRenderable(result), options.output, options.stdout);
    return EXIT_OK;
  }

  const warnings = new WarningCollector();
  return probeBacklogCapability(options, warnings).then((backlog) => {
    warnings.flush({ color: options.output.color, stderr: options.stderr ?? process.stderr });
    const result: InitResult = {
      ...base,
      interactive: false,
      agents,
      codex,
      scaffolds,
      backlog,
      tracker: parsed.tracker,
    };
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
  let wantAgents = false;
  let wantCodex = false;
  let tracker: TrackerBackend = "backlog";
  try {
    const trackerChoice = await prompter.choose("Which tracker backend should Lore use?", TRACKER_BACKENDS, "backlog");
    if (!TRACKER_BACKENDS.includes(trackerChoice as TrackerBackend)) {
      throw new LoreError(
        "validation",
        `unsupported tracker backend ${JSON.stringify(trackerChoice)}`,
        `use one of: ${TRACKER_BACKENDS.join(", ")}`,
        { backend: trackerChoice },
      );
    }
    tracker = trackerChoice as TrackerBackend;
    const available = detectAgentAvailability(options);
    if (available.claude) {
      wantAgents = await prompter.confirm("Set up the Claude Code agent bridge (SKILL.md + CLAUDE.md nudge)?", true);
    }
    if (available.codex) {
      wantCodex = await prompter.confirm("Set up the Codex agent bridge (SKILL.md + AGENTS.md nudge)?", true);
    }
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

  persistTrackerBackend(options.root, tracker);

  const clock = options.clock ?? (() => new Date());
  const agents = wantAgents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const codex = wantCodex ? applyCodexBridge({ root: options.root, force: false, check: false }) : undefined;
  const scaffolds = scaffoldTargets.map((target) => applyScaffold({ root: options.root, target, force: false, clock }));

  const warnings = new WarningCollector();
  const backlog = await probeBacklogCapability(options, warnings);
  warnings.flush({ color: options.output.color, stderr: options.stderr ?? process.stderr });

  const result: InitResult = { ...base, interactive: true, agents, codex, scaffolds, backlog, tracker };
  emit(initRenderable(result), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * A real, interactive {@link InitPrompter} over the given streams (defaulting to
 * `process.stdin`/`process.stderr`) — constructed only when the wizard actually runs and no
 * test-injected prompter was given. `streams` is a parameter (not hard-coded) purely so a unit test
 * can exercise this function's own EOF handling over a fake stream pair, never a real terminal.
 *
 * **BLOCKING-2 (review round 2):** `readline/promises`' `rl.question()` never settles when its input
 * stream hits EOF (Ctrl-D, or stdin simply closing) — confirmed live: a pending `question()` call
 * neither resolves nor rejects, so a naive implementation left the wizard's promise abandoned
 * forever, `finally { prompter.close() }` never ran, and the process fell through to exit `0` with
 * `process.exitCode` unset and zero stdout bytes (a broken `--json | jq` contract on top of a
 * half-applied run). Every `question()` call is now raced against the readline interface's own
 * `close` event via {@link ask}: the interface closes on EOF regardless of whether `question()`
 * itself ever settles, so the race always resolves. **Disposition: error out, not silently default**
 * (documented in ADR-0017 and this task's Implementation Notes) — an early close throws a `usage`
 * {@link LoreError} rather than silently resolving to each question's default value, for the same
 * reason as BLOCKING-1: a user who hits Ctrl-D gets no visual confirmation of what happened, so
 * guessing an answer on their behalf and proceeding is exactly the kind of invisible side effect
 * BLOCKING-1 already ruled out. The rejection propagates out of `confirm`/`choose`, unwinds
 * `runInteractiveWizard`'s `try`/`finally` (which still calls `prompter.close()` — safe here since
 * `rl.close()` is idempotent and the interface is already closing), and reaches `cli.ts`'s async
 * error path, which renders the diagnostic and maps `usage` to exit `2`.
 *
 * The `closedEarly` promise is given a standalone `.catch(() => {})` in addition to being raced,
 * because the *normal* (non-EOF) completion path also ends in `prompter.close()` — every question
 * answered, `runInteractiveWizard`'s `finally` calls `close()` intentionally, which emits `close` for
 * the FIRST time in that path and would otherwise reject an unobserved promise (an unhandled
 * rejection) after every race has already settled successfully.
 */
export function createRealPrompter(
  streams: { input: NodeJS.ReadableStream; output: NodeJS.WritableStream } = {
    input: process.stdin,
    output: process.stderr,
  },
): InitPrompter {
  const rl = readline.createInterface({ input: streams.input, output: streams.output });
  const closedEarly = new Promise<never>((_resolve, reject) => {
    rl.once("close", () => {
      reject(
        new LoreError(
          "usage",
          "stdin closed or the wizard was interrupted before it finished (EOF/Ctrl-D or Ctrl-C)",
          "answer every prompt, or run prompt-free with `lore init --yes` (or --claude/--codex/--scaffold <target>/--obsidian/--no-backlog/--check-backlog)",
        ),
      );
    });
  });
  // Prevents an "unhandled promise rejection" once the wizard finishes normally and its own
  // `prompter.close()` call fires `close` for the first time, after every `ask()` race is already
  // settled and nothing is awaiting `closedEarly` anymore — see the doc comment above.
  closedEarly.catch(() => {});

  /** Race one `rl.question()` call against the interface's own `close` event (see the doc above). */
  function ask(promptText: string): Promise<string> {
    return Promise.race([rl.question(promptText), closedEarly]);
  }

  return {
    async confirm(question, defaultValue) {
      const suffix = defaultValue ? "Y/n" : "y/N";
      const raw = (await ask(`${question} [${suffix}] `)).trim().toLowerCase();
      if (raw === "") {
        return defaultValue;
      }
      return raw === "y" || raw === "yes";
    },
    async choose(question, choices, defaultValue) {
      const raw = (await ask(`${question} (${choices.join("/")}) [${defaultValue}] `)).trim().toLowerCase();
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
  // This onboarding diagnostic is intentionally Backlog-specific even when the
  // newly selected production tracker is Jira. Jira readiness is validated by
  // configured command construction after its non-secret project map is added.
  const adapter = options.adapter ?? createTrackerAdapter(options.root, { backend: "backlog" });
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
  return (
    parsed.yes ||
    parsed.agents ||
    parsed.codex ||
    parsed.scaffolds.length > 0 ||
    parsed.noBacklog ||
    parsed.checkBacklog ||
    parsed.tracker !== undefined
  );
}

/**
 * Parse `init`'s tokens: no positionals (unchanged from before LORE-260 — a bare/`--`-terminated
 * positional is still a `usage` error, byte-identical wording to the router's old blanket
 * `rejectCommandArgs` guard so every pre-existing regression test keeps passing), plus the boolean
 * `--yes` (alias `--non-interactive`, NIT-2)/`--agents`/`--obsidian`/`--no-backlog`/`--check-backlog`
 * and the repeatable value flag `--scaffold <target>`. An unknown flag, an invalid `--scaffold`
 * target, a stray positional, or the mutually-exclusive `--no-backlog`+`--check-backlog` pair all
 * throw a `usage` {@link LoreError} (exit `2`) before any scaffold work runs.
 */
function parseInitArgs(args: readonly string[]): InitArgs {
  const parsed = parseCommandArgs(args, "init");
  const yes = parsed.flags.has("yes") || parsed.flags.has("non-interactive");
  const agents = parsed.flags.has("agents") || parsed.flags.has("claude");
  const codex = parsed.flags.has("codex");
  const noBacklog = parsed.flags.has("no-backlog");
  const checkBacklog = parsed.flags.has("check-backlog");
  const trackerValue = singleOptionValue(parsed, "tracker");
  if (trackerValue === "") {
    throw usage("--tracker needs a value", `pass --tracker ${TRACKER_BACKENDS.join(" or --tracker ")}`);
  }
  if (trackerValue !== undefined && !TRACKER_BACKENDS.includes(trackerValue as TrackerBackend)) {
    throw new LoreError(
      "validation",
      `unsupported tracker backend ${JSON.stringify(trackerValue)}`,
      `use one of: ${TRACKER_BACKENDS.join(", ")}`,
      { backend: trackerValue },
    );
  }
  const tracker = trackerValue as TrackerBackend | undefined;
  const scaffolds: string[] = [];
  for (const value of optionValues(parsed, "scaffold")) {
    if (value === "") {
      throw usage("--scaffold needs a value", "pass a value, e.g. `--scaffold mkdocs`");
    }
    if (!SCAFFOLD_TARGETS.has(value)) {
      throw usage(`unknown scaffold target "${value}"`, `valid targets are ${[...SCAFFOLD_TARGETS].join(", ")}`);
    }
    if (!scaffolds.includes(value)) scaffolds.push(value);
  }
  if (parsed.flags.has("obsidian") && !scaffolds.includes("obsidian")) scaffolds.push("obsidian");
  if (parsed.positionals.length > 0) {
    // Byte-identical wording to the router's pre-LORE-260 `rejectCommandArgs` guard (cli.ts), which
    // used to reject EVERY token this command received — `lore init` still takes no positionals.
    throw usage(
      `\`lore init\` takes no arguments, got "${parsed.positionals[0]}"`,
      "run `lore init` with no positional arguments",
      { command: "init", unexpected: [...parsed.positionals] },
    );
  }
  if (noBacklog && checkBacklog) {
    throw usage(
      "--no-backlog and --check-backlog are mutually exclusive",
      "pass at most one of --no-backlog / --check-backlog",
    );
  }
  return { yes, agents, codex, scaffolds, noBacklog, checkBacklog, tracker };
}

/** Persist one explicit tracker choice while preserving every unrelated config byte. */
function persistTrackerBackend(root: string, backend: TrackerBackend): void {
  assertNoSymlinkInPath(root, CONFIG_REL_PATH);
  // Validate the complete current file first, including credential guards and
  // unknown-value diagnostics. The base init scaffold guarantees it exists.
  loadConfig({ root });
  const absPath = join(root, CONFIG_REL_PATH);
  const current = readFileSync(absPath, "utf8");
  const next = withTrackerBackend(current, backend);
  if (next !== current) {
    writeFileAtomic(absPath, next, CONFIG_REL_PATH);
  }
}

/** Upsert `[tracker].backend` without reserializing or dropping future keys/comments. */
function withTrackerBackend(current: string, backend: TrackerBackend): string {
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const assignment = `backend = ${JSON.stringify(backend)}`;
  const trackerHeader = /^[ \t]*\[[ \t]*tracker[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/mu;
  const header = trackerHeader.exec(current);
  if (header !== null) {
    const bodyStart = header.index + header[0].length;
    const nextHeader = /^[ \t]*(?:\[[^\]\r\n]+\]|\[\[[^\]\r\n]+\]\])[ \t]*(?:#.*)?$/mu.exec(current.slice(bodyStart));
    const bodyEnd = nextHeader === null ? current.length : bodyStart + nextHeader.index;
    const body = current.slice(bodyStart, bodyEnd);
    const backendLine = /^([ \t]*)backend[ \t]*=.*$/mu;
    if (backendLine.test(body)) {
      return current.slice(0, bodyStart) + body.replace(backendLine, `$1${assignment}`) + current.slice(bodyEnd);
    }
    const headerEndsWithEol = /\r?\n$/u.test(header[0]);
    const insertion = `${headerEndsWithEol ? "" : eol}${assignment}${eol}`;
    return current.slice(0, bodyStart) + insertion + current.slice(bodyStart);
  }

  const firstHeader = /^[ \t]*\[/mu.exec(current);
  const rootEnd = firstHeader?.index ?? current.length;
  const root = current.slice(0, rootEnd);
  const dottedBackend = /^([ \t]*)tracker\.backend[ \t]*=.*$/mu;
  if (dottedBackend.test(root)) {
    return root.replace(dottedBackend, `$1tracker.${assignment}`) + current.slice(rootEnd);
  }
  if (/^[ \t]*tracker[ \t]*=/mu.test(root)) {
    throw new LoreError(
      "validation",
      `${CONFIG_REL_PATH}: inline tracker tables cannot be updated safely by lore init`,
      "rewrite tracker as a [tracker] table, then rerun lore init --tracker <backlog|jira>",
      { key: "tracker" },
    );
  }

  const separator = current.length === 0 ? "" : current.endsWith("\n") ? eol : `${eol}${eol}`;
  return `${current}${separator}[tracker]${eol}${assignment}${eol}`;
}

/** Detect installed agents without making absence or a broken PATH fatal to onboarding. */
function detectAgentAvailability(options: InitOptions): AgentAvailability {
  if (options.agentAvailability) return options.agentAvailability();
  try {
    return { claude: Bun.which("claude") !== null, codex: Bun.which("codex") !== null };
  } catch {
    return { claude: false, codex: false };
  }
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
    lines.push("Claude Code bridge:");
    for (const file of data.agents.files) {
      // "protected" is a warning, not a success (LORE-260 review round 2, MINOR-4): a hand-edited
      // file was left untouched, which is meaningfully different from "unchanged" (nothing to do)
      // and must not be painted the same green as an actual write. Shared with `lore agents`' own
      // renderer (LORE-267) so the two commands cannot diverge on this mapping again.
      lines.push(`  ${paint(file.action, bridgeActionColor(file.action), opts.color)} ${file.path}`);
    }
    // Reuse `lore agents`' own trailer verbatim (MINOR-4) rather than dropping it: a `protected`
    // file with no visible remedy reads as silent success (LORE-129 established this line as
    // load-bearing).
    const agentsTrailer = renderTrailer(data.agents);
    if (agentsTrailer !== undefined) {
      lines.push(paint(agentsTrailer, ANSI.yellow, opts.color));
    }
  }
  if (data.codex) {
    lines.push("Codex bridge:");
    for (const file of data.codex.files) {
      lines.push(`  ${paint(file.action, bridgeActionColor(file.action), opts.color)} ${file.path}`);
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
  if (data.tracker !== undefined) {
    lines.push(`tracker: ${data.tracker}`);
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
    const agentsTrailer = renderTrailer(data.agents);
    if (agentsTrailer !== undefined) {
      lines.push(agentsTrailer);
    }
  }
  if (data.codex) {
    for (const file of data.codex.files) {
      lines.push(`codex-${file.action} ${file.path}`);
    }
  }
  for (const scaffold of data.scaffolds) {
    // NIT-1 (review round 2): an already-up-to-date scaffold produced NO line at all in plain mode
    // (renderPretty said "already up to date"; renderPlain said nothing), so a --plain consumer
    // couldn't tell the step ran versus never having been requested.
    if (scaffold.files.length === 0) {
      lines.push(`scaffold-${scaffold.target} up-to-date`);
      continue;
    }
    for (const file of scaffold.files) {
      lines.push(`scaffold-${scaffold.target}-${file.action} ${file.path}`);
    }
  }
  if (data.backlog) {
    lines.push(data.backlog.capable ? "backlog capable" : "backlog incapable");
  }
  if (data.tracker !== undefined) {
    lines.push(`tracker ${data.tracker}`);
  }
  return lines.join("\n");
}
