/**
 * commands/agents.ts — `lore agents`: generate/refresh the agent bridges (Claude, and Codex where one
 * already exists — see {@link hasCodexBridge}).
 *
 * The thin, side-effecting layer over the pure {@link planBridge} (core/agent-bridge.ts): it resolves
 * the two bridge paths, reads their current bytes, asks core what each file's next state should be,
 * and applies the writes — unless `--check`, which reports drift and writes nothing. All the bytes
 * and all the decisions live in core; only the filesystem IO and the exit-code selection live here
 * (lore-design §2.1), exactly as `lore init` splits `runInit` from `buildScaffold`.
 *
 * Contract (docs/reference/cli-surface.md §agents): no positional args; `--force` overwrites a
 * differing (possibly hand-edited) SKILL.md; `--check` reports drift without writing — a CI gate for
 * a stale bridge, returning exit `6` (`drift`) when anything is out of date, `0` otherwise. Output is
 * `kind: agents.result`. A malformed `lore:agents` marker pair in CLAUDE.md surfaces as the
 * `validation` error {@link upsertManagedBlock} throws (exit 6), never a silent guess.
 */

import { dirname, join } from "node:path";
import { type BridgeAction, CLAUDE_MD_REL_PATH, planBridge, SKILL_REL_PATH } from "../core/agent-bridge";
import {
  AGENTS_MD_REL_PATH,
  CODEX_AGENT_BLOCK_LABEL,
  CODEX_SKILL_REL_PATH,
  planCodexBridge,
} from "../core/codex-bridge";
import { ANSI, EXIT_CODES, EXIT_OK, paint, readFileIfPresent, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";
import { assertNoSymlinkInAnyPath, ensureDir, writeFileAtomic } from "./fswrite";

/** Options for {@link runAgents}; `root` and the stdout stream are injectable for tests. */
export interface AgentsOptions {
  /** The repo root the bridge is written into. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
}

/** The `agents.result` payload: the run's mode plus the decided next state of each bridge file. */
export interface AgentsResult {
  /** The repo root the bridge was generated in. */
  root: string;
  /** Whether this was a `--check` run (report only, no writes). */
  check: boolean;
  /** Whether `--force` was given. */
  force: boolean;
  /** Each bridge file and what happened (or would happen, under `--check`) to it. */
  files: ReadonlyArray<{ path: string; action: BridgeAction }>;
}

/** The parsed, validated arguments {@link applyAgentsBridge} needs — `root` plus `--force`/`--check`. */
export interface ApplyAgentsOptions {
  /** The repo root the bridge is written into (or checked against). */
  root: string;
  /** `--force`: overwrite a differing (possibly hand-edited) SKILL.md. */
  force: boolean;
  /** `--check`: report drift without writing. */
  check: boolean;
  /**
   * Also plan the Codex bridge, where one already exists (LCLI-364). Opt-in, and the opt-in is
   * load-bearing: only `lore agents` sets it.
   *
   * `lore init --claude` shares this function but is a SCOPED request — set up the Claude bridge —
   * and `lore init --codex` has its own {@link applyCodexBridge} for the other half. Covering codex
   * here unconditionally made `--claude` report and regenerate files the user did not ask about,
   * which the E2E harness caught: `LCLI-298 AC3` pins `lore init --claude`'s reported file list to
   * exactly the two Claude bridge files. `lore agents`, by contrast, means "the bridges are
   * current", so it wants both.
   */
  includeCodex?: boolean;
}

/**
 * Plan both bridge files from their on-disk bytes and apply the writes (unless `check`) — the pure
 * side-effecting core of `lore agents`, extracted (LORE-260) so `lore init`'s wizard/flags can fold
 * the agent bridge into one onboarding run without going through `runAgents`' own arg-parsing/emit
 * (which would print a second, separate envelope onto the SAME stdout `lore init` owns — the
 * `--json` contract requires stdout be exclusively `init`'s own envelope, cli-contract §4). Returns
 * the {@link AgentsResult}; the caller decides what to do with it (emit it directly for `lore agents`
 * itself, or fold it into a larger structured result for `lore init`).
 */
export function applyAgentsBridge(options: ApplyAgentsOptions): AgentsResult {
  const { root, force, check, includeCodex = false } = options;

  const skillOnDisk = normalizeOnDisk(readFileIfPresent(join(root, SKILL_REL_PATH), SKILL_REL_PATH));
  const claudeRaw = readFileIfPresent(join(root, CLAUDE_MD_REL_PATH), CLAUDE_MD_REL_PATH);
  const claudeOnDisk = normalizeOnDisk(claudeRaw);
  // Detected from the RAW (pre-normalization) bytes, so a refresh of just the managed block can
  // re-apply the file's own BOM/EOL convention instead of silently rewriting it to LF/no-BOM
  // (LORE-128) — see reapplyDiskStyle below.
  const claudeStyle = detectDiskStyle(claudeRaw);

  // Pass both flags through: a differing SKILL.md is `protected` unless `--force` was given, AND
  // `--check` is not in effect. `--check` never writes, so `--force` cannot actually take effect
  // during one — `planBridge` must not report `updated` (a claimed write) for a run that performs
  // none, or the printed trailer falls through to the inert plain-`lore agents` remedy, which
  // leaves the file `protected` again and CI stays red (LORE-129).
  const plan = planBridge({ skillOnDisk, claudeOnDisk, force, check });

  // The codex bridge is planned alongside, but ONLY where one already exists (LCLI-364). See
  // {@link hasCodexBridge} for why presence, not absence, is what arms it.
  const codexSkillRaw = readFileIfPresent(join(root, CODEX_SKILL_REL_PATH), CODEX_SKILL_REL_PATH);
  const agentsRaw = readFileIfPresent(join(root, AGENTS_MD_REL_PATH), AGENTS_MD_REL_PATH);
  const agentsStyle = detectDiskStyle(agentsRaw);
  const codexPlan =
    includeCodex && hasCodexBridge(codexSkillRaw, agentsRaw)
      ? planCodexBridge({
          skillOnDisk: normalizeOnDisk(codexSkillRaw),
          agentsOnDisk: normalizeOnDisk(agentsRaw),
          force,
          check,
        })
      : { files: [] };
  const files = [...plan.files, ...codexPlan.files];

  if (!check) {
    const targets = files.filter((file) => file.contents !== null).map((file) => file.path);
    // Swept as a whole before either file is written (LORE-93 AC#5) — `lore agents` writes two
    // files per run, and a bad target reached second in the loop must not leave the first already
    // written; ensureDir's own per-call guard alone is reactive to loop order.
    assertNoSymlinkInAnyPath(root, targets);
    for (const file of files) {
      if (file.contents === null) {
        continue; // unchanged, or protected without --force — leave the file untouched
      }
      const absPath = join(root, file.path);
      ensureDir(root, dirname(file.path));
      // CLAUDE.md is a managed-block refresh over a user's hand-authored file: re-apply its
      // original BOM/EOL convention before writing (LORE-128). SKILL.md is wholesale-regenerated
      // (planSkill), so no such preservation applies there.
      // CLAUDE.md and AGENTS.md are managed-block refreshes over hand-authored files, so each
      // re-applies its OWN original BOM/EOL convention (LORE-128). Both SKILL.md files are
      // wholesale-regenerated, so no such preservation applies to them.
      const contents =
        file.path === CLAUDE_MD_REL_PATH
          ? reapplyDiskStyle(file.contents, claudeStyle)
          : file.path === AGENTS_MD_REL_PATH
            ? reapplyDiskStyle(file.contents, agentsStyle)
            : file.contents;
      // Atomic (temp-write + rename): `lore agents` writes two files per run, one of them the user's
      // hand-authored root CLAUDE.md — a crash mid-write must never leave it truncated (fswrite.ts).
      writeFileAtomic(absPath, contents, file.path);
    }
  }

  return {
    root,
    check,
    force,
    files: files.map((file) => ({ path: file.path, action: file.action })),
  };
}

/**
 * Whether this repository has a **codex bridge to keep current** — the condition that arms the
 * codex half of `lore agents` (LCLI-364).
 *
 * The conditional is the load-bearing part, not an optimization. Before this, `--check` gated only
 * the Claude bridge and no workflow referenced codex at all, so `.codex/skills/lore/SKILL.md` and
 * AGENTS.md's managed block could drift from their generators indefinitely — and did: AGENTS.md was
 * found missing the `workspace` topic while CLAUDE.md, which has a gate, was current (LCLI-362).
 * One artifact enumerated and checked, its twin not, and the green check on the first reading as
 * coverage of both.
 *
 * But checking UNCONDITIONALLY would be its own defect. A repository that never opted into Codex has
 * no `.codex/` tree and no `lore:agents` block in AGENTS.md; planning the codex bridge there reports
 * `created` — drift — and turns every Claude-only repository permanently red. A gate everybody has
 * to disable protects nothing. So presence arms it: `lore init --codex` is what opts a repository in,
 * and from then on its codex bridge is held to the same standard as its Claude one.
 *
 * Either artifact alone counts. A repository whose AGENTS.md carries the block but whose SKILL.md was
 * deleted is exactly the drift worth catching, and so is the reverse.
 */
function hasCodexBridge(codexSkillRaw: string | undefined, agentsRaw: string | undefined): boolean {
  // `readFileIfPresent` signals "absent" with `undefined`, not `null` -- a `!== null` test here is
  // true for a MISSING file and silently arms the codex half in every Claude-only repository,
  // creating the very `.codex/` tree whose absence was supposed to disarm it.
  if (codexSkillRaw !== undefined) return true;
  return agentsRaw !== undefined && agentsRaw.includes(CODEX_AGENT_BLOCK_LABEL);
}

/**
 * Run `lore agents`: the thin CLI layer over {@link applyAgentsBridge} — parse the arguments, apply
 * the bridge, render the result, and return the exit code. `--check` writes nothing and returns `6`
 * (`drift`) when any file is out of date, `0` otherwise; a normal run returns `0` (a differing
 * SKILL.md left `protected` for lack of `--force` is reported, not an error — `--check` is the gate).
 */
export function runAgents(options: AgentsOptions): number {
  const { force, check } = parseAgentsArgs(options.args);
  // `lore agents` means "the bridges are current", so it covers Codex too where one exists.
  const result = applyAgentsBridge({ root: options.root, force, check, includeCodex: true });
  const drift = result.files.some((file) => file.action !== "unchanged");
  emit(agentsRenderable(result), options.output, options.stdout);
  return check && drift ? EXIT_CODES.drift : EXIT_OK;
}

/** Parse `agents`' tokens: no positionals; boolean `--force`/`--check`. A positional or unknown flag is a `usage` error (exit 2). */
function parseAgentsArgs(args: readonly string[]): { force: boolean; check: boolean } {
  const { positionals, flags } = parseCommandArgs(args, "agents");
  if (positionals.length > 0) {
    throw usage(
      `\`lore agents\` takes no arguments, got "${positionals[0]}"`,
      "run `lore agents [--check] [--force]`",
      {
        unexpected: [...positionals],
      },
    );
  }
  return { force: flags.has("force"), check: flags.has("check") };
}

/**
 * Coerce a raw read (absent → `undefined`) into the `string | null` the planner expects, normalizing
 * line endings and a leading BOM to LF — the line-ending half of concept.ts's `normalizeInput`, so a
 * CRLF/lone-CR/BOM-prefixed file compares equal to the LF-only generated content instead of reading
 * as spurious drift. It deliberately does NOT strip leading whitespace the way `normalizeInput` does:
 * that would clobber the head of a user's hand-authored CLAUDE.md.
 */
function normalizeOnDisk(raw: string | undefined): string | null {
  return raw === undefined ? null : raw.replace(/^\uFEFF+/, "").replace(/\r\n?/g, "\n");
}

/** A file's on-disk BOM presence and dominant line-ending convention, detected from its RAW bytes. */
interface DiskStyle {
  /** Whether the raw file began with a UTF-8 BOM (`\uFEFF`). */
  readonly bom: boolean;
  /** The dominant EOL sequence: `\r\n` (CRLF) or `\r` (lone CR) if either appears, else `\n` (LF). */
  readonly eol: "\n" | "\r\n" | "\r";
}

/** The default style: no BOM, LF endings — a no-op for {@link reapplyDiskStyle}, and what a freshly-created file gets. */
const LF_NO_BOM_STYLE: DiskStyle = { bom: false, eol: "\n" };

/**
 * Detect `raw`'s BOM + dominant EOL convention from its UN-normalized bytes (before
 * {@link normalizeOnDisk} strips/collapses them), so a managed-block refresh can re-apply the
 * file's own convention on write-back instead of silently rewriting it (LORE-128). An absent file
 * reports {@link LF_NO_BOM_STYLE} — nothing to preserve, so a fresh file is written LF/no-BOM as
 * before. CRLF is checked before lone CR since every `\r\n` also contains a `\r`.
 */
function detectDiskStyle(raw: string | undefined): DiskStyle {
  if (raw === undefined) {
    return LF_NO_BOM_STYLE;
  }
  const bom = raw.startsWith("\uFEFF");
  const eol = raw.includes("\r\n") ? "\r\n" : raw.includes("\r") ? "\r" : "\n";
  return { bom, eol };
}

/**
 * Re-apply a detected {@link DiskStyle} to freshly-planned (LF, no-BOM) `contents` before writing
 * it back, so refreshing just the `lore:agents` managed block does not silently rewrite a CRLF
 * and/or BOM-prefixed CLAUDE.md to LF-only / BOM-stripped beyond the block itself (LORE-128).
 * `contents` itself is always pure LF (built from {@link normalizeOnDisk}'d input plus template
 * strings that only ever use `\n`), so a blanket `\n` -> `style.eol` replace is safe and exact. A
 * no-op for {@link LF_NO_BOM_STYLE}.
 */
function reapplyDiskStyle(contents: string, style: DiskStyle): string {
  const withEol = style.eol === "\n" ? contents : contents.replace(/\n/g, style.eol);
  return style.bom ? `\uFEFF${withEol}` : withEol;
}

/** Build the `agents.result` {@link Renderable}. */
function agentsRenderable(data: AgentsResult): Renderable<AgentsResult> {
  return { kind: "agents.result", data, pretty: renderPretty, plain: renderPlain };
}

/** The per-action verb shown for a file: the drift status (`--check`) or the applied action (write path). */
function actionLabel(action: BridgeAction, check: boolean): string {
  if (check) {
    if (action === "protected") {
      return "out of date (protected; needs --force)";
    }
    return action === "unchanged" ? "up to date" : "out of date";
  }
  return action;
}

/** Stable, token-shaped equivalent of {@link actionLabel} for `--plain`. */
function plainActionLabel(action: BridgeAction, check: boolean): string {
  if (check && action === "protected") {
    return "out-of-date-protected";
  }
  return actionLabel(action, check).replace(/ /g, "-");
}

/**
 * The colour each {@link BridgeAction} paints in `pretty` mode: `unchanged` is dim (nothing
 * happened), `protected` is a warning (a hand-edited file was deliberately left untouched — see
 * {@link renderTrailer}), and `created`/`updated` are a success green. A total `Record`, not a
 * chain of `===` checks with a trailing fallback: TypeScript requires every {@link BridgeAction}
 * literal as a key, so a sixth/future variant added to that union without a matching entry here is
 * a compile error (`bun run typecheck` fails), not a silent runtime fall-through to some default
 * colour. That total mapping is also why there is no fallback to reconsider — an action outside the
 * union cannot reach {@link bridgeActionColor} at all, well-typed callers included.
 */
const BRIDGE_ACTION_COLOR: Record<BridgeAction, string> = {
  unchanged: ANSI.dim,
  protected: ANSI.yellow,
  created: ANSI.green,
  updated: ANSI.green,
};

/**
 * The colour a bridge file's {@link BridgeAction} paints in `pretty` mode — see
 * {@link BRIDGE_ACTION_COLOR}. Exported (LORE-267) so `lore init`'s own renderer (init.ts) paints
 * the exact same {@link BridgeAction} in the exact same colour, instead of keeping a second,
 * hand-maintained copy of this mapping that can silently drift from this one — which is exactly how
 * `protected` came to render green here (the old two-way `unchanged`-or-green split) while `init`
 * already painted it yellow.
 */
export function bridgeActionColor(action: BridgeAction): string {
  return BRIDGE_ACTION_COLOR[action];
}

/** Human view: a heading, one line per file, and an actionable trailer for stale/protected state. */
function renderPretty(data: AgentsResult, opts: { color: boolean }): string {
  const head = data.check ? `Checking the lore agent bridge at ${data.root}` : `lore agent bridge at ${data.root}`;
  const lines = [head];
  for (const file of data.files) {
    const label = actionLabel(file.action, data.check);
    const color = bridgeActionColor(file.action);
    lines.push(`  ${paint(label, color, opts.color)} ${file.path}`);
  }
  const trailer = renderTrailer(data);
  if (trailer !== undefined) {
    lines.push(paint(trailer, ANSI.yellow, opts.color));
  }
  return lines.join("\n");
}

/** ANSI-free, diff-stable view: one `<action> <path>` line each, plus any trailer as a plain line. */
function renderPlain(data: AgentsResult): string {
  const lines = data.files.map((file) => `${plainActionLabel(file.action, data.check)} ${file.path}`);
  const trailer = renderTrailer(data);
  if (trailer !== undefined) {
    lines.push(trailer);
  }
  return lines.join("\n");
}

/**
 * The trailing advisory line, or `undefined` when none applies. The remedy depends on *why* the
 * bridge is stale: a differing (hand-edited) SKILL.md is `protected` and can only be regenerated with
 * `--force` (a plain `lore agents` would leave it untouched), so the hint must say `--force` whenever a
 * protected file is present — under `--check` (where the inert plain remedy would otherwise keep CI
 * red) and on a normal run alike.
 *
 * Exported (LORE-260 review round 2, MINOR-4) so `lore init`'s own renderers can reuse this EXACT
 * trailer for the agent-bridge step it folds in, instead of dropping it: LORE-129 established this
 * line as load-bearing (a `protected` file with no visible remedy reads as silent success), and
 * `init`'s own rendering must not regress it just because it's a second, thinner caller.
 */
export function renderTrailer(data: AgentsResult): string | undefined {
  const hasProtected = data.files.some((file) => file.action === "protected");
  if (data.check) {
    const stale = data.files.some((file) => file.action !== "unchanged");
    if (!stale) {
      return undefined;
    }
    return hasProtected
      ? "bridge is out of date — a hand-edited file needs `lore agents --force` to regenerate (exit 6)"
      : "bridge is out of date — run `lore agents` to regenerate (exit 6)";
  }
  if (!hasProtected) {
    return undefined;
  }
  const count = data.files.filter((file) => file.action === "protected").length;
  return `${count} file(s) look hand-edited and were left untouched — run \`lore agents --force\` to overwrite`;
}
