import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const SELF_COMMITTING_COMMANDS = new Set(["link", "unlink", "rename", "sync"]);

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "usage: lore-authority-preflight.mjs --command <link|unlink|rename|sync> --repository <path> --scope <path> " +
      "[--explicit-commit-authority|--standing-delivery-authority --integration-branch dev] " +
      "[--execute -- <lore args...>]\n",
  );
  process.exitCode = 2;
}

const args = process.argv.slice(2);
const values = { command: "", repository: "", scope: "", integrationBranch: "" };
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
  else if (arg === "--command" || arg === "--repository" || arg === "--scope" || arg === "--integration-branch") {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      usage(`missing value for ${arg}`);
      process.exit(2);
    }
    const key = arg === "--integration-branch" ? "integrationBranch" : arg.slice(2);
    values[key] = value;
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
if (explicit && standing) {
  usage("choose explicit commit authority or standing delivery authority, not both");
  process.exit(2);
}
if (execute && commandArgs.length === 0) {
  usage("--execute requires Lore arguments after --");
  process.exit(2);
}

let repository;
try {
  repository = realpathSync(values.repository);
} catch {
  process.stderr.write(`Lore command not dispatched: repository does not exist: ${values.repository}\n`);
  process.exit(4);
}

const gitRootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: repository, encoding: "utf8" });
if (gitRootResult.status !== 0 || realpathSync(gitRootResult.stdout.trim()) !== repository) {
  process.stderr.write(`Lore command not dispatched: repository is not an exact Git worktree root: ${repository}\n`);
  process.exit(4);
}

const declaredScope = isAbsolute(values.scope) ? resolve(values.scope) : resolve(repository, values.scope);
let scope;
try {
  scope = realpathSync(declaredScope);
} catch {
  process.stderr.write(`Lore command not dispatched: scope does not exist: ${declaredScope}\n`);
  process.exit(4);
}
if (scope !== repository) {
  process.stderr.write(
    `Lore command not dispatched: self-committing Lore commands require the exact repository root scope: ${repository}\n`,
  );
  process.exit(4);
}

if (standing) {
  if (values.integrationBranch !== "dev") {
    process.stderr.write("Lore command not dispatched: standing delivery authority requires --integration-branch dev.\n");
    process.exit(4);
  }
  let agents = "";
  try {
    agents = readFileSync(resolve(repository, "AGENTS.md"), "utf8");
  } catch {
    process.stderr.write("Lore command not dispatched: AGENTS.md is missing.\n");
    process.exit(4);
  }
  if (!agents.includes("## Autonomous Lore CLI documentation campaigns") || !agents.includes("pull-request delivery to `dev`")) {
    process.stderr.write("Lore command not dispatched: AGENTS.md does not record Lore CLI dev delivery authority.\n");
    process.exit(4);
  }
}

const authority = explicit ? "explicit-commit-authority" : standing ? "standing-delivery-authority" : null;
const report = {
  command: values.command,
  repository,
  scope,
  integrationBranch: values.integrationBranch || null,
  authorized: authority !== null,
  authority,
  dispatched: false,
};

if (!authority) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.stderr.write("Lore command not dispatched: explicit commit authority or scoped standing delivery authority is required.\n");
  process.exitCode = 4;
} else if (execute) {
  const result = spawnSync("lore", [values.command, ...commandArgs], { cwd: repository, stdio: "inherit" });
  report.dispatched = true;
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = result.status ?? 1;
} else {
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
