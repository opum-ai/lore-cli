/**
 * commands/scaffold.ts — `lore scaffold <target> [--force]`: generate a downstream documentation
 * consumer's config, additively and outside `docs/` (cli-surface §"Consumer scaffolding", ADR-0010).
 *
 * The thin, side-effecting layer over the pure {@link buildMkdocsScaffold} / {@link buildDocusaurusScaffold}
 * (`core/consumer-scaffold.ts`): it resolves the repo root, the active profile, and a clock, asks core for the exact bytes, and
 * applies them via `fswrite.ts`'s shared {@link writeAllOrRollback}. Unlike `lore init` (which
 * silently skips an already-present file), scaffolding is **never-silent-clobber**: if any planned
 * file already exists, the whole run refuses with a `conflict` error (exit 5) naming every
 * collision, and writes nothing — `--force` is required to overwrite. This is deliberately
 * all-or-nothing (the plan-wide pre-flight below, backstopped by `writeAllOrRollback`'s own atomic
 * per-file create and rollback) rather than per-file, so a partial collision — or a mid-run I/O
 * failure, e.g. a read-only `docs/` — can never leave one scaffolded file refreshed and its sibling
 * stale.
 *
 * `mkdocs`, `docusaurus`, and `obsidian` are implemented; any other target string is a `usage`
 * error (exit 2).
 */

import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  buildDocusaurusScaffold,
  buildMkdocsScaffold,
  buildObsidianScaffold,
  type ConsumerScaffoldOptions,
  type ConsumerScaffoldPlan,
} from "../core/consumer-scaffold";
import { loadProfile } from "../core/profile";
import { EXIT_OK, LoreError, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";
import { writeAllOrRollback } from "./fswrite";

/** Options for {@link runScaffold}; `root`, `clock`, and the stream are injectable for tests. */
export interface ScaffoldOptions {
  /** The repo root to scaffold into. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `scaffold`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** Clock seam for `docs/tags.md`'s timestamp; defaults to the real wall clock. */
  clock?: () => Date;
}

/** One file the scaffold wrote (or, under `--force`, overwrote). */
export interface ScaffoldResultFile {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** Whether this run created the file fresh or overwrote a pre-existing one (`--force` only). */
  readonly action: "created" | "updated";
}

/** The result of a `lore scaffold` run. */
export interface ScaffoldResult {
  /** The target that was scaffolded (`"mkdocs"`, `"docusaurus"`, or `"obsidian"`). */
  readonly target: string;
  /** Whether `--force` was passed. */
  readonly force: boolean;
  /** Every file written this run, in scaffold order. */
  readonly files: readonly ScaffoldResultFile[];
  /** Extra guidance lines to print after the summary (empty unless the target's plan carries any — see {@link ConsumerScaffoldPlan.notes}). */
  readonly notes: readonly string[];
}

/**
 * Every implemented target's pure plan builder — the single source of truth for which targets
 * `lore scaffold` can actually build. {@link IMPLEMENTED_TARGETS} is *derived* from this map's
 * keys, so a target can never end up "implemented" (accepted by argument validation) without a
 * registered builder to route to — the failure mode a hand-written per-target `if`/ternary chain
 * invites the moment a third target is added.
 */
const BUILDERS: Record<string, (options: ConsumerScaffoldOptions) => ConsumerScaffoldPlan> = {
  mkdocs: buildMkdocsScaffold,
  docusaurus: buildDocusaurusScaffold,
  obsidian: buildObsidianScaffold,
};

/** The consumer targets `lore scaffold` recognizes as valid, even if not all are implemented yet. */
const KNOWN_TARGETS = new Set(["mkdocs", "docusaurus", "obsidian"]);

/** Targets a builder exists for today (derived from {@link BUILDERS}); the rest of {@link KNOWN_TARGETS} are documented but unshipped. */
const IMPLEMENTED_TARGETS = new Set(Object.keys(BUILDERS));

/**
 * Run `lore scaffold <target>`: parse the arguments, build the target's plan, refuse (exit `5`)
 * if any planned file already exists and `--force` was not given, else write every file (freshly
 * or overwriting), emit the `scaffold.result`, and return `0`. An unknown or not-yet-implemented
 * target, or a bad flag/extra argument, throws a `usage` {@link LoreError} (exit `2`).
 */
export function runScaffold(options: ScaffoldOptions): number {
  const parsed = parseScaffoldArgs(options.args);
  const clock = options.clock ?? (() => new Date());
  // Only mkdocs's builder reads `profile` (to decide docs/tags.md's $schema modeline) — loading
  // it unconditionally for every target would make `lore scaffold docusaurus` fail on a malformed
  // .lore/profile.toml/json it never reads, contradicting ConsumerScaffoldOptions.profile's own
  // "unused by buildDocusaurusScaffold" contract.
  const profile = parsed.target === "mkdocs" ? loadProfile({ root: options.root }) : undefined;
  const build = BUILDERS[parsed.target];
  if (!build) {
    // parseScaffoldArgs already validated parsed.target against IMPLEMENTED_TARGETS, which is
    // derived from BUILDERS' own keys — this can only fire if that invariant is ever broken.
    throw new Error(`internal: no builder registered for implemented target "${parsed.target}"`);
  }
  const plan = build({
    timestamp: clock().toISOString(),
    siteName: basename(resolve(options.root)),
    profile,
  });

  if (!parsed.force) {
    const blockedDirs = plan.dirs.filter((dir) => {
      const abs = join(options.root, dir);
      return existsSync(abs) && !statSync(abs).isDirectory();
    });
    const existingFiles = plan.files.filter((file) => existsSync(join(options.root, file.path))).map((f) => f.path);
    const collisions = [...blockedDirs, ...existingFiles];
    if (collisions.length > 0) {
      throw new LoreError(
        "conflict",
        `${parsed.target} config already exists: ${collisions.join(", ")}`,
        "pass --force to overwrite, or remove the existing file(s) first",
        { target: parsed.target, paths: collisions },
      );
    }
  }

  const files = writeAllOrRollback(options.root, plan.dirs, plan.files, { force: parsed.force });

  const result: ScaffoldResult = { target: parsed.target, force: parsed.force, files, notes: plan.notes ?? [] };
  emit(scaffoldRenderable(result), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/** The parsed form of `lore scaffold`'s arguments. */
interface ScaffoldArgs {
  /** The validated, implemented target (`"mkdocs"` or `"docusaurus"` today). */
  target: string;
  /** `--force`: overwrite an existing generated config. */
  force: boolean;
}

/**
 * Parse `scaffold`'s tokens into the `<target>` positional and `--force`, via the shared
 * `<positionals…> [--flags…]` tokenizer every no-value-flag command uses. An unknown flag, an
 * extra positional, or a missing target is a `usage` error.
 */
function parseScaffoldArgs(args: readonly string[]): ScaffoldArgs {
  const { positionals, flags } = parseCommandArgs(args, "scaffold", ["force"]);

  const target = positionals[0];
  if (target === undefined) {
    throw usage(
      "`lore scaffold` needs a target",
      "pass a target, e.g. `lore scaffold mkdocs` (mkdocs | docusaurus | obsidian)",
    );
  }
  if (positionals.length > 1) {
    throw usage(`unexpected argument "${positionals[1]}"`, "run `lore scaffold <target> [--force]`");
  }
  if (!KNOWN_TARGETS.has(target)) {
    throw usage(`unknown scaffold target "${target}"`, "valid targets are mkdocs, docusaurus, obsidian");
  }
  if (!IMPLEMENTED_TARGETS.has(target)) {
    throw usage(
      `scaffold target "${target}" is not implemented yet`,
      "only `mkdocs`, `docusaurus`, and `obsidian` are implemented today",
    );
  }
  return { target, force: flags.has("force") };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `scaffold` (output.ts dispatches on the mode). */
function scaffoldRenderable(data: ScaffoldResult): Renderable<ScaffoldResult> {
  return { kind: "scaffold.result", data, pretty: render, plain: render };
}

/** One `<action> <path>` line per file, then a one-line summary, then any target-specific guidance notes. */
function render(data: ScaffoldResult): string {
  const lines = data.files.map((file) => `${file.action} ${file.path}`);
  lines.push(`scaffolded ${data.target} config (${data.files.length} file${data.files.length === 1 ? "" : "s"})`);
  lines.push(...data.notes);
  return lines.join("\n");
}
