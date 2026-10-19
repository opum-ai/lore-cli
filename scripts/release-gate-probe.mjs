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
//   FRESH   — the binary unpacked from this run's matching-host-qualified platform tarball,
//             run with --expect present: `lore check` must exit 0.
//   PREVIOUS — the platform package at npm's `latest` (deliberately NOT the release-candidate
//             dist-tag), run with --expect absent: `lore check` must exit NONZERO and carry the
//             exact rejection `Unrecognized key: "targets"`.
//
// The probe feature is the `[targets]` table in `.lore/agents/*.toml` (agent-profile budget
// targets, LCLI-682/722). It is observable as an exit status because a binary built before
// the schema existed rejects the profile: exit 6, stderr
// `error: .lore/agents/documentation.toml does not match agent profile schema 1: Unrecognized
// key: "targets"`. A binary that accepts `[targets]` exits 0 on this repository's bundle.
//
// THE NEGATIVE CONTROL ASSERTS A SIGNATURE, NOT MERELY A NONZERO EXIT. Any crash satisfies
// "nonzero"; only output carrying the EXACT rejection, `Unrecognized key: "targets"`, shows the
// PREVIOUS release failed for the reason the gate is about. An unrelated breakage (a missing
// bundle, a bad install, a crash on startup) therefore fails the gate rather than masquerading
// as the control — and so does a process killed by a signal, which has no exit status to read.
//
// THE PROBE IS DELIBERATELY SELF-OBSOLESCING. When a later release's previous version already
// accepts `[targets]`, the control can no longer fail for the asserted reason: the gate goes
// red and the release author must move the probe to a feature new in THAT release. The failure
// message says exactly that; running without it would let the control quietly stop being a
// control.
//
// NO SHELL. The binary is spawned as an argv array with no shell string built from arguments,
// so a path containing spaces (or shell metacharacters) is one argument, never a command.
//
// EXIT CODES
//   0  the expectation held
//   1  it did not: the fresh binary failed `check`, the previous binary passed it, or the
//      previous binary failed without the exact rejection signature
//   2  usage error, the binary could not be run at all, or it ended without an exit status
//      (killed by a signal) — nothing was measured, which is never a pass

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { isMain } from "./is-main.mjs";

/** The profile key this release added; named in the operator-facing messages. */
const PROBED_FEATURE = "targets";

/**
 * The EXACT rejection a binary built before `[targets]` existed prints for this repository's
 * agent profile: `error: .lore/agents/documentation.toml does not match agent profile
 * schema 1: Unrecognized key: "targets"`. Matched as one literal with a plain `includes()`,
 * never a regular expression built from a variable — a pattern can silently widen, and this
 * string cannot. If the previous release starts saying something else, the absence arm goes
 * red for the operator to look at, which is the self-obsolescence this gate is meant to
 * surface rather than paper over.
 */
export const ABSENT_SIGNATURE = 'Unrecognized key: "targets"';

/** Printed whenever a failed `absent` arm needs the release author to move the probe forward. */
export const STALE_CONTROL_GUIDANCE =
  "The release probe is SELF-OBSOLESCING: the previous release is expected to REJECT the feature this release added. If it ACCEPTS it, the probe has aged out and no longer distinguishes a fresh build from the previous one. Update scripts/release-gate-probe.mjs and the release-gate-probe job to probe a feature that is NEW in this release, then re-run.";

const USAGE = "usage: node scripts/release-gate-probe.mjs --binary <path> --expect present|absent [--cwd <dir>]";

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Parse the CLI. Returns resolved absolute paths, so a relative --binary is read relative to
 * the caller's working directory rather than to --cwd. Throws a usage error on any problem.
 */
export function parseArgs(argv) {
  /** @type {{ binary: string | null; expect: string | null; cwd: string }} */
  const options = { binary: null, expect: null, cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--binary" || arg === "--expect" || arg === "--cwd") {
      const value = argv[++i] ?? "";
      if (value === "") throw new Error(`${arg} needs a value`);
      options[arg.slice(2)] = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (options.binary === null) throw new Error("--binary is required");
  if (options.expect !== "present" && options.expect !== "absent") {
    throw new Error(`--expect must be "present" or "absent" (got ${JSON.stringify(options.expect)})`);
  }
  options.binary = resolve(options.binary);
  options.cwd = resolve(options.cwd);
  return options;
}

/**
 * Run `<binary> check` in `cwd` and decide whether the expectation holds.
 *
 * `signature` is true when either stream carries the exact rejection literal. On a spawn
 * error, `kind` is "spawn-error" and `exitCode` is null: nothing ran, so nothing was measured.
 * A process that was terminated by a signal yields `kind: "no-status"` for the same reason:
 * it never produced an exit status, so neither arm may read it as one.
 *
 * `spawn` is the child_process.spawnSync seam. It exists so the no-status arm is testable on
 * every platform — on Windows a killed process reports an exit code and no signal, so no real
 * stub can produce the null status the arm is about.
 */
export function runProbe({ binary, expect, cwd, spawn = spawnSync }) {
  const result = spawn(binary, ["check"], { cwd, encoding: "utf8", windowsHide: true });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const output = [stdout, stderr]
    .filter((stream) => stream.trim() !== "")
    .join("\n")
    .trim();
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
}

/** Only reached for `kind: "ran"`, where the status is an integer. */
function describeExit(exitCode) {
  return `exited ${exitCode}`;
}

export function main(argv, { out = console.log, err = console.error, spawn = spawnSync } = {}) {
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
    result = runProbe({ ...args, spawn });
  } catch (error) {
    err(`::error::release gate probe could not run ${args.binary}: ${messageOf(error)}`);
    return 2;
  }

  if (result.kind === "spawn-error") {
    err(`::error::release gate probe could not run ${args.binary} in ${args.cwd}: ${result.detail}`);
    return 2;
  }

  const command = `${args.binary} check (cwd ${args.cwd})`;

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
      `::error::release gate probe: ${command} ${describeExit(result.exitCode)}, but --expect present requires exit 0. The binary this release qualified must accept the ${PROBED_FEATURE} feature; the release tree or its qualified artifact is not the code this gate was written against.`,
    );
    if (result.output !== "") err(result.output);
    return 1;
  }

  if (result.ok) {
    out(
      `release gate probe: ${command} ${describeExit(result.exitCode)} and carried the exact rejection ${ABSENT_SIGNATURE}, as required (the previous release rejects it)`,
    );
    return 0;
  }

  if (result.exitCode === 0) {
    err(
      `::error::release gate probe: ${command} exited 0, but --expect absent requires a nonzero exit whose output carries the exact rejection ${ABSENT_SIGNATURE}. The previous release ACCEPTED the probed feature, so the negative control proved nothing.`,
    );
  } else {
    err(
      `::error::release gate probe: ${command} ${describeExit(result.exitCode)}, but its output does not carry the exact rejection ${ABSENT_SIGNATURE}. A nonzero exit for an UNRELATED reason — a crash, a missing bundle, or the feature merely being mentioned — cannot serve as the negative control, so the gate cannot claim the previous release rejected the feature.`,
    );
  }
  if (result.output !== "") err(result.output);
  err(STALE_CONTROL_GUIDANCE);
  return 1;
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
