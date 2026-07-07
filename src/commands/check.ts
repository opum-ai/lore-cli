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
 * Scope: this ships all four ADR-0007 passes. Internal link/anchor validation and the portability
 * lint (now including MDX-hazard and filename-portability findings, LORE-48) are deterministic and
 * dependency-free. Status reconciliation and managed-block drift (LORE-27) reuse the exact pure
 * engines `lore sync` writes with ({@link reconcileStatus}, {@link regenerateTaskBlock}, via the
 * `commands/reconcile-shared.ts` gather shared with `sync`) but only diff against disk — this
 * command never writes. Both are **errors**, always gating (unlike the warn-only portability lint).
 * Finally, the **opt-in** `--external` URL liveness probe: the one non-deterministic, network-
 * touching path, kept out of the gate entirely (advisory only, never changes the exit code — not
 * even under `--strict`, ADR-0007) with its IO living here, never in pure `core/` (ADR-0014).
 */

import { statSync } from "node:fs";
import { join, posix } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { toRefList, walkFiles } from "../core/bundle";
import {
  type CheckFinding,
  type CheckInputFile,
  type CheckReport,
  checkBundle,
  collectExternalLinks,
  type ExternalLink,
  reconcileDriftFindings,
  tallySeverity,
} from "../core/check";
import { type Concept, parseConcept, tryReadFrontmatter } from "../core/concept";
import { DOCS_DIR } from "../core/scaffold";
import { ANSI, EXIT_CODES, EXIT_OK, ioError, LoreError, paint, WarningCollector, type Writer } from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { readSource } from "./discover";
import { dedupeTaskIds, defaultAdapter } from "./link";
import {
  gatherReconciliation,
  linkedConcepts,
  type ReconcileConfig,
  resolveReconcileConfig,
  resolveTaskDetails,
  type TaskResolution,
} from "./reconcile-shared";

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
  /** The Backlog adapter for status/managed-block reconciliation; defaults to the real `backlog` binary on PATH. Only constructed when at least one discovered concept links a task. */
  adapter?: BacklogAdapter;
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
 * **Return type.** The deterministic gate is synchronous: when nothing discovered links a Backlog
 * task and `--external` is absent, `runCheck` returns a `number` directly (the contract every
 * existing caller and test relies on). Otherwise it returns a `Promise<number>` — the same gate
 * exit code, resolved only after status/managed-block reconciliation (LORE-27) and/or the
 * **non-deterministic** liveness probe have finished. Liveness results **never** change the exit
 * code (not even under `--strict`); reconciliation drift **is** part of the gate (like broken
 * links/anchors, always an error). The network IO for liveness lives here, never in core
 * (ADR-0014). All gate throws (`usage`/`not_found`/`denied`/`validation`) happen either on the
 * synchronous path or propagate through the returned promise's rejection, so the router's one
 * error seam still catches them either way.
 *
 * Discovery advisories (a `.md` skipped behind a symlink, an unreadable sub-directory) are flushed
 * to stderr — never silently swallowed — but, like every advisory, do not change the exit code.
 */
export function runCheck(options: CheckOptions): number | Promise<number> {
  const parsed = parseCheckArgs(options.args);
  const advisories = new WarningCollector();
  const bundles = collectBundles(options.root, parsed.paths, advisories);
  const baseReport = checkBundles(bundles);

  // Reuse the SAME already-read files (no second directory walk, no second read) to find which are
  // `tasks:`-linked concepts per bundle root, so status/managed-block reconciliation can run the same
  // way the link/anchor pass already does. `tryConceptsForBundle` NEVER throws — a bundle root's own
  // scan failure (a malformed-AND-`tasks:`-linked concept) is carried as `error` on its own result,
  // isolated from every OTHER root's scan, mirroring how the async drift computation below already
  // isolates root failures from each other (an earlier version of this scan used a bare `.map()` that
  // let one root's throw abort every other root's scan too, discarding drift that was never even
  // computed — LORE-27 round 9). Cheap to check without any Backlog IO: `linkedConcepts` is pure.
  const conceptBundleResults = bundles.map(tryConceptsForBundle);
  const needsReconciliation = conceptBundleResults.some(
    (result) => result.error !== null || linkedConcepts(result.concepts).length > 0,
  );

  // Every discovery-time advisory is known by now — flush once, immediately, for every path
  // uniformly (the scan above can no longer throw, so there is no special-cased branch to keep this
  // in sync with): `advisories.flush` is non-draining, so flushing more than once would re-emit the
  // same lines, and deferring risks losing them entirely if reconciliation later rejects. This means
  // stderr (advisories) is now written BEFORE stdout (the report) — the opposite of this command's
  // pre-LORE-27 order — deliberately: mirrors `sync.ts`'s own precedent (it flushes right after
  // `loadBundle`, well before its own final `emit`), and "advisories survive a later rejection" is a
  // stronger guarantee to keep than "stdout precedes stderr" (already an unreliable assumption for
  // any CLI merging two independently-buffered streams).
  advisories.flush({ color: options.output.color, stderr: options.stderr });

  if (!needsReconciliation && !parsed.external) {
    emit(reportRenderable(baseReport), options.output, options.stdout);
    return exitFor(baseReport, parsed.strict);
  }

  const adapter = needsReconciliation ? (options.adapter ?? defaultAdapter(options.root)) : undefined;
  const multi = bundles.length > 1;
  // `driftPromise` never REJECTS — a per-root failure (a scan failure, a missing linked task, a
  // malformed managed block, a bad status-flow config) is carried as `DriftResult.error` instead, so
  // whatever DID resolve (this root's or another root's drift findings, and the already-computed
  // `baseReport`) is never silently discarded the way a rejected promise would discard it. `error` is
  // still re-thrown below, after emitting — it's a real gate failure, not best-effort like liveness.
  const driftPromise: Promise<DriftResult> = needsReconciliation
    ? computeDriftFindings(options.root, conceptBundleResults, multi, adapter as BacklogAdapter)
    : Promise.resolve({ findings: [], error: null });

  if (!parsed.external) {
    return driftPromise.then(({ findings, error }) => {
      const report = mergeFindings(baseReport, findings);
      emit(reportRenderable(report), options.output, options.stdout);
      if (error !== null) {
        throw error;
      }
      return exitFor(report, parsed.strict);
    });
  }

  // Opt-in liveness: probe every external http(s) URL off the (already-fixed) gate path, fold the
  // results into the report as advisory `external-link` findings, then emit once so the `--json`
  // envelope carries gate + liveness together. The exit code stays the gate's, untouched by liveness.
  // Kicked off CONCURRENTLY with `driftPromise` (a `Promise.all`, not a `.then` chain) — the two are
  // fully independent I/O (a Backlog subprocess round-trip vs. HTTP fetches over already-read bytes),
  // so serializing them would needlessly inflate `--external`'s wall-clock time on any bundle that
  // also reconciles.
  const worklist = bundles.flatMap((bundle) => prefixLinks(collectExternalLinks(bundle.files), bundle.label, multi));
  const livenessPromise = probeLiveness(worklist, options.fetch ?? defaultFetch).then(
    (findings): LivenessResult => ({ ok: true, findings }),
    (err: unknown): LivenessResult => ({ ok: false, err }),
  );
  return Promise.all([driftPromise, livenessPromise]).then(([{ findings, error }, liveness]) => {
    const report = mergeFindings(baseReport, findings);
    if (liveness.ok) {
      emit(reportRenderable({ ...report, externalFindings: liveness.findings }), options.output, options.stdout);
    } else {
      // Liveness is best-effort: a probe failure becomes a finding, never a thrown error, so this
      // only fires on an unexpected fault. Surface it through the same seam and keep the gate code.
      emit(reportRenderable(report), options.output, options.stdout);
      // A fresh collector for this one late advisory: the main `advisories` was already flushed
      // above (non-draining — reusing it here would re-emit every earlier discovery advisory too).
      const late = new WarningCollector();
      late.add(
        `external-link liveness aborted: ${liveness.err instanceof Error ? liveness.err.message : String(liveness.err)}`,
      );
      late.flush({ color: options.output.color, stderr: options.stderr });
    }
    if (error !== null) {
      throw error;
    }
    return exitFor(report, parsed.strict);
  });
}

/** The best-effort outcome of the opt-in `--external` liveness probe — never a rejection, so it composes with `Promise.all` without losing `driftPromise`'s own result. */
type LivenessResult =
  | { readonly ok: true; readonly findings: CheckFinding[] }
  | { readonly ok: false; readonly err: unknown };

/** One bundle root's concept-scan outcome: the `tasks:`-linked concepts it found, or its own scan failure. */
interface ConceptBundleResult {
  readonly bundle: Bundle;
  readonly concepts: Concept[];
  readonly error: unknown | null;
}

/**
 * Best-effort, per-bundle-root parse of already-read files into `tasks:`-linked {@link Concept}s,
 * for deciding reconciliation eligibility. NEVER throws — a scan failure is carried as `error`
 * instead, isolated from every OTHER bundle root's scan and from the already-computed `baseReport`,
 * which must survive regardless of whether any one root's scan fails ({@link computeDriftFindings}
 * folds this the same way it folds an async per-root failure). Isolated PER FILE too, the same way:
 * each file's own parse is its own try/catch, so a LATER file's failure never discards concepts
 * already collected from EARLIER files in the same root (an earlier version of this function shared
 * one try/catch across the whole loop, so any failure silently dropped every already-collected
 * concept for that root, not just the one that actually failed — LORE-27 round 10).
 *
 * Each file's frontmatter is first PEEKED via the cheap, non-validating {@link tryReadFrontmatter}
 * (no Zod schema check) — a file with no `tasks:` link (the vast majority of any bundle: ADRs,
 * specs, index/log) is never reconciliation-relevant regardless of whether its frontmatter would
 * otherwise validate, so it is skipped WITHOUT paying for full parse+validation at all.
 *
 * Only a file that DOES declare `tasks:` is fully parsed+validated ({@link parseConcept}, which
 * throws loud on a malformed mapping) — `lore sync` would refuse to touch that exact file too, so
 * silently treating it as un-linked would be a real false-negative against `check`'s own drift gate,
 * the one case where `check` really would otherwise disagree with what `sync` does. An
 * unparseable-YAML file (`tryReadFrontmatter` itself throws — there is no mapping to peek a `tasks:`
 * field from, so it cannot be assumed innocent) is treated the same as "declares `tasks:`".
 */
function tryConceptsForBundle(bundle: Bundle): ConceptBundleResult {
  const concepts: Concept[] = [];
  let error: unknown | null = null;
  for (const file of bundle.files) {
    try {
      const raw = tryReadFrontmatter(file.path, file.raw);
      if (raw === null || toRefList(raw.tasks).length === 0) {
        continue;
      }
      concepts.push(parseConcept(file.path, file.raw));
    } catch (err) {
      if (error === null) {
        error = err; // first, in file order; keep scanning so later files' concepts still count too
      }
    }
  }
  return { bundle, concepts, error };
}

/** The gate's exit code from a {@link CheckReport}: `6` on any error, or any warning under `--strict`. */
function exitFor(report: CheckReport, strict: boolean): number {
  return report.errorCount > 0 || (strict && report.warningCount > 0) ? EXIT_CODES.validation : EXIT_OK;
}

/** Append findings (bundle-label-prefixed by the caller already) into a {@link CheckReport}'s counts. */
function mergeFindings(report: CheckReport, extra: readonly CheckFinding[]): CheckReport {
  if (extra.length === 0) {
    return report;
  }
  const added = tallySeverity(extra);
  return {
    ...report,
    findings: [...report.findings, ...extra],
    errorCount: report.errorCount + added.errorCount,
    warningCount: report.warningCount + added.warningCount,
  };
}

// ── Status + managed-block reconciliation drift (LORE-27) ────────────────────────

/**
 * The outcome of {@link computeDriftFindings}: every drift finding that WAS successfully computed
 * (across every bundle root, regardless of whether another root failed), plus the first failure (if
 * any), in bundle-argument order — never wall-clock/settlement order, so which root's error is
 * reported is deterministic and reproducible across runs, not a race. Deliberately never a rejected
 * promise: `findings` must survive a `error !== null` outcome so the caller can still emit the full
 * report before propagating the failure (a `Promise.all` rejection would discard every OTHER root's
 * already-resolved findings, and the caller's already-computed `baseReport`, silently).
 */
interface DriftResult {
  readonly findings: CheckFinding[];
  readonly error: unknown | null;
}

/**
 * The pooled reconciliation inputs {@link computeDriftFindings} resolves once for the whole run
 * (LORE-50). `config`/`details`/`configError` are all `undefined`/`null` when no bundle root has any
 * eligible concept — nothing to pool, and `computeDriftFindings`'s per-root calls fall through to
 * `gatherReconciliation`'s own empty-eligible short-circuit, same as if pooling had never run.
 *
 * `configError` is deliberately NOT treated as an overall failure here — a config-validation throw
 * is caught (config resolution is synchronous) and carried as data, never left to reject this
 * `resolveSharedReconciliation` call, so `computeDriftFindings` can still run every bundle root's OWN
 * per-root pass (a root with no eligible concept never even sees `configError`; a root WITH eligible
 * concepts still fails at the exact same fail-fast point a fresh per-root config read would have hit,
 * via `gatherReconciliation`'s `configErrorOverride`). Short-circuiting `computeDriftFindings` itself
 * on a bare `configError !== null` (an earlier version of this pooling did exactly that) would
 * discard every root's own already-known concept-scan error in favor of the shared config failure,
 * breaking the "first error, in bundle-argument order" contract {@link DriftResult} documents — a
 * root whose OWN scan failed must still report ITS OWN error first, same as before pooling existed.
 * Never `undefined` when non-null: normalized the same way {@link resolveTaskDetails} normalizes a
 * rejection reason, so it can never collide with the "no error" sentinel downstream.
 */
interface PooledReconciliation {
  readonly config: ReconcileConfig | undefined;
  readonly details: ReadonlyMap<string, TaskResolution> | undefined;
  readonly configError: Error | null;
}

/**
 * Pool every bundle root's eligible concepts to resolve the status-flow config and the union of
 * linked task ids each exactly once, regardless of how many roots are checked. Concepts already
 * carrying their own scan `error` are still included via `bundle.concepts` (whatever the scan DID
 * successfully collect before failing) — the same partial-collection contract `tryConceptsForBundle`
 * already documents, so pooling never under-resolves an id a root's surviving concepts still need.
 *
 * Task-id resolution is skipped entirely when config resolution fails: every root with an eligible
 * concept would fail at the config step before ever reaching a task id anyway (`gatherReconciliation`'s
 * own fail-fast order), so attempting it here would only pay for Backlog IO whose result can never
 * be used.
 *
 * {@link resolveTaskDetails} is documented to never throw, but is called through a caller-supplied
 * `adapter` this module does not control — a wrapper/decorator adapter that throws SYNCHRONOUSLY
 * (rather than rejecting) would otherwise reject this whole pooling step, and from there
 * `computeDriftFindings` itself, silently discarding the already-computed link/anchor report on
 * whatever emits it (`runCheck`'s `driftPromise.then` has no `.catch`). Guarded the same way the
 * config resolution above is: on failure, `details` stays `undefined` and every bundle root simply
 * falls back to resolving its own ids independently (paying the per-root cost this pooling exists to
 * avoid, but ONLY in this unexpected-failure case) — `computeDriftFindings`'s own per-root
 * `Promise.allSettled` loop already isolates whatever happens next, same as before pooling existed.
 */
async function resolveSharedReconciliation(
  root: string,
  conceptBundleResults: readonly ConceptBundleResult[],
  adapter: BacklogAdapter,
): Promise<PooledReconciliation> {
  const allEligible = conceptBundleResults.flatMap(({ concepts }) => linkedConcepts(concepts));
  if (allEligible.length === 0) {
    return { config: undefined, details: undefined, configError: null };
  }

  let config: ReconcileConfig;
  try {
    config = resolveReconcileConfig(root);
  } catch (err) {
    return { config: undefined, details: undefined, configError: err instanceof Error ? err : new Error(String(err)) };
  }

  const allTaskIds = dedupeTaskIds(allEligible.flatMap((e) => e.linked));
  let details: ReadonlyMap<string, TaskResolution> | undefined;
  try {
    details = await resolveTaskDetails(adapter, allTaskIds);
  } catch {
    details = undefined;
  }
  return { config, details, configError: null };
}

/**
 * The status/managed-block drift findings for every `tasks:`-linked concept across every bundle
 * root, reusing the same `commands/reconcile-shared.ts` gather `lore sync` writes with. Every root
 * is resolved concurrently (`Promise.allSettled`, mirroring how the raw-file passes already treat
 * roots as independent), sharing one `adapter` instance so its capability probe runs at most once
 * regardless of how many roots are checked.
 *
 * The status-flow config and every distinct linked task id are each resolved AT MOST ONCE across
 * the WHOLE run (LORE-50), not once per bundle root: before the per-root loop, every root's eligible
 * concepts are pooled ({@link resolveSharedReconciliation}) to compute the config once and the union
 * of linked ids once, and both are handed to every root's own {@link driftFindingsForBundle} call as
 * overrides. This does not weaken per-root isolation: a shared config failure fails every root
 * identically to before (every root reads the SAME file, so today it already fails the same way N
 * times); a shared task-id failure only fails the root(s) whose OWN linked concepts reference that id
 * ({@link gatherReconciliation}'s `detailsOverride` still throws per-call, scoped to that call's own
 * ids) — a root that never links the failing id is untouched, exactly as if it had resolved that id
 * itself. The pooling step itself is synchronous-safe: a config-validation throw (or an unexpected
 * pooled task-resolution failure) is caught inside `resolveSharedReconciliation`, never left to reject
 * this function outright, so `computeDriftFindings` keeps its own "never rejects" contract below.
 *
 * A root whose synchronous concept-scan already failed ({@link ConceptBundleResult.error}) still has
 * `driftFindingsForBundle` run over whatever concepts it DID successfully collect before the failure
 * (never skipped outright — an earlier version treated any scan error as "reject this whole root,
 * process nothing," discarding real drift on concepts the scan had already parsed fine before hitting
 * the one that failed). The root's own scan error is then combined with whatever
 * `driftFindingsForBundle` found, preferring the scan error when both exist (it is the logically
 * earlier problem — some of this root's concepts were never even examined because of it).
 */
async function computeDriftFindings(
  root: string,
  conceptBundleResults: readonly ConceptBundleResult[],
  multi: boolean,
  adapter: BacklogAdapter,
): Promise<DriftResult> {
  const pooled = await resolveSharedReconciliation(root, conceptBundleResults, adapter);

  const settled = await Promise.allSettled(
    conceptBundleResults.map(async ({ bundle, concepts, error }) => {
      const drift = await driftFindingsForBundle(root, bundle, concepts, multi, adapter, pooled);
      return { findings: drift.findings, error: error ?? drift.error };
    }),
  );
  const findings: CheckFinding[] = [];
  let error: unknown | null = null;
  for (const result of settled) {
    if (result.status === "fulfilled") {
      findings.push(...result.value.findings);
      if (error === null) {
        error = result.value.error; // this root's own scan error, or a per-concept reconciliation
        // failure within it (still findings alongside it either way)
      }
    } else if (error === null) {
      error = result.reason; // this root's own scan failed, or gatherReconciliation itself rejected for
      // it (a missing task, a bad status-flow config) -- that root's findings are unrecoverable at this
      // granularity, same as before; every OTHER root's findings (and this one's own
      // reconcileDriftFindings partial results, when IT throws instead) are still preserved above.
    }
  }
  return { findings, error };
}

/**
 * The drift findings for one bundle root, looking up each target's original bytes from the
 * already-read `bundle.files` (no re-read). Each concept's own {@link reconcileDriftFindings} call is
 * isolated: a later concept's malformed managed-block markers (or any other per-concept judgment
 * failure) does not discard findings already computed for EARLIER concepts in this same root — only
 * the first such error (in `targets` order) is carried, the rest are dropped as unreachable once a
 * fail-fast is already pending, mirroring {@link computeDriftFindings}'s own cross-root policy at
 * this finer, within-root grain.
 *
 * `pooled` is {@link computeDriftFindings}'s pooled, resolved-once-per-run input (LORE-50); its three
 * fields are passed straight through to {@link gatherReconciliation} as its overrides, so this root
 * never re-reads the config file or re-fetches a task id another root already resolved. When
 * `pooled.configError` is set (and this root has any eligible concept at all), `gatherReconciliation`
 * throws it immediately — the same fail-fast point a fresh config read would have hit for this root,
 * without a second read; a root with no eligible concept never reaches that check regardless.
 */
async function driftFindingsForBundle(
  root: string,
  bundle: Bundle,
  concepts: readonly Concept[],
  multi: boolean,
  adapter: BacklogAdapter,
  pooled: PooledReconciliation,
): Promise<{ findings: CheckFinding[]; error: unknown | null }> {
  const targets = await gatherReconciliation(
    root,
    concepts,
    adapter,
    pooled.config,
    pooled.details,
    pooled.configError ?? undefined,
  );
  const rawByPath = new Map(bundle.files.map((f) => [f.path, f.raw]));
  const fixable = isDocsRoot(bundle.label);
  const findings: CheckFinding[] = [];
  let error: unknown | null = null;
  for (const { concept, newStatus, rows } of targets) {
    const docPath = `${bundle.label}/${concept.path}`;
    const original = rawByPath.get(concept.path) as string;
    try {
      const drift = reconcileDriftFindings({
        path: concept.path,
        currentStatus: concept.frontmatter.status,
        newStatus,
        original,
        rows,
        docPath,
        fixable,
      });
      for (const finding of drift) {
        findings.push(prefixFinding(finding, bundle.label, multi));
      }
    } catch (err) {
      if (error === null) {
        error = err; // first, in `targets` order; keep processing the rest so THEIR findings survive too
      }
    }
  }
  return { findings, error };
}

/** Prefix a finding's `file` with its bundle-root label in multi-root mode; unchanged for a single root. */
function prefixFinding<T extends { readonly file: string }>(finding: T, label: string, multi: boolean): T {
  return multi ? { ...finding, file: `${label}/${finding.file}` } : finding;
}

/**
 * Whether a bundle root (as the user named it — or the default) IS the `docs/` bundle `lore sync`
 * operates on, canonicalized so an equivalent-but-non-canonical spelling (`./docs`, a trailing
 * slash OR backslash) is still recognized — a literal string-prefix match against a compound
 * `docPath` would miss these and silently omit `reconcileDriftFindings`' "run `lore sync`" hint for
 * a root it actually can fix. Backslashes are normalized to forward slashes FIRST (`posix.normalize`
 * only recognizes `/` as a separator, so a Windows-idiom trailing `docs\` would otherwise survive
 * untouched). Compared case-insensitively: on the case-insensitive filesystems most local dev
 * happens on (macOS, Windows), a differently-cased spelling (`Docs`) resolves to the identical
 * directory `sync` operates on, so judging it "unfixable" would be the misleading answer, not the
 * careful one.
 */
export function isDocsRoot(label: string): boolean {
  return posix.normalize(label.replace(/\\/g, "/")).replace(/\/+$/, "").toLowerCase() === DOCS_DIR.toLowerCase();
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
  for (const bundle of bundles) {
    const report = checkBundle(bundle.files);
    fileCount += report.fileCount;
    for (const finding of [...report.findings, ...bundle.filenameFindings]) {
      findings.push(prefixFinding(finding, bundle.label, multi));
    }
  }
  const { errorCount, warningCount } = tallySeverity(findings);
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
  return links.map((link) => prefixFinding(link, label, multi));
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
