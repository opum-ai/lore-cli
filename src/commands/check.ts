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
 * Scope: this ships the two deterministic, dependency-free passes — internal link/anchor
 * validation and the portability lint (now including MDX-hazard and filename-portability
 * findings, LORE-48) — plus the **opt-in** `--external` URL liveness probe. Liveness is the one
 * non-deterministic, network-touching path: it is kept out of the gate entirely (advisory only,
 * never changes the exit code — not even under `--strict`, ADR-0007) and its IO lives here, never
 * in pure `core/` (ADR-0014). The status-reconciliation and managed-block-drift passes (which need
 * the Backlog JSON adapter + `lore sync`, LORE-26/27) are wired in later.
 */

import { statSync } from "node:fs";
import { join } from "node:path";
import { walkFiles } from "../core/bundle";
import {
  type CheckFinding,
  type CheckInputFile,
  type CheckReport,
  checkBundle,
  collectExternalLinks,
  type ExternalLink,
} from "../core/check";
import { DOCS_DIR } from "../core/scaffold";
import { ANSI, EXIT_CODES, EXIT_OK, ioError, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { readSource } from "./discover";

/** A minimal fetch — the global `fetch` satisfies it, and tests inject a deterministic fake. */
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/** Options for {@link runCheck}; `root`, the streams, and `fetch` are injectable for tests. */
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
  /** The fetch used by `--external` liveness; defaults to the global `fetch`. Injected in tests so they touch no network. */
  fetch?: FetchLike;
}

/** The parsed form of `lore check`'s arguments. */
interface CheckArgs {
  /** Explicit bundle roots to check; empty means the default `docs/` bundle. */
  paths: string[];
  /** `--strict`: treat any portability warning as a failure for the exit code. */
  strict: boolean;
  /** `--external`: opt into non-deterministic external-URL liveness (advisory only; never gates). */
  external: boolean;
}

/**
 * Run `lore check`: parse the arguments, discover and read the bundle's markdown, check it,
 * emit the `check.report`, and return the exit code — `0` when coherent (portability warnings
 * alone are advisory), `6` when any broken internal link/anchor exists (or any warning under
 * `--strict`). A bad flag throws a `usage` {@link LoreError} (exit `2`); an unreadable bundle
 * root a `not_found`/`denied`.
 *
 * **Return type.** The deterministic gate is synchronous: without `--external`, `runCheck` returns
 * a `number` directly (the contract every existing caller and test relies on). With `--external` it
 * returns a `Promise<number>` — the same gate exit code, resolved only after the **non-deterministic**
 * liveness probe has finished and its advisory `external-link` findings have been emitted. The
 * liveness results **never** change the exit code (not even under `--strict`), so the gate decision
 * itself is fixed before any network call (ADR-0007); the network IO lives here, never in core
 * (ADR-0014). All gate throws (`usage`/`not_found`/`denied`) happen on the synchronous path, before
 * any promise, so the router's one error seam still catches them.
 *
 * Discovery advisories (a `.md` skipped behind a symlink, an unreadable sub-directory) are flushed
 * to stderr — never silently swallowed — but, like every advisory, do not change the exit code.
 */
export function runCheck(options: CheckOptions): number | Promise<number> {
  const parsed = parseCheckArgs(options.args);
  const advisories = new WarningCollector();
  const bundles = collectBundles(options.root, parsed.paths, advisories);
  const report = checkBundles(bundles);
  const exit = report.errorCount > 0 || (parsed.strict && report.warningCount > 0) ? EXIT_CODES.validation : EXIT_OK;

  if (!parsed.external) {
    emit(reportRenderable(report), options.output, options.stdout);
    advisories.flush({ color: options.output.color, stderr: options.stderr });
    return exit;
  }

  // Opt-in liveness: probe every external http(s) URL off the (already-fixed) gate path, fold the
  // results into the report as advisory `external-link` findings, then emit once so the `--json`
  // envelope carries gate + liveness together. The exit code stays the gate's `exit`, untouched.
  const worklist = bundles.flatMap((bundle) =>
    prefixLinks(collectExternalLinks(bundle.files), bundle.label, bundles.length > 1),
  );
  return probeLiveness(worklist, options.fetch ?? defaultFetch)
    .then((externalFindings) => {
      emit(reportRenderable({ ...report, externalFindings }), options.output, options.stdout);
      advisories.flush({ color: options.output.color, stderr: options.stderr });
      return exit;
    })
    .catch((err: unknown) => {
      // Liveness is best-effort: a probe failure becomes a finding, never a thrown error, so this
      // only fires on an unexpected fault. Surface it through the same seam and keep the gate code.
      emit(reportRenderable(report), options.output, options.stdout);
      advisories.add(`external-link liveness aborted: ${err instanceof Error ? err.message : String(err)}`);
      advisories.flush({ color: options.output.color, stderr: options.stderr });
      return exit;
    });
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

/** One discovered bundle root: the path the user named (for display), its files, and filename findings. */
interface Bundle {
  /** The bundle root as given (e.g. `docs`), used to disambiguate findings across roots. */
  readonly label: string;
  /** The root's `.md` files, each keyed by its **bundle-root-relative** path. */
  readonly files: CheckInputFile[];
  /** Warn-only filename-portability findings for this root (leading `_`, `.mdx`), independent of content. */
  readonly filenameFindings: readonly CheckFinding[];
}

/**
 * Discover and read each bundle root's markdown as an **independent** {@link Bundle} — files
 * keyed by their path **within that root**, so a link resolves against its own bundle the same
 * way `loadBundle` derives ids. With no explicit paths the single bundle is `docs/`; otherwise
 * each path names a bundle root (duplicate roots are de-duplicated). The walk reuses the same
 * robust traversal the bundle loader uses (sorted, symlink-safe; its skipped-symlink/
 * unreadable-subdir advisories flow to `warnings`), widened to `.md` **and** `.mdx` so the
 * filename-portability lint can see a stray `.mdx` — only the `.md` files are content-checked.
 *
 * Each root is a separate bundle with its **own id namespace** — so two roots that share a
 * relative path (e.g. a per-bundle `index.md`) never collide or shadow one another, and each is
 * checked in full. Cross-root links are out of scope, the same as any bundle-escaping link.
 */
function collectBundles(root: string, paths: readonly string[], warnings: WarningCollector): Bundle[] {
  const roots = paths.length > 0 ? paths : [DOCS_DIR];
  const bundles: Bundle[] = [];
  const seenRoots = new Set<string>();
  for (const bundleRoot of roots) {
    const absRoot = join(root, bundleRoot);
    if (seenRoots.has(absRoot)) {
      continue; // the same root named twice is one bundle, not two
    }
    seenRoots.add(absRoot);
    const docFiles = expandRoot(absRoot, bundleRoot, warnings);
    const files = docFiles
      .filter(isMarkdownPath)
      .map((rel) => ({ path: rel, raw: readSource(join(absRoot, rel), `${bundleRoot}/${rel}`) }));
    const filenameFindings = docFiles.flatMap(filenameHazards);
    bundles.push({ label: bundleRoot, files, filenameFindings });
  }
  return bundles;
}

/**
 * Check every discovered {@link Bundle} independently and merge into one {@link CheckReport}. Each
 * bundle's deterministic findings and its warn-only filename findings are concatenated, and the
 * latter are folded into `warningCount`. When more than one root is checked, every finding's `file`
 * is prefixed with its bundle label so two roots' same-named files stay distinguishable; a single
 * bundle's findings keep the plain bundle-relative path.
 */
function checkBundles(bundles: readonly Bundle[]): CheckReport {
  const multi = bundles.length > 1;
  const findings: CheckFinding[] = [];
  let fileCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  for (const bundle of bundles) {
    const report = checkBundle(bundle.files);
    fileCount += report.fileCount;
    errorCount += report.errorCount;
    warningCount += report.warningCount + bundle.filenameFindings.length;
    for (const finding of [...report.findings, ...bundle.filenameFindings]) {
      findings.push(multi ? { ...finding, file: `${bundle.label}/${finding.file}` } : finding);
    }
  }
  return { findings, errorCount, warningCount, fileCount };
}

/** Whether a discovered doc path is a content-checkable `.md` (lowercase, matching the bundle loader) rather than a `.mdx`. */
function isMarkdownPath(rel: string): boolean {
  return /\.md$/.test(rel);
}

/**
 * The warn-only filename-portability findings for one discovered doc path (portable-markdown.md
 * §MDX): a leading-underscore **segment** (file or folder) that Docusaurus treats as an ignored
 * partial, and a `.mdx` extension (lore keeps docs as `.md` so they render on
 * GitHub/Obsidian/MkDocs). Both are advisory; the file is named relative to its bundle root.
 */
function filenameHazards(rel: string): CheckFinding[] {
  const findings: CheckFinding[] = [];
  const underscored = rel.split("/").find((segment) => segment.startsWith("_"));
  if (underscored !== undefined) {
    findings.push({
      severity: "warning",
      rule: "portability",
      file: rel,
      message: `non-portable name "${underscored}"; Docusaurus ignores a leading-underscore file or folder as a partial — drop the leading "_"`,
    });
  }
  if (/\.mdx$/i.test(rel)) {
    findings.push({
      severity: "warning",
      rule: "portability",
      file: rel,
      message: `non-portable ".mdx" file; keep docs as .md so they render on GitHub/Obsidian/MkDocs (lore never writes .mdx)`,
    });
  }
  return findings;
}

/**
 * Expand one bundle root to the bundle-relative `.md`/`.mdx` paths it holds — a sorted, symlink-safe
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
    ioError(cause, {
      denied: { message: `cannot access "${given}"`, hint: "check filesystem permissions on that path" },
      notFound: { message: `path "${given}" does not exist`, hint: "check the path and try again" },
      input: { path: given },
      rethrowUnknown: true,
    });
  }
  if (!stat.isDirectory()) {
    throw usage(
      `"${given}" is not a directory`,
      "pass a bundle directory (e.g. docs/); `check` validates the whole bundle",
    );
  }
  return walkFiles(absRoot, warnings, isDocName);
}

/** Whether a file name is a discoverable doc: a lowercase `.md` (content) or any-case `.mdx` (filename lint only). */
function isDocName(name: string): boolean {
  return /\.md$/.test(name) || /\.mdx$/i.test(name);
}

// ── External-URL liveness (opt-in, non-deterministic, never gates) ────────────────

/** Per-request liveness timeout — a slow or hung host is reported, not waited on indefinitely. */
const LIVENESS_TIMEOUT_MS = 5000;
/** How many liveness probes run at once — bounded so a large bundle does not open a socket per URL. */
const LIVENESS_CONCURRENCY = 8;

/** The real network probe: the global `fetch`, narrowed to the {@link FetchLike} the prober needs. */
const defaultFetch: FetchLike = (url, init) => fetch(url, init);

/** Prefix each external link's `file` with its bundle label in multi-bundle mode, matching the gate findings. */
function prefixLinks(links: ExternalLink[], label: string, multi: boolean): ExternalLink[] {
  return multi ? links.map((link) => ({ ...link, file: `${label}/${link.file}` })) : links;
}

/**
 * Probe every external URL in the worklist for liveness and return one advisory `external-link`
 * warning per dead/unreachable occurrence (a live URL yields none). Each **distinct** URL is
 * fetched once (deduplicated), under a bounded concurrency and a per-request timeout, then the
 * result is fanned back out to every `(file, url)` that referenced it — so a URL linked from five
 * files is fetched once but reported five times. Pure-ish: all network goes through the injected
 * `fetchFn`, and a fetch rejection becomes a finding, never a throw.
 */
async function probeLiveness(links: readonly ExternalLink[], fetchFn: FetchLike): Promise<CheckFinding[]> {
  const uniqueUrls = [...new Set(links.map((link) => link.url))];
  const failureByUrl = new Map<string, string | null>(); // null = alive; string = the failure reason
  await mapWithConcurrency(uniqueUrls, LIVENESS_CONCURRENCY, async (url) => {
    failureByUrl.set(url, await probeOne(url, fetchFn));
  });
  const findings: CheckFinding[] = [];
  for (const link of links) {
    const failure = failureByUrl.get(link.url);
    if (failure != null) {
      findings.push({
        severity: "warning",
        rule: "external-link",
        file: link.file,
        message: `external link "${link.url}" ${failure}`,
      });
    }
  }
  return findings;
}

/** Probe one URL: `null` when it answers `2xx`, else a short reason (a non-OK status, a timeout, or an unreachable host). */
async function probeOne(url: string, fetchFn: FetchLike): Promise<string | null> {
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(LIVENESS_TIMEOUT_MS) });
    return response.ok ? null : `is dead (HTTP ${response.status})`;
  } catch (cause) {
    if (cause instanceof Error && cause.name === "TimeoutError") {
      return `did not respond within ${LIVENESS_TIMEOUT_MS}ms`;
    }
    return `is unreachable (${cause instanceof Error ? cause.message : String(cause)})`;
  }
}

/** Run `fn` over `items` with at most `limit` in flight at once — a tiny worker-pool over a shared cursor. */
async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++] as T;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

/** One line per gate finding, then the opt-in external-liveness findings, then a summary line. */
function renderReport(data: CheckReport, color: boolean): string {
  const lines: string[] = data.findings.map((finding) => findingLine(finding, color));
  for (const finding of data.externalFindings ?? []) {
    lines.push(findingLine(finding, color));
  }
  lines.push(summaryLine(data, color));
  return lines.join("\n");
}

/** One finding line: `<severity> <file> [<rule>]: <message>`. */
function findingLine(finding: CheckFinding, color: boolean): string {
  const tone = finding.severity === "error" ? ANSI.red : ANSI.yellow;
  return `${paint(finding.severity, tone, color)} ${finding.file} [${finding.rule}]: ${finding.message}`;
}

/**
 * The trailing summary: file/error/warning counts (the error count painted when nonzero), plus a
 * separate `N external issue(s)` segment when `--external` ran — kept distinct from the gate's
 * `warning` count because external-liveness results never affect the exit code.
 */
function summaryLine(data: CheckReport, color: boolean): string {
  const errors = `${data.errorCount} ${plural(data.errorCount, "error")}`;
  const painted = data.errorCount > 0 ? paint(errors, ANSI.red, color) : errors;
  const parts = [
    `${data.fileCount} ${plural(data.fileCount, "file")}`,
    painted,
    `${data.warningCount} ${plural(data.warningCount, "warning")}`,
  ];
  if (data.externalFindings !== undefined) {
    parts.push(`${data.externalFindings.length} external ${plural(data.externalFindings.length, "issue")}`);
  }
  return parts.join(", ");
}

/** Pluralize a noun by count (`1 error`, `2 errors`). */
function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** A `usage` {@link LoreError} (exit `2`) with an actionable hint. */
function usage(message: string, hint: string): LoreError {
  return new LoreError("usage", message, hint);
}
