import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const SCRIPT = join(import.meta.dir, "../.codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs");
const HANDOVER_SKILL = readFileSync(join(import.meta.dir, "../.codex/skills/backlog-handover/SKILL.md"), "utf8");
const LORE_SKILL = readFileSync(join(import.meta.dir, "../.codex/skills/lore/SKILL.md"), "utf8");
const PREFLIGHT = join(import.meta.dir, "../.codex/skills/backlog-handover/scripts/lore-authority-preflight.mjs");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lore-handover-lifecycle-"));
  roots.push(root);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
  return root;
}

function installFakeLore(fakeBin: string, posixBody: string, windowsBody: string): void {
  const fakeLore = join(fakeBin, process.platform === "win32" ? "lore.cmd" : "lore");
  writeFileSync(
    fakeLore,
    process.platform === "win32" ? `@echo off\r\n${windowsBody}\r\n` : `#!/bin/sh\n${posixBody}\n`,
  );
  if (process.platform !== "win32") spawnSync("chmod", ["+x", fakeLore]);
}

function fakePathEnv(fakeBin: string): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}` };
}

function audit(files: Record<string, string>) {
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      fixture(files),
      "--expect-tracker",
      "doc-19",
      "--expect-sha",
      "0123456789abcdef0123456789abcdef01234567",
      "--expect-branch",
      "fix/lcli-329",
      "--expect-worktree",
      "/tmp/lcli-329",
      "--expect-state",
      "0,1,0,0",
    ],
    { encoding: "utf8" },
  );
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const ACTIVE = `# Handover — current campaign

**Lifecycle**: executable-current
**Grounded against**: repository \`lore-cli\`; branch \`fix/lcli-329\`; SHA \`0123456789abcdef0123456789abcdef01234567\`; worktree \`/tmp/lcli-329\`; reviewed
**Tracker**: doc-19 - Codex loop refinements
**Mode**: autonomous-docs
**Stop class**: session-renewal

## Paste-ready prompt

Run /clear, start a new session in \`lore-cli\`, then use $backlog-handover restore without reconfirmation.

## State

- Resolved: 0
- In flight: 1
- Blocked: 0
- Ready: 0

## In flight

| Task | Worktree/branch | Last verified tree and stage | Blocker or next action |
|---|---|---|---|
| LCLI-329 | fix/lcli-329 | 0123456789abcdef0123456789abcdef01234567, reviewed | Restore and deliver |

## Retained artifacts

| Artifact | Owner | Reason | Cleanup condition |
|---|---|---|---|
| fix/lcli-329 | LCLI-329 | Session renewal | Merge to dev |

## Decision required

- Decision: None — session renewal

## Next action

- Action: Run /clear, start a new session in \`lore-cli\`, invoke $backlog-handover restore, and continue without reconfirmation.

## Exceptions

- None.
`;

const HISTORICAL = `# Historical local handover provenance

**Lifecycle**: historical-non-executable

This file recorded a completed campaign. It granted no authority.
`;

describe("backlog handover lifecycle audit", () => {
  test("withheld commit authority prevents Lore dispatch and a Git mutation", () => {
    const root = fixture({});
    const fakeBin = join(root, "bin");
    const dispatched = join(root, "dispatched");
    mkdirSync(fakeBin);
    installFakeLore(
      fakeBin,
      `touch "${dispatched}"\ngit commit --allow-empty -m denied`,
      `type nul > "${dispatched}"\r\ngit commit --allow-empty -m denied`,
    );
    spawnSync("git", ["init", "-q"], { cwd: root });
    spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
    const before = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).status;
    const result = spawnSync(
      process.execPath,
      [PREFLIGHT, "--command", "sync", "--repository", root, "--scope", ".", "--execute", "--", "--no-index"],
      {
        cwd: root,
        encoding: "utf8",
        env: fakePathEnv(fakeBin),
      },
    );

    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ authorized: false, dispatched: false });
    expect(existsSync(dispatched)).toBe(false);
    expect(spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).status).toBe(before);
    expect(HANDOVER_SKILL).toContain("Before invoking `lore link`, `lore unlink`, `lore rename`, or `lore sync`");
    expect(HANDOVER_SKILL).toContain("lore-authority-preflight.mjs");
  });

  test("explicit authority still rejects a scope outside the selected repository", () => {
    const root = fixture({});
    spawnSync("git", ["init", "-q"], { cwd: root });
    const result = spawnSync(
      process.execPath,
      [
        PREFLIGHT,
        "--command",
        "sync",
        "--repository",
        root,
        "--scope",
        join(root, "..", "outside"),
        "--explicit-commit-authority",
      ],
      { cwd: root, encoding: "utf8" },
    );

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("scope does not exist");
  });

  test("explicit authority rejects a symlinked scope that resolves outside the repository", () => {
    const root = fixture({});
    const outside = fixture({});
    symlinkSync(outside, join(root, "escape"));
    spawnSync("git", ["init", "-q"], { cwd: root });
    const result = spawnSync(
      process.execPath,
      [PREFLIGHT, "--command", "sync", "--repository", root, "--scope", "escape", "--explicit-commit-authority"],
      { cwd: root, encoding: "utf8" },
    );

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("require the exact repository root scope");
  });

  test("standing authority is bound to Lore CLI dev delivery and executes in the declared worktree", () => {
    const root = fixture({
      "AGENTS.md": "## Autonomous Lore CLI documentation campaigns\n\nAuthorized pull-request delivery to `dev`.\n",
    });
    const fakeBin = join(root, "bin");
    const executedIn = join(root, "executed-in");
    mkdirSync(fakeBin);
    installFakeLore(fakeBin, `pwd > "${executedIn}"`, `cd > "${executedIn}"`);
    spawnSync("git", ["init", "-q"], { cwd: root });

    const denied = spawnSync(
      process.execPath,
      [PREFLIGHT, "--command", "sync", "--repository", root, "--scope", ".", "--standing-delivery-authority"],
      { cwd: root, encoding: "utf8" },
    );
    expect(denied.status).toBe(4);
    expect(denied.stderr).toContain("requires --integration-branch dev");

    const allowed = spawnSync(
      process.execPath,
      [
        PREFLIGHT,
        "--command",
        "sync",
        "--repository",
        root,
        "--scope",
        ".",
        "--standing-delivery-authority",
        "--integration-branch",
        "dev",
        "--execute",
        "--",
        "--json",
      ],
      { cwd: tmpdir(), encoding: "utf8", env: fakePathEnv(fakeBin) },
    );
    expect(allowed.status).toBe(0);
    expect(realpathSync(readFileSync(executedIn, "utf8").trim())).toBe(realpathSync(root));
  });

  test("sync refuses to dispatch when unrelated dirty Backlog state is not exactly allowed", () => {
    const root = fixture({
      "AGENTS.md": "## Autonomous Lore CLI documentation campaigns\n\nAuthorized pull-request delivery to `dev`.\n",
    });
    const fakeBin = join(root, "bin");
    const backlogDirectory = join(root, "backlog", "tasks");
    const unrelatedTask = join(backlogDirectory, "lcli-999 - unrelated.md");
    const dispatched = join(root, "dispatched");
    mkdirSync(fakeBin);
    mkdirSync(backlogDirectory, { recursive: true });
    writeFileSync(unrelatedTask, "baseline\n");
    installFakeLore(fakeBin, `touch "${dispatched}"`, `type nul > "${dispatched}"`);
    spawnSync("git", ["init", "-q"], { cwd: root });
    spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
    spawnSync("git", ["add", "AGENTS.md", "backlog/tasks/lcli-999 - unrelated.md"], { cwd: root });
    spawnSync("git", ["commit", "-q", "-m", "baseline"], { cwd: root });
    writeFileSync(unrelatedTask, "unrelated dirty change\n");

    const result = spawnSync(
      process.execPath,
      [
        PREFLIGHT,
        "--command",
        "sync",
        "--repository",
        root,
        "--scope",
        ".",
        "--standing-delivery-authority",
        "--integration-branch",
        "dev",
        "--execute",
        "--",
        "--json",
      ],
      { cwd: root, encoding: "utf8", env: fakePathEnv(fakeBin) },
    );

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("outside the exact campaign allowlist");
    expect(result.stderr).toContain("backlog/tasks/lcli-999 - unrelated.md");
    expect(existsSync(dispatched)).toBe(false);
  });

  test("sync dispatches when every dirty Backlog path is exactly campaign-owned", () => {
    const root = fixture({
      "AGENTS.md": "## Autonomous Lore CLI documentation campaigns\n\nAuthorized pull-request delivery to `dev`.\n",
    });
    const fakeBin = join(root, "bin");
    const backlogDirectory = join(root, "backlog", "tasks");
    const campaignTask = join(backlogDirectory, "lcli-329 - campaign.md");
    const dispatched = join(root, "dispatched");
    mkdirSync(fakeBin);
    mkdirSync(backlogDirectory, { recursive: true });
    writeFileSync(campaignTask, "campaign dirty change\n");
    installFakeLore(fakeBin, `touch "${dispatched}"`, `type nul > "${dispatched}"`);
    spawnSync("git", ["init", "-q"], { cwd: root });

    const result = spawnSync(
      process.execPath,
      [
        PREFLIGHT,
        "--command",
        "sync",
        "--repository",
        root,
        "--scope",
        ".",
        "--allow-backlog-path",
        "backlog/tasks/lcli-329 - campaign.md",
        "--standing-delivery-authority",
        "--integration-branch",
        "dev",
        "--execute",
        "--",
        "--json",
      ],
      { cwd: root, encoding: "utf8", env: fakePathEnv(fakeBin) },
    );

    expect(result.status).toBe(0);
    expect(existsSync(dispatched)).toBe(true);
    expect(JSON.parse(result.stdout)).toMatchObject({
      allowedBacklogPaths: ["backlog/tasks/lcli-329 - campaign.md"],
      dirtyBacklogPaths: ["backlog/tasks/lcli-329 - campaign.md"],
    });
  });

  test("Lore guidance exposes every self-committing command before canonical workflow steps", () => {
    const preflight = LORE_SKILL.slice(0, LORE_SKILL.indexOf("## Start"));

    expect(preflight).toContain("`lore link`, `lore unlink`, `lore rename`, and");
    expect(preflight).toContain("`lore rename`");
    expect(preflight).toContain("`lore sync`");
    expect(preflight).toContain("repository's Lore sole-committer contract");
  });

  test("uses progressive campaign references and bounded durable-state limits", () => {
    expect(HANDOVER_SKILL).toContain("[init](references/init.md)");
    expect(HANDOVER_SKILL).toContain("[restore](references/restore.md)");
    expect(HANDOVER_SKILL).toContain("[delivery](references/delivery.md)");
    expect(HANDOVER_SKILL).toContain("[handover](references/handover.md)");
    expect(HANDOVER_SKILL).toContain("200 lines and 32 KiB");
    expect(HANDOVER_SKILL).toContain("120 lines and 16 KiB");
  });

  test("accepts active.md as the sole executable cursor", () => {
    const result = audit({ "active.md": ACTIVE });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("active.md is the sole grounded executable cursor");
  });

  test("accepts concise retained provenance with an explicit non-executable marker", () => {
    expect(audit({ "active.md": ACTIVE, "history.md": HISTORICAL }).code).toBe(0);
  });

  test("rejects a second executable lifecycle designation", () => {
    const result = audit({ "active.md": ACTIVE, "stale.md": ACTIVE });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stale.md incorrectly carries the executable-current marker");
  });

  test("rejects a stale paste-ready prompt even when the file claims to be historical", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\n## Paste-ready prompt\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("stale.md contains runnable signal(s): paste-ready prompt");
  });

  test("rejects a runnable backlog-handover restore sequence in an archive", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\nUse \`$backlog-handover\` in restore mode.\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("backlog-handover invocation");
  });

  test("rejects any backlog-handover invocation in an archive", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\nUse \`$backlog-handover status\`.\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("backlog-handover invocation");
  });

  test("rejects dotted LCLI continuation directives in an archive", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\nContinue LCLI-329.4.2\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("task resume directive");
  });

  test("rejects foreign task continuation directives in an archive", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\nResume ODOC-54\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("task resume directive");
  });

  test("rejects a safe-resume sequence in an archive", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\n## Safe resume\n\nOpen the old worktree and continue.\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("safe-resume sequence");
  });

  test("rejects formatted continuation text in an archive", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\n> **Resume LCLI-329**\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("task resume directive");
  });

  test("rejects required sections hidden in a fenced example", () => {
    const fenced = ACTIVE.replace("## Paste-ready prompt", "```markdown\n## Paste-ready prompt").replace(
      "## Exceptions",
      "```\n## Exceptions",
    );
    const result = audit({ "active.md": fenced });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("exactly one Paste-ready prompt section; found 0");
  });

  test("rejects an active pointer without the canonical lifecycle marker", () => {
    const result = audit({
      "active.md": "# Handover\n\n## Paste-ready prompt\n\nContinue this backlog campaign.\n",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("exactly one executable-current marker");
  });

  test("rejects active cursors over the compact line or byte limit", () => {
    expect(audit({ "active.md": `${ACTIVE}${"line\n".repeat(121)}` }).stderr).toContain("exceeds 120 lines");
    expect(audit({ "active.md": `${ACTIVE}${"x".repeat(16 * 1024)}` }).stderr).toContain("exceeds 16384 bytes");
  });
});
