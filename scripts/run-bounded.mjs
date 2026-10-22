#!/usr/bin/env node
// scripts/run-bounded.mjs — run a command with a hard per-attempt timeout and a bounded retry
// (LCLI-753). Used by ci.yml's "Install pinned browser engines" step, whose bare
// `bunx playwright install --with-deps chromium firefox webkit` stalled for 20-38 minutes on
// four runs on 2026-10-22 (nothing ended it but a human cancel) while the same step takes
// 42-89 s when healthy (36 passing runs measured the same day).
//
//   node scripts/run-bounded.mjs --timeout-seconds <n> --attempts <m> -- <command> [args...]
//
// WHAT IT GUARANTEES
//   - Each attempt is killed (SIGTERM to its whole process group, SIGKILL ten seconds later) when
//     it exceeds --timeout-seconds, so a hung install fails an attempt instead of hanging the job.
//     The group kill matters: `bunx` and apt spawn children, and killing only the direct child
//     leaves the hung one holding the step open.
//   - A failed or timed-out attempt is retried, up to --attempts in total. A success on any
//     attempt exits 0.
//   - When EVERY attempt fails or times out it exits 1, naming each attempt's outcome. It never
//     turns a failure into a pass: there is no `continue-on-error` and no `|| true` anywhere.
//
// NO SHELL. The command is an argv array, so arguments are never re-parsed.
//
// EXIT CODES: 0 an attempt succeeded; 1 every attempt failed or timed out; 2 usage error.

import { spawn } from "node:child_process";

const USAGE = "usage: node scripts/run-bounded.mjs --timeout-seconds <n> --attempts <m> -- <command> [args...]";
const KILL_GRACE_MS = 10_000;

/** Parse argv into { timeoutSeconds, attempts, command }; throws a usage Error on any problem. */
function parseArgs(argv) {
  let timeoutSeconds = null;
  let attempts = null;
  let i = 0;
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      i++;
      break;
    }
    if (arg === "--timeout-seconds" || arg === "--attempts") {
      const raw = argv[++i] ?? "";
      if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${arg} needs a positive integer (got ${JSON.stringify(raw)})`);
      if (arg === "--attempts") attempts = Number(raw);
      else timeoutSeconds = Number(raw);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  const command = argv.slice(i);
  if (timeoutSeconds === null) throw new Error("--timeout-seconds is required");
  if (attempts === null) throw new Error("--attempts is required");
  if (command.length === 0) throw new Error("a command is required after --");
  return { timeoutSeconds, attempts, command };
}

/** Run one attempt; resolves { ok, how } where `how` names the outcome for the log. */
function runOnce(command, timeoutSeconds) {
  return new Promise((resolve) => {
    // detached: the child leads its own process group, so the group can be signalled whole.
    const child = spawn(command[0], command.slice(1), { stdio: "inherit", detached: true });
    let timedOut = false;
    let settled = false;
    let killTimer = null;
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The group is already gone.
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      killTimer = setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS);
    }, timeoutSeconds * 1000);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer !== null) clearTimeout(killTimer);
      // Whatever the outcome, no member of the group may outlive the attempt.
      killGroup("SIGKILL");
      resolve(result);
    };
    child.on("error", (error) => finish({ ok: false, how: `could not start: ${error.message}` }));
    child.on("close", (code, signal) => {
      if (timedOut) finish({ ok: false, how: `timed out after ${timeoutSeconds}s` });
      else if (code === 0) finish({ ok: true, how: "succeeded" });
      else finish({ ok: false, how: signal ? `killed by ${signal}` : `exited ${code}` });
    });
  });
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    console.error(USAGE);
    return 2;
  }
  const outcomes = [];
  for (let attempt = 1; attempt <= args.attempts; attempt++) {
    const result = await runOnce(args.command, args.timeoutSeconds);
    outcomes.push(`attempt ${attempt}/${args.attempts} ${result.how}`);
    if (result.ok) {
      if (attempt > 1) console.log(`::warning::${args.command[0]} needed ${attempt} attempts: ${outcomes.join("; ")}`);
      return 0;
    }
    console.error(`::warning::${args.command.join(" ")}: attempt ${attempt}/${args.attempts} ${result.how}`);
  }
  console.error(`::error::${args.command.join(" ")} failed on every attempt: ${outcomes.join("; ")}`);
  return 1;
}

process.exitCode = await main(process.argv.slice(2));
