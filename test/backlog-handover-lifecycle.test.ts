import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("delegates handover authority to the user-level skill without a project shadow", () => {
  const root = join(import.meta.dir, "..");
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");

  expect(existsSync(join(root, ".codex/skills/backlog-handover/SKILL.md"))).toBe(false);
  expect(agents).toContain("The user-level `backlog-handover`");
  expect(agents).toContain("Lore-authority-preflight");
});
