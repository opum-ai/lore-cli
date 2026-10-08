/**
 * `lore check` enforces `lore validate`'s error-tier `quote-safety` findings (LCLI-612, ADR-0007;
 * the carve-out LCLI-606 left in place). Before this, a document with an unquoted YAML-1.1 boolean
 * (`archived: yes`) exited 6 under `validate` and 0 under `check`: the two gates disagreed on the
 * same file, the defect ADR-0007 exists to prevent.
 *
 * Every case spawns the real CLI entrypoint (`bun src/cli.ts`) twice over the same bundle, once as
 * `lore check --json` and once as `lore validate --json`, and compares what each reports for the
 * file: both exit 6, and check's findings for it are exactly validate's error findings for it —
 * same severity, rule name and message, byte for byte.
 *
 * Tags, so a mutation's red set can be predicted from this file alone: `[quote-safety]` cases pass
 * only if check keeps validate's error-tier quote-safety findings. The `control:` cases hold with or
 * without that: a warning-tier bare date, a quoted value, and a frontmatter block that is not valid
 * YAML (check carries the YAML error, `complete: false`, and runs no per-file rule for that file;
 * exit 6 as validate's).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXIT_CODES, EXIT_OK } from "../src/errors";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

/** Spawns are slower than an in-process run; two per case. */
const TIMEOUT_MS = 30_000;

interface FindingJson {
  readonly severity: string;
  readonly rule: string;
  readonly file?: string;
  readonly message: string;
}

/** A Reference whose frontmatter carries one extra top-level `line` (an unquoted scalar under test). */
function referenceWith(line: string): string {
  // `summary` keeps the fixture free of the missing-`summary` lint LCLI-691 now surfaces; the
  // injected `line` is still an unknown key, so each case carries that one warning too.
  return `---\ntype: Reference\ntitle: Orders table\nsummary: Orders reference.\n${line}\n---\n# Orders table\n\nBody.\n`;
}

/** Only severity, rule and message: the parts both gates spell identically. */
function strip(findings: readonly FindingJson[]): { severity: string; rule: string; message: string }[] {
  return findings.map(({ severity, rule, message }) => ({ severity, rule, message }));
}

describe("lore check enforces validate's error-tier quote-safety findings (LCLI-612)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-check-quote-safety-"));
    mkdirSync(join(root, "docs", "reference"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeDoc(rel: string, contents: string): void {
    writeFileSync(join(root, "docs", rel), contents);
  }

  /** Run the real `lore <args>` in the fixture repository. */
  function lore(args: readonly string[]): { code: number; stdout: string; stderr: string } {
    const result = Bun.spawnSync([process.execPath, CLI, ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1", LORE_AGENT_PLUGINS: "off" },
      stdout: "pipe",
      stderr: "pipe",
    });
    return { code: result.exitCode ?? -1, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  }

  /** `lore check --json [args]`: exit code and the findings attributed to bundle-relative `rel`. */
  function check(rel: string, args: readonly string[] = []): { code: number; findings: FindingJson[] } {
    const run = lore(["check", "--json", ...args]);
    const all: FindingJson[] = JSON.parse(run.stdout).data.findings;
    return { code: run.code, findings: all.filter((f) => f.file === rel) };
  }

  /** `lore validate --json`: exit code and every finding for repo-relative `path`. */
  function validate(path: string): { code: number; findings: FindingJson[] } {
    const run = lore(["validate", "--json"]);
    const files: { path: string; findings: FindingJson[] }[] = JSON.parse(run.stdout).data.files;
    return { code: run.code, findings: files.find((file) => file.path === path)?.findings ?? [] };
  }

  /**
   * Both gates exit 6 on `docs/reference/<name>`, and check's findings for it equal validate's
   * error findings for it (the whole set, not one rule's slice). Returns check's findings.
   * `checkRel` is the file as check labels it: relative to the root it checked, so a scoped
   * `lore check docs/reference` names it `<name>`.
   */
  function expectGatesAgree(name: string, args: readonly string[] = [], checkRel = `reference/${name}`): FindingJson[] {
    const v = validate(`docs/reference/${name}`);
    // Positive control on the instrument: validate itself fails the file on quote-safety.
    expect(v.code).toBe(EXIT_CODES.validation);
    expect(v.findings.some((f) => f.rule === "quote-safety" && f.severity === "error")).toBe(true);
    const c = check(checkRel, args);
    expect(c.code).toBe(EXIT_CODES.validation);
    // LCLI-691: check reports warning-tier frontmatter lint too, so the two gates now agree on the
    // WHOLE per-file finding set, not only its error-tier slice.
    expect(strip(c.findings)).toEqual(strip(v.findings));
    return c.findings;
  }

  test.each(["yes", "no", "on", "off"])(
    "[quote-safety] a bare YAML-1.1 boolean (`archived: %s`) fails both gates with the same finding",
    (value) => {
      writeDoc("reference/orders.md", referenceWith(`archived: ${value}`));
      const mine = expectGatesAgree("orders.md");
      // Exactly one quote-safety finding: no other check rule reports the same quoting defect a
      // second time. (LCLI-691 adds the fixture's unknown-key warning to `mine`, so filter to the
      // rule this file is about.)
      expect(strip(mine.filter((f) => f.rule === "quote-safety"))).toEqual([
        {
          severity: "error",
          rule: "quote-safety",
          message: `unquoted "${value}" is a boolean to YAML 1.1 consumers; quote it to keep the string "${value}"`,
        },
      ]);
    },
    TIMEOUT_MS,
  );

  test.each([
    ["alias: :orders", ":"],
    ["ref: &anchor orders", "&"],
  ])(
    "[quote-safety] a leading YAML indicator (`%s`) fails both gates with the same finding",
    (line, indicator) => {
      writeDoc("reference/orders.md", referenceWith(line));
      const mine = expectGatesAgree("orders.md");
      const quoteSafety = mine.filter((f) => f.rule === "quote-safety");
      expect(quoteSafety).toHaveLength(1);
      expect(quoteSafety[0]?.message).toContain(`starts with the YAML indicator "${indicator}"`);
    },
    TIMEOUT_MS,
  );

  test(
    "[quote-safety] beside a missing `type`, check reports both of validate's errors, not only the frontmatter one",
    () => {
      // validate's frontmatter-error path still runs the raw-text quote-safety scan.
      writeDoc("reference/orders.md", "---\ntitle: Orders table\narchived: yes\n---\n# Orders table\n\nBody.\n");
      const mine = expectGatesAgree("orders.md");
      expect(mine.map((f) => f.rule)).toEqual(["frontmatter", "quote-safety"]);
    },
    TIMEOUT_MS,
  );

  test(
    "[quote-safety] a scoped `lore check docs/reference` agrees with validate too",
    () => {
      writeDoc("reference/orders.md", referenceWith("archived: yes"));
      expect(expectGatesAgree("orders.md", ["docs/reference"], "orders.md").filter((f) => f.rule === "quote-safety")).toHaveLength(1);
    },
    TIMEOUT_MS,
  );

  test(
    "control: a bare date is warning-tier quote-safety, so both gates exit 0 and check reports no quote-safety error",
    () => {
      writeDoc("reference/orders.md", referenceWith("reviewed: 2026-09-28"));
      const v = validate("docs/reference/orders.md");
      expect(v.code).toBe(EXIT_OK);
      // The instrument sees it, at warning tier.
      expect(v.findings.filter((f) => f.rule === "quote-safety").map((f) => f.severity)).toEqual(["warning"]);
      const c = check("reference/orders.md");
      expect(c.code).toBe(EXIT_OK);
      expect(c.findings.filter((f) => f.rule === "quote-safety")).toEqual([]);
      expect(c.findings.filter((f) => f.severity === "error")).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    'control: a quoted value (`archived: "yes"`) is clean in both gates',
    () => {
      writeDoc("reference/orders.md", referenceWith('archived: "yes"'));
      const v = validate("docs/reference/orders.md");
      expect(v.code).toBe(EXIT_OK);
      expect(v.findings.filter((f) => f.rule === "quote-safety")).toEqual([]);
      const c = check("reference/orders.md");
      expect(c.code).toBe(EXIT_OK);
      // LCLI-691: check now also reports the fixture's unknown-`archived`-key warning, so the
      // control is "no quote-safety finding" (what this file tests), not an empty finding list.
      expect(c.findings.filter((f) => f.rule === "quote-safety")).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "control: frontmatter that is not valid YAML fails both gates, check with its YAML error in an incomplete report",
    () => {
      // `note: a: b` is an error-tier quote-safety value AND unparseable YAML. validate reports both;
      // check's scan throws on the parse before any per-file rule runs for that file, so the run
      // carries that error (`complete: false`, the stderr envelope) instead of findings — unchanged
      // by LCLI-612. Both still exit 6.
      writeDoc("reference/orders.md", referenceWith("note: a: b"));
      const v = validate("docs/reference/orders.md");
      expect(v.code).toBe(EXIT_CODES.validation);
      expect(v.findings.map((f) => `${f.severity}:${f.rule}`)).toEqual(["error:frontmatter", "error:quote-safety"]);
      const run = lore(["check", "--json"]);
      expect(run.code).toBe(EXIT_CODES.validation);
      const report = JSON.parse(run.stdout).data;
      expect(report.complete).toBe(false);
      expect(report.findings.filter((f: FindingJson) => f.file === "reference/orders.md")).toEqual([]);
      const envelope = JSON.parse(run.stderr.trim());
      expect(envelope.error_type).toBe("validation");
      expect(envelope.message).toContain("not valid YAML");
    },
    TIMEOUT_MS,
  );
});
