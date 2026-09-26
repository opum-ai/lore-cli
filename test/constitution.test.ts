/**
 * LCLI-595 (OPAG-425 R1-R4, R9): the built-in Constitution type — its shape rules enforced by
 * `lore check` (not only `lore validate`), its one-per-bundle singleton rule, and the template
 * `lore new constitution` writes. Every failure mode AC#1 names has its own test, each starting
 * from {@link VALID} and breaking exactly one thing, so a test that goes red names one rule.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runInit } from "../src/commands/init";
import { type NewResult, runNew } from "../src/commands/new";
import { runValidate } from "../src/commands/validate";
import { defaultProfile, loadProfile, profileForBundle } from "../src/core/profile";
import { PRINCIPLES_LINE_BUDGET } from "../src/core/type-rules";
import { validateConceptText } from "../src/core/validate";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");

/** A Constitution that satisfies every rule: the base every failure-mode test breaks once. */
const VALID = `---
type: Constitution
title: Project constitution
summary: The project's durable principles and how they change.
version: 1.2.0
ratified: "2026-01-10"
last_amended: "2026-09-01"
amendment_authority: project maintainers
---

# Project constitution

## Principles

### P1. Gates enforce rules

Every rule MUST name the gate that verifies it.

Rationale: a rule nothing verifies drifts unnoticed.

Check: the CI job that runs \`lore check\`.

### P3. Keep principles short

Principles SHOULD stay brief.

- Rationale: this section is loaded into every agent session.
- Check: review only.

## Governance

Amendments are agent-drafted and human-ratified by pull request, each linked to an ADR.

## Amendment log

| Version | Date | Change |
|---|---|---|
| 1.2.0 | 2026-09-01 | Added P3. |
| 1.0.0 | 2026-01-10 | Initial ratification. |
`;

/** {@link VALID} with `from` replaced by `to`, failing loud if `from` is absent (so a stale fixture edit cannot pass silently). */
function mutate(from: string | RegExp, to: string, source: string = VALID): string {
  const next = source.replace(from, to);
  if (next === source) {
    throw new Error(`fixture mutation did not apply: ${String(from)}`);
  }
  return next;
}

interface CheckFindingJson {
  readonly severity: "error" | "warning";
  readonly rule: string;
  readonly file: string;
  readonly message: string;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-constitution-"));
  runInit({ root, args: ["--allow-no-git"], output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a bundle document at `docs/<rel>`. */
function writeDoc(rel: string, contents: string): void {
  const path = join(root, "docs", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

/** Run `lore check --json` (optionally `--strict`) and return its exit code and findings. */
function check(args: string[] = []): { code: number; findings: CheckFindingJson[]; warningCount: number } {
  const stdout = capture();
  const code = runCheck({
    root,
    output: JSON_CTX,
    args,
    stdout,
    stderr: capture(),
    headCommitDate: () => "2026-09-26",
  }) as number;
  const report = JSON.parse(stdout.text()) as { data: { findings: CheckFindingJson[]; warningCount: number } };
  return { code, findings: report.data.findings, warningCount: report.data.warningCount };
}

/**
 * `lore check` on a bundle holding `contents` as its Constitution: must exit 6 with an error
 * matching `message` under `rule` — `type-shape` for the Constitution's own content rules, and
 * validate's own names (`frontmatter`, `required-section`) for the profile-shape errors.
 */
function expectCheckError(contents: string, message: RegExp, rule = "type-shape"): void {
  writeDoc("constitution/project.md", contents);
  const { code, findings } = check();
  expect(code).toBe(EXIT_CODES.validation);
  const errors = findings.filter((finding) => finding.severity === "error");
  expect(errors).toContainEqual(
    expect.objectContaining({
      rule,
      file: "constitution/project.md",
      message: expect.stringMatching(message),
    }),
  );
}

/** `lore check` on a bundle holding `contents` as its Constitution: must exit 0 with no finding at all. */
function expectCheckClean(contents: string): void {
  writeDoc("constitution/project.md", contents);
  const { code, findings } = check(["--strict"]);
  expect(findings).toEqual([]);
  expect(code).toBe(EXIT_OK);
}

describe("Constitution — a valid document", () => {
  test("passes lore check with no finding at all, even under --strict", () => {
    writeDoc("constitution/project.md", VALID);
    const { code, findings } = check(["--strict"]);
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("passes lore validate with no error", () => {
    const report = validateConceptText("docs/constitution/project.md", VALID);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  test("is a built-in type on OKF 0.1 bundles too, not only 0.2 (OPAG-425 R1)", () => {
    const legacy = profileForBundle(defaultProfile(), { okfVersion: "0.1", source: "declared" });
    expect(legacy.types.has("Constitution")).toBe(true);
    writeFileSync(join(root, "docs", "index.md"), '---\ntype: Reference\nokf_version: "0.1"\n---\n# Docs\n');
    // The shape rules run there as well: a 0.1 bundle is not an enforcement-free zone.
    expectCheckError(mutate("Check: review only.", "Nothing here."), /has no "Check:" line/);
  });
});

describe("Constitution — lore check fails each missing required field (AC#1)", () => {
  test.each(["version", "ratified", "last_amended", "amendment_authority"])("missing %p", (field) => {
    const without = mutate(new RegExp(`^${field}: .*\\n`, "m"), "");
    // Reported under validate's own rule name, not relabelled (review finding 8).
    expectCheckError(without, new RegExp(field), "frontmatter");
  });
});

describe("Constitution — lore check fails each missing required section (AC#1)", () => {
  test("missing ## Principles", () => {
    // Renaming the heading removes the section while keeping the rest of the document intact.
    expectCheckError(
      mutate("## Principles", "## Values"),
      /missing the required "## Principles" section/,
      "required-section",
    );
  });

  test("missing ## Governance", () => {
    expectCheckError(
      mutate("## Governance", "## Process"),
      /missing the required "## Governance" section/,
      "required-section",
    );
  });

  test("missing ## Amendment log", () => {
    expectCheckError(
      mutate("## Amendment log", "## History"),
      /missing the required "## Amendment log" section/,
      "required-section",
    );
  });
});

describe("Constitution — lore check reports only what it reports for every type (review finding 8)", () => {
  test("a quote-safety warning validate raises is NOT reported by check for a Constitution", () => {
    // `summary: yes` is a YAML 1.1 boolean hazard: validate warns, check reports nothing, as for any type.
    const hazard = mutate("summary: The project's durable principles and how they change.", "summary: yes");
    const validate = validateConceptText("docs/constitution/project.md", hazard).findings;
    expect(validate.map((finding) => finding.rule)).toContain("quote-safety");
    expectCheckClean(hazard);
  });
});

describe("Constitution — lore check fails a malformed field (AC#1)", () => {
  test("a version that is not SemVer", () => {
    expectCheckError(mutate("version: 1.2.0", "version: v1.2"), /version "v1\.2" is not a SemVer version/);
  });

  test("a date that is not an ISO calendar date", () => {
    expectCheckError(
      mutate('ratified: "2026-01-10"', 'ratified: "Jan 10"'),
      /ratified "Jan 10" is not an ISO calendar date/,
    );
  });

  test("last_amended earlier than ratified", () => {
    const earlier = mutate('ratified: "2026-01-10"', 'ratified: "2026-12-31"');
    expectCheckError(earlier, /last_amended 2026-09-01 is earlier than ratified 2026-12-31/);
  });
});

describe("Constitution — lore check fails a principle without a keyword, Rationale or Check (AC#1)", () => {
  test("no uppercase RFC 2119/8174 keyword", () => {
    // Lower-case "must" is not normative under RFC 8174, so it does not count.
    expectCheckError(
      mutate("Every rule MUST name", "Every rule must name"),
      /"P1\. Gates enforce rules" has no uppercase RFC 2119/,
    );
  });

  test("a keyword only inside a code span does not count", () => {
    expectCheckError(
      mutate("Every rule MUST name", "Every rule `MUST` name"),
      /"P1\. Gates enforce rules" has no uppercase RFC 2119/,
    );
  });

  test("no Rationale:", () => {
    expectCheckError(
      mutate("Rationale: a rule nothing verifies drifts unnoticed.", ""),
      /"P1\. Gates enforce rules" has no "Rationale:" line/,
    );
  });

  test("no Check:", () => {
    expectCheckError(mutate("- Check: review only.", ""), /"P3\. Keep principles short" has no "Check:" line/);
  });

  test("a principle heading not of the form P<n>. <Name>", () => {
    expectCheckError(
      mutate("### P3. Keep principles short", "### Keep principles short"),
      /is not of the form "P<n>\. <Name>"/,
    );
  });

  test("a principle id used twice", () => {
    expectCheckError(
      mutate("### P3. Keep principles short", "### P1. Keep principles short"),
      /principle id P1 is used twice/,
    );
  });

  test("a Principles section with no principle", () => {
    const empty = VALID.replace(/### P1[\s\S]*?(?=## Governance)/, "Nothing yet.\n\n");
    expectCheckError(empty, /declares no principle/);
  });
});

describe("Constitution — lore check fails an Amendment log that disagrees with the frontmatter (AC#1)", () => {
  test("top row's version differs from version", () => {
    expectCheckError(
      mutate("| 1.2.0 | 2026-09-01 |", "| 1.1.0 | 2026-09-01 |"),
      /top row's Version "1\.1\.0" does not match frontmatter version "1\.2\.0"/,
    );
  });

  test("top row's date differs from last_amended", () => {
    expectCheckError(
      mutate("| 1.2.0 | 2026-09-01 |", "| 1.2.0 | 2026-08-01 |"),
      /top row's Date "2026-08-01" does not match frontmatter last_amended "2026-09-01"/,
    );
  });

  test("no table at all", () => {
    const noTable = VALID.replace(/\| Version[\s\S]*$/, "Nothing recorded yet.\n");
    expectCheckError(noTable, /"## Amendment log" has no table/);
  });
});

describe("Constitution — lore check fails an unresolved template placeholder (AC#1)", () => {
  test("a lore {{placeholder}} in the body", () => {
    expectCheckError(
      mutate("Principles SHOULD stay brief.", "Principles SHOULD stay {{length}}."),
      /unresolved template placeholder\(s\): \{\{length\}\}/,
    );
  });

  test("a Spec Kit [UPPER_SNAKE] placeholder in the frontmatter", () => {
    expectCheckError(
      mutate("amendment_authority: project maintainers", 'amendment_authority: "[AMENDMENT_AUTHORITY]"'),
      /\[AMENDMENT_AUTHORITY\]/,
    );
  });
});

describe("Constitution — markdown forms the rules must read correctly (review findings 4-7)", () => {
  test("finding 4: a hard line break separates a keyword line from Rationale: and Check:", () => {
    // `\` at end of line is an mdast `break`; it must end the line, not glue the next one on.
    const hard = mutate(
      "Every rule MUST name the gate that verifies it.\n\nRationale: a rule nothing verifies drifts unnoticed.\n\nCheck: the CI job that runs `lore check`.",
      "Every rule MUST name the gate that verifies it.\\\nRationale: a rule nothing verifies drifts unnoticed.\\\nCheck: the CI job that runs `lore check`.",
    );
    expectCheckClean(hard);
  });

  test("finding 4: the two-trailing-space hard break works the same way", () => {
    const hard = mutate(
      "Every rule MUST name the gate that verifies it.\n\nRationale: a rule nothing verifies drifts unnoticed.\n\n",
      "Every rule MUST name the gate that verifies it.  \nRationale: a rule nothing verifies drifts unnoticed.\n\n",
    );
    expectCheckClean(hard);
  });

  test("finding 5: a prose line directly above the Amendment log table (no blank line) still finds the table", () => {
    expectCheckClean(mutate("| Version | Date | Change |", "Newest first.\n| Version | Date | Change |"));
  });

  test("finding 5: ... and still compares its top row", () => {
    const shifted = mutate("| Version | Date | Change |", "Newest first.\n| Version | Date | Change |");
    expectCheckError(
      mutate("| 1.2.0 | 2026-09-01 |", "| 1.1.0 | 2026-09-01 |", shifted),
      /top row's Version "1\.1\.0" does not match/,
    );
  });

  test("finding 6: 20,000 nested blockquotes do not overflow the stack in validate or check", () => {
    const deep = mutate("## Governance\n", `## Governance\n\n${">".repeat(20_000)} deep\n`);
    expect(() => validateConceptText("docs/constitution/project.md", deep)).not.toThrow();
    expectCheckClean(deep);
  });

  test("finding 6: 20,000 nested blockquotes inside a principle are walked too", () => {
    const deep = mutate("Principles SHOULD stay brief.", `Principles SHOULD stay brief.\n\n${">".repeat(20_000)} deep`);
    expect(() => validateConceptText("docs/constitution/project.md", deep)).not.toThrow();
    expectCheckClean(deep);
  });

  test.each([
    ["bold", "**1.2.0**"],
    ["emphasis", "_1.2.0_"],
    ["code", "`1.2.0`"],
  ])("finding 7: a %s top-row Version cell reads as its text", (_label, cell) => {
    expectCheckClean(mutate("| 1.2.0 | 2026-09-01 |", `| ${cell} | 2026-09-01 |`));
  });

  test("finding 7: a Rationale: label inside a code span does not count as the label", () => {
    expectCheckError(
      mutate("Rationale: a rule nothing verifies drifts unnoticed.", "`Rationale:` a rule nothing verifies drifts."),
      /"P1\. Gates enforce rules" has no "Rationale:" line/,
    );
  });

  test("finding 7: a Check: whose whole content is a code span still counts", () => {
    expectCheckClean(mutate("Check: the CI job that runs `lore check`.", "Check: `lore check`"));
  });

  test("finding 7: a {{placeholder}} inside a link URL is detected", () => {
    expectCheckError(
      mutate("Principles SHOULD stay brief.", "Principles SHOULD stay brief ([guide]({{guide_url}}))."),
      /unresolved template placeholder\(s\): \{\{guide_url\}\}/,
    );
  });

  test("finding 7: a Spec Kit [UPPER_SNAKE] placeholder in the body is detected", () => {
    expectCheckError(
      mutate("Principles SHOULD stay brief.", "Principles SHOULD stay [PRINCIPLE_2_DESCRIPTION]."),
      /\[PRINCIPLE_2_DESCRIPTION\]/,
    );
  });

  test.each([
    ["a citation ending in a number", "See [RFC_2119] and [ISO_8601]."],
    ["an unresolved reference link", "See [STYLE_GUIDE][]."],
    ["a resolved reference link", "See [STYLE_GUIDE].\n\n[STYLE_GUIDE]: https://example.com/style"],
    ["a single segment", "See [RFC2119] and [NOTE]."],
  ])("finding 7: %s is not a placeholder", (_label, text) => {
    expectCheckClean(mutate("## Governance\n", `## Governance\n\n${text}\n`));
  });
});

describe("Constitution — at most one per bundle (R2, AC#1)", () => {
  test("a second Constitution fails lore check, naming the first", () => {
    writeDoc("constitution/project.md", VALID);
    writeDoc("governance/second.md", VALID);
    const { code, findings } = check();
    expect(code).toBe(EXIT_CODES.validation);
    const singleton = findings.filter((finding) => finding.rule === "singleton-type");
    expect(singleton).toEqual([
      expect.objectContaining({
        severity: "error",
        file: "governance/second.md",
        message: expect.stringContaining("constitution/project.md is already one"),
      }),
    ]);
  });

  test("one Constitution is not a singleton finding", () => {
    writeDoc("constitution/project.md", VALID);
    expect(check().findings.filter((finding) => finding.rule === "singleton-type")).toEqual([]);
  });
});

describe("Constitution — the Principles line budget (AC#1)", () => {
  test(`warns, without failing, above ${PRINCIPLES_LINE_BUDGET} lines in Principles`, () => {
    const filler = Array.from({ length: PRINCIPLES_LINE_BUDGET }, (_, i) => `- Note ${i}.`).join("\n");
    writeDoc("constitution/project.md", mutate("- Check: review only.", `- Check: review only.\n\n${filler}`));
    const { code, findings } = check();
    expect(code).toBe(EXIT_OK);
    expect(findings).toEqual([
      expect.objectContaining({
        severity: "warning",
        rule: "type-shape",
        message: expect.stringMatching(/"## Principles" runs \d+ lines, above the 150-line budget/),
      }),
    ]);
    // A warning gates only under --strict, like every other deterministic advisory.
    expect(check(["--strict"]).code).toBe(EXIT_CODES.validation);
  });

  test("does not warn at the budget", () => {
    writeDoc("constitution/project.md", VALID);
    expect(check().warningCount).toBe(0);
  });
});

describe("Constitution — rules attach only to lore's BUILT-IN declaration (review finding 2, ruling A)", () => {
  /** A custom profile that declares its OWN Constitution: alias Charter, one section, no fields. */
  function customCharterProfile(): void {
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
        'aliases = ["Charter"]',
        'sections = ["Articles"]',
        "",
      ].join("\n"),
    );
    rmSync(join(root, ".lore", "schemas"), { recursive: true, force: true });
  }

  /** A document that satisfies the CUSTOM declaration and breaks every built-in rule. */
  const CHARTER = `---
type: Charter
title: Our charter
summary: The charter this bundle declared before lore had a Constitution type.
version: next
ratified: someday
---

# Our charter

## Articles

Nothing here is a P-numbered principle, and there is no Amendment log.
`;

  test("two `type: Charter` docs both pass lore check: no singleton, SemVer, date or shape rule runs", () => {
    customCharterProfile();
    writeDoc("charter/one.md", CHARTER);
    writeDoc("charter/two.md", CHARTER);
    const { code, findings } = check(["--strict"]);
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("the custom declaration's OWN section is still enforced, exactly as before the built-in existed", () => {
    customCharterProfile();
    const report = validateConceptText(
      "docs/charter/one.md",
      CHARTER.replace("## Articles", "## Other"),
      loadProfile({ root }),
    );
    // Its only error is its own missing section; `version`/`ratified` are just undeclared extension
    // keys to it (Tier-3 warnings), never SemVer or dates.
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([
      expect.objectContaining({ rule: "required-section", message: expect.stringContaining('"## Articles"') }),
    ]);
    expect(report.findings.some((finding) => finding.rule === "type-shape")).toBe(false);
  });

  test("control: the BUILT-IN Constitution still gets every rule on the same documents", () => {
    // No profile.toml: the same two documents, typed as the built-in, draw the built-in rules.
    const builtin = CHARTER.replace("type: Charter", "type: Constitution");
    writeDoc("charter/one.md", builtin);
    writeDoc("charter/two.md", builtin);
    const { code, findings } = check();
    expect(code).toBe(EXIT_CODES.validation);
    // Missing required fields (a `frontmatter` error, which short-circuits validate's later tiers)
    // on each, and the singleton on the second.
    const rules = new Set(findings.map((finding) => finding.rule));
    expect(rules).toEqual(new Set(["frontmatter", "singleton-type"]));
    // With its required fields present, the same document draws the section, SemVer, date,
    // Principles and Amendment log rules too.
    const complete = builtin.replace(
      "ratified: someday",
      'ratified: someday\nlast_amended: "2026-01-01"\namendment_authority: us',
    );
    const report = validateConceptText("docs/charter/one.md", complete);
    const messages = report.findings.map((finding) => finding.message).join("\n");
    expect(messages).toContain('version "next" is not a SemVer version');
    expect(messages).toContain('ratified "someday" is not an ISO calendar date');
    expect(messages).toContain('missing the required "## Principles" section');
    expect(messages).toContain('missing the required "## Amendment log" section');
  });
});

describe("Constitution — only where the active profile declares it", () => {
  test("a custom profile without Constitution treats it as an unknown type, not a shape failure", () => {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      '[profile]\nname = "custom"\nokf_version = "0.2"\n\n[base.fields]\ntype = { required = true }\n\n[[types]]\nname = "Reference"\n',
    );
    rmSync(join(root, ".lore", "schemas"), { recursive: true, force: true });
    writeDoc("constitution/project.md", mutate("Check: review only.", ""));
    writeDoc("governance/second.md", VALID);
    const { findings } = check();
    expect(findings.filter((finding) => finding.rule === "type-shape" || finding.rule === "singleton-type")).toEqual(
      [],
    );
    expect(findings.filter((finding) => finding.rule === "unknown-type")).toHaveLength(2);
  });
});

describe("lore new constitution (R9, AC#2)", () => {
  function newConstitution(): { result: NewResult; contents: string } {
    const stdout = capture();
    const code = runNew({
      root,
      output: JSON_CTX,
      args: ["constitution", "Project constitution"],
      clock: FIXED_CLOCK,
      stdout,
      stderr: capture(),
    });
    expect(code).toBe(EXIT_OK);
    const result = (JSON.parse(stdout.text()) as { data: NewResult }).data;
    return { result, contents: readFileSync(join(root, result.path), "utf8") };
  }

  test("writes a document that lore check passes, with no finding even under --strict", () => {
    const { result } = newConstitution();
    expect(result.type).toBe("Constitution");
    const { code, findings } = check(["--strict"]);
    expect(findings).toEqual([]);
    expect(code).toBe(EXIT_OK);
  });

  test("and that lore validate --strict passes with ZERO findings, warnings included (ruling b)", () => {
    const { result } = newConstitution();
    const stdout = capture();
    const code = runValidate({ root, output: JSON_CTX, args: ["--strict", result.path], stdout, stderr: capture() });
    const report = JSON.parse(stdout.text()) as {
      data: { errorCount: number; warningCount: number; files: { findings: unknown[] }[] };
    };
    expect(report.data.files).toHaveLength(1);
    expect(report.data.files[0]?.findings).toEqual([]);
    expect([report.data.errorCount, report.data.warningCount]).toEqual([0, 0]);
    expect(code).toBe(EXIT_OK);
  });

  test("carries the R9 components", () => {
    const { contents } = newConstitution();
    expect(contents).toContain("version: 1.0.0");
    // Double-quoted by the serializer's bare-date rule, so YAML 1.1 consumers read a string.
    expect(contents).toContain('ratified: "2026-06-25"');
    expect(contents).toContain('last_amended: "2026-06-25"');
    expect(contents).toContain('"MUST", "MUST NOT", "REQUIRED"'); // RFC 8174 boilerplate
    expect(contents).toContain("RFC 8174");
    expect(contents).toMatch(/### P1\. .+\n\n.*MUST[\s\S]*Rationale: [\s\S]*Check: /); // example principle
    expect(contents).toMatch(
      /## Governance\n[\s\S]*drafted by an agent and ratified by a human[\s\S]*pull request[\s\S]*ADR/,
    );
    expect(contents).toContain("| 1.0.0 | 2026-06-25 | Initial ratification. | |"); // Amendment log
    expect(contents).toMatch(/CODEOWNERS[\s\S]*cannot enforce who edits it/);
  });

  test("a second lore new constitution is caught by check's singleton rule", () => {
    newConstitution();
    runNew({
      root,
      output: JSON_CTX,
      args: ["constitution", "Another constitution"],
      clock: FIXED_CLOCK,
      stdout: capture(),
      stderr: capture(),
    });
    const { code, findings } = check();
    expect(code).toBe(EXIT_CODES.validation);
    expect(findings.filter((finding) => finding.rule === "singleton-type")).toHaveLength(1);
  });
});
