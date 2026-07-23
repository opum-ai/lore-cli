/**
 * commands/replace.ts — `lore replace <find> <replace> [--regex] [--in <glob>…] [--dry-run]`.
 *
 * The thin, side-effecting layer over the pure replace engine (cli-surface §replace): it parses the
 * command's own arguments, compiles the pattern **once** (so a bad pattern fails even when discovery
 * finds nothing), **discovers** the target markdown files (a default whole-bundle walk of `docs/`, or
 * the explicit `--in <glob>` set), reads their bytes, asks core to rewrite each — skipping every
 * lore-managed region (AC#1) — writes back the genuinely-changed files (unless `--dry-run`), renders a
 * per-file report, and returns the exit code. All file discovery and I/O live here; the
 * never-touch-managed-regions judgement lives in `core/replace.ts`.
 *
 * Discovery is hardened so a refactor can neither escape the bundle nor corrupt machine-owned files:
 * targets are `.md` only (a glob match on `mkdocs.yml` is left alone); a **symlink** is skipped (it
 * could resolve outside the repo, and `walkMarkdown` skips them too); files are de-duplicated by
 * **canonical identity** so one physical file reached two ways is rewritten once (never double-applied);
 * the fully-generated `log.md` is excluded (it is regenerated wholesale, so editing it is futile); and
 * an absolute `--in` glob resolves correctly. Reads and replacements for **all** files complete before
 * **any** write, so a bad pattern or an unreadable file aborts the run before it has changed a single
 * file on disk. Each individual write in that commit phase is itself atomic (LORE-116,
 * `writeFileAtomic`'s temp-file+rename discipline), so a crash or I/O error partway through a single
 * file's write can never leave that file truncated or half-written.
 *
 * A bad flag, an invalid/empty/zero-width pattern is a `usage` error (exit 2); an unreadable path an
 * I/O failure — both funnel through the router's one error seam like every command.
 */

import { lstatSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { walkMarkdown } from "../core/bundle";
import { compileReplacer, type Replacer } from "../core/replace";
import { DOCS_DIR } from "../core/scaffold";
import { EXIT_OK, LoreError, singleLine, stripAnsiAndControls, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { canonicalIdentity, readSource, toRepoRelative, withinRepo } from "./discover";
import { writeFileAtomic } from "./fswrite";

/** The reserved, fully git-derived file `lore` regenerates wholesale; editing it via `replace` is futile. */
const GENERATED_FILE = "log.md";

/** Options for {@link runReplace}; `root` and the streams are injectable for tests. */
export interface ReplaceOptions {
  /** The repo root the bundle (and any `--in` globs) resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `replace`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for discovery advisories; defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The parsed form of `lore replace`'s arguments. */
interface ReplaceArgs {
  /** The find pattern (literal text, or a regex source under `--regex`). */
  find: string;
  /** The replacement (literal, or with `$1`/`$&` substitutions under `--regex`). */
  replace: string;
  /** `--regex`: treat `find` as a JavaScript regular expression. */
  regex: boolean;
  /** `--in <glob>` scopes (repeatable); empty means the whole `docs/` bundle. */
  in: string[];
  /** `--dry-run`: report what would change, write nothing. */
  dryRun: boolean;
}

/** One discovered file: its repo-relative display path and the absolute path to read/write. */
interface Target {
  /** Repo-relative POSIX path, for the report. */
  readonly display: string;
  /** Absolute filesystem path (canonical), for reading and writing. */
  readonly abs: string;
}

/** A planned write: a file whose bytes genuinely changed. */
interface PlannedChange {
  readonly display: string;
  readonly abs: string;
  readonly text: string;
  readonly count: number;
}

/** One file's replacement tally, for the report. */
interface FileChange {
  /** Repo-relative POSIX path of the changed file. */
  readonly path: string;
  /** Matches replaced in that file (outside managed regions). */
  readonly count: number;
}

/** The `replace.result` payload: the changed files and the run totals. */
export interface ReplaceReport {
  /** Per changed file, in ascending path order; files with no real change are omitted. */
  readonly files: readonly FileChange[];
  /** Total matches replaced across the bundle. */
  readonly totalMatches: number;
  /** How many files changed. */
  readonly filesChanged: number;
  /** How many `.md` files were examined. */
  readonly filesScanned: number;
  /** Whether this was a `--dry-run` (nothing was written). */
  readonly dryRun: boolean;
}

/**
 * Run `lore replace`: parse the arguments, compile the pattern, discover and read the target markdown,
 * rewrite each outside its managed regions, write the genuinely-changed files (unless `--dry-run`),
 * emit the `replace.result`, and return `0`. A bad flag/positional or an invalid/empty/zero-width
 * pattern throws a `usage` {@link LoreError} (exit `2`); an unreadable bundle/path a
 * `not_found`/`denied`.
 */
export function runReplace(options: ReplaceOptions): number {
  const parsed = parseReplaceArgs(options.args);
  // Compile (and validate) the pattern ONCE, before discovery — so an invalid/empty/zero-width pattern
  // fails fast even when no file matches, instead of slipping through a per-file loop that never runs.
  const replacer: Replacer = compileReplacer(parsed.find, parsed.replace, { regex: parsed.regex });

  const advisories = new WarningCollector();
  const targets = discoverFiles(options.root, parsed.in, advisories);

  // Phase 1 — read + replace every target into a plan. No write happens until every file has been read
  // and rewritten, so a read error or a no-match file can't leave the bundle half-rewritten.
  const planned: PlannedChange[] = [];
  for (const target of targets) {
    const original = readSource(target.abs, target.display);
    const { text, count } = replacer(original);
    if (count === 0 || text === original) {
      continue; // gate on a REAL byte change, so a no-op (e.g. find === replace) never churns a file
    }
    planned.push({ display: target.display, abs: target.abs, text, count });
  }

  // Phase 2 — commit the writes (unless dry-run). Each file goes through writeFileAtomic (LORE-116)
  // rather than the plain writeFileOverwriting: a crash, kill, or I/O error (e.g. disk full) partway
  // through a single file's write must never leave that target truncated or half-written — the same
  // temp-file+rename discipline `lore sync` already relies on for the identical reason. This is
  // per-file atomicity only, not a whole-run transaction: a failure partway through this loop still
  // leaves earlier files in this run already committed (by design — there is no cross-file rollback
  // here, matching `writeAllOrRollback`'s docstring, which notes that broader transactional rollback
  // for `lore replace` is a separate, deferred concern) and the loop's own error propagates uncaught
  // so the failure is never silently swallowed.
  if (!parsed.dryRun) {
    for (const change of planned) {
      writeFileAtomic(change.abs, change.text, change.display);
    }
  }

  const report: ReplaceReport = {
    files: planned.map((c) => ({ path: c.display, count: c.count })),
    totalMatches: planned.reduce((sum, c) => sum + c.count, 0),
    filesChanged: planned.length,
    filesScanned: targets.length,
    dryRun: parsed.dryRun,
  };
  emit(reportRenderable(report), options.output, options.stdout);
  advisories.flush({ color: options.output.color, stderr: options.stderr });
  return EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `replace`'s tokens into its two positionals (`<find> <replace>`) and flags. The router has
 * already stripped lore's global flags, so a `--`-prefixed token here is a command flag: an
 * unrecognized one is a `usage` error. `--in` takes a value (inline `=` or the next token, which may
 * not itself be a flag), and a `--` ends option parsing so a `find`/`replace` may begin with `-`.
 */
function parseReplaceArgs(args: readonly string[]): ReplaceArgs {
  const positionals: string[] = [];
  const ins: string[] = [];
  let regex = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const eq = arg.indexOf("=");
      const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      const takeValue = (): string => {
        if (eq >= 0) {
          return arg.slice(eq + 1);
        }
        const next = args[i + 1];
        if (next === undefined || (next.startsWith("-") && next !== "-")) {
          throw usage(`option "--${name}" needs a value`, `pass a value, e.g. --${name}=<value>`);
        }
        i++;
        return next;
      };
      switch (name) {
        case "regex":
          if (eq >= 0) {
            throw usage("--regex takes no value", "pass --regex on its own");
          }
          regex = true;
          break;
        case "dry-run":
          if (eq >= 0) {
            throw usage("--dry-run takes no value", "pass --dry-run on its own");
          }
          dryRun = true;
          break;
        case "in":
          ins.push(takeValue());
          break;
        default:
          throw usage(`unknown option "--${name}"`, "run `lore replace --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore replace --help` to list options");
    } else {
      positionals.push(arg);
    }
  }

  const find = positionals[0];
  if (find === undefined) {
    throw usage("`lore replace` needs a find and a replace argument", 'run `lore replace "<find>" "<replace>"`');
  }
  const replace = positionals[1];
  if (replace === undefined) {
    throw usage(
      "`lore replace` needs a replacement argument",
      'pass the replacement text, e.g. `lore replace "old" "new"` (use "" to delete matches)',
    );
  }
  if (positionals.length > 2) {
    throw usage(
      `unexpected argument "${positionals[2]}"`,
      "pass exactly a find and a replace; quote values containing spaces, and scope with --in <glob>",
    );
  }
  return { find, replace, regex, in: ins, dryRun };
}

// ── File discovery ─────────────────────────────────────────────────────────────

/**
 * Discover the `.md` files to rewrite as canonical {@link Target}s in ascending display order. With no
 * `--in` the target is the whole `docs/` bundle, walked the same way the loader does
 * ({@link walkMarkdown} — sorted, symlink-safe, `.md`-only). With `--in`, each pattern is expanded by
 * `Bun.Glob` relative to the repo root and filtered: `.md` only, no symlink (it could resolve outside
 * the repo, and `walkMarkdown` skips them too), inside the repo, never the reserved `log.md`. Both
 * paths de-duplicate by {@link canonicalIdentity}, so one physical file reached two ways (a symlink, a
 * case variant, or once directly and once via a walked directory) is rewritten exactly once.
 */
function discoverFiles(root: string, patterns: readonly string[], warnings: WarningCollector): Target[] {
  const seen = new Set<string>();
  const targets: Target[] = [];
  const add = (abs: string, display: string): void => {
    const id = canonicalIdentity(abs);
    if (seen.has(id)) {
      return; // same physical file already queued
    }
    seen.add(id);
    targets.push({ display, abs });
  };

  if (patterns.length === 0) {
    const docsRoot = join(root, DOCS_DIR);
    for (const rel of walkMarkdown(docsRoot, warnings)) {
      if (basename(rel) === GENERATED_FILE) {
        continue; // log.md is regenerated wholesale — never an author-editable target
      }
      add(join(docsRoot, rel), `${DOCS_DIR}/${rel}`);
    }
  } else {
    for (const pattern of patterns) {
      for (const match of new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })) {
        // `resolve` (not `join`): Bun.Glob returns a path relative to cwd for a relative pattern but an
        // ABSOLUTE path for an absolute pattern — `resolve(root, abs)` returns it as-is rather than
        // doubling `root` onto it (a plain `join` would mangle an absolute --in glob).
        const abs = resolve(root, match);
        if (!match.endsWith(".md")) {
          continue; // replace edits the bundle's markdown only
        }
        if (basename(match) === GENERATED_FILE) {
          warnings.add(`skipping "${match}": log.md is regenerated wholesale and is not editable via replace`);
          continue;
        }
        if (isSymlink(abs)) {
          warnings.add(`skipping symlink "${match}": symlinks are not followed (it may resolve outside the bundle)`);
          continue;
        }
        if (!withinRepo(root, abs)) {
          warnings.add(`skipping "${match}": outside the repo root`);
          continue;
        }
        add(abs, toRepoRelative(root, abs));
      }
    }
  }
  return targets.sort((a, b) => (a.display < b.display ? -1 : a.display > b.display ? 1 : 0));
}

/** Whether the entry at `abs` is a symlink (a vanished/unstattable entry is treated as not-a-symlink; the read raises the real error). */
function isSymlink(abs: string): boolean {
  try {
    return lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `replace` (output.ts dispatches on the mode). */
function reportRenderable(data: ReplaceReport): Renderable<ReplaceReport> {
  return {
    kind: "replace.result",
    data,
    pretty: (report) => render(report),
    plain: (report) => render(report),
  };
}

/**
 * One line per changed file, then a summary line. (No color: the report carries no severities.)
 * Each file's `path` is sanitized ({@link sanitizeField}) before interpolation — it is a discovered
 * display path derived from real filesystem entries, so a crafted/unusual filename could otherwise
 * smuggle an ANSI escape sequence or an embedded newline into the rendered report (LORE-229).
 */
function render(data: ReplaceReport): string {
  const verb = data.dryRun ? "would replace" : "replaced";
  const lines = data.files.map((f) => `${verb} ${f.count} in ${sanitizeField(f.path)}`);
  lines.push(summaryLine(data));
  return lines.join("\n");
}

/**
 * Sanitize a discovered file path before it is interpolated into the plain/pretty report: collapse
 * it to one line ({@link singleLine}) and strip ANSI escape sequences plus residual C0/C1 control
 * bytes ({@link stripAnsiAndControls}) — mirrors `query.ts`'s `sanitizeField` (LORE-118), for the
 * same reason: an untrusted, filesystem-derived path can carry attacker-influenced bytes.
 */
function sanitizeField(text: string): string {
  return stripAnsiAndControls(singleLine(text));
}

/** The trailing summary: total matches, files changed of scanned, and a `(dry-run)` marker. */
function summaryLine(data: ReplaceReport): string {
  const head = `${data.totalMatches} ${plural(data.totalMatches, "match", "matches")} in ${data.filesChanged} of ${data.filesScanned} ${plural(data.filesScanned, "file")}`;
  return data.dryRun ? `${head} (dry-run)` : head;
}

/** Pluralize a noun by count, with an optional explicit plural for irregulars. */
function plural(count: number, noun: string, plural?: string): string {
  if (count === 1) {
    return noun;
  }
  return plural ?? `${noun}s`;
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
