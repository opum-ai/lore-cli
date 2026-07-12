/**
 * commands/scaffold.ts — `lore scaffold <target> [--force]`: generate a downstream documentation
 * consumer's config, additively and outside `docs/` (cli-surface §"Consumer scaffolding", ADR-0010).
 *
 * The thin, side-effecting layer over the pure {@link buildMkdocsScaffold} (`core/consumer-scaffold.ts`):
 * it resolves the repo root, the active profile, and a clock, asks core for the exact bytes, and
 * applies them via `fswrite.ts`'s shared {@link writeAllOrRollback}. Unlike `lore init` (which
 * silently skips an already-present file), scaffolding is **never-silent-clobber**: if any planned
 * file already exists, the whole run refuses with a `conflict` error (exit 5) naming every
 * collision, and writes nothing — `--force` is required to overwrite. This is deliberately
 * all-or-nothing (the plan-wide pre-flight below, backstopped by `writeAllOrRollback`'s own atomic
 * per-file create and rollback) rather than per-file, so a partial collision — or a mid-run I/O
 * failure, e.g. a read-only `docs/` — can never leave one scaffolded file refreshed and its sibling
 * stale.
 *
 * Only `mkdocs` is implemented today; `docusaurus` (LORE-40) and `obsidian` (LORE-41) are
 * documented targets not yet wired to a builder, so they — like any other unrecognized string —
 * are a `usage` error (exit 2) until their own task lands one.
 */

import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { buildMkdocsScaffold } from "../core/consumer-scaffold";
import { loadProfile } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
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
  /** The target that was scaffolded (`"mkdocs"`). */
  readonly target: string;
  /** Whether `--force` was passed. */
  readonly force: boolean;
  /** Every file written this run, in scaffold order. */
  readonly files: readonly ScaffoldResultFile[];
}

/** The consumer targets `lore scaffold` recognizes as valid, even if not all are implemented yet. */
const KNOWN_TARGETS = new Set(["mkdocs", "docusaurus", "obsidian"]);

/** Targets a builder exists for today; the rest of {@link KNOWN_TARGETS} are documented but unshipped. */
const IMPLEMENTED_TARGETS = new Set(["mkdocs"]);

/**
 * Run `lore scaffold <target>`: parse the arguments, build the target's plan, refuse (exit `5`)
 * if any planned file already exists and `--force` was not given, else write every file (freshly
 * or overwriting), emit the `scaffold.result`, and return `0`. An unknown or not-yet-implemented
 * target, or a bad flag/extra argument, throws a `usage` {@link LoreError} (exit `2`).
 */
export function runScaffold(options: ScaffoldOptions): number {
  const parsed = parseScaffoldArgs(options.args);
  const clock = options.clock ?? (() => new Date());
  const profile = loadProfile({ root: options.root });
  const plan = buildMkdocsScaffold({
    timestamp: clock().toISOString(),
    siteName: basename(resolve(options.root)),
    profile,
  });

  if (!parsed.force) {
    const existing = plan.files.filter((file) => existsSync(join(options.root, file.path)));
    if (existing.length > 0) {
      throw new LoreError(
        "conflict",
        `${parsed.target} config already exists: ${existing.map((file) => file.path).join(", ")}`,
        "pass --force to overwrite, or remove the existing file(s) first",
        { target: parsed.target, paths: existing.map((file) => file.path) },
      );
    }
  }

  const files = writeAllOrRollback(options.root, [DOCS_DIR], plan.files, { force: parsed.force });

  const result: ScaffoldResult = { target: parsed.target, force: parsed.force, files };
  emit(scaffoldRenderable(result), options.output, options.stdout);
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/** The parsed form of `lore scaffold`'s arguments. */
interface ScaffoldArgs {
  /** The validated, implemented target (only `"mkdocs"` today). */
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
    throw usage(`scaffold target "${target}" is not implemented yet`, "only `mkdocs` is implemented today");
  }
  return { target, force: flags.has("force") };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `scaffold` (output.ts dispatches on the mode). */
function scaffoldRenderable(data: ScaffoldResult): Renderable<ScaffoldResult> {
  return { kind: "scaffold.result", data, pretty: render, plain: render };
}

/** One `<action> <path>` line per file, then a one-line summary. */
function render(data: ScaffoldResult): string {
  const lines = data.files.map((file) => `${file.action} ${file.path}`);
  lines.push(`scaffolded ${data.target} config (${data.files.length} file${data.files.length === 1 ? "" : "s"})`);
  return lines.join("\n");
}
