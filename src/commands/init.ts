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
 * `--scaffold <target>`, `--obsidian`, `--no-tracker`/`--check-tracker`), so a script gets the exact
 * same outcome as answering the wizard, with zero prompts. This is documented in
 * [ADR-0017](../../docs/adr/0017-interactive-init-wizard-tty-gated.md) (an amendment to ADR-0004/
 * ADR-0005's non-interactive CLI contract).
 *
 * ## The git preflight, and why nothing is written before it (LCLI-358.1)
 *
 * `init` requires a git worktree. This is not a style rule: `lore sync` shells `git rev-parse HEAD`
 * and fails outright without a repository, and `quest init` — the default tracker's own
 * initializer — refuses a non-worktree path, so a bundle scaffolded outside one is broken for
 * everything except `lore check`. On a TTY the wizard's FIRST question offers to run `git init`;
 * off a TTY, or when that question is declined, the run raises {@link missingGitRepository}
 * (`validation`, exit `6`). `--allow-no-git` waives the requirement for exactly the docs-only case
 * `lore check` still serves, and is the one flag that does NOT force the non-interactive path —
 * see {@link anyFlagGiven} for why, and the ADR-0017 amendment for the decision.
 *
 * The preflight only means something because **every check now runs before the first byte is
 * written**: the base scaffold moved out of `runInit`'s body into {@link applyBaseScaffold}, which
 * both paths call only once nothing can still refuse. Before that move, a declined prompt, a
 * rejected flag combination, or a Ctrl-D left `docs/` and `.lore/` on disk from a run that then
 * exited non-zero. `resolveTrackerSelection` is resolved lazily for the same reason — it reads
 * `.lore/config.toml`, so eagerly resolving it would replace the scaffold's precise `conflict`
 * diagnostic (naming the entry that blocks the path) with a config-read failure.
 *
 * **EOF (Ctrl-D) mid-wizard is a `usage` error, not a silent exit 0** (review round 2, BLOCKING-2):
 * `readline/promises`' `rl.question()` never settles on stdin EOF, so a naive implementation left the
 * wizard's promise abandoned forever — the process would exit 0 with `process.exitCode` never set,
 * zero stdout bytes even under `--json` (a parse error for a `| jq` consumer expecting either a valid
 * envelope or a classified failure), and a half-applied run (the base scaffold already written,
 * nothing else — no longer possible since LCLI-358.1 moved the scaffold after every prompt). {@link createRealPrompter} now races every question against the readline
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
import { type GitPreflight, realGitPreflight } from "../adapters/git-preflight";
import { type JiraOnboarding, realJiraOnboarding } from "../adapters/jira-onboarding";
import { createQuestBacklogMigration, isQuestVersionFloorFailure } from "../adapters/quest";
import { createTrackerAdapter } from "../adapters/tracker";
import {
  detectTrackerEnvironment,
  installCommandFor,
  installTrackerPackage,
  type TrackerEnvironment,
  type TrackerEnvironmentEntry,
  trackerEntry,
} from "../adapters/tracker-environment";
import { CONFIG_REL_PATH, type JiraTrackerConfig, loadConfig, TRACKER_BACKENDS, type TrackerBackend } from "../config";
import { loadProfile } from "../core/profile";
import { buildScaffold } from "../core/scaffold";
import { ANSI, EXIT_OK, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { applyCutover } from "../tracker-cutover";
import {
  clearPendingQuestMigration,
  migrateBacklogTasksToQuest,
  type TrackerMigrationResult,
} from "../tracker-migration";
import {
  BACKLOG_PROJECT_MARKER,
  hasBacklogProject,
  LEGACY_BACKLOG_DIR,
  resolveTrackerSelection,
  type TrackerSelection,
} from "../tracker-selection";
import { type AgentsResult, applyAgentsBridge, bridgeActionColor, renderTrailer } from "./agents";
import { optionValues, parseCommandArgs, singleOptionValue, usage } from "./args";
import { applyCodexBridge, type CodexBridgeResult } from "./codex-bridge";
import { assertNoSymlinkInPath, assertScaffoldPathsFree, createIfAbsent, ensureDir, writeFileAtomic } from "./fswrite";
import { applyHermesBridge, type HermesBridgeResult } from "./hermes-bridge";
import { applyScaffold, TARGETS as SCAFFOLD_TARGETS, type ScaffoldResult } from "./scaffold";

/**
 * The selected tracker's capability check outcome, folded into {@link InitResult} when it ran
 * (LCLI-358.2).
 *
 * Supersedes {@link InitBacklogCheck}, which could only ever describe Backlog.md — the probe used
 * to run against the `backlog` binary no matter which backend the bundle had actually selected, so
 * choosing Quest produced a diagnostic about Backlog being uninitialized.
 */
export interface InitTrackerCheck {
  /** Always `true` when this field is present at all, so a `--json` consumer can branch without an `in` check. */
  readonly checked: true;
  /** The backend that was probed — always the one this bundle selected. */
  readonly backend: TrackerBackend;
  /** Whether that backend's CLI answered with the capability lore requires. */
  readonly capable: boolean;
  /** The version the backend reported, when capable. */
  readonly version?: string;
  /** The advisory message (also written to stderr) when NOT capable. */
  readonly warning?: string;
}

/**
 * @deprecated Use {@link InitResult.trackerCheck}, which reports whichever backend was selected.
 * Retained, and populated ONLY for a `backlog` bundle (its exact historical meaning), so the
 * documented `--json` field does not change shape under existing consumers.
 */
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
  /** Hermes project-context bridge result, present iff `--hermes` or the wizard selected it. */
  hermes?: HermesBridgeResult;
  /** One entry per downstream doc-site/vault actually scaffolded this run (wizard picks, `--scaffold`, `--obsidian`); empty when none were requested. */
  scaffolds: ScaffoldResult[];
  /** What init detected about every backend's CLI and this repository, present iff detection ran. */
  trackerEnvironment?: TrackerEnvironment;
  /** The backend whose package this run installed, present iff an install actually happened. */
  installed?: string;
  /** The selected tracker's capability check outcome, present iff it ran this invocation. */
  trackerCheck?: InitTrackerCheck;
  /** @deprecated Use {@link InitResult.trackerCheck}. Present only for a `backlog` bundle whose check ran. */
  backlog?: InitBacklogCheck;
  /** Explicit tracker choice made by the wizard or `--tracker`; absent on the legacy bare path. */
  tracker?: TrackerBackend;
  /** Quest-owned Backlog migration receipt, present only after explicit verified application. */
  migration?: TrackerMigrationResult;
}

/** The interactive wizard's minimal prompt vocabulary — confirm (yes/no) and choose (one of a fixed list). Injected so the wizard is unit-testable without a real terminal. */
export interface InitPrompter {
  /** Ask a yes/no question; an empty answer (bare Enter) resolves to `defaultValue`. */
  confirm(question: string, defaultValue: boolean): Promise<boolean>;
  /** Ask the user to pick one of `choices`; an empty or unrecognized answer resolves to `defaultValue`. */
  choose(question: string, choices: readonly string[], defaultValue: string): Promise<string>;
  /**
   * Ask for a free-text value; an empty answer (bare Enter) resolves to `defaultValue`.
   *
   * Distinct from {@link choose}, which lower-cases the answer before matching it — correct for
   * Lore's own fixed vocabularies (`quest`/`backlog`/`jira`, `mkdocs`/`none`) and wrong for anything
   * named by someone else. A jira-cli profile or a Jira project key is that second kind: `choose`
   * could never select a profile named `Salient` (LCLI-358.4).
   */
  ask(question: string, defaultValue: string): Promise<string>;
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
  /** Explicit Quest migration seam; defaults to Quest's public receipt lifecycle. */
  migrateBacklog?: () => Promise<TrackerMigrationResult>;
  /** Injectable executable discovery for the interactive agent choices. */
  agentAvailability?: () => AgentAvailability;
  /**
   * Tracker CLI/repository detection (LCLI-358.3); defaults to the real PATH-and-marker probe.
   * Injected in tests so the wizard's environment summary and install offers run without any
   * tracker actually being installed on the machine running them.
   */
  trackerEnvironment?: () => TrackerEnvironment;
  /**
   * The package installer seam (LCLI-358.3); defaults to the real `npm install -g`. Injected in
   * tests so no test ever mutates the machine's global packages.
   */
  installTracker?: (entry: TrackerEnvironmentEntry) => Promise<boolean>;
  /**
   * The git preflight seam (LCLI-358.1); defaults to the real `git`-shelling
   * {@link realGitPreflight} rooted at {@link InitOptions.root}. Injected in tests so the accept,
   * decline, and `git init`-failure branches run without creating real repositories.
   */
  git?: GitPreflight;
  /**
   * The live jira-cli read seam (LCLI-358.4); defaults to the real `jira`-shelling
   * {@link realJiraOnboarding}. Injected in tests so the profile-selection and project-validation
   * branches run with neither jira-cli installed nor any credential on the machine.
   */
  jira?: JiraOnboarding;
}

export interface AgentAvailability {
  readonly claude: boolean;
  readonly codex: boolean;
  /** Optional while older injected availability seams migrate; absence means unavailable. */
  readonly hermes?: boolean;
}

/** The parsed, validated `lore init` arguments. */
interface InitArgs {
  /** `--yes` (or its `--non-interactive` alias, NIT-2): force the non-interactive path (with defaults) even on a TTY — the npm-init `-y` equivalent. */
  yes: boolean;
  /** `--agents`: also set up the Claude Code agent bridge. */
  agents: boolean;
  /** `--codex`: set up the Codex bridge. */
  codex: boolean;
  /** `--hermes`: set up the project-local Hermes context bridge. */
  hermes: boolean;
  /** `--scaffold <target>` (repeatable) and/or `--obsidian`, deduped; targets from {@link SCAFFOLD_TARGETS}. */
  scaffolds: string[];
  /** `--no-tracker` (alias `--no-backlog`): skip the tracker-coupling capability check entirely. */
  noTracker: boolean;
  /** `--check-tracker` (alias `--check-backlog`): run the tracker-coupling capability check even with no other flag requesting it. */
  checkTracker: boolean;
  /** `--tracker <quest|backlog|jira>`: persist the selected task backend without prompting. */
  tracker?: TrackerBackend;
  /** `--migrate-backlog`: preflight and preserve compatible Backlog ids while selecting Quest. */
  migrateBacklog: boolean;
  /** `--keep-backlog-tasks`: select Quest and deliberately leave an existing Backlog.md project in place (LCLI-358.5). */
  keepBacklogTasks: boolean;
  /** `--adopt-manifest <path>`: coordinate a knowledge-adoption manifest with `--migrate-backlog` as one cutover (LCLI-333.1). */
  adoptManifest?: string;
  /** `--approval-digest <digest>`: the adoption preview's approval digest binding the cutover's adoption leg. Required with `--adopt-manifest`. */
  approvalDigest?: string;
  /** `--allow-no-git`: scaffold a docs-only bundle in a directory that is not a git worktree (LCLI-358.1). */
  allowNoGit: boolean;
  /** `--install-tracker`: install the selected backend's package when its binary is missing (LCLI-358.3). */
  installTracker: boolean;
  /** `--no-install-tracker`: never install, even when the binary is missing (LCLI-358.3). */
  noInstallTracker: boolean;
  /** `--jira-profile <name>`: the jira-cli credential profile to record, without prompting (LCLI-358.4). */
  jiraProfile?: string;
  /** `--jira-project <KEY>`: the Jira project key to validate and record, without prompting (LCLI-358.4). */
  jiraProject?: string;
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
  // Build the scaffold plan and refuse a structurally blocked bundle FIRST (LCLI-358.1 review):
  // a symlinked or wrong-shaped entry at a path the bundle needs makes the whole run impossible,
  // so discovering it after five wizard questions — and after `git init` ran on the operator's
  // behalf — is the wrong order. `loadProfile` tolerates an unreadable `.lore`, so this stays
  // ahead of every config read and keeps the precise `conflict` (naming the blocking entry) as the
  // first diagnostic on BOTH paths, rather than the interactive path degrading to a config-read
  // failure.
  const plan = buildScaffold({ timestamp: clock().toISOString(), profile: loadProfile({ root: options.root }) });
  assertScaffoldPathsFree(
    options.root,
    plan.dirs,
    plan.files.map((file) => file.path),
  );

  // `resolveTrackerSelection` tolerates a bundle that does not exist yet (no `.lore/config.toml`
  // resolves to the zero-config default), which is what lets this — and every guard below — run
  // BEFORE the scaffold is written rather than after it (LCLI-358.1).
  //
  // Resolved LAZILY, and that laziness is load-bearing: it reads `.lore/config.toml`, so on a root
  // where `.lore` is a regular file (or any other non-directory) it raises a config-read failure.
  // Before this reordering the scaffold ran first and reported that same root cause as the far more
  // actionable `conflict` naming the blocking entry. Only a run that actually needs the prior
  // selection pays for resolving it, so a bare `lore init` still reaches the scaffold — and its
  // conflict diagnostic — untouched.
  let cachedSelection: TrackerSelection | undefined;
  const priorSelection = (): TrackerSelection => (cachedSelection ??= resolveTrackerSelection(options.root));
  assertFlagCombinations(parsed, options.root);

  const git = options.git ?? realGitPreflight(options.root);

  if (interactive) {
    // No `priorSelection()` here any more (LCLI-358.5): the wizard asks the tracker question
    // unconditionally, so the prior selection no longer steers a single prompt — and the
    // interactive path stops paying for a config read it does not use.
    return runInteractiveWizard(options, parsed, git, plan);
  }

  // Non-interactive: detect only. A scripted run never silently creates a repository — it either
  // already has one, opted out with `--allow-no-git`, or fails before writing a single byte.
  if (!parsed.allowNoGit && !git.isRepository()) {
    throw missingGitRepository();
  }
  const base = applyBaseScaffold(options, plan);
  const created = base.created;

  if (parsed.migrateBacklog) {
    // Coordinated cutover (LCLI-333.1): with an adoption manifest, both legs run through the
    // ordered, resumable coordinator — Quest selection happens only after BOTH legs verify AND
    // backlog/ is verified-archived-and-deleted. The migration-only path is unchanged.
    if (parsed.adoptManifest !== undefined) {
      return runCoordinatedCutover(options, parsed).then((migration) =>
        finishNonInteractive(options, parsed, base, clock, priorSelection, migration),
      );
    }
    return runBacklogMigration(options).then((migration) => {
      persistTrackerBackend(options.root, "quest");
      clearPendingQuestMigration(options.root);
      return finishNonInteractive(options, parsed, base, clock, priorSelection, migration);
    });
  }
  if (parsed.tracker !== undefined) {
    // LCLI-358.3 AC#4: `--install-tracker` is the non-interactive equivalent of the wizard's install
    // offer. Without it nothing is ever installed, so a scripted run's behavior is unchanged unless
    // the caller asked for the install explicitly.
    // LCLI-356 AC#2: an EXPLICIT selection is verified before it is written. Persisting first and
    // discovering the backend is unusable later is what produced the reported failure — `lore init
    // --yes --tracker quest` exited 0 and wrote `backend = "quest"`, and every subsequent
    // tracker-touching command then exited 6. The bundle scaffold above is idempotent and harmless;
    // the *selection* is the commitment, so that is what a failed verification withholds.
    return installSelectedBackendIfRequested(options, parsed)
      .then((installedPackage) =>
        verifySelectedBackend(options, parsed).then((verified) => ({ installedPackage, verified })),
      )
      .then(({ installedPackage, verified }) =>
        // LCLI-358.4: jira's configuration is resolved and validated in the same pre-persist window
        // as every other backend's verification, so a run that cannot produce a usable
        // `[tracker.jira]` table writes no selection at all.
        (parsed.tracker === "jira" ? configureJira(options, parsed, undefined) : Promise.resolve(undefined)).then(
          (jira) => ({ installedPackage, verified, jira }),
        ),
      )
      .then(({ installedPackage, verified, jira }) => {
        persistTrackerBackend(options.root, parsed.tracker as TrackerBackend, jira);
        return finishNonInteractive(
          options,
          parsed,
          base,
          clock,
          priorSelection,
          undefined,
          verified,
          installedPackage,
        );
      });
  }
  if (created.includes(CONFIG_REL_PATH)) {
    // A newly created bundle is unambiguous. Persist rather than relying on a
    // changing zero-config default, so an existing bundle is never switched.
    //
    // NOT verified, deliberately: this is a default, not a choice the operator expressed, and a
    // bare `lore init` has never spawned a tracker subprocess (LORE-260). The advisory probe still
    // reports the backend's readiness whenever this run has a reason to look.
    persistTrackerBackend(options.root, "quest");
  }

  return finishNonInteractive(options, parsed, base, clock, priorSelection);
}

/**
 * Verify an explicitly selected backend BEFORE the selection is persisted (LCLI-356 AC#2), letting
 * the adapter's own classified {@link LoreError} propagate: an unusable backend must fail the run
 * that chose it, not become an advisory warning attached to a bundle already committed to it.
 *
 * Returns the resulting {@link InitTrackerCheck} so the advisory step downstream reuses this
 * probe's answer instead of spawning the tracker a second time.
 *
 * **Only a version-floor rejection is fatal.** That precision is the whole design. An installed
 * Quest below the floor is a pairing that cannot work at all, and nothing the operator does inside
 * this repository fixes it — they must install a different Quest, so committing the bundle to that
 * backend first only guarantees a broken next command. Every other probe failure ("workspace is not
 * initialized", "not on PATH", "no Backlog.md project") is one setup step away in the same
 * directory, which is precisely why LORE-319 made this check advisory rather than fatal. This
 * function does not reverse that decision; it carves out the one class LORE-319 was never about.
 *
 * `none`, `jira`, and `--no-tracker` are skipped entirely. `none` has nothing to verify;
 * `--no-tracker` is the documented opt-out for pinning a backend before installing its tooling;
 * and jira is verified by {@link configureJira} instead, which resolves a real credential profile
 * and a real project key against the live CLI before either is written (LCLI-358.4). Probing it
 * again here would spawn jira-cli a second time to re-learn what that step just proved.
 *
 * The interactive wizard deliberately does not call this. LCLI-358.6/.7 replace its tracker step
 * with an offer to install or initialize the chosen backend; failing the run outright in the
 * meantime would pre-empt that with a worse version of the same idea.
 */
async function installSelectedBackendIfRequested(options: InitOptions, parsed: InitArgs): Promise<string | undefined> {
  const backend = parsed.tracker;
  if (!parsed.installTracker || backend === undefined || backend === "none") {
    return undefined;
  }
  const environment = (options.trackerEnvironment ?? (() => detectTrackerEnvironment(options.root)))();
  const entry = trackerEntry(environment, backend);
  if (entry === undefined || entry.installed) {
    return undefined;
  }
  const install = options.installTracker ?? installTrackerPackage;
  if (!(await install(entry))) {
    throw new LoreError(
      "not_found",
      `\`${installCommandFor(entry)}\` completed but \`${entry.binary}\` is still not on PATH`,
      "check your npm global prefix is on PATH (`npm prefix -g`), then rerun `lore init`",
      { binary: entry.binary, package: entry.package },
    );
  }
  return entry.package;
}

/**
 * The narrow, shared probe every persisted selection now runs before it is written (LCLI-356
 * AC#2, extended fleet-wide by opag ruling 2026-08-31 to every path that persists a backend, not
 * only the explicit `--tracker` one — the commitment is the selection, however it was arrived at).
 * Re-throws only a below-the-floor rejection; every other outcome, including "not installed",
 * stays advisory, because only a floor failure is not one setup step away in the same directory.
 */
async function verifyBackendReadiness(
  options: InitOptions,
  backend: TrackerBackend,
): Promise<InitTrackerCheck | undefined> {
  try {
    const adapter = options.adapter ?? createConfiguredAdapterFor(options.root, backend);
    const capability = await adapter.probe();
    return { checked: true, backend, capable: true, version: capability.version };
  } catch (err) {
    if (isQuestVersionFloorFailure(err)) {
      throw err;
    }
    // Anything else stays advisory: the downstream probe reports it as a warning, exactly as it did
    // before this gate existed.
    return undefined;
  }
}

/** The explicit `--tracker` path's use of {@link verifyBackendReadiness}: `none`, `jira` (verified by
 * {@link configureJira} instead), and `--no-tracker` are exempt. */
async function verifySelectedBackend(options: InitOptions, parsed: InitArgs): Promise<InitTrackerCheck | undefined> {
  const backend = parsed.tracker;
  if (backend === undefined || backend === "none" || backend === "jira" || parsed.noTracker) {
    return undefined;
  }
  return verifyBackendReadiness(options, backend);
}

/** The base OKF bundle this run wrote (or found already present). */
interface BaseScaffold {
  root: string;
  created: string[];
  skipped: string[];
}

/**
 * Write the base OKF bundle idempotently — `init`'s original, sole responsibility, extracted
 * verbatim so BOTH paths can call it at the one point the preflight has finished (LCLI-358.1).
 *
 * The extraction is the whole point of this task's AC#4: this used to run before the wizard asked
 * its first question, so a declined git prompt, a rejected flag combination, or a Ctrl-D left
 * `docs/` and `.lore/` on disk with no tracker selected. Every caller now runs its checks first and
 * calls this only once nothing can still refuse.
 */
function applyBaseScaffold(options: InitOptions, plan: ReturnType<typeof buildScaffold>): BaseScaffold {
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
  return { root: options.root, created, skipped };
}

/**
 * The flag-combination guards, run AHEAD of the scaffold (LCLI-358.1) so a rejected combination
 * leaves the directory untouched instead of exiting `2` over a half-written bundle.
 *
 * Every condition tests its cheap flag half FIRST, so {@link hasBacklogProject} — two `lstat` calls
 * against the repository — is never reached by a run whose flags could not trip the guard anyway.
 */
function assertFlagCombinations(parsed: InitArgs, root: string): void {
  if (parsed.migrateBacklog && parsed.keepBacklogTasks) {
    throw usage(
      "--migrate-backlog and --keep-backlog-tasks are mutually exclusive",
      "pass at most one: they are opposite answers to the same question",
    );
  }
  // One message per unmet condition (LCLI-358.5 AC#4). These used to share a single sentence that
  // named neither cause: "--migrate-backlog requires --tracker quest in a legacy zero-config
  // Backlog bundle" was raised for a wrong `--tracker` value, for a missing project, AND — because
  // it also demanded `source === "legacy-backlog"` — for the exact command its own hint recommended
  // once `backend = "backlog"` had been written.
  if (parsed.migrateBacklog && parsed.tracker !== "quest") {
    throw usage(
      `--migrate-backlog requires --tracker quest; ${parsed.tracker === undefined ? "no --tracker was passed" : `--tracker ${parsed.tracker} was passed`}`,
      "run `lore init --tracker quest --migrate-backlog`",
      { tracker: parsed.tracker ?? null },
    );
  }
  if (parsed.migrateBacklog && !hasBacklogProject(root)) {
    throw usage(
      `--migrate-backlog needs a Backlog.md project to migrate, and ${BACKLOG_PROJECT_MARKER} does not exist here`,
      "run `lore init --tracker quest` on its own; there is nothing to migrate",
      { marker: BACKLOG_PROJECT_MARKER },
    );
  }
  // A scripted Quest selection over real Backlog tasks must state what happens to them (AC#3).
  // Whether the bundle reached Backlog through an explicit `backend = "backlog"` or through the
  // zero-config legacy default is irrelevant: the tasks are equally real either way, and the old
  // `source === "legacy-backlog"` gate let the explicit case succeed in silence.
  if (parsed.tracker === "quest" && !parsed.migrateBacklog && !parsed.keepBacklogTasks && hasBacklogProject(root)) {
    throw new LoreError(
      "validation",
      `selecting Quest here would leave the Backlog.md project at ${LEGACY_BACKLOG_DIR}/ behind, and that must be a deliberate choice`,
      "run `quest init`, then `lore init --tracker quest --migrate-backlog` to bring the tasks across; `--keep-backlog-tasks` to leave them in place; or `lore init --tracker backlog` to keep using Backlog",
      { marker: BACKLOG_PROJECT_MARKER },
    );
  }
  if (parsed.keepBacklogTasks && parsed.tracker !== "quest") {
    throw usage(
      "--keep-backlog-tasks only means something with --tracker quest",
      "it answers what happens to an existing Backlog.md project when Quest is selected",
      { tracker: parsed.tracker ?? null },
    );
  }
  if (parsed.adoptManifest !== undefined && !parsed.migrateBacklog) {
    throw usage(
      "--adopt-manifest requires --migrate-backlog: knowledge adoption is coordinated with the task migration as one cutover",
      "run `lore init --tracker quest --migrate-backlog --adopt-manifest <path>` in a legacy zero-config Backlog bundle",
    );
  }
  if (parsed.adoptManifest !== undefined && parsed.approvalDigest === undefined) {
    throw usage(
      "--adopt-manifest requires --approval-digest: pass the exact digest of the reviewed adoption preview",
      "run `lore backlog adopt preview --manifest <path>` first and pass its approval.digest",
    );
  }
}

/**
 * The one diagnostic for "this directory is not a git worktree and the operator did not opt out"
 * (LCLI-358.1), shared by the wizard's declined prompt and the non-interactive path so the two can
 * never drift.
 *
 * `validation` (exit `6`) rather than `usage` (exit `2`): the command line was well-formed — the
 * *repository* is what fails the requirement. The message names why lore needs git rather than
 * asserting a bare rule: `lore sync` shells `git rev-parse HEAD` and fails outright without a
 * repository, and `quest init` refuses a non-worktree path, so a bundle scaffolded here would be
 * broken for everything except `lore check`. That last exception is exactly what `--allow-no-git`
 * is for, so the hint offers it instead of leaving the reader stuck.
 */
function missingGitRepository(): LoreError {
  return new LoreError(
    "validation",
    "`lore init` needs a git repository: this directory is not a git worktree",
    "run `git init` here (or rerun `lore init` and accept the prompt) — `lore sync` and `quest init` both require git; pass `--allow-no-git` for a docs-only bundle that only `lore check` will serve",
  );
}

function finishNonInteractive(
  options: InitOptions,
  parsed: InitArgs,
  base: { root: string; created: string[]; skipped: string[] },
  clock: () => Date,
  priorSelection: () => TrackerSelection,
  migration?: TrackerMigrationResult,
  /** A selection-time verification's result (LCLI-356), reused so the tracker is probed once per run. */
  verified?: InitTrackerCheck,
  /** The package `--install-tracker` installed this run, if any (LCLI-358.3). */
  installedPackage?: string,
): number | Promise<number> {
  const scaffoldTargets = [...new Set(parsed.scaffolds)];
  // Detected on every run, not only the wizard's (LCLI-358.3): three PATH lookups and three
  // `existsSync` calls, no subprocess — so the pre-LORE-260 "a bare init spawns no tracker"
  // guarantee holds, and a `--json` consumer sees the same facts the wizard shows a human.
  const environment = (options.trackerEnvironment ?? (() => detectTrackerEnvironment(options.root)))();
  const agents = parsed.agents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const codex = parsed.codex ? applyCodexBridge({ root: options.root, force: false, check: false }) : undefined;
  const hermes = parsed.hermes ? applyHermesBridge({ root: options.root, force: false, check: false }) : undefined;
  const scaffolds = scaffoldTargets.map((target) => applyScaffold({ root: options.root, target, force: false, clock }));

  // The tracker check is advisory-only (never fails the run) and, off-TTY/via-flags, runs only when
  // it's actually relevant: explicitly requested (`--check-tracker`), or implied by onboarding a
  // consumer that depends on the coupling (`--agents`/`--scaffold`/`--obsidian`) — unless the user
  // opted all the way out with `--no-tracker`. A completely bare `lore init` therefore never spawns
  // a tracker subprocess, exactly as before LORE-260.
  const backend = selectedBackendFor(parsed, priorSelection);
  const shouldCheck =
    (parsed.checkTracker || parsed.agents || parsed.codex || scaffoldTargets.length > 0) &&
    !parsed.noTracker &&
    backend !== "none";
  if (!shouldCheck && verified === undefined) {
    emit(
      initRenderable({
        ...base,
        interactive: false,
        agents,
        codex,
        hermes,
        scaffolds,
        trackerEnvironment: environment,
        trackerCheck: undefined,
        backlog: undefined,
        installed: installedPackage,
        tracker: parsed.tracker,
        migration,
      }),
      options.output,
      options.stdout,
    );
    return EXIT_OK;
  }

  const warnings = new WarningCollector();
  const probed =
    verified !== undefined ? Promise.resolve(verified) : probeTrackerCapability(options, backend, warnings);
  return probed.then((trackerCheck) => {
    warnings.flush({ color: options.output.color, stderr: options.stderr ?? process.stderr });
    emit(
      initRenderable({
        ...base,
        interactive: false,
        agents,
        codex,
        hermes,
        scaffolds,
        trackerEnvironment: environment,
        trackerCheck,
        backlog: legacyBacklogCheck(trackerCheck),
        installed: installedPackage,
        tracker: parsed.tracker,
        migration,
      }),
      options.output,
      options.stdout,
    );
    return EXIT_OK;
  });
}

/**
 * Project the tracker check onto the deprecated `backlog` field — populated ONLY for a `backlog`
 * bundle, which is exactly what that field has always meant. A Quest or Jira bundle leaves it
 * absent rather than filling it with another backend's result, so no existing `--json` consumer
 * reads a Quest probe as a Backlog one.
 */
function legacyBacklogCheck(check: InitTrackerCheck): InitBacklogCheck | undefined {
  if (check.backend !== "backlog") {
    return undefined;
  }
  return {
    checked: true,
    capable: check.capable,
    ...(check.version === undefined ? {} : { version: check.version }),
    ...(check.warning === undefined ? {} : { warning: check.warning }),
  };
}

function runBacklogMigration(options: InitOptions): Promise<TrackerMigrationResult> {
  if (options.migrateBacklog !== undefined) return options.migrateBacklog();
  return migrateBacklogTasksToQuest(createQuestBacklogMigration(options.root), options.root);
}

/**
 * The coordinated two-leg cutover (`--migrate-backlog --adopt-manifest <path>`, LCLI-333.1):
 * delegates to `tracker-cutover.ts`'s ordered coordinator, whose final step persists the Quest
 * backend selection and clears the recovery records — so the returned result flows straight into
 * the unchanged non-interactive finish.
 */
function runCoordinatedCutover(options: InitOptions, parsed: InitArgs): Promise<TrackerMigrationResult> {
  const root = options.root;
  return applyCutover({
    root,
    migration: createQuestBacklogMigration(root),
    adoptManifest: parsed.adoptManifest,
    approvalDigest: parsed.approvalDigest,
    persistQuestBackend: (r) => persistTrackerBackend(r, "quest"),
  }).then((plan) => ({
    digest: plan.quest.digest,
    sourceFingerprint: plan.quest.sourceFingerprint,
    mappings: [],
    survivors: [],
    taskFingerprints: {},
    state: "applied" as const,
  }));
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
  parsed: InitArgs,
  git: GitPreflight,
  plan: ReturnType<typeof buildScaffold>,
): Promise<number> {
  const prompter = options.prompter ?? createRealPrompter();
  const scaffoldTargets: string[] = [];
  let wantAgents = false;
  let wantCodex = false;
  let wantHermes = false;
  let tracker: TrackerBackend = "quest";
  let migrateBacklog = false;
  let initializeGit = false;
  let installed: string | undefined;
  let jira: JiraTrackerConfig | undefined;
  // Detected ONCE, before the tracker question, and re-read only after an install actually runs
  // (LCLI-358.3). Three PATH lookups and three `existsSync` calls — no backend is spawned, which is
  // what makes it affordable to describe every choice rather than only the one taken.
  let environment = (options.trackerEnvironment ?? (() => detectTrackerEnvironment(options.root)))();
  try {
    // The git preflight is the wizard's FIRST question and runs before every other prompt
    // (LCLI-358.1) — a declined repository ends the run, so asking about trackers, agent bridges,
    // or doc-site scaffolds first would collect answers that are then thrown away.
    if (!parsed.allowNoGit && !git.isRepository()) {
      const wantGit = await prompter.confirm(
        "This directory is not a git repository, which `lore sync` and `quest init` both require. Run `git init` here?",
        true,
      );
      if (!wantGit) {
        throw missingGitRepository();
      }
      // Answer recorded, NOT acted on yet (LCLI-358.1 review): `git init` is itself a write, and a
      // later question can still end the run — a Ctrl-D at the tracker prompt would otherwise leave
      // a `.git` directory behind from a run that exited non-zero. It executes below, alongside the
      // scaffold, once every prompt is answered.
      initializeGit = true;
    }
    // The tracker question is ALWAYS asked (LCLI-358.5 AC#1). It used to be replaced by a
    // migrate-or-pin choice whenever the bundle looked legacy, which quietly removed `jira` and
    // `none` from the wizard for any repository that happened to contain a `backlog/` directory —
    // the existing tasks decided the backend, and the operator was never asked.
    const chosen = await chooseTracker(options, parsed, prompter, environment);
    tracker = chosen.backend;
    installed = chosen.installed;
    if (installed !== undefined) {
      // Re-detect so the environment the migration question is decided against describes what is
      // now true, not what was true before this run installed something.
      environment = (options.trackerEnvironment ?? (() => detectTrackerEnvironment(options.root)))();
    }
    // Only NOW, with the backend settled, is the migration question meaningful (AC#2/AC#3). It is
    // gated on a real Backlog project existing — not on `priorSelection.source`, whose
    // `legacy-backlog` value made an explicitly configured Backlog bundle unable to reach Quest at
    // all while a zero-config one silently orphaned its tasks.
    if (tracker === "quest" && hasBacklogProject(options.root)) {
      const answer = await prompter.choose(
        `This repository has a Backlog.md project (${BACKLOG_PROJECT_MARKER}). Migrate its tasks to Quest, keep them where they are, or use Backlog as the tracker?`,
        ["migrate", "keep", "backlog"],
        "migrate",
      );
      migrateBacklog = answer === "migrate";
      if (answer === "backlog") {
        tracker = "backlog";
        // A different backend than `chooseTracker` resolved, so its binary has not been checked.
        installed = await resolveMissingBinary(options, parsed, prompter, environment, "backlog");
        if (installed !== undefined) {
          environment = (options.trackerEnvironment ?? (() => detectTrackerEnvironment(options.root)))();
        }
      }
      // `keep` needs no branch: Quest is selected and `backlog/` is left exactly as found. It exists
      // so that outcome is something the operator CHOSE rather than something that happened to them.
    }
    if (tracker === "jira") {
      // Asked here — immediately after the backend is settled and still before the first byte is
      // written (LCLI-358.4). A jira selection Lore cannot configure ends the run with the
      // directory untouched, rather than after five more questions the operator answered for
      // nothing.
      jira = await configureJira(options, parsed, prompter);
    }
    const available = detectAgentAvailability(options);
    if (available.claude) {
      wantAgents = await prompter.confirm("Set up the Claude Code agent bridge (SKILL.md + CLAUDE.md nudge)?", true);
    }
    if (available.codex) {
      wantCodex = await prompter.confirm("Set up the Codex agent bridge (SKILL.md + AGENTS.md nudge)?", true);
    }
    if (available.hermes) {
      wantHermes = await prompter.confirm("Set up the Hermes project context bridge (.hermes.md)?", true);
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

  // Every question is answered and nothing can still refuse: only now is the first byte written
  // (LCLI-358.1, AC#4). An EOF/Ctrl-D or a declined git prompt above throws out of the `try` and
  // reaches here never — leaving the directory exactly as the run found it, `.git` included.
  if (initializeGit) {
    git.initialize();
  }
  const base = applyBaseScaffold(options, plan);

  const migration = migrateBacklog ? await runBacklogMigration(options) : undefined;
  // LCLI-356 AC#2, extended to the wizard (opag ruling, 2026-08-31): verified BEFORE persisting,
  // exactly like the explicit `--tracker` path — the commitment is the selection, whether the
  // operator typed it or accepted the prompt's default. Unlike the silent zero-config default
  // (LORE-260), the wizard already spawns a subprocess unconditionally via `chooseTracker`'s
  // binary check, so this closes a real gap at no new cost. `none` has nothing to verify; `jira`
  // is verified by `configureJira` above instead; a completed migration already proves Quest
  // usable by actually using it, so re-probing it here would only spawn the same binary twice.
  const verified =
    tracker === "none" || tracker === "jira" || migrateBacklog
      ? undefined
      : await verifyBackendReadiness(options, tracker);
  persistTrackerBackend(options.root, tracker, jira);
  if (migration !== undefined) clearPendingQuestMigration(options.root);

  const clock = options.clock ?? (() => new Date());
  const agents = wantAgents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const codex = wantCodex ? applyCodexBridge({ root: options.root, force: false, check: false }) : undefined;
  const hermes = wantHermes ? applyHermesBridge({ root: options.root, force: false, check: false }) : undefined;
  const scaffolds = scaffoldTargets.map((target) => applyScaffold({ root: options.root, target, force: false, clock }));

  const warnings = new WarningCollector();
  // Probes the backend the operator just chose — not `backlog` regardless, which is what made
  // choosing Quest report that Backlog.md was uninitialized (LCLI-358.2). Reuses the selection-time
  // verification above when it ran, so the tracker is spawned once per wizard run.
  const trackerCheck =
    tracker === "none" ? undefined : (verified ?? (await probeTrackerCapability(options, tracker, warnings)));
  warnings.flush({ color: options.output.color, stderr: options.stderr ?? process.stderr });

  const result: InitResult = {
    ...base,
    interactive: true,
    agents,
    codex,
    hermes,
    scaffolds,
    trackerEnvironment: environment,
    installed,
    trackerCheck,
    backlog: trackerCheck === undefined ? undefined : legacyBacklogCheck(trackerCheck),
    tracker,
    migration,
  };
  emit(initRenderable(result), options.output, options.stdout);
  return EXIT_OK;
}

/** How many times the wizard may return to the tracker question. See {@link chooseTracker}. */
const MAX_TRACKER_ATTEMPTS = 2;

/**
 * Render one line per backend describing what `lore init` found — installed or not, and whether this
 * repository is already set up for it (LCLI-358.3 AC#1).
 *
 * Written to **stderr**, like every other part of the wizard's UI, so stdout stays exclusively the
 * `init` envelope (cli-contract §4). It is a summary, not a question: the operator sees the state
 * that makes the following choice informed, rather than picking a backend and finding out afterwards
 * that nothing is installed.
 */
function renderTrackerEnvironment(environment: TrackerEnvironment): string {
  const lines = ["Tracker backends found on this machine:"];
  for (const entry of environment) {
    const setup =
      entry.initialized === undefined
        ? "readiness is credential-based; checked when selected"
        : entry.initialized
          ? "initialized in this repository"
          : "not initialized in this repository";
    lines.push(
      `  ${entry.backend}: ${entry.installed ? `installed — ${setup}` : `not installed (${installCommandFor(entry)})`}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Ask which tracker to use, with the detected environment in view, and resolve a missing binary
 * before returning (LCLI-358.3 AC#1/AC#2/AC#3).
 *
 * **Bounded to {@link MAX_TRACKER_ATTEMPTS} passes.** The loop exists so an operator who declines to
 * install one backend can pick a different one instead of having the run end on them — but a loop
 * whose exit depends only on the operator answering differently is a loop that can spin forever
 * against an automated or confused caller. Two passes is enough for "I picked wrong, let me pick
 * again" and cannot become a prompt the run never escapes.
 */
async function chooseTracker(
  options: InitOptions,
  parsed: InitArgs,
  prompter: InitPrompter,
  environment: TrackerEnvironment,
): Promise<{ backend: TrackerBackend; installed?: string }> {
  (options.stderr ?? process.stderr).write(renderTrackerEnvironment(environment));
  for (let attempt = 1; attempt <= MAX_TRACKER_ATTEMPTS; attempt += 1) {
    const choice = await prompter.choose("Which tracker backend should Lore use?", TRACKER_BACKENDS, "quest");
    if (!TRACKER_BACKENDS.includes(choice as TrackerBackend)) {
      throw new LoreError(
        "validation",
        `unsupported tracker backend ${JSON.stringify(choice)}`,
        `use one of: ${TRACKER_BACKENDS.join(", ")}`,
        { backend: choice },
      );
    }
    const backend = choice as TrackerBackend;
    const entry = trackerEntry(environment, backend);
    if (entry === undefined || entry.installed) {
      return { backend };
    }
    const lastAttempt = attempt === MAX_TRACKER_ATTEMPTS;
    if (await offerInstall(options, parsed, prompter, entry)) {
      return { backend, installed: entry.package };
    }
    // Declined the install. Offer the way out that does not end the run — but only while an attempt
    // remains, so the offer itself cannot become the loop.
    if (!lastAttempt && (await prompter.confirm(`Choose a different tracker instead of ${backend}?`, true))) {
      continue;
    }
    throw missingTrackerBinary(entry);
  }
  // Unreachable: every path above returns or throws. Present so the bound is a property of the code
  // rather than of the reader's confidence in it.
  throw new LoreError(
    "usage",
    "no tracker backend was selected",
    `run \`lore init --tracker ${TRACKER_BACKENDS.join("|")}\``,
  );
}

/**
 * Offer to install one backend's package, returning whether its binary is available afterwards.
 * Returns `false` when the operator declines; a *failed* install is an error, not a decline, because
 * npm reporting a failure is information the operator needs rather than a fork in the wizard.
 */
async function offerInstall(
  options: InitOptions,
  parsed: InitArgs,
  prompter: InitPrompter,
  entry: TrackerEnvironmentEntry,
): Promise<boolean> {
  if (parsed.noInstallTracker) {
    return false;
  }
  const command = installCommandFor(entry);
  if (
    !parsed.installTracker &&
    !(await prompter.confirm(`${entry.binary} is not installed. Run \`${command}\`?`, true))
  ) {
    return false;
  }
  const install = options.installTracker ?? installTrackerPackage;
  if (await install(entry)) {
    return true;
  }
  // npm succeeded and the binary still is not on PATH — a real and confusing situation (a global
  // prefix outside PATH), so it gets its own diagnostic rather than looking like a declined offer.
  throw new LoreError(
    "not_found",
    `\`${command}\` completed but \`${entry.binary}\` is still not on PATH`,
    "check your npm global prefix is on PATH (`npm prefix -g`), then rerun `lore init`",
    { binary: entry.binary, package: entry.package },
  );
}

/**
 * Resolve a backend whose binary is missing outside {@link chooseTracker}'s own loop — the
 * legacy-backlog branch, which pins its answer without asking the tracker question at all.
 */
async function resolveMissingBinary(
  options: InitOptions,
  parsed: InitArgs,
  prompter: InitPrompter,
  environment: TrackerEnvironment,
  backend: TrackerBackend,
): Promise<string | undefined> {
  const entry = trackerEntry(environment, backend);
  if (entry === undefined || entry.installed) {
    return undefined;
  }
  if (!(await offerInstall(options, parsed, prompter, entry))) {
    throw missingTrackerBinary(entry);
  }
  return entry.package;
}

/** The one diagnostic for "you chose a backend whose CLI is not installed and declined to install it". */
function missingTrackerBinary(entry: TrackerEnvironmentEntry): LoreError {
  return new LoreError(
    "not_found",
    `the \`${entry.binary}\` CLI is required for the ${entry.backend} tracker and is not on PATH`,
    `run \`${installCommandFor(entry)}\`, then rerun \`lore init\` — or choose another backend with \`lore init --tracker <quest|backlog|jira|none>\``,
    { backend: entry.backend, binary: entry.binary, package: entry.package },
  );
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
  // Whether the interface has already closed by the time a question is asked. Without this,
  // `ask`'s race is decided by timing rather than by intent (LCLI-358.1): when stdin has ALREADY
  // hit EOF, `rl.question()` rejects synchronously with Node's own "readline was closed", which
  // wins the race against `closedEarly` and surfaces an internal message instead of the
  // classified `usage` diagnostic. That was previously masked because the base scaffold ran before
  // the wizard and gave `closedEarly` a head start; with the scaffold moved after the prompts the
  // race is genuinely tight, so the outcome is now decided explicitly instead of by luck.
  let alreadyClosed = false;
  const closedEarly = new Promise<never>((_resolve, reject) => {
    rl.once("close", () => {
      alreadyClosed = true;
      reject(interrupted());
    });
  });
  // Prevents an "unhandled promise rejection" once the wizard finishes normally and its own
  // `prompter.close()` call fires `close` for the first time, after every `ask()` race is already
  // settled and nothing is awaiting `closedEarly` anymore — see the doc comment above.
  closedEarly.catch(() => {});

  /** The one classified diagnostic for a wizard that lost its input, raised from both paths below. */
  function interrupted(): LoreError {
    return new LoreError(
      "usage",
      "stdin closed or the wizard was interrupted before it finished (EOF/Ctrl-D or Ctrl-C)",
      "answer every prompt, or run prompt-free with `lore init --yes` (or --claude/--codex/--scaffold <target>/--obsidian/--no-tracker/--check-tracker)",
    );
  }

  /**
   * Race one `rl.question()` call against the interface's own `close` event (see the doc above),
   * with the already-closed case decided up front rather than left to the race, and Node's own
   * post-close rejection translated into the same classified error.
   */
  async function ask(promptText: string): Promise<string> {
    if (alreadyClosed) {
      throw interrupted();
    }
    try {
      return await Promise.race([rl.question(promptText), closedEarly]);
    } catch (cause) {
      if (cause instanceof LoreError) {
        throw cause;
      }
      // `rl.question()` on a closed interface rejects with an internal readline error; the operator
      // needs the actionable EOF diagnostic, not that.
      throw alreadyClosed ? interrupted() : cause;
    }
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
    async ask(question, defaultValue) {
      const suffix = defaultValue === "" ? "" : ` [${defaultValue}]`;
      const raw = (await ask(`${question}${suffix} `)).trim();
      return raw === "" ? defaultValue : raw;
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
async function probeTrackerCapability(
  options: InitOptions,
  backend: TrackerBackend,
  warnings: WarningCollector,
): Promise<InitTrackerCheck> {
  // Adapter construction lives INSIDE the try (LCLI-358.2): `createTrackerAdapter` itself throws
  // for `jira` with no `[tracker.jira]` table, and that is exactly the kind of "your tracker is not
  // ready yet" fact this advisory exists to report — not an uncaught error that fails a run whose
  // scaffold already succeeded.
  try {
    const adapter = options.adapter ?? createConfiguredAdapterFor(options.root, backend);
    const capability = await adapter.probe();
    return { checked: true, backend, capable: true, version: capability.version };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = err instanceof LoreError ? err.hint : undefined;
    warnings.add(`${backend} coupling unavailable: ${message}${hint ? ` — ${hint}` : ""}`);
    return { checked: true, backend, capable: false, warning: message };
  }
}

/**
 * Build the adapter for one selected backend, supplying the non-secret configuration a backend
 * needs. Only `jira` reads any: `createTrackerAdapter` requires its project map, and `loadConfig`
 * is the single owner of that validation.
 */
function createConfiguredAdapterFor(root: string, backend: TrackerBackend) {
  if (backend === "jira") {
    return createTrackerAdapter(root, { backend, jira: loadConfig({ root }).tracker.jira });
  }
  return createTrackerAdapter(root, { backend });
}

/**
 * Which backend this run actually selected, and therefore the ONE this command may probe or
 * diagnose (LCLI-358.2). An explicit `--tracker` wins; otherwise the bundle's own resolved
 * selection does. Never defaults to `backlog`: probing a backend the operator did not choose is
 * the defect this function exists to prevent.
 */
function selectedBackendFor(parsed: InitArgs, priorSelection: () => TrackerSelection): TrackerBackend {
  return parsed.tracker ?? priorSelection().backend;
}

/**
 * Whether any of `lore init`'s own flags was passed — the signal that overrides a bare-TTY
 * invocation into the non-interactive path (LORE-260 AC#2).
 *
 * **`--allow-no-git` is deliberately absent from this set** (LCLI-358.1). ADR-0017's rule is that
 * any flag skips the wizard, and it holds because every other flag *answers a wizard question*, so
 * passing one means the caller already decided what the wizard would have asked. `--allow-no-git`
 * answers a **preflight gate** instead: it waives a requirement rather than choosing a consumer.
 * Including it would make `lore init --allow-no-git` scaffold-and-exit, which leaves no way to
 * reach the wizard at all from a non-git directory — the exact situation the flag exists for. It
 * still suppresses its own prompt, so the 1:1 flag-to-question mapping is preserved.
 */
function anyFlagGiven(parsed: InitArgs): boolean {
  return (
    parsed.yes ||
    parsed.agents ||
    parsed.codex ||
    parsed.hermes ||
    parsed.scaffolds.length > 0 ||
    parsed.noTracker ||
    parsed.checkTracker ||
    parsed.installTracker ||
    parsed.noInstallTracker ||
    parsed.migrateBacklog ||
    parsed.keepBacklogTasks ||
    parsed.tracker !== undefined
  );
}

/**
 * Parse `init`'s tokens: no positionals (unchanged from before LORE-260 — a bare/`--`-terminated
 * positional is still a `usage` error, byte-identical wording to the router's old blanket
 * `rejectCommandArgs` guard so every pre-existing regression test keeps passing), plus the boolean
 * `--yes` (alias `--non-interactive`, NIT-2)/`--agents`/`--obsidian`/`--no-tracker`/`--check-tracker`
 * and the repeatable value flag `--scaffold <target>`. An unknown flag, an invalid `--scaffold`
 * target, a stray positional, or the mutually-exclusive `--no-tracker`+`--check-tracker` pair all
 * throw a `usage` {@link LoreError} (exit `2`) before any scaffold work runs.
 */
function parseInitArgs(args: readonly string[]): InitArgs {
  const parsed = parseCommandArgs(args, "init");
  const yes = parsed.flags.has("yes") || parsed.flags.has("non-interactive");
  const agents = parsed.flags.has("agents") || parsed.flags.has("claude");
  const codex = parsed.flags.has("codex");
  const hermes = parsed.flags.has("hermes");
  // `--no-tracker`/`--check-tracker` are the accurate spellings now that the probe follows the
  // selected backend; the `-backlog` originals stay as aliases, the same way `--agents` aliases
  // `--claude` (LCLI-358.2).
  const noTracker = parsed.flags.has("no-tracker") || parsed.flags.has("no-backlog");
  const checkTracker = parsed.flags.has("check-tracker") || parsed.flags.has("check-backlog");
  const migrateBacklog = parsed.flags.has("migrate-backlog");
  const keepBacklogTasks = parsed.flags.has("keep-backlog-tasks");
  const allowNoGit = parsed.flags.has("allow-no-git");
  const installTracker = parsed.flags.has("install-tracker");
  const noInstallTracker = parsed.flags.has("no-install-tracker");
  const jiraProfile = singleOptionValue(parsed, "jira-profile");
  const jiraProject = singleOptionValue(parsed, "jira-project");
  const adoptManifestValue = singleOptionValue(parsed, "adopt-manifest");
  const approvalDigestValue = singleOptionValue(parsed, "approval-digest");
  if (adoptManifestValue === "") {
    throw usage("--adopt-manifest needs a value", "pass a repository-relative adoption manifest path");
  }
  if (
    adoptManifestValue !== undefined &&
    (adoptManifestValue.startsWith("/") || adoptManifestValue.split(/[\\/]/).includes(".."))
  ) {
    throw usage("--adopt-manifest must be a repository-relative path", "pass a confined JSON source manifest");
  }
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
  if (installTracker && noInstallTracker) {
    throw usage(
      "--install-tracker and --no-install-tracker are mutually exclusive",
      "pass at most one of --install-tracker / --no-install-tracker",
    );
  }
  if (noTracker && checkTracker) {
    throw usage(
      "--no-tracker and --check-tracker are mutually exclusive",
      "pass at most one of --no-tracker / --check-tracker (or their --no-backlog / --check-backlog aliases)",
    );
  }
  // LCLI-358.4: both jira flags are answers to questions only the jira branch asks, so accepting
  // them alongside another backend would record an answer that is never read — the silent kind of
  // no-op a caller only discovers when the configuration they thought they set is missing.
  for (const [flag, value] of [
    ["--jira-profile", jiraProfile],
    ["--jira-project", jiraProject],
  ] as const) {
    if (value === "") {
      throw usage(
        `${flag} needs a value`,
        `pass a value, e.g. \`${flag} ${flag === "--jira-profile" ? "default" : "ENG"}\``,
      );
    }
    if (value !== undefined && tracker !== "jira") {
      throw usage(`${flag} requires --tracker jira`, "pass --tracker jira, or drop the jira flags", {
        flag,
        tracker: tracker ?? null,
      });
    }
  }
  return {
    yes,
    agents,
    codex,
    hermes,
    scaffolds,
    noTracker,
    checkTracker,
    tracker,
    migrateBacklog,
    keepBacklogTasks,
    adoptManifest: adoptManifestValue,
    approvalDigest: approvalDigestValue,
    allowNoGit,
    installTracker,
    noInstallTracker,
    jiraProfile,
    jiraProject,
  };
}

/** Jira's default workflow scheme, the starting `status_flow` for a freshly configured project. */
const DEFAULT_JIRA_STATUS_FLOW = ["To Do", "In Progress", "Done"] as const;

/**
 * Resolve the `[tracker.jira]` table for this run: pick a jira-cli profile, then prove the project
 * key resolves under it (LCLI-358.4).
 *
 * **Every question here is answered by jira-cli, not by Lore.** Lore does not know which sites the
 * operator has credentials for, and must never learn: `jira init` is the interactive,
 * credential-bearing setup, so the zero-profile case exits naming that command rather than
 * attempting it (AC#1). What Lore persists is the *reference* — a profile name and a project key —
 * and nothing that could authenticate anything.
 *
 * `prompter` is `undefined` on the non-interactive path, where both answers must arrive as flags.
 * A missing flag there is a `usage` error raised before anything is written, so `--tracker jira`
 * can no longer produce the bundle this task exists to fix: one pinned to jira with no
 * `[tracker.jira]` table, which `createTrackerAdapter` rejects on the very next command.
 */
async function configureJira(
  options: InitOptions,
  parsed: InitArgs,
  prompter: InitPrompter | undefined,
): Promise<JiraTrackerConfig> {
  const jira = options.jira ?? realJiraOnboarding(options.root);
  const profiles = await jira.listProfiles();
  if (profiles.length === 0) {
    throw new LoreError(
      "not_found",
      "jira-cli has no credential profiles, so Lore cannot record which one to use",
      "run `jira init` to create a profile (it is interactive and handles credentials — Lore never does), then rerun `lore init --tracker jira`",
      { backend: "jira" },
    );
  }
  const names = profiles.map((profile) => profile.name);
  const fallback = profiles.find((profile) => profile.isDefault) ?? profiles[0];
  const defaultProfile = (fallback as (typeof profiles)[number]).name;

  let profile: string;
  if (parsed.jiraProfile !== undefined) {
    profile = parsed.jiraProfile;
  } else if (prompter === undefined) {
    throw usage(
      "--tracker jira needs --jira-profile to know which jira-cli profile to record",
      `pass --jira-profile with one of: ${names.join(", ")}`,
      { backend: "jira", profiles: names },
    );
  } else {
    (options.stderr ?? process.stderr).write(renderJiraProfiles(profiles));
    profile = await prompter.ask("Which jira-cli profile should Lore use?", defaultProfile);
  }
  if (!names.includes(profile)) {
    throw new LoreError(
      "validation",
      `jira-cli has no profile named ${JSON.stringify(profile)}`,
      `use one of: ${names.join(", ")} — or run \`jira init\` to add another`,
      { profile, profiles: names },
    );
  }

  let project: string;
  if (parsed.jiraProject !== undefined) {
    project = parsed.jiraProject;
  } else if (prompter === undefined) {
    throw usage(
      "--tracker jira needs --jira-project to know which Jira project to record",
      "pass --jira-project with your project key, e.g. `--jira-project ENG`",
      { backend: "jira" },
    );
  } else {
    project = (await prompter.ask("Jira project key (e.g. ENG)?", "")).trim();
  }
  if (project === "") {
    throw usage("no Jira project key was given", "pass --jira-project <KEY>, or answer the project-key prompt");
  }

  // The live check (AC#3). Its failure propagates carrying jira-cli's own reason, and it doubles as
  // the source for `issue_type` below — validating and reading the vocabulary is one call, so a
  // configured bundle cannot name an issue type the project does not actually offer.
  const summary = await jira.describeProject(project, profile);
  return {
    profile,
    project: summary.key,
    issueType: defaultIssueType(summary.issueTypes),
    defaultLabels: [],
    statusFlow: [...DEFAULT_JIRA_STATUS_FLOW],
  };
}

/**
 * Choose the issue type Lore creates tasks as, from the project's own list. Prefers `Task`, the
 * name of Jira's own default work-item type; otherwise the first type that is not a subtask, since
 * a subtask cannot be created standalone. An empty list falls back to `Task` so the written table is
 * still well-formed — the adapter's own probe reports it if the project genuinely lacks that type.
 */
function defaultIssueType(issueTypes: readonly string[]): string {
  return issueTypes.find((name) => name === "Task") ?? issueTypes.find((name) => name !== "Subtask") ?? "Task";
}

/** Show what jira-cli reported, so the profile question is answered with the sites in view. */
function renderJiraProfiles(profiles: readonly { name: string; jiraUrl: string | undefined; isDefault: boolean }[]) {
  const lines = ["jira-cli credential profiles found:"];
  for (const profile of profiles) {
    const site = profile.jiraUrl === undefined ? "" : ` — ${profile.jiraUrl}`;
    lines.push(`  ${profile.name}${site}${profile.isDefault ? " (jira-cli default)" : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Upsert the `[tracker.jira]` table, replacing it wholesale when one already exists.
 *
 * Deliberately coarser than {@link withTrackerBackend}, which upserts a single key: this table is
 * written as one unit by one flow, so a per-key merge would preserve a stale `project` alongside a
 * freshly validated one. Everything outside the table's own span is preserved byte-for-byte, and
 * **no key here can hold a credential** — `config.ts` rejects secret-shaped keys under `tracker.`,
 * and the five written below are a profile *name*, a project key, an issue-type name, labels, and
 * a status list.
 */
function withJiraTracker(current: string, config: JiraTrackerConfig): string {
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const body = [
    `profile = ${JSON.stringify(config.profile ?? "")}`,
    `project = ${JSON.stringify(config.project ?? "")}`,
    `issue_type = ${JSON.stringify(config.issueType ?? "")}`,
    `default_labels = [${config.defaultLabels.map((label) => JSON.stringify(label)).join(", ")}]`,
    `status_flow = [${config.statusFlow.map((status) => JSON.stringify(status)).join(", ")}]`,
  ].join(eol);
  const table = `[tracker.jira]${eol}${body}${eol}`;

  const header = /^[ \t]*\[[ \t]*tracker[ \t]*\.[ \t]*jira[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/mu.exec(current);
  if (header !== null) {
    const bodyStart = header.index + header[0].length;
    const nextHeader = /^[ \t]*(?:\[[^\]\r\n]+\]|\[\[[^\]\r\n]+\]\])[ \t]*(?:#.*)?$/mu.exec(current.slice(bodyStart));
    const bodyEnd = nextHeader === null ? current.length : bodyStart + nextHeader.index;
    return current.slice(0, header.index) + table + current.slice(bodyEnd);
  }
  const separator = current.length === 0 ? "" : current.endsWith("\n") ? eol : `${eol}${eol}`;
  return `${current}${separator}${table}`;
}

/** Persist one explicit tracker choice while preserving every unrelated config byte. */
/** Upsert `[tracker].backend` in the bundle's config, validating the current file first. Exported for `tracker-cutover.ts`, whose final irreversible step is exactly this selection. */
export function persistTrackerBackend(root: string, backend: TrackerBackend, jira?: JiraTrackerConfig): void {
  assertNoSymlinkInPath(root, CONFIG_REL_PATH);
  // Validate the complete current file first, including credential guards and
  // unknown-value diagnostics. The base init scaffold guarantees it exists.
  loadConfig({ root });
  const absPath = join(root, CONFIG_REL_PATH);
  const current = readFileSync(absPath, "utf8");
  // One write for both (LCLI-358.4): the selection and the configuration it needs are a single
  // commitment, so they must never be observable apart — a bundle carrying `backend = "jira"` with
  // no `[tracker.jira]` table is exactly the broken state this parameter exists to prevent.
  const withBackend = withTrackerBackend(current, backend);
  const next = jira === undefined ? withBackend : withJiraTracker(withBackend, jira);
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
      "rewrite tracker as a [tracker] table, then rerun lore init --tracker <quest|backlog|jira>",
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
    return {
      claude: Bun.which("claude") !== null,
      codex: Bun.which("codex") !== null,
      hermes: Bun.which("hermes") !== null,
    };
  } catch {
    return { claude: false, codex: false, hermes: false };
  }
}

/** The per-result-type rendering bundle for `init` (output.ts dispatches on the mode). */
function initRenderable(data: InitResult): Renderable<InitResult> {
  return { kind: "init.result", data, pretty: renderPretty, plain: renderPlain };
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
  if (data.hermes) {
    lines.push("Hermes project context bridge:");
    for (const file of data.hermes.files) {
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
  if (data.trackerCheck) {
    const { backend, capable, version } = data.trackerCheck;
    lines.push(
      capable
        ? `${backend}: ready${version ? ` (v${version})` : ""}`
        : paint(`${backend}: not ready — see the warning above (coupling unavailable)`, ANSI.yellow, opts.color),
    );
  }
  if (data.installed !== undefined) {
    lines.push(`installed: ${data.installed}`);
  }
  if (data.tracker !== undefined) {
    lines.push(`tracker: ${data.tracker}`);
  }
  if (data.migration !== undefined) {
    lines.push(
      `migration: ${data.migration.state}, ${data.migration.mappings.length} mapped (${data.migration.digest})`,
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
  if (data.hermes) {
    for (const file of data.hermes.files) {
      lines.push(`hermes-${file.action} ${file.path}`);
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
  if (data.trackerCheck) {
    lines.push(`${data.trackerCheck.backend} ${data.trackerCheck.capable ? "capable" : "incapable"}`);
  }
  if (data.installed !== undefined) {
    lines.push(`installed ${data.installed}`);
  }
  if (data.tracker !== undefined) {
    lines.push(`tracker ${data.tracker}`);
  }
  if (data.migration !== undefined) {
    lines.push(
      `migration state=${data.migration.state} mappings=${data.migration.mappings.length} digest=${data.migration.digest}`,
    );
  }
  return lines.join("\n");
}
