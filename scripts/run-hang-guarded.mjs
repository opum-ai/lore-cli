#!/usr/bin/env node
// scripts/run-hang-guarded.mjs — run a command ONCE, kill it when it goes silent, and leave a
// process sample of what it was doing (LCLI-760, DEC-236). Used by ci.yml's macOS "Test" step.
//
//   node scripts/run-hang-guarded.mjs --silence-seconds <n> --timeout-seconds <m> -- <command> [args...]
//
// WHY. `bun test --isolate` on macos-latest wedges: the last `(pass)` line prints 2-18 s into the
// step, then nothing for ~19.5 minutes until the job's 20-minute timeout cancels it (13 of the last
// 43 main-push attempts). macOS ships no GNU `timeout`, and a wall-clock cap alone cannot bound it:
// the slowest healthy Test step is 579 s, so two attempts at any cap that spares it overrun the
// job. The wedge's signature is SILENCE, so the guard keys on that: a healthy run never goes
// quiet for more than ~15 s (the largest gap between consecutive log lines in 28 healthy runs,
// each 5000+ lines), a wedge never prints again.
//
// WHAT IT DOES
//   - Forwards the command's stdout and stderr unchanged (so `| tee` still sees everything) and
//     records when either last produced output.
//   - SILENT for --silence-seconds: prints a process table and a `sample` of every bun process in
//     the command's process group to the log, SIGTERMs the whole group (SIGKILL ten seconds later)
//     and exits 124, the status GNU `timeout` uses, so the caller's retry branch can match it.
//   - Alive but past --timeout-seconds (a backstop; output keeps arriving so it is NOT a hang):
//     samples the same way, kills the group, exits 125. A caller must NOT retry 125.
//   - Otherwise exits with the command's own status (128+n when a signal ended it). A failing
//     test is therefore reported as-is, never as a hang.
//
// It never retries and never turns a failure into a pass. The retry decision, and the RETRY-GREEN
// label, live in the caller (ci.yml), exactly as on the ubuntu arm.
//
// NO SHELL. The command is an argv array. POSIX only: it signals a process group.
//
// EXIT CODES: command's own status; 124 hung (silent); 125 wall-clock backstop; 2 usage error.

import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:os";

const USAGE =
  "usage: node scripts/run-hang-guarded.mjs --silence-seconds <n> --timeout-seconds <m> -- <command> [args...]";
const KILL_GRACE_MS = 10_000;
const SAMPLE_SECONDS = 3;
const SAMPLE_LINE_CAP = 400;
const POLL_MS = 1_000;

/** Parse argv into { silenceSeconds, timeoutSeconds, command }; throws a usage Error on any problem. */
function parseArgs(argv) {
  let silenceSeconds = null;
  let timeoutSeconds = null;
  let i = 0;
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      i++;
      break;
    }
    if (arg === "--silence-seconds" || arg === "--timeout-seconds") {
      const raw = argv[++i] ?? "";
      if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`${arg} needs a positive integer (got ${JSON.stringify(raw)})`);
      if (arg === "--silence-seconds") silenceSeconds = Number(raw);
      else timeoutSeconds = Number(raw);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  const command = argv.slice(i);
  if (silenceSeconds === null) throw new Error("--silence-seconds is required");
  if (timeoutSeconds === null) throw new Error("--timeout-seconds is required");
  if (command.length === 0) throw new Error("a command is required after --");
  return { silenceSeconds, timeoutSeconds, command };
}

/** Print the process table for the group, then a `sample` of each bun in it. Never throws. */
function sampleGroup(pgid, reason) {
  console.error(`::group::process sample (${reason}; process group ${pgid})`);
  const table = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,stat=,etime=,pcpu=,command="], { encoding: "utf8" });
  if (table.error || table.status !== 0) {
    console.error(`ps failed: ${table.error ? table.error.message : `exit ${table.status}`}\n${table.stderr ?? ""}`);
  }
  const members = (table.stdout ?? "")
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 7 && Number(cols[2]) === pgid);
  console.error("pid ppid pgid stat etime %cpu command");
  for (const cols of members) console.error(`${cols.slice(0, 6).join(" ")} ${cols.slice(6).join(" ")}`);
  const buns = members.filter((cols) => /(^|\/)bun(\s|$)/.test(cols.slice(6).join(" ")));
  console.error(`bun processes in the group: ${buns.length}`);
  for (const cols of buns) {
    const pid = String(cols[0]);
    // macOS's `sample`; absent on Linux, where the failure is reported rather than hidden.
    const result = spawnSync("sample", [pid, String(SAMPLE_SECONDS)], { encoding: "utf8", timeout: 60_000 });
    console.error(`--- sample of bun pid ${pid} ---`);
    if (result.error) {
      console.error(`sample could not run: ${result.error.message}`);
    } else {
      if (result.status !== 0) console.error(`sample exited ${result.status}`);
      const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.split("\n");
      console.error(text.slice(0, SAMPLE_LINE_CAP).join("\n"));
      if (text.length > SAMPLE_LINE_CAP) console.error(`... ${text.length - SAMPLE_LINE_CAP} more lines cut`);
    }
  }
  console.error("::endgroup::");
}

function run({ silenceSeconds, timeoutSeconds, command }) {
  return new Promise((resolve) => {
    // detached: the child leads its own process group, so the group can be sampled and signalled whole.
    const child = spawn(command[0], command.slice(1), { stdio: ["inherit", "pipe", "pipe"], detached: true });
    const pgid = child.pid;
    const started = Date.now();
    let lastOutput = Date.now();
    let verdict = null; // "silent" | "backstop"
    let settled = false;
    let killTimer = null;
    const killGroup = (signal) => {
      // A spawn that failed has no pid (and no group to signal); its `error` event settles it.
      if (pgid === undefined) return;
      try {
        process.kill(-pgid, signal);
      } catch {
        // The group is already gone.
      }
    };
    const forward = (stream, sink) =>
      stream.on("data", (chunk) => {
        lastOutput = Date.now();
        sink.write(chunk);
      });
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);

    const watchdog = setInterval(() => {
      if (verdict !== null || pgid === undefined) return;
      const silentMs = Date.now() - lastOutput;
      const aliveMs = Date.now() - started;
      if (silentMs >= silenceSeconds * 1000) verdict = "silent";
      else if (aliveMs >= timeoutSeconds * 1000) verdict = "backstop";
      else return;
      const why =
        verdict === "silent"
          ? `no output for ${Math.round(silentMs / 1000)}s (limit ${silenceSeconds}s)`
          : `still running after ${Math.round(aliveMs / 1000)}s (backstop ${timeoutSeconds}s) with output arriving`;
      console.error(`::error::${command.join(" ")}: HUNG? ${why}; sampling, then killing the process group`);
      sampleGroup(pgid, why);
      killGroup("SIGTERM");
      killTimer = setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS);
    }, POLL_MS);

    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      if (killTimer !== null) clearTimeout(killTimer);
      // Whatever the outcome, no member of the group may outlive the attempt.
      killGroup("SIGKILL");
      resolve(status);
    };
    child.on("error", (error) => {
      console.error(`::error::could not start ${command[0]}: ${error.message}`);
      finish(127);
    });
    child.on("close", (code, signal) => {
      if (verdict === "silent") finish(124);
      else if (verdict === "backstop") finish(125);
      else if (code !== null) finish(code);
      else finish(128 + (signal === null ? 0 : (constants.signals[signal] ?? 0)));
    });
  });
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
  console.error(USAGE);
  process.exit(2);
}
process.exitCode = await run(args);
