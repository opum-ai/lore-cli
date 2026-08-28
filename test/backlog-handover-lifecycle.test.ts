import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("records the immutable shared-skill source receipt without a project shadow", () => {
  const root = join(import.meta.dir, "..");
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

  expect(existsSync(join(root, ".codex/skills/backlog-handover/SKILL.md"))).toBe(false);
  expect(agents).toContain("opum-agent shared skill source: ");
  expect(agents).toContain("Lore-authority-preflight");
});
