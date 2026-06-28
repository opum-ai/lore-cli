/**
 * commands/check.ts — `lore check [paths…]`: the read-only coherence drift gate.
 *
 * The thin, side-effecting layer over the pure {@link checkBundle} engine (ADR-0007,
 * cli-surface §check): it parses the command's own arguments, **discovers** the bundle's
 * markdown files (a default whole-bundle walk of `docs/`, or the explicit `[paths…]` a CI
 * step passes), reads their bytes, asks core for the link/anchor + portability findings,
 * renders the report, and returns the exit code. All file discovery and I/O live here; all
 * judgement lives in `core/check.ts`.
 *
 * `check` is a **gate**, so a coherence failure is not a thrown {@link LoreError}: it emits
 * the full `check.report` on stdout and then *returns* exit `6` when any broken internal
 * link or rotted anchor exists (or any portability warning under `--strict`). Portability
 * findings alone are advisory and do not fail the gate (ADR-0007). Only a *usage* error
 * (bad flag) or an *I/O* failure (an unreadable path) throws, funneling through the router's
 * one error seam like every command.
 *
 * Scope (LORE-30): this ships the two deterministic, dependency-free passes — internal
 * link/anchor validation and the portability lint. The status-reconciliation and
 * managed-block-drift passes (which need the Backlog JSON adapter + `lore sync`, LORE-26)
 * are wired in later. `--external` (external-URL liveness) is accepted but deferred — it
 * keeps the surface stable without adding non-deterministic networking to the gate.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { walkMarkdown } from "../core/bundle";
import { type CheckFinding, type CheckInputFile, type CheckReport, checkBundle } from "../core/check";
import { DOCS_DIR } from "../core/scaffold";
import { ANSI, EXIT_CODES, EXIT_OK, errnoCode, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";

/** Options for {@link runCheck}; `root` and the streams are injectable for tests. */
export interface CheckOptions {
  /** The repo root the bundle (and any relative target paths) resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's positional + flag tokens (everything after `check`), as split by the router. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for discovery advisories (a skipped symlink, an unreadable sub-directory); defaults to `process.stderr`. */
  stderr?: Writer;
}

/** The parsed form of `lore check`'s arguments. */
interface CheckArgs {
  /** Explicit bundle roots to check; empty means the default `docs/` bundle. */
  paths: string[];
  /** `--strict`: treat any portability warning as a failure for the exit code. */
  strict: boolean;
  /** `--external`: opt into external-URL liveness (accepted but deferred — advisory only). */
  external: boolean;
}

/**
 * Run `lore check`: parse the arguments, discover and read the bundle's markdown, check it,
 * emit the `check.report`, and return the exit code — `0` when coherent (portability warnings
 * alone are advisory), `6` when any broken internal link/anchor exists (or any warning under
 * `--strict`). A bad flag throws a `usage` {@link LoreError} (exit `2`); an unreadable bundle
 * root a `not_found`/`denied`.
 *
 * Discovery advisories (a `.md` skipped behind a symlink, an unreadable sub-directory) and the
 * deferred-`--external` notice are flushed to stderr — never silently swallowed — but, like
 * every advisory, they do not change the exit code.
 */
export function runCheck(options: CheckOptions): number {
  const parsed = parseCheckArgs(options.args);
  const advisories = new WarningCollector();
  if (parsed.external) {
    advisories.add("--external is accepted but external-URL liveness checking is not yet implemented; ignoring it");
  }
  const files = collectFiles(options.root, parsed.paths, advisories);

  const report = checkBundle(files);
  emit(reportRenderable(report), options.output, options.stdout);
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  const failed = report.errorCount > 0 || (parsed.strict && report.warningCount > 0);
  return failed ? EXIT_CODES.validation : EXIT_OK;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `check`'s tokens into target bundle roots and its flags. The router has already
 * stripped lore's global flags, so anything `--`-prefixed here is a command flag: an
 * unrecognized one is a `usage` error. A `--` ends option parsing so a path may begin with
 * `-`.
 */
function parseCheckArgs(args: readonly string[]): CheckArgs {
  const paths: string[] = [];
  let strict = false;
  let external = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      paths.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const name = arg.slice(2);
      switch (name) {
        case "strict":
          strict = true;
          break;
        case "external":
          external = true;
          break;
        default:
          throw usage(`unknown option "--${name}"`, "run `lore check --help` to list options");
      }
    } else if (arg.startsWith("-") && arg !== "-") {
      throw usage(`unknown option "${arg}"`, "run `lore check --help` to list options");
    } else {
      paths.push(arg);
    }
  }

  return { paths, strict, external };
}

// ── File discovery ─────────────────────────────────────────────────────────────

/**
 * Discover and read every markdown file in the bundle(s) to check, each as a
 * **bundle-root-relative** {@link CheckInputFile} — the id space the link gate resolves
 * within. With no explicit paths the bundle is `docs/`; otherwise each path names a bundle
 * root. The walk reuses the same {@link walkMarkdown} the bundle loader uses (sorted,
 * symlink-safe, `.md`-only; its skipped-symlink/unreadable-subdir advisories flow to
 * `warnings`).
 *
 * Files are keyed by their path **within their bundle root**, so a link resolves against the
 * bundle the same way `loadBundle` derives ids — independent of where the bundle sits in the
 * repo. (Checking two roots at once therefore checks each independently; cross-root links are
 * out of scope, the same as any bundle-escaping link.)
 */
function collectFiles(root: string, paths: readonly string[], warnings: WarningCollector): CheckInputFile[] {
  const roots = paths.length > 0 ? paths : [DOCS_DIR];
  const files: CheckInputFile[] = [];
  const seen = new Set<string>();
  for (const bundleRoot of roots) {
    const absRoot = join(root, bundleRoot);
    for (const rel of expandRoot(absRoot, bundleRoot, warnings)) {
      if (seen.has(rel)) {
        continue;
      }
      seen.add(rel);
      files.push({ path: rel, raw: readSource(join(absRoot, rel), `${bundleRoot}/${rel}`) });
    }
  }
  return files;
}

/**
 * Expand one bundle root to the bundle-relative `.md` paths it holds — a sorted, symlink-safe
 * walk (its advisories routed to `warnings`). A root that does not exist is a `not_found`
 * {@link LoreError} (exit `3`) naming the path the user gave, so a typo'd bundle root fails
 * loud rather than silently checking nothing; a permission failure is `denied` (exit `4`).
 *
 * A bundle root must be a **directory**: unlike per-file `lore validate`, `check` is a
 * whole-bundle gate — cross-link and anchor resolution only mean something across a bundle's
 * files — so a single-file path is a `usage` error pointing at the bundle directory instead.
 */
function expandRoot(absRoot: string, given: string, warnings: WarningCollector): string[] {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(absRoot);
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "ENOENT") {
      throw new LoreError("not_found", `path "${given}" does not exist`, "check the path and try again", {
        path: given,
      });
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `cannot access "${given}"`, "check filesystem permissions on that path", {
        path: given,
      });
    }
    throw cause;
  }
  if (!stat.isDirectory()) {
    throw usage(`"${given}" is not a directory`, "pass a bundle directory (e.g. docs/); `check` validates the whole bundle");
  }
  return walkMarkdown(absRoot, warnings);
}

/** Read one bundle file as UTF-8, mapping an I/O failure to a classified {@link LoreError}. */
function readSource(abs: string, display: string): string {
  try {
    return readFileSync(abs, "utf8");
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `permission denied reading ${display}`, `make ${display} readable`, {
        path: display,
        code,
      });
    }
    throw new LoreError("not_found", `cannot read ${display}`, "check the path exists and is readable", {
      path: display,
    });
  }
}

// ── Output ─────────────────────────────────────────────────────────────────────

/** The per-result-type rendering bundle for `check` (output.ts dispatches on the mode). */
function reportRenderable(data: CheckReport): Renderable<CheckReport> {
  return {
    kind: "check.report",
    data,
    // Pretty and plain share a layout; only color differs (plain is always ANSI-free), so a
    // single renderer keyed on the color flag keeps the two views from ever drifting.
    pretty: (report, opts) => renderReport(report, opts.color),
    plain: (report) => renderReport(report, false),
  };
}

/** One line per finding (colored by severity), then a summary line. */
function renderReport(data: CheckReport, color: boolean): string {
  const lines: string[] = data.findings.map((finding) => findingLine(finding, color));
  lines.push(summaryLine(data, color));
  return lines.join("\n");
}

/** One finding line: `<severity> <file> [<rule>]: <message>`. */
function findingLine(finding: CheckFinding, color: boolean): string {
  const tone = finding.severity === "error" ? ANSI.red : ANSI.yellow;
  return `${paint(finding.severity, tone, color)} ${finding.file} [${finding.rule}]: ${finding.message}`;
}

/** The trailing summary: file/error/warning counts, the error count painted when nonzero. */
function summaryLine(data: CheckReport, color: boolean): string {
  const errors = `${data.errorCount} ${plural(data.errorCount, "error")}`;
  const painted = data.errorCount > 0 ? paint(errors, ANSI.red, color) : errors;
  return [
    `${data.fileCount} ${plural(data.fileCount, "file")}`,
    painted,
    `${data.warningCount} ${plural(data.warningCount, "warning")}`,
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
