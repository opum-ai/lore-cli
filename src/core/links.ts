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
  const fromDir = posix.dirname(posix.normalize(fromPath));
  const toFile = ensureMarkdownSuffix(toPath);
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
  const normalized = posix.normalize(path);
  return /\.md$/i.test(normalized) ? `${normalized.slice(0, -3)}.md` : `${normalized}.md`;
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
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// ── Linting the canonical form ──────────────────────────────────────────────────

/**
 * The way a link destination departs from the canonical form. Each value is one
 * property of the ADR-0010 link rule, so a caller can branch on the *kind* of
 * portability problem rather than parse the message.
 */
export type LinkIssue = "leading-slash" | "missing-extension" | "unencoded";

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
 * external. One consequence of that shared rule (ADR-0010): a destination whose
 * first segment carries a colon (`notes:2026.md`) is read as a `scheme:` URL and so
 * is *not* linted — catching an accidental-colon filename is the body-text scan's
 * job (LORE-30), not this per-destination primitive's.
 *
 * The three checks mirror the three machine-checkable properties of the form (the
 * fourth, "relative", is implied by "no leading slash"; "no wikilinks" is a body
 * scan):
 *
 * - **`leading-slash`** — a `/`-absolute destination, which resolves against each
 *   consumer's differing server root.
 * - **`missing-extension`** — an internal target with **no file extension at all**
 *   (`../reference/orders`, the `#fragment`/`?query` ignored): it looks like a
 *   concept link that dropped its `.md`, which GitHub will not render to a file. A
 *   target that carries *some* other extension (`../img/x.png`) is a non-concept
 *   asset link, not a dropped-suffix concept link — matching the bundle resolver,
 *   which treats a non-`.md` target as simply *not an edge* rather than a broken
 *   one — so it is left alone.
 * - **`unencoded`** — a path segment that is not canonically percent-encoded:
 *   re-encoding its decoded form (case-insensitively, since `%C3`/`%c3` both
 *   resolve) changes it — a raw space, a raw markdown-significant `(`/`)`, or other
 *   unescaped reserved char — or it carries malformed `%` escaping. An already-
 *   encoded segment (`%20`, lowercase or upper) is clean; double-encoding is not
 *   this check's concern.
 *
 * @param target the link destination to classify (the value inside `[text](…)`).
 * @returns a {@link LinkFinding} per violation; empty when portable or external.
 */
export function validateLink(target: string): LinkFinding[] {
  const findings: LinkFinding[] = [];
  const trimmed = target.trim();
  if (isExternalTarget(trimmed)) {
    return findings; // external / anchor-only — not an internal cross-link
  }

  if (trimmed.startsWith("/")) {
    findings.push({
      target,
      issue: "leading-slash",
      message: `link "${target}" is /-absolute; use a relative path (it resolves against each consumer's differing root)`,
    });
  }

  const path = stripQuery(stripFragment(trimmed));
  // A dropped-suffix concept link has NO extension at all; a non-.md target that
  // carries some other extension is an asset link the resolver ignores, not a
  // broken concept link, so it is not flagged.
  if (path !== "" && posix.extname(path) === "") {
    findings.push({
      target,
      issue: "missing-extension",
      message: `link "${target}" is missing the .md suffix; GitHub and Obsidian link to the file and need the extension`,
    });
  }

  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      continue; // separators and relative steps carry nothing to encode
    }
    if (!isCanonicallyEncoded(segment)) {
      findings.push({
        target,
        issue: "unencoded",
        message: `link "${target}" has an unencoded path segment; percent-encode reserved characters (e.g. space -> %20)`,
      });
      break; // one finding per destination is enough to flag the form
    }
  }

  return findings;
}

/**
 * Whether a path segment is already in canonical percent-encoded form: decoding
 * then re-encoding it (via the same {@link encodePathSegment} encoder, so a raw
 * `(`/`)` is treated as un-encoded too) reproduces it. A raw space (`a b` →
 * `a%20b`) or an unescaped reserved char fails the round-trip; an already-encoded
 * `%20` survives it. Malformed escaping (`%2`) makes {@link decodeURIComponent}
 * throw and counts as not encoded — it is broken either way.
 *
 * The comparison is **case-insensitive** because percent-escapes are case-
 * insensitive per RFC-3986 (`%C3` and `%c3` both resolve, on every renderer): a
 * validly lowercase-encoded segment is portable even though the encoder emits
 * uppercase hex. Lowercasing only affects the hex digits — an unreserved letter is
 * identical on both sides of the compare — so it never accepts a genuinely
 * unencoded segment.
 */
function isCanonicallyEncoded(segment: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return false; // malformed percent-escaping is not canonical encoding
  }
  return encodePathSegment(decoded).toLowerCase() === segment.toLowerCase();
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
  return s === "" || s.startsWith("#") || s.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(s);
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
