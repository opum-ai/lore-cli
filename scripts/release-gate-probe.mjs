#!/usr/bin/env node
// scripts/release-gate-probe.mjs — prove that the release's own platform binary can do
// something the previous published release cannot (LCLI-738, DEC-204 (b), OPAG-1419).
//
// WHY A GATE NEEDS THIS. Every other release check reads the tree or the qualified tarball;
// none of them answers "is the artifact this release stages actually NEW code, and can the
// gate tell?" A release whose host binary is silently the previous release's bytes, or whose
// feature never made it into the compiled binary, passed every existing job. This probe runs
// the SAME command against two binaries and requires OPPOSITE outcomes:
//
//   FRESH    — the binary unpacked from this run's matching-host-qualified platform tarball,
//              run with --expect present: it writes the Codex bridge into a scratch directory
//              and `lore agents --check --target codex` there must exit 0.
//   PREVIOUS — the platform package at npm's `latest` (deliberately NOT the release-candidate
//              dist-tag), run with --expect absent against a bridge the FRESH binary wrote
//              (--fresh-binary): `lore agents --check --target codex` must exit NONZERO and
//              carry the exact line `out-of-date .codex/skills/lore/SKILL.md`.
//
// THE PROBE FEATURE (LCLI-771, ODOC-556, re-based by LCLI-751) is where the Codex skill lives.
// A binary from this tree writes it to `.agents/skills/lore/SKILL.md`, the repository skill path
// Codex documents; lore <= 0.14.1 wrote and demanded `.codex/skills/lore/SKILL.md`. So a bridge
// written by this tree is current to this tree and out of date to 0.14.1, which prints
// `out-of-date .codex/skills/lore/SKILL.md` and exits 6 (measured against the v0.14.1 sources
// on a bridge this tree wrote, 2026-10-31). This is the shipped behaviour itself, not a stand-in.
//
// THE NEGATIVE CONTROL ASSERTS A SIGNATURE, NOT MERELY A NONZERO EXIT. Any crash satisfies
// "nonzero"; only output carrying the EXACT line shows the PREVIOUS release failed for the reason
// the gate is about. An unrelated breakage (a bad install, a crash on startup) therefore fails
// the gate rather than masquerading as the control — and so does a process killed by a signal,
// which has no exit status to read.
//
// THE PROBE IS DELIBERATELY SELF-OBSOLESCING. When a later release's previous version already
// writes `.agents/skills/lore/SKILL.md` (the release after the one that ships LCLI-771), the
// control can no longer fail for the asserted reason: the gate goes red and the release author
// must move the probe to a feature new in THAT release. The failure message says exactly that;
// running without it would let the control quietly stop being a control.
//
// NO SHELL, NO PLUGIN DETECTION. Binaries are spawned as argv arrays with no shell string, so a
// path with spaces is one argument. `LORE_AGENT_PLUGINS=off` keeps `agents --check` from invoking
// a runtime's `plugin list` (a 15s wait on a runner that has none). The scratch directory is
// created under the OS temp dir and removed afterwards; nothing is written to the checkout.
//
// EXIT CODES
//   0  the expectation held
//   1  it did not: the fresh binary failed `agents --check`, the previous binary passed it, or
//      the previous binary failed without the exact signature
//   2  usage error, a binary could not be run at all, the fresh binary could not write the
//      bridge, or a process ended without an exit status (killed by a signal) — nothing was
//      measured, which is never a pass

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isMain } from "./is-main.mjs";

/** The feature the probe measures, named in the operator-facing messages. */
const PROBED_FEATURE = "the Codex skill at .agents/skills/lore/SKILL.md";

/**
 * The EXACT line lore <= 0.14.1 prints for a Codex bridge this tree wrote:
 * `out-of-date .codex/skills/lore/SKILL.md`. Matched as one literal with a plain `includes()`,
 * never a regular expression built from a variable — a pattern can silently widen, and this
 * string cannot. If the previous release starts saying something else, the absence arm goes
 * red for the operator to look at, which is the self-obsolescence this gate is meant to
 * surface rather than paper over.
 */
export const ABSENT_SIGNATURE = "out-of-date .codex/skills/lore/SKILL.md";

/** Printed whenever a failed `absent` arm needs the release author to move the probe forward. */
export const STALE_CONTROL_GUIDANCE =
  "The release probe is SELF-OBSOLESCING: the previous release is expected to REJECT the feature this release added. If it ACCEPTS it, the probe has aged out and no longer distinguishes a fresh build from the previous one. Update scripts/release-gate-probe.mjs and the release-gate-probe job to probe a feature that is NEW in this release, then re-run.";

const USAGE =
  "usage: node scripts/release-gate-probe.mjs --binary <path> --expect present|absent [--fresh-binary <path>] (--fresh-binary is required for absent)";

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse the CLI. Returns resolved absolute paths. Throws a usage error on any problem; `absent`
 * needs --fresh-binary because the previous release is checked against a bridge THIS release wrote.
 */
export function parseArgs(argv) {
  /** @type {{ binary: string | null; expect: string | null; freshBinary: string | null }} */
  const options = { binary: null, expect: null, freshBinary: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--binary" || arg === "--expect" || arg === "--fresh-binary") {
      const value = argv[++i] ?? "";
      if (value === "") throw new Error(`${arg} needs a value`);
      options[arg === "--fresh-binary" ? "freshBinary" : arg.slice(2)] = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (options.binary === null) throw new Error("--binary is required");
  if (options.expect !== "present" && options.expect !== "absent") {
    throw new Error(`--expect must be "present" or "absent" (got ${JSON.stringify(options.expect)})`);
  }
  if (options.expect === "absent" && options.freshBinary === null) {
    throw new Error("--fresh-binary is required with --expect absent");
  }
  options.binary = resolve(options.binary);
  if (options.freshBinary !== null) options.freshBinary = resolve(options.freshBinary);
  return options;
}

function streamsOf(result) {
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  return [stdout, stderr]
    .filter((stream) => stream.trim() !== "")
    .join("\n")
    .trim();
}

/** The argv every measured and generating call shares: no shell, plugin detection off. */
const SPAWN_OPTIONS = (cwd) => ({
  cwd,
  encoding: /** @type {"utf8"} */ ("utf8"),
  windowsHide: true,
  env: { ...process.env, LORE_AGENT_PLUGINS: "off" },
});

/**
 * Write the Codex bridge with the FRESH binary into a scratch directory, then run
 * `<binary> agents --check --target codex` there and decide whether the expectation holds.
 *
 * The bridge is always written by the fresh binary (for `present` that is `binary` itself), so
 * both arms judge the SAME bytes. On a spawn error `kind` is "spawn-error"; when the fresh binary
 * cannot write the bridge, `kind` is "fixture-error"; a process terminated by a signal yields
 * `kind: "no-status"`. In all three nothing was measured, so neither arm may read them as a result.
 *
 * `spawn` is the child_process.spawnSync seam, so every arm is testable on every platform and
 * the real previous release's captured output can stand in for a binary that is no longer built.
 * `makeDir`/`removeDir` are the scratch-directory seam.
 */
export function runProbe({
  binary,
  expect,
  freshBinary = binary,
  spawn = spawnSync,
  makeDir = () => mkdtempSync(join(tmpdir(), "lore-release-gate-probe-")),
  removeDir = (dir) => rmSync(dir, { recursive: true, force: true }),
}) {
  const dir = makeDir();
  try {
    const written = spawn(
      expect === "present" ? binary : freshBinary,
      ["agents", "--target", "codex"],
      SPAWN_OPTIONS(dir),
    );
    if (written.error) {
      return {
        ok: false,
        kind: "spawn-error",
        exitCode: null,
        signature: false,
        output: "",
        detail: messageOf(written.error),
      };
    }
    if (written.status !== 0) {
      return {
        ok: false,
        kind: "fixture-error",
        exitCode: Number.isInteger(written.status) ? written.status : null,
        signature: false,
        output: streamsOf(written),
      };
    }
    const result = spawn(binary, ["agents", "--check", "--target", "codex"], SPAWN_OPTIONS(dir));
    const output = streamsOf(result);
    if (result.error) {
      return {
        ok: false,
        kind: "spawn-error",
        exitCode: null,
        signature: false,
        output,
        detail: messageOf(result.error),
      };
    }
    const exitCode = result.status;
    const signature = output.includes(ABSENT_SIGNATURE);
    if (!Number.isInteger(exitCode)) {
      // Killed by a signal, or otherwise ended without a status. NOT a nonzero exit: the
      // process may well have printed the signature before it died, and accepting that would
      // let the negative control pass without ever having measured a rejection.
      return { ok: false, kind: "no-status", exitCode: null, signal: result.signal ?? null, signature, output };
    }
    const ok = expect === "present" ? exitCode === 0 : exitCode !== 0 && signature;
    return { ok, kind: "ran", exitCode, signature, output };
  } finally {
    removeDir(dir);
  }
}

/** Only reached for `kind: "ran"`, where the status is an integer. */
function describeExit(exitCode) {
  return `exited ${exitCode}`;
}

export function main(argv, { out = console.log, err = console.error, ...seams } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    err(`::error::${messageOf(error)}`);
    err(USAGE);
    return 2;
  }

  let result;
  try {
    result = runProbe({ ...args, ...seams });
  } catch (error) {
    err(`::error::release gate probe could not run ${args.binary}: ${messageOf(error)}`);
    return 2;
  }

  if (result.kind === "spawn-error") {
    err(`::error::release gate probe could not run a binary (${args.binary}): ${result.detail}`);
    return 2;
  }

  const command = `${args.binary} agents --check --target codex`;

  if (result.kind === "fixture-error") {
    err(
      `::error::release gate probe: the fresh binary ${args.expect === "present" ? args.binary : args.freshBinary} could not write the Codex bridge it was asked to (exit ${result.exitCode ?? "none"}). Nothing was measured — a probe without a bridge to check cannot satisfy either expectation, so this is never a pass.`,
    );
    if (result.output !== "") err(result.output);
    return 2;
  }

  if (result.kind === "no-status") {
    err(
      `::error::release gate probe: ${command} was terminated by ${result.signal ?? "a signal"} without an exit status. Nothing was measured — a process that never exited cannot satisfy either expectation, so this is never a pass.`,
    );
    if (result.output !== "") err(result.output);
    return 2;
  }

  if (args.expect === "present") {
    if (result.ok) {
      out(`release gate probe: ${command} exited 0, as required (${PROBED_FEATURE} is present)`);
      return 0;
    }
    err(
      `::error::release gate probe: ${command} ${describeExit(result.exitCode)}, but --expect present requires exit 0. The binary this release qualified must accept a bridge it wrote itself (${PROBED_FEATURE}); the release tree or its qualified artifact is not the code this gate was written against.`,
    );
    if (result.output !== "") err(result.output);
    return 1;
  }

  if (result.ok) {
    out(
      `release gate probe: ${command} ${describeExit(result.exitCode)} and carried the exact line ${ABSENT_SIGNATURE}, as required (the previous release rejects it)`,
    );
    return 0;
  }

  if (result.exitCode === 0) {
    err(
      `::error::release gate probe: ${command} exited 0, but --expect absent requires a nonzero exit whose output carries the exact line ${ABSENT_SIGNATURE}. The previous release ACCEPTED the probed feature, so the negative control proved nothing.`,
    );
  } else {
    err(
      `::error::release gate probe: ${command} ${describeExit(result.exitCode)}, but its output does not carry the exact line ${ABSENT_SIGNATURE}. A nonzero exit for an UNRELATED reason — a crash, a bad install, or the feature merely being mentioned — cannot serve as the negative control, so the gate cannot claim the previous release rejected the feature.`,
    );
  }
  if (result.output !== "") err(result.output);
  err(STALE_CONTROL_GUIDANCE);
  return 1;
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
