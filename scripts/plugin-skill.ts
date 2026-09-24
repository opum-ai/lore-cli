/**
 * scripts/plugin-skill.ts — write or check the committed plugin skill, `skills/lore/SKILL.md`.
 *
 * That file is what the `opum-lore` marketplace plugin federates from this repository by tag, so it
 * reaches every plugin user. It is generated from the same builder as the per-repository skill
 * (`buildSkillDoc("plugin")`, src/core/agent-bridge.ts) because the hand-kept copy drifted: it listed
 * 5 of 7 instruction topics, omitted `read`/`types`/`backlog`, and described `--max-tokens` as
 * advisory long after LCLI-478 made it a hard ceiling (OPAG-378, LCLI-573).
 *
 *   bun run scripts/plugin-skill.ts --write   regenerate the file
 *   bun run scripts/plugin-skill.ts --check   exit 1 if the committed file differs (test/plugin-skill.test.ts runs the same comparison)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSkillDoc, PLUGIN_SKILL_REL_PATH } from "../src/core/agent-bridge";

const path = join(import.meta.dir, "..", PLUGIN_SKILL_REL_PATH);
const want = buildSkillDoc("plugin");
const mode = process.argv[2];

if (mode === "--write") {
  writeFileSync(path, want);
  console.log(`wrote ${PLUGIN_SKILL_REL_PATH} (${Buffer.byteLength(want)} bytes)`);
} else if (mode === "--check") {
  const have = readFileSync(path, "utf8");
  if (have !== want) {
    console.error(`${PLUGIN_SKILL_REL_PATH} is stale; run \`bun run scripts/plugin-skill.ts --write\``);
    process.exit(1);
  }
  console.log(`${PLUGIN_SKILL_REL_PATH} is current (${Buffer.byteLength(have)} bytes)`);
} else {
  console.error("usage: bun run scripts/plugin-skill.ts --write | --check");
  process.exit(2);
}
