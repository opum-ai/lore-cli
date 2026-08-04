"use strict";

const { closeSync, openSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
let stdoutFd;
let stderrFd;

try {
  stdoutFd = openSync(config.stdoutPath, "w");
  stderrFd = openSync(config.stderrPath, "w");
  const result = spawnSync(config.executable, config.args, {
    cwd: config.cwd,
    env: process.env,
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (stdoutFd !== undefined) closeSync(stdoutFd);
  if (stderrFd !== undefined) closeSync(stderrFd);
}
