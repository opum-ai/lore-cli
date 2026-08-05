/**
 * bundle.ts — the whole `docs/` tree as one in-memory **bundle graph**.
 *
 * Where {@link parseConcept} turns a single file into a {@link Concept}, this
 * module turns the *directory* into a graph: it walks the bundle root, parses
 * every concept, and links them into nodes (concepts) and edges (concept→concept
 * references). That graph is the shared substrate every navigation/refactor
 * command reads — `query`, `context`, `graph`, `rename`, `supersede`, and the
 * drift computation behind `sync`/`check` (architecture §4, design §2.1).
 *
 * Two properties are load-bearing and pinned by the test suite:
 *
 * - **Deterministic** (design §8): the directory walk is sorted, symlinks are not
 *   followed, and {@link buildGraph} sorts its input and emits edges in a fixed
 *   order, so the same tree always produces the same `concepts`/`edges` — no
 *   filesystem-order or input-order dependence.
 * - **Cycle-tolerant** (OKF §5: consumers tolerate any link shape): the graph is a
 *   flat edge list built without traversal, so a link cycle (`A→B→A`), a
 *   self-link, or a supersession loop loads fine; a link that resolves to no
 *   concept is a **dangling** edge (`to: null`), never an error — surfacing broken
 *   links is `lore check`'s job, not a parse failure.
 *
 * ### What is (and isn't) an edge
 *
 * Edges are **concept↔concept** only, from three sources:
 *
 * - **Body cross-links** — markdown links to another `.md` file in the bundle
 *   ({@link EdgeKind} `"link"`), resolved **relative to the linking file's
 *   directory** per the canonical lore link form (ADR-0010). Extraction defers to
 *   a real CommonMark parser ({@link extractBodyTargets} via
 *   `mdast-util-from-markdown`), so a link inside a code span or fenced/indented
 *   code block is *not* an edge (it is not a link when rendered either), a
 *   linked-image `[![alt](img)](target.md)` contributes its outer `target.md`, and
 *   reference-style links resolve through their definition. Images, external
 *   schemes (`http:`, `mailto:`…), bare `#anchors`, and non-`.md` targets are not
 *   concept edges.
 * - **Frontmatter refs** — the `specs`, `supersedes`, and `superseded_by` fields,
 *   which point at other concepts (design §2.1, §3.9). Each value yields an edge of
 *   the matching {@link EdgeKind}; a value may be a bundle-relative id
 *   (`adr/0009-x`) or a relative path (`../adr/0009-x.md`).
 * - **OKF 0.2 provenance sources** — a `sources[].resource` that resolves to another
 *   concept produces a `sources` edge. External URLs and scope descriptors are not
 *   concept edges; an internal `.md` path that does not resolve remains dangling.
 *
 * The `tasks` frontmatter field is **deliberately not** an edge: it points at
 * Backlog.md task ids, not concepts (architecture §3, ADR-0009). It stays readable
 * on `concept.frontmatter.tasks`; the doc↔task coupling is reconcile/link's
 * concern, not the concept graph's.
 *
 * Per the core contract (design §2.1) this module is pure-ish library code: it
 * reads the filesystem (its one permitted side effect) and returns a typed
 * {@link BundleGraph} or throws a {@link LoreError}; it never prints, reads flags,
 * or exits. Advisory warnings (an unknown type, a skipped fence-less file, a
 * skipped symlink) flow to an optional {@link WarningCollector}.
 *
 * Scope note: this module builds and reads the graph. Generating the bundle's
 * `index.md`/`log.md` bytes is a separate concern that pairs with `lore
 * init`/`lore sync` and is not part of the graph layer.
 */

import { type Dirent, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { deriveMessage, errnoCode, ioError, LoreError, type WarningCollector } from "../errors";
import { type Concept, idFromPath, serializeConcept, tryParseConcept, tryReadFrontmatter } from "./concept";
import { decodeTarget, isExternalTarget, pathPart } from "./links";
import { type BundleState, type BundleStateResolution, CURRENT_OKF_VERSION, resolveBundleState } from "./okf-version";
import { compareCodeUnits } from "./order";
import { defaultProfile, type Profile, profileForBundle } from "./profile";
import { RESERVED_STEMS } from "./scaffold";

// Bun.gc(true) is synchronous. Large projection loads retain bounded cleanup
// points without pausing once per small group of authored concepts.
const BOUNDED_MEMORY_GC_CONCEPT_INTERVAL = 1024;

/**
 * The kind of a concept→concept reference. `"link"` is a body markdown
 * cross-link; the rest mirror the frontmatter fields that carry concept
 * references (the names match the frontmatter keys for an obvious round-trip).
 */
export type EdgeKind = "link" | "sources" | "specs" | "supersedes" | "superseded_by";

/**
 * One directed reference from one concept to another. `from` is always a concept
 * id in the bundle (it is the source file). `to` is the resolved target concept
 * id, or `null` when the reference **dangles** (points at no concept in the
 * bundle) — a tolerated quality signal, not an error. `target` is the reference as
 * resolution saw it — a body link's parsed destination (angle-bracket wrapper
 * removed, percent-encoding intact) or a frontmatter ref's trimmed value — kept for
 * link diagnostics. It is the resolved form, not necessarily the byte-exact source
 * (a rewrite re-reads the file's bytes rather than trusting this).
 */
export interface Edge {
  /** The source concept id (always a real concept in the bundle). */
  readonly from: string;
  /** The resolved target concept id, or `null` when the reference dangles. */
  readonly to: string | null;
  /** The reference as parsed (link destination / frontmatter value). */
  readonly target: string;
  /** Which kind of reference produced this edge. */
  readonly kind: EdgeKind;
}

/**
 * The whole bundle as a graph: concepts by id, the flat edge list, and a token
 * estimator. `concepts` and `edges` are read-only views — the graph is a snapshot
 * of what was loaded, not a mutable store (refactors recompute a fresh graph).
 */
export interface BundleGraph {
  /** Typed bundle-level OKF semantics resolved from the root index. */
  readonly state: BundleState;
  /**
   * Every loaded concept, keyed by {@link Concept.id}, in ascending id order
   * (deterministic iteration). Excludes fence-less, non-concept markdown.
   */
  readonly concepts: ReadonlyMap<string, Concept>;
  /**
   * All concept→concept references, in deterministic order: by source concept
   * (ascending id), then that concept's frontmatter edges (`specs`, `supersedes`,
   * `superseded_by`) followed by its body links in document order.
   */
  readonly edges: readonly Edge[];
  /**
   * Optional precomputed undirected neighbor lookup. Persistent retrieval backends
   * can provide this while materializing their edge index so bounded graph and
   * context traversals do not rebuild the same O(E) adjacency map per command.
   * The returned order must match first appearance in {@link edges}.
   */
  readonly neighbors?: (id: string) => Iterable<string>;
  /**
   * A token-count **estimate** (chars/4 heuristic, not a real tokenizer) over the
   * canonical serialized bytes of one concept (`id` given) or the whole bundle
   * (`id` omitted). Throws `not_found` if `id` names no loaded concept. Results are
   * memoized, so the estimate is a **snapshot** taken at first request: the graph
   * presumes its concepts are the valid, unmutated ones it was built from (every
   * loaded concept is valid), and mutating a concept's frontmatter/body in place
   * after load is unsupported — a stale count, or (if mutated to an invalid shape)
   * a `validation` error from the underlying serialize, is then on the caller.
   */
  tokenEstimate(id?: string): number;
}

/** Options for {@link loadBundle}. */
export interface LoadBundleOptions {
  /** Sink for advisory warnings (unknown type, extra keys, skipped fence-less/symlink files). */
  warnings?: WarningCollector;
  /**
   * The active profile every parsed concept's frontmatter is validated against; defaults to the
   * built-in {@link defaultProfile} (mirroring {@link ParseConceptOptions.profile}'s own default)
   * when omitted. A project declaring a custom `.lore/profile.toml` must pass its compiled
   * {@link Profile} here — the caller loads it (`loadProfile({ root })`) and forwards it, since this
   * module reads only the filesystem tree under `root`, never `.lore/` itself (LORE-84).
   */
  profile?: Profile;
  /** Internal large-snapshot mode that bounds transient parser allocations. */
  boundedMemory?: boolean;
}

/**
 * Load a `docs/` bundle from disk into a {@link BundleGraph}.
 *
 * Walks `root` for `.md` files ({@link walkMarkdown} — sorted, recursive, and
 * symlink-safe so a symlinked directory can never loop the walk), reads each, and
 * hands it to {@link tryParseConcept}, which draws the load-bearing distinction:
 *
 * - a file that is **not a concept** (no frontmatter, an empty fence, or a fence
 *   holding a bare scalar/list — e.g. a hand-written `index.md`/`log.md`, or a doc
 *   that merely opens with a `---` thematic break) returns `null` and is skipped —
 *   warned about if a collector is provided, **unless** the file's stem is a
 *   {@link RESERVED_STEMS} entry (`index`/`log`): those are lore's own
 *   machine-generated hubs (`indexes.ts`/`log.ts` regenerate them wholesale, always
 *   frontmatter-free below the bundle root), so skipping one is never a surprise
 *   worth an advisory — every `loadBundle`-backed command warning about it trains
 *   users to ignore the warning entirely (LORE-258). A genuinely unexpected
 *   non-concept file (any other stem) still warns; only the two known-reserved
 *   stems are silent, matching `lore check`'s own scan (which never parses through
 *   `loadBundle` and so never raised this noise to begin with);
 * - a **malformed concept** (a frontmatter *mapping* that fails the lore profile,
 *   or unparseable YAML) throws its `validation` {@link LoreError} (path included)
 *   rather than being silently dropped.
 *
 * Drawing that line needs the YAML parsed (a prefix check cannot tell an HR from
 * real frontmatter), so each file is parsed exactly once here. "The lore profile"
 * above is {@link LoadBundleOptions.profile} when given, else the built-in default
 * (LORE-84) — every concept in one `loadBundle` call validates against the same
 * profile, so a project's custom `.lore/profile.toml` types/fields/enums are
 * honored only when the caller loads and forwards it.
 *
 * Concept ids are **bundle-root-relative** (e.g. `docs/adr/0010-x.md` →
 * `adr/0010-x`), which is the id space the relative cross-link form resolves
 * within. The parsed concepts are handed to {@link buildGraph}, so the same tree
 * always yields the same graph.
 *
 * @param root the bundle root directory (typically `docs/`).
 * @throws LoreError `not_found`/`denied` if `root` cannot be read; `validation` if
 *   a fenced concept is malformed.
 */
export function loadBundle(root: string, options: LoadBundleOptions = {}): BundleGraph {
  const state = loadBundleState(root, options.warnings);
  const profile = profileForBundle(options.profile ?? defaultProfile(), state);
  const concepts: Concept[] = [];
  for (const rel of walkMarkdown(root, options.warnings)) {
    // `rel` is bundle-root-relative, so tryParseConcept derives a bundle-relative id — and so is
    // the reserved root index it is judged against (LORE-192): see effectiveProfileFor.
    const concept = tryParseConcept(rel, readConcept(root, rel), {
      warnings: options.warnings,
      profile: effectiveProfileFor(rel, BUNDLE_ROOT_INDEX_PATH, profile),
      bundleState: state,
    });
    if (concept === null) {
      // A known-reserved stem (index/log) skips silently — see the docstring above (LORE-258).
      if (!RESERVED_STEMS.has(posix.basename(rel, ".md"))) {
        options.warnings?.add(`skipping ${rel}: no frontmatter mapping, treated as a non-concept file`);
      }
      continue;
    }
    concepts.push(concept);
    if (options.boundedMemory === true && concepts.length % BOUNDED_MEMORY_GC_CONCEPT_INTERVAL === 0) Bun.gc(true);
  }
  return buildGraph(concepts, state, profile);
}

/**
 * {@link loadBundle}'s own spelling of the reserved bundle-root index, in **its** path space:
 * bundle-root-relative (`"index.md"`), not `scaffold.ts`'s repo-relative {@link
 * import("./scaffold").ROOT_INDEX_PATH} (`"docs/index.md"`, threaded by `core/validate.ts`
 * instead — LORE-144). Every `loadBundle`-backed command (`graph`/`query`/`sync`/`link`/`context`/…)
 * joins its `root` argument from `DOCS_DIR` before calling in (e.g. `commands/graph.ts`), so
 * {@link walkMarkdown}'s own relative-path space always yields this bare stem for the one file
 * `scaffold.ts`'s `serializeStructuralConcept` ever writes there.
 */
const BUNDLE_ROOT_INDEX_PATH = "index.md";

/**
 * The {@link Profile} a concept at `path` is validated against while loading: `defaultProfile()`
 * when `path` names `rootIndexPath` — the bundle's one reserved, always-scaffolded structural
 * concept — else `profile` (the caller's active one) unchanged.
 *
 * `scaffold.ts`'s `serializeStructuralConcept` always **writes** the root index against the
 * built-in default profile — deliberately ignoring the active one, so a custom profile can never
 * break `lore init` (its own docstring). Judging that same file on **read** against the active
 * profile with no carve-out reintroduces the write/read asymmetry LORE-144 fixed for `lore
 * validate`: a profile that adds a required field to `Reference` makes a freshly scaffolded
 * bundle fail its very first `loadBundle`-backed command (`lore graph` et al., LORE-192), because
 * the file lore just wrote could never satisfy a schema it was never written against. Judging the
 * root index under the identical profile it was serialized with restores the write/read symmetry
 * every other concept already has (each is both written and read against the one active profile) —
 * the root index is simply pinned to a fixed profile on both sides, not left inconsistent between
 * them.
 *
 * Exported (and generalized over `rootIndexPath`, rather than hardcoding one spelling) so this one
 * algorithm serves both reserved-root carve-outs without letting them drift apart: `core/
 * validate.ts`'s `validateConceptText` threads its own **repo-relative** constant (`"docs/
 * index.md"`), while this module's {@link loadBundle} threads its own **bundle-relative** one
 * ({@link BUNDLE_ROOT_INDEX_PATH}, `"index.md"`) — `validate.ts` cannot spell `loadBundle`'s form
 * itself (it already imports {@link nodeText} from here, so the reverse import would cycle), so it
 * imports this function instead and supplies its own path-space constant.
 *
 * Scoped to exactly one path, not the whole `RESERVED_STEMS` family (`index`/`log`): every *other*
 * reserved file — a sub-directory `index.md`, `log.md` — is generated frontmatter-free
 * (`indexes.ts`/`log.ts`), so `tryParseConcept` already treats it as a skipped non-concept and it
 * never reaches a profile-driven check in the first place. The bundle-root index is the only
 * reserved file that is itself a concept.
 */
export function effectiveProfileFor(path: string, rootIndexPath: string, profile: Profile): Profile {
  return path === rootIndexPath ? defaultProfile() : profile;
}

/**
 * Build a {@link BundleGraph} from already-parsed concepts — the pure core of the
 * bundle layer, independent of the filesystem so the graph's determinism and
 * cycle-tolerance are testable in isolation.
 *
 * Concepts are sorted by id (so input order can't leak into the output), indexed,
 * then every concept's references are resolved against that index: a reference to
 * a known id becomes a resolved {@link Edge}, an unknown one a dangling edge
 * (`to: null`). No graph traversal happens here, so any cycle among the references
 * is harmless.
 *
 * `buildGraph` expects already-validated concepts — exactly what
 * {@link parseConcept}/{@link tryParseConcept} produce. It does not re-validate
 * (the frontmatter boundary already did, and re-running Zod here would double the
 * cost on the load path); a caller that hand-builds an invalid {@link Concept} and
 * inserts it is breaking the type's contract, and a later serialize-path operation
 * (e.g. {@link BundleGraph.tokenEstimate}) may then surface a `validation` error.
 *
 * @throws LoreError `conflict` if two concepts share an id (only reachable with
 *   hand-built input — a single {@link loadBundle} walk yields unique ids).
 */
export function buildGraph(
  concepts: readonly Concept[],
  state: BundleState = { okfVersion: CURRENT_OKF_VERSION, source: "declared" },
  profile: Profile = defaultProfile(),
): BundleGraph {
  const byId = new Map<string, Concept>();
  for (const concept of [...concepts].sort((a, b) => compareCodeUnits(a.id, b.id))) {
    if (byId.has(concept.id)) {
      throw new LoreError(
        "conflict",
        `duplicate concept id "${concept.id}" in the bundle`,
        "two files resolve to the same id; rename or remove one",
        { id: concept.id, path: concept.path },
      );
    }
    byId.set(concept.id, concept);
  }

  const edges: Edge[] = [];
  for (const concept of byId.values()) {
    const dir = posix.dirname(concept.path);
    collectFrontmatterEdges(concept, dir, byId, edges);
    if (state.okfVersion === "0.2") {
      collectSourceEdges(concept, dir, byId, edges);
    }
    collectBodyEdges(concept, dir, byId, edges);
  }

  return {
    state,
    concepts: byId,
    edges,
    tokenEstimate: makeTokenEstimate(byId, state, profile),
  };
}

/**
 * Read and negotiate the bundle-root `index.md` version without walking the whole bundle. Missing
 * root/index/frontmatter is the explicit legacy path; malformed values fail validation, while
 * warnings expose future best-effort consumption to callers that provide a collector.
 */
export function loadBundleState(root: string, warnings?: WarningCollector): BundleState {
  let raw: string | undefined;
  try {
    raw = readFileSync(posix.join(root, BUNDLE_ROOT_INDEX_PATH), "utf8");
  } catch (cause) {
    const code = errnoCode(cause);
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      readError(cause, `cannot read ${BUNDLE_ROOT_INDEX_PATH}`, { root, path: BUNDLE_ROOT_INDEX_PATH });
    }
  }
  // Keep parse failures outside the filesystem catch: malformed YAML is a validation error from
  // the concept boundary, never an I/O not_found/denied error.
  const frontmatter = raw === undefined ? null : tryReadFrontmatter(BUNDLE_ROOT_INDEX_PATH, raw);
  return requireUsableBundleState(resolveBundleState(frontmatter), warnings);
}

/** Convert negotiation diagnostics to lore's warning/error channels and return usable state. */
function requireUsableBundleState(
  resolution: BundleStateResolution,
  warnings: WarningCollector | undefined,
): BundleState {
  for (const issue of resolution.issues) {
    if (issue.severity === "warning") {
      warnings?.add(issue.message);
      continue;
    }
    throw new LoreError(
      "validation",
      issue.message,
      "set bundle-root index.md okf_version to a quoted supported value",
      {
        path: BUNDLE_ROOT_INDEX_PATH,
      },
    );
  }
  return resolution.state;
}

// ── Filesystem walk ────────────────────────────────────────────────────────────

/**
 * The {@link WarningCollector} `kind` tag on a "skipping unreadable directory" warning
 * ({@link walkFiles}). A caller whose mutation depends on a **complete** view of the bundle
 * graph — `lore rename`/`lore supersede`'s inbound-link rewrite, which can only repoint the
 * links it can see — tests for this with `warnings.has(UNREADABLE_DIRECTORY_WARNING)` and
 * refuses to commit rather than silently reporting success over an incomplete rewrite (LORE-82).
 * A caller without that completeness dependency (`query`, `sync`'s per-concept reconciliation, …)
 * has no reason to check it — the walk itself stays tolerant either way (LORE-82 doesn't change
 * loading behavior, only what a caller may choose to do with the signal).
 */
export const UNREADABLE_DIRECTORY_WARNING = "unreadable-directory";

/**
 * Recursively collect every `.md` file under `root`, returned as
 * bundle-root-relative POSIX paths in ascending lexicographic order. The final
 * list is sorted, so the result never depends on the filesystem's enumeration
 * order (design §8).
 *
 * Two robustness rules keep one odd entry from corrupting or aborting the whole
 * walk, each leaving a visible warning rather than a silent gap:
 *
 * - **Symlinks are not followed** (file *or* directory): a symlink could loop the
 *   walk (a link pointing back up the tree) or pull in files outside the bundle.
 * - **An unreadable *sub*-directory is skipped, not fatal**: a permission-denied
 *   nested folder warns and is passed over, so the rest of the bundle still loads;
 *   only an unreadable **root** is fatal (there is no bundle to load at all).
 *
 * The extension match is the **lowercase** `.md` (the OKF/lore canonical
 * extension), not case-insensitive: matching `.MD`/`.Md` too would, on a
 * case-sensitive filesystem, admit `Foo.md` *and* `Foo.MD` as two files that
 * {@link idFromPath} folds to one id — a spurious `conflict` that aborts the load
 * on Linux but never reproduces on a case-insensitive macOS. Restricting the walk
 * to `.md` keeps the id space collision-free and the result identical across
 * platforms; a non-`.md` file is simply not a concept.
 *
 * Exported so `lore validate`'s command layer reuses the *same* robust walk for a
 * directory target (sorted, symlink-safe, `.md`-only, nested-unreadable-tolerant)
 * instead of re-rolling a thinner one that would drift from how the bundle is loaded.
 */
export function walkMarkdown(root: string, warnings: WarningCollector | undefined): string[] {
  return walkFiles(root, warnings, (name) => /\.md$/.test(name));
}

/**
 * The generic robust walk {@link walkMarkdown} is built on: a sorted, symlink-safe,
 * nested-unreadable-tolerant recursion that returns every regular file the `accept` predicate
 * keeps (matched on the file's **base name**), as bundle-root-relative POSIX paths. The same
 * symlink-skip / unreadable-subdir-warn / fatal-unreadable-root rules as the markdown walk apply;
 * only the extension policy varies. `lore check`'s command layer uses it with a `.md`-or-`.mdx`
 * predicate so the filename-portability lint can *see* a stray `.mdx` (which the `.md`-only bundle
 * walk deliberately excludes) without re-rolling the traversal.
 */
export function walkFiles(
  root: string,
  warnings: WarningCollector | undefined,
  accept: (name: string) => boolean,
): string[] {
  const found: string[] = [];

  const recurse = (relDir: string): void => {
    const absDir = relDir === "" ? root : posix.join(root, relDir);
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch (cause) {
      if (relDir === "") {
        readError(cause, `cannot read directory ${absDir}`, { root, dir: absDir });
      }
      // A nested unreadable directory skips (with a warning), so one restricted
      // folder doesn't take the whole bundle down with it.
      warnings?.add(`skipping unreadable directory ${relDir}: ${deriveMessage(cause)}`, UNREADABLE_DIRECTORY_WARNING);
      return;
    }
    for (const entry of entries) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        warnings?.add(`skipping symlink ${rel}: symlinks are not followed`);
      } else if (entry.isDirectory()) {
        recurse(rel);
      } else if (entry.isFile() && accept(entry.name)) {
        found.push(rel);
      }
    }
  };

  recurse("");
  return found.sort(compareCodeUnits);
}

/** Read one bundle file as UTF-8, mapping an I/O failure to a classified {@link LoreError}. */
function readConcept(root: string, rel: string): string {
  try {
    return readFileSync(posix.join(root, rel), "utf8");
  } catch (cause) {
    readError(cause, `cannot read ${rel}`, { root, path: rel });
  }
}

/**
 * Raise the right {@link LoreError} for a caught read failure, deferring the errno→category
 * decision to the shared {@link ioError} policy (`EACCES`/`EPERM` → `denied`; anything else →
 * `not_found`, so an unreadable sub-directory is not misreported as a missing bundle root). Only
 * the wording is bundle's: the cause's message is appended to `what` for diagnosis. Always throws.
 */
function readError(cause: unknown, what: string, input: Record<string, unknown>): never {
  const message = `${what}: ${deriveMessage(cause)}`;
  ioError(cause, {
    denied: { message, hint: "check filesystem permissions on that path" },
    notFound: { message, hint: "check the path exists and is readable" },
    input,
  });
}

// ── Edge collection ──────────────────────────────────────────────────────────—

/**
 * The frontmatter fields that carry concept references, in canonical emission
 * order. The `satisfies` clause pins this list to the non-`"link"` {@link EdgeKind}
 * members, so adding an edge kind without listing it here (or vice versa) is a
 * compile error rather than a silent drift.
 *
 * Exported so the rewrite engine (`lore rename`/`supersede`) iterates the **same**
 * ref fields the graph counts as edges, rather than re-declaring the list and risking
 * the two drifting (e.g. a future `depends_on` ref kind silently un-rewritten).
 */
export const REF_FIELDS = ["specs", "supersedes", "superseded_by"] as const satisfies readonly Exclude<
  EdgeKind,
  "link" | "sources"
>[];

/**
 * Append the `specs`/`supersedes`/`superseded_by` frontmatter edges for one
 * concept. Each field is normalized to a list of non-empty strings (a field may
 * be a single ref or a list — {@link toRefList}); each ref is resolved against the
 * id index ({@link resolveRef}). Empty/blank values produce no edge.
 */
function collectFrontmatterEdges(concept: Concept, dir: string, byId: ReadonlyMap<string, Concept>, out: Edge[]): void {
  for (const kind of REF_FIELDS) {
    for (const ref of toRefList(concept.frontmatter[kind])) {
      out.push({ from: concept.id, to: resolveRef(ref, dir, byId), target: ref, kind });
    }
  }
}

/**
 * Append OKF 0.2 provenance edges for `sources[].resource` values that name concepts. A
 * resolvable bare id is a concept source; an unresolved value becomes a dangling edge only when
 * it has the unambiguous internal `.md` path shape. This keeps external URLs and free-form scope
 * descriptors out of the concept graph while retaining a useful quality signal for broken paths.
 */
function collectSourceEdges(concept: Concept, dir: string, byId: ReadonlyMap<string, Concept>, out: Edge[]): void {
  const sources = concept.frontmatter.sources;
  if (!Array.isArray(sources)) {
    return;
  }
  for (const source of sources) {
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
      continue;
    }
    const resource = (source as Record<string, unknown>).resource;
    if (typeof resource !== "string" || resource.trim() === "") {
      continue;
    }
    const target = resource.trim();
    const to = resolveRef(target, dir, byId);
    if (to !== null || internalTarget(target) !== null) {
      out.push({ from: concept.id, to, target, kind: "sources" });
    }
  }
}

/**
 * Append the body cross-link edges for one concept, in document order. Targets are
 * extracted by a CommonMark parser ({@link extractBodyTargets}), so links in code
 * are already excluded; only internal `.md` targets ({@link internalTarget})
 * resolve to an edge, dangling tolerated.
 */
function collectBodyEdges(concept: Concept, dir: string, byId: ReadonlyMap<string, Concept>, out: Edge[]): void {
  for (const target of extractBodyTargets(concept.body)) {
    const path = internalTarget(target);
    if (path === null) {
      continue; // external, anchor-only, or non-.md — not a concept edge
    }
    out.push({ from: concept.id, to: resolvePath(path, dir, byId), target, kind: "link" });
  }
}

/**
 * The canonical `not_found` {@link LoreError} (exit 3) for a concept id absent from the bundle —
 * the single source of its message and hint so the graph-aware refactoring commands (`lore rename`,
 * `lore supersede`) and the rewrite engine all surface the same wording, whichever layer detects the
 * absence. The hint points at `lore query`/`lore graph` (LORE-259) — both list every known concept
 * id when run with no arguments — never `lore check`, which only prints a pass/fail summary count
 * and lists no ids at all.
 */
export function conceptNotInBundle(id: string): LoreError {
  return new LoreError(
    "not_found",
    `concept "${id}" is not in the bundle`,
    "run `lore query` or `lore graph` to see known concept ids",
    { id },
  );
}

/**
 * Resolve a frontmatter concept reference to a concept id, or `null` if it
 * dangles. A ref may be authored as a **bundle-relative id** (how `lore supersede`
 * writes it, and what `lore rename`'s rewrite engine (rewrite.ts's `remapRefItem`)
 * canonicalizes every moved ref to, e.g. `adr/0009-x`) or as a **relative path**
 * (e.g. `../adr/0009-x.md`). Which interpretation is tried first is decided by the ref's
 * own **shape** ({@link isPathShapedRef}), not a blanket precedence — trying one
 * fixed order first for every ref shape cannot be correct for both forms at once
 * (LORE-184): a bare id is dir-joinable (`resolvePath` will happily join it to
 * `dir` and `idFromPath` tolerates its missing suffix), so path-first would let a
 * concept that merely happens to sit at the dir-joined location shadow the bare id
 * `lore` itself writes; conversely a `.md`-suffixed/`./`-relative ref that
 * coincidentally also equals some unrelated concept's bundle-root id must not
 * resolve to that decoy (LORE-134). Shape removes the ambiguity: only a path-shaped
 * ref is dir-joined first, only a bare ref is looked up as a root id first — each
 * form still falls back to the other interpretation if its primary one misses, so
 * a legitimately dir-relative bare ref (or a `.md` ref that happens to equal a root
 * id with no dir-relative match) still resolves.
 *
 * Unlike a body link ({@link internalTarget}), a ref is **not** required to carry a
 * `.md` suffix — the bare-id form is exactly what lore writes — which is why the
 * two paths classify the same string differently by design: a body cross-link must
 * be the portable `.md`-suffixed form (ADR-0010), while a frontmatter ref is an id.
 *
 * The ref is **trimmed** before classification and resolution, so a whitespace-padded
 * value resolves to the same id whether reached through the edge collector (which
 * trims via {@link toRefList}) or a caller that passes a raw frontmatter value (the
 * rewrite engine). Exported as the single frontmatter-ref→id rule so `lore rename`/
 * `supersede` repoint exactly the refs the graph counts as edges.
 */
export function resolveRef(ref: string, dir: string, byId: ReadonlyMap<string, Concept>): string | null {
  // A ref that is external (a `scheme:`/protocol-relative URL) or a bare `#anchor`
  // is not a concept reference — reject it the same way a body link is, so an
  // absolute URL is never run through path normalization (which would mangle its
  // `//`) and a stray `#anchor` never resolves to the referring file's own
  // directory.
  const trimmed = ref.trim();
  if (isExternalTarget(trimmed)) {
    return null;
  }
  const decoded = decodeTarget(pathPart(trimmed));
  if (decoded === "") {
    return null;
  }
  if (isPathShapedRef(decoded)) {
    const asPath = resolvePath(decoded, dir, byId);
    if (asPath !== null) {
      return asPath; // relative-path form, dir-joined — wins over a same-string root id (LORE-134)
    }
    const asId = idFromPath(decoded);
    return byId.has(asId) ? asId : null;
  }
  // Bare (suffix-less, non-`./`/`../`-prefixed) ref: this is the canonical id form
  // `lore` itself writes, so try it as a bundle-root id FIRST — a concept that
  // merely happens to live at the dir-joined location must not shadow it (LORE-184).
  const asId = idFromPath(decoded);
  if (byId.has(asId)) {
    return asId;
  }
  return resolvePath(decoded, dir, byId); // fallback: a dir-relative bare ref with no root-id match
}

/**
 * Whether a decoded ref string is unambiguously a **path** form — a `.md` suffix
 * (case-insensitive, matching {@link idFromPath}'s own suffix test) or a `./`/`../`
 * relative-segment prefix — as opposed to the bare bundle-root **id** form `lore`
 * itself writes (`adr/0009-x`, no suffix, no leading dot-segment). Every id in
 * {@link BundleGraph.concepts} is derived through {@link idFromPath}'s
 * `posix.normalize`, which collapses `..`/`.` segments, so a real id can never
 * itself start with `./` or `../` — classifying such a ref as path-shaped costs
 * nothing on the id side and correctly prioritizes the dir-relative interpretation
 * for the form a human author would actually write that way.
 */
function isPathShapedRef(ref: string): boolean {
  return /\.md$/i.test(ref) || ref.startsWith("./") || ref.startsWith("../");
}

/**
 * Resolve an already-decoded relative `.md` path (a body link destination, or the
 * path form of a frontmatter ref) against `dir` to a concept id, or `null` if no
 * concept matches. The path is joined to the referring directory and reduced to an
 * id via the shared {@link idFromPath} rule (which POSIX-normalizes), so resolution
 * agrees byte-for-byte with how the id was derived. A target that escapes the
 * bundle root (a leading `../`) simply matches nothing.
 *
 * A **`/`-absolute** `path` (a bundle-root-absolute target, e.g. `/foo/bar.md`) is
 * resolved against the bundle root instead of `dir`: the leading `/` is stripped and
 * the remainder used as-is, mirroring core/check.ts's `linkFindings`, the link-check
 * gate's own resolver. `dir` is already a bundle-root-relative path (every caller
 * derives it as `posix.dirname(concept.path)` / `posix.dirname(file.path)`), so "the
 * bundle root" needs no separate parameter — it is simply the empty prefix a
 * root-relative path is already relative to. Without this special case, a
 * `/`-absolute ref/link would join onto `dir` like any other relative segment and
 * disagree with the link-check gate on the same input.
 *
 * Lookup is **case-sensitive** (a plain `Map.has`), which is deliberate: it is the
 * only choice that is deterministic across platforms (a case-insensitive match
 * would resolve differently on Linux vs macOS for the same files), and the lore
 * link form is exact-case (ADR-0010). A link whose case does not match its target
 * therefore dangles — the correct signal, since that link is already broken on a
 * case-sensitive filesystem.
 */
export function resolvePath(path: string, dir: string, byId: ReadonlyMap<string, Concept>): string | null {
  const joined = path.startsWith("/") ? path.slice(1) : posix.join(dir, path);
  const id = idFromPath(joined);
  return byId.has(id) ? id : null;
}

/**
 * Classify a parsed link destination: return the URL-decoded `.md` path to
 * resolve, or `null` for a destination that is not an internal concept link — an
 * external scheme (`http:`/`mailto:`/…), a bare `#anchor`, or any non-`.md` target
 * (image, code file, directory). The `#fragment`/`?query` is dropped and the path
 * URL-decoded once before resolution.
 *
 * A destination with a `scheme:` prefix is treated as external per RFC-3986 /
 * CommonMark — including the pathological case of a relative file whose first
 * segment contains a colon (e.g. `weird:name.md`). lore's own links are always
 * relative and colon-free (ADR-0010), and the portability lint flags any that are
 * not, so this is a deliberate, documented edge rather than a resolution lore
 * needs to second-guess.
 *
 * Exported as the single body-link classifier so the rewrite engine (`lore rename`)
 * decides "is this an internal `.md` link, and to what decoded path" the exact same
 * way the graph does — trimming first — rather than re-deriving it and drifting.
 */
export function internalTarget(target: string): string | null {
  const trimmed = target.trim();
  if (isExternalTarget(trimmed)) {
    return null; // empty, anchor-only, scheme-qualified, or protocol-relative (external)
  }
  const path = decodeTarget(pathPart(trimmed));
  return /\.md$/i.test(path) ? path : null;
}

// ── Token estimate ───────────────────────────────────────────────────────────—

/**
 * The project's token-count **heuristic**: chars/4 over a string (`Math.ceil`, so a
 * non-empty string is never 0). This is the single home of the chars/4 rule — the
 * whole-concept estimator below and `lore context`'s per-neighbor budget both call
 * it, so the "what is a token" definition can never drift between the figures a
 * single command sums into one budget. It is explicitly *not* a real tokenizer
 * (`length` is UTF-16 code units, so non-ASCII text is mis-measured); the surfaces
 * that show it label it `chars/4`.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** chars/4 token estimate over one concept's canonical serialized bytes. */
function estimateConcept(concept: Concept, state: BundleState, profile: Profile): number {
  const structuralProfile = effectiveProfileFor(concept.path, BUNDLE_ROOT_INDEX_PATH, profile);
  return estimateTokens(serializeConcept(concept, { profile: structuralProfile, bundleState: state }));
}

/**
 * Coerce a frontmatter scalar to a display string, or `undefined` when there is
 * nothing to show — the single rule every command that surfaces a concept's `title`
 * (or a `title`-shaped field) shares, so the same concept's `title` reads identically
 * from `lore graph` and `lore context`.
 *
 * A **string** is kept **verbatim** (leading/trailing and internal whitespace
 * preserved) unless it is empty/whitespace-only, which has no display form. A
 * **finite** number or a boolean (a YAML-coerced scalar on an unknown type whose
 * fields the schema leaves untouched — e.g. an unquoted `title: 2024`) is coerced to
 * its string form rather than dropped; a non-finite number (an overflowing
 * `1e400` → `Infinity`, or `NaN`) has no meaningful display form and is dropped
 * rather than rendered as the literal `Infinity`/`NaN`. Anything else (`null`, a
 * list, an object) yields `undefined`.
 *
 * Note this reflects the **parsed** value: js-yaml has already turned an unquoted
 * `1.10` into the number `1.1`, so the authored text is unrecoverable here — quote a
 * scalar whose exact spelling matters.
 */
export function frontmatterScalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() === "" ? undefined : value;
  }
  if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/**
 * Build the {@link BundleGraph.tokenEstimate} closure over the loaded concepts,
 * memoizing each concept's estimate (and the whole-bundle total) so a repeated
 * call — e.g. `lore context` asking for a target plus each neighbor — never
 * re-serializes a concept it already measured.
 */
function makeTokenEstimate(
  byId: ReadonlyMap<string, Concept>,
  state: BundleState,
  profile: Profile,
): (id?: string) => number {
  const cache = new Map<string, number>();
  let total: number | undefined;

  const estimateFor = (id: string, concept: Concept): number => {
    let value = cache.get(id);
    if (value === undefined) {
      value = estimateConcept(concept, state, profile);
      cache.set(id, value);
    }
    return value;
  };

  return (id?: string): number => {
    if (id === undefined) {
      if (total === undefined) {
        let sum = 0;
        for (const [conceptId, concept] of byId) {
          sum += estimateFor(conceptId, concept);
        }
        total = sum;
      }
      return total;
    }
    const concept = byId.get(id);
    if (concept === undefined) {
      throw new LoreError(
        "not_found",
        `concept "${id}" is not in the bundle`,
        "run `lore query` to find the right id, or check the path",
        { id },
      );
    }
    return estimateFor(id, concept);
  };
}

// ── Markdown / path helpers ──────────────────────────────────────────────────—

/**
 * Depth-first pre-order walk over an mdast tree, visiting every node once. It uses
 * an **explicit stack**, not recursion: a pathological body (e.g. tens of thousands
 * of nested blockquotes) produces an AST deeper than the JS call stack, and a
 * recursive walk would overflow with an uncaught `RangeError` that takes down the
 * whole bundle build — `mdast-util-from-markdown` itself parses such input
 * iteratively, so the walk must too. Children are pushed in reverse so they pop in
 * document order (a stable pre-order traversal).
 *
 * Exported so `lore validate`'s heading extraction reuses this one stack-safe
 * traversal instead of re-rolling the same explicit-stack walk and risking drift.
 */
export function walkMdast(root: Nodes, visit: (node: Nodes) => void): void {
  const stack: Nodes[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      break;
    }
    visit(node);
    if ("children" in node) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child !== undefined) {
          stack.push(child);
        }
      }
    }
  }
}

/**
 * Extract the link destinations from a concept body, in document order, using a
 * CommonMark parser (`mdast-util-from-markdown`). Walking the AST is what makes
 * extraction correct where a regex is not: a link inside a code span or
 * fenced/indented code block never appears as a `link` node, and a linked-image
 * contributes its **outer** `link` (its `url`).
 *
 * A reference-style link (`[text][id]`) is resolved through its **definition**:
 * only definitions that an actual `linkReference` uses become targets, so an
 * orphan/unused `[id]: …` definition (which renders as nothing) is *not* a phantom
 * edge. Image (`image`/`imageReference`) nodes are ignored — they point at assets,
 * not concepts.
 *
 * Two deliberate boundaries, both matching lore's canonical link form (ADR-0010):
 *
 * - **Only markdown links count.** A cross-link written as raw HTML
 *   (`<a href="../x.md">`) parses to an opaque `html` node and is *not* an edge;
 *   raw HTML is non-portable and the portability lint flags it. lore never emits
 *   it, so it stays out of the graph rather than dragging an HTML parser into core.
 * - **Plain CommonMark, no GFM extensions.** Without the footnote extension a
 *   `[^1]: …` line is ordinary text, so any markdown link inside it is a normal
 *   link and an edge — which is correct: it *is* a rendered link.
 *
 * Exported so `lore check`'s link/anchor pass (LORE-30) extracts a file's link
 * destinations through the *same* code-span-safe, reference-resolving walk the graph
 * uses, instead of re-rolling one that would drift from how edges are built. The
 * returned destinations keep their `#fragment`/`?query` intact (the resolver strips
 * them; the anchor check needs them).
 */
export function extractBodyTargets(body: string): string[] {
  return extractLinkTargets(fromMarkdown(compactPlainTextLines(body)));
}

/**
 * Replace exceptionally long syntax-free lines before CommonMark tokenization.
 * Their exact prose cannot affect link destinations, while retaining more than
 * CommonMark's 999-character link-label ceiling prevents an invalid oversized
 * label from becoming valid. Definition destinations on a following line remain
 * byte-exact because their text is itself the value we return.
 */
function compactPlainTextLines(body: string): string {
  const lines = body.split("\n");
  let changed = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string;
    if (line.length <= 4096 || /[^\p{L}\p{N} \t]/u.test(line)) continue;
    const previous = lines[index - 1]?.trimEnd();
    if (previous?.endsWith("]:") === true) continue;
    const indentation = line.match(/^[ \t]*/u)?.[0] ?? "";
    lines[index] = `${indentation}${"x".repeat(1000)}`;
    changed = true;
  }
  return changed ? lines.join("\n") : body;
}

/**
 * Like {@link extractBodyTargets}, but over an **already-parsed** mdast tree — so a caller
 * that also needs the tree's headings or text nodes (e.g. `lore check`) parses the body
 * **once** and shares the tree across every consumer, instead of re-parsing it per pass.
 */
export function extractLinkTargets(tree: Nodes): string[] {
  // One walk records, in document order, each inline link's url (a `string`) and
  // each reference link's identifier (a `{ ref }`), and indexes every definition —
  // because a `linkReference` may appear before its definition, resolution waits
  // until the walk is done and every definition is known.
  const definitions = new Map<string, string>();
  const events: Array<string | { ref: string }> = [];
  walkMdast(tree, (node) => {
    if (node.type === "definition") {
      if (!definitions.has(node.identifier)) {
        definitions.set(node.identifier, node.url);
      }
    } else if (node.type === "link") {
      events.push(node.url);
    } else if (node.type === "linkReference") {
      events.push({ ref: node.identifier });
    }
  });

  const targets: string[] = [];
  for (const event of events) {
    if (typeof event === "string") {
      targets.push(event);
    } else {
      const url = definitions.get(event.ref);
      if (url !== undefined) {
        targets.push(url); // a used reference link; an orphan definition is no edge
      }
    }
  }
  return targets;
}

/**
 * The literal text content of an mdast node — every `text` and `inlineCode` value
 * concatenated in document order, via the stack-safe {@link walkMdast}. Exported as the one
 * "what text does this node render" rule so heading-anchor slugging (`lore check`) and
 * required-section matching (`lore validate`) cannot drift apart on what a heading *says*.
 *
 * Deliberately excludes `image`/`imageReference` `alt` text: GitHub — lore's reference
 * renderer (portable-markdown.md) — renders an `<img>` with empty `textContent` no matter
 * its `alt`, so an image contributes nothing to the *visible* heading text GitHub slugs from
 * (verified empirically against GitHub's rendered output; `mdast-util-to-string`'s
 * `includeImageAlt: true` default diverges from GitHub here and does not apply).
 */
export function nodeText(node: Nodes): string {
  let text = "";
  walkMdast(node, (current) => {
    if (current.type === "text" || current.type === "inlineCode") {
      text += current.value;
    }
  });
  return text;
}

/**
 * Normalize a frontmatter ref value (a single ref or a list) to trimmed, non-empty
 * ref strings. A non-string **scalar** (a YAML-coerced number/boolean — reachable
 * on an unknown-type concept, whose fields the schema does not constrain) is
 * coerced to its string form rather than dropped, so a stray `supersedes: 123`
 * becomes a *visible* (dangling) edge instead of silently vanishing; `null` and
 * non-scalar items contribute nothing. Exported so `commands/link.ts` reads a
 * concept's `tasks:` list through the same tolerant normalization, rather than a
 * second implementation that silently drops what this one coerces.
 */
export function toRefList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  const refs: string[] = [];
  for (const item of items) {
    const ref = scalarToRef(item);
    if (ref !== null) {
      refs.push(ref);
    }
  }
  return refs;
}

/** A single frontmatter ref item as a trimmed, non-empty string, or `null` if it is not one. */
function scalarToRef(item: unknown): string | null {
  const text =
    typeof item === "string" ? item : typeof item === "number" || typeof item === "boolean" ? String(item) : "";
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}
