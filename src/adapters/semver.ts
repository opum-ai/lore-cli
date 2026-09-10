/**
 * adapters/semver.ts — the one release-triple parser and comparator every tracker adapter's
 * minimum-version floor uses (LCLI-356).
 *
 * Extracted from `adapters/backlog.ts`, which has had this exact pair since LORE-26, rather than
 * copied into `adapters/quest.ts` alongside it. Quest's gate previously avoided needing one by
 * matching an exact-match allowlist of version strings — which is precisely the design this module
 * replaces, because a frozen set goes stale the moment the other package ships a patch release, and
 * two independently released packages then cannot be used together until a third release
 * reconciles them.
 *
 * Deliberately NOT a general semver implementation. It reads the numeric `major.minor.patch` triple
 * and ignores pre-release and build metadata entirely, because that is all a floor comparison
 * needs; a `0.3.0-rc.1` therefore compares equal to `0.3.0`. Adding real pre-release precedence
 * would be a behavior change for Backlog's long-standing floor, not a neutral cleanup, so it stays
 * out until something actually requires it.
 */

/** A parsed semantic version — just the numeric release triple a floor comparison needs. */
export interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The normalized `"major.minor.patch"` string, echoed into a capability's reported version. */
  readonly raw: string;
}

/**
 * Parse the leading `major.minor.patch` from a CLI's `--version` output. Both `backlog` and `quest`
 * print a **bare** semver plus a trailing newline (`"1.47.1\n"`, `"0.2.9\n"`) — no `v` prefix, no
 * program name — so this anchors at the start of the trimmed string and ignores any
 * pre-release/build suffix. Returns `null` when the output is not a recognizable semver (an empty
 * string, a name-prefixed line, garbage), which every caller treats as a fail-loud condition rather
 * than guessing.
 */
export function parseSemver(output: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(output.trim());
  if (!match) {
    return null;
  }
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), raw: `${major}.${minor}.${patch}` };
}

/** Order two {@link Semver}s by release triple: negative if `a < b`, positive if `a > b`, else `0`. */
export function compareSemver(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Whether `output` reports a version at or above `floor`. Returns the parsed version so a caller can
 * echo the exact triple it accepted, or `null` when the output is not a semver at all — which is a
 * different failure from "too old" and every caller reports it differently.
 *
 * `floor` is a literal owned by the calling adapter, so a malformed floor is a programming error
 * rather than a runtime condition: it throws instead of silently accepting everything, which is the
 * failure mode a `parseSemver(floor) ?? accept` shortcut would have.
 */
export function atLeast(output: string, floor: string): { version: Semver; ok: boolean } | null {
  const parsedFloor = parseSemver(floor);
  if (parsedFloor === null) {
    throw new Error(`invalid minimum-version floor ${JSON.stringify(floor)}`);
  }
  const version = parseSemver(output);
  if (version === null) {
    return null;
  }
  return { version, ok: compareSemver(version, parsedFloor) >= 0 };
}
