/**
 * check.ts — the **pure** engine behind `lore check`'s link/anchor + portability passes.
 *
 * `lore check` is lore's read-only CI **drift gate** (ADR-0007). Of its four specified
 * passes, this module owns the two that are deterministic and dependency-free today:
 *
 * - **Internal cross-link + heading-anchor validation** (the gate, exit `6`): every
 *   relative `.md` link target in the bundle must resolve to a real file, and every
 *   `#fragment` must resolve to a real heading slug in the target file. A broken link or
 *   a rotted anchor is an **error** {@link CheckFinding}.
 * - **Portability lint** (advisory, warn-only): non-portable link *form* (via the shared
 *   {@link validateLink} classifier) plus a body-text scan for Obsidian-isms (wikilinks,
 *   embeds, callouts, highlights, `%%`-comments). Every such finding is a **warning** that
 *   never fails the gate on its own (ADR-0007, portable-markdown.md).
 * - **Status reconciliation + managed-block drift** (LORE-27, the gate, exit `6`): a `Story`
 *   whose persisted `status` no longer matches its live Backlog rollup, or whose
 *   `<!-- lore:tasks -->` region no longer matches what {@link regenerateTaskBlock} would
 *   produce from current task data, is drift — the same condition `lore sync` would fix by
 *   writing. {@link reconcileDriftFindings} is the pure judgment; resolving each linked task's
 *   live status (the Backlog JSON adapter) and reading each concept's on-disk bytes are
 *   command-layer IO (`commands/check.ts`, via the shared `commands/reconcile-shared.ts`
 *   gather it also feeds to `lore sync`) — ADR-0014 keeps that IO out of core. Both findings
 *   are **errors**: unlike the portability lint, drift always gates (ADR-0007), never merely
 *   advisory under `--strict`.
 *
 * External-URL liveness is opt-in and deferred (no networking in core).
 *
 * Per the core contract (lore-design §2.1) everything here is pure: `{ path, raw }` files
 * in, typed findings out — no filesystem, no printing, no flags, no `process.exit`. The
 * command layer (`commands/check.ts`) discovers and reads the bundle's files and hands
 * their bytes here; this module owns the judgement.
 *
 * ### Resolution is against the whole bundle, not just concepts
 *
 * Link existence is checked against **every `.md` file** in the bundle — concepts *and*
 * the frontmatter-free `index.md`/`log.md` hubs — not just the concept graph. This is
 * exactly what `indexes.ts` documents as required: a generated hub links to sub-indexes
 * that are *not* concepts, so resolving only against the concept map would flag every
 * correct hub link as broken. Resolving against file membership makes those reserved
 * targets resolve with no special case.
 *
 * A link whose target resolves **above the bundle root** (a `../`-escaping path, e.g. a
 * managed `lore:tasks` block's link to a `backlog/tasks/*.md` file) is **out of scope**
 * here — the bundle membership cannot see outside `docs/` — and is skipped rather than
 * reported broken, the same way an external URL is. (Those cross-bundle links arrive with
 * `lore sync`/LORE-26; validating them is that pass's concern.)
 */

import { isIP } from "node:net";
import { posix } from "node:path";
import matter from "gray-matter";
import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { extractLinkTargets, nodeText, walkMdast } from "./bundle";
import { idFromPath, normalizeInput } from "./concept";
import type { Finding, Severity } from "./finding";
import { decodeTarget, isExternalTarget, pathPart, validateLink } from "./links";
import { type ManagedTaskRow, regenerateTaskBlock } from "./managed-block";
import type { ReconciledStatus } from "./reconcile";

/** `error` fails the gate (exit `6`); `warning` is advisory (fails only under `--strict`). The shared {@link Severity}. */
export type CheckSeverity = Severity;

/**
 * Which check produced a {@link CheckFinding}. `broken-link`/`broken-anchor` and
 * `status-drift`/`managed-block-drift` are all error-tier gate findings; `portability` is the
 * warn-tier lint; `external-link` is the opt-in, non-deterministic liveness advisory
 * (`--external`) that never fails the gate (ADR-0007).
 */
export type CheckRule =
  | "broken-link"
  | "broken-anchor"
  | "status-drift"
  | "managed-block-drift"
  | "portability"
  | "external-link";

/**
 * One problem found in the bundle, attributed to the file that carries it: the shared
 * {@link Finding} (narrowed to `check`'s rules) plus that per-file attribution.
 */
export type CheckFinding = Finding<CheckRule> & {
  /** The bundle-root-relative POSIX path of the file the finding is in. */
  readonly file: string;
};

/** One bundle file handed to {@link checkBundle}: its **bundle-root-relative** path and raw bytes. */
export interface CheckInputFile {
  /** Bundle-root-relative POSIX path (e.g. `adr/0007-x.md`) — the id space links resolve within. */
  readonly path: string;
  /** The file's raw UTF-8 content (frontmatter fence included; stripped here). */
  readonly raw: string;
}

/** The aggregate result of a `lore check` run over a bundle. */
export interface CheckReport {
  /** Every deterministic finding, in file-then-document order (the gate + portability lint). */
  readonly findings: readonly CheckFinding[];
  /**
   * Total error-severity findings — the gate count. This module's own passes (`checkBundle`)
   * contribute `broken-link`/`broken-anchor`; `commands/check.ts` folds in `status-drift`/
   * `managed-block-drift` (LORE-27) on top via the same {@link tallySeverity}, so a consumer of the
   * final `check.report` should not assume this counts only link/anchor problems.
   */
  readonly errorCount: number;
  /** Total warning-severity findings (portability) — advisory. */
  readonly warningCount: number;
  /** Number of files examined. */
  readonly fileCount: number;
  /**
   * Whether every pass that was supposed to run for this report actually finished. Always `true`
   * from this module (`checkBundle`/`summarize` are fully synchronous and never partial) — it only
   * ever goes `false` in `commands/check.ts`'s emitted report, when the async status/managed-block
   * reconciliation pass (LORE-27) errors mid-run for some bundle root (a missing linked task, a bad
   * status-flow config, a malformed managed block). That failure is a real gate error and is always
   * re-thrown after emitting, but the findings collected up to that point can still have
   * `errorCount === 0` (the failure short-circuited before any finding was produced) — indistinguishable
   * from a genuinely clean, complete run without this field (LORE-112). A JSON consumer reading only
   * stdout should treat `complete: false` the same as a non-zero exit code / a caught rejection.
   */
  readonly complete: boolean;
  /**
   * Opt-in external-URL **liveness** results (`--external`), each an `external-link` warning. These
   * are **non-deterministic** (they depend on the network), so they are kept out of the gate
   * entirely: never folded into {@link errorCount}/{@link warningCount}, never affecting the exit
   * code — not even under `--strict` (ADR-0007). Absent (undefined) unless `--external` ran. Core
   * leaves this empty; the command layer fills it (the probing is network IO, ADR-0014).
   */
  readonly externalFindings?: readonly CheckFinding[];
}

/** One external URL discovered in the bundle, attributed to its file — the `--external` probe's worklist item. */
export interface ExternalLink {
  /** The bundle-root-relative POSIX path of the file the link is in. */
  readonly file: string;
  /** The external `http(s)` URL as authored. */
  readonly url: string;
}

/**
 * Collect the distinct `http(s)` link targets per file — the worklist the opt-in `--external`
 * liveness probe (command layer) fetches. Pure: it parses the same bundle bodies and returns URLs,
 * touching no network (ADR-0014). Only `http`/`https` are returned; other external schemes
 * (`mailto:`, `tel:`, protocol-relative `//host`) are not liveness-checkable and are skipped, as
 * are duplicates **within a file** (one finding per file per URL). Parsing here, rather than
 * reusing {@link checkBundle}'s internal parse, keeps that gate function's signature unpolluted by
 * the optional, non-deterministic feature.
 */
export function collectExternalLinks(files: readonly CheckInputFile[]): ExternalLink[] {
  const links: ExternalLink[] = [];
  for (const file of files) {
    const tree = fromMarkdown(bodyText(file.raw));
    const seen = new Set<string>();
    for (const target of extractLinkTargets(tree)) {
      const url = target.trim();
      if (HTTP_URL.test(url) && !seen.has(url)) {
        seen.add(url);
        links.push({ file: file.path, url });
      }
    }
  }
  return links;
}

/** An `http`/`https` URL — the only externally-probeable link scheme. */
const HTTP_URL = /^https?:\/\//i;

/**
 * Whether `ip` (a resolved IPv4 or IPv6 address, never a hostname) falls inside a loopback,
 * link-local, or private/reserved range — the destination-classification half of the
 * `--external` liveness probe's SSRF guard (LORE-71: the probe otherwise fetches any URL a
 * bundle author writes, including one pointed at a loopback/private/cloud-metadata address).
 * Pure and deterministic (no DNS, no network): the command layer resolves a URL's hostname to
 * its actual IP address(es) first (`commands/check.ts`'s injectable DNS seam — resolution
 * itself is IO, ADR-0014) and classifies each one here, BEFORE ever issuing a request for it.
 *
 * An IPv4 address is checked in its IPv4-mapped IPv6 form (`::ffff:a.b.c.d`) alongside every
 * native IPv6 range (via {@link addressToBigInt}'s uniform 128-bit space), so an attacker can't
 * dodge an IPv4-only blocklist by requesting the exact same address spelled as its IPv6-mapped
 * equivalent — a well-known SSRF-filter bypass technique.
 *
 * Not an exhaustive IANA special-purpose-registry sweep (documentation ranges like
 * `192.0.2.0/24` are omitted as low real-world SSRF risk) — scoped to the ranges an attacker
 * can actually reach something interesting through: loopback, link-local (where the canonical
 * cloud-metadata address `169.254.169.254` lives), RFC1918 private space, and carrier-grade NAT.
 */
export function classifyAddress(ip: string): { readonly blocked: boolean; readonly reason?: string } {
  const value = addressToBigInt(ip);
  if (value === null) {
    return { blocked: true, reason: `"${ip}" is not a valid IP address literal` };
  }
  for (const range of BLOCKED_ADDRESS_RANGES) {
    if (value >= range.start && value <= range.end) {
      return { blocked: true, reason: range.label };
    }
  }
  return { blocked: false };
}

/** One inclusive `[start, end]` range in the unified 128-bit (IPv4-mapped) address space {@link addressToBigInt} produces. */
interface AddressRange {
  readonly start: bigint;
  readonly end: bigint;
  readonly label: string;
}

/** The fixed top-96-bit prefix of an IPv4-mapped IPv6 address (`::ffff:0:0/96`) — where an IPv4 value sits once unified into the 128-bit space. */
const V4_MAPPED_PREFIX = 0xffffn << 32n;

/** An IPv4 CIDR range (e.g. `v4Range("10.0.0.0", 8, ...)`), expressed as an {@link AddressRange} in the unified (IPv4-mapped) space. */
function v4Range(base: string, prefixBits: number, label: string): AddressRange {
  const start = v4ToBigInt(base);
  if (start === null) {
    throw new Error(`invalid IPv4 literal in a hard-coded range table: ${base}`);
  }
  const hostBits = BigInt(32 - prefixBits);
  const mask = (1n << hostBits) - 1n;
  const network = start & ~mask;
  return { start: V4_MAPPED_PREFIX | network, end: V4_MAPPED_PREFIX | (network | mask), label };
}

/** A native IPv6 CIDR range (e.g. `v6Range("fe80::", 10, ...)`), expressed as an {@link AddressRange}. */
function v6Range(base: string, prefixBits: number, label: string): AddressRange {
  const start = v6ToBigInt(base);
  if (start === null) {
    throw new Error(`invalid IPv6 literal in a hard-coded range table: ${base}`);
  }
  const hostBits = BigInt(128 - prefixBits);
  const mask = (1n << hostBits) - 1n;
  const network = start & ~mask;
  return { start: network, end: network | mask, label };
}

/**
 * Loopback, link-local, and private/reserved ranges refused by default (LORE-71 AC1): IPv4's
 * "this network" (`0.0.0.0/8`), RFC1918 private space, carrier-grade NAT (`100.64.0.0/10`, used
 * by some cloud metadata reachability paths), loopback, and link-local — plus their IPv6
 * counterparts (loopback, unspecified, link-local, unique-local).
 *
 * The last two entries block two LEGACY IPv6 forms wholesale, not by re-deriving whether their
 * embedded IPv4 address happens to be blocked: the deprecated "IPv4-compatible" form (`::/96`,
 * e.g. `::169.254.169.254` — textually similar to but numerically DISTINCT from the IPv4-MAPPED
 * form `::ffff:a.b.c.d` this file already unifies into the IPv4 table) and the NAT64 well-known
 * prefix (`64:ff9b::/96`, RFC 6052 — a NAT64 gateway on some IPv6-only networks translates any
 * address in this range to its embedded IPv4 destination). An independent adversarial review
 * confirmed neither form is honored as "reach the embedded IPv4 address" by a plain `fetch()` on
 * an ordinary (non-NAT64) network — so this is defense-in-depth for an IPv6-only/NAT64-configured
 * runner, not a fix for a demonstrated bypass on typical CI. Blocking the WHOLE `::/96` block
 * (rather than trying to re-classify its embedded 32 bits) is deliberate: both mechanisms are
 * deprecated/translation-only address spaces with no legitimate use for checking a documentation
 * link, and `::/96` numerically also contains `::`/`::1` themselves (same values, different
 * spellings) — re-deriving "is the embedded IPv4 blocked" for those two would incorrectly treat
 * the IPv6 loopback/unspecified addresses as if they meant IPv4 `0.0.0.1`/`0.0.0.0`, which is not
 * how either address is actually used in practice.
 */
const BLOCKED_ADDRESS_RANGES: readonly AddressRange[] = [
  v4Range("0.0.0.0", 8, "this-network (0.0.0.0/8)"),
  v4Range("10.0.0.0", 8, "private (10.0.0.0/8)"),
  v4Range("100.64.0.0", 10, "carrier-grade NAT (100.64.0.0/10)"),
  v4Range("127.0.0.0", 8, "loopback (127.0.0.0/8)"),
  v4Range("169.254.0.0", 16, "link-local (169.254.0.0/16)"),
  v4Range("172.16.0.0", 12, "private (172.16.0.0/12)"),
  v4Range("192.168.0.0", 16, "private (192.168.0.0/16)"),
  v6Range("::1", 128, "loopback (::1)"),
  v6Range("::", 128, "unspecified (::)"),
  v6Range("fe80::", 10, "link-local (fe80::/10)"),
  v6Range("fc00::", 7, "unique-local (fc00::/7)"),
  v6Range("::", 96, "deprecated IPv4-compatible form (::/96)"),
  v6Range("64:ff9b::", 96, "NAT64 well-known prefix (64:ff9b::/96)"),
];

/**
 * Parse any well-formed IPv4 or IPv6 address literal into a single 128-bit value for uniform
 * range comparison. IPv4 is mapped into `::ffff:a.b.c.d`'s numeric space so an IPv4 address and
 * its IPv6-mapped spelling always compare equal (see {@link classifyAddress}). Returns `null`
 * for anything that isn't a well-formed address literal — a hostname must be DNS-resolved to an
 * address first; this function never does name resolution (it is pure, no IO).
 */
function addressToBigInt(ip: string): bigint | null {
  const family = isIP(ip);
  if (family === 4) {
    return v4ToBigInt(ip);
  }
  if (family === 6) {
    return v6ToBigInt(ip);
  }
  return null;
}

/** Parse a well-formed IPv4 literal (`node:net`'s `isIP` already confirmed the shape) into its IPv4-mapped 128-bit value. */
function v4ToBigInt(ip: string): bigint | null {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return null;
  }
  let value = 0n;
  for (const o of octets) {
    value = (value << 8n) | BigInt(o);
  }
  return V4_MAPPED_PREFIX | value;
}

/**
 * Parse a well-formed IPv6 literal into its native 128-bit value, expanding `::` compression
 * and an embedded IPv4 dotted-quad tail (`::ffff:127.0.0.1`) the same way a real socket
 * connection would resolve it.
 */
function v6ToBigInt(ip: string): bigint | null {
  const core = ip.split("%")[0] ?? ip; // strip a zone id, e.g. `fe80::1%eth0`
  const halves = core.split("::");
  if (halves.length > 2) {
    return null;
  }
  const parseGroups = (segment: string): number[] | null => {
    if (segment === "") {
      return [];
    }
    const parts = segment.split(":");
    const groups: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] as string;
      if (i === parts.length - 1 && part.includes(".")) {
        const embedded = v4ToBigInt(part);
        if (embedded === null) {
          return null;
        }
        const v4Bits = embedded & 0xffffffffn;
        groups.push(Number((v4Bits >> 16n) & 0xffffn), Number(v4Bits & 0xffffn));
        continue;
      }
      if (part === "") {
        return null;
      }
      const value = Number.parseInt(part, 16);
      if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        return null;
      }
      groups.push(value);
    }
    return groups;
  };
  const head = parseGroups(halves[0] ?? "");
  if (head === null) {
    return null;
  }
  let full: number[];
  if (halves.length === 2) {
    const tail = parseGroups(halves[1] ?? "");
    if (tail === null) {
      return null;
    }
    const missing = 8 - head.length - tail.length;
    if (missing < 0) {
      return null;
    }
    full = [...head, ...new Array(missing).fill(0), ...tail];
  } else {
    full = head;
  }
  if (full.length !== 8) {
    return null;
  }
  let value = 0n;
  for (const g of full) {
    value = (value << 16n) | BigInt(g);
  }
  return value;
}

/**
 * Run the link/anchor + portability passes over a whole bundle and aggregate the findings.
 * Pure over its inputs (the command layer does the reading), so the resolution and slug
 * logic are testable without the filesystem.
 *
 * Two passes over the files: the first parses every file **once** and indexes its
 * heading-slug set under its bundle-relative id; the second resolves each file's
 * links/anchors against that index (the id set is the bundle membership the link gate
 * resolves against) and runs the portability lint over the same parsed tree. The split is
 * what lets a link resolve to a file walked *after* the linking file (a forward reference)
 * — every member is known before any link is checked — and the single parse per file is
 * shared across the heading, link, and portability consumers.
 */
export function checkBundle(files: readonly CheckInputFile[]): CheckReport {
  // Pass 1 — index: parse each file's body once into an mdast tree, keyed by bundle-relative
  // id, and record its heading-slug set. The id key set is the membership; every file is
  // indexed before any link is checked, so a forward reference resolves.
  const prepared: { file: CheckInputFile; tree: Nodes; id: string }[] = [];
  const slugsById = new Map<string, ReadonlySet<string>>();
  for (const file of files) {
    const tree = fromMarkdown(bodyText(file.raw));
    const id = idFromPath(file.path);
    prepared.push({ file, tree, id });
    slugsById.set(id, extractHeadingSlugs(tree));
  }

  // Pass 2 — judge: per file, the link/anchor gate then the portability lint, over the one
  // shared parse. Membership is `slugsById` itself — every file id is a key.
  const findings: CheckFinding[] = [];
  for (const { file, tree, id } of prepared) {
    const dir = posix.dirname(file.path);
    const targets = extractLinkTargets(tree);
    for (const target of targets) {
      findings.push(...linkFindings(target, file.path, dir, id, slugsById));
    }
    for (const target of targets) {
      for (const finding of validateLink(target)) {
        findings.push({ severity: "warning", rule: "portability", file: file.path, message: finding.message });
      }
    }
    findings.push(...portabilityScan(tree, file.path));
  }

  return summarize(findings, files.length);
}

// ── Status + managed-block drift (the gate) ──────────────────────────────────────

/** One `tasks:`-linked concept's already-resolved reconciliation data, for {@link reconcileDriftFindings}. */
export interface ReconcileDriftInput {
  /** The bundle-relative POSIX path of the concept, attributed on any finding (bundle-label-prefixed by the caller in multi-root mode). */
  readonly path: string;
  /** The concept's persisted `frontmatter.status`, as currently on disk. */
  readonly currentStatus: unknown;
  /** The recomputed status (`core/reconcile.ts`'s `reconcileStatus`); `null` only if the caller passes a concept with no linked tasks (never drift either way). */
  readonly newStatus: ReconciledStatus | null;
  /** The concept's full raw file bytes, as currently on disk (LF-normalized). */
  readonly original: string;
  /** The linked tasks' live data, in the concept's `tasks:` order — {@link regenerateTaskBlock}'s `rows`. */
  readonly rows: readonly ManagedTaskRow[];
  /** The concept's repo-relative path, for {@link regenerateTaskBlock}'s link computation. */
  readonly docPath: string;
  /**
   * Whether `lore sync` would actually reconcile this concept if run — `sync` only ever operates on
   * the default `docs/` bundle (no concept of an alternate root today), while `check` also supports
   * checking any named bundle root (LORE-30's multi-root discovery). Decided by the command layer
   * (which knows the bundle root as the user actually named it, canonicalized) rather than guessed
   * here from `docPath`'s string shape — a non-canonical but equivalent spelling of the default root
   * (`./docs`, a trailing slash) must not silently omit the hint.
   */
  readonly fixable: boolean;
}

/**
 * The drift findings for one already-reconciled concept: a **status-drift** error when the
 * recomputed status differs from what is persisted, and a **managed-block-drift** error when
 * re-rendering the `<!-- lore:tasks -->` region from `rows` would change the file's bytes. Both
 * are independent — a concept can have one, both, or neither — and both are `error` severity
 * (ADR-0007: this gate is not a `--strict`-only advisory, unlike the portability lint).
 *
 * Reuses the exact pure engines `lore sync` writes with ({@link reconcileStatus},
 * {@link regenerateTaskBlock}) so drift can never differ from what a `sync` run would fix.
 *
 * @throws LoreError `validation` (exit 6) — {@link regenerateTaskBlock}'s own contract — when the
 *   concept's managed-block markers are missing, duplicated, or crossed; `check` refuses to guess
 *   at a corrupted region rather than reporting a soft finding for it, the read-time mirror of
 *   `sync`'s "never writes a partial block."
 */
export function reconcileDriftFindings(input: ReconcileDriftInput): CheckFinding[] {
  if (input.newStatus === null) {
    // No linked tasks to roll up or render a managed block from — the documented "never drift
    // either way" contract (this interface's own `newStatus` doc comment). Neither drift check
    // below is meaningful without a recomputed status, so both are skipped together rather than
    // letting the managed-block regeneration run unconditionally on a concept this function has
    // nothing to reconcile.
    return [];
  }
  const fixable = input.fixable;
  const findings: CheckFinding[] = [];
  if (input.newStatus !== input.currentStatus) {
    // `status:` is schema-nullish (profile.ts's optional fields accept both an OMITTED key --
    // `undefined` -- and an explicit empty/`null` scalar), and `JSON.stringify` renders each
    // inconsistently: `undefined` becomes the bare, unquoted word "undefined" (not a string at all),
    // while `null` at least stringifies correctly but reads as the literal word "null" rather than
    // "no status set yet". Both are normalized to the same friendly placeholder, distinctly from
    // `newStatus`'s always-quoted form.
    const currentDisplay =
      input.currentStatus === undefined || input.currentStatus === null
        ? "(unset)"
        : JSON.stringify(input.currentStatus);
    const hint = fixable ? " — run `lore sync` to reconcile" : "";
    findings.push({
      severity: "error",
      rule: "status-drift",
      file: input.path,
      message: `status is ${currentDisplay} but the linked tasks recompute to ${JSON.stringify(input.newStatus)}${hint}`,
    });
  }
  const regenerated = regenerateTaskBlock(input.original, input.rows, { docPath: input.docPath });
  if (regenerated !== input.original) {
    const hint = fixable ? " — run `lore sync` to regenerate it from live task data" : "";
    findings.push({
      severity: "error",
      rule: "managed-block-drift",
      file: input.path,
      message: `the <!-- lore:tasks --> block is stale${hint}`,
    });
  }
  return findings;
}

// ── Link / anchor resolution (the gate) ──────────────────────────────────────────

/**
 * The error findings for one body-link **destination**: a broken internal cross-link
 * (target file not in the bundle) or a rotted anchor (`#fragment` resolving to no heading
 * in the target). Returns `[]` for anything out of the gate's scope — external URLs,
 * non-`.md` assets, and cross-bundle (`../`-escaping) targets.
 *
 * A **same-file** anchor (`[jump](#section)`, a destination that is *only* a fragment) is
 * validated against the linking file's own headings, so in-page anchor rot is caught too.
 */
function linkFindings(
  target: string,
  file: string,
  dir: string,
  fromId: string,
  slugsById: ReadonlyMap<string, ReadonlySet<string>>,
): CheckFinding[] {
  const trimmed = target.trim();
  const fragment = fragmentOf(trimmed);
  const path = pathPart(trimmed);

  if (path === "") {
    // A pure `#fragment` — an in-page anchor; resolve it against this file's own headings.
    return anchorFindings(target, file, fromId, fragment, slugsById);
  }
  if (isExternalTarget(path)) {
    return []; // external scheme / protocol-relative — not an internal cross-link
  }
  const decoded = decodeTarget(path);
  if (!/\.md$/i.test(decoded)) {
    return []; // a non-`.md` asset link — not a concept edge (matches the bundle resolver)
  }
  // A `/`-absolute destination resolves against the bundle root, not the linking file's
  // directory (it is non-portable — `validateLink` warns — but its existence is judged from
  // the root so the broken-link message names the path the author meant). A relative path
  // joins to the linking dir as usual.
  const resolved = posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : posix.join(dir, decoded));
  if (resolved === ".." || resolved.startsWith("../")) {
    return []; // escapes the bundle root — a cross-bundle link, out of scope for this pass
  }
  const targetId = idFromPath(resolved);
  if (!slugsById.has(targetId)) {
    return [
      {
        severity: "error",
        rule: "broken-link",
        file,
        message: `link "${target}" points at "${targetId}.md", which is not in the bundle`,
      },
    ];
  }
  return anchorFindings(target, file, targetId, fragment, slugsById);
}

/**
 * The broken-anchor finding (if any) for a resolved target: an **error** when a non-empty
 * `fragment` resolves to no heading slug in the target file (`targetId`). An empty fragment
 * (a plain file link) is clean. The fragment is only percent-decoded before the compare — it
 * is **not** lower-cased. {@link slugify} already produces lower-case GitHub-style slugs, so a
 * fragment that differs from the real anchor only in case (`#My-Section` vs. slug
 * `my-section`) must still miss: GitHub (and every other case-sensitive anchor consumer) never
 * normalizes the href fragment, so a case mismatch is a real broken anchor, not a cosmetic one.
 */
function anchorFindings(
  target: string,
  file: string,
  targetId: string,
  fragment: string,
  slugsById: ReadonlyMap<string, ReadonlySet<string>>,
): CheckFinding[] {
  const anchor = decodeTarget(fragment);
  if (anchor === "") {
    return [];
  }
  const slugs = slugsById.get(targetId);
  if (slugs?.has(anchor)) {
    return [];
  }
  return [
    {
      severity: "error",
      rule: "broken-anchor",
      file,
      message: `link "${target}" has anchor "#${fragment}", which is not a heading in "${targetId}.md"`,
    },
  ];
}

/** The fragment of a destination — the text after its first `#`, or `""` when it has none. */
function fragmentOf(target: string): string {
  const hash = target.indexOf("#");
  return hash === -1 ? "" : target.slice(hash + 1);
}

// ── Heading anchors (GitHub-style slugs) ─────────────────────────────────────────

/**
 * The set of heading-anchor slugs a markdown body exposes, computed the way **GitHub** —
 * the reference renderer (portable-markdown.md) — derives them: each heading's text is
 * {@link slugify}d, and a repeated slug gets a `-1`/`-2`/… disambiguator in document
 * order. Other renderers (MkDocs, Docusaurus) may slug differently; `lore check` validates
 * against the GitHub slug because that is the form lore writes and the matrix targets.
 *
 * Headings are read from an already-parsed mdast tree (shared with the link and portability
 * passes) and walked with the stack-safe {@link walkMdast}, so a `#` inside a fenced/indented
 * code block is not mistaken for a heading. A string overload is offered for tests.
 */
export function extractHeadingSlugs(source: Nodes | string): ReadonlySet<string> {
  const tree = typeof source === "string" ? fromMarkdown(source) : source;
  const seen = new Map<string, number>();
  const slugs = new Set<string>();
  walkMdast(tree, (node) => {
    if (node.type === "heading") {
      slugs.add(uniqueSlug(slugify(nodeText(node)), seen));
    }
  });
  return slugs;
}

/**
 * Slugify heading text the GitHub way: lower-case, drop punctuation (keeping letters,
 * numbers, spaces, `-`, and `_`), then turn each space into a hyphen. Unicode letters and
 * numbers survive (`Café` → `café`); double spaces become double hyphens, matching GitHub.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .replace(/ /g, "-");
}

/**
 * GitHub's per-document slug de-duplication (the github-slugger algorithm): the first
 * occurrence of a base slug is used verbatim; each later occurrence appends `-N` with an
 * incrementing per-base counter — but, crucially, if that candidate **collides with a slug
 * already taken** (a natural slug or an earlier disambiguation), the counter keeps advancing
 * until a free one is found. So headings `Release`, `Release 1`, `Release` yield
 * `release`, `release-1`, `release-2` — *not* a second `release-1` that would shadow the
 * real one and falsely fail a `#release-2` anchor. Every produced slug is registered (count
 * `0`) so a later natural collision is itself disambiguated. `seen` carries state across one
 * document.
 */
function uniqueSlug(base: string, seen: Map<string, number>): string {
  let slug = base;
  if (seen.has(base)) {
    let count = seen.get(base) ?? 0;
    do {
      count++;
      slug = `${base}-${count}`;
    } while (seen.has(slug));
    seen.set(base, count);
  }
  seen.set(slug, 0);
  return slug;
}

// ── Portability lint (warn-only body-text scan) ──────────────────────────────────

/** One non-portable-syntax detector: a global regex over body text, and the warning it raises. */
interface Detector {
  readonly re: RegExp;
  readonly describe: (match: RegExpExecArray) => string;
}

/**
 * The Obsidian-ism detectors (portable-markdown.md). Each renders as literal characters (or
 * not at all) outside Obsidian, so lore detects and **warns** — it never rewrites. Wikilinks,
 * embeds, and callouts are LORE-30 AC#2; highlights and `%%`-comments round out the
 * low-false-positive subset of the portable-markdown.md table.
 *
 * The patterns are tuned to flag the real syntax without crying wolf on ordinary prose:
 * wikilinks/embeds (`[[…]]`/`![[…]]`), highlights (`==…==`), and `%%`-comments are
 * distinctive enough to match anywhere in a text node, but a **callout** (`[!type]`) is only
 * a callout at the **start** of a blockquote line, so its pattern is anchored to the start of
 * the text node — a literal `[!important]` mid-sentence is left alone (it renders portably). (The
 * Obsidian **block-reference** `^id`, the MDX raw-`<`/`{` hazard, and the `_`-prefix/`.mdx`
 * filename rules are handled separately — {@link blockReferenceFinding}, {@link mdxHazardFindings},
 * and the command layer — not as body-text regexes, because each needs structural context a
 * per-text-node regex cannot see.)
 */
const DETECTORS: readonly Detector[] = [
  {
    // `![[embed]]` before `[[wikilink]]` so the leading `!` is attributed to the embed.
    re: /(!?)\[\[[^\]\n]*\]\]/g,
    describe: (m) =>
      m[1] === "!"
        ? `non-portable embed "${m[0]}"; use a normal markdown link or image (renders literally off Obsidian)`
        : `non-portable wikilink "${m[0]}"; use the relative .md link form (renders literally off Obsidian)`,
  },
  {
    // Anchored to the start of the text node: a real callout is `> [!type]`, where the
    // blockquote marker is stripped and the paragraph's first text starts with `[!type]`.
    re: /^\s*\[!([A-Za-z][\w-]*)\]/g,
    describe: (m) => `non-portable callout "[!${m[1]}]"; GitHub shows it as a plain blockquote with literal text`,
  },
  {
    re: /==[^=\n]+==/g,
    describe: (m) => `non-portable highlight "${m[0]}"; renders literally off Obsidian — use bold/italic`,
  },
  {
    re: /%%[^\n]*?%%/g,
    describe: () => `non-portable Obsidian comment "%% … %%"; use an HTML comment <!-- … -->, which hides everywhere`,
  },
];

/**
 * An Obsidian block-reference marker `^id`, matched only at the very **end of its block**: the
 * caret must be preceded by whitespace or the block start (so `x^2`, a GFM footnote `[^1]`, and any
 * mid-prose caret are spared) and the id — which may be digit-leading, e.g. `^3f9a2b` — runs to the
 * end. This is judged against a **block's last text child** (see {@link blockReferenceFinding}), not
 * an arbitrary text node, so `see note ^id **bold**` (where the caret is mid-paragraph, before the
 * bold) is *not* flagged. The `[[note#^id]]` reference form is already caught by the wikilink detector.
 */
const BLOCK_REFERENCE = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9-]*)$/;

/**
 * The portability warnings for a body's prose: the {@link DETECTORS Obsidian-ism detectors} plus
 * the {@link mdxHazardFindings MDX-safety} scan, over the parsed tree. The Obsidian detectors run
 * over **text nodes only** — scanning text (never `inlineCode`/`code`) excludes fenced and inline
 * code for free, so a `[[x]]` inside a code span is correctly left alone — while the MDX scan also
 * inspects raw-`html` nodes (the form CommonMark pulls a `<tag>` out of the text as), skipping
 * HTML comments.
 */
function portabilityScan(tree: Nodes, file: string): CheckFinding[] {
  const findings: CheckFinding[] = [];
  walkMdast(tree, (node) => {
    if (node.type === "text") {
      for (const detector of DETECTORS) {
        detector.re.lastIndex = 0;
        let match: RegExpExecArray | null = detector.re.exec(node.value);
        while (match !== null) {
          findings.push({ severity: "warning", rule: "portability", file, message: detector.describe(match) });
          match = detector.re.exec(node.value);
        }
      }
    }
    findings.push(...blockReferenceFinding(node, file));
    findings.push(...mdxHazardFindings(node, file));
  });
  return findings;
}

/**
 * The Obsidian block-reference warning for a block, judged from its **last inline child** so the
 * `^id` marker is only flagged when it truly ends the block ({@link BLOCK_REFERENCE}). Only a
 * `paragraph` is inspected — the block kind an Obsidian `^id` attaches to (a list item's text lives
 * in a nested paragraph, so it is covered too) — and only when that paragraph's last child is a text
 * node ending in `^id`. A caret followed by inline formatting (`^id **bold**`, where the last child
 * is the `strong`, not text) or sitting mid-prose is therefore not a false positive.
 */
function blockReferenceFinding(node: Nodes, file: string): CheckFinding[] {
  if (node.type !== "paragraph") {
    return [];
  }
  const last = node.children.at(-1);
  if (last?.type !== "text") {
    return [];
  }
  const match = BLOCK_REFERENCE.exec(last.value.trimEnd());
  if (match === null) {
    return [];
  }
  return [
    {
      severity: "warning",
      rule: "portability",
      file,
      message: `non-portable Obsidian block reference "^${match[1]}"; renders literally off Obsidian — link to a heading anchor instead`,
    },
  ];
}

/**
 * MDX-safety warnings (portable-markdown.md §MDX): Docusaurus parses Markdown as **MDX**, where a
 * raw `<` starts a JSX element and a raw `{` a JSX expression — so un-escaped, non-code `<`/`{` in
 * prose make its build throw even though the same source renders fine on GitHub/Obsidian/MkDocs.
 * lore detects (never escapes) two shapes, one finding apiece to keep the report readable:
 *
 * - a `<` or `{` CommonMark left literal in a **text** node (`temperature < 0`, `{ "k": 1 }`);
 * - a raw-`html` node that carries any non-comment markup (`<T>`, `<div>`, `<Component>` — what
 *   CommonMark pulled out of the text as inline/block HTML). HTML **comments** (`<!-- … -->`) are
 *   portable and are what lore writes for its managed regions, so they are stripped first; a node
 *   that is *only* comments is left alone, but `<!-- … --><div>` still flags the `<div>`.
 *
 * Code spans/blocks are `inlineCode`/`code` nodes, never `text`/`html`, so they never reach here.
 */
function mdxHazardFindings(node: Nodes, file: string): CheckFinding[] {
  const findings: CheckFinding[] = [];
  if (node.type === "text") {
    if (node.value.includes("<")) {
      findings.push(mdxHazard(file, "<"));
    }
    if (node.value.includes("{")) {
      findings.push(mdxHazard(file, "{"));
    }
  } else if (node.type === "html" && node.value.replace(HTML_COMMENT, "").trim() !== "") {
    findings.push({
      severity: "warning",
      rule: "portability",
      file,
      message: `non-portable raw HTML "${clip(node.value)}"; the portable subset has no raw HTML outside comments, and MDX (Docusaurus) parses it as JSX`,
    });
  }
  return findings;
}

/** An HTML comment span — stripped before judging whether an `html` node carries real (non-comment) markup. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** One MDX raw-character warning, naming the hazard and the portable escape. */
function mdxHazard(file: string, ch: "<" | "{"): CheckFinding {
  const role = ch === "<" ? "a JSX/HTML element" : "a JSX expression";
  const entity = ch === "<" ? "&lt;" : "&#123;";
  return {
    severity: "warning",
    rule: "portability",
    file,
    message: `non-portable raw "${ch}" in prose; MDX (Docusaurus) reads it as the start of ${role} — escape it (${entity}) or wrap the text in backticks`,
  };
}

/** Collapse whitespace and clip a raw-HTML snippet to a single readable line for a finding message. */
function clip(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 50 ? `${flat.slice(0, 50)}…` : flat;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Tally findings into the aggregate {@link CheckReport} counts. `checkBundle` is fully synchronous and never partial, so `complete` is always `true` here — only `commands/check.ts` ever sets it `false` (LORE-112). */
function summarize(findings: readonly CheckFinding[], fileCount: number): CheckReport {
  const { errorCount, warningCount } = tallySeverity(findings);
  return { findings, errorCount, warningCount, fileCount, complete: true };
}

/**
 * Count `error`/`warning` findings — the one shared tally every aggregation reuses (this module's
 * own {@link summarize}, and `commands/check.ts`'s multi-bundle and drift-merge aggregations), so a
 * future severity-tier change is one edit, not a hunt across three near-identical loops.
 */
export function tallySeverity(findings: readonly CheckFinding[]): { errorCount: number; warningCount: number } {
  let errorCount = 0;
  let warningCount = 0;
  for (const finding of findings) {
    if (finding.severity === "error") {
      errorCount++;
    } else {
      warningCount++;
    }
  }
  return { errorCount, warningCount };
}

/**
 * The markdown **body** of a file — its content with a leading YAML frontmatter fence
 * removed — so heading and link extraction see the same body for a concept (frontmatter
 * stripped) and a frontmatter-free `index.md`/`log.md` (returned unchanged). Stripping the
 * fence matters: a `#`-prefixed YAML comment inside it would otherwise parse as a phantom
 * heading.
 *
 * Reuses the canonical parse boundary rather than re-rolling one: normalizeInput (the concept
 * parser's BOM/CRLF/leading-whitespace normalization) then gray-matter — the same fence split
 * concept.ts uses — so `lore check` and the parser cannot disagree on where a body begins.
 * gray-matter throws only on unparseable YAML; there the gate degrades to scanning the whole
 * (normalized) file rather than crashing — a genuinely malformed concept is `lore validate`'s
 * error to report, not `check`'s to die on. A file with no frontmatter (or no closing fence)
 * yields its whole content as the body.
 */
function bodyText(raw: string): string {
  const normalized = normalizeInput(raw);
  try {
    return matter(normalized).content;
  } catch {
    return normalized;
  }
}
