import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const SELF_COMMITTING_COMMANDS = new Set(["link", "unlink", "rename", "sync"]);

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "usage: lore-authority-preflight.mjs --command <link|unlink|rename|sync> --repository <path> --scope <path> " +
      "[--explicit-commit-authority|--standing-delivery-authority --integration-branch dev] " +
      "[--allow-backlog-path <exact-repository-relative-path>]... " +
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
const allowedBacklogPaths = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--") {
    commandArgs = args.slice(index + 1);
    break;
  }
  if (arg === "--explicit-commit-authority") explicit = true;
  else if (arg === "--standing-delivery-authority") standing = true;
  else if (arg === "--execute") execute = true;
  else if (arg === "--command" || arg === "--repository" || arg === "--scope" || arg === "--integration-branch" || arg === "--allow-backlog-path") {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      usage(`missing value for ${arg}`);
      process.exit(2);
    }
    if (arg === "--allow-backlog-path") allowedBacklogPaths.push(value);
    else {
      const key = arg === "--integration-branch" ? "integrationBranch" : arg.slice(2);
      values[key] = value;
    }
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

const gitWorktreeResult = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
  cwd: repository,
  encoding: "utf8",
});
const gitPrefixResult = spawnSync("git", ["rev-parse", "--show-prefix"], { cwd: repository, encoding: "utf8" });
if (
  gitWorktreeResult.status !== 0 ||
  gitWorktreeResult.stdout.trim() !== "true" ||
  gitPrefixResult.status !== 0 ||
  gitPrefixResult.stdout.trim() !== ""
) {
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

function repositoryRelativePath(path) {
  if (isAbsolute(path)) return null;
  const absolute = resolve(repository, path);
  const repositoryRelative = relative(repository, absolute);
  if (!repositoryRelative || repositoryRelative === ".." || repositoryRelative.startsWith(`..${sep}`) || isAbsolute(repositoryRelative)) return null;
  if (existsSync(absolute)) {
    const real = realpathSync(absolute);
    const realRelative = relative(repository, real);
    if (!realRelative || realRelative === ".." || realRelative.startsWith(`..${sep}`) || isAbsolute(realRelative)) return null;
  }
  return repositoryRelative.split(sep).join("/");
}

const normalizedAllowedBacklogPaths = new Set();
for (const path of allowedBacklogPaths) {
  const normalized = repositoryRelativePath(path);
  if (!normalized || !normalized.startsWith("backlog/")) {
    process.stderr.write(`Lore command not dispatched: invalid allowed Backlog path: ${path}\n`);
    process.exit(4);
  }
  normalizedAllowedBacklogPaths.add(normalized);
}

function gitPaths(argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: repository, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`Lore command not dispatched: could not inspect dirty Backlog paths with git ${argumentsList.join(" ")}.\n`);
    process.exit(4);
  }
  return result.stdout.split("\0").filter(Boolean);
}

const dirtyBacklogPaths = values.command === "sync"
  ? [...new Set([
      ...gitPaths(["diff", "--no-renames", "--name-only", "-z", "--", "backlog"]),
      ...gitPaths(["diff", "--cached", "--no-renames", "--name-only", "-z", "--", "backlog"]),
      ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z", "--", "backlog"]),
    ])].sort()
  : [];
const unownedDirtyBacklogPaths = dirtyBacklogPaths.filter((path) => !normalizedAllowedBacklogPaths.has(path));
if (unownedDirtyBacklogPaths.length > 0) {
  process.stderr.write(
    `Lore command not dispatched: sync would commit dirty Backlog paths outside the exact campaign allowlist:\n- ${unownedDirtyBacklogPaths.join("\n- ")}\n`,
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
  allowedBacklogPaths: [...normalizedAllowedBacklogPaths].sort(),
  dirtyBacklogPaths,
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
