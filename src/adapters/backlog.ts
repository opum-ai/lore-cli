/**
 * adapters/backlog.ts — the **only** place a `backlog` subprocess is spawned (design spec §2.3, §8).
 *
 * This is the Backlog subprocess seam: the second of lore's three injectable determinism seams
 * (the clock and the git history seam are the others; lore-design §8). Everything that shells out to
 * the `backlog` binary flows through the {@link BacklogSpawn} interface here, so unit and golden tests
 * inject a fake that returns fixed output instead of driving a real subprocess.
 *
 * **Scope (LORE-4).** This file currently ships only the **capability probe** — the fail-loud gate
 * that asserts the `backlog` on PATH is a `--json`-capable build before any coupling feature relies on
 * it. The full typed read/write adapter (`task list`/`view`/`search` parsing, status mapping, the
 * `doc:<id>` back-reference) is **LORE-21**; it extends this same file, building typed reads on top of
 * the {@link BacklogSpawn} seam and the probe seeded here. Keeping the probe here (rather than a second
 * spawning module) preserves the design-spec invariant that this is the *only* backlog subprocess seam.
 *
 * Normative contract: docs/reference/backlog-cli-contract.md §5 (capability probe) and
 * docs/reference/backlog-json-schema.md (the `{schemaVersion, kind, data}` envelope). Where those two
 * documents disagree, the JSON schema reference — mirrored by the fork's actual output — wins: the
 * envelope carries `schemaVersion: "1"` (a string) and `kind: "taskList"` (camelCase), which is what
 * the probe asserts. (The CLI contract's prose `"task-list"` is a documentation slip, tracked in LORE-4.)
 */

import { errnoCode, LoreError } from "../errors";

/**
 * The **binary version floor** the probe requires (`backlog --version`, contract §5 step 3). Pinned to
 * the fork's base release — the tested floor. Note this alone cannot distinguish the fork from stock:
 * stock v1.47.1 reports the same version. The `--json` envelope parse (step 4 below) is the real
 * discriminator — stock rejects `--json` as an unknown option and exits non-zero.
 */
export const MIN_BACKLOG_VERSION = "1.47.1";

/**
 * The `schemaVersion` the probe recognizes. The envelope is an **additive-only** versioned contract
 * (backlog-json-schema.md §2): unknown *extra keys* are tolerated, but an unrecognized `schemaVersion`
 * bump fails the probe rather than risking a mis-read (contract §5).
 */
export const EXPECTED_SCHEMA_VERSION = "1";

/** The `kind` a `backlog task list --json` envelope must carry (backlog-json-schema.md §4). */
const TASK_LIST_KIND = "taskList";

/** The default binary name resolved from PATH. */
const BACKLOG_BINARY = "backlog";

/**
 * The result of one `backlog` invocation as the {@link BacklogSpawn} seam surfaces it. The minimal,
 * deterministic projection the probe needs: an exit code plus captured streams. A fake returns a fixed
 * one; the real {@link bunBacklogSpawn} builds it from `Bun.spawn`.
 */
export interface SpawnResult {
  /** The process exit code (`0` on success). */
  readonly exitCode: number;
  /** Everything the process wrote to stdout (the JSON envelope, or the bare `--version` line). */
  readonly stdout: string;
  /** Everything the process wrote to stderr (human diagnostics; never parsed as data). */
  readonly stderr: string;
}

/**
 * The injectable Backlog subprocess seam (design spec §8). Callers hand the probe a `BacklogSpawn`
 * rather than a hardcoded `Bun.spawn`, so tests inject a fake returning canned {@link SpawnResult}s
 * (or throwing an `ENOENT`-coded error to simulate a missing binary). `args` are the arguments after
 * the binary name — e.g. `["--version"]` or `["task", "list", "--json"]`; the binary itself is bound
 * inside the implementation. The returned promise **rejects** only when the process could not be
 * spawned at all (e.g. `ENOENT`); a process that ran and failed resolves with a non-zero `exitCode`.
 */
export type BacklogSpawn = (args: readonly string[]) => Promise<SpawnResult>;

/** What the probe learned about the `backlog` binary once it passes — cached by the caller (§5). */
export interface BacklogCapability {
  /** The `major.minor.patch` the binary reported (extra pre-release/build metadata dropped). */
  readonly version: string;
  /** The `schemaVersion` its `--json` envelope carried (always {@link EXPECTED_SCHEMA_VERSION} today). */
  readonly schemaVersion: string;
}

/** A parsed semantic version — just the numeric release triple the floor comparison needs. */
interface Semver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The `"major.minor.patch"` string, echoed into {@link BacklogCapability.version}. */
  readonly raw: string;
}

/** The one hint pointing an operator at how to obtain a `--json`-capable Backlog.md. */
const RUNBOOK_HINT =
  "lore needs a --json-capable Backlog.md. Build the fork per docs/runbooks/backlog-json-patch.md and put its `backlog` binary on PATH.";

/**
 * Parse the leading `major.minor.patch` from `backlog --version` output. Backlog prints a **bare**
 * semver plus a trailing newline (`"1.47.1\n"`) — no `v` prefix, no program name — so we anchor at the
 * start of the trimmed string and ignore any pre-release/build suffix. Returns `null` when the output
 * is not a recognizable semver (an empty string, a name-prefixed line, garbage), which the probe treats
 * as a fail-loud condition rather than guessing.
 */
function parseSemver(output: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(output.trim());
  if (!match) {
    return null;
  }
  const [, major, minor, patch] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), raw: `${major}.${minor}.${patch}` };
}

/** Order two {@link Semver}s by release triple: negative if `a < b`, positive if `a > b`, else `0`. */
function compareSemver(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Raise the fail-loud "needs a `--json`-capable Backlog.md" error (contract §5): the binary is present
 * but does not emit the envelope lore requires (stock rejects `--json`, or the output is unparseable /
 * the wrong shape / an unrecognized `schemaVersion`). Maps to exit `6` (`validation`) so the caller can
 * refuse the coupling commands while still allowing pure-OKF commands.
 */
function notJsonCapable(reason: string, input?: Record<string, unknown>): never {
  throw new LoreError("validation", `The \`backlog\` binary is not --json-capable: ${reason}`, RUNBOOK_HINT, input);
}

/**
 * The capability probe (contract §5), run once at startup and cached by the caller in `.lore/cache/`.
 * Fail-loud: it either returns the {@link BacklogCapability} of a `--json`-capable binary or throws a
 * typed {@link LoreError} — it never best-effort parses or silently degrades (there is deliberately no
 * `--plain` text fallback; ADR-0002).
 *
 * Steps, in order:
 * 1. `backlog --version` — a missing binary (`ENOENT`) is `not_found` (exit 3) with an install hint;
 *    a non-zero exit or non-semver output is fail-loud.
 * 2. Compare the reported version against {@link MIN_BACKLOG_VERSION}; below the floor is fail-loud.
 * 3. `backlog task list --json` — a non-zero exit (stock rejects the unknown `--json` option),
 *    unparseable stdout, the wrong `kind`, a non-array `data`, or an unrecognized `schemaVersion` are
 *    all fail-loud "not --json-capable" (exit 6). This step, not the version, is what proves the fork.
 *
 * The `spawn` seam is injected so tests exercise every branch without a real subprocess.
 */
export async function probeBacklog(spawn: BacklogSpawn): Promise<BacklogCapability> {
  // Step 1 — version. A spawn rejection with an ENOENT code means the binary is absent from PATH; that
  // is `not_found` (exit 3) with an install hint, distinct from a present-but-incapable binary (exit 6).
  let versionResult: SpawnResult;
  try {
    versionResult = await spawn(["--version"]);
  } catch (cause) {
    if (errnoCode(cause) === "ENOENT") {
      throw new LoreError("not_found", "`backlog` was not found on PATH.", RUNBOOK_HINT, { binary: BACKLOG_BINARY });
    }
    throw cause;
  }
  if (versionResult.exitCode !== 0) {
    notJsonCapable("`backlog --version` exited non-zero", { exitCode: versionResult.exitCode });
  }
  const version = parseSemver(versionResult.stdout);
  if (!version) {
    notJsonCapable("`backlog --version` did not print a bare semver");
  }

  // Step 2 — version floor. Below the tested floor is fail-loud; note stock v1.47.1 passes this check
  // (same version as the fork), so passing here does NOT yet prove --json — step 3 does.
  const floor = parseSemver(MIN_BACKLOG_VERSION);
  if (floor && compareSemver(version, floor) < 0) {
    notJsonCapable(`version ${version.raw} is below the ${MIN_BACKLOG_VERSION} floor`, {
      version: version.raw,
      floor: MIN_BACKLOG_VERSION,
    });
  }

  // Step 3 — the dry `task list --json` probe. THIS is the real discriminator: stock Backlog.md has no
  // `--json` option, so Commander exits non-zero here. A fork emits one parseable envelope.
  const listResult = await spawn(["task", "list", "--json"]);
  if (listResult.exitCode !== 0) {
    notJsonCapable("`task list --json` exited non-zero (stock Backlog.md rejects --json)", {
      exitCode: listResult.exitCode,
    });
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(listResult.stdout);
  } catch {
    notJsonCapable("`task list --json` did not print parseable JSON");
  }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
    notJsonCapable("`task list --json` did not print a JSON envelope object");
  }
  const { schemaVersion, kind, data } = envelope as { schemaVersion?: unknown; kind?: unknown; data?: unknown };
  if (kind !== TASK_LIST_KIND) {
    notJsonCapable(`envelope kind was ${JSON.stringify(kind)}, expected ${JSON.stringify(TASK_LIST_KIND)}`);
  }
  if (!Array.isArray(data)) {
    notJsonCapable("envelope `data` was not an array");
  }
  // An unrecognized schemaVersion is a contract drift lore must not mis-read (§5): fail loud rather than
  // parse a shape it does not understand.
  if (schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    notJsonCapable(
      `unrecognized schemaVersion ${JSON.stringify(schemaVersion)} (this lore understands ${JSON.stringify(EXPECTED_SCHEMA_VERSION)})`,
      { schemaVersion },
    );
  }

  return { version: version.raw, schemaVersion: EXPECTED_SCHEMA_VERSION };
}

/**
 * The **real** {@link BacklogSpawn}: shells out to the `backlog` binary via `Bun.spawn`, capturing both
 * streams and the exit code. Impure command-layer wiring (like the real clock and the real `git`
 * adapter), supplied where coupling commands are built; the probe and the rest of core never construct
 * it. A binary missing from PATH surfaces as a rejected promise carrying an `ENOENT` code, which
 * {@link probeBacklog} maps to `not_found`.
 *
 * `binary` defaults to `"backlog"` (resolved from PATH); it is a parameter so a test or a pinned
 * install can point at an explicit path.
 */
export function bunBacklogSpawn(binary: string = BACKLOG_BINARY): BacklogSpawn {
  return async (args: readonly string[]): Promise<SpawnResult> => {
    const proc = Bun.spawn([binary, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  };
}
