import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "../.codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs");
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
    expect(result.stderr).toContain("backlog-handover restore invocation");
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
});
