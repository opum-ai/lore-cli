/**
 * commands/scaffold.ts — `lore scaffold <target> [--force]`: generate a downstream documentation
 * consumer's config, additively and outside `docs/` (cli-surface §"Consumer scaffolding", ADR-0010).
 *
 * The thin, side-effecting layer over the pure {@link buildMkdocsScaffold} / {@link buildDocusaurusScaffold} /
 * {@link buildObsidianScaffold} (`core/consumer-scaffold.ts`): it resolves the repo root, the active profile, and a clock, asks core for the exact bytes, and
 * applies them via `fswrite.ts`'s shared {@link writeAllOrRollback}. Unlike `lore init` (which
 * silently skips an already-present file), scaffolding is **never-silent-clobber**: a planned file
 * whose on-disk bytes would differ from what this run would generate blocks the whole run with a
 * `conflict` error (exit 5) naming every such collision, and writes nothing — `--force` is required
 * to overwrite. But a planned file that already exists with **byte-identical** content is not a
 * collision at all (LORE-263): re-running `lore scaffold <target>` on an already-scaffolded,
 * untouched bundle is idempotent — exit `0`, nothing written, mirroring `lore sync`'s own
 * "0 files changed" no-op model — rather than making the user hand-edit the file or remember
 * `--force` just to re-assert a config nothing actually changed. The classification (via
 * `fswrite.ts`'s {@link classifyExistingFile}) is per-file, so a partially-recreated bundle (one
 * generated file present and unchanged, its sibling separately deleted) recreates only the missing
 * file rather than refusing the whole run. This is still all-or-nothing where it matters — the
 * plan-wide pre-flight below, backstopped by `writeAllOrRollback`'s own atomic per-file create and
 * rollback — so a partial *collision*, or a mid-run I/O failure (e.g. a read-only `docs/`), can
 * never leave one scaffolded file refreshed and its sibling stale.
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
  type ConsumerScaffoldFile,
  type ConsumerScaffoldOptions,
  type ConsumerScaffoldPlan,
} from "../core/consumer-scaffold";
import { loadProfile } from "../core/profile";
import { EXIT_OK, LoreError, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs, usage } from "./args";
import { classifyExistingFile, writeAllOrRollback } from "./fswrite";

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
  /**
   * Every file this run actually wrote, in scaffold order. A planned file already on disk with
   * byte-identical content is never included here (LORE-263) — it was left untouched, not written —
   * so an idempotent no-op re-run (every planned file already matches) reports an empty array here,
   * exactly like `lore sync`'s own "0 files changed".
   */
  readonly files: readonly ScaffoldResultFile[];
  /** Extra guidance lines to print after the summary (empty unless the target's plan carries any — see {@link ConsumerScaffoldPlan.notes}). */
  readonly notes: readonly string[];
}

/**
 * Every implemented target's pure plan builder — the single source of truth for which targets
 * `lore scaffold` can actually build. {@link TARGETS} is *derived* from this map's keys, so a
 * target can never be accepted by argument validation without a registered builder to route to —
 * the failure mode a hand-written per-target `if`/ternary chain invites the moment a third target
 * is added.
 */
const BUILDERS: Record<string, (options: ConsumerScaffoldOptions) => ConsumerScaffoldPlan> = {
  mkdocs: buildMkdocsScaffold,
  docusaurus: buildDocusaurusScaffold,
  obsidian: buildObsidianScaffold,
};

/** The consumer targets `lore scaffold` recognizes as valid (derived from {@link BUILDERS}'s own keys). */
const TARGETS = new Set(Object.keys(BUILDERS));

/**
 * Run `lore scaffold <target>`: parse the arguments, build the target's plan, then — unless
 * `--force` — classify every planned file against what's already on disk (LORE-263):
 *
 * - any planned file whose on-disk bytes DIFFER from what this run would generate, or a
 *   structural directory blocker, refuses the whole run with a `conflict` error (exit `5`) naming
 *   every such collision and pointing at `--force`, writing nothing;
 * - otherwise, only the planned files that are genuinely ABSENT are written — a planned file
 *   already on disk with byte-identical content is left untouched, so a bare re-run of an
 *   unchanged bundle writes nothing at all and still exits `0` (idempotent no-op).
 *
 * `--force` skips this classification entirely and overwrites every planned file, unchanged from
 * before. An unknown target, or a bad flag/extra argument, throws a `usage` {@link LoreError}
 * (exit `2`).
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
    // parseScaffoldArgs already validated parsed.target against TARGETS, which is derived from
    // BUILDERS' own keys — this can only fire if that invariant is ever broken.
    throw new Error(`internal: no builder registered for target "${parsed.target}"`);
  }
  const plan = build({
    timestamp: clock().toISOString(),
    siteName: basename(resolve(options.root)),
    profile,
  });

  // Under --force every planned file is (re)written, exactly as before LORE-263; under a bare
  // run it narrows to only the files actually missing (below) once the collision check clears.
  let filesToWrite: readonly ConsumerScaffoldFile[] = plan.files;

  if (!parsed.force) {
    const blockedDirs = plan.dirs.filter((dir) => {
      const abs = join(options.root, dir);
      return existsSync(abs) && !statSync(abs).isDirectory();
    });
    // Per-file, not per-plan: classifyExistingFile tells "absent" (needs creating), "unchanged"
    // (already matches — leave it alone, not a collision) and "differs" (a real user edit — a
    // collision) apart, rather than the old plain-existence check that treated every already-there
    // file as a collision regardless of its content.
    const statuses = plan.files.map((file) => ({
      file,
      status: classifyExistingFile(join(options.root, file.path), file.contents),
    }));
    const differingFiles = statuses.filter((s) => s.status === "differs").map((s) => s.file.path);
    const collisions = [...blockedDirs, ...differingFiles];
    if (collisions.length > 0) {
      throw new LoreError(
        "conflict",
        `${parsed.target} config already exists: ${collisions.join(", ")}`,
        conflictHint(blockedDirs.length > 0, differingFiles.length > 0),
        { target: parsed.target, paths: collisions },
      );
    }
    filesToWrite = statuses.filter((s) => s.status === "missing").map((s) => s.file);
  }

  const files = writeAllOrRollback(options.root, plan.dirs, filesToWrite, { force: parsed.force });

  const result: ScaffoldResult = { target: parsed.target, force: parsed.force, files, notes: plan.notes ?? [] };
  emit(scaffoldRenderable(result), options.output, options.stdout);
  return EXIT_OK;
}

/**
 * Build the preflight `conflict` error's remedy hint, differentiated by which kind(s) of
 * collision were found. A structural directory blocker — a plain (non-directory) file occupying
 * a path the plan needs to be a directory — is NOT fixed by `--force`: under `--force` this same
 * preflight is skipped entirely and the run reaches `writeAllOrRollback` -> `ensureDir`
 * (fswrite.ts) -> `mkdirSync(dir, { recursive: true })`, which throws `EEXIST` on the same
 * non-directory entry, remapped by `ioError` to a second `conflict` (fswrite.ts's own
 * `conflictError`). So the hint must never tell the user `--force` will overwrite a dir-blocker —
 * only removing/renaming the blocking entry does. A planned file whose on-disk bytes DIFFER from
 * what this run would generate (LORE-263 — a byte-identical match is never a collision at all, see
 * {@link classifyExistingFile}) is genuinely fixed by `--force` (writeAllOrRollback overwrites it
 * in place), so that remedy is preserved whenever at least one such file collision is present.
 */
function conflictHint(hasDirBlocker: boolean, hasFileCollision: boolean): string {
  if (hasDirBlocker && hasFileCollision) {
    return "pass --force to overwrite the existing file(s); separately, remove or rename the non-directory entry blocking the planned directory (--force cannot fix that one)";
  }
  if (hasDirBlocker) {
    return "remove or rename the non-directory entry that is blocking the planned directory, then re-run";
  }
  return "pass --force to overwrite, or remove the existing file(s) first";
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
  if (!TARGETS.has(target)) {
    throw usage(`unknown scaffold target "${target}"`, "valid targets are mkdocs, docusaurus, obsidian");
  }
  return { target, force: flags.has("force") };
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `scaffold` (output.ts dispatches on the mode). */
function scaffoldRenderable(data: ScaffoldResult): Renderable<ScaffoldResult> {
  return { kind: "scaffold.result", data, pretty: render, plain: render };
}

/**
 * One `<action> <path>` line per file, then a one-line summary, then any target-specific guidance
 * notes. A bare (non `--force`) re-run where every planned file already matched what would be
 * generated (LORE-263) writes nothing at all — `files.length === 0` only happens in that idempotent
 * case, since a `--force` run always (re)writes the whole, non-empty plan — so that case gets a
 * distinct "nothing to do" line instead of reading as "scaffolded ... (0 files)", mirroring `lore
 * sync`'s own "0 files changed" no-op summary.
 */
function render(data: ScaffoldResult): string {
  const lines = data.files.map((file) => `${file.action} ${file.path}`);
  lines.push(
    data.files.length === 0
      ? `${data.target} config already up to date — nothing to do`
      : `scaffolded ${data.target} config (${data.files.length} file${data.files.length === 1 ? "" : "s"})`,
  );
  lines.push(...data.notes);
  return lines.join("\n");
}
