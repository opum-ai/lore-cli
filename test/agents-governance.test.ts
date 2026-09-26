/**
 * agents-governance.test.ts — `lore agents` renders the Constitution core and the Constants pointer
 * into its managed block (LCLI-597, OPAG-425 R8).
 *
 * Maps to the task's acceptance criteria:
 *   AC1 — exactly path, version and principle ids with MUST / MUST NOT lines for a Constitution, and
 *         exactly the trigger line plus hot `id = value` lines for Constants: exact bytes for a
 *         fixture of each, plus absence assertions for everything R8 says to leave out.
 *   AC2 — `lore agents --check` reports drift after either document changes, each proven separately
 *         and each with a positive control (the unchanged document reports no drift).
 * And the guarantee every fleet repository depends on: with neither document, the managed block is
 * byte-identical to the pre-R8 block, pinned against LITERAL pre-R8 text rather than the code under
 * test.
 *
 * Mutation map (which case each deliberate break should redden, readable from this file alone; 43
 * cases). Each prediction was written here before the mutation was run.
 *   - discovery ignores the Constants document -> only "Constants drift" goes red: it is the one case
 *     that renders Constants through `lore agents`; the pure Constants cases never touch discovery.
 *   - B1 reverted (rules judged and rendered line by line, as first built) -> 3 of 43: the wrapped
 *     exact-bytes case, the review's-example case, and the unlabelled positive control. Every other
 *     Constitution fixture writes one rule per single-line paragraph, which both forms render alike;
 *     and the "Rationale: / **Check:** line" case stays green, because the line-based form also
 *     dropped a line that STARTS with a label.
 *   - S1 reverted (escape only `\` and `<`) -> 22 of 43: every case pinning escaped punctuation from
 *     CONSTITUTION_LINES (Constitution exact-lines, CLAUDE.md and AGENTS.md blocks, Constitution-
 *     before-Constants, `lore init --claude`, absent-documents positive control, other-case type,
 *     unparseable sibling, S2 tracked-over-ignored, S5 unreadable), the wrapped exact-bytes case, 7 of
 *     the 9 inert classes (heading, blockquote, list item, fence, link, emphasis, entity; the HTML
 *     comment and tag stay inert because `<` is still escaped), the stray backtick, the principle-name
 *     case, the hostile block, and the S3 rule case (its `.`). Constants cases stay green: their text is
 *     lore's own or inside code spans.
 *   - S3: the ANSI/control strip removed from prose -> 2 of 43: the two S3 cases, the only fixtures
 *     carrying those bytes in prose.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { readAgentGovernance } from "../src/commands/agent-governance";
import { type AgentsResult, applyAgentsBridge, runAgents } from "../src/commands/agents";
import { applyCodexBridge } from "../src/commands/codex-bridge";
import { AGENT_BLOCK_LABEL, CLAUDE_MD_REL_PATH, instructionTopicKeys } from "../src/core/agent-bridge";
import { nodeText, walkMdast } from "../src/core/bundle";
import { AGENTS_MD_REL_PATH, CODEX_AGENT_BLOCK_LABEL } from "../src/core/codex-bridge";
import { upsertManagedBlock } from "../src/core/managed-block";
import { type AgentBlockDoc, agentBlockLines } from "../src/core/type-rules";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, gitRun } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agents-governance-"));
  // An ordinary document, so "neither governance document" is a real bundle, not an empty one.
  writeDoc(
    "docs/guide.md",
    "---\ntype: Reference\ntitle: Guide\nsummary: An ordinary document.\n---\n\n# Guide\n\nYou MUST read this.\n",
  );
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeDoc(rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

/** Run `lore agents` in JSON mode; plugin detection is off (bunfig preload), so it is synchronous. */
function agents(args: string[] = []): { code: number; result: AgentsResult } {
  const stdout = capture();
  const code = runAgents({ root, output: JSON_CTX, args, stdout });
  if (code instanceof Promise) throw new Error("runAgents returned a Promise with plugin detection off");
  return { code, result: (JSON.parse(stdout.text()) as { data: AgentsResult }).data };
}

function actionFor(result: AgentsResult, path: string): string | undefined {
  return result.files.find((file) => file.path === path)?.action;
}

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

// ── The pre-R8 nudge bodies, written out literally ─────────────────────────────—
// Only the topic list is derived: it is the instructions module's own index, not R8's to change.

const PRE_R8_CLAUDE_NUDGE = `This repo uses **lore** — an OKF-native documentation CLI — for the docs bundle under \`docs/\`.
Drive docs work through \`lore\` (not a plain editor or \`grep\`) so Story <-> Task coupling, managed
blocks, and cross-links stay coherent.

- **Find and read docs:** \`lore query "<words>" --limit 5\`, then \`lore read <id>\` for the best hit.
- **Skill:** \`.claude/skills/lore/SKILL.md\` — how to drive lore.
- **Just-in-time detail:** run \`lore instructions\` for the canonical agent loop, then
  \`lore instructions <topic>\` (${instructionTopicKeys()}).`;

const PRE_R8_CODEX_NUDGE = `This repo uses **lore** — an OKF-native documentation CLI — for the docs bundle under \`docs/\`.
When working on documentation, drive it through \`lore\` (not a plain editor) so Story <-> Task
coupling, managed blocks, and cross-links stay coherent.

- **Find and read docs:** \`lore query "<words>" --limit 5\`, then \`lore read <id>\` for the best hit.
- **Skill:** \`.codex/skills/lore/SKILL.md\` — how to drive lore.
- **Just-in-time detail:** run \`lore instructions\` for the canonical agent loop, then
  \`lore instructions <topic>\` (${instructionTopicKeys()}).`;

// ── Fixtures ──────────────────────────────────────────────────────────────────—

/**
 * A Constitution holding every kind of text R8 leaves out: a preamble, SHOULD and MAY lines, plain
 * prose, a `MUST` quoted in code, `Rationale:` and `Check:` lines that themselves say MUST, a `###`
 * heading that is no principle, and Governance text that says MUST.
 */
const CONSTITUTION = `---
type: Constitution
title: Project constitution
summary: The principles this project holds.
version: 1.2.0
ratified: "2026-01-01"
last_amended: "2026-02-01"
amendment_authority: project maintainers
---

# Project constitution

The preamble MUST NOT be rendered.

## Principles

### P1. Deterministic output

Lore MUST produce identical output for identical input.

It MUST NOT call a network service, per \`ADR-0014\`.

Output SHOULD stay small.

Plain prose with no keyword at all.

Rationale: agents MUST be able to diff two runs.

Check: reviewers MUST confirm, and CI runs \`bun test\`.

### P2. Contributions are open

Contributors MAY propose a change.

Quoting \`MUST\` in code is not a rule.

Rationale: keep the door open.

Check: review only.

### Not a principle heading

This heading MUST be skipped.

## Governance

Amendments MUST go through review.

## Amendment log

| Version | Date | Change | ADR |
|---|---|---|---|
| 1.2.0 | 2026-02-01 | Opened contributions. | |
`;

/**
 * Exactly what R8 renders for {@link CONSTITUTION} at `docs/constitution.md`. Every ASCII punctuation
 * character in document prose is backslash-escaped (review S1), so `.` reads `\.` in the raw block
 * and renders as `.`; lore's own text (the label, the path and version code spans, the `P<n>.` id)
 * is not.
 */
const CONSTITUTION_LINES = [
  "- **Constitution:** `docs/constitution.md`, version `1.2.0`",
  "  - P1. Deterministic output",
  "    - Lore MUST produce identical output for identical input\\.",
  "    - It MUST NOT call a network service\\, per `ADR-0014`\\.",
  "  - P2. Contributions are open",
];

/** A Constants document with hot and non-hot entries in every status. */
const CONSTANTS = `---
type: Constants
title: Project constants
summary: The values this project must not let drift.
version: 2.0.0
last_reviewed: "2026-02-01"
owner: project maintainers
---

# Project constants

## Naming

### package.name

- value: \`@opum-ai/lore\`
- meaning: The npm package name.
- source_of_truth: this-doc
- status: active
- hot: true

### tracker.prefix

- value: \`LCLI\`
- meaning: The Quest task id prefix.
- source_of_truth: this-doc
- status: active
- hot: false

### docs.root

- value: \`docs\`
- meaning: The bundle directory.
- source_of_truth: this-doc
- status: active

## Retired names

### package.old-name

- value: \`lore-cli-legacy\`
- meaning: The name before the rename.
- source_of_truth: this-doc
- status: deprecated
- replaced_by: package.name
- hot: true

### package.ancient-name

- value: \`lorecli\`
- meaning: The first name.
- source_of_truth: this-doc
- status: retired
- hot: true

## Ports

### service.http-port

- value: 8080
- meaning: The port the service listens on.
- source_of_truth: this-doc
- status: active
- hot: true
`;

/** Exactly what R8 renders for {@link CONSTANTS} at `docs/constants.md`. */
const CONSTANTS_LINES = [
  "- **Constants:** before writing or changing a name, identifier, prefix, URL or pinned value, read `docs/constants.md`.",
  "  - `package.name = @opum-ai/lore`",
  "  - `service.http-port = 8080`",
];

/** The frontmatter + body split `lore agents` reads a document into (the body starts after the fence). */
function docOf(path: string, text: string): AgentBlockDoc {
  const close = text.indexOf("\n---\n", 4);
  const frontmatter: Record<string, unknown> = {};
  for (const line of text.slice(4, close).split("\n")) {
    const at = line.indexOf(":");
    frontmatter[line.slice(0, at)] = line.slice(at + 1).trim();
  }
  return { path, frontmatter, body: text.slice(close + 5) };
}

// ── AC1: rendering ────────────────────────────────────────────────────────────—

describe("AC1 — the Constitution core: path, version, principle ids with MUST / MUST NOT lines", () => {
  test("renders exactly the path, the version, and each principle id with its MUST / MUST NOT lines", () => {
    const lines = agentBlockLines(new Map([["Constitution", docOf("docs/constitution.md", CONSTITUTION)]]));
    expect(lines).toEqual(CONSTITUTION_LINES);
  });

  test("renders no rationale, no Check: line, no SHOULD / MAY line, no prose, no preamble or governance", () => {
    const text = agentBlockLines(new Map([["Constitution", docOf("docs/constitution.md", CONSTITUTION)]])).join("\n");
    for (const absent of [
      "Rationale",
      "diff two runs",
      "Check:",
      "reviewers MUST confirm",
      "SHOULD",
      "MAY",
      "Plain prose",
      "Quoting",
      "preamble",
      "Not a principle heading",
      "Governance",
      "Amendments MUST",
    ]) {
      expect(text).not.toContain(absent);
    }
  });

  test("`lore agents` writes the core into CLAUDE.md's managed block, byte for byte", () => {
    writeDoc("docs/constitution.md", CONSTITUTION);
    expect(agents().code).toBe(EXIT_OK);
    expect(read(CLAUDE_MD_REL_PATH)).toBe(
      upsertManagedBlock("", {
        label: AGENT_BLOCK_LABEL,
        body: `${PRE_R8_CLAUDE_NUDGE}\n${CONSTITUTION_LINES.join("\n")}`,
      }),
    );
  });

  test("`lore init --codex` writes the same core into AGENTS.md's managed block, byte for byte", () => {
    writeDoc("docs/constitution.md", CONSTITUTION);
    applyCodexBridge({ root, force: false, check: false });
    expect(read(AGENTS_MD_REL_PATH)).toBe(
      upsertManagedBlock("", {
        label: CODEX_AGENT_BLOCK_LABEL,
        body: `${PRE_R8_CODEX_NUDGE}\n${CONSTITUTION_LINES.join("\n")}`,
      }),
    );
  });
});

describe("AC1 — the Constants pointer: one trigger line plus hot `id = value` lines", () => {
  test("renders exactly the trigger line and one `id = value` line per hot, active entry", () => {
    const lines = agentBlockLines(new Map([["Constants", docOf("docs/constants.md", CONSTANTS)]]));
    expect(lines).toEqual(CONSTANTS_LINES);
  });

  test("renders no non-hot, hot: false, deprecated or retired entry, and no other field", () => {
    const text = agentBlockLines(new Map([["Constants", docOf("docs/constants.md", CONSTANTS)]])).join("\n");
    for (const absent of [
      "tracker.prefix", // hot: false
      "docs.root", // no hot field
      "package.old-name", // hot, but deprecated
      "package.ancient-name", // hot, but retired
      "meaning",
      "The npm package name",
      "source_of_truth",
      "this-doc",
      "status",
    ]) {
      expect(text).not.toContain(absent);
    }
  });

  test("renders the Constitution before Constants, whatever order the caller's map holds them in", () => {
    const docs = new Map<string, AgentBlockDoc>([
      ["Constants", docOf("docs/constants.md", CONSTANTS)],
      ["Constitution", docOf("docs/constitution.md", CONSTITUTION)],
    ]);
    expect(agentBlockLines(docs)).toEqual([...CONSTITUTION_LINES, ...CONSTANTS_LINES]);
  });
});

// ── AC2: drift ────────────────────────────────────────────────────────────────—

describe("AC2 — `lore agents --check` reports drift after either document changes", () => {
  test("Constitution drift: unchanged reports none; an edited MUST line is drift in CLAUDE.md", () => {
    writeDoc("docs/constitution.md", CONSTITUTION);
    expect(agents().code).toBe(EXIT_OK);
    // Positive control: the same document, re-checked, is not drift.
    const clean = agents(["--check"]);
    expect(clean.code).toBe(EXIT_OK);
    expect(actionFor(clean.result, CLAUDE_MD_REL_PATH)).toBe("unchanged");

    writeDoc("docs/constitution.md", CONSTITUTION.replace("identical output", "byte-identical output"));
    const stale = agents(["--check"]);
    expect(stale.code).toBe(EXIT_CODES.drift);
    expect(actionFor(stale.result, CLAUDE_MD_REL_PATH)).toBe("updated");
  });

  test("Constants drift: unchanged reports none; a changed hot value is drift in CLAUDE.md", () => {
    writeDoc("docs/constants.md", CONSTANTS);
    expect(agents().code).toBe(EXIT_OK);
    expect(read(CLAUDE_MD_REL_PATH)).toContain(CONSTANTS_LINES.join("\n"));
    const clean = agents(["--check"]);
    expect(clean.code).toBe(EXIT_OK);
    expect(actionFor(clean.result, CLAUDE_MD_REL_PATH)).toBe("unchanged");

    writeDoc("docs/constants.md", CONSTANTS.replace("- value: 8080", "- value: 8081"));
    const stale = agents(["--check"]);
    expect(stale.code).toBe(EXIT_CODES.drift);
    expect(actionFor(stale.result, CLAUDE_MD_REL_PATH)).toBe("updated");
  });

  test("the Codex block drifts with the Constitution too, and `lore init --codex` writes what `--check` expects", () => {
    writeDoc("docs/constitution.md", CONSTITUTION);
    applyCodexBridge({ root, force: false, check: false });
    const clean = agents(["--check"]);
    expect(actionFor(clean.result, AGENTS_MD_REL_PATH)).toBe("unchanged");

    writeDoc("docs/constitution.md", CONSTITUTION.replace("version: 1.2.0", "version: 1.3.0"));
    const stale = agents(["--check", "--target", "codex"]);
    expect(stale.code).toBe(EXIT_CODES.drift);
    expect(actionFor(stale.result, AGENTS_MD_REL_PATH)).toBe("updated");
  });

  test("`lore init --claude` writes the block `lore agents --check` expects (the scoped path renders too)", () => {
    writeDoc("docs/constitution.md", CONSTITUTION);
    applyAgentsBridge({ root, force: false, check: false });
    const clean = agents(["--check"]);
    expect(clean.code).toBe(EXIT_OK);
    expect(read(CLAUDE_MD_REL_PATH)).toContain(CONSTITUTION_LINES.join("\n"));
  });
});

// ── Absent documents: byte-identical to the pre-R8 block ─────────────────────—

describe("with neither document, the managed block is byte-identical to the pre-R8 block", () => {
  test("CLAUDE.md: a bundle with no Constitution or Constants gets exactly the pre-R8 block", () => {
    expect(agents().code).toBe(EXIT_OK);
    expect(read(CLAUDE_MD_REL_PATH)).toBe(
      upsertManagedBlock("", { label: AGENT_BLOCK_LABEL, body: PRE_R8_CLAUDE_NUDGE }),
    );
    // Positive control over the SAME fixture: the walk that found nothing does find a Constitution.
    writeDoc("docs/constitution.md", CONSTITUTION);
    expect(readAgentGovernance(root)).toEqual(CONSTITUTION_LINES);
  });

  test("AGENTS.md: a bundle with no Constitution or Constants gets exactly the pre-R8 block", () => {
    applyCodexBridge({ root, force: false, check: false });
    expect(read(AGENTS_MD_REL_PATH)).toBe(
      upsertManagedBlock("", { label: CODEX_AGENT_BLOCK_LABEL, body: PRE_R8_CODEX_NUDGE }),
    );
  });

  test("no docs/ directory at all renders nothing and fails nothing", () => {
    rmSync(join(root, "docs"), { recursive: true, force: true });
    expect(readAgentGovernance(root)).toEqual([]);
    expect(agents().code).toBe(EXIT_OK);
    expect(read(CLAUDE_MD_REL_PATH)).toBe(
      upsertManagedBlock("", { label: AGENT_BLOCK_LABEL, body: PRE_R8_CLAUDE_NUDGE }),
    );
  });
});

// ── Which documents count ─────────────────────────────────────────────────────—

describe("discovery resolves types the way `lore check` does", () => {
  test("a profile's OWN Constitution declaration renders nothing (OPAG-425 Amendment 3, R12)", () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      [
        "[profile]",
        'name = "custom"',
        'okf_version = "0.2"',
        "",
        "[base.fields]",
        "type = { required = true }",
        "title = {}",
        "summary = {}",
        "",
        "[[types]]",
        'name = "Reference"',
        "",
        "[[types]]",
        'name = "Constitution"',
        "",
      ].join("\n"),
    );
    writeDoc("docs/constitution.md", CONSTITUTION);
    expect(readAgentGovernance(root)).toEqual([]);
  });

  test("a type written in another case still resolves to the built-in type", () => {
    writeDoc("docs/constitution.md", CONSTITUTION.replace("type: Constitution", "type: constitution"));
    expect(readAgentGovernance(root)).toEqual(CONSTITUTION_LINES);
  });

  test("with two Constitutions, the first in sorted path order is the one rendered", () => {
    writeDoc("docs/b/constitution.md", CONSTITUTION.replace("version: 1.2.0", "version: 9.9.9"));
    writeDoc("docs/a/constitution.md", CONSTITUTION);
    expect(readAgentGovernance(root)[0]).toBe("- **Constitution:** `docs/a/constitution.md`, version `1.2.0`");
  });

  test("a document whose frontmatter cannot be parsed is skipped, not fatal", () => {
    writeDoc("docs/broken.md", "---\ntype: [unclosed\n---\n\n# Broken\n");
    writeDoc("docs/constitution.md", CONSTITUTION);
    expect(readAgentGovernance(root)).toEqual(CONSTITUTION_LINES);
  });
});

// ── B1: a rule is a whole paragraph ───────────────────────────────────────────—

/** A Constitution whose `## Principles` section is exactly `principles`; valid apart from what a case puts there. */
function constitutionWith(principles: string): string {
  return `---
type: Constitution
title: Constitution
summary: A fixture constitution.
version: 1.0.0
ratified: "2026-01-01"
last_amended: "2026-01-01"
amendment_authority: project maintainers
---

# Constitution

## Principles

${principles}

## Governance

Amendments are made by pull request.

## Amendment log

| Version | Date | Change | ADR |
|---|---|---|---|
| 1.0.0 | 2026-01-01 | Initial ratification. | |
`;
}

/** Render a Constitution through the facet, as `lore agents` does. */
function renderConstitution(text: string): string[] {
  return agentBlockLines(new Map([["Constitution", docOf("docs/constitution.md", text)]]));
}

/**
 * Principles written the way this fleet writes markdown, hard-wrapped at 100 columns. P3's first
 * paragraph is the review's own example: its condition is on the line after its MUST, and its
 * Rationale continuation line ("agent that MUST act fast still waits") says MUST too.
 */
const WRAPPED = constitutionWith(`### P3. Destructive git operations

An agent MUST force-push, rewrite history, or delete a remote branch only after the user has
approved that exact operation in the current session.

Rationale: the cost of a wrong destructive operation is unbounded, and even an
agent that MUST act fast still waits.

Check: review only; for the session under review, the reviewer confirms each rule
that MUST hold did.

### P4. Provenance

Every commit MUST carry a sign-off trailer naming the human accountable for it, and the trailer
MUST NOT be added by the agent on its own.
Rationale: provenance survives only if a human asserts it.
**Check:** CI MUST reject an unsigned commit on a protected branch.

A MUST rule broken by a hard line break\\
still renders as one rule.`);

/** Exactly what R8 renders for {@link WRAPPED}. */
const WRAPPED_LINES = [
  "- **Constitution:** `docs/constitution.md`, version `1.0.0`",
  "  - P3. Destructive git operations",
  "    - An agent MUST force\\-push\\, rewrite history\\, or delete a remote branch only after the user has approved that exact operation in the current session\\.",
  "  - P4. Provenance",
  "    - Every commit MUST carry a sign\\-off trailer naming the human accountable for it\\, and the trailer MUST NOT be added by the agent on its own\\.",
  "    - A MUST rule broken by a hard line break still renders as one rule\\.",
];

describe("B1 — a MUST rule is its whole paragraph, and rationale and checks never render", () => {
  test("a 100-column hard-wrapped Constitution renders each rule whole, byte for byte", () => {
    expect(renderConstitution(WRAPPED)).toEqual(WRAPPED_LINES);
  });

  test("the review's example: the wrapped condition is kept, the wrapped Rationale is not a rule", () => {
    const text = renderConstitution(WRAPPED).join("\n");
    expect(text).toContain("only after the user has approved that exact operation in the current session");
    // Each of these continuation lines says MUST, which is what made a line-based render list it.
    expect(text).not.toContain("act fast");
    expect(text).not.toContain("still waits");
    expect(text).not.toContain("reviewer confirms");
    expect(text).not.toContain("hold did");
  });

  test("a Rationale: or bold **Check:** line with no blank line before it still ends the rule", () => {
    const text = renderConstitution(WRAPPED).join("\n");
    expect(text).not.toContain("provenance survives");
    expect(text).not.toContain("reject an unsigned commit");
  });

  test("positive control: without its Rationale: label, the same text would have been part of the rule", () => {
    // Positive control for the cut: the same paragraph WITHOUT its label line renders the text that
    // follows, so the absence above is the label's doing and not a lost paragraph.
    const unlabelled = WRAPPED.replace("Rationale: provenance survives", "Provenance survives");
    expect(renderConstitution(unlabelled).join("\n")).toContain("Provenance survives only if a human asserts it");
  });
});

// ── S1, S3: document text is inert in the block ───────────────────────────────—

/** Node types that would make document text act as markdown in the block. */
const LIVE_MARKDOWN = new Set([
  "html",
  "heading",
  "blockquote",
  "code",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "definition",
  "emphasis",
  "thematicBreak",
]);

/** The block's lines parsed as markdown: every live node type found, every code span, and each list item's text. */
function parsed(lines: readonly string[]): { live: string[]; code: string[]; items: string[] } {
  const live: string[] = [];
  const code: string[] = [];
  const items: string[] = [];
  walkMdast(fromMarkdown(lines.join("\n")), (node) => {
    if (LIVE_MARKDOWN.has(node.type)) live.push(node.type);
    if (node.type === "inlineCode") code.push(node.value);
    if (node.type === "listItem") {
      const paragraph = node.children[0];
      if (paragraph?.type === "paragraph") items.push(nodeText(paragraph));
    }
  });
  return { live, code, items };
}

/**
 * One case per class of markdown a review found live in the block: each principle paragraph below is
 * written with source escapes, so its TEXT is the literal in `shows`, and that literal must come back
 * out of the rendered block as plain text, not as markup.
 */
const INERT_CASES: ReadonlyArray<{ readonly name: string; readonly source: string; readonly shows: string }> = [
  {
    name: "an HTML comment",
    source: "A \\<!-- hidden --\\> comment MUST stay visible.",
    shows: "A <!-- hidden --> comment MUST stay visible.",
  },
  {
    name: "an inline HTML tag",
    source: "A \\<b>bold\\</b> tag MUST stay literal.",
    shows: "A <b>bold</b> tag MUST stay literal.",
  },
  { name: "a heading", source: "\\# A heading MUST stay a sentence.", shows: "# A heading MUST stay a sentence." },
  { name: "a blockquote", source: "\\> A quote MUST stay a sentence.", shows: "> A quote MUST stay a sentence." },
  { name: "a list item", source: "\\- A dash MUST stay a sentence.", shows: "- A dash MUST stay a sentence." },
  {
    name: "a code fence opener",
    source: "\\`\\`\\` A fence MUST stay a sentence.",
    shows: "``` A fence MUST stay a sentence.",
  },
  {
    name: "a link",
    source: "A \\[link](https://example.com) MUST stay text.",
    shows: "A [link](https://example.com) MUST stay text.",
  },
  { name: "emphasis", source: "A \\*star\\* MUST stay literal.", shows: "A *star* MUST stay literal." },
  { name: "an entity", source: "An &amp;amp; MUST stay literal.", shows: "An &amp; MUST stay literal." },
];

describe("S1 — every class of markdown in document prose renders as literal text", () => {
  for (const { name, source, shows } of INERT_CASES) {
    test(`${name} in a rule renders inert`, () => {
      const lines = renderConstitution(constitutionWith(`### P1. Inert text\n\n${source}`));
      const block = parsed(lines);
      expect(block.live).toEqual([]);
      expect(block.items).toEqual(["Constitution: docs/constitution.md, version 1.0.0", "P1. Inert text", shows]);
    });
  }

  test("a stray backtick cannot pair with a later code span and make its content live", () => {
    const lines = renderConstitution(
      constitutionWith("### P1. Inert text\n\nA stray \\` tick MUST NOT pair with `code` later."),
    );
    const block = parsed(lines);
    expect(block.code).toEqual(["docs/constitution.md", "1.0.0", "code"]);
    expect(block.items[2]).toBe("A stray ` tick MUST NOT pair with code later.");
  });

  test("a principle NAME is escaped the same way; its validated P<n>. id is kept verbatim", () => {
    // Source escapes, so the heading's TEXT carries the literal `*`, `[`, `]`, `(` and `)`.
    const lines = renderConstitution(constitutionWith("### P7. A \\*starred\\* \\[name](x)\n\nIt MUST hold."));
    expect(lines[1]).toBe("  - P7. A \\*starred\\* \\[name\\]\\(x\\)");
    expect(parsed(lines).live).toEqual([]);
  });

  test("a hostile document still yields one well-formed, idempotent managed block", () => {
    writeDoc(
      "docs/constitution.md",
      constitutionWith(
        "### P2. Close \\<!-- lore:agents:end --> early\n\nIt MUST NOT \\<script>run\\</script> or C:\\\\path.",
      ),
    );
    expect(agents().code).toBe(EXIT_OK);
    const written = read(CLAUDE_MD_REL_PATH);
    expect(written.match(/^<!-- lore:agents:(begin|end) -->$/gm)).toEqual([
      "<!-- lore:agents:begin -->",
      "<!-- lore:agents:end -->",
    ]);
    expect(written).toContain("    - It MUST NOT \\<script\\>run\\<\\/script\\> or C\\:\\\\path\\.");
    const again = agents(["--check"]);
    expect(again.code).toBe(EXIT_OK);
    expect(actionFor(again.result, CLAUDE_MD_REL_PATH)).toBe("unchanged");
  });

  test("a value holding backticks gets a code span no backtick inside it can close", () => {
    const withTicks = CONSTANTS.replace("- value: 8080", "- value: `` a`b ``");
    const lines = agentBlockLines(new Map([["Constants", docOf("docs/constants.md", withTicks)]]));
    expect(lines).toContain("  - ``service.http-port = a`b``");
  });

  test("a value holding an HTML comment delimiter is neutralised inside its code span too", () => {
    const withComment = CONSTANTS.replace("- value: 8080", "- value: `<!-- x -->`");
    const lines = agentBlockLines(new Map([["Constants", docOf("docs/constants.md", withComment)]]));
    expect(lines).toContain("  - `service.http-port = &lt;!-- x --&gt;`");
  });
});

describe("S3 — ANSI escapes and control bytes are stripped, in a principle name and in a rule", () => {
  test("a principle heading carrying ANSI and control bytes renders without them", () => {
    const lines = renderConstitution(
      constitutionWith("### P1. Colour \u001b[31mred\u001b[0m\u0007 name\n\nIt MUST hold."),
    );
    expect(lines[1]).toBe("  - P1. Colour red name");
  });

  test("a rule carrying ANSI and control bytes renders without them", () => {
    const lines = renderConstitution(
      constitutionWith("### P1. Plain\n\nIt MUST \u001b[1mnot\u001b[22m ring\u0007 a bell."),
    );
    expect(lines[2]).toBe("    - It MUST not ring a bell\\.");
  });
});

// ── S2, S5: what discovery reads ──────────────────────────────────────────────—

describe("S2 — a git-ignored document is never rendered, as `lore check` never judges one", () => {
  test("an ignored draft Constitution loses to the tracked one; outside git it would have won", () => {
    writeDoc("docs/constitution.md", CONSTITUTION);
    writeDoc("docs/a-drafts/constitution.md", CONSTITUTION.replace("version: 1.2.0", "version: 9.9.9"));
    // Positive control: with no git repository nothing is ignored, and the draft sorts first.
    expect(readAgentGovernance(root)[0]).toBe("- **Constitution:** `docs/a-drafts/constitution.md`, version `9.9.9`");

    gitRun(root, ["init", "-q"]);
    writeFileSync(join(root, ".gitignore"), "docs/a-drafts/\n");
    expect(readAgentGovernance(root)).toEqual(CONSTITUTION_LINES);
  });

  test("an individually ignored file is skipped too", () => {
    writeDoc("docs/constants.md", CONSTANTS);
    gitRun(root, ["init", "-q"]);
    writeFileSync(join(root, ".gitignore"), "docs/constants.md\n");
    expect(readAgentGovernance(root)).toEqual([]);
  });
});

describe("S5 — a broken document is skipped; a broken bundle index fails naming docs/index.md", () => {
  test("an unreadable document is skipped, not fatal", () => {
    writeDoc("docs/a-unreadable.md", CONSTITUTION);
    writeDoc("docs/constitution.md", CONSTITUTION);
    chmodSync(join(root, "docs/a-unreadable.md"), 0o000);
    try {
      let unreadable = false;
      try {
        readFileSync(join(root, "docs/a-unreadable.md"), "utf8");
      } catch {
        unreadable = true;
      }
      if (!unreadable) {
        return; // root (or Windows) can still read a 000-mode file, so the case cannot be set up
      }
      expect(readAgentGovernance(root)).toEqual(CONSTITUTION_LINES);
      expect(agents().code).toBe(EXIT_OK);
    } finally {
      chmodSync(join(root, "docs/a-unreadable.md"), 0o644);
    }
  });

  test("a malformed docs/index.md fails loud, and the error names docs/index.md", () => {
    writeDoc("docs/index.md", "---\ntype: Reference\ntitle: Index\nokf_version: 5\n---\n\n# Index\n");
    let error: unknown;
    try {
      readAgentGovernance(root);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).type).toBe("validation");
    expect((error as LoreError).message).toStartWith("docs/index.md: ");
  });

  test("unparseable YAML in docs/index.md names docs/index.md too", () => {
    writeDoc("docs/index.md", "---\ntype: [unclosed\n---\n\n# Index\n");
    expect(() => readAgentGovernance(root)).toThrow("docs/index.md");
  });
});
