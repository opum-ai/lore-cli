/**
 * commands/agents.ts — `lore agents`: generate/refresh the Claude Code agent bridge.
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
  /** The command's tokens (everything after `agents`), as split by the router. */
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
  const { root, force, check } = options;

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

  if (!check) {
    const targets = plan.files.filter((file) => file.contents !== null).map((file) => file.path);
    // Swept as a whole before either file is written (LORE-93 AC#5) — `lore agents` writes two
    // files per run, and a bad target reached second in the loop must not leave the first already
    // written; ensureDir's own per-call guard alone is reactive to loop order.
    assertNoSymlinkInAnyPath(root, targets);
    for (const file of plan.files) {
      if (file.contents === null) {
        continue; // unchanged, or protected without --force — leave the file untouched
      }
      const absPath = join(root, file.path);
      ensureDir(root, dirname(file.path));
      // CLAUDE.md is a managed-block refresh over a user's hand-authored file: re-apply its
      // original BOM/EOL convention before writing (LORE-128). SKILL.md is wholesale-regenerated
      // (planSkill), so no such preservation applies there.
      const contents = file.path === CLAUDE_MD_REL_PATH ? reapplyDiskStyle(file.contents, claudeStyle) : file.contents;
      // Atomic (temp-write + rename): `lore agents` writes two files per run, one of them the user's
      // hand-authored root CLAUDE.md — a crash mid-write must never leave it truncated (fswrite.ts).
      writeFileAtomic(absPath, contents, file.path);
    }
  }

  return {
    root,
    check,
    force,
    files: plan.files.map((file) => ({ path: file.path, action: file.action })),
  };
}

/**
 * Run `lore agents`: the thin CLI layer over {@link applyAgentsBridge} — parse the arguments, apply
 * the bridge, render the result, and return the exit code. `--check` writes nothing and returns `6`
 * (`drift`) when any file is out of date, `0` otherwise; a normal run returns `0` (a differing
 * SKILL.md left `protected` for lack of `--force` is reported, not an error — `--check` is the gate).
 */
export function runAgents(options: AgentsOptions): number {
  const { force, check } = parseAgentsArgs(options.args);
  const result = applyAgentsBridge({ root: options.root, force, check });
  const drift = result.files.some((file) => file.action !== "unchanged");
  emit(agentsRenderable(result), options.output, options.stdout);
  return check && drift ? EXIT_CODES.drift : EXIT_OK;
}

/** Parse `agents`' tokens: no positionals; boolean `--force`/`--check`. A positional or unknown flag is a `usage` error (exit 2). */
function parseAgentsArgs(args: readonly string[]): { force: boolean; check: boolean } {
  const { positionals, flags } = parseCommandArgs(args, "agents", ["force", "check"]);
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
    return action === "unchanged" ? "up to date" : "out of date";
  }
  return action;
}

/** Human view: a heading, one line per file, and an actionable trailer for stale/protected state. */
function renderPretty(data: AgentsResult, opts: { color: boolean }): string {
  const head = data.check ? `Checking the lore agent bridge at ${data.root}` : `lore agent bridge at ${data.root}`;
  const lines = [head];
  for (const file of data.files) {
    const label = actionLabel(file.action, data.check);
    const color = file.action === "unchanged" ? ANSI.dim : ANSI.green;
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
  const lines = data.files.map((file) => `${actionLabel(file.action, data.check).replace(/ /g, "-")} ${file.path}`);
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
 */
function renderTrailer(data: AgentsResult): string | undefined {
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
