import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function audit(files: Record<string, string>) {
  const result = spawnSync(process.execPath, [SCRIPT, fixture(files)], { encoding: "utf8" });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const ACTIVE = `# Handover — current campaign

**Lifecycle**: executable-current

## Paste-ready prompt

Continue this backlog campaign. Use \`$backlog-handover\` in restore mode.
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
    writeFileSync(join(root, "bin/lore"), `#!/bin/sh\ntouch ${dispatched}\ngit commit --allow-empty -m denied\n`);
    spawnSync("chmod", ["+x", join(root, "bin/lore")]);
    spawnSync("git", ["init", "-q"], { cwd: root });
    spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: root });
    const before = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).status;
    const result = spawnSync(
      process.execPath,
      [
        PREFLIGHT,
        "--command",
        "sync",
        "--repository",
        root,
        "--scope",
        "docs/reference",
        "--execute",
        "--",
        "--no-index",
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
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
    expect(result.stderr).toContain("scope is outside the selected repository");
  });

  test("standing authority is bound to Lore CLI dev delivery and executes in the declared worktree", () => {
    const root = fixture({
      "AGENTS.md": "## Autonomous Lore CLI documentation campaigns\n\nAuthorized pull-request delivery to `dev`.\n",
    });
    const fakeBin = join(root, "bin");
    const executedIn = join(root, "executed-in");
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "lore"), `#!/bin/sh\npwd > ${executedIn}\n`);
    spawnSync("chmod", ["+x", join(fakeBin, "lore")]);
    spawnSync("git", ["init", "-q"], { cwd: root });

    const denied = spawnSync(
      process.execPath,
      [PREFLIGHT, "--command", "sync", "--repository", root, "--scope", "docs", "--standing-delivery-authority"],
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
        "docs",
        "--standing-delivery-authority",
        "--integration-branch",
        "dev",
        "--execute",
        "--",
        "--json",
      ],
      { cwd: tmpdir(), encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } },
    );
    expect(allowed.status).toBe(0);
    expect(readFileSync(executedIn, "utf8").trim()).toBe(realpathSync(root));
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
    expect(result.stdout).toContain("active.md is the sole executable cursor");
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

  test("rejects a safe-resume sequence in an archive", () => {
    const result = audit({
      "active.md": ACTIVE,
      "stale.md": `${HISTORICAL}\n## Safe resume\n\nOpen the old worktree and continue.\n`,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("safe-resume sequence");
  });

  test("rejects an active pointer without the canonical lifecycle marker", () => {
    const result = audit({
      "active.md": "# Handover\n\n## Paste-ready prompt\n\nContinue this backlog campaign.\n",
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("active.md lacks **Lifecycle**: executable-current");
  });

  test("rejects active cursors over the compact line or byte limit", () => {
    expect(audit({ "active.md": `${ACTIVE}${"line\n".repeat(121)}` }).stderr).toContain("exceeds 120 lines");
    expect(audit({ "active.md": `${ACTIVE}${"x".repeat(16 * 1024)}` }).stderr).toContain("exceeds 16384 bytes");
  });
});
