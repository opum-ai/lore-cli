/**
 * links.ts — the canonical lore cross-link form, in one place.
 *
 * Every internal cross-link lore writes — in scaffolded concepts, regenerated
 * index/log files, managed `lore:tasks` blocks, and graph-aware rewrites — is the
 * single form ADR-0010 pins as the only one that resolves across GitHub, Obsidian
 * (and feeds its graph/backlinks), MkDocs/Material, and Docusaurus simultaneously:
 *
 * - **relative** — computed from the *linking file's directory*
 *   (`../reference/orders.md`), because the bundle has no single deploy root
 *   (GitHub serves the repo path, MkDocs/Docusaurus a site subpath, Obsidian the
 *   vault root);
 * - **URL-encoded** — spaces and other reserved characters percent-encoded
 *   per path segment (`order%20schema.md`), or GitHub and several parsers fail to
 *   resolve the target;
 * - **`.md`-suffixed** — the link points at the *file*, not an extensionless route
 *   (extensionless breaks GitHub and Obsidian);
 * - **no leading slash** — never `/reference/orders.md`, which points at each
 *   consumer's *server root* and so breaks somewhere every time;
 * - **no wikilinks** — never `[[orders]]`, which renders as literal text off
 *   Obsidian.
 *
 * This module is the shared home for that form so it can never be spelled two ways:
 * {@link normalizeLink} *writes* it ({@link `lore new`}, sync/index generation,
 * `lore link`, managed blocks, and the rewrite half of `lore rename`/`supersede`),
 * and {@link validateLink} *detects* deviations from it (the per-link half of `lore
 * check`'s portability lint). The segment encoder ({@link encodePathSegments}) is
 * shared with the `resource:` URL stamper (template.ts), and the low-level
 * destination classifiers ({@link isExternalTarget}, {@link stripFragment},
 * {@link stripQuery}, {@link decodeTarget}) are reused by the bundle graph's
 * cross-link resolution — so linting and resolving agree on what a link destination
 * *is*, and every place that encodes a path encodes it the same way.
 *
 * Per the core contract (design §2.1) everything here is pure: string in, string
 * or typed finding out — no filesystem, no printing, no flags, no `process.exit`.
 * A non-portable input is reported as a {@link LinkFinding}, never thrown; these
 * functions do not fail.
 *
 * Scope (the rest of `links.ts` in design §2.1 lands with its consumers, not here):
 * whole-graph link/anchor resolution (`validateLinks(graph)` via
 * remark-validate-links) pairs with `lore check` (LORE-30); inbound-rewrite
 * orchestration (`rewriteInbound(graph, from, to)`, which composes
 * {@link normalizeLink}) pairs with `lore rename`/`supersede` (LORE-35); and the
 * body-text portability scan (wikilinks, embeds, Obsidian-isms, MDX `<`/`{`) is
 * part of `lore check`'s lint (LORE-30). This module ships the link-form
 * primitives those compose.
 */

import { posix } from "node:path";
import { idFromPath } from "./concept";

// ── Shared patterns ───────────────────────────────────────────────────────────
// Hoisted to module scope so each is compiled once rather than re-built per call.

/** A trailing `.md` in **canonical lowercase** only. */
const MD_SUFFIX_CANONICAL = /\.md$/;
/** A trailing `.md` in any case (`.md`/`.MD`/`.Md`) — the writer's id-stripping rule. */
const MD_SUFFIX_ANY_CASE = /\.md$/i;
/** The markdown-significant characters {@link encodeURIComponent} leaves raw (`! ' ( ) *`). */
const MARKDOWN_SIGNIFICANT = /[!'()*]/g;
/** A `%` that is **not** the start of a valid two-hex-digit escape. */
const MALFORMED_PERCENT = /%(?![0-9A-Fa-f]{2})/;
/** A path segment in canonical form: only RFC-3986 unreserved chars or valid `%XX` escapes. */
const CANONICAL_SEGMENT = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})*$/;
/** A raw character that breaks a markdown link destination (whitespace or a paren). */
const RAW_BREAKER = /[\s()]/;
/** An RFC-3986 `scheme:` prefix — what makes a destination look like an absolute URL. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// ── Writing the canonical form ──────────────────────────────────────────────────

/**
 * Compute the canonical lore cross-link **destination** from one file to another:
 * the value that goes inside `[text](…)`, in the relative · URL-encoded ·
 * `.md`-suffixed · no-leading-slash form (ADR-0010).
 *
 * **Inputs are file *paths*, not link destinations.** `fromPath` and `toPath` must
 * be expressed in the **same coordinate space** — both bundle-root-relative
 * (`stories/x.md` → `reference/orders.md`) or both repo-relative
 * (`docs/stories/x.md` → `docs/reference/orders.md`) — because the result is
 * `posix.relative(dirname(fromPath), toPath)`: pure path arithmetic that happily
 * crosses subtrees (`../../backlog/tasks/…`) when the two live apart, which is
 * exactly what a managed `lore:tasks` block linking a `docs/` story to a Backlog
 * task file needs. The coordinate space is a **caller precondition** the two-string
 * arithmetic cannot itself verify; a mismatched pair yields a wrong relative link,
 * not an error. `toPath` is a path, so it must **not** carry a `#fragment` or
 * `?query` — pass a heading via `anchor` (a caller rewriting an existing link, e.g.
 * `lore rename`, splits the fragment off first and feeds it here).
 *
 * Mechanics, each pinned to one property of the form:
 *
 * - **`.md`-suffixed** — `toPath` is normalized and coerced to a single canonical
 *   lowercase `.md` ({@link ensureMarkdownSuffix}), so a caller may pass a path
 *   (`reference/orders.md`), a bare concept id (`reference/orders`), or even a
 *   wrong-case `reference/orders.MD` and get the one canonical file link.
 * - **relative, no leading slash** — `posix.relative` is computed from the linking
 *   file's *directory* and never returns a leading slash, so both properties hold
 *   by construction (a sibling becomes `orders.md`, a parent-dir target
 *   `../reference/orders.md`).
 * - **URL-encoded** — every path segment is percent-encoded by
 *   {@link encodePathSegments}, which escapes a space to `%20` *and* the markdown-
 *   significant `! ' ( ) *` that bare `encodeURIComponent` leaves raw (an
 *   unbalanced `)` would otherwise truncate the link destination on
 *   CommonMark/Python-Markdown), while leaving the `/` separators and `.`/`..`
 *   steps literal.
 *
 * `anchor`, when given, is appended as `#<anchor>` **verbatim** — the caller passes
 * an already-resolved GitHub heading slug (lowercased, spaces → `-`, punctuation
 * stripped), which by construction needs no encoding; re-encoding it would mangle a
 * correct slug, since GitHub anchors are not percent-encoded.
 *
 * **Deterministic, not idempotent on its own output.** The same `(fromPath, toPath,
 * anchor)` always yields the same destination, so a regenerate-and-compare pass
 * over canonical links is a no-op — but note the inputs are *paths*: feeding this
 * function's *output* (an already-relative, already-encoded destination) back in as
 * `toPath` is misuse and would double-encode and re-base it.
 *
 * @param fromPath the linking file (its directory anchors the relative path).
 * @param toPath the target file or bare concept id (a missing `.md` is added; no `#`/`?`).
 * @param anchor optional pre-slugified heading anchor, appended as `#anchor`.
 * @returns the canonical relative destination string for `[text](…)`.
 */
export function normalizeLink(fromPath: string, toPath: string, anchor?: string): string {
  // Precondition guard (the docstring's coordinate-space rule the arithmetic can't verify):
  // an **absolute** operand has no place in lore's relative coordinate space and would make the
  // result depend on process.cwd() — reject it loudly as the caller bug it is rather than emit a
  // silently-wrong link.
  if (posix.isAbsolute(fromPath) || posix.isAbsolute(toPath)) {
    throw new Error(`normalizeLink expects relative paths (got from="${fromPath}", to="${toPath}")`);
  }
  // Root both operands at a fixed virtual "/" before the relative computation so the output is
  // cwd-independent even when a path carries `..` segments — `posix.relative` otherwise resolves
  // a relative operand against process.cwd(), which cancels only for two in-tree paths. `posix.join`
  // also collapses `.`/`..`, so no separate normalize is needed.
  const fromDir = posix.join("/", posix.dirname(fromPath));
  const toFile = posix.join("/", ensureMarkdownSuffix(toPath));
  const relative = posix.relative(fromDir, toFile);
  const encoded = encodePathSegments(relative);
  return anchor ? `${encoded}#${anchor}` : encoded;
}

/**
 * POSIX-normalize a target and coerce it to a single **canonical lowercase `.md`**
 * suffix. A bundle never holds a `.MD`/`.Md` file (the walk matches lowercase `.md`
 * only) and {@link idFromPath} strips `.md` case-insensitively, so the writer must
 * re-add it in canonical case: a wrong-case `orders.MD` becomes `orders.md`, a
 * bare id `orders` becomes `orders.md`, and an already-correct `orders.md` is
 * unchanged.
 */
function ensureMarkdownSuffix(path: string): string {
  // idFromPath POSIX-normalizes and strips a case-insensitive `.md`; re-adding the canonical
  // lowercase suffix yields the one canonical file link and reuses the single path→id rule (so a
  // bare id, a correct `.md`, and a wrong-case `.MD` all converge) instead of re-rolling it here.
  return `${idFromPath(path)}.md`;
}

/**
 * Percent-encode each `/`-separated segment of a relative path for use as a
 * markdown link destination, leaving the separators and `.`/`..` steps literal.
 *
 * Exported as the **single** path-segment encoder so body cross-links
 * ({@link normalizeLink}) and the `resource:` frontmatter URL (template.ts
 * `resourceFor`) encode a path the exact same way and can never drift — the whole
 * reason this module exists. Each segment goes through {@link encodePathSegment},
 * which extends {@link encodeURIComponent} to also escape the markdown-significant
 * `! ' ( ) *` it leaves raw.
 */
export function encodePathSegments(path: string): string {
  return path.split("/").map(encodePathSegment).join("/");
}

/**
 * Percent-encode one path segment to the canonical form: {@link encodeURIComponent}
 * plus the five characters it leaves raw (`! ' ( ) *`), which are unreserved in a
 * URI but significant in a markdown link destination — an unbalanced `)` truncates
 * the destination on CommonMark/Python-Markdown. Hex is uppercase, matching
 * `encodeURIComponent`, so {@link normalizeLink}'s output and the
 * {@link validateLink} round-trip agree on the canonical bytes.
 */
function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    MARKDOWN_SIGNIFICANT,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// ── Linting the canonical form ──────────────────────────────────────────────────

/**
 * The portable-markdown path **part** of a destination — everything before a
 * `#fragment` or `?query`. The single composition of {@link stripFragment} and
 * {@link stripQuery} (fragment first, so a `?` that lives *inside* a fragment is
 * not mistaken for a query), shared by the linter ({@link validateLink}) and the
 * bundle resolver so both split a destination into path / suffix the same way.
 */
export function pathPart(target: string): string {
  return stripQuery(stripFragment(target));
}

/**
 * The way a link destination departs from the canonical form. Each value is one
 * property of the ADR-0010 link rule, so a caller can branch on the *kind* of
 * portability problem rather than parse the message.
 */
export type LinkIssue = "leading-slash" | "missing-extension" | "unencoded" | "accidental-colon" | "directory-link";

/**
 * One portability problem with a single link destination. `target` is the
 * offending destination as authored, `issue` the machine-branchable kind, and
 * `message` a human-readable one-liner for the warning stream. A destination can
 * produce more than one finding (a `/reference/orders` link is both leading-slash
 * *and* missing-extension).
 */
export interface LinkFinding {
  /** The link destination as authored (the value inside `[text](…)`). */
  readonly target: string;
  /** Which property of the canonical form the destination violates. */
  readonly issue: LinkIssue;
  /** A human-readable description of the violation, for the warning stream. */
  readonly message: string;
}

/**
 * Classify a single markdown link **destination** against the canonical internal
 * cross-link form, returning a finding per violation (an empty array means the
 * destination is already portable). This is the per-link primitive `lore check`'s
 * portability lint composes over a bundle's body links (LORE-30); the broader
 * body-text scan for wikilinks, embeds, Obsidian-isms, and MDX hazards is the
 * lint's own concern, not this function's — a wikilink never parses to a link
 * destination, so it cannot reach here.
 *
 * **External destinations are clean here.** An empty target, a bare `#anchor`, a
 * protocol-relative `//host/…`, or a `scheme:`-qualified URL ({@link isExternalTarget})
 * is not an internal cross-link, so it yields no findings — linting an external URL
 * for a `.md` suffix would be nonsense. This uses the **same** classifier the bundle
 * graph's resolver applies, so writer, resolver, and linter agree on what counts as
 * external. The **one** exception (LORE-48) is the pathological destination whose first
 * segment carries a colon (`notes:2026.md`): the shared classifier reads it as a
 * `scheme:` URL (ADR-0010) — a form lore never writes — so it is flagged here as an
 * `accidental-colon` filename rather than skipped in silence by both linter and resolver.
 *
 * The checks mirror the machine-checkable properties of the form (the "relative"
 * property is implied by "no leading slash"; "no wikilinks" is a body scan):
 *
 * - **`leading-slash`** — a `/`-absolute destination, which resolves against each
 *   consumer's differing server root.
 * - **`accidental-colon`** — a relative file whose first segment carries a colon
 *   ({@link accidentalColonFile}), read as a `scheme:` URL and otherwise unlinted.
 * - **`directory-link`** — a non-external destination ending in `/` (`../reference/`):
 *   it resolves to a file on no renderer and is almost always a dropped filename.
 * - **`missing-extension`** — an internal target missing the canonical **lowercase**
 *   `.md` suffix ({@link lacksMarkdownSuffix}): either no extension at all
 *   (`../reference/orders`) or a wrong-case `.md` (`orders.MD`), both of which 404
 *   on GitHub/Linux. A directory link is its own `directory-link` finding (above); a
 *   dotfile (`../config/.gitignore`) and any other asset extension (`../img/x.png`) are
 *   left alone — matching the bundle resolver, which treats a non-`.md` target as
 *   simply *not an edge* rather than a broken one. The extension is judged on the
 *   *decoded* path, so the linter and the resolver (which decodes first) agree.
 * - **`unencoded`** — a destination that will not survive a markdown parser
 *   ({@link encodingProblem}): a raw space or paren in the path *or* in the
 *   `#fragment`/`?query`, a malformed `%`-escape, or an interior `//`. A valid but
 *   non-canonical encoding (`a%41b.md`, lowercase `%c3`) is **clean** — over-encoding
 *   renders everywhere, so the lint flags what *breaks*, not every deviation from the
 *   writer's exact bytes.
 *
 * @param target the link destination to classify (the value inside `[text](…)`).
 * @returns a {@link LinkFinding} per violation; empty when portable or external.
 */
export function validateLink(target: string): LinkFinding[] {
  const findings: LinkFinding[] = [];
  const trimmed = target.trim();
  if (isExternalTarget(trimmed)) {
    // A scheme:-qualified destination is external and not linted — with one exception. lore never
    // writes a colon inside a path segment, so a `scheme:` whose tail is a relative `.md` file
    // (`notes:2026.md`) is almost certainly a filename with an accidental colon, which both this
    // linter and the bundle resolver would otherwise skip in silence. Flag that one case;
    // everything else (`http:`, `mailto:`, a bare `#anchor`, a protocol-relative `//host`) is
    // genuinely external.
    if (accidentalColonFile(trimmed)) {
      findings.push({
        target,
        issue: "accidental-colon",
        message: `link "${target}" looks like a relative file whose name contains a ":"; it is read as a "scheme:" URL and skipped by link resolution — remove the colon (lore filenames never contain one)`,
      });
    }
    return findings;
  }

  if (trimmed.startsWith("/")) {
    findings.push({
      target,
      issue: "leading-slash",
      message: `link "${target}" is /-absolute; use a relative path (it resolves against each consumer's differing root)`,
    });
  }

  // Split into the path part and the raw `#fragment`/`?query` remainder, the same
  // way the bundle resolver does (shared {@link pathPart}). Both halves are scanned:
  // a destination-breaking char in a fragment (`orders.md#Archival Policy`) truncates
  // the link just as surely as one in the path.
  const path = pathPart(trimmed);
  const suffix = trimmed.slice(path.length);

  if (isDirectoryLink(path)) {
    findings.push({
      target,
      issue: "directory-link",
      message: `link "${target}" points at a directory (a trailing "/"); name the .md file instead (a directory link resolves on no renderer — likely a dropped filename)`,
    });
  } else if (lacksMarkdownSuffix(path)) {
    findings.push({
      target,
      issue: "missing-extension",
      message: `link "${target}" is missing the .md suffix; GitHub and Obsidian link to the file and need the lowercase .md extension`,
    });
  }

  const problem = encodingProblem(path, suffix);
  if (problem !== null) {
    findings.push({ target, issue: "unencoded", message: encodingMessage(target, problem) });
  }

  return findings;
}

/**
 * Whether a destination's path part lacks the canonical lowercase `.md` suffix and
 * so looks like a dropped-extension concept link — judged on the **decoded** path
 * (`orders%2Emd` decodes to `orders.md`), so the linter and the bundle resolver,
 * which {@link decodeTarget}s before resolving, agree on what the extension *is*.
 *
 * The canonical form is **lowercase** `.md` only; the rule mirrors how the resolver
 * treats a destination, flagging exactly the two cases that 404 on GitHub/Linux:
 *
 * - **no extension at all** (`../reference/orders`) — a dropped-suffix concept link;
 * - **a wrong-case `.md`** (`orders.MD`/`orders.Md`) — meant to be the portable
 *   suffix but case-broken on a case-sensitive host.
 *
 * Three shapes are deliberately **left alone**, matching the resolver's "a non-`.md`
 * target is simply not a concept edge" rule, so the lint does not cry wolf:
 *
 * - an empty path (a pure `#fragment`/`?query` destination);
 * - a **directory** link (a trailing `/`, e.g. `../reference/`);
 * - a **dotfile** (`../config/.gitignore`) or any other **asset** extension
 *   (`../img/x.png`), which is a real non-concept link, not a dropped suffix.
 *
 * A dotted filename that *was* meant as a concept (`orders.v2` for `orders.v2.md`)
 * is indistinguishable from an asset and is treated as one — the same call the
 * resolver makes; a genuinely broken such link surfaces as a dangling edge in
 * `lore check`'s link-existence pass, not here.
 */
function lacksMarkdownSuffix(rawPath: string): boolean {
  const path = decodeTarget(rawPath);
  if (path === "" || path.endsWith("/")) {
    return false; // pure fragment/query, or a directory link — no file suffix to demand
  }
  const last = path.slice(path.lastIndexOf("/") + 1);
  if (last === "" || last.startsWith(".")) {
    return false; // a dotfile (.gitignore) is an asset, not a dropped suffix
  }
  if (MD_SUFFIX_CANONICAL.test(last)) {
    return false; // canonical lowercase .md
  }
  if (MD_SUFFIX_ANY_CASE.test(last)) {
    return true; // wrong-case .MD/.Md — meant to be .md, 404s on a case-sensitive host
  }
  return !last.includes("."); // no extension → dropped suffix; any other extension → asset
}

/** The URL schemes a docs bundle legitimately links with — never an accidental-colon filename. */
const KNOWN_URL_SCHEMES = new Set([
  "http",
  "https",
  "ftp",
  "ftps",
  "file",
  "mailto",
  "tel",
  "sms",
  "data",
  "ws",
  "wss",
  "git",
  "ssh",
  "irc",
  "urn",
]);

/**
 * Whether a destination is a relative file whose **first path segment carries a colon**
 * (`notes:2026.md`), which {@link isExternalTarget} reads as a `scheme:` URL and so leaves
 * unlinted. Real URLs are excluded three ways, because `.md` is a live TLD (Moldova) so "ends in
 * `.md`" alone is not enough:
 *
 * - a **known** URL scheme (`http`, `mailto`, `file`, …) is a real link, never a filename;
 * - a hierarchical tail beginning with `/` (`http://…`, `file:///…`) is a real URL;
 * - a tail containing `@` (`mailto:user@example.md`) is a mailbox, not a path.
 *
 * Only an *unknown* scheme whose tail is a bare relative-looking `.md` path is taken to be a
 * filename with an accidental colon — the one case lore never writes and the resolver silently
 * skips. (A colon in a *later* segment, `dir/notes:2026.md`, is not a scheme and is already
 * flagged `unencoded`.)
 */
function accidentalColonFile(target: string): boolean {
  const path = pathPart(target);
  const scheme = URL_SCHEME.exec(path);
  if (scheme === null) {
    return false; // a bare #anchor or `//host` reaches here with no scheme to mistake for a colon
  }
  const name = scheme[0].slice(0, -1).toLowerCase(); // the scheme word, without its trailing ":"
  if (KNOWN_URL_SCHEMES.has(name)) {
    return false; // a genuine URL scheme, not a mistyped filename
  }
  const tail = path.slice(scheme[0].length);
  return !tail.startsWith("/") && !tail.includes("@") && MD_SUFFIX_ANY_CASE.test(tail);
}

/**
 * Whether a (non-external) destination's path part names a **directory** — a trailing `/` after
 * decoding (`../reference/`). Such a link resolves to a file on no renderer and is almost always
 * a dropped filename, so it warns. The pure leading-slash `/` (already flagged `leading-slash`)
 * and an empty path (a bare fragment) are excluded so neither double-reports.
 */
function isDirectoryLink(rawPath: string): boolean {
  const path = decodeTarget(rawPath);
  return path !== "" && path !== "/" && path.endsWith("/");
}

/**
 * The kind of encoding problem a destination carries, or `null` when its path and
 * suffix are both portable. One finding per destination is enough to flag the form,
 * so the first problem found (in this fixed precedence) wins:
 *
 * - **`empty-segment`** — an *interior* `//` (`a//b.md`): an empty path step that is
 *   non-canonical (a leading `//` is protocol-relative and already external; a
 *   trailing `/` is a directory link, not an empty segment).
 * - **`malformed`** — a `%` not followed by two hex digits (`order%2.md`): broken
 *   percent-escaping, where the generic "encode a space" advice would be wrong.
 * - **`raw`** — a **path segment** that is not in the canonical form
 *   ({@link isCanonicalSegment}: only RFC-3986 unreserved characters and valid
 *   `%`-escapes), or a destination-breaking character (ASCII whitespace, `(`/`)`) in
 *   the `#fragment`/`?query`. The path check is what keeps the linter and
 *   {@link encodePathSegment writer} in agreement: a raw space, paren, or any of the
 *   markdown-significant `! ' *` the writer percent-encodes is flagged, so a bundle the
 *   lint calls clean is one the writer would re-emit byte-for-byte.
 *
 * The scan still accepts a **valid but non-canonical** encoding (`a%41b.md` = `aAb.md`,
 * a lowercase `%c3`): over-encoding survives every renderer and round-trips, so it is
 * portable even though {@link normalizeLink} would not emit it. The `#fragment` is held
 * to the looser "no destination-breaker" rule, not full canonical encoding — a GitHub
 * anchor slug (`#café`) is not percent-encoded and must not be flagged.
 */
function encodingProblem(rawPath: string, suffix: string): "empty-segment" | "malformed" | "raw" | null {
  const segments = rawPath.split("/");
  for (let i = 1; i < segments.length - 1; i++) {
    if (segments[i] === "") {
      return "empty-segment"; // interior // — endpoints are a leading slash / trailing dir slash
    }
  }
  if (hasMalformedPercent(rawPath) || hasMalformedPercent(suffix)) {
    return "malformed";
  }
  if (segments.some((segment) => segment !== "" && !isCanonicalSegment(segment)) || hasRawBreaker(suffix)) {
    return "raw";
  }
  return null;
}

/** The human-readable message for an {@link encodingProblem} kind, naming the offending `target`. */
function encodingMessage(target: string, problem: "empty-segment" | "malformed" | "raw"): string {
  switch (problem) {
    case "empty-segment":
      return `link "${target}" has an empty path segment ("//"); use a single "/" separator`;
    case "malformed":
      return `link "${target}" has a malformed percent-escape (a "%" not followed by two hex digits); fix or remove it`;
    case "raw":
      return `link "${target}" has an unencoded character; percent-encode reserved characters (e.g. space -> %20)`;
  }
}

/** Whether a string carries a `%` that is not the start of a valid two-hex-digit escape. */
function hasMalformedPercent(s: string): boolean {
  return MALFORMED_PERCENT.test(s);
}

/**
 * Whether a path segment is in the canonical percent-encoded form: every character is
 * either an RFC-3986 **unreserved** char (`A-Za-z0-9-._~`, which includes the `.`/`..`
 * relative steps) or a valid `%XX` escape. This is exactly the alphabet
 * {@link encodePathSegment} can emit, so a raw space, a `(`/`)`, or any of the
 * markdown-significant `! ' *` the writer escapes makes a segment non-canonical — while an
 * over-encoded `%41` or a lowercase `%c3` still passes (both are valid `%`-escapes).
 */
function isCanonicalSegment(segment: string): boolean {
  return CANONICAL_SEGMENT.test(segment);
}

/** Whether a string carries a raw character that breaks a markdown link destination (whitespace or a paren). */
function hasRawBreaker(s: string): boolean {
  return RAW_BREAKER.test(s);
}

// ── Destination classification (shared with the bundle graph) ────────────────────

/**
 * Whether a destination is **not** an internal concept reference: empty, a bare
 * `#anchor`, a protocol-relative URL (`//host/…`), or a `scheme:`-qualified URL
 * (`http:`, `mailto:`, …, per RFC-3986 — including the pathological relative file
 * whose first segment carries a colon, which lore's canonical relative `.md` links
 * never do, ADR-0010). The single classifier shared by the portability linter
 * ({@link validateLink}) and link resolution (the bundle graph's body-link and
 * frontmatter-ref handling), so the linter and resolver agree on what counts as
 * external. ({@link normalizeLink}, the writer, takes a known concept *path* and so
 * needs no classification — it never sees an arbitrary destination.)
 */
export function isExternalTarget(s: string): boolean {
  return s === "" || s.startsWith("#") || s.startsWith("//") || URL_SCHEME.test(s);
}

/** Drop a `#fragment` (and anything after it) from a destination. */
export function stripFragment(target: string): string {
  const hash = target.indexOf("#");
  return hash === -1 ? target : target.slice(0, hash);
}

/** Drop a `?query` (and anything after it) from a destination. */
export function stripQuery(target: string): string {
  const question = target.indexOf("?");
  return question === -1 ? target : target.slice(0, question);
}

/** URL-decode a destination, degrading to the raw text if it is not valid percent-encoding. */
export function decodeTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}
