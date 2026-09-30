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
import type { Readable, Writable } from "node:stream";
import { isCancel as clackIsCancel, multiselect as clackMultiselect } from "@clack/prompts";
import { createAgentPluginPort } from "../adapters/agent-plugins";
import { type BacklogAdapter, isBacklogVersionFloorFailure, MIN_BACKLOG_VERSION } from "../adapters/backlog";
import {
  bunGitPreflightSpawn,
  type GitPreflight,
  type GitPreflightSpawn,
  realGitPreflight,
} from "../adapters/git-preflight";
import { type JiraOnboarding, realJiraOnboarding } from "../adapters/jira-onboarding";
import {
  createQuestBacklogMigration,
  isQuestVersionPairMismatch,
  isQuestWorkspaceNotInitializedFailure,
  type QuestBacklogMigrationOptions,
} from "../adapters/quest";
import { createTrackerAdapter } from "../adapters/tracker";
import {
  detectTrackerEnvironment,
  installCommandFor,
  type TrackerEnvironment,
  type TrackerEnvironmentEntry,
  trackerEntry,
} from "../adapters/tracker-environment";
import { archiveAndDeleteBacklog, backlogRemovalReadiness, verifyArchive } from "../backlog-archive";
import {
  CONFIG_REL_PATH,
  type JiraTrackerConfig,
  loadConfig,
  SKILL_SOURCES,
  type SkillSource,
  TRACKER_BACKENDS,
  type TrackerBackend,
} from "../config";
import {
  type AgentPluginChecks,
  type AgentPluginPort,
  type AgentRuntime,
  detectLorePlugins,
  renderPluginPlain,
  renderPluginPretty,
  thenMaybe,
} from "../core/agent-plugins";
import { loadProfile } from "../core/profile";
import { buildScaffold } from "../core/scaffold";
import { ANSI, EXIT_OK, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { applyCutover } from "../tracker-cutover";
import {
  clearPendingQuestMigration,
  migrateBacklogTasksToQuest,
  type QuestMigrationExcludedRecord,
  type TrackerMigrationResult,
} from "../tracker-migration";
import {
  BACKLOG_PROJECT_MARKER,
  hasBacklogProject,
  LEGACY_BACKLOG_DIR,
  resolveTrackerSelection,
  type TrackerSelection,
} from "../tracker-selection";
import { storeZipWriter } from "../zip-store";
import { type AgentsResult, applyAgentsBridge, bridgeActionColor, renderTrailer } from "./agents";
import { type AntigravityBridgeResult, applyAntigravityBridge } from "./antigravity-bridge";
import { optionValues, parseCommandArgs, singleOptionValue, usage } from "./args";
import { applyCodexBridge, type CodexBridgeResult } from "./codex-bridge";
import { assertNoSymlinkInPath, assertScaffoldPathsFree, createIfAbsent, ensureDir, writeFileAtomic } from "./fswrite";
import { applyHermesBridge, type HermesBridgeResult } from "./hermes-bridge";
import { applyScaffold, TARGETS as SCAFFOLD_TARGETS, type ScaffoldResult } from "./scaffold";

/**
 * The selected tracker's capability check outcome, folded into {@link InitResult} when it ran
 * (LCLI-358.2).
 *
 * Supersedes the deprecated `InitResult.backlog` field (removed, LCLI-359), which could only ever
 * describe Backlog.md — the probe used to run against the `backlog` binary no matter which backend
 * the bundle had actually selected, so choosing Quest produced a diagnostic about Backlog being
 * uninitialized.
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
  /**
   * The opum-lore marketplace plugin for each selected Claude or Codex target, keyed by runtime
   * (LCLI-592; field name and shape match quest-cli's `init` `data.plugins`, QCLI-371). Detected
   * after target selection and before any bridge write, and only reported: `init` never installs,
   * enables or updates a plugin, and the state never changes the exit code. Present iff a Claude or
   * Codex bridge was selected this run.
   */
  plugins?: AgentPluginChecks;
  /** Hermes project-context bridge result, present iff `--hermes` or the wizard selected it. */
  hermes?: HermesBridgeResult;
  /** Antigravity/Gemini CLI context bridge result, present iff `--antigravity` or the wizard selected it. */
  antigravity?: AntigravityBridgeResult;
  /** One entry per downstream doc-site/vault actually scaffolded this run (wizard picks, `--scaffold`, `--obsidian`); empty when none were requested. */
  scaffolds: ScaffoldResult[];
  /** What init detected about every backend's CLI and this repository, present iff detection ran. */
  trackerEnvironment?: TrackerEnvironment;
  /**
   * Deprecated and **always absent since 0.12.0**: it named the package this run installed, and
   * `lore init` installs nothing any more (ADR-0024, DEC-57). Retained on the envelope rather than
   * deleted for one release — ADR-0005 makes `--json` additive-only, and a caller reading
   * `data.installed` should see an absent field rather than a shape it cannot parse.
   */
  installed?: string;
  /** The selected tracker's capability check outcome, present iff it ran this invocation. */
  trackerCheck?: InitTrackerCheck;
  /** Explicit tracker choice made by the wizard or `--tracker`; absent on the legacy bare path. */
  tracker?: TrackerBackend;
  /** Quest-owned Backlog migration receipt, present only after explicit verified application. */
  migration?: TrackerMigrationResult;
  /** What happened to `backlog/` after a migration, present iff a plain `--migrate-backlog` run resolved that question (LCLI-467). */
  backlogRemoval?: InitBacklogRemoval;
}

/**
 * The answer to "and what happened to `backlog/`?" after a plain `--migrate-backlog` run
 * (LCLI-467). Present on {@link InitResult} whenever a migration ran outside the coordinated
 * `--adopt-manifest` cutover — including when nothing was removed, because "left in place" is an
 * outcome a scripted caller has to be able to read rather than infer from an absent field.
 */
export interface InitBacklogRemoval {
  /** Whether `backlog/` was archived and then DELETED from the working tree this run. */
  readonly removed: boolean;
  /** Why it was not removed — declined, not asked for, or refused as unrecoverable. Present iff `removed` is `false`. */
  readonly reason?: string;
  /** The verified, gitignored archive's repo-relative path. Present iff `removed`. */
  readonly zipRel?: string;
  /** How many files the archive holds — and therefore how many were deleted. Present iff `removed`. */
  readonly entryCount?: number;
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
  /**
   * Ask the user to toggle any number of `options` on or off in one screen (space toggles, enter
   * accepts), returning the `value`s of whichever were left checked. An empty result is legal —
   * every option can be declined at once, the multi-select equivalent of a chain of "no" answers.
   *
   * `defaultSelected` names which `value`s start pre-checked — a caller decision, like `confirm`'s
   * `defaultValue`, not a detail either implementation invents on its own (LCLI-462 review): the real
   * prompter renders it as `initialValues` and a test double can answer "accept the default" the same
   * way {@link confirm}/{@link choose} already do, without having to separately know or guess what the
   * real terminal would have shown pre-checked.
   *
   * Cancellation (Ctrl+C, or the input stream ending mid-prompt) throws the same classified `usage`
   * error {@link ask}/{@link confirm}/{@link choose} raise on EOF (LCLI-462) — one consistent
   * "answer or exit cleanly" contract across every wizard question, not a special case for this one.
   */
  multiselect(
    question: string,
    options: readonly { readonly value: string; readonly label: string }[],
    defaultSelected: readonly string[],
  ): Promise<string[]>;
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
  /**
   * Explicit Quest migration seam; defaults to Quest's public receipt lifecycle. Receives the same
   * {@link QuestBacklogMigrationOptions} the real lifecycle would (LCLI-466), so a test can observe
   * a retry that re-runs with `preserveSourceIds`/`sourceFamily` rather than only that one ran.
   *
   * Reached only from the explicit `--migrate-backlog` flag path now: the wizard no longer runs a
   * migration at all (ADR-0024), so nothing interactive can reach this seam.
   */
  migrateBacklog?: (migrationOptions?: QuestBacklogMigrationOptions) => Promise<TrackerMigrationResult>;
  /** Injectable executable discovery for the interactive agent choices. */
  agentAvailability?: () => AgentAvailability;
  /**
   * How init reads the opum-lore marketplace plugin (LCLI-592); defaults to each runtime's own
   * `plugin list --json`, or to nothing at all under `LORE_AGENT_PLUGINS=off`. Injected in tests so
   * no test reaches the machine's real agent install.
   */
  agentPlugins?: AgentPluginPort;
  /**
   * Tracker CLI/repository detection (LCLI-358.3); defaults to the real PATH-and-marker probe.
   * Injected in tests so the wizard's environment summary and its readiness offers run without any
   * tracker actually being installed on the machine running them.
   */
  trackerEnvironment?: () => TrackerEnvironment;
  /**
   * The git preflight seam (LCLI-358.1); defaults to the real `git`-shelling
   * {@link realGitPreflight} rooted at {@link InitOptions.root}. Injected in tests so the accept,
   * decline, and `git init`-failure branches run without creating real repositories.
   */
  git?: GitPreflight;
  /**
   * The READ-ONLY git transport `backlogRemovalReadiness` asks whether `backlog/` is tracked and
   * clean before an archive-and-delete is offered or performed (LCLI-467). Separate from
   * {@link InitOptions.git}, which answers the two onboarding questions and cannot be widened from
   * here (`adapters/git-preflight.ts` owns that interface); defaults to the real `git` rooted at
   * {@link InitOptions.root}. Injected in tests so a removal case never depends on the temp
   * directory happening to be a repository.
   */
  backlogGit?: GitPreflightSpawn;
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
  /**
   * Gated on the `gemini` binary (Gemini CLI), the one of GEMINI.md's two served tools that has a
   * real PATH-checkable binary — Antigravity itself is a GUI IDE with no CLI to detect (LCLI-464).
   * Mirrors how `codex`'s availability check gates a label that also names Cursor/Zed/Warp/Aider/
   * RooCode without checking each of those separately: one representative binary per option.
   */
  readonly antigravity?: boolean;
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
  /** `--antigravity`: set up the project-local Antigravity/Gemini CLI context bridge (GEMINI.md). */
  antigravity: boolean;
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
  /** `--preserve-source-ids`: with `--migrate-backlog`, keep each Backlog id instead of Quest's positional renumbering (LCLI-465). */
  preserveSourceIds: boolean;
  /** `--source-family <PREFIX>`: the id family to import when `--preserve-source-ids` is set. Required together. */
  sourceFamily?: string;
  /** `--remove-backlog`: after a successful `--migrate-backlog`, archive and DELETE `backlog/` from the working tree (LCLI-467). */
  removeBacklog: boolean;
  /** `--no-remove-backlog`: the explicit opposite answer — keep `backlog/` on disk, and say nothing further about it (LCLI-467). */
  noRemoveBacklog: boolean;
  /** `--adopt-manifest <path>`: coordinate a knowledge-adoption manifest with `--migrate-backlog` as one cutover (LCLI-333.1). */
  adoptManifest?: string;
  /** `--approval-digest <digest>`: the adoption preview's approval digest binding the cutover's adoption leg. Required with `--adopt-manifest`. */
  approvalDigest?: string;
  /** `--allow-no-git`: scaffold a docs-only bundle in a directory that is not a git worktree (LCLI-358.1). */
  allowNoGit: boolean;
  /**
   * `--install-tracker`: DEPRECATED (ADR-0024). Accepted for one release, installs nothing on any
   * path — a not-ready selection stops with the same instructions it would have stopped with
   * without the flag, and a ready selection is a no-op — both with the deprecation note on stderr.
   * Removed in the next release, after which it is an unknown-flag usage error.
   */
  installTracker: boolean;
  /** `--no-install-tracker`: DEPRECATED (ADR-0024), the same one-release no-op with the same note. It asked for what is now the only behavior. */
  noInstallTracker: boolean;
  /** `--jira-profile <name>`: the jira-cli credential profile to record, without prompting (LCLI-358.4). */
  jiraProfile?: string;
  /** `--jira-project <KEY>`: the Jira project key to validate and record, without prompting (LCLI-358.4). */
  jiraProject?: string;
  /**
   * `--skill-source <repo|plugin>`: persist `[agents].skill_source` (LCLI-442). `"plugin"` opts in
   * to the `opum-lore` marketplace plugin owning `.claude/skills/lore/SKILL.md` — an EXPLICIT,
   * scoped `--agents`/`--claude` request in this same invocation still materializes the file
   * (`applyAgentsBridge`'s `includeCodex: false` path never reads this config), so this flag only
   * changes what a later BARE `lore agents` does with a repo that has no such scoped request.
   */
  skillSource?: SkillSource;
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
  // N9 (ADR-0024): `--install-tracker` and `--no-install-tracker` stay accepted for one release and
  // install nothing on any path. The note is written once, here — stderr only, never stdout, so a
  // `--json` run's envelope stays the envelope — and it therefore reaches the operator whether the
  // run then succeeds, stops at a readiness gate, or fails for an unrelated reason. It has to come
  // BEFORE the readiness gate for exactly that last case: a not-ready run with the flag on is the
  // run whose caller most needs to be told the flag no longer does anything. The two together are
  // still a usage error, raised in `parseInitArgs` before this point is reachable at all.
  if (parsed.installTracker || parsed.noInstallTracker) {
    (options.stderr ?? process.stderr).write(installTrackerDeprecation());
  }
  // ADR-0024's precedence, in this order and no other: the flag GRAMMAR guards above (exit `2`),
  // then the selected backend's readiness (N1/N2/N5/N6 — the commands those stops hand over run),
  // and only then N3's question about the Backlog tasks. The not-ready case therefore never learns
  // about a migration it cannot run.
  assertSelectedBackendReady(parsed, options);
  assertBacklogProjectChoice(parsed, options.root);

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

  if (parsed.skillSource !== undefined) {
    // Independent of the tracker branches below (LCLI-442): `--skill-source` answers a different
    // question than `--tracker` does, so it persists unconditionally rather than being folded into
    // any one tracker path.
    persistAgentsSkillSource(options.root, parsed.skillSource);
  }

  if (parsed.migrateBacklog) {
    // Coordinated cutover (LCLI-333.1): with an adoption manifest, both legs run through the
    // ordered, resumable coordinator — Quest selection happens only after BOTH legs verify AND
    // backlog/ is verified-archived-and-deleted. The migration-only path is unchanged.
    if (parsed.adoptManifest !== undefined) {
      return runCoordinatedCutover(options, parsed).then((migration) =>
        finishNonInteractive(options, parsed, base, clock, priorSelection, migration),
      );
    }
    return runBacklogMigration(options, {
      preserveSourceIds: parsed.preserveSourceIds,
      sourceFamily: parsed.sourceFamily,
    }).then((migration) => {
      // LCLI-521 AC#3: this path cannot prompt, so it warns rather than asks and always proceeds —
      // the operator already chose --preserve-source-ids and the family explicitly.
      warnExcludedFamilies(options, migration, parsed.sourceFamily);
      persistTrackerBackend(options.root, "quest");
      clearPendingQuestMigration(options.root);
      // Only AFTER the selection is persisted (LCLI-467): the migration succeeded, so Quest is the
      // tracker whatever the operator decided about the old files, and a refused removal must not
      // leave a repository whose tasks moved but whose config did not.
      const backlogRemoval = resolveScriptedBacklogRemoval(options, parsed, migration);
      return finishNonInteractive(options, parsed, base, clock, priorSelection, migration, undefined, backlogRemoval);
    });
  }
  if (parsed.tracker !== undefined) {
    // LCLI-356 AC#2: an EXPLICIT selection is verified before it is written. Persisting first and
    // discovering the backend is unusable later is what produced the reported failure — `lore init
    // --yes --tracker quest` exited 0 and wrote `backend = "quest"`, and every subsequent
    // tracker-touching command then exited 6. The bundle scaffold above is idempotent and harmless;
    // the *selection* is the commitment, so that is what a failed verification withholds.
    //
    // ADR-0024 tightened what "verified" means here: a backend whose CLI is missing, or whose
    // repository marker is absent, is now a STOP with instructions (N1/N2/N5/N6) rather than an
    // advisory warning attached to a selection already committed to. `--no-tracker` remains the
    // documented opt-out (N10), and it is checked inside `verifySelectedBackend`.
    return verifySelectedBackend(options, parsed)
      .then((verified) =>
        // LCLI-358.4: jira's configuration is resolved and validated in the same pre-persist window
        // as every other backend's verification, so a run that cannot produce a usable
        // `[tracker.jira]` table writes no selection at all.
        (parsed.tracker === "jira" ? configureJira(options, parsed, undefined) : Promise.resolve(undefined)).then(
          (jira) => ({ verified, jira }),
        ),
      )
      .then(({ verified, jira }) => {
        persistTrackerBackend(options.root, parsed.tracker as TrackerBackend, jira);
        return finishNonInteractive(options, parsed, base, clock, priorSelection, undefined, verified);
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

/** The backend an explicit selection's readiness gate applies to, or `undefined` when none does. */
function gatedBackend(parsed: InitArgs): TrackerBackend | undefined {
  const backend = parsed.tracker;
  // `none` has no CLI to be ready, and jira is verified by {@link configureJira} instead, which
  // resolves a real credential profile and a real project key against the live CLI before either is
  // written (LCLI-358.4) — including its own `not_found` when the `jira` binary is absent (O7/N7,
  // unchanged). Probing it again here would spawn jira-cli a second time to re-learn what that step
  // just proved.
  if (backend === undefined || backend === "none" || backend === "jira") return undefined;
  // N10: `--no-tracker` is the documented opt-out, for pinning a backend before installing its
  // tooling. N4: `--migrate-backlog` is the operator's own explicit invocation, and the migration
  // proves quest usable by actually using it.
  if (parsed.noTracker || parsed.migrateBacklog) return undefined;
  return backend;
}

/**
 * The readiness half of ADR-0024's gate for an explicit `--tracker` selection (N1/N2/N5/N6): the
 * backend's CLI is not on PATH (`not_found`, exit `3`), or it is on PATH but this repository
 * carries none of its marker (`validation`, exit `6`). This is the tightening the ADR exists for —
 * before it, a `--tracker quest` with no quest installed wrote `backend = "quest"` and exited `0`,
 * and every later command failed for a reason the run could have named.
 *
 * **Synchronous, and called BEFORE {@link assertBacklogProjectChoice},** which is the point of
 * splitting it out of {@link verifySelectedBackend}: N3's remedy is the `--migrate-backlog`
 * command, and a repository with no usable quest cannot run it. The environment gate cannot replace
 * the probe below, and the probe cannot replace the gate — a marker file says nothing about the
 * pair lock, and a missing binary is a `not_found` the probe reports only as one advisory failure
 * among many.
 */
function assertSelectedBackendReady(parsed: InitArgs, options: InitOptions): void {
  const backend = gatedBackend(parsed);
  if (backend === undefined) return;
  const entry = trackerEntry(trackerEnvironmentFor(options), backend);
  if (entry !== undefined && !trackerReady(entry)) {
    throw trackerNotReady(entry);
  }
}

/**
 * Verify an explicitly selected backend BEFORE the selection is persisted (LCLI-356 AC#2), letting
 * the adapter's own classified {@link LoreError} propagate: an unusable backend must fail the run
 * that chose it, not become an advisory warning attached to a bundle already committed to it.
 *
 * Returns the resulting {@link InitTrackerCheck} so the advisory step downstream reuses this
 * probe's answer instead of spawning the tracker a second time.
 *
 * **The second of ADR-0024's two gates.** The first — {@link assertSelectedBackendReady}'s
 * environment verdict — has already run, before the flag guards' N3 question and before the
 * scaffold. What is left for this one is what no repository-local fact can answer: the adapter's
 * own `probe()`, through {@link verifyBackendReadiness}, which carries the exact-pair lock and
 * Backlog's version floor. It is asynchronous because it spawns the backend.
 *
 * The interactive wizard deliberately does not call this. It runs the same readiness gate inside
 * {@link chooseTracker}, where a quest selection gets the offer-and-continue arm (O1/O2) instead of
 * a bare stop.
 */
async function verifySelectedBackend(options: InitOptions, parsed: InitArgs): Promise<InitTrackerCheck | undefined> {
  const backend = gatedBackend(parsed);
  return backend === undefined ? undefined : verifyBackendReadiness(options, backend);
}

/** {@link InitOptions.trackerEnvironment}, defaulting to the real PATH-and-marker probe. */
function trackerEnvironmentFor(options: InitOptions): TrackerEnvironment {
  return (options.trackerEnvironment ?? (() => detectTrackerEnvironment(options.root)))();
}

/**
 * Whether the detected environment says this backend can serve a repository right now. `undefined`
 * means "not knowable from the repository" (jira's credential profiles), which is never a stop
 * here — whatever owns that answer decides.
 */
function trackerReady(entry: TrackerEnvironmentEntry): boolean {
  return entry.installed && entry.initialized !== false;
}

/**
 * The narrow, shared probe every persisted selection now runs before it is written (LCLI-356
 * AC#2, extended fleet-wide by opag ruling 2026-08-31 to every path that persists a backend, not
 * only the explicit `--tracker` one — the commitment is the selection, however it was arrived at).
 * Re-throws a below-the-floor rejection for EITHER tracker (LCLI-370 gave Backlog.md the same
 * discriminated floor code Quest already had — before it, a `--tracker backlog` user got weaker
 * protection than a `--tracker quest` user, purely because one adapter had a discriminated code
 * and the other did not) and (LCLI-376) an uninitialized-Quest-workspace rejection.
 *
 * Since ADR-0024 the "not on PATH" and "no repository marker" cases never reach here — the
 * environment gate in {@link verifySelectedBackend} stops the run first, with a remedy that names
 * the exact commands. The two rejection classes above stay because they are the ones the
 * environment CANNOT see: the pair lock and Backlog's version floor are properties of the installed
 * binaries, not of this repository. The workspace carve-out below is now a backstop for the same
 * state the gate reports — kept because the adapter's own detection is authoritative for anything
 * that writes a workspace marker some other way. Everything else stays advisory: the downstream
 * probe reports it as a warning, exactly as it did before this gate existed.
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
    if (
      isQuestVersionPairMismatch(err) ||
      isQuestWorkspaceNotInitializedFailure(err) ||
      isBacklogVersionFloorFailure(err)
    ) {
      throw err;
    }
    // Anything else stays advisory: the downstream probe reports it as a warning, exactly as it did
    // before this gate existed.
    return undefined;
  }
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
 * The exact commands to hand over when a Quest selection meets a real Backlog.md project — ADR-0024's
 * "Backlog.md" section, written once and shared by all three places that say them: the scripted
 * refusal (`assertFlagCombinations`, N3) and the wizard's accepted takeover offer (O3/O6).
 *
 * **The actor context is in the command, not described after it.** Quest refuses a write with no
 * actor declaration, so the command handed over has to carry `LORE_QUEST_ACTOR` and
 * `LORE_QUEST_ACTOR_KIND` or it fails the moment the operator runs it; a `delegated-agent` actor
 * additionally sets `LORE_QUEST_ACCOUNTABLE_HUMAN` (see `lore instructions linking`). Today's N3
 * hint named the flags and left that out, which made the recommended command unusable as printed.
 */
const BACKLOG_MIGRATION_COMMANDS_HINT =
  "run `LORE_QUEST_ACTOR=<you> LORE_QUEST_ACTOR_KIND=human lore init --tracker quest --migrate-backlog` to bring the tasks across " +
  "(a `delegated-agent` actor also sets `LORE_QUEST_ACCOUNTABLE_HUMAN`; see `lore instructions linking`); " +
  "`--keep-backlog-tasks` to leave them in place; or `lore init --tracker backlog` to keep using Backlog";

/**
 * N9 (ADR-0024): both install flags stay accepted for one release and install nothing. The note is
 * deliberately one line on **stderr**: stdout belongs to the `init` envelope alone (cli-contract
 * §4), and a deprecation is advice, not a result.
 */
function installTrackerDeprecation(): string {
  return "\ndeprecation: lore no longer installs tracker CLIs on your behalf; this flag will be removed in the next release.\n";
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
  // Mirrors Quest's own pairing requirement (LCLI-465): --preserve-source-ids without a family is
  // ambiguous the moment a Backlog holds more than one, so Quest itself refuses it — failing here
  // gives the same diagnostic before a subprocess is even spawned.
  if (parsed.preserveSourceIds && parsed.sourceFamily === undefined) {
    throw usage(
      "--preserve-source-ids requires --source-family",
      "pass the id family to import, e.g. `lore init --migrate-backlog --preserve-source-ids --source-family LCLI`",
    );
  }
  if (parsed.sourceFamily !== undefined && !parsed.preserveSourceIds) {
    throw usage(
      "--source-family only means something with --preserve-source-ids",
      "it selects which id family to keep verbatim; positional renumbering (the default) has no family to select",
    );
  }
  if (parsed.preserveSourceIds && !parsed.migrateBacklog) {
    throw usage(
      "--preserve-source-ids only means something with --migrate-backlog",
      "it's an option on the Backlog-to-Quest migration; pass --migrate-backlog to run one",
    );
  }
  // LCLI-467 AC#3. A scripted caller must be able to say which outcome it wants, and the two
  // spellings are opposite answers to one question — the same shape, and the same vocabulary, as
  // `--migrate-backlog`/`--keep-backlog-tasks` above.
  if (parsed.removeBacklog && parsed.noRemoveBacklog) {
    throw usage(
      "--remove-backlog and --no-remove-backlog are mutually exclusive",
      "pass at most one: they are opposite answers to the same question",
    );
  }
  if ((parsed.removeBacklog || parsed.noRemoveBacklog) && !parsed.migrateBacklog) {
    throw usage(
      `${parsed.removeBacklog ? "--remove-backlog" : "--no-remove-backlog"} only means something with --migrate-backlog`,
      "it answers what happens to backlog/ once its tasks are in Quest; pass --migrate-backlog to run a migration",
    );
  }
  // The coordinated cutover archives and deletes backlog/ as its own ordered phase, BEFORE it
  // selects Quest — so neither spelling is the control there: `--remove-backlog` would be a no-op
  // that reads like a cause, and `--no-remove-backlog` would be a request the cutover cannot honor.
  if ((parsed.removeBacklog || parsed.noRemoveBacklog) && parsed.adoptManifest !== undefined) {
    throw usage(
      `${parsed.removeBacklog ? "--remove-backlog" : "--no-remove-backlog"} cannot be combined with --adopt-manifest: the coordinated cutover already archives and deletes backlog/ as a verified phase of its own`,
      "drop the flag to run the cutover, or drop --adopt-manifest to run a plain migration you can answer this question for",
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
 * N3: a scripted Quest selection over real Backlog tasks must state what happens to them (AC#3).
 *
 * Whether the bundle reached Backlog through an explicit `backend = "backlog"` or through the
 * zero-config legacy default is irrelevant: the tasks are equally real either way, and the old
 * `source === "legacy-backlog"` gate let the explicit case succeed in silence.
 *
 * **Split out of {@link assertFlagCombinations} so {@link assertSelectedBackendReady} can run
 * first** (ADR-0024's precedence; LCLI-656 review D2). N3's row in the ADR is conditioned on the
 * detected state "ready, `backlog/config.yml` present" — and the remedy it hands over is the
 * `--migrate-backlog` command, which is useless in a repository with no usable quest. Evaluating
 * the readiness gate first means the not-ready case gets N1/N2/N5/N6 (whose commands DO work), and
 * the ready case still gets exactly this message at exit `6`. Like every other guard here it runs
 * BEFORE the scaffold (LCLI-358.1), so a refusal still writes nothing.
 */
function assertBacklogProjectChoice(parsed: InitArgs, root: string): void {
  if (parsed.tracker === "quest" && !parsed.migrateBacklog && !parsed.keepBacklogTasks && hasBacklogProject(root)) {
    throw new LoreError(
      "validation",
      `selecting Quest here would leave the Backlog.md project at ${LEGACY_BACKLOG_DIR}/ behind, and that must be a deliberate choice`,
      BACKLOG_MIGRATION_COMMANDS_HINT,
      { marker: BACKLOG_PROJECT_MARKER },
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
  /** What a plain `--migrate-backlog` run did about `backlog/` (LCLI-467); absent when no migration ran. */
  backlogRemoval?: InitBacklogRemoval,
): number | Promise<number> {
  // LCLI-592 (ADR ruling (a), Amendments 1-4): with a Claude or Codex bridge selected, report whether
  // that runtime has the opum-lore plugin — after target selection, before any bridge write, and
  // without mutating anything. Synchronous under LORE_AGENT_PLUGINS=off, so a run with detection
  // off keeps whatever sync/async shape it had before.
  const runtimes = pluginRuntimesFor(parsed.agents, parsed.codex);
  const complete = (plugins: AgentPluginChecks | undefined) =>
    completeNonInteractive(options, parsed, base, clock, priorSelection, plugins, migration, verified, backlogRemoval);
  if (runtimes.length === 0) return complete(undefined);
  return thenMaybe(detectLorePlugins(agentPluginPortFor(options), runtimes), complete);
}

/** The marketplace-plugin runtimes a bridge selection covers: `claude` for the Claude bridge, `codex` for the Codex one. */
function pluginRuntimesFor(claude: boolean, codex: boolean): AgentRuntime[] {
  return [...(claude ? (["claude"] as const) : []), ...(codex ? (["codex"] as const) : [])];
}

/** {@link InitOptions.agentPlugins}, defaulting to the runtimes' own list commands (or nothing, when switched off). */
function agentPluginPortFor(options: InitOptions): AgentPluginPort {
  return options.agentPlugins ?? createAgentPluginPort(options.root);
}

function completeNonInteractive(
  options: InitOptions,
  parsed: InitArgs,
  base: { root: string; created: string[]; skipped: string[] },
  clock: () => Date,
  priorSelection: () => TrackerSelection,
  plugins: AgentPluginChecks | undefined,
  migration?: TrackerMigrationResult,
  verified?: InitTrackerCheck,
  backlogRemoval?: InitBacklogRemoval,
): number | Promise<number> {
  const scaffoldTargets = [...new Set(parsed.scaffolds)];
  // Detected on every run, not only the wizard's (LCLI-358.3): three PATH lookups and three
  // `existsSync` calls, no subprocess — so the pre-LORE-260 "a bare init spawns no tracker"
  // guarantee holds, and a `--json` consumer sees the same facts the wizard shows a human.
  const environment = (options.trackerEnvironment ?? (() => detectTrackerEnvironment(options.root)))();
  const agents = parsed.agents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const codex = parsed.codex ? applyCodexBridge({ root: options.root, force: false, check: false }) : undefined;
  const hermes = parsed.hermes ? applyHermesBridge({ root: options.root, force: false, check: false }) : undefined;
  const antigravity = parsed.antigravity
    ? applyAntigravityBridge({ root: options.root, force: false, check: false })
    : undefined;
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
        plugins,
        hermes,
        antigravity,
        scaffolds,
        trackerEnvironment: environment,
        trackerCheck: undefined,
        tracker: parsed.tracker,
        migration,
        backlogRemoval,
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
        plugins,
        hermes,
        antigravity,
        scaffolds,
        trackerEnvironment: environment,
        trackerCheck,
        tracker: parsed.tracker,
        migration,
        backlogRemoval,
      }),
      options.output,
      options.stdout,
    );
    return EXIT_OK;
  });
}

function runBacklogMigration(
  options: InitOptions,
  migrationOptions?: QuestBacklogMigrationOptions,
): Promise<TrackerMigrationResult> {
  if (options.migrateBacklog !== undefined) return options.migrateBacklog(migrationOptions);
  return migrateBacklogTasksToQuest(
    createQuestBacklogMigration(options.root),
    options.root,
    undefined,
    migrationOptions,
  );
}

/** Shared by the wizard's pre-apply confirm and the flag path's post-apply notice (LCLI-521). */
function renderExclusionNotice(excluded: readonly QuestMigrationExcludedRecord[], importedFamily: string): string {
  const families = [...new Set(excluded.map((record) => record.family))].sort();
  const ids = excluded.map((record) => record.sourceIdentifier).sort();
  return (
    `\nPreserving Backlog ids imports one id family per run (${importedFamily} here). ` +
    `${excluded.length} record(s) in ${families.join(", ")} will NOT be imported by this run:\n` +
    ids.map((id) => `  ${id}`).join("\n") +
    "\nRun again with --preserve-source-ids --source-family <PREFIX> for each remaining family.\n"
  );
}

/**
 * The flag path's answer to the question the wizard asks interactively (LCLI-521 AC#3): a
 * non-interactive `--preserve-source-ids` run cannot be asked to confirm anything, so it is told
 * instead and proceeds — the operator already chose the flag and the family explicitly, so refusing
 * what was asked for outright would break an existing scripted caller with no way to opt back in.
 * Mirrors `resolveScriptedBacklogRemoval`'s "warn on stderr, never silently" shape for the analogous
 * backlog-removal question. Stderr only, never stdout: a `--json` run's stdout is the envelope alone
 * (cli-contract §4), and `migration.excluded` already carries this same data there in full.
 */
function warnExcludedFamilies(options: InitOptions, migration: TrackerMigrationResult, importedFamily?: string): void {
  if (migration.excluded.length === 0 || importedFamily === undefined) return;
  (options.stderr ?? process.stderr).write(renderExclusionNotice(migration.excluded, importedFamily));
}

/**
 * Archive-and-delete `backlog/`, reusing the cutover's own leg verbatim (LCLI-467 AC#2).
 *
 * **Reused as-is rather than reimplemented lighter.** `archiveAndDeleteBacklog(root, zip, id, txn)`
 * takes a root, a zip transport, an id fragment and an injectable fs seam — and nothing else. It
 * reads no cutover plan, writes no `state.json`, knows nothing about `--adopt-manifest`, the
 * adoption ledger, or the Quest receipt; `tracker-cutover.ts` supplies `id` from its own digest and
 * persists the evidence afterwards, which is coordination the CALLER performs, not an assumption
 * the leg carries. Its one residual coupling is cosmetic: the staging directory it renames
 * `backlog/` into during its commit boundary lives under `.lore/cutover/`, and it is transient —
 * the transaction prunes it on success and names it in the error when it cannot. So the
 * `--adopt-manifest`-coordinated assumptions are separable, and a lighter variant would mean a
 * second, less-verified deletion path over the same user files: it is the plan → build → verify →
 * re-hash → atomic-rename → re-verify → unlink pipeline that makes "your files are in the archive
 * OR still on disk" true at every exit point, and the prompt above promises exactly that.
 *
 * `verifyArchive` is re-run on the returned evidence for the same reason `applyCutover` re-runs it:
 * the deletion has already happened by then, so this is the assertion that what replaced the files
 * is intact, not a precondition.
 */
function removeBacklogDirectory(options: InitOptions, id: string): InitBacklogRemoval {
  const evidence = archiveAndDeleteBacklog(options.root, storeZipWriter, id);
  verifyArchive(options.root, evidence, storeZipWriter);
  return { removed: true, zipRel: evidence.zipRel, entryCount: evidence.entries.length };
}

/** `backlogRemovalReadiness` against the injected (or real) read-only git transport. */
function readBacklogRemovalReadiness(options: InitOptions): ReturnType<typeof backlogRemovalReadiness> {
  return backlogRemovalReadiness(options.root, options.backlogGit ?? bunGitPreflightSpawn(options.root));
}

/**
 * The id fragment naming this run's archive. The cutover uses its Quest migration digest; a plain
 * migration has the same digest available, so the two paths name their evidence the same way and a
 * `.lore/archive/backlog-<digest>.zip` can be traced back to the migration that caused it.
 */
function archiveId(migration: TrackerMigrationResult): string {
  return migration.digest.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24) || "migration";
}

/**
 * The scripted answer (LCLI-467 AC#3): a non-interactive `--migrate-backlog` resolves the question
 * from flags alone, and **never silently**.
 *
 * - `--remove-backlog` → archive and delete, or REFUSE with the reason git gave. A caller that
 *   asked for a destructive operation and cannot have it safely gets an error, not a quiet skip:
 *   `denied` (exit 4) is the contract's "the operation is refused" code, and the refusal names the
 *   unmet precondition so the caller can fix it and rerun.
 * - `--no-remove-backlog` → keep it, silently. The choice was explicit, so there is nothing to say.
 * - neither → keep it, and SAY SO on stderr, naming both flags. This is the case AC#3 calls
 *   "silently skipped": the default has to stay non-destructive for every existing scripted caller,
 *   so the flag that changes it is surfaced rather than the behavior.
 */
function resolveScriptedBacklogRemoval(
  options: InitOptions,
  parsed: InitArgs,
  migration: TrackerMigrationResult,
): InitBacklogRemoval {
  if (!parsed.removeBacklog) {
    if (!parsed.noRemoveBacklog) {
      (options.stderr ?? process.stderr).write(
        "\nbacklog/ was left in place: its tasks are in Quest, but the files are still on disk.\n" +
          "Pass --remove-backlog to delete them (a verified zip is kept in .lore/archive/), or\n" +
          "--no-remove-backlog to keep them without this notice.\n",
      );
    }
    return {
      removed: false,
      reason: parsed.noRemoveBacklog ? "--no-remove-backlog was passed" : "no --remove-backlog/--no-remove-backlog",
    };
  }
  const readiness = readBacklogRemovalReadiness(options);
  if (!readiness.ready) {
    throw new LoreError(
      "denied",
      `refusing --remove-backlog: ${readiness.reason}`,
      "commit or clean backlog/ so `git checkout -- backlog/` can restore it, then rerun; or drop --remove-backlog",
      { reason: readiness.reason },
    );
  }
  return removeBacklogDirectory(options, archiveId(migration));
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
    // The coordinated cutover never accepts --preserve-source-ids/--source-family (tracker-cutover.ts
    // has no such options), so it can never leave a family behind — always empty, not merely unset.
    excluded: [],
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
  let wantAntigravity = false;
  let tracker: TrackerBackend = "quest";
  let initializeGit = false;
  let jira: JiraTrackerConfig | undefined;
  // Detected ONCE, before the tracker question (LCLI-358.3), and never re-read: nothing this wizard
  // does can change the answer any more, because it installs nothing and initializes nothing
  // (ADR-0024). Three PATH lookups and three `existsSync` calls — no backend is spawned, which is
  // what makes it affordable to describe every choice rather than only the one taken.
  const environment = trackerEnvironmentFor(options);
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
    //
    // ADR-0024: the selection is now gated on readiness INSIDE `chooseTracker` (O1/O2/O4/O5, and
    // O12 for a re-selected unready backend), and a "yes" there throws before this line returns.
    const chosen = await chooseTracker(options, prompter, environment);
    tracker = chosen.backend;
    // The Backlog-takeover offer (O3/O6), in the position today's migrate/keep/backlog prompt
    // occupied. It fires when the backend is settled and a real Backlog project exists — for a
    // quest or backlog selection only, so a deliberate `none`/`jira` choice is never interrupted
    // over tasks it did not ask about. "Yes" stops with the migration commands and writes nothing;
    // "no" is the explicit keep, and lore still never runs the migration itself.
    if ((tracker === "quest" || tracker === "backlog") && hasBacklogProject(options.root)) {
      const stop = await prompter.confirm(backlogTakeoverQuestion(), tracker === "quest");
      if (stop) throw backlogTakeoverStopped(tracker);
    }
    if (tracker === "jira") {
      // Asked here — immediately after the backend is settled and still before the first byte is
      // written (LCLI-358.4). A jira selection Lore cannot configure ends the run with the
      // directory untouched, rather than after five more questions the operator answered for
      // nothing.
      jira = await configureJira(options, parsed, prompter);
    }
    // One multi-select (LCLI-462) replaces what used to be up to three sequential yes/no questions
    // (Claude, Codex, Hermes) — coordinated with quest-cli so both CLIs answer the fleet's shared
    // "which instruction files should this run write?" complaint the same way: same library
    // (@clack/prompts), same wording, same required:false/empty-selection-legal semantics, same
    // cancel handling. Only the AVAILABLE bridges (detectAgentAvailability(), same check as before)
    // are offered — an uninstalled harness was never selectable, and still isn't.
    //
    // NOTHING starts pre-checked (review round 2, LCLI-462): the user's original complaint that
    // started this whole change was tools writing instruction files nobody asked for. Pre-checking
    // every detected bridge means a bare Enter on a machine with all three binaries on PATH writes
    // all three — MORE unrequested files than the sequential questions ever risked at once, and the
    // same failure shape as the complaint, not a fix for it. The old sequential defaults (Claude/
    // Hermes=true, Codex=conditional on Claude) don't translate to one simultaneous choice either
    // way, so there was never a "faithful" default to carry forward — an empty start is the direct
    // generalization of LCLI-442's actual rule ("don't write something nobody explicitly chose") to
    // all three bridges, not just the Claude/Codex pair it originally covered, and it preserves this
    // wizard's own pre-existing "decline every bridge" outcome as the free, no-toggle-needed default
    // rather than something the operator has to opt back into.
    const available = detectAgentAvailability(options);
    const bridgeOptions: { readonly value: string; readonly label: string }[] = [];
    if (available.claude) {
      bridgeOptions.push({ value: "claude", label: "CLAUDE.md — Claude Code" });
    }
    if (available.codex) {
      // Widened (LCLI-464, coordinated with quest-cli) to name pi and OpenCode: both confirmed
      // against primary docs to read AGENTS.md as their primary convention (CLAUDE.md only as a
      // fallback), so they need no dedicated file of their own, unlike Claude Code (see the
      // `antigravity` option below for why that distinction matters). OpenCode is retired as an
      // agent runtime THIS fleet builds on, but that retirement does not reach here: this
      // repository is the published CLI writing into an external user's own project on request,
      // the same product-surface exemption `lore init --codex` already relies on.
      bridgeOptions.push({
        value: "codex",
        label: "AGENTS.md — Codex, Cursor, Zed, Warp, Aider, RooCode, OpenCode, pi, and other AGENTS.md-reading tools",
      });
    }
    if (available.hermes) {
      bridgeOptions.push({ value: "hermes", label: ".hermes.md — Hermes project context" });
    }
    if (available.antigravity) {
      // A genuine new target, not folded into the AGENTS.md option above (LCLI-464): Google's own
      // docs (antigravity.google/docs/cli/best-practices/) name GEMINI.md and AGENTS.md as two
      // equally official, parallel files — not primary/fallback — so GEMINI.md is Antigravity's own
      // dedicated convention the same way CLAUDE.md is Claude Code's, not merely "also works" the
      // way CLAUDE.md is for pi. Gemini CLI reads the same filename, so this option serves both.
      bridgeOptions.push({ value: "antigravity", label: "GEMINI.md — Google Antigravity, Gemini CLI" });
    }
    if (bridgeOptions.length > 0) {
      const selected = await prompter.multiselect(
        "Select instruction files to write (space toggles, enter accepts)",
        bridgeOptions,
        [],
      );
      wantAgents = selected.includes("claude");
      wantCodex = selected.includes("codex");
      wantHermes = selected.includes("hermes");
      wantAntigravity = selected.includes("antigravity");
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

  // LCLI-592: the opum-lore plugin for each ticked Claude/Codex bridge, read now — after the
  // selection and before the first byte of this run is written. Read-only; never changes the exit.
  const pluginRuntimes = pluginRuntimesFor(wantAgents, wantCodex);
  const plugins =
    pluginRuntimes.length > 0 ? await detectLorePlugins(agentPluginPortFor(options), pluginRuntimes) : undefined;

  // Every question is answered and nothing can still refuse: only now is the first byte written
  // (LCLI-358.1, AC#4). An EOF/Ctrl-D or a declined git prompt above throws out of the `try` and
  // reaches here never — leaving the directory exactly as the run found it, `.git` included.
  if (initializeGit) {
    git.initialize();
  }
  const base = applyBaseScaffold(options, plan);

  // LCLI-356 AC#2, extended to the wizard (opag ruling, 2026-08-31): verified BEFORE persisting,
  // exactly like the explicit `--tracker` path — the commitment is the selection, whether the
  // operator typed it or accepted the prompt's default. Unlike the silent zero-config default
  // (LORE-260), the wizard already consulted the detected environment via `chooseTracker`, so this
  // closes a real gap at no new cost. `none` has nothing to verify; `jira` is verified by
  // `configureJira` above instead. There is no longer a migration to exempt (ADR-0024): the wizard
  // never runs one, so every selection that reaches here is verified the same way.
  const verified =
    tracker === "none" || tracker === "jira" ? undefined : await verifyBackendReadiness(options, tracker);
  persistTrackerBackend(options.root, tracker, jira);

  const clock = options.clock ?? (() => new Date());
  const agents = wantAgents ? applyAgentsBridge({ root: options.root, force: false, check: false }) : undefined;
  const codex = wantCodex ? applyCodexBridge({ root: options.root, force: false, check: false }) : undefined;
  const hermes = wantHermes ? applyHermesBridge({ root: options.root, force: false, check: false }) : undefined;
  const antigravity = wantAntigravity
    ? applyAntigravityBridge({ root: options.root, force: false, check: false })
    : undefined;
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
    plugins,
    hermes,
    antigravity,
    scaffolds,
    trackerEnvironment: environment,
    trackerCheck,
    tracker,
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
 * Ask which tracker to use, with the detected environment in view, and gate the answer on readiness
 * (LCLI-358.3 AC#1; ADR-0024's O1/O2/O4/O5/O12).
 *
 * **A selection is checked against what was already detected, and lore fixes nothing itself.** The
 * three states and their dispositions, exactly as ADR-0024's interactive table prescribes:
 *
 *  - `quest`, not ready: OFFER to stop (O1 when the CLI is missing, O2 when the repository has no
 *    workspace). "Yes" throws {@link trackerNotReady} — the stop, exit `3`/`6`, nothing written;
 *    "no" returns to the tracker question and detection continues (O1b/O2b).
 *  - `backlog`, not ready: NO offer, and no prompt at all (O4/O5). The stop is immediate, which is
 *    why Backlog's row in that table has an empty answer column.
 *  - `jira`: never gated here. Its readiness is credential-profile state jira-cli owns, and
 *    `configureJira` — which runs immediately after this returns — asks jira-cli directly, with its
 *    own `not_found` for a missing binary (O7/O8/O9, unchanged).
 *
 * **The offer is one-shot per backend per run (O12).** Selecting the same unready backend a second
 * time stops with the same instructions rather than asking again: a question re-asked after a "no"
 * is a question that was not really answered, and the loop's purpose is to let the operator choose
 * something else, not to re-offer what they declined.
 *
 * **Bounded to {@link MAX_TRACKER_ATTEMPTS} passes.** The loop exists so an operator who declines to
 * stop and install can pick a different backend instead of having the run end on them — but a loop
 * whose exit depends only on the operator answering differently is a loop that can spin forever
 * against an automated or confused caller. Two passes is enough for "I picked wrong, let me pick
 * again" and cannot become a prompt the run never escapes.
 */
async function chooseTracker(
  options: InitOptions,
  prompter: InitPrompter,
  environment: TrackerEnvironment,
): Promise<{ backend: TrackerBackend }> {
  (options.stderr ?? process.stderr).write(renderTrackerEnvironment(environment));
  // Backends whose readiness offer the operator has already declined in THIS run (O12).
  const declined = new Set<TrackerBackend>();
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
    // `entry === undefined` is `none` (no CLI, nothing to be ready) and `backend === "jira"` is the
    // credential-owned case above: both pass straight through.
    if (entry === undefined || backend === "jira" || trackerReady(entry)) {
      return { backend };
    }
    if (entry.backend === "backlog" || declined.has(backend)) {
      // O4/O5 (no offer exists for backlog) and O12 (this offer was already declined once).
      throw trackerNotReady(entry);
    }
    if (await prompter.confirm(readinessOfferQuestion(entry), true)) {
      throw trackerNotReady(entry);
    }
    declined.add(backend);
  }
  // Unreachable: every path above returns or throws. Present so the bound is a property of the code
  // rather than of the reader's confidence in it.
  throw new LoreError(
    "usage",
    "no tracker backend was selected",
    `run \`lore init --tracker ${TRACKER_BACKENDS.join("|")}\``,
  );
}

/** Human-facing names for the backends a readiness stop can name. */
const BACKEND_LABELS: Readonly<Record<Exclude<TrackerBackend, "none">, string>> = Object.freeze({
  quest: "Quest",
  backlog: "Backlog.md",
  jira: "Jira",
});

/** The command that initializes one backend's repository state — the second step of every remedy. */
const TRACKER_INIT_COMMANDS: Readonly<Record<Exclude<TrackerBackend, "none">, string>> = Object.freeze({
  quest: "quest init",
  backlog: "backlog init",
  jira: "jira init",
});

/**
 * The readiness offer's question (O1/O2), phrased for the state that prompted it. Two sentences
 * because the operator is choosing between two actions: stop and fix it, or return and pick
 * something else. The default is YES (ADR-0024's proposed defaults): they selected this backend and
 * it cannot serve them, so stopping is the useful next step.
 */
function readinessOfferQuestion(entry: TrackerEnvironmentEntry): string {
  const label = BACKEND_LABELS[entry.backend];
  return entry.installed
    ? `${label} is installed, but this repository is not set up for it. Stop \`lore init\` here so you can run \`${TRACKER_INIT_COMMANDS[entry.backend]}\`, then rerun?`
    : `${label} is not installed. Stop \`lore init\` here so you can install it, then rerun?`;
}

/**
 * The one stop for a selected backend this run cannot use — O1/O2/O4/O5 in the wizard, N1/N2/N5/N6
 * on the `--tracker` path, and O12 for a re-selected backend whose offer was already declined.
 *
 * **The class names the STATE lore can see at exit, never the operator's answer** (ADR-0024, "Exit
 * codes"): a missing CLI is `not_found` (`3`), an installed CLI over a repository that carries none
 * of its marker is `validation` (`6`). A "yes" here persists nothing and installs nothing, so the
 * backend is exactly as unusable at exit as it was when the offer was shown — reporting `0` would
 * be the LCLI-356 failure shape this whole change exists to close.
 *
 * The remedy is the same text the wizard's environment summary would have shown, plus the steps
 * that make the backend usable: install it, initialize its repository state, rerun. `quest init` is
 * dropped when the marker is already there — telling an initialized repository to initialize is
 * noise — and the install command is PINNED for quest (LCLI-650's pair lock): `latest` can install
 * a quest that the very next command refuses.
 */
function trackerNotReady(entry: TrackerEnvironmentEntry): LoreError {
  const label = BACKEND_LABELS[entry.backend];
  const initCommand = TRACKER_INIT_COMMANDS[entry.backend];
  const chooseAnother = "choose another backend with `lore init --tracker <quest|backlog|jira|none>`";
  const input = { backend: entry.backend, binary: entry.binary, package: entry.package };
  if (!entry.installed) {
    // Backlog's requirement is a FLOOR it enforces (LCLI-370); quest's is the exact pair (LCLI-650),
    // already carried by the pinned command. Naming the floor is what the ADR's O4 text does.
    const requirement = entry.backend === "backlog" ? ` (${MIN_BACKLOG_VERSION} or newer)` : "";
    const steps =
      entry.initialized === true
        ? `install ${entry.package}${requirement} with your own package manager (\`${installCommandFor(entry)}\`), then rerun \`lore init\``
        : `install ${entry.package}${requirement} with your own package manager (\`${installCommandFor(entry)}\`), run \`${initCommand}\`, then rerun \`lore init\``;
    return new LoreError(
      "not_found",
      `the \`${entry.binary}\` CLI is required for the ${entry.backend} tracker and is not on PATH`,
      `${steps} — or ${chooseAnother}`,
      input,
    );
  }
  return new LoreError(
    "validation",
    `${label} is installed, but this repository is not set up for it: ${entry.marker ?? "its repository marker"} does not exist here`,
    `run \`${initCommand}\` here, then rerun \`lore init\` — or ${chooseAnother}`,
    { ...input, marker: entry.marker ?? null },
  );
}

/**
 * The O3/O6 offer's question, shared verbatim by both selections — the ADR gives O6 "the same offer
 * text as O3". It says what stopping is FOR rather than naming flags, because the operator has not
 * seen the migration flags yet.
 */
function backlogTakeoverQuestion(): string {
  return `This repository has a Backlog.md project (${BACKLOG_PROJECT_MARKER}). Quest can take its tasks over — stop \`lore init\` here and run the migration first?`;
}

/**
 * The stop an accepted O3/O6 offer raises: the exact commands from ADR-0024's "Backlog.md" section,
 * and nothing written — the migration is the operator's own step, never lore's (DEC-57). `validation`
 * (exit `6`) reuses N3's existing class: a choice about existing Backlog tasks is still outstanding.
 */
function backlogTakeoverStopped(selection: "quest" | "backlog"): LoreError {
  return new LoreError(
    "validation",
    `stopping before anything is written: this repository has a Backlog.md project at ${LEGACY_BACKLOG_DIR}/, and ${
      selection === "quest" ? "Quest can take its tasks over" : "its tasks can be moved into Quest"
    }`,
    BACKLOG_MIGRATION_COMMANDS_HINT,
    { marker: BACKLOG_PROJECT_MARKER, tracker: selection },
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
  // Whether the underlying STREAM has ended — distinct from, and outliving, any one `rl` below
  // (LCLI-462). `multiselect` closes and later re-opens the readline interface around each call (see
  // its doc comment), so "has this rl instance closed" cannot be the only signal; "has stdin itself
  // hit EOF" must survive across that recreation, or a wizard that loses stdin mid-multiselect would
  // sail through its next `confirm`/`choose`/`ask` call as if nothing happened.
  let streamEnded = false;
  streams.input.once("end", () => {
    streamEnded = true;
  });

  /** The one classified diagnostic for a wizard that lost its input, raised from every path below. */
  function interrupted(): LoreError {
    return new LoreError(
      "usage",
      "stdin closed or the wizard was interrupted before it finished (EOF/Ctrl-D or Ctrl-C)",
      "answer every prompt, or run prompt-free with `lore init --yes` (or --claude/--codex/--scaffold <target>/--obsidian/--no-tracker/--check-tracker)",
    );
  }

  // The readline interface backing `confirm`/`choose`/`ask`, lazily (re)created (LCLI-462): closed
  // by `multiselect` before it hands stdin to @clack/prompts (two libraries both trying to own raw
  // mode and keypress events on the same stream is a real conflict, not a hypothetical one — clack's
  // own prompt manages entering/exiting raw mode itself and expects to be the only listener while
  // it runs) and re-opened the next time a readline-based question is asked. `close()` on a `rl` that
  // was never (re)created after `multiselect` last tore it down is a no-op, which is why every path
  // below goes through `closeReadline()` rather than calling `rl.close()` directly.
  let rl: readline.Interface | undefined;
  let alreadyClosed = false;
  let closedEarly: Promise<never>;

  /** (Re)open the readline interface if `multiselect` (or nothing yet) has left it closed. */
  function openReadline(): readline.Interface {
    if (rl !== undefined && !alreadyClosed) {
      return rl;
    }
    rl = readline.createInterface({ input: streams.input, output: streams.output });
    // Whether the interface has already closed by the time a question is asked. Without this,
    // `ask`'s race is decided by timing rather than by intent (LCLI-358.1): when stdin has ALREADY
    // hit EOF, `rl.question()` rejects synchronously with Node's own "readline was closed", which
    // wins the race against `closedEarly` and surfaces an internal message instead of the
    // classified `usage` diagnostic. That was previously masked because the base scaffold ran before
    // the wizard and gave `closedEarly` a head start; with the scaffold moved after the prompts the
    // race is genuinely tight, so the outcome is now decided explicitly instead of by luck.
    alreadyClosed = false;
    closedEarly = new Promise<never>((_resolve, reject) => {
      rl?.once("close", () => {
        alreadyClosed = true;
        reject(interrupted());
      });
    });
    // Prevents an "unhandled promise rejection" once the wizard finishes normally and its own
    // `prompter.close()` call fires `close` for the first time, after every `ask()` race is already
    // settled and nothing is awaiting `closedEarly` anymore — see the doc comment above.
    closedEarly.catch(() => {});
    return rl;
  }

  /** Close the readline interface if one is open; safe to call when none is (double-close, or none ever opened). */
  function closeReadline(): void {
    if (rl !== undefined) {
      rl.close();
    }
  }

  /**
   * Race one `rl.question()` call against the interface's own `close` event (see the doc above),
   * with the already-closed case decided up front rather than left to the race, and Node's own
   * post-close rejection translated into the same classified error.
   */
  async function ask(promptText: string): Promise<string> {
    if (streamEnded) {
      throw interrupted();
    }
    const activeRl = openReadline();
    try {
      return await Promise.race([activeRl.question(promptText), closedEarly]);
    } catch (cause) {
      if (cause instanceof LoreError) {
        throw cause;
      }
      // `rl.question()` on a closed interface rejects with an internal readline error; the operator
      // needs the actionable EOF diagnostic, not that.
      throw alreadyClosed || streamEnded ? interrupted() : cause;
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
    async multiselect(question, options, defaultSelected) {
      if (streamEnded) {
        throw interrupted();
      }
      // Hand stdin over to @clack/prompts entirely for the duration of this one prompt — see
      // `openReadline`'s doc comment for why the readline interface must not stay open alongside it.
      closeReadline();
      // A second, independent guard against a hang if stdin ends WHILE clack's own prompt is
      // active: clack's `signal` option maps an aborted controller to the same cancelled outcome as
      // Ctrl+C (`isCancel` below), so this reuses clack's own cancellation path rather than needing
      // a bespoke one. Ctrl+C itself is handled natively by clack — no wiring needed for that case.
      const controller = new AbortController();
      const onStreamEnd = () => controller.abort();
      streams.input.once("end", onStreamEnd);
      try {
        const result = await clackMultiselect<string>({
          message: question,
          options: options.map((option) => ({ value: option.value, label: option.label })),
          initialValues: [...defaultSelected],
          required: false,
          // `streams.input`/`.output` are typed against the minimal NodeJS.Readable/WritableStream
          // interfaces (matching `readline`'s own parameter shape above), narrower than @clack's
          // concrete `node:stream` `Readable`/`Writable` — both real process.stdin/stderr and every
          // test double this repo passes here are actual Node streams at runtime, so this cast
          // reflects that rather than papering over a real mismatch.
          input: streams.input as unknown as Readable,
          output: streams.output as unknown as Writable,
          signal: controller.signal,
        });
        if (clackIsCancel(result)) {
          throw interrupted();
        }
        // `isCancel` narrows `typeof CANCEL_SYMBOL` out of a literal symbol union, not out of the
        // broader `symbol` clack's own return type uses — the cast states what the guard above
        // already established at runtime.
        return result as string[];
      } finally {
        streams.input.off("end", onStreamEnd);
      }
    },
    close() {
      closeReadline();
    },
  };
}

/**
 * Run the backlog-coupling capability check (AC#1/AC#4): probe the injected {@link
 * InitOptions.adapter} (defaulting to the real `backlog` binary on PATH). Never throws — a
 * missing/incapable binary is recorded as `warnings` advisory (stderr) plus the returned {@link
 * InitTrackerCheck}, never a failed `lore init` run, since the base scaffold (and any agent
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
    parsed.antigravity ||
    parsed.scaffolds.length > 0 ||
    parsed.noTracker ||
    parsed.checkTracker ||
    parsed.installTracker ||
    parsed.noInstallTracker ||
    parsed.migrateBacklog ||
    parsed.keepBacklogTasks ||
    parsed.tracker !== undefined ||
    parsed.skillSource !== undefined
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
  const antigravity = parsed.flags.has("antigravity");
  // `--no-tracker`/`--check-tracker` are the accurate spellings now that the probe follows the
  // selected backend; the `-backlog` originals stay as aliases, the same way `--agents` aliases
  // `--claude` (LCLI-358.2).
  const noTracker = parsed.flags.has("no-tracker") || parsed.flags.has("no-backlog");
  const checkTracker = parsed.flags.has("check-tracker") || parsed.flags.has("check-backlog");
  const migrateBacklog = parsed.flags.has("migrate-backlog");
  const keepBacklogTasks = parsed.flags.has("keep-backlog-tasks");
  const preserveSourceIds = parsed.flags.has("preserve-source-ids");
  const sourceFamily = singleOptionValue(parsed, "source-family");
  const removeBacklog = parsed.flags.has("remove-backlog");
  const noRemoveBacklog = parsed.flags.has("no-remove-backlog");
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
  const skillSourceValue = singleOptionValue(parsed, "skill-source");
  if (skillSourceValue === "") {
    throw usage("--skill-source needs a value", `pass --skill-source ${SKILL_SOURCES.join(" or --skill-source ")}`);
  }
  if (skillSourceValue !== undefined && !SKILL_SOURCES.includes(skillSourceValue as SkillSource)) {
    throw new LoreError(
      "validation",
      `unsupported skill source ${JSON.stringify(skillSourceValue)}`,
      `use one of: ${SKILL_SOURCES.join(", ")}`,
      { skillSource: skillSourceValue },
    );
  }
  const skillSource = skillSourceValue as SkillSource | undefined;
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
      "pass at most one of --install-tracker / --no-install-tracker (both are deprecated and install nothing — ADR-0024)",
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
    antigravity,
    scaffolds,
    noTracker,
    checkTracker,
    tracker,
    migrateBacklog,
    keepBacklogTasks,
    preserveSourceIds,
    sourceFamily,
    removeBacklog,
    noRemoveBacklog,
    adoptManifest: adoptManifestValue,
    approvalDigest: approvalDigestValue,
    allowNoGit,
    installTracker,
    noInstallTracker,
    jiraProfile,
    jiraProject,
    skillSource,
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

/** Persist `[agents].skill_source` (LCLI-442), preserving every unrelated config byte. */
export function persistAgentsSkillSource(root: string, skillSource: SkillSource): void {
  assertNoSymlinkInPath(root, CONFIG_REL_PATH);
  loadConfig({ root });
  const absPath = join(root, CONFIG_REL_PATH);
  const current = readFileSync(absPath, "utf8");
  const next = withAgentsSkillSource(current, skillSource);
  if (next !== current) {
    writeFileAtomic(absPath, next, CONFIG_REL_PATH);
  }
}

/** Upsert `[agents].skill_source` without reserializing or dropping future keys/comments. */
function withAgentsSkillSource(current: string, skillSource: SkillSource): string {
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const assignment = `skill_source = ${JSON.stringify(skillSource)}`;
  const agentsHeader = /^[ \t]*\[[ \t]*agents[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/mu;
  const header = agentsHeader.exec(current);
  if (header !== null) {
    const bodyStart = header.index + header[0].length;
    const nextHeader = /^[ \t]*(?:\[[^\]\r\n]+\]|\[\[[^\]\r\n]+\]\])[ \t]*(?:#.*)?$/mu.exec(current.slice(bodyStart));
    const bodyEnd = nextHeader === null ? current.length : bodyStart + nextHeader.index;
    const body = current.slice(bodyStart, bodyEnd);
    const skillSourceLine = /^([ \t]*)skill_source[ \t]*=.*$/mu;
    if (skillSourceLine.test(body)) {
      return current.slice(0, bodyStart) + body.replace(skillSourceLine, `$1${assignment}`) + current.slice(bodyEnd);
    }
    const headerEndsWithEol = /\r?\n$/u.test(header[0]);
    const insertion = `${headerEndsWithEol ? "" : eol}${assignment}${eol}`;
    return current.slice(0, bodyStart) + insertion + current.slice(bodyStart);
  }

  const separator = current.length === 0 ? "" : current.endsWith("\n") ? eol : `${eol}${eol}`;
  return `${current}${separator}[agents]${eol}${assignment}${eol}`;
}

/** Detect installed agents without making absence or a broken PATH fatal to onboarding. */
function detectAgentAvailability(options: InitOptions): AgentAvailability {
  if (options.agentAvailability) return options.agentAvailability();
  try {
    return {
      claude: Bun.which("claude") !== null,
      codex: Bun.which("codex") !== null,
      hermes: Bun.which("hermes") !== null,
      // Gated on `gemini` (Gemini CLI), not an "antigravity" binary — Antigravity itself is a GUI
      // IDE with nothing on PATH to detect (LCLI-464); see the wizard-code comment for why this
      // still gates the option both tools share.
      antigravity: Bun.which("gemini") !== null,
    };
  } catch {
    return { claude: false, codex: false, hermes: false, antigravity: false };
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
  for (const check of [data.plugins?.claude, data.plugins?.codex]) {
    if (check !== undefined) lines.push(...renderPluginPretty(check));
  }
  if (data.hermes) {
    lines.push("Hermes project context bridge:");
    for (const file of data.hermes.files) {
      lines.push(`  ${paint(file.action, bridgeActionColor(file.action), opts.color)} ${file.path}`);
    }
  }
  if (data.antigravity) {
    lines.push("Antigravity/Gemini CLI context bridge:");
    for (const file of data.antigravity.files) {
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
    // LCLI-521 AC#1: surface what --preserve-source-ids left behind in the finished summary too,
    // not only in the wizard's pre-apply warning — a flag-path or --plain run never sees that warning.
    if (data.migration.excluded.length > 0) {
      const families = [...new Set(data.migration.excluded.map((record) => record.family))].sort();
      lines.push(
        paint(
          `  ${data.migration.excluded.length} record(s) left behind (${families.join(", ")}): re-run with --preserve-source-ids --source-family <PREFIX> to import them`,
          ANSI.yellow,
          opts.color,
        ),
      );
    }
  }
  if (data.backlogRemoval !== undefined) {
    lines.push(
      data.backlogRemoval.removed
        ? `backlog/: deleted from the working tree, ${data.backlogRemoval.entryCount} file(s) archived to ${data.backlogRemoval.zipRel}`
        : `backlog/: left in place (${data.backlogRemoval.reason})`,
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
  for (const check of [data.plugins?.claude, data.plugins?.codex]) {
    if (check !== undefined) lines.push(...renderPluginPlain(check));
  }
  if (data.hermes) {
    for (const file of data.hermes.files) {
      lines.push(`hermes-${file.action} ${file.path}`);
    }
  }
  if (data.antigravity) {
    for (const file of data.antigravity.files) {
      lines.push(`antigravity-${file.action} ${file.path}`);
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
    if (data.migration.excluded.length > 0) {
      const families = [...new Set(data.migration.excluded.map((record) => record.family))].sort();
      lines.push(`migration-excluded count=${data.migration.excluded.length} families=${families.join(",")}`);
    }
  }
  if (data.backlogRemoval !== undefined) {
    lines.push(
      data.backlogRemoval.removed
        ? `backlog-removal deleted files=${data.backlogRemoval.entryCount} archive=${data.backlogRemoval.zipRel}`
        : "backlog-removal kept",
    );
  }
  return lines.join("\n");
}
