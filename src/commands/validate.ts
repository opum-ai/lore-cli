/**
 * commands/validate.ts — `lore validate [paths…]`: tiered per-file conformance reporting.
 *
 * The thin, side-effecting layer over the pure {@link validateFiles} engine (ADR-0007,
 * cli-surface §validate): it parses the command's own arguments, **discovers** the files to
 * check (a default whole-bundle walk, or the explicit `[paths…]` a pre-commit hook passes —
 * LORE-19 AC#2), reads their bytes, asks core for the tiered findings, renders the report, and
 * returns the exit code. All file discovery and I/O live here; all judgement lives in
 * `core/validate.ts`.
 *
 * Unlike `init`/`new`, a content failure is **not** a thrown {@link LoreError}: `validate` is a
 * reporter, so it emits the full `validate.report` on stdout and then *returns* exit `6` when any
 * error-tier finding exists (or any warning under `--strict`) — the report is the payload, the
 * exit code is the gate signal. Only a *usage* error (bad flag) or an *I/O* failure (an
 * unreadable path) throws, funneling through the router's one error seam like every command.
 */

import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadBundleState, walkMarkdown } from "../core/bundle";
import { loadProfile, profileForBundle } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { canonicalType } from "../core/schema";
import { type FileReport, type Finding, type ValidateReport, validateFiles } from "../core/validate";
import { ANSI, EXIT_CODES, EXIT_OK, ioError, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { assertFlagAtMostOnce, parseCommandArgs, singleOptionValue } from "./args";
import { canonicalIdentity, readSource, toRepoRelative } from "./discover";

/** Options for {@link runValidate}; `root` and the streams are injectable for tests. */
export interface ValidateOptions {
  /** The repo root the (relative) target paths resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional + flag tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for discovery advisories (a skipped symlink, an unreadable sub-directory); defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The parsed form of `lore validate`'s arguments. */
interface ValidateArgs {
  /** Explicit target paths (files or directories); empty means the whole bundle. */
  paths: string[];
  /** `--type <T>`: limit the report to one concept type (canonical or case-insensitive). */
  type?: string;
  /** `--strict`: treat any warning as a failure for the exit code. */
  strict: boolean;
}

/** A discovered file ready for the pure engine: its repo-relative path and raw bytes. */
interface SourceFile {
  path: string;
  raw: string;
}

/**
 * Run `lore validate`: parse the arguments, discover and read the target files, validate them,
 * emit the `validate.report`, and return the exit code — `0` when clean (or warnings-only without
 * `--strict`), `6` when any error-tier finding exists (or any warning under `--strict`). A bad
 * flag throws a `usage` {@link LoreError} (exit `2`); an unreadable path a `not_found`/`denied`.
 *
 * Discovery advisories (a `.md` concept skipped behind a symlink, an unreadable sub-directory) are
 * flushed to stderr — never silently swallowed, so a run that omits files says so — but, like every
 * advisory, they do not change the exit code.
 */
export function runValidate(options: ValidateOptions): number {
  const parsed = parseValidateArgs(options.args);
  const configuredProfile = loadProfile({ root: options.root });
  const versionWarnings = new WarningCollector();
  const bundleState = loadBundleState(join(options.root, DOCS_DIR), versionWarnings);
  const profile = profileForBundle(configuredProfile, bundleState);
  const type = parsed.type === undefined ? undefined : canonicalType(parsed.type, profile);
  const walkWarnings = new WarningCollector();
  const files = collectFiles(options.root, parsed.paths, walkWarnings);

  const report = validateFiles(files, type, profile, bundleState);
  emit(reportRenderable(report), options.output, options.stdout);
  walkWarnings.flush({ color: options.output.color, stderr: options.stderr });
  versionWarnings.flush({ color: options.output.color, stderr: options.stderr });

  const failed = report.errorCount > 0 || (parsed.strict && report.warningCount > 0);
  return failed ? EXIT_CODES.validation : EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `validate`'s tokens into target paths and its flags. Commander has already resolved
 * lore's global flags, so anything `--`-prefixed here is a command flag: an unrecognized one is a
 * `usage` error. Both `--flag value` and `--flag=value` forms are accepted; `--type`'s value must
 * not itself be a flag-looking token (so a mis-ordered `--type --strict` fails loud rather than
 * eating `--strict`). A `--` ends option parsing so a path may begin with `-`.
 */
function parseValidateArgs(args: readonly string[]): ValidateArgs {
  const parsed = parseCommandArgs(args, "validate");
  const type = singleOptionValue(parsed, "type");
  assertFlagAtMostOnce(parsed, "strict");
  if (type !== undefined && type.trim() === "") {
    throw usage("`--type` needs a value", "pass a type, e.g. --type ADR");
  }
  return { paths: parsed.positionals, type, strict: parsed.flags.has("strict") };
}

// ── File discovery ─────────────────────────────────────────────────────────────

/**
 * Discover and read every file to validate. With no explicit paths the target is the whole
 * bundle (`docs/`); otherwise each path is taken verbatim — a **directory** is walked for `.md`
 * files (via the same {@link walkMarkdown} the bundle loader uses, so the walk is sorted,
 * symlink-safe, and `.md`-only — its skipped-symlink/unreadable-subdir advisories flow to
 * `warnings`), and a **file** is read directly even if it is not `.md` (the user named it
 * explicitly). Results are de-duplicated by the file's **canonical (realpath) identity**, so the
 * same physical file named twice — including via two casings on a case-insensitive filesystem, or
 * once directly and once under a walked directory — is validated and counted once.
 */
function collectFiles(root: string, paths: readonly string[], warnings: WarningCollector): SourceFile[] {
  const targets = paths.length > 0 ? paths : [DOCS_DIR];
  const files: SourceFile[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    const abs = resolve(root, target);
    for (const absFile of expandTarget(abs, target, warnings)) {
      const identity = canonicalIdentity(absFile);
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      const repoRel = toRepoRelative(root, absFile);
      files.push({ path: repoRel, raw: readSource(absFile, repoRel) });
    }
  }
  return files;
}

/**
 * Expand one target to the absolute file paths it names: a directory to every `.md` under it (a
 * sorted walk that does not follow symlinks *inside* the tree, routing its advisories to
 * `warnings`), a file to itself. A path that does not exist is a `not_found` {@link LoreError}
 * (exit `3`) naming the target the user gave, so a typo'd path fails loud rather than silently
 * validating nothing. An explicitly-named directory *is* followed through a top-level symlink
 * (the user named it); only links discovered beneath it are skipped, matching `loadBundle`.
 */
function expandTarget(abs: string, target: string, warnings: WarningCollector): string[] {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(abs);
  } catch (cause) {
    ioError(cause, {
      denied: { message: `cannot access "${target}"`, hint: "check filesystem permissions on that path" },
      notFound: { message: `path "${target}" does not exist`, hint: "check the path and try again" },
      input: { path: target },
      rethrowUnknown: true,
    });
  }
  if (stat.isDirectory()) {
    return walkMarkdown(abs, warnings).map((rel) => join(abs, rel));
  }
  return [abs];
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `validate` (output.ts dispatches on the mode). */
function reportRenderable(data: ValidateReport): Renderable<ValidateReport> {
  return {
    kind: "validate.report",
    data,
    // Pretty and plain are the same layout; only color differs (plain is always ANSI-free), so a
    // single renderer keyed on the color flag keeps the two views from ever drifting.
    pretty: (report, opts) => renderReport(report, opts.color),
    plain: (report) => renderReport(report, false),
  };
}

/** One line per finding (colored by severity), a per-file `ok`/`skip` status otherwise, then a summary. */
function renderReport(data: ValidateReport, color: boolean): string {
  const lines: string[] = [];
  for (const file of data.files) {
    lines.push(...fileLines(file, color));
  }
  lines.push(summaryLine(data, color));
  return lines.join("\n");
}

/**
 * The lines for one file: a single `ok`/`skip` status when there is nothing to report, else one
 * line per finding (`error`/`warning` + path + `[rule]` + message). Color paints only the
 * severity token, so the line stays diff-stable in plain mode.
 */
function fileLines(file: FileReport, color: boolean): string[] {
  if (file.skipped) {
    return [`${paint("skip", ANSI.dim, color)} ${file.path} (not a concept)`];
  }
  if (file.findings.length === 0) {
    return [`${paint("ok", ANSI.green, color)} ${file.path}`];
  }
  return file.findings.map((finding) => findingLine(file.path, finding, color));
}

/** One finding line: `<severity> <path> [<rule>]: <message>`. */
function findingLine(path: string, finding: Finding, color: boolean): string {
  const tone = finding.severity === "error" ? ANSI.red : ANSI.yellow;
  return `${paint(finding.severity, tone, color)} ${path} [${finding.rule}]: ${finding.message}`;
}

/** The trailing summary: file/error/warning/skip counts, the error count painted when nonzero. */
function summaryLine(data: ValidateReport, color: boolean): string {
  const errors = `${data.errorCount} ${plural(data.errorCount, "error")}`;
  const painted = data.errorCount > 0 ? paint(errors, ANSI.red, color) : errors;
  return [
    `${data.files.length} ${plural(data.files.length, "file")}`,
    painted,
    `${data.warningCount} ${plural(data.warningCount, "warning")}`,
    `${data.skippedCount} skipped`,
  ].join(", ");
}

/** Pluralize a noun by count (`1 error`, `2 errors`). */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
