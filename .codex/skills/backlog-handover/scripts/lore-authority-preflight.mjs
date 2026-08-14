import { spawnSync } from "node:child_process";

const SELF_COMMITTING_COMMANDS = new Set(["link", "unlink", "rename", "sync"]);

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "usage: lore-authority-preflight.mjs --command <link|unlink|rename|sync> --repository <path> --scope <path> " +
      "[--explicit-commit-authority|--standing-delivery-authority] [--execute -- <lore args...>]\n",
  );
  process.exitCode = 2;
}

const args = process.argv.slice(2);
const values = { command: "", repository: "", scope: "" };
let explicit = false;
let standing = false;
let execute = false;
let commandArgs = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--") {
    commandArgs = args.slice(index + 1);
    break;
  }
  if (arg === "--explicit-commit-authority") explicit = true;
  else if (arg === "--standing-delivery-authority") standing = true;
  else if (arg === "--execute") execute = true;
  else if (arg === "--command" || arg === "--repository" || arg === "--scope") {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      usage(`missing value for ${arg}`);
      process.exit(2);
    }
    values[arg.slice(2)] = value;
    index += 1;
  } else {
    usage(`unknown argument: ${arg}`);
    process.exit(2);
  }
}

if (!SELF_COMMITTING_COMMANDS.has(values.command)) {
  usage("--command must name a self-committing Lore command");
  process.exit(2);
}
if (!values.repository || !values.scope) {
  usage("--repository and --scope are required");
  process.exit(2);
}
if (execute && commandArgs.length === 0) {
  usage("--execute requires Lore arguments after --");
  process.exit(2);
}

const authority = explicit ? "explicit-commit-authority" : standing ? "standing-delivery-authority" : null;
const report = {
  command: values.command,
  repository: values.repository,
  scope: values.scope,
  authorized: authority !== null,
  authority,
  dispatched: false,
};

if (!authority) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.stderr.write("Lore command not dispatched: explicit commit authority or scoped standing delivery authority is required.\n");
  process.exitCode = 4;
} else if (execute) {
  const result = spawnSync("lore", [values.command, ...commandArgs], { stdio: "inherit" });
  report.dispatched = true;
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = result.status ?? 1;
} else {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
