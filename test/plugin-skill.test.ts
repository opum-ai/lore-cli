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
/**
 * The part of a bridge that lists instruction TOPICS, so a topic key that is also a command name
 * (`sync`, `check`, `types`, `agents`) cannot be satisfied by the command list. Skills: from
 * "## Start here" to the next heading. Nudges and the Codex skill: the text after the topic-list
 * lead-in on the same logical line.
 */
function topicSectionOf(doc: string): string {
  const start = doc.indexOf("## Start here");
  if (start >= 0) {
    const end = doc.indexOf("\n## ", start + 1);
    return doc.slice(start, end < 0 ? undefined : end);
  }
  for (const lead of ["`lore instructions <topic>` (", "Pull only the needed topic instructions: "]) {
    const at = doc.indexOf(lead);
    if (at >= 0) return doc.slice(at + lead.length, doc.indexOf("\n", at + lead.length + 1) + 1 || undefined);
  }
  throw new Error("no topic list found in bridge");
}

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
    test(`${name} names every instruction topic in its TOPIC list, not merely somewhere`, () => {
      // Asserting a bare \`key\` passed with topics missing: sync/check/types/agents are also
      // command names, so the command list satisfied it (review of #237). Assert the topic rows.
      const topicSection = topicSectionOf(doc);
      for (const topic of DETAIL_TOPICS) expect(topicSection).toContain(`\`${topic.key}\``);
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
      const topicSection = topicSectionOf(nudge);
      for (const topic of DETAIL_TOPICS) expect(topicSection).toContain(`\`${topic.key}\``);
      expect(nudge).toContain("lore query");
    }
  });

  test("the plugin skill teaches the pane verb and its fallback, and the repo skill does not (LCLI-668)", () => {
    // The pane verb routes to a tool the `opum-lore` mod registers, so only the copy the
    // plugin federates may teach it: a per-repository bridge (`lore agents`) is written into
    // repositories whose Claude Code loads no mod, and pointing them at a tool that is not
    // there is the "unshipped command" trap this file exists to catch, in a new shape.
    const plugin = buildSkillDoc("plugin");
    expect(plugin).toContain("mcp__opum-lore__dashboard");
    expect(plugin).toContain("lore dashboard");
    // The entry-point arguments the rename decision settled (LCLI-667, opum-doc relay
    // ODOC-OP-2026-10-03-07): the skill owns the bare name `lore`, so the tool is reached
    // through it, and each argument has to be routed rather than fall through to the CLI.
    for (const argument of ["dashboard", "pane", "full"]) expect(plugin).toContain(`\`${argument}\``);
    expect(plugin).toContain("`full: true`");
    expect(plugin).toContain("its `doc` or `query`");
    // The fallback names all three ways the tool is unavailable, and what to do instead.
    expect(plugin).toContain("2.1.287");
    expect(plugin).toContain("claude -p");
    expect(plugin).toContain("mods turned off");
    expect(plugin).toContain("lore read <id>");
    // Everything else still goes through the CLI.
    expect(plugin).toContain("goes through the `lore` CLI");
    expect(buildSkillDoc("repo")).not.toContain("mcp__opum-lore__dashboard");
  });

  test("`retrieval` is a served topic and the overview starts from it, not from docs/index.md", () => {
    expect(findInstructionTopic("retrieval")).toBeDefined();
    const overview = findInstructionTopic("overview")?.body ?? "";
    expect(overview.indexOf("lore query")).toBeGreaterThan(-1);
    expect(overview.indexOf("lore query")).toBeLessThan(overview.indexOf("lore sync"));
    expect(overview).not.toContain("read docs/index.md");
    // The old closing pointer named a file that exists in 1 of 10 fleet repositories.
    expect(overview).not.toContain("agent-onboarding.md");
  });
});
