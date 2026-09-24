import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildNudgeBody, buildSkillDoc, LORE_COMMANDS, PLUGIN_SKILL_REL_PATH } from "../src/core/agent-bridge";
import { buildCodexNudgeBody, buildCodexSkillDoc } from "../src/core/codex-bridge";
import { DETAIL_TOPICS, findInstructionTopic } from "../src/core/instructions";

/**
 * LCLI-573 (OPAG-378): the committed plugin skill drifted from the CLI with nothing to notice. It
 * listed 5 of 7 topics, omitted `read`/`types`/`backlog`, and stated the pre-LCLI-478
 * `--max-tokens` behaviour. These tests tie every agent-facing bridge to the live command and topic
 * registries, so the next command or topic cannot ship half-advertised.
 */
describe("agent bridges stay in lockstep with the CLI (LCLI-573)", () => {
  const committed = readFileSync(join(import.meta.dir, "..", PLUGIN_SKILL_REL_PATH), "utf8");

  test("the committed plugin skill is exactly the generated one", () => {
    // On failure: `bun run scripts/plugin-skill.ts --write`.
    expect(committed).toBe(buildSkillDoc("plugin"));
  });

  const bridges: ReadonlyArray<[string, string]> = [
    ["plugin skill", buildSkillDoc("plugin")],
    ["repo skill", buildSkillDoc("repo")],
    ["codex skill", buildCodexSkillDoc()],
  ];

  for (const [name, doc] of bridges) {
    test(`${name} names every instruction topic`, () => {
      for (const topic of DETAIL_TOPICS) expect(doc).toContain(`\`${topic.key}\``);
    });

    test(`${name} teaches query-then-read and carries no retired Backlog/.codex preflight`, () => {
      expect(doc).toContain('lore query "');
      expect(doc).toContain("lore read <id>");
      expect(doc).not.toContain("backlog-handover");
      expect(doc).not.toContain("preflight");
      expect(doc).not.toContain("commits under `backlog/`");
    });
  }

  for (const [name, doc] of bridges.slice(0, 2)) {
    test(`${name} lists every LORE_COMMANDS entry`, () => {
      for (const command of LORE_COMMANDS) expect(doc).toContain(`- \`${command.name}\``);
    });

    test(`${name} states --max-tokens as the hard ceiling it is (LCLI-478), not as advisory`, () => {
      expect(doc).toContain("hard ceiling");
      expect(doc).not.toContain("advisory");
    });
  }

  test("both nudges name every instruction topic and the query-then-read recipe", () => {
    for (const nudge of [buildNudgeBody("repo"), buildNudgeBody("plugin"), buildCodexNudgeBody()]) {
      for (const topic of DETAIL_TOPICS) expect(nudge).toContain(`\`${topic.key}\``);
      expect(nudge).toContain("lore query");
    }
  });

  test("`retrieval` is a served topic and the overview starts from it, not from docs/index.md", () => {
    expect(findInstructionTopic("retrieval")).toBeDefined();
    const overview = findInstructionTopic("overview")?.body ?? "";
    expect(overview.indexOf("lore query")).toBeGreaterThan(-1);
    expect(overview).not.toContain("read docs/index.md");
    // The old closing pointer named a file that exists in 1 of 10 fleet repositories.
    expect(overview).not.toContain("agent-onboarding.md");
  });
});
