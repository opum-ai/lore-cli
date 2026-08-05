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
 * link or rotted anchor exists (or any warning under `--strict`). Unknown-type and portability
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

import { lookup as dnsLookup } from "node:dns/promises";
import { statSync } from "node:fs";
import { join, posix } from "node:path";
import type { BacklogAdapter } from "../adapters/backlog";
import { loadAgentProfiles, validateAgentProfileReferences } from "../core/agent-profile";
import { effectiveProfileFor, loadBundle, walkFiles } from "../core/bundle";
import {
  type CheckFinding,
  type CheckInputFile,
  type CheckReport,
  checkBundle,
  classifyAddress,
  collectExternalLinks,
  type ExternalLink,
  isAddressLiteral,
  reconcileDriftFindings,
  tallySeverity,
} from "../core/check";
import { type Concept, parseConcept, tryReadFrontmatter } from "../core/concept";
import { type BundleState, type BundleVersionIssue, resolveBundleState } from "../core/okf-version";
import { loadProfile, type Profile, profileForBundle, profileTypeDeclaresField } from "../core/profile";
import { DOCS_DIR, RESERVED_STEMS } from "../core/scaffold";
import { canonicalType } from "../core/schema";
import {
  ANSI,
  EXIT_CODES,
  EXIT_OK,
  ioError,
  LoreError,
  paint,
  stripAnsiAndControls,
  WarningCollector,
  type Writer,
} from "../errors";
import { emit, type OutputContext, type Renderable } from "../output";
import { parseCommandArgs } from "./args";
import { canonicalIdentity, readSource } from "./discover";
import { dedupeTaskIds, defaultAdapter } from "./link";
import {
  gatherReconciliation,
  linkedConcepts,
  mapWithConcurrency,
  type ReconcileConfig,
  resolveReconcileConfig,
  resolveTaskDetails,
  type TaskResolution,
  taskBlockConcepts,
} from "./reconcile-shared";

/**
 * A minimal fetch — the global `fetch` satisfies it, and tests inject a deterministic fake.
 * `redirect` (when passed `"manual"`) asks the implementation NOT to auto-follow a 3xx; the
 * response then carries `location` (the raw `Location` header, if any) so the caller — LORE-71's
 * SSRF guard — can re-validate the redirect's destination before deciding whether to follow it
 * itself. Both are optional so every pre-existing fake (which only ever returns `{ ok, status }`
 * and never redirects) still satisfies the type unchanged.
 */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; redirect?: "manual" },
) => Promise<{ ok: boolean; status: number; location?: string | null }>;

/**
 * Resolves a hostname to its IP address(es) — the injectable DNS seam LORE-71's SSRF guard uses
 * to classify a URL's REAL destination before fetching it (a hostname alone reveals nothing; an
 * attacker-controlled DNS record is exactly what needs checking). Defaults to real `node:dns`;
 * tests inject a fake so a "this hostname resolves to a blocked address" case needs no live DNS.
 */
export type ResolveHost = (hostname: string) => Promise<readonly string[]>;

/** Options for {@link runCheck}; `root`, the streams, and `fetch` are injectable for tests. */
export interface CheckOptions {
  /** The repo root the bundle (and any relative target paths) resolve against. */
  root: string;
  /** The resolved output mode/color (from `output.ts`). */
  output: OutputContext;
  /** The command's normalized positional + flag tokens from Commander. */
  args: readonly string[];
  /** stdout sink; defaults to `process.stdout`. */
  stdout?: Writer;
  /** stderr sink for discovery advisories (a skipped symlink, an unreadable sub-directory); defaults to `process.stderr`. */
  stderr?: Writer;
  /** The fetch used by `--external` liveness; defaults to the global `fetch`. Injected in tests so they touch no network. */
  fetch?: FetchLike;
  /** DNS resolution for `--external` liveness's SSRF guard (LORE-71); defaults to real `node:dns`. Injected in tests so a blocked-hostname case needs no live DNS. */
  resolveHost?: ResolveHost;
  /** The Backlog adapter for status/managed-block reconciliation; defaults to the real `backlog` binary on PATH. Only constructed when at least one discovered concept links a task. */
  adapter?: BacklogAdapter;
}

/** The parsed form of `lore check`'s arguments. */
interface CheckArgs {
  /** Explicit bundle roots to check; empty means the default `docs/` bundle. */
  paths: string[];
  /** `--strict`: treat any deterministic warning as a failure for the exit code. */
  strict: boolean;
  /** `--external`: opt into non-deterministic external-URL liveness (advisory only; never gates). */
  external: boolean;
}

/**
 * Run `lore check`: parse the arguments, discover and read the bundle's markdown, check it,
 * emit the `check.report`, and return the exit code — `0` when coherent (warnings alone are
 * advisory), `6` when any broken internal link/anchor exists (or any warning under `--strict`).
 * A bad flag throws a `usage` {@link LoreError} (exit `2`); an unreadable bundle
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
 * to stderr immediately after discovery — before the scan phase even runs — so they survive even
 * when `checkBundles` throws in the scan phase or reconciliation later rejects (LORE-191); never
 * silently swallowed, but, like every advisory, do not change the exit code. The flush itself runs
 * in a `finally` around `collectBundles` (LORE-197): `collectBundles` walks its bundle roots
 * SEQUENTIALLY, feeding `advisories` as it goes, and a LATER root's `not_found`/`denied`/`usage`
 * throw (or a late `readSource` throw) must not discard an EARLIER root's already-collected
 * advisories — the `finally` guarantees the one flush still runs before that throw propagates.
 */
export function runCheck(options: CheckOptions): number | Promise<number> {
  const parsed = parseCheckArgs(options.args);
  // Loaded once, up front — mirrors `context.ts`/`graph.ts`'s own LORE-84 precedent of failing
  // loud on a malformed profile before any other work runs. `collectBundles`'s file discovery
  // below is a single repo (`options.root`) with possibly several bundle DIRECTORIES within it
  // (`--external`/multi-path), never several separate repos with their own profiles, so one load
  // covers every root this command can ever scan (LORE-89).
  const profile = loadProfile({ root: options.root });
  const agentProfiles = loadAgentProfiles(options.root);
  if (agentProfiles.profiles.size > 0) {
    validateAgentProfileReferences(agentProfiles, loadBundle(join(options.root, DOCS_DIR), { profile }));
  }
  const advisories = new WarningCollector();
  let bundles: Bundle[];
  try {
    bundles = collectBundles(options.root, parsed.paths, advisories);
  } finally {
    // Every discovery-time advisory that COULD be collected by now already is — `collectBundles`'s
    // own walk is the only source that ever feeds `advisories` (nothing past this point adds to
    // it) — so flush once, right here, in a `finally` so it runs on BOTH the return path (before
    // the scan phase below even starts: `checkBundles` is NOT guaranteed non-throwing — post-
    // LORE-138 a real input, e.g. a `---toml` frontmatter fence, makes `bodyText` re-throw a plain
    // `Error` out of the scan — and reconciliation further below can reject too) AND the throw path
    // (a LATER bundle root's `not_found`/`denied`/`usage` failure inside `collectBundles` itself
    // must not silently discard an EARLIER root's already-collected advisories — LORE-197, the one
    // gap LORE-191 left open one grain earlier than the scan phase). `advisories.flush` is
    // non-draining, so this must be the ONLY flush site for `advisories` — flushing it again later
    // would re-emit every already-flushed line. This means stderr (advisories) is written BEFORE
    // stdout (the report) — the opposite of this command's pre-LORE-27 order — deliberately: mirrors
    // `sync.ts`'s own precedent (it flushes right after `loadBundle`, well before its own final
    // `emit`), and "advisories survive a later throw" is a stronger guarantee to keep than "stdout
    // precedes stderr" (already an unreliable assumption for any CLI merging two independently-
    // buffered streams).
    advisories.flush({ color: options.output.color, stderr: options.stderr });
  }

  const linkReport = checkBundles(bundles);

  // Reuse the SAME already-read files (no second directory walk, no second read) to classify unknown
  // active-profile types and find `tasks:`-linked concepts per bundle root, so strict validation
  // parity and status/managed-block reconciliation share one scan. `tryConceptsForBundle` NEVER
  // throws — a bundle root's own
  // scan failure (a malformed-AND-`tasks:`-linked concept) is carried as `error` on its own result,
  // isolated from every OTHER root's scan, mirroring how the async drift computation below already
  // isolates root failures from each other (an earlier version of this scan used a bare `.map()` that
  // let one root's throw abort every other root's scan too, discarding drift that was never even
  // computed — LORE-27 round 9). This same scan classifies a `tasks:` field whose active-profile
  // type does not declare it as an explicit gate finding before any Backlog IO.
  const conceptBundleResults = bundles.map((bundle) => tryConceptsForBundle(bundle, profile));
  const multi = bundles.length > 1;
  const scanFindings = conceptBundleResults.flatMap((result) =>
    result.findings.map((finding) => prefixFinding(finding, result.bundle.label, multi)),
  );
  const baseReport = mergeFindings(linkReport, scanFindings);
  const needsReconciliation = conceptBundleResults.some(
    (result) => result.error !== null || taskBlockConcepts(result.concepts).length > 0,
  );

  if (!needsReconciliation && !parsed.external) {
    emit(reportRenderable(baseReport), options.output, options.stdout);
    return exitFor(baseReport, parsed.strict);
  }

  const adapter = needsReconciliation ? (options.adapter ?? defaultAdapter(options.root)) : undefined;
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
      // `complete: false` whenever this root's (or another root's) reconciliation errored mid-run
      // (LORE-112) — the ONLY signal in the emitted report that distinguishes a partial-failure run
      // from a genuinely clean one, since a short-circuited failure can still leave `errorCount === 0`
      // (the failure happened before any finding was ever produced for it).
      const report = { ...mergeFindings(baseReport, findings), complete: error === null };
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
  const livenessPromise = probeLiveness(
    worklist,
    options.fetch ?? defaultFetch,
    options.resolveHost ?? defaultResolveHost,
  ).then(
    (findings): LivenessResult => ({ ok: true, findings }),
    (err: unknown): LivenessResult => ({ ok: false, err }),
  );
  return Promise.all([driftPromise, livenessPromise]).then(([{ findings, error }, liveness]) => {
    // Same `complete: false` rule as the non-`--external` path above (LORE-112) — liveness's own
    // best-effort outcome never affects this; only `driftPromise`'s error does.
    const report = { ...mergeFindings(baseReport, findings), complete: error === null };
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

/** One bundle root's concept-scan outcome: reconcilable concepts, validation/capability findings, and any scan failure. */
interface ConceptBundleResult {
  readonly bundle: Bundle;
  readonly concepts: Concept[];
  readonly findings: CheckFinding[];
  readonly error: unknown | null;
}

/**
 * Best-effort, per-bundle-root scan of already-read files for unknown active-profile types and parse
 * of profile-supported, `tasks:`-declaring {@link Concept}s for reconciliation. An unknown type
 * becomes an `unknown-type` warning, matching `lore validate`'s producer-extension diagnostic and
 * therefore gating only under `--strict`. A parsed concept whose type does not declare `tasks`
 * becomes an `unsupported-task-coupling` finding instead, so the gate reports it without attempting
 * Backlog resolution or managed-block regeneration. NEVER throws — a scan failure is carried as
 * `error`
 * instead, isolated from every OTHER bundle root's scan and from the already-computed `baseReport`,
 * which must survive regardless of whether any one root's scan fails ({@link computeDriftFindings}
 * folds this the same way it folds an async per-root failure). Isolated PER FILE too, the same way:
 * each file's own parse is its own try/catch, so a LATER file's failure never discards concepts
 * already collected from EARLIER files in the same root (an earlier version of this function shared
 * one try/catch across the whole loop, so any failure silently dropped every already-collected
 * concept for that root, not just the one that actually failed — LORE-27 round 10).
 *
 * Each file's frontmatter is first PEEKED via the cheap, non-validating {@link tryReadFrontmatter}
 * (no Zod schema check). Its `type` is compared with the effective profile used by validation; the
 * structural root index keeps the built-in profile that wrote it. A file with no `tasks:` link (the
 * vast majority of any bundle: ADRs, specs, index/log) then skips full parse+validation.
 *
 * Only a file that DOES declare `tasks:` (including an empty list) is fully parsed+validated ({@link parseConcept}, which
 * throws loud on a malformed mapping) — `lore sync` would refuse to touch that exact file too, so
 * silently treating it as un-linked would be a real false-negative against `check`'s own drift gate,
 * the one case where `check` really would otherwise disagree with what `sync` does. An
 * unparseable-YAML file (`tryReadFrontmatter` itself throws — there is no mapping to peek a `tasks:`
 * field from, so it cannot be assumed innocent) is treated the same as "declares `tasks:`".
 *
 * `parseConcept` is given the project's own `profile` (LORE-89) so this scan validates against the
 * SAME schema `lore query`/`validate`/`sync` already do (`loadBundle`, LORE-84) — before this fix it
 * always fell back to the built-in default profile, so a project-defined required field could pass
 * `check` silently while `validate`/`query`/`sync` correctly rejected the identical file, the exact
 * three-way disagreement ADR-0007 designed `check` to never have with the rest of the toolchain.
 */
function tryConceptsForBundle(bundle: Bundle, profile: Profile): ConceptBundleResult {
  const bundleProfile = profileForBundle(profile, bundle.state);
  const concepts: Concept[] = [];
  const findings: CheckFinding[] = [];
  let error: unknown | null = null;
  for (const file of bundle.files) {
    try {
      const raw = tryReadFrontmatter(file.path, file.raw);
      if (raw === null) {
        continue;
      }
      const judgingProfile = effectiveProfileFor(file.path, "index.md", bundleProfile);
      const authoredType = typeof raw.type === "string" ? raw.type.trim() : "";
      if (authoredType !== "" && !judgingProfile.types.has(canonicalType(authoredType, judgingProfile))) {
        findings.push({
          severity: "warning",
          rule: "unknown-type",
          file: file.path,
          message: `unknown type ${JSON.stringify(authoredType)} in ${file.path}; validated on \`type\` only`,
        });
      }
      if (!Object.hasOwn(raw, "tasks")) {
        continue;
      }
      const concept = parseConcept(file.path, file.raw, { profile: bundleProfile, bundleState: bundle.state });
      if (RESERVED_STEMS.has(posix.basename(concept.id))) {
        continue;
      }
      if (profileTypeDeclaresField(concept.type, "tasks", bundleProfile)) {
        concepts.push(concept);
      } else {
        findings.push({
          severity: "error",
          rule: "unsupported-task-coupling",
          file: file.path,
          message: `type ${JSON.stringify(concept.type)} does not declare the \`tasks\` field carried by this concept`,
        });
      }
    } catch (err) {
      if (error === null) {
        error = err; // first, in file order; keep scanning so later files' concepts still count too
      }
    }
  }
  return { bundle, concepts, findings, error };
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
 * The status/managed-block drift findings for every `tasks:`-declaring concept across every bundle
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
export async function driftFindingsForBundle(
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
  // Built from the SAME normalized form `isDocsRoot` compared against `DOCS_DIR` (LORE-113) — not
  // the raw `bundle.label` — so a non-canonical-but-equivalent label (a trailing slash, a
  // backslash, or a different case) can never yield a `docPath` at odds with the `fixable` verdict
  // just computed from that identical label, two treatments of one string diverging within this
  // same function.
  const normalizedLabel = normalizeBundleLabel(bundle.label);
  const findings: CheckFinding[] = [];
  let error: unknown | null = null;
  for (const { concept, newStatus, rows } of targets) {
    const docPath = `${normalizedLabel}/${concept.path}`;
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
 * Canonicalize a bundle root label so an equivalent-but-non-canonical spelling (`./docs`, a
 * trailing slash OR backslash, a different case) collapses to the same string as any other
 * spelling of the identical root: backslashes to forward slashes FIRST (`posix.normalize` only
 * recognizes `/` as a separator, so a Windows-idiom trailing `docs\` would otherwise survive
 * untouched), redundant segments collapsed, any trailing slash(es) stripped, then lowercased — on
 * the case-insensitive filesystems most local dev happens on (macOS, Windows), a differently-cased
 * spelling (`Docs`) resolves to the identical directory as `docs`, so treating it as a *different*
 * root would be the misleading answer, not the careful one.
 *
 * Shared by {@link isDocsRoot}'s comparison against `DOCS_DIR` and `driftFindingsForBundle`'s
 * `docPath` construction (LORE-113) — both read `bundle.label`, and must agree on what it
 * canonicalizes to, or `docPath` could embed a spelling `isDocsRoot`/`fixable` disagrees with.
 */
function normalizeBundleLabel(label: string): string {
  return posix.normalize(label.replace(/\\/g, "/")).replace(/\/+$/, "").toLowerCase();
}

/**
 * Whether a bundle root (as the user named it — or the default) IS the `docs/` bundle `lore sync`
 * operates on, canonicalized ({@link normalizeBundleLabel}) so an equivalent-but-non-canonical
 * spelling is still recognized — a literal string-prefix match against a compound `docPath` would
 * miss these and silently omit `reconcileDriftFindings`' "run `lore sync`" hint for a root it
 * actually can fix.
 */
export function isDocsRoot(label: string): boolean {
  return normalizeBundleLabel(label) === DOCS_DIR.toLowerCase();
}

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse `check`'s tokens into target bundle roots and its flags. Commander has already
 * stripped lore's global flags, so anything `--`-prefixed here is a command flag: an
 * unrecognized one is a `usage` error. A `--` ends option parsing so a path may begin with
 * `-`.
 */
function parseCheckArgs(args: readonly string[]): CheckArgs {
  const parsed = parseCommandArgs(args, "check");
  return {
    paths: parsed.positionals,
    strict: parsed.flags.has("strict"),
    external: parsed.flags.has("external"),
  };
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
  /** Typed OKF semantics negotiated from this root's index.md. */
  readonly state: BundleState;
  /** Version diagnostics folded into the deterministic check report. */
  readonly versionIssues: readonly BundleVersionIssue[];
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
 *
 * Roots are de-duplicated by {@link canonicalIdentity} (the same realpath-fold `replace.ts`,
 * `validate.ts`, and `rename.ts` already dedup file paths with) — not by the raw joined string —
 * so a symlink alias or a case-variant spelling on a case-insensitive filesystem (`check docs
 * Docs`) that reaches the same physical directory is walked once, not twice. `canonicalIdentity`
 * swallows its own `realpath` failure and falls back to the path verbatim, so a **nonexistent**
 * root's identity is just its own joined path (never collides with anything else already seen)
 * and dedup never short-circuits {@link expandRoot}'s `not_found`/`denied` classification below.
 */
function collectBundles(root: string, paths: readonly string[], warnings: WarningCollector): Bundle[] {
  const roots = paths.length > 0 ? paths : [DOCS_DIR];
  const bundles: Bundle[] = [];
  const seenRoots = new Set<string>();
  for (const bundleRoot of roots) {
    const absRoot = join(root, bundleRoot);
    const identity = canonicalIdentity(absRoot);
    if (seenRoots.has(identity)) {
      continue; // the same physical root named twice (directly, via symlink, or case) is one bundle
    }
    seenRoots.add(identity);
    const docFiles = expandRoot(absRoot, bundleRoot, warnings);
    const files = docFiles
      .filter(isMarkdownPath)
      .map((rel) => ({ path: rel, raw: readSource(join(absRoot, rel), `${bundleRoot}/${rel}`) }));
    const filenameFindings = docFiles.flatMap(filenameHazards);
    const rootIndex = files.find((file) => file.path === "index.md");
    const version = resolveBundleState(
      rootIndex === undefined ? null : tryReadFrontmatter(rootIndex.path, rootIndex.raw),
    );
    bundles.push({
      label: bundleRoot,
      files,
      filenameFindings,
      state: version.state,
      versionIssues: version.issues,
    });
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
    const versionFindings: CheckFinding[] = bundle.versionIssues.map((issue) => ({
      severity: issue.severity,
      rule: "okf-version",
      file: "index.md",
      message: issue.message,
    }));
    for (const finding of [...versionFindings, ...report.findings, ...bundle.filenameFindings]) {
      findings.push(prefixFinding(finding, bundle.label, multi));
    }
  }
  const { errorCount, warningCount } = tallySeverity(findings);
  // No reconciliation has run yet at this point (this is `baseReport`, the link/anchor + portability
  // pass only) — definitionally complete; `runCheck` is the only place that ever downgrades this to
  // `false`, once `driftPromise` resolves with a non-null error (LORE-112).
  return { findings, errorCount, warningCount, fileCount, complete: true };
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
/** Redirects a single URL may FOLLOW before the probe gives up (so up to `MAX_REDIRECTS + 1` fetches total: the original request plus this many hops) — bounds a malicious/misconfigured redirect chain, mirroring browsers' own conservative caps. */
const MAX_REDIRECTS = 10;
/**
 * The most DISTINCT URLs a single `--external` pass will actually probe. `LIVENESS_CONCURRENCY`
 * and `LIVENESS_TIMEOUT_MS` only bound how FAST the worklist drains, not how BIG it may be — a
 * bundle with tens of thousands of external links would still enqueue and probe every one of
 * them, so the whole pass's wall-clock time (and open-socket count) would scale unboundedly with
 * the bundle's size. URLs beyond this cap are never probed; each is instead reported as its own
 * advisory `external-link` finding ({@link probeLiveness}) so an oversized worklist degrades
 * visibly rather than just running for an unbounded amount of time.
 */
const LIVENESS_MAX_URLS = 500;

/**
 * The real network probe: the global `fetch`, always requesting manual redirect handling (never
 * `"follow"`) so LORE-71's SSRF guard in {@link probeOne} sees — and re-validates — every hop
 * itself, rather than letting `fetch()` silently chase a redirect to a blocked destination.
 */
const defaultFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, { signal: init?.signal, redirect: "manual" });
  const result = { ok: response.ok, status: response.status, location: response.headers.get("location") };
  // Release the underlying socket WITHOUT reading it, once headers/status/location are captured.
  // This function is called once per hop (`probeOne` re-invokes it for a followed 3xx redirect and
  // again for the terminal response), so this single, unconditional cancel covers BOTH paths —
  // there's no separate "redirect" vs. "terminal" branch here to duplicate it into. Left undrained,
  // each of up to `LIVENESS_MAX_URLS` responses per `--external` pass would retain its connection
  // until GC. Cancelling (not reading) preserves LORE-71's SSRF invariant (`probeOne`'s own docs,
  // above): the probe still never reads or reports a byte of body content.
  await response.body?.cancel().catch(() => {});
  return result;
};

/** The real DNS resolver: `node:dns`'s `lookup`, narrowed to the {@link ResolveHost} the SSRF guard needs (every address a hostname resolves to, not just the first). */
const defaultResolveHost: ResolveHost = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((record) => record.address);
};

/** Prefix each external link's `file` with its bundle label in multi-bundle mode, matching the gate findings. */
function prefixLinks(links: ExternalLink[], label: string, multi: boolean): ExternalLink[] {
  return links.map((link) => prefixFinding(link, label, multi));
}

/**
 * Probe every external URL in the worklist for liveness and return one advisory `external-link`
 * warning per dead/unreachable/blocked/skipped occurrence (a live, allowed URL yields none). Each
 * **distinct** URL is probed at most once (deduplicated), under a bounded concurrency and a
 * per-request timeout, then the result is fanned back out to every `(file, url)` that referenced
 * it — so a URL linked from five files is probed once but reported five times. Pure-ish: all
 * network goes through the injected `fetchFn`/`resolveHost`, and a probe rejection becomes a
 * finding, never a throw.
 *
 * The worklist's distinct URLs are capped at {@link LIVENESS_MAX_URLS}: anything beyond the first
 * `LIVENESS_MAX_URLS` (in first-seen order) is never probed at all — it is reported directly as a
 * "was not probed: exceeded the liveness cap" finding, the same way a blocked or dead URL is
 * reported, so an oversized worklist is visible in the report rather than just making the whole
 * pass run for an unbounded amount of time.
 */
async function probeLiveness(
  links: readonly ExternalLink[],
  fetchFn: FetchLike,
  resolveHost: ResolveHost,
): Promise<CheckFinding[]> {
  const uniqueUrls = [...new Set(links.map((link) => link.url))];
  const probedUrls = uniqueUrls.slice(0, LIVENESS_MAX_URLS);
  const skippedUrls = new Set(uniqueUrls.slice(LIVENESS_MAX_URLS));
  const failureByUrl = new Map<string, string | null>(); // null = alive; string = the failure reason
  await mapWithConcurrency(probedUrls, LIVENESS_CONCURRENCY, async (url) => {
    failureByUrl.set(url, await probeOne(url, fetchFn, resolveHost));
  });
  const findings: CheckFinding[] = [];
  for (const link of links) {
    const failure = skippedUrls.has(link.url)
      ? `was not probed: exceeded the liveness cap of ${LIVENESS_MAX_URLS} distinct URLs`
      : failureByUrl.get(link.url);
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

/**
 * Whether `url`'s destination (its hostname, resolved to every IP address it answers to) is
 * loopback/link-local/private/reserved (LORE-71's SSRF guard) — `null` when it's allowed. An
 * unparseable URL or a non-`http(s)` scheme is treated as blocked too (belt-and-braces: the
 * worklist only ever contains `http(s)` links per {@link collectExternalLinks}'s own filter, so
 * this should never actually fire, but the guard must never assume its only caller is honest). A
 * DNS-resolution failure is NOT blocked here — that's an ordinary liveness failure ({@link
 * probeOne}'s own catch already reports "is unreachable"), not a security refusal, so it
 * deliberately propagates rather than being swallowed into a false "blocked" verdict.
 *
 * **Known, accepted limitation** (confirmed by independent adversarial review, not a gap this
 * function can close on its own): this validates the address(es) `resolveHost` returns RIGHT NOW,
 * but the actual `fetch()` a hop later does its OWN independent DNS resolution when it connects —
 * a classic TOCTOU/DNS-rebinding window (a short-TTL record answering safely here and differently
 * at connect time). Accepted because `--external` is advisory-only CI liveness (never gates, and
 * `probeOne` never reads/reports a response body — only `status`/`location`), so the worst a
 * successful rebind achieves is a bare GET landing on an internal host, not data exfiltration
 * through the report. Fully closing this would need pinning the actual socket connection to the
 * validated address (e.g. a custom low-level dispatcher), which is a materially bigger change than
 * this task's own AC calls for.
 */
async function blockedDestination(url: string, resolveHost: ResolveHost): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "has an unparseable URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `uses a disallowed scheme "${parsed.protocol}"`;
  }
  // `URL#hostname` keeps an IPv6 literal's brackets (e.g. "[::1]") — the package-backed literal
  // parser/classifier need the bare address. A literal IP is classified DIRECTLY, never through
  // `resolveHost`: it is not a name to resolve, and deferring to `resolveHost` here would let an
  // injected DNS fake that ignores its `hostname` argument (a reasonable "allow everything" test
  // default) accidentally paper over a literal blocked-IP URL — the guard's correctness must not
  // depend on `resolveHost` actually inspecting its input.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = isAddressLiteral(hostname) ? [hostname] : await resolveHost(hostname);
  // The real `node:dns` resolver throws (never resolves empty) when a hostname has no records, so
  // this shouldn't fire against `defaultResolveHost` — but a custom `ResolveHost` returning `[]`
  // for "nothing found" (a plausible alternative contract) must fail CLOSED, not vacuously pass
  // the `for` loop below and let the fetch through unvalidated.
  if (addresses.length === 0) {
    return "resolved to no addresses";
  }
  for (const address of addresses) {
    const verdict = classifyAddress(address);
    if (verdict.blocked) {
      return `resolves to a blocked address (${address}, ${verdict.reason})`;
    }
  }
  return null;
}

/**
 * Probe one URL: `null` when it (or the live end of a redirect chain starting from it) answers
 * `2xx`, else a short reason (blocked, a non-OK status, a timeout, or an unreachable host).
 *
 * SSRF guard (LORE-71): EVERY hop — the original URL and each redirect target — is destination-
 * checked via {@link blockedDestination} BEFORE `fetchFn` is ever called for it. `fetchFn` is
 * always asked for manual redirect handling ({@link FetchLike}'s `redirect: "manual"`), so a 3xx
 * response's `Location` is inspected and re-validated by THIS function rather than silently
 * auto-followed by the underlying HTTP client (AC2) — a blocked redirect target stops the chain
 * immediately, with no request ever issued for it (AC1/AC3). Bounded to {@link MAX_REDIRECTS}
 * hops so a redirect loop can't hang the probe forever.
 */
async function probeOne(url: string, fetchFn: FetchLike, resolveHost: ResolveHost): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      // The destination check and the fetch share ONE try/catch: a DNS-resolution fault (a
      // genuinely non-existent host, a resolver timeout) is an ordinary liveness failure, not a
      // security refusal — it must land in the same "is unreachable" bucket a fetch fault would,
      // never escape uncaught (which would silently drop this URL's finding — see LORE-71 notes).
      const blocked = await blockedDestination(current, resolveHost);
      if (blocked !== null) {
        return `was not probed: ${blocked}`;
      }
      const response = await fetchFn(current, { signal: AbortSignal.timeout(LIVENESS_TIMEOUT_MS), redirect: "manual" });
      if (response.status >= 300 && response.status < 400 && response.location) {
        // Resolve a relative Location against the CURRENT url (redirects are commonly relative).
        current = new URL(response.location, current).toString();
        continue;
      }
      return response.ok ? null : `is dead (HTTP ${response.status})`;
    } catch (cause) {
      if (cause instanceof Error && cause.name === "TimeoutError") {
        return `did not respond within ${LIVENESS_TIMEOUT_MS}ms`;
      }
      return `is unreachable (${cause instanceof Error ? cause.message : String(cause)})`;
    }
  }
  return `exceeded ${MAX_REDIRECTS} redirects`;
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

/**
 * One finding line: `<severity> <file> [<rule>]: <message>`.
 *
 * `finding.file` and `finding.message` are untrusted: `message` embeds a raw link target or
 * fragment lifted verbatim from authored markdown (`core/check.ts`'s broken-link/broken-anchor
 * findings), so either field can carry an ANSI escape sequence or an embedded newline. Left
 * unstripped, an escape sequence could repaint or move the cursor, and a newline would forge an
 * extra finding row once `renderReport` joins lines with `\n`. Both fields are run through the
 * shared {@link stripAnsiAndControls} (LORE-181's single home for this strip) before
 * interpolation, matching every sibling surface (`output.ts`, `commands/query.ts`,
 * `core/validate.ts`, `core/links.ts`).
 */
function findingLine(finding: CheckFinding, color: boolean): string {
  const tone = finding.severity === "error" ? ANSI.red : ANSI.yellow;
  const file = stripAnsiAndControls(finding.file);
  const message = stripAnsiAndControls(finding.message);
  return `${paint(finding.severity, tone, color)} ${file} [${finding.rule}]: ${message}`;
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
