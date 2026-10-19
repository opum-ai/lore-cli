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
//             dist-tag), run with --expect absent: `lore check` must exit NONZERO and its
//             output must name the probed feature.
//
// The probe feature is the `[targets]` table in `.lore/agents/*.toml` (agent-profile budget
// targets, LCLI-682/722). It is observable as an exit status because a binary built before
// the schema existed rejects the profile: exit 6, stderr
// `error: .lore/agents/documentation.toml does not match agent profile schema 1: Unrecognized
// key: "targets"`. A binary that accepts `[targets]` exits 0 on this repository's bundle.
//
// THE NEGATIVE CONTROL ASSERTS A SIGNATURE, NOT MERELY A NONZERO EXIT. Any crash satisfies
// "nonzero"; only output naming `targets` shows the PREVIOUS release failed for the reason the
// gate is about. An unrelated breakage (a missing bundle, a bad install, a crash on startup)
// therefore fails the gate rather than masquerading as the control.
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
//      previous binary failed without naming `targets`
//   2  usage error, or the binary could not be run at all — nothing was measured, which is
//      never a pass

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { isMain } from "./is-main.mjs";

/** The profile key this release added; the absence arm requires it in the old binary's output. */
const PROBED_FEATURE = "targets";

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
 * `signature` is true when either stream names the probed feature. On a spawn error, `kind`
 * is "spawn-error" and `exitCode` is null: nothing ran, so nothing was measured.
 */
export function runProbe({ binary, expect, cwd }) {
  const result = spawnSync(binary, ["check"], { cwd, encoding: "utf8", windowsHide: true });
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
  const signature = new RegExp(`\\b${PROBED_FEATURE}\\b`).test(output);
  const ok = expect === "present" ? exitCode === 0 : exitCode !== 0 && signature;
  return { ok, kind: "ran", exitCode, signature, output };
}

function describeExit(exitCode) {
  return exitCode === null ? "was terminated without an exit status" : `exited ${exitCode}`;
}

export function main(argv, { out = console.log, err = console.error } = {}) {
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
    result = runProbe(args);
  } catch (error) {
    err(`::error::release gate probe could not run ${args.binary}: ${messageOf(error)}`);
    return 2;
  }

  if (result.kind === "spawn-error") {
    err(`::error::release gate probe could not run ${args.binary} in ${args.cwd}: ${result.detail}`);
    return 2;
  }

  const command = `${args.binary} check (cwd ${args.cwd})`;

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
      `release gate probe: ${command} ${describeExit(result.exitCode)} and named ${PROBED_FEATURE}, as required (the previous release rejects it)`,
    );
    return 0;
  }

  if (result.exitCode === 0) {
    err(
      `::error::release gate probe: ${command} exited 0, but --expect absent requires a nonzero exit whose output names ${PROBED_FEATURE}. The previous release ACCEPTED the probed feature, so the negative control proved nothing.`,
    );
  } else {
    err(
      `::error::release gate probe: ${command} ${describeExit(result.exitCode)}, but its output does not name ${PROBED_FEATURE}. A nonzero exit for an UNRELATED reason cannot serve as the negative control, so the gate cannot claim the previous release rejected the feature.`,
    );
  }
  if (result.output !== "") err(result.output);
  err(STALE_CONTROL_GUIDANCE);
  return 1;
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
