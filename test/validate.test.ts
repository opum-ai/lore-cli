import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../src/commands/init";
import { runNew } from "../src/commands/new";
import { runValidate, type ValidateOptions } from "../src/commands/validate";
import { compileProfile, defaultProfile, parseProfile } from "../src/core/profile";
import { requiredSectionsFor } from "../src/core/schema";
import { builtinTemplateFor } from "../src/core/template";
import { quoteSafetyFindings, type ValidateReport, validateConceptText, validateFiles } from "../src/core/validate";
import { EXIT_CODES, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

/** The six story-convention type names, sourced from the built-in profile. */
const KNOWN_TYPES = [...defaultProfile().types.keys()];

const JSON_CTX: OutputContext = { mode: "json", color: false };
const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");

/** A complete, clean ADR with every required `##` section and a one-line summary. */
const CLEAN_ADR = `---
type: ADR
title: Use soft deletes
summary: A short summary.
timestamp: 2026-06-25T12:00:00Z
---

# Use soft deletes

## Status

Proposed

## Context

## Decision

## Consequences
`;

// ── Core engine: tiers, AC#1, skip/error distinction ───────────────────────────

describe("validate (core) — frontmatter tiers", () => {
  test("a clean known concept yields no findings and is ok", () => {
    const report = validateConceptText("docs/adr/x.md", CLEAN_ADR);
    expect(report.skipped).toBe(false);
    expect(report.ok).toBe(true);
    expect(report.type).toBe("ADR");
    expect(report.findings).toEqual([]);
  });

  test("AC#1: an unknown type warns but never fails validation", () => {
    const raw = `---
type: Glossary
custom: anything
---

# Term
`;
    const report = validateConceptText("docs/glossary/term.md", raw);
    expect(report.ok).toBe(true); // no error-severity finding
    expect(report.skipped).toBe(false);
    expect(report.findings.some((f) => f.severity === "error")).toBe(false);
    expect(report.findings.some((f) => f.severity === "warning" && /unknown type/.test(f.message))).toBe(true);
  });

  test("a missing `type` is an error finding (not a skip)", () => {
    const raw = `---
title: No type here
---

# Body
`;
    const report = validateConceptText("docs/x.md", raw);
    expect(report.skipped).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ severity: "error", rule: "frontmatter" });
  });

  test("a mistyped known field is an error finding", () => {
    const raw = `---
type: ADR
tags: not-a-list
---

# X

## Status

## Context

## Decision

## Consequences
`;
    const report = validateConceptText("docs/adr/x.md", raw);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.severity === "error" && f.rule === "frontmatter")).toBe(true);
  });

  test("an extra key on a known type is a warning", () => {
    const raw = `---
type: Reference
summary: A short summary.
made_up_key: 1
---

# R
`;
    const report = validateConceptText("docs/reference/r.md", raw);
    expect(report.ok).toBe(true);
    expect(report.findings.some((f) => f.severity === "warning" && /unknown key "made_up_key"/.test(f.message))).toBe(
      true,
    );
  });

  test("a non-concept file (no frontmatter) is skipped, not failed", () => {
    const report = validateConceptText("docs/index.md", "# Just a heading\n\nNo frontmatter here.\n");
    expect(report.skipped).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.type).toBeUndefined();
  });
});

// ── Core engine: required body sections (tier 2) ───────────────────────────────

describe("validate (core) — required sections", () => {
  test("an ADR missing a required section is an error", () => {
    const raw = `---
type: ADR
summary: A short summary.
---

# X

## Status

## Context
`;
    const report = validateConceptText("docs/adr/x.md", raw);
    expect(report.ok).toBe(false);
    const sectionFindings = report.findings.filter((f) => f.rule === "required-section");
    expect(sectionFindings.map((f) => f.message)).toEqual([
      'ADR is missing the required "## Decision" section',
      'ADR is missing the required "## Consequences" section',
    ]);
  });

  test("section matching is case-insensitive on trimmed heading text", () => {
    const raw = `---
type: ADR
summary: A short summary.
---

# X

## status

## CONTEXT

##   Decision

## Consequences
`;
    const report = validateConceptText("docs/adr/x.md", raw);
    expect(report.findings.filter((f) => f.rule === "required-section")).toEqual([]);
  });

  test("a Story needs an Acceptance criteria section (ADR-0007)", () => {
    const without = `---
type: Story
summary: A short summary.
---

# S

## Goal
`;
    expect(validateConceptText("docs/stories/s.md", without).ok).toBe(false);

    const withIt = `---
type: Story
summary: A short summary.
---

# S

## Acceptance criteria
`;
    expect(
      validateConceptText("docs/stories/s.md", withIt).findings.filter((f) => f.rule === "required-section"),
    ).toEqual([]);
  });

  test("Reference/Spec/Runbook/Epic impose no required sections (minimal policy)", () => {
    for (const type of ["Reference", "Spec", "Runbook", "Epic"]) {
      const raw = `---
type: ${type}
summary: A short summary.
---

# Only a title, no sections
`;
      const findings = validateConceptText("docs/x.md", raw).findings.filter((f) => f.rule === "required-section");
      expect(findings).toEqual([]);
    }
  });

  test("a `## ` inside a fenced code block is not a heading", () => {
    const raw = `---
type: ADR
summary: A short summary.
---

# X

## Status

## Context

## Decision

\`\`\`
## Consequences
\`\`\`
`;
    // The real `## Consequences` is inside a code fence, so it does not count.
    const report = validateConceptText("docs/adr/x.md", raw);
    expect(report.findings.some((f) => f.rule === "required-section" && /Consequences/.test(f.message))).toBe(true);
  });
});

// ── Core engine: quote-safety (cross-cutting) ──────────────────────────────────

describe("validate (core) — quote-safety", () => {
  const block = (line: string): string => `---\ntype: Reference\nsummary: A short summary.\n${line}\n---\n\n# R\n`;

  test("a YAML 1.1 boolean alias is an error", () => {
    expect(quoteSafetyFindings(block("flag: yes"))).toEqual([
      { severity: "error", rule: "quote-safety", message: expect.stringContaining("boolean to YAML 1.1") },
    ]);
    expect(quoteSafetyFindings(block("flag: OFF"))[0]?.severity).toBe("error");
  });

  test("a value starting with a YAML indicator is an error", () => {
    expect(quoteSafetyFindings(block("owner: @payments"))[0]).toMatchObject({
      severity: "error",
      rule: "quote-safety",
    });
    expect(quoteSafetyFindings(block("ref: *anchor"))[0]?.severity).toBe("error");
  });

  test("a colon-space inside an unquoted value is an error", () => {
    expect(quoteSafetyFindings(block("note: a: b"))[0]).toMatchObject({ severity: "error", rule: "quote-safety" });
  });

  test("a bare date is a warning", () => {
    expect(quoteSafetyFindings(block("due: 2026-06-21"))).toEqual([
      { severity: "warning", rule: "quote-safety", message: expect.stringContaining("date to YAML 1.1") },
    ]);
  });

  test("quoted, block-scalar, and flow values are safe", () => {
    expect(quoteSafetyFindings(block('flag: "yes"'))).toEqual([]);
    expect(quoteSafetyFindings(block("flag: 'yes'"))).toEqual([]);
    expect(quoteSafetyFindings(block("body: |"))).toEqual([]);
    expect(quoteSafetyFindings(block("body: >-"))).toEqual([]);
    expect(quoteSafetyFindings(block("list: [a, b]"))).toEqual([]);
  });

  test("a full ISO timestamp and a plain URL are not flagged", () => {
    expect(quoteSafetyFindings(block("timestamp: 2026-06-21T00:00:00Z"))).toEqual([]);
    expect(quoteSafetyFindings(block("resource: https://example.com/x"))).toEqual([]);
  });

  test("nested/indented and list lines are not analyzed", () => {
    expect(quoteSafetyFindings(`---\ntype: Story\ntasks:\n  - yes\n  - "@x"\n---\n\n# S\n`)).toEqual([]);
  });

  test("a file with no frontmatter fence yields no findings", () => {
    expect(quoteSafetyFindings("# Just a body\n")).toEqual([]);
  });
});

// ── Core engine: resource drift (AC#4) ─────────────────────────────────────────—

describe("validate (core) — resource drift", () => {
  /** A one-type profile with a `resource_base`, so `expectedResource` produces a value to compare. */
  function resourceProfile() {
    const doc = Bun.TOML.parse(
      [
        "[profile]",
        'name = "rp"',
        'okf_version = "0.1"',
        'resource_base = "https://docs.example.com/"',
        "[base.fields]",
        "type = { required = true }",
        "[[types]]",
        'name = "Reference"',
      ].join("\n"),
    ) as Record<string, unknown>;
    return compileProfile(parseProfile(doc, "rp"));
  }
  const profile = resourceProfile();
  const conceptWith = (resource: string) =>
    `---\ntype: Reference\ntitle: Orders\nsummary: The orders.\nresource: ${resource}\n---\n\n# Orders\n`;
  const resourceFindings = (path: string, raw: string, prof = profile) =>
    validateConceptText(path, raw, prof).findings.filter((f) => f.rule === "resource");

  test("a `resource` matching its path + resource_base yields no finding", () => {
    const raw = conceptWith("https://docs.example.com/docs/reference/orders.md");
    expect(resourceFindings("docs/reference/orders.md", raw)).toEqual([]);
  });

  test("a stale `resource` (path no longer matches) warns it drifted, but never fails the file", () => {
    const raw = conceptWith("https://docs.example.com/docs/reference/OLD-NAME.md");
    const report = validateConceptText("docs/reference/orders.md", raw, profile);
    const findings = report.findings.filter((f) => f.rule === "resource");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", rule: "resource" });
    expect(findings[0]?.message).toContain("https://docs.example.com/docs/reference/orders.md");
    expect(report.ok).toBe(true); // advisory tier — a warning, not an error
  });

  test("without a resource_base (default profile) an authored `resource` is never judged", () => {
    const raw = conceptWith("https://anywhere.example/whatever.md");
    expect(resourceFindings("docs/reference/orders.md", raw, defaultProfile())).toEqual([]);
  });

  test("an index file's `resource` is not drift-checked (lore stamps none there)", () => {
    const raw = conceptWith("https://docs.example.com/docs/STALE.md");
    expect(resourceFindings("docs/index.md", raw)).toEqual([]);
  });
});

// ── Core engine: aggregation + --type filter ───────────────────────────────────

describe("validate (core) — aggregation", () => {
  test("validateFiles tallies errors, warnings, and skips across files", () => {
    const report = validateFiles([
      { path: "docs/adr/ok.md", raw: CLEAN_ADR },
      { path: "docs/adr/bad.md", raw: "---\ntype: ADR\n---\n\n# X\n" }, // missing 4 sections + summary warning
      { path: "docs/index.md", raw: "# no frontmatter\n" }, // skipped
    ]);
    expect(report.files).toHaveLength(3);
    expect(report.errorCount).toBe(4); // four missing ADR sections
    expect(report.warningCount).toBe(1); // missing summary on bad.md
    expect(report.skippedCount).toBe(1);
  });

  test("--type narrows the report to one type and drops non-matching/skipped files", () => {
    const report = validateFiles(
      [
        { path: "docs/adr/a.md", raw: CLEAN_ADR },
        { path: "docs/reference/r.md", raw: "---\ntype: Reference\nsummary: A short summary.\n---\n\n# R\n" },
        { path: "docs/index.md", raw: "# no frontmatter\n" },
      ],
      "adr",
    );
    expect(report.files.map((f) => f.path)).toEqual(["docs/adr/a.md"]);
  });
});

// ── Required-sections × templates: the LORE-18 ⇄ LORE-19 invariant ──────────────

describe("validate — required sections never reject built-in templates", () => {
  test("every known type's required sections appear in its built-in template", () => {
    for (const type of KNOWN_TYPES) {
      const template = builtinTemplateFor(type);
      for (const section of requiredSectionsFor(type)) {
        expect(template).toContain(`## ${section}`);
      }
    }
  });

  test("requiredSectionsFor returns nothing for an unknown (producer-extension) type", () => {
    expect(requiredSectionsFor("Glossary")).toEqual([]);
  });
});

// ── Command layer: rendering (plain + pretty) ──────────────────────────────────

describe("validate (command) — rendering", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-validate-render-"));
    mkdirSync(join(root, "docs/adr"), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Run `validate` in the given mode and return the captured stdout text + exit code. */
  function render(args: string[], output: OutputContext): { code: number; text: string } {
    const stdout = capture();
    const code = runValidate({ root, output, args, stdout });
    return { code, text: stdout.text() };
  }

  test("plain mode prints one line per finding plus an ok line and a summary", () => {
    writeFileSync(join(root, "docs/adr/ok.md"), CLEAN_ADR);
    writeFileSync(join(root, "docs/adr/bad.md"), "---\ntype: ADR\nsummary: A short summary.\n---\n\n# X\n");
    const { code, text } = render([], { mode: "plain", color: false });
    expect(code).toBe(EXIT_CODES.validation);
    expect(text).toContain("ok docs/adr/ok.md");
    expect(text).toContain('error docs/adr/bad.md [required-section]: ADR is missing the required "## Status" section');
    expect(text).toMatch(/2 files, 4 errors, 0 warnings, 0 skipped/);
    expect(text).not.toContain("\x1b["); // no ANSI in plain mode
  });

  test("a skipped non-concept renders a `skip` line", () => {
    writeFileSync(join(root, "docs/adr/note.md"), "# Just a note, no frontmatter\n");
    const { text } = render(["docs/adr/note.md"], { mode: "plain", color: false });
    expect(text).toContain("skip docs/adr/note.md (not a concept)");
  });

  test("pretty mode with color paints the severity token", () => {
    writeFileSync(join(root, "docs/adr/bad.md"), "---\ntype: ADR\nsummary: A short summary.\n---\n\n# X\n");
    const { text } = render(["docs/adr/bad.md"], { mode: "pretty", color: true });
    expect(text).toContain("\x1b[31m"); // red error token
  });
});

// ── Command layer: discovery, exit codes, AC#2 ─────────────────────────────────

describe("validate (command)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-validate-"));
    runInit({ root, output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Run `validate` in JSON mode; return the exit code and the parsed `validate.report` payload. */
  function validateCmd(args: string[]): { code: number; report: ValidateReport } {
    const stdout = capture();
    const code = runValidate({ root, output: JSON_CTX, args, stdout } satisfies ValidateOptions);
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: ValidateReport };
    expect(envelope.kind).toBe("validate.report");
    return { code, report: envelope.data };
  }

  test("a freshly initialized + scaffolded bundle validates clean (exit 0)", () => {
    runNew({ root, output: JSON_CTX, args: ["adr", "Use soft deletes"], clock: FIXED_CLOCK, stdout: capture() });
    const { code, report } = validateCmd([]);
    expect(code).toBe(0);
    expect(report.errorCount).toBe(0);
  });

  test("a fresh `lore new` of every known type validates clean (LORE-18 × LORE-19)", () => {
    for (const type of KNOWN_TYPES) {
      runNew({ root, output: JSON_CTX, args: [type, `A ${type} title`], clock: FIXED_CLOCK, stdout: capture() });
    }
    const { code, report } = validateCmd([]);
    expect(report.errorCount).toBe(0);
    expect(code).toBe(0);
  });

  test("an error-tier file makes the run exit 6 with the report on stdout", () => {
    mkdirSync(join(root, "docs/adr"), { recursive: true });
    writeFileSync(join(root, "docs/adr/bad.md"), "---\ntype: ADR\nsummary: A short summary.\n---\n\n# X\n");
    const { code, report } = validateCmd([]);
    expect(code).toBe(EXIT_CODES.validation); // 6
    expect(report.errorCount).toBeGreaterThan(0);
  });

  test("AC#2: an explicit path validates only that file (staged-only pre-commit)", () => {
    mkdirSync(join(root, "docs/adr"), { recursive: true });
    writeFileSync(join(root, "docs/adr/bad.md"), "---\ntype: ADR\nsummary: A short summary.\n---\n\n# X\n");
    runNew({ root, output: JSON_CTX, args: ["reference", "Good doc"], clock: FIXED_CLOCK, stdout: capture() });

    // Validate only the good file: the bad one is out of scope, so the run is clean.
    const good = validateCmd(["docs/reference/good-doc.md"]);
    expect(good.report.files.map((f) => f.path)).toEqual(["docs/reference/good-doc.md"]);
    expect(good.code).toBe(0);

    // Validate only the bad file: exit 6.
    const bad = validateCmd(["docs/adr/bad.md"]);
    expect(bad.report.files.map((f) => f.path)).toEqual(["docs/adr/bad.md"]);
    expect(bad.code).toBe(EXIT_CODES.validation);
  });

  test("--strict turns a warnings-only run into exit 6", () => {
    mkdirSync(join(root, "docs/reference"), { recursive: true });
    // No summary → a warning, but no error.
    writeFileSync(join(root, "docs/reference/r.md"), "---\ntype: Reference\n---\n\n# R\n");
    expect(validateCmd(["docs/reference/r.md"]).code).toBe(0);
    const strict = validateCmd(["docs/reference/r.md", "--strict"]);
    expect(strict.report.warningCount).toBeGreaterThan(0);
    expect(strict.code).toBe(EXIT_CODES.validation);
  });

  test("--type limits a directory run to one type", () => {
    runNew({ root, output: JSON_CTX, args: ["adr", "An adr"], clock: FIXED_CLOCK, stdout: capture() });
    runNew({ root, output: JSON_CTX, args: ["reference", "A ref"], clock: FIXED_CLOCK, stdout: capture() });
    const { report } = validateCmd(["--type", "adr"]);
    expect(report.files.every((f) => f.type === "ADR")).toBe(true);
    expect(report.files.length).toBeGreaterThan(0);
  });

  test("a non-existent path is a not_found error", () => {
    try {
      runValidate({ root, output: JSON_CTX, args: ["docs/nope.md"], stdout: capture() });
      throw new Error("expected a LoreError");
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("not_found");
    }
  });

  test("an unknown flag is a usage error", () => {
    try {
      runValidate({ root, output: JSON_CTX, args: ["--bogus"], stdout: capture() });
      throw new Error("expected a LoreError");
    } catch (err) {
      expect((err as LoreError).type).toBe("usage");
    }
  });

  test("the `--type=ADR` inline form is accepted", () => {
    runNew({ root, output: JSON_CTX, args: ["adr", "An adr"], clock: FIXED_CLOCK, stdout: capture() });
    const { report } = validateCmd(["--type=ADR"]);
    expect(report.files.every((f) => f.type === "ADR")).toBe(true);
  });

  test("`--type` with no value is a usage error", () => {
    for (const args of [["--type"], ["--type="], ["-x"]]) {
      try {
        runValidate({ root, output: JSON_CTX, args, stdout: capture() });
        throw new Error(`expected a LoreError for ${JSON.stringify(args)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(LoreError);
        expect((err as LoreError).type).toBe("usage");
      }
    }
  });

  test("`--` ends option parsing so a dash-leading path is a positional", () => {
    // After `--`, `--strict` would be a path; it does not exist, so discovery fails not_found
    // (proving it was treated as a path, not the flag).
    try {
      runValidate({ root, output: JSON_CTX, args: ["--", "--strict"], stdout: capture() });
      throw new Error("expected a LoreError");
    } catch (err) {
      expect((err as LoreError).type).toBe("not_found");
    }
  });
});

// ── Review hardening (LORE-19 /code-review max) ────────────────────────────────

describe("validate — --type never silently drops a broken file", () => {
  // The dominant review finding: `--type` filtered on report.type, but error/unparseable files
  // have no confirmed type and were dropped — turning a per-type gate green over malformed concepts.
  const brokenOfEveryShape: Array<[string, string]> = [
    ["a schema-invalid known type", "---\ntype: ADR\ntags: not-a-list\n---\n\n# X\n"],
    ["unparseable YAML", "---\ntype: [unclosed\n---\n\n# X\n"],
    ["a missing type", "---\ntitle: no type here\n---\n\n# X\n"],
  ];
  for (const [label, raw] of brokenOfEveryShape) {
    test(`--type ADR keeps and counts ${label}`, () => {
      const report = validateFiles([{ path: "docs/adr/broken.md", raw }], "ADR");
      expect(report.files).toHaveLength(1);
      expect(report.errorCount).toBeGreaterThan(0);
    });
  }

  test("--type still drops a clean concept of another type", () => {
    const report = validateFiles(
      [
        { path: "docs/reference/r.md", raw: "---\ntype: Reference\nsummary: A short summary.\n---\n\n# R\n" },
        { path: "docs/adr/a.md", raw: CLEAN_ADR },
      ],
      "ADR",
    );
    expect(report.files.map((f) => f.path)).toEqual(["docs/adr/a.md"]);
  });
});

describe("validate — quote-safety ignores trailing YAML comments", () => {
  const block = (line: string): string => `---\ntype: Reference\nsummary: A short summary.\n${line}\n---\n\n# R\n`;

  test("a colon-space inside a trailing comment is not a false error", () => {
    expect(quoteSafetyFindings(block("owner: alice # see: the notes"))).toEqual([]);
    expect(quoteSafetyFindings(block("title: Release # v1: shipped"))).toEqual([]);
  });

  test("a real hazard before a trailing comment is still flagged", () => {
    const findings = quoteSafetyFindings(block("flag: yes # a note"));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", rule: "quote-safety" });
  });

  test("a comment-only value (YAML null) yields nothing", () => {
    expect(quoteSafetyFindings(block("note: # just a comment"))).toEqual([]);
  });

  test("a `#` with no leading space (a URL fragment) is part of the value, not a comment", () => {
    expect(quoteSafetyFindings(block("ref: docs/x.md#anchor"))).toEqual([]);
  });
});

describe("validate — error files surface quote-safety in the same pass", () => {
  test("a missing-type file still reports its YAML-1.1 hazard alongside the frontmatter error", () => {
    const raw = "---\ntitle: no type\nflag: yes\n---\n\n# X\n";
    const findings = validateConceptText("docs/x.md", raw).findings;
    expect(findings.some((f) => f.rule === "frontmatter" && f.severity === "error")).toBe(true);
    expect(findings.some((f) => f.rule === "quote-safety" && f.severity === "error")).toBe(true);
  });
});

describe("validate (command) — discovery hardening", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-validate-disc-"));
    mkdirSync(join(root, "docs"), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("the same physical file named twice is validated once (realpath de-dup)", () => {
    writeFileSync(join(root, "docs/r.md"), "---\ntype: Reference\nsummary: A short summary.\n---\n\n# R\n");
    const stdout = capture();
    runValidate({ root, output: JSON_CTX, args: ["docs/r.md", "docs/r.md"], stdout });
    const report = (JSON.parse(stdout.text()) as { data: ValidateReport }).data;
    expect(report.files).toHaveLength(1);
  });

  test("a `.md` concept skipped behind a symlink is surfaced on stderr, not silently dropped", () => {
    writeFileSync(join(root, "docs/real.md"), "---\ntype: Reference\nsummary: A short summary.\n---\n\n# R\n");
    symlinkSync(join(root, "docs/real.md"), join(root, "docs/link.md"));
    const stdout = capture();
    const stderr = capture();
    runValidate({ root, output: { mode: "plain", color: false }, args: ["docs"], stdout, stderr });
    expect(stderr.text()).toContain("symlink");
    expect(stderr.text()).toContain("link.md");
  });
});
