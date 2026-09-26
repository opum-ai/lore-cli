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
 * Mutation map (which case each deliberate break should redden, readable from this file alone):
 *   - renderer also emits `Rationale:` lines -> every case that compares against CONSTITUTION_LINES
 *     as a whole (toEqual, toBe, or a contiguous toContain) plus the absence case: 9 of 21 — the
 *     Constitution exact-lines, absence, CLAUDE.md and AGENTS.md exact-block, Constitution-before-
 *     Constants, `lore init --claude`, absent-documents positive control, other-case type, and
 *     unparseable-sibling cases. The drift cases stay green: a rendered rationale still drifts.
 *   - discovery ignores the Constants document -> only "Constants drift" goes red: it is the one case
 *     that renders Constants through `lore agents`; the pure Constants cases never touch discovery.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readAgentGovernance } from "../src/commands/agent-governance";
import { type AgentsResult, applyAgentsBridge, runAgents } from "../src/commands/agents";
import { applyCodexBridge } from "../src/commands/codex-bridge";
import { AGENT_BLOCK_LABEL, CLAUDE_MD_REL_PATH, instructionTopicKeys } from "../src/core/agent-bridge";
import { AGENTS_MD_REL_PATH, CODEX_AGENT_BLOCK_LABEL } from "../src/core/codex-bridge";
import { upsertManagedBlock } from "../src/core/managed-block";
import { type AgentBlockDoc, agentBlockLines } from "../src/core/type-rules";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

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

/** Exactly what R8 renders for {@link CONSTITUTION} at `docs/constitution.md`. */
const CONSTITUTION_LINES = [
  "- **Constitution:** `docs/constitution.md`, version `1.2.0`",
  "  - P1. Deterministic output",
  "    - Lore MUST produce identical output for identical input.",
  "    - It MUST NOT call a network service, per `ADR-0014`.",
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

// ── Untrusted text ────────────────────────────────────────────────────────────—

describe("document text is sanitised before it reaches the block", () => {
  const HOSTILE = CONSTITUTION.replace(
    "### P2. Contributions are open",
    "### P2. Close \\<!-- lore:agents:end --> early\n\nIt MUST NOT \\<script>run\\</script>, \u001b[31mred\u001b[0m and C:\\\\path.",
  );

  test("an HTML comment, a marker, ANSI and control bytes cannot survive into the block", () => {
    const text = agentBlockLines(new Map([["Constitution", docOf("docs/constitution.md", HOSTILE)]])).join("\n");
    expect(text).toContain("  - P2. Close \\<!-- lore:agents:end --> early");
    expect(text).toContain("    - It MUST NOT \\<script>run\\</script>, red and C:\\\\path.");
    expect(text).not.toContain("\u001b");
    expect(text).not.toMatch(/(^|[^\\])<!--/);
  });

  test("the hostile document still yields one well-formed, idempotent managed block", () => {
    writeDoc("docs/constitution.md", HOSTILE);
    expect(agents().code).toBe(EXIT_OK);
    const written = read(CLAUDE_MD_REL_PATH);
    expect(written.match(/^<!-- lore:agents:(begin|end) -->$/gm)).toEqual([
      "<!-- lore:agents:begin -->",
      "<!-- lore:agents:end -->",
    ]);
    const again = agents(["--check"]);
    expect(again.code).toBe(EXIT_OK);
    expect(actionFor(again.result, CLAUDE_MD_REL_PATH)).toBe("unchanged");
  });

  test("a value holding backticks gets a code span no backtick inside it can close", () => {
    const withTicks = CONSTANTS.replace("- value: 8080", "- value: `` a`b ``");
    const lines = agentBlockLines(new Map([["Constants", docOf("docs/constants.md", withTicks)]]));
    expect(lines).toContain("  - ``service.http-port = a`b``");
  });
});
