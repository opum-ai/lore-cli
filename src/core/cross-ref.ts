/**
 * core/cross-ref.ts — the read-only view across refs behind `lore query --across-refs`
 * (LCLI-652, implementing DEC-40 / opum-doc's "keep lore and quest records on the branch, with a
 * read-only view across open PRs").
 *
 * The bundle a checkout can see is the bundle that checkout has: a document added on an open pull
 * request is invisible to `lore query` until it merges. This module answers for the repository
 * instead — `origin/dev` plus every open pull request into `dev` — without writing anything to any
 * branch, because the ADR's decision 6 is that records stay atomic with their change's branch and
 * the view never writes cross-ref state back.
 *
 * **The shape is fixed by an agreement with quest-cli (QCLI-417), not by taste.** Both CLIs emit
 * per-record `{ref, pullRequest, sha}` — in this repository under the key `refProvenance`, because
 * `provenance` is already a shipped workspace-identity field on `query.results` — and a top-level
 * `coverage` `{complete, population, discoveredAt, refsRead[], refsUnreadable[]}` placed after
 * `data` and before `principal`. Not one of those spellings, orders, or null-vs-omitted choices is
 * incidental: a row that omits `pullRequest` instead of nulling it, or an envelope that puts
 * `coverage` before `data`, is a divergence a consumer of both tools would have to special-case.
 *
 * **Conflicts are shown, never merged.** An id present on `origin/dev` always emits dev's row;
 * another ref's copy of that id emits a row only when its bytes differ from dev's; an id absent
 * from dev emits one row per ref carrying it. A document edited on two branches therefore appears
 * as several rows with the same id, each with its own provenance, and nothing picks a winner. The
 * equality test is the concept FILE's bytes at that ref (a sha256 over the archived blob), not a
 * parsed comparison, so two files that differ in a way the parser normalizes away still count as
 * different authors' states.
 *
 * **Reading another ref never touches the working tree, the index, or any branch ref.** Objects
 * are fetched with a destination-less refspec (FETCH_HEAD only), the tree is taken with
 * `git archive --format=zip -0 <sha> docs` — parsed in-process by {@link parseStoreZip}, so no
 * `tar` dependency on any platform — written to a per-ref temporary directory, and loaded through
 * the SAME filesystem loader every other read-only command uses. The temporary directory is
 * removed in a `finally`.
 *
 * Coverage is the ADR's decision 7 made checkable: every answer states how many refs it read and
 * names any it could not, so an empty listing claiming "nothing documented" is distinguishable
 * from one that read nothing. `complete` is always relative to the population named beside it.
 */

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ForgeAdapter, realForgeAdapter } from "../adapters/forge";
import { LoreError, singleLine, stripAnsiAndControls, type WarningCollector } from "../errors";
import { parseStoreZip } from "../zip-store";
import { type BundleGraph, loadBundle } from "./bundle";
import { loadProfile, type Profile } from "./profile";
import { DEFAULT_QUERY_LIMIT, type QueryHit, type QueryOptions, type QueryResult, query } from "./query";
import { DOCS_DIR } from "./scaffold";

/**
 * One record's provenance in the cross-ref view — the agreed inner object, key order fixed and
 * `pullRequest` never omitted (null when the ref has no pull request).
 */
export interface RefProvenance {
  /** The ref the record was read from: `origin/dev`, `refs/pull/<N>/head`, or an explicit ref name. */
  readonly ref: string;
  /** The pull request as `owner/repo#N`, or `null` for a ref that is not a pull request head. */
  readonly pullRequest: string | null;
  /** The full 40-hex commit actually read — never abbreviated, and never a remembered head. */
  readonly sha: string;
}

/** One ref the view could not read, with the classified reason. */
export interface UnreadableRef {
  /** The ref that could not be read, or `null` for a discovery failure that named no single ref. */
  readonly ref: string | null;
  /** The pull request the ref belongs to, `owner/repo#N`, or `null`. */
  readonly pullRequest: string | null;
  /** Free text, single line, no absolute paths (the guarantee shared with quest-cli). */
  readonly reason: string;
}

/** The population a coverage object is relative to. */
export type CrossRefPopulation = "open-prs" | "explicit" | "dev-only";

/** The top-level `coverage` object every `--across-refs` answer carries, in the agreed key order. */
export interface CrossRefCoverage {
  /** Whether every ref in {@link population} was read; false whenever one could not be. */
  readonly complete: boolean;
  readonly population: CrossRefPopulation;
  /** The instant discovery was attempted (ISO-8601 UTC). */
  readonly discoveredAt: string;
  /** The refs actually read, with the commits read from them. */
  readonly refsRead: readonly RefProvenance[];
  /** Every ref that could not be read, with its reason. */
  readonly refsUnreadable: readonly UnreadableRef[];
}

/** The caller's selection: the open-PR population, or an explicit set of refs. */
export interface CrossRefSelection {
  readonly mode: "open-prs" | "explicit";
  /** The named refs for `explicit`; empty for `open-prs`. */
  readonly refs: readonly string[];
}

/** One step of local git plumbing, classified rather than thrown (the view's failures are coverage, not crashes). */
export type GitStep<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** The injectable git seam the view reads refs through; the real one shells `git`, never throws. */
export interface CrossRefGit {
  /** Whether a remote of this name is configured. */
  hasRemote(cwd: string, name: string): boolean;
  /** Resolve a local ref to its full commit SHA. */
  resolve(cwd: string, ref: string): GitStep<string>;
  /** Whether a commit object is already present locally. */
  hasObject(cwd: string, sha: string): boolean;
  /** Fetch one refspec into the object store, returning the SHA fetched (FETCH_HEAD). */
  fetch(cwd: string, refspec: string): GitStep<string>;
  /** Read `<sha>:<path>` as a parsed stored zip; a path absent at that ref is `ok` with an empty map. */
  archive(cwd: string, sha: string, path: string): GitStep<ReadonlyMap<string, Uint8Array>>;
}

/** What the view answers, ready to be shaped by `commands/query.ts`. */
export interface CrossRefResult {
  /** The engine's normalized text query, taken from a ref that was actually queried; omitted when none was. */
  readonly query?: string;
  /** The merged hits, capped to the caller's limit, each stamped with `refProvenance`. */
  readonly hits: readonly QueryHit[];
  /** Rows the view would list before the cap (the collapse in this module's header is not truncation). */
  readonly total: number;
  readonly shown: number;
  readonly truncated: boolean;
  readonly coverage: CrossRefCoverage;
}

export interface LoadCrossRefOptions {
  /** The repository root the git plumbing runs in. */
  readonly root: string;
  readonly selection: CrossRefSelection;
  /** The query to run per ref — filters and text exactly as the caller passed them. */
  /**
   * The query every ref is read with. `limit` and `profile` are deliberately NOT part of it: the
   * cap belongs to the merged listing (see the return below) and the profile is each ref's own.
   */
  readonly query: Omit<QueryOptions, "limit" | "profile">;
  /** The merged listing cap (the CLI's `--limit`, or the query default). */
  readonly limit?: number;
  /** True for `--allow-partial`: an incomplete read is answered, not refused. */
  readonly allowPartial?: boolean;
  readonly warnings?: WarningCollector;
  /** Injectable seams; production uses the real `gh` adapter and real git. */
  readonly forge?: ForgeAdapter;
  readonly git?: CrossRefGit;
  /** Injectable clock, for deterministic `discoveredAt` in tests. */
  readonly now?: () => Date;
}

/**
 * One ref the view plans to read, in precedence order (dev first, then pull requests ascending).
 *
 * `anchor` marks the ref whose rows are the existence proof of ADR decision 4 — `origin/dev` in
 * the open-PR population, and the same ref when a caller names it explicitly. It is separate from
 * `kind` because an explicit population has no special dev MEMBER: without it, the identical
 * question asked two ways (`--across-refs` versus `--across-refs=origin/dev
 * --across-refs=refs/pull/N/head`, which is how a git-only environment asks it) would answer with
 * different rows.
 */
type PlannedRef =
  | { readonly kind: "dev"; readonly ref: string; readonly pullRequest: null; readonly anchor: true }
  | {
      readonly kind: "pull-request";
      readonly ref: string;
      readonly pullRequest: string;
      readonly headRefOid: string;
      readonly anchor: false;
    }
  | { readonly kind: "explicit"; readonly ref: string; readonly pullRequest: null; readonly anchor: boolean };

/** The spellings of the dev ref the view will anchor an explicit population on. */
const DEV_REF_NAMES: ReadonlySet<string> = Object.freeze(new Set(["origin/dev", "dev"]));

/** A ref that was read: its provenance, its hits, and a content digest per hit id. */
interface RefRead {
  readonly provenance: RefProvenance;
  readonly result: QueryResult;
  readonly digests: ReadonlyMap<string, string>;
}

/**
 * Load the cross-ref view: discover, read every planned ref, merge the rows, and report coverage.
 *
 * @throws LoreError `not_found` (exit 3) when the `open-prs` population has no `origin` remote or
 *   no resolvable `origin/dev` — the view has no anchor without them, and the agreed exit for that
 *   is 3 rather than an incomplete-coverage 6.
 * @throws LoreError `drift` (exit 6) when coverage is incomplete and `allowPartial` is not set. The
 *   error carries the coverage object as its `input` and names the unreadable refs in its message,
 *   which is the error half of the shape agreed with quest-cli on 2026-09-29.
 */
export async function loadCrossRef(options: LoadCrossRefOptions): Promise<CrossRefResult> {
  const git = options.git ?? realCrossRefGit();
  const warnings = options.warnings;
  const discoveredAt = (options.now?.() ?? new Date()).toISOString();
  const refsUnreadable: UnreadableRef[] = [];
  let population: CrossRefPopulation = options.selection.mode === "open-prs" ? "open-prs" : "explicit";
  let plan: PlannedRef[];

  if (options.selection.mode === "open-prs") {
    // The anchor checks are unconditional, --allow-partial included: without origin/dev there is no
    // ref whose EXISTENCE the view can be relative to, which is the agreed exit 3.
    if (!git.hasRemote(options.root, "origin")) {
      throw new LoreError(
        "not_found",
        "no `origin` remote is configured, so the cross-ref view has no repository to read",
        "add an origin remote, or name refs explicitly with `--across-refs <ref>`",
      );
    }
    if (!git.resolve(options.root, "origin/dev").ok) {
      throw new LoreError(
        "not_found",
        "`origin/dev` does not resolve in this checkout, so the cross-ref view has no anchor",
        "run `git fetch origin` and retry, or name refs explicitly with `--across-refs <ref>`",
      );
    }

    const discovery = await (options.forge ?? realForgeAdapter()).listOpenPullRequests({
      cwd: options.root,
      base: "dev",
    });
    if (!discovery.ok) {
      // The operator's condition, made concrete: no gh, an unauthenticated gh, or a non-GitHub
      // origin is INCOMPLETE COVERAGE, never an uncaught failure. Population degrades to dev-only
      // in the reported coverage either way — nothing else was readable — and only --allow-partial
      // turns that into an answer rather than a refusal.
      population = "dev-only";
      refsUnreadable.push({ ref: null, pullRequest: null, reason: discovery.reason });
      plan = [{ kind: "dev", ref: "origin/dev", pullRequest: null, anchor: true }];
    } else {
      const pullRequests = [...discovery.pullRequests].sort((left, right) => left.number - right.number);
      plan = [
        { kind: "dev", ref: "origin/dev", pullRequest: null, anchor: true },
        ...pullRequests.map(
          (pullRequest): PlannedRef => ({
            kind: "pull-request",
            ref: `refs/pull/${pullRequest.number}/head`,
            pullRequest: `${discovery.repository}#${pullRequest.number}`,
            headRefOid: pullRequest.headRefOid,
            anchor: false,
          }),
        ),
      ];
    }
  } else {
    const named = options.selection.refs.map(
      (ref): PlannedRef => ({ kind: "explicit", ref, pullRequest: null, anchor: DEV_REF_NAMES.has(ref) }),
    );
    // The anchor is read FIRST even when the caller named it last: the collapse cannot run for a
    // ref that was already listed, and "dev first" is the ruled ordering anyway.
    plan = [...named.filter((entry) => entry.anchor), ...named.filter((entry) => !entry.anchor)];
  }

  const refsRead: RefProvenance[] = [];
  const rows: QueryHit[] = [];
  let normalizedQuery: string | undefined;
  let devIds: ReadonlySet<string> | undefined;
  let devDigests: ReadonlyMap<string, string> | undefined;

  for (const planned of plan) {
    const read = readOneRef(planned, options, git, warnings);
    if (!read.ok) {
      refsUnreadable.push(read.unreadable);
      warnings?.add(
        `cross-ref: could not read ${read.unreadable.ref ?? "the open-pull-request list"}: ${read.unreadable.reason}`,
      );
      continue;
    }
    refsRead.push(read.value.provenance);
    normalizedQuery ??= read.value.result.query;
    const isAnchor = planned.anchor;
    for (const hit of read.value.result.hits) {
      const stamped: QueryHit = { ...hit, refProvenance: read.value.provenance };
      if (isAnchor) {
        rows.push(stamped);
        continue;
      }
      // ADR decisions 4 and 5: existence comes from dev, in-flight state from the branch, and a
      // record that is byte-identical on dev and a branch is dev's row — not a winner picked
      // between equals, and not a duplicate. Only a DIFFERING copy earns its own row.
      if (devIds?.has(hit.id) && read.value.digests.get(hit.id) === devDigests?.get(hit.id)) {
        continue;
      }
      rows.push(stamped);
    }
    if (isAnchor) {
      devIds = new Set(read.value.result.hits.map((hit) => hit.id));
      devDigests = read.value.digests;
    }
  }

  const coverage: CrossRefCoverage = {
    complete: population !== "dev-only" && refsUnreadable.length === 0,
    population,
    discoveredAt,
    refsRead,
    refsUnreadable,
  };

  if (!coverage.complete && options.allowPartial !== true) {
    const named = refsUnreadable.map((entry) => entry.ref ?? `the open-pull-request list (${entry.reason})`).join(", ");
    throw new LoreError(
      "drift",
      `cross-ref coverage is incomplete: ${named}`,
      "re-run with --allow-partial to report what could be read, or fix the refs named above",
      // NESTED under `coverage`, not spread: quest-cli emits `input: { coverage: … }` and pins that
      // spelling in its own tests, so `input.refsUnreadable` on one side and `input.coverage.
      // refsUnreadable` on the other would leave a shared reader counting zero unreadable refs —
      // the silent false-green this whole coverage object exists to prevent.
      { coverage },
    );
  }

  // The caller's cap applies to the MERGED listing, and each ref is read UNCAPPED for exactly that
  // reason: a per-ref default cap (20) would silently drop a ref's matches before the merge, so
  // `--limit 100` could not reach them and `total` would under-report what matched — a silent
  // truncation, which cli-contract §3 forbids and this command's own coverage rule exists to
  // prevent. The cost is bounded by the refs in the population, measured at qualification.
  const limit = options.limit ?? DEFAULT_QUERY_LIMIT;
  const shown = Math.min(rows.length, limit);
  return {
    ...(normalizedQuery !== undefined ? { query: normalizedQuery } : {}),
    hits: rows.slice(0, shown),
    total: rows.length,
    shown,
    truncated: shown < rows.length,
    coverage,
  };
}

/** Read one planned ref, classifying every failure into an {@link UnreadableRef} rather than throwing. */
function readOneRef(
  planned: PlannedRef,
  options: LoadCrossRefOptions,
  git: CrossRefGit,
  warnings: WarningCollector | undefined,
): { readonly ok: true; readonly value: RefRead } | { readonly ok: false; readonly unreadable: UnreadableRef } {
  const unreadable = (reason: string): { readonly ok: false; readonly unreadable: UnreadableRef } => ({
    ok: false,
    unreadable: {
      ref: planned.kind === "dev" ? "origin/dev" : planned.ref,
      pullRequest: planned.pullRequest,
      reason: cleanReason(reason),
    },
  });

  const sha = resolveRefSha(planned, options.root, git);
  if (!sha.ok) return unreadable(sha.reason);

  const archive = git.archive(options.root, sha.value, DOCS_DIR);
  if (!archive.ok) return unreadable(archive.reason);
  // A ref with no bundle at all was still READ — it documents nothing, which is an answer, not a
  // failure. Treating it as unreadable would make one branch that predates `docs/` fail the whole
  // view with exit 6, which is the opposite of what a view for "what is documented across refs"
  // is for. A ref that HAS a bundle and does not load is a different thing, and stays unreadable.
  if (![...archive.value.keys()].some((name) => name.startsWith(`${DOCS_DIR}/`))) {
    return {
      ok: true,
      value: {
        provenance: {
          ref: planned.kind === "dev" ? "origin/dev" : planned.ref,
          pullRequest: planned.pullRequest,
          sha: sha.value,
        },
        result: { hits: [], total: 0, shown: 0, truncated: false },
        digests: new Map(),
      },
    };
  }

  // The ref's OWN profile is used, not the working tree's: a branch can add a type, and reading it
  // through a stale vocabulary would misreport exactly the documents this view exists to show.
  // BOTH profile forms are archived — `profile.json` is the lower-precedence sibling
  // (`loadProfile`'s PROFILE_REL_PATH pair), and a repository that only ships the JSON form would
  // otherwise be read with the built-in default profile on every ref, dev included.
  const profileArchives = [".lore/profile.toml", ".lore/profile.json"].map((path) =>
    git.archive(options.root, sha.value, path),
  );

  let tempRoot: string;
  try {
    tempRoot = mkdtempSync(join(tmpdir(), "lore-cross-ref-"));
  } catch (cause) {
    return unreadable(cause instanceof Error ? cause.message : String(cause));
  }
  try {
    // Both archives are written at the temporary ROOT, not into a `docs/` subdirectory: the
    // entries already carry their repository-relative paths (`docs/stories/x.md`,
    // `.lore/profile.toml`), and re-nesting them would make `loadBundle` see ids prefixed with the
    // bundle directory and never match a digest.
    const bundleSafe = materialize(archive.value, tempRoot);
    if (!bundleSafe.ok) return unreadable(bundleSafe.reason);
    for (const profileArchive of profileArchives) {
      if (!profileArchive.ok || profileArchive.value.size === 0) continue;
      const written = materialize(profileArchive.value, tempRoot);
      if (!written.ok) return unreadable(written.reason);
    }

    let graph: BundleGraph;
    let profile: Profile;
    try {
      profile = loadProfile({ root: tempRoot });
      graph = loadBundle(join(tempRoot, DOCS_DIR), { warnings, profile });
    } catch (cause) {
      return unreadable(cause instanceof Error ? cause.message : String(cause));
    }

    // The profile reaches the QUERY too, not only the loader: `--type` is resolved through the
    // profile's deprecated aliases (`canonicalType`), so a ref that declares `Decision` with alias
    // `ADR` would otherwise be selected by `--type Decision` locally and dropped here.
    const result = query(graph, { ...options.query, profile, limit: Number.MAX_SAFE_INTEGER });
    const digests = new Map<string, string>();
    for (const hit of result.hits) {
      const concept = graph.concepts.get(hit.id);
      if (concept === undefined) continue;
      const bytes = archive.value.get(`${DOCS_DIR}/${concept.path}`);
      if (bytes === undefined) continue;
      digests.set(hit.id, createHash("sha256").update(bytes).digest("hex"));
    }

    return {
      ok: true,
      value: {
        provenance: {
          ref: planned.kind === "dev" ? "origin/dev" : planned.ref,
          pullRequest: planned.pullRequest,
          sha: sha.value,
        },
        result,
        digests,
      },
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

/** Resolve the commit a planned ref should be read at, fetching only when the object is not local. */
function resolveRefSha(planned: PlannedRef, cwd: string, git: CrossRefGit): GitStep<string> {
  if (planned.kind === "explicit") {
    // Explicit refs are the git-only path: resolved locally, never fetched, no forge involved.
    return git.resolve(cwd, planned.ref);
  }
  if (planned.kind === "pull-request") {
    // Discovered heads are usually remote-only objects; when the commit is already local there is
    // nothing to fetch and the discovered SHA IS what gets read.
    if (git.hasObject(cwd, planned.headRefOid)) return { ok: true, value: planned.headRefOid };
    return git.fetch(cwd, planned.ref);
  }
  // dev is always re-read from the remote: a stale remote-tracking ref would answer for a
  // superseded commit, which is the staleness the ADR's own context names.
  return git.fetch(cwd, "dev");
}

/** Write one archive's entries under `targetDir`, refusing any path that would escape it. */
function materialize(
  entries: ReadonlyMap<string, Uint8Array>,
  targetDir: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  for (const [name, bytes] of entries) {
    if (name.endsWith("/")) continue;
    const segments = name.split("/");
    // Git cannot produce these, but an archive is input like any other: a ".." segment or a
    // backslash (a separator on win32) would write outside the temporary directory.
    if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("\\"))) {
      return { ok: false, reason: "the archive at this ref contains an unsafe path" };
    }
    const absolute = join(targetDir, ...segments);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
  }
  return { ok: true };
}

/**
 * Collapse a reason to the shared guarantee settled with quest-cli: one line, no ANSI or control
 * bytes, and **no absolute paths**. The path scrub is not cosmetic — git's own stderr names the
 * remote path or the temporary directory it failed on, and these reasons are emitted in the drift
 * error's `input` and in `--allow-partial` warnings, both of which land in CI logs.
 */
function cleanReason(reason: string): string {
  return scrubPaths(stripAnsiAndControls(singleLine(reason))).slice(0, 512);
}

/** Decode a spawned stream. `Uint8Array.toString` takes no encoding, unlike Buffer's. */
function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Replace an absolute POSIX or Windows path — and everything up to whitespace after it — with `<path>`. */
function scrubPaths(text: string): string {
  return text.replace(/(?:[A-Za-z]:\\|\/)[^\s'"`,;)\]]*/gu, "<path>");
}

/** Build the real {@link CrossRefGit}, shelling `git` in `cwd`. Never throws. */
export function realCrossRefGit(): CrossRefGit {
  return {
    hasRemote(cwd, name) {
      return run(cwd, ["remote", "get-url", name]).ok;
    },
    resolve(cwd, ref) {
      const proc = run(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      if (!proc.ok) return { ok: false, reason: `\`${ref}\` does not resolve to a commit in this checkout` };
      return { ok: true, value: proc.value };
    },
    hasObject(cwd, sha) {
      return run(cwd, ["cat-file", "-e", `${sha}^{commit}`]).ok;
    },
    fetch(cwd, refspec) {
      // `--refmap=` (an EMPTY refmap) is what makes this read-only, and it is not decoration: with
      // a destination-less refspec and no override, git applies the remote's CONFIGURED fetch
      // spec to decide which remote-tracking branch to update, so `git fetch origin dev` moves
      // `refs/remotes/origin/dev` while `refs/pull/<N>/head` (matching no configured spec) writes
      // FETCH_HEAD only. Measured both ways on git 2.55.0, 2026-09-29: plain `fetch origin dev`
      // moved origin/dev from ff1d4fae to fe3f584e; with `--refmap=` it did not move and
      // FETCH_HEAD still held the remote tip. Without this flag the view would silently fetch on a
      // user's behalf — the ADR's "the view never writes" would be false in the one place a
      // reviewer would not look.
      const fetched = run(cwd, ["fetch", "--no-tags", "--quiet", "--refmap=", "origin", refspec], {
        keepStderr: true,
      });
      if (!fetched.ok) return { ok: false, reason: fetched.reason };
      const head = run(cwd, ["rev-parse", "FETCH_HEAD"]);
      if (!head.ok) return { ok: false, reason: "`git fetch` did not leave a readable FETCH_HEAD" };
      return head;
    },
    archive(cwd, sha, path) {
      let proc: { exitCode: number; stdout: Uint8Array; stderr: Uint8Array };
      try {
        proc = Bun.spawnSync(["git", "archive", "--format=zip", "-0", sha, path], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
        });
      } catch {
        return { ok: false, reason: "the `git` CLI is not installed or not on PATH" };
      }
      if (proc.exitCode !== 0) {
        const stderr = decode(proc.stderr);
        // A path that simply does not exist at that ref is not a failure of the read: callers
        // treat an empty map as "absent at this ref" (`docs/` is checked, `.lore/profile.toml` is
        // optional).
        if (/did not match any files|pathspec/i.test(stderr)) return { ok: true, value: new Map() };
        return { ok: false, reason: `\`git archive\` exited ${proc.exitCode}` };
      }
      try {
        return { ok: true, value: parseStoreZip(new Uint8Array(proc.stdout)) };
      } catch (cause) {
        return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  };
}

/** Run one git command, returning stdout trimmed on success and a classified reason on failure. */
function run(
  cwd: string,
  args: readonly string[],
  options: { readonly keepStderr?: boolean } = {},
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string } {
  let proc: { exitCode: number; stdout: Uint8Array; stderr: Uint8Array };
  try {
    proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  } catch {
    // Bun THROWS when the executable cannot be started at all — measured on 1.3.14 for a missing
    // binary. Unguarded, a PATH without git would escape this module's classified-failure contract
    // as an uncaught exit 1, which is exactly what the operator's condition forbids.
    return { ok: false, reason: "the `git` CLI is not installed or not on PATH" };
  }
  if (proc.exitCode !== 0) {
    const detail = options.keepStderr === true ? singleLine(decode(proc.stderr)).trim() : "";
    return {
      ok: false,
      reason: `\`git ${args[0] ?? ""}\` exited ${proc.exitCode}${detail === "" ? "" : ` (${detail.slice(0, 160)})`}`,
    };
  }
  return { ok: true, value: decode(proc.stdout).trim() };
}
